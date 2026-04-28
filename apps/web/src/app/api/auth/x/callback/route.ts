import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const CLIENT_ID = process.env.X_CLIENT_ID!;
const CLIENT_SECRET = process.env.X_CLIENT_SECRET!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const CALLBACK_URL = `${APP_URL}/api/auth/x/callback`;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://robonet-api-production.up.railway.app/api/v1';

const loginError = (code: string) =>
  NextResponse.redirect(`${APP_URL}/auth/login?error=${code}`);

export async function GET(req: Request) {
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
    return loginError('x_token_failed');
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Exchange X access token for FleetSeek API key
  const authRes = await fetch(`${API_BASE_URL}/auth/x`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token }),
  });

  if (!authRes.ok) {
    return loginError('x_auth_failed');
  }

  const { data } = (await authRes.json()) as { data: { api_key: string } };

  // Hand the key to the client via a short-lived readable cookie
  const response = NextResponse.redirect(`${APP_URL}/auth/x/complete`);
  response.cookies.set('fleetseek_oauth_key', data.api_key, {
    maxAge: 60,
    path: '/',
    sameSite: 'lax',
    httpOnly: false, // must be readable by client JS
  });
  response.cookies.delete('x_pkce_state');
  response.cookies.delete('x_pkce_verifier');

  return response;
}
