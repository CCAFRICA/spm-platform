# HF-194 Stage 2 Verification — Calculation Total Restored
## Run AFTER Stage 1 PASSES.

## Hypothesis under test

With `field_identities` restored on BCL `committed_data` (Stage 1 PASS), the calculation engine — consuming `convergence_bindings` produced by the matcher's now-fed Pass 1 — will produce per-period and grand totals matching BCL's ground truth.

## Steps

1. Navigate to `/operate/calculate` (Calculate page) on the deployed `hf-193-signal-surface` build.
2. For BCL tenant, run calculation for each of the 6 monthly periods:
   - May 2025
   - June 2025
   - July 2025
   - August 2025
   - September 2025
   - October 2025
3. Capture per-period totals from the browser AND from Vercel runtime logs.

## Expected per-period and grand totals (BCL ground truth)

| Period      | Expected ($) |
|-------------|--------------|
| May 2025    |       48,250 |
| June 2025   |       49,840 |
| July 2025   |       54,920 |
| August 2025 |       59,260 |
| September 2025 |    55,173 |
| October 2025 |      44,590 |
| **Total**   |  **312,033** |

## Vercel-log capture requirements

For each period, capture and paste the following emission strings from Vercel runtime logs:

- The convergence-line emission:
  `[Convergence] <ruleSet.name>: N derivations, M gaps, K component bindings`
  (emitted by `convergence-service.ts:586` per DIAG-021 R1)

- The HF-108 emission from the calc handler:
  `HF-108 Using convergence_bindings (Decision 111) for data resolution — N component bindings`
  (emitted by `calculation/run/route.ts:227` per DIAG-021 R1)

  Pre-HF-194: this line was reached as `HF-108 Using metric_derivations (legacy) for data resolution — no convergence_bindings found` (the fallback branch), confirming the matcher had not produced bindings.

  Post-HF-194 (expected): the convergence-bindings branch is taken instead.

## Stage 2 PASS criteria

- Each per-period total matches ground truth (exact match — no tolerance)
- Grand total = $312,033 exact
- Vercel logs confirm the convergence path was taken (the convergence-bindings branch, NOT the metric_derivations fallback)

## Stage 2 FAIL — what it means

If Stage 1 PASSES but Stage 2 FAILS:
- `field_identities` was the matcher-input regression (closed by HF-194)
- A SEPARATE downstream issue exists in `convergence_bindings` → calculation (HF-191 seeds / HF-193 signal-surface cutover / HF-188 intent-executor interactions could be the next layer)
- HF-195 will be needed; HF-194 is NOT reverted (it remains a correct fix, just incomplete to restore the full baseline)
- Diagnostic chain continues: DIAG-023 or DIAG-020-B-equivalent at the `convergence_bindings` → engine surface

## Stage 2 PASS — what it means

- The full diagnostic chain (DIAG-020 → 020-A → 021 R1 → 022 → HF-194) closes the BCL regression.
- The cumulative drift across HF-184 / OB-195 Layer 1 / HF-191 / HF-193 is contained.
- CRP and Meridian remain to be re-imported and verified — both have 0 `committed_data` rows per DIAG-020-A; both must be re-imported and reconciled before being declared restored.

## Cross-references

- DIAG-020 → 020-A → 021 R1 → 022 → HF-194 (the full diagnostic + remediation chain)
- HF-194 Phase 3 commits (`b784291c`) — the field_identities patches in execute-bulk
- HF-194 Stage 1 verification spec — `docs/verification/HF-194_STAGE1_VERIFICATION.md`
