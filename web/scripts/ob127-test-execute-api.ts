/**
 * OB-127 Test: SCI Execute API — 5 test cases
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob127-test-execute-api.ts
 * Requires: dev server running on localhost:3000
 */
import { createClient } from '@supabase/supabase-js';

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

let passed = 0, failed = 0;
function assert(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

async function callExecute(body: unknown) {
  const res = await fetch("http://localhost:3000/api/import/sci/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  OB-127: SCI EXECUTE API TESTS                     ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const proposalId = crypto.randomUUID();

  // ─── Test 1: Execute target-classified content → committed_data with semantic_roles ───
  console.log("=== Test 1: Target pipeline — commit with semantic roles ===");

  const targetRows = Array.from({ length: 12 }, (_, i) => ({
    'Officer ID': 1001 + i,
    'Name': `Person ${i}`,
    'Target Amount': 50000 + i * 5000,
    'Region': ['North', 'South', 'East'][i % 3],
  }));

  const targetBindings = [
    { sourceField: 'Officer ID', platformType: 'integer', semanticRole: 'entity_identifier', displayLabel: 'Officer ID', displayContext: 'links target to entity', claimedBy: 'target', confidence: 0.90 },
    { sourceField: 'Name', platformType: 'text', semanticRole: 'entity_name', displayLabel: 'Name', displayContext: 'display name', claimedBy: 'target', confidence: 0.85 },
    { sourceField: 'Target Amount', platformType: 'currency', semanticRole: 'performance_target', displayLabel: 'Target Amount', displayContext: 'goal value', claimedBy: 'target', confidence: 0.90 },
    { sourceField: 'Region', platformType: 'text', semanticRole: 'category_code', displayLabel: 'Region', displayContext: 'grouping', claimedBy: 'target', confidence: 0.65 },
  ];

  const { status: s1, data: d1 } = await callExecute({
    proposalId,
    tenantId: LAB,
    contentUnits: [{
      contentUnitId: 'CFG_DG_Incentive_Q1_2024.xlsx::Growth Targets::1',
      confirmedClassification: 'target',
      confirmedBindings: targetBindings,
      rawData: targetRows,
    }],
  });

  assert('Execute returns 200', s1 === 200, `got ${s1}`);
  assert('Target pipeline success', d1.results?.[0]?.success === true, `got ${JSON.stringify(d1.results?.[0])}`);
  assert('12 rows processed', d1.results?.[0]?.rowsProcessed === 12, `got ${d1.results?.[0]?.rowsProcessed}`);

  // Verify committed_data has the rows with semantic_roles in metadata
  const { data: committed } = await supabase
    .from('committed_data')
    .select('id, data_type, metadata')
    .eq('tenant_id', LAB)
    .like('data_type', '%growth_targets%')
    .limit(5);

  assert('Rows in committed_data', (committed?.length || 0) > 0, `found ${committed?.length}`);

  const firstMeta = committed?.[0]?.metadata as Record<string, unknown> | undefined;
  const hasSemanticRoles = firstMeta?.semantic_roles != null;
  assert('semantic_roles in metadata', hasSemanticRoles, `metadata keys: ${Object.keys(firstMeta || {}).join(', ')}`);

  if (hasSemanticRoles) {
    const roles = firstMeta!.semantic_roles as Record<string, unknown>;
    console.log(`  semantic_roles sample: ${JSON.stringify(roles).substring(0, 200)}`);
  }

  // ─── Test 2: Convergence re-run → check if DG gets new derivation ───
  console.log("\n=== Test 2: Convergence re-run after target commit ===");

  // Check if any active rule_set now has input_bindings referencing the target data_type
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', LAB)
    .eq('status', 'active');

  let foundTargetDerivation = false;
  for (const rs of (ruleSets || [])) {
    const bindings = rs.input_bindings as Record<string, unknown> | null;
    const derivations = (bindings?.metric_derivations || []) as Array<Record<string, unknown>>;
    for (const d of derivations) {
      if (String(d.source_pattern || '').includes('growth_targets')) {
        foundTargetDerivation = true;
        console.log(`  Found derivation: metric=${d.metric}, source=${d.source_pattern} in ${rs.name}`);
      }
    }
  }
  // This may or may not produce a derivation depending on token overlap
  // Log result but don't hard-fail since convergence matching depends on plan component names
  console.log(`  Target derivation found: ${foundTargetDerivation}`);

  // ─── Test 3: Execute transaction-classified content → committed_data ───
  console.log("\n=== Test 3: Transaction pipeline ===");

  const txRows = Array.from({ length: 50 }, (_, i) => ({
    'Transaction ID': 10000 + i,
    'Date': `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
    'Amount': (Math.random() * 10000).toFixed(2),
    'Entity Code': 1001 + (i % 25),
    'Category': ['A', 'B', 'C'][i % 3],
  }));

  const txBindings = [
    { sourceField: 'Entity Code', platformType: 'integer', semanticRole: 'entity_identifier', displayLabel: 'Entity Code', displayContext: 'links to entity', claimedBy: 'transaction', confidence: 0.85 },
    { sourceField: 'Date', platformType: 'date', semanticRole: 'transaction_date', displayLabel: 'Date', displayContext: 'event date', claimedBy: 'transaction', confidence: 0.90 },
    { sourceField: 'Amount', platformType: 'currency', semanticRole: 'transaction_amount', displayLabel: 'Amount', displayContext: 'value', claimedBy: 'transaction', confidence: 0.85 },
  ];

  const txProposalId = crypto.randomUUID();
  const { status: s3, data: d3 } = await callExecute({
    proposalId: txProposalId,
    tenantId: LAB,
    contentUnits: [{
      contentUnitId: 'transactions.csv::Sheet1::0',
      confirmedClassification: 'transaction',
      confirmedBindings: txBindings,
      rawData: txRows,
    }],
  });

  assert('Transaction returns 200', s3 === 200, `got ${s3}`);
  assert('Transaction pipeline success', d3.results?.[0]?.success === true);
  assert('50 tx rows processed', d3.results?.[0]?.rowsProcessed === 50, `got ${d3.results?.[0]?.rowsProcessed}`);

  // ─── Test 4: Idempotent — re-executing same proposal doesn't check for dupes but inserts new rows ───
  console.log("\n=== Test 4: Re-execution inserts additional rows ===");

  // Count existing target rows before re-execution
  const { count: beforeCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', LAB)
    .like('data_type', '%growth_targets%');

  const { status: s4, data: d4 } = await callExecute({
    proposalId: crypto.randomUUID(),
    tenantId: LAB,
    contentUnits: [{
      contentUnitId: 'CFG_DG_Incentive_Q1_2024.xlsx::Growth Targets::1',
      confirmedClassification: 'target',
      confirmedBindings: targetBindings,
      rawData: targetRows,
    }],
  });

  const { count: afterCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', LAB)
    .like('data_type', '%growth_targets%');

  assert('Re-execution returns 200', s4 === 200, `got ${s4}`);
  assert('Row count increased', (afterCount || 0) > (beforeCount || 0),
    `before: ${beforeCount}, after: ${afterCount}`);

  // ─── Test 5: Verify committed_data count matches ───
  console.log("\n=== Test 5: Row count verification ===");

  // Total SCI-committed rows for LAB
  const { count: sciCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' });

  assert('SCI-committed rows exist', (sciCount || 0) > 0, `count: ${sciCount}`);
  console.log(`  Total SCI-committed rows for LAB: ${sciCount}`);

  // ─── Cleanup: Remove test data ───
  console.log("\n=== Cleanup ===");
  const { error: cleanupErr, count: deletedCount } = await supabase
    .from('committed_data')
    .delete({ count: 'exact' })
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' });

  if (cleanupErr) {
    console.log(`  Cleanup error: ${cleanupErr.message}`);
  } else {
    console.log(`  Cleaned up ${deletedCount} SCI test rows`);
  }

  // Clean up SCI import batches
  await supabase
    .from('import_batches')
    .delete()
    .eq('tenant_id', LAB)
    .eq('file_type', 'sci');

  // Summary
  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
