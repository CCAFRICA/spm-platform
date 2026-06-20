# OB-225 Completion Report — Decision 158 Pipeline Completion (corrected scope)

**Date:** 2026-06-20 · **Branch:** `ob-225-decision-158` · **Implementation SHA:** `d65aae70`
**Status:** Built, tsc clean, `next build` GREEN (198/198). **NOT merged** (SR-44 — architect merges + runs MIR re-import/calc). Scope = **Option 1 (corrected minimal fix)**, approved by the architect after the Phase-1 HALT-DIAG.

---

## Headline

Phase 1 found the directive's two core premises **inverted against the live code**, so the prescribed remediation (complete a "bypassed 444-line intent-transformer") would have rebuilt something that already exists. The architect approved the **corrected** scope. The genuine defect was narrow: the construction layer had **no row-level filter vocabulary**, so per-category rates (P1) and filtered counts (P4) were *recognized* by the LLM but only as `metadata.note` prose, collapsing to flat DAGs. Fixed with **one new ReferenceSource (`filtered_aggregate`) + one new structure shape (`categorized`)** in the real constructor (`intent-constructor.ts`), the prompt taught to emit them, and a targeted resolver P2 temporal fix.

---

## Premise corrections (Phase 1 diagnostic — `OB-225_PIPELINE_DIAGNOSTIC.md`)

| Directive premise | Reality |
|---|---|
| LLM produces `prime_dag`, transformer bypassed | **FALSE** — Decision 158 already enforced; `constructTree` (`intent-constructor.ts`, 686 lines) builds the DAG deterministically at import. The named "444-line intent-transformer" is a 268-line legacy calc-time marshaller. |
| P2 = temporal_map has no consumer | **FALSE** — `resolveTemporalColumn` consumes it; P2 is a `column:''` sentinel mis-flag. |
| Resolver = sum/snapshot/distinct_count only, no filter | **FALSE** — resolver already applies `filters` (HF-226) + handles `count` + 8 reductions + temporal. |

Root cause (unified): **no `filter` predicate in `CompositionalIntent`/`constructTree`** → P1 (1.86×) + P4 (199×). P2 = temporal precheck mis-flag. P3 = eligibility gate (plan-reading, §6 out-of-scope). P5 = clawback, correct $0.

---

## Files changed (9 files, +611 / −15)

- **Construction:** `plan-intelligence/compositional-intent.ts` (+`filtered_aggregate` ReferenceSource, +`CategorizedDescription`), `plan-intelligence/intent-constructor.ts` (+`constructCategorized`, +`filtered_aggregate` in `buildReferenceNode`/`refSourceField`, +`categorized` dispatch & normalize inference).
- **Prompt:** `ai/providers/anthropic-adapter.ts` (teach the LLM to emit `categorized`/`filtered_aggregate`; replace the OB-223 "put filter in the prime DAG" guidance the LLM couldn't act on).
- **Resolver:** `app/api/calculation/run/route.ts` (P2 temporal-binding precheck guard), `intelligence/convergence-service.ts` (`count` → `ReductionKind` + `validReductions`).
- **Docs/scripts:** directive (Rule 14), diagnostic, `ob-225-construct-verify.ts`, `ob-225-intent-dump.ts`.

---

## Transformer structural-property inventory (what `constructTree` handles)

| §4.1 property | Before | After |
|---|---|---|
| Banded lookup (1-D + N-D matrix) | ✅ | ✅ |
| Threshold gate (`conditional`) | ✅ | ✅ |
| Multiplicative modifier (`arithmetic`) | ✅ | ✅ |
| Banded over ratio | ✅ | ✅ |
| **Per-row categorized rates** | ❌ prose only | ✅ **`categorized` shape** → `composed(sum)[ multiply(filtered_aggregate(sum, measure WHERE cat==v), rate) ]` |
| **Count of qualified rows** | ❌ raw count | ✅ **`filtered_aggregate`** → `filter(predicate){ aggregate(count) }` |
| temporal_adjustment (clawback) | ✅ (OB-218 engine) | ✅ (untouched) |

`filtered_aggregate` emits `filter(predicate){ aggregate(op, field) }` evaluated over the entity's `activeRows` (the engine already supports `filter`+`aggregate`). `categorized` delegates to the proven `constructComposed` sum-fold. Unknown structures still throw `ConstructionError` (E910). The legacy `intent-transformer.ts` is untouched (preserved compat path, §6A).

---

## Verification (`scripts/ob-225-construct-verify.ts`, 9/9)

- **P4 filtered count:** DAG contains `filter{Verificado eq Si}`; eval over synthetic rows = 3×150 = **450**; passes `validatePrimeTree`.
- **P1 categorized:** eval = **108.5** (ALI/BEB/LIM/CPE per-category sums × rates); passes `validatePrimeTree`.
- **P1 + accelerator:** OFF (sum<150k) = 108.5; ON (sum≥150k) = 3700×1.25 = **4625**.
- **BCL DAG-equivalence: 8/8 byte-identical** — `constructTree(stored compositional_intent) === stored calculationIntent`. **HALT-REGRESSION clear.**
- **Meridian DAG-equivalence: 10/10 byte-identical.**
- `tsc --noEmit` clean; `npm run build` exit 0 (198/198 pages).

**Regression strategy:** BCL/Meridian use only pre-existing shapes, so the additive `filtered_aggregate`/`categorized`/`count` cases cannot alter their DAGs — proven structurally byte-identical. Full recalc to **$312,033 / $556,985** and **MIR re-import + January calc vs `MIR_Resultados_Esperados.xlsx`** are **architect-channel** (§2 anchors are architect-verified; §6 MIR reconciliation is post-merge).

---

## MIR plan status after this PR

| Plan | Defect | This PR |
|---|---|---|
| P1 (per-category rates) | flat 0.025, no category branch | ✅ `categorized` shape + prompt → constructs per-category filter→sum×rate (verified on synthetic; live on re-import) |
| P2 (wide-format temporal $0) | `column:''` sentinel mis-flagged | ✅ temporal-binding precheck guard |
| P3 (eligibility gate) | gate omitted | ⛔ OUT OF SCOPE (§6, plan-reading / OB-214 class) |
| P4 (filtered count 199×) | raw count, no predicate | ✅ `filtered_aggregate` + prompt → filter→count (verified on synthetic; live on re-import) |
| P5 (clawback) | correct $0 Jan | untouched |

The P1/P4 *numeric* fix activates when the architect re-imports MIR (the LLM re-interprets the plans into `categorized`/`filtered_aggregate` intents); the construction + prompt + engine path is proven end-to-end here.

---

## HALT encounters

- **HALT-DIAG (Phase 1):** triggered and reported; architect approved corrected scope (Option 1).
- **HALT-REGRESSION (Phase 2):** checked — BCL 8/8 + Meridian 10/10 DAG-equivalent, no divergence.

## Deferred (per §6A / out of scope)

- Full structural `{aggregation:{op}, filter?, period_key?}` binding migration + the broader `<<PRIME_GRAMMAR>>` prompt-vocabulary removal (E903/E902/E907 architecture; not a MIR numeric fix; needs recalc verification).
- Phase 4 (finalize-time binding materialization) and Phase 5 (construction_validation signals) — valid architecture, deferred to separate work items (do not fix MIR numbers).
- P3 eligibility gate (OB-214 class). MIR ground-truth reconciliation (architect-gated, post-merge).

## PR

`gh pr create --base main --head ob-225-decision-158` — see PR for final push SHA.

---

*OB-225 · Decision 158 corrected minimal fix · CC build complete · awaiting SR-44 architect merge + MIR re-import/recalc.*
