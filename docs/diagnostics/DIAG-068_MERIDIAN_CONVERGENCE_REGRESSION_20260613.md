# DIAG-068 — Meridian Convergence Regression

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-13 (architect channel)
**Type:** DIAG — read-only. Ships no code, makes no mutation, asserts no cause, proposes no fix.
**Number:** DIAG-068 (DIAG-067 just consumed). **Collision gate:** before commit, CC runs `ls docs/diagnostics/DIAG-068*`; if any non-directive match, HALT and report — do not renumber.
**Location:** this directive + its `_OUTPUT.md` reside in `docs/diagnostics/`.
**FP-49:** NOT REQUIRED — read-only `SELECT`/`grep` only; no SQL authored, no schema referenced against assumption.
**Reconciliation-channel separation:** this directive carries NO ground-truth values. CC reports states/bindings/code verbatim; the architect reconciles separately.

---

## §0 — CC Standing Rules

`CC_STANDING_ARCHITECTURE_RULES.md` governs (read top-to-bottom). Binding: Rule 7 (Prove, Don't Describe — every finding is pasted DB output or pasted code, never characterization). Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`; file IS the prompt; ends at §5A; no §7, no tail summary. DIAGs ship no code (Rule 24: max 3 diagnostic rounds before escalating). No mutation; if a finding requires one, HALT-1.

---

## §1 — Problem Statement

Meridian was CLOSED (reconciled). After the OB-203/HF-285 merge, a clean-slate reimport interprets the plan (rule_set `8affd52c`, 10 components, 2 variants) and imports data, but the calculation ABORTS: HF-281's completeness invariant refuses to persist an incomplete binding set — `Utilización de Flota [variant coordinador] (component_9): missing cargas_totales_hub`. HF-222 rejected the binding for the coordinador population (`top=0.1000, n=9`); the same column bound for the coordinador-**senior** population.

**Per architect disposition: a previously-CLOSED tenant that stops calculating after a merge is a REGRESSION. Root cause is to be established by evidence, not explained.** No convergence code change until this DIAG proves cause.

**The load-bearing prior fact (from the HF-281 closure record, 2026-06-10):** on the *prior* rule_set `be74de80`, the incomplete variant was the **opposite one** — component_4 **[coordinador-senior]** was missing both fleet tokens, while component_9 **[coordinador]** was COMPLETE. So *which variant fails has inverted between generations on the same data.* The failure is therefore generation-dependent, not a fixed per-variant property. That makes the central question: **why does the `cargas_totales_hub` binding for a given population depend on the generation** — HF-222 distribution non-determinism on the small (n=9) population, or a change in how `8affd52c` specifies component_9's required tokens vs `be74de80`/`cac8c891`.

This DIAG establishes cause. It does not fix.

---

## §2 — The four reads (front-loaded; one CC pass)

For each, paste the actual DB rows or the actual code. No inference beyond what is pasted.

### Q1 (highest probability) — Did the intent's required-token set for component_9 change between generations?

Compare the stored interpretation of `Utilización de Flota` across rule_sets. For each available Meridian rule_set — at minimum `8affd52c` (current) and the prior `be74de80`, and `cac8c891` if its row still exists — paste the component's intent and its required tokens for **both** variants:

```sql
-- adjust table/column names to the live schema (read SCHEMA_REFERENCE_LIVE.md first)
select rule_set_id, component_id, variant, calculation_intent
from <rule_set component/intent table>
where rule_set_id in ('8affd52c...','be74de80...','cac8c891...')
  and (component_name ilike '%Utiliz%' or component_id in (...));
```

Report, per rule_set × variant: the intent operation, and the **exact required-token list** (does it require `cargas_totales_hub` + `capacidad_total_hub`, or something different?). **The question Q1 answers:** are the required tokens *identical* across generations (→ binding is the locus, go to Q2), or did `8affd52c` change what component_9 requires (→ plan interpretation is the locus)?

### Q2 — Is the HF-222 distribution rejection deterministic on the coordinador (n=9) population?

Locate the HF-222 distribution/validation check in the convergence code (`grep` for the rejection string `distribution insufficient` / `top=` / the HF-222 marker). Paste the function body that computes the candidate score and the bind/reject threshold. Then answer from the code:
- Is the score a pure function of the column's values over the population, or does it depend on ordering, sampling, or any non-deterministic input?
- What is the threshold, and where is it defined?
- For an n=9 population with uniform-ish values, does the code's logic reject deterministically, or could the same data score differently across runs?

**The question Q2 answers:** is the rejection a stable property of the data (→ the data/population is genuinely below threshold, fix is threshold/exemption policy) or generation-variable (→ the binding generation itself is the regression).

### Q3 — Did the HF-222 check or its threshold change in the OB-203/HF-285 arc?

`git log` the HF-222 file(s) (the convergence distribution-validation source) between the `cac8c891`/`be74de80` era and current `main`. Paste the relevant commits (SHA + one-line) and, if any commit in the OB-203/HF-285 arc touched the threshold or the scoring, paste that diff hunk.

**The question Q3 answers:** did OB-203/HF-285 actually modify the distribution check (→ direct regression cause), or is the check unchanged and the variation is upstream (→ cause is in interpretation or binding generation, per Q1/Q2).

### Q4 (lowest probability — confirm or eliminate) — Did SCI column comprehension of `Cargas_Flota_Hub` change?

The column name resolved correctly both generations (the AI identified `Cargas_Flota_Hub`); this is likely NOT the locus. Confirm: paste the classification/comprehension output for `Cargas_Flota_Hub` from the current import (`classification_signals` for the reference sheet), and confirm the column is classified/available to convergence. If it is present and correctly classified, mark Q4 ELIMINATED with the pasted evidence. If it is absent or misclassified, that changes the picture — report it.

---

## §3 — Reporting

Output to `docs/diagnostics/DIAG-068_MERIDIAN_CONVERGENCE_REGRESSION_OUTPUT.md`. Structure:

1. **Q1** — per rule_set × variant required-token table (pasted rows). Verdict: tokens identical across generations, or changed.
2. **Q2** — pasted HF-222 scoring/threshold code. Verdict: deterministic on n=9, or generation-variable.
3. **Q3** — pasted git log + any threshold/scoring diff in the OB-203/HF-285 arc. Verdict: check changed in arc, or unchanged.
4. **Q4** — pasted `Cargas_Flota_Hub` classification. Verdict: ELIMINATED, or implicated.
5. **CAUSE** — a single paragraph naming the established locus, grounded ONLY in Q1–Q4 evidence. If the evidence does not converge on a single locus within this pass, say so and name what one additional read would settle it (Rule 24: do not exceed 3 rounds — escalate to the architect if unresolved).

Every section pastes DB output or code (Rule 7). Negative findings paste the confirming query/grep.

Commit + PR (main is branch-protected; never push to main):
```
cd /Users/AndrewAfrica/spm-platform
git checkout -b diag/068-meridian-convergence-regression
git add docs/diagnostics/DIAG-068_MERIDIAN_CONVERGENCE_REGRESSION_OUTPUT.md
git commit -m "DIAG-068: Meridian convergence regression — read-only findings"
git push origin diag/068-meridian-convergence-regression
gh pr create --base main --head diag/068-meridian-convergence-regression \
  --title "DIAG-068: Meridian convergence regression (read-only findings)" \
  --body "Establishes the OB-203/HF-285-era cause of the Meridian convergence abort (component_9 cargas_totales_hub, coordinador). Read-only: token-set comparison across rule_sets, HF-222 determinism + arc-change check, column-comprehension elimination. No code."
```

---

## §4 — HALT Conditions

- **HALT-1 — mutation required.** Any finding needing an edit/migration/API-write to obtain → STOP, report what was needed.
- **HALT-2 — rule_set row absent.** If `be74de80` or `cac8c891` no longer exists in the DB, do not fabricate its tokens — report which generations are still inspectable and proceed with those. (`8affd52c` is current and reproducible; it is the minimum.)
- **HALT-3 — cause not established in one pass.** If Q1–Q4 do not converge, do NOT theorize a mechanism to fill the gap — report the evidence gathered and the single read that would settle it, and stop for architect direction (Rule 24).

---

## §5 — Out of Scope

- Any fix (threshold change, small-population exemption, force-bind, interpretation change). The fix is a separate HF authored after CAUSE is established.
- Any convergence/interpretation code edit.
- Any reconciliation/ground-truth value.
- BCL/CRP (BCL is CLOSED and re-proved; CRP needs reimport, separate).

---

## §5A — Residuals

- The fix HF follows this DIAG once CAUSE is named; its number is read from the repo at that time, not now.
- Per handoff R3: whatever the fix touches in convergence, BCL and Meridian must both re-prove afterward against their architect-held targets — that re-verification is the fix HF's gate, not this DIAG's. (Targets stay architect-channel; CC reports calculated values verbatim.)
