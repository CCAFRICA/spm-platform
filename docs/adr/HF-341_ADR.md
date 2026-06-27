# HF-341 — ADR: MIR Reconciliation Correction (committed BEFORE implementation)

**Branch:** `hf-341-mir-reconciliation` · **Date:** 2026-06-25 · **Mode:** ULTRACODE (autonomous)
**Binds:** Korean Test / Decision 158 (No Fixed Taxonomy, C0, AUD-009), AP-26 (open-vocabulary),
SR-34 (class not instance), C2 (fail-loud), C6 (calc read-contract — scoped exception §2), Carry
Everything (T1-E902), Validation Premise Law (HF-339), Prove-Don't-Describe, SR-44.

This ADR records every design decision, the defect it closes, the substrate law it honors, and the
Robles-anticipation (RA) constraint it satisfies. Investigation traces and PG evidence live in the
completion report (`HF-341_COMPLETION_REPORT.md`).

---

## 0 — Proof-channel framing (why some PGs are architect-channel)

The MIR tenant (`972c8eb0-e3ae-4e4c-ad30-8b34804c893a`) is currently **empty** (zero `rule_sets`);
the calc route (`/api/calculation/run`) is **auth-gated and write-only** (no dry-run; it
DELETE+INSERTs `calculation_results`/`entity_period_outcomes`); and live production DB reads are
blocked from this environment. Therefore the **live MIR/BCL grand-total reconciliation (PG-1…PG-8)
is the architect's SR-44 channel** (clean-slate reimport of the 5 plan PDFs + Jan–Jun 2025 data →
recalc vs sealed GT) — exactly the pattern used by HF-325/HF-328/HF-329.

**What CC owns and proves in-PR:** the *mechanisms* behind every defect (synthetic `node:test`
suites driving the real engine + structural inspection + `tsc`/`build`/existing-suite regression),
and the full Korean-Test / Robles-anticipation soundness gates **PG-9…PG-15**. The recalc procedure
(tenant id, plan/period discovery, recon-line capture) is handed to the architect in the report.

The defects split by scope:
- **Built + wired (MIR-exercised, architect reconciles the numbers):** D1, D2a, D2b, D3a, D3b/D4, D5.
- **Contract carries it + structural/synthetic proof (Robles-anticipation, not MIR-reconciled):**
  RA-2 (reference-read op), RA-3 (distribution-fragment home), RA-5 (open-vocab modifier shapes).
  RA-1 (`multiply`) and RA-4 (operand-typed condition) are *built* (they back D3a / D2a).

---

## ADR-1 — Binding OPERATION honors the recognized nature; fail-loud; D1 count+filter; D2b key-grouped snapshot (D1, D2b, D5)

**Defect.** The convergence binding's reduction is chosen solely from the LLM's free-text
`obj.reduction`, gated by a closed `validReductions` whitelist, and **silently defaulted to `'sum'`**
(`convergence-service.ts:1951-1952`). The recognized column NATURE (`FieldIdentity.structuralType`,
e.g. `categorical (binary flag)`) and the recognition guarantee `aggregation_behavior`
(`convergence-recall.ts`, injected only as advisory prompt text) never authoritatively drive the op.
Consequences: `Verificado` ("Sí"/"No") summed → text parses to NaN → null/$0 (D1); `Saldo_Pendiente`
(a per-client month-end balance) summed → N× inflation (D2b). The S4 prompt
(`convergence-service.ts:1899-1904`) never even mentions the `count` reduction.

**Decision.**
1. **Honor the recognition guarantee (Decision 158).** When the recalled `aggregationBehavior`
   recognition output is present, it drives the binding op (verbatim free-form string); the LLM's
   own choice is the fallback. Recognition *guarantees* nature/derivation; binding *honors* it
   rather than re-deriving.
2. **Surface the count-of-qualifying derivation in the S4 prompt.** Add structural guidance: a
   membership / flag / categorical column whose plan-role is "how many rows qualify" collapses by
   **`count` of the rows matching a plan-stated filter** (e.g. `count` where `Verificado = "Sí"`),
   never `sum`. This is open-vocabulary recognition guidance — the qualifying *value* comes from the
   plan, not a developer status-value list (Korean Test).
3. **Fail loud, never silent-sum (C2).** A numeric aggregation (`sum`/`avg`/`min`/`max`) proposed for
   a column whose sampled values are **structurally non-numeric** (numeric-parse cardinality == 0,
   computed from `columnStats` — a structural property, not a nature→op map) emits a
   `resolutionFailure` marker instead of defaulting to `sum` (which yields a silent $0). `sum` stays
   the explicit op only for a genuinely numeric flow.
4. **D2b — key-grouped snapshot.** Add optional `key_column` to `ConvergenceBindingEntry`. When a
   `snapshot`/`last`/`first` reduction carries a `key_column`, the consumer groups the entity's rows
   by that key, selects one value per group by a **deterministic order**, then sums across groups
   (Σ of per-client month-end balances). A deterministic order (`source_date`, then committed_data
   id) is added to the `dataByBatch` fetch — closing the OB-237 `.range()`-without-`.order()`
   non-determinism class on the `last`/`first` path. Without `key_column` the path is **byte-identical**.

**Korean Test.** No nature→operation map is introduced. Op derives from the recognition guarantee
(open string) + plan-stated filter value; fail-loud keys on a *structural* property (numeric-parse
cardinality), never on a name/value set. The fixed reduction set is the engine's **aggregation
alphabet** (peer of `AggregationType` / PrimeNode `aggregate` ops) — enumerated as structural, not a
registry (PG-9). The genuinely registry-shaped behaviors removed: the silent `'sum'` default and the
prompt's omission of `count`.

**C6.** Consumer (`resolveColumnFromBatch`) stays byte-identical for the existing cases: BCL/Meridian
bindings carry no reduction → the `sum` path is untouched; the `count`+filter path already exists
(OB-222, route.ts:1782-1788); the new `key_column` branch is gated on `key_column` presence.

**RA-2.** Add a first-class reference-read operation form so a binding can express
`ref(table, key_column) → value` alongside `aggregate(column, op)` — a new `reference_lookup`
`ReferenceSource` kind (`compositional-intent.ts`) + a constructor case built from existing primes
(filter→aggregate), proven representable by synthetic test (PG-12). Not engine-wired beyond
representability (MIR exercises no reference-read; Robles factor-model does).

---

## ADR-2 — Cross-component composition: within-component multiplicative chain (D3a, RA-1)

**Defect.** The accelerator (`Multiplicador_Acelerador`, a 2-cell banded_lookup → 1.00/1.25) is
recognized as a **separate component** c1; the per-entity total folds components **additively**
(`route.ts:2916 intentTotalDecimal.plus(rounded)`; mirror `run-calculation.ts:1462`), and per-
component integer rounding (`route.ts:2904`, decimalPlaces:0, HF-265) quantizes 1.25 → 1 before the
fold. Result: `total = c0 + 1` instead of `c0 × 1.25` (recon `Activo | total=1 | components=[c0:0,c1:1]`).

**Decision — Option B (within-component multiplicative), NOT a cross-component fold change.** The
multiplicative relationship `Comisión = Monto × Tasa × Multiplicador_Acelerador` is a Decision-158
**recognition guarantee**: recognition emits it as ONE component whose `structure` is a multiplicative
DAG (`arithmetic(multiply, <commission-subtree>, <accelerator-band>)`), using `OperandDescription`
`{ kind: 'structure' }` to nest the accelerator. The engine already evaluates `arithmetic multiply`
**within** a component (`intent-executor.ts:201`); no engine change is required. To make N-factor
multiplicative composition *declarable* in the grammar (RA-1), add `'multiply'` to
`ComposedDescription.composition` + the `constructComposed` case — `reduceArithmetic(children,
'multiply')` already folds N children (`intent-constructor.ts:498`).

**Why Option B over a cross-component multiplicative fold (the C6-granted path).**
- **C6-pure / zero HALT-CONSTRUCTION risk.** The cross-component additive fold is *untouched* →
  existing compositions are trivially byte-identical (PG-10). The granted C6 exception is left
  unused (conservative).
- **Correct Robles fit (RA-1).** Robles `participant_rate = ref(base) × ref(product_factor) ×
  ref(channel_factor)` is ONE rate derivation = one component's nested multiply chain; cross-recipient
  fan-out is the *separate* RA-3 distribution concern, not cross-component composition. A
  cross-component 2-component multiply would be the special-case Robles tears out; a within-component
  nested `arithmetic`/`reduceArithmetic('multiply')` is a true N-factor chain declared in the DAG.
- **PG-4 satisfied.** After re-comprehension there is no standalone scalar c1 (folded into the
  multiplicative component); the `c0:0,c1:1` pattern cannot recur. For zero base, `0 × 1.25 = 0`.
- **Avoids the rounding-relocation hazard** entirely (the multiply happens inside one component on
  raw Decimals; the single final round is unchanged).

**Korean Test / C6 / C2.** No component-type→composition-mode map — composition is a *declared DAG*,
never inferred from `componentType`. `'multiply'` reuses the existing arithmetic alphabet; unknown
compositions still throw `ConstructionError` (C2). Additive: absent `'multiply'`, every existing
`sum`/`max`/`min`/`first_match` composition is byte-identical (PG-10, PG-11).

---

## ADR-3 — Gate / conditional-activation wiring (D2a, RA-4)

**Defect.** The activation gate (Plan 3 pays only when `collection_rate = Monto_Cobrado /
Saldo_Pendiente > 70%`) is **dropped at comprehension**: the active CompositionalIntent grammar frames
`conditional` only as "a value that changes at a threshold"; the explicit "pays ONLY WHEN … → wrap the
entire payout in `conditional(cond, payout, 0)`" instruction survives only in the deprecated
legacy/worked-examples block the model is told not to emit (`anthropic-adapter.ts`). The contract
(`ConditionalDescription`), constructor (`constructConditional`), and engine (`conditional`/`compare`
primes) all carry and enforce a gate correctly — it simply never reaches them. No out-of-structure
eligibility enforcement exists.

**Decision.**
1. **D2a.** Restore the eligibility-gate instruction to the *active* grammar: when the plan states the
   payout is earned/activated **only when** a precondition holds, wrap the entire component payout in a
   `conditional` whose `then` is the payout structure and whose `else` is `constant(0)`. Structural,
   open-vocabulary (no plan-name list, no threshold list); reuses the existing `conditional` shape.
   Construction + calc are unchanged — the gate then flows
   `ConditionalDescription → conditional/compare prime → else-branch zeroing`. (Couples with D2b: the
   `collection_rate` denominator must be the key-grouped `Saldo_Pendiente`, ADR-1(4), for the
   threshold to compare correctly.)
2. **RA-4 — operand-type the gate condition.** Widen `ConditionalDescription.condition` so the RHS can
   be a **categorical value** (string) alongside a numeric threshold (`right: OperandDescription` /
   `value: string | number`). `constructConditional` builds a categorical `compare` (string `constant`)
   when the value is non-numeric; numeric RHS keeps `buildConstantWithScale` (existing numeric gates
   byte-identical). The engine's `compare` prime already evaluates string `eq`/`neq` (OB-220,
   `intent-executor.ts:214-225`).

**Korean Test / C6 / C2.** No registry: the comparison operator set `{gt,gte,lt,lte,eq,neq}` is a
structural *compare primitive* (peer of arithmetic `+−×÷`), and "open vocabulary" lives in the
free-form operand *value* (no `wholesale`/`machine_lines` set). The engine is **not edited** — the gate
is DAG-declared, additive (components emitting no gate are unchanged → PG-7/PG-8/PG-10 hold), and
malformed conditions still throw `ConstructionError` (C2). PG-14: numeric AND categorical gates
representable.

---

## ADR-4 — Entity-id resolution honors `identifies` scope + value-overlap; roster via `data_type='entity'`; no categorical-status entities (D3b, D4, RA-3)

**Defect.** The HF-333 §4.3 disambiguation (`commit-content-unit.ts:372-407`) fires whenever the
resolved id is ~1:1 (distinctRatio > 0.95) and then **prefers the lowest-cardinality
IDENTIFIER_NATURE column** (`ratio < bestAlt.ratio`, line 396), reading *only*
`data_nature`/`characterization` — **never** the LLM's `identifies`/ENTITY_SCOPE channel. "Most
repeating" ≠ "entity identity": on Ventas it picks `Almacen` (8 warehouses) over `DNI_Vendedor` (30
sellers) (D3b); on the 1:1 Nómina roster it picks `Estado` (Activo/Inactivo) → `entity_id_field=Estado`
→ "Activo" harvested as an entity (D4a). Roster detection
(`route.ts:1198-1255`/`run-calculation.ts:1222-1278`) uses a **closed keyword list**
`['datos colaborador','roster','employee','empleados']` against `data_type`-keyed sheet names that can
never match (D4b) → "No roster sheet detected — calculating all 35".

**Decision.**
1. **D3b/D4a — fix the disambiguation.** (a) Consult the same `identifies`/ENTITY_SCOPE channel
   `findHcEntityIdColumn` uses; require/strongly-prefer an ENTITY_SCOPE candidate and reject
   TXN/dimension/status scope. (b) Reverse the ranking: prefer the entity-scope identifier whose value
   set IS the population (value-overlap with the established entity population / substantial
   cardinality), **not** minimum cardinality. (c) Gate the 0.95 trigger so it does not fire when the
   resolved column already has ENTITY_SCOPE `identifies` (a ~1:1 id on a sheet whose rows ARE the
   population is *correct*, not pathological). C2: with no ENTITY_SCOPE candidate, keep the LLM's
   recognized column and log loudly — never silently substitute a dimension.
2. **D4b — structural roster detection.** Replace the closed keyword list with the structural marker
   already guaranteed by SCI: a roster is the bucket of entities whose `data_type === 'entity'` rows
   (rows that ARE the population — recognize/guarantee). Remove the keyword arrays in `route.ts` and
   `run-calculation.ts` (and the consolidation duplicate). Keep the `__` parent-sheet heuristic as a
   secondary signal.
3. **D4a residual.** Guard entity harvesting so a 2-value categorical status is not minted as an entity
   (structural: harvest only ENTITY_SCOPE-`identifies` / population-cardinality columns), mirroring the
   existing `looksLikeRowIndex` structural reject.
4. **D4c — join.** With (1), both Ventas and Nómina resolve `entity_id_field` to the seller-DNI-valued
   column and the existing value-overlap backfill links them; for residual format divergence
   (DNI vs DNI_Vendedor values), value-overlap reconciliation modeled on `reference-join.ts`
   (never a name-pair table, never a `DNI`-keyed normalization list).

**Korean Test.** Every fix is structural: reuse the LLM's free-form `identifies` scope; the
`data_type='entity'` marker is the LLM's free-form classification surface (not a developer keyword
set). The roster-keyword arrays are **removed** (registry deletion). No column-name list, no
status-value ('Activo') list.

**RA-3.** `entity_id_field` stays a single string (one-entity-per-row) for MIR. The three one-per-row
sites (processEntityUnit harvest, entity-resolution harvest, backfill) are documented as the fan-out
**seam** so the graph-traversal recipient expansion extends without teardown — and the binding contract
gains a distribution-fragment home (ADR-5) so the *contract* is already extensible (PG-13).

**Recompute note (SR-44).** Changing `entity_id_field` selection changes which entities exist and
which committed_data rows backfill to which entity → requires re-import + per-period recalc (architect
channel), same as HF-325/328/329.

---

## ADR-5 — Open-vocabulary modifier shapes + distribution-fragment home (RA-5/PG-15, RA-3/PG-13)

**Defect / liability.** `IntentModifier` (`intent-types.ts:203-207`) is a **closed modifier-shape
enum** `'cap'|'floor'|'proration'|'temporal_adjustment'` — the exact registry pattern PG-15 forbids
and the home Robles's `tope`/`streak`/`devolución` cannot use. `ConvergenceBindingEntry` has no
per-entry home for a distribution fan-out fragment (RA-3).

**Decision.**
1. **RA-5.** Open the modifier vocabulary: `IntentModifier`'s `modifier` discriminator becomes an
   **open string** (known shapes retained as optional refinements; mirrors the already-open
   `ExecutionTrace.modifiers.modifier: string`). `wrapModifier` (`legacy-intent-to-dag.ts`) already
   throws `UntranslatableLegacyIntentError` on an unrecognized discriminator (C2 fail-loud), so opening
   the type is calc-neutral. Add an optional open-vocab `modifiers?: Array<{ kind: string; … }>` to
   `CompositionalIntent` so the live prime_dag path has a *declared* open modifier home. Grep proves
   zero closed modifier-shape enum survives in changed files (PG-15).
2. **RA-3.** Add an optional, all-free-form `distribution?` fragment to `ConvergenceBindingEntry`
   (recipients source + per-recipient derivation + optional share field) — a home for fan-out that
   sits ALONGSIDE the per-entity scalar fields. Because the interface is all-optional and
   `input_bindings` is an open JSONB record, this adds a home without altering single-entity
   resolution and is proven by structural inspection (PG-13). **No fan-out engine is built** (the
   Robles arc, §6A residual #1).

**Korean Test / C2 / C6.** Validation Premise Law applied to modifier shapes (open string, not a
closed enum). No behavior map: modifier/distribution behavior derives from the DAG/structure the
constructor emits, fail-loud on no structural basis. Purely additive type-surface edits; existing
compositions byte-identical (PG-10).

---

## Cross-cutting: PG → ADR map

| PG | What it asserts | Owner | ADR |
|----|-----------------|-------|-----|
| PG-1 | Plan 4 total > 0 (Verificado count) | architect recalc; mechanism CC | ADR-1 |
| PG-2 | Plan 3 — 9 sellers → S/0 (gate blocks) | architect recalc; mechanism CC | ADR-3 (+ADR-1 D2b) |
| PG-3 | `entity_id_field` = DNI_Vendedor on Ventas | architect recalc; mechanism CC | ADR-4 |
| PG-4 | no `c0:0,c1:1` standalone-scalar recurrence | architect recalc; mechanism CC | ADR-2 |
| PG-5 | entity count < 35; no "Activo"/phantom DNIs | architect recalc; mechanism CC | ADR-4 |
| PG-6 | Plan 5 March clawback non-zero negative | architect recalc; mechanism CC | ADR-1 (D5) |
| PG-7 | Plan 2 = 210,000 (regression) | architect recalc | — (no Plan-2 path touched) |
| PG-8 | BCL bit-identical | architect recalc | C6 discipline across all ADRs |
| PG-9 | no registries (grep) | **CC** | all |
| PG-10 | C6 additive byte-identical | **CC** (synthetic) | ADR-2/3/5 |
| PG-11 | N-way multiply declarable | **CC** (synthetic) | ADR-2 |
| PG-12 | reference-read representable | **CC** (synthetic/structural) | ADR-1 (RA-2) |
| PG-13 | distribution-fragment home | **CC** (structural) | ADR-5 |
| PG-14 | numeric AND categorical condition | **CC** (synthetic) | ADR-3 |
| PG-15 | modifier shapes open-vocab (grep) | **CC** (grep) | ADR-5 |

## HALT outcomes (anticipated; confirmed in report)
- **HALT-COLLISION** — none (clean `main`; only this branch in flight).
- **HALT-REGISTRY** — not triggered; the change REMOVES registries (roster keywords) and OPENS the
  modifier enum; no nature→op / type→mode map added.
- **HALT-CONSTRUCTION** — not triggered; D3a uses Option B (no engine fold change), all C6 conditions met.
- **HALT-CALC** — guarded: no Plan-2 path touched; BCL bindings carry no reduction → sum path
  byte-identical; engine unedited for gate/composition. Architect confirms BCL = $312,033 / Plan 2 = 210,000.
- **HALT-API** — clear (`ANTHROPIC_API_KEY` present).
