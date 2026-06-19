'use client';

import { useMemo, useState } from 'react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

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

function fmtAmt(v: number, sym: string) {
  const fd = Math.abs(v) >= 10_000 ? 0 : 2;
  return `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: fd, maximumFractionDigits: fd })}`;
}

export function PeriodComparison({
  period1,
  period2,
  currency = '$',
  sortBy: initialSort = 'change',
}: PeriodComparisonProps) {
  const isVialuce = useIsVialuce(); // HF-316: line tracks, indigo ramp series, DM Mono numbers under Vialuce
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
    if (isVialuce) {
      return (
        <div className="empty">
          <div className="ic">≈</div>
          <b>Sin datos comparativos disponibles.</b>
        </div>
      );
    }
    return <p className="text-sm text-zinc-400">Sin datos comparativos disponibles.</p>;
  }

  if (isVialuce) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4" style={{ fontSize: '11px', color: 'var(--vl-text-muted)' }}>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--vl-raw-slate)' }} /> {period1.label}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--vl-raw-indigo)' }} /> {period2.label}
            </span>
          </div>
          <div className="flex gap-1">
            {(['change', 'name', 'value'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className="gbtn"
                style={sortBy === s ? { background: 'var(--vl-indigo-50)', color: 'var(--vialuce-indigo)', borderColor: 'var(--vl-indigo-100)' } : undefined}
              >
                {s === 'change' ? 'Cambio' : s === 'name' ? 'Nombre' : 'Valor'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {rows.map(row => (
            <div key={row.name} className="flex items-center gap-2">
              <span className="w-24 truncate flex-shrink-0" style={{ fontSize: '11px', color: 'var(--vl-text-muted)' }}>{row.name}</span>
              <div className="flex-1 space-y-0.5">
                <div className="h-1.5 rounded-full" style={{ background: 'var(--vl-line-soft)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(row.v1 / maxVal) * 100}%`, background: 'var(--vl-raw-slate)' }} />
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'var(--vl-line-soft)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(row.v2 / maxVal) * 100}%`, background: 'var(--vl-raw-indigo)' }} />
                </div>
              </div>
              <span
                className="w-16 text-right flex-shrink-0"
                style={{ fontSize: '11px', fontFamily: 'var(--vl-font-mono)', color: row.change >= 0 ? 'var(--vl-success)' : 'var(--vl-danger)' }}
              >
                {row.change >= 0 ? '▲' : '▼'} {Math.abs(row.changePct).toFixed(1)}%
              </span>
              <span className="w-20 text-right flex-shrink-0" style={{ fontSize: '11px', fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-text-muted)' }}>
                {fmtAmt(row.v2, currency)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-[11px] text-zinc-400">
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
              className={`px-2 py-0.5 text-[10px] rounded ${sortBy === s ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-400 hover:text-zinc-400'}`}
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
            <span className="text-[11px] text-zinc-400 tabular-nums w-20 text-right flex-shrink-0">
              {fmtAmt(row.v2, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
