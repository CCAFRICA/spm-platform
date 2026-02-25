# OB-97 Phase 0: Platform UX Diagnostic

## 0A: Readability Baseline
- **text-zinc-500/slate-500/gray-500 count:** 397
- **text-xs count:** 815
- **Base font size:** 15px (already set in globals.css)

## 0B: Sidebar Navigation Structure
- **Active sidebar:** ChromeSidebar.tsx (workspace-aware, persona-filtered)
- **Legacy sidebar:** Sidebar.tsx (still exists, still imported in some layouts)
- **Navbar.tsx:** Top bar with status chip
- **Workspaces in config:** 7 (operate, perform, investigate, design, configure, govern, financial)

## 0C: Page Routes
- **Total pages:** 146
- **Stub pages (<30 lines):** 36

### Stub Pages (Dead Ends)
```
admin/launch/reconciliation (16 lines) — redirect stub
configure/[...slug] (5 lines)
configure/data-specs (2 lines)
configure/organization/locations (7 lines)
configure/organization/teams (7 lines)
configure/system (2 lines)
design/[...slug] (5 lines)
design/budget (2 lines)
design/goals (2 lines)
design/incentives (2 lines)
design/modeling (2 lines)
design/plans (7 lines)
govern/[...slug] (5 lines)
govern/access (2 lines)
govern/approvals (2 lines)
govern/audit-reports (2 lines)
govern/data-lineage (2 lines)
investigate/[...slug] (5 lines)
investigate/adjustments (2 lines)
investigate/audit (2 lines)
investigate/disputes (7 lines)
investigate/entities (2 lines)
investigate/reconciliation (14 lines)
investigate/transactions (2 lines)
operate/[...slug] (5 lines)
operate/approve (7 lines)
operate/calculate (16 lines) — redirect to admin/launch/calculate
operate/import/enhanced (8 lines)
operations/page (2 lines)
perform/[...slug] (5 lines)
perform/compensation (7 lines)
perform/dashboard (2 lines)
perform/inquiries (7 lines)
perform/team (7 lines)
perform/transactions (7 lines)
perform/trends (7 lines)
performance/page (29 lines)
```

## 0D: N+1 Residue
- **createClient() in components:** 0 (CLEAN)
- **.from() in components:** 0 (all hits are Array.from(), not Supabase)
- **Assessment:** N+1 is already resolved at component level

## 0E: Language Leakage
```
Sidebar.tsx:126 — "Rendimiento" (legacy sidebar)
Sidebar.tsx:133 — "Transacciones" (legacy sidebar)
Sidebar.tsx:146 — "Rendimiento" (legacy sidebar)
Sidebar.tsx:176 — "Configuración" (legacy sidebar)
```
- Legacy Sidebar.tsx still has Spanish leakage
- ChromeSidebar.tsx correctly uses `isSpanish` flag gated by persona
- PeriodRibbon always shows `labelEs` for lifecycle state (line 26)

## 0F: Batch Terminology
- **User-facing "Batch" instances:** 30+ across:
  - UploadZone.tsx (batchId prop)
  - GPVWizard.tsx (batchId in state)
  - PayoutBatchCard.tsx (component name + props)
  - operations/rollback/page.tsx ("Batch #...")
  - operate/reconciliation/page.tsx (batchId param)
  - operate/page.tsx (batchId URL param)
  - govern/calculation-approvals/page.tsx (batch_id)
  - performance/approvals/payouts/page.tsx (batchId)

## 0G: Import Flow
- **Import pages:** operate/import/*, data/import/* (duplicate sets)
- **"unmapped" in UI:** ComparisonUpload.tsx uses 'unmapped' as MappingTarget value
- **No "preserved" language found** — unmapped fields show as "Skip"

## 0H: Period Ribbon
- PeriodRibbon.tsx: text-xs for employee count and lifecycle labels
- text-zinc-500 used for inactive period metadata
- Lifecycle label always uses `labelEs` (Spanish) — violates Standing Rule 14

## 0I: Duplicate Routes
### Reconciliation (4 copies!)
1. `/operate/reconciliation/page.tsx` — CANONICAL (full implementation)
2. `/investigate/reconciliation/page.tsx` — redirect stub (14 lines)
3. `/admin/launch/reconciliation/page.tsx` — redirect stub (16 lines)
4. `/admin/reconciliation-test/page.tsx` — test page

### Calculate (4 copies!)
1. `/admin/launch/calculate/page.tsx` — CANONICAL (full implementation)
2. `/operate/calculate/page.tsx` — redirect stub (16 lines)
3. `/govern/calculation-approvals/page.tsx` — separate page
4. `/admin/launch/calculate/diagnostics/page.tsx` — diagnostic tool

## 0J: Workspace Labels
- All 7 workspaces present in ChromeSidebar: Perform, Operate, Investigate, Design, Configure, Govern, Financial
- Target: Remove Investigate, Design, Govern → consolidate to 4 workspaces

## Summary of Fix Plan

| Area | Current | Target | Delta |
|------|---------|--------|-------|
| Workspaces | 7 | 4 | Remove Investigate, Design, Govern |
| zinc-500 text | 397 | <200 | ~50% reduction |
| text-xs | 815 | ~700 | Upgrade labels to text-sm |
| Stub pages | 36 | 0 in nav | Remove from sidebar, delete or redirect |
| N+1 violations | 0 | 0 | Already clean |
| "Batch" in UI | 30+ | 0 | Replace with "Calculation Run" / "Import" |
| Period Ribbon | Spanish-only lifecycle | Locale-aware | Fix getLifecycleLabel |
| Duplicate reconciliation | 4 | 1 canonical | Redirect others |
| Duplicate calculate | 4 | 1 canonical + 1 diagnostic | Redirect others |
