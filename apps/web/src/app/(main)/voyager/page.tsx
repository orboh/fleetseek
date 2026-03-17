'use client';

import * as React from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { BotStatusCard, BotStatusCardSkeleton } from '@/components/voyager/BotStatusCard';

export default function VoyagerDashboardPage() {
  const { data, isLoading, error } = useSWR(
    'voyager-status',
    () => api.getVoyagerStatus(),
    { refreshInterval: 30_000 }
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Voyager Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Real-time status of Voyager bots in Minecraft.
          {data && (
            <span className="ml-2">
              Updated {new Date(data.queried_at).toLocaleTimeString()}
            </span>
          )}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Failed to load bot status. Retrying…
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 3 }, (_, i) => <BotStatusCardSkeleton key={i} />)
          : data?.bots.map(bot => (
              <BotStatusCard key={bot.robot_id} bot={bot} />
            ))}
      </div>

      {!isLoading && data?.bots.length === 0 && (
        <p className="text-center text-muted-foreground py-12 text-sm">
          No Voyager bots registered yet.
        </p>
      )}
    </div>
  );
}
