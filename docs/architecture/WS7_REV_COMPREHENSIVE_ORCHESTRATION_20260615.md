# OB-211 WS-7-rev Comprehensive Orchestration — Scope Foundation First, Then the Whole

**Date:** 2026-06-15 · **Orchestrated by:** CC (ultracode) · **Gate:** #518 (WS7-A) on main (`d97eb98c`). Source of truth: `WS7_REV_VERIFICATION_20260615.md` (#517) + the WS7-A sweep.

**The principle (architect-set): the security foundation is Stage 1 of the comprehensive work, not a detour.** The fail-open manager scope fallback is the root beneath WS7-A's surface closures — surfaced twice (OB-211 Simulate sweep, WS7-A sweep), deferred twice. Deferred-twice is how a real SR-39 defect becomes permanent. Stage 1 closes it; Stages 2–4 complete the comprehensive WS-7-rev scope. One orchestration, nothing dropped.

## The stages (dependency-ordered, each architect-SR-44-gated)

- **Stage 1 — SCOPE FAIL-CLOSED (lead, this branch `ws7-stage1-scope-failclosed`):** `persona-context.tsx:290` manager-no-derivable-scope fallback `{entityIds:[], canSeeAll:true}` → `{entityIds:[], canSeeAll:false}`. Small change, **broad blast radius** (every scope-gated surface) → its own increment + a dedicated regression verification across the blast radius. Absence of a derivable scope defaults to **least privilege**. **HALT-SCOPE-DEMO:** a demo manager relying on the old fail-open now sees only their own entity — the fix is to **seed their `profile_scope`**, NOT restore fail-open (the architect's data-context seeding).
- **Stage 2 — NAV KEYSTONE (`ws7-stage2-nav-agents`):** agent-governed nav (Calculation/Performance/Finance/Platform Core); Consolidate removed (reconciliation→Calculation, financial→Finance); `/operate/results` decide→Calculation; **fix the inert Finance MENU gate** (pass `currentTenant.features` at the render call sites — the visible reflection of WS7-A's route gate); Platform Core as substrate. Regrouping, no schema change.
- **Stage 3 — VERIFIED FIXES (parallel, `ws7-stage3-*`):** results-table access double-gate + G1 server COUNT; `useDrillThrough` extraction (unifies `drillAnomaly`+`expandedEntity`; the WS-3 enabler); surface payroll export + name the hierarchy gap (HALT-EXPORT). Disjoint trees → parallelize after the keystone.
- **Stage 4 — RLS / DEFENSE-IN-DEPTH (verification, architect-context):** CC produces the data-layer verification plan (which scope-gated tables need which RLS policy); the architect runs the authenticated DB check (CC's scan is sandbox-blocked). **HALT-RLS:** if absent, a defense-in-depth follow-on; the app layer holds for app traffic.

## Sequencing constraints (stated)

- Stage 1 strengthens the scope WS7-A's membership guard consumes → it makes WS7-A's guard **effective for unscoped managers** (today the guard is skipped when `canSeeAll:true`). WS7-A locked the surface; Stage 1 fixes the scope feeding it.
- Stage 2's Finance **menu** gate ↔ WS7-A's Finance **route** gate = the same entitlement boundary at two layers.
- `useDrillThrough` (Stage 3) extracts once; the results-table drill consumes it; full cross-surface generalization is WS-2 inc-2b.

## The batched adversarial sweep (one, over Stages 1–3)

ELEVATED — **SR-39 scope** (Stage 1 is the root: fail-closed closes the over-SEE *without* over-DENYING a properly-scoped manager — verified across the blast radius) + **Finance entitlement** (route + menu). Plus right-by-luck/SR-38, Korean Test, scale (G1). Stage 1 ships first with its OWN regression verification (the blast radius); Stages 2–3 carry the batched sweep over their combined diff. Every HIGH fixed + re-verified.

## Merge strategy

Stage 1 → Stage 2 → Stage 3 (parallel) → Stage 4 (verification), each its own branch + PR, architect-SR-44-gated, never to main directly.

## Not abandoned (§9)

WS-2 inc-2b (B1 + full C3 — consumes the `useDrillThrough` extracted in Stage 3), WS-3 (dead controls — consumes it), WS-4/5/6, the dynamic-Simulate **design** (queued, design-doc-first, #508-classifier-driven), the `WhatIfSlider` i18n debt, and the RLS follow-on (if Stage 4 finds it absent) all remain on the board.

---

*WS-7-rev Comprehensive Orchestration · 2026-06-15 · vialuce.ai · scope foundation first, complete the whole, nothing dropped.*
