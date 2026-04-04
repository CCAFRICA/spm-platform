# HF-182: Comprehensive UX Bug Sweep
## All known UI bugs addressed in one pass to reduce merge-test cycles
## Priority: P1 — Platform trust and usability

---

## INCLUDE AT TOP OF PROMPT
- CC_STANDING_ARCHITECTURE_RULES.md v2.0
- CC_DIAGNOSTIC_PROTOCOL.md

---

## CONTEXT

CRP Plan 1 is proven (Jan 1-15: $73,142.72, Jan 16-31: $109,139.46 — both 100% match). The engine works. But the platform UX has accumulated 12 bugs across multiple CLT sessions that erode user trust, present contradictory information, and make the platform feel broken even when the engine is correct.

This HF fixes ALL of them in one pass to minimize merge-test cycles.

---

## ARCHITECTURE DECISION GATE

1. Does this HF modify any table schema? **NO** — all fixes are UI/API layer.
2. Does this HF affect calculation logic? **NO** — engine, convergence, intent executor untouched.
3. Korean Test? **PASS** — UI fixes, no domain vocabulary.
4. BCL/Meridian regression risk? **NONE** — UI-only changes.

---

## THE FIXES — 12 ITEMS

### Fix 1: Calculate page — "No results for this plan and period" after successful calculation
**Source:** CLT-195 F02
**Severity:** P0

**File:** `web/src/app/operate/calculate/page.tsx` (or the results display component)

**Current behavior:** After a successful calculation that produces $109,139.46, the page shows "No results for this plan and period. Run a calculation to see results."

**Required behavior:** After calculation completes, the results panel must display the calculation results immediately. The page should either:
- Auto-refresh the results panel after calculation completes (listen for batch status → PREVIEW)
- OR redirect to the results view after successful calculation

**DIAG first:** Read the actual page component. Find where the "No results" message is rendered. Trace what query it uses to check for results. Likely the query filters on a condition that doesn't match the freshly calculated batch (wrong period_id, wrong status, stale cache).

**Commit:** `HF-182 Fix 1: Calculate page shows results after calculation`

---

### Fix 2: Calculate page — stale data when switching periods
**Source:** CLT-195 F03
**Severity:** P1

**File:** Same as Fix 1

**Current behavior:** When the user selects a new period from the dropdown, the previous period's amounts remain displayed until Recalculate is clicked. The user sees Period B's data labeled as Period B but showing Period A's numbers.

**Required behavior:** When the period dropdown changes:
- If results exist for the new period: display them immediately
- If no results exist for the new period: show "No calculation results for this period" (not stale data)
- NEVER show one period's results under another period's label

**Implementation:** The period change handler must clear the displayed results and re-fetch for the new period. This is likely a React state issue — the results state isn't being reset when the period selection changes.

**Commit:** `HF-182 Fix 2: Calculate page clears results on period change`

---

### Fix 3: Calculate page — entity count doesn't reflect variant gate
**Source:** CLT-195 F05
**Severity:** P1

**File:** Same as Fix 1

**Current behavior:** Shows "32 entities · Bound · 571 rows" even though only 24 were calculated (8 excluded by variant eligibility gate).

**Required behavior:** After calculation, show the CALCULATED count: "24 entities calculated · 8 excluded". The "32 entities" is the assigned count before variant gating — not the calculation population.

**Implementation:** Read the calculation batch result (which includes `OB-194: 24 calculated, 8 excluded`). Display the post-gate counts, not the pre-gate assignment count.

**Commit:** `HF-182 Fix 3: Entity count reflects variant gate`

---

### Fix 4: Calculate page — "View Intelligence" and "Verify Results" are nondescript
**Source:** CLT-195 F04
**Severity:** P1

**File:** Same as Fix 1

**Current behavior:** Critical actions ("View Intelligence", "Verify Results") are plain text links below the calculation card. They look like afterthoughts.

**Required behavior:** These should be clearly styled action buttons or prominent links. At minimum:
- "Verify Results" should be a visible secondary button (not plain text)
- "View Intelligence" should be a visible secondary button
- Both should be visually distinct from surrounding text

**Commit:** `HF-182 Fix 4: Calculate page action buttons`

---

### Fix 5: Period dropdown doesn't refresh after period creation
**Source:** CLT-193 F10
**Severity:** P1

**File:** `web/src/app/operate/calculate/page.tsx` (period dropdown component)

**Current behavior:** After creating periods (e.g., 4 biweekly + 2 monthly), the period dropdown shows only monthly periods. User must leave the page and re-enter to see all periods.

**Required behavior:** After period creation completes, the period dropdown must refresh to show ALL available periods immediately. This is likely a query invalidation issue — the dropdown's data source isn't being re-fetched after period creation.

**Implementation:** After the period creation API call succeeds, invalidate/re-fetch the periods query that populates the dropdown.

**Commit:** `HF-182 Fix 5: Period dropdown refreshes after creation`

---

### Fix 6: Plan import confirmation shows wrong plan name
**Source:** CLT-193 F11
**Severity:** P1

**File:** `web/src/components/sci/SCIExecution.tsx` or the import completion display component

**Current behavior:** When importing Plan 2 (Consumables), the confirmation shows "District Override Plan" (the first imported plan's name, or the wrong plan entirely).

**Required behavior:** The confirmation must show the name of the plan that was JUST imported, not a cached or stale name from a previous import.

**DIAG first:** Read the component. Find where the plan name is displayed after import. Trace where it gets the name — likely from a stale state variable or from the wrong API response field.

**Commit:** `HF-182 Fix 6: Import confirmation shows correct plan name`

---

### Fix 7: District Override Plan renders as two cards
**Source:** CLT-193 F12
**Severity:** P1

**File:** `web/src/app/operate/calculate/page.tsx` (plan card rendering)

**Current behavior:** The District Override Plan has 2 variants (DM, RVP). It renders as two separate plan cards instead of one card with two variants.

**Required behavior:** Each rule_set is ONE card, regardless of how many variants it has. The card can show variant information inside it, but the card count should match the rule_set count.

**Implementation:** The plan card rendering likely iterates over variants instead of rule_sets. Fix the iteration to group by rule_set_id, then show variants within each card.

**Commit:** `HF-182 Fix 7: Multi-variant plans render as one card`

---

### Fix 8: "Calculate All N Plans" shows wrong count
**Source:** CLT-193 F13
**Severity:** P1 (consequence of Fix 7)

**File:** Same as Fix 7

**Current behavior:** "Calculate All 5 Plans" when there are 4 rule_sets.

**Required behavior:** Count should reflect unique rule_sets, not variant-expanded cards. Fixing Fix 7 should automatically fix this.

**Commit:** Combined with Fix 7 if they share the same root cause.

---

### Fix 9: Import history shows "no import events found"
**Source:** CLT-195 F01
**Severity:** P1

**File:** Import history page/component (likely under `web/src/app/operate/import/`)

**Current behavior:** The import history page shows "no import events found" despite multiple successful imports.

**Required behavior:** Display all import events for the current tenant with timestamps, file names, row counts, and classification results.

**DIAG first:** Read the import history component. Find what API it calls or what table it queries. Trace why it returns empty. Possible causes:
- Querying the wrong table (import_batches vs processing_jobs vs ingestion_events)
- Tenant filter not matching
- Status filter excluding completed imports

**Commit:** `HF-182 Fix 9: Import history displays events`

---

### Fix 10: Multi-file upload processes only first file
**Source:** CLT-181 F02
**Severity:** P1

**File:** `web/src/components/sci/SCIUpload.tsx` or the file upload handler

**Current behavior:** When multiple files are selected for upload, only the first file is processed.

**Required behavior:** All selected files should be processed sequentially or in parallel. Each file goes through the SCI analyze → proposal → confirm → execute flow.

**DIAG first:** Read the upload handler. If it takes a FileList but only processes `files[0]`, extend to iterate over all files. If it's a UI constraint (single file input), change to `multiple` attribute.

**Note:** This may be more complex than a single fix if the SCI proposal UI doesn't support reviewing multiple files simultaneously. If so, implement sequential processing: first file → proposal → confirm → execute → second file → proposal → etc. The minimum viable fix is processing all files through the same pipeline, even if they require individual confirmation.

**Commit:** `HF-182 Fix 10: Multi-file upload processes all files`

---

### Fix 11: Auth cookie maxAge persistence
**Source:** CLT-181 F12
**Severity:** P1 (compliance — Decision 148 candidate)

**File:** Auth middleware / cookie setting code (likely in `web/src/middleware.ts` or auth utilities)

**Current behavior:** Session cookie has `maxAge` set, causing the session to persist through browser close. User remains logged in after closing and reopening the browser.

**Required behavior:** Session cookie must be session-scoped (no `maxAge`). Cookie expires when browser closes. This is a security/compliance requirement (OWASP session management).

**Implementation:** Find where the auth cookie is set. Remove the `maxAge` property. The cookie becomes a session cookie that expires when the browser session ends.

**DIAG first:** 
```bash
grep -rn "maxAge\|max_age\|max-age" web/src/
```

**Commit:** `HF-182 Fix 11: Auth cookie session-scoped (remove maxAge)`

---

### Fix 12: Reconciliation period filter pulls wrong plan data
**Source:** CLT-195 F06
**Severity:** P1

**File:** `web/src/app/api/reconciliation/compare/route.ts` or the reconciliation comparison logic

**Current behavior:** When reconciling Plan 2 (monthly, January), the period filter matched "January 1-15, 2026" and "January 16-31, 2026" from the GT file — these are Plan 1's biweekly periods. The reconciliation compared Plan 2 VL results ($16,156.17) against Plan 1 GT values ($109,139.46).

**Required behavior:** The reconciliation must filter the benchmark file to rows matching the PLAN being reconciled, not just the period. If the GT file has multiple sheets/plans, the reconciliation should match by plan name or plan identifier, not just by period text.

**DIAG first:** Read the reconciliation comparison code. Understand how it selects rows from the benchmark file. The GT file (CRP_Resultados_Esperados.xlsx) has separate sheets per plan. The reconciliation should be reading the sheet that corresponds to the plan being reconciled.

**Commit:** `HF-182 Fix 12: Reconciliation filters by plan, not just period`

---

## PHASE STRUCTURE

| Phase | Fixes | Files |
|-------|-------|-------|
| 0 | DIAG: Read all target files, confirm code locations | — |
| 1 | Fixes 1-4: Calculate page (results, stale data, entity count, buttons) | calculate/page.tsx + related |
| 2 | Fix 5: Period dropdown refresh | calculate/page.tsx |
| 3 | Fix 6: Import confirmation plan name | SCIExecution.tsx or import completion |
| 4 | Fixes 7-8: Plan card dedup + count | calculate/page.tsx |
| 5 | Fix 9: Import history | import page/component |
| 6 | Fix 10: Multi-file upload | SCIUpload.tsx |
| 7 | Fix 11: Auth cookie maxAge | middleware or auth utilities |
| 8 | Fix 12: Reconciliation period filter | reconciliation compare route |
| 9 | Build verification (Rule 51v2) | — |
| 10 | Completion report | — |
| 11 | PR creation | — |

One commit per phase (phases with multiple fixes can combine if they share the same file). Minimum 10 commits.

---

## PROOF GATES — HARD

| # | Gate | How to Verify |
|---|------|---------------|
| 1 | `npm run build` exits 0 | Paste exit code |
| 2 | `tsc --noEmit` exits 0 (committed code, git stash) | Paste output |
| 3 | `npm run lint` exits 0 (committed code, git stash) | Paste output |
| 4 | Calculate page: no "No results" message after successful calculation | Describe the code path that prevents it |
| 5 | Calculate page: period change clears stale results | Paste the state reset code |
| 6 | Calculate page: entity count shows post-gate numbers | Paste the code reading batch exclusion data |
| 7 | Plan cards: `grep -n "variant" calculate/page.tsx` shows grouping by rule_set, not iteration over variants | Paste grep |
| 8 | Import history: query targets correct table with tenant filter | Paste the query code |
| 9 | Auth cookie: `grep -n "maxAge\|max_age" web/src/` returns 0 matches (excluding node_modules) | Paste grep |
| 10 | Korean Test: no domain vocabulary added | PASS by default — UI text changes only |
| 11 | One commit per phase | `git log --oneline -12` |

## PROOF GATES — SOFT

| # | Gate |
|---|------|
| 1 | No modifications to calculation engine (run/route.ts) |
| 2 | No modifications to convergence service |
| 3 | No modifications to intent executor or transformer |
| 4 | No modifications to SCI classification agents |
| 5 | BCL/Meridian unaffected |

---

## WHAT NOT TO DO

1. **DO NOT modify calculation logic.** This is a UI-only HF.
2. **DO NOT modify SCI classification.** OB-195 just handled that.
3. **DO NOT add console.log inside loops.** Rule 20.
4. **DO NOT redesign the Calculate or Reconciliation pages.** Fix the bugs, don't rebuild the UX. DS-level redesigns are separate items (S-NEW-10, S-NEW-13).
5. **DO NOT fix the reconciliation "100% match" or "Mark Official" UX.** Those require a Design Specification (S-NEW-10). This HF fixes the period filter bug (Fix 12), not the match rate calculation.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-182_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE.

---

## POST-MERGE PRODUCTION VERIFICATION (Andrew)

After merging PR and Vercel deploys:

1. **Calculate page:** Select CRP Plan 1, January 1-15. Click Calculate. Results should appear immediately — no "No results" message.
2. **Period switch:** Switch to January 16-31. Previous period's amounts should clear. Either show Jan 16-31 results (if calculated) or show empty state.
3. **Entity count:** After calculation, should show "24 calculated, 8 excluded" not "32 entities."
4. **Plan cards:** Calculate page should show 4 plan cards, not 5.
5. **Import history:** Navigate to Import. Should show previous import events.
6. **Import confirmation:** Import any file. Confirmation should show correct file/plan name.
7. **Multi-file:** Select 2+ files for upload. Both should process.
8. **Auth:** Close browser completely. Reopen. Should require re-login.
9. **Reconciliation:** Reconcile Plan 2 against GT. Should pull Plan 2 data, not Plan 1.

---

## PR CREATION

```bash
cd ~/spm-platform
gh pr create --base main --head dev \
  --title "HF-182: Comprehensive UX bug sweep (12 fixes)" \
  --body "Fixes 12 accumulated UX bugs in one pass:

  1. Calculate page shows results after calculation (was showing 'No results')
  2. Calculate page clears stale data on period change
  3. Entity count reflects variant gate exclusions
  4. Calculate action buttons properly styled
  5. Period dropdown refreshes after creation
  6. Import confirmation shows correct plan name
  7. Multi-variant plans render as one card
  8. Plan count reflects rule_sets not variants
  9. Import history displays events
  10. Multi-file upload processes all files
  11. Auth cookie session-scoped (remove maxAge)
  12. Reconciliation filters by plan, not just period

  Zero engine changes. Zero calculation logic changes. UI only."
```

---

*"The engine is right. The UX must match. Twelve bugs, one pass, one merge."*
