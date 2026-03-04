# HF-085: FIX created_by FK MISMATCH — AUTH USER ID ≠ PROFILE ID
## "Key (created_by)=(5fb5f934...) is not present in table profiles"

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute all phases. Commit after each. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `web/src/app/api/import/sci/execute/route.ts` — the route that fails
3. `SCHEMA_REFERENCE.md` — check FK constraints on created_by columns

---

## CONTEXT

HF-084 fixed the `"sci-execute"` string → now uses `authUser.id` from Supabase auth session. But `authUser.id` (from `auth.users`) doesn't match `profiles.id`. The profiles table uses seed-format UUIDs (`02000000-0001-...`) while auth.users has its own UUIDs (`5fb5f934-...`). The FK constraint `rule_sets.created_by → profiles.id` rejects the auth UUID.

**Evidence:**
```
Error code: 23503 (foreign key violation)
Key (created_by)=(5fb5f934-2fbd-499f-a2b8-7cd15ac6a1c3) is not present in table "profiles"

Actual profiles for this tenant:
02000000-0001-0000-0000-000000000001  admin@opticaluminar.mx     Laura Mendez
02000000-0001-0000-0000-000000000002  gerente@opticaluminar.mx   Roberto Castillo
02000000-0001-0000-0000-000000000003  vendedor@opticaluminar.mx  Sofia Navarro
```

**This is a P0 blocker.** No plan can be saved until created_by resolves to a valid profile ID.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Commit this prompt to git as first action.**
4. **Git from repo root (spm-platform), NOT web/.**

---

# PHASE 0: UNDERSTAND THE PATTERN

### 0A: How do OTHER routes resolve the profile ID?

The platform has many routes that write to tables with `created_by` FK constraints. They must solve this same problem. Find the pattern:

```bash
echo "=== HOW DO OTHER ROUTES GET PROFILE ID? ==="
grep -rn "profile.*id\|created_by\|profileId\|profile_id" \
  web/src/app/api/calculation/run/route.ts \
  web/src/app/api/import/commit/route.ts \
  web/src/app/api/intelligence/wire/route.ts \
  2>/dev/null | head -20

echo ""
echo "=== IS THERE A getProfile OR resolveProfile HELPER? ==="
grep -rn "getProfile\|resolveProfile\|profileFromAuth\|findProfile" \
  web/src/lib/ web/src/utils/ --include="*.ts" | head -10

echo ""
echo "=== HOW DOES THE AUTH → PROFILE LOOKUP WORK? ==="
grep -rn "auth.*email\|user.*email\|profiles.*email\|from.*profiles" \
  web/src/app/api/ --include="*.ts" | grep -v node_modules | head -15

echo ""
echo "=== PROFILE TABLE STRUCTURE ==="
grep -rn "profiles" web/src/lib/supabase/ --include="*.ts" | head -10

echo ""
echo "=== WHAT FK CONSTRAINTS REFERENCE profiles? ==="
echo "Check which tables have created_by → profiles.id"
grep -rn "created_by" web/supabase/migrations/ --include="*.sql" | head -10
```

### 0B: The SCI execute route — where does it set created_by?

```bash
echo "=== HF-084's FIX — WHERE IS authUser.id USED? ==="
grep -n "authUser\|userId\|created_by\|createdBy" \
  web/src/app/api/import/sci/execute/route.ts | head -20

echo ""
echo "=== THE INSERT THAT FAILS ==="
grep -B 5 -A 10 "rule_sets\|\.insert\|\.upsert" \
  web/src/app/api/import/sci/execute/route.ts | head -40
```

**Commit:** `HF-085 Phase 0: Diagnostic — auth.users.id vs profiles.id mismatch mapped`

---

# PHASE 1: FIX — RESOLVE PROFILE ID FROM AUTH SESSION

### 1A: Add profile lookup after auth

In the SCI execute route, after getting `authUser` from the session, look up the matching profile:

```typescript
// AFTER getting authUser from session:
const { data: profile } = await supabase
  .from('profiles')
  .select('id')
  .eq('email', authUser.email)
  .eq('tenant_id', tenantId)
  .single();

const createdBy = profile?.id ?? authUser.id; // fallback to auth ID if no profile found
```

Then use `createdBy` (not `authUser.id`) everywhere `created_by` is set.

### 1B: Apply the same fix to ALL places in the execute route

HF-084 threaded `userId` through `executeContentUnit → executePlanPipeline → created_by`. Update ALL of these to use the resolved profile ID instead of the auth user ID.

```bash
echo "=== EVERY created_by IN EXECUTE ROUTE ==="
grep -n "created_by\|userId\|authUser.id" \
  web/src/app/api/import/sci/execute/route.ts
```

Replace every instance.

### 1C: Check the SCI analyze route too

```bash
echo "=== DOES ANALYZE ALSO WRITE created_by? ==="
grep -n "created_by\|userId\|authUser" \
  web/src/app/api/import/sci/analyze/route.ts | head -10
```

If analyze writes to import_batches with created_by, apply the same fix.

### 1D: Check ALL API routes that write created_by

This mismatch could affect any route, not just SCI. Audit:

```bash
echo "=== ALL ROUTES THAT SET created_by ==="
grep -rn "created_by" web/src/app/api/ --include="*.ts" | grep -v "node_modules\|.next" | head -20
```

For each one, verify it uses a profile ID (not auth user ID). Fix any that use `authUser.id` or `session.user.id` directly.

**Proof gate PG-01:** All `created_by` assignments use resolved profile ID. Zero instances of raw `authUser.id` passed to FK-constrained columns.

**Commit:** `HF-085 Phase 1: Resolve profile ID from auth session for all created_by`

---

# PHASE 2: BUILD + DEPLOY TO PRODUCTION

### 2A: Build

```bash
cd web && rm -rf .next && npm run build
```

### 2B: Push + merge

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "HF-085: Fix created_by FK — resolve profile ID from auth email, not raw auth.users.id"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-085: Fix plan import — created_by FK mismatch (auth ID ≠ profile ID)" \
  --body "## P0 Fix

Plan save fails with FK violation:
\`\`\`
Key (created_by)=(5fb5f934...) is not present in table profiles
\`\`\`

auth.users.id and profiles.id are different UUIDs (seed profiles use format 02000000-...).
Fix: look up profile by email+tenant after auth, use profile.id for created_by.

Applied to: SCI execute, SCI analyze, and all other routes writing created_by.

**Must deploy to production — blocks all plan imports on vialuce.ai.**"

gh pr merge --squash
```

### 2C: Wait for Vercel deploy (~2 min)

**Proof gate PG-02:** Build clean. PR merged to main. Vercel deploying.

**Commit:** `HF-085 Phase 2: Deployed to production`

---

# PHASE 3: COMPLETION REPORT

```markdown
# HF-085 COMPLETION REPORT
## Fix created_by FK Mismatch

### Bug
`rule_sets.created_by` FK violation — auth.users.id (5fb5f934...) not in profiles table.
Profiles use seed UUIDs (02000000-...), auth.users has different UUIDs.

### Root Cause
HF-084 replaced "sci-execute" with authUser.id. But authUser.id comes from auth.users,
and the FK constraint references profiles.id. These are different UUIDs for seed accounts.

### Fix
After auth, look up profile by email + tenant_id. Use profile.id for created_by.
Applied to [list all routes fixed].

### Files Changed
- [list]

### Deployed
PR #[X] merged to main.
```

**Commit:** `HF-085 Phase 3: Completion report`

---

## ANTI-PATTERNS

| Don't | Do |
|-------|-----|
| Change the profile IDs to match auth IDs | That's a migration affecting all tenants. Fix the lookup instead. |
| Only fix the execute route | Audit ALL routes that write created_by |
| Use a hardcoded fallback UUID | Look up by email + tenant_id — it's deterministic and auditable |
| Skip the merge to main | Andrew is testing NOW on production. Must deploy. |

---

## LONGER-TERM NOTE

The root cause is that profiles.id ≠ auth.users.id for seed accounts. The standard Supabase pattern is `profiles.id = auth.users.id` (set via trigger on auth.users insert). The seed data script created profiles with custom UUIDs. Eventually, aligning these would eliminate this class of bug. But that's a migration — not for this HF.
