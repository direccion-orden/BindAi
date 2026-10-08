import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { searchErpClients, getClientDocuments } from "@/app/actions/erp";
import { adminDb } from "@/lib/firebase/admin";
import { OrderDraft, OrderDraftItem } from "@/app/actions/order-agent";

export async function POST(req: NextRequest) {
  try {
    const { 
      message, 
      history, 
      companyId, 
      conversationId, 
      userId,
      currentDraftOrder 
    } = await req.json();

    let apiKey = process.env.GEMINI_API_KEY;

    if (companyId && adminDb) {
      try {
        const companyDoc = await adminDb.collection("companies").doc(companyId).get();
        if (companyDoc.exists) {
          const companyData = companyDoc.data();
          if (companyData?.geminiApiKey) {
            apiKey = companyData.geminiApiKey;
          }
        }
      } catch (e) {
        console.error("Error reading company geminiApiKey in Tracker API:", e);
      }
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Falta configurar la API KEY de Gemini." }, { status: 500 });
    }

    const systemPrompt = `
      Eres "Tracker", el Asistente Inteligente Ejecutivo, Coach Financiero (CFO) y Agente Operativo Transaccional del ERP Dirección Orden.
      
      Tus roles principales son:

      1. AGENTE OPERATIVO DE PEDIDOS Y VENTAS (ALTA VELOCIDAD Y COMANDOS DE VOZ):
         - REGLA DE ORO DE DESEMPEÑO: Para cualquier instrucción sobre pedidos (crear, agregar productos, cambiar cantidades, asignar cliente/sucursal o confirmar), DEBES llamar INMEDIATAMENTE a la herramienta unificada "process_order_request".
         - Esta herramienta busca automáticamente en paralelo el cliente, la sucursal y todos los productos requeridos, actualiza el borrador o confirma el pedido en UN SOLO PASO sin esperas innecesarias.
         - Parámetros de "process_order_request":
           * clientQuery: nombre del cliente (ej. 'Maria Perez').
           * locationQuery: nombre o palabra clave de la sucursal si el usuario la indicó (ej. 'San Pedro', 'Matriz', 'Arboleda').
           * addProducts: arreglo con [{ query: 'producto', quantity: número }].
           * setQuantities: arreglo con [{ itemQuery: 'producto', newQuantity: número }].
           * removeProducts: arreglo con nombres de productos a eliminar.
           * confirm: true ÚNICAMENTE cuando el usuario pida confirmar/guardar el pedido.
         - REGLA DE CONFIRMACIÓN ÚNICA: Cuando confirm=true y la orden se registre, ¡YA QUEDÓ GUARDADA EN EL ERP! No repitas confirmación.
         - RESPUESTAS DE VOZ CONCISAS: Sé directo y rápido (máximo 2 líneas de texto). Confirma productos/cambios, total acumulado y listo.

      2. ASESOR FINANCIERO CFO Y COACH DE NEGOCIOS:
         - Analizas la rentabilidad, contrataciones, P&L y punto de equilibrio ejecutando "get_financial_statement" o "simulate_cost_impact".
         - Basa tus análisis siempre en números reales calculados por las herramientas.

      3. ASISTENTE CONTABLE Y CONCILIACIÓN BANCARIA:
         - Concilias movimientos bancarios con gastos usando list_bank_accounts, get_bank_movements y get_pending_expenses.

      Reglas de respuesta:
      - Responde siempre en español.
      - Sé analítico, empático y estructurado.
      - Usa formato Markdown legible con negritas en cantidades y totales.
      
      Contexto de la empresa:
      - Empresa ID: ${companyId}
    `;

    const ai = new GoogleGenAI({ apiKey });

    const tools = [
      {
        functionDeclarations: [
          {
            name: "process_order_request",
            description: "HERRAMIENTA PRINCIPAL Y RÁPIDA (TODO EN UNO) para procesar cualquier solicitud de pedidos: buscar y asignar cliente, sucursal, productos por cantidad, cambiar cantidades existentes, o confirmar el pedido en el ERP en un solo paso ultrarrápido.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                clientQuery: { 
                  type: Type.STRING, 
                  description: "Nombre o término del cliente si el usuario lo menciona o quiere cambiarlo (ej. 'Maria Perez', 'Humberto Vargas')." 
                },
                locationQuery: { 
                  type: Type.STRING, 
                  description: "Nombre o término de la sucursal si el usuario la menciona (ej. 'Matriz', 'San Pedro', 'Arboleda')." 
                },
                addProducts: {
                  type: Type.ARRAY,
                  description: "Lista de productos a buscar y agregar al borrador con su cantidad.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING, description: "Término o nombre del producto (ej. 'organizador de zapatos', 'crema facial')." },
                      quantity: { type: Type.NUMBER, description: "Cantidad solicitada (ej. 5, 2)." }
                    },
                    required: ["query", "quantity"]
                  }
                },
                setQuantities: {
                  type: Type.ARRAY,
                  description: "Lista de productos existentes cuya cantidad se desea cambiar directamente.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      itemQuery: { type: Type.STRING, description: "Nombre o término del producto existente en el pedido a cambiar (ej. 'zapatos')." },
                      newQuantity: { type: Type.NUMBER, description: "Nueva cantidad exacta (ej. 10)." }
                    },
                    required: ["itemQuery", "newQuantity"]
                  }
                },
                removeProducts: {
                  type: Type.ARRAY,
                  description: "Nombres o términos de productos a eliminar del borrador.",
                  items: { type: Type.STRING }
                },
                confirm: {
                  type: Type.BOOLEAN,
                  description: "Poner en true si el usuario pide confirmar, guardar o finalizar formalmente el pedido en el ERP."
                },
                notes: {
                  type: Type.STRING,
                  description: "Notas adicionales del pedido si fueron mencionadas."
                }
              }
            }
          },
          {
            name: "search_clients",
            description: "Busca clientes en el ERP por nombre, razón social, RFC o correo.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                query: { type: Type.STRING, description: "Nombre o término de búsqueda del cliente (ej. 'Maria Perez')." }
              },
              required: ["query"]
            }
          },
          {
            name: "search_locations",
            description: "Busca sucursales de la empresa por nombre o lista las sucursales disponibles.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                query: { type: Type.STRING, description: "Nombre o palabra clave de la sucursal (ej. 'Matriz', 'San Pedro'). Opcional para ver todas." }
              }
            }
          },
          {
            name: "search_products",
            description: "Busca productos y variantes en el catálogo del ERP por título, modelo, SKU o palabras clave.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                query: { type: Type.STRING, description: "Palabra o frase de búsqueda del producto (ej. 'organizador de zapatos')." }
              },
              required: ["query"]
            }
          },
          {
            name: "manage_order_draft",
            description: "Gestiona el borrador de pedido en tiempo real: asigna cliente, sucursal, añade productos, cambia cantidades de ítems existentes, o elimina partidas.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                action: { 
                  type: Type.STRING, 
                  description: "Acción a realizar: 'set_client', 'set_location', 'add_or_update_items', 'set_item_quantity', 'remove_item' o 'clear'." 
                },
                clientId: { type: Type.STRING, description: "ID del cliente (usado con set_client)." },
                clientName: { type: Type.STRING, description: "Nombre del cliente." },
                locationId: { type: Type.STRING, description: "ID de la sucursal (usado con set_location)." },
                locationName: { type: Type.STRING, description: "Nombre de la sucursal (ej. 'Matriz', 'San Pedro')." },
                items: {
                  type: Type.ARRAY,
                  description: "Lista de productos a agregar o actualizar.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      productId: { type: Type.STRING },
                      variantId: { type: Type.STRING },
                      productName: { type: Type.STRING },
                      variantTitle: { type: Type.STRING },
                      quantity: { type: Type.NUMBER },
                      unitPrice: { type: Type.NUMBER },
                      sku: { type: Type.STRING },
                      imageUrl: { type: Type.STRING }
                    },
                    required: ["productId", "productName", "quantity", "unitPrice"]
                  }
                },
                itemIdentifier: { 
                  type: Type.STRING, 
                  description: "Nombre parcial, título o ID del producto cuya cantidad se desea cambiar o eliminar." 
                },
                newQuantity: { 
                  type: Type.NUMBER, 
                  description: "Nueva cantidad exacta para el producto (usado con set_item_quantity)." 
                }
              },
              required: ["action"]
            }
          },
          {
            name: "confirm_order",
            description: "Confirma y registra formalmente el pedido en el ERP asignándole su número secuencial oficial (PED-XXXXX) y guardándolo en la base de datos. Llamar UNA SOLA VEZ por pedido.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                notes: { type: Type.STRING, description: "Notas o comentarios adicionales del pedido." }
              }
            }
          },
          {
            name: "get_financial_statement",
            description: "Obtiene el Estado de Resultados consolidado (P&L) de la empresa para un periodo determinado.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                monthsBack: {
                  type: Type.INTEGER,
                  description: "Número de meses hacia atrás a analizar (por defecto 3)."
                }
              }
            }
          },
          {
            name: "simulate_cost_impact",
            description: "Calcula y simula el impacto financiero de una nueva contratación o nuevo gasto fijo recurrente.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                monthlySalary: { type: Type.NUMBER, description: "Monto mensual en MXN del sueldo o gasto." },
                employerBurdenPct: { type: Type.NUMBER, description: "Porcentaje de cargas patronales (default 25%)." },
                isSalesRole: { type: Type.BOOLEAN, description: "Indica si el puesto generará ventas directas." },
                expectedNewMonthlySales: { type: Type.NUMBER, description: "Ventas mensuales estimadas que generará." }
              },
              required: ["monthlySalary"]
            }
          },
          {
            name: "get_client_documents",
            description: "Obtiene los documentos pendientes de un cliente específico.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                clientId: { type: Type.STRING, description: "El ID único del cliente." }
              },
              required: ["clientId"]
            }
          },
          {
            name: "list_bank_accounts",
            description: "Obtiene la lista de todas las cuentas bancarias de la empresa.",
            parameters: { type: Type.OBJECT, properties: {} }
          },
          {
            name: "get_bank_movements",
            description: "Obtiene los movimientos bancarios NO conciliados de una cuenta específica.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                accountId: { type: Type.STRING, description: "El ID de la cuenta bancaria." }
              },
              required: ["accountId"]
            }
          },
          {
            name: "get_pending_expenses",
            description: "Obtiene la lista de facturas de gastos pendientes de pago.",
            parameters: { type: Type.OBJECT, properties: {} }
          }
        ]
      }
    ];

    const formattedHistory = (history || []).map((h: any) => ({
      role: h.role,
      parts: h.parts
    }));

    const chat = ai.chats.create({
      model: "gemini-3.8-flash",
      history: formattedHistory,
      config: {
        systemInstruction: systemPrompt,
        tools: tools as any
      }
    });

    // Estado del borrador activo mantenido en la petición
    let activeDraftOrder: OrderDraft | null = currentDraftOrder
      ? {
          clientId: currentDraftOrder.clientId || "",
          clientName: currentDraftOrder.clientName || "",
          locationId: currentDraftOrder.locationId || "",
          locationName: currentDraftOrder.locationName || "",
          warehouseId: currentDraftOrder.warehouseId || "",
          warehouseName: currentDraftOrder.warehouseName || "",
          items: Array.isArray(currentDraftOrder.items) ? [...currentDraftOrder.items] : [],
          subtotal: Number(currentDraftOrder.subtotal) || 0,
          tax: Number(currentDraftOrder.tax) || 0,
          total: Number(currentDraftOrder.total) || 0,
          notes: currentDraftOrder.notes || ""
        }
      : null;

    let createdOrderResult: any = null;

    let currentResponse = await chat.sendMessage({ message });

    // Bucle de resolución de Function Calls
    let loops = 0;
    while (loops < 5) {
      const calls = currentResponse.functionCalls;
      if (!calls || calls.length === 0) break;

      const toolResponses = [];
      for (const call of calls) {
        let toolData: any;
        try {
          if (call.name === "process_order_request") {
            const { processOrderAction } = await import("@/app/actions/order-agent");
            const res = await processOrderAction(
              companyId,
              activeDraftOrder,
              call.args as any,
              userId || "agente-tracker@bindai.com"
            );

            if (res.status === "confirmed") {
              createdOrderResult = res.createdOrder;
              activeDraftOrder = null;
            } else if (res.draft) {
              activeDraftOrder = res.draft;
            }

            toolData = {
              status: res.status,
              summary: res.summaryText,
              currentDraft: activeDraftOrder,
              createdOrder: createdOrderResult,
              error: res.error
            };
          } else if (call.name === "search_clients") {
            const { searchClientsAction } = await import("@/app/actions/order-agent");
            const q = (call.args as any).query as string;
            const matches = await searchClientsAction(companyId, q);
            if (matches.length > 0) {
              toolData = { clientsFound: matches };
            } else {
              try {
                const fallback = await searchErpClients(q);
                toolData = { clientsFound: fallback };
              } catch {
                toolData = { clientsFound: [] };
              }
            }
          } else if (call.name === "search_locations") {
            const { searchLocationsAction } = await import("@/app/actions/order-agent");
            const q = (call.args as any)?.query as string;
            const locs = await searchLocationsAction(companyId, q);
            toolData = { locationsFound: locs };
          } else if (call.name === "search_products") {
            const { searchProductsAction } = await import("@/app/actions/order-agent");
            const q = (call.args as any).query as string;
            const prods = await searchProductsAction(companyId, q);
            toolData = { productsFound: prods };
          } else if (call.name === "manage_order_draft") {
            const args = call.args as any;
            const action = args.action;

            if (!activeDraftOrder) {
              activeDraftOrder = {
                clientId: "",
                clientName: "",
                locationId: "",
                locationName: "",
                warehouseId: "",
                warehouseName: "",
                items: [],
                subtotal: 0,
                tax: 0,
                total: 0
              };
            }

            // Actualizar sucursal si viene informada
            if (args.locationId) activeDraftOrder.locationId = args.locationId;
            if (args.locationName) activeDraftOrder.locationName = args.locationName;

            // Actualizar cliente si viene informado
            if (args.clientName) {
              activeDraftOrder.clientName = args.clientName;
              if (!activeDraftOrder.clientId) {
                activeDraftOrder.clientId = args.clientId || "cli-" + args.clientName.toLowerCase().replace(/[^a-z0-9]/g, "-");
              }
            }
            if (args.clientId) {
              activeDraftOrder.clientId = args.clientId;
            }

            if (action === "set_client") {
              if (args.clientId) activeDraftOrder.clientId = args.clientId;
              if (args.clientName) activeDraftOrder.clientName = args.clientName;
            } else if (action === "set_location") {
              if (args.locationId) activeDraftOrder.locationId = args.locationId;
              if (args.locationName) activeDraftOrder.locationName = args.locationName;
            } else if (action === "add_or_update_items" && Array.isArray(args.items)) {
              for (const it of args.items) {
                const qty = Number(it.quantity) || 1;
                const price = Number(it.unitPrice) || 0;
                const existingIdx = activeDraftOrder.items.findIndex(
                  existing =>
                    (it.variantId && existing.variantId === it.variantId) ||
                    (it.productId && existing.productId === it.productId && (!it.variantId || existing.variantId === it.variantId))
                );

                if (existingIdx >= 0) {
                  activeDraftOrder.items[existingIdx].quantity += qty;
                  activeDraftOrder.items[existingIdx].total =
                    activeDraftOrder.items[existingIdx].quantity * activeDraftOrder.items[existingIdx].unitPrice;
                } else {
                  activeDraftOrder.items.push({
                    productId: it.productId,
                    variantId: it.variantId || it.productId,
                    productName: it.productName,
                    variantTitle: it.variantTitle || "",
                    quantity: qty,
                    unitPrice: price,
                    total: qty * price,
                    sku: it.sku || "",
                    imageUrl: it.imageUrl || ""
                  });
                }
              }
            } else if (action === "set_item_quantity") {
              const ident = (args.itemIdentifier || "").toLowerCase();
              const newQty = Number(args.newQuantity) || 0;
              const foundIdx = activeDraftOrder.items.findIndex(
                it =>
                  it.productName.toLowerCase().includes(ident) ||
                  (it.variantTitle && it.variantTitle.toLowerCase().includes(ident)) ||
                  it.productId === ident ||
                  it.variantId === ident
              );

              if (foundIdx >= 0) {
                if (newQty <= 0) {
                  activeDraftOrder.items.splice(foundIdx, 1);
                } else {
                  activeDraftOrder.items[foundIdx].quantity = newQty;
                  activeDraftOrder.items[foundIdx].total = newQty * activeDraftOrder.items[foundIdx].unitPrice;
                }
              }
            } else if (action === "remove_item") {
              const ident = (args.itemIdentifier || "").toLowerCase();
              activeDraftOrder.items = activeDraftOrder.items.filter(
                it =>
                  !it.productName.toLowerCase().includes(ident) &&
                  it.productId !== ident &&
                  it.variantId !== ident
              );
            } else if (action === "clear") {
              activeDraftOrder = null;
            }

            if (activeDraftOrder) {
              activeDraftOrder.subtotal = activeDraftOrder.items.reduce((s, it) => s + (it.quantity * it.unitPrice), 0);
              activeDraftOrder.tax = Math.round(activeDraftOrder.subtotal * 0.16 * 100) / 100;
              activeDraftOrder.total = Math.round((activeDraftOrder.subtotal + activeDraftOrder.tax) * 100) / 100;
            }

            toolData = {
              status: "success",
              currentDraft: activeDraftOrder
            };
          } else if (call.name === "confirm_order") {
            if (createdOrderResult) {
              // Ya fue creado en este ciclo, retornar idempotencia
              toolData = {
                status: "already_created",
                orderNumber: createdOrderResult.orderNumber,
                clientName: createdOrderResult.clientName,
                totalAmount: createdOrderResult.totalAmount
              };
            } else if (!activeDraftOrder || (!activeDraftOrder.clientId && !activeDraftOrder.clientName) || activeDraftOrder.items.length === 0) {
              toolData = {
                success: false,
                error: "El borrador no tiene cliente asignado o productos suficientes para crear el pedido."
              };
            } else {
              if (!activeDraftOrder.clientId && activeDraftOrder.clientName) {
                activeDraftOrder.clientId = "cli-" + activeDraftOrder.clientName.toLowerCase().replace(/[^a-z0-9]/g, "-");
              }
              const { createOrderAction } = await import("@/app/actions/order-agent");
              const res = await createOrderAction(companyId, activeDraftOrder, userId || "agente-tracker@bindai.com");
              if (res.success) {
                createdOrderResult = res;
                activeDraftOrder = null; // Borrador completado
              }
              toolData = res;
            }
          } else if (call.name === "get_financial_statement") {
            const { getCompanyFinancialSummary } = await import("@/lib/financial/financialEngine");
            const monthsBack = (call.args as any)?.monthsBack || 3;
            toolData = await getCompanyFinancialSummary(companyId, { monthsBack });
          } else if (call.name === "simulate_cost_impact") {
            const { getCompanyFinancialSummary, simulateHiringImpact } = await import("@/lib/financial/financialEngine");
            const summary = await getCompanyFinancialSummary(companyId, { monthsBack: 3 });
            const args = call.args as any;
            toolData = simulateHiringImpact(summary, {
              monthlySalary: Number(args.monthlySalary) || 0,
              employerBurdenPct: args.employerBurdenPct !== undefined ? Number(args.employerBurdenPct) : 25,
              isSalesRole: Boolean(args.isSalesRole),
              expectedNewMonthlySales: Number(args.expectedNewMonthlySales) || 0
            });
          } else if (call.name === "get_client_documents") {
            toolData = await getClientDocuments((call.args as any).clientId as string);
          } else if (call.name === "list_bank_accounts") {
            const { listBankAccounts } = await import("@/app/actions/accounting");
            toolData = await listBankAccounts(companyId);
          } else if (call.name === "get_bank_movements") {
            const { getUnreconciledTransactions } = await import("@/app/actions/accounting");
            toolData = await getUnreconciledTransactions(companyId, (call.args as any).accountId as string);
          } else if (call.name === "get_pending_expenses") {
            const { getPendingExpenses } = await import("@/app/actions/accounting");
            toolData = await getPendingExpenses(companyId);
          } else {
            toolData = { error: `Herramienta desconocida: ${call.name}` };
          }
        } catch (toolErr: any) {
          console.error(`Error ejecutando tool ${call.name}:`, toolErr);
          toolData = { error: toolErr.message || "Error al procesar la operación" };
        }

        toolResponses.push({
          functionResponse: {
            name: call.name,
            response: { result: toolData }
          }
        });
      }

      currentResponse = await chat.sendMessage({ message: toolResponses as any });
      loops++;
    }

    const updatedHistory = await chat.getHistory();

    const userMessageObj = {
      id: crypto.randomUUID(),
      role: "user" as const,
      text: message,
      createdAt: new Date().toISOString()
    };

    let finalText = currentResponse.text?.trim() || "";
    if (!finalText) {
      if (createdOrderResult && createdOrderResult.success) {
        finalText = `¡Pedido **${createdOrderResult.orderNumber}** creado exitosamente para **${createdOrderResult.clientName || "el cliente"}** por un total de **$${(createdOrderResult.totalAmount || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN**!`;
      } else if (activeDraftOrder && activeDraftOrder.items.length > 0) {
        const branchMsg = activeDraftOrder.locationName ? ` en sucursal **${activeDraftOrder.locationName}**` : "";
        finalText = `He actualizado el borrador del pedido${branchMsg}. Total acumulado (+IVA): **$${(activeDraftOrder.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN**. ¿Deseas agregar algo más o confirmar el pedido?`;
      } else if (activeDraftOrder?.clientName) {
        finalText = `Asigné el cliente **${activeDraftOrder.clientName}** al borrador del pedido. ¿Qué productos deseas agregar?`;
      } else {
        finalText = "Operación procesada correctamente.";
      }
    }

    const modelMessageObj = {
      id: crypto.randomUUID(),
      role: "model" as const,
      text: finalText,
      createdAt: new Date().toISOString()
    };

    let activeConversationId = conversationId;
    let activeTitle = "";

    if (companyId && adminDb) {
      try {
        const convsRef = adminDb.collection("companies").doc(companyId).collection("tracker_conversations");

        if (activeConversationId) {
          const docRef = convsRef.doc(activeConversationId);
          const docSnap = await docRef.get();
          if (docSnap.exists) {
            const existing = docSnap.data()!;
            activeTitle = existing.title || "Conversación";
            const updatedMessages = [...(existing.messages || []), userMessageObj, modelMessageObj];
            await docRef.update({
              messages: updatedMessages,
              updatedAt: new Date().toISOString()
            });
          } else {
            activeTitle = message.slice(0, 50).trim();
            await docRef.set({
              id: activeConversationId,
              title: activeTitle,
              companyId,
              userId: userId || "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messages: [userMessageObj, modelMessageObj]
            });
          }
        } else {
          activeConversationId = crypto.randomUUID();
          activeTitle = message.slice(0, 50).trim();
          await convsRef.doc(activeConversationId).set({
            id: activeConversationId,
            title: activeTitle,
            companyId,
            userId: userId || "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [userMessageObj, modelMessageObj]
          });
        }
      } catch (saveErr) {
        console.error("Error saving conversation to Firestore:", saveErr);
      }
    }

    return NextResponse.json({
      text: finalText,
      history: updatedHistory,
      conversationId: activeConversationId,
      title: activeTitle,
      draftOrder: activeDraftOrder,
      createdOrder: createdOrderResult
    });

  } catch (error: any) {
    console.error("Tracker API error:", error);
    return NextResponse.json({ error: error.message || "Error en el agente Tracker" }, { status: 500 });
  }
}
