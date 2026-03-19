# DIAG-006: CALCULATE PAGE CRASH — REACT ERROR #185
## Diagnostic Only — No Code Changes Until Root Cause Evidenced

**Date:** March 17, 2026
**Type:** Diagnostic
**Sequence:** DIAG-006
**Predecessor:** HF-142 (multi-file commit fix), OB-174 (async pipeline)
**Standing Rules:** CC_STANDING_ARCHITECTURE_RULES.md v3.0 — read in entirety before proceeding.

---

## STANDING RULES ACTIVE

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## THE PROBLEM

The Calculate page (/operate/calculate) crashes on render with React Minified Error #185 (repeated 4 times in console). The user sees "Something went wrong. An error occurred while loading this page. Please try again." Clicking "Try Again" crashes again.

**Context:**
- BCL tenant has 6 months of data correctly imported (510 rows, 6 distinct source_dates, verified by SQL)
- The import pipeline works end-to-end (OB-174 async + HF-142 commit fix)
- The crash occurs on page RENDER, not during calculation
- This is the same crash pattern observed previously with this tenant
- The page was working earlier in this session (October, November, December, January all calculated successfully through this page)

**What changed between "page worked" and "page crashes":**
- OB-173 (PR #254): SCI voice, lifecycle badge, currency formatting
- OB-173B (PR #256): Component breakdown, card differentiation, trajectory, sidebar
- OB-174 (PR #260): Async pipeline, structural fingerprinting, processing_jobs table
- HF-142 (PR #262): Content unit identity fix

The crash may be caused by any of these PRs introducing a rendering bug in the Calculate page components.

---

## DIAGNOSTIC PROTOCOL

**DO NOT WRITE ANY CODE. DO NOT MODIFY ANY DATA.**

---

## PHASE 1: IDENTIFY THE ACTUAL ERROR

React error #185 is minified. We need the actual error message and stack trace.

### Mission 1.1: Get the unminified error
- Visit https://react.dev/errors/185 — what does this error code mean?
- Check Vercel deployment logs for any server-side rendering errors on /operate/calculate
- Check if the error is in a Server Component or Client Component

### Mission 1.2: Check the Calculate page component for recent changes
- Open the Calculate page: `web/src/app/operate/calculate/page.tsx` (or equivalent path with tenant slug)
- **PASTE the full component code** — especially any data fetching, state initialization, and render logic
- Identify what was changed by OB-173B (component breakdown, period comparison, period selector)

### Mission 1.3: Check PlanCard component for recent changes
- OB-173B added component breakdown and period comparison to PlanCard.tsx
- **PASTE the PlanCard component code** — especially the new sections added by OB-173B
- Look for: null/undefined access, missing optional chaining, array operations on non-arrays, rendering non-renderable values

### Mission 1.4: Check for data shape assumptions
The Calculate page was tested with data imported through the OLD synchronous pipeline. OB-174 changed the import pipeline to async with processing_jobs. Check:
- Does the Calculate page query import_batches or processing_jobs?
- Does it assume a specific batch structure that OB-174 changed?
- Does the component breakdown code assume calculation_results exist before any calculation has been run?
- **PASTE any data fetching queries on the Calculate page.**

### Mission 1.5: Check for period/batch selector assumptions
With 6 periods of data (vs. the previous 3-4), check:
- Does the period selector handle 6+ periods?
- Does any component assume a maximum number of periods or batches?
- Is there an Array.map on a potentially null/undefined value?

---

## PHASE 2: SERVER-SIDE VERIFICATION

### Mission 2.1: Test the Calculate API directly
Can the calculation API be called without the UI? Check:
```
curl -X POST https://vialuce.ai/api/calculate \
  -H "Content-Type: application/json" \
  -H "Cookie: [auth cookie]" \
  -d '{"tenantId":"b1c2d3e4-aaaa-bbbb-cccc-111111111111","periodId":"[oct period id]","ruleSetId":"f270f34c-d49e-42e6-a82b-eb7535e736d9"}'
```
If the API works but the page crashes, the bug is purely in the React rendering layer.

### Mission 2.2: Check Vercel function logs
Look for any server-side errors in the Vercel dashboard for the /operate/calculate route. Paste any error logs.

---

## PHASE 3: ISOLATION

### Mission 3.1: Determine which PR introduced the crash
The Calculate page worked earlier in this session (calculated Oct, Nov, Dec, Jan successfully). The PRs merged since then:
- PR #254 (OB-173): SCI voice + lifecycle badge
- PR #256 (OB-173B): Component breakdown + period comparison + card differentiation
- PR #258 (HF-140): Multi-file upload isolation
- PR #259 (HF-141): Third-file source_date
- PR #260 (OB-174): Async pipeline + fingerprinting
- PR #261 (DIAG-005): Read-only diagnostic
- PR #262 (HF-142): Content unit identity

**Which of these modified the Calculate page or PlanCard?**
- OB-173B (PR #256) modified PlanCard.tsx (component breakdown, period comparison)
- OB-174 (PR #260) may have modified the calculate page
- **List every file in the calculate page directory and when it was last modified.**

### Mission 3.2: Test with minimal data
Can the page render with NO calculation results (fresh state)?
Can it render with only 1 period of data?
The crash may be specific to the 6-period state if any component assumes a maximum.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `DIAG-006_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE any final steps
- Contains ALL code pastes and findings verbatim
- Committed to git as part of the diagnostic
- If this file does not exist at diagnostic end, the diagnostic is considered INCOMPLETE.

### Completion Report Structure

```markdown
# DIAG-006 COMPLETION REPORT
## Date: [date]

## PHASE 1: ERROR IDENTIFICATION
### Mission 1.1 — React error #185 meaning:
[paste from react.dev/errors/185]

### Mission 1.2 — Calculate page component:
[paste full component code]
[identify recent changes]

### Mission 1.3 — PlanCard component:
[paste full component code]
[identify OB-173B additions]

### Mission 1.4 — Data shape assumptions:
[paste data fetching code]
[identify any OB-174 incompatibility]

### Mission 1.5 — Period/batch selector:
[paste relevant code]
[identify any array/null issues]

## PHASE 2: SERVER-SIDE
### Mission 2.1 — API test result:
[paste curl output or API response]

### Mission 2.2 — Vercel logs:
[paste any server errors]

## PHASE 3: ISOLATION
### Mission 3.1 — Which PR modified Calculate:
[list files and modification dates]

### Mission 3.2 — Minimal data test:
[results]

## ROOT CAUSE
[exact file, exact line, exact error — with pasted evidence]

## RECOMMENDED FIX
[describe — do NOT implement]
```

### Workflow
1. Execute Phases 1-3
2. **CREATE `DIAG-006_COMPLETION_REPORT.md` in project root**
3. `git add -A && git commit -m "DIAG-006: Calculate page crash diagnostic"`
4. `git push origin dev`
5. `gh pr create --base main --head dev --title "DIAG-006: Calculate page React #185 crash" --body "Diagnostic: Calculate page crashes on render after 6-file import. Completion report: DIAG-006_COMPLETION_REPORT.md"`

---

## CONSTRAINTS

- **NO CODE CHANGES.**
- **NO DATA MODIFICATIONS.**
- **NO SPECULATIVE FIXES.**
- **PASTE ALL CODE AND ERROR OUTPUT.**

---

*The data is correct. The import pipeline works. The page that displays it crashes. This is a rendering bug, not a data bug (FP-77).*
