import { doc, getDoc, getDocs, collection, setDoc, updateDoc, query, where } from "firebase/firestore";
import { Firestore } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ReconcileResult {
  success: boolean;
  message: string;
  expenseId?: string;
  outflowId?: string;
  journalEntryId?: string;
}

export interface ReconcileControlSignal {
  isPaused: () => boolean;
  isCancelled: () => boolean;
  onProgress?: (current: number, total: number, message: string) => void;
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
 * Agente Híbrido Determinista + IA para Conciliación Autónoma de Ultra Alto Rendimiento y Bajo Costo
 */
export async function runClientAiReconciliation(
  db: Firestore,
  companyId: string,
  bankAccountId: string,
  userEmail?: string,
  dateRange?: { startDate?: string; endDate?: string },
  control?: ReconcileControlSignal
): Promise<{ success: boolean; processedCount: number; details: any[]; cancelled?: boolean; error?: string }> {
  try {
    control?.onProgress?.(0, 0, "Obteniendo configuración y facturas candidatas...");

    // 1. Obtener API Key de Gemini
    let apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "AIzaSyC1KUnaf7hCLDCRhUHJuTBW3SvKaLcU5cg";
    const companyDoc = await getDoc(doc(db, "companies", companyId));
    if (companyDoc.exists() && companyDoc.data()?.geminiApiKey) {
      apiKey = companyDoc.data().geminiApiKey;
    }

    if (!apiKey) {
      return { success: false, processedCount: 0, details: [], error: "No se encontró la API Key de Gemini. Configúrala en el perfil de la empresa o en variables de entorno." };
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
    };

    // 2. Obtener Facturas Candidatas del Inbox y Gastos Manuales Pendientes
    const candidates: any[] = [];
    
    try {
      const inboxSnap = await getDocs(query(collection(db, "companies", companyId, "expenses_inbox"), where("status", "!=", "paid")));
      inboxSnap.forEach(d => {
        const data = d.data();
        candidates.push({
          id: d.id,
          uuid: data.uuid,
          invoiceNumber: data.invoiceNumber || data.folio,
          date: data.date,
          total: data.total || data.amount || 0,
          emitterName: data.emisorName || data.vendorName || data.issuerName,
          emitterRfc: data.emisorRfc || data.vendorRfc || data.issuerRfc,
          concept: data.concept || (data.conceptos ? JSON.stringify(data.conceptos) : ""),
          _type: "gasto"
        });
      });
    } catch (e) {
      const inboxSnapAll = await getDocs(collection(db, "companies", companyId, "expenses_inbox"));
      inboxSnapAll.forEach(d => {
        const data = d.data();
        if (data.status !== "paid") {
          candidates.push({
            id: d.id,
            uuid: data.uuid,
            invoiceNumber: data.invoiceNumber || data.folio,
            date: data.date,
            total: data.total || data.amount || 0,
            emitterName: data.emisorName || data.vendorName || data.issuerName,
            emitterRfc: data.emisorRfc || data.vendorRfc || data.issuerRfc,
            concept: data.concept || (data.conceptos ? JSON.stringify(data.conceptos) : ""),
            _type: "gasto"
          });
        }
      });
    }

    try {
      const manualSnap = await getDocs(query(collection(db, "companies", companyId, "expenses"), where("status", "!=", "paid")));
      manualSnap.forEach(d => {
        const data = d.data();
        if (!data.isProvisional) {
          candidates.push({
            id: d.id,
            documentNumber: data.documentNumber,
            date: data.date,
            total: data.amount || 0,
            vendorName: data.vendorName,
            concept: data.concept,
            _type: "gasto_manual"
          });
        }
      });
    } catch (e) {
      const manualSnapAll = await getDocs(collection(db, "companies", companyId, "expenses"));
      manualSnapAll.forEach(d => {
        const data = d.data();
        if (data.status !== "paid" && !data.isProvisional) {
          candidates.push({
            id: d.id,
            documentNumber: data.documentNumber,
            date: data.date,
            total: data.amount || 0,
            vendorName: data.vendorName,
            concept: data.concept,
            _type: "gasto_manual"
          });
        }
      });
    }

    // 3. Obtener Cuentas Contables, Cuenta Bancaria y Catálogo Oficial de Proveedores
    const accountsSnap = await getDocs(collection(db, "companies", companyId, "accounts"));
    const allAccounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const bankAccDoc = await getDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId));
    const bankAccData = bankAccDoc.data() || {};
    const bankAccountInfo = allAccounts.find(a => a.id === bankAccData.accountId) || allAccounts.find(a => a.code?.startsWith("102")) || { id: "acc-102-01", code: "102.01", name: bankAccData.name || "Banco" };

    const vendorsSnap = await getDocs(collection(db, "companies", companyId, "vendors"));
    const officialVendors = vendorsSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        name: (data.name || data.LegalName || "").trim(),
        legalName: (data.LegalName || data.name || "").trim(),
        rfc: (data.rfc || "").toUpperCase().trim()
      };
    });

    const resolveVendorAndConcept = (
      rawConcept: string,
      bankName: string,
      aiVendorName?: string,
      aiConcept?: string
    ): { vendorId: string; vendorName: string; vendorRfc: string; concept: string } => {
      const conceptUpper = (rawConcept || "").toUpperCase().trim();

      // 1. Detectar si es un cargo/comisión propio del banco
      const isBankCharge = 
        conceptUpper.includes("TASA DE DES") || 
        conceptUpper.includes("COM. VTA.") || 
        conceptUpper.includes("IVA TASA") || 
        conceptUpper.includes("IVA COM.") || 
        conceptUpper.includes("RETIRO CAJERO") || 
        conceptUpper.includes("COMISION") || 
        conceptUpper.includes("ANUALIDAD") ||
        conceptUpper.includes("TERMINALES PUNTO DE VENTA");

      if (isBankCharge) {
        const cleanBankName = bankName || "Institución Bancaria";
        const matchedBank = officialVendors.find(v => {
          const vName = v.name.toUpperCase();
          return vName.includes(cleanBankName.toUpperCase()) || cleanBankName.toUpperCase().includes(vName) || vName.includes("BBVA");
        });

        let cleanConceptDesc = "Comisiones y servicios bancarios";
        if (conceptUpper.includes("IVA TASA") || conceptUpper.includes("IVA COM")) {
          cleanConceptDesc = "IVA de comisión / tasa por terminal TPV";
        } else if (conceptUpper.includes("TASA DE DES") || conceptUpper.includes("COM. VTA.")) {
          cleanConceptDesc = "Comisión / Tasa de descuento por terminal TPV";
        } else if (conceptUpper.includes("RETIRO CAJERO")) {
          cleanConceptDesc = "Retiro de efectivo en cajero automático";
        }

        return {
          vendorId: matchedBank ? matchedBank.id : "",
          vendorName: matchedBank ? matchedBank.name : cleanBankName,
          vendorRfc: matchedBank ? matchedBank.rfc : "",
          concept: cleanConceptDesc
        };
      }

      // 2. Extraer RFC del concepto si existe (ej. "RFC: TME 840315KT6" -> "TME840315KT6")
      const rfcMatch = rawConcept.match(/RFC:\s*([A-Z&Ñ]{3,4}\s*\d{6}\s*[A-Z0-9]{3})/i);
      if (rfcMatch) {
        const extractedRfc = rfcMatch[1].replace(/\s+/g, "").toUpperCase();
        const vendorByRfc = officialVendors.find(v => v.rfc && v.rfc.replace(/\s+/g, "").toUpperCase() === extractedRfc);
        if (vendorByRfc) {
          return {
            vendorId: vendorByRfc.id,
            vendorName: vendorByRfc.name,
            vendorRfc: vendorByRfc.rfc,
            concept: aiConcept || `Gasto operativo con ${vendorByRfc.name}`
          };
        }
      }

      // 3. Buscar coincidencia por nombre o razón social en el catálogo oficial
      const vendorByName = officialVendors.find(v => {
        const vName = v.name.toUpperCase().trim();
        const vLegal = v.legalName.toUpperCase().trim();
        if (vName.length >= 4 && conceptUpper.includes(vName)) return true;
        if (vLegal.length >= 4 && conceptUpper.includes(vLegal)) return true;
        return false;
      });

      if (vendorByName) {
        return {
          vendorId: vendorByName.id,
          vendorName: vendorByName.name,
          vendorRfc: vendorByName.rfc,
          concept: aiConcept || `Gasto operativo con ${vendorByName.name}`
        };
      }

      // 4. Si la IA sugirió un nombre, validar si existe en la lista oficial
      if (aiVendorName) {
        const aiUpper = aiVendorName.toUpperCase().trim();
        const vendorByAi = officialVendors.find(v => {
          const vName = v.name.toUpperCase().trim();
          return vName === aiUpper || vName.includes(aiUpper) || aiUpper.includes(vName);
        });

        if (vendorByAi) {
          return {
            vendorId: vendorByAi.id,
            vendorName: vendorByAi.name,
            vendorRfc: vendorByAi.rfc,
            concept: aiConcept || `Gasto operativo con ${vendorByAi.name}`
          };
        }
      }

      // 5. REGLA ESTRICTA: No inventar proveedores al aire.
      return {
        vendorId: "",
        vendorName: "Proveedor Pendiente de Asignar",
        vendorRfc: "",
        concept: aiConcept || rawConcept
      };
    };

    // 4. Obtener Movimientos Bancarios de Egreso No Conciliados
    control?.onProgress?.(0, 0, "Cargando movimientos bancarios...");
    const txsSnap = await getDocs(collection(db, "companies", companyId, "bankAccounts", bankAccountId, "transactions"));
    let pendingTxs = txsSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(t => !t.reconciled && t.amount < 0);

    if (dateRange?.startDate) {
      pendingTxs = pendingTxs.filter(t => normalizeDateToISO(t.date || "") >= dateRange.startDate!);
    }
    if (dateRange?.endDate) {
      pendingTxs = pendingTxs.filter(t => normalizeDateToISO(t.date || "") <= dateRange.endDate!);
    }

    if (pendingTxs.length === 0) {
      return {
        success: true,
        processedCount: 0,
        details: [],
        error: "No se encontraron movimientos bancarios de egreso pendientes de conciliar en la cuenta y rango de fechas seleccionados."
      };
    }

    const details: any[] = [];
    let processedCount = 0;

    for (let idx = 0; idx < pendingTxs.length; idx++) {
      // ─────────────────────────────────────────────────────────────
      // VERIFICACIÓN DE CONTROL: CANCELACIÓN Y PAUSA
      // ─────────────────────────────────────────────────────────────
      if (control?.isCancelled()) {
        return { success: true, processedCount, details, cancelled: true };
      }

      while (control?.isPaused()) {
        if (control?.isCancelled()) {
          return { success: true, processedCount, details, cancelled: true };
        }
        await sleep(500);
      }

      const tx = pendingTxs[idx];
      const txAbsAmount = Math.abs(tx.amount);
      const txDate = tx.date || new Date().toISOString().split("T")[0];
      const conceptLower = (tx.concept || "").toLowerCase().trim();

      control?.onProgress?.(idx + 1, pendingTxs.length, `Procesando movimiento ${idx + 1} de ${pendingTxs.length}: "${tx.concept || ''}"`);

      let evalData: any = null;

      // ─────────────────────────────────────────────────────────────
      // ETAPA 1: MATCH DETERMINISTA GRATUITO ($0.00 MXN en IA)
      // ─────────────────────────────────────────────────────────────
      const exactAmountCandidates = candidates.filter(c => Math.abs((c.total || 0) - txAbsAmount) < 0.05);

      if (exactAmountCandidates.length === 1) {
        // Coincidencia de monto exacto único
        const singleCand = exactAmountCandidates[0];
        evalData = {
          confidenceScore: 0.98,
          recommendedAction: "MATCH_INVOICE",
          matchedDocId: singleCand.id,
          reasoning: `Conciliación determinista directa ($0.00 IA): Monto exacto ($${txAbsAmount.toFixed(2)}) con comprobante ${singleCand.invoiceNumber || singleCand.documentNumber || singleCand.id}`
        };
      } else if (exactAmountCandidates.length > 1) {
        // Múltiples coinciden en monto exacto: intentar desambiguar por nombre o RFC de proveedor
        const nameOrRfcMatched = exactAmountCandidates.find(c => {
          const vendorName = (c.emitterName || c.vendorName || "").toLowerCase();
          const vendorRfc = (c.emitterRfc || c.vendorRfc || "").toLowerCase();
          return (vendorName && conceptLower.includes(vendorName)) || (vendorRfc && conceptLower.includes(vendorRfc));
        });

        if (nameOrRfcMatched) {
          evalData = {
            confidenceScore: 0.99,
            recommendedAction: "MATCH_INVOICE",
            matchedDocId: nameOrRfcMatched.id,
            reasoning: `Conciliación determinista exacta ($0.00 IA): Coincidencia por Monto ($${txAbsAmount.toFixed(2)}) y Proveedor/RFC (${nameOrRfcMatched.emitterName || nameOrRfcMatched.vendorName})`
          };
        }
      }

      // ─────────────────────────────────────────────────────────────
      // ETAPA 2: PRE-FILTRADO (CANDIDATE SLICING) Y LLAMADA OPTIMIZADA A IA
      // ─────────────────────────────────────────────────────────────
      if (!evalData) {
        // Filtrar candidatos cuya variación de monto sea menor al 15% o $100 MXN, o compartan coincidencia en concepto
        const slicedCandidates = candidates.filter(c => {
          const diff = Math.abs((c.total || 0) - txAbsAmount);
          const percentDiff = diff / Math.max(txAbsAmount, 1);
          const vendorName = (c.emitterName || c.vendorName || "").toLowerCase();
          return percentDiff <= 0.15 || diff <= 100 || (vendorName && conceptLower.includes(vendorName));
        }).slice(0, 8); // Máximo 8 candidatos en el prompt

        if (idx > 0) await sleep(500);

        const prompt = `
Eres un Agente Contable Experto y Conciliador de Inteligencia Artificial para un sistema ERP.
Analiza este movimiento bancario de egreso y compáralo con los candidatos filtrados.

MOVIMIENTO BANCARIO:
- ID: ${tx.id}
- Fecha: ${txDate}
- Monto Total: $${txAbsAmount.toFixed(2)} MXN
- Concepto Bancario: "${tx.concept}" (Ref: ${tx.reference || "N/A"})

CANDIDATOS CERCANOS FILTRADOS:
${JSON.stringify(slicedCandidates, null, 2)}

REGLAS:
1. Si un candidato coincide en monto y concepto/proveedor, asigna confidenceScore >= 0.90 y recommendedAction = "MATCH_INVOICE".
2. Si NO hay candidata pero es un gasto operativo claro (Uber, Oxxo, CFE, Gasolina, Renta, Caseta, Comisiones bancarias, etc.), asigna confidenceScore >= 0.90 y recommendedAction = "CREATE_PROVISIONAL_EXPENSE". Determina la cuenta contable (ej. "601.01" Gastos Generales). Extrae el nombre limpio del comercio o entidad (suggestedVendorName) y un concepto descriptivo claro (suggestedConcept).
3. Si hay ambigüedad o montos discordantes, asigna confidenceScore < 0.90 y recommendedAction = "REVIEW_REQUIRED".

Formato JSON estricto:
{
  "confidenceScore": número entre 0.0 y 1.0,
  "recommendedAction": "MATCH_INVOICE" | "CREATE_PROVISIONAL_EXPENSE" | "REVIEW_REQUIRED",
  "matchedDocId": ID de la factura (o null),
  "suggestedAccountCode": "601.01",
  "suggestedAccountName": "Gastos Generales",
  "suggestedVendorName": "Nombre limpio del comercio/proveedor (ej. Telcel, Oxxo Gas, Amazon, BBVA)",
  "suggestedConcept": "Descripción clara del gasto (ej. Pago de telefonía móvil, Combustible en estación de servicio)",
  "reasoning": "Explicación clara en español."
}
`;

        const text = await generateWithFallback(prompt);
        evalData = JSON.parse(text);
      }

      // ─────────────────────────────────────────────────────────────
      // ETAPA 3: APLICACIÓN DE RESULTADO Y REGISTRO EN BASE DE DATOS
      // ─────────────────────────────────────────────────────────────
      if (evalData.confidenceScore >= 0.90) {
        if (evalData.recommendedAction === "MATCH_INVOICE" && evalData.matchedDocId) {
          const matchedCand = candidates.find(c => c.id === evalData.matchedDocId);
          const targetExpenseId = matchedCand?._type === "gasto" ? crypto.randomUUID() : evalData.matchedDocId;
          const docNumber = matchedCand?.invoiceNumber || matchedCand?.uuid || "GAS-000100";

          if (matchedCand?._type === "gasto") {
            // Crear gasto oficial en "expenses"
            await setDoc(doc(db, "companies", companyId, "expenses", targetExpenseId), {
              id: targetExpenseId,
              number: 100,
              documentNumber: docNumber,
              date: matchedCand.date || txDate,
              vendorName: matchedCand.emitterName || "Proveedor",
              vendorRfc: matchedCand.emitterRfc || "",
              concept: matchedCand.concept || `Gasto desde XML ${docNumber}`,
              amount: matchedCand.total || txAbsAmount,
              vatRate: 0.16,
              paidAmount: txAbsAmount,
              status: "paid",
              satInvoiceId: evalData.matchedDocId,
              isProvisional: false,
              isPendingFiscalInvoice: false,
              createdAt: new Date().toISOString(),
              createdBy: userEmail || "Agente IA (Conciliación Autónoma)",
              _type: "gasto_manual"
            });

            await updateDoc(doc(db, "companies", companyId, "expenses_inbox", evalData.matchedDocId), {
              status: "paid",
              paidAmount: matchedCand.total || txAbsAmount,
              reconciled: true,
              reconciledAt: new Date().toISOString(),
              linkedExpenseId: targetExpenseId
            });
          }

          // Outflow
          const outflowId = crypto.randomUUID();
          await setDoc(doc(db, "companies", companyId, "outflows", outflowId), {
            id: outflowId,
            amount: txAbsAmount,
            date: txDate,
            method: "Transferencia",
            reference: tx.reference || tx.concept || "CONCILIACION_IA",
            documentId: targetExpenseId,
            documentType: "gasto_manual",
            documentNumber: docNumber,
            providerName: matchedCand?.emitterName || "Proveedor",
            bankAccountId,
            createdAt: new Date().toISOString(),
            createdBy: "Agente IA"
          });

          // Póliza Contable
          const journalId = crypto.randomUUID();
          const vatAmount = txAbsAmount - (txAbsAmount / 1.16);
          const subtotal = txAbsAmount - vatAmount;
          await setDoc(doc(db, "companies", companyId, "journal_entries", journalId), {
            id: journalId,
            date: txDate,
            concept: `Conciliación Autónoma IA: ${matchedCand?.emitterName || 'Proveedor'} - ${tx.concept}`,
            reference: tx.reference || docNumber,
            documentId: targetExpenseId,
            entries: [
              { accountCode: "601.01", accountName: "Gastos Generales", debit: subtotal, credit: 0 },
              { accountCode: "118.01", accountName: "IVA Acreditable Pagado", debit: vatAmount, credit: 0 },
              { accountCode: bankAccountInfo.code, accountName: bankAccountInfo.name, debit: 0, credit: txAbsAmount }
            ],
            createdAt: new Date().toISOString()
          });

          // Actualizar transacción bancaria
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId, "transactions", tx.id), {
            reconciled: true,
            reconciledType: "match",
            reconciledDocId: targetExpenseId,
            reconciledBy: "AI_AGENT",
            confidenceScore: evalData.confidenceScore,
            aiMatchReason: evalData.reasoning,
            reconciledAt: new Date().toISOString()
          });

          processedCount++;
          details.push({ txId: tx.id, action: "MATCH_INVOICE", docNumber, reasoning: evalData.reasoning });
        } else if (evalData.recommendedAction === "CREATE_PROVISIONAL_EXPENSE") {
          const expenseId = crypto.randomUUID();
          const documentNumber = `PROV-${Math.floor(100000 + Math.random() * 900000)}`;

          const resolved = resolveVendorAndConcept(
            tx.concept || "",
            bankAccountInfo.name || bankAccData.name || "Banco",
            evalData.suggestedVendorName,
            evalData.suggestedConcept
          );

          // Crear Gasto Directo Provisional con Proveedor y Concepto Validados
          await setDoc(doc(db, "companies", companyId, "expenses", expenseId), {
            id: expenseId,
            documentNumber,
            date: txDate,
            vendorId: resolved.vendorId || "",
            vendorName: resolved.vendorName,
            vendorRfc: resolved.vendorRfc || "",
            concept: resolved.concept,
            rawBankConcept: tx.concept || "",
            amount: txAbsAmount,
            paidAmount: txAbsAmount,
            status: "paid",
            isProvisional: true,
            isPendingFiscalInvoice: true,
            linkedBankTransactionId: tx.id,
            accountCode: evalData.suggestedAccountCode || "601.01",
            accountName: evalData.suggestedAccountName || "Gastos Generales",
            createdAt: new Date().toISOString(),
            createdBy: "Agente IA (Provisional)",
            _type: "gasto_manual"
          });

          // Outflow
          const outflowId = crypto.randomUUID();
          await setDoc(doc(db, "companies", companyId, "outflows", outflowId), {
            id: outflowId,
            amount: txAbsAmount,
            date: txDate,
            method: "Transferencia",
            reference: tx.reference || tx.concept || "CONCILIACION_IA_PROVISIONAL",
            documentId: expenseId,
            documentType: "gasto_manual",
            documentNumber,
            providerName: resolved.vendorName,
            bankAccountId,
            createdAt: new Date().toISOString(),
            createdBy: "Agente IA"
          });

          // Póliza Contable
          const journalId = crypto.randomUUID();
          await setDoc(doc(db, "companies", companyId, "journal_entries", journalId), {
            id: journalId,
            date: txDate,
            concept: `Gasto Provisional IA: ${resolved.vendorName} - ${resolved.concept}`,
            reference: tx.reference || documentNumber,
            documentId: expenseId,
            entries: [
              { accountCode: evalData.suggestedAccountCode || "601.01", accountName: evalData.suggestedAccountName || "Gastos Generales", debit: txAbsAmount, credit: 0 },
              { accountCode: bankAccountInfo.code, accountName: bankAccountInfo.name, debit: 0, credit: txAbsAmount }
            ],
            createdAt: new Date().toISOString()
          });

          // Actualizar transacción bancaria
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId, "transactions", tx.id), {
            reconciled: true,
            reconciledType: "direct",
            reconciledDocId: expenseId,
            reconciledBy: "AI_AGENT",
            confidenceScore: evalData.confidenceScore,
            aiMatchReason: evalData.reasoning,
            reconciledAt: new Date().toISOString()
          });

          processedCount++;
          details.push({ txId: tx.id, action: "CREATE_PROVISIONAL_EXPENSE", documentNumber, reasoning: evalData.reasoning });
        }
      } else {
        await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId, "transactions", tx.id), {
          aiSuggestedAction: evalData.recommendedAction,
          aiSuggestedDocId: evalData.matchedDocId || null,
          aiConfidenceScore: evalData.confidenceScore,
          aiReasoning: evalData.reasoning,
          requiresHumanReview: true
        });
        details.push({ txId: tx.id, action: "FLAGGED_FOR_REVIEW", reasoning: evalData.reasoning });
      }
    }

    return {
      success: true,
      processedCount,
      details
    };
  } catch (err: any) {
    console.error("Error en runClientAiReconciliation:", err);
    return {
      success: false,
      processedCount: 0,
      details: [],
      error: err.message || "Error al ejecutar el Agente de IA"
    };
  }
}
