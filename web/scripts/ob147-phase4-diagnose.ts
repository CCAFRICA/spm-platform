/**
 * OB-147 Phase 4: Diagnose why Cobranza = $0 and Venta Tienda = 200%
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-147 PHASE 4 DIAGNOSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get Enero 2024 period
  const { data: enero } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();
  if (!enero) return;

  // ── Q1: How many roster entities have store_id? ──
  console.log('--- Q1: Store ID coverage among roster entities ---\n');

  // Get roster entities (719)
  const rosterEntities = new Set<string>();
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
      .not('entity_id', 'is', null)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.entity_id) rosterEntities.add(r.entity_id);
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  console.log(`Roster entities: ${rosterEntities.size}`);

  // Check how many roster entities have store_id in metadata
  let hasStoreInMeta = 0;
  const BATCH = 200;
  const rosterArr = Array.from(rosterEntities);
  for (let i = 0; i < rosterArr.length; i += BATCH) {
    const batch = rosterArr.slice(i, i + BATCH);
    const { data } = await supabase
      .from('entities')
      .select('id, metadata')
      .in('id', batch);
    for (const e of (data ?? [])) {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      if (meta.store_id) hasStoreInMeta++;
    }
  }
  console.log(`Roster entities with store_id in metadata: ${hasStoreInMeta}/${rosterEntities.size}`);

  // Check how many roster entities have storeId/num_tienda/No_Tienda in row_data
  let hasStoreInRowData = 0;
  const storeIdToEntities = new Map<string, number>();
  page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .not('entity_id', 'is', null)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    const seen = new Set<string>();
    for (const r of data) {
      if (!r.entity_id || !rosterEntities.has(r.entity_id) || seen.has(r.entity_id)) continue;
      seen.add(r.entity_id);
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      const sid = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
      if (sid !== undefined && sid !== null) {
        hasStoreInRowData++;
        const sidStr = String(sid);
        storeIdToEntities.set(sidStr, (storeIdToEntities.get(sidStr) ?? 0) + 1);
      }
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  console.log(`Roster entities with store key in row_data: ${hasStoreInRowData}/${rosterEntities.size}`);
  console.log(`Unique stores: ${storeIdToEntities.size}`);

  // ── Q2: What does the store data look like? ──
  console.log('\n\n--- Q2: Store data (entity_id IS NULL) ---\n');

  const { count: storeRowCount } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('period_id', enero.id)
    .is('entity_id', null);

  console.log(`Store rows (entity_id IS NULL): ${storeRowCount}`);

  // Sample store rows to see what fields they have
  const { data: sampleStore } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .eq('period_id', enero.id)
    .is('entity_id', null)
    .limit(3);

  if (sampleStore) {
    for (const r of sampleStore) {
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      console.log(`  Sheet: ${r.data_type}`);
      console.log(`  Keys: ${Object.keys(rd).join(', ')}`);
      console.log(`  Store key fields: storeId=${rd.storeId}, num_tienda=${rd.num_tienda}, No_Tienda=${rd.No_Tienda}`);
      console.log(`  Cobranza fields: Monto_Recuperado_Actual=${rd.Monto_Recuperado_Actual}, Monto_Recuperado_Meta=${rd.Monto_Recuperado_Meta}`);
      console.log('');
    }
  }

  // Count store rows per data_type
  const storeSheets = new Map<string, number>();
  page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .is('entity_id', null)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const dt = r.data_type ?? '_unknown';
      storeSheets.set(dt, (storeSheets.get(dt) ?? 0) + 1);
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  for (const [sheet, count] of Array.from(storeSheets.entries()).sort()) {
    console.log(`  ${sheet}: ${count} store rows`);
  }

  // ── Q3: Entity 93515855 trace — what store data does it resolve? ──
  console.log('\n\n--- Q3: Entity 93515855 trace ---\n');

  const { data: ent } = await supabase
    .from('entities')
    .select('id, metadata')
    .eq('tenant_id', tenantId)
    .eq('external_id', '93515855')
    .single();

  if (ent) {
    const meta = (ent.metadata ?? {}) as Record<string, unknown>;
    console.log(`Entity ID: ${ent.id}`);
    console.log(`Metadata store_id: ${meta.store_id ?? 'N/A'}`);

    // Get calculation result
    const { data: cr } = await supabase
      .from('calculation_results')
      .select('total_payout, components')
      .eq('tenant_id', tenantId)
      .eq('entity_id', ent.id)
      .single();

    if (cr) {
      console.log(`Total payout: MX$${cr.total_payout}`);
      const comps = (cr.components ?? []) as Array<Record<string, unknown>>;
      for (const c of comps) {
        console.log(`  ${c.componentName}: MX$${c.payout}`);
        if (Number(c.payout) > 0) {
          const details = c.details as Record<string, unknown> | undefined;
          if (details) {
            console.log(`    details: ${JSON.stringify(details)}`);
          }
        }
      }
    } else {
      console.log('NO RESULT — entity may not be on roster');
      // Check if this entity is in roster
      const isOnRoster = rosterEntities.has(ent.id);
      console.log(`On roster: ${isOnRoster}`);
    }

    // Check what row_data this entity has
    const { data: entityRows } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', tenantId)
      .eq('entity_id', ent.id)
      .eq('period_id', enero.id);

    if (entityRows) {
      console.log(`\nEntity data rows: ${entityRows.length}`);
      for (const r of entityRows) {
        const rd = (r.row_data ?? {}) as Record<string, unknown>;
        const storeKey = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
        console.log(`  ${r.data_type}: store=${storeKey}, Monto_Recuperado_Actual=${rd.Monto_Recuperado_Actual}`);
      }
    }
  }

  // ── Q4: Cobranza derivation simulation ──
  console.log('\n\n--- Q4: Cobranza derivation for a sample roster entity ---\n');

  // Pick a roster entity that has a store_id
  let sampleEntityId: string | null = null;
  let sampleStoreId: string | null = null;
  for (let i = 0; i < rosterArr.length && i < 200; i += BATCH) {
    const batch = rosterArr.slice(i, i + BATCH);
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .in('entity_id', batch)
      .limit(500);

    for (const r of (data ?? [])) {
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      const sid = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
      if (sid !== undefined && sid !== null && r.entity_id) {
        sampleEntityId = r.entity_id;
        sampleStoreId = String(sid);
        break;
      }
    }
    if (sampleEntityId) break;
  }

  if (sampleEntityId && sampleStoreId) {
    console.log(`Sample entity: ${sampleEntityId}, store: ${sampleStoreId}`);

    // Check: does this store have rows in the store data (entity_id IS NULL)?
    const { data: storeRows } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .is('entity_id', null)
      .limit(1000);

    let matchingStoreRows = 0;
    let cobActual = 0;
    let cobGoal = 0;
    for (const r of (storeRows ?? [])) {
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      const rowStoreKey = String(rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'] ?? '');
      if (rowStoreKey === sampleStoreId) {
        matchingStoreRows++;
        if (typeof rd['Monto_Recuperado_Actual'] === 'number') cobActual += rd['Monto_Recuperado_Actual'];
        if (typeof rd['Monto_Recuperado_Meta'] === 'number') cobGoal += rd['Monto_Recuperado_Meta'];
      }
    }

    console.log(`Store rows for store ${sampleStoreId}: ${matchingStoreRows}`);
    console.log(`Monto_Recuperado_Actual: ${cobActual}`);
    console.log(`Monto_Recuperado_Meta: ${cobGoal}`);
    if (cobGoal > 0) {
      console.log(`Collections attainment: ${((cobActual / cobGoal) * 100).toFixed(1)}%`);
    }

    // The derivation pattern is: .*cobranza.*|backttest_optometrista_mar2025_proveedores$
    // Check: does the MAIN sheet (backttest_optometrista_mar2025_proveedores) have Monto_Recuperado fields?
    console.log('\n--- Does the main parent sheet have Cobranza fields? ---');
    const { data: mainStoreRows } = await supabase
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
      .is('entity_id', null)
      .limit(3);

    for (const r of (mainStoreRows ?? [])) {
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      console.log(`  Keys: ${Object.keys(rd).slice(0, 15).join(', ')}`);
      console.log(`  Monto_Recuperado_Actual: ${rd['Monto_Recuperado_Actual']}`);
      console.log(`  Monto_Recuperado_Meta: ${rd['Monto_Recuperado_Meta']}`);
    }
  }

  // ── Q5: Check Venta Tienda distribution ──
  console.log('\n\n--- Q5: Venta Tienda tier distribution ---\n');
  const tierDist = new Map<string, number>();
  page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('components')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const comps = (row.components ?? []) as Array<Record<string, unknown>>;
      const vt = comps.find(c => String(c.componentName).includes('Tienda'));
      if (vt) {
        const details = vt.details as Record<string, unknown> | undefined;
        const tier = String(details?.matchedTier ?? 'unknown');
        tierDist.set(tier, (tierDist.get(tier) ?? 0) + 1);
      }
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  for (const [tier, count] of Array.from(tierDist.entries()).sort()) {
    console.log(`  ${tier}: ${count} entities`);
  }
}

main().catch(console.error);
