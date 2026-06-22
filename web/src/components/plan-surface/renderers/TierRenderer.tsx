/**
 * OB-228 — TierRenderer: the band/tier-ladder VISUAL, dispatched by structural shape
 * (banded_lookup / banded_conditional), not by a componentType literal. Renders the
 * tier table from the analyzer's band step + overlays the period distribution. Leaf
 * (no renderer imports). Honors the Korean Test: the ladder comes from the data's
 * structure, never a hardcoded vocabulary.
 */
'use client';
import { Layers } from 'lucide-react';
import { BandTable, type RendererProps } from './shared';

export function TierRenderer({ view, distribution }: RendererProps) {
  const bandStep = view.steps.find((s) => s.kind === 'band' && s.bands?.length);
  const bands = bandStep?.bands
    ?? (view.bandOutputs ?? []).map((o, i) => ({ lowerLabel: view.breaks && i > 0 ? `≥ ${view.breaks[i - 1]}` : i === 0 ? 'base' : `band ${i}`, output: o }));
  const refField = bandStep?.field ?? view.bandReferenceField ?? view.measureField ?? '—';
  const dist = distribution?.resolved && distribution.grain === 'row' ? distribution.buckets : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Layers className="h-3.5 w-3.5" />{view.measureField ? `${view.measureField} × rate, banded by ${refField}` : `Rate banded by ${refField}`}</div>
      {bands.length ? <BandTable refField={String(refField)} bands={bands} distribution={dist} /> : <div className="text-sm text-muted-foreground">Banded rate</div>}
    </div>
  );
}
