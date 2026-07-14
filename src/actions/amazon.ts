"use server";

import { adminDb, admin } from "@/lib/firebase/admin";
import { AmazonSPClient, AmazonClientConfig } from "@/lib/amazon/client";

export interface AmazonSettings {
  sellerId: string;
  marketplaceId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  region: "na" | "eu" | "fe";
  isActive: boolean;
  syncOrders: boolean;
  syncInventory: boolean;
}

// --- Logging Helpers ---
async function logServerInvocation(actionName: string, companyId: string, details?: any) {
  try {
    if (adminDb) {
      await adminDb.collection("server_invocations").add({
        actionName,
        companyId,
        details: details ? JSON.stringify(details) : null,
        timestamp: new Date().toISOString()
      });
    }
  } catch (e) {
    console.error("Failed to log server invocation:", e);
  }
}

async function logServerError(actionName: string, error: any, companyId?: string) {
  try {
    if (adminDb) {
      await adminDb.collection("server_errors").add({
        actionName,
        companyId: companyId || "unknown",
        message: error.message || "Unknown error",
        stack: error.stack || "",
        timestamp: new Date().toISOString()
      });
    }
  } catch (e) {
    console.error("Failed to log server error:", e);
  }
}

// --- Helpers to match product docs ---
async function findExistingProductDoc(
  productsCol: any,
  skus: string[]
): Promise<any | null> {
  try {
    const safeSkus = skus.filter(sku => sku && sku.trim() !== "").slice(0, 30);
    if (safeSkus.length > 0) {
      for (const sku of safeSkus) {
        const docRef = productsCol.doc(sku);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          return docSnap;
        }
      }

      const [qSku, qCode] = await Promise.all([
        productsCol.where("SKU", "in", safeSkus).limit(1).get(),
        productsCol.where("Code", "in", safeSkus).limit(1).get()
      ]);

      if (!qSku.empty) return qSku.docs[0];
      if (!qCode.empty) return qCode.docs[0];
    }
  } catch (err) {
    console.error("Error in findExistingProductDoc for Amazon SKU:", err);
  }
  return null;
}

// --- Settings Operations ---
export async function getAmazonSettings(companyId: string): Promise<AmazonSettings | null> {
  await logServerInvocation("getAmazonSettings", companyId);
  if (!adminDb) return null;
  try {
    const docSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("credentials")
      .doc("amazon")
      .get();

    if (docSnap.exists) {
      return docSnap.data() as AmazonSettings;
    }
    return null;
  } catch (error: any) {
    await logServerError("getAmazonSettings", error, companyId);
    return null;
  }
}

export async function saveAmazonSettings(
  companyId: string,
  settings: AmazonSettings
): Promise<{ success: boolean; error?: string }> {
  await logServerInvocation("saveAmazonSettings", companyId, { sellerId: settings.sellerId });
  if (!adminDb) {
    return { success: false, error: "Firebase Admin is not configured" };
  }
  try {
    await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("credentials")
      .doc("amazon")
      .set(settings, { merge: true });

    return { success: true };
  } catch (error: any) {
    await logServerError("saveAmazonSettings", error, companyId);
    return { success: false, error: error.message || "Failed to save settings" };
  }
}

// --- Connection Test ---
export async function testAmazonConnection(
  settings: AmazonSettings
): Promise<{ success: boolean; error?: string }> {
  await logServerInvocation("testAmazonConnection", "none", { sellerId: settings.sellerId });
  try {
    const client = new AmazonSPClient({
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      refreshToken: settings.refreshToken,
      region: settings.region
    });

    // Probar pidiendo órdenes vacías de prueba o simplemente solicitando token de LWA
    // Hacemos una llamada con limite muy bajo
    await client.getOrders({
      MarketplaceIds: [settings.marketplaceId],
      MaxResultsPerPage: 1,
      CreatedAfter: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    return { success: true };
  } catch (error: any) {
    await logServerError("testAmazonConnection", error, "none");
    return { success: false, error: error.message || "Error al conectar con Amazon SP-API." };
  }
}

// --- Sync Orders ---
export async function syncOrdersFromAmazon(
  companyId: string,
  daysBack: number = 7
): Promise<{ success: boolean; count?: number; error?: string }> {
  await logServerInvocation("syncOrdersFromAmazon", companyId, { daysBack });
  if (!adminDb) return { success: false, error: "Firebase Admin is not configured" };

  try {
    const settings = await getAmazonSettings(companyId);
    if (!settings || !settings.isActive || !settings.clientId || !settings.clientSecret || !settings.refreshToken) {
      return { success: false, error: "La integración con Amazon no está activa o configurada." };
    }

    const client = new AmazonSPClient({
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      refreshToken: settings.refreshToken,
      region: settings.region
    });

    // 1. Resolver Sucursal "Amazon"
    const locationsCol = adminDb.collection("companies").doc(companyId).collection("locations");
    const locSnap = await locationsCol.get();
    let amazonLocationId = "";
    let amazonLocationName = "Amazon";

    const existingAmazonLoc = locSnap.docs.find(d => {
      const name = d.data().name || d.data().Name || "";
      return name.toLowerCase().trim() === "amazon";
    });

    if (existingAmazonLoc) {
      amazonLocationId = existingAmazonLoc.id;
      amazonLocationName = existingAmazonLoc.data().name || existingAmazonLoc.data().Name || "Amazon";
    } else {
      // Crear sucursal de Amazon si no existe
      amazonLocationId = "amazon-location";
      await locationsCol.doc(amazonLocationId).set({
        name: "Amazon",
        address: "Amazon Seller Central",
        warehouses: [
          { id: "amazon-default-warehouse", name: "Almacén Principal Amazon" }
        ],
        businessLineId: "",
        channelType: "digital"
      });
    }

    // 2. Traer órdenes
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - daysBack);
    const createdAfter = minDate.toISOString();

    const response = await client.getOrders({
      MarketplaceIds: [settings.marketplaceId],
      CreatedAfter: createdAfter,
      MaxResultsPerPage: 100
    });

    const amazonOrders = response.Orders || [];
    if (amazonOrders.length === 0) {
      return { success: true, count: 0 };
    }

    const remisionesCol = adminDb.collection("companies").doc(companyId).collection("remisiones");
    const productsCol = adminDb.collection("companies").doc(companyId).collection("products");
    let importedCount = 0;

    for (const order of amazonOrders) {
      const orderId = order.AmazonOrderId;
      
      // Saltar si el pedido ya existe en remisiones
      const existingRem = await remisionesCol.doc(orderId).get();
      if (existingRem.exists) {
        continue;
      }

      // Evitar procesar pedidos pendientes que aún no están confirmados
      if (order.OrderStatus === "Pending") {
        continue;
      }

      // Obtener ítems del pedido
      const itemsResponse = await client.getOrderItems(orderId);
      const orderItems = itemsResponse.OrderItems || [];
      const mappedItems = [];

      for (const item of orderItems) {
        const sellerSku = item.SellerSKU || "";
        const existingDoc = await findExistingProductDoc(productsCol, [sellerSku]);
        const erpProductId = existingDoc ? existingDoc.id : "";

        const unitPrice = item.ItemPrice ? (parseFloat(item.ItemPrice.Amount || "0") / (item.QuantityOrdered || 1)) : 0;

        mappedItems.push({
          productId: erpProductId,
          variantId: "",
          productName: item.Title || "Producto Amazon",
          variantTitle: "",
          quantity: item.QuantityOrdered || 1,
          unitPrice: unitPrice,
          discountPercentage: 0,
          imageUrl: ""
        });
      }

      const totalAmount = parseFloat(order.OrderTotal?.Amount || "0");
      const subtotal = totalAmount; // Para simplificar, o desglosar de los ítems

      const remissionData = {
        id: orderId,
        companyId,
        remissionNumber: `Amz-${orderId}`,
        orderId: null,
        orderNumber: `AMAZON-${orderId}`,
        clientName: order.BuyerInfo?.BuyerName || order.BuyerEmail || "Cliente Amazon",
        items: mappedItems,
        totalAmount: totalAmount,
        subtotal: subtotal,
        tax: 0,
        paidAmount: order.OrderStatus === "Canceled" ? 0 : totalAmount,
        paymentStatus: order.OrderStatus === "Canceled" ? "canceled" : "paid",
        locationId: amazonLocationId,
        locationName: amazonLocationName,
        status: order.OrderStatus === "Canceled" ? "cancelada" : "activa",
        createdAt: order.PurchaseDate || new Date().toISOString(),
        createdBy: "Amazon Sync",
        isAmazonSale: true
      };

      await remisionesCol.doc(orderId).set(remissionData);
      importedCount++;

      // Descontar inventario si está activo
      if (settings.syncInventory && orderItems.length > 0) {
        for (const item of orderItems) {
          if (!item.SellerSKU) continue;
          const quantity = item.QuantityOrdered || 1;
          const existingDoc = await findExistingProductDoc(productsCol, [item.SellerSKU]);
          if (existingDoc) {
            const productData = existingDoc.data() || {};
            const variants = productData.variants || [];

            if (variants.length > 0) {
              const updatedVariants = variants.map((v: any) => {
                if (v.sku === item.SellerSKU) {
                  return {
                    ...v,
                    stock: Math.max(0, (v.stock || 0) - quantity)
                  };
                }
                return v;
              });
              await existingDoc.ref.update({
                variants: updatedVariants,
                salesCount: admin.firestore.FieldValue.increment(quantity)
              });
            } else {
              // Producto simple, descontar a nivel raíz si tiene campo de stock
              const currentStock = productData.stock || 0;
              await existingDoc.ref.update({
                stock: Math.max(0, currentStock - quantity),
                salesCount: admin.firestore.FieldValue.increment(quantity)
              });
            }
          }
        }
      }
    }

    // Actualizar fecha de última sincronización
    await adminDb.collection("companies").doc(companyId).collection("credentials").doc("amazon").update({
      lastSyncAt: new Date().toISOString()
    });

    return { success: true, count: importedCount };
  } catch (error: any) {
    await logServerError("syncOrdersFromAmazon", error, companyId);
    return { success: false, error: error.message || "Failed to sync orders from Amazon" };
  }
}
