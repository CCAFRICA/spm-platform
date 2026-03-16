# OB-173: EXPERIENCE ARCHITECTURE — USER JOURNEY REMEDIATION
## Platform Experience Reconciliation Against DS-013

**Date:** March 16, 2026
**Type:** Objective Build
**Sequence:** OB-173
**Governing Specifications:** DS-013 (Platform Experience Architecture), DS-015 (Intelligence Stream Evolution)
**Governing Principles:** Decision 123 (Transparent Architectural Compliance), Decision 124 (Research-Derived Design)
**Test Battery:** IAP Gate, Five Elements, Thermostat, Action Proximity, Cognitive Fit, Reference Frame, Korean Test

---

## PREAMBLE: WHAT THIS OB IS AND IS NOT

This is a comprehensive user experience remediation. The calculation engine is proven (Oct $44,590, Nov $46,291, Dec $61,986 — all exact). The backend capabilities exist (lifecycle API, approval workflow, trajectory engine, intelligence stream). What does NOT work is the user's ability to operate these capabilities through the browser without confusion, dead-ends, or invisible features.

This OB addresses **23 findings from today's session (CLT-173)** plus **relevant open findings from CLT-51A through CLT-172** that trace to the same root cause: backend capability exists, frontend surface exists, the wiring between them was never completed.

**This is NOT a patch cycle.** This is a single OB with phased implementation, each phase browser-testable, addressing the user journey end-to-end: Import → Calculate → Review → Approve → Stream.

**DO NOT modify the calculation engine, convergence bindings, SCI classification logic, or any API that currently produces correct results.**

---

## CONTEXT: CC_STANDING_ARCHITECTURE_RULES.md v3.0

**Read CC_STANDING_ARCHITECTURE_RULES.md in its entirety before proceeding. It is at the repo root.**

Key rules for this OB:
- Standing Rule 2: Scale by Design — all changes domain-agnostic, Korean Test
- Standing Rule 7: Prove, Don't Describe — browser verification, not self-attestation
- Standing Rule 9: IAP Gate — Intelligence, Acceleration, Performance on every element
- Standing Rule 13: `auth_user_id = auth.uid()` not `id`
- Standing Rule 24: One canonical location per surface
- Anti-Pattern AP-10: FP-73 (backend fix, frontend not updated) — THE pattern this OB fixes
- Anti-Pattern AP-11: FP-74 (fix present but unreachable)
- Anti-Pattern AP-17: FP-67 (dashboard not intelligence)
- G1-G6 Evaluation Framework mandatory in Architecture Decision phase

**New Standing Rules (effective this OB):**
- Standing Rule 28: Every phase ends with one browser-testable acceptance criterion stated to Andrew before CC executes.
- Standing Rule 29: No code changes to fix production issues until a diagnostic-only prompt has identified root cause with database evidence.
- Standing Rule 30: One root cause per phase. No bundling.
- Standing Rule 31: FP-77 — UI display bug assumed to be data bug. Diagnose which layer before fixing.
- Standing Rule 32: FP-78 — Multiple fixes bundled. Isolate per phase.
- Standing Rule 33: FP-79 — Speculative fixes without diagnostic. Evidence first.

---

## FINDINGS ADDRESSED BY THIS OB

### CLT-173 (Today — March 16, 2026)

| # | Finding | Sev | Phase |
|---|---------|-----|-------|
| CLT173-F01 | Multi-tab import: expand/collapse toggles all units simultaneously | P0 | A |
| CLT173-F02 | Multi-tab import: Confirm All does not update confirmed counter | P0 | A |
| CLT173-F03 | Multi-tab import: Import button stays inactive despite all confirmed | P0 | A |
| CLT173-F04 | SCI confidence flat at 90% across 6 imports (flywheel not improving) | P1 | DEFERRED (DIAG) |
| CLT173-F05 | SCI voice anthropomorphized: "What I Observe" / "What Would Change My Mind" | P1 | A |
| CLT173-F06 | No lifecycle action on Calculate page — only "Calculate" button after result | P0 | B |
| CLT173-F07 | "Verify Results" is text hyperlink for consequential workflow action | P1 | B |
| CLT173-F08 | No component breakdown visible on Calculate page | P1 | B |
| CLT173-F09 | No prior-period comparison on Calculate page | P1 | B |
| CLT173-F10 | Lifecycle state (PREVIEW) shown only in breadcrumb, not on page | P1 | B |
| CLT173-F11 | Mixed affordance types on /stream (status vs info vs action identical) | P1 | C |
| CLT173-F12 | Duplicate "Start Reconciliation" on /stream (System Health + Lifecycle) | P1 | C |
| CLT173-F13 | Trajectory velocity lacks reference frame (no base, no %, no context) | P1 | C |
| CLT173-F14 | /stream not accessible from sidebar (Decision 128 violation) | P1 | C |
| CLT173-F15 | Lifecycle stepper: user has no understanding of what states mean | P1 | C |
| CLT173-F16 | Display formatting: unnecessary .00 on whole-dollar amounts | P2 | D |
| CLT173-F17 | Lifecycle disconnected from every page where users work | P0 | B+C |
| CLT173-F18 | No approval workflow surface despite API existing | P1 | B |
| CLT173-F19 | Lifecycle purpose/value not established for user | P1 | C |
| CLT173-F20 | tenant-config 403 persists (10+ sessions) | P2 | D |
| CLT173-F21 | Entity-to-user linking absent (blocks rep persona) | P1 | DEFERRED |
| CLT173-F22 | Manager persona: no team view | P1 | DEFERRED |
| CLT173-F23 | Classification metadata exposed to user (identifierRepeatRatio) | P2 | A |

### Cross-CLT Findings Addressed

| Source | Finding | Sev | Phase |
|--------|---------|-----|-------|
| CLT85-F57 | Components column empty on Calculate page | P1 | B |
| CLT85-F59 | Period ribbon nearly unreadable | P1 | B |
| CLT84-F46 | Plan × Data × Period not user-controllable | P0 | B |
| CLT160-F02 | "Confirm all" is the only action on import | P2 | A |
| CLT160-F03 | "What I Observe" tone is system-facing | P2 | A |
| CLT160-F04 | "What Would Change My Mind: Not available" | P2 | A |
| CLT142-F08 | Personal tone, not technical | P2 | A |
| CLT51A-F22 | Language selector not enforced for Admin | P1 | D |
| PDR-01 | Currency shows cents on large amounts | P1 | D |
| CLT172-F07 | tenant-config 403 persists | P2 | D |
| CLT172-F12 | /stream not accessible from sidebar | P2 | C |

---

## ARCHITECTURE DECISION GATE

Complete this BEFORE writing any implementation code. Commit the answers to git.

```
ARCHITECTURE DECISION RECORD — OB-173
======================================
Problem: Backend capabilities exist (lifecycle, approval, trajectory, intelligence)
         but user cannot operate them. 23 new + ~15 cross-CLT findings trace to
         disconnected frontend-backend wiring.

Approach: Phase-by-phase user journey remediation. Each phase addresses one
          surface (Import, Calculate, Stream, Persistent) with isolated,
          browser-testable changes. No engine modifications.

G1 (Standards): WCAG 2.1 AA (contrast, action affordances), ISO 9241-110 (dialogue principles)
G2 (Embodiment): DS-013 Test Battery applied to every element modified
G3 (Traceability): CLT finding IDs traced to specific code changes
G4 (Discipline): HCI (Fitts's Law for action sizing), Cognitive Psychology (preattentive processing for card differentiation), Workflow Design (lifecycle state communication)
G5 (Abstraction): All patterns domain-agnostic — lifecycle, action affordance, card hierarchy apply to any module
G6 (Evidence): Specific research cited per phase below

CONSTRAINTS:
- DO NOT modify calculation engine, convergence bindings, or SCI classification logic
- DO NOT modify any API route that currently produces correct results
- Korean Test: all new labels, states, and actions must be domain-agnostic
- Supabase .in() ≤ 200 items
- Git from repo root (spm-platform), NOT web/
```

---

## PHASE 0: DIAGNOSTIC — CURRENT STATE AUDIT

Before ANY code changes, produce a comprehensive diagnostic.

**Mission 0.1:** Audit the current import flow.
- Open `/web/src/app/(app)/[tenantSlug]/operate/import/page.tsx` (or equivalent)
- Document the component tree: what renders the content unit cards, what controls expand/collapse, what gates the Import button
- Identify the state variable that tracks "confirmed" vs "checked" vs "expanded"
- Paste the relevant code sections (do not summarize — paste)

**Mission 0.2:** Audit the current Calculate page.
- Open the Calculate page component
- Document: what renders after calculation completes, what actions are available, where lifecycle status appears
- Identify where the lifecycle transition API could be wired
- Paste the relevant code sections

**Mission 0.3:** Audit the current /stream page.
- Document: what card types exist, how they're styled, whether any visual differentiation exists between status/info/action
- Identify the sidebar navigation configuration — why /stream is not listed
- Paste sidebar config code

**Mission 0.4:** Audit the tenant-config 403.
- Identify the API route `/api/platform/tenant-config`
- Check what calls it, why it returns 403, whether it's necessary
- Paste the route handler and the client-side caller

**Proof Gate 0:** Paste ALL diagnostic findings as raw code. Do not summarize. Commit diagnostic to git.

---

## PHASE A: IMPORT EXPERIENCE

**Research basis:** Individual content unit confirmation follows the "explicit acknowledgment" pattern from form design research (Wroblewski, 2008: Web Form Design). Each distinct data unit requires independent user confirmation. Batch confirmation ("Confirm All") must update each unit's state individually, not toggle a single flag. Action button activation must be gated on actual confirmed state, not visual checkbox state.

**Mission A.1:** Fix multi-tab content unit independence.
- Each content unit card must have its own independent expand/collapse toggle
- Expanding one card does NOT expand others
- Each card has its own "confirmed" state independent of other cards
- "Confirm All" iterates through all cards and sets each to confirmed, updating the counter to "N of N confirmed"
- Import button activation gate: `confirmedCount === totalCount`

**CLT findings addressed:** CLT173-F01, F02, F03, CLT160-F02

**Mission A.2:** Rewrite SCI classification display — institutional voice.
Replace anthropomorphized language with institutional authority tone:

| Current (Remove) | Replacement |
|---|---|
| "What I Observe" | "Observations" |
| "What Would Change My Mind" | "Reclassification Conditions" |
| "Why I Chose This Classification" | "Classification Rationale" |
| "This looks like operational data" | "Classification: Operational Data" |
| "ID_Empleado looks like an identifier" | "Identified as: Entity Identifier (90%)" |

Do NOT expose internal metrics to the user (identifierRepeatRatio, numericFieldRatio, idRepeatRatio). These are developer diagnostics. The user sees: field name → classified role → confidence percentage.

**CLT findings addressed:** CLT173-F05, F23, CLT160-F03, F04, CLT142-F08

**Mission A.3:** Build + test.
- Kill dev server → rm -rf .next → npm run build → npm run dev
- Verify on localhost:3000

**Browser Test (Andrew):** Upload BCL_Datos_Ene2026.xlsx (multi-tab, 3 sheets). Expected:
1. Three content unit cards appear, each independently expandable
2. Click "Confirm all" → counter shows "3 of 3 confirmed"
3. Import button activates (green, clickable)
4. No "What I Observe" / "What Would Change My Mind" text anywhere on page
5. Classification shows "Classification: Transaction Data — 90%" not "This looks like operational data"

**If Import button does NOT activate:** The fix failed. Do not proceed. Report which state variable is blocking.

---

## PHASE B: CALCULATE EXPERIENCE

**Research basis:** Post-action result display follows the "completion state" pattern (Tidwell, 2010: Designing Interfaces). After a consequential computation, the interface must show: the result, the context (what changed), the next action (what to do now), and the status (where this sits in the workflow). Consequential actions require button-weight affordances — Fitts's Law: target size proportional to action importance (Fitts, 1954). Text hyperlinks signal navigation, not commitment.

**Mission B.1:** Post-calculation result card transformation.
When calculation completes, the plan card transforms from "Ready" state to "Result" state:

**Result state shows:**
1. **Total payout** (large, prominent): $61,986
2. **Component breakdown** (visible without click): C1: $25,450 | C2: $18,140 | C3: $10,646 | C4: $7,750
3. **Period comparison** (if prior period exists): "vs. $46,291 last month (+34%)"
4. **Entity count:** 85 entities calculated
5. **Lifecycle status badge** (prominent, not just breadcrumb): "Status: PREVIEW"
6. **Primary action button:** "Advance to Official" (or the next lifecycle state — whatever the valid transition is)
7. **Secondary action:** "Recalculate" (demoted, text link or secondary button style)
8. **Tertiary action:** "View Entity Details →" (replaces current "Verify Results" hyperlink — still navigational but clearly labeled)

**Implementation notes:**
- Component breakdown: read from `calculation_results` metadata or `entity_period_outcomes` aggregate
- Period comparison: query prior period's batch total from `calculation_batches`
- Lifecycle transition: call existing `/api/lifecycle/transition` endpoint with appropriate state
- Use existing component styling patterns — this is a card state change, not a new page

**CLT findings addressed:** CLT173-F06, F07, F08, F09, F10, F17, F18, CLT85-F57

**Mission B.2:** Period selector enhancement.
- Period selector shows period label (e.g., "November 2025") with visual weight
- Selected period is clearly highlighted
- If multiple periods have results, show total next to each in dropdown

**CLT findings addressed:** CLT85-F59, CLT84-F46

**Mission B.3:** Build + test.

**Browser Test (Andrew):** Navigate to /operate/calculate → select December 2025 → Calculate. Expected:
1. After calculation, card shows $61,986 with component breakdown visible
2. "vs. $46,291 (+34%)" comparison shown (prior period = November)
3. Status badge: "PREVIEW" prominent on the card
4. Primary button: "Advance to Official" (or next lifecycle state)
5. "Recalculate" demoted to secondary
6. No "Verify Results" hyperlink — replaced with "View Entity Details →"

**If component breakdown shows $0 or undefined:** Check calculation_results metadata structure. Paste the JSON.

---

## PHASE C: INTELLIGENCE STREAM

**Research basis:** Card hierarchy follows Few's information dashboard design principles (2006): status indicators use minimal visual weight (badges, chips), informational elements use medium weight (cards with data), and actionable elements use maximum weight (prominent buttons with clear labels). Preattentive processing (Ware, 2004) requires that action cards be visually distinct from informational cards within 200ms of scanning. Duplicate actions across multiple locations violate the "single point of truth" principle for interface actions (Cooper, 2014: About Face).

**Mission C.1:** Card visual differentiation.
Establish three visual tiers for /stream cards:

| Tier | Purpose | Visual Treatment |
|---|---|---|
| Status | System Health, CRL, Lifecycle position | Compact, muted background, no prominent CTA |
| Information | Trajectory, Population Distribution, Pipeline Readiness | Standard card, data-focused, secondary actions only |
| Action | Import needed, Reconciliation needed, Approval pending | Accent border or background, primary CTA button, clear verb |

Apply to all existing /stream sections. The specific styling is your architecture decision — but the three tiers must be visually distinguishable at a glance.

**CLT findings addressed:** CLT173-F11

**Mission C.2:** Remove duplicate reconciliation action.
"Start Reconciliation" appears in BOTH System Health card AND Lifecycle card. Remove from one. Keep it in whichever location provides the most context for the user to decide whether to take the action.

**CLT findings addressed:** CLT173-F12

**Mission C.3:** Trajectory reference frame.
Trajectory Intelligence section must show:

| Current | Add |
|---|---|
| +$8,698/period | Base: from $44,590 to $61,986 over 3 periods |
| "Accelerating" | +19.5% avg growth rate |
| Projected: $70,684 | (already shown — connect to velocity) |

Suppress trailing `.00` on whole-dollar amounts. $8,698/period not $8,698.00/period. Apply this formatting rule to ALL currency displays on /stream.

**CLT findings addressed:** CLT173-F13, F16

**Mission C.4:** Sidebar navigation — add /stream.
Decision 128 (LOCKED): /stream is canonical landing for all authenticated users.
The sidebar must include a direct link to /stream. Currently it's only accessible by typing URL or navigating through Perform → Intelligence.

Check sidebar configuration. Add /stream as a top-level navigation item (above Operate, above Perform). Label: "Intelligence" or "Stream" — domain-agnostic.

**CLT findings addressed:** CLT173-F14, CLT172-F12

**Mission C.5:** Lifecycle stepper context.
The lifecycle stepper currently shows 8 states as circles with labels. Add a one-line description under the CURRENT state explaining what it means and what action is needed:

- DRAFT: "Plan imported. Ready for first calculation."
- PREVIEW: "Calculated. Review results before making official."
- RECONCILE: "Compare against external sources."
- OFFICIAL: "Results verified. Submit for approval."
- APPROVED: "Approved by authorized reviewer."
- POSTED: "Locked for payout processing."
- CLOSED: "Period finalized. No further changes."
- PUBLISHED: "Visible to all stakeholders."

Only show description for the CURRENT state. Not all states at once.

**CLT findings addressed:** CLT173-F15, F19

**Mission C.6:** Build + test.

**Browser Test (Andrew):** Navigate to /stream. Expected:
1. Cards are visually distinguishable: status (compact/muted), info (standard), action (accent/prominent)
2. "Start Reconciliation" appears in exactly ONE location
3. Trajectory shows base range, percentage growth rate, no .00 decimals
4. Sidebar has direct link to /stream (or Intelligence)
5. Lifecycle stepper shows description for CURRENT state only

---

## PHASE D: PERSISTENT DEFECTS

**Mission D.1:** Resolve tenant-config 403.
From Phase 0 diagnostic, determine:
- Is `/api/platform/tenant-config` needed? If not, remove the call.
- If needed, fix the 403 (likely: route checks for `platform` role, tenant admin has `admin` role).

**CLT findings addressed:** CLT173-F20, CLT172-F07

**Mission D.2:** Currency formatting — suppress unnecessary decimals.
Find the currency formatting utility. If amount is a whole dollar (no cents), display without decimals. $8,698 not $8,698.00. $44,590 not $44,590.00. If cents exist, show them: $198.50.

This applies globally — all currency displays platform-wide.

**CLT findings addressed:** CLT173-F16, PDR-01

**Mission D.3:** Build + test.

**Browser Test (Andrew):** Any page. Expected:
1. Console shows ZERO tenant-config 403 errors
2. Currency amounts without cents show no decimal: $44,590 not $44,590.00
3. Currency amounts with cents still show cents: $198.50

---

## PHASE E: AUTOMATED CLT — PRE-COMPLETION VERIFICATION

Before writing the completion report, verify EVERY finding addressed:

```
CLT-173 AUTOMATED VERIFICATION
===============================
Phase A:
[ ] Multi-tab expand/collapse independent? (CLT173-F01)
[ ] Confirm All updates counter to 3/3? (CLT173-F02)
[ ] Import button activates? (CLT173-F03)
[ ] No "What I Observe" text? (CLT173-F05)
[ ] No developer metrics visible? (CLT173-F23)

Phase B:
[ ] Component breakdown visible after calc? (CLT173-F08, CLT85-F57)
[ ] Period comparison shown? (CLT173-F09)
[ ] Lifecycle status on card (not just breadcrumb)? (CLT173-F10)
[ ] Primary action button for lifecycle transition? (CLT173-F06)
[ ] "Verify Results" hyperlink replaced with button? (CLT173-F07)
[ ] Period selector readable? (CLT85-F59)

Phase C:
[ ] Three visual card tiers distinguishable? (CLT173-F11)
[ ] "Start Reconciliation" in exactly one location? (CLT173-F12)
[ ] Trajectory shows base + percentage + no .00? (CLT173-F13, F16)
[ ] /stream in sidebar? (CLT173-F14)
[ ] Lifecycle stepper shows current-state description? (CLT173-F15)

Phase D:
[ ] Zero tenant-config 403 in console? (CLT173-F20)
[ ] Whole-dollar amounts show no decimals? (PDR-01)
```

**Each checkbox requires PASTED EVIDENCE.** Screenshot path, console output, or DOM inspection. Self-attestation is not accepted.

---

## COMPLETION REQUIREMENTS

1. **Commit + push after every phase.** Not after all phases.
2. **Kill dev server → rm -rf .next → npm run build → npm run dev** between every phase.
3. **Git from repo root** (spm-platform), NOT web/.
4. **Final step:** `gh pr create --base main --head dev` with title "OB-173: Experience Architecture — User Journey Remediation" and body listing all CLT findings addressed.
5. **Do NOT claim completion without pasted evidence for every checkbox in Phase E.**

---

## WHAT THIS OB DOES NOT ADDRESS (DEFERRED)

| Finding | Reason | When |
|---|---|---|
| CLT173-F04 (SCI flywheel flat) | Requires DIAG-004 investigation | After OB-173 |
| CLT173-F21 (entity-to-user linking) | Requires schema + auth changes | Separate OB |
| CLT173-F22 (manager team view) | Requires persona + hierarchy | Separate OB |
| Manager persona surface | Requires entity-to-user linking first | After entity linking |
| Rep persona auto-scoping | Requires entity-to-user linking first | After entity linking |
| Chrome incognito auth cookie | Confirmed not server-side | Monitor |

---

## ANTI-PATTERN AWARENESS

| Pattern | Risk in This OB | Mitigation |
|---|---|---|
| FP-73 (backend exists, frontend broken) | THIS IS WHAT WE'RE FIXING | Every phase wires backend to frontend |
| FP-74 (fix present but unreachable) | Lifecycle API exists but no buttons | Phase B adds buttons, Phase C adds stream actions |
| FP-70 (phase deferral as completion) | Temptation to skip Phase E verification | Phase E is mandatory with pasted evidence |
| FP-77 (UI bug assumed to be data bug) | Multi-tab import might seem like data issue | Phase 0 diagnostic first |
| FP-78 (multiple fixes bundled) | Each phase is ONE surface | Do not combine phases |

---

*"The test is not whether the engine works — it is whether the user can successfully use the platform."*
