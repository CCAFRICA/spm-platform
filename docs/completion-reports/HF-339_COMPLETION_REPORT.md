# HF-339 — Validator Premise Correction: Verification, Not Registry — COMPLETION REPORT

> **⚠ SEQUENCE REASSIGNMENT — HF-338 → HF-339 (architect ratification pending).**
> The directive was handed to CC as **HF-338**. The number **HF-338 is sealed-allocated to "Sabor production timing"** (the DIAG-075 JS→SQL-RPC summary-aggregation scale fix / **G-TIME** architect gate) in **merged HF-337 §6** and the HF-337 completion report (`G-TIME: Sabor 272s production-timing → HF-338`). Keeping HF-338 for this validator work would **move a sealed number** — a §4 premise failure. Per the §0 *Sequence resolution* clause (bounded authority, not a halt), CC derived the next free HF number from the live directory (`ls docs/vp-prompts/ | grep -oE 'HF-[0-9]+' | sort -t- -k2 -n | tail -1` → HF-338 → increment) and **reassigned this work to HF-339**.
> Resolved self-references: branch **`hf-339-validator-premise`**; directive **`docs/vp-prompts/HF-339_DIRECTIVE_20260623.md`** (renamed, body preserved verbatim with banner); report **this file**; commit prefixes **`HF-339 …`**. References to *HF-338 as the Sabor-timing fix* are correct and untouched. **Architect action:** ratify the reassignment, or instruct renumber.

**Branch:** `hf-339-validator-premise` · **Base:** `main` · **Pre-change code SHA:** `e136717d` · **Date:** 2026-06-24
**Category:** HF (structural-class correction) · **Mode:** ULTRACODE `/effort` (autonomous, workflow-orchestrated)

---

## 1. ADR — Architecture Decision Gate (committed before code, per Section B)

### Problem
PrimeValidator warns `scale_annotation` ("Constant in compare position lacks `meta={unit,scale,confidence}`. Convergence may need to infer scale.") on **every gate/rate constant** because plan construction emits compare-constants as **bare scalars** — the unit the model recognized (`"80%"`) is dropped. The validator then flags the correct-but-stripped value as non-conformant; the reflexive remedy (re-annotate the scalar) **re-laundements the strip back into conformance and, for convergence-side constants, re-introduces the HF-274 double-scaling bug**. The implicit "percentages are stored as decimals" convention behind `meta.scale`, and the enumerated unit set `ScaleUnit = 'percent'|'ratio'|'currency'|'count'`, are a **developer-maintained registry** (AP-26 / No-Fixed-Taxonomy / Korean Test). The validator is not catching a defect — it is validating the defective transformation in, under a PASS.

### Substrate facts that shaped the decision (Prove-Don't-Describe)
- **The strip site is a single function:** `buildConstantWithScale` (`web/src/lib/plan-intelligence/intent-constructor.ts:644-694`). It attaches `meta` on exactly ONE narrow path (`scale` present ∧ `applyMeta` ∧ `scale.side==='evaluator'` ∧ ¬DAG-divide ∧ `reference_field` matches). On **four** early-return branches it emits `{ prime:'constant', value }` — bare. Band-output leaves (`:262-263`) and `constant(0)` terminators (`:280`) never carry `meta`.
- **The compare-time normalization already exists and is already unit-agnostic.** The evaluator (`intent-executor.ts:235-243`, OB-200 Phase 2) reconciles scale by reading **only `meta.scale` (a number)** — `isConstantWithMeta` checks `typeof node.meta.scale === 'number'`; **it never reads `meta.unit`.** When neither operand carries `meta` it compares as-is (correct for convergence-side constants, whose data column was already normalized by the convergence binding's `scale_factor` in `run-calculation.ts` — re-attaching `meta` there would **double-scale**, the HF-274/277/279 bug).
- **The conditional omission is therefore partly legitimate.** "Stop stripping" cannot mean "always attach `meta.scale`" — that reintroduces double-scaling. It means: **carry the value's self-describing nature always; attach the evaluator-side numeric `scale` exactly as HF-279 already decides.**
- **`unit` has no computational consumer.** Freeing `ScaleUnit` from a closed enum to a free-form string is **calc-neutral** — the only reader of `meta` (the evaluator) consumes `meta.scale` and ignores `meta.unit`.
- **There is no "infer scale from distribution" implementation.** The phrase in `prime-validator.ts:14` / `prime-grammar.ts:358` describes the compare-as-is fall-through trusting the convention. The only other scale site is `run-calculation.ts` `scale_factor` (convergence path) — the **calc reader, C6-immutable, not touched**.

### The Validation Premise Law — and a sharpened acceptance test
A check is **VERIFICATION** when it validates against carried reality (existence; **referential resolution to a live executor/row, not a catalog**; traceability; conservation; self-description-sufficiency) — holds identically in every domain/language, nothing grows. It is a **REGISTRY** when it gates `x ∈ {enumerated developer-maintained set}` of **domain values** a developer edits to admit a new valid case.

The literal test ("can a developer edit a list to extend it?") is **necessary but not sufficient** — by itself it would condemn the file-upload `.exe` deny-list (security), the period-lifecycle `VALID_TRANSITIONS` (a finite state machine), and `CANONICAL_ROLES` (the RBAC basis), none of which are the harm the law targets. The **operative criterion** (directive §1) is: *does the check reject a **novel-but-correct expression the recognizer exists to produce**, on the plan-recognition → construction → calc path?* A deliberate security/authorization/state boundary does not; a domain-vocabulary gate on the adaptive-intelligence path does. **Enforcement targets the latter; the former is classified and kept with rationale.**

### Options
- **Option A — Annotation (satisfy the check).** Make construction always re-attach `meta={unit:…,scale:…}` so the warning clears. **REJECTED:** re-laundements the strip; reintroduces HF-274 double-scaling on convergence-side constants; keeps the enumerated `ScaleUnit` registry. This is the reflexive remedy the directive names as the disease.
- **Option B — Subtraction + carry (CHOSEN).** (1) Open the unit from the closed `{percent,ratio,currency,count}` enum to a **free-form nature string** (the model's own terms, any language) — at the type, the prompt, and the compositional spec. (2) In `buildConstantWithScale`, **carry the self-describing nature on the constant always** (all four current strip branches), while leaving the evaluator-side numeric `scale` attachment **exactly as HF-279 decides** (no double-scale). Make `meta.scale` optional so a nature-only constant carries its nature without triggering evaluator scaling. (3) **TRANSFORM** the `scale_annotation` check from "carries `meta` from the enum" to **self-description-sufficiency** ("the compare operand carries a free-form nature") — post-carry it passes; it never gates a unit against a set. (4) Compare-time normalization is the **existing** `meta.scale` mechanism — calc reader untouched.
- **Option C — Delete the whole check + harden the evaluator to fail-loud on any unrecognized op/scale.** REJECTED for this HF: hardening the evaluator's op-defaults touches the **calc reader (C6 / HALT-CONSTRUCTION)** and exceeds the named defect; the existing as-is path is correct for convergence-side.

**CHOSEN: Option B.** It is the directive's "subtraction plus carry, not annotation," it is **calc-neutral by construction** (the `meta.scale` machinery and every value the evaluator reads are byte-identical; the addition is a free-form field the evaluator ignores), it respects **C6** (no calc-reader edit → **HALT-CONSTRUCTION avoided**), and it eliminates the registry at its source so the carry cannot re-enter it.

### The carried-nature representation (the design question CC owns)
`ConstantScaleMeta` becomes `{ unit: string /* free-form nature, model's own terms */; scale?: number /* evaluator-side normalization factor, attached only when HF-279 says so */; confidence: number }`.
- **How the nature travels:** recognition resolves the value's native nature → carried on the component `ScaleSpec.unit` (now free-form) → `buildConstantWithScale` writes it onto every compare-constant's `meta.unit` (always), and writes `meta.scale` only on the evaluator-side path (unchanged).
- **How deterministic code normalizes without a unit set:** the **numeric `scale`** is the structurally load-bearing part — the evaluator multiplies the opposing operand by `meta.scale` (a number), never matching `unit` against a set. Compatibility is structural (does the operand carry a normalizable scale?), not membership. The free-form `unit` rides along for **self-description + trace + confidence**, consulted by **no** set-membership gate. **No enumerated unit/scale set survives anywhere in the changed path.**
- **Edge cases (directive §6A #2):** compound/derived natures (rate-of-a-ratio, currency-per-unit) carry a free-form descriptor; the quotient-space (DAG-divide) omission stays per HF-279. Confidence-on-the-nature surfacing (§6A #3) is noted, not built.

### Governing Principles evaluation
- **G1/G2 (architectural compliance):** the deterministic normalization (numeric `scale` at one site) *is* the reconciliation control; no policy convention is shared. **G4 (discipline):** open-vocabulary recognition (AP-26) + numeric scale arithmetic. **G5 (abstraction/Korean Test):** the carried nature is the model's own free-form terms in any language; nothing is matched against a developer set. **AP-26 / Decision 158:** construction produces a self-sufficient artifact; recognition's understanding is guaranteed, not deferred to a convention match.
- **HALT-NORM did NOT fire:** a self-describing, structurally-compared normalization is achievable without an enumerated set (the numeric `scale` carries the structure). No locked-vs-locked fork.

### Boundaries honored
**C6** (calc reader immutable — `intent-executor.ts` and `run-calculation.ts` untouched; the existing `meta.scale` read is byte-identical). **HALT-CONSTRUCTION avoided.** **HALT-COLLISION did NOT fire** (see §3). **op_unknown / decision_127 / unknown_prime kept** as referential/structural (see Inventory) — deleting `op_unknown` naively would create a C2-violating silent-wrong path (the evaluator returns `false`/`0` on an unrecognized op), so it is the fail-loud authority and is retained.

---

## 2. THE CHECK INVENTORY (Tier 0 — every validator swept; 110 checks classified)

Swept via the directive grep (`function/const …Validat… | …Validate…(`) over `web/src` — **31 validator files, 110 checks: 86 VERIFICATION, 5 TRANSFORM, 19 REGISTRY (21 actionable rows after dedupe).** Classification by the Validation Premise Law + the sharpened harm criterion. Predicates pasted verbatim (Prove-Don't-Describe).

### 2A. ENFORCED this HF — the plan-interpretation / calc-construction path (CC's named files, non-in-flight)

| check (file:line) | pasted predicate | classification | disposition |
|---|---|---|---|
| `prime-grammar.ts:352-362` `scale_annotation` | `if (prime === 'constant' && parentPrime === 'compare') { const meta = obj.meta; if (meta === undefined || meta === null) { violations.push({ check:'scale_annotation', … 'Constant in compare position lacks meta={unit,scale,confidence}…', severity:'warning' }); } }` | **TRANSFORM** — currently presence-of-the-enum-record; intent is self-description-sufficiency. THE defect. | **transform → self-description** (assert the operand carries a free-form nature; no unit-set membership) |
| `intent-types.ts:373-377` `ConstantScaleMeta.unit` | `interface ConstantScaleMeta { unit: 'percent' \| 'ratio' \| 'currency' \| 'count'; scale: number; confidence: number; }` | **REGISTRY** — closed unit enum; a developer edits the union to admit a new unit. The registry surface. | **delete the enum** → `unit: string` (free-form); `scale?` optional |
| `prime-grammar.ts:202-208` `ScaleUnit` / `ScaleMetadata` | `export type ScaleUnit = 'percent' \| 'ratio' \| 'currency' \| 'count';` | **REGISTRY** — re-declaration of the same closed enum. | **delete the enum** → free-form |
| `compositional-intent.ts:190-196` `ScaleSpec.unit` | `export interface ScaleSpec { side:'evaluator'\|'convergence'; unit: ConstantScaleMeta['unit']; value:number; confidence:number; reference_field?:string }` | **REGISTRY** (inherits the enum) | **free-form** via the freed `ConstantScaleMeta['unit']` |
| `intent-constructor.ts:644-694` `buildConstantWithScale` (4 strip branches) | `if (!applyMeta \|\| !scale) return { prime:'constant', value }; … if (!attach) return { prime:'constant', value }; … if (scale.reference_field && scale.reference_field !== fieldOnOtherSide) return { prime:'constant', value };` | **TRANSFORM** (carry-not-strip site) | **carry the free-form nature always**; keep HF-279 numeric-scale attachment unchanged |
| `prime-grammar.ts:519-523` + `anthropic-adapter.ts:555` (prompt) | `… "unit": "percent\|ratio\|currency\|count" …` / `Units: "percent" \| "ratio" \| "currency" \| "count".` | **REGISTRY** (prompt-layer; Rule 27 / HF-195 — recognition constrained to a developer set) | **free-form nature** instruction (model names the nature in its own terms) |

### 2B. ENFORCED-path checks KEPT — referential / structural / conservation (CC adjudication; agents leaned delete on op/decision_127 — overruled with rationale)

| check (file:line) | pasted predicate | classification | why KEEP |
|---|---|---|---|
| `prime-grammar.ts:268-277` `unknown_prime` | `if (typeof prime !== 'string' \|\| !VALID_PRIMES.has(prime as PrimeNode['prime'])) { violations.push({ check:'unknown_prime', … severity:'critical' }); return; }` | **VERIFICATION** (referential) | `VALID_PRIMES` is the engine's irreducible node-kind basis (the same union the evaluator's `isPrimeNode` + dispatch use, and `intent-executor.ts:377` throws on it too). Not a domain vocabulary; does not grow with tenants/languages. Referential resolution to the live executor basis — the sanctioned canonical vocab (Rule 27). |
| `prime-grammar.ts:287-305` `op_unknown` | `if (rule.ops) { … if (!op \|\| !rule.ops.includes(op)) { violations.push({ check:'op_unknown', … requires op in {${rule.ops.join(', ')}} …, severity:'critical' }); } }` | **VERIFICATION** (referential, fail-loud authority) | `rule.ops` is the engine's closed operation algebra (arithmetic 4, compare 6, logical 3, aggregate 5, filter 7) — math basis, not domain vocab; identical in every language. It is also the **fail-loud authority over the evaluator's silent op-defaults** (`intent-executor.ts:222/252/264` return `false`/`0` on an unrecognized op). Deleting it without hardening the calc reader would create a **C2 silent-wrong** path. Retained; converting to a single-source referential resolution (or delete+executor-hardening) is a C6-adjacent follow-on. |
| `prime-grammar.ts:367-384` `decision_127` | `if (ops.includes('lte') \|\| (!ops.includes('gte') && !ops.includes('lt'))) { violations.push({ check:'decision_127', … must use gte+lt (half-open) …, severity:'warning' }); }` | **VERIFICATION** (mathematical-structural) | Half-open-interval correctness (Decision 127 LOCKED, GP-2 research-derived: half-open intervals tile a continuous range with no gaps/overlaps). Domain-invariant — every banded lookup in any domain should be half-open. Warning-only. Not a domain registry. |
| `prime-grammar.ts:308-347` `arity`/`input_type`/`child_topology` | `if (inputs.length !== rule.arity.count) {…'expects exactly N inputs'} … if (child === undefined) {…'missing required child'}` | **VERIFICATION** (structural well-formedness) | Structural arity/topology; nothing enumerated. |
| `prime-grammar.ts:386-411` `terminal_completeness` | else-chain walk asserting termination in `constant` | **VERIFICATION** (structural completeness) | No set. |
| `prime-grammar.ts:418-434` `exhaustive_emission` | `if (constantLeafCount < opts.expectedCellCount) {…'declares N cells but … only M constant leaves'}` | **VERIFICATION** (conservation) | Parts-vs-declared-whole conservation (BCL C0 truncation guard). No set. |

### 2C. Identified registry-class, DEFERRED (record-not-touch) — with reason

| check (file:line) | class | reason deferred (not enforced here) |
|---|---|---|
| `ai-plan-interpreter.ts:230-234` `normalizeScope {employee,store,company}` | **REGISTRY** | **OB-214 interpreter territory (directive §6 OUT) + OB-196 in-flight marker (`:51`).** Clear domain registry on the legacy `RequiredInput` path; candidate follow-on. |
| `ai-plan-interpreter.ts:236-240` `normalizeDataType {number,percentage,currency}` | **REGISTRY** | Same unit-family as the HF-339 defect, but interpreter-layer (OB-214) + in-flight. Recorded; follow-on. |
| `ai-plan-interpreter.ts:173-186, 496-503` `normalizeComponentType / convertComponent → isRegisteredPrimitive(FOUNDATIONAL_PRIMITIVES)` | REGISTRY-form / **sanctioned** | `FOUNDATIONAL_PRIMITIVES` is the canonical primitive registry (Rule 27 sanctions deriving from it). Interpreter-layer + in-flight. Not touched. |
| `intent-validator.ts:64,181,368,440` `FOUNDATIONAL_PRIMITIVES / VALID_SOURCES / validOps / validAggs` | **REGISTRY** | **Dead in production** — `intent-validator.ts` is imported only by `web/scripts/ob78/ob80/ob81*` test scripts, not the live pipeline (the live path is `validatePrimeTree`). Recorded; deleting touches test infra only; low-value follow-on. |
| `validation-engine.ts:50-58, 83-156` `DEFAULT_SCHEMA / type-union` | **REGISTRY** | Data-quality layer with an English demo schema (`repId/amount/date`); liveness on the real pipeline unconfirmed. Recorded; follow-on. |
| `validation-engine.ts:317-339` `commission rate ∈ [0,100]` / `rate > 50` warning | **TRANSFORM** (defect archetype) | A vivid **second instance** of the implicit "rates stored as percent 0-100" convention registry — data-quality layer, not the prime_dag construction path. Recorded as identified-class; follow-on. |
| `cheques-import-service.ts:131-144` boolean ∈ {0,1} | TRANSFORM-ish | Import data-type coercion (localization concern), not a plan-recognition gate. Deferred. |

### 2D. Identified set-membership, KEPT — deliberate boundary, NOT an adaptive-intelligence registry

| check (file:line) | pasted predicate | why KEEP |
|---|---|---|
| `file-validator.ts:48,68-69` `REJECTED_EXTENSIONS / ACCEPTED_TYPES` | `const REJECTED_EXTENSIONS=['.exe','.bat','.sh',…]; if (REJECTED_EXTENSIONS.includes(ext)) return {valid:false,…}` | **File-upload SECURITY boundary.** Deleting it is a security regression. No recognizer produces "novel-but-correct executable uploads." Deliberate defense, kept. |
| `period-processor.ts:215-221` `VALID_TRANSITIONS` | `const validTargets = VALID_TRANSITIONS[period.status]; if (!validTargets.includes(toStatus)) return {success:false,…}` | **Finite state machine** for the period lifecycle. Transitions are structural, not domain vocabulary. Kept. |
| `provision-user.ts:51-55` `CANONICAL_ROLES` (via `resolveRole`) | `const r = resolveRole(role); if (!r) throw new ProvisionError('invalid_role', …)` | **RBAC authorization basis.** The five canonical roles are the platform's permission model, not an adaptive-intelligence vocabulary. Deleting breaks authz. Kept. |

*(The remaining 86 VERIFICATION checks across ingestion/import/data-architecture/reconciliation/payroll/observatory validators are structural presence/parseability/referential checks — kept; full per-file detail in the Tier-0 workflow transcript.)*

---

## 3. HALT-COLLISION outcome (Tier 0 convergence)

`git log` of each enforcement file against merge-base `e136717d`: **none** modified by #593/OB-233 (comprehension) or OB-235 (learning loop). Most recent touches are older merged work — `prime-grammar.ts` (OB-222), `prime-validator.ts`/`intent-types.ts` (OB-200/HF-325/HF-238), `intent-constructor.ts` (OB-225/HF-279/HF-277), `compositional-intent.ts` (OB-225/HF-279/HF-272), `anthropic-adapter.ts` (OB-231/HF-320/OB-225). **HALT-COLLISION did NOT fire** — the enforcement path is exclusively CC's. In-flight siblings surfaced by the sweep (`canonical-signal-writer.ts`, `insight-engine.ts`, `insight-validator.ts` on OB-235 P1 / #593; `ai-plan-interpreter.ts` on OB-196) are **recorded, registry-free-or-deferred, and not touched** (SR-34 / §6A #1).

---

## 4. Stripping trace (Tier 0 — Prove-Don't-Describe)

`"80%"` → interpreter emits a Decision-158 `CompositionalIntent`: the magnitude is a naked `threshold:number` / `breaks:number[]`, the unit survives only as one component-level `scale: ScaleSpec|null` (`compositional-intent.ts:124-196`) → `constructTree`→`buildConstantWithScale` (`intent-constructor.ts:644-694`) drops the unit to `{prime:'constant',value}` on four branches → the persisted compare node is a **bare scalar** → `intent-executor.ts:235-243` compares as-is (correct only under the implicit "metric pre-normalized" convention; the convergence `scale_factor` at `run-calculation.ts` having multiplied the ratio) → `validatePrimeTree` (`prime-grammar.ts:352-362`) warns `scale_annotation` on every such constant. **No "infer from distribution" code exists** — the phrase names the convention trusted blind.

---

## 5. Self-baseline (Tier 0 reproducibility anchor — CC's own numbers, not ground truth)
- Pre-change code SHA: **`e136717d`** (working tree: only the HF-339 directive doc committed; zero source edits).
- Calc test suite (deterministic, DB-free): **`tests 61 / pass 61 / fail 0`** (`node --test --import tsx 'src/lib/calculation/__tests__/**/*.test.ts'`). Re-run post-change must reproduce 61/61.
- Creds present (HALT-API clear): `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `web/.env.local`. MIR tenant `972c8eb0-e3ae-4e4c-ad30-8b34804c893a`.

---

## 6. Eradication log (Tier 1)

**Registry deleted / freed (the enumerated unit/scale set):**
- `intent-types.ts:374` — `ConstantScaleMeta.unit: 'percent'|'ratio'|'currency'|'count'` → `unit: string` (free-form nature).
- `prime-grammar.ts:202→208` — `ScaleUnit = 'percent'|'ratio'|'currency'|'count'` → `ScaleUnit = string`.
- `prime-grammar.ts:519-523` (`generatePromptGrammarSection`) — prompt "Units: percent|ratio|currency|count" → "describe it freely … there is no fixed set of allowed units."
- `anthropic-adapter.ts:555` — prompt `"unit": "percent|ratio|currency|count"` → free-form-nature instruction.

**Validator check TRANSFORMED (set-membership presence → open-vocabulary self-description):**
- `prime-grammar.ts:349-362` `scale_annotation` — was "warn if a compare-constant lacks meta" (false-positive on every stripped value; the remedy re-laundered the strip + re-introduced HF-274 double-scaling). Now "warn only if a carried meta lacks a well-formed free-form nature" — never flags a legitimately-bare constant, never matches a unit against a set (loud-fail-on-malformed-structure).

**Construction CARRY-not-strip (the `git diff` of intent-constructor.ts):**
- `intent-constructor.ts:644-705` `buildConstantWithScale` — the four strip branches (returned bare `{prime:'constant',value}`) collapse into: carry the model's nature on the coherent branches (evaluator-side → real `scale.value`; convergence-side non-DAG-divide → `scale:1` identity); stay bare only where no nature is coherent (DAG-divide quotient-space, field-mismatch). The numeric `scale` the evaluator reads is byte-identical to pre-fix on every branch → calc-neutral.

**Header/doc corrected (DD-9):** `prime-validator.ts:8-23` header item 3 rewritten to describe the self-description check; the stale "infers scale from distribution" line removed (no such code exists).

**Kept (CC adjudication, §2B): `op_unknown`, `decision_127`, `unknown_prime`** — referential to the engine's operation/primitive basis + mathematical-structural; not domain registries. `op_unknown` is additionally the fail-loud authority over the evaluator's silent op-defaults (deleting it would be a C2 silent-wrong regression).

## 7. PG evidence (pasted, verbatim)

### Proof M — MIR (the proof tenant), validator slice — **PASS**
`npx tsx scripts/hf339-mir-validator-proof.ts` (service-role read of MIR `972c8eb0`, new `validatePrimeTree` over the 5 real stored plans):
```
  [PLAN DE COMISIONES POR VENTA MAYORISTA] compare-constants=4 | OLD scale_annotation warnings=4 | NEW=0 | criticals=0
  [PLAN DE AJUSTES Y DEVOLUCIONES (CLAWBACK)] compare-constants=1 | OLD=1 | NEW=0 | criticals=0
  [Plan de Incentivo por Cobranza]           compare-constants=1 | OLD=1 | NEW=0 | criticals=0
  [Monthly Quota Bonus Plan]                 compare-constants=3 | OLD=3 | NEW=0 | criticals=0
  [PLAN DE BONO POR CARTERA NUEVA]           compare-constants=0 | OLD=0 | NEW=0 | criticals=0
=== TOTALS === components=6 | compare-constants=9 | bare=9 | OLD scale_annotation warns=9 | NEW=0 | criticals(NEW)=0
PROOF M (validator slice): ZERO scale_annotation warnings on MIR real plans.
```
This **reproduces the directive's symptom exactly** ("PrimeValidator warning on every gate and rate constant across all five plans" = 9 bare compare-constants → 9 OLD warnings) and shows the fix drives it to **0**. **Architect-gated remainder (SR-44):** clean-slate SQL + reimport of the 5 plan PDFs through the live `finalize-import` spine, then the **January 2025 calc total reported verbatim for reconciliation against the sealed figure** (the calc route is auth-gated — G-BCL/headless-401 class; CC holds no MIR ground truth). The script re-runs post-reimport to confirm zero warnings on the freshly-constructed (nature-carrying) prime_dags.

### Proof B — BCL neutrality (reproducibility) — **PASS (CC slice); live recalc → architect G-BCL**
The fix is **calc-neutral by construction**: the calc reader (`intent-executor.ts` / `run-calculation.ts`) is **untouched (C6)** and consumes ONLY `meta.scale`; my changes never alter `meta.scale` on any branch (evaluator-side = `scale.value`, unchanged; elsewhere = `1` identity or bare — the same value the reader saw pre-fix). Evidence:
- **Self-baseline reproduced:** the 61 pre-existing calc tests pass identically pre/post (`tests 66 / pass 66 / fail 0` = 61 baseline + 5 new HF-339 tests; 0 fail).
- **Calc-neutrality unit test (hf339-validator-premise.test.ts #4):** an identity-scale carried constant evaluates **byte-identically to a bare constant** (`1.1 >= 100 → 0` both); a real evaluator scale still applies (`1.1×100=110 >= 100 → 1`).
- **HF-279 invariants intact:** all ratio/DAG-divide-band tests still assert no evaluator rescale.
- **Architect G-BCL:** authenticated BCL reimport+recalc reconciled against the sealed figure (auth-gated route; the pre-existing G-BCL gate from HF-337). Any movement → HALT-CALC (not observed in the CC slice).

### Proof S — subtraction + recognition (class proof) — **PASS**
- **Subtraction grep** (directive pattern over the changed validator+construction files) returns ZERO enumerated unit/scale set-membership gates. Surviving matches enumerated and shown structural in §8.
- **Recognition-not-registry** (hf339-validator-premise.test.ts):
```
✔ (1) recognition-not-registry: a NOVEL free-form nature passes validation       (basis_points / 비율 / puntos porcentuales / per-mille → 0 violations)
✔ (1b) the retired enum values are still valid free-form strings (no regression)
✔ (2) no false positive: a BARE compare-constant raises NO scale_annotation warning
✔ (3) loud-fail on malformed structure: meta present but no nature → warns
✔ (4) calc-neutrality: identity-scale carry == bare; real evaluator scale still applies
tests 5 / pass 5 / fail 0
```
A comparison whose unit-nature the OLD closed set would not have contained (`basis_points`, Korean `비율`) now **passes by recognition** where it would previously have been constrained to `{percent,ratio,currency,count}`.

## 8. Korean Test / No-Fixed-Taxonomy grep (changed validator + construction)
`grep -rEn "\b(unit|scale|op|shape|severity|type|role)\b\s*(===|==| in | includes|\.has\()"` over the 5 changed files — every surviving match enumerated as **structural (non-domain-set)**:
- `prime-grammar.ts:299` `typeof obj.op === 'string'` — type check, not set-membership.
- `prime-grammar.ts:307` `op in {rule.ops…}` — the kept `op_unknown` **referential** check (engine operation algebra, §2B); the gate is `rule.ops.includes(op)`, the engine's own closed math basis, single-sourced from `PRIME_GRAMMAR`.
- `prime-grammar.ts:389` `cond.prime === 'logical' && cond.op === 'and'` — structural **dispatch** over the engine's own node kinds (decision_127).
- `prime-grammar.ts:456` `v.severity === 'critical'` — the validator's internal 2-value severity, not a domain vocabulary.
- `intent-constructor.ts:328,428` `reference_source.type === 'ratio'`, `dimIdx === 0` — structural reference-source/index **dispatch** (HF-279 quotient-space detection).
- `compositional-intent.ts:317,329,333` `reference_source.type === 'ratio'`, `obj.shape === 'banded_lookup'` — structural shape/source dispatch (the comment at :317 reads "Korean Test: keys on reference_source.type").
- `ScaleUnit = string` (`prime-grammar.ts:208`) — the **freed** type (the registry, eradicated).
**No enumerated unit/scale domain set-membership gate survives.** Korean-test prebuild gate: `PASS: zero hardcoded legacy primitive-name string literals outside registry`.

## 9. ARTIFACT SYNC delta (CC emits; architect applies — channel boundary)
- **Decision (candidate):** *The Validation Premise Law* — a validation check is legitimate only when it validates against carried reality (existence, referential resolution to a live executor/row, traceability, conservation, self-description-sufficiency); illegitimate when it gates `x ∈ {enumerated developer-maintained domain set}`. **First enforcement: HF-339.** Sharpened operative test: enforce on the recognition→construction→calc path (where a registry rejects novel-but-correct expressions); deliberate security/auth/state boundaries (file-type deny-list, RBAC roles, lifecycle FSM) are NOT registries.
- **Anti-Pattern (candidate, extends AP-26):** *Validator-of-anticipated-forms* — a post-recognition validator that re-checks the recognizer's output against an enumerated set of permitted values it duplicates; it rejects the novel-but-correct output the recognizer exists to produce. Correct pattern: structural verification + open-vocabulary + loud-fail-on-malformed-structure.
- **Capability row:** "Plan-interpretation validator = verification, not registry" — PrimeValidator's scale check is self-description-sufficiency; the unit nature is open-vocabulary, carried at construction.
- **R1 / Board / Mission Control:** record HF-339 (validator premise correction) merged-pending; note the **HF-338→HF-339 reassignment** for ratification; note the deferred-class follow-ons (§2C) and the architect gates below.

## 10. HALT outcomes
- **HALT-COLLISION:** NOT fired — enforcement files untouched by #593/OB-233/OB-235 (§3).
- **HALT-NORM:** NOT fired — a self-describing, structurally-compared normalization (numeric `scale` carries the structure) was achievable without an enumerated set; no locked-vs-locked fork.
- **HALT-REGISTRY:** NOT fired — the registry deletion is structural (free-form nature); no locked rule contradicted.
- **HALT-CONSTRUCTION:** NOT fired — un-stripping required NO calc-reader edit (the evaluator already consumes only `meta.scale`).
- **HALT-CALC:** NOT fired in the CC slice — 61/61 reproduced, identity-scale proven byte-identical. (Live BCL recalc → architect G-BCL.)
- **HALT-API:** clear — `ANTHROPIC_API_KEY` present (§5).
- **Sequence reassignment (HF-338→HF-339):** resolved from the live directory per §0 (not a halt); flagged at top for ratification.

## 11. Architect gates outstanding & PR
- **G-CLEAN-MIR / G-MIR-CALC:** apply MIR clean-slate SQL + reimport the 5 plan PDFs through `finalize-import`; report the January 2025 calc total verbatim for reconciliation against the sealed figure (CC holds no MIR ground truth). Re-run `hf339-mir-validator-proof.ts` to confirm zero warnings on the reconstructed plans.
- **G-BCL:** authenticated BCL reimport+recalc reconciled against the sealed figure (auth-gated; pre-existing from HF-337). Movement → HALT-CALC.
- **Ratify** the HF-338→HF-339 reassignment and the ARTIFACT SYNC delta (§9).
- **PR:** _(filled at close)_
