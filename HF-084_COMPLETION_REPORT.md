# HF-084 COMPLETION REPORT
## Fix UUID Bug in SCI Execute

### Bug
```
[SCI Execute] Plan save failed: {
  code: '22P02',
  message: 'invalid input syntax for type uuid: "sci-execute"'
}
```

### Root Cause
File: `web/src/app/api/import/sci/execute/route.ts:846`

The SCI execute route passed the literal string `"sci-execute"` as `created_by` when inserting into the `rule_sets` table. PostgreSQL rejected it because `rule_sets.created_by` is a UUID column.

The route had **no auth session at all** — it used a raw service role client with no `getUser()` call.

### Fix
1. Added `createServerSupabaseClient` import and auth check at the top of the POST handler
2. Added 401 response for unauthenticated requests
3. Threaded `userId` (from `authUser.id`) through the call chain:
   - `POST` → `executeContentUnit(supabase, tenantId, proposalId, unit, authUser.id)`
   - `executeContentUnit` → `executePlanPipeline(supabase, tenantId, effectiveUnit, userId)`
   - `executePlanPipeline` → `created_by: userId`
4. Verified no other hardcoded string IDs exist in UUID columns across SCI routes

### Other Occurrences Checked
- `file_name: 'sci-execute-${proposalId}'` (lines 221, 428) — string column, not UUID. Harmless.
- `web/src/app/api/import/sci/analyze/route.ts` — no `created_by` fields. Clean.

### Files Changed
- `web/src/app/api/import/sci/execute/route.ts` (+15 lines, -5 lines)

### Proof Gates
- **PG-01:** `'sci-execute'` replaced with `userId` from auth session. Zero hardcoded string IDs in UUID columns.
- **PG-02:** Build clean. PR #164 merged to main. Vercel deploying.

### Deployed
PR #164 merged to main. Vercel production deploy triggered.
