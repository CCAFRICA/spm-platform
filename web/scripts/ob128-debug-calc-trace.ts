/**
 * OB-128 Debug: Full calculation trace — import targets, converge, then trace derivation per entity
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob128-debug-calc-trace.ts
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
  console.log("=== OB-128 FULL CALCULATION TRACE ===\n");

  // 1. Get entities
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', LAB)
    .not('external_id', 'is', null)
    .limit(12);
  const entityList = (entities || []).filter(e => e.external_id);

  // 2. Find DG rule set
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
      if (name.includes('deposit') || name.includes('growth')) {
        dgRuleSetId = rs.id;
        break;
      }
    }
    if (dgRuleSetId) break;
  }

  // 3. Save current bindings
  const { data: rsBefore } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', dgRuleSetId)
    .single();
  const savedBindings = rsBefore?.input_bindings;

  // 4. Import target data via SCI
  console.log("Step 1: Import targets...");
  const tab2Rows = entityList.map((e) => ({
    'Officer ID': Number(e.external_id) || e.external_id,
    'Name': e.display_name || 'Unknown',
    'Target Amount': 1000000 + Math.floor(Math.random() * 500000),
    'Region': 'Test',
  }));

  const { data: proposal } = await callAPI('/api/import/sci/analyze', {
    tenantId: LAB,
    files: [{
      fileName: 'Deposit_Growth_Targets_Q1.xlsx',
      sheets: [
        { sheetName: 'Growth Targets', columns: ['Officer ID', 'Name', 'Target Amount', 'Region'], rows: tab2Rows, totalRowCount: tab2Rows.length },
      ],
    }],
  });

  const targetUnit = proposal.contentUnits?.find((u: any) => u.classification === 'target');
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

  // 5. Clear bindings + converge
  console.log("Step 2: Converge...");
  await supabase.from('rule_sets').update({ input_bindings: {} }).eq('id', dgRuleSetId);
  await callAPI('/api/intelligence/converge', { tenantId: LAB, ruleSetId: dgRuleSetId });

  // Read stored derivations
  const { data: rsAfter } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', dgRuleSetId)
    .single();
  const derivations = ((rsAfter?.input_bindings as any)?.metric_derivations || []) as any[];

  // 6. Find period with deposit data
  const { data: depositPeriods } = await supabase
    .from('committed_data')
    .select('period_id')
    .eq('tenant_id', LAB)
    .ilike('data_type', '%deposit_balances%')
    .not('period_id', 'is', null)
    .limit(1);
  const testPeriodId = depositPeriods?.[0]?.period_id;

  // 7. Now simulate what the calculation route does for ONE entity
  console.log("\nStep 3: Simulate calculation route data fetch...");

  // Get assignments
  const { data: assignments } = await supabase
    .from('rule_set_assignments')
    .select('entity_id')
    .eq('tenant_id', LAB)
    .eq('rule_set_id', dgRuleSetId)
    .limit(3);

  const testEntityId = assignments?.[0]?.entity_id;
  if (!testEntityId) { console.log("ERROR: No assignments"); return; }

  // Fetch committed_data for this period (like the calc route does)
  const { data: periodData } = await supabase
    .from('committed_data')
    .select('entity_id, data_type, row_data')
    .eq('tenant_id', LAB)
    .eq('period_id', testPeriodId!)
    .limit(1000);

  // Fetch NULL period data (OB-128)
  const { data: nullPeriodData } = await supabase
    .from('committed_data')
    .select('entity_id, data_type, row_data')
    .eq('tenant_id', LAB)
    .is('period_id', null)
    .limit(1000);

  const allData = [...(periodData || []), ...(nullPeriodData || [])];
  console.log(`  Period data: ${periodData?.length || 0} rows`);
  console.log(`  NULL period data: ${nullPeriodData?.length || 0} rows`);
  console.log(`  Total: ${allData.length} rows`);

  // Check what data types are in NULL period data
  const nullDTs = new Map<string, number>();
  for (const r of (nullPeriodData || [])) {
    const dt = r.data_type as string;
    nullDTs.set(dt, (nullDTs.get(dt) || 0) + 1);
  }
  console.log(`  NULL period data types: ${JSON.stringify(Object.fromEntries(nullDTs))}`);

  // Check how many NULL-period rows have entity_id matching our test entity
  const testEntityNullRows = (nullPeriodData || []).filter(r => r.entity_id === testEntityId);
  console.log(`  NULL period rows for test entity: ${testEntityNullRows.length}`);
  for (const r of testEntityNullRows) {
    const rd = r.row_data as Record<string, any>;
    console.log(`    data_type=${r.data_type}, Target Amount=${rd?.['Target Amount']}`);
  }

  // Build entitySheetData for test entity (same as calc route)
  const entitySheetData = new Map<string, Array<{ row_data: any }>>();
  for (const row of allData) {
    if (row.entity_id !== testEntityId) continue;
    const dt = row.data_type as string || '_unknown';
    if (!entitySheetData.has(dt)) entitySheetData.set(dt, []);
    entitySheetData.get(dt)!.push({ row_data: row.row_data });
  }

  console.log(`\n  Entity ${testEntityId} sheets:`);
  for (const [dt, rows] of Array.from(entitySheetData.entries())) {
    console.log(`    ${dt}: ${rows.length} rows`);
  }

  // 8. Manually run derivation pipeline
  console.log("\nStep 4: Apply derivations...");
  const derived: Record<string, number> = {};

  for (const rule of derivations) {
    if (rule.operation === 'ratio') {
      const num = derived[rule.numerator_metric || ''] ?? 0;
      const den = derived[rule.denominator_metric || ''] ?? 0;
      derived[rule.metric] = den !== 0 ? (num / den) * (rule.scale_factor ?? 1) : 0;
      console.log(`  ${rule.metric} (ratio): num=${num}, den=${den}, scale=${rule.scale_factor}, result=${derived[rule.metric].toFixed(2)}%`);
      continue;
    }

    const sourceRegex = new RegExp(rule.source_pattern, 'i');
    let matchingRows: any[] = [];
    for (const [sheetName, rows] of Array.from(entitySheetData.entries())) {
      if (sourceRegex.test(sheetName)) {
        matchingRows = matchingRows.concat(rows);
      }
    }

    if (matchingRows.length === 0) {
      console.log(`  ${rule.metric} (${rule.operation}): NO matching sheets for /${rule.source_pattern}/i → 0`);
      derived[rule.metric] = 0;
      continue;
    }

    if (rule.operation === 'sum' && rule.source_field) {
      let total = 0;
      let foundCount = 0;
      for (const row of matchingRows) {
        const rd = (row.row_data && typeof row.row_data === 'object') ? row.row_data : {};
        const val = rd[rule.source_field];
        if (typeof val === 'number') { total += val; foundCount++; }
      }
      derived[rule.metric] = total;
      console.log(`  ${rule.metric} (sum): ${matchingRows.length} rows, field="${rule.source_field}", ${foundCount} numeric values, total=${total.toLocaleString()}`);
    }
  }

  console.log("\nDerived metrics:");
  console.log(JSON.stringify(derived, null, 2));

  // 9. Cleanup
  console.log("\n--- Cleanup ---");
  const { count: cleaned } = await supabase
    .from('committed_data')
    .delete({ count: 'exact' })
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' });
  console.log(`  Cleaned ${cleaned} SCI rows`);

  await supabase.from('import_batches').delete().eq('tenant_id', LAB).eq('file_type', 'sci');
  await supabase.from('rule_sets').update({ input_bindings: savedBindings }).eq('id', dgRuleSetId);

  // Delete test calc results
  await supabase.from('calculation_results').delete().eq('tenant_id', LAB).eq('rule_set_id', dgRuleSetId).eq('period_id', testPeriodId!);
  await supabase.from('calculation_batches').delete().eq('tenant_id', LAB).eq('rule_set_id', dgRuleSetId).eq('period_id', testPeriodId!);
  console.log("  Restored");
}

main().catch(console.error);
