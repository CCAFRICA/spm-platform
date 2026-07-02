// HF-373 EPG-0.1 read-only probe: engine:exception signals + calculation runs (last 48h)
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const SINCE = '2026-06-30T00:00:00Z';

async function main() {
  const { data: exc } = await sb.from('classification_signals')
    .select('signal_type, signal_value, created_at, calculation_run_id')
    .eq('tenant_id', VLTEST2)
    .eq('signal_type', 'engine:exception')
    .gte('created_at', SINCE)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('[engine:exception] recent count(limit10):', exc?.length);
  const typeCounts: Record<string, number> = {};
  for (const s of exc ?? []) {
    const t = (s.signal_value as any)?.type ?? 'unknown';
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }
  console.log(' type distribution (sample):', JSON.stringify(typeCounts));
  if (exc?.length) console.log(' first:', JSON.stringify(exc[0]).slice(0, 600));

  // exact count of no_convergence_bindings
  const { count } = await sb.from('classification_signals')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', VLTEST2)
    .eq('signal_type', 'engine:exception')
    .gte('created_at', SINCE);
  console.log('[engine:exception] total since', SINCE, '=', count);

  // calculation_runs
  const { data: cr1, error: crErr } = await sb.from('calculation_runs').select('*').eq('tenant_id', VLTEST2).order('created_at', { ascending: false }).limit(3);
  if (crErr) console.error('calculation_runs ERR:', crErr.message);
  if (cr1?.length) {
    console.log('\n[calculation_runs] COLUMNS:', Object.keys(cr1[0]).join(', '));
    for (const r of cr1) {
      const { total_payout, status, created_at, id } = r as any;
      console.log(` - ${id} status=${status} total_payout=${total_payout} created=${created_at}`);
      const md = (r as any).metadata;
      if (md) console.log('   metadata keys:', Object.keys(md).join(', '));
    }
  }

  // calculation_results sample
  const { data: res, error: resErr } = await sb.from('calculation_results').select('*').eq('tenant_id', VLTEST2).order('created_at', { ascending: false }).limit(2);
  if (resErr) console.error('calculation_results ERR:', resErr.message);
  if (res?.length) {
    console.log('\n[calculation_results] COLUMNS:', Object.keys(res[0]).join(', '));
    for (const r of res) {
      console.log(' - sample:', JSON.stringify(r).slice(0, 700));
    }
  }
}
main();
