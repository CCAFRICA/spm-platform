/**
 * OB-128 Debug: Trace derivation pipeline for DG component
 * Checks: stored derivations, data_types, entity data, metric derivation results
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob128-debug-derivations.ts
 */
import { createClient } from '@supabase/supabase-js';

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log("=== OB-128 DERIVATION PIPELINE DIAGNOSTIC ===\n");

  // 1. Find DG rule set
  const { data: allRS } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', LAB)
    .eq('status', 'active');

  let dgRS: typeof allRS extends (infer T)[] | null ? T : never = null as any;
  for (const rs of (allRS || [])) {
    const comps = rs.components as Record<string, any> | null;
    if (!comps) continue;
    const variants = (comps.variants as any[]) || [];
    const components = (variants[0]?.components as any[]) || [];
    for (const comp of components) {
      const name = String(comp.name || '').toLowerCase();
      if (name.includes('deposit') || name.includes('growth')) {
        dgRS = rs;
        break;
      }
    }
    if (dgRS) break;
  }

  if (!dgRS) { console.log("ERROR: No DG rule set found"); return; }
  console.log(`DG Rule Set: ${dgRS.id} (${dgRS.name})`);

  // 2. Show stored derivations
  const bindings = dgRS.input_bindings as Record<string, any> | null;
  const derivations = (bindings?.metric_derivations || []) as any[];
  console.log(`\n--- Stored Derivations: ${derivations.length} ---`);
  for (const d of derivations) {
    console.log(`  metric=${d.metric}, op=${d.operation}, source_pattern="${d.source_pattern}", source_field=${d.source_field || 'N/A'}`);
    if (d.operation === 'ratio') {
      console.log(`    numerator=${d.numerator_metric}, denominator=${d.denominator_metric}, scale=${d.scale_factor}`);
    }
  }

  // 3. Show what data_types exist for LAB
  const { data: dtRows } = await supabase
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', LAB)
    .not('data_type', 'is', null)
    .limit(1000);

  const dtCounts = new Map<string, number>();
  for (const r of (dtRows || [])) {
    const dt = r.data_type as string;
    dtCounts.set(dt, (dtCounts.get(dt) || 0) + 1);
  }
  console.log(`\n--- Data Types in LAB (${dtCounts.size} distinct) ---`);
  for (const [dt, count] of Array.from(dtCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${dt}: ${count} rows`);
  }

  // 4. Check regex matching for each derivation
  console.log("\n--- Regex Match Check ---");
  for (const d of derivations) {
    if (d.operation === 'ratio') {
      console.log(`  ${d.metric} (ratio): skips regex matching`);
      continue;
    }
    const regex = new RegExp(d.source_pattern, 'i');
    const matching = Array.from(dtCounts.keys()).filter(dt => regex.test(dt));
    console.log(`  ${d.metric}: pattern=/${d.source_pattern}/i → matches: ${matching.length > 0 ? matching.join(', ') : 'NONE ✗'}`);
  }

  // 5. Pick one entity with assignments + data
  const { data: assignments } = await supabase
    .from('rule_set_assignments')
    .select('entity_id')
    .eq('tenant_id', LAB)
    .eq('rule_set_id', dgRS.id)
    .limit(5);

  const testEntityId = assignments?.[0]?.entity_id;
  if (!testEntityId) { console.log("\nERROR: No assignments found"); return; }
  console.log(`\n--- Test Entity: ${testEntityId} ---`);

  // 6. Show entity's committed_data grouped by data_type
  const { data: entityData } = await supabase
    .from('committed_data')
    .select('data_type, row_data, period_id')
    .eq('tenant_id', LAB)
    .eq('entity_id', testEntityId)
    .limit(50);

  const entitySheets = new Map<string, any[]>();
  for (const r of (entityData || [])) {
    const dt = r.data_type as string;
    if (!entitySheets.has(dt)) entitySheets.set(dt, []);
    entitySheets.get(dt)!.push(r);
  }

  console.log(`  Entity has ${entityData?.length || 0} committed_data rows across ${entitySheets.size} data_types:`);
  for (const [dt, rows] of Array.from(entitySheets.entries())) {
    const periods = new Set(rows.map((r: any) => r.period_id));
    console.log(`    ${dt}: ${rows.length} rows, periods=[${Array.from(periods).join(', ')}]`);
    // Show sample row_data fields
    const sample = rows[0]?.row_data as Record<string, unknown> | null;
    if (sample) {
      const numericKeys = Object.entries(sample).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k}=${v}`);
      console.log(`      numeric fields: ${numericKeys.slice(0, 5).join(', ')}`);
    }
  }

  // 7. Manually trace applyMetricDerivations
  console.log("\n--- Manual Derivation Trace ---");
  // Build entitySheetData as the calculation route would
  const entitySheetData = new Map<string, Array<{ row_data: any }>>();
  for (const r of (entityData || [])) {
    const dt = r.data_type as string;
    if (!entitySheetData.has(dt)) entitySheetData.set(dt, []);
    entitySheetData.get(dt)!.push({ row_data: r.row_data });
  }

  const derived: Record<string, number> = {};
  for (const rule of derivations) {
    const sourceRegex = new RegExp(rule.source_pattern, 'i');

    // Find matching rows
    let matchingRows: Array<{ row_data: any }> = [];
    for (const [sheetName, rows] of Array.from(entitySheetData.entries())) {
      if (sourceRegex.test(sheetName)) {
        matchingRows = matchingRows.concat(rows);
      }
    }

    if (rule.operation === 'ratio') {
      const num = derived[rule.numerator_metric || ''] ?? 0;
      const den = derived[rule.denominator_metric || ''] ?? 0;
      derived[rule.metric] = den !== 0 ? (num / den) * (rule.scale_factor ?? 1) : 0;
      console.log(`  ${rule.metric} (ratio): num=${num}, den=${den}, scale=${rule.scale_factor}, result=${derived[rule.metric]}`);
      continue;
    }

    if (matchingRows.length === 0) {
      console.log(`  ${rule.metric} (${rule.operation}): 0 matching rows for pattern /${rule.source_pattern}/i → SKIPPED`);
      continue;
    }

    if (rule.operation === 'sum' && rule.source_field) {
      let total = 0;
      for (const row of matchingRows) {
        const rd = (row.row_data && typeof row.row_data === 'object') ? row.row_data : {};
        const val = rd[rule.source_field];
        if (typeof val === 'number') total += val;
      }
      derived[rule.metric] = total;
      console.log(`  ${rule.metric} (sum): ${matchingRows.length} rows, field=${rule.source_field}, total=${total}`);
    }
  }

  console.log(`\n--- Final Derived Metrics ---`);
  console.log(JSON.stringify(derived, null, 2));

  // 8. Show DG component tier config
  const comps = dgRS.components as Record<string, any>;
  const variants = comps.variants || [];
  const components = variants[0]?.components || [];
  const dgComp = components.find((c: any) => {
    const name = String(c.name || '').toLowerCase();
    return name.includes('deposit') || name.includes('growth');
  });
  if (dgComp) {
    console.log(`\n--- DG Component Tier Config ---`);
    console.log(`  metric: ${dgComp.tierConfig?.metric}`);
    console.log(`  tiers:`);
    for (const t of (dgComp.tierConfig?.tiers || [])) {
      console.log(`    ${t.label}: [${t.min}, ${t.max}] → $${t.value}`);
    }
    const metricValue = derived[dgComp.tierConfig?.metric] ?? 0;
    console.log(`  metricValue from derivations: ${metricValue}`);
    console.log(`  Expected tier payout: ${metricValue >= 120 ? '$30,000' : metricValue >= 100 ? '$20,000' : metricValue >= 80 ? '$12,000' : metricValue >= 60 ? '$5,000' : '$0'}`);
  }
}

main().catch(console.error);
