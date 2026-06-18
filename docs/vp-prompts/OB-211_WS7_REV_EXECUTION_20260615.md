# OB-211 WS-7-rev EXECUTION: HALT-ACCESS CLOSURES FIRST, THEN THE COMPLETE EVIDENCE-DRIVEN BODY OF WORK (ULTRACODE-ORCHESTRATED)

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-15 (architect channel)
**Type:** OB-211 WS-7-rev execution. The Phase-0 verification (#517) replaced the directive's assumed scope with the VERIFIED scope. This directive executes ALL of it — the two confidentiality/entitlement bugs FIRST (they are live exposure), then the nav reorganization keystone and the verified fixes — **without abandoning the comprehensive body of work.** Ultracode-orchestrated: the security closures are the lead increment; the full scope completes behind them under one orchestration with one batched elevated sweep.
**Gate:** #517 on main (`68d8e7b`) — confirmed. The verified scope (`WS7_REV_VERIFICATION_20260615.md`) is the source of truth; this directive does NOT re-assume — it executes the verification's §5.
**Branch:** CC's orchestration — the security closures as the lead branch (WS-A), the nav keystone + verified fixes as dependency-ordered increments (WS-B…), each architect-SR-44-gated. Never push to main directly. tsc --noEmit before every push.

**THE PRINCIPLE (architect-set): close the live bugs first, complete the whole.** The two HALT-ACCESS bugs are confidentiality/entitlement exposure on a production tenant — they lead. But the comprehensive WS-7-rev work (agent-governed nav, the verified fixes, the drill extraction, the export hierarchy) is the defined body of work and MUST complete — the bugs do not get to derail it. This directive carries BOTH: security first, then the full scope, one orchestration, nothing dropped.

**Governing specs:** the verification (#517 — the evidence base), the authoritative capability map (the four agents), DS-014 (access scoping, single PDP), the `tenants.features` gating mechanism (`workspace-config.ts:222-224`), DS-013, the OB-207 Regime ADR, #509, #510, HF-293, Korean Test, SR-34, Bloodwork.

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Binding: AP-25 (Korean Test), SR-34 (fix at the read/route; reorganize the nav, don't replace it; no third path), SR-38 (export/statement values trace to engine payout), **SR-39 (access scoping — THE elevated dimension here: the two closures ARE SR-39 enforcement)**, SR-41, SR-42, SR-43, SR-44. Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**Leverage, do not create (verification-confirmed):** the payroll export EXISTS (`generatePayrollCSV`), the admin results table EXISTS (inline table + drill + Full Trace), the secure rep statement EXISTS (`/stream` IndividualStream, leak-safe, HF-293 Simulate renders there), the gating mechanism EXISTS (`tenants.features` + the featureFlag filter), the nav regrouping needs NO schema change, `useDrillThrough` extraction is clean (NO HALT-C3-ADAPTER). The work is fixes + reorganization + closures — NOT builds. **HALT-GENERAL** if about to build what exists.

**Read-before-assume:** every item below is verified in code at a cited line (#517 + this directive's Phase-0 confirms). CC re-reads each slice before changing it; the verification is the map, the live code is the territory.

**FP-49:** the Finance gate reads `tenants.features`; the statement scope reads the persona context; writes use the correct columns. Confirm live before writing.

AUTONOMY: NEVER ask yes/no. Act. tsc --noEmit before push. Git from repo root.

**Reconciliation-channel separation:** No ground-truth values.

---

## §1 — ULTRACODE ORCHESTRATION (CC states the plan, then executes)

CC commits an orchestration plan (`docs/architecture/WS7_REV_EXEC_ORCHESTRATION_20260615.md`):

**The lead increment (WS-A — SECURITY, first):** the two HALT-ACCESS closures. They are independent of the nav-naming work, small (a route guard + a read-scope fix), and highest-stakes. They ship FIRST, architect-SR-44-gated, carrying the elevated access+entitlement sweep. **Rationale stated: live confidentiality/entitlement exposure leads.**

**The keystone (WS-B — NAV REORGANIZATION):** the agent-governed nav. It is the keystone the surface placements reference (where the results table lives, where Finance is gated). Lands after WS-A (or coordinated — WS-A's Finance route gate and WS-B's Finance menu gate are the same entitlement boundary at two layers; sequence so they cohere).

**The parallel fixes (WS-C…, disjoint trees against the keystone):**
- results-table access double-gate + G1 server COUNT (`operate/results` / `calculation-service`)
- `useDrillThrough` extraction (the WS-3 enabler)
- payroll export: surface in the Calculation flow + name the hierarchy gap (HALT-EXPORT)
These touch separate files → parallelize after the keystone.

**THE SEQUENCING CONSTRAINTS (state, don't discover):**
- WS-A's Finance route gate ↔ WS-B's Finance menu gate fix = the SAME entitlement boundary (route + menu). Do them coherently (the route gate is the hard boundary; the menu gate is the visible reflection). 
- The `perform/statements` closure ↔ the secure `/stream` rep home: decide fix-in-place vs gate/retire (the architect decision below) BEFORE building.
- `useDrillThrough` extraction unifies two existing states (`drillAnomaly` + `expandedEntity`) — extract once; the results-table drill consumes it.

**The batched adversarial sweep (one, over WS-A…C):** ELEVATED — **access-correctness** (scope through the READ — the two closures are verified against this) and **Finance entitlement** (denied at the ROUTE) — plus right-by-luck/SR-38 (export monto = engine value), Korean Test, scale (G1). Run once over the batch. Every HIGH fixed + re-verified.

**The merge strategy:** WS-A (security) → WS-B (nav keystone) → WS-C parallel fixes, each architect-SR-44-gated, dependency-ordered. CC states branches.

CC states this plan, then executes — fan-out + batched sweep paid once across the whole execution.

---

## §2 — WS-A: THE TWO HALT-ACCESS CLOSURES (lead increment, security)

### 2.1 HALT-ACCESS #2 — `perform/statements` param-leak (🔴 confidentiality)
**Verified bug:** `perform/statements/page.tsx:92` reads `?entityId` into state unguarded; `:143` auto-selects `entities[0]` if no param; picker (`:305-314`) lists all entities → **anyone can view any entity's full payout/breakdown/trajectory/raw transactions** (SR-39 violation).

**ARCHITECT DECISION (CC executes the ruling — see §2.3): fix-in-place vs gate/retire.** The secure rep home EXISTS at `/stream` IndividualStream (profile→entity, leak-safe, HF-293 Simulate). So `perform/statements` is either:
- **(Option Fix) scope-locked in place:** the entity is resolved from the authenticated profile (the same `persona-context: auth_user_id→profile→entity` the secure `/stream` uses), NOT from `?entityId`. A rep resolves to THEIR entity only. The picker is removed for non-privileged roles; for a privileged role (admin/manager) the picker is SCOPE-CHECKED (admin=tenant, manager=team — ownership/scope-checked, never arbitrary). HALT-4: a rep never sees another's statement, never the picker.
- **(Option Gate/Retire) `/stream` is the canonical rep statement:** `perform/statements` is gated to privileged-scoped-viewer only (admin/manager, scope-checked) or retired, with the rep path being `/stream`.

**The closure MUST hold through the READ, not the UI:** the entity a user can load is enforced server-trust-side (the persona context), so changing `?entityId` to another entity is DENIED — not merely hidden. **SR-39:** paste the scope-enforcement (a rep requesting another entityId is denied at the data layer).

### 2.2 HALT-ACCESS #1 — Finance route gate (🔴 entitlement)
**Verified bug:** `/financial/*` gated only at the sidebar by role capability (`permissions.ts:324` `/financial→view.team_results`), never by `tenants.features`, never at the route (no `financial/layout.tsx`). **A non-Finance tenant's role-capable manager can navigate directly to `/financial` and see financial data they're not licensed for.**

**Closure:** add a route-level guard — a `web/src/app/financial/layout.tsx` (or middleware feature-check) that reads `tenants.features['financial']` and DENIES (redirect/403) when the tenant lacks the Finance feature. A non-Finance tenant is **denied at the route**, not just hidden in the menu. Reuse the EXISTING `FeatureGate`/`useFinancialOnly` (currently menu-only) at the route. **This is the Finance agent's entitlement boundary made real** — coheres with WS-B's menu-gate fix (§3.2). **SR-39/entitlement:** paste a non-Finance-tenant direct-nav-to-`/financial` → denied.

### 2.3 The architect ruling for §2.1
Default to **Option Fix (scope-lock in place)** UNLESS the secure `/stream` home fully covers the rep need AND `perform/statements` has no privileged-viewer use — in which case **Gate/Retire**. CC assesses which from the verified surfaces and states its choice with evidence; either way the leak is CLOSED (no unguarded param, no arbitrary picker, scope through the read). **HALT-STMT:** if the privileged-viewer use is real (admin/manager need a scoped entity viewer), scope-lock it (admin=tenant, manager=team) rather than retire.

### 2.4 Commit
`fix(OB-211 WS7-A): close two HALT-ACCESS bugs — perform/statements param-leak (scope through the read) + Finance route gate (tenants.features at the route). SR-39 enforcement.`

---

## §3 — WS-B: THE NAV REORGANIZATION KEYSTONE (agent-governed)

Reorganize the EXISTING `workspace-config.ts`/`navigation.ts` → agent governance (verification confirmed: regrouping, NO schema change).

### 3.1 Agent structure
- **Platform Core** — substrate (config-as-settings: periods/people/users at `/configure/*`), NOT a verb-peer.
- **Calculation** — agent: cockpit/import/calculate + **reconciliation** (moved from the removed Consolidate) + the **admin results table** (move `/operate/results` from decide→Calculation, removing the `:257` override) + payroll export.
- **Performance** — agent: `/stream`, dashboards, the rep statement home.
- **Finance** — LICENSABLE agent: the `/financial/*` routes (moved from Consolidate), **gated via `tenants.features`** (the route gate from §2.2 + the menu gate fix §3.2).
- **"Consolidate" verb REMOVED** (its two sections regrouped: reconciliation→Calculation, financial→Finance).

### 3.2 Fix the inert Finance MENU gate
**Verified bug:** the `featureFlag:'financial'` section filter (`:222-224`) is short-circuited because **no caller passes `enabledFeatures`** (`ChromeSidebar.tsx:180` passes 2 args) → the financial section renders for ANY tenant. **Fix:** pass `currentTenant.features` at the render call sites so the section actually gates. This is the VISIBLE reflection of §2.2's route gate — together they make Finance a real entitlement (hidden in menu AND denied at route for a non-Finance tenant).

### 3.3 Naming + nature
Surface the AGENT names (Calculation/Performance/Finance/Platform Core) as governing identity (verbs relabeled). Capabilities by nature (substrate/destination/contextual — forensics/dispute/next-best-action are contextual depth, not menu items). Korean Test: agent vocabulary structural.

### 3.4 Commit
`feat(OB-211 WS7-B): agent-governed nav keystone — Calculation/Performance/Finance/Platform Core; Consolidate removed; results-table→Calculation; Finance menu gate fixed (coheres with the route gate).`

---

## §4 — WS-C: THE VERIFIED FIXES (parallel, against the keystone)

### 4.1 Admin results-table access double-gate + G1
**Verified:** outer `RequireCapability view.all_results` admits a tenant admin, inner `isVLAdmin` (platform-only) BLOCKS them → a tenant admin is locked out of a table the matrix grants. **Fix:** collapse the double-gate — a `view.all_results` tenant admin is admitted (remove the redundant inner `isVLAdmin` block; the capability gate is the authority). **G1:** `entityCount = results.length` off an unbounded read (`calculation-service.ts:385`) caps ~1000 → use the EXISTING `count:'exact',head:true` helper for the true count. The row drill + Full Trace already exist (no build). **SR-39:** confirm the collapsed gate doesn't widen beyond `view.all_results` (a tenant admin sees their tenant; not cross-tenant).

### 4.2 `useDrillThrough` extraction (the WS-3 enabler)
**Verified:** the drill is two inline states (`drillAnomaly:119` + `expandedEntity:113`); NO HALT-C3-ADAPTER (both contexts recoverable). **Extract:** `useDrillThrough<T>() = {target, open, close}` over one `useState<T|null>`, `open` firing the EXISTING `captureStreamSignal` (no new path) + reset-on-batch; the per-surface VIEW and context adapter stay OUT of the hook. Refactor `/results` to use it (remove the inline parallel, SR-34). **This is the WS-3 enabler (R1)** — WS-3's dead-control dispositions consume it.

### 4.3 Payroll export: surface + name the hierarchy gap
**Verified:** `generatePayrollCSV` EXISTS (Entity ID, Name, Total, period); **hierarchy ABSENT** (lives in `entity_relationships`, not denormalized onto `calculation_results`). **Work:** surface the export in the Calculation results flow (the sign-off→export demo path); **HALT-EXPORT** — assemble what's persisted + NAME the hierarchy gap (a join from `entity_relationships` if cheap, else the column is documented as the remaining gap). Do NOT fabricate hierarchy. **SR-38:** monto = persisted `total_payout`.

### 4.4 Commits (per fix)
`fix(OB-211 WS7-C): results-table access double-gate + G1 server COUNT` ·
`refactor(OB-211 WS7-C): extract useDrillThrough (the WS-3 enabler)` ·
`feat(OB-211 WS7-C): surface payroll export in Calculation flow; hierarchy gap named (HALT-EXPORT)`

---

## §5 — GATES + THE BATCHED SWEEP

### 5.1 Per-item re-verify (the verified bug flips to closed)
- WS-A #2: a rep requesting another `entityId` is DENIED at the read (paste); no arbitrary picker. WS-A #1: a non-Finance tenant direct-nav to `/financial` → DENIED at the route (paste both tenants).
- WS-B: sidebar agent-governed; Finance ABSENT for non-Finance tenant (menu gate now live); results-table under Calculation.
- WS-C: tenant admin reaches the results table (double-gate collapsed); count server-side (G1); `useDrillThrough` unifies the two states; export surfaces with hierarchy gap named.

### 5.2 The batched adversarial sweep (ELEVATED: access + entitlement, now closing real bugs)
- **access-correctness (ELEVATED):** the statement scope holds through the READ (param change denied at the data layer); the results-table gate doesn't widen beyond `view.all_results`. Verify both.
- **Finance entitlement (ELEVATED):** denied at the ROUTE and hidden in the MENU for a non-Finance tenant — both layers. Verify direct-nav denial.
- **right-by-luck/SR-38:** export monto = engine value; G1 count = true server count.
- **Korean Test, scale:** standard.
Every HIGH fixed + re-verified.

### 5.3 Build
tsc --noEmit → 0. `npm run build` exit 0. localhost:3000.

### 5.4 Proof gates
| PG | PASS |
|---|---|
| SEC-statement | rep→own statement only; another entityId DENIED at the read (not hidden). Paste the denial. |
| SEC-finance-route | non-Finance tenant direct-nav to `/financial` → DENIED at route; Finance tenant → allowed. Both pasted. |
| NAV-agents | sidebar governed by Calculation/Performance/Finance/Platform Core; Consolidate gone; results-table under Calculation. Screenshot. |
| NAV-finance-menu | Finance section ABSENT for non-Finance tenant (menu gate live), PRESENT for Finance tenant. Both. |
| TABLE-gate | tenant admin (view.all_results) reaches the results table (double-gate collapsed); not cross-tenant. |
| TABLE-G1 | count from server COUNT, not results.length; correct at >1000 entities. |
| DRILL | useDrillThrough unifies drillAnomaly + expandedEntity; row drill + Full Trace intact; no new signal path. |
| EXPORT | export surfaces in Calculation flow; monto = persisted (SR-38); hierarchy gap named (not fabricated). |
| KoreanTest | agent vocab + gate logic structural; no domain literal. |
| Build | tsc 0 + build exit 0. |
| PER-ITEM SR-44 | each renders/enforces on the live tenant; architect confirms. |

### 5.5 PRs (dependency-ordered, each SR-44-gated)
WS-A: `OB-211 WS7-A: two HALT-ACCESS closures (statement leak + Finance route gate)` →
WS-B: `OB-211 WS7-B: agent-governed nav keystone + Finance menu gate` →
WS-C: `OB-211 WS7-C: results-table gate+G1, useDrillThrough extraction, payroll export hierarchy`

---

## §6 — HALT CONDITIONS
- **HALT-GENERAL:** about to build what exists (export/table/statement/nav system/gate mechanism). Fix/reorganize/compose.
- **HALT-STMT:** privileged-viewer use of `perform/statements` is real → scope-lock (admin=tenant, manager=team), don't retire; never leave the param/picker unguarded.
- **HALT-EXPORT:** hierarchy not joinable cheaply → assemble persisted columns + name the gap; no fabrication.
- **HALT-ACCESS-READ:** a scope (statement/table) can't be enforced at the read, or Finance can't be denied at the route → report; these are confidentiality/entitlement gates, not display preferences. Do NOT ship a UI-only hide for a data-exposure bug.
- **HALT-NAV:** (not expected — verification cleared it) agent grouping needs a schema change → reorganize within the existing structure.
- **HALT-LOCKED:** any locked rule (Korean Test, DS-014, regime ADR, SR-34, Bloodwork) conflicts. Surface verbatim per SR-42.

---

## §7 — REPORTING
Per-workstream completion reports + a campaign summary. Each per Rules 25-28: SHA, the verified-bug→closure evidence (the SR-39 denial pasted for both access bugs), the nav reorganization, the verified fixes + re-verify, the batched sweep findings, build+tsc, PR URLs. Confirm: bugs closed at the read/route (not UI-hidden); nav reorganized not replaced; export/table/statement composed not rebuilt; nothing dropped from the comprehensive scope.

```
ARTIFACT SYNC (WS7-rev execution)
MC: WS-7-rev EXECUTED end-to-end — the two HALT-ACCESS confidentiality/entitlement bugs CLOSED at the read/route (lead increment); agent-governed nav reorganized (Calculation/Performance/Finance/Platform Core, Consolidate removed, Finance gated at route+menu); verified fixes shipped (results-table double-gate+G1, useDrillThrough extraction, payroll export hierarchy named). The comprehensive body of work completed, security first, nothing abandoned. Pending per-item SR-44.
REGISTRY: "Statement Scope" → enforced through the read (param-leak closed); "Finance Entitlement" → denied at route + hidden in menu (both layers); "Agent-Governed Nav" → Calculation/Performance/Finance/Platform Core; "Results Table" → tenant-admin-reachable, server-COUNT, drillable; "useDrillThrough" → extracted (WS-3 enabler); "Payroll Export" → surfaced, hierarchy gap named. Calculation/Performance/Finance agents formalized.
R1: Tier-C "statement scope holds through read; Finance gated per tenant at route; nav agent-governed; results table reachable+drillable; export surfaced" → pending SR-44.
BOARD: WS-7-rev complete (security + nav + fixes); the dynamic-Simulate design thread remains queued (not abandoned — a separate design discussion).
SUBSTRATE: SR-39 enforced at the read/route (the two closures); ultracode orchestration (security-lead + nav-keystone + parallel fixes + one batched elevated sweep — cost once); agent-governed nav (capability-map identity); Finance = entitlement at two layers; useDrillThrough = WS-3 enabler; verify-then-build proved the builds existed and surfaced the real bugs; comprehensive scope completed without derailment.
```

---

## §8 — THE LARGER EFFORT (explicitly NOT abandoned)
This directive completes WS-7-rev. The defined campaign continues; nothing here drops it:
- **WS-2 inc-2b** (B1 expand/react + the full C3 cross-surface generalization) — `useDrillThrough` is extracted HERE (§4.2), so inc-2b's C3 consumes it; B1 remains.
- **WS-3 dead controls** — consumes the extracted `useDrillThrough`; the dead-control inventory (the 19 + no-handler buttons) is its scope.
- **WS-4/5/6** — Manager/Individual results surfaces, FM/Finance build-out, action proximity — the persona surfaces composing from the established pattern.
- **The dynamic-Simulate design** (structure-derived, actionable per the Thermostat principle — tiered→cross-boundary, attainment-rate→close-the-gap, flat→volume-action) — a QUEUED DESIGN discussion (the architect set it down deliberately; it is not lost). It warrants a design document before a directive, and likely leverages the #508 regime classifier as the structural signal.
- **i18n debt** — `WhatIfSlider` hardcoded Spanish chrome (Korean-Test-adjacent) — scope into a surface workstream.

## §8A — RESIDUALS
- R1 — `useDrillThrough` (extracted here) is the WS-3 enabler.
- R2 — payroll hierarchy column (HALT-EXPORT — `entity_relationships` join or documented gap).
- R3 — dynamic-Simulate design (queued, design-doc-first, likely #508-classifier-driven).
- R4 — Finance agent's unbuilt capabilities (month-end/margin/scenarios — the map lists 6).
- R5 — manager-scoped export/statement (the privileged-viewer scope-lock generalizes).
- R6 — i18n localization of the primitives.
- R7 — R1 exit criteria on per-item SR-44.
