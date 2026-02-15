# OB-43A Phase 0: localStorage Kill List

## Summary
- **Total localStorage references:** 767
- **Files with localStorage:** 93
- **Page files:** 127
- **isSupabaseConfigured branches:** 60+
- **employeeId/employee_id references:** 735
- **CompensationPlan references:** 150
- **planId/plan_id references:** 167

## localStorage References by File (sorted by count)

| Count | File |
|-------|------|
| 64 | lib/data-architecture/data-layer-service.ts |
| 40 | lib/orchestration/calculation-orchestrator.ts |
| 23 | lib/demo/demo-reset.ts |
| 20 | lib/calculation/results-storage.ts |
| 19 | lib/navigation/cycle-service.ts |
| 19 | lib/demo/demo-service.ts |
| 18 | lib/tenant/provisioning-engine.ts |
| 18 | lib/rbac/rbac-service.ts |
| 16 | lib/navigation/pulse-service.ts |
| 15 | lib/permissions/permission-service.ts |
| 15 | lib/performance/cache-service.ts |
| 15 | lib/forensics/forensics-service.ts |
| 15 | lib/demo/ob02-demo-data.ts |
| 15 | lib/demo/frmx-demo-provisioner.ts |
| 13 | lib/test/pipeline-test.ts |
| 13 | lib/test/CLT-01-test.ts |
| 13 | lib/storage/storage-migration.ts |
| 13 | lib/disputes/dispute-service.ts |
| 13 | contexts/auth-context.tsx |
| 12 | lib/test/OB-11-ui-import-test.ts |
| 12 | lib/storage/tenant-registry-service.ts |
| 12 | lib/navigation/queue-service.ts |
| 12 | lib/financial/cheque-import-service.ts |
| 12 | lib/compensation/plan-storage.ts |
| 11 | lib/test/ob12-verify-ui-persistence.ts |
| 11 | lib/tenant-data-service.ts |
| 11 | lib/notifications/notification-service.ts |
| 11 | contexts/tenant-context.tsx |
| 10 | lib/test/OB-13A-proof-gate.ts |
| 10 | lib/alerts/alert-service.ts |
| 9 | lib/test/OB-11-proof-gate.ts |
| 9 | lib/test/localstorage-dump.ts |
| 9 | lib/search/search-service.ts |
| 9 | lib/demo/frmx-data-generator.ts |
| 8 | lib/supabase/data-service.ts |
| 8 | lib/import-pipeline/smart-mapper.ts |
| 8 | lib/demo/foundation-demo-data.ts |
| 8 | lib/data-quality/quarantine-service.ts |
| 8 | lib/calculation/data-component-mapper.ts |
| 8 | lib/calculation/calculation-lifecycle-service.ts |
| 7 | lib/reconciliation/reconciliation-bridge.ts |
| 7 | lib/payout-service.ts |
| 7 | lib/analytics/analytics-service.ts |
| 6 | lib/test/OB-12-proof-gate.ts |
| 6 | lib/scenarios/scenario-service.ts |
| 6 | lib/plan-approval/plan-approval-service.ts |
| 6 | lib/payroll/period-processor.ts |
| 6 | lib/normalization/normalization-engine.ts |
| 6 | lib/help/help-service.ts |
| 6 | lib/calculation/context-resolver.ts |
| 6 | lib/calculation/calculation-summary-service.ts |
| 6 | lib/audit-service.ts |
| 6 | lib/ai/training-signal-service.ts |
| 5 | lib/supabase/entity-service.ts |
| 5 | lib/navigation/compensation-clock-service.ts |
| 5 | lib/data-architecture/data-package.ts |
| 5 | contexts/navigation-context.tsx |
| 5 | contexts/locale-context.tsx |
| 4 | lib/navigation/navigation-signals.ts |
| 4 | lib/intelligence/classification-signal-service.ts |
| 4 | app/admin/launch/calculate/diagnostics/page.tsx |
| 3 | lib/governance/approval-service.ts |
| 3 | lib/financial/entity-service.ts |
| 3 | lib/calculation/indexed-db-storage.ts |
| 3 | lib/approval-service.ts |
| 3 | contexts/config-context.tsx |
| 3 | app/data/import/enhanced/page.tsx |
| 2 | lib/test/* (6 files) |
| 2 | lib/normalization/module-aware-import.ts |
| 2 | lib/navigation/command-registry.ts |
| 2 | lib/launch/customer-launch-flow.ts |
| 2 | lib/financial/financial-service.ts |
| 2 | lib/compensation/retailcgmx-test.ts |
| 2 | lib/bulk/bulk-operations-service.ts |
| 2 | lib/approval-routing/approval-service.ts |
| 2 | hooks/useAdminLocale.ts |
| 2 | app/admin/launch/plan-import/page.tsx |
| 1 | types/demo.ts |
| 1 | lib/supabase/client.ts |
| 1 | lib/storage/index.ts |
| 1 | lib/compensation/calculation-engine.ts |
| 1 | hooks/use-tenant-data.ts |
| 1 | components/navigation/Sidebar.tsx |
| 1 | components/access-control.tsx |
| 1 | app/admin/reconciliation-test/page.tsx |
| 1 | app/admin/launch/calculate/page.tsx |

## Old Service Files to Delete
- `web/src/lib/compensation/plan-storage.ts` (31KB)
- `web/src/lib/data-architecture/data-layer-service.ts` (96KB)
- `web/src/lib/calculation/calculation-lifecycle-service.ts` (11KB)
- `web/src/lib/calculation/results-storage.ts` (17KB)

## Dual-Mode Branches (isSupabaseConfigured)
- entity-service.ts: 11 branches
- calculation-service.ts: 15 branches
- data-service.ts: 13 branches
- rule-set-service.ts: 13 branches
- auth-service.ts: 6 branches
- auth-context.tsx: 1 branch
- client.ts: 1 definition

## Type Aliases to Kill
- `compensation-plan.ts:312` — `RuleSetConfig = CompensationPlanConfig`
- `compensation-plan.ts:315` — `RuleSetStatus = PlanStatus`
- `calculation-engine.ts:44` — `EntityMetrics = EmployeeMetrics`
