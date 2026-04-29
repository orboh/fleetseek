'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useExperience } from '@/hooks';
import { PageContainer } from '@/components/layout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Badge, Button, Avatar, AvatarFallback,
  Skeleton, Separator,
} from '@/components/ui';
import {
  AlertTriangle, CheckCircle, ArrowLeft, ThumbsUp,
  Cpu, Shield, ChevronRight, Tag, Clock,
} from 'lucide-react';
import { cn, formatRelativeTime, formatDateTime } from '@/lib/utils';
import type { DebugData, Experience } from '@/types';

const STATUS_COLORS: Record<Experience['status'], string> = {
  candidate:      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  ai_reviewed:    'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  human_reviewed: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  canonical:      'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
};

export default function ExperienceDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: experience, isLoading, error } = useExperience(params.id);

  if (error) {
    return (
      <PageContainer>
        <div className="max-w-4xl mx-auto text-center py-16">
          <p className="text-4xl mb-4">🔧</p>
          <h2 className="text-xl font-bold mb-2">Experience not found</h2>
          <p className="text-muted-foreground mb-4">This experience may have been removed or doesn&apos;t exist.</p>
          <Link href="/"><Button variant="outline">Back to Feed</Button></Link>
        </div>
      </PageContainer>
    );
  }

  const debugData = experience?.type === 'debug_note' ? (experience.data as DebugData) : null;

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to feed
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ─── Main Column ─── */}
          <div className="lg:col-span-2 space-y-4">
            {isLoading ? (
              <DetailSkeleton />
            ) : experience ? (
              <>
                {/* Header card */}
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {experience.robotId.slice(4, 6).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="font-mono text-sm text-muted-foreground">{experience.robotId}</span>
                    </div>
                    <time
                      className="ml-auto text-xs text-muted-foreground"
                      title={formatDateTime(experience.createdAt)}
                    >
                      {formatRelativeTime(experience.createdAt)}
                    </time>
                  </div>

                  {/* Type + Status badges */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {experience.type === 'debug_note' ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        DebugNote
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Skill
                      </span>
                    )}
                    <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', STATUS_COLORS[experience.status])}>
                      {experience.status.replace('_', ' ')}
                    </span>
                  </div>

                  <h1 className="text-xl font-bold mb-2">{experience.title}</h1>

                  {experience.description && (
                    <p className="text-muted-foreground text-sm mb-4 whitespace-pre-wrap">{experience.description}</p>
                  )}

                  {experience.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {experience.tags.map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                          <Tag className="h-2.5 w-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>

                {/* DebugNote-specific content */}
                {debugData && (
                  <>
                    {/* Symptoms */}
                    {debugData.symptoms && (
                      <Card className="p-5">
                        <h2 className="font-semibold mb-3 flex items-center gap-2 text-red-600 dark:text-red-400">
                          <AlertTriangle className="h-4 w-4" />
                          Symptoms
                        </h2>
                        {typeof debugData.symptoms === 'string' ? (
                          <p className="text-sm bg-muted/50 rounded p-3 whitespace-pre-wrap">{debugData.symptoms}</p>
                        ) : null}
                        {typeof debugData.symptoms === 'object' && debugData.symptoms.observed_behavior?.text && (
                          <div className="mb-3">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Observed Behavior</p>
                            <p className="text-sm bg-muted/50 rounded p-3 whitespace-pre-wrap">
                              {debugData.symptoms.observed_behavior.text}
                            </p>
                          </div>
                        )}
                        {debugData.symptoms.error_messages && debugData.symptoms.error_messages.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Error Messages</p>
                            <ul className="space-y-1">
                              {debugData.symptoms.error_messages.map((msg, i) => (
                                <li key={i} className="text-xs font-mono bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded px-3 py-1.5">
                                  {msg}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {debugData.symptoms.affected_joints && debugData.symptoms.affected_joints.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Affected Joints</p>
                            <div className="flex flex-wrap gap-1">
                              {debugData.symptoms.affected_joints.map(j => (
                                <span key={j} className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  {j}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </Card>
                    )}

                    {/* Root Cause */}
                    {debugData.root_cause && (
                      <Card className="p-5">
                        <h2 className="font-semibold mb-3 flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Root Cause
                        </h2>
                        <p className="text-sm bg-muted/50 rounded p-3 whitespace-pre-wrap">{debugData.root_cause}</p>
                      </Card>
                    )}

                    {/* Resolution */}
                    {debugData.resolution && (
                      <Card className="p-5">
                        <h2 className="font-semibold mb-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle className="h-4 w-4" />
                          Resolution
                          {typeof debugData.resolution === 'object' && debugData.resolution.type && (
                            <span className="ml-auto text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium normal-case">
                              {debugData.resolution.type.replace('_', ' ')}
                            </span>
                          )}
                        </h2>
                        {typeof debugData.resolution === 'string' ? (
                          <p className="text-sm bg-muted/50 rounded p-3 whitespace-pre-wrap">{debugData.resolution}</p>
                        ) : (
                          <>
                            {debugData.resolution.summary && (
                              <p className="text-sm bg-muted/50 rounded p-3 whitespace-pre-wrap mb-3">
                                {debugData.resolution.summary}
                              </p>
                            )}
                            {debugData.resolution.human_required && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Human intervention required
                              </p>
                            )}
                            {debugData.resolution.changes && Object.keys(debugData.resolution.changes).length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Changes</p>
                                <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                                  {JSON.stringify(debugData.resolution.changes, null, 2)}
                                </pre>
                              </div>
                            )}
                          </>
                        )}
                      </Card>
                    )}

                    {/* Failed Attempts */}
                    {debugData.failed_attempts && (
                      <Card className="p-5">
                        <h2 className="font-semibold mb-3 text-muted-foreground flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Failed Attempts
                        </h2>
                        {Array.isArray(debugData.failed_attempts) ? (
                          <ul className="space-y-2">
                            {debugData.failed_attempts.map((attempt, i) => (
                              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                <span className="text-xs font-medium bg-muted rounded px-1.5 py-0.5 mt-0.5 shrink-0">{i + 1}</span>
                                {attempt}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground bg-muted/50 rounded p-3 whitespace-pre-wrap">
                            {debugData.failed_attempts as unknown as string}
                          </p>
                        )}
                      </Card>
                    )}
                  </>
                )}
              </>
            ) : null}
          </div>

          {/* ─── Sidebar ─── */}
          <div className="space-y-4">
            {isLoading ? (
              <SidebarSkeleton />
            ) : experience ? (
              <>
                {/* Trust Score */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ThumbsUp className="h-4 w-4" />
                      Trust Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center mb-3">
                      <p className="text-3xl font-bold">{Math.round(experience.trustScore)}%</p>
                      <p className="text-xs text-muted-foreground">Bayesian average</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 mb-3">
                      <div
                        className={cn(
                          'h-2 rounded-full transition-all',
                          experience.trustScore >= 70 ? 'bg-green-500' :
                          experience.trustScore >= 40 ? 'bg-amber-500' : 'bg-red-500'
                        )}
                        style={{ width: `${Math.round(experience.trustScore)}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 rounded bg-muted">
                        <p className="font-bold">{experience.trustSignals.applications.total}</p>
                        <p className="text-muted-foreground">Applied</p>
                      </div>
                      <div className="p-2 rounded bg-muted">
                        <p className="font-bold text-green-600">{experience.trustSignals.applications.successful}</p>
                        <p className="text-muted-foreground">Success</p>
                      </div>
                      <div className="p-2 rounded bg-muted">
                        <p className="font-bold text-red-600">{experience.trustSignals.applications.failed}</p>
                        <p className="text-muted-foreground">Failed</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Robot Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      Source Robot
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {experience.robotId.slice(4, 6).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-xs font-mono text-muted-foreground break-all">{experience.robotId}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Applicability */}
                {Object.keys(experience.applicability).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Applicability</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">
                        {JSON.stringify(experience.applicability, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20 ml-auto" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-16" />
        </div>
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-16 w-full" />
      </Card>
      <Card className="p-5 space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-20 w-full" />
      </Card>
      <Card className="p-5 space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-20 w-full" />
      </Card>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-2 w-full" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      </Card>
      <Card className="p-5 space-y-3">
        <Skeleton className="h-5 w-20" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </Card>
    </div>
  );
}
