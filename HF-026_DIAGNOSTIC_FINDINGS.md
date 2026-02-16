# HF-026 Diagnostic Findings

## 1. RetailCo/FRMX References in Source

### Critical (displayed in UI or used as fallback tenant IDs)

| File | Line | Pattern | Impact |
|------|------|---------|--------|
| `src/app/page.tsx` | 41 | `STATIC_TENANT_IDS = ['retailco', ...]` | Home page routes to mock data |
| `src/app/notifications/page.tsx` | 65 | `\|\| 'retailco'` | Queries wrong tenant |
| `src/app/insights/analytics/page.tsx` | 96 | `\|\| 'retailco'` | Queries wrong tenant |
| `src/app/admin/access-control/page.tsx` | 64 | `\|\| 'retailco'` | Queries wrong tenant |
| `src/app/data/quality/page.tsx` | 45 | `\|\| 'retailco'` | Queries wrong tenant |
| `src/app/workforce/permissions/page.tsx` | 62 | `\|\| 'retailco'` | Queries wrong tenant |
| `src/app/workforce/roles/page.tsx` | 54 | `\|\| 'retailco'` | Queries wrong tenant |
| `src/app/performance/approvals/plans/page.tsx` | 41 | `\|\| 'retailco'` | Queries wrong tenant |
| `src/app/operate/normalization/page.tsx` | 44 | `\|\| 'frmx-demo'` | Queries wrong tenant |
| `src/app/transactions/page.tsx` | 36 | `STATIC_TENANT_IDS = ['retailco', ...]` | Mock data routing |
| `src/components/plan-approval/SubmitForApprovalDialog.tsx` | 55 | `\|\| 'retailco'` | Writes to wrong tenant |
| `src/lib/storage/tenant-registry-service.ts` | 18 | `STATIC_TENANT_IDS` | Central definition |

### Non-critical (demo data in service files, comments, types)

- `src/lib/disputes/dispute-service.ts` — mock data uses `'retailco'`
- `src/lib/data-quality/quarantine-service.ts` — mock data uses `'retailco'`
- `src/lib/scenarios/scenario-service.ts` — mock data uses `'retailco'`
- `src/lib/rbac/rbac-service.ts` — mock data uses `'retailco'`
- `src/lib/alerts/alert-service.ts` — mock data uses `'retailco'`
- `src/lib/demo/demo-states.ts` — demo state data
- `src/lib/demo/demo-reset.ts` — localStorage key cleanup
- `src/lib/plan-approval/plan-approval-service.ts` — mock data
- `src/lib/payout-service.ts` — mock data notes
- `src/app/workforce/personnel/page.tsx` — static personnel array
- `src/app/transactions/[id]/page.tsx` — mock transaction detail
- `src/data/tenants/retailco/` — entire static config directory
- `src/data/tenants/frmx-demo/` — entire static config directory
- `src/data/tenants/index.json` — static tenant registry
- `src/types/compensation-plan.ts` — type comments
- `src/lib/labels/label-service.ts` — comments
- `src/lib/compensation/retailcgmx-plan.ts` — metric label
- `src/lib/compensation/plan-interpreter.ts` — comment

## 2. Unguarded Read Queries (27 functions)

### Currently guarded (18 writes):
`requireTenantId()` in calculation-service (4), entity-service (5), data-service (3), rule-set-service (1), calculation-lifecycle-service (1)

### Unguarded reads (27 functions):

**calculation-service.ts (8):**
- `getCalculationBatch`, `listCalculationBatches`, `getActiveBatch`
- `getCalculationResults`, `getEntityResults`, `getCalculationTraces`
- `getEntityPeriodOutcomes`, `getEntityOutcome`

**entity-service.ts (3):**
- `getEntity`, `listEntities`, `getEntityRelationships`

**data-service.ts (7):**
- `getImportBatch`, `listImportBatches`
- `getCommittedDataByEntity`, `getCommittedDataByBatch`, `getCommittedDataByPeriod`
- `getClassificationSignals`, `loadAggregatedDataAsync`

**rule-set-service.ts (6):**
- `getRuleSets`, `getRuleSet`, `getActiveRuleSet`, `getRuleSetsByStatus`
- `getRuleSetAssignments`, `getEntityRuleSetAssignments`

**calculation-lifecycle-service.ts (1):**
- `getLifecycleAuditTrail`

## 3. DemoPersonaSwitcher Issues

- **Line 36**: `PLATFORM_PASSWORD = 'VL-platform-2024!'` — WRONG (should be `demo-password-VL1`)
- **Visibility**: Uses `isVLAdmin` from tenant context (checks `manage_tenants` capability) — correct
- **demo_users source**: Fetches from `tenants.settings` via separate Supabase query — correct
- **Tenant context**: Does NOT include `settings` in TenantConfig type (only extracts country_code, timezone) — OK for switcher since it queries directly

## 4. Ghost Tenants

| ID | Name | Status |
|----|------|--------|
| `a0000000-0000-0000-0000-000000000001` | RetailCo MX | GHOST — 13 entities, stale pre-HF-025 data |
| `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | Optica Luminar | VALID |
| `b2c3d4e5-f6a7-8901-bcde-f12345678901` | Velocidad Deportiva | VALID |

Platform admin profile (`platform@vialuce.com`) has `tenant_id: a0000000...` (RetailCo MX) — but this is irrelevant since VL Admin uses sessionStorage/cookie for tenant selection, not profile.tenant_id.

## 5. Tenant Context Analysis

- **Line 52**: Tries static JSON first (`@/data/tenants/${id}/config.json`) before Supabase — safe because UUID-based IDs won't match static paths
- **Lines 85-101**: Supabase fallback builds TenantConfig with `name` and `displayName` from `row.name`
- **Settings NOT in TenantConfig**: The `settings` JSONB (containing `demo_users`) is extracted for country_code/timezone but not stored on TenantConfig object
