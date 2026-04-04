# HF-158: Plan Converter — Line 552 calcType Fallback

## Date: March 22, 2026
## Type: HF (Hot Fix)
## Severity: P0 — Root cause of all plan interpretation failures

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

---

## THE FIX

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Line:** 552

**Current (broken):**
```typescript
const calcType = calcMethod?.type || 'tiered_lookup';
```

**Replace with:**
```typescript
const calcType = calcMethod?.type || (base.calculationIntent?.operation as string) || 'tiered_lookup';
```

**Why:** The AI produces `calculationIntent` with the correct operation type but does NOT produce `calculationMethod`. Line 552 reads `calculationMethod.type` which is undefined, so it always defaults to `'tiered_lookup'`. The fix checks `calculationIntent.operation` as fallback before defaulting.

**This is the ONLY change in this HF. One line. One file.**

---

## STANDING RULES

- **Rule 1:** Commit + push after every change
- **Rule 2:** Kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
- **Rule 25-28:** Completion report enforcement

---

## PHASE 1: MAKE THE CHANGE

1. Open `web/src/lib/compensation/ai-plan-interpreter.ts`
2. Find line 552 (or nearby — search for `calcMethod?.type || 'tiered_lookup'`)
3. Replace with: `calcMethod?.type || (base.calculationIntent?.operation as string) || 'tiered_lookup'`
4. Save

**Commit: "HF-158: calcType reads calculationIntent.operation as fallback (line 552)"**

---

## PHASE 2: BUILD VERIFICATION

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. `npm run dev` — confirm localhost:3000

**Commit: "HF-158: Build verification"**

---

## PHASE 3: VERIFICATION — DELETE CRP PLANS AND REIMPORT

1. Delete existing CRP rule_sets:
```sql
DELETE FROM rule_sets WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
```

2. On localhost, log in as VL Admin, navigate to CRP tenant, go to /operate/import
3. Upload CRP_Plan_1_Capital_Equipment.pdf
4. Confirm and import
5. Check the terminal/console output for the convertComponent log line

**Expected:**
```
[convertComponent] "Equipment Commission - Senior Rep" calcType="scalar_multiply" (from calcMethod.type=undefined, calculationIntent.operation="scalar_multiply")
```

**NOT expected:**
```
[convertComponent] "Equipment Commission - Senior Rep" calcType="tiered_lookup"
```

6. Query the database:
```sql
SELECT name, components::text FROM rule_sets 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
ORDER BY created_at DESC LIMIT 1;
```

The components JSONB must show `componentType` that is NOT `tier_lookup`.

**Commit: "HF-158: Verification — Plan 1 reimport produces correct calcType"**

---

## PR CREATION

```bash
gh pr create --base main --head dev --title "HF-158: Line 552 calcType fallback to calculationIntent.operation" --body "One-line fix. calcType now reads calculationIntent.operation when calculationMethod.type is undefined. Root cause identified by DIAG-014: AI produces calculationIntent but not calculationMethod, so calcType always defaulted to tiered_lookup. Verified with Plan 1 reimport on localhost."
```

---

## PROOF GATES — HARD

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| PG-01 | Line 552 changed to include calculationIntent.operation fallback | Paste the changed line with surrounding context (3 lines above and below) |
| PG-02 | npm run build exits 0 | Paste exit code |
| PG-03 | Plan 1 reimport on localhost: calcType is NOT tiered_lookup | Paste the convertComponent log line from terminal |
| PG-04 | rule_set.components shows componentType is NOT tier_lookup | Paste DB query result |

---

## COMPLETION REPORT ENFORCEMENT

File: `HF-158_COMPLETION_REPORT.md` in PROJECT ROOT.
ALL 4 proof gates must be PASS with pasted evidence.
PG-03 and PG-04 require LOCALHOST verification — CC must actually reimport the plan and check.
