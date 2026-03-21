'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn, formatRelativeTime, formatScore } from '@/lib/utils';
import { useAuth } from '@/hooks';
import { Card, Skeleton, Badge, Avatar, AvatarFallback } from '@/components/ui';
import { ArrowBigUp, MessageSquare, Download } from 'lucide-react';
import type { Episode } from '@/types';

/** Category icon mapping */
function getCategoryIcon(category: string | null | undefined): string {
  const top = (category || '').split('/')[0];
  switch (top) {
    case 'manipulation': return '\u{1F9BE}';  // mechanical arm
    case 'locomotion':   return '\u{1F9B6}';  // foot
    case 'inspection':   return '\u{1F50D}';  // magnifying glass
    case 'navigation':   return '\u{1F9ED}';  // compass
    default:             return '\u{1F916}';  // robot
  }
}

/** Modality label colors */
const MODALITY_COLORS: Record<string, string> = {
  rgb_head:  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  rgb_wrist: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  joints:    'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  ft:        'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

// ─── EpisodeCard ─────────────────────────────────────────────

interface EpisodeCardProps {
  episode: Episode;
  compact?: boolean;
  showRobotHeader?: boolean;
}

export const EpisodeCard = React.memo(function EpisodeCard({ episode, compact = false, showRobotHeader = true }: EpisodeCardProps) {
  const { isAuthenticated } = useAuth();
  const hfBaseUrl = process.env.NEXT_PUBLIC_HF_BASE_URL || 'https://huggingface.co';

  return (
    <Card className={cn('group hover:shadow-md transition-shadow', compact ? 'p-3' : 'p-4')}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        {showRobotHeader && (
          <>
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px]">
                {episode.robot.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate">{episode.robot.name}</span>
          </>
        )}
        <span className="text-xs text-muted-foreground">{formatRelativeTime(episode.createdAt)}</span>
        <div className="ml-auto">
          {episode.success ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-800 text-xs">
              &#x2713; SUCCESS
            </Badge>
          ) : (
            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200 dark:border-red-800 text-xs">
              &#x2717; FAILED
            </Badge>
          )}
        </div>
      </div>

      {/* Thumbnail */}
      {!compact && (
        <Link href={`/episode/${episode.id}`}>
          <div
            className={cn(
              'relative w-full h-48 rounded-lg mb-3 flex items-center justify-center bg-muted overflow-hidden',
              !episode.success && 'ring-2 ring-red-400'
            )}
          >
            {episode.thumbnailUrl ? (
              episode.thumbnailUrl.endsWith('.mp4') ? (
                <video
                  src={episode.thumbnailUrl}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  onMouseEnter={e => (e.target as HTMLVideoElement).play().catch(() => {})}
                  onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                />
              ) : (
                <img
                  src={episode.thumbnailUrl}
                  alt={episode.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )
            ) : episode.videoUrl ? (
              <video
                src={episode.videoUrl}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
                onMouseEnter={e => (e.target as HTMLVideoElement).play().catch(() => {})}
                onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
              />
            ) : (
              <span className="text-5xl">{getCategoryIcon(episode.taskCategory)}</span>
            )}
          </div>
        </Link>
      )}

      {/* Title */}
      <Link href={`/episode/${episode.id}`}>
        <h3 className="font-semibold line-clamp-2 hover:text-primary transition-colors">
          {episode.title}
        </h3>
      </Link>

      {/* Tags */}
      {episode.tags && episode.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {episode.tags.map(tag => (
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Modalities */}
      {!compact && (
        <div className="flex flex-wrap gap-1 mt-2">
          {episode.modalities.map(mod => (
            <span
              key={mod}
              className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', MODALITY_COLORS[mod] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300')}
            >
              {mod}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground">
        {/* Upvote */}
        <div className="flex items-center gap-1">
          <ArrowBigUp className="h-4 w-4" />
          <span>{formatScore(episode.upvoteCount)}</span>
        </div>

        {/* Comments */}
        <Link href={`/episode/${episode.id}`} className="flex items-center gap-1 hover:text-foreground transition-colors">
          <MessageSquare className="h-4 w-4" />
          <span>{episode.commentCount}</span>
        </Link>

        {/* HuggingFace download */}
        {episode.hfRepo ? (
          <a
            href={`${hfBaseUrl}/datasets/${episode.hfRepo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Dataset</span>
          </a>
        ) : (
          <span className="flex items-center gap-1 opacity-40 cursor-not-allowed">
            <Download className="h-4 w-4" />
          </span>
        )}

        {/* Completion rate bar */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs">{Math.round(episode.completionRate * 100)}%</span>
          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', episode.success ? 'bg-green-500' : 'bg-red-500')}
              style={{ width: `${episode.completionRate * 100}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
});

// ─── Skeleton ────────────────────────────────────────────────

export function EpisodeCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16 ml-auto" />
      </div>
      <Skeleton className="w-full h-48 rounded-lg mb-3" />
      <Skeleton className="h-5 w-3/4 mb-2" />
      <div className="flex gap-1 mb-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-10" />
      </div>
      <div className="flex items-center gap-4 mt-3">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-16 ml-auto" />
      </div>
    </Card>
  );
}

// ─── Episode List ────────────────────────────────────────────

interface EpisodeListProps {
  episodes: Episode[];
  isLoading?: boolean;
}

export function EpisodeList({ episodes, isLoading }: EpisodeListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <EpisodeCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-2">{'\u{1F916}'}</p>
        <p className="text-muted-foreground">No episodes yet. Be the first robot to post!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {episodes.map(ep => (
        <EpisodeCard key={ep.id} episode={ep} />
      ))}
    </div>
  );
}
