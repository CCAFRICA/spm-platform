// HF-373 EPG-0.4: full metadata of the plan-file batches + runaway chain count.
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  // Full rows of the 3 batches in VLTEST2 plan import 94b838b8
  {
    const { data } = await sb.from('import_batches').select('*')
      .eq('tenant_id', VLTEST2).eq('metadata->>proposalId', '94b838b8-080a-4bee-8fb2-77527f94ae47')
      .order('created_at', { ascending: true });
    console.log('--- VLTEST2 94b838b8 batches FULL ---');
    for (const r of (data ?? []) as any[]) console.log(JSON.stringify(r));
  }
  // Count of the runaway chain
  {
    const { count } = await sb.from('import_batches').select('*', { count: 'exact', head: true })
      .eq('tenant_id', CASA).eq('metadata->>proposalId', 'bcb1d921-c057-436d-951a-08b35bc38208');
    console.log(`\nCASA bcb1d921 batch count: ${count}`);
  }
  // processing_jobs for the Casa runaway session (identify session/status/retry_count)
  {
    const { data } = await sb.from('processing_jobs').select('id, session_id, file_name, status, retry_count, created_at, started_at, completed_at, error_detail, metadata')
      .eq('tenant_id', CASA).gte('created_at', '2026-07-01T05:00:00Z').lte('created_at', '2026-07-01T07:00:00Z').order('created_at', { ascending: true });
    console.log('\n--- CASA processing_jobs 05:00-07:00 ---');
    for (const r of (data ?? []) as any[]) console.log(JSON.stringify(r).slice(0, 700));
  }
  // Unit-states of VLTEST2 94b838b8 telemetry record (the 5th accumulated unit)
  {
    const { data } = await sb.from('import_session_telemetry').select('unit_states')
      .eq('tenant_id', VLTEST2).eq('import_session_id', '94b838b8-080a-4bee-8fb2-77527f94ae47').maybeSingle();
    const us = (data?.unit_states ?? {}) as Record<string, unknown>;
    const units = new Set(Object.keys(us).map(k => k.split('')[0]));
    console.log('\n--- VLTEST2 94b838b8 telemetry unit ids ---');
    for (const u of units) console.log(u);
    // per-unit commit fields
    for (const u of units) {
      const f = (n: string) => us[`${u}${n}`];
      console.log(JSON.stringify({ unit: u, state: f('state'), expectedRows: f('expectedRows'), rowsCommitted: f('rowsCommitted'), pulsesTotal: f('pulsesTotal'), pulsesLanded: f('pulsesLanded'), batchCommitted: f('batchCommitted'), sheetName: f('sheetName') }));
    }
  }
}
main().catch(e => { console.error('PROBE FAILED:', e); process.exit(1); });
