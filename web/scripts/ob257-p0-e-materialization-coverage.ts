// OB-257 P0 Discovery Item 5 — Materialization coverage per tenant (READ-ONLY).
// Dumps: distinct data_types/artifact kinds, grains, row counts, metric keys, sample rows for
// summary_artifacts / summary_artifacts_fine / entity_period_outcomes for BCL + Sabor.
// Run: cd web && npx tsx --env-file=.env.local scripts/ob257-p0-e-materialization-coverage.ts
import { createClient } from '@supabase/supabase-js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Walk distinct values of a text column efficiently (no group-by in PostgREST).
async function distinctVals(table: string, col: string, tenantId: string): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  // check for NULLs first
  const { count: nullCount } = await sb.from(table).select(col, { count: 'exact', head: true })
    .eq('tenant_id', tenantId).is(col, null);
  if ((nullCount ?? 0) > 0) out.push(null);
  let last: string | null = null;
  for (;;) {
    let q = sb.from(table).select(col).eq('tenant_id', tenantId).not(col, 'is', null)
      .order(col, { ascending: true }).limit(1);
    if (last !== null) q = q.gt(col, last);
    const { data, error } = await q;
    if (error) { out.push(`ERROR:${error.message}` as any); break; }
    if (!data || data.length === 0) break;
    last = (data[0] as any)[col] as string;
    out.push(last);
    if (out.length > 60) { out.push('...TRUNCATED' as any); break; }
  }
  return out;
}

async function countWhere(table: string, tenantId: string, extra?: (q: any) => any): Promise<number | string> {
  let q = sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  if (extra) q = extra(q);
  const { count, error } = await q;
  if (error) return `ERR:${error.message}`;
  return count ?? 0;
}

function short(v: unknown, max = 700): string {
  const s = JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

async function metricKeysForDataType(table: string, tenantId: string, dt: string | null, sampleN = 50): Promise<string[]> {
  let q = sb.from(table).select('metrics').eq('tenant_id', tenantId).limit(sampleN);
  q = dt === null ? q.is('data_type', null) : q.eq('data_type', dt);
  const { data, error } = await q;
  if (error) return [`ERR:${error.message}`];
  const keys = new Set<string>();
  for (const r of (data ?? []) as any[]) for (const k of Object.keys(r.metrics ?? {})) keys.add(k);
  return Array.from(keys).sort();
}

async function dumpTable(table: string, tenantName: string, tenantId: string, hasDataType: boolean) {
  console.log(`\n───── ${table} — ${tenantName} (${tenantId}) ─────`);
  const total = await countWhere(table, tenantId);
  console.log(`TOTAL rows: ${total}`);
  if (total === 0 || typeof total === 'string') return;

  if (hasDataType) {
    const dts = await distinctVals(table, 'data_type', tenantId);
    console.log(`distinct data_type: ${JSON.stringify(dts)}`);
    for (const dt of dts) {
      if (typeof dt === 'string' && dt.startsWith('ERROR:')) continue;
      const c = await countWhere(table, tenantId, (q) => dt === null ? q.is('data_type', null) : q.eq('data_type', dt));
      // grain probe: does this data_type carry period_id / summary_date / entity_id / sub_entity_id / hour?
      let sq = sb.from(table).select('*').eq('tenant_id', tenantId).limit(2);
      sq = dt === null ? sq.is('data_type', null) : sq.eq('data_type', dt);
      const { data: samples } = await sq;
      const s0 = (samples ?? [])[0] as any;
      const grainCols = s0 ? Object.keys(s0).filter(k => ['entity_id', 'sub_entity_id', 'summary_date', 'period_id', 'hour'].includes(k))
        .map(k => `${k}=${s0[k] === null ? 'NULL' : 'set'}`).join(' ') : 'n/a';
      const mkeys = await metricKeysForDataType(table, tenantId, dt);
      console.log(`\n  data_type=${JSON.stringify(dt)} rows=${c}`);
      console.log(`  grain cols (sample): ${grainCols}`);
      console.log(`  metric keys (union over ≤50 rows): ${JSON.stringify(mkeys)}`);
      for (const s of (samples ?? []).slice(0, 2)) console.log(`  sample: ${short(s)}`);
    }
    // distinct summary_date range + entity count for the base data_type namespace
    const { data: dmin } = await sb.from(table).select('summary_date').eq('tenant_id', tenantId).not('summary_date', 'is', null).order('summary_date', { ascending: true }).limit(1);
    const { data: dmax } = await sb.from(table).select('summary_date').eq('tenant_id', tenantId).not('summary_date', 'is', null).order('summary_date', { ascending: false }).limit(1);
    console.log(`\n  summary_date range: ${(dmin?.[0] as any)?.summary_date ?? 'n/a'} → ${(dmax?.[0] as any)?.summary_date ?? 'n/a'}`);
  } else {
    // entity_period_outcomes: grain = entity × period
    const pids = await distinctVals(table, 'period_id', tenantId);
    console.log(`distinct period_id: ${JSON.stringify(pids)}`);
    for (const pid of pids) {
      if (pid === null || (typeof pid === 'string' && pid.startsWith('ERROR:'))) continue;
      const c = await countWhere(table, tenantId, (q) => q.eq('period_id', pid));
      console.log(`  period_id=${pid} rows=${c}`);
    }
    const { data: samples } = await sb.from(table).select('*').eq('tenant_id', tenantId).limit(2);
    for (const s of (samples ?? [])) console.log(`  sample: ${short(s, 900)}`);
  }
}

async function committedDataProfile(tenantName: string, tenantId: string) {
  console.log(`\n───── committed_data (backfill SOURCE) — ${tenantName} ─────`);
  const total = await countWhere('committed_data', tenantId);
  console.log(`TOTAL rows: ${total}`);
  const dts = await distinctVals('committed_data', 'data_type', tenantId);
  console.log(`distinct data_type: ${JSON.stringify(dts)}`);
  for (const dt of dts) {
    if (typeof dt === 'string' && dt.startsWith('ERROR:')) continue;
    const c = await countWhere('committed_data', tenantId, (q) => dt === null ? q.is('data_type', null) : q.eq('data_type', dt));
    let sq = sb.from('committed_data').select('entity_id, source_date, data_type, row_data').eq('tenant_id', tenantId).limit(2);
    sq = dt === null ? sq.is('data_type', null) : sq.eq('data_type', dt);
    const { data: samples } = await sq;
    const s0 = (samples ?? [])[0] as any;
    console.log(`\n  data_type=${JSON.stringify(dt)} rows=${c} entity_id=${s0?.entity_id === null ? 'NULL' : 'set'} source_date=${s0?.source_date ?? 'NULL'}`);
    if (s0) console.log(`  row_data keys: ${JSON.stringify(Object.keys(s0.row_data ?? {}))}`);
    if (s0) console.log(`  sample row_data: ${short(s0.row_data, 600)}`);
  }
}

(async () => {
  // Resolve Sabor tenant id
  const { data: saborRows, error: terr } = await sb.from('tenants').select('id, name').ilike('name', '%sabor%');
  if (terr) throw terr;
  console.log(`tenants ilike %sabor%: ${JSON.stringify(saborRows)}`);
  const SABOR = (saborRows ?? [])[0]?.id as string;
  const { data: bclRow } = await sb.from('tenants').select('id, name').eq('id', BCL);
  console.log(`BCL tenant: ${JSON.stringify(bclRow)}`);

  // Schema probe: one row of each table, Object.keys
  for (const t of ['summary_artifacts', 'summary_artifacts_fine', 'entity_period_outcomes']) {
    const { data, error } = await sb.from(t).select('*').limit(1);
    console.log(`\nSCHEMA ${t}: ${error ? `ERROR ${error.message}` : data && data.length ? Object.keys(data[0]).join(', ') : 'EXISTS (empty)'}`);
  }

  const tenants: Array<[string, string]> = [['BCL', BCL], ['Sabor', SABOR]];
  for (const [name, id] of tenants) {
    if (!id) { console.log(`\n!! tenant ${name} not resolved — skipping`); continue; }
    await dumpTable('summary_artifacts', name, id, true);
    await dumpTable('summary_artifacts_fine', name, id, true);
    await dumpTable('entity_period_outcomes', name, id, false);
    await committedDataProfile(name, id);
  }

  // Periods context for BCL (closed periods for revenue-by-period grain)
  const { data: periods } = await sb.from('periods').select('id, name, status, start_date, end_date').eq('tenant_id', BCL).order('start_date');
  console.log(`\nBCL periods: ${JSON.stringify(periods, null, 1)}`);
})();
