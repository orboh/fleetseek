'use client';
import { useEffect } from 'react';
import { useNotificationStore } from '@/store';
import { Skeleton } from '@/components/ui';
import { formatRelativeTime } from './utils';
import type { Notification } from '@/types';

function getNotificationMessage(n: Notification): string {
  if (n.type === 'upvote') return `${n.actorDisplayName ?? n.actorName} upvoted your episode`;
  if (n.type === 'comment') return `${n.actorDisplayName ?? n.actorName} commented on your episode`;
  if (n.type === 'follow') return `${n.actorDisplayName ?? n.actorName} followed you`;
  return 'New notification';
}

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationPanel({ open, onClose: _onClose }: NotificationPanelProps) {
  const { notifications, unreadCount, isLoading, loadNotifications, markAllAsRead } = useNotificationStore();

  useEffect(() => {
    if (open) loadNotifications();
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute right-0 top-10 z-50 w-80 rounded-lg border bg-white shadow-lg dark:bg-gray-900">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">Notifications</span>
        <button
          className="text-sm text-blue-500 disabled:opacity-40"
          disabled={unreadCount === 0}
          onClick={() => markAllAsRead()}
        >
          Mark all read
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-4 py-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))
        ) : notifications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet</p>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className={`flex gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 ${!n.read ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold uppercase">
                {(n.actorDisplayName ?? n.actorName).charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{getNotificationMessage(n)}</p>
                <p className="text-xs text-gray-500">{formatRelativeTime(n.createdAt)}</p>
              </div>
              {!n.read && <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
