#!/usr/bin/env npx tsx
/**
 * Verification script for Velocidad Deportiva seed data.
 * Runs 14 gates and prints PASS/FAIL for each.
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

let passed = 0;
let failed = 0;

function gate(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function main() {
  console.log('=== Velocidad Deportiva Verification (14 Gates) ===\n');

  // 1. Tenant exists
  const { data: tenant } = await sb.from('tenants').select('*').eq('id', TENANT_ID).single();
  gate('1. Tenant exists', !!tenant, tenant?.name);

  // 2. 35 entities
  const { count: entCount } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  gate('2. Entity count = 35', entCount === 35, `${entCount}`);

  // 3. Entity type breakdown
  const { data: ents } = await sb.from('entities').select('entity_type').eq('tenant_id', TENANT_ID);
  const types: Record<string, number> = {};
  for (const e of ents || []) types[e.entity_type] = (types[e.entity_type] || 0) + 1;
  gate('3. Entity types correct', types.organization === 4 && types.location === 8 && types.team === 3 && types.individual === 20,
    `org=${types.organization}, loc=${types.location}, team=${types.team}, ind=${types.individual}`);

  // 4. 2 active rule sets
  const { count: rsCount } = await sb.from('rule_sets').select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID).eq('status', 'active');
  gate('4. Active rule sets = 2', rsCount === 2, `${rsCount}`);

  // 5. 36 assignments (18 floor × 2 plans)
  const { count: assignCount } = await sb.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  gate('5. Assignments = 36', assignCount === 36, `${assignCount}`);

  // 6. 8 periods (6 monthly + 2 quarterly)
  const { count: perCount } = await sb.from('periods').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  gate('6. Periods = 8', perCount === 8, `${perCount}`);

  // 7. Committed data = 156 (8 stores × 6 + 18 associates × 6)
  const { count: cdCount } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  gate('7. Committed data = 156', cdCount === 156, `${cdCount}`);

  // 8. Calculation results = 108 (18 × 6 months)
  const { count: crCount } = await sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  gate('8. Calc results = 108', crCount === 108, `${crCount}`);

  // 9. Entity period outcomes = 36 (18 × 2 quarters)
  const { count: epoCount } = await sb.from('entity_period_outcomes').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  gate('9. Outcomes = 36', epoCount === 36, `${epoCount}`);

  // 10. Relationships include 'manages' type
  const { count: managesCount } = await sb.from('entity_relationships').select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID).eq('relationship_type', 'manages');
  gate('10. Management relationships exist', (managesCount || 0) >= 19, `manages count = ${managesCount}`);

  // 11. A01 Carlos Mendoza has 6 months of Oro
  const { data: a01Results } = await sb.from('calculation_results').select('metrics')
    .eq('tenant_id', TENANT_ID).eq('entity_id', 'b2000000-0004-0000-0000-000000000001');
  const a01Medals = (a01Results || []).map(r => (r.metrics as Record<string, unknown>)?.medal);
  const a01OroCount = a01Medals.filter(m => m === 'oro').length;
  gate('11. A01 has 6 Oro medals', a01OroCount === 6, `oro months = ${a01OroCount}`);

  // 12. A05 Diego Castillo is gated (attendance 88%)
  const { data: a05Results } = await sb.from('calculation_results').select('total_payout')
    .eq('tenant_id', TENANT_ID).eq('entity_id', 'b2000000-0004-0000-0000-000000000005');
  const a05AllZero = (a05Results || []).every(r => r.total_payout === 0);
  gate('12. A05 gated (all zero payouts)', a05AllZero, `results = ${a05Results?.length}`);

  // 13. 3 auth users exist
  const { data: profiles } = await sb.from('profiles').select('email').eq('tenant_id', TENANT_ID);
  const vdProfiles = (profiles || []).filter(p => (p.email as string)?.includes('velocidaddeportiva'));
  gate('13. VD auth profiles = 3', vdProfiles.length === 3, `${vdProfiles.length}`);

  // 14. demo_users in tenant settings
  const settings = (tenant?.settings || {}) as Record<string, unknown>;
  const demoUsers = settings.demo_users as Array<unknown>;
  gate('14. demo_users in tenant settings', Array.isArray(demoUsers) && demoUsers.length === 3, `${demoUsers?.length || 0} demo users`);

  console.log(`\n=== Results: ${passed}/${passed + failed} gates passed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('Verification failed:', err); process.exit(1); });
