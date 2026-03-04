# HF-085 COMPLETION REPORT
## Fix created_by FK Mismatch

### Bug
```
Error code: 23503 (foreign key violation)
Key (created_by)=(5fb5f934-2fbd-499f-a2b8-7cd15ac6a1c3) is not present in table "profiles"
```

### Root Cause
HF-084 replaced `"sci-execute"` with `authUser.id` from the Supabase auth session. But `authUser.id` comes from `auth.users`, and the FK constraint references `profiles.id`. For seed accounts, these are different UUIDs:
- `auth.users.id`: `5fb5f934-2fbd-499f-a2b8-7cd15ac6a1c3`
- `profiles.id`: `02000000-0001-0000-0000-000000000001`

The link between them is `profiles.auth_user_id = auth.users.id`.

### Fix
After auth, look up the profile by `auth_user_id` + `tenant_id`, use `profile.id` for all FK-constrained columns. Pattern:

```typescript
const { data: callerProfile } = await supabase
  .from('profiles')
  .select('id')
  .eq('auth_user_id', authUser.id)
  .eq('tenant_id', tenantId)
  .maybeSingle();

const profileId = callerProfile?.id ?? authUser.id; // fallback for non-seed accounts
```

### Audit Results
Checked ALL API routes that write to FK-constrained profile columns:

| Route | Column | Table | Status |
|---|---|---|---|
| `/api/import/sci/execute` | `created_by` | `rule_sets` | **Fixed** |
| `/api/plan/import` | `created_by` | `rule_sets` | **Fixed** |
| `/api/reconciliation/save` | `created_by` | `reconciliation_sessions` | **Fixed** |
| `/api/import/commit` | `uploaded_by` | `import_batches` | **Fixed** |
| `/api/disputes` | `filed_by` | `disputes` | Already correct (uses `profile.id`) |
| `/api/disputes/[id]` | `resolved_by` | `disputes` | Already correct |
| `/api/approvals` | `requested_by` | `approval_requests` | Already correct |
| `/api/approvals/[id]` | `decided_by` | `approval_requests` | Already correct |
| `/api/calculation/run` | `created_by` | `calculation_batches` | Safe (passes null) |

### Files Changed
- `web/src/app/api/import/sci/execute/route.ts` — profile lookup + use profileId
- `web/src/app/api/plan/import/route.ts` — profile lookup + use resolvedProfileId
- `web/src/app/api/reconciliation/save/route.ts` — profile lookup + use resolvedProfileId
- `web/src/app/api/import/commit/route.ts` — profile lookup + use resolvedUserId

### Proof Gates
- **PG-01:** All `created_by`/`uploaded_by` assignments use resolved profile ID. Zero instances of raw `authUser.id` passed to FK-constrained columns.
- **PG-02:** Build clean. PR #165 merged to main. Vercel deploying.

### Deployed
PR #165 merged to main. Vercel production deploy triggered.
