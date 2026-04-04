# HF-184: Unified committed_data Writes — Import Sequence Independence

## CONTEXT

**Architectural principle violated:** OB-182 established import sequence independence. Decision 92 established binding at calc time. "Carry Everything, Express Contextually" means import ALL data with structural metadata, resolve relationships at calculation time. Classification is a HINT, not a gate that determines data quality.

**Current state:** Two of four SCI pipelines write committed_data correctly:
- `processDataUnit` (target/transaction bulk): ✅ source_date extracted, entity_id_field in metadata
- `executeTargetPipeline` / `executeTransactionPipeline`: ✅ same

Two pipelines do NOT:
- `processEntityUnit` (entity bulk): ❌ source_date = null, no entity_id_field
- `processReferenceUnit` (reference bulk): ❌ source_date = null, no entity_id_field
- `executeEntityPipeline` (entity execute): ❌ same
- `executeReferencePipeline` (reference execute): ❌ same

**Consequence:** If SCI classifies a quota file as "entity" (which happens when the roster hasn't been imported yet — zero entity overlap), the entity pipeline writes the data to committed_data WITHOUT source_date or entity_id_field. The engine's source_date fetch path never finds these rows (they have null source_date). The period-agnostic fallback (OB-128) fetches them but can't resolve them to entities (no entity_id_field). The user must reimport after importing the roster — an import sequence dependency.

**The fix:** All four pipelines call the same extractSourceDate and entity_identifier binding lookup that processDataUnit already uses. Classification determines the informational_label and any pipeline-specific side effects (entity pipeline also creates entities in the entities table). The committed_data write is UNIFORM.

---

## CC_STANDING_ARCHITECTURE_RULES.md

Include the full CC_STANDING_ARCHITECTURE_RULES.md at top of prompt. All rules apply.

---

## PHASE 0: DIAGNOSTIC — READ ACTUAL CODE (SR-A)

Read and paste the committed_data insert section from each of the four pipelines that need fixing:

### Read 1: processEntityUnit (bulk entity)
```bash
cd ~/spm-platform
grep -n -A 25 "insertRows = rows.map" web/src/app/api/import/sci/execute-bulk/route.ts | grep -A 25 "informational_label.*entity"
```

### Read 2: processReferenceUnit (bulk reference)
```bash
grep -n -A 25 "insertRows = rows.map" web/src/app/api/import/sci/execute-bulk/route.ts | grep -A 25 "informational_label.*reference"
```

### Read 3: executeEntityPipeline (execute entity)
```bash
grep -n -A 25 "insertRows = rows.map" web/src/app/api/import/sci/execute/route.ts | grep -A 25 "informational_label.*entity"
```

### Read 4: executeReferencePipeline (execute reference)
```bash
grep -n -A 25 "insertRows = rows.map" web/src/app/api/import/sci/execute/route.ts | grep -A 25 "informational_label.*reference"
```

### Read 5: processDataUnit (bulk target/transaction) — THE REFERENCE IMPLEMENTATION
```bash
grep -n -B 5 -A 40 "entity_id_field.*entityIdField" web/src/app/api/import/sci/execute-bulk/route.ts
```

This shows the exact code to replicate: the `entityIdBinding` lookup, `findDateColumnFromBindings`, `buildSemanticRolesMap`, `detectPeriodMarkerColumns`, and `extractSourceDate` calls, plus the metadata structure with `entity_id_field`.

**Paste all five outputs. Confirm the gap before writing any fix.**

**Commit:** `HF-184 Phase 0: Diagnostic — committed_data write comparison`

---

## PHASE 1: Unify Entity Pipeline (Bulk)

**File:** `web/src/app/api/import/sci/execute-bulk/route.ts`, function `processEntityUnit`

**What to add (BEFORE the `insertRows = rows.map(...)` block):**

```typescript
// HF-184: Unified committed_data writes — same as processDataUnit
// Classification is a hint, not a gate. All pipelines extract structural metadata.
const entityIdBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
const entityIdField = entityIdBinding?.sourceField;

const dateColumnHint = findDateColumnFromBindings(unit.confirmedBindings);
const semanticRolesMap = buildSemanticRolesMap(unit.confirmedBindings);
const periodMarkerHint = detectPeriodMarkerColumns(rows);
```

**What to change in each insert row:**

```typescript
// BEFORE (current):
source_date: null as string | null,
metadata: {
    field_identities: entityFieldIdentities,
    informational_label: 'entity',
},

// AFTER:
source_date: extractSourceDate(row, dateColumnHint, semanticRolesMap, periodMarkerHint),
metadata: {
    source: 'sci',  // or 'sci-bulk'
    proposalId,
    semantic_roles: semanticRoles,
    resolved_data_type: dataType,
    field_identities: entityFieldIdentities,
    informational_label: 'entity',
    entity_id_field: entityIdField || null,  // HF-184
},
```

**CRITICAL: Do NOT remove any existing entity pipeline behavior.** The entity pipeline also creates/enriches entries in the `entities` table. That side effect stays. The ONLY change is enriching the committed_data row with source_date and entity_id_field.

**CRITICAL: Import the extraction functions** if not already imported in this file:
```typescript
import {
    extractSourceDate,
    findDateColumnFromBindings,
    buildSemanticRolesMap,
    detectPeriodMarkerColumns,
} from '@/lib/sci/source-date-extraction';
```
These imports likely already exist (processDataUnit uses them in the same file). Verify — do not duplicate.

**Verification:**
```bash
# Entity pipeline now has source_date extraction
grep -n "extractSourceDate" web/src/app/api/import/sci/execute-bulk/route.ts
# Must appear in BOTH processDataUnit AND processEntityUnit contexts

# Entity pipeline now has entity_id_field
grep -n "entity_id_field" web/src/app/api/import/sci/execute-bulk/route.ts
# Must appear in BOTH processDataUnit AND processEntityUnit metadata blocks
```

**Commit:** `HF-184 Phase 1: Entity pipeline — unified committed_data writes`

---

## PHASE 2: Unify Reference Pipeline (Bulk)

**File:** `web/src/app/api/import/sci/execute-bulk/route.ts`, function `processReferenceUnit`

**Same change as Phase 1** — add the extraction calls before the insert block, add `source_date` and `entity_id_field` to each row.

The reference pipeline was rewritten by OB-195 Layer 1 to write to committed_data (which works). It just doesn't extract source_date or entity_id_field.

**Verification:**
```bash
grep -n "extractSourceDate" web/src/app/api/import/sci/execute-bulk/route.ts
# Must now appear in processDataUnit, processEntityUnit, AND processReferenceUnit

grep -n "entity_id_field" web/src/app/api/import/sci/execute-bulk/route.ts
# Must appear in all three pipeline metadata blocks
```

**Commit:** `HF-184 Phase 2: Reference pipeline — unified committed_data writes`

---

## PHASE 3: Unify Entity Pipeline (Execute)

**File:** `web/src/app/api/import/sci/execute/route.ts`, function `executeEntityPipeline`

**Same pattern.** Add extraction calls, enrich the committed_data insert rows.

**Verification:**
```bash
grep -n "extractSourceDate" web/src/app/api/import/sci/execute/route.ts
# Must appear in executeTargetPipeline, executeTransactionPipeline, AND executeEntityPipeline

grep -n "entity_id_field" web/src/app/api/import/sci/execute/route.ts
# Must appear in all three
```

**Commit:** `HF-184 Phase 3: Entity execute pipeline — unified committed_data writes`

---

## PHASE 4: Unify Reference Pipeline (Execute)

**File:** `web/src/app/api/import/sci/execute/route.ts`, function `executeReferencePipeline`

**Same pattern.**

**Verification:**
```bash
grep -n "extractSourceDate" web/src/app/api/import/sci/execute/route.ts
# Must appear in ALL FOUR execute pipelines

grep -n "entity_id_field" web/src/app/api/import/sci/execute/route.ts
# Must appear in ALL FOUR
```

**Commit:** `HF-184 Phase 4: Reference execute pipeline — unified committed_data writes`

---

## PHASE 5: Build Verification

```bash
cd ~/spm-platform/web
rm -rf .next
npm run build
# Must exit 0

cd ~/spm-platform
git stash
npx tsc --noEmit 2>&1 | head -20
npx next lint 2>&1 | head -20
git stash pop
```

**Commit:** `HF-184 Build verification`

---

## PHASE 6: Completion Report

Create `HF-184_COMPLETION_REPORT.md` in PROJECT ROOT.

| # | Gate | How to Verify | PASS/FAIL | Evidence |
|---|------|---------------|-----------|----------|
| 1 | `npm run build` exits 0 | Paste exit code and final line | | |
| 2 | `tsc --noEmit` exits 0 | Paste output | | |
| 3 | `npx next lint` exits 0 | Paste output | | |
| 4 | extractSourceDate in ALL bulk pipelines | `grep -c "extractSourceDate" execute-bulk/route.ts` ≥ 3 | | |
| 5 | extractSourceDate in ALL execute pipelines | `grep -c "extractSourceDate" execute/route.ts` ≥ 4 | | |
| 6 | entity_id_field in ALL bulk pipeline metadata | `grep -c "entity_id_field" execute-bulk/route.ts` ≥ 3 | | |
| 7 | entity_id_field in ALL execute pipeline metadata | `grep -c "entity_id_field" execute/route.ts` ≥ 4 | | |
| 8 | Entity pipeline still creates entities | `grep -n "entities.*insert\|from('entities')" execute-bulk/route.ts` returns matches | | |
| 9 | No unauthorized changes | `git diff --stat HEAD` shows only route.ts files | | |

**Evidence = PASTED terminal output. Not descriptions.**

**Commit:** `HF-184 Completion report`

---

## PHASE 7: PR Creation

```bash
cd ~/spm-platform
gh pr create --base main --head dev \
  --title "HF-184: Unified committed_data writes — import sequence independence" \
  --body "All four SCI pipelines (entity, target, transaction, reference) now write
committed_data rows with source_date and entity_id_field.

Previously, entity and reference pipelines wrote source_date = null and omitted
entity_id_field. This created an import sequence dependency — files classified as
'entity' had invisible data at calculation time.

Now classification determines the informational_label and pipeline-specific side effects
(entity pipeline still creates entities). The committed_data write is uniform.
Engine resolves at calculation time regardless of classification or import order.

Architectural principle: Carry Everything, Express Contextually.
Classification is a hint, not a gate.

Decisions enforced: OB-182 (sequence independence), Decision 92 (calc-time binding),
Decision 111 (all data → committed_data), AP-25 (Korean Test)."
```

---

## WHAT NOT TO DO

1. **DO NOT remove entity creation from the entity pipeline.** The entity pipeline creates/enriches entries in the `entities` table. That behavior stays. This HF only adds source_date and entity_id_field to the committed_data rows.
2. **DO NOT modify processDataUnit or the target/transaction pipelines.** They already work correctly. They are the reference implementation — copy from them, don't change them.
3. **DO NOT modify the calculation engine.** HF-183 Fix 2 (per-row entity_id_field) is already deployed and handles the engine side.
4. **DO NOT modify signatures.ts or agents.ts.** HF-183 Fix 1 is already deployed. Classification improvements are additive; they don't replace the sequence independence fix.
5. **DO NOT hardcode field names.** Korean Test applies.
6. **DO NOT add console.log inside per-row loops.** Rule 20.
7. **DO NOT skip Phase 0.** SR-A — read actual code, paste it, confirm the gap before writing.

---

## POST-MERGE VERIFICATION (Andrew)

**Test 1 — Roster first (should still work):**
1. Clean slate
2. Import roster → entities
3. Import quota → should classify as target (HF-183), committed_data with source_date + entity_id_field
4. Calculate Plan 2 → $28,159.48

**Test 2 — Quota first (the sequence independence test):**
1. Clean slate
2. Import quota FIRST (no entities exist)
3. SCI classifies as entity (no overlap boost) — this is expected and acceptable
4. Check committed_data: quota rows should have source_date = '2026-01-01' and entity_id_field set — EVEN THOUGH classified as entity
5. Import roster → entities created
6. Import transactions
7. Calculate Plan 2 → should also reach $28,159.48

**Test 2 is the proof that import order doesn't matter.**

---

*"Classification is a hint, not a gate. Every pipeline carries everything. The engine expresses contextually."*
