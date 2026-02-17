'use client';

import { useState, useMemo } from 'react';
import { StatusPill } from './StatusPill';
import { LIFECYCLE_DISPLAY, isDashboardState, type DashboardLifecycleState } from '@/lib/lifecycle/lifecycle-service';

export interface PayrollRow {
  entityName: string;
  entityType?: string;
  totalPayout: number;
  components: number;
  lifecycleState?: string;
  approved: boolean;
}

interface PayrollSummaryProps {
  rows: PayrollRow[];
  currency?: string;
  groupBy?: 'entityType' | 'lifecycleState';
  onRowClick?: (row: PayrollRow) => void;
}

type SortCol = 'name' | 'payout' | 'components' | 'status';
type SortDir = 'asc' | 'desc';

function stateLabel(state?: string): string {
  if (!state) return '-';
  if (isDashboardState(state)) return LIFECYCLE_DISPLAY[state as DashboardLifecycleState].labelEs;
  return state;
}

function statePillColor(state?: string): 'emerald' | 'amber' | 'indigo' | 'zinc' {
  if (!state) return 'zinc';
  if (state === 'APPROVED' || state === 'POSTED' || state === 'PAID') return 'emerald';
  if (state === 'PUBLISHED' || state === 'OFFICIAL') return 'indigo';
  if (state === 'PREVIEW' || state === 'RECONCILE') return 'amber';
  return 'zinc';
}

export function PayrollSummary({
  rows,
  currency = '$',
  groupBy,
  onRowClick,
}: PayrollSummaryProps) {
  const [sortCol, setSortCol] = useState<SortCol>('payout');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'name') cmp = a.entityName.localeCompare(b.entityName);
      else if (sortCol === 'payout') cmp = a.totalPayout - b.totalPayout;
      else if (sortCol === 'components') cmp = a.components - b.components;
      else cmp = (a.lifecycleState ?? '').localeCompare(b.lifecycleState ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortCol, sortDir]);

  const groups = useMemo(() => {
    if (!groupBy) return [{ key: '', rows: sorted }];
    const map = new Map<string, PayrollRow[]>();
    for (const r of sorted) {
      const key = groupBy === 'entityType' ? (r.entityType ?? 'Otro') : stateLabel(r.lifecycleState);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).map(([key, rows]) => ({ key, rows }));
  }, [sorted, groupBy]);

  const total = rows.reduce((s, r) => s + r.totalPayout, 0);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  function SortHeader({ col, label }: { col: SortCol; label: string }) {
    return (
      <th
        className="text-[11px] text-zinc-500 font-normal py-1.5 px-2 cursor-pointer hover:text-zinc-300 select-none"
        onClick={() => toggleSort(col)}
      >
        {label} {sortCol === col ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
      </th>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">Sin datos de nomina disponibles.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-800">
            <SortHeader col="name" label="Nombre" />
            {rows.some(r => r.entityType) && <th className="text-[11px] text-zinc-500 font-normal py-1.5 px-2 text-left">Tipo</th>}
            <SortHeader col="payout" label="Pago" />
            <SortHeader col="components" label="Componentes" />
            <SortHeader col="status" label="Estado" />
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (
            <GroupRows
              key={group.key}
              groupKey={group.key}
              rows={group.rows}
              currency={currency}
              showType={rows.some(r => r.entityType)}
              onRowClick={onRowClick}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-700">
            <td className="text-xs font-medium text-zinc-300 py-2 px-2">Total</td>
            {rows.some(r => r.entityType) && <td />}
            <td className="text-xs font-bold text-zinc-100 py-2 px-2 text-right tabular-nums">
              {currency}{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </td>
            <td className="text-xs text-zinc-500 py-2 px-2 text-center">{rows.length}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function GroupRows({
  groupKey,
  rows,
  currency,
  showType,
  onRowClick,
}: {
  groupKey: string;
  rows: PayrollRow[];
  currency: string;
  showType: boolean;
  onRowClick?: (row: PayrollRow) => void;
}) {
  return (
    <>
      {groupKey && (
        <tr>
          <td colSpan={showType ? 5 : 4} className="text-[10px] text-zinc-500 uppercase tracking-wider py-1.5 px-2 bg-zinc-900/30">
            {groupKey}
          </td>
        </tr>
      )}
      {rows.map((row, i) => (
        <tr
          key={i}
          onClick={() => onRowClick?.(row)}
          className={`border-b border-zinc-800/30 ${onRowClick ? 'cursor-pointer hover:bg-zinc-800/30' : ''}`}
        >
          <td className="text-xs text-zinc-300 py-1.5 px-2">{row.entityName}</td>
          {showType && <td className="text-[11px] text-zinc-500 py-1.5 px-2">{row.entityType ?? '-'}</td>}
          <td className="text-xs text-zinc-200 py-1.5 px-2 text-right tabular-nums">
            {currency}{row.totalPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </td>
          <td className="text-xs text-zinc-400 py-1.5 px-2 text-center">{row.components}</td>
          <td className="py-1.5 px-2">
            <StatusPill color={statePillColor(row.lifecycleState)}>
              {stateLabel(row.lifecycleState)}
            </StatusPill>
          </td>
        </tr>
      ))}
    </>
  );
}
