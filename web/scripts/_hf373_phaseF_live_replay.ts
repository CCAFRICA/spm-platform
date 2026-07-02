/** HF-373 EPG-F1 (CC dry-run) — the REAL Phase F predicates replayed over the LIVE
 * offender job rows (read-only; no writes). */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { isCommitStageFailure, phaseMayAdvance, statusMayAdvance } from '../src/lib/sci/job-status';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  for (const [label, id] of [
    ['OFFENDER 1 (failed 86K, recorded finalized/completed)', '0f648189-1a0f-4878-9103-179992b79401'],
    ['OFFENDER 2 (stuck workbook, committed/finalizing forever)', '52fad564-47e5-4d39-8ab9-09b730e1c2ba'],
  ] as const) {
    const { data: j } = await sb.from('processing_jobs').select('id, status, error_detail, completed_at, metadata').eq('id', id).single();
    if (!j) { console.log(`${label}: not found`); continue; }
    const phase = ((j.metadata ?? {}) as { phase?: string }).phase ?? null;
    console.log(`${label}:`);
    console.log(`  live record: status=${j.status} phase=${phase} completed_at=${j.completed_at} error=${(j.error_detail ?? '').slice(0, 60) || 'null'}`);
    const commitFailure = isCommitStageFailure(j.status, phase === 'completed' && j.error_detail ? 'failed' : phase, j.error_detail);
    // replay the failure-time state (before the lying stamps): the 86K job had error_detail
    // 'Commit failed ...' + phase 'failed'; the workbook had neither.
    const atFailureTime = isCommitStageFailure('failed', null, j.error_detail);
    console.log(`  POST-FIX requeue gate (dispatch-jobs): commit-stage failure=${atFailureTime} -> ${atFailureTime ? 'NEVER requeued (terminal rank preserved; blind finalized stamp impossible)' : 'requeue-eligible (classify-stage)'}`);
    console.log(`  POST-FIX outcome-aware stamp: ${atFailureTime ? "patches phase='failed' ONLY (status/completed_at untouched)" : 'stamps finalized/completed/completed_at (truthful success terminal)'}`);
    console.log(`  POST-FIX phase guard: phaseMayAdvance('failed','completed')=${phaseMayAdvance('failed', 'completed')}; statusMayAdvance('failed','finalized')=${statusMayAdvance('failed', 'finalized')}`);
    void commitFailure;
  }
})().catch(e => { console.log('threw:', e instanceof Error ? e.stack : String(e)); process.exit(1); });
