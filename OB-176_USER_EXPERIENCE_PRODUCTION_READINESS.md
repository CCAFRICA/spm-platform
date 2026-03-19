# OB-176: User Experience Production Readiness
## Import Intelligence Display + Lifecycle Workflow Wiring
## March 18, 2026

---

## READ FIRST — IN THIS ORDER

1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL rules including Section 0 (Governing Principles)
2. `SCHEMA_REFERENCE_LIVE.md` — verify every column name before writing SQL or code
3. `PERSISTENT_DEFECT_REGISTRY.md` — verify all in-scope items before completion report
4. This prompt (read COMPLETELY before writing any code)

**STANDING RULES 28-34 (active this session):**
- **28:** Every phase ends with one browser-testable acceptance criterion
- **29:** No code changes until diagnostic identifies root cause with evidence
- **30:** One issue per prompt. ← This OB is the exception: it is ONE comprehensive OB covering a defined scope. Do NOT split into sub-HFs.
- **31:** Diagnose which layer (UI vs data) before fixing
- **32:** Multiple fixes bundled makes failures undiagnosable ← Mitigated by single-commit-per-phase
- **33:** No speculative fixes without diagnostic
- **34:** **No Bypass Recommendations.** Diagnose and fix structurally. No workarounds, no reduced scope, no interim measures.

**STANDING RULE 4: Do NOT use any ground truth values in this prompt. Andrew verifies independently.**

---

## CONTEXT

The vialuce calculation engine is **proven** — $312,033 exact across 6 months for BCL, verified twice through two different import paths. Meridian at MX$185,063. The engine is not in scope for this OB.

This OB addresses the **user experience layer** — what Patricia Zambrano (BCL admin) sees when she operates the platform. Two workstreams:

**Workstream 1: Import Intelligence Display** — The structural fingerprinting (DS-017) works at the infrastructure level. Files are recognized in ~1s with zero LLM calls on known structures. But the user sees 69% confidence and "0 confident" badges. The display layer is disconnected from the flywheel state.

**Workstream 2: Lifecycle Workflow Wiring** — The lifecycle backend exists (API at /api/lifecycle/transition). The /stream page shows a lifecycle stepper with "Start Reconciliation →". But no one has verified that clicking these buttons actually advances the lifecycle state. The UI wiring may be incomplete.

### What's Already Verified Working (DO NOT TOUCH)
- Component breakdown on Calculate page ✅
- Period comparison on Calculate/Stream ✅
- Card differentiation on /stream ✅
- Trajectory reference frame on /stream ✅
- Lifecycle stepper descriptions on /stream ✅
- Duplicate reconciliation removal ✅
- Empty state with context on /stream ✅
- Async import pipeline (processing_jobs, parallel workers) ✅
- File name display on import cards ✅
- Currency .00 suppression ✅
- SCI institutional voice ✅

---

## PHASE 0: DIAGNOSTIC — FLYWHEEL CONFIDENCE STATE

**Objective:** Understand exactly why the user sees 69% when the system recognized their file in ~1s.

**Actions:**
1. Find `fingerprint-flywheel.ts` (or equivalent — the file that reads/writes structural_fingerprints)
2. Log the current state for BCL tenant:
   - Query `structural_fingerprints` for tenant `b1c2d3e4-aaaa-bbbb-cccc-111111111111`
   - What is `match_count`? What is `confidence`? What is the Bayesian update formula?
3. Find where the confidence badge is rendered on the import page
   - Trace: what value does the badge read? From which table/API?
   - Is it reading `structural_fingerprints.confidence` or the CRR posterior score?
4. Find the Bayesian update function
   - What formula updates confidence when a match occurs?
   - Why does it plateau at 0.7 despite 12+ matches?

**Acceptance criterion:** A diagnostic log showing: (a) the current confidence value in structural_fingerprints, (b) the exact code path from that value to the rendered badge, (c) the Bayesian update formula with the mathematical reason it's stuck.

**Commit:** `OB-176 Phase 0: Flywheel confidence diagnostic`

---

## PHASE 1: FLYWHEEL CONFIDENCE — BAYESIAN UPDATE FIX

**Objective:** Fix the Bayesian update formula so confidence increases with each successful match.

**Context from DS-017:** Structural fingerprinting operates in 3 tiers:
- **Tier 1:** Exact fingerprint match. Zero LLM calls. Should display HIGH confidence.
- **Tier 2:** Cross-tenant structural analogy. Minimal LLM.
- **Tier 3:** Novel structure. Full LLM classification.

**Requirements:**
1. The Bayesian update formula must produce monotonically increasing confidence for repeated Tier 1 matches
2. After N successful matches, confidence should approach but not reach 1.0
3. A reasonable formula: `confidence = 1 - (1 / (matchCount + 1))` or equivalent — at matchCount=12, this gives ~0.923
4. The update must happen on every successful Tier 1 match (user confirms classification for a known fingerprint)
5. Write the fix. Verify with a unit test or log output showing the progression: matchCount 1→2→5→10→20 and corresponding confidence values.

**What NOT to do:**
- Do not change the CRR posterior calculation — that's a separate concern
- Do not change the classification pipeline — only the flywheel confidence storage
- Do not hardcode confidence values — the formula must be mathematical

**Acceptance criterion:** After the fix, query `structural_fingerprints` for BCL tenant and confirm confidence > 0.9 for fingerprints with matchCount > 10. Log the formula output for matchCount values 1 through 20.

**Commit:** `OB-176 Phase 1: Bayesian update formula — monotonic confidence increase`

---

## PHASE 2: CONFIDENCE DISPLAY — FLYWHEEL OVER CRR

**Objective:** For Tier 1 matches, the import card should display the flywheel confidence (from structural_fingerprints), not the CRR posterior score.

**Requirements:**
1. Find where the import card confidence badge is rendered (the orange bar showing "69%")
2. Find where the "0 confident" badge at the top of the import page is computed
3. For Tier 1 matches (fingerprint recognized):
   - The per-card confidence bar should show flywheel confidence (the value from Phase 1)
   - The summary badge should reflect the count of confident (Tier 1) classifications
4. For Tier 3 (novel structure): continue showing the CRR posterior score — that's appropriate for first-time classifications
5. The data flow: `structural_fingerprints.confidence` → API response → import card badge

**Visual specification:**
- Tier 1 card: confidence bar should be green (not orange) when flywheel confidence > 0.85
- Tier 3 card: confidence bar remains orange/yellow as currently displayed
- Summary badge: "3 confident" (not "0 confident") when all 3 content units are Tier 1 matches

**Acceptance criterion:** Import 3 BCL data files (known structure). All three cards show confidence > 90% with green bars. Summary badge shows "3 confident". Console shows Tier 1 recognition path used.

**Commit:** `OB-176 Phase 2: Flywheel confidence display for Tier 1 matches`

---

## PHASE 3: RECOGNITION TIER BADGE

**Objective:** Add a visual indicator showing the recognition tier on each import card.

**Requirements:**
1. Tier 1 (known fingerprint): Show "⚡ Recognized" badge — communicates instant recognition
2. Tier 2 (cross-tenant analogy): Show "🔍 Similar structure found" badge
3. Tier 3 (novel): Show "🆕 New structure" badge
4. The tier information must already be in the classification response from the async pipeline. Find it and surface it.
5. Badge placement: next to the existing "transaction" classification badge on each card

**Acceptance criterion:** Import BCL data files. Each card shows "⚡ Recognized" badge. The badge is visually distinct from the classification badge.

**Commit:** `OB-176 Phase 3: Recognition tier badge on import cards`

---

## PHASE 4: CONTENT UNIT DATE DIFFERENTIATION

**Objective:** When multiple files are imported, each card should show what period/date range its data covers, so the user can distinguish between files.

**Requirements:**
1. Currently all cards show identical observations ("85 rows × 13 columns") with no way to tell which file covers which period
2. The committed_data for each file has `source_date` values. The SCI classification also examines the data and identifies temporal columns.
3. For each content unit card, extract and display the period or date range from the data:
   - If a "Periodo" column exists: show the most common value (e.g., "Periodo: 2025-10" or "October 2025")
   - If source_date is available from the file name or data: show it
   - Fallback: show the file name (already working) which contains the period
4. Display location: below the row count line on each card (e.g., "85 rows × 13 columns — October 2025")

**What NOT to do:**
- Do not change the SCI classification pipeline
- Do not add new LLM calls — this data is already available from the file content or name

**Acceptance criterion:** Import 3 BCL files (Oct/Nov/Dec). Each card shows a distinct period identifier. The user can tell which card corresponds to which month without expanding the card.

**Commit:** `OB-176 Phase 4: Content unit date differentiation`

---

## PHASE 5: IMPORT BUTTON ACTIVATION

**Objective:** After clicking "Confirm All", the Import button should activate immediately.

**Current behavior:** User clicks "Confirm All" → counter updates → but Import button sometimes stays inactive, requiring additional interaction.

**Requirements:**
1. Find the state management for the import button's disabled/enabled state
2. The button should be enabled when: all content units have `confirmed: true`
3. "Confirm All" should set all content units to confirmed AND immediately enable the import button in the same state update
4. No additional user interaction should be required between "Confirm All" and "Import N rows"

**Acceptance criterion:** Upload 3 files → click "Confirm All" → Import button is immediately clickable with correct row count. No extra clicks needed.

**Commit:** `OB-176 Phase 5: Import button activation after Confirm All`

---

## PHASE 6: LIFECYCLE WORKFLOW — DIAGNOSTIC

**Objective:** Determine whether the lifecycle state machine is wired end-to-end through the UI.

**Actions:**
1. Find the "Start Reconciliation →" button on /stream. What does it do when clicked?
   - Does it call `/api/lifecycle/transition`?
   - What transition does it attempt? (PREVIEW → RECONCILE? PREVIEW → OFFICIAL?)
2. Find the lifecycle transition API: `/api/lifecycle/transition`
   - What transitions does it support?
   - Does it enforce the state machine (prohibited transitions blocked)?
3. After a transition, does /stream refresh to show the new state?
4. Check: is there a UI for each transition in the lifecycle?
   - DRAFT → PREVIEW: happens automatically on calculation ✅
   - PREVIEW → OFFICIAL: button exists? Where?
   - OFFICIAL → PENDING_APPROVAL: button exists? Where?
   - PENDING_APPROVAL → APPROVED: button exists? Where?
   - APPROVED → POSTED: button exists? Where?

**Acceptance criterion:** A diagnostic log documenting: (a) which lifecycle transitions have UI buttons, (b) which transitions are missing UI, (c) the API endpoint and its supported transitions.

**Commit:** `OB-176 Phase 6: Lifecycle workflow diagnostic`

---

## PHASE 7: LIFECYCLE WORKFLOW — WIRING

**Objective:** Wire the complete lifecycle workflow so Patricia can advance a period from PREVIEW through POSTED via the UI.

**Requirements (based on Phase 6 findings):**
1. The /stream lifecycle section should show the **current state** and the **next available action**
2. Action buttons for each transition:
   - PREVIEW state → "Make Official" button (transitions to OFFICIAL)
   - OFFICIAL state → "Submit for Approval" button (transitions to PENDING_APPROVAL)
   - PENDING_APPROVAL state → "Approve" button (transitions to APPROVED) — NOTE: should require different user in production, but for admin demo this is acceptable
   - APPROVED state → "Post Results" button (transitions to POSTED)
3. Each button calls `/api/lifecycle/transition` with the appropriate parameters
4. After successful transition, /stream refreshes to show new state
5. The lifecycle stepper visual updates to reflect the current state
6. Error states: if transition fails, show a clear error message (not a crash)

**Implementation pattern:**
- Read the current lifecycle state from the calculation batch
- Determine the next valid transition
- Render the appropriate action button with the transition label
- On click: call API → refresh state → update stepper

**What NOT to do:**
- Do not implement separation of duties enforcement (future OB)
- Do not implement reversal/correction workflows (future OB)
- Do not change the lifecycle state machine — only wire existing states to UI buttons

**Acceptance criterion:** Starting from a calculated period in PREVIEW state:
1. Click "Start Reconciliation" or equivalent → state advances
2. Click next action → state advances to OFFICIAL
3. Click "Submit for Approval" → state advances to PENDING_APPROVAL
4. Click "Approve" → state advances to APPROVED
5. Click "Post Results" → state advances to POSTED
6. Lifecycle stepper on /stream reflects each state change
7. No console errors through the entire flow

**Commit:** `OB-176 Phase 7: Lifecycle workflow UI wiring`

---

## PHASE 8: POST-CALCULATION GUIDANCE

**Objective:** After a calculation completes, tell the user what to do next.

**Requirements:**
1. On the Calculate page, after a successful calculation:
   - Show a contextual message: "Calculation complete. Review results on the Intelligence Stream, then advance the lifecycle."
   - Include a "View Intelligence →" button/link to /stream
2. On /stream, if the current period is in PREVIEW state:
   - The lifecycle section already shows "Start Reconciliation →" — verify it works (Phase 7)
   - Add a brief explanation: "Results are in Preview. Review and advance to Official when ready."

**Acceptance criterion:** After calculating March 2026, the Calculate page shows guidance directing to /stream. On /stream, the lifecycle section shows actionable next step.

**Commit:** `OB-176 Phase 8: Post-calculation guidance`

---

## PHASE 9: STALE DATA CLEANUP ON SITE CLEAR

**Objective:** Document and address the stale data leakage observed when a site is cleared and only partial data is reimported.

**Context:** When BCL was cleared and only Jan/Feb/Mar reimported, calculating March produced $9,150 (only Regulatory Compliance). This was because committed_data from a previous import cycle was still present for some components. After reimporting all 6 files, March calculated correctly at the expected value.

**Requirements:**
1. Find the "clear site" or "delete data" mechanism for a tenant
2. Verify it clears ALL of: committed_data, calculation_results, calculation_batches, entity_period_outcomes, import_batches, processing_jobs
3. If convergence_bindings reference stale import_batches, they should either be cleared or gracefully handle missing data
4. This is a data hygiene issue, not an engine bug — but it affects user experience when an admin reimports data

**What NOT to do:**
- Do not change the engine's data resolution logic
- Do not add automatic cleanup on every import (that would destroy multi-period accumulation)

**Acceptance criterion:** Document the clear-site mechanism. If it's incomplete (doesn't clear all relevant tables), fix it. If it's correct and the $9,150 was user error (partial reimport), document that as expected behavior.

**Commit:** `OB-176 Phase 9: Stale data cleanup documentation and fix`

---

## PHASE 10: BUILD VERIFICATION + COMPLETION REPORT

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. `npm run dev` — confirm localhost:3000 loads
5. Create completion report file (see COMPLETION REPORT section below)
6. `git add . && git commit -m "OB-176 Phase 10: Build verification and completion report"`
7. `git push origin dev`
8. `gh pr create --base main --head dev --title "OB-176: User Experience Production Readiness — Import Intelligence + Lifecycle Wiring" --body "## Summary\nComprehensive UX OB covering flywheel confidence display, recognition tier badges, date differentiation, import button activation, lifecycle workflow wiring, and post-calculation guidance.\n\n## Phases\n- Phase 0: Flywheel confidence diagnostic\n- Phase 1: Bayesian update formula fix\n- Phase 2: Confidence display — flywheel over CRR\n- Phase 3: Recognition tier badge\n- Phase 4: Content unit date differentiation\n- Phase 5: Import button activation\n- Phase 6: Lifecycle workflow diagnostic\n- Phase 7: Lifecycle workflow UI wiring\n- Phase 8: Post-calculation guidance\n- Phase 9: Stale data cleanup\n- Phase 10: Build verification\n\n## Proof\nSee OB-176_COMPLETION_REPORT.md in project root."`

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-176_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## COMPLETION REPORT TEMPLATE

```markdown
# OB-176 COMPLETION REPORT
## Date: [DATE]
## Execution Time: [START] to [END]

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| | Phase 0 | Flywheel confidence diagnostic |
| | Phase 1 | Bayesian update formula fix |
| | Phase 2 | Confidence display — flywheel over CRR |
| | Phase 3 | Recognition tier badge |
| | Phase 4 | Content unit date differentiation |
| | Phase 5 | Import button activation |
| | Phase 6 | Lifecycle workflow diagnostic |
| | Phase 7 | Lifecycle workflow UI wiring |
| | Phase 8 | Post-calculation guidance |
| | Phase 9 | Stale data cleanup |
| | Phase 10 | Build verification and completion report |

## FILES CREATED
| File | Purpose |
|------|---------|

## FILES MODIFIED
| File | Change |
|------|--------|

## PROOF GATES — HARD
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | Bayesian update produces monotonic confidence increase for matchCount 1→20 | | [paste formula output] |
| 2 | structural_fingerprints.confidence > 0.9 for fingerprints with matchCount > 10 | | [paste DB query result] |
| 3 | Import cards show flywheel confidence (not CRR posterior) for Tier 1 matches | | [paste code path trace] |
| 4 | Summary badge shows correct confident count (not "0 confident") | | [paste rendered output] |
| 5 | Recognition tier badge visible on import cards | | [paste JSX snippet] |
| 6 | Content unit cards show distinct period/date for each file | | [paste rendered output] |
| 7 | Import button activates immediately after Confirm All | | [paste state management code] |
| 8 | Lifecycle transitions work through UI: PREVIEW → OFFICIAL → PENDING_APPROVAL → APPROVED → POSTED | | [paste API call/response for each transition] |
| 9 | Post-calculation guidance shown on Calculate page | | [paste JSX snippet] |
| 10 | npm run build exits 0 | | [paste exit code] |

## PROOF GATES — SOFT
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | Confidence bar color changes (green for Tier 1, orange for Tier 3) | | |
| 2 | Lifecycle stepper updates visually after each transition | | |
| 3 | No console errors through full import → calculate → lifecycle flow | | |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS/FAIL — [N] commits for 11 phases
- Rule 2 (cache clear after commit): PASS/FAIL
- Rule 6 (report in project root): PASS — this file exists
- Rule 18 (criteria verbatim): PASS — criteria copied exactly from prompt
- Rule 28 (one acceptance criterion per phase): PASS/FAIL
- Rule 34 (no bypasses): PASS/FAIL

## PERSISTENT DEFECT REGISTRY — VERIFICATION
| PDR # | Description | In Scope? | Status | Evidence |
|-------|-------------|-----------|--------|----------|
| PDR-01 | Currency no cents | YES | PASS/FAIL | |

## KNOWN ISSUES
- [anything that didn't work, partial implementations, deferred items]
```

---

## WHAT THIS OB DOES NOT COVER (Separate Future OBs)

- Entity-to-user linking (Workstream 3 — requires profile.entity_id wiring)
- Manager/Rep persona surfaces (depends on entity linking)
- Persona switcher for demo/testing
- Leader-follower fingerprint optimization (Decision 135 candidate)
- Approval workflow separation of duties enforcement
- Clawbacks/reversals
- Structured dispute resolution
- Plan editing/viewing UI
- Storage RLS fix for ingestion-raw bucket (Standing Rule 34 — needs structural fix)

---

*"The engine is proven. Now make it usable."*
