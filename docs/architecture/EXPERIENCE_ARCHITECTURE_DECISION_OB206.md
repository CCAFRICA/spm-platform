# Experience Architecture Decision Record — OB-206

**Date:** 2026-06-14 · **Governing:** DS-013, DS-015, DS-003, DS-008-A2/A3, TMR-2/7/8
**Absorbs:** OB-173 (never-executed Experience Architecture OB, March 16 assessment)

**Problem:** Route tenant selection to the canonical intelligence surface, and compose three
persona-specific intelligence streams that pass the DS-013 battery — closing the Paradigm 2 → 3 gap.

---

## Decision 1 — Tenant landing route → `/stream`

**Options:** (A) Observatory tenant-select → `/stream` (DS-015 §4.1 canonical, Decision 128).
(B) Keep `/operate` as landing, link to `/stream`.

**CHOSEN: A.** `/operate` becomes a *task surface* reached from stream actions (Calculate / Reconcile /
Import), not a landing.

**Migration (located in Phase 0):** the platform-admin landing redirect lives in **two** places that
override Decision 128 for admins specifically:
- `web/src/middleware.ts:324` — platform admin with a tenant cookie hitting `/` redirects to
  `/operate`. (The non-admin path at `:330` already routes everyone to `/stream`.)
- `web/src/contexts/tenant-context.tsx:197` — after tenant selection, admin `router.push('/operate')`.

Both change to `/stream`. **No-loop proof:** the middleware redirect block only fires when
`pathname === '/' || '/login'` (`:304`); `/stream` is neither, so landing on `/stream` triggers no
further redirect (HALT-3 cleared).

## Decision 2 — Per-persona stream composition (stable container, Decision 129)

The stream container is stable; **persona determines section content and ranking, not layout.** Three
persona builders already exist (`AdminStream` / `ManagerStream` / `IndividualStream` in
`web/src/app/stream/page.tsx`) producing ranked elements from one `TenantContext`
(`state-reader.ts`, verified present — HALT-1 cleared). This OB ranks/reference-frames the Admin
stream, rebuilds the Manager surface (F-2), guards the Rep surface, and keeps the HF-291 carrier
Data Health card demoted to the Admin bottom.

## Decision 3 — Component-level data path (F-2 root cause)

**Audit result (§3.3, live BCL):** per-component data **EXISTS** in
`calculation_results.components[]` as `{componentId, componentName, payout, componentType}`. The
`componentName` values match the failing grid's columns. **Finding (a):** the data is present; the
grid renders "–" because `buildTeamHeatmap` keys cell intensity on per-component *attainment*
(`comp?.attainment ?? entityAtt`), which is **not persisted** (`attainment.overall` is 0; metrics are
metric-keyed, not component-keyed) → 0 → dash. BCL's `rule_sets.components` is variant-nested
(`{variants:[…]}`), so the column set must come from the **results** componentNames, not the rule_set.

**Fix (structural, no placeholder):** heatmap columns = union of `componentName` across the team's
results; cell value = per-component **payout** (which exists); color intensity = payout relative to the
component's peer max; rows sorted by **coaching priority** (largest aggregate gap-to-peer-max first).
Per-component *attainment* persistence is a named engine residual (R1) — not fabricated here.

---

*OB-206 Phase 0 ADR · 2026-06-14 · vialuce.ai*
