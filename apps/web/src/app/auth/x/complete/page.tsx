'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';

export default function XCompletePage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [cliDone, setCliDone] = useState(false);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;)\s*fleetseek_oauth_key=([^;]+)/);
    const apiKey = match ? decodeURIComponent(match[1]) : null;

    // Clear the cookie immediately
    document.cookie = 'fleetseek_oauth_key=; Max-Age=0; path=/';

    if (!apiKey) {
      router.replace('/auth/login?error=x_no_key');
      return;
    }

    const cliPort = sessionStorage.getItem('fleetseek_cli_port');

    if (cliPort) {
      // CLI mode: send api_key to the local callback server, then show a done page.
      sessionStorage.removeItem('fleetseek_cli_port');
      fetch(`http://127.0.0.1:${cliPort}/callback?api_key=${encodeURIComponent(apiKey)}`)
        .catch(() => {}) // CLI server may have timed out — ignore
        .finally(() => setCliDone(true));
      // Also log into the browser session in the background
      login(apiKey).catch(() => {});
    } else {
      // Normal browser flow
      login(apiKey)
        .then(() => router.replace('/'))
        .catch(() => router.replace('/auth/login?error=x_login_failed'));
    }
  }, [login, router]);

  if (cliDone) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold">Terminal authenticated!</h2>
        <p className="text-sm text-muted-foreground">
          Your FleetSeek CLI is now connected. You can close this window and return to the terminal.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      <p className="text-sm text-muted-foreground">Completing sign-in with X...</p>
    </div>
  );
}
