# OB-216 — Completion Directive (Phase 5 + Phase 3″ + PR, one pass, no-HALT)

**Resume from:** `ob-216-convergence-unified-path` HEAD `228d1cf1` (Phases 0–4 committed; both scans GREEN; Plan 3 computes non-zero; build + tsc exit-0).
**Goal:** complete OB-216 in this pass — Phase 5 → Phase 3″ → PR — **provided no HALT fires.** If any HALT condition triggers, STOP at that point and report (do not push past a HALT to "finish").
**Cadence change (architect):** EPG-5's mandated PAUSE is lifted for this pass → **EPG-5 self-gates with full pasted evidence**, reviewed by the architect in the completion report + the SR-44 browser recalc. All HALT conditions remain in force.
**Effort:** ULTRACODE / general-by-design. The clawback is ONE instance of the cross-period class; build the capability, not the instance.

---

## §0 — Standing rules
Load `CC_STANDING_ARCHITECTURE_RULES.md`. Architecture Decision Gate; Anti-Pattern Registry; SQL Verification Gate. Live code only at HEAD; DO NOT read AUD-001 or any extract; DIAG-073 line numbers are guidance — re-verify live. Commit + push per phase. **No merge (SR-44):** end at `gh pr create`. Reconciliation-channel separation: NO ground-truth values in any output.

---

## §1 — PHASE 5: Cross-Period Reference-Resolution Capability (RISK; self-gate EPG-5, no-HALT)

**Files:** `run/route.ts` (`priorDataByEntity` ~959-1034), `intent-executor.ts` (`priorPeriodRows` ~240-353).
**Class:** any retroactive adjustment referencing a prior period via a link key — clawbacks, retroactive bonuses, corrections, reversals. **MIR's clawback (Plan 5 `2f615968`) is ONE instance.** What exists today (DIAG-073 §5): the prior-period plumbing (`priorDataByEntity`/`priorPeriodRows`) is fetched but DEAD; negative passthrough is unclamped (supported); conditional firing via `filters` (supported). Only the cross-period join is net-new.

**§1.0 Source (settled, Phase 0 §3.3):** (A) recompute-from-original-sale. The return row carries a reference-key linking to the original sale; the original sale row (Ventas_Enero, found for all 5 returns) yields the original amount + category; the original plan's (Plan 1) rate-table-by-category + accelerator yield the rate/multiplier. Source B (stored original commission in `calculation_results`) is UNAVAILABLE (0 rows) — do not depend on it.

**§1.1 Implementation (general-by-design):**
- **Recognize the reference-key field STRUCTURALLY** — a field whose role is a cross-period link (the recognizer/field-identity marks it `reference_key`, as EPG-1 already showed for `Folio_Original`), NOT a `Folio_Original` string literal in code.
- **Wire the dead substrate:** complete `priorPeriodRows` in the eval context (`intent-executor.ts` ~240-353) and pass `priorDataByEntity` through (`run/route.ts` ~959-1034 + the binding-resolution path) so the prior-period join resolves the original-sale inputs for the referenced row.
- **Recover the original commission inputs** per §1.0(A): join return-row reference-key → prior-period original sale row → recover original amount/category → apply the original plan's rate-table-by-category + accelerator. The **plan's declared formula** drives the computation; the **window/return-period is read from the plan**, not a literal.
- **Negative + conditional:** the clawback fires only for entities with a return in the period (conditional via `filters`), produces a NEGATIVE, carried unclamped to `total_payout` (verify the existing passthrough — do not re-implement; confirm no `Math.max(0,…)` clamps it).
- **Korean Test:** the join key is the structural reference-key relationship; no column-name literal, no developer threshold.

**§1.2 CONSTRUCTED SECOND-INSTANCE (mandatory; retained fixture):** a synthetic retroactive adjustment with a **different link key and a different source/formula** (e.g., a retroactive bonus keyed on a different reference field, recovering a different prior-period input). Show it resolves through the **same** cross-period substrate. **HALT-GC5:** if it needs a new hardcoded key/source/formula → the mechanism is MIR's clawback in disguise; STOP and report.

**EPG-5 (self-gate, full evidence):**
- MIR clawback trace (the RETURN period): the reference-key resolves via the cross-period join, the prime produces a **negative** for the return entities and **0** for entities with no return, negative carried to `total_payout`. (MIR's clawback is 0 in non-return months and negative in the return month — the negative must appear in the return period, not in a no-return month.)
- The §1.2 second-instance proof.
- **SR-38 hand-comp** of one return-row entity: recover its original sale inputs, apply the original rate-table/accelerator, show the engine reproduces the negative magnitude. Paste both.
- Generality statement (class + general property keyed on + anti-patterns absent: no `Folio_Original`/`Ventas_Enero`/Plan-1-rate-table hardcoded as THE key/source/formula; no window literal).
- Architect reconciles the clawback value vs ground truth (SR-44).

---

## §2 — PHASE 3″: Scale-Inference Threshold Elimination + Scan Fix (Rule-34; self-gate EPG-3″)

**File:** `convergence-service.ts` (`profileColumnDistribution`/`inferScale`) + `scripts/no-developer-numbers-scan.sh`. Genuine bare-float scale boundaries (`max <= 1.5` → ratio, `<= 150` → percentage, …) the scan misses (else-if chains). Off MIR's critical path (scaleFactor ≈ 1) — sequence after Phase 5, before PR.

**§2.0 Probe:** read `inferScale` live; determine whether scale can be **distribution-derived** (the column's own value distribution determines ratio/percentage/count structurally) or is better **LLM-recognized** (recognizer reads name + sample + stats → unit; code applies). **HALT-3″:** if `inferScale` is load-bearing such that the rewrite is high-risk on this off-critical-path item → STOP and report (carry the scale residual to backlog rather than risk a regression).

**§2.1 Implementation:** eliminate the hardcoded scale boundaries → distribution-derived or LLM-recognized (per §2.0). No bare-float boundary, no column-name literal (Decision 110, Korean Test).

**§2.2 Scan-pattern fix:** extend `no-developer-numbers-scan.sh` to catch the else-if-chain bare-float pattern these hid behind. Paste the scan diff + a re-run demonstrating the previously-invisible constants would now be flagged, then GREEN after §2.1.

**EPG-3″:** the §2.1 diff; scan-pattern diff + re-run GREEN; no-regression (MIR scaleFactor still ≈ 1; BCL scale inference unchanged); generality statement.

---

## §3 — PR (no merge)
`npm run build` exit-0 (paste); kill dev → `rm -rf .next` → `npm run dev` → `curl localhost:3000/login` (paste 200). Then:
```bash
git add -A && git commit -m "OB-216: convergence unified path complete — cross-period clawback capability + scale-inference elimination"
git push origin ob-216-convergence-unified-path
gh pr create --base main --head ob-216-convergence-unified-path \
  --title "OB-216: Convergence unified path (generality-first, complete)" \
  --body "<full phase-by-phase: partition, agentic binding, threshold elim, general reduction, per-sheet key + route.ts fold-ins, cross-period clawback, scale-inference elim; the 3 constructed second-instance fixtures; both scans GREEN; open architect-verification items>"
```
**DO NOT MERGE.** The PR body IS the completion report.

---

## §4 — Completion report (in the PR body; pasted evidence, no self-attestation)
Per phase: the diff(s), the EPG evidence (runtime/query), the generality statement. Plus:
- **The 3 constructed second-instance fixtures** (reduction max/average; clawback different-key — and note the per-sheet-key heterogeneous case is general-by-construction with no live heterogeneous-tenant exercise).
- **Both scans GREEN** (`convergence-service.ts` + `run/route.ts`) and the §2.2 scan-pattern fix.
- **SR-38 hand-comps** (Plan 3 done EPG-3′; clawback at EPG-5).
- **Open architect-verification items (SR-44, do NOT claim as CC-verified):** (1) Plan 3 grand total vs ground truth; (2) BCL full recalc no-regression (headless harness hit stale period-id); (3) the clawback negative in the return period vs ground truth; (4) per-sheet-key heterogeneous-tenant generality is argued-from-construction, not exercised.
- **Summary line:** `OB-216 COMPLETE. PR=#NNN. 5 plans bind own-sheet; Plan 3 + 4 non-clawback compute; clawback negative in return period; both scans GREEN; 3 generality fixtures retained. AWAITING architect SR-44 recalc (Plan 3, BCL, clawback) + merge.`

---

## §5 — HALT conditions (any → STOP, report, do not push to "finish")
- **HALT-GC5** (§1.2): second instance needs a new hardcoded key/source/formula → clawback is MIR-specific in disguise.
- **HALT-3″** (§2.0): `inferScale` rewrite is high-risk on the off-critical-path item → carry scale residual to backlog.
- **HALT-3 (Locked-Rule, SR-42):** any step requiring a column-name literal, a developer threshold, or a MIR special-case to pass → surface verbatim + dictated action, halt for architect disposition. **Never** add a MIR special-case to force a pass.
- **HALT (source):** if the original-sale inputs cannot be recovered for the return rows (reference-key join fails) → STOP; the clawback cannot be honored as declared.
- Any claim not groundable in freshly-read live code → UNKNOWN; never substitute an extract.

**No-HALT path = complete through PR.** If a HALT fires, stop there, commit what's clean, report the HALT and the remaining scope — the architect dispositions before continuing.

---

## §6 — Standing (unchanged)
Korean Test, Decision 110/158, SR-2 (class statement + anti-patterns + constructed second-instance per RISK phase), SR-34, SR-38, SR-44 (no merge), reconciliation-channel separation. Negative passthrough + conditional firing already supported — verify, don't rebuild. The §B EPG-4 confirmations stand (scope override fires; BCL deferred to SR-44).

---

*OB-216 completion directive · Phase 5 + 3″ + PR, one pass / no-HALT · 2026-06-18 · vialuce.ai*
