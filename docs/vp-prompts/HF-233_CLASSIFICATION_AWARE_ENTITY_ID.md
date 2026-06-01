# HF-233: CLASSIFICATION-AWARE ENTITY_ID_FIELD RESOLUTION

## Governance

- **Predecessor:** HF-231 (PR #409, unified import pipeline — commitContentUnit), HF-232 (PR #410, decision tree reference_key discrimination)
- **Governing decisions:** D92 (5 SCI agents, entity binding at calc time), D108 LOCKED (HC Override Authority), D152 LOCKED (import sequence independence), D154 LOCKED (Korean Test)
- **Defect evidence:** Post-HF-232 clean slate import: sales files classified correctly as `transaction@85%`. `commitContentUnit` resolved `entity_id_field="transaction_id"` from HC `identifier` role. Entity Resolution created 389 ghost entities from transaction rows (one per transaction_id). Engine assigned 421 entities (32 real + 389 products/transactions). Every entity got sheet-matching fallback at $150/$200 floor.

## Why This HF Exists

`commitContentUnit` resolves `entity_id_field` from HC's `identifier` role regardless of classification. This is correct for entity and target files — the `identifier` column IS the entity identity. It is wrong for transaction files — the `identifier` column is the ROW's own identity (transaction_id), not the entity association. The entity association is the `reference_key` column (sales_rep_id).

The semantic relationship between HC column roles and entity association:

| Classification | `identifier` role means | `reference_key` role means | entity_id_field should be |
|---|---|---|---|
| entity | This row IS the entity | N/A (or org hierarchy reference) | identifier |
| target | This row is ABOUT the entity | N/A | identifier |
| transaction | This row's own event ID | This row BELONGS TO this entity | reference_key |
| reference | Dimensional key | N/A | null (no entity association) |

This is domain-agnostic. Any transaction file — franchise sales, financial POS, insurance claims, rebate submissions — has a per-row event identifier AND a reference to the entity the event belongs to. The entity association is always the `reference_key` for transactions.

## What Changes (1 file, ~15 lines)

**File:** `web/src/lib/sci/commit-content-unit.ts`

**Current entity_id_field resolution (from HF-231):**
```typescript
const hcIdentifier = hcInterpretations
  ? Array.from(hcInterpretations.entries())
      .find(([_, interp]) => interp.columnRole === 'identifier' && interp.confidence >= 0.80)
  : null;
const entityIdField = hcIdentifier?.[0]
  ?? confirmedBindings?.find(b => b.semanticRole === 'entity_identifier')?.sourceField
  ?? null;
```

Always uses `identifier` role. Correct for entity/target. Wrong for transaction.

**New resolution — classification-aware:**
```typescript
// HF-233: entity_id_field depends on the file's relationship to entities.
// Entity/target files: the identifier IS the entity (or references the entity directly).
// Transaction files: the identifier is the row's event ID; the reference_key links to the entity.
// Reference files: no entity association.
const classification = unit.confirmedClassification;

let entityIdField: string | null = null;

if (classification === 'transaction') {
  // Transaction: entity association is the reference_key (foreign key to entity)
  const hcReferenceKey = hcInterpretations
    ? Array.from(hcInterpretations.entries())
        .find(([_, interp]) => interp.columnRole === 'reference_key' && interp.confidence >= 0.80)
    : null;
  entityIdField = hcReferenceKey?.[0]
    ?? confirmedBindings?.find(b => b.semanticRole === 'entity_identifier')?.sourceField
    ?? null;
} else if (classification === 'reference') {
  // Reference: no entity association
  entityIdField = null;
} else {
  // Entity/target: the identifier IS the entity
  const hcIdentifier = hcInterpretations
    ? Array.from(hcInterpretations.entries())
        .find(([_, interp]) => interp.columnRole === 'identifier' && interp.confidence >= 0.80)
    : null;
  entityIdField = hcIdentifier?.[0]
    ?? confirmedBindings?.find(b => b.semanticRole === 'entity_identifier')?.sourceField
    ?? null;
}
```

**What this fixes:**
- CRP sales files: `entity_id_field="sales_rep_id"` (from `reference_key@0.95`) instead of `"transaction_id"` (from `identifier@0.95`)
- Entity Resolution creates 0 ghost entities from transaction rows — links transactions to existing 24 entities via sales_rep_id
- Engine calculates for 24 real entities (8 Senior Rep + 16 Rep) instead of 421

**What this preserves:**
- Quota file: classification=target → `entity_id_field="entity_id"` from identifier role. Unchanged.
- Roster file: classification=entity → `entity_id_field="employee_id"` from identifier role. Unchanged.
- Hub capacity file: classification=reference → `entity_id_field=null`. No entity association.

**Korean Test:** The condition checks `classification` values (`'transaction'`, `'reference'`) — these are `AgentType` enum values from `sci-types.ts`, not domain vocabulary.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Final step: `gh pr create --base main --head hf-233-classification-aware-entity-id` with descriptive title+body
5. Commit this prompt to git as first action.
6. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any code changes.
7. **Every proof gate requires pasted evidence — code, terminal output, or grep results. PASS/FAIL self-attestation is NOT accepted.**

---

## PHASE 0: DIAGNOSTIC (5 min)

```bash
cd ~/spm-platform
git fetch origin
git checkout main && git pull origin main
git checkout -b hf-233-classification-aware-entity-id
```

### 0A: Read the current entity_id_field resolution in commitContentUnit

```bash
grep -n "entityIdField\|entity_id_field\|hcIdentifier\|identifier.*confidence\|reference_key" web/src/lib/sci/commit-content-unit.ts | head -20
```

Read 30 lines of context around the resolution block. Paste verbatim with line numbers.

### 0B: Confirm classification is available at resolution point

```bash
grep -n "confirmedClassification\|classification" web/src/lib/sci/commit-content-unit.ts | head -10
```

Confirm `unit.confirmedClassification` is in scope where entity_id_field is resolved. Paste.

### 0C: Confirm hcInterpretations access pattern

The resolution needs to find `reference_key` roles the same way it currently finds `identifier` roles. Confirm the `hcInterpretations` Map is accessible. Paste the type.

**Proof gate 0 (IMMUTABLE):**
```
□ Current entity_id_field resolution block pasted with line numbers
□ unit.confirmedClassification in scope at resolution point (paste)
□ hcInterpretations Map accessible (paste type and access pattern)
```

**Commit:** `git add -A && git commit -m "HF-233 Phase 0: diagnostic — current entity_id_field resolution" && git push origin hf-233-classification-aware-entity-id`

---

## PHASE 1: CLASSIFICATION-AWARE RESOLUTION (15 min)

**File:** `web/src/lib/sci/commit-content-unit.ts`

Replace the current `entityIdField` resolution block with the classification-aware version described above.

**Important — log the resolution for observability:**

After resolving entityIdField, the existing log line `[commitContentUnit] {classification} ({source}): N rows committed, data_type=X, entity_id_field="Y"` already includes entity_id_field. No additional logging needed. But add a comment documenting the classification-aware resolution:

```typescript
// HF-233: Classification-aware entity_id_field resolution.
// entity/target → HC identifier role (row IS/IS ABOUT the entity)
// transaction → HC reference_key role (row BELONGS TO the entity)
// reference → null (no entity association)
```

**Proof gate 1 (IMMUTABLE):**
```
□ Classification-aware resolution block implemented (paste full block + line numbers)
□ Transaction branch reads reference_key role (paste)
□ Entity/target branch reads identifier role (paste)
□ Reference branch sets null (paste)
□ confirmedBindings fallback preserved for all branches (paste)
□ npm run build exits 0
□ Korean Test:
    grep -nE "'sales_rep_id'|'transaction_id'|'employee_id'|'entity_id'" web/src/lib/sci/commit-content-unit.ts
    Must return 0 results
```

**Commit:** `git add -A && git commit -m "HF-233 Phase 1: classification-aware entity_id_field — reference_key for transactions" && git push origin hf-233-classification-aware-entity-id`

---

## PHASE 2: COMPLETION REPORT + PR (5 min)

Write completion report to `docs/completion-reports/HF-233_COMPLETION_REPORT.md` per Rules 25-28.

```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build
echo "BUILD EXIT: $?"
```

```bash
gh pr create --base main --head hf-233-classification-aware-entity-id \
  --title "HF-233: Classification-aware entity_id_field — reference_key for transactions, identifier for entity/target" \
  --body "commitContentUnit now resolves entity_id_field based on classification: entity/target files use HC identifier role (the row IS or IS ABOUT the entity); transaction files use HC reference_key role (the row BELONGS TO the entity via foreign key); reference files get null (no entity association). Fixes 389 ghost entities created from CRP transaction_id values. Domain-agnostic — any transaction file's entity association is its reference_key, not its row identifier."
```

HALT after PR. Architect clean-slates CRP (including fingerprints), re-imports all files, verifies sales files produce `entity_id_field="sales_rep_id"` and Entity Resolution creates 0 ghost entities.

---

## SCOPE BOUNDARY

- **Do NOT modify** hc-pattern-classifier.ts — classification is correct
- **Do NOT modify** convergence-service.ts — convergence is separate
- **Do NOT modify** route.ts — engine is separate
- **Do NOT modify** intent-executor.ts — execution is separate
- **Do NOT modify** the committed_data insert shape — only the entity_id_field value changes
- **Do NOT add** any new npm dependencies

## ANTI-PATTERNS

**AP-1: Hardcoding column names.** The resolution reads HC column ROLES (`identifier`, `reference_key`), not column NAMES (`sales_rep_id`, `transaction_id`). If you find yourself writing a column name string, STOP.

**AP-2: Making entity_id_field optional only for reference.** ALL branches must produce a value or null. The fallback to `confirmedBindings` must exist for all classification branches — HC may not have identified the role.
