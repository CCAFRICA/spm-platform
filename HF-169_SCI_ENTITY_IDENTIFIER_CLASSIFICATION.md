# HF-169: SCI Entity Identifier Classification Fix
## Classification: Hotfix — SCI / Classification / Korean Test Compliant
## Priority: P0 — CRP calculation pipeline blocked (all entities get $0 except intercept)
## Scope: 1 file — scoring-agents.ts (semantic role assignment)
## Root Cause: CONFIRMED via Supabase query + Vercel logs + code review (not speculation)

---

## CC_STANDING_ARCHITECTURE_RULES v3.0 — LOAD FROM REPO ROOT

Before ANY implementation, read `CC_STANDING_ARCHITECTURE_RULES.md` at repo root. All rules 1-39 active. This HF specifically invokes:

- **Rule 34 (No Bypass):** Structural fix using existing Decision 105 cardinality signal.
- **Korean Test (AP-25):** The fix uses structural heuristics (distinctCount, rowCount). Zero field-name matching.
- **Rules 25-28 (Completion Reports):** Full completion report with pasted evidence mandatory.

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I." Just act. Execute every phase in sequence. Commit after each phase. Push after each commit.

---

## THE PROBLEM — EVIDENCE-BASED

### Evidence Chain

1. **Supabase query:** CRP committed_data has `metadata.entity_id_field = 'transaction_id'` on 182 rows. The SCI classified `transaction_id` as the entity identifier instead of `sales_rep_id`.

2. **OB-183 calc-time resolution:** Reads `metadata.entity_id_field`, finds `'transaction_id'`, tries to match `row_data.transaction_id` values against entity `external_id` values. Transaction IDs (e.g., "TXN-001") don't match any entity external_id → 0 rows resolved to entities.

3. **Vercel logs:** `364 committed_data rows (0 entity-level, 364 store-level)` — all rows unassociated with any entity. `applyMetricDerivations` receives empty map → derived metrics = 0 → `linear_function` computes `0.06 × 0 + 200 = 200` (intercept only).

4. **Plan 1 Grand total: $5,000** — exactly the sum of intercepts across 31 entities. GT should be $360,007.84.

### Root Cause in Code

**File:** `web/src/lib/sci/scoring-agents.ts` — function `assignSemanticRole`

```typescript
// HC identifier or reference_key → entity_identifier regardless of agent
if (hcRole === 'identifier' || hcRole === 'reference_key') {
  return { role: 'entity_identifier', context: `${field.fieldName} — identifier`, confidence: 0.90 };
}
```

**Every column that HC labels as "identifier" gets `entity_identifier` role at 0.90 confidence.** There is no distinction between:
- **Entity identifiers:** moderate cardinality (one value per entity, many rows per value) — e.g., `sales_rep_id` with distinctCount=31 in 182 rows (repeat ratio ~5.9)
- **Transaction identifiers:** maximum cardinality (unique per row) — e.g., `transaction_id` with distinctCount=182 in 182 rows (repeat ratio ~1.0)

The same bug exists in `inferRoleForAgent` (called by `generatePartialBindings`):
```typescript
if (hcRole === 'identifier' || (field.dataType === 'integer' && !field.distribution.isSequential)) {
  return { role: 'entity_identifier', ... };
}
```

### The Structural Signal Already Exists

**Decision 105** established identifier-relative cardinality. The content profiler already computes:
- `identifierRepeatRatio = rowCount / idField.distinctCount`
- Each field has `distinctCount`

A transaction identifier has `distinctCount ≈ rowCount` (repeat ratio ≈ 1.0).
An entity identifier has `distinctCount << rowCount` (repeat ratio >> 1.0).

The fix: when HC says "identifier" on a column whose `distinctCount` is close to `rowCount` (near-unique), classify it as `transaction_identifier` instead of `entity_identifier`. Only columns with moderate cardinality (distinctCount significantly less than rowCount) should be `entity_identifier`.

---

## Architecture Decision Record

```
ARCHITECTURE DECISION RECORD
============================
Problem: SCI classifies ALL HC-labeled identifiers as entity_identifier.
         Transaction file with both transaction_id and sales_rep_id:
         first one HC labels "identifier" wins entity_identifier role.
         This causes calc-time entity resolution to fail.

Option A: Pass rowCount to assignSemanticRole, use cardinality threshold
  - Scale test: Works at 10x? YES — O(1) per field
  - AI-first: Any hardcoding? NO — structural heuristic (Korean Test)
  - Transport: N/A
  - Atomicity: YES — classification is per-field, independent

Option B: Add new SemanticRole 'transaction_identifier' to the type system
  - Scale test: YES
  - AI-first: NO
  - Transport: N/A
  - Atomicity: YES
  - PREFERRED: more precise semantic model

CHOSEN: Option B — Add 'transaction_identifier' semantic role AND use
        cardinality to distinguish. When HC says "identifier":
        - If distinctCount / rowCount > 0.8 → transaction_identifier
        - If distinctCount / rowCount <= 0.8 → entity_identifier
        This gives the downstream code (OB-183, convergence) the correct
        signal. The 0.8 threshold means: if >80% of values are unique,
        it's a transaction ID, not an entity ID.

REJECTED: None — Option A is a subset of Option B. Both changes needed.
```

---

## CLT FINDINGS ADDRESSED

| Finding | Description | Status After HF-169 |
|---------|-------------|---------------------|
| CLT-187 F02 | Plan 1 produces $5,000 (GT: $360,008) — intercept only | Root cause: entity resolution fails |
| CLT-187 F03 | Plan 3 convergence succeeds but $0 | Same root cause |
| CLT-187 F05 | convergence_bindings always 0 | Related — entity resolution prerequisite |
| CLT-187 F06 | Engine falls back to sheet-matching | Consequence of F02 |

---

## CC FAILURE PATTERNS TO AVOID

| Pattern | How to Avoid |
|---------|--------------|
| FP-69 (Fix one, leave others) | Fix BOTH `assignSemanticRole` AND `inferRoleForAgent`. Same bug, two locations. |
| FP-36 (Behavioral change without test) | CRP clean slate + reimport + calculation verifies the fix end-to-end. |

---

## PHASE 1: DIAGNOSTIC — Locate and Read Current Code

### Step 1.1: Find the file

```bash
cd /Users/$(whoami)/Projects/spm-platform
find web/src -name "scoring-agents.ts" -path "*sci*"
```

### Step 1.2: Read the semantic role assignment functions

```bash
grep -n "assignSemanticRole\|inferRoleForAgent\|entity_identifier\|transaction_identifier\|SemanticRole" web/src/lib/sci/scoring-agents.ts | head -40
```

### Step 1.3: Read the SemanticRole type definition

```bash
grep -rn "type SemanticRole\|SemanticRole =" web/src/lib/sci/ --include="*.ts"
```

Locate where `SemanticRole` is defined. We need to add `'transaction_identifier'` to the union type.

### Step 1.4: Read generateSemanticBindings to see what profile data is available

```bash
grep -n -A10 "function generateSemanticBindings" web/src/lib/sci/scoring-agents.ts
```

### Step 1.5: Confirm rowCount is available on the profile

```bash
grep -n "rowCount\|row_count\|patterns\." web/src/lib/sci/scoring-agents.ts | head -20
```

**PASTE all diagnostic output in the completion report.**

---

## PHASE 2: IMPLEMENTATION

### Change 2A: Add `transaction_identifier` to SemanticRole type

Find the `SemanticRole` type definition. Add `'transaction_identifier'` to the union. This is a type-only change — no runtime behavior until the assignment functions use it.

### Change 2B: Pass rowCount to assignSemanticRole and inferRoleForAgent

Both functions currently receive `(field, agent, hcRole)`. Add `rowCount: number` as a fourth parameter.

**In `generateSemanticBindings`:**
```typescript
function generateSemanticBindings(profile: ContentProfile, agent: AgentType): SemanticBinding[] {
  const hc = profile.headerComprehension;
  const rowCount = profile.patterns?.rowCount ?? profile.fields.length; // use actual row count
  return profile.fields.map(field => {
    const hcInterp = hc?.interpretations.get(field.fieldName);
    const hcRole = hcInterp?.columnRole;
    const binding = assignSemanticRole(field, agent, hcRole, rowCount);
    // ...
  });
}
```

**IMPORTANT:** Find how `rowCount` is stored on the profile. It may be `profile.patterns.rowCount` or on the profile directly. Use the diagnostic from Step 1.5 to determine the correct property path. If rowCount is not directly on the profile patterns, check if it's computed from `profile.structure.rowCount` or similar. Do NOT assume — grep for it.

**In `generatePartialBindings`:**
Same change — pass rowCount to `inferRoleForAgent`.

### Change 2C: Fix assignSemanticRole — cardinality-based identifier classification

Replace the current identifier block:

**BEFORE:**
```typescript
// HC identifier or reference_key → entity_identifier regardless of agent
if (hcRole === 'identifier' || hcRole === 'reference_key') {
  return { role: 'entity_identifier', context: `${field.fieldName} — identifier`, confidence: 0.90 };
}
// Structural sequential integer → entity_identifier
if (field.dataType === 'integer' && field.distribution.isSequential) {
  return { role: 'entity_identifier', context: `${field.fieldName} — sequential identifier`, confidence: 0.85 };
}
```

**AFTER:**
```typescript
// HF-169: Distinguish entity identifiers from transaction identifiers
// using structural cardinality (Decision 105). Entity identifiers have
// moderate cardinality (one per entity, many rows per value). Transaction
// identifiers have maximum cardinality (unique per row).
// Korean Test: uses distinctCount and rowCount — zero field name matching.
if (hcRole === 'identifier' || hcRole === 'reference_key') {
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) {
    // >80% unique values → this is a per-row identifier (transaction ID, order ID)
    return { role: 'transaction_identifier', context: `${field.fieldName} — per-row identifier (uniqueness ${(uniquenessRatio * 100).toFixed(0)}%)`, confidence: 0.90 };
  }
  // Moderate cardinality → entity identifier (employee ID, rep ID, store ID)
  return { role: 'entity_identifier', context: `${field.fieldName} — entity identifier (uniqueness ${(uniquenessRatio * 100).toFixed(0)}%)`, confidence: 0.90 };
}
// Structural sequential integer → entity_identifier (legacy heuristic)
if (field.dataType === 'integer' && field.distribution.isSequential) {
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) {
    return { role: 'transaction_identifier', context: `${field.fieldName} — sequential per-row identifier`, confidence: 0.85 };
  }
  return { role: 'entity_identifier', context: `${field.fieldName} — sequential entity identifier`, confidence: 0.85 };
}
```

### Change 2D: Fix inferRoleForAgent — same cardinality logic

Apply the identical change to `inferRoleForAgent`. Add `rowCount` parameter and use the same uniqueness ratio check.

### Change 2E: Ensure downstream code handles transaction_identifier

The `entity_id_field` in committed_data metadata is set from the binding with `semanticRole === 'entity_identifier'`. Grep for all places that check for `entity_identifier`:

```bash
grep -rn "entity_identifier" web/src/lib/sci/ web/src/app/api/import/ --include="*.ts"
```

The code that sets `entity_id_field` in the import commit path:

```typescript
const entityIdBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
const entityIdField = entityIdBinding?.sourceField;
```

This should continue to work — it looks for `entity_identifier` specifically, not `transaction_identifier`. With the fix, `sales_rep_id` (lower cardinality) gets `entity_identifier` and `transaction_id` (high cardinality) gets `transaction_identifier`. The import path finds `sales_rep_id` and sets `entity_id_field` to `'sales_rep_id'`. Correct.

**Verify this by grepping.** Do NOT assume the binding lookup is in only one place.

### Step 2.6: Commit

```bash
git add web/src/lib/sci/scoring-agents.ts
# Also add any type definition file if SemanticRole is defined elsewhere
git commit -m "HF-169: SCI entity identifier classification — distinguish entity vs transaction identifiers via cardinality"
git push origin dev
```

---

## PHASE 3: BUILD

```bash
cd /Users/$(whoami)/Projects/spm-platform/web
kill $(lsof -ti:3000) 2>/dev/null || true
rm -rf .next
npm run build
```

**Build MUST pass.** If the build fails because `transaction_identifier` is not in a type union somewhere, find ALL places where SemanticRole is used as a discriminant (switch/case, if/else chains) and add handling for the new role.

**Do NOT add `transaction_identifier` to any logic that is specifically for entity resolution.** The point is that `transaction_identifier` is NOT an entity identifier — it should be ignored by entity resolution code.

---

## PHASE 4: CRP CLEAN SLATE

After the build passes, clean slate the CRP tenant data. Run this SQL in Supabase SQL Editor:

```sql
-- CRP Clean Slate: Delete all calculated/imported data for reimport
-- Tenant: e44bbcb1-2710-4880-8c7d-a1bd902720b7
-- DOES NOT delete: tenant record, rule_sets (plans), profiles

-- 1. Delete calculation results
DELETE FROM calculation_results 
WHERE batch_id IN (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
);

-- 2. Delete calculation batches
DELETE FROM calculation_batches 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

-- 3. Delete entity period outcomes
DELETE FROM entity_period_outcomes 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

-- 4. Delete committed data (all 364 rows including duplicates)
DELETE FROM committed_data 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

-- 5. Delete import batches
DELETE FROM import_batches 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

-- 6. Delete rule_set_assignments (will be recreated on reimport/calc)
DELETE FROM rule_set_assignments 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

-- 7. Delete entities (will be recreated from roster reimport)
DELETE FROM entities 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

-- 8. Delete periods (will be recreated)
DELETE FROM periods 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

-- 9. Clear input_bindings on rule_sets (convergence will regenerate)
UPDATE rule_sets 
SET input_bindings = '{}'::jsonb
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

-- 10. Delete classification signals
DELETE FROM classification_signals 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
```

**Verify clean state:**
```sql
SELECT 'committed_data' as t, COUNT(*) FROM committed_data WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
UNION ALL SELECT 'entities', COUNT(*) FROM entities WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
UNION ALL SELECT 'rule_set_assignments', COUNT(*) FROM rule_set_assignments WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
UNION ALL SELECT 'periods', COUNT(*) FROM periods WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
UNION ALL SELECT 'import_batches', COUNT(*) FROM import_batches WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
```

All counts must be 0.

**PASTE verification output in completion report.**

---

## PHASE 5: REIMPORT AND VERIFY CLASSIFICATION

**This phase is performed by Andrew in the browser after merging.**

### Step 5.1: Reimport CRP data file

In the CRP tenant, navigate to Import. Upload the CRP sales data file (02_crp_sales_20260101_20260115.csv). Let the SCI classify and import.

### Step 5.2: Verify entity_id_field

After import completes, run in Supabase:

```sql
SELECT metadata->>'entity_id_field' as entity_id_field, COUNT(*)
FROM committed_data
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
GROUP BY 1;
```

**Expected:** `entity_id_field = 'sales_rep_id'` (NOT 'transaction_id')

If it still shows `transaction_id`, the fix didn't work — check Vercel logs for the SCI classification output.

### Step 5.3: Verify in Vercel logs

Look for `[SCI]` or `[Scoring]` log lines during import. The classification should show:
- `transaction_id` → `transaction_identifier` (high uniqueness)
- `sales_rep_id` → `entity_identifier` (moderate uniqueness)

---

## PHASE 6: PR CREATION

```bash
cd /Users/$(whoami)/Projects/spm-platform
gh pr create --base main --head dev \
  --title "HF-169: SCI entity identifier classification — distinguish entity vs transaction identifiers" \
  --body "## What
SCI classified \`transaction_id\` as \`entity_identifier\` instead of \`sales_rep_id\` in CRP data import. This caused OB-183 calc-time entity resolution to fail — 0 rows resolved to entities — all derived metrics = 0 — engine computed only intercepts.

## Root Cause
\`assignSemanticRole\` assigns \`entity_identifier\` to ANY column HC labels as 'identifier'. No cardinality distinction between entity IDs (moderate cardinality) and transaction IDs (maximum cardinality).

## Fix
Use structural cardinality (Decision 105) to distinguish:
- distinctCount/rowCount > 0.8 → \`transaction_identifier\` (per-row, unique)
- distinctCount/rowCount ≤ 0.8 → \`entity_identifier\` (per-entity, repeated)

New \`transaction_identifier\` semantic role added. Korean Test compliant — uses distinctCount and rowCount, zero field name matching.

Both \`assignSemanticRole\` AND \`inferRoleForAgent\` fixed (FP-69: fix all locations).

## Files Changed
- \`web/src/lib/sci/scoring-agents.ts\` — cardinality-based identifier classification
- Type definition file (if SemanticRole defined elsewhere)

## Verification
CRP clean slate → reimport → verify \`metadata.entity_id_field = 'sales_rep_id'\` → calculate → verify non-zero results.
"
```

---

## PHASE 7: PRODUCTION VERIFICATION (POST-MERGE)

After Andrew merges PR and Vercel deploys:

1. **Run CRP clean slate SQL** (Phase 4)
2. **Reimport CRP roster** → entities created
3. **Reimport CRP data file** → committed_data with correct entity_id_field
4. **Verify:** `metadata->>'entity_id_field'` = `'sales_rep_id'`
5. **Create period** (January 2026)
6. **Calculate Plan 1** (Capital Equipment)
7. **Check Vercel logs:** `OB-183: Resolved N rows to entities at calc time` — N should be > 0
8. **Check Grand total:** Should be significantly more than $5,000

---

## COMPLETION REPORT REQUIREMENTS

1. **Phase 1 diagnostic output** — all grep results
2. **Phase 2 diff** — `git diff` showing the changes
3. **Phase 3 build output** — exit 0
4. **Phase 4 clean slate verification** — all counts = 0
5. **Phase 6 PR URL**

**SELF-ATTESTATION IS NOT ACCEPTED.** Every claim must have pasted evidence.

---

## WHAT THIS HF DOES NOT DO

- Does NOT change the engine, convergence, or derivation logic (those work correctly)
- Does NOT change the calc route or middleware
- Does NOT add any field-name matching (Korean Test compliant)
- Does NOT change how OB-183 reads `entity_id_field` (downstream consumer is correct)
- Does NOT change import commit logic (it already looks for `entity_identifier` role)

---

*"The SCI said transaction_id was the entity. The engine believed it. 364 rows, 0 matches, $5,000 of intercepts. The structural signal — cardinality — was right there in the content profile. It just wasn't used."*
