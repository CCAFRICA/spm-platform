// OB-257 PG-4 — independent truth derivation (read-only).
//
// Computes per-period revenue totals DIRECTLY from committed_data via the convergence-resolved
// revenue role (read from the persisted surface_bindings recognition output — NOT from the
// materializer code path), then matches them against what the Revenue serving layer returns
// (the revenue_period rows in summary_rollups, which /api/revenue/data serves verbatim).
//
// Reconciliation-channel separation: this script REPORTS calculated values verbatim, served vs
// derived, per period. It produces no reconciliation interpretation (architect channel).
//
// Usage: cd web && npx tsx --env-file=.env.local scripts/ob257-pg4-truth-derivation.ts <tenantId>
import { createClient } from '@supabase/supabase-js';

const TENANT = process.argv[2] ?? 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'; // BCL default
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
const round2 = (v: number) => Math.round(v * 100) / 100;

async function main() {
  // 1. The convergence-resolved revenue role: the persisted recognition output for the Revenue
  //    agent's measure surface (written by recognize() at activation). Independent of the
  //    materializer's in-memory path — this is the DB record of what the LLM recognized.
  const { data: bindings, error: bErr } = await sb
    .from('surface_bindings')
    .select('surface_id, resolved_fields, confidence, structural_fingerprint_hash, created_at')
    .eq('tenant_id', TENANT)
    .eq('surface_id', 'revenue.measure');
  if (bErr) throw new Error(`surface_bindings read: ${bErr.message}`);
  if (!bindings || bindings.length === 0) {
    console.log('NO revenue.measure surface binding exists for tenant', TENANT, '- activation has not run.');
    process.exit(2);
  }
  console.log('surface_bindings[revenue.measure]:', JSON.stringify(bindings, null, 1));
  const fields = (bindings[0].resolved_fields ?? []) as Array<{ field_name?: string; field?: string }>;
  const field = fields[0]?.field_name ?? fields[0]?.field;
  if (!field) {
    console.log('binding carries no resolved field (unresolved recognition) - nothing to derive.');
    process.exit(2);
  }
  console.log(`\nDERIVATION FIELD (from persisted recognition): ${field}\n`);

  // 2. Periods (attribution frame — identical rule to the platform: period_id ?? source_date range).
  const { data: periods, error: pErr } = await sb
    .from('periods')
    .select('id, label, canonical_key, start_date, end_date')
    .eq('tenant_id', TENANT)
    .order('start_date', { ascending: true });
  if (pErr) throw new Error(`periods read: ${pErr.message}`);
  const periodIds = new Set((periods ?? []).map((p) => p.id));

  // 3. Independent reduce over committed_data (paged; fresh code, no shared module).
  const derived = new Map<string, { sum: number; rows: number }>();
  let scanned = 0;
  let unattributed = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('committed_data')
      .select('entity_id, period_id, source_date, row_data')
      .eq('tenant_id', TENANT)
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`committed_data read: ${error.message}`);
    const rows = data ?? [];
    scanned += rows.length;
    for (const r of rows) {
      const v = toNum((r.row_data as Record<string, unknown> | null)?.[field]);
      if (v === null) continue;
      let pid: string | null = typeof r.period_id === 'string' && periodIds.has(r.period_id) ? r.period_id : null;
      if (!pid && r.source_date != null) {
        const d = String(r.source_date).slice(0, 10);
        pid = (periods ?? []).find((p) => p.start_date.slice(0, 10) <= d && d <= p.end_date.slice(0, 10))?.id ?? null;
      }
      if (!pid) { unattributed++; continue; }
      const agg = derived.get(pid) ?? { sum: 0, rows: 0 };
      agg.sum += v;
      agg.rows++;
      derived.set(pid, agg);
    }
    if (rows.length < 1000) break;
  }
  console.log(`committed_data rows scanned: ${scanned}; measure rows unattributed to a period: ${unattributed}\n`);

  // 4. Served values: the revenue_period materialization rows the serving layer returns verbatim.
  const { data: rollups, error: rErr } = await sb
    .from('summary_rollups')
    .select('period_id, metrics, row_count')
    .eq('tenant_id', TENANT)
    .eq('data_type', 'revenue_period');
  if (rErr) throw new Error(`summary_rollups read: ${rErr.message}`);
  const served = new Map<string, { primary: number; rows: number }>();
  for (const r of rollups ?? []) {
    const m = (r.metrics ?? {}) as Record<string, unknown>;
    served.set(r.period_id as string, { primary: toNum(m.primary) ?? NaN, rows: toNum(m.row_count) ?? 0 });
  }

  // 5. Report verbatim, per period — served vs derived (no interpretation).
  console.log('period                        | derived (committed_data)  | served (revenue_period rollup) | rows d/s');
  console.log('------------------------------+---------------------------+--------------------------------+---------');
  for (const p of periods ?? []) {
    const d = derived.get(p.id);
    const s = served.get(p.id);
    console.log(
      `${(p.label ?? p.canonical_key ?? p.id).padEnd(29)} | ${d ? String(round2(d.sum)).padEnd(25) : '(none)'.padEnd(25)} | ${s ? String(s.primary).padEnd(30) : '(none)'.padEnd(30)} | ${d?.rows ?? 0}/${s?.rows ?? 0}`,
    );
  }
  const totalD = round2(Array.from(derived.values()).reduce((a, b) => a + b.sum, 0));
  const totalS = round2(Array.from(served.values()).reduce((a, b) => a + (Number.isFinite(b.primary) ? b.primary : 0), 0));
  console.log('------------------------------+---------------------------+--------------------------------+---------');
  console.log(`TOTAL                         | ${String(totalD).padEnd(25)} | ${String(totalS).padEnd(30)} |`);
}
main().catch((e) => { console.error(e); process.exit(1); });
