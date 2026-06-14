'use client';

/**
 * OB-205 / DS-029 §6.1 — Content Unit Browser.
 *
 * Inline expansion below the Import Health card. Proves the platform understood
 * the data: one row per content unit (committed_data data_type), with rows, date
 * range, and bound-row count — all from the carrier intelligence payload (R2: no
 * secondary route; the main payload carries per-unit detail).
 *
 * Korean Test: the unit label is the data_type value the tenant's import produced.
 * No domain literal.
 */

import type { CarrierContentUnit } from '@/lib/carrier/types';

const MAX_ROWS = 20; // DS-029 §6.1 — summary, not a data dump

export function CarrierContentUnitBrowser({ contentUnits }: { contentUnits: CarrierContentUnit[] }) {
  if (contentUnits.length === 0) {
    return <p className="mt-4 text-xs text-slate-500">No content units recorded.</p>;
  }
  const shown = contentUnits.slice(0, MAX_ROWS);
  const range = (u: CarrierContentUnit) =>
    u.earliest && u.latest ? (u.earliest === u.latest ? u.earliest : `${u.earliest} — ${u.latest}`) : '—';

  return (
    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-zinc-800 text-[10px] uppercase tracking-wider text-slate-500">
        <span>Content Unit</span>
        <span className="text-right">Rows</span>
        <span className="text-right">Date Range</span>
        <span className="text-right">Bound</span>
      </div>
      {shown.map(u => (
        <div key={u.dataType} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-zinc-800/50 last:border-0 text-sm">
          <span className="text-slate-200 truncate">{u.dataType}</span>
          <span className="text-right text-slate-300 tabular-nums">{u.rowCount.toLocaleString()}</span>
          <span className="text-right text-slate-400 text-xs whitespace-nowrap">{range(u)}</span>
          <span className="text-right text-slate-400 tabular-nums">{u.entitiesBound.toLocaleString()}</span>
        </div>
      ))}
      {contentUnits.length > MAX_ROWS && (
        <p className="px-4 py-2 text-[11px] text-slate-500">Showing {MAX_ROWS} of {contentUnits.length} content units.</p>
      )}
    </div>
  );
}
