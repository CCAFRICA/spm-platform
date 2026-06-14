'use client';

/**
 * OB-205 / DS-029 §6.2 — Entity Explorer.
 *
 * Inline expansion below the Entity Landscape card. Lists entities from the
 * carrier (bounded sample ≤20, sorted by display_name) with type, external ID,
 * status, and transaction count (R3: counts folded into the payload sample).
 *
 * Korean Test: the column is "Entity" — never "Employee"/"Rep"/"Location". Both
 * display_name and type come from the entity record; no domain assumption.
 */

import type { CarrierEntitySample } from '@/lib/carrier/types';

export function CarrierEntityExplorer({ sample, total }: { sample: CarrierEntitySample[]; total: number }) {
  if (sample.length === 0) {
    return <p className="mt-4 text-xs text-slate-500">No entities to display.</p>;
  }
  return (
    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="grid grid-cols-[1.5fr_1fr_1fr_auto_auto] gap-x-4 px-4 py-2 border-b border-zinc-800 text-[10px] uppercase tracking-wider text-slate-500">
        <span>Entity</span>
        <span>Type</span>
        <span>External ID</span>
        <span className="text-right">Status</span>
        <span className="text-right">Transactions</span>
      </div>
      {sample.map(e => (
        <div key={e.id} className="grid grid-cols-[1.5fr_1fr_1fr_auto_auto] gap-x-4 px-4 py-2 border-b border-zinc-800/50 last:border-0 text-sm items-center">
          <span className="text-slate-200 truncate">{e.displayName}</span>
          <span className="text-slate-400 truncate">{e.entityType}</span>
          <span className="text-slate-500 text-xs truncate">{e.externalId ?? '—'}</span>
          <span className="text-right text-slate-400 text-xs">{e.status}</span>
          <span className="text-right text-slate-300 tabular-nums">{e.transactionCount.toLocaleString()}</span>
        </div>
      ))}
      {total > sample.length && (
        <p className="px-4 py-2 text-[11px] text-slate-500">Showing {sample.length} of {total.toLocaleString()} entities (sorted by name).</p>
      )}
    </div>
  );
}
