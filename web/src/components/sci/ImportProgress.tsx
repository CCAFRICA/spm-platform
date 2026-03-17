'use client';

/**
 * ImportProgress — DS-016 Progressive Import Dashboard
 *
 * Shows per-file status for async processing jobs.
 * Polls processing_jobs table for real-time status updates.
 * Displays recognition tier per file (Tier 1/2/3).
 *
 * OB-174 Phase 4
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle2, AlertCircle, Zap, Clock, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
// OB-174: Button available for retry actions (future)

interface ProcessingJob {
  id: string;
  status: string;
  file_name: string;
  recognition_tier: number | null;
  classification_result: Record<string, unknown> | null;
  proposal: Record<string, unknown> | null;
  chunk_progress: Record<string, unknown> | null;
  error_detail: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface ImportProgressProps {
  sessionId: string;
  tenantId: string;
  onAllClassified: (jobs: ProcessingJob[]) => void;
  onError: (message: string) => void;
}

const TIER_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Recognized instantly', color: 'text-emerald-400' },
  2: { label: 'Similar structure found', color: 'text-amber-400' },
  3: { label: 'New structure — classifying', color: 'text-blue-400' },
};

const STATUS_CONFIG: Record<string, { icon: typeof Loader2; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-zinc-500', label: 'Queued' },
  classifying: { icon: Loader2, color: 'text-blue-400', label: 'Classifying...' },
  classified: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Ready' },
  confirming: { icon: Loader2, color: 'text-amber-400', label: 'Confirming...' },
  committing: { icon: Loader2, color: 'text-amber-400', label: 'Importing...' },
  committed: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Complete' },
  failed: { icon: AlertCircle, color: 'text-rose-400', label: 'Failed' },
};

const POLL_INTERVAL_MS = 2000;

export function ImportProgress({ sessionId, tenantId, onAllClassified, onError }: ImportProgressProps) {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [polling, setPolling] = useState(true);

  const fetchJobs = useCallback(async () => {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('processing_jobs')
      .select('*')
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[ImportProgress] Poll failed:', error.message);
      return;
    }

    if (data) {
      setJobs(data as ProcessingJob[]);

      // Check if all jobs are classified (or failed)
      const allDone = data.every((j: ProcessingJob) => j.status === 'classified' || j.status === 'committed' || j.status === 'failed');
      if (allDone && data.length > 0) {
        setPolling(false);
        const hasFailures = data.some((j: ProcessingJob) => j.status === 'failed');
        if (hasFailures) {
          onError(`${data.filter((j: ProcessingJob) => j.status === 'failed').length} file(s) failed to classify`);
        } else {
          onAllClassified(data as ProcessingJob[]);
        }
      }
    }
  }, [sessionId, tenantId, onAllClassified, onError]);

  // Poll for status updates
  useEffect(() => {
    if (!polling) return;

    fetchJobs();
    const interval = setInterval(fetchJobs, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [polling, fetchJobs]);

  const classifiedCount = jobs.filter(j => j.status === 'classified' || j.status === 'committed').length;
  const totalCount = jobs.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Processing Files</h2>
          <p className="text-sm text-zinc-500">
            {classifiedCount} of {totalCount} files classified
          </p>
        </div>
        {polling && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing...
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
          style={{ width: totalCount > 0 ? `${(classifiedCount / totalCount) * 100}%` : '0%' }}
        />
      </div>

      {/* Per-file cards */}
      <div className="space-y-2">
        {jobs.map(job => {
          const statusConfig = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
          const StatusIcon = statusConfig.icon;
          const tier = job.recognition_tier ? TIER_LABELS[job.recognition_tier] : null;
          const isAnimating = job.status === 'classifying' || job.status === 'committing';

          // Strip upload prefix from file_name for display
          const displayName = job.file_name
            .replace(/^\d+_[a-f0-9]{8}_/, '')
            .replace(/^\d+_/, '');

          return (
            <div
              key={job.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg border transition-all',
                job.status === 'failed'
                  ? 'bg-rose-500/5 border-rose-500/20'
                  : job.status === 'classified' || job.status === 'committed'
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-zinc-800/30 border-zinc-800/60',
              )}
            >
              <FileSpreadsheet className="w-4 h-4 text-zinc-500 flex-shrink-0" />

              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate">{displayName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusIcon className={cn('w-3 h-3', statusConfig.color, isAnimating && 'animate-spin')} />
                  <span className={cn('text-xs', statusConfig.color)}>{statusConfig.label}</span>
                  {tier && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className={cn('text-xs flex items-center gap-1', tier.color)}>
                        {job.recognition_tier === 1 && <Zap className="w-3 h-3" />}
                        {tier.label}
                      </span>
                    </>
                  )}
                </div>
                {job.error_detail && (
                  <p className="text-xs text-rose-400 mt-1 truncate">{job.error_detail}</p>
                )}
              </div>

              {/* Duration */}
              {job.started_at && (job.status === 'classified' || job.status === 'committed') && (
                <span className="text-xs text-zinc-600 tabular-nums flex-shrink-0">
                  {(() => {
                    const start = new Date(job.started_at).getTime();
                    const end = job.completed_at
                      ? new Date(job.completed_at).getTime()
                      : Date.now();
                    return `${((end - start) / 1000).toFixed(1)}s`;
                  })()}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {jobs.length === 0 && (
        <div className="text-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-600 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">Waiting for files to start processing...</p>
        </div>
      )}
    </div>
  );
}
