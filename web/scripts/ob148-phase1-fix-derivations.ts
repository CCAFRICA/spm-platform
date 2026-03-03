/**
 * OB-148 Phase 1: Fix derivation rules for store_attainment_percent
 *
 * Changes:
 * - Remove: sum(Cumplimiento from venta_individual) → store_attainment_percent
 * - Add: sum(Real_Venta_Tienda from parent sheet) → store_sales_actual
 * - Add: sum(Meta_Venta_Tienda from parent sheet) → store_sales_goal
 * - Add: ratio(store_sales_actual / store_sales_goal × 100) → store_attainment_percent
 *
 * The parent sheet is the roster sheet (detected via parent-sheet heuristic).
 * Its store rows (entity_id IS NULL) contain Real_Venta_Tienda and Meta_Venta_Tienda.
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob148-phase1-fix-derivations.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-148 PHASE 1: FIX DERIVATION RULES');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get active rule set
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (!rs) { console.error('No active rule set'); return; }

  const inputBindings = (rs.input_bindings ?? {}) as Record<string, unknown>;
  const derivations = (inputBindings.metric_derivations ?? []) as Array<Record<string, unknown>>;

  console.log(`Rule set: ${rs.name} (${rs.id})`);
  console.log(`Current derivation rules: ${derivations.length}\n`);

  // Show current store_attainment_percent rule
  const currentRule = derivations.find(d => d.metric === 'store_attainment_percent');
  console.log('CURRENT store_attainment_percent rule:');
  console.log(JSON.stringify(currentRule, null, 2));

  // Build new derivation rules
  // First, find the parent sheet name (roster sheet)
  const { data: enero } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();
  if (!enero) { console.error('No Enero period'); return; }

  // Get distinct data_types for ALL rows (entity + store)
  const sheetNames = new Set<string>();
  let dtPage = 0;
  while (true) {
    const from = dtPage * 1000;
    const { data: dtRows } = await supabase
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .range(from, from + 999);
    if (!dtRows || dtRows.length === 0) break;
    for (const r of dtRows) {
      if (r.data_type) sheetNames.add(r.data_type);
    }
    if (dtRows.length < 1000) break;
    dtPage++;
  }
  console.log(`Distinct data_types: ${Array.from(sheetNames).join(', ')}`);

  // Find parent sheet via heuristic (same as engine)
  let parentSheet: string | null = null;
  for (const candidate of Array.from(sheetNames)) {
    const prefix = candidate + '__';
    const isParent = Array.from(sheetNames).some(s => s.startsWith(prefix));
    if (isParent) {
      parentSheet = candidate;
      break;
    }
  }

  console.log(`\nParent sheet (roster): ${parentSheet}`);

  if (!parentSheet) {
    console.error('Could not identify parent sheet');
    return;
  }

  // Build regex pattern for parent sheet (escape special chars)
  // Use $ anchor to match exact name (not sub-sheets)
  const parentSheetPattern = parentSheet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
  console.log(`Pattern for parent sheet: ${parentSheetPattern}`);

  // Verify pattern matches parent sheet but not sub-sheets
  const regex = new RegExp(parentSheetPattern, 'i');
  console.log(`  Matches "${parentSheet}": ${regex.test(parentSheet)}`);
  const subSheet = parentSheet + '__base_venta_individual';
  console.log(`  Matches "${subSheet}": ${regex.test(subSheet)}`);

  // New derivation rules — replace store_attainment_percent
  const newDerivations = derivations.filter(d => d.metric !== 'store_attainment_percent');

  // Add store_sales_actual and store_sales_goal BEFORE store_attainment_percent
  // (ratio operation requires the operands to be derived first)
  const storeActualRule = {
    metric: 'store_sales_actual',
    operation: 'sum',
    source_pattern: parentSheetPattern,
    source_field: 'Real_Venta_Tienda',
    filters: [],
  };

  const storeGoalRule = {
    metric: 'store_sales_goal',
    operation: 'sum',
    source_pattern: parentSheetPattern,
    source_field: 'Meta_Venta_Tienda',
    filters: [],
  };

  const storeAttainmentRule = {
    metric: 'store_attainment_percent',
    operation: 'ratio',
    source_pattern: '.*',
    numerator_metric: 'store_sales_actual',
    denominator_metric: 'store_sales_goal',
    scale_factor: 100,
    filters: [],
  };

  // Insert at the beginning (before other rules that might depend on store_attainment_percent)
  newDerivations.unshift(storeActualRule, storeGoalRule, storeAttainmentRule);

  console.log(`\nNew derivation rules (${newDerivations.length}):`);
  for (const d of newDerivations) {
    console.log(`  ${d.metric}: ${d.operation} from ${d.source_pattern || 'N/A'} ${d.source_field || ''}`);
  }

  // Update the rule set
  const newInputBindings = { ...inputBindings, metric_derivations: newDerivations };

  const { error: updateErr } = await supabase
    .from('rule_sets')
    .update({ input_bindings: newInputBindings })
    .eq('id', rs.id);

  if (updateErr) {
    console.error('Update error:', updateErr.message);
    return;
  }

  console.log('\nRule set updated successfully.');

  // Verify
  const { data: verifyRs } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', rs.id)
    .single();

  const verifyBindings = (verifyRs?.input_bindings ?? {}) as Record<string, unknown>;
  const verifyDerivations = (verifyBindings.metric_derivations ?? []) as Array<Record<string, unknown>>;
  console.log(`\nVerified: ${verifyDerivations.length} derivation rules`);
  const verifyAtt = verifyDerivations.find(d => d.metric === 'store_attainment_percent');
  console.log('store_attainment_percent rule:');
  console.log(JSON.stringify(verifyAtt, null, 2));

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PG-01: Derivation rules updated');
  console.log('  Old: sum(Cumplimiento from venta_individual)');
  console.log('  New: ratio(Real_Venta_Tienda / Meta_Venta_Tienda × 100 from parent sheet)');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
