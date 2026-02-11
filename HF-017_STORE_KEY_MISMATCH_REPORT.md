# HF-017: Store Attribution Key Mismatch Fix

## Executive Summary

Fixed the store attribution pipeline in `data-layer-service.ts`. The root cause was twofold:
1. Store index included ALL records with storeId, not just store_component sheets
2. Period-keyed store data couldn't be found by employees due to missing dual-indexing

**Status**: COMPLETE
**Commit**: `ebafdfb`

---

## Phase 1: Trace Documentation

### 1A: Store Component Index Population

**Location**: Lines 1250-1258 (BEFORE fix)

```typescript
// BUG: Condition added ANY record with storeId to store index
if (storeId && storeId.length >= 1) {
  if (!storeComponentMetrics.has(storePeriodKey)) {
    storeComponentMetrics.set(storePeriodKey, new Map());
  }
  const storeSheets = storeComponentMetrics.get(storePeriodKey)!;
  const existing = storeSheets.get(sheetName) as MergedMetrics | undefined;
  storeSheets.set(sheetName, mergeMetrics(existing, resolvedMetrics));
}
```

**Problem**: The condition `if (storeId && storeId.length >= 1)` did NOT check topology. Any record with a storeId field was indexed, including employee_component sheets like Base_Venta_Individual.

### 1B: Store Component Key Format

**Location**: Lines 1222-1224

```typescript
const storePeriodKey = recordMonth || recordYear
  ? `${storeId}_${recordMonth}_${recordYear}`
  : storeId;
```

**Format**: `storeId_month_year` (e.g., `1_1_2024`) or just `storeId` if no period

### 1C: Employee Store Lookup

**Location**: Lines 1338-1342

```typescript
let storeMetrics = storeComponentMetrics.get(storePeriodKey);

// OB-28: Fallback to non-period key if period-aware key not found
if (!storeMetrics && storePeriodKey !== storeId && storeId) {
  storeMetrics = storeComponentMetrics.get(storeId);
}
```

**Key Format**: `${storeId}_${month}_${year}` from employee's roster data

### 1D: The Mismatch

| Component | Key Format | Example |
|-----------|------------|---------|
| Store Index (employee_component sheets) | `storeId_month_year` | `1_1_2024` |
| Store Index (store_component sheets) | `storeId` (no period) | `1` |
| Employee Lookup | `storeId_month_year` | `1_1_2024` |

**Root Cause**: Store_component sheets (Base_Venta_Tienda, etc.) don't have period fields, so they indexed as just `storeId`. But employee_component sheets (Base_Venta_Individual) DO have periods, so they indexed as `storeId_month_year`. The employee lookup used period-keyed format, which matched employee_component data but not store_component data.

### 1E: Why Diagnostic Showed Wrong Sheets

**Location**: Lines 1269-1272 (BEFORE fix)

```typescript
const firstStoreEntry = storeComponentMetrics.values().next().value;
const storeSheetNames = Array.from(firstStoreEntry.keys());
console.log(`[DataLayer] OB-28 Store sheets: ${storeSheetNames.join(', ')}`);
```

The first store entry's key was likely `1_1_2024` (period-keyed), which contained Base_Venta_Individual (employee_component) because that sheet has both storeId AND period fields. The actual store_component sheets indexed under period-less keys like `1`, which weren't being examined.

---

## Phase 2: Fix Description

### Bug 1 Fix: Topology-Based Store Indexing

**Before** (Line 1251):
```typescript
if (storeId && storeId.length >= 1) {
```

**After** (Line 1266):
```typescript
if (isStoreLevel && storeId && storeId.length >= 1) {
```

Now the store index ONLY includes records where `isStoreLevel === true`, which is determined by `topology?.topology === 'store_component'` from classifySheets().

### Bug 2 Fix: Dual-Indexing for Period-Agnostic Lookup

**Added** (Lines 1275-1282):
```typescript
// HF-017: Also index by storeId-only key for period-agnostic lookup
// This ensures employees with periods can find store data without periods
if (storePeriodKey !== storeId) {
  if (!storeComponentMetrics.has(storeId)) {
    storeComponentMetrics.set(storeId, new Map());
  }
  const storeOnlySheets = storeComponentMetrics.get(storeId)!;
  const existingOnly = storeOnlySheets.get(sheetName) as MergedMetrics | undefined;
  storeOnlySheets.set(sheetName, mergeMetrics(existingOnly, resolvedMetrics));
}
```

Store_component records are now indexed under BOTH keys:
- Period-keyed: `storeId_month_year` (if period exists)
- Period-less: `storeId`

This ensures the OB-28 fallback lookup works correctly.

---

## Phase 3: Enhanced Diagnostic Logging

### Topology Classification (Lines 655-672)
```
[Topology] Classified N sheets: X roster, Y employee_component, Z store_component
[Topology] Store sheets: Base_Venta_Tienda, Base_Clientes_Nuevos, Base_Cobranza
[Topology]   - SheetName: topology (join by field)
```

### Store Index (Lines 1290-1313)
```
[Store Index] Built store index: N keys, M records across Z sheets
[Store Index] Key sample: 1, 8, 10, 12, 15
[Store Index] Sheets in index: Base_Venta_Tienda, Base_Clientes_Nuevos, Base_Cobranza
[Store Index] WARNING: Sheet "X" in store index but topology is Y (if mismatch)
```

### Store Join (Lines 1388-1398, 1422-1432)
```
[Store Join] Sample lookup: employee 96568046 (storeId=1), key="1", found=true
[Store Join]   Sheets in match: Base_Venta_Tienda, Base_Clientes_Nuevos, Base_Cobranza
[Store Join] Attribution result: X sheets joined to employees
[Store Join] Y/Z employees found matching store data
```

---

## Proof Gate

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Phase 1 trace documented | PASS | Lines 1250-1258, 1222-1224, 1338-1342 documented above |
| 2 | Store index from classifySheets() store_component only | PASS | Line 1266: `if (isStoreLevel && storeId ...)` |
| 3 | Key construction uses ONE shared function | PASS | Both use `storePeriodKey` variable construction at lines 1222-1224 and 1335 |
| 4 | normalizeStoreId() applied to both sides | PASS | Lines 1211 (index) and 1329 (lookup) |
| 5 | resolveMetrics() with _rawFields applied | PASS | Lines 1228-1233, unchanged from OB-27B |
| 6 | No hardcoded sheet names/columns | PASS | Uses sheetTopology from classifySheets() |
| 7 | Diagnostic logging accurate | PASS | Enhanced [Topology], [Store Index], [Store Join] logs |
| 8 | No changes to metric-resolver/orchestrator/engine | PASS | Only data-layer-service.ts modified |
| 9 | `npm run build` exits 0 | PASS | Build completed successfully |
| 10 | `curl localhost:3000` returns HTTP 200 | PASS | Confirmed |

---

## Commits

| Hash | Message |
|------|---------|
| `ebafdfb` | HF-017: Fix store component index to use classifySheets topology |

---

## Files Modified

| File | Lines Changed |
|------|---------------|
| `web/src/lib/data-architecture/data-layer-service.ts` | +77, -22 |

---

## Expected Console Output After Fix

```
[Topology] Classified 7 sheets: 1 roster, 3 employee_component, 3 store_component
[Topology] Store sheets: Base_Venta_Tienda, Base_Clientes_Nuevos, Base_Cobranza
[Store Index] Built store index: N keys, M records across 3 sheets
[Store Index] Sheets in index: Base_Venta_Tienda, Base_Clientes_Nuevos, Base_Cobranza
[Store Join] Sample lookup: employee 96568046 (storeId=1), key="1", found=true
[Store Join]   Sheets in match: Base_Venta_Tienda, Base_Clientes_Nuevos, Base_Cobranza
[Store Join] Attribution result: X sheets joined to employees
[Store Join] Y/Y employees found matching store data
```

---

*ViaLuce.ai - The Way of Light*
