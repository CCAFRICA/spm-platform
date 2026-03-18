'use client';

// SCI ImportReadyState — Post-import summary + Calculate bridge
// OB-142 Phase 4 — Honest status, component readiness, correct next actions.
// Zero domain vocabulary. Korean Test applies.

import { Check, XCircle, ArrowRight, Upload, AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentType, ContentUnitResult } from '@/lib/sci/sci-types';

const CLASSIFICATION_LABELS: Record<AgentType, string> = {
  plan: 'Plan Rules',
  entity: 'Team Roster',
  target: 'Perf. Targets',
  transaction: 'Transaction Data',
  reference: 'Reference Data',
};

interface ImportReadyStateProps {
  results: ContentUnitResult[];
  totalRowsCommitted: number;
  entityCount?: number;
  planName?: string;
  componentCount?: number;
  sourceDateRange?: { min: string; max: string } | null;
  onNavigateToCalculate: () => void;
  onImportMore: () => void;
  onRetryFailed?: () => void;
}

export function ImportReadyState({
  results,
  totalRowsCommitted,
  entityCount,
  planName,
  componentCount,
  sourceDateRange,
  onNavigateToCalculate,
  onImportMore,
  onRetryFailed,
}: ImportReadyStateProps) {
  const successResults = results.filter(r => r.success);
  const failedResults = results.filter(r => !r.success);
  const hasFailed = failedResults.length > 0;
  // Title: honest about partial success
  const title = hasFailed
    ? `Import partially complete — ${successResults.length} of ${results.length} succeeded`
    : 'Import Complete';

  // Calculate readiness: need plan + entities + data
  const hasPlan = !!planName;
  const hasEntities = (entityCount ?? 0) > 0;
  const hasData = totalRowsCommitted > 0;
  const calculateReady = hasPlan && hasEntities && hasData;

  const calculateLabel = 'Go to Calculate';

  return (
    <div className="space-y-6">
      {/* Main card */}
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-6">
        {/* Title */}
        <div className="flex items-center gap-2 mb-6">
          {hasFailed ? (
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          ) : (
            <Check className="w-5 h-5 text-emerald-400" />
          )}
          <h2 className="text-base font-medium text-zinc-100">{title}</h2>
        </div>

        {/* Stat boxes */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="text-center">
            <p className="text-2xl text-zinc-100 font-light tabular-nums">
              {totalRowsCommitted.toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500 mt-1">Records imported</p>
          </div>
          <div className="text-center">
            <p className="text-2xl text-zinc-100 font-light tabular-nums">
              {entityCount != null ? entityCount.toLocaleString() : '—'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">Entities matched</p>
          </div>
          <div className="text-center">
            <p className="text-2xl text-zinc-100 font-light tabular-nums">
              {componentCount != null ? componentCount.toString() : '—'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">Components</p>
          </div>
        </div>

        {/* Context section */}
        <div className="h-px bg-zinc-800 mb-6" />
        <div className="space-y-2.5 mb-6">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-zinc-500">Plan</span>
            <span className={cn('text-sm', planName ? 'text-zinc-200' : 'text-zinc-600')}>
              {planName || 'No active plan'}
            </span>
          </div>
          {sourceDateRange && (
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-zinc-500">Source dates</span>
              <span className="text-sm text-zinc-200">
                {sourceDateRange.min} through {sourceDateRange.max}
              </span>
            </div>
          )}
        </div>

        {/* Import results */}
        <div className="h-px bg-zinc-800 mb-6" />
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">What was imported</p>
          <div className="space-y-0.5">
            {successResults.map(r => {
              // OB-175: Extract file name and tab name from HF-142 contentUnitId format
              const parts = r.contentUnitId.split('::');
              const sourceFile = parts.length >= 2
                ? parts[0].replace(/^\d+_\d+_[a-f0-9]{8}_/, '')
                : null;
              const tabName = parts[1] || r.contentUnitId;
              return (
              <div key={r.contentUnitId} className="flex items-center gap-3 px-3 py-2 rounded-lg">
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                </div>
                <span className="text-sm text-zinc-300 flex-1 min-w-0 truncate">
                  {tabName}
                  {sourceFile && (
                    <span className="text-zinc-500 text-xs ml-1.5">{sourceFile}</span>
                  )}
                </span>
                <span className="text-xs text-zinc-600 flex-shrink-0">
                  {CLASSIFICATION_LABELS[r.classification]}
                </span>
                <span className="text-xs text-zinc-500 tabular-nums w-20 text-right flex-shrink-0">
                  {r.rowsProcessed > 0
                    ? `${r.rowsProcessed.toLocaleString()} rows`
                    : 'Acknowledged'}
                </span>
              </div>
              );
            })}

            {/* Failed items — show error messages, not UUIDs */}
            {failedResults.map(r => {
              const fParts = r.contentUnitId.split('::');
              const fSourceFile = fParts.length >= 2
                ? fParts[0].replace(/^\d+_\d+_[a-f0-9]{8}_/, '')
                : null;
              const fTabName = fParts[1] || r.contentUnitId;
              return (
              <div key={r.contentUnitId} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-red-500/[0.05]">
                <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <XCircle className="w-2.5 h-2.5 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-red-400 block truncate">
                    {fTabName}
                    {fSourceFile && (
                      <span className="text-red-400/70 text-xs ml-1.5">{fSourceFile}</span>
                    )}
                  </span>
                  {r.error && (
                    <span className="text-xs text-red-400/70 block mt-0.5">
                      {r.error}
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-600 flex-shrink-0">
                  {CLASSIFICATION_LABELS[r.classification]}
                </span>
              </div>
              );
            })}
          </div>
        </div>

        {/* Retry failed button */}
        {hasFailed && onRetryFailed && (
          <div className="mt-4">
            <button
              onClick={onRetryFailed}
              className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry failed items
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onImportMore}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Import more data
        </button>
        <button
          onClick={onNavigateToCalculate}
          disabled={!calculateReady}
          className={cn(
            'flex items-center gap-2 px-5 py-2 rounded-lg font-medium text-sm transition-colors',
            calculateReady
              ? 'bg-indigo-600 text-white hover:bg-indigo-500'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          )}
        >
          {calculateLabel}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Readiness warning */}
      {!calculateReady && (
        <div className="text-xs text-zinc-600 text-center">
          {!hasPlan && 'No active plan found. '}
          {!hasEntities && 'No entities matched. '}
          {!hasData && 'No data imported. '}
          Import more data to enable calculation.
        </div>
      )}
    </div>
  );
}
