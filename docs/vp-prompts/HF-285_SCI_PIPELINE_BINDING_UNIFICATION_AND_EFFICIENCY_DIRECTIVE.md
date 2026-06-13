# HF-285: SCI Pipeline Binding Unification and Efficiency

**Date:** 2026-06-13
**Type:** HF (multi-component: correctness + efficiency)
**Tenant:** MX Restaurant `3d354bfa-b298-48dd-88a0-9f8c5a00be4e`
**Branch:** `OB-203-phase-6`
**Collision gate:** Verify `ls docs/vp-prompts/HF-285*` returns empty before committing.
**Evidence source:** `docs/diagnostics/DIAG-066_WARM_PATH_ENTITY_BINDING_GAP_OUTPUT.md` (committed a14265f8)
**Warm witness sessions:** cold = `4ae71225`, warm = `505a6d2c`

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. The following bind throughout this HF:

- **AP-25 / Korean Test (T1-E910 v2):** No language-specific string literals in any code path this HF touches. The identifier-role derivation must be structural, never producer-enumerated.
- **SR-34:** No bypass — diagnose and fix structurally. No workarounds, reduced-scope tests, interim measures.
- **SR-41:** Revert discipline — `git revert <SHA>` if contamination on pushed commits.
- **Scale by Design (Rule 2):** Every change must work at 10× current volume. A 162k-row file today, a 10M-row file tomorrow.
- **Decision 64 v3:** One canonical surface for classification signals. Components A+B specifically unify a dual-surface violation at the binding layer.
- **Decision 158:** LLM recognizes; code constructs. Component C changes concurrency of recognition; construction semantics are unchanged.
- **T1-E902 v2 (Carry Everything):** Persistence stores ALL data. Profiling may sample for statistical summaries. Components D+E operate at the profiling/transport layer, never at the persistence layer.
- **Architecture Decision Gate:** Before implementing each component, read the target code, paste the current state, confirm the change is structurally safe. Commit after each component passes its proof gate.
- **Drafting discipline:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`.
- **Anti-Pattern Registry:** Check AUD-009 (registry/cherry-pick), Adjacent-Arm Drift (T1-E952) on every component.

---

## §1 — Problem Statement

Five defects surfaced during OB-203 Phase 6 witness sessions (cold run 4ae71225, warm run 505a6d2c). All five operate on the SCI analyze/execute pipeline. Combined-treatment rationale: one code surface, one branch, one witness pass validates all components. The binding fix (A+B) is the correctness gate; the efficiency components (C+D+E) are independently valuable improvements that ship in the same cycle.

### 1.1 Binding gap (Components A+B) — BLOCKING

DIAG-066 proved a dual-surface defect: `processEntityUnit` (execute-bulk:781) gates entity commit on `confirmedBindings.semanticRole === 'entity_identifier'`, but the warm flywheel cached `transaction_identifier` for 5 of 7 entity sheets — diverging from the cold proposal's `entity_identifier` that cold execute used to commit the same sheets. The HC surface (`columnRole === 'identifier'`) carries the correct pointer for all seven, and the downstream `resolveEntityIdField` already reads it. The gate blocks the unit before the resolver runs.

Five entity sheets (Sucursales, Menus, Resumen_Sucursal, Resumen_Menu, Resumen_Empleado) fail on every warm import. Progressive Performance is structurally incomplete until fixed.

Root cause is two-part: (a) the gate reads the wrong surface, (b) the flywheel writes the wrong role due to a cardinality fallback (`negotiation.ts:323`) that doesn't consult the sheet's classification.

### 1.2 Sequential LLM comprehension (Component C) — EFFICIENCY

Cold analyze: 16 sheets comprehended serially. Timestamps show ~162s of 223s is serial LLM waiting (3.8s, 7.3s, 6.4s, 8.5s, … 23.6s for Ventas). Each comprehension is independent; no ordering dependency until the graph stage. Cold import is a prospect's first impression in every demo. Bounded concurrency (4–6) would cut cold analyze to ~60–80s.

### 1.3 Double parse (Component D) — EFFICIENCY

Analyze parses the full workbook (162,956 rows) for profiling and atom hashing. Execute downloads and parses the same file again. Measured: 49.7s + 39.3s (cold), 36.7s + 29.4s (warm resume). With 160k rows it's seconds; at 10M rows it becomes the difference. Scale Contract: per-row work × number of passes.

### 1.4 Profiling sampling (Component E) — EFFICIENCY

Distinct counts and ratios computed over full columns during analyze. The 1a fix moved repeat-ratio to sample basis. A consistent sampling policy — never for persistence (Carry Everything), only for statistical summaries — would reduce profiling time on heavy sheets proportionally to sheet size.

---

## §2 — Substrate-Bound Discipline Applications

### Decision 64 v3 (one canonical surface) — Components A+B

The entity-identifier derivation must read ONE surface. The canonical surface is `headerComprehension.interpretations[col].columnRole === 'identifier'` at the HC_IDENTIFIER_THRESHOLD (0.80) — the surface `resolveEntityIdField` already trusts, the surface that survived in warm flywheel learning for all five failures. The `confirmedBindings.semanticRole` vocabulary is a SECOND surface; the gate must not require it when the canonical surface provides the answer.

### T1-E910 v2 (Korean Test) — Component B

The `inferRoleForAgent` function at `negotiation.ts:323` derives `transaction_identifier` from a cardinality heuristic (uniqueness > 0.8) without consulting the sheet's classification. For an entity-classified sheet, an identifier column identifies entities regardless of cardinality. The fix must be structural — the derivation reads classification, not a producer-specific fallback.

### T1-E902 v2 (Carry Everything) — Components D+E

Profiling (statistical summaries for classification) may sample. Persistence (committed_data rows) never samples. The boundary: sampling touches the code paths that compute column-level statistics during analyze; it never touches `commitContentUnit` or the persistence pipeline.

### Decision 158 (LLM recognizes, code constructs) — Component C

Concurrent comprehension changes the PARALLELISM of LLM recognition, not its semantics. Each sheet still gets the same prompt, the same model, the same response parsing. The graph stage runs after all comprehensions complete. Construction is unchanged.

---

## §3 — Phase Prose

### Phase ordering rationale

Components A+B are correctness-blocking; they ship first and are validated by their own proof gate before C+D+E proceed. Components C, D, E are independent of each other and of A+B's correctness contract — they affect timing, not semantics. They ship in descending value order (C > D > E) so that a HALT on a lower-value component doesn't delay a higher-value one.

### §3.1 — Component A: Gate Unification

**Target:** `web/src/app/api/import/sci/execute-bulk/route.ts`, function `processEntityUnit`, approximately line 781.

**Current code (from DIAG-066):**
```ts
const idBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
if (!idBinding) {
  return { ... success: false, ... error: 'No entity_identifier binding found' };
}
```

**Required change:** When `confirmedBindings` does not contain an `entity_identifier` binding, fall through to the HC surface — the same surface `resolveEntityIdField` (`web/src/lib/sci/commit-content-unit.ts:133-158`) already reads:

```ts
// Conceptual sketch — CC implements structurally:
const idBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
if (!idBinding) {
  // Canonical fallback: the HC surface resolveEntityIdField already trusts
  const hcIdentifier = findHcRole(unit.classificationTrace, 'identifier');
  if (!hcIdentifier) {
    return { ... success: false, ... error: 'No entity identifier found on any surface' };
  }
  // Construct the entity processing context from the HC-derived identifier
  // The column name (hcIdentifier) serves the same role idBinding.sourceField would
}
```

**Structural constraint:** The fallback must NOT enumerate producers ("if from flywheel, read HC; if from LLM, read confirmedBindings"). The canonical surface is HC; the gate reads it when the semantic binding is absent. AUD-009 test: would adding a third producer (e.g., human assignment) require modifying this gate? If yes, the fix is a registry. If no (because the gate reads the canonical surface blind to provenance), the fix is correct.

**Proof gate A:**
- Run the DIAG-066 inspection script (`web/scripts/diag/diag-066-entity-binding-inspect.ts`) against the warm session's content-unit state. Confirm all five previously-failed sheets now resolve an entity identifier via the HC fallback.
- Build succeeds (`npm run build` clean).
- Commit with message: `HF-285-A: gate reads canonical HC surface for entity identifier`.

HALT-1: If the `findHcRole` function is not importable from execute-bulk's context (different module boundary, circular dependency), HALT and report the dependency chain. Do not duplicate the function.

### §3.2 — Component B: Flywheel Write Reconciliation

**Target:** `web/src/lib/sci/negotiation.ts`, function `inferRoleForAgent`, approximately line 294–363. Specifically the cardinality fallback at line 323.

**Current code (from DIAG-066):**
```ts
if (hcRole === 'identifier') {
  if (identifiesWhat) { /* ENTITY_TYPES → entity_identifier@0.95; ... */ }
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) return { role: 'transaction_identifier', confidence: 0.80 };
  return { role: 'entity_identifier', confidence: 0.85 };
}
```

**Required change:** The cardinality fallback must consult the sheet's classification. If the sheet is classified as `entity` (or a roster/target subtype that maps to entity), an identifier column identifies entities regardless of cardinality. The fallback to `transaction_identifier` at high uniqueness is appropriate ONLY when the sheet is classified as `transaction`.

```ts
// Conceptual sketch — CC implements structurally:
if (hcRole === 'identifier') {
  if (identifiesWhat) { /* existing ENTITY_TYPES/RECORD_TYPES logic — unchanged */ }
  // Classification-aware fallback (no identifiesWhat available)
  const sheetClassification = /* the sheet's classification from the proposal/CRR */;
  if (isEntityClassification(sheetClassification)) {
    return { role: 'entity_identifier', confidence: 0.85 };
  }
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) return { role: 'transaction_identifier', confidence: 0.80 };
  return { role: 'entity_identifier', confidence: 0.85 };
}
```

**Structural constraint:** `isEntityClassification` must be a structural check against the classification vocabulary (the closed set: entity, transaction, reference, plan, target), not a string-literal comparison against display names. Korean Test: would this work if the classification vocabulary were in Korean? Yes — the vocabulary is structural, not linguistic.

**Proof gate B:**
- Write a verification script (`web/scripts/verify-hf285-binding.ts`) that, for tenant `3d354bfa`, reads the structural_fingerprints for the five previously-failing sheets and confirms their cached `semanticRole` would now derive `entity_identifier` (not `transaction_identifier`) given their entity classification. Note: this tests the derivation logic, not a live re-import — the flywheel cache will be updated on the next import.
- Build succeeds.
- Commit with message: `HF-285-B: classification-aware identifier role in negotiation`.

HALT-2: If the sheet classification is not available in `inferRoleForAgent`'s call context (the function doesn't receive it), HALT and report what arguments the function receives. The fix may require threading classification through the caller — that's acceptable as long as it's the proposal's classification, not a new derivation.

### §3.3 — Component C: Concurrent LLM Comprehension

**Target:** The analyze route's sheet comprehension loop. Find the code that iterates over sheets and calls the LLM for header comprehension — currently serial (one `await` per sheet).

**Required change:** Replace serial iteration with bounded concurrent execution. Concurrency limit configurable via environment variable (default 4, range 1–8).

Design constraints:
- Each sheet's comprehension is INDEPENDENT — no sheet's result feeds another's prompt. The graph stage (workbook-graph construction, CRR, graph-prior) runs AFTER all comprehensions complete and consumes all results.
- Error handling: `Promise.allSettled` (not `Promise.all`) — a single sheet failure must not abort the batch. Failed sheets get their existing error-handling path.
- The concurrency limiter must be a structural utility (e.g., a `pLimit`-style semaphore), not a hand-rolled queue. If `p-limit` or equivalent is already in `node_modules`, use it. If not, install it.
- Rate-limit awareness: if the Anthropic adapter has its own rate limiting or retry logic, the concurrency limit must compose with it, not fight it. Read the adapter's retry/backoff code before setting the default.
- The env var name: `SCI_LLM_CONCURRENCY` (default 4). OB203_VERBOSE logging should emit the configured concurrency at analyze start.

**Proof gate C:**
- Cold import of the MX Restaurant file (datos-cadena-restaurantes-mx.xlsx, 16 sheets). Measure analyze time. Target: < 80 seconds (from baseline ~223s). Paste the `POST /api/import/sci/analyze` response time from the server log.
- Verify: all 16 sheets classified identically to the prior cold run (same classifications, same scores within rounding). Concurrency must not change semantics.
- Build succeeds.
- Commit with message: `HF-285-C: concurrent LLM comprehension (SCI_LLM_CONCURRENCY=4)`.

HALT-3: If the Anthropic adapter enforces its own per-request serialization (e.g., a global mutex), HALT and report. The concurrency fix belongs in the adapter, not around it. HALT-4: If cold analyze time does not improve by at least 40% (target < 134s), HALT — the bottleneck may not be where the timestamps suggested.

### §3.4 — Component D: Parse-Once Architecture

**Target:** The execute-bulk route's file download + parse path. Currently: analyze parses the workbook; execute downloads from storage and parses again.

**Required change:** Analyze persists the parsed sheet representation (headers, row data per sheet, row counts) as a companion artifact in Supabase Storage, keyed by session ID. Execute checks for the companion artifact before downloading + parsing the raw xlsx. If the companion exists and its content hash matches the original file, execute reads the pre-parsed representation and skips the xlsx download + parse entirely. If the companion is missing or stale, execute falls back to the current download + parse path (no regression).

Design constraints:
- **Carry Everything (T1-E902 v2):** The companion artifact stores the FULL parsed representation — every row, every column, every sheet. No sampling at the persistence layer.
- **Format:** JSON or MessagePack — CC evaluates. The companion must be smaller than re-parsing is slow (if serialization + deserialization exceeds parse time, the optimization is negative). Measure both paths and report in the proof gate.
- **Storage path:** `{tenant_id}/parsed/{session_id}_{file_hash}.json` (or `.msgpack`). Cleaned up when the session expires or the import completes.
- **Resume compatibility:** The resume path also re-downloads + re-parses. If the companion artifact exists, the resume should use it too — this eliminates the coupled double-parse on 300s boundary hits.
- **Scale Contract test:** Would this approach work for a 10M-row file? If the companion artifact exceeds Supabase Storage's object size limit (default 50MB, configurable), the fallback path fires. Document the threshold in code comments.

**Proof gate D:**
- Warm import of the MX Restaurant file. Verify: execute emits NO `Downloading from Storage` + `parsed N rows` log line for the primary invocation (it reads the companion instead). If a 300s resume fires, it also reads the companion (no re-download).
- Measure: compare execute wall time with and without the companion (the cold run's execute provides the without baseline: ~300s with parse; target: < 270s without parse, measuring the ~37s parse elimination).
- Build succeeds.
- Commit with message: `HF-285-D: parse-once via session companion artifact`.

HALT-5: If the companion artifact for 162k rows exceeds 50MB in JSON format, evaluate MessagePack or gzip. If the compressed artifact still exceeds the storage limit, HALT — the approach may need chunking or a different transport. HALT-6: If serialization + deserialization time exceeds raw xlsx parse time (net negative), HALT and report the measurements. The optimization is not worth shipping if it's slower.

### §3.5 — Component E: Profiling Sampling Policy

**Target:** The analyze route's column-level profiling code — wherever distinct counts, numeric ratios, type detection ratios, and similar statistical summaries are computed.

**Required change:** Apply a consistent sampling policy: for sheets exceeding a configurable row threshold (default 10,000 rows), compute column-level profiling statistics from a representative sample (first N + random M rows, or reservoir sampling). The sample size should be configurable via env var (`SCI_PROFILE_SAMPLE_SIZE`, default 5000).

Design constraints:
- **T1-E902 v2 (Carry Everything):** Sampling applies ONLY to profiling statistics (distinct counts, ratios, type detection). It NEVER applies to: row persistence (`commitContentUnit`), atom hashing (content fingerprints), signal capture, or any data that flows to committed_data. This boundary must be enforced structurally — the sampling utility is called from the profiling code path, not from the persistence code path.
- **The 1a precedent:** The repeat-ratio computation already uses sampling (per the 1a fix). This component extends the same policy to other profiling metrics. Identify which metrics currently compute over full columns, and apply sampling consistently.
- **Accuracy gate:** For the MX Restaurant file, compare profiling results (classifications, HC roles, CRR posteriors) between full-column and sampled runs. Any classification change = the sampling is too aggressive and the sample size must increase. The test: classifications must be identical; confidence scores may differ by ≤ 0.05.

**Proof gate E:**
- Cold import of MX Restaurant file. Compare analyze time with and without sampling (baseline from Component C's cold run provides the with-sampling comparison). Measure the profiling phase specifically if separable from the LLM phase.
- Verify: all 16 classifications identical to the Component C cold run. No classification changes from sampling.
- Build succeeds.
- Commit with message: `HF-285-E: consistent profiling sampling policy (SCI_PROFILE_SAMPLE_SIZE=5000)`.

HALT-7: If any classification changes between full-column and sampled profiling, HALT. Increase sample size and re-test. If classifications change at sample size 10,000 (the full column for most sheets), the metric is not sampling-safe and must be excluded from the policy.

---

## §4 — HALT Conditions (collected)

| ID | Component | Trigger | Action |
|---|---|---|---|
| HALT-1 | A | `findHcRole` not importable from execute-bulk context | Report dependency chain; do not duplicate the function |
| HALT-2 | B | Sheet classification not in `inferRoleForAgent` call context | Report arguments; threading classification through the caller is acceptable |
| HALT-3 | C | Anthropic adapter enforces per-request serialization | Report adapter architecture; concurrency fix belongs in adapter |
| HALT-4 | C | Cold analyze improvement < 40% | Report measurements; bottleneck may be elsewhere |
| HALT-5 | D | Companion artifact > 50MB for 162k rows | Evaluate MessagePack/gzip; HALT if still exceeds |
| HALT-6 | D | Serialization + deserialization slower than raw parse | Report measurements; negative optimization |
| HALT-7 | E | Classification changes between full-column and sampled | Increase sample size; HALT if changes persist at 10k |

**Component independence:** A HALT on any component C/D/E does NOT block Components A+B. If C/D/E HALT, ship A+B alone, note the HALT in the completion report, and the halted component becomes a separate follow-on HF.

---

## §5 — Reporting Discipline

**Completion report:** `docs/completion-reports/HF-285_COMPLETION_REPORT.md`

Required structure per Rules 25–28:
- SHA of each component's commit
- Pasted evidence for every proof gate (code excerpts, terminal output, timing measurements)
- PASS/FAIL per component with evidence line
- Any HALT-N that fired, with the evidence that triggered it
- ARTIFACT SYNC block (per vialuce-capability-governance skill):

```
ARTIFACT SYNC
MC: [#id → status for each MC item touched; new items discovered]
REGISTRY: [row → evidence to add / efforts to retire / proposed L-level Δ]
R1: [criterion → status evidence]
BOARD: [CAPS field deltas]
SUBSTRATE: [entries exercised: Decision 64, T1-E910 v2, T1-E902 v2, Decision 158]
```

- Final step: `kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000`
- Final step: `gh pr create --base main --head OB-203-phase-6` with descriptive title+body (or update existing PR)

---

## §6 — Out of Scope

- **Single-flight / resume lease (DIAG-066 Q2):** Distinct HF, sequenced post-arc. The 371s vs 360s lease defect is an efficiency/correctness item but does not block the warm witness (HF-213 supersession preserves correctness).
- **Settle-audit divergence investigation:** Resolves when A+B fix the five uncommitted entities. No separate work needed.
- **Portada classification:** Self-corrected via graph prior. No fix needed.
- **Generation accumulation / compaction:** TMB-scale MC item. HF-213 gate is correct; retention policy is separate.
- **`failed_interpretation` state naming:** Naming-clarity residual. Not blocking.
- **Poll discipline / adaptive backoff / SSE:** Named MC items. Post-arc.
- **Entity-silence sweep (post-commit pulse coverage):** Named MC item. Post-arc.

## §6A — Residuals

- **Warm witness re-run:** After all components ship (or A+B ship and C/D/E HALT), the warm witness must be re-run against the MX Restaurant tenant. Criteria: 16/16 committed, zero LLM (Tier-1), bindings injected, HF-213 supersede, settle audit EQUAL, DB responsive. This witness pass is the acceptance test for the binding fix AND the regression gate for the efficiency changes.
- **Cold measurement run:** A separate cold import (clean-slate or new session) should be run to measure Component C's impact on cold analyze time. The warm witness does NOT test cold analyze (it runs Tier-1). This measurement can happen after the witness passes.
- **Flywheel cache poisoning:** The five previously-failing sheets have `transaction_identifier` cached in `structural_fingerprints`. Component B prevents future cold writes from diverging, but the existing cache entries retain the wrong role until a new cold import overwrites them. On the warm witness re-run, Component A's HC fallback handles this — the gate reads the HC surface and succeeds even with the stale cache. A future clean import will write the corrected role. No manual cache repair needed.
- **Component C rate-limit tuning:** The default concurrency of 4 may need adjustment based on the Anthropic API's rate limits for the production tier. If the proof gate shows rate-limit retries, reduce concurrency. The env var makes this tunable without a code change.
- **Component D storage lifecycle:** The companion artifact must be cleaned up when the import session is no longer active. If there's an existing session-cleanup mechanism, hook into it. If not, add a TTL-based cleanup (24h default). Document the cleanup in the completion report.

---

*HF-285, SCI Pipeline Binding Unification and Efficiency*
*2026-06-13 · vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafting discipline: INF_Structured_Compliant_Drafting_Reference_20260513.md*
*Standing rules: CC_STANDING_ARCHITECTURE_RULES.md*
*Evidence source: DIAG-066 output (a14265f8)*
