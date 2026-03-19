# HF-143: CALCULATE PAGE INFINITE RENDER LOOP — useMemo FIX
## Single Issue: Unstable activePlans Reference Causes React Error #185

**Date:** March 17, 2026
**Type:** Hot Fix
**Sequence:** HF-143
**Predecessor:** DIAG-006 (PR #263) — root cause confirmed: activePlans creates new array ref every render
**Standing Rules:** CC_STANDING_ARCHITECTURE_RULES.md v3.0 — read in entirety before proceeding.

---

## STANDING RULES ACTIVE

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase.

---

## THE FIX

**File:** `web/src/app/operate/calculate/page.tsx`

**Line 71 — BEFORE (unstable):**
```tsx
const activePlans = plans.filter(p => p.status === 'active');
```

**AFTER (stable):**
```tsx
const activePlans = useMemo(() => plans.filter(p => p.status === 'active'), [plans]);
```

Ensure `useMemo` is imported from React at the top of the file.

**That is the entire fix.** Do not change anything else in this file. Do not refactor the useEffect. Do not change PlanCard. One line.

---

## PHASE 1: IMPLEMENT

1. Add `useMemo` to the React import if not already present
2. Change line 71 from `const activePlans = plans.filter(...)` to `const activePlans = useMemo(() => plans.filter(...), [plans])`
3. No other changes

### Commit
`git add -A && git commit -m "HF-143: useMemo for activePlans — fixes infinite render loop (React #185)"`

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-143_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Committed to git as part of the batch

### Completion Report Structure

```markdown
# HF-143 COMPLETION REPORT
## Date: [date]

## COMMITS
| Hash | Description |

## FILES MODIFIED
| File | Change |

## PROOF GATES
| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| HG-1 | activePlans wrapped in useMemo | | [paste the changed line] |
| HG-2 | useMemo imported from React | | [paste import line] |
| HG-3 | npm run build: zero errors | | [paste last 5 lines] |

## BUILD OUTPUT
[paste last 10 lines]
```

### Workflow
1. Implement fix
2. **CREATE `HF-143_COMPLETION_REPORT.md`**
3. `git add -A && git commit -m "HF-143: Completion report"`
4. `rm -rf .next && npm run build`
5. **APPEND build output**
6. `git add -A && git commit -m "HF-143: Build verification"`
7. `git push origin dev`
8. `gh pr create --base main --head dev --title "HF-143: Fix Calculate page infinite render loop" --body "useMemo for activePlans — fixes React #185 infinite re-render. DIAG-006 root cause. Completion report: HF-143_COMPLETION_REPORT.md"`

---

## BROWSER TEST (Andrew)

Navigate to /operate/calculate.
**Expected:** Page renders without crash. Period selector visible. Plan card visible. No React errors in console.

Then: Calculate October 2025. Andrew verifies against GT.

---

*One line. One fix. One browser test.*
