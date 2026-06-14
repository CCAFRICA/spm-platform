'use client';

/**
 * OB-206 §6.2 — Acceleration Cards (Certify / Coach / Intervene).
 *
 * The Bloodwork triage of the team, made actionable (Feb 19 IAP scorecard,
 * DS-008-A3 §4.3 Manager). Above the coaching grid: who to recognize, who to coach
 * (named at the entity × component intersection — DS-008-A2 coaching priority), who
 * to intervene with. Each card carries one proximate action (DS-013 Action Proximity).
 *
 * Derived from the heatmap (real per-component payout): Certify = top performer,
 * Coach = the entity × component with the largest gap to its peer max (highest
 * marginal return), Intervene = lowest performer. (R3: 3-consecutive-period decline
 * detection needs trajectory persistence — approximated here by lowest attainment.)
 *
 * Korean Test: component names come from the data; no domain literal.
 */

import { Award, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';

interface HeatmapEntity {
  entityId: string;
  entityName: string;
  totalPayout: number;
  components: Array<{ name: string; attainment: number; payout: number }>;
}

interface Props {
  entities: HeatmapEntity[];
  triage?: { exceeding: number; onTrack: number; needsAttention: number };
  formatCurrency: (n: number) => string;
  onEntityClick?: (entityId: string) => void;
}

export function AccelerationCards({ entities, triage, formatCurrency, onEntityClick }: Props) {
  if (entities.length === 0) return null;

  // Top performer (Certify) and lowest (Intervene).
  let top = entities[0], low = entities[0];
  for (const e of entities) {
    if (e.totalPayout > top.totalPayout) top = e;
    if (e.totalPayout < low.totalPayout) low = e;
  }

  // Coach: the entity × component with the largest gap to that component's peer max.
  const peerMax = new Map<string, number>();
  for (const e of entities) for (const c of e.components) peerMax.set(c.name, Math.max(peerMax.get(c.name) ?? 0, c.payout));
  let coach: { entityId: string; entityName: string; component: string; gap: number } | null = null;
  for (const e of entities) for (const c of e.components) {
    const gap = (peerMax.get(c.name) ?? 0) - c.payout;
    if (gap > 0 && (!coach || gap > coach.gap)) coach = { entityId: e.entityId, entityName: e.entityName, component: c.name, gap };
  }

  const Card = ({ tone, icon: Icon, label, count, name, detail, action, onClick }: {
    tone: 'emerald' | 'amber' | 'rose'; icon: typeof Award; label: string; count?: number;
    name: string; detail: string; action: string; onClick?: () => void;
  }) => {
    const tones = {
      emerald: 'border-l-emerald-500/60 text-emerald-300',
      amber: 'border-l-amber-500/60 text-amber-300',
      rose: 'border-l-rose-500/60 text-rose-300',
    }[tone];
    return (
      <div className={`rounded-lg bg-zinc-900/50 border border-zinc-800/60 border-l-[3px] ${tones} p-4 flex flex-col`}>
        <div className="flex items-center gap-1.5 mb-2">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-[10px] uppercase tracking-wider font-medium">{label}{count != null ? ` · ${count}` : ''}</span>
        </div>
        <p className="text-sm font-semibold text-slate-100 truncate">{name}</p>
        <p className="text-xs text-slate-500 mt-0.5 flex-1">{detail}</p>
        <button
          onClick={onClick}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-slate-100 transition-colors"
        >
          {action} <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card
        tone="emerald" icon={Award} label="Certify" count={triage?.exceeding}
        name={top.entityName}
        detail={`Top performer — ${formatCurrency(top.totalPayout)}.`}
        action="Recognize" onClick={() => onEntityClick?.(top.entityId)}
      />
      <Card
        tone="amber" icon={TrendingUp} label="Coach" count={triage?.needsAttention}
        name={coach ? `${coach.entityName} → ${coach.component}` : 'Team on pace'}
        detail={coach ? `+${formatCurrency(coach.gap)} to reach the top performer on this component.` : 'No standout coaching gap this period.'}
        action={coach ? "View detail" : 'View team'} onClick={() => coach && onEntityClick?.(coach.entityId)}
      />
      <Card
        tone="rose" icon={AlertTriangle}
        label="Intervene"
        name={low.entityName}
        detail={`Lowest attainment — ${formatCurrency(low.totalPayout)}. Schedule coaching.`}
        action="Schedule coaching" onClick={() => onEntityClick?.(low.entityId)}
      />
    </div>
  );
}
