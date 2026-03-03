/**
 * OB-146 Phase 3: Engine Store Lookup Diagnostic + Fix
 *
 * Traces the store lookup for entity 93515855 and identifies
 * the type mismatch between entity num_tienda (number) and
 * store-level No_Tienda (string) in the storeData Map.
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob146-phase3-store-lookup-fix.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-146 PHASE 3: ENGINE STORE LOOKUP DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── 3A: Trace store lookup for entity 93515855 ──
  console.log('--- 3A: Trace entity 93515855 ---\n');

  // Get entity
  const { data: entity } = await supabase
    .from('entities')
    .select('id, external_id, metadata')
    .eq('tenant_id', tenantId)
    .eq('external_id', '93515855')
    .single();

  if (!entity) {
    console.error('Entity 93515855 not found');
    process.exit(1);
  }

  const meta = (entity.metadata ?? {}) as Record<string, unknown>;
  console.log(`Entity ID: ${entity.id}`);
  console.log(`External ID: ${entity.external_id}`);
  console.log(`Metadata store_id: ${meta.store_id} (type: ${typeof meta.store_id})`);
  console.log(`Metadata volume_tier: ${meta.volume_tier}`);
  console.log(`Metadata store_range: ${meta.store_range}`);

  // Get Enero 2024 period
  const { data: periods } = await supabase
    .from('periods')
    .select('id, canonical_key')
    .eq('tenant_id', tenantId);
  const eneroPeriod = (periods ?? []).find(p => p.canonical_key === '2024-01');
  if (!eneroPeriod) { console.error('No Enero 2024 period'); process.exit(1); }

  // Get entity committed_data rows
  const { data: entityRows } = await supabase
    .from('committed_data')
    .select('id, data_type, row_data')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entity.id)
    .eq('period_id', eneroPeriod.id);

  console.log(`\nEntity committed_data rows: ${entityRows?.length ?? 0}`);
  for (const row of entityRows ?? []) {
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    console.log(`  Sheet: ${row.data_type}`);
    console.log(`    num_tienda: ${rd.num_tienda} (type: ${typeof rd.num_tienda})`);
    console.log(`    No_Tienda: ${rd.No_Tienda} (type: ${typeof rd.No_Tienda})`);
    console.log(`    storeId: ${rd.storeId} (type: ${typeof rd.storeId})`);
    console.log(`    store_volume_tier: ${rd.store_volume_tier} (type: ${typeof rd.store_volume_tier})`);
  }

  // Determine what storeKey the engine would resolve
  let engineStoreKey: string | number | undefined;
  for (const row of entityRows ?? []) {
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    const sid = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
    if (sid !== undefined && sid !== null) {
      engineStoreKey = sid as string | number;
      break;
    }
  }
  console.log(`\nEngine would resolve storeKey: ${engineStoreKey} (type: ${typeof engineStoreKey})`);

  // ── Check store-level data ──
  console.log('\n--- Store-level data (entity_id IS NULL) ---\n');

  // Get a sample of store-level data to see the key types
  const { data: storeRows } = await supabase
    .from('committed_data')
    .select('id, data_type, row_data')
    .eq('tenant_id', tenantId)
    .eq('period_id', eneroPeriod.id)
    .is('entity_id', null)
    .limit(50);

  const storeKeyTypes = new Map<string, Set<string>>();
  const storeKeyExamples = new Map<string, string | number>();
  const uniqueStoreKeys = new Set<string>();

  for (const row of storeRows ?? []) {
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    const storeKey = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'] ?? rd['Tienda'];
    if (storeKey !== undefined) {
      const keyField = rd['storeId'] !== undefined ? 'storeId' :
                       rd['num_tienda'] !== undefined ? 'num_tienda' :
                       rd['No_Tienda'] !== undefined ? 'No_Tienda' : 'Tienda';
      const fieldType = typeof storeKey;
      if (!storeKeyTypes.has(keyField)) storeKeyTypes.set(keyField, new Set());
      storeKeyTypes.get(keyField)!.add(fieldType);
      storeKeyExamples.set(`${keyField}:${fieldType}`, storeKey as string | number);
      uniqueStoreKeys.add(String(storeKey));
    }
  }

  console.log(`Store-level rows sampled: ${storeRows?.length ?? 0}`);
  console.log('Store key fields and types found:');
  for (const [field, types] of Array.from(storeKeyTypes.entries())) {
    const example = storeKeyExamples.get(`${field}:${Array.from(types)[0]}`);
    console.log(`  ${field}: types=[${Array.from(types).join(', ')}] example=${example}`);
  }

  // Check if the entity's store has data
  const storeId = String(meta.store_id ?? engineStoreKey ?? '');
  console.log(`\nLooking for store-level data matching storeId: "${storeId}"`);

  // Fetch ALL store-level rows and check for match
  let storePage = 0;
  const allStoreRows: Array<{ data_type: string; row_data: Record<string, unknown> }> = [];
  while (true) {
    const from = storePage * PAGE_SIZE;
    const { data: page } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', eneroPeriod.id)
      .is('entity_id', null)
      .range(from, from + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    allStoreRows.push(...(page as typeof allStoreRows));
    if (page.length < PAGE_SIZE) break;
    storePage++;
  }

  console.log(`Total store-level rows: ${allStoreRows.length}`);

  // Simulate engine storeData map construction and check for type mismatch
  const storeDataMap = new Map<string | number, Map<string, number>>();
  for (const row of allStoreRows) {
    const rd = row.row_data;
    const sk = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'] ?? rd['Tienda'];
    if (sk !== undefined) {
      const key = sk as string | number;
      if (!storeDataMap.has(key)) storeDataMap.set(key, new Map());
      storeDataMap.get(key)!.set(row.data_type, (storeDataMap.get(key)!.get(row.data_type) ?? 0) + 1);
    }
  }

  // Check: does the engine's storeKey match?
  if (engineStoreKey !== undefined) {
    const directMatch = storeDataMap.has(engineStoreKey);
    const stringMatch = storeDataMap.has(String(engineStoreKey));
    const numberMatch = storeDataMap.has(Number(engineStoreKey));
    console.log(`\n=== TYPE MISMATCH ANALYSIS ===`);
    console.log(`Entity storeKey: ${engineStoreKey} (${typeof engineStoreKey})`);
    console.log(`Direct Map.get(): ${directMatch}`);
    console.log(`String coercion Map.get("${engineStoreKey}"): ${stringMatch}`);
    console.log(`Number coercion Map.get(${Number(engineStoreKey)}): ${numberMatch}`);

    if (!directMatch && (stringMatch || numberMatch)) {
      console.log(`\n*** TYPE MISMATCH CONFIRMED ***`);
      console.log(`Entity has ${typeof engineStoreKey}, store data uses ${stringMatch ? 'string' : 'number'}`);
      console.log(`FIX NEEDED: Normalize storeKey to String in engine`);
    } else if (directMatch) {
      console.log(`\nNo type mismatch — store lookup should work directly`);
    } else {
      console.log(`\n*** NO MATCH AT ALL — store data may not exist for this store ***`);
    }
  }

  // Also check: how many unique stores in store data vs entity stores
  const storeDataStores = new Set<string>();
  for (const key of Array.from(storeDataMap.keys())) {
    storeDataStores.add(String(key));
  }

  // Count entities with store, check overlap
  let entitiesWithStore = 0;
  let storeMatchCount = 0;
  const entityStores = new Set<string>();

  let entPage = 0;
  while (true) {
    const from = entPage * PAGE_SIZE;
    const { data: ePage } = await supabase
      .from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', eneroPeriod.id)
      .not('entity_id', 'is', null)
      .range(from, from + PAGE_SIZE - 1);
    if (!ePage || ePage.length === 0) break;

    for (const row of ePage) {
      const rd = (row.row_data ?? {}) as Record<string, unknown>;
      const sid = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
      if (sid !== undefined) {
        const strSid = String(sid);
        entityStores.add(strSid);
        if (storeDataStores.has(strSid)) {
          storeMatchCount++;
        }
        entitiesWithStore++;
      }
    }

    if (ePage.length < PAGE_SIZE) break;
    entPage++;
  }

  console.log(`\n--- Store Coverage ---`);
  console.log(`Unique stores in store-level data: ${storeDataStores.size}`);
  console.log(`Unique stores in entity row_data: ${entityStores.size}`);
  console.log(`Entity rows with store key: ${entitiesWithStore}`);
  console.log(`Entity rows whose store matches store data (as String): ${storeMatchCount}`);

  // Show sample store keys from both sides for comparison
  const storeSample = Array.from(storeDataStores).slice(0, 5);
  const entitySample = Array.from(entityStores).slice(0, 5);
  console.log(`\nStore data key samples: ${storeSample.join(', ')}`);
  console.log(`Entity store key samples: ${entitySample.join(', ')}`);

  // Check if the stores actually overlap
  let overlapCount = 0;
  for (const s of Array.from(entityStores)) {
    if (storeDataStores.has(s)) overlapCount++;
  }
  console.log(`Overlapping stores (by String): ${overlapCount} / ${entityStores.size}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 3A DIAGNOSTIC COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
