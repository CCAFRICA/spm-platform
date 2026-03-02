// OB-141 Phase 2: Clean orphaned entities (those with zero committed_data rows)
// IMPORTANT: Do NOT delete all SCI entities — production data depends on them.
// Only delete entities that have no committed_data linked to them.
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob141-phase2-clean-entities.ts

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ORIGINAL_RS_ID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function cleanEntities() {
  // Count before
  const { count: beforeCount } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`Entities BEFORE cleanup: ${beforeCount}`);

  // Find entities that HAVE committed_data (these must be kept)
  const entitiesWithData = new Set<string>();
  let offset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('committed_data')
      .select('entity_id')
      .eq('tenant_id', TENANT_ID)
      .not('entity_id', 'is', null)
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    page.forEach(r => entitiesWithData.add(r.entity_id));
    offset += 1000;
    if (page.length < 1000) break;
  }
  console.log(`Entities WITH committed_data: ${entitiesWithData.size}`);

  // Find ALL entity IDs
  const allEntityIds: string[] = [];
  let entOffset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('entities')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .range(entOffset, entOffset + 999);
    if (!page || page.length === 0) break;
    allEntityIds.push(...page.map(e => e.id));
    entOffset += 1000;
    if (page.length < 1000) break;
  }
  console.log(`Total entity IDs: ${allEntityIds.length}`);

  // Find orphaned entities (no committed_data)
  const orphanedIds = allEntityIds.filter(id => !entitiesWithData.has(id));
  console.log(`Orphaned entities (no committed_data): ${orphanedIds.length}`);
  console.log(`Entities to KEEP: ${allEntityIds.length - orphanedIds.length}`);

  if (orphanedIds.length === 0) {
    console.log('\nNo orphaned entities to clean up.');
    return;
  }

  // Delete orphaned entities in batches of 200
  let totalDeleted = 0;
  for (let i = 0; i < orphanedIds.length; i += 200) {
    const batch = orphanedIds.slice(i, i + 200);

    // Delete related records first (foreign key constraints)
    await supabase
      .from('rule_set_assignments')
      .delete()
      .in('entity_id', batch);

    await supabase
      .from('calculation_results')
      .delete()
      .in('entity_id', batch);

    await supabase
      .from('entity_period_outcomes')
      .delete()
      .in('entity_id', batch);

    // Delete the entities
    const { error } = await supabase
      .from('entities')
      .delete()
      .in('id', batch);

    if (error) {
      console.error(`  Error at batch ${i}: ${error.message}`);
    } else {
      totalDeleted += batch.length;
      if (totalDeleted % 2000 === 0 || i + 200 >= orphanedIds.length) {
        console.log(`  Deleted ${totalDeleted} of ${orphanedIds.length} orphaned entities`);
      }
    }
  }

  // Count after
  const { count: afterCount } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`\nEntities AFTER cleanup: ${afterCount}`);
  console.log(`Deleted: ${totalDeleted}`);

  // Now reassign remaining entities to the ORIGINAL rule_set
  // First check current assignments
  const { count: currentAssignments } = await supabase
    .from('rule_set_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .eq('rule_set_id', ORIGINAL_RS_ID);
  console.log(`\nCurrent assignments to original plan: ${currentAssignments}`);

  // Get all remaining entity IDs
  const remainingIds: string[] = [];
  let rOffset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('entities')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .range(rOffset, rOffset + 999);
    if (!page || page.length === 0) break;
    remainingIds.push(...page.map(e => e.id));
    rOffset += 1000;
    if (page.length < 1000) break;
  }

  // Check which remaining entities already have assignments to original plan
  const assignedToOriginal = new Set<string>();
  for (let i = 0; i < remainingIds.length; i += 200) {
    const batch = remainingIds.slice(i, i + 200);
    const { data: existing } = await supabase
      .from('rule_set_assignments')
      .select('entity_id')
      .eq('rule_set_id', ORIGINAL_RS_ID)
      .in('entity_id', batch);
    existing?.forEach(a => assignedToOriginal.add(a.entity_id));
  }
  console.log(`Already assigned to original: ${assignedToOriginal.size}`);

  // Create assignments for entities not yet assigned
  const needAssignment = remainingIds.filter(id => !assignedToOriginal.has(id));
  console.log(`Need new assignments: ${needAssignment.length}`);

  let assignedCount = 0;
  for (let i = 0; i < needAssignment.length; i += 200) {
    const batch = needAssignment.slice(i, i + 200);
    const rows = batch.map(entityId => ({
      tenant_id: TENANT_ID,
      rule_set_id: ORIGINAL_RS_ID,
      entity_id: entityId,
      assignment_type: 'auto',
    }));
    const { error } = await supabase
      .from('rule_set_assignments')
      .insert(rows);
    if (error) {
      console.error(`  Assignment error at batch ${i}: ${error.message}`);
    } else {
      assignedCount += batch.length;
    }
  }
  console.log(`Created ${assignedCount} new assignments`);

  // Final assignment count
  const { count: finalAssignments } = await supabase
    .from('rule_set_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .eq('rule_set_id', ORIGINAL_RS_ID);
  console.log(`\nFinal assignments to original plan: ${finalAssignments}`);
}

cleanEntities().catch(console.error);
