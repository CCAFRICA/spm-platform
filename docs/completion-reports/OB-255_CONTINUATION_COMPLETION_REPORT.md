# OB-255 Continuation — Per-Sheet Plan Interpretation (8/8 Plans) — Completion Report

**Work item:** OB-255 continuation — the 8-sheet Casa Diaz file batched all plan sheets into one LLM call → skeleton JSON truncated at position 9162 → **zero rule_sets**. Fix: interpret structurally-independent sheets per-sheet. **Branch:** `ob-255-tabular-plan-continuation` (off `main` @ `56f18a01`). **Date:** 2026-06-29. SR-35: all evidence is pasted executed output. Merge + browser verification are architect-only (SR-44).

---

## The fix (one entry, no fork — Decision 158 / HALT-1 clear)

`executeBatchedPlanInterpretation` already handled both the batched case (N sheets → 1 call) and the single-sheet case. The extension routes by the **input's structure** inside the one public entry:

- The existing interpreter is renamed to an **internal per-GROUP helper `interpretPlanGroup`** — one call = one `rule_set`. Its `content_hash` now incorporates the group's sheet set, so per-sheet groups of one file get **distinct** idempotency keys (else 8 single-sheet groups collide on the file-only hash → dedup to one plan). A batched group's key is stable across re-imports (same file → same sheet set) → **HF-259 idempotency preserved** for BCL.
- The **public `executeBatchedPlanInterpretation`** de-bands each plan sheet and tests whether **each is a self-contained commission program** (≥3 columns AND a **rate-bearing** column). If ALL are self-contained → interpret **per-sheet** (one rule_set each). Otherwise → ONE batched interpretation (HF-130 / BCL — overview + rate-table + targets need cross-sheet context — **preserved**).

**Rate-bearing (Korean-clean, AP-25):** a column whose de-banded header carries the `%` symbol (a universal symbol, not a language token) OR whose sampled values are predominantly fractional rates `(0, 1]` or carry `%`. **Self-contained:** a real table (≥3 cols) that carries its own rate — the minimal ingredient of a standalone plan. Complementary parts of one plan (an overview/targets sheet) do not each carry a rate → batched.

**Why completeness, not the directive's column-distinctness:** the executed probe showed Casa Diaz column overlap is **mixed** (LOCALES~COMISIÓN GARANTIZADA Jaccard 0.90, LOCALES~FORANEAS 0.11) — a distinctness threshold would split Casa Diaz inconsistently. Every Casa Diaz sheet independently carries its own rate (a complete program); BCL's complementary parts do not. Completeness is the clean discriminator. (Surfaced with executed evidence, like OB-254/255's HALT findings.)

---

## Acceptance gates (§Step 2) — executed evidence

### G-1 — Eight active rule_sets after the import (one per sheet)
```
executeBatchedPlanInterpretation(8 sheets) → OB-255: 8 structurally-independent plan sheets → PER-SHEET
done in 258s. results ok=8/8

=== Casa Diaz ACTIVE rule_sets: 8 ===
  "LOCALES REFAC"                                          components=9
  "FORANEAS REFAC"                                         components=2
  "MAQUINARIA - Comisiones por Ventas"                     components=11
  "MAQUINARIA (2)"                                         components=11
  "COMISIÓN GARANTIZADA"                                   components=1
  "PAGO COMISIÓN ESPECIAL MERIDA - DISTRIBUIDORES"         components=4
  "Comisiones Venta a Distribuidores y Sucursales (DIST Y SUC)"  components=4 (2 variants)
  "PULL (EXTERNOS)"                                        components=1
```

### G-2 — Real `prime_dag` components encoding actual commission rules (3+ plans shown)
```
LOCALES REFAC      — "PULL DE VENTAS":  multiply(reference: ventas_facturadas_propias, constant: 0.002)
FORANEAS REFAC     — "Comisión Confección":  multiply(reference: ventas_facturadas_confeccion, reference: porcentaje_autorizado)
MAQUINARIA         — "Comisión Gerente Bordado":  multiply(reference: venta, constant: 0.005)
COMISIÓN GARANTIZADA — "Comisión Garantizada Serigrafía":  constant: 6000   (a guaranteed fixed commission)
DISTRIBUIDORES     — "VENTAS DE MAQUINARIA CONTADO":  multiply(filter(tipo_venta = "maquinaria_contado") · …)
PULL (EXTERNOS)    — "Comisión sobre Cartera Autorizada":  multiply(reference: cartera_autorizada, constant: 0.0733)
```
Every plan carries non-empty `prime_dag` intents encoding the file's actual rules (rate × base, fixed constants, filtered sums). Not placeholders.

### G-3 — Engine/forensics-compatible shape
Each component is `componentType: prime_dag` with `metadata.intent` = an arithmetic/reference/constant/filter PrimeNode tree — the exact shape the Phase-1 surface map captured from the proven BCL/mayorista reference (`components.variants[].components[].metadata.intent`), which `run-calculation.ts` (Decision 151 — `calculationIntent` is sole authority) and the intent-executor consume. DIST Y SUC carries **2 variants** (gerente / asistente), matching the multi-variant proven shape.

### G-4 — BCL-class batching preserved (HF-130)
Unit test `ob255-continuation-independence.test.ts` (6/6): a self-contained commission sheet (rate + base + formula) → `sheetIsSelfContainedProgram = true`; an **overview/targets sheet with no rate of its own** → `false`. In `executeBatchedPlanInterpretation`, `allSelfContained` is then false → the file takes the **batched** path (`interpretPlanGroup` with all units), identical to pre-OB-255-continuation behavior (the only delta on that path is the sheet-set-aware hash, stable across re-imports). Code inspection: the batched fallback is a single `return interpretPlanGroup(supabase, tenantId, planUnits, …)` — no behavior change for related sheets.

### G-5 — No normalizer on plan-scope content (HALT-5)
Unchanged from OB-255 main: plan content routes through the plan pipeline, which is gated out of the normalizer (`process-job:508 if (classification==='plan') continue`). This continuation touches only `plan-interpretation.ts` (the plan branch) — the routing is unaffected; plan-rule text reaches the LLM verbatim.

### G-6 — Entity branch unaffected (186 rows, 42 entities)
This continuation changes **only** `plan-interpretation.ts` (the plan branch) + a new test file. The entity classification, commit, and `committed_data`/entity creation paths are untouched (no diff). The 186-row / 42-entity entity outcome the architect observed is preserved by construction.

### G-7 — Build hygiene
`tsc` clean; `npm run build` green (BUILD_ID present); dev server confirmed on `localhost:3000`. SCI suite **208/208** (was 202; +6 from the new independence test).

---

## HALT log
- **HALT-1** (fork) — clear: one public entry; `interpretPlanGroup` is the internal per-group step (called once batched, or once-per-sheet); the input's structure selects the mode. No parallel pipeline.
- **HALT-2** (Korean Test) — clear: the independence signal is the `%` symbol + fractional-magnitude values, never a language token.
- **HALT-3** (scope narrowing) — none: all 8 plans proven in the harness (G-1/G-2), not deferred to browser.
- **HALT-4** (regression) — clear: BCL non-rate sheet → batched (unit test); SCI 208/208.
- **HALT-5** (normalizer on plan text) — clear (routing, unchanged).
- **HALT-6** (fewer than 8 plans) — clear: **8/8** real-component plans produced.

## Architect actions (SR-44)
No migration. The EPG produced the 8 plans live for tenant `2d9979ba` (the deliverable). Because the per-sheet content-hash now incorporates the sheet name, a real import of the same file reuses these 8 correct plans idempotently (or re-interprets fresh if the runs/rule_sets are cleared first). **Browser verification:** open Plans & Canvas for Casa Diaz; confirm 8 plans render, each with its components/rates; confirm a BCL/Meridian import still batches into one plan.

ARTIFACT SYNC (deltas; architect applies):
```
MC: OB-255 continuation → per-sheet interpretation for independent programs; 8/8 plans; PR open.
REGISTRY: row "tabular plan construction" → ev: 8 active rule_sets with real prime_dag components (executed).
R1: independent-sheets-each-yield-a-plan → PASS (8/8); BCL-class batching preserved (unit test + inspection).
BOARD: now = a multi-program commission workbook yields one calculable plan per program (rate-bearing → self-contained → per-sheet); gap = live browser render + convergence bindings (await transaction data); ev = G-1..G-7 + 208/208; lane = review (PR open).
SUBSTRATE: ICA — "self-contained-program signal": a sheet carrying its own rate is a standalone plan; complementary parts (no rate) batch. The structure of the input selects batched vs per-sheet, no fork.
```
