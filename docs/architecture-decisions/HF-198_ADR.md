# ARCHITECTURE DECISION RECORD — HF-198

**Date:** 2026-05-04
**Status:** ACCEPTED
**Context:** OB-196 Phases 4-8 closure (E5 + E3 + E6 + compliance + final close)

## Problem

OB-196 has shipped E1, E2, E4 (PRs #345, #349, #350). Three extensions remain
(E5, E3, E6) plus Phase 7 (compliance gates) and Phase 8 (final close). AUD_004
v3 §1 verbatim problem ("If a new structural primitive appears, the platform
still works") closes when all six extensions operative + Korean Test verdict
produces YES across negative test suite.

## Options

### Option A — Single-PR vertical slice closing OB-196 Phases 4-8 atomically

Branch from main HEAD (post HF-197B); E5 + E3 + E6 + compliance + final close in
one PR per Decision 153 atomic cutover discipline.

- **Scale test:** Works at 10x? YES — E5 reads signal-registry surface (O(1) per
  signal_type); E3 read-coupling validation is registration-time
- **AI-first:** Any hardcoding? NO — E5/E3/E6 use registry-derived vocabulary;
  Korean Test enforced
- **Transport:** Data through HTTP bodies? NO — signal surface DB-backed
- **Atomicity:** Clean state on failure? YES — registration is idempotent;
  structured failure preserved per E2

### Option B — Phased PRs per remaining extension

Phase 4 PR, Phase 5 PR, Phase 6 PR, Phase 7+8 PR.

- **Scale test:** Same answer
- **AI-first:** Same answer
- **Transport:** Same answer
- **Atomicity:** Lower — phased PRs leave intermediate states; OB-196 closure
  fragmented; violates Decision 153 atomic cutover for the closure itself

### Option C — Verification-only HF (no new code; just confirm OB-196 0-3 reconciles)

- **Scale test:** Works for what it verifies; doesn't address E5/E3/E6 absence
- **Coverage:** Leaves three extensions unclosed; AUD-004 v3 §1 problem remains
  "answer NO" in part

## Decision

**CHOSEN: Option A** because (a) Decision 153 atomic cutover for OB-196 closure
discipline; (b) procedural theater minimization (architect direction) requires
single deliverable; (c) Vertical Slice Rule preserves engine + experience
co-evolution; (d) reconciliation gate test against three proof tenants in same
PR proves the platform endurance objective end-to-end.

**REJECTED: Option B** because phased delivery fragments OB-196 closure; each
intermediate state has known unclosed extensions; SR-34 No Bypass.

**REJECTED: Option C** because leaves E5/E3/E6 unclosed; AUD-004 v3 §1 verbatim
problem unsolved; defers the actual structural work.

## Consequences

- One PR closes OB-196 (Phases 4-8) atomically
- Reconciliation gate test against CRP/BCL/Meridian executes in same PR
- 38-test negative suite from PR #350 extends with E5/E3/E6 negative cases
- F-006 + F-011 closed; Decision 154 closure verification produced
- Out-of-scope items (F-010, A.5.GAP-2, IGF amendments, etc.) carry forward per
  prompt §"OUT OF SCOPE"
