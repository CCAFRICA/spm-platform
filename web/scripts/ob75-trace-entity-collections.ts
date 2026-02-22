import { createClient } from '@supabase/supabase-js';
import {
  findMatchingSheet,
  buildMetricsForComponent,
  evaluateComponent,
  aggregateMetrics,
  type AIContextSheet,
} from '../src/lib/calculation/run-calculation';
import type { PlanComponent } from '../src/types/compensation-plan';
import type { Json } from '../src/lib/supabase/database.types';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const JAN_PERIOD_ID = 'c90ae99f-cfd6-4346-8ae1-8373f9cab116';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Pick an entity from the roster (first one with storeId=1)
  const { data: rosterRow } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .eq('data_type', 'Datos Colaborador')
    .not('entity_id', 'is', null)
    .limit(1)
    .single();

  if (!rosterRow || !rosterRow.entity_id) {
    console.log('No roster row found');
    return;
  }

  const entityId = rosterRow.entity_id;
  const rd = rosterRow.row_data as Record<string, unknown>;
  const storeId = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
  console.log(`=== TRACING ENTITY ${entityId} ===`);
  console.log(`Store ID: ${storeId} (type: ${typeof storeId})`);
  console.log();

  // Fetch ALL data for this entity
  const { data: entityRows } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .eq('entity_id', entityId);

  console.log(`Entity has ${entityRows?.length ?? 0} data rows:`);
  const entitySheets = new Map<string, Array<{ row_data: Json }>>();
  for (const r of (entityRows ?? [])) {
    const sheet = r.data_type || '_unknown';
    if (!entitySheets.has(sheet)) entitySheets.set(sheet, []);
    entitySheets.get(sheet)!.push({ row_data: r.row_data as Json });
    console.log(`  ${sheet}: ${JSON.stringify(r.row_data).slice(0, 100)}`);
  }
  console.log(`  Entity sheets: ${Array.from(entitySheets.keys()).join(', ')}`);

  // Fetch store-level data for this storeId
  console.log(`\n=== STORE DATA for storeId=${storeId} ===`);
  const { data: storeRows } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .is('entity_id', null)
    .limit(1000);

  // Group by store and sheet
  const storeDataMap = new Map<string | number, Map<string, Array<{ row_data: Json }>>>();
  for (const r of (storeRows ?? [])) {
    const srd = r.row_data as Record<string, unknown> | null;
    const sk = (srd?.['storeId'] ?? srd?.['num_tienda'] ?? srd?.['No_Tienda'] ?? srd?.['Tienda']) as string | number | undefined;
    if (sk === undefined) continue;
    if (!storeDataMap.has(sk)) storeDataMap.set(sk, new Map());
    const storeSheets = storeDataMap.get(sk)!;
    const sheet = r.data_type || '_unknown';
    if (!storeSheets.has(sheet)) storeSheets.set(sheet, []);
    storeSheets.get(sheet)!.push({ row_data: r.row_data as Json });
  }

  const thisStoreData = storeDataMap.get(storeId as string | number);
  if (!thisStoreData) {
    console.log(`  NO STORE DATA FOUND for storeId=${storeId} (type: ${typeof storeId})`);
    console.log(`  Available store keys: ${Array.from(storeDataMap.keys()).slice(0, 20).join(', ')}...`);
    console.log(`  Types of store keys: ${Array.from(storeDataMap.keys()).slice(0, 5).map(k => `${k}(${typeof k})`).join(', ')}`);
  } else {
    for (const [sheet, rows] of Array.from(thisStoreData.entries())) {
      console.log(`  ${sheet}: ${rows.length} rows`);
      if (sheet.toLowerCase().includes('cobranza')) {
        for (const r of rows) {
          console.log(`    Data: ${JSON.stringify(r.row_data).slice(0, 200)}`);
        }
      }
    }
  }

  // AI context
  const { data: batch } = await supabase
    .from('import_batches')
    .select('metadata')
    .eq('id', '24dfad4b-fa4e-4e34-b81d-5c05a3aaad9d')
    .single();
  const meta = batch?.metadata as Record<string, unknown> | null;
  const aiCtx = meta?.ai_context as { sheets?: AIContextSheet[] } | undefined;
  const aiSheets = aiCtx?.sheets ?? [];

  // Test sheet matching for Collections
  console.log('\n=== SHEET MATCHING FOR COLLECTIONS ===');
  const entitySheetList = Array.from(entitySheets.keys());
  const entityMatch = findMatchingSheet('Collections Incentive', entitySheetList, aiSheets);
  console.log(`  Entity-level match: ${entityMatch ?? 'null'}`);

  if (thisStoreData) {
    const storeSheetList = Array.from(thisStoreData.keys());
    const storeMatch = findMatchingSheet('Collections Incentive', storeSheetList, aiSheets);
    console.log(`  Store-level match: ${storeMatch ?? 'null'} (store sheets: ${storeSheetList.join(', ')})`);
  }

  // Now test buildMetricsForComponent
  console.log('\n=== BUILD METRICS FOR COLLECTIONS ===');
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('id', 'a7c1ae18-e119-4256-aa64-1227b054b563')
    .single();
  const cJson = ruleSet?.components as Record<string, unknown>;
  const variants = (cJson?.variants as Array<Record<string, unknown>>) ?? [];
  const components = (variants[0]?.components as PlanComponent[]) ?? [];
  const collectionsComp = components.find(c => c.name.toLowerCase().includes('collection'));

  if (collectionsComp) {
    console.log(`  Component: ${collectionsComp.name} (${collectionsComp.componentType})`);
    const metrics = buildMetricsForComponent(collectionsComp, entitySheets, thisStoreData, aiSheets);
    console.log(`  Resolved metrics: ${JSON.stringify(metrics)}`);
    const result = evaluateComponent(collectionsComp, metrics);
    console.log(`  Payout: ${result.payout}`);
    console.log(`  Details: ${JSON.stringify(result.details)}`);
  }
}

run().catch(console.error);
