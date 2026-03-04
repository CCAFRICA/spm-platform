# OB-153 Phase 0: Full Vertical Diagnostic

**Date:** 2026-03-04

---

## 0A: Import Surface Period References

### Files with Period References in SCI Import Flow

| File | Line(s) | Type | What it does |
|------|---------|------|--------------|
| `web/src/app/operate/import/page.tsx` | 42 | State interface | `detectedPeriods?: string[]` in PostImportData interface |
| `web/src/app/operate/import/page.tsx` | 331 | Prop pass | `detectedPeriods={postImportData.detectedPeriods}` → ImportReadyState |
| `web/src/components/sci/ImportReadyState.tsx` | 24 | Function param | `detectedPeriods?: string[]` |
| `web/src/components/sci/ImportReadyState.tsx` | 36 | Destructure | `detectedPeriods,` from props |
| `web/src/components/sci/ImportReadyState.tsx` | 45-46 | State processing | `const periodLabel = detectedPeriods?.[0] ?? null` |
| `web/src/components/sci/ImportReadyState.tsx` | 60-62 | Button label | `Calculate ${periodLabel}` — dynamically labels Calculate button |
| `web/src/components/sci/ImportReadyState.tsx` | 109-114 | UI display | Shows "Period detected: [label]" to user |
| `web/src/app/api/import/sci/execute/route.ts` | 371-372 | Backend | `detectAndCreatePeriods()` called after target data commit |
| `web/src/app/api/import/sci/execute/route.ts` | 583-584 | Backend | `detectAndCreatePeriods()` called after transaction data commit |
| `web/src/app/api/import/sci/execute/route.ts` | 1102-1202 | Function | `detectAndCreatePeriods()` — creates periods table entries from date fields |
| `web/src/app/api/import/sci/execute/route.ts` | 1498-1561 | Backend | Period binding — links committed_data rows to created periods via period_id |
| `web/src/lib/sci/sci-types.ts` | 118 | Type | `'period_marker'` semantic role |
| `web/src/lib/sci/sci-types.ts` | 246 | Type | `detectedPeriods?: string[]` in SCIExecutionResult |

### Files WITHOUT Period References (clean)

- `web/src/components/sci/SCIExecution.tsx` — NO period references
- `web/src/components/sci/SCIProposal.tsx` — NO period references
- `web/src/components/sci/SCIUpload.tsx` — NO period references
- `web/src/app/api/import/sci/analyze/route.ts` — NO period references

### Key Finding

The backend `detectAndCreatePeriods()` creates periods and binds period_id, but the `detectedPeriods?: string[]` field in the execution result is **never populated** — so the frontend receives `undefined`. The period display in ImportReadyState is effectively dead code, but the backend period creation is very much alive.

---

## 0B: Engine Contract — Óptica Luminar

**Tenant:** optica-luminar (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

| Value | Current | Expected | Gap? |
|-------|---------|----------|------|
| rule_sets | 2 | >= 1 | NO (2 duplicates from HF-086 — HF-088 prerequisite note) |
| component_count | `{ components: [...] }` (object, not array) | Array of 7 | **YES — shape mismatch** |
| entities | 19,578 | >= 100 | NO (many exist) |
| periods | 0 | >= 1 | **YES — zero periods** |
| bound_data_rows (entity_id NOT NULL) | 93,112 | > 0 | NO |
| source_date_rows | 0 | > 0 | **YES — zero source_date** |
| assignments | 0 | >= entities | **YES — zero assignments** |
| total_committed_data | 140,510 | — | Reference |

### Construction Gaps (4 of 7 values broken):
1. **Periods: 0** — No periods created (detectAndCreatePeriods not wired or data lacks dates)
2. **source_date: 0** — OB-152 extraction not reaching committed_data
3. **Assignments: 0** — No rule_set_assignments exist
4. **Components shape**: `{ components: [...] }` object, NOT a flat array — parser expects flat array or `{ variants: [...] }` format, gets neither

---

## 0C: Components Parsing Bug — ROOT CAUSE IDENTIFIED

### Location 1: `web/src/app/api/calculation/run/route.ts:88-100`
### Location 2: `web/src/lib/calculation/run-calculation.ts:768-780`

Both files have identical parsing logic:

```typescript
const rawComponents = ruleSet.components;
if (Array.isArray(rawComponents)) {
  // Flat array path → SKIPPED (components is an object, not array)
  defaultComponents = rawComponents as PlanComponent[];
} else {
  // Legacy nested: looks for { variants: [{ components: [...] }] }
  const componentsJson = rawComponents as Record<string, unknown>;
  variants = (componentsJson?.variants as Array<...>) ?? [];  // → [] (no variants key)
  defaultComponents = (variants[0]?.components as PlanComponent[]) ?? [];  // → [] (variants is empty)
}
// defaultComponents.length === 0 → ERROR: "Rule set has no components"
```

### Actual JSONB shape in database:
```json
{ "components": [ {id, name, type, ...}, ... ] }  // 7 items
```

### Why it fails:
1. `Array.isArray({ components: [...] })` → `false` (it's an object)
2. Falls to else branch looking for `{ variants: [{ components: [...] }] }`
3. `componentsJson.variants` → `undefined` → defaults to `[]`
4. `variants[0]?.components` → `undefined` → defaults to `[]`
5. `defaultComponents.length === 0` → returns error

### The fix:
Add a third shape check: if `rawComponents.components` exists and is an array, use it. This is the actual format the plan interpreter writes.

---

## 0D: LAB Baseline

```
LAB: 268 results, 8498311.77
Expected: 268 results, 8498311.77
Committed data total: 1625 with period_id: 1563
BASELINE: PASS
```

---

## Summary

| Problem | Root Cause | Fix Phase |
|---------|-----------|-----------|
| Import requires period | Backend `detectAndCreatePeriods()` + UI period display | Phase 1 |
| No source_date on rows | Extraction exists but not wired to all import paths | Phase 2 |
| No periods | Will create at calculate time (Decision 92) | Phase 2D / Phase 3 |
| No assignments | No construction pipeline for rule_set_assignments | Phase 2C |
| Components parsing | JSONB is `{components:[...]}` but parser expects flat array or `{variants:[...]}` | Phase 3A |
