/**
 * OB-88 Diagnose: Why insurance achievement is < 80% for nearly all entities
 * Investigate entity_id distribution, actual/goal values, and roster overlap
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log('=== Insurance Diagnosis ===\n');

  const { data: period } = await sb.from('periods')
    .select('id').eq('tenant_id', TENANT_ID).eq('canonical_key', '2024-01').single();
  if (!period) throw new Error('Period not found');

  // Sample 10 rows to see entity_id shape and row_data keys
  const { data: sample } = await sb.from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', period.id)
    .eq('data_type', 'Base_Club_Proteccion')
    .limit(10);

  console.log('Sample rows:');
  for (const s of sample || []) {
    const rd = s.row_data as Record<string, unknown>;
    const keys = Object.keys(rd).filter(k =>
      k.toLowerCase().includes('club') || k.toLowerCase().includes('meta') ||
      k.toLowerCase().includes('actual') || k.toLowerCase().includes('monto') ||
      k === 'quantity' || k === 'goal' || k === 'entityId' || k === 'num_empleado' ||
      k === 'Vendedor' || k === 'storeId'
    );
    console.log(`  entity_id=${s.entity_id}, keys: ${JSON.stringify(Object.fromEntries(keys.map(k => [k, rd[k]])))}`);
  }

  // Check: how many unique entity_ids in Club Proteccion?
  // And how many of those are in the roster?
  const allClub: Array<{ entity_id: string | null; row_data: Record<string, unknown> }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', period.id)
      .eq('data_type', 'Base_Club_Proteccion')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allClub.push(...(data as typeof allClub));
    if (data.length < 1000) break;
    page++;
  }

  const clubEntityIds = new Set(allClub.map(r => r.entity_id).filter(Boolean));
  console.log(`\nClub Proteccion: ${allClub.length} rows, ${clubEntityIds.size} unique entity_ids`);

  // Get roster entity IDs (Datos Colaborador)
  const rosterIds = new Set<string>();
  page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('entity_id')
      .eq('tenant_id', TENANT_ID).eq('period_id', period.id)
      .eq('data_type', 'Datos Colaborador')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) if (r.entity_id) rosterIds.add(r.entity_id);
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Roster: ${rosterIds.size} unique entity_ids`);

  // Overlap
  let overlap = 0;
  for (const id of Array.from(clubEntityIds)) {
    if (rosterIds.has(id!)) overlap++;
  }
  console.log(`Overlap (club ∩ roster): ${overlap}`);

  // Check entity_id format
  const sampleClubIds = Array.from(clubEntityIds).slice(0, 5);
  const sampleRosterIds = Array.from(rosterIds).slice(0, 5);
  console.log(`\nSample club entity_ids: ${sampleClubIds.join(', ')}`);
  console.log(`Sample roster entity_ids: ${sampleRosterIds.join(', ')}`);

  // Check: What column was used as entity_id for Club Proteccion?
  // Look at the original row_data for num_empleado or Vendedor
  const { data: raw } = await sb.from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', period.id)
    .eq('data_type', 'Base_Club_Proteccion')
    .limit(3);

  if (raw) {
    console.log('\nRaw row_data keys for first 3 rows:');
    for (const r of raw) {
      const rd = r.row_data as Record<string, unknown>;
      const allKeys = Object.keys(rd);
      console.log(`  entity_id=${r.entity_id}`);
      console.log(`    All keys: ${allKeys.join(', ')}`);
      // Show values for likely entity columns
      for (const k of allKeys) {
        if (k.toLowerCase().includes('empleado') || k.toLowerCase().includes('vendedor') ||
            k.toLowerCase().includes('tienda') || k === 'entityId' || k === 'num_empleado') {
          console.log(`    ${k} = ${rd[k]}`);
        }
      }
    }
  }

  // Group by entity and check achievement distribution for roster-matched entities
  const entityData = new Map<string, { sumQuantity: number; sumGoal: number; sumSales: number; rowCount: number }>();
  for (const row of allClub) {
    if (!row.entity_id || !rosterIds.has(row.entity_id)) continue;
    const rd = row.row_data;
    const entry = entityData.get(row.entity_id) || { sumQuantity: 0, sumGoal: 0, sumSales: 0, rowCount: 0 };
    entry.sumQuantity += (typeof rd.quantity === 'number' ? rd.quantity : 0);
    entry.sumGoal += (typeof rd.goal === 'number' ? rd.goal : 0);
    entry.sumSales += (typeof rd.reactivacion_club_proteccion_sales === 'number' ? rd.reactivacion_club_proteccion_sales : 0);
    entry.rowCount++;
    entityData.set(row.entity_id, entry);
  }

  console.log(`\nRoster-matched entities with Club Proteccion data: ${entityData.size}`);

  let ach0 = 0, achLt80 = 0, ach80_100 = 0, ach100plus = 0;
  let totalInsuranceEst = 0;
  for (const [, d] of Array.from(entityData.entries())) {
    const ach = d.sumGoal > 0 ? (d.sumQuantity / d.sumGoal) * 100 : 0;
    if (ach === 0) ach0++;
    else if (ach < 80) achLt80++;
    else if (ach < 100) {
      ach80_100++;
      totalInsuranceEst += d.sumSales * 0.03;
    } else {
      ach100plus++;
      totalInsuranceEst += d.sumSales * 0.05;
    }
  }

  console.log(`  Achievement = 0%: ${ach0}`);
  console.log(`  Achievement 0-80%: ${achLt80}`);
  console.log(`  Achievement 80-99.99%: ${ach80_100} (→ 3% rate)`);
  console.log(`  Achievement ≥ 100%: ${ach100plus} (→ 5% rate)`);
  console.log(`  Estimated insurance total (roster only): MX$${Math.round(totalInsuranceEst).toLocaleString()}`);
  console.log(`  Expected: MX$46,032`);

  // Show a few entities with high achievement
  const entries = Array.from(entityData.entries())
    .map(([id, d]) => ({ id, ...d, ach: d.sumGoal > 0 ? (d.sumQuantity / d.sumGoal) * 100 : 0 }))
    .sort((a, b) => b.ach - a.ach)
    .slice(0, 10);

  console.log('\nTop 10 entities by achievement:');
  for (const e of entries) {
    console.log(`  ${e.id}: quantity=${e.sumQuantity}, goal=${e.sumGoal}, ach=${e.ach.toFixed(1)}%, sales=${e.sumSales}, rows=${e.rowCount}`);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
