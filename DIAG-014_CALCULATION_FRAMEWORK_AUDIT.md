# DIAG-014: Complete Calculation Framework Code Audit

## Date: March 22, 2026
## Type: DIAG (READ-ONLY — NO CODE CHANGES)
## Severity: P0 — Fourth failed fix attempt. Trust in CC code claims is zero.

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

---

## WHY THIS DIAGNOSTIC EXISTS

HF-156 claimed to fix three disconnects in the plan converter. The commit is on main. The code deployed to production. The Vercel logs show the EXACT same failure as before: calcType="tiered_lookup" with 0 tiers. CC's completion report said PASS on 6 of 8 proof gates. The browser says nothing changed.

We no longer trust CC's descriptions of what code does. We need the actual code. Every line. Every file in the calculation path.

**CC MUST paste the COMPLETE file contents. Not excerpts. Not summaries. Not "this function does X." The ENTIRE file, start to finish, with line numbers.**

**THIS IS READ-ONLY. NO CODE CHANGES.**

---

## MISSION 1: AI PLAN INTERPRETER

Paste the COMPLETE contents of every file involved in AI plan interpretation:

### 1A: ai-plan-interpreter.ts
```bash
cat -n web/src/lib/ai/ai-plan-interpreter.ts
```
Paste the ENTIRE output.

### 1B: Any other AI interpretation files
```bash
find web/src -name "*plan-interpret*" -o -name "*plan-intel*" | head -20
```
For each file found, paste the ENTIRE contents with line numbers.

---

## MISSION 2: PLAN CONVERTER / COMPONENT BUILDER

Paste the COMPLETE contents of every file that converts AI interpretation output into rule_set.components JSONB:

### 2A: Find all files with convertComponent or interpretationToPlanConfig
```bash
grep -rln "convertComponent\|interpretationToPlanConfig\|convertToComponent" web/src/ --include="*.ts" --include="*.tsx"
```
For EACH file found, paste the ENTIRE contents with line numbers.

### 2B: Find the compensation-plan types
```bash
grep -rln "ComponentType\|componentType\|PlanComponent" web/src/ --include="*.ts" --include="*.tsx" | head -20
```
For the PRIMARY type definition file, paste the ENTIRE contents.

---

## MISSION 3: INTENT TRANSFORMER

### 3A: intent-transformer.ts
```bash
cat -n web/src/lib/calculation/intent-transformer.ts
```
Paste the ENTIRE output.

---

## MISSION 4: INTENT TYPES + EXECUTOR

### 4A: intent-types.ts
```bash
cat -n web/src/lib/calculation/intent-types.ts
```
Paste the ENTIRE output.

### 4B: intent-executor.ts
```bash
cat -n web/src/lib/calculation/intent-executor.ts
```
Paste the ENTIRE output.

---

## MISSION 5: CALCULATION ENGINE

### 5A: The calculation run route
```bash
cat -n web/src/app/api/calculation/run/route.ts
```
Paste the ENTIRE output.

### 5B: Any supporting calculation files
```bash
find web/src/lib/calculation -name "*.ts" | head -20
```
For EACH file found (that hasn't been pasted already), paste the ENTIRE contents.

---

## MISSION 6: SCI EXECUTE (Import Pipeline)

### 6A: execute-bulk route
```bash
cat -n web/src/app/api/import/sci/execute-bulk/route.ts
```
Paste the ENTIRE output.

### 6B: The SCI plan execution path
```bash
grep -rln "Plan interpretation\|planInterpret\|interpretPlan" web/src/ --include="*.ts" --include="*.tsx" | head -10
```
For EACH file found (that hasn't been pasted already), paste the ENTIRE contents.

---

## MISSION 7: NORMALIZER VERIFICATION

This is the specific function that DIAG-013 identified as Disconnect 1.

### 7A: Find normalizeCalcType
```bash
grep -n "normalizeCalcType\|validTypes\|linear_function" web/src/lib/ai/ai-plan-interpreter.ts
```
Paste the output showing the EXACT lines with the valid types array.

### 7B: Verify HF-156 changes exist
```bash
git log --oneline -5
git show afe45bf3 --stat
git show 6da526f0 --stat
```
Paste the output showing what files were actually changed in HF-156 and HF-157.

---

## OUTPUT

Save ALL pasted code as `DIAG-014_CALCULATION_FRAMEWORK_AUDIT.md` in PROJECT ROOT.

This file will be LARGE. That is expected and required. Every line of every file in the calculation path must be captured.

**Commit: "DIAG-014: Complete calculation framework code audit"**

```bash
gh pr create --base main --head dev --title "DIAG-014: Complete Calculation Framework Code Audit" --body "Read-only. Pastes the complete contents of every file in the calculation path: AI interpreter, converter, intent transformer, intent types, intent executor, calculation engine, SCI execute pipeline. Required because four fix attempts have failed and CC self-attestation is unreliable."
```
