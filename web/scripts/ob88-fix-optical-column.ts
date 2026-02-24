/**
 * OB-88 Fix: Correct optical_sales_amount to use sum of Venta_Individual per store
 *
 * Discovery: `suma nivel tienda` = sum of Meta_Individual (store GOAL), not actual sales.
 * The matrix column axis needs store ACTUAL optical sales = sum of Venta_Individual per store.
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log('=== Fix optical_sales_amount ===\n');

  // Get Jan 2024 period
  const { data: period } = await sb.from('periods')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('canonical_key', '2024-01')
    .single();
  if (!period) throw new Error('Period not found');

  // Fetch all Base_Venta_Individual rows for Jan 2024
  const allRows: Array<{ id: string; row_data: Record<string, unknown> }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('id, row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', period.id)
      .eq('data_type', 'Base_Venta_Individual')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allRows.push(...(data as typeof allRows));
    if (data.length < 1000) break;
    page++;
  }

  console.log(`Rows: ${allRows.length}`);

  // Step 1: Compute sum of Venta_Individual per store
  const storeActualSales = new Map<number | string, number>();
  for (const row of allRows) {
    const rd = row.row_data;
    const store = rd.num_tienda as number | string;
    const venta = typeof rd.Venta_Individual === 'number' ? rd.Venta_Individual : 0;
    storeActualSales.set(store, (storeActualSales.get(store) || 0) + venta);
  }

  console.log(`Unique stores: ${storeActualSales.size}`);

  // Show distribution of store optical sales
  const salesValues = Array.from(storeActualSales.values()).sort((a, b) => a - b);
  console.log(`Store optical sales range: ${salesValues[0]} - ${salesValues[salesValues.length - 1]}`);
  console.log(`Median: ${salesValues[Math.floor(salesValues.length / 2)]}`);

  // Count per column band
  const bands = [
    { label: '<$60k', min: 0, max: 59999, count: 0 },
    { label: '$60k-$100k', min: 60000, max: 99999, count: 0 },
    { label: '$100k-$120k', min: 100000, max: 119999, count: 0 },
    { label: '$120k-$180k', min: 120000, max: 179999, count: 0 },
    { label: '$180k+', min: 180000, max: Infinity, count: 0 },
  ];
  for (const v of salesValues) {
    for (const b of bands) {
      if (v >= b.min && v <= b.max) { b.count++; break; }
    }
  }
  for (const b of bands) {
    console.log(`  ${b.label}: ${b.count} stores`);
  }

  // Step 2: Delete existing rows and re-insert with corrected optical_sales_amount
  const enrichedRows: typeof allRows = [];
  for (const row of allRows) {
    const rd = row.row_data;
    const store = rd.num_tienda as number | string;
    const storeActual = storeActualSales.get(store) || 0;
    enrichedRows.push({
      ...row,
      row_data: {
        ...rd,
        optical_sales_amount: storeActual,
      },
    });
  }

  // Fetch full rows for re-insertion
  const fullRows: Array<{
    id: string; entity_id: string | null; period_id: string | null;
    import_batch_id: string | null; data_type: string;
    row_data: Record<string, unknown>; metadata: Record<string, unknown> | null;
  }> = [];
  page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('id, entity_id, period_id, import_batch_id, data_type, row_data, metadata')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', period.id)
      .eq('data_type', 'Base_Venta_Individual')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    fullRows.push(...(data as typeof fullRows));
    if (data.length < 1000) break;
    page++;
  }

  // Update optical_sales_amount in each row
  const rowMap = new Map(fullRows.map(r => [r.id, r]));

  // Delete
  const ids = fullRows.map(r => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    await sb.from('committed_data').delete().in('id', ids.slice(i, i + 500));
  }
  console.log(`Deleted ${ids.length} rows`);

  // Re-insert with corrected optical_sales_amount
  const insertRows = fullRows.map(r => {
    const store = (r.row_data as Record<string, unknown>).num_tienda as number | string;
    const storeActual = storeActualSales.get(store) || 0;
    return {
      tenant_id: TENANT_ID,
      entity_id: r.entity_id,
      period_id: r.period_id,
      import_batch_id: r.import_batch_id,
      data_type: r.data_type,
      row_data: { ...(r.row_data as Record<string, unknown>), optical_sales_amount: storeActual },
      metadata: r.metadata,
    };
  });

  for (let i = 0; i < insertRows.length; i += 2000) {
    const { error } = await sb.from('committed_data').insert(insertRows.slice(i, i + 2000));
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }
  console.log(`Re-inserted ${insertRows.length} rows`);

  // Verify a sample
  const { data: sample } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', period.id)
    .eq('data_type', 'Base_Venta_Individual')
    .limit(3);

  if (sample) {
    for (const s of sample) {
      const rd = s.row_data as Record<string, unknown>;
      console.log(`  Store ${rd.num_tienda}: optical_sales_amount=${rd.optical_sales_amount}, Venta_Individual=${rd.Venta_Individual}`);
    }
  }

  console.log('\n=== Fix complete ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
