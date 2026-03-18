'use client';

// SCI ExecutionProgress — Step-by-step processing view
// OB-139 Phase 1 — Replaces upload dropzone during execution.
// Zero domain vocabulary. Korean Test applies.

import { Check, XCircle, Loader2, RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AgentType, ContentUnitResult } from '@/lib/sci/sci-types';

const CLASSIFICATION_LABELS: Record<AgentType, string> = {
  plan: 'Plan Rules',
  entity: 'Team Roster',
  target: 'Perf. Targets',
  transaction: 'Transaction Data',
  reference: 'Reference Data',
};

export type ItemStatus = 'pending' | 'active' | 'done' | 'failed';

export interface ProgressItem {
  contentUnitId: string;
  tabName: string;
  classification: AgentType;
  status: ItemStatus;
  rowsProcessed?: number;
  error?: string;
}

interface ExecutionProgressProps {
  items: ProgressItem[];
  isComplete: boolean;
  hasErrors: boolean;
  onRetryFailed?: () => void;
  onContinue?: () => void;
  /** HF-087: Elapsed seconds for the currently processing item */
  elapsedSeconds?: number;
  /** HF-087: Whether retry is in progress (disables button) */
  isRetrying?: boolean;
}

export function ExecutionProgress({
  items,
  isComplete,
  hasErrors,
  onRetryFailed,
  onContinue,
  elapsedSeconds = 0,
  isRetrying = false,
}: ExecutionProgressProps) {
  const doneCount = items.filter(i => i.status === 'done').length;
  const failedCount = items.filter(i => i.status === 'failed').length;
  const hasActive = items.some(i => i.status === 'active');
  const totalCount = items.length;
  const totalRows = items
    .filter(i => i.status === 'done')
    .reduce((sum, i) => sum + (i.rowsProcessed || 0), 0);

  const progressPct = totalCount > 0
    ? Math.round(((doneCount + failedCount) / totalCount) * 100)
    : 0;

  const allDone = isComplete && !hasErrors;

  return (
    <div className="space-y-6">
      {/* Header + progress bar */}
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-6">
        <h2 className="text-base font-medium text-zinc-100 mb-1">
          {allDone ? 'Import complete' : 'Importing'}
        </h2>
        <p className="text-sm text-zinc-500 mb-4">
          {allDone
            ? `${doneCount} content unit${doneCount !== 1 ? 's' : ''} processed successfully.`
            : `Processing ${totalCount} content unit${totalCount !== 1 ? 's' : ''}...`}
        </p>

        {/* Progress bar */}
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 ease-out',
              hasErrors && isComplete ? 'bg-amber-500' : 'bg-indigo-500'
            )}
            style={{ width: `${Math.max(progressPct, 2)}%` }}
          />
        </div>

        {/* Progress label */}
        <p className="text-xs text-zinc-500 tabular-nums">
          {doneCount} of {totalCount}
          {totalRows > 0 && (
            <span> &middot; {totalRows.toLocaleString()} rows committed</span>
          )}
        </p>

        {/* HF-087: Elapsed time + reassurance for long operations */}
        {!allDone && hasActive && elapsedSeconds > 5 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-indigo-400 tabular-nums">
              Processing... {elapsedSeconds}s elapsed
            </p>
            {elapsedSeconds > 15 && (
              <p className="text-xs text-zinc-600">
                Plan interpretation may take up to 2 minutes. Please do not close this page.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Per-item list */}
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 divide-y divide-zinc-800/50">
        {items.map(item => (
          <div
            key={item.contentUnitId}
            className={cn(
              'flex items-center gap-3 px-5 py-3',
              item.status === 'done' && 'bg-emerald-500/[0.03]',
              item.status === 'failed' && 'bg-red-500/[0.03]',
            )}
          >
            {/* Status icon */}
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              {item.status === 'pending' && (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-700" />
              )}
              {item.status === 'active' && (
                <Loader2 className="w-4.5 h-4.5 text-indigo-400 animate-spin" />
              )}
              {item.status === 'done' && (
                <div className="w-4.5 h-4.5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
              )}
              {item.status === 'failed' && (
                <div className="w-4.5 h-4.5 rounded-full bg-red-500/20 flex items-center justify-center">
                  <XCircle className="w-3 h-3 text-red-400" />
                </div>
              )}
            </div>

            {/* Content — OB-175: show source file alongside tab name */}
            <div className="flex-1 min-w-0">
              <span className={cn(
                'text-sm',
                item.status === 'pending' ? 'text-zinc-600' :
                item.status === 'active' ? 'text-zinc-200' :
                item.status === 'done' ? 'text-zinc-300' :
                'text-red-400'
              )}>
                {item.tabName}
                {(() => {
                  const parts = item.contentUnitId.split('::');
                  const sf = parts.length >= 2 ? parts[0].replace(/^\d+_\d+_[a-f0-9]{8}_/, '') : null;
                  return sf && sf !== item.tabName ? (
                    <span className="text-zinc-500 text-xs ml-1.5">{sf}</span>
                  ) : null;
                })()}
              </span>
            </div>

            {/* Classification */}
            <span className="text-xs text-zinc-600 flex-shrink-0">
              {CLASSIFICATION_LABELS[item.classification]}
            </span>

            {/* Row count / status */}
            <span className={cn(
              'text-xs tabular-nums w-28 text-right flex-shrink-0',
              item.status === 'done' ? 'text-zinc-500' :
              item.status === 'active' ? 'text-indigo-400' :
              item.status === 'failed' ? 'text-red-400' :
              'text-zinc-700'
            )}>
              {item.status === 'done' && item.rowsProcessed
                ? `${item.rowsProcessed.toLocaleString()} rows`
                : item.status === 'active'
                  ? 'processing...'
                  : item.status === 'failed'
                    ? (item.error || 'Failed')
                    : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Error actions */}
      {isComplete && hasErrors && (
        <div className="rounded-xl bg-zinc-900/80 border border-amber-500/20 p-5">
          <p className="text-sm text-zinc-300 mb-1">
            {doneCount} of {totalCount} processed successfully.
          </p>
          {items.filter(i => i.status === 'failed').map(item => (
            <p key={item.contentUnitId} className="text-xs text-red-400 mt-1">
              {item.tabName} &mdash; {item.error || 'Processing failed'}
            </p>
          ))}
          <div className="flex items-center gap-3 mt-4">
            {onRetryFailed && (
              <Button
                onClick={onRetryFailed}
                size="sm"
                disabled={isRetrying}
                className="bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isRetrying && 'animate-spin')} />
                {isRetrying ? 'Retrying...' : 'Retry failed'}
              </Button>
            )}
            {onContinue && doneCount > 0 && (
              <Button
                onClick={onContinue}
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-zinc-200"
              >
                Continue
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// HELPER: Convert SCIExecution internal state → ProgressItem[]
// ============================================================

export function toProgressItems(
  units: Array<{
    contentUnitId: string;
    tabName: string;
    classification: AgentType;
    status: 'pending' | 'processing' | 'complete' | 'error';
    result?: ContentUnitResult;
    error?: string;
  }>
): ProgressItem[] {
  return units.map(u => ({
    contentUnitId: u.contentUnitId,
    tabName: u.tabName,
    classification: u.classification,
    status: u.status === 'processing' ? 'active' :
            u.status === 'complete' ? 'done' :
            u.status === 'error' ? 'failed' :
            'pending',
    rowsProcessed: u.result?.rowsProcessed,
    error: u.error,
  }));
}
