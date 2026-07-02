// HF-373 EPG-0.4: plan_interpretation_runs — count/start-times of plan interpretation invocations.
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  {
    const { data, error } = await sb.from('plan_interpretation_runs').select('*').limit(1);
    console.log('=== plan_interpretation_runs INTROSPECT ===');
    if (error) console.log('ERROR:', error.code, error.message);
    else if (!data?.length) console.log('EMPTY');
    else console.log('keys:', Object.keys(data[0]).join(', '));
  }
  for (const [name, tid] of [['VLTEST2', VLTEST2], ['CASA_DIAZ', CASA]] as const) {
    const { data, error } = await sb.from('plan_interpretation_runs').select('*')
      .eq('tenant_id', tid).gte('created_at', '2026-07-02T00:00:00Z').order('created_at', { ascending: true }).limit(60);
    console.log(`\n--- ${name} plan_interpretation_runs since 07-02 (${data?.length ?? 0}) ---`);
    if (error) { console.log('ERROR:', error.message); continue; }
    for (const r of (data ?? []) as any[]) {
      const slim: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        const s = JSON.stringify(v);
        slim[k] = s && s.length > 220 ? `<${s.length}B>` : v;
      }
      console.log(JSON.stringify(slim));
    }
  }
}
main().catch(e => { console.error('PROBE FAILED:', e); process.exit(1); });
