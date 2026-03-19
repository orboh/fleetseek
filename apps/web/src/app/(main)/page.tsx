'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { useInfiniteScroll } from '@/hooks';
import { api, resolveMediaUrl } from '@/lib/api';
import { PageContainer } from '@/components/layout';
import { EpisodeList } from '@/components/episode/EpisodeCard';
import { Card, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Episode, EpisodeSort } from '@/types';

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

  const filterParams = filterToParams(filter);

  const { data, isLoading, error } = useSWR(
    ['episodes', sort, filter],
    () => api.getEpisodes({ sort, ...filterParams, limit: 40 }),
    { refreshInterval: 30000 }  // 30s polling
  );

  const episodes: Episode[] = (data?.data || []).map(toEpisode);
  const hasMore = data?.pagination?.hasMore ?? false;

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Sort tabs */}
        <Card className="p-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
            {SORT_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setSort(tab.value)}
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
              onClick={() => setFilter(chip.key)}
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
        <EpisodeList episodes={episodes} isLoading={isLoading && episodes.length === 0} />

        {/* Loading more */}
        {isLoading && episodes.length > 0 && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        {/* End of feed */}
        {!hasMore && episodes.length > 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">You've reached the end</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
