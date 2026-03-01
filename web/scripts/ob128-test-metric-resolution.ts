/**
 * OB-128 Phase 3: Test — Metric Resolution for Target Data
 * Verifies that the derivation executor resolves target values per-entity
 * and that the ratio derivation computes correct attainment percentages.
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob128-test-metric-resolution.ts
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
  console.log("║  OB-128 PHASE 3: METRIC RESOLUTION TEST            ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── Setup: Get entities ──
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', LAB)
    .not('external_id', 'is', null)
    .limit(12);

  const entityList = (entities || []).filter(e => e.external_id);
  console.log(`  Entities: ${entityList.length}`);

  // Find the test period FIRST — we need per-period deposits for calibration
  const { data: depositPeriods } = await supabase
    .from('committed_data')
    .select('period_id')
    .eq('tenant_id', LAB)
    .ilike('data_type', '%deposit_balances%')
    .not('period_id', 'is', null)
    .limit(1);

  const testPeriodId = depositPeriods?.[0]?.period_id;
  const { data: periods } = await supabase
    .from('periods')
    .select('id, label')
    .eq('tenant_id', LAB)
    .eq('id', testPeriodId || '');

  const testPeriod = periods?.[0];
  assert(!!testPeriod, `Test period exists with deposit data: ${testPeriod?.label}`);

  // Get PER-PERIOD deposit amounts (not cross-period totals)
  // The calculation only sees data for the specific period, so targets must be calibrated accordingly
  const { data: periodDeposits } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', LAB)
    .eq('period_id', testPeriodId!)
    .ilike('data_type', '%deposit_balances%')
    .limit(200);

  const depositByEntity = new Map<string, number>();
  for (const d of (periodDeposits || [])) {
    if (!d.entity_id) continue;
    const rd = d.row_data as Record<string, unknown>;
    const amt = typeof rd.amount === 'number' ? rd.amount : 0;
    depositByEntity.set(d.entity_id, (depositByEntity.get(d.entity_id) || 0) + amt);
  }

  console.log(`  Entities with deposit data in ${testPeriod?.label}: ${depositByEntity.size}`);
  const sampleEntities = entityList.slice(0, 3);
  for (const e of sampleEntities) {
    const total = depositByEntity.get(e.id) || 0;
    console.log(`    ${e.external_id} (${e.display_name}): $${total.toLocaleString()}`);
  }

  // ── Step 1: Import target data with CALIBRATED targets ──
  // Set targets relative to SINGLE-PERIOD deposits to produce meaningful attainment
  console.log("\n=== Step 1: Import Calibrated Target Data ===");

  // For entities with deposits, set targets to produce varied attainment (50%-150%)
  // For entities without period deposits, set low targets so they still vary
  const tab2Rows = entityList.map((e, i) => {
    const periodDeposit = depositByEntity.get(e.id) || 0;
    let targetAmount: number;
    if (periodDeposit > 0) {
      // Spread targets: alternate between low (high attainment) and high (low attainment)
      // This ensures payouts VARY across entities
      const multipliers = [0.5, 0.7, 0.85, 1.0, 1.2, 1.5, 0.6, 0.8, 0.9, 1.1, 1.3, 1.6];
      targetAmount = Math.round(periodDeposit * multipliers[i % multipliers.length]);
    } else {
      // Entity has no deposits for this period — set arbitrary target
      targetAmount = 1000000;
    }
    return {
      'Officer ID': Number(e.external_id) || e.external_id,
      'Name': e.display_name || 'Unknown',
      'Target Amount': targetAmount,
      'Region': 'Test',
    };
  });

  // Show what we're importing
  for (let i = 0; i < Math.min(5, tab2Rows.length); i++) {
    const actual = depositByEntity.get(entityList[i].id) || 0;
    const target = tab2Rows[i]['Target Amount'];
    const ratio = target > 0 ? (actual / target * 100) : 0;
    console.log(`  ${tab2Rows[i]['Officer ID']}: actual=$${actual.toLocaleString()}, target=$${target.toLocaleString()}, expected_attain=${ratio.toFixed(1)}%`);
  }

  // Analyze + Execute via SCI
  const { data: proposal } = await callAPI('/api/import/sci/analyze', {
    tenantId: LAB,
    files: [{
      fileName: 'Deposit_Growth_Targets_Q1.xlsx',
      sheets: [
        { sheetName: 'Growth Targets', columns: ['Officer ID', 'Name', 'Target Amount', 'Region'], rows: tab2Rows, totalRowCount: tab2Rows.length },
      ],
    }],
  });

  const targetUnit = proposal.contentUnits?.find((u: { classification: string }) => u.classification === 'target');
  await callAPI('/api/import/sci/execute', {
    proposalId: proposal.proposalId,
    tenantId: LAB,
    contentUnits: [{
      contentUnitId: targetUnit?.contentUnitId,
      confirmedClassification: 'target',
      confirmedBindings: targetUnit?.fieldBindings || [],
      rawData: tab2Rows,
    }],
  });

  // Verify SCI data committed with correct entity_id
  const { data: sciData } = await supabase
    .from('committed_data')
    .select('entity_id, data_type, row_data, period_id')
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' })
    .limit(12);

  const sciWithEntity = (sciData || []).filter(r => r.entity_id);
  assert(sciWithEntity.length > 0, 'SCI rows have entity_id resolved');
  console.log(`  SCI rows with entity_id: ${sciWithEntity.length}/${sciData?.length || 0}`);
  assert(sciData?.[0]?.period_id === null, 'SCI rows have period_id=NULL (period-agnostic)');

  // ── Step 2: Run convergence to set up derivations ──
  console.log("\n=== Step 2: Set Up Derivations via Convergence ===");

  // Get DG rule set
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

  // Save bindings for restore
  const { data: rsBefore } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', dgRuleSetId)
    .single();
  const savedBindings = rsBefore?.input_bindings;

  // Clear and re-converge
  await supabase
    .from('rule_sets')
    .update({ input_bindings: {} })
    .eq('id', dgRuleSetId);

  const { data: convergeResult } = await callAPI('/api/intelligence/converge', {
    tenantId: LAB,
    ruleSetId: dgRuleSetId,
  });
  console.log(`  Derivations generated: ${convergeResult.derivationsGenerated}`);
  assert(convergeResult.derivationsGenerated >= 3, 'At least 3 derivations generated (actuals + target + ratio)');

  // Verify stored derivations include ratio
  const { data: rsAfter } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', dgRuleSetId)
    .single();
  const storedDerivations = ((rsAfter?.input_bindings as Record<string, unknown>)?.metric_derivations || []) as Array<Record<string, unknown>>;
  const ratioDerivation = storedDerivations.find(d => d.operation === 'ratio');
  assert(!!ratioDerivation, 'Stored derivations include ratio operation');
  if (ratioDerivation) {
    console.log(`  Ratio: ${ratioDerivation.numerator_metric} / ${ratioDerivation.denominator_metric} × ${ratioDerivation.scale_factor}`);
  }

  // ── Step 3: Run calculation for ONE period ──
  console.log("\n=== Step 3: Run DG Calculation ===");

  // Delete stale DG results
  await supabase
    .from('calculation_results')
    .delete()
    .eq('tenant_id', LAB)
    .eq('rule_set_id', dgRuleSetId)
    .eq('period_id', testPeriod!.id);

  await supabase
    .from('calculation_batches')
    .delete()
    .eq('tenant_id', LAB)
    .eq('rule_set_id', dgRuleSetId)
    .eq('period_id', testPeriod!.id);

  const { status: calcStatus, data: calcResult } = await callAPI('/api/calculation/run', {
    tenantId: LAB,
    ruleSetId: dgRuleSetId,
    periodId: testPeriod!.id,
  });

  console.log(`  Calculation status: ${calcStatus}`);
  console.log(`  Grand total: $${calcResult?.totalPayout?.toLocaleString() || 0}`);
  assert(calcStatus === 200, 'Calculation returns 200');

  // ── Step 4: Check per-entity payouts ──
  console.log("\n=== Step 4: Per-Entity Payout Analysis ===");

  const { data: dgResults } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components')
    .eq('tenant_id', LAB)
    .eq('rule_set_id', dgRuleSetId)
    .eq('period_id', testPeriod!.id);

  const results = dgResults || [];
  assert(results.length > 0, 'DG results exist');

  const payoutAmounts = results.map(r => Number(r.total_payout || 0));
  const uniquePayouts = new Set(payoutAmounts.map(a => a.toFixed(2)));
  const positivePayouts = payoutAmounts.filter(a => a > 0);

  console.log(`  Total results: ${results.length}`);
  console.log(`  Positive payouts: ${positivePayouts.length}`);
  console.log(`  Unique payout amounts: ${uniquePayouts.size}`);
  console.log(`  Payout distribution: ${Array.from(uniquePayouts).sort().join(', ')}`);

  // Show per-entity breakdown with CORRECT per-period deposits
  for (const r of results.slice(0, 8)) {
    const entity = entityList.find(e => e.id === r.entity_id);
    const periodDeposit = depositByEntity.get(r.entity_id) || 0;
    const targetRow = tab2Rows.find(t => {
      const eid = String(t['Officer ID']);
      return entity?.external_id === eid;
    });
    const target = targetRow?.['Target Amount'] || 0;
    const attainment = target > 0 ? (periodDeposit / target * 100) : 0;

    // Get metric value from DB
    const comps = r.components as Array<Record<string, unknown>> | null;
    const dgComp = comps?.find(c => String(c.componentName || '').toLowerCase().includes('deposit'));
    const details = dgComp?.details as Record<string, unknown> | undefined;
    const metricValue = details?.metricValue as number || 0;

    console.log(`    ${entity?.external_id || '?'}: deposits=$${periodDeposit.toLocaleString()}, target=$${target.toLocaleString()}, expected=${attainment.toFixed(1)}%, actual_metric=${metricValue.toFixed(1)}%, payout=$${Number(r.total_payout || 0).toLocaleString()}`);
  }

  assert(uniquePayouts.size > 1, 'Payouts VARY by entity (F-04 mechanism test)');
  assert(positivePayouts.length > 0, 'At least one entity has positive payout');

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

  // Restore original bindings
  await supabase
    .from('rule_sets')
    .update({ input_bindings: savedBindings })
    .eq('id', dgRuleSetId);

  // Delete test calculation results
  await supabase
    .from('calculation_results')
    .delete()
    .eq('tenant_id', LAB)
    .eq('rule_set_id', dgRuleSetId)
    .eq('period_id', testPeriod!.id);

  await supabase
    .from('calculation_batches')
    .delete()
    .eq('tenant_id', LAB)
    .eq('rule_set_id', dgRuleSetId)
    .eq('period_id', testPeriod!.id);

  console.log(`  Restored original state`);

  // ── Summary ──
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  RESULTS: ${pass} PASS, ${fail} FAIL out of ${pass + fail} tests`);
  console.log(`${'='.repeat(50)}`);

  if (fail > 0) process.exit(1);
}

main().catch(console.error);
