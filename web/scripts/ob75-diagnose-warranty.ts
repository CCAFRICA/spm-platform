import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const JAN_PERIOD_ID = 'c90ae99f-cfd6-4346-8ae1-8373f9cab116';
const RULE_SET_ID = 'a7c1ae18-e119-4256-aa64-1227b054b563';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // 1. Check plan component configs
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('id', RULE_SET_ID)
    .single();

  const componentsJson = ruleSet?.components as Record<string, unknown>;
  const variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
  const components = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];

  console.log('=== PLAN COMPONENT CONFIGS ===\n');
  for (const comp of components) {
    console.log(`${comp.name} (${comp.componentType}):`);
    if (comp.percentageConfig) {
      console.log(`  percentageConfig:`, JSON.stringify(comp.percentageConfig));
    }
    if (comp.conditionalConfig) {
      console.log(`  conditionalConfig:`, JSON.stringify(comp.conditionalConfig));
    }
    if (comp.tierConfig) {
      const tc = comp.tierConfig as { metric: string; tiers: unknown[] };
      console.log(`  tierConfig: metric=${tc.metric}, ${tc.tiers.length} tiers`);
    }
    if (comp.matrixConfig) {
      const mc = comp.matrixConfig as { rowMetric: string; columnMetric: string };
      console.log(`  matrixConfig: row=${mc.rowMetric}, col=${mc.columnMetric}`);
    }
    console.log();
  }

  // 2. Sample warranty data
  console.log('=== SAMPLE WARRANTY (Base_Garantia_Extendida) ROWS ===\n');
  const { data: warrantyRows } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .eq('data_type', 'Base_Garantia_Extendida')
    .not('entity_id', 'is', null)
    .limit(5);

  for (const r of (warrantyRows ?? [])) {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`  entity=${r.entity_id}`);
    console.log(`  keys: ${Object.keys(rd).join(', ')}`);
    console.log(`  values: ${JSON.stringify(rd)}`);
    console.log();
  }

  // 3. Count unique entities per sheet for January
  console.log('=== UNIQUE ENTITIES PER SHEET (January 2024) ===\n');
  const sheets = ['Base_Venta_Individual', 'Base_Club_Proteccion', 'Base_Garantia_Extendida'];

  for (const sheet of sheets) {
    const allEntities = new Set<string>();
    let page = 0;
    while (true) {
      const { data } = await supabase
        .from('committed_data')
        .select('entity_id')
        .eq('tenant_id', TENANT_ID)
        .eq('period_id', JAN_PERIOD_ID)
        .eq('data_type', sheet)
        .not('entity_id', 'is', null)
        .range(page * 1000, page * 1000 + 999);

      if (!data || data.length === 0) break;
      for (const r of data) if (r.entity_id) allEntities.add(r.entity_id);
      if (data.length < 1000) break;
      page++;
    }
    console.log(`  ${sheet}: ${allEntities.size} unique entities`);
  }

  // 4. Sample insurance data
  console.log('\n=== SAMPLE INSURANCE (Base_Club_Proteccion) ROWS ===\n');
  const { data: insRows } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .eq('data_type', 'Base_Club_Proteccion')
    .not('entity_id', 'is', null)
    .limit(3);

  for (const r of (insRows ?? [])) {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`  entity=${r.entity_id}`);
    console.log(`  values: ${JSON.stringify(rd)}`);
    console.log();
  }
}

run().catch(console.error);
