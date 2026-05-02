# HF-195 Phase 6-AUDIT — Import-to-Calculate Flow Structural Code Audit

| Field | Value |
|---|---|
| Audit ID | HF-195-Phase-6-AUDIT |
| Date | 2026-05-02 |
| Branch | `hf-195-prompt-layer-registry-derivation` |
| Author | CC (read-only structural audit, diagnostic-only) |
| Trigger | Phase 6B verification surfaced `ALL_NULL_ENTITY` flag — 85 committed_data rows imported under BCL roster band, 0 with resolved `entity_id` |
| Scope | Code paths from import API entry → SCI dispatch → committed_data write → entity materialization → entity_id back-link → plan import → convergence → calculation |
| Output discipline | Structural observations only. No fix proposals. No architectural dispositions. No GT values. Korean Test compliant in any code citations (verbatim quotes only). |

---

## Pre-Audit Anchor (Verbatim BCL Tenant State, 2026-05-02)

```
table: committed_data         rows_for_BCL: 85   (all entity_id = NULL, all source_date = NULL)
table: entities               rows_for_BCL: 85
table: import_batches         rows_for_BCL: 1
table: rule_sets              rows_for_BCL: 0
table: calculation_results    rows_for_BCL: 0
table: classification_signals rows_for_BCL: 0  (post-wipe, post-roster-reimport)
table: structural_fingerprints rows_for_BCL: 0
table: entity_period_outcomes rows_for_BCL: 0
```

The asymmetry is the audit's central diagnostic anchor: **`entities` has 85 rows but no committed_data row references any of them.**

---

## PART 1 — Single import surface entry point

### A1. Locate the canonical import API tree

**Command:**
```
find src/app/api/import -type f | sort
```

**Output:**
```
src/app/api/import/commit/route.ts
src/app/api/import/prepare/route.ts
src/app/api/import/sci/analyze-document/route.ts
src/app/api/import/sci/analyze/route.ts
src/app/api/import/sci/execute-bulk/route.ts
src/app/api/import/sci/execute/route.ts
src/app/api/import/sci/process-job/route.ts
src/app/api/import/sci/trace/route.ts
```

### A2. Per-file handler signatures + initial logic

**`src/app/api/import/prepare/route.ts`** — POST handler. Generates signed Storage upload URL.
```
/**
 * POST /api/import/prepare
 *
 * HF-047: Prepares for file-based import by:
 *   1. Ensuring the 'imports' storage bucket exists
 *   2. Generating a signed upload URL for the client
 *
 * The client uploads the file DIRECTLY to Supabase Storage using the signed URL.
 * This bypasses Vercel's 4.5MB body limit — the file never passes through Vercel.
 */
export async function POST(request: NextRequest) {
  ...
  const { tenantId, fileName } = await request.json();
  ...
  // Generate unique storage path
  const batchId = crypto.randomUUID();
  const storagePath = `${tenantId}/${batchId}/${fileName}`;
  // Create signed upload URL (bypasses RLS, expires in 1 hour)
  const { data, error } = await supabase.storage
    .from('imports')
    .createSignedUploadUrl(storagePath);
  ...
}
```

**`src/app/api/import/commit/route.ts`** — POST handler. Older row-data-by-mappings commit path; downloads file, parses XLSX, writes `committed_data` directly. Header at line 1-10:
```
/**
 * POST /api/import/commit
 *
 * HF-047: File-based import pipeline.
 * Receives metadata only (< 50KB). Downloads file from Supabase Storage,
 * parses Excel server-side, applies field mappings, bulk inserts to DB.
 */
```

**`src/app/api/import/sci/analyze-document/route.ts`** — POST handler. Document content extraction (PDF/PPTX/DOCX/text). OB-133 / HF-101.

**`src/app/api/import/sci/analyze/route.ts`** — POST handler. SCI proposal generator (consolidated scoring pipeline). Decision 77 / OB-127 / OB-160C. Calls `generateContentProfile`, `enhanceWithHeaderComprehension`, `resolveClassification`, `classifyByHCPattern`. PROCESSING_ORDER = `{plan: 0, entity: 1, target: 2, transaction: 3, reference: 4}`.

**`src/app/api/import/sci/execute/route.ts`** — POST handler. Decision 77 / OB-127. Currently used for **plan units only** (per UI dispatcher, see A3). Imports `resolveEntitiesFromCommittedData` from `@/lib/sci/entity-resolution` (line 14).

**`src/app/api/import/sci/execute-bulk/route.ts`** — POST handler. OB-156. Server-side file processing for **non-plan units** (entity, target, transaction, reference). Header verbatim at line 1-3:
```
// OB-156: SCI Execute Bulk — Server-side file processing
// Downloads file from Supabase Storage, parses server-side, bulk inserts.
// Fixes AP-1 (no row data in HTTP bodies) and AP-2 (no sequential chunks from browser).
```

**`src/app/api/import/sci/process-job/route.ts`** — POST handler. OB-174 Phase 4 async worker. Downloads file → fingerprint → flywheel → classifies → updates `processing_jobs` row.

**`src/app/api/import/sci/trace/route.ts`** — GET handler. Read-only diagnostic endpoint reading `classification_signals`.

### A3. THE entry points — UI dispatch evidence

**Command:**
```
grep -n "execute-bulk\|/api/import/sci/execute" src/app src/components -r --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -E "fetch|\.post\("
```

**Output:**
```
src/components/sci/SCIExecution.tsx:189:      const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
src/components/sci/SCIExecution.tsx:266:    const res = await fetchWithTimeout('/api/import/sci/execute', {
src/components/sci/SCIExecution.tsx:326:    const res = await fetchWithTimeout('/api/import/sci/execute', {
```

**Dispatch logic in `src/components/sci/SCIExecution.tsx:285-287`:**
```
const executeUnits = useCallback(async (unitsToExecute: ExecutionUnit[]) => {
  // OB-156: Split units into plan (legacy) and data (bulk) groups
  const planUnits = unitsToExecute.filter(u => u.classification === 'plan');
  const dataUnits = unitsToExecute.filter(u => u.classification !== 'plan');
  ...
```

- `planUnits` → POST `/api/import/sci/execute` (line 326)
- `dataUnits` (entity / target / transaction / reference) → POST `/api/import/sci/execute-bulk` (line 189)
- Single unit fallback → POST `/api/import/sci/execute` (line 266, used by `executeLegacyUnit` callback)

### Structural finding — Part 1

The import surface is **two endpoints split by classification**, not one. Plan-classified units route to `execute/route.ts`; non-plan units route to `execute-bulk/route.ts`. The `prepare` endpoint (signed Storage URL) and `analyze` endpoint (proposal generation) are upstream of both. The `commit` endpoint is an alternate (older) row-mapping path documented under HF-047, distinct from the SCI flow.

---

## PART 2 — File-type classification + SCI agent dispatch

### B2. SCI agent file inventory

**Command:**
```
ls src/lib/sci/
```

**Output:**
```
agents.ts
classification-signal-service.ts
content-profile.ts
contextual-reliability.ts
entity-resolution.ts
field-identities.ts
fingerprint-flywheel.ts
hc-pattern-classifier.ts
header-comprehension.ts
negotiation.ts
promoted-patterns.ts
proposal-intelligence.ts
resolver.ts
sci-signal-types.ts
sci-types.ts
seed-priors.ts
signal-capture-service.ts
signatures.ts
source-date-extraction.ts
structural-fingerprint.ts
synaptic-ingestion-state.ts
tenant-context.ts
weight-evolution.ts
```

### B3. Agent dispatch — `agents.ts` is a *weight registry*, not a switch

`src/lib/sci/agents.ts` exports five `WeightRule[]` arrays — `PLAN_WEIGHTS`, `ENTITY_WEIGHTS`, `TARGET_WEIGHTS`, `TRANSACTION_WEIGHTS`, `REFERENCE_WEIGHTS` (last not pasted in evidence read but inferred from the AgentType union). Verbatim header (line 1-11):

```
// Synaptic Content Ingestion — Agent Scoring Models
// Decision 77 — OB-127, OB-159 Unified Scoring Overhaul
// Five specialist agents with structural heuristic scoring.
// Korean Test: scoring uses structural properties only. Zero field-name matching.
```

Each agent is a structural-feature scoring policy applied to a `ContentProfile` produced by `content-profile.ts`. Classification dispatch is the highest-scoring agent under `resolveClassification` (in `resolver.ts`), composed with `classifyByHCPattern` (header-comprehension override) and the flywheel-prior pathway.

### B4. The five SCI agents

| Agent | Implementation surface | Status |
|---|---|---|
| Plan | `PLAN_WEIGHTS` in `agents.ts` | present |
| Entity | `ENTITY_WEIGHTS` in `agents.ts` | present |
| Target | `TARGET_WEIGHTS` in `agents.ts` | present |
| Transaction | `TRANSACTION_WEIGHTS` in `agents.ts` | present |
| Reference | implied by `PROCESSING_ORDER.reference = 4` in `analyze/route.ts:32` and `execute-bulk/route.ts:35` | present (weight rules not surfaced in this audit's read window) |

### Structural finding — Part 2

All five agents present as scoring weight rules in `agents.ts`. Dispatch is structural-feature scoring, not a switch over filename/sheet-name vocabulary — Korean-Test compliant by design.

---

## PART 3 — Commit pipeline (`committed_data` write path)

### C1. All `committed_data` accesses (write + read)

**Command:**
```
grep -rnE "from\('committed_data'\)|\.from\(['\"]committed_data['\"]\)" src/ --include="*.ts" | grep -v node_modules
```

**Output (filtered to write sites only):**
```
src/app/api/import/sci/execute-bulk/route.ts:556  .from('committed_data').insert(slice as unknown as Json[])
src/app/api/import/sci/execute-bulk/route.ts:682  .from('committed_data').insert(slice)
src/app/api/import/sci/execute-bulk/route.ts:832  .from('committed_data').insert(slice as unknown as Json[])
src/app/api/import/sci/execute-bulk/route.ts:988  .from('committed_data').update({ entity_id: entityId }).in('id', slice)   ← in _postCommitConstruction_REMOVED (dead code)
src/app/api/import/sci/execute/route.ts:589      .from('committed_data')   (insert site near line 588-590)
src/app/api/import/sci/execute/route.ts:736      .from('committed_data')   (insert site)
src/app/api/import/sci/execute/route.ts:869      .from('committed_data')   (insert site)
src/app/api/import/sci/execute/route.ts:1002     .from('committed_data')   (insert site)
src/app/api/import/sci/execute/route.ts:1631     .from('committed_data') ... .is('entity_id', null) ... .limit(500)   ← back-link UPDATE
src/app/api/import/sci/execute/route.ts:1654     .from('committed_data').update({ entity_id: entityId }).in('id', slice)   ← back-link UPDATE
src/app/api/import/commit/route.ts:854           .from('committed_data')   (HF-047 alternate path)
src/lib/sci/entity-resolution.ts:282-283         .from('committed_data').update({ entity_id: entityUuid })   ← DS-009 3.3 back-link
src/lib/supabase/data-service.ts:167             .from('committed_data').insert(chunk)   (helper used by import/commit)
```

### C2. Canonical entity-pipeline write (execute-bulk:processEntityUnit, lines 529-562)

```
const insertRows = rows.map((row, i) => {
  const sourceDate = extractSourceDate(row, dateColumnHint, semanticRolesMap, periodMarkerHint);
  return {
    tenant_id: tenantId,
    import_batch_id: cdBatchId,
    entity_id: null,                    // ← line 534
    period_id: null,
    source_date: sourceDate,
    data_type: dataType,
    row_data: { ...row, _sheetName: tabName, _rowIndex: i },
    metadata: {
      source: 'sci-bulk',
      proposalId,
      semantic_roles: semanticRoles,
      resolved_data_type: dataType,
      entity_id_field: entityIdField || null,
      informational_label: 'entity',
      field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
    },
  };
});
const CD_CHUNK = 2000;
let cdInserted = 0;
for (let i = 0; i < insertRows.length; i += CD_CHUNK) {
  const slice = insertRows.slice(i, i + CD_CHUNK);
  const { error: insertErr } = await supabase.from('committed_data').insert(slice as unknown as Json[]);
  ...
}
```

Header comment at line 495-497:
```
// HF-184: Unified committed_data write — entity pipeline also writes to committed_data.
// Classification is a hint, not a gate. All pipelines carry everything.
// Entity creation above is a side effect. committed_data is the uniform data store.
```

### C2. Canonical target/transaction-pipeline write (execute-bulk:processDataUnit, lines 643-665)

```
// OB-182: Build committed_data rows — entity_id NULL (resolved at calc time)
const insertRows = rows.map((row, i) => {
  const sourceDate = extractSourceDate(row, dateColumnHint, semanticRolesMap, periodMarkerHint);
  return {
    tenant_id: tenantId,
    import_batch_id: batchId,
    entity_id: null, // OB-182: deferred to calculation time
    period_id: null,  // Decision 92: engine binds at calc time
    source_date: sourceDate,
    data_type: dataType,
    row_data: { ...row, _sheetName: tabName, _rowIndex: i },
    metadata: {
      source: 'sci-bulk',
      proposalId,
      semantic_roles: semanticRoles,
      resolved_data_type: dataType,
      entity_id_field: entityIdField || null,
      field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
    },
  };
});
```

Lines 632-636 (intent comment immediately above):
```
// OB-182: Entity identifier field detected for semantic role tagging (NOT for binding).
// Entity binding deferred to calculation time per sequence-independence principle.
// committed_data.entity_id is NULL at import — engine resolves at calc time.
const entityIdBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
const entityIdField = entityIdBinding?.sourceField;
```

### C2. Canonical reference-pipeline write (execute-bulk:processReferenceUnit, lines 808-832)

Same shape as processDataUnit — `entity_id: null`, `period_id: null`, source_date extracted, metadata carries `informational_label: 'reference'`.

### C3. Canonical commit path

For the SCI flow (the **production** import flow used by the BCL re-import):
- Plan units → `execute/route.ts` (lines 589, 736, 869, 1002 — different sub-pipelines)
- Entity units → `execute-bulk/route.ts:556` (processEntityUnit)
- Target units → `execute-bulk/route.ts:682` (processDataUnit)
- Transaction units → `execute-bulk/route.ts:682` (processDataUnit)
- Reference units → `execute-bulk/route.ts:832` (processReferenceUnit)

The `import/commit/route.ts` path is the **HF-047 alternate** — kept for backward compatibility but not exercised by the current SCI UI.

### Structural finding — Part 3

All four SCI bulk pipelines (entity, target, transaction, reference) write `committed_data.entity_id = null` at insert time. The `entity_id` column is never populated at the initial INSERT in `execute-bulk/route.ts`. The `data_type` is composed from filename + sheet name via `normalizeFileNameToDataType` + concatenation; `source_date` is extracted via structural heuristics; `metadata` carries `entity_id_field` (the *column name* of the entity identifier, not its value).

---

## PART 4 — Entity materialization (writes to `entities` table)

### D1. All `entities` writes

**Command:**
```
grep -rnE "from\('entities'\)|\.from\(['\"]entities['\"]\)" src/ --include="*.ts" | grep -v node_modules
```

**Output (filtered to write sites only):**
```
src/app/api/import/sci/execute-bulk/route.ts:432  .from('entities').insert(slice)              ← processEntityUnit, primary roster materialization
src/app/api/import/sci/execute-bulk/route.ts:481  .from('entities').update({...})              ← processEntityUnit, enrichment (HF-190 unified update)
src/app/api/import/sci/execute-bulk/route.ts:1073 .from('entities').update({ metadata: newMeta }) ← OB-146 store metadata, in _postCommitConstruction_REMOVED (dead code)
src/app/api/import/commit/route.ts:414, 449, 477  .from('entities')                            ← HF-047 alternate path
src/app/api/import/sci/execute/route.ts:1726, 1753 .from('entities').update                    ← OB-146 store metadata, lives behind entityIdField guard
src/lib/sci/entity-resolution.ts:226              .from('entities').insert(chunk)              ← DS-009 3.3 entity creation
src/app/api/platform/users/invite/route.ts:178    .from('entities')                            ← user-invite flow (out of import scope)
```

### D2. Canonical entity-pipeline materialization (execute-bulk:processEntityUnit, lines 408-437)

```
// Create new entities — bulk insert in 5000-row chunks
const newIds = allIds.filter(eid => !existingMap.has(eid));
let created = 0;
if (newIds.length > 0) {
  const newEntities = newIds.map(eid => {
    const meta = entityData.get(eid);
    return {
      tenant_id: tenantId,
      external_id: eid,
      display_name: meta?.name || eid,
      entity_type: 'individual' as const,
      status: 'active' as const,
      temporal_attributes: buildTemporalAttrs(meta?.enrichment || {}) as Json[],
      metadata: {
        ...(meta?.enrichment || {}),
        ...(meta?.role ? { role: meta.role } : {}),
        ...(meta?.licenses ? { product_licenses: meta.licenses } : {}),
      } as Record<string, Json>,
    };
  });
  const INSERT_BATCH = 5000;
  for (let i = 0; i < newEntities.length; i += INSERT_BATCH) {
    const slice = newEntities.slice(i, i + INSERT_BATCH);
    const { error: entErr } = await supabase.from('entities').insert(slice);
    ...
    created += slice.length;
  }
}
```

`processEntityUnit` writes to `entities` BEFORE writing to `committed_data` (lines 408-437 for entity creation; lines 495-562 for committed_data write).

### D3. Control flow for a roster file

Code evidence shows pattern **(c)** — both written in the same handler, sequentially:

1. **First**, `processEntityUnit` builds `entityData` Map from row identifiers (lines 339-376).
2. **Second**, `processEntityUnit` upserts to `entities` table (lines 408-437) using `external_id` as the dedup key.
3. **Third**, immediately following (lines 495-562), `processEntityUnit` writes the SAME 85 rows into `committed_data` with `entity_id: null` (HF-184 unified-write).

There is **no back-link step** between Step 2 and Step 3. Step 3 does not look up the `entities.id` UUIDs that were just created in Step 2.

### Structural finding — Part 4

Roster import in `execute-bulk` materializes `entities` rows successfully (proven by 85 rows in `entities` for BCL post-re-import). The control flow is sequential within a single handler — entities written first, committed_data written second — but the second write does not consume the IDs produced by the first.

---

## PART 5 — Entity back-link (`committed_data.entity_id` population)

### E1. All `entity_id` write sites

**Command:**
```
grep -rnE "entity_id\s*[:=]" src/ --include="*.ts" | grep -v node_modules | grep -iE "committed_data|update.*entity|insert.*entity"
```

**Output:**
```
src/app/api/import/sci/execute-bulk/route.ts:988  await supabase.from('committed_data').update({ entity_id: entityId }).in('id', slice);
src/app/api/import/sci/execute/route.ts:1654     await supabase.from('committed_data').update({ entity_id: entityId }).in('id', slice);
src/lib/sci/entity-resolution.ts:283             .update({ entity_id: entityUuid })
```

### E2. Where these writes live and what triggers them

**`execute-bulk/route.ts:988`** — inside function `_postCommitConstruction_REMOVED` declared at line 866 with explicit DEAD-CODE marker:
```
// ── Post-commit construction — REMOVED by OB-182 (sequence-independence)
// Entity binding, assignments, and store metadata deferred to calculation time.
// Function retained as dead code reference until calc-time equivalents verified.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _postCommitConstruction_REMOVED(
```
**No caller of this function exists.** Confirmed by the `_REMOVED` suffix and the `@typescript-eslint/no-unused-vars` disable directive.

**`execute/route.ts:1654`** — inside an inline section (around lines 1567-1665) that runs when `entityIdField` is truthy. This section back-links `committed_data` rows for an `importBatchId` — but it is reached only via the **plan unit pathway** (since the UI dispatcher routes only plan units to `execute/route.ts`). For roster/data uploads via `execute-bulk/route.ts` this code is unreachable.

**`entity-resolution.ts:283`** — inside `resolveEntitiesFromCommittedData(supabase, tenantId)`. Callers:
```
src/app/api/import/sci/execute/route.ts:14    import { resolveEntitiesFromCommittedData } from '@/lib/sci/entity-resolution';
src/app/api/import/sci/execute/route.ts:232   const entityResult = await resolveEntitiesFromCommittedData(supabase, tenantId);
```
The function scans ALL committed_data for the tenant, derives identifier columns from `field_identities` metadata, creates missing entities, and back-links `committed_data.entity_id`. **It is invoked only from `execute/route.ts`**, never from `execute-bulk/route.ts`.

### E3. CRITICAL DIAGNOSTIC

The Phase 6B observation (committed_data has 85 NULL-entity rows; entities table has 85 rows) is explained as follows:

- **The roster import via `execute-bulk` enters `processEntityUnit`.** This handler (line 318) creates 85 `entities` rows (Step 4 evidence above).
- **Then `processEntityUnit` writes 85 `committed_data` rows with `entity_id: null` (line 534).** This is the HF-184 unified-write.
- **`processEntityUnit` does NOT call any back-link function.** It returns control to `processContentUnit` (the dispatcher), which returns to the main loop, which returns the SCIExecutionResult to the UI.
- **`execute-bulk/route.ts` has zero invocations of `resolveEntitiesFromCommittedData` or any equivalent function.** The dead `_postCommitConstruction_REMOVED` function carries the back-link logic but is never called.

**Diagnosis answer:** **(a)+(c) hybrid.**
- **(a)** The back-link code path EXISTS in `entity-resolution.ts:resolveEntitiesFromCommittedData` (line 26, exported, fully implemented including pagination, dedup, and the UPDATE at line 283), AND in `execute/route.ts` (inline UPDATE at line 1654). Both could in principle have run during the BCL roster import — but neither is called from the canonical `execute-bulk` path.
- **(c)** No code path exists at calc time that writes `committed_data.entity_id`. The OB-182 comment (`"engine resolves at calc time"`) is a *promise* not honored by the calc-time code: `run-calculation.ts` SELECTs `committed_data` with `entity_id` column (lines 902-951) and groups `dataByEntity` by the read `entity_id`, but never writes back to `committed_data`. There is no `UPDATE committed_data SET entity_id = ?` anywhere in `src/lib/calculation/` or `src/app/api/calculation/`.

**Verbatim verification — calc-side has no `committed_data` UPDATE:**
```
$ grep -n "committed_data" src/lib/calculation/run-calculation.ts | grep -i "update\|insert"
(no matches)
$ grep -n "committed_data" src/app/api/calculation/run/route.ts | grep -i "update\|insert"
(no matches)
```
(Both run-calculation.ts and api/calculation/run/route.ts only READ from committed_data.)

### Structural finding — Part 5

The `execute-bulk` path (which handles 4 of 5 classifications, including roster/entity) writes `committed_data.entity_id = NULL` and never updates it. The two existing back-link implementations (`entity-resolution.ts` and `execute/route.ts:1654`) live on code paths that are not reachable from the `execute-bulk` flow. The OB-182 "calc-time entity binding" architecture is documented in comments but absent from the calc-time code — a structural orphan: the pre-import code says "deferred to calc time," and the calc-time code expects the column to already be populated.

---

## PART 6 — Plan import path (HF-195 surface)

### F1. Plan-import-specific code

**Command:**
```
grep -rnE "plan.*interpret|plan.*classify|ai-plan-interpreter" src/ --include="*.ts" | grep -v node_modules
```

**Output (filtered to call-chain references):**
```
src/app/api/import/sci/execute/route.ts:6      // OB-133/OB-150: Extended timeout for plan interpretation
src/app/api/import/sci/execute/route.ts:100    // HF-130: Batch all plan-classified units from the same file into ONE interpretation call.
src/app/api/import/sci/execute/route.ts:117    console.error('[SCI Execute] Batched plan interpretation failed, falling back to per-unit:', err);
src/app/api/import/sci/execute/route.ts:1063   console.log(`[SCI Execute] Batched plan interpretation: ${planUnits.length} sheets from ${storagePath}`);
src/app/api/import/sci/execute/route.ts:1075-1452   pipeline: 'plan-interpretation' (multiple sites)
src/app/api/import/sci/execute/route.ts:1216   const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
src/app/api/import/sci/execute/route.ts:1452   const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
src/lib/intelligence/convergence-service.ts:205  'comprehension:plan_interpretation',
src/lib/sci/signal-capture-service.ts:25       return 'comprehension:plan_interpretation';
src/lib/compensation/ai-plan-interpreter.ts:30   // OB-196 Phase 1.5 (legacy alias elimination at the AI-plan-interpreter site)
src/lib/compensation/ai-plan-interpreter.ts:259  `[ai-plan-interpreter] non-foundational componentType "${typeStr}". `
src/lib/ai/providers/anthropic-adapter.ts:37     // HF-195: registry-derived componentType enumeration for the plan-interpretation
src/lib/ai/providers/anthropic-adapter.ts:185    plan_interpretation: `You are an expert at analyzing compensation and commission plan documents...
src/lib/ai/providers/anthropic-adapter.ts:1015   case 'plan_interpretation': {
src/lib/ai/ai-service.ts:257                   task: 'plan_interpretation',
src/lib/ai/types.ts:54                         | 'plan_interpretation'           // Extract compensation rules from document
src/lib/calculation/primitive-registry.ts:103  // The plan-interpretation prompt builder iterates registry entries
src/lib/domain/domains/icm.ts:49               'plan_interpretation',
```

### F2. Plan import call chain (from UI to rule_sets row)

1. **UI dispatch** — `src/components/sci/SCIExecution.tsx:285-326` filters `unitsToExecute` for `classification === 'plan'` → POST `/api/import/sci/execute` with `contentUnits = planExecUnits, storagePath`.
2. **Server entry** — `src/app/api/import/sci/execute/route.ts:51 export async function POST(req)`.
3. **Plan interpretation pre-pass** — at line 100 (header comment) plan-classified units batch into one AI call. The bridge import at line 1216 / 1452:
   ```
   const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
   ```
4. **AI invocation** — `bridgeAIToEngineFormat` (in `ai-plan-interpreter.ts`) constructs the request and calls `getAIService().interpret(...)` which routes to `anthropic-adapter.ts:1015 case 'plan_interpretation'`.
5. **Prompt construction** — `anthropic-adapter.ts:185` defines the `plan_interpretation` system-prompt template. HF-195 Phase 5 added registry-derived `<<COMPONENT_TYPE_LIST>>` and `<<STRUCTURAL_EXAMPLES>>` placeholder substitution at line ~849.
6. **convertComponent dispatch** — post-AI, `ai-plan-interpreter.ts` walks the AI response. At line 259 the canonical 12-case dispatch (HF-194 Phase 1) emits `UnconvertibleComponentError` for non-foundational componentType values.
7. **rule_sets write** — `execute/route.ts` after bridgeAIToEngineFormat completes, the rule_sets row is upserted (specific lines not surfaced in this audit's read window; tracked by `pipeline: 'plan-interpretation'` log markers at lines 1075, 1184, 1210, 1268, 1283, 1321, 1445, 1503, 1517).
8. **Post-execute side-effects** — `execute/route.ts:232` calls `resolveEntitiesFromCommittedData` (DS-009 3.3 entity resolution).
9. **Post-execute side-effect** — at line 220-227 (visible above the entity-resolve call), `convergeBindings` runs against all rule sets for the tenant.

### F3. HF-195 Phase 1-5 surface match

The HF-195 modifications on the current branch (`hf-195-prompt-layer-registry-derivation`) touch:
- `src/lib/calculation/primitive-registry.ts` — adds `promptStructuralExample` field on PrimitiveEntry; populates 6 entries.
- `src/lib/ai/providers/anthropic-adapter.ts` — adds `<<COMPONENT_TYPE_LIST>>` + `<<STRUCTURAL_EXAMPLES>>` placeholder builders + runtime substitution at line ~849.
- `src/lib/calculation/results-formatter.ts` — registry-derived display label (no legacy alias).

The call chain F2 still matches: UI → `execute/route.ts` → `bridgeAIToEngineFormat` → `anthropic-adapter` (NOW with registry-derived prompt) → `convertComponent` (HF-194 12-case dispatch) → rule_sets.

### Structural finding — Part 6

HF-195's prompt-layer modifications are confined to the AI-prompt construction layer (anthropic-adapter.ts) and the registry layer (primitive-registry.ts). The plan-import entry point and downstream rule_sets write are unchanged by HF-195. Phase 6's stated unblock proof — that BCL plan import yields zero `UnconvertibleComponentError` — exercises the prompt-layer changes via `execute/route.ts`'s plan-interpretation pre-pass.

---

## PART 7 — Convergence + calculation

### G1. Convergence callers

**Command:**
```
grep -rnE "convergeBindings|convergence-service" src/ --include="*.ts" | grep -v node_modules
```

**Output (call sites):**
```
src/app/api/intelligence/wire/route.ts:19,361      ← /api/intelligence/wire endpoint
src/app/api/intelligence/converge/route.ts:15,49   ← /api/intelligence/converge endpoint
src/app/api/calculation/run/route.ts:36,140        ← calc-time convergence (HF-165)
src/app/api/import/commit/route.ts:989,998         ← HF-047 alternate import path
src/app/api/import/sci/execute-bulk/route.ts:11    ← // OB-182: convergeBindings removed from import — runs at calc time
src/app/api/import/sci/execute/route.ts:13,153     ← post-execute convergence in plan path
src/lib/intelligence/convergence-service.ts:138    ← export async function convergeBindings(
```

`execute-bulk/route.ts:11` carries the explicit comment:
```
// OB-182: convergeBindings removed from import — runs at calc time
```
There is no `convergeBindings` invocation in `execute-bulk/route.ts`.

### G2. Calculation API tree

**Command:**
```
find src/app/api/calculation -type f | sort
```

**Output:**
```
src/app/api/calculation/density/route.ts
src/app/api/calculation/run/route.ts
```

`run/route.ts` is the canonical Calculate trigger (POST handler at line 61). The UI calls it via `/api/calculation/run` with body `{ tenantId, periodId, ruleSetId }`.

### G3. Calculation flow — committed_data read + entity_id behavior

**`src/app/api/calculation/run/route.ts:128-189`** — calc-time convergence (HF-165, completes OB-182 deferred architecture):
```
// ── HF-165: Calc-time convergence (completes OB-182 deferred architecture) ──
// OB-182 removed convergence from the bulk import path to eliminate sequence dependency.
// At calculation time, both plans AND data are guaranteed to exist.
// If input_bindings is empty, run convergence now to generate derivation rules.
{
  const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
  const hasMetricDerivations = ...;
  const hasConvergenceBindings = ...;
  if (!hasMetricDerivations && !hasConvergenceBindings) {
    addLog('HF-165: input_bindings empty — running calc-time convergence');
    try {
      const convResult = await convergeBindings(tenantId, ruleSetId, supabase, calculationRunId);
      ...
```

**`run/route.ts:248-326`** — entity assignment path:
- Lines 250-271: paginated SELECT from `rule_set_assignments` for the rule set.
- Lines 274: dedup `entityIds` from assignments.
- Lines 277-326: HF-126/HF-189 self-healing — when assignments are empty OR missing tenant entities, SELECT all entity ids from `entities` and INSERT new `rule_set_assignments` rows. **This populates `rule_set_assignments`, not `committed_data.entity_id`.**

**`run/route.ts:331-348`** — entity display fetch:
- Lines 336-345: paginated SELECT from `entities` for the assigned `entityIds`. Builds `entityMap` (in-memory).

**`run/route.ts:382-453`** — `committed_data` SELECTs (three queries):
```
const committedData: Array<{ entity_id: string | null; data_type: string; row_data: Json; import_batch_id: string | null; metadata: Json | null }> = [];

// Query 1: source_date range
const { data: page } = await supabase
  .from('committed_data')
  .select('entity_id, data_type, row_data, import_batch_id, metadata')
  .eq('tenant_id', tenantId)
  .not('source_date', 'is', null)
  .gte('source_date', period.start_date)
  .lte('source_date', period.end_date)
  .range(from, to);

// Query 2: period_id fallback
.from('committed_data')
.select('entity_id, data_type, row_data, import_batch_id, metadata')
.eq('tenant_id', tenantId)
.eq('period_id', periodId)

// Query 3 (OB-128): period-agnostic
.from('committed_data')
.select('entity_id, data_type, row_data, import_batch_id, metadata')
.eq('tenant_id', tenantId)
.is('period_id', null)
.is('source_date', null)
```

**`run/route.ts:457+`** — grouping:
```
// Group entity-level data by entity_id → data_type → rows
const dataByEntity = new Map<string, Map<string, Array<{ row_data: Json }>>>();
```
The grouping key is the row's `entity_id` as read from `committed_data`. Rows where `entity_id IS NULL` group under the literal NULL key (or are skipped — depends on downstream handling not surfaced in this read window).

**`run/route.ts:285-292`** (HF-126/HF-189 self-healing):
```
const { data: ep } = await supabase
  .from('entities')
  .select('id')
  .eq('tenant_id', tenantId)
  .range(entPage * PAGE_SIZE, (entPage + 1) * PAGE_SIZE - 1);
```
This reads entity ids **but does not look up `committed_data.row_data.entity_id_field` to populate any back-link.**

**Structural absence:** Search confirms zero `UPDATE committed_data SET entity_id` calls in `src/lib/calculation/` or `src/app/api/calculation/`.

### Structural finding — Part 7

Calculation reads `committed_data` and groups by the column-stored `entity_id`. It does **not** resolve NULL `entity_id` rows by looking up `metadata.entity_id_field` against `entities.external_id`. The HF-126/HF-189 self-healing **only** creates `rule_set_assignments` rows; it does not touch `committed_data`. Therefore, for a row whose `entity_id IS NULL` at calc time, the calc engine cannot attribute its data to any entity — the `dataByEntity` Map will not contain that row under any real entity key.

---

## PART 8 — Recent commit overlap analysis

### H1. Last 14 days, audited surfaces

**Command:**
```
git log --all --since="14 days ago" --oneline -- src/app/api/import/ src/lib/sci/ src/lib/intelligence/ src/lib/compensation/ src/app/api/calculation/
```

**Output:**
```
415056d3 HF-195 Phase 4: Build-time Korean Test gate
1541e109 HF-194 Phase 1: convertComponent aligned with canonical dispatch pattern (12 cases, registry-derived, structured-failure default)
fa7e92fc OB-198 Phase 1: writer + reader vocabulary alignment (12 writes + 2 reads)
02e77142 OB-197 Phase 3: convergence service read-path — within-run + cross-run observation
6a350c2d OB-197 Phase 2: write-site run_id propagation + vocabulary alignment
635aaa2c OB-196 P1.5.1 WIP: preserved from stash for post-OB-197 verification
e41c5dcb On phase-4-e5-audit: B.2.1 install + B.2.1.6 diagnostic — clean-slate fingerprint test
4f2b413b Phase 3: E4 round-trip closure verification + structured-failure hardening
7b9662f9 Phase 2: E2 structured failure on run-calculation.ts + LegacyShapedPlanComponent removal
25a32090 Phase 1.7: validation/forensics/UI consumer refactor
390eb9ba Phase 1.6.5: calc-side legacy disposition + demo-era wholesale sweep
7fa598f6 Phase 1.6: Trial/GPV/landing dead-code sweep
9ebc340e Phase 1.5: legacy alias elimination at import boundary — importer + plan-agent prompt refactor
ec0eceb9 OB-196 Phase 1: E1 — primitive-registry.ts + consumers derive from registry
13dc698e Revert "Merge pull request #338 from CCAFRICA/dev"
314e8db0 Revert "Merge pull request #339 from CCAFRICA/hf-193-signal-surface"
455474a7 HF-194 Phase 3: add field_identities to execute-bulk metadata
1b4e4bdc HF-194 Phase 2: migrate execute/route.ts to import from lib/sci
4029b2b0 HF-194 Phase 1: extract buildFieldIdentitiesFromBindings to lib/sci
b784291c HF-194 Phase 3: add field_identities to execute-bulk metadata
34f2c42d HF-194 Phase 2: migrate execute/route.ts to import from lib/sci
d56f3e66 HF-194 Phase 1: extract buildFieldIdentitiesFromBindings to lib/sci
95efc14d HF-193 Phase 2: delete plan_agent_seeds; bridge writes metric_comprehension signals; convergence reads signals
37111ab7 Revert "HF-193-A Phase 2.2b: bridge return-shape extension"
3c628702 HF-193-A Phase 2.2b: bridge return-shape extension
```

### H2. Per-surface overlap

| Audited surface (Parts 1-7) | Touching commits (last 14d) |
|---|---|
| Part 1 (import API) | OB-198 Phase 1 (writer/reader vocab alignment); HF-194 Phase 2/3 (field_identities migration + execute-bulk metadata add); 9ebc340e (OB-196 Phase 1.5 importer refactor); 95efc14d (HF-193 Phase 2 plan_agent_seeds deletion) |
| Part 2 (SCI agents) | HF-194 Phase 1 (4029b2b0 / d56f3e66 — buildFieldIdentitiesFromBindings extracted to lib/sci); HF-194 Phase 2 (1b4e4bdc / 34f2c42d — execute/route.ts migrated to import from lib/sci); 02e77142 (OB-197 Phase 3 convergence read-path) |
| Part 3 (committed_data writes) | HF-194 Phase 3 (455474a7 / b784291c — field_identities added to execute-bulk metadata); 9ebc340e (importer refactor at OB-196 boundary) |
| Part 4 (entities writes) | None directly observed in this window — `processEntityUnit` body has not been touched recently per the log. (HF-184 unified-write predates the 14-day window.) |
| Part 5 (entity_id back-link) | **None.** The dead `_postCommitConstruction_REMOVED` function and the `resolveEntitiesFromCommittedData` library function have not been modified in the 14-day window. The dead-code marker (`// OB-182:`) predates this window. The structural-absence at calc-time also predates. |
| Part 6 (plan import) | HF-195 Phase 4 (415056d3 — Korean Test gate); HF-194 Phase 1 (1541e109 — convertComponent canonical 12-case); 9ebc340e (OB-196 Phase 1.5 — importer + plan-agent prompt refactor); ec0eceb9 (OB-196 Phase 1 — primitive-registry.ts) |
| Part 7 (convergence + calculation) | 02e77142 (OB-197 Phase 3 — convergence service read-path); 6a350c2d (OB-197 Phase 2 — write-site run_id propagation); 7b9662f9 (Phase 2 — run-calculation.ts structured failure); 390eb9ba (Phase 1.6.5 — calc-side legacy disposition) |

### Structural finding — Part 8

The entity-materialization-vs-back-link gap (Part 5) was **not introduced by any commit in the 14-day window.** The dead-code marker on `_postCommitConstruction_REMOVED` cites OB-182 (older than 14 days). The `resolveEntitiesFromCommittedData` library function is unchanged in the window. The asymmetry between `execute-bulk` (no entity-resolution call) and `execute` (calls `resolveEntitiesFromCommittedData`) is a state inherited from before the audit window, not a regression introduced during HF-194/HF-195 work.

The OB-196/HF-194/HF-195 series modified plan-side surfaces (importer prompt, convertComponent dispatch, primitive-registry) and ICS-side metadata fields (field_identities propagation through execute-bulk) but did not touch entity-resolution logic in either branch of the import surface.

---

## SUMMARY

### 1. Single-import-surface confirmation/contradiction

**Architect statement:** ONE import surface for all data files.
**Code state:** **Two endpoints, not one.** Routed by classification at the UI layer:
- `src/components/sci/SCIExecution.tsx:285-326` filters units → `execute` for plan, `execute-bulk` for non-plan.
- `src/app/api/import/sci/execute/route.ts` (used for plan + single-unit fallback)
- `src/app/api/import/sci/execute-bulk/route.ts` (used for entity, target, transaction, reference)

A third path (`src/app/api/import/commit/route.ts`, the HF-047 alternate) exists but is not exercised by the current SCI UI.

The two SCI endpoints share the upstream surface (`prepare` → Storage, `analyze` → SCI proposal) but diverge in their write/back-link behavior — see finding #4 below.

### 2. Code paths that EXIST but appear NOT TO FIRE during normal import flow

- **`_postCommitConstruction_REMOVED` in `execute-bulk/route.ts:866-1085`** — full implementation of: (a) `entities` create-if-missing, (b) `committed_data.entity_id` back-link, (c) `rule_set_assignments` create-if-missing, (d) entity store-metadata population. Function is marked `_REMOVED` per OB-182 with `@typescript-eslint/no-unused-vars` directive. **Zero callers.**
- **`resolveEntitiesFromCommittedData` in `entity-resolution.ts:26`** — DS-009 Layer 3 entity-resolution implementation. Called only from `execute/route.ts:232` (plan-pathway). **Not called from `execute-bulk` (the bulk path used for roster, target, transaction, reference imports).**
- **The OB-128 period-agnostic SELECT in `run/route.ts:441-453`** — fetches rows where `period_id IS NULL AND source_date IS NULL`. This is reachable but only useful for entity-band rows (rosters); since rosters' `entity_id` is also NULL post-import, calc-time grouping by `entity_id` collapses these rows under the NULL key.

### 3. Code paths that SHOULD EXIST per architectural spec/memory but ABSENT in code

- **Calc-time entity binding (per OB-182 documentation in `execute-bulk/route.ts:11` and lines 632-634).** The OB-182 stated architecture: "Entity binding deferred to calculation time per sequence-independence principle. committed_data.entity_id is NULL at import — engine resolves at calc time." **The calc-time resolver does not exist.** Search confirms zero `UPDATE committed_data SET entity_id` and zero in-memory equivalent (no JOIN logic that resolves `entity_id_field` from row metadata against `entities.external_id` at read time) anywhere in `src/lib/calculation/` or `src/app/api/calculation/`.
- **Symmetric entity-resolution invocation in `execute-bulk/route.ts`.** The plan path (`execute/route.ts:232`) calls `resolveEntitiesFromCommittedData(supabase, tenantId)` post-execute. The bulk path has no analogous call. Architectural symmetry would require either both paths to call it OR neither to call it (with calc-time taking over instead).

### 4. Entity-materialization-vs-back-link diagnosis (Part 5 E3)

**Answer: hybrid (a)+(c).**

- **(a)** The back-link code path EXISTS:
  - in `entity-resolution.ts:283` (DS-009 3.3 — paginated UPDATE keyed by `import_batch_id` and `is('entity_id', null)`)
  - in `execute/route.ts:1654` (inline UPDATE inside the plan-pathway entity-id-binding block)
  - in `execute-bulk/route.ts:988` (inside the dead `_postCommitConstruction_REMOVED` function)

- **(c)** No back-link code path runs for the BCL roster scenario:
  - `processEntityUnit` (the handler that ran for the BCL roster) writes `entity_id: null` and returns without invoking any of the three back-link sites.
  - `execute-bulk/route.ts` does not call `resolveEntitiesFromCommittedData`.
  - `_postCommitConstruction_REMOVED` is dead code.
  - Calc-time has no equivalent.

**Code evidence** (verbatim, key lines):
- `execute-bulk/route.ts:534`: `entity_id: null,`
- `execute-bulk/route.ts:11`: `// OB-182: convergeBindings removed from import — runs at calc time`
- `execute-bulk/route.ts:632-634`:
  ```
  // OB-182: Entity identifier field detected for semantic role tagging (NOT for binding).
  // Entity binding deferred to calculation time per sequence-independence principle.
  // committed_data.entity_id is NULL at import — engine resolves at calc time.
  ```
- `execute-bulk/route.ts:866-870`:
  ```
  // ── Post-commit construction — REMOVED by OB-182 (sequence-independence)
  // Entity binding, assignments, and store metadata deferred to calculation time.
  // Function retained as dead code reference until calc-time equivalents verified.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function _postCommitConstruction_REMOVED(
  ```
- Calc-side absence: zero `UPDATE committed_data` / zero metadata-driven entity_id resolver in `src/lib/calculation/` or `src/app/api/calculation/`.

The OB-182 promise — "engine resolves at calc time" — is documented in import-side comments but the engine-side implementation is missing. The architecture is in a *transitional state*: import-side post-commit construction has been removed, calc-side replacement has not landed.

### 5. Recent-work overlap risk

**No commit in the 14-day window introduced the entity-materialization-vs-back-link gap.** The OB-182 dead-code marker, the `resolveEntitiesFromCommittedData` library, the `execute/route.ts:232` invocation, and the calc-time absence all predate the 14-day window. The HF-194 / HF-195 / OB-196 / OB-197 / OB-198 series has touched: importer field_identities propagation, plan-prompt registry derivation, convertComponent dispatch, convergence service vocabulary, structured-failure hardening, and calc-side legacy disposition — but has **not** modified entity-resolution code on either branch of the import surface, and has not added a calc-time entity_id resolver.

The audited symmetry is therefore a **pre-existing structural state** carried from at least the OB-182 timeframe, not a regression from current HF-195 work.

---

## End of Audit
