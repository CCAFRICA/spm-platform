# OB-232: Insight Engine + Adaptive Experience Foundation

**Mode:** ULTRACODE
**Date:** 2026-06-22
**Design Specification:** DS-028 Phase 2 (Insight Engine) + DS-013 (Platform Experience Architecture) extension
**IRA Provenance:** Invocations 1+2 (GREEN-CONDITIONAL, Option A adopted). Three enforcement points validated. Decision 158 extends to the experience surface.
**Predecessor:** OB-229 (Summary Engine, PR #588 — 138.9× proven, `summary_artifacts` populated for Sabor)
**Schema prerequisite:** Architect applies migration SQL before dispatch (§A below)

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Binding: Principles 1-9, Section B (ADR), Section C (Anti-Pattern Registry), Section D (operational). SR-34, SR-38, SR-44.

---

## §1 — Four objectives, one PR

This OB delivers four scoped outcomes that depend on each other bottom-up. CC determines execution order and strategy. All ship in one PR.

### Objective 1 — Entity Resolution (unblocks BCL/MIR summaries)

OB-229 HALT-2: BCL has 510/510 transaction rows with `entity_id = NULL`. MIR has 70,300 NULL-entity rows. `summary_artifacts.entity_id` is NOT NULL FK→entities. Summaries cannot be computed for rows without entities.

**Outcome:** BCL and MIR `committed_data` rows that have an identifiable entity reference in `row_data` get their `entity_id` populated. Rows that genuinely have no entity reference remain NULL and are excluded from summaries (documented, not silently dropped).

BCL's `row_data` contains `"ID_Empleado": "BCL-5063"` — this is the entity identifier. The convergence bindings confirm it: `entity_identifier.column = "ID_Empleado"`, `field_identity.contextualIdentity = "identifier"`. The entities table should already have rows for BCL employees (imported via data_type `entity`). The resolution: match `row_data->>'ID_Empleado'` to the entity whose `row_data->>'ID_Empleado'` matches, update `committed_data.entity_id`.

MIR: same pattern — find the entity identifier field in MIR's data, match to entities, populate entity_id. If MIR's entity rows don't exist, document and skip (MIR has other open items — OB-214 interpreter scope).

After entity resolution, re-run the OB-229 Summary Engine backfill for BCL and MIR. Summary artifacts should now be populated.

### Objective 2 — Complete the visualization refactor (OB-229 staged work)

OB-229 shipped the `network_pulse` mode reading from `summary_artifacts`. Seven financial aggregate modes still use the 97-second raw aggregation path: `leakage`, `performance`, `staff`, `timeline`, `patterns`, `summary`, `products`.

**Outcome:** Every financial aggregate mode reads from `summary_artifacts` using the proven summary-first + raw-fallback pattern from OB-229. The `summary-read.ts` helper is already built. Modes that need row-level detail (staff/patterns/products may need individual transaction fields for drill-through) keep filtered `committed_data` reads for drill-through only — not bulk aggregation.

The raw-fallback ensures BCL (which may have summaries after Objective 1) and any tenant without summaries still works via the unchanged raw path.

### Objective 3 — Insight Engine (DS-028 Phase 2)

Build the import-time insight generation infrastructure. When data is imported and summaries are computed (OB-229), the Insight Engine reads the freshly computed summary artifacts and generates human-readable intelligence — anomalies, trends, coaching signals, benchmarks — stored as `intelligence_artifacts`.

**Outcome:** After a Sabor data import (or backfill), `intelligence_artifacts` contains generated insights referencing specific entities, dates, and metrics from the summary data. Insights are stored, not computed at render time. Any page that renders insights reads pre-generated artifacts.

Architecture per DS-028 §3.2 Step 3 + Decision 158 boundary (IRA-validated):
- The LLM reads pre-computed summary artifacts (numbers already guaranteed by the deterministic Summary Engine). The LLM RECOGNIZES patterns and generates narrative. It never computes, introduces, or mutates values.
- The Anthropic API call receives summary data as context and returns structured insight artifacts with: type (anomaly/trend/coaching/benchmark), severity, entity reference, title, narrative, data references (the specific metrics it's observing), and optional recommended action.
- Insights are stored in `intelligence_artifacts` (table pre-applied by architect).
- The model and prompt are governed by `model-policy.ts` (OB-215). Use the appropriate model tier for insight generation.

The `intelligence_artifacts` table schema (pre-applied):
```
intelligence_artifacts
  id                UUID PK
  tenant_id         UUID NOT NULL → tenants
  artifact_type     TEXT NOT NULL  -- 'anomaly', 'trend', 'coaching', 'benchmark'
  severity          TEXT NOT NULL  -- 'critical', 'warning', 'info', 'positive'
  entity_id         UUID → entities (nullable — network-level insights have no entity)
  entity_type       TEXT           -- 'location', 'individual', 'organization', 'network'
  period_start      DATE
  period_end        DATE
  title             TEXT NOT NULL
  narrative         TEXT NOT NULL
  data_references   JSONB          -- {metric: 'total', value: 45200.50, delta_pct: -12.3, ...}
  recommended_action TEXT
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  generated_by      TEXT           -- model identifier from model-policy.ts
  acknowledged      BOOLEAN DEFAULT false
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
```

The Insight Engine fires after the Summary Engine completes (import pipeline: data import → entity resolution → Summary Engine → Insight Engine). Also manually triggerable via admin API.

### Objective 4 — Morphological inversion enforcement foundations

Build the three enforcement points that IRA Invocations 1+2 validated as coherence-conditional. These are the foundations — the infrastructure that future adaptive-experience work (DS-013 Phase C/D/E) builds on.

**Enforcement Point 1 — UI interaction signal capture on the canonical surface.**

When a user interacts with a visualization surface (selects an entity, drills into a metric, dwells on a component, dismisses an insight), that interaction is written to the canonical signal surface (`classification_signals` or the appropriate existing signal table — read the schema to determine the right target). NOT a private UI-telemetry table. The signal carries:
- A structural interaction type: `selection`, `dwell`, `drill`, `dismissal` (Korean Test: structural classes, not domain-specific)
- The structural context of what was acted upon (entity_id, metric key, surface identifier — never a domain string like "leakage" hardcoded in the signal)
- User/session identification (for per-user density, respecting tenant isolation)

This is the signal capture that DS-013 Phase C says is "captured but dormant" — make it active and routed to the canonical surface.

**Enforcement Point 2 — Deterministic validator between LLM emission and render.**

When the Insight Engine generates an insight artifact (Objective 3), or when any future LLM-composed content is destined for the experience surface, a validator checks:
- **Data-contract:** every numeric value referenced in the insight traces to a specific `summary_artifacts` metric. The LLM cannot introduce values not present in the summary data. If the insight says "revenue dropped 12%," the 12% must be derivable from the summary artifacts the LLM was given.
- **Allowable-form:** every insight type (anomaly/trend/coaching/benchmark) exists in the canonical type registry. The validator fails loud on unrecognized types.

For Phase 2 this validator is focused on insight artifacts. The architecture is extensible to future generative surface composition (DS-013 Phase D/E) without re-architecture.

**Enforcement Point 3 — Insight-shape structural signature.**

Each generated insight carries a structural shape descriptor — a fingerprint of the pattern type, metric involved, entity type, and severity, stripped of all tenant-specific content. Example: `{pattern: "spike", metric_class: "measure", entity_type: "location", severity: "warning", delta_direction: "increase"}`. This shape is stored alongside the insight. It contains zero tenant data by construction — it describes the pattern's structure, not its content.

This is the foundation for cross-tenant insight-shape transfer (DS-028 §4.3 Domain Flywheel). The transfer mechanism itself is out of scope — only the shape capture is in scope. Future work promotes shapes to the Domain flywheel; this OB ensures every insight has a shape to promote.

---

## §2 — Constraints

1. **Korean Test.** Zero hardcoded field names, domain strings, or tenant-specific vocabulary in the engine, validator, or signal capture code. Structural types only.

2. **Decision 158 (extended to experience surface per IRA Option A).** Summary Engine = deterministic, constructs and guarantees. Insight Engine = LLM recognizes patterns in pre-computed summaries, generates narrative. Validator = deterministic, enforces data-contract and allowable-form between LLM emission and storage/render. The boundary is sharp: the LLM produces text; deterministic code produced every number the text references.

3. **T1-E902 (Carry Everything).** Entity resolution populates `entity_id` — it does not delete, filter, or modify `committed_data` rows. Rows that remain NULL-entity are documented, not dropped.

4. **T1-E904 (Calculation Sovereignty).** `calculation_results` untouched. Insights reference summary artifacts (visualization metrics), never calculation results (payout amounts).

5. **Progressive Performance.** Insights are computed once at import time and stored. Every subsequent page load reads pre-generated artifacts. The import bears the cost; reads are free.

6. **No-private-channel (DS-027 DI-6, DS-021 G7).** UI interaction signals route to the canonical signal surface, not a private UI-telemetry table.

7. **Vertical slice.** All four objectives ship in one PR. The Insight Engine (computation) and the surfaces that render insights (experience) ship together. Signal capture is wired into at least one existing surface (not just infrastructure with no consumer).

8. **Idempotent.** Entity resolution, Summary Engine backfill, and Insight Engine generation are all safe to re-run.

---

## §3 — Proof Gates

### PG-1: Entity resolution
BCL `committed_data` rows with data_type `transaction` have `entity_id` populated where `row_data->>'ID_Empleado'` matches an existing entity. Report: rows resolved vs total, entities matched. Re-run OB-229 Summary Engine backfill for BCL. Report: BCL `summary_artifacts` row count, distinct entities, distinct dates.

### PG-2: All financial modes on summaries
Every financial aggregate mode (network_pulse + leakage + performance + staff + timeline + patterns + summary + products) reads from `summary_artifacts` when summaries exist. Grep the financial data route handler — zero modes should call `fetchRawDataServer` for bulk aggregation (drill-through modes excluded). Report the grep.

### PG-3: Intelligence artifacts generated for Sabor
After Insight Engine runs against Sabor's summary data, `intelligence_artifacts` contains at least one insight per artifact_type (anomaly, trend, coaching, benchmark) referencing real Sabor entities and metrics. Report: total artifacts generated, distinct types, sample insight (title + narrative + data_references).

### PG-4: Data-contract validator passes
For every generated insight, the validator confirms that every numeric value in `data_references` traces to a specific `summary_artifacts` metric for the referenced entity and date range. Report: artifacts validated, any failures.

### PG-5: Insight structural shapes captured
Every `intelligence_artifacts` row has a non-null structural shape (`insight_shape` JSONB) containing pattern type, metric class, entity type, severity, and delta direction. The shape contains zero tenant-specific content (no entity names, no tenant IDs, no field values). Report: sample shapes for each artifact_type.

### PG-6: Signal capture wired
At least one visualization surface captures UI interaction events (selection or drill-through) to the canonical signal surface. Report: the surface, the signal type written, the target table, a sample signal row.

### PG-7: BCL pages still work
BCL operate/insights pages render with real data after entity resolution and summary backfill. The summary-first + raw-fallback pattern handles both states.

### PG-8: Korean Test
Paste the Insight Engine source, the validator source, and the signal capture source. Zero hardcoded field names or domain strings.

---

## §4 — HALT Conditions

**HALT-1:** BCL entity rows (data_type `entity` in `committed_data` or rows in `entities` table) do not contain an `ID_Empleado` field that matches the transaction rows' `ID_Empleado` values. Entity resolution cannot proceed without a join key. Report the entity row structure and halt for architect disposition.

**HALT-2:** The canonical signal surface target table cannot be identified from the existing schema. If `classification_signals` doesn't exist or its schema doesn't accommodate UI-origin signals (it may be structured for ML classification signals only), halt and report the schema. The architect will disposition: extend the existing table, or create a new table that still lives on the canonical surface (not a private telemetry store).

**HALT-3:** `model-policy.ts` does not provide a model configuration suitable for insight generation (needs structured JSON output with data references). Report the current model policy structure and halt for architect to configure the appropriate model tier.

---

## §5A — Reporting

Completion report at `docs/completion-reports/OB-232_COMPLETION_REPORT.md`.

Structure: ADR (Section B, before implementation), proof gate results PG-1 through PG-8 with pasted evidence, HALT condition outcomes, performance data, PR number and URL.

Final step: `gh pr create --base main --head ob-232-insight-engine` with descriptive title and body.

---

## §6 — Out of Scope

- OLAP / streaming (DS-028 Phase 4)
- Curation Engine / adaptive pre-computation (DS-028 Phase 4+)
- Generative surface composition from signal density (DS-013 Phase D/E) — signal CAPTURE is in scope; adaptive COMPOSITION from accumulated signals is not
- Cross-tenant insight-shape TRANSFER (Domain Flywheel promotion) — shape CAPTURE is in scope; the promotion mechanism is not
- Decision 158 Extension artifact (VG governance — the enforcement points are VP code, the formal governance artifact is a separate VG commit)
- DS-013 Extension artifact (VG governance)
- Semantic API layer (DS-028 Phase 3)
- Intelligence stream as primary navigation surface (DS-013 §4) — the stream infrastructure is foundational here; replacing navigation is future
- Per-user density aggregation from captured signals (Gap 2 from IRA — privacy analysis required first)

---

## §6A — Residuals

1. **Convergence enrichment for Sabor.** Summary metrics use raw field names (total, propina). Semantic labels (revenue, tips) require wiring Financial Agent field comprehension into `input_bindings`. Separate OB.
2. **MIR entity resolution.** MIR has 70,300 NULL-entity rows + 18,534 NULL-date rows + open OB-214 interpreter scope. If MIR entities can be resolved using the same pattern as BCL, do it. If MIR's data structure is too different or interpreter defects block resolution, document and defer — MIR has known open items.
3. **Insight lifecycle.** When new data imports and summaries update, do prior insights expire? This OB generates insights for the current data state. Lifecycle management (expiration, revision, historical preservation) is a follow-on design question (DS-028 §8.2).
4. **BCL convergence reduction strategies.** BCL bindings include `reduction: snapshot|last`. OB-229 SUMs everything. Refinement to honor reduction strategies is a follow-on.
5. **Insight rendering surfaces.** This OB generates and stores insights. Rendering them on specific pages (the intelligence stream, financial page OBSERVATIONS sections) requires page-level UI work that may exceed one PR. If the insight read + render for at least one surface fits, include it (vertical slice). If the UI surface is too large, ship the engine + validator + signal capture + a minimal render proof, and scope the full rendering as a follow-on.

---

## §A — Pre-Apply Migration SQL (Architect applies before dispatch)

```sql
-- intelligence_artifacts table
CREATE TABLE IF NOT EXISTS intelligence_artifacts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  artifact_type     TEXT NOT NULL,
  severity          TEXT NOT NULL,
  entity_id         UUID REFERENCES entities(id),
  entity_type       TEXT,
  period_start      DATE,
  period_end        DATE,
  title             TEXT NOT NULL,
  narrative         TEXT NOT NULL,
  data_references   JSONB DEFAULT '{}',
  insight_shape     JSONB DEFAULT '{}',
  recommended_action TEXT,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by      TEXT,
  acknowledged      BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_intelligence_artifacts_tenant_type
  ON intelligence_artifacts (tenant_id, artifact_type, generated_at DESC);
CREATE INDEX idx_intelligence_artifacts_tenant_entity
  ON intelligence_artifacts (tenant_id, entity_id);

ALTER TABLE intelligence_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on intelligence_artifacts"
  ON intelligence_artifacts FOR ALL
  USING (tenant_id = (current_setting('app.current_tenant_id'))::uuid);

CREATE POLICY "Service role full access on intelligence_artifacts"
  ON intelligence_artifacts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
```

Apply this in SQL Editor. Confirm "Success." Then dispatch this directive to CC.

---

*OB-232 ULTRACODE. Insight Engine + adaptive experience foundations + visualization completion + entity resolution.*
*DS-028 Phase 2. IRA Invocations 1+2 enforcement points. Decision 158 extended to the experience surface.*
*vialuce.ai — Intelligence. Acceleration. Performance.*
