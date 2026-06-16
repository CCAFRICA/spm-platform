# OB-207 INCREMENT 2: PERSONA+MODULE SURFACES + COCKPIT + ACTION PROXIMITY + RBAC BINDING

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-14 (architect channel)
**Type:** OB Increment 2 — the surfaces hung on the OB-207 agent-nav spine, plus the RBAC/module-access binding that makes the agent-workspaces capability-gated. Ships code across the cockpit, per-persona/per-module results, FM views on committed_data, action wiring, and the capability↔workspace binding. One PR.
**Number:** OB-207 Increment 2 — continues OB-207 (Increment 1 = spine + routing, PR #506). **Branch:** `ob-207-inc2-experience-surfaces` off `main` AFTER #506 merges. **Collision gate (Phase 0, mandatory):** CC runs `git log --all --oneline | grep -iE 'OB-207'` and confirms #506 (Increment 1) is on main; if the spine is NOT on main, HALT — Increment 2 hangs on it.
**PR:** to `main`. Never push to main directly.
**Governing specs:** OB-207 Increment 1 (the spine — `AGENT_NAVIGATION_ADR_OB207.md`, `WORKSPACES` config, `WorkspaceId` union), DS-014 (Access Control — capability matrix, module-aware permissions, single PDP `permissions.ts`, four PEPs), DS-019 (Identity derivation chain Login→Role→Capabilities→Module Access→Persona), DS-013 + DS-015 + SH_UI_TO_BUILD (persona surfaces, V1 ranking, element tables), FM_Views_Data_Persona_Analysis (FM 5-level hierarchy, A.24), MISSION_CONTROL_LIVING_SYSTEM + TMR-3 (Compensation Clock), DS-008-A3 (Action Card), Decision 128, Decision 123 (transparent architectural compliance), TMR-7/TMR-8, DS-029 (carrier).
**Closes:** OB-207 F-2 (persona results), F-3 (Financial module), F-4 (cockpit), F-5 (action proximity) — the surfaces Increment 1 scoped forward. PLUS the RBAC binding: the agent-nav spine becomes capability-gated per DS-014.

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Binding: AP-25 (Korean Test — capability names structural NOT domain: `data.calculate` never `can_calculate_commissions`; module selection structural), SR-34, SR-38 (math review gate for computed intelligence/Pulse), SR-39 (Compliance Verification Gate — **fires**: this OB touches access control, module-access gating, persona-scoped reads, agent_inbox/audit_logs writes; see §8), SR-41, SR-42, SR-43, SR-44 (production browser verification = architect only). Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**FP-49 SQL Verification Gate (MANDATORY — this OB has a confirmed schema correction):** Increment 1's report found `audit_logs` has NO `actor_id` column. Per `SCHEMA_REFERENCE_LIVE.md` the column is **`profile_id`**. Every audit_logs write in this OB uses `profile_id`, `action`, `resource_type`, `resource_id`, `changes`, `metadata`. BEFORE writing any SQL or any query touching `audit_logs`, `agent_inbox`, `profiles.module_access`, or `tenants` module fields, CC runs a tsx service-role `information_schema.columns` read and pastes the actual columns. No query ships against an assumed column.

AUTONOMY: NEVER ask yes/no. Act. Commit + push after every phase. Git from repo root (`~/spm-platform`), NOT `web/`.

**Reconciliation-channel separation:** No ground-truth values. Rendered calc/Pulse values read live; PG figures (e.g., BCL $44,590) are render-fidelity checks against what the DB holds, not reconciliation targets.

**Architecture Decision Gate (before Phase 1 code):** Phase 1 authors the capability↔workspace binding ADR. CC commits it before binding code.

**Vertical Slice (skeleton-first within this increment):** Phase 1 (RBAC binding) is the structural prerequisite — it makes the spine capability-gated. Phases 2–5 hang one surface each. If execution must stop, each completed phase is independently shippable and the binding stands.

---

## §1 — PROBLEM STATEMENT

### 1.1 What Increment 1 shipped, and what remains

OB-207 Increment 1 (PR #506) delivered the agent-nav spine (Calculate/Decide/Consolidate workspaces + Platform Core foundation, `WORKSPACES` config, ADR) and verified routing convergence. It deferred — correctly, to avoid half-built surfaces — the substance: the cockpit, per-persona/per-module results, FM views on committed_data, and action wiring. Merging the spine did not change what the user experiences; the surfaces are this increment.

### 1.2 The RBAC dimension (architect-added)

The four agents are not only navigation — they are the same four-way structure that governs access (DS-014/DS-019):
- **Platform Core** = the platform/tenant layer: identity, provisioning, tenant setup, module enablement. The `platform.*` and `tenant.*` capabilities, `modules_enabled`, and `module_access` live here. This is why Platform Core is the always-on foundation — it is the RBAC/provisioning substrate every workspace derives from (DS-019 chain: Login → Role → Capabilities → Module Access → Persona).
- **Calculate / Decide / Consolidate** = the three module-capability domains. A user's `module_access` ({"icm":"admin","financial":"viewer"}) gates which agent-workspace they can ACT in, per module. ICM-admin/Financial-viewer operates Calculate+Decide on ICM but only reads Consolidate's Financial views.

The nav spine, the capability matrix, and the provisioning model are three views of one structure. Increment 1 built the nav view with a `ROLE_WORKSPACE_ACCESS` map. This increment binds that map to the DS-014 single PDP (`permissions.ts`) and module_access, so workspace access derives from capabilities — not a parallel role list (DS-014 §3.2 one-source-of-truth; the parallel-list anti-pattern is the F-38 role-vocabulary-divergence class).

### 1.3 The live failures these surfaces close

- **F-2:** /results is one ICM-shaped page for all personas (the Results Proof View). Per-persona + module-aware redesign needed.
- **F-3:** Financial module orphaned; FM 5-level hierarchy must read committed_data (A.24, DS-029), not the legacy pipeline.
- **F-4:** /operate is the old page; must become the lifecycle cockpit.
- **F-5:** dead/unintelligible controls (Recognize, Coach/Intervene, Investigate/Resolve, Simulate); wire to agent_inbox/audit_logs or disable+tooltip.

### 1.4 Defect-class lineage

FP-67 (dashboard not intelligence), Action-Proximity dead controls, F-38 role-vocabulary divergence (parallel access lists vs the single PDP), architect-directive deferral (the surfaces, now built).

---

## §2 — SUBSTRATE-BOUND DISCIPLINE

**DS-014 single PDP + four PEPs:** one `permissions.ts` defines a role's capabilities; middleware/server/client/RLS all call it. The workspace access for the nav spine derives from this — `getWorkspaceForRole`/`ROLE_WORKSPACE_ACCESS` (Increment 1) is re-keyed to call `hasCapability` against the matrix, not an independent role list. **Korean Test:** capabilities structural (`data.calculate`, `data.import`, `view.team_results`), module filter applied at the PEP, never embedded in capability names.

**DS-019 module-aware PEP:** `hasCapability(role, capability) AND module_enabled(tenant, module)`. A workspace tied to a module (Consolidate→Financial) renders only if the tenant has the module AND the user's `module_access` grants it. CC verifies whether live schema uses `profiles.module_access` JSONB (DS-014 §9.1) or `tenant.modules_enabled` (DS-019 §6.3) or both, and gates accordingly (FP-49).

**Persona × module matrix (DS-013 §5 + FM analysis):** persona (role-derived) sets surface emphasis; module (access-derived) sets surface content. Admin-ICM → governance results; Manager-ICM → coaching; Member-ICM → growth; Franchisor-Financial → FM Network/Brand; Location-mgr-Financial → FM Location; Server-Financial → personal (mobile-ready).

**Compensation Clock (TMR-3):** Cycle/Queue/Pulse one source of truth, action-verb labels, Bloodwork-silent. The Queue is persona-scoped (peripheral oscillators) — Admin operational items, Manager team items, Rep personal items — which is itself an RBAC expression (the Queue shows what your capabilities let you act on).

**A.24 (plan-data independence):** same committed_data transaction = revenue (Consolidate) or commission (Calculate), no duplicate import. FM views read committed_data via DS-029 carrier path.

**Action Proximity (TMR-5) + agent_inbox/audit_logs:** every control → concrete result. Recognition → `agent_inbox` row (16 cols confirmed). Coach/Intervene → `audit_logs` row using **`profile_id`** (NOT actor_id) + optional `agent_inbox` item to the rep. Unbuilt (clawback/adjustment) → disabled+tooltip.

**Decision 123 (transparent compliance):** access control emerges from architecture. Binding the nav to the PDP is this principle — the sidebar a user sees IS their capability set rendered, not a separate config.

---

## §3 — PHASE 1: BIND THE AGENT-NAV SPINE TO RBAC (capability↔workspace)

### 3.1 ADR (commit before binding code)

Author + commit `docs/architecture/AGENT_RBAC_BINDING_ADR_OB207.md`:

```
DECISION: The agent-nav spine derives from the DS-014 capability matrix + module_access, not a parallel role list.

  Platform Core (foundation)  = platform.* + tenant.* capabilities + provisioning/module enablement (DS-019 chain).
  Calculate (workspace)       = data.import / data.calculate / data.advance_lifecycle (module-scoped to ICM/enabled).
  Decide (workspace)          = view.* results + icm.simulate (persona-emphasis; module-scoped).
  Consolidate (workspace)     = data.reconcile / data.export + financial.* (module-scoped to Financial).

  WORKSPACE ACCESS = hasCapability(role, workspace_capability) AND module_enabled(tenant, workspace_module).
  ROLE_WORKSPACE_ACCESS (Increment 1) is RE-KEYED to call the single PDP (permissions.ts), not its own role list.

RATIONALE: DS-014 §3.2 one-source-of-truth; eliminates F-38 role-vocabulary divergence (the parallel-list class).
  Decision 123: the sidebar a user sees IS their capability set rendered.
REJECTED: keeping ROLE_WORKSPACE_ACCESS as an independent role→workspace map (a second source of truth that drifts).
```

### 3.2 Re-key workspace access to the single PDP

Read Increment 1's `role-workspaces.ts` (`ROLE_WORKSPACE_ACCESS`, `DEFAULT_WORKSPACE_BY_ROLE`, `WORKSPACE_FEATURE_ACCESS`) and `permissions.ts` (the DS-014 PDP). Re-key workspace access so each workspace maps to a required capability, and access is computed via `hasCapability(role, cap)` — not a hardcoded role array. Add the module filter: a workspace bound to a module renders only if `module_enabled(tenant, module)` AND the user's module_access grants it.

**FP-49:** before reading module access, CC confirms via information_schema whether `profiles.module_access` (JSONB) and/or `tenants.modules_enabled`/`features` is the live field. Paste the columns. Gate against whichever is live.

**Korean Test:** workspace→capability map uses structural capability names. **SR-34:** re-key the existing config to the PDP; do not add a third access list.

**HALT-1:** if `permissions.ts` (the DS-014 PDP) does not exist or is not the live access source (DS-027/HF-283 territory), HALT and report what the live access mechanism is — do not invent a PDP. The binding may then re-key to the live mechanism instead.

### 3.3 Commit

`feat(OB-207-inc2): bind agent-nav spine to DS-014 PDP + module_access — workspace access = capability, not parallel role list`

---

## §4 — PHASE 2: LIFECYCLE COCKPIT (F-4)

Per OB-207 §5 (carried verbatim in intent). /operate becomes the cockpit: **Cycle** (pacemaker — lifecycle pipeline, active stage highlighted, ONE action-verb control, multi-period timeline), **Pulse** (vital signs — payout+delta, entities, data freshness/T-1, reconciliation %, pending; reference frames + sparklines; Bloodwork-silent; **F-84 guard** no synthetic budget), **Queue** (self-clearing priority items from cycle state; persona-scoped per RBAC — the Queue shows what your capabilities let you act on; empty → "All caught up").

Read existing `compensation-clock-service`/`cycle`/`pulse`/`queue` (Increment 1 confirmed they exist). Wire to one source of truth (the lifecycle state machine / `state-reader.ts` that /stream uses) so cockpit and stream never disagree on the phase. /operate is reached from sidebar/stream action — NOT the landing. **SR-38:** trace one Pulse metric. **HALT-2:** services can't wire to the lifecycle state machine without net-new infra — report; render from `state-reader.ts` as minimum-viable single source.

Commit: `feat(OB-207-inc2): lifecycle cockpit — Cycle+Pulse+Queue on one source of truth, persona-scoped Queue (F-4)`

---

## §5 — PHASE 3: PERSONA + MODULE RESULTS (F-2, F-3) — the heart

### 5.1 Module awareness (A.24, RBAC-gated)

/results (under Decide) renders by what the tenant's data IS and what the user's module_access grants. ICM tenant → commission results; Financial tenant → FM revenue results from committed_data; dual-module (Sabor) → both, each gated by module_access (ICM-admin sees ICM governance; Financial-viewer sees FM read-only). **Korean Test:** module selection structural (classification signals / module_access), never domain-string-matched.

### 5.2 ICM results per persona (DS-015 §4 + SH_UI_TO_BUILD §3)

- **Admin (governance):** system health hero (payout+entities+components+anomaly count), anomaly triage with **Investigate/Resolve actions** (the current actionless "3 anomalies" is the F-2 thermometer), component cost breakdown, population distribution (fix the empty "No attainment data" — render from what IS persisted; if attainment isn't persisted, encode payout-relative-to-peer + name residual). NOT a flat entity table as primary.
- **Manager (coaching):** entity×component heatmap (real per-component values — verify OB-206's heatmap renders on the *results* surface, not only on stream; if it's stream-only, build it here for /results), coaching priority, Acceleration Cards with DEFINED actions (§7).
- **Individual (growth):** personal earnings hero, goal-gradient, allocation, component stack, dispute action. Entity from identity (**HALT-4** if unresolved — never render top earner as the user).

### 5.3 Financial results (FM hierarchy on committed_data)

FM 5-level hierarchy (Network→Brand→Region→Location→Check) reading committed_data via DS-029 carrier path, NOT the legacy pipeline. Five FM views reconnect to committed_data. Persona scopes the level (Franchisor→Network/Brand; Regional→Region; Location-mgr→Location; Server→personal). **Leakage Monitor:** only POS-supported categories (Discounts, Comps, Cancellations) per FM analysis §2 — NOT Voids/Refunds/Walkouts (fabricated-precision prohibition).

**HALT-5:** per-component values absent from both calculation_results.components AND entity_period_outcomes.component_breakdown for a calculated ICM tenant — report; upstream. **HALT-6:** user→entity unresolvable for Individual — report; no top-earner fallback. **HALT-7:** FM views can't read committed_data (carrier path absent for FM data_type) — report.

Commit: `feat(OB-207-inc2): persona+module results — ICM governance/coaching/growth + Financial FM hierarchy on committed_data, RBAC-gated (F-2, F-3)`

---

## §6 — PHASE 4: FM VIEWS RECONNECTION (F-3 depth)

If §5.3 requires more than surfacing — i.e., the five FM view components exist but read the dead legacy pipeline — rewire each to committed_data via the carrier path. Network Pulse, Location Benchmarks, Revenue Timeline, Staff Leaderboard, Leakage Monitor. Each reads committed_data filtered/aggregated per the FM hierarchy level. Currency via the tenant-currency formatter (MXN for MX tenants), no raw `$` templates. **HALT-7** applies. (If §5.3 fully covers FM, this phase folds into it — CC reports.)

Commit (if separate): `feat(OB-207-inc2): FM views read committed_data via carrier path — Network Pulse/Benchmarks/Timeline/Leaderboard/Leakage (F-3)`

---

## §7 — PHASE 5: ACTION PROXIMITY (F-5)

### 7.1 Audit (read-only first)

Button/handler audit across persona surfaces + cockpit. Inventory: label, surface, behavior (wired/unwired/ambiguous/backed-by-nothing). Paste.

### 7.2 Wire to concrete results (no new schema; corrected columns)

- **Recognize (Manager→rep):** writes `agent_inbox` row (agent_id, type='recognition', title, severity, action_url, persona='rep', metadata) targeting the rep.
- **Coach / Intervene:** writes `audit_logs` row using **`profile_id`** (the actor — NOT actor_id), action='coaching.flagged'/'intervention.opened', resource_type='entity', resource_id, changes={component, gap, reason}; optional `agent_inbox` item to the rep.
- **Investigate / Resolve (anomalies):** Investigate → navigate to entity/anomaly detail; Resolve → `audit_logs` resolution row (profile_id) + clear the anomaly's Queue item.
- **Simulate (Action/Optimization Card):** inline impact model (DS-008-A3 sensitivity); Apply only Tier 3.
- **Unbuilt (clawback/adjustment):** disabled + tooltip ("Coming in a future release"), NOT dead chrome.

**FP-49:** confirmed — audit_logs uses `profile_id`. CC pastes the audit_logs columns before the first write. **Korean Test:** event types/labels structural. **Honest disposition:** any control not wireable to a real capability → disabled+tooltip, named in report.

Commit: `feat(OB-207-inc2): action proximity — recognition→agent_inbox, coach/intervene→audit_logs(profile_id), simulate inline, unbuilt→disabled (F-5)`

---

## §8 — PHASE 6: BLISS + COMPLIANCE + BUILD + VERIFY

### 8.1 Bliss tokens
All new surfaces use theme-token variables (re-skin under OB-201), never hardcoded literals. **HALT-8:** OB-201 not merged — proceed, report.

### 8.2 SR-39 Compliance Verification Gate (FIRES)
This OB touches access control (Phase 1 capability↔workspace binding), module-access gating, persona-scoped reads, and audit/inbox writes. CC verifies: the binding re-keys to the single PDP (no new access list, no weakened gate); module gating uses the live field (FP-49); persona-scoped reads use the canonical path and don't cross tenant/entity isolation; agent_inbox/audit_logs writes are tenant-scoped and use correct columns. Confirm against SOC2 CC6, NIST SP 800-162, DS-014, DS-019, Decision 123. Report explicitly. **HALT-9:** canonical persona scope read returns zero rows for a Manager on a known-populated tenant (F-21 divergent-read) — report; do not fabricate.

### 8.3 Build verification
Kill dev server. `rm -rf .next`. `npm run build`. Zero new errors. `npm run dev`. localhost:3000.

### 8.4 Experiential proof gates (SH_UI_TO_BUILD §4) — rendered result + source value, pasted

| PG | Specification | PASS |
|---|---|---|
| PG-01 | Workspace access = capability | Sidebar workspaces derive from `hasCapability` via the PDP, not a parallel role list. Show the binding. A viewer sees fewer workspaces than an admin. |
| PG-02 | Module gating | A Financial-viewer/ICM-admin user sees Consolidate's Financial views read-only and Calculate/Decide ICM actionable. Module_access field confirmed (FP-49). |
| PG-03 | RBAC ADR committed | `AGENT_RBAC_BINDING_ADR_OB207.md`. Paste. |
| PG-04 | Cockpit Cycle/Pulse/Queue | /operate renders the three regions, one source of truth, action-verb labels, no synthetic budget, Queue persona-scoped, empty→"All caught up." BCL PREVIEW shows active stage+verb. |
| PG-05 | ICM Admin results | Anomalies have Investigate/Resolve (not thermometer); distribution renders (not "No attainment data" blank); component cost breakdown present. |
| PG-06 | ICM Manager results | Entity×component heatmap with real per-component values ON /results, coaching-priority sort, Acceleration Cards. |
| PG-07 | ICM Individual results | Personal earnings hero + goal-gradient + allocation + component stack for the user's OWN entity. |
| PG-08 | Financial FM hierarchy | FM views read committed_data (not legacy); Leakage shows only POS-supported categories; persona scopes the level. |
| PG-09 | Recognize wired | Manager Recognize writes agent_inbox row (paste the row). |
| PG-10 | Coach/Intervene wired | Writes audit_logs row using profile_id (paste; confirm column). Names real entity×component. |
| PG-11 | Unbuilt disabled | Clawback/adjustment control disabled+tooltip, not dead. |
| PG-12 | Persona ambient | Admin indigo / Manager amber / Individual emerald. |
| PG-13 | Bliss tokens | New surfaces token-based (re-skin). |
| PG-14 | Korean Test | Grep of results/cockpit/binding selection+render → zero hardcoded domain/component/persona/capability-domain literals. Paste grep + zero-hit. |
| PG-15 | SR-39 | Compliance verification pasted (PDP single-source, module gating, isolation intact, correct columns). |
| PG-16 | Build exit 0 | `npm run build` exit 0, warning-clean. |

Paste evidence for every PG. PG-01/02/03 CC code-trace; authenticated render of all persona/module surfaces is the architect's SR-44 step.

### 8.5 Commit + PR
```bash
gh pr create --base main --head ob-207-inc2-experience-surfaces \
  --title "OB-207 Increment 2: Persona+Module Surfaces + Cockpit + Action Proximity + RBAC Binding" \
  --body "Hangs the surfaces on the OB-207 agent-nav spine and binds the spine to RBAC. Phase 1: workspace access derives from the DS-014 single PDP + module_access (not a parallel role list — eliminates F-38 divergence; Decision 123 — the sidebar IS your capability set rendered). Cockpit: Cycle+Pulse+Queue on one source of truth, persona-scoped Queue (F-4). Persona+module results: ICM governance/coaching/growth + Financial FM 5-level hierarchy on committed_data via DS-029; Leakage shows only POS-supported categories; RBAC-gated per module_access (F-2, F-3). Action proximity: Recognize→agent_inbox, Coach/Intervene→audit_logs (profile_id, corrected from the assumed actor_id), Simulate inline, unbuilt→disabled+tooltip — no new schema (F-5). SR-39 verified (single PDP, module gating, isolation intact). Built on Bliss tokens. SR-44: architect confirms capability-gated nav, all persona/module surfaces, FM views."
```

---

## §9 — HALT CONDITIONS

- **HALT-1:** `permissions.ts` (DS-014 PDP) absent / not the live access source. Report live mechanism; re-key to it, don't invent.
- **HALT-2:** Compensation Clock services can't wire to the lifecycle state machine without net-new infra. Report; render from state-reader.ts.
- **HALT-3:** module-access field ambiguous/absent (neither profiles.module_access nor tenants.modules_enabled live). Report; gate on what exists.
- **HALT-4:** user→entity unresolvable for Individual. Report; no top-earner fallback.
- **HALT-5:** per-component values absent from both sources for a calculated ICM tenant. Report; upstream.
- **HALT-6:** (folded into HALT-4.)
- **HALT-7:** FM views can't read committed_data (carrier path absent for FM data_type). Report.
- **HALT-8:** OB-201 not merged. Proceed, report.
- **HALT-9:** canonical persona scope returns zero rows for a Manager on a populated tenant (F-21). Report; do not fabricate.
- **HALT-10:** any locked rule (Decision 128, Korean Test, DS-014 single-PDP, Bloodwork, IAP Gate, A.24, Decision 123) conflicts with a phase instruction. Surface verbatim per SR-42.

---

## §10 — REPORTING DISCIPLINE

Completion report: `docs/completion-reports/OB-207-INC2_COMPLETION_REPORT_20260614.md`

Per Rules 25–28: SHA per phase commit, both ADRs' content, the FP-49 schema reads (audit_logs/agent_inbox/module_access columns pasted), the §7.1 action-control inventory, pasted evidence for every §8.4 PG, SR-39 compliance verification, SR-38 metric trace, build output, PR URL.

```
ARTIFACT SYNC
MC: OB-207 F-2/F-3/F-4/F-5 → CLOSED by Increment 2 (pending SR-44); F-38 role-vocabulary divergence → RESOLVED (single PDP binding).
REGISTRY: "Persona+Module Results" → ICM+Financial, FM-on-committed_data; "Lifecycle Cockpit" → Cycle/Pulse/Queue; "Action Proximity" → agent_inbox/audit_logs wired; "Agent-RBAC Binding" → NEW, workspace access = capability via single PDP. Decide/Calculate/Consolidate advance toward L2 DEMONSTRATED on SR-44.
R1: Tier C candidate "results are persona+module-aware; nav is capability-gated" → pending SR-44.
BOARD: Calculate (cockpit), Decide (persona results + action proximity), Consolidate (FM on committed_data), Platform Core (RBAC binding) — all four advanced at the surface+access layer.
SUBSTRATE: DS-014 single PDP bound to nav (Decision 123 realized); module_access gating (DS-019 chain); A.24 exercised; Compensation Clock (TMR-3); Action Proximity (TMR-5) → agent_inbox/audit_logs; FM hierarchy on committed_data.
```

---

## §11 — OUT OF SCOPE

- Engine-level defects (clawback E1, assignment E2, concurrency E3, disputes E4 — separate; clawback/adjustment buttons disabled+tooltip here).
- DS-027 provisioning UI build (this OB binds nav to the EXISTING access mechanism; the user-provisioning/RBAC management UX is DS-027). If the PDP isn't live, HALT-1 — do not build provisioning here.
- URL/route-file moves (binding is access-gating on existing routes).
- Warm/Hot CRL adaptation (V1 deterministic ranking ships).
- Executive persona (R1), mobile server app (R2).
- New schema/tables (agent_inbox + audit_logs back the actions; module_access/modules_enabled already exist).
- OB-201 execution.
- Per-component attainment persistence (heatmap encodes payout-relative-to-peer until then).

## §11A — RESIDUALS

- **R1 — Executive persona** (distinct from Admin; Decision 125 territory) — follow-on.
- **R2 — Mobile server (FM)** — responsive views here; native app follow-on.
- **R3 — DS-027 provisioning UX.** This OB binds nav to access; the full user-provisioning/role-management UI (invite, assign, entity↔user linking) is DS-027. The binding makes the spine capability-ready FOR that UX.
- **R4 — CompensationClockService consolidation** (if wired minimally) — follow-on.
- **R5 — Per-component attainment persistence** — engine residual.
- **R6 — Scale (MIR F-51/53)** — render at proof scale; virtualization before MIR.
- **R7 — Persona scope hardening (F-21/22/23, HF-282/DS-027)** — canonical path consumed; divergent-read fix upstream.
- **R8 — Warm/Hot adaptation** — next experience phase.
- **R9 — R1 Exit Criteria** — propose updates on SR-44 (capability-gated nav, persona+module results). One-way ratchet.
