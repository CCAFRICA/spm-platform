# HF-121: Conditional Gate Diagnostic and Fix
## Category: HF (Hotfix)
## Date: March 10, 2026
## Platform: vialuce.ai
## Repository: CCAFRICA/spm-platform
## Branch: dev → preview, main → production

---

## CC_STANDING_ARCHITECTURE_RULES.md — MANDATORY (include at top of every OB/HF/SD)

**SECTION A: DESIGN PRINCIPLES (NON-NEGOTIABLE)**

1. **AI-First, Never Hardcoded** — NEVER hardcode field names, column patterns, or language-specific strings. The Korean Test: if a Korean company uploaded data in Hangul, would this code still work? If no, it's hardcoded.
2. **Scale by Design** — Every decision must work at 10x current volume. No sequential per-row DB calls. Bulk operations.
3. **Fix Logic, Not Data** — Never provide answer values. Never give CC the answer key. Systems derive correct results from source material.
4. **Be the Thermostat** — Act on data, don't just display it.
5. **Closed-Loop Learning** — Platform activity generates training signals for continuous improvement.
6. **Security, Scale, Performance by Design** — Provider abstraction. RLS for multi-tenancy. Audit trails.
7. **Prove, Don't Describe** — Show evidence, not claims. Every proof gate must verify LIVE, RENDERED, RUNNING state.
8. **Domain-Agnostic Always** — vialuce is a Performance Optimization Engine, not an ICM tool.
9. **IAP Gate** — Every UI measure scores on Intelligence, Acceleration, Performance.

---

## STANDING RULES — ENFORCED THIS HF

| # | Rule | Enforcement |
|---|------|-------------|
| FP-49 | **SQL Schema Verification** — Every SQL statement verified against SCHEMA_REFERENCE_LIVE.md BEFORE execution. No exceptions. | CC must `SELECT column_name FROM information_schema.columns WHERE table_name = X` before writing any SQL. |
| FP-60 | **Production Evidence Only** — CC completion reports claiming PASS without production verification are REJECTED. Build passing ≠ code working. | Completion report must include pasted Vercel Runtime Log output and pasted calculation result. |
| FP-61 | **GT-First Protocol** — After EVERY calculation run, compare component-by-component against GT file BEFORE any reactive diagnosis. | Compare engine output against GT verification anchors after every run. |
| FP-62 | **No Proximity Celebration** — Never describe a wrong total as "close" or "in the neighborhood." Decision 95: 100% reconciliation or it's wrong. | State delta and root cause. No subjective adjectives about results. |
| FP-64 | **Both Gate Branches** — Every conditional fix must be tested with entities that PASS and entities that FAIL the condition. | Must verify BOTH a 0-incident employee AND a >0-incident employee. |
| Rule 26 | **Proof gates with pasted evidence** — Self-attestation not accepted. Paste code, terminal output, or grep results. | Every gate below requires pasted evidence. |
| Rule 27 | **Production verification mandatory** — Every HF ends with post-merge production verification. | Andrew verifies on vialuce.ai after merge. |

---

## PROBLEM STATEMENT

HF-120 (PR #223) deployed a conditional gate fix to `evaluateConditionalPercentage` in `web/src/lib/calculation/run-calculation.ts`. The fix added a guard that checks for `calculationIntent` with `conditional_gate` operation, which should route to the intent executor (`executeOperation`) instead of the legacy `base === 0 ? rate : base * rate` path.

**The fix is not firing at runtime.** The grand total remains MX$192,962.62. Target: MX$185,063. Delta: +MX$7,899.62 — entirely from 12 employees with safety incidents receiving `incidents × rate` instead of MX$0.

---

## ARCHITECTURE DECISION RECORD

```
Problem: HF-120's conditional_gate guard doesn't match at runtime — need to diagnose WHY and fix it.

Option A: Add diagnostic logging → read Vercel logs → fix the guard condition based on actual data
  - Scale test: Works at 10x? YES — logging is diagnostic only, removed after fix
  - AI-first: Any hardcoding? NO — fix uses calculationIntent structure, not field names
  - Transport: Data through HTTP bodies? NO
  - Atomicity: Clean state on failure? YES — diagnostic logging has no side effects
  - Korean Test: YES — fix evaluates intent structure, not field names or values

Option B: Rewrite the entire evaluateConditionalPercentage function without diagnosis
  - Scale test: Works at 10x? UNKNOWN — blind rewrite without understanding current state
  - AI-first: Risk of hardcoding? HIGH — rewriting without data risks assumptions
  - Transport: N/A
  - Atomicity: YES
  - Korean Test: UNKNOWN

CHOSEN: Option A because diagnostic-first eliminates guessing. We read what the function receives, then fix the exact mismatch.
REJECTED: Option B because rewriting without diagnosis repeats the pattern that caused HF-120 to fail — assuming what the function receives instead of observing it.
```

---

## GROUND TRUTH VERIFICATION ANCHORS

**These are the three entities you MUST verify after every calculation run:**

| Employee | ID | Variant | Incidents | C1 | C2 | C3 | C4 | C5 | Total |
|---|---|---|---|---|---|---|---|---|---|
| Claudia Cruz Ramírez | 70001 | Standard | 0 | 800 | 100 | 0 | **300** | 373 | **1,573** |
| Antonio López Hernández | 70010 | Senior | 0 | 1,600 | 700 | 2,800 | **500** | 663 | **6,263** |
| Alma Sánchez Morales | 70129 | Standard | 3 | 0 | 0 | 1,600 | **0** | 450 | **2,050** |

**Alma is the critical gate-fail test case.** 3 incidents → C4 MUST be MX$0. Engine currently pays 3 × 300 = MX$900.

**Component Totals (GT — January 2025, 67 employees):**

| Component | GT Total |
|---|---|
| C1 Revenue Performance | MX$44,000 |
| C2 On-Time Delivery | MX$15,550 |
| C3 New Accounts | MX$69,900 |
| C4 Safety Record | MX$20,700 |
| C5 Fleet Utilization | MX$34,913 |
| **Grand Total** | **MX$185,063** |

---

## MERIDIAN CONTEXT

- **Tenant ID:** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
- **Plan ID:** `d2425064-f107-4e58-881c-97de05403b0c`
- **Period ID:** `bc2ec62b-e915-44e6-8b44-34f911d6e913` (January 2025, status='open')
- **Entities:** 67 employees + 12 hubs = 79 total
- **Variants:** Senior Logistics Coordinator (26) / Standard Logistics Coordinator (41)
- **Plan status:** 'active'

---

## CONDITIONAL GATE — WHAT THE PLAN STORES

The Safety Record component (Component 3, index 3) has this calculationIntent:

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

(Senior variant has onTrue.value = 500, Standard variant has onTrue.value = 300.)

**Correct behavior:**
- 0 incidents: `0 == 0` → TRUE → return onTrue.value (300 or 500)
- >0 incidents: `N == 0` → FALSE → return onFalse.value = 0

**Current (broken) behavior:**
- Legacy path: `base === 0 ? rate : base * rate`
- 0 incidents: base=0 → returns rate ✅ (correct by accident)
- 3 incidents: base=3 → returns 3 × 300 = 900 ❌

---

## PHASE 0: DIAGNOSTIC — READ BEFORE ANY CODE

**This is the most important phase. Do NOT skip. Do NOT modify any logic yet.**

### 0A: Read the current evaluateConditionalPercentage function

```bash
echo "=== FULL evaluateConditionalPercentage FUNCTION ==="
grep -n -A 60 "function evaluateConditionalPercentage\|evaluateConditionalPercentage =" web/src/lib/calculation/run-calculation.ts

echo ""
echo "=== WHERE IT IS CALLED FROM ==="
grep -n "evaluateConditionalPercentage" web/src/lib/calculation/run-calculation.ts
```

### 0B: Read the HF-120 guard that was added

```bash
echo "=== HF-120 GUARD — conditional_gate check ==="
grep -n -B 5 -A 20 "conditional_gate\|gateIntent\|isIntentOperation" web/src/lib/calculation/run-calculation.ts

echo ""
echo "=== calculationIntent references in run-calculation ==="
grep -n "calculationIntent" web/src/lib/calculation/run-calculation.ts
```

### 0C: Read the executeOperation function (intent executor)

```bash
echo "=== INTENT EXECUTOR ==="
cat web/src/lib/calculation/intent-executor.ts | head -120

echo ""
echo "=== conditional_gate handling in intent executor ==="
grep -n -A 30 "conditional_gate" web/src/lib/calculation/intent-executor.ts
```

### 0D: Read how components are structured when passed to evaluation

```bash
echo "=== HOW COMPONENTS ARE PASSED TO evaluateConditionalPercentage ==="
grep -n -B 10 "evaluateConditionalPercentage" web/src/lib/calculation/run-calculation.ts | grep -v "^--$"

echo ""
echo "=== COMPONENT STRUCTURE AT CALL SITE ==="
grep -n -B 30 "evaluateConditionalPercentage(" web/src/lib/calculation/run-calculation.ts | head -50
```

### 0E: Read the full calculation loop to understand data flow

```bash
echo "=== CALCULATION LOOP — how does component reach the function? ==="
grep -n -A 5 "for.*component\|forEach.*component\|\.map.*component" web/src/lib/calculation/run-calculation.ts

echo ""
echo "=== VARIANT ROUTING — where variants are resolved ==="
grep -n "variant\|discriminant" web/src/lib/calculation/run-calculation.ts | head -20
```

**COMMIT DIAGNOSTIC:** Paste the FULL output of 0A through 0E before proceeding. This is a proof gate. Do not write any code until you have pasted the diagnostic output and analyzed:

1. What parameters does `evaluateConditionalPercentage` accept?
2. What does the HF-120 guard check for? What exact property path?
3. At the call site, what object is passed? Does that object have `calculationIntent`?
4. If `calculationIntent` is NOT on the object at the call site, WHERE is it?

---

## PHASE 1: ADD DIAGNOSTIC LOGGING

**Based on what you learned in Phase 0, add a console.log at the ENTRY of `evaluateConditionalPercentage`.**

The log must show:

```typescript
console.log('[GATE-DEBUG]', JSON.stringify({
  functionParams: Object.keys(arguments[0] || {}),  // What keys does the first param have?
  componentType: /* the component type if visible */,
  hasCalcIntent: /* does the passed object have calculationIntent? */,
  intentOp: /* calculationIntent?.operation if present */,
  base: /* the base/metric value */,
  rate: /* the rate value */,
  // Also log the FULL component structure for the Safety component:
  fullComponent: /* only if componentType involves 'safety' or 'gate' — careful, don't log all components */
}));
```

**CRITICAL:** The log must reveal:
- Whether `calculationIntent` exists on the object at this point
- If it exists, what `operation` value it has
- What `base` and `rate` values are (to confirm this is the gate function being called)

### Deploy and Calculate

```bash
# After adding diagnostic logging:
git add -A && git commit -m "HF-121: diagnostic logging for conditional gate" && git push origin dev

# Wait for Vercel deployment, then trigger calculation via browser:
# Navigate to vialuce.ai → Meridian → Calculate → Run for January 2025
```

**PROOF GATE 1:** Paste the Vercel Runtime Log output showing `[GATE-DEBUG]` lines. You need at least:
- One line for a 0-incident employee (should show base=0)
- One line for a >0-incident employee (should show base=N where N>0)

---

## PHASE 2: FIX THE GUARD CONDITION

**Based on the diagnostic output from Phase 1, fix the guard condition so it matches the actual data structure.**

### Possible Scenarios and Fixes

**Scenario A: `calculationIntent` is NOT on the component at this point**
→ The intent is stored elsewhere (parent object, variant structure, or the component before unwrapping)
→ Fix: Thread the calculationIntent through from where it IS available to where the function is called

**Scenario B: `calculationIntent.operation` is NOT `'conditional_gate'`**
→ The operation might use a different string, or the structure is nested differently
→ Fix: Update the guard to match the actual operation string

**Scenario C: `isIntentOperation(...)` returns false**
→ The helper function may have validation that rejects the Safety component's intent
→ Fix: Update `isIntentOperation` or bypass it for this case

**Scenario D: The function is never called for the Safety component**
→ The Safety component may route to a different code path entirely
→ Fix: Ensure the Safety component routes through the conditional evaluation path

### The Fix Must:

1. **Evaluate the condition from calculationIntent** — resolve left operand (metric value), compare with operator against right operand (constant), return onTrue or onFalse value
2. **NOT use `base === 0 ? rate : base * rate`** — this is the broken legacy path
3. **Pass the Korean Test** — no field name matching, no "safety" string checks
4. **Handle both branches** — PASS (0 incidents → bonus) AND FAIL (>0 incidents → MX$0)

### Implementation

```bash
# After making the fix:
git add -A && git commit -m "HF-121: fix conditional gate guard to match actual component structure" && git push origin dev
```

---

## PHASE 3: CALCULATE AND VERIFY AGAINST GT

**After the fix deploys, trigger calculation and verify:**

### Step 1: Run Calculation

Navigate to vialuce.ai → Meridian → Calculate → Run for January 2025.

### Step 2: Verify Grand Total

```bash
echo "=== GRAND TOTAL ==="
# Query calculation_results for Meridian January 2025
```

**SCHEMA VERIFICATION (FP-49 — MANDATORY):**
Before writing ANY SQL query, run:
```bash
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'calculation_results' ORDER BY ordinal_position;
```
Verify every column name you use exists. No fabricated columns.

**Expected:** MX$185,063. Not MX$185,062. Not MX$185,064. Exactly MX$185,063.

If the total is NOT MX$185,063, compare component-by-component against GT totals (FP-61):

| Component | GT Total | Engine Total | Delta |
|---|---|---|---|
| C1 Revenue Performance | MX$44,000 | ? | ? |
| C2 On-Time Delivery | MX$15,550 | ? | ? |
| C3 New Accounts | MX$69,900 | ? | ? |
| C4 Safety Record | MX$20,700 | ? | ? |
| C5 Fleet Utilization | MX$34,913 | ? | ? |
| **Grand Total** | **MX$185,063** | ? | ? |

### Step 3: Verify Three Anchor Entities

Query individual results for:

| Employee | Expected C4 | Expected Total |
|---|---|---|
| Claudia (70001) | 300 | 1,573 |
| Antonio (70010) | 500 | 6,263 |
| Alma (70129) | **0** | 2,050 |

**Alma (70129) C4 = 0 is the critical assertion.** If Alma's C4 is anything other than 0, the gate fix is still broken. Do NOT proceed to completion report.

### Step 4: Verify Both Gate Branches (FP-64)

```bash
echo "=== GATE PASS CASES (0 incidents → bonus) ==="
# Query employees with 0 incidents and verify C4 > 0

echo "=== GATE FAIL CASES (>0 incidents → MX$0) ==="
# Query employees with >0 incidents and verify C4 = 0
```

**All 12 employees with incidents must have C4 = 0. All 55 employees with 0 incidents must have C4 > 0 (300 for Standard, 500 for Senior).**

---

## PHASE 4: REMOVE DIAGNOSTIC LOGGING

```bash
# Remove the [GATE-DEBUG] console.log added in Phase 1
# Keep only the fix — no diagnostic artifacts in production code

git add -A && git commit -m "HF-121: remove diagnostic logging after gate fix verified" && git push origin dev
```

---

## PHASE 5: COMPLETION REPORT

### Mandatory Structure (Rules 26-27)

```
HF-121 COMPLETION REPORT
=========================

PHASE 0: DIAGNOSTIC
- [ ] Pasted output of 0A-0E (full function, guard, call site)
- [ ] Identified WHY the guard doesn't match (specific property path mismatch)

PHASE 1: DIAGNOSTIC LOGGING
- [ ] Pasted [GATE-DEBUG] log output from Vercel Runtime Logs
- [ ] Identified the exact mismatch (what property is missing/wrong)

PHASE 2: FIX
- [ ] Pasted the BEFORE code (the broken guard)
- [ ] Pasted the AFTER code (the fixed guard)
- [ ] Explained WHY the fix matches the actual data structure
- [ ] Korean Test: PASS/FAIL with explanation

PHASE 3: GT VERIFICATION
- [ ] Grand total: MX$_____ (must be MX$185,063)
- [ ] Component totals pasted (all 5, compared against GT)
- [ ] Claudia (70001): C4=___ Total=___ (expected: 300, 1,573)
- [ ] Antonio (70010): C4=___ Total=___ (expected: 500, 6,263)
- [ ] Alma (70129): C4=___ Total=___ (expected: 0, 2,050)
- [ ] Gate PASS count: ___ employees with 0 incidents, all C4 > 0
- [ ] Gate FAIL count: ___ employees with >0 incidents, all C4 = 0

PHASE 4: CLEANUP
- [ ] Diagnostic logging removed
- [ ] Final commit pushed

DEPLOYMENT
- [ ] PR created: `gh pr create --base main --head dev --title "HF-121: Conditional gate diagnostic and fix" --body "Diagnoses and fixes the conditional gate guard that was deployed in HF-120 but not firing at runtime. Verifies MX$185,063 grand total against GT. Tests both gate branches (PASS and FAIL)."`

PRODUCTION VERIFICATION (Andrew — post-merge)
- [ ] Navigate to vialuce.ai → Meridian → Calculate → Run January 2025
- [ ] Verify grand total = MX$185,063
- [ ] Verify Alma (70129) C4 = 0
- [ ] Verify Claudia (70001) Total = 1,573
- [ ] Verify Antonio (70010) Total = 6,263
```

**REJECTION CRITERIA:** This completion report is REJECTED if:
- Any gate is marked PASS without pasted evidence (code, log output, query result)
- Grand total is not exactly MX$185,063
- Alma's C4 is not exactly 0
- Gate FAIL cases are not verified (only testing PASS cases = FP-64)
- Diagnostic logging is not removed in Phase 4

---

## BUILD SEQUENCE REMINDERS

1. **Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000** before completion report.
2. **Git from repo root (`spm-platform`)**, NOT `web/`.
3. **Commit + push after every change** — not just at the end.
4. **All testing on vialuce.ai** — localhost PASS ≠ production PASS (Rule 9).
5. **Final step:** `gh pr create --base main --head dev` with descriptive title + body.

---

## ANTI-PATTERN REMINDERS

| Pattern | What NOT to Do |
|---|---|
| FP-49 | Do NOT write SQL referencing columns without verifying they exist in the live schema |
| FP-57 | Do NOT tweak prompts or change AI behavior — this is a CODE bug in the engine |
| FP-60 | Do NOT claim PASS without pasted production evidence |
| FP-61 | Do NOT diagnose issues without comparing against GT first |
| FP-62 | Do NOT describe any total as "close" or "in the neighborhood" |
| FP-64 | Do NOT test only one branch of the conditional gate |

---

## STANDING QUESTION (Korean Test)

> If this fix works for Meridian, will it work for a Korean logistics company with Korean column names and different component structures?

The fix MUST evaluate the `calculationIntent` structure (operation, condition, onTrue, onFalse) — NOT match against field names like "safety" or "incidents." The calculationIntent is produced by AI plan interpretation and is structurally identical regardless of language.

If your fix contains ANY string literal that is Meridian-specific or domain-specific, it fails the Korean Test. Stop and redesign.

---

*End of HF-121 prompt. The pipeline works. 67 entities. Correct bindings. Correct variants. One gate condition away from MX$185,063.*
