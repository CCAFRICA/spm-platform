// HF-360 (§3 gate 2) — FEASIBILITY PROBE (read-only). Can a DATABASE-SIDE worker do the FDW loads off the
// serverless clock? Probe pgmq (Supabase Queues), pg_cron, pg_net, and the existing load RPC via the
// service-role client. No writes that persist (a test enqueue is popped/cleaned if pgmq is reachable). SR-44.
//   from web/:  npx tsx scripts/_hf360_feasibility_probe.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const base: any = createClient(URL, KEY, { auth: { persistSession: false } });

async function tryIt(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    const r = await fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = (r as any)?.error;
    if (err) console.log(`  ${label.padEnd(46)} → ERR ${err.code ?? ''} ${String(err.message).slice(0, 80)}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else console.log(`  ${label.padEnd(46)} → OK ${JSON.stringify((r as any)?.data ?? r).slice(0, 90)}`);
  } catch (e) {
    console.log(`  ${label.padEnd(46)} → THREW ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
  }
}

async function main() {
  console.log('=== HF-360 FEASIBILITY PROBE (read-only) ===\n');

  console.log('— the existing load RPC (HF-356) the worker would call —');
  await tryIt("rpc bulk_commit_from_storage (bad args, expect param/exec err not 'missing')", () =>
    base.rpc('bulk_commit_from_storage', { p_tenant_id: '00000000-0000-0000-0000-000000000000', p_csv_path: '__nope__/x.csv', p_import_batch_id: '00000000-0000-0000-0000-000000000000' }));

  console.log('\n— pgmq (Supabase Queues): is the public RPC surface reachable? —');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pgmqPub: any = createClient(URL, KEY, { auth: { persistSession: false }, db: { schema: 'pgmq_public' } });
  await tryIt("pgmq_public.list_queues()", () => pgmqPub.rpc('list_queues'));
  await tryIt("pgmq_public.send(queue_name,message)", () => pgmqPub.rpc('send', { queue_name: '__hf360_probe__', message: { ping: 1 }, sleep_seconds: 0 }));
  await tryIt("pgmq_public.pop(queue_name)", () => pgmqPub.rpc('pop', { queue_name: '__hf360_probe__' }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pgmqRaw: any = createClient(URL, KEY, { auth: { persistSession: false }, db: { schema: 'pgmq' } });
  await tryIt("pgmq.list_queues() (raw schema)", () => pgmqRaw.rpc('list_queues'));

  console.log('\n— pg_cron: is the cron schema reachable from PostgREST? —');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cron: any = createClient(URL, KEY, { auth: { persistSession: false }, db: { schema: 'cron' } });
  await tryIt("cron.job (select)", () => cron.from('job').select('jobid, schedule, command').limit(3));

  console.log('\n— pg_net: HTTP-from-DB (an alternative worker-trigger mechanism) —');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const net: any = createClient(URL, KEY, { auth: { persistSession: false }, db: { schema: 'net' } });
  await tryIt("net.http_get (probe reachability, bad url)", () => net.rpc('http_get', { url: 'http://127.0.0.1:1/__probe__' }));

  console.log('\n— extension catalog via PostgREST (expected PGRST205 — not exposed) —');
  await tryIt("pg_extension (public)", () => base.from('pg_extension').select('extname').limit(50));
  await tryIt("pg_available_extensions (public)", () => base.from('pg_available_extensions').select('name').limit(50));

  console.log('\n=== PROBE COMPLETE — interpret: OK = reachable from the app; ERR/THREW = not reachable here ===');
  console.log('(schema-not-exposed / function-missing does NOT prove the extension is absent — the architect');
  console.log(' confirms pg_cron/pgmq in the SQL Editor; this probe establishes what the FUNCTION can reach.)');
}
main().catch((e) => { console.error('[FATAL]', e instanceof Error ? e.message : e); process.exit(1); });
