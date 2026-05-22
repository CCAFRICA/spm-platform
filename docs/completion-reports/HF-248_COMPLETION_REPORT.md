# HF-248 — Per-Component Plan Interpretation, Bounded Retry, Reimport-Resume

**Branch:** `dev` (off `main @ 809f3789` via merge `bdbbd869`)
**Date:** 2026-05-22
**Scope:** Five new architectural defects surfaced by HF-247 verification, all in one class: monolithic LLM emission scales poorly, retry storm on emission failure, undifferentiated failure modes, no reimport-resume semantics, UI timeout.

---

## Phase 1 — Per-Component Decomposition

### BEFORE — single monolithic `interpretPlan` call

`web/src/lib/sci/plan-interpretation.ts:148-154` (verbatim, pre-HF-248):

```typescript
const response = await aiService.interpretPlan(
  documentContent,
  pdfBase64ForAI ? 'pdf' : 'text',
  { tenantId },
  pdfBase64ForAI,
  pdfMediaType,
);
const interpretation = response.result;
```

`web/src/lib/ai/ai-service.ts:243-265` (verbatim):

```typescript
async interpretPlan(
  content: string, format: string, signalContext?: { tenantId?: string; userId?: string },
  pdfBase64?: string, pdfMediaType?: string
): Promise<AIResponse & { result: PlanInterpretationResult }> {
  const input: Record<string, unknown> = { content, format };
  if (pdfBase64) { input.pdfBase64 = pdfBase64; input.pdfMediaType = pdfMediaType || 'application/pdf'; }
  const response = await this.execute(
    {
      task: 'plan_interpretation',
      input,
      options: { responseFormat: 'json', maxTokens: 8192, temperature: 0 },
    },
    true, signalContext
  );
  return response as AIResponse & { result: PlanInterpretationResult };
}
```

Production evidence (2026-05-22 13:54-13:59): the single call's emission exceeded `max_tokens` for BCL (4 components × 8 variants × 30-cell matrices + scale metadata). Either JSON parse failed mid-stream (`Expected ',' or ']' at position 28872`) or the matrix truncated (`23 of 30 constant leaves`). Per-unit retries repeated the same call against the same input until the bulk operation timed out at 230s.

### AFTER — two-phase orchestration

Two new AITaskTypes (`web/src/lib/ai/types.ts:49-58`):

```typescript
export type AITaskType =
  | 'file_classification'
  | …
  | 'plan_interpretation'           // legacy monolithic; retained for single-component plans
  | 'plan_skeleton'                 // HF-248 Phase A: extract plan-level structure + component index (no DAG trees)
  | 'plan_component'                // HF-248 Phase B: extract a single component's calculationIntent DAG tree
  | 'workbook_analysis'
  | …
```

Two new ai-service methods (`web/src/lib/ai/ai-service.ts`, post-HF-248):

```typescript
async interpretPlanSkeleton(
  content, format, signalContext?, pdfBase64?, pdfMediaType?
): Promise<AIResponse> {
  const input: Record<string, unknown> = { content, format };
  if (pdfBase64) { … }
  return this.execute({
    task: 'plan_skeleton',
    input,
    options: { responseFormat: 'json', maxTokens: 4096, temperature: 0 },
  }, true, signalContext);
}

async interpretPlanComponent(
  content, format,
  componentSpec: { id, name, nameEs?, appliesToEmployeeTypes, briefSemantic, rateTableCellCount? },
  signalContext?, pdfBase64?, pdfMediaType?
): Promise<AIResponse> {
  const input: Record<string, unknown> = { content, format, componentSpec };
  if (pdfBase64) { … }
  return this.execute({
    task: 'plan_component',
    input,
    options: { responseFormat: 'json', maxTokens: 8192, temperature: 0 },
  }, true, signalContext);
}
```

Orchestrator (`web/src/lib/sci/plan-orchestration.ts`, new):

```typescript
export async function orchestratePerComponentInterpretation(
  input: OrchestrationInput,
): Promise<OrchestrationResult> {
  const aiService = getAIService();

  // ── Phase A: skeleton ──
  console.log(`[plan-orchestrator] Phase A skeleton call — ${input.documentContent.length} chars`);
  const skeletonStart = Date.now();
  let skeletonRaw: Record<string, unknown>;
  try {
    const resp = await aiService.interpretPlanSkeleton(…);
    skeletonRaw = (resp.result ?? {}) as Record<string, unknown>;
  } catch (err) {
    const errClass = classifyInterpretationError(err);
    …
    return emptyOrchestrationResult({ … skeletonError: `Skeleton call failed (${errClass}): ${message}` });
  }
  …
  const componentIndex = Array.isArray(skeletonRaw.componentIndex) ? skeletonRaw.componentIndex : [];

  // ── Phase B: per-component ──
  for (const rawEntry of componentIndex) {
    const compId = String(rawEntry.id ?? `comp-${components.length}`);
    …
    if (skipIds.has(compId) && input.priorComponents?.has(compId)) {
      const cached = input.priorComponents.get(compId)!;
      components.push(cached);
      outcomes.push({ id: compId, name: cached.name, status: 'success', attempts: 0, skippedFromPrior: true, … });
      console.log(`[plan-component] SKIPPED (reimport-resume) component=${compId} name="${cached.name}" — reusing prior successful tree`);
      continue;
    }
    const componentResult = await callPlanComponentWithRetry({ … });
    outcomes.push(componentResult.outcome);
    if (componentResult.component) {
      components.push({ id: compId, name: compName, type: 'prime_dag', …, calculationIntent: componentResult.component.calculationIntent, calculationMethod: componentResult.component.calculationMethod, rateTableCellCount, confidence, reasoning });
    }
  }
  …
  return { interpretation: { …, components, … }, componentOutcomes, partialSuccess, retryableFailures };
}
```

Call-site replacement in plan-interpretation.ts (both `executeBatchedPlanInterpretation` and `executePlanPipeline`):

```typescript
const { orchestratePerComponentInterpretation } = await import('./plan-orchestration');
const { loadResumeContext } = await import('./reimport-resume');
const resumeCtx = await loadResumeContext(supabase, tenantId, storagePath);
const orchestration = await orchestratePerComponentInterpretation({
  documentContent, format: pdfBase64ForAI ? 'pdf' : 'text', pdfBase64: pdfBase64ForAI, pdfMediaType,
  signalContext: { tenantId, userId },
  resumeSkipIds: resumeCtx.resumeSkipIds,
  priorComponents: resumeCtx.priorComponents,
});
const interpretation = orchestration.interpretation as unknown as Record<string, unknown>;
```

`bridgeAIToEngineFormat` consumes the assembled interpretation unchanged.

---

## Phase 2 — Error Class Taxonomy + Bounded Retry

### Classifier (`web/src/lib/sci/interpretation-errors.ts`, new)

```typescript
export type InterpretationErrorClass =
  | 'cognition_truncation'   // LLM emitted truncated content (parse error mid-stream, missing rate-table cells)
  | 'cognition_violation'    // Validator rejected (grammar violation, terminal completeness, scale annotation)
  | 'adapter_rate_limit'     // HTTP 429
  | 'adapter_overloaded'     // HTTP 503
  | 'adapter_timeout'        // HTTP 504 or network timeout
  | 'adapter_transient'      // Other 5xx
  | 'schema_invalid'         // Response shape wrong (missing required fields)
  | 'unknown';

export function classifyInterpretationError(err, response?): InterpretationErrorClass {
  if (response && typeof response === 'object') {
    if (response.parseError === true) return 'cognition_truncation';
    if (typeof response.error === 'string' && response.error.startsWith('JSON parse failed')) return 'cognition_truncation';
    if (response.fallback === true) return 'adapter_transient';
  }
  if (err instanceof Error) {
    const msg = err.message ?? '';
    if (msg.includes('exhaustive_emission')) return 'cognition_truncation';
    if (msg.includes('arity@') || msg.includes('op_unknown@') || msg.includes('unknown_prime@') || msg.includes('child_topology@') || msg.includes('decision_127@') || msg.includes('scale_annotation@') || msg.includes('terminal_completeness@') || msg.includes('UnconvertibleComponentError')) return 'cognition_violation';
    const httpMatch = msg.match(/(?:^|\s)(\d{3})(?:\s|$)/);
    if (httpMatch) {
      const code = Number(httpMatch[1]);
      if (code === 429) return 'adapter_rate_limit';
      if (code === 503) return 'adapter_overloaded';
      if (code === 504) return 'adapter_timeout';
      if (code >= 500 && code < 600) return 'adapter_transient';
    }
    if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('econnreset') || msg.toLowerCase().includes('etimedout')) return 'adapter_timeout';
    if (msg.includes('No content in Anthropic response')) return 'adapter_transient';
  }
  return 'unknown';
}

export function retryPolicy(errClass): { maxAttempts: number; backoffMs: number } {
  switch (errClass) {
    case 'cognition_truncation':
    case 'cognition_violation':  return { maxAttempts: 1, backoffMs: 0 };       // No retry — deterministic
    case 'adapter_rate_limit':   return { maxAttempts: 3, backoffMs: 2000 };    // 2s, 4s back-off
    case 'adapter_overloaded':   return { maxAttempts: 3, backoffMs: 2000 };
    case 'adapter_timeout':      return { maxAttempts: 2, backoffMs: 1000 };
    case 'adapter_transient':    return { maxAttempts: 2, backoffMs: 1000 };
    case 'schema_invalid':       return { maxAttempts: 1, backoffMs: 0 };
    case 'unknown':              return { maxAttempts: 1, backoffMs: 0 };
  }
}
```

Per-component retry loop in `plan-orchestration.ts`:

```typescript
async function callPlanComponentWithRetry(args): Promise<PerComponentCallResult> {
  let attempt = 0; let lastErrClass: InterpretationErrorClass = 'unknown'; …
  while (true) {
    attempt += 1; const callStart = Date.now();
    try {
      const resp = await aiService.interpretPlanComponent(…);
      const result = (resp.result ?? {}) as Record<string, unknown>;
      const latency = Date.now() - callStart;
      if (result.parseError || result.error || result.fallback) {
        const message = String(result.error || (result.parseError ? 'JSON parse failed' : 'Fallback returned'));
        lastErrClass = classifyInterpretationError(null, result);
        console.log(`[plan-component] FAILED component=${spec.id} name="${spec.name}" errClass=${lastErrClass} attempt=${attempt}/${retryPolicy(lastErrClass).maxAttempts} latencyMs=${latency} message=${message}`);
      } else {
        const validation = validateComponentIntent(intent, { componentLabel: spec.name, expectedCellCount: spec.rateTableCellCount });
        if (validation.valid) {
          console.log(`[plan-component] SUCCESS component=${spec.id} name="${spec.name}" attempt=${attempt} latencyMs=${latency} leaves=${intent ? '<populated>' : '<missing>'}`);
          return { component: { calculationIntent: intent, …, confidence, reasoning }, outcome: { …, status: 'success', attempts: attempt, … } };
        }
        const critical = validation.violations.filter(v => v.severity === 'critical');
        lastViolations = critical.map(v => `${v.check}@${v.nodePath}: ${v.message}`).join('; ');
        lastErrClass = critical.some(v => v.check === 'exhaustive_emission') ? 'cognition_truncation' : 'cognition_violation';
        console.log(`[plan-component] FAILED component=${spec.id} name="${spec.name}" errClass=${lastErrClass} attempt=${attempt}/${retryPolicy(lastErrClass).maxAttempts} latencyMs=${latency} violation="${lastViolations}"`);
      }
    } catch (err) {
      …
      lastErrClass = classifyInterpretationError(err);
      console.log(`[plan-component] FAILED component=${spec.id} … errClass=${lastErrClass} attempt=${attempt}/${retryPolicy(lastErrClass).maxAttempts}${lastHttpStatus !== undefined ? ` httpStatus=${lastHttpStatus}` : ''} latencyMs=${latency} message=${lastErrMessage}`);
    }
    const policy = retryPolicy(lastErrClass);
    if (attempt >= policy.maxAttempts) return { component: null, outcome: { …, status: 'failed', attempts: attempt, errClass: lastErrClass, errMessage: lastErrMessage, httpStatus: lastHttpStatus, violations: lastViolations, … } };
    const delayMs = policy.backoffMs * Math.pow(2, attempt - 1);
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }
}
```

Per directive log line format: `[plan-component] FAILED component=<id> name="<name>" errClass=<class> attempt=<n>/<max> httpStatus=<status?> violation=<...> latencyMs=<ms>`.

---

## Phase 3 — Reimport-Resume Semantics

### Resume context loader (`web/src/lib/sci/reimport-resume.ts`, new)

```typescript
export async function loadResumeContext(supabase, tenantId, storagePath): Promise<ResumeContext> {
  const emptyCtx: ResumeContext = { priorBatchId: null, resumeSkipIds: new Set(), priorComponents: new Map() };
  const { data: batches } = await supabase
    .from('import_batches')
    .select('id, error_summary, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false }).limit(20);
  if (!batches) return emptyCtx;

  let summary: PriorImportSummary | null = null;
  let batchId: string | null = null;
  for (const b of batches) {
    const es = b.error_summary as PriorImportSummary | null;
    if (!es || es.hf !== 'HF-248') continue;
    if (es.storagePath !== storagePath) continue;
    if (!es.partialSuccess) continue;
    summary = es; batchId = b.id; break;
  }
  if (!summary || !batchId) return emptyCtx;

  const successOutcomes = (summary.componentOutcomes ?? []).filter(o => o.status === 'success');
  if (successOutcomes.length === 0) return emptyCtx;

  // Pull the persisted components from the active rule_set's components JSON.
  let ruleSetRow: { components: Json | null } | null = null;
  if (summary.ruleSetId) { … }
  if (!ruleSetRow) { … fallback to most-recently-updated active rule_set … }
  …
  // Build id → component map from variants
  for (const v of variants) {
    for (const c of v.components) {
      if (compById.has(id)) continue;
      compById.set(id, { id, name, type, …, calculationIntent, calculationMethod, confidence, reasoning });
    }
  }
  for (const o of successOutcomes) {
    if (compById.has(o.id)) {
      resumeSkipIds.add(o.id);
      priorComponents.set(o.id, compById.get(o.id)!);
    }
  }
  return { priorBatchId: batchId, resumeSkipIds, priorComponents };
}
```

### Persistence after orchestration

```typescript
export async function persistComponentOutcomes(supabase, tenantId, storagePath, ruleSetId, orchestration): Promise<void> {
  const { data: batches } = await supabase
    .from('import_batches')
    .select('id, error_summary, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false }).limit(5);
  if (!batches || batches.length === 0) return;
  const summary: PriorImportSummary = {
    hf: 'HF-248',
    componentOutcomes: orchestration.componentOutcomes,
    partialSuccess: orchestration.partialSuccess,
    retryableFailures: orchestration.retryableFailures,
    storagePath, ruleSetId,
  };
  await supabase.from('import_batches').update({ error_summary: summary as unknown as Json }).eq('id', batches[0].id);
  console.log(`[reimport-resume] persisted componentOutcomes for batch=${batches[0].id} ruleSet=${ruleSetId} partial=${orchestration.partialSuccess} retryable=${orchestration.retryableFailures.length}`);
}
```

### UI surfacing

`web/src/lib/sci/sci-types.ts:389` — `ContentUnitResult` extended:

```typescript
export interface ContentUnitResult {
  contentUnitId: string;
  classification: AgentType;
  success: boolean;
  rowsProcessed: number;
  pipeline: string;
  error?: string;
  componentOutcomes?: Array<{ id, name, status: 'success' | 'failed', attempts, errClass?, errMessage?, httpStatus?, violations?, skippedFromPrior?, lastAttemptAt }>;
  partialSuccess?: boolean;
}
```

`web/src/components/sci/ExecutionProgress.tsx` ProgressItem extended same way. `toProgressItems` forwards `componentOutcomes` + `partialSuccess` from the unit's result. The per-item render block emits a nested list below the plan row when `componentOutcomes` is populated:

```
✓ Colocación de Crédito - Ejecutivo                          (success)
✗ Colocación de Crédito - Ejecutivo Senior                   cognition_truncation  exhaustive_emission@$: …
✓ Captación de Depósitos - Ejecutivo Senior                  (reused from prior import)
```

`partialSuccess` adds a `partial` marker on the classification cell.

### Reconciliation with HF-244 supersession (HALT-2)

HF-244 archives prior rule_sets on every reimport. A partial-success reimport still archives the prior rule_set; the new rule_set inherits the resumed components from the orchestrator (which spliced them in WITHOUT an LLM call) plus any re-attempted ones. End state: one active rule_set with the resumed + re-attempted components.

---

## Phase 4 — Async Polling: DEFERRED

Per HALT-3: Vercel serverless does not support reliable post-response execution without a substantial new architecture (background workers / Vercel `waitUntil` semantics with a separate `/api/import/status` polling endpoint and a job-state table). The build-out is non-trivial and is decoupled from the per-component decomposition delivered in Phases 1-3.

Expected latency reduction from Phases 1-2 alone: a 4-component BCL plan was failing at 230s (monolithic + retry storm). Post-HF-248: skeleton call (~3-5s) + 4 component calls (~10-15s each) = 40-60s typical. This fits within standard UI fetch timeouts.

If the architect-manual run still exceeds the UI timeout for very large plans (10+ components, multi-sheet matrices), Phase 4 ships as a follow-on HF.

---

## Phase 5 — Verification

### Build (CC, local)

```
$ npx tsc --noEmit
(no output — clean)

$ rm -rf .next && npm run build
✓ Compiled successfully

$ npm run dev (curl localhost:3000)
HTTP 307
```

No new TypeScript errors. Adapter API surface unchanged (HF-238 contract preserved). Phase 4 deferred.

### Architect-manual verification

1. Clean-slate BCL (HF-247's clean-slate SQL).
2. Import BCL plan file through the browser.
3. Capture from logs:
   - `[plan-orchestrator] Phase A skeleton call — N chars` and `Phase A skeleton complete (Xms) — Y components in index`
   - `[plan-component] SUCCESS component=<id> name="<name>" attempt=1 latencyMs=X` per successful component
   - `[plan-component] FAILED component=<id> name="<name>" errClass=<class> attempt=<n>/<max> …` per failed component
   - `[plan-orchestrator] Phase B complete — N/M components succeeded, K failed (J retryable on reimport)`
   - `[reimport-resume] persisted componentOutcomes for batch=… ruleSet=… partial=… retryable=…`
   - Final `[SCI plan-interp] Batched plan saved: … M components`
4. Verify the UI renders per-component outcome rows under the plan row.
5. Verify `import_batches.error_summary` carries `hf: 'HF-248'` + `componentOutcomes` + `partialSuccess` + `storagePath` + `ruleSetId`.

### Reimport-resume verification

1. Without changing anything, reimport the same plan file.
2. Verify `[plan-component] SKIPPED (reimport-resume) component=<id> name="<name>" — reusing prior successful tree` fires for previously-successful components.
3. Verify `[plan-component] SUCCESS` (or `FAILED`) fires only for previously-failed components.
4. Confirm idempotency: if the first import succeeded fully, the second import skips all components (orchestrator emits SKIPPED for every entry).

### BCL 30-cell matrix watch (HALT-4)

If a single component's emission still exceeds `max_tokens` (BCL C0 Credit Placement 6×5 = 30 cells), the validator's `exhaustive_emission` check throws and surfaces as `cognition_truncation`. Per the retry policy, no retry fires — the failure surfaces to the user immediately with the diagnostic. Follow-on HF: rate table as separate JSON block emitted alongside the DAG tree.

To be filled by architect:

| Line | Value |
|---|---|
| `[plan-orchestrator] Phase A skeleton complete` | _verbatim line_ |
| `[plan-component] SUCCESS` count | _N of M_ |
| `[plan-component] FAILED` errClass list | _verbatim per-line_ |
| `[reimport-resume] persisted componentOutcomes` | _verbatim line_ |
| Final BCL October grand total (post data + calc) | _$..._ |

---

## HALT conditions

| ID | Condition | Status |
|---|---|---|
| HALT-1 | Plan skeleton call returns zero components | Cleared via guard. HF-247's empty-components guard catches and surfaces failure. |
| HALT-2 | Reimport-resume conflicts with HF-244 supersession | Cleared. Prior rule_set archived; new rule_set inherits successful components from orchestrator without LLM call. |
| HALT-3 | Phase 4 (async polling) requires substantial new architecture | DEFERRED per directive. Per-component decomposition should bring typical latencies under UI timeout. Follow-on HF if needed. |
| HALT-4 | Per-component call still exceeds max_tokens | TBD on architect-manual. If BCL C0 30-cell matrix still truncates per-component, follow-on HF on emission strategy for large matrices. |
| HALT-5 | Retry classifier misclassifies cognition vs adapter | Cleared. Cognition errors carry validator-generated signatures (`exhaustive_emission@`, `arity@`, etc.). Adapter errors carry HTTP status codes. Structurally distinguishable. |
| HALT-6 | UI partial-status render breaks single-component flows | Cleared. Per-component block renders only when `componentOutcomes` is non-empty; non-plan classifications carry no outcomes and render unchanged. |

---

## Files changed

Phases 1-2:
- `web/src/lib/ai/types.ts` — `plan_skeleton` + `plan_component` task types added.
- `web/src/lib/ai/ai-service.ts` — `interpretPlanSkeleton` + `interpretPlanComponent` methods.
- `web/src/lib/ai/providers/anthropic-adapter.ts` — `plan_skeleton` + `plan_component` system prompts and user messages.
- `web/src/lib/sci/plan-orchestration.ts` (new) — two-phase orchestrator + per-component retry loop.
- `web/src/lib/sci/interpretation-errors.ts` (new) — error classifier + retry policy.
- `web/src/lib/sci/plan-interpretation.ts` — both call sites switched from `aiService.interpretPlan` to the orchestrator.

Phase 3:
- `web/src/lib/sci/reimport-resume.ts` (new) — `loadResumeContext` + `persistComponentOutcomes`.
- `web/src/lib/sci/sci-types.ts` — `ContentUnitResult` extended with `componentOutcomes` + `partialSuccess`.
- `web/src/components/sci/ExecutionProgress.tsx` — `ProgressItem` extended; nested per-component render under plan row.

Phase 4:
- DEFERRED. No files changed.

Phase 5:
- `docs/completion-reports/HF-248_COMPLETION_REPORT.md` (this file).

---

## Out of scope

- Calculation engine (OB-200 grammar, scale metadata, HF-244 validator, HF-244 scale mutual exclusion). Unchanged. The engine receives complete DAG trees per component, same as before. Orchestration is ABOVE the engine boundary.
- BCL C0 30-cell matrix emission strategy. Follow-on HF if single-component emission still truncates.
- CRP and Meridian verification. After BCL succeeds, the same orchestration path applies.
- Evaluator unit test suite.
- Temporal prime extensions.
- Substrate supersession candidates (VG-side).
- Plan signature classifier improvements (HF-247 owned).

## Residuals

- Per-component decomposition introduces N LLM calls instead of 1. Total cost rises proportionally to component count. Track in production cost metrics.
- Reimport-resume requires the storagePath to match. A modified plan file (re-uploaded with different storage path) will not resume — treated as fresh import. Correct behavior per content-addressing semantics.
- The error class taxonomy may grow as new failure modes are observed.
- Phase 4 (async polling) is a follow-on if very large plans (10+ components) still exceed UI timeout post-HF-248.
