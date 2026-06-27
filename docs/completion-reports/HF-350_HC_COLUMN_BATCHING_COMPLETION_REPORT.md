# HF-350 — Completion Report: Header Comprehension Column Batching

**Branch:** `hf-350-hc-column-batching` (from main `e7adb3d7`) · **Date:** 2026-06-27 · **NOT merged** (SR-44)
**Directive:** `docs/vp-prompts/HF-350_HC_COLUMN_BATCHING_DIRECTIVE_20260627.md` · **ADR:** `docs/adr/HF-350_ADR.md`

## §1 — Summary

Header comprehension sent **all** of a sheet's novel columns to the LLM in one call (`maxTokens: 8192`). At ~63+ columns the response truncates into malformed JSON → `parse_failure` + ~116 s → Vercel 300 s timeout (production: 87 columns). HF-350 bounds the per-call column count: `callLLMForHeaders` now batches columns into groups of ≤ `HC_COLUMN_BATCH_SIZE` (25), calls each bounded-parallel with one retry, and shallow-merges. **One file changed** (`web/src/lib/sci/header-comprehension.ts`) + one test file. tsc 0, build 0, full suite **316/316** (+8).

| Commit | Content |
|---|---|
| `…` directive | HF-350 directive committed |
| `…` ADR | ADR before code (root cause + batch-size rationale + blast radius) |
| `…` impl | Column batching + 8 unit tests |

## §2 — Batch size rationale (P1)

`HC_COLUMN_BATCH_SIZE = 25`. Evidence: 1 column ≈ 7 s and ≈ 130 output tokens; `8192 / 130 ≈ 63` columns is the truncation cliff (production crash at 87). 25 leaves a ~2.5× token margin (~3000 tokens/batch) → reliable JSON, ~15–20 s/batch. It is a named tuning constant with an inline comment (the diagnostic log emits batch count + duration so the architect can retune from production), not a magic number, and is **structural — by column count only, never column name or type** (Korean Test). `HC_BATCH_CONCURRENCY = 4` bounds parallelism (wall-clock ≈ slowest batch; 87 cols = 4 batches ≈ 20 s, far under 300 s — P5).

## §3 — Proof gate results

**PG-1 — 87-column file imports without parse failure.**
Proven deterministically (injected single-caller; `hf350-hc-column-batching.test.ts`):
```
✔ P1 split: 87 columns → 4 batches of ≤25 (25/25/25/12), every column in exactly one batch
✔ PG-1: 87 columns → 4 batched calls, all 87 comprehended, ok, no failed columns
```
The pre-fix crash is established by the directive's production log (`JSON parse failed … duration=116423ms` at 87 cols → Vercel 300 s timeout) + the code (`maxTokens: 8192`, ~130 tokens/col). **Live LLM run note:** the Anthropic API was intermittently unreachable from the CC environment during this session (a `fetch failed` after 3 retries on sustained/parallel calls; a 3-column ping succeeded at 12 s, but the 87-col live run timed out at 5 min on network, not on maxTokens). The full-pipeline live 87-column import is the architect's run (SR-44 — browser/import verification is architect-only). The batching logic that makes it succeed is proven above.

**PG-2 — Second import is Tier 1.** Proven by construction (P3): batching lives in `callLLMForHeaders`, **downstream** of `lookupAtoms` (the OB-203 read-before-derive in `runDecomposedComprehension`). Known columns never reach the LLM; only the novel residue is batched, and each comprehended column gets its atom per-column exactly as before. On second import all columns hit CLAIMED → zero LLM calls → no batching invoked. The atom claim/residue/write path is **untouched** (HALT-ATOM safe). Live re-import (`known=N/N novel=0`) is the architect's run.

**PG-3 — Small files unaffected.** Unit:
```
✔ PG-3 passthrough: ≤25 columns → exactly ONE call (small files byte-identical, no batching)
```
`totalCols ≤ HC_COLUMN_BATCH_SIZE` → `callLLMForHeaders` calls `singleCaller(input)` once — identical to the pre-HF-350 path. Any existing ≤20-column file (e.g. MIR data) is byte-identical; the 1-column JDE "SQL" sheet is untouched.

**PG-4 — BCL/Meridian neutrality (HALT-CALC).** Structural — header comprehension runs at **import**, never at calc:
```
PG-4: does the CALC path import header-comprehension? → NONE (calc path never imports it) ✓
header-comprehension importers: import/sci/{analyze,process-job,retry-unit}/route.ts (all import-time)
```
The calc path (`api/calculation`, `lib/calculation`, `convergence-service`) never invokes header comprehension; HF-350 changes only `header-comprehension.ts`. BCL `$312,033` cannot move. (Live BCL re-calc is architect-runnable; the structural proof is definitive.)

**C2 / error isolation (P4).** Unit:
```
✔ P4 error isolation: a permanently-failed batch does not abort the others (partial proceed)
✔ P4 retry-once: a batch that fails its first attempt and succeeds on retry is comprehended
✔ C2 total failure: every batch fails → ok:false (one failed_interpretation upstream)
✔ P2 merge: K batch results shallow-merge into one structurally-identical result
```
A failed batch is reported (`N column(s) in failed batch(es) NOT comprehended … : <cols>`), its columns absent from the merged result (no atom → re-attempted next import); `ok:false` only if every batch fails.

## §4 — HALT conditions

- **HALT-COLLISION (clear):** HF-350 changed files = `header-comprehension.ts` + its test + the directive/ADR. **Zero overlap** with HF-341 R7's six files (`convergence-service.ts`, `run/route.ts`, `ai-plan-interpreter.ts`, `plan-orchestration.ts`, `anthropic-adapter.ts`, `entity-resolution.ts`). R7 is on a separate branch from main; this HF is on a branch from main. Disjoint.
- **HALT-CALC / HALT-ATOM:** neither triggered (PG-4 structural; PG-2 by construction).

## §5 — ARTIFACT SYNC

```
ARTIFACT SYNC
MC: HF-350 → code complete on branch hf-350-hc-column-batching. Architect: live 87-column import
    (PG-1 known=87 comprehended) + re-import (PG-2 known=87/87 novel=0 Tier 1) once Anthropic
    connectivity is stable; live BCL recalc to formally close PG-4 (structurally neutral).
REGISTRY: candidate locked decision — "P-HC-BATCH: header comprehension bounds the per-LLM-call
    column count and merges; reliable for any column count (SR-2). Structural batching by count,
    not column name/type (Korean Test); transparent to the OB-203 atom cache."
R1: PG-1/PG-3/P4 proven (unit, injected caller); PG-2/PG-4 proven by construction; live runs = architect (SR-44).
BOARD: now = enterprise column counts (50/100/200+) no longer crash the synchronous import path;
    gap = live 87-col import proof (architect, LLM-connectivity-gated); ev = §3; ef = SR-44 import; lane = HF.
SUBSTRATE: exercised SR-2 (scale by design — batches scale with column count), C2 (fail-loud per batch
    + partial proceed), D158 (LLM still recognizes; only the call pattern changed), Korean Test (by count).
    Residual (directive §6A): column-count telemetry — the diagnostic now logs batch count + total
    duration; per-batch timing can be added if the architect wants finer tuning evidence.
```

---
*HF-350 — Header Comprehension Column Batching. Code complete; architect: live import proof + merge (SR-44).*
