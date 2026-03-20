# HF-150: AUTH LOGGING COMPLETENESS + SESSION EXPIRY ENFORCEMENT
## Priority: P0 — SOC 2 CC6 Non-Compliance (Multiple Gaps)
## Date: March 20, 2026
## Prerequisite: HF-149 merged (PR #278). Migration executed.
## Blocks: Every compliance claim about audit trail completeness and session enforcement.

---

## CC_STANDING_ARCHITECTURE_RULES (v3.0)

Include the full CC_STANDING_ARCHITECTURE_RULES.md at the top of this prompt. All rules apply. Section F checklist mandatory before completion report.

---

## COMPLIANCE VERIFICATION GATE (Standing Rule 39)

**This prompt touches: auth, session, audit logging.**

Compliance standards governing this work:
- **SOC 2 CC6:** Audit trail for ALL authentication events. Session enforcement must prevent unauthorized access.
- **DS-019 Section 4.5:** Session expiry must redirect to /login. Banner is a courtesy; enforcement is mandatory.
- **DS-019 Section 8.1:** 10 event types must be logged. Currently only 2 types are appearing (mfa.verify.success, logout).
- **Decision 143 (LOCKED):** All auth events logged with who/what/when/where/outcome.
- **Decision 139 (LOCKED):** Idle timeout 30 min, absolute timeout 8 hours, single session per user.
- **OWASP Session Management:** Session expiry must invalidate the view, not just notify.

---

## CONTEXT — 11 FINDINGS FROM PRODUCTION TESTING (March 20, 2026)

HF-149 (PR #278) enabled auth event logging. Production testing revealed 7 events logged but with significant gaps. These cluster into THREE root causes that this HF addresses comprehensively.

### Finding Inventory

| # | Finding | Root Cause | Severity |
|---|---------|-----------|----------|
| F01 | No `auth.login.success` event logged | B: Login event not wired | P0 |
| F02 | No `auth.login.failure` event logged | B: Failure event not wired | P1 |
| F03 | Logout events have `actor_id = NULL` | A: Session destroyed before log | P0 |
| F04 | Patricia logout has `tenant_id = NULL` | A: Session destroyed before log | P1 |
| F05 | Duplicate MFA verify events (3 rows for 1 verify) | C: Component re-render fires event multiple times | P2 |
| F06 | Email missing from ALL payloads | A+B: Not passed to log function | P1 |
| F07 | Session expiry shows banner but data stays visible | D: Client monitor warns but doesn't redirect | P0 |
| F08 | Stale session bypass in fresh incognito after 7+ hours | D: Cookie/session not properly invalidated | P0 |
| F09 | MFA verify button allows double-submit | C: No loading state on verify button | P1 |
| F10 | GET requests to `/api/auth/log-event` → 307 | B: Redirect hits log endpoint as GET | P1 |
| F11 | No `auth.session.expiry` event logged | B: Expiry event not wired | P1 |

### Root Causes

| ID | Root Cause | Findings | Fix |
|----|-----------|----------|-----|
| A | **Logout logging fires AFTER session destruction** — signOut() destroys cookies, then logAuthEventClient calls API which can't resolve user from cookies | F03, F04, F06 (partial) | Capture actor_id, email, tenant_id BEFORE signOut, pass explicitly |
| B | **Login and failure events not wired or not reaching API** — logAuthEventClient calls missing or data not passed | F01, F02, F06 (partial), F10, F11 | Wire all 5 critical events with explicit data |
| C | **MFA verify page re-renders trigger duplicate events and lacks UX guards** | F05, F09 | Add loading state, deduplicate event logging |
| D | **Session expiry is advisory, not enforced client-side** — banner shown but page not cleared, redirect not forced | F07, F08 | Session monitor must redirect AND clear page on expiry |

---

## SQL VERIFICATION GATE (FP-49 Prevention)

Before writing ANY SQL, verify:

```bash
echo "=== PLATFORM_EVENTS SCHEMA ==="
grep -A 15 "### platform_events" /path/to/SCHEMA_REFERENCE_LIVE.md
# OR query live:
# SELECT column_name, data_type, is_nullable FROM information_schema.columns
# WHERE table_name = 'platform_events' ORDER BY ordinal_position;
```

**Known state (verified today):** tenant_id is NOW nullable (HF-149 migration executed).

---

## PHASE 0: DIAGNOSTIC — MAP THE COMPLETE AUTH EVENT FLOW

Run every command. Paste ALL output. Do not skip.

```bash
echo "============================================"
echo "HF-150 PHASE 0: AUTH EVENT FLOW DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: COMPLETE logAuthEvent / logAuthEventClient IMPLEMENTATION ==="
find web/src -name "*.ts" -o -name "*.tsx" | xargs grep -l "logAuthEvent\|logAuthEventClient" 2>/dev/null | while read f; do echo ""; echo "=== $f ==="; cat "$f"; done

echo ""
echo "=== 0B: LOGIN PAGE — FULL SOURCE ==="
cat web/src/app/login/page.tsx

echo ""
echo "=== 0C: LOGOUT FLOW — WHERE signOut IS CALLED ==="
grep -rn "signOut\|sign_out\|sign-out" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 0D: MFA ENROLL PAGE — FULL SOURCE ==="
cat web/src/app/auth/mfa/enroll/page.tsx

echo ""
echo "=== 0E: MFA VERIFY PAGE — FULL SOURCE ==="
cat web/src/app/auth/mfa/verify/page.tsx

echo ""
echo "=== 0F: SESSION MONITOR — FULL SOURCE ==="
find web/src -name "*session*monitor*" -o -name "*session*expir*" -o -name "*SessionExpir*" | while read f; do echo ""; echo "=== $f ==="; cat "$f"; done

echo ""
echo "=== 0G: AUTH SERVICE — FULL SOURCE ==="
cat web/src/lib/supabase/auth-service.ts 2>/dev/null || echo "File not found"

echo ""
echo "=== 0H: LOG-EVENT API ROUTE — FULL SOURCE ==="
cat web/src/app/api/auth/log-event/route.ts

echo ""
echo "=== 0I: MIDDLEWARE — SESSION COOKIE CHECKS ==="
grep -n "vialuce-session\|session-start\|last-activity\|IDLE_TIMEOUT\|ABSOLUTE_TIMEOUT\|maxAge\|cookie" web/src/middleware.ts | head -30

echo ""
echo "=== 0J: AUTH CONTEXT — WHERE SESSION STATE IS MANAGED ==="
cat web/src/lib/auth/auth-context.tsx 2>/dev/null || find web/src -name "*auth*context*" | while read f; do echo "=== $f ==="; cat "$f"; done
```

**Commit Phase 0 output in completion report before proceeding.**

---

## PHASE 1: FIX LOGOUT LOGGING (Root Cause A — F03, F04, F06)

**The problem:** `signOut()` destroys the session. The subsequent `logAuthEventClient()` call hits `/api/auth/log-event`, which tries to resolve the user from cookies — but the cookies are gone. Result: `actor_id = NULL`, `tenant_id = NULL`, `email = NULL`.

**The fix:** Capture user data BEFORE calling signOut. Pass it explicitly to the logging function.

Find every location where signOut is called. The pattern must be:

```typescript
// BEFORE (broken):
await supabase.auth.signOut({ scope: 'global' });
await logAuthEventClient('auth.logout'); // cookies gone — can't resolve user

// AFTER (correct):
// 1. Capture user data while session still exists
const { data: { user } } = await supabase.auth.getUser();
const email = user?.email;
const userId = user?.id;

// 2. Get tenant_id from profile or context (while session valid)
// Use whatever auth context or profile data is available in this component

// 3. NOW destroy the session
await supabase.auth.signOut({ scope: 'global' });

// 4. Log with explicit data (no cookie resolution needed)
await logAuthEventClient('auth.logout', {
  actor_id: userId,
  email: email,
  tenant_id: tenantId || null  // null for VL Admin
});
```

**The `logAuthEventClient` function must accept an optional explicit data parameter** that bypasses the cookie-based resolution in the API route. The API route (`/api/auth/log-event`) must accept these fields in the request body and use them when provided, falling back to cookie resolution when not.

**Update the API route:**

```typescript
// /api/auth/log-event/route.ts
// Accept optional explicit fields in request body:
// { event_type, actor_id?, email?, tenant_id?, metadata? }
// If actor_id is provided in body, use it (logout case).
// If not, resolve from cookies (login/MFA case).
```

### Verification

```bash
# Every signOut call captures user data BEFORE signOut
grep -B 10 "signOut" web/src/ -rn --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

# logAuthEventClient accepts explicit data parameter
grep -A 5 "logAuthEventClient" web/src/lib/auth/auth-logger.ts

# API route accepts body fields
grep -n "actor_id\|email\|tenant_id" web/src/app/api/auth/log-event/route.ts
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-150 Phase 1: Fix logout logging — capture user data before signOut" && git push origin dev
```

---

## PHASE 2: WIRE LOGIN EVENTS (Root Cause B — F01, F02, F06, F10)

**The problem:** `auth.login.success` and `auth.login.failure` events are either not wired or the calls fail silently.

**Find the login flow** in the login page (Phase 0B output). After `signInWithPassword()`:

```typescript
// Login page — after signInWithPassword
try {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error) {
    // LOGIN FAILURE — log it
    await logAuthEventClient('auth.login.failure', {
      email: email,  // We have the email from the form
      metadata: { reason: error.message }
    });
    // Show error to user...
    return;
  }
  
  // LOGIN SUCCESS — log it
  await logAuthEventClient('auth.login.success', {
    actor_id: data.user?.id,
    email: data.user?.email || email
  });
  
  // Redirect to MFA or stream...
} catch (err) {
  // UNEXPECTED FAILURE — log it
  await logAuthEventClient('auth.login.failure', {
    email: email,
    metadata: { reason: 'unexpected_error', detail: String(err) }
  });
}
```

**Critical: The email field MUST be passed explicitly from the login form input value.** Do not rely on cookie resolution — at login time, the cookies are being created, not yet available for resolution.

**Also wire `auth.login.failure` for failed MFA attempts** in the MFA verify page:

```typescript
// MFA verify page — after failed verify
if (error) {
  await logAuthEventClient('auth.mfa.verify.failure', {
    metadata: { reason: error.message }
  });
}
```

**Fix the GET → 307 issue (F10):** The API route must explicitly reject GET requests:

```typescript
// /api/auth/log-event/route.ts
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
```

### Verification

```bash
# Login success event wired
grep -n "login.success" web/src/app/login/page.tsx

# Login failure event wired
grep -n "login.failure" web/src/app/login/page.tsx

# Email passed explicitly (not from cookies)
grep -B 3 "login.success\|login.failure" web/src/app/login/page.tsx | grep "email"

# GET handler returns 405
grep -n "GET\|405\|Method not allowed" web/src/app/api/auth/log-event/route.ts
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-150 Phase 2: Wire login success/failure events with explicit email" && git push origin dev
```

---

## PHASE 3: FIX MFA PAGE UX (Root Cause C — F05, F09)

**The problem:** The MFA verify button can be clicked multiple times, firing duplicate events and consuming challenges without clear feedback.

**Fix 1: Loading state on verify button**

```typescript
const [isVerifying, setIsVerifying] = useState(false);

const handleVerify = async () => {
  if (isVerifying) return; // Prevent double-submit
  setIsVerifying(true);
  
  try {
    // ... verify logic ...
    // Log event ONCE on success
    await logAuthEventClient('auth.mfa.verify.success', { method: 'totp' });
    // Redirect
  } catch (err) {
    // Log failure ONCE
    await logAuthEventClient('auth.mfa.verify.failure', { metadata: { reason: String(err) } });
    // Show error
  } finally {
    setIsVerifying(false);
  }
};

// Button:
<button onClick={handleVerify} disabled={isVerifying}>
  {isVerifying ? 'Verifying...' : 'Verify'}
</button>
```

**Fix 2: Deduplicate event logging**

Add a guard in `logAuthEventClient` to prevent the same event type from being logged more than once within 5 seconds:

```typescript
const recentEvents = new Map<string, number>(); // event_type → timestamp

export async function logAuthEventClient(eventType: string, data?: LogData) {
  const now = Date.now();
  const lastLogged = recentEvents.get(eventType) || 0;
  if (now - lastLogged < 5000) return; // Deduplicate within 5 seconds
  recentEvents.set(eventType, now);
  
  // ... existing POST to /api/auth/log-event ...
}
```

**Fix 3: Clear error/success feedback on MFA verify page**

After a failed verify attempt, show a clear error message ("Invalid code. Please try again with a new code."). After success, show "Verified" briefly before redirect.

### Verification

```bash
# Loading state on verify button
grep -n "isVerifying\|disabled\|Verifying" web/src/app/auth/mfa/verify/page.tsx

# Deduplicate guard in logger
grep -n "recentEvents\|deduplicate\|5000" web/src/lib/auth/auth-logger.ts

# Error feedback on MFA page
grep -n "error\|Error\|Invalid\|failed" web/src/app/auth/mfa/verify/page.tsx | head -10
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-150 Phase 3: MFA verify UX — loading state, deduplication, error feedback" && git push origin dev
```

---

## PHASE 4: SESSION EXPIRY ENFORCEMENT (Root Cause D — F07, F08)

**This is the most critical phase from a compliance standpoint.**

**The problem:** When a session expires (idle or absolute), the session monitor shows a banner but the page remains visible with financial data. DS-019 Section 4.5 says: "the server-side timeout expires and the next request redirects to /login." But if the user makes no request (idle tab), the data stays visible indefinitely.

**The fix has two layers:**

### Layer 1: Client-Side Session Monitor — MUST redirect, not just warn

Find the session monitor (Phase 0F output). It currently shows a banner at 25 minutes. It must ALSO:

1. **At 30 minutes (idle timeout): Force redirect to /login.** Do not rely on the next server request. The client must act.

```typescript
// Session monitor — when idle timeout expires
if (idleMinutes >= 30) {
  // Log the expiry event BEFORE redirecting
  try {
    await logAuthEventClient('auth.session.expiry', {
      metadata: { reason: 'idle_timeout', idle_minutes: idleMinutes }
    });
  } catch {
    // Don't block redirect if logging fails
  }
  
  // Force signOut and redirect
  await supabase.auth.signOut({ scope: 'global' });
  window.location.replace('/login');  // replace, not push — no back button
  return;
}

// At 8 hours (absolute timeout): Force redirect
if (absoluteHours >= 8) {
  try {
    await logAuthEventClient('auth.session.expiry', {
      metadata: { reason: 'absolute_timeout', session_hours: absoluteHours }
    });
  } catch {}
  
  await supabase.auth.signOut({ scope: 'global' });
  window.location.replace('/login');
  return;
}
```

2. **The 25-minute warning banner must include a countdown** or at minimum say "Your session will expire in 5 minutes due to inactivity." Not just "session expired."

3. **When the timeout fires, the page content must be hidden IMMEDIATELY** — before the redirect completes. Set a state flag that renders a blank/loading screen, THEN redirect. This prevents the financial data from being visible during the redirect.

```typescript
const [sessionExpired, setSessionExpired] = useState(false);

// When timeout fires:
setSessionExpired(true);  // Immediately hides content
// Then signOut + redirect

// In render:
if (sessionExpired) {
  return <div className="...">Session expired. Redirecting to login...</div>;
}
```

### Layer 2: Middleware — Enforce provider-agnostic session cookies

The middleware reads `vialuce-session-start` and `vialuce-last-activity` cookies. **Verify these are actually being set and checked:**

```bash
# Are the cookies being SET on login?
grep -n "vialuce-session-start\|vialuce-last-activity" web/src/ -rn --include="*.ts" --include="*.tsx" | grep -v node_modules

# Is the middleware CHECKING them?
grep -n "IDLE_TIMEOUT\|ABSOLUTE_TIMEOUT\|session-start\|last-activity" web/src/middleware.ts
```

**If the middleware checks exist but aren't working** (F08 — stale session bypass after 7+ hours), the issue may be:
- Cookies not being set with correct maxAge
- Supabase auto-refresh transparently renewing the session before middleware can reject it
- The `vialuce-last-activity` cookie being updated on EVERY request (including the auto-refresh), which resets the idle timer

**The middleware MUST:**
1. Read `vialuce-session-start` — if current time minus value > 8 hours, reject and redirect to /login
2. Read `vialuce-last-activity` — if current time minus value > 30 minutes, reject and redirect to /login
3. NOT update `vialuce-last-activity` on auto-refresh requests — only on genuine user navigation
4. If either cookie is missing, treat as expired and redirect

### Verification

```bash
# Session monitor forces redirect at 30 min
grep -n "replace.*login\|location.*login\|redirect.*login" web/src/ -rn --include="*.ts" --include="*.tsx" | grep -i "session\|expir\|idle\|timeout" | grep -v node_modules

# Content hidden on expiry
grep -n "sessionExpired\|session.*expired\|expired.*state" web/src/ -rn --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10

# Middleware enforces both timeout types
grep -n "IDLE\|ABSOLUTE\|session-start\|last-activity\|28800\|1800" web/src/middleware.ts

# Provider-agnostic cookies being SET
grep -n "vialuce-session-start\|vialuce-last-activity" web/src/ -rn --include="*.ts" --include="*.tsx" | grep -i "set\|cookie\|response" | grep -v node_modules
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-150 Phase 4: Session expiry enforcement — redirect on timeout, hide content, middleware check" && git push origin dev
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

1. Log in as VL Admin → MFA → observe console for POST /api/auth/log-event → 200
2. Log out → observe console for POST /api/auth/log-event → 200
3. Log in as Patricia → MFA → observe MFA verify button shows "Verifying..." state
4. Log out

**Verify in Supabase SQL Editor:**

```sql
SELECT tenant_id, event_type, actor_id, 
       payload->>'email' as email,
       created_at
FROM platform_events 
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

**Expected minimum rows:**

| event_type | actor_id | email | tenant_id |
|-----------|----------|-------|-----------|
| auth.login.success | VL Admin UUID | platform@vialuce.com | NULL |
| auth.mfa.verify.success | VL Admin UUID | (email or null) | NULL |
| auth.logout | VL Admin UUID | platform@vialuce.com | NULL |
| auth.login.success | Patricia UUID | admin@bancocumbre.ec | BCL UUID |
| auth.mfa.verify.success | Patricia UUID | (email or null) | BCL UUID |
| auth.logout | Patricia UUID | admin@bancocumbre.ec | BCL UUID |

**Critical checks:**
- `auth.login.success` rows exist (F01 resolved)
- Logout rows have `actor_id` populated, NOT NULL (F03 resolved)
- Patricia's logout has `tenant_id = BCL UUID`, NOT NULL (F04 resolved)
- Email is populated in payload (F06 resolved)
- No duplicate MFA verify rows for same login session (F05 resolved)

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-150 Phase 5: Localhost verification — all auth events logged correctly" && git push origin dev
```

---

## PHASE 6: COMPLIANCE VERIFICATION (Standing Rule 39)

```bash
echo "============================================"
echo "HF-150 PHASE 6: COMPLIANCE VERIFICATION"
echo "============================================"

echo ""
echo "=== SOC 2 CC6: Complete Auth Event Audit Trail ==="
echo "Events wired (minimum 7 of 10 from DS-019 Section 8.1):"
for event in "login.success" "login.failure" "mfa.enroll" "mfa.verify.success" "mfa.verify.failure" "logout" "session.expiry"; do
  echo "--- auth.$event ---"
  grep -rn "$event" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -2
done

echo ""
echo "=== DS-019 Section 4.5: Session Expiry Enforcement ==="
echo "Client-side redirect on idle timeout:"
grep -n "replace.*login\|location.*login" web/src/ -rn --include="*.ts" --include="*.tsx" | grep -i "idle\|timeout\|expir\|session" | grep -v node_modules | head -5

echo ""
echo "=== DS-019 Section 4.5: Content Hidden on Expiry ==="
grep -n "sessionExpired\|expired.*content\|hide.*content" web/src/ -rn --include="*.ts" --include="*.tsx" | grep -v node_modules | head -5

echo ""
echo "=== Decision 143: All Events Include Who ==="
echo "Logout passes explicit actor_id:"
grep -B 5 "auth.logout" web/src/ -rn --include="*.ts" --include="*.tsx" | grep -i "actor\|user\|getUser" | grep -v node_modules | head -5

echo ""
echo "=== Decision 143: All Events Include Email ==="
echo "Login passes explicit email:"
grep -B 3 "login.success" web/src/ -rn --include="*.ts" --include="*.tsx" | grep -i "email" | grep -v node_modules | head -5

echo ""
echo "=== OWASP: Session Cannot Be Resumed After Expiry ==="
echo "Middleware rejects expired sessions:"
grep -n "session-start\|last-activity\|IDLE\|ABSOLUTE" web/src/middleware.ts | head -10

echo ""
echo "=== Korean Test ==="
grep -rn "logAuthEvent\|platform_events\|auth\.login\|auth\.logout\|auth\.mfa" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -iE "español|english|contraseña|password|inicio" | head -5
echo "(should be empty)"
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-150 Phase 6: Compliance verification — SOC 2 CC6, DS-019, OWASP, Decision 143" && git push origin dev
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-150_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Phase 0 diagnostic committed | Full auth event flow inventory |
| PG-2 | `auth.login.success` event logged on localhost | SQL shows row with actor_id + email populated |
| PG-3 | `auth.login.failure` event logged on localhost | SQL shows row with email + failure reason |
| PG-4 | Logout event has `actor_id` populated (NOT NULL) | SQL shows VL Admin UUID on logout row |
| PG-5 | Logout event has correct `tenant_id` | VL Admin = NULL, Patricia = BCL UUID |
| PG-6 | Email populated in payload for login + logout | `payload->>'email'` returns value |
| PG-7 | No duplicate MFA verify events for single login | One mfa.verify.success per MFA flow |
| PG-8 | MFA verify button shows loading state | isVerifying flag prevents double-click |
| PG-9 | Session monitor redirects to /login on idle timeout | Code path: >= 30 min → signOut → window.location.replace('/login') |
| PG-10 | Session monitor redirects to /login on absolute timeout | Code path: >= 8 hours → signOut → window.location.replace('/login') |
| PG-11 | Page content hidden on session expiry | sessionExpired state → blank/redirect screen before redirect |
| PG-12 | Middleware enforces both timeout types | grep shows idle + absolute checks in middleware.ts |
| PG-13 | GET /api/auth/log-event returns 405 | GET handler exists with 405 response |
| PG-14 | Minimum 7 event types wired | grep shows login.success, login.failure, mfa.enroll, mfa.verify.success, mfa.verify.failure, logout, session.expiry |
| PG-15 | npm run build exits 0 | Clean build |
| PG-16 | Compliance verification (Phase 6) output pasted | Full output in completion report |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Relying on cookie resolution for logout events | Logout MUST capture user data BEFORE signOut |
| AP-2 | Showing a banner without enforcing redirect | DS-019 says: banner is courtesy, enforcement is mandatory |
| AP-3 | Leaving financial data visible after session expires | Content MUST be hidden immediately when timeout fires |
| AP-4 | Updating vialuce-last-activity on auto-refresh | Only genuine user navigation resets the idle timer |
| AP-5 | Treating session expiry as a client-only concern | Both client (immediate redirect) AND server (middleware rejection) must enforce |
| AP-6 | Changing any authentication flow logic | This HF fixes LOGGING and ENFORCEMENT. Do not modify login, MFA, or signOut behavior. |
| AP-7 | Skipping the compliance verification phase | Phase 6 is mandatory — Standing Rule 39 |

---

## POST-MERGE PRODUCTION VERIFICATION (Andrew)

After merge and deploy:

1. Open fresh incognito/private browser
2. Log in as VL Admin → complete MFA → observe /select-tenant
3. Log out
4. Log in as Patricia → complete MFA → observe /stream
5. Log out
6. Run:

```sql
SELECT tenant_id, event_type, actor_id, 
       payload->>'email' as email,
       payload->>'reason' as reason,
       created_at
FROM platform_events 
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

**Expected:**
- `auth.login.success` rows for BOTH users with actor_id + email
- `auth.logout` rows for BOTH users with actor_id + email + correct tenant_id
- `auth.mfa.verify.success` rows (one per user, no duplicates)
- VL Admin: tenant_id IS NULL. Patricia: tenant_id = BCL UUID

**Session expiry test (optional but recommended):**
- Log in, then leave the tab idle for 31 minutes
- At 25 min: amber warning banner should appear
- At 30 min: page should go blank and redirect to /login
- After redirect: query platform_events for `auth.session.expiry` row

---

## PR

```bash
gh pr create --base main --head dev \
  --title "HF-150: Auth Logging Completeness + Session Expiry Enforcement" \
  --body "## What This Fixes

### 11 findings from production testing (March 20, 2026)

**Root Cause A — Logout logging fires after session destruction:**
- Logout events now capture actor_id, email, tenant_id BEFORE signOut
- F03 (NULL actor_id), F04 (NULL tenant_id), F06 (NULL email) resolved

**Root Cause B — Login events not wired:**  
- auth.login.success and auth.login.failure wired with explicit email
- GET /api/auth/log-event returns 405
- F01, F02, F06, F10, F11 resolved

**Root Cause C — MFA verify page UX:**
- Loading state prevents double-submit
- Event deduplication prevents duplicate rows
- Clear error/success feedback
- F05, F09 resolved

**Root Cause D — Session expiry is advisory, not enforced:**
- Client-side session monitor now forces redirect at 30 min idle / 8h absolute
- Page content hidden immediately on expiry
- Middleware enforces both timeout types
- Session expiry event logged
- F07, F08 resolved

## Compliance: SOC 2 CC6 / DS-019 / OWASP / Decision 143
## Proof Gates: see HF-150_COMPLETION_REPORT.md"
```

---

*ViaLuce.ai — The Way of Light*
*HF-150: "An audit trail with gaps is not an audit trail."*
