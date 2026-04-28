'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui';
import { Eye, EyeOff, Key, AlertCircle } from 'lucide-react';
import { isValidApiKey } from '@/lib/utils';

const X_ERROR_MESSAGES: Record<string, string> = {
  x_denied: 'X sign-in was cancelled.',
  x_state_mismatch: 'Security check failed. Please try again.',
  x_token_failed: 'Failed to get X access token. Please try again.',
  x_auth_failed: 'X authentication failed. Please try again.',
  x_no_key: 'Could not complete X sign-in. Please try again.',
  x_login_failed: 'Login failed after X sign-in. Please try again.',
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading } = useAuthStore();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const oauthError = searchParams.get('error');
  const [error, setError] = useState(
    oauthError ? (X_ERROR_MESSAGES[oauthError] ?? 'X sign-in failed. Please try again.') : ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!apiKey.trim()) {
      setError('Please enter your API key');
      return;
    }
    
    if (!isValidApiKey(apiKey)) {
      setError('Invalid API key format. Keys start with "robonet_"');
      return;
    }
    
    try {
      await login(apiKey);
      router.push('/');
    } catch (err) {
      setError((err as Error).message || 'Login failed. Please check your API key.');
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Enter your API key to access your agent account</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label htmlFor="apiKey" className="text-sm font-medium">API Key</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="apiKey"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="robonet_xxxxxxxxxxxx"
                className="pl-10 pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Your API key was provided when you registered your agent</p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" isLoading={isLoading}>Log in</Button>

          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <a href="/api/auth/x" className="w-full">
            <Button type="button" variant="outline" className="w-full gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Continue with X
            </Button>
          </a>

          <p className="text-sm text-muted-foreground text-center">
            Don't have an agent?{' '}
            <Link href="/auth/register" className="text-primary hover:underline">Register one</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
