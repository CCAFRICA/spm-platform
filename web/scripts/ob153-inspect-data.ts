import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const OPTICA_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // Get distinct data_types
  const { data: types } = await sb.from('committed_data')
    .select('data_type')
    .eq('tenant_id', OPTICA_ID)
    .limit(1000);

  const typeSet = new Set((types || []).map(t => t.data_type));
  console.log('Data types:', Array.from(typeSet));

  // Sample a few rows per type
  for (const dt of Array.from(typeSet)) {
    const { data: sample } = await sb.from('committed_data')
      .select('row_data, source_date, metadata')
      .eq('tenant_id', OPTICA_ID)
      .eq('data_type', dt)
      .limit(2);

    if (sample && sample.length > 0) {
      console.log(`\n--- ${dt} ---`);
      const rd = sample[0].row_data as Record<string, unknown>;
      console.log('Keys:', Object.keys(rd).filter(k => !k.startsWith('_')).join(', '));
      console.log('source_date:', sample[0].source_date);
      // Show values that look like dates
      for (const [k, v] of Object.entries(rd)) {
        if (k.startsWith('_')) continue;
        if (typeof v === 'string' && v.match(/^\d{4}-\d{2}/)) {
          console.log(`  ${k}: "${v}" (date-like string)`);
        }
        if (typeof v === 'number' && v > 40000 && v < 50000) {
          const date = new Date((v - 25569) * 86400 * 1000);
          console.log(`  ${k}: ${v} → ${date.toISOString().split('T')[0]} (Excel serial)`);
        }
      }
      // Show metadata semantic_roles if present
      const meta = sample[0].metadata as Record<string, unknown>;
      if (meta?.semantic_roles) {
        console.log('Semantic roles:', JSON.stringify(meta.semantic_roles).substring(0, 200));
      }
    }
  }
}

run();
