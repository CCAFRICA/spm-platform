# HF-156: Plan Converter — Connect AI Intelligence to Calculation Engine

## Date: March 22, 2026
## Type: HF (Hot Fix)
## Severity: P0 — Plans produce $0 for all entities because converter discards AI interpretation

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

---

## CONTEXT

DIAG-013 identified THREE disconnects with 100% certainty and exact line numbers. The AI correctly interprets plans and stores `calculationIntent` in the component JSONB. But three gates prevent this intelligence from reaching the calculation engine.

### The Proof
CRP Plan 1 component JSONB already contains:
```json
{
  "componentType": "tier_lookup",
  "tierConfig": { "tiers": [] },
  "calculationIntent": {
    "operation": "scalar_multiply",
    "rate": 0.06,
    "input": { "source": "metric", "sourceSpec": { "field": "period_equipment_revenue" } },
    "additionalConstant": 200
  }
}
```
The CORRECT data is right there. Three gates block it.

---

## STANDING RULES

- **Rule 1:** Commit + push after every change
- **Rule 2:** Kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
- **Rule 25-28:** Completion report enforcement
- **Rule 34:** No bypass recommendations

### ZERO DEFERRAL RULE
All three disconnects must be fixed. "Deferred" or "partial" means FAILED.

---

## FIX 1: Extend normalizeCalcType Vocabulary

**File:** `ai-plan-interpreter.ts` approximately line 265-271
**Current:**
```typescript
const validTypes = ['tiered_lookup', 'percentage', 'flat_percentage'];
const typeStr = String(type || 'tiered_lookup');
return validTypes.includes(typeStr) ? typeStr : 'tiered_lookup';
```

**Fix:**
```typescript
const validTypes = [
  'tiered_lookup', 'percentage', 'flat_percentage',
  'linear_function', 'piecewise_linear', 'scope_aggregate',
  'scalar_multiply', 'conditional_gate'
];
const typeStr = String(type || 'tiered_lookup');
return validTypes.includes(typeStr) ? typeStr : 'tiered_lookup';
```

This stops the normalizer from destroying types the AI produces. If the AI says `linear_function`, it passes through instead of being forced to `tiered_lookup`.

### Proof Gate
```
PG-01: normalizeCalcType accepts linear_function and piecewise_linear
  Evidence: paste the updated validTypes array
```

**Commit: "HF-156 Fix 1: Extend normalizeCalcType vocabulary"**

---

## FIX 2: Route New Types to Correct componentType

**File:** `ai-plan-interpreter.ts` approximately line 589
**Current:** componentType is always set to one of the legacy 4 types.

**Fix:** Add cases for new calculation types in the function that maps calcType to componentType:

```typescript
case 'linear_function':
  componentType = 'linear_function';
  break;
case 'piecewise_linear':
  componentType = 'piecewise_linear';
  break;
case 'scope_aggregate':
  componentType = 'scope_aggregate';
  break;
case 'scalar_multiply':
  componentType = 'scalar_multiply';
  break;
case 'conditional_gate':
  componentType = 'conditional_gate';
  break;
```

AND: when the calcType is one of these new types, store the calculationIntent in BOTH locations so the transformer can find it:

```typescript
if (['linear_function', 'piecewise_linear', 'scope_aggregate', 'scalar_multiply', 'conditional_gate'].includes(componentType)) {
  component.metadata = {
    ...(component.metadata || {}),
    intent: component.calculationIntent
  };
}
```

### Proof Gate
```
PG-02: New calcTypes produce correct componentType (not tier_lookup)
  Evidence: paste the updated switch/case or mapping code
  
PG-03: calculationIntent copied to metadata.intent for new types
  Evidence: paste the copy code
```

**Commit: "HF-156 Fix 2: Route new types to correct componentType"**

---

## FIX 3: transformFromMetadata Reads calculationIntent as Fallback

**File:** `intent-transformer.ts` approximately line 387
**Current:**
```typescript
const meta = component.metadata as Record<string, unknown>;
if (!meta?.intent) return null;
```

**Fix:**
```typescript
const meta = component.metadata as Record<string, unknown>;
const intent = meta?.intent || (component as any).calculationIntent;
if (!intent) return null;
```

This ensures that even if Fix 2 doesn't copy the intent to metadata.intent (backward compatibility with existing data), the transformer can still find it in calculationIntent.

### Proof Gate
```
PG-04: transformFromMetadata reads calculationIntent as fallback
  Evidence: paste the updated code showing both read paths
```

**Commit: "HF-156 Fix 3: transformFromMetadata reads calculationIntent fallback"**

---

## FIX 4: Intent Transformer Routes New ComponentTypes

**File:** `intent-transformer.ts`

The intent transformer has a switch/case or if/else chain that routes by componentType. Currently it only handles the legacy types (tier_lookup, percentage, etc.). Add routing for new types:

When componentType is `linear_function`, `piecewise_linear`, `scope_aggregate`, `scalar_multiply`, or `conditional_gate`, the transformer should call `transformFromMetadata` to read the calculationIntent.

Find the routing logic (the function that decides which transform function to call based on componentType) and add:

```typescript
case 'linear_function':
case 'piecewise_linear':
case 'scope_aggregate':
case 'scalar_multiply':
case 'conditional_gate':
  return transformFromMetadata(component);
```

### Proof Gate
```
PG-05: Intent transformer routes new componentTypes to transformFromMetadata
  Evidence: paste the updated routing code
```

**Commit: "HF-156 Fix 4: Intent transformer routes new types"**

---

## VERIFICATION: REIMPORT CRP PLAN 1

After all 4 fixes:

1. Delete the existing CRP Plan 1 rule_set:
```sql
DELETE FROM rule_sets WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
```

2. Reimport CRP_Plan_1_Capital_Equipment.pdf through the browser

3. Check Vercel logs. Expected:
```
[convertComponent] "Equipment Commission - Senior Rep" calcType="linear_function"
```
NOT:
```
[convertComponent] "Equipment Commission - Senior Rep" calcType="tiered_lookup"
```

4. Query the database:
```sql
SELECT components FROM rule_sets 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
ORDER BY created_at DESC LIMIT 1;
```
The components JSONB must show `componentType: 'linear_function'` (not `tier_lookup`).

### Proof Gate
```
PG-06: After reimport, Vercel log shows calcType != "tiered_lookup" for Plan 1
  Evidence: paste the Vercel log line

PG-07: rule_set.components shows componentType != "tier_lookup"
  Evidence: paste the DB query result
```

**Commit: "HF-156 Verification: Plan 1 reimport"**

---

## BUILD + PR

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. `npm run dev` — confirm localhost:3000

```bash
gh pr create --base main --head dev --title "HF-156: Plan Converter — Connect AI Intelligence to Engine" --body "Fixes three disconnects identified by DIAG-013. (1) normalizeCalcType vocabulary extended with linear_function, piecewise_linear, scope_aggregate. (2) New calcTypes produce correct componentType and copy calculationIntent to metadata.intent. (3) transformFromMetadata reads calculationIntent as fallback. (4) Intent transformer routes new componentTypes. Verified: Plan 1 reimport produces linear_function, not tiered_lookup."
```

**Commit: "HF-156: Build verification"**

---

## PROOF GATES — HARD (ALL REQUIRED)

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| PG-01 | normalizeCalcType accepts new types | Paste updated validTypes |
| PG-02 | New calcTypes produce correct componentType | Paste routing code |
| PG-03 | calculationIntent copied to metadata.intent | Paste copy code |
| PG-04 | transformFromMetadata reads calculationIntent fallback | Paste updated read code |
| PG-05 | Intent transformer routes new types to transformFromMetadata | Paste routing code |
| PG-06 | Plan 1 reimport: Vercel log shows NOT tiered_lookup | Paste log line |
| PG-07 | Plan 1 reimport: components JSONB shows NOT tier_lookup | Paste DB query |
| PG-08 | npm run build exits 0 | Paste exit code |

---

## COMPLETION REPORT ENFORCEMENT

File: `HF-156_COMPLETION_REPORT.md` in PROJECT ROOT.
ALL 8 proof gates must be PASS with pasted evidence.
Zero deferrals. Zero "partial." This fix has been attempted 3 times. This is the last time.
