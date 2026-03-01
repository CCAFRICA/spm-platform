/**
 * OB-127 Phase 7: F-04 Proof — DG End-to-End via SCI
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob127-phase7-f04-proof.ts
 * Requires: dev server running on localhost:3000
 */
import { createClient } from '@supabase/supabase-js';

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MBC = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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
  console.log("║  OB-127 PHASE 7: F-04 PROOF — DG END-TO-END       ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── Step 7.1: DG Plan Structure ──
  console.log("=== Step 7.1: DG Plan Structure ===");

  const { data: allActive } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', LAB)
    .eq('status', 'active');

  let dgRuleSetId = '';
  let dgComponentName = '';

  for (const rs of (allActive || [])) {
    const comps = rs.components as Record<string, unknown> | null;
    if (!comps) continue;
    const variants = (comps.variants as Array<Record<string, unknown>>) || [];
    const components = (variants[0]?.components as Array<Record<string, unknown>>) || [];
    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      const name = String(comp.name || comp.id || '').toLowerCase();
      if (name.includes('deposit') || name.includes('growth')) {
        dgRuleSetId = rs.id;
        dgComponentName = String(comp.name || comp.id || '');
        console.log(`  DG component: "${dgComponentName}" in ${rs.name} (${rs.id})`);

        // Show calculation details
        const intent = comp.calculationIntent as Record<string, unknown> | undefined;
        const tierConfig = comp.tierConfig as Record<string, unknown> | undefined;
        console.log(`  Calculation: op=${intent?.operation || 'N/A'}, metric=${tierConfig?.metric || 'N/A'}`);
        break;
      }
    }
    if (dgRuleSetId) break;
  }

  // Show existing derivations
  const dgRS = (allActive || []).find(rs => rs.id === dgRuleSetId);
  const bindings = dgRS?.input_bindings as Record<string, unknown> | null;
  const derivations = (bindings?.metric_derivations || []) as Array<Record<string, unknown>>;
  console.log(`\n  Existing derivations (${derivations.length}):`);
  for (const d of derivations) {
    console.log(`    metric=${d.metric}, op=${d.operation}, source=${d.source_pattern}, field=${d.source_field || '*'}`);
  }

  // ── Step 7.2: Existing Target Data ──
  console.log("\n=== Step 7.2: Existing Target Data ===");

  // Get ALL distinct data_types for LAB
  const { data: allData } = await supabase
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', LAB);

  const types = new Set((allData || []).map(r => r.data_type));
  const depositTypes = Array.from(types).filter(t =>
    t.toLowerCase().includes('deposit') || t.toLowerCase().includes('growth')
  );
  console.log(`  Deposit-related data_types: ${depositTypes.join(', ') || 'none'}`);

  // Count rows per deposit type
  for (const dt of depositTypes) {
    const { data: dtRows } = await supabase
      .from('committed_data')
      .select('id, row_data')
      .eq('tenant_id', LAB)
      .eq('data_type', dt)
      .limit(1);
    const { data: dtCount } = await supabase
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', LAB)
      .eq('data_type', dt);

    const sampleKeys = dtRows?.[0]?.row_data ? Object.keys(dtRows[0].row_data as Record<string, unknown>).filter(k => !k.startsWith('_')) : [];
    console.log(`  ${dt}: ~${dtCount} rows, keys=[${sampleKeys.join(', ')}]`);
  }

  // ── Step 7.3: SCI Analyze DG File ──
  console.log("\n=== Step 7.3: SCI Analyze DG File ===");

  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', LAB)
    .limit(25);

  const entityIds = (entities || []).map(e => e.external_id).filter(Boolean);

  // Tab 1: Plan Rules (sparse, percentages, __EMPTY)
  const tab1Cols = ['CARIBE FINANCIAL GROUP', 'attainment', '__EMPTY', '__EMPTY_1', 'amount', 'text'];
  const tab1Rows = Array.from({ length: 17 }, (_, i) => ({
    'CARIBE FINANCIAL GROUP': i < 3 ? 'ATTAINMENT TIERS' : null,
    'attainment': i >= 3 ? `${60 + i * 5}%` : null,
    '__EMPTY': i >= 3 ? `${60 + i * 5}%` : null,
    '__EMPTY_1': i >= 3 ? (i * 5000) : null,
    'amount': i >= 3 ? (i * 5000) : null,
    'text': i >= 3 ? `Level ${i}` : 'Header text',
  }));

  // Tab 2: Growth Targets with REAL entity IDs and variable target amounts
  const tab2Cols = ['Officer ID', 'Name', 'Target Amount', 'Region'];
  const tab2Rows = entityIds.slice(0, 25).map((eid, i) => ({
    'Officer ID': Number(eid) || eid,
    'Name': (entities || [])[i]?.display_name || `Officer ${i}`,
    'Target Amount': 50000 + i * 5000 + Math.floor(Math.random() * 10000),
    'Region': ['North', 'South', 'East', 'West'][i % 4],
  }));

  const { status: analyzeStatus, data: proposal } = await callAPI('/api/import/sci/analyze', {
    tenantId: LAB,
    files: [{
      fileName: 'CFG_Deposit_Growth_Incentive_Q1_2024.xlsx',
      sheets: [
        { sheetName: 'Plan Rules', columns: tab1Cols, rows: tab1Rows, totalRowCount: 17 },
        { sheetName: 'Growth Targets', columns: tab2Cols, rows: tab2Rows, totalRowCount: tab2Rows.length },
      ],
    }],
  });

  const tab1Unit = proposal.contentUnits?.find((u: { tabName: string }) => u.tabName === 'Plan Rules');
  const tab2Unit = proposal.contentUnits?.find((u: { tabName: string }) => u.tabName === 'Growth Targets');
  console.log(`  Analyze: ${analyzeStatus}`);
  console.log(`  Tab 1 "${tab1Unit?.tabName}": ${tab1Unit?.classification} (${(tab1Unit?.confidence * 100)?.toFixed(0)}%) — ${tab1Unit?.confidence > 0.60 ? 'PASS' : 'FAIL'}`);
  console.log(`  Tab 2 "${tab2Unit?.tabName}": ${tab2Unit?.classification} (${(tab2Unit?.confidence * 100)?.toFixed(0)}%) — ${tab2Unit?.confidence > 0.60 ? 'PASS' : 'FAIL'}`);

  // ── Step 7.4: Execute Target Tab ──
  console.log("\n=== Step 7.4: SCI Execute Target Tab ===");

  const { status: execStatus, data: execResult } = await callAPI('/api/import/sci/execute', {
    proposalId: proposal.proposalId,
    tenantId: LAB,
    contentUnits: [{
      contentUnitId: tab2Unit?.contentUnitId,
      confirmedClassification: 'target',
      confirmedBindings: tab2Unit?.fieldBindings || [],
      rawData: tab2Rows,
    }],
  });

  const targetResult = execResult.results?.[0];
  console.log(`  Execute: ${execStatus}, success=${targetResult?.success}, rows=${targetResult?.rowsProcessed}`);

  // Verify committed_data with semantic_roles
  const { data: sciCommitted } = await supabase
    .from('committed_data')
    .select('id, data_type, metadata')
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' })
    .limit(1);

  if (sciCommitted && sciCommitted.length > 0) {
    const meta = sciCommitted[0].metadata as Record<string, unknown>;
    console.log(`  data_type: ${sciCommitted[0].data_type}`);
    console.log(`  Has semantic_roles: ${meta.semantic_roles != null}`);
  }

  // ── Step 7.5: Convergence Check ──
  console.log("\n=== Step 7.5: Convergence Check ===");

  const { data: updatedRS } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', dgRuleSetId)
    .single();

  const updatedDerivations = ((updatedRS?.input_bindings as Record<string, unknown>)?.metric_derivations || []) as Array<Record<string, unknown>>;
  console.log(`  Derivations after execute: ${updatedDerivations.length}`);
  for (const d of updatedDerivations) {
    console.log(`    metric=${d.metric}, op=${d.operation}, source=${d.source_pattern}, field=${d.source_field || '*'}`);
  }

  // ── Step 7.6: DG Recalculate ──
  console.log("\n=== Step 7.6: DG Recalculate ===");

  // Delete stale DG results
  const { count: deletedCount } = await supabase
    .from('calculation_results')
    .delete({ count: 'exact' })
    .eq('tenant_id', LAB)
    .eq('rule_set_id', dgRuleSetId);
  console.log(`  Deleted ${deletedCount} stale DG results`);

  // Recalculate
  const { data: periods } = await supabase
    .from('periods')
    .select('id, label')
    .eq('tenant_id', LAB);

  let totalDGResults = 0;
  for (const period of (periods || [])) {
    const { data: calcResult } = await callAPI('/api/calculation/run', {
      tenantId: LAB,
      ruleSetId: dgRuleSetId,
      periodId: period.id,
    });
    const count = calcResult?.results?.length || calcResult?.resultCount || 0;
    totalDGResults += count;
    console.log(`  ${period.label}: ${count} results`);
  }

  // ── Step 7.7: F-04 Verdict ──
  console.log("\n=== Step 7.7: F-04 VERDICT ===");

  const { data: dgResults } = await supabase
    .from('calculation_results')
    .select('entity_id, period_id, total_payout')
    .eq('tenant_id', LAB)
    .eq('rule_set_id', dgRuleSetId);

  if (dgResults && dgResults.length > 0) {
    const amounts = dgResults.map(r => Number(r.total_payout || 0));
    const positiveAmounts = amounts.filter(a => a > 0);
    const uniqueAmounts = new Set(positiveAmounts.map(a => a.toFixed(2)));

    console.log(`  DG results: ${dgResults.length}`);
    console.log(`  Positive payouts: ${positiveAmounts.length}`);
    console.log(`  Unique payout amounts: ${uniqueAmounts.size}`);
    console.log(`  Sample amounts: ${Array.from(uniqueAmounts).slice(0, 10).join(', ')}`);
    console.log(`  DG total: $${positiveAmounts.reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

    if (uniqueAmounts.size > 1) {
      console.log("\n  ██ F-04 = RESOLVED by OB-127 ██");
      console.log("  DG payouts VARY by entity");
    } else {
      console.log("\n  ▓▓ F-04 = STILL OPEN ▓▓");
      console.log("  DG payouts remain uniform $30,000");
      console.log("  Root cause: DG derivation references deposit_balances.amount (actuals)");
      console.log("  The engine sums deposit_balances per entity → feeds to bounded_lookup_1d tier table");
      console.log("  Target data committed but NOT referenced by any derivation");
      console.log("  Gap: Convergence token overlap doesn't match DG component to new target data_type");
      console.log("  Resolution: OB-128+ SCI-aware convergence with semantic role matching");
    }
  } else {
    console.log("  No DG results found after recalculation");
    console.log("  ▓▓ F-04 = STILL OPEN ▓▓");
  }

  // ── Step 7.8: Regression ──
  console.log("\n=== Step 7.8: Regression Check ===");

  // CL, MO, IR
  for (const rs of (allActive || [])) {
    if (rs.id === dgRuleSetId) continue;
    const { data: results } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', LAB)
      .eq('rule_set_id', rs.id);

    const count = results?.length || 0;
    const total = (results || []).reduce((sum, r) => sum + Number(r.total_payout || 0), 0);
    console.log(`  ${rs.name}: ${count} results, $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  }

  // MBC
  const { data: mbcRS } = await supabase
    .from('rule_sets')
    .select('id')
    .eq('tenant_id', MBC)
    .eq('status', 'active');
  let mbcTotal = 0;
  let mbcCount = 0;
  for (const rs of (mbcRS || [])) {
    const { data: results } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', MBC)
      .eq('rule_set_id', rs.id);
    mbcTotal += (results || []).reduce((sum, r) => sum + Number(r.total_payout || 0), 0);
    mbcCount += results?.length || 0;
  }
  console.log(`  MBC: ${mbcCount} results, $${mbcTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

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

  console.log("\n=== PHASE 7 COMPLETE ===");
}

main().catch(console.error);
