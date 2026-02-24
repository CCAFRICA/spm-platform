# OB-92 Phase 0: Operate Surface Diagnostic

## Current Operate Pages

| Route | State | Description |
|-------|-------|-------------|
| `/operate` | LIVE | Operations Cockpit — lifecycle stepper, data readiness, calc summary |
| `/operate/results` | LIVE | Results Dashboard — Five Layers of Proof (OB-72) |
| `/operate/reconciliation` | LIVE | Reconciliation Studio (OB-87, moved from /investigate by HF-058) |
| `/operate/calculate` | REDIRECT | → /admin/launch/calculate (OB-89 consolidation) |
| `/operate/approve` | LIVE | Approval workflow |
| `/operate/pay` | LIVE | Payment processing |
| `/operate/normalization` | LIVE | Data normalization |
| `/operate/import/*` | LIVE | Import pages (base, enhanced, history, quarantine) |
| `/operate/monitor/*` | LIVE | Monitor pages (operations, quality, readiness) |

## Results Dashboard (operate/results/page.tsx)

- Loads `listCalculationBatches(tenantId)` — gets ALL batches, takes `batches[0]` (most recent)
- NO batch selector — user cannot choose which batch to view
- NO plan/period awareness — just grabs latest batch regardless
- Anomaly detection via `detectAnomalies()` — displays flat list of amber badges
- Five Layers: L5 Outcome → L4 Population → L3 Component → L2 Metric

## Operations Cockpit (operate/page.tsx)

- Loads via `loadOperatePageData()` from page-loaders
- Has PeriodRibbon for period selection
- Has LifecycleStepper for lifecycle state
- Has DataReadinessPanel
- Has calculation summary (totalPayout, entityCount, componentCount)
- Manages lifecycle transitions
- Smart period selection: prefers period with latest batch

## Reconciliation (operate/reconciliation/page.tsx)

- OB-87 full rewrite + OB-91 enhancements
- Steps: select_batch → upload → analysis → results
- Has its own batch selector
- Korean Test compliant
- Already reads from Supabase directly

## Key Services

- `calculation-service.ts` — listCalculationBatches, getCalculationResults, batch CRUD
- `page-loaders.ts` — loadOperatePageData (periods, batches, readiness)
- `anomaly-detection.ts` — detectAnomalies (identifies identical payouts)

## Existing Period/Context Infrastructure

- `period-context.tsx` — global period state
- `PeriodRibbon.tsx` — period selector component
- No OperateContext exists yet
- No shared plan/period/batch selection across Operate pages

## Architecture Notes

1. Results page independently fetches batches — no coordination with Cockpit
2. Reconciliation page independently selects batches — no coordination
3. Operations Cockpit has period awareness but doesn't share it
4. No way to navigate between pages with consistent plan/period/batch selection
