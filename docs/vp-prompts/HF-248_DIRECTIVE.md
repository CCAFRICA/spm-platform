# HF-248: Per-Component Plan Interpretation, Bounded Retry, Reimport-Resume

**§0 CC Standing Rules**

Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.
Drafting reference: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.
Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.
Binding rules: AP-17 (single pipeline), AP-25 (Korean Test), SR-34 (no bypass), SR-41 (revert discipline), Rules 25-28 (completion report discipline), Rule 29 (CC paste LAST).
Decisions: 127 (half-open), 151 (intent executor sole authority), 153 (plan intelligence as L2 signals), 154 (Korean Test four classes).

---

## §1 Problem Statement

HF-247 ships clean. Cold-start works. Plan signature qualifies on own content. Full 2,106 chars of BCL plan text reaches the LLM. The validator catches truncated emissions. Silent failures eliminated.

But the test exposed three new architectural defects, all in one class:

### Defect 1 — Monolithic plan interpretation exceeds emission budget

Production evidence (2026-05-22 13:54-13:59): The LLM is asked to emit the complete plan structure for BCL (4 components, 8 variants, 2D matrices with 30 cells each, all with scale metadata) in a single call. The output exceeds the model's `max_tokens` budget. Some attempts hit JSON parse failure at position 28872 (mid-emission). Others complete the JSON but truncate the matrix to 23 of 30 cells.

```
2026-05-22 13:56:28.042 [error] [SCI plan-interp] Refusing to persist rule_set — JSON parse failed: 
  Expected ',' or ']' after array element in JSON at position 28872 (line 326 column 267)

2026-05-22 13:55:23.813 [warning] [PrimeValidator] Colocación de Crédito - Ejecutivo Senior (critical) 
  exhaustive_emission @ $: Plan declares 30 rate-table cells but the emitted tree carries only 23 
  constant leaves. Cells are missing — the LLM truncated the table.
```

Raising `max_tokens` is a workaround per SR-34 — it treats the symptom (budget exhaustion) without addressing the class (monolithic emission scales poorly). A 4-component plan with 2D matrices is the smallest case the product must handle. CRP has 4 plans. Meridian has 5 components per variant. The next customer may have 10 components, 5 variants, multiple 2D matrices. The architecture must scale.

Per Decision 151 (intent executor sole calculation authority) and the grammar-as-canonical-declaration framing (OB-200, T1-E910 v2): the LLM emits COMPOSITIONS, not monolithic plans. Each component is a self-contained composition. The orchestration layer assembles components into a plan.

### Defect 2 — Retry storm on emission failure

Production evidence: a single import attempt ran for 230 seconds.

```
2026-05-22 13:54:28.523 [info] [SCI plan-interp] Interpretation starting — 2106 chars
[multiple per-unit retries, each ~60s, all failing on exhaustive_emission]
2026-05-22 13:58:18.691 [info] [SCI Bulk] Complete: 0 rows in 230749ms (230.7s)
```

When the batched plan interpretation failed, the system fell back to per-unit retries (one per sheet). Each retry repeats the same monolithic emission against the same prompt with the same input. The LLM produces the same truncated output. The validator rejects each one. The process repeats indefinitely until the bulk operation times out. No retry budget. No back-off. No differentiation between failure causes.

### Defect 3 — Failure modes not differentiated

All failures currently surface as "interpretation failed." But the architectural response should differ by cause:

- **Plan cognition failure** (truncated emission, missing cells, grammar violation) — retrying the same call with the same input is useless. The cause is in the LLM's emission for THIS component. Retry strategy: zero retries; surface diagnostic to user.
- **AI adapter latency / transient API errors** (HTTP 429, 503, 504, network timeout, Anthropic API busy) — retrying is appropriate. The cause is external to the request semantics. Retry strategy: bounded retries (2-3) with exponential back-off.
- **Validator constraint violation** (Decision 127 boundary, scale annotation missing, terminal completeness) — retrying may help if the LLM emits non-deterministically, but bounded.
- **Schema/structural failure** (wrong JSON shape, missing required fields) — usually deterministic. Retry strategy: 1 retry maximum.

The current system treats all failures identically: retry per-unit until the bulk timeout expires. Per T1-E920 (repeated fix failure is a pattern), retrying the same call against a deterministic emission failure is the pattern.

### Defect 4 — No reimport-resume semantics

When a multi-component plan import partially succeeds (some components validate, others fail), the entire import is treated as failed and no rule_set is persisted. The user's only recovery option is reimporting the entire file from scratch. The successful components are re-emitted, re-validated, and may produce DIFFERENT results on retry (LLM non-determinism), losing progress.

The architecturally correct response per T1-E906 v2 (closed-loop intelligence, read-before-derive): components that validated successfully on prior import are recognized as such on reimport. Their persisted DAG trees are reused. Only the failed components are re-emitted with fresh LLM calls.

---

## §2 Substrate-Bound Discipline Applications

**Decision 151 (intent executor sole calculation authority):** The orchestration layer (per-component decomposition + retry) lives ABOVE the engine boundary. It does not change `evaluate()` or the convergence pipeline. The engine still receives a complete DAG tree per component.

**T1-E910 v2 / Decision 154 (Korean Test):** Error class identification uses structural signals (HTTP status code, response timing, JSON parse signature, validator violation type) — not error message string matching, not domain vocabulary.

**T1-E902 v2 (Carry Everything Express Contextually):** Per-component success carries forward across reimports. The signal surface (classification_signals) records component-level outcome state.

**T1-E906 v2 (Closed-Loop Intelligence):** Read-before-derive at the reimport boundary. Components with successful prior emission read from the signal surface; only failed components trigger fresh LLM calls.

**T1-E920 (Repeated Fix Failure Is a Pattern):** Bounded retry with cause-differentiated strategy. Same call against deterministic failure does not loop.

**SR-34 (No Bypass):** Per-component decomposition is the structural answer, not a `max_tokens` increase.

**Reconciliation-channel separation:** GT values architect-channel only. CC reports calculated values verbatim.

---

## §3 Phase 1 — Per-Component Decomposition

### 3.1 Read the current plan interpretation flow

Read these files in full:

1. `web/src/lib/sci/plan-interpretation.ts` — find `executeBatchedPlanInterpretation` and `executePlanPipeline`. These functions call the LLM with the full plan text and expect the complete components array in one response.
2. `web/src/lib/ai/providers/anthropic-adapter.ts` — find the `plan_interpretation` task case in `buildSystemMessage` and `buildUserMessage`. The current prompt asks for the complete components array.
3. `web/src/lib/compensation/ai-plan-interpreter.ts` — find `bridgeAIToEngineFormat` and `validateAndNormalizePlanInterpretation`. These functions process the complete components array.

Paste the verbatim signatures and entry points in the completion report.

### 3.2 Introduce a two-phase interpretation

**Phase A — Plan Skeleton Call.** Single LLM call asking for plan-level structure only:

- `ruleSetName`, `description`, `currency`, `cadence`
- `employeeTypes` array
- `componentIndex` array — for each component: `{ id, name, nameEs, appliesToEmployeeTypes, reasoning, rateTableCellCount?, briefSemantic }`

`briefSemantic` is a short prose description of what the component does ("placement attainment matrix paying $700/$680/... depending on attainment band × quality band"). It is NOT a DAG tree.

This call returns small JSON (typically 1-3 KB for a 4-8 component plan). No risk of `max_tokens` exhaustion.

**Phase B — Per-Component Calls.** For each entry in `componentIndex`, one LLM call asking for that component's `calculationIntent` only:

- Input: the full plan text (extracted XLSX) + `briefSemantic` from Phase A + the grammar section (generated from `prime-grammar.ts`)
- Output: a single component's DAG tree with full exhaustive emission, scale metadata, rate-table cell declaration
- One call per component. One component fits comfortably in `max_tokens`.

The orchestration assembles Phase A's skeleton + Phase B's component trees into the complete `PlanInterpretation` object that `bridgeAIToEngineFormat` already expects. No changes to `bridgeAIToEngineFormat` itself.

### 3.3 Anthropic adapter task types

Introduce two new task types in `anthropic-adapter.ts`:
- `plan_skeleton` — Phase A call
- `plan_component` — Phase B call (per component)

The existing `plan_interpretation` task is RETAINED for backward compatibility with single-component plans (or plans where the skeleton call indicates `componentIndex.length === 1`), but the orchestration prefers the two-phase path for multi-component plans.

Each task has its own system prompt section. `plan_skeleton` prompt does NOT include the full grammar — it only asks for the index. `plan_component` prompt includes the full grammar plus the `briefSemantic` for the specific component being emitted.

### 3.4 Halt condition

- HALT-1: If a plan's `componentIndex` from Phase A returns zero components (the plan skeleton call itself fails to extract any components), HF-247's existing failure guard (empty components on plan-classified workbook) catches it. Surface the failure with diagnostic, do NOT proceed to Phase B.

### 3.5 Commit

```
git add -A && git commit -m "HF-248 Phase 1: per-component decomposition — plan_skeleton + plan_component task types" && git push origin dev
```

---

## §4 Phase 2 — Error Class Differentiation

### 4.1 Read current error handling

Find the catch blocks in `plan-interpretation.ts` that handle LLM call failures. Find the per-unit retry logic. Paste verbatim.

### 4.2 Introduce error class taxonomy

Create `web/src/lib/sci/interpretation-errors.ts` with a structural classifier:

```typescript
export type InterpretationErrorClass = 
  | 'cognition_truncation'        // LLM emitted truncated content (parse error, missing cells)
  | 'cognition_violation'          // Validator rejected (grammar violation, exhaustive emission)
  | 'adapter_rate_limit'           // HTTP 429
  | 'adapter_overloaded'           // HTTP 503
  | 'adapter_timeout'              // HTTP 504 or network timeout
  | 'adapter_transient'            // Other 5xx
  | 'schema_invalid'               // Response shape wrong (missing required fields)
  | 'unknown';

export function classifyInterpretationError(err: unknown, response?: unknown): InterpretationErrorClass {
  // Structural classification only — no domain vocabulary, no message string matching beyond
  // standard HTTP status codes which are protocol-level structural signals.
  // ... implementation
}

export function retryPolicy(errClass: InterpretationErrorClass): { maxAttempts: number; backoffMs: number } {
  switch (errClass) {
    case 'cognition_truncation':
    case 'cognition_violation':
      return { maxAttempts: 1, backoffMs: 0 };  // No retry — deterministic failure
    case 'adapter_rate_limit':
    case 'adapter_overloaded':
      return { maxAttempts: 3, backoffMs: 2000 };  // Exponential back-off applied
    case 'adapter_timeout':
    case 'adapter_transient':
      return { maxAttempts: 2, backoffMs: 1000 };
    case 'schema_invalid':
      return { maxAttempts: 1, backoffMs: 0 };
    case 'unknown':
      return { maxAttempts: 1, backoffMs: 0 };
  }
}
```

### 4.3 Apply policy at per-component call site

In Phase 1's `plan_component` call orchestration: wrap each per-component LLM call with the retry policy. Classify any thrown error or rejected validator response. Apply `maxAttempts` with exponential back-off (`backoffMs * 2^attempt`). After exhausting retries, surface a structured failure for that component.

### 4.4 Detailed error logging

For every per-component failure, log:
- Component ID and name
- Error class (from classifier)
- Attempt number (1 of N)
- HTTP status (if adapter error)
- Validator violations (if cognition error) — verbatim from validator output
- LLM raw response preview (first 500 chars) on cognition errors
- Total latency for the call

Log line format:
```
[plan-component] FAILED component=<id> name="<name>" errClass=<class> attempt=<n>/<max> 
  httpStatus=<status?> violation=<...> latencyMs=<ms>
```

These lines are diagnostic-grade. The architect should be able to read them and immediately know whether the failure is fixable (cognition) or transient (adapter).

### 4.5 Commit

```
git add -A && git commit -m "HF-248 Phase 2: error class taxonomy + bounded retry per class + diagnostic logging" && git push origin dev
```

---

## §5 Phase 3 — Reimport-Resume Semantics

### 5.1 Persist per-component outcome state

After Phase 1's orchestration completes, persist to `import_batches.error_summary` (existing JSONB column) a structured record per component:

```typescript
{
  hf: 'HF-248',
  componentOutcomes: [
    { id: 'c1-...', name: '...', status: 'success' | 'failed', errClass?: '...', attempts: N, lastAttemptAt: '...' },
    ...
  ],
  partialSuccess: boolean,  // true if some succeeded and some failed
  retryableFailures: string[]  // component IDs that may succeed on reimport
}
```

If the entire plan succeeds, `partialSuccess: false` and `retryableFailures: []`. If some components succeed and others fail, `partialSuccess: true` with the failed component IDs listed.

### 5.2 Persist successful components when partial success

Per the current architecture, `bridgeAIToEngineFormat` either persists all components or none. Modify to support partial persistence:

- When `partialSuccess: true`, persist the successful components with their `calculationIntent` trees
- The rule_set status remains `'active'` (existing supersession logic from HF-244 applies)
- Failed components are recorded in `error_summary` for the import_batch but NOT in `rule_sets.components`
- A user reimporting the same plan triggers the resume path

### 5.3 Reimport-resume detection

When a plan file is imported, before invoking the LLM:

1. Check if a recent `import_batches` row exists for the same tenant + same plan file fingerprint with `partialSuccess: true`
2. If yes, read the existing rule_set's persisted components AND the import_batch's `componentOutcomes`
3. For Phase 1 (skeleton), use the cached skeleton structure if available
4. For Phase 2 (per-component), skip components with `status: 'success'` and only re-emit components in `retryableFailures`
5. After all retries succeed (or are re-attempted), the rule_set is updated with the new successful components, the import_batch's `componentOutcomes` is updated, and `partialSuccess` reflects the new state

This makes reimport idempotent: if everything succeeded prior, reimport is a no-op. If some failed, only the failed ones are re-attempted.

### 5.4 UI surfacing

The UI's plan import result panel currently shows "Failed to fetch" or "Success" at the file level. Update to show per-component status when `partialSuccess: true`:

```
BCL_Plan_Comisiones_2025.xlsx
  ✓ Colocación de Crédito - Ejecutivo (validated)
  ✗ Colocación de Crédito - Ejecutivo Senior (cognition_truncation, 23 of 30 cells emitted)
  ✓ Captación de Depósitos - Ejecutivo Senior (validated)
  ✓ Captación de Depósitos - Ejecutivo (validated)
  ... etc
```

Each failure line includes the error class and a brief diagnostic. The user knows exactly which component failed and why.

CC: implement the UI changes minimally — extend the existing import result display to read `componentOutcomes` from the response and render per-component rows. Do not redesign the UI.

### 5.5 Halt condition

- HALT-2: If the reimport-resume path conflicts with HF-244's plan supersession logic (HF-244 archives prior rule_sets on reimport), reconcile by: a partial-success rule_set is NOT archived on reimport of the same plan; it is UPDATED in place. Only a successful complete reimport with a different plan structure triggers supersession.

### 5.6 Commit

```
git add -A && git commit -m "HF-248 Phase 3: reimport-resume semantics — partial success persistence + skip-successful + UI surfacing" && git push origin dev
```

---

## §6 Phase 4 — UI Timeout Mitigation

### 6.1 The fetch timeout problem

The browser's fetch to `/api/import/sci/execute-bulk` times out at ~60-100s. With per-component decomposition, total interpretation time should drop to ~30-50s for a typical plan. But for a 10-component plan, even ~10s per component = 100s+.

### 6.2 Asynchronous progress endpoint

The bulk import endpoint should return a job ID immediately (within 1-2 seconds) and continue processing asynchronously. The UI polls a progress endpoint for status updates.

This is a larger architectural change. For HF-248, the minimal version:

- The bulk endpoint's HTTP response returns IMMEDIATELY after Phase 1 (skeleton) completes, with status `interpreting_components` and the componentIndex
- Per-component processing continues in the background (Vercel serverless function continues executing post-response — verify this is supported on the deployment; if not, defer this phase and add a status-polling endpoint)
- The UI polls `/api/import/status?batchId=<id>` to track per-component completion
- Once all components are resolved (success or failure), the UI shows the final result

### 6.3 Defer if blocked

If Vercel serverless does not support post-response execution OR if the polling endpoint adds significant complexity, DEFER this phase. The per-component decomposition + bounded retry from Phases 1-2 should bring total latency under 60s for typical plans. The UI timeout problem becomes a follow-on HF if reimports still exceed the timeout in practice.

HALT-3: If this phase materially increases the HF complexity or requires substantial new endpoint architecture, defer. Report the deferral in the completion report and ship Phases 1-3.

### 6.4 Commit (if implemented)

```
git add -A && git commit -m "HF-248 Phase 4: asynchronous progress polling for long-running plan interpretation" && git push origin dev
```

---

## §7 Phase 5 — Verification

### 7.1 Build

Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` responds. Zero TypeScript errors.

### 7.2 BCL verification

The architect will:
1. Run BCL clean-slate SQL.
2. Import BCL plan file through the browser.
3. Capture from logs:
   - `[plan-skeleton]` log line(s) — Phase A call evidence
   - `[plan-component]` log lines — one per component, with success/failure/retry status
   - `[plan-component] FAILED` lines if any component fails (with errClass)
   - Final `[SCI plan-interp] Batched plan saved: ... N components` line
   - `import_batches.error_summary.componentOutcomes` content
4. Verify rule_set is persisted with N components > 0

If C0 still truncates per-component (i.e., the 30-cell matrix exceeds budget even for a single-component call), document the failure in the completion report. That becomes the next HF: emission strategy for very large matrices (e.g., emit the matrix as a separate data structure rather than nested conditionals).

### 7.3 Reimport-resume verification

After the first import:
1. Without changing anything, reimport the same plan file
2. Verify successful components are skipped (no LLM call for them)
3. Verify failed components are re-attempted (LLM call fires)
4. Confirm idempotency: if first import succeeded fully, second import is a no-op

### 7.4 Commit

```
git add -A && git commit -m "HF-248 Phase 5: verification evidence" && git push origin dev
```

---

## §8 HALT Conditions

| ID | Condition | Action |
|---|---|---|
| HALT-1 | Plan skeleton call returns zero components | HF-247's existing guard catches; surface failure, do not proceed to Phase B. |
| HALT-2 | Reimport-resume conflicts with HF-244 supersession | Reconcile: partial-success rule_set is UPDATED in place, not archived. Successful complete reimport of different plan structure still triggers supersession. |
| HALT-3 | Phase 4 (async polling) requires substantial new architecture | Defer Phase 4. Ship Phases 1-3. Note in completion report. |
| HALT-4 | Per-component call STILL exceeds max_tokens (single component too large) | Document. Becomes follow-on HF on emission strategy for very large structures (rate table as separate data block). |
| HALT-5 | Retry classifier misclassifies cognition errors as adapter errors (or vice versa) | Tighten the structural classifier. Cognition errors have validator-generated error messages with `exhaustive_emission@` or grammar violation signatures. Adapter errors have HTTP status codes. The two are structurally distinguishable. |
| HALT-6 | UI partial-status rendering breaks existing single-component flows | Verify the new render path only fires when `componentOutcomes` is present. Existing flows unaffected. |

---

## §9 Reporting Discipline

Completion report: `docs/completion-reports/HF-248_COMPLETION_REPORT.md`

Per Rules 25-28. Structure per `COMPLETION_REPORT_ENFORCEMENT.md`. Evidence means paste, not describe. Commit-per-phase.

Required evidence per phase:
- Phase 1: paste verbatim BEFORE and AFTER of plan interpretation entry points. Show the two new task types in the adapter. Show the orchestration that assembles skeleton + components.
- Phase 2: paste the new `interpretation-errors.ts` classifier and retry policy. Paste BEFORE and AFTER of catch blocks at call sites.
- Phase 3: paste BEFORE and AFTER of `bridgeAIToEngineFormat` partial-persistence path. Paste the resume-detection query and the skip-successful logic. Paste the UI rendering change.
- Phase 4: paste the polling endpoint and async dispatch if implemented; document deferral if not.
- Phase 5: build evidence + architect-manual verification placeholders for BCL first import and BCL reimport-resume.

---

## §10 Out of Scope

- Calculation engine (OB-200 grammar, scale metadata, HF-244 validator, HF-244 scale mutual exclusion). Unchanged. The engine receives complete DAG trees per component, same as before. The orchestration is ABOVE the engine boundary.
- C0 30-cell matrix emission strategy. If a SINGLE component's emission still exceeds budget after per-component decomposition (HALT-4), that becomes a follow-on HF.
- CRP and Meridian verification. After BCL succeeds, the same orchestration path applies.
- Evaluator unit test suite.
- Temporal prime extensions.
- Substrate supersession candidates (VG-side).
- Plan signature classifier improvements (HF-247 owned).

## §10A Residuals

- Per-component decomposition introduces N LLM calls instead of 1. Total cost rises proportionally to component count. For a 4-component BCL plan: ~4x the API cost of a monolithic call. Acceptable for accuracy gain; track in production cost metrics.
- Reimport-resume requires the plan file's fingerprint to match (same content, same structure) for resume to fire. A modified plan file (even one cell change) will not resume — it will be treated as a fresh import. This is correct behavior per content-addressing semantics.
- The error class taxonomy may need extension as new failure modes are observed in production. The structural classifier is the right shape; the enum may grow.
- Phase 4 (async polling) defers if blocked. Per-component decomposition alone should bring typical latencies under the UI timeout, but very large plans (10+ components) may still need async dispatch.

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`) NOT `web/`
6. `gh pr create --base main --head dev` with title: "HF-248: Per-component plan interpretation with bounded retry, error class differentiation, reimport-resume"
7. PR body: "Closes monolithic-emission scale problem revealed by HF-247 verification: BCL 4-component plan exceeds LLM max_tokens, validator catches truncation but retry storm exhausts UI timeout. Per Decision 151 + grammar-as-canonical-declaration (T1-E910 v2): LLM emits compositions per component, not monolithic plans. Phase 1: two-phase interpretation (plan_skeleton + plan_component). Phase 2: error class taxonomy (cognition vs adapter) with bounded retry per class. Phase 3: partial-success persistence with reimport-resume — successful components skip on reimport, failed components retry. Phase 4: async progress polling if Vercel supports; defer otherwise. Phase 5: verification with BCL first-import and reimport-resume scenarios."
