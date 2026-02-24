# HF-058 Phase 0: Navigation Diagnostic

## Sidebar Structure (Sidebar.tsx)

The sidebar has these sections with links:

| Section | Item | href | Access |
|---------|------|------|--------|
| Dashboard | Dashboard | / | all |
| My Compensation | My Compensation | /my-compensation | all |
| Insights | Overview | /insights | insights |
| Insights | Compensation | /insights/compensation | insights |
| Insights | Performance | /insights/performance | insights |
| Insights | Dispute Analytics | /insights/disputes | insights |
| Insights | Sales Finance | /insights/sales-finance | salesFinance feature |
| Insights | Trends | /insights/trends | insights |
| Transactions | Orders | /transactions | transactions |
| Transactions | Find My Order | /transactions/find | transactions |
| Transactions | Inquiries | /transactions/inquiries | disputes |
| Transactions | Dispute Queue | /transactions/disputes | dispute_queue |
| Performance | Plan Management | /performance/plans | plans |
| Performance | Scenario Modeling | /performance/scenarios | scenarios |
| Performance | Goals | /performance/goals | performance |
| Performance | Adjustments | /performance/adjustments | approvals |
| Performance | Approvals | /performance/approvals | approvals |
| Financial | (5 items) | /financial/* | financial feature |
| Configuration | Overview | /configuration | configuration |
| Configuration | Personnel | /configure/people | personnel |
| Configuration | Users | /configure/users | configuration |
| Configuration | Teams | /configuration/teams | teams |
| Configuration | Locations | /configuration/locations | configuration |
| Configuration | Terminology | /configuration/terminology | configuration |
| Data | Import | /data/import | data_import |
| Data | Enhanced Import | /data/import/enhanced | data_import |
| Data | Daily Operations | /data/operations | data_import |
| Data | Data Readiness | /data/readiness | data_import |
| Data | Data Quality | /data/quality | data_import |
| Approvals | Approvals | /approvals | approvals |
| Operations | Rollback | /operations/rollback | data_import |
| Admin | Audit Log | /admin/audit | audit_log |
| Admin | New Tenant | /admin/tenants/new | vlAdminOnly |
| Admin | Customer Launch | /admin/launch | vlAdminOnly |
| Admin | Plan Import | /admin/launch/plan-import | vlAdminOnly |
| Admin | Run Calculations | /admin/launch/calculate | vlAdminOnly |
| Admin | Calculation Approvals | /govern/calculation-approvals | vlAdminOnly |
| Admin | Reconciliation | /investigate/reconciliation | vlAdminOnly |

## Reconciliation Routes

| Route | State |
|-------|-------|
| `/investigate/reconciliation` | FUNCTIONAL — OB-87 full rewrite, OB-91 enhanced |
| `/admin/launch/reconciliation` | REDIRECT → /investigate/reconciliation (OB-89) |
| `/admin/reconciliation-test` | DEBUG tool (keep) |
| `/operate/reconcile` | DELETED by OB-89 |
| `/govern/reconciliation` | DELETED by OB-89 |

## CLT-91 Finding Analysis

| Finding | Root Cause | Fix |
|---------|-----------|-----|
| F-01: Operate > Reconcile fails to Operate | `/operate/reconcile` deleted, catch-all sends to workspace stub | Create `/operate/reconciliation` as canonical home |
| F-06: Govern > Reconciliation fails to Govern | `/govern/reconciliation` deleted, catch-all sends to workspace stub | Not needed — reconciliation not a governance feature |
| F-08: Payroll Calendar → Operate | No sidebar link exists. URL direct access hits catch-all | No fix needed (not in sidebar) |
| F-09: Payroll Cycle → Operate | Same as F-08 | No fix needed (not in sidebar) |
| F-10: Rate Table → Operate | Same as F-08 | No fix needed (not in sidebar) |
| F-11: Resolution History → Investigate | Same pattern | No fix needed (not in sidebar) |
| F-12: Adjustment History → Investigate | Same pattern | No fix needed (not in sidebar) |

## Action Plan

1. Move functional reconciliation from `/investigate/reconciliation` to `/operate/reconciliation`
2. Update sidebar link from `/investigate/reconciliation` to `/operate/reconciliation`
3. Add redirect at `/investigate/reconciliation` → `/operate/reconciliation`
4. Update `/admin/launch/reconciliation` redirect target to `/operate/reconciliation`
5. F-08 through F-12: These are workspace catch-all issues, not sidebar links. No sidebar changes needed.
