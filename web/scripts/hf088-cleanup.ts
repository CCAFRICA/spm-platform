/**
 * HF-088 Phase 1: Cleanup — delete HF-086 damage and duplicate rule_sets
 * Run from: spm-platform/web
 * Command: npx tsx scripts/hf088-cleanup.ts
 *
 * SAFETY: This script only deletes:
 *   1. Profiles where email='platform@vialuce.com' AND tenant_id IS NOT NULL
 *      (HF-086 auto-created profiles that should never exist per Decision 79)
 *   2. ALL rule_sets for Optica Luminar tenant (tenant was nuclear cleared — no valid rule_sets should exist)
 *   3. Any rule_set_assignments orphaned by rule_set deletion
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanup() {
  console.log('=== HF-088 CLEANUP ===\n');

  // FK dependency order: rule_set_assignments → rule_sets → profiles
  // Must delete rule_sets BEFORE profiles (rule_sets.created_by FK → profiles.id)

  // Step 1: Delete rule_set_assignments for Optica Luminar
  console.log('Step 1: Deleting Optica Luminar rule_set_assignments...');

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .ilike('slug', '%optica%');

  if (!tenants?.length) {
    console.log('No Optica tenant found. Skipping rule_set cleanup.');
  } else {
    const tenantId = tenants[0].id;

    const { error: assignErr, count: assignCount } = await supabase
      .from('rule_set_assignments')
      .delete({ count: 'exact' })
      .eq('tenant_id', tenantId);

    if (assignErr) {
      console.error('Assignment delete error:', assignErr.message);
    } else {
      console.log(`Deleted ${assignCount ?? 0} rule_set_assignments.`);
    }

    // Step 2: Delete rule_sets (must go before profile delete due to created_by FK)
    console.log('\nStep 2: Deleting Optica Luminar rule_sets...');
    const { error: rsErr, count: rsCount } = await supabase
      .from('rule_sets')
      .delete({ count: 'exact' })
      .eq('tenant_id', tenantId);

    if (rsErr) {
      console.error('Rule set delete error:', rsErr.message);
      process.exit(1);
    }
    console.log(`Deleted ${rsCount ?? 0} rule_sets.`);
  }

  // Step 3: Delete auto-created VL Admin tenant profiles (now safe — no FK references)
  console.log('\nStep 3: Deleting VL Admin tenant-scoped profiles...');

  const { data: toDelete } = await supabase
    .from('profiles')
    .select('id, tenant_id, email, role, display_name')
    .eq('email', 'platform@vialuce.com')
    .not('tenant_id', 'is', null);

  console.log(`Found ${toDelete?.length ?? 0} profiles to delete:`);
  if (toDelete?.length) console.table(toDelete);

  if (toDelete && toDelete.length > 0) {
    const ids = toDelete.map(p => p.id);
    const { error: delError, count } = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .in('id', ids);

    if (delError) {
      console.error('DELETE FAILED:', delError.message);
      process.exit(1);
    }
    console.log(`Deleted ${count} VL Admin tenant profiles.`);
  } else {
    console.log('No VL Admin tenant profiles to delete.');
  }

  console.log('\n=== CLEANUP COMPLETE ===');
  console.log('Now re-run hf088-diagnostic.ts to verify clean state (Phase 2).');
}

cleanup().catch(console.error);
