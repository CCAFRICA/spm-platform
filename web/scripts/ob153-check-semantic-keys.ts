import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  const types = [
    'backttest_optometrista_mar2025_proveedores',
    'backttest_optometrista_mar2025_proveedores__base_venta_individual',
    'backttest_optometrista_mar2025_proveedores__base_clientes_nuevos',
    'backttest_optometrista_mar2025_proveedores__base_club_proteccion',
  ];

  for (const dt of types) {
    const { data: sample } = await sb.from('committed_data')
      .select('row_data, metadata, entity_id')
      .eq('tenant_id', T)
      .eq('data_type', dt)
      .limit(1);

    if (sample && sample.length > 0) {
      const rd = sample[0].row_data as Record<string, unknown>;
      const meta = sample[0].metadata as Record<string, unknown> | null;
      console.log(`\n=== ${dt} ===`);
      console.log('entity_id:', sample[0].entity_id ? 'SET' : 'NULL');
      console.log('row_data keys:', Object.keys(rd).join(', '));
      console.log('row_data values:', JSON.stringify(rd, null, 2));
      if (meta?.semantic_roles) {
        console.log('semantic_roles:', JSON.stringify(meta.semantic_roles, null, 2));
      } else {
        console.log('semantic_roles: NONE');
      }
    }
  }
}

run();
