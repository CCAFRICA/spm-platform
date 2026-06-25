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
import { recognize } from '@/lib/comprehension/surface-binding-recognition';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

interface Agg { entity_id: string; summary_date: string; data_type: string; metrics: Record<string, number>; row_count: number; }

(async () => {
  const { count: before } = await sb.from('summary_artifacts').select('*', { count: 'exact', head: true }).eq('tenant_id', SABOR);
  console.log(`summary_artifacts BEFORE: ${before}`);

  // OB-237 P0: resolve revenue + cancelled-flag fields via recognize (Korean Test — no hardcoded keys).
  const keyFor = async (surface: string, purpose: string): Promise<string | null> => {
    const r = await recognize(sb as any, SABOR, surface, purpose);
    return r.status === 'resolved' && r.fields[0] ? (r.fields[0].field_name ?? r.fields[0].display_label) : null;
  };
  const revKey = await keyFor('financial.network_pulse.revenue', 'the primary monetary amount of money earned or charged as the gross outcome of each transaction or sale');
  const cancelKey = await keyFor('financial.leakage.cancelled', 'a boolean/flag field marking whether the transaction (cheque) was cancelled or voided');
  const discKey = await keyFor('financial.network_pulse.discount', 'the amount discounted or reduced from the charge');
  const compKey = await keyFor('financial.network_pulse.complimentary', 'the amount given away as complimentary or comped (a zero-charge item)');
  console.log(`resolved revenue='${revKey}' cancelled='${cancelKey}' discount='${discKey}' comp='${compKey}'`);
  if (!revKey || !cancelKey) throw new Error('HALT-RECOGNIZE: revenue or cancelled field unresolved');

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
      // OB-237 P0: conditional metrics for leakage — cancelled revenue/count + discount/comp counts
      // (cheques WHERE field>0). Derived, not row fields. Enables exact leakage value-match.
      if (Number(rd[cancelKey]) === 1) {
        a.metrics.cancelled_revenue = (a.metrics.cancelled_revenue ?? 0) + (Number(rd[revKey]) || 0);
        a.metrics.cancelled_count = (a.metrics.cancelled_count ?? 0) + 1;
      }
      if (discKey && Number(rd[discKey]) > 0) a.metrics.discount_count = (a.metrics.discount_count ?? 0) + 1;
      if (compKey && Number(rd[compKey]) > 0) a.metrics.comp_count = (a.metrics.comp_count ?? 0) + 1;
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

  // 3. Verify against truth (revenue + cancelled_revenue conditional metric).
  let rawTotal = 0, rawCount = 0, rawCancelRev = 0, rawCancelCount = 0;
  for (let o = 0; ; o += 1000) {
    const { data } = await sb.from('committed_data').select('row_data').eq('tenant_id', SABOR).eq('data_type', 'pos_cheque').order('id', { ascending: true }).range(o, o + 999);
    if (!data || !data.length) break;
    for (const r of data as any[]) {
      rawTotal += Number(r.row_data?.[revKey] ?? 0); rawCount++;
      if (Number(r.row_data?.[cancelKey]) === 1) { rawCancelRev += Number(r.row_data?.[revKey] ?? 0); rawCancelCount++; }
    }
    if (data.length < 1000) break;
  }
  let sumTotal = 0, sumRows = 0, sumPropina = 0, sumCancelRev = 0, sumCancelCount = 0;
  for (const a of artifacts) {
    sumTotal += Number(a.metrics['total'] ?? 0); sumPropina += Number(a.metrics['propina'] ?? 0); sumRows += a.row_count;
    sumCancelRev += Number(a.metrics['cancelled_revenue'] ?? 0); sumCancelCount += Number(a.metrics['cancelled_count'] ?? 0);
  }
  console.log(`\ncommitted_data: rows=${rawCount} SUM(total)=$${rawTotal.toFixed(2)} cancelled_revenue=$${rawCancelRev.toFixed(2)} cancelled_count=${rawCancelCount}`);
  console.log(`summary_artifacts: rows=${written} SUM(row_count)=${sumRows} SUM(metrics.total)=$${sumTotal.toFixed(2)} SUM(metrics.cancelled_revenue)=$${sumCancelRev.toFixed(2)} cancelled_count=${sumCancelCount}`);
  const match = Math.abs(rawTotal - sumTotal) < 0.01;
  const cancelMatch = Math.abs(rawCancelRev - sumCancelRev) < 0.01 && rawCancelCount === sumCancelCount;
  console.log(`\nTRUTH MATCH revenue: ${match ? 'YES ✓' : 'NO ✗ HALT-REMAT'}  |  row-count: ${rawCount === sumRows ? 'YES ✓' : 'NO ✗'}`);
  console.log(`PG-CANCEL cancelled_revenue: ${cancelMatch ? 'YES ✓' : 'NO ✗ HALT-CANCEL-MATCH'}`);
  process.exit(match && rawCount === sumRows && cancelMatch ? 0 : 1);
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
