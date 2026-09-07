import { doc, getDoc, getDocs, collection, updateDoc, query, where } from "firebase/firestore";
import { Firestore } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface RegularizeControlSignal {
  isPaused: () => boolean;
  isCancelled: () => boolean;
  onProgress?: (current: number, total: number, message: string) => void;
}

export interface RegularizeResult {
  success: boolean;
  regularizedCount: number;
  details: any[];
  cancelled?: boolean;
  error?: string;
}

function normalizeDateToISO(dateStr: string): string {
  if (!dateStr) return "";
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [p1, p2, p3] = parts;
      if (p3.length === 4) {
        return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
      } else if (p1.length === 4) {
        return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
      }
    }
  }
  return dateStr.split('T')[0];
}

/**
 * Agente Autónomo de Regularización Bidireccional de Gastos Provisionales con Facturas SAT
 */
export async function runClientRegularizationAgent(
  db: Firestore,
  companyId: string,
  userEmail?: string,
  dateRange?: { startDate?: string; endDate?: string },
  control?: RegularizeControlSignal
): Promise<RegularizeResult> {
  try {
    control?.onProgress?.(0, 0, "Obteniendo configuración y credenciales de IA...");

    // 1. Obtener API Key de Gemini
    let apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "AIzaSyC1KUnaf7hCLDCRhUHJuTBW3SvKaLcU5cg";
    const companyDoc = await getDoc(doc(db, "companies", companyId));
    if (companyDoc.exists() && companyDoc.data()?.geminiApiKey) {
      apiKey = companyDoc.data().geminiApiKey;
    }

    if (!apiKey) {
      return { 
        success: false, 
        regularizedCount: 0, 
        details: [], 
        error: "No se encontró la API Key de Gemini. Configúrala en el perfil de la empresa o en variables de entorno." 
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    const generateWithFallback = async (promptText: string) => {
      const modelNames = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
      let lastError: any = null;

      for (const modelName of modelNames) {
        let retries = 3;
        let delayMs = 3000;

        while (retries > 0) {
          try {
            const model = genAI.getGenerativeModel({
              model: modelName,
              generationConfig: { responseMimeType: "application/json" }
            });
            const result = await model.generateContent(promptText);
            let rawText = result.response.text().trim();
            if (rawText.startsWith("```")) {
              rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
            }
            return rawText;
          } catch (err: any) {
            lastError = err;
            const msg = err.message || "";
            const isQuota = msg.includes("429") || msg.includes("Quota exceeded") || msg.includes("rate-limits");
            const isNotFound = msg.includes("404") || msg.includes("not found") || msg.includes("no longer available");

            if (isQuota) {
              if (retries > 1) {
                console.warn(`⏳ Límite de cuota (429) en ${modelName}. Esperando ${delayMs / 1000}s (reintento ${4 - retries}/3)...`);
                await sleep(delayMs);
                delayMs *= 1.5;
                retries--;
                continue;
              }
              throw new Error("Límite de cuota excedido en la API Key de Gemini (Error 429). Espera un momento o configura tu clave propia.");
            }

            if (isNotFound) {
              console.warn(`⚠️ Modelo ${modelName} no disponible (404). Probando siguiente modelo...`);
              break;
            }

            console.warn(`⚠️ Error con ${modelName}: ${msg}`);
            break;
          }
        }
      }

      throw new Error(`Error en Gemini API: ${lastError?.message || "No se pudo conectar con Gemini."}`);
    };

    // 2. Obtener Gastos Provisionales Pendientes de Comprobante Fiscal
    control?.onProgress?.(0, 0, "Cargando gastos provisionales pendientes...");
    let provList: any[] = [];
    try {
      const provSnap = await getDocs(query(collection(db, "companies", companyId, "expenses"), where("isPendingFiscalInvoice", "==", true)));
      provList = provSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    } catch (e) {
      const allExpSnap = await getDocs(collection(db, "companies", companyId, "expenses"));
      provList = allExpSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(d => d.isPendingFiscalInvoice === true || d.isProvisional === true);
    }

    if (provList.length === 0) {
      return {
        success: true,
        regularizedCount: 0,
        details: [],
        error: "No hay gastos provisionales pendientes de comprobante fiscal en el sistema."
      };
    }

    // 3. Obtener Facturas SAT del Inbox No Pagadas
    control?.onProgress?.(0, 0, "Cargando facturas recibidas del SAT...");
    let satList: any[] = [];
    try {
      const satSnap = await getDocs(query(collection(db, "companies", companyId, "expenses_inbox"), where("status", "!=", "paid")));
      satList = satSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    } catch (e) {
      const satSnapAll = await getDocs(collection(db, "companies", companyId, "expenses_inbox"));
      satList = satSnapAll.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(d => d.status !== "paid");
    }

    if (dateRange?.startDate) {
      satList = satList.filter(s => normalizeDateToISO(s.date || "") >= dateRange.startDate!);
    }
    if (dateRange?.endDate) {
      satList = satList.filter(s => normalizeDateToISO(s.date || "") <= dateRange.endDate!);
    }

    if (satList.length === 0) {
      return {
        success: true,
        regularizedCount: 0,
        details: [],
        error: "No se encontraron facturas SAT pendientes de procesar en el rango de fechas seleccionado."
      };
    }

    const details: any[] = [];
    let regularizedCount = 0;
    const totalSats = satList.length;

    for (let idx = 0; idx < totalSats; idx++) {
      if (control?.isCancelled()) {
        return { success: true, regularizedCount, details, cancelled: true };
      }

      while (control?.isPaused()) {
        if (control?.isCancelled()) {
          return { success: true, regularizedCount, details, cancelled: true };
        }
        await sleep(500);
      }

      const sat = satList[idx];
      const satTotal = sat.total || sat.amount || 0;
      const emitter = sat.emisorName || sat.vendorName || sat.issuerName || "Proveedor SAT";
      const satDate = sat.date || "";

      control?.onProgress?.(
        idx + 1,
        totalSats,
        `Analizando factura ${idx + 1} de ${totalSats}: ${emitter} ($${satTotal.toFixed(2)})`
      );

      // Si ya no quedan gastos provisionales pendientes en la lista activa, terminar
      const activeProvs = provList.filter(p => p.isPendingFiscalInvoice !== false);
      if (activeProvs.length === 0) {
        break;
      }

      let mergeData: any = null;

      // ─────────────────────────────────────────────────────────────
      // ETAPA 1: MATCH DETERMINISTA DIRECTO ($0.00 MXN IA)
      // ─────────────────────────────────────────────────────────────
      const exactProvMatches = activeProvs.filter(p => Math.abs((p.amount || 0) - satTotal) < 0.05);

      if (exactProvMatches.length === 1) {
        const exactProv = exactProvMatches[0];
        mergeData = {
          confidenceScore: 0.99,
          recommendedAction: "MERGE_PROVISIONAL_EXPENSE",
          matchedProvisionalExpenseId: exactProv.id,
          reasoning: `Regularización determinista directa ($0.00 IA): Monto exacto ($${satTotal.toFixed(2)}) con Gasto Provisional ${exactProv.documentNumber || exactProv.id}`
        };
      } else if (exactProvMatches.length > 1) {
        // Desambiguar por concepto / RFC
        const emRfcLower = (sat.emisorRfc || "").toLowerCase();
        const emNameLower = (emitter || "").toLowerCase();
        const byVendor = exactProvMatches.find(p => {
          const vName = (p.vendorName || p.concept || "").toLowerCase();
          const vRfc = (p.vendorRfc || "").toLowerCase();
          return (vRfc && emRfcLower && (vRfc.includes(emRfcLower) || emRfcLower.includes(vRfc))) ||
                 (vName && emNameLower && (vName.includes(emNameLower) || emNameLower.includes(vName)));
        });

        if (byVendor) {
          mergeData = {
            confidenceScore: 0.99,
            recommendedAction: "MERGE_PROVISIONAL_EXPENSE",
            matchedProvisionalExpenseId: byVendor.id,
            reasoning: `Regularización determinista ($0.00 IA): Coincidencia por Monto ($${satTotal.toFixed(2)}) y Proveedor (${byVendor.vendorName || emitter})`
          };
        }
      }

      // ─────────────────────────────────────────────────────────────
      // ETAPA 2: EVALUACIÓN CON INTELIGENCIA ARTIFICIAL SI NO HUBO MATCH EXACTO
      // ─────────────────────────────────────────────────────────────
      if (!mergeData) {
        const slicedProvs = activeProvs.filter(p => {
          const diff = Math.abs((p.amount || 0) - satTotal);
          const percentDiff = diff / Math.max(satTotal, 1);
          const vName = (p.vendorName || p.concept || "").toLowerCase();
          const emName = emitter.toLowerCase();
          return percentDiff <= 0.15 || diff <= 100 || (vName && emName && (vName.includes(emName) || emName.includes(vName)));
        }).slice(0, 6);

        if (slicedProvs.length > 0) {
          if (idx > 0) await sleep(500);

          const promptMerge = `
Eres un Agente Contable Experto en Regularización Fiscal de Gastos Provisionales.
Se recibió una factura fiscal SAT (XML) y se busca comprobar un Gasto Provisional previamente registrado por egreso bancario.

FACTURA SAT (XML):
- ID / UUID: ${sat.uuid || sat.id}
- Folio: ${sat.folio || sat.invoiceNumber || "S/F"}
- Emisor: "${emitter}" (RFC: ${sat.emisorRfc || "N/A"})
- Fecha: ${satDate}
- Monto Total: $${satTotal.toFixed(2)} MXN
- Conceptos: ${sat.concept || (sat.conceptos ? JSON.stringify(sat.conceptos) : "N/A")}

GASTOS PROVISIONALES CANDIDATOS CERCANOS:
${JSON.stringify(slicedProvs, null, 2)}

REGLAS:
1. Si un gasto provisional corresponde indudablemente a esta factura (mismo emisor/servicio, monto idéntico o muy cercano dentro de tolerancia razonable), asigna confidenceScore >= 0.90 y recommendedAction = "MERGE_PROVISIONAL_EXPENSE".
2. Si hay duda o montos discordantes que no correspondan, asigna confidenceScore < 0.90 y recommendedAction = "REVIEW_REQUIRED".

Formato JSON estricto:
{
  "confidenceScore": número entre 0.0 y 1.0,
  "recommendedAction": "MERGE_PROVISIONAL_EXPENSE" | "REVIEW_REQUIRED",
  "matchedProvisionalExpenseId": "ID_DEL_GASTO_PROVISIONAL" o null,
  "reasoning": "Explicación clara en español del motivo del cruce."
}
`;
          const textMerge = await generateWithFallback(promptMerge);
          mergeData = JSON.parse(textMerge);
        }
      }

      // ─────────────────────────────────────────────────────────────
      // ETAPA 3: APLICAR REGULARIZACIÓN EN BASE DE DATOS
      // ─────────────────────────────────────────────────────────────
      if (
        mergeData &&
        mergeData.confidenceScore >= 0.90 &&
        mergeData.recommendedAction === "MERGE_PROVISIONAL_EXPENSE" &&
        mergeData.matchedProvisionalExpenseId
      ) {
        const provExp = activeProvs.find(p => p.id === mergeData.matchedProvisionalExpenseId);
        if (provExp) {
          // 1. Actualizar Gasto Provisional a Regularizado
          await updateDoc(doc(db, "companies", companyId, "expenses", mergeData.matchedProvisionalExpenseId), {
            isProvisional: false,
            isPendingFiscalInvoice: false,
            status: "fiscal_regularizado",
            satInvoiceId: sat.id,
            vendorName: emitter || provExp.vendorName,
            vendorRfc: sat.emisorRfc || provExp.vendorRfc || "",
            uuid: sat.uuid || "",
            folio: sat.folio || sat.invoiceNumber || provExp.documentNumber,
            regularizedAt: new Date().toISOString(),
            regularizedBy: userEmail || "Agente IA (Regularización Bidireccional)",
            regularizationReason: mergeData.reasoning
          });

          // 2. Actualizar Factura en Expenses Inbox a Pagada/Vinculada
          await updateDoc(doc(db, "companies", companyId, "expenses_inbox", sat.id), {
            status: "paid",
            paidAmount: satTotal || provExp.amount,
            reconciled: true,
            reconciledAt: new Date().toISOString(),
            linkedExpenseId: mergeData.matchedProvisionalExpenseId
          });

          // 3. Marcar en la lista local para no volver a asociar el mismo gasto
          provExp.isPendingFiscalInvoice = false;
          provExp.isProvisional = false;

          regularizedCount++;
          details.push({
            satId: sat.id,
            uuid: sat.uuid,
            emitter,
            total: satTotal,
            matchedProvId: mergeData.matchedProvisionalExpenseId,
            provDocNumber: provExp.documentNumber,
            reasoning: mergeData.reasoning
          });
        }
      }
    }

    return {
      success: true,
      regularizedCount,
      details
    };
  } catch (err: any) {
    console.error("Error en runClientRegularizationAgent:", err);
    return {
      success: false,
      regularizedCount: 0,
      details: [],
      error: err.message || "Error al ejecutar el Agente Regularizador"
    };
  }
}
