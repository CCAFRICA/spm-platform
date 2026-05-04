# ARCHITECTURE DECISION RECORD — HF-199

**Date:** 2026-05-04
**Status:** ACCEPTED
**Context:** Meridian three-defect closure — D1 plan-tier extraction + D2 convergence binding + D3 entity attribute projection

## Problem

Meridian reconciles to MX$0 instead of ground truth. Three defects gate calculation:

- **D1: Plan-tier extraction** — `calcMethod.tiers` empty for all 10 components. Plan interpreter recognizes `calcMethod.type` (e.g., `bounded_lookup_2d`) but does not populate tier matrices.
- **D2: Convergence binding misalignment** — HF-114 AI hallucinates metric names; boundary fallback produces wrong column bindings (e.g., `New Accounts:actual → Año`, score=0.10).
- **D3: Entity attribute projection** — `entities.materializedState` empty for all 79 entities; variant discrimination produces `tokens=[]`; all entities excluded.

These three defects are independent code surfaces but must close together for calc to produce non-zero. D3 gates entity inclusion (no tokens → no qualifying variant → 0 entities calculated). D1 gates component evaluation (no tiers → component returns 0). D2 gates correctness (wrong columns bind → wrong values).

## Options

### Option A — Single-PR vertical slice closing D1 + D2 + D3 atomically

One PR; reconciliation gate test verifying all three close together.

- **Scale test:** Works at 10x? YES — all three are AI-first / structural fixes that scale by O(1) per primitive
- **AI-first:** Any hardcoding? NO — Korean Test enforced (no language-specific column names; no domain-specific literals)
- **Transport:** Data through HTTP bodies? NO — fixes are within engine
- **Atomicity:** Clean state on failure? YES — each fix is structural; failure of any phase HALTs before next; integration test (reconciliation gate) verifies composition

### Option B — Three separate HFs sequentially (HF-199 D3, HF-200 D1, HF-201 D2)

- **Atomicity:** Lower — three intermediate states leave Meridian in $0 state until all three ship; no integration verification until last PR; violates Vertical Slice Rule (engine + experience evolve together)

### Option C — Targeted minimum to get Meridian non-zero (e.g., D3 only)

- **Coverage:** Demonstrably FAILS — partial fix accepts wrong values; violates SR-34 No Bypass; reconciliation gate would fail. Leaves D1 + D2 unclosed.

## Decision

**CHOSEN: Option A** because (a) Vertical Slice Rule preserves engine + experience co-evolution; (b) procedural theater minimization (architect direction) requires single deliverable; (c) the three defects gate Meridian reconciliation jointly; (d) reconciliation gate test against three proof tenants in same PR proves platform endurance objective end-to-end.

**REJECTED: Option B** because Meridian remains in $0 state across three PRs; intermediate states have no integration verification; SR-34 No Bypass.

**REJECTED: Option C** because partial fix produces wrong values; SR-34 No Bypass; reconciliation gate fails by design; doesn't close objective.

## Consequences

- One PR closes D1 + D2 + D3 atomically
- Reconciliation gate test against Meridian / BCL / CRP executes in same PR
- 103-test negative test suite from PR #361 preserved; new D3-specific verification probe added
- F-005 invariant preserved (post-HF-199 grep zero hits)
- Korean Test extended verification (D3 attribute projection iterates `field_identities` only — no language-specific column-name matching)
- Out-of-scope items (F-010, A.5.GAP-2, format polymorphism, etc.) carry forward
