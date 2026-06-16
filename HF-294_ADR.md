# HF-294 ADR — Model-string restoration (Section B gate, committed before code)

**Decision (which string + where it resolves):**
- **Model string:** `claude-sonnet-4-6` — the current Sonnet generation, like-for-like with the sunset `claude-sonnet-4-20250514`. **Probe-confirmed 200** against the live Anthropic API (Phase 0.4), minimal and with the real adapter request shape (`temperature:0.1` + system + JSON ask).
- **Provider:** unchanged (`anthropic`).
- **Resolution sites changed (value only, not mechanism):**
  - `web/src/lib/ai/ai-service.ts:34` — the env-default the AIService singleton resolves (`process.env.NEXT_PUBLIC_AI_MODEL || <here>`). Primary.
  - `web/src/lib/ai/providers/anthropic-adapter.ts:1052` — the adapter's duplicated `this.config.model || <here>` fallback. Fixed so no dead default remains as a landmine.
  - `web/src/lib/ai/types.ts:14` — comment example (hygiene).
  - `web/src/lib/sci/header-comprehension.ts` ×4 — telemetry provenance literals (so post-fix telemetry names the live model). Hardcoding flagged as residual; not refactored (DD-7).

**Mechanism unchanged (DD-7, §6 scope boundary):** this HF changes only the *value* at the existing env→default resolution. Moving resolution to a `platform_settings`-backed config resolver, UI-driven model/provider selection, and the OpenAI adapter remain the **Model & Provider Configuration** capability (separate DS). Provider abstraction (Principle 6) held: all edits are inside `web/src/lib/ai/**` + the one telemetry label site; no feature code learns a model string; no new provider SDK.

**HALT-ENV:** `NEXT_PUBLIC_AI_MODEL` is **unset locally**, so the code default is the local source and this fix unblocks local + any environment where the var is unset. **Production Vercel must be verified by the architect:** if `NEXT_PUBLIC_AI_MODEL` is set in Vercel to the dead string, the host env overrides the code default — the architect must update it to `claude-sonnet-4-6` and redeploy. (CC cannot change host env vars.)
