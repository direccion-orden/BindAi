"use server";

import { adminDb } from "@/lib/firebase/admin";

export interface SearchedClient {
  id: string;
  name: string;
  commercialName?: string;
  email?: string;
  rfc?: string;
  phone?: string;
}

export interface SearchedProductVariant {
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  sku: string;
  price: number;
  stock?: number;
  imageUrl?: string;
}

export interface SearchedLocation {
  id: string;
  name: string;
  address?: string;
  warehouseId?: string;
  warehouseName?: string;
}

export interface OrderDraftItem {
  productId: string;
  variantId: string;
  productName: string;
  variantTitle?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  sku?: string;
  imageUrl?: string;
}

export interface OrderDraft {
  clientId?: string;
  clientName?: string;
  locationId?: string;
  locationName?: string;
  warehouseId?: string;
  warehouseName?: string;
  items: OrderDraftItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
}

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  totalAmount?: number;
  clientName?: string;
  itemsCount?: number;
  error?: string;
}

export interface ProcessOrderInput {
  action?: "create_or_update" | "set_quantity" | "remove_item" | "confirm" | "discard";
  clientQuery?: string;
  locationQuery?: string;
  addProducts?: Array<{ query: string; quantity: number; unitPrice?: number }>;
  itemsToAddOrUpdate?: Array<{ productQuery: string; quantity: number; unitPrice?: number }>;
  setQuantities?: Array<{ itemQuery: string; newQuantity: number }>;
  itemToChangeQuantity?: { itemIdentifier: string; newQuantity: number };
  removeProducts?: string[];
  itemToRemove?: string;
  confirm?: boolean;
  notes?: string;
}

export type ProcessOrderParams = ProcessOrderInput;

export interface ProcessOrderResult {
  status: "updated" | "confirmed" | "discarded" | "error" | "unchanged";
  draft: OrderDraft | null;
  createdOrder?: CreateOrderResult | null;
  summaryText?: string;
  message?: string;
  error?: string;
}

// -------------------------------------------------------------
// IN-MEMORY SERVER CACHE (TTL: 5 MINUTOS PARA VELOCIDAD ULTRA-RÁPIDA)
// -------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000;
const clientsCache = new Map<string, { timestamp: number; docs: any[] }>();
const productsCache = new Map<string, { timestamp: number; docs: any[] }>();
const locationsCache = new Map<string, { timestamp: number; data: SearchedLocation[] }>();

async function getCachedClients(companyId: string) {
  const cached = clientsCache.get(companyId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.docs;
  }
  if (!adminDb) return [];
  const snap = await adminDb.collection("companies").doc(companyId).collection("clients").limit(150).get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  clientsCache.set(companyId, { timestamp: Date.now(), docs });
  return docs;
}

async function getCachedProducts(companyId: string) {
  const cached = productsCache.get(companyId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.docs;
  }
  if (!adminDb) return [];
  const snap = await adminDb.collection("companies").doc(companyId).collection("products").limit(200).get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  productsCache.set(companyId, { timestamp: Date.now(), docs });
  return docs;
}

export async function searchClientsAction(companyId: string, queryText: string): Promise<SearchedClient[]> {
  if (!companyId || !queryText?.trim()) return [];

  try {
    const docs = await getCachedClients(companyId);
    const qLower = queryText.toLowerCase().trim();
    const tokens = qLower.split(/\s+/).filter(Boolean);

    const matches: SearchedClient[] = [];

    for (const data of docs) {
      const name = (data.name || data.LegalName || data.razonSocial || "").toLowerCase();
      const commercial = (data.commercialName || data.CommercialName || "").toLowerCase();
      const rfc = (data.rfc || data.RFC || "").toLowerCase();
      const email = (data.email || "").toLowerCase();

      const combined = `${name} ${commercial} ${rfc} ${email}`;
      const isMatch = tokens.every(t => combined.includes(t));

      if (isMatch) {
        matches.push({
          id: data.id,
          name: data.name || data.LegalName || data.CommercialName || "Cliente",
          commercialName: data.commercialName || data.CommercialName || undefined,
          email: data.email || undefined,
          rfc: data.rfc || data.RFC || undefined,
          phone: data.phone || data.Phone || undefined
        });
      }

      if (matches.length >= 8) break;
    }

    return matches;
  } catch (error) {
    console.error("Error searching clients:", error);
    return [];
  }
}

export async function searchProductsAction(companyId: string, queryText: string): Promise<SearchedProductVariant[]> {
  if (!companyId || !queryText?.trim()) return [];

  try {
    const docs = await getCachedProducts(companyId);
    const qLower = queryText.toLowerCase().trim();
    const tokens = qLower.split(/\s+/).filter(Boolean);

    const results: SearchedProductVariant[] = [];

    for (const prod of docs) {
      const title = (prod.title || "").toLowerCase();
      const tags = Array.isArray(prod.tags) ? prod.tags.join(" ").toLowerCase() : "";
      const prodType = (prod.productType || "").toLowerCase();
      const variants = Array.isArray(prod.variants) ? prod.variants : [];

      for (const v of variants) {
        const varTitle = (v.title || "").toLowerCase();
        const sku = (v.sku || "").toLowerCase();
        const combined = `${title} ${varTitle} ${sku} ${tags} ${prodType}`;

        const isMatch = tokens.every(t => combined.includes(t));
        if (isMatch) {
          results.push({
            productId: prod.id,
            variantId: v.id || prod.id,
            productName: prod.title || "Producto",
            variantTitle: (v.title && v.title !== "Default Title") ? v.title : "",
            sku: v.sku || "",
            price: Number(v.price) || 0,
            stock: v.inventoryQuantity ?? v.stock ?? 0,
            imageUrl: prod.images?.[0]?.src || ""
          });
        }
      }

      if (results.length >= 8) break;
    }

    return results;
  } catch (error) {
    console.error("Error searching products:", error);
    return [];
  }
}

export async function searchLocationsAction(companyId: string, queryText?: string): Promise<SearchedLocation[]> {
  if (!companyId) return [];

  try {
    const cached = locationsCache.get(companyId);
    let allLocations: SearchedLocation[] = [];

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      allLocations = cached.data;
    } else if (adminDb) {
      const locSnap = await adminDb.collection("companies").doc(companyId).collection("locations").get();
      const whSnap = await adminDb.collection("companies").doc(companyId).collection("warehouses").get();

      const warehouses = whSnap.docs.map(d => ({
        id: d.id,
        name: (d.data().name || d.data().Name || "").trim(),
        locationId: d.data().locationId || ""
      }));

      for (const doc of locSnap.docs) {
        const data = doc.data();
        const name = (data.name || data.Name || "Sucursal").trim();
        const address = (data.address || data.Address || "").trim();
        const matchingWh = warehouses.find(w => w.locationId === doc.id || w.name.toLowerCase().includes(name.toLowerCase())) || warehouses[0];

        allLocations.push({
          id: doc.id,
          name,
          address,
          warehouseId: matchingWh?.id,
          warehouseName: matchingWh?.name
        });
      }

      locationsCache.set(companyId, { timestamp: Date.now(), data: allLocations });
    }

    const q = (queryText || "").toLowerCase().trim();
    if (!q) return allLocations;

    return allLocations.filter(l => 
      l.name.toLowerCase().includes(q) || 
      (l.address && l.address.toLowerCase().includes(q)) || 
      l.id.toLowerCase().includes(q)
    );
  } catch (error) {
    console.error("Error searching locations:", error);
    return [];
  }
}

// -------------------------------------------------------------
// COMPOSITE ACTION: PROCESAR EN 1 SOLO PASO ULTRA-RÁPIDO (<150ms)
// -------------------------------------------------------------
export async function processOrderAction(
  companyId: string,
  currentDraft: OrderDraft | null,
  params: ProcessOrderInput,
  userEmail: string = "agente-tracker@bindai.com"
): Promise<ProcessOrderResult> {
  const isConfirm = Boolean(params.confirm || params.action === "confirm");
  const isDiscard = params.action === "discard";

  if (isDiscard) {
    return { status: "discarded", draft: null, summaryText: "Borrador descartado." };
  }

  // 1. Inicializar o clonar borrador
  const draft: OrderDraft = currentDraft
    ? {
        clientId: currentDraft.clientId || "",
        clientName: currentDraft.clientName || "",
        locationId: currentDraft.locationId || "",
        locationName: currentDraft.locationName || "",
        warehouseId: currentDraft.warehouseId || "",
        warehouseName: currentDraft.warehouseName || "",
        items: Array.isArray(currentDraft.items) ? [...currentDraft.items] : [],
        subtotal: Number(currentDraft.subtotal) || 0,
        tax: Number(currentDraft.tax) || 0,
        total: Number(currentDraft.total) || 0,
        notes: currentDraft.notes || ""
      }
    : {
        clientId: "",
        clientName: "",
        locationId: "",
        locationName: "",
        warehouseId: "",
        warehouseName: "",
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        notes: ""
      };

  // 2. Normalizar productos a buscar
  const itemsToFind: Array<{ productQuery: string; quantity: number; unitPrice?: number }> = [];
  if (Array.isArray(params.addProducts)) {
    for (const p of params.addProducts) {
      if (p.query?.trim()) {
        itemsToFind.push({ productQuery: p.query.trim(), quantity: Number(p.quantity) || 1, unitPrice: p.unitPrice });
      }
    }
  }
  if (Array.isArray(params.itemsToAddOrUpdate)) {
    for (const p of params.itemsToAddOrUpdate) {
      if (p.productQuery?.trim()) {
        itemsToFind.push({ productQuery: p.productQuery.trim(), quantity: Number(p.quantity) || 1, unitPrice: p.unitPrice });
      }
    }
  }

  // 3. Ejecutar búsquedas en paralelo (Cliente, Sucursal, Productos)
  const searchPromises: Promise<any>[] = [
    params.clientQuery?.trim() ? searchClientsAction(companyId, params.clientQuery.trim()) : Promise.resolve([]),
    params.locationQuery?.trim() ? searchLocationsAction(companyId, params.locationQuery.trim()) : Promise.resolve([])
  ];

  for (const it of itemsToFind) {
    searchPromises.push(searchProductsAction(companyId, it.productQuery));
  }

  const [clientResults, locationResults, ...productResultsArrays] = await Promise.all(searchPromises);

  // 4. Asignar Cliente
  if (params.clientQuery?.trim()) {
    if (clientResults.length > 0) {
      draft.clientId = clientResults[0].id;
      draft.clientName = clientResults[0].name || clientResults[0].commercialName || "Cliente";
    } else {
      const cName = params.clientQuery.trim();
      draft.clientName = cName;
      draft.clientId = "cli-" + cName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    }
  }

  // 5. Asignar Sucursal
  if (params.locationQuery?.trim()) {
    if (locationResults.length > 0) {
      draft.locationId = locationResults[0].id;
      draft.locationName = locationResults[0].name;
      draft.warehouseId = locationResults[0].warehouseId;
      draft.warehouseName = locationResults[0].warehouseName;
    } else {
      draft.locationName = params.locationQuery.trim();
    }
  }

  // 6. Agregar o actualizar productos
  for (let i = 0; i < itemsToFind.length; i++) {
    const itemReq = itemsToFind[i];
    const matches = (productResultsArrays[i] || []) as SearchedProductVariant[];
    const qty = Number(itemReq.quantity) || 1;

    let prodId = `custom-${crypto.randomUUID().slice(0, 8)}`;
    let varId = prodId;
    let prodName = itemReq.productQuery;
    let varTitle = "";
    let price = Number(itemReq.unitPrice) || 0;
    let sku = "";
    let img = "";

    if (matches && matches.length > 0) {
      const topMatch = matches[0];
      prodId = topMatch.productId;
      varId = topMatch.variantId;
      prodName = topMatch.productName;
      varTitle = topMatch.variantTitle;
      price = itemReq.unitPrice !== undefined ? Number(itemReq.unitPrice) : topMatch.price;
      sku = topMatch.sku;
      img = topMatch.imageUrl || "";
    }

    const existingIdx = draft.items.findIndex(
      it => (varId && it.variantId === varId) || it.productName.toLowerCase().includes(prodName.toLowerCase())
    );

    if (existingIdx >= 0) {
      draft.items[existingIdx].quantity += qty;
      draft.items[existingIdx].total = draft.items[existingIdx].quantity * draft.items[existingIdx].unitPrice;
    } else {
      draft.items.push({
        productId: prodId,
        variantId: varId,
        productName: prodName,
        variantTitle: varTitle,
        quantity: qty,
        unitPrice: price,
        total: qty * price,
        sku,
        imageUrl: img
      });
    }
  }

  // 7. Cambios de cantidad
  const quantitiesToSet: Array<{ itemQuery: string; newQuantity: number }> = [];
  if (Array.isArray(params.setQuantities)) {
    quantitiesToSet.push(...params.setQuantities);
  }
  if (params.itemToChangeQuantity) {
    quantitiesToSet.push({
      itemQuery: params.itemToChangeQuantity.itemIdentifier,
      newQuantity: params.itemToChangeQuantity.newQuantity
    });
  }

  for (const sq of quantitiesToSet) {
    const ident = (sq.itemQuery || "").toLowerCase().trim();
    const newQty = Number(sq.newQuantity) || 0;
    const foundIdx = draft.items.findIndex(
      it =>
        it.productName.toLowerCase().includes(ident) ||
        (it.variantTitle && it.variantTitle.toLowerCase().includes(ident)) ||
        it.productId === ident ||
        it.variantId === ident
    );

    if (foundIdx >= 0) {
      if (newQty <= 0) {
        draft.items.splice(foundIdx, 1);
      } else {
        draft.items[foundIdx].quantity = newQty;
        draft.items[foundIdx].total = newQty * draft.items[foundIdx].unitPrice;
      }
    }
  }

  // 8. Eliminación de partidas
  const toRemoveList: string[] = [];
  if (Array.isArray(params.removeProducts)) {
    toRemoveList.push(...params.removeProducts);
  }
  if (params.itemToRemove) {
    toRemoveList.push(params.itemToRemove);
  }

  for (const rem of toRemoveList) {
    const ident = rem.toLowerCase().trim();
    draft.items = draft.items.filter(
      it =>
        !it.productName.toLowerCase().includes(ident) &&
        (!it.variantTitle || !it.variantTitle.toLowerCase().includes(ident)) &&
        it.productId !== ident &&
        it.variantId !== ident
    );
  }

  if (params.notes) {
    draft.notes = params.notes;
  }

  // 9. Recalcular subtotales e impuestos
  draft.subtotal = draft.items.reduce((s, it) => s + (it.quantity * it.unitPrice), 0);
  draft.tax = Math.round(draft.subtotal * 0.16 * 100) / 100;
  draft.total = Math.round((draft.subtotal + draft.tax) * 100) / 100;

  // 10. Si se solicitó confirmación
  if (isConfirm) {
    if (!draft.clientId && !draft.clientName) {
      return { 
        status: "error", 
        draft, 
        error: "El pedido requiere un cliente asignado para confirmarse.", 
        message: "El pedido requiere un cliente asignado para confirmarse." 
      };
    }
    if (draft.items.length === 0) {
      return { 
        status: "error", 
        draft, 
        error: "El pedido requiere al menos 1 producto para confirmarse.", 
        message: "El pedido requiere al menos 1 producto para confirmarse." 
      };
    }

    if (!draft.clientId && draft.clientName) {
      draft.clientId = "cli-" + draft.clientName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    }

    const orderRes = await createOrderAction(companyId, draft, userEmail);
    if (orderRes.success) {
      const summary = `Pedido ${orderRes.orderNumber} confirmado con éxito por $${(orderRes.totalAmount || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN.`;
      return { 
        status: "confirmed", 
        draft: null, 
        createdOrder: orderRes, 
        summaryText: summary, 
        message: summary 
      };
    } else {
      return { 
        status: "error", 
        draft, 
        error: orderRes.error || "Error al crear pedido", 
        message: orderRes.error || "Error al crear pedido" 
      };
    }
  }

  const branchNotice = draft.locationName ? ` en sucursal ${draft.locationName}` : "";
  const summary = `Borrador actualizado${branchNotice}. Total con IVA: $${draft.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN.`;
  return { 
    status: "updated", 
    draft, 
    createdOrder: null, 
    summaryText: summary, 
    message: summary 
  };
}

export async function createOrderAction(
  companyId: string,
  draft: OrderDraft,
  userEmail: string = "agente-tracker@bindai.com"
): Promise<CreateOrderResult> {
  if (!adminDb || !companyId) {
    return { success: false, error: "Servicio de base de datos no disponible" };
  }

  if (!draft.clientId && !draft.clientName) {
    return { success: false, error: "El pedido requiere un cliente asignado" };
  }

  if (!draft.items || draft.items.length === 0) {
    return { success: false, error: "El pedido debe contener al menos 1 producto" };
  }

  try {
    const subtotal = draft.items.reduce((acc, it) => acc + (it.quantity * it.unitPrice), 0);
    const tax = Math.round(subtotal * 0.16 * 100) / 100;
    const totalAmount = Math.round((subtotal + tax) * 100) / 100;

    // 0. CERROJO DE IDEMPOTENCIA:
    const sixtySecondsAgo = Date.now() - 60000;
    try {
      const recentOrdersSnap = await adminDb
        .collection("companies")
        .doc(companyId)
        .collection("pedidos")
        .orderBy("createdAt", "desc")
        .limit(5)
        .get();

      for (const doc of recentOrdersSnap.docs) {
        const o = doc.data();
        const createdMs = new Date(o.createdAt).getTime();
        if (createdMs >= sixtySecondsAgo && (o.clientId === draft.clientId || o.clientName === draft.clientName)) {
          if (
            Math.abs((o.totalAmount || 0) - totalAmount) < 0.05 &&
            Array.isArray(o.items) &&
            o.items.length === draft.items.length
          ) {
            console.log(`[Idempotency Lock] Pedido duplicado prevenido. Retornando existente: ${o.orderNumber}`);
            return {
              success: true,
              orderId: doc.id,
              orderNumber: o.orderNumber,
              totalAmount: o.totalAmount,
              clientName: o.clientName || draft.clientName,
              itemsCount: o.items.length
            };
          }
        }
      }
    } catch (idemErr) {
      console.warn("Idempotency check warning:", idemErr);
    }

    // 1. Obtener o resolver sucursal y almacén solicitados
    let locationId = draft.locationId || "";
    let locationName = draft.locationName || "";
    let warehouseId = draft.warehouseId || "";
    let warehouseName = draft.warehouseName || "";

    try {
      const allLocations = await searchLocationsAction(companyId);

      if (locationName || locationId) {
        const match = allLocations.find(l => 
          (locationId && l.id === locationId) ||
          (locationName && l.name.toLowerCase().includes(locationName.toLowerCase())) ||
          (locationName && locationName.toLowerCase().includes(l.name.toLowerCase()))
        );
        if (match) {
          locationId = match.id;
          locationName = match.name;
          warehouseId = match.warehouseId || warehouseId;
          warehouseName = match.warehouseName || warehouseName;
        }
      }

      if (!locationId && allLocations.length > 0) {
        const defaultLoc = allLocations.find(l => 
          l.name.toLowerCase().includes("matriz") || 
          l.name.toLowerCase().includes("principal")
        ) || allLocations[0];
        locationId = defaultLoc.id;
        locationName = defaultLoc.name;
        warehouseId = defaultLoc.warehouseId || warehouseId;
        warehouseName = defaultLoc.warehouseName || warehouseName;
      }
    } catch (locErr) {
      console.warn("Error resolving branch locations:", locErr);
    }

    if (!locationName) locationName = "Sucursal Principal";
    if (!warehouseName) warehouseName = "Almacén Principal";

    // 2. Transacción de secuencia para PED-XXXXX
    const counterRef = adminDb.collection("companies").doc(companyId).collection("counters").doc("sequences");
    const orderNumber = await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(counterRef);
      let currentVal = 0;
      if (snap.exists && snap.data()?.pedidos !== undefined) {
        currentVal = snap.data()?.pedidos;
      }
      const nextVal = currentVal + 1;
      transaction.set(counterRef, { pedidos: nextVal }, { merge: true });
      return `PED-${nextVal.toString().padStart(5, "0")}`;
    });

    const orderId = crypto.randomUUID();
    const orderRef = adminDb.collection("companies").doc(companyId).collection("pedidos").doc(orderId);
    const now = new Date().toISOString();

    await orderRef.set({
      id: orderId,
      orderNumber,
      quoteNumber: null,
      clientId: draft.clientId || "cli-general",
      clientName: draft.clientName || "Cliente",
      items: draft.items.map(it => ({
        productId: it.productId,
        variantId: it.variantId,
        productName: it.productName,
        variantTitle: it.variantTitle || "",
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountPercentage: 0,
        imageUrl: it.imageUrl || "",
        sku: it.sku || "",
        lineKey: it.variantId || it.productId
      })),
      subtotal,
      totalDiscount: 0,
      promoCode: null,
      globalDiscountType: "none",
      globalDiscountValue: 0,
      globalDiscountAmount: 0,
      tax,
      totalAmount,
      projectId: null,
      projectName: null,
      locationId: locationId || "default",
      locationName,
      warehouseId: warehouseId || "default",
      warehouseName,
      accountId: "",
      accountCode: "401.1",
      accountName: "Ventas Nacionales",
      status: "por_surtir",
      notes: draft.notes || "Creado por Agente Tracker vía comandos de voz/asistente",
      createdAt: now,
      createdBy: userEmail
    });

    return {
      success: true,
      orderId,
      orderNumber,
      totalAmount,
      clientName: draft.clientName,
      itemsCount: draft.items.length
    };
  } catch (error: any) {
    console.error("Error creating order:", error);
    return {
      success: false,
      error: error.message || "Error al procesar el pedido"
    };
  }
}

