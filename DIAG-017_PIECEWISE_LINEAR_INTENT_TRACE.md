# DIAG-017: Stored Intent Structure for Piecewise Linear Component

## Purpose

Examine what the AI plan interpreter actually stored for the CRP Plan 2 (Consumables Commission) piecewise_linear component. This determines whether the $31,403.51 vs GT $28,159.48 gap is caused by:

1. **Missing/wrong segments** — AI didn't produce tier breakpoints (3%/5%/8% at quota thresholds)
2. **Missing ratio operation** — AI stored raw metric reference instead of computed ratio (consumable_revenue / monthly_quota)
3. **Missing cap modifier** — $5,000/month cap not produced (CLT-183 F01)
4. **Correct intent, wrong execution** — stored structure is right but executor has a bug

## What the Executor Expects (PiecewiseLinearOp from intent-types.ts)

```typescript
{
  operation: 'piecewise_linear',
  ratioInput: {                          // Must be a COMPUTED ratio, not raw metric
    operation: 'ratio',
    numerator: { source: 'metric', sourceSpec: { field: 'consumable_revenue' } },
    denominator: { source: 'metric', sourceSpec: { field: 'monthly_quota' } },
    zeroDenominatorBehavior: 'zero'
  },
  baseInput: { source: 'metric', sourceSpec: { field: 'consumable_revenue' } },
  segments: [
    { min: 0, max: 1.0, rate: 0.03 },   // <100% attainment → 3%
    { min: 1.0, max: 1.2, rate: 0.05 }, // 100-120% → 5%
    { min: 1.2, max: null, rate: 0.08 }  // >120% → 8%
  ]
}
```

Plus a cap modifier: `{ modifier: 'cap', maxValue: 5000, scope: 'per_period' }`

---

## QUERIES

### Query 1: Full component config for Plan 2

Run in Supabase SQL Editor:

```sql
SELECT
  id,
  name,
  components::text
FROM rule_sets
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND name ILIKE '%consumable%';
```

### Query 2: If Query 1 returns nothing or components is empty, check metadata

```sql
SELECT
  id,
  name,
  metadata::text
FROM rule_sets
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND name ILIKE '%consumable%';
```

### Query 3: Extract piecewise_linear component details

If the structure is nested under `variants[].components[]`, use:

```sql
SELECT
  rs.name,
  v->>'variantId' AS variant_id,
  c->>'name' AS component_name,
  c->>'componentType' AS component_type,
  c->'calculationIntent' AS calculation_intent,
  c->'metadata' AS component_metadata
FROM rule_sets rs,
  jsonb_array_elements(rs.components->'variants') v,
  jsonb_array_elements(v->'components') c
WHERE rs.tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND rs.name ILIKE '%consumable%';
```

Note: If `components` is not the right column or the JSON path is wrong, start with Query 1 to see the raw structure first, then adjust.

---

## WHAT TO LOOK FOR

### A. Does calculationIntent contain segments?
- YES with correct rates (0.03/0.05/0.08) → segments are fine, look elsewhere
- YES with wrong rates → AI misinterpreted the plan PDF
- NO segments at all → AI prompt doesn't teach segment extraction for piecewise_linear

### B. Does calculationIntent.ratioInput use a ratio operation?
- If `ratioInput: { operation: "ratio", numerator: {...}, denominator: {...} }` → correct
- If `ratioInput: { source: "metric", sourceSpec: { field: "consumable_revenue" } }` → **BUG**: raw metric, not ratio. Every entity's "ratio" would be thousands (raw dollars), putting everyone in the >120% tier at 8%
- If `ratioInput` is missing entirely → AI used a different structure (e.g., `ratioMetric` as string)

### C. Is there a cap modifier?
- If `metadata.cap: 5000` or a modifier array with `{ modifier: "cap", maxValue: 5000 }` → cap exists
- If no cap anywhere → CLT-183 F01, $5K cap not interpreted from plan PDF

### D. Does metadata.intent differ from calculationIntent?
- `convertComponent` copies `calculationIntent` to `metadata.intent`
- `transformFromMetadata` reads `metadata.intent || calculationIntent`
- If they differ, there's a mutation in the copy

---

## EXPECTED OUTCOME

This diagnostic tells us exactly what `transformFromMetadata` receives at calc time, which determines the fix scope for HF-187:

| Finding | Fix Scope |
|---------|-----------|
| AI produced wrong structure (string fields instead of IntentSource objects) | `convertComponent` needs a typed transformation for piecewise_linear — same as legacy primitives have |
| AI produced correct structure but segments are missing | AI prompt needs piecewise_linear segment extraction examples |
| AI produced correct structure with correct segments | Executor bug — trace per-entity values |
| Cap missing | AI prompt needs cap extraction for piecewise_linear |
| All correct | Per-entity value trace needed (DIAG-018) |

---

*DIAG-017 — Diagnostic only. No code changes. No data fixes.*
