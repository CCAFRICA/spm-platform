/**
 * OB-88 Fix v2: Insurance enrichment — achievement must be computed
 * post-aggregation, not per-row (otherwise 80% × 25 rows = 2000% sum)
 *
 * Fix: Remove club_protection_achievement from per-row enrichment.
 * Instead add quantity/goal keys so computeAttainmentFromGoal works.
 * The engine resolves club_protection_achievement → semantic 'attainment'.
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getNumTrimmed(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    // Exact match
    if (typeof row[k] === 'number' && !isNaN(row[k] as number)) return row[k] as number;
    // Trimmed key match
    for (const [rk, rv] of Object.entries(row)) {
      if (rk.trim() === k && typeof rv === 'number' && !isNaN(rv)) return rv;
    }
  }
  return 0;
}

async function main() {
  console.log('=== Fix Insurance v2 ===\n');

  const { data: period } = await sb.from('periods')
    .select('id').eq('tenant_id', TENANT_ID).eq('canonical_key', '2024-01').single();
  if (!period) throw new Error('Period not found');

  // Fetch all Base_Club_Proteccion rows for Jan 2024
  const allRows: Array<{
    id: string; entity_id: string | null; period_id: string | null;
    import_batch_id: string | null; data_type: string;
    row_data: Record<string, unknown>; metadata: Record<string, unknown> | null;
  }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('id, entity_id, period_id, import_batch_id, data_type, row_data, metadata')
      .eq('tenant_id', TENANT_ID).eq('period_id', period.id)
      .eq('data_type', 'Base_Club_Proteccion')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allRows.push(...(data as typeof allRows));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Rows: ${allRows.length}`);

  // Enrich: sales amount + quantity/goal for attainment (NO pre-computed achievement)
  const enriched = allRows.map(row => {
    const rd = row.row_data;
    const salesAmount = getNumTrimmed(rd, 'Monto Club Protection');
    const actualCount = getNumTrimmed(rd, 'No Actual Club Protection');
    const goalCount = getNumTrimmed(rd, 'No Meta Club Protection');

    // Remove bad keys from previous enrichment, add correct ones
    const newRd = { ...rd };
    delete newRd['club_protection_achievement']; // Remove: gets summed incorrectly
    delete newRd['amount']; // Remove: conflicts with computeAttainmentFromGoal

    // Add correct enrichment
    newRd['reactivacion_club_proteccion_sales'] = salesAmount;
    newRd['quantity'] = actualCount;  // No Actual → quantity (for computeAttainmentFromGoal)
    newRd['goal'] = goalCount;        // No Meta → goal (for computeAttainmentFromGoal)

    return {
      tenant_id: TENANT_ID,
      entity_id: row.entity_id,
      period_id: row.period_id,
      import_batch_id: row.import_batch_id,
      data_type: row.data_type,
      row_data: newRd,
      metadata: row.metadata,
    };
  });

  // Verify with manual aggregation for one entity
  const entityGroups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of enriched) {
    if (!row.entity_id) continue;
    if (!entityGroups.has(row.entity_id)) entityGroups.set(row.entity_id, []);
    entityGroups.get(row.entity_id)!.push(row.row_data);
  }

  let nonZeroSales = 0;
  let achIn80_100 = 0;
  let achIn100_999 = 0;
  let achBelow80 = 0;

  for (const [entityId, rows] of Array.from(entityGroups.entries())) {
    let sumSales = 0, sumActual = 0, sumGoal = 0;
    for (const rd of rows) {
      sumSales += (rd['reactivacion_club_proteccion_sales'] as number) || 0;
      sumActual += (rd['quantity'] as number) || 0;
      sumGoal += (rd['goal'] as number) || 0;
    }
    const achievement = sumGoal > 0 ? (sumActual / sumGoal) * 100 : 0;
    if (sumSales > 0) nonZeroSales++;
    if (achievement >= 80 && achievement < 100) achIn80_100++;
    else if (achievement >= 100) achIn100_999++;
    else achBelow80++;
  }

  console.log(`Unique entities: ${entityGroups.size}`);
  console.log(`Non-zero sales: ${nonZeroSales}`);
  console.log(`Achievement < 80%: ${achBelow80}`);
  console.log(`Achievement 80-99.99%: ${achIn80_100} (→ 3% rate)`);
  console.log(`Achievement ≥ 100%: ${achIn100_999} (→ 5% rate)`);

  // Estimate insurance total
  let estTotal = 0;
  for (const [, rows] of Array.from(entityGroups.entries())) {
    let sumSales = 0, sumActual = 0, sumGoal = 0;
    for (const rd of rows) {
      sumSales += (rd['reactivacion_club_proteccion_sales'] as number) || 0;
      sumActual += (rd['quantity'] as number) || 0;
      sumGoal += (rd['goal'] as number) || 0;
    }
    const achievement = sumGoal > 0 ? (sumActual / sumGoal) * 100 : 0;
    if (achievement >= 100) estTotal += sumSales * 0.05;
    else if (achievement >= 80) estTotal += sumSales * 0.03;
  }
  console.log(`Estimated insurance total: MX$${Math.round(estTotal).toLocaleString()} (expected: MX$46,032)`);

  // Delete and re-insert
  const ids = allRows.map(r => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    await sb.from('committed_data').delete().in('id', ids.slice(i, i + 500));
  }
  for (let i = 0; i < enriched.length; i += 2000) {
    const { error } = await sb.from('committed_data').insert(enriched.slice(i, i + 2000));
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }
  console.log(`\nRe-inserted ${enriched.length} rows`);

  // Clean old calc data
  const { data: batches } = await sb.from('calculation_batches').select('id').eq('tenant_id', TENANT_ID);
  if (batches) {
    for (const b of batches) await sb.from('calculation_results').delete().eq('batch_id', b.id);
    await sb.from('calculation_batches').delete().eq('tenant_id', TENANT_ID);
    console.log(`Cleared ${batches.length} calculation batches`);
  }
  await sb.from('entity_period_outcomes').delete().eq('tenant_id', TENANT_ID);

  console.log('\n=== Fix complete ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
