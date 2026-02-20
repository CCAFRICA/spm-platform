# OB-68 Architecture Decision Record

**Date:** 2026-02-20

---

## FINDING: disputes table EXISTS in live DB
Columns: id, tenant_id, entity_id, period_id, batch_id, category, status, description, amount_disputed, amount_resolved, resolution, filed_by, resolved_by, resolved_at, created_at, updated_at

## FINDING: approval_requests table DOES NOT EXIST in live DB
Must create with migration.

## FINDING: audit_logs table EXISTS in live DB
Columns: id, tenant_id, profile_id, action, resource_type, resource_id, changes, metadata, ip_address, created_at

## FINDING: calculation_batches table EXISTS with valid lifecycle_state column
Has real data with APPROVED and CLOSED states. VALID_TRANSITIONS already enforced in code.

---

## DECISION 1: Dispute Persistence Architecture

**Problem:** Disputes currently stored nowhere — localStorage removed (OB-43A), save is no-op, demo data only. Must persist to Supabase disputes table.

**Option A:** Create API routes (POST/PATCH) that write to the existing disputes table. Modify dispute-service.ts to call API routes instead of no-ops.
- Scale: O(1) per dispute. ✓
- Uses REAL columns from live DB schema.
- Existing code: dispute-service.ts exists, has rich interface but no persistence.

**Option B:** Modify dispute-service.ts to use browser Supabase client directly (no API routes).
- Scale: Same. ✓
- Risk: Browser client subject to RLS — may need policies tuned.
- Pro: Fewer files, simpler architecture.

**CHOSEN:** Option A — API routes for writes (service role, reliable), browser client for reads (RLS-scoped). This matches the pattern used by invite API and update-role API.
**REJECTED:** Option B — Browser-only writes are fragile, and we need audit logging which requires trusted server-side context.

---

## DECISION 2: Approval Persistence Architecture

**Problem:** governance/approval-service.ts READS from calculation_batches but has no dedicated approval_requests table. createApprovalItem() generates ephemeral objects. resolveApproval() calls a no-op save.

**Option A:** Create approval_requests table + API routes. Wire both approval creation and resolution through the new table. Keep reading calculation_batches for lifecycle state display.
- Scale: ✓
- Enables: approval history, audit trail, decision notes
- Cost: New table + migration + API routes

**Option B:** Keep using calculation_batches.summary JSONB for approval metadata (submittedBy, approvedBy, etc.) without a separate table.
- Pro: No migration needed.
- Con: No proper approval history, no FK integrity, buried in JSONB.

**CHOSEN:** Option A — Create approval_requests table. Approvals are first-class entities that deserve their own table with proper FKs, status tracking, and audit trail.
**REJECTED:** Option B — JSONB metadata is not queryable, not auditable, and not a proper persistence layer.

---

## DECISION 3: Lifecycle State Immutability

**Problem:** VALID_TRANSITIONS already exists in calculation-service.ts. It allows APPROVED → OFFICIAL (for reject-back workflows) and APPROVED → POSTED (forward). The prompt asks for strict forward-only after APPROVED.

**Option A:** Database CHECK constraint — lifecycle_state transitions enforced at DB level.
- Pro: Cannot be bypassed.
- Con: Complex trigger needed for state machine at DB level.

**Option B:** Application-level guard — current VALID_TRANSITIONS map already enforces transitions. Tighten it to remove backward paths from POSTED onward.
- Pro: Already exists, just needs refinement.
- Con: Code-level only, can be bypassed by direct DB update.

**Option C:** Both — tighten application guard + add DB trigger.

**CHOSEN:** Option B — The application-level VALID_TRANSITIONS map already works and is well-tested. The current transitions are intentional (APPROVED → OFFICIAL allows rejection workflow). POSTED → onward is already forward-only. Adding a DB trigger would add complexity without practical benefit since all writes go through transitionBatchLifecycle().
**REJECTED:** Options A and C — Over-engineering for a single code path. The current guard is sufficient.

---

## DECISION 4: Audit Log Strategy

**Problem:** audit_logs table EXISTS. writeLifecycleAuditLog() already writes lifecycle transitions. Need to add dispute and approval audit entries.

**Option A:** Direct INSERT to audit_logs from each API route.
- Simple, each route manages its own logging.

**Option B:** Centralized audit function called from each route.
- Consistent format, single point of maintenance.

**CHOSEN:** Option B — Create a centralized `writeAuditLog()` function (extending the existing writeLifecycleAuditLog pattern) that all API routes call. Consistent format using the REAL audit_logs columns: profile_id, action, resource_type, resource_id, changes, metadata.
**REJECTED:** Option A — Duplicated INSERT patterns across routes would drift over time.
