# HF-341 — Completion Report: MIR Reconciliation Correction

**Branch:** `hf-341-mir-reconciliation` · **Date:** 2026-06-25 · **Mode:** ULTRACODE (autonomous)
**ADR (committed before code):** `docs/adr/HF-341_ADR.md` (commit `3065487c`)
**Code commit:** `b4783106`

> **Reconciliation-channel separation (binding).** The MIR tenant
> (`972c8eb0-e3ae-4e4c-ad30-8b34804c893a`) is currently **empty** (zero `rule_sets`); the calc route
> is auth-gated + write-only (no dry-run); live production DB reads are blocked from CC's environment.
> Therefore **PG-1…PG-8 (live MIR/BCL grand-total reconciliation) are the architect's SR-44 channel**
> (clean-slate reimport of the 5 plan PDFs + Jan–Jun 2025 → recalc vs sealed GT), exactly as
> HF-325/328/329. CC reports the *mechanism* proofs and the recalc procedure; the architect reconciles
> the numbers. **PG-9…PG-15 are proven in-PR** (synthetic `node:test` + structural inspection + grep).

---

## 1 — ADRs (summary; full text in `docs/adr/HF-341_ADR.md`)

| ADR | Decision | Defects | RA / law |
|-----|----------|---------|----------|
| ADR-1 | Binding **operation honors recognized nature**; S4 prompt surfaces `count`-of-qualifying + `key_column`; **C2 fail-loud** on a numeric reduction over a structurally non-numeric column; D2b key-grouped snapshot (Σ per-sub-entity) + deterministic fetch order | D1, D2b, D5 | RA-2 (reference-read home), C2, Korean Test |
| ADR-2 | **Within-component multiplicative** composition (recognition emits one component; `multiply` declarable in `ComposedDescription`/`constructComposed`). Engine cross-component fold **untouched** → C6 byte-identical | D3a | RA-1, C6 |
| ADR-3 | **Eligibility gate restored** in the active comprehension grammar; **operand-typed** condition (numeric AND categorical) | D2a | RA-4, C6, C2 |
| ADR-4 | Entity-id honors **`identifies` scope + value-overlap**, not min-cardinality; structural roster via `data_type='entity'`; no categorical-status entities | D3b, D4 | RA-3 seam, Korean Test |
| ADR-5 | **Open-vocabulary modifier shapes** (`IntentModifier.modifier: string` + `CompositionalIntent.modifiers` slot); **distribution-fragment home** on `ConvergenceBindingEntry` | — | RA-5/PG-15, RA-3/PG-13 |

**Why D3a uses within-component multiply (Option B) not a cross-component fold change:** zero engine
edit → C6 byte-identical (no HALT-CONSTRUCTION), and it is the correct Robles fit (the factor-model
`base × pf × cf` is one rate derivation; cross-recipient fan-out is the separate RA-3 concern). A
zero-base entity yields `0 × 1.25 = 0`, so the `c0:0,c1:1` standalone-scalar pattern cannot recur (PG-4).

---

## 2 — Investigation traces (the code CC read)

A 6-stream parallel investigation (548K tokens, 152 tool-uses) mapped each defect to its exact locus;
each was independently re-read and confirmed first-hand. The load-bearing findings:

- **D1/D2b/D5** — `convergence-service.ts:1951-1952`: reduction comes from the LLM proposal, gated by a
  closed `validReductions` whitelist, **defaulting to `'sum'`**; written as `undefined` when `sum`
  (`:2924,2967`). The S4 prompt (`:1899-1904`) describes sum/snapshot/max/min/avg/last/first/distinct_count
  but **omits `count`** — so a categorical flag (`Verificado` "Sí"/"No") can only be summed → text→0.
  Consumer `resolveColumnFromBatch` (`route.ts:1782-1788`) **already** has the `count`+filter path and
  accepts `reduction: string` — D1 is a *binding-side* fix. `columnStats[col]` is populated only for
  majority-numeric columns (`:1162,1181`) — its absence is the structural non-numeric signal (BCL-safe:
  nulls are filtered before the >50% test).
- **D2a** — gate dropped at comprehension: the active grammar framed `conditional` only as "a value that
  changes at a threshold"; the "pays ONLY WHEN → wrap payout in `conditional(cond,payout,0)`" instruction
  survived only in the deprecated legacy block. Construction (`constructConditional`) + engine
  (`conditional`/`compare` primes, incl. string eq/neq via OB-220) already enforce a gate correctly.
- **D3a** — `route.ts:2916` `intentTotalDecimal.plus(rounded)` folds components **additively**; per-
  component integer rounding (`:2904`) quantizes 1.25→1 before the fold. The PrimeNode DAG already has
  `arithmetic multiply`; `constructComposed`/`reduceArithmetic` already accept N-way `multiply`
  (`intent-constructor.ts:498`) but `composed` had no `multiply` member.
- **D3b/D4** — `commit-content-unit.ts:396` prefers the **lowest-cardinality** IDENTIFIER_NATURE column
  (`ratio < bestAlt.ratio`) reading only `data_nature`/`characterization`, **never** `identifies` scope
  → Almacen (8) beats DNI_Vendedor (30); the 0.95 trigger fires on the 1:1 Nómina roster → Estado →
  "Activo". Roster detection (`route.ts:1228`, `run-calculation.ts:1252`, `route.ts:1160`) used a closed
  keyword list against `data_type`-keyed sheet names it can never match → "calculating all 35".
- **Contract** — `IntentModifier` (`intent-types.ts:203-207`) is the closed modifier-shape enum
  (RA-5/PG-15); `ComposedDescription.composition` lacked `multiply` (RA-1); `ConditionalDescription.threshold:
  number` is numeric-locked (RA-4); no reference-read op (RA-2); no distribution-fragment home (RA-3).

---

## 3 — PG evidence

### Architect-channel (SR-44 recalc; CC supplies mechanism + procedure)

**PG-1 (Plan 4 Verificado > 0), PG-2 (Plan 3 — 9 sellers → S/0), PG-3 (`entity_id_field`=DNI_Vendedor),
PG-4 (no `c0:0,c1:1`), PG-5 (entity count < 35, no "Activo"), PG-6 (Plan 5 March negative),
PG-7 (Plan 2 = 210,000), PG-8 (BCL bit-identical).**

Recalc procedure for the architect (after applying no migrations — all changes are application code):
1. `tenantId = 972c8eb0-e3ae-4e4c-ad30-8b34804c893a`; reimport the 5 MIR plan PDFs + Jan–Jun 2025 data
   (clean-slate). Re-import triggers re-comprehension (new gate/multiply grammar) + re-convergence
   (count/key_column/fail-loud) + re-commit (entity-id).
2. Discover `ruleSetId`(s) via `rule_sets where tenant_id=MIR`, `periodId` for Junio_2025 and Marzo_2025
   via `periods where tenant_id=MIR`.
3. `POST /api/calculation/run {tenantId, periodId, ruleSetId}` for each {plan × June} and {Plan 5 × March}.
4. Capture verbatim: `[CalcRecon-T2]` per-entity lines (`route.ts:3150` — `<ext> | total=N |
   components=[c0:..,c1:..]`, the PG-4 surface), `[CalcRecon-T1] componentTotals/grandTotal` footer, and
   `[CalcRecon-T1] resolutionFailures=[..]` (the C2 loud surface). Reconcile against sealed GT.
5. **HALT-CALC confirmation:** re-run BCL (`b1c2d3e4-…`) and confirm grand = **$312,033** unchanged, and
   MIR Plan 2 = **210,000**. (CC's analysis: BCL bindings carry no reduction → sum path untouched; `.order()`
   is sum-invariant; BCL has no `key_column` binding; the structural roster filter is a no-op when all
   assigned entities are rostered — see §6 HALT-CALC.)

### CC-proven in-PR

**PG-9 (no registries) — grep over the 10 changed files:**
```
$ git grep -nE "datos colaborador|'roster'|'empleados'" -- <changed .ts>      → (none, non-comment)   # keyword roster registry REMOVED
$ git grep -nE "'Activo'|'Inactivo'|\['Sí'"             -- <changed .ts>      → (none)                 # no status-value list
$ git grep -nE "structuralType.*(==|===).*(reduction|'count'|'sum')" -- convergence-service.ts → (none)  # no nature→operation map
$ git grep -nE "componentType.*(multiply|compose)"      -- intent-constructor.ts route.ts → (none)       # no type→composition-mode map
```
Surviving bounded sets enumerated as **structural alphabet** (peer of the PrimeNode vocabulary, not
registries): the reduction set (`ReductionKind` = engine aggregation ops), the `compare` operators
`{gt,gte,lt,lte,eq,neq}`, the `arithmetic` ops `{add,subtract,multiply,divide}`, and `data_type='entity'`
(the SCI classification surface). None is a nature→op / type→mode map, column-name list, status-value
list, or modifier-shape enum.

**PG-10 (C6 additive byte-identical), PG-11 (N-way multiply), PG-12 (reference-read representable),
PG-14 (numeric AND categorical condition) — `node:test` (9/9 pass):**
```
✔ PG-11 (RA-1): composed:"multiply" over THREE children constructs an N-factor chain a×b×c          → 2×3×5 = 30
✔ D3a: within-component multiply — accelerator MULTIPLIES the commission (commission × 1.25)          → 625
✔ D3a / PG-4: a zero-sales entity yields 0 (0 × 1.25 = 0) — NOT the spurious additive +1
✔ D2a / PG-2: NUMERIC gate collection_rate > 0.70 BLOCKS the payout when 0.60                         → 0 (blocked), 5000 (paid)
✔ PG-14 (RA-4): CATEGORICAL gate (attribute == "wholesale") representable alongside the numeric gate  → 1000 (match), 0 (no match)
✔ D1 / PG-1: COUNT of rows where Verificado="Sí" × 150 > 0 (the flag is counted, not summed to 0)      → 450
✔ PG-12 (RA-2): reference_lookup is REPRESENTABLE in the vocabulary; construction FAILS LOUD (no silent 0) until the Robles resolver lands
✔ PG-10 (C6): composed:"sum" is unchanged — 3 + 4 = 7 (additive composition byte-identical)
✔ PG-10 (C6): composed:"multiply" is the NEW mode alongside it — 3 × 4 = 12
ℹ tests 9 · pass 9 · fail 0
```
Full suite (regression / D6 guard): **`ℹ tests 303 · pass 303 · fail 0`** (294 prior + 9 new) — existing
composition/modifier/engine tests unchanged → C6 byte-identical at the unit level.

**PG-12 (RA-2) — representability via type + recognized construction:** `reference_lookup` is a member
of the `ReferenceSource` union (`compositional-intent.ts`) — the operation vocabulary now *includes* a
first-class reference read alongside `aggregate(column, op)`. `buildReferenceNode` *recognizes* it (a
specific case, not the unknown-type default) and **fails loud** (`ConstructionError`, no silent-0) since
its calc-time resolver is the Robles arc; it is **not advertised** in the live LLM prompt. The op is
representable in the contract; building its engine is §6A residual #1.

**PG-13 (distribution-fragment home) — structural inspection:**
`convergence-bindings.ts:75` `distribution?: { recipients_source; per_recipient; share_field? }` — an
all-optional fan-out home alongside the per-entity scalar fields; the contract does not enforce a
per-entity-only shape. No fan-out engine built (the §6A Robles arc).

**PG-15 (modifier shapes open-vocab) — grep:**
```
$ grep -n "modifier: string"             intent-types.ts          → 213   # IntentModifier discriminator opened
$ grep -nE "'cap'\s*\|\s*'floor'"        intent-types.ts          → (none)  # closed modifier-shape enum REMOVED
$ grep -n "modifiers?: Array<{ kind: string" compositional-intent.ts → 273  # live prime_dag open modifier home
```

**Build/types:** `npx tsc --noEmit` → exit 0, 0 errors. `npm run build` (clean `.next`) → Compiled
successfully, 210/210 static pages, no prerender errors.

---

## 4 — Eradication log (file:region — change)

1. `types/convergence-bindings.ts` — `+key_column?` (D2b), `+distribution?` fan-out home (RA-3/PG-13).
2. `lib/calculation/intent-types.ts` — `IntentModifier` union → open `{ modifier: string; …optional }` (RA-5/PG-15).
3. `lib/calculation/legacy-intent-to-dag.ts` — `wrapModifier` cap/floor/proration C2 field guards.
4. `lib/plan-intelligence/compositional-intent.ts` — `+reference_lookup` source (RA-2), operand-typed
   `ConditionalDescription` (RA-4), `composition += 'multiply'` (RA-1), `+modifiers?` slot (RA-5).
5. `lib/plan-intelligence/intent-constructor.ts` — `constructComposed` `case 'multiply'`;
   `constructConditional` operand-typed RHS; `buildReferenceNode`+`refSourceField` `reference_lookup` cases.
6. `lib/intelligence/convergence-service.ts` — S4 prompt (`count`+`key_column` guidance); `BindingProposal`/
   `ComponentBinding` `+key_column`; parse `obj.key_column`; **C2 fail-loud** with **positive non-numeric
   evidence** (numeric reduction AND `!columnStats` AND column ∈ `categoricalFields`/`booleanFields` →
   resolutionFailure — cannot misfire on a sparse-but-numeric column); write `key_column`.
7. `app/api/calculation/run/route.ts` — `resolveColumnFromBatch` `+keyColumn` param + key-grouped
   snapshot/last (Σ per-key) **with a C2 guard** (if `key_column` absent from all rows → loud trace +
   fall through to the non-keyed path, never a silent single-bucket collapse); `effKey` + 5 call sites;
   **roster keyword registry removed** (3 sites: roster Tier-3 + 2 sibling-consolidation primaries) — the
   population-FILTER activation is **deferred** (HALT-CALC; see §6) so behavior is byte-identical.
8. `lib/sci/commit-content-unit.ts` — HF-333 disambiguation now consults `identifies` scope, prefers the
   entity-scope identifier (not min-cardinality), and skips the override on entity/roster sheets (D3b/D4a).
9. `lib/calculation/run-calculation.ts` — roster keyword registry removed (mirror); filter activation deferred.
10. `lib/plan-intelligence/intent-constructor.ts` (RA-2) — `reference_lookup` is **representable** in the
    `ReferenceSource` vocabulary and **recognized** by the constructor, which **fails loud**
    (`ConstructionError`) because its calc-time resolver is the Robles arc (no silent-0); it is **not
    advertised** in the live LLM prompt for the same reason.

Full diff: `git diff main...HEAD`.

> **D2b deterministic-order note:** the key-grouped `last`/`snapshot` uses the entity's row order. A
> deterministic-order committed_data fetch (`.order('source_date').order('id')`) was prototyped but
> **reverted** — adding `.order()` reorders the global `committedData` array, which feeds order-sensitive
> consumers (`fallbackEntityIdField` = first row's metadata; the sheet-detection sample row), so it is
> NOT purely sum-invariant. The per-client roll-up removes the N× inflation regardless of intra-client
> order; a deterministic-order fetch is a separate OB-237-class follow-up (residual §7).

---

## 5 — ARTIFACT SYNC delta (architect applies)

- **Migrations / Registry / Board:** none. All changes are application code; `input_bindings` is JSONB —
  the new optional fields (`key_column`, `distribution`) need no schema migration. No governance surface.
- **Substrate:** the convergence operation contract now treats the reduction set as the engine aggregation
  alphabet and adds a reference-read op (`reference_lookup`) + an open modifier vocabulary + a distribution
  home — note in the substrate that operation/modifier vocabularies are open (Validation Premise Law) and
  the roster-keyword registry is retired in favor of the `data_type='entity'` structural marker.
- **Recalc (SR-44):** MIR reimport + recalc (June + March) vs sealed GT; BCL/Plan-2 HALT-CALC confirmation.

---

## 6 — HALT outcomes

- **HALT-COLLISION** — not triggered (clean `main`; only this branch in flight).
- **HALT-REGISTRY** — not triggered; the change **removes** registries (roster keywords ×3 sites) and
  **opens** the modifier enum; no nature→op / type→mode map, status-value, or column-name list added.
- **HALT-CONSTRUCTION** — not triggered; D3a uses within-component multiply (Option B) — **no engine fold
  edit**; all three C6 conditions met (additive, byte-identical existing, DAG-declared/structural).
- **HALT-CALC** — **not triggered by construction.** An adversarial review (§9) initially surfaced two
  HALT-CALC risks that were **eliminated before merge**: (i) a structural roster filter that would have
  *activated a population narrowing never before active* for any SCI tenant (both prior tiers are inert
  against `data_type`-keyed sheets) → **reverted to registry-removal-only**, so the population is
  unchanged (byte-identical); (ii) a global fetch `.order()` that reorders order-sensitive consumers →
  **reverted**. Remaining changes are calc-neutral for existing tenants: the C2 fail-loud keys on
  *positive* non-numeric evidence (`!columnStats` AND in `categoricalFields`/`booleanFields`) → cannot
  misfire on a sparse-or-real numeric column; the key-grouped path is gated on `key_column` presence
  (absent for BCL/Meridian) and falls through loudly if the key is invalid; `reference_lookup` fails loud
  at construction (never a silent 0). The **one intended re-import-time change that touches resolution**
  is the entity-id disambiguation (D3b/D4a, the directive's core fix) — the architect confirms **PG-7
  (Plan 2 = 210,000) and PG-8 (BCL = $312,033) byte-identical** on recalc. Any movement → HALT per §4.
- **HALT-API** — clear (`ANTHROPIC_API_KEY` present).

---

## 7 — Residuals (per directive §6A)

1. **Robles engine arc** — the distribution evaluator (consuming the `distribution` fragment), cross-
   recipient `tope`, cross-period `streak`, cascade `devolución`, and the `reference_lookup` calc-time
   resolver are the next vertical slice. HF-341 ships the *contract homes* (PG-12/13/15), not the engines.
2. **Distribution comprehension** — the plan-interpretation prompt does not yet emit a distribution intent
   class; the contract can carry one.
3. **D2b non-keyed snapshot** — the `route.ts:1805` all-equal-else-sum guard is retained (BCL-preserving);
   the per-sub-entity case is handled by `key_column`. A legitimately-varying non-keyed snapshot is still
   summed (documented seam).
4. **Recognition-prompt effect** — D1 (count), D2a (gate), D3a (multiply emission) are comprehension-prompt
   changes whose effect manifests only after the architect's re-import; the construction/engine mechanisms
   they target are proven in-PR.

## 8 — Adversarial review (pre-merge)

A 3-lens review (HALT-CALC / new-logic-correctness / Korean-Test) of the diff, each finding
independently verified by a fresh skeptic, surfaced **5 confirmed-real findings — all resolved before
this report**:

1. **[critical] Roster filter would activate a never-before-run population narrowing.** Both prior roster
   tiers are inert against `data_type`-keyed sheets, so every SCI tenant currently calculates ALL
   assigned entities; the proposed `data_type='entity'` filter could drop a paid entity from BCL/MIR.
   → **Reverted to registry-removal-only** (3 sites: roster Tier-3 + 2 consolidation primaries);
   population unchanged (byte-identical). PG-5 is met by the D4a entity-id fix alone.
2/3. **[high/medium] C2 fail-loud `!stats` over-broad** (fails a sparse-but-numeric column). → refined to
   require **positive non-numeric evidence** (`categoricalFields`/`booleanFields` membership).
4. **[medium] `key_column` unvalidated → silent single-bucket collapse (C2).** → added a guard that falls
   through **loudly** to the non-keyed path when the key is absent from all rows.
5. **[medium] `reference_lookup` constructs a synthetic key with no resolver → silent 0 (C2).** → made
   construction **fail loud** + removed from the LLM prompt; representability proven via the type.

A 6th finding (entity-id disambiguation can shift `entity_id_field` on re-import) is **the directive's
intended core D3b fix** (PG-3) — retained; the architect confirms PG-7/PG-8 byte-identical on recalc.

After fixes: `tsc --noEmit` 0 errors · `next lint` 0 errors · `next build` clean (210/210 static pages) ·
`npm test` 303/303.

## 9 — PR

**PR #601** — https://github.com/CCAFRICA/spm-platform/pull/601 (`hf-341-mir-reconciliation` → `main`).
Not merged: the architect applies the SR-44 MIR reimport + recalc (PG-1…PG-8) and confirms the BCL /
Plan-2 HALT-CALC invariants before merge.

---

## §R2 — Lookup dimension: key-type-agnostic (PR #601 correction)

**Defect (regression introduced by R1's `composed:"multiply"`).** The grammar correctly merged MIR
Plan 1's three factors into one component, but child 2 — the category rate, a `banded_lookup` whose key
`Categoria` is a STRING (ALI/BEB/LIM/CPE → 2.5/2.0/3.0/3.5%) — failed construction: the dimension
validator demanded numeric `breaks`, and the LLM emitted `breaks:[]` (no numbers to break on) →
`dimension.breaks is empty (need at least 1 break for 2 bands)`. The validator enforced an anticipated
key type (numeric thresholds) and rejected a correctly-recognized one (categorical string) — the
Validation Premise Law.

**Fix (subtraction + carry, not a new shape).** The lookup dimension is now **key-type-agnostic**: it
carries its key reference plus the key structure the LLM recognized — **`breaks` (numeric) XOR `keys`
(categorical)**. Construction reads which is present and builds the matching comparison — `gte` for
numeric (unchanged), `eq` for categorical — **both via the existing `compare` prime** (the executor
already evaluates string eq, OB-220), so **no engine edit** (C6). No `categorical_lookup` shape, no
`{numeric, categorical}` key-type enum.

**Change (files):**
- `compositional-intent.ts` — `BandedLookupDimension.breaks` made optional; `+keys?: Array<string|number>`.
- `intent-constructor.ts` — `dimBandCount()` helper (keys.length | breaks.length+1); `buildDimRecursive`
  gains a categorical eq-match branch; `validateBandedLookup` rewritten to **structural-only**
  (key reference present; exactly one of breaks/keys — else fail loud C2; outputs non-empty + finite;
  outputs count = product of per-dimension band counts) and now owns the output-count check (the prior
  duplicate in `constructBandedLookup` removed).
- `anthropic-adapter.ts` — the `banded_lookup` grammar + prose teach `keys` for a categorical key
  (one output per key, same order), structurally framed (no key-type selector).

**PG evidence (synthetic `node:test`, 6 new; live import = architect SR-44 same as R1):**
```
✔ PG-R1: a CATEGORICAL banded_lookup (Categoria ALI/BEB/LIM/CPE → rates) constructs & maps each key → output   (ALI→0.025, LIM→0.030, CPE→0.035, no-match→0)
✔ PG-R1: MIR Plan 1 shape — Monto × categoryRate(categorical lookup) × accelerator — constructs end-to-end     (10000×0.030×1.25 = 375; ×1.00 below threshold = 300)
✔ PG-R3: a NUMERIC banded_lookup is unchanged (ascending breaks → bands)                                        (140→300, 120→150, 50→0)
✔ PG-R5/C2: a dimension with NEITHER breaks nor keys fails loud — never a silent default key type
✔ PG-R5/C2: a dimension with BOTH breaks and keys fails loud (ambiguous key structure)
✔ PG-R5: outputs count must match the key structure (categorical keys.length) — else fail loud
```
- **PG-R2 (Plans 2–5 unchanged) / PG-R3 (numeric unchanged):** the full existing `banded_lookup` suite
  passes byte-identical (`1D banded lookup 4 bands`, `2D banded lookup 6×5 BCL C0 shape`, `composed: sum
  of two banded lookups`, `banded_lookup (no count) untouched`, `mismatched output count`). The numeric
  construction path is not altered.
- **PG-R4 (no shape registry):** `git grep categorical_lookup` → none; no `{numeric,categorical}` /
  `keyType` enum; the `StructuralDescription` shape union is unchanged (5 literals).
- **PG-R5 (validator structural-only):** see `validateBandedLookup` — checks key reference + outputs
  (non-empty, finite) + outputs-count-vs-band-product; never which key type against an enumerated set.
- **PG-R6:** `tsc --noEmit` 0 · `npm test` **309/309** (15 HF-341, incl. 6 R2) · `next build` clean (210/210).

**Corrected Plan 1 CompositionalIntent (child 2 carries string keys, not empty breaks):**
```json
{ "shape": "composed", "composition": "multiply", "children": [
  { "shape": "arithmetic", "operation": "multiply",
    "operands": [ {"kind":"reference","source":{"type":"metric","field":"Monto_Total"}}, {"kind":"constant","value":1} ] },
  { "shape": "banded_lookup",
    "dimensions": [ {"reference_field":"Categoria","reference_source":{"type":"attribute","field":"Categoria"},
                     "keys":["ALI","BEB","LIM","CPE"]} ],
    "outputs": [0.025, 0.020, 0.030, 0.035] },
  { "shape": "conditional",
    "condition": {"reference":{"type":"scope_aggregate","field":"Monto_Total","boundary":"DNI_Vendedor","op":"sum"},"operator":"gte","threshold":150000},
    "then": {"kind":"constant","value":1.25}, "else": {"kind":"constant","value":1} } ] }
```

**HALT outcomes (R2):** HALT-CALC — not triggered (no engine evaluator edit; categorical dimension
constructs into existing `compare(eq)`/`conditional` primes). HALT-REGISTRY — not triggered (no
key-type enum, no shape-name addition). PG-R1 live (Plan 1 imports; `ruleSets=5`) = architect SR-44.

---

## §R3 — Construction-vocabulary eradication (LLM expresses, engine reads)

R1/R2 each *opened* the intent-construction vocabulary (added `multiply`, then `keys`) rather than
removing it. R3 **eradicates the vocabulary layer entirely**: the LLM emits the `calculationIntent`
PrimeNode DAG — the engine's universal computation algebra — **directly**; construction becomes
**structural verification** (`validatePrimeTree`), not shape-matching; the engine evaluates. The R1/R2
shape extensions are unwound (they were registry growth). **Safe-by-default:** the change is
import-path-only — no persisted plan, no rule_set, and no evaluator (`intent-executor.ts`) is touched →
existing BCL/MIR calc is byte-identical until a re-import (the architect's SR-44 / HALT-CALC gate).

### Eradication inventory (V1–V9)

| V | Registry | Disposition |
|---|----------|-------------|
| V1 | shape vocabulary `{arithmetic, banded_lookup, conditional, composed}` + `constructTree` switch | **DELETED** — `intent-constructor.ts` (873 lines) + `compositional-intent.ts` shape types (437) removed; the LLM emits PrimeNode DAGs; `plan-orchestration` routes them through `validateComponentIntent`. |
| V2 | composition mode `{add, multiply}` (`ComposedDescription.composition`) | **DELETED** — multiplicative stacking is `arithmetic(multiply, …)` in the DAG; no mode field. |
| V3 | reduction whitelist `validReductions` + `'sum'` default | **DELETED** — `ReductionKind`→open string; op carried verbatim; consumer fails loud (C2) on an unexecutable op (every live op byte-identical). |
| V4 | dimension key type `{breaks XOR keys}` | **DELETED** with the shape layer — a category select is a `conditional(compare(eq,…))` cascade; a numeric tier is a half-open `gte` cascade. |
| V5 | condition operand type `{numeric, categorical}` | **DELETED** with the shape layer — `compare` already evaluates numeric and string operands (OB-220). |
| V6 | modifier-shape enum `{cap, floor, …}` | Opened to `string` in R1; PG-11 grep clean. A modifier is `arithmetic`/`conditional` in the DAG. |
| V7 | component fold `c0+…+cN` | Not reintroduced; multiplicative composition lives in the DAG (R2 ADR-2 within-component; engine fold untouched). |
| V8 | entity-id lowest-cardinality heuristic (`commit-content-unit.ts`) | **DELETED** — entity-id is the LLM `identifies`-scope column (`findHcEntityIdColumn`), verified structurally (column exists in rows); no cardinality override. |
| V9 | shape-specific TS types | **DELETED** with `compositional-intent.ts`. |

### PG evidence (CC in-PR — PG-8..14, PG-19)

```
PG-8  (no shape vocabulary): git grep StructuralDescription|*Description union|IntentShape|constructTree
        → zero non-comment hits; intent-constructor.ts + compositional-intent.ts DELETED.
PG-9  (no reduction whitelist): git grep validReductions → zero (only the explanatory comment).
PG-10 (no key-type constraint): git grep dimBandCount|BandedLookupDimension|"breaks XOR keys" → zero.
PG-11 (no modifier-shape enum): git grep "modifier: 'cap' |" intent-types.ts → zero (open string).
PG-12 (no composition-mode enum): git grep "composition: 'sum'"|ComposedDescription → zero.
PG-13 (no entity-id heuristic): git grep distinctRatio|entityScopeAlt|fallbackAlt → zero.
PG-14 (structural verification only): validatePrimeTree — audit below.
PG-19: tsc --noEmit 0 · next lint 0 errors · next build clean (210/210) · npm test 282/282
        (incl. 12 R3 tests: the engine evaluates the eradicated-form DAGs AND the verifier rejects
         drift — terminal_completeness / decision_127 / HF-279 — critical).
```

### PG-14 — Validation Premise audit of every surviving construction check (`validatePrimeTree`)

Each check passes the acceptance test (*can a developer make it more complete by editing a list?* → No):
- **unknown_prime** — the node's `prime` is in the engine's algebra (referential resolution against the
  evaluator's vocabulary). Structural. The 9-prime set is the universal alphabet (Decision 24/155), not a
  domain taxonomy — it composes, it does not enumerate plan shapes.
- **op_unknown** — the `op` is in its prime's operator set (arithmetic `+−×÷`, compare `gt/…/eq`, aggregate
  `sum/…/max`). The algebra's operators, mirroring the evaluator. Structural.
- **arity** / **child_topology** — input count and required child slots match the prime's shape (operation
  arity / well-formedness). Structural.
- **decision_127** (critical) — band-selection uses gte+lt (half-open). The tier-resolution correctness
  invariant; gte/lt is the algebra of half-open intervals. Structural.
- **scale_annotation + HF-279** (critical) — a scale carrier is well-formed (self-description sufficiency),
  and a ratio-source band carries no scale (node-topology coherence: divide + scaled-constant). Structural.
- **terminal_completeness** (critical) — every conditional else-chain terminates in a constant (the
  conditional is total; no undefined fallback). Structural (conservation).
- **exhaustive_emission** (critical) — leaf count ≥ the declared rate-table cell count (the tree carries
  every declared cell; no silent truncation). Structural (conservation).

No check enumerates a domain set a developer extends. The verifier verifies structure; it does not match shapes.

### The MIR Plan 1 DAG (the actual PrimeNode the engine evaluates — no shape name)

```
arithmetic(multiply,
  reference(Monto_Total),
  arithmetic(multiply,
    conditional(compare(eq, reference(Categoria), constant("ALI")), constant(0.025),
      conditional(compare(eq, reference(Categoria), constant("BEB")), constant(0.020),
        conditional(compare(eq, reference(Categoria), constant("LIM")), constant(0.030),
          conditional(compare(eq, reference(Categoria), constant("CPE")), constant(0.035),
            constant(0))))),
    conditional(compare(gte, reference(monto_acum), constant(150000)), constant(1.25), constant(1))))
```
Amount × category-rate × accelerator — a category select is a conditional cascade (not a "banded_lookup"),
a multiplicative stack is nested arithmetic (not a "composed:multiply" mode). Verified by synthetic test:
`10000 × 0.030 (LIM) × 1.25 (≥150K) = 375`; below threshold `× 1.00 = 300`; zero base `= 0`.

### Safety net (shipped FIRST, R3-1) + BCL byte-identical

`constructTree`'s three by-construction guarantees — Decision-127 half-open, HF-279 single-site/ratio-band
scale, terminal completeness — were elevated warning→**critical** in `validatePrimeTree` BEFORE the prompt
pivot, so a directly-emitted DAG that would drift is **rejected loudly at import** (C2), never silently
persisted (proven by the 3 drift-rejection tests). **BCL byte-identical:** R3 touches no persisted
rule_set and no evaluator (`intent-executor.ts` unchanged across R3); `resolveColumnFromBatch` is
byte-identical for `sum` (BCL's op). Existing calc is unchanged by construction; the architect re-imports
BCL + MIR under the new prompt and confirms $312,033 / Plan 2 = 210,000 (PG-1..7) before merge.

### HALT outcomes (R3)
- **HALT-CALC** — not triggered by construction (import-path-only; evaluator + persisted plans untouched).
  Architect confirms BCL/Plan-2 on re-import.
- **HALT-ENGINE** — not triggered; the evaluator already evaluates every well-formed DAG the verifier passes
  (no evaluator extension needed — the eradicated-form DAGs use only existing primes).
- **HALT-COLLISION / HALT-API** — none.

### Residuals (R3 §6A)
1. **Plan 5 magnitude** — a cross-period clawback concern independent of vocabulary; if it persists after
   re-import it is a convergence/cross-period-reference defect, reported separately (the magnitude guard is
   not a vocabulary concern). 2. **Robles engine arc** — distribution evaluator / tope / streak / reversal,
   downstream. 3. **Progressive Performance** — the plan-interpretation caches key on file bytes / component
   id, NOT shape names (verified), so eradication does not break them; `construction_method='prime_dag'` is
   set as the provenance marker. A cross-plan DAG-topology fingerprint (none exists today) would key on the
   prime-discriminator multiset / arity / depth — net-new, out of R3 scope.
