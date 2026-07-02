// HF-372 Phase D / EPG-D1 — the job-state machine LIVE against the real DB, via the SAME writer
// functions the routes call (markSessionJobs / markJobsByProposal / recordCommitFailureOnJob /
// reclaimPatch / the cancel route's guarded update). Synthetic rows under VLTEST2, removed at the end.
//   from web/:  npx tsx scripts/_hf372_epgd1_status_probe.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { markSessionJobs, markJobsByProposal } from '../src/lib/sci/job-status';
import { recordCommitFailureOnJob } from '../src/lib/sci/job-failure';
import { reclaimPatch } from '../src/lib/sci/reclaim-policy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
// session_id is a uuid column — fixed synthetic UUIDs so re-runs clean up after themselves
const SESSION = '00000000-0000-4000-8000-00000000d372';
const PROPOSAL = '00000000-0000-4000-8000-00000000e372';

async function show(label: string) {
  let { data, error } = await sb.from('processing_jobs')
    .select('file_name, status, error_detail, retry_count, completed_at, metadata')
    .eq('tenant_id', VLTEST2).eq('session_id', SESSION).order('file_name');
  if (error?.code === '42703') {
    // metadata column absent (migration 20260703_hf372 pending — architect applies, SR-44):
    // the STATUS machine still demonstrates; phase shows [pre-migration].
    ({ data, error } = await sb.from('processing_jobs')
      .select('file_name, status, error_detail, retry_count, completed_at')
      .eq('tenant_id', VLTEST2).eq('session_id', SESSION).order('file_name'));
  }
  console.log(`\n── ${label} ──${error ? ' ERR ' + error.message : ''}`);
  for (const j of data ?? []) {
    const m = (j.metadata ?? {}) as { phase?: string; proposal_id?: string };
    const phase = 'metadata' in j ? (m.phase ?? '-') : '[pre-migration]';
    const prop = 'metadata' in j ? (m.proposal_id ? 'stamped' : '-') : '[pre-migration]';
    console.log(`  ${j.file_name}: status=${j.status} phase=${phase} proposal=${prop} retry=${j.retry_count ?? 0} err=${(j.error_detail ?? '').slice(0, 60)}`);
  }
}

async function main() {
  // clean start
  await sb.from('processing_jobs').delete().eq('tenant_id', VLTEST2).eq('session_id', SESSION);
  const mint = (name: string) => ({ tenant_id: VLTEST2, session_id: SESSION, file_name: name, file_storage_path: `probe/${name}`, status: 'pending' });
  await sb.from('processing_jobs').insert([mint('a.xlsx'), mint('b.xlsx'), mint('c-cancel.xlsx'), mint('d-stuck.xlsx')]);
  await show('minted (enqueue): pending');

  // classify lifecycle (what process-job writes)
  await sb.from('processing_jobs').update({ status: 'classifying', started_at: new Date().toISOString() }).eq('tenant_id', VLTEST2).eq('session_id', SESSION);
  await sb.from('processing_jobs').update({ status: 'classified' }).eq('tenant_id', VLTEST2).eq('session_id', SESSION).in('file_name', ['a.xlsx', 'b.xlsx']);
  await show('worker: classifying → classified (a, b)');

  // execute-bulk entry: SERVER writes committing + stamps proposal_id (the exact call the route makes)
  await markSessionJobs(sb, VLTEST2, SESSION, { status: 'committing', phase: 'committing', proposalId: PROPOSAL });
  await show('execute-bulk entry: committing + proposal stamped (server-side)');

  await markSessionJobs(sb, VLTEST2, SESSION, { phase: 'interpreting_plan' });
  await show('plan units present: phase interpreting_plan');

  // sync success: committed + finalizing
  await markSessionJobs(sb, VLTEST2, SESSION, { status: 'committed', phase: 'finalizing' });
  await show('commit durable: committed + finalizing');

  // finalize-import end (knows ONLY the proposalId): finalized + completed
  const n = await markJobsByProposal(sb, VLTEST2, PROPOSAL, { status: 'finalized', phase: 'completed', completedAt: true });
  await show(`finalize-import (by proposal_id, matched ${n}): finalized + completed`);

  // FORCED FAILURE on a separate session — the import screen's data source shows failed + reason
  await sb.from('processing_jobs').update({ status: 'committing' }).eq('tenant_id', VLTEST2).eq('session_id', SESSION).eq('file_name', 'c-cancel.xlsx');
  await recordCommitFailureOnJob(sb, VLTEST2, SESSION, 'FORCED failure for EPG-D1: storage upload rejected');
  await show('forced failure: recordCommitFailureOnJob');
  // …and the rank guard: a late "committed" write cannot overwrite durable truth
  await markSessionJobs(sb, VLTEST2, SESSION, { status: 'committing' });
  await show('late committing write after failed/finalized: NO-OP (rank guard)');

  // CANCEL (the exact guarded update the /api/import/sci/cancel route performs)
  await sb.from('processing_jobs').update({ status: 'classifying', error_detail: null, retry_count: 0 }).eq('tenant_id', VLTEST2).eq('session_id', SESSION).eq('file_name', 'c-cancel.xlsx');
  const { data: cjobs } = await sb.from('processing_jobs').select('id, metadata').eq('tenant_id', VLTEST2).eq('session_id', SESSION).eq('file_name', 'c-cancel.xlsx');
  for (const job of cjobs ?? []) {
    await sb.from('processing_jobs').update({
      status: 'failed', error_detail: 'Cancelled by user from the import screen', retry_count: 99,
      completed_at: new Date().toISOString(),
      metadata: { ...(job.metadata ?? {}), phase: 'cancelled', phase_at: new Date().toISOString() },
    }).eq('id', job.id).in('status', ['pending', 'classifying', 'classified', 'confirming', 'committing']);
  }
  await show('kill path: cancelled (failed + retry_count=99 + phase cancelled)');

  // STUCK simulation: a job claimed 6 minutes ago with no progress → the watchdog's reclaim patch
  const sixMinAgo = new Date(Date.now() - 6 * 60_000).toISOString();
  await sb.from('processing_jobs').update({ status: 'classifying', started_at: sixMinAgo }).eq('tenant_id', VLTEST2).eq('session_id', SESSION).eq('file_name', 'd-stuck.xlsx');
  const patch1 = reclaimPatch('classifying', 2, 3); // retry_count 2 of MAX 3 → terminal failed "stuck"
  await sb.from('processing_jobs').update(patch1).eq('tenant_id', VLTEST2).eq('session_id', SESSION).eq('file_name', 'd-stuck.xlsx');
  console.log(`\nreclaimPatch('classifying', retry=2, max=3) → ${JSON.stringify(patch1)}`);
  await show('watchdog: stale classifying past the window → reclaim verdict');

  // cleanup
  const { data: gone } = await sb.from('processing_jobs').delete().eq('tenant_id', VLTEST2).eq('session_id', SESSION).select('id');
  console.log(`\n(cleanup: removed ${gone?.length ?? 0} synthetic jobs)`);
}

main().catch(e => { console.error(e); process.exit(1); });
