import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
  const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';

  // Get ALL column names from Datos Colaborador
  const { data: sample } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
    .eq('data_type', 'Datos Colaborador')
    .limit(3);

  if (sample?.[0]) {
    const rd = sample[0].row_data as Record<string, unknown>;
    console.log('ALL Datos Colaborador columns:');
    for (const [k, v] of Object.entries(rd)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
  }

  // Look for certification-related fields
  console.log('\n\nSearching for certification columns...');
  for (const s of sample || []) {
    const rd = s.row_data as Record<string, unknown>;
    for (const [k, v] of Object.entries(rd)) {
      const kl = k.toLowerCase();
      if (kl.includes('cert') || kl.includes('tipo') || kl.includes('categ') ||
          kl.includes('nivel') || kl.includes('puesto') || kl.includes('role') ||
          kl.includes('status') || kl.includes('estado') || kl.includes('class')) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }
  }

  // Get distinct values for any puesto/tipo field
  console.log('\n\nDistinct puesto/tipo values:');
  const puestoValues = new Map<string, number>();
  let page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Datos Colaborador')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = r.row_data as Record<string, unknown>;
      // Check all fields for certification-like values
      for (const [k, v] of Object.entries(rd)) {
        const kl = k.toLowerCase();
        if (kl.includes('puesto') || kl.includes('tipo') || kl.includes('categ') || kl.includes('cert')) {
          const key = `${k}:${v}`;
          puestoValues.set(key, (puestoValues.get(key) || 0) + 1);
        }
      }
    }
    if (data.length < 1000) break;
    page++;
  }
  for (const [k, v] of Array.from(puestoValues.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  // Also check how the engine resolves variants
  // Check variant matching logic
  console.log('\n\nChecking Base_Venta_Individual for any certification columns:');
  const { data: viSample } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
    .eq('data_type', 'Base_Venta_Individual')
    .limit(1);

  if (viSample?.[0]) {
    const rd = viSample[0].row_data as Record<string, unknown>;
    for (const [k, v] of Object.entries(rd)) {
      const kl = k.toLowerCase();
      if (kl.includes('cert') || kl.includes('puesto') || kl.includes('tipo') ||
          kl.includes('categ') || kl.includes('titulado')) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }
  }
}

main().catch(console.error);
