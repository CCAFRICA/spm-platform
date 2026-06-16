# HF-294 Phase 0 — Findings (read-only: locate resolution site + probe replacement)

**Date:** 2026-06-15 · **Branch:** `hf-294-model-string-sunset` (off `main` 1dae916e) · No code changed in Phase 0.

## 0.1 — Resolution site (pasted)

`web/src/lib/ai/ai-service.ts:33-34` (construction — provider + model resolution):
```ts
provider: (process.env.NEXT_PUBLIC_AI_PROVIDER as AIProvider) || 'anthropic',
model: process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-20250514',
```

`web/src/lib/ai/providers/anthropic-adapter.ts:1052` (adapter's own fallback default — duplicated):
```ts
model: this.config.model || 'claude-sonnet-4-20250514',
```

`web/src/lib/ai/ai-service.ts:71-90` (the graceful-degradation `catch` in `execute` — **Phase 2 edit site**):
```ts
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.warn(`[AIService] ${request.task} failed: ${errorMessage}`);
  return {
    task: request.task,
    result: { error: errorMessage, fallback: true, confidence: 0 },
    confidence: 0,
    tokenUsage: { input: 0, output: 0 },
    requestId, provider: this.config.provider, model: this.config.model,
    latencyMs: Date.now() - startTime, timestamp: new Date().toISOString(),
  };
}
```

The adapter throws the provider hard-error here (`web/src/lib/ai/providers/anthropic-adapter.ts:1090-1097`):
```ts
if (!response) {
  throw new Error(`Anthropic API fetch failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}
if (!response.ok) {
  const errorData = await response.json().catch(() => ({}));
  throw new Error(`Anthropic API error: ${response.status} ${JSON.stringify(errorData)}`);
}
```

## 0.2 — Every occurrence of the dead string, dispositioned (DD-1)

```
$ grep -rn "claude-sonnet-4-20250514" web/src web/scripts web/.env*
web/src/lib/ai/ai-service.ts:34                       <- CODE DEFAULT  (primary fix, Phase 1)
web/src/lib/ai/providers/anthropic-adapter.ts:1052    <- CODE DEFAULT  (duplicated fallback; fix, Phase 1)
web/src/lib/ai/types.ts:14                            <- COMMENT example (update for hygiene)
web/src/lib/sci/header-comprehension.ts:184          <- TELEMETRY provenance label `llmModel:` (not a call site)
web/src/lib/sci/header-comprehension.ts:253          <- TELEMETRY provenance label
web/src/lib/sci/header-comprehension.ts:391          <- TELEMETRY provenance label
web/src/lib/sci/header-comprehension.ts:430          <- TELEMETRY provenance label
web/scripts/ob88-mission1-plan-import.ts:232         <- diagnostic SCRIPT (not production path)
web/scripts/ob88-mission2-data-import.ts:133         <- diagnostic SCRIPT
web/scripts/ob154-import-plan-direct.ts:85           <- diagnostic SCRIPT
web/scripts/ob155-test-ai-call.ts:22                 <- diagnostic SCRIPT
(no occurrence in web/.env.local or web/.env)
```
- **Call sites (drive the API request):** the two CODE DEFAULTS only. Both fixed in Phase 1.
- **Telemetry labels:** `header-comprehension.ts` writes the model name into provenance metadata as a hardcoded literal (independent of the resolved model). Updated to the new string in Phase 1 so telemetry stops naming a sunset model; the *hardcoding* (should read the resolved model) is flagged as a residual, not refactored (DD-7).
- **Comment:** `types.ts:14` example string — updated for hygiene.
- **Scripts:** standalone diagnostics, outside the AIService seam (Principle 6). Not changed in this HF; flagged.

## 0.3 — Production resolution source

- `NEXT_PUBLIC_AI_MODEL` / `NEXT_PUBLIC_AI_PROVIDER` are **NOT set in `web/.env.local`** → locally, the **code default** is the resolution source (this is the dead string).
- The dead string is **not committed** in `web/.env` / `web/.env.local`.
- **Production (Vercel) env state cannot be read from this environment.** If `NEXT_PUBLIC_AI_MODEL` is set in Vercel to the dead string, the code-default fix alone will not unblock production → **HALT-ENV** applies (architect verifies/updates Vercel; see Phase 1.2). If it is unset in Vercel (mirroring local), the code-default fix unblocks production on redeploy.

## 0.4 — Replacement probe (live API, `scripts/hf294_probe_model.ts`)

```
API key present: true
[candidate-minimal claude-sonnet-4-6]            HTTP 200 model=claude-sonnet-4-6 hasText=true (1321ms)
[dead-string claude-sonnet-4-20250514]           HTTP 404 error=not_found_error hasText=false (148ms)
[candidate-adapter-shape claude-sonnet-4-6]      HTTP 200 model=claude-sonnet-4-6 hasText=true (1927ms)
```
- Candidate **`claude-sonnet-4-6`** returns **200** (minimal AND with the real adapter request shape: `temperature:0.1` + system + JSON ask → no 400, real text returned) → **ACCEPTED** for Phase 1. HALT-PROBE not triggered.
- The dead string reproduces the production **404 not_found_error** → confirms the defect.

## Gate dispositions
- **HALT-0:** dead string dispositioned cleanly (2 call-site defaults to fix; telemetry/comment/scripts noted). The adapter's duplicated default (`:1052`) is a latent dead default → fixed in Phase 1 (not left as a landmine).
- **HALT-PROBE:** cleared (`claude-sonnet-4-6` = 200).
- **HALT-ENV:** local env unset (code default is the source); **production Vercel `NEXT_PUBLIC_AI_MODEL` must be verified by the architect** — flagged in the ADR/Phase 1.2 and the completion report.
