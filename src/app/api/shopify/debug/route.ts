import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { ShopifyClient } from '@/lib/shopify/client';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint to check webhook status and settings.
 * GET /api/shopify/debug?companyId=...
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not available' }, { status: 500 });
    }

    // Get saved credentials
    const credSnap = await adminDb
      .collection('companies')
      .doc(companyId)
      .collection('credentials')
      .doc('shopify')
      .get();

    if (!credSnap.exists) {
      return NextResponse.json({ error: 'No Shopify credentials found' }, { status: 404 });
    }

    const creds = credSnap.data()!;
    const diagnostics: any = {
      hasAccessToken: !!creds.accessToken,
      accessTokenPrefix: creds.accessToken ? creds.accessToken.substring(0, 8) + '...' : 'MISSING',
      hasClientId: !!creds.clientId,
      hasClientSecret: !!creds.clientSecret,
      shopName: creds.shopName || 'NOT SET',
      isActive: !!creds.isActive,
      oauthConnectedAt: creds.oauthConnectedAt || 'NOT SET',
      syncInventory: !!creds.syncInventory,
      syncOrders: !!creds.syncOrders,
    };

    // If we have an access token, try listing registered webhooks
    if (creds.accessToken && creds.shopName) {
      try {
        const client = new ShopifyClient({
          shopName: creds.shopName,
          accessToken: creds.accessToken,
        });
        const webhooksRes = await client.getWebhooks();
        diagnostics.registeredWebhooks = (webhooksRes.webhooks || []).map((wh: any) => ({
          id: wh.id,
          topic: wh.topic,
          address: wh.address,
          format: wh.format,
          created_at: wh.created_at,
        }));
      } catch (e: any) {
        diagnostics.webhookError = e.message;
      }
    }

    // If SKU is provided, search for the product in multiple ways
    const sku = searchParams.get('sku');
    if (sku) {
      diagnostics.skuSearch = {};

      const productsCol = adminDb.collection('companies').doc(companyId).collection('products');

      // Method 1: SKU field at root level
      const q1 = await productsCol.where('SKU', '==', sku).limit(3).get();
      diagnostics.skuSearch.byRootSKU = q1.docs.map(d => ({ id: d.id, title: d.data().title, SKU: d.data().SKU }));

      // Method 2: Code field at root level
      const q2 = await productsCol.where('Code', '==', sku).limit(3).get();
      diagnostics.skuSearch.byRootCode = q2.docs.map(d => ({ id: d.id, title: d.data().title, Code: d.data().Code }));

      // Method 3: variantSkus array
      const q3 = await productsCol.where('variantSkus', 'array-contains', sku).limit(3).get();
      diagnostics.skuSearch.byVariantSkus = q3.docs.map(d => ({ id: d.id, title: d.data().title, variantSkus: d.data().variantSkus }));

      // Method 4: shopifyId field
      const q4 = await productsCol.where('shopifyId', '==', sku).limit(3).get();
      diagnostics.skuSearch.byShopifyId = q4.docs.map(d => ({ id: d.id, title: d.data().title, shopifyId: d.data().shopifyId }));

      // Method 5: Get first 5 products to see structure
      const q5 = await productsCol.limit(5).get();
      diagnostics.sampleProducts = q5.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title,
          SKU: data.SKU || 'NOT SET',
          Code: data.Code || 'NOT SET',
          shopifyId: data.shopifyId || 'NOT SET',
          variantSkus: data.variantSkus || 'NOT SET',
          variantsCount: data.variants?.length || 0,
          firstVariantSku: data.variants?.[0]?.sku || 'NOT SET',
          firstVariantPrice: data.variants?.[0]?.price || 'NOT SET',
        };
      });
    }

    return NextResponse.json(diagnostics, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
