# OB-40 Completion Report
## Lifecycle Completion and Period Close Cockpit
## Date: February 14, 2026

---

## PHASE 0: LIFECYCLE AND TENANT ID AUDIT

### LIFECYCLE AUDIT

**Current transition map:**
```typescript
const VALID_TRANSITIONS: Record<CalculationState, CalculationState[]> = {
  DRAFT: ['PREVIEW'],
  PREVIEW: ['OFFICIAL', 'PREVIEW'],
  OFFICIAL: ['PENDING_APPROVAL'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID'],
  REJECTED: ['PREVIEW'],
  PAID: [],
};
```

**States defined:** DRAFT, PREVIEW, OFFICIAL, PENDING_APPROVAL, APPROVED, REJECTED, PAID (7 states)

**States missing from canonical 9+2:** RECONCILE, POSTED, CLOSED, PUBLISHED (4 states missing)

**Gaps:**
- No POSTED state: APPROVED -> PAID skips posting results to all roles
- No CLOSED state: No period close tracking
- No PUBLISHED state: No terminal archival state
- No RECONCILE state: Reconciliation is ad-hoc, not lifecycle-tracked
- PAID is terminal with no transitions out

### APPROVAL CENTER

**Data source:** `vialuce_approvals_{tenantId}` localStorage key (approval-service.ts line 50)
**Reading function:** `listApprovalItems(tenantId)` at approval-service.ts line 186
**Gap:** Approval Center correctly reads from the approval items store. The "No requests" state appears when no items with status='pending' exist. The `createApprovalItem()` function (approval-service.ts line 55) must be called when transitioning to PENDING_APPROVAL. This IS called from calculate page (line 413-424). If the tenant ID used to write vs read differs, items won't appear.

### PERFORM VISIBILITY

**Gate condition:** `canViewResults(cycle.state, role)` at perform/page.tsx line 116
**Allowed states for sales_rep:** APPROVED, PAID only
**Gap:** No POSTED state exists. Sales reps can see results once APPROVED, but the spec requires a POSTED state between APPROVED and visible-to-all. Currently APPROVED == visible.

### TENANT ID

**Auth context provides:** `retail_conglomerate` (auth-context.tsx lines 236, 258, 275, 289)
**Tenant context reads:** `vialuce_current_tenant` localStorage key -> normalized via `normalizeTenantId()`
**Static config directories:** techcorp, restaurantmx, retailco, frmx-demo (NO retail_conglomerate directory)
**Dynamic config:** RetailCGMX provisioned dynamically, stored in `vialuce_tenants` localStorage
**Orchestrator uses:** `currentTenant.id` from tenant context (normalized)
**Data layer stores under:** `data_layer_committed_aggregated_{tenantId}`
**DemoUserSwitcher uses:** Both `retail_conglomerate` AND `retailcgmx` as keys (duplicate entries)

**Mismatch:** CONDITIONAL. If dynamic provisioning stored the tenant config with id `retailcgmx` but auth context sets tenantId to `retail_conglomerate`, the orchestrator would look for data under `retail_conglomerate` but find none. The normalization strips underscores but does NOT resolve the retailcgmx vs retail_conglomerate alias.

---

## COMMITS

(Populated as phases complete)

## FILES CREATED

(Populated as phases complete)

## FILES MODIFIED

(Populated as phases complete)
