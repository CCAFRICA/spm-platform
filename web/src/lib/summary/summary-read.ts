// OB-229 — Summary Engine (read side). The visualization layer reads pre-computed summary_artifacts
// in O(1) instead of fetching + aggregating raw committed_data. Drill-through to filtered raw rows
// remains the only path to row-level data.

import type { SupabaseClient } from '@supabase/supabase-js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SummaryArtifact {
  entity_id: string;
  summary_date: string;
  data_type: string | null;
  metrics: Record<string, number>;
  row_count: number;
}

export interface SummaryQuery {
  dataType?: string;
  entityId?: string;
  from?: string; // inclusive YYYY-MM-DD
  to?: string; // inclusive YYYY-MM-DD
}

/** Read summary_artifacts for a tenant (paged — entity×date can exceed the 1000-row cap). */
export async function getSummaryArtifacts(
  sb: SupabaseClient,
  tenantId: string,
  q: SummaryQuery = {},
): Promise<SummaryArtifact[]> {
  const PAGE = 1000;
  const out: SummaryArtifact[] = [];
  let offset = 0;
  for (;;) {
    let query = sb
      .from('summary_artifacts')
      .select('entity_id, summary_date, data_type, metrics, row_count')
      .eq('tenant_id', tenantId);
    if (q.dataType) query = query.eq('data_type', q.dataType);
    if (q.entityId) query = query.eq('entity_id', q.entityId);
    if (q.from) query = query.gte('summary_date', q.from);
    if (q.to) query = query.lte('summary_date', q.to);
    const { data, error } = await query
      .order('summary_date', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`summary_artifacts read: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as SummaryArtifact[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

/** Sum one metric field across artifacts. Field name is supplied by the caller (data-driven). */
export function sumMetric(arts: SummaryArtifact[], field: string): number {
  let s = 0;
  for (const a of arts) s += a.metrics?.[field] ?? 0;
  return s;
}

/** Roll artifacts up per entity: { entity_id → { metrics(summed), row_count, days } }. */
export function rollupByEntity(arts: SummaryArtifact[]): Map<string, { metrics: Record<string, number>; row_count: number; days: number }> {
  const m = new Map<string, { metrics: Record<string, number>; row_count: number; days: number }>();
  for (const a of arts) {
    let e = m.get(a.entity_id);
    if (!e) { e = { metrics: {}, row_count: 0, days: 0 }; m.set(a.entity_id, e); }
    e.row_count += a.row_count;
    e.days += 1;
    for (const k in a.metrics) e.metrics[k] = (e.metrics[k] ?? 0) + a.metrics[k];
  }
  return m;
}

/** Roll artifacts up per day across all entities: { summary_date → { metrics(summed), row_count } }. */
export function rollupByDate(arts: SummaryArtifact[]): Map<string, { metrics: Record<string, number>; row_count: number }> {
  const m = new Map<string, { metrics: Record<string, number>; row_count: number }>();
  for (const a of arts) {
    let d = m.get(a.summary_date);
    if (!d) { d = { metrics: {}, row_count: 0 }; m.set(a.summary_date, d); }
    d.row_count += a.row_count;
    for (const k in a.metrics) d.metrics[k] = (d.metrics[k] ?? 0) + a.metrics[k];
  }
  return m;
}

/** Network totals: sum every metric across all artifacts + total row_count. */
export function networkTotals(arts: SummaryArtifact[]): { metrics: Record<string, number>; row_count: number; entities: number; days: number } {
  const metrics: Record<string, number> = {};
  let row_count = 0;
  const ents = new Set<string>();
  const days = new Set<string>();
  for (const a of arts) {
    row_count += a.row_count;
    ents.add(a.entity_id);
    days.add(a.summary_date);
    for (const k in a.metrics) metrics[k] = (metrics[k] ?? 0) + a.metrics[k];
  }
  return { metrics, row_count, entities: ents.size, days: days.size };
}
