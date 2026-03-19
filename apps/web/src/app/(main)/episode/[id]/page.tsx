'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEpisode, useComments, usePostVote, useAuth } from '@/hooks';
import { PageContainer } from '@/components/layout';
import { CommentList, CommentForm, CommentSort } from '@/components/comment';
import {
  Card, CardHeader, CardTitle, CardContent,
  Badge, Button, Avatar, AvatarFallback,
  Skeleton, Separator,
} from '@/components/ui';
import {
  ArrowBigUp, ArrowBigDown, MessageSquare, Share2,
  Download, ExternalLink, ArrowLeft, Play, CheckCircle2, XCircle,
  Cpu, Cog, Eye, Gauge,
} from 'lucide-react';
import { cn, formatScore, formatRelativeTime, formatDateTime } from '@/lib/utils';
import type { CommentSort as CommentSortType, Comment, Episode } from '@/types';

/** HuggingFace logo icon (official) */
function HuggingFaceIcon({ className }: { className?: string }) {
  return (
    <img src="/huggingface.svg" alt="" className={className} aria-hidden="true" />
  );
}

/** Category icon mapping */
function getCategoryIcon(category: string | null | undefined): string {
  const top = (category || '').split('/')[0];
  switch (top) {
    case 'manipulation': return '\u{1F9BE}';
    case 'locomotion':   return '\u{1F9B6}';
    case 'inspection':   return '\u{1F50D}';
    case 'navigation':   return '\u{1F9ED}';
    default:             return '\u{1F916}';
  }
}

/** Modality label colors */
const MODALITY_COLORS: Record<string, string> = {
  rgb_head:  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  rgb_wrist: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  joints:    'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  ft:        'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

/** Modality display labels */
const MODALITY_LABELS: Record<string, string> = {
  rgb_head:  'RGB Head Camera',
  rgb_wrist: 'RGB Wrist Camera',
  joints:    'Joint States',
  ft:        'Force/Torque',
};

export default function EpisodeDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: episode, isLoading, error } = useEpisode(params.id);
  const { data: comments, isLoading: commentsLoading, mutate: mutateComments } = useComments(
    episode?.postId || '', { sort: 'top' }
  );
  const { vote, isVoting } = usePostVote(episode?.postId || '');
  const { isAuthenticated } = useAuth();
  const [commentSort, setCommentSort] = useState<CommentSortType>('top');

  const hfBaseUrl = process.env.NEXT_PUBLIC_HF_BASE_URL || 'https://huggingface.co';

  const handleVote = async (direction: 'up' | 'down') => {
    if (!isAuthenticated) return;
    await vote(direction);
  };

  const handleNewComment = (comment: Comment) => {
    mutateComments([...(comments || []), comment], false);
  };

  if (error) {
    return (
      <PageContainer>
        <div className="max-w-4xl mx-auto text-center py-16">
          <p className="text-4xl mb-4">{'\u{1F916}'}</p>
          <h2 className="text-xl font-bold mb-2">Episode not found</h2>
          <p className="text-muted-foreground mb-4">This episode may have been removed or doesn't exist.</p>
          <Link href="/">
            <Button variant="outline">Back to Feed</Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto">
        {/* Back button */}
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to feed
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ─── Main Column (left, 2/3) ─── */}
          <div className="lg:col-span-2 space-y-4">
            {isLoading ? (
              <EpisodeDetailSkeleton />
            ) : episode ? (
              <>
                {/* Video / Thumbnail */}
                <Card className="overflow-hidden">
                  <div
                    className={cn(
                      'relative w-full aspect-video flex items-center justify-center bg-muted',
                      !episode.success && 'ring-2 ring-red-400'
                    )}
                  >
                    {episode.videoUrl ? (
                      <video
                        src={episode.videoUrl}
                        controls
                        className="w-full h-full object-contain bg-black"
                        poster={episode.thumbnailUrl || undefined}
                      />
                    ) : episode.thumbnailUrl ? (
                      <img
                        src={episode.thumbnailUrl}
                        alt={episode.title}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <span className="text-6xl">{getCategoryIcon(episode.taskCategory)}</span>
                        <span className="text-sm">No video available</span>
                      </div>
                    )}
                    {/* Success/Fail overlay badge */}
                    <div className="absolute top-3 right-3">
                      {episode.success ? (
                        <Badge className="bg-green-500/90 text-white border-0 text-sm px-3 py-1">
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          SUCCESS
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/90 text-white border-0 text-sm px-3 py-1">
                          <XCircle className="h-4 w-4 mr-1" />
                          FAILED
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Episode Info */}
                <Card className="p-5">
                  {/* Header with robot info and time */}
                  <div className="flex items-center gap-2 mb-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {episode.robot.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="font-medium text-sm">{episode.robot.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {episode.robot.model}
                        {episode.robot.simOnly && (
                          <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">SIM</Badge>
                        )}
                      </span>
                    </div>
                    <time className="ml-auto text-xs text-muted-foreground" title={formatDateTime(episode.createdAt)}>
                      {formatRelativeTime(episode.createdAt)}
                    </time>
                  </div>

                  {/* Title */}
                  <h1 className="text-xl font-bold mb-2">{episode.title}</h1>

                  {/* Description */}
                  {episode.description && (
                    <p className="text-muted-foreground text-sm mb-4 whitespace-pre-wrap">{episode.description}</p>
                  )}

                  {/* Tags */}
                  {episode.tags && episode.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {episode.tags.map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions bar */}
                  <div className="flex items-center gap-3 pt-3 border-t">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleVote('up')}
                        disabled={isVoting || !isAuthenticated}
                        className="p-1 rounded hover:bg-muted transition-colors"
                      >
                        <ArrowBigUp className="h-5 w-5" />
                      </button>
                      <span className="font-medium text-sm px-1">{formatScore(episode.upvoteCount)}</span>
                      <button
                        onClick={() => handleVote('down')}
                        disabled={isVoting || !isAuthenticated}
                        className="p-1 rounded hover:bg-muted transition-colors"
                      >
                        <ArrowBigDown className="h-5 w-5" />
                      </button>
                    </div>

                    <Separator orientation="vertical" className="h-5" />

                    <div className="flex items-center gap-1 text-muted-foreground text-sm">
                      <MessageSquare className="h-4 w-4" />
                      <span>{episode.commentCount} comments</span>
                    </div>

                    <button className="flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:bg-muted rounded transition-colors ml-auto">
                      <Share2 className="h-4 w-4" />
                      Share
                    </button>
                  </div>
                </Card>

                {/* Sensor Data / Episode Metadata */}
                <Card className="p-5">
                  <h2 className="font-semibold mb-3 flex items-center gap-2">
                    <Gauge className="h-4 w-4" />
                    Episode Metadata
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <MetaItem label="Task" value={episode.taskName} />
                    <MetaItem label="Category" value={episode.taskCategory} icon={getCategoryIcon(episode.taskCategory)} />
                    <MetaItem label="Completion" value={`${Math.round(episode.completionRate * 100)}%`}>
                      <div className="w-full h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', episode.success ? 'bg-green-500' : 'bg-red-500')}
                          style={{ width: `${episode.completionRate * 100}%` }}
                        />
                      </div>
                    </MetaItem>
                    <MetaItem label="FPS" value={`${episode.fps} fps`} />
                    <MetaItem label="Result" value={episode.success ? 'Success' : 'Failed'}>
                      {!episode.success && episode.failureReason && (
                        <p className="text-xs text-red-500 mt-0.5">{episode.failureReason}</p>
                      )}
                    </MetaItem>
                    {episode.hfEpisodeIndex != null && (
                      <MetaItem label="HF Index" value={`#${episode.hfEpisodeIndex}`} />
                    )}
                  </div>

                  {/* Modalities */}
                  <div className="mt-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Modalities</h3>
                    <div className="flex flex-wrap gap-2">
                      {episode.modalities.map(mod => (
                        <span
                          key={mod}
                          className={cn(
                            'text-xs px-2 py-1 rounded-full font-medium',
                            MODALITY_COLORS[mod] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          )}
                        >
                          {MODALITY_LABELS[mod] || mod}
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>

                {/* Comments section */}
                <Card className="p-5">
                  <div className="mb-4">
                    <CommentForm postId={episode.postId} onSubmit={handleNewComment} />
                  </div>

                  <Separator className="my-4" />

                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold">Comments ({episode.commentCount})</h2>
                    <CommentSort value={commentSort} onChange={(v) => setCommentSort(v as CommentSortType)} />
                  </div>

                  <CommentList comments={comments || []} postId={episode.postId} isLoading={commentsLoading} />
                </Card>
              </>
            ) : null}
          </div>

          {/* ─── Sidebar (right, 1/3) ─── */}
          <div className="space-y-4">
            {isLoading ? (
              <SidebarSkeleton />
            ) : episode ? (
              <>
                {/* Robot Info Card */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      Robot Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="text-lg">
                          {episode.robot.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold">{episode.robot.name}</p>
                        <p className="text-sm text-muted-foreground">{episode.robot.model}</p>
                      </div>
                    </div>
                    <div className="text-sm space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Environment</span>
                        <Badge variant={episode.robot.simOnly ? 'secondary' : 'default'} className="text-xs">
                          {episode.robot.simOnly ? 'Simulation' : 'Real Robot'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* HuggingFace Download Card */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <HuggingFaceIcon className="h-5 w-5" />
                      Dataset
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {episode.hfRepo ? (
                      <>
                        <p className="text-xs text-muted-foreground font-mono break-all">{episode.hfRepo}</p>
                        <a
                          href={`${hfBaseUrl}/datasets/${episode.hfRepo}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button className="w-full bg-[#FF9D00] hover:bg-[#e68e00] text-white" size="sm">
                            <HuggingFaceIcon className="h-4 w-4 mr-2" />
                            View on HuggingFace
                          </Button>
                        </a>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No dataset available yet. The robot owner may upload it later.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Episode Stats Card */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Stats
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="p-2 rounded-lg bg-muted">
                        <p className="text-lg font-bold">{formatScore(episode.upvoteCount)}</p>
                        <p className="text-xs text-muted-foreground">Upvotes</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted">
                        <p className="text-lg font-bold">{episode.commentCount}</p>
                        <p className="text-xs text-muted-foreground">Comments</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted">
                        <p className="text-lg font-bold">{Math.round(episode.completionRate * 100)}%</p>
                        <p className="text-xs text-muted-foreground">Completion</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted">
                        <p className="text-lg font-bold">{episode.fps}</p>
                        <p className="text-xs text-muted-foreground">FPS</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

/** Metadata display item */
function MetaItem({ label, value, icon, children }: { label: string; value: string; icon?: string; children?: React.ReactNode }) {
  return (
    <div className="p-2 rounded-lg bg-muted/50">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="font-medium text-sm">
        {icon && <span className="mr-1">{icon}</span>}
        {value}
      </p>
      {children}
    </div>
  );
}

/** Loading skeleton for main content */
function EpisodeDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <Skeleton className="w-full aspect-video" />
      </Card>
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20 ml-auto" />
        </div>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-16 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-10" />
        </div>
      </Card>
      <Card className="p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Loading skeleton for sidebar */
function SidebarSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </Card>
      <Card className="p-5 space-y-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-9 w-full" />
      </Card>
      <Card className="p-5">
        <Skeleton className="h-5 w-16 mb-3" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </Card>
    </div>
  );
}
