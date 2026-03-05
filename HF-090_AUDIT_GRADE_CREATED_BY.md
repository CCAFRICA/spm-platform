# HF-090: AUDIT-GRADE created_by — auth.uid() DIRECT ATTRIBUTION
## Target: Current release
## Depends on: HF-089 (PR #177 — to be reverted)
## Priority: P0 — Blocks all SCI execute (plan + data import)

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## INCLUDE AT TOP
Read and comply with `CC_STANDING_ARCHITECTURE_RULES.md` before any implementation.

---

## CONTEXT

### What Happened
CLT-157 found that SCI execute returns 500: "No profiles exist in tenant — cannot resolve created_by." HF-089 (PR #177) attempted to fix this by adding a `resolveProfileId` fallback chain that progressively degrades attribution quality:
1. Profile by auth_user_id + tenant_id
2. Platform profile (tenant_id IS NULL)
3. Tenant admin profile
4. Any profile in tenant

**HF-089's fix is architecturally wrong.** The fallback chain:
- Degrades audit integrity (borrowing another user's profile ID)
- Violates SOC audit requirements (created_by must identify the ACTUAL person)
- Adds unnecessary code complexity (4-step resolution chain)
- Still fails in production (Vercel logs confirm the same 500 after PR #177 deployed)

### The Root Cause
`created_by` columns have FK constraints to `profiles(id)`. VL Admin's platform profile has `tenant_id IS NULL`. When VL Admin imports into a tenant, the code queries `WHERE tenant_id = ?` and finds zero profiles → throws.

### The Correct Fix
**Use `auth.uid()` directly.** The Supabase auth user ID is:
- **Immutable** — cannot be deleted or recreated by application code
- **Verified** — comes from Supabase's JWT, not an application query
- **Unambiguous** — always identifies the exact person who performed the action
- **Available** — already in the session, no database query needed

This requires:
1. Drop FK constraints from `created_by`/`uploaded_by`/`submitted_by`/`resolved_by`/`approved_by` columns
2. Replace all profile resolution logic with `auth.uid()` from the session
3. Delete the entire `resolveProfileId` function and HF-089's fallback chain
4. Verify SCI execute works for VL Admin importing into Meridian

### Standing Rule Alignment
Standing Rule 13: `profiles.id ≠ auth.uid()`. Use `auth_user_id`. This HF enforces that rule at the database level.

---

## ARCHITECTURE DECISION GATE

```
DECISION: How should created_by / uploaded_by / approved_by columns work?

Option A: Keep FK to profiles(id), fix the query to find platform profile
  - Scale test: Fails — every write requires a profile lookup query
  - Audit integrity: WEAK — profile IDs can be deleted, recreated, duplicated
  - Complexity: Adds query on every insert
  REJECTED: Profile-dependent attribution is fragile and adds unnecessary queries

Option B: Change FK from profiles(id) to auth.users(id)
  - Scale test: Works
  - Audit integrity: STRONG — auth.users is managed by Supabase
  - Complexity: FK to auth.users may complicate RLS policies and is unusual in Supabase
  REJECTED: FK to auth.users adds Supabase-specific coupling

Option C: Drop FK constraint, store auth.uid() as plain UUID
  - Scale test: Works — zero lookup queries
  - Audit integrity: STRONGEST — auth.uid() from verified JWT, immutable
  - Complexity: SIMPLEST — no FK management, no profile queries, no fallback chains
  - Security: JWT-verified identity, cannot be spoofed or borrowed
  CHOSEN: Maximum immutability, minimum complexity, strongest audit trail

CHOSEN: Option C
REJECTED: Options A and B
```

**Commit:** `git add -A && git commit -m "HF-090 Phase 0: Architecture decision — auth.uid() direct attribution" && git push origin dev`

---

## PHASE 1: SCHEMA MIGRATION — DROP FK CONSTRAINTS

### 1A: Identify All Affected Columns

Query the live database to find every FK referencing `profiles(id)`:

```sql
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'profiles'
  AND ccu.column_name = 'id';
```

**Expected results (from SCHEMA_REFERENCE.md):**

| Table | Column | Constraint |
|-------|--------|------------|
| rule_sets | created_by | FK → profiles(id) |
| rule_sets | approved_by | FK → profiles(id) |
| calculation_batches | created_by | FK → profiles(id) |
| import_batches | uploaded_by | FK → profiles(id) |
| reconciliation_sessions | created_by | FK → profiles(id) |
| disputes | submitted_by | FK → profiles(id) |
| disputes | resolved_by | FK → profiles(id) |
| entities | profile_id | FK → profiles(id) |

**IMPORTANT:** `entities.profile_id` is a DIFFERENT relationship — it links an entity to a user profile (e.g., "this sales rep entity IS this user"). Do NOT drop this FK. Only drop FKs on audit attribution columns (created_by, uploaded_by, approved_by, submitted_by, resolved_by).

### 1B: Execute Migration

Run in Supabase SQL Editor:

```sql
-- HF-090: Drop FK constraints on audit attribution columns
-- These columns will store auth.uid() directly (verified JWT identity)
-- entities.profile_id FK is PRESERVED (different relationship — entity-to-user link)

-- Step 1: Drop FK constraints (use actual constraint names from 1A query)
-- Pattern: ALTER TABLE {table} DROP CONSTRAINT {constraint_name};

-- rule_sets
ALTER TABLE rule_sets DROP CONSTRAINT IF EXISTS rule_sets_created_by_fkey;
ALTER TABLE rule_sets DROP CONSTRAINT IF EXISTS rule_sets_approved_by_fkey;

-- calculation_batches
ALTER TABLE calculation_batches DROP CONSTRAINT IF EXISTS calculation_batches_created_by_fkey;

-- import_batches
ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_uploaded_by_fkey;

-- reconciliation_sessions
ALTER TABLE reconciliation_sessions DROP CONSTRAINT IF EXISTS reconciliation_sessions_created_by_fkey;

-- disputes
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_submitted_by_fkey;
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_resolved_by_fkey;

-- Step 2: Add comments documenting the change
COMMENT ON COLUMN rule_sets.created_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
COMMENT ON COLUMN rule_sets.approved_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
COMMENT ON COLUMN calculation_batches.created_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
COMMENT ON COLUMN import_batches.uploaded_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
COMMENT ON COLUMN reconciliation_sessions.created_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
COMMENT ON COLUMN disputes.submitted_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
COMMENT ON COLUMN disputes.resolved_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
```

**NOTE:** The constraint names above follow Supabase's default naming convention (`{table}_{column}_fkey`). If Phase 1A returns different constraint names, use those instead.

### 1C: Verify Migration

```sql
-- Verify: zero FK constraints referencing profiles(id) on audit columns
SELECT tc.table_name, kcu.column_name, tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'profiles'
  AND ccu.column_name = 'id';
```

**Expected:** Only `entities.profile_id` should remain. All audit columns (created_by, uploaded_by, approved_by, submitted_by, resolved_by) should be gone from this list.

### Proof Gates — Phase 1
- PG-1: 1A query returns list of constraints (paste output)
- PG-2: Migration executes without error
- PG-3: 1C verification shows only `entities.profile_id` FK remains

**Commit:** `git add -A && git commit -m "HF-090 Phase 1: Drop FK constraints on audit attribution columns" && git push origin dev`

---

## PHASE 2: CODE CHANGES — auth.uid() EVERYWHERE

### 2A: Delete resolveProfileId

Find and delete the `resolveProfileId` function (added by HF-089 in `lib/auth/resolve-profile.ts` or similar). Delete the entire file if it contains only this function.

```bash
# Find the file
grep -rn "resolveProfileId" web/src/ --include="*.ts" --include="*.tsx"
```

Delete the function and its file. Remove all imports of `resolveProfileId` from every file that references it.

### 2B: Fix SCI Execute Routes

Find both SCI execute routes:

```bash
grep -rn "created_by\|uploaded_by\|resolveProfileId" web/src/app/api/ --include="*.ts" | head -30
```

For each route that currently calls `resolveProfileId` or does a profile lookup for `created_by`:

**Replace** the profile resolution with direct auth.uid() extraction from the session:

```typescript
// BEFORE (HF-089 pattern — DELETE THIS)
const profileId = await resolveProfileId(supabase, authUserId, tenantId);
// ... later ...
created_by: profileId,

// AFTER (HF-090 — direct auth attribution)
const { data: { user } } = await supabase.auth.getUser();
if (!user) throw new Error('Not authenticated');
// ... later ...
created_by: user.id,
```

**Apply to ALL routes that write created_by, uploaded_by, approved_by, submitted_by, or resolved_by:**

- `api/import/sci/execute/route.ts`
- `api/import/sci/execute-bulk/route.ts`
- `api/admin/tenants/create/route.ts` (if it writes created_by)
- Any route writing to `import_batches.uploaded_by`
- Any route writing to `calculation_batches.created_by`
- Any route writing to `reconciliation_sessions.created_by`
- Any route writing to `disputes.submitted_by` or `disputes.resolved_by`

### 2C: Search for Any Remaining Profile-Based Attribution

```bash
# Must return zero hits for profile-based attribution patterns
grep -rn "resolveProfileId\|resolve.*profile.*created_by\|profile.*created_by\|created_by.*profile" web/src/ --include="*.ts" --include="*.tsx"

# Verify no imports remain
grep -rn "resolve-profile\|resolveProfile" web/src/ --include="*.ts" --include="*.tsx"
```

### 2D: Update database.types.ts

If `database.types.ts` has type annotations referencing profiles for created_by columns, update them to reflect that these are now auth user IDs (plain UUIDs), not profile references.

### Proof Gates — Phase 2
- PG-4: `resolveProfileId` function deleted (grep returns zero)
- PG-5: All execute routes use `user.id` from auth session (paste evidence)
- PG-6: Zero remaining profile-based attribution patterns (grep returns zero)
- PG-7: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-090 Phase 2: Replace profile resolution with auth.uid() direct attribution" && git push origin dev`

---

## PHASE 3: UPDATE SCHEMA_REFERENCE.md

Update `SCHEMA_REFERENCE.md` to reflect the change:

For every affected column, change the type annotation from:
```
| created_by | uuid FK → profiles.id |
```
To:
```
| created_by | uuid (auth user ID — no FK) |
```

Apply to: `rule_sets.created_by`, `rule_sets.approved_by`, `calculation_batches.created_by`, `import_batches.uploaded_by`, `reconciliation_sessions.created_by`, `disputes.submitted_by`, `disputes.resolved_by`.

**Do NOT change** `entities.profile_id` — that FK is preserved.

### Proof Gates — Phase 3
- PG-8: SCHEMA_REFERENCE.md updated for all 7 columns
- PG-9: `entities.profile_id` still shows FK → profiles.id

**Commit:** `git add -A && git commit -m "HF-090 Phase 3: Update SCHEMA_REFERENCE.md — audit columns are auth user IDs" && git push origin dev`

---

## PHASE 4: BUILD + VERIFY + BROWSER TEST

### 4A: Build Verification

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 4B: Browser Test on localhost

1. Log in as VL Admin (platform@vialuce.com)
2. Navigate to Meridian Logistics Group tenant
3. Go to Import
4. Upload Meridian_Plan_Incentivos_2025.pptx
5. Confirm classification (Plan Rules, 95%)
6. Click "Import data"
7. **Must NOT return 500**

### 4C: Verify created_by Value

After successful import, query:

```sql
SELECT id, name, created_by
FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:** `created_by` contains the VL Admin's auth user ID (from `auth.users`), NOT a profile UUID.

Cross-check:
```sql
SELECT id, email
FROM auth.users
WHERE email = 'platform@vialuce.com';
```

The `created_by` value in rule_sets must match the `id` from auth.users.

### Proof Gates — Phase 4
- PG-10: `npm run build` exits 0
- PG-11: localhost:3000 responds
- PG-12: Plan import does NOT return 500 on localhost
- PG-13: `created_by` in rule_sets matches auth.users.id (paste both values)

**Commit:** `git add -A && git commit -m "HF-090 Phase 4: Build verification and localhost browser test" && git push origin dev`

---

## PHASE 5: PR CREATION

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-090: Audit-grade created_by — auth.uid() direct attribution" \
  --body "Replaces HF-089's profile resolution fallback chain with direct auth.uid() attribution.

Changes:
- Drop FK constraints on created_by/uploaded_by/approved_by/submitted_by/resolved_by (7 columns across 5 tables)
- Delete resolveProfileId function and all imports
- All audit attribution columns now store auth.uid() from verified JWT
- entities.profile_id FK preserved (different relationship)
- SCHEMA_REFERENCE.md updated

Root cause: SCI execute 500 because created_by FK required a profiles(id) value, but VL Admin has no tenant-scoped profile (Decision 90). Fix: remove the FK requirement entirely — auth.uid() is the correct, immutable, JWT-verified identity.

Closes CLT-157 F1/F3."
```

### Proof Gates — Phase 5
- PG-14: PR URL pasted

**Commit:** `git add -A && git commit -m "HF-090 Complete: Audit-grade created_by" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Drop FK constraints on 7 audit attribution columns across 5 tables
- Delete `resolveProfileId` function and all HF-089 fallback chain code
- Replace all profile resolution with `auth.uid()` from session
- Update SCHEMA_REFERENCE.md
- Verify SCI execute works for VL Admin on localhost

### OUT OF SCOPE — DO NOT TOUCH
- `entities.profile_id` FK (different relationship — entity-to-user link)
- Auth files (middleware.ts, auth-context.tsx, etc.)
- Calculation engine
- SCI analyze (classification) — already works
- UI components
- RLS policies (these already use `auth.uid()` for row-level checks)
- Any new database tables

### CRITICAL CONSTRAINTS
1. **entities.profile_id is NOT an audit column.** It links an entity to a user. Do NOT drop this FK.
2. **Do NOT create tenant-scoped profiles for VL Admin.** Decision 90 is locked.
3. **Do NOT add new profile resolution logic.** The entire resolveProfileId pattern is being deleted.
4. **Verify actual FK constraint names** in Phase 1A before dropping. Do not assume naming convention.
5. **auth.uid() comes from `supabase.auth.getUser()`**, not from headers or custom tokens.

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Adding another fallback step to resolveProfileId | DELETE the entire function — no fallback chain |
| AP-2 | Creating tenant-scoped profiles for VL Admin | Decision 90 is locked — zero tenant profiles for VL Admin |
| AP-13 | Assuming constraint names without checking | Run 1A query to get actual names |
| AP-35 | Schema assumption without verification | Verify live schema, not TypeScript types |
| NEW | Storing profile.id in audit columns | auth.uid() ONLY — profile IDs are application-layer constructs |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-090_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### Completion Report Structure
1. **Architecture Decision** — Option C chosen with rationale
2. **Commits** — all with hashes, one per phase
3. **Files deleted** — resolveProfileId and related
4. **Files modified** — every changed file
5. **Database changes** — FK constraints dropped (list constraint names)
6. **Proof gates** — 14 gates, each PASS/FAIL with pasted evidence
7. **Remaining work** — note that production verification (vialuce.ai) requires PR merge + Vercel deploy

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read and complied with?
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ FK constraints dropped on AUDIT columns only (not entities.profile_id)?
□ resolveProfileId fully deleted (grep returns zero)?
□ All created_by/uploaded_by writes use auth.uid()?
□ SCHEMA_REFERENCE.md updated for all 7 columns?
□ npm run build exits 0?
□ localhost:3000 responds?
□ Plan import does NOT 500 on localhost?
□ created_by value matches auth.users.id?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*HF-090: "The person who performed the action is the person who performed the action. Not a profile. Not a fallback. The actual, verified identity."*
