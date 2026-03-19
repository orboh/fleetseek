'use client';

import * as React from 'react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Card, Badge, Skeleton } from '@/components/ui';
import type { VoyagerBotStatus } from '@/types';

type BotStatusCardProps =
  | { bot: VoyagerBotStatus; loading?: false }
  | { bot?: undefined; loading: true };

export function BotStatusCard({ bot, loading }: BotStatusCardProps) {
  if (loading) {
    return (
      <div data-testid="bot-card-skeleton">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-5 w-24 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="space-y-1 border-t pt-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-48" />
          </div>
        </Card>
      </div>
    );
  }

  const isOnline = bot.alive;

  return (
    <Card className="p-4 space-y-3">
      {/* Header: name + status badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold truncate">{bot.name}</span>
        <Badge
          variant={isOnline ? 'default' : 'secondary'}
          className={cn(
            'text-xs shrink-0',
            isOnline
              ? 'bg-green-500 hover:bg-green-500 text-white'
              : 'bg-zinc-400 hover:bg-zinc-400 text-white'
          )}
        >
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </Badge>
      </div>

      {/* MC connection status */}
      <div className="flex items-center gap-2 text-xs">
        <span
          data-testid={bot.mc_connected ? 'mc-connected' : 'mc-disconnected'}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium',
            bot.mc_connected
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
          )}
        >
          <span>{bot.mc_connected ? '⛏' : '✗'}</span>
          <span>Minecraft</span>
        </span>
        {bot.skills_count !== null && (
          <span className="text-muted-foreground">
            {bot.skills_count} skills
          </span>
        )}
      </div>

      {/* Current task */}
      <div className="text-xs space-y-0.5">
        <div className="text-muted-foreground font-medium">Current task</div>
        <div
          data-testid="current-task"
          className={cn(
            'truncate',
            !isOnline ? 'text-muted-foreground' : 'text-foreground'
          )}
        >
          {bot.current_task ?? '—'}
          {bot.current_iteration !== null && isOnline && (
            <span className="ml-1 text-muted-foreground">
              (iter {bot.current_iteration})
            </span>
          )}
        </div>
      </div>

      {/* Last episode */}
      <div className="text-xs space-y-0.5 border-t pt-2">
        <div className="text-muted-foreground font-medium">Last episode</div>
        {bot.last_episode ? (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                bot.last_episode.success ? 'bg-green-500' : 'bg-red-400'
              )}
            />
            <span className="truncate">{bot.last_episode.title}</span>
          </div>
        ) : (
          <span className="text-muted-foreground italic">No recent episodes</span>
        )}
      </div>

      {/* Last heartbeat */}
      {bot.last_heartbeat && (
        <div className="text-[10px] text-muted-foreground">
          Last seen {formatRelativeTime(bot.last_heartbeat)}
        </div>
      )}
    </Card>
  );
}

export function BotStatusCardSkeleton() {
  return (
    <div data-testid="bot-status-skeleton">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-5 w-24 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="space-y-1 border-t pt-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-48" />
        </div>
      </Card>
    </div>
  );
}
