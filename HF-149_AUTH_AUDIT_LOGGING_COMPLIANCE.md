# HF-149: AUTH AUDIT LOGGING — COMPLIANCE FIX
## Priority: P0 — SOC 2 CC6 Non-Compliance
## Date: March 19, 2026
## Prerequisite: None
## Blocks: All compliance claims. Every login, logout, MFA event since OB-178 is unrecorded.

---

## CC_STANDING_ARCHITECTURE_RULES (v3.0)

Include the full CC_STANDING_ARCHITECTURE_RULES.md at the top of this prompt. All rules apply. Section F checklist mandatory before completion report.

---

## COMPLIANCE VERIFICATION GATE (Standing Rule 39)

**This prompt touches: auth, session, audit logging, data access (RLS).**

Compliance standards governing this work:
- **SOC 2 CC6:** "The entity implements logical access security measures to protect against unauthorized access." Audit logging of all authentication events is a CC6 control.
- **DS-019 Section 8.1:** 10 event types must be logged to platform_events. Zero are being logged.
- **Decision 143 (LOCKED):** "All auth events logged to platform_events via service role client. Login, logout, MFA, session refresh, permission denied, role change. Provider-agnostic audit trail."
- **OWASP Session Management:** Requires logging of session lifecycle events.
- **NIST SP 800-63B:** Authentication events must be recorded for incident response.

**Current state: ZERO rows in platform_events. Non-compliant since OB-178 deployed.**

---

## CONTEXT — WHY THIS IS P0

The platform admin (platform@vialuce.com) has cross-tenant access to ALL financial data for ALL tenants. SOC 2 auditors will ask: "Show me every time the super-admin logged in." The answer today is: "We can't."

The root cause is a schema constraint: `platform_events.tenant_id` is `NOT NULL`, but platform-scope auth events (VL Admin login, MFA enrollment, session refresh) have no tenant context. Every INSERT attempt silently fails in the try/catch wrapper.

This is not a code bug — it is a schema design that conflicts with the compliance requirement established by Decision 143 and DS-019 Section 8.

---

## SQL VERIFICATION GATE (Standing Rule — FP-49 Prevention)

Before writing ANY SQL in this prompt, verify the live schema:

```bash
echo "=== PLATFORM_EVENTS SCHEMA ==="
# Run against Supabase SQL Editor:
# SELECT column_name, data_type, is_nullable, column_default
# FROM information_schema.columns
# WHERE table_name = 'platform_events'
# ORDER BY ordinal_position;
```

**Expected (from SCHEMA_REFERENCE_LIVE.md, verified March 19, 2026):**

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO | — |
| event_type | text | NO | — |
| actor_id | uuid | YES | — |
| entity_id | uuid | YES | — |
| payload | jsonb | YES | — |
| processed_by | jsonb | YES | — |
| created_at | timestamptz | NO | now() |

**The problem:** `tenant_id` is `NOT NULL`. Auth events for VL Admin (tenant_id IS NULL) cannot be inserted.

---

## PHASE 0: DIAGNOSTIC — CURRENT STATE

Run every command. Paste ALL output. Do not skip.

```bash
echo "============================================"
echo "HF-149 PHASE 0: AUTH AUDIT LOGGING DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: CURRENT PLATFORM_EVENTS RLS POLICIES ==="
# Run in Supabase SQL Editor:
# SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
# FROM pg_policies
# WHERE tablename = 'platform_events';

echo ""
echo "=== 0B: ALL logAuthEvent CALL SITES ==="
grep -rn "logAuthEvent\|log_auth_event\|platform_events" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 0C: THE LOGGING FUNCTION IMPLEMENTATION ==="
grep -rn "logAuthEvent\|async function.*auth.*event\|async function.*log.*auth" web/src/lib/ --include="*.ts" -l | head -5
echo "--- Full implementation ---"
find web/src/lib -name "*.ts" | xargs grep -l "logAuthEvent\|platform_events" 2>/dev/null | while read f; do echo "=== $f ==="; cat "$f"; done

echo ""
echo "=== 0D: SERVICE ROLE CLIENT USAGE ==="
grep -rn "service.*role\|serviceRole\|SUPABASE_SERVICE_ROLE" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0E: AUTH CALLBACK / LOGIN FLOW ==="
grep -rn "logAuthEvent\|platform_events" web/src/app/auth/ --include="*.ts" --include="*.tsx" | head -15
grep -rn "logAuthEvent\|platform_events" web/src/app/login/ --include="*.ts" --include="*.tsx" | head -15

echo ""
echo "=== 0F: MIDDLEWARE AUTH LOGGING ==="
grep -n "logAuthEvent\|platform_events\|audit\|log.*auth" web/src/middleware.ts | head -15

echo ""
echo "=== 0G: MFA FLOW LOGGING ==="
grep -rn "logAuthEvent\|platform_events" web/src/app/auth/mfa/ --include="*.ts" --include="*.tsx" | head -15
```

**Do NOT proceed to Phase 1 until Phase 0 output is committed.**

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
# No code changes — just diagnostic output in completion report
```

---

## PHASE 1: SCHEMA MIGRATION — MAKE tenant_id NULLABLE

**The fix:** `tenant_id` must be nullable on `platform_events` to allow platform-scope events.

Create migration file:

```sql
-- HF-149: Make tenant_id nullable on platform_events
-- Rationale: SOC 2 CC6 requires auth event logging. 
-- VL Admin (platform role, tenant_id IS NULL) auth events 
-- cannot be inserted when tenant_id is NOT NULL.
-- Decision 143 requires all auth events logged.
-- DS-019 Section 8.1 specifies 10 event types.
-- Current state: ZERO rows — every insert silently fails.

ALTER TABLE platform_events ALTER COLUMN tenant_id DROP NOT NULL;

-- Add comment for future developers
COMMENT ON COLUMN platform_events.tenant_id IS 
  'NULL for platform-scope events (auth, system). UUID for tenant-scoped events (calculation, import, lifecycle).';
```

**Execute this migration in Supabase SQL Editor. Then verify:**

```sql
-- Verify the change
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'platform_events' AND column_name = 'tenant_id';
-- Expected: is_nullable = 'YES'
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-149 Phase 1: Make platform_events.tenant_id nullable for auth event logging" && git push origin dev
```

---

## PHASE 2: RLS POLICY UPDATE

The current RLS policies on `platform_events` must allow:
1. **Service role INSERT** — auth logging uses the service role client, which bypasses RLS. But verify this is actually the case.
2. **Platform role SELECT all events** — VL Admin must see all auth events across all tenants (including tenant_id IS NULL).
3. **Tenant admin SELECT own tenant events** — Patricia sees only BCL events.
4. **No user-role INSERT** — only the service role client writes auth events. Users cannot fabricate audit entries.

**First, check what policies exist (from Phase 0 output). Then update as needed.**

The service role client bypasses RLS entirely, so the INSERT path should work without policy changes. The critical update is the SELECT policy for the platform role:

```sql
-- Drop existing SELECT policy if it requires tenant_id match
-- (check Phase 0 output for exact policy name)

-- Platform role: read ALL events (including NULL tenant_id)
CREATE POLICY "platform_events_select_platform" ON platform_events
  FOR SELECT
  TO authenticated
  USING (
    -- Platform role sees everything
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.auth_user_id = auth.uid() 
      AND profiles.role = 'platform'
    )
    OR
    -- Tenant users see their own tenant's events
    (
      tenant_id IS NOT NULL 
      AND tenant_id IN (
        SELECT profiles.tenant_id FROM profiles 
        WHERE profiles.auth_user_id = auth.uid()
      )
    )
  );
```

**Execute in Supabase SQL Editor. Verify:**

```sql
-- Check the policy exists
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'platform_events';
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-149 Phase 2: RLS policy update — platform reads all events, tenant reads own" && git push origin dev
```

---

## PHASE 3: VERIFY AND FIX LOGGING CODE

The logging function must:
1. Use the **service role client** (bypasses RLS — system-level concern, not user-scoped)
2. Pass `tenant_id: null` for platform-scope events (VL Admin login, system events)
3. Pass `tenant_id: <uuid>` for tenant-scoped events (Patricia login within BCL context)
4. Include all fields from DS-019 Section 8.1: actor_id, event_type, payload (with IP, user_agent, email, outcome)

**From Phase 0 output, find the logAuthEvent function and verify it meets these requirements.**

If the function passes a hardcoded or derived tenant_id that is never null, fix it:

```typescript
// The tenant_id should come from the user's profile.
// VL Admin (role='platform') has tenant_id=NULL in profiles.
// Patricia (role='admin') has tenant_id=BCL UUID.
// The logging function must respect this — NOT default to a placeholder.
```

**DS-019 Section 8.1 — Required event types (10 total):**

| Event Type | Trigger |
|-----------|---------|
| auth.login.success | Successful login |
| auth.login.failure | Failed login attempt |
| auth.mfa.enroll | MFA factor enrolled |
| auth.mfa.challenge | MFA verification (success or failure) |
| auth.logout | User logout |
| auth.session.refresh | Token refresh |
| auth.session.expiry | Idle or absolute timeout |
| auth.permission.denied | Attempted action without capability |
| auth.role.change | Role assignment changed |
| auth.sensitive.action | Step-up auth triggered |

**Verify call sites exist for AT MINIMUM the first 5 (login success/failure, MFA enroll, MFA challenge, logout). The remaining 5 can be wired incrementally.**

```bash
echo "=== AUTH EVENT COVERAGE ==="
for event in "login.success" "login.failure" "mfa.enroll" "mfa.challenge" "logout"; do
  echo "--- auth.$event ---"
  grep -rn "auth\.$event\|auth\.${event}\|\"$event\"" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
done
```

**If any of the 5 critical events are missing, ADD the logAuthEvent call at the correct location:**
- `auth.login.success` — after successful `signInWithPassword()` in the login page
- `auth.login.failure` — in the catch block of `signInWithPassword()`
- `auth.mfa.enroll` — after successful `challengeAndVerify()` in the enrollment page
- `auth.mfa.challenge` — after successful `verify()` in the challenge page
- `auth.logout` — before or after `signOut()` call

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-149 Phase 3: Auth event logging — 5 critical events wired with service role client" && git push origin dev
```

---

## PHASE 4: LOCALHOST VERIFICATION

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0

npm run dev &
sleep 5

echo "=== BUILD CLEAN ==="
echo "Exit code: $?"
```

**Manual test on localhost:3000:**

1. Log in as VL Admin (platform@vialuce.com)
2. Log out
3. Log in as Patricia (admin@bancocumbre.ec) — complete MFA challenge
4. Log out

**Then verify events were logged:**

```sql
-- Run in Supabase SQL Editor AFTER the 4 actions above
SELECT id, tenant_id, event_type, actor_id, 
       payload->>'email' as email,
       created_at
FROM platform_events 
ORDER BY created_at DESC 
LIMIT 20;
```

**Expected:**
- At least 4 rows (2 logins + 2 logouts minimum)
- VL Admin events: `tenant_id IS NULL`
- Patricia events: `tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'`
- `actor_id` populated with the user's auth UUID
- `payload` contains email, IP, user_agent at minimum

**If zero rows: the logging code is not executing. Check browser console for errors and Vercel function logs.**

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-149 Phase 4: Localhost verification — auth events logged" && git push origin dev
```

---

## PHASE 5: COMPLIANCE VERIFICATION (Standing Rule 39)

```bash
echo "============================================"
echo "HF-149 PHASE 5: COMPLIANCE VERIFICATION"
echo "============================================"

echo ""
echo "=== SOC 2 CC6: Auth Event Audit Trail ==="
echo "Requirement: All authentication events logged with who/what/when/where/outcome"
echo "Evidence:"
# Paste the SQL query result from Phase 4 showing logged events

echo ""
echo "=== DS-019 Section 8.1: Event Coverage ==="
echo "Minimum 5 of 10 event types wired:"
for event in "login.success" "login.failure" "mfa.enroll" "mfa.challenge" "logout"; do
  echo "--- auth.$event ---"
  grep -rn "auth\.$event\|\"$event\"" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -3
done

echo ""
echo "=== Decision 143: Service Role Client ==="
grep -rn "service.*role\|serviceRole" web/src/ --include="*.ts" | grep -i "platform_events\|logAuth\|audit" | grep -v node_modules

echo ""
echo "=== Decision 143: Provider-Agnostic ==="
echo "Events logged via platform code, not Supabase Auth Hooks"
echo "If Supabase is replaced, logging persists in the codebase"

echo ""
echo "=== OWASP: Session Lifecycle Logging ==="
echo "Login, logout, MFA events captured: [PASS/FAIL based on Phase 4 results]"

echo ""
echo "=== NIST SP 800-63B: Authentication Records ==="
echo "Failed login attempts captured: [PASS/FAIL based on grep for login.failure]"

echo ""
echo "=== Korean Test ==="
echo "No language-specific strings in logging code:"
grep -rn "logAuthEvent\|platform_events" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -iE "español|english|login|contraseña" | head -5
echo "(should be empty)"

echo ""
echo "=== platform_events.tenant_id nullable ==="
# Paste the information_schema query from Phase 1 verification
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-149 Phase 5: Compliance verification — SOC 2 CC6, DS-019, OWASP, NIST" && git push origin dev
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-149_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Phase 0 diagnostic output committed | Full logging infrastructure inventory |
| PG-2 | platform_events.tenant_id is nullable | `SELECT is_nullable FROM information_schema.columns WHERE table_name='platform_events' AND column_name='tenant_id'` returns 'YES' |
| PG-3 | RLS policy allows platform role to read all events | Policy query shows platform reads all, tenant reads own |
| PG-4 | Service role client used for INSERT | grep confirms service role, not user client |
| PG-5 | VL Admin login event logged with tenant_id NULL | SQL query shows row with tenant_id IS NULL, event_type='auth.login.success' |
| PG-6 | Patricia login event logged with BCL tenant_id | SQL query shows row with tenant_id='b1c2d3e4-aaaa-bbbb-cccc-111111111111' |
| PG-7 | At least 5 event types wired | grep shows call sites for login.success, login.failure, mfa.enroll, mfa.challenge, logout |
| PG-8 | payload contains email + IP + user_agent | SQL query of payload JSONB shows all three fields |
| PG-9 | Compliance verification output complete | Phase 5 pasted in completion report |
| PG-10 | npm run build exits 0 | Clean build |
| PG-11 | Zero console errors related to platform_events | No 400/403/500 on platform_events requests |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Using a sentinel UUID instead of NULL | NULL is the correct representation for "no tenant" — it matches VL Admin's profile pattern |
| AP-2 | Adding INSERT RLS policy for user roles | Auth logging is a SYSTEM concern. Only the service role client writes. Users cannot create audit entries. |
| AP-3 | Logging only on the client side | Auth events must be logged server-side. Client-side logging can be spoofed. |
| AP-4 | Changing any auth flow behavior (login, MFA, session) | This HF adds LOGGING ONLY. Do not modify any authentication behavior. |
| AP-5 | Skipping the compliance verification phase | Phase 5 is mandatory — Standing Rule 39. |
| AP-6 | Using console.log instead of platform_events INSERT | Console logs are not an audit trail. SOC 2 requires persistent, queryable records. |

---

## POST-MERGE PRODUCTION VERIFICATION (Andrew)

After merge and deploy to production:

1. Open incognito/private browser
2. Log in as platform@vialuce.com (VL Admin) — complete MFA
3. Log out
4. Log in as admin@bancocumbre.ec (Patricia) — complete MFA
5. Log out
6. Run in Supabase SQL Editor:

```sql
SELECT id, tenant_id, event_type, 
       payload->>'email' as email,
       payload->>'ip' as ip,
       created_at
FROM platform_events 
WHERE event_type LIKE 'auth.%'
ORDER BY created_at DESC 
LIMIT 20;
```

**Expected:** At least 4 rows. VL Admin rows have `tenant_id IS NULL`. Patricia rows have `tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'`. All rows have actor_id, email in payload, and created_at.

**If zero rows in production: localhost PASS ≠ production PASS. Check Vercel function logs for platform_events errors.**

---

## PR

```bash
gh pr create --base main --head dev \
  --title "HF-149: Auth Audit Logging — SOC 2 CC6 Compliance Fix" \
  --body "## What This Fixes

### Problem
platform_events has ZERO rows. Every auth event since OB-178 is unrecorded.
Root cause: tenant_id NOT NULL constraint prevents platform-scope events.
SOC 2 CC6 requires audit trail for all authentication events.
Decision 143 commits to logging all auth events.

### Fix
1. Migration: tenant_id DROP NOT NULL on platform_events
2. RLS: Platform role reads all events, tenant users read own
3. Logging: 5 critical event types wired with service role client
4. Compliance verification: SOC 2 CC6 / DS-019 / OWASP / NIST

### Proof
- VL Admin login logged with tenant_id NULL
- Patricia login logged with BCL tenant_id
- payload contains email + IP + user_agent
- Service role client (not user client) for all INSERTs

## Proof Gates: see HF-149_COMPLETION_REPORT.md"
```

---

*ViaLuce.ai — The Way of Light*
*HF-149: "If the audit trail doesn't exist, compliance doesn't exist."*
