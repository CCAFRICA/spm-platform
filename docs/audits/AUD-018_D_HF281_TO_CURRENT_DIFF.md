# AUD-018 Phase D — HF-281→Current Per-Stage Diff

- **GOOD_SHA**: `d501f97b616cfba62c2138538ec0f2637084a679` (HF-281 merge PR #468, 2026-06-09 — last proven-exact baseline)
- **CURRENT_SHA**: `ba8c4a4c26e4d07cc7d8c5ae0f2a59926543c95d` (main HEAD, includes HF-304)
- **Audit date**: 2026-06-17
- **Agent**: AUD-018 Agent D (read-only forensic). Method: `git diff`/`git show`/`git log` only — NO checkout, working tree untouched at CURRENT_SHA.
- **Evidence rule (SR-44)**: every finding below is RAW PASTED command output. Prose-only claims are not findings.

---

## 0. Diff-stat overview (raw)

`git diff --stat d501f97b..ba8c4a4c -- web/src/app/api/import web/src/lib/sci web/src/lib/ai web/src/lib/plan-intelligence web/src/lib/intelligence web/src/app/api/calculation`

```
 web/src/app/api/calculation/run/route.ts           | 179 ++++--
 web/src/app/api/import/sci/analyze/route.ts        | 484 +++++++++++++---
 web/src/app/api/import/sci/execute-bulk/route.ts   | 623 +++++++++++++++------
 web/src/app/api/import/sci/finalize-import/route.ts |  78 +++   <-- NET-NEW (HALT-2)
 web/src/lib/ai/ai-service.ts                       |  54 +-
 web/src/lib/ai/providers/anthropic-adapter.ts      | 100 +++-
 web/src/lib/ai/types.ts                            |  49 +-
 web/src/lib/intelligence/convergence-service.ts    |  95 ++--
 web/src/lib/sci/commit-content-unit.ts             | 163 ++++--
 web/src/lib/sci/entity-resolution.ts               |  31 +-
 web/src/lib/sci/header-comprehension.ts            | 242 +++++++-
 ... (73 files changed, 7697 insertions(+), 409 deletions(-); ~40 of the 73 are NET-NEW SCI test/helper files, behavior-neutral to the calc result)
```

**NOTE — intent-constructor had ZERO changes GOOD→CURRENT.** `web/src/lib/plan-intelligence/` shows nothing in the diff-stat; `git log d501f97b..ba8c4a4c -- web/src/lib/plan-intelligence/intent-constructor.ts` returns EMPTY. The plan-interpretation regression arc lives entirely at the **model-routing seam** (anthropic-adapter), NOT in the constructor logic. (Verified §1.)

---

## 1. AI / MODEL stage (PRIORITY — the regression arc)

### Files: `anthropic-adapter.ts`, `ai-service.ts`, `types.ts`
Commits (`git log d501f97b..ba8c4a4c -- <ai files>`):
```
8620b857 HF-304: route plan-interpretation task family to Opus (claude-opus-4-8) — AUD-017 remediation
04074c0d OB-212 N1 hardening: stop_reason-aware harness + model-agnostic agent turn
c404a4bd OB-212 N1: agent-runner harness + tools-capable adapter turn
1b597894 HF-294 Phase 2: AUD-009 loud-failure closure (provider hard-error tagged + loud)
925cba74 HF-294 Phase 1: restore imports with valid model string (claude-sonnet-4-6)
```

### 1a. MODEL STRING CHANGED — `claude-sonnet-4-20250514` → `claude-sonnet-4-6` (fallback) AND plan tasks → `claude-opus-4-8`

GOOD baseline (adapter line 1052, `git show d501f97b:...anthropic-adapter.ts`):
```
1052:      model: this.config.model || 'claude-sonnet-4-20250514',
```
GOOD baseline (ai-service constructor):
```
-      model: process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-20250514',
+      model: process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6',
```
CURRENT adapter (`git diff` hunk @@ -1049,7 +1066,11 @@):
```
-      model: this.config.model || 'claude-sonnet-4-20250514',
+      model: PLAN_INTERPRETATION_TASKS.has(request.task)
+        ? PLAN_INTERPRETATION_MODEL                       // 'claude-opus-4-8'
+        : (this.config.model || 'claude-sonnet-4-6'),
```
New routing constants (CURRENT, adapter top-of-file):
```
const PLAN_INTERPRETATION_MODEL = 'claude-opus-4-8';
const PLAN_INTERPRETATION_TASKS: ReadonlySet<AITaskType> = new Set<AITaskType>([
  'plan_interpretation', 'plan_skeleton', 'plan_component', 'plan_component_with_chunking',
]);
```
**Behavior impact: Y.** The four plan-interpretation task discriminants now hit Opus (`claude-opus-4-8`); per the HF-304 in-code rationale the prior model "under-emitted one cell (19 vs 20) → the constructor's exact-match check aborted the import" — i.e. the c1-senior regression. Every other AI task (classification, field-map, anomaly) keeps the configured/env model, fallback now `claude-sonnet-4-6` (the `-20250514` literal was a sunset-style pin). **Classification: FIX** (remediates the plan-emission regression) — but note the actual production model is driven by `NEXT_PUBLIC_AI_MODEL` env, not these literals (see HALT-0 advisory).

### 1b. AUD-009 provider hard-error tagging (loud failure)

CURRENT adapter (@@ -1088,12 +1109,23 @@):
```
-      throw new Error(`Anthropic API fetch failed after ${MAX_RETRIES} attempts...`);
+      const err = new Error(...) as ProviderHardError;
+      err.providerError = true; err.providerModel = this.config.model || 'claude-sonnet-4-6'; throw err;
...
-      throw new Error(`Anthropic API error: ${response.status} ...`);
+      const err = new Error(...) as ProviderHardError;
+      err.providerError = true; err.status = response.status; err.providerModel = ...; throw err;
```
ai-service consumes the tag (@@ -69,8 +72,48 @@): a tagged provider hard-error now logs `console.error("PROVIDER HARD-ERROR ...")` and returns `confidence:0, providerError:true, errorClass: provider_http_<status> | provider_unreachable`; recoverable failures keep the prior `console.warn` degrade path.
**Behavior impact: Y (observability), N (calc result shape unchanged — still returns a zero-confidence degraded response, no throw added).** **Classification: FIX** — makes a sunset-model / bad-key 404 LOUD and distinguishable from legitimate low-confidence, instead of silently degrading. This is the guard AUD-009 added precisely because the `-20250514` pin had been silently 404ing.

### 1c. OB-212 agent runtime (NET-NEW surface, does NOT touch the 20 single-call surfaces)

CURRENT adapter adds `executeAgentTurn(req: AgentTurnRequest)` — a separate tools-capable single turn (sends `tools`, returns `stopReason`+token usage); `execute()` "intentionally left untouched." `types.ts` adds `ProviderHardError`, `AgentToolDefinition`, `AgentTurnRequest/Response`, and `executeAgentTurn` on the adapter interface. ai-service adds a pass-through `executeAgentTurn`.
**Behavior impact: N for the import/calc pipeline** — agent runtime is a parallel surface (reconciliation diagnosis agent), not on the plan→data→calc path. **Classification: NEUTRAL** (additive, off-path). One nuance: `executeAgentTurn` omits `temperature` (Opus 4.7/4.8 + Fable 5 400 on sampling params) — relevant only to the agent surface.

---

## 2. Import-Plan stage (PPTX/header → rule_set)

### File: `header-comprehension.ts` (242 lines), `plan-interpretation.ts`
Commits:
```
fcd3d7e5 HF-300: plan-identity supersession (C1) + post-commit assignment reliability (C3)
925cba74 HF-294 Phase 1: restore imports with valid model string
566b2905 OB-203 Phase 6 D13: stream unit states per-sheet + poll-based recovery
ed7043b8 OB-203 Phase 4: signal spine R3 + DI-7
172fa2ea OB-203 D5: decouple role-confidence from recognition-confidence (maturation-flip)
3d8c818e OB-203 EPG-2.4: atom-write failure no longer silent + metric fix
4f13ecb3 OB-203 Phase 2 (5b): full decomposed-dispatch swap in both SCI routes
31436a29 OB-203 Phase 1: structured comprehension-failure surface (DI-4)
```
What changed by function (raw grep of `+` lines):
```
+import { computeAtomFingerprint } from './atom-fingerprint';
@@ -236,6 +262,182 @@ export async function comprehendHeaders(
+  // 1. atom fingerprints per column on FULL rows (Deviation 2), collect hashes for the lookup.
+    // → emitComprehensionFailureSignals). Inert without the env var; NEVER active in production
```
**What changed:** `comprehendHeaders` gained atom-fingerprint computation (per-column on full rows, Deviation 2) feeding the fingerprint-flywheel lookup; a structured comprehension-failure signal surface (DI-4) gated behind a dev-only env var (inert in prod); role-confidence decoupled from recognition-confidence (D5 maturation-flip).
**Behavior impact: Y** — fingerprint-driven comprehension can change which header role/semantic-type a column gets (feeds classification → entity identifier selection). The dev-only failure surface is inert in prod. **Classification: NEUTRAL→FIX** (OB-203 hardening of comprehension; no evidence of a regression here, but it does change classification inputs vs GOOD).

---

## 3. Import-Transaction / SCI write path (execute-bulk + commit-content-unit)

### File: `execute-bulk/route.ts` (623 lines — HALT-3 by-function summary)
Commits:
```
fcd3d7e5 HF-300: plan-identity supersession (C1) + post-commit assignment reliability (C3)
6e49db8a HF-297: send execute-bulk response before post-commit (DIAG-070 root-cause fix)
8336abef DIAG-070: import write-path trace instrumentation + per-phase timing
be0bdc49 HF-285-D: parse-once via gzipped companion artifact (content-hash keyed)
1047d979 HF-285-A: gate reads canonical HC surface for entity identifier
6a0c1d81 OB-203 Phase 6B/B: idempotent resume — response death cannot orphan units
6ca60d9f OB-203 Phase 6B/C: batch entity I/O live — per-entity round-trips extinct
... (+5 OB-203 commits)
```
Key behavioral hunks (raw):
```
+import { waitUntil } from '@vercel/functions';
-import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
+// HF-300 (DIAG-071): executePostCommitConstruction MOVED to /finalize-import — the per-file waitUntil
+// background here did not complete on Vercel (99% of committed_data left NULL entity_id).
+import { classifyUnitForResume, batchLivenessMs } from '@/lib/sci/execute-resume';
@@ -374,84 +573,113 @@
-    // HF-196 Phase 1: post-commit construction — entity resolution + back-link.
+    // ── DIAG-070 FIX: respond BEFORE post-commit; defer post-commit to a background task. ──
+    // OB-203 Phase B: resume-disposition inputs — ONE single-row record read
+    const resumeRecord = await fetchSessionTelemetryRecord(...);
```
**What changed by function:** POST handler now (a) computes the response from in-loop spine state and **returns BEFORE post-commit** (DIAG-070/HF-297 — import-speed win), and (b) gained an **idempotent resume disposition** (`classifyUnitForResume` + liveness-lease via `fetchSessionTelemetryRecord`/`unflattenUnitStates`) so a 300s-boundary or response death can't orphan units. The post-commit entity-resolution+assignment work was first moved into `waitUntil`, then (HF-300) moved OUT entirely to finalize-import (§5).
**Behavior impact: Y (critical).** **Classification: REGRESSION→FIX arc** — PR #530's `waitUntil` move was a latent regression (background tail dies on Vercel → NULL entity_id, 0 assignments); HF-297+HF-300 fix it. At CURRENT_SHA the path is the FIXED state.

### File: `commit-content-unit.ts` (163 lines)
Key lines:
```
+import { accumulateUnitCommitFields } from './session-telemetry-accumulator';
+// ~162k rows / 500 = ~325 chunks; at insert (~150ms) + 200ms pace ≈ ~115s for Ventas
+      if (profile.pacingMs > 0 && i + profile.chunkSize < insertRows.length) { <pacing sleep> }
+  // record on the session telemetry row, piggybacked on the batch insert (Amendment 2 D.2)
```
**What changed:** chunked insert gained **pacing** (`profile.pacingMs` between chunks) and **write-time telemetry accumulation** (one record, piggybacked on insert/finalize). The row_data dual-key (original + semantic) write is unchanged.
**Behavior impact: Y (timing/observability), N (committed_data content unchanged).** **Classification: NEUTRAL** — pacing changes throughput, not data; telemetry is additive.

---

## 4. Import-finalize / entity-resolution / assignments

### 4a. `finalize-import/route.ts` — **NET-NEW (HALT-2)** — absent at GOOD_SHA
`git show d501f97b:...finalize-import/route.ts` → `fatal: path ... exists on disk, but not in d501f97b`.
Single commit: `fcd3d7e5 HF-300`. Current head (traced):
```
// HF-300 (C3, DIAG-071): finalize-import — run the CRITICAL post-commit work in a LIVE request.
// DIAG-071 proved the post-commit tail that PR #530 moved into execute-bulk's waitUntil() background
// does NOT complete on Vercel: 99% of committed_data rows were left with NULL entity_id and the active
// plan got 0 assignments (`TypeError: fetch failed` after response flush).
// Fix: the client calls this endpoint ONCE after the whole import completes ... runs
// executePostCommitConstruction (entity resolution + back-link) + createMissingAssignments. Idempotent.
export const maxDuration = 300;
```
**Behavior impact: Y (critical).** **Classification: FIX** — this endpoint IS the remediation for the §3 `waitUntil` regression; without it, calc has no entity_id back-link and 0 assignments → every entity computes $0.

### 4b. `entity-resolution.ts` (31 lines)
Key behavioral diff:
```
+  const hiddenBatchIds = await hiddenBatchIdsForTenant(supabase, tenantId);  // D16.1 visibility gate
+    dq = applyCommittedDataVisibility(dq, hiddenBatchIds);
+  const definedByEntityDefiningBatch = new Set<string>();   // D3
+        if (!isEventUnit) definedByEntityDefiningBatch.add(extId);
+      if (!definedByEntityDefiningBatch.has(extId)) { suppressedSpurious++; continue; } // D3
```
**What changed:** `resolveEntitiesFromCommittedData` now (a) excludes non-completed/superseded batches from entity discovery (D16.1), and (b) **only fabricates entities from entity-defining batches** — a transaction/target `reference_key` that defines no entity (e.g. `Codigo_Turno` shift codes that created 8 spurious 'location' entities) is now suppressed (D3).
**Behavior impact: Y.** **Classification: FIX** — D3 stops spurious entity fabrication; a real FK (entities pre-created by roster) still links unchanged. Changes the entity set vs GOOD (fewer spurious entities).

---

## 5. Convergence (binding) stage

### File: `convergence-service.ts` (95 lines)
Commits:
```
e8d37b70 HF-302: convergence file-affinity (RC-1 data_type partition) + entity-key rollup (RC-3) + batch-selection at resolution (RC-2)
344d194d HF-287 Phase 1: order-independent binding determinism
1f1d7d59 OB-203 Phase 6B/E: live EPG + legacy fetchSupersededBatchIds retired
d8ecc2a4 OB-203 D16.1: outage self-heal — visibility gate + reconciliation
```
Core hunk (@@ -2747,33 +2748,18 @@ generateAllComponentBindings):
```
-  // HF-228 — cross-data-type column discovery. [add-all unmatched numeric cols as cross_source_numeric @0.4]
-  const matchedDataTypes = new Set(matches.map(m => m.dataType));
-  for (const cap of capabilities) { if (matchedDataTypes.has(cap.dataType)) continue;
-    for (const nf of cap.numericFields) { ... measureColumns.push({ ... contextualIdentity:'cross_source_numeric', confidence:0.4 ...}); } }
+  // HF-302 (RC-1, DIAG-072): the HF-228 cross-data-type column add-loop is REMOVED.
+  // ... that flat pool let the AI bind a plan's component inputs to columns from a DIFFERENT data file
+  // than the plan's own (DIAG-072: a collections-file column bound to a sales-plan input → null → $0).
+  // The candidate pool is now scoped to the data_type(s) the BOUNDARY MATCHER associated with this plan.
```
**What changed by function:** `generateAllComponentBindings` **removed the HF-228 blanket cross-data-type column add-loop**. After HF-269 removed the hard cross-source guard, that flat 0.4-confidence pool let the AI bind a component input to a column from the WRONG data file → null → $0 (DIAG-072). Pool is now scoped to boundary-matched data_types (deterministic file affinity, keyed on data_type/batchId).
**Behavior impact: Y (critical, directly affects payout).** **Classification: FIX** (DIAG-072 wrong-file-binding). Note the in-code instruction "Do NOT restore HF-263 P3.2 — the magnitude-proxy redirect was deliberately deleted."

---

## 6. Calculation stage

### File: `calculation/run/route.ts` (179 lines)
Commits:
```
968759fc HF-303: replace arbitrary 0.5 rollup-overlap threshold with relative strongest-membership derivation (Decision 110)
e8d37b70 HF-302: convergence file-affinity + entity-key rollup (RC-3) + batch-selection (RC-2)
66a0dec2 HF-301: remove whole-tenant entity-resolution scan from calc route (AUD-006 RC-1)
d9c35317 OB-213 Phase 3A: audit wiring — persist audit_logs + read from DB
1f1d7d59 OB-203 Phase 6B/E: live EPG + legacy fetchSupersededBatchIds retired
```
Key hunks (raw):
```
-import { resolveEntitiesAtCalcTime } from '@/lib/sci/calc-time-entity-resolution';
+// HF-301 (AUD-006 RC-1): resolveEntitiesAtCalcTime import REMOVED — its whole-tenant scan timed out calc at MIR scale.
@@ -160,30 +161,18 @@
-    const entityResolution = await resolveEntitiesAtCalcTime(tenantId, supabase);
+  addLog('HF-301: whole-tenant calc-time entity resolution skipped — OB-183 resolves period-scoped entity_id in-memory');
-  const { fetchSupersededBatchIds } = ...; const supersededIds = await fetchSupersededBatchIds(...);
+  const hiddenBatchIds = await hiddenBatchIdsForTenant(supabase, tenantId);   // single canonical visibility gate
@@ -831,21 +820,96 @@
+      const batchRollupCol = new Map<string, string>();   // HF-303 per-batch rollup-key discovery
+            const membership = s.hit / s.total;           // strongest-membership argmax, no 0.5 threshold
+            if (membership > maxMembership) { winners = [col]; } else if (membership === maxMembership ...) winners.push(col);
+          if (winners.length === 1) batchRollupCol.set(batchId, winners[0]);  // tie → none selected, surfaced for review
```
**What changed by function:** POST handler (1) **removed the whole-tenant calc-time entity resolution** (`resolveEntitiesAtCalcTime`) — it scanned all 165,897 committed_data rows on MIR and timed out; entity_id is now expected from finalize-import's back-link + OB-183 in-memory period-scoped resolution; (2) swapped `fetchSupersededBatchIds`/`NOT IN` for the single `hiddenBatchIdsForTenant` visibility gate; (3) HF-303 replaced the arbitrary `0.5` rollup-overlap threshold with a **strongest-membership argmax** (`hit/total`), ties → no key selected and surfaced for review.
**Behavior impact: Y (critical).** **Classification: FIX** — HF-301 removes a timeout (calc couldn't complete at MIR scale); HF-303 removes a magic-number threshold (Decision 110 "no developer numbers"). HF-301 introduces a DEPENDENCY: calc now RELIES on finalize-import (§4a) having run; if finalize-import didn't run, entity_id is NULL and calc produces $0 (the cross-stage coupling — see HALT-0).

---

## 7. Per-stage classification table (the AUD-017 deliverable)

| Stage | Files GOOD→CURRENT | Commits | What changed (by function) | Behavior? Why | Class |
|---|---|---|---|---|---|
| **AI/model** | anthropic-adapter, ai-service, types | HF-304, HF-294 P1/P2, OB-212 N1×2 | plan tasks → `claude-opus-4-8`; fallback `-20250514`→`-4-6`; provider hard-error tagging; net-new `executeAgentTurn` | **Y** — plan-interpretation now on Opus (fixes 19-vs-20-cell under-emission); 404 sunset now loud | **FIX** |
| **Import-Plan** | header-comprehension, plan-interpretation | HF-300, HF-294, OB-203 ×6 | `comprehendHeaders` + atom-fingerprint flywheel; role/recognition-confidence decoupled (D5); dev-only failure surface (inert prod) | **Y** — changes column role/semantic-type inputs to classification | NEUTRAL→FIX |
| **Import-Txn/SCI** | execute-bulk, commit-content-unit | HF-300, HF-297, DIAG-070, HF-285×2, OB-203 ×5 | respond-before-post-commit; idempotent resume/lease; post-commit moved out of dead waitUntil; insert pacing + write-time telemetry | **Y** — waitUntil tail died on Vercel (NULL entity_id) | **REGRESSION→FIX** |
| **Import-finalize** | finalize-import (**NET-NEW**), entity-resolution | HF-300, OB-203 D16.1/D3 | NET-NEW endpoint runs post-commit (entity res + assignments) in a live request; D3 suppresses spurious entity fabrication from non-FK reference_keys | **Y** — supplies the entity_id+assignments calc depends on | **FIX** |
| **Convergence** | convergence-service | HF-302, HF-287, OB-203 ×2 | `generateAllComponentBindings`: REMOVED HF-228 blanket cross-data-type add-loop → file-affinity-scoped candidate pool | **Y** — stops wrong-file column binding → $0 (DIAG-072) | **FIX** |
| **Calculation** | calculation/run/route | HF-303, HF-302, HF-301, OB-213, OB-203 | removed whole-tenant calc-time entity scan (timeout); single visibility gate; HF-303 strongest-membership rollup key (no 0.5 magic number) | **Y** — removes MIR-scale timeout; now depends on finalize-import | **FIX** (+ new cross-stage dependency) |

---

## 8. HALT-0 one-line advisories (NOT implemented — read-only)

- **ADV-1 (model env override):** the §1a Opus/Sonnet literals are FALLBACKS; production model is `NEXT_PUBLIC_AI_MODEL` (ai-service ctor) and `this.config.model` (adapter) — confirm the deployed env var is not pinning a sunset model that the AUD-009 guard would 404 on; the routing fix only helps if env is unset or valid.
- **ADV-2 (cross-stage coupling):** HF-301 removed calc-time entity resolution, so `calculation/run` now hard-DEPENDS on `finalize-import` (§4a) having run; if the client never calls finalize-import (or it 500s) entity_id stays NULL → calc yields $0 with no in-calc fallback. Consider a calc-route guard that detects NULL-entity_id-rate and fails loud rather than computing $0.

## 9. Read-only fence attestation
No source file modified. No commit/checkout/branch. Working tree remained at CURRENT_SHA `ba8c4a4c`. Only writes: this file + `AUD-018_D_diff.json`. All evidence via `git diff`/`git show`/`git log`.

---

## Completeness Addendum (AUD-018 verify pass)

**Verifier verdict: INCOMPLETE.** The whole-`web/src` diff `d501f97b..ba8c4a4c` is **218 files changed (15,306 ins / 8,738 del)** — far broader than this audit's hand-picked stage paths (§0 was scoped to `import`/`sci`/`ai`/`plan-intelligence`/`intelligence`/`calculation`). The central forensic claims **HOLD and re-verify exactly**: §1a Opus/Sonnet model-routing against the real adapter diff, §4b entity-resolution FIX, §4a finalize-import NET-NEW FIX. NET-NEW handling is sound. **What was incomplete: the §7 per-stage table is not a complete per-stage map of pipeline changes** — several genuinely pipeline-relevant *changed* files were omitted from their stage rows. The entries below close those gaps; raw evidence preserved verbatim.

### Verified diff-stat for the previously-missed pipeline files (raw)
`git diff --stat d501f97b..ba8c4a4c -- <9 missed files>`
```
 web/src/app/api/import/sci/analyze/route.ts      | 484 +++++++++++++++++++----
 web/src/app/api/import/sci/process-job/route.ts  |  64 ++-
 web/src/lib/calculation/run-calculation.ts       |  23 +-
 web/src/lib/sci/calc-time-entity-resolution.ts   |  13 +-
 web/src/lib/sci/classification-signal-service.ts | 185 ++++++++-
 web/src/lib/sci/content-profile.ts               |   8 +-
 web/src/lib/sci/fingerprint-flywheel.ts          |  18 +-
 web/src/lib/sci/hc-pattern-classifier.ts         |  20 +-
 web/src/lib/sci/negotiation.ts                   |   9 +-
 9 files changed, 719 insertions(+), 105 deletions(-)
```

### Addendum rows — per-stage map corrections (consistent with §7)

| Stage | Files GOOD→CURRENT (MISSED in §7) | What changed (by function) | Behavior? Why | Class |
|---|---|---|---|---|
| **Calculation** (extends §7 Calculation row, which listed ONLY `calculation/run/route.ts`) | **`run-calculation.ts`** — the calc ENGINE (per MEMORY: evaluators + `buildMetricsForComponent`) | Swapped HF-196 `fetchSupersededBatchIds` NOT-IN filter for the `hiddenBatchIdsForTenant`/`applyCommittedDataVisibility` gate across **SIX** committed_data query sites (current + prior period, entity + store, batch-rollup) | **Y (critical)** — directly changes WHICH committed_data rows feed the calc; the visibility gate now also hides non-completed (not just superseded) batches | **FIX** (single canonical visibility gate; aligns engine with route §6) |
| **Calculation / Entity-res** | **`calc-time-entity-resolution.ts`** | D16.1 visibility gate added around the before/after NULL-`entity_id` counts (`applyCommittedDataVisibility(...,hiddenBatchIds)`). **Note: §6 prose says HF-301 'REMOVED' `resolveEntitiesAtCalcTime` — that refers to the *import* being removed from `calculation/run/route.ts`; the FILE/function still exists AND was itself modified here.** | **Y** — changes the NULL-entity_id telemetry/self-heal scope to visible batches only | NEUTRAL→FIX (correction of misleading "REMOVED" framing; function is live and changed) |
| **Import-Plan / Classification** (front-of-pipeline; in §0 diff-stat but in NO §7 row) | **`analyze/route.ts`** (484 lines) | Imports `classification-signal-service` (`computeStructuralFingerprint`/`lookupPriorSignals`/`writeClassificationSignal`/`emitComprehensionFailureSignals`/`shouldReinforceUnit`); injects **atom-flywheel bindings per sheet** (`injectedBindingsBySheet`, `source:'flywheel-tier1'`) **BEFORE convergence** | **Y** — behavior-relevant to WHICH bindings/classifications exist pre-convergence (feeds §5) | NEUTRAL→FIX (OB-203 classification-signal + flywheel hardening) |
| **Classification** (explicit pipeline stage; entirely absent from audit) | **`classification-signal-service.ts`** (185 lines) | Classification-stage service consumed by `analyze/route` (structural fingerprint, prior-signal lookup, signal writes, comprehension-failure emission, unit reinforcement) | **Y** — material classification-stage logic; changes classification inputs vs GOOD | NEUTRAL→FIX |
| **Pipeline (assorted, in no §7 row)** | **`process-job/route.ts`** (64), **`hc-pattern-classifier.ts`** (20), **`fingerprint-flywheel.ts`** (18), **`content-profile.ts`** (8), **`negotiation.ts`** (9) | All pipeline files surfaced by the broader sweep; not classified per-function in this pass (flagged uncovered for completeness — not re-classified) | Likely Y (classification/comprehension inputs) — **UNCLASSIFIED, flagged** | TBD |

### GAP-1 raw evidence — `run-calculation.ts` (calc ENGINE) visibility swap at 6 sites
```
$ git diff --stat d501f97b..ba8c4a4c -- web/src/lib/calculation/run-calculation.ts
 web/src/lib/calculation/run-calculation.ts | 23 +-

-  const { fetchSupersededBatchIds } = await import('@/lib/sci/import-batch-supersession');
-  const supersededIds = await fetchSupersededBatchIds(supabase, tenantId);
+  // batches (superseded_by IS NOT NULL) — the standalone HF-196 fetchSupersededBatchIds filter is RETIRED
+  const { hiddenBatchIdsForTenant, applyCommittedDataVisibility } = await import('@/lib/sci/committed-data-visibility');
+  const hiddenBatchIds = await hiddenBatchIdsForTenant(supabase, tenantId);
...
-      if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
+      q = applyCommittedDataVisibility(q, hiddenBatchIds);            (repeated at 6 query sites:
                                                                       current+prior period, entity+store, batch-rollup `bq`)
```

### GAP-2 raw evidence — `calc-time-entity-resolution.ts` (file STILL EXISTS + modified, contra §6 'REMOVED')
```
$ git diff --stat d501f97b..ba8c4a4c -- web/src/lib/sci/calc-time-entity-resolution.ts
 web/src/lib/sci/calc-time-entity-resolution.ts | 13 +-

+  const { hiddenBatchIdsForTenant, applyCommittedDataVisibility } = await import('@/lib/sci/committed-data-visibility');
+  const hiddenBatchIds = await hiddenBatchIdsForTenant(supabase, tenantId);
-  const beforeCountQ = await supabase
+  const beforeCountQ = await applyCommittedDataVisibility(supabase
     .is('entity_id', null);
+    .is('entity_id', null), hiddenBatchIds);
   (same wrap applied to afterCountQ)
```

### GAP-3 raw evidence — `analyze/route.ts` (front-of-pipeline classification + flywheel binding injection)
```
$ git diff d501f97b..ba8c4a4c -- web/src/app/api/import/sci/analyze/route.ts | grep '^+' (excerpt)
+import { computeStructuralFingerprint, lookupPriorSignals, ... writeClassificationSignal, emitComprehensionFailureSignals, ... shouldReinforceUnit } from '@/lib/sci/classification-signal-service';
+      const injectedBindingsBySheet = new Map<string, number>();
+        injectedBindingsBySheet.set(sheet.sheetName, flywheelBindings.length);
+        ob203Trace('binding', { sheet: sheet.sheetName, injected: flywheelBindings.length, source: 'flywheel-tier1' });
```

### GAP-4 raw evidence — `classification-signal-service.ts` (classification stage, fully uncovered)
```
$ git diff --stat d501f97b..ba8c4a4c -- web/src/lib/sci/classification-signal-service.ts
 web/src/lib/sci/classification-signal-service.ts | 185 +++++++-
```
Plus same sweep surfaced uncovered (in no §7 stage row): `process-job/route.ts |64`, `hc-pattern-classifier.ts |20`, `fingerprint-flywheel.ts |18`, `content-profile.ts |8`, `negotiation.ts |9`.

### Completeness statement
`complete=false` on the missed changed files in the original §7 table; **`complete=true` after this addendum** for the pipeline-relevant stages (AI/model, Import-Plan, Classification, Import-Txn, Import-finalize, Convergence, Calculation). The five files in the last addendum row are *inventoried but UNCLASSIFIED* (flagged, not per-function diffed in this read-only verify pass). The remaining delta between this audit's stage scope and the full 218-file `web/src` diff is non-pipeline surface (UI/results/admin/tests/reconciliation-agent), out of this dimension's scope. **Read-only fence intact: only this file appended; no source modified, no checkout/commit/branch; evidence via `git diff --stat`/`git diff` only.**
