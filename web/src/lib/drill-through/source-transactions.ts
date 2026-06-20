/**
 * OB-224 — getSourceTransactions: the bottom drill-through layer (raw committed_data rows).
 *
 * The substrate has TWO attribution models and this reader honors both (SR-34, structural):
 *   1. DIRECT — committed_data.entity_id + period_id are populated (attributed-on-import tenants).
 *   2. TRACE-DERIVED — committed_data.entity_id/period_id are NULL (e.g. BCL: 510/595 rows NULL
 *      entity, all 595 NULL period); the entity↔row mapping exists ONLY via the traces that consumed
 *      the row (calculation_traces.committed_data_id). The entity's source rows are exactly those
 *      its traces reference — the same linkage getCommissionStatement uses.
 *
 * Korean Test: column headers are derived from row_data keys at render time, never hardcoded.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import type { SourceTransaction } from './types';

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const toTx = (r: { id: unknown; data_type: unknown; row_data: unknown; source_date?: unknown }): SourceTransaction => ({
  id: r.id as string,
  dataType: (r.data_type as string) ?? '',
  rowData: asObj(r.row_data),
  sourceDate: (r.source_date as string | null) ?? null,
});

/** Default cap — a single entity+period can have thousands of rows (MIR). Surfaces note truncation. */
export const SOURCE_TX_LIMIT = 1000;

export async function getSourceTransactions(
  tenantId: string,
  entityId: string,
  periodId: string,
  dataType?: string,
  client?: SupabaseClient<Database>,
  limit: number = SOURCE_TX_LIMIT,
): Promise<SourceTransaction[]> {
  if (!tenantId || !entityId || !periodId) return [];
  const sb = client ?? createClient();

  // Path 1: directly-attributed committed_data.
  let q = sb
    .from('committed_data')
    .select('id, data_type, row_data, source_date, created_at')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId)
    .eq('period_id', periodId)
    .order('source_date', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (dataType) q = q.eq('data_type', dataType);
  const { data: direct, error: dErr } = await q;
  if (!dErr && direct && direct.length > 0) return direct.map(toTx);

  // Path 2: trace-derived attribution (NULL entity/period source rows, e.g. BCL/MIR).
  const { data: results } = await sb
    .from('calculation_results')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId)
    .eq('period_id', periodId);
  const resultIds = (results ?? []).map(r => r.id as string);
  if (!resultIds.length) return [];

  const { data: traces } = await sb
    .from('calculation_traces')
    .select('committed_data_id')
    .eq('tenant_id', tenantId)
    .in('result_id', resultIds)
    .not('committed_data_id', 'is', null);
  const cdIds = Array.from(new Set((traces ?? []).map(t => t.committed_data_id as string).filter(Boolean)));
  if (!cdIds.length) return [];

  const rows: SourceTransaction[] = [];
  for (let i = 0; i < cdIds.length && rows.length < limit; i += 300) {
    const chunk = cdIds.slice(i, i + 300);
    let cq = sb.from('committed_data').select('id, data_type, row_data, source_date').in('id', chunk);
    if (dataType) cq = cq.eq('data_type', dataType);
    const { data: cd } = await cq;
    for (const r of cd ?? []) rows.push(toTx(r));
  }
  rows.sort((a, b) => (a.sourceDate ?? '').localeCompare(b.sourceDate ?? '') || a.id.localeCompare(b.id));
  return rows.slice(0, limit);
}
