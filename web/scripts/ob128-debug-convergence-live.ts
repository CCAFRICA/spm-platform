/**
 * OB-128 Debug: Live convergence trace — import targets, run convergence, inspect stored derivations
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob128-debug-convergence-live.ts
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
  console.log("=== OB-128 LIVE CONVERGENCE TRACE ===\n");

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
  console.log(`DG Rule Set: ${dgRuleSetId}`);

  // 3. Save current bindings
  const { data: rsBefore } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', dgRuleSetId)
    .single();
  const savedBindings = rsBefore?.input_bindings;

  // 4. Import target data via SCI
  console.log("\n--- Step 1: Import Target Data ---");
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
  console.log("  Target data imported via SCI");

  // 5. Check SCI data exists with semantic_roles
  const { data: sciRows } = await supabase
    .from('committed_data')
    .select('id, data_type, metadata, entity_id, period_id')
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' })
    .limit(3);

  console.log(`  SCI rows found: ${sciRows?.length || 0}`);
  if (sciRows && sciRows.length > 0) {
    const meta = sciRows[0].metadata as Record<string, any>;
    console.log(`  data_type: ${sciRows[0].data_type}`);
    console.log(`  period_id: ${sciRows[0].period_id}`);
    console.log(`  metadata.source: ${meta?.source}`);
    console.log(`  metadata.semantic_roles: ${JSON.stringify(meta?.semantic_roles)}`);
  }

  // 6. Clear bindings and run convergence
  console.log("\n--- Step 2: Clear Bindings + Run Convergence ---");
  await supabase
    .from('rule_sets')
    .update({ input_bindings: {} })
    .eq('id', dgRuleSetId);

  const { status: convStatus, data: convResult } = await callAPI('/api/intelligence/converge', {
    tenantId: LAB,
    ruleSetId: dgRuleSetId,
  });

  console.log(`  Convergence status: ${convStatus}`);
  console.log(`  Derivations generated: ${convResult.derivationsGenerated}`);
  console.log(`  Full reports: ${JSON.stringify(convResult.reports, null, 2)}`);

  // 7. Read what was actually stored
  console.log("\n--- Step 3: Stored Derivations After Convergence ---");
  const { data: rsAfter } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', dgRuleSetId)
    .single();

  const bindings = rsAfter?.input_bindings as Record<string, any> | null;
  const derivations = (bindings?.metric_derivations || []) as any[];
  console.log(`  Total stored: ${derivations.length}`);
  for (const d of derivations) {
    console.log(`  ─ metric="${d.metric}", op="${d.operation}", source_pattern="${d.source_pattern}", source_field="${d.source_field || 'N/A'}"`);
    if (d.operation === 'ratio') {
      console.log(`    numerator="${d.numerator_metric}", denominator="${d.denominator_metric}", scale=${d.scale_factor}`);
    }
  }

  // 8. Cleanup
  console.log("\n--- Cleanup ---");
  const { count: cleaned } = await supabase
    .from('committed_data')
    .delete({ count: 'exact' })
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' });
  console.log(`  Cleaned ${cleaned} SCI rows`);

  await supabase.from('import_batches').delete().eq('tenant_id', LAB).eq('file_type', 'sci');
  await supabase.from('rule_sets').update({ input_bindings: savedBindings }).eq('id', dgRuleSetId);
  console.log("  Restored original bindings");
}

main().catch(console.error);
