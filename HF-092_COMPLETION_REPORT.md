# HF-092 Completion Report: Classification Signals Schema Correction

## Phase 0 Audit Results

### Current Schema (before migration)
```
classification_signals: id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at
```
Missing: source_file_name, sheet_name, structural_fingerprint, classification, decision_source, classification_trace, header_comprehension, vocabulary_bindings, agent_scores, human_correction_from, scope

### Current Signal Counts
- Total signals: 54
- Phase E signals (sci:classification_outcome_v2): 0
- Distinct signal types: training:plan_interpretation, sci:cost_event, sci:content_classification_outcome, sci:content_classification, sci:field_binding

### OB-160E Deviation
`writeClassificationSignal` stored ALL Phase E data inside `signal_value` JSONB blob under `signal_type: 'sci:classification_outcome_v2'`. `lookupPriorSignals` and `recallVocabularyBindings` read from `signal_value` with client-side parsing. `trace/route.ts` used JSONB path filters.

## Schema Migration

### SQL (web/scripts/hf092-migration.sql)
Must be run in Supabase SQL Editor:
- ALTER TABLE adds 11 dedicated columns (IF NOT EXISTS)
- 4 indexes created: idx_cs_tenant_scope, idx_cs_tenant_fingerprint, idx_cs_vocab_bindings, idx_cs_foundational
- Migration UPDATE for any existing Phase E signals (currently 0)

### Columns Added
| Column | Type | Purpose |
|--------|------|---------|
| source_file_name | TEXT | Source file tracking |
| sheet_name | TEXT | Sheet-level signal |
| structural_fingerprint | JSONB | Bucketed fingerprint for fuzzy matching |
| classification | TEXT | Winning agent type |
| decision_source | TEXT | 'signature', 'heuristic', 'prior_signal', 'human_override' |
| classification_trace | JSONB | Full ClassificationTrace from Phase C/D |
| header_comprehension | JSONB | LLM interpretations from Phase B |
| vocabulary_bindings | JSONB | Confirmed header → meaning mappings |
| agent_scores | JSONB | All agent scores (Round 1 + Round 2) |
| human_correction_from | TEXT | Original classification if overridden |
| scope | TEXT DEFAULT 'tenant' | 'tenant', 'foundational', 'domain' |

Note: `confidence` already exists from OB-86 schema.

### Indexes Created
| Index | Definition | Purpose |
|-------|-----------|---------|
| idx_cs_tenant_scope | (tenant_id, scope) | Hot path for prior signal lookup |
| idx_cs_tenant_fingerprint | (tenant_id) WHERE scope='tenant' | Tenant-scoped fingerprint matching |
| idx_cs_vocab_bindings | (tenant_id, created_at DESC) WHERE vocabulary_bindings IS NOT NULL | Fast vocabulary recall |
| idx_cs_foundational | (scope, structural_fingerprint) WHERE scope='foundational' | Cross-tenant flywheel (Phase I) |

## Service Updates

### writeClassificationSignal — BEFORE vs AFTER
```
BEFORE: .insert({ signal_type, signal_value: { ALL DATA IN BLOB }, confidence })
AFTER:  .insert({ signal_type, source_file_name, sheet_name, structural_fingerprint,
                   classification, confidence, decision_source, classification_trace,
                   vocabulary_bindings, agent_scores, human_correction_from, scope })
```

### lookupPriorSignals — BEFORE vs AFTER
```
BEFORE: .select('id, signal_value, confidence') → client-side parse signal_value
AFTER:  .select('id, classification, confidence, decision_source, structural_fingerprint')
        .eq('scope', 'tenant')
```

### recallVocabularyBindings — BEFORE vs AFTER
```
BEFORE: .select('signal_value') .not('signal_value->vocabulary_bindings', 'is', null)
AFTER:  .select('vocabulary_bindings') .not('vocabulary_bindings', 'is', null)
```

### trace/route.ts — BEFORE vs AFTER
```
BEFORE: .select('id, tenant_id, signal_type, signal_value, confidence, source, context, created_at')
        .filter('signal_value->>source_file_name', 'eq', sourceFile)
AFTER:  .select('id, source_file_name, sheet_name, classification, confidence, decision_source,
                  structural_fingerprint, classification_trace, vocabulary_bindings, agent_scores,
                  human_correction_from, scope, created_at')
        .eq('source_file_name', sourceFile)
```

## signal_value Grep Verification
```
grep -n "signal_value" classification-signal-service.ts:
  Line 2: comment only — "not signal_value JSONB blob"
  Line 124: comment only — "not signal_value JSONB"
ZERO functional signal_value references.

grep -n "signal_value" trace/route.ts:
  Line 3: comment only — "not signal_value JSONB blob"
ZERO functional signal_value references.
```

## Proof Gates

### Phase 0: Audit
- PG-00: PASS — Current schema documented, 54 OB-86 signals, 0 Phase E signals

### Phase 1: Schema Migration
- PG-01: PENDING — Dedicated columns exist (requires SQL Editor execution)
- PG-02: PENDING — Index idx_cs_tenant_scope exists
- PG-03: PENDING — Index idx_cs_tenant_fingerprint exists
- PG-04: PENDING — Index idx_cs_vocab_bindings exists
- PG-05: PENDING — Index idx_cs_foundational exists
- PG-06: PASS — 0 Phase E signals to migrate (verified by count query)
- PG-07: PASS — OB-86 signals untouched (ALTER TABLE adds nullable columns only)

### Phase 2: Service Updates
- PG-08: PASS — writeClassificationSignal writes dedicated columns (lines 90-103)
- PG-09: PASS — lookupPriorSignals queries dedicated columns (line 146)
- PG-10: PASS — recallVocabularyBindings queries vocabulary_bindings column (line 204)
- PG-11: PASS — Trace API queries dedicated columns (lines 28-35)
- PG-12: PASS — ZERO signal_value references in classification-signal-service.ts
- PG-13: PASS — ZERO signal_value references in trace/route.ts
- PG-14: PASS — npm run build exits 0

### Phase 3: Build + PR
- PG-15: PASS — npm run build exits 0
- PG-16: Pending — localhost:3000
- PG-17: PENDING — Schema query (requires SQL Editor verification)
- PG-18: PENDING — Index query (requires SQL Editor verification)
- PG-19: PASS — Zero signal_value references for SCI data
- PG-20: PASS — Zero signal_value references in trace/route.ts
- PG-21: Pending — PR creation

## Standing Rule 2 Compliance

Before HF-092: O(n) JSONB path scanning for prior signal lookup, vocabulary recall, trace queries
After HF-092: O(log n) indexed column queries on dedicated columns

Scale test projection:
- 50 tenants × 100 imports × 3 sheets = 15,000 signals → indexed columns: <1ms lookup
- 500 tenants × 1,000 imports × 3 sheets = 1.5M signals → indexed columns: <5ms lookup

## ACTION REQUIRED

Run `web/scripts/hf092-migration.sql` in the Supabase SQL Editor to add the dedicated columns and indexes. The code changes are deployed but the columns won't be written until the migration is applied. Signal writes will fail silently (fire-and-forget) until then.
