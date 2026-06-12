# OB-203 Phase 6B — Contamination Repair Addendum: Inner Confidence Residue (Architect)

**Date:** 2026-06-12
**Amends:** `docs/vp-prompts/OB-203_PHASE-6B_CONTAMINATION_REPAIR_RULING_20260612.md` (ea3275d2)
**Disposes:** the residue named in `DIAG-064_S4_REPAIR_OUTPUT.md` (9b81dc61)
**File location:** `docs/vp-prompts/OB-203_PHASE-6B_REPAIR_ADDENDUM_20260612.md` (CC commits via the witness worktree)

## §1 — Ruling

The inner `classification_result.confidence` key on the 16 repaired fingerprint rows retains the voided run's value. It is the same contamination class as the repaired fields — a wrong-vintage write persisting in platform memory — and is not left in place on a materiality guess (SR-34). **Restore it from the same morning-truth provenance** (session `d8085364` durable signals, derived live in-script exactly as §1.1 of the ruling): each row's inner confidence set to the morning run's value for that sheet. Same scope guard — exactly the 16 rows or abort with zero writes. No other key, row, or surface touched.

## §2 — Verification

Re-run the §4 read once more; paste the 16 rows showing inner confidence equal to the morning truth map alongside the already-verified classification / bindings / stats state. Append to `DIAG-064_S4_REPAIR_OUTPUT.md` as an addendum section, commit, push. Any row off: HALT.

## §3 — Then the witness

On gate pass, the §5 re-arm stands as handed (worktree attested at OB-203-phase-6, ports clear). The architect runs the start command and the witness proceeds under the criteria already in force, including the §3 binding re-learn amendment.
