# OB-199 Phase 0 — Architecture Decision Record

**Date:** 2026-05-11T02:58:02Z
**Branch:** `ob-199-canonical-signal-write-implementation`
**Base:** `main` HEAD `87477053`
**Architectural authority:** `docs/design-specifications/DS-022_Canonical_Signal_Write_Surface_v2.md` (ratified, 450 lines)
**Directive identifier mapping:** The OB-199 directive references "DS-023". The ratified specification on `main` is `DS-022_Canonical_Signal_Write_Surface_v2.md` with the §5.1–§5.7 structure the directive cites verbatim. Whenever the directive cites "DS-023 §5.X", this maps to DS-022 v2 §5.X. CC operates against DS-022 v2 as the verbatim ratified authority.
**Empirical authority:** `docs/audits/AUD-006_Signal_Write_Pipeline_Audit.md` (merged commit `87477053`, PR #384)
**IRA review:** PR #54 in `vialuce-governance` (`tier_3_novel`, $1.659135, hash `962a877f10536bb8aeaa45ceaacd031cf06e260cc73c887cb64bce93dd2931a3`)

---

## ARCHITECTURE DECISION RECORD

```
ARCHITECTURE DECISION RECORD
============================
Problem: Multi-pathway signal-write surface. Multiple writers, inconsistent
contract enforcement, asymmetric producer outputs, registry bypass.
Reference: DS-022 v2, AUD-006, AUD-001 F-002 / F-003.

Option A: One canonical writer module; all writes route through it;
  producer normalization at adapter; registry-derived identifiers;
  no clamp; row-persistence-with-null on value-failure plus observability
  signal. (DS-022 v2 §5.1–§5.5)
  - Scale test 10x: Y — single surface scales linearly
  - AI-first / no hardcoding: Y — registry-driven; Korean Test enforced
  - Transport through HTTP bodies: N/A — internal writer
  - Atomicity on failure: Y — row persists, observability signal persists,
    typed error to caller

Option B: Retain current dual architecture; add validation at each writer.
  - Scale test 10x: N — fan-out validation duplication
  - AI-first / no hardcoding: borderline — still 2 paths
  - Atomicity: N — fire-and-forget remains (AUD-001 F-003)

Option C: Writer-first (canonical writer before producer normalization).
  - REJECTED per IRA Q2 conflicts_detected (Sequence_B_writer_first):
    inverts Fix Logic Not Data; canonical writer with §5.2 enforcement
    activated before producers are normalized halts comprehension:
    plan_interpretation writes entirely (raw 95 outside [0,1]).

CHOSEN: Option A — substrate-coherent per DS-022 v2 and IRA-ranked-1.
REJECTED: Option B (scale + atomicity failures); Option C (deployment
coupling per IRA Q2).
```

---

## Substrate citations (per DS-022 v2 §3)

**Locked Decisions:**
- IGF-Decision-30-v2 — confidence convention `[0.0, 1.0]` **inclusive** bound (per IRA Q3 disposition: `confidence = 1.0` admissible)
- IGF-Decision-64-v2 — `classification_signals` singular shared surface; L1/L2/L3 partitioning
- IGF-Decision-153 — atomic cutover to signal-surface architecture
- IGF-Decision-154 — Korean Test for operations; structured failure on unrecognized identifiers
- IGF-Decision-155 — registry is the canonical declaration surface

**AUD-004 v3 substrate extensions (LOCKED 2026-04-27):**
- E1 — single canonical declaration surface
- E2 — dispatch surface integrity / structured failure
- E3 — read-before-derive structurally partitioned
- E5 — closed-loop intelligence
- E6 — Korean Test for operation vocabulary

**T1 principles:**
- IGF-T1-E902 — Carry Everything, Express Contextually (row persists; confidence reflects failure)
- IGF-T1-E905 — Prove, Don't Describe (empirical verification per phase)
- IGF-T1-E906 — Closed-Loop Intelligence
- IGF-T1-E907 — Fix Logic, Not Data (canonical writer surfaces upstream defects; does not mask them)
- IGF-T1-E910 — Korean Test
- IGF-T1-E920 — Repeated Fix Failure Is a Pattern (AUD-001 F-002 has survived two prior audit cycles)
- IGF-T1-E930 — Choose Right Over Quick

---

## Phase sequence (per IRA Q2 + DS-022 v2 §6 ordering)

IRA-recommended Sequence A modified with registry gate. The OB-199 directive renumbers DS-022 v2 §6 phases sequentially (1–6) per implementation order:

| OB-199 Phase | DS-022 v2 §6 Phase | Scope |
|---|---|---|
| Phase 1 | Phase 1 (DS) | Producer-side normalization (closes F-AUD-006-001, -003, -009) |
| Phase 2 | Phase 4 (DS) | Registry consolidation (closes F-AUD-006-005, -007) |
| Phase 3 | Phase 2 (DS) | Canonical writer entry point (closes F-AUD-006-002, AUD-001 F-002 partial, F-003) |
| Phase 4 | Phase 3 (DS) | Bypass writer migration (closes coverage-trust + AUD-001 F-002 final) |
| Phase 5 | Phase 5 (DS) | Historical row clean-slate artifact (architect-channel post-OB execution) |
| Phase 6 | Phase 6 (DS) | Trust-property verification and lock |

---

## Per-phase exit criteria summary

| Phase | Exit criteria |
|---|---|
| 1 | Producer normalization at one site; B2 dead code deleted; test green; build clean |
| 2 | Registry has `confidence_required:boolean`; `observability:write_failure` registered; `AI_TASK_LEVEL_MAP` collapsed; test green |
| 3 | `canonical-signal-writer.ts` module; §5.2 four-outcome enforcement per DS-022 v2 verbatim; clamp deleted; `signal-persistence.ts` thin-wraps canonical writer; test green |
| 4 | Every direct `.from('classification_signals').insert()` migrates to canonical writer; `signal-persistence.ts` deleted; `writeClassificationSignal` deleted; test green |
| 5 | Wipe-instructions artifact committed; CC verifies no application logic depends on wipe execution |
| 6 | Three trust-property verifications pass (value, identity, coverage); continuity-trust deferred to post-wipe; completion report committed; PR opened |

---

## Divergence notes (CC must surface to architect)

### Divergence 1 — Directive vs DS on `missing-required` outcome (RESOLVED 2026-05-11 by architect)

The OB-199 directive Phase 3 step 2 enumerates four §5.2 outcomes:
> - In-range → persist as asserted
> - Out-of-range → persist row with `confidence = null` + emit `observability:write_failure`
> - **Missing-where-required → persist row with `confidence = null` + emit `observability:write_failure`**
> - Missing-where-optional → persist with `confidence: null`; no failure signal

The DS-022 v2 §5.2 verbatim text (lines 173–177) differs on `missing-required`:
> - **Confidence missing where required:** typed error class thrown to caller; signal row NOT persisted; producer must remediate and retry. (This case differs from out-of-range because there is no producer assertion at all.)

**Architect resolution (2026-05-11):** DS-023 §5.2 is operative; row persists with `confidence = null` + `observability:write_failure` signal on missing-required (same outcome as out-of-range). Implement per DS-023 §5.2 verbatim as paraphrased in the OB-199 directive. (Note: directive references "DS-023" — file on `main` is `DS-022_Canonical_Signal_Write_Surface_v2.md`; the renumbering is an architect-channel artifact not yet propagated to the file name. Substantive spec is identical.)

**Implementation:** missing-required outcome = persist row with `confidence = null` + emit `observability:write_failure` signal. T1-E902 (Carry Everything) honored for both out-of-range and missing-required.

### Divergence 2 — `observability:write_failure` vs DS-suggested `cost:event` (RESOLVED 2026-05-11 by architect)

The OB-199 directive Phase 2 step 3 instructs registering a new `observability:write_failure` signal_type.

DS-022 v2 §5.2 lines 175 says the structured-failure signal is emitted "to `classification_signals` with signal_type `cost:event` (or a registered observability signal_type)" — i.e., DS-022 v2 admits both options.

**Architect resolution (2026-05-11):** `observability:write_failure` is operative. DS-022 v2 admits this as the second option; no contradiction. Registered in Phase 2 step 3.

### Divergence 4 — AUD-006 §1.1 writer inventory incomplete (DISCOVERED Phase 4 step 1; RESOLVED Path (c) by architect 2026-05-11)

Phase 4 step 1 inventory grep returned **5 call sites NOT in the directive's expected list** (which mirrored AUD-006 §1.1 writer enumeration):

1. `web/src/lib/ai/training-signal-service.ts:126` — `recordOutcome()` writes `lifecycle:outcome` with literal `confidence: wasCorrect ? 1.0 : 0.0`. Signal_type was unregistered pre-Phase-2 (fired `[SignalRegistry] not registered` soft-warn).
2. `web/src/app/api/intelligence/converge/route.ts:95` — `writeClassificationSignal()` caller
3. `web/src/app/api/intelligence/converge/route.ts:120` — `writeClassificationSignal()` caller
4. `web/src/app/api/import/sci/process-job/route.ts:354` — `writeClassificationSignal()` caller
5. `web/src/app/api/import/sci/analyze/route.ts:475` — `writeClassificationSignal()` caller

AUD-006 §1.1 enumerated the bypass at `sci/classification-signal-service.ts:91` (the function declaration / insert body) but did not enumerate the 4 call sites of that function. The `lifecycle:outcome` writer was likewise omitted from the AUD-006 §1.1 enumeration.

**Architect resolution (2026-05-11): Path (c) — expand Phase 4 inventory to 19 sites.**

Sub-action: retroactive Phase 2 registry add of `lifecycle:outcome` with `confidence_required: true` (writer asserts literally `1.0` or `0.0` — always present, never null at the call site). Committed as `a510542b` ("OB-199 Phase 2 retroactive: register lifecycle:outcome").

Phase 4 proceeds at full 19-site scope. Coverage-trust property closes fully. `signal-persistence.ts` and `writeClassificationSignal` both delete at Phase 4 close as originally specified.

### Divergence 3 — AUD-006 §2.4 dead-code claim partially incorrect (DISCOVERED Phase 1 step 5; RESOLVED Option (b) by architect)

AUD-006 §2.4 grep filter `grep -v "ai-plan-interpreter.ts"` excluded the host file from the dead-code verification, hiding an internal call inside `bridgeAIToEngineFormat`. B2 normalization (`AIPlainInterpreter.validateAndNormalize` via the public wrapper `validateAndNormalizePublic`) IS reachable via the rule_set engineFormat path:

```
app/api/import/sci/execute/route.ts:1273  (and :1527, parallel single-unit path)
  → bridgeAIToEngineFormat(rawResult, ...)
    → ai-plan-interpreter.ts:587: interpreter.validateAndNormalizePublic(rawResult)
      → AIPlainInterpreter.validateAndNormalizePublic
        → AIPlainInterpreter.validateAndNormalize (calls normalizeConfidence at lines 213 + 262)
```

The `comprehension:plan_interpretation` emitter path noted in AUD-006 §6.1 (uses `response.result` raw, NOT routed through `bridgeAIToEngineFormat`) still bypasses B2 — that part of AUD-006 stands. But the broader "zero callers" verdict was incorrect.

**Architect disposition: Option (b) — refactor `bridgeAIToEngineFormat` to drop the class indirection.**

Implementation:
1. Extract `validateAndNormalize` body as a standalone exported function `validateAndNormalizePlanInterpretation(rawResult: unknown): PlanInterpretation` in `ai-plan-interpreter.ts`.
2. Update `bridgeAIToEngineFormat` (line 587) to call the standalone function directly: `const normalized = validateAndNormalizePlanInterpretation(rawResult);`
3. Delete `AIPlainInterpreter` class entirely (including `validateAndNormalizePublic`, `interpretPlan`, `getAIInterpreter` factory).
4. Delete `normalizeConfidence` method; replace its call sites with direct `Number(...)` reads (values arrive ratio-form post-Phase-1 producer normalization at the adapter — no transformation needed).

**Substrate-coherent outcome:** single producer-side normalization site at `anthropic-adapter.ts` per DS-023 §5.4; two downstream consumers (emitter path + `bridgeAIToEngineFormat` path) both receive ratio-form values from one source. B2 logic deleted with confidence (no path orphaned).

---

## Open follow-on items deferred to post-OB-199 architect-channel action

Per directive Standing Halt Conditions + DS-022 v2 scope:
1. Production database wipe per Phase 5 artifact — architect executes; closes F-AUD-006-006
2. Post-wipe continuity-trust verification — closes DS-022 v2 §4.4
3. F-AUD-006-008 (other prompt templates retain 0-100) — separate work
4. F-AUD-006-010 (UI display drift) — separate work
5. DS-022 v2 §8 Clarification 2 (canonical writer ↔ N3 SCI emission compatibility verification) — non-blocking per IRA Q4

---

## At-close verification

- ☑ Branch `ob-199-canonical-signal-write-implementation` created from `main` HEAD `87477053`
- ☑ DS-023 vs DS-022 v2 identifier mismatch documented
- ☑ Divergence 1 (missing-required outcome) RESOLVED 2026-05-11 — DS-023 §5.2 paraphrase operative; row persists with null + observability signal
- ☑ Divergence 2 (`observability:write_failure` vs `cost:event`) RESOLVED 2026-05-11 — observability signal_type operative
- ☑ Divergence 3 (AUD-006 §2.4 grep blind-spot) RESOLVED 2026-05-11 — Option (b) extract standalone function + delete class
- ☑ Divergence 4 (AUD-006 §1.1 writer inventory incomplete; 5 additional sites) RESOLVED 2026-05-11 — Path (c) expand Phase 4 inventory to 19 sites + retroactive Phase 2 register lifecycle:outcome
- ☑ ADR committed as Phase 0 first commit; amended for Phase 1 step 5 disposition + Phase 4 step 1 disposition
