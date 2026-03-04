# HF-086 COMPLETION REPORT
## VL Admin Tenant Operations

### Problem
VL Platform Admin cannot write data (plan import, data import, calculation, reconciliation)
inside tenant contexts because no profile exists in the target tenant. HF-085's profile
lookup returns null, fallback to raw `authUser.id` fails FK constraint on `created_by`.

### Architecture Decision
**Option A: Auto-create VL Admin profile in tenant on first write operation.**

- Clean FK resolution — profile.id satisfies all constraints
- Accurate audit trail — VL Admin operations attributed to VL Admin, not tenant admin
- Works for all routes via shared helper
- Profile created once per tenant (idempotent with race condition handling)

### Implementation
New file: `web/src/lib/auth/resolve-profile.ts`

```typescript
resolveProfileId(supabase, authUser, tenantId): Promise<string>
```

Logic:
1. Find existing profile by `auth_user_id + tenant_id`
2. If not found, check if caller is platform admin (vl_admin role OR @vialuce.com/ai email)
3. If platform admin: auto-create profile (role=admin, display_name='VL Platform Admin')
4. Return profile.id

Race condition handling: if insert fails (concurrent request), retry lookup.

### Routes Updated
| Route | Column | Before (HF-085) | After (HF-086) |
|---|---|---|---|
| /api/import/sci/execute | created_by | inline lookup + authUser.id fallback | resolveProfileId() |
| /api/plan/import | created_by | inline lookup + fallback | resolveProfileId() |
| /api/reconciliation/save | created_by | inline lookup + fallback | resolveProfileId() |
| /api/import/commit | uploaded_by | inline lookup + fallback | resolveProfileId() |

### Files Changed
- `web/src/lib/auth/resolve-profile.ts` — NEW: shared helper
- `web/src/app/api/import/sci/execute/route.ts` — use helper
- `web/src/app/api/plan/import/route.ts` — use helper
- `web/src/app/api/reconciliation/save/route.ts` — use helper
- `web/src/app/api/import/commit/route.ts` — use helper

### Proof Gates
- **PG-01:** Shared resolveProfileId helper created with auto-create logic
- **PG-02:** All 4 write routes use shared helper. Zero inline profile lookups remain.
- **PG-03:** Build clean. PR #166 merged to main. Vercel deploying.

### Deployed
PR #166 merged to main. Vercel production deploy triggered.
