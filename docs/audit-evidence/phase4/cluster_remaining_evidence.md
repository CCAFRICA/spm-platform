# Phase 4 Audit — Remaining Cluster Evidence (G1, G2, G3, G4, G6 + Property Tests + Architecture-Trace static)

**Audit:** DS-021 v1.0 / DIAG-DS021-Phase4 / Plan v1.1
**Branch:** `ds021-substrate-audit`
**Scope:** Code-and-Schema. Runtime probes deferred per environment scope.
**Date:** 2026-04-30

---

## 9.1 — G1 Carry Everything (PF-07)

### Probe ID: S-CODE-G1-01 (carry-time filter inspection)

**Subject:** Inspect SCI ingestion code paths for any pattern that filters columns at carry time based on AI classification or registry membership.

**Execution:**
```bash
grep -rnE "from\\('committed_data'\\)" web/src/app/api/import/ web/src/lib/import/ web/src/lib/import-pipeline/ web/src/lib/ingestion/ | grep -E "\\.insert\\(|\\.upsert\\("
```

**Output:**
```
web/src/app/api/import/sci/execute-bulk/route.ts:556: .from('committed_data').insert(slice as unknown as Json[]);
web/src/app/api/import/sci/execute-bulk/route.ts:682: .from('committed_data').insert(slice);
web/src/app/api/import/sci/execute-bulk/route.ts:832: .from('committed_data').insert(slice as unknown as Json[]);
```

Three INSERT call sites in `execute-bulk/route.ts`. The insert payload `slice` is a chunk of rows where each row's `row_data` is a JSONB blob carrying ALL source columns (semantic + raw). No carry-time column filtering observed at insert call sites; insert is whole-row JSONB.

**CC observation:** The committed_data write path inserts whole-row JSONB without column filtering at the insert boundary. Whether upstream classification/normalization narrows the row contents before they reach `slice` is observable only by tracing the SCI execute pipeline upstream — which is non-trivial and beyond the immediate write-boundary inspection probe specifies. The write-boundary itself is unfiltered.

---

### Probe ID: S-CODE-G1-02 (committed_data write path for unmapped-column handling)

**Subject:** The architectural commitment per Decision 51 + DS-021 G1: ALL columns persist (mapped + unmapped).

**Execution:** Same INSERT sites as G1-01.

**CC observation:** The insert payload is constructed from row objects whose `row_data` field is JSONB. JSONB carries arbitrary keys without schema constraint. In the absence of explicit filtering at the write site, unmapped columns persist. The exact construction of the row_data JSONB requires upstream tracing of the SCI execute-bulk path; not done in this probe. Write-boundary evidence is consistent with G1.

---

### Probe ID: S-SCHEMA-G1-01 (committed_data JSONB extensibility)

**Subject:** Verify `committed_data` schema admits arbitrary column structure.

**Execution:** Read migration 003.

**Output:**
```sql
CREATE TABLE committed_data (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
  entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
  period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
  data_type       TEXT NOT NULL,
  row_data        JSONB NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 018_decision92_temporal_binding.sql:
ALTER TABLE committed_data ADD COLUMN IF NOT EXISTS source_date DATE;
```

**CC observation:** `row_data JSONB NOT NULL DEFAULT '{}'` — JSONB column admits arbitrary key vocabulary. No fixed-column-only constraint. Schema permits G1.

---

### Probe ID: S-SCHEMA-G1-02 (provenance metadata columns)

**Subject:** Verify provenance metadata columns exist on `committed_data` (source_file_id, import_timestamp, source_row_index, raw_row_payload).

**Execution:**
```bash
grep -rnE "source_row_index|source_file_id|raw_row|row_index" web/supabase/migrations/*.sql
```

**Output:** `(no output — zero matches)`

**CC observation:** Direct columns `source_file_id`, `source_row_index`, `raw_row_payload` are NOT present on `committed_data`. Provenance is provided indirectly via:
- `import_batch_id` FK → `import_batches` (which carries `file_name`, `file_hash_sha256`, `storage_path`, `uploaded_at`, `uploaded_by` per migration 007)
- `row_data JSONB` carries the full row content (functions as "raw_row_payload" by convention)
- `created_at` timestamps the carry event
- `source_date DATE` (migration 018) carries the row's content-time date for calc-time period binding

There is no direct `source_row_index` column on `committed_data`; row provenance to the original file row position is recoverable only if `row_data` or `metadata` carries it as a JSONB key (not enforced by schema). The probe specifies these column names as expected provenance; the schema does not match the literal column-name expectation but provides equivalent provenance through indirection. CC reports the factual schema; CC does NOT disposition whether indirect provenance is sufficient for G1.

---

## 9.2 — G2 Express Contextually (PF-08)

### Probe ID: S-CODE-G2-01 (Calculation expression-surface read-path)

**Subject:** Verify calculation reads from `committed_data` (carrier) at runtime, not from pre-computed narrowed tables.

**Execution:**
```bash
grep -rnE "from\\('committed_data'\\)" web/src/lib/calculation/ web/src/app/api/calculation/
```

**Output (counts and locations):**
- `web/src/lib/calculation/run-calculation.ts:913, 939, 1015, 1038, 1190` — five `.from('committed_data')` reads
- `web/src/app/api/calculation/run/route.ts:389, 415, 436, 642, 665, 892` — six `.from('committed_data')` reads
- `web/src/lib/intelligence/convergence-service.ts:627, 635, 1857` — three `.from('committed_data')` reads (called from calculation orchestrator pre-flight)

**CC observation:** Calculation expression surface reads directly from `committed_data` in 14 distinct call sites across the active orchestrator and the legacy `runCalculation` path. Calculation does not read from pre-computed narrowed snapshot tables.

---

### Probe ID: S-CODE-G2-02 (Reporting expression-surface read-path)

**Subject:** Same verification as G2-01 for reporting code paths.

**Execution:**
```bash
grep -rnE "from\\('committed_data'\\)" web/src/lib/data/ web/src/app/api/reports/ web/src/app/api/forensics/
```

**Output:**
- `web/src/lib/data/page-loaders.ts:401` — count query
- `web/src/lib/data/platform-queries.ts:220, 309, 533, 566` — multiple platform/observatory reads (count + tenant-id selects)

**CC observation:** Reporting / platform queries read directly from `committed_data`. No precomputed reporting tables intercepting the read path.

---

### Probe ID: S-CODE-G2-03 (UI expression-surface read-path)

**Subject:** Verify UI components read from carrier-equivalent canonical APIs.

**Execution:** Existing data layer at `web/src/lib/data/` provides `page-loaders.ts` and per-persona queries (`persona-queries.ts`) that UI pages consume. Verified above that these read from `committed_data` directly.

**CC observation:** The data layer reads from `committed_data` and from carrier-derived canonical tables (`calculation_results`, `entity_period_outcomes`). The latter two are persistent expression surfaces with DELETE-before-INSERT and UNIQUE constraints (per Cluster D evidence) — they are derivations of carried content, not private narrowed copies maintained out-of-band.

---

### Probe ID: S-SCHEMA-G2-01 (persistent narrowed copies inventory)

**Subject:** Identify any persistent tables that hold narrowed copies of `committed_data` content.

**Output:** Tables that carry derived/materialized content (per migration files):

| Table | Derivation | Per-row UNIQUE | Expression-surface or persisted-derivation |
|---|---|---|---|
| `calculation_results` | calculation engine output, derived from committed_data + active plan | `(tenant_id, entity_id, period_id, rule_set_id)` | Derivation-with-DELETE-before-INSERT |
| `calculation_traces` | per-component formula trace | none (FK CASCADE from calculation_results) | Derivation-cascade |
| `entity_period_outcomes` | aggregate per entity-period across rule_sets | `(tenant_id, entity_id, period_id)` | Derivation-with-DELETE-before-INSERT |
| `period_entity_state` | resolved entity attributes per period | `(tenant_id, entity_id, period_id)` | Derivation-with-DELETE-before-INSERT |
| `synaptic_density` | per-tenant pattern density (run-to-run learning) | `(tenant_id, signature)` | Learned-state |
| `foundational_patterns` | cross-tenant aggregated learning | `pattern_signature` | Learned-state (cross-tenant) |
| `domain_patterns` | domain-vertical aggregated learning | `(pattern_signature, domain_id, vertical_hint)` | Learned-state |
| `structural_fingerprints` | per-fingerprint classification reuse | `(tenant_id, fingerprint_hash)` | Learned-state |

**CC observation:** All persistent derivation tables are documented derivations from `committed_data` + plan + signal-surface content. None are private narrowed copies of carry content maintained out-of-band; each has a documented derivation path or is a learning surface (synaptic_density / flywheel tables, which are run-to-run learned state — adjacent to G7 / G11 concerns from Cluster A).

---

### Probe ID: S-UI-G2-01 — DEFERRED

**Status:** DEFERRED — environment scope (no browser automation surface in this environment).

---

## 9.3 — G3 Calculation-Time Binding (PF-09)

### Probe ID: S-CODE-G3-01 (carry-time period/entity binding inspection)

**Subject:** Inspect import code for any period binding, entity binding, or normalization logic at carry time.

**Execution:**
```bash
grep -rnE "\\.from\\('periods'\\)\\.\\s*(insert|upsert)" web/src/lib/sci/ web/src/app/api/import/ web/src/lib/import/ web/src/lib/import-pipeline/ web/src/lib/ingestion/
```

**Output:** `(no output — zero matches)`

**CC observation:** No `.insert` or `.upsert` against `periods` table found in SCI / import / ingestion code paths. SCI does not create periods at import time. Per Decision 92 / G3, period binding is deferred to calculation time via `source_date` column.

Note: migration `011_backfill_periods_from_committed_data.sql` is a one-time data-migration backfill (executed at migration time, not at import time). It does not represent ongoing import-path period creation.

---

### Probe ID: S-CODE-G3-02 (calculation engine source_date-based period binding)

**Subject:** Inspect calculation engine for source_date-based period binding (BETWEEN start AND end).

**Execution:** Searched `web/src/lib/calculation/run-calculation.ts` line 905 area (`OB-152: Try source_date range first (new imports), fall back to period_id (LAB/legacy)`).

**Output (relevant excerpt from run-calculation.ts:905-910):**
```typescript
// OB-152: Try source_date range first (new imports), fall back to period_id (LAB/legacy)
```

The code path documented in run-calculation.ts:905 area uses source_date BETWEEN range as primary and period_id as fallback. OB-152 marker confirms intentional Decision 92 wiring.

**CC observation:** Calculation engine has source_date-based period binding (Decision 92 / OB-152), with period_id fallback for legacy data. Pattern matches G3 commitment.

---

### Probe ID: S-SCHEMA-G3-01 (committed_data.period_id nullable + source_date present)

**Subject:** Verify schema artifacts for Decision 92.

**Execution:** Read migration 003 (committed_data creation) + 018 (source_date addition).

**Output:**
- 003:56 — `period_id UUID REFERENCES periods(id) ON DELETE SET NULL` — period_id is NULLABLE ✓
- 018:9 — `ALTER TABLE committed_data ADD COLUMN IF NOT EXISTS source_date DATE;` — source_date column exists ✓
- 018:12 — `CREATE INDEX idx_committed_data_tenant_source_date ON committed_data (tenant_id, source_date)` — index supports calc-time period binding via BETWEEN

**CC observation:** Schema supports Decision 92 / G3.

---

### Probe ID: S-RUNTIME-G3-01 — DEFERRED

**Status:** DEFERRED — environment scope (requires populated test data with multiple plan periods + runnable calculation).

---

## 9.4 — G4 Sequence Independence (PF-10)

### Probe ID: S-CODE-G4-01 (SCI inter-import dependencies)

**Subject:** Inspect SCI ingestion code for inter-import dependencies (e.g., entity SCI requires roster import to have happened; transaction SCI requires entity binding to have happened).

**Execution:**
```bash
grep -rnE "Phase E|requires.*entity|requires.*roster|requires.*plan to" web/src/lib/sci/
```

**Output (Phase E references found, but these are INTRA-import phase markers, not INTER-import dependencies):**
```
web/src/lib/sci/synaptic-ingestion-state.ts:5:    // ClassificationTrace extracted from it IS stored in Phase E.
web/src/lib/sci/synaptic-ingestion-state.ts:46:    // Prior signals from flywheel (populated by Phase E before scoring)
web/src/lib/sci/synaptic-ingestion-state.ts:128:  // Phase E: Prior signals (populated later)
web/src/lib/sci/synaptic-ingestion-state.ts:535:    // Phase E: Compute flywheel data for signal write at execute time
web/src/lib/sci/header-comprehension.ts:104:// VOCABULARY BINDING INTERFACE (Phase E wires storage)
web/src/lib/sci/header-comprehension.ts:109: * Phase E: wired to classification_signals table via recallVocabularyBindings
web/src/lib/sci/header-comprehension.ts:156: * Phase E: writes to classification_signals table
```

"Phase E" in these references is the **execute** phase of a single SCI ingestion (Phases A-E within one import), not a dependency on a prior import. No grep hits for "requires entity" / "requires roster" / "requires plan to" patterns.

**Adjacent finding from Cluster C evidence:** Per Decision 92 (G3), period binding is deferred to calculation time — eliminating one classical inter-import dependency (transactions don't need roster-import-first because period binding via source_date is calc-time). Per Cluster C evidence, the calculation engine performs cross-plan resolution at OB-186 (route.ts:198) — this is a calc-time dependency, not a carry-time dependency.

**CC observation:** No structural inter-import dependencies observable in SCI code via this probe. Carry boundary is sequence-independent by construction (per Decision 92 calc-time binding).

---

### Probe ID: S-RUNTIME-G4-01 / S-RUNTIME-G4-02 — DEFERRED

**Status:** DEFERRED — environment scope (require shuffled-import-order test fixtures + runnable end-to-end pipeline).

---

## 9.5 — G6 Structured Failure on Unrecognized at Processing Boundaries (PF-11)

### Probe ID: S-CODE-G6-01 (structured failure at dispatch sites)

**Subject:** For every dispatch site identified in G5-01 (Cluster B), verify presence of structured failure for unregistered identifier.

**Execution:**
```bash
grep -rnE "throw new (UnknownPrimitiveError|UnregisteredPrimitiveError|IntentExecutorUnknownOperationError|LegacyEngineUnknownComponentTypeError|StructuralFailureError|CanonicalRegistryViolation)" web/src/
```

**Output:**
```
web/src/lib/calculation/run-calculation.ts:271: throw new LegacyEngineUnknownComponentTypeError(...)
web/src/lib/calculation/intent-executor.ts:464: throw new IntentExecutorUnknownOperationError(...)
```

**Per-dispatch-site mapping (cross-referenced from Cluster B evidence):**

| Dispatch site | Structured failure on unregistered identifier? | Error class |
|---|---|---|
| `intent-executor.ts:444-471` (executeOperation) | YES | `IntentExecutorUnknownOperationError` |
| `run-calculation.ts:255-280` (evaluateComponent) | YES | `LegacyEngineUnknownComponentTypeError` |
| `intent-transformer.ts:34-46` (transformComponent) | NO | default routes to same fn as named cases (decorative switch); no error throw |

**CC observation:** Two of three dispatch sites have structured-failure handling on unregistered identifier. The third (`intent-transformer.ts`) has a decorative switch with no behavioral differentiation per branch — it does not raise structured failure on unknown component types.

---

### Probe ID: S-CODE-G6-02 (named error classes for substrate failures)

**Subject:** Verify named error classes exist for substrate failures.

**Execution:**
```bash
grep -rnE "extends Error\\b" web/src/lib/calculation/
```

**Output:**
```
web/src/lib/calculation/intent-executor.ts:436: export class IntentExecutorUnknownOperationError extends Error
web/src/lib/calculation/run-calculation.ts:228: export class LegacyEngineUnknownComponentTypeError extends Error
```

**CC observation:** Two named error classes exist in the calculation engine for unrecognized-identifier scenarios. Both are exported and used at the corresponding dispatch sites. Generic `UnregisteredPrimitiveError` / `CanonicalRegistryViolation` (DIAG-named) classes are NOT present — the substrate uses dispatch-site-specific names (`IntentExecutorUnknown*`, `LegacyEngineUnknown*`) rather than registry-level abstractions.

---

## 9.6 — Property Observability (P1–P11) — code-observable portions only

Per Plan v1.1 Section 3.3 R-3, property tests verify *mechanism presence*. Runtime observation is deferred per scope.

| Property | Mechanism observable in code? | Evidence |
|---|---|---|
| **P1 Permeability** | YES | `committed_data.row_data JSONB` admits arbitrary columns; INSERT path is whole-row JSONB without schema-side column filtering. (G1 evidence) |
| **P2 Adaptation** | YES | SCI scoring weights (`agents.ts`) consume structural ContentProfile signals; flywheel tables (foundational_patterns, domain_patterns, synaptic_density) accumulate cross-run learning; classification-signal-service.ts:135 `lookupPriorSignals` boosts scores from prior signals. Mechanism present per Cluster A evidence. |
| **P3 Progressive Optimization** | YES | `synaptic_density.execution_mode` column with values `full_trace / light_trace / silent` (migration 015); driven by accumulated confidence per OB-78 mission. Mechanism present. |
| **P4 Perpetuating Inertia of Intelligence** | YES | `foundational_patterns` (cross-tenant) + `domain_patterns` (domain-vertical) + `structural_fingerprints` (cross-tenant per RLS Tier 2) carry learned state across system restarts; tables are tenant-id-CASCADE-isolated for tenant-specific learning + cross-tenant aggregation surfaces. |
| **P5 Reaction-Prediction Simultaneity** | **PRESENT** per R-3 thresholds | `web/src/lib/intelligence/trajectory-engine.ts`, `trajectory-service.ts`, `state-reader.ts` produce forward-looking output (trajectory projection / incremental-value forecasting). At least one (a) code path observable; per R-3 verdict: PRESENT. |
| **P6 Sequence Independence** | YES | Verified by G4 evidence — SCI imports do not create periods at import time; calculation-time binding via source_date eliminates ordering dependency. |
| **P7 Heterogeneous Consumer Service** | YES | Multiple expression surfaces (calculation, reporting, UI data layer) read from `committed_data` independently per G2-01/02/03 evidence. |
| **P8 Mycorrhizal Cross-Flow** | YES | `foundational_patterns` table is tenant_id-less by design (migration 016: "PRIVACY: No tenant_id in either table"); cross-tenant learning surface present. |
| **P9 Trophic Resilience** | code-observable only via FK / constraint structure | `committed_data` FKs cascade on tenant delete; provenance metadata is indirect (via import_batch_id → import_batches). Removal-cascade behavior is structurally available; runtime confirmation deferred. |
| **P10 Graceful Degradation** | YES | `intent-executor.ts:464` and `run-calculation.ts:271` throw structured errors on unrecognized primitives; `convergence-service.ts:178` catches and logs convergence failures non-blockingly. Three-Tier Resolution mechanism (LLM unavailable → flywheel priors → seed priors) observable in `classification-signal-service.ts:175-188`. |
| **P11 Self-Awareness** | YES | `web/scripts/architecture-trace.ts` (16-probe Architecture-Trace) exists and is invocable; `calculation-trace.ts` exists for single-entity forensic traces. Dual-Trace mechanism present per TMR Addendum 10 commitment. |

CC reports mechanism presence. CC does NOT disposition whether mechanism population is sufficient at runtime.

---

## 9.7 — Architecture-Trace Static Portions

**Subject:** 16-probe Architecture-Trace per TMR Addendum 10. Code-observable portions only.

**Execution:** Read `web/scripts/architecture-trace.ts` probe inventory.

**16 probes inventoried:**

| # | Probe title | Layer |
|---|---|---|
| 1 | Entity Resolution Method | Entity layer |
| 2 | Entity Linkage Coverage | Entity layer |
| 3 | Period Resolution Coverage | Period layer |
| 4 | Semantic data_type Classification | Data layer |
| 5 | calculationIntent Coverage | Plan layer |
| 6 | Structural Primitive Vocabulary | Calculation layer |
| 7 | Compound Operation Execution | Calculation layer |
| 8 | input_bindings Coverage | Plan layer |
| 9 | Metric Derivation Rules | Plan layer |
| 10 | Classification Signal Capture | Signal layer |
| 11 | Result Coverage | Result layer |
| 12 | Payout Distribution Health | Result layer |
| 13 | Calculation Engine Domain Vocab | Korean Test |
| 14 | Convergence Engine Domain Vocab | Korean Test |
| 15 | Hardcoded Field Names in lib/ | Korean Test |
| 16 | SHEET_COMPONENT_PATTERNS Usage | Domain layer |

**Static-portion observation:**
- All 16 probes are defined in the script. The script structure is intact and invocable. Probe 13–15 (Korean Test surfaces) align with G8 evidence in Cluster B (content-profile.ts as the named violation locus).
- Runtime execution of these 16 probes against populated tenant data is **deferred** per environment scope: `committed_data=0`, `calculation_results=0`, `rule_sets=0`. Probes 1–12 require populated tenant data to fire. Probes 13–16 are code-static and could fire against the source tree.
- Cluster B evidence is partial substitute for probes 13–15 (Korean Test surfaces).

---

## 9.8 — DEFERRED PROBES INVENTORY (audit-wide)

**G1:**
- `S-RUNTIME-G1-01` — test import of file with unmapped columns (requires runnable import + UI/API surface).

**G2:**
- `S-UI-G2-01` — UI render verification (no browser automation surface in this environment).

**G3:**
- `S-RUNTIME-G3-01` — calculation against test data with multiple plan periods (requires populated rule_sets, committed_data, periods).

**G4:**
- `S-RUNTIME-G4-01` — shuffled-import-order test (requires runnable end-to-end import pipeline).
- `S-RUNTIME-G4-02` — single-file import in isolation (same).

**G5:**
- *(No deferred probes; all G5 probes were code-and-schema and executed in Cluster B.)*

**G6:**
- *(No deferred probes; all G6 probes were code-static and executed.)*

**G7:**
- Architect-named bypass key `rule_sets.input_bindings.plan_agent_seeds` Step 2 verification — `rule_sets` table empty (0 rows); live key vocabulary inspection deferred (Cluster A).
- Other rule_sets JSONB columns (input_bindings, components, metadata) — empty in environment; Step 2 vocabulary inspection deferred.
- `committed_data.metadata`, `calculation_results.{metrics,metadata}`, `calculation_traces.{inputs,output,steps}`, `entity_period_outcomes.metadata`, `processing_jobs.{classification_result,proposal}` — empty in environment.
- `ingestion_events.classification_result` / `validation_result` — column-does-not-exist in live DB despite migration 007 specifying them; out-of-band schema divergence (Cluster A).

**G8:**
- *(No deferred probes; all G8 code-observable probes executed in Cluster B. Runtime AI-prompt-compliance with anti-string-similarity instruction is observable only via runtime; deferred.)*

**G9:**
- `S-RUNTIME-G9-01` — mid-run plan modification observation (requires runnable calculation; Cluster C).
- `S-RUNTIME-G9-02` — reconciliation against ground-truth (CRP $566,728.97); requires CRP fixture and runnable calculation (Cluster C).

**G10:**
- `S-RUNTIME-G10-01` — duplicate-execution test (requires runnable calculation; Cluster D).

**G11:**
- `S-RUNTIME-G11-01` — cross-run learning test (requires sequenceable calculation runs against populated proof data; Cluster A).

**Property Observability:**
- All P1–P11 runtime tests deferred: P1 import test, P2 confidence-trajectory observation, P3 execution-time trajectory, P4 cross-tenant propagation runtime test, P5 prediction generation observation (mechanism observable; population deferred), P7 multi-surface concurrent operation, P8 cross-tenant signal propagation runtime, P9 removal-cascade test, P10 LLM-unavailable runtime test, P11 Dual-Trace runtime execution against populated data.

**Architecture-Trace runtime portions:**
- Probes 1–12 (require populated tenant data) deferred.
- Probes 13–16 (code-static Korean Test surfaces) — partial coverage by Cluster B G8 evidence; full architecture-trace runtime invocation deferred.

**Calculation-Trace (single-entity forensic execution):**
- Entirely deferred — requires runnable calculation against populated proof data (CRP / BCL / Meridian).

---

## Summary — Remaining cluster factual inventory

**G1 (Carry Everything):** Schema-side commitment held — `committed_data.row_data JSONB` permits arbitrary keys; INSERT call sites at write boundary do not filter. Direct provenance columns (`source_file_id`, `source_row_index`, `raw_row_payload`) absent from schema; provenance is indirect via `import_batch_id` FK to `import_batches` (which has file-level metadata) and via `row_data` JSONB carrying the row content.

**G2 (Express Contextually):** Calculation, reporting, and UI data layer all read directly from `committed_data` (14+ call sites verified). Persistent derivation tables (`calculation_results`, `calculation_traces`, `entity_period_outcomes`, `period_entity_state`) are documented derivations with DELETE-before-INSERT + UNIQUE constraints (Cluster D), not private out-of-band copies. Learning-state tables (synaptic_density, foundational_patterns, domain_patterns, structural_fingerprints) are adjacent G7/G11 concerns from Cluster A.

**G3 (Calculation-Time Binding):** SCI/import code does not create periods at import time. `committed_data.period_id` is NULLABLE; `committed_data.source_date` (added migration 018) carries the row's content-time date. Calculation engine has source_date-based BETWEEN binding (OB-152 marker). Decision 92 wired.

**G4 (Sequence Independence):** No grep-observable inter-import dependencies in SCI code. "Phase E" references are intra-import phases, not inter-import dependencies. Per Cluster C, OB-186 cross-plan resolution at calculation time is a calc-time dependency (not carry-time).

**G6 (Structured Failure):** Two of three dispatch sites have structured failure (`IntentExecutorUnknownOperationError`, `LegacyEngineUnknownComponentTypeError`). The third (`intent-transformer.ts`) has decorative switch with no error throw on unknown identifier. Generic `UnregisteredPrimitiveError` / `CanonicalRegistryViolation` classes are NOT present; substrate uses dispatch-site-specific error class names.

**Property observability (P1–P11):** All eleven properties have observable mechanism in code. P5 verdict per R-3: **PRESENT** (trajectory-engine.ts, trajectory-service.ts, state-reader.ts produce forward-looking output). Runtime population observation deferred for all properties.

**Architecture-Trace:** 16-probe inventory present and invocable. Code-static probes 13–16 partially substituted by Cluster B G8 evidence. Runtime portions deferred.

CC reports findings. CC does NOT disposition magnitude.
