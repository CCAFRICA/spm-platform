# HF-221 COMPLETION REPORT

## Date: 2026-05-12 (execution day; report committed end-of-Phase-2)

## Execution Time: Phase 0 start through Phase 2 commit; architect-channel actions (0.1, 1.2, 1.3) pending external to CC

---

## COMMITS (in order, on branch `hf-221-signal-vocabulary-eradication-and-verification-diagnostic`)

| Hash | Phase | Description |
|------|-------|-------------|
| (pending Phase 1.5) | Phase 1 R1 | Migration file + Phase 0/1 service-role scripts |
| (pending Phase 2.10) | Phase 2 | Diagnostic scripts + completion report (this commit) |

---

## FILES CREATED

| File | Purpose |
|------|---------|
| `web/supabase/migrations/20260512150000_hf221_drop_classification_signals_vocabulary_check.sql` | Phase 1.1 migration: drop CHECK constraint |
| `web/scripts/diag-hf221-column-state.ts` | Phase 0.2 sample-row column shape (CC service-role) |
| `web/scripts/diag-hf221-tenant-periods.ts` | Phase 0.3 BCL tenant + 6 periods |
| `web/scripts/diag-hf221-r1-sanity.ts` | Phase 1.4 sanity insert (runs post-architect-apply) |
| `web/scripts/diag-hf221-verification-failing.ts` | Phase 2.3 replicate calc-time verification — 5 failing BCL periods |
| `web/scripts/diag-hf221-verification-succeeding.ts` | Phase 2.4 replicate calc-time verification — Dec 2025 succeeding period |
| `web/scripts/diag-hf221-committed-data-rows.ts` | Phase 2.5 direct committed_data counts (hybrid fetch path) |
| `web/scripts/diag-hf221-entity-baseline.ts` | Phase 2.6 tenant entity baseline |
| `web/scripts/diag-hf221-convergence-bindings.ts` | Phase 2.7 convergence binding state |
| `HF-221_COMPLETION_REPORT.md` | This file |

## FILES MODIFIED

None outside `web/scripts/` and `web/supabase/migrations/`.

---

## PROOF GATES — HARD

### 0.1 — Constraint state retrieved (architect-channel)

**Status: PENDING — architect-channel SQL Editor**

Architect runs:
```sql
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname = 'classification_signals_signal_type_vocabulary_chk';
```

Architect-pasted output to be inserted here at architect's earliest convenience.

### 0.2 — Column state retrieved via service-role

**Status: PASS**

```
SAMPLE ROW (column shape via PostgREST):
[
  {
    "id": "554f05f4-fa62-4ea5-8901-733d17ea5aaf",
    "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
    "entity_id": null,
    "signal_type": "cost:event",
    "signal_value": {
      "model": "claude-sonnet-4-20250514",
      "purpose": "document_analysis",
      "provider": "anthropic",
      "eventType": "ai_api_call",
      "signalType": "cost_event",
      "inputTokens": 1711,
      "outputTokens": 347,
      "estimatedCostUSD": 0.0103,
      "sci_internal_type": "cost_event"
    },
    "confidence": 1,
    "source": "system",
    "context": { "capturedAt": "2026-05-13T00:42:41.782Z", "sciVersion": "1.0" },
    "created_at": "2026-05-13T00:42:47.342703+00:00",
    "source_file_name": null,
    "sheet_name": null,
    "structural_fingerprint": null,
    "classification": null,
    "decision_source": null,
    "classification_trace": null,
    "header_comprehension": null,
    "vocabulary_bindings": null,
    "agent_scores": null,
    "human_correction_from": null,
    "scope": null,
    "rule_set_id": null,
    "metric_name": null,
    "component_index": null,
    "calculation_run_id": null
  }
]
SAMPLE ERROR: null
ROW COUNT: 93
COUNT ERROR: null
```

Columns inferred (24 total): `id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at, source_file_name, sheet_name, structural_fingerprint, classification, decision_source, classification_trace, header_comprehension, vocabulary_bindings, agent_scores, human_correction_from, scope, rule_set_id, metric_name, component_index, calculation_run_id`.

### 0.3 — BCL tenant + 6 periods verified

**Status: PASS**

```
BCL TENANT: { "id": "b1c2d3e4-aaaa-bbbb-cccc-111111111111", "name": "Banco Cumbre del Litoral" }
TENANT ERROR: null

BCL PERIODS (6 periods, all monthly/open):
- October 2025 — id 97f3fdd8-1a6e-4693-ae32-c3a8a4d1bc22 — 2025-10-01..2025-10-31
- November 2025 — id e845f8f9-feda-46cd-a90d-5736afd00a41 — 2025-11-01..2025-11-30
- December 2025 — id 860b4255-23a0-48ce-9ac9-f604ad3058e1 — 2025-12-01..2025-12-31
- January 2026 — id 6e3f1b6a-716d-4bc3-930b-75935e41159d — 2026-01-01..2026-01-31
- February 2026 — id 25c9b256-539f-4379-bce0-27f5a5724425 — 2026-02-01..2026-02-28
- March 2026 — id 22155f28-e804-4b1a-870f-7e7b5de2dbaf — 2026-03-01..2026-03-31
PERIODS ERROR: null
```

### 1.1 — Migration file authored

**Status: PASS**

File: `web/supabase/migrations/20260512150000_hf221_drop_classification_signals_vocabulary_check.sql`

Content:
```sql
ALTER TABLE classification_signals
DROP CONSTRAINT classification_signals_signal_type_vocabulary_chk;
```

Commit SHA: pending Phase 1.5 commit (committed in same commit as Phase 0.2/0.3 + 1.4 scripts).

### 1.2 — Architect applies migration (architect-channel)

**Status: PENDING — architect-channel SQL Editor**

Architect copies the SQL from the migration file into Supabase Dashboard SQL Editor and executes. Architect signals "R1 migration applied" in CC chat. CC records signal here.

### 1.3 — Constraint absent post-architect-apply (architect-channel)

**Status: PENDING — architect-channel SQL Editor**

Architect runs:
```sql
SELECT conname FROM pg_constraint
WHERE conname = 'classification_signals_signal_type_vocabulary_chk';
```

Expected: empty result set. Architect pastes output to CC. CC records verbatim here.

### 1.4 — Sanity insert succeeds for engine:structural_exception

**Status: PENDING — runs after 1.2 + 1.3 architect signals**

CC runs `npx tsx scripts/diag-hf221-r1-sanity.ts` post-architect-apply. Output pasted verbatim here at that time.

### 2.1 — Verification code located via grep

**Status: PASS**

Grep output:

```
=== intersection_ratio ===
web/src/lib/intelligence/convergence-service.ts:1830:// Returns score in [0,1] computed as cardinality_ratio × intersection_ratio.
web/src/lib/intelligence/convergence-service.ts:1836:  intersection_ratio: number;
web/src/lib/intelligence/convergence-service.ts:1862:    intersection_ratio: intersectionRatio,
web/src/lib/intelligence/convergence-service.ts:2066:    //   3. Compute cardinality_ratio × intersection_ratio (vs tenant entity external_ids)
web/src/lib/intelligence/convergence-service.ts:2148:                intersection_ratio: c.conf.intersection_ratio,

=== engine:structural_exception ===
web/src/app/api/calculation/run/route.ts:1973:          signalType: 'engine:structural_exception',

=== cardinalityRatio / intersectionRatio ===
web/src/app/api/calculation/run/route.ts:1832:        const cardinalityRatio = totalRows > 0 ? distinctValues.size / totalRows : 0;
web/src/app/api/calculation/run/route.ts:1833:        const intersectionRatio = distinctValues.size > 0 && tenantEntityExternalIdsForEngine.size > 0
web/src/app/api/calculation/run/route.ts:1835:        const proposedConf = cardinalityRatio * intersectionRatio;
web/src/lib/intelligence/convergence-service.ts:1848:  const cardinalityRatio = candidateTotalRows > 0 ? distinctCount / candidateTotalRows : 0;
web/src/lib/intelligence/convergence-service.ts:1855:  const intersectionRatio = distinctCount > 0 && tenantEntityExternalIds.size > 0
web/src/lib/intelligence/convergence-service.ts:1858:  const score = cardinalityRatio * intersectionRatio;
```

Located surfaces:

1. **Calc-time engine verification** at `web/src/app/api/calculation/run/route.ts:1805-1909`
   - reads from `dataByBatch.get(eidBindingRaw.source_batch_id)` (in-memory Map keyed by import_batch_id and indexed at route.ts:717-766)
   - emits `engine:structural_exception` at line 1973 when verification fails

2. **Import-time binding-selection verification** at `web/src/lib/intelligence/convergence-service.ts:2058-2166`
   - reads via `supabase.from('committed_data').select('row_data').in('import_batch_id', cap.batchIds).range(...)` (lines 2080-2108)
   - calls `computeStructuralBindingConfidence` (lines 1842-1867) — pure-function distinct/intersection ratio

3. **Pure-function structural confidence composer** at `web/src/lib/intelligence/convergence-service.ts:1842-1867`
   - `computeStructuralBindingConfidence(candidateDistinctValues, candidateTotalRows, tenantEntityExternalIds): StructuralBindingConfidence`

### 2.2 — Verification code pasted verbatim

**Status: PASS**

#### A. Calc-time engine verification — `web/src/app/api/calculation/run/route.ts:1805-1909`

```typescript
      let bindingVerified = true;
      let bindingExceptionReason: string | null = null;
      // HF-219 Component R1: proposed correction holder. When verification finds an
      // alternative column with strictly higher score, this is populated and the
      // correction branch fires (atomic rule_sets update + engine_correction signal).
      let proposedCorrection: { column: string; confidence: number } | null = null;
      let verificationExistingScore = 0;
      const eidBindingRaw = compBindings?.entity_identifier as
        { column?: string; confidence?: number; source_batch_id?: string } | undefined;
      const eidColumn = eidBindingRaw?.column;
      const eidStoredConf = typeof eidBindingRaw?.confidence === 'number' ? eidBindingRaw.confidence : 0;
      if (compBindings && eidColumn && eidBindingRaw?.source_batch_id) {
        // Compute C_proposed: distinct values for the stored binding column = dataByBatch keys
        // for that batch (the cache is indexed by row_data[eidColumn] values — see dataByBatch
        // construction at lines 670+).
        const batchEntityMap = dataByBatch.get(eidBindingRaw.source_batch_id);
        const distinctValues = batchEntityMap ? new Set(Array.from(batchEntityMap.keys()).filter(k => k && k.length > 0)) : new Set<string>();
        let totalRows = 0;
        if (batchEntityMap) {
          for (const arr of Array.from(batchEntityMap.values())) totalRows += arr.length;
        }
        let intersectionCount = 0;
        if (tenantEntityExternalIdsForEngine.size > 0) {
          for (const v of Array.from(distinctValues)) {
            if (tenantEntityExternalIdsForEngine.has(v)) intersectionCount++;
          }
        }
        const cardinalityRatio = totalRows > 0 ? distinctValues.size / totalRows : 0;
        const intersectionRatio = distinctValues.size > 0 && tenantEntityExternalIdsForEngine.size > 0
          ? intersectionCount / distinctValues.size : 0;
        const proposedConf = cardinalityRatio * intersectionRatio;

        // Verification gate: C_proposed > 0 (binding has operative tenant-entity overlap).
        // When tenantEntityExternalIdsForEngine is empty, intersection_ratio is 0 by construction;
        // fall back to cardinality-only check (cardinalityRatio > 0 acceptable, score = cardinalityRatio).
        const operativeConf = proposedConf > 0 ? proposedConf : (tenantEntityExternalIdsForEngine.size === 0 ? cardinalityRatio : 0);
        verificationExistingScore = operativeConf;
        if (operativeConf === 0) {
          bindingVerified = false;
          bindingExceptionReason = tenantEntityExternalIdsForEngine.size === 0
            ? `cardinality_ratio=0 (column ${eidColumn} has zero distinct non-null values in batch)`
            : `intersection_ratio=0 (column ${eidColumn} distinct values do not intersect with tenant entities; distinct=${distinctValues.size} tenantSize=${tenantEntityExternalIdsForEngine.size})`;
        }
```

#### B. `dataByBatch` construction — `web/src/app/api/calculation/run/route.ts:717-766`

```typescript
  const dataByBatch = new Map<string, Map<string, Array<Record<string, unknown>>>>();
  if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
    // Step 1: Collect entity_identifier columns per batch from convergence bindings
    const entityColsByBatch = new Map<string, string>();
    for (const compBindings of Object.values(convergenceBindings)) {
      const cb = compBindings as Record<string, { source_batch_id?: string; column?: string }>;
      const entityIdBinding = cb.entity_identifier;
      if (entityIdBinding?.source_batch_id && entityIdBinding?.column) {
        entityColsByBatch.set(entityIdBinding.source_batch_id, entityIdBinding.column);
      }
      // HF-111: Index ALL binding role batches (actual, target, row, column, numerator, denominator)
      const bindingRoles = ['actual', 'target', 'row', 'column', 'numerator', 'denominator'];
      for (const role of bindingRoles) {
        const binding = cb[role];
        if (binding?.source_batch_id && !entityColsByBatch.has(binding.source_batch_id)) {
          if (entityIdBinding?.column) {
            entityColsByBatch.set(binding.source_batch_id, entityIdBinding.column);
          }
        }
      }
    }

    // Step 2: Index committed_data by row_data[entity_column] value (DS-009 pattern)
    // DIAG-003: The entity_identifier column name is the SAME across batches (e.g., "ID_Empleado").
    // Convergence bindings reference the source_batch_id where the column was LEARNED,
    // but new periods have different import_batch_ids with the SAME column names.
    // Index ALL committed_data rows using any known entity column, not just source_batch rows.
    const knownEntityCols = Array.from(new Set(Array.from(entityColsByBatch.values())));
    for (const row of committedData) {
      const batchId = row.import_batch_id;
      if (!batchId) continue;

      // Try the batch-specific entity column first, then any known entity column
      let entityCol = entityColsByBatch.get(batchId);
      if (!entityCol && knownEntityCols.length > 0) {
        entityCol = knownEntityCols[0]; // Same column name applies across batches
      }
      if (!entityCol) continue;

      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      const entityKey = String(rd[entityCol] ?? '').trim();
      if (!entityKey) continue;

      if (!dataByBatch.has(batchId)) dataByBatch.set(batchId, new Map());
      const entityMap = dataByBatch.get(batchId)!;
      if (!entityMap.has(entityKey)) entityMap.set(entityKey, []);
      entityMap.get(entityKey)!.push(rd);
    }
    addLog(`HF-109 Batch cache: ${dataByBatch.size} batches indexed by external_id (DS-009 5.1)`);
  }
```

#### C. Pure-function structural confidence composer — `web/src/lib/intelligence/convergence-service.ts:1842-1867`

```typescript
export function computeStructuralBindingConfidence(
  candidateDistinctValues: Set<string>,
  candidateTotalRows: number,
  tenantEntityExternalIds: Set<string>,
): StructuralBindingConfidence {
  const distinctCount = candidateDistinctValues.size;
  const cardinalityRatio = candidateTotalRows > 0 ? distinctCount / candidateTotalRows : 0;
  let intersectionCount = 0;
  if (tenantEntityExternalIds.size > 0) {
    for (const v of Array.from(candidateDistinctValues)) {
      if (tenantEntityExternalIds.has(v)) intersectionCount++;
    }
  }
  const intersectionRatio = distinctCount > 0 && tenantEntityExternalIds.size > 0
    ? intersectionCount / distinctCount
    : 0;
  const score = cardinalityRatio * intersectionRatio;
  return {
    score,
    cardinality_ratio: cardinalityRatio,
    intersection_ratio: intersectionRatio,
    distinct_count: distinctCount,
    intersection_count: intersectionCount,
    total_row_count: candidateTotalRows,
  };
}
```

### 2.3 — Verification executed against 5 failing BCL periods

**Status: PASS**

Replication script: `web/scripts/diag-hf221-verification-failing.ts` — mirrors engine fetch (route.ts:524-601 hybrid path) + `dataByBatch` construction (route.ts:717-766) + per-component verification (route.ts:1816-1846).

```
=== Convergence bindings (entity_identifier per component) ===
  component_0: column=ID_Empleado source_batch_id=91c2dd82-e298-4d6b-b2f9-3a8a2c436cde
  component_1: column=ID_Empleado source_batch_id=91c2dd82-e298-4d6b-b2f9-3a8a2c436cde
  component_2: column=ID_Empleado source_batch_id=91c2dd82-e298-4d6b-b2f9-3a8a2c436cde
  component_3: column=ID_Empleado source_batch_id=91c2dd82-e298-4d6b-b2f9-3a8a2c436cde
Tenant entity external_id set size: 85

### PERIOD Oct 2025 (id=97f3fdd8-1a6e-4693-ae32-c3a8a4d1bc22)
  committedData fetch: source_date=85 period_id_fallback=0 period_agnostic=85 total=170
  dataByBatch: 2 batches indexed
  dataByBatch batch IDs present: fb647366-6a79-4795-a144-411e0bfa91ef, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a
  component_0..3:
    eidColumn=ID_Empleado source_batch_id=91c2dd82-e298-4d6b-b2f9-3a8a2c436cde
    batchEntityMap_present=false
    distinct=0 totalBatchRows=0
    intersection_count=0 (vs 85 tenant entities)
    cardinality_ratio=0.0000 intersection_ratio=0.0000 score=0.0000
    bindingVerified=false

### PERIOD Nov 2025 (id=e845f8f9-feda-46cd-a90d-5736afd00a41)
  committedData fetch: source_date=85 period_id_fallback=0 period_agnostic=85 total=170
  dataByBatch batch IDs present: 0edb7dfd-e1f9-470b-ae2f-e360b7dd9561, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a
  component_0..3: batchEntityMap_present=false distinct=0 intersection_ratio=0.0000 score=0.0000 bindingVerified=false

### PERIOD Jan 2026 (id=6e3f1b6a-716d-4bc3-930b-75935e41159d)
  committedData fetch: source_date=85 period_id_fallback=0 period_agnostic=85 total=170
  dataByBatch batch IDs present: 157edf20-60e9-4b2b-8c49-5a55862130dc, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a
  component_0..3: batchEntityMap_present=false distinct=0 intersection_ratio=0.0000 score=0.0000 bindingVerified=false

### PERIOD Feb 2026 (id=25c9b256-539f-4379-bce0-27f5a5724425)
  committedData fetch: source_date=85 period_id_fallback=0 period_agnostic=85 total=170
  dataByBatch batch IDs present: 2e329e37-1b41-4050-a2fe-86e9770eb8d5, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a
  component_0..3: batchEntityMap_present=false distinct=0 intersection_ratio=0.0000 score=0.0000 bindingVerified=false

### PERIOD Mar 2026 (id=22155f28-e804-4b1a-870f-7e7b5de2dbaf)
  committedData fetch: source_date=85 period_id_fallback=0 period_agnostic=85 total=170
  dataByBatch batch IDs present: 6f64ac68-866f-4003-97a5-f15f2ac92aa4, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a
  component_0..3: batchEntityMap_present=false distinct=0 intersection_ratio=0.0000 score=0.0000 bindingVerified=false
```

### 2.4 — Verification executed against Dec 2025 succeeding period

**Status: PASS**

```
### PERIOD Dec 2025 (id=860b4255-23a0-48ce-9ac9-f604ad3058e1)
  committedData fetch: source_date=85 period_id_fallback=0 period_agnostic=85 total=170
  dataByBatch: 2 batches indexed
  dataByBatch batch IDs present: 91c2dd82-e298-4d6b-b2f9-3a8a2c436cde, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a

  component_0..3:
    eidColumn=ID_Empleado source_batch_id=91c2dd82-e298-4d6b-b2f9-3a8a2c436cde
    batchEntityMap_present=true
    distinct=85 totalBatchRows=85
    intersection_count=85 (vs 85 tenant entities)
    cardinality_ratio=1.0000 intersection_ratio=1.0000 score=1.0000
    bindingVerified=true
```

### 2.5 — Direct committed_data counts captured for all 6 periods

**Status: PASS**

Hybrid fetch path (source_date in range + period_id fallback + period-agnostic). Direct `period_id = X` filter alone returned 0 rows for all six periods (rows stored with `period_id IS NULL` and source_date IN range — OB-152 pattern).

```
PERIOD Oct 2025: total=170 (source_date=85, period_agnostic=85)
  distinct_id_empleado_jsonb_text: 85
  distinct_entity_id_fk: 85
  rows_with_id_empleado_key: 170
  distinct_import_batch_ids: fb647366-6a79-4795-a144-411e0bfa91ef, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a
  distinct_source_dates: 2025-10-01
  distinct_data_types: entity, transaction

PERIOD Nov 2025: total=170
  distinct_id_empleado_jsonb_text: 85
  distinct_entity_id_fk: 85
  rows_with_id_empleado_key: 170
  distinct_import_batch_ids: 0edb7dfd-e1f9-470b-ae2f-e360b7dd9561, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a
  distinct_source_dates: 2025-11-01

PERIOD Dec 2025: total=170
  distinct_id_empleado_jsonb_text: 85
  distinct_entity_id_fk: 85
  rows_with_id_empleado_key: 170
  distinct_import_batch_ids: 91c2dd82-e298-4d6b-b2f9-3a8a2c436cde, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a
  distinct_source_dates: 2025-12-01

PERIOD Jan 2026: total=170
  distinct_id_empleado_jsonb_text: 85
  distinct_entity_id_fk: 85
  rows_with_id_empleado_key: 170
  distinct_import_batch_ids: 157edf20-60e9-4b2b-8c49-5a55862130dc, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a
  distinct_source_dates: 2026-01-01

PERIOD Feb 2026: total=170
  distinct_id_empleado_jsonb_text: 85
  distinct_entity_id_fk: 85
  rows_with_id_empleado_key: 170
  distinct_import_batch_ids: 2e329e37-1b41-4050-a2fe-86e9770eb8d5, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a
  distinct_source_dates: 2026-02-01

PERIOD Mar 2026: total=170
  distinct_id_empleado_jsonb_text: 85
  distinct_entity_id_fk: 85
  rows_with_id_empleado_key: 170
  distinct_import_batch_ids: 6f64ac68-866f-4003-97a5-f15f2ac92aa4, 6e4db4c7-7d2a-4027-bdb8-d37638254b4a
  distinct_source_dates: 2026-03-01
```

### 2.6 — Tenant entity baseline captured

**Status: PASS**

```
TOTAL ENTITIES: 85
DISTINCT EXTERNAL_IDS: 85
SAMPLE external_ids (first 10): BCL-5002, BCL-5004, BCL-5006, BCL-5008, BCL-5012, BCL-5014, BCL-5016, BCL-5017, BCL-5019, BCL-5022
```

(Note: `entities.scope` column does not exist in this schema; query adjusted to `id, external_id` only. Per VP discipline, full schema enumeration deferred to architect SQL Editor.)

### 2.7 — Convergence binding state captured

**Status: PASS**

Rule set: `6008fb2c-da17-46a3-ba1e-b0181ca530a1` ("Plan de Comisiones — Banca Minorista 2025-2026"). Last updated `2026-05-13T01:05:50.428195+00:00`.

```
convergence_bindings (entity_identifier per component):

  component_0.entity_identifier:
    column = ID_Empleado
    confidence = 0.16666666666666666
    match_pass = 1
    source_batch_id = 91c2dd82-e298-4d6b-b2f9-3a8a2c436cde
    field_identity = { structuralType: identifier, contextualIdentity: person_identifier, confidence: 0.95 }

  component_1.entity_identifier: same column = ID_Empleado, same source_batch_id = 91c2dd82-...
  component_2.entity_identifier: same column = ID_Empleado, same source_batch_id = 91c2dd82-...
  component_3.entity_identifier: same column = ID_Empleado, same source_batch_id = 91c2dd82-...

All four components' bindings (period, row, column, actual, etc.) reference the
same source_batch_id = 91c2dd82-e298-4d6b-b2f9-3a8a2c436cde.

Cross-reference: 91c2dd82-e298-4d6b-b2f9-3a8a2c436cde is the import_batch_id
present in Dec 2025's committed_data (Phase 2.5 distinct_import_batch_ids),
and absent from the other five periods' data.

metric_derivations: 1 rule (cumplimiento_depositos, operation=ratio).
```

### 2.8 — Side-by-side comparison table produced

**Status: PASS**

Period scope: BCL all 6 periods. Verification function: per-component (4 components per period, all identical bindings, so one row per period summarizes all 4).

| period_label | period_id (last 8) | HF-218 verification distinct | HF-218 intersection_ratio | HF-218 score | bindingVerified | Direct total_rows | Direct distinct_id_empleado_jsonb_text | Direct distinct_entity_id_fk | Direct rows_with_id_empleado_key |
|---|---|---|---|---|---|---|---|---|---|
| Oct 2025 | a4d1bc22 | 0 | 0.0000 | 0.0000 | false | 170 | 85 | 85 | 170 |
| Nov 2025 | 5736afd00a41 | 0 | 0.0000 | 0.0000 | false | 170 | 85 | 85 | 170 |
| **Dec 2025** | **f604ad3058e1** | **85** | **1.0000** | **1.0000** | **true** | 170 | 85 | 85 | 170 |
| Jan 2026 | 75935e41159d | 0 | 0.0000 | 0.0000 | false | 170 | 85 | 85 | 170 |
| Feb 2026 | 27f5a5724425 | 0 | 0.0000 | 0.0000 | false | 170 | 85 | 85 | 170 |
| Mar 2026 | 7b5de2dbaf | 0 | 0.0000 | 0.0000 | false | 170 | 85 | 85 | 170 |

Supplementary numerical observation (CC reports; does not diagnose):

| period_label | source_batch_id from binding | import_batch_ids present in this period's committed_data |
|---|---|---|
| Oct 2025 | 91c2dd82-e298-4d6b-b2f9-3a8a2c436cde | fb647366-...-411e0bfa91ef, 6e4db4c7-...-d37638254b4a |
| Nov 2025 | 91c2dd82-e298-4d6b-b2f9-3a8a2c436cde | 0edb7dfd-...-e360b7dd9561, 6e4db4c7-...-d37638254b4a |
| Dec 2025 | 91c2dd82-e298-4d6b-b2f9-3a8a2c436cde | **91c2dd82-...-3a8a2c436cde**, 6e4db4c7-...-d37638254b4a |
| Jan 2026 | 91c2dd82-e298-4d6b-b2f9-3a8a2c436cde | 157edf20-...-5a55862130dc, 6e4db4c7-...-d37638254b4a |
| Feb 2026 | 91c2dd82-e298-4d6b-b2f9-3a8a2c436cde | 2e329e37-...-86e9770eb8d5, 6e4db4c7-...-d37638254b4a |
| Mar 2026 | 91c2dd82-e298-4d6b-b2f9-3a8a2c436cde | 6f64ac68-...-f15f2ac92aa4, 6e4db4c7-...-d37638254b4a |

CC reports numbers only. Architect dispositions diagnosis and Phase 3 fix scope (T2-E46).

---

## PROOF GATES — SOFT

| # | Criterion | PASS / FAIL | Evidence |
|---|-----------|-------------|----------|
| - | No `DATABASE_URL` / pg client / psql / exec_sql used (VP discipline) | PASS | grep `web/scripts/diag-hf221-*.ts` shows only `createClient` from `@supabase/supabase-js`; no `pg`, `psql`, `exec_sql` imports |
| - | Architect-channel SQL Editor used for pg_catalog queries | PASS | Phase 0.1 + Phase 1.3 explicitly flagged as architect-channel; CC defers, no attempt to query pg_catalog via PostgREST |
| - | Reconciliation-channel separation observed (CC reports numbers; no diagnosis) | PASS | Phase 2.8 table presents numbers verbatim; no root-cause claim; supplementary observation flagged as "CC reports; does not diagnose" |
| - | Verification function reproduced via service-role + TypeScript aggregation where PostgREST cannot evaluate | PASS | `diag-hf221-verification-{failing,succeeding}.ts` page through committed_data, build `dataByBatch` Map in TypeScript, compute distinct/intersection in JS exactly as engine does |

---

## STANDING RULE COMPLIANCE

- **Rule 1 (commit+push each phase):** PASS for Phase 0/1 file authoring + Phase 2 diagnostic script execution; Phase 1.5 + Phase 2.10 commits pushed as enumerated above
- **Rule 6 (migration executed AND verified):** PENDING — Phase 1.2 (architect-apply) + Phase 1.3 (architect-verify) + Phase 1.4 (CC sanity insert) pending architect-channel completion
- **Rule 10 (autonomy directive followed):** PASS — no yes/no requests; HALT triggered exactly where directive specifies (end of Phase 2)
- **Rule 14 (HF prompt committed to git):** Recommend architect drop HF-221 v2 directive markdown into `docs/vp-prompts/` for Rule 14 compliance; CC has not pre-committed since the directive file is architect-managed

---

## KNOWN ISSUES / OPEN ITEMS

- **R3 Phase 1 is diagnostic only.** Phase 3 fix scope architect-dispositioned post-evidence (T1-E953 Decision-Implementation Gap Pattern: directive's stated semantic — "HF-218 verification reads ID_Empleado distinct values from committed_data" — is verified against operative implementation, which reads from `dataByBatch.get(source_batch_id)` in-memory Map keyed by `import_batch_id`).
- **Phase 0.1 + Phase 1.2 + Phase 1.3 + Phase 1.4 pending architect-channel actions.** CC commits Phase 0/1/2 artifacts on branch; sanity insert (1.4) runs as a follow-up commit after architect signals R1 applied.
- **Schema info_schema details not in this report.** Per VP discipline, full column-type metadata requires architect SQL Editor. Sample-row column-name discovery was sufficient for HF-221 scope; if Phase 3 surfaces a need for full type metadata, architect provides via SQL Editor.

---

## STATUS

- **R1 (Schema-layer registry eradication):** PARTIAL — migration file authored + committed; architect-channel apply pending (1.2); architect-channel verification pending (1.3); CC sanity insert pending architect signal (1.4)
- **R3 Phase 1 (HF-218 verification distinct=0 diagnostic):** COMPLETE — verification code located + pasted verbatim; replication script executed against all 6 BCL periods; direct committed_data counts captured; entity baseline + convergence binding state captured; side-by-side numerical comparison produced
- **HALT for architect Phase 3 disposition.**
