'use client';

/**
 * OB-208 D-2/D-3 — Drill-through intelligence view (DS-003 Rule 6; DS-013 Five Elements).
 *
 * A claim ("4 entities >2σ above mean") is drillable to a FIVE-ELEMENTS SYNTHESIS of exactly those
 * entities — value / context / comparison / impact — with the entities listed beneath so the screen
 * VERIFIES ITS OWN ASSERTION (the user sees the 4 entities and counts them). It is a synthesis, not a
 * raw table: each entity shows only its relevant figure, framed by the aggregate above it.
 *
 * Korean Test: domain-agnostic — the claim text and entity rows come from props; no domain literal.
 */

import { X } from 'lucide-react';

interface DrillEntity { entityId: string; entityName: string; totalPayout: number; }

interface Props {
  claim: string;                 // the assertion being verified
  entityIds: string[];           // the entities the claim is about (may be capped upstream — see claimedCount)
  claimedCount: number;          // the claim's FULL entity count (anomaly.entityCount), to reconcile honestly
  results: DrillEntity[];        // the full population (to resolve + contextualize the subset)
  populationMean: number;
  populationTotal: number;
  formatCurrency: (n: number) => string;
  onClose: () => void;
}

export function AnomalyDrillThrough({ claim, entityIds, claimedCount, results, populationMean, populationTotal, formatCurrency, onClose }: Props) {
  const idSet = new Set(entityIds);
  const subset = results.filter(r => idSet.has(r.entityId));
  const subsetTotal = subset.reduce((s, r) => s + r.totalPayout, 0);
  const subsetMean = subset.length > 0 ? subsetTotal / subset.length : 0;
  const pctOfTotal = populationTotal > 0 ? (subsetTotal / populationTotal) * 100 : 0;
  const vsPop = populationMean > 0 ? ((subsetMean - populationMean) / populationMean) * 100 : 0;

  return (
    <div className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-500/[0.06] p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-indigo-300/80">Verifying</p>
          <p className="text-sm text-slate-100 font-medium">{claim}</p>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      {/* Five-Elements synthesis (not a raw table) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Stat label="Entities" value={`${claimedCount}`} sub={`of ${results.length}`} />
        <Stat label="Subset payout" value={formatCurrency(subsetTotal)} sub={`${pctOfTotal.toFixed(1)}% of total`} />
        <Stat label="Subset mean" value={formatCurrency(subsetMean)} sub={`pop ${formatCurrency(populationMean)}`} />
        <Stat label="vs population" value={`${vsPop >= 0 ? '+' : ''}${vsPop.toFixed(0)}%`} sub="mean delta" tone={vsPop >= 0 ? 'pos' : 'neg'} />
      </div>

      {/* The entities — the claim made verifiable */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        {subset.length === 0 ? (
          <p className="px-3 py-2 text-xs text-zinc-500">The contributing entities are not recoverable from the persisted claim.</p>
        ) : subset.map(e => (
          <div key={e.entityId} className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/50 last:border-0 text-sm">
            <span className="text-slate-300 truncate">{e.entityName}</span>
            <span className="text-slate-200 tabular-nums">{formatCurrency(e.totalPayout)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        {subset.length >= claimedCount
          ? `${subset.length} entit${subset.length === 1 ? 'y' : 'ies'} shown — the count reconciles the claim.`
          : `Showing ${subset.length} of ${claimedCount} (the upstream anomaly retains the first ${subset.length} contributing entities).`}
      </p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${tone === 'pos' ? 'text-emerald-300' : tone === 'neg' ? 'text-rose-300' : 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-600">{sub}</p>}
    </div>
  );
}
