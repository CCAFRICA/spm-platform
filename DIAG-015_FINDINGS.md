# DIAG-015 FINDINGS
## Tier 1 Flywheel entity_id_field Loss
## Date: 2026-03-30

---

## Tier 1 → confirmedBindings Reconstruction Code Path

| Step | File | Lines | What Happens |
|------|------|-------|-------------|
| 1. Fingerprint lookup | `web/src/app/api/import/sci/analyze/route.ts` | 102-119 | `lookupFingerprint()` called. Returns `{ tier: 1, classificationResult, columnRoles, confidence }` |
| 2. Skip LLM for Tier 1 | `web/src/app/api/import/sci/analyze/route.ts` | 120-135 | `skipHC = true` for Tier 1 → `enhanceWithHeaderComprehension()` NOT called → `profile.headerComprehension` stays NULL |
| 2b. Build proposal | `web/src/lib/sci/synaptic-ingestion-state.ts` | 483-630 | `buildProposalFromState()` calls `generateSemanticBindings()` |
| 2c. Generate bindings | `web/src/lib/sci/agents.ts` | 438-510 | `generateSemanticBindings()` reads `profile.headerComprehension` → **NULL** for Tier 1. Falls back to structural heuristics only. |
| 3. User sees proposal | `web/src/components/sci/SCIProposal.tsx` | — | Displays `unit.fieldBindings` from structural fallback. **Missing semantic roles from flywheel.** |
| 4. User confirms | `web/src/components/sci/SCIExecution.tsx` | 167-186 | `confirmedBindings: proposalUnit.fieldBindings` — sends structural-only bindings to execute |
| 5. Execute reads binding | `web/src/app/api/import/sci/execute/route.ts` | 635, 776 | `confirmedBindings.find(b => b.semanticRole === 'entity_identifier')` → NOT FOUND → `entityIdField = undefined` → `metadata.entity_id_field = null` |

## The Divergence Point

**Exact location:** `web/src/app/api/import/sci/analyze/route.ts`, lines 120-135

```typescript
const skipHC = flywheelResult?.tier === 1 && flywheelResult.match;
const hcMetrics = skipHC
  ? { llmCalled: false, llmCallDuration: 0, averageConfidence: flywheelResult!.confidence, ... }
  : await enhanceWithHeaderComprehension(profileMap, ...);
```

When `skipHC = true` (Tier 1):
- `enhanceWithHeaderComprehension()` is NOT called
- `profile.headerComprehension` stays NULL
- `flywheelResult.columnRoles` is NEVER injected back into the profile
- `flywheelResult.classificationResult.fieldBindings` is NEVER used

When `skipHC = false` (Tier 3):
- LLM runs full Header Comprehension
- `profile.headerComprehension` is populated with semantic roles
- `generateSemanticBindings()` gets correct `hcRole` for each field
- `entity_identifier` is correctly assigned

**The gap:** The Tier 1 path retrieves flywheel data (`columnRoles`, `classificationResult`) but NEVER uses it to reconstruct the profile's semantic context. The `buildProposalFromState()` → `generateSemanticBindings()` chain has no flywheel data to work with.

## TWO COMPOUNDING BUGS

### Bug 1: Tier 1 path ignores flywheel data (PRIMARY)

`flywheelResult.columnRoles` and `flywheelResult.classificationResult.fieldBindings` are returned by `lookupFingerprint()` but never injected into the profile. The proposal is built from structural heuristics only.

### Bug 2: Fingerprint stores wrong column_roles (SECONDARY)

Even if Bug 1 were fixed, the stored `column_roles` for CRP transaction files have `sales_rep_id: "category_code"` instead of `"entity_identifier"`:

```json
{
  "date": "transaction_date",
  "quantity": "transaction_count",
  "order_type": "category_code",
  "sales_rep_id": "category_code",    ← WRONG (should be entity_identifier)
  "total_amount": "transaction_count",
  "product_category": "category_code"
}
```

The fingerprint was written from the INITIAL classification (pre-LLM, pre-user-confirmation). The first file's LLM enhanced the classification and correctly identified `sales_rep_id` as `entity_identifier`, but the fingerprint was already written with the structural-only roles.

**Impact:** Even if Bug 1 is fixed to inject `columnRoles` into the profile, the injected role for `sales_rep_id` would be `"category_code"`, not `"entity_identifier"`. The fix must either:
- Update the fingerprint after user confirmation (write confirmed roles back)
- OR use `classificationResult.fieldBindings` instead of `column_roles` (the fieldBindings in the classification_result also have the wrong role)
- OR inject the flywheel bindings AND re-run LLM enhancement for Tier 1 (defeats the purpose of Tier 1)

## Database Evidence

### structural_fingerprints (CRP transaction files)

```
hash: 4efbcb34e91216461f1a85b3f4c50875234c52ab5869320679d41a918b20eaeb
classification_result.fieldBindings[sales_rep_id].semanticRole = "category_code"
column_roles.sales_rep_id = "category_code"
match_count: 2 (matched twice — once for Jan 1-15, once for Jan 16+)
confidence: 0.667
```

### committed_data entity_id_field by source_date

```
2026-01-01  entity_id_field: sales_rep_id   ← File 1 (Tier 3, LLM ran)
2026-01-16  entity_id_field: null            ← File 2+ (Tier 1, flywheel)
```

Clean boundary at the file split confirms Tier 1 is the trigger.

### import_batches

3 batches found. `metadata.recognitionTier` and `metadata.sourceFileName` are not set (the metadata structure doesn't include these fields at the batch level).

## Root Cause — Confirmed

The hypothesis from the diagnostic prompt is **CONFIRMED with one important addition:**

1. ✅ First file classified as Tier 3 (novel) → LLM correctly identified `sales_rep_id` as `entity_identifier` → `confirmedBindings` correct → `metadata.entity_id_field = 'sales_rep_id'`
2. ✅ Second file classified as Tier 1 (exact match) → LLM skipped
3. ✅ `flywheelResult.columnRoles` never injected into profile
4. ✅ `generateSemanticBindings()` falls back to structural heuristics → `entity_identifier` not assigned to `sales_rep_id`
5. ✅ Execute route finds no `entity_identifier` → `metadata.entity_id_field = null`
6. **NEW:** Even if the Tier 1 path DID use `columnRoles`, the stored roles have `sales_rep_id: "category_code"` — the fingerprint was written from pre-LLM classification, not from confirmed bindings.

## Recommended Fix Location

### Fix 1 (Critical): Inject flywheel fieldBindings into Tier 1 proposal

**File:** `web/src/app/api/import/sci/analyze/route.ts`
**Where:** After lines 120-135 (the `skipHC` section), BEFORE `buildProposalFromState()`

When `flywheelResult.tier === 1 && flywheelResult.match`:
- Read `classificationResult.fieldBindings` from the flywheel result
- Inject these as the proposal's `fieldBindings` directly (bypass `generateSemanticBindings`)
- OR reconstruct a synthetic `headerComprehension` from `columnRoles` and inject it into the profile

### Fix 2 (Critical): Update fingerprint after user confirmation

**File:** `web/src/app/api/import/sci/execute/route.ts`
**Where:** After successful execution, when `confirmedBindings` are available

Update the structural_fingerprint's `column_roles` and `classification_result.fieldBindings` with the CONFIRMED roles from the user, not the initial structural-only roles.

### Fix Priority

- **Fix 1 alone** resolves the immediate Tier 1 binding loss but with wrong roles from the fingerprint
- **Fix 2 alone** fixes future imports (after re-import) but doesn't help current Tier 1 proposals
- **Both fixes together** provide the complete solution: confirmed roles are persisted in fingerprints, and Tier 1 lookups correctly reconstruct bindings

### Simplest Viable Fix (Fix 1 variant)

Instead of using the potentially-wrong `columnRoles` from the fingerprint, the Tier 1 path should use `classificationResult.fieldBindings` directly as the proposal's `fieldBindings`. This bypasses the broken `generateSemanticBindings()` path entirely. The fieldBindings in classificationResult may have wrong roles too (Bug 2), but this establishes the correct code path. Fix 2 then ensures correct roles are stored for future lookups.
