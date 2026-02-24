/**
 * OB-85 R6: Verify per-store aggregates from Base_Venta_Individual
 * to confirm what the column metric should be.
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

  // Fetch ALL committed_data for the period (paginated)
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

  // Build entity → storeId mapping from roster
  const entityToStore = new Map<string, string>();
  for (const row of allRows) {
    if (!row.entity_id || row.data_type !== 'Datos Colaborador') continue;
    const rd = row.row_data;
    const storeId = String(rd?.storeId ?? rd?.No_Tienda ?? '');
    if (storeId) entityToStore.set(row.entity_id, storeId);
  }

  // Build per-store aggregates of Base_Venta_Individual amounts
  const storeOpticalAgg = new Map<string, { amount: number; goal: number; entities: number }>();
  for (const row of allRows) {
    if (!row.entity_id || row.data_type !== 'Base_Venta_Individual') continue;
    const storeId = entityToStore.get(row.entity_id);
    if (!storeId) continue;
    const rd = row.row_data;
    const amount = Number(rd?.amount ?? 0);
    const goal = Number(rd?.goal ?? 0);
    const existing = storeOpticalAgg.get(storeId) ?? { amount: 0, goal: 0, entities: 0 };
    existing.amount += amount;
    existing.goal += goal;
    existing.entities++;
    storeOpticalAgg.set(storeId, existing);
  }

  // Check store 388 (entity 93515855)
  console.log('=== STORE 388 (Entity 93515855) ===');
  const store388 = storeOpticalAgg.get('388');
  console.log(`Per-store VentaIndividual aggregate: ${JSON.stringify(store388)}`);
  if (store388) {
    const band = store388.amount < 60000 ? '<$60K' :
      store388.amount < 100000 ? '$60-100K' :
      store388.amount < 120000 ? '$100-120K' :
      store388.amount < 180000 ? '$120-180K' : '≥$180K';
    console.log(`Column band: ${band}`);
    console.log(`Expected Non-Certified 100-149% payout at ${band}:`);
  }

  // Check store 298 (entity 92686541 from CLT-14B)
  console.log('\n=== STORE 298 (Entity 92686541) ===');
  const store298 = storeOpticalAgg.get('298');
  console.log(`Per-store VentaIndividual aggregate: ${JSON.stringify(store298)}`);
  if (store298) {
    const band = store298.amount < 60000 ? '<$60K' :
      store298.amount < 100000 ? '$60-100K' :
      store298.amount < 120000 ? '$100-120K' :
      store298.amount < 180000 ? '$120-180K' : '≥$180K';
    console.log(`Column band: ${band}`);
  }

  // Distribution of stores by band
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

  // Compare: Base_Venta_Tienda amounts for same stores
  console.log('\n=== BASE_VENTA_TIENDA vs AGGREGATED VENTA_INDIVIDUAL ===');
  console.log('Store | VentaTienda.amount | AggVentaInd.amount | Band(VT) | Band(AVI)');
  const checkStores = ['388', '298', '1', '100', '200'];
  for (const sid of checkStores) {
    const vt = allRows.find(r => r.data_type === 'Base_Venta_Tienda' && !r.entity_id &&
      String((r.row_data as Record<string, unknown>)?.storeId ?? (r.row_data as Record<string, unknown>)?.No_Tienda) === sid);
    const agg = storeOpticalAgg.get(sid);
    const vtAmt = vt ? Number((vt.row_data as Record<string, unknown>)?.amount ?? 0) : 0;
    const aggAmt = agg?.amount ?? 0;
    const vtBand = vtAmt < 60000 ? '<$60K' : vtAmt < 100000 ? '$60-100K' : vtAmt < 120000 ? '$100-120K' : vtAmt < 180000 ? '$120-180K' : '≥$180K';
    const aggBand = aggAmt < 60000 ? '<$60K' : aggAmt < 100000 ? '$60-100K' : aggAmt < 120000 ? '$100-120K' : aggAmt < 180000 ? '$120-180K' : '≥$180K';
    console.log(`${sid.padEnd(5)} | ${vtAmt.toLocaleString().padEnd(18)} | ${aggAmt.toLocaleString().padEnd(18)} | ${vtBand.padEnd(9)} | ${aggBand}`);
  }

  // How many entities have Base_Venta_Individual data?
  const entitiesWithVI = new Set(allRows.filter(r => r.data_type === 'Base_Venta_Individual' && r.entity_id).map(r => r.entity_id!));
  const rosterEntities = new Set(allRows.filter(r => r.data_type === 'Datos Colaborador' && r.entity_id).map(r => r.entity_id!));
  const rosterWithVI = Array.from(rosterEntities).filter(id => entitiesWithVI.has(id));
  console.log(`\nRoster entities: ${rosterEntities.size}`);
  console.log(`Entities with Base_Venta_Individual: ${entitiesWithVI.size}`);
  console.log(`Roster entities WITH Venta Individual (after consolidation): ${rosterWithVI.length}`);
  console.log(`Roster entities WITHOUT Venta Individual: ${rosterEntities.size - rosterWithVI.length}`);

  // What about entities WITHOUT Venta Individual — they can't contribute to store aggregate
  // How many stores have at least 1 entity with VI data?
  const storesWithVIData = storeOpticalAgg.size;
  const allStores = new Set(Array.from(entityToStore.values()));
  console.log(`\nStores with VI data: ${storesWithVIData}`);
  console.log(`Total unique stores: ${allStores.size}`);
  console.log(`Stores WITHOUT VI data: ${allStores.size - storesWithVIData}`);
}

check().catch(console.error);
