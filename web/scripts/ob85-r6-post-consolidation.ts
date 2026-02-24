/**
 * OB-85 R6: Verify per-store optical aggregates AFTER entity consolidation
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

async function check() {
  const { data: periods } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', TENANT)
    .gte('start_date', '2024-01-01')
    .lt('start_date', '2024-02-01');
  const periodId = periods?.[0]?.id;

  // Fetch ALL committed_data
  const PAGE = 1000;
  const allRows: Array<{ entity_id: string | null; data_type: string; row_data: Record<string, unknown> }> = [];
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id, data_type, row_data')
      .eq('tenant_id', TENANT)
      .eq('period_id', periodId!)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    allRows.push(...(data as typeof allRows));
    if (data.length < PAGE) break;
    page++;
  }

  // Simulate entity consolidation (same logic as route.ts)
  // Step 1: Group by entity
  const dataByEntity = new Map<string, Map<string, Array<{ row_data: Record<string, unknown> }>>>();
  for (const row of allRows) {
    if (!row.entity_id) continue;
    if (!dataByEntity.has(row.entity_id)) dataByEntity.set(row.entity_id, new Map());
    const sheets = dataByEntity.get(row.entity_id)!;
    if (!sheets.has(row.data_type)) sheets.set(row.data_type, []);
    sheets.get(row.data_type)!.push({ row_data: row.row_data });
  }

  // Step 2: Build employee → UUIDs map
  const employeeToEntityIds = new Map<string, Set<string>>();
  for (const row of allRows) {
    if (!row.entity_id) continue;
    const rd = row.row_data;
    const empNum = String(rd?.entityId ?? rd?.num_empleado ?? '');
    if (empNum && empNum !== 'undefined' && empNum !== 'null') {
      if (!employeeToEntityIds.has(empNum)) employeeToEntityIds.set(empNum, new Set());
      employeeToEntityIds.get(empNum)!.add(row.entity_id);
    }
  }

  // Step 3: Merge sibling UUIDs
  let consolidatedCount = 0;
  for (const [, uuidSet] of Array.from(employeeToEntityIds.entries())) {
    if (uuidSet.size <= 1) continue;
    let primaryId: string | null = null;
    for (const uuid of Array.from(uuidSet)) {
      const sheets = dataByEntity.get(uuid);
      if (sheets) {
        for (const sheetName of Array.from(sheets.keys())) {
          if (sheetName.toLowerCase().includes('datos colaborador') || sheetName.toLowerCase().includes('roster')) {
            primaryId = uuid;
            break;
          }
        }
      }
      if (primaryId) break;
    }
    if (!primaryId) continue;

    for (const siblingId of Array.from(uuidSet)) {
      if (siblingId === primaryId) continue;
      const siblingSheets = dataByEntity.get(siblingId);
      if (!siblingSheets) continue;
      if (!dataByEntity.has(primaryId)) dataByEntity.set(primaryId, new Map());
      const primarySheets = dataByEntity.get(primaryId)!;
      for (const [sheetName, rows] of Array.from(siblingSheets.entries())) {
        if (!primarySheets.has(sheetName)) primarySheets.set(sheetName, []);
        primarySheets.get(sheetName)!.push(...rows);
      }
      consolidatedCount++;
    }
  }
  console.log(`Consolidated ${consolidatedCount} sibling UUIDs\n`);

  // Now check: how many roster entities have Base_Venta_Individual after consolidation?
  const rosterEntities = new Set<string>();
  const entitiesWithVI = new Set<string>();
  for (const [entityId, sheets] of Array.from(dataByEntity.entries())) {
    if (Array.from(sheets.keys()).some(s => s.toLowerCase().includes('datos colaborador'))) {
      rosterEntities.add(entityId);
    }
    if (sheets.has('Base_Venta_Individual')) {
      entitiesWithVI.add(entityId);
    }
  }
  const rosterWithVI = Array.from(rosterEntities).filter(id => entitiesWithVI.has(id));
  console.log(`Roster entities: ${rosterEntities.size}`);
  console.log(`Roster WITH Venta Individual: ${rosterWithVI.length}`);
  console.log(`Roster WITHOUT Venta Individual: ${rosterEntities.size - rosterWithVI.length}\n`);

  // Build per-store entity aggregate (after consolidation)
  const entityToStore = new Map<string, string>();
  for (const [entityId, sheets] of Array.from(dataByEntity.entries())) {
    if (!rosterEntities.has(entityId)) continue;
    const rosterRows = sheets.get('Datos Colaborador') ?? [];
    for (const row of rosterRows) {
      const storeId = String(row.row_data?.storeId ?? row.row_data?.No_Tienda ?? '');
      if (storeId) {
        entityToStore.set(entityId, storeId);
        break;
      }
    }
  }

  // Per-store aggregate of Base_Venta_Individual amounts
  const storeOpticalAgg = new Map<string, { amount: number; goal: number; entityCount: number }>();
  for (const entityId of Array.from(rosterEntities)) {
    const storeId = entityToStore.get(entityId);
    if (!storeId) continue;
    const sheets = dataByEntity.get(entityId);
    const viRows = sheets?.get('Base_Venta_Individual') ?? [];
    if (viRows.length === 0) continue;

    const existing = storeOpticalAgg.get(storeId) ?? { amount: 0, goal: 0, entityCount: 0 };
    for (const row of viRows) {
      existing.amount += Number(row.row_data?.amount ?? 0);
      existing.goal += Number(row.row_data?.goal ?? 0);
    }
    existing.entityCount++;
    storeOpticalAgg.set(storeId, existing);
  }

  console.log('=== PER-STORE OPTICAL AGGREGATES (after consolidation) ===');
  console.log(`Stores with data: ${storeOpticalAgg.size}\n`);

  // Check key stores
  for (const sid of ['388', '298', '1', '100']) {
    const agg = storeOpticalAgg.get(sid);
    if (agg) {
      const band = agg.amount < 60000 ? '<$60K' :
        agg.amount < 100000 ? '$60-100K' :
        agg.amount < 120000 ? '$100-120K' :
        agg.amount < 180000 ? '$120-180K' : '≥$180K';
      console.log(`Store ${sid}: amount=MX$${agg.amount.toLocaleString()}, goal=MX$${agg.goal.toLocaleString()}, entities=${agg.entityCount}, band=${band}`);
    } else {
      console.log(`Store ${sid}: NO VI data after consolidation`);
    }
  }

  // Distribution by band
  console.log('\n=== STORE DISTRIBUTION BY BAND ===');
  const bandCounts = { '<$60K': 0, '$60-100K': 0, '$100-120K': 0, '$120-180K': 0, '≥$180K': 0 };
  for (const [, agg] of Array.from(storeOpticalAgg.entries())) {
    const band = agg.amount < 60000 ? '<$60K' :
      agg.amount < 100000 ? '$60-100K' :
      agg.amount < 120000 ? '$100-120K' :
      agg.amount < 180000 ? '$120-180K' : '≥$180K';
    bandCounts[band as keyof typeof bandCounts]++;
  }
  console.log(JSON.stringify(bandCounts, null, 2));

  // Entity 93515855 trace
  console.log('\n=== ENTITY 93515855 POST-CONSOLIDATION ===');
  // Find UUID for 93515855
  let targetUuid: string | null = null;
  for (const [entityId, sheets] of Array.from(dataByEntity.entries())) {
    const rosterRows = sheets.get('Datos Colaborador') ?? [];
    for (const row of rosterRows) {
      if (String(row.row_data?.entityId) === '93515855') {
        targetUuid = entityId;
        break;
      }
    }
    if (targetUuid) break;
  }

  if (targetUuid) {
    const sheets = dataByEntity.get(targetUuid)!;
    console.log(`UUID: ${targetUuid}`);
    console.log(`Sheets: ${Array.from(sheets.keys()).join(', ')}`);
    const viRows = sheets.get('Base_Venta_Individual') ?? [];
    console.log(`Venta Individual rows: ${viRows.length}`);
    for (const row of viRows) {
      const rd = row.row_data;
      console.log(`  amount=${rd?.amount}, goal=${rd?.goal}, attainment=${rd?.attainment}`);
    }
    const storeId = entityToStore.get(targetUuid);
    console.log(`Store: ${storeId}`);
    const storeAgg = storeId ? storeOpticalAgg.get(storeId) : undefined;
    console.log(`Store optical aggregate: ${JSON.stringify(storeAgg)}`);
    if (storeAgg) {
      const band = storeAgg.amount < 60000 ? '<$60K' :
        storeAgg.amount < 100000 ? '$60-100K' :
        storeAgg.amount < 120000 ? '$100-120K' :
        storeAgg.amount < 180000 ? '$120-180K' : '≥$180K';
      console.log(`Column band: ${band}`);
    }
  }
}

check().catch(console.error);
