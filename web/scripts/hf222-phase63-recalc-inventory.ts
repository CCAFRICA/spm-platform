// HF-222 Phase 6.3.1 — inventory rule_sets and active periods for BCL + Meridian + CRP.
// Service-role client; VP discipline (no DATABASE_URL).

import { createClient } from '@supabase/supabase-js';

const TENANTS = {
  BCL: 'b1c2d3e4-aaaa-bbbb-cccc-111111111111',
  Meridian: '5035b1e8-0754-4527-b7ec-9f93f85e4c79',
  CRP: 'e44bbcb1-2710-4880-8c7d-a1bd902720b7',
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('missing env'); process.exit(1); }
  const supabase = createClient(url, key);

  const tenantIds = Object.values(TENANTS);

  // Rule sets per tenant.
  const { data: ruleSets, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, name, tenant_id')
    .in('tenant_id', tenantIds);
  if (rsErr) { console.error('rule_sets query error:', rsErr); process.exit(1); }
  console.log('=== rule_sets ===');
  console.log(JSON.stringify(ruleSets, null, 2));

  // Periods per tenant (from `periods` table directly).
  const { data: periods, error: pErr } = await supabase
    .from('periods')
    .select('id, tenant_id, name, start_date, end_date, status')
    .in('tenant_id', tenantIds)
    .order('start_date', { ascending: true });
  if (pErr) { console.error('periods query error:', pErr); process.exit(1); }
  console.log('\n=== periods ===');
  console.log(JSON.stringify(periods, null, 2));

  // Committed import_batches per tenant + period (proxy for "active periods with data").
  const { data: batches, error: bErr } = await supabase
    .from('import_batches')
    .select('id, tenant_id, period_id, status, data_type, created_at')
    .in('tenant_id', tenantIds)
    .eq('status', 'committed')
    .order('created_at', { ascending: true });
  if (bErr) { console.error('import_batches query error:', bErr); process.exit(1); }
  console.log('\n=== import_batches (committed) ===');
  console.log(JSON.stringify(batches, null, 2));

  // Active periods per tenant — distinct period_ids from committed batches.
  console.log('\n=== Active periods per tenant (committed-batches join) ===');
  for (const [label, tid] of Object.entries(TENANTS)) {
    const tBatches = (batches ?? []).filter(b => b.tenant_id === tid);
    const tPeriodIds = Array.from(new Set(tBatches.map(b => b.period_id).filter(Boolean)));
    const tPeriods = (periods ?? []).filter(p => tPeriodIds.includes(p.id));
    const tRuleSets = (ruleSets ?? []).filter(r => r.tenant_id === tid);
    console.log(`\n--- ${label} (${tid}) ---`);
    console.log(`rule_sets: ${tRuleSets.map(r => `${r.id}=${JSON.stringify(r.name)}`).join('; ')}`);
    console.log(`active period_ids (from committed batches): ${tPeriodIds.length}`);
    for (const p of tPeriods) {
      console.log(`  ${p.id} | ${p.name} | ${p.start_date} .. ${p.end_date} | status=${p.status}`);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
