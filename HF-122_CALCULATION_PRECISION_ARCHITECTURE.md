# HF-122: Calculation Precision Architecture Implementation
## Category: HF (Hotfix)
## Date: March 10, 2026
## Platform: vialuce.ai
## Repository: CCAFRICA/spm-platform
## Branch: dev → preview, main → production
## Implements: DS-010 (Decision 122), governed by Decisions 123 & 124

---

## CC_STANDING_ARCHITECTURE_RULES.md v3.0 — MANDATORY

**Read CC_STANDING_ARCHITECTURE_RULES.md in the repo root COMPLETELY before proceeding. Version 3.0 includes:**
- Section 0: Governing Principles (Decisions 123 & 124)
- Principle 10: Calculation Precision Standard (Decision 122) — THIS IS WHAT YOU ARE IMPLEMENTING
- AP-25: Use native JavaScript `number` for financial calculation → use decimal.js
- G1-G6 evaluation required in Architecture Decision Record

---

## PROBLEM STATEMENT

The calculation engine uses JavaScript's native `number` type (IEEE 754 double-precision floating-point) for all arithmetic. This produces representational errors that accumulate across primitives and entities. Meridian's current result is MX$184,962.62; ground truth is MX$185,063. The MX$100.38 delta is entirely attributable to floating-point imprecision in the C5 Fleet Utilization ratio × scalar_multiply chain.

At 150,000 employees, this class of error produces ~MX$225,000/month in unexplained variance — material for SOC1 compliance and financial reporting.

---

## WHAT YOU ARE BUILDING

1. **Arbitrary-precision decimal arithmetic** in the intent executor (decimal.js)
2. **Per-component rounding** at plan-specified precision using Banker's Rounding (IEEE 754 ROUND_HALF_EVEN)
3. **outputPrecision field** on calculationIntent — inferred from plan payout structure
4. **Rounding trace** stored per component per entity in calculation_results metadata
5. **Entity total = sum of rounded components** (GAAP line-item presentation)

---

## GOVERNING PRINCIPLES EVALUATION (Decisions 123 & 124)

```
G1 - Standard Identification:
     IEEE 754-2019 (ROUND_HALF_EVEN), GAAP ASC 820 (line-item rounding),
     BIS 2018 (unbiased rounding), SOC1/SSAE 18 (audit transparency)

G2 - Architectural Embodiment:
     decimal.js configured with ROUND_HALF_EVEN at engine initialization.
     Rounding trace in calculation_results.metadata. Per-component precision
     from calculationIntent. Structural guarantee — not policy.

G3 - Traceability:
     Standard (IEEE 754) → Architecture (decimal.js config + rounding trace schema)
     → Implementation (intent-executor.ts, run-calculation.ts)

G4 - Discipline Identification:
     Numerical analysis (Goldberg 1991, Kahan 1996), statistical mathematics
     (Central Limit Theorem), financial accounting (GAAP)

G5 - Abstraction Test:
     Banker's Rounding applies to any numerical computation at scale.
     outputPrecision is a number (0-10), not a currency code.
     Would survive domain pivot. PASS.

G6 - Innovation Boundary:
     All findings peer-reviewed or standards-body-endorsed. Zero speculation.
```

---

## ARCHITECTURE DECISION RECORD

```
Problem: Engine uses IEEE 754 double, producing representational errors that
         accumulate to MX$100+ across 67 entities and scale linearly.

Option A: Replace native number with decimal.js in intent executor only
  - Scale test: 10x = ~670 entities, 100x arithmetic time but <5% total calc time
  - AI-first: No AI changes. Below deterministic boundary.
  - Transport: No change to data flow
  - Atomicity: Decimal→number conversion at output boundary, zero risk of partial state

Option B: Apply Math.round() to component outputs (no library change)
  - Scale test: Works at any scale
  - AI-first: N/A
  - Transport: N/A
  - Atomicity: Clean
  - Problem: Uses round-half-up (systematic bias). No rounding trace. Doesn't fix
    representational error in intermediate computation. Fails GP-1 (IEEE 754) and
    GP-2 (doesn't address root cause per Goldberg/Kahan).

Option C: Full decimal.js across entire codebase (import, engine, display)
  - Scale test: Overkill — import and display don't need decimal precision
  - Over-engineering that doesn't improve outcomes

CHOSEN: Option A — decimal.js in intent executor only. Precision where it matters
        (primitive chain), native number everywhere else (import, display, metadata).
REJECTED: Option B — fails Governing Principles (bias, no trace, no root cause fix).
REJECTED: Option C — violates Scale by Design (unnecessary overhead in non-financial paths).
```

---

## STANDING RULES — ENFORCED THIS HF

| # | Rule | Enforcement |
|---|------|-------------|
| Decision 122 | Banker's Rounding, decimal.js, per-component precision, rounding trace | This is the decision being implemented |
| FP-49 | SQL Schema Verification | Verify against SCHEMA_REFERENCE_LIVE.md before any SQL |
| FP-60 | Production Evidence Only | Completion report must include Vercel Runtime Log output + GT comparison |
| FP-61 | GT-First Protocol | Compare against GT after every calculation run |
| FP-62 | No Proximity Celebration | MX$185,063 exact. Decision 95. |
| FP-64 | Both Gate Branches | Verify 0-incident AND >0-incident employees |
| AP-25 | No native number for financial calc | This is the anti-pattern being eliminated |
| Korean Test | outputPrecision is a number, not a currency | Zero locale awareness in engine |

---

## GROUND TRUTH VERIFICATION ANCHORS

| Employee | ID | Variant | C1 | C2 | C3 | C4 | C5 | Total |
|---|---|---|---|---|---|---|---|---|
| Claudia Cruz Ramírez | 70001 | Standard | 800 | 100 | 0 | 300 | 373 | **1,573** |
| Antonio López Hernández | 70010 | Senior | 1,600 | 700 | 2,800 | 500 | 663 | **6,263** |
| Alma Sánchez Morales | 70129 | Standard | 0 | 0 | 1,600 | 0 | 450 | **2,050** |

**Component Totals (GT — January 2025, 67 employees):**

| Component | Primitive | GT Total | outputPrecision |
|---|---|---|---|
| C1 Revenue Performance | bounded_lookup_2d | MX$44,000 | 0 (whole MXN — outputs: 0, 200, 300, 500, 800, 1000, 1100, 1300, 1500, 1600, 1800, 2200, 2500, 3000) |
| C2 On-Time Delivery | bounded_lookup_1d | MX$15,550 | 0 (whole MXN — outputs: 0, 100, 200, 300, 400, 500, 700) |
| C3 New Accounts | scalar_multiply | MX$69,900 | 0 (whole MXN — rate × count = whole amount) |
| C4 Safety Record | conditional_gate | MX$20,700 | 0 (whole MXN — onTrue: 300/500, onFalse: 0) |
| C5 Fleet Utilization | ratio → scalar_multiply | MX$34,913 | 0 (whole MXN — GT file shows whole numbers) |
| **Grand Total** | | **MX$185,063** | |

**All five Meridian components have outputPrecision = 0 (whole MXN).** The GT file contains only whole numbers. This is the evidence the AI plan interpreter would use to infer precision.

---

## MERIDIAN CONTEXT

- **Tenant ID:** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
- **Plan ID:** `d2425064-f107-4e58-881c-97de05403b0c`
- **Period ID:** `bc2ec62b-e915-44e6-8b44-34f911d6e913`
- **Entities:** 67 employees, 79 total (incl. 12 hubs)
- **Plan status:** 'active'

---

## PHASE 0: DIAGNOSTIC — READ BEFORE ANY CODE

### 0A: Read the current intent executor

```bash
echo "=== INTENT EXECUTOR — full file ==="
cat web/src/lib/calculation/intent-executor.ts

echo ""
echo "=== INTENT TYPES — full file ==="
cat web/src/lib/calculation/intent-types.ts
```

### 0B: Read how run-calculation calls the executor and sums components

```bash
echo "=== RUN-CALCULATION — component summation ==="
grep -n -B 5 -A 15 "total_payout\|totalPayout\|componentResult\|componentPayout\|sum.*component" web/src/lib/calculation/run-calculation.ts | head -100

echo ""
echo "=== RUN-CALCULATION — how component results are collected ==="
grep -n "push\|payout\|component.*result" web/src/lib/calculation/run-calculation.ts | head -40
```

### 0C: Read how calculation_results are written

```bash
echo "=== CALCULATION RESULTS WRITE ==="
grep -n -B 5 -A 20 "calculation_results\|insert.*result\|upsert.*result" web/src/lib/calculation/run-calculation.ts | head -60

echo ""
echo "=== METADATA SHAPE IN RESULTS ==="
grep -n "metadata\|components.*json\|trace" web/src/lib/calculation/run-calculation.ts | head -30
```

### 0D: Check if decimal.js is already in the project

```bash
echo "=== EXISTING DECIMAL USAGE ==="
grep -rn "decimal\|Decimal\|decimal\.js\|big\.js\|bignumber" web/package.json web/src/ --include="*.ts" --include="*.tsx" --include="*.json" | grep -v node_modules | head -20
```

### 0E: Read the Meridian plan's component structure to understand where outputPrecision will go

```bash
echo "=== MERIDIAN PLAN COMPONENTS (first 200 chars each) ==="
# Use the Supabase service role to read the actual plan
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('rule_sets').select('components').eq('id', 'd2425064-f107-4e58-881c-97de05403b0c').single();
  const components = data.components;
  if (Array.isArray(components)) {
    components.forEach((c, i) => {
      console.log('--- Component', i, '---');
      console.log('Type:', c.componentType);
      console.log('Label:', c.label || c.name);
      if (c.calculationIntent) {
        console.log('Intent operation:', c.calculationIntent.operation || JSON.stringify(c.calculationIntent).substring(0, 100));
      }
      // Check variants
      if (c.variants) {
        c.variants.forEach((v, vi) => {
          console.log('  Variant', vi, ':', v.variantName || v.matchValue);
          if (v.intent?.operation) console.log('    Intent:', v.intent.operation);
          if (v.components) v.components.forEach((vc, vci) => {
            console.log('    SubComp', vci, ':', vc.componentType, vc.calculationIntent?.operation || '');
          });
        });
      }
    });
  }
})();
"
```

**COMMIT DIAGNOSTIC:** Paste the FULL output of 0A through 0E before proceeding. This is a proof gate. Do not write any code until you understand:

1. What types does the intent executor use for arithmetic? (native number throughout?)
2. How are component results collected and summed to entity total?
3. Where are calculation_results written and what metadata shape do they use?
4. Is decimal.js already in the project?
5. What does the Meridian plan's component/variant/intent structure look like?

---

## PHASE 1: INSTALL decimal.js AND CREATE PRECISION TYPES

### 1A: Install decimal.js

```bash
cd web
npm install decimal.js
cd ..
```

### 1B: Add outputPrecision to intent types

In `web/src/lib/calculation/intent-types.ts`, add:

```typescript
/** Output precision specification (Decision 122 — DS-010) */
export interface OutputPrecision {
  /** Number of decimal places to round to (0-10) */
  decimalPlaces: number;
  /** Rounding method — default: half_even (Banker's Rounding, IEEE 754) */
  roundingMethod: 'half_even' | 'half_up' | 'floor' | 'ceil' | 'truncate';
  /** How precision was determined (metadata for audit) */
  source: 'inferred_from_outputs' | 'explicit_in_plan' | 'default_currency' | 'user_override';
}

/** Rounding trace per component (stored in calculation_results.metadata) */
export interface RoundingTrace {
  componentIndex: number;
  label: string;
  rawValue: number;
  roundedValue: number;
  roundingAdjustment: number;
  precision: OutputPrecision;
}

/** Default output precision when not specified in plan */
export const DEFAULT_OUTPUT_PRECISION: OutputPrecision = {
  decimalPlaces: 2,
  roundingMethod: 'half_even',
  source: 'default_currency'
};
```

**IMPORTANT:** The `OutputPrecision` interface must be added WITHOUT changing any existing type signatures. Existing code continues to work. This phase is purely additive.

### 1C: Create decimal utility module

Create `web/src/lib/calculation/decimal-precision.ts`:

This module is the ONLY place where decimal.js is imported and configured. All other calculation code imports from this module.

```typescript
import Decimal from 'decimal.js';
import { OutputPrecision, RoundingTrace, DEFAULT_OUTPUT_PRECISION } from './intent-types';

// Configure decimal.js for financial calculation (Decision 122)
// IEEE 754-2019 Section 4.3.1: roundTiesToEven
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -9,
  toExpPos: 21,
});

/** Convert a native number to Decimal for precise arithmetic */
export function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

/** Convert Decimal back to native number (at output boundary only) */
export function toNumber(value: Decimal): number {
  return value.toNumber();
}

/** Round a component output per its outputPrecision and return the trace */
export function roundComponentOutput(
  rawValue: Decimal,
  componentIndex: number,
  label: string,
  precision?: OutputPrecision
): { rounded: Decimal; trace: RoundingTrace } {
  const prec = precision || DEFAULT_OUTPUT_PRECISION;
  
  const roundingMode = getRoundingMode(prec.roundingMethod);
  const rounded = rawValue.toDecimalPlaces(prec.decimalPlaces, roundingMode);
  
  return {
    rounded,
    trace: {
      componentIndex,
      label,
      rawValue: rawValue.toNumber(),
      roundedValue: rounded.toNumber(),
      roundingAdjustment: rounded.minus(rawValue).toNumber(),
      precision: prec,
    }
  };
}

function getRoundingMode(method: string): Decimal.Rounding {
  switch (method) {
    case 'half_even': return Decimal.ROUND_HALF_EVEN;
    case 'half_up': return Decimal.ROUND_HALF_UP;
    case 'floor': return Decimal.ROUND_FLOOR;
    case 'ceil': return Decimal.ROUND_CEIL;
    case 'truncate': return Decimal.ROUND_DOWN;
    default: return Decimal.ROUND_HALF_EVEN;
  }
}
```

```bash
git add -A && git commit -m "HF-122 Phase 1: decimal.js + precision types + decimal utility module" && git push origin dev
```

**PROOF GATE 1:**
- [ ] `npm run build` exits 0 — paste final line
- [ ] No existing tests break — paste test output if tests exist
- [ ] decimal.js in package.json — paste the line

---

## PHASE 2: REFACTOR INTENT EXECUTOR TO USE DECIMAL

**This is the core change.** Every primitive operation in `intent-executor.ts` must:
1. Accept Decimal inputs (converted from number at entry)
2. Perform arithmetic using Decimal methods (.plus, .minus, .mul, .div)
3. Return Decimal output (converted to number only at the component boundary in run-calculation.ts)

### Key Patterns:

```typescript
// BEFORE (native number — AP-25 violation)
function executeBoundedLookup1D(input: number, boundaries: any[], outputs: number[]): number {
  for (let i = 0; i < boundaries.length; i++) {
    if (input >= boundaries[i].min && (boundaries[i].max === null || input < boundaries[i].max)) {
      return outputs[i];
    }
  }
  return 0;
}

// AFTER (Decimal — Decision 122 compliant)
function executeBoundedLookup1D(input: Decimal, boundaries: any[], outputs: number[]): Decimal {
  for (let i = 0; i < boundaries.length; i++) {
    const min = toDecimal(boundaries[i].min);
    const max = boundaries[i].max !== null ? toDecimal(boundaries[i].max) : null;
    if (input.gte(min) && (max === null || input.lt(max))) {
      return toDecimal(outputs[i]);
    }
  }
  return toDecimal(0);
}
```

### Rules for the refactor:
1. **Boundary values (from plan JSON) are converted to Decimal ONCE** — at the start of execution, not per-entity. Cache them.
2. **Comparison operators** use Decimal methods: `.gte()`, `.lt()`, `.eq()`, `.gt()`, `.lte()`
3. **Arithmetic operators** use Decimal methods: `.plus()`, `.minus()`, `.mul()`, `.div()`
4. **Return values** are Decimal — the caller (run-calculation.ts) handles conversion
5. **The conditional_gate evaluator** must use Decimal for condition evaluation (left.eq(right) for "=", left.gte(right) for ">=", etc.)
6. **The `=` operator handling from HF-121 is preserved** — case '=': falls through to case '=='

### Performance consideration:
- Boundary/output Decimal conversion should happen ONCE per batch, not per entity
- Use a Map<number, Decimal> cache for frequently used constants (0, 1, outputs[])

```bash
git add -A && git commit -m "HF-122 Phase 2: refactor intent executor to Decimal arithmetic" && git push origin dev
```

**PROOF GATE 2:**
- [ ] `npm run build` exits 0 — paste final line
- [ ] All seven primitive types converted (bounded_lookup_1d, bounded_lookup_2d, scalar_multiply, conditional_gate, aggregate, ratio, constant) — paste grep showing Decimal imports/usage in each
- [ ] No native arithmetic operators (+, -, *, /) remain in primitive functions — paste grep confirming

---

## PHASE 3: INTEGRATE PER-COMPONENT ROUNDING IN run-calculation.ts

### What to change:

1. **After the intent executor returns a Decimal result for a component**, apply `roundComponentOutput()` using the component's outputPrecision
2. **Collect rounding traces** per entity
3. **Sum rounded values** (not raw values) to produce entity total
4. **Store rounding trace** in calculation_results.metadata

### Determining outputPrecision for Meridian:

For this HF, we set outputPrecision directly based on the evidence in the GT file. ALL five Meridian components have whole-MXN outputs → outputPrecision = { decimalPlaces: 0, roundingMethod: 'half_even', source: 'inferred_from_outputs' }.

**How to set it:** When the component's calculationIntent does not include an outputPrecision field, infer it from the component's outputs/rates:
- If ALL output values in boundaries/outputs/onTrue/onFalse are integers → decimalPlaces: 0
- If output values have up to 2 decimal places → decimalPlaces: 2
- Otherwise → use DEFAULT_OUTPUT_PRECISION (decimalPlaces: 2)

This inference happens at calculation time by examining the plan structure — NOT by hardcoding Meridian's precision. The Korean Test applies: a Korean plan with whole-won outputs would get the same inference.

### Entity total:

```typescript
// AFTER rounding each component
const roundedTotal = componentTraces.reduce(
  (sum, trace) => sum.plus(toDecimal(trace.roundedValue)),
  toDecimal(0)
);
// Entity total_payout = roundedTotal.toNumber()
```

### Rounding trace in metadata:

```typescript
metadata: {
  ...existingMetadata,
  roundingTrace: {
    rawTotal: rawTotal.toNumber(),
    roundedTotal: roundedTotal.toNumber(),
    totalRoundingAdjustment: roundedTotal.minus(rawTotal).toNumber(),
    components: componentTraces  // Array of RoundingTrace objects
  }
}
```

```bash
git add -A && git commit -m "HF-122 Phase 3: per-component rounding with trace in calculation results" && git push origin dev
```

**PROOF GATE 3:**
- [ ] `npm run build` exits 0
- [ ] Rounding trace appears in metadata structure — paste the type definition or code showing where it's written
- [ ] Entity total computed from rounded components — paste the summation code

---

## PHASE 4: CALCULATE AND VERIFY AGAINST GT

### Step 1: Deploy and run calculation

```bash
# Ensure latest code is deployed
# Navigate to vialuce.ai → Meridian → Calculate → Run for January 2025
```

### Step 2: Check Vercel Runtime Logs

Look for the grand total in the log line: `[CalcAPI] COMPLETE: ... total=XXXXX`

**Expected: 185063 (or very close — if outputPrecision inference works correctly)**

### Step 3: GT Component Comparison (FP-61 — MANDATORY)

**SCHEMA VERIFICATION (FP-49):** Before ANY SQL, verify:
```bash
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'calculation_results' ORDER BY ordinal_position;
```

Then compare component totals:

| Component | GT Total | Engine Total | Delta |
|---|---|---|---|
| C1 Revenue Performance | MX$44,000 | ? | ? |
| C2 On-Time Delivery | MX$15,550 | ? | ? |
| C3 New Accounts | MX$69,900 | ? | ? |
| C4 Safety Record | MX$20,700 | ? | ? |
| C5 Fleet Utilization | MX$34,913 | ? | ? |
| **Grand Total** | **MX$185,063** | ? | ? |

### Step 4: Verify Three Anchor Entities

| Employee | Expected C4 | Expected Total |
|---|---|---|
| Claudia (70001) | 300 | 1,573 |
| Antonio (70010) | 500 | 6,263 |
| Alma (70129) | **0** | 2,050 |

### Step 5: Verify Rounding Trace

Query one entity's calculation_results.metadata and confirm the rounding trace is present:

```bash
# Verify rounding trace exists in metadata
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('calculation_results')
    .select('metadata')
    .eq('entity_id', /* Claudia's entity UUID */)
    .eq('period_id', 'bc2ec62b-e915-44e6-8b44-34f911d6e913')
    .single();
  console.log('Rounding trace:', JSON.stringify(data?.metadata?.roundingTrace, null, 2));
})();
"
```

**Expected:** A roundingTrace object with rawTotal, roundedTotal, totalRoundingAdjustment, and per-component traces.

### Step 6: Verify Both Gate Branches (FP-64)

- At least one 0-incident employee has C4 > 0 (gate PASS)
- At least one >0-incident employee has C4 = 0 (gate FAIL)

---

## PHASE 5: PERFORMANCE BENCHMARK

**Decision 122 requires:** Decimal path must not exceed 2x total calculation time vs. native.

```bash
echo "=== CALCULATION TIMING ==="
# Check Vercel Runtime Logs for the COMPLETE line
# Compare total time against previous run (pre-decimal)
# Previous: ~600ms for 67 entities
# Acceptable: up to 1200ms
```

If timing exceeds 2x, investigate:
- Are boundary values being converted to Decimal per-entity instead of per-batch?
- Are Decimal constants (0, 1) being recreated instead of cached?

---

## PHASE 6: COMPLETION REPORT

### Mandatory Structure

```
HF-122 COMPLETION REPORT
=========================

PHASE 0: DIAGNOSTIC
- [ ] Pasted output of 0A-0E
- [ ] Identified current arithmetic type usage
- [ ] Confirmed decimal.js was/wasn't already in project

PHASE 1: LIBRARY + TYPES
- [ ] decimal.js in package.json (paste line)
- [ ] OutputPrecision interface in intent-types.ts (paste)
- [ ] decimal-precision.ts created with ROUND_HALF_EVEN config (paste)
- [ ] npm run build exits 0

PHASE 2: INTENT EXECUTOR REFACTOR
- [ ] All 7 primitives use Decimal arithmetic (paste grep)
- [ ] No native +/-/*// in primitive functions (paste grep)
- [ ] Conditional gate preserves HF-121 = operator fix
- [ ] npm run build exits 0

PHASE 3: PER-COMPONENT ROUNDING
- [ ] outputPrecision inference from plan structure (paste code)
- [ ] roundComponentOutput called per component (paste code)
- [ ] Entity total = sum of rounded values (paste code)
- [ ] Rounding trace in calculation_results.metadata (paste schema)
- [ ] npm run build exits 0

PHASE 4: GT VERIFICATION
- [ ] Grand total: MX$_____ (must be MX$185,063)
- [ ] C1 total: MX$_____ (GT: 44,000)
- [ ] C2 total: MX$_____ (GT: 15,550)
- [ ] C3 total: MX$_____ (GT: 69,900)
- [ ] C4 total: MX$_____ (GT: 20,700)
- [ ] C5 total: MX$_____ (GT: 34,913)
- [ ] Claudia (70001): C4=___ Total=___ (expected: 300, 1,573)
- [ ] Antonio (70010): C4=___ Total=___ (expected: 500, 6,263)
- [ ] Alma (70129): C4=___ Total=___ (expected: 0, 2,050)
- [ ] Rounding trace present in metadata (paste sample)
- [ ] Gate PASS cases verified (C4 > 0 for 0-incident employees)
- [ ] Gate FAIL cases verified (C4 = 0 for >0-incident employees)

PHASE 5: PERFORMANCE
- [ ] Calculation time: ___ms (previous: ~600ms, max acceptable: 1200ms)

DEPLOYMENT
- [ ] PR created: `gh pr create --base main --head dev --title "HF-122: Calculation Precision Architecture (Decision 122)" --body "Implements DS-010: decimal.js arbitrary-precision arithmetic, Banker's Rounding (IEEE 754 ROUND_HALF_EVEN), per-component rounding at plan-inferred precision, rounding trace in calculation_results metadata. Governed by Decisions 123/124. Targets MX$185,063 exact reconciliation (Decision 95)."`

PRODUCTION VERIFICATION (Andrew — post-merge)
- [ ] Navigate to vialuce.ai → Meridian → Calculate → Run January 2025
- [ ] Verify grand total = MX$185,063
- [ ] Verify Alma (70129) C4 = 0, Total = 2,050
- [ ] Verify Claudia (70001) Total = 1,573
- [ ] Verify Antonio (70010) Total = 6,263
- [ ] Inspect one entity's calculation_results.metadata for rounding trace
```

**REJECTION CRITERIA:**
- Any phase marked PASS without pasted evidence
- Grand total not exactly MX$185,063
- Alma's C4 not exactly 0
- Native number arithmetic remaining in any primitive function
- Rounding trace not present in calculation_results.metadata
- Performance exceeds 2x threshold without documented optimization plan
- Any hardcoded precision value specific to Meridian (must be inferred from plan structure)

---

## BUILD SEQUENCE REMINDERS

1. **Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000** before completion report.
2. **Git from repo root (`spm-platform`)**, NOT `web/`.
3. **Commit + push after every phase** — not just at the end.
4. **All testing on vialuce.ai** — localhost PASS ≠ production PASS.
5. **Final step:** `gh pr create --base main --head dev` with descriptive title + body.

---

## ANTI-PATTERN REMINDERS

| Pattern | What NOT to Do |
|---|---|
| AP-25 | Do NOT leave native `number` arithmetic in any primitive function |
| FP-49 | Do NOT write SQL referencing columns without schema verification |
| FP-60 | Do NOT claim PASS without pasted production evidence |
| FP-61 | Do NOT diagnose issues without GT comparison first |
| FP-62 | Do NOT describe any total as "close" — MX$185,063 or wrong |
| FP-64 | Do NOT test only one branch of conditional gate |

---

## STANDING QUESTION (Korean Test)

> If a Korean logistics company with Korean column names and whole-won payout tables uploaded their plan, would the outputPrecision inference produce decimalPlaces: 0?

The inference examines the plan's output VALUES (are they integers?), not the currency code. If the Korean plan has outputs [0, 5000, 10000, 15000], the inference returns decimalPlaces: 0 — same as Meridian. If the plan has outputs [0, 5000.50, 10000.75], it returns decimalPlaces: 2.

If your outputPrecision inference uses ANY currency-specific or locale-specific logic, it fails the Korean Test. Stop and redesign.

---

*End of HF-122 prompt. This implements the foundation for Decision 95: 100% reconciliation. MX$185,063 exact.*
