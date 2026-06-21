# OB-216 — Close Directive (Phase 3″ + PR)

**Resume from:** `ob-216-convergence-unified-path` HEAD `228d1cf1` (Phases 0–4 committed; both scans GREEN; build + tsc exit-0).
**Goal:** complete Phase 3″ (scale-inference) and open the PR. Phase 5 (clawback) is HALTED — the PR records the HALT and its root cause honestly. **No merge (SR-44).**

---

## Phase 3″ — Scale-Inference Threshold Elimination (self-gate to EPG-3″)

Execute per `OB-216_FINAL_COMPLETION_DIRECTIVE` §2 (unchanged):
- Read `inferScale` live; replace hardcoded scale boundaries with distribution-derived or LLM-recognized scale.
- Extend `no-developer-numbers-scan.sh` to catch else-if-chain bare-float patterns.
- **HALT-3″** if the rewrite is high-risk on this off-critical-path item → carry to backlog.
- EPG-3″: diffs + scan GREEN + no regression.

## PR (no merge)

```bash
npm run build   # exit-0
gh pr create --base main --head ob-216-convergence-unified-path \
  --title "OB-216: Convergence unified path — sheet partition + agentic binding + general reduction + per-sheet key + threshold elimination" \
  --body "<see completion report below>"
```

## Completion report (PR body) — honest, no overclaim

**What is proven (4 plans, pasted evidence across phases):**
- Plan 1: binds to Ventas (own sheet); `Categoria` as attribute. Category-code mismatch (ALI vs Alimentos) is a surfaced plan-interpretation defect — reconciliation against GT may not pass due to this (architect-channel, not OB-216 scope).
- Plan 2: binds cross-sheet Ventas+Cuotas (abstract fields resolved); computes.
- Plan 3: binds to Cobranza; Saldo_Pendiente reduces to snapshot (not 147× sum); computes non-zero; SR-38 exact (vendor 10300030 = 16,024).
- Plan 4: binds to Clientes_Nuevos; Verificado via attribute branch; computes non-zero.

**What is NOT proven (Plan 5 — HALTED, per OB-216_PHASE5_HALT.md):**
- Plan 5 (clawback): convergence binds `Monto_Original` own-sheet and correctly **abstains** on `Tasa_Comision_Original` / `Multiplicador_Acelerador_Original`. Clawback cannot compute because: (a) the platform does not yet compute or store per-transaction calculation detail (the rate, accelerator, and commission earned on each individual transaction), which the clawback needs to reverse a specific sale's commission; (b) Plan 1's category-code mismatch independently prevents correct commission calculation. **The clawback is not a convergence failure — it is blocked on a named platform capability gap (per-transaction calculation and storage) that is being addressed in a separate build.**

**Open architect-verification items (SR-44):**
1. Plan 3 grand total vs ground truth (148,305.65).
2. BCL full recalc no-regression (headless harness hit stale period-id; architect browser-verifies).
3. Plan 1 reconciliation — may NOT pass due to category-code mismatch (surfaced finding, plan-interpretation defect).
4. Plan 5 — not verifiable until per-transaction capability exists.

**Structural deliverables:**
- Both `convergence-service.ts` and `run/route.ts` scans GREEN.
- 3 constructed second-instance fixtures retained (reduction max/average; per-sheet-key general-by-construction).
- Phase 5 HALT evidence committed.

---

*OB-216 close directive · 2026-06-18 · vialuce.ai*
