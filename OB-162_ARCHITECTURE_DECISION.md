# OB-162 Architecture Decision Record

## Decision 111 — Field Identity Architecture Vertical Slice

```
ARCHITECTURE DECISION RECORD
============================
Problem: Import currently routes data to separate tables (entities, committed_data,
reference_data) based on classification. This forces premature routing decisions.
Decision 111 requires unified storage with field identity metadata.

Option A: Modify existing SCI execute route to store field identities and route
everything to committed_data. Modify convergence to match field identities.
  - Scale test: Works at 10x? YES — same bulk insert path to committed_data, no new tables
  - AI-first: Any hardcoding? NO — field identities come from HC LLM analysis, no hardcoded field names
  - Transport: Data through HTTP bodies? NO — same file storage transport as existing pipeline
  - Atomicity: Clean state on failure? YES — committed_data insert failure rolls back batch, import_batches marked failed

Option B: Create new import pipeline alongside existing one (parallel paths).
  - Scale test: Works at 10x? YES — but doubles code surface area
  - AI-first: Any hardcoding? SAME — inherits from either approach
  - Transport: Data through HTTP bodies? SAME
  - Atomicity: Clean state on failure? HARDER — two parallel pipelines = two failure modes

CHOSEN: Option A because:
  1. AP-17 prohibits dual code paths for the same feature
  2. Existing transaction/target pipelines already write to committed_data with metadata — reference pipeline just joins them
  3. HC already returns structuralType (columnRole) and contextualIdentity (semanticMeaning) — we store these as field_identities
  4. Convergence already reads committed_data metadata — we enhance matching from token overlap to field identity matching
  5. Engine already reads input_bindings — we populate them with convergence-generated bindings

REJECTED: Option B because:
  1. Violates AP-17 (dual code paths)
  2. Doubles maintenance burden
  3. Creates migration complexity — when to switch from old to new?
  4. No architectural benefit over modifying existing pipeline
```

## Implementation Strategy

### HC Prompt (Phase 1)
The existing HC prompt already returns `columnRole` (identifier, name, temporal, measure, attribute, reference_key) and `semanticMeaning` (employee_identifier, currency_amount, etc.). These map directly to Decision 111's `structuralType` and `contextualIdentity`. The prompt text changes to ask "what IS each column" for stability, but the response structure is backward-compatible.

### Unified Storage (Phase 1)
The reference pipeline currently writes to reference_data + reference_items. It will be modified to write to committed_data with the same row_data + metadata pattern used by transaction/target pipelines. Field identities from HC are stored in `metadata.field_identities`.

### Convergence (Phase 2)
Current token-overlap matching (component name tokens vs data_type tokens) is replaced with a 3-pass field identity algorithm:
- Pass 1: Structural match — find batches with required structuralTypes
- Pass 2: Contextual match — use contextualIdentity to disambiguate among structural matches
- Pass 3: Semantic (future) — flywheel knowledge

Output format changes from `{ metric_derivations: MetricDerivationRule[] }` to per-component bindings with source_batch_id + column references, while preserving MetricDerivationRule[] for backward compatibility.

### Engine (Phase 3)
Engine reads new input_bindings format. For each component, it knows exactly which batch and column to query. Falls back to existing sheet-matching logic if input_bindings empty.

### Scale Analysis
| Volume | Current | 10x | 100x |
|--------|---------|-----|------|
| committed_data rows | 86 | 860 | 8,600 |
| Field identity lookups | O(batches) | O(batches) | O(batches) |
| Convergence matching | O(components × batches) | Same | Same |
| Engine queries | Per-entity per-component | Same | Same |

Field identity matching scales better than token overlap because it uses indexed JSONB queries instead of string tokenization.
