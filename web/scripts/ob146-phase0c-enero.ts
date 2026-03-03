/**
 * OB-146 Phase 0C: Enero 2024 specific data landscape
 * Uses 1000-row page size to match Supabase max-rows
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

async function paginatedFetch(periodId: string, entityNull: boolean): Promise<Array<{ entity_id: string | null; data_type: string; row_data: Record<string, unknown> }>> {
  const rows: Array<{ entity_id: string | null; data_type: string; row_data: Record<string, unknown> }> = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase
      .from('committed_data')
      .select('entity_id, data_type, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId)
      .range(from, to);

    if (entityNull) {
      q = q.is('entity_id', null);
    } else {
      q = q.not('entity_id', 'is', null);
    }

    const { data, error } = await q;
    if (error) { console.error('Query error:', error.message); break; }
    if (!data || data.length === 0) break;
    rows.push(...(data as typeof rows));
    if (data.length < PAGE_SIZE) break;
    page++;
    if (page > 100) { console.warn('Too many pages, stopping'); break; }
  }
  return rows;
}

async function main() {
  console.log('OB-146 Phase 0C: Enero 2024 Data Landscape\n');

  // Find Enero 2024 period
  const { data: periods } = await supabase
    .from('periods')
    .select('id, label, canonical_key')
    .eq('tenant_id', tenantId);

  const eneroPeriod = (periods ?? []).find(p => p.canonical_key === '2024-01');
  if (!eneroPeriod) {
    console.error('No Enero 2024 period found!');
    console.log('Available periods:', periods?.map(p => `${p.label} (${p.canonical_key})`));
    process.exit(1);
  }
  console.log(`Period: ${eneroPeriod.label} (${eneroPeriod.id})\n`);

  // Fetch entity-level rows for Enero 2024
  console.log('Fetching entity-level rows for Enero 2024...');
  const entityRows = await paginatedFetch(eneroPeriod.id, false);
  console.log(`Total entity-level rows: ${entityRows.length}`);

  // Fetch store-level rows for Enero 2024
  console.log('Fetching store-level rows for Enero 2024...');
  const storeRows = await paginatedFetch(eneroPeriod.id, true);
  console.log(`Total store-level rows: ${storeRows.length}\n`);

  // Entity data analysis
  const entitySheets = new Map<string, { count: number; hasNumTienda: number; hasNoTienda: number; hasLlave: number }>();
  const entityToStore = new Map<string, string>();
  const entityToTier = new Map<string, string>();

  for (const row of entityRows) {
    const dt = row.data_type || '_unknown';
    if (!entitySheets.has(dt)) entitySheets.set(dt, { count: 0, hasNumTienda: 0, hasNoTienda: 0, hasLlave: 0 });
    const info = entitySheets.get(dt)!;
    info.count++;

    const rd = row.row_data || {};
    if (rd.num_tienda !== undefined && rd.num_tienda !== null) info.hasNumTienda++;
    if (rd.No_Tienda !== undefined && rd.No_Tienda !== null) info.hasNoTienda++;
    if (rd['LLave Tamaño de Tienda'] !== undefined) info.hasLlave++;

    if (row.entity_id && !entityToStore.has(row.entity_id)) {
      const sid = rd.storeId ?? rd.num_tienda ?? rd.No_Tienda;
      if (sid !== undefined && sid !== null) {
        entityToStore.set(row.entity_id, String(sid));
      }
    }

    if (row.entity_id && !entityToTier.has(row.entity_id)) {
      const llave = rd['LLave Tamaño de Tienda'] as string | undefined;
      if (llave) {
        const parts = String(llave).split('-');
        if (parts.length >= 2) entityToTier.set(row.entity_id, parts[parts.length - 1]);
      }
    }
  }

  console.log('Entity-level sheets (Enero 2024):');
  for (const [dt, info] of Array.from(entitySheets.entries()).sort()) {
    console.log(`  ${dt}: ${info.count} rows, num_tienda=${info.hasNumTienda}, No_Tienda=${info.hasNoTienda}, LLave=${info.hasLlave}`);
  }
  console.log(`\nEntities with store key in row_data: ${entityToStore.size}`);
  console.log(`Entities with volume tier from LLave: ${entityToTier.size}`);

  // Store-level data analysis
  const storeSheets = new Map<string, { count: number; keys: Set<string> }>();
  for (const row of storeRows) {
    const dt = row.data_type || '_unknown';
    if (!storeSheets.has(dt)) storeSheets.set(dt, { count: 0, keys: new Set() });
    const info = storeSheets.get(dt)!;
    info.count++;
    const rd = row.row_data || {};
    const sk = rd.storeId ?? rd.num_tienda ?? rd.No_Tienda ?? rd.Tienda;
    if (sk !== undefined && sk !== null) info.keys.add(String(sk));
  }

  console.log('\nStore-level sheets (Enero 2024):');
  for (const [dt, info] of Array.from(storeSheets.entries()).sort()) {
    console.log(`  ${dt}: ${info.count} rows, unique stores=${info.keys.size}`);
    const sampleKeys = Array.from(info.keys).slice(0, 5);
    console.log(`    sample keys: ${sampleKeys.join(', ')}`);
  }

  // Key match: entity num_tienda values vs store No_Tienda values
  console.log('\n--- STORE KEY MATCH ---');
  const entityStoreVals = new Set(entityToStore.values());
  for (const [dt, info] of Array.from(storeSheets.entries())) {
    let matched = 0;
    for (const k of Array.from(info.keys)) {
      if (entityStoreVals.has(k)) matched++;
    }
    console.log(`  Entity num_tienda ↔ ${dt} keys: ${matched}/${info.keys.size} match`);
  }

  // How many entities TOTAL are assigned to Enero 2024?
  const { count: assignedCount } = await supabase
    .from('rule_set_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  console.log(`\nTotal assigned entities: ${assignedCount}`);

  // How many unique entities have data in Enero 2024?
  const uniqueEntities = new Set(entityRows.filter(r => r.entity_id).map(r => r.entity_id));
  console.log(`Unique entities with Enero 2024 data: ${uniqueEntities.size}`);

  // Volume tier distribution
  console.log('\n--- VOLUME TIER DISTRIBUTION ---');
  const tierCounts = new Map<string, number>();
  for (const [, tier] of Array.from(entityToTier.entries())) {
    tierCounts.set(tier, (tierCounts.get(tier) || 0) + 1);
  }
  for (const [tier, count] of Array.from(tierCounts.entries()).sort()) {
    console.log(`  Tier ${tier}: ${count} entities`);
  }

  // How many of the 22,159 entities have Datos_Colaborador-type data?
  // Check roster entities
  let rosterEntities = 0;
  for (const row of entityRows) {
    const dt = row.data_type || '';
    if (/datos|colaborador|roster|employee/i.test(dt) && row.entity_id) {
      rosterEntities++;
    }
  }
  console.log(`\nRoster entity rows: ${rosterEntities}`);

  // Sample: check 3 known entities from CLT-14B benchmark
  const testEntities = ['93515855', '96568046', '90319253'];
  console.log('\n--- TEST ENTITY LOOKUP ---');
  for (const extId of testEntities) {
    const { data: ent } = await supabase
      .from('entities')
      .select('id, external_id, metadata')
      .eq('tenant_id', tenantId)
      .eq('external_id', extId)
      .single();

    if (!ent) { console.log(`  ${extId}: NOT FOUND`); continue; }

    // Get their committed_data
    const { data: entData } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', tenantId)
      .eq('entity_id', ent.id)
      .eq('period_id', eneroPeriod.id);

    console.log(`  ${extId} (${ent.id}):`);
    console.log(`    metadata: ${JSON.stringify(ent.metadata)}`);
    console.log(`    committed_data rows: ${entData?.length ?? 0}`);
    for (const d of entData ?? []) {
      const rd = d.row_data as Record<string, unknown>;
      const fields = Object.keys(rd).filter(k => !k.startsWith('_'));
      const numTienda = rd.num_tienda;
      const llave = rd['LLave Tamaño de Tienda'];
      console.log(`      ${d.data_type}: num_tienda=${numTienda}, LLave=${llave}`);
      console.log(`        keys: ${fields.join(', ')}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 0C COMPLETE');
}

main().catch(console.error);
