# OB-225 Phase 1 — Pipeline Diagnostic (read-only)

**Date:** 2026-06-20 · **Branch:** `ob-225-decision-158` · **Method:** 5-agent parallel read of the live pipeline + service-role JSONB extraction (`scripts/ob-225-intent-dump.ts`).

> **HALT-DIAG: TRIGGERED.** The construction layer handles MORE and DIFFERENT shapes than the directive documents, the named file is wrong, and the directive's two core premises are **inverted** against the live code. Full inventory below. **No Phase ≥2 code was written.**

---

## §0 Headline — both core premises are FALSE as stated

| Directive claim | Reality (file:line evidence) |
|---|---|
| "The LLM produces the `prime_dag` directly, bypassing the transformer" | **FALSE.** Active path: `plan-interpretation.ts:286` → `orchestratePerComponentInterpretation` → `plan_skeleton` + `plan_component`. The `plan_component` prompt asks for **only** `compositional_intent` and **forbids** tree emission (`anthropic-adapter.ts:485,650`). Deterministic `constructTree` (`plan-intelligence/intent-constructor.ts:73`, 686 lines) builds the DAG at import (`sci/plan-orchestration.ts:529`), persisted as `calculationIntent`. **Decision 158 is already enforced.** LLM-emits-DAG survives only in the retired `plan_interpretation`/chunking templates (not called by the orchestrator). |
| "`intent-transformer.ts` (444 lines) exists but is bypassed" | **Wrong file + wrong size.** `intent-transformer.ts` is **268 lines** and is a *legacy calc-time marshaller* (`PlanComponent → ComponentIntent`), not the constructor. The real Stage-2 constructor is `intent-constructor.ts` (`constructTree`). |
| "P2 = temporal_map produced but resolver has NO consumer" | **FALSE.** `temporal_map` **has** a consumer: `resolveTemporalColumn` (`temporal-binding.ts:67`) selects the period column, which flows through the same reduction switch. P2's real bug is the `column:''` sentinel for temporal bindings being **mis-flagged** `no_real_column_match` by the falsy-column precheck (`run/route.ts:2222-2227`) + period-key matching. |
| "Resolver consumption = sum/snapshot/distinct_count only" | Resolver handles **8** reductions (`snapshot/last/first/max/min/average/distinct_count/sum`, `run/route.ts:1764-1782`) **+ `count`** (separate early-return `:1748-1754`). Three *mismatched* enums for the one field (see §3). |

**Consequence:** the directive's prescribed Phase 2 ("complete the bypassed intent-transformer so deterministic code constructs the DAG") describes building something that **already exists**. Executing it literally would be misdirected and could destabilize the calc engine. The *intent* of the OB (make MIR's plans construct correctly via deterministic code) is right; the **diagnosis and prescription are mislocated**.

---

## §1 The real three-stage pipeline (corrected file map)

1. **Recognition (LLM):** `compensation/ai-plan-interpreter.ts` is a *post-LLM normalizer* (no prompt). The prompt lives in `ai/providers/anthropic-adapter.ts` `SYSTEM_PROMPTS` (`plan_skeleton` :440, `plan_component` :485) + the injected grammar from `calculation/prime-grammar.ts:449`. Active templates: `plan_skeleton` then per-component `plan_component`. Output: `compositional_intent` only (schema `plan-intelligence/compositional-intent.ts:161-191`).
2. **Construction (deterministic):** `plan-intelligence/intent-constructor.ts` `constructTree` (686 lines), at import (`sci/plan-orchestration.ts:529`). Dispatches on `structure.shape ∈ {banded_lookup, arithmetic, conditional, composed}`. Output persisted as `calculationIntent` (the prime DAG).
3. **Evaluation (deterministic):** at calc time, `calculation/intent-transformer.ts transformVariant` (legacy marshaller, carries the persisted prime tree through) → `intent-executor.ts executeIntent` → `legacy-intent-to-dag.ts componentIntentToDAG` (`isPrimeNode` short-circuit `:782-789`) → `evaluate(dag)`. Stage 3 proven (BCL $312,033 / 510/510).

**Construction-layer structural-property inventory (§4.1 mapping):**

| §4.1 property | Status in `constructTree` |
|---|---|
| Banded lookup / tiers (1-D + N-D matrix) | ✅ HANDLED (`constructBandedLookup`, most built-out; BCL 6×5 matrix proven) |
| Threshold gate | ✅ HANDLED (`constructConditional`, prime `conditional`+`compare`) |
| Multiplicative modifier | ✅ HANDLED (arithmetic `multiply`) |
| Banded over a ratio | ✅ HANDLED (ratio ReferenceSource + scale coherence) |
| **Categorized / per-row category rates** | ❌ **GAP** — no `filter` ReferenceSource; per-*entity* categories are pushed to `applies_to[]` (one component per category), but per-*row* category rates (filter→aggregate per value) **cannot be expressed**. |
| **Count of qualified rows (filter→count)** | ❌ **GAP** — `aggregate/count` exists but there is **no `filter` predicate** in `ReferenceSource`, so "count rows WHERE Verificado='Si'" cannot be constructed. |
| temporal_adjustment (clawback) | ✅ carried in `metadata.modifiers`; evaluated by the OB-218 clawback engine (degenerate `0*1` structure placeholder — must NOT be "fixed"). |

`ReferenceSource` vocabulary today (`compositional-intent.ts`): `metric, ratio, aggregate, scope_aggregate, cross_data, prior_component`. **No `filter`.** This single omission is the root of P1 and P4.

---

## §2 Live MIR/BCL intent shapes (`scripts/ob-225-intent-dump.ts`)

**JSONB path (directive's was wrong):** `rule_sets.components.variants[V].components[C].metadata.compositional_intent` (recognition) and `…components[C].calculationIntent` (runnable prime DAG). `components` is an object `{variants:[…]}`, not `variant_0`.

| Plan (rule_set) | compositional_intent declares | DAG built | GT vs actual | Root cause |
|---|---|---|---|---|
| **P1** category-commission (`f6b3f530`) | `metadata.note`: per-category rates **ALI .025/BEB .020/LIM .030/CPE .035**, accelerator gte 150000 ×1.25 | flat **single 0.025** rate, no per-category branch | 1,104,032 vs 593,117 (1.86×) | **No filter vocabulary** → per-category rates recognized in prose only |
| **P2** bono-cuota (`2f1e6434`) | `banded_lookup` over ratio `ventas_brutas/cuota_mensual` (wide-format temporal) | banded_lookup built | 0 vs 210,000 | wide-format temporal binding `column:''` mis-flagged `no_real_column_match` + period-key |
| **P3** cobranza (`c5a9ba96`) | `conditional` gt ratio 0.7 → 1.5% Monto_Cobrado | conditional built (correct) | 219,632 vs 148,306 | **eligibility gate (plan-reading) — OUT OF SCOPE §6** |
| **P4** cliente-nuevo (`331476f3`) | `metadata.note`: count rows WHERE **Verificado='Si'** ×150 | raw `count(Verificado)` no predicate | 1,759,800 vs 8,850 (199×) | **No filter vocabulary** → filter recognized in prose only |
| **P5** clawback (`b0c82b73`) | `temporal_adjustment` modifier; structure `0*1` placeholder | OB-218 clawback engine | 0 vs 0 ✅ | correct for January — do not touch |

**BCL regression anchor (must be preserved):** all 8 components use existing shapes — `banded_lookup` (1-D deposit tiers + 6×5 credit/portfolio matrix), `conditional` gate (regulatory eq 0 → $150), arithmetic `count×rate` (cross-products × 25/18). Adding a *new* `filter` shape does not alter these existing shapes → BCL DAGs unchanged by the corrected fix (verifiable by structural DAG-equivalence).

---

## §3 Resolver consumption (Phase 3 target)

- `resolveColumnFromBatch(column, entityExternalId, filters?, reduction='sum')` — `run/route.ts:1676`. Dispatch: `switch(reduction)` `:1764-1782` (8 cases) + pre-switch `if(reduction==='count')` `:1748-1754` + field-`'*'` selection `:1701-1705`.
- **Three mismatched reduction enums** for the same persisted field: `ReductionKind` (8, no count/temporal) `convergence-service.ts:115`; `validReductions` (8) `:1933`; `ConvergenceBindingEntry.reduction` (9, adds count) `convergence-bindings.ts:29`. Recognition can never *produce* `count`.
- `temporal_map` = separate channel (`temporal-binding.ts:15`), `resolveTemporalColumn :67` → reduction switch. Phase-3 `period_key?` subsumes it and removes the `column:''` sentinel that mis-flags P2.
- The binding already carries an (unused-by-construction) `filters?: [{field,operator,value}]` (`convergence-bindings.ts:56-60`) — the resolver does **not** apply it before aggregation today. This is the hook Phase 3 needs for P1/P4.

---

## §4 Finalization & signals (Phase 4/5 context)

- **Real finalize route:** `app/api/import/sci/finalize-import/route.ts` (HF-300/DIAG-071) — entity resolution + `entity_relationships` + **clears `input_bindings` to `{}`** + `createMissingAssignments`. The directive's `api/import/finalize/route.ts` does not exist.
- **Binding materialization happens lazily at CALC TIME** (`run/route.ts:300`, after `convergeBindings`), NOT at finalize. Calc-time LLM binding = `convergence-service.ts:2835` (`recognizeBindingsViaAI` → `getAIService().execute('convergence_mapping')`), triggered when `input_bindings` empty/stale. (Phase 4 would move this to finalize — an architectural change, not a numeric fix.)
- **Signals:** one canonical writer (`canonical-signal-writer.ts`). `comprehension:plan_interpretation` present and read by convergence. **No `construction_validation` signal exists** (Phase 5 would add it).

---

## §5 Corrected root cause & recommended scope

**Unified root cause:** `CompositionalIntent` (and therefore `constructTree`) has **no row-level filter/predicate vocabulary**. The LLM correctly *recognizes* per-category rates (P1) and filtered counts (P4) but can only record them as `metadata.note` **prose**, so the structured DAG collapses to a flat/unfiltered form. P2 is a separate temporal-binding `column:''` mis-flag. P3 is plan-reading (out of scope). P5 is correct.

**The directive's intent, structurally relocated (recommended corrected plan):**

1. **Construction (corrected §4 / §4.1):** add a `filter`/categorized vocabulary to `CompositionalIntent` + `constructTree` (a `filter` ReferenceSource and a `categorized` / `filtered_aggregate` shape) so per-category rates and filter→count construct deterministically. This is in `intent-constructor.ts`, NOT the legacy `intent-transformer.ts`. Preserve all existing shapes (BCL regression).
2. **Resolver (§5 / Phase 3):** make `resolveColumnFromBatch` apply the binding's `filter` predicate before aggregation, and add structural `{aggregation:{op}, filter?, period_key?}` dispatch — fixes P1/P4 resolution and P2 (period_key removes the `column:''` sentinel). Unify the three reduction enums. Byte-identical regression for existing reductions.
3. **Prompt (corrected §4.2):** teach the prompt to **emit the new `filter` structure** in `compositional_intent` (so recognition carries it structurally, not in prose). NB: this is the *semantic* recognition vocabulary (category/filter concepts), distinct from *engine-primitive* vocabulary; the directive conflates them. Remove genuinely redundant engine-primitive grammar from the prompt only where the structural shape makes it unnecessary (E907).
4. **OUT/deferred:** Phase 4 (finalize-time binding materialization) and Phase 5 (construction_validation signal) are independent improvements not required to fix the MIR numbers; recommend deferring unless the architect wants them in-scope. P3 gate = OB-214 class. P5 = untouched.

**Regression strategy:** structural DAG-equivalence test (run the constructor over BCL's stored `compositional_intent`, assert byte-identical to stored `calculationIntent`) as the CC-side gate; full BCL/Meridian recalc to $312,033 / $556,985 is architect-channel (§2 anchors are "architect-verified only").

---

*OB-225 Phase 1 complete. HALT-DIAG reported. Awaiting architect steer on corrected scope before modifying the calculation engine.*
