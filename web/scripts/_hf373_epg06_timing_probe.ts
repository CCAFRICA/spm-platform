// HF-373 EPG-0.6 probe 3: timing evidence — batches, rule_sets, retry_counts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  // retry_count across the run's jobs
  const { data: jobs } = await sb.from('processing_jobs')
    .select('id, file_name, status, retry_count, completed_at')
    .gte('created_at', '2026-07-01T20:00:00Z')
    .in('tenant_id', [CASA, VLTEST2])
    .order('created_at');
  console.log('=== retry_count across run jobs ===');
  for (const j of jobs ?? []) console.log(`${j.file_name?.slice(-40)} status=${j.status} retry_count=${j.retry_count} completed_at=${j.completed_at}`);

  // import_batches: introspect + Casa Diaz rows in window
  const { data: b1 } = await sb.from('import_batches').select('*').limit(1);
  if (b1?.length) console.log('\nimport_batches columns:', JSON.stringify(Object.keys(b1[0])));
  const { data: batches } = await sb.from('import_batches')
    .select('id, tenant_id, status, source_file, row_count, created_at, completed_at, error_summary, metadata')
    .eq('tenant_id', CASA)
    .gte('created_at', '2026-07-02T00:00:00Z')
    .order('created_at');
  console.log(`\n=== Casa Diaz import_batches 2026-07-02 (${batches?.length ?? 0}) ===`);
  for (const b of batches ?? []) {
    const { metadata, ...rest } = b as Record<string, unknown> & { metadata?: unknown };
    console.log(JSON.stringify(rest), 'meta_keys=', metadata ? JSON.stringify(Object.keys(metadata as object)) : 'null');
  }

  // rule_sets for Casa Diaz — plan interpretation completion timing
  const { data: rs } = await sb.from('rule_sets')
    .select('id, name, status, created_at, updated_at')
    .eq('tenant_id', CASA)
    .order('created_at');
  console.log(`\n=== Casa Diaz rule_sets (${rs?.length ?? 0}) ===`);
  for (const r of rs ?? []) console.log(JSON.stringify(r));

  // committed_data timing for the workbook session (min/max created)
  const { data: cdFirst } = await sb.from('committed_data')
    .select('created_at, source_file')
    .eq('tenant_id', CASA)
    .gte('created_at', '2026-07-02T00:00:00Z')
    .order('created_at', { ascending: true }).limit(1);
  const { data: cdLast } = await sb.from('committed_data')
    .select('created_at, source_file')
    .eq('tenant_id', CASA)
    .gte('created_at', '2026-07-02T00:00:00Z')
    .order('created_at', { ascending: false }).limit(1);
  console.log('\ncommitted_data CASA first:', JSON.stringify(cdFirst), 'last:', JSON.stringify(cdLast));

  // entities creation timing
  const { data: entFirst } = await sb.from('entities')
    .select('created_at').eq('tenant_id', CASA).order('created_at', { ascending: true }).limit(1);
  const { data: entLast } = await sb.from('entities')
    .select('created_at').eq('tenant_id', CASA).order('created_at', { ascending: false }).limit(1);
  const { count: entCount } = await sb.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', CASA);
  console.log(`entities CASA count=${entCount} first=${JSON.stringify(entFirst)} last=${JSON.stringify(entLast)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
