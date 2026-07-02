// HF-373 EPG-0.6 probe 4: plan_interpretation_runs + committed_data introspection (FP-49)
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  const { data: pr1, error: pe } = await sb.from('plan_interpretation_runs').select('*').limit(1);
  console.log('plan_interpretation_runs columns:', pr1?.length ? JSON.stringify(Object.keys(pr1[0])) : `err=${pe?.message}`);
  const { data: runs, error: re } = await sb.from('plan_interpretation_runs').select('*')
    .eq('tenant_id', CASA).gte('created_at', '2026-07-01T00:00:00Z').order('created_at');
  console.log(`\n=== CASA plan_interpretation_runs (${runs?.length ?? 0}, err=${re?.message ?? 'none'}) ===`);
  for (const r of runs ?? []) console.log(JSON.stringify(r));

  // committed_data: introspect one CASA row
  const { data: cd1, error: ce } = await sb.from('committed_data').select('*').eq('tenant_id', CASA).limit(1);
  console.log('\ncommitted_data columns:', cd1?.length ? JSON.stringify(Object.keys(cd1[0])) : `no rows / err=${ce?.message}`);
  const { count } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', CASA);
  console.log('committed_data CASA count =', count);
  if (cd1?.length) {
    // min/max created_at
    const { data: f } = await sb.from('committed_data').select('created_at, source_file, data_type').eq('tenant_id', CASA).order('created_at', { ascending: true }).limit(1);
    const { data: l } = await sb.from('committed_data').select('created_at, source_file, data_type').eq('tenant_id', CASA).order('created_at', { ascending: false }).limit(1);
    console.log('first:', JSON.stringify(f), '\nlast:', JSON.stringify(l));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
