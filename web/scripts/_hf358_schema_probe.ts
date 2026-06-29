// HF-358 (FP-49) — READ-ONLY live schema + state probe. No writes, no DDL, no import. SR-44 safe.
//   from web/:  npx tsx scripts/_hf358_schema_probe.ts
// Confirms the columns/status facts HF-358 depends on and Casa Diaz's current state (the Clean Slate +
// re-import target). Pure SELECT/count. Nothing is mutated.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function columnsOf(table: string): Promise<string[]> {
  const { data, error } = await sb.from(table).select('*').limit(1);
  if (error) return [`<error: ${error.code ?? ''} ${error.message}>`];
  return data && data.length ? Object.keys(data[0]) : ['<no rows — cannot infer columns from data>'];
}
async function hasTenantId(table: string): Promise<string> {
  const { error } = await sb.from(table).select('tenant_id').limit(1);
  if (!error) return 'tenant_id ✓';
  if (error.code === '42P01') return 'MISSING TABLE (42P01)';
  if ((error.message || '').includes('tenant_id')) return 'NO tenant_id column';
  return `err: ${error.code ?? ''} ${error.message}`;
}
async function count(table: string, filter?: (q: any) => any): Promise<number | string> {
  let q = sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', CASA);
  if (filter) q = filter(q);
  const { count: c, error } = await q;
  return error ? `<err ${error.code ?? ''}: ${error.message}>` : (c ?? 0);
}

async function main() {
  console.log('=== HF-358 FP-49 SCHEMA + STATE PROBE (read-only) ===\n');

  console.log('— committed_data columns —');
  console.log('  ', (await columnsOf('committed_data')).join(', '));
  console.log('— processing_jobs columns —');
  console.log('  ', (await columnsOf('processing_jobs')).join(', '));
  console.log('— import_batches columns —');
  console.log('  ', (await columnsOf('import_batches')).join(', '));

  console.log('\n— processing_jobs.status values in use (sample 1000) —');
  const { data: jobs } = await sb.from('processing_jobs').select('status').limit(1000);
  const statuses = new Map<string, number>();
  for (const j of jobs ?? []) statuses.set(j.status, (statuses.get(j.status) ?? 0) + 1);
  console.log('  ', Array.from(statuses.entries()).map(([s, n]) => `${s}:${n}`).join('  '));

  console.log('\n— Clean Slate target tables: tenant_id presence —');
  const cleanSlateTables = ['calculation_traces', 'calculation_results', 'entity_period_outcomes', 'summary_artifacts',
    'rule_set_assignments', 'rule_sets', 'entity_relationships', 'entities',
    'committed_data', 'processing_jobs', 'import_session_telemetry', 'ingestion_events',
    'classification_signals', 'structural_fingerprints', 'import_batches'];
  for (const t of cleanSlateTables) console.log(`   ${t.padEnd(26)} ${await hasTenantId(t)}`);

  console.log('\n— Casa Diaz current state —');
  console.log(`   committed_data rows:            ${await count('committed_data')}`);
  console.log(`   import_batches rows:            ${await count('import_batches')}`);
  console.log(`   calc_traces (committed_data_id not null): ${await count('calculation_traces', (q: any) => q.not('committed_data_id', 'is', null))}`);
  const { data: cjobs } = await sb.from('processing_jobs').select('id, status, retry_count, error_detail, started_at, file_name, session_id').eq('tenant_id', CASA).order('created_at', { ascending: false }).limit(20);
  console.log(`   processing_jobs (${cjobs?.length ?? 0}):`);
  for (const j of cjobs ?? []) console.log(`     ${String(j.id).slice(0,8)} status=${String(j.status).padEnd(11)} retry=${j.retry_count} err=${j.error_detail ? JSON.stringify(String(j.error_detail).slice(0,40)) : 'null'} session=${String(j.session_id).slice(0,8)} ${j.file_name ?? ''}`);

  console.log('\n— FK constraints referencing committed_data (information_schema, may be REST-blocked) —');
  const fk = await sb.from('information_schema.referential_constraints').select('constraint_name').limit(1);
  console.log(fk.error ? `   information_schema not queryable via PostgREST (${fk.error.code ?? ''}) → architect confirms FK blockers in SQL Editor` : `   (queryable) ${JSON.stringify(fk.data)}`);

  console.log('\n=== PROBE COMPLETE (zero writes) ===');
}
main().catch((e) => { console.error('[FATAL]', e instanceof Error ? e.message : e); process.exit(1); });
