# HF-303 — Completion Report
## Eliminate Arbitrary Overlap Threshold in Rollup-Key Derivation

**Date:** 2026-06-17 · **Branch:** `hf-302-convergence-file-affinity` (same branch / PR #537 as HF-302) · **Base HEAD:** `e8d37b70`.
**Status:** BUILT · build exit-0 · dev confirmed `localhost:3000` · gate installed · **awaiting architect SR-44 proof gate (G1–G5).**
**What this corrects:** HF-302 §3.2/RC-3 shipped a developer-set `≥ 0.5` overlap cutoff (a Decision-110 / OB-IGF-25 #5 prohibited-class constant). HF-303 removes it before HF-302 merges and installs a standing gate so the class cannot re-enter silently. RC-1 and RC-2 untouched.

---

## §3.0 — The shipped defect (live, before change)
`run/route.ts` rollup-key selection (HF-302 RC-3):
```ts
for (const [batchId, cm] of perBatchColHits.entries()) {
  let best; let bestRate = 0;
  for (const [col, s] of cm.entries()) {
    if (s.total < 1) continue;
    const rate = s.hit / s.total;
    if (rate > bestRate) { bestRate = rate; best = col; }
  }
  if (best && bestRate >= 0.5) batchRollupCol.set(batchId, best);  // ← the prohibited 0.5 constant
}
```
The `0.5` is a developer-assigned membership cutoff — not a tier number, not a structural count, not a ratified promotion threshold (the only permitted bare numbers per OB-IGF-25 #5). It cannot distinguish "strongest key" from "good enough": a sparse-but-correct key at 0.4 is dropped (→ $0); a coincidental client column at 0.55 is mis-bound (→ plausible-wrong); two columns over the line are decided by iteration order. It passes G1 on MIR only because MIR is clean (seller id on every row → 1.0 membership).

## §3.1 — The fix: relative strongest-membership (Decision 110 / HF-218)
The argmax loop already existed; the change removes the absolute gate and adds explicit zero-floor + tie handling — the decision is now *argmax over candidates*, never a comparison to a constant.
```diff
-          let best: string | undefined; let bestRate = 0;
-          for (const [col, s] of Array.from(cm.entries())) {
-            if (s.total < 1) continue;
-            const rate = s.hit / s.total;
-            if (rate > bestRate) { bestRate = rate; best = col; }
-          }
-          if (best && bestRate >= 0.5) batchRollupCol.set(batchId, best);
+          let maxMembership = 0;
+          let winners: string[] = [];
+          for (const [col, s] of Array.from(cm.entries())) {
+            if (s.total < 1) continue;
+            const membership = s.hit / s.total;        // ratio of set-membership counts — structural observation
+            if (membership > maxMembership) { maxMembership = membership; winners = [col]; }
+            else if (membership === maxMembership && maxMembership > 0) { winners.push(col); }
+          }
+          if (maxMembership === 0 || winners.length === 0) {
+            addLog(`HF-303: no rollup key for batch ${batchId} — no column's values are entity external_ids`);
+            continue;
+          }
+          if (winners.length > 1) {
+            addLog(`HF-303: ambiguous rollup key for batch ${batchId} — ${winners.length} columns tie at max membership; none selected (surface for review)`);
+            continue;
+          }
+          batchRollupCol.set(batchId, winners[0]);
+          addLog(`HF-303: rollup key for batch ${batchId} selected by strongest membership=${maxMembership.toFixed(2)} (argmax over ${cm.size} candidate columns)`);
```
- **Only bare number is `0`** — the structural floor ("is this column an entity foreign key at all"), not a tuned cutoff. Tie detection uses exact `===` equality and integer `.length` counts. No threshold literal.
- **Structured failure, no silent fallback:** zero-membership → no key (logged); a max-tie → no key + a surfaced log (never iteration-order pick).
- **DD-1/DD-2 sweep:** the rollup path has no other absolute overlap/confidence cutoff after this change (`grep bestRate|>= 0.5` in `run/route.ts` → empty).

## §3.2 / §3.3 — Standing gate: `scripts/no-developer-numbers-scan.sh` (new)
Greps `convergence-service.ts` + `run/route.ts` for float literals used in comparisons, excluding lines tagged `// RATIFIED:`. Added a standing-rules line (`CC_STANDING_ARCHITECTURE_RULES.md` Build & Deploy #6): run it before any completion report touching those two files; an un-RATIFIED bare threshold is a Decision-110 halt.

**Gate output after the fix:** the rollup logic is **clean** (no float threshold remains in it). The gate also **enumerated 8 pre-existing bare-float thresholds** in the two files — **discovered debt, NOT fixed here (DD-7 scope)**, surfaced for architect triage:
```
convergence-service.ts:338   if (match.matchConfidence < 0.5) continue;
convergence-service.ts:514   if (score > 0.2 && ...)
convergence-service.ts:1261  if (bestMatch && bestMatch.score > 0.3)
convergence-service.ts:1292  if (bestDt && bestScore > 0.2)
convergence-service.ts:2883  const isValidated = !req.expectedRange || boundaryScore > 0.1;
convergence-service.ts:3202  if (!bestCatField || bestCatScore < 0.3)
run/route.ts:730             if (matchRate >= 0.8)            // HF-181 entity_id_field discovery
run/route.ts:2734            Math.abs(payout - prior) < 0.01  // dual-path concordance epsilon (likely legitimate — needs RATIFIED tag)
```
These are the same prohibited class HF-303 fixed in the rollup path; each needs triage (remove, or tag `// RATIFIED:` with an empirical/structural justification). The gate exits non-zero until they are triaged — that is the gate doing its job (the class is now visible). HF-303 deliberately leaves them per DD-7; they are flagged here for a follow-up.

## §3.3 — Build
`pkill next dev; rm -rf .next; npm run build` → ✓ Compiled successfully, types validated, **BUILD_EXIT=0**. `npm run dev` → `curl /login` → **200**. tsc clean.

## §2 — Data Contract: unchanged
In-memory derivation logic only, inside the `dataByBatch` build. No persisted structure touched: `convergence_bindings` shape/content, `ComponentBinding`, `resolveColumnFromBatch` signature, `dataByBatch` interface, schema — all unchanged. Gate satisfied.

## §4 — G1–G5 (architect, SR-44, production — placeholders)
- **G1 — MIR clawback still non-zero (no regression):** _[architect]_ recalc Jan-2025 → the seller column is the argmax (≈1.0 membership) → selected → non-zero total. Paste the `HF-303: rollup key … selected by strongest membership=…` log line + non-zero per-entity resolution.
- **G2 — all 5 MIR plans** reconcile vs `MIR_Resultados_Esperados.xlsx`.
- **G3 — single-file regression:** BCL ($44,590 Oct / $312,033 full), Meridian (Q1), CRP (Plans 1+3 = $364,457.84) recalc to locked values. Single-file → only candidate column is the primary `entityCol` (excluded) → no rollup key → no behavior change.
- **G4 — gate proves the class is gone from the rollup path:** ✅ rollup logic clean; ✅ 8 pre-existing thresholds enumerated above for triage.
- **G5 — Korean Test:** ✅ this HF's added lines contain no column-name literal and no bare-float threshold (only `0` floor + integer counts; `.toFixed(2)` is a log format of a runtime value).

## Scope fence (DD-7)
Removed the `0.5` and installed the gate only. RC-1/RC-2 untouched. Pre-existing bare-float thresholds NOT fixed (enumerated for triage). No data-contract change.

---

*HF-303 · Eliminate Arbitrary Overlap Threshold · 2026-06-17 · vialuce.ai*
