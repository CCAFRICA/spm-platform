# DIAG-016: Plan 2 Piecewise Linear Produces Wrong Results
## March 30, 2026
## Type: Diagnostic — CC must execute this BEFORE any fix is designed

---

## SYMPTOM

CRP Plan 2 (Consumables Commission Plan) January produces $16,156.17. GT = $28,159.48. Delta = $12,003.31.

Per-entity analysis shows the engine is applying ~3% rate to all entities regardless of quota attainment. The GT shows three tiers:
- <100% quota attainment: 3%
- 100-120%: 5%  
- >120%: 8%

Entities above quota who should get 5% or 8% are getting ~3%. The piecewise_linear primitive's tier selection is not working.

## EVIDENCE

### GT Structure (from CRP_Resultados_Esperados.xlsx, Plan 2 sheet)

```
Primitive: piecewise_linear
<100%: 3% | 100-120%: 5% | >120%: 8%
Rate × Revenue (entire tier, not marginal)
Cap: $5,000/month
Quota: Senior Rep = $25,000 | Rep = $18,000
```

### Per-Entity Comparison (sample)

| Entity | Revenue | Quota | Attainment | GT Rate | GT Comm | VL Comm | VL Implied Rate |
|--------|---------|-------|------------|---------|---------|---------|-----------------|
| Tyler Morrison | 33,109 | 25,000 | 132.4% | 8% | 2,648.72 | 1,013.31 | ~3.06% |
| Jason Wu | 22,156 | 18,000 | 123.1% | 8% | 1,772.48 | 664.68 | ~3.00% |
| David Stern | 16,277 | 18,000 | 90.4% | 3% | 488.31 | 488.31 | 3.00% ✓ |
| Fatima Al-Rashid | 12,438 | 18,000 | 69.1% | 3% | 373.14 | 373.14 | 3.00% ✓ |

Entities at 3% tier match exactly. Entities above quota do not — they're all getting ~3%.

### DIAG Logs (Plan 2 calculation)

```
Rule set "Consumables Commission Plan" has 1 components
HF-165: input_bindings already populated — skipping convergence
OB-118 Metric derivations: 1 rules from input_bindings
HF-108 Using metric_derivations (legacy) for data resolution — no convergence_bindings found
571 committed_data rows (571 entity-level, 0 store-level)
OB-194: 24 calculated, 8 excluded (no qualifying variant)
Grand total: 16156.17
```

Key observations:
- "1 rules from input_bindings" — only 1 metric derivation. Plan 2 needs at least a revenue derivation AND an attainment computation.
- "input_bindings already populated — skipping convergence" — convergence was cached, not re-run for Plan 2.
- No mention of quota or attainment in the logs.

---

## HYPOTHESIS (to be verified by reading actual code and data)

The `piecewise_linear` executor requires two inputs:
1. `ratioInput` — quota attainment ratio (revenue / quota)
2. `baseInput` — consumable revenue

The engine likely has a revenue metric (from the single metric derivation) but either:
- **H1:** The `ratioInput` metric resolves to 0 or a value that always falls in the first segment (<100% = 3% rate)
- **H2:** The `calculationIntent` produced by the AI doesn't have the correct `ratioInput`/`baseInput` structure
- **H3:** The quota value is not available to the engine (it's defined in the plan, not in transaction data), so attainment can't be computed
- **H4:** The plan wasn't interpreted as `piecewise_linear` at all — it may be stored as a different primitive

**DO NOT assume any of these. Verify each from code and data.**

---

## DIAGNOSTIC TASK FOR CC

**Do NOT write any fix. This is diagnostic only.**

### Phase 1: Read the Plan 2 rule_set

Query the actual stored plan data:

```sql
-- 1. What componentType and calculationIntent did the AI produce for Plan 2?
SELECT 
  name,
  components::text
FROM rule_sets
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND name ILIKE '%consumable%';

-- 2. What input_bindings does Plan 2 have?
SELECT 
  name,
  input_bindings::text
FROM rule_sets
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND name ILIKE '%consumable%';
```

**Output required:** Paste the FULL `components` JSONB (not truncated). Paste the FULL `input_bindings` JSONB.

From the components JSONB, answer:
- What is `components[0].componentType`?
- What is `components[0].calculationIntent.operation`?
- If piecewise_linear: what are `ratioInput`, `baseInput`, and `segments`?
- If NOT piecewise_linear: what operation was produced?
- Does the component have `tierConfig`, `percentageConfig`, or other legacy config?

### Phase 2: Trace the transformFromMetadata code path

Read the actual code in `web/src/lib/intelligence/intent-transform.ts`, function `transformFromMetadata`.

1. Find the `transformFromMetadata` function
2. Trace what it does when `component.calculationIntent.operation === 'piecewise_linear'`:
   - How does it construct `ratioInput`? What metric name does it reference?
   - How does it construct `baseInput`? What metric name does it reference?
   - Does it pass through the AI's `segments` array correctly?
3. If `calculationIntent.operation` is NOT `piecewise_linear`, trace what path it takes

**Output required:** Paste the `transformFromMetadata` function code with file path and line numbers.

### Phase 3: Trace metric resolution at calc time

Read the actual code in `web/src/app/api/calculation/run/route.ts`:

1. Find where `applyMetricDerivations` is called
2. Trace what metric names are produced for a Plan 2 entity's data
3. Find where the intent executor calls `resolveValue` for `ratioInput` and `baseInput`
4. What happens when a metric name referenced by `ratioInput` doesn't exist in the entity's metrics map?

Read the actual code in `web/src/lib/intelligence/intent-executor.ts`:

5. In `executePiecewiseLinear`:
   - What does `resolveValue(op.ratioInput, data, ...)` return when the metric doesn't exist?
   - Does it return 0? null? Does it throw?

**Output required:** Paste the relevant code sections with file paths and line numbers.

### Phase 4: Check what metrics an entity actually has

Add temporary diagnostic logging (will be removed — Rule 23) to verify what metrics exist for ONE entity at calc time. Or better: write a headless verification script (Rule 22, Level 1).

```typescript
// scripts/verify-diag016-metrics.ts
// Connect to Supabase, fetch Plan 2 rule_set components,
// fetch committed_data for one entity (e.g., CRP-6007 Tyler Morrison) in January,
// run aggregateMetrics on the rows, print the metric map.
// Then trace what ratioInput and baseInput resolve to.
```

**Output required:**
- The actual metric map for Tyler Morrison (CRP-6007) in Plan 2 January calculation
- Which metric name `ratioInput` references and what value it resolves to
- Which metric name `baseInput` references and what value it resolves to
- What segment the ratio falls into and what rate is applied

### Phase 5: Identify the gap

Based on Phases 1-4, produce a findings document:

```markdown
# DIAG-016 FINDINGS

## Plan 2 stored components
[componentType, calculationIntent.operation, full intent structure]

## Plan 2 input_bindings
[metric derivation rules — what filters, what aggregation]

## transformFromMetadata code path
[file:line for piecewise_linear handling]
[how ratioInput is constructed — what metric name]
[how baseInput is constructed — what metric name]

## Metric resolution at calc time
[what metrics exist for Tyler Morrison in Plan 2 context]
[what ratioInput resolves to — value and metric name]
[what baseInput resolves to — value and metric name]
[what segment is selected and what rate is applied]

## Root cause
[one of H1-H4, or a new hypothesis, with code evidence]

## What the fix needs to address
[exact gap: missing metric, wrong metric name, missing quota, etc.]
```

**Commit:** `DIAG-016: Plan 2 piecewise_linear findings`

---

## WHAT CC MUST NOT DO

1. **DO NOT write any fix in this prompt.** Diagnostic only.
2. **DO NOT hypothesize from function names.** Read actual code at actual lines.
3. **DO NOT modify any source files** except the diagnostic script (which must be removed or committed to scripts/).
4. **DO NOT skip any phase.** The gap could be at any point: AI interpretation, transform, derivation, or execution.
5. **DO NOT truncate query results.** The full `components` JSONB is essential — truncation hides the problem.

## WHAT CC MUST DO

1. `git stash` any uncommitted changes before starting
2. Read actual source files with `cat` or `grep` — not from memory
3. Run all SQL queries and paste FULL results (use `::text` for JSONB to avoid truncation)
4. Write and run the verification script
5. Commit the findings document to project root
6. `git stash pop` after committing

---

## COMPLIANCE

- [ ] CC_STANDING_ARCHITECTURE_RULES.md v2.0 loaded
- [ ] CC_DIAGNOSTIC_PROTOCOL.md Rules 19-24 loaded
- [ ] Rule 21: Trace actual code path
- [ ] Rule 13: Read code first
- [ ] Rule 22: Headless verification preferred
- [ ] Rule 23: Diagnostic cleanup mandatory

---

## CONTEXT FROM AUD-001 (code already read)

### executePiecewiseLinear (intent-executor.ts)
```typescript
function executePiecewiseLinear(op, data, inputLog, trace): Decimal {
  const ratio = toNumber(resolveValue(op.ratioInput, data, inputLog, trace));
  const baseValue = resolveValue(op.baseInput, data, inputLog, trace);
  for (const seg of op.segments) {
    const inRange = ratio >= seg.min && (seg.max === null || ratio < seg.max);
    if (inRange) {
      return baseValue.mul(seg.rate);
    }
  }
  return ZERO;
}
```

### PiecewiseLinearOp type (intent-types.ts)
```typescript
export interface PiecewiseLinearOp {
  operation: 'piecewise_linear';
  ratioInput: IntentSource | IntentOperation;  // attainment
  baseInput: IntentSource | IntentOperation;   // revenue
  segments: Array<{ min: number; max: number | null; rate: number }>;
}
```

### transformFromMetadata routing (intent-transform.ts)
```typescript
case 'piecewise_linear':
  return transformFromMetadata(component, componentIndex);
```

The `transformFromMetadata` function reads `component.calculationIntent` and constructs the intent. The EXACT code of this function is what Phase 2 must paste.

### AI Prompt includes piecewise_linear example
```
PIECEWISE LINEAR:
  ratioMetric: "quota_attainment"
  baseMetric: "consumable_revenue"
  segments: [{ min: 0, max: 1.0, rate: 0.03 }, { min: 1.0, max: 1.2, rate: 0.05 }, { min: 1.2, max: null, rate: 0.08 }]
```

---

*"The executor code is correct. The question is: what inputs does it receive? Trace the data, not the logic."*
