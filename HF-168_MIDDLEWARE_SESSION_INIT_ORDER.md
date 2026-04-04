# HF-168: Middleware Session Cookie Initialization Order
## Classification: Hotfix — Auth / Session (HF-167 Regression Fix)
## Priority: P0 — Login blocked in production
## Scope: 1 file — middleware.ts
## Root Cause: CONFIRMED via Network tab evidence (not speculation)

---

## CC_STANDING_ARCHITECTURE_RULES v3.0 — LOAD FROM REPO ROOT

Before ANY implementation, read `CC_STANDING_ARCHITECTURE_RULES.md` at repo root. All rules 1-39 active. This HF specifically invokes:

- **Rule 34 (No Bypass):** Structural fix. Reorder logic, not add workaround.
- **Rule 39 (Compliance Verification Gate):** Touches middleware auth. Verify against SOC 2 CC6, OWASP, NIST SP 800-63B, DS-019 Section 4.2.
- **Rules 25-28 (Completion Reports):** Full completion report with pasted evidence mandatory.

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I." Just act. Execute every phase in sequence. Commit after each phase. Push after each commit.

---

## THE PROBLEM — EVIDENCE-BASED

### What Happened

HF-167 (PR #304) flipped the middleware timeout guards from:
```typescript
if (sessionStart && (now - Number(sessionStart)) > ABSOLUTE_TIMEOUT_MS)
if (lastActivity && (now - Number(lastActivity)) > IDLE_TIMEOUT_MS)
```
to:
```typescript
if (!sessionStart || (now - Number(sessionStart)) > ABSOLUTE_TIMEOUT_MS)
if (!lastActivity || (now - Number(lastActivity)) > IDLE_TIMEOUT_MS)
```

This correctly treats missing cookies as expired sessions (the HF-167 security fix). BUT: on the **first authenticated request after login**, `vialuce-session-start` has never been set. The cookie initialization code sits BELOW the timeout checks:

```typescript
// TIMEOUT CHECKS (line ~203)
if (!sessionStart || ...) { redirect to /login }  // ← Fires here! sessionStart is undefined
if (!lastActivity || ...) { redirect to /login }

// COOKIE INITIALIZATION (line ~220) — NEVER REACHED on first request
if (!sessionStart) {
  supabaseResponse.cookies.set('vialuce-session-start', ...)
}
supabaseResponse.cookies.set('vialuce-last-activity', ...)
```

### Network Tab Evidence (Production — March 23, 2026)

```
token?grant_type=password    200    ← Sign-in succeeded
log-event                    307    ← First API call hit middleware → REDIRECTED
login?reason=session_expired 200    ← Middleware expired the brand-new session
```

The `log-event` call is `logAuthEventClient('auth.login.success', ...)` — it fires IMMEDIATELY after `signInWithPassword()` succeeds. This is the first request through middleware with the new auth cookies. Middleware sees valid Supabase user but no `vialuce-session-start` cookie → `!sessionStart` = true → redirect to /login → clear all cookies → `fetchCurrentProfile()` then finds no session → "Account found but profile is missing."

### Why This Didn't Fail on Localhost

CC tested on localhost where:
- The build passed (no runtime error)
- Login may have worked if the test was done before the `log-event` request pattern fired
- OR the test was superficial (build pass = completion)

---

## THE FIX

Move session cookie initialization ABOVE the timeout checks. The correct logic:

1. If `sessionStart` is absent → **this is a new session** → initialize it
2. If `sessionStart` is present → check if expired
3. Same for `lastActivity`

This preserves HF-167's security improvement (present-but-expired or missing-after-having-existed cookies trigger expiry) while allowing brand-new sessions to initialize.

### Architecture Decision Record

```
ARCHITECTURE DECISION RECORD
============================
Problem: HF-167 timeout guard flip treats first-ever authenticated
         request as expired because vialuce-session-start hasn't been
         set yet. Cookie initialization code is below timeout checks.

Option A: Move cookie initialization above timeout checks
  - Scale test: Works at 10x? YES — same code, different order
  - AI-first: Any hardcoding? NO
  - Transport: N/A
  - Atomicity: YES — if initialization fails, timeout check still fires

Option B: Add special case "if first request, skip timeout check"
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? NO
  - Transport: N/A
  - Atomicity: NO — "first request" detection is fragile

Option C: Revert HF-167 guard flip to original (sessionStart && ...)
  - Scale test: Works at 10x? YES
  - AI-first: NO
  - Transport: N/A
  - Atomicity: YES
  - REJECTED: Reintroduces the security vulnerability (missing cookie = skip check)

CHOSEN: Option A because it preserves the security fix (expired cookies
        trigger expiry) while correctly handling new sessions. The
        initialization sets the timestamp, then the check verifies it.
        A brand-new session will always pass the timeout check because
        (now - now) = 0, which is less than both timeout thresholds.
REJECTED: Option B (fragile detection), Option C (reopens vulnerability)
```

---

## CLT FINDINGS

### New Finding: CLT-186 F01

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| F01 | HF-167 regression: login blocked — middleware expires new sessions before cookie initialization | P0 | THIS HF |

### HF-167 Findings Status (Unchanged)

| Finding | Status |
|---------|--------|
| CLT-185 F05 (400-day cookie) | ✅ CLOSED — setAll override works (HF-167) |
| CLT-185 F06 (missing cookie = skip check) | ✅ CLOSED — guard flip works once initialization order is fixed |
| CLT-181 F12 (session persists through browser close) | ✅ CLOSED — maxAge removed (HF-167) |

---

## CC FAILURE PATTERNS TO AVOID

| Pattern | How to Avoid |
|---------|--------------|
| FP-69 (Fix one, leave others) | This is ONE file, ONE change. No partial work. |
| FP-102 (Incomplete cleanup) | Verify no other code depends on the current ordering. |

---

## PHASE 1: DIAGNOSTIC — Read Current Middleware

### Step 1.1: Extract the AUTHENTICATED section

```bash
cd /Users/$(whoami)/Projects/spm-platform
grep -n "AUTHENTICATED\|sessionStart\|lastActivity\|vialuce-session-start\|vialuce-last-activity\|ABSOLUTE_TIMEOUT\|IDLE_TIMEOUT" web/src/middleware.ts
```

**PASTE the full output.** This shows the current line numbers for all relevant code.

### Step 1.2: Extract the full authenticated block

```bash
# Find the line number of "── AUTHENTICATED ──" and show 60 lines after it
grep -n "AUTHENTICATED" web/src/middleware.ts | head -1
```

Then:
```bash
# Replace NNN with the line number from above
sed -n 'NNN,+60p' web/src/middleware.ts
```

**PASTE the full output.** This is the code we're reordering.

---

## PHASE 2: IMPLEMENTATION — Reorder middleware.ts

The current structure in the AUTHENTICATED section is:

```
A. Read sessionStart and lastActivity from cookies
B. Check absolute timeout (redirects if !sessionStart || expired)
C. Check idle timeout (redirects if !lastActivity || expired)
D. Initialize sessionStart if absent
E. Refresh lastActivity
```

The new structure must be:

```
A. Read sessionStart and lastActivity from cookies
B. Initialize sessionStart if absent (NEW POSITION)
C. Refresh lastActivity (NEW POSITION)
D. Re-read values for timeout checks
E. Check absolute timeout (now always has a value — only fires if genuinely expired)
F. Check idle timeout (now always has a value — only fires if genuinely expired)
```

### The Exact Change

Find the AUTHENTICATED section. It currently looks like this (approximately):

```typescript
// ── AUTHENTICATED ──

// OB-178: Provider-agnostic session enforcement (idle + absolute timeout)
// These are OUR cookies, not Supabase's — they travel with the codebase.
const now = Date.now();
const sessionStart = request.cookies.get('vialuce-session-start')?.value;
const lastActivity = request.cookies.get('vialuce-last-activity')?.value;

// Check absolute timeout (8 hours)
// HF-167: Missing session cookie = expired session. Previously, absent
// sessionStart caused this check to be SKIPPED, allowing auth bypass
// when vialuce-session-start expired but Supabase cookie persisted.
if (!sessionStart || (now - Number(sessionStart)) > SESSION_LIMITS.ABSOLUTE_TIMEOUT_MS) {
  logAuthEvent('auth.session.expired.absolute', { elapsed_ms: now - Number(sessionStart) }, user.id);
  const expiredResponse = NextResponse.redirect(new URL('/login?reason=session_expired', request.url));
  clearAuthCookies(request, expiredResponse);
  expiredResponse.cookies.set('vialuce-session-start', '', { maxAge: 0, path: '/' });
  expiredResponse.cookies.set('vialuce-last-activity', '', { maxAge: 0, path: '/' });
  return noCacheResponse(expiredResponse);
}

// Check idle timeout (30 minutes)
// HF-167: Missing activity cookie = expired session (same rationale as above).
if (!lastActivity || (now - Number(lastActivity)) > SESSION_LIMITS.IDLE_TIMEOUT_MS) {
  logAuthEvent('auth.session.expired.idle', { idle_ms: now - Number(lastActivity) }, user.id);
  const idleResponse = NextResponse.redirect(new URL('/login?reason=idle_timeout', request.url));
  clearAuthCookies(request, idleResponse);
  idleResponse.cookies.set('vialuce-session-start', '', { maxAge: 0, path: '/' });
  idleResponse.cookies.set('vialuce-last-activity', '', { maxAge: 0, path: '/' });
  return noCacheResponse(idleResponse);
}

// HF-167: Session-scoped cookies — no maxAge. Die on browser close.
if (!sessionStart) {
  supabaseResponse.cookies.set('vialuce-session-start', String(now), {
    sameSite: 'lax',
    secure: true,
    path: '/',
  });
}
supabaseResponse.cookies.set('vialuce-last-activity', String(now), {
  sameSite: 'lax',
  secure: true,
  path: '/',
});
```

**REPLACE the entire block (from `const now = Date.now()` through the `vialuce-last-activity` set) with:**

```typescript
// ── SESSION ENFORCEMENT (OB-178 + HF-167 + HF-168) ──
// Provider-agnostic session timeout enforcement.
// These are OUR cookies, not Supabase's — they travel with the codebase.
//
// HF-168: Cookie initialization MUST happen BEFORE timeout checks.
// On the first authenticated request after login, vialuce-session-start
// does not exist yet. HF-167's guard (!sessionStart || ...) correctly
// treats missing cookies as expired — but that logic must only apply
// to cookies that PREVIOUSLY existed and have since expired/disappeared.
// A brand-new session must be initialized first, then checked.
//
// Sequence: Initialize → Check → Refresh
// A new session: initialized now, (now - now) = 0 < timeout → passes
// An expired session: cookie exists with old timestamp → fails check → redirect
// A disappeared cookie (browser cleared, etc.): re-initialized → passes
//   (This is acceptable: Supabase server-side timeout is the primary gate.
//    If the Supabase session is expired, getUser() above already returned null
//    and we never reach this code. Reaching here means Supabase says valid.)

const now = Date.now();
const existingSessionStart = request.cookies.get('vialuce-session-start')?.value;
const existingLastActivity = request.cookies.get('vialuce-last-activity')?.value;

// STEP 1: Initialize session cookies if absent (new session after login)
// HF-167: Session-scoped cookies — no maxAge. Die on browser close.
if (!existingSessionStart) {
  supabaseResponse.cookies.set('vialuce-session-start', String(now), {
    sameSite: 'lax',
    secure: true,
    path: '/',
  });
}
if (!existingLastActivity) {
  supabaseResponse.cookies.set('vialuce-last-activity', String(now), {
    sameSite: 'lax',
    secure: true,
    path: '/',
  });
}

// STEP 2: Resolve effective values for timeout checks
// If cookie existed, use its value. If just initialized, use now.
const sessionStartMs = existingSessionStart ? Number(existingSessionStart) : now;
const lastActivityMs = existingLastActivity ? Number(existingLastActivity) : now;

// STEP 3: Check absolute timeout (8 hours)
// HF-167: This now fires on genuinely expired sessions, not new ones.
// A just-initialized session: (now - now) = 0 < 8 hours → passes.
if ((now - sessionStartMs) > SESSION_LIMITS.ABSOLUTE_TIMEOUT_MS) {
  logAuthEvent('auth.session.expired.absolute', { elapsed_ms: now - sessionStartMs }, user.id);
  const expiredResponse = NextResponse.redirect(new URL('/login?reason=session_expired', request.url));
  clearAuthCookies(request, expiredResponse);
  expiredResponse.cookies.set('vialuce-session-start', '', { maxAge: 0, path: '/' });
  expiredResponse.cookies.set('vialuce-last-activity', '', { maxAge: 0, path: '/' });
  return noCacheResponse(expiredResponse);
}

// STEP 4: Check idle timeout (30 minutes)
if ((now - lastActivityMs) > SESSION_LIMITS.IDLE_TIMEOUT_MS) {
  logAuthEvent('auth.session.expired.idle', { idle_ms: now - lastActivityMs }, user.id);
  const idleResponse = NextResponse.redirect(new URL('/login?reason=idle_timeout', request.url));
  clearAuthCookies(request, idleResponse);
  idleResponse.cookies.set('vialuce-session-start', '', { maxAge: 0, path: '/' });
  idleResponse.cookies.set('vialuce-last-activity', '', { maxAge: 0, path: '/' });
  return noCacheResponse(idleResponse);
}

// STEP 5: Refresh last activity timestamp on every authenticated request
// (Only if session existed before — new sessions were just set in Step 1)
if (existingLastActivity) {
  supabaseResponse.cookies.set('vialuce-last-activity', String(now), {
    sameSite: 'lax',
    secure: true,
    path: '/',
  });
}
```

### Why This Is Correct

| Scenario | existingSessionStart | sessionStartMs | Timeout Check | Result |
|----------|---------------------|----------------|---------------|--------|
| **New session (first request after login)** | undefined | now | (now - now) = 0 < 8h | ✅ PASSES — session initialized |
| **Active session (normal request)** | "1711234567890" | 1711234567890 | (now - value) < 8h | ✅ PASSES — continues |
| **Expired session (cookie present, old value)** | "1711100000000" | 1711100000000 | (now - value) > 8h | ✅ EXPIRED — redirect to /login |
| **Cookie disappeared (cleared by browser/extension)** | undefined | now | (now - now) = 0 < 8h | ✅ PASSES — re-initialized |

The "cookie disappeared" case is acceptable because: if we're in the AUTHENTICATED section at all, `getUser()` already confirmed the Supabase session is valid. The Supabase Dashboard's server-side 8h/0.5h timeouts are the primary enforcement. Our cookies are defense-in-depth. If someone clears our custom cookies but the Supabase session is genuinely valid, re-initializing is the correct behavior.

### Security Analysis — Does This Reintroduce the HF-167 Vulnerability?

**No.** The HF-167 vulnerability was: absent `vialuce-session-start` + valid Supabase cookie (400-day expiry) = timeout checks skipped entirely (old `if (x && ...)` guards).

With HF-168:
- Absent cookie → re-initialized to `now` → timeout check runs against `now` → passes (0 < 8h)
- Supabase session validity is confirmed by `getUser()` BEFORE this code
- Supabase Dashboard enforces 8h/0.5h server-side → if session is truly expired, `getUser()` returns null → middleware redirects to /login before reaching timeout checks

The defense-in-depth chain is: **Supabase server (primary) → middleware timeout checks (secondary) → session-scoped cookies die on browser close (tertiary)**.

---

## PHASE 3: BUILD AND LOCAL VERIFICATION

### Step 3.1: Commit

```bash
cd /Users/$(whoami)/Projects/spm-platform
git add web/src/middleware.ts
git commit -m "HF-168: Fix HF-167 regression — initialize session cookies before timeout checks"
git push origin dev
```

### Step 3.2: Clean build

```bash
cd web
kill $(lsof -ti:3000) 2>/dev/null || true
rm -rf .next
npm run build
```

**Build MUST pass with zero errors.**

### Step 3.3: Local login test

```bash
npm run dev
```

1. Open http://localhost:3000
2. Login with platform@vialuce.com
3. **MUST** reach /select-tenant (VL Admin) or /stream (tenant user)
4. Open DevTools → Network tab → verify NO 307 redirects to /login after sign-in
5. Open DevTools → Application → Cookies → verify `vialuce-session-start` and `vialuce-last-activity` are present with "Session" expiry

**PASTE screenshot or network log evidence.**

---

## PHASE 4: VERIFICATION SCRIPT

```bash
cat > /tmp/hf168-verify.sh << 'EOF'
#!/bin/bash
echo "=== HF-168 VERIFICATION ==="
echo ""
echo "1. Session cookie initialization appears BEFORE timeout checks:"
grep -n "STEP 1\|STEP 2\|STEP 3\|STEP 4\|STEP 5" web/src/middleware.ts
echo ""
echo "2. No !sessionStart or !lastActivity in timeout guard conditions:"
grep -n "!sessionStart\|!lastActivity\|!existingSessionStart\|!existingLastActivity" web/src/middleware.ts | grep -v "STEP 1\|if absent\|Initialize" | grep "ABSOLUTE_TIMEOUT\|IDLE_TIMEOUT" && echo "   ❌ Guard still uses negation in timeout check" || echo "   ✅ Timeout checks use resolved values only"
echo ""
echo "3. existingSessionStart/existingLastActivity used for cookie read:"
grep -n "existingSessionStart\|existingLastActivity" web/src/middleware.ts
echo ""
echo "4. sessionStartMs/lastActivityMs used for timeout math:"
grep -n "sessionStartMs\|lastActivityMs" web/src/middleware.ts
echo ""
echo "5. HF-167 setAll override still present:"
grep -n "sessionOptions" web/src/middleware.ts
echo ""
echo "6. maxAge only appears for deletion (maxAge: 0):"
grep -n "maxAge" web/src/middleware.ts | grep -v "maxAge: 0\|delete.*maxAge\|// NO maxAge" && echo "   ❌ Non-deletion maxAge found" || echo "   ✅ maxAge only used for cookie deletion"
echo ""
echo "=== END VERIFICATION ==="
EOF
chmod +x /tmp/hf168-verify.sh
cd /Users/$(whoami)/Projects/spm-platform
bash /tmp/hf168-verify.sh
```

**PASTE the full output.**

---

## PHASE 5: PR CREATION

```bash
cd /Users/$(whoami)/Projects/spm-platform
gh pr create --base main --head dev \
  --title "HF-168: Fix HF-167 regression — initialize session cookies before timeout checks" \
  --body "## What
HF-167 (PR #304) flipped middleware timeout guards from \`if (x && ...)\` to \`if (!x || ...)\` to treat missing cookies as expired sessions. This correctly fixed the security gap but introduced a regression: on the FIRST authenticated request after login, \`vialuce-session-start\` has never been set, so \`!sessionStart\` = true → middleware expires the brand-new session → clears all cookies → login fails with 'Account found but profile is missing.'

## Evidence
Network tab showed: \`token?grant_type=password\` (200) → \`log-event\` (307 redirect) → \`login?reason=session_expired\` (200). The \`log-event\` API call was the first request through middleware after login. Middleware found no \`vialuce-session-start\` cookie and expired the session.

## Fix
Reorder the AUTHENTICATED section: Initialize → Check → Refresh.
1. If session cookies are absent, initialize them to \`now\` (new session)
2. Resolve effective values: existing cookie value or \`now\`
3. Check absolute timeout against resolved value ((now - now) = 0 for new sessions → passes)
4. Check idle timeout against resolved value (same)
5. Refresh last-activity on existing sessions

## Security
Does NOT reintroduce HF-167 vulnerability. Absent cookies are re-initialized to \`now\`, which passes timeout checks (0 < 8h). Supabase server-side enforcement (8h/0.5h) is the primary gate — if the session is truly expired, \`getUser()\` returns null before reaching timeout checks. Session-scoped cookies (HF-167) still die on browser close.

## Files Changed
- \`web/src/middleware.ts\` — Reorder session enforcement: initialize before check

## CLT Finding
- CLT-186 F01: HF-167 regression (login blocked) → CLOSED
"
```

---

## PHASE 6: PRODUCTION VERIFICATION (POST-MERGE)

After Andrew merges and Vercel deploys:

### Test 1: Login works
1. Open Incognito window
2. Navigate to vialuce.ai → should redirect to /login
3. Login with platform@vialuce.com
4. **MUST** reach /select-tenant or /stream — NOT "Account found but profile is missing"

### Test 2: Session cookies are session-scoped
1. After login, open DevTools → Application → Cookies
2. `sb-*-auth-token` → Expires = "Session"
3. `vialuce-session-start` → Expires = "Session"
4. `vialuce-last-activity` → Expires = "Session"

### Test 3: Browser close terminates session
1. Close Incognito window
2. Open new Incognito window
3. Navigate to vialuce.ai
4. **MUST** redirect to /login

### Test 4: Network tab — no 307 redirects after login
1. Open DevTools → Network tab (Preserve log checked)
2. Login
3. **MUST NOT** see any 307 redirects to /login after the sign-in succeeds
4. Specifically: `log-event` request must return 200, not 307

### Test 5: Idle timeout still works
1. Login, wait 31+ minutes
2. Navigate to any page
3. **MUST** redirect to /login?reason=idle_timeout

---

## COMPLETION REPORT REQUIREMENTS

1. **Phase 1 diagnostic output** — grep results showing current line numbers
2. **Phase 2 diff** — `git diff HEAD~1 web/src/middleware.ts`
3. **Phase 3 build output** — `npm run build` exit 0
4. **Phase 3 local login evidence** — network tab or screenshot showing successful login
5. **Phase 4 verification script output** — full paste
6. **Phase 5 PR URL**

**SELF-ATTESTATION IS NOT ACCEPTED.** Every claim must have pasted evidence.

---

## COMPLIANCE VERIFICATION (Standing Rule 39)

| Standard | Requirement | Status After HF-168 |
|----------|-------------|---------------------|
| SOC 2 CC6 | Session timeout enforcement | ✅ Timeout checks still fire for expired sessions |
| OWASP Session Mgmt | Session dies on browser close | ✅ Session-scoped cookies unchanged (HF-167) |
| NIST SP 800-63B | Re-auth after browser close | ✅ Unchanged from HF-167 |
| DS-019 Section 4.2 | Cookie config | ✅ No cookie config changes |

---

*"Initialize, then verify. Not the other way around. A session that doesn't exist yet can't be expired."*
