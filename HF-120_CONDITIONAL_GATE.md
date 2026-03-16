# HF-120: CONDITIONAL GATE — EVALUATE CONDITION, NOT MULTIPLY BASE
## Fix Both Legacy and Intent Paths to Use calculationIntent Condition Structure

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference

**Read both before writing any code.**

---

## CONTEXT

Grand total: MX$192,962.62 vs GT MX$185,063. Delta: +MX$7,899.62.

**Root cause confirmed via GT analysis:** The entire delta is the conditional gate (Safety Record / C4).

12 employees have incidents > 0. GT says they get C4 = MX$0. HF-117's gate fix computes `base === 0 ? rate : base * rate`. When base > 0 (employee HAS incidents), it pays `incidents × rate` instead of MX$0.

| Employee | Incidents | Rate | Engine Pays | GT Expected | Overpay |
|---|---|---|---|---|---|
| 70129 Alma | 3 | 300 | 900 | 0 | 900 |
| 70170 Mariana | 1 | 500 | 500 | 0 | 500 |
| 70213 César | 3 | 300 | 900 | 0 | 900 |
| 70215 Hugo | 1 | 300 | 300 | 0 | 300 |
| 70235 Manuel | 3 | 300 | 900 | 0 | 900 |
| 70244 Andrea | 1 | 500 | 500 | 0 | 500 |
| 70270 Miguel | 1 | 300 | 300 | 0 | 300 |
| 70285 Pedro | 1 | 500 | 500 | 0 | 500 |
| 70303 Alejandro | 2 | 500 | 1000 | 0 | 1000 |
| 70313 Leticia | 2 | 500 | 1000 | 0 | 1000 |
| 70329 Ramón | 2 | 300 | 600 | 0 | 600 |
| 70341 Patricia | 2 | 300 | 600 | 0 | 600 |
| **Total** | | | | | **MX$8,000** |

Engine delta MX$7,899.62 = gate overpay MX$8,000 − C5 rounding MX$100.38. Exact match.

**Additionally:** Concordance is 17.9% because the intent path doesn't have the gate fix. For Claudia: convergence path = MX$1,573.162, intent path = MX$1,273.162. Delta = MX$300 = exactly the Standard safety bonus. The intent path still returns $0 for the gate.

---

## THE CORRECT GATE LOGIC

The plan's `calculationIntent` already has the complete gate definition:

```json
{
  "operation": "conditional_gate",
  "condition": {
    "left": { "source": "metric", "sourceSpec": { "field": "safety_incidents_count" } },
    "right": { "value": 0, "source": "constant" },
    "operator": "="
  },
  "onTrue": { "value": 500, "operation": "constant" },
  "onFalse": { "value": 0, "operation": "constant" }
}
```

The engine should:
1. Resolve the left side (metric value — e.g., incidents = 3)
2. Evaluate the condition: `3 == 0` → FALSE
3. Return `onFalse.value` = 0

NOT: multiply base × rate. The gate is a condition evaluation producing a constant, not a percentage calculation.

For an employee with 0 incidents:
1. Left = 0
2. Condition: `0 == 0` → TRUE
3. Return `onTrue.value` = 500 (Senior) or 300 (Standard)

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Commit this prompt as first action.
5. DO NOT MODIFY ANY AUTH FILE.
6. Supabase .in() ≤ 200 items.

---

## COMPLETION REPORT RULES (25-28)

25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 0: DIAGNOSTIC — BOTH CODE PATHS

```bash
echo "============================================"
echo "HF-120 PHASE 0: CONDITIONAL GATE CODE PATHS"
echo "============================================"

echo ""
echo "=== 1. LEGACY PATH: evaluateConditionalPercentage ==="
grep -n "evaluateConditional\|conditional_percentage\|base === 0\|condition.*rate" \
  web/src/lib/calculation/run-calculation.ts | head -20

echo ""
echo "=== 2. PRINT THE FULL FUNCTION ==="
# Print evaluateConditionalPercentage
grep -n "function evaluateConditional" web/src/lib/calculation/run-calculation.ts
# Then print surrounding context (~40 lines)

echo ""
echo "=== 3. INTENT PATH: conditional_gate handler ==="
grep -n "conditional_gate\|conditionalGate\|executeConditional\|onTrue\|onFalse" \
  web/src/lib/calculation/intent-executor.ts | head -20

echo ""
echo "=== 4. PRINT THE INTENT GATE HANDLER ==="
# Print the conditional_gate case in intent-executor.ts

echo ""
echo "=== 5. HOW IS calculationIntent.condition STRUCTURED? ==="
# We already know from the plan JSON above, but verify the code reads it
grep -n "calculationIntent\|condition.*operator\|onTrue\|onFalse" \
  web/src/lib/calculation/intent-executor.ts \
  web/src/app/api/calculation/run/route.ts | head -20

echo ""
echo "=== 6. WHERE DOES THE LEGACY PATH GET CALLED? ==="
grep -n "evaluateConditionalPercentage\|conditional_percentage" \
  web/src/app/api/calculation/run/route.ts | head -10
```

### PHASE 0 DELIVERABLE

Write `HF-120_ARCHITECTURE_DECISION.md`:

```
ARCHITECTURE DECISION RECORD
============================
Problem: Gate evaluates base × rate instead of condition → constant.
  PASS case (0 incidents): base=0, pays rate (correct by accident — 0*rate=0+rate via HF-117 fix)
  FAIL case (>0 incidents): base=incidents, pays incidents×rate (WRONG — should be 0)

LEGACY PATH (evaluateConditionalPercentage):
  Code: [file:line]
  Current: base === 0 ? rate : base * rate
  Fix: evaluate condition from calculationIntent, return onTrue.value or onFalse.value

INTENT PATH (conditional_gate):
  Code: [file:line]
  Current: [describe what it does]
  Fix: [what needs to change, if anything]

CHOSEN: Use calculationIntent condition structure in BOTH paths
  - condition.left resolves to metric value
  - evaluate: left <operator> right
  - return onTrue.value or onFalse.value
  - Korean Test: operator and values from plan structure, no field names
  - Scale: works for any condition (=, <, >, <=, >=, !=)
```

**Commit:** `git add -A && git commit -m "HF-120 Phase 0: Conditional gate diagnostic — both code paths" && git push origin dev`

---

## PHASE 1: FIX BOTH PATHS

### Legacy Path Fix (evaluateConditionalPercentage)

Replace `base === 0 ? rate : base * rate` with proper condition evaluation:

```typescript
// Read calculationIntent condition if available
const intent = component.calculationIntent;
if (intent?.operation === 'conditional_gate' && intent.condition) {
  // Resolve left side (metric value)
  const leftValue = /* resolve from metrics */;
  const rightValue = intent.condition.right?.value ?? 0;
  const operator = intent.condition.operator;
  
  // Evaluate condition
  let conditionMet = false;
  switch (operator) {
    case '=': case '==': conditionMet = leftValue === rightValue; break;
    case '!=': conditionMet = leftValue !== rightValue; break;
    case '<': conditionMet = leftValue < rightValue; break;
    case '<=': conditionMet = leftValue <= rightValue; break;
    case '>': conditionMet = leftValue > rightValue; break;
    case '>=': conditionMet = leftValue >= rightValue; break;
    default: conditionMet = leftValue === rightValue;
  }
  
  const payout = conditionMet ? (intent.onTrue?.value ?? 0) : (intent.onFalse?.value ?? 0);
  return { payout, details: { conditionMet, leftValue, rightValue, operator } };
}

// Fallback for legacy plans without calculationIntent
// ... existing logic
```

### Intent Path Fix

If the intent executor's `conditional_gate` handler already evaluates the condition correctly but the legacy path is called instead, ensure the engine routes to the intent path for `conditional_gate` operations. If both paths exist, they must agree.

### Key Constraint

The fix must produce the SAME result in both paths. Concordance must return to 100%.

### Proof Gates — Phase 1

- PG-1: Legacy path uses calculationIntent condition evaluation (paste code)
- PG-2: Operator evaluation supports =, !=, <, <=, >, >= (paste switch)
- PG-3: Returns onTrue.value or onFalse.value, NOT base × rate (paste)
- PG-4: Intent path produces same result (paste evidence)
- PG-5: No hardcoded field names or condition values (Korean Test)
- PG-6: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-120 Phase 1: Conditional gate — evaluate condition, return constant" && git push origin dev`

---

## PHASE 2: BUILD + PR

```bash
rm -rf .next
npm run build
npm run dev

gh pr create --base main --head dev \
  --title "HF-120: Conditional gate — evaluate condition, not multiply base" \
  --body "## What
Fix conditional gate to evaluate the plan's condition structure and return constant payout values (onTrue/onFalse), instead of multiplying base metric by rate.

## Why
HF-117 fix (base===0 ? rate : base*rate) handled PASS case but broke FAIL case. Employees with incidents got incidents×rate instead of 0. Delta: MX\$8,000 across 12 employees.

## How
Both legacy and intent paths now evaluate calculationIntent.condition using the operator (=, <, >, etc.) and return onTrue.value or onFalse.value. No base×rate multiplication for gate components.

## Expected Result
Grand total: MX\$185,063 (±MX\$100 for C5 rounding)
Concordance: 100% (both paths use same condition evaluation)
Gate: 0 incidents → MX\$500/300 (pass). >0 incidents → MX\$0 (fail)."
```

### Post-Merge Steps (FOR ANDREW)

**No nuclear clear needed.** Just recalculate — bindings and data are correct.

1. Merge PR
2. Wait for Vercel deployment
3. Navigate to Meridian → Calculate → Run Calculation
4. Verify:

```sql
-- Grand total ≈ MX$185,063
SELECT SUM(total_payout) as grand_total
FROM calculation_results
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Claudia (70001, Standard, 0 incidents) = MX$1,573
SELECT e.external_id, e.display_name, cr.total_payout
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND e.external_id = '70001';

-- Alma (70129, Standard, 3 incidents) — should be ~MX$1,125 (no safety bonus)
SELECT e.external_id, e.display_name, cr.total_payout
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND e.external_id = '70129';

-- Concordance should be 100%
-- Check Vercel logs for "OB-76 Dual-path: 67 match, 0 mismatch (100.0% concordance)"
```

### Proof Gates — Phase 2

- PG-7: `npm run build` exits 0 (paste)
- PG-8: PR created (paste URL)
- PG-9: Grand total ≈ MX$185,063 (FOR ANDREW)
- PG-10: Claudia = MX$1,573 (FOR ANDREW)
- PG-11: Alma (70129) has no safety bonus (FOR ANDREW)
- PG-12: Concordance = 100% (FOR ANDREW)

**Commit:** `git add -A && git commit -m "HF-120 Phase 2: Build + PR" && git push origin dev`

---

## COMPLETION REPORT

Create `HF-120_COMPLETION_REPORT.md` in PROJECT ROOT.

**Commit:** `git add -A && git commit -m "HF-120 Completion Report" && git push origin dev`

---

## WHAT SUCCESS LOOKS LIKE

1. Gate evaluates condition: `incidents == 0` → TRUE → MX$500/300. `incidents > 0` → FALSE → MX$0.
2. 55 employees get safety bonus. 12 employees get MX$0. Matches GT exactly.
3. Grand total ≈ MX$185,063 (within MX$100 for C5 rounding)
4. Concordance = 100% (both paths agree)
5. No hardcoded conditions — works for any operator, any threshold

**"A gate is a question with two answers. Evaluate the question. Return the answer. Don't multiply anything."**
