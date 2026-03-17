# HF-123: Tier Lookup Structural Diagnostic and Fix
## Category: HF (Hotfix)
## Date: March 10, 2026
## Platform: vialuce.ai
## Repository: CCAFRICA/spm-platform
## Branch: dev → preview, main → production
## Governed by: Decisions 122, 123, 124

---

## CC_STANDING_ARCHITECTURE_RULES.md v3.0 — MANDATORY

**Read CC_STANDING_ARCHITECTURE_RULES.md in the repo root COMPLETELY before proceeding.**

---

## PROBLEM STATEMENT — STRUCTURAL, NOT TENANT-SPECIFIC

Four of five Meridian components produce exact GT results after HF-122 (Decision 122 — Banker's Rounding, decimal.js). C2 On-Time Delivery is MX$100 short. The legacy `evaluateTierLookup` function produces payout values (350, 600, 1200) that DO NOT EXIST in the plan's output set (0, 100, 200, 300, 400, 500, 700).

**This is not a Meridian problem. This is a structural problem with how the engine evaluates tier lookups.** If the evaluator produces values not in the plan's output set, it is computing something other than what the plan specifies. This would affect ANY tenant whose plan has a `bounded_lookup_1d` / `tier_lookup` component.

**The fix must be structural:** the tier_lookup evaluator must return discrete output values from the plan's tier table, for any plan, any tenant, any language.

---

## GOVERNING PRINCIPLES EVALUATION (Decisions 123 & 124)

```
G1 - Standard Identification:
     GAAP (calculation must match plan specification).
     SOC1 (reproducible, auditable results).
     Decision 95 (100% reconciliation).

G2 - Architectural Embodiment:
     Tier lookup returns discrete outputs from the plan's tier table.
     No interpolation, no multiplication, no inference.
     The plan says "if metric is in [80%, 90%), pay MX$200" → engine pays MX$200.

G3 - Traceability:
     Plan tier table → tierConfig in rule_sets.components → evaluateTierLookup
     → discrete output → rounding (Decision 122) → calculation_results

G4 - Discipline Identification:
     Discrete mathematics — tier lookups are step functions (piecewise constant),
     not continuous functions. The output is defined at each boundary interval,
     not interpolated between them.

G5 - Abstraction Test:
     Step functions are universal. Tax brackets, insurance tiers, shipping rates,
     commission tiers — all are discrete lookups. The fix applies to any domain.

G6 - Innovation Boundary:
     Step functions are mathematically well-defined. No speculation.
```

---

## ARCHITECTURE DECISION RECORD

```
Problem: evaluateTierLookup produces values not in the plan's output set.
         The function is computing something structurally different from what
         the plan specifies. Need to diagnose WHAT it computes and fix it to
         return discrete tier outputs.

Option A: Diagnostic-first — read the function, log what it receives and
          computes, then fix based on evidence
  - Scale test: N/A (diagnostic)
  - AI-first: No AI involvement
  - Korean Test: Fix will be structural (return plan outputs, not compute values)
  - Atomicity: Diagnostic has no side effects

Option B: Replace legacy evaluateTierLookup with intent path for all tenants
  - Scale test: Intent executor already handles bounded_lookup_1d correctly
  - Risk: Intent path has its own issues (C4 gate, 0% concordance)
  - Premature: need to understand why legacy is wrong first

CHOSEN: Option A — diagnostic first, then structural fix.
REJECTED: Option B — replacing the legacy path without understanding it risks
          introducing new bugs while fixing old ones.
```

---

## STANDING RULES — ENFORCED THIS HF

| # | Rule | Enforcement |
|---|------|-------------|
| FP-49 | SQL Schema Verification | Verify against SCHEMA_REFERENCE_LIVE.md before any SQL |
| FP-60 | Production Evidence Only | Pasted Vercel Runtime Log output + GT comparison |
| FP-61 | GT-First Protocol | Compare against GT after every calculation run |
| FP-62 | No Proximity Celebration | MX$185,063 exact |
| FP-64 | Both Gate Branches | Verify full output set — not just one tier |
| AP-25 | Decimal arithmetic | Any new arithmetic must use decimal.js (HF-122) |
| Korean Test | Zero field name matching | Fix evaluates tier structure, not "On-Time Delivery" |

---

## GROUND TRUTH — C2 ON-TIME DELIVERY

**GT output set for C2:** 0, 100, 200, 300, 400, 500, 700

These are discrete payout values. The plan's tier table maps On-Time Delivery percentage ranges to fixed MXN payouts. The engine's current C2 output includes values (350, 600, 1200) that do NOT appear in this set.

**GT component total:** MX$15,550
**Engine component total:** MX$15,450
**Delta:** -MX$100

**Verification anchors:**

| Employee | ID | Variant | C2 GT | C2 Engine (current) |
|---|---|---|---|---|
| Claudia Cruz Ramírez | 70001 | Standard | 100 | 100 |
| Antonio López Hernández | 70010 | Senior | 700 | ? (may be wrong — Senior tier) |
| Alma Sánchez Morales | 70129 | Standard | 0 | ? |

**Full GT totals for reference:**

| Component | GT Total | Engine Total | Delta |
|---|---|---|---|
| C1 Revenue Performance | MX$44,000 | MX$44,000 | 0 |
| C2 On-Time Delivery | MX$15,550 | MX$15,450 | **-100** |
| C3 New Accounts | MX$69,900 | MX$69,900 | 0 |
| C4 Safety Record | MX$20,700 | MX$20,700 | 0 |
| C5 Fleet Utilization | MX$34,913 | MX$34,913 | 0 |
| **Grand Total** | **MX$185,063** | **MX$184,963** | **-100** |

---

## MERIDIAN CONTEXT

- **Tenant ID:** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
- **Plan ID:** `d2425064-f107-4e58-881c-97de05403b0c`
- **Period ID:** `bc2ec62b-e915-44e6-8b44-34f911d6e913`

---

## PHASE 0: DIAGNOSTIC — READ BEFORE ANY CODE

**This is the most important phase. Do NOT skip. Do NOT modify any logic yet.**

### 0A: Read the evaluateTierLookup function — EVERY LINE

```bash
echo "=== FULL evaluateTierLookup FUNCTION ==="
grep -n -A 80 "function evaluateTierLookup\|evaluateTierLookup =" web/src/lib/calculation/run-calculation.ts

echo ""
echo "=== WHERE IT IS CALLED ==="
grep -n "evaluateTierLookup" web/src/lib/calculation/run-calculation.ts
```

### 0B: Read what C2's component structure looks like in the plan

```bash
echo "=== MERIDIAN C2 COMPONENT STRUCTURE ==="
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('rule_sets').select('components').eq('id', 'd2425064-f107-4e58-881c-97de05403b0c').single();
  const comps = data.components;
  // Find C2 (On-Time Delivery — component index 1)
  // Could be in variants structure or flat
  if (Array.isArray(comps.variants || comps)) {
    const variants = comps.variants || comps;
    // Walk structure to find component index 1
    JSON.stringify(comps, null, 2).split('\n').forEach((line, i) => console.log(line));
  } else {
    console.log(JSON.stringify(comps, null, 2));
  }
})();
" 2>&1 | head -200
```

### 0C: Read the C2 calculationIntent specifically

```bash
echo "=== C2 CALCULATION INTENT ==="
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('rule_sets').select('components').eq('id', 'd2425064-f107-4e58-881c-97de05403b0c').single();
  const comps = data.components;
  // Extract C2 from each variant
  function walkForC2(obj, path) {
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => walkForC2(item, path + '[' + i + ']'));
    } else if (obj && typeof obj === 'object') {
      // Is this component index 1?
      if (obj.componentIndex === 1 || obj.order === 1) {
        console.log('=== FOUND C2 at', path, '===');
        console.log('componentType:', obj.componentType);
        console.log('tierConfig:', JSON.stringify(obj.tierConfig, null, 2));
        console.log('calculationIntent:', JSON.stringify(obj.calculationIntent, null, 2));
      }
      // Check for name containing 'delivery' or 'entrega' or 'tiempo'
      if (obj.name && (obj.name.toLowerCase().includes('delivery') || obj.name.toLowerCase().includes('entrega') || obj.name.toLowerCase().includes('tiempo'))) {
        console.log('=== FOUND C2 BY NAME at', path, ':', obj.name, '===');
        console.log('componentType:', obj.componentType);
        console.log('tierConfig:', JSON.stringify(obj.tierConfig, null, 2));
        console.log('calculationIntent:', JSON.stringify(obj.calculationIntent, null, 2));
      }
      Object.keys(obj).forEach(k => walkForC2(obj[k], path + '.' + k));
    }
  }
  walkForC2(comps, 'root');
})();
"
```

### 0D: Read the intent executor's bounded_lookup_1d to compare

```bash
echo "=== INTENT EXECUTOR bounded_lookup_1d ==="
grep -n -A 40 "bounded_lookup_1d\|executeBoundedLookup1D" web/src/lib/calculation/intent-executor.ts
```

### 0E: Check what metric value C2 receives for a specific employee

```bash
echo "=== METRIC RESOLUTION FOR C2 ==="
grep -n "metric\|Pct_Entregas\|delivery\|entrega\|tiempo" web/src/lib/calculation/run-calculation.ts | head -20
```

**COMMIT DIAGNOSTIC:** Paste the FULL output of 0A through 0E before proceeding. Analyze:

1. **What does `evaluateTierLookup` do with `tierConfig.tiers[].value`?** Does it return `value` directly (correct — discrete output)? Or does it multiply `value × metric` or `value × rate` (incorrect — produces values not in the output set)?
2. **What does the C2 tierConfig look like?** What are the tiers, boundaries, and values?
3. **What does the C2 calculationIntent look like?** What boundaries and outputs does it specify?
4. **Do the tierConfig values match the calculationIntent outputs?** If they differ, which one matches the GT output set?
5. **What metric value does C2 receive?** Is it a raw percentage (e.g., 85.5) or a ratio (e.g., 0.855)?

---

## PHASE 1: ADD DIAGNOSTIC LOGGING

Based on Phase 0 findings, add a `console.log` inside `evaluateTierLookup` that shows:

```typescript
console.log('[TIER-DEBUG]', JSON.stringify({
  componentName: /* component name/label if available */,
  metricValue: /* the input metric value */,
  matchedTierIndex: /* which tier was matched */,
  matchedTierMin: /* tier min boundary */,
  matchedTierMax: /* tier max boundary */,
  tierValue: /* the tier's value field */,
  returnedPayout: /* what the function actually returns */,
  // If function does arithmetic, show the computation:
  computation: /* e.g., "tierValue * metricValue" or "tierValue directly" */
}));
```

Deploy and calculate:

```bash
git add -A && git commit -m "HF-123: diagnostic logging for tier_lookup evaluation" && git push origin dev
```

**PROOF GATE 1:** Paste Vercel Runtime Log output showing `[TIER-DEBUG]` lines for at least 3 entities' C2 evaluation. Identify:
- What values does `tierValue` contain? Are they the GT outputs (0, 100, 200, 300, 400, 500, 700)?
- What does the function return? Is it `tierValue` directly or `tierValue × something`?
- For entities where the returned value is 350, 600, or 1200 — what computation produced that?

---

## PHASE 2: FIX THE STRUCTURAL ISSUE

**Based on diagnostic evidence, fix the evaluator.**

### The structural rule for tier lookups:

A tier/threshold lookup is a STEP FUNCTION (piecewise constant). The input falls into a boundary interval. The output is the discrete value associated with that interval. There is no multiplication, interpolation, or rate application.

```
If metric ∈ [80%, 90%) → pay MX$200
If metric ∈ [90%, 95%) → pay MX$300
If metric ∈ [95%, 100%) → pay MX$400
```

The engine must return 200, 300, or 400 — NOT metric × 200, NOT 200 × some_rate.

### The fix must:

1. **Return the tier's output value directly** — no multiplication, no rate application
2. **Use Decimal arithmetic** (Decision 122 / AP-25) for any comparison operations
3. **Pass the Korean Test** — no field name matching, no "delivery" checks
4. **Handle all boundary conditions** — below minimum, above maximum, exact boundary values
5. **Match the intent executor's bounded_lookup_1d behavior** — both paths should produce identical results for the same input

### Important: Check if the issue is in the tierConfig VALUES or in the FUNCTION

- **If tierConfig contains values like [0.35, 0.60, 1.20]** — these are RATES, not payouts. The function may be correctly multiplying rate × base. The bug is in how the plan interpreter stored the config (rates vs payouts). The fix is in the plan config, not the evaluator.
- **If tierConfig contains values like [0, 100, 200, 300, 400, 500, 700]** — these are correct payout values. The function is incorrectly doing arithmetic. The fix is in the evaluator.
- **If tierConfig has a DIFFERENT structure than expected** — the function may be reading the wrong field. The fix is in how the function reads the config.

**DO NOT ASSUME — the diagnostic tells you which case it is.**

```bash
git add -A && git commit -m "HF-123: fix tier_lookup to return discrete plan outputs" && git push origin dev
```

---

## PHASE 3: CALCULATE AND VERIFY AGAINST GT

### Step 1: Run Calculation

Navigate to vialuce.ai → Meridian → Calculate → Run for January 2025.

### Step 2: GT Component Comparison (FP-61)

**SCHEMA VERIFICATION (FP-49):** Before ANY SQL:
```bash
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'calculation_results' ORDER BY ordinal_position;
```

| Component | GT Total | Engine Total | Delta |
|---|---|---|---|
| C1 Revenue Performance | MX$44,000 | ? | ? |
| C2 On-Time Delivery | MX$15,550 | ? | ? |
| C3 New Accounts | MX$69,900 | ? | ? |
| C4 Safety Record | MX$20,700 | ? | ? |
| C5 Fleet Utilization | MX$34,913 | ? | ? |
| **Grand Total** | **MX$185,063** | ? | ? |

### Step 3: Verify Anchor Entities

| Employee | Expected Total |
|---|---|
| Claudia (70001) | 1,573 |
| Antonio (70010) | 6,263 |
| Alma (70129) | 2,050 |

### Step 4: Verify C2 Output Set

```bash
echo "=== C2 PAYOUT DISTRIBUTION ==="
# Query all entities' C2 payout values
# EVERY value must be in the GT output set: {0, 100, 200, 300, 400, 500, 700}
# If ANY value appears that is NOT in this set, the fix is incomplete
```

**This is the critical structural assertion.** The engine must produce ONLY values that exist in the plan's tier table. Values like 350, 600, 1200 mean the evaluator is still computing rather than looking up.

---

## PHASE 4: REMOVE DIAGNOSTIC LOGGING

```bash
git add -A && git commit -m "HF-123: remove diagnostic logging after tier fix verified" && git push origin dev
```

---

## PHASE 5: COMPLETION REPORT

### Mandatory Structure

```
HF-123 COMPLETION REPORT
=========================

PHASE 0: DIAGNOSTIC
- [ ] Pasted full evaluateTierLookup function
- [ ] Pasted C2 tierConfig from plan
- [ ] Pasted C2 calculationIntent from plan
- [ ] Identified ROOT CAUSE: [tierConfig has rates not payouts / function multiplies instead of returning / wrong field read / other]

PHASE 1: DIAGNOSTIC LOGGING
- [ ] Pasted [TIER-DEBUG] output from Vercel Runtime Logs
- [ ] Identified specific computation that produces 350/600/1200

PHASE 2: FIX
- [ ] Pasted BEFORE code
- [ ] Pasted AFTER code
- [ ] Explained WHY the fix is structural (applies to any tier lookup, any tenant)
- [ ] Korean Test: PASS/FAIL with explanation
- [ ] Decision 122 compliance: Decimal arithmetic used? YES/NO

PHASE 3: GT VERIFICATION
- [ ] Grand total: MX$_____ (must be MX$185,063)
- [ ] All five component totals match GT
- [ ] Claudia (70001): Total=___ (expected: 1,573)
- [ ] Antonio (70010): Total=___ (expected: 6,263)
- [ ] Alma (70129): Total=___ (expected: 2,050)
- [ ] C2 output set contains ONLY values from {0, 100, 200, 300, 400, 500, 700}
- [ ] NO values like 350, 600, 1200 in C2 outputs

PHASE 4: CLEANUP
- [ ] Diagnostic logging removed
- [ ] Final commit pushed

DEPLOYMENT
- [ ] PR created: `gh pr create --base main --head dev --title "HF-123: Tier lookup structural fix — discrete outputs" --body "Fixes evaluateTierLookup to return discrete plan outputs instead of computed values. Structural fix affecting all tenants with tier_lookup components. Verifies MX$185,063 exact reconciliation (Decision 95). Governed by Decisions 122, 123, 124."`

PRODUCTION VERIFICATION (Andrew — post-merge)
- [ ] Navigate to vialuce.ai → Meridian → Calculate → Run January 2025
- [ ] Verify grand total = MX$185,063
- [ ] Verify C2 outputs are discrete (no 350/600/1200 values)
- [ ] Verify Claudia=1,573, Antonio=6,263, Alma=2,050
```

**REJECTION CRITERIA:**
- Grand total not exactly MX$185,063
- C2 outputs contain values not in the plan's tier table
- Fix contains any Meridian-specific or field-name-specific logic
- Fix does not use Decimal arithmetic for comparisons (AP-25)
- Any phase marked PASS without pasted evidence

---

## BUILD SEQUENCE REMINDERS

1. **Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000**
2. **Git from repo root (`spm-platform`)**, NOT `web/`.
3. **Commit + push after every phase.**
4. **All testing on vialuce.ai** — localhost PASS ≠ production PASS.
5. **Final step:** `gh pr create --base main --head dev`

---

## STANDING QUESTION (Korean Test)

> If a Korean company's plan has a tier table paying ₩0, ₩50,000, ₩100,000, ₩150,000 based on KPI ranges, would the fixed evaluator return those exact values?

The evaluator must return the discrete output from the matched tier — the same value stored in the plan's tier table. No multiplication, no interpolation. If the Korean plan stores ₩100,000, the engine returns ₩100,000. Not ₩100,000 × some_metric.

---

## CONCORDANCE NOTE

After this fix, concordance will likely still be 0% because the intent path has a separate issue with C4 (conditional_gate returns 0 for all employees). This is a known issue tracked separately. The concordance target remains 100% but depends on the intent path being fixed, which is a separate HF. This HF focuses on the LEGACY path's C2 tier lookup, which is the path that writes production results.

---

*End of HF-123 prompt. One tier lookup fix away from MX$185,063. Decision 95: 100% reconciliation.*
