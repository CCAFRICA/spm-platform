import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  const roles = new Map<string, number>();
  let offset = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', T)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores__datos_colaborador')
      .gte('source_date', '2024-01-01')
      .lte('source_date', '2024-01-31')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = r.row_data as Record<string, unknown>;
      const role = String(rd['Puesto'] ?? 'UNKNOWN');
      roles.set(role, (roles.get(role) || 0) + 1);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  console.log('=== Role Distribution (January) ===');
  for (const [role, count] of Array.from(roles.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${role}: ${count}`);
  }
}
run().catch(console.error);
