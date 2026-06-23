// OB-229 — Summary Engine (write side).
// Production aggregation runs in Postgres via the compute_summary_artifacts RPC (Constraint 5).
// A JS bootstrap/fallback (backfillSummariesJs) populates artifacts when the RPC is not yet applied.
// KOREAN TEST: fields are discovered from row_data (typeof number); zero field-name literals.

import type { SupabaseClient } from '@supabase/supabase-js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CommittedRow {
  entity_id: string | null;
  source_date: string | null;
  data_type: string | null;
  row_data: Record<string, unknown> | null;
}

export interface AggregatedArtifact {
  entity_id: string;
  summary_date: string;
  data_type: string | null;
  metrics: Record<string, number>;
  row_count: number;
}

const keyOf = (entityId: string, date: string, dataType: string | null) => `${entityId}|${date}|${dataType ?? ''}`;

/**
 * Pure aggregation: SUM every numeric row_data field per (entity, day, data_type). Field names come
 * ONLY from the data — never the code (Korean Test). T1-E902: aggregates ALL numeric fields.
 */
export function aggregateCommittedRows(rows: CommittedRow[]): AggregatedArtifact[] {
  const acc = new Map<string, AggregatedArtifact>();
  for (const r of rows) {
    if (!r.entity_id || !r.source_date) continue; // HALT-2 / Residual-4: cannot place per-entity/day
    const k = keyOf(r.entity_id, r.source_date, r.data_type ?? null);
    let a = acc.get(k);
    if (!a) {
      a = { entity_id: r.entity_id, summary_date: r.source_date, data_type: r.data_type ?? null, metrics: {}, row_count: 0 };
      acc.set(k, a);
    }
    a.row_count += 1;
    const rd = r.row_data || {};
    for (const field in rd) {
      const v = rd[field];
      if (typeof v === 'number' && Number.isFinite(v)) {
        a.metrics[field] = (a.metrics[field] ?? 0) + v;
      }
    }
  }
  return Array.from(acc.values());
}

/**
 * Production path: the SQL aggregation RPC (architect-applied migration). Returns null if the RPC is
 * not present yet (caller can fall back to JS backfill).
 */
export async function runSummaryEngineRpc(
  sb: SupabaseClient,
  tenantId: string,
): Promise<{ written: number; skipped: number } | null> {
  const { data, error } = await sb.rpc('compute_summary_artifacts', { p_tenant_id: tenantId });
  if (error) {
    console.warn('[OB-229] compute_summary_artifacts RPC unavailable/failed:', error.message);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return { written: row?.artifacts_written ?? 0, skipped: row?.rows_skipped ?? 0 };
}

/**
 * Bootstrap/fallback: JS aggregation + idempotent upsert. One-time data population (off the render
 * path) used until the SQL RPC is applied. Pages committed_data to respect the PostgREST 1000-row cap.
 */
export async function backfillSummariesJs(
  sb: SupabaseClient,
  tenantId: string,
  log: (m: string) => void = () => {},
): Promise<{ written: number; skipped: number; scanned: number }> {
  const PAGE = 1000;
  const rows: CommittedRow[] = [];
  let scanned = 0;
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('committed_data')
      .select('entity_id, source_date, data_type, row_data')
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`committed_data read: ${error.message}`);
    if (!data || data.length === 0) break;
    scanned += data.length;
    rows.push(...(data as CommittedRow[]));
    log(`scanned ${scanned}`);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  const artifacts = aggregateCommittedRows(rows);
  const skipped = rows.filter((r) => !r.entity_id || !r.source_date).length;

  // idempotent replace (Constraint 6)
  const { error: delErr } = await sb.from('summary_artifacts').delete().eq('tenant_id', tenantId);
  if (delErr) throw new Error(`summary_artifacts delete: ${delErr.message}`);

  let written = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < artifacts.length; i += 500) {
    const batch = artifacts.slice(i, i + 500).map((a) => ({
      tenant_id: tenantId,
      entity_id: a.entity_id,
      summary_date: a.summary_date,
      period_id: null,
      data_type: a.data_type,
      metrics: a.metrics,
      row_count: a.row_count,
      computed_at: now,
      created_at: now,
    }));
    const { error } = await sb.from('summary_artifacts').insert(batch);
    if (error) throw new Error(`summary_artifacts insert: ${error.message}`);
    written += batch.length;
    log(`inserted ${written}/${artifacts.length}`);
  }
  return { written, skipped, scanned };
}

/**
 * Engine entry point used by the import-trigger + admin API: prefer the SQL RPC; fall back to JS.
 */
export async function runSummaryEngine(
  sb: SupabaseClient,
  tenantId: string,
  log: (m: string) => void = () => {},
): Promise<{ written: number; skipped: number; via: 'rpc' | 'js' }> {
  const rpc = await runSummaryEngineRpc(sb, tenantId);
  if (rpc) return { ...rpc, via: 'rpc' };
  const js = await backfillSummariesJs(sb, tenantId, log);
  return { written: js.written, skipped: js.skipped, via: 'js' };
}
