import { GoogleGenerativeAI } from "@google/generative-ai";

export interface CandidateInvoice {
  id: string;
  uuid?: string;
  invoiceNumber?: string;
  date?: string;
  total: number;
  emitterName?: string;
  emitterRfc?: string;
  vendorName?: string;
  concept?: string;
  _type: "gasto" | "gasto_manual";
}

export interface CandidateProvisionalExpense {
  id: string;
  documentNumber?: string;
  date?: string;
  amount: number;
  vendorName?: string;
  concept?: string;
  linkedBankTransactionId?: string;
}

export interface BankTransactionInput {
  id: string;
  date: string;
  amount: number;
  concept: string;
  reference?: string;
}

export interface ReconcileAgentEvaluation {
  confidenceScore: number; // 0.0 a 1.0
  recommendedAction: "MATCH_INVOICE" | "CREATE_PROVISIONAL_EXPENSE" | "REVIEW_REQUIRED";
  matchedDocId?: string;
  suggestedAccountCode?: string;
  suggestedAccountName?: string;
  reasoning: string;
}

export interface InvoiceMergeEvaluation {
  confidenceScore: number;
  recommendedAction: "MERGE_PROVISIONAL_EXPENSE" | "CREATE_FISCAL_EXPENSE" | "REVIEW_REQUIRED";
  matchedProvisionalExpenseId?: string;
  reasoning: string;
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function generateWithFallback(apiKey: string, promptText: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
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
          throw new Error("Límite de cuota excedido en la API Key de Gemini (Error 429). Por favor espera un minuto o configura tu clave API propia en Configuración > Empresa.");
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
}

/**
 * Agente de IA para evaluar coincidencias entre un movimiento bancario y facturas candidatas
 */
export async function evaluateBankTransactionMatch(
  apiKey: string,
  transaction: BankTransactionInput,
  candidates: CandidateInvoice[]
): Promise<ReconcileAgentEvaluation> {
  try {
    const prompt = `
Eres un Agente Contable Experto y Conciliador de Inteligencia Artificial para un sistema ERP.
Tu tarea es analizar un movimiento bancario de egreso y compararlo contra una lista de Facturas Fiscales/Gastos Candidatos.

DATOS DEL MOVIMIENTO BANCARIO:
- ID: ${transaction.id}
- Fecha: ${transaction.date}
- Monto Total: $${Math.abs(transaction.amount).toFixed(2)} MXN
- Concepto/Referencia Bancaria: "${transaction.concept}" (Ref: ${transaction.reference || "N/A"})

FACTURAS / GASTOS CANDIDATOS DISPONIBLES EN EL INBOX:
${JSON.stringify(candidates, null, 2)}

INSTRUCCIONES DE EVALUACIÓN:
1. Compara el monto ($${Math.abs(transaction.amount).toFixed(2)}), la razón social/RFC del proveedor y la cercanía de la fecha (margen típico de 15 días).
2. Si el monto coincide exactamente (o con una diferencia menor a $0.05) y existe coincidencia clara en el proveedor o concepto, asigna un confidenceScore >= 0.90 y recommendedAction = "MATCH_INVOICE".
3. Si NO hay ninguna factura candidata que concuerde pero el movimiento es un gasto operativo claro (ejemplo: Uber, Oxxo, CFE, Gasolina, Renta), asigna confidenceScore >= 0.90 y recommendedAction = "CREATE_PROVISIONAL_EXPENSE". Determina la cuenta contable de gasto adecuada (ejemplo: "601.01" Gastos Generales, "602.01" Pasajes y Viáticos, "601.05" Papelería).
4. Si hay ambigüedad entre múltiples facturas candidatas o montos disímiles, asigna confidenceScore < 0.90 y recommendedAction = "REVIEW_REQUIRED".

Devuelve estrictamente un objeto JSON válido con este formato:
{
  "confidenceScore": número entre 0.0 y 1.0,
  "recommendedAction": "MATCH_INVOICE" | "CREATE_PROVISIONAL_EXPENSE" | "REVIEW_REQUIRED",
  "matchedDocId": ID de la factura elegida (o null si no aplica),
  "suggestedAccountCode": "601.01",
  "suggestedAccountName": "Gastos Generales",
  "reasoning": "Explicación detallada y clara en español de por qué se tomó esta decisión."
}
`;

    const text = await generateWithFallback(apiKey, prompt);
    const evaluation: ReconcileAgentEvaluation = JSON.parse(text);
    return evaluation;
  } catch (error: any) {
    console.error("Error en evaluateBankTransactionMatch AI Agent:", error);
    return {
      confidenceScore: 0,
      recommendedAction: "REVIEW_REQUIRED",
      reasoning: `Error al evaluar con IA: ${error.message || "Fallo en Gemini"}`
    };
  }
}

/**
 * Agente de IA para evaluar regularización de Factura SAT entrante contra Gastos Provisionales existentes
 */
export async function evaluateSatInvoiceMatch(
  apiKey: string,
  invoice: CandidateInvoice,
  provisionalExpenses: CandidateProvisionalExpense[]
): Promise<InvoiceMergeEvaluation> {
  try {
    const prompt = `
Eres un Agente Contable Experto para un sistema ERP.
Se acaba de recibir una nueva Factura Fiscal (CFDI XML) en el sistema.
Tu objetivo es determinar si esta factura corresponde a un Gasto Provisional previamente creado cuando se realizó el pago bancario sin factura.

FACTURA FISCAL RECIBIDA:
- ID: ${invoice.id}
- UUID: ${invoice.uuid || "N/A"}
- Fecha: ${invoice.date || "N/A"}
- Monto Total: $${invoice.total.toFixed(2)} MXN
- Emisor/Proveedor: "${invoice.emitterName || invoice.vendorName || "N/A"}" (RFC: ${invoice.emitterRfc || "N/A"})

GASTOS PROVISIONALES REGISTRADOS PENDIENTES DE FACTURA FISCAL:
${JSON.stringify(provisionalExpenses, null, 2)}

INSTRUCCIONES DE EVALUACIÓN:
1. Compara el monto ($${invoice.total.toFixed(2)}), el nombre/RFC del proveedor y la cercanía de la fecha (margen típico de 15 días).
2. Si un Gasto Provisional coincide claramente en monto y proveedor/concepto, asigna confidenceScore >= 0.90 y recommendedAction = "MERGE_PROVISIONAL_EXPENSE".
3. Si NO coincide con ningún gasto provisional, asigna recommendedAction = "CREATE_FISCAL_EXPENSE" si la factura está pendiente de conciliación bancaria.
4. Si hay dudas o montos discordantes, asigna recommendedAction = "REVIEW_REQUIRED".

Devuelve estrictamente un objeto JSON válido con este formato:
{
  "confidenceScore": número entre 0.0 y 1.0,
  "recommendedAction": "MERGE_PROVISIONAL_EXPENSE" | "CREATE_FISCAL_EXPENSE" | "REVIEW_REQUIRED",
  "matchedProvisionalExpenseId": ID del gasto provisional a fusionar (o null si no aplica),
  "reasoning": "Explicación clara en español de la resolución."
}
`;

    const text = await generateWithFallback(apiKey, prompt);
    const evaluation: InvoiceMergeEvaluation = JSON.parse(text);
    return evaluation;
  } catch (error: any) {
    console.error("Error en evaluateSatInvoiceMatch AI Agent:", error);
    return {
      confidenceScore: 0,
      recommendedAction: "REVIEW_REQUIRED",
      reasoning: `Error al evaluar regularización con IA: ${error.message || "Fallo en Gemini"}`
    };
  }
}
