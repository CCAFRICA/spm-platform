# OB-68 Phase 0: Diagnostic — Dispute, Approval, Lifecycle Audit

**Date:** 2026-02-20

---

## 1. Table Existence (Live Database Query)

| Table | Status | Evidence |
|-------|--------|----------|
| `disputes` | **EXISTS** (empty) | HTTP 200, `[]` from REST API |
| `approval_requests` | **DOES NOT EXIST** | HTTP 404: `Could not find the table 'public.approval_requests'` |
| `audit_logs` | **EXISTS** (empty) | HTTP 200, `[]` from REST API |
| `calculation_batches` | **EXISTS** (has data) | HTTP 200, 5 rows with lifecycle_state APPROVED/CLOSED |

### disputes columns (from OpenAPI):
```
id               uuid PK
tenant_id        uuid FK → tenants.id
entity_id        uuid FK → entities.id
period_id        uuid FK → periods.id
batch_id         uuid FK → calculation_batches.id
category         text
status           text
description      text
amount_disputed  numeric
amount_resolved  numeric
resolution       text
filed_by         uuid FK → profiles.id
resolved_by      uuid FK → profiles.id
resolved_at      timestamptz
created_at       timestamptz
updated_at       timestamptz
```

**NOTE:** Real schema differs from prompt reference:
- `filed_by` NOT `submitted_by`
- `amount_disputed`/`amount_resolved` (numeric) NOT `data_references` (JSONB)
- `resolution` is TEXT not JSONB
- No `assigned_to`, no `submitted_at`, no `submitted_by`

### audit_logs columns (from OpenAPI):
```
id               uuid PK
tenant_id        uuid FK → tenants.id
profile_id       uuid FK → profiles.id
action           text
resource_type    text
resource_id      uuid
changes          jsonb
metadata         jsonb
ip_address       inet
created_at       timestamptz
```

**NOTE:** Real schema differs from prompt reference:
- `profile_id` NOT `actor_id`
- `resource_type`/`resource_id` NOT `entity_type`/`entity_id`
- `changes` (single JSONB) NOT `before_state`/`after_state` (two columns)
- Has `ip_address` (extra)

---

## 2. Dispute State — Current Location

**Primary service:** `web/src/lib/disputes/dispute-service.ts`
- ALL storage disabled (localStorage removed in OB-43A)
- `saveDispute()` → no-op
- `getAllDisputes()` → returns `[]`
- `getDefaultDisputes()` → returns 2 hardcoded Maria Rodriguez demo disputes
- Zero Supabase reads or writes

**Types:** `web/src/types/dispute.ts`
- Rich type system: DisputeStatus ('draft'|'submitted'|'in_review'|'resolved'), DisputeCategory (7 types), DisputeOutcome, CompensationAdjustment
- NOT aligned with DB schema (different status values, different fields)

**UI consumers:**
- `transactions/disputes/page.tsx` — Dispute queue/list
- `transactions/disputes/[id]/page.tsx` — Dispute detail + resolution
- `transactions/[id]/dispute/page.tsx` — Create dispute from transaction
- `insights/disputes/page.tsx` — Dispute analytics dashboard
- `my-compensation/page.tsx` — Inline dispute form
- `components/disputes/GuidedDisputeFlow.tsx` — 3-step guided workflow

**API routes:** NONE — zero server-side dispute endpoints

---

## 3. Approval State — Current Location

**Four separate approval systems exist:**

| Service | Storage | Status |
|---------|---------|--------|
| `lib/governance/approval-service.ts` | Supabase (reads calculation_batches) | **Active, partially Supabase-backed** |
| `lib/approval-routing/approval-service.ts` | In-memory Maps + demo seed | Active, no persistence |
| `lib/approval-service.ts` | No-op (localStorage removed) | Legacy |
| `lib/plan-approval/plan-approval-service.ts` | Demo data only | Active, no persistence |

**Key finding for governance/approval-service.ts:**
- `listApprovalItemsAsync()` READS from Supabase `calculation_batches` WHERE lifecycle_state IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')
- `resolveApproval()` calls `saveApprovalItem()` which is a **NO-OP**
- Actual persistence for approval decisions happens via `transitionBatchLifecycle()` called directly from the UI page
- `createApprovalItem()` generates an in-memory object, calls no-op save

**UI consumer:** `govern/calculation-approvals/page.tsx`
- Calls `listApprovalItemsAsync()` to read pending approvals
- On approve/reject: calls `transitionBatchLifecycle()` directly (NOT through approval-service)
- Separation of duties enforced

**API routes:** NONE — zero server-side approval endpoints

---

## 4. Lifecycle Transitions — Current State

**Already well-implemented in `lib/supabase/calculation-service.ts`:**

```typescript
const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  DRAFT: ['PREVIEW'],
  PREVIEW: ['DRAFT', 'RECONCILE', 'OFFICIAL'],
  RECONCILE: ['PREVIEW', 'OFFICIAL'],
  OFFICIAL: ['PREVIEW', 'PENDING_APPROVAL', 'SUPERSEDED'],
  PENDING_APPROVAL: ['OFFICIAL', 'APPROVED', 'REJECTED'],
  APPROVED: ['OFFICIAL', 'POSTED'],
  REJECTED: ['OFFICIAL'],
  SUPERSEDED: [],
  POSTED: ['CLOSED'],
  CLOSED: ['PAID'],
  PAID: ['PUBLISHED'],
  PUBLISHED: [],
};
```

**DB writes confirmed:** `transitionBatchLifecycle()` writes to Supabase via `.update()`.

**Audit logging:** `writeLifecycleAuditLog()` in `calculation-lifecycle-service.ts` writes to `audit_logs` table.

**ISSUE:** APPROVED → OFFICIAL is currently a valid transition (regression allowed). The prompt requires forward-only after APPROVED. However, the existing code has established this as intentional for the "reject back to OFFICIAL" workflow.

---

## 5. Existing API Routes

No dispute, approval, or lifecycle API routes exist:
```
find web/src/app/api -path "*dispute*" → (empty)
find web/src/app/api -path "*approv*" → (empty)
find web/src/app/api -path "*lifecycle*" → (empty)
find web/src/app/api -path "*batch*" → (empty)
```

Only related route: `api/calculation/run/route.ts` (DRAFT → PREVIEW transition)

---

## 6. TypeScript Types for Disputes/Approvals

**Dispute types** (`types/dispute.ts`):
- `Dispute`, `DisputeStatus`, `DisputeCategory`, `DisputeOutcome`, `DisputeResolution`, `CompensationAdjustment`
- Rich but NOT aligned with DB schema

**Approval types** (`lib/governance/approval-service.ts`):
- `ApprovalItem`, `RiskAssessment`, `RiskObservation`
- Partially Supabase-backed (reads from calculation_batches, writes are no-ops)

**Lifecycle types** (`lib/supabase/database.types.ts`):
- `LifecycleState` union: 12 states
- `BatchType` union
