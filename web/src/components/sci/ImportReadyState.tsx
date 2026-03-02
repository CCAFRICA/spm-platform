'use client';

// SCI ImportReadyState — Post-import summary + Calculate bridge
// OB-139 Phase 2 — Shows what was imported and provides next actions.
// Zero domain vocabulary. Korean Test applies.

import { Check, XCircle, ArrowRight, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AgentType, ContentUnitResult } from '@/lib/sci/sci-types';

const CLASSIFICATION_LABELS: Record<AgentType, string> = {
  plan: 'Plan Rules',
  entity: 'Team Roster',
  target: 'Perf. Targets',
  transaction: 'Operational',
};

interface ImportReadyStateProps {
  results: ContentUnitResult[];
  totalRowsCommitted: number;
  entityCount?: number;
  planName?: string;
  detectedPeriods?: string[];
  componentCount?: number;
  onNavigateToCalculate: () => void;
  onImportMore: () => void;
}

export function ImportReadyState({
  results,
  totalRowsCommitted,
  entityCount,
  planName,
  detectedPeriods,
  componentCount,
  onNavigateToCalculate,
  onImportMore,
}: ImportReadyStateProps) {
  const successResults = results.filter(r => r.success);
  const failedResults = results.filter(r => !r.success);
  const periodLabel = detectedPeriods && detectedPeriods.length > 0
    ? detectedPeriods[0]
    : null;

  // Build stat boxes — only show if data available
  const stats: Array<{ value: string; label: string }> = [];
  if (totalRowsCommitted > 0) {
    stats.push({ value: totalRowsCommitted.toLocaleString(), label: 'Records committed' });
  }
  if (entityCount != null && entityCount > 0) {
    stats.push({ value: entityCount.toLocaleString(), label: 'Entities' });
  }
  if (componentCount != null && componentCount > 0) {
    stats.push({ value: componentCount.toString(), label: 'Components' });
  }

  // Context rows — only show if data available
  const contextRows: Array<{ label: string; value: string }> = [];
  if (planName) {
    contextRows.push({ label: 'Plan', value: planName });
  }
  if (periodLabel) {
    contextRows.push({ label: 'Period', value: periodLabel });
  }
  contextRows.push({ label: 'Freshness', value: 'Just imported' });

  // Calculate button label
  const calculateLabel = periodLabel
    ? `Calculate ${periodLabel}`
    : 'Go to Calculate';

  return (
    <div className="space-y-6">
      {/* Main card */}
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-6">
        {/* Title */}
        <h2 className="text-base font-medium text-zinc-100 mb-6">Import Complete</h2>

        {/* Stat boxes */}
        {stats.length > 0 && (
          <div className={cn(
            'grid gap-6 mb-6',
            stats.length === 1 && 'grid-cols-1',
            stats.length === 2 && 'grid-cols-2',
            stats.length >= 3 && 'grid-cols-3',
          )}>
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl text-zinc-100 font-light tabular-nums">
                  {stat.value}
                </p>
                <p className="text-xs text-zinc-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Divider */}
        {stats.length > 0 && contextRows.length > 0 && (
          <div className="h-px bg-zinc-800 mb-6" />
        )}

        {/* Context section */}
        {contextRows.length > 0 && (
          <div className="space-y-2.5 mb-6">
            {contextRows.map((row, i) => (
              <div key={i} className="flex items-baseline justify-between">
                <span className="text-xs text-zinc-500">{row.label}</span>
                <span className="text-sm text-zinc-200">{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-zinc-800 mb-6" />

        {/* Import summary */}
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">What was imported</p>
          <div className="space-y-0.5">
            {successResults.map(r => (
              <div
                key={r.contentUnitId}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
              >
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                </div>
                <span className="text-sm text-zinc-300 flex-1 min-w-0 truncate">
                  {r.contentUnitId.split('::')[1] || r.contentUnitId}
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
            ))}
            {failedResults.map(r => (
              <div
                key={r.contentUnitId}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-500/[0.03]"
              >
                <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <XCircle className="w-2.5 h-2.5 text-red-400" />
                </div>
                <span className="text-sm text-red-400 flex-1 min-w-0 truncate">
                  {r.contentUnitId.split('::')[1] || r.contentUnitId}
                </span>
                <span className="text-xs text-zinc-600 flex-shrink-0">
                  {CLASSIFICATION_LABELS[r.classification]}
                </span>
                <span className="text-xs text-red-400 w-20 text-right flex-shrink-0">
                  Failed
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          onClick={onImportMore}
          variant="ghost"
          className="text-zinc-400 hover:text-zinc-200"
        >
          <Upload className="w-4 h-4" />
          Import more data
        </Button>
        <Button
          onClick={onNavigateToCalculate}
          className="bg-indigo-500 hover:bg-indigo-400 text-white"
        >
          {calculateLabel}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
