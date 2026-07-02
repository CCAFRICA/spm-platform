# OB-257 ARCHITECTURE DECISION RECORD
**Date:** 2026-07-01 · **Branch:** `ob-257-revenue-agent` · **Committed BEFORE implementation (Section B gate)**
**Inputs:** `docs/diagnostics/OB-257_P0_DISCOVERY.md` (bddace75) — all facts below are P0-evidenced.

---

## Problem

Build the Revenue agent: (O1) an entitled, gated agent; (O2) a serving layer where every surface reads
convergence-resolved roles → write-time materializations, with an idempotent activation backfill and zero
reimport; (O3) eight CRO-lens surfaces; (O4) four write-time insight classes on the existing
intelligence-artifact mechanism; (O5) the first empirical activation proof on BCL, Sabor as Finance control.

Three load-bearing decisions, each with options evaluated per Section B.

---

## DECISION 1 — Role-resolution store (which "convergence bindings" O2 reads)

**Option A: `rule_sets.input_bindings.convergence_bindings`** (calc-input store, `convergeBindings`)
- Scale test: Works at 10x? YES (jsonb read per rule_set)
- AI-first: Any hardcoding? NO reads are by contextualIdentity — but P0 proved BCL's store has **no revenue identity and never will without a plan referencing one**: bindings exist only for DAG fields plans consume. Serving-role coverage is structurally coupled to plan authorship.
- Transport: n/a. Atomicity: n/a.
- REJECTED: coupling serving-role resolution to plan DAG fields re-creates the Decision-158 violation class (a per-tenant contract — this time via plan shape). BCL activation would require plan changes = scope explosion.

**Option B: HF-337 `recognize()` / `surface_bindings`** (serving store; comprehension → cached binding; one temp-0 LLM on cold miss; self-priming)
- Scale test: YES — cached per (tenant, fingerprint, surface); LLM cost paid once per tenant per surface.
- AI-first: zero hardcoded fields — purposes are structural role descriptions; the LLM recognizes; deterministic code reads the persisted binding (Decision 158 exactly). Decision 108 satisfied: comprehension artifacts ARE the ≥0.80 HC channel.
- Transport: n/a. Atomicity: upsert per binding row.
- P0 empirically proved BCL resolves (`Monto_Colocacion` @0.82) via this exact mechanism.

**Option C: new bespoke revenue-binding table + bespoke recognizer**
- REJECTED on AP-17: duplicates the recognition path HF-337 already provides.

**CHOSEN: B.** Revenue declares its own surface ids (`revenue.measure`, `revenue.dimension.temporal`,
`revenue.dimension.entity`, `revenue.dimension.location`, `revenue.dimension.category`) with structural
purpose texts. Not reusing `financial.network_pulse.*` surface ids: each agent owns its surface vocabulary;
cross-agent cache aliasing would couple Finance regressions to Revenue recognition (DD-7 risk).
Unresolved role → structured absence (C2), never a fallback.

## DECISION 2 — Rollup storage for period-grain and dimension-grain materializations

P0 fact: `summary_artifacts.entity_id` is FK NOT NULL by design; `summary_artifacts_fine` live rows show the
same shape with borrowed entity_ids (`patterns_meta` global row carries a borrowed entity + `sub_entity_id=''`).

**Option A: store in `summary_artifacts` with borrowed entity_id** (calc-sentinel precedent, run/route.ts:3752)
- Scale: YES. AI-first: YES. Transport: n/a.
- Atomicity/Integrity: FAILS structurally — (1) semantic abuse of a NOT NULL FK (the defect class this
  directive's lineage names); (2) BOTH summary-engine paths wipe the table TENANT-WIDE on every import
  finalize (JS :245 + RPC line 31) — revenue rollups would be destroyed unless re-materialized in-cascade
  AND admin backfill routes would still destroy them out-of-cascade.
- REJECTED (SR-34: that is a masking pattern).

**Option B: new domain-agnostic rollup table `summary_rollups`** (OB-237 family extension)
- Columns (semantic, Korean-clean): `id, tenant_id NOT NULL, period_id uuid NULL FK, summary_date date NULL,
  data_type text NOT NULL (namespace), entity_id uuid NULL FK, dimension_role text NULL (recognized semantic
  role), dimension_member text NULL (member value — tenant DATA, not code vocabulary), metrics jsonb NOT NULL,
  row_count int, computed_at`. RLS tenant-isolation (intelligence_artifacts precedent).
- Scale: YES — row counts = periods × dimension members (small by construction). 10x data → same rollup rows.
- AI-first: dimension_role/dimension_member carry recognition output; zero field names in code.
- Atomicity: writer deletes ONLY its own namespace (`tenant_id` + `data_type` family) then inserts — idempotent
  replace without wiping anyone else's rows; immune to the summary-engine wipe (different table).
- Cost: a migration (HALT-3 pause for architect SQL Editor application; independent objectives proceed).

**Option C: overload `summary_artifacts_fine` namespaces** (staff_rollup precedent)
- REJECTED: same borrowed-entity abuse as A, plus no committed DDL exists for the table (schema drift), plus
  key collisions in a shared pseudo-data_type namespace (P0 flag).

**CHOSEN: B.** Namespaces written by the Revenue materializer: `revenue_period` (one row per period; metrics =
measure totals keyed by resolved display labels + machine keys), `revenue_entity_period` (entity × period),
`revenue_dimension_period` (dimension_role × dimension_member × period). Sub-day grains: not derivable for BCL
(monthly snapshots) — named residual, same class as OB-237 staff/patterns residual.

## DECISION 3 — Derivation + cascade integration (single writer, zero reimport, wipe-safe)

**Option A: read-time aggregation / RPC-at-query-time** — REJECTED: violates the MSP invariant verbatim.

**Option B: one JS materializer, called from BOTH the import finalize cascade and the activation endpoint**
- `materializeRevenueRollups(sb, tenantId)`: resolve roles (Decision 1) → derive from `committed_data` via
  paged NARROW projections (PostgREST `row_data->>field` — only resolved fields cross the wire, never whole
  payloads) + entity-attribute join for dimensions carried on entity rows → delete-own-namespace + bulk insert.
- Cascade hook: finalize-import, after `runSummaryEngine`, gated on `isRevenueEnabledForTenant()`, fail-caught
  and loud, off the import critical path (same pattern as insights step 5). Activation = the same function
  invoked once when the entitlement flips ON (single cascade, no parallel writer — directive §3.2).
- Scale test: BCL 510 rows trivial; Sabor-class 263K = ~264 narrow paged reads, one-time activation cost
  (Progressive Performance: paid once); Enterprise (5M+) needs a SQL write-time reduce — NAMED RESIDUAL
  (compute_summary_artifacts precedent exists; not shipped now because CC cannot iterate on SQL it cannot
  execute — SR-44 — and no proof tenant needs it).
- Atomicity: delete+insert per namespace; failure leaves prior namespace rows absent → C2 absence on surfaces
  (truthful), re-run heals. Idempotent re-run = identical rows (no-op effect), logged.

**Option C: extend the Summary Engine itself to emit dimension/period rollups**
- REJECTED: touches the shared engine's write set for all tenants (DD-7 risk for Finance/MIR), and the engine
  is numeric-only by contract; revenue rollups are role-driven (need recognition), engine is recognition-free
  by design (Decision 158 split: engine sums everything; ROLES are resolved at serving/materializer layer).

**CHOSEN: B.**

**Insight-wipe companion decision (O4):** revenue insights are written by a deterministic writer with
`source='revenue-insight'`, deleting only its own source before insert. The existing `generateInsights()` wipe
is scoped `.eq('source','insight-engine')` — behavior-neutral today (all 22 live rows carry that source; P0
evidence) and structurally ends the mutual-destruction hazard. Revenue insight classes are discriminated by
`context.kind` (momentum_shift | mix_shift | concentration_alert | incentive_yield_outlier), NEVER an
artifact_type enum (table contract: free-form prose). All four classes are rank-based deterministic
comparisons — zero tuning constants (HF-303 discipline): ranked deltas, ranked share shifts, ranked
divergence-from-median. No LLM, no thresholds.

## Minor decisions (registered)

- **Entitlement key:** `revenue_enabled`, default-OFF (licensable) — OB-252 `*_enabled` pattern; decoupled
  from billing keys; no collision with the half-dead `salesFinance` (P0 item 3).
- **Gates:** all six recipe steps from P0 item 3, including the functional API-route gate
  (`isRevenueEnabledForTenant`, PRISM precedent — closing for Revenue the gap Finance has) and the
  tenant-setup form. Menu group = new WORKSPACES entry with `featureFlag: 'revenue_enabled'` (Observatory
  toggle + entitlement-API validation derive structurally).
- **Activation trigger:** the entitlement PATCH route fires the activation materializer server-side when
  `revenue_enabled` flips false→true (fail-caught; activation state readable). A capability-gated
  `POST /api/revenue/activate` allows manual (re-)runs and PG-2 evidence capture. Both call the ONE
  materializer function.
- **Serving route:** `POST /api/revenue/data` `{mode, ...}` — session-derived tenant (`resolveCallerTenant`),
  entitlement-gated, scope-honoring; every mode reads `summary_rollups` (+ `entity_period_outcomes` /
  `period_outcomes` sentinel for Incentive Yield). Few-row reads; zero committed_data access at render time.
- **AP-17 share set (bounded, honest):** `recognize()`, `summary-read.ts` helpers consumed as-is; extract
  `buildTimelineResponse` + pure math helpers (`n/round2/makeBuckets/weekIndex/percentileRank`) from the
  financial route into `lib/serving/` as a PURE MOVE (financial route imports them back; DD-6 pre-SHA + diff,
  DD-7 build + behavior check). The 10 other Finance aggregators stay put — Revenue's grains differ (P0 map);
  copying route-handler code is prohibited and none is copied.
- **Surfaces:** ds003 component library (NOT hand-rolled Finance markup), Layer-2 `--vl-*` tokens only,
  bilingual via `isSpanishLocale()` from birth, persona density via DensityGate, C2 `StructuredAbsence`
  component (named role + named reason). Run-rate on Pulse = labeled arithmetic pace (current vs trailing
  periods for month-snapshot tenants) — no ML claims.
- **Incentive Yield honesty:** yield = revenue per incentive dollar per entity-period (both sides materialized).
  Component/plan decomposition is on the COST side (component payout composition per revenue dollar);
  component-level revenue attribution does not exist in the data and is rendered as an explicit absence,
  not simulated.

## GOVERNING PRINCIPLES EVALUATION (G1–G6)

- **G1 Standards:** SOC1/SOC2 access control (entitlement gates deny, not decorate — Decision 123 / DS-014);
  GAAP-consistent audit trail (audit_logs row per entitlement change — existing route behavior); numeric
  serving reads materialized sums (no float re-derivation; display-only arithmetic).
- **G2 Architectural embodiment:** the entitlement IS the middleware path-gate + API-route gate (not a hidden
  menu item); the MSP invariant IS the table design (surfaces physically read rollup tables); single-cascade
  IS one exported materializer function with two callers.
- **G3 Traceability:** directive → P0 → this ADR → migration file → completion report chain; an auditor can
  verify gate placement from `WORKSPACE_FEATURES` + layout + route source without reading page code.
- **G4 Disciplines:** cognitive load theory / DS-003 (reference frames, progressive disclosure, component
  diversity — enforced by the ds003 library's required props); Pareto/concentration analysis (Lorenz/CR-n,
  standard industrial-organization measures) for Concentration & Risk; robust rank statistics (rank-based
  deltas rather than parametric thresholds) for insights.
- **G5 Abstraction:** `summary_rollups` is domain-agnostic (dimension_role/dimension_member carry ANY
  recognized dimension — works for a Korean franchise tenant unchanged); the Revenue purposes describe
  structural roles, not domain words.
- **G6 Innovation boundary:** run-rate pace is labeled arithmetic; insights are deterministic comparisons —
  no speculative ML claims anywhere.

## ANTI-PATTERN SWEEP

AP-1/AP-2/AP-3/AP-4: no row data through HTTP bodies; materializer is server-side service-role, bulk insert;
narrow projections. AP-5/AP-6/AP-7: zero field dictionaries; recognition-driven; confidences from recognition.
AP-8: migration authored + committed, ARCHITECT applies (HALT-3), CC verifies live post-application. AP-9/10/11:
proof gates are rendered-browser/live-DB. AP-12: crypto.randomUUID / DB defaults. AP-13/AP-18/AP-19: SQL
Verification Gate before authoring the migration. AP-14: namespace delete+insert; failure → absence + re-run
heals. AP-15/16: activation surfaces progress/state; no navigation traps. AP-17: one materializer, one serving
route, shared pure modules; zero copied route code. AP-20/21/22: verbatim served-vs-derived reporting (PG-4).
AP-23: no sampling on any write path. AP-24: gates tested entitled AND un-entitled (PG-1 vs PG-3). AP-25:
display-only arithmetic on materialized sums; no financial mutation in serving. AP-26: no signal registries;
`data_type`/`context.kind` values are open strings written and pattern-read, no register-then-emit gate.
Rule 27/28: no LLM prompt emits registry vocabulary here (purposes are free-form by design). Rule 30: Layer-2
tokens; no hardcoded palette.

## Scale analysis (Rule 25)

| Volume | committed rows | rollup rows written | activation cost | serving cost |
|---|---|---|---|---|
| BCL today | 595 | ~6 + 510 + (dims×6) ≈ 600 | seconds | 1–510-row reads |
| 10x | 6K | ~6K | seconds | same (row count = grain, not volume) |
| Sabor-class | 263K | ~2.5K | ~264 narrow paged reads, one-time | same |
| Enterprise 5M+ | 5M | bounded by grain | NAMED RESIDUAL: SQL write-time reduce (RPC precedent exists) | same |

Serving never scales with raw volume — that is the MSP point.
