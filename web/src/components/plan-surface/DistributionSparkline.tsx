/**
 * OB-228 — DistributionSparkline (Concept ①): where the tenant's actual entities land
 * inside this component, for the selected period. Aggregated server-side; this only
 * renders bucket counts (§A.2). When the binding did not resolve (HALT-2), it shows an
 * honest "no data source" flag — NEVER a fabricated distribution.
 */
'use client';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import type { ComponentDistribution } from '@/lib/plan-surface';

const ACCENT = 'var(--vl-kpi-accent, #4446B8)';

export function DistributionSparkline({ distribution, loading }: { distribution: ComponentDistribution | null; loading?: boolean }) {
  if (loading) {
    return <div className="h-12 rounded-md bg-muted/40 animate-pulse" aria-label="loading distribution" />;
  }
  if (!distribution) return null;

  if (!distribution.resolved) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--vl-cta-signal, #E8A838)' }} />
        <span>No live distribution — the bound column is not present in this period&apos;s data (binding unresolved). Surfaced, not fabricated.</span>
      </div>
    );
  }

  const buckets = distribution.buckets;
  if (buckets.length === 0) {
    return <div className="text-xs text-muted-foreground">No entities in this period.</div>;
  }
  const max = Math.max(1, ...buckets.map((b) => b.entityCount));
  const grainLabel = distribution.grain === 'entity' ? 'entities' : 'records';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />Distribution</span>
        <span className="font-mono">{distribution.totalEntities.toLocaleString()} {grainLabel}</span>
      </div>
      <div className="flex items-end gap-1 h-16">
        {buckets.map((b, i) => {
          const h = Math.max(3, Math.round((b.entityCount / max) * 100));
          return (
            <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end group relative" title={`${b.label}: ${b.entityCount}`}>
              <span className="text-[9px] font-mono text-muted-foreground mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-3">{b.entityCount}</span>
              <div className="w-full rounded-t-sm transition-all" style={{ height: `${h}%`, background: ACCENT, opacity: 0.35 + 0.65 * (b.entityCount / max) }} />
            </div>
          );
        })}
      </div>
      <div className="flex items-stretch gap-1">
        {buckets.map((b, i) => (
          <div key={i} className="flex-1 min-w-0 text-center text-[9px] text-muted-foreground truncate" title={b.label}>{b.label}</div>
        ))}
      </div>
    </div>
  );
}
