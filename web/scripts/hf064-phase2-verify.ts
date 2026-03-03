/**
 * HF-064 Phase 2: Verify clean state
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('HF-064 PHASE 2: VERIFY CLEAN STATE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 2A: All counts zero
  console.log('### 2A: All counts must be 0\n');
  const tables = [
    'entities', 'periods', 'rule_sets', 'rule_set_assignments',
    'committed_data', 'calculation_results', 'calculation_batches',
    'entity_period_outcomes', 'import_batches', 'classification_signals',
    'disputes', 'approval_requests', 'audit_logs',
  ];

  let allZero = true;
  for (const table of tables) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid);
    const status = (count ?? 0) === 0 ? 'OK' : 'FAIL';
    if ((count ?? 0) !== 0) allZero = false;
    console.log(`  ${table.padEnd(25)} ${count ?? 0} ${status}`);
  }
  console.log(`\nAll zero: ${allZero ? 'YES' : 'NO'}`);

  // 2B: Profiles intact
  console.log('\n### 2B: Profiles intact\n');
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, email, role')
    .eq('tenant_id', tid);

  if (profiles && profiles.length === 3) {
    for (const p of profiles) {
      console.log(`  ${p.email} — ${p.display_name} (${p.role})`);
    }
    console.log(`\nProfiles: ${profiles.length}/3 — INTACT`);
  } else {
    console.log(`  FAIL: Expected 3 profiles, got ${profiles?.length ?? 0}`);
  }

  // 2C: Tenant intact
  console.log('\n### 2C: Tenant intact\n');
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, name')
    .eq('id', tid)
    .single();

  if (tenant) {
    console.log(`  id:   ${tenant.id}`);
    console.log(`  slug: ${tenant.slug}`);
    console.log(`  name: ${tenant.name}`);
    console.log(`\nTenant: INTACT`);
  } else {
    console.log('  FAIL: Tenant not found');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Phase 2: ${allZero ? 'PASS' : 'FAIL'} — Clean state verified`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
