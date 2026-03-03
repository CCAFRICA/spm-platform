/**
 * OB-148 Phase 2: Fix Óptica row metric + Tienda tier boundaries
 *
 * 1. Add individual_attainment_percent derivation (sum Cumplimiento from venta_individual)
 * 2. Change Óptica's rowMetric from store_attainment_percent → individual_attainment_percent
 * 3. Fix Tienda's tier boundaries: <100%=$0, 100-104.99%=$150, 105-109.99%=$300, >=110%=$500
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob148-phase2-fix-optica-tienda.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-148 PHASE 2: FIX ÓPTICA ROW METRIC + TIENDA TIERS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (!rs) { console.error('No active rule set'); return; }

  // ── Fix 1: Add individual_attainment_percent derivation ──
  console.log('--- Fix 1: Add individual_attainment_percent derivation ---\n');

  const inputBindings = (rs.input_bindings ?? {}) as Record<string, unknown>;
  const derivations = (inputBindings.metric_derivations ?? []) as Array<Record<string, unknown>>;

  // Check if individual_attainment_percent already exists
  const existingIndAtt = derivations.find(d => d.metric === 'individual_attainment_percent');
  if (existingIndAtt) {
    console.log('individual_attainment_percent already exists');
  } else {
    // Add individual_attainment_percent: sum(Cumplimiento from venta_individual)
    // This is what store_attainment_percent USED to be (before Phase 1 fixed it)
    derivations.push({
      metric: 'individual_attainment_percent',
      operation: 'sum',
      source_pattern: '.*venta_individual.*',
      source_field: 'Cumplimiento',
      filters: [],
    });
    console.log('Added individual_attainment_percent derivation');
  }

  // Save updated derivation rules
  const newInputBindings = { ...inputBindings, metric_derivations: derivations };
  const { error: bindErr } = await supabase
    .from('rule_sets')
    .update({ input_bindings: newInputBindings })
    .eq('id', rs.id);

  if (bindErr) { console.error('Derivation update error:', bindErr.message); return; }
  console.log('Derivation rules updated\n');

  // ── Fix 2: Update Óptica rowMetric + Tienda tiers ──
  console.log('--- Fix 2: Update component configs ---\n');

  const rawComponents = rs.components;
  let components: Array<Record<string, unknown>>;
  if (Array.isArray(rawComponents)) {
    components = rawComponents as Array<Record<string, unknown>>;
  } else {
    console.error('Components not in flat array format');
    return;
  }

  for (const comp of components) {
    const name = String(comp.name ?? '');

    // Fix Óptica: rowMetric → individual_attainment_percent
    if (name.includes('ptica') && comp.componentType === 'matrix_lookup') {
      const mc = comp.matrixConfig as Record<string, unknown>;
      console.log(`Venta Óptica: rowMetric "${mc.rowMetric}" → "individual_attainment_percent"`);
      mc.rowMetric = 'individual_attainment_percent';
    }

    // Fix Tienda: tier boundaries to match ground truth
    if (name.includes('Tienda') && comp.componentType === 'tier_lookup') {
      const tc = comp.tierConfig as Record<string, unknown>;
      const oldTiers = tc.tiers as Array<Record<string, unknown>>;
      console.log(`\nVenta Tienda: updating tier boundaries`);
      console.log(`  OLD: ${oldTiers.map(t => `${t.label}[${t.min}-${t.max}]=$${t.value}`).join(', ')}`);

      // New tiers: <100%=$0, 100-104.99%=$150, 105-109.99%=$300, >=110%=$500
      tc.tiers = [
        { label: '<100%', min: 0, max: 99.99, value: 0 },
        { label: '100-104.99%', min: 100, max: 104.99, value: 150 },
        { label: '105-109.99%', min: 105, max: 109.99, value: 300 },
        { label: '>=110%', min: 110, max: 999, value: 500 },
      ];

      const newTiers = tc.tiers as Array<Record<string, unknown>>;
      console.log(`  NEW: ${newTiers.map(t => `${t.label}[${t.min}-${t.max}]=$${t.value}`).join(', ')}`);
    }
  }

  // Save updated components
  const { error: compErr } = await supabase
    .from('rule_sets')
    .update({ components })
    .eq('id', rs.id);

  if (compErr) { console.error('Component update error:', compErr.message); return; }
  console.log('\nComponent configs updated\n');

  // ── Verify ──
  const { data: verifyRs } = await supabase
    .from('rule_sets')
    .select('components, input_bindings')
    .eq('id', rs.id)
    .single();

  const verifyComps = (verifyRs?.components ?? []) as Array<Record<string, unknown>>;
  for (const comp of verifyComps) {
    const name = String(comp.name ?? '');
    if (name.includes('ptica') && comp.componentType === 'matrix_lookup') {
      const mc = comp.matrixConfig as Record<string, unknown>;
      console.log(`VERIFY Óptica rowMetric: ${mc.rowMetric}`);
    }
    if (name.includes('Tienda') && comp.componentType === 'tier_lookup') {
      const tc = comp.tierConfig as Record<string, unknown>;
      const tiers = tc.tiers as Array<Record<string, unknown>>;
      console.log(`VERIFY Tienda tiers: ${tiers.map(t => `${t.label}[${t.min}-${t.max}]=$${t.value}`).join(', ')}`);
    }
  }

  const verifyBindings = (verifyRs?.input_bindings ?? {}) as Record<string, unknown>;
  const verifyDerivs = (verifyBindings.metric_derivations ?? []) as Array<Record<string, unknown>>;
  const indAtt = verifyDerivs.find(d => d.metric === 'individual_attainment_percent');
  console.log(`VERIFY individual_attainment_percent: ${indAtt ? 'EXISTS' : 'MISSING'}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PG-02: Óptica rowMetric + Tienda tiers fixed');
  console.log('  Óptica: rowMetric → individual_attainment_percent (Cumplimiento)');
  console.log('  Tienda: <100%=$0, 100-104.99%=$150, 105-109.99%=$300, >=110%=$500');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
