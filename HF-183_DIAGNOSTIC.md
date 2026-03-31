# HF-183 Phase 0: Diagnostic — Code Reads

## Read 1: Target Agent `per_entity_benchmarks_static` Signature

**File:** `web/src/lib/sci/signatures.ts:107-134`

```typescript
const targetLowRepeat = structure.identifierRepeatRatio > 0 && structure.identifierRepeatRatio <= 1.5;
const hasModerateNumeric = structure.numericFieldRatio > 0.30;
const targetNoTemporal = !hasTemporalDimension;

if (targetLowRepeat && hasModerateNumeric && hasId && targetNoTemporal) {
  let confidence = 0.75;
  // ...
  signatureName: 'per_entity_benchmarks_static',
}
```

**CONFIRMED:** Requires `numericFieldRatio > 0.30` AND `!hasTemporalDimension`.
Quota files have ~17% numeric ratio and DO have temporal column (effective_date). Signature does NOT fire.

---

## Read 2: Entity Resolution Loop (Global `entityIdFieldFromMeta`)

**File:** `web/src/app/api/calculation/run/route.ts:458-505`

```typescript
let entityIdFieldFromMeta: string | null = null;
for (const row of committedData) {
    const meta = row.metadata as Record<string, unknown> | null;
    if (meta?.entity_id_field && typeof meta.entity_id_field === 'string') {
        entityIdFieldFromMeta = meta.entity_id_field;
        break;  // ← TAKES FIRST FOUND
    }
}

// HF-181 Layer 3: Fallback — discover entity identifier from data when metadata missing
if (!entityIdFieldFromMeta && extIdToUuid.size > 0 && committedData.length > 0) {
    // ... discovers by VALUE matching
}

// Later, in per-row loop:
if (!resolvedEntityId && entityIdFieldFromMeta) {
    const rd = row.row_data as Record<string, unknown> | null;
    const extId = rd?.[entityIdFieldFromMeta];  // ← USES GLOBAL FIELD NAME
```

**CONFIRMED:** Loop takes FIRST `entity_id_field` from ANY row and uses it globally.
Transaction rows (389) use `sales_rep_id`. Quota rows (24) use `entity_id`.
Transaction rows encountered first → ALL rows looked up with `sales_rep_id` → quota rows have no `sales_rep_id` → unresolved.

---

## Read 3: Entity Agent Scoring — How It Wins

**File:** `web/src/lib/sci/signatures.ts:70-101`

Signature name is `one_per_entity_with_attributes` (not `entity_single_row_per_id`):

```typescript
const hasLowRepeat = structure.identifierRepeatRatio > 0 && structure.identifierRepeatRatio <= 1.5;
const isCategoricalHeavy = structure.categoricalFieldRatio > 0.25;
const hasId = patterns.hasEntityIdentifier;
const hasName = patterns.hasStructuralNameColumn;

if (hasLowRepeat && isCategoricalHeavy && hasId && hasName) {
    let confidence = 0.85;
    // HC reinforcement: name (+0.05), attribute (+0.03)
    signatureName: 'one_per_entity_with_attributes',
}
```

**CONFIRMED:** Entity signature fires at 0.85 confidence because:
- Quota file: identifierRepeatRatio ~1.0 (24 rows, 24 entities) ✓
- categoricalFieldRatio > 0.25 (name, role columns) ✓
- hasEntityIdentifier: true ✓
- hasStructuralNameColumn: true (name column detected) ✓

Entity wins at ~0.85 floor. Target signature doesn't fire at all.

---

## Read 4: Tenant Context Entity Overlap

**File:** `web/src/lib/sci/tenant-context.ts`

Entity overlap infrastructure EXISTS but is NOT wired into the classification pipeline:

```typescript
// tenant-context.ts:10 — "Tenant context is no longer used in classification (Decision 72)."

export interface EntityIdOverlap {
  sheetIdentifierColumn: string;
  sheetUniqueValues: Set<string>;
  matchingEntityIds: Set<string>;
  overlapPercentage: number;
  overlapSignal: 'high' | 'partial' | 'none';
}

export function computeEntityIdOverlap(
  profile: ContentProfile,
  rows: Record<string, unknown>[],
  existingEntityExternalIds: Set<string>,
): EntityIdOverlap | null { ... }

export function computeTenantContextAdjustments(
  tenantContext: TenantContext,
  overlap: EntityIdOverlap | null,
  profile: ContentProfile,
): TenantContextAdjustment[] { ... }
```

Current adjustments (overlap 'high'):
- `transaction: +0.15`
- `entity: -0.10`

**Missing:** No target agent boost for high entity overlap. Needs to be added.

**Integration needed:** `computeEntityIdOverlap` and adjustments need to be wired into
`resolver.ts` pipeline. Overlap data needs to be passed via `SynapticIngestionState`.

---

## Root Cause Summary

| Failure | Cause | Fix |
|---------|-------|-----|
| Classification | `per_entity_benchmarks_static` requires numericFieldRatio > 30% AND no temporal. Quota has 17% numeric + temporal column. Entity `one_per_entity_with_attributes` fires at 0.85. | New target signature + entity overlap |
| Entity Resolution | Global `entityIdFieldFromMeta` takes FIRST found (transaction's `sales_rep_id`). Quota rows have `entity_id` in their metadata but it's never read. | Per-row metadata resolution |
