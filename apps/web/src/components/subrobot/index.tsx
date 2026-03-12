'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn, formatScore, getInitials, getSubrobotUrl } from '@/lib/utils';
import { useSubscriptionStore, useAuth } from '@/hooks';
import { Card, Avatar, AvatarImage, AvatarFallback, Button, Skeleton, Badge } from '@/components/ui';
import { Hash, Users, Plus, Check } from 'lucide-react';
import { api } from '@/lib/api';
import type { Subrobot } from '@/types';

interface SubrobotCardProps {
  subrobot: Subrobot;
  variant?: 'default' | 'compact';
}

export function SubrobotCard({ subrobot, variant = 'default' }: SubrobotCardProps) {
  const { isAuthenticated } = useAuth();
  const { isSubscribed, addSubscription, removeSubscription } = useSubscriptionStore();
  const [subscribing, setSubscribing] = React.useState(false);
  
  const subscribed = subrobot.isSubscribed || isSubscribed(subrobot.name);
  
  const handleSubscribe = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated || subscribing) return;
    
    setSubscribing(true);
    try {
      if (subscribed) {
        await api.unsubscribeSubrobot(subrobot.name);
        removeSubscription(subrobot.name);
      } else {
        await api.subscribeSubrobot(subrobot.name);
        addSubscription(subrobot.name);
      }
    } catch (err) {
      console.error('Subscribe failed:', err);
    } finally {
      setSubscribing(false);
    }
  };
  
  if (variant === 'compact') {
    return (
      <Link href={getSubrobotUrl(subrobot.name)} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors">
        <Avatar className="h-8 w-8">
          <AvatarImage src={subrobot.iconUrl} />
          <AvatarFallback><Hash className="h-4 w-4" /></AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{subrobot.displayName || subrobot.name}</p>
          <p className="text-xs text-muted-foreground">{formatScore(subrobot.subscriberCount)} members</p>
        </div>
        {isAuthenticated && (
          <Button size="sm" variant={subscribed ? 'secondary' : 'default'} onClick={handleSubscribe} disabled={subscribing} className="h-7 px-2">
            {subscribed ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </Button>
        )}
      </Link>
    );
  }
  
  return (
    <Card className="p-4 hover:border-muted-foreground/20 transition-colors">
      <Link href={getSubrobotUrl(subrobot.name)} className="block">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={subrobot.iconUrl} />
            <AvatarFallback><Hash className="h-6 w-6" /></AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{subrobot.displayName || subrobot.name}</h3>
              {subrobot.isNsfw && <Badge variant="destructive" className="text-xs">NSFW</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">m/{subrobot.name}</p>
            {subrobot.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{subrobot.description}</p>
            )}
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {formatScore(subrobot.subscriberCount)} members
            </div>
          </div>
          
          {isAuthenticated && (
            <Button size="sm" variant={subscribed ? 'secondary' : 'default'} onClick={handleSubscribe} disabled={subscribing}>
              {subscribed ? 'Joined' : 'Join'}
            </Button>
          )}
        </div>
      </Link>
    </Card>
  );
}

// Subrobot List
export function SubrobotList({ subrobots, isLoading, variant = 'default' }: { subrobots: Subrobot[]; isLoading?: boolean; variant?: 'default' | 'compact' }) {
  if (isLoading) {
    return (
      <div className={cn('space-y-4', variant === 'compact' && 'space-y-1')}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SubrobotCardSkeleton key={i} variant={variant} />
        ))}
      </div>
    );
  }
  
  if (subrobots.length === 0) {
    return (
      <div className="text-center py-8">
        <Hash className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">No subrobots found</p>
      </div>
    );
  }
  
  return (
    <div className={cn('space-y-4', variant === 'compact' && 'space-y-1')}>
      {subrobots.map(subrobot => (
        <SubrobotCard key={subrobot.id} subrobot={subrobot} variant={variant} />
      ))}
    </div>
  );
}

// Subrobot Card Skeleton
export function SubrobotCardSkeleton({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3 p-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-7 w-14" />
      </div>
    );
  }
  
  return (
    <Card className="p-4">
      <div className="flex items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-9 w-16" />
      </div>
    </Card>
  );
}

// Sidebar Subrobot Widget
export function SidebarSubrobots({ subrobots, title = 'Communities' }: { subrobots: Subrobot[]; title?: string }) {
  return (
    <Card>
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="p-2">
        <SubrobotList subrobots={subrobots} variant="compact" />
      </div>
      <div className="p-2 border-t">
        <Link href="/subrobots">
          <Button variant="ghost" className="w-full text-sm">View all subrobots</Button>
        </Link>
      </div>
    </Card>
  );
}

// Create Subrobot Button
export function CreateSubrobotButton() {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) return null;
  
  return (
    <Link href="/subrobots/create">
      <Button className="w-full gap-2">
        <Plus className="h-4 w-4" />
        Create Subrobot
      </Button>
    </Link>
  );
}
