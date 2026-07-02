// HF-373 EPG-0.4: unit_state signal timeline per session — detects multi-fire commits.
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function timeline(tid: string, session: string, label: string) {
  const { data, error } = await sb.from('classification_signals')
    .select('signal_type, signal_value, created_at')
    .eq('tenant_id', tid)
    .eq('context->>importSessionId', session)
    .order('created_at', { ascending: true })
    .limit(400);
  console.log(`\n--- ${label} session=${session} signals=${data?.length ?? 0} ---`);
  if (error) { console.log('ERROR:', error.message); return; }
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as any[]) {
    const sv = r.signal_value ?? {};
    if (r.signal_type === 'comprehension:unit_state') {
      const key = `${sv.unitId} :: ${sv.state}`;
      counts[key] = (counts[key] ?? 0) + 1;
      console.log(`${r.created_at}  unit_state  ${sv.state}  seq=${sv.seq}  ${sv.unitId}`);
    }
  }
  console.log('duplicate unit_state emissions (count>1):');
  for (const [k, c] of Object.entries(counts)) if (c > 1) console.log(`  x${c}  ${k}`);
}

async function main() {
  await timeline(VLTEST2, '94b838b8-080a-4bee-8fb2-77527f94ae47', 'VLTEST2 plan import');
  await timeline(CASA, '5851bd78-2382-4db9-afdb-fded902a08b0', 'CASA plan import');
  await timeline(CASA, '6291bd7c-fb5c-4ceb-ba67-f985b149a8b7', 'CASA failed data import');
}
main().catch(e => { console.error('PROBE FAILED:', e); process.exit(1); });
