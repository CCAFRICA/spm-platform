# HF-159: normalizeCalculationMethod — Pass Through New Primitive Types

## Date: March 22, 2026
## Type: HF (Hot Fix)
## Severity: P0 — Root cause of 5 failed fix attempts

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

---

## ROOT CAUSE — FOUND BY READING THE ACTUAL CODE

Five fix attempts (OB-182, HF-155, HF-156, HF-158, DIAG-013, DIAG-014) failed because they all examined `normalizeComponentType` or `convertComponent`. The actual destroyer is a DIFFERENT function: `normalizeCalculationMethod`.

### The Chain

```
AI returns: { type: "scalar_multiply", calculationMethod: {...}, calculationIntent: {...} }

Step 1: normalizeComponentType("scalar_multiply")
  → "scalar_multiply" ✅ (HF-156 fixed this)

Step 2: normalizeCalculationMethod("scalar_multiply", {...})
  → switch statement has NO case for "scalar_multiply"
  → falls to DEFAULT
  → returns { type: "tiered_lookup", metric: "metric", tiers: [] }  ❌ DESTROYS THE TYPE

Step 3: comp.calculationMethod is now { type: "tiered_lookup", tiers: [] }

Step 4: convertComponent reads calcMethod.type = "tiered_lookup" (defined, not null)
  → HF-158 fallback to calculationIntent.operation NEVER triggers
  → routes to tiered_lookup case → 0 tiers → $0 for all entities
```

### The Function (from the actual code)

```typescript
private normalizeCalculationMethod(type: unknown, method: unknown): ComponentCalculation {
    const typeStr = this.normalizeComponentType(type);
    const m = (method || {}) as Record<string, unknown>;

    switch (typeStr) {
      case 'matrix_lookup': { ... }
      case 'tiered_lookup': { ... }
      case 'percentage':
      case 'flat_percentage': { ... }
      case 'conditional_percentage': { ... }
      default:
        return {
          type: 'tiered_lookup',    // ← DESTROYS the type
          metric: 'metric',
          tiers: [],                 // ← EMPTY TIERS = $0
        };
    }
}
```

No cases for: linear_function, piecewise_linear, scope_aggregate, scalar_multiply, conditional_gate.

---

## THE FIX

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Function:** `normalizeCalculationMethod`
**Location:** The switch statement, BEFORE the default case

**Add these cases:**

```typescript
      case 'linear_function':
      case 'piecewise_linear':
      case 'scope_aggregate':
      case 'scalar_multiply':
      case 'conditional_gate':
        return { type: typeStr, ...m } as GenericCalculation;
```

This passes through the calculation method data unchanged for new primitive types. The `GenericCalculation` type (already defined in this file by HF-156) accepts these types. The spread `...m` preserves whatever the AI put in the calculation method (rate, slope, segments, conditions, etc.).

**This is the ONLY change. One switch addition. One function. One file.**

---

## STANDING RULES

- **Rule 1:** Commit + push after every change
- **Rule 2:** Kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
- **Rule 25-28:** Completion report enforcement
- **Rule 27:** Evidence = paste code. NOT "this was implemented."

---

## PHASE 1: MAKE THE CHANGE

1. Open `web/src/lib/compensation/ai-plan-interpreter.ts`
2. Find the `normalizeCalculationMethod` function
3. Find its switch statement
4. BEFORE the `default:` case, add:

```typescript
      case 'linear_function':
      case 'piecewise_linear':
      case 'scope_aggregate':
      case 'scalar_multiply':
      case 'conditional_gate':
        return { type: typeStr, ...m } as GenericCalculation;
```

5. Save

**Commit: "HF-159: normalizeCalculationMethod passes through new primitive types"**

---

## PHASE 2: BUILD + LOCALHOST VERIFICATION

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. `npm run dev` — confirm localhost:3000
5. Delete CRP rule_sets:
```sql
DELETE FROM rule_sets WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
```
6. Upload CRP_Plan_1_Capital_Equipment.pdf through localhost browser
7. Check terminal output for the convertComponent log line

**Expected output:**
```
[convertComponent] "Equipment Commission - Senior Rep" calcType="scalar_multiply" (from calcMethod.type="scalar_multiply", calculationIntent.operation="scalar_multiply")
```

**NOT expected:**
```
[convertComponent] "Equipment Commission - Senior Rep" calcType="tiered_lookup"
```

8. Query localhost database:
```sql
SELECT name, components::text FROM rule_sets
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
ORDER BY created_at DESC LIMIT 1;
```

Components must show componentType that is NOT "tier_lookup".

**Commit: "HF-159: Localhost verification — Plan 1 produces correct calcType"**

---

## PR CREATION

```bash
gh pr create --base main --head dev --title "HF-159: normalizeCalculationMethod — pass through new primitives" --body "Root cause of 5 failed fix attempts. normalizeCalculationMethod switch had no cases for linear_function, piecewise_linear, scope_aggregate, scalar_multiply, conditional_gate. Default case overwrote type to tiered_lookup with empty tiers. Fix: add pass-through cases that preserve the AI's calculation method data. Verified on localhost: Plan 1 now produces calcType=scalar_multiply instead of tiered_lookup."
```

---

## PROOF GATES — HARD

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| PG-01 | normalizeCalculationMethod switch has cases for new types | Paste the updated switch showing the new cases with 5 lines above and below |
| PG-02 | npm run build exits 0 | Paste exit code |
| PG-03 | Localhost: Plan 1 import produces calcType that is NOT tiered_lookup | Paste the terminal convertComponent log line |
| PG-04 | Localhost: rule_set.components shows componentType NOT tier_lookup | Paste DB query result |

**PG-03 and PG-04 are MANDATORY. This is the sixth fix attempt. Localhost verification is non-negotiable.**

---

## COMPLETION REPORT ENFORCEMENT

File: `HF-159_COMPLETION_REPORT.md` in PROJECT ROOT.
ALL 4 proof gates must be PASS with pasted evidence.
PG-03 and PG-04 require LOCALHOST test with actual Plan 1 PDF import.
If PG-03 still shows "tiered_lookup", the HF is FAILED.
