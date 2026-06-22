/**
 * OB-228 — ConditionalRenderer: the gated/threshold VISUAL, dispatched by structural
 * shape (conditional). Renders the condition + the rate it gates, from the analyzer
 * view. Leaf (no renderer imports).
 */
'use client';
import { GitBranch } from 'lucide-react';
import { Chip, StepLine, fmtNum, type RendererProps } from './shared';

export function ConditionalRenderer({ view, distribution }: RendererProps) {
  return (
    <div className="space-y-1.5">
      {view.steps.map((s, i) => (
        <StepLine key={i} icon={<GitBranch className="h-4 w-4" />} tone={s.kind === 'rate' ? 'accent' : 'default'} label={s.label} detail={s.detail} />
      ))}
      {view.thresholds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {view.thresholds.map((t, i) => <Chip key={i}>{`${t.field ?? 'value'} ${t.op} ${fmtNum(t.value)}`}</Chip>)}
        </div>
      )}
      {distribution?.resolved && (
        <div className="text-xs text-muted-foreground pt-0.5">{distribution.totalEntities.toLocaleString()} records evaluated this period.</div>
      )}
    </div>
  );
}
