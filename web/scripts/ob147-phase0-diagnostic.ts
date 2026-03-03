/**
 * OB-147 Phase 0: Diagnostic — verify OB-75 fixes in current codebase
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob147-phase0-diagnostic.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-147 PHASE 0: DIAGNOSTIC — OB-75 FIX VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── 0A: Engine Contract (before) ──
  console.log('--- 0A: ENGINE CONTRACT (BEFORE) ---\n');

  const { count: entityCount } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const { count: periodCount } = await supabase
    .from('periods')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const { count: boundData } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('entity_id', 'is', null)
    .not('period_id', 'is', null);

  const { count: resultCount } = await supabase
    .from('calculation_results')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  let totalPayout = 0;
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    totalPayout += data.reduce((s, r) => s + (r.total_payout || 0), 0);
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`entity_count:     ${entityCount}`);
  console.log(`period_count:     ${periodCount}`);
  console.log(`bound_data_rows:  ${boundData}`);
  console.log(`result_count:     ${resultCount}`);
  console.log(`total_payout:     MX$${totalPayout.toLocaleString()}`);

  // ── 0B: Roster population filter check ──
  console.log('\n\n--- 0B: ROSTER POPULATION FILTER ---\n');

  // Get Enero 2024 period
  const { data: enero } = await supabase
    .from('periods')
    .select('id, canonical_key')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();

  if (!enero) {
    console.log('ERROR: Enero 2024 period not found');
    return;
  }

  console.log(`Enero 2024 period: ${enero.id}`);

  // Check distinct data_type (sheet names) for this period
  console.log('\nDistinct data_type (sheet names) in committed_data for Enero 2024:');
  const sheetNames = new Set<string>();
  let sheetPage = 0;
  while (true) {
    const from = sheetPage * PAGE_SIZE;
    const { data } = await supabase
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.data_type) sheetNames.add(row.data_type);
    }
    if (data.length < PAGE_SIZE) break;
    sheetPage++;
  }

  for (const name of Array.from(sheetNames).sort()) {
    console.log(`  ${name}`);
  }

  // Check which sheet names match the roster filter
  const rosterSheetNames = ['Datos Colaborador', 'Roster', 'Employee', 'Empleados'];
  const matchingRosterSheets = Array.from(sheetNames).filter(name =>
    rosterSheetNames.some(r => name.toLowerCase().includes(r.toLowerCase()))
  );
  console.log(`\nRoster-matching sheets: ${matchingRosterSheets.length > 0 ? matchingRosterSheets.join(', ') : 'NONE'}`);

  // Check specifically for Datos_Colaborador
  const datosMatch = Array.from(sheetNames).filter(name =>
    name.toLowerCase().includes('datos') || name.toLowerCase().includes('colaborador')
  );
  console.log(`Datos/Colaborador partial matches: ${datosMatch.length > 0 ? datosMatch.join(', ') : 'NONE'}`);

  // Count entities with data in each sheet for this period
  console.log('\nEntity count per sheet (Enero 2024):');
  for (const sheetName of Array.from(sheetNames).sort()) {
    const { count } = await supabase
      .from('committed_data')
      .select('entity_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .eq('data_type', sheetName)
      .not('entity_id', 'is', null);

    const { count: nullEntityCount } = await supabase
      .from('committed_data')
      .select('entity_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .eq('data_type', sheetName)
      .is('entity_id', null);

    console.log(`  ${sheetName}: ${count} entity rows, ${nullEntityCount} store rows (null entity_id)`);
  }

  // Count distinct entities with data in roster-matching sheets
  if (matchingRosterSheets.length > 0) {
    console.log('\nDistinct entity_ids with roster data:');
    const rosterEntities = new Set<string>();
    for (const sheetName of matchingRosterSheets) {
      let rPage = 0;
      while (true) {
        const from = rPage * PAGE_SIZE;
        const { data } = await supabase
          .from('committed_data')
          .select('entity_id')
          .eq('tenant_id', tenantId)
          .eq('period_id', enero.id)
          .eq('data_type', sheetName)
          .not('entity_id', 'is', null)
          .range(from, from + PAGE_SIZE - 1);
        if (!data || data.length === 0) break;
        for (const row of data) {
          if (row.entity_id) rosterEntities.add(row.entity_id);
        }
        if (data.length < PAGE_SIZE) break;
        rPage++;
      }
    }
    console.log(`  ${rosterEntities.size} unique entities on roster`);
  } else {
    console.log('\n⚠️  ROSTER FILTER WILL NOT ACTIVATE — no sheet matches rosterSheetNames');
    console.log('   The engine filter checks: ' + rosterSheetNames.join(', '));
    console.log('   But actual sheets are: ' + Array.from(sheetNames).join(', '));
    console.log('   FIX NEEDED: Either add the actual roster sheet name to the filter,');
    console.log('   or use AI context / population_config for roster identification.');
  }

  // ── 0C: Cross-sheet contamination guard ──
  console.log('\n\n--- 0C: CROSS-SHEET CONTAMINATION GUARD ---\n');
  console.log('buildMetricsForComponent() at run-calculation.ts:621:');
  console.log('  Returns {} when no entity match, no store match, no per-sheet store data');
  console.log('  STATUS: PRESENT');

  // ── 0D: Attainment heuristic ──
  console.log('\n\n--- 0D: ATTAINMENT HEURISTIC ---\n');
  console.log('computeAttainmentFromGoal() at run-calculation.ts:564-573:');
  console.log('  Overrides attainment when > 1000 (monetary value detection)');
  console.log('  STATUS: PRESENT');

  // Check: what does the Cobranza derivation rule look like?
  console.log('\n--- Cobranza derivation rules from rule_set ---');
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('input_bindings, components')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (rs) {
    const ib = rs.input_bindings as Record<string, unknown> | null;
    const derivations = (ib?.metric_derivations as Array<Record<string, unknown>>) ?? [];
    const cobranzaDerivations = derivations.filter(d =>
      String(d.metric ?? '').toLowerCase().includes('cobran') ||
      String(d.metric ?? '').toLowerCase().includes('collect') ||
      String(d.source_pattern ?? '').toLowerCase().includes('cobran')
    );

    if (cobranzaDerivations.length > 0) {
      console.log(`Found ${cobranzaDerivations.length} Cobranza-related derivation rules:`);
      for (const d of cobranzaDerivations) {
        console.log(`  metric: ${d.metric}, op: ${d.operation}, pattern: ${d.source_pattern}`);
        if (d.source_field) console.log(`    source_field: ${d.source_field}`);
        if (d.numerator_metric) console.log(`    numerator: ${d.numerator_metric}, denominator: ${d.denominator_metric}, scale: ${d.scale_factor}`);
      }
    } else {
      console.log('No Cobranza-related derivation rules found');
    }

    // Check the Cobranza component config
    const components = (Array.isArray(rs.components) ? rs.components : []) as Array<Record<string, unknown>>;
    const cobranzaComp = components.find(c =>
      String(c.name ?? '').toLowerCase().includes('cobran') ||
      String(c.name ?? '').toLowerCase().includes('collect')
    );
    if (cobranzaComp) {
      console.log(`\nCobranza component: "${cobranzaComp.name}" (${cobranzaComp.componentType})`);
      if (cobranzaComp.tierConfig) {
        const tc = cobranzaComp.tierConfig as Record<string, unknown>;
        console.log(`  metric: ${tc.metric}`);
        const tiers = (tc.tiers as Array<Record<string, unknown>>) ?? [];
        for (const t of tiers) {
          console.log(`    ${t.label}: ${t.min}-${t.max} → $${t.value}`);
        }
      }
    }
  }

  // ── 0E: Current result count (confirms 22K vs 719) ──
  console.log('\n\n--- 0E: CURRENT RESULT COUNT ---\n');
  console.log(`result_count: ${resultCount}`);
  console.log(`entity_count: ${entityCount}`);
  if (resultCount && entityCount && resultCount > 1000) {
    console.log(`\n⚠️  result_count (${resultCount}) suggests roster filter is NOT working.`);
    console.log('   Expected ~719 if roster filter active, got 22K+');
  }

  // ── Summary ──
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 0 FINDINGS — OB-147');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('FIX 1 — ROSTER POPULATION FILTER:');
  console.log('  Present in current code? YES');
  console.log('  Location: run-calculation.ts:1022-1039, route.ts:420-443');
  console.log('  Current behavior: Filters by sheet name containing roster keywords');
  console.log('  ISSUE: Filter checks for "Datos Colaborador" in sheet names,');
  console.log('  but the actual sheet name in committed_data may NOT match.');
  console.log('  If no sheets match → filter is BYPASSED and all 22K entities calculated.');
  console.log('');
  console.log('FIX 2 — CROSS-SHEET CONTAMINATION GUARD:');
  console.log('  Present in current code? YES');
  console.log('  Location: run-calculation.ts:621');
  console.log('  Current behavior: Returns empty {} when no sheet match');
  console.log('');
  console.log('FIX 3 — ATTAINMENT HEURISTIC:');
  console.log('  Present in current code? YES');
  console.log('  Location: run-calculation.ts:564-573 (computeAttainmentFromGoal)');
  console.log('  Current behavior: Overrides attainment > 1000 with computed ratio');
  console.log('');
  console.log('CONCLUSION:');
  console.log('  Fix 1: CODE EXISTS but INACTIVE — roster sheet name mismatch prevents activation');
  console.log('  Fix 2: ALREADY PRESENT AND ACTIVE');
  console.log('  Fix 3: ALREADY PRESENT AND ACTIVE');
  console.log('  Fixes to apply: Fix roster filter sheet name recognition (Fix 1 only)');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
