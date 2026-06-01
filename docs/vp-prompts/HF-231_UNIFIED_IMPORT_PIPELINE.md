# HF-231: UNIFIED IMPORT PIPELINE — commitContentUnit

## Governance

- **Predecessor:** HF-184 (PR #331, unified committed_data writes — partial), HF-194 (PR #370, field_identities alignment — partial), DIAG-022 (PARALLEL_SPECIALIZED verdict), AP-17 tech debt (parallel metadata construction)
- **Governing decisions:** D92 (5 SCI agents, source_date, calc-time binding), D108 LOCKED (HC Override Authority), D152 LOCKED (import sequence independence), D153 LOCKED (signal surface), D154 LOCKED (Korean Test)
- **Defect history:** HF-184 patched 4 sub-pipelines. HF-194 patched field_identities. Today: target sub-pipeline can't find entity_identifier binding on clean slate. Same defect class — drifted sub-pipeline — fourth recurrence.
- **AP-17 closure:** This HF permanently closes AP-17 (parallel metadata construction) by eliminating the parallel paths.

## Why This HF Exists

The import infrastructure has 8 committed_data write sites across 2 routes and 4 sub-pipelines per route. Each builds its own metadata object literal. They drift independently. Every fix aligns one with the reference implementation. Then another drifts. Four recurrences (HF-184, HF-194, today's entity_identifier failure, and the original OB-195 regression).

The DIAG-022 verdict was PARALLEL_SPECIALIZED — the two routes had different responsibilities (transport: browser upload vs Storage). But the only structural difference is transport. Processing logic should be identical. It isn't, because each route has its own implementation.

The fix is consolidation. One import path. One committed_data write function. Classification determines side effects, not code paths.

## What Changes

### Architecture

**Before (8 write sites):**
```
execute/route.ts:
  executeEntityPipeline → committed_data insert (inline)
  executeReferencePipeline → committed_data insert (inline)
  executeTargetPipeline → committed_data insert (inline)
  executeTransactionPipeline → committed_data insert (inline)

execute-bulk/route.ts:
  processEntityUnit → committed_data insert (inline)
  processReferenceUnit → committed_data insert (inline)
  processDataUnit → committed_data insert (inline) ← reference implementation
  processPlanUnit → plan interpretation + committed_data insert (inline)
```

**After (1 write function):**
```
lib/sci/commit-content-unit.ts:
  commitContentUnit(unit, rows, tenantId, supabase) → committed_data insert
    - source_date extraction (from HC bindings)
    - entity_id_field resolution (from HC identifier role — Decision 108)
    - field_identities construction (shared helper)
    - metadata assembly (one object, one shape)
    - side effects by classification:
      - 'entity': create/enrich entities in entities table
      - 'plan': trigger plan interpretation AI
      - 'target'/'transaction'/'reference': informational_label only

execute-bulk/route.ts:
  processContentUnit → calls commitContentUnit
  (processEntityUnit, processReferenceUnit, processDataUnit retired)

execute/route.ts:
  Becomes thin adapter:
    1. Upload file content to Storage
    2. Call execute-bulk pipeline
  OR: retained only for plan document upload (non-CSV), calling commitContentUnit for the committed_data write
```

### Key Design Decisions

**entity_id_field comes from HC, not convergence bindings.** HC identifies `entity_id:identifier@0.95`. The `commitContentUnit` function reads HC column roles to find the identifier column. No dependency on convergence bindings existing. Decision 108 enforcement — HC is the authority. Decision 152 compliance — no import sequence dependency.

**Classification is a label, not a gate.** `commitContentUnit` writes to committed_data regardless of classification. The `informational_label` field records the classification. Side effects (entity creation, plan interpretation) are triggered by classification but do not change the committed_data write shape.

**source_date extraction uses HC temporal role.** HC identifies temporal columns (`effective_date:temporal@0.98`). The extraction function uses HC's temporal role to find the date column. If HC didn't identify a temporal column, falls back to structural detection (existing `findDateColumnFromBindings` logic).

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Final step: `gh pr create --base main --head hf-231-unified-import-pipeline` with descriptive title+body
5. Commit this prompt to git as first action.
6. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any code changes.
7. **Supabase `.in()` batch ≤ 200.**
8. **Every proof gate requires pasted evidence — code, terminal output, or grep results. PASS/FAIL self-attestation is NOT accepted.**

---

## PHASE 0: DIAGNOSTIC — READ CURRENT STATE (20 min)

```bash
cd ~/spm-platform
git fetch origin
git checkout main && git pull origin main
git checkout -b hf-231-unified-import-pipeline
```

### 0A: Read execute-bulk sub-pipelines

```bash
# List all processing functions
grep -n "async function process\|async function execute" web/src/app/api/import/sci/execute-bulk/route.ts | head -20
```

For each function found, read the committed_data insert block (the `supabase.from('committed_data').insert(...)` or `insertRows = rows.map(...)` section). Paste verbatim with line numbers.

**Critical: identify the reference implementation** — which sub-pipeline has the most complete metadata (source_date, entity_id_field, field_identities, semantic_roles)?

### 0B: Read execute sub-pipelines

```bash
grep -n "async function execute.*Pipeline\|async function process" web/src/app/api/import/sci/execute/route.ts | head -20
```

For each function found, read the committed_data insert block. Paste verbatim.

### 0C: Read the plan interpretation path

```bash
grep -n "processPlanUnit\|plan.*interpret\|anthropic\|bridgeAI\|emitPlan" web/src/app/api/import/sci/execute-bulk/route.ts | head -20
grep -n "executeplanPipeline\|plan.*interpret\|anthropic\|bridgeAI\|emitPlan" web/src/app/api/import/sci/execute/route.ts | head -20
```

Read the plan interpretation trigger. Is it in execute-bulk, execute, or both? How is it triggered (by classification? by file type?)? Paste the code path.

### 0D: Read the entity creation side effect

```bash
grep -n "entities.*insert\|entities.*upsert\|Entity:.*new\|enriched\|Entity Resolution" web/src/app/api/import/sci/execute-bulk/route.ts | head -20
```

Read the entity creation logic. This is the side effect of entity classification. It must survive consolidation.

### 0E: Read existing shared helpers

```bash
grep -n "buildFieldIdentitiesFromBindings\|extractSourceDate\|findDateColumnFromBindings\|buildSemanticRolesMap" web/src/lib/sci/field-identities.ts web/src/lib/sci/source-date-extraction.ts | head -20
```

These are helpers already extracted by HF-184 and HF-194. The new `commitContentUnit` function should call these.

### 0F: Read the execute route's upload-to-Storage path (if any)

```bash
grep -n "storage\|storagePath\|supabase.*storage\|upload" web/src/app/api/import/sci/execute/route.ts | head -20
```

Does the execute route already upload to Storage? Or does it receive file content in the request body?

**Proof gate 0 (IMMUTABLE):**
```
□ All sub-pipeline committed_data insert blocks pasted (execute-bulk: N functions, execute: M functions)
□ Reference implementation identified with full metadata shape
□ Plan interpretation trigger path pasted
□ Entity creation side effect code pasted
□ Existing shared helpers listed with file paths
□ Execute route file transport mechanism identified (body vs Storage)
```

**Commit:** `git add -A && git commit -m "HF-231 Phase 0: diagnostic — current import pipeline state" && git push origin hf-231-unified-import-pipeline`

---

## PHASE 1: CREATE commitContentUnit SHARED FUNCTION (30 min)

**New file:** `web/src/lib/sci/commit-content-unit.ts`

Create a single function that writes committed_data rows for ANY classification. The function:

1. Takes: `unit` (content unit with confirmedBindings, confirmedClassification, headerComprehension), `rows` (parsed data), `tenantId`, `supabase`, `proposalId`, `fileName`, `tabName`
2. Resolves entity_id_field from HC identifier role (Decision 108):
   ```typescript
   const hcIdentifier = unit.headerComprehension?.interpretations
     ? Array.from(unit.headerComprehension.interpretations.entries())
         .find(([_, interp]) => interp.columnRole === 'identifier' && interp.confidence >= 0.80)
     : null;
   const entityIdField = hcIdentifier?.[0]  // the column name
     ?? unit.confirmedBindings?.find(b => b.semanticRole === 'entity_identifier')?.sourceField
     ?? null;
   ```
3. Extracts source_date using existing helpers (`extractSourceDate`, `findDateColumnFromBindings`)
4. Builds field_identities using existing helper (`buildFieldIdentitiesFromBindings`)
5. Builds semantic_roles map from confirmedBindings
6. Normalizes data_type from fileName + tabName (existing logic from `processDataUnit`)
7. Creates import_batch record
8. Inserts committed_data rows with uniform metadata:
   ```typescript
   {
     tenant_id: tenantId,
     import_batch_id: batchId,
     data_type: dataType,
     entity_identifier: row[entityIdField] ?? null,
     source_date: extractedSourceDate,
     row_data: row,
     metadata: {
       source: 'sci',
       proposalId,
       semantic_roles: semanticRoles,
       resolved_data_type: dataType,
       field_identities: fieldIdentities,
       informational_label: unit.confirmedClassification,
       entity_id_field: entityIdField,
     },
   }
   ```
9. Returns `{ batchId, rowCount, entityIdField, dataType }`

**This function does NOT:**
- Create entities in the entities table (that's a side effect triggered by the caller)
- Trigger plan interpretation (that's a side effect triggered by the caller)
- Run convergence (that's a calc-time concern per OB-182)
- Clear input_bindings (that's a side effect triggered by the caller when entity data changes)

**Proof gate 1 (IMMUTABLE):**
```
□ commitContentUnit function created (paste full function)
□ entity_id_field resolved from HC identifier role first, confirmedBindings fallback (paste resolution code)
□ Imports existing helpers (field-identities.ts, source-date-extraction.ts) — paste imports
□ Uniform metadata shape — paste the metadata object
□ npm run build exits 0
□ Korean Test: 0 field name matches in commit-content-unit.ts
```

**Commit:** `git add -A && git commit -m "HF-231 Phase 1: commitContentUnit shared function" && git push origin hf-231-unified-import-pipeline`

---

## PHASE 2: WIRE execute-bulk TO USE commitContentUnit (30 min)

**File:** `web/src/app/api/import/sci/execute-bulk/route.ts`

### 2A: Replace processDataUnit's committed_data write

Find the committed_data insert block in `processDataUnit`. Replace with:

```typescript
import { commitContentUnit } from '@/lib/sci/commit-content-unit';

const commitResult = await commitContentUnit(unit, rows, tenantId, supabase, proposalId, fileName, tabName);
```

Remove the inline metadata construction, inline insert, inline source_date extraction. The function handles everything.

### 2B: Replace processEntityUnit's committed_data write

Find the committed_data insert block in `processEntityUnit`. Replace with the same `commitContentUnit` call. PRESERVE the entity creation side effect — the entity creation code (creating/enriching entries in the `entities` table) stays in `processEntityUnit` but the committed_data write delegates to `commitContentUnit`.

```typescript
// Entity creation side effect — PRESERVED
await createOrEnrichEntities(...);

// Committed_data write — UNIFIED
const commitResult = await commitContentUnit(unit, rows, tenantId, supabase, proposalId, fileName, tabName);
```

### 2C: Replace processReferenceUnit's committed_data write

Same pattern. Replace inline committed_data insert with `commitContentUnit` call.

### 2D: Replace processPlanUnit's committed_data write (if applicable)

If `processPlanUnit` writes to committed_data, replace with `commitContentUnit`. The plan interpretation side effect (AI call, bridgeAIToEngineFormat, signal emission) stays in `processPlanUnit`.

### 2E: Clean up dead code

After all sub-pipelines delegate to `commitContentUnit`, remove:
- Inline `insertRows = rows.map(...)` blocks that are no longer called
- Inline `import_batches` insert blocks that are now in `commitContentUnit`
- Duplicate `normalizeFileNameToDataType` calls (now in `commitContentUnit`)
- Duplicate `semantic_roles` construction (now in `commitContentUnit`)

**Proof gate 2 (IMMUTABLE):**
```
□ processDataUnit calls commitContentUnit (paste call site)
□ processEntityUnit calls commitContentUnit + preserves entity creation (paste both)
□ processReferenceUnit calls commitContentUnit (paste call site)
□ processPlanUnit calls commitContentUnit if applicable (paste or N/A)
□ No inline committed_data insert blocks remain in execute-bulk:
    grep -n "supabase.*from.*committed_data.*insert\|insertRows.*rows.map" web/src/app/api/import/sci/execute-bulk/route.ts
    Must return only commitContentUnit references
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-231 Phase 2: execute-bulk delegates to commitContentUnit" && git push origin hf-231-unified-import-pipeline`

---

## PHASE 3: WIRE execute TO USE commitContentUnit (20 min)

**File:** `web/src/app/api/import/sci/execute/route.ts`

Same pattern as Phase 2. Replace all inline committed_data insert blocks in `executeEntityPipeline`, `executeReferencePipeline`, `executeTargetPipeline`, `executeTransactionPipeline` with `commitContentUnit` calls. Preserve side effects (entity creation, plan interpretation) as caller-level logic.

**Proof gate 3 (IMMUTABLE):**
```
□ All execute sub-pipelines call commitContentUnit (paste each call site)
□ Side effects preserved (entity creation, plan interpretation — paste code)
□ No inline committed_data insert blocks remain in execute:
    grep -n "supabase.*from.*committed_data.*insert" web/src/app/api/import/sci/execute/route.ts
    Must return only commitContentUnit references
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-231 Phase 3: execute delegates to commitContentUnit" && git push origin hf-231-unified-import-pipeline`

---

## PHASE 4: CLEAR BINDINGS + COMPLETION REPORT + PR (10 min)

### 4A: Clear CRP input_bindings

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
  const { data, error } = await sb
    .from('rule_sets')
    .update({ input_bindings: {} })
    .eq('tenant_id', tenantId)
    .select('id, name');
  console.log('Cleared ' + (data?.length || 0) + ' rule_sets');
  for (const rs of data || []) console.log('  ' + rs.name);
})();
"
```

### 4B: Write completion report

Write to `docs/completion-reports/HF-231_COMPLETION_REPORT.md` per Rules 25-28.

### 4C: Final build + PR

```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build
echo "BUILD EXIT: $?"
```

```bash
gh pr create --base main --head hf-231-unified-import-pipeline \
  --title "HF-231: Unified import pipeline — commitContentUnit replaces 8 inline write sites" \
  --body "Creates commitContentUnit shared function in lib/sci/commit-content-unit.ts. All import sub-pipelines (processEntityUnit, processReferenceUnit, processDataUnit, processPlanUnit in execute-bulk; executeEntityPipeline, executeReferencePipeline, executeTargetPipeline, executeTransactionPipeline in execute) delegate committed_data writes to this single function. entity_id_field resolved from HC identifier role (Decision 108) with confirmedBindings fallback. source_date extracted via existing helpers. Metadata shape uniform across all classifications. Side effects (entity creation, plan interpretation) preserved at caller level. Closes AP-17 permanently."
```

HALT after PR creation. Architect clean-slates CRP, imports quota file first (should commit 24 rows as target with entity_id_field from HC), imports remaining files, calculates.

---

## SCOPE BOUNDARY — DO NOT CHANGE

- **Do NOT modify** convergence-service.ts — convergence is calc-time
- **Do NOT modify** run/route.ts — engine is separate
- **Do NOT modify** intent-executor.ts — execution is separate
- **Do NOT modify** hc-pattern-classifier.ts — classification is separate
- **Do NOT modify** agents.ts — scoring is separate
- **Do NOT remove** entity creation logic — it's a side effect, preserved at caller
- **Do NOT remove** plan interpretation logic — it's a side effect, preserved at caller
- **Do NOT add** any new npm dependencies

## ANTI-PATTERNS SPECIFIC TO THIS HF

**AP-1: Building a new inline committed_data write.** The entire point of this HF is ONE function. If you find yourself writing `supabase.from('committed_data').insert(...)` anywhere other than `commitContentUnit`, STOP.

**AP-2: Classification as a code-path gate.** Classification determines `informational_label` and triggers side effects. It does NOT determine the committed_data write shape. If you find yourself writing `if (classification === 'entity') { /* different insert */ }` inside `commitContentUnit`, STOP.

**AP-3: Depending on convergence bindings for entity_id_field.** Use HC identifier role first. confirmedBindings second. Convergence bindings never — they don't exist at import time on clean slate.

---

## EXECUTION SEQUENCE

Phases 0 → 1 → 2 → 3 → 4 in sequence. Every Phase has a proof gate. Paste evidence at every gate. Do NOT skip gates.

Commit + push after every Phase.
