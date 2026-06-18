# VP SESSION HANDOFF — 2026-06-15

**Session window:** 2026-06-15, an extended continuous session.
**Primary outcome:** OB-211 comprehensive campaign closed (15 PRs #512–#522 merged); HF-294 (AI model-string sunset) merged (#524); the deployed-state audit surfaced a major navigation-coverage gap (128 routes, 17 in nav) and a recovery value-map + walkable surface were produced for architect triage of ~56 recoverable orphaned pages.
**Reader orientation:** read Sections -1, 0, 19, and 20 first. This handoff is a **VP handoff** (not VG). It is intentionally dense — paste it into the opening directive of the next conversation per the corrected handoff workflow. Corrections applied at draft time: Correction 1 (execution-locus markers), Correction 2 (minimum-viable Turn 2), Correction 19 (Section -1 Critical Path).

---

## SECTION -1 — CRITICAL PATH TO OBJECTIVE

**1. What we are building.** Vialuce (vialuce.ai) is a B2B Incentive Compensation Management / Sales Performance Management platform for LATAM enterprise (Mexico, Peru). Its architectural distinguishing feature is a domain-agnostic prime-DAG calculation engine fed by a convergence layer that maps any tenant's data to plan metrics with no per-tenant code, with AI agents as core infrastructure. The billable unit is the "Verified Payout" — a commission calculated, reconciled, and audit-sealed. Four agents govern the platform: Calculation (run the engine, pay people), Performance (see/decide/act), Finance (a licensable per-tenant module), and Platform Core (always-on substrate).

**2. Why it matters.** Enterprises running complex commission plans face calculation errors, reprocessing, and a collapse of trust between sellers and the incentive model. Vialuce centralizes and automates the rules, makes every calculation auditable and explainable down to the source row, lets reps submit structured disputes with data references, and gives managers real-time visibility — restoring trust the dashboards-and-spreadsheets status quo cannot.

**3. Current commercial gate / next user-facing milestone.** The MIR (Almacenes Mirasol) demo — a Spanish-language, PEN-currency walkthrough on a real tenant — and behind it the Alpha User-Ready gate (first test users run end-to-end through the browser). The MIR Capability Status Profile R1 (DIAG-063, 24 capabilities probed) is the authoritative demand-side requirement set.

**4. Binding constraint.** The platform has ~56 substantive but **orphaned** pages (built, deployed, render-by-URL, but unreachable through navigation — never wired, predating the agent-nav). Several are the UI for MIR-critical capabilities whose underlying platform is incomplete or hardcoded: **Disputes 🔴** (table dropped, UI points at nothing), **Statements 🟠** (surface exists, unscoped, zeros rep amounts), **Audit 🟠** (8 emit sites, 0 rows persisted), **Approvals 🟠** (five variant surfaces). The binding constraint is: triage the orphaned pages (architect walk, in progress) → wire the platform beneath the kept ones → make the MIR demo path real. Plus two confirmed cross-cutting blockers: **no `profile_scope` seeded on any tenant** (the Stage-1 fail-closed fix gates every manager persona to empty until seeded), and the **MIR profile is not in the VP repo** (it was uploaded to chat; the recovery build must be scoped against the real document).

**5. Frame of reference for next session.** Every action filters through "does this advance the MIR demo path / Alpha User-Ready gate, or is it local optimization?" The orphaned-page recovery is on the critical path because the demo surfaces live among those pages. Defer pure cleanup that does not serve a MIR-needed capability. The architect's walk decisions (KEEP/ABSORB/DISCARD per page) are the gating input to the next build directive.

---

## SECTION 0 — CRITICAL ORIENTATION FACTS

1. **OB-211 comprehensive campaign CLOSED — 15 PRs merged (#512–#522)**: security foundation (verify, two HALT-ACCESS closures, scope fail-closed), agent-governed nav keystone, Simulate regime-convergence (live on BCL regime-2), verified fixes, RLS verification plan. Then **HF-294 merged (#524)** — the sunset-model-string fix.
2. **Major incident-class finding (deployed-state audit):** the app has **128 page routes; only 17 are in the navigation.** ~56 are substantive recoverable orphans, ~25 are empty stubs. My earlier diagnosis blamed the Phase-A reorg; **git history disproved that (Phase A dropped zero nav items — the orphaning predates the agent-nav).** Correction issued under SR-42.
3. **Workflow state:** the handoff framework is intact; this is a VP handoff. A recovery walkable surface (local HTML walk-list + a parked `/recovery` preview page) was produced; the architect is mid-walk triaging the ~56 pages.
4. **Meta/residual accumulation:** multiple confirmed residuals carried forward (R2 export hierarchy, R5 server-SUM + RLS follow-on, profile_scope seeding, scope-cache invalidation, i18n debt, the orphaned-page recovery build, the 55-doc untracked corpus parked on the recovery branch).
5. **Forward path / recommended next action:** the architect completes the orphaned-page walk → the recovery BUILD directive is scoped from the KEEP/ABSORB/DISCARD decisions AND the real MIR R1 profile (which must first be committed to the VP repo). Two parallel safe streams currently: the recovery walk (preview, PR #523 DO-NOT-MERGE) and merged main (#524).

---

## SECTION 1 — SESSION GOALS AND OUTCOMES

The session opened mid-OB-211, with the comprehensive remaining work (nav keystone, verified fixes, RLS, Simulate alignment) to be carried to completion under ultracode orchestration, plus the strategic Simulate question (why it was dead on BCL) to be resolved as a co-phase rather than deferred.

What the session actually did exceeded that frame. OB-211's comprehensive remaining work was completed (Phases A/B/C/D, #520–#522) with Simulate converged onto the #508 regime classifier (regime-2 close-the-gap live on BCL). A separate HF-294 (AI model sunset) was merged (#524). But the dominant outcome was unplanned: an architect report that "Simulate is inactive and entire pages are missing" triggered a deployed-state audit that surfaced the 128-route/17-nav coverage gap — reframing a large body of work from "missing" to "orphaned but recoverable," and producing a recovery value-map + walkable surface for triage. The session also produced the Phase-C RLS runbook (architect-executable) which confirmed two real defects (no entity-scope RLS; no profile_scope seeded anywhere).

In one sentence: OB-211 closed and HF-294 merged, but the session's lasting product is the recovery value-map that turns ~56 orphaned pages into a triageable recoverable-value backlog against MIR requirements.

## SECTION 2 — REPO STATE AT SESSION CLOSE

- **Repo:** `CCAFRICA/spm-platform` (VP). **Production:** vialuce.ai (Vercel project `vialuce-prod`).
- **main:** at the #524 merge (HF-294) per architect confirmation. (Drafter's read-only clone showed `1dae916` = #522; the post-#524 SHA is confirmed by Andrew locally — see Section 19 Turn 2.)
- **Branches in play:**
  - `main` — production base; #524 merged.
  - `ob211-recovery-artifacts` — PR #523 OPEN, **DO-NOT-MERGE**. Holds: the RLS runbook, the deployed-state audit, the recovery value-map, the `/recovery` Next.js page, the substance-scan script, the 6 diagnostic probe scripts, and 55 parked pre-existing untracked docs. Has a live Vercel **preview** deploy (the walk surface).
  - `hf-294-model-string-sunset` — merged via #524.
  - `ob211-phaseC-rls-runbook` — deleted (was empty, fully merged).
- **External systems:**
  - **Vercel:** production = main; the recovery preview = the `ob211-recovery-artifacts` branch (host begins `vialuce-prod-git-ob211-recovery-…vercel.app`). **HALT-ENV (HF-294): the architect must confirm `NEXT_PUBLIC_AI_MODEL` in Vercel is NOT set to the dead string `claude-sonnet-4-20250514`** — the code-default fix only covers the unset case. (Architect believed this resolved; flagged here per instruction in case it is not.)
  - **Supabase:** project `bayqxeiltnpjrvflksfa`. Confirmed: RLS enabled on all six scope-gated tables but **tenant-scoped only (no entity/manager-scope policy)**; the data routes use the service-role client (bypassing RLS); `/api/financial/data` does no caller check → a confirmed direct-API confidentiality gap (R5). **No tenant has populated `profile_scope`.** BCL ("Banco Cumbre del Litoral") has calc data but ZERO tenant users; **Sabor Grupo Gastronómico** is the only tenant with real accounts.

## SECTION 3 — PR TIMELINE (SESSION-SCOPED)

| PR | Title | Base | Merge SHA | Scope |
|---|---|---|---|---|
| #520 | OB-211 Phase A: agent-governed nav keystone | main | (on main) | Calculation/Performance/Finance/Platform Core; Consolidate removed; results→Calculation; Finance menu gate |
| #521 | OB-211 Phase D: Simulate regime convergence | main | 6a9b28b | Simulate derives what-if from #508 regime; regime-2 close-the-gap live on BCL; regime-3 intact |
| #522 | OB-211 Phase B+C: verified fixes + RLS plan | main | 8682bd3 | results-table double-gate+G1, useDrillThrough extraction, payroll hierarchy named, RLS verification plan |
| #523 | OB-211 recovery artifacts (RLS runbook + audit + recovery scan/menu) | main | **OPEN — DO NOT MERGE** | preview-only; reference docs + temporary /recovery page |
| #524 | HF-294: AI model-string sunset | main | (architect-confirmed) | dead model `claude-sonnet-4-20250514`→`claude-sonnet-4-6`; AUD-009 ProviderHardError guard |

(Earlier OB-211 PRs #512–#519 merged in prior sessions; recorded in those handoffs.)

## SECTION 4 — OB-211 COMPREHENSIVE EXECUTION CYCLE (main work surface)

The comprehensive remaining OB-211 was executed under ultracode orchestration as four phases against the landed security foundation:
- **Phase A (#520) — nav keystone.** Reorganized `workspace-config.ts`/`navigation.ts` to agent governance (regrouping, no schema change — fan-out confirmed). Consolidate removed; results+reconciliation→Calculation; Finance as a licensable workspace gated via `tenants.features` (the menu reflection of WS7-A's route gate). The `consolidate→finance` rename surfaced 7 consumers, all caught by tsc.
- **Phase D (#521) — Simulate regime convergence (the strategic co-phase).** The decisive fan-out finding: `classifyComponentRegime` is a clean loader call (no adapter). Simulate was keyed on `parseTiers` (dead on BCL's regime-2 components); converged onto the #508 classifier so each component's regime routes its actionable what-if — regime-3 cross-boundary (HF-293 intact), **regime-2 close-the-gap (NEW, live on BCL)** anchored to the engine payout (delta=0 at rest), regime-1 volume-action. The sweep caught a HIGH: per-component attainment is never persisted; fixed with the entity-level fallback the tier path already uses.
- **Phase B (#522) — verified fixes.** Results-table access double-gate collapsed (tenant admin admitted); G1 server COUNT (true count >1000); `useDrillThrough` extracted (the WS-3 enabler); payroll export hierarchy named (HALT-EXPORT). The sweep caught a MEDIUM: the G1 count fix broke the average (capped sum ÷ true count) — fixed.
- **Phase C (#522) — RLS verification PLAN** (architect-executed; see the runbook). Later in the session the runbook was produced and run, confirming the entity-scope RLS gap and the profile_scope gap.

## SECTION 5 — SECONDARY WORK SURFACES (the dominant unplanned work)

**(a) HF-294 — AI model-string sunset (#524).** The pinned model `claude-sonnet-4-20250514` was sunset and 404s; the AIService silently degraded the 404 to confidence:0/fallback:true, so novel-structure (Tier 3) imports failed as schema_mismatch while fingerprint-matched imports kept working. Phase 1: dead string → `claude-sonnet-4-6`. Phase 2 (AUD-009 class fix): a general `ProviderHardError` guard that surfaces any provider hard-failure loudly. Clean fast-forward from main, disjoint from the recovery branch (verified empty overlap).

**(b) The deployed-state audit + recovery value-map (the session's lasting product).** An architect report ("Simulate inactive, pages missing") triggered a whole-surface audit. Finding: 128 routes, 17 in nav, ~81 orphaned. Correction under SR-42: Phase A did NOT orphan them (git history: Phase A dropped zero nav items); the orphaning predates the agent-nav. A substance scan classified the 81 (≈40 SUBSTANTIVE + ≈16 PARTIAL = ≈56 recoverable; ≈25 empty stubs auto-discarded), MIR-mapped, lineage-clustered. A walkable surface was produced (a `/recovery` Next.js page on the preview, and — after the page's auth gate proved to bounce the architect — a standalone local HTML walk-list as the reliable walk surface). The architect is mid-walk; first decision logged: **Adjustments (/performance/adjustments) → KEEP**.

## SECTION 6 — META CANDIDATES CAPTURED THIS SESSION

| # | Title | Domain |
|---|---|---|
| M-a | "Merged + wired ≠ reachable + rendering" — per-PR sweeps verify diffs, never the whole deployed surface; orphaned-route class is invisible to diff-scoped review | Verification discipline |
| M-b | A fix can create a second-order inconsistency between two right-looking derived numbers (G1 count vs average over mismatched populations) | Math-trace / SR-38 |
| M-c | "Built locally" is three steps from "live" (commit→push→deploy); "I don't see it" has two identical-looking causes (broken vs not-deployed) | Deploy discipline |
| M-d | Untracked authored corpus (55 directive/design docs) lived only in CC's working tree across sessions — one reset from loss; authored docs need durable commit | Artifact durability |
| M-e | A security fix's effectiveness depends on its precondition existing (fail-closed scope is correct but gates everyone to empty when no profile_scope is seeded) | Security / preconditions |

Total Meta candidates now in flight: 5 (this session). Held for ICA Mode 1 disposition. Do NOT treat as binding standing rules.

## SECTION 7 — DECISIONS LOCKED AND UNLOCKED THIS SESSION

No new numbered Decisions locked. No Decisions unlocked.

**Operational decisions made this session (bind future work, not numbered):**
- Finance is a licensable agent gated per tenant via `tenants.features` — NOT a verb. "Consolidate" removed from the nav as a false peer.
- The four agents (Calculation/Performance/Finance/Platform Core) govern nav identity and permissions.
- Demo capability agent homes: payroll export → Calculation; admin results table → Calculation (sign-off→export); rep statement → Performance.
- Simulate routes its actionable what-if on `classifyComponentRegime` (the #508 structural signal), never on `parseTiers` as an activation gate.
- The orphaned-page recovery is triaged by SUBSTANCE (measured) and MIR-need, not by reachability; only empty stubs are auto-discard.
- The recovery `/recovery` page and the 55-doc corpus are parked on `ob211-recovery-artifacts` (DO-NOT-MERGE), not on main.

## SECTION 8 — TMR CANDIDATES

Zero direct TMR candidates this session.

Indirect relevance (defer to ICA): the dynamic-Simulate structure→action model (regime → actionable what-if, Thermostat/IAP) is a reusable design pattern that may migrate to a TMR-equivalent reference if the structure-derived-simulation approach generalizes beyond Simulate.

## SECTION 9 — CLT ENTRIES

Zero formal CLT registry entries created this session.

Informal browser/runtime verification artifacts produced: the deployed-state audit (architect render-checklist on vialuce.ai as platform-admin/BCL), the Phase-C RLS runbook (architect-executable, real Sabor accounts), the recovery walk-list (architect walking the preview). These are architect-executed; results feed the next session.

## SECTION 10 — SR-39 COMPLIANCE GATE STATE

SR-39 was the dominant compliance dimension this session. Closed at the application layer: the `perform/statements` param-leak (scope through the read), the Finance route gate (`tenants.features` at the route), and the root scope fail-closed fix (persona-context `canSeeAll:false` default) — all in prior PRs of the campaign. **Open at the data layer (R5):** the Phase-C runbook confirmed RLS is tenant-scoped only (no entity/manager-scope policy) and the data routes bypass RLS via the service-role client — a direct-API confidentiality gap. The app layer holds for page traffic; the DB layer is the deeper boundary, architect-executed verification pending.

## SECTION 11 — STANDING RULES STATE

`CC_STANDING_ARCHITECTURE_RULES.md` — no amendments committed this session. Promotion candidates queued (held, not binding): the AUD-009 class-layer fix pattern (HF-294 applied it: tag provider hard-failures with one general guard, not per-instance); the "deployed-state audit before declaring a build complete" discipline (M-a/M-c).

## SECTION 12 — DEFECT CLASS ANALYSIS (REQUIRED)

**Root failure pattern this session: "verified by diff, never exercised as a whole."** The per-PR adversarial sweeps were green throughout OB-211 because each verified its own diff; none asked "does the whole deployed surface work for a real user on a real tenant." This produced three connected, independently-confirmed problems, all the same root: (1) 128 routes / 17 in nav — orphaned pages no sweep flagged because each sweep was diff-scoped; (2) no `profile_scope` seeded anywhere — the fail-closed fix gates every manager to empty, found only when the RLS runbook needed a real scoped manager; (3) no entity-scope RLS + service-role routes — a confidentiality gap confirmed by code-read, not by any sweep.

**Surfaces:** navigation coverage; persona scope seeding; data-layer access control. **Why the catches worked:** the architect's instinct to demand one comprehensive whole-surface test surfaced all three; the substance scan and the RLS runbook were the instruments. **A second pattern also recurred and was caught:** drafter assertion against unread evidence — I asserted Phase A caused the orphaning; CC checked git history and disproved it (SR-42 correction). And the math-trace pattern surfaced once more in HF-294's class (silent provider-error degradation, the same hide-the-failure class as prior right-by-luck bugs) and in Phase B's G1-broke-the-average.

## SECTION 13 — FILES CREATED OR MODIFIED THIS SESSION

**Created (code, committed — on `ob211-recovery-artifacts`):** `web/src/app/recovery/page.tsx` (temporary walkable menu); `web/scripts/ob211-substance-scan.sh`; 6 diagnostic probe scripts (`web/scripts/ob211-phaseC-*.ts`, `ob211-audit-bcl-*.ts`).
**Modified (code, committed — merged to main):** HF-294 — `web/src/lib/ai/ai-service.ts`, `web/src/lib/ai/providers/anthropic-adapter.ts`, `web/src/lib/ai/types.ts`, `web/src/lib/sci/header-comprehension.ts`. OB-211 Phases A/B/D — `workspace-config.ts`, `navigation.ts`, `intelligence-stream-loader.ts`, the Simulate cards (`SelfSimulateCard`, `GapWhatIf`, `PopulationGapWhatIf`), results-table + `useDrillThrough` hook.
**Created (documentation, committed — on the recovery branch):** `docs/runbooks/OB-211_PHASE_C_RLS_RUNBOOK_20260615.md`, `docs/audits/OB-211_DEPLOYED_STATE_AUDIT_20260615.md`, `docs/audits/OB-211_RECOVERY_VALUE_MAP_20260615.md`, HF-294 report docs.
**Carried forward and committed (from prior batches):** 55 pre-existing untracked directive/design/handoff docs, parked on the recovery branch (NOT yet on main — see Risk).
**To be created next batch:** this handoff + the Closing Report + the New Conversation Directive; the recovery walk-list HTML exists as a chat-pasted artifact for the architect to save locally (not committed).

## SECTION 14 — CONVERSATION PATTERN OBSERVATIONS

**Productive:** read-and-verify-before-asserting (the substance scan, the RLS probe, the git-history check that disproved my Phase-A claim); the architect's whole-surface-test instinct that surfaced the three systemic gaps; ultracode orchestration formed as actual fan-out/keystone/lens-sweep (after one correction where it was labeled but not formed). **Caught and corrected mid-session:** drafter asserting Phase A as the orphaning cause (disproved by git, SR-42); ultracode-as-label vs ultracode-as-formation (corrected to a real opening fan-out + multi-site convergence + lens fan-out); the blind-merge risk on #524 (corrected to evidence-gated merge). **Drift risk identified, not closed:** the temptation to relay "shipped/sweep-clean" as "live and rendering" — the diff-vs-deployed gap; partially mitigated by the audit but the discipline (deployed-state check before declaring done) is not yet a standing rule.

## SECTION 15 — CC EXECUTION OBSERVATIONS

CC's behavior was at-or-above baseline throughout. Specific catches: the Phase-D HIGH (attainment never persisted — would have shipped a dead feature); the Phase-B MEDIUM (G1 count broke the average); the git-history check that disproved the drafter's Phase-A orphaning claim; the HF-294 silent-degradation root cause; refusing to fabricate a regime-2 verdict when the data didn't qualify (HALT honesty); the SR-42 correction on the audit's stated cause; preserving (not deleting) the probe scripts and the 55-doc corpus during cleanup. No false stops. The one infrastructure event was a socket-drop mid-HTML-write (CC-side, not the work) — resumed cleanly with a state check confirming nothing git-related had run.

## SECTION 16 — GOVERNANCE ENGINE POSITION

This is a VP session; the IGF/VG substrate was not advanced this session. VG position is unchanged from its last VG handoff. The VP-side governance instruments exercised: the capability board R4 (the measuring stick for the recovery triage), the MIR Capability Status Profile R1 (the demand-side requirement set — **note: not in the VP repo; uploaded to chat only**), the deployed-state audit and recovery value-map (new VP artifacts). No IGF agent runtime work (OB-IGF-03–06) this session.

## SECTION 17 — HANDOFF BEST-PRACTICE OBSERVATIONS

Corrections applied at draft time: **Correction 1** (every action carries an explicit execution-locus marker — see Section 19), **Correction 2** (Section 19 Turn 2 is minimum-viable: one git command + one verbal confirmation), **Correction 19** (Section -1 Critical Path to Objective precedes Section 0, fresh-agent framing, all five sub-sections populated). This is a VP handoff — Section 16 reflects VP/VG separation rather than advancing the IGF substrate. Length is justified by the session's breadth (OB-211 close + HF-294 + the unplanned audit/recovery work). Sequence numbers in Section 18/20 are derived from the repo per Rule 19, with the drafter's clone-lag caveat noted explicitly.

## SECTION 18 — RISKS AND OPEN QUESTIONS FOR NEXT SESSION

**Risks:**
1. **HALT-ENV (HF-294):** if Vercel `NEXT_PUBLIC_AI_MODEL` is set to the dead string `claude-sonnet-4-20250514`, the env var overrides the code-default fix and the bug persists in production. *Mitigation:* architect confirms the Vercel env var is unset or set to `claude-sonnet-4-6`. (Architect believed resolved; verify.)
2. **No `profile_scope` seeded on any tenant** → the Stage-1 fail-closed fix gates every manager persona to empty platform-wide. *Mitigation:* seed `profile_scope` (the runbook has the exact INSERT with real Sabor location IDs). This is a prerequisite for any manager-scoped test, the MIR demo, and the RLS back-door test.
3. **Data-layer confidentiality gap (R5):** RLS is tenant-scoped only; service-role routes bypass it; `/api/financial/data` has no caller check. *Mitigation:* the entity-scope RLS / caller-check fix is a real increment behind the architect's runbook verification.
3a. **Orphaned pages bounce on direct access.** The ~55 orphaned pages listed in the recovery HTML walk-list bounce the architect to Observatory when accessed on the preview — this is NOT an app-wide auth problem (production and nav-registered pages work fine); it's specific to orphaned pages whose route guards/layout wrappers/context dependencies fail when accessed outside the normal app shell. *Implication:* the walk can proceed from the value-map document (page names, descriptions, MIR mappings, substance metrics, lineage) rather than rendered pages; the bounce itself is diagnostic (those pages need wiring into the app shell, which is part of "make real"). *Mitigation:* the recovery build (OB-212) fixes the guards/context as part of re-homing the kept pages into the agent nav.
4. **The 55-doc directive corpus is parked on a DO-NOT-MERGE branch** — durable but not in main's history. *Mitigation:* relocate to main (a docs-only commit) after the recovery walk, so the authoritative directive record lives in durable history.
5. **The MIR R1 profile is not in the VP repo** — the recovery build will be mis-scoped if drafted against the directive's summary instead of the real document. *Mitigation:* commit the MIR profile to the VP repo before the recovery build directive.

**Open questions:**
1. **Canonical rep statement surface:** `/perform/statements` (655L, most mature) vs `/my-compensation` vs `/stream`'s rep card. Drives whether `/perform/*` is kept or retired. Architect decides from the walk (the maturity signal points at `/perform/statements`).
2. The architect's KEEP/ABSORB/DISCARD decisions across the ~56 walkable pages (walk in progress) — the gating input to the recovery build.
3. Whether the recovery `/recovery` page's auth gate (which bounces the architect) is a localized bug or an app-wide session/scope re-resolution flicker — relevant because if app-wide, it affects production navigation, not just scaffolding.

## SECTION 19 — IMMEDIATE NEXT SESSION START SCRIPT

**Turn 1 — Claude reads (in project knowledge):** read Section -1 (strategic frame + binding constraint), then Section 0, then Section 19, then Section 20 of this handoff. Produce a one-paragraph orientation that explicitly names (a) the next milestone = the MIR demo / Alpha User-Ready gate, and (b) the binding constraint = orphaned-page triage → wire the platform beneath the kept MIR-critical pages, with profile_scope seeding + the MIR profile committed to repo as prerequisites. **Andrew confirms or corrects the orientation.**

**Turn 2 — minimum-viable verification (Correction 2).**
- **Andrew runs locally:** `git log origin/main --oneline -3` — confirm the HF-294 merge (#524) is present on main as this handoff describes, and report the actual post-#524 HEAD SHA (this handoff's drafter clone lagged at #522).
- **Verbal confirmation:** "Any manual state changes to git, Supabase, Vercel, or external credentials since session close — in particular, was the Vercel `NEXT_PUBLIC_AI_MODEL` env var confirmed (Risk 1)? If none pending, proceed."

**Turn 3 — direct the path.** Based on the walk state: if the architect has completed (or substantially advanced) the orphaned-page walk, the next action is the **recovery BUILD directive** — scoped from the KEEP/ABSORB/DISCARD decisions AND the real MIR R1 profile (which Andrew first commits to the VP repo). If the walk is incomplete, the next action is to resume the walk (open the local HTML walk-list, log into the recovery preview as platform-admin, click pages in new tabs) and/or seed `profile_scope` (Risk 2) so manager-persona pages render during the walk. **Claude drafts no build directive until the walk decisions and the MIR profile are in hand.**

## SECTION 20 — PATH DETAIL

**Path A — Recovery build (the critical path).**
- *Identifier:* no OB yet — next free is **OB-212** (OB high-water = 211, derived from repo). Will likely spawn HFs (next free **HF-295**; HF high-water = 294 post-merge).
- *Scope:* per the architect's walk decisions — KEEP pages get the underlying platform wired (Disputes, Statements, Audit, Approvals are the MIR-critical cluster); ABSORB pages merge inferred functionality into the canonical sibling (e.g. Users); DISCARD pages (empty + superseded variants) are retired/redirected.
- *Dependencies:* (1) the architect's walk decisions; (2) the **MIR R1 profile committed to the VP repo** (it names the exact underlying work — Disputes E4, statements E2/E3, audit E3 sink-integrity, pagination E3); (3) `profile_scope` seeded (so manager surfaces render).
- *Gates:* per the MIR development schedule (the E-tier fixes + AB browser items); each KEEP page's "make real" is a vertical slice (engine + experience together per the Vertical Slice rule).
- *Meta rules baked in:* substance-over-reachability triage; only empty/superseded discarded; the deployed-state-render check before declaring any page "done."
- *Estimated time:* multi-session (the MIR demo build arc).
- *Sequencing:* first. The demo surfaces live among these pages.

**Path B — Data-layer security (R5) + profile_scope seeding.**
- *Identifier:* an HF (next free HF-295) for the entity-scope RLS / caller-check; a seeding operation (architect-executed) for profile_scope.
- *Scope:* add entity/manager-scope RLS policies (or server-route scope re-checks) to `calculation_results`/`committed_data`/`entities` and `/api/financial/data`; seed `profile_scope` for demo managers.
- *Dependencies:* the architect's runbook verification (does the back-door actually return whole-tenant data) confirms the exact gap before the fix.
- *Sequencing:* profile_scope seeding is a near-term prerequisite (gates Path A's manager surfaces and the demo); the RLS fix is before real-customer data, can ride alongside Path A.

**Path C — Corpus relocation + branch hygiene.**
- *Identifier:* a docs-only commit; no OB.
- *Scope:* relocate the 55 parked directive/design docs from `ob211-recovery-artifacts` to main (durable history); decide the fate of the temporary `/recovery` page (delete once the walk-list supersedes it); close/keep PR #523.
- *Sequencing:* after the walk; low-risk, do when convenient.

**Recommendation across all paths:** **Path A is the critical path and the frame of reference filters to it.** The immediate gating actions are not building — they are (1) the architect completing the walk, (2) committing the MIR R1 profile to the repo, and (3) seeding `profile_scope`. Once those three are in hand, OB-212 (the recovery build) is scoped from real decisions against the real requirement document. Path B's profile_scope seeding is the near-term prerequisite that unblocks both the walk's manager surfaces and the demo. Defer Path C until the walk is done.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*GOVERNANCE_SESSION_HANDOFF_20260615.md — Session close 2026-06-15 (VP)*
*OB-211 comprehensive closed (15 PRs) + HF-294 merged (#524); the lasting product is the recovery value-map turning ~56 orphaned pages into a MIR-scoped recoverable backlog. 5 Meta candidates in flight. Forward state: architect mid-walk; OB-212 recovery build gated on the walk decisions + the MIR profile committed to repo + profile_scope seeded.*
