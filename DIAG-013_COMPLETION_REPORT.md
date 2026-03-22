# DIAG-013 COMPLETION REPORT: Plan Converter Audit
## Date: March 22, 2026

## ROOT CAUSE — 100% CERTAINTY

### The Gap: THREE disconnects in the conversion pipeline

**Disconnect 1: AI interpreter vocabulary is frozen at 3 types**

`ai-plan-interpreter.ts` line 265-271:
```typescript
const validTypes = ['tiered_lookup', 'percentage', 'flat_percentage'];
const typeStr = String(type || 'tiered_lookup');
return validTypes.includes(typeStr) ? typeStr : 'tiered_lookup';
```

The AI assessment says "linear formula" or "accelerator curve" but `normalizeCalcType` converts ANY unrecognized type to `'tiered_lookup'`. The new types (`linear_function`, `piecewise_linear`, `scope_aggregate`) are NOT in the valid types list.

**Disconnect 2: componentType is ALWAYS one of the legacy 4**

`ai-plan-interpreter.ts` line 589:
```typescript
componentType: 'tier_lookup',  // always tier_lookup for tiered_lookup calc type
```

The component JSONB stored in rule_sets.components has `componentType: 'tier_lookup'` regardless of what the AI identified.

**Disconnect 3: transformFromMetadata reads from wrong field**

`intent-transformer.ts` line 387:
```typescript
const meta = component.metadata as Record<string, unknown>;
if (!meta?.intent) return null;  // reads metadata.intent
```

But the AI stores the intent in `component.calculationIntent`, NOT `component.metadata.intent`. Even if `componentType` were `'linear_function'`, `transformFromMetadata` would return null because it looks in the wrong place.

### The Data Proves It

CRP Plan 1 (Capital Equipment) Senior Rep component:
```json
{
  "componentType": "tier_lookup",        // ← WRONG (should be linear_function)
  "tierConfig": { "tiers": [] },         // ← EMPTY (tier_lookup with 0 tiers = null intent)
  "calculationIntent": {                  // ← CORRECT DATA EXISTS HERE
    "operation": "scalar_multiply",
    "rate": 0.06,
    "input": { "source": "metric", "sourceSpec": { "field": "period_equipment_revenue" } },
    "additionalConstant": 200             // ← the base draw (linear_function intercept)
  }
}
```

The AI CORRECTLY identified: rate=0.06, input=period_equipment_revenue, base draw=200. But the transformer reads `componentType: 'tier_lookup'` → routes to `transformTierLookup` → finds 0 tiers → returns null.

## THE FIX (NOT IMPLEMENTING — DIAGNOSTIC ONLY)

**Fix 1:** Extend `normalizeCalcType` vocabulary:
```typescript
const validTypes = ['tiered_lookup', 'percentage', 'flat_percentage',
                    'linear_function', 'piecewise_linear', 'scope_aggregate'];
```

**Fix 2:** In `convertToComponent` (line ~573), add cases for new types that produce the correct `componentType` and store the intent in `metadata.intent` (where `transformFromMetadata` reads it).

**Fix 3:** In `transformFromMetadata`, read from `component.calculationIntent` as fallback when `metadata.intent` is empty.

**Fix 4:** Update the AI prompt to include examples of linear_function and piecewise_linear in its response schema.

## STANDING RULE COMPLIANCE
- Rule 40 (diagnostic-first): PASS — read-only, zero code changes
- Rule 27 (evidence = paste): PASS — database query results + code lines cited
