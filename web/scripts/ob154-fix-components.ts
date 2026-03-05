/**
 * OB-154 Phase 3C: Transform AI-generated components to engine-compatible format.
 *
 * Problems:
 * 1. AI components use `calculationType` instead of `componentType`
 * 2. Missing tierConfig/matrixConfig/percentageConfig/conditionalConfig
 * 3. Component names don't match data_type sheet names
 * 4. No metric derivations for store-level attainment
 *
 * Solution:
 * 1. Rewrite components in PlanComponent format with proper configs
 * 2. Use variants for certified vs non-certified (different Optical Sales matrix)
 * 3. Name components to match sheet data_types via substring matching
 * 4. Add metric_derivations to input_bindings for store-level ratios
 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// Matrix bands (shared between variants)
const MATRIX_ROW_BANDS = [
  { min: 0, max: 79.99, label: '< 80%' },
  { min: 80, max: 89.99, label: '80% - 90%' },
  { min: 90, max: 99.99, label: '90% - 100%' },
  { min: 100, max: 149.99, label: '100% - 150%' },
  { min: 150, max: 999999, label: '≥ 150%' },
];

const MATRIX_COL_BANDS = [
  { min: 0, max: 59999.99, label: '< $60k' },
  { min: 60000, max: 99999.99, label: '$60k - $100k' },
  { min: 100000, max: 119999.99, label: '$100k - $120k' },
  { min: 120000, max: 179999.99, label: '$120k - $180k' },
  { min: 180000, max: 999999999, label: '≥ $180k' },
];

const CERTIFIED_MATRIX = [
  [0, 0, 0, 500, 800],
  [200, 300, 500, 800, 1100],
  [300, 500, 800, 1100, 1500],
  [800, 1100, 1500, 1800, 2500],
  [1000, 1300, 1800, 2200, 3000],
];

const NON_CERTIFIED_MATRIX = [
  [0, 0, 0, 250, 400],
  [100, 150, 250, 400, 550],
  [150, 250, 400, 550, 750],
  [400, 550, 750, 600, 1250],
  [500, 650, 900, 1100, 1500],
];

// Store Sales tiers (attainment in %)
const STORE_SALES_TIERS = [
  { min: 0, max: 99.99, label: '< 100%', value: 0 },
  { min: 100, max: 104.99, label: '100% - 104.99%', value: 150 },
  { min: 105, max: 109.99, label: '105% - 109.99%', value: 300 },
  { min: 110, max: 999999, label: '≥ 110%', value: 500 },
];

// New Customers tiers
const NEW_CUSTOMERS_TIERS = [
  { min: 0, max: 99.99, label: '< 100%', value: 0 },
  { min: 100, max: 104.99, label: '100% - 104.99%', value: 150 },
  { min: 105, max: 109.99, label: '105% - 109.99%', value: 200 },
  { min: 110, max: 114.99, label: '110% - 114.99%', value: 250 },
  { min: 115, max: 119.99, label: '115% - 119.99%', value: 300 },
  { min: 120, max: 124.99, label: '120% - 124.99%', value: 350 },
  { min: 125, max: 999999, label: '≥ 125%', value: 400 },
];

// Collections tiers (same structure as new customers)
const COLLECTIONS_TIERS = [
  { min: 0, max: 99.99, label: '< 100%', value: 0 },
  { min: 100, max: 104.99, label: '100% - 104.99%', value: 150 },
  { min: 105, max: 109.99, label: '105% - 109.99%', value: 200 },
  { min: 110, max: 114.99, label: '110% - 114.99%', value: 250 },
  { min: 115, max: 119.99, label: '115% - 119.99%', value: 300 },
  { min: 120, max: 124.99, label: '120% - 124.99%', value: 350 },
  { min: 125, max: 999999, label: '≥ 125%', value: 400 },
];

function buildComponents(matrixValues: number[][]) {
  return [
    {
      id: 'optical-sales',
      name: 'Venta Individual',
      description: 'Optical Sales Incentive — matrix of attainment × sales amount',
      order: 1,
      enabled: true,
      componentType: 'matrix_lookup',
      measurementLevel: 'individual',
      matrixConfig: {
        rowMetric: 'Cumplimiento',
        rowMetricLabel: 'Optical Achievement %',
        rowBands: MATRIX_ROW_BANDS,
        columnMetric: 'Venta_Individual',
        columnMetricLabel: 'Individual Optical Sales (MXN)',
        columnBands: MATRIX_COL_BANDS,
        values: matrixValues,
        currency: 'MXN',
      },
    },
    {
      id: 'store-sales',
      name: 'Venta Tienda',
      description: 'Store Sales Incentive — tier lookup on store sales attainment',
      order: 2,
      enabled: true,
      componentType: 'tier_lookup',
      measurementLevel: 'store',
      tierConfig: {
        metric: 'store_sales_attainment',
        metricLabel: 'Store Sales Achievement %',
        tiers: STORE_SALES_TIERS,
        currency: 'MXN',
      },
    },
    {
      id: 'new-customers',
      name: 'Clientes Nuevos',
      description: 'New Customers Incentive — tier lookup on customer acquisition attainment',
      order: 3,
      enabled: true,
      componentType: 'tier_lookup',
      measurementLevel: 'store',
      tierConfig: {
        metric: 'new_customers_attainment',
        metricLabel: 'New Customers Achievement %',
        tiers: NEW_CUSTOMERS_TIERS,
        currency: 'MXN',
      },
    },
    {
      id: 'collections',
      name: 'Cobranza',
      description: 'Store Collections Incentive — tier lookup on collections attainment',
      order: 4,
      enabled: true,
      componentType: 'tier_lookup',
      measurementLevel: 'store',
      tierConfig: {
        metric: 'collections_attainment',
        metricLabel: 'Collections Achievement %',
        tiers: COLLECTIONS_TIERS,
        currency: 'MXN',
      },
    },
    {
      id: 'club-protection',
      name: 'Club Proteccion',
      description: 'Insurance Sales Incentive — conditional percentage on Club Protection sales',
      order: 5,
      enabled: true,
      componentType: 'conditional_percentage',
      measurementLevel: 'individual',
      conditionalConfig: {
        appliedTo: 'insurance_amount',
        appliedToLabel: 'Insurance Sales Amount',
        conditions: [
          {
            metric: 'insurance_attainment',
            metricLabel: 'Insurance Goal Achievement %',
            min: 80,
            max: 99.99,
            rate: 0.03,
            label: '80-100%: 3%',
          },
          {
            metric: 'insurance_attainment',
            metricLabel: 'Insurance Goal Achievement %',
            min: 100,
            max: 999999,
            rate: 0.05,
            label: '≥100%: 5%',
          },
        ],
      },
    },
    {
      id: 'warranty',
      name: 'Garantia Extendida',
      description: 'Extended Warranty Service Incentive — flat 4% of warranty sales',
      order: 6,
      enabled: true,
      componentType: 'percentage',
      measurementLevel: 'individual',
      percentageConfig: {
        rate: 0.04,
        appliedTo: 'service_amount',
        appliedToLabel: 'Extended Warranty Sales Amount',
      },
    },
  ];
}

const METRIC_DERIVATIONS = [
  // Store Sales attainment (from base_venta_tienda)
  {
    metric: 'store_sales_actual',
    operation: 'sum',
    source_pattern: 'venta_tienda',
    source_field: 'Real_Venta_Tienda',
    filters: [],
  },
  {
    metric: 'store_sales_goal',
    operation: 'sum',
    source_pattern: 'venta_tienda',
    source_field: 'Meta_Venta_Tienda',
    filters: [],
  },
  {
    metric: 'store_sales_attainment',
    operation: 'ratio',
    source_pattern: '',
    numerator_metric: 'store_sales_actual',
    denominator_metric: 'store_sales_goal',
    scale_factor: 100,
    filters: [],
  },

  // New Customers attainment (from base_clientes_nuevos)
  {
    metric: 'new_customers_actual',
    operation: 'sum',
    source_pattern: 'clientes_nuevos',
    source_field: 'Clientes_Actuales',
    filters: [],
  },
  {
    metric: 'new_customers_goal',
    operation: 'sum',
    source_pattern: 'clientes_nuevos',
    source_field: 'Clientes_Meta',
    filters: [],
  },
  {
    metric: 'new_customers_attainment',
    operation: 'ratio',
    source_pattern: '',
    numerator_metric: 'new_customers_actual',
    denominator_metric: 'new_customers_goal',
    scale_factor: 100,
    filters: [],
  },

  // Collections attainment (from base_cobranza)
  {
    metric: 'collections_actual',
    operation: 'sum',
    source_pattern: 'cobranza',
    source_field: 'Monto_Recuperado_Actual',
    filters: [],
  },
  {
    metric: 'collections_goal',
    operation: 'sum',
    source_pattern: 'cobranza',
    source_field: 'Monto_Recuperado_Meta',
    filters: [],
  },
  {
    metric: 'collections_attainment',
    operation: 'ratio',
    source_pattern: '',
    numerator_metric: 'collections_actual',
    denominator_metric: 'collections_goal',
    scale_factor: 100,
    filters: [],
  },

  // Insurance: Club Protection amount and attainment
  {
    metric: 'insurance_amount',
    operation: 'sum',
    source_pattern: 'club_proteccion',
    source_field: ' Monto Club Protection ',
    filters: [],
  },
  {
    metric: 'insurance_actual',
    operation: 'sum',
    source_pattern: 'club_proteccion',
    source_field: 'No Actual Club Protection',
    filters: [],
  },
  {
    metric: 'insurance_goal',
    operation: 'sum',
    source_pattern: 'club_proteccion',
    source_field: 'No Meta Club Protection',
    filters: [],
  },
  {
    metric: 'insurance_attainment',
    operation: 'ratio',
    source_pattern: '',
    numerator_metric: 'insurance_actual',
    denominator_metric: 'insurance_goal',
    scale_factor: 100,
    filters: [],
  },

  // Service: Garantia Extendida amount
  {
    metric: 'service_amount',
    operation: 'sum',
    source_pattern: 'garantia_extendida',
    source_field: 'Monto',
    filters: [],
  },
];

async function run() {
  console.log('=== OB-154 PHASE 3C: FIX COMPONENTS ===\n');

  // Get rule set
  const { data: rs } = await sb.from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', T)
    .limit(1);

  if (!rs || rs.length === 0) {
    console.error('No rule set found');
    process.exit(1);
  }

  console.log(`Rule set: ${rs[0].name} (${rs[0].id})`);

  // Build variants
  const certifiedComponents = buildComponents(CERTIFIED_MATRIX);
  const nonCertifiedComponents = buildComponents(NON_CERTIFIED_MATRIX);

  const newComponents = {
    variants: [
      {
        variantId: 'certified',
        variantName: 'OPTOMETRISTA CERTIFICADO',
        description: 'Certified Optometrist',
        components: certifiedComponents,
      },
      {
        variantId: 'non-certified',
        variantName: 'OPTOMETRISTA NO CERTIFICADO',
        description: 'Non-Certified Optometrist',
        components: nonCertifiedComponents,
      },
    ],
  };

  const newInputBindings = {
    ...(rs[0].input_bindings as Record<string, unknown> || {}),
    metric_derivations: METRIC_DERIVATIONS,
  };

  console.log(`\nVariants: ${newComponents.variants.length}`);
  for (const v of newComponents.variants) {
    console.log(`  ${v.variantName}: ${v.components.length} components`);
    for (const c of v.components) {
      console.log(`    - ${c.name} (${c.componentType})`);
    }
  }
  console.log(`\nMetric derivations: ${METRIC_DERIVATIONS.length}`);

  // Update rule set
  const { error } = await sb.from('rule_sets')
    .update({
      components: newComponents,
      input_bindings: newInputBindings,
    })
    .eq('id', rs[0].id);

  if (error) {
    console.error(`Update failed: ${error.message}`);
    process.exit(1);
  }

  console.log('\nRule set updated successfully');

  // Verify
  const { data: verify } = await sb.from('rule_sets')
    .select('components, input_bindings')
    .eq('id', rs[0].id)
    .single();

  const comps = verify?.components as Record<string, unknown>;
  const variants = (comps?.variants as Array<Record<string, unknown>>) || [];
  const bindings = verify?.input_bindings as Record<string, unknown>;
  const derivations = (bindings?.metric_derivations as unknown[]) || [];

  console.log(`\nVerification:`);
  console.log(`  Variants: ${variants.length}`);
  console.log(`  Components per variant: ${(variants[0]?.components as unknown[])?.length}`);
  console.log(`  Metric derivations: ${derivations.length}`);
  console.log(`  First component type: ${((variants[0]?.components as Array<Record<string, unknown>>)?.[0]?.componentType)}`);
}

run().catch(console.error);
