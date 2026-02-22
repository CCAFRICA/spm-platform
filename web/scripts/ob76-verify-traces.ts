/**
 * OB-76 Mission 5: Verify execution traces are stored in Supabase
 *
 * Checks:
 * 1. Traces exist in calculation_results.metadata.intentTraces
 * 2. Each trace has the required fields
 * 3. Traces match the component count
 * 4. Batch summary has intentLayer concordance
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}`);
    failed++;
  }
}

async function main() {
  const tenantId = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

  // 1. Get the latest batch
  console.log('=== Test 1: Latest Batch ===');
  const { data: batch } = await supabase
    .from('calculation_batches')
    .select('id, summary')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  assert(!!batch, 'Latest batch found');
  if (!batch) { process.exit(1); }

  const summary = batch.summary as Record<string, unknown>;
  console.log(`  Batch: ${batch.id}`);

  // 2. Check batch summary has intentLayer
  console.log('\n=== Test 2: Batch Summary ===');
  const intentLayer = summary?.intentLayer as Record<string, unknown> | undefined;
  assert(!!intentLayer, 'Batch summary has intentLayer');
  if (intentLayer) {
    assert(intentLayer.concordance === '100.0%', `Concordance: ${intentLayer.concordance}`);
    assert(intentLayer.matchCount === 719, `Match count: ${intentLayer.matchCount}`);
    assert(intentLayer.mismatchCount === 0, `Mismatch count: ${intentLayer.mismatchCount}`);
    assert(intentLayer.intentsTransformed === 6, `Intents transformed: ${intentLayer.intentsTransformed}`);
  }

  // 3. Check individual calculation_results have traces
  console.log('\n=== Test 3: Individual Traces ===');
  const { data: results } = await supabase
    .from('calculation_results')
    .select('entity_id, metadata')
    .eq('batch_id', batch.id)
    .limit(5);

  assert((results?.length ?? 0) > 0, `Found ${results?.length} results`);

  for (const r of (results ?? [])) {
    const meta = r.metadata as Record<string, unknown> | null;
    const traces = meta?.intentTraces as unknown[] | undefined;
    assert(!!traces && traces.length > 0, `Entity ${r.entity_id.slice(0, 8)}: has ${traces?.length ?? 0} traces`);

    if (traces && traces.length > 0) {
      const t = traces[0] as Record<string, unknown>;
      assert(t.entityId !== undefined, `  trace[0] has entityId`);
      assert(t.componentIndex !== undefined, `  trace[0] has componentIndex`);
      assert(t.finalOutcome !== undefined, `  trace[0] has finalOutcome`);
      assert(t.inputs !== undefined, `  trace[0] has inputs`);
      assert(t.confidence !== undefined, `  trace[0] has confidence`);
    }
  }

  // 4. Verify trace count matches component count
  console.log('\n=== Test 4: Trace-Component Count Match ===');
  if (results && results.length > 0) {
    const meta = results[0].metadata as Record<string, unknown>;
    const traces = meta?.intentTraces as unknown[];
    assert(traces.length === 6, `Traces count (${traces.length}) === components (6)`);
  }

  // 5. Verify intentMatch field
  console.log('\n=== Test 5: Intent Match Field ===');
  if (results && results.length > 0) {
    const meta = results[0].metadata as Record<string, unknown>;
    assert(meta?.intentMatch === true, 'intentMatch === true');
    assert(typeof meta?.intentTotal === 'number', 'intentTotal is a number');
  }

  // 6. Spot check a trace's structure
  console.log('\n=== Test 6: Trace Structure Deep Check ===');
  if (results && results.length > 0) {
    const meta = results[0].metadata as Record<string, unknown>;
    const traces = meta?.intentTraces as Array<Record<string, unknown>>;

    // Find a lookup trace (should have lookupResolution)
    const lookupTrace = traces.find(t =>
      (t.lookupResolution as Record<string, unknown> | undefined)?.outputValue !== undefined
    );
    assert(!!lookupTrace, 'Found trace with lookupResolution');
    if (lookupTrace) {
      const lr = lookupTrace.lookupResolution as Record<string, unknown>;
      assert(lr.outputValue !== undefined, `  lookupResolution.outputValue = ${lr.outputValue}`);
    }

    // Check modifiers array exists (even if empty)
    assert(Array.isArray(traces[0].modifiers), 'trace[0].modifiers is array');
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
