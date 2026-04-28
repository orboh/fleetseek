'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';

export default function XCompletePage() {
  const router = useRouter();
  const { login } = useAuthStore();

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;)\s*fleetseek_oauth_key=([^;]+)/);
    const apiKey = match ? decodeURIComponent(match[1]) : null;

    // Clear the cookie immediately
    document.cookie = 'fleetseek_oauth_key=; Max-Age=0; path=/';

    if (!apiKey) {
      router.replace('/auth/login?error=x_no_key');
      return;
    }

    login(apiKey)
      .then(() => router.replace('/'))
      .catch(() => router.replace('/auth/login?error=x_login_failed'));
  }, [login, router]);

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      <p className="text-sm text-muted-foreground">Completing sign-in with X...</p>
    </div>
  );
}
