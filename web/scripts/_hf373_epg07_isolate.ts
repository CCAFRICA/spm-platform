// HF-373 EPG-0.7 read-only probe #2: isolate the timeout mechanism (query-shape variants).
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const CASA_DIAZ = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';   // 263,250 rows
const TESTA1 = 'abb9da8d-d6d5-4ebc-af42-ebb9c972bd8b';  // 331,714 rows
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe'; // 615 rows

async function timed(label: string, q: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const t0 = Date.now();
  const { data, error } = await q;
  const ms = Date.now() - t0;
  if (error) console.log(`  ${label}: ERROR after ${ms}ms -> ${error.message}`);
  else console.log(`  ${label}: ${Array.isArray(data) ? data.length : '?'} rows in ${ms}ms`);
}

async function main() {
  console.log('=== Casa Diaz (186 rows) variants ===');
  await timed('exact engine shape (order id, range 0-999), attempt 1',
    sb.from('committed_data').select('entity_id, source_date, data_type, row_data').eq('tenant_id', CASA_DIAZ).order('id', { ascending: true }).range(0, 999));
  await timed('exact engine shape, attempt 2',
    sb.from('committed_data').select('entity_id, source_date, data_type, row_data').eq('tenant_id', CASA_DIAZ).order('id', { ascending: true }).range(0, 999));
  await timed('NO order, range 0-999',
    sb.from('committed_data').select('entity_id, source_date, data_type, row_data').eq('tenant_id', CASA_DIAZ).range(0, 999));
  await timed('order created_at, range 0-999',
    sb.from('committed_data').select('entity_id, source_date, data_type, row_data').eq('tenant_id', CASA_DIAZ).order('created_at', { ascending: true }).range(0, 999));
  await timed('order id, small select (no row_data)',
    sb.from('committed_data').select('id').eq('tenant_id', CASA_DIAZ).order('id', { ascending: true }).range(0, 999));

  console.log('\n=== Sabor Grupo Gastronomico (263,250 rows) — page-depth degradation ===');
  for (const off of [0, 1000, 50000, 130000, 262000]) {
    await timed(`order id, offset=${off}`,
      sb.from('committed_data').select('entity_id, source_date, data_type, row_data').eq('tenant_id', SABOR).order('id', { ascending: true }).range(off, off + 999));
  }

  console.log('\n=== Test #A1 (331,714 rows) — first page + deep page ===');
  for (const off of [0, 165000, 330000]) {
    await timed(`order id, offset=${off}`,
      sb.from('committed_data').select('entity_id, source_date, data_type, row_data').eq('tenant_id', TESTA1).order('id', { ascending: true }).range(off, off + 999));
  }

  console.log('\n=== VLTEST2 (615 rows) re-check ===');
  await timed('exact engine shape',
    sb.from('committed_data').select('entity_id, source_date, data_type, row_data').eq('tenant_id', VLTEST2).order('id', { ascending: true }).range(0, 999));

  // processing_jobs introspection (FP-49) then last-48h scan with real columns
  console.log('\n=== processing_jobs FP-49 introspect ===');
  const { data: pj } = await sb.from('processing_jobs').select('*').limit(1);
  if (pj && pj[0]) console.log('columns:', Object.keys(pj[0]).join(', '));
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: jobs, error: jErr } = await sb.from('processing_jobs')
    .select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(12);
  if (jErr) console.log('ERROR:', jErr.message);
  else for (const j of (jobs ?? []) as any[]) {
    const meta = j.metadata ? JSON.stringify(j.metadata).slice(0, 200) : 'null';
    console.log(`${j.created_at} tenant=${String(j.tenant_id).slice(0, 8)} status=${j.status} file=${j.file_name ?? j.source_file ?? '?'} meta=${meta}`);
  }
}

main().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
