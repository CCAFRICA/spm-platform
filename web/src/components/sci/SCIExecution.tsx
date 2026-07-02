'use client';

// SCI Execution — Orchestrates pipeline execution + renders progress
// OB-129 Phase 4, OB-136 chunking, OB-139 ExecutionProgress integration.
// HF-087: 300s fetch timeout, recovery check, elapsed timer, duplicate guard.
// OB-151: Module-level dedup guard, polling recovery, server idempotency.
// Zero domain vocabulary. Korean Test applies.

import { useEffect, useState, useCallback, useRef } from 'react';
import type {
  ContentUnitProposal,
  AgentType,
  SCIExecutionResult,
  ContentUnitResult,
} from '@/lib/sci/sci-types';
import type { ParsedFileData } from './SCIUpload';
import { ExecutionProgress, toProgressItems } from './ExecutionProgress';
// HF-295 Part 2: per-file failure contract + the one error-class → user-payload translation.
import {
  type ImportFileFailure,
  type ImportErrorClass,
  classifyImportError,
  toImportFileFailure,
  deriveFileLabel,
} from '@/lib/sci/import-failure';
// HF-356 (I8): poll discipline — a 401 or a 5xx streak makes the bounded recovery pollers give up early
// instead of polling a failing endpoint for the full stall window.
import { pollDecision, newPollState, type PollOutcome } from '@/lib/sci/poll-discipline';
// HF-372 Phase D: the durable job record (processing_jobs) is the terminal truth for the whole
// import — the execute UI polls it so a dead HTTP response can never leave the screen spinning
// after the server finished, and renders the server's live phase.
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';

const PROCESSING_ORDER: Record<AgentType, number> = {
  plan: 0,
  entity: 1,
  target: 2,
  transaction: 3,
  reference: 4,
};

// HF-087: Match server maxDuration (300s) — prevents browser from giving up before server
const FETCH_TIMEOUT_MS = 300_000;

// OB-151: Module-level guard against duplicate execution.
// useRef resets on component remount (new instance = new ref).
// A module-level Set survives remounts within the same page session.
const executedProposals = new Set<string>();

type UnitStatus = 'pending' | 'processing' | 'complete' | 'error';

interface ExecutionUnit {
  contentUnitId: string;
  tabName: string;
  classification: AgentType;
  status: UnitStatus;
  result?: ContentUnitResult;
  error?: string;
  // HF-295 Part 2: structured, user-understandable failure payload (preferred over `error`
  // for rendering). Carried on any unit whose file stalled or whose interpretation failed.
  failure?: ImportFileFailure;
}

// HF-295 Part 2: the per-file dispatch outcome the loop records. `settled` true means the
// file's own units all reached a terminal disposition; on false the loop marks this file's
// still-non-terminal units failed (with `errorClass`/`technicalDetail`) and continues to the
// next file — per-file isolation, no cross-file waiting, no indefinite spinner.
interface FileDispatchOutcome {
  settled: boolean;
  unitIds: string[];
  errorClass?: ImportErrorClass;
  technicalDetail?: string;
}

interface SCIExecutionProps {
  proposal: {
    proposalId: string;
    contentUnits: ContentUnitProposal[];
  };
  confirmedUnits: ContentUnitProposal[];
  tenantId: string;
  rawData: ParsedFileData;
  storagePath?: string; // OB-156: File storage path for bulk server-side processing
  storagePaths?: Record<string, string>; // HF-140: Per-file storage paths (fileName → path)
  // HF-358 (Part B-1): the async import-session id (processing_jobs.session_id) so a commit failure is
  // recorded on the job server-side. Null/absent on the synchronous path (no job).
  asyncSessionId?: string | null;
  onComplete: (result: SCIExecutionResult) => void;
  onUploadMore: () => void;
}

/**
 * HF-087: Fetch with explicit 300s timeout via AbortController.
 * Prevents browser/proxy from silently dropping long-running requests.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * OB-151: Polling recovery check — the server may still be processing when
 * the client connection drops. Poll up to maxWaitMs with increasing intervals.
 */
// HF-353 P-D: poll the DURABLE plan-interpretation status (HF-259 plan_interpretation_runs,
// via /api/import/sci/plan-run-status) to distinguish "still processing" from "failed". While
// status is in_progress, `onTick` keeps the UI in "still processing" — the caller NEVER marks
// the plan units 'error' (so no Retry button → no client re-submit). Resolves to 'completed'
// (success), 'failed' (genuine failure), or 'absent' (no run / stall — a retryable surface).
async function pollPlanRunStatus(
  tenantId: string,
  onTick: () => void,
  maxWaitMs: number = 300_000,
): Promise<'completed' | 'failed' | 'absent'> {
  const startTime = Date.now();
  const intervals = [3000, 5000, 8000, 10000, 10000];
  let attempt = 0;
  let absentTicks = 0;
  const pollState = newPollState(); // HF-356 (I8): 401 → give up; 5xx/network streak → give up at the cap.
  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, intervals[Math.min(attempt, intervals.length - 1)]));
    attempt++;
    let outcome: PollOutcome = { ok: false, networkError: true };
    try {
      const res = await fetch(`/api/import/sci/plan-run-status?tenantId=${encodeURIComponent(tenantId)}`);
      outcome = { ok: res.ok, status: res.status };
      if (res.ok) {
        pollState.serverErrors = 0; // a good read clears the failure streak
        const { status } = await res.json() as { status: 'in_progress' | 'completed' | 'failed' | 'absent' };
        if (status === 'completed') return 'completed';
        if (status === 'failed') return 'failed';
        if (status === 'absent') { if (++absentTicks >= 3) return 'absent'; continue; }
        // in_progress → the server is still working; keep the UI honest and keep polling.
        absentTicks = 0;
        onTick();
        continue;
      }
    } catch {
      // Network blip — outcome stays networkError; the discipline counts it toward the give-up cap.
    }
    // HF-356 (I8): a 401/403 never self-heals, and a 5xx/network streak past the cap means the endpoint is
    // down — stop early and return the retryable stall surface (the caller never marks units 'error' on it).
    if (pollDecision(pollState, outcome, 0).action === 'stop') return 'absent';
  }
  return 'absent'; // stall window elapsed
}

export function SCIExecution({
  proposal,
  confirmedUnits,
  tenantId,
  rawData,
  storagePath,
  storagePaths,
  asyncSessionId,
  onComplete,
  onUploadMore,
}: SCIExecutionProps) {
  const [units, setUnits] = useState<ExecutionUnit[]>(() =>
    [...confirmedUnits]
      .sort((a, b) => PROCESSING_ORDER[a.classification] - PROCESSING_ORDER[b.classification])
      .map(u => ({
        contentUnitId: u.contentUnitId,
        tabName: u.tabName,
        classification: u.classification,
        status: 'pending' as const,
      }))
  );
  const [executionDone, setExecutionDone] = useState(false);
  // HF-360 (Part C): captured from the execute-bulk response(s) — when the import HANDED OFF its loads, the
  // job(s) the pg_cron worker drains. Accumulates totals across file groups (all share session_id =
  // proposal.proposalId). Present ⇒ the page enters the truthful 'loading' phase instead of 'complete'.
  const pulseLoadJobRef = useRef<{ jobId: string; totalPulses: number; totalRows: number } | null>(null);
  const pulseEnqueueFailedRef = useRef(false);
  // HF-087: Track elapsed time for active processing
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // OB-151: useRef as secondary guard (works for strict mode double-invocation)
  const executingRef = useRef(false);

  // ── HF-372 Phase D: the SINGLE truthful record — poll processing_jobs for phase + terminal state ──
  const [livePhase, setLivePhase] = useState<string | null>(null);
  const [serverTerminal, setServerTerminal] = useState<null | { failed: boolean; reason?: string }>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  useEffect(() => {
    if (!asyncSessionId || !tenantId || executionDone) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createBrowserSupabase() as any;
    let stopped = false;
    const tick = async () => {
      let { data, error } = await sb
        .from('processing_jobs')
        .select('status, error_detail, metadata')
        .eq('tenant_id', tenantId)
        .eq('session_id', asyncSessionId);
      if (error?.code === '42703') {
        // metadata column absent (migration 20260703_hf372 pending) — the TERMINAL settle (the
        // critical truth) still works from status alone; only the phase display is unavailable.
        ({ data, error } = await sb
          .from('processing_jobs')
          .select('status, error_detail')
          .eq('tenant_id', tenantId)
          .eq('session_id', asyncSessionId));
      }
      if (stopped || error || !data?.length) return;
      // live phase = the most recently stamped metadata.phase across the session's jobs
      let phase: string | null = null; let phaseAt = '';
      for (const j of data) {
        const m = (j.metadata ?? {}) as { phase?: string; phase_at?: string };
        if (m.phase && (m.phase_at ?? '') >= phaseAt) { phase = m.phase; phaseAt = m.phase_at ?? ''; }
      }
      setLivePhase(phase);
      const terminal = data.every((j: { status: string }) => j.status === 'committed' || j.status === 'finalized' || j.status === 'failed');
      if (terminal) {
        const failedJobs = data.filter((j: { status: string }) => j.status === 'failed');
        setServerTerminal({
          failed: failedJobs.length > 0,
          reason: failedJobs.map((j: { error_detail?: string }) => j.error_detail).filter(Boolean).join(' | ') || undefined,
        });
      }
    };
    void tick();
    const iv = setInterval(() => { void tick(); }, 2500);
    return () => { stopped = true; clearInterval(iv); };
  }, [asyncSessionId, tenantId, executionDone]);

  // When the durable record says the import is terminal but the local flow is still spinning
  // (dead response socket, dropped poller — the "0 of 4 at 183s while the server finished at 66s"
  // class), settle the UI from the record: never a spinner after the server finished.
  useEffect(() => {
    if (!serverTerminal || executionDone) return;
    setUnits(prev => prev.map(u => (u.status === 'complete' || u.status === 'error') ? u : (
      serverTerminal.failed
        ? { ...u, status: 'error' as const, error: serverTerminal.reason ?? 'Import failed (see the job record)' }
        : { ...u, status: 'complete' as const }
    )));
    setExecutionDone(true);
  }, [serverTerminal, executionDone]);

  // HF-372 Phase D: the inline stop/kill — cancels the session's non-terminal jobs server-side.
  const handleCancelImport = useCallback(async () => {
    if (!asyncSessionId || !tenantId || cancelRequested) return;
    setCancelRequested(true);
    try {
      const r = await fetch('/api/import/sci/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, sessionId: asyncSessionId }),
      });
      const body = await r.json().catch(() => ({}));
      console.log(`[SCI Cancel] HTTP ${r.status} cancelled=${body.cancelled ?? '?'}`);
    } catch (e) {
      console.warn('[SCI Cancel] request failed:', e);
      setCancelRequested(false);
    }
  }, [asyncSessionId, tenantId, cancelRequested]);

  // HF-087: Elapsed timer — ticks every second while processing
  useEffect(() => {
    if (executionDone) return;
    const hasActive = units.some(u => u.status === 'processing');
    if (!hasActive) return;

    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [executionDone, units]);

  // D18: the durable DATA SURFACE is the only truth for per-unit disposition. After firing execute-bulk we
  // poll session-state + telemetry until the server has settled EVERY unit (bound/resolved/failed) — a dead
  // HTTP response (Vercel's 300s cap fired mid-Ventas in run-5 while the server kept committing and FINISHED)
  // is a NON-EVENT. Per-unit committed rows come from telemetry; a failed unit carries its reason from the
  // spine. Bounded by a stall window that server-progress resets (same shape as the D13 analyze recovery).
  // OB-203 Phase B: returns TRUE when every tracked unit reached a terminal
  // disposition, FALSE on a stall — the caller's resume loop re-POSTs
  // execute-bulk (idempotent: the route skips spine-terminal and in-flight
  // units) until truth settles or the attempt budget is spent.
  // HF-295 Part 2: the tracked set is now the CALLER's file group (its unit ids), not the
  // import-wide `confirmedUnits`. A file settles when ITS OWN units reach a terminal
  // disposition — so the dispatch loop advances to the next file immediately instead of
  // stalling 90s waiting for files that have not been dispatched yet (DIAG-069 / H5).
  const settleFromSurface = useCallback(async (trackedIds: string[]): Promise<boolean> => {
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
    const STALL_MS = 90_000;
    const BASE_MS = 2000;
    let lastSettled = -1, lastProgressAt = Date.now();
    const pollState = newPollState(); // HF-356 (I8): 401 → give up; 5xx/network streak → give up at the cap.
    console.log(`[TRACE-POLL] settleFromSurface START tracked=${trackedIds.length}`); // DIAG-070
    while (Date.now() - lastProgressAt < STALL_MS) {
      let outcome: PollOutcome = { ok: false, networkError: true };
      try {
        const r = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(proposal.proposalId)}&telemetry=1`);
        outcome = { ok: r.ok, status: r.status };
        if (r.ok) {
          pollState.serverErrors = 0; // a good read clears the failure streak
          const view = await r.json() as { units?: Array<{ unitId: string; state: string; sheetName: string | null; failureClass: string | null }>; telemetry?: { perUnit?: Array<{ sheetName: string | null; expectedRows: number }> } };
          const sUnits = view.units ?? [];
          const rowsBySheet = new Map((view.telemetry?.perUnit ?? []).map(p => [p.sheetName, p.expectedRows]));
          setUnits(prev => prev.map(u => {
            const su = sUnits.find(x => x.unitId === u.contentUnitId);
            if (!su) return u;
            if (su.state === 'bound' || su.state === 'resolved') {
              return { ...u, status: 'complete' as const, result: { contentUnitId: u.contentUnitId, classification: u.classification, success: true, rowsProcessed: rowsBySheet.get(su.sheetName) ?? u.result?.rowsProcessed ?? 0, pipeline: u.classification } };
            }
            if (su.state === 'failed_interpretation') {
              // HF-295 Part 2: translate the raw server failureClass into a user-understandable
              // payload (the one translation function). The raw class is retained as the
              // collapsible technical detail — never the primary display.
              const errorClass = classifyImportError({ failureClass: su.failureClass });
              const failure = toImportFileFailure(
                deriveFileLabel(u.contentUnitId, u.tabName),
                errorClass,
                su.failureClass ?? undefined,
              );
              return { ...u, status: 'error' as const, failure, error: errorClass };
            }
            return u;
          }));
          const settledCount = trackedIds.filter(id => {
            const su = sUnits.find(x => x.unitId === id);
            return su && ['bound', 'resolved', 'failed_interpretation'].includes(su.state);
          }).length;
          console.log(`[TRACE-POLL] settleFromSurface TICK settled=${settledCount}/${trackedIds.length}`); // DIAG-070
          if (settledCount > lastSettled) { lastSettled = settledCount; lastProgressAt = Date.now(); }
          if (settledCount >= trackedIds.length) { console.log('[TRACE-POLL] settleFromSurface STOP reason=allSettled'); return true; } // every tracked unit has a terminal disposition
        }
      } catch { /* network drop — outcome stays networkError; counted toward the give-up cap */ }
      // HF-356 (I8): on a good (settled-progress) read we sleep the base cadence; on a 401/403 we give up
      // (auth won't heal), and on a 5xx/network streak we back off then give up at the cap — never poll a
      // failing endpoint for the full 90s stall window.
      if (outcome.ok) {
        await sleep(BASE_MS);
      } else {
        const verdict = pollDecision(pollState, outcome, BASE_MS);
        if (verdict.action === 'stop') { console.log(`[TRACE-POLL] settleFromSurface STOP reason=${verdict.reason}`); return false; }
        await sleep(verdict.delayMs);
      }
    }
    console.log('[TRACE-POLL] settleFromSurface STOP reason=stall-timeout'); // DIAG-070
    return false; // stalled with non-terminal units — the resume loop decides what's next
  }, [tenantId, proposal.proposalId]);

  // HF-298: the execute-phase live-progress session-state poller is REMOVED.
  // SCIExecution renders ONLY during the executing phase, so this poller was an execute-only
  // ~2s session-state poll. Since HF-296/HF-297 the client advances each unit directly from the
  // execute-bulk HTTP 200 response (executeBulk → seedFromResults) — and settleFromSurface covers
  // the lost-response recovery case — so this poll was vestigial. Worse, it ran continuously between
  // execute-bulk calls and contended with the deferred post-commit work (DIAG-070). Per-unit progress
  // is now driven entirely by the HTTP responses; nothing polls session-state during a healthy execute.

  // OB-156/HF-140: Bulk execution — sends storagePath to server, no row data in HTTP body
  // HF-140: Now accepts explicit path parameter for per-file isolation
  const executeBulk = useCallback(async (dataUnits: ExecutionUnit[], bulkStoragePath?: string): Promise<FileDispatchOutcome> => {
    const effectivePath = bulkStoragePath || storagePath;
    // HF-295 Part 2: settle is scoped to THIS file's unit ids — the keystone of the fix.
    const groupUnitIds = dataUnits.map(u => u.contentUnitId);
    // Capture the last lost-response detail so a file that never recovers can explain itself.
    let lastErrText: string | null = null;
    // Mark all data units as processing
    setElapsedSeconds(0);
    setUnits(prev => prev.map(u =>
      dataUnits.some(du => du.contentUnitId === u.contentUnitId)
        ? { ...u, status: 'processing' as const }
        : u
    ));

    // Build content unit metadata (no rawData — server reads from Storage)
    const bulkUnits = dataUnits.map(eu => {
      const proposalUnit = confirmedUnits.find(u => u.contentUnitId === eu.contentUnitId);
      if (!proposalUnit) return null;
      return {
        contentUnitId: eu.contentUnitId,
        confirmedClassification: eu.classification,
        confirmedBindings: proposalUnit.fieldBindings,
        ...(proposalUnit.claimType ? { claimType: proposalUnit.claimType } : {}),
        ...(proposalUnit.ownedFields ? { ownedFields: proposalUnit.ownedFields } : {}),
        ...(proposalUnit.sharedFields ? { sharedFields: proposalUnit.sharedFields } : {}),
        originalClassification: proposalUnit.classification,
        originalConfidence: proposalUnit.confidence,
        // HF-110: Pass HC data for field_identities extraction (DS-009 1.3)
        ...(proposalUnit.classificationTrace ? { classificationTrace: proposalUnit.classificationTrace } : {}),
        ...(proposalUnit.structuralFingerprint ? { structuralFingerprint: proposalUnit.structuralFingerprint } : {}),
        ...(proposalUnit.vocabularyBindings ? { vocabularyBindings: proposalUnit.vocabularyBindings } : {}),
        sourceFile: proposalUnit.sourceFile,
        tabName: proposalUnit.tabName,
      };
    }).filter(Boolean);

    // HF-296: HTTP-RESPONSE-BASED SETTLE (keystone). The execute-bulk 200 response IS the truth —
    // it is constructed only AFTER every per-unit and batch spine emission completes
    // (execute-bulk/route.ts:658-678), so a LIVE 200 needs no confirmation poll. We trust it and
    // advance immediately (zero polling). settleFromSurface is retained ONLY as RECOVERY for a
    // genuinely lost response (timeout / abort / network) — the run-5 case where Vercel's 300s cap
    // fired mid-commit while the server finished. This removes the ~298s/file settle stall (the
    // DIAG-069 mechanism cost) and the auth-starving poll load. D18 resilience is preserved: a lost
    // response still falls to settle-recovery; only a live response now short-circuits the poll.
    const MAX_EXECUTE_ATTEMPTS = 3; // re-POSTs on a LOST response only — never on a 200-with-failures
    const ebLabel = (bulkStoragePath ? bulkStoragePath.split('/').pop() : undefined) ?? groupUnitIds[0] ?? 'group'; // DIAG-070 trace label

    // HF-373 Phase D (D9): the per-file-group settle-audit dispatcher is REMOVED — in a
    // multi-file import it fired the ONCE-per-session FIRST-WINS audit while later groups
    // were still uncommitted (premature by construction; the 2026-07-02 frozen false alarm).
    // ImportReadyState's mount fire is the single dispatcher, behind the server's settled gate.
    const finalize = (outcome: FileDispatchOutcome): FileDispatchOutcome => outcome;

    // Seed per-unit disposition from the authoritative results. A failed unit carries the HF-295
    // user-understandable payload (translated by error class), never a raw dump.
    const seedFromResults = (resultList: ContentUnitResult[]) => {
      const byId = new Map(resultList.map(r => [r.contentUnitId, r]));
      setUnits(prev => prev.map(u => {
        const r = byId.get(u.contentUnitId);
        if (!r) return u;
        if (r.success) return { ...u, status: 'complete' as const, result: r, error: undefined, failure: undefined };
        const errorClass = classifyImportError({ failureClass: r.error, rawError: r.error });
        return { ...u, status: 'error' as const, result: r, error: errorClass, failure: toImportFileFailure(deriveFileLabel(u.contentUnitId, u.tabName), errorClass, r.error ?? undefined) };
      }));
    };

    for (let attempt = 1; attempt <= MAX_EXECUTE_ATTEMPTS; attempt++) {
      if (attempt > 1) console.warn(`[SCIExecution] HF-296 re-POST attempt ${attempt}/${MAX_EXECUTE_ATTEMPTS} (prior response was lost)`);
      try {
        const fetchStart = Date.now(); // DIAG-070
        const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalId: proposal.proposalId,
            tenantId,
            sessionId: asyncSessionId ?? undefined, // HF-358 (Part B-1): record a commit failure on the job
            storagePath: effectivePath,
            contentUnits: bulkUnits,
          }),
        });
        console.log(`[TRACE-CLIENT] ${ebLabel} FETCH-RETURNED http=${res.status} ok=${res.ok} at +${Date.now() - fetchStart}ms`); // DIAG-070

        if (res.ok) {
          // LIVE 200 — authoritative. Trust it, advance immediately. ZERO POLLING.
          let bulkResult: SCIExecutionResult | null = null;
          try { bulkResult = await res.json() as SCIExecutionResult; } catch { bulkResult = null; }
          // HF-360 (Part C): capture the hand-off job — accumulate totals across file groups (one session).
          if (bulkResult?.pulseLoadJob) {
            const prev = pulseLoadJobRef.current;
            pulseLoadJobRef.current = prev
              ? { jobId: prev.jobId, totalPulses: prev.totalPulses + bulkResult.pulseLoadJob.totalPulses, totalRows: prev.totalRows + bulkResult.pulseLoadJob.totalRows }
              : bulkResult.pulseLoadJob;
          }
          if (bulkResult?.pulseLoadEnqueueFailed) pulseEnqueueFailedRef.current = true;
          if (bulkResult && Array.isArray(bulkResult.results)) {
            seedFromResults(bulkResult.results);
            const present = new Set(bulkResult.results.map(r => r.contentUnitId));
            if (groupUnitIds.every(id => present.has(id))) {
              console.log(`[TRACE-CLIENT] ${ebLabel} PATH=immediate-return units=${groupUnitIds.length}`); // DIAG-070 — proves HF-296 happy path is live
              return finalize({ settled: true, unitIds: groupUnitIds }); // every unit accounted for — no poll
            }
            // Rare: some units absent from the body (e.g. resume-skipped) → ONE recovery settle for the remainder.
            console.log(`[TRACE-CLIENT] ${ebLabel} PATH=settle-recovery reason=units-missing-from-200`); // DIAG-070
            const settled = await settleFromSurface(groupUnitIds);
            return finalize(settled
              ? { settled: true, unitIds: groupUnitIds }
              : { settled: false, unitIds: groupUnitIds, errorClass: 'not_finalized', technicalDetail: 'some units missing from the execute-bulk response' });
          }
          // 200 with an unparseable/empty body — treat as a lost response → recovery settle.
          console.log(`[TRACE-CLIENT] ${ebLabel} PATH=settle-recovery reason=unparseable-200`); // DIAG-070
          lastErrText = 'execute-bulk returned 200 with no parseable results';
          const settled = await settleFromSurface(groupUnitIds);
          return finalize(settled
            ? { settled: true, unitIds: groupUnitIds }
            : { settled: false, unitIds: groupUnitIds, errorClass: classifyImportError({ rawError: lastErrText, stalled: true }), technicalDetail: lastErrText });
        }

        // HTTP 4xx/5xx — a RECEIVED error response. Per §2: mark failed, return immediately, ZERO POLLING.
        // (Per-file isolation + the "Retry failed" action recover a falsely-failed file; not polling is
        // what relieves the auth starvation.)
        const errBody = await res.text().catch(() => '');
        const detail = errBody.slice(0, 600) || `HTTP ${res.status}`;
        console.log(`[TRACE-CLIENT] ${ebLabel} PATH=fail-fast reason=http-${res.status}`); // DIAG-070
        console.warn(`[SCIExecution] execute-bulk responded ${res.status} (definitive file failure, no poll): ${detail.slice(0, 160)}`);
        return finalize({ settled: false, unitIds: groupUnitIds, errorClass: classifyImportError({ httpStatus: res.status, rawError: errBody }), technicalDetail: detail });

      } catch (err) {
        // LOST RESPONSE (timeout / abort / network) — the ONLY case that justifies recovery polling AND a
        // POST retry. The server may have committed despite the dead connection (D18 preserved).
        lastErrText = (err instanceof Error ? err.message : String(err)).slice(0, 600);
        console.log(`[TRACE-CLIENT] ${ebLabel} PATH=settle-recovery reason=lost-response`); // DIAG-070
        console.warn('[SCIExecution] execute-bulk response was lost (recovery settle):', lastErrText);
        const settled = await settleFromSurface(groupUnitIds);
        if (settled) return finalize({ settled: true, unitIds: groupUnitIds });
        if (attempt < MAX_EXECUTE_ATTEMPTS) continue; // idempotent route — re-POST the lost work
        return finalize({ settled: false, unitIds: groupUnitIds, errorClass: classifyImportError({ rawError: lastErrText, stalled: true }), technicalDetail: lastErrText ?? undefined });
      }
    }
    // Attempts exhausted without a definitive disposition.
    return finalize({ settled: false, unitIds: groupUnitIds, errorClass: classifyImportError({ rawError: lastErrText, stalled: true }), technicalDetail: lastErrText ?? undefined });
  }, [confirmedUnits, proposal.proposalId, tenantId, storagePath, asyncSessionId, settleFromSurface]);

  // Legacy execution — used for plan units (document-based) and fallback when no storagePath
  const executeLegacyUnit = useCallback(async (unit: ExecutionUnit) => {
    const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
    if (!proposalUnit) throw new Error('Could not find execution data for this content');

    const baseContentUnitId = unit.contentUnitId.replace(/::split$/, '');
    const sheetData = rawData.sheets.find(s => {
      const expectedId = `${rawData.fileName}::${s.sheetName}::${rawData.sheets.indexOf(s)}`;
      return expectedId === baseContentUnitId;
    }) || rawData.sheets.find(s => s.sheetName === unit.tabName);

    const execUnit = {
      contentUnitId: unit.contentUnitId,
      confirmedClassification: unit.classification,
      confirmedBindings: proposalUnit.fieldBindings,
      rawData: sheetData?.rows || [],
      ...(proposalUnit.documentMetadata ? { documentMetadata: proposalUnit.documentMetadata } : {}),
      ...(proposalUnit.claimType ? { claimType: proposalUnit.claimType } : {}),
      ...(proposalUnit.ownedFields ? { ownedFields: proposalUnit.ownedFields } : {}),
      ...(proposalUnit.sharedFields ? { sharedFields: proposalUnit.sharedFields } : {}),
      originalClassification: proposalUnit.classification,
      originalConfidence: proposalUnit.confidence,
      // HF-110: Pass HC data for field_identities extraction (DS-009 1.3)
      ...(proposalUnit.classificationTrace ? { classificationTrace: proposalUnit.classificationTrace } : {}),
      ...(proposalUnit.structuralFingerprint ? { structuralFingerprint: proposalUnit.structuralFingerprint } : {}),
      ...(proposalUnit.vocabularyBindings ? { vocabularyBindings: proposalUnit.vocabularyBindings } : {}),
      sourceFile: proposalUnit.sourceFile,
      tabName: proposalUnit.tabName,
    };

    // HF-239: Unified import route. The legacy execute path is deleted; all
    // content units go through execute-bulk. The bulk route REQUIRES storagePath
    // — the request body shape no longer carries rawData. If no storagePath
    // is available (rare per-unit fallback), surface a structured error.
    if (!storagePath) {
      throw new Error('storagePath required: HF-239 unified import requires Storage transport for all content units');
    }
    const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalId: proposal.proposalId,
        tenantId,
        sessionId: asyncSessionId ?? undefined, // HF-373 Phase F (D7): every invocation stamps the job record
        storagePath,
        contentUnits: [execUnit],
      }),
    });

    if (!res.ok) {
      throw new Error(`Processing failed (${res.status})`);
    }

    const result: SCIExecutionResult = await res.json();
    // HF-373 Phase D (D9): duplicate dispatch of this unit coalesced server-side — surface a
    // retryable message (a later retry resumes idempotently once the in-flight pass finishes).
    if ((result as { coalesced?: boolean }).coalesced) {
      throw new Error('Commit coalesced — an identical commit pass for this unit is in flight; retry shortly');
    }
    return result.results[0];
  }, [confirmedUnits, rawData, proposal.proposalId, tenantId, storagePath, asyncSessionId]);

  const executeUnits = useCallback(async (unitsToExecute: ExecutionUnit[]) => {
    // OB-156: Split units into plan (legacy) and data (bulk) groups
    const planUnits = unitsToExecute.filter(u => u.classification === 'plan');
    const dataUnits = unitsToExecute.filter(u => u.classification !== 'plan');

    // HF-131: Execute ALL plan units in a SINGLE request so the backend (HF-130)
    // can batch them into one AI interpretation call with full cross-sheet context.
    if (planUnits.length > 0) {
      setElapsedSeconds(0);
      // Mark all plan units as processing
      setUnits(prev => prev.map(u =>
        planUnits.some(pu => pu.contentUnitId === u.contentUnitId)
          ? { ...u, status: 'processing' as const }
          : u
      ));

      // Build execution payloads for ALL plan units
      const planExecUnits = planUnits.map(unit => {
        const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
        if (!proposalUnit) return null;
        return {
          contentUnitId: unit.contentUnitId,
          confirmedClassification: unit.classification,
          confirmedBindings: proposalUnit.fieldBindings,
          rawData: [] as Record<string, unknown>[], // Plan units have no row data
          ...(proposalUnit.documentMetadata ? { documentMetadata: proposalUnit.documentMetadata } : {}),
          ...(proposalUnit.claimType ? { claimType: proposalUnit.claimType } : {}),
          ...(proposalUnit.ownedFields ? { ownedFields: proposalUnit.ownedFields } : {}),
          ...(proposalUnit.sharedFields ? { sharedFields: proposalUnit.sharedFields } : {}),
          originalClassification: proposalUnit.classification,
          originalConfidence: proposalUnit.confidence,
          ...(proposalUnit.classificationTrace ? { classificationTrace: proposalUnit.classificationTrace } : {}),
          ...(proposalUnit.structuralFingerprint ? { structuralFingerprint: proposalUnit.structuralFingerprint } : {}),
          ...(proposalUnit.vocabularyBindings ? { vocabularyBindings: proposalUnit.vocabularyBindings } : {}),
          sourceFile: proposalUnit.sourceFile,
          tabName: proposalUnit.tabName,
        };
      }).filter(Boolean);

      try {
        // HF-239: plan batching flows through execute-bulk's `case 'plan'` arm.
        // HF-256: send the per-file storage map so the server groups plan units by their
        // source file — each plan file is interpreted with its own path and produces its
        // own rule set (multi-plan-file). storagePath is retained for single-file back-compat.
        const haveAnyPath = !!storagePath || !!(storagePaths && Object.keys(storagePaths).length > 0);
        if (!haveAnyPath) {
          throw new Error('storagePath required: HF-239 unified import requires Storage transport for plan units');
        }
        const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalId: proposal.proposalId,
            tenantId,
            // HF-373 Phase F (D7): plan invocations stamp/see the job record like data invocations —
            // pre-HF-373 the sessionless plan call left metadata.proposal_id unstamped, so the
            // premature finalize's job stamp matched ZERO rows silently (the stuck workbook job).
            sessionId: asyncSessionId ?? undefined,
            storagePath,
            storagePaths,
            contentUnits: planExecUnits,
          }),
        });

        if (!res.ok) {
          throw new Error(`Plan processing failed (${res.status})`);
        }

        const planResult: SCIExecutionResult = await res.json();

        // HF-373 Phase D (D9): a coalesced response means an IDENTICAL plan commit pass is
        // already in flight (duplicate dispatch no-oped server-side). Throw into the HF-353
        // P-D recovery below, which settles from the durable plan_interpretation_runs status.
        if ((planResult as { coalesced?: boolean }).coalesced) {
          throw new Error('Commit coalesced — an identical plan commit pass is in flight; settling from durable status');
        }

        // Map results back to individual plan units
        for (const result of planResult.results) {
          setUnits(prev => prev.map(u =>
            u.contentUnitId === result.contentUnitId
              ? {
                  ...u,
                  status: result.success ? 'complete' as const : 'error' as const,
                  result,
                  error: result.success ? undefined : result.error,
                }
              : u
          ));
        }
      } catch (err) {
        // HF-353 P-D: a long plan interpretation (~83s) may return a gateway 504 / drop the
        // connection while the SERVER IS STILL RUNNING. Treating that as a terminal failure
        // (the old behavior) marked the units 'error' → exposed "Retry failed" → the user
        // re-submitted, tripping HF-259 single-flight. THE FIX: on ANY error, do NOT decide
        // from the response — poll the DURABLE plan_interpretation_runs.status and keep the
        // units in "still processing" while in_progress (no 'error', so no re-submit). Only a
        // 'failed'/'absent' durable status surfaces a retryable failure.
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        const errorMsg = err instanceof Error && !isAbort ? err.message : 'Plan processing failed';
        const stillProcessing = (note: string) => setUnits(prev => prev.map(u =>
          planUnits.some(pu => pu.contentUnitId === u.contentUnitId)
            ? { ...u, status: 'processing' as const, error: note }
            : u));
        stillProcessing('Still processing — a large plan can take ~90 seconds…');

        const outcome = await pollPlanRunStatus(tenantId, () => stillProcessing('Still processing — interpretation in progress…'));
        if (outcome === 'completed') {
          setUnits(prev => prev.map(u =>
            planUnits.some(pu => pu.contentUnitId === u.contentUnitId)
              ? {
                  ...u,
                  status: 'complete' as const,
                  error: undefined,
                  result: {
                    contentUnitId: u.contentUnitId,
                    classification: u.classification,
                    success: true,
                    rowsProcessed: 0,
                    pipeline: 'plan-interpretation',
                  },
                }
              : u
          ));
        } else {
          // Durable status is 'failed' or 'absent' (after the stall window) → a genuine, retryable failure.
          setUnits(prev => prev.map(u =>
            planUnits.some(pu => pu.contentUnitId === u.contentUnitId)
              ? { ...u, status: 'error' as const, error: errorMsg }
              : u
          ));
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIMARY PATH: Per-file bulk execution via Supabase Storage (OB-174/HF-142)
    // Each file group downloads its own file server-side. No rawData in HTTP body.
    // Legacy fallback retained for graceful degradation when storage upload
    // fails or processing_jobs table is unavailable.
    // ═══════════════════════════════════════════════════════════════════
    if (dataUnits.length > 0 && (storagePaths && Object.keys(storagePaths).length > 0 || storagePath)) {
      const fileGroups = new Map<string, ExecutionUnit[]>();
      for (const unit of dataUnits) {
        const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
        const sourceFile = proposalUnit?.sourceFile || '_default';
        if (!fileGroups.has(sourceFile)) fileGroups.set(sourceFile, []);
        fileGroups.get(sourceFile)!.push(unit);
      }

      console.log(`[HF-142] File groups (${fileGroups.size}): ${Array.from(fileGroups.keys()).join(', ')}`);
      console.log(`[HF-142] Storage paths available: ${JSON.stringify(storagePaths || {})}`);

      const loopStart = Date.now(); // DIAG-070: measures the gap between files (the architect's 5-min symptom)
      for (const [sourceFile, groupUnits] of Array.from(fileGroups.entries())) {
        // HF-141: Strict per-file path resolution — NO cross-file fallback.
        // Only use storagePaths[sourceFile] (exact match). If missing and only
        // one file was uploaded (single-file case), use storagePath as the
        // single-file fallback. Never use storagePath when multiple files exist.
        const hasMultipleFiles = fileGroups.size > 1;
        const filePath = storagePaths?.[sourceFile] || (!hasMultipleFiles ? storagePath : undefined);
        // HF-142: Log per-file storage path resolution for diagnostic traceability
        console.log(`[HF-142] sourceFile: "${sourceFile}" → storagePath: ${filePath || 'NONE'} (matched: ${!!filePath})`);

        if (filePath) {
          console.log(`[HF-142] Executing bulk for "${sourceFile}" → ${filePath} (${groupUnits.length} units)`);
          // HF-295 Part 2: per-file isolation. A file's failure (stall or thrown error) is
          // recorded against THIS file's units only — never break/return — so every sibling
          // file still processes to completion. No unit is left as an indefinite spinner:
          // any of this file's units not already terminal becomes an explained failure.
          const fileLabel = deriveFileLabel(groupUnits[0]?.contentUnitId ?? '', sourceFile);
          const markFileFailed = (failure: ImportFileFailure) => {
            setUnits(prev => prev.map(u =>
              groupUnits.some(g => g.contentUnitId === u.contentUnitId) && (u.status === 'processing' || u.status === 'pending')
                ? { ...u, status: 'error' as const, error: failure.errorClass, failure }
                : u));
          };
          console.log(`[TRACE-CLIENT] DISPATCH-START file=${sourceFile} at +${Date.now() - loopStart}ms`); // DIAG-070
          try {
            const outcome = await executeBulk(groupUnits, filePath);
            console.log(`[TRACE-CLIENT] DISPATCH-END file=${sourceFile} settled=${outcome.settled} at +${Date.now() - loopStart}ms`); // DIAG-070
            if (!outcome.settled) {
              markFileFailed(toImportFileFailure(fileLabel, outcome.errorClass ?? 'unknown', outcome.technicalDetail));
            }
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            console.log(`[TRACE-CLIENT] DISPATCH-END file=${sourceFile} settled=THREW at +${Date.now() - loopStart}ms`); // DIAG-070
            markFileFailed(toImportFileFailure(fileLabel, classifyImportError({ rawError: detail }), detail));
          }
        } else {
          // HF-141: No storage path for this specific file — legacy fallback per unit
          console.warn(`[HF-141] No storage path for "${sourceFile}" — using legacy execution`);
          for (const unit of groupUnits) {
            setElapsedSeconds(0);
            setUnits(prev => prev.map(u =>
              u.contentUnitId === unit.contentUnitId
                ? { ...u, status: 'processing' as const }
                : u
            ));
            try {
              const unitResult = await executeLegacyUnit(unit);
              if (unitResult && unitResult.success) {
                setUnits(prev => prev.map(u =>
                  u.contentUnitId === unit.contentUnitId
                    ? { ...u, status: 'complete' as const, result: unitResult }
                    : u
                ));
              } else {
                setUnits(prev => prev.map(u =>
                  u.contentUnitId === unit.contentUnitId
                    ? { ...u, status: 'error' as const, error: unitResult?.error || 'Unknown error', result: unitResult }
                    : u
                ));
              }
            } catch (err) {
              setUnits(prev => prev.map(u =>
                u.contentUnitId === unit.contentUnitId
                  ? { ...u, status: 'error' as const, error: err instanceof Error ? err.message : 'Processing failed' }
                  : u
              ));
            }
          }
        }
      }
    } else if (dataUnits.length > 0) {
      // LEGACY FALLBACK: No storagePath — sends rawData via HTTP body (AP-1 tolerated for degradation).
      // Reached when: (1) storage upload failed, (2) single-file sync path without storage,
      // (3) processing_jobs table unavailable. rawDataRef stores only first file's data.
      for (const unit of dataUnits) {
        setElapsedSeconds(0);
        setUnits(prev => prev.map(u =>
          u.contentUnitId === unit.contentUnitId
            ? { ...u, status: 'processing' as const }
            : u
        ));

        try {
          const unitResult = await executeLegacyUnit(unit);
          if (unitResult && unitResult.success) {
            setUnits(prev => prev.map(u =>
              u.contentUnitId === unit.contentUnitId
                ? { ...u, status: 'complete' as const, result: unitResult }
                : u
            ));
          } else {
            setUnits(prev => prev.map(u =>
              u.contentUnitId === unit.contentUnitId
                ? { ...u, status: 'error' as const, error: unitResult?.error || 'Unknown error', result: unitResult }
                : u
            ));
          }
        } catch (err) {
          setUnits(prev => prev.map(u =>
            u.contentUnitId === unit.contentUnitId
              ? { ...u, status: 'error' as const, error: err instanceof Error ? err.message : 'Processing failed' }
              : u
          ));
        }
      }
    }
  }, [confirmedUnits, rawData, proposal.proposalId, tenantId, storagePath, storagePaths, executeBulk, executeLegacyUnit]);

  // Start execution on mount — OB-151: dual guard (module-level Set + useRef)
  useEffect(() => {
    // Primary guard: module-level Set survives component remount
    if (executedProposals.has(proposal.proposalId)) return;
    // Secondary guard: useRef survives strict mode double-invocation
    if (executionDone || executingRef.current) return;

    executedProposals.add(proposal.proposalId);
    executingRef.current = true;

    const run = async () => {
      await executeUnits(units);
      setExecutionDone(true);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build overall result when done
  useEffect(() => {
    if (!executionDone) return;

    const results: ContentUnitResult[] = units.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: u.classification,
      success: u.status === 'complete',
      rowsProcessed: u.result?.rowsProcessed || 0,
      pipeline: u.result?.pipeline || u.classification,
      error: u.error,
    }));

    const result: SCIExecutionResult = {
      proposalId: proposal.proposalId,
      results,
      overallSuccess: results.every(r => r.success),
      // HF-360 (Part C): carry the hand-off job so the page enters the truthful 'loading' phase (the rows
      // are staged + loading on the worker, not in committed_data yet — the reconstructed per-unit
      // rowsProcessed are 0 at stage time; PulseLoadProgress reads the job for the real load progress).
      ...(pulseLoadJobRef.current ? { pulseLoadJob: pulseLoadJobRef.current } : {}),
      // HF-360: staging succeeded but the enqueue failed — surface a failure, not a false completion.
      ...(pulseEnqueueFailedRef.current ? { pulseLoadEnqueueFailed: true } : {}),
    };

    onComplete(result);
  }, [executionDone, units, proposal.proposalId, onComplete]);

  const hasErrors = units.some(u => u.status === 'error');
  // HF-087: Track if retry is in progress to prevent duplicate clicks
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryFailed = async () => {
    if (isRetrying) return; // Prevent duplicate retry
    setIsRetrying(true);

    const failedUnits = units.filter(u => u.status === 'error');

    // Reset failed units to pending
    setUnits(prev => prev.map(u =>
      u.status === 'error' ? { ...u, status: 'pending' as const, error: undefined } : u
    ));

    // OB-151: Allow retry to execute (clear module-level guard for this proposal)
    executedProposals.delete(proposal.proposalId);

    setExecutionDone(false);
    await executeUnits(failedUnits);
    setExecutionDone(true);
    setIsRetrying(false);
  };

  // OB-139: Render via ExecutionProgress
  // HF-087: Pass elapsed time for long operations
  return (
    <ExecutionProgress
      items={toProgressItems(units)}
      isComplete={executionDone}
      hasErrors={hasErrors}
      onRetryFailed={handleRetryFailed}
      onContinue={onUploadMore}
      elapsedSeconds={elapsedSeconds}
      isRetrying={isRetrying}
      livePhase={livePhase}
      onCancel={asyncSessionId ? handleCancelImport : undefined}
      cancelRequested={cancelRequested}
    />
  );
}
