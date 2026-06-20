# OB-223 — Pipeline Pattern Diagnostic (Phase 1) + HALT-SCOPE

*Branch `ob-223-pipeline-pattern-resolution` · 2026-06-19 · diagnostic-first walk of 5 MIR patterns × 6 stages.*
*Tenant: Almacenes Mirasol (MIR) `972c8eb0-e3ae-4e4c-ad30-8b34804c893a`. DAGs read live via service-role.*

---

## 0-CORRECTION (2026-06-19, post-redraft) — two errors in the original diagnostic

While starting the redraft implementation I found **two material errors in this diagnostic that the
redraft inherited.** Correcting for the record:

1. **`convergence-service.ts` DOES contain the Stage-3 logic — the directive's ORIGINAL map was right.**
   My original claim ("3402 lines, zero abstain/count/temporal/role/filter") was a **`grep` artifact**:
   the file has a non-UTF8 byte, so plain `grep` silently treated it as binary and reported nothing.
   With `grep -a`: abstain (9), temporal (17), count (38), role (74), `findIncompleteBindings` (1949),
   `deriveNeededType`/`acceptableStructuralTypes` (1715-1760). **The Stage-3 fixes belong in
   `convergence-service.ts`, not `anthropic-adapter.ts`.** (The other original findings stand:
   `intent-transformer.ts` is legacy-only; composition is `.plus()` SUM; `scope` prime = entity-siblings;
   `detectTemporalColumnMap` is unwired.)

2. **Count-role acceptance (P3/§1.4) is ALREADY implemented.** `deriveNeededType` classifies a `count`
   op as `'categorical'` (convergence-service.ts:1753, explicit comment: "count is type-agnostic"),
   and `acceptableStructuralTypes('categorical')` accepts `attribute` (:1723). A genuine
   `aggregate(count)` node over an attribute column already binds. **P4 fails for a different reason:**
   its stored DAG is `arithmetic(reference × constant)` — a **bare `reference`**, which `deriveNeededType`
   classifies `'numeric'` (:1738 "bare reference → numeric") → correctly rejects the `Verificado`
   attribute. So P4 is an **interpreter-output-shape** problem (it should emit `aggregate(count)` with a
   filter, not a bare reference) → fixed by the interpreter prompt + RE-IMPORT, not a convergence change.

**Net re-frame:** most patterns fail because the **interpreter emits the wrong DAG shape** (scope vs
filter, bare-reference vs count-aggregate, missing `temporal_adjustment` modifier, separate accelerator
component). The engine + convergence are largely already capable (OB-218 clawback, OB-222 filter/count,
convergence count-acceptance). So the **primary lever is the interpreter prompt + re-import**
(architect-gated). The genuine *runtime wiring* gaps are narrower: temporal abstain→map (unwired),
clawback empty-binding bypass, and multiplicative composition. See the implementation report for the
corrected split.

---

## 0. Headline: HALT-SCOPE invoked (per directive §1.7)

The diagnostic found the fix surface **exceeds 12 distinct code-change sites across 5+ files**, that
**4 of 5 patterns require interpreter-prompt changes + a RE-IMPORT** (architect-gated, CC cannot
perform or verify), and — critically — that **the directive's predicted §2 fix map is materially
inaccurate**:

- **§2.1/§2.4 name `intent-transformer.ts` as the Stage-2 conversion site.** It is the **legacy** intent
  transformer (handles `linear_function`/`piecewise_linear`/`scope_aggregate`/`scalar_multiply`/
  `conditional_gate`). Prime-DAG `calculationIntent` (what all 5 MIR plans store) does **not** flow
  through it — DAGs are evaluated directly by `intent-executor.evaluate()`.
- **§2.3/§2.4/§2.5 name `convergence-service.ts` as the Stage-3 fix site.** That file (3402 lines)
  contains **zero** occurrences of `abstain`/`count`/`reduction`/`temporal`/`filter`/`role`/`reject`/
  `ground`. The binding-proposal + abstain + role/count logic lives in `anthropic-adapter.ts`; the
  temporal mechanism in `temporal-binding.ts`; resolution in `route.ts`.

Building the §2 fixes against the named files would be wrong. The corrected map is in §3. Because the
fixes are (a) mis-mapped, (b) >12 sites, (c) 4/5 re-import-dependent and CC-unverifiable (MIR calc +
re-import are architect-gated, SR-44), and (d) include a substantial blind-build (calc-time LLM value
grounding inside the proven convergence path), this OB is **halted at the diagnostic** for re-scoping,
exactly as §1.7 HALT-SCOPE prescribes.

---

## 1. Diagnostic table

| Pattern | S1 Interpreter | S2 Conversion | S3 Convergence | S4 Resolution | S5 Evaluation | S6 Composition |
|---|---|---|---|---|---|---|
| **P1** category rates | **FAIL** `scope` prime + separate accelerator | **FAIL** no scope→filter; DAG bypasses intent-transformer | **FAIL** binds `Monto_Total`→`Monto_Total`, no category/filter binding, no value grounding | **FAIL** sums ALL categories (`filteredOut=0`) | **FAIL** `scope` narrows to entity SIBLINGS, not category rows | **FAIL** accelerator→sum |
| **P2** temporal | PASS (`reference`) | PASS | **FAIL** `detectTemporalColumnMap` UNWIRED (no caller) → no temporal binding produced | PASS-if-bound (`resolveTemporalColumn` wired at route.ts:1436) | PASS | PASS |
| **P3** count | partial (`reference`×const) | PASS | **FAIL** count binding not produced for an attribute column (role/numeric gating in anthropic-adapter) | PASS-if-bound (count reduction exists, OB-222) | PASS | PASS |
| **P4** multiplicative | **FAIL** separate accelerator component | PASS | n/a | n/a | PASS | **FAIL** components SUMMED (`plus()`); 1.25 rounds to 1 (decimalPlaces:0) + added |
| **P5** clawback | **FAIL** no `temporal_adjustment` modifier (`mods=[]`) | PASS | **FAIL** no clawback binding path; ABSTAIN would abort | n/a | n/a (no modifier→Pattern D not triggered) | n/a |

P3 (Cobranza, ~219,632 PEN) is the working baseline (not in this table) — `reference` bound to a real
numeric column, summed. Confirms the pipeline works for the simple case.

## 2. Per-stage evidence (live)

**Stage 1 — stored DAGs** (`rule_sets.components.variants["0"].components[]`, queried live):
```
P1 7aeb8fd8  c0 "Comision por Categoria de Producto"  primes={arithmetic,scope,aggregate,constant}
             c1 "Acelerador por Volumen"               primes={conditional,constant,compare,aggregate}  ← separate component
P2 9a37ac39  c0 "Tabla de Bonos por Nivel..."          primes={conditional,constant,compare,arithmetic,reference}
P4 d9734365  c0 "Bono por cliente nuevo verificado"    primes={arithmetic,reference,constant}
P5 cc74d886  c0 "Ajuste por Devolucion (Clawback)"     primes={arithmetic,constant}  modifiers=[]  ← no temporal_adjustment
```

**Stage 2 — conversion** (`intent-transformer.ts:35-41`): handles only legacy ops
(`linear_function`/`piecewise_linear`/`scope_aggregate`/`scalar_multiply`/`conditional_gate`). Prime
DAGs are NOT routed through it → no scope→filter bridge exists; the `scope` prime reaches the evaluator.

**Stage 5 — evaluation** (`intent-executor.ts` `case 'scope'`): narrows `activeRows` to entity SIBLINGS
sharing a boundary attribute (self-excluded — "manager does not earn override on own revenue"). For P1's
per-ROW product category this is semantically wrong: it groups by entity peers, not by transaction
category. The interpreter used `scope` because the **compositional prompt forbids categorical structure
references** (anthropic-adapter.ts:493-506: *"DO NOT reference categorical entity properties … inside a
component's structure … that is VARIANT differentiation"*; :506 *"attribute … MUST NOT drive categorical
payout differentiation"*). Variants are per-ENTITY; P1 is per-ROW → no legal expression existed → `scope`.

**Stage 6 — composition** (`route.ts:2831`): `intentTotalDecimal = intentTotalDecimal.plus(rounded)` —
components are strictly SUMMED. `route.ts:2819` forces `decimalPlaces:0`, so the 1.25 accelerator rounds
to 1 and is added. (`priorResults[idx]` exists at :2832 → a component CAN read a prior component's output
via a `prior:N` reference — the substrate for accelerator-folding without an engine change.)

**Stage 3/4 — convergence** (real locations): binding proposal + abstain + role/count gating live in
`anthropic-adapter.ts` (NOT convergence-service.ts). Temporal: `detectTemporalColumnMap`/
`resolveTemporalColumn` in `temporal-binding.ts`; `detectTemporalColumnMap` has **no caller** anywhere
(grep) → unwired. `resolveTemporalColumn` IS wired at resolution (`route.ts:1436`) — so a temporal
binding, IF produced, resolves correctly; none is produced. Count reduction exists
(`resolveColumnFromBatch`, OB-222) — resolves IF a count binding is produced.

## 3. Corrected fix map (replaces directive §2) + site count

| # | Fix | Real site(s) (corrected) | Re-import? | CC-verifiable? |
|---|---|---|---|---|
| 1 | scope→filter bridge | `legacy-intent-to-dag.ts` / a DAG-normalization pass (NOT intent-transformer) | no | unit-test only |
| 2 | calc-time category value grounding (`__CONVERGENCE_RESOLVE__`) | `anthropic-adapter.ts` (LLM) + `route.ts` resolution + binding storage | no | NOT vs MIR |
| 3 | interpreter: per-ROW category filtering (vs variant-only) | `anthropic-adapter.ts` compositional prompt | **YES** | NO |
| 4 | accelerator folding (Option A) | `anthropic-adapter.ts`/`prime-grammar.ts` prompt | **YES** | NO |
| 4b | OR multiplicative composition (Option B) | `route.ts` entity loop + component model | no | unit-test only |
| 5 | temporal `detectTemporalColumnMap` → abstain wiring | `anthropic-adapter.ts` abstain path + `temporal-binding.ts` | no | unit-test only |
| 6 | count-role acceptance + count-binding production | `anthropic-adapter.ts` role/count gating | partial | unit-test only |
| 7 | clawback `temporal_adjustment` modifier | `anthropic-adapter.ts`/`prime-grammar.ts` prompt | **YES** | NO |
| 8 | clawback empty-binding acceptance | `route.ts` resolution + abstain | no | unit-test only |

**≥8 fix categories spanning `anthropic-adapter.ts`, `temporal-binding.ts`, `route.ts`,
`legacy-intent-to-dag.ts`, `prime-grammar.ts` → well over 12 distinct code-change sites.** Items 3, 4, 7
(and the grounding's verification) require RE-IMPORT + MIR calc — architect-gated, CC cannot verify.

## 4. Recommended re-scoping (the cascade Approach B tried to avoid is real but mis-located)

Split into verifiable vs architect-gated tracks:
- **OB-223a (CC-buildable + unit-testable, BCL-byte-identical):** scope→filter bridge (#1); count-role
  acceptance (#6); temporal abstain wiring (#5); clawback empty-binding acceptance (#8); engine
  multiplicative composition Option B (#4b) if chosen. Each conditional on new node-type/binding-key/
  modifier → BCL unaffected. Verified by unit tests; MIR-verified by architect post-merge.
- **OB-223b (interpreter prompt + RE-IMPORT, architect-driven):** per-row category guidance (#3),
  accelerator folding (#4 Option A), clawback modifier (#7). These change interpreter output → require
  re-import + MIR calc to validate. This is also where the OB-214 (self-correcting agent) signal lives:
  the interpreter producing `scope` (and omitting the clawback modifier despite OB-222 SC-09) is the
  vocabulary-drift OB-214 targets.
- **OB-223c (the risky one):** calc-time LLM value grounding (#2) — substantial new logic in the proven
  convergence path; should not be built blind (no MIR calc available to CC). Build with the architect
  able to verify, or via the Evaluate surface (user-confirmed bindings, §6 OOS) which removes the LLM
  call entirely.

## 5. Why HALT rather than blind-build
SR-34 (no bypass / structural fix) + "Prove, don't describe": CC cannot run the MIR calc or re-import, so
6+ of the fixes are unverifiable by CC. Blind-modifying the convergence/interpreter path (which every
tenant's calculation depends on) with zero ability to verify the result risks a silent cross-tenant
regression that BCL (which uses none of these patterns) cannot catch. The directive's own §1.7 HALT-SCOPE
exists for exactly this: the predicted scope was inaccurate and the real scope exceeds one safe pass.
