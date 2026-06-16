# OB-211 WS-7-rev COMPREHENSIVE: SCOPE FAIL-CLOSED (STAGE 1) → NAV KEYSTONE → VERIFIED FIXES — THE COMPLETE REMAINING WORK (ULTRACODE-ORCHESTRATED)

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-15 (architect channel)
**Type:** OB-211 WS-7-rev — the COMPLETE remaining body of work as one orchestrated campaign. Stage 1 closes the root SR-39 scope-derivation gap (the fail-open manager fallback, surfaced independently TWICE) — the security foundation every scope-gated surface stands on. Stages 2–4 complete the comprehensive WS-7-rev scope: the agent-governed nav keystone and the verified fixes. Nothing is fragmented into standalone hotfixes; the security foundation leads the whole.
**Gate:** #518 (WS7-A — the two HALT-ACCESS closures) on main, architect-SR-44-confirmed. If #518 not merged, HALT (Stage 1 strengthens the scope WS7-A's guard consumes; they cohere).
**Branch:** CC's orchestration — Stage 1 (scope foundation) as the lead branch, then the keystone + fixes as dependency-ordered increments, each architect-SR-44-gated. Never push to main directly. tsc --noEmit before every push.

**THE PRINCIPLE (architect-set): the security foundation is Stage 1 of the comprehensive work, not a detour.** The fail-open scope fallback is the root beneath WS7-A's surface closures — it has been independently surfaced TWICE (the OB-211 Simulate sweep, the WS7-A sweep) and deferred twice. Deferred-twice is how a real SR-39 defect becomes permanent. Fixing it is not a distraction from the body of work; it is the foundation the body of work's scoping stands on. This directive makes it Stage 1 AND carries the complete remaining scope behind it — one orchestration, nothing dropped.

**Governing specs:** the verification (#517), WS7-A (the surface closures Stage 1 strengthens), the authoritative capability map (the four agents), DS-014 (access scoping, single PDP), the `tenants.features` gating mechanism, DS-013, the OB-207 Regime ADR, #509, #510, HF-293, Korean Test, SR-34, Bloodwork.

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Binding: AP-25 (Korean Test), SR-34 (fix the derivation at root; reorganize the nav, don't replace; no third path), SR-38, **SR-39 (THE elevated dimension — Stage 1 IS the root SR-39 fix; the whole directive holds scope through the read/route)**, SR-41, SR-42, SR-43, SR-44. Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**Leverage, do not create (verification + WS7-A confirmed):** the scope mechanism EXISTS (`usePersona().scope`, `profile_scope`, `persona-context`); the payroll export, results table, secure rep statement, nav config, gating filter, `useDrillThrough` target — ALL exist. The work is a root fix (Stage 1) + reorganization + verified fixes — NOT builds. **HALT-GENERAL** if about to build what exists.

**Read-before-assume:** every item is verified at a cited line. The fail-open fallback is `persona-context.tsx:294` (`{ entityIds: [], canSeeAll: true }`). CC re-reads each slice before changing it.

**FP-49:** scope reads `profile_scope`/persona-context; the Finance gate reads `tenants.features`; writes use correct columns. Confirm live.

AUTONOMY: NEVER ask yes/no. Act. tsc --noEmit before push. Git from repo root.

**Reconciliation-channel separation:** No ground-truth values.

---

## §1 — ULTRACODE ORCHESTRATION (CC states the plan, then executes)

CC commits an orchestration plan (`docs/architecture/WS7_REV_COMPREHENSIVE_ORCHESTRATION_20260615.md`):

**Stage 1 (lead — SCOPE FOUNDATION):** the fail-closed fix. Small change, broad blast radius (every scope-gated surface) → its own increment with a dedicated regression sweep across all consuming surfaces. Ships FIRST, architect-SR-44-gated.

**Stage 2 (keystone — NAV REORGANIZATION):** the agent-governed nav. References where surfaces live; coheres with the Finance gating (route from WS7-A + menu fix here).

**Stage 3 (parallel — VERIFIED FIXES, disjoint trees against the keystone):** results-table access double-gate + G1 ∥ `useDrillThrough` extraction ∥ payroll export hierarchy. Parallelize after the keystone.

**Stage 4 (verification — RLS / defense-in-depth, architect-context):** the data-layer boundary check (flagged by WS7-A) — CC produces the verification plan; the architect runs the authenticated data-layer check (sandbox blocks CC's scan). If RLS is absent, a follow-on closes it; if present, the app-layer + RLS boundary is confirmed complete.

**THE SEQUENCING CONSTRAINTS (state, don't discover):**
- Stage 1 strengthens the scope WS7-A's membership guard consumes → Stage 1 makes WS7-A's guard *effective for unscoped managers* (today the guard is skipped when `canSeeAll:true`). They cohere: WS7-A locked the surface, Stage 1 fixes the scope feeding it.
- Stage 2's Finance menu gate ↔ WS7-A's Finance route gate = the same entitlement boundary (route + menu).
- `useDrillThrough` (Stage 3) extracts once; the results-table drill consumes it; it's the WS-3 enabler.

**The batched adversarial sweep (one, over Stages 1–3):** ELEVATED — SR-39 scope (the fail-closed change must not over-DENY a legitimately-scoped manager; and must close the over-SEE) + Finance entitlement — plus right-by-luck/SR-38, Korean Test, scale (G1). The Stage-1 regression dimension is specific: **every scope-consuming surface still works for a properly-scoped user, and a previously-fail-open unscoped manager is now team-bounded everywhere.** Run once over the batch.

**The merge strategy:** Stage 1 → Stage 2 → Stage 3 (parallel) → Stage 4 (verification), each architect-SR-44-gated. CC states branches.

CC states this plan, then executes — fan-out + batched sweep paid once.

---

## §2 — STAGE 1: SCOPE FAIL-CLOSED (the root SR-39 foundation)

### 2.1 The verified root bug
`persona-context.tsx:294` — when a manager has no brand data (and no `profile_scope`), the fallback is `{ entityIds: [], canSeeAll: true }` → `allowedEntityIds = null` → **the membership guard (WS7-A's `:186`, and every other scope gate) is SKIPPED** → an unscoped manager can view/simulate/aggregate ANY tenant entity. The same fallback feeds `/stream` (teamResults, heatmap, bloodwork, Simulate), the financial pages, statements, my-compensation, mission-control (the verified blast radius). **This is the root SR-39 exposure beneath WS7-A's surface closures** — surfaced twice (OB-211 Simulate sweep + WS7-A sweep), deferred twice.

### 2.2 The fix (fail-closed, SR-34 at root)
Change the manager-no-brand fallback to **fail-closed**: `{ entityIds: [], canSeeAll: false }`. An unscoped manager is then **team-bounded everywhere** (empty scope → sees nothing beyond their own resolvable entity, never the whole tenant) rather than fail-open. The principle: absence of a derivable scope MUST default to LEAST privilege, not MOST. **Korean Test:** the fallback is structural (no domain literal).

**The over-DENY consideration (the reason this needs its own sweep):** failing closed means a manager whose scope genuinely can't be derived now sees nothing instead of everything. That is the CORRECT security default, BUT it changes demo behavior for an unscoped manager. Two parts:
1. The fix lands (fail-closed is correct).
2. **HALT-SCOPE-DEMO:** if a DEMO manager (e.g. on BCL) relies on the fail-open fallback to see their team (i.e. their `profile_scope` isn't populated), failing closed will blank them. Report which demo managers lack a derivable scope — the resolution is to POPULATE their `profile_scope` (the correct fix: give them a real scope), NOT to restore fail-open. Surface this so the architect can seed the demo scopes; do not revert the security fix to make the demo work.

### 2.3 The Stage-1 regression sweep (every consuming surface)
Verify across the blast radius (the surfaces from §2.1): a properly-scoped manager STILL sees their team on each surface (the fix doesn't over-deny a scoped user); a previously-fail-open unscoped manager is now bounded on each surface (the fix closes the over-see). Paste the before/after for at least: `/stream` (teamResults/Simulate), a financial page, the statement surface (the WS7-A guard now EFFECTIVE for an unscoped manager).

### 2.4 Commit
`fix(OB-211 WS7 Stage1): scope fails CLOSED for unscoped manager — persona-context fallback {entityIds:[],canSeeAll:false}; the root SR-39 fix beneath WS7-A (least-privilege default across all scope-gated surfaces)`

---

## §3 — STAGE 2: NAV REORGANIZATION KEYSTONE (agent-governed)

Reorganize `workspace-config.ts`/`navigation.ts` → agent governance (verification confirmed: regrouping, NO schema change).
- **Platform Core** — substrate (config-as-settings: `/configure/*`), not a verb-peer.
- **Calculation** — cockpit/import/calculate + **reconciliation** (from removed Consolidate) + the **admin results table** (move `/operate/results` decide→Calculation, removing the `:257` override) + payroll export.
- **Performance** — `/stream`, dashboards, the rep statement home.
- **Finance** — LICENSABLE: `/financial/*` (from Consolidate), gated via `tenants.features` (WS7-A route gate + the menu fix §3.2).
- **"Consolidate" REMOVED** (reconciliation→Calculation, financial→Finance).

### 3.2 Fix the inert Finance MENU gate
The `featureFlag:'financial'` filter (`:222-224`) is short-circuited (`:223` `if (!enabledFeatures) return true`) because no caller passes `enabledFeatures` (`ChromeSidebar.tsx:180`). **Fix:** pass `currentTenant.features` at the render call sites → the section gates. This is the visible reflection of WS7-A's route gate (route = hard boundary, menu = visible reflection).

### 3.3 Naming + nature
Agent names govern (verbs relabeled); capabilities by nature (forensics/dispute/next-best-action are contextual depth, not menu items). Korean Test: agent vocab structural.

### 3.4 Commit
`feat(OB-211 WS7 Stage2): agent-governed nav keystone — Calculation/Performance/Finance/Platform Core; Consolidate removed; results-table→Calculation; Finance menu gate fixed`

---

## §4 — STAGE 3: VERIFIED FIXES (parallel, against the keystone)

### 4.1 Admin results-table access double-gate + G1
**Verified:** outer `RequireCapability view.all_results` admits a tenant admin, inner `isVLAdmin` (platform-only) BLOCKS them. **Fix:** collapse the double-gate — a `view.all_results` tenant admin is admitted (remove the redundant inner `isVLAdmin`; the capability gate is authority). **G1:** `entityCount = results.length` off an unbounded read (`calculation-service.ts:385`) → use the EXISTING `count:'exact',head:true` helper. Row drill + Full Trace already exist. **SR-39:** the collapsed gate doesn't widen beyond `view.all_results` (tenant-bounded, with Stage-1's scope now sound).

### 4.2 `useDrillThrough` extraction (the WS-3 enabler)
**Verified:** drill is two inline states (`drillAnomaly:119` + `expandedEntity:113`); NO HALT-C3-ADAPTER. **Extract:** `useDrillThrough<T>() = {target, open, close}` over one `useState<T|null>`, `open` firing the EXISTING `captureStreamSignal` (no new path) + reset-on-batch; the per-surface VIEW + context adapter stay OUT. Refactor `/results` to use it (remove the inline parallel, SR-34). WS-3 consumes it.

### 4.3 Payroll export hierarchy
**Verified:** `generatePayrollCSV` EXISTS (ID/Name/Total/period); **hierarchy ABSENT** (in `entity_relationships`, not on the result). **Work:** surface in the Calculation results flow (sign-off→export); **HALT-EXPORT** — join from `entity_relationships` if cheap, else document the column as the remaining gap. No fabrication. **SR-38:** monto = persisted `total_payout`.

### 4.4 Commits (per fix)
`fix(OB-211 WS7 Stage3): results-table access double-gate + G1 server COUNT` ·
`refactor(OB-211 WS7 Stage3): extract useDrillThrough (WS-3 enabler)` ·
`feat(OB-211 WS7 Stage3): surface payroll export; hierarchy gap named (HALT-EXPORT)`

---

## §5 — STAGE 4: RLS / DEFENSE-IN-DEPTH VERIFICATION (architect-context)
WS7-A + Stage 1 close the application-read layer (the page refuses out-of-scope queries; scope fails closed). A complete boundary also wants **RLS** on `calculation_results`/`committed_data`/`entities` (or a server route/RPC re-checking scope) so a DIRECT data-API call is denied at the DB. CC produces the verification plan (which tables, what RLS policy each needs); the architect runs the authenticated data-layer check (CC's scan is sandbox-blocked). **HALT-RLS:** if RLS is absent on a scope-gated table, that's a defense-in-depth follow-on (the app layer holds for app traffic; the DB layer is the deeper boundary). Document the state; do not assume.

### 5.1 Commit
`docs(OB-211 WS7 Stage4): RLS/defense-in-depth verification plan — the data-layer boundary beneath the app-layer scope`

---

## §6 — GATES + THE BATCHED SWEEP

### 6.1 Per-stage re-verify
- Stage 1: unscoped manager now bounded on EVERY consuming surface; scoped manager unaffected (before/after pasted); WS7-A's statement guard now EFFECTIVE for an unscoped manager.
- Stage 2: sidebar agent-governed; Finance menu gate live (absent for non-Finance tenant); results-table under Calculation.
- Stage 3: tenant admin reaches the table (double-gate collapsed); server COUNT; `useDrillThrough` unifies the two states; export surfaces with hierarchy gap named.
- Stage 4: the RLS verification plan + the architect's data-layer finding.

### 6.2 The batched adversarial sweep (ELEVATED: SR-39 scope + Finance entitlement)
- **SR-39 scope (ELEVATED — Stage 1 is the root fix):** fail-closed closes the over-SEE without over-DENYING a scoped user; verified across the blast radius. A previously-fail-open path no longer reaches the whole tenant.
- **Finance entitlement (ELEVATED):** denied at route (WS7-A) AND menu (Stage 2) for a non-Finance tenant.
- **right-by-luck/SR-38, Korean Test, scale (G1):** standard.
Every HIGH fixed + re-verified.

### 6.3 Build
tsc --noEmit → 0. `npm run build` exit 0. localhost:3000.

### 6.4 Proof gates
| PG | PASS |
|---|---|
| SCOPE-failclosed | unscoped manager bounded on /stream + financial + statement (the WS7-A guard now effective); scoped manager unaffected. Before/after pasted. |
| SCOPE-demo | demo managers lacking a derivable scope are NAMED (HALT-SCOPE-DEMO) for the architect to seed profile_scope — not fail-open-restored. |
| NAV-agents | sidebar Calculation/Performance/Finance/Platform Core; Consolidate gone; results-table→Calculation. Screenshot. |
| NAV-finance-menu | Finance section absent for non-Finance tenant (menu gate live + the route gate from WS7-A). |
| TABLE-gate | tenant admin reaches the table (double-gate collapsed); tenant-bounded. |
| TABLE-G1 | count from server COUNT; correct >1000 entities. |
| DRILL | useDrillThrough unifies the two states; drill + Full Trace intact; no new signal path. |
| EXPORT | export surfaces; monto = persisted (SR-38); hierarchy gap named. |
| RLS-plan | the data-layer verification plan delivered; architect's finding recorded. |
| KoreanTest | scope fallback + agent vocab + gate logic structural; no domain literal. |
| Build | tsc 0 + build exit 0. |
| PER-STAGE SR-44 | each renders/enforces on the live tenant; architect confirms. |

### 6.5 PRs (dependency-ordered, each SR-44-gated)
Stage 1: `OB-211 WS7 Stage1: scope fail-closed (root SR-39)` →
Stage 2: `OB-211 WS7 Stage2: agent-governed nav keystone + Finance menu gate` →
Stage 3: `OB-211 WS7 Stage3: results-table gate+G1, useDrillThrough, export hierarchy` →
Stage 4: `OB-211 WS7 Stage4: RLS verification plan`

---

## §7 — HALT CONDITIONS
- **HALT-GENERAL:** about to build what exists. Fix/reorganize/compose.
- **HALT-SCOPE-DEMO:** a demo manager lacks a derivable scope (fail-closed blanks them). NAME them for the architect to seed `profile_scope`; do NOT restore fail-open to make the demo work.
- **HALT-EXPORT:** hierarchy not joinable cheaply → assemble persisted + name the gap; no fabrication.
- **HALT-RLS:** RLS absent on a scope-gated table → document as a defense-in-depth follow-on; the app layer holds for app traffic.
- **HALT-NAV:** (not expected) agent grouping needs a schema change → reorganize within the existing structure.
- **HALT-LOCKED:** any locked rule conflicts. Surface verbatim per SR-42.

---

## §8 — REPORTING
Per-stage completion reports + a campaign summary. Each per Rules 25-28: SHA, the Stage-1 before/after across the blast radius (the root SR-39 fix), the nav reorganization, the verified fixes + re-verify, the RLS plan + architect finding, the batched sweep, build+tsc, PR URLs. Confirm: scope fixed at root (least-privilege default); nav reorganized not replaced; export/table/statement composed not rebuilt; the comprehensive scope completed, security foundation first, nothing dropped.

```
ARTIFACT SYNC (WS7-rev comprehensive)
MC: WS-7-rev COMPLETED — Stage 1 closed the root SR-39 scope-derivation gap (fail-open manager fallback → fail-closed; the foundation beneath WS7-A, surfaced twice, now fixed) across every scope-gated surface; agent-governed nav reorganized (Calculation/Performance/Finance/Platform Core, Consolidate removed, Finance gated route+menu); verified fixes shipped (results-table double-gate+G1, useDrillThrough extraction, payroll export hierarchy); RLS/defense-in-depth verification planned (architect data-layer check). The comprehensive body of work completed, security foundation first, nothing abandoned. Pending per-stage SR-44.
REGISTRY: "Scope Fail-Closed" → least-privilege default, the root SR-39 fix beneath all scope gates; "Finance Entitlement" → route+menu (both layers); "Agent-Governed Nav" → the four agents; "Results Table" → tenant-admin-reachable, server-COUNT, drillable; "useDrillThrough" → extracted (WS-3 enabler); "Payroll Export" → surfaced, hierarchy named; "RLS Boundary" → verification planned. All agents formalized on the demo path.
R1: Tier-C "scope fails closed across surfaces; Finance gated per tenant route+menu; nav agent-governed; results table reachable+drillable; export surfaced; RLS verified/planned" → pending SR-44.
BOARD: WS-7-rev complete (scope foundation + nav + fixes + RLS plan); the dynamic-Simulate design thread remains queued (not abandoned).
SUBSTRATE: SR-39 fixed at root (fail-closed least-privilege — the gap surfaced twice, now closed) + enforced at read/route (WS7-A); ultracode orchestration (scope-foundation-lead + nav-keystone + parallel fixes + RLS-verification + one batched sweep — cost once); agent-governed nav; Finance = entitlement at two layers; useDrillThrough = WS-3 enabler; defense-in-depth (app layer closed, DB layer verified); comprehensive scope completed without derailment; dynamic-Simulate queued.
```

---

## §9 — THE LARGER EFFORT BEYOND THIS DIRECTIVE (explicitly tracked, not abandoned)
This directive completes WS-7-rev (the nav + the demo-capability scope + the security foundation). The campaign continues:
- **WS-2 inc-2b** — B1 expand/react (C3's `useDrillThrough` is extracted HERE; inc-2b consumes it).
- **WS-3 dead controls** — consumes `useDrillThrough`; the 19-handler + no-handler-button inventory is its scope.
- **WS-4/5/6** — Manager/Individual results surfaces, Finance agent capability build-out (the map's 6), action proximity.
- **The dynamic-Simulate design** — structure-derived, actionable (Thermostat): tiered→cross-boundary, attainment-rate→close-the-gap, flat→volume-action; likely #508-classifier-driven. QUEUED design-doc-first (set down deliberately; not lost).
- **i18n debt** — `WhatIfSlider` hardcoded Spanish chrome (Korean-Test-adjacent).
- **RLS follow-on** — if Stage 4 finds RLS absent on scope-gated tables.

## §9A — RESIDUALS
- R1 — `useDrillThrough` (extracted Stage 3) is the WS-3 enabler.
- R2 — payroll hierarchy column (HALT-EXPORT).
- R3 — dynamic-Simulate design (queued, design-doc-first, #508-driven).
- R4 — Finance agent's unbuilt capabilities (the map's 6).
- R5 — RLS defense-in-depth (Stage 4 finding → follow-on if absent).
- R6 — i18n localization of primitives.
- R7 — demo `profile_scope` seeding (HALT-SCOPE-DEMO — the correct resolution to fail-closed blanking).
- R8 — R1 exit criteria on per-stage SR-44.
