/**
 * OB-227 — getEntityTableData: searchable / sortable / filterable / paginated entity table for a
 * period. Built on getEntityResults (HALT-2-safe), adds top_component, delta_prior (vs the prior
 * calculated period), and best-effort variant from entity metadata. Server-side pagination so a
 * 10k-entity tenant returns one page.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { getPeriodsWithResults, getEntityResults } from '@/lib/drill-through';
import { type AuthScope, ALL_SCOPE } from '@/lib/auth/scope';
import type { EntityTableOptions, EntityTableResult, EntityTableRow } from './types';

function topComponent(bd: Record<string, number> | undefined): { name: string; amount: number } | null {
  if (!bd) return null;
  let best: { name: string; amount: number } | null = null;
  for (const [name, amount] of Object.entries(bd)) {
    if (!best || amount > best.amount) best = { name, amount };
  }
  return best;
}

export async function getEntityTableData(
  tenantId: string,
  periodId: string,
  options: EntityTableOptions = {},
  scope: AuthScope = ALL_SCOPE,
  client?: SupabaseClient<Database>,
): Promise<EntityTableResult> {
  const { search = '', sortBy = 'total_payout', sortOrder = 'desc', variant, componentName, page = 1, pageSize = 25 } = options;
  const empty: EntityTableResult = { rows: [], total_count: 0, page, page_size: pageSize };
  if (!tenantId || !periodId) return empty;
  const sb = client ?? createClient();

  const rows = await getEntityResults(tenantId, scope, { periodId }, sb);
  if (!rows.length) return empty;

  // prior calculated period (chronological neighbour) for delta_prior
  const periodsDesc = await getPeriodsWithResults(tenantId, sb); // start_date DESC
  const idx = periodsDesc.findIndex(p => p.id === periodId);
  const priorPeriod = idx >= 0 && idx + 1 < periodsDesc.length ? periodsDesc[idx + 1] : null;
  const priorById = new Map<string, number>();
  if (priorPeriod) {
    const priorRows = await getEntityResults(tenantId, scope, { periodId: priorPeriod.id }, sb);
    for (const r of priorRows) priorById.set(r.entityId, r.totalPayout);
  }

  // best-effort variant from entity metadata
  const variantById = new Map<string, string | null>();
  const ids = rows.map(r => r.entityId);
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('entities').select('id, metadata').in('id', ids.slice(i, i + 300));
    for (const e of data ?? []) {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      const v = (m.variant ?? m.role ?? m.cargo ?? m.Cargo ?? null) as string | null;
      variantById.set(e.id as string, v ? String(v) : null);
    }
  }

  let table: EntityTableRow[] = rows.map(r => {
    const prior = priorById.has(r.entityId) ? priorById.get(r.entityId)! : null;
    return {
      entity_id: r.entityId,
      display_name: r.displayName,
      variant: variantById.get(r.entityId) ?? null,
      total_payout: r.totalPayout,
      top_component: topComponent(r.componentBreakdown),
      delta_prior: prior === null ? null : r.totalPayout - prior,
      component_count: r.componentCount,
    };
  });

  // filters
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    table = table.filter(r => r.display_name.toLowerCase().includes(q));
  }
  if (variant) table = table.filter(r => r.variant === variant);
  if (componentName) table = table.filter(r => r.top_component?.name === componentName);

  const total_count = table.length;

  // sort
  const dir = sortOrder === 'asc' ? 1 : -1;
  table.sort((a, b) => {
    let av: number | string; let bv: number | string;
    switch (sortBy) {
      case 'display_name': av = a.display_name.toLowerCase(); bv = b.display_name.toLowerCase(); break;
      case 'delta_prior': av = a.delta_prior ?? -Infinity; bv = b.delta_prior ?? -Infinity; break;
      case 'component_count': av = a.component_count; bv = b.component_count; break;
      default: av = a.total_payout; bv = b.total_payout;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  // paginate
  const start = (page - 1) * pageSize;
  return { rows: table.slice(start, start + pageSize), total_count, page, page_size: pageSize };
}
