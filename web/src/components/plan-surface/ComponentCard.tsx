/**
 * OB-228 — ComponentCard (Concept ①). Header (name + primitive glyph + bound-column
 * chip + confidence-glyph slot) · body (type-dispatched renderer, Korean Test) · footer
 * (DistributionSparkline + confidence slot). The confidence slots are present-but-dormant
 * in Phase 3; Phase 5 lights them (ConfidenceOverlay / ProvenancePanel).
 *
 * Distribution is fetched lazily per selected period from the server-aggregating API.
 */
'use client';
import { useEffect, useState } from 'react';
import { Layers, RotateCcw, Filter, GitBranch, Boxes, Link2 } from 'lucide-react';
import { analyzeComponent, type CanonicalComponent, type ComponentDistribution } from '@/lib/plan-surface';
import { resolveRenderer } from './renderers';
import { DistributionSparkline } from './DistributionSparkline';

const SHAPE_GLYPH: Record<string, React.ReactNode> = {
  banded_lookup: <Layers className="h-4 w-4" />,
  banded_conditional: <Layers className="h-4 w-4" />,
  conditional: <GitBranch className="h-4 w-4" />,
  filtered_count: <Filter className="h-4 w-4" />,
  reversal: <RotateCcw className="h-4 w-4" />,
  arithmetic: <Boxes className="h-4 w-4" />,
};

export interface ComponentCardProps {
  component: CanonicalComponent;
  ruleSetId: string;
  periodId: string | null;
  /** Phase 5 slots (dormant in Phase 3). */
  confidenceGlyph?: React.ReactNode;
  provenanceSlot?: (component: CanonicalComponent) => React.ReactNode;
  /** Phase 4 edit affordance (dormant in Phase 3). */
  editSlot?: (component: CanonicalComponent) => React.ReactNode;
}

export function ComponentCard({ component, ruleSetId, periodId, confidenceGlyph, provenanceSlot, editSlot }: ComponentCardProps) {
  const view = analyzeComponent(component);
  const Renderer = resolveRenderer(component.componentType);
  const [dist, setDist] = useState<ComponentDistribution | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!periodId) { setDist(null); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/plan-surface/distribution?ruleSetId=${ruleSetId}&componentId=${encodeURIComponent(component.id)}&periodId=${periodId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setDist(d); })
      .catch(() => { if (!cancelled) setDist(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ruleSetId, component.id, periodId]);

  const glyph = SHAPE_GLYPH[view.shape] ?? <Boxes className="h-4 w-4" />;

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="grid place-items-center h-8 w-8 rounded-lg shrink-0" style={{ background: 'var(--vl-indigo-50, #EEF0FB)', color: 'var(--vl-kpi-accent, #4446B8)' }}>{glyph}</span>
          <div className="min-w-0">
            <div className="font-medium text-foreground leading-tight truncate">{component.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{view.summary}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {confidenceGlyph /* Phase 5 slot */}
          {editSlot?.(component) /* Phase 4 slot */}
        </div>
      </div>

      {/* Body — type-dispatched renderer (Korean Test) */}
      <div className="px-4 py-3 flex-1">
        <Renderer component={component} view={view} distribution={dist} />
      </div>

      {/* Footer — bound-column chip + distribution + provenance slot */}
      <div className="px-4 pb-4 pt-1 space-y-2.5">
        {component.binding.column && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="h-3 w-3" />
            <span>bound to</span>
            <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-foreground">{component.binding.column}</code>
            {provenanceSlot?.(component) /* Phase 5 slot */}
          </div>
        )}
        <DistributionSparkline distribution={dist} loading={loading} />
      </div>
    </div>
  );
}
