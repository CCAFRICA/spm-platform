# HF-320 Completion Report — Plan Interpretation Prompt: Registry-Pattern Subtraction

**Date:** 2026-06-20 · **Branch:** `hf-320-prompt-subtraction` · **Implementation SHA:** `30ce3d63`
**Status:** Built, tsc clean, `next build` exit-0 (198/198), Korean-Test PASS. **NOT merged** (SR-44). Subtraction-only; constructor/transformer/resolver untouched.

> **C6 reconciliation-channel separation:** this report states computed values and structural observations verbatim. It makes no pass/fail claim on numeric accuracy and no comparison to architect-held anchor values.

---

## PG-1 — PROMPT INVENTORY (classification, BEFORE)

The active plan-interpretation prompt = `plan_component` (`anthropic-adapter.ts:485-663`) + its injected blocks: `<<COMPONENT_TYPE_LIST>>` and `<<PRIME_GRAMMAR>>` (`generatePromptGrammarSection`, `prime-grammar.ts:463-629`). (`plan_skeleton` extracts a component index only — no calculationIntent, no catalog. The legacy `plan_interpretation` + chunking prompts are retired/not called; their injected `<<FOUNDATIONAL_PRIMITIVES>>`/`<<STRUCTURAL_EXAMPLES>>` do not reach the active path.)

| # | Block (first words) | Location | Class | Words | Provenance | Disposition |
|---|---|---|---|---|---|---|
| 1 | "You are interpreting ONE component… Per Decision 158…" | adapter 485-487 | INFRASTRUCTURE | ~55 | HF-251 | keep |
| 2 | "CRITICAL: Extract EVERY structural value… constructor validates…" | adapter 489 | STRUCTURAL-CONSTRAINT | ~70 | HF-251 | keep |
| 3 | "EMISSION DISCIPLINE… Reference ONLY the numeric measures… Use ReferenceSource.type values…" | adapter 491-493 | GRAMMAR-GENERATIVE | ~70 | HF-252 | keep |
| 4 | "PER-ENTITY vs PER-ROW differentiation — DISTINGUISH THESE… categorized shape / filtered_aggregate (count rows WHERE Verificado='Si')…" | adapter 495-507 | **PATTERN-SPECIFIC** | ~190 | OB-225 | **REMOVE** |
| 5 | "When a component's rates differ by an ENTITY category… emit ONCE per category… applies_to semantics…" | adapter 509-516 | INFRASTRUCTURE (variant mechanism) | ~95 | HF-252 | keep (trimmed) |
| 6 | "`attribute` ReferenceSource… MUST NOT drive categorical payout differentiation." | adapter 518 | **PATTERN-SPECIFIC** | ~40 | OB-225 | **REMOVE** |
| 7 | "ACCELERATOR / MULTIPLIER folding… if total sales ≥ threshold multiply by 1.25 → conditional(...)" | adapter 520-526 | **PATTERN-SPECIFIC** | ~110 | OB-223 | **REMOVE** |
| 8 | "CLAWBACK / REVERSAL… returns/chargebacks MUST carry a temporal_adjustment modifier…" | adapter 528-535 | **PATTERN-SPECIFIC** | ~115 | OB-223 | **REMOVE** |
| 9 | shapes 1-4 banded_lookup/arithmetic/conditional/composed | adapter 543-575 | GRAMMAR-GENERATIVE | ~140 | HF-251 | keep |
| 10 | shape #5 `categorized` — "per-ROW category-differentiated rates… ALI/Alimentos" | adapter 577-582 | **PATTERN-SPECIFIC** | ~120 | OB-225 | **REMOVE** |
| 11 | Operand kinds (reference/constant/structure) | adapter 584-587 | GRAMMAR-GENERATIVE | ~30 | HF-251 | keep |
| 12 | ReferenceSource types list (metric/ratio/aggregate/filtered_aggregate/attribute/scope_aggregate/cross_data/prior_component) | adapter 589-597 | GRAMMAR-GENERATIVE | ~80 | HF-251/OB-225 | keep |
| 13 | Scale specification (HF-244) | adapter 599-601 | STRUCTURAL-CONSTRAINT | ~40 | HF-244 | keep |
| 14 | RATIO-SOURCE BANDS — quotient-space breaks, no scale (HF-279) | adapter 603-615 | STRUCTURAL-CONSTRAINT | ~150 | HF-279 | keep |
| 15 | "HOW TO DESCRIBE… There is NO catalog of component shapes… do NOT match the plan to a remembered kind of plan." | adapter 617 | GRAMMAR-GENERATIVE (anti-catalog) | ~70 | OB-216 | keep |
| 16 | REFERENCE TYPES prose (metric/ratio/aggregate/prior_component) | adapter 619-623 | GRAMMAR-GENERATIVE | ~140 | OB-216 | keep (+filtered_aggregate/metric) |
| 17 | STRUCTURAL SHAPES prose (arithmetic/conditional/clamp/banded/composed) | adapter 625-630 | GRAMMAR-GENERATIVE | ~180 | OB-216 | keep |
| 18 | THE COMPOSITION RULE (the generative core) | adapter 632 | GRAMMAR-GENERATIVE | ~100 | OB-216 | keep |
| 19 | SINGLE-PRIMITIVE FORMS (abstract placeholders, no field names) | adapter 634-637 | GRAMMAR-GENERATIVE (abstract) | ~70 | OB-216 | keep |
| 20 | Response shape JSON | adapter 639-657 | INFRASTRUCTURE | ~80 | HF-251 | keep |
| 21 | "DO NOT emit a calculationIntent PrimeNode tree… DO NOT encode role/category inside structure…" | adapter 659-663 | STRUCTURAL-CONSTRAINT | ~60 | HF-252 | keep |
| G1 | PRIME TABLE + NODE SHAPES (the ten primes) | grammar 467-481 | GRAMMAR-GENERATIVE | ~150 | HF-238 | un-injected (n/a to compositional_intent) |
| G2 | ENGINE AGGREGATION MODEL + "1. CATEGORY-DIFFERENTIATED RATES / 2. CONDITIONAL COUNT / 3. TEMPORAL ADJUSTMENT" | grammar 482-511 | **PATTERN-SPECIFIC** | ~330 | OB-222/223 | **REMOVE** (un-inject) |
| G3 | EXHAUSTIVE EMISSION / rateTableCellCount / SCALE METADATA / DECISION 127 | grammar 513-526 | STRUCTURAL-CONSTRAINT | ~280 | HF-244/D127 | un-injected |
| G4 | ILLUSTRATIONS **SC-01…SC-09** (4% of warranty sales; attainment bands; 2D matrix; product_type warranty/accessory; **$25 per transaction status=approved → count×25**; clawback) | grammar 528-629 | **PATTERN-SPECIFIC** | ~900 | HF-238 | **REMOVE** (un-inject) |

**HALT-1 check:** PATTERN-SPECIFIC blocks found = **8** (#4, #6, #7, #8, #10, G2, G4 — the SC catalog being the largest). The hypothesis (a catalog lives in the prompt) is **confirmed**, not refuted. HALT-1 does not fire.

---

## PG-2 — BEFORE / AFTER FULL TEXT

The complete verbatim before/after is the git diff of `web/src/lib/ai/providers/anthropic-adapter.ts` (commit `30ce3d63` vs `main`). Summary of the transformation:

**Removed from `plan_component` (adapter):** blocks #4, #6, #7, #8, shape #5, and the `<<PRIME_GRAMMAR>>` placeholder line.
**Why `<<PRIME_GRAMMAR>>` was un-injected (not merely trimmed):** `generatePromptGrammarSection` teaches **PrimeNode-tree emission** ("emit a calculationIntent field as a recursive PrimeNode tree", with SC-01…SC-09 worked trees in `{prime:...}` form). `plan_component` **explicitly forbids tree emission** ("Code constructs the PrimeNode tree — you do NOT emit the tree itself") and wants `compositional_intent` in `{shape:...}` form. The injection was therefore a *format contradiction* AND carried the bulk of the catalog (G2 + G4). It is irrelevant to compositional_intent emission and was removed from the active prompt. `generatePromptGrammarSection` itself is unchanged (still used by the retired prompts; out of the active path).

**AFTER `plan_component` (verbatim, the active prompt body):**
```
You are interpreting ONE component of a compensation plan and emitting a compact CompositionalIntent
that describes its structure. Code constructs the PrimeNode tree from your intent — you do NOT emit the tree itself.
Per Decision 158: LLM recognition + code construction…
CRITICAL: Extract EVERY structural value… (constructor validates breaks-vs-outputs cardinality)…
EMISSION DISCIPLINE (HF-252)… Use ReferenceSource.type values: metric, ratio, aggregate, filtered_aggregate, scope_aggregate, prior_component.
Some differentiation is PER-ENTITY… emit once per category and route via applies_to (below); do not encode it inside structure.
applies_to semantics: …
<<COMPONENT_TYPE_LIST>>
CompositionalIntent SHAPE: 1. banded_lookup  2. arithmetic  3. conditional  4. composed
Operand kinds: reference / constant / structure
ReferenceSource types: metric / ratio / aggregate / filtered_aggregate / attribute / scope_aggregate / cross_data / prior_component
Scale specification (HF-244) … RATIO-SOURCE BANDS (HF-279) …
HOW TO DESCRIBE THE STRUCTURE — … There is NO catalog of component shapes to match against …
REFERENCE TYPES — metric (read a field directly; not summed/counted/aggregated) / ratio / aggregate / filtered_aggregate / prior_component
STRUCTURAL SHAPES — arithmetic / conditional / clamp / banded_lookup / composed
THE COMPOSITION RULE (the generative core) … SINGLE-PRIMITIVE FORMS (abstract placeholders) …
Response shape JSON … DO NOT emit a PrimeNode tree … DO NOT encode role/category inside structure.
```
(Full byte-exact text in the committed file / git diff.)

**ADDED (grammar-generative only, C2-permitted — replace deleted grammar function):**
- REFERENCE TYPES gained a `filtered_aggregate` bullet: *"A value aggregated over only the rows that match a predicate → a filtered_aggregate reference; name the operation, the measure field, and the predicate. For a count of matching rows the operation is count and the measure field is omitted."*
- The `metric` bullet sharpened to: *"A single value read directly from one field — the field already holds the number; it is not summed, not counted, not aggregated → a metric reference."*

## PG-3 — LINE COUNT DELTA

| Segment | BEFORE | AFTER | Δ |
|---|---|---|---|
| `plan_component` template (adapter) | 179 | 136 | **−43** |
| `<<PRIME_GRAMMAR>>` injection (rendered into plan_component) | 167 | 0 | **−167** |
| Rendered active prompt (≈ template + injections) | ~352 | ~142 | **≈ −210** |

Delta is strongly **negative**. HALT-2 does not fire.

## PG-4 — ZERO PATTERN-SPECIFIC REMAINING (re-classification of AFTER)

Re-running PG-1 on the AFTER rendered `plan_component`: blocks #1,2,3,5(trimmed),9,11,12,13,14,15,16,17,18,19,20,21 + `COMPONENT_TYPE_LIST` (registry-derived list of active primitive types — structural, AP-5-compliant). Every block is GRAMMAR-GENERATIVE, STRUCTURAL-CONSTRAINT, or INFRASTRUCTURE. **PATTERN-SPECIFIC count = 0.** No block fails the Korean Test. (C7/AUD-009: a never-seen per-category-rate plan is now expressible as `composed(sum)` of `arithmetic(multiply(filtered_aggregate, constant))` from the four primitives + the composition rule — no example needed.)

## PG-5 — BCL c0/c1/c3 DAG-EQUIVALENCE

`scripts/ob-225-construct-verify.ts` (OB-225 method): **BCL 8/8 components byte-identical** — `constructTree(stored compositional_intent) === stored calculationIntent`, before and after. c0 (idx0 banded_lookup), c1 (idx1 banded_lookup), c3 (idx3 conditional) all exact. The prompt change touches neither `constructTree` nor the stored intents, so the construction path is provably unchanged. **HALT-4 does not fire.**
(Verbatim, C6: the script also reported `Meridian 0/0` — it found **no active Meridian rule_set components in the current DB**, a data-state condition orthogonal to a prompt-only change; not a DAG divergence.)

## PG-6 — BCL c2 STRUCTURAL INSPECTION (c2 = idx2, "Productos Cruzados", $25 × count)

**Current (BEFORE) c2 compositional_intent, verbatim** (CC does not interpret correctness — C6):
```json
{ "scale": null,
  "structure": { "shape": "arithmetic", "operation": "multiply", "operands": [
      { "kind": "reference", "source": { "op": "count", "type": "aggregate", "field": "productos_cruzados" } },
      { "kind": "constant", "value": 25 } ] },
  "applies_to": ["ejecutivo-senior"],
  "component_id": "c3-productos-cruzados-senior", "component_name": "Productos Cruzados", "output_precision": 0 }
```
**The specific question (does c2 use `reference` or `aggregate/count`?):** c2 currently uses **`aggregate` with `op: "count"`** on field `productos_cruzados` — it counts rows.

**AFTER (re-import) is architect-channel.** The BCL plan document is **not present in the repository**, and a re-import would overwrite the BCL rule_set that PG-5 just verified against — per S6, BCL ground-truth reconciliation is architect-channel post-merge. The architect re-imports on this branch and inspects the resulting c2. **Structural observation (not a correctness claim):** the removed catalog `SC-08` — *"$25 per transaction with status=approved" → filter→aggregate(count, "*") × 25* — is structurally identical to c2 ("$25 × count of productos_cruzados"); together with the `2. CONDITIONAL COUNT` prescription and the prime-tree format examples, it was a candidate count-bias source. The AFTER prompt instead presents `metric` ("read a field directly; not summed/counted/aggregated") and `aggregate` (summed/counted over a group) as neutral grammar choices, with no count exemplar.

## PG-7 — BUILD

`tsc --noEmit` exit 0. `npm run build` exit 0, **198/198 pages**, Korean-Test gate PASS.

---

## HALT encounters

| HALT | Triggered? | Disposition |
|---|---|---|
| HALT-1 (zero pattern-specific found) | No | 8 PATTERN-SPECIFIC blocks found — hypothesis confirmed |
| HALT-2 (line count not reduced) | No | Δ ≈ −210 lines |
| HALT-3 (addition shows pattern→DAG) | No | Only grammar-generative additions (filtered_aggregate/metric descriptions); no plan-pattern→DAG |
| HALT-4 (BCL c0/c1/c3 divergence) | No | BCL 8/8 byte-identical |

## Residuals (S6A)

- OB-225's constructor additions (`filtered_aggregate` ReferenceSource, `categorized` structure shape) **remain in `intent-constructor.ts`** — legitimate structural vocabulary, untouched (C4). Only the prompt entries teaching the LLM to emit them for specific patterns were removed.
- If MIR P1/P4 (per-category / filtered-count) or BCL clawback fail on re-import, that evidences insufficient grammar-generative description → a follow-on grammar-refinement HF, never catalog restoration (the AUD-009 line).
- The retired `plan_interpretation`/chunking prompts still inject `<<PRIME_GRAMMAR>>` (with the SC catalog) but are not on the active path; cleaning that dead injection is optional follow-up.

## PR
`gh pr create --base main --head hf-320-prompt-subtraction` — see PR for final push SHA.

---

*HF-320 · subtraction-only · CC build complete · awaiting SR-44 architect re-import + c2 inspection.*
