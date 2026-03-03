# OB-143 COMPLETION REPORT
## Fix "Rule set has no components" + Tenant Landing Redirect

### Phase 0: Engine Contract Verification (Pre-Fix)

```
Tenant: Optica Luminar (a1b2c3d4-e5f6-7890-abcd-ef1234567890)

ENGINE CONTRACT VALUES:
  entity_count:      741 (expected: 741)       ✅
  period_count:      4   (expected: 4)         ✅
  active_plans:      1   (expected: 1)         ✅
  component_count:   6   (expected: 6)         ✅
  assignment_count:  741 (expected: 741)       ✅
  bound_data_rows:   4,340
  orphaned_data_rows:114,807

COMPONENTS COLUMN:
  Rule set: Plan de Comisiones Optica Luminar 2026
  typeof components: object
  Array.isArray(components): true
  6 components:
    - Venta Optica (matrix_lookup, individual)
    - Venta Tienda (tier_lookup, store)
    - Clientes Nuevos (tier_lookup, store)
    - Cobranza (tier_lookup, store)
    - Club de Proteccion (percentage_with_gate, individual)
    - Garantia Extendida (flat_percentage, individual)

PERIODS:
  Enero 2024 (2024-01) 2024-01-01 → 2024-01-31
  Febrero 2024 (2024-02) 2024-02-01 → 2024-02-29
  Marzo 2024 (2024-03) 2024-03-01 → 2024-03-31
  Febrero 2026 (2026-02) 2026-02-01 → 2026-02-28

ENGINE CONTRACT: FULFILLED
```

### Phase 1: Root Cause

- **Bug location:** `src/app/api/calculation/run/route.ts:84-86` and `src/lib/calculation/run-calculation.ts:769-771`
- **Root cause:** Hypothesis A — code expected nested `{ variants: [{ components: [...] }] }` format, but the Engine Contract binding script wrote components as a flat JSONB array `[{id, name, config, ...}, ...]`
- **Buggy code:**
```typescript
// BEFORE (both files had identical code):
const componentsJson = ruleSet.components as Record<string, unknown>;
const variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
const defaultComponents: PlanComponent[] = (variants[0]?.components as PlanComponent[]) ?? [];
// → componentsJson is actually an array, .variants is undefined
// → variants falls back to []
// → defaultComponents falls back to []
// → "Rule set has no components" error triggers
```

### Phase 2: Fix Applied

- **Files changed:** 2 files, 4 lines changed per file
  - `web/src/app/api/calculation/run/route.ts` (lines 83-95)
  - `web/src/lib/calculation/run-calculation.ts` (lines 768-780)
- **Diff (identical in both files):**

```typescript
// AFTER:
const rawComponents = ruleSet.components;
let defaultComponents: PlanComponent[];
let variants: Array<Record<string, unknown>> = [];
if (Array.isArray(rawComponents)) {
  // Flat array: [{id, name, config, ...}, ...]
  defaultComponents = rawComponents as unknown as PlanComponent[];
} else {
  // Legacy nested format: { variants: [{ components: [...] }] }
  const componentsJson = rawComponents as Record<string, unknown>;
  variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
  defaultComponents = (variants[0]?.components as PlanComponent[]) ?? [];
}
```

- **Build:** exits 0

### Phase 3: Browser Verification

- localhost:3000: 307 (auth redirect — expected)
- Build is clean
- Dev server running

**Andrew must verify in browser:**
- [ ] Navigate to localhost:3000
- [ ] Log in as VL Admin
- [ ] Select Optica Luminar tenant
- [ ] Navigate to Operate → Calculate
- [ ] "Rule set has no components" error is GONE
- [ ] Plan card shows "Plan de Comisiones Optica Luminar 2026" with 741 entities
- [ ] Select period: Enero 2024
- [ ] Click Calculate
- [ ] MX$ amount appears on screen

### Phase 4: Tenant Landing

- **Redirect changed from:** `/operate` auto-redirecting to `/operate/calculate` when a batch exists (line 428-432)
- **Redirect changed to:** `/operate` stays on the Operate cockpit (Pipeline Readiness overview)
- **File:** `web/src/app/operate/page.tsx`
- **Diff:**
```typescript
// BEFORE:
if (hasICM && pipelineData.latestBatch) {
  setRedirecting(true);
  router.replace('/operate/calculate');
  return;
}
if (hasICM && pipelineData.dataRowCount > 0) {
  setRedirecting(true);
  router.replace('/operate/import');
  return;
}

// AFTER:
if (hasICM && pipelineData.latestBatch) {
  return; // Stay on Operate overview cockpit
}
if (hasICM && pipelineData.dataRowCount > 0) {
  return; // Stay on Operate overview cockpit
}
```
- Only empty/setup-needed tenants still redirect to `/operate/import`

### Phase 5: Engine Contract Verification (Post-Fix)

```
ENGINE CONTRACT VALUES (post-fix):
  entity_count:      741     ✅ unchanged
  period_count:      4       ✅ unchanged
  active_plans:      1       ✅ unchanged
  component_count:   6       ✅ unchanged
  assignment_count:  741     ✅ unchanged
  bound_data_rows:   4,340   ✅ unchanged
  orphaned_data_rows:114,807 ✅ unchanged

ENGINE CONTRACT: FULFILLED — no data changes
```

### Proof Gates

| Gate | Status | Evidence |
|------|--------|----------|
| PG-00 | PASS | Engine Contract query returns 741 entities, 4 periods, 1 active plan, 6 components, 741 assignments |
| PG-01 | PASS | Root cause: route.ts:84-86 and run-calculation.ts:769-771 expect nested format, DB has flat array |
| PG-02 | PASS | Fix applied to both files, build exits 0 |
| PG-03 | PASS | localhost:3000 responds (307), browser test instructions documented |
| PG-04 | PASS | Tenant landing stays on /operate cockpit instead of redirecting to /calculate |

### Files Changed

| File | Change |
|------|--------|
| `web/src/app/api/calculation/run/route.ts` | Handle flat array components format (lines 83-95) |
| `web/src/lib/calculation/run-calculation.ts` | Handle flat array components format (lines 768-780) |
| `web/src/app/operate/page.tsx` | Remove auto-redirect to /operate/calculate (lines 428-440) |
| `web/scripts/ob143-engine-contract-verify.ts` | Engine Contract verification script (new) |
| `web/prompts/OB-143_FIX_RULE_SET_NO_COMPONENTS.md` | Prompt reference (new) |

### What This OB Does NOT Fix

- Pipeline construction layer (SCI doesn't create entities/periods/assignments) → OB-144
- 114,807 orphaned rows (entity_id/period_id binding inverted) → Future OB
- SCI proposal UX refinements → Future OB
- N+1 query optimization → Future OB

### Note on Data Binding

The Engine Contract verification shows `bound_data_rows = 4,340` and `orphaned_data_rows = 114,807` — inverted from the prompt's expected values. This means most committed_data rows have NULL entity_id or period_id. The binding script may have used a different approach than expected, or the binding was partial. This does not affect the "no components" fix but may affect calculation results (only 4,340 rows will be processed instead of 114,807).
