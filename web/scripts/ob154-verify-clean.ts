/**
 * OB-154 Phase 0: Pre-import verification — confirm clean state
 * Run from: spm-platform/web
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const OPTICA = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const LAB = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function run() {
  console.log('=== OB-154 PHASE 0: PRE-IMPORT VERIFICATION ===\n');

  // 0A: Óptica Engine Contract — all zeros
  console.log('--- 0A: OPTICA ENGINE CONTRACT ---');
  const tables = ['rule_sets', 'entities', 'periods', 'committed_data', 'rule_set_assignments',
    'calculation_results', 'calculation_batches', 'entity_period_outcomes', 'import_batches'];

  let allZero = true;
  for (const table of tables) {
    const { count } = await sb.from(table)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', OPTICA);
    if (count !== 0) allZero = false;
    console.log(`  ${table}: ${count}`);
  }
  console.log(`  All zeros: ${allZero ? 'YES ✓' : 'NO ✗ — HF-088 incomplete'}`);

  // Tenant + persona profiles
  console.log('\n--- TENANT + PERSONAS ---');
  const { data: tenant } = await sb.from('tenants')
    .select('id, name, slug')
    .eq('id', OPTICA).single();
  console.log(`  Tenant: ${tenant?.name} (${tenant?.slug})`);

  const { data: personas } = await sb.from('profiles')
    .select('display_name, email, role')
    .eq('tenant_id', OPTICA);
  console.log(`  Persona profiles: ${personas?.length}`);
  for (const p of personas || []) {
    console.log(`    - ${p.display_name} (${p.email}) role=${p.role}`);
  }

  // LAB baseline
  console.log('\n--- LAB BASELINE ---');
  const { count: labCount } = await sb.from('calculation_results')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', LAB);
  console.log(`  LAB results: ${labCount}`);

  console.log(`\n=== Phase 0: ${allZero && tenant ? 'PASS' : 'FAIL'} ===`);
}

run().catch(console.error);
