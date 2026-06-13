# HF-276 REVERT — Evaluator-Side Scale Pre-Multiplication Caused BCL Regression

**Work item:** HF-276-REVERT
**Repo:** `CCAFRICA/spm-platform`
**Trigger:** BCL c1 (Captación de Depósitos) regressed — 72 Ejecutivo entities produce c1=420 (max tier) regardless of performance. Oct overpay +$21,840, Nov +$20,660, Dec +$15,860. Three other BCL components exact. HF-276's `buildConstantWithScale` pre-multiplication is the sole cause.
**Revert target:** Commits `bf62abe7` and `fa59b408` on branch `hf-276-evaluator-scale`, merged via PR #463.

---

## §0 CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. SR-41 (revert discipline) binding. This is a revert, not a new feature. The only code change is removing HF-276's additions to `buildConstantWithScale`. No other files touched.

---

## §1 Why Revert

HF-276 pre-multiplies evaluator-side ratio-keyed breakpoints by `scale.value` in `buildConstantWithScale`. This fixed Meridian c0 (Coordinador variant: ratio-space breaks 0.8 with scale.value=100 → 80, correct). But BCL c1 (Depósitos) also matches the `evaluator + ratio` condition with breakpoints already commensurate — the pre-multiplication double-scales them, collapsing all thresholds below any real attainment → every Ejecutivo enters the maximum tier (420).

The construction layer cannot safely distinguish ratio-space breaks (0.8) from percent-space breaks (85) without a magnitude heuristic, which is a Korean Test violation. The fix is structurally unsafe across tenants. The defect it addressed (Meridian Coordinador c0 scale.value=100 with ratio breaks) is a recognition-quality problem — the recognizer emitted an inconsistent pairing that the Senior variant already self-corrected.

---

## §2 Execution

### §2.1 Revert the code

```bash
git revert fa59b408 --no-commit
git revert bf62abe7 --no-commit
git add -A && git commit -m "Revert HF-276: evaluator-side scale pre-multiply regressed BCL c1 (§6A double-scale)" && git push origin dev
```

If the reverts conflict, manually restore the `buildConstantWithScale` function to its state after HF-274 (convergence-side scale only). The change to remove: the branch that checks `scale.side === 'evaluator'` AND ratio-keyed and multiplies breakpoint value by `scale.value`. The convergence-side branch (`scale.side === 'convergence'`) from HF-274 is PRESERVED — do not touch it.

### §2.2 Build

Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000. `npm run build` must pass clean.

### §2.3 PR

```bash
gh pr create --base main --head dev --title "Revert HF-276: evaluator-side scale pre-multiply regressed BCL c1" --body "HF-276 pre-multiplied evaluator-side ratio-keyed breakpoints by scale.value. This fixed Meridian c0 but double-scaled BCL c1 (Depósitos) — 72 Ejecutivos forced to max tier (420) every period. Overpay: Oct +21,840 / Nov +20,660 / Dec +15,860. The construction layer cannot distinguish break-space without a magnitude heuristic (Korean Test violation). Revert restores BCL. Meridian c0 fix deferred to recognition layer."
```

---

## §3 HALT Conditions

**HALT-0:** `npm run build` fails after revert.
**HALT-1:** The revert removes more than the HF-276 evaluator-side branch (i.e., it also removes HF-274's convergence-side branch). Inspect the diff before committing — only the `evaluator + ratio` path should be removed.

---

## §4 Post-Merge Verification (Architect-Side)

After merge:

1. **Cold re-import BCL.** Run Oct/Nov/Dec. Verify c1 component totals match GT: 10,170 / 12,530 / 18,140. Grand totals: 44,590 / 46,291 / 61,986. The $312,033 anchor is the Q4+Q1 total.

2. **Cold re-import Meridian.** Run Jan/Feb/Mar. c1/c2/c3/c4 should remain exact (HF-274 + HF-275 are preserved). c0 will regress to the pre-HF-276 state — the evaluator-side scale mismatch returns for the Coordinador variant. The c0 delta is the known residual; its fix belongs at the recognition layer.

---

## §5 Residual — Meridian c0 Recognition-Layer Fix

The Coordinador variant emits `scale: {side:"evaluator", value:100}` with ratio-space breaks (0.8). The Senior variant emits `scale: {side:"evaluator", value:1}` with the same ratio breaks (correct, commensurate). The fix is recognition coherence: the recognizer must emit commensurate scale/break pairings. This is a separate HF scoped to the recognition layer — not construction-time pre-multiplication, which is proven unsafe across tenants.

---

*HF-276 REVERT · BCL Recovery · vialuce.ai · Intelligence. Acceleration. Performance.*
