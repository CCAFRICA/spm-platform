#!/usr/bin/env npx tsx
/**
 * OB-85-cont: Populate entities table with display names and external IDs
 *
 * The entities table for Pipeline Test Co is empty.
 * committed_data.row_data has entityId/num_empleado fields that map to employee numbers.
 * This script creates entity records from the roster (Datos Colaborador) sheet.
 */

import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixEntities() {
  console.log('=== OB-85-cont: Fix Entity Display Names ===\n');

  // 1. Get all entity UUIDs from rule_set_assignments
  const { data: assignments } = await supabase
    .from('rule_set_assignments')
    .select('entity_id')
    .eq('tenant_id', TENANT_ID);

  const assignedIds = new Set((assignments ?? []).map(a => a.entity_id));
  console.log(`Assigned entities: ${assignedIds.size}`);

  // 2. Check which entities already exist in entities table
  const existingEntities = new Map<string, { display_name: string; external_id: string | null }>();
  const entityIdArray = Array.from(assignedIds);

  for (let i = 0; i < entityIdArray.length; i += 1000) {
    const batch = entityIdArray.slice(i, i + 1000);
    const { data } = await supabase
      .from('entities')
      .select('id, display_name, external_id')
      .in('id', batch);
    for (const e of data ?? []) {
      existingEntities.set(e.id, { display_name: e.display_name, external_id: e.external_id });
    }
  }
  console.log(`Existing entity records: ${existingEntities.size}`);

  // 3. Get entity → employee number mapping from roster (Datos Colaborador)
  const entityToEmployee = new Map<string, { empNum: string; role: string; storeId: number | null }>();

  // Find roster data across all periods
  let page = 0;
  while (page < 50) {
    const { data: rows } = await supabase
      .from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('data_type', 'Datos Colaborador')
      .not('entity_id', 'is', null)
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (!rows || rows.length === 0) break;

    for (const r of rows) {
      if (!r.entity_id || entityToEmployee.has(r.entity_id)) continue;
      const rd = r.row_data as Record<string, unknown>;
      const empNum = String(rd.entityId ?? rd.num_empleado ?? rd.ID_Empleado ?? '');
      const role = String(rd.role ?? rd.Puesto ?? '');
      const storeId = (rd.storeId ?? rd.No_Tienda ?? null) as number | null;
      if (empNum && empNum !== 'undefined') {
        entityToEmployee.set(r.entity_id, { empNum, role, storeId });
      }
    }

    if (rows.length < 1000) break;
    page++;
  }
  console.log(`Roster mappings found: ${entityToEmployee.size}`);

  // 4. Update entities that exist but have UUID-like display_name or missing external_id
  let updatedCount = 0;
  let createdCount = 0;

  for (const [entityId, info] of Array.from(entityToEmployee.entries())) {
    const existing = existingEntities.get(entityId);

    if (existing) {
      // Update if display_name is UUID-like or external_id is null
      const isUuidName = existing.display_name.includes('-') && existing.display_name.length > 30;
      const needsUpdate = isUuidName || !existing.external_id;

      if (needsUpdate) {
        const newDisplayName = info.role ? `${info.empNum} (${info.role})` : info.empNum;
        const { error } = await supabase
          .from('entities')
          .update({
            display_name: isUuidName ? newDisplayName : existing.display_name,
            external_id: existing.external_id || info.empNum,
          })
          .eq('id', entityId);

        if (!error) updatedCount++;
        else console.log(`  Update error for ${entityId}: ${error.message}`);
      }
    } else {
      // Create entity record
      const displayName = info.role ? `${info.empNum} (${info.role})` : info.empNum;
      const { error } = await supabase
        .from('entities')
        .insert({
          id: entityId,
          tenant_id: TENANT_ID,
          display_name: displayName,
          external_id: info.empNum,
          entity_type: 'individual',
        });

      if (!error) createdCount++;
      else if (error.code === '23505') {
        // Duplicate — entity exists with different tenant_id, skip
      } else {
        console.log(`  Insert error for ${entityId}: ${error.message}`);
      }
    }
  }

  console.log(`\nResults: ${createdCount} created, ${updatedCount} updated`);

  // 5. Verify
  const { count } = await supabase
    .from('entities')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`Total entities for tenant: ${count}`);

  // Sample
  const { data: sample } = await supabase
    .from('entities')
    .select('id, display_name, external_id')
    .eq('tenant_id', TENANT_ID)
    .limit(5);
  console.log('\nSample entities:');
  for (const e of sample ?? []) {
    console.log(`  ${e.id.slice(0, 8)}... | "${e.display_name}" | ext="${e.external_id}"`);
  }

  console.log('\n=== ENTITY FIX COMPLETE ===');
}

fixEntities().catch(console.error);
