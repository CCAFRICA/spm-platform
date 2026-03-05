import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // Check proveedores source_date values
  const { data: sample } = await sb.from('committed_data')
    .select('id, source_date')
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
    .limit(5);

  console.log('Proveedores sample:', JSON.stringify(sample));

  // Count by source_date values
  const { data: nullSD } = await sb.from('committed_data')
    .select('id')
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
    .is('source_date', null)
    .limit(5);

  console.log('\nNull source_date rows:', nullSD?.length, 'first IDs:', nullSD?.map(r => r.id).slice(0, 3));

  // Try selecting without null filter
  const { count: totalProv } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores');

  const { count: provNotNull } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
    .not('source_date', 'is', null);

  console.log('\nTotal proveedores:', totalProv, 'with source_date:', provNotNull);

  // Check a row where Tienda is empty (maybe those are the ones without Fecha Corte?)
  const { data: emptyTienda } = await sb.from('committed_data')
    .select('row_data, source_date')
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
    .is('source_date', null)
    .limit(3);

  if (emptyTienda) {
    for (const r of emptyTienda) {
      const rd = r.row_data as Record<string, unknown>;
      console.log('\nNull SD row:', { Tienda: rd['Tienda'], 'Fecha Corte': rd['Fecha Corte'], Meta: rd['Meta_Venta_Tienda'], Real: rd['Real_Venta_Tienda'] });
    }
  }
}

run();
