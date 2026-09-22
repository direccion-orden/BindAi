import { doc, getDoc, getDocs, collection, setDoc, updateDoc, addDoc, increment, query, where } from "firebase/firestore";
import { Firestore } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { isCreditAccount } from "@/types/bank";
import { parseCfdiItems } from "@/lib/cfdi/parseInvoiceItems";

export const findBankAccountingAccount = (physicalBankAccount: any, accountingAccountsAll: any[]) => {
  if (!physicalBankAccount) return null;
  const bankAccountingId = physicalBankAccount.accountId;
  if (bankAccountingId && bankAccountingId !== "undefined") {
    const acc = accountingAccountsAll.find(a => a.id === bankAccountingId);
    if (acc) return acc;
  }
  
  const isCredit = isCreditAccount(physicalBankAccount);

  // Fallback: search by name
  const bankName = (physicalBankAccount.Name || physicalBankAccount.name || "").toLowerCase().trim();
  if (bankName) {
    if (isCredit) {
      let matchedAcc = accountingAccountsAll.find(a => 
        (a.code?.startsWith("205") || a.code?.startsWith("201")) && 
        a.name.toLowerCase().trim() === bankName
      );
      if (matchedAcc) return matchedAcc;

      matchedAcc = accountingAccountsAll.find(a => 
        (a.code?.startsWith("205") || a.code?.startsWith("201")) && 
        (bankName.includes(a.name.toLowerCase().trim()) || a.name.toLowerCase().trim().includes(bankName))
      );
      if (matchedAcc) return matchedAcc;

      matchedAcc = accountingAccountsAll.find(a => a.code?.startsWith("205"));
      if (matchedAcc) return matchedAcc;
    }

    let matchedAcc = accountingAccountsAll.find(a => 
      (a.code?.startsWith("102") || a.code?.startsWith("101")) && 
      a.name.toLowerCase().trim() === bankName
    );
    if (matchedAcc) return matchedAcc;

    matchedAcc = accountingAccountsAll.find(a => 
      (a.code?.startsWith("102") || a.code?.startsWith("101")) && 
      (bankName.includes(a.name.toLowerCase().trim()) || a.name.toLowerCase().trim().includes(bankName))
    );
    if (matchedAcc) return matchedAcc;
  }

  if (isCredit) {
    return accountingAccountsAll.find(a => a.code?.startsWith("205")) || { id: "acc-205-01", code: "205.01", name: "Tarjetas de Crédito" };
  }
  return accountingAccountsAll.find(a => a.code?.startsWith("102")) || { id: "acc-102-01", code: "102.01", name: "Bancos" };
};

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

    // 3. Obtener Cuentas Contables, Cuentas Bancarias y Catálogo Oficial de Proveedores
    const accountsSnap = await getDocs(collection(db, "companies", companyId, "accounts"));
    const allAccounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const bankAccountsSnap = await getDocs(collection(db, "companies", companyId, "bankAccounts"));
    const allBankAccounts = bankAccountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const currentBankAccount = allBankAccounts.find(b => b.id === bankAccountId) || { id: bankAccountId };
    const otherBankAccounts = allBankAccounts.filter(b => b.id !== bankAccountId);

    const isCredit = isCreditAccount(currentBankAccount);
    const defaultPaymentMethod = isCredit ? "Tarjeta de Crédito" : "Transferencia";

    let bankAccountInfo = findBankAccountingAccount(currentBankAccount, allAccounts);
    if (!bankAccountInfo) {
      bankAccountInfo = isCredit
        ? { id: "acc-205-01", code: "205.01", name: currentBankAccount.name || currentBankAccount.Name || "Tarjetas de Crédito (Pasivo)" }
        : { id: "acc-102-01", code: "102.01", name: currentBankAccount.name || currentBankAccount.Name || "Banco" };
    }

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

      // 1. Detectar si es un cargo/comisión propio del banco o tarjeta de crédito
      const isBankCharge = 
        conceptUpper.includes("TASA DE DES") || 
        conceptUpper.includes("COM. VTA.") || 
        conceptUpper.includes("IVA TASA") || 
        conceptUpper.includes("IVA COM.") || 
        conceptUpper.includes("RETIRO CAJERO") || 
        conceptUpper.includes("COMISION") || 
        conceptUpper.includes("ANUALIDAD") ||
        conceptUpper.includes("INTERES") ||
        conceptUpper.includes("SEGURO") ||
        conceptUpper.includes("CARGO POR") ||
        conceptUpper.includes("DISPOSICION") ||
        conceptUpper.includes("TERMINALES PUNTO DE VENTA");

      if (isBankCharge) {
        const cleanBankName = bankName || "Institución Bancaria";
        const matchedBank = officialVendors.find(v => {
          const vName = v.name.toUpperCase();
          return vName.includes(cleanBankName.toUpperCase()) || 
                 cleanBankName.toUpperCase().includes(vName) || 
                 vName.includes("BBVA") || 
                 vName.includes("BANREGIO") || 
                 vName.includes("SANTANDER") || 
                 vName.includes("BANORTE") || 
                 vName.includes("CITIBANAMEX");
        });

        let cleanConceptDesc = "Comisiones y servicios bancarios";
        if (conceptUpper.includes("IVA TASA") || conceptUpper.includes("IVA COM")) {
          cleanConceptDesc = "IVA de comisión / tasa por terminal TPV";
        } else if (conceptUpper.includes("TASA DE DES") || conceptUpper.includes("COM. VTA.")) {
          cleanConceptDesc = "Comisión / Tasa de descuento por terminal TPV";
        } else if (conceptUpper.includes("RETIRO CAJERO")) {
          cleanConceptDesc = "Retiro de efectivo en cajero automático";
        } else if (conceptUpper.includes("IVA INTERES")) {
          cleanConceptDesc = "IVA de intereses por financiamiento";
        } else if (conceptUpper.includes("INTERES")) {
          cleanConceptDesc = "Intereses por financiamiento de tarjeta de crédito";
        } else if (conceptUpper.includes("ANUALIDAD")) {
          cleanConceptDesc = "Comisión por anualidad de tarjeta de crédito";
        } else if (conceptUpper.includes("SEGURO")) {
          cleanConceptDesc = "Seguro asociado a tarjeta / cuenta bancaria";
        } else if (conceptUpper.includes("DISPOSICION")) {
          cleanConceptDesc = "Comisión por disposición de efectivo";
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

    // 4. Conciliación Determinista de Traspasos Entre Cuentas Propias ($0.00 MXN IA)
    control?.onProgress?.(0, 0, "Cargando movimientos bancarios...");
    const details: any[] = [];
    let processedCount = 0;

    const txsSnap = await getDocs(collection(db, "companies", companyId, "bankAccounts", bankAccountId, "transactions"));
    let allCurrentPendingTxs = txsSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(t => !t.reconciled);

    if (dateRange?.startDate) {
      allCurrentPendingTxs = allCurrentPendingTxs.filter(t => normalizeDateToISO(t.date || "") >= dateRange.startDate!);
    }
    if (dateRange?.endDate) {
      allCurrentPendingTxs = allCurrentPendingTxs.filter(t => normalizeDateToISO(t.date || "") <= dateRange.endDate!);
    }

    const reconciledTransferTxIds = new Set<string>();

    // Helper para extraer secuencias numéricas de folios o referencias SPEI / BNET (de 6 a 14 dígitos)
    const extractNumericTokens = (text: string): string[] => {
      if (!text) return [];
      const matches = text.match(/\d{6,14}/g) || [];
      return Array.from(new Set(matches.filter(m => !/^0+$/.test(m))));
    };

    if (otherBankAccounts.length > 0 && allCurrentPendingTxs.length > 0) {
      control?.onProgress?.(0, allCurrentPendingTxs.length, "Buscando traspasos entre cuentas propias...");

      // Cargar movimientos pendientes de las otras cuentas bancarias
      const otherPendingTxs: Array<{ tx: any; bankAccountId: string; bankAccount: any }> = [];
      for (const otherAcc of otherBankAccounts) {
        const otherSnap = await getDocs(collection(db, "companies", companyId, "bankAccounts", otherAcc.id, "transactions"));
        otherSnap.docs.forEach(d => {
          const data = d.data();
          if (!data.reconciled) {
            otherPendingTxs.push({
              tx: { id: d.id, ...data },
              bankAccountId: otherAcc.id,
              bankAccount: otherAcc
            });
          }
        });
      }

      const matchedTargetIds = new Set<string>();

      for (const cTx of allCurrentPendingTxs) {
        if (control?.isCancelled()) break;
        while (control?.isPaused()) {
          if (control?.isCancelled()) break;
          await sleep(500);
        }

        const cAbs = Math.abs(cTx.amount);
        const cSign = Math.sign(cTx.amount);
        const cDateStr = normalizeDateToISO(cTx.date || "");
        const cDate = new Date(cDateStr + "T00:00:00");
        const cConcept = (cTx.concept || "").toLowerCase();
        const cRef = (cTx.reference || "").toLowerCase();
        const cTokens = extractNumericTokens((cTx.concept || "") + " " + (cTx.reference || ""));

        // Buscar candidatos con signo opuesto y mismo importe en las demás cuentas
        const candidates: Array<{
          item: typeof otherPendingTxs[0];
          diffDays: number;
          score: number;
          hasTransferKeyword: boolean;
          hasExactRefMatch: boolean;
        }> = [];

        for (const item of otherPendingTxs) {
          if (matchedTargetIds.has(item.tx.id)) continue;
          if (Math.sign(item.tx.amount) === cSign) continue;
          if (Math.abs(Math.abs(item.tx.amount) - cAbs) >= 0.01) continue;

          const oDateStr = normalizeDateToISO(item.tx.date || "");
          const oDate = new Date(oDateStr + "T00:00:00");
          const diffDays = Math.round(Math.abs((cDate.getTime() - oDate.getTime()) / (1000 * 60 * 60 * 24)));
          // Ventana de tolerancia extendida a 7 días para liquidaciones bancarias de fin de semana
          if (isNaN(diffDays) || diffDays > 7) continue;

          const oConcept = (item.tx.concept || "").toLowerCase();
          const oRef = (item.tx.reference || "").toLowerCase();
          const oCombined = oConcept + " " + oRef;

          // Cruce de folio o número de rastreo SPEI / BNET
          let hasExactRefMatch = false;
          for (const tok of cTokens) {
            if (oCombined.includes(tok)) {
              hasExactRefMatch = true;
              break;
            }
          }

          let score = 50 - (diffDays * 5);
          if (hasExactRefMatch) score += 50;

          const hasTransferKeyword = 
            cConcept.includes("traspas") || oConcept.includes("traspas") ||
            cConcept.includes("pago servicio") || oConcept.includes("su pago") ||
            cConcept.includes("tarjeta de credito") || oConcept.includes("tarjeta de credito") ||
            cConcept.includes("bbva") || oConcept.includes("bbva") ||
            cConcept.includes("banregio") || oConcept.includes("banregio") ||
            cConcept.includes("santander") || oConcept.includes("santander") ||
            cConcept.includes("bajio") || oConcept.includes("bajio") ||
            cConcept.includes("inbursa") || oConcept.includes("inbursa") ||
            cConcept.includes("banorte") || oConcept.includes("banorte") ||
            cConcept.includes("citibanamex") || oConcept.includes("citibanamex") ||
            cConcept.includes("dmg capital") || oConcept.includes("dmg capital") ||
            cConcept.includes("humberto vargas") || oConcept.includes("humberto vargas");

          if (hasTransferKeyword) score += 30;

          candidates.push({ item, diffDays, score, hasTransferKeyword, hasExactRefMatch });
        }

        if (candidates.length > 0) {
          candidates.sort((a, b) => b.score - a.score);
          const best = candidates[0];

          if (best.hasExactRefMatch || best.hasTransferKeyword || (candidates.length === 1 && best.diffDays <= 2)) {
            const targetItem = best.item;
            matchedTargetIds.add(targetItem.tx.id);
            reconciledTransferTxIds.add(cTx.id);

            control?.onProgress?.(
              processedCount + 1,
              allCurrentPendingTxs.length,
              `Traspaso propio emparejado ($${cAbs.toFixed(2)}): ${currentBankAccount.name || currentBankAccount.Name || "Cuenta"} <-> ${targetItem.bankAccount.name || targetItem.bankAccount.Name || "Cuenta"}`
            );

            try {
              // Cuentas contables para ambas cuentas
              const currentAccountingAccount = findBankAccountingAccount(currentBankAccount, allAccounts);
              const currentBankAccountingId = currentAccountingAccount?.id;
              const targetAccountingAccount = findBankAccountingAccount(targetItem.bankAccount, allAccounts);
              const targetBankAccountingId = targetAccountingAccount?.id;

              // Actualizar transacción actual
              await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId, "transactions", cTx.id), {
                reconciled: true,
                matchedAt: new Date().toISOString(),
                reconcileType: "transfer",
                matchedDocumentId: targetItem.tx.id,
                matchedAccountId: targetItem.bankAccountId,
                reconciledBy: "AI_AGENT (Determinista)",
                aiMatchReason: `Traspaso propio emparejado con ${targetItem.bankAccount.name || targetItem.bankAccount.Name || "otra cuenta bancaria"}`
              });

              // Actualizar transacción destino
              await updateDoc(doc(db, "companies", companyId, "bankAccounts", targetItem.bankAccountId, "transactions", targetItem.tx.id), {
                reconciled: true,
                matchedAt: new Date().toISOString(),
                reconcileType: "transfer",
                matchedDocumentId: cTx.id,
                matchedAccountId: bankAccountId,
                reconciledBy: "AI_AGENT (Determinista)",
                aiMatchReason: `Traspaso propio emparejado con ${currentBankAccount.name || currentBankAccount.Name || "otra cuenta bancaria"}`
              });

              const isCurrentOutflow = cTx.amount < 0;

              if (isCurrentOutflow) {
                await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId), {
                  balance: increment(-cAbs)
                });
                await updateDoc(doc(db, "companies", companyId, "bankAccounts", targetItem.bankAccountId), {
                  balance: increment(cAbs)
                });

                if (currentBankAccountingId && !currentBankAccountingId.startsWith("acc-")) {
                  await updateDoc(doc(db, "companies", companyId, "accounts", currentBankAccountingId), {
                    balance: increment(-cAbs)
                  }).catch(() => {});
                }
                if (targetBankAccountingId && !targetBankAccountingId.startsWith("acc-")) {
                  await updateDoc(doc(db, "companies", companyId, "accounts", targetBankAccountingId), {
                    balance: increment(cAbs)
                  }).catch(() => {});
                }

                if (currentAccountingAccount && targetAccountingAccount) {
                  const entries = [
                    {
                      accountId: targetBankAccountingId,
                      accountCode: targetAccountingAccount.code,
                      accountName: targetAccountingAccount.name,
                      debit: cAbs,
                      credit: 0
                    },
                    {
                      accountId: currentBankAccountingId,
                      accountCode: currentAccountingAccount.code,
                      accountName: currentAccountingAccount.name,
                      debit: 0,
                      credit: cAbs
                    }
                  ];

                  await addDoc(collection(db, "companies", companyId, "journal_entries"), {
                    type: "diario",
                    date: cTx.date || new Date().toISOString().split("T")[0],
                    description: `Traspaso propio: ${cTx.concept || "Salida"} -> ${targetItem.tx.concept || "Entrada"}`,
                    referenceId: cTx.id,
                    referenceType: "bank_transfer_reconciliation",
                    createdAt: new Date().toISOString(),
                    status: "activa",
                    entries
                  }).catch(err => console.warn("Error creando póliza de traspaso:", err));
                }
              } else {
                await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId), {
                  balance: increment(cAbs)
                });
                await updateDoc(doc(db, "companies", companyId, "bankAccounts", targetItem.bankAccountId), {
                  balance: increment(-cAbs)
                });

                if (currentBankAccountingId && !currentBankAccountingId.startsWith("acc-")) {
                  await updateDoc(doc(db, "companies", companyId, "accounts", currentBankAccountingId), {
                    balance: increment(cAbs)
                  }).catch(() => {});
                }
                if (targetBankAccountingId && !targetBankAccountingId.startsWith("acc-")) {
                  await updateDoc(doc(db, "companies", companyId, "accounts", targetBankAccountingId), {
                    balance: increment(-cAbs)
                  }).catch(() => {});
                }

                if (currentAccountingAccount && targetAccountingAccount) {
                  const entries = [
                    {
                      accountId: currentBankAccountingId,
                      accountCode: currentAccountingAccount.code,
                      accountName: currentAccountingAccount.name,
                      debit: cAbs,
                      credit: 0
                    },
                    {
                      accountId: targetBankAccountingId,
                      accountCode: targetAccountingAccount.code,
                      accountName: targetAccountingAccount.name,
                      debit: 0,
                      credit: cAbs
                    }
                  ];

                  await addDoc(collection(db, "companies", companyId, "journal_entries"), {
                    type: "diario",
                    date: cTx.date || new Date().toISOString().split("T")[0],
                    description: `Traspaso propio: ${targetItem.tx.concept || "Salida"} -> ${cTx.concept || "Entrada"}`,
                    referenceId: cTx.id,
                    referenceType: "bank_transfer_reconciliation",
                    createdAt: new Date().toISOString(),
                    status: "activa",
                    entries
                  }).catch(err => console.warn("Error creando póliza de traspaso:", err));
                }
              }

              processedCount++;
              details.push({
                txId: cTx.id,
                action: "TRANSFER",
                documentNumber: `TRASPASO-${targetItem.bankAccount.name || targetItem.bankAccount.Name || "BANCO"}`,
                reasoning: `Conciliación determinista de traspaso propio ($0.00 IA): Monto $${cAbs.toFixed(2)} con cuenta ${targetItem.bankAccount.name || targetItem.bankAccount.Name}`
              });
            } catch (txErr) {
              console.error(`Error procesando traspaso ${cTx.id}:`, txErr);
            }
          }
        }
      }
    }

    // 5. Filtrar Movimientos Bancarios de Egreso No Conciliados Restantes para Facturas / IA
    let pendingTxs = allCurrentPendingTxs.filter(t => !reconciledTransferTxIds.has(t.id) && t.amount < 0);

    if (pendingTxs.length === 0) {
      if (processedCount > 0) {
        return {
          success: true,
          processedCount,
          details
        };
      }
      return {
        success: true,
        processedCount: 0,
        details: [],
        error: "No se encontraron movimientos bancarios de egreso pendientes de conciliar en la cuenta y rango de fechas seleccionados."
      };
    }

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
        // Si el concepto indica explícitamente un traspaso bancario propio y no se emparejó de forma automática
        const isTransferConcept = conceptLower.includes("traspas") || conceptLower.includes("spei enviado") || conceptLower.includes("spei recib");
        if (isTransferConcept) {
          evalData = {
            confidenceScore: 0.85,
            recommendedAction: "REVIEW_TRANSFER",
            matchedDocId: null,
            reasoning: `El movimiento por $${txAbsAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN corresponde a un traspaso bancario propio hacia otra cuenta. No se detectó la contraparte automática en los extractos actuales; se recomienda conciliarlo en la pestaña 'Traspaso Propio' o verificar la cuenta destino.`
          };
        }
      }

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
            let parsedItems: any[] = [];
            if (matchedCand.items && matchedCand.items.length > 0) {
              parsedItems = matchedCand.items;
            } else if (matchedCand.xmlBase64) {
              const rawItems = parseCfdiItems(matchedCand.xmlBase64);
              parsedItems = rawItems.map((item) => ({
                productId: null,
                variantId: null,
                productName: item.productName || "Partida SAT",
                variantTitle: item.variantTitle || "",
                quantity: item.quantity || 1,
                unitCost: item.unitCost || 0,
                amount: item.amount || ((item.quantity || 1) * (item.unitCost || 0)),
                lineKey: "",
                costCenterId: null,
                accountId: null,
                locationId: null,
                claveProdServ: item.claveProdServ || "",
                unit: item.unidad || item.claveUnidad || "PZA"
              }));
            }

            if (parsedItems.length === 0) {
              parsedItems = [
                {
                  productId: null,
                  variantId: null,
                  productName: matchedCand.concept || `Gasto desde XML ${docNumber}`,
                  variantTitle: "",
                  quantity: 1,
                  unitCost: matchedCand.total || txAbsAmount,
                  amount: matchedCand.total || txAbsAmount,
                  lineKey: "",
                  costCenterId: null,
                  accountId: null,
                  locationId: null
                }
              ];
            }

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
              items: parsedItems,
              satInvoiceId: evalData.matchedDocId,
              xmlBase64: matchedCand.xmlBase64 || null,
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
              expenseId: targetExpenseId,
              linkedExpenseId: targetExpenseId
            });
          }

          // Outflow
          const outflowId = crypto.randomUUID();
          await setDoc(doc(db, "companies", companyId, "outflows", outflowId), {
            id: outflowId,
            amount: txAbsAmount,
            date: txDate,
            method: defaultPaymentMethod,
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
            bankAccountInfo.name || currentBankAccount.name || currentBankAccount.Name || "Banco",
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
            method: defaultPaymentMethod,
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
