import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const OPTICA_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // Get rows that have Fecha Corte
  const { data, count } = await sb.from('committed_data')
    .select('row_data, data_type', { count: 'exact' })
    .eq('tenant_id', OPTICA_ID)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
    .limit(10);

  console.log('Rows with data_type backttest...proveedores:', count);
  if (data && data.length > 0) {
    for (const row of data.slice(0, 3)) {
      const rd = row.row_data as Record<string, unknown>;
      console.log('Fecha Corte:', rd['Fecha Corte']);
    }
  }

  // Also check base_clientes_nuevos
  const { data: d2, count: c2 } = await sb.from('committed_data')
    .select('row_data', { count: 'exact' })
    .eq('tenant_id', OPTICA_ID)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores__base_clientes_nuevos')
    .limit(3);

  console.log('\nRows with data_type ...base_clientes_nuevos:', c2);
  if (d2 && d2.length > 0) {
    for (const row of d2.slice(0, 3)) {
      const rd = row.row_data as Record<string, unknown>;
      console.log('Fecha Corte:', rd['Fecha Corte']);
    }
  }

  // Get all data_type counts
  console.log('\nData type counts:');
  const types = ['backttest_optometrista_mar2025_proveedores',
    'backttest_optometrista_mar2025_proveedores__base_venta_individual',
    'backttest_optometrista_mar2025_proveedores__base_clientes_nuevos',
    'backttest_optometrista_mar2025_proveedores__base_club_proteccion'];
  for (const t of types) {
    const { count } = await sb.from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', OPTICA_ID)
      .eq('data_type', t);
    console.log(`  ${t}: ${count}`);
  }
}

run();
