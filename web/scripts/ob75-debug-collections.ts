import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const JAN_PERIOD_ID = 'c90ae99f-cfd6-4346-8ae1-8373f9cab116';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // 1. Check what sheets exist and how many rows have null entity_id
  console.log('=== DATA TYPES & NULL ENTITY COUNTS ===\n');
  const dataTypes = ['Base_Venta_Individual', 'Base_Venta_Tienda', 'Base_Clientes_Nuevos',
    'Base_Cobranza', 'Base_Club_Proteccion', 'Base_Garantia_Extendida', 'Datos Colaborador'];

  for (const dt of dataTypes) {
    // Count total
    let totalCount = 0;
    let page = 0;
    while (true) {
      const { data } = await supabase
        .from('committed_data')
        .select('entity_id')
        .eq('tenant_id', TENANT_ID)
        .eq('period_id', JAN_PERIOD_ID)
        .eq('data_type', dt)
        .range(page * 1000, page * 1000 + 999);
      if (!data || data.length === 0) break;
      totalCount += data.length;
      if (data.length < 1000) break;
      page++;
    }

    // Count null entity
    const { data: nullRows } = await supabase
      .from('committed_data')
      .select('entity_id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', JAN_PERIOD_ID)
      .eq('data_type', dt)
      .is('entity_id', null)
      .limit(1000);

    console.log(`  ${dt}: ${totalCount} total, ${nullRows?.length ?? 0} with null entity_id`);
  }

  // 2. Sample Base_Cobranza rows (check if entity-level or store-level)
  console.log('\n=== SAMPLE Base_Cobranza ROWS ===\n');
  const { data: cobranzaRows } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .eq('data_type', 'Base_Cobranza')
    .limit(5);

  for (const r of (cobranzaRows ?? [])) {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`  entity_id=${r.entity_id}`);
    console.log(`  keys: ${Object.keys(rd).join(', ')}`);
    console.log(`  sample values:`, JSON.stringify(rd).slice(0, 300));
    console.log();
  }

  // 3. Sample Datos Colaborador to see store ID field name
  console.log('=== SAMPLE Datos Colaborador ROWS (store ID fields) ===\n');
  const { data: rosterRows } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .eq('data_type', 'Datos Colaborador')
    .not('entity_id', 'is', null)
    .limit(5);

  for (const r of (rosterRows ?? [])) {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`  entity_id=${r.entity_id}`);
    console.log(`  keys: ${Object.keys(rd).join(', ')}`);
    // Look for any store-related keys
    const storeKeys = Object.keys(rd).filter(k =>
      k.toLowerCase().includes('tienda') || k.toLowerCase().includes('store') ||
      k.toLowerCase().includes('sucursal') || k.toLowerCase().includes('ubicacion') ||
      k.toLowerCase().includes('no_')
    );
    console.log(`  store-related keys: ${storeKeys.join(', ') || 'NONE FOUND'}`);
    for (const sk of storeKeys) {
      console.log(`    ${sk} = ${rd[sk]}`);
    }
    console.log();
  }

  // 4. Check AI context for Collections mapping
  console.log('=== AI CONTEXT SHEET MAPPINGS ===\n');
  const { data: batch } = await supabase
    .from('import_batches')
    .select('metadata')
    .eq('id', '24dfad4b-fa4e-4e34-b81d-5c05a3aaad9d')
    .single();

  const meta = batch?.metadata as Record<string, unknown> | null;
  const aiCtx = meta?.ai_context as { sheets?: Array<{ sheetName: string; matchedComponent: string | null }> } | undefined;
  for (const s of (aiCtx?.sheets ?? [])) {
    console.log(`  "${s.sheetName}" → "${s.matchedComponent}"`);
  }

  // 5. Check Base_Venta_Tienda (store sales) - is this also store-level?
  console.log('\n=== SAMPLE Base_Venta_Tienda ROWS ===\n');
  const { data: storeRows } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .eq('data_type', 'Base_Venta_Tienda')
    .limit(5);

  for (const r of (storeRows ?? [])) {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`  entity_id=${r.entity_id}`);
    console.log(`  keys: ${Object.keys(rd).join(', ')}`);
    console.log(`  sample:`, JSON.stringify(rd).slice(0, 300));
    console.log();
  }

  // 6. Check the plan component config for Collections
  console.log('=== COLLECTIONS INCENTIVE COMPONENT CONFIG ===\n');
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('id', 'a7c1ae18-e119-4256-aa64-1227b054b563')
    .single();

  const componentsJson = ruleSet?.components as Record<string, unknown>;
  const variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
  const components = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];

  for (const comp of components) {
    if ((comp.name as string).toLowerCase().includes('collection')) {
      console.log(`  Name: ${comp.name}`);
      console.log(`  Type: ${comp.componentType}`);
      console.log(`  Config:`, JSON.stringify(comp.tierConfig || comp.percentageConfig || comp.matrixConfig || comp.conditionalConfig, null, 2));
    }
  }
}

run().catch(console.error);
