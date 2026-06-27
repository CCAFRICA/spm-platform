# HF-341 R7 — ADR: Dynamic Ingestion Fidelity (Resolution, Condition, Reduction, Identity)

**Status:** Proposed (committed before Tier 1, per directive §3.0)
**Date:** 2026-06-26 · **Branch:** `hf-341-mir-reconciliation` · **PR #601**
**Directive:** `docs/vp-prompts/HF-341_R7_DIRECTIVE_20260626.md`
**Predecessor ADR:** `docs/adr/HF-341_ADR.md` (R1 — five decisions; R1's ADR-1/ADR-2 already established count+filter / snapshot / within-component multiply at the *grammar* level; R7 finds two of those properties live and intact, and isolates the layers where the remaining defects actually live).

This ADR is grounded in **live DB forensics** against MIR (`972c8eb0-e3ae-4e4c-ad30-8b34804c893a`, the R6 run already in the database) plus a complete code-mechanism trace across the engine. The evidence is pasted in the completion report's §2; this ADR records the decisions.

---

## §0 — Premise corrections (evidence over hypothesis)

The directive's §1.3 named four defects with hypothesized mechanisms. The evidence **confirms the four observable failures** (Plan 1 grandTotal≈68, Plan 3 overpay, Plan 4=0, 68 entities) but **refutes several hypothesized mechanisms**. Per directive §3.0 ("the evidence requirement is a floor, not a ceiling") and the HF-341 arc's established pattern (every revision carried a premise correction), R7 fixes the *evidenced* root cause, not the hypothesized one.

| Directive hypothesis | Evidence verdict |
|---|---|
| **A1** "`resolveColumnFromBatch` returns no data for the bindings at calc time" | **REFUTED.** The binding resolves and the data is present. `resolveColumnFromBatch` (route.ts:1679) correctly applies filters/reductions and *fails loud* on unknown ops. The real cause: the DAG **filter literal** `Categoria=='ALI'` does not match the data domain `{Alimentos,Bebidas,Limpieza,Cuidado Personal}` → the filter matches **zero rows** → `sum` over the empty set = 0. A *condition-literal vs data-domain* mismatch, upstream of resolution. |
| **A2** accelerator emitted as a separate additive component; plan wants multiply | **CONFIRMED.** Skeleton splits every payout structure into a separate component (anthropic-adapter.ts:445); `interpretationToPlanConfig` hardcodes `type:'additive_lookup'` (ai-plan-interpreter.ts:379); engine sums payouts (route.ts:2958). |
| **B1** "the DAG does not contain the activation gate" | **REFUTED.** The gate is present: `conditional(compare(gt, divide(Monto_Cobrado, Saldo_Pendiente), 0.7), …, 0)`. |
| **B2** "convergence binds Saldo_Pendiente as `sum` (the default)" | **REFUTED.** Saldo_Pendiente is already bound `reduction:'snapshot'`. The reduction algebra already supports `snapshot/last/first` (route.ts:1837-1846). Saldo is constant per seller-month → snapshot is correct. |
| **C1** "convergence binds Verificado → sum" | **REFUTED.** Already bound `reduction:'count'` with `filter{Verificado='Si'}`. The real cause: the filter literal `'Si'` ≠ data value `'Sí'` (accented) → count over the empty set = 0. **Same class as A1.** |
| **C2** "no plausibility guard / it doesn't fire" | **PARTIAL.** The numeric-reduction-over-non-numeric guard exists and is correct (convergence-service.ts:2990-3008); it correctly does *not* fire here (Plan 4 is `count`, Plan 1 sums numeric `Monto_Total`). The actual gap is that **no guard covers the filter-literal silent-0**. |
| **D1** entity-sheet entity-id from per-sheet name prominence, not plan identity | **CONFIRMED.** Nómina keys by `Nombre_Completo`; transactions by `DNI_Vendedor`; exact-external_id dedup never merges name↔DNI → 34+34=68. |

**The true unified class** is tighter than "developer defaults override expression." It is two classes:
1. **Condition-literal / data-domain reconciliation gap** (A1, C1): the LLM emits filter/compare literals from the plan document's vocabulary; nothing reconciles them to the data's actual carried domain → a literal matching nothing silently yields 0.
2. **Composition fold default** (A2): the additive-lookup assumption overrides an expressed multiplier.
3. **Entity-namespace locality** (D1): each sheet mints its own identity namespace from its own headers instead of the plan-declared identity's value-domain.

Defect **B** is **structurally already correct** (gate + snapshot both present and right for the data); its numeric residual is a plan-formula/data-semantics question that belongs to the reconciliation channel (§ Decision-B).

---

## §1 — Decisions

### Decision A1/C1 — Literal-domain reconciliation at convergence (the recognize→guarantee layer)

**Root cause (evidenced).** Filter/compare literal VALUES are carried verbatim from emission into the stored DAG and the convergence binding `filters`, and are **never** checked against the bound column's actual carried domain. Convergence already computes that domain — `cap.categoricalFields[].distinctValues` and `cap.booleanFields` (convergence-service.ts:1204-1226) — and already has a fail-loud channel (the C2 block, 2990-3008), but the DAG-walk that feeds binding extraction collects only field **names**, never filter **values** (extractReferencesFromDAG, 1556-1564).

**Decision.** Add a **literal-domain reconciliation pass** inside `generateAllComponentBindings` (convergence-service.ts), run once per component after its binding is written, that:
1. Enumerates every equality literal the component tests against a bound column, from **two carried sources**: (a) the written binding `filters` (covers C1/Plan 4), and (b) the component's prime DAG — extending the existing DAG walker to surface `filter`/`compare` leaves pairing a `reference(field)` with a literal `value` (covers A1/Plan 1). The DAG extraction stays purely structural (keys on `prime==='filter'|'compare'` + presence of a literal value node — no field-name/value branching).
2. For each `(column C, literal L)` where C has a known string domain (read the **full** domain via committed_data pagination, as the id self-verification already does at 3055-3074, so cardinality isn't sample-truncated): if `L ∈ domain` → keep. If `L ∉ domain` → call the LLM (the existing convergence AI task), passing the **real distinct values** + the component/plan intent, asking it to map L to the matching domain member (`'ALI'→'Alimentos'`, `'Si'→'Sí'`). If it returns a member → **rewrite** the filter/DAG literal. If irreconcilable → emit a loud `resolutionFailure` marker (same shape as the C2 block; reason `filter_literal_'L'_absent_in_domain_of:C`) so calc surfaces a **failed component**, never a silent $0.
3. Convergence persists the corrected component DAGs alongside `input_bindings` (run/route.ts extends its post-convergence `.update()` to also write corrected `components`).

**Secondary (source-correct, forward-looking).** Extend the emission `fieldAnchor` (already threaded into the per-component prompt, anthropic-adapter.ts:1306-1309) to also carry, for low-cardinality categorical columns, the actual observed distinct values, with prompt language requiring an emitted filter/compare literal to be a member of the listed data values. This makes future emissions grounded at the source (Decision 158 "LLM recognizes"); the convergence pass is the **guarantee** ("code constructs and guarantees"). The convergence pass is load-bearing and provable on MIR; the emission change is proven by unit test.

**General property (P-A1 + P-C1).** *Every filter/compare equality literal is a member of its target column's actual carried domain, or is LLM-reconciled to one; a literal matching nothing can never silently persist as a 0 — for any tenant, plan, language, domain.*

**Subtraction target.** The implicit "trust the emitted literal as valid against the data" pass-through (the absence of any domain check at the filter parse 1955-1963 and the verbatim write at 3019). This slice is mostly a new guard + reconciliation because the defect is an **absent** check (silent acceptance), which the directive explicitly allows for C2 fail-loud obligations.

**Korean Test / Validation Premise Law.** The valid value-set is derived **only** from carried reality (the data's own distinct values), never a developer mapping table, synonym list, or enumerated category set. **No accent-folding heuristic** (`'Si'≈'Sí'` would be a language-specific transform that fails the Korean Test) — the correction comes from the LLM recognizing the correspondence against the real values it is shown. The membership test is pure set-containment over the data's domain; a developer cannot make it "more complete" by editing a list.

### Decision A2 — Single composed multiply-DAG (subtraction at emission)

**Root cause (evidenced).** Combination is purely additive: one combinator `intentTotalDecimal.plus(rounded)` (route.ts:2958), `grandTotal += entityTotal` (3109); neither `ComponentIntent` nor `ComponentResult` carries a composition mode. The accelerator (a dimensionless `1.0/1.25` factor) is emitted as a peer additive component, so it is **added** (~1.0/entity → grand≈68) instead of **multiplying** the commission.

**Decision.** Fix at **emission**, not the combination layer (the Σ loop is correct and must stay registry-free). The skeleton (anthropic-adapter.ts:445) is taught that a **modifier/multiplier that scales another component's output is not a separate component** — it belongs inside that component's DAG as an `arithmetic(multiply, <host-subtree>, <modifier-subtree>)` factor (the factor-model already taught at anthropic-adapter.ts:500-501 / SC-05). The hardcoded `type:'additive_lookup'` (ai-plan-interpreter.ts:379) is replaced so composition is expression-driven (genuinely independent components still sum; a recognized multiplicative modifier folds into its host DAG). The PrimeNode algebra already evaluates `multiply` (`a.mul(b)`, intent-executor.ts:201) — **zero engine change**.

**General property (P-A2).** *When a plan element semantically modifies (scales) another, it is composed inside one component's PrimeNode DAG via the existing `arithmetic` primitive; the additive combination layer only ever sums genuinely independent components. Composition mode is read from what the plan expresses, never assumed.*

**Subtraction target.** The separate additive accelerator component is **deleted** and folded into the commission DAG as a multiply operand; the blanket `additive_lookup` assumption is removed. One fewer component object, one fewer additive term, composition expressed in the existing prime vocabulary. **Rejected:** a per-component `compositionMode` field branched on in the Σ loop (would be a developer-maintained mode enum — No-Registry violation — and duplicates a capability the DAG already expresses).

**Proof note.** The emission fix is proven by unit test (synthetic multiplier-plan → single composed multiply-DAG). The live MIR Plan-1 number requires re-emission from the plan PDF (architect reimport, PG-R7-1). R7 also demonstrates the corrected number by composing the two **already-stored, already-recognized** subtrees (`commission × accelerator`) and running calc — a derivation from carried reality, not a fabrication.

### Decision B — Properties already hold; numeric residual is reconciliation-channel

**Root cause (evidenced).** P-B1 (gate present) and P-B2 (snapshot bound; algebra supports `last/snapshot`) **both already hold**. The overpay is because, under the recognized formula `sum(Monto_Cobrado)/snapshot(Saldo_Pendiente) > 0.7`, **all 30 sellers** have rate > 0.7 (minimum 2.11; range 2.11–49). The data (only `Monto_Cobrado` flow + a per-seller `Saldo_Pendiente` snapshot) **cannot** produce the directive's "9 blocked" under any reduction — no reduction makes 9 sellers fall to ≤0.7.

**Decision.** Establish + **unit-test** the properties (a stock column binds `snapshot` not `sum`; the algebra executes `last/snapshot`; a gate condition survives into the DAG). Run the calc and **report verbatim** (June total ≈243,641, all 30 paid). The remaining numeric divergence is a **plan-formula / data-semantics** question (what "collection rate" denominator the plan PDF intends; what `Saldo_Pendiente` represents) which lives in the **reconciliation channel** (directive §0). Inventing a different collection-rate formula than the one recognized from the plan would be fabrication (prohibited by the no-fabrication rule and the Validation Premise Law). This is **not** scope-narrowing — the full investigation ran, the properties are proven, the calc is reported; what the evidence shows is that the hypothesized structural defect does not exist.

**General property (P-B1 + P-B2).** *An expressed activation gate survives into the DAG as a `conditional`; an expressed stock/point-in-time derivation binds a non-sum reduction; the reduction algebra supports `last`/`snapshot` (RA-1).* Both hold and are tested.

### Decision D1 — Entity identity by plan-declared value-domain overlap (subtraction at import)

**Root cause (evidenced).** Entity-id column is chosen **sheet-locally** at import: `processEntityUnit` (execute-bulk/route.ts:813,825) keys the entity row by the sheet's own `entity_identifier` binding → Nómina picks `Nombre_Completo`; transaction entities are discovered separately from `DNI_Vendedor` (entity-resolution.ts:150); exact-external_id dedup (304-317) never merges name↔DNI → 68. The plan's declared identity is structurally **unavailable** at import (`BulkContentUnit`, execute-bulk:81-98, carries only sheet-local bindings); the only value-overlap reconciliation runs at **calc** time (run/route.ts:884-942) against the already-wrong assigned set.

**Decision.** Generalize the existing OB-216 Phase-4 **value-overlap argmax** (run/route.ts:909-937) into entity resolution so every sheet's entity-key column is the one whose **values overlap** the same canonical identity value-domain the plan's convergence `entity_identifier` binding routes (the `DNI_Vendedor` value-set). On Nómina, the column whose values overlap that DNI value-set is its DNI column → external_id becomes the DNI → the 34 Nómina rows merge with the 30 transaction DNI entities into one namespace. Removes the per-sheet prominence override and the binding-first/HC-first precedence asymmetry (commit-content-unit.ts:221-224 vs execute-bulk:825).

**General property (P-D1).** *An entity is identified by one value-domain per tenant — the value-domain the plan's declared identity routes — so any two sheets carrying the same identity value resolve to the same external_id regardless of column name or import order. No sheet invents a private identity namespace.*

**Subtraction target.** The sheet-local "each sheet defines its own entity namespace from its own headers" default + the dual-precedence asymmetry, replaced by the single value-overlap mechanism that already exists at calc time, hoisted to govern creation. No `'DNI'`/`'Nombre_Completo'` literal; routing is by value-set membership (language-agnostic, no accent-folding — DNI values are byte-identical across sheets).

**Target count.** 34 entities (the Nómina headcount: ~30 Vendedores + ~4 supervisors/managers). The 30 transaction-DNI entities merge into the 30 selling Nómina people; ~4 non-selling supervisors remain Nómina-only (no transactions → contribute 0). Directive PG-R7-1 accepts ≤34.

**Blast radius / HALT-CALC.** The D1 change is **import-path only** (entity creation). It does **not** execute during calc of already-imported tenants, so re-calculating **BCL ($312,033)** and **Meridian ($556,985)** is byte-identical — their entities already exist and are not re-resolved. (A future reimport of BCL/Meridian with the new logic must be byte-identical too: their single-identity sheets pick the same column under value-overlap; this is verified structurally, and any reimport is the architect's separate gate.)

---

## §2 — Blast radius summary (all defects)

| Fix | Files | Layer | Runs during calc of sealed tenants? | HALT-CALC risk |
|---|---|---|---|---|
| A1/C1 literal reconciliation | convergence-service.ts (+ run/route.ts persist; + anthropic-adapter.ts emission) | convergence (recognize/guarantee) | Only on (re)convergence; sealed tenants' bindings are populated → convergence skipped → **byte-identical** | None unless re-converged; BCL/Meridian literals already match their domains (no categorical-code mismatch) |
| A2 composed multiply | anthropic-adapter.ts (skeleton), ai-plan-interpreter.ts (additive_lookup) | emission | No (emission is import-time) | None for calc; new emissions only |
| B properties + tests | tests only | — | No | None |
| D1 entity value-overlap | execute-bulk/route.ts, entity-resolution.ts | import (entity creation) | No (import-time) | None for already-imported BCL/Meridian |

**Engine / SCI calc core (`intent-executor.ts`, `prime-grammar.ts`, `resolveColumnFromBatch`) is UNTOUCHED.** All fixes are at emission, convergence, and import — the layers where the directive's unified class lives.

---

## §3 — Proof strategy (per defect, honest about CC-provable vs architect-reimport)

- **A1/C1 — CC-provable LIVE on MIR.** Clear MIR `input_bindings` (force re-convergence) → re-run calc → the reconciliation rewrites the stored DAG literals against the carried domain → Plan 1 c0 becomes non-zero (commission by real category), Plan 4 count becomes non-zero (verified `Sí` clients × 150). Plus C2 fail-loud unit evidence (irreconcilable literal → loud failure, not 0).
- **A2 — unit test (property) + derived-DAG calc demonstration.** Live re-emission of Plan 1 is architect reimport (no plan PDF in repo).
- **B — unit test (properties) + verbatim calc report.** Numeric reconciliation = architect channel.
- **D1 — CC-provable on MIR by re-running entity resolution over existing committed_data** (value-overlap keys Nómina by DNI → 34 entities). Live clean reimport confirms; BCL/Meridian neutrality proven by re-calc (import-path change is calc-neutral).
- **PG-R7-2/3 (BCL/Meridian neutrality)** — re-run both calcs, assert $312,033 / $556,985 unchanged. HALT if either moves.
- **PG-R7-5 (Korean Test grep)** — zero MIR-specific column/plan/tenant literals; zero composition-mode registry; zero column→reduction map; zero entity-sheet→column heuristic.

---

## §4 — Locked-rule alignment

- **Decision 158:** LLM recognizes the literal↔domain correspondence and the multiplicative composition; code carries and guarantees. ✓
- **Korean Test (D154):** no registries, no column-name literals, no accent-folding, no composition-mode enum. ✓
- **Validation Premise Law (HF-339):** every new check is set-membership over carried reality; a developer cannot complete it by editing a list. ✓
- **C2 fail-loud:** the four silent-0 paths the directive names are replaced by loud failure (irreconcilable literal → failed component; unknown reduction already throws). ✓
- **SR-2 scale-by-design:** every fix establishes a general property exercised by any tenant. ✓
- **RA-1..RA-5 (Robles anticipation):** reduction algebra accommodates last/snapshot (RA-1, holds); composition supports multiply (RA-2, Decision A2); grammar supports conditional gates (RA-3, holds); entity-id plan-informed (RA-4, Decision D1); no 1:1-entity-per-row assumption added (RA-5). ✓

*HF-341 R7 ADR — committed before Tier 1 per directive §3.0.*
