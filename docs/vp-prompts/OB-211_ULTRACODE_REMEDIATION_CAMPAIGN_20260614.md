# OB-211: ULTRACODE REMEDIATION CAMPAIGN — TEST → VERIFY → RCA → RESOLVE THE COMPLETE FAILURE INVENTORY

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-14 (architect channel)
**Type:** OB — full remediation campaign, **CC-owned end-to-end via ultracode**. CC tests the live deployment, verifies each item, performs root-cause analysis, and resolves every item in the comprehensive failure inventory. The campaign is structured so CC owns the verify→RCA→resolve loop — the architect ratifies production renders (SR-44), CC produces all evidence. **Phase 0 is a CC-run CLT that produces the verified inventory**, so resolution scope is evidence-driven, not assumption-driven.
**Number:** OB-211 — highest OB on main is 210 (#511 merged); next free is 211 (verified from repo). **Collision gate (Phase 0):** CC confirms #511 on main, reads `LANE1_ORCHESTRATION_PLAN_OB210.md`, runs `git log --all | grep -iE 'OB-211'`; if any match, HALT.
**Branch + PR:** CC's orchestration — per-workstream branches, each architect-SR-44-gated, merged in dependency order. CC states the strategy in §1A. Never push to main directly.
**Governing specs:** the committed map (`LANE1_ORCHESTRATION_PLAN_OB210.md`), the Increment-1 keystone (`InsightNarrative.tsx`/`insight-narrative.ts`), DS-003 (primitives + composition rules), DS-013 (narrative, Five Elements, persona density), DS-015 §4 (persona priority), SH_UI_TO_BUILD, DS-008-A3 (Action Card, Simulate), FM analysis (A.24, hierarchy), MISSION_CONTROL + TMR-3 (cockpit), the OB-207 Regime ADR, #508/#509/#510, Synaptic spec, Korean Test, DS-023 §5.1 + HF-219, Bloodwork, Decision 128. CLT format: CLT-45.

---

## §0 — CC Standing Rules + the loop this campaign owns

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Binding: AP-25 (Korean Test), SR-34 (fix at source / compose / remove; no third path, no counter-redirect), SR-38, SR-39, SR-41, SR-42, SR-43, SR-44, plus the DIAGNOSTIC discipline (read-only RCA before code; trace, don't theorize). Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**THE LOOP CC OWNS (per item, every item):** TEST (run the check against live/main) → VERIFY (pass/fail with pasted evidence) → RCA (if fail, trace the root cause in code — not a symptom guess) → RESOLVE (fix at the root) → RE-VERIFY (the check flips fail→pass) → architect SR-44 (production render confirm) → merge. No item is "done" until its check passes AND the architect confirms the render. This shifts the verification burden to CC's produced evidence; the architect ratifies, does not hunt.

**THE TWO DISCIPLINES (carried, enforced):**
- **Leverage, do not create** (HALT-GENERAL): the foundations exist (#508/#509/#510, design-system primitives, cockpit components, the signal path). The only genuine builds are the Insight narrative (DONE) and any newly-discovered gap. Composition/wiring otherwise.
- **Read-before-assume** (Phase 0 CLT operationalizes it): the inventory is VERIFIED against the live code/deployment before resolution scopes; this campaign's RCA traces actual code, never theorizes from logs (the human-as-debugger anti-pattern).

**FP-49:** signal writes via `captureStreamSignal`→`writeSignal` (no `.insert`, no registry); action writes `audit_logs.profile_id` + `agent_inbox`; module gating `tenants.features`. Read live columns first.

AUTONOMY: NEVER ask yes/no. Act. **tsc --noEmit before every push.** Git from repo root.

**Reconciliation-channel separation:** No ground-truth values.

---

## §1 — THE COMPREHENSIVE FAILURE INVENTORY (assembled from artifacts + audits + architect production reports)

This is the COMPLETE list. Phase 0 verifies each; Phases 1–N resolve each. Nothing here depends on architect-channel memory — it is the assembled record.

**A — ROUTING (architect-reported, production):**
- A1: Tenant landing from Observatory → /operate, not /stream. **HF-292 drafted, NEVER dispatched.** Live bug: `ObservatoryTab.tsx:107` `targetRoute || '/operate'` overrides setTenant's /stream. (Preserve the legitimate Run-Calculation card /operate deep-link at lines 289-290.)

**B — SURFACE BEHAVIOR (architect-reported, production):**
- B1: /stream does NOT open expanded. Adaptive-default specified, never built (no expand-state in code).
- B2: Insight narrative NOT on /stream (only /results). Unit-A-rest, unbuilt.
- B3: Cards reimplement inline, NOT composed from design-system. ZERO of 20 intelligence cards import design-system.
- B4: No visualization diversity / Bloodwork-forward / AI-front-and-center on the surfaces. DS-003 composition rules unenforced.

**C — DEAD CONTROLS (audit-confirmed, ZERO callers each):**
- C1: Optional-handler controls passed by no caller: onSimulate, onEntityClick×4, onAction, onViewDetails×2, onApprove, onEscalate, onDrillDown, onStateClick, onCellClick, onRowClick, RoleCard onEdit/onDuplicate/onDelete/onViewUsers.
- C2: No-handler buttons (pure visual): /insights/compensation, /insights/analytics, dashboards (Admin/Mgr/Rep), transaction-table.
- C3: Drill-down asymmetry: anomaly Verify works via a one-off INLINE handler; every reusable drill prop (onCellClick/onDrillDown/onEntityClick/onRowClick) is dead. (Phase 0 CONFIRMS and COMPLETES this list — there may be more.)

**D — PERSONA/MODULE SURFACES (specified, unbuilt — apply the composed-surface pattern):**
- D1: Manager /results — entity×component heatmap on /results, regime-aware.
- D2: Individual /results — earnings hero + goal-gradient regime-aware.
- D3: Financial FM — pattern-application (FM ALREADY on committed_data; reconnection MOOT). Region/Check hierarchy gap = data-model item (architect-gated).
- D4: Lifecycle cockpit at /operate — compose CycleIndicator/PulseMetrics/QueuePanel (components exist).

**E — KNOWN-FIXED FOUNDATIONS (VERIFY THEY HOLD; do not rebuild):**
- E1: Regime model (#508), attainment value (#509: Colocación 86%/Captación 90%), signal capture-and-react (#510), BloodworkCard surfaced. Phase 0 confirms these still render; if any regressed, RCA+resolve.

**F — CONSOLIDATION:**
- F1: /insights repoint off charts/analytics duplicates onto primitives, then remove the duplicates (DS-003-forbidden pie, dup leaderboard/goal-bar). Unblocks the OB-209 R4/R5 removal.

**G — SCALE/RESIDUAL (fold into the surface that surfaces it):**
- G1: Entity-table counts from server COUNT, not rendered-length (F-50/51). G2: vs-prior comparison on hero (PG-04). G3: trend persistence (F-45 — compute-at-read acceptable; don't worsen).

---

## §1A — ULTRACODE ORCHESTRATION (CC owns; states the plan)

CC commits an orchestration plan (`docs/architecture/REMEDIATION_ORCHESTRATION_OB211.md`) stating:
- **Phase 0 (the CLT audit workflow):** one fan-out that TESTS every inventory item A–G against live/main and produces the VERIFIED findings table (expected/actual/pass-fail/evidence/RCA-pointer). This is the evidence base; it REPLACES assumption-based scope.
- **The RCA workflow:** for every FAIL, a trace-the-root-cause pass (read the code path, not the logs) producing the root cause + the fix location. The dimensions that have bitten this project (wrong-rule-set, cross-tenant write, right-by-luck, dead-handler, stale-override, inline-not-generalized) are the RCA lenses.
- **The resolution workstreams** (CC groups by disjoint file trees for parallelism):
  - WS-1 ROUTING (A1 = HF-292 dispatch) — `ObservatoryTab.tsx` + landing-path convergence.
  - WS-2 DECIDE SURFACES (B1-B4 + the rest of Unit A) — narrative on /stream, compose cards, expand-default, DS-003 rules.
  - WS-3 DEAD CONTROLS (C1-C3) — the audit-and-wire sweep; generalize drill-down; disposition every control.
  - WS-4 PERSONA SURFACES (D1-D2) — Manager + Individual results (disjoint, parallel).
  - WS-5 FINANCIAL + COCKPIT (D3-D4) — FM pattern + cockpit composition.
  - WS-6 CONSOLIDATION (F1) — /insights repoint + removal.
  - Scale items (G) fold into the WS that renders the table/hero.
  - **Collision:** WS-3 (dead controls on AccelerationCards) ↔ WS-4 (Manager surface uses AccelerationCards). RESOLUTION: WS-4 owns AccelerationCards action-wiring; WS-3 owns the rest. State it.
- **The adversarial sweep:** one over the resolution batch (WS-2..6), verifying wrong-rule-set / cross-tenant / right-by-luck / Korean Test / scale. Every HIGH fixed + re-verified.
- **The merge strategy:** dependency order (WS-1 routing first; WS-2 establishes surface pattern; WS-3..6 follow), each architect-SR-44-gated.

CC states this plan, then executes. Phase 0's verified findings drive everything after.

---

## §2 — PHASE 0: THE CC-RUN CLT (test + verify + RCA-pointer for every item)

CC runs the verification (CLT-45 format) against live `app.vialuce.ai` + main, producing `docs/completion-reports/CLT_PRODUCTION_VERIFICATION_OB211_20260614.md`. For EVERY inventory item A1–G3:

| Item | Expected behavior | CC test method | Actual | Pass/Fail | RCA pointer |
|---|---|---|---|---|---|
| A1 | tenant-entry → /stream | trace ObservatoryTab handler + landing paths | | | the /operate override |
| B1 | /stream opens expanded | grep expand-state default | | | (no default exists) |
| B2 | narrative on /stream | grep InsightNarrative in stream/page | | | (not applied) |
| B3 | cards compose from design-system | grep card imports | | | (0 of 20 import) |
| C1 | each action handler fires | grep callers per onX handler | | | (0 callers) |
| C3 | every claim drills | trace drill props vs inline handler | | | (inline-only) |
| D1-D4 | surfaces render the pattern | grep/trace per surface | | | (unbuilt/composition) |
| E1 | #508/#509/#510 hold | trace regime/attainment/signal + render | | | (confirm or regression) |
| F1 | /insights uses primitives | grep insights imports | | | (uses charts/analytics dups) |
| G1-G3 | counts server-side / vs-prior / trend | grep count source | | | (rendered-length etc.) |

Plus SECTION: console/error health per Decide surface (loops, failed fetches, hydration — the CLT-166-F04 class).

**Output:** the verified FAIL list with RCA pointers = the resolution scope. **HALT-0:** any item CC cannot mechanically verify AND that needs an authenticated browser → flag "architect-SR-44-required," do not assert pass/fail blind.

**Commit:** `docs(OB-211): Phase-0 CLT — verified failure inventory + RCA pointers (the evidence base for resolution)`

---

## §3 — PHASES 1–N: RESOLVE (per workstream, RCA → fix at root → re-verify)

Each workstream, for each of its items: RCA (trace root cause), resolve at the root (not the symptom), re-run the Phase-0 check (fail→pass), architect SR-44.

**WS-1 ROUTING (A1 — HF-292):** remove the `|| '/operate'` default at `ObservatoryTab.tsx:107` (setTenant already pushes /stream); preserve the explicit Run-Calculation targetRoute deep-link. Converge all landing paths to /stream (middleware✓, setTenant✓, ObservatoryTab fix, AuthShell). No counter-redirect (SR-34). Re-verify A1 → pass.

**WS-2 DECIDE SURFACES (B1-B4 + rest of A):** apply the committed narrative builder to /stream (B2); compose /stream+/results cards from design-system primitives (B3); implement expand-default + the #510 adaptive REACT (B1 — the default the react sets); enforce DS-003 rules — Diversity Minimum, Reference Frame (vs-prior G2), persona density/ambient, Bloodwork-forward (B4); wire Simulate→WhatIfSlider; generalize drill-down (feeds WS-3). Re-verify B1-B4 → pass.

**WS-3 DEAD CONTROLS (C1-C3):** the audit-and-wire sweep. Phase 0 produced the complete inventory; disposition EVERY control: WIRE (drill→generalized Five-Elements drill-through; Simulate→WhatIfSlider; approve/escalate→approvals path; view-details→detail; per E-backing), DISABLE+tooltip (no backing — clawback/adjustment; RoleCard CRUD if DS-027 not live, HALT-G-RBAC), or REMOVE (vestigial). Generalize the inline drill handler to all drill props (C3). Re-verify C1-C3 → pass (grep: zero `onX?.()` with zero callers on a live surface; zero no-handler buttons that should act).

**WS-4 PERSONA SURFACES (D1-D2):** Manager /results (heatmap regime-aware, **owns AccelerationCards action-wiring** — the collision resolution: Recognize→agent_inbox, Coach/Intervene→audit_logs+inbox); Individual /results (goal-gradient regime-aware, entity-from-identity HALT-4). Apply the pattern; server COUNT (G1) on tables. Re-verify → pass.

**WS-5 FINANCIAL + COCKPIT (D3-D4):** FM pattern-application (on committed_data ✓; Region/Check hierarchy = HALT-D architect-gated); cockpit composition (CycleIndicator/PulseMetrics/QueuePanel on /operate; HALT-8 if can't wire to lifecycle state; not the landing — depends on WS-1). Re-verify → pass.

**WS-6 CONSOLIDATION (F1):** /insights repoint to primitives (exact map: CompensationPieChart→ComponentStack/DistributionChart, GoalProgressBar→GoalGradientBar, Leaderboard→RelativeLeaderboard, KPICard→composition), then `git rm` the duplicates (import-proven). Re-verify → pass; the OB-209 R4/R5 removal closed.

**E1 (foundations):** Phase 0 confirms #508/#509/#510 hold. If any regressed, RCA+resolve in the owning WS. If they hold, no action — just the verified-pass record.

---

## §4 — THE GATES (per item, per workstream)

- **Phase-0 verified:** every item A1–G3 has expected/actual/pass-fail/evidence/RCA-pointer. The FAIL list is the scope.
- **RCA gate:** every fix traces to a root cause in code (pasted), not a symptom guess. (No human-as-debugger theorizing.)
- **Re-verify gate:** the Phase-0 check flips fail→pass post-fix (CC re-runs the check, pastes the now-passing evidence).
- **Adversarial sweep gate:** wrong-rule-set / cross-tenant / right-by-luck / Korean Test / scale over WS-2..6; every HIGH fixed + re-verified.
- **Korean Test / no-new-path gate:** zero domain literals; open-vocabulary signals; no registry; no new write path/library (only the narrative + any newly-discovered gap created).
- **PER-ITEM COMPLETION (architect SR-44):** the behavior RENDERS on production. CC provides the re-verify evidence; the architect confirms the render. No item closes on build-green.
- **CAMPAIGN DONE:** every inventory item A1–G3 is verified-pass on production; one canonical library (F1 removal); every control leads to a concrete result; every persona surface renders the pattern; routing lands /stream.

---

## §5 — HALT CONDITIONS

- **HALT-0:** an item needs an authenticated browser CC can't mint. Flag architect-SR-44-required; no blind pass/fail.
- **HALT-GENERAL:** about to CREATE a primitive/signal-path/registry/library that exists. STOP, report.
- **HALT-RCA:** a fail's root cause can't be traced in code within the diagnostic budget (Rule 24: 3 rounds). Escalate to a DIAG, do not theorize-and-patch.
- **HALT-2/3/4/8/9/D/G-RBAC/G-CAPABILITY/COLLISION/LOCKED:** as enumerated across the unit specs (primitive-extend; Simulate model; user-entity; cockpit-state; manager-scope; FM-hierarchy; RBAC-not-live; capability-missing; AccelerationCards ownership; locked-rule conflict). Surface verbatim per SR-42 where locked.

---

## §6 — REPORTING

Per-workstream completion reports + the Phase-0 CLT findings + a campaign summary. Each per Rules 25-28: SHA per commit, the Phase-0 verified table, per-item RCA (root cause in code), the fix, the re-verify (now-passing) evidence, the adversarial sweep findings+fixes, pasted evidence per gate (esp. per-item render), SR-39, build+tsc, PR URLs. Confirm: the loop ran per item (test→verify→RCA→resolve→re-verify); nothing created but the narrative + discovered gaps.

```
ARTIFACT SYNC (campaign)
MC: the complete failure inventory A1–G3 → TESTED (Phase 0), RCA'd, RESOLVED per workstream (pending per-item SR-44). HF-292 dispatched at last (A1). The build-green≠renders gap closed via the CC-owned test→verify→RCA→resolve loop. Every dead control dispositioned; drill-down generalized; routing lands /stream; persona surfaces render the pattern; /insights duplicates removed.
REGISTRY: routing converged (every layer→/stream); Decide/Calculate/Consolidate/Platform-Core surfaces → L2 DEMONSTRATED per item on SR-44; "Production Verification Loop" (test→verify→RCA→resolve) established as the closure contract; canonical library complete.
R1: every Tier-C candidate → VERIFIED (pass) or its resolution shipped; the verified inventory updates R1 status item-by-item.
BOARD: every arc deliverable re-stated VERIFIED vs RESOLVED per the Phase-0 CLT + the re-verify.
SUBSTRATE: "shipped"="renders" enforced via the CC-run CLT + the per-item re-verify gate; RCA-before-resolve (no human-as-debugger); HF-292 dispatched; the comprehensive inventory closed end-to-end under CC ownership; ultracode ran Phase-0 audit + parallel resolution + one adversarial sweep — cost-once across the campaign.
```

---

## §7 — OUT OF SCOPE (other lanes)
- Engine 🟠/🔴 (clawback, period-assignment, concurrency, disputes); Infrastructure (INF/DS-027 build); OB-201 execution; CRP 2+4. (RoleCard CRUD references DS-027 — disable if not live, do not build DS-027 here.)
- The universal-insight AGENT (consumes #510 L3; follow-on). Warm/Hot CRL (V1 ships). New schema.

## §7A — RESIDUALS
- R1 Unit-D Region/Check hierarchy (data-model, HALT-D, architect-gated).
- R2 universal-insight agent (L3 basis established; follow-on).
- R3 app-wide adaptive ordering (capture-and-react proven; follow-on).
- R4 regime-2 rendering (classifier handles; renders when a regime-2 tenant exercises it).
- R5 full scale virtualization (server COUNT folded in; virtualization before MIR).
- R6 R1 exit criteria (per-item SR-44 → propose updates; one-way ratchet).
