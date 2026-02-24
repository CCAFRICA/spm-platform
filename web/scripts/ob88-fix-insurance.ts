/**
 * OB-88 Fix: Insurance field name has leading/trailing spaces
 * ' Monto Club Protection ' → need to trim when enriching
 * Also re-investigate warranty Vendedor matching
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getNum(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    // Try exact match first
    const v = row[k];
    if (typeof v === 'number' && !isNaN(v)) return v;
    // Try trimmed key match (handles ' Monto Club Protection ' etc.)
    for (const [rowKey, rowVal] of Object.entries(row)) {
      if (rowKey.trim() === k && typeof rowVal === 'number' && !isNaN(rowVal)) {
        return rowVal;
      }
    }
  }
  return 0;
}

async function main() {
  console.log('=== Fix Insurance + Warranty ===\n');

  const { data: period } = await sb.from('periods')
    .select('id').eq('tenant_id', TENANT_ID).eq('canonical_key', '2024-01').single();
  if (!period) throw new Error('Period not found');

  // ── Fix 1: Re-enrich Base_Club_Proteccion ──
  console.log('Fix 1: Re-enriching Base_Club_Proteccion...');

  const allClub: Array<{
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
    allClub.push(...(data as typeof allClub));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`  Rows: ${allClub.length}`);

  // Enrich with trimmed field name lookup
  let nonZeroSales = 0;
  const enriched = allClub.map(row => {
    const rd = row.row_data;
    const salesAmount = getNum(rd, 'Monto Club Protection');
    const actualCount = getNum(rd, 'No Actual Club Protection');
    const goalCount = getNum(rd, 'No Meta Club Protection');

    if (salesAmount > 0) nonZeroSales++;

    return {
      tenant_id: TENANT_ID,
      entity_id: row.entity_id,
      period_id: row.period_id,
      import_batch_id: row.import_batch_id,
      data_type: row.data_type,
      row_data: {
        ...rd,
        reactivacion_club_proteccion_sales: salesAmount,
        club_protection_achievement: goalCount > 0 ? (actualCount / goalCount) * 100 : 0,
        amount: salesAmount,
      },
      metadata: row.metadata,
    };
  });

  console.log(`  Non-zero insurance sales: ${nonZeroSales}`);

  // Delete and re-insert
  const ids = allClub.map(r => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    await sb.from('committed_data').delete().in('id', ids.slice(i, i + 500));
  }
  for (let i = 0; i < enriched.length; i += 2000) {
    const { error } = await sb.from('committed_data').insert(enriched.slice(i, i + 2000));
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }

  // Verify
  const { data: sample } = await sb.from('committed_data')
    .select('row_data').eq('tenant_id', TENANT_ID).eq('period_id', period.id)
    .eq('data_type', 'Base_Club_Proteccion').limit(3);
  if (sample) {
    for (const s of sample) {
      const rd = s.row_data as Record<string, unknown>;
      console.log(`  sales=${rd['reactivacion_club_proteccion_sales']}, achievement=${rd['club_protection_achievement']}`);
    }
  }

  // ── Fix 2: Warranty — check if Vendedor can be linked via store ──
  console.log('\nFix 2: Warranty analysis...');

  // Get all warranty rows and their Vendedor -> Monto
  const vendedorMonto = new Map<string, number>();
  page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data').eq('tenant_id', TENANT_ID).eq('period_id', period.id)
      .eq('data_type', 'Base_Garantia_Extendida')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = r.row_data as Record<string, unknown>;
      const vendedor = String(rd.Vendedor || '');
      const monto = typeof rd.Monto === 'number' ? rd.Monto : 0;
      vendedorMonto.set(vendedor, (vendedorMonto.get(vendedor) || 0) + monto);
    }
    if (data.length < 1000) break;
    page++;
  }

  let totalWarrantyAmount = 0;
  for (const [, v] of Array.from(vendedorMonto.entries())) {
    totalWarrantyAmount += v;
  }

  console.log(`  Total warranty transactions: ${vendedorMonto.size} unique Vendedores`);
  console.log(`  Total warranty amount: MX$${totalWarrantyAmount.toLocaleString()}`);
  console.log(`  Expected warranty total: MX$151,250`);
  console.log(`  At 4% rate, needed base: MX$${(151250 / 0.04).toLocaleString()}`);
  console.log(`  Actual base if all mapped: MX$${totalWarrantyAmount.toLocaleString()}`);
  console.log(`  At 4% of all: MX$${(totalWarrantyAmount * 0.04).toLocaleString()}`);

  // ── Clean old calc data ──
  console.log('\nCleaning old calculation data...');
  const { data: batches } = await sb.from('calculation_batches').select('id').eq('tenant_id', TENANT_ID);
  if (batches) {
    for (const b of batches) {
      await sb.from('calculation_results').delete().eq('batch_id', b.id);
    }
    await sb.from('calculation_batches').delete().eq('tenant_id', TENANT_ID);
    console.log(`  Cleared ${batches.length} batches`);
  }
  await sb.from('entity_period_outcomes').delete().eq('tenant_id', TENANT_ID);

  console.log('\n=== Fix complete ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
