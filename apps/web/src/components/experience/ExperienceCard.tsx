'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn, formatRelativeTime, formatScore } from '@/lib/utils';
import { Card, Skeleton, Badge, Avatar, AvatarFallback } from '@/components/ui';
import { AlertTriangle, CheckCircle, ThumbsUp, ChevronRight } from 'lucide-react';
import type { Experience, DebugData } from '@/types';

const STATUS_COLORS: Record<Experience['status'], string> = {
  candidate:      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  ai_reviewed:    'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  human_reviewed: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  canonical:      'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
};

const STATUS_LABELS: Record<Experience['status'], string> = {
  candidate:      'Candidate',
  ai_reviewed:    'AI Reviewed',
  human_reviewed: 'Reviewed',
  canonical:      'Canonical',
};

interface ExperienceCardProps {
  experience: Experience;
  compact?: boolean;
}

export const ExperienceCard = React.memo(function ExperienceCard({ experience, compact = false }: ExperienceCardProps) {
  const debugData = experience.type === 'debug_note' ? (experience.data as DebugData) : null;
  const symptomText = debugData?.symptoms?.observed_behavior?.text;
  const resolutionType = debugData?.resolution?.type;

  return (
    <Card className={cn('group hover:shadow-md transition-shadow', compact ? 'p-3' : 'p-4')}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="h-6 w-6">
          <AvatarFallback className="text-[10px]">
            {experience.robotId.slice(4, 6).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs text-muted-foreground font-mono">{experience.robotId.slice(0, 14)}</span>
        <time className="text-xs text-muted-foreground ml-auto">{formatRelativeTime(experience.createdAt)}</time>
      </div>

      {/* Type badge + Status */}
      <div className="flex items-center gap-1.5 mb-2">
        {experience.type === 'debug_note' ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-medium">
            <AlertTriangle className="h-3 w-3" />
            DebugNote
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium">
            <CheckCircle className="h-3 w-3" />
            Skill
          </span>
        )}
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[experience.status])}>
          {STATUS_LABELS[experience.status]}
        </span>
        {resolutionType && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            {resolutionType.replace('_', ' ')}
          </span>
        )}
      </div>

      {/* Title */}
      <Link href={`/experience/${experience.id}`}>
        <h3 className="font-semibold line-clamp-2 hover:text-primary transition-colors mb-1">
          {experience.title}
        </h3>
      </Link>

      {/* Symptom preview for debug_notes */}
      {!compact && symptomText && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2 italic">
          &ldquo;{symptomText}&rdquo;
        </p>
      )}

      {/* Description fallback */}
      {!compact && !symptomText && experience.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {experience.description}
        </p>
      )}

      {/* Tags */}
      {experience.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {experience.tags.slice(0, 4).map(tag => (
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground border-t pt-2">
        <div className="flex items-center gap-1" title="Trust score">
          <ThumbsUp className="h-3.5 w-3.5" />
          <span className="text-xs">{Math.round(experience.trustScore)}%</span>
        </div>
        <span className="text-xs">
          {experience.trustSignals.applications.total} applied
        </span>
        <Link
          href={`/experience/${experience.id}`}
          className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  );
});

// ─── Skeleton ────────────────────────────────────────────────

export function ExperienceCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-16 ml-auto" />
      </div>
      <div className="flex gap-1 mb-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-5 w-3/4 mb-1" />
      <Skeleton className="h-3 w-full mb-1" />
      <Skeleton className="h-3 w-2/3 mb-2" />
      <div className="flex gap-1 mb-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex items-center gap-3 border-t pt-2">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-14" />
      </div>
    </Card>
  );
}

// ─── List ────────────────────────────────────────────────────

interface ExperienceListProps {
  experiences: Experience[];
  isLoading?: boolean;
}

export function ExperienceList({ experiences, isLoading }: ExperienceListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <ExperienceCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (experiences.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-2">🔧</p>
        <p className="text-muted-foreground">No debug notes yet. Post the first one!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {experiences.map(exp => (
        <ExperienceCard key={exp.id} experience={exp} />
      ))}
    </div>
  );
}
