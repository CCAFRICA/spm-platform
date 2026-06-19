# OB-217 — Architecture Decision Record

*Per CC_STANDING_ARCHITECTURE_RULES.md §B. Committed BEFORE implementation.*
*Branch: ob-217-per-transaction-substrate · 2026-06-18*

---

## Problem

Store a per-transaction calculation trace for every additively-decomposable component, so
`calculation_traces` (live schema, 0 rows since inception, no writer called) is populated with
per-row contributions that reconcile exactly to the entity-level result. This is the substrate
for audit drill-down, disputes, rep transparency, and clawbacks.

---

## LIVE-CODE DEVIATIONS FROM THE DIRECTIVE (read fresh from HEAD per §0)

The directive was drafted from a stale mental model. Six material facts differ from live code.
All are handled structurally; none are worked around. Surfaced here per Prove-Don't-Describe.

| # | Directive assumption | Live reality (HEAD) | Resolution |
|---|---|---|---|
| D-1 | `writeCalculationTraces` in `run-calculation.ts` | It is in `web/src/lib/supabase/calculation-service.ts:443`, 0 callers, uses the **anon/browser** client (RLS) | Extend it: add `committedDataId`/`transactionRef` fields + an **optional service-role client** param; call it from the calc route with the route's service-role client |
| D-2 | Results written by `writeCalculationResults`, which returns the id | The calc route (`run/route.ts`) writes results **inline** (2913-2961), bulk, **no `.select()`** — `calculation_results.id` is never captured. `calculation_traces.result_id` is **NOT NULL FK** | Add `.select('id, entity_id')` to the inline insert → build `entity_id → result_id` map → write traces AFTER the insert |
| D-3 | `row.id` (committed_data.id) available at the seam | committed_data is SELECTed without `id`; grouping keeps only `row_data` | Add `id` to the three committed_data selects; build a **parallel** `attribRowsByBatch` (id+row_data+metadata) keyed identically to `dataByBatch` — existing aggregation path untouched |
| D-4 | `row_data` holds semantic keys; identifier columns reachable from binding | `row_data` = original headers + `_sheetName`/`_rowIndex` only. Identifier roles live in sibling `committed_data.metadata.field_identities` + `metadata.entity_id_field`. Convergence bindings carry **no** transaction-ref role | `transaction_ref` extracted structurally from `metadata.field_identities`: a column with `structuralType==='identifier'` that is **not** `entity_id_field`; else null (nullable per D2 of directive) |
| D-5 | Components use legacy intent vocabulary (`operation: scalar_multiply / conditional_gate / bounded_lookup_*`) | **Every** BCL & CRP component is `componentType: 'prime_dag'`; `calculationIntent` is a **PrimeNode DAG** (`prime: conditional/arithmetic/compare/reference/constant`). The legacy `operation` vocabulary is DEAD in these tenants. The directive's `classifyAttributionPattern` would mark **everything** non-attributable → traces stay empty (DoD failure) | **Classifier rewritten to analyse prime DAGs** (HALT-PATTERN surfaced + resolved). See "Attribution model" below |
| D-6 | BCL = `bounded_lookup_2d` (Pattern C); CRP Plans 1+3 calculate (PASS) | BCL = nested `conditional`→constant trees (Pattern C) **plus** `arithmetic.multiply` (Pattern A "Productos Cruzados"). **CRP is wiped**: `input_bindings: []`, 0 committed_data, `calculation_results count=0` — cannot calculate | Prove the substrate on **BCL** (exercises Pattern A + Pattern C in one tenant; $312,033 regression intact). CRP/Pattern-B live proof **deferred** (no data) — Pattern B covered by unit logic + the self-validating gate |

---

## Options

**Option A — In-loop attribution + per-entity trace write inside the entity loop.**
- Rejected: `calculation_results.id` does not exist until the post-loop bulk insert; `result_id`
  is NOT NULL FK. Cannot write a trace inside the loop.

**Option B — Accumulate per-row contributions during the loop; write traces after the results
insert (with captured ids).** CHOSEN.
- Scale: ✅ rows already held in `dataByBatch` for the whole calc; references add no order-of-magnitude
  memory. Traces chunk-inserted (500). Streaming-per-entity is a noted residual for enterprise scale.
- AI-first: ✅ classifier is structural over the prime vocabulary + binding columns. Zero column-name /
  language / tenant literals. Korean Test clean (the gate bans only 5 legacy primitive literals; none used).
- Transport: ✅ no row data over HTTP; server-side service-role bulk insert.
- Atomicity: ✅ traces written strictly AFTER results commit; attribution failure cannot corrupt results
  (results already persisted). Per-row write wrapped so it never blocks the calc response.

**Option C — New `transaction_traces` table.** Rejected by directive D1 (extend `calculation_traces`).

---

## Attribution model (prime-DAG, self-validating)

A component is per-row additively decomposable iff its outcome is `rate × Σ(per-row metric)`, possibly
under an entity-level gate. Implemented as:

1. `extractAdditiveTerms(primeNode)` — recursively collect candidate terms `{rate, metricField, kind}`
   where a term is `reference(F)` / `aggregate(sum,F)`, optionally wrapped in `multiply(constant, ·)`.
   `conditional` recurses into BOTH `then` and `else`. `constant` leaves yield no term.
   - 0 terms → **non-attributable** (Pattern C: e.g. BCL conditional→constant tiers).
   - ≥1 term, ungated → **additive** (Pattern A: BCL Productos Cruzados).
   - ≥1 term under a `conditional` → **qualified** (Pattern B: CRP Consumables — deferred, no data).
2. Per entity, per candidate term: per-row `contribution_i = rate × scale × value_i(column)` in
   **decimal.js** (Decision 122; column/reduction/filters/scale from the component's convergence binding).
3. **SR-38 gate (exact, replaces directive's 0.005):** `Σ contribution_i === rawOutcome` where
   `rawOutcome = entityRoundingTraces[idx].rawValue` (the engine's pre-rounding `intentResult.outcome`).
   Decimal distribution makes this EXACT (`rate × Σvalues === Σ(rate × value_i)`), not approximate.
   - Pattern A mismatch (with rows, nonzero outcome) → **HALT-SR38** (real bug: wrong column/rate/reduction).
   - Pattern B: the term whose Σ matches `rawOutcome` identifies the fired branch → emit; if none match,
     the entity took a constant/`else` branch → no per-row traces (correct, not a bypass).
4. **Rounding reconciliation:** the engine rounds once at entity level to **0 dp** ROUND_HALF_EVEN
   (HF-265). Verify `round_half_even(Σ, 0) === storedPayout` (`componentResults[idx].payout`). The raw
   per-row contributions sum to `rawOutcome`; rounded the engine's way they recover the stored integer.
   (Directive's `<0.005` tolerance was written without the 0-dp model; raw-vs-stored differ by up to 0.5.)

Why exact-to-rawOutcome (not to the stored integer): GAAP line-item presentation rounds the SUM once,
not each row. Per-row contributions are the unrounded components of that sum; reconciling to `rawOutcome`
proves the decomposition reconstructs precisely what the engine computed.

---

## Governing Principles Evaluation (Decisions 123 & 124)

- **G1 — Standard:** SOC1/SSAE-18 audit-trail reproducibility; GAAP ASC 820 line-item presentation;
  IEEE 754-2019 ROUND_HALF_EVEN (Decision 122).
- **G2 — Architectural embodiment:** the per-row sum **equals** the engine's raw outcome by construction
  (decimal distribution) — reconciliation is a structural property, not a test. `committed_data_id` FK
  makes each trace's provenance structural, not procedural.
- **G3 — Traceability:** Standard → `calculation_traces.committed_data_id` + `output.contribution/rate` →
  per-row formula. An auditor reconstructs payout → component → transaction from the row alone.
- **G4 — Discipline:** numerical analysis (Goldberg 1991, Kahan 1996) — round once at the aggregate,
  distribute is identity in exact arithmetic; rounding per row drifts.
- **G5 — Abstraction:** classifier operates on the domain-agnostic prime vocabulary + structural binding
  roles — survives a domain change (Korean Test).
- **G6 — Innovation boundary:** self-validating gate (Σ === engine raw outcome) is the audit evidentiary
  standard (Prove-Don't-Describe) applied at compute time.

Anti-Pattern Registry: AP-8/AP-13/AP-18 (migration executed + schema verified — architect SR-44),
AP-25 (decimal.js, not native number), AP-12 (crypto UUID — DB default), AP-23 (no sampling on the
attribution path — all rows). Zero violations.

---

## Scope of live proof

- **Pattern A + Pattern C:** proven on BCL (live data, bindings, $312,033).
- **Pattern B (qualified gate):** implemented + self-validating; **live proof deferred** — CRP wiped,
  MIR blocked (HF-302/303 + category-code, per directive OOS/residuals). Will prove on MIR/CRP when data
  is restored.
- **Migration application (SR-44) + live trace-write run:** architect step (DDL not appl’able via the
  service-role REST client). Pre-application, the module's math is proven against live BCL data by a
  dry-run that imports the real module and asserts Σ===rawOutcome (no schema dependency).

CHOSEN: Option B with prime-DAG self-validating attribution. REJECTED: A (FK ordering), C (directive D1).
