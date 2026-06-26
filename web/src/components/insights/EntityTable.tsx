'use client';

/**
 * OB-227 — EntityTable. Full-featured payout table: search, variant filter, sortable columns,
 * server-side pagination (getEntityTableData — handles 10k entities), CSV export, and inline
 * OB-224 drill-through (ComponentCards) on row click. Replaces the flat unsearchable table with
 * the useless repeated "Components: N" column. Korean Test: entity/component/variant from data.
 */
import { useEffect, useMemo, useState, useCallback, Fragment } from 'react';
import { ChevronDown, ChevronUp, ArrowUpDown, Search, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrency } from '@/contexts/tenant-context';
import { getEntityTableData } from '@/lib/insights';
import type { EntityTableResult, EntityTableOptions } from '@/lib/insights';
import { type AuthScope, ALL_SCOPE, scopeKey } from '@/lib/auth/scope';
import { ComponentCards } from '@/components/drill-through';

interface EntityTableProps {
  tenantId: string;
  periodId: string;
  periodLabel?: string;
  showDrillThrough?: boolean;
  showExport?: boolean;
  /** external filters from distribution/component clicks */
  filterComponent?: string | null;
  pageSize?: number;
  /** OB-246: authenticated scope — the per-entity roster + CSV export narrow to it (member→own, manager→team). */
  scope?: AuthScope;
}

type SortKey = NonNullable<EntityTableOptions['sortBy']>;

export function EntityTable({ tenantId, periodId, periodLabel, showDrillThrough = true, showExport = true, filterComponent, pageSize = 25, scope = ALL_SCOPE }: EntityTableProps) {
  const { format } = useCurrency();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('total_payout');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<EntityTableResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [debounced, sortBy, sortOrder, filterComponent, periodId]);

  useEffect(() => {
    if (!tenantId || !periodId) { setResult(null); return; }
    let cancelled = false;
    setLoading(true);
    getEntityTableData(tenantId, periodId, { search: debounced, sortBy, sortOrder, componentName: filterComponent ?? undefined, page, pageSize }, scope)
      .then(r => { if (!cancelled) setResult(r); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, periodId, debounced, sortBy, sortOrder, filterComponent, page, pageSize, scopeKey(scope)]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortBy === key) setSortOrder(o => (o === 'desc' ? 'asc' : 'desc'));
    else { setSortBy(key); setSortOrder(key === 'display_name' ? 'asc' : 'desc'); }
  }, [sortBy]);

  const handleExport = useCallback(async () => {
    const all = await getEntityTableData(tenantId, periodId, { search: debounced, sortBy, sortOrder, componentName: filterComponent ?? undefined, page: 1, pageSize: 100000 }, scope);
    const header = ['Entity', 'Variant', 'Top Component', 'Top Amount', 'Delta Prior', 'Total Payout'];
    const lines = all.rows.map(r => [r.display_name, r.variant ?? '', r.top_component?.name ?? '', r.top_component?.amount ?? '', r.delta_prior ?? '', r.total_payout]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `entities-${periodLabel ?? periodId}.csv`; a.click(); URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, periodId, periodLabel, debounced, sortBy, sortOrder, filterComponent, scopeKey(scope)]);

  const totalPages = useMemo(() => (result ? Math.max(1, Math.ceil(result.total_count / pageSize)) : 1), [result, pageSize]);
  const SortIcon = ({ k }: { k: SortKey }) => sortBy === k ? (sortOrder === 'desc' ? <ChevronDown className="inline h-3 w-3" /> : <ChevronUp className="inline h-3 w-3" />) : <ArrowUpDown className="inline h-3 w-3 opacity-40" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entities…" className="pl-8 h-9" />
        </div>
        <div className="flex items-center gap-2">
          {filterComponent && <span className="text-xs text-muted-foreground">Filtered: <b>{filterComponent}</b></span>}
          {showExport && <Button size="sm" variant="outline" onClick={handleExport}><Download className="mr-1 h-3.5 w-3.5" />Export</Button>}
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('display_name')}>Entity <SortIcon k="display_name" /></TableHead>
              <TableHead>Variant</TableHead>
              <TableHead>Top Component</TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort('delta_prior')}>Δ Prior <SortIcon k="delta_prior" /></TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort('total_payout')}>Total <SortIcon k="total_payout" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !result ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : !result || result.rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No entities match.</TableCell></TableRow>
            ) : result.rows.map(r => {
              const open = expanded === r.entity_id;
              return (
                <Fragment key={r.entity_id}>
                  <TableRow className={showDrillThrough ? 'cursor-pointer' : ''} onClick={() => showDrillThrough && setExpanded(open ? null : r.entity_id)}>
                    <TableCell className="font-medium">{r.display_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.variant ?? '—'}</TableCell>
                    <TableCell className="text-sm">{r.top_component ? `${r.top_component.name} · ${format(r.top_component.amount)}` : '—'}</TableCell>
                    <TableCell className={`text-right tabular-nums text-sm ${r.delta_prior == null ? 'text-muted-foreground' : r.delta_prior > 0 ? 'text-[color:var(--vl-success,#15936A)]' : r.delta_prior < 0 ? 'text-[color:var(--vl-danger,#DC5454)]' : ''}`}>
                      {r.delta_prior == null ? '—' : `${r.delta_prior > 0 ? '+' : ''}${format(r.delta_prior)}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{format(r.total_payout)}</TableCell>
                  </TableRow>
                  {open && showDrillThrough && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/30 p-3">
                        <ComponentCards tenantId={tenantId} entityId={r.entity_id} periodId={periodId} entityName={r.display_name} periodLabel={periodLabel ?? ''} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {result && result.total_count > pageSize && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{result.total_count} entities · page {page}/{totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
