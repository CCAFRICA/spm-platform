# OB-229: Summary Engine — Domain-Agnostic Import-Time Aggregation Infrastructure

**Mode:** ULTRACODE
**Date:** 2026-06-22
**Design Specification:** DS-028 (Intelligence Layer Architecture), Phase 1
**Drafting Reference:** INF_Structured_Compliant_Drafting_Reference_20260513.md

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Binding: Principles 1-9, Section B (ADR before implementation), Section C (Anti-Pattern Registry), Section D (operational rules). SR-34, SR-38, SR-44.

---

## §1 — Objective

Eliminate render-time aggregation of raw `committed_data` from every visualization surface in the platform. Replace with import-time pre-computed summary artifacts that any page reads in O(1).

The platform currently fetches all `committed_data` rows into JavaScript and aggregates in-process on every page load. At 263,250 rows (Sabor), this takes 97 seconds and moves 163.9 MB for a 4-35 KB response. A SQL `COUNT(*)` of the same data returns in 250ms. The defect is the architecture, not the volume.

Build a Summary Engine that:
- Computes aggregations at import time and stores them in `summary_artifacts` (table pre-applied by architect — verify it exists before proceeding)
- Is read by every visualization surface that previously aggregated raw `committed_data`
- Preserves drill-through to raw `committed_data` on filtered slices (the only remaining path to raw data)
- Works for any tenant, any domain, any language, any field naming convention

---

## §2 — Data Contract (live-queried 2026-06-21)

### 2.1 The summary_artifacts table (pre-applied)

```
summary_artifacts
  id               UUID PK
  tenant_id        UUID NOT NULL → tenants
  entity_id        UUID NOT NULL → entities
  summary_date     DATE NOT NULL
  period_id        UUID → periods
  data_type        TEXT
  metrics          JSONB NOT NULL DEFAULT '{}'
  row_count        INTEGER NOT NULL DEFAULT 0
  convergence_hash TEXT
  computed_at      TIMESTAMPTZ
  created_at       TIMESTAMPTZ
  UNIQUE (tenant_id, entity_id, summary_date, data_type)
  RLS enabled, service_role full access
```

`metrics` holds per-field aggregations as JSONB. The field names in `metrics` come from the data, never from the engine source code.

### 2.2 Convergence bindings — two states exist in production

**BCL (tenant_id `b1c2d3e4-aaaa-bbbb-cccc-111111111111`) — RICH bindings.** `rule_sets.input_bindings` contains `convergence_bindings` with 8 components (component_0 through component_7). Each component's bindings follow this structure:

```
binding_key: {
  column: "Monto_Colocacion",           // row_data field name
  confidence: 0.95,
  reduction: "snapshot" | "last",        // aggregation strategy; absent = SUM
  field_identity: {
    structuralType: "measure" | "identifier" | "temporal",
    contextualIdentity: "loan_placement_amount"  // semantic label
  }
}
```

Special per-component keys: `entity_identifier` (structuralType: "identifier") and `period` (structuralType: "temporal") — these are not measure fields and should not be aggregated.

**Sabor — EMPTY bindings.** `input_bindings` is `{}`. No convergence bindings exist. The Financial Agent imported POS data without the ICM convergence pipeline.

**Implication:** The Summary Engine CANNOT require convergence bindings. It must work when bindings are empty. When bindings exist, it should use them to enrich summaries (semantic labels, reduction strategies). Convergence enriches; convergence does not gate.

### 2.3 committed_data.row_data — what the engine aggregates

**Sabor (data_type: pos_cheque, 263K rows, source_date populated, entity_id populated):**
```json
{
  "total": 831.92, "subtotal": 749.76, "pagado": 831.92,
  "propina": 128.28, "tarjeta": 831.92, "efectivo": 0,
  "descuento": 22.16, "cancelado": 0,
  "total_bebidas": 219.69, "total_alimentos": 530.07,
  "total_impuesto": 114.74, "total_cortesias": 0,
  "total_descuentos": 22.16, "total_articulos": 6,
  "numero_de_personas": 2, "subtotal_con_descuento": 727.6,
  "mesa": 7, "folio": 6010287, "mesero_id": 39, "turno_id": 3,
  "fecha": "2024-06-21T23:06:00", "turno": "night",
  "forma_pago": "tarjeta", "tipo_servicio": "dine_in",
  "numero_franquicia": "FRMX-MB-GDL-001"
}
```

**BCL (data_type: transaction, source_date populated, entity_id NOT populated — may need resolution):**
```json
{
  "Periodo": "2025-10-01", "Sucursal": "BCL-AMB-001",
  "ID_Empleado": "BCL-5063", "Nombre_Completo": "Diego Mora Jaramillo",
  "Meta_Depositos": 35000, "Meta_Colocacion": 120000,
  "Monto_Colocacion": 127110.33, "Depositos_Nuevos_Netos": 34373.89,
  "Indice_Calidad_Cartera": 0.8573, "Cumplimiento_Colocacion": 1.0593,
  "Pct_Meta_Depositos": 0.9821, "Infracciones_Regulatorias": 3,
  "Cantidad_Productos_Cruzados": 4
}
```

### 2.4 Aggregation dimensions

- **Entity:** `committed_data.entity_id` → FK to `entities`. Per-entity summaries. The engine does not know whether entities are restaurants, salespeople, or anything else.
- **Time:** `committed_data.source_date`. Daily granularity. Period rollups computed on-read by grouping daily rows by `period_id`.
- **Network/cross-entity:** NOT pre-computed. Route handlers needing cross-entity totals query `summary_artifacts` grouped by `summary_date` only. Follow-on if performance warrants materialization.

---

## §3 — Constraints

1. **Korean Test.** Zero hardcoded field names in the engine source code. Every field reference derived from the data (row_data key inspection) or from convergence bindings. A Korean company with Hangul field names produces correct summaries without code changes.

2. **Decision 158.** The Summary Engine is entirely deterministic. No LLM calls. SQL/TypeScript math only. Construct side of the boundary.

3. **T1-E902 (Carry Everything).** Raw `committed_data` is preserved untouched. Summary artifacts are additive derived views. No persistence-time narrowing. Aggregate ALL numeric fields, not a curated subset.

4. **T1-E904 (Calculation Sovereignty).** Summary artifacts are NOT calculation results. `calculation_results` remains authoritative for payouts. Summary artifacts serve the visualization layer.

5. **Scale.** The aggregation runs in PostgreSQL (GROUP BY/SUM), not in JavaScript. 263K rows must summarize in seconds, not minutes.

6. **Idempotent.** Re-running the Summary Engine for the same tenant/dates replaces existing artifacts. Safe to re-trigger.

7. **Import-time triggered.** The Summary Engine fires after data import completes (committed_data written, entity resolution done). Also manually triggerable via an admin API endpoint for backfill and re-computation.

8. **Vertical slice.** The engine AND every visualization surface reading summaries ship in the same PR. Not "build the engine, fix pages later."

---

## §4 — Proof Gates

### PG-1: summary_artifacts populated for both tenants
After backfill, `summary_artifacts` contains rows for Sabor (pos_cheque data, 20+ entities, 180+ distinct dates) and BCL (transaction data). Report row counts per tenant.

### PG-2: Sabor financial pages load in under 2 seconds
Every financial/operate visualization page for Sabor that previously hit the 97-second path now loads in under 2 seconds. Measure and report each page's load time.

### PG-3: BCL ICM pages unbroken
BCL's operate and insights pages continue to render with real data. The refactor does not break existing ICM visualization paths.

### PG-4: Zero render-time raw aggregation
Grep the codebase for the aggregation pattern identified in the diagnostic. Every site that previously fetched bulk `committed_data` for in-JS aggregation now reads `summary_artifacts`. The only remaining `committed_data` reads are filtered drill-through slices. Report the grep results.

### PG-5: Korean Test
Paste the Summary Engine's source code. The architect verifies zero hardcoded field names. Report the distinct metric keys in `summary_artifacts.metrics` for each tenant — Sabor's should be raw field names (total, propina, etc.), BCL's should be semantic labels from convergence (loan_placement_amount, etc.) or raw names if enrichment didn't apply.

### PG-6: Import-time trigger works
Import (or simulate import of) a small dataset for one tenant. Verify summary_artifacts are created automatically without manual trigger.

---

## §5 — HALT Conditions

**HALT-1:** `summary_artifacts` table does not exist in the live database. The architect has not applied the migration. Stop and report.

**HALT-2:** BCL `committed_data` rows with data_type 'transaction' have `entity_id = NULL` (Query 2 showed `has_entity: false`). The Summary Engine groups by entity_id — NULL entity_id rows produce no per-entity summaries. If this affects BCL proof (PG-1, PG-3), report the count of NULL-entity rows and halt for architect disposition. Options: entity resolution as prerequisite, or summarize NULL-entity rows under a synthetic "unresolved" entity.

---

## §5A — Reporting

Completion report at `docs/completion-reports/OB-229_COMPLETION_REPORT.md`.

Structure: ADR, proof gate results (PG-1 through PG-6 with evidence), performance comparison, PR number and URL. Per Rules 25-28: pasted code, pasted terminal output, or pasted grep results for every gate. No self-attestation.

Final step: `gh pr create --base main --head dev` with descriptive title and body.

---

## §6 — Out of Scope

- Insight Engine / intelligence_artifacts (DS-028 Phase 2)
- Semantic API layer (DS-028 Phase 3)
- OLAP / streaming (DS-028 Phase 4)
- Decision 158 Extension, DS-013 Extension, insight-shape promotion gate (VG governance)
- Curation Engine / adaptive pre-computation
- UI-origin attention synapses
- Materialized network summaries
- Materialized period rollups
- Convergence binding backfill for Sabor (separate OB — wiring financial agent field knowledge into input_bindings)

---

## §6A — Residuals

1. **Sabor has no semantic labels.** Summaries use raw field names (total, propina). A follow-on OB wires the Financial Agent's field comprehension into `input_bindings` so summaries get semantic labels.
2. **BCL entity_id resolution.** If HALT-2 fires, BCL transaction rows need entity resolution before summaries are meaningful. May require a prerequisite HF.
3. **Non-SUM fields.** BCL bindings include `reduction: "snapshot"` and `reduction: "last"`. The engine should handle these (last value, not SUM). If edge cases surface, document and defer.
4. **Source_date nulls.** If any rows have null `source_date`, handle defensively — exclude with a warning or extract date from row_data. Document findings.

---

*OB-229 ULTRACODE. Objectives + constraints + proof gates. CC determines execution strategy.*
*vialuce.ai — Intelligence. Acceleration. Performance.*
