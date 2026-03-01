/**
 * OB-128 Phase 2: Test — Semantic Role-Aware Convergence
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob128-test-convergence.ts
 * Requires: dev server running on localhost:3000
 */
import { createClient } from '@supabase/supabase-js';

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

let pass = 0;
let fail = 0;

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    pass++;
  } else {
    console.log(`  FAIL: ${name}${details ? ' — ' + details : ''}`);
    fail++;
  }
}

async function callAPI(path: string, body: unknown) {
  const res = await fetch(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  OB-128 PHASE 2: CONVERGENCE SEMANTIC ROLE TESTS   ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── Setup: Get entities for test data ──
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', LAB)
    .limit(12);

  const entityList = (entities || []).filter(e => e.external_id);

  // Get the DG rule set
  const { data: allRS } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', LAB)
    .eq('status', 'active');

  let dgRuleSetId = '';
  for (const rs of (allRS || [])) {
    const comps = rs.components as Record<string, unknown> | null;
    if (!comps) continue;
    const variants = (comps.variants as Array<Record<string, unknown>>) || [];
    const components = (variants[0]?.components as Array<Record<string, unknown>>) || [];
    for (const comp of components) {
      const name = String(comp.name || '').toLowerCase();
      if (name.includes('deposit') || name.includes('growth')) {
        dgRuleSetId = rs.id;
        break;
      }
    }
    if (dgRuleSetId) break;
  }

  console.log(`  DG Rule Set: ${dgRuleSetId}`);
  console.log(`  Test entities: ${entityList.length}\n`);

  // ── Save current input_bindings for restore ──
  const { data: rsBeforeTest } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', dgRuleSetId)
    .single();
  const savedBindings = rsBeforeTest?.input_bindings;

  // ── Step 1: Import test target data via SCI ──
  console.log("=== Step 1: Import Target Data via SCI ===");

  const tab2Cols = ['Officer ID', 'Name', 'Target Amount', 'Region'];
  const tab2Rows = entityList.map((e, i) => ({
    'Officer ID': Number(e.external_id) || e.external_id,
    'Name': e.display_name || `Officer ${i}`,
    'Target Amount': 500000 + i * 100000, // Variable targets: $500K-$1.6M
    'Region': ['North', 'South', 'East', 'West'][i % 4],
  }));

  // Analyze
  const { status: analyzeStatus, data: proposal } = await callAPI('/api/import/sci/analyze', {
    tenantId: LAB,
    files: [{
      fileName: 'Deposit_Growth_Targets_Q1.xlsx',
      sheets: [
        { sheetName: 'Growth Targets', columns: tab2Cols, rows: tab2Rows, totalRowCount: tab2Rows.length },
      ],
    }],
  });

  assert(analyzeStatus === 200, 'SCI analyze returns 200');

  const targetUnit = proposal.contentUnits?.find((u: { classification: string }) => u.classification === 'target');
  assert(!!targetUnit, 'Tab classified as target', `classification=${targetUnit?.classification}`);

  // Execute
  const { status: execStatus, data: execResult } = await callAPI('/api/import/sci/execute', {
    proposalId: proposal.proposalId,
    tenantId: LAB,
    contentUnits: [{
      contentUnitId: targetUnit?.contentUnitId,
      confirmedClassification: 'target',
      confirmedBindings: targetUnit?.fieldBindings || [],
      rawData: tab2Rows,
    }],
  });

  const execSuccess = execResult.results?.[0]?.success;
  assert(execStatus === 200 && execSuccess, 'SCI execute commits target data');

  // ── Step 2: Verify semantic_roles in committed_data ──
  console.log("\n=== Step 2: Verify Semantic Roles ===");

  const { data: sciRows } = await supabase
    .from('committed_data')
    .select('id, data_type, metadata')
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' })
    .limit(3);

  assert((sciRows?.length || 0) > 0, 'SCI rows exist in committed_data');

  const meta = sciRows?.[0]?.metadata as Record<string, unknown> | undefined;
  const roles = meta?.semantic_roles as Record<string, string> | undefined;
  assert(!!roles, 'metadata contains semantic_roles');

  const hasTargetRole = roles ? Object.entries(roles).some(([, val]) => {
    if (typeof val === 'string') return val === 'performance_target';
    if (val && typeof val === 'object' && 'role' in val) return (val as { role: string }).role === 'performance_target';
    return false;
  }) : false;
  assert(hasTargetRole, 'At least one field has performance_target role');

  const sciDataType = sciRows?.[0]?.data_type as string || '';
  console.log(`  SCI data_type: ${sciDataType}`);
  console.log(`  semantic_roles: ${JSON.stringify(roles)}`);

  // ── Step 3: Run convergence for DG ──
  console.log("\n=== Step 3: Run Convergence ===");

  // Reset input_bindings to clear any previous derivations
  await supabase
    .from('rule_sets')
    .update({ input_bindings: {} })
    .eq('id', dgRuleSetId);

  const { status: convergeStatus, data: convergeResult } = await callAPI('/api/intelligence/converge', {
    tenantId: LAB,
    ruleSetId: dgRuleSetId,
  });

  assert(convergeStatus === 200, 'Convergence API returns 200');
  console.log(`  Derivations generated: ${convergeResult.derivationsGenerated}`);

  // ── Step 4: Verify derivations ──
  console.log("\n=== Step 4: Verify Derivations ===");

  const { data: rsAfter } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', dgRuleSetId)
    .single();

  const bindings = rsAfter?.input_bindings as Record<string, unknown> | null;
  const derivations = (bindings?.metric_derivations || []) as Array<Record<string, unknown>>;

  console.log(`  Total derivations: ${derivations.length}`);
  for (const d of derivations) {
    console.log(`    metric=${d.metric}, op=${d.operation}, source=${d.source_pattern || 'N/A'}, field=${d.source_field || d.numerator_metric || 'N/A'}`);
  }

  // Check for actuals derivation (renamed to _actuals)
  const actualsDerivation = derivations.find(d =>
    String(d.metric).endsWith('_actuals') && d.operation === 'sum'
  );
  assert(!!actualsDerivation, 'Actuals derivation exists with _actuals suffix');

  // Check for target derivation
  const targetDerivation = derivations.find(d =>
    String(d.metric).endsWith('_target') && d.operation === 'sum'
  );
  assert(!!targetDerivation, 'Target derivation exists with _target suffix');

  // Check for ratio derivation
  const ratioDerivation = derivations.find(d => d.operation === 'ratio');
  assert(!!ratioDerivation, 'Ratio derivation exists');

  if (ratioDerivation) {
    assert(!!ratioDerivation.numerator_metric, 'Ratio has numerator_metric');
    assert(!!ratioDerivation.denominator_metric, 'Ratio has denominator_metric');
    assert((ratioDerivation.scale_factor as number) === 100, 'Ratio scale_factor is 100 (percentage)');
  }

  // ── Step 5: Korean Test ──
  console.log("\n=== Step 5: Korean Test ===");
  const convergenceCode = require('fs').readFileSync('src/lib/intelligence/convergence-service.ts', 'utf-8');
  const domainWords = ['compensation', 'commission', 'loan', 'officer', 'mortgage',
    'insurance', 'deposit', 'referral', 'salary', 'payroll', 'bonus'];
  const violations = domainWords.filter(word =>
    convergenceCode.toLowerCase().includes(word)
  );
  assert(violations.length === 0, 'Korean Test — zero domain vocabulary in convergence',
    violations.length > 0 ? `Found: ${violations.join(', ')}` : undefined);

  // ── Cleanup ──
  console.log("\n=== Cleanup ===");
  const { count: cleaned } = await supabase
    .from('committed_data')
    .delete({ count: 'exact' })
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' });
  console.log(`  Cleaned ${cleaned} SCI test rows`);

  await supabase
    .from('import_batches')
    .delete()
    .eq('tenant_id', LAB)
    .eq('file_type', 'sci');

  // Restore original input_bindings
  await supabase
    .from('rule_sets')
    .update({ input_bindings: savedBindings })
    .eq('id', dgRuleSetId);
  console.log(`  Restored original input_bindings`);

  // ── Summary ──
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  RESULTS: ${pass} PASS, ${fail} FAIL out of ${pass + fail} tests`);
  console.log(`${'='.repeat(50)}`);

  if (fail > 0) process.exit(1);
}

main().catch(console.error);
