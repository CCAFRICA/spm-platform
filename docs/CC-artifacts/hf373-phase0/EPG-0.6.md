# HF-373 Phase 0 — EPG-0.6

**Verdict:** CONFIRMED

**Root cause:** D7 — terminal job status lies — has TWO distinct mechanisms, both confirmed live on the 2026-07-02 run, both rooted in the fact that finalize-import stamps the terminal state {status:'finalized', phase:'completed', completed_at} UNCONDITIONALLY (finalize-import/route.ts:149) with zero knowledge of the commit outcome, while the coalesce claim (import_finalize_runs) — not the job record — decides whether that stamp ever runs.

(i) FAILED 86K job (Casa Diaz 0f648189, 42MB Abril_00001_1_demo_REF.xlsx) recorded finalized/completed WITH the commit-failure error attached. Chain: commit-content-unit.ts:775 failCommit('commit CSV upload failed … The object exceeded the maximum allowed size') → execute-bulk:846-850 recordCommitFailureOnJob (job-failure.ts:37-45: status='failed', error_detail, completed_at) + markSessionJobs phase='failed'. execute-bulk correctly SKIPS its server-side finalize (guard :873 requires overallSuccess). But the CLIENT fires finalize regardless of unit failures: page.tsx handleExecutionComplete (:551-569) has NO branch for unit-level commit failure — only pulseLoadEnqueueFailed and pulseLoadJob are special-cased; a sync-path result with success:false units falls through to fireFinalizeAndFlywheel(:567→:524). finalize-import never reads results/status/error_detail; it runs its whole-tenant steps and stamps line 149. The statusMayAdvance guard (job-status.ts:49-54, failed=7 > finalized=6) WOULD have blocked the status flip — but the dispatch-jobs cron's failed-requeue (dispatch-jobs/route.ts:116-140) reset the job to status='pending', retry_count 0→1 (observed retry_count=1; all 9 sibling jobs =0; process-job's claim at :95-97 sets only classifying+started_at, never retry_count) in the window between the failure (~01:31-33) and the finalize stamp (01:37:04). At finalize:149's select the rank was <6, so 'finalized'/'completed'/completed_at all landed, with error_detail retained (the requeue keeps it). Note: even WITHOUT the requeue, patchJobs (job-status.ts:64-73) writes phase and completed_at UNCONDITIONALLY — only status is rank-guarded — so phase='completed'+completed_at would have overwritten a failed job anyway.

(ii) SUCCESSFUL workbook job (Casa Diaz 52fad564, COMISIONES___AUTORIZADOS, 8 plans + 186 data rows + 73 entities) stuck at committed/finalizing, completed_at=null. Chain: SCIExecution.executeUnits splits ONE import (one proposalId 5851bd78) into a PLAN-group execute-bulk call (body :622-628 — carries NO sessionId) followed by a DATA-group call (body :445-451 — carries sessionId). TWO concurrent plan-arm invocations ran (plan_interpretation_runs shows two interleaved sequential chains over disjoint sheet sets via the single-flight claim: chain X 01:13:54→01:17:08, chain Y 01:14:53→01:16:48). The second invocation exhausted claimable sheets and exited ~01:16:49; because it was 'successful' with no pulse job, execute-bulk:873-884 fired waitUntil finalize — a PLAN-ONLY invocation that committed no data. That finalize claimed (CASA, 5851bd78), matched 0 jobs at lines 72 and 149 (metadata.proposal_id is stamped ONLY by execute-bulk entry WITH sessionId, :201, which no-ops for the sessionless plan call and hadn't run yet), ran ~1s against a tenant with zero committed_data, and stamped the claim 'done' at 01:16:50.061. The DATA-group invocation then entered (~01:17:09), committed all 186 rows 01:20:58–01:21:05, exited 01:21:06 stamping status='committed', phase='finalizing' (:859 — phase_at=01:21:06.459 matches the live record byte-for-byte), and fired finalize run B (:874) → COALESCED at finalize-import:65-68 (decideFinalizeClaim: prior.status==='done' → granted:false, PERMANENT — no staleness escape for 'done', finalize-coalesce.ts:45) → returned BEFORE the line-149 stamp. The client's fire (page.tsx:567→524) coalesced identically. No writer of committed→finalized+completed_at exists outside finalize-import:149, so the transition is never written.

**HALT-1 notes:** Framing confirmed on both counts. Enrichments beyond the directive: (i) needed TWO cooperating defects — the outcome-blind finalize stamp AND the dispatch-jobs failed-requeue un-terminalizing the failure (without the requeue the status would have stayed 'failed' but phase/completed_at would still have lied); (ii) the coalesce claim was consumed not by a concurrent duplicate but by a PLAN-ONLY execute-bulk invocation's finalize that ran BEFORE the data commit started — and its job stamps landed on ZERO rows silently. Third specimen of the same family: VLTEST2 job 8dee9aa0 (BCL_Plan_Comisiones) shows status='finalized' but phase='finalizing' — plan-file imports systematically get inconsistent terminal stamps.

**Fix implications:** The fix must make processing_jobs (the record BOTH UIs trust: SCIExecution.tsx:194-238 direct poll of status/error_detail/metadata.phase by tenant_id+session_id, and /api/platform/observatory:897,923,958 for the fleet view) truthful at the terminal transition. Concretely:

1. finalize-import/route.ts:149 must become OUTCOME-AWARE: before stamping finalized/completed, consult the matched jobs' actual state (error_detail set / phase='failed' / a commit-failure marker) and stamp 'failed'+phase 'failed' (preserving error_detail and NOT completedAt-as-success) for failed imports — or refuse to stamp and leave the failure terminal. It must also treat a 0-rows-matched markJobsByProposal as a loud anomaly (today the return value is discarded — the workbook's finalize stamped its claim 'done' while its job stamp landed nowhere), e.g. fall back to session-scoped matching or defer completeFinalize until the stamp verifiably landed.

2. dispatch-jobs/route.ts:116-140 failed-requeue must not resurrect commit-stage failures: a job whose metadata.phase='failed' (or error_detail starting 'Commit failed'/'Commit error') is terminally failed — requeueing it to 'pending' both erases the terminal rank (enabling the finalized overwrite via statusMayAdvance) and pointlessly re-dispatches a classify worker at a job whose file already classified. Gate the requeue on the failure stage (classify-stage only) or on metadata.phase.

3. job-status.ts patchJobs:64-73 must gate phase/completed_at with the SAME rank guard as status (or at minimum never write phase='completed'/completed_at when the status advance was rejected) — today a blocked status write still overwrites phase='failed' with 'completed' and stamps completed_at.

4. The coalesce claim (finalize-coalesce.ts + execute-bulk:873-884) must not be consumable by a data-less invocation: either (a) execute-bulk fires the waitUntil finalize ONLY when the invocation actually committed data rows (plan-only invocations skip it — they have nothing for entity resolution anyway), or (b) the claim key must distinguish pre-data-commit finalizes (e.g., include a commit generation/batch marker), or (c) a 'done' claim needs a re-arm path when a LATER commit for the same proposal lands (execute-bulk:859's committed-stamp is the natural place to reset the claim to allow one more pass). Without one of these, any multi-invocation import (SCIExecution executeUnits: plan group then data group(s), one shared proposalId) can permanently lose its terminal transition.

5. Thread sessionId into the plan-group execute-bulk body (SCIExecution.tsx:622-628) so plan invocations stamp/see the job record like data invocations (:201/:859 currently no-op for them); this also removes the window where metadata.proposal_id is absent and markJobsByProposal silently matches nothing.

6. page.tsx handleExecutionComplete:551-569 should branch on per-unit failure (result.results.some(!success)) — surface the failure and skip (or outcome-tag) the finalize fire, mirroring the server-side guard at execute-bulk:873.

Tables/files to touch: web/src/app/api/import/sci/finalize-import/route.ts, web/src/app/api/import/sci/execute-bulk/route.ts, web/src/app/api/import/sci/dispatch-jobs/route.ts, web/src/lib/sci/job-status.ts, web/src/lib/sci/finalize-coalesce.ts, web/src/lib/sci/job-failure.ts, web/src/components/sci/SCIExecution.tsx, web/src/app/operate/import/page.tsx; DB tables processing_jobs (status/metadata.phase/completed_at/error_detail) and import_finalize_runs (claim semantics). Constraint observed: statusMayAdvance's failed-is-terminal model is correct — the violations came from writers that bypass it (requeue resets, unconditional phase/completed_at) and from the claim ledger deciding completion independently of the job record. Also fix-adjacent but real: the premature plan-only finalize ran entity resolution/summary against a pre-commit tenant, and the workbook's REAL post-commit finalize work was only done by ACCIDENT by the next import's finalize (entities last created 01:35:43 + rule_sets updated 01:35:49 under the FAILED Abril import's claim) — an import that isn't followed by another import would keep NULL entity_ids as well as the lying status.

## Evidence

### _hf373_epg06_jobs_probe.ts — FP-49 introspection, select * limit 1

```
processing_jobs columns: ["id","tenant_id","status","file_storage_path","file_name","file_size_bytes","structural_fingerprint","classification_result","recognition_tier","proposal","chunk_progress","error_detail","retry_count","uploaded_by","session_id","created_at","started_at","completed_at","batch_id","chunk_id","total_chunks","metadata"]  — metadata is jsonb, live shape: {"phase": "...", "phase_at": "ISO", "proposal_id": "uuid"}
```

### _hf373_epg06_detail_probe.ts — OFFENDER 1 (failed 86K job) verbatim (sans proposal/classification blobs)

```
{"id":"0f648189-1a0f-4878-9103-179992b79401","tenant_id":"2d9979ba-5032-48a7-bccf-1928f3e6dadf","status":"finalized","file_name":"1782955730650_0_a1bb9962_Abril_00001_1_demo_REF.xlsx","file_size_bytes":42402023,"error_detail":"Commit failed — Abril_00001_1_demo_REF.xlsx::Exportar Hoja de Trabajo::0: commit CSV upload failed for \"Exportar Hoja de Trabajo\": The object exceeded the maximum allowed size","retry_count":1,"session_id":"5de0e6e1-fc3f-4b44-ade0-b00f4ddebf0b","created_at":"2026-07-02T01:29:09.988923+00:00","started_at":"2026-07-02T01:29:11.104+00:00","completed_at":"2026-07-02T01:37:04.186+00:00","metadata":{"phase":"completed","phase_at":"2026-07-02T01:37:04.186Z","proposal_id":"6291bd7c-fb5c-4ceb-ba67-f985b149a8b7"},"recognition_tier":3}
```

### _hf373_epg06_detail_probe.ts — OFFENDER 2 (stuck workbook job) verbatim

```
{"id":"52fad564-47e5-4d39-8ab9-09b730e1c2ba","tenant_id":"2d9979ba-5032-48a7-bccf-1928f3e6dadf","status":"committed","file_name":"1782954670826_0_bcfba244_COMISIONES___AUTORIZADOS_-_copia.xlsx","file_size_bytes":90535,"error_detail":null,"retry_count":0,"session_id":"faddc773-32ca-46dc-a888-2504b89d806f","created_at":"2026-07-02T01:11:11.533616+00:00","started_at":"2026-07-02T01:11:11.809+00:00","completed_at":null,"metadata":{"phase":"finalizing","phase_at":"2026-07-02T01:21:06.459Z","proposal_id":"5851bd78-2382-4db9-afdb-fded902a08b0"},"recognition_tier":3}
```

### _hf373_epg06_detail_probe.ts — import_finalize_runs (claim ledger), Casa Diaz rows; pulse_load_jobs empty

```
columns: ["tenant_id","proposal_id","status","claimed_at"]
{"tenant_id":"2d9979ba-...","proposal_id":"5851bd78-2382-4db9-afdb-fded902a08b0","status":"done","claimed_at":"2026-07-02T01:16:50.061+00:00"}  <- workbook claim DONE at 01:16:50, BEFORE the data commit (rows landed 01:20:58-01:21:05, exit stamp 01:21:06)
{"tenant_id":"2d9979ba-...","proposal_id":"6291bd7c-fb5c-4ceb-ba67-f985b149a8b7","status":"done","claimed_at":"2026-07-02T01:37:04.108+00:00"}  <- failed-import claim done 76ms before the job's finalized stamp (01:37:04.186)
pulse_load_jobs since 2026-07-01 for both tenants: no rows (pulse worker + finalize-sweep NOT involved in this run)
```

### _hf373_epg06_planrun_probe.ts + _hf373_epg06_timing_probe.ts + _hf373_epg06_cd_probe.ts — workbook timeline

```
plan_interpretation_runs (8, all source_file 0_bcfba244_COMISIONES___AUTORIZADOS_-_copia.xlsx): two interleaved sequential chains over DISJOINT sheets => two concurrent plan-arm invocations cooperating via single-flight: Chain X: LOCALES REFAC created 01:13:54.16→done 01:15:00.79; MAQUINARIA (2) 01:15:01.38→01:16:44.97; PULL (EXTERNOS) 01:16:45.88→01:17:08.62. Chain Y: FORANEAS 01:14:53.52→01:15:14.17; MAQUINARIA 01:15:14.60→01:15:37.68; GARANTIZADA 01:15:37.92→01:15:54.72; DISTRIBUIDORES 01:15:55.00→01:16:22.43; DIST Y SUC 01:16:22.73→01:16:48.75. Chain Y exhausts claimable sheets ~01:16:49 => its invocation exits => waitUntil finalize => claim 'done' 01:16:50.061.
committed_data CASA count=186: 67 entity rows created 01:20:58.740947, 119 reference rows 01:21:00.013–01:21:05.810 (ALL after the claim went done). entities CASA count=73 first=01:20:58.002 last=01:35:43.704 (last = the failed import's whole-tenant finalize doing the workbook's entity work). rule_sets.updated_at all 01:35:49.x = same finalize's input_bindings invalidation.
retry_count across all 10 run jobs: every job =0 EXCEPT the failed Abril job =1 (proof of exactly one dispatch-jobs failed→pending requeue).
```

### web/src/app/api/import/sci/finalize-import/route.ts:64-72,146-150 — the terminal-status writer: coalesce-return precedes the stamp; the stamp is outcome-blind and unconditional

```
const claim = await claimFinalize(supabase, tenantId, proposalId);
if (!claim.granted) {
  trace(`coalesced: ${claim.reason}`);
  return NextResponse.json({ ok: true, tenantId, coalesced: true, reason: claim.reason, durationMs: Date.now() - t0 });
}
...
await markJobsByProposal(supabase, tenantId, proposalId, { phase: 'finalizing' });   // line 72
...
await completeFinalize(supabase, tenantId, proposalId, true);                        // line 146 — claim -> 'done'
// HF-372 Phase D: the import is COMPLETE — the job record says so, server-side, before insights.
await markJobsByProposal(supabase, tenantId, proposalId, { status: 'finalized', phase: 'completed', completedAt: true });  // line 149 — NO check of commit outcome anywhere in this route; return value (rows matched) ignored
```

### web/src/app/api/import/sci/execute-bulk/route.ts:199-201,846-884 — end-of-pipeline writers + the waitUntil finalize fire that plan-only invocations also take

```
:201  await markSessionJobs(supabase, tenantId, sessionId, { status: 'committing', phase: 'committing', proposalId });  // ONLY stamper of metadata.proposal_id; no-ops when sessionId absent
:846  if (!response.overallSuccess) {
:847    const reason = results.filter(r => !r.success).map(r => `${r.contentUnitId}: ${r.error ?? 'commit failed'}`).join(' | ').slice(0, 2000);
:849    await recordCommitFailureOnJob(supabase, tenantId, sessionId, `Commit failed — ${reason}`);
:850    await markSessionJobs(supabase, tenantId, sessionId, { phase: 'failed' });
:851  } else if (pulseLoadJob) {
:854    await markSessionJobs(supabase, tenantId, sessionId, { phase: 'loading' });
:855  } else {
:859    await markSessionJobs(supabase, tenantId, sessionId, { status: 'committed', phase: 'finalizing' });   // <- the stuck job's exact live state (phase_at 01:21:06.459)
:860  }
:873  if (response.overallSuccess && !pulseLoadJob) {
:874    try { waitUntil(
:875      fetch(`${req.nextUrl.origin}/api/import/sci/finalize-import`, { method: 'POST', headers: {..., ...internalCronHeaders() }, body: JSON.stringify({ tenantId, proposalId }) })  // fires for ANY successful invocation, incl. PLAN-ONLY (no data committed)
```

### web/src/lib/sci/job-status.ts:49-54,62-73 — rank guard blocks failed->finalized, but phase/completed_at/error_detail are written UNCONDITIONALLY

```
export function statusMayAdvance(current, next) {
  const cur = JOB_STATUS_RANK[current ?? ''] ?? -1;
  const nxt = JOB_STATUS_RANK[next] ?? -1;
  if (next === 'failed') return current !== 'committed' && current !== 'finalized';
  return nxt > cur;   // failed=7 > finalized=6 => finalized can NEVER overwrite failed via this path
}
// patchJobs:
if (patch.status && statusMayAdvance(job.status, patch.status)) update.status = patch.status;
if (patch.phase || patch.proposalId) { update.metadata = { ...(job.metadata ?? {}), ...(patch.phase ? { phase: patch.phase, phase_at: ... } : {}), ... }; }   // NOT rank-guarded
if (patch.errorDetail) update.error_detail = patch.errorDetail.slice(0, 2000);
if (patch.completedAt) update.completed_at = new Date().toISOString();               // NOT rank-guarded
// markJobsByProposal (:141-151) matches .eq('metadata->>proposal_id', proposalId); returns 0 silently when nothing matches
```

### web/src/lib/sci/job-failure.ts:36-46 — recordCommitFailureOnJob (the failure writer)

```
.update({ status: JOB_TERMINAL_FAILED, error_detail: reason.slice(0, 2000), completed_at: new Date().toISOString() })
.eq('tenant_id', tenantId)
.eq('session_id', sessionId)
.neq('status', 'committed')
```

### web/src/app/api/import/sci/dispatch-jobs/route.ts:112-140 — the requeue that un-terminalizes a commit failure (mechanism for status='finalized' landing over 'failed')

```
// ── 2. RETRY FAILED (P-B4) ──  Requeue 'failed' jobs that have retries left...
const { data: failed } = await supabase.from('processing_jobs').select('id, retry_count, started_at').eq('status', 'failed').lt('retry_count', MAX_RETRIES);
...
// Read-then-guarded-write the increment: bump retry_count, reset to 'pending', keep error_detail.
const reset = await supabase.from('processing_jobs').update({ status: 'pending', retry_count: retryCount + 1 }).eq('id', job.id).eq('status', 'failed').select('id');
// process-job/route.ts:95-97 claim proves retry_count is bumped ONLY here: .update({ status: 'classifying', started_at: new Date().toISOString() }) — no retry_count. Failed job retry_count=1, all 9 siblings=0 => exactly one requeue ran between the failure and the 01:37:04 finalize stamp; at finalize:149's select the status ranked <6 so 'finalized' was allowed.
```

### web/src/app/operate/import/page.tsx:522-530,551-569 — client fires finalize regardless of unit-level commit failure

```
const fireFinalizeAndFlywheel = useCallback((proposalId: string) => {
  void fetch('/api/import/sci/finalize-import', { method: 'POST', ..., body: JSON.stringify({ tenantId, proposalId }) })...

const handleExecutionComplete = useCallback((result: SCIExecutionResult) => {
  if (result.pulseLoadEnqueueFailed) { setState({ phase: 'error', ... }); return; }
  if (result.pulseLoadJob) { setState({ phase: 'loading', ... }); return; }
  // Synchronous path (hand-off off): the rows are already loaded — finalize + complete now.
  const totalRows = result.results.filter(r => r.success).reduce((s, r) => s + r.rowsProcessed, 0);
  fireFinalizeAndFlywheel(result.proposalId);   // <- NO check of result.overallSuccess / per-unit success
  goComplete(result, totalRows);
}, ...);
```

### web/src/components/sci/SCIExecution.tsx:619-628 (plan-group call, NO sessionId) vs :442-451 (data-group call, sessionId threaded)

```
// PLAN group:
const res = await fetchWithTimeout('/api/import/sci/execute-bulk', { method: 'POST', ..., body: JSON.stringify({ proposalId: proposal.proposalId, tenantId, storagePath, storagePaths, contentUnits: planExecUnits }) });   // <- sessionId ABSENT => execute-bulk :201/:859 markSessionJobs no-op for plan invocations
// DATA group (:445-451):
body: JSON.stringify({ proposalId: proposal.proposalId, tenantId, sessionId: asyncSessionId ?? undefined, // HF-358 (Part B-1)
  storagePath: effectivePath, contentUnits: bulkUnits })
```

### web/src/lib/sci/finalize-coalesce.ts:41-47,88-92 — a 'done' claim is a PERMANENT coalesce (no staleness escape); completeFinalize re-stamps claimed_at at completion

```
if (prior.status === 'failed') return { granted: true, reason: 'prior claim failed — retrying' };
if (prior.status === 'done') return { granted: false, reason: 'coalesced — this import was already finalized' };   // <- never retryable, no age check
if (ageMs > STALE_CLAIM_MS) return { granted: true, ... }  // staleness applies only to 'running'
// completeFinalize: .update({ status: ok ? 'done' : 'failed', claimed_at: new Date().toISOString() })
```

### web/src/lib/sci/commit-content-unit.ts:775 — the emitting site of the failure text

```
if (uploadErr) return await failCommit(`commit CSV upload failed for "${tabName}": ${uploadErr.message}`);
```

### web/src/components/sci/SCIExecution.tsx:194-238 — UI read surface 1 (import screen): direct browser-Supabase poll of processing_jobs

```
const tick = async () => {
  let { data, error } = await sb.from('processing_jobs').select('status, error_detail, metadata').eq('tenant_id', tenantId).eq('session_id', asyncSessionId);
  ...
  // live phase = the most recently stamped metadata.phase across the session's jobs (by metadata.phase_at)
  const terminal = data.every((j) => j.status === 'committed' || j.status === 'finalized' || j.status === 'failed');
  if (terminal) { const failedJobs = data.filter(j => j.status === 'failed'); setServerTerminal({ failed: failedJobs.length > 0, reason: failedJobs.map(j => j.error_detail).filter(Boolean).join(' | ') || undefined }); }
};  // polled every 2500ms. NOTE: 'committed' counts as terminal SUCCESS => the stuck workbook renders complete; the finalized-stamped failed job (status not 'failed') renders success despite error_detail.
```

### web/src/app/api/platform/observatory/route.ts:897,922-923,958 + web/src/components/platform/IngestionTab.tsx:83,257-278 — UI read surface 2 (fleet view)

```
route :897  .select('id, tenant_id, file_name, status, retry_count, error_detail, created_at, started_at, completed_at, metadata')
route :922  const IN_FLIGHT = new Set(['pending', 'classifying', 'committing']);
route :923  const DONE = new Set(['committed', 'finalized']);   // <- 'committed' counts as done => stuck workbook is green in the fleet view
route :958  phase: ((j.metadata ?? {}) as { phase?: string }).phase ?? null,
IngestionTab :83 fetch('/api/platform/observatory?tab=ingestion'); :257 JOB_STATUS_STYLE[j.status]; :276 renders PHASE_LABEL[j.phase] unless phase in ['completed','failed']
```

### git evidence — the run executed on current code

```
HF-372 (#654, adds job-status.ts/finalize-coalesce wiring) merged 2bd8db2b 2026-07-01 17:48:06 -0700 = 00:48 UTC, before the run (00:54–01:37 UTC). git diff 2bd8db2b..HEAD on finalize-import/execute-bulk/job-status/job-failure: ONLY the OB-257 revenue-materializer step (finalize-import step 6, post-run) differs; every status-writer line quoted above is byte-identical to what ran.
```

