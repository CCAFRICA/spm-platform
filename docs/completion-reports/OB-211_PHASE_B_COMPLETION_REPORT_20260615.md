# OB-211 Phase B — Verified Fixes: Completion Report

**Date:** 2026-06-15 · **Branch:** `ob211-phaseB-verified-fixes` · **Gate:** Phase A (#520) + Phase D (#521) on main. The opening fan-out grounded every item; these close them.

## Fix 1 — Results-table access double-gate — RESOLVED ✅
**Verified:** the page is wrapped in `RequireCapability('view.all_results')` (granted to platform **and** tenant admin), but an inner `hasAccess = user && isVLAdmin(user)` (platform-only) **blocked** a tenant admin the matrix says can view results.
**Fix:** collapsed to `hasAccess = !!user` — the `RequireCapability` wrapper is the authority; a user who passed it holds `view.all_results`. Removed the now-unused `isVLAdmin` import. **SR-39:** tenant-bounded (the reads are `.eq('tenant_id', ...)`); no widening beyond the capability.

## Fix 2 — G1 server COUNT — RESOLVED ✅
**Verified:** `entityCount = results.length` off an unbounded `getCalculationResults` (`calculation-service.ts:385`) → PostgREST default caps ~1000 → a 22K-entity batch showed 1000.
**Fix:** new `getResultCountForBatch(tenantId, batchId)` (`.select('*', { count: 'exact', head: true })`) — the **true** server count. Loaded in the same effect as the results (`Promise.all`, best-effort `.catch(()=>null)`); `entityCount = resultCount ?? results.length` (falls back to length while loading). Correct at >1000.

## Fix 3 — `useDrillThrough` extraction (the WS-3 enabler) — RESOLVED ✅
**Verified:** the drill was two inline states (`drillAnomaly` + `expandedEntity`) with ad-hoc open/close + a manual reset-on-batch. **NO HALT-C3-ADAPTER** (both contexts recoverable).
**Fix:** new `src/hooks/useDrillThrough.ts` — `useDrillThrough<T>(resetKey)` = `{target, open, close, isOpen}` over one `useState<T|null>` with an **automatic reset** when `resetKey` (the batch) changes. `/operate/results` refactored: the anomaly claim drill (`anomalyDrill`) + the row drill (`rowDrill`) both run through the hook (SR-34: the inline parallel removed). The per-surface VIEW (`AnomalyDrillThrough` / the L4/L3/L2 panel) and the telemetry (`captureResults(...)` before `open(...)` — the existing signal path, no new path) stay at the call site. **Zero stale `setDrillAnomaly`/`setExpandedEntity` refs remain.** **WS-3 consumes this** (every reusable dead drill prop opens through it — R1).

## Fix 4 — Payroll export hierarchy — HALT-EXPORT (named gap, no fabrication)
**Verified (fan-out):** `generatePayrollCSV` EXISTS and is wired (downloadable; columns Entity ID / Name / Total / period) — and it now lives under the **Calculation** agent (Phase A moved results→Calculation, the sign-off→export flow). The **hierarchy column is ABSENT**: hierarchy lives in `entity_relationships` (`manages/contains/oversees`), **not denormalized** onto `calculation_results`. A `traverseGraph` helper exists (`entity-service.ts`) but is **server-oriented and not wired into the client-side export path**.
**Disposition (HALT-EXPORT):** the export is surfaced; the hierarchy column is the **named remaining gap** — adding it needs a new `entity_relationships` fetch + graph traversal in the export path. **Not fabricated.** SR-38: `monto` = persisted `total_payout`. → **R2** (the hierarchy column as a scoped follow-on).

## Re-verify / gates
- `npx tsc --noEmit` → **0**; `npm run build` → **exit 0, ✓ Compiled successfully**.
- Code-level: `hasAccess = !!user`; `getResultCountForBatch` wired (`entityCount = resultCount ?? results.length`); `useDrillThrough` unifies both drills; zero stale refs.

## Adversarial sweep (access + drill-regression + count) — access CLEAN, drill CLEAN · 1 MEDIUM fixed

- **Access (double-gate collapse) — PASS, no widening.** The page export is wrapped in `RequireCapability('view.all_results')`, held by **exactly platform + tenant admin** (not manager/member/viewer). So `hasAccess = !!user` only evaluates for capability-holders → it admits **precisely the capability set** (the intended fix: stop blocking the tenant admin), not a widening. SR-39: both reads bind `.eq('tenant_id', tenantId)` with the tenant auth-derived (never a param) — no cross-tenant path.
- **Drill refactor — CLEAN, regression-free.** `useDrillThrough` preserves target/open/close + the batch reset; **all** call sites rewired (anomaly open/render/close, row open/toggle/render); `captureResults` telemetry still fires before `open()` (not moved into the hook); **zero** stale `drillAnomaly`/`expandedEntity`/setter refs.
- **MEDIUM (FIXED) — G1 broke the average.** Changing `entityCount` to the true server count made `avgPayout = totalPayout / entityCount` divide a **capped** sum (the fetched ≤1000 rows) by the **true** count → understated ~Nx for large batches. **Fix:** `avgPayout = totalPayout / results.length` — numerator and denominator both on the fetched population (consistent, matches pre-G1 behavior); the displayed **count** stays the true server count. **Residual R5:** `totalPayout`/avg are over the fetched population at >1000 entities — a server SUM aggregate would make them true (same class as G1).
- **LOW (FIXED) — stale copy.** The (now-redundant) inner denied-card read "VL Admin access required" → "Results-view access required".

**Re-verify:** `tsc` 0, `build` exit 0.

---

*OB-211 Phase B · 2026-06-15 · the verified fixes — tenant admin reaches the table, true counts, the drill mechanism extracted (the WS-3 enabler). Phase C (RLS plan) completes the comprehensive effort.*
