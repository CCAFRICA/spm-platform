# OB-222 — Filtered Aggregation: Per-Row Categorical Resolution — Completion Report

*Branch: `ob-222-filtered-aggregation` · 2026-06-19 · DO NOT MERGE (SR-44)*

---

## 0. Headline finding (directive §0.3 was stale)

OB-222's premise — "the engine cannot filter during aggregation; the evaluator does NOT handle
`filter` or `aggregate` as prime nodes" — is **incorrect against `main` (`ab280f89`)**. Verified in
live code:

| §0.3 claim | Reality |
|---|---|
| evaluator has no `filter`/`aggregate` | `intent-executor.ts:270` `filter` prime + `:302` `aggregate` (sum/count/avg/min/max) |
| engine can't filter | `legacy-intent-to-dag.ts:698-755` builds `filter→aggregate` chains from `{field,operator,value}` |
| `resolveColumnFromBatch` has no filter param, 3-arg callers | `route.ts:1638` is `(column, entityId, filters?, reduction?)`; HF-226/227 added `filters[]` + 7 reductions |
| primes unreachable | `route.ts:2783` sets `activeRows` to the entity's raw rows → primes evaluate in production |

**Filtered sum and filtered count already worked end-to-end.** Building the directive's hypothetical
`{reference, filter}` resolution path would have created a **second** filtered-aggregation mechanism →
**HALT-DUP** (directive §3.7) / AP-17. Per the ADR (`docs/design/OB-222_ARCHITECTURE_DECISION_RECORD.md`,
committed before implementation), I chose **Option B**: use the existing primes, fill the one genuine gap
(binding-level `count`), verify the capability with tests, and teach the interpreter to emit the primes.

---

## 1. What shipped

**Phase 1 — engine (non-duplicative, additive).** Commit `f1ff7eb6`.
- `convergence-bindings.ts`: `'count'` added to the `reduction` union (distinct from `distinct_count`).
- `resolveColumnFromBatch` (`route.ts`): a `reduction==='count'` branch returns the number of rows
  passing the binding filters (`field:"*"` ⇒ pure row count, with first-non-empty-batch selection).
  Placed **before** the numeric found-gate so 0 qualifying rows is a valid `0`, not `null`. **Byte-identical
  for every other reduction** (the `sum`/`snapshot`/… switch is untouched).
- Tests (`__tests__/filtered-aggregation.test.ts`, 12, all pass) via the public `evaluate()` surface.

**Phase 2 — interpreter (the real gap).** Commits `52950df0` + `d84b23bd`.
- `generatePromptGrammarSection()` (`prime-grammar.ts`, the canonical LLM prompt called by
  `anthropic-adapter.ts`) gains an **ENGINE AGGREGATION MODEL** section + **SC-07/08/09** illustrations,
  using the engine's real `filter→aggregate` vocabulary. The prompt previously listed `filter`/`aggregate`
  in the prime table but **never illustrated them** — so the LLM emitted the §0.1 defect (a `conditional`
  on an aggregate-level category). Additive: SC-01/04/05/06 + the `PRIME_GRAMMAR`-derived table unchanged.
- **Validator fix (`d84b23bd`, from adversarial verification §3):** `validatePrimeTree` now reads a
  filter's operator from `predicate.operator` (was `obj.op`), so the `filter→aggregate` DAGs the prompt
  emits actually pass validation instead of being rejected as `op_unknown`. Without this, Phase 2 would
  be counterproductive.

---

## 2. Per-phase evidence (pasted)

### resolveColumnFromBatch — the count branch
```ts
// OB-222: a 'count' reduction over field "*" counts qualifying ROWS, not a column's values, so
// column-presence batch selection does not apply — use the entity's first non-empty batch.
if (!entityRows && reduction === 'count' && (!column || column === '*')) {
  entityRows = firstNonEmptyRows;
}
...
// OB-222: 'count' reduction returns the number of rows that passed the filter ... never returns null
if (reduction === 'count') {
  const matched = entityRows.length - filteredOut;
  ...trace...
  return matched;
}
```

### Unit tests
```
✔ filter -> aggregate(sum) yields the filtered sum, NOT the full sum
✔ aggregate(sum) with NO filter yields the full sum (unfiltered baseline)
✔ filter matching ALL rows is byte-identical to the unfiltered sum
✔ filter with zero matches yields 0 (empty active set)
✔ filter -> aggregate(count) counts qualifying rows
✔ aggregate(count) with no filter counts all rows
✔ conditional count pattern: filter(condition) -> count, times a per-unit amount
✔ category-differentiated rates: add(multiply(filtered_sum_A, rateA), multiply(filtered_sum_B, rateB))
✔ PARTITION PROPERTY (SR-38): sum of per-category filtered sums === unfiltered total
✔ PARTITION PROPERTY for count: sum of per-category counts === total row count
✔ string filter value matches string row value; numeric filter value matches numeric row value
✔ numeric column with mixed string fields: filtered sum parses only matching numeric rows
ℹ tests 12 ℹ pass 12 ℹ fail 0
```
Plus `filter-prime-validation.test.ts` (6, all pass): SC-07/SC-08 pass `validatePrimeTree`; unknown/missing
filter operator rejected; all 7 grammar operators validate; aggregate/arithmetic regression-clean.
Full calculation suite: **47 pass / 0 fail** (was 41 pre-OB-222).

### Interpreter prompt (additive — render smoke test)
```
OK ENGINE AGGREGATION MODEL | OK CATEGORY-DIFFERENTIATED RATES | OK CONDITIONAL COUNT
OK TEMPORAL ADJUSTMENT | OK SC-07/08/09 | OK PER-ROW vs PER-ENTITY
OK temporal_adjustment | OK per_transaction_reversal | OK SC-01 (existing intact) | OK prime table
```

### BCL regression (§3.6)
```
entity-components checked : 510
Σ(per-row) === rawOutcome : 510/510
round0(Σ) === storedPayout: 510/510
RESULT: PASS — every additive entity-component reconciles
```
BCL has no filtered/count components → `sum` path byte-identical → stored engine total **$312,033**
preserved (per-component storedPayout reconciles 510/510). (Note: BCL ground-truth *expected* grandTotal
is 321,381 — a separate known-gap figure, unaffected by this OB.)

### Build / scanners
```
tsc --noEmit            : exit 0
verify-korean-test.sh   : PASS (zero hardcoded legacy primitive-name literals)
no-developer-numbers    : clean
npm run build           : exit 0
```

---

## 3. Adversarial verification (5 independent skeptics) — and the defect it caught

Each agent tried to *refute* a distinct correctness claim by reading the live code (`git show ab280f89`
vs HEAD). Verdicts:

| Dimension | Verdict | Severity |
|---|---|---|
| Backward-compat (non-count byte-identical) | **confirmed** | none |
| HALT-DUP (engine already capable, reachable, no 2nd path) | **confirmed** | none |
| Partition property + count correctness | confirmed on code; test-claim **overstated** | minor |
| Prompt-correctness (filter→aggregate emitted shapes validate) | **REFUTED → fixed** | major |
| OB-217 attribution safety (filtered = safe non-attributable) | **confirmed** | none |

**The major finding (and the fix):** the Phase-2 prompt instructs the LLM to emit `filter→aggregate`
DAGs, but `validatePrimeTree` **rejected every filter node** as a critical `op_unknown` violation —
`PRIME_GRAMMAR.filter` declares `ops:[eq,neq,…]` so the op-check read `obj.op`, but a filter carries its
operator at `predicate.operator`. So `ai-plan-interpreter` would have *thrown* on exactly the patterns
OB-222 enables (latent until Phase 2 made filter emission load-bearing). Reproduced empirically
(`SC-07 → valid:false op_unknown`). **Fixed** in commit `d84b23bd`: `validatePrimeTree` reads the
operator per prime (`predicate.operator` for filter, `obj.op` otherwise) — which also makes the filter
operator *actually validated* for the first time. New tests (`filter-prime-validation.test.ts`, 6):
SC-07/SC-08 now PASS validation; unknown/missing operator rejected; aggregate/arithmetic regression-clean.

**Minor (partition-count):** the agent correctly noted the unit tests exercise the **prime path**
(`evaluate()` / `rowMatchesPredicate`) directly; the binding-level `count` branch in `resolveColumnFromBatch`
(a private closure, `rowMatchesFilters`) is its **deterministic mirror**, verified by code inspection, not
a direct unit test. Also observed (pre-existing, out of scope): two predicate implementations
(`rowMatchesPredicate` vs `rowMatchesFilters`) are duplicated — they currently agree.

---

## 4. OB-217 attribution finding (Residual #3 — checked, documented)

`walkDag` (`per-row-attribution.ts:146`) handles `reference` + `aggregate(sum)` but has **no `filter`
case**. A `multiply(filter→aggregate(sum), rate)` DAG therefore yields **no additive term** → the
component is **non-attributable**: SAFE (no wrong per-row traces; SR-38 gate not engaged), but no
per-transaction drill-down yet. Extending attribution to filtered components needs `AdditiveTerm` to
carry the filter predicate AND `collectAttribRowsForColumn` to apply it so SR-38 still holds. **Deferred**
(BCL has no filtered components → no ground truth to regression-test a filtered-attribution path; risking
the proven SR-38 gate is not warranted). Documented residual.

---

## 5. Substrate disciplines
- **Korean Test:** filter is `{field, operator, value}` structural params; engine never knows the
  meaning. Prompt illustrations use example field names (as the existing SCs do) — not engine code.
- **Decision 158:** `String(rowVal) === String(value)` is a deterministic comparison, not an AI decision.
- **No registry / Rule 27:** prompt vocabulary derives from the single `PRIME_GRAMMAR` declaration; no
  attribute taxonomy, no switch on field types (HALT-REGISTRY respected).
- **No duplicative path / AP-17:** one `evaluate()` surface; one extended `resolveColumnFromBatch`.
- **SR-38:** partition property proven by construction + tested.
- **No SQL plan corrections:** platform re-interprets on re-import (§0.2).

---

## 6. SHA / PR
Commits: Phase 0 `c017752d` (directive+ADR) · Phase 1 `f1ff7eb6` (engine+tests) · Phase 2 `52950df0`
(prompt) · Phase 2 fix `d84b23bd` (validator, from adversarial verification).
**PR #554 — https://github.com/CCAFRICA/spm-platform/pull/554**. DO NOT MERGE — SR-44.

---

## 7. ARTIFACT SYNC
```
ARTIFACT SYNC
MC: Filtered aggregation: ENGINE GAP -> NOT A GAP (already implemented via filter+aggregate primes,
    reachable in production; verified, not rebuilt). Binding-level 'count' reduction: ADDED.
    Interpreter: computational model awareness ADDED (filter->aggregate illustrations).
    Category-differentiated rates: PATTERN SUPPORTED (engine pre-existing + interpreter now emits).
    Count-based operations: PATTERN SUPPORTED (engine pre-existing + interpreter now emits).
    Temporal adjustment: INTERPRETER AWARENESS added (engine built in OB-218).
REGISTRY: Calculation Engine -> resolveColumnFromBatch extended with 'count' reduction (not duplicated).
          Prime grammar prompt -> filter->aggregate usage guidance + 3 illustrations.
BOARD: Engine: binding-level filtered count. Interpreter: three structural patterns taught.
SUBSTRATE: Korean Test (structural params), Decision 158 (deterministic filter), SR-38 (partition
           property proven+tested), no registry, no duplicative path (HALT-DUP avoided), no SQL.
NEW RESIDUAL: filtered components are non-attributable (per-row drill-down) until walkDag gains a
           filter-aware term; safe (no wrong traces). directive §0.3 stale — corrected in ADR.
```

---

## 8. Out of scope / residuals (per directive §6/§6A)
- SQL plan corrections — none (platform self-corrects on re-import).
- MIR re-import + calculation — architect-side post-merge through the improved interpreter.
- Per-transaction attribution for filtered components — documented residual (§4).
- OB-214 compatibility — the three prompt patterns are prompt content; an agent wrapper inherits them.
