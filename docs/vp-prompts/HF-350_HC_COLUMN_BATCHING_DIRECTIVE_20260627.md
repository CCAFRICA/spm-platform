# HF-350 — Header Comprehension Column Batching

**Directive file (VP):** `docs/vp-prompts/HF-350_HC_COLUMN_BATCHING_DIRECTIVE_20260627.md`
**Date:** 2026-06-27 · **Category:** HF (structural-class correction) · **Mode:** ULTRACODE `/effort` (autonomous)
**Repo:** VP `CCAFRICA/spm-platform` · **Branch:** `hf-350-hc-column-batching` (NEW branch from main)
**Sequence:** CC verifies against live registry (`docs/` or `git log`) before committing — `350` is a placeholder; CC assigns the next available HF number.
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt (DD-11).

---

## §0 — CC STANDING RULES HEADER

`CC_STANDING_ARCHITECTURE_RULES.md` binds throughout. Load-bearing: **SR-2 (Scale by Design)**, **AP-25 / Korean Test (D154)**, **D158 (LLM recognizes, code constructs)**, **C2 (fail-loud)**, **Rules 25–28**, **SR-43/SR-44**.

**First action:** write this directive to `docs/vp-prompts/HF-350_HC_COLUMN_BATCHING_DIRECTIVE_20260627.md` (with correct sequence number) and commit.

**Channel boundary / execution authority:** CC owns the entire execution path (ULTRACODE). CC halts only on premise failures (§4).

---

## §1 — PROBLEM STATEMENT

### The defect

Enterprise ERP exports (JD Edwards, SAP, Oracle) routinely produce worksheets with 50–100+ columns. Header comprehension sends ALL novel columns to the LLM in a single prompt. At 87 columns, the LLM response takes ~116 seconds and the JSON output is malformed (parse failure). The function consumes 2 minutes failing, then hits the 300-second Vercel timeout before the next file can even start.

**Production evidence (2026-06-27):**
```
[SCI] Header comprehension completed in 7144ms     ← 1-column sheet — OK
[SCI] Header comprehension JSON parse failed        ← 87-column sheet — duration=116423ms — CRASH
[error] Vercel Runtime Timeout Error: Task timed out after 300 seconds
```

This crashed on a SINGLE file. Multiple files (the user's actual workflow) cannot succeed under any timeout configuration.

### The class

The structural class is: **unbounded LLM payload**. The header comprehension path has no column-count ceiling. As column count grows, LLM response size grows, and the probability of malformed JSON approaches 1. This is a scale ceiling (SR-2 violation) — the platform cannot ingest enterprise data.

### The general property to establish

**P-HC-BATCH: Header comprehension produces reliable results for any column count.** The LLM is called with bounded column batches. Results are merged. The atom cache stores per-column (already true). Progressive Performance is preserved — second import of the same structure is Tier 1 regardless of column count.

---

## §2 — CONSTRAINTS

- **SR-2.** The fix works for 10, 50, 100, 200+ columns without redesign.
- **D158.** The LLM still recognizes — this fix changes the call pattern (batch), not the recognition capability.
- **Korean Test.** No column-name-specific logic. Batching is structural (by count), not semantic (by column name or type).
- **Progressive Performance.** The atom cache (OB-203) already operates per-column. Batching is transparent to the cache — each column gets its atom regardless of which batch it was in. Second encounter = Tier 1 for all columns, $0, ~100ms. **The fix must not break this invariant.**
- **Carry Everything.** All 87 columns are comprehended. No column is dropped because it was in a "later batch." The merged result is identical in structure to what a single-call result would be if the LLM could handle it.
- **C2.** If any batch fails (JSON parse error), fail loud for that batch. Do not silently drop the columns in the failed batch. Retry the failed batch once. If retry fails, report which columns could not be comprehended and proceed with the successfully-comprehended columns — the user sees the gap in the import review screen.

---

## §3 — PHASES (ULTRACODE `/effort` — autonomous)

CC determines the implementation strategy. The following properties must hold at completion:

**PROPERTY P1: Bounded batch size.** Novel columns are batched into groups of N (CC determines N based on the evidence — the sweet spot where the LLM reliably produces valid JSON; likely 20–30 columns per batch given that 1 column takes ~7s and 87 columns fail at ~116s). The batch size is a configuration constant, not a hardcoded magic number — surfaced as a named constant with a comment explaining why.

**PROPERTY P2: Merge fidelity.** The merged result of K batches is structurally identical to what a single-call result would contain. Same keys, same per-column structure, same confidence scores. The merge is a shallow object merge keyed by column name — no deduplication logic, no conflict resolution (each column appears in exactly one batch).

**PROPERTY P3: Atom cache transparency.** The atom claim/residue pattern (OB-203) continues to operate per-column. Whether a column was comprehended in batch 1 or batch 3 is invisible to the cache. On second import, all 87 columns hit CLAIMED, zero LLM calls.

**PROPERTY P4: Error isolation.** A JSON parse failure in batch 2 does not abort batch 3. Failed batches retry once. Columns in permanently-failed batches are reported in the SCI diagnostic log. The import proceeds with partial comprehension — the user sees which columns are not comprehended.

**PROPERTY P5: Timeout budget.** Total HC time for 87 columns must be well under 300 seconds. With 3 batches × ~10s each (serial) or ~10s (parallel), the budget is comfortable. CC determines serial vs parallel based on the Anthropic API's rate limits and the function's memory footprint. If parallel, respect the Anthropic API rate limit.

**Proof gates:**

**PG-1 — 87-column file imports successfully.** Using the same file shape (or a synthetic 87-column fixture), header comprehension completes without JSON parse failure. All 87 columns have comprehension results. Paste the HC diagnostic showing `cols=87` and no `parse_failed`.

**PG-2 — Second import is Tier 1.** Reimport the same file. All 87 columns hit CLAIMED. Zero LLM calls. Paste the atom-residue log showing `known=87/87 novel=0`.

**PG-3 — Small files unaffected.** Import a file with ≤20 columns (e.g., any existing MIR data file). Behavior identical to pre-change — single LLM call, no batching overhead. Paste HC diagnostic.

**PG-4 — BCL/Meridian neutrality (HALT-CALC).** HC column batching does not touch engine, convergence, or calculation. But the import path IS shared. Run BCL calc, confirm $312,033 unchanged.

---

## §4 — HALT CONDITIONS

- **HALT-CALC.** BCL $312,033 moves. Stop.
- **HALT-COLLISION.** HF-341 R7 is in flight on branch `hf-341-mir-reconciliation`. R7 touches convergence/engine, NOT header comprehension. If R7 is merged to main before this HF, rebase. If this HF touches any file R7 also touches, halt and report the collision.
- **HALT-ATOM.** The atom cache behavior changes in a way that breaks Progressive Performance (second import is not Tier 1).

---

## §5 — REPORTING DISCIPLINE

**Completion report:** `docs/completion-reports/HF-350_HC_COLUMN_BATCHING_COMPLETION_REPORT.md`

Per Rules 25–28: summary, pasted evidence for PG-1 through PG-4, batch size rationale, ARTIFACT SYNC block.

---

## §6 — OUT OF SCOPE

- Multi-file parallelism (DS-016 async architecture) — separate OB. This HF fixes the per-file crash.
- Convergence, engine, calculation — not touched.
- HF-341 R7 defects (resolution/condition/reduction/identity fidelity) — parallel branch, disjoint code surface.
- The "SQL" sheet in JDE exports (1 column, already works).

---

## §6A — RESIDUALS

- **DS-016 async ingestion** remains the structural solution for multi-file sequential processing. This HF removes the per-file ceiling so that even the synchronous path can handle enterprise column counts. DS-016 adds parallelism on top.
- **Column count telemetry.** After this HF, the SCI diagnostic log should include the batch count and per-batch timing so the architect can tune the batch size constant from production evidence.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*HF-350 — Header Comprehension Column Batching*
*File IS the prompt. No §7. No tail summary. CC reads end-to-end and executes.*
