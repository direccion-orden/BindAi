import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where, Firestore } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ExpenseItemToClassify {
  lineKey?: string;
  productName: string;
  claveProdServ?: string;
  quantity?: number;
  unitCost?: number;
  amount?: number;
  accountId?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  costCenterId?: string | null;
  costCenterName?: string | null;
  [key: string]: any;
}

export interface ClassifiedItemResult {
  lineKey?: string;
  productName: string;
  claveProdServ?: string;
  quantity: number;
  unitCost: number;
  amount: number;
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  costCenterId: string | null;
  costCenterName: string | null;
  confidence: number;
  source: "memory_vendor_item" | "memory_sat_clave" | "memory_item_name" | "memory_vendor_default" | "ai_batch" | "fallback";
  reasoning?: string;
  [key: string]: any;
}

export interface ClassificationRule {
  id: string;
  targetType: "vendor_item" | "sat_clave" | "item_name" | "vendor_default";
  vendorId?: string;
  vendorName?: string;
  claveProdServ?: string;
  productName?: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  costCenterId?: string | null;
  costCenterName?: string | null;
  confidence: number;
  usageCount: number;
  lastUsedAt: string;
  source: "user_edit" | "ai_learned" | "historical";
}

export interface ClassificationMemory {
  accounts: Array<{ id: string; code: string; name: string; type?: string }>;
  costCenters: Array<{ id: string; code: string; name: string; classification?: string }>;
  rulesBySat: Map<string, ClassificationRule>;
  rulesByVendorItem: Map<string, ClassificationRule>;
  rulesByItemName: Map<string, ClassificationRule>;
  rulesByVendor: Map<string, ClassificationRule>;
  accountById: Map<string, { id: string; code: string; name: string }>;
  accountByCode: Map<string, { id: string; code: string; name: string }>;
  costCenterById: Map<string, { id: string; code: string; name: string }>;
}

export function cleanText(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Carga en memoria caché las cuentas contables, centros de costos y el historial
 * de reglas aprendidas de la empresa (se ejecuta 1 sola vez por ciclo).
 */
export async function loadClassificationMemory(
  db: Firestore,
  companyId: string
): Promise<ClassificationMemory> {
  const memory: ClassificationMemory = {
    accounts: [],
    costCenters: [],
    rulesBySat: new Map(),
    rulesByVendorItem: new Map(),
    rulesByItemName: new Map(),
    rulesByVendor: new Map(),
    accountById: new Map(),
    accountByCode: new Map(),
    costCenterById: new Map()
  };

  if (!companyId) return memory;

  try {
    // 1. Cargar Cuentas Contables de Egresos (Gastos 600 y Costos 500)
    const accSnap = await getDocs(collection(db, "companies", companyId, "accounts"));
    const allAccounts = accSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    
    for (const acc of allAccounts) {
      const code = (acc.code || "").trim();
      const name = (acc.name || "").trim();
      const accObj = { id: acc.id, code, name, type: acc.type };
      
      memory.accountById.set(acc.id, accObj);
      if (code) memory.accountByCode.set(code, accObj);

      const isExpenseOrCost =
        acc.type === "GASTOS" ||
        acc.type === "COSTOS" ||
        code.startsWith("60") ||
        code.startsWith("50") ||
        code.startsWith("6") ||
        code.startsWith("5");

      if (isExpenseOrCost) {
        memory.accounts.push(accObj);
      }
    }

    // 2. Cargar Centros de Costos
    const ccSnap = await getDocs(collection(db, "companies", companyId, "cost_centers"));
    for (const d of ccSnap.docs) {
      const data = d.data() as any;
      const ccObj = {
        id: d.id,
        code: data.code || "",
        name: data.name || data.Name || d.id,
        classification: data.classification || ""
      };
      memory.costCenters.push(ccObj);
      memory.costCenterById.set(d.id, ccObj);
    }

    // 3. Cargar Reglas de Clasificación Persistidas
    try {
      const rulesSnap = await getDocs(collection(db, "companies", companyId, "expense_classification_rules"));
      rulesSnap.forEach(d => {
        const r = { id: d.id, ...d.data() } as ClassificationRule;
        if (r.claveProdServ) {
          memory.rulesBySat.set(r.claveProdServ.trim(), r);
        }
        if (r.vendorId && r.productName) {
          memory.rulesByVendorItem.set(`${r.vendorId}_${cleanText(r.productName)}`, r);
        }
        if (r.productName && !r.vendorId) {
          memory.rulesByItemName.set(cleanText(r.productName), r);
        }
        if (r.vendorId && r.targetType === "vendor_default") {
          memory.rulesByVendor.set(r.vendorId, r);
        }
      });
    } catch (e) {
      console.warn("No se pudieron cargar expense_classification_rules:", e);
    }

    // 4. Cargar Vendors con defaults configurados
    try {
      const vendorsSnap = await getDocs(collection(db, "companies", companyId, "vendors"));
      vendorsSnap.forEach(d => {
        const v = d.data() as any;
        if (v.defaultAccountId || v.defaultCostCenterId) {
          const acc = memory.accountById.get(v.defaultAccountId);
          const cc = memory.costCenterById.get(v.defaultCostCenterId);
          if (!memory.rulesByVendor.has(d.id) && (acc || cc)) {
            memory.rulesByVendor.set(d.id, {
              id: `vendor_${d.id}_default`,
              targetType: "vendor_default",
              vendorId: d.id,
              vendorName: v.name || "",
              accountId: acc?.id || "",
              accountCode: acc?.code || "",
              accountName: acc?.name || "",
              costCenterId: cc?.id || null,
              costCenterName: cc?.name || null,
              confidence: 0.85,
              usageCount: 1,
              lastUsedAt: new Date().toISOString(),
              source: "historical"
            });
          }
        }
      });
    } catch (e) {
      console.warn("No se pudieron cargar vendors defaults:", e);
    }

    // 5. Arranque en frío (Cold-Start): Si hay pocas reglas, escanear los últimos 40 gastos formalizados
    if (memory.rulesBySat.size < 5 && memory.rulesByVendorItem.size < 5) {
      try {
        const recentExpensesQuery = query(
          collection(db, "companies", companyId, "expenses"),
          where("status", "!=", "cancelled"),
          orderBy("createdAt", "desc"),
          limit(40)
        );
        const recentSnap = await getDocs(recentExpensesQuery);
        recentSnap.forEach(d => {
          const exp = d.data() as any;
          const vId = exp.vendorId;
          const items = Array.isArray(exp.items) ? exp.items : [];

          for (const item of items) {
            const accId = item.accountId || exp.accountId;
            const ccId = item.costCenterId || exp.costCenterId;
            const claveSat = (item.claveProdServ || "").trim();
            const pName = (item.productName || item.concept || "").trim();
            const accObj = accId ? memory.accountById.get(accId) : null;
            const ccObj = ccId ? memory.costCenterById.get(ccId) : null;

            if (accObj) {
              const rule: ClassificationRule = {
                id: `hist_${d.id}_${item.lineKey || Math.random()}`,
                targetType: claveSat ? "sat_clave" : "item_name",
                vendorId: vId,
                claveProdServ: claveSat || undefined,
                productName: pName || undefined,
                accountId: accObj.id,
                accountCode: accObj.code,
                accountName: accObj.name,
                costCenterId: ccObj?.id || null,
                costCenterName: ccObj?.name || null,
                confidence: 0.80,
                usageCount: 1,
                lastUsedAt: exp.date || new Date().toISOString(),
                source: "historical"
              };

              if (claveSat && !memory.rulesBySat.has(claveSat)) {
                memory.rulesBySat.set(claveSat, rule);
              }
              if (vId && pName && !memory.rulesByVendorItem.has(`${vId}_${cleanText(pName)}`)) {
                memory.rulesByVendorItem.set(`${vId}_${cleanText(pName)}`, rule);
              }
              if (pName && !memory.rulesByItemName.has(cleanText(pName))) {
                memory.rulesByItemName.set(cleanText(pName), rule);
              }
            }
          }
        });
      } catch (e) {
        console.warn("Cold start de gastos históricos no completado:", e);
      }
    }
  } catch (err) {
    console.error("Error en loadClassificationMemory:", err);
  }

  return memory;
}

/**
 * Clasifica una partida en memoria local (0ms, $0)
 */
export function classifyItemLocally(
  item: ExpenseItemToClassify,
  vendorId: string | undefined,
  memory: ClassificationMemory
): ClassifiedItemResult | null {
  const pNameClean = cleanText(item.productName || "");
  const claveSat = (item.claveProdServ || "").trim();

  // 1. Coincidencia por Proveedor + Ítem exacto
  if (vendorId && pNameClean) {
    const key = `${vendorId}_${pNameClean}`;
    const rule = memory.rulesByVendorItem.get(key);
    if (rule) {
      return {
        lineKey: item.lineKey,
        productName: item.productName,
        claveProdServ: claveSat,
        quantity: item.quantity || 1,
        unitCost: item.unitCost || 0,
        amount: item.amount || (item.quantity || 1) * (item.unitCost || 0),
        accountId: rule.accountId,
        accountCode: rule.accountCode,
        accountName: rule.accountName,
        costCenterId: rule.costCenterId || null,
        costCenterName: rule.costCenterName || null,
        confidence: 0.95,
        source: "memory_vendor_item",
        reasoning: `Clasificado por historial previo de este producto en el proveedor`
      };
    }
  }

  // 2. Coincidencia por Clave SAT específica
  if (claveSat && memory.rulesBySat.has(claveSat)) {
    const rule = memory.rulesBySat.get(claveSat)!;
    return {
      lineKey: item.lineKey,
      productName: item.productName,
      claveProdServ: claveSat,
      quantity: item.quantity || 1,
      unitCost: item.unitCost || 0,
      amount: item.amount || (item.quantity || 1) * (item.unitCost || 0),
      accountId: rule.accountId,
      accountCode: rule.accountCode,
      accountName: rule.accountName,
      costCenterId: rule.costCenterId || null,
      costCenterName: rule.costCenterName || null,
      confidence: 0.92,
      source: "memory_sat_clave",
      reasoning: `Clasificado por Clave SAT ${claveSat} aprendida previamente`
    };
  }

  // 3. Coincidencia por Nombre de Producto genérico
  if (pNameClean && memory.rulesByItemName.has(pNameClean)) {
    const rule = memory.rulesByItemName.get(pNameClean)!;
    return {
      lineKey: item.lineKey,
      productName: item.productName,
      claveProdServ: claveSat,
      quantity: item.quantity || 1,
      unitCost: item.unitCost || 0,
      amount: item.amount || (item.quantity || 1) * (item.unitCost || 0),
      accountId: rule.accountId,
      accountCode: rule.accountCode,
      accountName: rule.accountName,
      costCenterId: rule.costCenterId || null,
      costCenterName: rule.costCenterName || null,
      confidence: 0.88,
      source: "memory_item_name",
      reasoning: `Clasificado por concepto coincidente "${item.productName}"`
    };
  }

  // 4. Coincidencia por Proveedor Default (si existe)
  if (vendorId && memory.rulesByVendor.has(vendorId)) {
    const rule = memory.rulesByVendor.get(vendorId)!;
    return {
      lineKey: item.lineKey,
      productName: item.productName,
      claveProdServ: claveSat,
      quantity: item.quantity || 1,
      unitCost: item.unitCost || 0,
      amount: item.amount || (item.quantity || 1) * (item.unitCost || 0),
      accountId: rule.accountId,
      accountCode: rule.accountCode,
      accountName: rule.accountName,
      costCenterId: rule.costCenterId || null,
      costCenterName: rule.costCenterName || null,
      confidence: 0.80,
      source: "memory_vendor_default",
      reasoning: `Clasificado por configuración por defecto del proveedor`
    };
  }

  return null;
}

/**
 * Clasifica una lista completa de partidas de un gasto/factura (ej. Home Depot con múltiples ítems).
 * Primero resuelve en memoria local. Si quedan ítems desconocidos, hace 1 llamada unificada a Gemini Flash.
 */
export async function classifyExpenseItemsBatch(
  items: ExpenseItemToClassify[],
  vendorInfo: { id?: string; name?: string; rfc?: string },
  memory: ClassificationMemory,
  geminiApiKey?: string
): Promise<ClassifiedItemResult[]> {
  if (!items || items.length === 0) return [];

  const results: ClassifiedItemResult[] = [];
  const unresolvedIndices: number[] = [];

  // Paso 1: Resolver lo que ya se conoce en memoria local
  for (let i = 0; i < items.length; i++) {
    const local = classifyItemLocally(items[i], vendorInfo.id, memory);
    if (local) {
      results.push(local);
    } else {
      unresolvedIndices.push(i);
      results.push({
        lineKey: items[i].lineKey,
        productName: items[i].productName || "Concepto SAT",
        claveProdServ: items[i].claveProdServ || "",
        quantity: items[i].quantity || 1,
        unitCost: items[i].unitCost || 0,
        amount: items[i].amount || (items[i].quantity || 1) * (items[i].unitCost || 0),
        accountId: null,
        accountCode: null,
        accountName: null,
        costCenterId: null,
        costCenterName: null,
        confidence: 0,
        source: "fallback"
      });
    }
  }

  // Paso 2: Si todo se resolvió en memoria, retornar de inmediato (0ms extra)
  if (unresolvedIndices.length === 0 || !geminiApiKey) {
    applyFallbackToUnresolved(results, memory);
    return results;
  }

  // Paso 3: Clasificar las partidas pendientes con Gemini 2.5 Flash en UN SOLO PROMPT
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const accountsSummary = memory.accounts.map(a => ({ code: a.code, name: a.name }));
    const ccSummary = memory.costCenters.map(c => ({ id: c.id, code: c.code, name: c.name, type: c.classification }));

    const unresolvedItemsPayload = unresolvedIndices.map(idx => ({
      index: idx,
      productName: items[idx].productName,
      claveProdServ: items[idx].claveProdServ,
      amount: items[idx].amount
    }));

    const prompt = `
Eres un Contador y Auditor Financiero de Inteligencia Artificial.
Clasifica contablemente las siguientes partidas de gasto emitidas por el proveedor "${vendorInfo.name || 'Comercio'}" (RFC: ${vendorInfo.rfc || 'N/A'}).

REGLAS CRÍTICAS DE CLASIFICACIÓN:
1. Revisa cada partida individualmente: en tiendas como Home Depot, Costco o Amazon, una partida puede ser un Gasto Operativo (600 - Mantenimiento, Papelería, Aseo, etc.) y otra partida puede ser Costo Directo o Mercancías (500 - Costo de Ventas/Producción).
2. Selecciona la cuenta más idónea ÚNICAMENTE de la siguiente lista de Cuentas Contables activas:
${JSON.stringify(accountsSummary.slice(0, 40), null, 2)}

3. Selecciona el Centro de Costos más adecuado de la siguiente lista (o null si es general):
${JSON.stringify(ccSummary, null, 2)}

PARTIDAS A CLASIFICAR:
${JSON.stringify(unresolvedItemsPayload, null, 2)}

Devuelve estrictamente un objeto JSON con el siguiente formato:
{
  "classifications": [
    {
      "index": número de índice original,
      "accountCode": "código de cuenta contable seleccionado de la lista",
      "costCenterId": "ID de centro de costos o null",
      "reasoning": "Breve explicación en español de por qué pertenece a esta cuenta y centro de costo"
    }
  ]
}
`;

    const response = await model.generateContent(prompt);
    let text = response.response.text().trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }
    const aiData = JSON.parse(text);

    if (Array.isArray(aiData.classifications)) {
      for (const itemAi of aiData.classifications) {
        const idx = itemAi.index;
        if (idx !== undefined && results[idx]) {
          const acc = memory.accountByCode.get(itemAi.accountCode);
          const cc = itemAi.costCenterId ? memory.costCenterById.get(itemAi.costCenterId) : null;

          if (acc) {
            results[idx].accountId = acc.id;
            results[idx].accountCode = acc.code;
            results[idx].accountName = acc.name;
            results[idx].costCenterId = cc?.id || null;
            results[idx].costCenterName = cc?.name || null;
            results[idx].confidence = 0.90;
            results[idx].source = "ai_batch";
            results[idx].reasoning = itemAi.reasoning || "Clasificado por análisis contextual de Gemini";

            // Registrar en memoria viva para próximas partidas idénticas
            const pName = items[idx].productName;
            const claveSat = items[idx].claveProdServ;
            const newRule: ClassificationRule = {
              id: `live_${Date.now()}_${idx}`,
              targetType: claveSat ? "sat_clave" : "item_name",
              vendorId: vendorInfo.id,
              claveProdServ: claveSat,
              productName: pName,
              accountId: acc.id,
              accountCode: acc.code,
              accountName: acc.name,
              costCenterId: cc?.id || null,
              costCenterName: cc?.name || null,
              confidence: 0.88,
              usageCount: 1,
              lastUsedAt: new Date().toISOString(),
              source: "ai_learned"
            };
            if (claveSat) memory.rulesBySat.set(claveSat, newRule);
            if (vendorInfo.id && pName) memory.rulesByVendorItem.set(`${vendorInfo.id}_${cleanText(pName)}`, newRule);
          }
        }
      }
    }
  } catch (err) {
    console.warn("Fallo en clasificación batch con Gemini:", err);
  }

  applyFallbackToUnresolved(results, memory);
  return results;
}

/**
 * Para ítems que no tuvieron coincidencia ni IA, aplica la cuenta de gastos generales disponible
 */
function applyFallbackToUnresolved(results: ClassifiedItemResult[], memory: ClassificationMemory) {
  const defaultAcc =
    memory.accountByCode.get("601.01") ||
    memory.accounts.find(a => a.code.startsWith("601")) ||
    memory.accounts.find(a => a.code.startsWith("60")) ||
    memory.accounts[0] ||
    null;

  for (const r of results) {
    if (!r.accountId && defaultAcc) {
      r.accountId = defaultAcc.id;
      r.accountCode = defaultAcc.code;
      r.accountName = defaultAcc.name;
      r.source = "fallback";
      r.confidence = 0.5;
    }
  }
}

/**
 * Clasifica un gasto provisional (solo concepto bancario y monto, sin partidas XML)
 */
export async function classifyProvisionalExpense(
  concept: string,
  amount: number,
  vendorInfo: { id?: string; name?: string; rfc?: string },
  memory: ClassificationMemory,
  geminiApiKey?: string
): Promise<{
  accountId: string | null;
  accountCode: string;
  accountName: string;
  costCenterId: string | null;
  costCenterName: string | null;
  reasoning: string;
}> {
  // 1. Si el vendor ya tiene regla general en memoria
  if (vendorInfo.id && memory.rulesByVendor.has(vendorInfo.id)) {
    const rule = memory.rulesByVendor.get(vendorInfo.id)!;
    return {
      accountId: rule.accountId,
      accountCode: rule.accountCode,
      accountName: rule.accountName,
      costCenterId: rule.costCenterId || null,
      costCenterName: rule.costCenterName || null,
      reasoning: "Asignado por preferencia y memoria histórica del proveedor"
    };
  }

  // 2. Si hay API key de Gemini, predecir con el catálogo real
  if (geminiApiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      const prompt = `
Eres un Contador Experto. Clasifica contablemente este movimiento bancario de egreso sin factura CFDI:
- Concepto bancario: "${concept}"
- Comercio/Proveedor: "${vendorInfo.name || 'Desconocido'}"
- Monto: $${Math.abs(amount).toFixed(2)} MXN

CATÁLOGO DE CUENTAS DE GASTO:
${JSON.stringify(memory.accounts.slice(0, 30).map(a => ({ code: a.code, name: a.name })), null, 2)}

CATÁLOGO DE CENTROS DE COSTOS:
${JSON.stringify(memory.costCenters.map(c => ({ id: c.id, code: c.code, name: c.name, type: c.classification })), null, 2)}

Devuelve estrictamente un JSON:
{
  "accountCode": "código de cuenta seleccionado de la lista",
  "costCenterId": "ID de centro de costos o null",
  "reasoning": "Breve justificación contable"
}
`;
      const res = await model.generateContent(prompt);
      let text = res.response.text().trim();
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }
      const data = JSON.parse(text);
      const acc = memory.accountByCode.get(data.accountCode);
      const cc = data.costCenterId ? memory.costCenterById.get(data.costCenterId) : null;

      if (acc) {
        return {
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          costCenterId: cc?.id || null,
          costCenterName: cc?.name || null,
          reasoning: data.reasoning || "Predicho por IA con el catálogo contable de la empresa"
        };
      }
    } catch (e) {
      console.warn("Fallo en Gemini provisional:", e);
    }
  }

  // 3. Fallback inteligente
  const defaultAcc =
    memory.accountByCode.get("601.01") ||
    memory.accounts.find(a => a.code.startsWith("601")) ||
    memory.accounts[0];

  return {
    accountId: defaultAcc?.id || null,
    accountCode: defaultAcc?.code || "601.01",
    accountName: defaultAcc?.name || "Gastos Generales",
    costCenterId: null,
    costCenterName: null,
    reasoning: "Cuenta general asignada por regla por defecto"
  };
}

/**
 * Persiste el aprendizaje en Firestore (Feedback Loop) cuando el usuario edita o formaliza gastos.
 */
export async function recordClassificationLearning(
  db: Firestore,
  companyId: string,
  ruleUpdates: Array<{
    vendorId?: string;
    vendorName?: string;
    claveProdServ?: string;
    productName?: string;
    accountId: string;
    costCenterId?: string | null;
  }>
): Promise<void> {
  if (!companyId || !ruleUpdates || ruleUpdates.length === 0) return;

  try {
    for (const update of ruleUpdates) {
      if (!update.accountId) continue;

      // Obtener datos de la cuenta
      let accCode = "";
      let accName = "";
      try {
        const accDoc = await getDoc(doc(db, "companies", companyId, "accounts", update.accountId));
        if (accDoc.exists()) {
          accCode = accDoc.data()?.code || "";
          accName = accDoc.data()?.name || "";
        }
      } catch (e) {
        // Ignorar si falla lectura
      }

      // Obtener datos del centro de costos
      let ccName = "";
      if (update.costCenterId) {
        try {
          const ccDoc = await getDoc(doc(db, "companies", companyId, "cost_centers", update.costCenterId));
          if (ccDoc.exists()) {
            ccName = ccDoc.data()?.name || "";
          }
        } catch (e) {}
      }

      const now = new Date().toISOString();

      // Regla por Clave SAT si existe
      if (update.claveProdServ && update.claveProdServ.trim().length >= 4) {
        const cleanSat = update.claveProdServ.trim();
        const ruleId = `sat_${cleanSat}`;
        await setDoc(
          doc(db, "companies", companyId, "expense_classification_rules", ruleId),
          {
            id: ruleId,
            targetType: "sat_clave",
            claveProdServ: cleanSat,
            vendorId: update.vendorId || null,
            productName: update.productName || null,
            accountId: update.accountId,
            accountCode: accCode,
            accountName: accName,
            costCenterId: update.costCenterId || null,
            costCenterName: ccName || null,
            confidence: 0.95,
            usageCount: 1,
            lastUsedAt: now,
            source: "user_edit"
          },
          { merge: true }
        );
      }

      // Regla por Ítem de Proveedor si existe producto
      if (update.vendorId && update.productName) {
        const cleanPName = cleanText(update.productName);
        if (cleanPName) {
          const ruleId = `vi_${update.vendorId}_${cleanPName.slice(0, 40).replace(/\s+/g, "_")}`;
          await setDoc(
            doc(db, "companies", companyId, "expense_classification_rules", ruleId),
            {
              id: ruleId,
              targetType: "vendor_item",
              vendorId: update.vendorId,
              vendorName: update.vendorName || null,
              productName: update.productName,
              accountId: update.accountId,
              accountCode: accCode,
              accountName: accName,
              costCenterId: update.costCenterId || null,
              costCenterName: ccName || null,
              confidence: 0.95,
              usageCount: 1,
              lastUsedAt: now,
              source: "user_edit"
            },
            { merge: true }
          );
        }
      }

      // Actualizar defaults del proveedor
      if (update.vendorId) {
        try {
          await setDoc(
            doc(db, "companies", companyId, "vendors", update.vendorId),
            {
              defaultAccountId: update.accountId,
              defaultCostCenterId: update.costCenterId || null
            },
            { merge: true }
          );
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error("Error al registrar aprendizaje de clasificación:", err);
  }
}
