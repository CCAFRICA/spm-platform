# HF-350 — ADR: Header Comprehension Column Batching

**Status:** Proposed (committed before code) · **Date:** 2026-06-27 · **Branch:** `hf-350-hc-column-batching` (from main `e7adb3d7`)
**Directive:** `docs/vp-prompts/HF-350_HC_COLUMN_BATCHING_DIRECTIVE_20260627.md`

## §1 — Root cause (evidenced)

`callLLMForHeaders` (`web/src/lib/sci/header-comprehension.ts:89`) sends **all** of a sheet's novel columns to the LLM in one call with `options: { maxTokens: 8192 }` (line 98). Each column's interpretation is ~5 free-form fields (`characterization`, `dataExpectation`, `identifies`, `data_nature`, `relationships`, `confidence`) ≈ 80–150 output tokens. At ~63+ columns the response exceeds 8192 output tokens → the JSON is **truncated mid-object** → `response.result.parseError` → `parse_failure`; generation also runs ~116 s. Production evidence (directive §1): `Header comprehension JSON parse failed … duration=116423ms` at 87 columns, then `Vercel Runtime Timeout … 300 seconds`. This is the **unbounded-LLM-payload** structural class (SR-2 violation): as column count grows, the malformed-JSON probability → 1.

The OB-203 atom path (`runDecomposedComprehension`) already sends only the **novel** residue to the LLM — but a first import of an 87-column sheet has 87 novel columns → one over-budget call → crash. Both callers (`comprehendHeaders:241`, the residue path `:345`) route through `callLLMForHeaders`, so the single seam fixes both.

## §2 — Decision

Batch the columns **inside `callLLMForHeaders`** so every LLM call carries a bounded column count whose output fits `maxTokens` with valid JSON, then shallow-merge the per-batch results. The seam is below the atom cache and below both callers — batching is transparent to everything upstream.

- **P1 — bounded batch size.** `HC_COLUMN_BATCH_SIZE = 25` (named constant, with rationale comment). When total columns ≤ 25 → a single call (byte-identical to today; small files untouched, PG-3). When > 25 → split into ⌈total/25⌉ batches. Rationale: 1 column ≈ 7 s and ≈ 130 output tokens; 8192 / 130 ≈ 63 columns is the truncation cliff; 25 leaves a ~2.5× margin (~3000 tokens/batch) for reliable JSON and ~15–20 s/batch. Holds for 50/100/200+ columns by adding batches — no redesign (SR-2).
- **P2 — merge fidelity.** The merge is a shallow object merge of `result.sheets[sheet].columns` keyed by (sheet, column). Each column appears in exactly one batch → no dedup, no conflict resolution. `crossSheetInsights` concatenated. Merged structure is identical to a hypothetical single-call result.
- **P3 — atom-cache transparency.** Batching is in `callLLMForHeaders`, downstream of `lookupAtoms` (the OB-203 read-before-derive in `runDecomposedComprehension`). Known columns never reach the LLM; novel columns are batched only for the call, then each gets its own atom per-column exactly as today. Which batch a column was in is invisible to the cache. Second import → all CLAIMED, zero LLM calls.
- **P4 — error isolation + fail-loud (C2).** Each batch call is independent; a parse failure in one batch does not abort the others. Each failed batch **retries once**. Columns in a permanently-failed batch are **logged** (named) and simply absent from the merged result — the import proceeds with partial comprehension and those columns get no atom (re-attempted on the next import); the user sees the gap. The call returns `ok:true` with a `failedColumns` list when at least one batch succeeded; `ok:false` only if **every** batch failed.
- **P5 — timeout budget.** Batches run with **bounded parallelism** (`HC_BATCH_CONCURRENCY = 4`) — fast (wall-clock ≈ slowest batch, ~15–20 s for 87 columns) and within the Anthropic concurrency/rate budget. 87 columns = 4 batches; even fully serial (~4×20 s) is far under 300 s.

**Injectable single-caller.** `callLLMForHeaders(input, singleCaller = callLLMForHeadersSingle)` — the real per-call LLM body moves to `callLLMForHeadersSingle`; the orchestrator accepts an injectable caller so the batching/merge/retry/isolation logic is unit-tested deterministically without the LLM.

## §3 — Korean Test / constraints

Batching is **structural — by column count only**. No column-name logic, no type/semantic grouping, no per-name special-casing. The split flattens `(sheet, column)` pairs and chunks by N; the merge keys on column name (identity, not classification). D158 preserved — the LLM still recognizes each column; only the call pattern changes.

## §4 — Blast radius / HALT

- **Files:** `web/src/lib/sci/header-comprehension.ts` only (+ a new test file). **Does NOT touch** convergence, engine, calculation, or the prompt (`anthropic-adapter.ts`). **Disjoint from HF-341 R7** (R7 touches convergence/engine/emission on `hf-341-mir-reconciliation`; this HF touches header comprehension on a branch from main) → no HALT-COLLISION.
- **HALT-CALC (PG-4):** HC runs at import, not calc. BCL `$312,033` cannot move — calc reads committed_data + rule_sets, which HC batching never touches. Verified by re-calc.
- **HALT-ATOM:** Progressive Performance preserved — the atom claim/residue pattern is untouched; batching only changes how the novel residue is *called*, not how atoms are looked up or written (P3).

## §5 — Proof strategy

- **Unit (deterministic, injected caller):** split correctness (87 → 25/25/25/12), merge fidelity (K batches → one structurally-identical result), error isolation (batch 2 fails → batches 1/3 still merge; failed columns reported), retry-once, single-call passthrough for ≤25 (PG-3 byte-identical).
- **Live (real LLM):** `callLLMForHeaders` on a synthetic 87-column input → all 87 comprehended via batches, no parse_failure (PG-1). The "before" is reproduced (87-col single call → parse_failure/timeout) for contrast.
- **PG-2 (re-import Tier 1):** atom-transparency proven by construction (batching downstream of `lookupAtoms`); the live full-pipeline re-import is architect-runnable.
- **PG-4:** BCL re-calc unchanged (HC not on the calc path).

*HF-350 ADR — committed before code.*
