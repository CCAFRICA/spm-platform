/**
 * OB-148 Phase 0B: Deep trace of store data for attainment computation
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob148-phase0b-store-trace.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-148 PHASE 0B: STORE DATA TRACE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { data: enero } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();
  if (!enero) { console.error('No Enero period'); return; }

  // ── Q1: What sheets have store rows (entity_id IS NULL)? ──
  console.log('--- Q1: Store rows (entity_id IS NULL) by sheet ---\n');

  const storeSheetCounts = new Map<string, number>();
  const storeSheetSamples = new Map<string, Record<string, unknown>>();
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .is('entity_id', null)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const dt = r.data_type ?? '_unknown';
      storeSheetCounts.set(dt, (storeSheetCounts.get(dt) ?? 0) + 1);
      if (!storeSheetSamples.has(dt)) {
        storeSheetSamples.set(dt, (r.row_data ?? {}) as Record<string, unknown>);
      }
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  for (const [sheet, count] of Array.from(storeSheetCounts.entries()).sort()) {
    console.log(`  ${sheet}: ${count} rows`);
    const sample = storeSheetSamples.get(sheet)!;
    const keys = Object.keys(sample);
    console.log(`    Keys: ${keys.join(', ')}`);
    // Show store key candidates
    const storeKeys = ['storeId', 'num_tienda', 'No_Tienda', 'Tienda'];
    for (const sk of storeKeys) {
      if (sample[sk] !== undefined) {
        console.log(`    ${sk}: ${sample[sk]} (type: ${typeof sample[sk]})`);
      }
    }
    // Show Venta fields
    for (const [k, v] of Object.entries(sample)) {
      if (/meta.*tienda|real.*tienda|venta.*tienda/i.test(k)) {
        console.log(`    ${k}: ${v} (type: ${typeof v})`);
      }
    }
    console.log();
  }

  // ── Q2: Parent sheet store rows — what store key do they use? ──
  console.log('\n--- Q2: Parent sheet store rows — detailed sample ---\n');

  const { data: parentStoreRows } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', tenantId)
    .eq('period_id', enero.id)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
    .is('entity_id', null)
    .limit(5);

  for (const r of (parentStoreRows ?? [])) {
    const rd = (r.row_data ?? {}) as Record<string, unknown>;
    console.log('  Full row_data:');
    for (const [k, v] of Object.entries(rd)) {
      console.log(`    ${k}: ${v} (${typeof v})`);
    }
    console.log();
  }

  // ── Q3: Do parent sheet store rows match entity store IDs? ──
  console.log('\n--- Q3: Store key matching analysis ---\n');

  // Get all parent sheet store rows
  const parentStoreMap = new Map<string | number, Record<string, unknown>>();
  page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
      .is('entity_id', null)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      const storeKey = (rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'] ?? rd['Tienda']) as string | number | undefined;
      if (storeKey !== undefined) {
        parentStoreMap.set(storeKey, rd);
      }
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  console.log(`Parent sheet store rows: ${parentStoreMap.size}`);

  // Get 5 entity store IDs and check if they match
  const sampleStoreIds: (string | number)[] = [];
  page = 0;
  while (sampleStoreIds.length < 10) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
      .not('entity_id', 'is', null)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      const sid = (rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda']) as string | number | undefined;
      if (sid !== undefined && !sampleStoreIds.includes(sid) && sampleStoreIds.length < 10) {
        sampleStoreIds.push(sid);
      }
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`\nSample entity store IDs: ${sampleStoreIds.join(', ')}`);
  for (const sid of sampleStoreIds) {
    const match = parentStoreMap.get(sid);
    const matchStr = parentStoreMap.get(String(sid));
    const matchNum = parentStoreMap.get(Number(sid));

    if (match) {
      const rd = match;
      console.log(`  Store ${sid}: MATCH (exact) — Real_VT=${rd['Real_Venta_Tienda']}, Meta_VT=${rd['Meta_Venta_Tienda']}`);
    } else if (matchStr) {
      const rd = matchStr;
      console.log(`  Store ${sid}: MATCH (as string) — Real_VT=${rd['Real_Venta_Tienda']}, Meta_VT=${rd['Meta_Venta_Tienda']}`);
    } else if (matchNum) {
      const rd = matchNum;
      console.log(`  Store ${sid}: MATCH (as number) — Real_VT=${rd['Real_Venta_Tienda']}, Meta_VT=${rd['Meta_Venta_Tienda']}`);
    } else {
      console.log(`  Store ${sid}: NO MATCH in parent sheet store rows`);
      // Check what keys are close
      const keys = Array.from(parentStoreMap.keys());
      const close = keys.filter(k => String(k) === String(sid));
      if (close.length > 0) {
        console.log(`    Found as: ${close.join(', ')} (types: ${close.map(k => typeof k).join(', ')})`);
      }
    }
  }

  // ── Q4: What store key field does the parent sheet use? ──
  console.log('\n--- Q4: Store key field in parent sheet store rows ---\n');
  if (parentStoreRows && parentStoreRows.length > 0) {
    const rd = (parentStoreRows[0].row_data ?? {}) as Record<string, unknown>;
    console.log('Store key candidates in first row:');
    console.log(`  storeId: ${rd['storeId']} (${typeof rd['storeId']})`);
    console.log(`  num_tienda: ${rd['num_tienda']} (${typeof rd['num_tienda']})`);
    console.log(`  No_Tienda: ${rd['No_Tienda']} (${typeof rd['No_Tienda']})`);
    console.log(`  Tienda: ${rd['Tienda']} (${typeof rd['Tienda']})`);

    // Check ALL keys for anything that looks like a store ID
    for (const [k, v] of Object.entries(rd)) {
      if (/tienda|store|sucursal|branch/i.test(k)) {
        console.log(`  ${k}: ${v} (${typeof v})`);
      }
    }
  }

  // ── Q5: Compute correct store attainments ──
  console.log('\n--- Q5: Computed store attainments from parent sheet ---\n');

  let belowThreshold = 0;
  let aboveThreshold = 0;
  const attainmentDist = { below80: 0, tier80_99: 0, tier100_119: 0, above120: 0, noData: 0 };

  for (const [storeKey, rd] of Array.from(parentStoreMap.entries())) {
    const realVT = rd['Real_Venta_Tienda'];
    const metaVT = rd['Meta_Venta_Tienda'];
    if (typeof realVT === 'number' && typeof metaVT === 'number' && metaVT > 0) {
      const att = (realVT / metaVT) * 100;
      if (att < 80) attainmentDist.below80++;
      else if (att < 100) attainmentDist.tier80_99++;
      else if (att < 120) attainmentDist.tier100_119++;
      else attainmentDist.above120++;
      if (att >= 100) aboveThreshold++;
      else belowThreshold++;
    } else {
      attainmentDist.noData++;
    }
  }

  console.log(`Stores with Real/Meta data: ${parentStoreMap.size - attainmentDist.noData}`);
  console.log(`Stores without data: ${attainmentDist.noData}`);
  console.log(`\nComputed attainment distribution:`);
  console.log(`  <80%: ${attainmentDist.below80} stores`);
  console.log(`  80-99%: ${attainmentDist.tier80_99} stores`);
  console.log(`  100-119%: ${attainmentDist.tier100_119} stores`);
  console.log(`  120%+: ${attainmentDist.above120} stores`);
  console.log(`\nStores with >=100% (qualifying for Tienda): ${aboveThreshold}`);
  console.log(`Stores with <100% (not qualifying): ${belowThreshold}`);
  console.log(`Benchmark: ~362 employees qualify. If ~80% of stores have employees, ~${Math.round(aboveThreshold * 0.8 * 2)} entities should qualify.`);

  // Show first 10 store attainment values
  console.log('\nFirst 10 store attainments:');
  let count = 0;
  for (const [storeKey, rd] of Array.from(parentStoreMap.entries())) {
    if (count >= 10) break;
    const realVT = rd['Real_Venta_Tienda'];
    const metaVT = rd['Meta_Venta_Tienda'];
    if (typeof realVT === 'number' && typeof metaVT === 'number' && metaVT > 0) {
      const att = (realVT / metaVT) * 100;
      console.log(`  Store ${storeKey}: Real=${realVT}, Meta=${metaVT}, Att=${att.toFixed(1)}%`);
      count++;
    }
  }

  // ── Q6: Volume tier distribution from entity data ──
  console.log('\n\n--- Q6: store_volume_tier distribution ---\n');
  const volTierDist = new Map<number, number>();
  const sumNivelDist: number[] = [];
  page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores__base_venta_individual')
      .not('entity_id', 'is', null)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      const tier = rd['store_volume_tier'];
      if (typeof tier === 'number') {
        volTierDist.set(tier, (volTierDist.get(tier) ?? 0) + 1);
      }
      const snivel = rd['suma nivel tienda'];
      if (typeof snivel === 'number') {
        sumNivelDist.push(snivel);
      }
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log('store_volume_tier distribution:');
  for (const [tier, cnt] of Array.from(volTierDist.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`  Tier ${tier}: ${cnt} entities`);
  }

  // Summary stats for suma nivel tienda
  if (sumNivelDist.length > 0) {
    sumNivelDist.sort((a, b) => a - b);
    console.log(`\nsuma nivel tienda stats (${sumNivelDist.length} entities):`);
    console.log(`  min: ${sumNivelDist[0]}`);
    console.log(`  p25: ${sumNivelDist[Math.floor(sumNivelDist.length * 0.25)]}`);
    console.log(`  median: ${sumNivelDist[Math.floor(sumNivelDist.length * 0.5)]}`);
    console.log(`  p75: ${sumNivelDist[Math.floor(sumNivelDist.length * 0.75)]}`);
    console.log(`  max: ${sumNivelDist[sumNivelDist.length - 1]}`);

    // Count per bracket
    const below60k = sumNivelDist.filter(v => v < 60000).length;
    const range60_100k = sumNivelDist.filter(v => v >= 60000 && v < 100000).length;
    const above100k = sumNivelDist.filter(v => v >= 100000).length;
    console.log(`  <60K (Tier 1): ${below60k} entities`);
    console.log(`  60K-100K (Tier 2): ${range60_100k} entities`);
    console.log(`  >100K (Tier 3): ${above100k} entities`);
  }
}

main().catch(console.error);
