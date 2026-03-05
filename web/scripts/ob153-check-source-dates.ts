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
    const { count: withSD } = await sb.from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', T)
      .eq('data_type', dt)
      .not('source_date', 'is', null);

    const { count: withoutSD } = await sb.from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', T)
      .eq('data_type', dt)
      .is('source_date', null);

    console.log(`${dt.split('__')[1] || 'proveedores'}: ${withSD} with source_date, ${withoutSD} without`);
  }

  // Check unique source_dates
  const { data: sdSample } = await sb.from('committed_data')
    .select('source_date, data_type')
    .eq('tenant_id', T)
    .not('source_date', 'is', null)
    .limit(50);

  const sdCounts = new Map<string, number>();
  for (const r of sdSample || []) {
    const key = `${r.source_date}`;
    sdCounts.set(key, (sdCounts.get(key) || 0) + 1);
  }
  console.log('\nSource dates (from sample):', Object.fromEntries(sdCounts));
}

run();
