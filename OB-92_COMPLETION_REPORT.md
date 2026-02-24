# OB-92: Unified Operate Lifecycle — Completion Report

## Status: COMPLETE

`npm run build` exits 0 (compiled successfully).

---

## Problem Solved

The Operate workspace had disconnected pages that each independently fetched data:
- **Results Dashboard** always loaded the latest batch with no selector
- **Reconciliation Studio** had its own batch selection, no coordination with Results
- **Operations Center** had period awareness but didn't share it
- No way to navigate between pages with consistent Plan × Period × Batch selection

---

## Architecture Decision

**Option B: Multi-page with shared OperateContext provider** — matches Next.js routing conventions, each page deep-linkable, shared context persists across navigation.

---

## What Was Built

### Phase 2: OperateContext Provider
- **File:** `web/src/contexts/operate-context.tsx` (336 lines)
- Shared React context holding Plan × Period × Batch selections
- Loads plans from `rule_sets`, periods from `periods`, batches from `calculation_batches`
- Cascading selection: changing plan resets period+batch, changing period resets batch
- SessionStorage persistence (`vl_operate_plan`, `vl_operate_period`, `vl_operate_batch`)
- Auto-selects: active plan first, most recent period, most recent batch
- Extracts `total_payout` from batch `summary` JSONB

### Phase 2b: Layout Wrapper
- **File:** `web/src/app/operate/layout.tsx`
- Wraps ALL `/operate/*` pages with `OperateProvider`
- Every operate page has context available automatically

### Phase 3: OperateSelector Bar
- **File:** `web/src/components/operate/OperateSelector.tsx` (147 lines)
- Horizontal bar with Plan / Period / Batch dropdowns
- Status dots per item (active=green, draft=gray, etc.)
- Batch items show: lifecycle state, entity count, total payout, date
- Uses shadcn Select components

### Phase 4: Batch-Aware Results Dashboard
- **File:** `web/src/app/operate/results/page.tsx` (modified)
- Removed independent `listCalculationBatches()` call
- Now reads `selectedBatchId` from OperateContext
- Added OperateSelector bar at top
- Changing batch in selector → results auto-refresh
- Batch label generated from context

### Phase 5: Bloodwork Anomaly Display
- **File:** `web/src/app/operate/results/page.tsx` (modified)
- Replaced flat amber wall with Standing Rule 23 pattern
- **Summary**: severity counts (critical/warning/info) + entities affected
- **Top finding**: always visible when collapsed
- **Expand**: grouped by severity with styled cards
- Severity mapping: zero_payout/missing=critical, outliers=warning, identical=info

### Phase 6: Reconciliation → OperateContext
- **File:** `web/src/app/operate/reconciliation/page.tsx` (modified)
- Added OperateSelector bar
- Initial batch selection prefers: URL param > OperateContext > first batch
- No disruption to existing multi-step reconciliation workflow

### Phase 7: Operations Center → OperateContext
- **File:** `web/src/app/operate/page.tsx` (modified)
- Added OperateSelector bar above PeriodRibbon
- Fixed stale link: `/investigate/reconciliation` → `/operate/reconciliation`

---

## Files Changed

| File | Action | Phase |
|------|--------|-------|
| `OB-92_PHASE0_DIAGNOSTIC.md` | CREATE | 0 |
| `OB-92_ADR.md` | CREATE | 1 |
| `web/src/contexts/operate-context.tsx` | CREATE | 2 |
| `web/src/app/operate/layout.tsx` | CREATE | 2 |
| `web/src/components/operate/OperateSelector.tsx` | CREATE | 3 |
| `web/src/app/operate/results/page.tsx` | MODIFY | 4, 5 |
| `web/src/app/operate/reconciliation/page.tsx` | MODIFY | 6 |
| `web/src/app/operate/page.tsx` | MODIFY | 7 |
| `OB-92_COMPLETION_REPORT.md` | CREATE | 8 |

---

## Commits

| Hash | Phase | Description |
|------|-------|-------------|
| `edae862` | 0 | Operate surface diagnostic |
| `60602d0` | 1 | Architecture decision — multi-page with OperateContext |
| `a6acef4` | 2 | OperateContext provider — shared Plan × Period × Batch state |
| `f996904` | 3 | OperateSelector bar — Plan × Period × Batch dropdowns |
| `761d09c` | 4 | Batch-aware Results Dashboard — reads from OperateContext |
| `ec92977` | 5 | Bloodwork anomaly display — summary/grouped/full pattern |
| `acfb7f1` | 6 | Reconciliation wired to OperateContext + selector bar |
| `9432b1e` | 7 | Operations Center — selector bar + fix reconciliation link |

---

## Constraints Honored

- Did NOT modify calculation engine
- Did NOT modify reconciliation comparison logic
- Did NOT modify AI pipelines
- Did NOT modify plan import
- Did NOT modify lifecycle service
- Standing Rule 23 (Bloodwork) applied to anomaly display
- Standing Rule 25 (One canonical route) honored — reconciliation link fixed

---

## Build

`npm run build`: exit 0 — zero lint errors, zero type errors.
