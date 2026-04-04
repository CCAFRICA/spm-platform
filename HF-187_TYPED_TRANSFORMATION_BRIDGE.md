# HF-187: Typed Transformation Bridge for New Calculation Primitives

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit and push after each phase.

---

## CC STANDING ARCHITECTURE RULES (MANDATORY)

### SECTION A: DESIGN PRINCIPLES
1. **AI-First, Never Hardcoded** — NEVER hardcode field names, column patterns, or language-specific strings. Korean Test applies.
2. **Scale by Design** — Every decision works at 10x current volume.
3. **Fix Logic, Not Data** — Never provide answer values. Fix the logic.
4. **Domain-Agnostic Always** — Platform works across any domain.

### SECTION B: ARCHITECTURE DECISION GATE — Required before implementation.
### SECTION C: ANTI-PATTERN REGISTRY — Check before every code change.

### CC OPERATIONAL RULES
- After EVERY commit: `git push origin dev`
- After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
- Final step: `gh pr create --base main --head dev` with descriptive title and body
- Git from repo root (`spm-platform`), NOT `web/`

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build verification
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### ADDITIONAL STANDING RULES
- **Rule 35:** EPG mandatory for mathematical/formula phases.
- **Rule 36:** No unauthorized behavioral changes. Scope is exactly what this prompt specifies.
- **Rule 38:** Mathematical review gate — verify rate values pass through unchanged.
- **Rule 48:** This is a numbered item (HF-187) with its own completion report.
- **Rule 51v2:** `npx tsc --noEmit` AND `npx next lint` run after `git stash` on committed code only.

---

## PROBLEM STATEMENT

The AI plan interpreter correctly identifies new primitive types (piecewise_linear, linear_function, scope_aggregate, conditional_gate) and produces structurally correct intent objects. However, the AI output format differs from what the executor expects. Legacy primitives (tiered_lookup, matrix_lookup, percentage, conditional_percentage) each have explicit typed transformation code in `convertComponent`. New primitives have NO transformation — `transformFromMetadata` casts the raw AI output with `rawIntent as unknown as IntentOperation`.

This creates two structural mismatches:

### Mismatch 1: `source: "ratio"` vs `operation: "ratio"`

The AI produces ratio references as IntentSource-shaped objects:
```json
{ "source": "ratio", "sourceSpec": { "numerator": "consumable_revenue", "denominator": "monthly_quota" } }
```

The executor expects a RatioOp (IntentOperation):
```json
{
  "operation": "ratio",
  "numerator": { "source": "metric", "sourceSpec": { "field": "consumable_revenue" } },
  "denominator": { "source": "metric", "sourceSpec": { "field": "monthly_quota" } },
  "zeroDenominatorBehavior": "zero"
}
```

`resolveSource` only handles `source: "metric"` and `source: "constant"`. When it encounters `source: "ratio"`, it falls through with no matching case. The ratio is never computed.

### Mismatch 2: Modifiers inside intent vs component-level

The AI places `modifiers: [{ modifier: "cap", maxValue: 5000 }]` inside the intent object. `transformFromMetadata` reads `meta.cap` as a standalone number from component metadata — it never looks inside the intent for modifiers.

### Impact

CRP Plan 2 (piecewise_linear): $31,403.51 vs GT $28,159.48. The ratio fails to compute, every entity hits the first segment (3%), and the $5K cap is never applied. This affects ANY future plan using piecewise_linear, scope_aggregate, or conditional_gate with ratio inputs — it is a platform gap, not a CRP-specific issue.

### Why this didn't affect Plan 1

CRP Plan 1 (linear_function) works because `transformFromMetadata` has special handling for `rawIntent.rate != null && rawIntent.additionalConstant != null` → builds a LinearFunctionOp. This is the only new primitive with explicit transformation. All others get the broken "use as-is" cast.

---

## PHASE 0: DIAGNOSTIC — READ ACTUAL CODE

Before writing any code, read and paste evidence from these files:

### 0A: Read the current `transformFromMetadata` function
```bash
grep -n -A 50 'function transformFromMetadata' web/src/lib/calculation/intent-transformer.ts
```
Paste the FULL function. Confirm the "use as-is" fallthrough path.

### 0B: Read `resolveSource` — confirm no "ratio" case
```bash
grep -n -A 30 'function resolveSource' web/src/lib/calculation/intent-executor.ts
```
Paste the function. Confirm only "metric" and "constant" cases exist.

### 0C: Read `resolveValue` — confirm isIntentOperation check
```bash
grep -n -A 15 'function resolveValue' web/src/lib/calculation/intent-executor.ts
```
Paste the function. Confirm it checks `isIntentOperation` (looks for `operation` field).

### 0D: Read `isIntentOperation` type guard
```bash
grep -n -A 5 'function isIntentOperation' web/src/lib/calculation/intent-types.ts
```
Paste. Confirm it checks for `'operation' in value`.

### 0E: Read `PiecewiseLinearOp` type definition
```bash
grep -n -A 15 'PiecewiseLinearOp' web/src/lib/calculation/intent-types.ts
```
Paste. Confirm ratioInput expects `IntentSource | IntentOperation`.

### 0F: Read `RatioOp` type definition
```bash
grep -n -A 10 'RatioOp' web/src/lib/calculation/intent-types.ts
```
Paste. Confirm it requires `operation: 'ratio'`, `numerator: IntentSource`, `denominator: IntentSource`.

### 0G: Read the `piecewise_linear` case in `convertComponent`
```bash
grep -n -A 10 "'piecewise_linear'" web/src/lib/compensation/ai-plan-interpreter.ts
```
Paste. Confirm it just copies calculationIntent to metadata.intent with no transformation.

### 0H: Read `executePiecewiseLinear` in the executor
```bash
grep -n -A 20 'function executePiecewiseLinear' web/src/lib/calculation/intent-executor.ts
```
Paste. Confirm it calls `resolveValue(op.ratioInput, ...)`.

**DO NOT proceed to Phase 1 until all 8 reads are pasted with evidence.**

**Commit:** `git add -A && git commit -m "HF-187 Phase 0: Diagnostic — code read evidence" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: AI plan interpreter produces new primitive intents in a format the
executor cannot consume. ratioInput uses { source: "ratio" } but executor
expects { operation: "ratio" }. Modifiers are inside the intent but executor
reads them from component metadata.

Option A: Add transformation in transformFromMetadata (intent-transformer.ts)
  - Transform AI format → executor format when operation is piecewise_linear,
    scope_aggregate, or conditional_gate
  - Scale test: YES — no data volume impact
  - AI-first: YES — reads AI output structure, no hardcoded field names
  - Transport: NO — transformation logic only
  - Atomicity: YES — stateless transformation
  - PRO: Single transformation point for all new primitives
  - PRO: Keeps convertComponent simple (just stores raw intent)
  - CON: transformFromMetadata becomes the bridge between two formats

Option B: Add transformation in convertComponent (ai-plan-interpreter.ts)
  - Build proper typed configs in convertComponent, like legacy primitives
  - Scale test: YES
  - AI-first: YES
  - PRO: Matches existing pattern (legacy primitives transform in convertComponent)
  - CON: convertComponent output must then be read by transformFromMetadata,
    creating a double-transformation
  - CON: componentType would need new typed config interfaces

Option C: Fix resolveSource to handle source: "ratio"
  - Add a case 'ratio' to resolveSource that computes numerator/denominator
  - Scale test: YES
  - AI-first: YES
  - PRO: Minimal code change
  - CON: Treats symptom not disease — the AI output still isn't a valid
    IntentOperation, just happens to work because resolveSource handles it
  - CON: Doesn't fix modifiers extraction
  - CON: Future AI format variations would need more resolveSource patches

CHOSEN: Option A because transformFromMetadata is already the bridge point
where raw AI intent becomes typed IntentOperation. Adding transformation
logic there follows the existing flow: convertComponent stores → 
transformFromMetadata transforms → executor executes. This is also where
linear_function already has its transformation (the additionalConstant check).

REJECTED: Option B — double transformation, over-engineers convertComponent
REJECTED: Option C — treats symptom, doesn't fix modifiers, fragile
```

**Commit:** `git add -A && git commit -m "HF-187 Phase 1: Architecture decision — transform in transformFromMetadata" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

### File: `web/src/lib/calculation/intent-transformer.ts`
### Function: `transformFromMetadata`

The current function has this structure:
```typescript
function transformFromMetadata(component, componentIndex) {
  const rawIntent = (meta?.intent || component.calculationIntent);
  if (!rawIntent) return null;

  let operation: IntentOperation;
  if (rawIntent.additionalConstant != null && rawIntent.rate != null) {
    // Linear function special case — KEEP THIS
    operation = { operation: 'linear_function', input: rawIntent.input, slope: Number(rawIntent.rate), intercept: Number(rawIntent.additionalConstant) };
  } else if (rawIntent.operation === 'scalar_multiply' && rawIntent.rate != null) {
    // Scalar multiply — KEEP THIS
    operation = { operation: 'scalar_multiply', input: rawIntent.input, rate: Number(rawIntent.rate) };
  } else {
    // ❌ BUG: Raw cast — no transformation
    operation = rawIntent as unknown as IntentOperation;
  }

  // Modifiers from meta.cap / meta.floor — DOES NOT read intent.modifiers
  const modifiers = [];
  if (meta.cap != null) modifiers.push({ modifier: 'cap', maxValue: Number(meta.cap), scope: 'per_period' });
  if (meta.floor != null) modifiers.push({ modifier: 'floor', minValue: Number(meta.floor), scope: 'per_period' });

  return buildComponentIntent(component, componentIndex, operation, [], modifiers);
}
```

### Changes Required:

#### Change 1: Add a helper function to normalize source references

The AI produces two formats for metric/ratio references. This helper normalizes them into valid IntentSource or IntentOperation objects:

```typescript
/**
 * Normalize an AI-produced source reference into a valid IntentSource or IntentOperation.
 *
 * AI format for metrics:  { source: "metric", sourceSpec: { field: "X" } }  → pass through
 * AI format for ratios:   { source: "ratio", sourceSpec: { numerator: "X", denominator: "Y" } }
 *                         → { operation: "ratio", numerator: IntentSource, denominator: IntentSource, zeroDenominatorBehavior: "zero" }
 * AI format for constants: { source: "constant", value: N } → pass through
 * String shorthand:       "field_name" → { source: "metric", sourceSpec: { field: "field_name" } }
 */
function normalizeIntentInput(
  raw: unknown
): IntentSource | IntentOperation {
  if (raw == null) {
    return { source: 'constant', value: 0 };
  }

  // String shorthand → metric source
  if (typeof raw === 'string') {
    return { source: 'metric', sourceSpec: { field: raw } };
  }

  const obj = raw as Record<string, unknown>;

  // Already a valid IntentOperation (has 'operation' field)
  if ('operation' in obj && typeof obj.operation === 'string') {
    // Recursively normalize nested inputs if present
    if (obj.operation === 'ratio') {
      return {
        operation: 'ratio',
        numerator: normalizeIntentInput((obj.numerator as Record<string, unknown>) || obj.sourceSpec && (obj.sourceSpec as Record<string, unknown>).numerator),
        denominator: normalizeIntentInput((obj.denominator as Record<string, unknown>) || obj.sourceSpec && (obj.sourceSpec as Record<string, unknown>).denominator),
        zeroDenominatorBehavior: (obj.zeroDenominatorBehavior as string) || 'zero',
      } as IntentOperation;
    }
    return obj as unknown as IntentOperation;
  }

  // source: "ratio" → convert to RatioOp (IntentOperation)
  if (obj.source === 'ratio') {
    const spec = (obj.sourceSpec || {}) as Record<string, unknown>;
    return {
      operation: 'ratio',
      numerator: normalizeIntentInput(spec.numerator),
      denominator: normalizeIntentInput(spec.denominator),
      zeroDenominatorBehavior: 'zero',
    } as IntentOperation;
  }

  // source: "metric" → valid IntentSource, pass through
  if (obj.source === 'metric') {
    return obj as unknown as IntentSource;
  }

  // source: "constant" → valid IntentSource, pass through
  if (obj.source === 'constant') {
    return obj as unknown as IntentSource;
  }

  // Unknown format — wrap as constant 0 (safe fallback)
  return { source: 'constant', value: 0 };
}
```

#### Change 2: Add piecewise_linear transformation case

In `transformFromMetadata`, BEFORE the final "use as-is" else block, add:

```typescript
} else if (rawIntent.operation === 'piecewise_linear') {
  // Transform AI piecewise_linear format → typed PiecewiseLinearOp
  operation = {
    operation: 'piecewise_linear',
    ratioInput: normalizeIntentInput(rawIntent.ratioInput),
    baseInput: normalizeIntentInput(rawIntent.baseInput),
    segments: Array.isArray(rawIntent.segments) ? rawIntent.segments.map((seg: Record<string, unknown>) => ({
      min: Number(seg.min ?? 0),
      max: seg.max != null ? Number(seg.max) : null,
      rate: Number(seg.rate ?? 0),
    })) : [],
  } as IntentOperation;
```

#### Change 3: Add conditional_gate transformation case

```typescript
} else if (rawIntent.operation === 'conditional_gate') {
  operation = {
    operation: 'conditional_gate',
    condition: {
      left: normalizeIntentInput((rawIntent.condition as Record<string, unknown>)?.left ||
            (rawIntent as Record<string, unknown>).conditionMetric),
      operator: String((rawIntent.condition as Record<string, unknown>)?.operator ||
                (rawIntent as Record<string, unknown>).conditionOperator || '>='),
      right: normalizeIntentInput((rawIntent.condition as Record<string, unknown>)?.right ||
             { source: 'constant', value: Number((rawIntent as Record<string, unknown>).conditionThreshold ?? 0) }),
    },
    onTrue: rawIntent.onTrue ? normalizeIntentInput(rawIntent.onTrue) as IntentOperation
            : { operation: 'constant', value: Number((rawIntent as Record<string, unknown>).payoutPerUnit ?? 0) } as IntentOperation,
    onFalse: rawIntent.onFalse ? normalizeIntentInput(rawIntent.onFalse) as IntentOperation
             : { operation: 'constant', value: 0 } as IntentOperation,
  } as IntentOperation;
```

#### Change 4: Add scope_aggregate transformation case

```typescript
} else if (rawIntent.operation === 'scope_aggregate') {
  operation = {
    operation: 'scalar_multiply',
    input: normalizeIntentInput(rawIntent.metric || rawIntent.input),
    rate: Number(rawIntent.rate ?? 0),
  } as IntentOperation;
  // scope_aggregate resolves to scalar_multiply at entity level
  // The scope aggregation happens upstream in the engine (scopeAggregates in EntityData)
```

#### Change 5: Extract modifiers from INSIDE the intent object

After the operation assignment and BEFORE the existing `meta.cap`/`meta.floor` checks, add:

```typescript
// Extract modifiers from inside the intent (AI places them there)
const intentModifiers = Array.isArray(rawIntent.modifiers) ? rawIntent.modifiers : [];
for (const mod of intentModifiers) {
  const m = mod as Record<string, unknown>;
  if (m.modifier === 'cap' && m.maxValue != null) {
    modifiers.push({ modifier: 'cap' as const, maxValue: Number(m.maxValue), scope: 'per_period' as const });
  }
  if (m.modifier === 'floor' && m.minValue != null) {
    modifiers.push({ modifier: 'floor' as const, minValue: Number(m.minValue), scope: 'per_period' as const });
  }
}
```

### Summary of changes:

| What | Where | Why |
|------|-------|-----|
| `normalizeIntentInput` helper | New function in intent-transformer.ts | Converts AI source references to valid IntentSource/IntentOperation |
| piecewise_linear case | `transformFromMetadata` | Builds typed PiecewiseLinearOp with proper RatioOp for ratioInput |
| conditional_gate case | `transformFromMetadata` | Builds typed ConditionalGate with proper IntentSource refs |
| scope_aggregate case | `transformFromMetadata` | Converts to scalar_multiply (scope aggregation is upstream) |
| modifiers extraction | `transformFromMetadata` | Reads `rawIntent.modifiers[]` array, not just `meta.cap` |

### What NOT to change:
- `intent-executor.ts` — NO changes. The executor is correct for valid types.
- `intent-types.ts` — NO changes. Types already define the correct structures.
- `ai-plan-interpreter.ts` — NO changes to `convertComponent`. It correctly stores the raw AI intent in `metadata.intent`. The transformation happens in `transformFromMetadata`.
- `resolveSource` — NO changes. It correctly handles `source: "metric"` and `source: "constant"`. The fix is upstream (transformation), not downstream (resolution).

**Commit:** `git add -A && git commit -m "HF-187 Phase 2: Typed transformation bridge for new primitives" && git push origin dev`

---

## PHASE 3: BUILD VERIFICATION

1. `git stash` (stash any uncommitted work)
2. `npx tsc --noEmit` — must pass with zero errors
3. `npx next lint` — must pass
4. `git stash pop`
5. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev`
6. Confirm localhost:3000 responds

**Commit:** `git add -A && git commit -m "HF-187 Phase 3: Build verification" && git push origin dev`

---

## PHASE 4: REGRESSION CHECK

### 4A: Verify linear_function still works
The existing `additionalConstant + rate` check in transformFromMetadata must still fire for linear_function intents. This check runs BEFORE the new piecewise_linear case, so it should be unaffected.

```bash
grep -n 'additionalConstant' web/src/lib/calculation/intent-transformer.ts
```
Paste output — confirm the check still exists and is ABOVE the new cases.

### 4B: Verify legacy primitives are unaffected
Legacy primitives (tiered_lookup, matrix_lookup, percentage, conditional_percentage) go through `transformTierLookup`, `transformMatrixLookup`, `transformPercentage`, `transformConditionalPercentage` — NOT through `transformFromMetadata`. Confirm:

```bash
grep -n 'case.*tier_lookup\|case.*matrix_lookup\|case.*percentage\|case.*conditional_percentage' web/src/lib/calculation/intent-transformer.ts
```
Paste output — confirm these cases still route to their own functions.

---

## PROOF GATES — HARD

| # | Criterion | How to verify |
|---|-----------|---------------|
| G1 | `normalizeIntentInput` handles `source: "ratio"` → `operation: "ratio"` | `grep -A 10 'source.*ratio' web/src/lib/calculation/intent-transformer.ts` — paste output |
| G2 | `normalizeIntentInput` handles `source: "metric"` → pass through | Same grep — paste output showing metric pass-through |
| G3 | `normalizeIntentInput` handles string shorthand → metric source | Same grep or function body — paste output |
| G4 | piecewise_linear case builds PiecewiseLinearOp with `normalizeIntentInput` for ratioInput and baseInput | `grep -A 10 'piecewise_linear' web/src/lib/calculation/intent-transformer.ts` — paste output |
| G5 | Modifiers extracted from `rawIntent.modifiers` array | `grep -A 5 'intentModifiers\|rawIntent.modifiers' web/src/lib/calculation/intent-transformer.ts` — paste output |
| G6 | `npx tsc --noEmit` passes | Paste exit code |
| G7 | `npx next lint` passes | Paste exit code |
| G8 | `npm run build` succeeds | Paste exit code |
| G9 | linear_function `additionalConstant` check still exists and is ABOVE new cases | `grep -n 'additionalConstant\|piecewise_linear\|conditional_gate\|scope_aggregate' web/src/lib/calculation/intent-transformer.ts` — paste output showing line numbers proving order |

## PROOF GATES — SOFT

| # | Criterion | How to verify |
|---|-----------|---------------|
| S1 | No changes to intent-executor.ts | `git diff --name-only` — paste output showing NO executor changes |
| S2 | No changes to intent-types.ts | Same — no type changes |
| S3 | No changes to ai-plan-interpreter.ts | Same — no convertComponent changes |
| S4 | Korean Test: zero hardcoded field names | `grep -n 'consumable\|quota\|equipment\|revenue' web/src/lib/calculation/intent-transformer.ts` — paste output showing zero hits in new code (only in comments is acceptable) |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-187_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## FINAL STEP

```bash
gh pr create --base main --head dev --title "HF-187: Typed transformation bridge for new calculation primitives" --body "Platform fix: AI plan interpreter produces new primitive intents (piecewise_linear, conditional_gate, scope_aggregate) in a format the executor cannot consume. source:'ratio' must be transformed to operation:'ratio' with proper IntentSource wrappers. Modifiers inside intent must be extracted to component level. Adds normalizeIntentInput helper and explicit transformation cases for each new primitive in transformFromMetadata. No executor changes — the executor is correct for properly typed input."
```
