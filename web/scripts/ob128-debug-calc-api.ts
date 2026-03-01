/**
 * OB-128 Debug: Call actual calculation API and inspect full response
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob128-debug-calc-api.ts
 * Requires: dev server running on localhost:3000
 */
import { createClient } from '@supabase/supabase-js';

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

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
  console.log("=== OB-128 CALC API TRACE ===\n");

  // Find DG rule set
  const { data: allRS } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', LAB)
    .eq('status', 'active');

  let dgRuleSetId = '';
  for (const rs of (allRS || [])) {
    const comps = rs.components as Record<string, any> | null;
    if (!comps) continue;
    const variants = (comps.variants as any[]) || [];
    const components = (variants[0]?.components as any[]) || [];
    for (const comp of components) {
      const name = String(comp.name || '').toLowerCase();
      if (name.includes('deposit') || name.includes('growth')) { dgRuleSetId = rs.id; break; }
    }
    if (dgRuleSetId) break;
  }

  // Save bindings
  const { data: rsBefore } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', dgRuleSetId)
    .single();
  const savedBindings = rsBefore?.input_bindings;

  // Get entities
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', LAB)
    .not('external_id', 'is', null)
    .limit(12);
  const entityList = (entities || []).filter(e => e.external_id);

  // Import targets
  const tab2Rows = entityList.map((e) => ({
    'Officer ID': Number(e.external_id) || e.external_id,
    'Name': e.display_name || 'Unknown',
    'Target Amount': 1000000,
    'Region': 'Test',
  }));

  const { data: proposal } = await callAPI('/api/import/sci/analyze', {
    tenantId: LAB,
    files: [{
      fileName: 'Deposit_Growth_Targets_Q1.xlsx',
      sheets: [{ sheetName: 'Growth Targets', columns: ['Officer ID', 'Name', 'Target Amount', 'Region'], rows: tab2Rows, totalRowCount: tab2Rows.length }],
    }],
  });
  const targetUnit = proposal.contentUnits?.find((u: any) => u.classification === 'target');
  await callAPI('/api/import/sci/execute', {
    proposalId: proposal.proposalId, tenantId: LAB,
    contentUnits: [{ contentUnitId: targetUnit?.contentUnitId, confirmedClassification: 'target', confirmedBindings: targetUnit?.fieldBindings || [], rawData: tab2Rows }],
  });

  // Converge
  await supabase.from('rule_sets').update({ input_bindings: {} }).eq('id', dgRuleSetId);
  await callAPI('/api/intelligence/converge', { tenantId: LAB, ruleSetId: dgRuleSetId });

  // Find period
  const { data: depositPeriods } = await supabase
    .from('committed_data')
    .select('period_id')
    .eq('tenant_id', LAB)
    .ilike('data_type', '%deposit_balances%')
    .not('period_id', 'is', null)
    .limit(1);
  const testPeriodId = depositPeriods?.[0]?.period_id;

  // Delete stale results
  await supabase.from('calculation_results').delete().eq('tenant_id', LAB).eq('rule_set_id', dgRuleSetId).eq('period_id', testPeriodId!);
  await supabase.from('calculation_batches').delete().eq('tenant_id', LAB).eq('rule_set_id', dgRuleSetId).eq('period_id', testPeriodId!);

  // Run calculation
  console.log("Running calculation...");
  const { status, data: calcResult } = await callAPI('/api/calculation/run', {
    tenantId: LAB,
    ruleSetId: dgRuleSetId,
    periodId: testPeriodId!,
  });

  console.log(`Status: ${status}`);
  console.log(`Result count: ${calcResult?.resultCount || calcResult?.results?.length || 0}`);
  console.log(`Grand total: ${calcResult?.grandTotal}`);

  // Show log from calc
  const log = calcResult?.log || [];
  console.log("\n--- Calculation Log ---");
  for (const l of log) {
    console.log(`  ${l}`);
  }

  // Show first 3 entity results
  const results = calcResult?.results || [];
  console.log("\n--- First 3 Entity Results ---");
  for (const r of results.slice(0, 3)) {
    console.log(`\nEntity: ${r.metadata?.entityName} (${r.metadata?.externalId})`);
    console.log(`  total_payout: ${r.total_payout}`);
    console.log(`  metrics: ${JSON.stringify(r.metrics)}`);
    console.log(`  components:`);
    for (const c of r.components) {
      console.log(`    ${c.componentName}: payout=${c.payout}`);
      if (c.details) {
        console.log(`      details: ${JSON.stringify(c.details)}`);
      }
    }
  }

  // Check DB results
  const { data: dbResults } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components, metrics')
    .eq('tenant_id', LAB)
    .eq('rule_set_id', dgRuleSetId)
    .eq('period_id', testPeriodId!)
    .limit(3);

  console.log("\n--- DB Results ---");
  for (const r of (dbResults || [])) {
    const comps = r.components as any[];
    const dgComp = comps?.find((c: any) => {
      const name = String(c.componentName || '').toLowerCase();
      return name.includes('deposit') || name.includes('growth');
    });
    console.log(`  entity=${r.entity_id}: total=$${r.total_payout}, DG_payout=${dgComp?.payout || 0}`);
    if (dgComp?.details) {
      console.log(`    DG details: ${JSON.stringify(dgComp.details)}`);
    }
    console.log(`    metrics: ${JSON.stringify(r.metrics)}`);
  }

  // Cleanup
  console.log("\n--- Cleanup ---");
  await supabase.from('committed_data').delete().eq('tenant_id', LAB).contains('metadata', { source: 'sci' });
  await supabase.from('import_batches').delete().eq('tenant_id', LAB).eq('file_type', 'sci');
  await supabase.from('rule_sets').update({ input_bindings: savedBindings }).eq('id', dgRuleSetId);
  await supabase.from('calculation_results').delete().eq('tenant_id', LAB).eq('rule_set_id', dgRuleSetId).eq('period_id', testPeriodId!);
  await supabase.from('calculation_batches').delete().eq('tenant_id', LAB).eq('rule_set_id', dgRuleSetId).eq('period_id', testPeriodId!);
  console.log("  Done");
}

main().catch(console.error);
