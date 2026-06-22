# OB-216 — Continuation Directive (release EPG-3′ → Phase 4 → 5 → 3″ → PR)

**Resume from:** `ob-216-convergence-unified-path` HEAD `692e72fe` (Phase 3′ committed; Plan 3 computes non-zero; build + tsc exit-0).
**Architect verdict on EPG-3′: PASS, released.** Proceed to Phase 4.
**Per-phase spec:** execute Phases 4, 5, 3″, PR exactly as written in `OB-216_FINAL_COMPLETION_DIRECTIVE` (§4, §5, §3, §6) — generality-first, Rule-34 fold-ins, the two constructed second-instance fixtures, SR-38 hand-comps, both scans GREEN at PR. This directive does not re-state that detail; it releases the pause and carries forward what EPG-3′ settled.

---

## §A — Carried forward from EPG-3′ (approved; do not revisit)

1. **Data-shape invariance guard — APPROVED, keep it.** `snapshot` honored only when the entity's values are actually all-equal; if they vary, fall back to `sum`. This deterministic floor under the LLM's reduction recognition is correct (recognition proposes, data-shape disposes — Decision 158) and is what prevents BCL flow-column regression. It stands as a permanent part of the reduction mechanism.

2. **`EntityData.activeRows` default-to-own-rows — APPROVED.** An unscoped aggregate operating on the entity's own rows is the correct general default; `scope` still overrides to peers. This is a general engine-default fix, not a MIR special-case.

---

## §B — Verification carry-forward (confirm at the gates below; not yet proven)

- **`activeRows` default must not alter scoped plans:** confirm at EPG-4/EPG-5 that the `scope` override still fires for any plan that uses it (an unscoped aggregate gets own-rows; a scoped one still gets peers). State it explicitly with evidence wherever a scoped component appears.
- **BCL no-regression for the Phase-3′ reduction is architect-verified at SR-44, NOT proven by CC** (the headless BCL harness hit a stale period-id 404). Do not report BCL reduction no-regression as CC-verified; it rests on the data-shape guard's logic + the deferred SR-44 browser recalc. Carry it as an open architect-verification item into the completion report.

---

## §C — Phase 4 (next; self-gate to EPG-4) — per `FINAL_COMPLETION_DIRECTIVE §4`

One touch of `run/route.ts`, three things (Rule 34):
1. **Per-sheet entity key** (general-by-construction; MIR's uniform `DNI_Vendedor` keying preserved — success is no-regression, NOT "unblocks Plan 3").
2. **Fold-in `run/route.ts:730`** (`matchRate >= 0.8`, AUTHORITY) → argmax + structural floor 0.
3. **Fold-in `run/route.ts:2734`** (payout epsilon, TOLERANCE) → `// RATIFIED:` annotation.

**EPG-4:** per-sheet-key diff (serves a heterogeneous tenant by construction; MIR keying preserved + the §B scope-override confirmation); `730` elim diff + `2734` ratify; `bash scripts/no-developer-numbers-scan.sh` on **`run/route.ts`** → GREEN; BCL keying unchanged; generality statement.

Then **Phase 5 (PAUSE at EPG-5)** → **Phase 3″** → **PR (no merge)**, per the completion directive. Two mandated pauses remain: **EPG-5** and the PR (architect SR-44).

---

## §D — Standing (unchanged)
Korean Test, Decision 110/158, SR-2 generality (class statement + anti-patterns per phase; constructed second-instance for Phase 5), SR-34, SR-38, SR-44 (no merge — `gh pr create` only), reconciliation-channel separation (NO ground-truth values in CC outputs). Live code only; DO NOT read AUD-001 or any extract. HALT-3 (Locked-Rule): never add a column-name literal, developer threshold, or MIR special-case to force a pass — surface and halt. Commit + push per phase; build exit-0 + `localhost:3000` before PR.

---

*OB-216 continuation directive · release EPG-3′ → Phase 4 · 2026-06-18 · vialuce.ai*
