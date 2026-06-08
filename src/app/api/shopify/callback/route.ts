import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

/**
 * Shopify OAuth Step 2: Handle the callback from Shopify.
 * 
 * Shopify redirects here with: ?code=...&shop=...&state=...&hmac=...
 * We decode the state, verify against Firestore, exchange the code for
 * an access_token, and save it.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const shop = searchParams.get('shop');
    const stateParam = searchParams.get('state');

    if (!code || !shop || !stateParam) {
      return buildErrorRedirect(request, 'Parámetros faltantes en la respuesta de Shopify (code, shop, o state).');
    }

    if (!adminDb) {
      return buildErrorRedirect(request, 'Firebase Admin no inicializado. Revisa la configuración del servidor.');
    }

    // Decode the state parameter
    let stateData: { nonce: string; companyId: string; clientId: string; shop: string };
    try {
      const decoded = Buffer.from(stateParam, 'base64url').toString('utf-8');
      stateData = JSON.parse(decoded);
    } catch {
      return buildErrorRedirect(request, 'Parámetro de estado OAuth inválido.');
    }

    if (!stateData.nonce || !stateData.companyId || !stateData.clientId) {
      return buildErrorRedirect(request, 'Datos de estado OAuth incompletos.');
    }

    // Verify the nonce against Firestore
    const stateDoc = await adminDb.collection('_oauth_states').doc(stateData.nonce).get();
    if (!stateDoc.exists) {
      return buildErrorRedirect(request, 'Sesión OAuth no encontrada o expirada. Por favor intenta conectar de nuevo.');
    }

    const storedState = stateDoc.data()!;
    if (storedState.companyId !== stateData.companyId || storedState.clientId !== stateData.clientId) {
      return buildErrorRedirect(request, 'Los datos de estado OAuth no coinciden. Posible ataque CSRF.');
    }

    // Delete the used nonce (one-time use)
    await adminDb.collection('_oauth_states').doc(stateData.nonce).delete();

    // Get the client secret from the saved credentials
    const credDoc = await adminDb
      .collection('companies')
      .doc(stateData.companyId)
      .collection('credentials')
      .doc('shopify')
      .get();

    const savedCreds = credDoc.data();
    const clientSecret = savedCreds?.clientSecret;

    if (!clientSecret) {
      return buildErrorRedirect(request, 'Client Secret no encontrado. Guarda la configuración primero.');
    }

    // Exchange the authorization code for an access token
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const tokenBody = new URLSearchParams();
    tokenBody.append('client_id', stateData.clientId);
    tokenBody.append('client_secret', clientSecret);
    tokenBody.append('code', code);

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('Shopify token exchange failed:', errText);
      return buildErrorRedirect(request, `Error al obtener token de Shopify: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json() as any;
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return buildErrorRedirect(request, 'Shopify no devolvió un access token.');
    }

    // Save the access token to Firestore
    await adminDb
      .collection('companies')
      .doc(stateData.companyId)
      .collection('credentials')
      .doc('shopify')
      .set(
        {
          accessToken,
          shopName: shop,
          oauthConnectedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    // Redirect back to the Shopify settings page with success
    const origin = getOrigin(request);
    const redirectUrl = new URL(`${origin}/configuracion/shopify`);
    redirectUrl.searchParams.set('oauth', 'success');

    return NextResponse.redirect(redirectUrl.toString());
  } catch (error: any) {
    console.error('Shopify OAuth callback error:', error);
    return buildErrorRedirect(request, error.message || 'Error en el callback OAuth');
  }
}

function getOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    return `https://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

function buildErrorRedirect(request: NextRequest, message: string): NextResponse {
  const origin = getOrigin(request);
  const redirectUrl = new URL(`${origin}/configuracion/shopify`);
  redirectUrl.searchParams.set('oauth', 'error');
  redirectUrl.searchParams.set('oauth_error', message);
  return NextResponse.redirect(redirectUrl.toString());
}
