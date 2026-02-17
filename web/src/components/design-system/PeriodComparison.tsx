'use client';

import { useMemo, useState } from 'react';

interface EntityPeriodData {
  name: string;
  value: number;
}

interface PeriodComparisonProps {
  period1: { label: string; entities: EntityPeriodData[] };
  period2: { label: string; entities: EntityPeriodData[] };
  currency?: string;
  sortBy?: 'change' | 'name' | 'value';
}

export function PeriodComparison({
  period1,
  period2,
  currency = 'MX$',
  sortBy: initialSort = 'change',
}: PeriodComparisonProps) {
  const [sortBy, setSortBy] = useState(initialSort);

  const rows = useMemo(() => {
    const p2Map = new Map(period2.entities.map(e => [e.name, e.value]));
    const combined = period1.entities.map(e => ({
      name: e.name,
      v1: e.value,
      v2: p2Map.get(e.name) ?? 0,
      change: ((p2Map.get(e.name) ?? 0) - e.value),
      changePct: e.value > 0 ? (((p2Map.get(e.name) ?? 0) - e.value) / e.value) * 100 : 0,
    }));

    if (sortBy === 'change') combined.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    else if (sortBy === 'name') combined.sort((a, b) => a.name.localeCompare(b.name));
    else combined.sort((a, b) => b.v2 - a.v2);

    return combined;
  }, [period1, period2, sortBy]);

  const maxVal = useMemo(() => {
    return Math.max(...rows.map(r => Math.max(r.v1, r.v2)), 1);
  }, [rows]);

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">Sin datos comparativos disponibles.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" /> {period1.label}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" /> {period2.label}
          </span>
        </div>
        <div className="flex gap-1">
          {(['change', 'name', 'value'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-2 py-0.5 text-[10px] rounded ${sortBy === s ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-400'}`}
            >
              {s === 'change' ? 'Cambio' : s === 'name' ? 'Nombre' : 'Valor'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {rows.map(row => (
          <div key={row.name} className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 w-24 truncate flex-shrink-0">{row.name}</span>
            <div className="flex-1 space-y-0.5">
              <div className="h-1.5 bg-zinc-800 rounded-full">
                <div className="h-full bg-zinc-500/60 rounded-full" style={{ width: `${(row.v1 / maxVal) * 100}%` }} />
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full">
                <div className="h-full bg-indigo-500/70 rounded-full" style={{ width: `${(row.v2 / maxVal) * 100}%` }} />
              </div>
            </div>
            <span className={`text-[11px] tabular-nums w-16 text-right flex-shrink-0 ${row.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {row.change >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(row.changePct).toFixed(1)}%
            </span>
            <span className="text-[11px] text-zinc-500 tabular-nums w-20 text-right flex-shrink-0">
              {currency}{row.v2.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
