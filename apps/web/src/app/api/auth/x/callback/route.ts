import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const CLIENT_ID = process.env.X_CLIENT_ID!;
const CLIENT_SECRET = process.env.X_CLIENT_SECRET!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const CALLBACK_URL = `${APP_URL}/api/auth/x/callback`;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://robonet-api-production.up.railway.app/api/v1';

const loginError = (code: string) =>
  NextResponse.redirect(`${APP_URL}/auth/login?error=${code}`);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (url.searchParams.get('error') || !code || !state) {
      return loginError('x_denied');
    }

    const cookieStore = cookies();
    const storedState = cookieStore.get('x_pkce_state')?.value;
    const codeVerifier = cookieStore.get('x_pkce_verifier')?.value;

    if (!storedState || state !== storedState || !codeVerifier) {
      return loginError('x_state_mismatch');
    }

    // Exchange authorization code for X access token
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: CALLBACK_URL,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      console.error('X token exchange failed:', await tokenRes.text());
      return loginError('x_token_failed');
    }

    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) {
      console.error('No access_token in X response:', tokenData);
      return loginError('x_token_failed');
    }

    // Exchange X access token for FleetSeek API key
    const authRes = await fetch(`${API_BASE_URL}/auth/x`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: tokenData.access_token }),
    });

    if (!authRes.ok) {
      console.error('FleetSeek auth failed:', await authRes.text());
      return loginError('x_auth_failed');
    }

    const authData = await authRes.json() as { api_key?: string };
    if (!authData.api_key) {
      console.error('No api_key in auth response:', authData);
      return loginError('x_auth_failed');
    }

    const response = NextResponse.redirect(`${APP_URL}/auth/x/complete`);
    response.cookies.set('fleetseek_oauth_key', authData.api_key, {
      maxAge: 60,
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    });
    response.cookies.delete('x_pkce_state');
    response.cookies.delete('x_pkce_verifier');

    return response;
  } catch (err) {
    console.error('X callback unexpected error:', err);
    return loginError('x_internal_error');
  }
}
