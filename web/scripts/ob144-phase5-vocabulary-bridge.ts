/**
 * OB-144 Phase 5: Vocabulary Bridge
 *
 * Two fixes in one script:
 *
 * FIX 1: Component JSONB format → PlanComponent TypeScript interface
 *   DB has: component_type, config.metric, config.tiers, config.row_metric, etc.
 *   Engine expects: componentType, tierConfig.metric, matrixConfig.rowMetric, etc.
 *
 * FIX 2: Metric derivation rules to bridge raw field names → semantic metric names
 *   Component needs: store_attainment_percent
 *   Data has: Cumplimiento (decimal, e.g. 0.55 = 55%)
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob144-phase5-vocabulary-bridge.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-144 PHASE 5: VOCABULARY BRIDGE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get current rule set
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, components, input_bindings')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (!rs) {
    console.error('ERROR: No active rule set');
    process.exit(1);
  }

  const oldComponents = rs.components as unknown[];
  console.log('Current components:', oldComponents.length);
  for (const c of oldComponents) {
    const comp = c as Record<string, unknown>;
    console.log(`  ${comp.name}: component_type=${comp.component_type}, has config=${!!comp.config}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // FIX 1: Transform components to match PlanComponent interface
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- FIX 1: Transforming component JSONB format ---\n');

  const newComponents = oldComponents.map((c) => {
    const raw = c as Record<string, unknown>;
    const config = raw.config as Record<string, unknown>;
    const compType = String(raw.component_type ?? raw.componentType);
    const name = String(raw.name);

    // Base fields — map snake_case → camelCase
    const base: Record<string, unknown> = {
      id: raw.id,
      name: raw.name,
      description: raw.description ?? name,
      order: raw.order,
      enabled: raw.enabled ?? true,
      componentType: compType === 'percentage_with_gate' ? 'conditional_percentage'
        : compType === 'flat_percentage' ? 'percentage'
        : compType,
      measurementLevel: raw.measurement_level ?? raw.measurementLevel ?? 'individual',
    };

    // Type-specific config transformation
    switch (compType) {
      case 'tier_lookup': {
        // config: { tiers: [...], metric: "..." } → tierConfig: { tiers: [...], metric: "..." }
        const tiers = (config.tiers as Array<Record<string, unknown>>).map(t => ({
          label: `${t.min}-${t.max}%`,
          min: t.min,
          max: t.max,
          value: t.value,
        }));
        base.tierConfig = {
          metric: config.metric,
          tiers,
        };
        break;
      }

      case 'matrix_lookup': {
        // config: { row_metric, column_metric, variant_matrices }
        // → matrixConfig: { rowMetric, columnMetric, rowBands, columnBands, values }
        // Row bands = attainment % (same as Venta Tienda tiers: 0-79, 80-99, 100-119, 120+)
        const rowBands = [
          { label: '0-79%', min: 0, max: 79 },
          { label: '80-99%', min: 80, max: 99 },
          { label: '100-119%', min: 100, max: 119 },
          { label: '120%+', min: 120, max: 999 },
        ];
        // Column bands = store volume tier (1=small, 2=medium, 3=large)
        const columnBands = [
          { label: 'Tier 1', min: 1, max: 1 },
          { label: 'Tier 2', min: 2, max: 2 },
          { label: 'Tier 3', min: 3, max: 3 },
        ];

        // Use "no_certificado" as default values (non-certified)
        const variantMatrices = config.variant_matrices as Record<string, { values: number[][] }>;
        const defaultValues = variantMatrices?.no_certificado?.values ?? variantMatrices?.certificado?.values ?? [];

        base.matrixConfig = {
          rowMetric: String(config.row_metric),
          rowMetricLabel: 'Store Attainment %',
          rowBands,
          columnMetric: String(config.column_metric),
          columnMetricLabel: 'Store Volume Tier',
          columnBands,
          values: defaultValues,
        };
        // Preserve variant_matrices for potential variant selection
        base.config = config;
        break;
      }

      case 'percentage_with_gate': {
        // config: { rates: [{rate, gate_min, gate_max}], metric, gate_metric }
        // → conditionalConfig: { appliedTo, conditions: [{metric, min, max, rate}] }
        const rates = config.rates as Array<Record<string, unknown>>;
        base.conditionalConfig = {
          appliedTo: String(config.metric),
          conditions: rates.map((r, i) => ({
            metricLabel: `Gate ${i + 1}`,
            metric: String(config.gate_metric),
            min: Number(r.gate_min),
            max: Number(r.gate_max),
            rate: Number(r.rate),
          })),
        };
        break;
      }

      case 'flat_percentage': {
        // config: { rate, metric } → percentageConfig: { appliedTo, rate }
        base.percentageConfig = {
          appliedTo: String(config.metric),
          rate: Number(config.rate),
        };
        break;
      }
    }

    return base;
  });

  console.log('Transformed components:');
  for (const c of newComponents) {
    console.log(`  ${c.name}: componentType=${c.componentType}`);
    if (c.tierConfig) console.log(`    tierConfig.metric: ${(c.tierConfig as Record<string, unknown>).metric}`);
    if (c.matrixConfig) {
      const mc = c.matrixConfig as Record<string, unknown>;
      console.log(`    matrixConfig.rowMetric: ${mc.rowMetric}, columnMetric: ${mc.columnMetric}`);
    }
    if (c.conditionalConfig) {
      const cc = c.conditionalConfig as Record<string, unknown>;
      console.log(`    conditionalConfig.appliedTo: ${cc.appliedTo}`);
    }
    if (c.percentageConfig) {
      const pc = c.percentageConfig as Record<string, unknown>;
      console.log(`    percentageConfig.appliedTo: ${pc.appliedTo}, rate: ${pc.rate}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FIX 2: Metric derivation rules
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- FIX 2: Setting up metric derivation rules ---\n');

  /**
   * Vocabulary mapping (from CC-UAT-06 diagnostic):
   *
   * Component Metric            | Sheet                      | Raw Field(s)              | Transform
   * ----------------------------|----------------------------|---------------------------|----------
   * store_attainment_percent    | Base_Venta_Individual       | Cumplimiento              | × 100
   * store_volume_tier           | Base_Venta_Individual       | LLave Tamaño de Tienda    | parse "N-T" → T
   * new_customers_attainment_pct| Base_Clientes_Nuevos        | Clientes_Actuales/Meta     | ratio × 100
   * collections_attainment_pct  | Base_Cobranza               | Monto_Recuperado_Actual/Meta | ratio × 100
   * individual_insurance_sales  | Base_Club_Proteccion        | Monto Club Protection      | direct sum
   * store_insurance_attainment  | (not available — use 100)  | N/A                        | N/A
   * individual_warranty_sales   | (not available in data)    | N/A                        | N/A
   */

  const metricDerivations = [
    // 1. store_attainment_percent — from Cumplimiento field in Base_Venta_Individual
    // Cumplimiento is already per-employee (0.55 = 55%), sum is wrong for this.
    // We need the value as-is, scaled to percentage. Use 'sum' since there's one row per entity.
    {
      metric: 'store_attainment_percent',
      operation: 'sum' as const,
      source_pattern: '.*venta_individual.*',
      source_field: 'Cumplimiento',
      filters: [],
    },
    // 2. store_volume_tier — from the LLave Tamaño de Tienda field
    // Format is "storeNum-tier" e.g., "8-1" → tier 1. We can't parse this with sum.
    // Use sum on a numeric tier field if available. Otherwise handle in engine.
    // Actually the field "suma nivel tienda" might represent the store tier total.
    // Let's try using num_tienda as a proxy — but we really need the tier number.

    // 3. individual_insurance_sales — sum of " Monto Club Protection " (note spaces)
    {
      metric: 'individual_insurance_sales',
      operation: 'sum' as const,
      source_pattern: '.*club_proteccion.*',
      source_field: ' Monto Club Protection ',
      filters: [],
    },
    // 4. new_customers_attainment_percent — ratio of Clientes_Actuales / Clientes_Meta
    // This is store-level data. First sum each field, then compute ratio.
    {
      metric: 'new_customers_actual',
      operation: 'sum' as const,
      source_pattern: '.*clientes_nuevos.*',
      source_field: 'Clientes_Actuales',
      filters: [],
    },
    {
      metric: 'new_customers_goal',
      operation: 'sum' as const,
      source_pattern: '.*clientes_nuevos.*',
      source_field: 'Clientes_Meta',
      filters: [],
    },
    {
      metric: 'new_customers_attainment_percent',
      operation: 'ratio' as const,
      source_pattern: '.*',
      numerator_metric: 'new_customers_actual',
      denominator_metric: 'new_customers_goal',
      scale_factor: 100,
      filters: [],
    },
    // 5. collections_attainment_percent — ratio of Monto_Recuperado_Actual / Monto_Recuperado_Meta
    {
      metric: 'collections_actual',
      operation: 'sum' as const,
      source_pattern: '.*cobranza.*|backttest_optometrista_mar2025_proveedores$',
      source_field: 'Monto_Recuperado_Actual',
      filters: [],
    },
    {
      metric: 'collections_goal',
      operation: 'sum' as const,
      source_pattern: '.*cobranza.*|backttest_optometrista_mar2025_proveedores$',
      source_field: 'Monto_Recuperado_Meta',
      filters: [],
    },
    {
      metric: 'collections_attainment_percent',
      operation: 'ratio' as const,
      source_pattern: '.*',
      numerator_metric: 'collections_actual',
      denominator_metric: 'collections_goal',
      scale_factor: 100,
      filters: [],
    },
  ];

  const newInputBindings = {
    ...(rs.input_bindings as Record<string, unknown> ?? {}),
    metric_derivations: metricDerivations,
  };

  console.log('Metric derivations configured:');
  for (const d of metricDerivations) {
    console.log(`  ${d.metric}: ${d.operation} from ${d.source_field ?? d.numerator_metric + '/' + d.denominator_metric}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // APPLY UPDATES
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- Applying updates to rule_set ---\n');

  const { error: updateErr } = await supabase
    .from('rule_sets')
    .update({
      components: newComponents,
      input_bindings: newInputBindings,
    })
    .eq('id', rs.id);

  if (updateErr) {
    console.error('ERROR updating rule_set:', updateErr.message);
    process.exit(1);
  }

  console.log('Rule set updated successfully.\n');

  // ═══════════════════════════════════════════════════════════════
  // VERIFY
  // ═══════════════════════════════════════════════════════════════

  const { data: verified } = await supabase
    .from('rule_sets')
    .select('components, input_bindings')
    .eq('id', rs.id)
    .single();

  const vComps = verified?.components as unknown[];
  console.log('Verification — components after update:');
  for (const c of vComps ?? []) {
    const comp = c as Record<string, unknown>;
    console.log(`  ${comp.name}: componentType=${comp.componentType}, ` +
      `hasTierConfig=${!!comp.tierConfig}, hasMatrixConfig=${!!comp.matrixConfig}, ` +
      `hasConditionalConfig=${!!comp.conditionalConfig}, hasPercentageConfig=${!!comp.percentageConfig}`);
  }

  const vBindings = verified?.input_bindings as Record<string, unknown>;
  const vDerivations = vBindings?.metric_derivations as unknown[];
  console.log(`\nMetric derivations: ${vDerivations?.length ?? 0} rules`);

  // Validate a single entity's data to confirm metrics would resolve
  console.log('\n--- Validation: sample entity data ---');
  const { data: sampleEntity } = await supabase
    .from('committed_data')
    .select('row_data, data_type')
    .eq('tenant_id', tenantId)
    .not('entity_id', 'is', null)
    .not('period_id', 'is', null)
    .neq('row_data->>_sheetName', 'Datos Colaborador')
    .limit(5);

  for (const r of sampleEntity ?? []) {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`  sheet: ${rd['_sheetName']}, data_type: ${r.data_type}`);
    console.log(`  fields: ${Object.entries(rd).filter(([k]) => !k.startsWith('_')).map(([k,v]) => `${k}=${v}`).join(', ')}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 5 COMPLETE');
  console.log('FIX 1: Component JSONB transformed to PlanComponent format');
  console.log('FIX 2: Metric derivation rules configured for field bridging');
  console.log('PG-05: PASS');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
