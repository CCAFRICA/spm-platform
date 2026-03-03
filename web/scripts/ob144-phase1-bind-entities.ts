/**
 * OB-144 Phase 1: Bind entity_id on performance data rows
 *
 * Phase 0 found 21,418 unique employees in performance data that
 * DON'T match any existing entities. This script:
 *
 * 1. Collects all unique num_empleado from unbound data
 * 2. Creates entities for employees not in the entities table
 * 3. Creates rule_set_assignments for new entities
 * 4. Binds entity_id on committed_data via num_empleado → external_id
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob144-phase1-bind-entities.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const BATCH_SIZE = 200; // Supabase batch limit

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-144 PHASE 1: BIND ENTITY_ID ON PERFORMANCE DATA ROWS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  // Get active rule set
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (!ruleSet) {
    console.error('ERROR: No active rule set found');
    process.exit(1);
  }
  console.log(`Rule set: ${ruleSet.name} (${ruleSet.id})\n`);

  // ── Step 1: Collect ALL unique num_empleado from unbound rows ──
  console.log('Step 1: Collecting unique num_empleado from unbound rows...');
  const allNumEmpleados = new Set<string>();
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', tenantId)
      .is('entity_id', null)
      .not('row_data->num_empleado', 'is', null)
      .range(page * 1000, page * 1000 + 999);

    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = r.row_data as Record<string, unknown>;
      allNumEmpleados.add(String(rd['num_empleado']));
    }
    if (data.length < 1000) break;
    page++;
    if (page % 10 === 0) console.log(`  ... fetched ${page * 1000} rows so far, ${allNumEmpleados.size} unique employees`);
  }
  console.log(`  Found ${allNumEmpleados.size} unique num_empleado in unbound data\n`);

  // ── Step 2: Check which already exist as entities ──
  console.log('Step 2: Checking existing entities...');
  const existingExtIds = new Set<string>();
  let entPage = 0;
  while (true) {
    const { data } = await supabase
      .from('entities')
      .select('external_id')
      .eq('tenant_id', tenantId)
      .range(entPage * BATCH_SIZE, entPage * BATCH_SIZE + BATCH_SIZE - 1);

    if (!data || data.length === 0) break;
    for (const e of data) existingExtIds.add(e.external_id ?? '');
    if (data.length < BATCH_SIZE) break;
    entPage++;
  }
  console.log(`  ${existingExtIds.size} existing entities\n`);

  // Filter to new employees only
  const newEmployees: string[] = [];
  for (const emp of allNumEmpleados) {
    if (!existingExtIds.has(emp)) {
      newEmployees.push(emp);
    }
  }
  console.log(`  ${newEmployees.length} new employees to create\n`);

  // ── Step 3: Create entities in batches ──
  console.log('Step 3: Creating entities...');
  let created = 0;
  for (let i = 0; i < newEmployees.length; i += BATCH_SIZE) {
    const batch = newEmployees.slice(i, i + BATCH_SIZE);
    const entities = batch.map(emp => ({
      tenant_id: tenantId,
      external_id: emp,
      display_name: emp, // Use employee number as display name
      entity_type: 'individual',
      status: 'active',
    }));

    const { error } = await supabase
      .from('entities')
      .insert(entities);

    if (error) {
      console.error(`  ERROR creating entities batch ${i}-${i + batch.length}:`, error.message);
      // Try one by one for debugging
      for (const entity of entities) {
        const { error: singleErr } = await supabase
          .from('entities')
          .insert(entity);
        if (!singleErr) created++;
      }
    } else {
      created += batch.length;
    }

    if ((i / BATCH_SIZE) % 10 === 0 && i > 0) {
      console.log(`  ... created ${created} entities`);
    }
  }
  console.log(`  Created ${created} new entities\n`);

  // ── Step 4: Create rule_set_assignments for new entities ──
  console.log('Step 4: Creating rule_set_assignments...');
  // Get all entities and their IDs
  const entityIdMap = new Map<string, string>(); // external_id → entity_id
  let eidPage = 0;
  while (true) {
    const { data } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .range(eidPage * BATCH_SIZE, eidPage * BATCH_SIZE + BATCH_SIZE - 1);

    if (!data || data.length === 0) break;
    for (const e of data) entityIdMap.set(e.external_id ?? '', e.id);
    if (data.length < BATCH_SIZE) break;
    eidPage++;
  }
  console.log(`  ${entityIdMap.size} total entities loaded`);

  // Get existing assignments
  const existingAssignments = new Set<string>();
  let assPage = 0;
  while (true) {
    const { data } = await supabase
      .from('rule_set_assignments')
      .select('entity_id')
      .eq('tenant_id', tenantId)
      .eq('rule_set_id', ruleSet.id)
      .range(assPage * BATCH_SIZE, assPage * BATCH_SIZE + BATCH_SIZE - 1);

    if (!data || data.length === 0) break;
    for (const a of data) existingAssignments.add(a.entity_id);
    if (data.length < BATCH_SIZE) break;
    assPage++;
  }
  console.log(`  ${existingAssignments.size} existing assignments`);

  // Create missing assignments
  const missingAssignments: string[] = [];
  for (const [, entityId] of entityIdMap) {
    if (!existingAssignments.has(entityId)) {
      missingAssignments.push(entityId);
    }
  }
  console.log(`  ${missingAssignments.length} missing assignments to create`);

  let assignCreated = 0;
  for (let i = 0; i < missingAssignments.length; i += BATCH_SIZE) {
    const batch = missingAssignments.slice(i, i + BATCH_SIZE);
    const assignments = batch.map(entityId => ({
      tenant_id: tenantId,
      rule_set_id: ruleSet.id,
      entity_id: entityId,
    }));

    const { error } = await supabase
      .from('rule_set_assignments')
      .insert(assignments);

    if (error) {
      console.error(`  ERROR creating assignments batch:`, error.message);
    } else {
      assignCreated += batch.length;
    }
  }
  console.log(`  Created ${assignCreated} new assignments\n`);

  // ── Step 5: Bind entity_id on committed_data ──
  console.log('Step 5: Binding entity_id on committed_data rows...');
  // We need to match num_empleado (number in JSON) to external_id (string in entities)
  // The row_data->>\'num_empleado\' operator returns text, so comparison works

  // Process in batches by employee
  let totalBound = 0;
  const employeeList = Array.from(allNumEmpleados);

  for (let i = 0; i < employeeList.length; i += BATCH_SIZE) {
    const batch = employeeList.slice(i, i + BATCH_SIZE);

    for (const emp of batch) {
      const entityId = entityIdMap.get(emp);
      if (!entityId) continue;

      // The JSON value might be a number, not a string.
      // row_data->>key returns text, but we also need to handle the case where
      // Supabase filters on the JSON value directly.
      // Use textSearch or filter with eq on the extracted text value.

      const { data: rows, error } = await supabase
        .from('committed_data')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('entity_id', null)
        .eq('row_data->>num_empleado', emp)
        .limit(1000);

      if (error) {
        // Try numeric form
        const { data: rows2 } = await supabase
          .from('committed_data')
          .select('id')
          .eq('tenant_id', tenantId)
          .is('entity_id', null)
          .eq('row_data->>num_empleado', Number(emp))
          .limit(1000);

        if (rows2 && rows2.length > 0) {
          const ids = rows2.map(r => r.id);
          for (let j = 0; j < ids.length; j += BATCH_SIZE) {
            const idBatch = ids.slice(j, j + BATCH_SIZE);
            await supabase
              .from('committed_data')
              .update({ entity_id: entityId })
              .in('id', idBatch);
            totalBound += idBatch.length;
          }
        }
        continue;
      }

      if (rows && rows.length > 0) {
        const ids = rows.map(r => r.id);
        for (let j = 0; j < ids.length; j += BATCH_SIZE) {
          const idBatch = ids.slice(j, j + BATCH_SIZE);
          const { error: updateErr } = await supabase
            .from('committed_data')
            .update({ entity_id: entityId })
            .in('id', idBatch);
          if (updateErr) {
            console.error(`  ERROR binding entity ${entityId}:`, updateErr.message);
          } else {
            totalBound += idBatch.length;
          }
        }
      }
    }

    if (i > 0 && (i / BATCH_SIZE) % 5 === 0) {
      console.log(`  ... processed ${i} employees, bound ${totalBound} rows so far`);
    }
  }
  console.log(`  Bound ${totalBound} rows total\n`);

  // ── Step 6: Verify binding results ──
  console.log('Step 6: Verification...\n');

  const { count: newFullyBound } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('entity_id', 'is', null)
    .not('period_id', 'is', null);

  const { count: newEntityOnly } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('entity_id', 'is', null)
    .is('period_id', null);

  const { count: newPeriodOnly } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .not('period_id', 'is', null);

  const { count: newOrphaned } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .is('period_id', null);

  const { count: totalEntities } = await supabase
    .from('entities')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const { count: totalAssignments } = await supabase
    .from('rule_set_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  console.log('  BINDING STATUS (AFTER):');
  console.log(`    fully_bound:    ${newFullyBound?.toLocaleString()}   (was 4,340)`);
  console.log(`    entity_only:    ${newEntityOnly?.toLocaleString()}   (was 0)`);
  console.log(`    period_only:    ${newPeriodOnly?.toLocaleString()}   (was 72,743)`);
  console.log(`    fully_orphaned: ${newOrphaned?.toLocaleString()}   (was 42,064)`);
  console.log('');
  console.log('  ENGINE CONTRACT:');
  console.log(`    entities:       ${totalEntities?.toLocaleString()}   (was 741)`);
  console.log(`    assignments:    ${totalAssignments?.toLocaleString()}   (was 741)`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 1 COMPLETE');
  console.log('PG-01: Entity binding executed, before/after counts documented');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
