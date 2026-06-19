# OB-222 — Architecture Decision Record

*Filtered Aggregation — Per-Row Categorical Resolution · 2026-06-19 · committed before implementation (Standing Rules §B)*

---

## Problem

Plans that differentiate rates/rules by a **per-row categorical attribute** (product type, channel,
segment, region), that **count rows meeting a condition**, or that **reverse a prior calculation**
(clawback) must compute correctly. The directive (§0.1) asserts the engine "aggregates ALL rows
before evaluating" and "does not implement filter," so these patterns are "structurally impossible."

## Diagnostic finding (directive §0.3 is STALE — verified against live code)

The premise is **incorrect against `main` at `ab280f89`**. Filtered aggregation already exists and is
reachable in production:

| Directive §0.3 claim | Live-code reality (file:line) |
|---|---|
| "evaluator does NOT handle `filter` or `aggregate` as prime nodes" | `intent-executor.ts:270` `filter` prime (narrows `activeRows`) + `:302` `aggregate` prime with `count/sum/avg/min/max` |
| "engine cannot filter during aggregation" | `legacy-intent-to-dag.ts:698-755` already builds `filter→aggregate` chains from `{field,operator,value}` |
| "`resolveColumnFromBatch` … No filter parameter. All callers pass 3 args" | `route.ts:1638` signature is `(column, entityId, filters?, reduction?)`; HF-226/227 added `filters` (array of `{field,operator,value}`) + 7 reductions |
| filter/aggregate primes unreachable | `route.ts:2783` populates `activeRows: entityRowsFlat.map(r => r.row_data)` — entity raw rows ARE in the eval context |

**So:** filtered **sum** (`filter→aggregate(sum)`) and filtered **count** (`filter→aggregate(count)`)
already work end-to-end. The genuine gaps are: (a) the *binding-level* `resolveColumnFromBatch` lacks a
plain `'count'` reduction (it has `distinct_count`); (b) the interpreter prompt
(`prime-grammar.ts generatePromptGrammarSection()`) documents `filter`/`aggregate` in its prime table
but **none of its illustrations use them**, so the LLM emits the §0.1 defect (a `conditional` on an
aggregate-level category) instead of `filter→aggregate`.

## Options

**Option A — Implement the directive literally:** add a `filter`/`reduction` attribute to the
`reference` prime and a NEW resolution path in `evaluate()` that calls `resolveColumnFromBatch` from
the DAG.
- Scale 10x: ✅ · AI-first: ✅ · HTTP transport: n/a · Atomicity: n/a
- **Fatal:** creates a SECOND filtered-aggregation mechanism alongside the existing `filter→aggregate`
  primes → duplicative path (**HALT-DUP**, directive §3.7; AP-17 single-code-path). `resolveColumnFromBatch`
  is a closure inside the route handler — not reachable from the standalone evaluator without wiring a
  callback through the whole call chain. Rejected.

**Option B — Use the existing primes; fill only the true gaps (CHOSEN):**
1. Engine: add `'count'` to the `reduction` union (`convergence-bindings.ts`) + the switch in
   `resolveColumnFromBatch` — one function extended with an optional parameter value, byte-identical
   when `reduction !== 'count'`. No second function.
2. Interpreter: add an ENGINE AGGREGATION MODEL section + three illustrations (category-differentiated
   via `filter→aggregate(sum)`; conditional count via `filter→aggregate(count)`; `temporal_adjustment`
   modifier for reversals) to the canonical grammar prompt. Additive — existing illustrations untouched.
3. Tests: prove the EXISTING filtered-aggregation capability through the public `evaluate()` surface
   (filtered sum, filtered count, no-filter byte-identical, **partition property**), plus the new
   `'count'` reduction.
- Scale 10x: ✅ (per-entity row filtering, no new transport) · AI-first: ✅ (filter `{field,value}` are
  structural params, Korean Test) · Atomicity: n/a · **No duplicative path, no registry.**

**Option C — Build a dedicated filtered-aggregation engine module:** overbuild; rejected (the capability
already exists; C violates "fix logic not data" and adds a parallel pipeline).

## CHOSEN: Option B — because the engine is already capable; the disciplined work is to *verify* the
capability, fill the one real binding-level gap (`count`), and *teach the interpreter* to emit the
existing primes. REJECTED A (HALT-DUP / AP-17) and C (overbuild).

## Governing Principles (Decisions 123 & 124)

- **G1 — Standard:** GAAP line-item determinism + IEEE-754 ROUND_HALF_EVEN (Decision 122). Filtered
  aggregation must preserve the Deterministic Calculation Boundary.
- **G2 — Architectural embodiment:** the filter is `String(rowVal) === String(value)` over LLM-emitted
  structural params (Decision 158) — deterministic; the engine never decides *what* to filter.
- **G3 — Traceability:** prompt grammar derives from the single `PRIME_GRAMMAR` declaration → an auditor
  can trace "category-differentiation → `filter→aggregate` → evaluator" from docs alone.
- **G4 — Discipline:** relational algebra (selection σ then aggregation γ) — filter-before-aggregate is
  the canonical order; the **partition property** (Σ over a partition = total) is a set-theoretic identity.
- **G5 — Abstraction:** "filter rows by an attribute then reduce" is domain-agnostic (works for any
  categorical column in any domain) — no compensation vocabulary in engine code.
- **G6 — Innovation boundary:** no new primitive invented; reuses the proven prime grammar.

## Anti-Pattern check
- AP-17 (duplicate code paths): avoided — one `evaluate()` surface, one extended `resolveColumnFromBatch`.
- AP-26 / Rules 27-28 (no closed-vocabulary registry; prompt vocabulary derives from canonical registry):
  the prompt change adds usage guidance + illustrations to the grammar that already derives its prime
  table from `PRIME_GRAMMAR`. No hardcoded vocabulary list, no switch on attribute names, no taxonomy.
- AP-25 (decimal.js): filtered sums use the existing decimal.js `aggregate` path; `count` is an exact
  integer row count.
- No SQL plan corrections (§0.2 / §2): the platform fixes its own interpretation on re-import.

## Scale (Section E)
Filtering operates on a single entity's in-memory rows during its evaluation pass — O(rows-per-entity),
no new DB calls, no HTTP row transport. Works unchanged through "Large" (500K-5M); "Enterprise" needs
only the existing chunking. No regression to the per-entity loop's complexity.

## OB-217 attribution compatibility (Residual #3, checked in Phase 1)
`walkDag` (`per-row-attribution.ts:146`) handles `reference` + `aggregate(sum)` but has **no `filter`
case**. A `multiply(filter→aggregate(sum), rate)` DAG therefore yields **no additive term** → the
component is treated as **non-attributable** (SAFE: no wrong per-row traces; SR-38 gate not engaged) but
does not yet get per-transaction drill-down. Extending attribution to filtered components requires
`AdditiveTerm` to carry the filter predicate AND `collectAttribRowsForColumn` to apply it (so SR-38
still holds). Deferred as a documented residual to avoid risking the proven OB-217 SR-38 gate (BCL has
no filtered components → no ground truth to regression-test a filtered-attribution path).
