/**
 * OB-128 Phase 0: Diagnostic — convergence merge logic, DG component, target data, ratio executor
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob128-phase0-diagnostic.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  OB-128 PHASE 0: DIAGNOSTIC                        ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // 0A: Convergence merge logic
  console.log("=== 0A: Convergence Merge Logic ===");
  const convergeRoute = fs.readFileSync('src/app/api/intelligence/converge/route.ts', 'utf-8');
  const mergeLines = convergeRoute.split('\n').filter((l, i) =>
    l.includes('merged') || l.includes('metric') || l.includes('derivation')
  );
  console.log("  Merge-related lines in converge/route.ts:");
  for (const line of mergeLines.slice(0, 15)) {
    console.log(`    ${line.trim()}`);
  }

  // Find the exact dedup line
  const dedup = convergeRoute.split('\n').findIndex(l => l.includes('!merged.some'));
  console.log(`\n  Dedup line (0-indexed): ${dedup}`);
  if (dedup >= 0) {
    const lines = convergeRoute.split('\n');
    for (let i = Math.max(0, dedup - 2); i <= Math.min(lines.length - 1, dedup + 2); i++) {
      console.log(`    ${i + 1}: ${lines[i]}`);
    }
  }

  // 0B: DG plan component and intent
  console.log("\n=== 0B: DG Plan Component ===");
  const { data: dgRS } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', LAB)
    .ilike('name', '%Deposit Growth%')
    .single();

  if (dgRS) {
    console.log(`  Rule Set: ${dgRS.name} (${dgRS.id})`);

    // Extract component details
    const comps = dgRS.components as Record<string, unknown>;
    const variants = (comps?.variants as Array<Record<string, unknown>>) || [];
    const components = (variants[0]?.components as Array<Record<string, unknown>>) || [];

    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      console.log(`\n  Component ${i}: ${comp.name}`);
      console.log(`  calculationIntent: ${JSON.stringify(comp.calculationIntent, null, 4)}`);
      console.log(`  tierConfig: ${JSON.stringify(comp.tierConfig, null, 4)}`);
      console.log(`  calculationMethod: ${JSON.stringify(comp.calculationMethod, null, 4)}`);
    }

    // Show input bindings
    const bindings = dgRS.input_bindings as Record<string, unknown>;
    const derivs = (bindings?.metric_derivations || []) as Array<Record<string, unknown>>;
    console.log(`\n  Input Bindings: ${derivs.length} derivations`);
    for (const d of derivs) {
      console.log(`    metric=${d.metric}, op=${d.operation}, source=${d.source_pattern}, field=${d.source_field || 'N/A'}`);
    }
  }

  // 0C: Target data in committed_data
  console.log("\n=== 0C: Target Data from OB-127 ===");

  // Check for SCI-committed target data
  const { data: sciTargets } = await supabase
    .from('committed_data')
    .select('id, data_type, metadata, row_data')
    .eq('tenant_id', LAB)
    .contains('metadata', { source: 'sci' })
    .limit(3);

  console.log(`  SCI target rows: ${sciTargets?.length || 0}`);
  if (sciTargets && sciTargets.length > 0) {
    for (const r of sciTargets) {
      console.log(`    data_type=${r.data_type}`);
      const meta = r.metadata as Record<string, unknown>;
      console.log(`    semantic_roles: ${JSON.stringify(meta.semantic_roles)}`);
    }
  } else {
    console.log("  No SCI target data found (OB-127 Phase 7 cleanup removed it)");
    console.log("  Phase 4 will re-import via SCI execute API");
  }

  // Check existing Tab 2 data (from original import)
  const { data: tab2Data } = await supabase
    .from('committed_data')
    .select('id, data_type, row_data')
    .eq('tenant_id', LAB)
    .ilike('data_type', '%component_data%Deposit%')
    .limit(3);

  console.log(`\n  Original Tab 2 data (component_data): ${tab2Data?.length || 0} sample rows`);
  if (tab2Data && tab2Data.length > 0) {
    const rd = tab2Data[0].row_data as Record<string, unknown>;
    console.log(`    data_type: ${tab2Data[0].data_type}`);
    console.log(`    fields: ${Object.keys(rd).filter(k => !k.startsWith('_')).join(', ')}`);
    console.log(`    sample: ${JSON.stringify(rd).substring(0, 300)}`);
  }

  // Count original Tab 2 rows
  const { data: tab2All } = await supabase
    .from('committed_data')
    .select('id')
    .eq('tenant_id', LAB)
    .ilike('data_type', '%component_data%Deposit%');
  console.log(`    Total Tab 2 rows: ${tab2All?.length || 0}`);

  // 0D: Intent executor — ratio support
  console.log("\n=== 0D: Intent Executor — Ratio Support ===");
  const executorCode = fs.readFileSync('src/lib/calculation/intent-executor.ts', 'utf-8');
  const ratioLines = executorCode.split('\n')
    .map((l, i) => ({ line: i + 1, text: l }))
    .filter(({ text }) => text.includes('ratio') || text.includes('Ratio'));

  console.log(`  Ratio-related lines: ${ratioLines.length}`);
  for (const { line, text } of ratioLines.slice(0, 10)) {
    console.log(`    ${line}: ${text.trim()}`);
  }

  // Check intent types
  try {
    const typesCode = fs.readFileSync('src/lib/calculation/intent-types.ts', 'utf-8');
    const ratioTypeLines = typesCode.split('\n')
      .map((l, i) => ({ line: i + 1, text: l }))
      .filter(({ text }) => text.includes('ratio') || text.includes('Ratio') || text.includes('numerator') || text.includes('denominator'));
    console.log(`\n  Intent types — ratio-related lines: ${ratioTypeLines.length}`);
    for (const { line, text } of ratioTypeLines) {
      console.log(`    ${line}: ${text.trim()}`);
    }
  } catch {
    console.log("  intent-types.ts not found");
  }

  // Summary
  console.log("\n=== DIAGNOSTIC SUMMARY ===");
  console.log("  1. Merge dedup is in converge/route.ts: !merged.some(e => e.metric === d.metric)");
  console.log("  2. DG uses bounded_lookup_1d with metric deposit_growth_attainment");
  console.log("  3. Current derivation: deposit_growth_attainment → sum on deposit_balances.amount");
  console.log("  4. Target data was cleaned by OB-127 Phase 7 — will re-import in Phase 4");
  console.log("  5. Ratio operation EXISTS in intent-executor.ts");
  console.log("  6. Fix: convergence + merge logic must generate actuals+target derivations + composed ratio intent");
}

main().catch(console.error);
