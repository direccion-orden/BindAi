import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { searchErpClients, getClientDocuments } from "@/app/actions/erp";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: NextRequest) {
  try {
    const { message, history, companyId } = await req.json();

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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.5-flash",
      tools: [
        {
          functionDeclarations: [
            {
              name: "search_clients",
              description: "Busca clientes en el ERP por nombre o razón social.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  query: { type: SchemaType.STRING, description: "El nombre o término de búsqueda del cliente." }
                },
                required: ["query"]
              }
            },
            {
              name: "get_client_documents",
              description: "Obtiene los documentos pendientes (facturas, remisiones, pedidos) de un cliente específico.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  clientId: { type: SchemaType.STRING, description: "El ID único del cliente en el ERP." }
                },
                required: ["clientId"]
              }
            },
            {
              name: "list_bank_accounts",
              description: "Obtiene la lista de todas las cuentas bancarias de la empresa (BBVA, Banorte, Caja, etc.) con sus IDs.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {}
              }
            },
            {
              name: "get_bank_movements",
              description: "Obtiene los movimientos bancarios NO conciliados de una cuenta específica.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  accountId: { type: SchemaType.STRING, description: "El ID de la cuenta bancaria (obtener primero con list_bank_accounts)." }
                },
                required: ["accountId"]
              }
            },
            {
              name: "get_pending_expenses",
              description: "Obtiene la lista de facturas de gastos (egresos) pendientes de pago y conciliación.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {}
              }
            }
          ]
        }
      ]
    });

    const chat = model.startChat({
      history: history || [],
      generationConfig: {
        maxOutputTokens: 1500,
      },
    });

    const systemPrompt = `
      Eres "Tracker", el experto contable y asistente inteligente del ERP de Dirección Orden.
      
      Especialidad: Conciliación Bancaria y Análisis de Gastos.
      
      Tus objetivos:
      1. Ayudar a los usuarios a encontrar qué movimientos bancarios coinciden con sus facturas de gastos.
      2. Protocolo de Conciliación:
         a) Si el usuario menciona una cuenta (ej: "BBVA"), SIEMPRE usa primero list_bank_accounts para encontrar el ID correcto de esa cuenta.
         b) Con el ID, usa get_bank_movements para ver los movimientos pendientes.
         c) Usa get_pending_expenses para ver los gastos por pagar.
         d) Analiza coincidencias por monto, RFC o concepto y propón la conciliación.
      
      3. Criterios de conciliación:
         - Coincidencia de monto exacto (prioridad alta).
         - Coincidencia de RFC o nombre de proveedor en el concepto del banco.
         - Proximidad de fechas (máximo +/- 10 días).
      
      Si encuentras coincidencias potenciales, preséntalas claramente:
      "He encontrado 3 posibles coincidencias para el retiro de $1,200 del 05/JUL:
      1. Factura de GASTOS ABC por $1,200 (RFC: ABC123456)
      2. ..."
      
      Otras funciones:
      - Búsqueda de clientes (search_clients).
      - Documentos pendientes de clientes (get_client_documents).
      
      Contexto actual:
      - Empresa ID: ${companyId}
      
      Responde siempre en español. Sé profesional y preciso con las cifras. NUNCA inventes IDs, usa siempre las herramientas para obtenerlos.
    `;

    // En Gemini 1.5+ (y 2.0), el system instruction se puede pasar al modelo al inicio, 
    // pero para este MVP lo incluiremos en el primer mensaje si la historia está vacía.
    const fullMessage = history && history.length > 0 ? message : `${systemPrompt}\n\nUsuario: ${message}`;

    const result = await chat.sendMessage(fullMessage);
    const response = result.response;
    
    // Manejo de Function Calls
    const calls = response.functionCalls();
    if (calls && calls.length > 0) {
      const toolResponses = [];
      for (const call of calls) {
        let toolData;
        if (call.name === "search_clients") {
          toolData = await searchErpClients((call.args as any).query as string);
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
        }
        
        toolResponses.push({
          functionResponse: {
            name: call.name,
            response: { result: toolData }
          }
        });
      }

      // Enviar las respuestas de las herramientas de vuelta al modelo para la respuesta final
      const finalResult = await chat.sendMessage(toolResponses);
      return NextResponse.json({ 
        text: finalResult.response.text(),
        history: await chat.getHistory()
      });
    }

    return NextResponse.json({ 
      text: response.text(),
      history: await chat.getHistory()
    });

  } catch (error: any) {
    console.error("Tracker API error:", error);
    return NextResponse.json({ error: error.message || "Error en el agente Tracker" }, { status: 500 });
  }
}
