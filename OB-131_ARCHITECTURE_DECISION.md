# OB-131 Architecture Decision Record

## Problem
Build reconciliation experience for Alpha proof: benchmark upload, per-entity comparison, Bloodwork results.

## Assessment of Existing Infrastructure

The reconciliation page at `/operate/reconciliation/page.tsx` (1192 lines, OB-87) already implements Option C from the spec:

| Feature | Status | Evidence |
|---------|--------|----------|
| File upload (CSV/XLSX) | DONE | SheetJS client-side parsing, drag-and-drop |
| AI column classification | DONE | POST /api/reconciliation/analyze → benchmark-intelligence.ts |
| Period discovery | DONE | Depth assessment, period matching display |
| Column mapping proposal | DONE | entityIdColumn, totalPayoutColumn auto-detected |
| User mapping overrides | DONE | Dropdown selectors for entity ID and payout columns |
| Comparison engine | DONE | POST /api/reconciliation/compare → comparison-engine.ts |
| False green detection | DONE | comparison-engine.ts multi-layer analysis |
| Executive summary | DONE | Match rate, total delta, entity count |
| Entity table | DONE | Sortable, searchable, per-entity VL vs benchmark |
| Component drill-down | DONE | Per-component deep dive with pagination |
| Population mismatches | DONE | VL-only and file-only entity panels |
| CSV export | DONE | Download comparison results |
| XLSX report | DONE | report-engine.ts structured export |
| Bilingual (en/es) | DONE | isSpanish conditional throughout |
| Korean Test | DONE | Zero domain vocabulary |
| Bloodwork Principle | DONE | Summary → detail on demand |
| Session persistence | DONE | POST /api/reconciliation/save |

## Gaps Identified

1. **Batch-centric selection** — Page selects by batch ID. OB-131 wants plan-centric: select plan, then batch is auto-determined from latest calculation for that plan.

2. **No navigation from OB-130 Calculate page** — PlanCard needs a "Verify Results" link that navigates to reconciliation with the plan pre-selected.

3. **Alpha proof not yet run** — No benchmark CSVs exist for LAB plans. Need to generate from known results and verify through UI.

## Decision: ENHANCE, NOT REWRITE

The existing page implements 90%+ of OB-131. Rewriting would violate DRY and risk regressions.

### Enhancements:
1. Add plan-centric batch selection (plan dropdown → auto-filter to latest batch for that plan)
2. Add "Verify Results" navigation from OB-130's PlanCard
3. Generate benchmark CSVs for Alpha proof
4. Run reconciliation through UI and verify 100% match

### What stays as-is:
- All comparison logic
- All AI analysis
- All results display
- All export functionality
- All bilingual support
