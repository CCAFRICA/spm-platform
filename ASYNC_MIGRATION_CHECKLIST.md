# Async Migration Checklist

## OB-25 Phase 7: Synchronous → Async Service Migration

This checklist catalogs all synchronous localStorage operations that must become async
when migrating to Supabase. Each service needs to be refactored to return Promises.

---

## Migration Priority Levels

- **P0 (Critical)**: Core data services, auth, tenant management
- **P1 (High)**: Transaction data, calculations, approvals
- **P2 (Medium)**: UI preferences, navigation state
- **P3 (Low)**: Demo data, test utilities

---

## P0: Critical Services

### 1. Tenant Data Service
**File**: `web/src/lib/tenant-data-service.ts`
**Current**: Sync localStorage reads
**Action**: Already partially async, complete migration

```typescript
// Current (sync)
export function saveTenantData<T>(tenantId: string, dataType: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// Target (async)
export async function saveTenantData<T>(tenantId: string, dataType: string, data: T): Promise<void> {
  await supabase.from('tenant_data').upsert({ tenant_id: tenantId, data_type: dataType, data });
}
```

### 2. Tenant Registry Service
**File**: `web/src/lib/storage/tenant-registry-service.ts`
**Current**: Async interface (good), localStorage backend
**Action**: Replace localStorage with Supabase client

### 3. Auth Context
**File**: `web/src/contexts/auth-context.tsx`
**Current**: localStorage for user session
**Action**: Replace with Supabase Auth

---

## P1: High Priority Services

### 4. Data Layer Service
**File**: `web/src/lib/data-architecture/data-layer-service.ts`
**Current**: localStorage with in-memory cache
**Action**: Supabase with React Query cache

Functions to migrate:
- `loadFromStorage<T>()` → Supabase query
- `saveToStorage<T>()` → Supabase upsert
- `getAllBatches()` → Supabase query with tenant filter
- `getCommittedRecords()` → Supabase query
- `commitBatch()` → Supabase transaction

### 5. Calculation Services
**Files**:
- `web/src/lib/calculation/context-resolver.ts`
- `web/src/lib/calculation/data-component-mapper.ts`
- `web/src/lib/orchestration/calculation-orchestrator.ts`

**Action**: Async data fetching, batch result storage

### 6. Approval Services
**Files**:
- `web/src/lib/approval-service.ts`
- `web/src/lib/approval-routing/approval-service.ts`
- `web/src/lib/plan-approval/plan-approval-service.ts`

Functions to migrate:
- `getAllRequests()` → async with tenant filter
- `createRequest()` → async insert
- `approveRequest()` → async update

### 7. Dispute Service
**File**: `web/src/lib/disputes/dispute-service.ts`
**Current**: `STORAGE_KEY_DISPUTES` localStorage
**Action**: Supabase disputes table

### 8. RBAC Service
**File**: `web/src/lib/rbac/rbac-service.ts`
**Current**: localStorage for roles and assignments
**Action**: Supabase with RLS policies

Functions to migrate:
- `getAllRoles()` → async tenant-scoped query
- `getAssignmentsForUser()` → async query
- `hasPermission()` → async with tenant validation

### 9. Audit Service
**File**: `web/src/lib/audit-service.ts`
**Current**: Single `audit_log` localStorage key
**Action**: Supabase with tenant isolation

---

## P2: Medium Priority Services

### 10. Analytics Service
**File**: `web/src/lib/analytics/analytics-service.ts`
**Current**: `REPORTS_STORAGE_KEY` localStorage
**Action**: Supabase reports table

### 11. Alert Service
**File**: `web/src/lib/alerts/alert-service.ts`
**Current**: localStorage for alert configs
**Action**: Supabase with tenant scope

### 12. Search Service
**File**: `web/src/lib/search/search-service.ts`
**Current**: localStorage for search history
**Action**: Supabase user preferences

### 13. Payout Service
**File**: `web/src/lib/payout-service.ts`
**Current**: `payout_batches` localStorage
**Action**: Supabase payout_batches table

### 14. Financial Services
**Files**:
- `web/src/lib/financial/financial-service.ts`
- `web/src/lib/financial/cheque-import-service.ts`
- `web/src/lib/financial/entity-service.ts`

**Action**: Dynamic tenant data loading from Supabase

### 15. Scenario Service
**File**: `web/src/lib/scenarios/scenario-service.ts`
**Current**: localStorage scenarios
**Action**: Supabase scenarios table

### 16. Notification Service
**File**: `web/src/lib/notifications/notification-service.ts`
**Current**: localStorage
**Action**: Supabase with real-time subscriptions

---

## P3: Low Priority Services

### 17. Navigation Services
**Files**:
- `web/src/lib/navigation/queue-service.ts`
- `web/src/lib/navigation/cycle-service.ts`
- `web/src/lib/navigation/navigation-signals.ts`
- `web/src/lib/navigation/command-registry.ts`

**Action**: Keep localStorage for performance (UI state)

### 18. Cache Service
**File**: `web/src/lib/performance/cache-service.ts`
**Action**: Keep localStorage for client-side caching

### 19. Help Service
**File**: `web/src/lib/help/help-service.ts`
**Action**: Keep localStorage for help preferences

### 20. Demo Services (Skip in Production)
**Files**:
- `web/src/lib/demo/demo-service.ts`
- `web/src/lib/demo/foundation-demo-data.ts`
- `web/src/lib/demo/frmx-demo-provisioner.ts`
- `web/src/lib/demo/ob02-demo-data.ts`
- `web/src/lib/demo/demo-reset.ts`

**Action**: Demo seeding scripts, not production critical

### 21. Test Utilities (Skip)
**Files**:
- `web/src/lib/test/*.ts`

**Action**: Development only, no migration needed

---

## Migration Pattern

### Standard Async Wrapper

```typescript
// Before
function getData(): Data[] {
  const stored = localStorage.getItem('key');
  return stored ? JSON.parse(stored) : [];
}

// After
async function getData(tenantId: string): Promise<Data[]> {
  const { data, error } = await supabase
    .from('table')
    .select('*')
    .eq('tenant_id', tenantId);

  if (error) throw error;
  return data ?? [];
}
```

### React Hook Pattern

```typescript
// Before
function useData() {
  const [data, setData] = useState<Data[]>([]);

  useEffect(() => {
    setData(getData());
  }, []);

  return data;
}

// After
function useData(tenantId: string) {
  return useQuery({
    queryKey: ['data', tenantId],
    queryFn: () => getData(tenantId),
  });
}
```

---

## Supabase Client Setup

```typescript
// web/src/lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Set tenant context for RLS
export async function setTenantContext(tenantId: string) {
  await supabase.rpc('set_tenant_context', { tenant_id: tenantId });
}
```

---

## Progress Tracker

| Service | Priority | Status | Notes |
|---------|----------|--------|-------|
| tenant-data-service | P0 | Pending | Partially async |
| tenant-registry-service | P0 | Pending | Interface ready |
| auth-context | P0 | Pending | Supabase Auth |
| data-layer-service | P1 | Pending | Large refactor |
| calculation services | P1 | Pending | 3 files |
| approval services | P1 | Pending | 3 files |
| dispute-service | P1 | Pending | |
| rbac-service | P1 | Pending | |
| audit-service | P1 | Pending | Add tenant scope |
| analytics-service | P2 | Pending | |
| alert-service | P2 | Pending | |
| search-service | P2 | Pending | |
| payout-service | P2 | Pending | |
| financial services | P2 | Pending | 3 files |
| scenario-service | P2 | Pending | |
| notification-service | P2 | Pending | Real-time |
| navigation services | P3 | Keep localStorage | UI state |
| cache-service | P3 | Keep localStorage | Performance |
| help-service | P3 | Keep localStorage | Preferences |
| demo services | P3 | Skip | Dev only |
| test utilities | P3 | Skip | Dev only |

---

## Total Files Requiring Migration

- **P0 Critical**: 3 files
- **P1 High**: 12 files
- **P2 Medium**: 9 files
- **P3 Low/Skip**: 14 files (keep localStorage or skip)

**Total async migration required**: 24 files

---

*Generated by OB-25 Phase 7 | ViaLuce Platform*
