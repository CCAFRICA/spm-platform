# OB-228 Phase 1 — Diagnostic & Architecture Decision Gate

**OB:** OB-228 — The Living Plan Surface: Foundation (DS-029 Slice 1+2)
**Date:** 2026-06-21 · **Proof tenant:** MIR ("Almacenes Mirasol")
**Method:** READ-ONLY service-role row-introspection (FP-49: no `information_schema`/`exec_sql` via PostgREST). Scripts: `web/scripts/ob228-phase1-diagnostic.ts`, `web/scripts/ob228-phase1-bindings.ts`. Recompute-path discovery: read-only code map of `web/src/app/api/calculation/run/route.ts` + `web/src/lib/calculation/`.
**No implementation code in this phase** (§B Architecture Decision Gate).

---

## Step 1 — MIR tenant resolution

Query (`ob228-phase1-diagnostic.ts` §1): `tenants` where `name ilike '%MIR%' OR slug ilike '%MIR%'`.

```
CANDIDATE id=972c8eb0-e3ae-4e4c-ad30-8b34804c893a name="Almacenes Mirasol" slug="almacenes-mirasol" locale=en-US currency=PEN
  features={"coaching":true,"learning":true,"apiAccess":true,"financial":true,"mobileApp":true,"forecasting":true,
            "performance":true,"compensation":true,"gamification":true,"salesFinance":true,"transactions":true,"whatsappIntegration":true}
RESOLVED MIR tenant_id = 972c8eb0-e3ae-4e4c-ad30-8b34804c893a
```

**MIR `tenant_id` = `972c8eb0-e3ae-4e4c-ad30-8b34804c893a`** (captured verbatim; not guessed). Note: `tenants.locale = en-US` in the DB (the es-PE persona is a demo/label property; plan component labels are Spanish — see §3). `currency = PEN` (Peruvian Sol → "S/" — consistent with the es-PE persona).

---

## Step 2 — FP-49 schema verification (column inventories)

Row-introspection of 8 tables (live columns; cross-checked against `SCHEMA_REFERENCE_LIVE.md`, drift noted):

```
profiles (13 cols): [auth_user_id, avatar_url, capabilities, created_at, display_name, email, id, locale, preferences, role, status, tenant_id, updated_at]
profile_scope (0 cols — table EMPTY platform-wide): [id, tenant_id, profile_id, scope_type, visible_entity_ids[], visible_rule_set_ids[], visible_period_ids[], metadata, materialized_at]  (cols per SCHEMA_REFERENCE_LIVE.md)
rule_sets (18 cols): [approved_by, cadence_config, components, created_at, created_by, description, effective_from, effective_to, id, input_bindings, metadata, name, outcome_config, population_config, status, tenant_id, updated_at, version]
committed_data (10 cols): [created_at, data_type, entity_id, id, import_batch_id, metadata, period_id, row_data, source_date, tenant_id]
entity_period_outcomes (11 cols): [attainment_summary, component_breakdown, entity_id, id, lowest_lifecycle_state, materialized_at, metadata, period_id, rule_set_breakdown, tenant_id, total_payout]
calculation_results (12 cols): [attainment, batch_id, components, created_at, entity_id, id, metadata, metrics, period_id, rule_set_id, tenant_id, total_payout]
calculation_traces (11 cols): [committed_data_id, component_name, created_at, formula, id, inputs, output, result_id, steps, tenant_id, transaction_ref]
periods (11 cols): [canonical_key, created_at, end_date, id, label, metadata, period_type, start_date, status, tenant_id, updated_at]
```

**Persona/role column (HALT-3 gate).** `profiles` has **no `persona` column**. It has `role` (text, e.g. `admin`) and `capabilities` (jsonb string array). The refraction seam resolves persona from `role` (alias-normalized via `resolveIdentity` → `canonicalRole`) + `capabilities`.
- MIR's only profile: `jruiz@MIR.Pr role=admin locale=en-US capabilities=ARRAY[25]` (`data.calculate`, `icm.configure_plans`, `icm.simulate`, …).
- **HALT-3 verdict: CLEAR** (a role/capability column exists; the seam is not stubbed with a hardcoded "admin" constant — it reads `resolveIdentity().canonicalRole` + `capabilities`).

**`profile_scope` is empty platform-wide (0 rows).** The seam's contract: when no `profile_scope` row exists for a profile, an admin/platform identity defaults to **all-visible** (scope row absent ⇒ unrestricted for admin); a non-admin with no scope row sees nothing (fail-closed). This is the documented refraction behavior, not a HALT — the seam still resolves correctly.

**`committed_data.period_id` is NULL for MIR data** (see §4 — all 75,227 rows scope by `source_date`, not `period_id`). Distribution + recompute period-scoping must use `source_date BETWEEN period.start_date AND period.end_date`.

---

## Step 3 — `rule_sets.components` dialect determination

MIR has **5 rule_sets** (matches DS-029 expectation). Verbatim shape (from `ob228-phase1-diagnostic.ts` §3):

### Dialect (all 5 plans identical)
```
components = {
  variants: [
    {
      variantId, variantName, description, eligibilityCriteria,
      components: [
        { id, name, description, order, enabled, metadata,
          componentType: "prime_dag",          // <-- ALL components, ALL plans
          measurementLevel,
          calculationIntent: { ...PrimeNode tree... }   // the actual logic
        }
      ]
    }
  ]
}
input_bindings = {}                              // EMPTY for all 5 plans (no convergence_bindings)
population_config = { "eligible_roles": [] }
metadata keys = [source, plan_type, aiConfidence, batchedSheets, contentUnitId]
```

### PREMISE CORRECTION (this is the central Phase-1 finding)
DS-029 §3①/§4.1 and the OB directive assumed `componentType ∈ {matrix_lookup, tier_lookup, percentage, conditional_percentage}` carrying `matrixConfig/tierConfig/percentageConfig/conditionalConfig`. **MIR's reality is different and uniform: every one of the 13 components across the 5 plans has `componentType = "prime_dag"`, with the entire logic expressed as a prime-DAG tree in `calculationIntent`.** There is no `configuration` wrapper (the OB-227 alternate dialect was `configuration.variants[]`; MIR is bare `variants[]`), and no `tierConfig/matrixConfig/...` fields.

The prime-DAG vocabulary (9 `PrimeNode` types, `intent-types.ts:389`): `arithmetic · aggregate · filter · conditional · scope · compare · logical · constant · reference · prior_period`. Verbatim `calculationIntent` examples:

- **Plan 1 "Comision por Categoria de Producto"** — banded rate × amount:
  `multiply( reference(Monto_Total), conditional-ladder on Categoria → 0.035/0.03/0.02/0.025 )`
- **Plan 1 "Acelerador por Volumen"** — accelerator:
  `conditional( compare(scope(DNI_Vendedor, sum(Monto_Total)) >= 150000) ? 1.25 : 1 )`
- **Plan 4 "Bono por cliente nuevo verificado"** — filtered count × flat:
  `multiply( 150, filter(Verificado eq "Si", count(Verificado)) )`
- **Plan 5 "Ajuste por Devolucion (Clawback)"** — sign-flipped reversal:
  `multiply( -1, multiply(multiply(reference(Monto_Original), reference(Tasa_Comision_Original)), reference(Multiplicador_Acelerador_Original)) )`

### Richer structure available in `component.metadata`
Each component also carries `metadata.compositional_intent.structure` — a **high-level, human-legible** representation:
```
component.metadata.compositional_intent.structure =
  { shape: "arithmetic", operation: "multiply",
    operands: [ {kind:"reference", source:{field:"Monto_Total"}},
                {kind:"structure", structure:{ shape:"banded_lookup",
                   outputs:[0.025,0.02,0.03,0.035], dimensions:[{breaks:[1,2,3], reference_field:"Categoria"}] }} ] }
component.metadata.compositional_intent.metadata.note =
  "Band order maps to ALI=2.5%, BEB=2.0%, LIM=3.0%, CPE=3.5%; accelerator (1.25x when monthly gross >= S/150,000)
   applied at monthly aggregation level outside this per-transaction rate component."   // <-- PROVENANCE source sentence (Concept 4)
component.confidence = undefined        // NO per-component confidence field
plan.metadata.aiConfidence = 0.97       // confidence is plan-level
```
This `compositional_intent.structure` (shape `banded_lookup` with `breaks`/`outputs`/`reference_field`) **is** a tier/band table — so the canvas can render MIR's prime-DAG components as rich tier ladders / rate chips / accelerators (structurally derived), not merely generic JSON cards. The `note` is the Concept-④ provenance source sentence.

### HALT-1 verdict: NOT FIRED
The shape **normalizes cleanly** into the canonical `PlanStructure` (`{ variants: [{ components: [...] }] }`). `componentType = "prime_dag"` is a valid dispatch value: it is **not** in the bespoke typed-renderer map, so it routes to a first-class **`PrimeDagRenderer`** (which renders `calculationIntent` + `compositional_intent.structure` legibly), with **`GenericComponentRenderer` as the mandatory Korean-Test fallback** for any truly-unknown type. The premise correction is **surfaced, not coerced** — this is faithful rendering of "the prime-DAG made visible" (DS-029 §3①). The normalizer carries every component and every field through (`isKnownType` is set by membership in the renderer set but never gates inclusion).

---

## Step 4 — Binding resolution

`input_bindings = {}` for all 5 plans — **there are no explicit bindings**. Bindings are **implicit** in the prime-DAG `field` references (`reference.field`, `aggregate.field`, `scope.boundary`, `filter.predicate.field`). Extracted per plan and checked against the per-sheet `committed_data.row_data` column inventory (`ob228-phase1-bindings.ts`):

### Sheets present in MIR committed_data (75,227 rows total)
```
Nómina         (roster): DNI, Nombre_Completo, Cargo, Almacen, Ciudad, Zona, Estado, Fecha_Ingreso
Cuotas (wide-format quota): DNI, Nombre_Vendedor, Almacen, Enero_2025, Febrero_2025, Marzo_2025, Abril_2025, Mayo_2025, Junio_2025
Ventas_Abril / Ventas_Mayo / … (transactions): Monto_Total, Categoria, DNI_Vendedor, Fecha, Folio, Producto, Cantidad, Precio_Unitario, Codigo_Cliente, Nombre_Vendedor
Clientes_Nuevos: Verificado, DNI_Vendedor, Codigo_Cliente_Nuevo, Pedidos_Primeros_60_Dias, Tipo_Negocio, Distrito, Fecha_Registro, Nombre_Negocio
```

### Binding-resolution table (the OB-214 surface)
| Plan | Component | Field refs | Resolves? |
|---|---|---|---|
| Comisiones Mayorista | Comision por Categoria | `Monto_Total` [ref], `Categoria` [ref] | ✓ (Ventas_*) |
| Comisiones Mayorista | Acelerador por Volumen | `DNI_Vendedor` [scope], `Monto_Total` [agg:sum] | ✓ (Ventas_*) |
| **Bono por Cuota Mensual** | Bono por Nivel | `ventas_brutas_mensuales` [ref], `cuota_mensual_asignada` [ref] | **✗ HALT-2** (actual data is wide-format `Cuotas` Enero_2025…; interpreter token mismatch — OB-214) |
| **Plan de Incentivo por Cobranza** | Tasa de Incentivo | `Monto_Cobrado` [agg/ref], `Saldo_Pendiente` [ref] | **✗ HALT-2** (no Cobranza sheet imported — OB-214) |
| Bono por Cartera Nueva | Bono por cliente nuevo | `Verificado` [filter+count] | ✓ (Clientes_Nuevos) |
| **Ajustes/Devoluciones (Clawback)** | Ajuste por Devolucion | `Monto_Original`, `Tasa_Comision_Original`, `Multiplicador_Acelerador_Original` [ref] | **✗ HALT-2** (cross-period reversal fields — OB-218 mechanism, not flat columns) |

### HALT-2 verdict: SCOPED (does not block other components/phases)
2 of 5 plans fully resolve (Plans 1, 4) → distribution sparklines have a real source. 3 of 5 have unresolved bindings (Plans 2, 3, 5) → those cards render **without a distribution, flagged** (never fabricated). This is exactly the DS-029 thesis: the canvas **surfaces** interpreter defects (Concept ③/④) rather than hiding them. Per directive HALT-2, this is a per-component scoped halt, not an OB blocker.

### `source_date` period scoping (confirmed)
```
Jan2025 (source_date 2025-01-01..2025-01-31): 11698 rows
Feb2025 (source_date 2025-02-01..2025-02-28): 12220 rows
Mar2025 (source_date 2025-03-01..2025-03-31): 12417 rows
Jun2025 (source_date 2025-06-01..2025-06-30): 13185 rows
source_date IS NULL: 64 rows  (the entity/roster/quota rows)
committed_rows per period_id = 0  (period_id is NULL on the data)
```
`getComponentDistribution` and any recompute scope the period by `source_date`, not `period_id`. MIR has 6 periods (Jan–Jun 2025, all status=open).

---

## Step 5 — Recompute-path discovery (HALT-4)

Read-only map of the live calc path (`web/src/app/api/calculation/run/route.ts`, ~3,400 lines) and the engine kernel (`web/src/lib/calculation/intent-executor.ts`).

### Reusable as-is (pure, DB-free)
- **`evaluate(node, context)`** (`intent-executor.ts:171`) — the single recursive prime-DAG walker (9 prime types; decimal.js / Banker's Rounding, Decision 122).
- **`executeIntent(intent, entityData)`** (`intent-executor.ts:444`) — the smallest "evaluate ONE component for ONE entity" unit; returns `{entityId, componentIndex, outcome, trace}`.
- **`buildEvalContext(data)`** (`intent-executor.ts:393`) — pure, in-memory.
- `EntityData` (`intent-executor.ts:32`) is a plain struct; nothing in it requires a batch row.

### The entanglement
The **metrics-resolution layer** that feeds `EntityData.metrics` — `resolveMetricsFromConvergenceBindings` (`route.ts:1475`), `resolveColumnFromBatch` (`route.ts:1692`), and the cache builders `dataByBatch` (`route.ts:868–987`), `rosterJoinIndex`, `referenceRows`, `allEntityRowsForPeriod` (`route.ts:2047`) — are **closures defined inside the POST handler**, not exported. They close over `period`, trace helpers, and the in-memory caches. The `calculation_batches` row (`route.ts:1387`) is created *after* bindings are read and is **never read back by the math** — so the math is **not** coupled to the batch lifecycle; the resolution code is merely **co-located** with the orchestrator.

### Two viable wirings, both problematic for this OB
1. **Extract the resolution closures** into a shared module and have `run/route.ts` import them. This refactors the platform's single most regression-sensitive path (the byte-identical calc engine that produces the $312,033-class results; cf. the BCL/Meridian HALT-4 byte-identical invariant). Any subtle change risks a financial-result regression and demands full GT reconciliation — which is **architect-channel** (GT values never enter CC) and beyond this OB's authority.
2. **Replicate the resolution logic** in a parallel module. This violates §3.4 / §2 ("no parallel math — one source of calculation truth"). Forbidden.

### Additional decisive fact
**MIR has never been calculated.** `entity_period_outcomes = 0`, `calculation_results = 0`, `calculation_traces = 0`, `calculation_batches = 0` for MIR. There is **no baseline** to diff against; `getBaselineOutcomes` returns empty for MIR. Even with a recompute path, the consequence preview would have no "before."

### HALT-4 verdict: FIRED
A scoped single-rule_set recompute adapter requires either (1) refactoring the byte-identical live calc path (architect disposition + GT reconciliation) or (2) forbidden parallel math — **an architectural decision beyond this OB's authority**, compounded by the absence of any MIR baseline. **Phase 4 builds the edit affordance + `ConsequenceTray` + diff scaffold + commit path (write `rule_sets.components` + emit `classification_signals`); the recompute function `recomputeConsequence` is built as the single clearly-labeled SEAM ("recompute pending architect disposition") — no faked values.** Phases 5/6 proceed; the working surface ships against MIR by Phase 6 (per directive ULTRACODE contract).

---

## Step 6 — Routing convention

`/configure/*` route tree (live): `data-specs, locations, organization, people, periods, system, teams, users, page.tsx, [...slug]`. **No `/configure/plans` dir → net-new.** A specific `plans/` segment takes priority over the `[...slug]` catch-all (no interception). No `/configure/layout.tsx` (pages self-style with `useIsVialuce()`). **Decision: canvas lands at `/configure/plans` (Zone A rail) and `/configure/plans/[ruleSetId]` (Zone B canvas)** — matches the directive convention. Nav entry added in `src/lib/navigation/workspace-config.ts` (Configure workspace).

---

## Step 7 — Anti-Pattern Registry check + Architecture Decision Record

### Anti-Pattern Registry (Section C) — zero violations planned
- **AP-1/AP-2/AP-3 (transport/bulk):** distribution aggregates **server-side** in an API route (service-role), returns **bucket counts only** — no per-row payload to the client (§A.2). No browser bulk writes.
- **AP-5/AP-6/AP-7 (AI hardcoding):** renderer dispatches on the `componentType` value present, with a generic fallback — no enumerated whitelist, no field-name dictionary, no hardcoded confidence. Labels render from the payload (es-PE Spanish native).
- **AP-9/AP-10/AP-11 (proof):** every proof gate verifies LIVE RENDERED state against MIR's 5 plans, not file existence.
- **AP-12 (IDs):** `crypto.randomUUID()` for any new id (commit signal rows).
- **AP-13/AP-18/AP-19 (schema):** all reads verified against live schema (this doc, §2). No fabricated columns.
- **AP-25 (decimal):** any consequence math reuses the engine kernel (decimal.js) — never native-number parallel math (HALT-4 → seam, so no parallel math ships).
- **AP-26 (closed-vocabulary registries):** none introduced; `classification_signals` written with open-vocabulary `signal_type` strings.
- **Theme (Rule 30):** all new UI consumes `var(--vl-*)` / `useIsVialuce()`; zero hardcoded colors on Vialuce surfaces.

### ARCHITECTURE DECISION RECORD
```
Problem: Build the Living Plan Surface foundation (DS-029 Slice 1+2) against MIR — a persona-resolved,
         self-explaining, self-simulating canvas over rule_sets.components, with consequence preview,
         confidence topology, and provenance. MIR's components are all `prime_dag` (logic in
         calculationIntent), input_bindings are empty (implicit prime-DAG field refs), and MIR has
         never been calculated.

Option A: Render via the directive's literal typed-renderer map only ({tier_lookup, matrix_lookup,
          percentage, conditional_percentage} ?? Generic). MIR (all prime_dag) -> ALL cards hit the
          generic fallback.
  - Scale (10x): OK (aggregated reads).   - AI-first: OK (generic fallback).
  - Korean Test: PASSES (fallback fires).  - Demo quality: WEAK (no rich tier/rate visuals for MIR).

Option B: Dispatch on componentType with a first-class `prime_dag` -> PrimeDagRenderer that renders the
          calculationIntent tree + compositional_intent.structure (banded_lookup -> tier table, rate
          chips, accelerators, clawback sign) structurally; KEEP the typed renderers (tier_lookup etc.)
          for other tenants' dialect; KEEP GenericComponentRenderer as the mandatory `?? ` fallback
          (the Korean-Test proof for any truly-unknown type).
  - Scale (10x): OK (server-side bucket aggregation).   - AI-first: OK (structural detection, no literals).
  - Korean Test: PASSES (generic fallback retained + proven on a synthetic unknown type).
  - Demo quality: RICH (MIR renders as tier ladders/rates/accelerators from real structure).

Option C: Coerce prime_dag into one of the typed configs at read time (fabricate a tierConfig).
  - AI-first: VIOLATION (coercion / hardcoded mapping).  - HALT-1 spirit: VIOLATION (silent coercion).
  REJECTED.

CHOSEN: Option B — first-class PrimeDagRenderer + retained typed renderers + mandatory generic fallback.
        Faithful to MIR's actual representation (DS-029 §3-(1) "prime-DAG made visible"), Korean-Test
        clean (structural dispatch + generic fallback proven), rich demo, scale-correct.
REJECTED: A (weak demo, under-uses real structure), C (coercion / AP-5 / HALT-1 violation).

Recompute (Concept 2): HALT-4 — build edit + tray + diff scaffold + commit; recomputeConsequence is the
        single surfaced SEAM ("pending architect disposition"), no faked values. Reason: the metrics-
        resolution layer is locked in the byte-identical live calc route; extraction = architect-channel
        GT-reconciled refactor; replication = forbidden parallel math; and MIR has no baseline anyway.

Distribution transport: server-side aggregation API route -> bucket counts only to the client (AP-1/A.2).
        Period scope by source_date (period_id is NULL on MIR data). 10x note: in-process aggregation over
        a period-scoped, single-bound-column fetch is correct-shape now; SQL GROUP-BY aggregation
        (RPC/view) is the same DIAG-075 scale follow-up at enterprise volume.

Persona seam: resolvePersona reads resolveIdentity().{canonicalRole, capabilities, tenantId} + profile_scope
        (visible_rule_set_ids/...). profile_scope empty -> admin defaults all-visible, non-admin fail-closed.
        Persona -> renderer dispatch: only AdminRenderer this OB; Rep/Manager are deferred slots (OB-229),
        added by slot-fill not refactor.

GOVERNING PRINCIPLES (Decisions 123 & 124)
G1 Standard: SOC1/SSAE-18 audit trail (classification_signals on every correction), GAAP line-item
   (decimal.js, Decision 122) — the recompute SEAM preserves the single-source-of-truth control rather
   than introducing a second, divergent calculation surface.
G2 Embodiment: Korean Test as renderer dispatch-map-with-generic-fallback (the architecture, not a policy,
   guarantees unknown types render); server-side aggregation as the scale control.
G3 Traceability: this diagnostic -> the canonical types -> the renderers; an auditor can trace each surface
   element to a live column (DS-029 §4 data contract, verified §2/§3/§4 here).
G4 Discipline: pre-attentive visual processing + Bloodwork (recede-the-confident, surface exceptions) for
   confidence topology; information scent for provenance.
G5 Abstraction: the canvas renders ICM and Financial tenants identically (dispatch on componentType value,
   not domain) — domain-agnostic.
G6 Innovation boundary: consequence-preview is grounded in deterministic recompute (when available), not
   LLM estimate (Decision 158); shipped here as an explicit seam, not a speculative fake.
```

---

## Summary of HALT determinations

| HALT | Condition | Verdict |
|---|---|---|
| HALT-1 | components dialect unmappable | **NOT FIRED** — `{variants[].components[]}` with `prime_dag` normalizes cleanly; rendered via PrimeDagRenderer (premise corrected, not coerced) |
| HALT-2 | binding unresolved | **SCOPED FIRE** — Plans 2,3,5 have unresolved field refs (OB-214); render flagged-no-distribution, no fabrication; Plans 1,4 resolve |
| HALT-3 | persona column absent | **NOT FIRED** — `profiles.role` + `capabilities` present; seam reads `resolveIdentity` + `profile_scope` |
| HALT-4 | recompute requires architectural decision | **FIRED** — resolution layer locked in byte-identical live calc route (extract = architect-channel; replicate = forbidden); MIR uncalculated (no baseline). Phase 4 builds tray+edit+commit, recompute is the surfaced seam |

**Gate complete.** Proceed to Phase 2.
