# OB-211 WS-7-rev Execution Orchestration — Security-Lead, Then the Whole

**Date:** 2026-06-15 · **Orchestrated by:** CC (ultracode) · **Gate:** #517 (`68d8e7b`) on main. Source of truth: `WS7_REV_VERIFICATION_20260615.md` (this executes its §5; it does not re-assume).

**The principle (architect-set): close the live bugs first, complete the whole.** The two HALT-ACCESS bugs are live confidentiality/entitlement exposure — they lead. The comprehensive WS-7-rev work (agent nav, the verified fixes, the drill extraction, the export hierarchy) is the defined body of work and completes behind them. Nothing dropped.

## The increments (dependency-ordered, each architect-SR-44-gated)

- **WS-A — SECURITY (lead, this branch `ws7-a-haltaccess-closures`):** the two HALT-ACCESS closures. Independent of nav-naming, small, highest-stakes → first.
  - **#2 `perform/statements` param-leak (SR-39):** scope-locked **in place** (a privileged-viewer use exists — admin/manager need a scoped entity viewer — so HALT-STMT says scope-lock, not retire). `allowedEntityIds` from `usePersona().scope` (admin=tenant/null, manager=team, rep=own). Enforced through the READ: `loadOptions` filters the entity query; `loadStatement` denies an out-of-scope `entityId` at the data layer (param tamper denied, not hidden); the picker exists only for a multi-entity viewer (a rep gets a static own-entity label). The secure rep home remains `/stream`; this closes the leaky surface as a scoped viewer.
  - **#1 Finance route gate (entitlement):** new `financial/layout.tsx` wrapping `/financial/*` in the EXISTING `FeatureGate feature="financial"` → a non-Finance tenant is **denied at the route** (redirect `/unauthorized`), not just hidden in the menu. Leverage, not a new mechanism.
- **WS-B — NAV KEYSTONE (`ws7-b-nav-agents`):** agent-governed nav (Calculation/Performance/Finance/Platform Core); Consolidate removed (reconciliation→Calculation, financial→Finance); `/operate/results` decide→Calculation; **fix the inert Finance MENU gate** (pass `currentTenant.features` at the render call sites) — the visible reflection of WS-A's route gate (the two cohere: route = hard boundary, menu = visible reflection); Platform Core as substrate. Regrouping, no schema change.
- **WS-C — VERIFIED FIXES (parallel against the keystone):** results-table access double-gate + G1 server COUNT (`operate/results`/`calculation-service`); `useDrillThrough` extraction (unifies `drillAnomaly`+`expandedEntity`; the WS-3 enabler, R1); surface payroll export in the Calculation flow + name the hierarchy gap (HALT-EXPORT). Disjoint file trees → parallelize.

## Sequencing constraints (stated)

- WS-A's Finance **route** gate ↔ WS-B's Finance **menu** gate = the same entitlement boundary at two layers — done coherently.
- The `perform/statements` closure coexists with the secure `/stream` rep home (scope-lock, not retire — privileged-viewer use is real).
- `useDrillThrough` extraction (WS-C) unifies two existing states — extract once; the results-table drill consumes it; full cross-surface generalization is WS-2 inc-2b.

## The batched adversarial sweep

WS-A ships first as the security lead → it carries its OWN elevated sweep (access-correctness + Finance entitlement, now closing real bugs) before merge. WS-B/WS-C carry the batched sweep over their combined diff. Every HIGH fixed + re-verified.

## Merge strategy

WS-A (security) → WS-B (nav keystone) → WS-C (fixes), each its own branch + PR, architect-SR-44-gated, never to main directly. The verify fan-out (#517) + the batched sweeps are the cost-paid-once instruments.

## Not abandoned (§8 of the directive)

WS-2 inc-2b (B1 + full C3 generalization — consumes the `useDrillThrough` extracted here), WS-3 (dead controls — consumes `useDrillThrough`), WS-4/5/6, the dynamic-Simulate **design** (queued, design-doc-first, likely #508-classifier-driven), and the `WhatIfSlider` i18n debt all remain on the board.

---

*WS-7-rev Execution Orchestration · 2026-06-15 · vialuce.ai · security-lead, complete the whole, nothing dropped.*
