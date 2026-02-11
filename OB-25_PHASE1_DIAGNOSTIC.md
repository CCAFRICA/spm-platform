# OB-25 Phase 1 Diagnostic: Read and Inventory

## 1A: RENAME INVENTORY

### ClearComp References in Source Files

| File | Line | Current Text | New Text |
|------|------|-------------|----------|
| src/locales/es-MX/common.json | 3 | "name": "ClearComp" | "name": "ViaLuce" |
| src/locales/en-US/common.json | 3 | "name": "ClearComp" | "name": "ViaLuce" |
| src/components/navigation/Sidebar.tsx | 319 | "ClearComp" | "ViaLuce" |
| src/components/navigation/mission-control/MissionControlRail.tsx | 76 | ClearComp | ViaLuce |
| src/components/design-system/index.ts | 4 | ClearComp Unified Visual Language | ViaLuce Unified Visual Language |
| src/lib/demo/ob02-demo-data.ts | 258,293,403,455 | 'ClearComp' | 'ViaLuce' |
| src/lib/demo/demo-service.ts | 432,433,439,440,642,643 | ClearComp | ViaLuce |
| src/lib/reconciliation/reconciliation-bridge.ts | 943,958,963,964,967 | ClearComp | ViaLuce |
| src/app/configuration/page.tsx | 42-56 | @clearcomp.com emails | @vialuce.com emails |

### CC Admin References (55 total)
- Need to rename "CC Admin" to "VL Admin" in UI text
- Keep `isCCAdmin` function name (internal identifier)
- Rename `CCAdminUser` type to `VLAdminUser`
- Rename `cc_admin` role to `vl_admin`

### localStorage Keys with clearcomp_ prefix

| Current Key | New Key |
|-------------|---------|
| clearcomp_tenants | vialuce_tenants |
| clearcomp_tenant_registry | vialuce_tenant_registry |
| clearcomp_tenant_data_{id}_* | vialuce_tenant_data_{id}_* |
| clearcomp_rail_collapsed | vialuce_rail_collapsed |
| clearcomp_recent_pages | vialuce_recent_pages |
| clearcomp_nav_signals | vialuce_nav_signals |
| clearcomp_calculation_runs | vialuce_calculation_runs |
| clearcomp_calculations | vialuce_calculations |
| clearcomp_payroll_periods | vialuce_payroll_periods |
| clearcomp_data_component_mappings | vialuce_data_component_mappings |
| clearcomp_training_signals_* | vialuce_training_signals_* |
| clearcomp_employee_data | vialuce_employee_data |
| clearcomp_plans | vialuce_plans |
| clearcomp_plan_mappings | vialuce_plan_mappings |
| clearcomp_calculation_results | vialuce_calculation_results |
| clearcomp_customer_launches | vialuce_customer_launches |
| clearcomp_launch_steps | vialuce_launch_steps |
| clearcomp_reconciliation_* | vialuce_reconciliation_* |
| clearcomp_deletion_audit_log | vialuce_deletion_audit_log |
| clearcomp_recent_commands | vialuce_recent_commands |
| clearcomp_data_layer_* | vialuce_data_layer_* |
| clearcomp_periods_* | vialuce_periods_* |
| clearcomp_field_mappings_* | vialuce_field_mappings_* |

## 1B: localStorage Key Inventory

| localStorage Key | Service File | Read By | Write By | Data Shape | Target Table |
|---|---|---|---|---|---|
| compensation_plans | plan-storage.ts | orchestrator, calc page | plan-import | CompensationPlan[] | plans |
| data_layer_committed_aggregated_{tenantId} | data-layer-service.ts | orchestrator | aggregation | AggregatedEmployee[] | employee_metrics |
| data_layer_batches | data-layer-service.ts | multiple | data-layer | ImportBatch[] | import_batches |
| data_layer_committed | data-layer-service.ts | multiple | data-layer | CommittedRecord[] | import_records |
| clearcomp_calculation_runs | calculation-orchestrator.ts | cycle-service | orchestrator | CalculationRun[] | calculation_batches |
| clearcomp_calculations | calculation-orchestrator.ts | ledger, payout | orchestrator | CalcResult[] | calculation_results |
| clearcomp_employee_data | context-resolver.ts | orchestrator | context-resolver | EmployeeContext[] | employees |
| clearcomp_payroll_periods | context-resolver.ts | period-processor | period-processor | PeriodContext[] | payroll_periods |
| clearcomp_tenants | tenant-context.tsx | auth, navigation | provisioning | TenantConfig[] | tenants |
| clearcomp_tenant_registry | tenant-context.tsx | select-tenant | provisioning | TenantRegistry | tenants |
| rbac_roles | rbac-service.ts | permission checks | rbac-service | Role[] | roles |
| rbac_assignments | rbac-service.ts | permission checks | rbac-service | Assignment[] | role_assignments |

### Direct localStorage Access (Non-Service Files)

| File | Line | Access Type | Needs Abstraction |
|------|------|-------------|-------------------|
| src/app/select-tenant/page.tsx | 55-104 | getItem/setItem | YES - move to tenant-service |
| src/app/admin/launch/calculate/diagnostics/page.tsx | 139-239 | getItem | YES - diagnostic service |
| src/app/data/import/enhanced/page.tsx | 2006-2007 | getItem | YES - use data-layer-service |
| src/contexts/locale-context.tsx | 25,91,119 | getItem/setItem | OK - UI preference |
| src/contexts/navigation-context.tsx | 106,112,146,199 | getItem/setItem | OK - UI preference |
| src/contexts/config-context.tsx | 84,113,124 | getItem/setItem | OK - UI preference |
| src/components/access-control.tsx | 22 | getItem | YES - use auth-context |

## 1C: TypeScript Interface Audit

Key interfaces in use:
- `CompensationPlanConfig` - matches stored data
- `CalculationResult` - matches stored data
- `EmployeeMetrics` - matches stored data
- `ImportBatch` - matches stored data
- `CommittedRecord` - matches stored data

No major mismatches found.

## 1D: OB-20 Verification

| Phase | Claim | Status | Evidence |
|---|---|---|---|
| Phase 7: Navigation | CC Admin, breadcrumbs, role display | PARTIAL | Breadcrumbs in ModuleShell only, CC Admin routes exist |
| Phase 8: Governance | Govern pages functional | REAL | src/app/govern/ has 5 subdirs: access, approvals, audit-reports, data-lineage, reconciliation |
| Phase 12: AI Explainer | Compensation explainer built | MISSING | No explainer component found |
| Phase 13: Disputes | Structured dispute form | PARTIAL | GuidedDisputeFlow.tsx exists but incomplete |
| Phase 14: Audit Trail | SOC2 calculation logging | MISSING | No audit logging in calculation pipeline |

---
*Generated: 2026-02-10*
