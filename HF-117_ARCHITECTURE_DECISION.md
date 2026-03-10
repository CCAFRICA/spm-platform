# HF-117 Phase 0: Architecture Decision Record
## Calculation Reconciliation — Three Systemic Issues

### Problem
Ground truth comparison (MX$185,063 — Meridian Logistics Group, January 2025, 67 employees) reveals three systemic calculation issues:
1. All employees treated as Senior variant (variant routing fails)
2. Safety Record gate pays $0 instead of fixed bonus (conditional gate semantics)
3. Only 50 of 67 employees discovered (entity resolution incomplete)

---

## Issue 1: Variant Routing

### Root Cause
route.ts:968-972 extracts `entityRole` from hardcoded keys:
```typescript
const role = rd['role'] ?? rd['Puesto'] ?? rd['puesto'];
```

DS-009 field identity architecture means the role column can have ANY name — the original column name, a semantic key, or a field identity alias. If the field isn't named exactly `role`, `Puesto`, or `puesto`, `entityRole` is null and all entities default to `variants[0]` (Senior).

### Code Location
- Role extraction: route.ts:968-972
- Variant selection: route.ts:978-1005 (exact match → substring match → default to variants[0])

### Fix
Replace hardcoded field name lookup with a structural approach: scan ALL string fields in the entity's committed_data for values matching any variant name. This is field-name-agnostic and passes the Korean Test.

```typescript
// For each entity, check ALL string field values against variant names
if (!entityRole && variants.length > 1) {
  const variantNames = variants.map(v =>
    String(v.variantName ?? v.description ?? '').toLowerCase().trim()
  ).filter(Boolean);
  for (const row of entityRowsFlat) {
    const rd = row.row_data as Record<string, unknown>;
    for (const [, val] of Object.entries(rd)) {
      if (typeof val === 'string' && val.length > 0) {
        const normVal = val.toLowerCase().trim();
        if (variantNames.includes(normVal)) {
          entityRole = val;
          break;
        }
      }
    }
    if (entityRole) break;
  }
}
```

- **Korean Test**: Zero field name references. Matches on VALUE equality with variant names.
- **Scale**: Works for any number of variants, any language, any column name.
- **Fallback**: If no match found, still defaults to `variants[0]`.

---

## Issue 2: Conditional Gate Semantics

### Root Cause
run-calculation.ts:300-326 `evaluateConditionalPercentage`:
```typescript
const base = metrics[config.appliedTo] ?? metrics['amount'] ?? 0;
// ...
const payout = base * condition.rate;
```

For Safety Record: `appliedTo` resolves to the incident metric. When incidents = 0 (GOOD — employee passed safety gate), `base = 0`, and `payout = 0 * rate = 0`. The gate should produce a fixed bonus (`rate` IS the payout), not multiply a zero base.

### Code Location
- Legacy evaluator: run-calculation.ts:300-326 (`evaluateConditionalPercentage`)
- Intent fallback: run-calculation.ts:375-436 (tries `calculationIntent` when legacy returns 0)
- Intent executor: intent-executor.ts:212-223 (`executeScalarMultiply` — same `input * rate` problem if input is the incident metric)

### Fix
In `evaluateConditionalPercentage`: when `base === 0` AND a condition matches, return `condition.rate` directly as payout.

Rationale: if the base metric is 0, multiplication always produces 0 regardless of rate. The only meaningful interpretation is that `rate` IS the fixed payout amount. This handles gate semantics (pass/fail → fixed bonus) while preserving percentage semantics (when base > 0, `base * rate` still works correctly).

```typescript
if (conditionValue >= min && conditionValue <= max) {
  const payout = base === 0 ? condition.rate : base * condition.rate;
  return { payout, details: { ... } };
}
```

- **Korean Test**: No field name references. Logic is structural.
- **Scale**: Works for any conditional component where base is 0.
- **Non-regression**: When base > 0, behavior is unchanged (`base * rate`).

**REJECTED**: Checking `appliedTo === condition.metric` — too fragile, depends on AI plan interpretation setting the same metric name for both. The `base === 0` check is simpler and catches all zero-base cases.

---

## Issue 3: Entity Resolution Completeness

### Root Cause
entity-resolution.ts:129-135:
```typescript
const ENTITY_LABELS = new Set(['entity', 'transaction', 'target']);
const entityBatchIds = Array.from(batchIdentifiers.keys())
  .filter(id => ENTITY_LABELS.has(batchLabels.get(id) || ''));
const discoveryBatchIds = entityBatchIds.length > 0
  ? entityBatchIds : Array.from(batchIdentifiers.keys());
```

SCI assigns exactly one of 4 labels: `'entity'`, `'transaction'`, `'target'`, `'reference'`. The ENTITY_LABELS filter excludes `'reference'` batches.

When at least one batch has an included label, the filter is EXCLUSIVE — only included-label batches are used for entity discovery. If the roster/Plantilla batch is classified as `'reference'` (it contains employee data but SCI may see it as reference/lookup data), those entities are missed. Employees only appearing in the roster (not in any transaction/target batch) are never discovered.

67 employees in roster. ~50 have transaction/target data. 17 roster-only employees are missed.

### Code Location
- Label filter: entity-resolution.ts:129-135
- SCI label assignment: sci/execute/route.ts:484 (target), :632 (transaction), :758 (entity), :880 (reference)
- Row-index guard: entity-resolution.ts:14-24 (`looksLikeRowIndex`)

### Fix
Include ALL batches that have entity identifier columns in discovery, regardless of SCI label. The field_identities metadata already marks which columns are entity identifiers — use that signal instead of the informational label.

```typescript
// Use all batches that have identifier columns for entity discovery
// The field_identities metadata (from HC/DS-009) is the structural signal,
// not the SCI informational_label
const discoveryBatchIds = Array.from(batchIdentifiers.keys());
```

Remove the ENTITY_LABELS filter entirely. The existing guards (`looksLikeRowIndex`, dedup in Step 3) prevent spurious entities. Reference batches with hub/store IDs have few unique values and won't pollute the entity list meaningfully.

- **Korean Test**: No field name references. Uses structural metadata.
- **Scale**: Works for any batch classification, any number of batches.
- **Non-regression**: Entity dedup (Step 3) prevents duplicates. Reference IDs that aren't person identifiers are already filtered by the identifier column detection logic in Step 1.

**REJECTED**: Adding `'reference'` to ENTITY_LABELS — half-measure that assumes reference batches always contain entities. The real fix is to not filter by label at all, since field_identities already encode which columns are identifiers.

---

## Verification Plan

| Component | Before Fix | After Fix |
|---|---|---|
| Claudia (70001, Standard) | Computed as Senior variant | Correct Standard variant |
| Antonio (70010, Senior) | Computed as Senior variant (correct by accident) | Still Senior (correct) |
| Safety Record (0 incidents) | $0 (0 * rate) | Fixed bonus amount |
| Entity count | 50 | 67 |
| Grand total | Incorrect | ~ MX$185,063 |

---
*HF-117 Phase 0 | March 9, 2026*
