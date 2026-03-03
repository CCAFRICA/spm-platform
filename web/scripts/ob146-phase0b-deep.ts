/**
 * OB-146 Phase 0B: Deep diagnostic — paginated fetch to get true counts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 5000;

async function fetchAll(query: string, filters: Record<string, unknown>) {
  const rows: Array<Record<string, unknown>> = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from('committed_data').select('data_type, entity_id, row_data').eq('tenant_id', tenantId).range(from, to);

    if (filters.periodNotNull) q = q.not('period_id', 'is', null);
    if (filters.entityNull) q = q.is('entity_id', null);
    if (filters.entityNotNull) q = q.not('entity_id', 'is', null);

    const { data } = await q;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return rows;
}

async function main() {
  console.log('OB-146 Phase 0B: Deep Diagnostic (paginated)\n');

  // 1. Fetch ALL entity-level committed_data
  console.log('Fetching ALL entity-level committed_data (paginated)...');
  const entityRows = await fetchAll('committed_data', { periodNotNull: true, entityNotNull: true });
  console.log(`Total entity-level rows: ${entityRows.length}`);

  // Count by data_type
  const entitySheetCounts = new Map<string, number>();
  const entityStoreInfo = new Map<string, { total: number; hasNumTienda: number; hasNoTienda: number; sampleNumTienda: string; sampleNoTienda: string }>();

  for (const row of entityRows) {
    const dt = String(row.data_type || '_unknown');
    entitySheetCounts.set(dt, (entitySheetCounts.get(dt) || 0) + 1);

    if (!entityStoreInfo.has(dt)) entityStoreInfo.set(dt, { total: 0, hasNumTienda: 0, hasNoTienda: 0, sampleNumTienda: '', sampleNoTienda: '' });
    const info = entityStoreInfo.get(dt)!;
    info.total++;

    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    if (rd['num_tienda'] !== undefined && rd['num_tienda'] !== null) {
      info.hasNumTienda++;
      if (!info.sampleNumTienda) info.sampleNumTienda = String(rd['num_tienda']);
    }
    if (rd['No_Tienda'] !== undefined && rd['No_Tienda'] !== null) {
      info.hasNoTienda++;
      if (!info.sampleNoTienda) info.sampleNoTienda = String(rd['No_Tienda']);
    }
  }

  console.log('\nEntity-level sheets:');
  for (const [dt, count] of Array.from(entitySheetCounts.entries()).sort()) {
    const info = entityStoreInfo.get(dt)!;
    console.log(`  ${dt}: ${count} rows, num_tienda=${info.hasNumTienda} (sample: "${info.sampleNumTienda}"), No_Tienda=${info.hasNoTienda} (sample: "${info.sampleNoTienda}")`);
  }

  // How many unique entities have num_tienda in any row?
  const entitiesWithStore = new Map<string, string>(); // entityId → storeId
  for (const row of entityRows) {
    const entityId = String(row.entity_id);
    if (entitiesWithStore.has(entityId)) continue;
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    const numTienda = rd['num_tienda'] ?? rd['No_Tienda'] ?? rd['storeId'];
    if (numTienda !== undefined && numTienda !== null) {
      entitiesWithStore.set(entityId, String(numTienda));
    }
  }
  console.log(`\nEntities with store key in row_data: ${entitiesWithStore.size} / 22159`);

  // Sample store values
  const storeValSample = Array.from(entitiesWithStore.values()).slice(0, 10);
  console.log(`Sample store values: ${storeValSample.join(', ')}`);

  // 2. Fetch ALL store-level committed_data
  console.log('\nFetching ALL store-level committed_data (paginated)...');
  const storeRows = await fetchAll('committed_data', { periodNotNull: true, entityNull: true });
  console.log(`Total store-level rows: ${storeRows.length}`);

  const storeSheetCounts = new Map<string, number>();
  const storeKeyValues = new Map<string, Set<string>>();
  const storeKeySamples = new Map<string, string>();

  for (const row of storeRows) {
    const dt = String(row.data_type || '_unknown');
    storeSheetCounts.set(dt, (storeSheetCounts.get(dt) || 0) + 1);

    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    const storeKey = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'] ?? rd['Tienda'];
    if (storeKey !== undefined && storeKey !== null) {
      if (!storeKeyValues.has(dt)) storeKeyValues.set(dt, new Set());
      storeKeyValues.get(dt)!.add(String(storeKey));
      if (!storeKeySamples.has(dt)) storeKeySamples.set(dt, String(storeKey));
    }
  }

  console.log('\nStore-level sheets:');
  for (const [dt, count] of Array.from(storeSheetCounts.entries()).sort()) {
    const keys = storeKeyValues.get(dt);
    console.log(`  ${dt}: ${count} rows, unique stores=${keys?.size ?? 0}, sample key="${storeKeySamples.get(dt) || 'none'}"`);
  }

  // 3. Check key match: do entity num_tienda values match store-level keys?
  console.log('\n--- KEY MATCH ANALYSIS ---');
  const entityStoreVals = new Set(entitiesWithStore.values());
  for (const [dt, keys] of Array.from(storeKeyValues.entries())) {
    let matchCount = 0;
    for (const k of Array.from(keys)) {
      if (entityStoreVals.has(k)) matchCount++;
    }
    console.log(`  ${dt}: ${matchCount}/${keys.size} store keys match entity store values`);
  }

  // 4. Which field is the key in store-level data?
  console.log('\n--- STORE-LEVEL ROW SAMPLE ---');
  for (const row of storeRows.slice(0, 3)) {
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    const keys = Object.keys(rd).filter(k => !k.startsWith('_'));
    console.log(`  data_type: ${row.data_type}`);
    console.log(`  fields: ${keys.join(', ')}`);
    console.log(`  No_Tienda: ${rd['No_Tienda']}, num_tienda: ${rd['num_tienda']}, storeId: ${rd['storeId']}`);
    console.log('');
  }

  // 5. Check all periods
  console.log('--- PERIODS ---');
  const { data: periods } = await supabase.from('periods').select('id, label, canonical_key').eq('tenant_id', tenantId);
  for (const p of periods ?? []) {
    const { count } = await supabase.from('committed_data').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('period_id', p.id);
    console.log(`  ${p.label} (${p.canonical_key}): ${count} committed_data rows`);
  }

  // 6. Check LLave Tamaño de Tienda values
  console.log('\n--- LLave Tamano de Tienda VALUES ---');
  const llaveValues = new Map<string, number>();
  for (const row of entityRows) {
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    const llave = rd['LLave Tamaño de Tienda'] as string | undefined;
    if (llave) {
      llaveValues.set(String(llave), (llaveValues.get(String(llave)) || 0) + 1);
    }
  }
  console.log(`Unique values: ${llaveValues.size}`);
  for (const [val, count] of Array.from(llaveValues.entries()).sort().slice(0, 20)) {
    // Parse the tier from "storeNum-tier" format
    const parts = String(val).split('-');
    const tier = parts.length >= 2 ? parts[parts.length - 1] : 'unknown';
    console.log(`  "${val}" → tier ${tier} (${count} rows)`);
  }

  // 7. Check what Datos_Colaborador-like data exists in entity metadata or anywhere
  console.log('\n--- ROSTER / DATOS COLABORADOR SEARCH ---');
  // Check if any data_type contains 'dato' or 'colaborador' or 'roster'
  for (const row of entityRows) {
    const dt = String(row.data_type || '');
    if (/dato|colabor|roster|emplead/i.test(dt)) {
      console.log(`  Found roster-like: ${dt}`);
      break;
    }
  }
  // Also check store rows
  for (const row of storeRows) {
    const dt = String(row.data_type || '');
    if (/dato|colabor|roster|emplead/i.test(dt)) {
      console.log(`  Found roster-like in store data: ${dt}`);
      break;
    }
  }

  // Check entities table for how many have external_id matching roster employees
  const { data: sampleEnts } = await supabase.from('entities').select('external_id, metadata, entity_type')
    .eq('tenant_id', tenantId).limit(20);
  console.log('\nSample entities:');
  for (const e of (sampleEnts ?? []).slice(0, 5)) {
    console.log(`  ext_id: ${e.external_id}, type: ${e.entity_type}, meta: ${JSON.stringify(e.metadata)}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('DEEP DIAGNOSTIC COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
