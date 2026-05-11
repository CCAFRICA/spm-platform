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

### Divergence 1 — Directive vs DS on `missing-required` outcome

The OB-199 directive Phase 3 step 2 enumerates four §5.2 outcomes:
> - In-range → persist as asserted
> - Out-of-range → persist row with `confidence = null` + emit `observability:write_failure`
> - **Missing-where-required → persist row with `confidence = null` + emit `observability:write_failure`**
> - Missing-where-optional → persist with `confidence: null`; no failure signal

The DS-022 v2 §5.2 verbatim text (lines 173–177) differs on `missing-required`:
> - **Confidence missing where required:** typed error class thrown to caller; signal row NOT persisted; producer must remediate and retry. (This case differs from out-of-range because there is no producer assertion at all.)

**CC operates against DS verbatim:** missing-where-required throws typed error and does NOT persist the row. The directive's paraphrase appears to predate or simplify DS-022 v2 §5.2 CHANGE 2 ("row-persistence vs confidence-rejection distinction"). DS-022 v2 §5.2 explicitly distinguishes the two cases: out-of-range = producer-asserted-but-invalid (persist row with null + emit signal, T1-E902 honored); missing-required = no producer assertion (throw, row not persisted — producer surface is broken upstream).

**Disposition:** CC implements per DS verbatim. Documented here for architect review.

### Divergence 2 — `observability:write_failure` vs DS-suggested `cost:event`

The OB-199 directive Phase 2 step 3 instructs registering a new `observability:write_failure` signal_type.

DS-022 v2 §5.2 lines 175 says the structured-failure signal is emitted "to `classification_signals` with signal_type `cost:event` (or a registered observability signal_type)" — i.e., DS-022 v2 admits both options.

**CC follows the directive:** registers `observability:write_failure` as a new signal_type (preferred per directive Phase 2 step 3). DS-022 v2 admits this; no contradiction.

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
- ☑ Divergence 1 (missing-required outcome) flagged for architect review
- ☑ Divergence 2 (`observability:write_failure` vs `cost:event`) flagged as DS-admitted option
- ☑ ADR committed as Phase 0 first commit
