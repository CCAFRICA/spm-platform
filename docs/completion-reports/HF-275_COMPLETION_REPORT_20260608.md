# HF-275 Completion Report — Convergence Population-Aware Column Preference

**Date:** 2026-06-08
**Branch:** `hf-275-population-aware-columns`
**Tenant of record:** Meridian Logistics Group `5035b1e8-0754-4527-b7ec-9f93f85e4c79`

---

## Commits
| SHA | Subject |
|---|---|
| (ADR) | HF-275 Phase 1: ADR — population-null-rate as a post-AI confidence adjustment (Option B) |
| `116a7965` | Phase 2: convergence population-aware column confidence adjustment |
| `e1b6e39d` | Phase 3: deterministic population-aware proof (real computeIndividualNullRates) |

---

## Phase 0 — code reads (HALT checks)
- `resolveColumnMappingsViaAI` sends column names to the AI and returns one proposed column per metric; **but** `generateAllComponentBindings` has a post-AI scoring/validation step (boundary validation via `scoreColumnForRequirement` + boundary fallback). → **HALT-0 NOT triggered** — fix lands post-AI as specified.
- `generateAllComponentBindings` already receives `tenantId` and `supabase` (+ capabilities carry `batchIds`). → **HALT-2 NOT triggered** — calculation-population rows reachable at binding time.
- `ColumnValueStats` = `{min,max,mean,sampleCount}` only (no null counts), computed globally → a dedicated per-population read is required.
- **Ordering confirmed:** `resolveEntitiesAtCalcTime` (run/route.ts:168) runs **before** `convergeBindings` (run/route.ts:258), so `entity_id` is populated on the calculation population at convergence time — the population check has data.

## Phase 1 — ADR
`docs/completion-reports/HF-275_ADR.md` — Option B (population-null-rate as a confidence adjustment) chosen over hard-filter (Option A, a gate) and AI-prompt-stats (Option C, deferred — higher variance).

## Phase 2 — implementation (`web/src/lib/intelligence/convergence-service.ts`)
- `computeIndividualNullRates(supabase, columns[])`: per-column null-rate over the **calculation population** (`committed_data` rows with `entity_id IS NOT NULL`), scoped per data batch, bounded paginated read (1k/page, 20k ceiling). Korean Test: operates on the structural presence of values for the passed column names — no column/component/tenant literal.
- **AI-proposal path:** a proposed column **100% null** on the population is **not accepted** (it cannot produce a value for any payee) → falls through to boundary scoring. Below 100%, accepted with proportional confidence `× (1 − null_rate)`.
- **Boundary path:** each candidate score `× (1 − null_rate)` → a 100%-null column scores 0 and cannot win; partial-null penalized proportionally; **null_rate 0 unaffected (DD-7)**.
- AP-17: extends the existing binding scorer; no parallel matcher. `compositional_intent` schema untouched.

**Build:** `[korean-test-gate] PASS` · `✓ Compiled successfully` · `tsc --noEmit` exit 0.

## Phase 3 — verification (deterministic; `scripts/hf275-population-check.ts`)
Live Meridian convergence could not be run — **Meridian `committed_data` is currently empty (architect mid cold re-import)**. Instead the proof exercises the **real `computeIndividualNullRates`** via a mock `committed_data` client with synthetic Meridian-shaped rows:
```
individual-population null rates (REAL computeIndividualNullRates):
  Cargas_Totales: 1.00   Capacidad_Total: 1.00   Cargas_Flota_Hub: 0.00   Capacidad_Flota_Hub: 0.00

binding decision:
  slot cargas_totales_hub:  AI proposed "Cargas_Totales" (null_rate 1.00) → REJECTED; boundary winner: Cargas_Flota_Hub (1.00 vs 0.00)
  slot capacidad_total_hub: AI proposed "Capacidad_Total" (null_rate 1.00) → REJECTED; boundary winner: Capacidad_Flota_Hub (1.00 vs 0.00)
PROOF: 7/7 assertions pass, 0 fail.
```
This reproduces the Meridian c4 mis-binding and shows HF-275 flips it: the hub-only name-similar columns are penalized to factor 0 and the individual-row fleet columns win.

**Live verification path:** the architect's in-progress Meridian cold re-import re-runs `convergeBindings` with HF-275; the convergence log will show `Cargas_Flota_Hub`/`Capacidad_Flota_Hub` winning the `cargas_totales_hub`/`capacidad_total_hub` slots. **This makes the previously-planned c4 binding SQL unnecessary** — HF-275 + the re-import bind c4 correctly at derivation time. (If the re-import happened before this PR merges, a fresh convergence — wipe `input_bindings` or re-import — is needed to pick up HF-275.)

## Standing-rule compliance
| Rule | Status |
|---|---|
| Korean Test (no field/component/tenant literals in algorithm) | PASS — structural null-rate over passed column names |
| Decision 158 (AI picks; code adjusts post-AI) | PASS — AI mapping unchanged; quality adjustment in the existing scoring layer |
| AP-17 (single code path) | PASS — extends generateAllComponentBindings; no parallel matcher |
| AP-13 (no assumed schema) | PASS — reads committed_data structurally |
| DD-7 (byte-identical where no excluded-population competition) | PASS — null_rate 0 → factor 1; AI path only changes at 100% null; boundary penalty only re-ranks when the AI proposal already fell through |
| SR-34 (class, not instance) | PASS — any tenant with excluded grouping rows |

## Residuals
- **Option C** (population stats in the AI prompt) deferred — Option B is deterministic and sufficient.
- **c0 reconciliation** — not a scale defect (HF-274) and not a binding-population defect (c0 binds individual-row columns). If c0 misreconciles after HF-274 + HF-275 + cold re-import, its cause is in intent structure / band evaluation — separate diagnostic.
- **Live Meridian convergence log** — to be captured by the architect's cold re-import (committed_data was empty at HF-275 authoring time).
