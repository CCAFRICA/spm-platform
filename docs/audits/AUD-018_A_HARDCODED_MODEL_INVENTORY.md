# AUD-018 Phase A — Hardcoded-Model & Model-Resolution Inventory

| Field | Value |
|---|---|
| GOOD_SHA | `d501f97b616cfba62c2138538ec0f2637084a679` (HF-281 merge PR #468, 2026-06-09 — last proven-exact baseline) |
| CURRENT_SHA | `ba8c4a4c26e4d07cc7d8c5ae0f2a59926543c95d` (main HEAD, merge PR #539, includes HF-304) |
| Audit date | 2026-06-17 |
| Agent | AUD-018 Agent A (read-only forensic) |
| Method | SR-44 Prove-Don't-Describe — every row below is RAW PASTED command output / Read excerpts with file:line |

HEAD confirmed:
```
$ git rev-parse HEAD
ba8c4a4c26e4d07cc7d8c5ae0f2a59926543c95d
```

---

## SWEEP 1 — `grep -rnE "claude-[a-z0-9.\-]+" web/src --include='*.ts' --include='*.tsx'` (RAW)

```
web/src/app/api/ai/agent/reconcile-diagnose/route.ts:54:  const model = process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6';
web/src/lib/sci/header-comprehension.ts:184:      llmModel: 'claude-sonnet-4-6',
web/src/lib/sci/header-comprehension.ts:253:    llmModel: 'claude-sonnet-4-6',
web/src/lib/sci/header-comprehension.ts:391:      llmModel: r.status === 'comprehended' ? 'claude-sonnet-4-6' : 'flywheel-atom',
web/src/lib/sci/header-comprehension.ts:430:    llmModel: llmDispatches > 0 ? 'claude-sonnet-4-6' : null,
web/src/lib/ai/types.ts:27:  model: string;                    // e.g., 'claude-sonnet-4-6', 'gpt-4o'
web/src/lib/ai/providers/anthropic-adapter.ts:29:const PLAN_INTERPRETATION_MODEL = 'claude-opus-4-8';
web/src/lib/ai/providers/anthropic-adapter.ts:1073:        : (this.config.model || 'claude-sonnet-4-6'),
web/src/lib/ai/providers/anthropic-adapter.ts:1116:      err.providerModel = this.config.model || 'claude-sonnet-4-6';
web/src/lib/ai/providers/anthropic-adapter.ts:1127:      err.providerModel = this.config.model || 'claude-sonnet-4-6';
web/src/lib/ai/providers/anthropic-adapter.ts:1188:      model: req.model || this.config.model || 'claude-sonnet-4-6',
web/src/lib/ai/providers/anthropic-adapter.ts:1216:      e.providerModel = req.model || this.config.model || 'claude-sonnet-4-6';
web/src/lib/ai/providers/anthropic-adapter.ts:1224:      e.providerModel = req.model || this.config.model || 'claude-sonnet-4-6';
web/src/lib/ai/ai-service.ts:37:      model: process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6',
web/src/lib/ai/agent/reconciliation-diagnosis-agent.ts:41:    // model omitted → adapter's resolved model (claude-sonnet-4-6).
```

## SWEEP 2 — `grep -rnE "model\s*[:=]" ... | grep -iE "claude|process.env|config.model|MODEL|opus|sonnet|haiku"` (RAW, model-bearing rows only — telemetry-echo rows like `model: response.model` and unrelated `credit_model` retained for completeness)

```
web/src/app/api/platform/observatory/route.ts:391,403,408,416,426,430,439:  surface/model telemetry shape (reads agent_invocations.model column; does NOT select a model)
web/src/app/api/analyze-workbook/route.ts:182:          model: response.model,            (echoes the model the response reports back)
web/src/app/api/ai/classify-file/route.ts:64,83:        model: response.model,            (echo)
web/src/app/api/ai/agent/reconcile-diagnose/route.ts:54:  const model = process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6';   (RESOLUTION)
web/src/app/api/ai/assessment/route.ts:217:            model: response.model,         (echo)
web/src/app/api/ai/classify-fields-second-pass/route.ts:96,115:        model: response.model,  (echo)
web/src/app/api/interpret-import/route.ts:94:          model: response.model,           (echo)
web/src/lib/ai/types.ts:27,53:  model: string;                              (type decl)
web/src/lib/ai/providers/anthropic-adapter.ts:1071:      model: PLAN_INTERPRETATION_TASKS.has(request.task)   (RESOLUTION — execute() seam)
web/src/lib/ai/providers/anthropic-adapter.ts:1188:      model: req.model || this.config.model || 'claude-sonnet-4-6',  (RESOLUTION — executeAgentTurn() seam)
web/src/lib/ai/agent/agent-runner.ts:135:      model: def.model,                    (forwards per-agent def.model to executeAgentTurn)
web/src/lib/ai/training-signal-service.ts:77:        model: response.model,             (echo)
web/src/lib/ai/ai-service.ts:37:      model: process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6',  (RESOLUTION — SERVICE CONSTRUCTOR / governing line)
web/src/lib/ai/ai-service.ts:110,129,140,171,605:  model: this.config.model / response.model  (echo of config / response)
```

## SWEEP 3 — `grep -rnE "process\.env\.[A-Z_]*MODEL[A-Z_]*"` (RAW)

```
web/src/app/api/ai/agent/reconcile-diagnose/route.ts:54:  const model = process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6';
web/src/lib/ai/ai-service.ts:37:      model: process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6',
```
**Only ONE env var governs model selection platform-wide: `NEXT_PUBLIC_AI_MODEL`.**

## SWEEP 4 — `grep -rnE "PLAN_INTERPRETATION_MODEL|PLAN_INTERPRETATION_TASKS|request.task|task ===|TASKS.has"` (RAW)

```
web/src/lib/ai/ai-service.ts:95:    ...PROVIDER HARD-ERROR on ${request.task}...
web/src/lib/ai/ai-service.ts:98:          task: request.task,
web/src/lib/ai/ai-service.ts:117,119,172:   request.task usage (logging / signal purpose)
web/src/lib/ai/providers/anthropic-adapter.ts:29:const PLAN_INTERPRETATION_MODEL = 'claude-opus-4-8';
web/src/lib/ai/providers/anthropic-adapter.ts:33:const PLAN_INTERPRETATION_TASKS: ReadonlySet<AITaskType> = new Set<AITaskType>([
web/src/lib/ai/providers/anthropic-adapter.ts:1010:    const rawPrompt = SYSTEM_PROMPTS[request.task];
web/src/lib/ai/providers/anthropic-adapter.ts:1071:      model: PLAN_INTERPRETATION_TASKS.has(request.task)
web/src/lib/ai/providers/anthropic-adapter.ts:1072:        ? PLAN_INTERPRETATION_MODEL
web/src/lib/ai/providers/anthropic-adapter.ts:1142:    if (request.task === 'plan_interpretation') {  (DIAG log only)
web/src/lib/ai/providers/anthropic-adapter.ts:1167:      task: request.task,
web/src/lib/ai/providers/anthropic-adapter.ts:1239:    switch (request.task) {        (buildUserPrompt dispatch)
```

## EXTRA SWEEP — env templates / vercel / next config

```
$ ls -a web/ | grep -E "\.env"
.env.local
.env.local.example
.env.stripe.example
$ grep -niE "AI_MODEL|claude|opus|sonnet|anthropic" web/.env.local.example
6:# Anthropic AI
7:ANTHROPIC_API_KEY=your-anthropic-key
$ grep -niE "NEXT_PUBLIC_AI_MODEL|NEXT_PUBLIC_AI_PROVIDER" web/.env.local
(no output)
```
**FINDING (deployment-relevant):** `web/.env.local` does NOT set `NEXT_PUBLIC_AI_MODEL`. Therefore `this.config.model` resolves to the hardcoded fallback `'claude-sonnet-4-6'` (ai-service.ts:37). No `web/vercel.json` / no model strings in next config. The example template documents only `ANTHROPIC_API_KEY`, not the model var.

## EXTRA SWEEP — provider URL / version constants (non-model, for completeness)

```
web/src/lib/ai/providers/anthropic-adapter.ts:20:const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
web/src/lib/ai/providers/anthropic-adapter.ts:21:const ANTHROPIC_VERSION = '2023-06-01';
```

---

## CONSOLIDATED MODEL-SITE TABLE

| file:line | literal / expression | task path(s) governed (HOW determined) | default/fallback vs in-force selection |
|---|---|---|---|
| ai-service.ts:37 | `process.env.NEXT_PUBLIC_AI_MODEL \|\| 'claude-sonnet-4-6'` | **GOVERNING SERVICE CONSTRUCTOR** — sets `this.config.model`, passed into every AnthropicAdapter; governs ALL non-plan tasks (classify, assessment, document_analysis, chunk, etc.) | env unset in `.env.local` ⇒ in-force value = literal `claude-sonnet-4-6` |
| anthropic-adapter.ts:29 | `PLAN_INTERPRETATION_MODEL = 'claude-opus-4-8'` | the 4 plan tasks at adapter execute() seam (see :1071) | HF-304 hardcoded constant; in-force for plan tasks |
| anthropic-adapter.ts:33-35 | `PLAN_INTERPRETATION_TASKS = {plan_interpretation, plan_skeleton, plan_component, plan_component_with_chunking}` | membership test that switches the model at :1071 | structural task-set |
| anthropic-adapter.ts:1071-1073 | `PLAN_INTERPRETATION_TASKS.has(request.task) ? PLAN_INTERPRETATION_MODEL : (this.config.model \|\| 'claude-sonnet-4-6')` | **execute() seam** — the single-call path for all 20 surfaces incl. plan interpretation | in-force: Opus 4.8 for plan tasks, else config model (=sonnet-4-6) |
| anthropic-adapter.ts:1116/1127 | `this.config.model \|\| 'claude-sonnet-4-6'` | error-tagging only (providerModel on hard error) | reporting fallback, not a selection |
| anthropic-adapter.ts:1188 | `req.model \|\| this.config.model \|\| 'claude-sonnet-4-6'` | **executeAgentTurn() seam** — OB-212 agent runtime ONLY (tools loop). Does NOT carry the HF-304 plan branch. | per-agent `def.model` (agent-runner.ts:135) → else config → else literal |
| anthropic-adapter.ts:1216/1224 | `req.model \|\| this.config.model \|\| 'claude-sonnet-4-6'` | agent-turn error tagging | reporting fallback |
| reconcile-diagnose/route.ts:54 | `process.env.NEXT_PUBLIC_AI_MODEL \|\| 'claude-sonnet-4-6'` | reconciliation-diagnosis agent route | parallel resolution OUTSIDE the service constructor (drift surface) |
| agent-runner.ts:135 | `model: def.model` | forwards per-agent definition model into executeAgentTurn | per-agent override |
| header-comprehension.ts:184/253/391/430 | `'claude-sonnet-4-6'` (literal) | SCI header-comprehension TELEMETRY labels (`llmModel` recorded into signals) — NOT a request-time model selection | descriptive label; will mis-report if the real model differs |
| types.ts:27/53 | `model: string` | type declarations only | n/a |
| observatory/route.ts:391-439 | reads `agent_invocations.model` column | read-only Observatory aggregation | reporting only |

---

## LIVE-QUESTION RESOLUTION (pasted code)

### 1. ai-service.ts constructor model-resolution (verbatim, lines 34-40)
```ts
  constructor(config?: Partial<AIServiceConfig>) {
    this.config = {
      provider: (process.env.NEXT_PUBLIC_AI_PROVIDER as AIProvider) || 'anthropic',
      model: process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6',
      ...config,
    };
    this.adapter = this.createAdapter(this.config.provider);
  }
```
This is the Adjacent-Arm-Drift seam flagged in the mission: the governing model line lives in the SERVICE constructor, not the adapter. `.env.local` has no `NEXT_PUBLIC_AI_MODEL`, so `this.config.model === 'claude-sonnet-4-6'`.

### 2. anthropic-adapter.ts requestBody `model:` line(s) (verbatim)
execute() seam — lines 1068-1075:
```ts
    const requestBody = JSON.stringify({
      // HF-304 (AUD-017): plan-interpretation tasks → Opus (structural rate-table completeness); every
      // other task keeps its configured model. Keyed on the typed task discriminant (Korean Test).
      model: PLAN_INTERPRETATION_TASKS.has(request.task)
        ? PLAN_INTERPRETATION_MODEL
        : (this.config.model || 'claude-sonnet-4-6'),
      max_tokens: request.options?.maxTokens || 8192,
      temperature: request.options?.temperature ?? 0.1,
```
executeAgentTurn() seam — line 1188 (NO plan branch):
```ts
      model: req.model || this.config.model || 'claude-sonnet-4-6',
```

**HF-304 branch PRESENT on CURRENT_SHA: YES** (lines 1071-1073, plus constants 29 & 33-35). Confirmed introduced by commit `8620b857` "HF-304: route plan-interpretation task family to Opus" dated 2026-06-17 17:57:23 -0700, merged via PR #539 = CURRENT_SHA `ba8c4a4c`.

**Tracing `request.task` for plan_skeleton back to the caller (PASTED chain):**
- `plan-orchestration.ts:159`: `const resp = await aiService.interpretPlanSkeleton(`
- `ai-service.ts:337-345` interpretPlanSkeleton body:
```ts
    return this.execute(
      {
        task: 'plan_skeleton',
        input,
        options: { responseFormat: 'json', maxTokens: 4096, temperature: 0 },
      },
      true,
      signalContext
    );
```
- `ai-service.ts:73`: `adapterResponse = await this.adapter.execute(request);` (request.task === `'plan_skeleton'`)
- adapter execute() :1071 → `PLAN_INTERPRETATION_TASKS.has('plan_skeleton')` === **TRUE** → model = `PLAN_INTERPRETATION_MODEL` = `'claude-opus-4-8'`.

So at the seam, `request.task` IS a member of PLAN_INTERPRETATION_TASKS — option (b) is FALSE. `config.model` does NOT override the plan branch (the ternary picks the constant first) — option (c) is FALSE. The execute() seam is the real call path for plan_skeleton — option (a) bypass is FALSE for the orchestration path.

### 3. ONE-SENTENCE ANSWER (Question 3)
On CURRENT_SHA a `plan_skeleton` request is sent with model string **`claude-opus-4-8`**, originating from the hardcoded constant `PLAN_INTERPRETATION_MODEL` at **web/src/lib/ai/providers/anthropic-adapter.ts:29**, selected at the execute() requestBody seam **anthropic-adapter.ts:1071-1072** because `PLAN_INTERPRETATION_TASKS.has('plan_skeleton')` is true.

---

## CENTRAL CONTRADICTION — RECONCILIATION = (d) DEPLOY-TIMING

The architect observed tonight's Meridian import ran plan_skeleton on `claude-sonnet-4-6` (400: temperature deprecated), yet on CURRENT_SHA the code WOULD send `claude-opus-4-8`. These are reconciled by **(d) deploy-timing**, proven by commit dates:

```
$ git log -1 --format="%H %ci %s" -S "PLAN_INTERPRETATION_TASKS" -- web/src/lib/ai/providers/anthropic-adapter.ts
8620b8572c1e7e96a468db806026261aa2c327f0 2026-06-17 17:57:23 -0700 HF-304: route plan-interpretation task family to Opus (claude-opus-4-8) — AUD-017 remediation
```
Pre-HF-304 parent (`04074c0d`) requestBody had NO plan branch — model resolved straight from config:
```
$ git show 04074c0d:web/src/lib/ai/providers/anthropic-adapter.ts | grep -nE "model:|temperature:"
1055:      model: this.config.model || 'claude-sonnet-4-6',
1057:      temperature: request.options?.temperature ?? 0.1,
```
(And the GOOD_SHA baseline had `claude-sonnet-4-20250514` at that line per the GOOD..CURRENT diff.)

**Conclusion:** The deployed SHA at the time of "tonight's Meridian import" predated the HF-304 merge (which landed 2026-06-17 17:57 and is only on HEAD/PR #539). On that older deployed build, plan_skeleton resolved to `this.config.model` → `claude-sonnet-4-6`, matching the observation. The code path on CURRENT_SHA WOULD now send Opus for plan_skeleton. **Flag: deploy-timing is the reconciliation — re-verify which SHA the production/preview environment actually serves before drawing conclusions from the live 400.**

### SECONDARY HALT-0 ADVISORY (NEW failure HF-304 introduces, separate from the contradiction)
The "temperature deprecated" 400 the architect saw is structurally about to RECUR for a different reason on CURRENT_SHA: execute() ALWAYS sends `temperature: request.options?.temperature ?? 0.1` (adapter:1075), and interpretPlanSkeleton sets `temperature: 0` (ai-service.ts:341). HF-304 now routes that same request to `claude-opus-4-8`, but the adapter's own executeAgentTurn comment (lines 1184-1185) states the current default-tier models — "Opus 4.7/4.8, Fable 5 — 400 on sampling params." execute() does NOT omit temperature the way executeAgentTurn() does. **HALT-0 ADVISORY (one line, do not implement):** execute() will likely 400 on `temperature` when routing plan tasks to Opus 4.8 — omit/strip `temperature` for the Opus plan branch in execute(), mirroring executeAgentTurn().

---

## READ-ONLY ADVISORY — single authoritative model-selection point

Model selection is today split across at least three independent seams that can drift: the SERVICE CONSTRUCTOR (`ai-service.ts:37`, the true governing line for all non-plan tasks), the adapter execute() ternary (`anthropic-adapter.ts:1071`, HF-304 plan override), and a parallel route-level resolution (`reconcile-diagnose/route.ts:54`) — plus telemetry literals in `header-comprehension.ts` that will mis-label whatever the real model becomes. A single authoritative model-selection point should live as a pure resolver function keyed on `(task, providerConfig)` — e.g. `resolveModel(task): string` co-located with `AITaskType` (types.ts) or in a dedicated `model-policy.ts` — returning the model for any task; both adapter seams (execute and executeAgentTurn) and every route would call it instead of inlining `?? 'claude-sonnet-4-6'` fallbacks, and the telemetry `llmModel` fields would read from the same resolver so labels never diverge from reality. This makes the HF-304 plan→Opus rule, the env default, and the future Observatory per-task control one editable policy table rather than ~9 scattered literals.

### Is HF-304's branch present-but-bypassed? Name the bypass path.
The plan-interpretation branch is **PRESENT and ACTIVE** for the orchestration path (plan_skeleton/plan_component/chunking all flow through execute() at :1071). It is **NOT bypassed** for those tasks. The ONE structural bypass that exists is the agent runtime: `executeAgentTurn()` (anthropic-adapter.ts:1188) has its OWN `model:` line with NO PLAN_INTERPRETATION_TASKS check — any plan task dispatched through the OB-212 agent/tools loop (`agent-runner.ts:135` → `executeAgentTurn`) would NOT receive the Opus routing. No current caller routes a plan task through executeAgentTurn (the agent surfaces are reconciliation-diagnosis), so this is a latent drift hazard, not the cause of the observed sonnet-4-6 import. The observed sonnet-4-6 import is reconciliation (d) deploy-timing, not a bypass.

---

## Completeness Addendum (AUD-018 verify pass)

The adversarial completeness verifier confirmed the file's CENTRAL CLAIM as CORRECT and fully evidence-backed (on CURRENT_SHA `ba8c4a4c` a `plan_skeleton` request is sent with model `claude-opus-4-8`, sourced from `PLAN_INTERPRETATION_MODEL` at anthropic-adapter.ts:29 and selected at the execute() seam anthropic-adapter.ts:1071-1073). The distinct-literal census is COMPLETE for `claude-*` strings — exactly `{claude-opus-4-8 ×1, claude-sonnet-4-6 ×13}` = the 14 occurrences tabled above. JSON configs, settings.local.json, and env templates carry no model selection.

ONE gap was found: a genuine **model reference** present in the tree but absent from the inventory because it is a **word-only** reference (no `claude-*` literal) and therefore fell outside SWEEP 1's `claude-[a-z0-9.\-]+` regex. It is added here. The file's sweeps did not previously scope out comment-only references; this addendum closes that scope explicitly.

### GAP 1 — `Haiku` cost-basis comment (word-only model reference, cost-mislabeling hazard)

Found only via a case-insensitive `haiku|opus|sonnet|fable` sweep — NOT a `claude-*` literal and NOT a model-selection seam, so it correctly escaped SWEEP 1. It is a stale `Haiku` cost-basis comment driving the Anthropic cost projection ($0.003 per "Haiku" call), but the platform actually runs `claude-sonnet-4-6` / `claude-opus-4-8` — never Haiku. This aligns squarely with the file's own "labels diverge from reality" advisory (cf. the header-comprehension telemetry literals): the cost projection is keyed on a model the platform does not run, so the $/call basis is mislabeled at minimum and likely numerically wrong (Opus/Sonnet per-call cost ≫ Haiku).

RAW EVIDENCE (case-insensitive word sweep):
```
$ grep -rniE "haiku|opus|sonnet|fable" web/src --include='*.ts' --include='*.tsx'
web/src/components/platform/InfrastructureTab.tsx:320:      // ~$0.003 per Haiku call average (classification + assessment)
```

Read excerpt (InfrastructureTab.tsx:319-321, verbatim):
```ts
319    case 'anthropic':
320      // ~$0.003 per Haiku call average (classification + assessment)
321      return usage > 0 ? Math.max(1, usage * 0.003) : 0;
```

CONSOLIDATED MODEL-SITE TABLE — added row:

| file:line | literal / expression | task path(s) governed (HOW determined) | default/fallback vs in-force selection |
|---|---|---|---|
| InfrastructureTab.tsx:320 | `// ~$0.003 per Haiku call average` (word-only `Haiku`, comment) | NONE — comment + cost-projection multiplier (`usage * 0.003`) for the `anthropic` case of the platform cost projection; NOT a request-time model selection | descriptive/cost-basis label only; MIS-LABELS reality — platform runs `claude-sonnet-4-6`/`claude-opus-4-8`, not Haiku, so the $0.003 per-call basis is for the wrong model tier |

SCOPE NOTE: With GAP 1 incorporated, the inventory now covers (a) all `claude-*` literals (14, complete census), AND (b) all word-only model references (`haiku|opus|sonnet|fable`) in `web/src`. The only word-only matches outside the already-tabled `claude-*` sites are the HF-304 explanatory comments at anthropic-adapter.ts:26/28/1069/1185 (which annotate the already-tabled seams at :29/:1071-1073/:1188) and this Haiku comment. No other model reference of any form remains uncatalogued.

HALT-0 ADVISORY (one line, do not implement): InfrastructureTab.tsx:320-321 prices the Anthropic surface at a Haiku basis ($0.003/call) while the platform runs Sonnet-4.6/Opus-4.8 — the cost projection understates real spend; correct the per-call basis and the comment to the actual in-force model(s).

This file remains the single authoritative inventory for the hardcoded-model / model-resolution dimension.
