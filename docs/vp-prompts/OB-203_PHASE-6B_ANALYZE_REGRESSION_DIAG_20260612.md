# OB-203 Phase 6B — Witness Re-Run FAIL at Analyze: Regression DIAG Directive

**Date:** 2026-06-12
**Work item:** OB-203 Phase 6B (continues; witness re-run adjudication: **FAIL at analyze stage — import not executed**)
**Repo/branch:** `CCAFRICA/spm-platform` / `OB-203-phase-6` (clean at `f05a562e` per completion report)
**File location:** `docs/vp-prompts/OB-203_PHASE-6B_ANALYZE_REGRESSION_DIAG_20260612.md` (CC commits with its next commit)
**Discipline:** read-only DIAG; zero fix code; every claim carries pasted code/log/git evidence (E905). Numbering: read `docs/diagnostics/` and take the next DIAG-NNN.

## §1 — Witness evidence (architect eyewitness, session `e0f86141-1729-4d9e-a53d-6ddf3ee46580`, tenant `3d354bfa…`)

The analyze stage of the witness re-run regressed to pre-D15.1 behavior. Against the morning warm run (session `d8085364…`, same file, same tenant), the architect's console log shows:

1. **Workbook graph absent.** No `[SCI-WORKBOOK-GRAPH]` and no `[SCI-GRAPH-PRIOR]` lines anywhere in analyze. Morning run: graph annotated 16 units (edges=10) and the symmetric prior adjudicated 12 sheets.
2. **identifierRepeatRatio is population/sample again.** Empleados 2.40 (morning 1.00); Ventas_Transaccional **7640.14 = 160,443 ÷ 21** — full rowCount over sample distincts, the exact defect the 1a fix (divide by `structure.sampleRowCount`) removed. Productos_SKU 4.00 (was 1.00), Resumen_Producto 4.60 (was 1.00), Menu_Componentes 8.46 (was 3.85).
3. **HC patterns fire and win again.** Morning: 16× `NO_MATCH — Level 2 CRR Bayesian retained`. Now: Menus / Resumen_Sucursal / Resumen_Menu / Resumen_Empleado → `target@85 entity_targets`; Menu_Componentes / Resumen_Mensual → `transaction@85`.
4. **Tier-1 matched all 16 (confidence 0.75, matchCount 3) and injected bindings — yet final classifications contradict stored fingerprint classifications.** Empleados (fingerprint corrected to entity, hash `7707e8553823`) → final `transaction@78`. Sucursales → `target@74`. Portada → `plan@81`.
5. **A previously unseen line exists:** `[SCI-DEDUP] Removed split duplicate for Productos_SKU (transaction)` — confirming this is current code, not a stale build.
6. Environment note: two dev servers were running (CC's on 3000; the witness used a fresh one on 3001, same tree). Record and exclude or implicate with evidence; do not assume.

## §2 — DIAG questions (answer each with pasted evidence)

**Q1 — Where did the graph stage go?** Paste the current analyze route's stage sequence (`web/src/app/api/import/sci/analyze/**` and the modules it calls) and the git history of the file(s) that previously invoked workbook-graph synthesis + the symmetric graph prior. `git log --oneline -20 -- <paths>` plus the diff of the commit(s) that altered the call path. State plainly: removed, reordered behind a condition not met on this run, or moved to a path analyze no longer takes.

**Q2 — Where did the 1a ratio fix go?** Paste the current `identifierRepeatRatio` computation and `git log -p` for it since the 1a commit. Same three-way answer: reverted, recomputed elsewhere population-based, or the fixed function bypassed.

**Q3 — Why do HC patterns adjudicate again?** Morning behavior was patterns NO_MATCH / Level-2 retained with graph-prior arbitration. Paste the code that decides pattern-vs-CRR-vs-graph precedence and its git history across the E/C/D/B commits (`1f1d7d59` → `f05a562e` range, plus the Phase D funnel commits).

**Q4 — Why doesn't Tier-1 recognition carry classification?** The stored fingerprint for Empleados carries classification=entity (corrected under the 1a disposition). Paste the Tier-1 match path and show where stored classification is (or is no longer) applied to the unit's proposal. If the flagged warm-path role-scrambling residual (Phase C ADR) is implicated, connect it with evidence, not narrative.

**Q5 — Single root or several?** Conclude with a causal map: which commit(s) in the E→D→C→B sequence touched the analyze path, and whether items 1–4 share one structural cause (e.g., signal-funnel rework displacing analyze stages) or are independent regressions. Adjacent-Arm rule applies: identify the class, not just the instances.

## §3 — HALT

DIAG output to `docs/diagnostics/DIAG-NNN_ANALYZE_REGRESSION_OUTPUT.md`, committed and pushed; then **HALT for architect disposition**. No fix code, no re-run, no fingerprint mutation, no proposal interaction on session `e0f86141…` (it is evidence — leave it). The witness re-run remains FAILED until the regression is dispositioned, fixed, and a fresh run passes the full criteria of the HALT-1 disposition §4 + Amendment 2.

## §4 — Standing note for the record

Phase 6B's E/C/D/B EPGs all passed on scratch tenants and the kill-test, yet the analyze regression reached the witness undetected — the regression surface (classification outcomes on a known file) was not in any phase's EPG. After this DIAG closes, a residual goes on the record: **classification-equality check against the known proof file belongs in the pre-witness gate**, exactly as Phase 7's regression plan already does per-tenant for calculation anchors.
