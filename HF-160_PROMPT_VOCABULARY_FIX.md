# HF-160: Plan Interpretation — Expand AI Prompt Vocabulary + Priority Inversion

## Date: March 22, 2026
## Type: HF (Hot Fix)
## Severity: P0 — Root cause of 6 failed fix attempts, found by reading actual source code

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

---

## ROOT CAUSE (100% certainty — verified from actual source code)

The AI prompt in `anthropic-adapter.ts` constrains the component type vocabulary to 5 types:

```
"type": "matrix_lookup | tiered_lookup | percentage | flat_percentage | conditional_percentage"
```

The AI obeys this constraint. When it encounters a linear formula (rate × revenue + base draw), it returns `type="tiered_lookup"` because that's the closest match in its allowed vocabulary. It simultaneously returns `calculationIntent.operation="scalar_multiply"` which is correct — but nothing reads it with priority.

**The AI is producing the RIGHT answer in the WRONG field** because the prompt constrains the right field.

Six previous fix attempts (HF-155, HF-156, HF-158, HF-159, OB-182, DIAG-013/014) all missed this because they examined downstream code, not the prompt.

---

## THREE CHANGES — EXACT CODE PROVIDED

CC must make EXACTLY these changes. No interpretation. No additional changes. No refactoring.

---

## CHANGE 1: System Prompt — Add New Types

**File:** `web/src/lib/ai/providers/anthropic-adapter.ts`
**Location:** `SYSTEM_PROMPTS.plan_interpretation` string
**Where:** After the CONDITIONAL PERCENTAGE example block (the one ending with `"conditions": [...]`) and BEFORE the line `NUMERIC PARSING RULES:`

**Add this text block:**

```
LINEAR FUNCTION (continuous formula: y = slope × input + intercept):
- For commissions calculated as rate × revenue + base draw, or any linear formula
- Extract slope (commission rate as decimal), intercept (base/fixed amount), and input metric
- Use when the plan describes: "X% of revenue plus $Y base", "commission rate times sales plus guaranteed draw"
- Example:
  {
    "type": "linear_function",
    "calculationMethod": {
      "type": "linear_function",
      "slope": 0.06,
      "intercept": 200,
      "inputMetric": "period_equipment_revenue",
      "inputMetricLabel": "Equipment Revenue"
    }
  }

PIECEWISE LINEAR (accelerator curve: rate changes at attainment breakpoints):
- For commissions where the rate INCREASES as attainment exceeds quota thresholds
- The rate applies to the ENTIRE base amount (not marginal/incremental)
- Extract ratio metric (attainment = actual/quota), base metric (revenue), and segments with rate per range
- Use when the plan describes: "3% below quota, 5% at quota, 8% above 120%"
- Example:
  {
    "type": "piecewise_linear",
    "calculationMethod": {
      "type": "piecewise_linear",
      "ratioMetric": "quota_attainment",
      "ratioMetricLabel": "Quota Attainment",
      "baseMetric": "consumable_revenue",
      "baseMetricLabel": "Consumable Revenue",
      "segments": [
        { "min": 0, "max": 1.0, "rate": 0.03, "label": "Below Quota" },
        { "min": 1.0, "max": 1.2, "rate": 0.05, "label": "At/Above Quota" },
        { "min": 1.2, "max": null, "rate": 0.08, "label": "Super Accelerator" }
      ]
    }
  }

SCOPE AGGREGATE (management override on team/district/region totals):
- For managers who earn a percentage of their team's aggregate metric
- Extract scope level (district, region, team), metric to aggregate, and override rate
- Use when the plan describes: "1.5% of district total equipment revenue"
- Example:
  {
    "type": "scope_aggregate",
    "calculationMethod": {
      "type": "scope_aggregate",
      "scope": "district",
      "metric": "equipment_revenue",
      "metricLabel": "District Equipment Revenue",
      "rate": 0.015
    }
  }

SCALAR MULTIPLY (simple rate × base amount, no tiers or conditions):
- For flat commission percentages without tiers, thresholds, or conditions
- Simpler than flat_percentage — use when there is just rate × amount
- Example:
  {
    "type": "scalar_multiply",
    "calculationMethod": {
      "type": "scalar_multiply",
      "metric": "sales_amount",
      "metricLabel": "Sales Amount",
      "rate": 0.04
    }
  }

CONDITIONAL GATE (eligibility gate that depends on meeting a prerequisite):
- For bonuses that require meeting a condition before any payout
- Use when the plan describes: "must have at least 1 equipment sale to earn cross-sell bonus"
- Extract the condition, payout per unit if met, zero if not
- Example:
  {
    "type": "conditional_gate",
    "calculationMethod": {
      "type": "conditional_gate",
      "conditionMetric": "equipment_deal_count",
      "conditionOperator": ">=",
      "conditionThreshold": 1,
      "payoutPerUnit": 50,
      "payoutMetric": "cross_sell_count",
      "payoutMetricLabel": "Cross-Sell Transactions"
    }
  }
```

**Also:** In the same system prompt, find the calculationIntent MAPPING RULES section (the part that says `MAPPING RULES:` followed by tiered_lookup → bounded_lookup_1d, etc.). Add these lines:

```
- linear_function → linear_function with slope, intercept, and metric input source
- piecewise_linear → piecewise_linear with ratioInput, baseInput, and segments array
- scope_aggregate → scope_aggregate with scope, field, and aggregation source
- scalar_multiply → scalar_multiply with metric input and rate
- conditional_gate → conditional_gate with condition, onTrue operation, onFalse operation
```

### Proof Gate
```
PG-01: System prompt contains "linear_function" as a component type
  Evidence: grep -n "linear_function" web/src/lib/ai/providers/anthropic-adapter.ts | head -10
  Paste output.

PG-02: System prompt contains calculationMethod example for linear_function
  Evidence: grep -A5 '"type": "linear_function"' web/src/lib/ai/providers/anthropic-adapter.ts | head -10
  Paste output.
```

**Commit: "HF-160 Change 1: System prompt — expanded type vocabulary with examples"**

---

## CHANGE 2: User Prompt — Expand Type Enum

**File:** `web/src/lib/ai/providers/anthropic-adapter.ts`
**Location:** `buildUserPrompt` method, `case 'plan_interpretation':` block
**Where:** Find this exact string in the user prompt template:

```
"type": "matrix_lookup | tiered_lookup | percentage | flat_percentage | conditional_percentage",
```

**Replace with:**

```
"type": "matrix_lookup | tiered_lookup | percentage | flat_percentage | conditional_percentage | linear_function | piecewise_linear | scope_aggregate | scalar_multiply | conditional_gate",
```

**There may be TWO occurrences** of this type enum in the user prompt — find and replace ALL of them.

### Proof Gate
```
PG-03: User prompt contains expanded type enum with linear_function
  Evidence: grep -n "linear_function" web/src/lib/ai/providers/anthropic-adapter.ts
  Must show occurrences in BOTH the system prompt AND the user prompt sections.
  Paste output.
```

**Commit: "HF-160 Change 2: User prompt — expanded type enum"**

---

## CHANGE 3: convertComponent Priority Inversion

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Location:** `convertComponent` function, the `calcType` assignment (approximately line 552)

**Find this exact line:**

```typescript
  const calcType = calcMethod?.type || (base.calculationIntent?.operation as string) || 'tiered_lookup';
```

**Replace with:**

```typescript
  const calcType = (base.calculationIntent?.operation as string) || calcMethod?.type || 'tiered_lookup';
```

**Why:** This is the safety net. Even if the AI still returns `type="tiered_lookup"` despite the expanded prompt (AI is probabilistic), `calculationIntent.operation` will catch it. The calculationIntent field is unconstrained and always contains the correct structural analysis.

**Backward compatibility:** For BCL and Meridian plans imported before OB-77, `calculationIntent` is undefined. `undefined as string` is `undefined`, which is falsy, so `calcMethod?.type` takes over. Old plans are unaffected.

### Proof Gate
```
PG-04: calcType assignment checks calculationIntent.operation FIRST
  Evidence: grep -n "calculationIntent.*operation.*calcMethod" web/src/lib/compensation/ai-plan-interpreter.ts
  Paste output showing the priority order.
```

**Commit: "HF-160 Change 3: calculationIntent.operation priority inversion"**

---

## PHASE 4: BUILD + LOCALHOST VERIFICATION

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. `npm run dev` — confirm localhost:3000

5. Delete CRP rule_sets:
```sql
DELETE FROM rule_sets WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
```

6. On localhost: log in as VL Admin, navigate to CRP tenant, go to /operate/import
7. Upload CRP_Plan_1_Capital_Equipment.pdf
8. Confirm and import
9. Check terminal output for the convertComponent log line

**Expected log output:**
```
[convertComponent] "Equipment Commission - Senior Rep" calcType="scalar_multiply" (from calcMethod.type="linear_function", calculationIntent.operation="scalar_multiply")
```

OR (if AI uses the new prompt vocabulary correctly):
```
[convertComponent] "Equipment Commission - Senior Rep" calcType="linear_function" (from calcMethod.type="linear_function", calculationIntent.operation="scalar_multiply")
```

**NOT acceptable:**
```
[convertComponent] "Equipment Commission - Senior Rep" calcType="tiered_lookup"
```

10. Query localhost database:
```sql
SELECT name, components::text FROM rule_sets
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
ORDER BY created_at DESC LIMIT 1;
```

Components must show componentType that is NOT "tier_lookup".

### Proof Gate
```
PG-05: npm run build exits 0
  Evidence: paste exit code

PG-06: Localhost Plan 1 import: calcType is NOT "tiered_lookup"
  Evidence: paste the COMPLETE convertComponent log line from terminal

PG-07: Localhost Plan 1 DB: componentType is NOT "tier_lookup"
  Evidence: paste the DB query result showing componentType value
```

**Commit: "HF-160 Phase 4: Build + localhost verification"**

---

## PR CREATION

```bash
gh pr create --base main --head dev --title "HF-160: AI Prompt Vocabulary + Priority Inversion — Root Cause Fix" --body "Three changes. (1) Anthropic adapter system prompt expanded with linear_function, piecewise_linear, scope_aggregate, scalar_multiply, conditional_gate — with examples. (2) User prompt type enum expanded to match. (3) convertComponent reads calculationIntent.operation FIRST as safety net. Root cause: AI prompt constrained types to 5 options, forcing tiered_lookup for all new plan structures. AI correctly produced calculationIntent but nothing read it with priority. Verified on localhost: Plan 1 produces calcType != tiered_lookup."
```

---

## PROOF GATES — ALL REQUIRED

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| PG-01 | System prompt contains "linear_function" as component type | grep output |
| PG-02 | System prompt has calculationMethod example for linear_function | grep output |
| PG-03 | Both system and user prompts contain expanded type enum | grep output with line numbers |
| PG-04 | calcType checks calculationIntent.operation FIRST | grep output |
| PG-05 | npm run build exits 0 | exit code |
| PG-06 | Localhost Plan 1: calcType NOT "tiered_lookup" | terminal log line |
| PG-07 | Localhost Plan 1 DB: componentType NOT "tier_lookup" | DB query result |

**PG-06 is the definitive gate.** If the terminal still shows `calcType="tiered_lookup"` after all three changes, the HF is FAILED.

---

## COMPLETION REPORT ENFORCEMENT

File: `HF-160_COMPLETION_REPORT.md` in PROJECT ROOT.
ALL 7 proof gates must be PASS with pasted evidence.
PG-06 requires ACTUAL localhost Plan 1 import — not self-attestation.
This is the seventh fix attempt. There will not be an eighth.
