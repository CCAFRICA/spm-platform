/**
 * OB-169 Phase 2: Trigger BCL recalculation via API and verify $44,590
 */

const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('=== OB-169 PHASE 2: RECALCULATE BCL ===\n');

  // 1. Get the period and rule set
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: periods } = await supabase
    .from('periods')
    .select('id, label')
    .eq('tenant_id', TENANT_ID)
    .eq('start_date', '2025-10-01')
    .limit(1);

  if (!periods?.length) {
    console.error('No October 2025 period found!');
    return;
  }
  const periodId = periods[0].id;
  console.log(`Period: ${periods[0].label} (${periodId})`);

  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active')
    .limit(1);

  if (!ruleSets?.length) {
    console.error('No active rule set found!');
    return;
  }
  const ruleSetId = ruleSets[0].id;
  console.log(`Rule set: ${ruleSets[0].name} (${ruleSetId})`);

  // 2. Call the calculation API
  console.log('\nTriggering calculation...');
  const response = await fetch(`${BASE_URL}/api/calculation/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      periodId,
      ruleSetId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Calculation failed: ${response.status} ${text}`);
    return;
  }

  const result = await response.json();
  console.log(`Calculation complete!`);
  console.log(`Batch ID: ${result.batchId}`);
  console.log(`Entity count: ${result.entityCount}`);
  console.log(`Total payout: $${result.totalPayout}`);
  console.log(`Expected: $44,590`);
  console.log(`Match: ${result.totalPayout === 44590 ? '✓ EXACT' : `✗ Delta: $${result.totalPayout - 44590}`}`);

  // 3. Verify anchor entities
  console.log('\n--- Anchor Entity Verification ---');
  const { data: batchResults } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components')
    .eq('batch_id', result.batchId);

  const entityIds = batchResults?.map(r => r.entity_id) || [];
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .in('id', entityIds);

  const entityMap = new Map(entities?.map(e => [e.id, e]) || []);

  const anchors = [
    { id: 'BCL-5012', name: 'Valentina Salazar', expected: 198 },
    { id: 'BCL-5003', name: 'Gabriela Vascones', expected: 1400 },
    { id: 'BCL-5002', name: 'Fernando Hidalgo', expected: 230 },
  ];

  for (const anchor of anchors) {
    const cr = batchResults?.find(r => entityMap.get(r.entity_id)?.external_id === anchor.id);
    if (cr) {
      const total = Number(cr.total_payout);
      const delta = total - anchor.expected;
      console.log(`${anchor.id} (${anchor.name}): $${total} (expected: $${anchor.expected}) ${delta === 0 ? '✓' : `✗ Delta: $${delta}`}`);
    } else {
      console.log(`${anchor.id}: NOT FOUND`);
    }
  }

  // 4. Check BCL-5052 specifically
  console.log('\n--- BCL-5052 Trace (the boundary entity) ---');
  const cr5052 = batchResults?.find(r => entityMap.get(r.entity_id)?.external_id === 'BCL-5052');
  if (cr5052) {
    const components = cr5052.components as Array<Record<string, unknown>>;
    console.log(`Total: $${Number(cr5052.total_payout)}`);
    if (Array.isArray(components)) {
      for (const c of components) {
        const details = c.details as Record<string, unknown>;
        console.log(`  ${c.componentName}: $${c.payout}`);
        if (details?.rowBand) {
          console.log(`    Row: ${details.rowBand} (${details.rowValue}), Col: ${details.colBand} (${details.colValue})`);
        }
      }
    }
  }

  // 5. Full total
  let total = 0;
  for (const r of batchResults || []) {
    total += Number(r.total_payout);
  }
  console.log(`\nFull verification total (sum of all entities): $${total}`);
  console.log(`Expected: $44,590`);
  console.log(`Match: ${total === 44590 ? '✓ EXACT' : `✗ Delta: $${total - 44590}`}`);

  console.log('\n=== END PHASE 2 ===');
}

main().catch(console.error);
