/**
 * OB-228 — RateRenderer: the flat / per-match rate VISUAL, dispatched by structural
 * shape (rate / filtered_count per-match rate). Renders a prominent rate chip from the
 * analyzer view. Leaf (no renderer imports).
 */
'use client';
import { Percent, Filter } from 'lucide-react';
import { fmtRate, StepLine, type RendererProps } from './shared';

export function RateRenderer({ view, distribution }: RendererProps) {
  const rateStep = view.steps.find((s) => s.kind === 'rate' && typeof s.value === 'number');
  const countStep = view.steps.find((s) => s.kind === 'count' || s.kind === 'filter');
  const rate = rateStep?.value;
  const base = rateStep?.field ?? view.measureField;
  return (
    <div className="space-y-2">
      {countStep && <StepLine icon={<Filter className="h-4 w-4" />} tone="accent" label={countStep.label} />}
      {rate != null && (
        <div className="flex items-center gap-3">
          <span className="grid place-items-center h-10 w-10 rounded-md" style={{ background: 'var(--vl-indigo-50, #EEF0FB)', color: 'var(--vl-kpi-accent, #4446B8)' }}><Percent className="h-5 w-5" /></span>
          <div>
            <div className="font-mono text-2xl leading-none" style={{ color: 'var(--vl-kpi-accent, #4446B8)' }}>{fmtRate(rate)}</div>
            {base && <div className="text-xs text-muted-foreground mt-1">per {String(base)}{distribution?.resolved ? ` · ${distribution.totalEntities.toLocaleString()} records` : ''}</div>}
          </div>
        </div>
      )}
      {rate == null && view.steps.map((s, i) => <StepLine key={i} label={s.label} detail={s.detail} />)}
    </div>
  );
}
