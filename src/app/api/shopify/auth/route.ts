import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

/**
 * Shopify OAuth Step 1: Generate the authorization URL and redirect the user.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get('shop');
    const clientId = searchParams.get('clientId');
    const companyId = searchParams.get('companyId');

    if (!shop || !clientId || !companyId) {
      return NextResponse.json(
        { error: 'Missing required parameters: shop, clientId, companyId' },
        { status: 400 }
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized. Check server configuration.' },
        { status: 500 }
      );
    }

    // Clean shop name
    let cleanShop = shop.trim().toLowerCase();
    cleanShop = cleanShop.replace(/^(https?:\/\/)?(www\.)?/, '');
    if (!cleanShop.includes('.myshopify.com')) {
      cleanShop = `${cleanShop}.myshopify.com`;
    }

    // Generate a random nonce for CSRF protection
    const nonce = crypto.randomBytes(16).toString('hex');

    // Define the scopes needed
    const scopes = [
      'read_products',
      'write_products',
      'read_inventory',
      'write_inventory',
      'read_orders',
      'read_locations',
      'read_shipping',
    ].join(',');

    // Build the callback URL
    const origin = request.headers.get('x-forwarded-host')
      ? `https://${request.headers.get('x-forwarded-host')}`
      : new URL(request.url).origin;
    const redirectUri = `${origin}/api/shopify/callback`;

    // Encode companyId, clientId, and nonce into the state parameter
    const statePayload = JSON.stringify({ nonce, companyId, clientId, shop: cleanShop });
    const stateEncoded = Buffer.from(statePayload).toString('base64url');

    // Store the OAuth state in Firestore for verification in callback
    await adminDb.collection('_oauth_states').doc(nonce).set({
      companyId,
      clientId,
      shop: cleanShop,
      createdAt: new Date().toISOString(),
    });

    // Build the Shopify authorization URL
    const authUrl = new URL(`https://${cleanShop}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', stateEncoded);

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error('Shopify OAuth auth error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start OAuth flow' },
      { status: 500 }
    );
  }
}
