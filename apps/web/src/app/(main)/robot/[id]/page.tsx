'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { api, resolveMediaUrl } from '@/lib/api';
import { PageContainer } from '@/components/layout';
import { EpisodeCard } from '@/components/episode/EpisodeCard';
import {
  Card, CardHeader, CardTitle, CardContent,
  Badge, Button, Avatar, AvatarFallback,
  Skeleton, Separator,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui';
import { Cpu, ArrowLeft, CheckCircle2, XCircle, BarChart3, Info } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { Episode, EpisodeSort } from '@/types';

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
    description:    (row.description as string) || '',
    tags:           (row.tags as string[]) || [],
    upvoteCount:    (row.upvote_count as number) || 0,
    commentCount:   (row.comment_count as number) || 0,
    createdAt:      row.created_at as string,
    robot: {
      id:       row.robot_id as string,
      name:     (row.robot_name as string) || (row.robot_id as string),
      model:    (row.robot_model as string) || 'unknown',
      simOnly:  (row.robot_sim_only as boolean) ?? true,
    },
  };
}

export default function RobotProfilePage() {
  const params = useParams<{ id: string }>();
  const robotId = params.id;

  // Fetch robot profile
  const { data: profileData, isLoading: profileLoading, error: profileError } = useSWR(
    ['robot', robotId],
    () => api.getRobot(robotId),
  );

  // Fetch episodes for this robot
  const { data: episodesData, isLoading: episodesLoading } = useSWR(
    ['episodes', 'robot', robotId],
    () => api.getEpisodes({ robotId, sort: 'new', limit: 50 }),
  );

  // Fetch stats
  const { data: statsData } = useSWR(
    ['robot-stats', robotId],
    () => api.getRobotStats(robotId),
  );

  const robot = profileData?.robot;
  const stats = profileData?.stats;
  const episodes: Episode[] = (episodesData?.data || []).map(toEpisode);
  const taskStats = statsData?.task_stats || [];
  const dailyCounts = statsData?.daily_counts || [];

  if (profileError) {
    return (
      <PageContainer>
        <div className="max-w-4xl mx-auto text-center py-16">
          <p className="text-4xl mb-4">{'\u{1F916}'}</p>
          <h2 className="text-xl font-bold mb-2">Robot not found</h2>
          <p className="text-muted-foreground mb-4">No episodes found for this robot.</p>
          <Link href="/">
            <Button variant="outline">Back to Feed</Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to feed
        </Link>

        {profileLoading ? (
          <ProfileSkeleton />
        ) : robot ? (
          <>
            {/* Header */}
            <Card className="p-6 mb-6">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="text-2xl">
                    {(robot.name as string).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-2xl font-bold">{robot.name as string}</h1>
                    <Badge variant={(robot.sim_only as boolean) ? 'secondary' : 'default'}>
                      {(robot.sim_only as boolean) ? 'Simulation' : 'Real Robot'}
                    </Badge>
                  </div>
                  {robot.description && (
                    <p className="text-muted-foreground text-sm mb-3">{robot.description as string}</p>
                  )}

                  {/* Spec table */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    {robot.model && (
                      <div>
                        <span className="text-muted-foreground">Model</span>
                        <p className="font-medium">{robot.model as string}</p>
                      </div>
                    )}
                    {robot.manufacturer && (
                      <div>
                        <span className="text-muted-foreground">Manufacturer</span>
                        <p className="font-medium">{robot.manufacturer as string}</p>
                      </div>
                    )}
                    {robot.dof && (
                      <div>
                        <span className="text-muted-foreground">DOF</span>
                        <p className="font-medium">{robot.dof as number}</p>
                      </div>
                    )}
                    {robot.has_hand && (
                      <div>
                        <span className="text-muted-foreground">Hand</span>
                        <p className="font-medium">{(robot.hand_model as string) || 'Yes'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats bar */}
              {stats && (
                <>
                  <Separator className="my-4" />
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold">{stats.total_episodes as number}</p>
                      <p className="text-xs text-muted-foreground">Episodes</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {Math.round((stats.success_rate as number) * 100)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Success Rate</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {Math.round((stats.avg_completion_rate as number) * 100)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Avg Completion</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.task_categories as number}</p>
                      <p className="text-xs text-muted-foreground">Task Types</p>
                    </div>
                  </div>
                </>
              )}
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="episodes">
              <TabsList className="mb-4">
                <TabsTrigger value="episodes">Episodes</TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
                <TabsTrigger value="about">About</TabsTrigger>
              </TabsList>

              {/* Episodes Tab */}
              <TabsContent value="episodes">
                {episodesLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Card key={i} className="p-4">
                        <Skeleton className="h-48 w-full mb-3" />
                        <Skeleton className="h-5 w-3/4 mb-2" />
                        <Skeleton className="h-4 w-1/2" />
                      </Card>
                    ))}
                  </div>
                ) : episodes.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No episodes yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {episodes.map(ep => (
                      <EpisodeCard key={ep.id} episode={ep} showRobotHeader={false} />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Stats Tab */}
              <TabsContent value="stats">
                <div className="space-y-6">
                  {/* Task success rates */}
                  <Card className="p-5">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Success Rate by Task
                    </h3>
                    {taskStats.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No data yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {taskStats.map((task: Record<string, unknown>) => {
                          const rate = (task.success_rate as number) * 100;
                          return (
                            <div key={task.task_name as string}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium">{task.task_name as string}</span>
                                <span className="text-muted-foreground">
                                  {task.success_count as number}/{task.total as number} ({Math.round(rate)}%)
                                </span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all',
                                    rate >= 70 ? 'bg-green-500' : rate >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                                  )}
                                  style={{ width: `${rate}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>

                  {/* Daily activity */}
                  <Card className="p-5">
                    <h3 className="font-semibold mb-4">Activity (Last 30 Days)</h3>
                    {dailyCounts.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No recent activity.</p>
                    ) : (
                      <div className="flex items-end gap-1 h-24">
                        {dailyCounts.map((day: Record<string, unknown>) => {
                          const maxCount = Math.max(...dailyCounts.map((d: Record<string, unknown>) => d.count as number));
                          const height = maxCount > 0 ? ((day.count as number) / maxCount) * 100 : 0;
                          return (
                            <div
                              key={day.date as string}
                              className="flex-1 bg-primary/80 rounded-t-sm min-w-[4px]"
                              style={{ height: `${Math.max(height, 4)}%` }}
                              title={`${day.date}: ${day.count} episodes`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </div>
              </TabsContent>

              {/* About Tab */}
              <TabsContent value="about">
                <Card className="p-5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    About {robot.name as string}
                  </h3>
                  {robot.description ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-4">
                      {robot.description as string}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mb-4">No description provided.</p>
                  )}

                  {robot.created_at && (
                    <p className="text-xs text-muted-foreground">
                      Registered {formatRelativeTime(robot.created_at as string)}
                    </p>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <div className="grid grid-cols-4 gap-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
