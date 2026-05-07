# HF-210 — Cap route.ts CalcTrace at 5 Entities for Log Visibility — Completion Report

**Date:** 2026-05-07
**Branch:** `hf-210-recon-top-trace-cap`
**Baseline SHA (main):** `e06e2b11e3e46bfac095ed7b21c1f2ac57bab4d5` (post-HF-208 merge)
**Commit SHA:** `2c6dea809f6b93983030d50ca811356dba4269c4`
**Substrate citations:** Decision 153 LOCKED, T5-E1064.

---

## Hard Gates

### Gate 1 — Patch landed

`TRACE_CAP_N`, `tracedEntityIds`, `shouldEmitTrace` declarations added at handler scope (route.ts:103-115, immediately after HF-208 counters). 13 of 14 `[CalcTrace]` addLog sites wrapped with `if (shouldEmitTrace(<entityId>)) { ... }` pattern. 1 site (line 1088, `[CalcTrace] context`) left unwrapped — one-off setup line; no entity ID in scope; structurally part of reconciliation header, not part of per-entity volume.

Diff: `1 file changed, 55 insertions(+), 13 deletions(-)`. The 13 deletions are the original unwrapped addLog lines (replaced by 3-line wrap blocks each).

### Gate 2 — Build PASS

```
+ First Load JS shared by all                 88.1 kB
  ├ chunks/2117-a743d72d939a4854.js           31.9 kB
  ├ chunks/fd9d1056-5bd80ebceecc0da8.js       53.7 kB
  └ other shared chunks (total)               2.59 kB

ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Full route table emitted, no errors.

### Gate 3 — Lint PASS

Only pre-existing warnings (period-context.tsx, tenant-context.tsx, SCIExecution.tsx); no errors; no warnings on `route.ts`. Matches HF-206/HF-207/HF-208 baseline.

### Gate 4 — Typecheck PASS

```
__tests__/round-trip-closure/run.ts(285,3): error TS2345: ...
```

Single pre-existing TS2345 in test infrastructure (HF-198 γ origin). Acceptable per HF-206/HF-207/HF-208 directive precedent. No new errors.

### Gate 5 — Wrap evidence

```
$ grep -nE "addLog\(\`\[CalcTrace\]|shouldEmitTrace" web/src/app/api/calculation/run/route.ts
109:  function shouldEmitTrace(entityId: string): boolean {
1088:  addLog(`[CalcTrace] context tenantId=...`)            <-- UNWRAPPED (one-off setup)
1154:    if (shouldEmitTrace(entityExternalId)) {
1155:      addLog(`[CalcTrace] resolveMetricsFromConvergenceBindings:entry ...`)
1186:      if (shouldEmitTrace(entityExternalId)) {
1187:        addLog(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied ... ratio ...`)
1194:      if (shouldEmitTrace(entityExternalId)) {
1195:        addLog(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit ... path=ratio ...`)
1206:        if (shouldEmitTrace(entityExternalId)) {
1207:          addLog(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit ... single_actual_null ...`)
1216:      if (shouldEmitTrace(entityExternalId)) {
1217:        addLog(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied ... slot=actual ...`)
1230:        if (shouldEmitTrace(entityExternalId)) {
1231:          addLog(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied ... slot=target ...`)
1243:            if (shouldEmitTrace(entityExternalId)) {
1244:              addLog(`[CalcTrace] resolveMetricsFromConvergenceBindings:attainment_computed ...`)
1252:    if (shouldEmitTrace(entityExternalId)) {
1253:      addLog(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit ... single_or_dual ...`)
1285:      if (shouldEmitTrace(entityExternalId)) {
1286:        addLog(`[CalcTrace] resolveColumnFromBatch:exit ... no_batch_map ...`)
1294:      if (shouldEmitTrace(entityExternalId)) {
1295:        addLog(`[CalcTrace] resolveColumnFromBatch:exit ... no_rows ...`)
1319:    if (shouldEmitTrace(entityExternalId)) {
1320:      addLog(`[CalcTrace] resolveColumnFromBatch:exit ... rowCount=... sum=... found=...`)
1847:    if (shouldEmitTrace(entityInfo?.external_id ?? entityId)) {
1848:      addLog(`[CalcTrace] runCalculation:entity_start ...`)
1895:      if (shouldEmitTrace(entityInfo?.external_id ?? entityId)) {
1896:        addLog(`[CalcTrace] runCalculation:component_complete ...`)
```

13 sites wrapped. 1 site (line 1088 context) unwrapped — explanation in Known Issues §1 below.

---

## Soft Gates

| Gate | Status | Evidence |
|---|---|---|
| Decision 153 LOCKED | PASS | Signal-surface architecture preserved; no new private state. `tracedEntityIds` is a transient handler-scope Set, not part of intelligence/synaptic-density layer |
| T5-E1064 (Procedural Theater Minimization) | PASS | Single 12-line helper block + 13 wrap operations. No new files, no new types, no API changes, no schema changes, no engine semantics changes |
| §3 single-file scope | PASS | Only `web/src/app/api/calculation/run/route.ts` modified |
| §3.6 counter wiring unaffected | PASS | HF-208 counters (`diag003FallbackCount`, `ob118MergeGuardFiredCount`, `boundaryFallbackCount`) increment at sites OUTSIDE wrapped trace blocks; counts remain authoritative for all 85 entities |
| §3.5 [CalcRecon] block placement unchanged | PASS | Block remains at handler-exit position per HF-208; cap alone solves visibility |
| §7 OOS refusals honored | PASS | No buffering, no block move, no cross-file changes, no engine changes, no counter changes |

---

## Standing Rule Compliance

| Rule | Status | Notes |
|---|---|---|
| Rule 14 (prompts in git) | N/A | Architect-channel directive content; expected via VG repo |
| Rule 24 (3-fix pivot) | N/A | First fix attempt |
| Rule 25 (validate whole flow before fixing parts) | PASS | Pre-patch grep located all 14 sites; identified context line as structurally distinct (one-off setup vs per-entity blizzard); surfaced exception in Gate 5 evidence |
| Rule 26 (Hard/Soft/Rules/Issues/Verification structure) | PASS | This report follows the structure |
| Korean Test (T1-E910) | PASS | `shouldEmitTrace` is purely structural; uses `Set.has` / `Set.size`; no language-specific tokens |
| Channel separation (T2-E46) | PASS | Architect dispatches → CC executes single-file patch with surfaced exception; no engine semantics change |

---

## Known Issues

1. **Line 1088 `[CalcTrace] context` unwrapped exception** — surfaced for architect disposition.
   
   Per directive §3.2: "If a site has no entity ID in scope (shouldn't happen but verify), surface to architect — do not skip."
   
   The context line (route.ts:1088) is a one-off SETUP emission firing ONCE per calc invocation, BEFORE any entity loop runs. It contains tenant/period/ruleSet identification — structurally part of reconciliation evidence, not part of per-entity blizzard. No entity ID in scope at emission time.
   
   Wrapping it would either:
   - Always pass the cap check (size < 5 always true at this point) — no behavioral change, just dead-code wrapping
   - Suppress it entirely if cap pre-populated — opposite of directive's reconciliation-visibility goal
   
   Decision: leave unwrapped. Documented in commit message and Gate 5. If architect prefers explicit wrapping with always-true check, surface in HF-211 follow-up.

2. **intent-executor.ts traces remain uncapped** — accepted cost per directive §7.
   
   ~10 trace lines per entity × 85 entities = ~850 lines per period continue to emit from `web/src/lib/calculation/intent-executor.ts` (resolveSource:metric_lookup, executeBoundedLookup1D:execution, executeBoundedLookup2D:execution). These use `console.log` directly, not handler-scope `addLog`. Cross-file capping would require parameter threading or callback injection — out of HF-210 single-file scope.
   
   Total post-HF-210 log volume per period: route.ts ~25 setup + ~12 VARIANT-DIAG + ~85 VARIANT lines + ~85 per-entity total lines + (5 × ~32 wrapped route.ts trace) + (85 × ~10 intent-executor trace) + ~95 [CalcRecon] + HF-207 emissions ≈ 1,170 lines. [CalcRecon] block at ~line 1,070 of paste. Per directive §3.3 FINAL analysis: comfortably within Vercel paste buffer.

3. **Forensic coverage limited to first 5 entities in calc-execution order.**
   
   For specific-entity diagnostics requiring an entity beyond position 5, options:
   - Architect raises `TRACE_CAP_N` constant temporarily (1-line edit + redeploy)
   - Architect re-orders entity processing to put target entity in first 5 (would require engine change — out of scope)
   - Architect inspects intent-executor traces (which still emit for ALL entities) to gather sub-trace evidence
   
   Acceptable trade-off per directive §2 rationale.

4. **Counter accuracy preserved** — HF-208 counters (`diag003FallbackCount`, `ob118MergeGuardFiredCount`, `boundaryFallbackCount`) increment OUTSIDE the wrapped `[CalcTrace]` blocks. They count ALL events for ALL 85 entities. The [CalcRecon] flags line continues to report accurate totals across the full population. Capping affects trace VISIBILITY only, not COUNTING.

---

## Verification Script Output

### Phase 0 — Sync + branch creation

```
$ git checkout main && git pull origin main && git rev-parse --short HEAD
e06e2b11
$ git checkout -b hf-210-recon-top-trace-cap
Switched to a new branch 'hf-210-recon-top-trace-cap'
```

### Phase 1 — Site inventory

```
$ grep -nE "addLog\(\`\[CalcTrace\]" web/src/app/api/calculation/run/route.ts | wc -l
14
```

14 sites total: 1 one-off setup (line 1088) + 13 per-entity (lines 1138/1168/1174/1184/1192/1204/1215/1222/1253/1260/1283/1809/1855 pre-shift).

### Phase 2 — Patch application + post-patch line numbers

```
$ grep -nE "shouldEmitTrace" web/src/app/api/calculation/run/route.ts | wc -l
14
```

14 references: 1 declaration (line 109) + 13 call sites (matching 13 wrapped addLogs).

### Phase 3 — Build summary

Full Next.js route table emitted, 88.1 kB First Load JS, no errors.

### Phase 4 — Lint

Only pre-existing warnings (period-context.tsx, tenant-context.tsx, SCIExecution.tsx); no errors; no warnings on `route.ts`.

### Phase 5 — Typecheck

Single pre-existing TS2345 in `__tests__/round-trip-closure/run.ts:285` (HF-198 γ origin). Acceptable per directive. No new errors.

---

## Architect Post-Merge Verification Checklist

After HF-210 merges and Vercel deploys:

- [ ] Architect runs BCL recalc one period (e.g., 2025-10) through UI
- [ ] Pulls Vercel log; expected paste size ~1,170 lines per period (down from ~3,570 pre-HF-210)
- [ ] Confirms `grep CalcRecon` returns ≥ 90 lines (block present and complete)
- [ ] Confirms `grep "grandTotal=" log` returns visible period grand total
- [ ] Confirms [CalcRecon] block lands within visible paste buffer (not truncated)
- [ ] Confirms 5 entities have full route.ts forensic trace (`grep -c "[CalcTrace] resolveColumn" log` ≈ 5×7 ≈ 35 lines)
- [ ] Confirms 85 entities still have intent-executor traces (uncapped per scope)

If [CalcRecon] block visible: HF-208/210 reconciliation visibility goal achieved. BCL October ground-truth reconciliation proceeds via grep workflow.

If [CalcRecon] block still truncated: separate diagnostic required (would suggest sub-line-count truncation layer; HF-211 candidate).
