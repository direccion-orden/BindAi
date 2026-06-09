"use server";

import { adminDb } from "@/lib/firebase/admin";
import { ShopifyClient } from "@/lib/shopify/client";

export interface ShopifySettings {
  shopName: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  webhookSecret: string;
  isActive: boolean;
  syncInventory: boolean;
  syncOrders: boolean;
  locationMappings: Record<string, string>; // Shopify Location ID -> ERP Warehouse ID
}

// --- Logging Helpers for Diagnostics ---
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
    console.error("Failed to log server invocation to firestore:", e);
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
    console.error("Failed to log server error to firestore:", e);
  }
}

// --- Settings Operations ---

export async function getShopifySettings(companyId: string): Promise<ShopifySettings | null> {
  await logServerInvocation("getShopifySettings", companyId);
  if (!adminDb) {
    await logServerError("getShopifySettings", new Error("adminDb is null"), companyId);
    return null;
  }
  try {
    const docSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("credentials")
      .doc("shopify")
      .get();

    if (docSnap.exists) {
      return docSnap.data() as ShopifySettings;
    }
    return null;
  } catch (error: any) {
    console.error("Error fetching Shopify settings:", error);
    await logServerError("getShopifySettings", error, companyId);
    return null;
  }
}

export async function saveShopifySettings(
  companyId: string,
  settings: ShopifySettings
): Promise<{ success: boolean; error?: string }> {
  await logServerInvocation("saveShopifySettings", companyId, { shopName: settings.shopName });
  if (!adminDb) {
    await logServerError("saveShopifySettings", new Error("adminDb is null"), companyId);
    return { success: false, error: "Firebase Admin is not configured" };
  }
  try {
    await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("credentials")
      .doc("shopify")
      .set(settings, { merge: true });

    return { success: true };
  } catch (error: any) {
    console.error("Error saving Shopify settings:", error);
    await logServerError("saveShopifySettings", error, companyId);
    return { success: false, error: error.message || "Failed to save settings" };
  }
}

// --- Connection Test ---

export async function testShopifyConnection(
  shopName: string,
  accessToken?: string,
  clientId?: string,
  clientSecret?: string
): Promise<{ success: boolean; locations?: any[]; error?: string }> {
  await logServerInvocation("testShopifyConnection", "none", { shopName });
  try {
    const client = new ShopifyClient({ shopName, accessToken, clientId, clientSecret });
    const response = await client.getLocations();
    return { success: true, locations: response.locations };
  } catch (error: any) {
    console.error("Error testing Shopify connection:", error);
    await logServerError("testShopifyConnection", error, "none");
    return { success: false, error: error.message || "Connection failed. Please check credentials." };
  }
}

// --- Register Webhooks ---

export async function registerShopifyWebhooksAction(
  companyId: string,
  publicAppUrl: string
): Promise<{ success: boolean; registered?: string[]; error?: string }> {
  if (!adminDb) return { success: false, error: "Firebase Admin is not configured" };
  try {
    const settings = await getShopifySettings(companyId);
    if (!settings || !settings.shopName || (!settings.accessToken && (!settings.clientId || !settings.clientSecret))) {
      return { success: false, error: "Shopify settings are not configured or missing credentials." };
    }

    const client = new ShopifyClient({
      shopName: settings.shopName,
      accessToken: settings.accessToken,
      clientId: settings.clientId,
      clientSecret: settings.clientSecret
    });

    const webhooksToRegister = [
      { topic: "products/create", path: "/api/webhooks/shopify" },
      { topic: "products/update", path: "/api/webhooks/shopify" },
      { topic: "products/delete", path: "/api/webhooks/shopify" },
      { topic: "orders/create", path: "/api/webhooks/shopify" }
    ];

    // Get current registered webhooks to avoid duplicates
    const currentWebhooksRes = await client.getWebhooks();
    const currentWebhooks = currentWebhooksRes.webhooks || [];
    const registeredTopics: string[] = [];

    for (const item of webhooksToRegister) {
      const webhookUrl = `${publicAppUrl}${item.path}?companyId=${companyId}`;
      const exists = currentWebhooks.some(
        (wh) => wh.topic === item.topic && wh.address === webhookUrl
      );

      if (!exists) {
        await client.createWebhook(item.topic, webhookUrl);
        registeredTopics.push(item.topic);
      } else {
        registeredTopics.push(`${item.topic} (already registered)`);
      }
    }

    return { success: true, registered: registeredTopics };
  } catch (error: any) {
    console.error("Error registering Shopify webhooks:", error);
    return { success: false, error: error.message || "Failed to register webhooks" };
  }
}

// --- Bulk Product Import / Sync ---

async function findExistingProductDoc(
  productsCol: any,
  shopifyProductId: string,
  skus: string[]
): Promise<any | null> {
  try {
    // 1. Direct Shopify ID check as document ID
    const docRef = productsCol.doc(shopifyProductId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return docSnap;
    }

    // 2. Check if shopifyId field matches in other documents
    const qShopifyId = await productsCol.where("shopifyId", "==", shopifyProductId).limit(1).get();
    if (!qShopifyId.empty) {
      return qShopifyId.docs[0];
    }

    // 3. Match by SKUs if available
    const safeSkus = skus.filter(sku => sku && sku.trim() !== "").slice(0, 30);
    if (safeSkus.length > 0) {
      // Check direct document IDs since Bind ERP imports use the SKU as the document ID
      for (const sku of safeSkus) {
        const docRef = productsCol.doc(sku);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          return docSnap;
        }
      }

      const [qSku, qCode, qVarSkus] = await Promise.all([
        productsCol.where("SKU", "in", safeSkus).limit(1).get(),
        productsCol.where("Code", "in", safeSkus).limit(1).get(),
        productsCol.where("variantSkus", "array-contains-any", safeSkus).limit(1).get()
      ]);

      if (!qSku.empty) return qSku.docs[0];
      if (!qCode.empty) return qCode.docs[0];
      if (!qVarSkus.empty) return qVarSkus.docs[0];
    }
  } catch (err) {
    console.error("Error in findExistingProductDoc:", err);
  }
  return null;
}

export async function syncProductsFromShopify(
  companyId: string,
  statusFilter: string = "active"
): Promise<{ success: boolean; count?: number; error?: string }> {
  if (!adminDb) return { success: false, error: "Firebase Admin is not configured" };
  try {
    const settings = await getShopifySettings(companyId);
    if (!settings || !settings.shopName || (!settings.accessToken && (!settings.clientId || !settings.clientSecret))) {
      return { success: false, error: "Shopify settings are not configured or missing credentials." };
    }

    const client = new ShopifyClient({
      shopName: settings.shopName,
      accessToken: settings.accessToken,
      clientId: settings.clientId,
      clientSecret: settings.clientSecret
    });

    let hasMore = true;
    let sinceId: string | undefined = undefined;
    let importCount = 0;

    const productsCol = adminDb.collection("companies").doc(companyId).collection("products");

    while (hasMore) {
      const response = await client.getProducts(50, sinceId, statusFilter || undefined);
      const shopifyProducts = response.products || [];

      if (shopifyProducts.length === 0) {
        hasMore = false;
        break;
      }

      // Check existing matches in parallel for all products in the batch
      const matchPromises = shopifyProducts.map(async (sp: any) => {
        const prodId = sp.id.toString();
        const skus = (sp.variants || []).map((v: any) => v.sku).filter(Boolean);
        const safeSkus = skus.filter((sku: any) => sku && sku.trim() !== "").slice(0, 30);
        const existingDoc = await findExistingProductDoc(productsCol, prodId, safeSkus);
        return { sp, existingDoc, safeSkus };
      });

      const matchedResults = await Promise.all(matchPromises);
      const batch = adminDb.batch();

      for (const { sp, existingDoc, safeSkus } of matchedResults) {
        const prodId = sp.id.toString();
        let targetDocId = prodId;
        if (existingDoc) {
          targetDocId = existingDoc.id;
        }
        
        // Map to ShopifyProduct schema
        // Also set SKU and Code at root level to match ERP convention
        const primarySku = safeSkus[0] || "";
        const productData: Record<string, any> = {
          id: targetDocId,
          shopifyId: prodId,
          title: sp.title || "",
          bodyHtml: sp.body_html || "",
          vendor: sp.vendor || "",
          productType: sp.product_type || "",
          createdAt: sp.created_at || new Date().toISOString(),
          updatedAt: sp.updated_at || new Date().toISOString(),
          publishedAt: sp.published_at || null,
          status: sp.status || "active",
          tags: sp.tags ? sp.tags.split(",").map((t: string) => t.trim()) : [],
          variantSkus: safeSkus,
          options: (sp.options || []).map((o: any) => ({
            id: o.id?.toString() || "",
            name: o.name || "",
            values: o.values || []
          })),
          images: (sp.images || []).map((img: any) => ({
            id: img.id?.toString() || "",
            src: img.src || "",
            width: img.width || 0,
            height: img.height || 0
          })),
          variants: (sp.variants || []).map((v: any) => ({
            id: v.id?.toString() || "",
            title: v.title || "",
            price: parseFloat(v.price) || 0,
            compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
            sku: v.sku || "",
            barcode: v.barcode || "",
            stock: v.inventory_quantity || 0,
            inventory_item_id: v.inventory_item_id || null
          }))
        };
        // Only set SKU/Code if not already present on an existing doc
        if (!existingDoc) {
          productData.SKU = primarySku;
          productData.Code = primarySku;
        } else {
          const existingData = existingDoc.data() || {};
          if (!existingData.SKU && primarySku) productData.SKU = primarySku;
          if (!existingData.Code && primarySku) productData.Code = primarySku;
        }

        const docRef = productsCol.doc(targetDocId);
        batch.set(docRef, productData, { merge: true });
        importCount++;
      }

      await batch.commit();

      // Get the last ID to paginate
      sinceId = shopifyProducts[shopifyProducts.length - 1].id.toString();
      if (shopifyProducts.length < 50) {
        hasMore = false;
      }
    }

    return { success: true, count: importCount };
  } catch (error: any) {
    console.error("Error syncing products from Shopify:", error);
    return { success: false, error: error.message || "Failed to sync products" };
  }
}

// --- Push Products from ERP to Shopify ---

export async function pushProductsToShopify(
  companyId: string,
  productIds: string[]
): Promise<{ success: boolean; created: number; updated: number; errors: string[]; error?: string }> {
  if (!adminDb) return { success: false, created: 0, updated: 0, errors: [], error: "Firebase Admin is not configured" };
  
  try {
    const settings = await getShopifySettings(companyId);
    if (!settings || !settings.shopName || (!settings.accessToken && (!settings.clientId || !settings.clientSecret))) {
      return { success: false, created: 0, updated: 0, errors: [], error: "Shopify no está configurado." };
    }

    const client = new ShopifyClient({
      shopName: settings.shopName,
      accessToken: settings.accessToken,
      clientId: settings.clientId,
      clientSecret: settings.clientSecret
    });

    const productsCol = adminDb.collection("companies").doc(companyId).collection("products");
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const productId of productIds) {
      try {
        const docSnap = await productsCol.doc(productId).get();
        if (!docSnap.exists) {
          errors.push(`Producto ${productId} no encontrado en Firestore.`);
          continue;
        }

        const prod = docSnap.data()!;

        // Map ERP product to Shopify API format
        const shopifyPayload: Record<string, any> = {
          title: prod.title || prod.Title || "Sin título",
          body_html: prod.bodyHtml || prod.Description || "",
          vendor: prod.vendor || "Mi Tienda",
          product_type: prod.productType || prod.TypeText || "",
          status: (prod.status || "ACTIVE").toLowerCase() === "active" ? "active" : "draft",
          tags: Array.isArray(prod.tags) ? prod.tags.join(", ") : "",
        };

        // Map variants
        if (prod.variants && prod.variants.length > 0) {
          shopifyPayload.variants = prod.variants.map((v: any) => ({
            title: v.title || "Default Title",
            price: (v.price || 0).toString(),
            sku: v.sku || "",
            barcode: v.barcode || "",
            inventory_management: "shopify",
            inventory_quantity: v.inventoryQuantity || v.stock || 0,
          }));
        } else {
          // Single variant from root fields
          shopifyPayload.variants = [{
            title: "Default Title",
            price: (prod.cost || 0).toString(),
            sku: prod.SKU || prod.Code || "",
            barcode: prod.Code || "",
            inventory_management: "shopify",
          }];
        }

        // Map images
        if (prod.images && prod.images.length > 0) {
          shopifyPayload.images = prod.images
            .filter((img: any) => img.src && img.src.startsWith("http"))
            .map((img: any) => ({ src: img.src, alt: img.altText || img.alt || "" }));
        } else if (prod.imageUrl && prod.imageUrl.startsWith("http")) {
          shopifyPayload.images = [{ src: prod.imageUrl }];
        } else if (prod.ImageUrl && prod.ImageUrl.startsWith("http")) {
          shopifyPayload.images = [{ src: prod.ImageUrl }];
        }

        // Create or Update
        const existingShopifyId = prod.shopifyId;

        if (existingShopifyId) {
          // Update existing product in Shopify
          await client.updateProduct(existingShopifyId, shopifyPayload);
          updated++;
        } else {
          // Create new product in Shopify
          const result = await client.createProduct(shopifyPayload);
          const newShopifyId = result.product?.id?.toString();

          // Save shopifyId back to Firestore
          if (newShopifyId) {
            await productsCol.doc(productId).update({ 
              shopifyId: newShopifyId,
              shopifySyncedAt: new Date().toISOString()
            });
          }
          created++;
        }

        // Small delay to respect Shopify rate limits (2 req/sec for basic plans)
        await new Promise(r => setTimeout(r, 600));

      } catch (err: any) {
        errors.push(`${productId}: ${err.message}`);
      }
    }

    return { success: true, created, updated, errors };
  } catch (error: any) {
    console.error("Error pushing products to Shopify:", error);
    return { success: false, created: 0, updated: 0, errors: [], error: error.message };
  }
}
