# DIAG-016 FINDINGS
## Plan 2 Piecewise Linear — Missing Quota Metric
## Date: 2026-03-30

---

## Plan 2 Stored Components

```
componentType: "piecewise_linear"
calculationIntent.operation: "piecewise_linear"

ratioInput: {
  source: "ratio",
  sourceSpec: { numerator: "consumable_revenue", denominator: "monthly_quota" }
}

baseInput: {
  source: "metric",
  sourceSpec: { field: "consumable_revenue" }
}

segments: [
  { min: 0, max: 0.9999, rate: 0.03 },
  { min: 1, max: 1.1999, rate: 0.05 },
  { min: 1.2, max: null, rate: 0.08 }
]

modifiers: [{ modifier: "cap", maxValue: 5000 }]
```

Both variants (Senior Rep, Rep) have IDENTICAL component structure. The plan does NOT store per-variant quota values.

## Plan 2 Input Bindings

```json
{
  "metric_derivations": [
    {
      "metric": "consumable_revenue",
      "operation": "sum",
      "source_field": "total_amount",
      "filters": [{ "field": "product_category", "operator": "eq", "value": "Consumables" }],
      "source_pattern": "0_c49ca9fa_02_crp_sales_20260101_2026__..."
    }
  ]
}
```

**Only 1 derivation.** `consumable_revenue` is derived. `monthly_quota` has NO derivation — it's not in the transaction data.

## transformFromMetadata Code Path

**File:** `web/src/lib/calculation/intent-transformer.ts:386-458`

The `piecewise_linear` intent does NOT match the `additionalConstant` or `scalar_multiply` branches. Falls to line 413-416:
```typescript
} else {
    operation = rawIntent as unknown as IntentOperation;
}
```

The raw intent (with `ratioInput`, `baseInput`, `segments`) is cast directly to `IntentOperation`. The piecewise_linear OB-186 block (lines 421-430) only handles `targetValue`, not quotas. **The transform passes the intent through correctly.**

## Metric Resolution at Calc Time

**File:** `web/src/lib/calculation/intent-executor.ts:61-89`

`resolveSource` for `source: "ratio"` (lines 75-89):
```typescript
case 'ratio': {
  const numKey = src.sourceSpec.numerator;  // "consumable_revenue"
  const denKey = src.sourceSpec.denominator; // "monthly_quota"
  const num = toDecimal(data.metrics[numKey] ?? 0);  // e.g., 33109
  const den = toDecimal(data.metrics[denKey] ?? 0);  // data.metrics["monthly_quota"] → undefined → 0
  const val = den.isZero() ? ZERO : num.div(den);     // den=0 → val=ZERO
  return val;
}
```

**Chain:**
1. `data.metrics["monthly_quota"]` = `undefined` (no derivation exists)
2. `undefined ?? 0` = `0`
3. `den = Decimal(0)`, `den.isZero()` = `true`
4. `val = ZERO` (0)
5. `executePiecewiseLinear`: `ratio = 0`
6. Segment match: `0 >= 0 && 0 < 0.9999` → **first segment (3%)**
7. `baseValue * 0.03` = `consumable_revenue * 3%` for ALL entities

**This is why ALL entities get ~3% — the ratio is always 0 because `monthly_quota` is missing from the metrics map.**

## Root Cause — CONFIRMED: H3

**H3: The quota value is not available to the engine.** The quota ($25,000 Senior Rep, $18,000 Rep) is defined in the plan document (PDF), correctly extracted by the AI into `ratioInput.sourceSpec.denominator = "monthly_quota"`, but there is no mechanism to populate `data.metrics["monthly_quota"]` at calc time.

The metric derivation system derives metrics FROM committed_data (transaction rows). `monthly_quota` is NOT in the transaction data — it's a plan-level constant that varies by variant.

**H1 (partial):** Yes, the ratio resolves to 0 (because denominator is missing), which always falls in the first segment. But the root cause is H3 (quota data unavailable).

**H2:** No — the `calculationIntent` is correctly structured with `piecewise_linear`, `ratioInput`, `baseInput`, and `segments`.

**H4:** No — the plan IS stored as `piecewise_linear` with correct structure.

## What the Fix Needs to Address

The engine needs a way to receive **plan-level constants** (like quotas) as metrics. Three options:

### Option A: Variant-Level Constants in Plan Definition
Store quota values as variant-level constants in the component:
```json
{
  "variantId": "senior_rep",
  "constants": { "monthly_quota": 25000 },
  "components": [...]
}
```
The engine reads these at variant selection time and injects them into `data.metrics`. This is the simplest approach — no import needed, values come from the plan itself.

**Pro:** Zero import friction. Plan AI already extracted the quotas. Just need to store + inject.
**Con:** Only works when quotas are uniform within a variant. Doesn't handle per-entity quotas.

### Option B: Target/Quota Import File
Import a separate file with quota values per entity. The import pipeline creates `committed_data` rows with `monthly_quota` as a field. The metric derivation system derives it like any other metric.

**Pro:** Handles per-entity quotas. Standard import flow.
**Con:** Requires additional file upload. More user friction.

### Option C: Entity Attributes as Metric Source
Store quota as an entity attribute (e.g., `entities.metadata.monthly_quota`). The executor's `resolveSource` case `entity_attribute` already handles this. The `ratioInput` would need to reference `source: "entity_attribute"` instead of `source: "ratio"`.

**Pro:** Per-entity quotas without separate import.
**Con:** Requires re-interpreting the plan intent. Entity attributes aren't currently quota-aware.

### Recommended: Option A (immediate) + Option B (future)
For CRP and similar plans where quotas are per-variant, Option A is the minimum viable fix. The AI already extracted the quota values — they just need to be stored in the variant definition and injected into the metrics map at variant selection time.

## Exact Code Location for Fix

**Injection point:** `web/src/app/api/calculation/run/route.ts`, in the entity loop, AFTER variant selection and BEFORE metric derivation. When the selected variant has `constants`, merge them into the entity's metrics map:

```typescript
// After: selectedComponents = (variants[selectedVariantIndex]?.components as PlanComponent[]) ?? defaultComponents;
// Inject variant-level constants into entity metrics
const variantConstants = (variants[selectedVariantIndex] as Record<string, unknown>)?.constants as Record<string, number> | undefined;
if (variantConstants) {
  for (const [key, value] of Object.entries(variantConstants)) {
    if (typeof value === 'number') {
      allEntityMetrics[key] = value;
    }
  }
}
```

**Plan storage:** The AI plan interpreter needs to extract per-variant quotas and store them as `variants[i].constants`. For CRP, this means:
- Senior Rep variant: `{ "monthly_quota": 25000 }`
- Rep variant: `{ "monthly_quota": 18000 }`

This can be done by updating the CRP plan's `rule_sets.components` JSONB to add `constants` to each variant. For the platform fix, the AI prompt for plan interpretation should be updated to extract per-variant quotas.
