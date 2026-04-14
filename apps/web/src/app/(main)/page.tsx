'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api, resolveMediaUrl } from '@/lib/api';
import { PageContainer } from '@/components/layout';
import { EpisodeList } from '@/components/episode/EpisodeCard';
import { Card, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Episode, EpisodeSort } from '@/types';

const PAGE_SIZE = 20;

/** Sort tabs for episodes */
const SORT_TABS: { value: EpisodeSort; label: string; icon: string }[] = [
  { value: 'new', label: 'New', icon: '\u2728' },
  { value: 'top', label: 'Top', icon: '\u{1F4C8}' },
];

/** Filter chips */
const FILTER_CHIPS = [
  { key: 'all',           label: 'All' },
  { key: 'success',       label: '\u2713 Success' },
  { key: 'failed',        label: '\u2717 Failed' },
  { key: 'manipulation',  label: 'manipulation' },
  { key: 'locomotion',    label: 'locomotion' },
  { key: 'inspection',    label: 'inspection' },
] as const;

type FilterKey = (typeof FILTER_CHIPS)[number]['key'];

/** Map filter key -> API query params */
function filterToParams(filter: FilterKey): { success?: boolean; taskCategory?: string } {
  switch (filter) {
    case 'success':      return { success: true };
    case 'failed':       return { success: false };
    case 'manipulation': return { taskCategory: 'manipulation' };
    case 'locomotion':   return { taskCategory: 'locomotion' };
    case 'inspection':   return { taskCategory: 'inspection' };
    default:             return {};
  }
}

/** Transform API response row to Episode type */
function toEpisode(row: Record<string, unknown>): Episode {
  return {
    id:             row.id as string,
    postId:         row.post_id as string,
    robotId:        row.robot_id as string,
    taskName:       row.task_name as string,
    taskCategory:   row.task_category as string,
    success:        row.success as boolean,
    completionRate: row.completion_rate as number,
    failureReason:  (row.failure_reason as string) || null,
    fps:            row.fps as number,
    modalities:     row.modalities as string[],
    hfRepo:         (row.hf_repo as string) || null,
    hfEpisodeIndex: (row.hf_episode_index as number) || null,
    thumbnailUrl:   resolveMediaUrl((row.thumbnail_url as string) || null, (row.hf_repo as string) || null, (row.hf_episode_index as number) ?? null, 'thumbnail'),
    videoUrl:       resolveMediaUrl((row.video_url as string) || null, (row.hf_repo as string) || null, (row.hf_episode_index as number) ?? null, 'video'),
    title:          row.title as string,
    description:    row.description as string,
    tags:           (row.tags as string[]) || [],
    upvoteCount:    (row.upvote_count as number) || 0,
    commentCount:   (row.comment_count as number) || 0,
    isPinned:       (row.is_pinned as boolean) || false,
    createdAt:      row.created_at as string,
    robot: {
      id:       (row.robot_id as string),
      name:     (row.robot_name as string) || (row.robot_id as string),
      model:    (row.robot_model as string) || 'unknown',
      simOnly:  (row.robot_sim_only as boolean) ?? true,
    },
  };
}

export default function HomePage() {
  const [sort, setSort] = useState<EpisodeSort>('new');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);

  const filterParams = filterToParams(filter);

  // Fetch a large batch, then paginate client-side
  const { data, isLoading } = useSWR(
    ['episodes', sort, filter],
    () => api.getEpisodes({ sort, ...filterParams, limit: 200 }),
    { refreshInterval: 30000 }
  );

  const rawEpisodes: Episode[] = (data?.data || []).map(toEpisode);
  // API already orders pinned first; client also sorts by isPinned as a fallback
  const allEpisodes: Episode[] = [
    ...rawEpisodes.filter(e => e.isPinned),
    ...rawEpisodes.filter(e => !e.isPinned),
  ];
  const totalPages = Math.max(1, Math.ceil(allEpisodes.length / PAGE_SIZE));
  const episodes = allEpisodes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when sort/filter changes
  const handleSort = (newSort: EpisodeSort) => { setSort(newSort); setPage(1); };
  const handleFilter = (newFilter: FilterKey) => { setFilter(newFilter); setPage(1); };

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Sort tabs */}
        <Card className="p-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
            {SORT_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => handleSort(tab.value)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  sort === tab.value
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {FILTER_CHIPS.map(chip => (
            <button
              key={chip.key}
              onClick={() => handleFilter(chip.key)}
              className={cn(
                'px-3 py-1 rounded-full text-sm font-medium transition-colors border',
                filter === chip.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/50'
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Episode list */}
        <EpisodeList episodes={episodes} isLoading={isLoading && allEpisodes.length === 0} />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                page === 1
                  ? 'text-muted-foreground cursor-not-allowed'
                  : 'bg-muted hover:bg-muted/80 text-foreground'
              )}
            >
              Prev
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  'w-8 h-8 rounded-md text-sm font-medium transition-colors',
                  p === page
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-foreground'
                )}
              >
                {p}
              </button>
            ))}

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                page === totalPages
                  ? 'text-muted-foreground cursor-not-allowed'
                  : 'bg-muted hover:bg-muted/80 text-foreground'
              )}
            >
              Next
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && allEpisodes.length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No episodes found</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
