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

// --- Settings Operations ---

export async function getShopifySettings(companyId: string): Promise<ShopifySettings | null> {
  if (!adminDb) return null;
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
  } catch (error) {
    console.error("Error fetching Shopify settings:", error);
    return null;
  }
}

export async function saveShopifySettings(
  companyId: string,
  settings: ShopifySettings
): Promise<{ success: boolean; error?: string }> {
  if (!adminDb) return { success: false, error: "Firebase Admin is not configured" };
  try {
    await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("credentials")
      .doc("shopify")
      .set(settings);

    return { success: true };
  } catch (error: any) {
    console.error("Error saving Shopify settings:", error);
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
  try {
    const client = new ShopifyClient({ shopName, accessToken, clientId, clientSecret });
    const response = await client.getLocations();
    return { success: true, locations: response.locations };
  } catch (error: any) {
    console.error("Error testing Shopify connection:", error);
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

export async function syncProductsFromShopify(
  companyId: string
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
      const response = await client.getProducts(50, sinceId);
      const shopifyProducts = response.products || [];

      if (shopifyProducts.length === 0) {
        hasMore = false;
        break;
      }

      const batch = adminDb.batch();

      for (const sp of shopifyProducts) {
        const prodId = sp.id.toString();
        
        // Map to ShopifyProduct schema
        const productData = {
          id: prodId,
          title: sp.title || "",
          bodyHtml: sp.body_html || "",
          vendor: sp.vendor || "",
          productType: sp.product_type || "",
          createdAt: sp.created_at || new Date().toISOString(),
          updatedAt: sp.updated_at || new Date().toISOString(),
          publishedAt: sp.published_at || null,
          status: sp.status || "active",
          tags: sp.tags ? sp.tags.split(",").map((t: string) => t.trim()) : [],
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

        const docRef = productsCol.doc(prodId);
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
