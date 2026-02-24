/**
 * OB-85 R6 Phase 0: Trace the optical matrix column metric resolution
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

async function trace() {
  // 0A: Get the plan's Optical component definition
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name, components')
    .eq('id', '04edaaf0-7e44-4cf3-851b-bedfc6ec7e93')
    .single();

  if (!ruleSet) {
    console.log('Rule set not found!');
    return;
  }

  const componentsJson = ruleSet.components as Record<string, unknown>;
  const variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];

  console.log('=== RULE SET VARIANTS ===');
  for (const variant of variants) {
    console.log(`\nVariant: ${variant.variantName}`);
    const comps = (variant.components as Array<Record<string, unknown>>) ?? [];
    for (const comp of comps) {
      console.log(`  ${comp.name} [${comp.evaluatorType}]`);
      if (comp.matrixConfig) {
        const mc = comp.matrixConfig as Record<string, unknown>;
        console.log(`    rowMetric: ${mc.rowMetric}`);
        console.log(`    columnMetric: ${mc.columnMetric}`);
        console.log(`    rowBands: ${JSON.stringify(mc.rowBands)}`);
        console.log(`    columnBands: ${JSON.stringify(mc.columnBands)}`);
        console.log(`    payoutMatrix (first 2 rows): ${JSON.stringify((mc.payoutMatrix as number[][])?.slice(0, 2))}`);
      }
    }
  }

  // 0B: Get Jan 2024 period
  const { data: periods } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', TENANT)
    .gte('start_date', '2024-01-01')
    .lt('start_date', '2024-02-01');
  const periodId = periods?.[0]?.id;

  // 0C: Check Base_Venta_Tienda store data for store 388 (entity 93515855's store)
  console.log('\n=== BASE_VENTA_TIENDA (Store-Level Data) ===');
  const PAGE = 1000;
  const storeRows: Array<{ entity_id: string | null; data_type: string; row_data: Record<string, unknown> }> = [];
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id, data_type, row_data')
      .eq('tenant_id', TENANT)
      .eq('period_id', periodId!)
      .eq('data_type', 'Base_Venta_Tienda')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    storeRows.push(...(data as typeof storeRows));
    if (data.length < PAGE) break;
    page++;
  }

  console.log(`Total Base_Venta_Tienda rows: ${storeRows.length}`);
  console.log(`Entity-level: ${storeRows.filter(r => r.entity_id).length}`);
  console.log(`Store-level (null entity_id): ${storeRows.filter(r => !r.entity_id).length}`);

  // Show sample
  if (storeRows.length > 0) {
    const sample = storeRows[0];
    console.log(`\nSample fields: ${Object.keys(sample.row_data).join(', ')}`);
    console.log(`Sample: ${JSON.stringify(sample.row_data, null, 2)}`);
  }

  // Find store 388's data
  const store388 = storeRows.filter(r => {
    const rd = r.row_data;
    return String(rd?.No_Tienda ?? rd?.storeId ?? rd?.store) === '388';
  });
  console.log(`\nStore 388 rows: ${store388.length}`);
  for (const row of store388) {
    console.log(`  entity_id=${row.entity_id}, data: ${JSON.stringify(row.row_data)}`);
  }

  // Find store 298's data (entity 92686541 from CLT-14B)
  const store298 = storeRows.filter(r => {
    const rd = r.row_data;
    return String(rd?.No_Tienda ?? rd?.storeId ?? rd?.store) === '298';
  });
  console.log(`\nStore 298 rows: ${store298.length}`);
  for (const row of store298.slice(0, 2)) {
    console.log(`  entity_id=${row.entity_id}, data: ${JSON.stringify(row.row_data)}`);
  }

  // 0D: Check Base_Venta_Individual for entity 93515855
  console.log('\n=== BASE_VENTA_INDIVIDUAL for Entity 93515855 ===');
  // First get the UUID
  let entityUuid: string | null = null;
  let entityStoreId: string | null = null;
  page = 0;
  while (!entityUuid) {
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', TENANT)
      .eq('period_id', periodId!)
      .eq('data_type', 'Datos Colaborador')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const rd = row.row_data as Record<string, unknown>;
      if (String(rd?.entityId ?? rd?.num_empleado) === '93515855') {
        entityUuid = row.entity_id;
        entityStoreId = String(rd?.No_Tienda ?? rd?.storeId ?? '');
        break;
      }
    }
    if (data.length < PAGE) break;
    page++;
  }
  console.log(`UUID: ${entityUuid}, Store: ${entityStoreId}`);

  // Get Venta Individual for this entity
  const { data: ventaIndData } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('entity_id', entityUuid!)
    .eq('data_type', 'Base_Venta_Individual');

  if (ventaIndData && ventaIndData.length > 0) {
    for (const row of ventaIndData) {
      console.log(`  ${JSON.stringify(row.row_data)}`);
    }
  } else {
    console.log('  No Base_Venta_Individual data found');
  }

  // 0E: Check Datos Colaborador for Rango_Tienda field
  console.log('\n=== DATOS COLABORADOR — Rango_Tienda Field ===');
  const { data: rosterData } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('entity_id', entityUuid!)
    .eq('data_type', 'Datos Colaborador');

  if (rosterData && rosterData.length > 0) {
    const rd = rosterData[0].row_data as Record<string, unknown>;
    console.log(`All fields: ${Object.keys(rd).join(', ')}`);
    console.log(`Rango_Tienda: ${rd?.Rango_Tienda ?? rd?.rango_tienda ?? rd?.store_band ?? 'NOT FOUND'}`);
    console.log(`storeId/No_Tienda: ${rd?.storeId ?? rd?.No_Tienda}`);
    console.log(`Full row_data: ${JSON.stringify(rd, null, 2)}`);
  }

  // 0F: What does the aggregateMetrics function produce from entity 93515855's data?
  console.log('\n=== WHAT METRICS DOES buildMetricsForComponent SEE? ===');
  // Simulate: fetch all committed_data for this entity
  const { data: allEntityData } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('entity_id', entityUuid!);

  const entitySheetData = new Map<string, Array<{ row_data: unknown }>>();
  for (const row of allEntityData ?? []) {
    if (!entitySheetData.has(row.data_type)) entitySheetData.set(row.data_type, []);
    entitySheetData.get(row.data_type)!.push({ row_data: row.row_data });
  }
  console.log(`Entity sheets: ${Array.from(entitySheetData.keys()).join(', ')}`);

  // Simulate aggregateMetrics for each entity sheet
  for (const [sheet, rows] of Array.from(entitySheetData.entries())) {
    console.log(`\n  Sheet: ${sheet}`);
    const metrics: Record<string, number> = {};
    for (const row of rows) {
      const rd = row.row_data as Record<string, unknown>;
      for (const [key, value] of Object.entries(rd)) {
        if (typeof value === 'number' && !key.startsWith('_') && key !== 'date') {
          metrics[key] = (metrics[key] ?? 0) + value;
        }
      }
    }
    console.log(`  Numeric fields: ${JSON.stringify(metrics)}`);
  }

  // 0G: What store data does the entity see via storeId resolution?
  console.log('\n=== STORE DATA FOR STORE ' + entityStoreId + ' ===');
  const storeDataBySheet = new Map<string, Array<{ row_data: unknown }>>();
  const storeSheetTypes = ['Base_Venta_Tienda', 'Base_Clientes_Nuevos', 'Base_Cobranza'];
  for (const sheetType of storeSheetTypes) {
    const matchingRows = storeRows.filter(r => {
      if (r.data_type !== sheetType) return false;
      const rd = r.row_data;
      return String(rd?.No_Tienda ?? rd?.storeId ?? '') === entityStoreId;
    });
    // Also check all committed_data for this store
    if (matchingRows.length === 0) {
      const { data: storeSheetRows } = await supabase
        .from('committed_data')
        .select('row_data')
        .eq('tenant_id', TENANT)
        .eq('period_id', periodId!)
        .eq('data_type', sheetType)
        .is('entity_id', null)
        .limit(5);
      // Filter by store
      const filtered = (storeSheetRows ?? []).filter(r => {
        const rd = r.row_data as Record<string, unknown>;
        return String(rd?.No_Tienda ?? rd?.storeId ?? '') === entityStoreId;
      });
      if (filtered.length > 0) {
        storeDataBySheet.set(sheetType, filtered.map(r => ({ row_data: r.row_data })));
      }
    } else {
      storeDataBySheet.set(sheetType, matchingRows.map(r => ({ row_data: r.row_data })));
    }
  }

  for (const [sheet, rows] of Array.from(storeDataBySheet.entries())) {
    console.log(`\n  Store sheet: ${sheet} (${rows.length} rows)`);
    for (const row of rows) {
      const rd = row.row_data as Record<string, unknown>;
      const numericFields: Record<string, number> = {};
      for (const [key, value] of Object.entries(rd)) {
        if (typeof value === 'number' && !key.startsWith('_') && key !== 'date') {
          numericFields[key] = value;
        }
      }
      console.log(`  Numeric: ${JSON.stringify(numericFields)}`);
    }
  }

  // 0H: What does the engine log say about the column metric for this entity?
  console.log('\n=== LATEST CALCULATION RESULT FOR 93515855 ===');
  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('id')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .limit(1);

  if (batches && batches.length > 0) {
    const { data: results } = await supabase
      .from('calculation_results')
      .select('total_payout, components')
      .eq('batch_id', batches[0].id)
      .eq('entity_id', entityUuid!);

    if (results && results.length > 0) {
      const comps = Array.isArray(results[0].components) ? results[0].components : [];
      for (const c of comps) {
        const comp = c as Record<string, unknown>;
        if (String(comp.componentName ?? '').includes('Optical')) {
          console.log(`\n  Component: ${comp.componentName}`);
          console.log(`  Payout: MX$${comp.payout}`);
          console.log(`  Evaluator: ${comp.evaluatorType}`);
          console.log(`  Metrics: ${JSON.stringify(comp.metrics)}`);
          console.log(`  Details: ${JSON.stringify(comp.details)}`);
        }
      }
    }
  }
}

trace().catch(console.error);
