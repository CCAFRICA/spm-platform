# AUD-018 Phase B — Request-Parameter & Deprecated-Param Inventory

- **GOOD_SHA:** `d501f97b616cfba62c2138538ec0f2637084a679` (HF-281 merge PR #468, 2026-06-09 — last proven-exact baseline)
- **CURRENT_SHA:** `ba8c4a4c26e4d07cc7d8c5ae0f2a59926543c95d` (main HEAD, includes HF-304)
- **Audit date:** 2026-06-17
- **Agent:** AUD-018 Agent B (read-only forensic)
- **Scope:** every request-body construction + every API parameter across `web/src`, focused on the deprecated `temperature` that aborted tonight's import (`400: temperature is deprecated for this model`).

> READ-ONLY: nothing in this file was modified in source. Advisories are one-line and NOT implemented (HALT-0).

---

## KEY FINDING (one sentence)

The `temperature` 400 on `plan_skeleton` was produced by the **single shared request body in `AnthropicAdapter.execute()` at `web/src/lib/ai/providers/anthropic-adapter.ts:1075`** (`temperature: request.options?.temperature ?? 0.1`), which is sent **unconditionally** even though the same body routes `plan_skeleton`/`plan_interpretation`/`plan_component`/`plan_component_with_chunking` to `claude-opus-4-8` (line 29 + lines 1071–1072) — and Opus 4.8 rejects `temperature` with HTTP 400.

---

## 1. Raw sweep — `temperature`

```
$ grep -rnE "temperature" web/src --include='*.ts' --include='*.tsx' | grep -v node_modules
web/src/lib/intelligence/convergence-service.ts:3403:      options: { responseFormat: 'json', maxTokens: 4096, temperature: 0 },
web/src/lib/sci/plan-orchestration.ts:494:        // so it receives WHAT was violated. Without this an identical temperature-0
web/src/lib/sci/interpretation-errors.ts:133:      // chance to self-correct. CAVEAT (HALT-2): interpretPlanComponent runs at temperature 0 and
web/src/lib/ai/types.ts:31:  temperature?: number;
web/src/lib/ai/types.ts:42:    temperature?: number;
web/src/lib/ai/providers/anthropic-adapter.ts:1075:      temperature: request.options?.temperature ?? 0.1,
web/src/lib/ai/providers/anthropic-adapter.ts:1184:    // No `temperature`: the agent model is an advertised per-agent override, and the
web/src/lib/ai/providers/anthropic-adapter.ts:1385:        // correct it — without this an identical temperature-0 prompt re-emits the same
web/src/lib/ai/ai-service.ts:205:        options: { responseFormat: 'json', temperature: 0 },
web/src/lib/ai/ai-service.ts:227:        options: { responseFormat: 'json', temperature: 0 },
web/src/lib/ai/ai-service.ts:249:        options: { responseFormat: 'json', temperature: 0 },
web/src/lib/ai/ai-service.ts:281:        options: { responseFormat: 'json', temperature: 0 },
web/src/lib/ai/ai-service.ts:310:        options: { responseFormat: 'json', maxTokens: 8192, temperature: 0 },
web/src/lib/ai/ai-service.ts:341:        options: { responseFormat: 'json', maxTokens: 4096, temperature: 0 },
web/src/lib/ai/ai-service.ts:394:        options: { responseFormat: 'json', maxTokens: 8192, temperature: 0 },
web/src/lib/ai/ai-service.ts:434:        options: { responseFormat: 'json', maxTokens: 8192, temperature: 0 },
web/src/lib/ai/ai-service.ts:472:        options: { responseFormat: 'json', maxTokens: 8192, temperature: 0 },
web/src/lib/ai/ai-service.ts:492:        options: { responseFormat: 'json', maxTokens: 8000, temperature: 0 },
web/src/lib/ai/ai-service.ts:512:        options: { responseFormat: 'json', temperature: 0 },
```

**Read of this sweep:** Every `temperature: 0` at `ai-service.ts:205…512` and `convergence-service.ts:3403` is an **AIRequest.options** value (call-site intent), NOT a wire param. The ONLY place `temperature` is serialized onto the Anthropic wire body is `anthropic-adapter.ts:1075`. Lines 494 / 133 / 1385 are comments; lines 31 / 42 of `types.ts` are the type declarations (`AIServiceConfig.temperature?` and `AIRequest.options.temperature?`).

## 2. Raw sweep — request bodies & wire params

```
$ grep -rnE "messages\.create|requestBody|api\.anthropic\.com|/v1/messages|max_tokens|top_p|top_k|stop_sequences" web/src --include='*.ts' | grep -v node_modules
web/src/lib/sci/plan-orchestration.ts:9: *                              never hits max_tokens for typical plans.
web/src/lib/sci/plan-interpretation.ts:284:  // (each ~one component fits in max_tokens). Resume map is loaded from a
web/src/lib/ai/agent/agent-runner.ts:36: *  turn, a max_tokens truncation mid-tool_use, or a malformed tool_use block. The
web/src/lib/ai/agent/agent-runner.ts:41:  reason: 'refusal' | 'empty' | 'max_tokens' | 'malformed';
web/src/lib/ai/agent/agent-runner.ts:47:    reason: 'refusal' | 'empty' | 'max_tokens' | 'malformed',
web/src/lib/ai/agent/agent-runner.ts:168:    // There ARE tool_use blocks. If the turn hit max_tokens, the tool_use JSON is
web/src/lib/ai/agent/agent-runner.ts:170:    if (resp.stopReason === 'max_tokens') {
web/src/lib/ai/agent/agent-runner.ts:172:        `Agent "${def.name}" turn ${turn} truncated at max_tokens mid-tool_use`,
web/src/lib/ai/agent/agent-runner.ts:173:        'max_tokens',
web/src/lib/ai/providers/anthropic-adapter.ts:20:const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
web/src/lib/ai/providers/anthropic-adapter.ts:1068:    const requestBody = JSON.stringify({
web/src/lib/ai/providers/anthropic-adapter.ts:1074:      max_tokens: request.options?.maxTokens || 8192,
web/src/lib/ai/providers/anthropic-adapter.ts:1098:          body: requestBody,
web/src/lib/ai/providers/anthropic-adapter.ts:1187:    const requestBody = JSON.stringify({
web/src/lib/ai/providers/anthropic-adapter.ts:1189:      max_tokens: req.maxTokens || 4096,
web/src/lib/ai/providers/anthropic-adapter.ts:1205:        response = await fetch(ANTHROPIC_API_URL, { method: 'POST', headers: requestHeaders, body: requestBody });
```

```
$ grep -rn "requestBody" web/src/lib/ai/providers/anthropic-adapter.ts
1068:    const requestBody = JSON.stringify({
1098:          body: requestBody,
1187:    const requestBody = JSON.stringify({
1205:        response = await fetch(ANTHROPIC_API_URL, { method: 'POST', headers: requestHeaders, body: requestBody });
```

**Result:** There are exactly **TWO** wire-body construction sites in the entire `web/src` tree, both in `anthropic-adapter.ts`. No `messages.create` (SDK), no `top_p`/`top_k`/`stop_sequences` anywhere. No other provider sends an Anthropic body (OpenAI/Azure/local are type-declared in `types.ts:10` but no adapter constructs a body in scope).

## 3. Other-provider / direct-fetch sweep

```
$ grep -rnE "fetch\(|anthropic|messages\.create|\.create\(" web/src --include='*.ts' | grep -v node_modules | grep -iE "anthropic|messages\.create|\.beta\."
web/src/app/api/ai/agent/reconcile-diagnose/route.ts:53:  const provider = process.env.NEXT_PUBLIC_AI_PROVIDER || 'anthropic';
web/src/lib/sci/__tests__/import-atomicity.test.ts:17:import { AnthropicAdapter } from '../../ai/providers/anthropic-adapter';
web/src/lib/ai/providers/anthropic-adapter.ts:1087:      'anthropic-version': ANTHROPIC_VERSION,
web/src/lib/ai/providers/anthropic-adapter.ts:1088:      'anthropic-beta': 'pdfs-2024-09-25',
web/src/lib/ai/providers/anthropic-adapter.ts:1095:        response = await fetch(ANTHROPIC_API_URL, {
web/src/lib/ai/providers/anthropic-adapter.ts:1197:      'anthropic-version': ANTHROPIC_VERSION,
web/src/lib/ai/providers/anthropic-adapter.ts:1205:        response = await fetch(ANTHROPIC_API_URL, { method: 'POST', ... });
web/src/lib/ai/ai-service.ts:36:      provider: (process.env.NEXT_PUBLIC_AI_PROVIDER as AIProvider) || 'anthropic',
web/src/lib/ai/ai-service.ts:45:      case 'anthropic':
web/src/lib/ai/ai-service.ts:170:          provider: response.provider || 'anthropic',
```

**Result:** Single provider seam confirmed. All Anthropic traffic goes through one of the two `fetch(ANTHROPIC_API_URL, …)` calls (lines 1095 and 1205). No alternate provider constructs a body. (Matches MEMORY: single Anthropic adapter, no SDK `.create`, no tools loop except OB-212 `executeAgentTurn`.)

---

## 4. SITE A — `AnthropicAdapter.execute()` — THE PLAN-PATH BODY (the 400 source)

`web/src/lib/ai/providers/anthropic-adapter.ts:1068–1083` (verbatim):

```ts
    const requestBody = JSON.stringify({
      // HF-304 (AUD-017): plan-interpretation tasks → Opus (structural rate-table completeness); every
      // other task keeps its configured model. Keyed on the typed task discriminant (Korean Test).
      model: PLAN_INTERPRETATION_TASKS.has(request.task)
        ? PLAN_INTERPRETATION_MODEL
        : (this.config.model || 'claude-sonnet-4-6'),
      max_tokens: request.options?.maxTokens || 8192,
      temperature: request.options?.temperature ?? 0.1,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: messageContent,
        },
      ],
    });
```

Routing constants (`anthropic-adapter.ts:29` and `:33–34`, verbatim):

```ts
const PLAN_INTERPRETATION_MODEL = 'claude-opus-4-8';
...
const PLAN_INTERPRETATION_TASKS: ReadonlySet<AITaskType> = new Set<AITaskType>([
  'plan_interpretation', 'plan_skeleton', 'plan_component', 'plan_component_with_chunking',
]);
```

**Wire body params:** `model`, `max_tokens`, `temperature`, `system`, `messages`. Headers (`:1084–1089`): `Content-Type`, `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-beta: pdfs-2024-09-25`.

**Abort behavior on 400** (`:1120–1129`, verbatim):

```ts
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      ...
      const err = new Error(`Anthropic API error: ${response.status} ${JSON.stringify(errorData)}`) as ProviderHardError;
      err.providerError = true;
      err.status = response.status;
      err.providerModel = this.config.model || 'claude-sonnet-4-6';
      throw err;
    }
```

→ A 400 here `throw`s `ProviderHardError` — the import ABORTS (no degradation). This is the exact path tonight's import died on.

## 5. SITE B — `AnthropicAdapter.executeAgentTurn()` — agent runtime body (NO temperature)

`web/src/lib/ai/providers/anthropic-adapter.ts:1184–1193` (verbatim):

```ts
    // No `temperature`: the agent model is an advertised per-agent override, and the
    // current default-tier models (Opus 4.7/4.8, Fable 5) 400 on sampling params.
    // Sonnet 4.6 (the env default) does not require it. Omitting it works across all.
    const requestBody = JSON.stringify({
      model: req.model || this.config.model || 'claude-sonnet-4-6',
      max_tokens: req.maxTokens || 4096,
      system: req.system,
      tools: req.tools,            // <-- the only behavioral delta vs execute(): tools are sent
      messages: req.messages,      // full multi-turn history (assistant + tool_result turns)
    });
```

**Wire body params:** `model`, `max_tokens`, `system`, `tools`, `messages` — **no `temperature`**. The OB-212 author already learned this lesson (comment lines 1184–1186) and omitted it here, but did NOT back-port the same omission to `execute()` (Site A). Abort-on-400: same `ProviderHardError` throw (`:1219–1226`).

---

## 6. PARAM TABLE — every request-construction site

| file:line | params sent on wire | deprecated for in-force model? | aborts on 400? | on plan path? |
|---|---|---|---|---|
| `anthropic-adapter.ts:1068` (`execute()`) | `model`, `max_tokens`, **`temperature`** (`?? 0.1`, line 1075), `system`, `messages` | **YES — `temperature` is rejected by `claude-opus-4-8`** (the model plan tasks route to via line 29/1071-1072). 400: "temperature is deprecated for this model" | YES — `throw ProviderHardError` (`:1120-1129`) | **YES — this IS the plan path** (plan_skeleton/plan_interpretation/plan_component[_with_chunking]) |
| `anthropic-adapter.ts:1187` (`executeAgentTurn()`) | `model`, `max_tokens`, `system`, `tools`, `messages` | NO — `temperature` deliberately omitted (comment :1184-1186) | YES — `throw ProviderHardError` (`:1219-1226`) | NO — OB-212 agent runtime only |

### Upstream AIRequest.options.temperature feeders (intent, not wire — all funnel into Site A line 1075)

| file:line | task | options.temperature | maxTokens | plan path? |
|---|---|---|---|---|
| `ai-service.ts:310` | `plan_interpretation` | `0` | 8192 | **YES** |
| `ai-service.ts:341` | `plan_skeleton` | `0` | 4096 | **YES — tonight's failing call** |
| `ai-service.ts:394` | `plan_component` | `0` | 8192 | **YES** |
| `ai-service.ts:434` | `plan_component_with_chunking` | `0` | 8192 | **YES** |
| `ai-service.ts:205` | (data/classify task) | `0` | default | no |
| `ai-service.ts:227` | (data/classify task) | `0` | default | no |
| `ai-service.ts:249` | (data/classify task) | `0` | default | no |
| `ai-service.ts:281` | (data/classify task) | `0` | default | no |
| `ai-service.ts:472` | (task) | `0` | 8192 | no |
| `ai-service.ts:492` | (task) | `0` | 8000 | no |
| `ai-service.ts:512` | (task) | `0` | default | no |
| `convergence-service.ts:3403` | (convergence) | `0` | 4096 | no |

All 12 of these supply `temperature: 0` in `AIRequest.options`; for the 4 plan tasks the value reaches the wire (line 1075) on an Opus body → 400. For non-plan tasks the value reaches the wire on a Sonnet body (`this.config.model || 'claude-sonnet-4-6'`) — Sonnet 4.6 currently tolerates `temperature`, so those don't 400 today, but they carry the same latent risk if env default flips to an Opus/Fable tier.

---

## 7. Definitive identification of tonight's 400

**Failing call:** `AIService.…(task: 'plan_skeleton')` at `ai-service.ts:339-341` passes `options: { …, temperature: 0 }`.

**Wire body built at:** `anthropic-adapter.ts:1068`, where:
- line 1071-1072: `PLAN_INTERPRETATION_TASKS.has('plan_skeleton')` is **true** (set membership, line 34) → `model = 'claude-opus-4-8'` (line 29).
- line 1075: `temperature: request.options?.temperature ?? 0.1` → resolves to **`0`** (the call-site value), serialized onto the Opus body **unconditionally** (no model guard).

**`temperature` is set UNCONDITIONALLY**, not guarded — line 1075 has no `if (model …)` / no spread-conditional; it always emits a `temperature` key whenever `execute()` runs. (Contrast Site B at line 1187 which simply omits the key.)

**Regression origin (git, working tree untouched):**

```
$ git show d501f97…:web/src/lib/ai/providers/anthropic-adapter.ts | grep -nE "temperature|model:"
1052:      model: this.config.model || 'claude-sonnet-4-20250514',
1054:      temperature: request.options?.temperature ?? 0.1,
```

At GOOD_SHA the body used `model: claude-sonnet-4-20250514` (which accepts `temperature`) — so the identical `temperature` line was harmless. HF-304/AUD-017 then added the Opus routing (lines 23-34, 1071-1072) for plan tasks **without** removing/guarding `temperature` on line 1075. The deprecated param + the new Opus target collided → the 400.

**Would removing it unblock plan_skeleton?** (READ-ONLY ADVISORY — not implemented.) Yes: omitting the `temperature` key from the Site-A body (as Site B already does) makes the Opus 4.8 plan body wire-legal; `temperature: 0` is deterministic-equivalent to Opus's no-sampling default, so plan_skeleton (and the other 3 plan tasks) would proceed with no behavioral change to emission determinism.

---

## 8. HALT-0 advisories (one line each, NOT implemented)

- `anthropic-adapter.ts:1075` — `temperature` is sent unconditionally on the Opus-routed plan body; omit the key (or guard it) at the CLASS level so plan_skeleton/plan_interpretation/plan_component[_with_chunking] stop hitting the 400.
- `anthropic-adapter.ts` (class) — `execute()` and `executeAgentTurn()` build TWO divergent bodies; only the latter omits `temperature`; converge them on a single body-builder so the deprecation fix lands once, not per-method.

---

## 9. Read-only advisory — removing/centralizing the deprecated param at the CLASS level

The fix must be made once, at the `AnthropicAdapter` class seam, not at any single call site: today there are two divergent body builders (`execute()` line 1068 with `temperature`, `executeAgentTurn()` line 1187 without), and twelve upstream `temperature: 0` feeders in `ai-service.ts`/`convergence-service.ts` that all funnel into the one wire serialization at line 1075 — so editing call sites is whack-a-mole while the class still emits the deprecated key. The structurally correct remediation is a single private body-builder on the class that decides sampling-param inclusion by the resolved model (the same `PLAN_INTERPRETATION_TASKS`/`PLAN_INTERPRETATION_MODEL` seam already centralizes the model choice on lines 29/33-34/1071-1072, so the class already "knows" when it is on an Opus/Fable tier that 400s on `temperature`): when the resolved model is in the sampling-param-rejecting tier, omit `temperature` (and any future `top_p`/`top_k`) entirely rather than passing `0`; otherwise pass it through. This also extinguishes the latent risk on the eleven non-plan feeders, which only avoid the 400 today because the env default is still Sonnet 4.6 — the moment that default flips to an Opus/Fable id they would all 400 identically. Because `temperature: 0` is behaviorally equivalent to the no-sampling deterministic default these tasks rely on, omission is lossless for emission determinism (Korean-Test-safe). This is advisory only; no source was modified by this audit.
