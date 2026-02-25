'use client';

/**
 * OperateSelector — Shared Plan x Period x Batch selector bar for Operate workspace.
 *
 * OB-92 Phase 3: Horizontal bar with three connected dropdowns.
 * Reads from and writes to OperateContext.
 * Appears at the top of every Operate page.
 */

import { useOperate } from '@/contexts/operate-context';
import { useCurrency } from '@/contexts/tenant-context';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  draft: '#a1a1aa',
  published: '#6366f1',
  archived: '#71717a',
  open: '#10b981',
  closed: '#ef4444',
  // Batch lifecycle
  DRAFT: '#a1a1aa',
  PREVIEW: '#6366f1',
  APPROVED: '#10b981',
  POSTED: '#059669',
  PUBLISHED: '#8b5cf6',
  REVERSED: '#ef4444',
};

function statusDot(status: string) {
  const color = STATUS_COLORS[status] ?? '#71717a';
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

export function OperateSelector() {
  const {
    plans, periods, batches,
    selectedPlanId, selectedPeriodId, selectedBatchId,
    selectPlan, selectPeriod, selectBatch,
    isLoading,
  } = useOperate();
  const { format: formatCurrency } = useCurrency();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-6 py-3" style={{ borderBottom: '1px solid rgba(39, 39, 42, 0.6)' }}>
        <div className="h-4 w-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-zinc-400">Loading selections...</span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-4 px-6 py-3"
      style={{ borderBottom: '1px solid rgba(39, 39, 42, 0.6)', background: 'rgba(9, 9, 11, 0.5)' }}
    >
      {/* Plan */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider whitespace-nowrap">Plan</label>
        <Select value={selectedPlanId ?? ''} onValueChange={selectPlan}>
          <SelectTrigger className="w-[200px] h-8 text-xs bg-zinc-900/80 border-zinc-700/50">
            <SelectValue placeholder="Select plan..." />
          </SelectTrigger>
          <SelectContent>
            {plans.map(p => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex items-center gap-1">
                  {statusDot(p.status)}
                  <span className="truncate">{p.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Separator */}
      <span className="text-zinc-700 text-xs">/</span>

      {/* Period */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider whitespace-nowrap">Period</label>
        <Select value={selectedPeriodId ?? ''} onValueChange={selectPeriod}>
          <SelectTrigger className="w-[180px] h-8 text-xs bg-zinc-900/80 border-zinc-700/50">
            <SelectValue placeholder="Select period..." />
          </SelectTrigger>
          <SelectContent>
            {periods.map(p => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex items-center gap-1">
                  {statusDot(p.status)}
                  <span className="truncate">{p.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Separator */}
      <span className="text-zinc-700 text-xs">/</span>

      {/* Calculation Run */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider whitespace-nowrap">Run</label>
        <Select value={selectedBatchId ?? ''} onValueChange={selectBatch}>
          <SelectTrigger className="w-[240px] h-8 text-xs bg-zinc-900/80 border-zinc-700/50">
            <SelectValue placeholder={batches.length === 0 ? 'No runs' : 'Select run...'} />
          </SelectTrigger>
          <SelectContent>
            {batches.map(b => {
              const date = new Date(b.createdAt);
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              return (
                <SelectItem key={b.id} value={b.id}>
                  <span className="flex items-center gap-1">
                    {statusDot(b.lifecycleState)}
                    <span className="truncate">
                      {b.lifecycleState} — {b.entityCount} ent — {formatCurrency(b.totalPayout)}
                    </span>
                    <span className="text-zinc-400 ml-1 text-[10px]">{dateStr}</span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Run count indicator */}
      {batches.length > 1 && (
        <span className="text-[10px] text-zinc-600">
          {batches.length} runs
        </span>
      )}
    </div>
  );
}
