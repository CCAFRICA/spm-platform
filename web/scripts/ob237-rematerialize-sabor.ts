/**
 * OB-237 T1 unblock: re-materialize summary_artifacts for Sabor from CURRENT committed_data.
 *
 * The stale summary was built from pre-HF-321/HF-324 data (capitalized labelMap keys "Total", values
 * $100.07M). The OB-233 method-aware engine HALTs on the current methodMap (novel method "group" for
 * the categorical "mesa"), so this uses the directive's STANDALONE domain-agnostic aggregation:
 * group committed_data by (entity_id, source_date, data_type); for every row_data field whose value is
 * a JSON number, SUM it; key metrics by the RAW field name (lowercase, == committed_data keys ==
 * recognize().field_name). Deterministic (order by id). Idempotent replace. Data operation via service
 * role (architect disposition: NOT an SR-44 migration).
 *
 * Run: cd web && NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/ob237-rematerialize-sabor.ts
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

interface Agg { entity_id: string; summary_date: string; data_type: string; metrics: Record<string, number>; row_count: number; }

(async () => {
  const { count: before } = await sb.from('summary_artifacts').select('*', { count: 'exact', head: true }).eq('tenant_id', SABOR);
  console.log(`summary_artifacts BEFORE: ${before}`);

  // 1. Aggregate current committed_data (deterministic page by id; SUM all JSON-number fields, raw keys).
  const byKey = new Map<string, Agg>();
  let scanned = 0, skipped = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('committed_data')
      .select('entity_id, source_date, data_type, row_data')
      .eq('tenant_id', SABOR)
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`committed_data read: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      if (!r.entity_id || !r.source_date) { skipped++; continue; }
      const k = `${r.entity_id}|${r.source_date}|${r.data_type}`;
      let a = byKey.get(k);
      if (!a) { a = { entity_id: r.entity_id, summary_date: r.source_date, data_type: r.data_type, metrics: {}, row_count: 0 }; byKey.set(k, a); }
      a.row_count++;
      const rd = (r.row_data || {}) as Record<string, unknown>;
      for (const [key, val] of Object.entries(rd)) {
        if (typeof val === 'number' && Number.isFinite(val)) a.metrics[key] = (a.metrics[key] ?? 0) + val;
      }
    }
    scanned += data.length;
    if (data.length < 1000) break;
  }
  const artifacts = Array.from(byKey.values());
  console.log(`scanned=${scanned} skipped=${skipped} -> ${artifacts.length} (entity,date) artifacts`);

  // 2. Idempotent replace.
  const { error: delErr } = await sb.from('summary_artifacts').delete().eq('tenant_id', SABOR);
  if (delErr) throw new Error(`delete: ${delErr.message}`);
  const now = new Date().toISOString();
  let written = 0;
  for (let i = 0; i < artifacts.length; i += 500) {
    const batch = artifacts.slice(i, i + 500).map(a => ({
      tenant_id: SABOR, entity_id: a.entity_id, summary_date: a.summary_date, period_id: null,
      data_type: a.data_type, metrics: a.metrics, row_count: a.row_count, computed_at: now, created_at: now,
    }));
    const { error } = await sb.from('summary_artifacts').insert(batch);
    if (error) throw new Error(`insert: ${error.message}`);
    written += batch.length;
  }
  console.log(`written=${written}`);

  // 3. Verify against truth.
  let rawTotal = 0, rawCount = 0;
  for (let o = 0; ; o += 1000) {
    const { data } = await sb.from('committed_data').select('row_data').eq('tenant_id', SABOR).eq('data_type', 'pos_cheque').order('id', { ascending: true }).range(o, o + 999);
    if (!data || !data.length) break;
    for (const r of data as any[]) { rawTotal += Number(r.row_data?.total ?? 0); rawCount++; }
    if (data.length < 1000) break;
  }
  let sumTotal = 0, sumRows = 0, sumPropina = 0;
  for (const a of artifacts) { sumTotal += Number(a.metrics['total'] ?? 0); sumPropina += Number(a.metrics['propina'] ?? 0); sumRows += a.row_count; }
  console.log(`\ncommitted_data: rows=${rawCount} SUM(total)=$${rawTotal.toFixed(2)}`);
  console.log(`summary_artifacts: rows=${written} SUM(row_count)=${sumRows} SUM(metrics.total)=$${sumTotal.toFixed(2)} SUM(metrics.propina)=$${sumPropina.toFixed(2)}`);
  const match = Math.abs(rawTotal - sumTotal) < 0.01;
  console.log(`\nTRUTH MATCH revenue: ${match ? 'YES ✓' : 'NO ✗ HALT-REMAT'}  |  row-count: ${rawCount === sumRows ? 'YES ✓' : 'NO ✗'}`);
  process.exit(match && rawCount === sumRows ? 0 : 1);
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
