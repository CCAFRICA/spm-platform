// HF-356 (PG-13) — Casa Diaz partial-import cleanup. ARCHITECT-RUN (SR-44), before any retry of the
// 86,608×87 import. The failed run left ~27,401 partial rows in committed_data and a stuck processing
// job; a clean retry must start from a clean slate (otherwise the re-import duplicates rows).
//
//   from web/:  npx tsx scripts/_hf356_casa_diaz_cleanup.ts              # DRY RUN — reports, deletes nothing
//               npx tsx scripts/_hf356_casa_diaz_cleanup.ts --execute    # delete PARTIAL (non-completed) batches' rows + reset the stuck job
//               npx tsx scripts/_hf356_casa_diaz_cleanup.ts --purge-all  # delete ALL of the tenant's committed_data + batches (full reset)
//
// SAFETY (I1 tenant isolation): every read/delete is scoped to the Casa Diaz tenant id AND, for row
// deletes, to a specific import_batch_id. The script ALWAYS prints the full live state first. --execute is
// targeted (only batches that never reached status='completed' — the partial/failed ones — so a genuinely
// completed import is preserved). --purge-all is the nuclear option for when the architect has confirmed
// Casa Diaz holds no good import worth keeping. Nothing is deleted without an explicit flag.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = '2d9979ba-5032-48a7-bccf-1928f3e6dadf'; // Casa Diaz (ADR §4)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const EXECUTE = process.argv.includes('--execute');
const PURGE_ALL = process.argv.includes('--purge-all');

async function countCommitted(batchId: string | null): Promise<number> {
  let q = sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  if (batchId) q = q.eq('import_batch_id', batchId);
  const { count, error } = await q;
  if (error) throw new Error(`count committed_data: ${error.message}`);
  return count ?? 0;
}

async function main() {
  console.log('=== HF-356 CASA DIAZ CLEANUP ===');
  console.log(`tenant: ${TENANT_ID}`);
  console.log(`mode:   ${PURGE_ALL ? 'PURGE-ALL (delete EVERYTHING for the tenant)' : EXECUTE ? 'EXECUTE (delete partial/non-completed batches + reset job)' : 'DRY RUN (no writes)'}\n`);

  // ── 1. CURRENT STATE ──────────────────────────────────────────────────────
  const { data: jobs, error: jErr } = await sb
    .from('processing_jobs')
    .select('id, status, file_name, retry_count, error_detail, created_at, started_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false });
  if (jErr) throw new Error(`read processing_jobs: ${jErr.message}`);

  console.log(`processing_jobs (${jobs?.length ?? 0}):`);
  for (const j of jobs ?? []) {
    console.log(`  ${j.id.slice(0, 8)}  status=${String(j.status).padEnd(12)} retries=${j.retry_count ?? 0}  ${j.file_name ?? '(no name)'}  @${j.created_at}`);
  }

  const { data: batches, error: bErr } = await sb
    .from('import_batches')
    .select('id, status, row_count, file_name, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false });
  if (bErr) throw new Error(`read import_batches: ${bErr.message}`);

  console.log(`\nimport_batches (${batches?.length ?? 0}):`);
  const partialBatches: string[] = [];
  for (const b of batches ?? []) {
    const n = await countCommitted(b.id);
    const completed = b.status === 'completed';
    if (!completed) partialBatches.push(b.id);
    console.log(`  ${b.id.slice(0, 8)}  status=${String(b.status).padEnd(12)} committed_rows=${String(n).padStart(6)}  row_count=${b.row_count ?? '?'}  ${completed ? '(KEEP)' : '(PARTIAL → delete)'}  ${b.file_name ?? ''}`);
  }

  const totalCommitted = await countCommitted(null);
  console.log(`\ntotal committed_data for tenant: ${totalCommitted}`);
  console.log(`partial (non-completed) batches: ${partialBatches.length}`);

  if (!EXECUTE && !PURGE_ALL) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --execute (targeted) or --purge-all (full reset).');
    return;
  }

  // ── 2. DELETE ─────────────────────────────────────────────────────────────
  let deletedRows = 0;
  let deletedBatches = 0;

  if (PURGE_ALL) {
    // Full reset: every committed row + every batch for the tenant.
    const del = await sb.from('committed_data').delete({ count: 'exact' }).eq('tenant_id', TENANT_ID);
    if (del.error) throw new Error(`purge committed_data: ${del.error.message}`);
    deletedRows = del.count ?? 0;
    const delB = await sb.from('import_batches').delete({ count: 'exact' }).eq('tenant_id', TENANT_ID);
    if (delB.error) throw new Error(`purge import_batches: ${delB.error.message}`);
    deletedBatches = delB.count ?? 0;
  } else {
    // Targeted: only the partial (non-completed) batches' rows + the batches themselves.
    for (const batchId of partialBatches) {
      const del = await sb.from('committed_data').delete({ count: 'exact' }).eq('tenant_id', TENANT_ID).eq('import_batch_id', batchId);
      if (del.error) throw new Error(`delete committed_data batch=${batchId}: ${del.error.message}`);
      deletedRows += del.count ?? 0;
      const delB = await sb.from('import_batches').delete({ count: 'exact' }).eq('tenant_id', TENANT_ID).eq('id', batchId);
      if (delB.error) throw new Error(`delete import_batch ${batchId}: ${delB.error.message}`);
      deletedBatches += delB.count ?? 0;
    }
  }

  // ── 3. RESET THE STUCK JOB(S) — back to 'pending' so a clean retry can re-run the whole pipeline ──
  // Only jobs that did NOT complete ('committed'); a clean prior import is left alone.
  const resettable = (jobs ?? []).filter((j: { status: string }) => j.status !== 'committed').map((j: { id: string }) => j.id);
  let resetJobs = 0;
  for (const jobId of resettable) {
    const r = await sb.from('processing_jobs')
      .update({ status: 'pending', started_at: null, retry_count: 0, error_detail: null })
      .eq('tenant_id', TENANT_ID).eq('id', jobId).select('id');
    if (r.error) throw new Error(`reset job ${jobId}: ${r.error.message}`);
    resetJobs += r.data?.length ?? 0;
  }

  // ── 4. POST-STATE ─────────────────────────────────────────────────────────
  const after = await countCommitted(null);
  console.log(`\n[DONE] deleted committed_data rows: ${deletedRows}`);
  console.log(`[DONE] deleted import_batches:      ${deletedBatches}`);
  console.log(`[DONE] reset processing_jobs:       ${resetJobs} (→ pending)`);
  console.log(`[DONE] committed_data remaining:    ${after}`);
  console.log('\nCasa Diaz is ready for a clean retry (the architect decides when to run it).');
}

main().catch((e) => { console.error('\n[FATAL]', e instanceof Error ? e.message : e); process.exit(1); });
