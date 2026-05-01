# Phase 4 Audit — Cluster A (Signal Surface Coherence) Evidence

**Audit:** DS-021 v1.0 / DIAG-DS021-Phase4 / Plan v1.1
**Branch:** `ds021-substrate-audit`
**Scope:** Code-and-Schema. Runtime probes deferred per environment scope.
**Date:** 2026-04-30
**Substrate state at probe time:** classification_signals=14 rows, committed_data=0, rule_sets=0, calculation_results=0, calculation_traces=0, synaptic_density=3, foundational_patterns=29, domain_patterns=858, structural_fingerprints=4, processing_jobs=0, ingestion_events=0, import_batches=7, entity_period_outcomes=0, tenants=3.

---

## 4.A.1 — PF-02 Probes (G11 Read-Path Coherence)

### Probe ID: S-CODE-G11-01a (within-run read-path in convergence service)

**Subject:** Inspect convergence service for code paths that query `classification_signals` filtered to current run's `run_id` (or equivalent run-scoping identifier).

**Execution:**
```bash
grep -rn "classification_signals" /Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/convergence-service.ts
grep -n "run_id\|runId" /Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/convergence-service.ts
grep -n "\.from(\|\.insert(\|\.select(\|\.upsert(" /Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/convergence-service.ts
```

**Output:**
```
# classification_signals references in convergence-service.ts:
253:        await supabase.from('classification_signals').insert({

# run_id / runId references in convergence-service.ts:
(no output — zero matches)

# All DB ops in convergence-service.ts:
132:    .from('rule_sets')
133:    .select('id, name, components, input_bindings')
253:        await supabase.from('classification_signals').insert({
627:    .from('committed_data')
628:    .select('data_type, row_data, metadata, import_batch_id')
635:    .from('committed_data')
636:    .select('data_type, row_data, metadata, import_batch_id')
1857:    .from('committed_data')
1858:    .select('row_data')
```

**CC observation:** The convergence service contains zero `.select` calls against `classification_signals`. The only contact with `classification_signals` is a single `INSERT` (line 253) writing a `convergence_calculation_validation` signal. There are no run-scoping identifiers (`run_id` / `runId` / similar) anywhere in the file.

**Verdict matrix readout:** 11-01a result = **ABSENT**.

---

### Probe ID: S-CODE-G11-01b (cross-run read-path in convergence service)

**Subject:** Inspect convergence service for code paths that query `classification_signals` with no run_id filter, or with explicit cross-run aggregation.

**Execution:** Same evidence as 11-01a — convergence-service.ts has zero `.select` calls on `classification_signals`.

**CC observation:** The convergence service contains no read-path against `classification_signals` at all — neither within-run nor cross-run. The signal surface is write-only from the convergence service's perspective.

**Verdict matrix readout:** 11-01b result = **ABSENT**.

---

### Probe ID: S-CODE-G11-02 (flywheel aggregation read-path)

**Subject:** Inspect flywheel aggregation code for read-path that queries `classification_signals` and aggregates across runs.

**Execution:**
```bash
grep -rn "flywheel" /Users/AndrewAfrica/spm-platform/web/src/lib/ | head
grep -rn "classification_signals" /Users/AndrewAfrica/spm-platform/web/src/lib/calculation/flywheel-pipeline.ts
grep -rn "classification_signals" /Users/AndrewAfrica/spm-platform/web/src/lib/sci/fingerprint-flywheel.ts
```

**Output:**
```
# Flywheel files identified:
/Users/AndrewAfrica/spm-platform/web/src/lib/calculation/flywheel-pipeline.ts
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/fingerprint-flywheel.ts

# classification_signals references in either flywheel file:
(no output — zero matches in flywheel-pipeline.ts or fingerprint-flywheel.ts)
```

**CC observation:** Flywheel-pipeline reads/writes `foundational_patterns` and `domain_patterns` only. Fingerprint-flywheel reads/writes `structural_fingerprints` only. No flywheel code reads `classification_signals` to aggregate signals across runs. Cross-run intelligence accumulation flows through dedicated tables, not the canonical signal surface.

**Verdict matrix readout:** N/A (factual: flywheel does not consume `classification_signals` as input).

---

### Probe ID: S-SIGNAL-G11-01 (cross-run aggregation evidence in signals + run-scoping in schema)

**Subject:** Query `classification_signals` for evidence of run-scoping (run_id column or similar).

**Execution:** `web/scripts/audit_phase4_cluster_a.ts` (live service-role inspection).

**Output (relevant excerpt):**
```
Total rows fetched: 14

--- All distinct top-level columns present in returned rows ---
[
  "agent_scores",
  "classification",
  "classification_trace",
  "component_index",
  "confidence",
  "context",
  "created_at",
  "decision_source",
  "entity_id",
  "header_comprehension",
  "human_correction_from",
  "id",
  "metric_name",
  "rule_set_id",
  "scope",
  "sheet_name",
  "signal_type",
  "signal_value",
  "source",
  "source_file_name",
  "structural_fingerprint",
  "tenant_id",
  "vocabulary_bindings"
]

--- run_id presence check (any column whose name matches /run/) ---
Run-related columns: []
```

**CC observation:** Live `classification_signals` table has 23 columns; **zero** match `/run/i` (no `run_id`, no `calculation_run_id`, no `batch_id`, no `session_id`). There is `rule_set_id` and `component_index` (calculation-context columns) but no per-run identifier. Within-run filtering of `classification_signals` is structurally impossible at the schema level.

A `rule_set_id` column exists but is null in all 14 sampled rows. It cannot serve as a run identifier (a single rule_set is reused across many runs, and rule_sets table is empty).

**Verdict matrix readout (R-2 aggregate):**

| 11-01a result | 11-01b result | Aggregate G11 magnitude per R-2 matrix |
|---|---|---|
| **ABSENT** | **ABSENT** | **blocking** |

CC reports the cell. CC does NOT disposition.

---

## 4.A.2 — PF-01 Probes (G7 Single Canonical Signal Surface)

### Probe ID: S-CODE-G7-01 (SCI agent signal-write paths)

**Subject:** Inspect every SCI agent for signal-write code. Verify all writes target `classification_signals`.

**Execution:**
```bash
grep -n "\.from(\|\.insert(\|writeClassificationSignal\|persistSignal" web/src/lib/sci/signal-capture-service.ts web/src/lib/sci/fingerprint-flywheel.ts web/src/lib/sci/classification-signal-service.ts
grep -rn "\.from('foundational_patterns')\|\.from('domain_patterns')\|\.from('synaptic_density')\|\.from('structural_fingerprints')" web/src/
```

**Output (consolidated):**

**Writes to canonical signal surface (`classification_signals`):**
- `web/src/lib/sci/classification-signal-service.ts:89` — `writeClassificationSignal()` INSERT to `classification_signals`
- `web/src/lib/intelligence/convergence-service.ts:253` — INSERT (`signal_type: 'convergence_calculation_validation'`)
- `web/src/lib/intelligence/classification-signal-service.ts:62` — `recordSignal()` → `persistSignal` → `classification_signals`
- `web/src/lib/ai/signal-persistence.ts:48,96` — INSERT / batch insert to `classification_signals`
- `web/src/lib/signals/briefing-signals.ts:60` — INSERT to `classification_signals`
- `web/src/lib/signals/stream-signals.ts:64` — INSERT to `classification_signals`
- `web/src/app/api/ingest/classification/route.ts:38` — INSERT to `classification_signals`
- `web/src/lib/sci/signal-capture-service.ts:20,59` — `persistSignal/persistSignalBatch` (both target `classification_signals`)

**Writes to BYPASS channels (not `classification_signals`):**
- `web/src/lib/sci/classification-signal-service.ts:449` — `aggregateToFoundationalPatterns()` INSERT to `foundational_patterns`
- `web/src/lib/sci/classification-signal-service.ts:509` — `aggregateToDomainPatterns()` INSERT to `domain_patterns`
- `web/src/lib/sci/fingerprint-flywheel.ts:175` — `writeFingerprint()` INSERT to `structural_fingerprints`
- `web/src/lib/sci/fingerprint-flywheel.ts:155` — UPDATE on `structural_fingerprints`
- `web/src/lib/calculation/synaptic-density.ts:130` — UPSERT to `synaptic_density`
- `web/src/lib/calculation/flywheel-pipeline.ts:131,186` — INSERT/UPDATE to `foundational_patterns`/`domain_patterns`

**Reads from BYPASS channels (read-path coherence broken — these reads bypass canonical surface):**
- `web/src/lib/sci/classification-signal-service.ts:205` — `lookupFoundationalPriors()` reads `foundational_patterns`
- `web/src/lib/sci/classification-signal-service.ts:257` — `lookupDomainPriors()` reads `domain_patterns`
- `web/src/lib/sci/promoted-patterns.ts:69,127` — reads `foundational_patterns`
- `web/src/lib/sci/fingerprint-flywheel.ts:45,87,141` — reads `structural_fingerprints`
- `web/src/lib/agents/agent-memory.ts:131` — reads `synaptic_density`
- `web/src/lib/agents/agent-memory.ts:152` — reads `foundational_patterns`
- `web/src/lib/agents/agent-memory.ts:166` — reads `domain_patterns`
- `web/src/lib/calculation/synaptic-density.ts:67` — reads `synaptic_density`
- `web/src/lib/calculation/flywheel-pipeline.ts:106,163,228,242` — reads `foundational_patterns` / `domain_patterns`

**CC observation:** Of the SCI agents inspected (Plan/Entity/Target/Transaction/Reference are encoded as `agent_scores` JSONB sub-keys within a single `sci:classification_outcome_v2` signal type, not as discrete write sites per agent), the SCI write surface is bifurcated:
1. A canonical write path to `classification_signals` (`writeClassificationSignal`)
2. Parallel bypass write paths to `synaptic_density`, `foundational_patterns`, `domain_patterns`, `structural_fingerprints`

The bypass tables are not facade-views over `classification_signals`; they are independent storage. Both writes (aggregation) and reads (priors lookup) flow through them directly.

---

### Probe ID: S-CODE-G7-02 Step 1 (JSONB column enumeration from migration files)

**Subject:** Enumerate all JSONB columns across migrations as canonical schema source.

**Execution:** awk-based extraction from `web/supabase/migrations/*.sql` pairing `CREATE TABLE` / `ALTER TABLE` with `JSONB` column lines.

**Output — JSONB column inventory `[(table, column, introducing_migration)]`:**

| Table | Column | Migration |
|---|---|---|
| tenants | settings | 001_core_tables.sql |
| tenants | hierarchy_labels | 001_core_tables.sql |
| tenants | entity_type_labels | 001_core_tables.sql |
| tenants | features | 001_core_tables.sql |
| profiles | capabilities | 001_core_tables.sql |
| entities | temporal_attributes | 001_core_tables.sql |
| entities | metadata | 001_core_tables.sql |
| entity_relationships | evidence | 001_core_tables.sql |
| entity_relationships | context | 001_core_tables.sql |
| reassignment_events | credit_model | 001_core_tables.sql |
| reassignment_events | transition_window | 001_core_tables.sql |
| reassignment_events | impact_preview | 001_core_tables.sql |
| rule_sets | population_config | 002_rule_sets_and_periods.sql |
| **rule_sets** | **input_bindings** | **002_rule_sets_and_periods.sql** |
| rule_sets | components | 002_rule_sets_and_periods.sql |
| rule_sets | cadence_config | 002_rule_sets_and_periods.sql |
| rule_sets | outcome_config | 002_rule_sets_and_periods.sql |
| rule_sets | metadata | 002_rule_sets_and_periods.sql |
| rule_set_assignments | metadata | 002_rule_sets_and_periods.sql |
| periods | metadata | 002_rule_sets_and_periods.sql |
| import_batches | error_summary | 003_data_and_calculation.sql |
| committed_data | row_data | 003_data_and_calculation.sql |
| committed_data | metadata | 003_data_and_calculation.sql |
| calculation_batches | summary | 003_data_and_calculation.sql |
| calculation_batches | config | 003_data_and_calculation.sql |
| calculation_results | components | 003_data_and_calculation.sql |
| calculation_results | metrics | 003_data_and_calculation.sql |
| calculation_results | attainment | 003_data_and_calculation.sql |
| calculation_results | metadata | 003_data_and_calculation.sql |
| calculation_traces | inputs | 003_data_and_calculation.sql |
| calculation_traces | output | 003_data_and_calculation.sql |
| calculation_traces | steps | 003_data_and_calculation.sql |
| reconciliation_sessions | config | 003_data_and_calculation.sql |
| reconciliation_sessions | results | 003_data_and_calculation.sql |
| reconciliation_sessions | summary | 003_data_and_calculation.sql |
| **classification_signals** | **signal_value** | 003_data_and_calculation.sql |
| **classification_signals** | **context** | 003_data_and_calculation.sql |
| audit_logs | changes | 003_data_and_calculation.sql |
| audit_logs | metadata | 003_data_and_calculation.sql |
| ingestion_configs | config | 003_data_and_calculation.sql |
| ingestion_configs | mapping | 003_data_and_calculation.sql |
| ingestion_configs | schedule | 003_data_and_calculation.sql |
| ingestion_events | error_log | 003_data_and_calculation.sql |
| ingestion_events | classification_result | 007_ingestion_facility.sql (ALTER) |
| ingestion_events | validation_result | 007_ingestion_facility.sql (ALTER) |
| usage_metering | dimensions | 003_data_and_calculation.sql |
| period_entity_state | resolved_attributes | 004_materializations.sql |
| period_entity_state | resolved_relationships | 004_materializations.sql |
| profile_scope | metadata | 004_materializations.sql |
| entity_period_outcomes | rule_set_breakdown | 004_materializations.sql |
| entity_period_outcomes | component_breakdown | 004_materializations.sql |
| entity_period_outcomes | attainment_summary | 004_materializations.sql |
| entity_period_outcomes | metadata | 004_materializations.sql |
| platform_settings | value | 012_create_platform_settings.sql |
| import_batches | metadata | 014_import_batches_metadata.sql (ALTER) |
| **synaptic_density** | **learned_behaviors** | 015_synaptic_density.sql |
| **foundational_patterns** | **learned_behaviors** | 016_flywheel_tables.sql |
| **domain_patterns** | **learned_behaviors** | 016_flywheel_tables.sql |
| reference_data | schema_definition | 018_decision92_temporal_binding.sql |
| reference_data | metadata | 018_decision92_temporal_binding.sql |
| reference_items | attributes | 018_decision92_temporal_binding.sql |
| alias_registry | metadata | 018_decision92_temporal_binding.sql |
| processing_jobs | classification_result | 023_processing_jobs_and_structural_fingerprints.sql |
| processing_jobs | proposal | 023_processing_jobs_and_structural_fingerprints.sql |
| processing_jobs | chunk_progress | 023_processing_jobs_and_structural_fingerprints.sql |
| **structural_fingerprints** | **classification_result** | 023_processing_jobs_and_structural_fingerprints.sql |
| **structural_fingerprints** | **column_roles** | 023_processing_jobs_and_structural_fingerprints.sql |

**Schema discrepancy flag:** Live `classification_signals` table has additional columns NOT present in any committed migration:
`source_file_name, sheet_name, structural_fingerprint, classification, decision_source, classification_trace, vocabulary_bindings, agent_scores, human_correction_from, scope, header_comprehension, rule_set_id, metric_name, component_index`. These are written by `writeClassificationSignal` in `web/src/lib/sci/classification-signal-service.ts:89`. Most are JSONB-typed (structural_fingerprint, classification_trace, vocabulary_bindings, agent_scores, header_comprehension). They imply an out-of-band schema migration (HF-092) applied to live DB but not committed to `web/supabase/migrations/`.

Conversely, `ingestion_events.classification_result` and `ingestion_events.validation_result` exist in migration `007_ingestion_facility.sql` but the live audit script reports `column ingestion_events.classification_result does not exist`.

This dual divergence (live > migrations on classification_signals; migrations > live on ingestion_events) is a substrate-coherence concern adjacent to but distinct from G7-02.

---

### Probe ID: S-CODE-G7-02 Step 2 (per-JSONB-column key vocabulary inspection)

**Subject:** For each JSONB column with populated rows, enumerate top-level keys and classify by inspection: (a) configuration data, (b) user-supplied content, (c) agent-to-agent or run-to-run intelligence transport.

**Execution:** `web/scripts/audit_phase4_cluster_a.ts` (live inspection).

**Output (per column, populated only):**

```
classification_signals.signal_value:
top-level keys: ["aiOutput","estimatedCostUSD","eventType","inputTokens","model","outputTokens","provider","purpose","requestId","signalId","signalType","task","userAction"]

classification_signals.context:
top-level keys: ["capturedAt","latencyMs","model","phase","provider","schema","sciVersion","tokenUsage","userId"]

synaptic_density.learned_behaviors (3 rows): {} (objects empty in sample)

foundational_patterns.learned_behaviors (29 rows):
top-level keys: ["classification_distribution"]

domain_patterns.learned_behaviors (50 sampled of 858 rows): {} (objects empty in sample)

structural_fingerprints.classification_result (4 rows):
top-level keys: ["classification","confidence","fieldBindings","tabName"]

structural_fingerprints.column_roles (4 rows):
top-level keys: [25 distinct strings — actual column header values used as keys: "BANCO CUMBRE DEL LITORAL", "C1: COLOCACIÓN DE CRÉDITO — Ejecutivo Senior", "Cantidad_Productos_Cruzados", "Cargo", "Cumplimiento_Colocacion", "Depositos_Nuevos_Netos", "Fecha_Ingreso", "ID_Empleado", "ID_Gerente", "Indice_Calidad_Cartera", "Infracciones_Regulatorias", "Meta_Colocacion", "Meta_Depositos", "Monto_Colocacion", "Nivel_Cargo", "Nombre_Completo", "Pct_Meta_Depositos", "Periodo", "Region", "Sucursal", "Sucursal_ID", "__EMPTY", "__EMPTY_1", "__EMPTY_2", "__EMPTY_3", "__EMPTY_4"]

import_batches.metadata (7 rows):
top-level keys: ["classification","contentUnitId","proposalId","source"]

import_batches.error_summary (7 rows): {} (objects empty)

tenants.settings (3 rows):
top-level keys: ["admin_email","admin_name","country_code","display_name","industry","primary_color","timezone"]

tenants.features (3 rows):
top-level keys: ["apiAccess","coaching","compensation","forecasting","gamification","learning","mobileApp","performance","salesFinance","transactions","whatsappIntegration"]

rule_sets.input_bindings: 0 populated rows (deferred — table empty)
rule_sets.components: 0 populated rows
rule_sets.metadata: 0 populated rows
committed_data.metadata: 0 populated rows
calculation_results.{metrics,metadata}: 0 populated rows
calculation_traces.{inputs,output,steps}: 0 populated rows
entity_period_outcomes.metadata: 0 populated rows
processing_jobs.{classification_result,proposal}: 0 populated rows
ingestion_events.classification_result / validation_result: column does not exist in live DB
```

**CC classification (Step 2) — per inspected column with populated data:**

| Table.column | Sample keys | Classification | Rationale |
|---|---|---|---|
| `tenants.settings` | admin_email, country_code, display_name, primary_color, timezone | (a) configuration | Tenant configuration. Not signal transport. |
| `tenants.features` | apiAccess, coaching, gamification, salesFinance, etc. | (a) configuration | Feature flags. |
| `classification_signals.signal_value` | aiOutput, estimatedCostUSD, eventType, inputTokens, model, provider, requestId, signalId, signalType, task, userAction | mixed (b)/(c) | Per-signal payload — canonical surface. Carries AI output (b) and signal-internal IDs (c). On-canonical-surface so not a bypass. |
| `classification_signals.context` | capturedAt, latencyMs, model, provider, schema, sciVersion, tokenUsage, userId | (b)/(c) | On-canonical-surface metadata. |
| `import_batches.metadata` | classification, contentUnitId, proposalId, source | **(c) intelligence transport** | `classification` and `contentUnitId` are agent-to-agent transport keys (classification-result and content-identity reference) carried out-of-band on the import_batches table, not on `classification_signals`. **Candidate G7 bypass.** |
| `synaptic_density.learned_behaviors` | (empty in sample) | **(c) run-to-run transport** | Per migration `015_synaptic_density.sql`: this column is intended to carry "learned_behaviors" — per-pattern pattern-density learning that drives execution_mode (full_trace → light_trace → silent). Empty-in-sample ≠ structurally-non-transport; the table itself is run-to-run intelligence storage. **Whole-table bypass.** |
| `foundational_patterns.learned_behaviors` | classification_distribution | **(c) cross-tenant cross-run transport** | Aggregated learning across tenants and runs, keyed by pattern_signature. Read by `lookupFoundationalPriors` to influence cold-start classifier behavior. **Whole-table bypass.** |
| `domain_patterns.learned_behaviors` | (empty in sample) | **(c) cross-tenant cross-run transport** | Domain-vertical aggregated learning. Same rationale as foundational. **Whole-table bypass.** |
| `structural_fingerprints.classification_result` | classification, confidence, fieldBindings, tabName | **(c) run-to-run transport** | Stores prior classification result by structural fingerprint hash for reuse on subsequent imports. Read by `lookupFingerprint` to skip Header Comprehension on Tier 1 matches. **Whole-table bypass.** |
| `structural_fingerprints.column_roles` | actual column header strings as keys | **(c) run-to-run transport** | Per-column role assignment carrying agent-derived classification across runs. **Whole-table bypass.** |

**Bypass key list (R-1 structural):**

The most severe bypass form found is at the **whole-table** level — independent tables that store cross-run intelligence and bypass `classification_signals` entirely:
1. `synaptic_density` (full table)
2. `foundational_patterns` (full table)
3. `domain_patterns` (full table)
4. `structural_fingerprints` (full table)

JSONB-key-level bypasses found:
1. `import_batches.metadata.classification` — classification result transport
2. `import_batches.metadata.contentUnitId` — content-unit reference transport

Architect-named candidate `rule_sets.input_bindings.plan_agent_seeds`: **deferred** — `rule_sets` table is empty (0 rows). Step 2 key inspection cannot verify population in this environment. Migration `002_rule_sets_and_periods.sql:23` confirms `input_bindings JSONB NOT NULL DEFAULT '{}'` exists; live-data key vocabulary inspection requires populated rule_sets rows.

**Korean Test discipline note:** The `(c)` classifications above are based on structural inspection — table-purpose comments in migrations (`OB-78 Mission 2: Persistent pattern density`, `OB-80: Flywheel 2 (Foundational) + Flywheel 3 (Domain)`, `DS-017 fingerprint storage`) and the explicit read-path wiring (`lookupFoundationalPriors`, `lookupDomainPriors`, `lookupFingerprint`, `loadDensity`, `agent-memory.loadPriorsForAgent`) that consumes these tables as run-influencing intelligence. Classification is structural-not-lexical: the names happen to contain "patterns" and "density" but the criterion is the read-path that influences subsequent agent behavior, not the name.

---

### Probe ID: S-SCHEMA-G7-01 (classification_signals three-level support)

**Subject:** Verify schema supports three signal levels per Decision 64 v2 (classification: / comprehension: / convergence: prefixes).

**Execution:**
```bash
grep -A 20 "create table.*classification_signals" web/supabase/migrations/003_data_and_calculation.sql
# + live signal_type distribution from audit_phase4_cluster_a.ts
```

**Output:**

Migration-defined schema (`003_data_and_calculation.sql:312-322`):
```sql
CREATE TABLE classification_signals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
  signal_type     TEXT NOT NULL,
  signal_value    JSONB NOT NULL DEFAULT '{}',
  confidence      NUMERIC(5,4),
  source          TEXT,
  context         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ALTER TABLE classification_signals (007_ingestion_facility.sql:50):
--   ADD COLUMN event_id UUID REFERENCES ingestion_events(id),
--   ADD COLUMN ai_prediction TEXT,
--   ADD COLUMN ai_confidence FLOAT,
--   ADD COLUMN user_decision TEXT,
--   ADD COLUMN was_corrected BOOLEAN DEFAULT FALSE;
```

Live signal_type distribution (14 rows):
```
{
  "sci:classification_outcome_v2": 6,
  "training:plan_interpretation": 4,
  "sci:cost_event": 4
}

# Three-level prefix breakdown:
classification:* prefix → 0 types
comprehension:* prefix → 0 types
convergence:* / convergence_* → 0 types
sci:* prefix → 2 types
training:* prefix → 1 types
other → 0 types
```

**CC observation:** The `signal_type` column is `TEXT`-typed, so the schema imposes no constraint on which prefixes are accepted — *technically* it can carry any vocabulary. However, the live data contains zero signals using the `classification:` / `comprehension:` / `convergence:` prefix vocabulary specified by DS-021 / Decision 64 v2 three-level architecture. The vocabulary in use (`sci:*`, `training:*`) maps to a different naming scheme. The single convergence-emitted signal type (`convergence_calculation_validation`, used by convergence-service.ts:255) uses an underscore form rather than the prefixed-colon form, but it is also absent from the 14 sampled rows.

---

### Probe ID: S-SIGNAL-G7-01 (signal-type distribution across SCI agents)

**Subject:** Source attribution distribution across signal-emitting agents.

**Output (relevant excerpt from audit_phase4_cluster_a.ts):**
```
--- Distinct source values + counts ---
{
  "sci_agent": 6,
  "ai_prediction": 4,
  "system": 4
}

--- Distinct decision_source values + counts ---
{
  "signature": 6,
  "<null>": 8
}

--- Per-tenant row distribution ---
{
  "b1c2d3e4-aaaa-bbbb-cccc-111111111111": 14
}
```

Sample row's `agent_scores` JSONB:
```json
{
  "plan": 0.85,
  "entity": 0.45,
  "target": 0.29999999999999993,
  "reference": 0.44999999999999996,
  "transaction": 0
}
```

**CC observation:** `source` column carries coarse three-way attribution (`sci_agent`, `ai_prediction`, `system`) — it does not differentiate between the five SCI agent types (Plan / Entity / Target / Transaction / Reference). Per-agent scores are stored inside `agent_scores` JSONB on the signal row (each row carries scores for all five agents simultaneously), and per-agent reasoning is stored inside `classification_trace.round1[].agent` and `classification_trace.round2[].agent`. Source attribution at the signal-row level is monolithic ("sci_agent"); per-agent contribution is recoverable only by parsing JSONB sub-keys. There is no canonical column equivalent of "source_agent" that names which of the 5 SCI agents actually drove the classification outcome.

---

## 4.A.3 — Pre-IRA Aggregate Readout

### Verdict matrix readout (from R-2 in Plan v1.1):

| 11-01a result | 11-01b result | Aggregate G11 magnitude per matrix |
|---|---|---|
| **ABSENT** | **ABSENT** | **blocking** |

### Bypass key list (R-1 structural):

**Whole-table bypass channels** (4 independent tables actively used as run-to-run / cross-run intelligence transport, separate from `classification_signals`):
1. `synaptic_density` — per-tenant pattern density driving adaptive execution mode
2. `foundational_patterns` — cross-tenant aggregated structural learning
3. `domain_patterns` — domain-vertical aggregated learning
4. `structural_fingerprints` — fingerprint→classification flywheel

**JSONB-key bypasses found:**
1. `import_batches.metadata.classification` (classification result transport)
2. `import_batches.metadata.contentUnitId` (content-unit reference transport)

**Architect-named candidate not verified in this environment:**
- `rule_sets.input_bindings.plan_agent_seeds` — `rule_sets` table empty (0 rows); Step 2 key inspection deferred. `input_bindings JSONB` column confirmed present in migration schema.

### Adjacent finding (substrate-coherence, distinct from G7/G11):

**Schema-vs-migration divergence on `classification_signals`:**
- Live DB has 14 columns NOT in committed migrations: `classification, decision_source, structural_fingerprint, classification_trace, vocabulary_bindings, agent_scores, human_correction_from, scope, source_file_name, sheet_name, header_comprehension, rule_set_id, metric_name, component_index`. Code (`writeClassificationSignal` at `web/src/lib/sci/classification-signal-service.ts:89`) writes them under "HF-092" comment.
- Live DB is *missing* columns that ARE in committed migrations: `ingestion_events.classification_result`, `ingestion_events.validation_result` (introduced by `007_ingestion_facility.sql:25-26`).

This implies an out-of-band migration channel (uncommitted production migration). It is not directly a G7 violation but is a substrate-coherence concern that affects audit reproducibility.

---

## File outputs

- `cluster_a_signal_audit_output.txt` — verbatim live-DB inspection output (514 lines)
- `cluster_a_evidence.md` — this file
