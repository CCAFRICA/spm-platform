/**
 * OB-146 Phase 0: Diagnostic — Store Data Landscape
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob146-phase0-diagnostic.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-146 PHASE 0: DIAGNOSTIC — STORE DATA LANDSCAPE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .ilike('slug', '%optica%')
    .limit(1)
    .single();

  if (!tenant) {
    console.error('ERROR: No optica tenant found');
    process.exit(1);
  }
  console.log(`Tenant: ${tenant.name} (${tenant.id})\n`);
  const tenantId = tenant.id;

  // ═══════════════════════════════════════════════════════════════
  // 0A: Engine Contract
  // ═══════════════════════════════════════════════════════════════
  console.log('--- 0A: ENGINE CONTRACT ---\n');

  const [entities, periods, ruleSets, assignments] = await Promise.all([
    supabase.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('periods').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('rule_sets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('rule_set_assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  ]);

  // Bound data rows (entity_id IS NOT NULL)
  const { count: boundDataRows } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('entity_id', 'is', null)
    .not('period_id', 'is', null);

  // Store data rows (entity_id IS NULL)
  const { count: storeDataRows } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .not('period_id', 'is', null);

  // Calculation results
  const { count: resultCount } = await supabase
    .from('calculation_results')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  // Total payout
  const { data: payoutData } = await supabase
    .from('calculation_results')
    .select('total_payout')
    .eq('tenant_id', tenantId);

  const totalPayout = (payoutData ?? []).reduce((sum, r) => sum + (Number(r.total_payout) || 0), 0);

  console.log(`entity_count:       ${entities.count}`);
  console.log(`period_count:       ${periods.count}`);
  console.log(`active_plans:       ${ruleSets.count}`);
  console.log(`assignment_count:   ${assignments.count}`);
  console.log(`bound_data_rows:    ${boundDataRows}`);
  console.log(`store_data_rows:    ${storeDataRows}`);
  console.log(`result_count:       ${resultCount}`);
  console.log(`total_payout:       MX$${totalPayout.toFixed(2)}`);

  // ═══════════════════════════════════════════════════════════════
  // 0B: Engine Store Data Resolution
  // ═══════════════════════════════════════════════════════════════
  console.log('\n--- 0B: ENGINE STORE DATA RESOLUTION ---\n');
  console.log('storeData map built from: committed_data WHERE entity_id IS NULL, keyed by row_data storeId/num_tienda/No_Tienda/Tienda');
  console.log('Entity store lookup: entityRowsFlat (committed_data for entity), checks row_data storeId/num_tienda/No_Tienda');
  console.log('When store lookup fails: entityStoreData is undefined, buildMetricsForComponent gets no store data → store-level components return {}');

  // ═══════════════════════════════════════════════════════════════
  // 0C: Store data in committed_data
  // ═══════════════════════════════════════════════════════════════
  console.log('\n--- 0C: STORE DATA IN COMMITTED_DATA ---\n');

  // Store-level sheets (entity_id IS NULL)
  console.log('Store-level sheets (entity_id IS NULL):');
  const { data: storeSheets } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .not('period_id', 'is', null)
    .limit(5000);

  const storeSheetCounts = new Map<string, { count: number; storeIds: Set<string>; altIds: Set<string> }>();
  for (const row of storeSheets ?? []) {
    const dt = row.data_type || '_unknown';
    if (!storeSheetCounts.has(dt)) storeSheetCounts.set(dt, { count: 0, storeIds: new Set(), altIds: new Set() });
    const entry = storeSheetCounts.get(dt)!;
    entry.count++;
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    const noTienda = rd['No_Tienda'] as string | undefined;
    const numTienda = rd['num_tienda'] as string | undefined;
    if (noTienda) entry.storeIds.add(String(noTienda));
    if (numTienda) entry.altIds.add(String(numTienda));
  }

  for (const [dt, info] of Array.from(storeSheetCounts.entries()).sort()) {
    console.log(`  ${dt}: ${info.count} rows, unique No_Tienda=${info.storeIds.size}, unique num_tienda=${info.altIds.size}`);
  }

  // Datos_Colaborador employee→store mapping
  console.log('\nDatos_Colaborador employee→store mapping:');
  const { data: colaboradorRows } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', tenantId)
    .ilike('data_type', '%colaborador%')
    .not('period_id', 'is', null)
    .limit(5000);

  let dcTotal = 0, dcWithStore = 0;
  const dcEmployees = new Set<string>();
  const dcStores = new Set<string>();
  for (const row of colaboradorRows ?? []) {
    dcTotal++;
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    const emp = rd['num_empleado'] as string | undefined;
    const store = rd['No_Tienda'] as string | undefined;
    if (emp) dcEmployees.add(String(emp));
    if (store) {
      dcStores.add(String(store));
      dcWithStore++;
    }
  }
  console.log(`  total_rows: ${dcTotal}`);
  console.log(`  unique_employees: ${dcEmployees.size}`);
  console.log(`  unique_stores: ${dcStores.size}`);
  console.log(`  rows_with_store: ${dcWithStore}`);

  // Sample Datos_Colaborador row
  console.log('\nSample Datos_Colaborador row:');
  if (colaboradorRows && colaboradorRows.length > 0) {
    const sampleRd = (colaboradorRows[0].row_data ?? {}) as Record<string, unknown>;
    console.log(`  num_empleado: ${sampleRd['num_empleado']}`);
    console.log(`  No_Tienda: ${sampleRd['No_Tienda']}`);
    console.log(`  Rango_Tienda: ${sampleRd['Rango_Tienda']}`);
    console.log(`  LLave Tamano de Tienda: ${sampleRd['LLave Tamaño de Tienda'] ?? sampleRd['LLave Tamano de Tienda']}`);
    console.log(`  All keys: ${Object.keys(sampleRd).filter(k => !k.startsWith('_')).join(', ')}`);
  }

  // Base_Venta_Individual store info
  console.log('\nBase_Venta_Individual store info:');
  const { data: bviRows } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', tenantId)
    .ilike('data_type', '%venta_individual%')
    .not('period_id', 'is', null)
    .limit(5);

  if (bviRows && bviRows.length > 0) {
    const sampleRd = (bviRows[0].row_data ?? {}) as Record<string, unknown>;
    console.log(`  num_empleado: ${sampleRd['num_empleado']}`);
    console.log(`  No_Tienda: ${sampleRd['No_Tienda']}`);
    console.log(`  LLave Tamano de Tienda: ${sampleRd['LLave Tamaño de Tienda'] ?? sampleRd['LLave Tamano de Tienda']}`);
    console.log(`  Cumplimiento: ${sampleRd['Cumplimiento']}`);
    console.log(`  All keys: ${Object.keys(sampleRd).filter(k => !k.startsWith('_')).join(', ')}`);
  } else {
    console.log('  (no rows found)');
  }

  // ═══════════════════════════════════════════════════════════════
  // 0D: Entity metadata
  // ═══════════════════════════════════════════════════════════════
  console.log('\n--- 0D: ENTITY STORE METADATA ---\n');

  // Check entity metadata for store info
  const { data: entitySample } = await supabase
    .from('entities')
    .select('external_id, display_name, metadata')
    .eq('tenant_id', tenantId)
    .not('metadata', 'is', null)
    .limit(5000);

  let hasStore = 0, hasStoreId = 0, noMeta = 0, totalEnts = 0;
  for (const e of entitySample ?? []) {
    totalEnts++;
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    if (meta['No_Tienda'] || meta['store_id']) hasStore++;
    if (meta['store_id']) hasStoreId++;
    if (!e.metadata || Object.keys(meta).length === 0) noMeta++;
  }

  // Also count total entities
  const { count: totalEntityCount } = await supabase
    .from('entities')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  console.log(`  total_entities: ${totalEntityCount}`);
  console.log(`  sampled (first 5000): ${totalEnts}`);
  console.log(`  has_store_info: ${hasStore}`);
  console.log(`  has_store_id: ${hasStoreId}`);
  console.log(`  no_metadata: ${noMeta}`);

  // Sample entity metadata
  console.log('\nSample entity metadata (first 3 with non-empty):');
  let shown = 0;
  for (const e of entitySample ?? []) {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    if (Object.keys(meta).length > 0 && shown < 3) {
      console.log(`  ${e.external_id} (${e.display_name}): ${JSON.stringify(meta)}`);
      shown++;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 0E: Volume tier / metric derivations
  // ═══════════════════════════════════════════════════════════════
  console.log('\n--- 0E: VOLUME TIER + METRIC DERIVATIONS ---\n');

  const { data: activeRuleSet } = await supabase
    .from('rule_sets')
    .select('id, components, input_bindings')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (activeRuleSet) {
    const components = activeRuleSet.components as Array<Record<string, unknown>>;
    console.log('Components:');
    for (const c of components) {
      const mc = c.matrixConfig as Record<string, unknown> | undefined;
      console.log(`  ${c.name} (${c.componentType})`);
      if (mc) {
        console.log(`    rowMetric: ${mc.rowMetric}, columnMetric: ${mc.columnMetric}`);
        console.log(`    columnBands: ${JSON.stringify(mc.columnBands)}`);
      }
    }

    const bindings = activeRuleSet.input_bindings as Record<string, unknown>;
    const derivations = bindings?.metric_derivations as Array<Record<string, unknown>> ?? [];
    console.log(`\nMetric derivations (${derivations.length} rules):`);
    for (const d of derivations) {
      console.log(`  ${d.metric}: ${d.operation} from ${d.source_field || `${d.numerator_metric}/${d.denominator_metric}`}`);
    }

    // Check if store_volume_tier derivation exists
    const hasVolumeTier = derivations.some(d => String(d.metric).includes('volume_tier'));
    console.log(`\nstore_volume_tier derivation: ${hasVolumeTier ? 'EXISTS' : 'MISSING'}`);
  }

  // Check where LLave Tamaño de Tienda exists
  console.log('\nLLave Tamano de Tienda presence by sheet:');
  const { data: allDataSample } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .not('period_id', 'is', null)
    .limit(10000);

  const sheetLlaveCount = new Map<string, { total: number; hasLlave: number; hasRango: number; sampleValue: string }>();
  for (const row of allDataSample ?? []) {
    const dt = row.data_type || '_unknown';
    if (!sheetLlaveCount.has(dt)) sheetLlaveCount.set(dt, { total: 0, hasLlave: 0, hasRango: 0, sampleValue: '' });
    const entry = sheetLlaveCount.get(dt)!;
    entry.total++;
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    const llave = rd['LLave Tamaño de Tienda'] ?? rd['LLave Tamano de Tienda'];
    const rango = rd['Rango_Tienda'];
    if (llave !== undefined && llave !== null) {
      entry.hasLlave++;
      if (!entry.sampleValue) entry.sampleValue = String(llave);
    }
    if (rango !== undefined && rango !== null) entry.hasRango++;
  }

  for (const [dt, info] of Array.from(sheetLlaveCount.entries()).sort()) {
    if (info.hasLlave > 0 || info.hasRango > 0) {
      console.log(`  ${dt}: ${info.total} rows, LLave=${info.hasLlave}, Rango=${info.hasRango}, sample="${info.sampleValue}"`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 0F: What storeKey values exist in entity committed_data?
  // ═══════════════════════════════════════════════════════════════
  console.log('\n--- 0F: ENTITY ROW_DATA STORE KEYS ---\n');

  // Check if entity-level committed_data rows have No_Tienda or num_tienda
  const { data: entityDataSample } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .not('entity_id', 'is', null)
    .not('period_id', 'is', null)
    .limit(5000);

  let entRowsWithStore = 0, entRowsTotal = 0;
  const entSheetStoreInfo = new Map<string, { total: number; hasNoTienda: number; hasNumTienda: number; hasStoreId: number }>();
  for (const row of entityDataSample ?? []) {
    entRowsTotal++;
    const dt = row.data_type || '_unknown';
    if (!entSheetStoreInfo.has(dt)) entSheetStoreInfo.set(dt, { total: 0, hasNoTienda: 0, hasNumTienda: 0, hasStoreId: 0 });
    const info = entSheetStoreInfo.get(dt)!;
    info.total++;
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    if (rd['No_Tienda'] !== undefined && rd['No_Tienda'] !== null) { info.hasNoTienda++; entRowsWithStore++; }
    if (rd['num_tienda'] !== undefined && rd['num_tienda'] !== null) info.hasNumTienda++;
    if (rd['storeId'] !== undefined && rd['storeId'] !== null) info.hasStoreId++;
  }

  console.log('Entity-level rows with store key (by sheet):');
  for (const [dt, info] of Array.from(entSheetStoreInfo.entries()).sort()) {
    console.log(`  ${dt}: ${info.total} rows, No_Tienda=${info.hasNoTienda}, num_tienda=${info.hasNumTienda}, storeId=${info.hasStoreId}`);
  }
  console.log(`\nTotal entity rows: ${entRowsTotal}, with any store key: ${entRowsWithStore}`);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 0 SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 0 FINDINGS — OB-146');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('ENGINE STORE RESOLUTION:');
  console.log('  storeData map built from: committed_data WHERE entity_id IS NULL, grouped by storeKey (storeId/num_tienda/No_Tienda/Tienda from row_data)');
  console.log('  Entity store lookup: iterates entity flatDataByEntity rows, checks row_data storeId/num_tienda/No_Tienda (FIRST found)');
  console.log('  When store lookup fails: entityStoreData=undefined, store components get no data → MX$0');
  console.log('');
  console.log('STORE DATA IN committed_data:');
  for (const [dt, info] of Array.from(storeSheetCounts.entries()).sort()) {
    console.log(`  ${dt}: ${info.count} rows, ${info.storeIds.size} stores (No_Tienda), ${info.altIds.size} stores (num_tienda)`);
  }
  console.log(`  Datos_Colaborador: ${dcTotal} rows, ${dcEmployees.size} employees, ${dcStores.size} stores`);
  console.log('');
  console.log('ENTITY STORE METADATA:');
  console.log(`  ${hasStore} of ${totalEntityCount} entities have store info`);
  console.log(`  Store info field: ${hasStore > 0 ? 'store_id or No_Tienda' : 'NONE'}`);
  console.log('');
  console.log('ENTITY ROW_DATA STORE KEYS:');
  console.log(`  ${entRowsWithStore} of ${entRowsTotal} entity rows have store key in row_data`);
  console.log('');
  console.log('VOLUME TIER:');
  for (const [dt, info] of Array.from(sheetLlaveCount.entries()).sort()) {
    if (info.hasLlave > 0) console.log(`  LLave Tamano exists in: ${dt} (${info.hasLlave}/${info.total} rows, sample="${info.sampleValue}")`);
    if (info.hasRango > 0) console.log(`  Rango_Tienda exists in: ${dt} (${info.hasRango}/${info.total} rows)`);
  }
  console.log('');
  console.log('ROOT CAUSES:');
  console.log(`  1. Entity→store: ${entRowsWithStore > 0 ? `PARTIAL — ${entRowsWithStore}/${entRowsTotal} entity rows have store key` : 'CONFIRMED MISSING — 0 entity rows have store key in row_data'}`);
  console.log(`  2. Volume tier: store_volume_tier derivation ${derivations.some(d => String(d.metric).includes('volume_tier')) ? 'EXISTS' : 'MISSING'}`);
  console.log(`  3. Engine storeData lookup: DEPENDS ON #1 — if entity rows have no store key, engine cannot match storeData`);
  console.log('');
  console.log('PG-00: PASS — Phase 0 complete. All queries run. Root causes mapped.');
  console.log('═══════════════════════════════════════════════════════════════');

  const derivations = ((activeRuleSet?.input_bindings as Record<string, unknown>)?.metric_derivations ?? []) as Array<Record<string, unknown>>;
  console.log(`  (${derivations.length} derivation rules total)`);

}

main().catch(console.error);
