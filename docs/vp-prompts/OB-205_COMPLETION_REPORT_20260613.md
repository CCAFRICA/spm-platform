# OB-205 — Carrier Expression (DS-029 Phase 1) — Completion Report

**Date:** 2026-06-13 · **Branch:** `ob-205-carrier-expression` → `main` · **Spec:** DS-029 (RATIFIED)
**Status:** SHIPPED — build exit 0. After import, carrier intelligence renders on `/stream` and the
import completion screen with no plan/calculation prerequisite.

**Path note:** the directive's paths omit `src/` (e.g. `web/app/...`); this repo is `web/src/app|lib|components`.
All files below use the real structure.

---

## Commits (SHAs)

| Phase | SHA | Summary |
|---|---|---|
| §3 Phase 1 — API | `a15bd5aa` | `GET /api/carrier-intelligence` + shared types + validation harnesses |
| §6 Phase 4 — expansions | `9ec980ce` | ContentUnitBrowser, EntityExplorer (committed before the cards that import them) |
| §4 Phase 2 — components | `e74afcb9` | ImportHealth, EntityLandscape, PipelineReadiness + hook + `/stream` integration |
| §5 Phase 3 — completion | `9d17a05b` | Import completion carrier briefing |

### Files created
- `web/src/lib/carrier/types.ts` — `CarrierIntelligence` payload contract
- `web/src/app/api/carrier-intelligence/route.ts` — main route (RLS, tenant-scoped)
- `web/src/lib/hooks/useCarrierIntelligence.ts` — fetch hook (raw fetch + useState, matches `/stream`)
- `web/src/components/stream/{CarrierImportHealth,CarrierEntityLandscape,CarrierPipelineReadiness,CarrierContentUnitBrowser,CarrierEntityExplorer}.tsx` + `index.ts`
- `web/scripts/diag/{ob205-schema,ob205-agg-probe,ob205-route-logic}.ts` — evidence harnesses

### Files modified
- `web/src/app/stream/page.tsx` — carrier stack rendered above calc elements AND as the primary
  surface in the no-calculation branch
- `web/src/components/sci/ImportReadyState.tsx` — carrier intelligence briefing after the green checks

---

## §2 — FP-49 Schema Gate (PASSED, live)

```
OK   committed_data           all 10 cols exist
OK   entities                 all 11 cols exist
OK   import_batches           all 11 cols exist
OK   classification_signals   all 13 cols exist
OK   rule_sets                all 5 cols exist
OK   rule_set_assignments     all 4 cols exist
OK   periods                  all 7 cols exist
OK   calculation_batches      all 5 cols exist
```

No schema changes. All reads against existing tables.

---

## HALT dispositions

- **HALT-1 (RLS blocks queries):** NOT triggered. The existing `/stream` data layer (`state-reader.ts`)
  already reads `committed_data`, `entities`, `periods`, `calculation_batches`, `rule_sets` client-side
  via the RLS browser client — proof RLS permits authenticated tenant-scoped reads. The route uses the
  same RLS (cookie) client and **guards every query**: a query ERROR (not empty) returns
  `403 { halt: 'HALT-1', table }`. None observed in validation.
- **HALT-2 (/stream architecture):** NOT triggered. `/stream` exists with a card/container pattern
  (`IntelligenceCard` base, `space-y-4` stacks). Carrier cards integrate into it; no separate page built.
- **HALT-3 (no data anywhere):** NOT triggered. Live `committed_data` counts:
  ```
     654854  MX Restaurant      304  Meridian Logistics Group     595  Banco Cumbre del Litoral
      43875  Sabor              114317  Trial 1                     18000  Trial2  …
  ```
- **HALT-4 (locked-rule conflict):** none. Korean Test held: every label derives from `data_type` /
  `entity_type` values; zero domain literals in carrier components.

---

## §7.2 — Verification evidence

**Build (§7.1):** `rm -rf .next && npm run build` → **exit 0**. Route registered:
`ƒ /api/carrier-intelligence`. No warnings/errors reference any new carrier/stream file.

**Dev server + auth-gate:** `npm run dev` boots; `GET /` → 307 (→ login, unauth); `GET
/api/carrier-intelligence` (no session) → **401** (auth-gated, defense in depth).

**Route data correctness** (`ob205-route-logic.ts`, service-role replication of the route's query logic):
```
Meridian:  totalRows 304 · contentUnits [entity 67, reference 36, target 201] · entities 67 (individual)
           avgConfidence 60% · readiness {data,entities,plan,bindings,calc all ✓, latest PREVIEW}
BCL:       totalRows 595 · contentUnits [entity 85, transaction 510] · entities 85 (individual)
           avgConfidence 80% · readiness {data,entities,plan,bindings,calc all ✓, latest PREVIEW}
```
Confidence is stored 0–1 on the carrier; the route normalizes to a 0–100 percentage.

**The 7 authenticated UI items (§7.2 #1–7)** require a logged-in `/stream` session. Per **SR-44
(browser verification = architect)**, these are the architect's step — CC cannot mint an authenticated
browser session here. The data path feeding those items is proven above; the render path is proven by
build exit 0. Honest disposition, consistent with prior auth-gated OBs (no fabricated screenshots).

---

## Residual dispositions

- **R1 (large-tenant perf):** head-counts are exact and fast (654K rows counted in 408 ms, measured).
  Distinct grouping values use a 1000-row sample — **exact for the proof tenants** (their full row set is
  ≤1000) and near-certain for high-frequency columns at scale. Materialized counts deferred (not needed
  at proof scale), as R1 anticipates.
- **R2 (content-unit secondary route):** **SKIPPED** per R2's allowance — per-content-unit
  earliest/latest/entitiesBound are folded into the main payload's `contentUnits`, so the Content Unit
  Browser is pure-render with no secondary call.
- **R3 (entity transaction counts / N+1):** handled by a **bounded ≤20-entity sample** in the main
  payload, each with a single head-count `transactionCount` (parallelized). No unbounded N+1.

**Interpretation note:** `dataSnapshot.entityBound`/`entitiesBound` are row-level (committed_data rows
with `entity_id` present) — true `COUNT(DISTINCT entity_id)` requires DB aggregates, which are disabled
on this project ("Use of aggregate functions is not allowed"). Documented in `types.ts`.

---

## §10 scope honored

Cold CRL tier, Admin-primary. No Warm/Hot tier, no FM reconnection, no Circadian items, no carrier-
interaction signal capture, no persona card variation, no schema changes — all DS-029 later-phase / future-OB.

---

*OB-205 · DS-029 Phase 1 · Carrier Expression · 2026-06-13 · vialuce.ai*
