# OB-211 WS-7 (REVISED): AGENT-GOVERNED NAVIGATION + THE THREE DEMO CAPABILITIES IN THEIR CORRECT AGENT HOMES — VERIFY-THEN-BUILD

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-15 (architect channel)
**Type:** OB-211 WS-7, REVISED. The navigation, module selection, and permissions are reorganized to be governed by the AGENTS (Calculation / Performance / Finance / Platform Core) per the authoritative capability map — and the three demo capabilities land in their correct agent homes. **Ultracode-orchestrated: CC fans out the verification, builds the nav-keystone, then parallelizes the disjoint capability work against it, with one batched adversarial sweep.** Verify-first preserved. Continues the campaign loop.
**Supersedes:** the prior `OB-211_WS7_DEMO_CAPABILITIES_DIRECTIVE` (which scoped the three capabilities but against the OLD verb-spine). This revision carries the agent-nav reorganization as the design basis AND the demo capabilities.
**Gate:** Proceed after architect SR-44 confirms #515 merged (it is — `28d7517e`) and HF-293 (Simulate activation) is dispatched/merged (architect running separately — coordinate; the rep statement surface, Performance, is where HF-293's rep-own slider lands, so verify HF-293's state, do not rebuild it).
**Branch:** CC's choice — a Phase-0 verification branch, then the nav-reorganization + per-capability resolution as architect-SR-44-gated increments. Never push to main directly. tsc --noEmit before every push.

**THE GOVERNING CORRECTION (architect-ruled, this revision's basis):**
The navigation is currently organized by VERBS (`WorkspaceId = decide | calculate | consolidate | platform-core`, labels "Decide/Calculate/Consolidate"). The AGENTS — the capability map's organizing structure and the actual agent architecture — are **Calculation / Performance / Finance / Platform Core**. The nav must be governed by the AGENTS. Critically:
- **Platform Core** = always-on SUBSTRATE (every tenant) — NOT a destination tab. Proof layers, access, audit, privacy, flywheels, Spanish/currency, ask-anything, AND configuration (periods/people/users live here as settings).
- **Calculation** = base-platform agent (run the engine, pay people).
- **Performance** = base-platform agent (see, benchmark, act).
- **Finance** = a LICENSABLE agent, GATED PER TENANT via `tenants.features` — a tenant like Sabor Group HAS the Finance agent and sees the financial module; a tenant WITHOUT it never sees those reports. Finance is an ENTITLEMENT, not a verb. **"Consolidate" was a false peer (OB-207 invented it to balance a three-verb spine) and is REMOVED.**
The capability-map agent NAMES govern identity + permissions. Capabilities are organized by NATURE (substrate / destination / contextual), not as a flat 33-item list.

**Governing specs:** the authoritative capability map (the four agents + their capabilities — `capability-map (1).html`), DS-014 (access scoping + the single PDP), the existing `tenants.features` gating (`workspace-config.ts:222-224` — featureFlag drops a section when the tenant lacks the feature; FP-49), DS-013 (Five Elements, persona density), the OB-207 Regime ADR, #509 field-identity, #510 signal, HF-293 (rep-own Simulate — lands on Performance), Korean Test, SR-34, Bloodwork.

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Binding: AP-25 (Korean Test — agent/capability identity structural, no domain literals in the nav config beyond the agent vocabulary), SR-34 (reorganize the existing nav; do not build a parallel nav system), SR-38 (export/statement values trace to the engine payout), SR-39 (access scoping — the results table, statement, and export are access-correct; Finance gating is an entitlement boundary), SR-41, SR-42, SR-43, SR-44. Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**Leverage, do not create:** the gating mechanism EXISTS (`tenants.features` + the featureFlag filter); the statement surface EXISTS (OB-171); EntityTable EXISTS; the workspace config EXISTS (reorganize it, don't replace it); HF-293's rep-own Simulate lands on Performance (verify, don't rebuild). **HALT-GENERAL** if about to build a new nav system, a new gating mechanism, or a greenfield surface where one exists.

**Read-before-assume:** every premise in this directive was verified in code (the nav is verb-governed; Finance gating is `featureFlag: 'financial'` at workspace-config.ts:123; the filter at :222-224; the statement page exists; EntityTable exists). CC re-reads each slice before changing it.

**FP-49:** the Finance-agent gate reads `tenants.features` (the live field, per OB-207 Inc2); the export/statement read tenant+persona-scoped data. Confirm columns before writing.

AUTONOMY: NEVER ask yes/no. Act. tsc --noEmit before push. Git from repo root.

**Reconciliation-channel separation:** No ground-truth values.

---

## §1A — ULTRACODE ORCHESTRATION (CC states the plan, then executes)

CC commits an orchestration plan (`docs/architecture/WS7_REV_ORCHESTRATION_20260615.md`) and executes it. This work has parallelizable structure — use it:

**The understand/verify fan-out (Phase 0, parallel reads):** one fan-out over the disjoint verification targets — (a) the nav state (verb→agent mapping in workspace-config.ts/navigation.ts), (b) payroll export (does an endpoint exist), (c) admin results table (EntityTable / `/operate/results` state + G1 + access-gating), (d) rep statement (`perform/statements` rep auto-resolution + HF-293 slider state), (e) the Finance gate (does `tenants.features['financial']` hold at the route, not just the menu), (f) HF-293's merge state. Each a scoped read producing evidence + verdict. One verified map (replaces serial Phase-0 reads).

**The build orchestration (keystone-then-parallel):**
- **KEYSTONE (sequential, first): the nav reorganization (§2).** The agent structure defines WHERE the capabilities live, so it lands first — the capability work builds against the agent homes it establishes. Same pattern as WS-2's keystone.
- **THEN parallel (disjoint trees against the keystone):** payroll export (new Calculation export path) ∥ admin results table (EntityTable in Calculation + G1 + drill) ∥ rep statement (perform/statements in Performance + rep-resolution + verify HF-293 slider). These touch separate files → parallelize.
- **THE SEQUENCING CONSTRAINT (state it, don't discover it):** the nav reorg and the capability placement both touch where surfaces live — the nav reorg MUST land before (or be coordinated with) the capability work so the capabilities have their agent homes. CC states how it sequences/coordinates this; do not parallelize the nav reorg against the capability placement blind.
- **THE DRILL MECHANISM (shared):** the C3 `useDrillThrough` extraction (§3.4) is a shared dependency the results-table drill consumes — extract it once, the table build consumes it (sequence accordingly).

**The adversarial sweep (one, batched over the build):** the dimensions that bite — ELEVATED here: **access-correctness** (export/statement scope through the READ — a param change must not leak another's data) and **the Finance entitlement boundary** (a non-Finance tenant denied at the ROUTE, not just hidden) — plus right-by-luck/SR-38 (export monto + statement payout = engine value), Korean Test, scale (G1). Run once over the batch (nav + the three capabilities), not per-capability. Every HIGH fixed + re-verified.

**The merge strategy:** the nav-keystone + each capability as architect-SR-44-gated increments, dependency-ordered (nav reorg → capabilities → sweep-fixes). CC states branch/merge.

CC states this plan, then executes — the fan-out + batched sweep paid once across WS-7-rev, not per-piece.

## §1 — PHASE 0: VERIFY (the nav state + the three capabilities)

CC produces `docs/completion-reports/WS7_REV_VERIFICATION_20260615.md`. Two parts:

### 1.1 The nav state (confirm the misalignment + the gating mechanism)
- Confirm: `WorkspaceId` is verb-based (decide/calculate/consolidate/platform-core); the labels are verbs; there is no agent-name concept in the nav.
- Confirm: the Finance gate is `featureFlag: 'financial'` (workspace-config.ts:123) filtered at :222-224 against `tenants.features`. This is the entitlement mechanism the Finance agent uses.
- Map: each current workspace's routes → which AGENT they belong to per the capability map (the reorganization target).

### 1.2 The three demo capabilities (verify-first — the ledger is wrong both ways)
| Capability | Agent home (ruled) | Verify | Likely state |
|---|---|---|---|
| Payroll export | **Calculation** | is there ANY export endpoint? (initial read: none found) | likely the real build (small — assembles persisted results) |
| Admin results table | **Calculation** (sign-off → export flow) | what does EntityTable / `/operate/results` render? access-gated? counts server-side? | likely access + G1 + cleanliness, NOT absence |
| Rep statement | **Performance** | does `perform/statements/page.tsx` (OB-171) resolve a logged-in rep to THEIR own entity + render? does HF-293's rep-own Simulate land here? | likely verify-and-close (rep auto-resolution); HF-293 slider verify |

**HALT-0:** any item needing an authenticated browser CC can't mint → flag architect-SR-44-required; no blind verdict.

**Commit:** `docs(WS7-rev): Phase-0 verification — nav state (verb→agent map) + the three capabilities' real state + agent homes`

---

## §2 — THE NAVIGATION REORGANIZATION (the design basis)

Reorganize the EXISTING workspace config (`workspace-config.ts` + `navigation.ts` types) to be governed by the AGENTS. **SR-34: reorganize, don't replace.**

### 2.1 The agent structure
- **Platform Core** — substrate. NOT a top-level destination tab. Its capabilities are always-on (proof/audit/flywheels are infrastructure, surfaced contextually — e.g. forensics on every number, not a menu) and its NAVIGABLE part is CONFIGURATION (periods/people/users) — accessed as settings, not as a peer "workspace" to the agents. Keep periods/people/users reachable (they exist at `/configure/*`); reframe them as Platform Core settings, not a verb-workspace.
- **Calculation** — agent. Owns (per the map): comp-plan parameterization, multi-incentive, territory, **payroll-ready reports/export**, **payout approvals & sign-off**, plan version history, exception approval, dispute resolution, forensics drill-down. Current routes (import/calculate/cockpit/results) map here; the demo's **admin results table + payroll export** land here.
- **Performance** — agent. Owns (per the map): opportunity detection, next-best-action, benchmarking, alerts, pilot/rollout, coaching, forecast, **rep/manager/company dashboards**. Current `/stream` maps here; the demo's **rep statement** lands here.
- **Finance** — LICENSABLE agent, GATED. The `/financial/*` routes are its capabilities (month-end, revenue classification, margin, scenarios, cost-of-incentive, reconciliation, the FM hierarchy). **Gated via `tenants.features` — the EXISTING featureFlag mechanism, ELEVATED from "a flag on the financial section" to "the Finance agent is or isn't in this tenant's nav."** A tenant without the Finance feature does NOT see the Finance agent at all.

### 2.2 The naming
The nav surfaces the AGENT names (Calculation / Performance / Finance / Platform Core) as the governing identity — replacing the verb labels (Decide/Calculate/Consolidate). The verb may remain as a subtitle/action descriptor if useful, but the AGENT is the identity. **Korean Test:** the agent vocabulary is the structural identity; no domain-tenant literals.

### 2.3 Capabilities organized by NATURE (not a flat list — the spatial principle)
NOT every capability is a menu item. The organizing principle:
- **Substrate** (Platform Core: proof, audit, privacy, flywheels) → always-on, surfaced contextually, NOT menu items.
- **Destination** (the agent's primary surfaces: Calculation's lifecycle/results, Performance's stream/dashboards, Finance's FM views) → the navigable entries.
- **Contextual** (forensics drill-down, next-best-action, dispute) → surface ON the relevant object (forensics on every number, dispute on the statement line, next-best-action on the opportunity) — reached by DRILLING IN, not via a menu item. **This is where the drill-down work (the C3 shared mechanism) is the depth behind each agent's surfaces.**

### 2.4 Permissions follow the agent
Workspace visibility + route capability gating stay on the existing single-PDP + `tenants.features` mechanism — now keyed to the AGENT (a tenant has Calculation + Performance + Platform Core always; Finance only if licensed; a role sees an agent if it has ≥1 capability in it). **HALT-NAV:** the existing capability matrix can't express agent-level grouping without a schema change. Report; reorganize within the existing structure (the agents are a regrouping of existing routes + the existing gate).

### 2.5 Commit
`feat(OB-211 WS7-rev): agent-governed navigation — Calculation/Performance/Finance/Platform Core; Finance licensable-gated (tenants.features); Consolidate removed; capabilities by nature`

---

## §3 — THE THREE DEMO CAPABILITIES IN THEIR AGENT HOMES (build only verified gaps)

### 3.1 Payroll export → CALCULATION (the demo climax)
A scoped export producing the downloadable file {entityId, name, hierarchy, period, payout}, living in the Calculation agent (the sign-off → export flow). Assembles ALREADY-PERSISTED results (SR-38: monto = engine `total_payout`). Access-scoped (SR-39: admin tenant/batch, manager team, rep own). Hierarchy from entity fields (Korean Test). Triggered from the Calculation results surface (§3.2) — the export is where the demo climaxes. **HALT-EXPORT:** hierarchy fields not on the persisted result → assemble what's persisted + name the missing column; no fabrication.

### 3.2 Admin results table → CALCULATION (sign-off context)
Close the verified gap (likely access + G1 + cleanliness): the demo admin reaches a clean results table (ID/name/components/total) in the Calculation agent; counts from server COUNT (the existing helpers — G1); each row DRILLS (the C3 mechanism) into the entity's detail. The table is the sign-off context that LEADS TO the payroll export (§3.1) — one Calculation-agent flow: review results → export to payroll.

### 3.3 Rep statement → PERFORMANCE (the rep's view of their own outcome)
Close the verified gap (likely rep→entity auto-resolution): a logged-in rep lands on THEIR statement (no param, no picker) in the Performance agent — payout + component breakdown, regime-aware (#508/#509). **SR-39/HALT-4:** rep resolves to THEIR entity only; a param change MUST NOT leak another's statement. **HF-293's rep-own Simulate lands HERE** — verify it renders on this Performance surface (do not rebuild it; HF-293 owns it). The statement is the rep's Performance home: their outcome + their own what-if.

### 3.4 Drill-down as the depth (the contextual layer, the C3 mechanism applied)
The held-back C3 shared `useDrillThrough` is the connective tissue:
- Calculation results table → row drill → the entity's detail/statement-view.
- Forensics drill-down (the capability map's Calculation capability) → on every number, trace to source.
This is the "depth behind the agent surfaces, not menu items" principle made real. **SR-34:** extract the shared mechanism (remove the inline parallel on /results); per-surface adapter for context. **HALT-C3-ADAPTER:** a surface's drill needs context it can't supply — extract what generalizes, note the remainder.

---

## §4 — GATES + ADVERSARIAL SWEEP

### 4.1 Per-item re-verify
- Nav: the sidebar shows Calculation/Performance/Finance/Platform Core; Finance is ABSENT for a tenant without the feature, PRESENT for one with it (test both — e.g. Sabor vs a non-Finance tenant). Platform Core is substrate (config-as-settings, not a verb-peer). Paste the rendered nav for a Finance and a non-Finance tenant.
- Export: downloadable file, 5 columns, monto = persisted payout (SR-38), scope-correct (SR-39).
- Results table: in Calculation; the admin reaches it; counts server-side (G1); rows drill.
- Statement: in Performance; rep auto-resolves to own (no param/picker); access-correct; HF-293 slider present.
- Drill: the shared mechanism is live; a row drills to the entity detail.

### 4.2 Adversarial sweep (ELEVATED: access-correctness + the Finance entitlement boundary)
- **access-correctness (ELEVATED):** the export + statement are access-scoped through the READ (a param change must NOT leak another's data — the #515/#510 lesson: scope holds through the query, not just the UI). A rep sees/exports only their own.
- **Finance entitlement (ELEVATED):** a tenant WITHOUT the Finance feature must NOT be able to reach the Finance agent's routes — not just hidden in the sidebar, but gated at the route (a non-Finance tenant navigating directly to `/financial/*` is denied). Verify the gate holds at the route, not only the menu.
- **right-by-luck / SR-38:** export monto + statement payout = engine value (the #515 dollar lesson).
- **Korean Test, scale (G1):** standard.
Every HIGH fixed + re-verified.

### 4.3 Build
tsc --noEmit → 0. `npm run build` exit 0. localhost:3000.

### 4.4 Proof gates
| PG | PASS |
|---|---|
| NAV-agents | sidebar governed by Calculation/Performance/Finance/Platform Core; verb labels replaced; Platform Core as substrate (config-as-settings). Screenshot. |
| NAV-finance-gate | Finance agent PRESENT for a Finance-licensed tenant, ABSENT for a non-Finance tenant; gate holds at the route (direct nav denied for non-Finance). Both cases pasted. |
| EXPORT | downloadable {ID,nombre,jerarquía,período,monto} in Calculation; monto=persisted (SR-38); scope-correct (SR-39). The demo climax. |
| TABLE | clean results table in Calculation; server COUNT (G1); rows drill; leads to export. |
| STATEMENT | rep auto-resolves to OWN statement in Performance; access-correct; HF-293 rep-own Simulate present. |
| ACCESS | SR-39: rep export/statement scoped to self through the read; manager to team; no param-leak. |
| DRILL | shared useDrillThrough live; row→entity detail. |
| KoreanTest | agent/capability identity structural; export columns from entities/rule_sets; no domain literal. |
| Build | tsc 0 + build exit 0. |
| PER-ITEM SR-44 | each renders on the live tenant; architect confirms (nav by agent; Finance gated; export downloads; rep opens own statement; admin drills). |

### 4.5 PR(s)
Title e.g.: `OB-211 WS7-rev: agent-governed nav (Calculation/Performance/Finance-gated/Platform Core) + demo capabilities in agent homes (export→Calculation, statement→Performance)`
Body: the verb→agent reorganization; Finance as licensable-gated (existing tenants.features, elevated); Consolidate removed; the three capabilities verified then closed in their agent homes; access-correctness + Finance-entitlement verification; the drill-down as contextual depth.

---

## §5 — HALT CONDITIONS
- **HALT-0:** a capability's state needs an authenticated browser. Flag architect-SR-44-required; no blind verdict.
- **HALT-GENERAL:** about to build a new nav system / new gating mechanism / greenfield surface where one exists. Reorganize/compose/verify.
- **HALT-NAV:** the capability matrix can't express agent grouping without a schema change. Reorganize within the existing structure (agents = regrouping + existing gate); report if a schema change is genuinely needed.
- **HALT-EXPORT:** hierarchy fields not on the persisted result. Assemble what's persisted + name the gap.
- **HALT-4:** a rep can't be resolved to exactly their own entity. Never show a rep another's statement or a picker.
- **HALT-ACCESS:** export/statement scope can't be enforced at the read; or the Finance gate can't be enforced at the route. Report — these are confidentiality/entitlement gates, not display preferences.
- **HALT-C3-ADAPTER:** a surface's drill needs context it can't supply. Extract what generalizes; note the remainder.
- **HALT-LOCKED:** any locked rule (Korean Test, DS-014, regime ADR, SR-34, Bloodwork) conflicts. Surface verbatim per SR-42.

---

## §6 — REPORTING
`docs/completion-reports/OB-211_WS7_REV_COMPLETION_REPORT_20260615.md` — the Phase-0 verification (nav verb→agent map + the three capabilities' state), the nav reorganization (agents, Finance gating, Consolidate removed, Platform Core as substrate), per-capability resolution + re-verify in the agent homes, the SR-39 access + Finance-entitlement verification (scope/gate through the read/route), the SR-38 payout traces, the drill-down extraction, SHA, build+tsc, PR URL(s). Confirm: nav reorganized not replaced; gating mechanism reused not rebuilt; statement/table composed not rebuilt; HF-293 slider verified not rebuilt; built only verified gaps.

```
ARTIFACT SYNC (WS7-rev)
MC: navigation reorganized to AGENT governance (Calculation/Performance/Finance/Platform Core); Finance as licensable-gated (tenants.features, elevated from section-flag to agent); "Consolidate" verb removed; Platform Core as substrate. The three demo capabilities VERIFIED then closed in their agent homes: payroll export + admin results table → Calculation (sign-off→export flow); rep statement → Performance (HF-293 rep-Simulate lands here). Drill-down (C3) as contextual depth. Pending per-item SR-44.
REGISTRY: "Agent-Governed Nav" → Calculation/Performance/Finance/Platform Core; "Finance Agent" → licensable, tenant-gated; "Payroll Export" → Calculation, downloadable, scoped; "Admin Results Table" → Calculation, server-COUNT, drillable, →export; "Rep Statement" → Performance, auto-resolved, access-correct, HF-293 Simulate; "Drill-Down" → shared useDrillThrough (contextual depth). Calculation/Performance agents advance on the demo path; Finance agent gating formalized.
R1: Tier-C "nav governed by agents; Finance gated per tenant; payroll export downloads; rep opens own statement; admin drills results" → pending SR-44.
BOARD: agent-governed navigation established; demo critical-path capabilities in their agent homes.
SUBSTRATE: ultracode orchestration (parallel verify fan-out + nav-keystone + parallel disjoint capability builds + one batched sweep — cost paid once); agents govern nav/permissions (capability-map identity); Finance = entitlement not verb (existing tenants.features gate elevated to agent level); Platform Core = substrate not destination; capabilities by nature (substrate/destination/contextual); drill-down = depth behind surfaces not menu items; verify-then-build (ledger wrong both ways); access-correctness + Finance-entitlement through the read/route; HF-293 rep-Simulate composed not rebuilt.
```

---

## §7 — OUT OF SCOPE
- HF-293 itself (architect running separately — this verifies its rep-Simulate lands on the Performance statement surface, does not rebuild it).
- WS-2 inc-2b (B1 expand, C3 full extraction beyond the demo drill) — C3's shared mechanism is extracted here for the demo drill; the full cross-surface generalization is inc-2b.
- WS-3/4/5/6 broad surfaces beyond the demo path + the nav reorganization.
- Engine 🟠/🔴; OB-201; DS-027 (unless Phase 0 shows the results-table access gate IS a DS-027 dependency — then HALT-NAV).
- The Finance agent's FULL capability build-out (month-end/margin/scenarios) — this formalizes Finance as a gated agent + reorganizes its existing `/financial/*` routes under it; building the not-yet-built Finance capabilities is later.

## §7A — RESIDUALS
- R1 — the extracted `useDrillThrough` is the WS-3 enabler; WS-3 consumes it.
- R2 — Finance agent's unbuilt capabilities (the map lists 6; the `/financial/*` routes cover some) — build-out follows.
- R3 — manager-scoped export/statement (verifies admin + rep for the demo; manager follows the same boundary).
- R4 — agent-level permission refinement (this reorganizes onto the existing PDP + features gate; finer per-agent licensing follows).
- R5 — R1 exit criteria on per-item SR-44.
