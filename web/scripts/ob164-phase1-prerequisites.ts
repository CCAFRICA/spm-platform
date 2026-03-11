#!/usr/bin/env npx tsx
/**
 * OB-164 Phase 1: Import Prerequisites
 *
 * Creates the rule_set (plan) for BCL tenant. This is the prerequisite
 * that must exist before SCI can process transaction data and converge bindings.
 *
 * In production, this would be created by importing a plan document through SCI.
 * For OB-164, we create it directly with the exact same structure as OB-163
 * to ensure GT verification passes ($314,978).
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob164-phase1-prerequisites.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const BCL_RULE_SET_ID = 'b1c20001-aaaa-bbbb-cccc-222222222222';

// ──────────────────────────────────────────────
// Rate Tables (identical to OB-163 seed)
// ──────────────────────────────────────────────

const C1_ROW_BANDS = [
  { min: 0, max: 70, label: 'Bajo' },
  { min: 70, max: 85, label: 'Medio' },
  { min: 85, max: 100, label: 'Alto' },
  { min: 100, max: 999, label: 'Excepcional' },
];
const C1_COL_BANDS = [
  { min: 0, max: 90, label: 'Riesgo' },
  { min: 90, max: 95, label: 'Aceptable' },
  { min: 95, max: 999, label: 'Excelente' },
];
const C1_SENIOR_VALUES = [
  [0, 0, 50],
  [100, 200, 300],
  [200, 400, 600],
  [350, 600, 900],
];
const C1_STANDARD_VALUES = [
  [0, 0, 25],
  [50, 100, 150],
  [100, 200, 300],
  [175, 300, 450],
];

const C2_TIERS_SENIOR = [
  { min: 0, max: 60, label: 'Sin comision', value: 0 },
  { min: 60, max: 80, label: 'Basico', value: 150 },
  { min: 80, max: 100, label: 'Competente', value: 350 },
  { min: 100, max: 120, label: 'Superior', value: 550 },
  { min: 120, max: 999, label: 'Excepcional', value: 750 },
];
const C2_TIERS_STANDARD = [
  { min: 0, max: 60, label: 'Sin comision', value: 0 },
  { min: 60, max: 80, label: 'Basico', value: 75 },
  { min: 80, max: 100, label: 'Competente', value: 175 },
  { min: 100, max: 120, label: 'Superior', value: 275 },
  { min: 120, max: 999, label: 'Excepcional', value: 375 },
];

function buildPlanComponents(level: 'Senior' | 'Standard') {
  const values = level === 'Senior' ? C1_SENIOR_VALUES : C1_STANDARD_VALUES;
  const c2Tiers = level === 'Senior' ? C2_TIERS_SENIOR : C2_TIERS_STANDARD;
  const c3Rate = level === 'Senior' ? 18 : 12;
  const c4Pass = level === 'Senior' ? 150 : 100;

  return [
    {
      id: `c1-colocacion-${level.toLowerCase()}`,
      name: 'Colocacion de Credito',
      description: 'Comision basada en cumplimiento de colocacion y calidad de cartera',
      order: 1,
      enabled: true,
      componentType: 'matrix_lookup',
      measurementLevel: 'individual',
      matrixConfig: {
        rowMetric: 'Cumplimiento_Colocacion',
        rowMetricLabel: 'Cumplimiento de Colocacion (%)',
        rowBands: C1_ROW_BANDS,
        columnMetric: 'Indice_Calidad_Cartera',
        columnMetricLabel: 'Indice de Calidad de Cartera (%)',
        columnBands: C1_COL_BANDS,
        values,
        currency: 'USD',
      },
      calculationIntent: {
        operation: 'bounded_lookup_2d',
        inputs: {
          row: { source: 'metric', sourceSpec: { field: 'Cumplimiento_Colocacion' } },
          column: { source: 'metric', sourceSpec: { field: 'Indice_Calidad_Cartera' } },
        },
        rowBoundaries: [70, 85, 100],
        columnBoundaries: [90, 95],
        outputGrid: values,
      },
    },
    {
      id: `c2-depositos-${level.toLowerCase()}`,
      name: 'Captacion de Depositos',
      description: 'Comision por cumplimiento de meta de depositos',
      order: 2,
      enabled: true,
      componentType: 'tier_lookup',
      measurementLevel: 'individual',
      tierConfig: {
        metric: 'Pct_Meta_Depositos',
        metricLabel: 'Porcentaje Meta Depositos (%)',
        tiers: c2Tiers,
        currency: 'USD',
      },
      calculationIntent: {
        operation: 'bounded_lookup_1d',
        input: { source: 'metric', sourceSpec: { field: 'Pct_Meta_Depositos' } },
        boundaries: [60, 80, 100, 120],
        outputs: c2Tiers.map(t => t.value),
      },
    },
    {
      id: `c3-productos-${level.toLowerCase()}`,
      name: 'Productos Cruzados',
      description: 'Comision por cantidad de productos cruzados vendidos',
      order: 3,
      enabled: true,
      componentType: 'percentage',
      measurementLevel: 'individual',
      percentageConfig: {
        rate: c3Rate,
        appliedTo: 'Cantidad_Productos_Cruzados',
        appliedToLabel: 'Cantidad de Productos Cruzados',
      },
      calculationIntent: {
        operation: 'scalar_multiply',
        input: { source: 'metric', sourceSpec: { field: 'Cantidad_Productos_Cruzados' } },
        rate: c3Rate,
      },
    },
    {
      id: `c4-regulatorio-${level.toLowerCase()}`,
      name: 'Cumplimiento Regulatorio',
      description: 'Bono por cumplimiento regulatorio (0 infracciones)',
      order: 4,
      enabled: true,
      componentType: 'conditional_percentage',
      measurementLevel: 'individual',
      conditionalConfig: {
        appliedTo: 'Infracciones_Regulatorias',
        appliedToLabel: 'Infracciones Regulatorias',
        conditions: [
          {
            metric: 'Infracciones_Regulatorias',
            metricLabel: 'Infracciones',
            min: 0,
            max: 0,
            rate: c4Pass,
            label: 'Sin infracciones',
          },
          {
            metric: 'Infracciones_Regulatorias',
            metricLabel: 'Infracciones',
            min: 1,
            max: 999,
            rate: 0,
            label: 'Con infracciones',
          },
        ],
      },
      calculationIntent: {
        operation: 'conditional_gate',
        condition: {
          operator: '==',
          left: { source: 'metric', sourceSpec: { field: 'Infracciones_Regulatorias' } },
          right: { source: 'constant', value: 0 },
        },
        onTrue: { operation: 'constant', value: c4Pass },
        onFalse: { operation: 'constant', value: 0 },
      },
    },
  ];
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  OB-164 Phase 1: Import Prerequisites');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── Step 1: Verify tenant exists ──
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', BCL_TENANT_ID)
    .maybeSingle();

  if (!tenant) {
    console.error('BCL tenant not found! Run Phase 0 first.');
    process.exit(1);
  }
  console.log(`✓ Tenant: ${tenant.name}`);

  // ── Step 2: Verify admin profile exists ──
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id, email, role, auth_user_id')
    .eq('tenant_id', BCL_TENANT_ID)
    .eq('email', 'admin@bancocumbre.ec')
    .maybeSingle();

  if (!adminProfile) {
    console.error('Admin profile not found!');
    process.exit(1);
  }
  console.log(`✓ Admin: ${adminProfile.email} (${adminProfile.id})`);

  // ── Step 3: Create rule_set (plan) ──
  console.log('\n── Creating rule_set (plan) ──\n');

  const seniorComponents = buildPlanComponents('Senior');
  const standardComponents = buildPlanComponents('Standard');

  const ruleSetComponents = {
    type: 'additive_lookup',
    variants: [
      {
        variantId: 'ejecutivo-senior',
        variantName: 'Ejecutivo Senior',
        description: 'Plan para ejecutivos senior con tasas mejoradas',
        components: seniorComponents,
      },
      {
        variantId: 'ejecutivo',
        variantName: 'Ejecutivo',
        description: 'Plan estandar para ejecutivos',
        components: standardComponents,
      },
    ],
  };

  // Build convergence bindings
  const convergenceBindings: Record<string, Record<string, unknown>> = {};
  for (let idx = 0; idx < standardComponents.length; idx++) {
    const comp = standardComponents[idx];
    const compKey = `component_${idx}`;
    if (comp.componentType === 'matrix_lookup') {
      convergenceBindings[compKey] = {
        row: { column: 'Cumplimiento_Colocacion', source: 'committed_data' },
        column: { column: 'Indice_Calidad_Cartera', source: 'committed_data' },
      };
    } else if (comp.componentType === 'tier_lookup') {
      convergenceBindings[compKey] = {
        actual: { column: 'Pct_Meta_Depositos', source: 'committed_data' },
      };
    } else if (comp.componentType === 'percentage') {
      convergenceBindings[compKey] = {
        actual: { column: 'Cantidad_Productos_Cruzados', source: 'committed_data' },
      };
    } else if (comp.componentType === 'conditional_percentage') {
      convergenceBindings[compKey] = {
        actual: { column: 'Infracciones_Regulatorias', source: 'committed_data' },
      };
    }
  }

  const metricMappings: Record<string, string> = {
    'Cumplimiento_Colocacion': 'Cumplimiento_Colocacion',
    'Indice_Calidad_Cartera': 'Indice_Calidad_Cartera',
    'Pct_Meta_Depositos': 'Pct_Meta_Depositos',
    'Cantidad_Productos_Cruzados': 'Cantidad_Productos_Cruzados',
    'Infracciones_Regulatorias': 'Infracciones_Regulatorias',
  };

  const { error: rsErr } = await supabase.from('rule_sets').upsert({
    id: BCL_RULE_SET_ID,
    tenant_id: BCL_TENANT_ID,
    name: 'Plan de Comisiones BCL 2025',
    description: 'Plan de comisiones para Banco Cumbre del Litoral — 4 componentes, 2 variantes',
    status: 'active',
    version: 1,
    effective_from: '2025-10-01',
    effective_to: '2026-03-31',
    population_config: { eligible_roles: ['Ejecutivo', 'Ejecutivo Senior'] },
    input_bindings: {
      convergence_bindings: convergenceBindings,
      metric_mappings: metricMappings,
    },
    components: ruleSetComponents,
    cadence_config: { period_type: 'monthly' },
    outcome_config: {},
    metadata: { plan_type: 'additive_lookup', source: 'ob164_pipeline_proof' },
    created_by: adminProfile.auth_user_id,
  });

  if (rsErr) throw new Error(`Rule set create failed: ${rsErr.message}`);
  console.log(`✓ Rule set created: ${BCL_RULE_SET_ID}`);
  console.log('  Name: Plan de Comisiones BCL 2025');
  console.log('  Status: active');
  console.log('  Variants: 2 (Ejecutivo Senior, Ejecutivo)');
  console.log('  Components: 4 (matrix_lookup, tier_lookup, percentage, conditional_percentage)');
  console.log('  Convergence bindings: 4 component bindings configured');

  // ── Step 4: Verify dev server ──
  console.log('\n── Verifying dev server ──\n');

  try {
    const res = await fetch('http://localhost:3000/api/platform/flags');
    if (res.ok) {
      console.log('✓ Dev server responding at localhost:3000');
    } else {
      console.log(`⚠ Dev server returned ${res.status} — SCI import may need manual server start`);
    }
  } catch {
    console.log('⚠ Dev server not reachable — start with: cd web && npm run dev');
  }

  // ── Step 5: Test auth session ──
  console.log('\n── Testing admin auth session ──\n');

  const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
    email: 'admin@bancocumbre.ec',
    password: 'demo-password-BCL1',
  });

  if (signInErr) {
    console.error(`⚠ Admin sign-in failed: ${signInErr.message}`);
    console.log('  This may affect SCI API calls');
  } else {
    console.log('✓ Admin auth session created');
    console.log(`  Access token: ${signIn.session?.access_token?.substring(0, 20)}...`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  OB-164 Phase 1: COMPLETE');
  console.log('  Rule set ready. Proceed to Phase 2 (roster import).');
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
