# AUD-017 — Plan-Interpretation Regression: Root Cause (read-only forensic)

**Date:** 2026-06-17 · **Mode:** READ-ONLY (no source changes, no migrations, no runs) · **Branch:** `aud-017-plan-interp-regression`
**Defect:** Meridian `c1-senior` aborts at the constructor — `cognition_truncation: output count 19 does not match dimension product 20 (5×4)`. Same PPTX interpreted cleanly 2026-05-31.
**Verdict:** **REGRESSION, Mode A (semantic miscount of a complete emission). Introducing change = HF-294's model swap (`claude-sonnet-4-20250514` → `claude-sonnet-4-6`, 2026-06-15)**, surfacing through a pre-existing hard, tolerance-free constructor check. The directive's working hypothesis (a prompt/template change) is **REFUTED** — the emission grammar is byte-unchanged since GOOD.

---

## 1 — HEAD audited
`37e33ef2` (main), carrying HF-302 `e8d37b70` + HF-303 `968759fc`. Same tree that produced the failing import.

## 2 — The validation site (Phase 1)
`web/src/lib/plan-intelligence/intent-constructor.ts:229-236` (`constructBandedLookup`):
```ts
const dims = desc.dimensions;
const totalCells = dims.reduce((acc, d) => acc * (d.breaks.length + 1), 1);   // band count per dim = breaks.length + 1
if (desc.outputs.length !== totalCells) {                                      // EXACT match, no tolerance
  throw new ConstructionError(path, desc,
    `output count ${desc.outputs.length} does not match dimension product ${totalCells} (${dims.map(d => d.breaks.length + 1).join('×')})`);
}
```
- **Band-count math:** `breaks.length + 1` (standard half-open: k breaks → k+1 bands; band 0 below the smallest, band k at/above the largest). For 5×4 = (4 breaks +1)×(3 breaks +1) = 20.
- **No pad / repair / tolerance:** the check is a strict `!==`; there is no branch that back-fills a missing band-0 cell or trims an extra one. `validateBandedLookup` (`:650`) validates shape, not outputs length. The **HF-266 normalization** (`normalizeNode`, `:110-147`) infers missing `shape`/`kind` discriminants and recurses branches — it does **not** reshape or pad `outputs`. So a 19-cell emission against a 20-cell table is an unconditional throw.
- The throw is classified upstream as `cognition_truncation` (`interpretation-errors.ts:18` — "missing rate-table cells"; mapped at `plan-orchestration.ts:593-596`). The *name* misleads: this is a complete-but-short emission, not a cut-off stream.

## 3 — GOOD boundary (Phase 2)
- **The constructor existed at GOOD.** `intent-constructor.ts` was created by **HF-251 (`5fde465c`, 2026-05-23)** — *before* the 2026-05-31 GOOD interpretation. So the exact `outputs.length === totalCells` check was live on 5/31 and was **satisfied** (the GOOD LLM emitted 20 cells → `SUCCESS shape=banded_lookup`). GOOD is therefore a genuine re-interpretation that passed this check, not a reuse artifact.
- **GOOD ran on `claude-sonnet-4-20250514`.** `git show 925cba74^:…/anthropic-adapter.ts` → `model: this.config.model || 'claude-sonnet-4-20250514'` (the fallback in force from OB-14 2026-02-09 through HF-294). At HEAD it is `'claude-sonnet-4-6'`.
- **HF-281-reuse question (directive hypothesis): moot.** Whether HF-281 re-interpreted or reused a persisted rule_set does not affect the boundary — GOOD (5/31) demonstrably interpreted with this constructor passing, and the model swap that breaks it is dated **2026-06-15**, after any HF-281 activity and before this session's failing re-import. (HALT-2 not triggered: GOOD is firmer than "last-observed-working" — the model + constructor state at 5/31 is established from code.)

## 4 — Commit archaeology, GOOD (2026-05-31) → HEAD (in-scope path)
| Commit | Date | File | What changed | Affects outputs↔product? |
|---|---|---|---|---|
| **`925cba74` HF-294 P1** | **06-15** | `anthropic-adapter.ts` | model fallback `claude-sonnet-4-20250514` → **`claude-sonnet-4-6`** | **YES — changes the LLM that emits the cells (the only emission-governing variable changed post-GOOD)** |
| `9696b01d` / `8ef0a3b2` HF-266 | 06-02 | `intent-constructor.ts` | normalize missing `shape`/`kind`; value-truthiness guard | No — infers discriminants; does not touch `outputs` length |
| `5a1273b5`/`fa59b408`(reverted `f38431f8`)/`928c8724`/`3ff3821c` HF-274/276/277/279 | 06-0x | `intent-constructor.ts` | scale on ratio-keyed breakpoints; omit `meta.scale` | No — scale/breakpoint handling, not cell count |
| HF-270/271/272/279/280 | 06-02→06-09 | `plan-orchestration.ts` | comprehended-field constraint, structural-coherence proofread, interp-time gate removal, atomicity + retry feedback | No — field resolution / coherence / atomicity; not the cell-count emission instruction |
| (none) | — | `prime-grammar.ts` (emission grammar incl. `rateTableCellCount`, `:473`) | **unchanged since 5/31** (`git log --since=2026-05-31` empty) | No — the emission contract is byte-identical to GOOD |

**Phase-A vs the failing check (distinct validators):** `prime-grammar.ts:473` is the Phase-A skeleton instruction — "emit `rateTableCellCount` … the validator checks the tree carries **at least** rateTableCellCount leaves" (a `>=` check). Phase A still derives `rateTableCellCount=20` correctly. The **failing** check is the Phase-B constructor's **exact** `!==` (`intent-constructor.ts:230`). Two different validators; only the exact one rejects 19.

## 5 — Mechanism: Mode A (Phase 4)
Per the raw pre-normalization CompositionalIntent in the session log (HF-266 P2 logging), the JSON is **complete** — it terminates with a full `metadata` block, no unterminated array/object — and `outputs` holds exactly **19** values: `0,200,400,150,300,500,800,300,600,900,1400,600,1000,1600,2200,900,1400,2100,3000`. Grouped against the 5×4 grid the lowest row-band carries **3** cells (`0,200,400`) where every other band carries 4 — i.e. the model omitted one cell in the lowest tier. **Complete JSON + 19 well-formed values = Mode A (semantic miscount), NOT Mode B (literal truncation).** Combined with §4 (grammar unchanged; normalization doesn't reshape; scale HFs irrelevant), the **only** variable governing the emission that changed between GOOD and HEAD is the **model**.

## 6 — Root cause (single sentence)
**The regression was introduced by HF-294 (`925cba74`, 2026-06-15, `anthropic-adapter.ts`), which swapped the plan-interpretation model from `claude-sonnet-4-20250514` to `claude-sonnet-4-6`; the new model emits a 19-cell `outputs` array for `c1-senior`'s 5×4 banded_lookup (omitting one lowest-tier cell) where the GOOD model emitted 20, and the constructor's pre-existing hard exact-match check (`intent-constructor.ts:230`, `outputs.length !== totalCells`, with no tolerance/repair) rejects it — which GOOD avoided only because its model happened to emit the full 20.**

*Calibration caveat (read-only limit):* this isolates the model as the sole changed emission-governing variable by elimination; definitive confirmation is a single A/B run of the two model strings on this component (the remediation's proof, out of scope here). `config.model` (env) could in principle override the fallback, but the code fallback demonstrably changed and the session history confirms the live model is now `claude-sonnet-4-6`.

## 7 — Recommended remediation (ADVISORY — not implemented)
This is a **model-portability** defect (a new model miscounts an emission a prior model got right), exposed by a tolerance-free constructor. Correct layer, in order of preference:

1. **Strengthen the Phase-B emission contract (primary, deterministic).** Make the banded_lookup emission instruction explicitly enumerate the full grid — "emit exactly R×C = N `outputs` in row-major order, INCLUDING the lowest tier (band 0) for every column; band 0 is the value below the smallest break" — so `claude-sonnet-4-6` reliably emits all 20. No guessed values. This is the durable fix and is **Design-Gate-worthy** (it changes the emission contract / makes it model-robust).
2. **Tighten the HF-280 retry feedback** to name the *specific* missing cell coordinate (row/col band) rather than the generic count mismatch, so the retry can converge instead of the model re-emitting 19 deterministically.
3. **Do NOT add a silent constructor pad/repair.** Back-filling the missing lowest-tier cell with a guessed value (0 or a neighbor) would produce *plausible-wrong* payouts — worse than the loud abort. If any repair is added, it must be a re-ask for the named cell, never a silent default. (This answers the directive's "should the fix restore a tolerance" question: **no silent tolerance** — fix the contract so the count is right, keep the loud failure as the backstop.)

**Carry-forward (§4A):** the model swap (HF-294) governs **every** LLM emission in interpretation — other plans/components requiring exact cell emission may regress under `claude-sonnet-4-6` the same way; a contract-strengthening fix should be validated across the proof tenants (BCL/Meridian/CRP/MIR), not just c1-senior. The `cognition_truncation` label conflating "cut off" with "miscounted" is a minor diagnostic-clarity item (distinguish the two would have shortened this audit). HF-266 raw-intent logging is confirmed valuable and unweakened.

---

*AUD-017 · Plan-Interpretation Regression Root Cause · 2026-06-17 · vialuce.ai · read-only forensic, no source changes*
