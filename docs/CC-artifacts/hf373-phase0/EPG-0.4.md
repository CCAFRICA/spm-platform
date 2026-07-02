# HF-373 Phase 0 — EPG-0.4

**Verdict:** PARTIAL

**Root cause:** D9 is real but the directive's "containment works / superseded harmlessly / clean runs" framing is wrong in three load-bearing ways. MECHANISM: (1) FINALIZE MULTI-FIRE IS STRUCTURAL — finalize-import is dispatched once per execute-bulk 200 (waitUntil, execute-bulk/route.ts:872-884) PLUS once by the client (page.tsx:522-540) PLUS the finalize-sweep cron on hand-off — and the client splits ONE import into N execute-bulk requests (one PLAN-arm request per import with plan units, SCIExecution.tsx:619; one DATA request per file group, SCIExecution.tsx:442; legacy per-unit fallback, SCIExecution.tsx:552), so an import fires finalize 1+N times. Casa 5851bd78 fired FOUR (plan-arm ×2 + data-arm ×1 + client ×1). (2) THE HF-371 CLAIM CONTAINS DUPLICATES BUT PICKS THE WRONG PASS: the PLAN-arm request finishes BEFORE the data commit, its waitUntil finalize claims first, completes, stamps status='done' — and every later (post-data) finalize COALESCES against 'done' (finalize-coalesce.ts:45), so entity-resolution/assignments/summary run against PRE-COMMIT data and never re-run for the import's actual rows. Proven live twice: VLTEST2 94b838b8 claim done 00:59:41.738 while data batches landed 00:59:42.067/42.922; Casa 5851bd78 claim done 01:16:50.061 while data batches landed 01:20:58-01:21:05 (job left stuck status='committed'/phase='finalizing' forever). (3) THE VLTEST2 "AUDIT DIVERGENCE on a clean run" IS A CASCADE FROM (2): the premature granted finalize stamped the job status='finalized' (finalize-import/route.ts:149) → SCIExecution's 2.5s processing_jobs poll saw all-terminal (SCIExecution.tsx:226-233) → the serverTerminal effect force-completed the UI mid-commit (SCIExecution.tsx:243-251) → ImportReadyState mounted and fired settle-audit (ImportReadyState.tsx:91) at 00:59:42 — MID-COMMIT (scan saw 4 of 20 rows, Tablas batch still 'processing', Metas not started) → compareTelemetry flagged sheets/units/rows/perUnit → the verdict is FIRST-WINS PERMANENT (settle-audit/route.ts:106-110), so a genuinely clean import (final state: 3 completed batches, committed_data=20/20, all units bound) carries a frozen false AUDIT DIVERGENCE. (4) The Casa alarm quoted in the directive (fields=rows,perUnit,pulses(formula), session 6291bd7c) was a TRUE divergence, not a clean run: the commit FAILED ("commit CSV upload failed", batch status='failed', committed_data=0) after windowed-commit accumulated expectedRows=1921 at commit start (windowed-commit.ts:144-145) — yet the job was later stamped 'finalized'/phase 'completed', which is what made the run LOOK clean. (5) pulses(formula) is a pure echo of rows divergence: the audit compares ceil(rows/500) on BOTH sides (settle-audit/route.ts:76-79), while the accumulated record carries ACTUAL HF-359 byte-budgeted pulse counts (live: 85 rows → 2 actual pulses vs formula 1; 186 rows → 9 actual vs formula 1) — PULSE_SIZE=500 (comprehension-state-service.ts:354, "D16: 500-row pulses") is stale bookkeeping kept unflagged only by the formula-to-formula comparison. (6) THE DOUBLE COMMIT: Casa's plan-arm execute-bulk ran TWICE CONCURRENTLY (two response pairs of ::split bound emissions 01:16:49.099/.440 and 01:17:08.733/09.044; plan_interpretation_runs show two interleaved sequential chains starting 01:13:54 and 01:14:53). It was rendered harmless NOT by import-batch supersession but by the per-(file-hash:sheet) content_hash single-flight in plan_interpretation_runs (each sheet interpreted once, 8 rule_sets, no duplicates). The server accepts unlimited concurrent identical commits: execute-bulk has NO request-level claim; the plan case (route.ts:413-458) runs BEFORE the Phase-B resume skip (route.ts:534-569 / execute-resume.ts) and is therefore guarded by NOTHING at the route level. The dispatcher of the second plan-arm POST could not be pinned from DB evidence (no request logs; the plan-arm fetch has no client retry; the OB-151/W-6 guards checked out) — needs Vercel request logs. The same defect class at scale: Casa proposal bcb1d921 (2026-07-01 05:51-05:58, pre-HF-371-deploy window) accumulated 312 batches for ONE 837-row unit in ONE proposal, two interleaved commit streams, all superseded 'content_unit_hash_match_reimport'.

**HALT-1 notes:** Directive framing corrections: (1) "all coalesced — containment works" is only half true. The HF-371 claim does deduplicate, but it grants the FIRST fire, and on the plan+data import shape the first fire is the PLAN-ARM's waitUntil — which lands BEFORE the data commit. The granted finalize then runs against pre-commit data, completeFinalize stamps 'done', and the correct post-data finalize (data-arm waitUntil + client fire) is REJECTED by the 'done' coalesce (finalize-coalesce.ts:45). Proven live on both tenants: VLTEST2 94b838b8 (claim done 00:59:41.738 vs data batches 00:59:42.067/42.922) and Casa 5851bd78 (claim done 01:16:50.061 vs data batches 01:20:58-01:21:05, job permanently stuck status='committed'/phase='finalizing'). (2) "FOUR times" is the Casa 5851bd78 import (plan-arm ×2 + data-arm ×1 + client ×1), not a VLTEST2 one; VLTEST2's plan import fired three times. (3) "plan file commit ran TWICE back-to-back (superseded harmlessly)" — confirmed as two CONCURRENT plan-arm execute-bulk invocations (signal pairs at 01:16:49 and 01:17:09; interleaved plan_interpretation_runs chains starting 01:13:54 and 01:14:53), but the harmlessness came from the plan_interpretation_runs content-hash single-flight (HF-259), NOT import-batch supersession, and the duplicate's client-side dispatcher could not be identified from DB evidence (no client retry exists for the plan arm; all client guards check out; Vercel request logs needed). The route accepts unlimited concurrent identical commits — plan units bypass even the Phase-B resume skip. (4) "AUDIT DIVERGENCE fired on both tenants on clean runs" — PARTIAL: VLTEST2 94b838b8 is a genuine false alarm on a clean import, caused by the premature-finalize cascade (job stamped 'finalized' mid-commit → SCIExecution job-poll settles the UI early → ImportReadyState mounts → settle-audit scans mid-commit → first-wins freezes the divergent verdict). But the directive's quoted fields=rows,perUnit,pulses(formula) alarm is Casa 6291bd7c, which was a TRUE divergence: the commit genuinely failed ('commit CSV upload failed', 0 rows in committed_data to this day) while finalize-import stamped the job 'finalized'/phase 'completed' anyway — the run only looked clean because the job record lies. (5) pulses(formula) cannot fire independently: it compares ceil(rows/500) on both sides, so it is an echo of rows; the PULSE_SIZE=500 formula itself IS stale post-HF-359 (live: 2 and 9 actual pulses vs formula 1 on equal-row clean runs) but that staleness is currently masked, not alarmed.

**Fix implications:** (1) COMMIT-SIDE CLAIM (the directive's asked-for fix, modeled on finalize-coalesce.ts): add an atomic per-(tenant_id, proposal_id, dispatch-scope) claim table (e.g. import_commit_runs, mirroring web/supabase/migrations/20260702_hf371_import_finalize_runs.sql) claimed at execute-bulk entry — INSERT with unique PK, '23505'→coalesce (return the in-flight/terminal disposition), stale-claim takeover keyed to the 300s maxDuration, 'failed'→retryable, '42P01'→degrade to today's behavior. The claim scope must cover the PLAN case: executeBatchedPlanInterpretation at execute-bulk/route.ts:413-458 currently runs before classifyUnitForResume (route.ts:534-569) and is guarded by nothing at the route level; a duplicate plan-arm POST re-runs the entire plan pipeline (contained today only by plan_interpretation_runs content-hash single-flight). Casa bcb1d921's 312-batch runaway shows what the unguarded data path does under repeated dispatch. (2) FINALIZE DISPATCH CORRECTNESS: the waitUntil finalize (route.ts:872-884) must not fire from a request that committed no committed_data rows (the plan-arm request), OR finalize-coalesce must be generation-aware — a 'done' claim must not coalesce a finalize fired after NEW import_batches landed for the same proposal (compare claim claimed_at vs max(batch.created_at), or key the claim on a commit-generation counter). Today the first (pre-data) pass wins and the real pass is suppressed. (3) JOB TRUTH: markJobsByProposal({status:'finalized', phase:'completed'}) at finalize-import/route.ts:149 must be gated on session completeness (all session units terminal / all batches completed), otherwise the premature 'finalized' feeds SCIExecution's terminal poll (SCIExecution.tsx:226-251) and collapses the UI mid-commit; also note phase writes are unranked jsonb merges (job-status.ts:65-70) so later 'finalizing' regresses a 'completed' phase — rank phases like statuses. Separately, finalize stamps 'finalized' even after a failed commit (Casa 6291bd7c: error_detail='Commit failed…' + status='finalized' + committed_data=0) — 'finalized' must not overwrite/mask a failed import (interacts with job-failure.ts rank 'failed'=7; investigate how 6291bd7c reached 'finalized' past the statusMayAdvance guard — suspect a dispatch-jobs requeue or direct-writer reset between 01:35:42 and 01:37:04). (4) SETTLE-AUDIT PRECONDITION: settle-audit (route.ts) needs a 'session settled' gate before the first-wins write — refuse (retryable 409/deferred) when any tracked unit is non-terminal or any session batch is status='processing' within liveness; and stop dispatching it from executeBulk's per-file-group finalize() (SCIExecution.tsx:415-423 — fires N times per import, races later groups by construction); ImportReadyState's mount fire can remain as the single dispatcher once the page reaches truthful completion. Alternatively make the audit re-derivable (last-wins or versioned) instead of frozen (route.ts:106-110). (5) PULSE FORMULA: retire PULSE_SIZE=500 (comprehension-state-service.ts:354) — either compare actual pulse bookkeeping (accumulated pulsesLanded/pulsesTotal, windowed-commit.ts:196-223) against a scanned reconstruction that acknowledges byte-budgeted pulses, or drop the pulses(formula) audit field (it is redundant with rows). Files/tables to touch: web/src/app/api/import/sci/execute-bulk/route.ts, web/src/lib/sci/finalize-coalesce.ts (+ new commit-claim module + migration alongside import_finalize_runs), web/src/app/api/import/sci/finalize-import/route.ts, web/src/app/api/import/sci/settle-audit/route.ts, web/src/components/sci/SCIExecution.tsx, web/src/components/sci/ImportReadyState.tsx, web/src/lib/sci/job-status.ts, web/src/lib/sci/comprehension-state-service.ts. Constraints observed: import_finalize_runs has no fire-count column (claimed_at is overwritten at completion, finalize-coalesce.ts:89) — if fire-counting is wanted for observability, add a coalesced_count/last_coalesced_at column. Follow-up evidence gap: the dispatcher of Casa's duplicate concurrent plan-arm POST needs Vercel request logs (unresolvable read-only from the DB).

## Evidence

### web/src/app/api/import/sci/execute-bulk/route.ts:872-884 (finalize dispatcher #1: per-request server-side waitUntil — fires after EVERY successful execute-bulk request incl. the plan-arm request that precedes the data commit)

```
    if (response.overallSuccess && !pulseLoadJob) {
      try {
        waitUntil(
          fetch(`${req.nextUrl.origin}/api/import/sci/finalize-import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...internalCronHeaders() },
            body: JSON.stringify({ tenantId, proposalId }),
          })
            .then((r) => console.log(`[HF-362] server-side synchronous finalize dispatched: HTTP ${r.status}`))
            .catch((err) => console.warn('[HF-362] server-side finalize dispatch failed (client fire is the fallback):', err instanceof Error ? err.message : err)),
        );
      } catch { /* non-Vercel context — the fetch still runs detached */ }
    }
```

### web/src/app/operate/import/page.tsx:522-540 + 551-576 (finalize dispatchers #2/#3: client fire on sync execution-complete and on hand-off load-complete; fires UNCONDITIONALLY even when results contain failures)

```
  const fireFinalizeAndFlywheel = useCallback((proposalId: string) => {
    if (!tenantId) return;
    void fetch('/api/import/sci/finalize-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, proposalId }),
    })
...
  const handleExecutionComplete = useCallback((result: SCIExecutionResult) => {
...
    if (result.pulseLoadJob) {
      setState({ phase: 'loading', executionResult: result, pulseLoadJob: result.pulseLoadJob });
      return;
    }
    // Synchronous path (hand-off off): the rows are already loaded — finalize + complete now.
    const totalRows = result.results.filter(r => r.success).reduce((s, r) => s + r.rowsProcessed, 0);
    fireFinalizeAndFlywheel(result.proposalId);
    goComplete(result, totalRows);
  }, [fireFinalizeAndFlywheel, goComplete]);

  const handleLoadComplete = useCallback((result: SCIExecutionResult, rowsLoaded: number) => {
    fireFinalizeAndFlywheel(result.proposalId);
    goComplete(result, rowsLoaded);
  }, [fireFinalizeAndFlywheel, goComplete]);
```

### web/src/app/api/import/sci/pulse-load/finalize-sweep/route.ts:70-79 + web/vercel.json (finalize dispatcher #4: cron every 2 min, hand-off sessions only — pulse_load_jobs was EMPTY for both tenants this window, so it did not fire in the evidentiary runs)

```
      const r = await fetch(`${origin}/api/import/sci/finalize-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalCronHeaders() },
        body: JSON.stringify({ tenantId: c.tenant_id, proposalId: c.session_id }),
      });
---vercel.json---
  "crons": [
    { "path": "/api/import/sci/pulse-load/finalize-sweep", "schedule": "*/2 * * * *" },
    { "path": "/api/import/sci/dispatch-jobs", "schedule": "*/5 * * * *" }
  ]
(dispatch-jobs/route.ts:93 fires only /api/import/sci/process-job — classify, never execute-bulk/finalize)
```

### web/src/components/sci/SCIExecution.tsx:442-451 (execute-bulk dispatcher A: per-file-group data commit, carries sessionId), :552-561 (dispatcher B: legacy per-unit fallback when a file has no storage path, NO sessionId), :619-629 (dispatcher C: plan-arm — ALL plan units in one request, NO sessionId)

```
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
---plan arm (line 619)---
        const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalId: proposal.proposalId,
            tenantId,
            storagePath,
            storagePaths,
            contentUnits: planExecUnits,
          }),
        });
(NOTE: plan-arm + legacy bodies omit sessionId → execute-bulk's entry stamp markSessionJobs(status:'committing', proposalId) at route.ts:200 NO-OPS for them — this is why Casa's premature finalize could not mark the job while VLTEST2's could.)
```

### web/src/components/sci/SCIExecution.tsx:48 + 822-839 + 884-891 and web/src/app/operate/import/page.tsx:484-490 (the existing client guards — all per-proposal, none server-side; retry deletes the module guard)

```
const executedProposals = new Set<string>();
...
  useEffect(() => {
    // Primary guard: module-level Set survives component remount
    if (executedProposals.has(proposal.proposalId)) return;
    // Secondary guard: useRef survives strict mode double-invocation
    if (executionDone || executingRef.current) return;
    executedProposals.add(proposal.proposalId);
    executingRef.current = true;
...
  const handleRetryFailed = async () => {
    if (isRetrying) return;
...
    executedProposals.delete(proposal.proposalId);
---page.tsx W-6 guard---
    if (state.phase !== 'proposal') return;
    if (confirmingProposalRef.current === state.proposal.proposalId) return;
    confirmingProposalRef.current = state.proposal.proposalId;
---HF-296 re-POST (the one BY-DESIGN duplicate-commit avenue: re-POSTs on a lost response while the server invocation may still be running)---
SCIExecution.tsx:507:        if (attempt < MAX_EXECUTE_ATTEMPTS) continue; // idempotent route — re-POST the lost work
```

### web/src/app/api/import/sci/execute-bulk/route.ts:413 + 534-549 and web/src/lib/sci/execute-resume.ts:30-48 (the server's ONLY concurrency guard — Phase B resume — covers DATA units only; the plan case at 413-458 runs BEFORE this loop, unguarded)

```
    if (planUnits.length > 0) {   // route.ts:413 — runs unconditionally, before any resume/skip logic
      ... executeBatchedPlanInterpretation(...)
---unit loop guard (route.ts:534-549), data units only---
    for (const unit of sortedUnits) {
      if (handledPlanUnitIds.has(unit.contentUnitId)) continue;
      const dispo = classifyUnitForResume({ spineState, latestBatch: latestBatchByUnit.get(unit.contentUnitId) ?? null, livenessMs: batchLivenessMs(), nowMs: Date.now() });
      if (dispo !== 'process') { ... continue; }
---execute-resume.ts:30-48---
export function classifyUnitForResume(params: {...}): ResumeDisposition {
  if (spineState === 'bound' || spineState === 'resolved' || spineState === 'failed_interpretation') return 'skip_terminal';
  if (latestBatch?.status === 'completed') return 'skip_completed_batch';
  if (latestBatch?.status === 'processing') {
    const age = nowMs - Date.parse(latestBatch.createdAt);
    if (Number.isFinite(age) && age < livenessMs) return 'skip_in_flight';
  }
  return 'process';
}
```

### web/src/lib/sci/finalize-coalesce.ts:33-51 + 65-90 (deliverable d — the claim mechanism, the model for the commit-side fix; note completeFinalize OVERWRITES claimed_at, so the table records completion time and holds ONE row per import, no fire-count column)

```
export function decideFinalizeClaim(insertErrorCode, prior, nowMs): FinalizeClaimDecision {
  if (insertErrorCode === undefined) return { granted: true, reason: 'claimed (first caller)' };
  if (insertErrorCode === '42P01') return { granted: true, reason: 'claim table absent (migration pending) — proceeding on idempotency' };
  if (insertErrorCode === '23505') {
    if (!prior) return { granted: true, reason: 'claim row vanished — proceeding' };
    if (prior.status === 'failed') return { granted: true, reason: 'prior claim failed — retrying' };
    if (prior.status === 'done') return { granted: false, reason: 'coalesced — this import was already finalized' };
    if (ageMs > STALE_CLAIM_MS) return { granted: true, reason: `prior claim stale ... taking over` };
    return { granted: false, reason: 'coalesced — another finalize pass is in flight for this import' };
  }
  return { granted: true, reason: `claim insert error ${insertErrorCode} — proceeding on idempotency` };
}
...
  const { error } = await claimTable(sb).insert({ tenant_id: tenantId, proposal_id: key, status: 'running', claimed_at: new Date(nowMs).toISOString() });
...
export async function completeFinalize(sb, tenantId, proposalId, ok) {
  try { await claimTable(sb).update({ status: ok ? 'done' : 'failed', claimed_at: new Date().toISOString() })... }
(migration: web/supabase/migrations/20260702_hf371_import_finalize_runs.sql)
```

### probe _hf373_epg04_dispatch_evidence.ts — FP-49 introspect + live rows of import_finalize_runs (one coalesced row per import, status done; claimed_at = completion time)

```
keys: [ 'tenant_id', 'proposal_id', 'status', 'claimed_at' ]
VLTEST2:
{"tenant_id":"5b078b52-...","proposal_id":"1417079c-5389-4057-95a4-517cdbb58119","status":"done","claimed_at":"2026-07-02T01:03:12.159+00:00"}  <- 6-Datos import: 6 file groups = 6 waitUntil fires + 1 client fire = 7 dispatches, 1 claim
{"tenant_id":"5b078b52-...","proposal_id":"94b838b8-080a-4bee-8fb2-77527f94ae47","status":"done","claimed_at":"2026-07-02T00:59:41.738+00:00"}  <- plan import: claim DONE at 00:59:41.738, BEFORE data batches 00:59:42.067 (Tablas) and 00:59:42.922 (Metas)
{"tenant_id":"5b078b52-...","proposal_id":"1b229d90-063e-4f8f-86a5-613eaf1861be","status":"done","claimed_at":"2026-07-02T00:56:02.414+00:00"}
CASA_DIAZ:
{"tenant_id":"2d9979ba-...","proposal_id":"6291bd7c-fb5c-4ceb-ba67-f985b149a8b7","status":"done","claimed_at":"2026-07-02T01:37:04.108+00:00"}
{"tenant_id":"2d9979ba-...","proposal_id":"5851bd78-2382-4db9-afdb-fded902a08b0","status":"done","claimed_at":"2026-07-02T01:16:50.061+00:00"}  <- FOUR-fire import: claim DONE at 01:16:50.061, 4 MINUTES BEFORE the data batches (01:20:58-01:21:05); plan-arm#2 (~01:17:09), data-arm (~01:21:06) and client (~01:21:07) fires all coalesced against 'done'
```

### probe _hf373_epg04_signals.ts — Casa 5851bd78 ::split bound-emission timeline (each execute-bulk request emits the plan set twice: in-loop at route.ts:486 + post-response re-emit at route.ts:934; TWO pairs = TWO invocations = the plan commit ran TWICE)

```
2026-07-02T01:16:49.099644+00:00  bound  ...::LOCALES REFAC::0::split (+7 more, all 8 splits)   <- invocation #1 in-loop emit
2026-07-02T01:16:49.440647+00:00  bound  (all 8 splits)                                          <- invocation #1 post-response re-emit
2026-07-02T01:17:08.733135+00:00  bound  (all 8 splits)                                          <- invocation #2 in-loop emit
2026-07-02T01:17:09.044824+00:00  bound  (all 8 splits)                                          <- invocation #2 post-response re-emit
duplicates: x4 for every ::split unit; x2 for every base unit (one data-arm invocation: per-unit bounds 01:20:59-01:21:06.4 + one batched re-emit 01:21:06.606)
---VLTEST2 94b838b8 (contrast: exactly ONE plan-arm + ONE data-arm)---
00:59:40.277 + 00:59:40.421  bound all 3 splits (pair = 1 invocation)
00:59:42.012 / 42.880 / 43.949 per-unit + 00:59:44.075 re-emit (pair = 1 data invocation)
```

### probe _hf373_epg04_planruns.ts — plan_interpretation_runs (Casa): 8 runs, each sheet ONCE, but created_at forms two interleaved sequential chains (chain 1 starts 01:13:54, chain 2 starts 01:14:53) = two concurrent plan-arm invocations deduped by the content_hash single-flight — the 'superseded harmlessly' containment is HF-259 single-flight, NOT batch supersession

```
{"content_hash":"b03fa74f...:LOCALES REFAC","status":"completed","created_at":"2026-07-02T01:13:54.1658+00:00","updated_at":"2026-07-02T01:15:00.794+00:00"}
{"content_hash":"b03fa74f...:FORANEAS REFAC","created_at":"2026-07-02T01:14:53.525928+00:00","updated_at":"2026-07-02T01:15:14.174+00:00"}   <- starts BEFORE LOCALES finishes: second concurrent executor
{"content_hash":"b03fa74f...:MAQUINARIA (2)","created_at":"2026-07-02T01:15:01.388234+00:00","updated_at":"2026-07-02T01:16:44.974+00:00"}
{"content_hash":"b03fa74f...:MAQUINARIA","created_at":"2026-07-02T01:15:14.604891+00:00",...}
{"content_hash":"b03fa74f...:PULL (EXTERNOS)","created_at":"2026-07-02T01:16:45.884982+00:00","updated_at":"2026-07-02T01:17:08.626+00:00"}  <- finished by invocation #2, 19s after invocation #1's bound emit
(8 rule_sets total, no duplicates; the two 'COMISIONES DE MAQUINARIA' rule_sets are from DIFFERENT sheets — metadata.contentUnitId 'MAQUINARIA (2)::2::split' vs 'DIST Y SUC::6::split' — NOT a double commit)
```

### web/src/app/api/import/sci/settle-audit/route.ts:60-81 + 76-79 + 106-110 + 137-143 (deliverable c — the AUDIT DIVERGENCE computation, the formula-level pulse compare, and the first-wins permanence)

```
function compareTelemetry(scanned: ImportTelemetry, accumulated: ImportTelemetry): string[] {
  const fields: string[] = [];
  const eq = (name, a, b) => { if (JSON.stringify(canon(a)) !== JSON.stringify(canon(b))) fields.push(name); };
  eq('totalSignalsWritten', ...); eq('signalsPerType', ...); eq('sheets', ...); eq('fingerprints', ...); eq('atoms', ...); eq('llm', ...); eq('fieldBindingsInjected', ...); eq('units', ...);
  eq('rows', scanned.rows, accumulated.rows);
  eq('perUnit', sortedPerUnit(scanned), sortedPerUnit(accumulated));
  // Formula-level pulse comparison (see header note).
  eq('pulses(formula)', scanned.pulses, {
    committed: Math.ceil(accumulated.rows.committed / PULSE_SIZE),
    total: Math.ceil(accumulated.rows.total / PULSE_SIZE),
  });
  return fields;
}
...
    if (record.audit) {
      // Already settled — idempotent no-op (first audit wins).
      return NextResponse.json({ audited: true, alreadySettled: true, divergent, audit: record.audit });
    }
...
    if (divergent) {
      console.error(`[OB-203][telemetry] AUDIT DIVERGENCE session=${importSessionId} fields=${divergentFields.join(',')}`);
      await emitEvent({ tenant_id: tenantId, event_type: 'data.import_telemetry_audit_divergence', ... });
```

### web/src/lib/sci/comprehension-state-service.ts:350-354 + 453 (the stale formula side) vs web/src/lib/sci/session-telemetry-accumulator.ts:378 and windowed-commit.ts:196-197/222-223 (the actual byte-budgeted counter side)

```
// Pulse size mirrors commit-content-unit's sci-bulk write profile (D16: 500-row pulses). ...
export const PULSE_SIZE = 500;
...
    pulses: { committed: Math.ceil(committed / PULSE_SIZE), total: Math.ceil(rowsTotal / PULSE_SIZE) },   // scanned side = formula
---projector (accumulated side = ACTUAL commit-path pulse bookkeeping)---
    pulses: { committed: pulsesLanded, total: pulsesTotal },
---windowed-commit.ts (per-pulse cumulative writes; HF-359 byte-budgeted, NOT 500-row)---
:196   await accumulateUnitCommitFields({ ... fields: { pulsesLanded, rowsCommitted: totalInserted, pulsesTotal: Math.max(estTotalPulses, pulsesLanded) } }, supabase);
:222   await accumulateUnitCommitFields({ ... fields: { pulsesTotal: pulsesLanded, pulsesLanded, expectedRows: totalRows, rowsCommitted: totalInserted, batchCommitted: true } }, supabase);
---LIVE proof the formula is stale (equal rows, actual != formula, UNFLAGGED because both compare sides are formulas)---
VLTEST2 1b229d90 (85 rows, clean): scanned_pulses={total:1,committed:1} accumulated_pulses={total:2,committed:2} divergent:false
CASA 5851bd78 (186 rows, clean): scanned_pulses={total:1,committed:1} accumulated_pulses={total:9,committed:9} divergent:false
=> pulses(formula) can NEVER independently fire; when it fired on 6291bd7c it was purely an echo of the rows divergence (formula on accumulated.rows.total=1921 -> ceil(1921/500)=4 vs scanned.pulses.total=0).
```

### probe _hf373_epg04_dispatch_evidence.ts — the two live AUDIT DIVERGENCE records (import_session_telemetry.audit) matching the directive's quoted log line

```
VLTEST2 session 94b838b8 (plan import): auditAt 2026-07-02T00:59:42.575Z divergent:true fields=["sheets","units","rows","perUnit"]
  scanned_rows={total:4,committed:4} accumulated_rows={total:18,committed:4} scanned_units={total:4} accumulated_units={total:5}
  scanned.perUnit: [{committed:true,sheetName:"Plan General",expectedRows:4}]
  accumulated.perUnit: [{committed:true,"Plan General",4},{committed:false,"Tablas de Tasas",14}]  <- Metas Mensuales ABSENT: record read mid-commit
  FINAL truth NOW: committed_data count=20 (4+14+2), 3 batches all completed non-superseded, all 6 units bound => clean import, frozen false alarm
CASA session 6291bd7c: auditAt 2026-07-02T01:35:43.131Z divergent:true fields=["rows","perUnit","pulses(formula)"]  <- the directive's exact quote
  scanned_rows={total:0,committed:0} accumulated_rows={total:1921,committed:0}; scanned.perUnit=[]; accumulated.perUnit=[{committed:false,"Exportar Hoja de Trabajo",1921}]
  NOT a clean run: import_batches row 02d85774 status='failed' rows=1921; processing_job 0f648189 err="Commit failed — Abril_00001_1_demo_REF.xlsx::Exportar Hoja de Trabajo::0: commit CSV upload failed f"; committed_data NOW=0; yet job status='finalized' phase='completed' phase_at=01:37:04.186 (stamped by the coalesce-granted finalize at 01:37:04)
```

### VLTEST2 94b838b8 premature-finalize cascade — DB-timestamp chain proving the false alarm mechanism (probes: batches + signals + finalize_runs + processing_jobs)

```
00:58:50.367 plan_interpretation_runs created (single run) -> 00:59:40.173 completed; rule_set 91f822b1 created 00:59:40.155
00:59:40.277/40.421 plan-arm invocation's two split-bound emissions => plan-arm 200 ~00:59:40.4 => waitUntil finalize dispatched
00:59:41.123 import_batches e584dcd9 'Plan General' (data-arm invocation, batch inserts as 'processing', flips completed at unit end)
00:59:41.738 import_finalize_runs claim stamped DONE (completeFinalize) — the granted finalize COMPLETED before 2 of 3 data units committed; markJobsByProposal stamps job status='finalized' phase='completed'
00:59:42.067 batch 1ec492c2 'Tablas de Tasas' inserted (still committing)
00:59:42.575 audit.at — settle-audit ran MID-COMMIT: scanned committed_data=4 (only Plan General landed), Tablas batch not yet 'completed', Metas unit absent from accumulated record => divergent verdict frozen (first-wins)
  (dispatch chain: SCIExecution processing_jobs poll every 2.5s [SCIExecution.tsx:236] saw status='finalized' => setServerTerminal [226-233] => effect [243-251] setUnits(complete)+setExecutionDone => onComplete => page 'complete' => ImportReadyState mount fires settle-audit [ImportReadyState.tsx:91])
00:59:42.922 batch 39238f1a 'Metas Mensuales' inserted
00:59:44.021 job metadata.phase regressed 'completed'->'finalizing' phase_at=00:59:44.021 = execute-bulk data-arm success tail markSessionJobs({status:'committed',phase:'finalizing'}) [route.ts:859] — status write blocked by rank (committed=5 < finalized=6, job-status.ts:49-54) but PHASE is an unranked jsonb merge [job-status.ts:65-70] => observed stuck row {status:'finalized', phase:'finalizing'}
~00:59:44+ data-arm waitUntil finalize + client fireFinalizeAndFlywheel both COALESCE against claim status='done' => the import's actual 20-row data never got its own finalize pass
```

### web/src/components/sci/SCIExecution.tsx:226-251 (the poll that converts a premature 'finalized' job status into premature UI completion) and SCIExecution.tsx:415-423 (the OTHER settle-audit dispatcher: fires per FILE GROUP on every outcome incl. fail-fast — no session-settled precondition)

```
      const terminal = data.every((j: { status: string }) => j.status === 'committed' || j.status === 'finalized' || j.status === 'failed');
      if (terminal) { ... setServerTerminal({ failed: failedJobs.length > 0, ... }); }
...
  useEffect(() => {
    if (!serverTerminal || executionDone) return;
    setUnits(prev => prev.map(u => (u.status === 'complete' || u.status === 'error') ? u : (serverTerminal.failed ? { ...u, status: 'error' ... } : { ...u, status: 'complete' as const })));
    setExecutionDone(true);
  }, [serverTerminal, executionDone]);
---the per-file-group audit dispatcher---
    const finalize = (outcome: FileDispatchOutcome): FileDispatchOutcome => {
      // OB-203 Phase D: once-per-session settle audit (idempotent; ImportReadyState backstops on mount).
      void fetch('/api/import/sci/settle-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, importSessionId: proposal.proposalId }),
      }).catch(() => { /* completion-screen invocation is the backstop */ });
      return outcome;
    };
(In a multi-file import, file-group 1's finalize() fires the ONCE-per-session first-wins audit while groups 2..N are still uncommitted — the same premature-audit defect exists by construction even without the job-status cascade.)
```

### probe _hf373_epg04_batches.ts — Casa proposal bcb1d921 (2026-07-01 05:51-05:58): the D9 class at runaway scale — 312 batches for ONE unit in ONE proposal, two interleaved commit streams (~2.5s creation cadence, two completion trains 05:56:29-05:57:11 and 05:58:07-05:58:35), all superseded

```
CASA bcb1d921 batch count: 312
{"id":"08a8d771","created":"2026-07-01T05:52:09.811565+00:00","completed":"2026-07-01T05:56:29.467344+00:00","status":"completed","sup_by":"1b4f1cbc","sup_reason":"content_unit_hash_match_reimport","rows":837,"unit":"Abril_00001_1_demo_REF.xlsx::Exportar Hoja de Trabajo::0"}
{"id":"9ca985d9","created":"2026-07-01T05:52:55.619805+00:00","completed":"2026-07-01T05:58:20.259387+00:00",...same unit...}
{"id":"61a7feb3","created":"2026-07-01T05:52:55.399904+00:00","completed":"2026-07-01T05:56:57.425707+00:00",...same unit...}  <- creations 0.2s apart, completions 83s apart = two concurrent streams
(all 312 rows: same unit, same proposal, rows=836/837, sup_reason='content_unit_hash_match_reimport')
```

### probe _hf373_epg04_drill.ts — Casa 5851bd78 job left permanently un-finalized by the premature claim (deliverable b harm) + the 8 data batches that landed AFTER the claim was done

```
processing_jobs 52fad564 session=faddc773 file=1782954670826_0_bcfba244_COMISIONES___AUTORIZADOS_-_copia.xlsx status='committed' phase='finalizing' phase_at=2026-07-02T01:21:06.459Z err:null   <- stuck forever: the only finalize pass completed 01:16:50, later fires coalesced, nothing ever stamps 'finalized'
import_batches (proposal 5851bd78): 8 batches 01:20:58.098 -> 01:21:05.478, all completed, none superseded (FORANEAS 67, LOCALES 24, MAQUINARIA(2) 31, MAQUINARIA 45, GARANTIZADA 2, DISTRIBUIDORES 4, DIST Y SUC 8, PULL 5 = 186 rows) — ALL after the finalize claim was stamped done at 01:16:50.061
```

