# OB-173B: EXPERIENCE ARCHITECTURE — COMPLETION
## Continuation: Findings Unaddressed by OB-173 (PR #254)

**Date:** March 16, 2026
**Type:** Objective Build (Continuation)
**Sequence:** OB-173B (continuation of OB-173)
**Predecessor:** OB-173 (PR #254) addressed 9 of 27 findings. This OB addresses the remaining scope.
**Governing Specifications:** DS-013, DS-015
**Standing Rules:** CC_STANDING_ARCHITECTURE_RULES.md v3.0 — read in entirety before proceeding.

---

## STANDING RULES ACTIVE

All rules from CC_STANDING_ARCHITECTURE_RULES.md v3.0 apply. Read that file first.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## WHAT OB-173 DELIVERED (PR #254)

- SCI voice: institutional tone (3 findings)
- Calculate: lifecycle status badge + action button (3 findings)
- Stream: lifecycle stepper descriptions (1 finding)
- Persistent: currency formatting + tenant-config 403 (2 findings)

**Total: 9 of 27 scoped findings.**

---

## PHASE B2: CALCULATE — COMPONENT BREAKDOWN + PERIOD COMPARISON

### Findings Addressed

| Finding | Description | Sev |
|---|---|---|
| CLT173-F08 | No component breakdown visible on Calculate page | P1 |
| CLT173-F09 | No prior-period comparison on Calculate page | P1 |
| CLT85-F57 | Components column empty on Calculate page | P1 |
| CLT85-F59 | Period ribbon nearly unreadable | P1 |

### Mission B2.1: Component breakdown on result card
After calculation completes, show component breakdown on the plan result card.
- Query `calculation_results` for the completed batch
- Group by component: sum per component
- Display component name and amount for each (use names from plan, not generic C1/C2/C3/C4)
- Compact layout: inline or two-column, within the existing card
- Component amounts must sum to the displayed grand total

### Mission B2.2: Period comparison on result card
- After calculation, query prior period's total from `calculation_batches` or `entity_period_outcomes`
- Display: "vs. $46,291 last month (+34%)" or "First calculation — no prior period"
- Green for increase, red for decrease, neutral for first period
- Percentage = (current - prior) / prior × 100, rounded to 1 decimal

### Mission B2.3: Period selector readability
- Increase font size and contrast on period selector/ribbon
- Selected period: bold, high contrast, clear visual weight
- Available periods: readable but secondary weight

### Hard Proof Gates — Phase B2

| # | Criterion | How to verify |
|---|-----------|---------------|
| HG-B2-1 | Component breakdown visible after calculation with component names and amounts | Screenshot or DOM paste of result card after calculating December 2025 |
| HG-B2-2 | Component amounts sum to grand total ($61,986 for December) | Paste the component values and their sum |
| HG-B2-3 | Period comparison shown with percentage change | Paste the comparison text rendered on screen |
| HG-B2-4 | Period selector text is readable (larger, higher contrast than before) | Paste font-size and color values from computed styles |

### Commit
After Phase B2 is verified on localhost: `git add -A && git commit -m "OB-173B Phase B2: Component breakdown and period comparison on Calculate"`

---

## PHASE C2: STREAM — CARD DIFFERENTIATION + TRAJECTORY + SIDEBAR + DEDUP

### Findings Addressed

| Finding | Description | Sev |
|---|---|---|
| CLT173-F11 | Mixed affordance types on /stream (status/info/action identical) | P1 |
| CLT173-F12 | Duplicate "Start Reconciliation" action | P1 |
| CLT173-F13 | Trajectory velocity lacks reference frame | P1 |
| CLT173-F14 | /stream not accessible from sidebar | P1 |

### Mission C2.1: Card visual differentiation
Establish three visual tiers on /stream. The specific styling is your architecture decision, but the three tiers must be distinguishable at a glance:

**Status cards** (System Health, CRL tier, Lifecycle position):
- Subtle/muted — border only, or very light fill, no primary action button, compact

**Information cards** (Trajectory Intelligence, Population Distribution, Pipeline Readiness):
- Standard card — visible border, light fill, data-focused, secondary actions only

**Action cards** (periods needing data, reconciliation needed, approval pending):
- Accent treatment — colored left border, or accent fill, prominent primary action button

### Mission C2.2: Remove duplicate "Start Reconciliation"
Remove from System Health card. Keep in Lifecycle card where stepper provides context. System Health card shows reconciliation STATUS ("Not reconciled" / "Reconciled") but does not duplicate the action.

### Mission C2.3: Trajectory reference frame
Current display: `+$8,698/period / Accelerating / Projected: $70,684`

Add: percentage growth rate AND period range context:
```
+$8,698/period (19.5% avg growth)
Accelerating — from $44,590 to $61,986 over 3 periods
Projected next period: $70,684
```

### Mission C2.4: Add /stream to sidebar navigation
- Add /stream as top-level sidebar item, positioned ABOVE Operate and Perform
- Label: "Intelligence" (domain-agnostic)
- This enforces Decision 128 (Intelligence Stream as canonical landing)

### Hard Proof Gates — Phase C2

| # | Criterion | How to verify |
|---|-----------|---------------|
| HG-C2-1 | Three card tiers are visually distinguishable on /stream | Paste CSS class names or computed styles showing different treatment for each tier |
| HG-C2-2 | "Start Reconciliation" appears in exactly one location (Lifecycle card) | Grep for "Start Reconciliation" or "Reconciliation" button across /stream components — paste results |
| HG-C2-3 | Trajectory shows percentage growth rate | Paste rendered trajectory text from DOM |
| HG-C2-4 | Trajectory shows period range ("from $X to $Y over N periods") | Paste rendered trajectory text from DOM |
| HG-C2-5 | /stream appears in sidebar navigation | Paste sidebar config showing /stream entry |
| HG-C2-6 | Clicking sidebar /stream link navigates to /stream page | Verify on localhost — paste URL bar after click |

### Commit
After Phase C2 is verified on localhost: `git add -A && git commit -m "OB-173B Phase C2: Card differentiation, trajectory reference, sidebar navigation, dedup reconciliation"`

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-173B_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### Completion Report Structure (Rule 26 — MANDATORY)

```markdown
# OB-173B COMPLETION REPORT
## Date: [date]
## Execution Time: [start] to [end]

## COMMITS (in order)
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
|---|---|---|---|
| HG-B2-1 | Component breakdown visible after calculation with component names and amounts | | [paste DOM or screenshot path] |
| HG-B2-2 | Component amounts sum to grand total ($61,986 for December) | | [paste values and sum] |
| HG-B2-3 | Period comparison shown with percentage change | | [paste rendered text] |
| HG-B2-4 | Period selector text is readable | | [paste computed styles] |
| HG-C2-1 | Three card tiers visually distinguishable | | [paste CSS classes or styles] |
| HG-C2-2 | "Start Reconciliation" in exactly one location | | [paste grep results] |
| HG-C2-3 | Trajectory shows percentage growth rate | | [paste DOM text] |
| HG-C2-4 | Trajectory shows period range | | [paste DOM text] |
| HG-C2-5 | /stream in sidebar navigation | | [paste sidebar config] |
| HG-C2-6 | Sidebar link navigates to /stream | | [paste URL after click] |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS/FAIL — ___ commits for 2 phases
- Rule 2 (cache clear after commit): PASS/FAIL
- Rule 6 (report in project root): PASS — this file exists
- Rule 25 (report BEFORE final build): PASS/FAIL
- Rule 26 (mandatory structure): PASS — this structure
- Rule 27 (evidence = paste): PASS/FAIL
- Rule 28 (one commit per phase): PASS/FAIL

## KNOWN ISSUES
- [anything that didn't work, partial implementations, deferred items]

## BUILD OUTPUT
[paste last 10 lines of npm run build]
```

### Workflow (Rule 25 — REPORT IS FIRST DELIVERABLE, NOT LAST)
1. Execute Phase B2
2. Commit Phase B2
3. Execute Phase C2
4. Commit Phase C2
5. **CREATE `OB-173B_COMPLETION_REPORT.md` in project root with all evidence**
6. `git add -A && git commit -m "OB-173B: Completion report"`
7. Kill dev server → `rm -rf .next` → `npm run build`
8. **APPEND build output to completion report**
9. `git add -A && git commit -m "OB-173B: Build verification appended to completion report"`
10. `git push origin dev`
11. `gh pr create --base main --head dev --title "OB-173B: Experience Architecture Completion" --body "Component breakdown on Calculate, card differentiation on /stream, trajectory reference frame, sidebar navigation. Completion report: OB-173B_COMPLETION_REPORT.md"`

**The PR body REFERENCES the completion report file. If the file doesn't exist, the PR is invalid.**

---

## BROWSER TEST (Andrew — after merge)

**Calculate:** /operate/calculate → December 2025 → Calculate. Expected:
1. Component breakdown visible with names and amounts
2. Components sum to $61,986
3. "vs. $46,291 (+34%)" comparison shown
4. Period selector readable

**Stream:** /stream. Expected:
1. Three card tiers visually different
2. "Start Reconciliation" in one location only
3. Trajectory: percentage + period range
4. "Intelligence" in sidebar → click → /stream

---

*"The completion report is the first deliverable, not the last."*
