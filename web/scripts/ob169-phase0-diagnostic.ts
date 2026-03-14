/**
 * OB-169 Phase 0: Diagnostic — Trace the $60 delta
 *
 * 0A: Get all calculation results for BCL October 2025
 * 0B: Identify entity with C1 delta of $60
 * 0C: Examine rule_set boundary representation
 * 0D: Document root cause
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  console.log('=== OB-169 PHASE 0: DIAGNOSTIC — TRACE THE $60 DELTA ===\n');

  // 0A: Get October 2025 period
  console.log('--- 0A: Finding October 2025 period ---');
  const { data: periods } = await supabase
    .from('periods')
    .select('id, label, start_date, end_date')
    .eq('tenant_id', TENANT_ID)
    .eq('start_date', '2025-10-01')
    .limit(1);

  if (!periods?.length) {
    console.error('No October 2025 period found!');
    return;
  }
  const period = periods[0];
  console.log(`Period: ${period.label} (${period.id})\n`);

  // Get latest batch
  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('id, entity_count, summary, created_at')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', period.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!batches?.length) {
    console.error('No calculation batch found!');
    return;
  }
  const batch = batches[0];
  console.log(`Batch: ${batch.id}`);
  console.log(`Entity count: ${batch.entity_count}`);
  console.log(`Summary: ${JSON.stringify(batch.summary, null, 2)}\n`);

  // Get all calculation results
  console.log('--- 0A: All calculation results ---');
  const { data: results } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components, attainment, metrics')
    .eq('batch_id', batch.id);

  if (!results?.length) {
    console.error('No calculation results found!');
    return;
  }

  // Get entity details
  const entityIds = results.map(r => r.entity_id);
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name, metadata')
    .in('id', entityIds);

  const entityMap = new Map(entities?.map(e => [e.id, e]) || []);

  // Calculate total
  let platformTotal = 0;
  const entityResults: Array<{
    external_id: string;
    display_name: string;
    total_payout: number;
    components: Record<string, unknown>;
    attainment: Record<string, unknown>;
  }> = [];

  for (const r of results) {
    const entity = entityMap.get(r.entity_id);
    platformTotal += Number(r.total_payout);
    entityResults.push({
      external_id: entity?.external_id || 'UNKNOWN',
      display_name: entity?.display_name || 'UNKNOWN',
      total_payout: Number(r.total_payout),
      components: r.components as Record<string, unknown>,
      attainment: r.attainment as Record<string, unknown>,
    });
  }

  entityResults.sort((a, b) => a.external_id.localeCompare(b.external_id));

  console.log(`\nTotal entities: ${entityResults.length}`);
  console.log(`Platform total: $${platformTotal.toFixed(2)}`);
  console.log(`GT total: $44,590.00`);
  console.log(`Delta: $${(platformTotal - 44590).toFixed(2)}\n`);

  // 0B: Show all results, highlight entities matching anchor values
  console.log('--- 0B: Per-entity results (sorted by external_id) ---');
  for (const er of entityResults) {
    const components = er.components as Record<string, unknown>;
    // Extract component payouts
    const compPayouts: string[] = [];
    if (typeof components === 'object' && components !== null) {
      for (const [key, val] of Object.entries(components)) {
        const v = val as Record<string, unknown>;
        compPayouts.push(`${key}=$${Number(v?.payout ?? v ?? 0).toFixed(0)}`);
      }
    }
    console.log(`${er.external_id} | ${er.display_name} | $${er.total_payout.toFixed(0)} | ${compPayouts.join(', ')}`);
  }

  // 0B: Check anchor entities
  console.log('\n--- 0B: Anchor Entity Verification ---');
  const anchors = [
    { id: 'BCL-5012', name: 'Valentina Salazar', expected: 198 },
    { id: 'BCL-5003', name: 'Gabriela Vascones', expected: 1400 },
    { id: 'BCL-5002', name: 'Fernando Hidalgo', expected: 230 },
  ];

  for (const anchor of anchors) {
    const er = entityResults.find(e => e.external_id === anchor.id);
    if (er) {
      const delta = er.total_payout - anchor.expected;
      console.log(`${anchor.id} (${anchor.name}): Platform=$${er.total_payout.toFixed(0)}, GT=$${anchor.expected}, Delta=$${delta.toFixed(0)} ${delta === 0 ? '✓' : '✗'}`);
      console.log(`  Components: ${JSON.stringify(er.components, null, 2)}`);
      console.log(`  Attainment: ${JSON.stringify(er.attainment, null, 2)}`);
    } else {
      console.log(`${anchor.id}: NOT FOUND`);
    }
  }

  // 0B: Find entities with exactly $60 delta in any component
  console.log('\n--- 0B: Searching for $60 delta entities ---');
  // Since we don't have GT per-entity, look for entities where component values
  // seem anomalous or where a C1 boundary issue could cause $60
  // The OB says the delta is in C1, a 2D matrix. Let's look at C1 values near boundaries.

  // Look at C1 component for all entities
  console.log('\n--- C1 Component Detail (all entities) ---');
  for (const er of entityResults) {
    const components = er.components as Record<string, unknown>;
    // Find C1 component - it could be named differently
    for (const [key, val] of Object.entries(components || {})) {
      const v = val as Record<string, unknown>;
      const compType = v?.componentType || v?.type;
      const payout = Number(v?.payout ?? v ?? 0);
      if (key.includes('C1') || key.includes('c1') || compType === 'matrix_lookup') {
        console.log(`${er.external_id}: C1=${payout}, details=${JSON.stringify(v)}`);
      }
    }
  }

  // 0C: Examine rule_set boundaries
  console.log('\n--- 0C: Rule Set Boundary Representation ---');
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name, status, components')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!ruleSets?.length) {
    console.error('No active rule set found!');
    return;
  }

  const ruleSet = ruleSets[0];
  console.log(`Rule set: ${ruleSet.name} (${ruleSet.id})`);

  const rsComponents = ruleSet.components as unknown as Array<Record<string, unknown>>;
  if (Array.isArray(rsComponents)) {
    for (const comp of rsComponents) {
      console.log(`\nComponent: ${comp.name} (${comp.componentType})`);

      // Check for matrix_lookup with bands
      if (comp.componentType === 'matrix_lookup' && comp.matrixConfig) {
        const mc = comp.matrixConfig as Record<string, unknown>;
        console.log(`  Row metric: ${mc.rowMetric}`);
        console.log(`  Column metric: ${mc.columnMetric}`);
        console.log(`  Row bands: ${JSON.stringify(mc.rowBands, null, 2)}`);
        console.log(`  Column bands: ${JSON.stringify(mc.columnBands, null, 2)}`);
        console.log(`  Values grid: ${JSON.stringify(mc.values, null, 2)}`);
      }

      // Check calculationIntent for boundaries
      if (comp.calculationIntent) {
        const intent = comp.calculationIntent as Record<string, unknown>;
        console.log(`  calculationIntent operation: ${intent.operation}`);
        if (intent.operation === 'bounded_lookup_2d') {
          console.log(`  Row boundaries: ${JSON.stringify(intent.rowBoundaries, null, 2)}`);
          console.log(`  Column boundaries: ${JSON.stringify(intent.columnBoundaries, null, 2)}`);
          console.log(`  Output grid: ${JSON.stringify(intent.outputGrid, null, 2)}`);
        }
        // Check for variant routing
        if (comp.calculationIntent && typeof comp.calculationIntent === 'object') {
          // Variants might be at the ComponentIntent level
          const ci = comp as Record<string, unknown>;
          if (ci.variants) {
            console.log(`  Variants: ${JSON.stringify(ci.variants, null, 2)}`);
          }
        }
      }

      // Show tier config
      if (comp.componentType === 'tier_lookup' && comp.tierConfig) {
        const tc = comp.tierConfig as Record<string, unknown>;
        console.log(`  Metric: ${tc.metric}`);
        console.log(`  Tiers: ${JSON.stringify(tc.tiers, null, 2)}`);
      }
    }
  }

  // 0C: Also check full component JSON for .999 values
  console.log('\n--- 0C: Searching for .999 boundary values ---');
  const componentsStr = JSON.stringify(ruleSet.components);
  const matches999 = componentsStr.match(/\d+\.999/g);
  if (matches999) {
    console.log(`Found .999 values: ${[...new Set(matches999)].join(', ')}`);
  } else {
    console.log('No .999 values found in rule_set components');
  }

  console.log('\n=== END DIAGNOSTIC ===');
}

main().catch(console.error);
