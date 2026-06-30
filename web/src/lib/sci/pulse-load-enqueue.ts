// HF-360 (Part A enqueue + Part B operations) — the server-side surface over pulse_load_jobs.
//
// ENQUEUE (Part A): after execute-bulk stages every pulse across every unit, it calls enqueuePulseLoadJob
// ONCE — the function's last act before returning. The pg_cron worker (the migration's
// process_pulse_load_jobs) drains the job off the serverless clock.
//
// OPERATIONS (Part B): rollback / resume / audit / snapshot, all keyed on the import session so a
// multi-unit import (several job rows sharing session_id) is one logical unit of recovery.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PULSE_LOAD_JOBS_TABLE,
  snapshotPulseLoad,
  type PulseLoadJob,
  type PulseLoadSnapshot,
  type PulseManifestEntry,
} from './pulse-load-types';

export interface EnqueuePulseLoadJobParams {
  tenantId: string;
  sessionId: string;          // = execute-bulk proposalId (the import session)
  unitId: string;             // a label for the job (the session, or a single unit)
  fileName: string;
  /** ordered staged pulses in commit order (index is (re)assigned here, 0..N). */
  stagedPulses: Omit<PulseManifestEntry, 'index'>[];
}

/**
 * INSERT one pulse_load_jobs row (status 'enqueued', cursor 0) from the session's staged pulses, in commit
 * order. The serverless function returns immediately after this — it never spends the load duration. Returns
 * the job id, or null when there is nothing to load (no staged pulses ⇒ no job, never an empty job).
 *
 * Resilient by design: a failure to enqueue must NOT crash the import response (the pulses are staged +
 * durable in Storage; an enqueue retry or a manual replay can pick them up). The caller logs + surfaces.
 */
export async function enqueuePulseLoadJob(
  supabase: SupabaseClient,
  params: EnqueuePulseLoadJobParams,
): Promise<{ jobId: string; totalPulses: number; totalRows: number } | null> {
  const manifest: PulseManifestEntry[] = params.stagedPulses.map((p, index) => ({ ...p, index }));
  if (manifest.length === 0) return null;
  const totalRows = manifest.reduce((s, p) => s + p.expectedRows, 0);
  const jobId = crypto.randomUUID();
  const { error } = await supabase.from(PULSE_LOAD_JOBS_TABLE).insert({
    id: jobId,
    tenant_id: params.tenantId,
    session_id: params.sessionId,
    unit_id: params.unitId,
    file_name: params.fileName,
    status: 'enqueued',
    manifest: manifest as unknown as Record<string, unknown>[],
    cursor: 0,
    total_pulses: manifest.length,
    total_rows: totalRows,
    rows_loaded: 0,
    audit: [{ at: new Date().toISOString(), from: null, to: 'enqueued', detail: `${manifest.length} pulses, ${totalRows} rows staged` }],
  });
  if (error) {
    console.error(`[enqueuePulseLoadJob] failed to enqueue job for session ${params.sessionId}: ${error.message}`);
    return null;
  }
  console.log(`[enqueuePulseLoadJob] enqueued job ${jobId}: ${manifest.length} pulses / ${totalRows} rows (session ${params.sessionId})`);
  return { jobId, totalPulses: manifest.length, totalRows };
}

// ── Part B: pulse management (rollback / resume / audit / snapshot), keyed on the import session ────────

/** All pulse-load jobs for an import session, newest first (a multi-unit import has several). */
export async function getSessionJobs(
  supabase: SupabaseClient,
  tenantId: string,
  sessionId: string,
): Promise<PulseLoadJob[]> {
  const { data, error } = await supabase
    .from(PULSE_LOAD_JOBS_TABLE)
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error(`[getSessionJobs] ${error.message}`);
    return [];
  }
  return (data ?? []) as unknown as PulseLoadJob[];
}

export interface SessionLoadState {
  sessionId: string;
  jobs: PulseLoadJob[];
  snapshots: PulseLoadSnapshot[];
  /** Σ rows loaded across the session's jobs (committed_data truth). */
  rowsLoaded: number;
  /** Σ rows the session staged (target). */
  rowsTotal: number;
  pulsesLoaded: number;
  pulsesTotal: number;
  /** terminal when every job is complete; failed if any job failed; loading/enqueued otherwise. */
  status: 'enqueued' | 'loading' | 'complete' | 'failed' | 'rolled_back' | 'empty';
}

/** The truthful aggregate the surface (Part C) renders: exactly what landed vs what is still loading. */
export function projectSessionLoadState(sessionId: string, jobs: PulseLoadJob[]): SessionLoadState {
  const snapshots = jobs.map((j) => snapshotPulseLoad(j));
  const rowsLoaded = snapshots.reduce((s, x) => s + x.rowsLoaded, 0);
  const rowsTotal = snapshots.reduce((s, x) => s + x.rowsTotal, 0);
  const pulsesLoaded = snapshots.reduce((s, x) => s + x.pulsesLoaded, 0);
  const pulsesTotal = snapshots.reduce((s, x) => s + x.pulsesTotal, 0);
  let status: SessionLoadState['status'];
  if (jobs.length === 0) status = 'empty';
  else if (jobs.every((j) => j.status === 'rolled_back')) status = 'rolled_back';
  else if (jobs.some((j) => j.status === 'failed')) status = 'failed';
  else if (jobs.every((j) => j.status === 'complete')) status = 'complete';
  else if (jobs.some((j) => j.status === 'loading')) status = 'loading';
  else status = 'enqueued';
  return { sessionId, jobs, snapshots, rowsLoaded, rowsTotal, pulsesLoaded, pulsesTotal, status };
}

export async function getSessionLoadState(
  supabase: SupabaseClient,
  tenantId: string,
  sessionId: string,
): Promise<SessionLoadState> {
  const jobs = await getSessionJobs(supabase, tenantId, sessionId);
  return projectSessionLoadState(sessionId, jobs);
}

export interface RollbackResult {
  sessionId: string;
  rowsDeleted: number;
  batchesDeleted: number;
  jobsRolledBack: number;
}

/**
 * ROLLBACK an import session: delete the committed_data rows + import_batches for EVERY pulse in EVERY job
 * of the session (each pulse is its own batch), then mark the jobs 'rolled_back'. Tenant-scoped on every
 * delete (the HF-358 deleteTenantScoped invariant — never an unscoped delete). Idempotent: re-running on an
 * already-rolled-back session deletes nothing more. Returns the audited collateral.
 *
 * Safe at any load stage: rolling back mid-load removes whatever the worker has loaded so far AND the
 * staged-but-unloaded batches; the worker will not advance a 'rolled_back' job (it claims only
 * enqueued/stale-loading), and a concurrent tick that already advanced is overwritten to rolled_back here.
 */
export async function rollbackSession(
  supabase: SupabaseClient,
  tenantId: string,
  sessionId: string,
): Promise<RollbackResult> {
  const jobs = await getSessionJobs(supabase, tenantId, sessionId);
  const batchIds = jobs.flatMap((j) => (j.manifest ?? []).map((p) => p.batchId)).filter(Boolean);
  let rowsDeleted = 0;
  let batchesDeleted = 0;

  // Delete in batchId chunks, ALWAYS tenant-scoped (defense-in-depth: the batch ids already belong to the
  // tenant's jobs, but the .eq('tenant_id') makes an unscoped delete structurally impossible).
  for (let i = 0; i < batchIds.length; i += 50) {
    const slice = batchIds.slice(i, i + 50);
    const { count: dataCount } = await supabase
      .from('committed_data')
      .delete({ count: 'exact' })
      .eq('tenant_id', tenantId)
      .in('import_batch_id', slice);
    rowsDeleted += dataCount ?? 0;
    const { count: batchCount } = await supabase
      .from('import_batches')
      .delete({ count: 'exact' })
      .eq('tenant_id', tenantId)
      .in('id', slice);
    batchesDeleted += batchCount ?? 0;
  }

  const at = new Date().toISOString();
  for (const j of jobs) {
    if (j.status === 'rolled_back') continue;
    await supabase
      .from(PULSE_LOAD_JOBS_TABLE)
      .update({
        status: 'rolled_back',
        updated_at: at,
        audit: [...(j.audit ?? []), { at, from: j.status, to: 'rolled_back', detail: `rollback: removed batches for ${(j.manifest ?? []).length} pulses` }],
      })
      .eq('id', j.id)
      .eq('tenant_id', tenantId);
  }

  console.log(`[rollbackSession] session ${sessionId}: deleted ${rowsDeleted} rows / ${batchesDeleted} batches across ${jobs.length} jobs`);
  return { sessionId, rowsDeleted, batchesDeleted, jobsRolledBack: jobs.filter((j) => j.status !== 'rolled_back').length };
}

export interface ResumeResult {
  sessionId: string;
  jobsResumed: number;
  pulsesRemaining: number;
}

/**
 * RESUME an import session: re-arm any failed (or stalled-loading) job back to 'enqueued' so the worker
 * picks it up and continues from its persisted cursor — REPLAYING the frozen manifest byte-identically (the
 * byte-budget + batch structure are not recomputed, so a resumed import is identical to an uninterrupted
 * one). Does NOT touch already-loaded pulses (cursor is preserved). A 'complete' job is left alone; a
 * 'rolled_back' job is NOT resumed (rollback is terminal — re-import to redo).
 */
export async function resumeSession(
  supabase: SupabaseClient,
  tenantId: string,
  sessionId: string,
): Promise<ResumeResult> {
  const jobs = await getSessionJobs(supabase, tenantId, sessionId);
  const resumable = jobs.filter((j) => j.status === 'failed' || j.status === 'loading');
  const at = new Date().toISOString();
  let pulsesRemaining = 0;
  for (const j of resumable) {
    pulsesRemaining += Math.max(0, (j.total_pulses ?? 0) - (j.cursor ?? 0));
    await supabase
      .from(PULSE_LOAD_JOBS_TABLE)
      .update({
        status: 'enqueued',
        error_detail: null,
        updated_at: at,
        audit: [...(j.audit ?? []), { at, from: j.status, to: 'enqueued', detail: `resume from cursor ${j.cursor} / ${j.total_pulses}` }],
      })
      .eq('id', j.id)
      .eq('tenant_id', tenantId);
  }
  console.log(`[resumeSession] session ${sessionId}: re-armed ${resumable.length} jobs, ${pulsesRemaining} pulses remaining`);
  return { sessionId, jobsResumed: resumable.length, pulsesRemaining };
}
