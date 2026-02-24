import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';

async function main() {
  // Check ALL fields in Base_Venta_Tienda
  const { data: samples } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
    .eq('data_type', 'Base_Venta_Tienda')
    .limit(5);

  if (samples?.[0]) {
    console.log('=== Base_Venta_Tienda: ALL fields ===');
    const rd = samples[0].row_data as Record<string, unknown>;
    for (const [k, v] of Object.entries(rd)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
  }

  // Check stores 387 and 10 specifically
  for (const storeId of ['387', '10', '23', '298']) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Base_Venta_Tienda')
      .limit(5);

    // Find the store in the results
    for (const r of data || []) {
      const rd = r.row_data as Record<string, unknown>;
      if (String(rd.Tienda) === storeId || String(rd.storeId) === storeId) {
        console.log(`\n=== Store ${storeId} (Base_Venta_Tienda) ===`);
        for (const [k, v] of Object.entries(rd)) {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
        break;
      }
    }
  }

  // Actually, search ALL stores to find specific ones
  let page = 0;
  const targetStores = new Set(['387', '10', '23', '298', '468', '1']);
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Base_Venta_Tienda')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = r.row_data as Record<string, unknown>;
      const store = String(rd.Tienda || rd.storeId || '');
      if (targetStores.has(store)) {
        console.log(`\n=== Store ${store} (Base_Venta_Tienda) ===`);
        for (const [k, v] of Object.entries(rd)) {
          if (typeof v === 'number' || k.includes('Tienda') || k.includes('store') || k.includes('Venta') || k.includes('Meta') || k.includes('Real')) {
            console.log(`  ${k}: ${JSON.stringify(v)}`);
          }
        }
        targetStores.delete(store);
      }
    }
    if (targetStores.size === 0 || data.length < 1000) break;
    page++;
  }

  // Also check: what fields does the INDIVIDUAL row have that might be the column metric?
  console.log('\n\n=== Base_Venta_Individual: ALL fields (first row) ===');
  const { data: viSample } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
    .eq('data_type', 'Base_Venta_Individual')
    .limit(1);
  if (viSample?.[0]) {
    const rd = viSample[0].row_data as Record<string, unknown>;
    for (const [k, v] of Object.entries(rd)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
  }

  // Check employees at store 10 to see ALL their fields
  console.log('\n=== Employees at store 10 ===');
  page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Base_Venta_Individual')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = r.row_data as Record<string, unknown>;
      if (String(rd.num_tienda) === '10') {
        console.log(`\n  Employee ${rd.num_empleado} at store 10:`);
        for (const [k, v] of Object.entries(rd)) {
          console.log(`    ${k}: ${JSON.stringify(v)}`);
        }
      }
    }
    if (data.length < 1000) break;
    page++;
  }
}

main().catch(console.error);
