# OB-206 — Experience Architecture: Intelligence Stream Redesign — Completion Report

**Date:** 2026-06-14 · **Branch:** `ob-206-experience-architecture` → `main`
**Governing:** DS-013, DS-015, DS-003, DS-008-A2/A3, TMR-2/7/8 · **Absorbs:** OB-173
**Status:** SHIPPED — build exit 0. F-1/F-2/F-3 addressed; the Paradigm 2→3 gap closed on /stream.

**Collision gate:** `ls docs/.../OB-206*` → none · `git log --all | grep -i OB-206` → none. Number retained.

---

## Phase commits (SHAs)

| Phase | SHA | Scope |
|---|---|---|
| 0 — ADR + audit | `956d511e` | Decision record; component-data audit (HALT-1/2/3 cleared) |
| 1 — routing (F-1) | `ed5711a5` | tenant landing → /stream; empty-tenant guard |
| 3 — Manager (F-2) | `21425368` | entity×component heatmap (real payout), Acceleration Cards, coaching sort |
| 2+4 — Admin/Rep (F-3) | `c72f5bf1` | Admin composition verified; Rep entity-link guard |
| 5 — Korean Test | `4dfd4b02` | neutralize "commission statement" → "statement" |

### Files
- **Created:** `docs/architecture/EXPERIENCE_ARCHITECTURE_DECISION_OB206.md`,
  `web/src/components/intelligence/AccelerationCards.tsx`, 2 diag harnesses
- **Modified:** `web/src/middleware.ts`, `web/src/contexts/tenant-context.tsx`,
  `web/src/lib/data/intelligence-stream-loader.ts` (`buildTeamHeatmap`),
  `web/src/components/intelligence/TeamHeatmapCard.tsx`, `web/src/components/intelligence/index.ts`,
  `web/src/app/stream/page.tsx`

---

## HALT dispositions

- **HALT-1 (no State Reader):** NOT fired. `state-reader.ts` produces `TenantContext`
  (calculatedPeriods, uncalculatedPeriodsWithData, emptyPeriods, entityCount, activeRuleSet,
  lifecycleState, reconciliationMatch). Used as-is.
- **HALT-2 (no per-component data):** NOT fired. `calculation_results.components[]` carries
  `{componentId, componentName, payout, componentType}` for BCL — proven live.
- **HALT-3 (redirect loop):** NOT fired. The middleware landing redirect fires only on
  `pathname === '/' | '/login'`; `/stream` triggers no further redirect.
- **HALT-4 (locked-rule conflict):** none.

---

## §3.3 Component-Data Audit (the F-2 root cause, live BCL)

```
calculation_results.components[] = [
  { componentId: "c1-ejecutivo", componentName: "Colocación de Crédito",  payout: 180, componentType: "prime_dag" },
  { componentId: "c2-ejecutivo", componentName: "Captación de Depósitos", payout: 180, ... },
  { componentId: "c3-ejecutivo", componentName: "Productos Cruzados",     payout: 90,  ... },
  { componentId: "c4-ejecutivo", componentName: "Cumplimiento Regulatorio", payout: 100, ... } ]
attainment: { overall: 0 }   ← per-component attainment NOT persisted
rule_sets.components (BCL) = { variants: [...] }   ← variant-nested, no flat column list
```

**Finding (a):** the data is present; the grid rendered "–" because `buildTeamHeatmap` keyed cells on
per-component **attainment** (`comp?.attainment ?? entityAtt`), which is **not persisted** → 0 → dash.
**Fix:** columns from the results' `componentName`; cells = per-component **payout**; intensity =
payout relative to the component's peer max; rows sorted by coaching priority. Per-component
*attainment* persistence is **R1** (engine residual) — not fabricated.

---

## §8.2 Verification evidence (CC scope; authenticated render = SR-44)

1. **Routing → /stream (F-1):** `middleware.ts:324` and `tenant-context.tsx:197` both changed
   `/operate` → `/stream`. No loop (redirect guarded to `'/'|'/login'`). Authenticated nav = SR-44.
2. **Empty-tenant guard:** admin no-data → carrier "Next Step → Import Data" (`/operate/import`);
   manager/rep → single waiting message. Never blank.
3. **Admin (F-3):** composition pre-exists and is now reachable — SystemHealth hero → Action Required
   → Optimization (Bloodwork-gated) → Trajectory → Distribution → Lifecycle → demoted carrier Data
   Health. **TrajectoryCard already carries the reference frame** (`+X.X% avg growth`, from/to over N
   periods, projected next period) — F-13 already fixed. No rebuild (SR-43).
4 & 5. **Manager heatmap (F-2), live BCL** (`ob206-heatmap-verify.ts`):
   ```
   COLUMNS (from data): ["Colocación de Crédito","Captación de Depósitos","Productos Cruzados","Cumplimiento Regulatorio"]
   peerMax: Colocación=480, Captación=400, Productos=225, Cumplimiento=150
   Top coaching priority (gap-sorted) — cells show PAYOUT, no dashes:
     6640d026 total=272 gap=983 | Colocación=120 Captación=80 Productos=72 Cumplimiento=0
     2a503279 total=292 gap=963 | Colocación=120 Captación=0  Productos=72 Cumplimiento=100
     59136e6a total=308 gap=947 | Colocación=120 Captación=80 Productos=108 Cumplimiento=0
   ```
   Acceleration Cards (Certify=top performer / Coach=largest entity×component gap / Intervene=lowest)
   render above the grid.
6. **Rep (F-3):** composition pre-exists (earnings hero, allocation, component stack, neighborhood).
   Unlinked rep → single "Your entity record is not yet linked" element (§7.2 guard).
7. **Korean Test (#7):** grep of the stream builders + new components → **zero** hardcoded domain
   strings (the one found, "commission statement", was neutralized to "statement"). Heatmap columns
   derive from `componentName`.
8. **Cognitive Fit (#8):** Admin 5 component types · Manager 4 · Rep 4 — all ≥ 3 (Diversity Minimum).

**Build:** `rm -rf .next && npm run build` → **exit 0**, all touched files warning-clean.

---

## Residuals

- **R1 — per-component attainment persistence:** the engine persists per-component *payout*, not
  *attainment*. The heatmap encodes payout-relative-to-peer; a follow-on engine OB should persist
  per-component attainment for a target-relative encoding.
- **R2 — pagination at scale (MIR F-51/53):** heatmap caps at top-20 by coaching priority; the 150K
  Test is not yet satisfied for the heatmap — virtualization needed before MIR demo.
- **R3 — trajectory persistence (MIR F-45):** trajectory recomputed per load; Intervene approximates
  "declining 3 periods" by lowest attainment until per-entity period deltas are persisted.
- **R4 — Rep entity-linking (Assessment F-22, DS-027):** Rep surface degrades gracefully when
  `entity_id` is NULL; full Rep intelligence runs after DS-027.
- **R5 — R1 exit-criteria amendment:** Tier C criterion candidate "tenant lands on a persona-adapted
  intelligence stream" proposed in ARTIFACT SYNC for architect ratification.
- **R6 — currency authority:** new elements use the tenant-currency formatter; broader `$`-template
  convergence is separate.

---

## ARTIFACT SYNC

```
ARTIFACT SYNC
MC: F-1/F-2/F-3 production CLT findings → CLOSED by OB-206 (pending SR-44); CLT-165-F03, CLT-166-F01/F02/F03 addressed
REGISTRY: NEW "Intelligence Stream Experience" → L1 SPECIFIED → L2 on SR-44; Manager Coaching Surface → evidence: entity×component heatmap (real payout) + Acceleration Cards
R1: Tier C criterion candidate — "Tenant lands on persona-adapted intelligence stream, not a utility page" → pending SR-44
BOARD: Platform Core: stream routing changed; new rows for the three persona surfaces
SUBSTRATE: DS-013 Paradigm 3 exercised end-to-end; DS-008-A2 coaching priority (entity×component); DS-003 cognitive fit; TMR-7 persona psychology; Bloodwork applied per persona
```

---

*OB-206 · Experience Architecture · 2026-06-14 · vialuce.ai*
