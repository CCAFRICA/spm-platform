/**
 * OB-128 Phase 4: DG End-to-End — F-04 Resolution
 *
 * 1. Import calibrated target data via SCI (PERMANENT — not cleaned up)
 * 2. Run convergence for DG → ratio derivation
 * 3. Calculate ALL periods
 * 4. Verify F-04: payouts VARY by entity based on individual attainment
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob128-phase4-f04-proof.ts
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
  console.log("║  OB-128 PHASE 4: DG END-TO-END — F-04 RESOLUTION  ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── Setup ──
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', LAB)
    .not('external_id', 'is', null)
    .limit(25);
  const entityList = (entities || []).filter(e => e.external_id);
  console.log(`  Total entities: ${entityList.length}`);

  // Find DG rule set
  const { data: allRS } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', LAB)
    .eq('status', 'active');

  let dgRuleSetId = '';
  let dgComponents: any = null;
  for (const rs of (allRS || [])) {
    const comps = rs.components as Record<string, any> | null;
    if (!comps) continue;
    const variants = (comps.variants as any[]) || [];
    const components = (variants[0]?.components as any[]) || [];
    for (const comp of components) {
      const name = String(comp.name || '').toLowerCase();
      if (name.includes('deposit') || name.includes('growth')) {
        dgRuleSetId = rs.id;
        dgComponents = comps;
        break;
      }
    }
    if (dgRuleSetId) break;
  }
  console.log(`  DG Rule Set: ${dgRuleSetId}`);

  // Get all periods with deposit data
  const { data: allPeriods } = await supabase
    .from('periods')
    .select('id, label')
    .eq('tenant_id', LAB)
    .order('start_date', { ascending: true });

  const periodList = allPeriods || [];
  console.log(`  Periods: ${periodList.map(p => p.label).join(', ')}`);

  // ── Step 1: Clean stale SCI data + re-import targets ──
  console.log("\n=== Step 1: Import Target Data via SCI ===");

  // Clean any previous SCI data
  const { count: prevCleaned } = await supabase
    .from('committed_data')
    .delete({ count: 'exact' })
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' });
  if (prevCleaned && prevCleaned > 0) {
    console.log(`  Cleaned ${prevCleaned} stale SCI rows`);
  }
  await supabase.from('import_batches').delete().eq('tenant_id', LAB).eq('file_type', 'sci');

  // Get per-entity per-period deposit amounts for target calibration
  // Targets are period-agnostic but we calibrate based on typical per-period deposits
  // to spread attainment across the tier spectrum (0-60%, 60-80%, 80-100%, 100-120%, 120%+)
  const { data: allDeposits } = await supabase
    .from('committed_data')
    .select('entity_id, period_id, row_data')
    .eq('tenant_id', LAB)
    .ilike('data_type', '%deposit_balances%')
    .limit(500);

  // Compute average per-period deposit per entity
  const depositsByEntityPeriod = new Map<string, Map<string, number>>();
  for (const d of (allDeposits || [])) {
    if (!d.entity_id || !d.period_id) continue;
    const rd = d.row_data as Record<string, unknown>;
    const amt = typeof rd.amount === 'number' ? rd.amount : 0;
    if (!depositsByEntityPeriod.has(d.entity_id)) depositsByEntityPeriod.set(d.entity_id, new Map());
    const epMap = depositsByEntityPeriod.get(d.entity_id)!;
    epMap.set(d.period_id, (epMap.get(d.period_id) || 0) + amt);
  }

  const avgDepositByEntity = new Map<string, number>();
  for (const [eid, periods] of Array.from(depositsByEntityPeriod.entries())) {
    const amounts = Array.from(periods.values());
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    avgDepositByEntity.set(eid, avg);
  }

  // Build target rows — set targets to produce VARIED attainment across tiers
  // Multipliers spread entities: some < 60%, some 60-80%, some 80-100%, some 100-120%, some 120%+
  const tab2Rows = entityList.map((e, i) => {
    const avgDeposit = avgDepositByEntity.get(e.id) || 0;
    let targetAmount: number;

    if (avgDeposit > 0) {
      // Targets relative to per-period deposits (not cross-period totals)
      // Vary multipliers to produce different attainment bands
      const multipliers = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 0.6, 0.9, 1.1, 1.4, 1.8, 0.7,
                           0.55, 0.85, 1.05, 1.25, 1.6, 2.2, 0.65, 0.95, 1.15, 1.45, 1.9, 0.75, 2.5];
      targetAmount = Math.round(avgDeposit * multipliers[i % multipliers.length]);
    } else {
      targetAmount = 1000000;
    }

    return {
      'Officer ID': Number(e.external_id) || e.external_id,
      'Name': e.display_name || 'Unknown',
      'Target Amount': targetAmount,
      'Region': 'LAB',
    };
  });

  // Import via SCI
  const { data: proposal } = await callAPI('/api/import/sci/analyze', {
    tenantId: LAB,
    files: [{
      fileName: 'Deposit_Growth_Targets_Q1.xlsx',
      sheets: [{
        sheetName: 'Growth Targets',
        columns: ['Officer ID', 'Name', 'Target Amount', 'Region'],
        rows: tab2Rows,
        totalRowCount: tab2Rows.length,
      }],
    }],
  });

  const targetUnit = proposal.contentUnits?.find((u: any) => u.classification === 'target');
  assert(!!targetUnit, 'SCI classified sheet as target data');

  const { status: execStatus } = await callAPI('/api/import/sci/execute', {
    proposalId: proposal.proposalId,
    tenantId: LAB,
    contentUnits: [{
      contentUnitId: targetUnit?.contentUnitId,
      confirmedClassification: 'target',
      confirmedBindings: targetUnit?.fieldBindings || [],
      rawData: tab2Rows,
    }],
  });
  assert(execStatus === 200, 'SCI execute succeeded');

  // Verify SCI data
  const { data: sciRows } = await supabase
    .from('committed_data')
    .select('entity_id, data_type, period_id, metadata')
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' })
    .limit(3);

  assert((sciRows?.length || 0) > 0, 'SCI target data committed');
  const sciMeta = sciRows?.[0]?.metadata as Record<string, any>;
  assert(!!sciMeta?.semantic_roles, 'SCI data has semantic_roles metadata');
  console.log(`  SCI data_type: ${sciRows?.[0]?.data_type}`);
  console.log(`  Rows imported: ${tab2Rows.length}`);

  // ── Step 2: Run convergence ──
  console.log("\n=== Step 2: Run Convergence ===");

  // Clear existing bindings to get fresh derivations
  await supabase
    .from('rule_sets')
    .update({ input_bindings: {} })
    .eq('id', dgRuleSetId);

  const { status: convStatus, data: convResult } = await callAPI('/api/intelligence/converge', {
    tenantId: LAB,
    ruleSetId: dgRuleSetId,
  });

  assert(convStatus === 200, 'Convergence returns 200');
  assert(convResult.derivationsGenerated >= 3, `At least 3 derivations generated (got ${convResult.derivationsGenerated})`);

  // Verify stored derivations
  const { data: rsAfter } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', dgRuleSetId)
    .single();

  const derivations = ((rsAfter?.input_bindings as any)?.metric_derivations || []) as any[];
  const actualsD = derivations.find((d: any) => d.metric?.endsWith('_actuals') && d.operation === 'sum');
  const targetD = derivations.find((d: any) => d.metric?.endsWith('_target') && d.operation === 'sum');
  const ratioD = derivations.find((d: any) => d.operation === 'ratio');

  assert(!!actualsD, 'Actuals derivation stored');
  assert(!!targetD, 'Target derivation stored');
  assert(!!ratioD, 'Ratio derivation stored');

  if (ratioD) {
    console.log(`  Ratio: ${ratioD.numerator_metric} / ${ratioD.denominator_metric} × ${ratioD.scale_factor}`);
  }

  // ── Step 3: Calculate ALL periods ──
  console.log("\n=== Step 3: Calculate All Periods ===");

  // Get periods that actually have data
  const { data: periodData } = await supabase
    .from('committed_data')
    .select('period_id')
    .eq('tenant_id', LAB)
    .ilike('data_type', '%deposit_balances%')
    .not('period_id', 'is', null);

  const periodsWithDeposits = new Set((periodData || []).map(r => r.period_id));
  const calcPeriods = periodList.filter(p => periodsWithDeposits.has(p.id));
  console.log(`  Periods with deposit data: ${calcPeriods.map(p => p.label).join(', ')}`);

  let totalResults = 0;
  let totalPayout = 0;
  const allPayouts: number[] = [];

  for (const period of calcPeriods) {
    // Delete stale results
    await supabase.from('calculation_results').delete()
      .eq('tenant_id', LAB).eq('rule_set_id', dgRuleSetId).eq('period_id', period.id);
    await supabase.from('calculation_batches').delete()
      .eq('tenant_id', LAB).eq('rule_set_id', dgRuleSetId).eq('period_id', period.id);

    const { status: calcStatus, data: calcResult } = await callAPI('/api/calculation/run', {
      tenantId: LAB,
      ruleSetId: dgRuleSetId,
      periodId: period.id,
    });

    const periodTotal = calcResult?.totalPayout || 0;
    const resultCount = calcResult?.results?.length || 0;
    totalResults += resultCount;
    totalPayout += periodTotal;

    // Read payouts from DB for this period
    const { data: periodResults } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, components')
      .eq('tenant_id', LAB)
      .eq('rule_set_id', dgRuleSetId)
      .eq('period_id', period.id);

    const periodPayouts = (periodResults || []).map(r => Number(r.total_payout || 0));
    allPayouts.push(...periodPayouts);
    const positiveCount = periodPayouts.filter(p => p > 0).length;
    const uniqueCount = new Set(periodPayouts.map(p => p.toFixed(2))).size;

    console.log(`  ${period.label}: ${resultCount} results, $${periodTotal.toLocaleString()}, ${positiveCount} positive, ${uniqueCount} unique amounts`);

    assert(calcStatus === 200, `${period.label} calculation returns 200`);
  }

  // ── Step 4: F-04 Verdict ──
  console.log("\n=== Step 4: F-04 VERDICT ===");

  const uniquePayouts = new Set(allPayouts.map(a => a.toFixed(2)));
  const positivePayouts = allPayouts.filter(a => a > 0);

  console.log(`  Total results across all periods: ${totalResults}`);
  console.log(`  Grand total payout: $${totalPayout.toLocaleString()}`);
  console.log(`  Positive payouts: ${positivePayouts.length}`);
  console.log(`  Unique payout amounts: ${uniquePayouts.size}`);
  console.log(`  Distribution: ${Array.from(uniquePayouts).sort().join(', ')}`);

  assert(totalResults > 0, 'DG produces results');
  assert(uniquePayouts.size > 1, 'F-04: Payouts VARY by entity (not uniform)');
  assert(positivePayouts.length > 0, 'At least some entities earn positive payouts');

  // Show detailed per-entity breakdown for one period
  console.log("\n  --- Per-Entity Detail (first period with data) ---");
  const detailPeriod = calcPeriods[0];
  if (detailPeriod) {
    const { data: detailResults } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, components')
      .eq('tenant_id', LAB)
      .eq('rule_set_id', dgRuleSetId)
      .eq('period_id', detailPeriod.id)
      .limit(12);

    for (const r of (detailResults || [])) {
      const entity = entityList.find(e => e.id === r.entity_id);
      const comps = r.components as any[];
      const dgComp = comps?.find((c: any) => String(c.componentName || '').toLowerCase().includes('deposit'));
      const details = dgComp?.details as Record<string, any> | undefined;
      const metricValue = details?.metricValue ?? 0;
      const matchedTier = details?.matchedTier ?? 'N/A';

      console.log(`    ${entity?.external_id || '?'} (${entity?.display_name || '?'}): attain=${typeof metricValue === 'number' ? metricValue.toFixed(1) : metricValue}%, tier="${matchedTier}", payout=$${Number(r.total_payout || 0).toLocaleString()}`);
    }
  }

  // F-04 final verdict
  const f04Resolved = uniquePayouts.size > 1;
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║  F-04 STATUS: ${f04Resolved ? 'RESOLVED ✓' : 'OPEN ✗'}              ║`);
  console.log(`  ╚══════════════════════════════════════╝`);

  if (f04Resolved) {
    console.log(`  DG payouts now vary by entity based on individual attainment.`);
    console.log(`  ${uniquePayouts.size} distinct payout tiers observed across ${totalResults} results.`);
  }

  // ── Summary ──
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  RESULTS: ${pass} PASS, ${fail} FAIL out of ${pass + fail} tests`);
  console.log(`${'='.repeat(50)}`);

  if (fail > 0) process.exit(1);
}

main().catch(console.error);
