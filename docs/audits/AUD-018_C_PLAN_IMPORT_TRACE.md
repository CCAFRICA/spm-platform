# AUD-018 Phase C — Live Plan-Import End-to-End Trace

- **GOOD_SHA**: `d501f97b616cfba62c2138538ec0f2637084a679` (HF-281 merge PR #468, 2026-06-09 — last proven-exact baseline)
- **CURRENT_SHA**: `ba8c4a4c26e4d07cc7d8c5ae0f2a59926543c95d` (main HEAD, includes HF-304)
- **Audit date**: 2026-06-17
- **Agent**: AUD-018 Agent C (read-only forensic, sequential end-to-end walk)
- **Method**: SR-44 Prove-Don't-Describe — every node below is backed by pasted live-code evidence at `file:line`. Read against the working tree at CURRENT_SHA.

---

## KEYSTONE VERDICT (one sentence)

**YES — the plan-interpretation calls (both Phase A `plan_skeleton` and Phase B `plan_component`) flow THROUGH the exact `anthropic-adapter.execute()` `requestBody` seam that HF-304 edited; HF-304 therefore takes effect, because that seam's `model` field is keyed on `PLAN_INTERPRETATION_TASKS.has(request.task)` and both `plan_skeleton`/`plan_component` are members of that set.**

---

## ENTRY ROUTE — `execute` vs `execute-bulk` (one is retired; PROVEN)

`execute/route.ts` is **DELETED**; `execute-bulk/route.ts` is the SOLE entry. The deletion is in git history, and the directory does not exist on the working tree:

```
$ ls web/src/app/api/import/sci/execute
ls: web/src/app/api/import/sci/execute: No such file or directory

$ ls web/src/app/api/import/sci/execute-bulk
route.ts

$ git log --oneline --diff-filter=D -- web/src/app/api/import/sci/execute/route.ts
9484e3b5 HF-239: Unified import route — delete execute, merge into execute-bulk (#424)
```

In-code confirmation (the bulk route's own header comments name the deleted route):
```
execute-bulk/route.ts:34: // execute/route.ts). Closes AP-17 (parallel metadata construction).
execute-bulk/route.ts:293: // the deleted execute/route.ts). Handled plan units are skipped by the
execute-bulk/route.ts:773: // Plan interpretation runs EXCLUSIVELY in executeBatchedPlanInterpretation. The
```

**Entry route actually used: `POST /api/import/sci/execute-bulk`** (`execute-bulk/route.ts:116`).

---

## ORDERED CALL SEQUENCE (numbered nodes)

| # | file:line | function | input | output / produces | AI task + model-resolution (file:line) |
|---|-----------|----------|-------|-------------------|----------------------------------------|
| 1 | `web/src/app/api/import/sci/execute-bulk/route.ts:116` | `POST(req)` | request body: content units, classifications, bindings, storagePath | groups plan units by path; dispatches plan pipeline | — |
| 2 | `web/src/app/api/import/sci/execute-bulk/route.ts:344` | call to `executeBatchedPlanInterpretation(...)` | `supabase, tenantId, group, profileId, planPath, comprehendedFields` | `batchResults: ContentUnitResult[]` | — |
| 3 | `web/src/lib/sci/plan-interpretation.ts:76` | `executeBatchedPlanInterpretation` | planUnits, storagePath, comprehendedFields | downloads file, extracts text/PDF, idempotency claim, rule_sets upsert | — |
| 4 | `web/src/lib/sci/plan-interpretation.ts:286` | dynamic `import('./plan-orchestration')` → `orchestratePerComponentInterpretation` | `{documentContent, format, pdfBase64, signalContext, resumeSkipIds, priorComponents, fieldComprehension}` | `orchestration.interpretation` (assembled PlanInterpretation + componentOutcomes) | — |
| 5 | `web/src/lib/sci/plan-orchestration.ts:149` | `orchestratePerComponentInterpretation` | OrchestrationInput | OrchestrationResult | — |
| 6 | `web/src/lib/sci/plan-orchestration.ts:152` | `getAIService()` | — | singleton AIService (provider=anthropic) | resolves adapter via `AIService.createAdapter('anthropic')` → `new AnthropicAdapter(config)` (`ai-service.ts:43-46`) |
| **7 (PHASE A SKELETON)** | `web/src/lib/sci/plan-orchestration.ts:159` | `aiService.interpretPlanSkeleton(documentContent, format, signalContext, pdfBase64, pdfMediaType)` | plan document text/PDF | `skeletonRaw` → `componentIndex[]` (the per-component spec list incl. ids, appliesToEmployeeTypes) | **task=`plan_skeleton`**, set at `ai-service.ts:339`; `temperature:0` at `ai-service.ts:341` |
| 8 | `web/src/lib/ai/ai-service.ts:324` | `interpretPlanSkeleton` body | builds `input{content,format[,pdf...]}` | calls `this.execute({task:'plan_skeleton', options:{maxTokens:4096, temperature:0}}, true, signalContext)` (`ai-service.ts:337-345`) | — |
| 9 | `web/src/lib/ai/ai-service.ts:62` | `AIService.execute` | AIRequest | delegates to adapter | `await this.adapter.execute(request)` (`ai-service.ts:73`) |
| **10 (ADAPTER SEAM — HF-304)** | `web/src/lib/ai/providers/anthropic-adapter.ts:994` | `AnthropicAdapter.execute(request)` | AIRequest | `requestBody` JSON → `fetch(ANTHROPIC_API_URL)` | **MODEL BOUND HERE** `anthropic-adapter.ts:1071-1073`; **TEMPERATURE SET HERE** `anthropic-adapter.ts:1075` |
| 11 | `web/src/lib/ai/providers/anthropic-adapter.ts:1095` | `fetch(ANTHROPIC_API_URL,…)` | `requestBody` | HTTP POST to `https://api.anthropic.com/v1/messages` (`anthropic-adapter.ts:20`) | — |
| 12 | `web/src/lib/sci/plan-orchestration.ts:230` | `runOne(rawEntry, index)` (Phase B fan-out, concurrency=4 @ `:225`) | one `componentIndex` entry | per-component OrchestratedComponent / outcome | — |
| 13 | `web/src/lib/sci/plan-orchestration.ts:455` | `callPlanComponentWithRetry(args)` | componentSpec `{id,name,appliesToEmployeeTypes,briefSemantic,rateTableCellCount}` | retry loop; constructs PrimeNode tree from intent | — |
| **14 (PHASE B COMPONENT — c1-senior built here)** | `web/src/lib/sci/plan-orchestration.ts:483` | `aiService.interpretPlanComponent(content, format, spec, signalContext, pdfBase64, pdfMediaType, fieldAnchor, retryFeedback?)` | the single component spec (e.g. id `c1`, appliesTo `["senior"]`) + retry envelope | one component's CompositionalIntent → PrimeNode tree | **task=`plan_component`**, set at `ai-service.ts:392`; `temperature:0` at `ai-service.ts:394` |
| 15 | `web/src/lib/ai/ai-service.ts:354` | `interpretPlanComponent` body | builds `input{content,format,componentSpec[,fieldAnchor][,retryFeedback][,pdf]}` | calls `this.execute({task:'plan_component', options:{maxTokens:8192, temperature:0}}, true, signalContext)` (`ai-service.ts:390-398`) | — |
| 16 | `web/src/lib/ai/ai-service.ts:62` → `:73` | `AIService.execute` → `adapter.execute` | AIRequest(task=`plan_component`) | re-enters node 10 (same `AnthropicAdapter.execute` seam) | model bound at `anthropic-adapter.ts:1071-1073` |
| 17 | `web/src/lib/sci/plan-interpretation.ts:342` | `bridgeAIToEngineFormat(interpretation, tenantId, userId)` | assembled interpretation | engine-format components + input_bindings | — |
| 18 | `web/src/lib/sci/plan-interpretation.ts:407` | `supabase.from('rule_sets').upsert({...})` | engineFormat | active `rule_sets` row persisted | — |

**Both AI nodes (7 skeleton, 14 component) re-enter the SAME adapter seam (node 10).** There is one `AnthropicAdapter.execute` and one `requestBody` construction; every plan AI call passes through it.

---

## THE EXACT MODEL-BINDING NODE (HF-304)

`web/src/lib/ai/providers/anthropic-adapter.ts:1068-1083` — the single `requestBody` for ALL `AnthropicAdapter.execute` traffic:

```
1068:    const requestBody = JSON.stringify({
1069:      // HF-304 (AUD-017): plan-interpretation tasks → Opus (structural rate-table completeness); every
1070:      // other task keeps its configured model. Keyed on the typed task discriminant (Korean Test).
1071:      model: PLAN_INTERPRETATION_TASKS.has(request.task)
1072:        ? PLAN_INTERPRETATION_MODEL
1073:        : (this.config.model || 'claude-sonnet-4-6'),
1074:      max_tokens: request.options?.maxTokens || 8192,
1075:      temperature: request.options?.temperature ?? 0.1,
1076:      system: systemPrompt,
1077:      messages: [ { role: 'user', content: messageContent } ],
1078:    });
```

The HF-304 constant + task-set (`anthropic-adapter.ts:29-35`):
```
29: const PLAN_INTERPRETATION_MODEL = 'claude-opus-4-8';
33: const PLAN_INTERPRETATION_TASKS: ReadonlySet<AITaskType> = new Set<AITaskType>([
34:   'plan_interpretation', 'plan_skeleton', 'plan_component', 'plan_component_with_chunking',
35: ]);
```

**Proof HF-304 takes effect on the live plan path:** node 7 dispatches `task:'plan_skeleton'` and node 14 dispatches `task:'plan_component'` (both members of `PLAN_INTERPRETATION_TASKS`), so `PLAN_INTERPRETATION_TASKS.has(request.task)` is `true` for both → `model = 'claude-opus-4-8'`. No other plan-import path bypasses this seam (see DIVERGENCE callouts).

## THE EXACT TEMPERATURE NODE

`anthropic-adapter.ts:1075` — `temperature: request.options?.temperature ?? 0.1`. For plan tasks the `?? 0.1` fallback is NEVER reached because ai-service supplies `temperature:0` explicitly:
```
ai-service.ts:341 (plan_skeleton):  options: { responseFormat: 'json', maxTokens: 4096, temperature: 0 }
ai-service.ts:394 (plan_component): options: { responseFormat: 'json', maxTokens: 8192, temperature: 0 }
```
So the live plan calls run at **temperature 0** (bound per-method in ai-service, passed through the adapter seam).

---

## DIVERGENCE / ABANDONED-PATH CALLOUTS

### DIVERGENCE 1 — monolithic `interpretPlan` is ABANDONED (dead, but still adapter-routed)
- **Live spine (used):** `interpretPlanSkeleton` + `interpretPlanComponent` — `plan-orchestration.ts:159` and `:483`.
- **Abandoned path:** `aiService.interpretPlan` (the monolithic single-call interpreter) — defined at `ai-service.ts:293`, adapter prompt + case still present (`anthropic-adapter.ts:34` lists `'plan_interpretation'`). **NO live caller.** The only reference repo-wide is a doc-comment:
```
$ grep -rnE "\.interpretPlan\(" web/src --include='*.ts' | grep -vE "Skeleton|Component|Chunk"
web/src/lib/compensation/ai-plan-interpreter.ts:614: * @param rawResult - The raw `response.result` from `aiService.interpretPlan()`
```
Note: `plan_interpretation` is still in `PLAN_INTERPRETATION_TASKS` so it WOULD route to Opus if ever invoked — but it is never invoked on the import spine. Harmless but dead.
- ONE-LINE ADVISORY (HALT-0, no fix applied): `interpretPlan` (ai-service.ts:293) + its `plan_interpretation` task case are dead code reachable by no import caller; consider removing in a dedicated cleanup to prevent a future caller silently reviving the monolithic path.

### DIVERGENCE 2 — `interpretPlanComponentWithChunking` / `plan_component_with_chunking` is ABANDONED on the live path
- **Live spine (used):** `interpretPlanComponent` (single-call, no chunking) — `plan-orchestration.ts:483`. The retry loop comment states chunking dispatch is retired:
```
plan-orchestration.ts:472-474: // Mode A/B chunking dispatch from HF-250 is retired
//   (the intent is always small enough for a single LLM call).
```
- **Abandoned path:** `interpretPlanComponentWithChunking` (`ai-service.ts:409`, task `plan_component_with_chunking`, adapter case `anthropic-adapter.ts:1405`). It is a `PLAN_INTERPRETATION_TASKS` member (would route to Opus) but is not called from the orchestrator. No live caller on the plan-import spine.

### DIVERGENCE 3 — `analyze-document` is a SEPARATE AI path that does NOT route to Opus (correct by design)
- **Path:** `POST /api/import/sci/analyze-document` → `aiService.execute({task:'document_analysis'})` (`analyze-document/route.ts:134-135`).
- `document_analysis` is **NOT** in `PLAN_INTERPRETATION_TASKS` (`anthropic-adapter.ts:33-35`), so node-10's ternary resolves to `this.config.model || 'claude-sonnet-4-6'` — NOT Opus. This is a classification/structure step, not plan interpretation; it correctly diverges from the HF-304 routing. Listed for completeness so a reader does not mistake it for a parallel plan-interpretation spine.

### DIVERGENCE 4 — `process-job` does NOT interpret plans (parse-once only)
- `POST /api/import/sci/process-job` contains NO plan-interpretation call; it only persists the parsed workbook companion that `execute-bulk` later reads:
```
$ grep -nE "executeBatchedPlanInterpretation|interpretPlan|plan-interpretation" web/src/app/api/import/sci/process-job/route.ts
(no plan-interpretation matches; only HF-285-D parse-once comments at :28 and :120)
```
Not a divergent plan spine — a pre-step. Recorded to rule it out.

### NON-DIVERGENCE (explicitly cleared) — adapter seam is SINGULAR
There is exactly ONE `AnthropicAdapter.execute` (`anthropic-adapter.ts:994`) and ONE `requestBody` (`:1068`). The only sibling is `executeAgentTurn` (`anthropic-adapter.ts:1179`) used by the OB-212 agent-runner (`agent-runner.ts`), which is NOT on the plan-import path and has its own model resolution (`req.model || this.config.model || 'claude-sonnet-4-6'`, `:1188`, no plan-task routing). The plan path never touches `executeAgentTurn`.

---

## UNIFIED vs DIVERGENT VERDICT (Plan-Import path)

**UNIFIED SPINE — one live path, no parallel/competing plan interpreter.**

The live Plan-Import path is a single spine:
`POST execute-bulk` (`execute-bulk/route.ts:116`) → `executeBatchedPlanInterpretation` (`plan-interpretation.ts:76`) → `orchestratePerComponentInterpretation` (`plan-orchestration.ts:149`) → {Phase A `interpretPlanSkeleton` `:159`; Phase B `interpretPlanComponent` `:483`} → `AIService.execute` (`ai-service.ts:62`) → `AnthropicAdapter.execute` requestBody seam (`anthropic-adapter.ts:994`/`:1068`) → `fetch` to `api.anthropic.com`.

Both AI nodes converge on the single adapter seam HF-304 edited; HF-304 routes them to `claude-opus-4-8`. The three "other" methods that share the adapter task-set (`interpretPlan`, `interpretPlanComponentWithChunking`) are **abandoned** (no live caller), and the two other routes (`analyze-document`, `process-job`) are **not plan interpreters**. There is no abandoned-but-still-wired SECOND plan interpreter competing with the spine — the prior duplicate `executePlanPipeline` was deleted (`plan-interpretation.ts:2-5` header; `execute-bulk/route.ts:48-50`).
