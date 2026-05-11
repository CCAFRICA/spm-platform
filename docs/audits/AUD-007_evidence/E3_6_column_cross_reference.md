# E3.6 — Column Cross-Reference: E3.1 Schema vs E1.3 Canonical Writer Insert

**Sources:**
- E3.1: 24 columns observed in live `classification_signals` (sample-row introspection; nullability/default not available in this environment)
- E1.3: 19 columns the canonical writer's `buildInsertRow` constructs

CC produces this table. CC does NOT comment on matches/mismatches. Architect reads.

| Schema column (E3.1) | NULL? (from sample / migration 003 if known) | Default (where known) | Written by canonical writer? (E1.3) | If written, source field |
|---|---|---|---|---|
| `id` | NO (PRIMARY KEY per migration 003) | `uuid_generate_v4()` per migration 003 | NO | (Postgres default applies) |
| `tenant_id` | NO (NOT NULL per migration 003) | (none) | YES | `signal.tenantId` |
| `entity_id` | YES (per migration 003 `REFERENCES entities(id) ON DELETE SET NULL`) | (none) | YES | `signal.entityId ?? null` |
| `signal_type` | NO (NOT NULL per migration 003) | (none) | YES | `signal.signalType` |
| `signal_value` | NO (NOT NULL per migration 003) | `'{}'` per migration 003 | YES | `(signal.signalValue ?? {}) as Json` |
| `confidence` | YES (NUMERIC(5,4) per migration 003; bound check not visible) | (none) | YES | `confidenceToPersist` parameter (null on out_of_range / missing_required) |
| `source` | YES (no NOT NULL per migration 003) | (none) | YES | `signal.source ?? 'ai_prediction'` |
| `context` | NO (NOT NULL per migration 003) | `'{}'` per migration 003 | YES | `(signal.context ?? {}) as Json` |
| `created_at` | NO (NOT NULL per migration 003) | `now()` per migration 003 | NO | (Postgres default applies) |
| `source_file_name` | (E3.1 fallback shows null; nullability per migration 007/HF-092 not surfaced verbatim) | (unknown in this evidence environment) | YES | `signal.sourceFileName ?? null` |
| `sheet_name` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | YES | `signal.sheetName ?? null` |
| `structural_fingerprint` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | YES | `(signal.structuralFingerprint ?? null) as Json \| null` |
| `classification` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | YES | `signal.classification ?? null` |
| `decision_source` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | YES | `signal.decisionSource ?? null` |
| `classification_trace` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | YES | `(signal.classificationTrace ?? null) as Json \| null` |
| `header_comprehension` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | **NO** | (column exists in schema; not in CanonicalSignalInput interface; not written by canonical writer) |
| `vocabulary_bindings` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | YES | `(signal.vocabularyBindings ?? null) as Json \| null` |
| `agent_scores` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | YES | `(signal.agentScores ?? null) as Json \| null` |
| `human_correction_from` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | YES | `signal.humanCorrectionFrom ?? null` |
| `scope` | (E3.1 fallback shows string 'tenant'; nullability not surfaced) | (unknown) | YES | `signal.scope ?? null` |
| `rule_set_id` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | YES | `signal.ruleSetId ?? null` |
| `metric_name` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | **NO** | (column exists in schema; not in CanonicalSignalInput interface; not written by canonical writer) |
| `component_index` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | **NO** | (column exists in schema; not in CanonicalSignalInput interface; not written by canonical writer) |
| `calculation_run_id` | (E3.1 fallback shows null; nullability not surfaced) | (unknown) | YES | `signal.calculationRunId ?? null` |

**Count check:**
- Schema columns (E3.1): 24
- Canonical writer writes: 19
- Schema columns NOT written by canonical writer: 5 (`id`, `created_at` — Postgres defaults; `header_comprehension`, `metric_name`, `component_index` — present in schema but absent from `CanonicalSignalInput` interface)

CC surfaces the cross-reference. Architect reads whether the 3 missing-from-CanonicalSignalInput columns (`header_comprehension`, `metric_name`, `component_index`) represent intentional omission or oversight.
