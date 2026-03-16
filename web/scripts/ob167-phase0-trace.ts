/**
 * OB-167 Phase 0: Trace Valentina Salazar through every table
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob167-phase0-trace.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  console.log('=== OB-167 PHASE 0: ENTITY TRACE — VALENTINA SALAZAR ===\n');

  // Step 0A: Find Valentina's entity
  console.log('--- Step 0A: Entity ---');
  const { data: entities, error: eErr } = await supabase
    .from('entities')
    .select('id, external_id, display_name, entity_type, status, metadata')
    .eq('tenant_id', TENANT_ID)
    .ilike('display_name', '%valentina%salazar%');
  console.log('Query: entities WHERE display_name ILIKE valentina salazar');
  console.log('Result:', JSON.stringify(entities, null, 2));
  if (eErr) console.log('Error:', eErr.message);

  if (!entities || entities.length === 0) {
    // Try broader search
    console.log('\nBroader search - all entities with "valentina":');
    const { data: broader } = await supabase
      .from('entities')
      .select('id, external_id, display_name')
      .eq('tenant_id', TENANT_ID)
      .ilike('display_name', '%valentina%');
    console.log('Result:', JSON.stringify(broader, null, 2));
  }

  const valentina = entities?.[0];
  if (!valentina) {
    console.log('ERROR: Cannot find Valentina entity. Aborting trace.');

    // List all entities for this tenant as diagnostic
    console.log('\n--- DIAGNOSTIC: All entities for BCL tenant ---');
    const { data: allEnts, count } = await supabase
      .from('entities')
      .select('id, external_id, display_name', { count: 'exact' })
      .eq('tenant_id', TENANT_ID)
      .limit(10);
    console.log(`Total entities: ${count}`);
    console.log('First 10:', JSON.stringify(allEnts, null, 2));
    return;
  }

  const entityId = valentina.id;
  console.log(`\nValentina entity ID: ${entityId}`);
  console.log(`External ID: ${valentina.external_id}`);

  // Step 0B: Find Valentina's committed_data
  console.log('\n--- Step 0B: committed_data ---');
  const { data: cData, error: cErr } = await supabase
    .from('committed_data')
    .select('id, data_type, source_date, entity_id, row_data, metadata, import_batch_id')
    .eq('tenant_id', TENANT_ID)
    .eq('entity_id', entityId)
    .order('data_type');
  console.log(`Query: committed_data WHERE entity_id = ${entityId}`);
  console.log(`Row count: ${cData?.length ?? 0}`);
  if (cData && cData.length > 0) {
    for (const row of cData) {
      console.log(`  data_type: ${row.data_type}, source_date: ${row.source_date}, batch: ${row.import_batch_id}`);
      console.log(`  row_data keys: ${Object.keys(row.row_data as Record<string, unknown>).join(', ')}`);
      console.log(`  row_data: ${JSON.stringify(row.row_data)}`);
      console.log('');
    }
  }
  if (cErr) console.log('Error:', cErr.message);

  // Step 0C: Find Valentina's calculation_results
  console.log('\n--- Step 0C: calculation_results ---');
  const { data: calcResults, error: crErr } = await supabase
    .from('calculation_results')
    .select('id, total_payout, components, metadata, batch_id, period_id')
    .eq('tenant_id', TENANT_ID)
    .eq('entity_id', entityId);
  console.log(`Query: calculation_results WHERE entity_id = ${entityId}`);
  console.log(`Row count: ${calcResults?.length ?? 0}`);
  if (calcResults && calcResults.length > 0) {
    for (const r of calcResults) {
      console.log(`  total_payout: ${r.total_payout}`);
      console.log(`  components: ${JSON.stringify(r.components)}`);
      console.log(`  metadata: ${JSON.stringify(r.metadata)}`);
      console.log('');
    }
  }
  if (crErr) console.log('Error:', crErr.message);

  // Step 0E: Check rule_set_assignments
  console.log('\n--- Step 0E: rule_set_assignments ---');
  const { data: assignments, error: aErr } = await supabase
    .from('rule_set_assignments')
    .select('id, rule_set_id, entity_id, assignment_type, metadata')
    .eq('tenant_id', TENANT_ID)
    .eq('entity_id', entityId);
  console.log(`Query: rule_set_assignments WHERE entity_id = ${entityId}`);
  console.log('Result:', JSON.stringify(assignments, null, 2));
  if (aErr) console.log('Error:', aErr.message);

  // Step 0F: Check convergence bindings for BCL plan
  console.log('\n--- Step 0F: rule_sets (convergence bindings) ---');
  const { data: ruleSets, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings, metadata, status')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active');
  console.log('Query: rule_sets WHERE tenant_id = BCL AND status = active');
  if (ruleSets && ruleSets.length > 0) {
    for (const rs of ruleSets) {
      console.log(`  Rule set: ${rs.name} (${rs.id}), status: ${rs.status}`);

      const ib = rs.input_bindings as Record<string, unknown> | null;
      const cb = ib?.convergence_bindings as Record<string, unknown> | undefined;
      console.log(`  input_bindings keys: ${ib ? Object.keys(ib).join(', ') : 'NULL'}`);
      console.log(`  convergence_bindings: ${cb ? JSON.stringify(cb, null, 2) : 'NONE'}`);

      const comps = rs.components;
      console.log(`  components type: ${Array.isArray(comps) ? 'array' : typeof comps}`);

      if (Array.isArray(comps)) {
        console.log(`  components count: ${comps.length}`);
        for (const c of comps as Array<Record<string, unknown>>) {
          console.log(`    - ${c.name || c.id}: type=${c.type}, weight=${c.weight}`);
          if (c.tierConfig) console.log(`      tierConfig: ${JSON.stringify(c.tierConfig)}`);
          if (c.matrixConfig) console.log(`      matrixConfig: ${JSON.stringify(c.matrixConfig)}`);
          if (c.percentageConfig) console.log(`      percentageConfig: ${JSON.stringify(c.percentageConfig)}`);
          if (c.conditionalConfig) console.log(`      conditionalConfig: ${JSON.stringify(c.conditionalConfig)}`);
        }
      } else {
        // Nested format with variants
        const cObj = comps as Record<string, unknown>;
        if (cObj?.variants) {
          const variants = cObj.variants as Array<Record<string, unknown>>;
          console.log(`  variants count: ${variants.length}`);
          for (let vi = 0; vi < variants.length; vi++) {
            const v = variants[vi];
            console.log(`  Variant ${vi}: ${v.variantName || v.variantId}`);
            console.log(`    description: ${v.description}`);
            const vComps = v.components as Array<Record<string, unknown>>;
            if (vComps) {
              console.log(`    components count: ${vComps.length}`);
              for (const c of vComps) {
                console.log(`      - ${c.name || c.id}: type=${c.type}, weight=${c.weight}`);
                if (c.tierConfig) console.log(`        tierConfig: ${JSON.stringify(c.tierConfig)}`);
                if (c.matrixConfig) console.log(`        matrixConfig: ${JSON.stringify(c.matrixConfig)}`);
                if (c.percentageConfig) console.log(`        percentageConfig: ${JSON.stringify(c.percentageConfig)}`);
                if (c.conditionalConfig) console.log(`        conditionalConfig: ${JSON.stringify(c.conditionalConfig)}`);
              }
            }
          }
        }
        if (cObj?.components) {
          const innerComps = cObj.components as Array<Record<string, unknown>>;
          console.log(`  wrapped components count: ${innerComps.length}`);
          for (const c of innerComps) {
            console.log(`    - ${c.name || c.id}: type=${c.type}, weight=${c.weight}`);
          }
        }
      }
      console.log('');
    }
  }
  if (rsErr) console.log('Error:', rsErr.message);

  // Step 0G: Check import_batches metadata
  console.log('\n--- Step 0G: import_batches ---');
  const { data: batches, error: bErr } = await supabase
    .from('import_batches')
    .select('id, file_name, metadata, status')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false });
  console.log('Query: import_batches WHERE tenant_id = BCL ORDER BY created_at DESC');
  if (batches && batches.length > 0) {
    for (const b of batches) {
      console.log(`  batch: ${b.id}`);
      console.log(`  file: ${b.file_name}, status: ${b.status}`);
      const meta = b.metadata as Record<string, unknown> | null;
      console.log(`  metadata keys: ${meta ? Object.keys(meta).join(', ') : 'NULL'}`);
      if (meta?.ai_context) {
        console.log(`  ai_context: ${JSON.stringify(meta.ai_context, null, 2)}`);
      } else {
        console.log(`  ai_context: NONE`);
        console.log(`  full metadata: ${JSON.stringify(meta, null, 2)}`);
      }
      console.log('');
    }
  }
  if (bErr) console.log('Error:', bErr.message);

  // Step 0H: Check entity metadata for variant data
  console.log('\n--- Step 0H: Entity metadata/temporal_attributes ---');
  const { data: entMeta } = await supabase
    .from('entities')
    .select('metadata, temporal_attributes')
    .eq('tenant_id', TENANT_ID)
    .ilike('display_name', '%valentina%salazar%');
  console.log('Result:', JSON.stringify(entMeta, null, 2));

  // BONUS: Check data_types used in committed_data for this tenant
  console.log('\n--- BONUS: Distinct data_types for BCL tenant ---');
  const { data: dataTypes } = await supabase
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', TENANT_ID);
  if (dataTypes) {
    const unique = Array.from(new Set(dataTypes.map(d => d.data_type)));
    console.log(`Distinct data_types (${unique.length}): ${unique.join(', ')}`);
  }

  // BONUS: Check periods for BCL
  console.log('\n--- BONUS: Periods for BCL ---');
  const { data: periods } = await supabase
    .from('periods')
    .select('id, label, canonical_key, start_date, end_date, status')
    .eq('tenant_id', TENANT_ID)
    .order('start_date');
  console.log('Periods:', JSON.stringify(periods, null, 2));

  // BONUS: Check total committed_data rows per data_type
  console.log('\n--- BONUS: committed_data count by entity_id NULL vs non-NULL ---');
  const { data: allCD } = await supabase
    .from('committed_data')
    .select('entity_id, data_type')
    .eq('tenant_id', TENANT_ID);
  if (allCD) {
    const withEntity = allCD.filter(r => r.entity_id !== null);
    const withoutEntity = allCD.filter(r => r.entity_id === null);
    console.log(`Total rows: ${allCD.length}`);
    console.log(`With entity_id: ${withEntity.length}`);
    console.log(`Without entity_id (store-level): ${withoutEntity.length}`);

    // Count by data_type
    const byType = new Map<string, number>();
    for (const r of allCD) {
      byType.set(r.data_type, (byType.get(r.data_type) || 0) + 1);
    }
    console.log('By data_type:');
    for (const [type, count] of Array.from(byType.entries()).sort()) {
      console.log(`  ${type}: ${count}`);
    }
  }

  console.log('\n=== END PHASE 0 TRACE ===');
}

main().catch(console.error);
