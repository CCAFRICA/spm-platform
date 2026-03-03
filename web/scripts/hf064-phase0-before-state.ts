/**
 * HF-064 Phase 0: Document before state
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('HF-064 PHASE 0: BEFORE STATE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 0A: Tenant ID
  console.log('### 0A: Tenant\n');
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, name')
    .ilike('slug', '%optica%')
    .limit(1)
    .single();

  if (!tenant) { console.error('Tenant not found'); return; }
  console.log(`id:   ${tenant.id}`);
  console.log(`slug: ${tenant.slug}`);
  console.log(`name: ${tenant.name}`);

  const tid = tenant.id;

  // 0B: Current counts
  console.log('\n### 0B: Current Counts\n');

  const tables = [
    { name: 'entities', table: 'entities' },
    { name: 'periods', table: 'periods' },
    { name: 'rule_sets', table: 'rule_sets' },
    { name: 'rule_set_assignments', table: 'rule_set_assignments' },
    { name: 'committed_data', table: 'committed_data' },
    { name: 'calculation_results', table: 'calculation_results' },
    { name: 'calculation_batches', table: 'calculation_batches' },
    { name: 'entity_period_outcomes', table: 'entity_period_outcomes' },
    { name: 'import_batches', table: 'import_batches' },
    { name: 'classification_signals', table: 'classification_signals' },
    { name: 'disputes', table: 'disputes' },
    { name: 'approval_requests', table: 'approval_requests' },
    { name: 'audit_logs', table: 'audit_logs' },
  ];

  for (const t of tables) {
    const { count } = await supabase
      .from(t.table)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid);
    console.log(`${t.name.padEnd(25)} ${count ?? 0}`);
  }

  // 0C: Profiles (MUST SURVIVE)
  console.log('\n### 0C: Profiles (MUST SURVIVE)\n');
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, email, role')
    .eq('tenant_id', tid);

  if (profiles) {
    for (const p of profiles) {
      console.log(`id: ${p.id}`);
      console.log(`  display_name: ${p.display_name}`);
      console.log(`  email: ${p.email}`);
      console.log(`  role: ${p.role}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Phase 0 complete — before state documented');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
