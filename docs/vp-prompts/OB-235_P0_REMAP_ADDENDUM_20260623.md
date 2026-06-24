# OB-235 — P0 Re-Map Addendum (extend-in-place; zero-new-surfaces; HOLD for ratification)

**Disposition applied:** EXTEND, full functionality, no reduction. Where the directive's literal file plan names a module that would duplicate live infrastructure, the live infrastructure is extended (G7 / AP-17); the deviation from literal file-ownership is documented here and will be repeated in the completion-report ADR. **Tier-1 is HELD pending architect ratification of this addendum — and of the P1 HALT-FORK below.**

---

## ⚠ HALT-FORK (P1) — locked-vs-locked: DS-022 "register + fail-on-unregistered" vs HF-219/AP-26 "registry eradicated"

The directive's P1 (DS-022 v2 Phase 1) requires the canonical writer to *"validate `signal_type` against the registered set and raise a structured failure on an unregistered type (G6)"*, and the ZERO-NEW-SURFACES attestation requires *"the new kind is registered in the existing registry."*

**The live `web/src/lib/intelligence/canonical-signal-writer.ts` has no registry — it was deliberately removed:**
- L43-44: *"HF-219 Disposition 5: signal-registry eradicated. Open-vocabulary signal_types. Emission is unconditional on signal_type string."*
- L151: *"HF-219: signal-registry eradicated. signal_type is no longer gated by registration."*
- L276-277: *"signal_type emission is unconditional. No registration gate. Per AP-26: closed-vocabulary signal registries violate the adaptive-intelligence moat."*
- (The `'unregistered_signal_type'` error *kind* still appears in a header comment + the cause union — **vestigial**; `validateSignal` gates only `confidence`, not `signal_type`.)

**AP-26 is a standing rule** (`CC_STANDING_ARCHITECTURE_RULES.md`): *"Closed-vocabulary signal registries / register-then-emit gates → signal_types are open-vocabulary strings; emitters produce freely without prior registration… registries that require developer action before novel signals can flow violate the adaptive intelligence moat."*

So building P1's registration gate would **revert HF-219 Disposition 5 and violate AP-26**. DS-022 Phase 1 (register) and HF-219/AP-26 (open-vocabulary) are both locked and in direct conflict — a genuine supersession fork, not an implementation choice.

**Disposition required (architect):**
- **(i) Recommended — honor AP-26/HF-219:** drop the registration *gate*. P1 still delivers full functionality: the **one** canonical writer (G7), all ~10 bypass writers routed through it, single-site confidence normalization. `surface_binding_recognition` flows freely (open-vocabulary) — no registration needed, no second surface. This is *more* compliant (one surface **and** no registry). PG-1's "structured failure on an unregistered type" is replaced by "structured failure on out-of-range confidence" (the gate that does exist) + the bypass-grep=0 proof.
- **(ii) Supersede HF-219** to reinstate a structural-kind registry (would need an IRA; contradicts a standing rule).

I recommend (i). **No P1 code is written until this is dispositioned.** Everything below assumes (i); if (ii), the attestation #1 wording stands and P1 adds a structural-kind registry.

---

## Item 1 — Corrected phase implementation (no functionality reduced)

| Phase | Implementation | Functionality (UNREDUCED) |
|---|---|---|
| **P1** | **EXTEND-LIVE** `canonical-signal-writer.ts` | Route ALL ~10 bypass writers through the one writer (full DS-022 Phase-1 *closure*, not partial); confirm/extend single-site confidence normalization. **Registration gate: HALT-FORK (above).** |
| **P2** | **NEW-BEHAVIOR** | learner spine (matcher + learner-core + store-adapter), scope/store-generic, reusing live fingerprint primitives — not re-implementing them. |
| **P3** | **NEW-BEHAVIOR** + additive edit to live `comprehension-generator.ts` | comprehension recall (confirmed absent today); warm pass skips the LLM (total-call counter incl. coverage-retry + label/method call → 0). Full recall, byte-identical reuse. |
| **P4** | **EXTEND-LIVE** `synaptic-surface.ts` + `run/route.ts` | Reconnect execution-mode **action (b)** so the mode actually GATES the loop (trace verbosity only) and shifts T₂<T₁; align EMA to the spec formula. **Math-neutral (HALT-CALC).** Not "getExecutionMode exists, done." |
| **P5** | **EXTEND-LIVE** `flywheel-pipeline.ts` | See live-vs-gap below. Verify-AND-extend; cold-start prior loading proven; any learner-core field the aggregation doesn't yet emit is built. |
| **P-EXP** | **NEW-BEHAVIOR** + additive miss-path edit to live `surface-binding-recognition.ts` | cross-tenant binding inheritance: discounted (×0.6) prior **verified against the receiving tenant's own comprehension**; receiving recognition overrides on mismatch; writes back to `surface_bindings` (existing store). HF-337 PG-PATHA re-proven. |
| **P6** | **NEW-BEHAVIOR** | correction propagation → comprehension_artifacts + foundational/domain (via P5) + **invalidate/refresh surface_bindings** referencing the corrected field. Multiplier-of-FIVE. |
| **P7** | **NEW-BEHAVIOR** + additive edit to convergence service | convergence reads Level-2 comprehension signals before the independent AI call. |
| **P8** | **NEW-BEHAVIOR** | recognition-curve Observatory surface (read-only). |
| **P9** | **EXTEND-LIVE** live import + calc routes | integration; end-to-end proof (unreduced — five measurements on Sabor AND BCL). |

**P5 live-vs-gap (explicit, per the no-reduction mandate):**
- **LIVE + complete:** `aggregateFoundational`→`foundational_patterns`, `aggregateDomain`→`domain_patterns` (fired by `postConsolidationFlywheel`, L307-315); **privacy firewall already honored** — header L9/L11 + the write rows carry only `pattern_signature, confidence_mean/variance, total_executions, tenant_count, anomaly_rate_mean, learned_behaviors` (no tenant_id/entity_id/raw values); `loadColdStartPriors` (L217); `COLD_START_DISCOUNT = 0.6` (L272); `applyPriorsToEmptyDensity` (L278).
- **GAP OB-235 builds (not waived):** (a) prove cold-start at first encounter loads a prior at confidence > 0.5 with fewer full_trace ops (PG-5 — requires a fresh/Nuclear-Cleared pattern run); (b) confirm `learned_behaviors` carries every structural field the P2 learner-core consumes, and **extend** the aggregation to emit any missing field; (c) confirm the cold-start path is reached on the live calc cold path (P0.3 traced it via `agent-memory.ts` — verify end-to-end). Any gap found is built, not skipped.

---

## Item 2 — Per-phase file ownership (every module classified; none forbidden)

| Phase | EXTEND-LIVE (edited) | NEW-BEHAVIOR (new module) | Forbidden re-impl? |
|---|---|---|---|
| P1 | `lib/intelligence/canonical-signal-writer.ts` (+ registry decision); ~10 bypass call sites (1-line routing each) | — | NONE (no second writer; the directive's `lib/signals/canonical-signal-writer.ts` is **NOT created** — would be a 2nd surface) |
| P2 | — | `lib/learning/{structural-fingerprint-matcher,learner-core,learn-store}.ts` | NONE (new contract; reuses live fingerprint/pattern primitives) |
| P3 | `lib/summary/comprehension-generator.ts` (recall seam); `lib/ai/anthropic-stream.ts` (call counter) | `lib/learning/{comprehension-recall, stores/comprehension-store, instrumentation/comprehension-timing}.ts` | NONE |
| P4 | `lib/calculation/synaptic-surface.ts`; `app/api/calculation/run/route.ts` (mode-gate in loop) | — (extend live synaptic machinery; **no** parallel `synaptic-density-store.ts`) | NONE |
| P5 | `lib/calculation/flywheel-pipeline.ts` (extend); the cold-start path | — (**no** parallel `lib/learning/flywheel/*`) | NONE |
| P-EXP | `lib/comprehension/surface-binding-recognition.ts` (additive miss-path) | `lib/learning/expression/binding-inheritance.ts` | NONE (writes to existing `surface_bindings`; **no** new inheritance store) |
| P6 | — | `lib/learning/correction-consumer.ts` | NONE (writes existing stores) |
| P7 | convergence service (additive read) | `lib/learning/convergence-recall.ts` | NONE |
| P8 | Observatory registration | `app/api/observatory/recognition-curve/route.ts`; `components/observatory/RecognitionCurvePanel.tsx` | NONE |
| P9 | live import route; live calc route | — | NONE |

Every NEW module is genuinely-new BEHAVIOR. No module re-implements a live writer, store, or flywheel.

---

## Item 3 — ZERO-NEW-SURFACES ATTESTATION (four explicit PASSes)

1. **Zero new canonical signal surfaces — PASS.** Every signal write (incl. `surface_binding_recognition`) routes through the one live `lib/intelligence/canonical-signal-writer.ts`. The ~10 current bypass direct-inserts are *repointed to it* (they are the violation P1 closes), not joined by an 11th. No second writer, no private channel, no JSONB side-channel (the `plan_agent_seeds` pattern is neither introduced nor extended). *Caveat:* "registered in the existing registry" is **not literally possible** — HF-219 eradicated the registry (open-vocabulary). The one-surface guarantee holds and is *stronger* (one surface + no registry); the registration wording is the HALT-FORK. A new kind is not a new surface.
2. **Zero duplicate stores — PASS.** comprehension_artifacts / synaptic_density / foundational_patterns / domain_patterns / surface_bindings are each EXTENDED. P-EXP writes inherited bindings to `surface_bindings` (the receiving tenant's own row), not to any new inheritance store. P6 writes corrections to those same stores.
3. **Zero duplicate flywheel — PASS.** Foundational/domain aggregation EXTENDS `lib/calculation/flywheel-pipeline.ts`. No `lib/learning/flywheel/*` parallel is created.
4. **New modules = new behavior only — PASS.** Item 2's table classifies every module; the new `lib/learning/*` are learner-spine / comprehension-recall / binding-inheritance-verifier / correction-propagation / convergence-recall / recognition-curve — new behavior. None re-implements live infra.

---

## Item 4 — Re-checked Tier-1 topology (re-tiered for shared-file safety; scope unchanged)

Under extend-in-place, **P4 and P5 edit the live calc subsystem** (`run/route.ts`, `synaptic-surface.ts`, `flywheel-pipeline.ts`) — they cannot be file-disjoint worktrees in the same concurrent wave. The five-way concurrent wave **does not hold**; re-tiered (no scope reduction — re-tiering is a file-safety measure):

- **Tier-1a — CONCURRENT (file-disjoint NEW-behavior + additive edits to *distinct* live files):** **P3** (`comprehension-generator.ts`), **P7** (convergence service), **P-EXP** (`surface-binding-recognition.ts`). Each touches a different live file + its own new modules → genuinely concurrent, no collision. (P2 precedes them, sequential, as the shared spine.)
- **Tier-1b — SEQUENTIAL (shared live calc subsystem):** **P4 → P5**. P4 edits `run/route.ts` + `synaptic-surface.ts`; P5 edits `flywheel-pipeline.ts` (whose `postConsolidationFlywheel` is *called from* `run/route.ts`). Sequential P4→P5 avoids a calc-route collision and keeps the call-site/signature in sync. Done inline (max-effort P4; HALT-CALC discipline) rather than as racing worktrees.
- **Merge-order (confirmed):** **P-EXP merges before P9** — `surface-binding-recognition.ts` is touched by P-EXP (additive miss-path) and by P9 (confirm live call sites use it); no other phase touches it. P4/P5 land before P9 (P9 wires the live routes that P4 already edited — P9 confirms + integrates).
- **Tier-2 — SEQUENTIAL after Tier-1 merges:** **P6** (operates on P5's `foundational_patterns` + P-EXP's `surface_bindings`; PG-6 measures their outputs).
- **Then:** P8 → P9.

Net order: P1 → P2 → [Tier-1a {P3 ∥ P7 ∥ P-EXP}] + [Tier-1b {P4 → P5}] → P6 → P8 → P9. (Tier-1a and Tier-1b may overlap in wall-clock since they share no files; Tier-1b is internally sequential.)

---

## Item 5 — Adjusted PG-1 / PG-4 / PG-5 (prove the closed loop against live infra)

- **PG-1 (adjusted for HALT-FORK disposition (i)):** `git diff` shows all ~10 bypass writers now route through the one canonical writer; bypass grep (`\.from('classification_signals').insert` outside the canonical module) = **0**; single-site confidence normalization shown; a pasted test of **structured failure on out-of-range confidence** (the gate that exists post-HF-219). If disposition (ii): add the structural-kind registry + the unregistered-type structured-failure test as originally specified.
- **PG-4:** `getExecutionMode` now **gates the entity loop** (not just computed post-run) — pasted diff of the in-loop gate; the execution-mode distribution shows run-2 shifts toward silent; **T₂ < T₁**; `entity_period_outcomes` **bit-identical** run-1 vs run-2 (row-count + checksum / zero-diff). Internal consistency only.
- **PG-5:** the live flywheel **verified** (foundational+domain aggregation rows; structural-only firewall — the HALT-CROSSFLOW grep = 0) **AND extended** where the gap (Item 1) required; **cold-start proven** — a fresh/Nuclear-Cleared pattern loads a prior at first encounter (confidence > 0.5, via `COLD_START_DISCOUNT`), with fewer full_trace ops than a true cold baseline.

Other gates (PG-2, PG-3, PG-EXP, PG-6, PG-7, PG-8, PG-9) stand as written.

---

## Invariants reaffirmed
G7 (one canonical surface — extend), AP-17 (no duplicate paths), AP-26/HF-219 (open-vocabulary signals — the P1 fork), C6/HALT-CALC (the (b) gate is math-neutral; calc reader / `lib/calculation/` math / convergence-service / `committed_data.metadata.field_identities` untouched except the additive trace-gate), Korean Test / No-Fixed-Taxonomy (structural features, grep-verified), HALT-REGISTRY (P-EXP keys on the structural fingerprint), HALT-CROSSFLOW (structural-only cross-tenant writes — already honored live), HALT-SURFACE, HALT-RESYNC.

**HOLD: Tier-1 not begun. Awaiting architect ratification of this addendum + the P1 HALT-FORK disposition.**
