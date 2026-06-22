/**
 * OB-228 — PlanCanvas (Zone B, Concept ①). Renders the selected plan: a variant
 * selector (when population_config yields >1 variant), a period selector (scopes the
 * distribution overlays), and the component-card graph. Phase 4/5 slots (edit,
 * confidence, provenance) are threaded through to ComponentCard.
 */
'use client';
import { useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import type { PlanStructure, CanonicalComponent } from '@/lib/plan-surface';
import { ComponentCard } from './ComponentCard';

export interface PeriodOption { id: string; label: string }

export interface PlanCanvasProps {
  plan: PlanStructure;
  periods: PeriodOption[];
  selectedPeriodId: string | null;
  onPeriodChange: (id: string) => void;
  // Phase 4/5 slots
  confidenceGlyph?: (c: CanonicalComponent) => React.ReactNode;
  provenanceSlot?: (c: CanonicalComponent) => React.ReactNode;
  editSlot?: (c: CanonicalComponent) => React.ReactNode;
}

export function PlanCanvas({ plan, periods, selectedPeriodId, onPeriodChange, confidenceGlyph, provenanceSlot, editSlot }: PlanCanvasProps) {
  const [variantIdx, setVariantIdx] = useState(0);
  const variant = plan.variants[variantIdx] ?? plan.variants[0];
  const components = useMemo(() => variant?.components ?? [], [variant]);

  return (
    <div className="space-y-4">
      {/* controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {plan.variants.length > 1 && (
            <select
              value={variantIdx}
              onChange={(e) => setVariantIdx(Number(e.target.value))}
              className="text-sm rounded-md border border-border bg-card px-2.5 py-1.5"
            >
              {plan.variants.map((v, i) => <option key={v.variantId} value={i}>{v.variantName}</option>)}
            </select>
          )}
          {plan.variants.length <= 1 && variant && (
            <span className="text-sm text-muted-foreground">{variant.variantName}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <select
            value={selectedPeriodId ?? ''}
            onChange={(e) => onPeriodChange(e.target.value)}
            className="text-sm rounded-md border border-border bg-card px-2.5 py-1.5"
          >
            {periods.length === 0 && <option value="">No periods</option>}
            {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {plan.shapeUnrecognized && (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          This plan&apos;s component shape was not recognized as a known dialect — rendered generically from its raw structure (Korean Test: carried, not dropped).
        </div>
      )}

      {/* component-card graph */}
      {components.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">This variant has no components.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {components.map((c) => (
            <ComponentCard
              key={c.id}
              component={c}
              ruleSetId={plan.id}
              periodId={selectedPeriodId}
              confidenceGlyph={confidenceGlyph?.(c)}
              provenanceSlot={provenanceSlot}
              editSlot={editSlot}
            />
          ))}
        </div>
      )}
    </div>
  );
}
