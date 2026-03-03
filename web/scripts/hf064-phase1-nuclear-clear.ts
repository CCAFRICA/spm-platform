/**
 * HF-064 Phase 1: Nuclear Clear — delete all domain data for Óptica Luminar
 * Preserves: tenant, profiles, auth.users
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function deleteAll(table: string) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq('tenant_id', tid);
  if (error) {
    console.log(`  ${table}: ERROR — ${error.message}`);
    return -1;
  }
  console.log(`  ${table}: deleted ${count} rows`);
  return count ?? 0;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('HF-064 PHASE 1: NUCLEAR CLEAR');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`Tenant: ${tid}\n`);

  // Delete in FK-dependency order (children first)
  
  // Layer 6: Outcomes + results (depend on calculation_batches, entities, periods)
  console.log('Layer 6: Outcomes + results');
  await deleteAll('entity_period_outcomes');
  await deleteAll('calculation_results');

  // Layer 5.5: Approval requests + disputes (depend on calculation_batches)
  console.log('\nLayer 5.5: Approvals + disputes');
  await deleteAll('approval_requests');
  await deleteAll('disputes');

  // Layer 5: Calculation batches (depend on rule_sets, periods)
  console.log('\nLayer 5: Calculation batches');
  await deleteAll('calculation_batches');

  // Layer 4.5: Classification signals (depend on entities)
  console.log('\nLayer 4.5: Classification signals');
  await deleteAll('classification_signals');

  // Layer 4: Assignments (depend on rule_sets, entities)
  console.log('\nLayer 4: Assignments');
  await deleteAll('rule_set_assignments');

  // Layer 3: Committed data (depends on import_batches, entities, periods)
  console.log('\nLayer 3: Committed data');
  await deleteAll('committed_data');

  // Layer 2: Rule sets, entities, periods, import batches
  console.log('\nLayer 2: Domain objects');
  await deleteAll('rule_sets');
  await deleteAll('entities');
  await deleteAll('periods');
  await deleteAll('import_batches');

  // Layer 1: Audit logs
  console.log('\nLayer 1: Audit logs');
  await deleteAll('audit_logs');

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Nuclear clear complete.');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
