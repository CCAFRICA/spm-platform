'use client';

/**
 * OB-210 Unit A — Insight Agent narrative element (AI front-and-center, leads the surface).
 * Renders the deterministic synthesis from `buildInsightNarrative`. Tone → Bloodwork semantic color
 * (healthy quiet / attention amber / critical rose). DS-013: the narrative is the first element.
 */

import { Sparkles } from 'lucide-react';
import type { InsightNarrative as Narrative } from '@/lib/results/insight-narrative';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

const TONE: Record<Narrative['tone'], { ring: string; dot: string; label: string }> = {
  healthy:   { ring: 'border-emerald-500/30 bg-emerald-500/[0.05]', dot: 'text-emerald-400', label: 'text-emerald-300/80' },
  attention: { ring: 'border-amber-500/30 bg-amber-500/[0.06]',     dot: 'text-amber-400',   label: 'text-amber-300/80' },
  critical:  { ring: 'border-rose-500/30 bg-rose-500/[0.07]',       dot: 'text-rose-400',    label: 'text-rose-300/80' },
};

export function InsightNarrative({ narrative }: { narrative: Narrative }) {
  const isVialuce = useIsVialuce(); // OB-221: AI insight banner → design-spec .insight (gold-tinted)
  const t = TONE[narrative.tone];

  // Under Vialuce the AI narrative leads the surface as the gold .insight banner (spark chip + eyebrow
  // + headline + detail). The else-branch is the existing dark Bloodwork-toned ring, byte-identical.
  if (isVialuce) {
    return (
      <div className="insight">
        <div className="spark"><Sparkles className="h-[17px] w-[17px]" /></div>
        <div>
          <div className="lbl">INSIGHT</div>
          <b>{narrative.headline}</b>
          <p className="det">{narrative.detail}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border ${t.ring} px-5 py-4`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles className={`h-3.5 w-3.5 ${t.dot}`} />
        <span className={`text-[10px] uppercase tracking-wider font-medium ${t.label}`}>Insight</span>
      </div>
      <p className="text-base font-semibold text-slate-100 leading-snug">{narrative.headline}</p>
      <p className="text-xs text-slate-400 mt-1">{narrative.detail}</p>
    </div>
  );
}
