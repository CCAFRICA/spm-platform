'use client';

/**
 * OB-224 — EntityResultsList: the TOP drill-through layer (entity → payout grid).
 *
 * Sortable, scope-aware table of entity results from getEntityResults. Rows are clickable
 * (onEntitySelect). Supports inline row expansion (expandedEntityId + renderExpanded → an extra
 * full-width row injected directly beneath the selected entity — Intuitive Adjacency) and CSV
 * export (MC#17 / payroll gate §3D.2). Korean Test: every label comes from the data.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { useCurrency } from '@/contexts/tenant-context';
import { StatusPill } from '@/components/design-system';
import { getEntityResults, type EntityResult } from '@/lib/drill-through';
import { type AuthScope, scopeKey, scopeIsScoped } from '@/lib/auth/scope';

interface Props {
  tenantId: string;
  scope: AuthScope;
  periodId?: string;
  batchId?: string;
  onEntitySelect?: (entityId: string, result: EntityResult) => void;
  selectedEntityId?: string;
  expandedEntityId?: string;
  renderExpanded?: (entityId: string, result: EntityResult) => ReactNode;
  showExport?: boolean;
  compact?: boolean;
  emptyMessage?: string;
}

type SortKey = 'displayName' | 'totalPayout' | 'componentCount' | 'lifecycleState';

const lifecyclePill = (s: string | null): 'emerald' | 'amber' | 'indigo' | 'zinc' => {
  const v = (s ?? '').toUpperCase();
  if (v.includes('OFFICIAL') || v.includes('APPROVED') || v.includes('PAID')) return 'emerald';
  if (v.includes('PENDING') || v.includes('REVIEW')) return 'amber';
  if (v.includes('DRAFT') || v.includes('CALCULATED')) return 'indigo';
  return 'zinc';
};

function toCsv(rows: EntityResult[]): string {
  const compNames = Array.from(new Set(rows.flatMap(r => Object.keys(r.componentBreakdown ?? {})))).sort();
  const header = ['External ID', 'Name', 'Period', 'Total Payout', ...compNames, 'Lifecycle State'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map(r => [
    r.externalId, r.displayName, r.periodLabel, r.totalPayout,
    ...compNames.map(n => r.componentBreakdown?.[n] ?? ''),
    r.lifecycleState ?? '',
  ].map(esc).join(','));
  return [header.map(esc).join(','), ...lines].join('\n');
}

export function EntityResultsList(props: Props) {
  const { tenantId, scope, periodId, batchId, onEntitySelect, selectedEntityId, expandedEntityId, renderExpanded, showExport, compact, emptyMessage } = props;
  const isVialuce = useIsVialuce();
  const { format } = useCurrency();
  const [rows, setRows] = useState<EntityResult[] | null>(null);
  const [error, setError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('totalPayout');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(false);
    getEntityResults(tenantId, scope, { periodId, batchId })
      .then(r => alive && setRows(r))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
    // scope identity changes via its discriminant + entity set — stable string key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, periodId, batchId, scopeKey(scope)]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'displayName' || k === 'lifecycleState' ? 'asc' : 'desc'); }
  };

  const exportCsv = () => {
    if (!rows || !rows.length) return;
    const blob = new Blob([toCsv(sorted)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `entity-results-${periodId ?? batchId ?? 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (rows === null && !error) {
    return <p className={isVialuce ? 'mut' : 'text-xs text-zinc-500'} style={isVialuce ? { padding: '12px 4px', fontSize: 12, color: 'var(--vl-text-soft)' } : undefined}>Loading results…</p>;
  }
  if (error || !rows || rows.length === 0) {
    const msg = emptyMessage ?? 'No calculation results found for this period.';
    return isVialuce
      ? <div className="empty"><b>{msg}</b></div>
      : <p className="text-sm text-zinc-500 py-6 text-center">{msg}</p>;
  }

  const arrow = (k: SortKey) => (k === sortKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');
  const isSelected = (id: string) => selectedEntityId === id || expandedEntityId === id;

  if (isVialuce) {
    return (
      <div>
        {showExport && (
          <div className="pactions" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
            <button onClick={exportCsv} className="btn-sec">Export CSV</button>
          </div>
        )}
        <div className="card flush" style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th role="button" onClick={() => setSort('displayName')} style={{ cursor: 'pointer' }}>Entity{arrow('displayName')}</th>
                {!compact && <th role="button" onClick={() => setSort('componentCount')} className="r" style={{ cursor: 'pointer' }}>Components{arrow('componentCount')}</th>}
                {!compact && <th role="button" onClick={() => setSort('lifecycleState')} style={{ cursor: 'pointer' }}>State{arrow('lifecycleState')}</th>}
                <th role="button" onClick={() => setSort('totalPayout')} className="r" style={{ cursor: 'pointer' }}>Payout{arrow('totalPayout')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <FragmentRow key={r.entityId}>
                  <tr onClick={() => onEntitySelect?.(r.entityId, r)} style={{ cursor: onEntitySelect ? 'pointer' : 'default', background: isSelected(r.entityId) ? 'var(--vl-line-soft)' : undefined }}>
                    <td className="name">
                      {onEntitySelect && <ChevronDown className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 6, opacity: expandedEntityId === r.entityId ? 1 : 0.4, transform: expandedEntityId === r.entityId ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />}
                      {r.displayName}
                    </td>
                    {!compact && <td className="num mut">{r.componentCount}</td>}
                    {!compact && <td>{r.lifecycleState ? <StatusPill color={lifecyclePill(r.lifecycleState)}>{r.lifecycleState}</StatusPill> : <span className="mut">—</span>}</td>}
                    <td className={`num ${r.totalPayout < 0 ? 'down' : ''}`}>{format(r.totalPayout)}</td>
                  </tr>
                  {expandedEntityId === r.entityId && renderExpanded && (
                    <tr><td colSpan={compact ? 2 : 4} style={{ padding: '0 0 14px', background: 'var(--vl-line-soft)' }}><div style={{ padding: '4px 14px' }}>{renderExpanded(r.entityId, r)}</div></td></tr>
                  )}
                </FragmentRow>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 6, fontSize: 11, color: 'var(--vl-text-soft)' }}>{sorted.length} entit{sorted.length === 1 ? 'y' : 'ies'}{scopeIsScoped(scope) ? ' (scoped)' : ''}.</p>
      </div>
    );
  }

  return (
    <div>
      {showExport && (
        <div className="flex justify-end mb-2">
          <button onClick={exportCsv} className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-zinc-800">Export CSV</button>
        </div>
      )}
      <div className="rounded-lg border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th onClick={() => setSort('displayName')} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500 cursor-pointer">Entity{arrow('displayName')}</th>
              {!compact && <th onClick={() => setSort('componentCount')} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-500 cursor-pointer">Components{arrow('componentCount')}</th>}
              {!compact && <th onClick={() => setSort('lifecycleState')} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500 cursor-pointer">State{arrow('lifecycleState')}</th>}
              <th onClick={() => setSort('totalPayout')} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-500 cursor-pointer">Payout{arrow('totalPayout')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <FragmentRow key={r.entityId}>
                <tr onClick={() => onEntitySelect?.(r.entityId, r)} className={`border-b border-zinc-800/50 last:border-0 ${onEntitySelect ? 'cursor-pointer hover:bg-zinc-800/40' : ''} ${isSelected(r.entityId) ? 'bg-zinc-800/40' : ''}`}>
                  <td className="px-3 py-1.5 text-slate-200">{r.displayName}</td>
                  {!compact && <td className="px-3 py-1.5 text-right text-zinc-500 tabular-nums">{r.componentCount}</td>}
                  {!compact && <td className="px-3 py-1.5">{r.lifecycleState ? <StatusPill color={lifecyclePill(r.lifecycleState)}>{r.lifecycleState}</StatusPill> : <span className="text-zinc-600">—</span>}</td>}
                  <td className={`px-3 py-1.5 text-right tabular-nums ${r.totalPayout < 0 ? 'text-rose-300' : 'text-slate-200'}`}>{format(r.totalPayout)}</td>
                </tr>
                {expandedEntityId === r.entityId && renderExpanded && (
                  <tr><td colSpan={compact ? 2 : 4} className="bg-zinc-900/60 px-3 pb-3">{renderExpanded(r.entityId, r)}</td></tr>
                )}
              </FragmentRow>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-500">{sorted.length} entit{sorted.length === 1 ? 'y' : 'ies'}{scopeIsScoped(scope) ? ' (scoped)' : ''}.</p>
    </div>
  );
}

// Fragment that is valid inside <tbody> (keyed group of <tr>s).
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
