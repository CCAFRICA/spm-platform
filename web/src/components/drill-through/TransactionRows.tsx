'use client';

/**
 * OB-224 — TransactionRows: the BOTTOM drill-through layer.
 *
 * Renders raw committed_data rows for an entity+period. Korean Test: column headers are derived
 * DYNAMICALLY from the union of row_data keys — zero hardcoded field names. Framework/meta keys
 * (leading underscore, e.g. _rowIndex/_sheetName) are dropped as plumbing, not business data.
 */
import { useEffect, useMemo, useState } from 'react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { useLocale } from '@/contexts/locale-context';
import { getSourceTransactions, SOURCE_TX_LIMIT, type SourceTransaction } from '@/lib/drill-through';

interface Props {
  tenantId: string;
  entityId: string;
  periodId: string;
  dataType?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function TransactionRows({ tenantId, entityId, periodId, dataType }: Props) {
  const isVialuce = useIsVialuce();
  const { formatNumber, formatDate } = useLocale();
  const [rows, setRows] = useState<SourceTransaction[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(false);
    getSourceTransactions(tenantId, entityId, periodId, dataType)
      .then(r => alive && setRows(r))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [tenantId, entityId, periodId, dataType]);

  // Dynamic columns = union of business keys across rows, first-seen order.
  const columns = useMemo(() => {
    if (!rows) return [];
    const seen: string[] = [];
    const set = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r.rowData)) {
        if (k.startsWith('_')) continue; // framework/meta plumbing
        if (!set.has(k)) { set.add(k); seen.push(k); }
      }
    }
    return seen;
  }, [rows]);

  const fmt = (v: unknown): string => {
    if (v == null || v === '') return '—';
    if (typeof v === 'number') return formatNumber(v);
    if (typeof v === 'string' && ISO_DATE.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return formatDate(d);
    }
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  if (rows === null && !error) {
    return <div className={isVialuce ? 'mut' : 'text-xs text-zinc-500'} style={isVialuce ? { padding: '12px 4px', fontSize: 12 } : undefined}>Loading transactions…</div>;
  }
  if (error || !rows || rows.length === 0) {
    return <div className={isVialuce ? 'mut' : 'text-xs text-zinc-500'} style={isVialuce ? { padding: '12px 4px', fontSize: 12, color: 'var(--vl-text-soft)' } : undefined}>No source transactions found.</div>;
  }

  const truncated = rows.length >= SOURCE_TX_LIMIT;

  if (isVialuce) {
    return (
      <div>
        <div className="card flush" style={{ marginTop: 0, overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                {columns.map(c => <th key={c}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  {columns.map(c => {
                    const v = r.rowData[c];
                    const numeric = typeof v === 'number';
                    return <td key={c} className={numeric ? 'num' : undefined}>{fmt(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 6, fontSize: 11, color: 'var(--vl-text-soft)' }}>
          {rows.length} transaction{rows.length === 1 ? '' : 's'}{truncated ? ` (first ${SOURCE_TX_LIMIT} shown)` : ''}.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              {columns.map(c => <th key={c} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500 font-medium whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-zinc-800/50 last:border-0">
                {columns.map(c => {
                  const v = r.rowData[c];
                  const numeric = typeof v === 'number';
                  return <td key={c} className={`px-3 py-1.5 text-slate-300 whitespace-nowrap ${numeric ? 'tabular-nums text-right' : ''}`}>{fmt(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-500">
        {rows.length} transaction{rows.length === 1 ? '' : 's'}{truncated ? ` (first ${SOURCE_TX_LIMIT} shown)` : ''}.
      </p>
    </div>
  );
}
