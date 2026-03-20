# HF-151: AUTH EVENT LOGGING — SURGICAL FIXES
## Priority: P0 — SOC 2 CC6 Compliance Closure
## Date: March 20, 2026
## Prerequisite: DIAG-011 completed (PR #280). Root causes confirmed.
## Scope: 4 surgical fixes at exact file:line locations. No architectural changes.

---

## CC_STANDING_ARCHITECTURE_RULES (v3.0)

Include the full CC_STANDING_ARCHITECTURE_RULES.md at the top of this prompt. All rules apply.

---

## COMPLIANCE VERIFICATION GATE (Standing Rule 39)

**This prompt touches: audit logging.**
- **SOC 2 CC6:** Complete audit trail for all authentication events.
- **Decision 143 (LOCKED):** All auth events logged with who/what/when/where/outcome.
- **DS-019 Section 8.1:** 10 event types. 5 critical types must work.

---

## CONTEXT — WHAT DIAG-011 PROVED

DIAG-011 (PR #280) examined every file in the auth event logging chain and identified 4 root causes with evidence. This HF applies the exact fix for each. No guesswork.

| # | Failure | Root Cause | File:Line | Certainty | Fix |
|---|---------|-----------|-----------|-----------|-----|
| F1 | `auth.login.success` never logged | `logAuthEventClient` not awaited — `router.push` cancels in-flight fetch | `auth-service.ts:46` | 95% | Add `await` before return |
| F2 | Patricia logout `tenant_id` = NULL | Explicit `actor_id` bypasses cookie resolution — `tenant_id` never set | `auth-service.ts:87-91` + `log-event/route.ts:43` | 100% | Pass `tenant_id` explicitly in logout payload |
| F3 | Login failure `reason` = NULL | Key mismatch: stored as `error`, queried as `reason` | `auth-service.ts:41` | 100% | Change key from `error` to `reason` |
| F4 | 3 duplicate MFA verify events | React re-render/remount fires verify multiple times, beyond 5-sec dedup | `mfa/verify/page.tsx:53` | 70% | Add ref-based dedup guard |

**F5 (POST → 307) resolves as a consequence of F1.** The 307 was the cancelled/interrupted fetch from the unawaited logAuthEventClient. Once awaited, the POST completes before navigation fires.

---

## PHASE 1: FIX F1 — AWAIT LOGIN SUCCESS EVENT

**File:** `web/src/lib/supabase/auth-service.ts`
**Line:** ~46 (the `logAuthEventClient('auth.login.success', ...)` call)

**Current code (from DIAG-011):**
```typescript
logAuthEventClient('auth.login.success', { email, userId: data.user?.id });
return data;
```

**Required change:**
```typescript
await logAuthEventClient('auth.login.success', { email, userId: data.user?.id });
return data;
```

**That's it.** One word: `await`. The fetch must complete before the function returns, because the caller (`auth-context.tsx:265`) immediately calls `router.push('/select-tenant')` which cancels any in-flight requests.

**Also apply the same fix to the login failure call (~line 41) if it is also not awaited:**
```typescript
await logAuthEventClient('auth.login.failure', { email, reason: error.message });
```

Note: this changes `error` to `reason` — that's Fix F3 applied simultaneously. See Phase 3.

### Verification

```bash
# Confirm await exists on both calls
grep -n "await logAuthEventClient" web/src/lib/supabase/auth-service.ts
# Expected: 2 lines — one for login.success, one for login.failure
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-151 Phase 1: Await logAuthEventClient on login success — prevents navigation from cancelling fetch" && git push origin dev
```

---

## PHASE 2: FIX F2 — PASS TENANT_ID ON LOGOUT

**File:** `web/src/lib/supabase/auth-service.ts`
**Lines:** ~87-91 (the logout flow)

**Current code (from DIAG-011):**
```typescript
const { data: { user: loggedUser } } = await supabase.auth.getUser();
const loggedUserId = loggedUser?.id;
const loggedEmail = loggedUser?.email;
// ... signOut ...
logAuthEventClient('auth.logout', { actor_id: loggedUserId, email: loggedEmail });
```

**Problem:** `tenant_id` is not captured before signOut and not passed to the logger. The API route skips cookie resolution when `actor_id` is provided (line 43: `if (!actorId)`), so `tenant_id` stays null.

**Required change:** Capture `tenant_id` from the user's profile BEFORE signOut. The tenant_id is available from the auth context or can be queried from the profiles table using the service already available.

Find where tenant context is accessible in the logout flow. It may be:
- In the auth context (`useAuth()` → `tenantId`)
- In a cookie (`vialuce-tenant-id` or similar)
- From a Supabase query on profiles

**The simplest approach:** If the logout function has access to the auth context (check how it's called from components), pass the tenantId from the context:

```typescript
// In the auth context or wherever signOut is called:
const tenantId = /* from auth context state */;

// Pass to logout function or directly to logger:
await logAuthEventClient('auth.logout', { 
  actor_id: loggedUserId, 
  email: loggedEmail,
  tenant_id: tenantId || null  // null for VL Admin, UUID for tenant users
});
```

**The API route also needs a fix.** At `log-event/route.ts` line ~43, the logic must NOT skip tenant_id resolution when actor_id is provided. The fix:

```typescript
// CURRENT (broken):
if (!actorId) {
  // resolve from cookies — sets actorId AND tenantId
}
// tenantId stays null when actorId was provided

// FIXED:
// Always check for explicit tenant_id from body first
const explicitTenantId = body.tenant_id || null;

if (!actorId) {
  // resolve actor from cookies
}

// Use explicit tenant_id if provided, otherwise resolve from cookies
if (!tenantId && !explicitTenantId) {
  // resolve tenant from cookies/profile
}
const finalTenantId = explicitTenantId ?? tenantId ?? null;
```

### Verification

```bash
# tenant_id passed in logout payload
grep -A 5 "auth.logout" web/src/lib/supabase/auth-service.ts | grep "tenant_id"

# API route accepts explicit tenant_id
grep -n "tenant_id\|tenantId" web/src/app/api/auth/log-event/route.ts
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-151 Phase 2: Pass tenant_id explicitly on logout — resolve before signOut destroys session" && git push origin dev
```

---

## PHASE 3: FIX F3 — KEY MISMATCH ON LOGIN FAILURE REASON

**File:** `web/src/lib/supabase/auth-service.ts`
**Line:** ~41

**Current code:**
```typescript
logAuthEventClient('auth.login.failure', { email, error: error.message });
```

**Required change:**
```typescript
await logAuthEventClient('auth.login.failure', { email, reason: error.message });
```

Two changes in one line:
1. `error` → `reason` (matches the query `payload->>'reason'`)
2. Add `await` (same fix as Phase 1 — both log calls must be awaited)

**If Phase 1 already changed this line, verify the key is `reason` not `error`.**

### Verification

```bash
# Confirm key is 'reason' not 'error'
grep -n "login.failure" web/src/lib/supabase/auth-service.ts
# Expected: { email, reason: error.message }
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-151 Phase 3: Fix login failure reason key — 'reason' not 'error'" && git push origin dev
```

---

## PHASE 4: FIX F4 — MFA VERIFY EVENT DEDUPLICATION

**File:** `web/src/app/auth/mfa/verify/page.tsx`
**Line:** ~53

**Problem:** The 5-second dedup window in `logAuthEventClient` doesn't catch events that are 10+ seconds apart. The MFA verify page fires the event multiple times due to React re-render/remount cycles during the auth flow transition.

**Fix: Add a component-level ref guard** that tracks whether the MFA verify success has already been logged for this session:

```typescript
const hasLoggedVerify = useRef(false);

const handleVerify = async () => {
  if (loading) return;
  setLoading(true);
  
  try {
    // ... existing verify logic ...
    
    // Log ONCE per component lifecycle
    if (!hasLoggedVerify.current) {
      hasLoggedVerify.current = true;
      await logAuthEventClient('auth.mfa.verify.success', { method: 'totp' });
    }
    
    // Redirect...
  } catch (err) {
    // ... error handling ...
    setLoading(false);
    // Do NOT reset hasLoggedVerify — if verify succeeded server-side but redirect failed,
    // we don't want to log again on retry
  }
};
```

**The ref persists across re-renders but resets on full page remount.** If the page remounts (unmount → mount), the ref resets to false. To handle that case, also check sessionStorage:

```typescript
const hasLoggedVerify = useRef(false);

useEffect(() => {
  // Check if we already logged MFA for this login session
  if (sessionStorage.getItem('mfa_verify_logged') === 'true') {
    hasLoggedVerify.current = true;
  }
}, []);

// In handleVerify, after logging:
if (!hasLoggedVerify.current) {
  hasLoggedVerify.current = true;
  sessionStorage.setItem('mfa_verify_logged', 'true');
  await logAuthEventClient('auth.mfa.verify.success', { method: 'totp' });
}
```

**Clear the sessionStorage flag on logout** so the next login gets a fresh log:

```typescript
// In the logout flow (auth-service.ts), before signOut:
sessionStorage.removeItem('mfa_verify_logged');
```

### Verification

```bash
# Ref guard exists
grep -n "hasLoggedVerify\|mfa_verify_logged" web/src/app/auth/mfa/verify/page.tsx

# SessionStorage cleared on logout
grep -n "mfa_verify_logged" web/src/lib/supabase/auth-service.ts
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-151 Phase 4: MFA verify event dedup — ref guard + sessionStorage prevents duplicate events" && git push origin dev
```

---

## PHASE 5: BUILD + LOCALHOST VERIFICATION

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0

npm run dev &
sleep 5
```

**Manual test on localhost:3000:**

1. Enter wrong password for VL Admin → should log `auth.login.failure` with reason
2. Enter correct password → should log `auth.login.success` with email
3. Complete MFA → should log ONE `auth.mfa.verify.success`
4. Log out → should log `auth.logout` with actor_id + email + tenant_id (NULL for VL Admin)
5. Log in as Patricia → correct password → MFA → log out
6. Patricia's logout should have `tenant_id = BCL UUID`

**Query after all 6 actions:**

```sql
SELECT tenant_id, event_type, actor_id,
       payload->>'email' as email,
       payload->>'reason' as reason,
       created_at
FROM platform_events
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

**Expected rows (in reverse chronological order):**

| event_type | actor_id | email | reason | tenant_id |
|-----------|----------|-------|--------|-----------|
| auth.logout | Patricia UUID | admin@bancocumbre.ec | null | BCL UUID |
| auth.mfa.verify.success | Patricia UUID | admin@bancocumbre.ec | null | BCL UUID |
| auth.login.success | Patricia UUID | admin@bancocumbre.ec | null | null or BCL UUID |
| auth.logout | VL Admin UUID | platform@vialuce.com | null | NULL |
| auth.mfa.verify.success | VL Admin UUID | platform@vialuce.com | null | NULL |
| auth.login.success | VL Admin UUID | platform@vialuce.com | null | NULL |
| auth.login.failure | null | platform@vialuce.com | (error message) | NULL |

**Critical checks:**
- `auth.login.success` rows EXIST for both users ← F1 resolved
- Patricia logout has `tenant_id = BCL UUID` ← F2 resolved
- Login failure has `reason` populated ← F3 resolved
- ONE `auth.mfa.verify.success` per user (not 3) ← F4 resolved

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-151 Phase 5: Localhost verification — all auth events logged correctly" && git push origin dev
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-151_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | `await` on login success log | `grep -n "await logAuthEventClient.*login.success" auth-service.ts` returns line |
| PG-2 | `await` on login failure log | `grep -n "await logAuthEventClient.*login.failure" auth-service.ts` returns line |
| PG-3 | `reason` key (not `error`) on login failure | `grep "reason:" auth-service.ts` in login.failure call |
| PG-4 | tenant_id passed in logout payload | `grep "tenant_id" auth-service.ts` near logout call |
| PG-5 | API route accepts explicit tenant_id from body | `grep "tenant_id" log-event/route.ts` shows body extraction |
| PG-6 | MFA verify ref guard exists | `grep "hasLoggedVerify" mfa/verify/page.tsx` returns line |
| PG-7 | sessionStorage flag set on MFA verify | `grep "mfa_verify_logged" mfa/verify/page.tsx` returns line |
| PG-8 | sessionStorage flag cleared on logout | `grep "mfa_verify_logged" auth-service.ts` returns line |
| PG-9 | `auth.login.success` in platform_events (localhost) | SQL query shows row with email + actor_id |
| PG-10 | Patricia logout tenant_id = BCL UUID (localhost) | SQL query shows `b1c2d3e4-aaaa-bbbb-cccc-111111111111` |
| PG-11 | Login failure reason populated (localhost) | SQL query shows non-null reason |
| PG-12 | ONE MFA verify event per user (localhost) | SQL query shows 1 row per user, not 3 |
| PG-13 | npm run build exits 0 | Clean build |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Fire-and-forget fetch before navigation | EVERY logAuthEventClient call must be `await`ed when followed by navigation |
| AP-2 | Skipping cookie resolution when body has partial data | API route must resolve tenant_id even when actor_id is provided |
| AP-3 | Key mismatches between write and read | Use consistent key names — `reason` for failure reason, `email` for email |
| AP-4 | Changing any auth flow behavior | This HF changes LOGGING ONLY. Do not modify login, MFA, signOut behavior. |
| AP-5 | Adding complexity beyond the 4 identified fixes | Scope is surgical. 4 fixes at 4 locations. Nothing else. |

---

## POST-MERGE PRODUCTION VERIFICATION (Andrew)

After merge and deploy:

1. Fresh incognito → vialuce.ai
2. Enter wrong password for VL Admin (generates login.failure)
3. Enter correct password → MFA → /select-tenant
4. Log out
5. Log in as Patricia → MFA → /stream
6. Log out
7. Run:

```sql
SELECT tenant_id, event_type, actor_id,
       payload->>'email' as email,
       payload->>'reason' as reason,
       created_at
FROM platform_events
WHERE created_at > NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC;
```

**All 4 failures must be resolved:**
- `auth.login.success` rows exist ← F1
- Patricia logout `tenant_id` = BCL UUID ← F2
- Login failure `reason` populated ← F3
- One MFA verify event per user ← F4

---

## PR

```bash
gh pr create --base main --head dev \
  --title "HF-151: Auth Event Logging — 4 Surgical Fixes from DIAG-011" \
  --body "## 4 fixes at exact locations identified by DIAG-011

### F1: auth.login.success missing (P0)
- Root cause: logAuthEventClient not awaited — router.push cancels fetch
- Fix: await logAuthEventClient before return (auth-service.ts:46)

### F2: Patricia logout tenant_id NULL
- Root cause: explicit actor_id bypasses cookie resolution in API route
- Fix: capture tenant_id before signOut, pass explicitly + API route accepts it

### F3: login.failure reason NULL
- Root cause: key mismatch — stored as 'error', queried as 'reason'
- Fix: change key to 'reason' (auth-service.ts:41)

### F4: 3 duplicate MFA verify events
- Root cause: React re-render/remount fires event multiple times
- Fix: useRef guard + sessionStorage flag, cleared on logout

## DIAG-011 evidence: see DIAG-011_COMPLETION_REPORT.md
## Proof Gates: see HF-151_COMPLETION_REPORT.md"
```

---

*ViaLuce.ai — The Way of Light*
*HF-151: "Diagnose with evidence. Fix with certainty."*
