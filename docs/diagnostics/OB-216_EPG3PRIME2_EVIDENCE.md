# OB-216 Phase 3″ — EPG-3″ Evidence (scale-inference threshold elimination)

**Branch:** `ob-216-convergence-unified-path` · `npx tsc --noEmit` exit 0 · `npm run build` exit 0 · **scan GREEN** (extended pattern).
Two files touched: `convergence-service.ts` (remove the hardcoded scale-bucket label) + `no-developer-numbers-scan.sh` (catch the float-with-integer-part class).

## §3″.1 What `inferScale` did, and why its boundaries are not authority thresholds

`inferScale(stats)` / `profileColumnDistribution(...)` classified a column into one of `ratio_0_1 | percentage_0_100 | integer_count | integer_hundreds | currency_large` using **four hardcoded magnitude cutoffs** (a ratio ceiling, a percentage ceiling, a count bound, a currency floor). These are developer-assigned scale boundaries — the exact Decision-110 anti-pattern.

**Consumer trace (live grep, whole repo) — the label is diagnostic-only:**
- `inferScale` had exactly one caller: the `distributions` literal at `convergeBindings` (~L433), feeding `checkCalculationPlausibility`.
- `checkCalculationPlausibility` reads the **numeric** distribution (`min`/`max`/`median` ratios for 10× anomaly detection) — it never reads `.scaleInference`.
- `.scaleInference` surfaced in exactly one place: the `convergence:calculation_validation` **observability signal** (`value_distribution.scale`, ~L502).
- `profileColumnDistribution` / `ColumnDistribution` / `scaleInference` have **zero consumers outside `convergence-service.ts`** (repo-wide grep across `web/src` + `web/scripts`).

So the boundaries never drove a binding, a `scale_factor`, or the plausibility decision. The label was a coarse pre-bucket of information the signal **already carries** as raw `min/max/median`.

## §3″.2 The replacement — scale emerges from the distribution, not from cutoffs

Removed the bucket label entirely:
- `inferScale(...)` deleted (its sole caller no longer sets the field).
- `profileColumnDistribution(...)` returns the distribution without the bucketing block (the four cutoffs gone).
- `ColumnDistribution.scaleInference` field removed from the type.
- The observability signal now carries `value_distribution: { min, max, median }` — the **distribution is the scale signal**; any consumer (or LLM reading the signal) derives scale from the actual numbers. Strictly more information than the discarded bucket, with no developer magnitude constant anywhere.

Net: `16 insertions, 37 deletions`; all four magnitude constants eliminated (none ratified — they were not authority values to begin with, they are simply gone).

## §3″.3 Scan extension — catch the else-if-chain float pattern

The pattern that let `inferScale`'s `max <= 1.5` boundary slip past the gate: the prior regex `0?\.[0-9]+` matches a float with **at most one** leading `0`, so a float with an integer part (`1.5`, `1.28`) broke the match. Widened to `[0-9]*\.[0-9]+`:
```
-HITS=$(grep -nE '[<>]=?\s*0?\.[0-9]+|0?\.[0-9]+\s*[<>]=?' $TARGETS | grep -vE 'RATIFIED:' || true)
+HITS=$(grep -nE '[<>]=?\s*[0-9]*\.[0-9]+|[0-9]*\.[0-9]+\s*[<>]=?' $TARGETS | grep -vE 'RATIFIED:' || true)
```
**Self-test:** the new pattern catches `max <= 1.5` and `< 0.5`; it (correctly) does not treat the bare integer `150` as a float. It is a strict superset of the old pattern (still catches `0.5`, `.7`, and the RATIFIED `< 0.01` epsilon via the exemption).

**Scope note (deliberate):** the extension targets the **float** class ("bare-float patterns", per directive). It does **not** flag bare multi-digit integers — the only such comparisons in the targets are pre-existing, unrelated band-scale detection (`route.ts:2566/2572`, decimal-vs-percentage `value < 10`) and a logging-sample guard (`route.ts:2831`), none authored by OB-216. Widening to integers would drag those in; out of scope here, noted for a future pass.

## §3″.4 HALT-3″ disposition — the live scale-factor selector is NOT rewritten

`scoreColumnForRequirement` (the function that actually selects a binding's `scale_factor`) uses `scales = [1, 100]` and overlap tolerances (`expMin * 0.5`, `expMax * 2`). Unlike `inferScale`, this is **on the critical path** — it changes every binding's scale. Rewriting it under an off-critical-path phase is **high-risk → HALT-3″: carried to backlog**, not touched. (`100` is the definitional ratio→percentage scale; the `0.5`/`2` are multiplier tolerances the current gate does not flag, consistent with pre-OB-216 behavior.)

## §3″.5 No-regression

The removed field never influenced any calculation, binding, or plausibility decision (§3″.1 consumer trace) — so output cannot change by construction. Confirmed green: `tsc` exit 0, `npm run build` exit 0, scan GREEN. No runtime recalc is implicated (a diagnostic observability label was dropped; the signal still records the full distribution).

## §GC generality
- **(a) Class:** any column, any tenant/unit — scale is read from the column's own distribution, never bucketed by a developer magnitude cutoff.
- **(b) Keyed on:** the raw distribution (min/max/median); no `1.5`/`150`/`50`/`10000` literals remain.
- **(c) Anti-patterns absent:** no magnitude constant; no ratified fudge (the constants are removed, not annotated); the live scale-factor selector is explicitly left untouched (HALT-3″) rather than rewritten unsafely.

*OB-216 Phase 3″ / EPG-3″ · 2026-06-18 · vialuce.ai*
