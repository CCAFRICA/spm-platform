'use client';

// PlanCard — Single plan card with readiness state, calculate trigger, last result
// OB-130 Phase 2 — Zero domain vocabulary. Korean Test applies.

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PlanReadiness {
  planId: string;
  planName: string;
  entityCount: number;
  hasBindings: boolean;
  dataRowCount: number;
  lastBatchDate: string | null;
  lastTotal: number | null;
}

interface ComponentSummary {
  name: string;
  total: number;
}

interface PlanCardProps {
  plan: PlanReadiness;
  periodId: string | null;
  tenantId: string;
  formatCurrency: (value: number) => string;
  isSelected: boolean;
  onSelect: (planId: string) => void;
  onCalculateComplete: () => void;
  priorPeriodTotal?: number | null;
}

export function PlanCard({
  plan,
  periodId,
  tenantId,
  formatCurrency,
  isSelected,
  onSelect,
  onCalculateComplete,
  priorPeriodTotal,
}: PlanCardProps) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calcSuccess, setCalcSuccess] = useState<string | null>(null);
  const [componentBreakdown, setComponentBreakdown] = useState<ComponentSummary[] | null>(null);
  const [calcTotal, setCalcTotal] = useState<number | null>(null);
  const [excludedCount, setExcludedCount] = useState<number>(0);

  const isReady = plan.entityCount > 0 && plan.hasBindings && plan.dataRowCount > 0;

  const handleCalculate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!periodId || !tenantId) return;

    setIsCalculating(true);
    setCalcError(null);
    setCalcSuccess(null);
    setComponentBreakdown(null);
    setCalcTotal(null);

    try {
      const response = await fetch('/api/calculation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          periodId,
          ruleSetId: plan.planId,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        setCalcError(result.error || `Processing failed (${response.status})`);
      } else {
        const count = result.entityCount || 0;
        const total = result.totalPayout || 0;
        const excluded = result.excludedCount || 0;
        setCalcSuccess(`${count} entities processed — ${formatCurrency(total)}`);
        setCalcTotal(total);
        setExcludedCount(excluded);

        // Extract component totals from results
        if (result.results && Array.isArray(result.results)) {
          const compMap = new Map<string, number>();
          for (const entity of result.results) {
            if (entity.components && Array.isArray(entity.components)) {
              for (const comp of entity.components) {
                compMap.set(comp.name, (compMap.get(comp.name) || 0) + comp.payout);
              }
            }
          }
          setComponentBreakdown(
            Array.from(compMap.entries())
              .map(([name, total]) => ({ name, total }))
              .sort((a, b) => b.total - a.total)
          );
        }

        onCalculateComplete();
      }
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setIsCalculating(false);
    }
  }, [periodId, tenantId, plan.planId, formatCurrency, onCalculateComplete]);

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200',
        isSelected
          ? 'ring-2 ring-indigo-500/50 border-indigo-500/30'
          : 'hover:border-zinc-600',
        isReady ? '' : 'opacity-80'
      )}
      onClick={() => onSelect(plan.planId)}
    >
      <CardContent className="p-5">
        {/* Header: name + readiness badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {isSelected ? (
              <ChevronDown className="w-4 h-4 text-indigo-400 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
            )}
            <h3 className="text-sm font-medium text-zinc-200 truncate">
              {plan.planName}
            </h3>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] shrink-0',
              (calcSuccess || plan.lastBatchDate)
                ? 'text-emerald-400 border-emerald-600'
                : isReady
                  ? 'text-indigo-400 border-indigo-600'
                  : 'text-amber-400 border-amber-600'
            )}
          >
            {(calcSuccess || plan.lastBatchDate) ? 'Calculated' : isReady ? 'Ready' : 'Partial'}
          </Badge>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-zinc-500 mb-3">
          <span className="flex items-center gap-1">
            {plan.entityCount > 0 ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-500" />
            )}
            {plan.entityCount} entities
          </span>
          <span className="flex items-center gap-1">
            {plan.hasBindings ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-500" />
            )}
            {plan.hasBindings ? 'Bound' : 'No bindings'}
          </span>
          <span>
            {plan.dataRowCount.toLocaleString()} rows
          </span>
        </div>

        {/* Last result */}
        {plan.lastBatchDate && (
          <div className="text-xs text-zinc-500 mb-3 flex items-center justify-between">
            <span>Last: {new Date(plan.lastBatchDate).toLocaleDateString()}</span>
            {plan.lastTotal !== null && (
              <span className="font-medium text-emerald-400">
                {formatCurrency(plan.lastTotal)}
              </span>
            )}
          </div>
        )}

        {/* Component breakdown (after calculation) */}
        {componentBreakdown && componentBreakdown.length > 0 && (
          <div className="mb-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-2 font-medium">Components</p>
            <div className="space-y-1.5">
              {componentBreakdown.map(comp => (
                <div key={comp.name} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 truncate mr-2">{comp.name}</span>
                  <span className="font-mono tabular-nums text-zinc-200 shrink-0">
                    {formatCurrency(comp.total)}
                  </span>
                </div>
              ))}
            </div>
            {calcTotal != null && (
              <div className="mt-2 pt-2 border-t border-zinc-700/50 flex items-center justify-between text-xs">
                <span className="text-zinc-400 font-medium">Total</span>
                <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                  {formatCurrency(calcTotal)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Period comparison */}
        {calcTotal != null && (
          <div className="mb-3 text-xs">
            {priorPeriodTotal != null && priorPeriodTotal > 0 ? (() => {
              const delta = calcTotal - priorPeriodTotal;
              const deltaPct = (delta / priorPeriodTotal) * 100;
              return (
                <div className="flex items-center gap-1.5">
                  {delta >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-rose-400" />
                  )}
                  <span className={cn(
                    'font-medium',
                    delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    vs. {formatCurrency(priorPeriodTotal)} last period ({delta >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                  </span>
                </div>
              );
            })() : (
              <span className="text-zinc-500 italic">First calculation — no prior period</span>
            )}
          </div>
        )}

        {/* Calculate button */}
        <Button
          size="sm"
          className={cn(
            'w-full',
            isReady
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
              : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
          )}
          disabled={isCalculating || !periodId}
          onClick={handleCalculate}
        >
          {isCalculating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Calculating...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              {(calcSuccess || plan.lastBatchDate) ? 'Recalculate' : 'Calculate'}
            </>
          )}
        </Button>

        {/* Verify Results link */}
        {plan.lastBatchDate && (
          <Link
            href={`/operate/reconciliation?planId=${plan.planId}`}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-violet-400 mt-2 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Verify Results
          </Link>
        )}

        {/* Feedback */}
        {calcError && (
          <p className="text-xs text-red-400 mt-2">{calcError}</p>
        )}
        {calcSuccess && !componentBreakdown && (
          <p className="text-xs text-emerald-400 mt-2">{calcSuccess}</p>
        )}
        {excludedCount > 0 && (
          <p className="text-[10px] text-zinc-500 mt-1">{excludedCount} entities excluded (no qualifying variant)</p>
        )}

        {/* OB-176: Post-calculation guidance */}
        {calcSuccess && componentBreakdown && (
          <Link
            href="/stream"
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 mt-2 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            View Intelligence
            <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
