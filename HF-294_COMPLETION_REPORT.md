# HF-294 — Completion Report: Restore AI Imports (sunset model 404) + AUD-009 loud-failure closure

**Date:** 2026-06-15 · **Branch:** `hf-294-model-string-sunset` (off `main` 1dae916e) · **Commits:** Phase 0 `8edcc85a` · Phase 1 `925cba74` · Phase 2 `1b597894` · Phase 3 (this report) below.
**Model:** `claude-sonnet-4-20250514` (sunset, 404) → `claude-sonnet-4-6` (probe-confirmed 200). Provider unchanged (`anthropic`).
**Branch note:** PR is `hf-294-model-string-sunset → main`, **not** `dev`. `origin/dev` is **351 commits behind main, 0 ahead** (stale); basing a hotfix on it would regress the tree. Hotfix branched off current main per the prior clean-base handoff.

---

## EPG-0 — Resolution site located + replacement probed (Phase 0)
See `HF-294_PHASE0_FINDINGS.md` (committed). Summary: dead string resolves from the **code defaults** `ai-service.ts:34` and `anthropic-adapter.ts:1052` (`NEXT_PUBLIC_AI_MODEL` unset locally). Probe (`scripts/hf294_probe_model.ts`, live API):
```
[candidate-minimal claude-sonnet-4-6]       HTTP 200 model=claude-sonnet-4-6 hasText=true
[dead-string claude-sonnet-4-20250514]      HTTP 404 error=not_found_error  hasText=false
[candidate-adapter-shape claude-sonnet-4-6] HTTP 200 model=claude-sonnet-4-6 hasText=true
```
**HALT-PROBE cleared** (candidate 200, minimal + real adapter shape). **HALT-0** clean (every dead-string hit dispositioned).

## EPG-1 — Instance fix → imports restored (Phase 1)
Diff (`git diff --stat`, src): `ai-service.ts` (default), `anthropic-adapter.ts` (duplicated default), `types.ts` (comment), `header-comprehension.ts` (4 telemetry labels). Dead string now **absent from `web/src`** (remains only in `scripts/`, intentionally — flagged).

**Live proof through the real adapter code** (`scripts/hf294_verify.ts`):
```
--- (2) adapter on claude-sonnet-4-6 (expect confidence > 0) ---
  result.confidence=0.82 task=file_classification resultKeys=fileType,suggestedModule,parseStrategy,confidence,reasoning
```
A novel `Cuotas`-shaped sheet now returns **confidence 0.82** (contrast the pre-fix `avgConf=0.00 cols=0`). This is the AIService call the SCI import invokes; the literal MIR `Cuotas`/`Nómina` *UI* import (source workbook + dev server + auth) is the architect's in-product confirmation — the code-level substance is proven here. **HALT-1 not triggered** (non-zero confidence achieved).

## EPG-2 — AUD-009 class closure: provider hard-error is loud + distinguishable (Phase 2)
One general guard (not a 404 catalog): the adapter tags any provider hard-failure (non-2xx HTTP, or connectivity failure after retries) as `ProviderHardError {providerError, status, providerModel}`; the AIService catch logs at **ERROR** and marks the degraded response, while leaving the recoverable/low-confidence path unchanged.

**Loud-failure + distinguishability proof** (`scripts/hf294_verify.ts`, real code end-to-end):
```
--- (1) adapter tagging on dead model ---
  caught: providerError=true status=404 providerModel=claude-sonnet-4-20250514
--- (3) AIService catch tagging ---
[AIService] PROVIDER HARD-ERROR on file_classification: Anthropic API error: 404 {"type":"error",...not_found_error...} (model=claude-sonnet-4-20250514, class=provider_http_404)
  [dead]  result.providerError=true errorClass=provider_http_404 confidence=0
  [good]  result.providerError=(absent)  confidence=0.82
```
- **Loud:** an `error`-level log naming the model + class on the hard-failure.
- **Distinguishable:** the dead path carries `providerError:true`; a genuine success/low-confidence path has **no** `providerError`. Separable.
- **Behavior-preserving / non-regression (3.2.3):** still returns the degraded zero-confidence response; consumers read `result.parseError|error|fallback|confidence` only (grep-verified — none branch on `providerError`), so control flow is unchanged. `AIResponse.result` is `Record<string, unknown>` → new fields are type-safe. **HALT-DEGRADE not triggered.**

## EPG-3 — End-to-end verification (Phase 3)
- **Build:** `npm run build` → `BUILD_EXIT=0`, `✓ Compiled successfully`.
- **tsc:** `npx tsc --noEmit` → **0 errors**.
- **Progressive Performance intact:** the fix is value-only at the cold-start (Tier 3) resolution; Tier 1 fingerprint matches still skip the LLM (unchanged code path) — the import-log Tier-1 confirmation (`LLM skipped — Tier 1 match`) is the architect's in-product check on the live MIR import.

---

## ARCHITECT ACTIONS (the one architect-only action + an in-product confirmation)
- **HALT-ENV (must verify):** `NEXT_PUBLIC_AI_MODEL` is unset locally, so the code-default fix unblocks local + any env where the var is unset. **If Vercel has `NEXT_PUBLIC_AI_MODEL` set to the dead string, the host env overrides the code default** — update it to `claude-sonnet-4-6` in Vercel and redeploy. CC cannot change host env.
- **In-product MIR import (optional confirmation):** re-run the failed MIR import (`Cuotas`/`Nómina`) against the deploy to see `llmCalled=true, confidence>0` in the live log; the code-level equivalent is proven above.

## ARTIFACT SYNC
```
ARTIFACT SYNC
MC: HF-294 model-string restoration COMPLETE on branch hf-294-model-string-sunset
    (Phase0 8edcc85a / Phase1 925cba74 / Phase2 1b597894). claude-sonnet-4-20250514
    (404 sunset) -> claude-sonnet-4-6 (probe 200). NEW determination item: "Is PDR-10
    (systemic 0% confidence) provider-call failures degrading silently? — check whether
    the model sunset / provider faults predate the PDR-10 reports; Phase 2 now makes the
    class distinguishable (providerError + errorClass + ERROR log)."
REGISTRY: AI-surface capability — novel-structure recognition restored
    (AIService.execute -> confidence 0.82 on a novel sheet, real-code verified);
    provider hard-errors now LOUD + TAGGED (AUD-009 class closure).
R1: any User-Ready criterion gated on AI import succeeding — unblocked pending the
    Vercel env verification (HALT-ENV) + redeploy.
BOARD: if an AI-import lane was red on this 404, re-derive after redeploy.
SUBSTRATE: AUD-009 exercised (class-layer closure, single general loud guard — not a
    404 catalog); Provider abstraction held (edits inside web/src/lib/ai/** + telemetry
    label site; no feature code learns a model string; no new SDK); Progressive
    Performance Tier-3 cold-start restored. Candidate ICA: "a provider hard-failure must
    never share the response shape of legitimate low confidence" — standing invariant.
```

## RESIDUALS (named)
- **Pinned-string sunset will recur** — `claude-sonnet-4-6` is like-for-like, not a permanent guard. UI/config-driven selection + a pinned-vs-alias decision is the DS (§6, out of scope).
- **`NEXT_PUBLIC_AI_MODEL` is client-exposed** though AI calls are server-side — flagged for the DS to make model/provider config server-only + `platform_settings`-backed.
- **Telemetry `llmModel` is still hardcoded** in `header-comprehension.ts` (now the live string, but it should read the *resolved* model) — flagged for the config-resolver DS; not refactored here (DD-7).
- **Diagnostic scripts** (`ob88-*`, `ob154-*`, `ob155-test-ai-call.ts`) still carry the dead string — out of the AIService seam (Principle 6); not changed.
- **In-product visibility** of a provider failure (red health state a human sees) is the AI Substrate panel (OB-212 §3.1.H / DS) — this HF makes the failure honest (loud + tagged), not yet visible in-product.
- **PDR-10 determination open** — now decidable with the distinguishable signal (MC item).
- **Sequence number** — confirmed: HF-293 was the prior highest; HF-294 = +1.
- **Operational note** — build was run at the Phase-3 gate (not after every commit) due to environment cost; substantive verification (live probe + real AIService end-to-end + build + tsc) is complete.
```
