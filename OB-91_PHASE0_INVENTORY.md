# OB-91 Phase 0: Inventory

## Existing Plan Review State

**File:** `web/src/app/admin/launch/plan-import/page.tsx` (1543 lines)

### Current Plan Import Flow
1. Upload file (CSV, XLSX, JSON, TSV, PPTX)
2. AI interpretation via `interpretPlanDocument()` → produces `ParsedPlan` with components
3. User reviews: interpretation summary card, plan metadata fields, detected components table
4. Edit component dialog: type, metric, measurement level, tier/matrix/percentage/conditional editing
5. Confirm & Import → builds `RuleSetConfig` → POST `/api/plan/import`

### What Exists
- Component table with confidence badges and edit button
- Full matrix/tier/percentage/conditional value editing in dialog
- Subway progress indicator (Upload → Review → Confirm)
- Bilingual labels (en-US / es-MX)

### What Does NOT Exist (Track A targets)
- **No structural validation** — values accepted as-is from AI
- **No monotonicity checks** — matrix rows/columns not checked for ordering
- **No outlier detection** — magnitude anomalies not flagged
- **No cross-variant comparison** — variants not compared
- **No completeness checks** — missing bindings not surfaced
- **No validation summary** — no pass/fail check count
- **No import gate** — import button only blocked if 0 components

---

## Existing Reconciliation State

**File:** `web/src/app/investigate/reconciliation/page.tsx` (1009 lines)

### Current Reconciliation Flow
1. Select calculation batch
2. Upload benchmark file (CSV/XLSX)
3. AI analysis → depth assessment + period discovery + column mapping
4. Confirm mappings → run comparison
5. Results: findings panel + summary cards + aggregate totals + entity table

### What Exists
- `ComparisonResultData` with per-employee, per-component breakdown
- Findings panel with false green detection
- Summary cards: matched count, match rate, false greens, depth, VL-only
- Aggregate totals: VL total, benchmark total, delta
- Per-entity table with sortable columns and component drill-down
- CSV export
- Population mismatch panels (VL-only, file-only)

### What Does NOT Exist (Track B targets)
- **No executive summary** — no headline narrative or top finding callout
- **No component-level aggregation** — no per-component totals, match rates, or delta analysis
- **No prioritized findings with pattern analysis** — findings exist but lack impact quantification and actionable recommendations
- **No XLSX export** — only CSV export available
- **No report generation engine** — results displayed directly from API response

---

## Key Types & Imports Available

- `AdditiveLookupConfig`, `PlanVariant`, `PlanComponent`, `MatrixConfig`, `TierConfig`, `Band`, `Tier` — from `@/types/compensation-plan`
- `recordSignal()`, `recordUserConfirmation()`, `recordUserCorrection()` — from `@/lib/intelligence/classification-signal-service`
- `ComparisonResultData` — defined inline in reconciliation page (lines 110-147)
- `XLSX` — already imported in reconciliation page
- `CARD_STYLE` — existing dark zinc theme constant
