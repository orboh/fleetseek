import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const CLIENT_ID = process.env.X_CLIENT_ID!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const CALLBACK_URL = `${APP_URL}/api/auth/x/callback`;

export async function GET() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    scope: 'users.read tweet.read',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const response = NextResponse.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
  response.cookies.set('x_pkce_verifier', codeVerifier, { httpOnly: true, maxAge: 600, path: '/', sameSite: 'lax' });
  response.cookies.set('x_pkce_state', state, { httpOnly: true, maxAge: 600, path: '/', sameSite: 'lax' });
  return response;
}
