import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminDb, admin } from "@/lib/firebase/admin";

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
    console.error("Error in findExistingProductDoc webhook helper:", err);
  }
  return null;
}

async function findProductRefByShopifyId(
  productsCol: any,
  shopifyProductId: string
): Promise<any | null> {
  try {
    const docRef = productsCol.doc(shopifyProductId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return docRef;
    }

    const q = await productsCol.where("shopifyId", "==", shopifyProductId).limit(1).get();
    if (!q.empty) {
      return q.docs[0].ref;
    }
  } catch (err) {
    console.error("Error in findProductRefByShopifyId webhook helper:", err);
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId parameter" }, { status: 400 });
  }

  if (!adminDb) {
    return NextResponse.json({ error: "Firebase Admin not initialized" }, { status: 500 });
  }

  try {
    // 1. Fetch Shopify config to verify signature
    const settingsSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("credentials")
      .doc("shopify")
      .get();

    if (!settingsSnap.exists) {
      return NextResponse.json({ error: "Shopify settings not found" }, { status: 404 });
    }

    const settings = settingsSnap.data() || {};
    if (!settings.isActive) {
      return NextResponse.json({ message: "Shopify integration is disabled" }, { status: 200 });
    }

    // Read headers
    const topic = req.headers.get("x-shopify-topic");
    const hmacHeader = req.headers.get("x-shopify-hmac-sha256");

    // Read raw body to verify signature
    const rawBody = await req.text();

    // Verify signature using webhookSecret or clientSecret (Shopify signs with client secret)
    const signingSecret = settings.webhookSecret || settings.clientSecret;
    if (signingSecret && hmacHeader) {
      const hash = crypto
        .createHmac("sha256", signingSecret)
        .update(rawBody, "utf8")
        .digest("base64");

      if (hash !== hmacHeader) {
        console.warn(`[Shopify Webhook] Invalid HMAC signature for company: ${companyId}. Expected: ${hash}, Got: ${hmacHeader}`);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
      console.log(`[Shopify Webhook] HMAC signature verified for company: ${companyId}`);
    } else {
      console.warn(`[Shopify Webhook] No signing secret configured, skipping HMAC verification for company: ${companyId}`);
    }

    const payload = JSON.parse(rawBody);
    console.log(`[Shopify Webhook] Received topic: ${topic} for company: ${companyId}`);

    const productsCol = adminDb.collection("companies").doc(companyId).collection("products");
    const remisionesCol = adminDb.collection("companies").doc(companyId).collection("remisiones");

    // 2. Handle Shopify topics
    if (topic === "products/create" || topic === "products/update") {
      const prodId = payload.id.toString();
      const skus = (payload.variants || []).map((v: any) => v.sku).filter(Boolean);
      const safeSkus = skus.filter((sku: any) => sku && sku.trim() !== "").slice(0, 30);

      // Find existing product document
      const existingDoc = await findExistingProductDoc(productsCol, prodId, safeSkus);

      let targetDocId = prodId;
      if (existingDoc) {
        targetDocId = existingDoc.id;
        console.log(`[Shopify Webhook] Found existing ERP product: ${targetDocId} for Shopify ID: ${prodId}`);
      } else {
        console.log(`[Shopify Webhook] No existing product found for Shopify ID: ${prodId}, SKUs: ${safeSkus.join(', ')}`);
      }
      
      const primarySku = safeSkus[0] || "";
      const productData: Record<string, any> = {
        id: targetDocId,
        shopifyId: prodId,
        title: payload.title || "",
        bodyHtml: payload.body_html || "",
        vendor: payload.vendor || "",
        productType: payload.product_type || "",
        createdAt: payload.created_at || new Date().toISOString(),
        updatedAt: payload.updated_at || new Date().toISOString(),
        publishedAt: payload.published_at || null,
        status: payload.status || "active",
        tags: payload.tags ? payload.tags.split(",").map((t: string) => t.trim()) : [],
        variantSkus: safeSkus,
        options: (payload.options || []).map((o: any) => ({
          id: o.id?.toString() || "",
          name: o.name || "",
          values: o.values || []
        })),
        images: (payload.images || []).map((img: any) => ({
          id: img.id?.toString() || "",
          src: img.src || "",
          width: img.width || 0,
          height: img.height || 0
        })),
        variants: (payload.variants || []).map((v: any) => ({
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

      // Set SKU/Code at root level to match ERP convention
      if (!existingDoc) {
        productData.SKU = primarySku;
        productData.Code = primarySku;
      } else {
        const existingData = existingDoc.data() || {};
        if (!existingData.SKU && primarySku) productData.SKU = primarySku;
        if (!existingData.Code && primarySku) productData.Code = primarySku;
      }

      await productsCol.doc(targetDocId).set(productData, { merge: true });
      console.log(`[Shopify Webhook] Sync product ID: ${targetDocId} (${payload.title}), price: ${productData.variants[0]?.price}`);

    } else if (topic === "products/delete") {
      const prodId = payload.id.toString();
      const prodRef = await findProductRefByShopifyId(productsCol, prodId);
      if (prodRef) {
        await prodRef.delete();
        console.log(`[Shopify Webhook] Deleted product ID: ${prodRef.id}`);
      } else {
        console.log(`[Shopify Webhook] Product delete skipped - not found for Shopify ID: ${prodId}`);
      }

    } else if (topic === "orders/create") {
      if (!settings.syncOrders) {
        return NextResponse.json({ message: "Order sync is disabled" }, { status: 200 });
      }

      const orderId = payload.id.toString();
      const orderNumber = payload.order_number || payload.number;

      // Check if order already exists to avoid duplicate entries
      const existingRem = await remisionesCol.doc(orderId).get();
      if (existingRem.exists) {
        return NextResponse.json({ message: "Order already processed" }, { status: 200 });
      }

      // Map to Remision schema
      const remissionData = {
        id: orderId,
        remissionNumber: `Ecom-${orderNumber}`,
        orderId: null,
        orderNumber: `SHOPIFY-${orderNumber}`,
        clientName: payload.customer 
          ? `${payload.customer.first_name || ""} ${payload.customer.last_name || ""}`.trim() 
          : "Cliente Shopify",
        items: (payload.line_items || []).map((item: any) => ({
          productId: item.product_id?.toString() || "",
          variantId: item.variant_id?.toString() || "",
          productName: item.name || item.title || "",
          variantTitle: item.variant_title || "",
          quantity: item.quantity || 1,
          unitPrice: parseFloat(item.price) || 0,
          discountPercentage: 0,
          imageUrl: ""
        })),
        totalAmount: parseFloat(payload.total_price) || 0,
        subtotal: parseFloat(payload.subtotal_price) || 0,
        tax: parseFloat(payload.total_tax) || 0,
        paidAmount: payload.financial_status === "paid" ? parseFloat(payload.total_price) : 0,
        locationId: "shopify",
        locationName: "eCOMMERCE",
        status: "activa",
        createdAt: payload.created_at || new Date().toISOString(),
        createdBy: "Shopify Webhook",
        isShopifySale: true
      };

      await remisionesCol.doc(orderId).set(remissionData);
      console.log(`[Shopify Webhook] Saved Shopify order: SHOPIFY-${orderNumber} in remisiones`);

      // Deduct inventory stock if syncInventory is active
      if (settings.syncInventory && payload.line_items) {
        for (const item of payload.line_items) {
          if (!item.product_id || !item.variant_id) continue;

          const prodIdStr = item.product_id.toString();
          const variantIdStr = item.variant_id.toString();
          const quantity = item.quantity || 1;

          const prodRef = await findProductRefByShopifyId(productsCol, prodIdStr);

          if (prodRef) {
            const prodSnap = await prodRef.get();
            if (prodSnap.exists) {
              const productData = prodSnap.data() || {};
              const variants = productData.variants || [];
              
              let variantFound = false;
              const updatedVariants = variants.map((v: any) => {
                if (v.id === variantIdStr) {
                  variantFound = true;
                  return {
                    ...v,
                    stock: Math.max(0, (v.stock || 0) - quantity)
                  };
                }
                return v;
              });

              if (variantFound) {
                await prodRef.update({ 
                  variants: updatedVariants,
                  salesCount: admin.firestore.FieldValue.increment(quantity)
                });
                console.log(`[Shopify Webhook] Deducted stock of variant ID: ${variantIdStr} by: ${quantity}`);

                // Log inventory movement
                const movId = crypto.randomUUID();
                await adminDb
                  .collection("companies")
                  .doc(companyId)
                  .collection("inventory_movements")
                  .doc(movId)
                  .set({
                    id: movId,
                    productId: prodRef.id,
                    variantId: variantIdStr,
                    type: "OUT",
                    quantity: quantity,
                    reason: `Venta Shopify #${orderNumber}`,
                    referenceId: orderId,
                    createdAt: new Date().toISOString()
                  });
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error(`[Shopify Webhook] Error:`, error);
    return NextResponse.json({ error: error.message || "Failed to process webhook" }, { status: 500 });
  }
}
