/**
 * DIAG-063 / D1 — Company-wide dashboard adjacents (READ-ONLY probe)
 *
 * Verifies entity_period_outcomes is populated as a rollup source:
 *  1. Total row count (head:true)
 *  2. Per-tenant row counts (tenant UUIDs only — no names/slugs)
 *  3. Per-period row counts for tenants with outcomes (period view evidence)
 *  4. Shape of one row: column keys + JSONB field key-structure (NO values printed)
 *  5. Structural check: does column `created_at` exist (graph-service.ts orders by it)
 *
 * Channel separation: counts, UUIDs, statuses, timestamps only. No payout values.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // 1. Total count
  const { count: totalCount, error: totalErr } = await supabase
    .from('entity_period_outcomes')
    .select('*', { count: 'exact', head: true });
  console.log('TOTAL entity_period_outcomes rows:', totalCount, totalErr ? `ERR: ${totalErr.message}` : '');

  // 2. Per-tenant counts (tenant UUIDs only)
  const { data: tenants, error: tErr } = await supabase.from('tenants').select('id');
  if (tErr) { console.log('tenants ERR:', tErr.message); return; }
  console.log('tenants total:', tenants?.length);

  const withOutcomes: string[] = [];
  for (const t of tenants ?? []) {
    const { count } = await supabase
      .from('entity_period_outcomes')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', t.id);
    if ((count ?? 0) > 0) {
      withOutcomes.push(t.id);
      console.log(`tenant ${t.id}: ${count} outcome rows`);
    }
  }
  console.log('tenants WITH outcomes:', withOutcomes.length, '| WITHOUT:', (tenants?.length ?? 0) - withOutcomes.length);

  // 3. Per-period counts for tenants with outcomes (period-view evidence)
  for (const tenantId of withOutcomes) {
    const { data: periods } = await supabase
      .from('periods')
      .select('id, canonical_key, status, start_date')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: true });
    for (const p of periods ?? []) {
      const { count } = await supabase
        .from('entity_period_outcomes')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('period_id', p.id);
      console.log(`  tenant ${tenantId} period ${p.id} key=${p.canonical_key} status=${p.status}: ${count} outcome rows`);
    }
  }

  // 4. Shape of one row — keys only, never values
  const { data: sample, error: sErr } = await supabase
    .from('entity_period_outcomes')
    .select('*')
    .order('materialized_at', { ascending: false })
    .limit(1);
  if (sErr) console.log('sample ERR:', sErr.message);
  if (sample && sample.length > 0) {
    const row = sample[0] as Record<string, unknown>;
    console.log('row column keys:', Object.keys(row).join(', '));
    for (const jsonCol of ['rule_set_breakdown', 'component_breakdown', 'attainment_summary', 'metadata']) {
      const v = row[jsonCol];
      if (Array.isArray(v)) {
        console.log(`${jsonCol}: ARRAY length=${v.length}; first-element keys: ${v.length > 0 ? Object.keys(v[0] as object).join(', ') : '(empty)'}`);
      } else if (v && typeof v === 'object') {
        console.log(`${jsonCol}: OBJECT keys: ${Object.keys(v as object).join(', ')}`);
      } else {
        console.log(`${jsonCol}: ${v === null ? 'NULL' : typeof v}`);
      }
    }
    console.log('materialized_at of newest row:', row['materialized_at']);
  }

  // 5. Structural check: created_at column (graph-service.ts:236 orders by it)
  const { error: caErr } = await supabase
    .from('entity_period_outcomes')
    .select('created_at')
    .limit(1);
  console.log('created_at column probe:', caErr ? `ERROR: ${caErr.message}` : 'column exists');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
