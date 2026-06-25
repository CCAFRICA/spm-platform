/**
 * OB-237 T-FIN — POPULATE summary_artifacts_fine for Sabor (PG-FINE-POP).
 *
 * Sibling materialization at the FINE grain (entity, mesero/sub-entity, date, hour) that unblocks the
 * sub-entity / hourly Financial modes (staff, location_detail staff-section, patterns, server_detail).
 * Modeled on scripts/ob237-rematerialize-sabor.ts (the proven (entity,day) materializer) — same
 * deterministic page-by-id, same "SUM every JSON-number field by RAW lowercase key" rule (raw key ==
 * committed_data key == recognize().field_name), same conditional leakage metrics. The ONLY difference
 * is the grouping key carries mesero (sub_entity_id) + hour.
 *
 * Fields resolved via recognize() (Korean Test — no hardcoded keys): revenue->total, cancelled->cancelado,
 * discount->total_descuentos, comp->total_cortesias, server->mesero_id. hour = new Date(row_data.fecha).getHours().
 * sub_entity_id = String(row_data.mesero_id).
 *
 * Idempotent: delete summary_artifacts_fine WHERE tenant_id=Sabor, then insert (batch 500).
 * VERIFY: SUM(metrics.total) across all fine rows === $100,068,158.15 (within $0.01) AND
 *         SUM(row_count) === 263,250. Else HALT-FINE-MATCH (report, do NOT wire).
 *
 * Run: cd web && NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/ob237-populate-fine-sabor.ts
 */
import { createClient } from '@supabase/supabase-js';
import { recognize } from '@/lib/comprehension/surface-binding-recognition';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

interface Agg {
  entity_id: string;
  sub_entity_id: string;
  summary_date: string;
  hour: number;
  data_type: string;
  metrics: Record<string, number>;
  row_count: number;
}

(async () => {
  const { count: before } = await sb.from('summary_artifacts_fine').select('*', { count: 'exact', head: true }).eq('tenant_id', SABOR);
  console.log(`summary_artifacts_fine BEFORE: ${before}`);

  // Resolve measure/flag/server fields via recognize (Korean Test — no hardcoded keys).
  const keyFor = async (surface: string, purpose: string): Promise<string | null> => {
    const r = await recognize(sb as any, SABOR, surface, purpose);
    return r.status === 'resolved' && r.fields[0] ? (r.fields[0].field_name ?? r.fields[0].display_label) : null;
  };
  const revKey = await keyFor('financial.network_pulse.revenue', 'the primary monetary amount of money earned or charged as the gross outcome of each transaction or sale');
  const cancelKey = await keyFor('financial.leakage.cancelled', 'a boolean/flag field marking whether the transaction (cheque) was cancelled or voided');
  const discKey = await keyFor('financial.network_pulse.discount', 'the amount discounted or reduced from the charge');
  const compKey = await keyFor('financial.network_pulse.complimentary', 'the amount given away as complimentary or comped (a zero-charge item)');
  const serverKey = await keyFor('financial.staff.server', 'the identifier of the server, waiter, or staff member who handled the transaction');
  const tipKey = await keyFor('financial.network_pulse.tips', 'the gratuity or tip amount the customer adds on top of the charge');
  console.log(`resolved revenue='${revKey}' cancelled='${cancelKey}' discount='${discKey}' comp='${compKey}' server='${serverKey}' tips='${tipKey}'`);
  if (!revKey || !cancelKey || !serverKey) throw new Error('HALT-RECOGNIZE: revenue/cancelled/server field unresolved');

  // 1. Aggregate current committed_data (deterministic page by id; SUM all JSON-number fields, raw keys)
  //    at the FINE grain (entity, mesero, date, hour).
  const byKey = new Map<string, Agg>();
  let scanned = 0, skipped = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('committed_data')
      .select('entity_id, source_date, data_type, row_data')
      .eq('tenant_id', SABOR)
      .eq('data_type', 'pos_cheque')
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`committed_data read: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      if (!r.entity_id || !r.source_date) { skipped++; continue; }
      const rd = (r.row_data || {}) as Record<string, unknown>;
      const sub = String(rd[serverKey] ?? '');
      const fecha = String(rd.fecha ?? '');
      const hr = fecha ? new Date(fecha).getHours() : 0;
      const hour = Number.isFinite(hr) ? hr : 0;
      const k = `${r.entity_id}|${sub}|${r.source_date}|${hour}|${r.data_type}`;
      let a = byKey.get(k);
      if (!a) { a = { entity_id: r.entity_id, sub_entity_id: sub, summary_date: r.source_date, hour, data_type: r.data_type, metrics: {}, row_count: 0 }; byKey.set(k, a); }
      a.row_count++;
      for (const [key, val] of Object.entries(rd)) {
        if (typeof val === 'number' && Number.isFinite(val)) a.metrics[key] = (a.metrics[key] ?? 0) + val;
      }
      // Conditional metrics for leakage — cancelled revenue/count + discount/comp counts (cheques WHERE field>0).
      // cancelled_tips lets the staff/server modes (which EXCLUDE cancelled cheques) subtract cancelled
      // tips/revenue/checks from the unconditional fine totals to reconstruct the non-cancelled aggregate.
      if (Number(rd[cancelKey]) === 1) {
        a.metrics.cancelled_revenue = (a.metrics.cancelled_revenue ?? 0) + (Number(rd[revKey]) || 0);
        a.metrics.cancelled_count = (a.metrics.cancelled_count ?? 0) + 1;
        if (tipKey) a.metrics.cancelled_tips = (a.metrics.cancelled_tips ?? 0) + (Number(rd[tipKey]) || 0);
        a.metrics.cancelled_guests = (a.metrics.cancelled_guests ?? 0) + (Number(rd.numero_de_personas) || 0);
      }
      if (discKey && Number(rd[discKey]) > 0) a.metrics.discount_count = (a.metrics.discount_count ?? 0) + 1;
      if (compKey && Number(rd[compKey]) > 0) a.metrics.comp_count = (a.metrics.comp_count ?? 0) + 1;
      // service time (cierre - fecha) for the patterns mode's avgServiceMinutes — non-cancelled, 0<min<480.
      // Summable so the per-bucket fine row reconstructs the global average exactly (sum/count).
      if (Number(rd[cancelKey]) !== 1) {
        const openT = fecha ? new Date(fecha).getTime() : NaN;
        const closeT = rd.cierre ? new Date(String(rd.cierre)).getTime() : NaN;
        if (Number.isFinite(openT) && Number.isFinite(closeT) && closeT > openT) {
          const minutes = (closeT - openT) / 60000;
          if (minutes > 0 && minutes < 480) {
            a.metrics.service_minutes_sum = (a.metrics.service_minutes_sum ?? 0) + minutes;
            a.metrics.service_count = (a.metrics.service_count ?? 0) + 1;
          }
        }
      }
    }
    scanned += data.length;
    if (data.length < 1000) break;
  }
  const artifacts = Array.from(byKey.values());
  console.log(`scanned=${scanned} skipped=${skipped} -> ${artifacts.length} (entity,mesero,date,hour) fine artifacts`);

  // 2. Idempotent replace.
  const { error: delErr } = await sb.from('summary_artifacts_fine').delete().eq('tenant_id', SABOR);
  if (delErr) throw new Error(`delete: ${delErr.message}`);
  const now = new Date().toISOString();
  let written = 0;
  for (let i = 0; i < artifacts.length; i += 500) {
    const batch = artifacts.slice(i, i + 500).map(a => ({
      tenant_id: SABOR, entity_id: a.entity_id, sub_entity_id: a.sub_entity_id,
      summary_date: a.summary_date, hour: a.hour, period_id: null,
      data_type: a.data_type, metrics: a.metrics, row_count: a.row_count,
      convergence_hash: null, computed_at: now, created_at: now,
    }));
    const { error } = await sb.from('summary_artifacts_fine').insert(batch);
    if (error) throw new Error(`insert: ${error.message}`);
    written += batch.length;
  }
  console.log(`written=${written}`);

  // 3. Verify against deterministic committed_data truth.
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
  let sumTotal = 0, sumRows = 0, sumCancelRev = 0, sumCancelCount = 0;
  for (const a of artifacts) {
    sumTotal += Number(a.metrics['total'] ?? 0); sumRows += a.row_count;
    sumCancelRev += Number(a.metrics['cancelled_revenue'] ?? 0); sumCancelCount += Number(a.metrics['cancelled_count'] ?? 0);
  }
  console.log(`\ncommitted_data:        rows=${rawCount} SUM(total)=$${rawTotal.toFixed(2)} cancelled_revenue=$${rawCancelRev.toFixed(2)} cancelled_count=${rawCancelCount}`);
  console.log(`summary_artifacts_fine: rows=${written} SUM(row_count)=${sumRows} SUM(metrics.total)=$${sumTotal.toFixed(2)} cancelled_revenue=$${sumCancelRev.toFixed(2)} cancelled_count=${sumCancelCount}`);
  const TRUTH = 100068158.15;
  const match = Math.abs(rawTotal - sumTotal) < 0.01 && Math.abs(sumTotal - TRUTH) < 0.01;
  const rowMatch = rawCount === sumRows && sumRows === 263250;
  const cancelMatch = Math.abs(rawCancelRev - sumCancelRev) < 0.01 && rawCancelCount === sumCancelCount;
  console.log(`\nTRUTH MATCH revenue ($100,068,158.15): ${match ? 'YES ✓' : 'NO ✗ HALT-FINE-MATCH'}`);
  console.log(`row-count (263,250): ${rowMatch ? 'YES ✓' : 'NO ✗ HALT-FINE-MATCH'}`);
  console.log(`cancelled_revenue: ${cancelMatch ? 'YES ✓' : 'NO ✗'}`);
  process.exit(match && rowMatch ? 0 : 1);
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
