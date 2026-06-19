# OB-216 — Final Completion Directive (Phases 3′, 3″, 4, 5, PR) · Generality-First + Rule-34 Residual Fold-In

**Resume from:** `ob-216-convergence-unified-path` HEAD `8b7a86e3` (Phases 0–3 committed; convergence-service scan-GREEN; build exit-0). This directive completes the build. Self-contained for a fresh CC turn.
**Effort:** ULTRACODE / general-by-design. Every mechanism serves the structural *class*; MIR is one instance, never the target.
**Rule 34 applied:** because Phases 3′/4/5 all touch `run/route.ts` and OB-216's purpose is a threshold-free `convergence-service.ts`, the outstanding residuals are folded into the phases that touch their files — not deferred. One touch per file, everything fixed in it.

---

## §0 — Standing rules
- Load `CC_STANDING_ARCHITECTURE_RULES.md`. Architecture Decision Gate; Anti-Pattern Registry; SQL Verification Gate. Live code only at HEAD; DO NOT read AUD-001 or any extract. DIAG-073 line numbers are guidance — re-verify live before editing.
- Commit + push after each phase. After all phases: `pkill -f "next dev"` → `rm -rf .next` → `npm run build` (exit-0) → `npm run dev` → `localhost:3000`. Git from repo root.
- **No merge (SR-44):** final step is `gh pr create`; architect merges + browser-verifies.
- **Reconciliation-channel separation:** report computed values verbatim; NO ground-truth values in any output.

## §1 — Governing mandate (condensed; established across this build)
Enduring capability for the structural class, not a MIR fix. Generality is **proven, not asserted**: each phase states (a) capability class, (b) general structural property keyed on, (c) anti-patterns absent; the two RISK phases (3′, 5) additionally require a **constructed second-instance fixture** exercising a *different* instance through the *same* mechanism (retained as a regression fixture). Korean Test, Decision 110/158, SR-34, SR-38, SR-44 stand throughout.

---

## §2 — PHASE 3′: General Aggregation-Reduction Capability (RISK · PAUSE at EPG-3′)

**File:** `run/route.ts` (`resolveColumnFromBatch` ~1648-1677). **Defect:** unconditional SUM; `Saldo_Pendiente` snapshot summed 147× → Plan 3 ratio collapses → 0.

**§2.0 Probe (read-only):** confirm the structural signals the reducer reasons over — field-identity/contextualIdentity per column + data-shape (invariance-per-entity across multiple entities). Paste for `Monto_Cobrado` (flow) and `Saldo_Pendiente` (stock). **HALT-G** if no clean signal separates them.

**§2.1 Implementation (general-by-design):** reduction-by-recognized-nature over a **GENERAL reduction set — sum, snapshot/last/first, max, min, average, distinct-count** — NOT a `{sum, snapshot}` binary. The LLM **recognizes** a bound column's needed reduction from its identity/shape (Decision 158); deterministic code **applies** the recognized reduction. No `Saldo_Pendiente`→snapshot literal; no two-value switch; no column-name literal in the selector. Add the **§G.1 reference-prime guard** (`intent-executor.ts` ~151-154): a non-numeric value reaching `toDecimal` → ZERO (mirror the `aggregate` prime's coercion; Korean-Test "non-numeric→0", no literal) — closes the Plan-1 `Categoria` crash defense-in-depth.

**§2.2 CONSTRUCTED SECOND-INSTANCE (mandatory):** a synthetic input where a column needs a **non-sum, non-snapshot** reduction (e.g., a plan using the **maximum** balance, or an **average** rate). Show the *same* recognizer selects it. **HALT-GC3′:** if a third reduction type needs a new branch → disguised binary, stop and generalize. Retain the fixture.

**EPG-3′ (PAUSE):** MIR Plan 3 trace — `Saldo_Pendiente` reduces to snapshot (not 147× sum), ratio passes the plan gate, Plan 3 computes **non-zero** per-entity + grand total. The §2.2 second-instance proof. **SR-38 hand-comp** of one qualifying Plan-3 vendor. BCL regression (flow columns still SUM). Generality statement (a/b/c). Architect reconciles Plan 3 vs ground truth.

---

## §3 — PHASE 3″: Scale-Inference Threshold Elimination (Rule-34 fold-in; self-gate to EPG-3″)

**File:** `convergence-service.ts` (`profileColumnDistribution`/`inferScale`). **Folded in per Rule 34:** OB-216's purpose is a threshold-free convergence-service; these are genuine bare-float developer boundaries (`max <= 1.5` → ratio, `<= 150` → percentage, …) the scan misses (else-if chains). Off MIR's critical path (scaleFactor ≈ 1) — so **self-gated, sequenced not to block 3′** — but closed here so "scan-GREEN" means "threshold-free," not "threshold-free where the scan can see."

**§3.0 Probe:** read `inferScale` live; determine whether scale can be **distribution-derived** (the column's own value distribution determines ratio/percentage/count structurally) or is better **LLM-recognized** (the recognizer reads name + sample + stats and recognizes the unit; code applies). Choose the mechanism that fits the live code; **HALT-3″** if `inferScale` is load-bearing in a way that makes the rewrite high-risk — report for architect review rather than risk a regression on an off-critical-path item.

**§3.1 Implementation:** eliminate the hardcoded scale boundaries → distribution-derived or LLM-recognized scale (per §3.0). No bare-float boundary, no column-name literal (Korean Test, Decision 110).

**§3.2 Scan-pattern fix:** extend `scripts/no-developer-numbers-scan.sh` to catch the else-if-chain bare-float pattern these hid behind, so this class cannot hide again. Paste the scan diff + a re-run showing the previously-invisible constants would now be flagged (then GREEN after §3.1).

**Generality (§GC):** (a) class = any column of any unit/scale; (b) distribution-derived/recognized scale, no magnitude boundary; (c) no bare-float, no MIR-magnitude constant.

**EPG-3″:** the §3.1 diff; scan-pattern diff + re-run GREEN; no-regression (MIR scaleFactor still ≈ 1; BCL scale inference unchanged).

---

## §4 — PHASE 4: Per-Sheet Entity Key + route.ts Threshold Fold-In (self-gate to EPG-4)

**File:** `run/route.ts`. Three things in one touch (Rule 34):

**§4.1 Per-sheet entity key (general-by-construction):** `entityCol = knownEntityCols[0]` (~813-820) is one global key for all sheets. **MIR doesn't need it** (`entityCol` uniformly `DNI_Vendedor`) — this exists for tenants with heterogeneous sheet identifiers (SR-2). Derive the key **per sheet/component** from its `entity_identifier` binding. **Success = preserves MIR's correct `DNI_Vendedor` keying (no regression)**, NOT "unblocks Plan 3."

**§4.2 FOLD-IN — `run/route.ts:730` (`matchRate >= 0.8`):** an AUTHORITY threshold (entity_id_field / roster discovery). Eliminate to **argmax + structural floor 0** (same pattern as Phase 3's convergence replacements; import `resolver.ts` relative-separation if needed). This is in the same file and adjacent to the entity-key work — closed in this touch, not a second route.ts visit.

**§4.3 FOLD-IN — `run/route.ts:2734` (payout-equality epsilon):** a numerical-precision TOLERANCE, not an authority value. Annotate `// RATIFIED: numerical-precision epsilon for dual-path payout concordance, not an authority threshold (Decision 110)`. Classified explicitly, retained.

**EPG-4:** the per-sheet-key diff (derived from each component's binding → serves a heterogeneous tenant **by construction**; MIR's uniform keying preserved). The `730` elimination diff + `2734` ratification. `bash scripts/no-developer-numbers-scan.sh` on **`run/route.ts`** → GREEN (730 gone, 2734 ratified). BCL keying unchanged. Generality statement.

---

## §5 — PHASE 5: Cross-Period Reference-Resolution Capability (RISK · PAUSE at EPG-5)

**Files:** `run/route.ts` (`priorDataByEntity` ~959-1034), `intent-executor.ts` (~240-353). **Class:** any retroactive adjustment referencing a prior period via a link key (clawbacks, retroactive bonuses, corrections, reversals). MIR's clawback is **one instance**.

**§5.0 Source (settled §3.3):** (A) recompute-from-original-sale via the link-key→prior-period-row join, with the original plan's rate dependency. (Negative passthrough + conditional firing already supported — verify, don't rebuild.)

**§5.1 Implementation (general-by-design):** recognize a **reference-key field structurally** (not `Folio_Original` literal); resolve it to the prior-period row (wire the dead `priorDataByEntity`/`priorPeriodRows` substrate); let the **plan's declared formula** (whatever it is) compute from the recovered inputs; window/return-period **read from the plan**, not a literal.

**§5.2 CONSTRUCTED SECOND-INSTANCE (mandatory):** a synthetic retroactive adjustment with a **different link key and different source/formula**. Show it resolves through the *same* cross-period substrate. **HALT-GC5:** if it needs a new hardcoded key/source/formula → MIR's clawback in disguise, stop and generalize. Retain the fixture.

**EPG-5 (PAUSE):** MIR clawback trace (return period) — references resolve via the cross-period join, the prime produces a **negative** for return entities and 0 otherwise, negative carries to `total_payout`. The §5.2 second-instance proof. **SR-38 hand-comp** of one return-row entity. Generality statement. Architect reconciles vs ground truth.

---

## §6 — PR (no merge)
`npm run build` exit-0 (paste); `localhost:3000` (paste 200); then:
```bash
git add -A && git commit -m "OB-216: convergence unified path complete — general reduction + scale-inference elim + per-sheet key + route.ts thresholds + cross-period clawback"
git push origin ob-216-convergence-unified-path
gh pr create --base main --head ob-216-convergence-unified-path --title "OB-216: Convergence unified path (generality-first, complete)" --body "<phase-by-phase + generality evidence + 2 constructed fixtures + residual fold-ins>"
```
**DO NOT MERGE.** Completion report = PR body + all EPG + generality evidence + the route.ts/scan residual closures.

---

## §7 — Verification posture (SR-2 + Rule-34 closure)
- Each phase carries its generality statement; an EPG proving "MIR works" but unable to articulate the class is incomplete.
- Phases 3′ and 5 do NOT pass without their constructed second-instance proof.
- **Both scans GREEN at PR:** `convergence-service.ts` AND `run/route.ts` (with `2734` ratified) — and the scan-pattern fix (§3.2) means the previously-invisible scale constants are now in scope. This is the Rule-34 closure: every threshold in every file touched is resolved or explicitly ratified.
- The two constructed fixtures retained as regression fixtures.

## §8 — HALT conditions
- **HALT-G / HALT-GC3′ / HALT-GC5 / HALT-3″:** no clean reduction signal; reduction needs a 3rd-type branch; cross-period needs a new hardcoded key/source/formula; inferScale rewrite is high-risk on an off-path item → stop, report.
- **HALT-3 (Locked-Rule, SR-42):** any phase requiring a column-name literal, a developer threshold, or a MIR special-case to pass → surface the rule verbatim + dictated action, halt for architect disposition. **Never** add a MIR special-case to force a pass.
- **HALT-2:** BCL regresses → stop.
- Any claim not groundable in freshly-read live code → UNKNOWN; never substitute an extract.

## §9 — Cadence
| Phase | File(s) | Mode | Gate |
|---|---|---|---|
| **3′** general reduction + ref-prime guard | route.ts, intent-executor.ts | **PAUSE** | EPG-3′: Plan 3 non-zero + 2nd-instance + SR-38 |
| 3″ scale-inference elim + scan fix | convergence-service.ts, scan | self-gate | EPG-3″: scan-pattern + GREEN + no regression |
| 4 per-sheet key + `730` elim + `2734` ratify | route.ts | self-gate | EPG-4: general-by-construction + route.ts scan GREEN |
| **5** cross-period capability | route.ts, intent-executor.ts | **PAUSE** | EPG-5: clawback negative + 2nd-instance + SR-38 |
| PR | — | open, no merge | both scans GREEN + 2 fixtures + report |

Critical path to import-reconciliation: **3′ → 4 → 5**. Phase 3″ is off-path (self-gated, sequence at convenience — suggest after 5, before PR, to keep route.ts work contiguous). Two mandated pauses: **EPG-3′** and **EPG-5**. After PR: architect SR-44 browser recalc of all 5 plans vs ground truth, then merge.

---

*OB-216 final completion directive · generality-first + Rule-34 residual fold-in · 2026-06-18 · vialuce.ai*
