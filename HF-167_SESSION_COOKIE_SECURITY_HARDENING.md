# HF-167: Session Cookie Security Hardening
## Classification: Hotfix — Auth / Session / Compliance
## Priority: P0 — Security vulnerability (auth bypass via persistent cookies)
## Scope: 3 files — cookie-config.ts, middleware.ts, server.ts
## Compliance Gate: SOC 2 CC6, OWASP Session Management, NIST SP 800-63B, DS-019 Section 4.2, Decision 123

---

## CC_STANDING_ARCHITECTURE_RULES v3.0 — LOAD FROM REPO ROOT

Before ANY implementation, read `CC_STANDING_ARCHITECTURE_RULES.md` at repo root. All rules 1-39 active. This HF specifically invokes:

- **Rule 34 (No Bypass):** This is a structural fix. No workaround. No "interim measure."
- **Rule 39 (Compliance Verification Gate):** This HF touches auth, session, access control, cookies, and middleware. Verify against SOC 2 CC6, OWASP, NIST SP 800-63B, DS-014, DS-019, Decision 123 BEFORE PR.
- **Rules 25-28 (Completion Reports):** Full completion report with pasted evidence mandatory.

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I." Just act. Execute every phase in sequence. Commit after each phase. Push after each commit.

---

## THE PROBLEM — THREE LINKED VULNERABILITIES

### Vulnerability 1: @supabase/ssr ignores cookieOptions.maxAge

**File:** `web/src/lib/supabase/cookie-config.ts` and both consumers (middleware.ts, server.ts)

Our code passes `cookieOptions: SESSION_COOKIE_OPTIONS` to `createServerClient`. We set `maxAge: 28800` (8 hours). But @supabase/ssr IGNORES this value when it calls `setAll()`. The `options` parameter in each cookie entry within `setAll()` carries Supabase's own default: **400-day maxAge** (approximately 34,560,000 seconds).

**Evidence:** Browser DevTools → Application → Cookies → `sb-*-auth-token` shows expiry date approximately 400 days in the future, not 8 hours.

**Impact:** Supabase auth cookies persist for 400 days regardless of our configuration. Sessions survive browser close, Incognito window close, and computer restart.

### Vulnerability 2: Missing session cookies = skip timeout checks

**File:** `web/src/middleware.ts` — the AUTHENTICATED section

Current code:
```typescript
// Check absolute timeout (8 hours)
if (sessionStart && (now - Number(sessionStart)) > SESSION_LIMITS.ABSOLUTE_TIMEOUT_MS) {
  // ... redirect to /login
}

// Check idle timeout (30 minutes)
if (lastActivity && (now - Number(lastActivity)) > SESSION_LIMITS.IDLE_TIMEOUT_MS) {
  // ... redirect to /login
}
```

When `vialuce-session-start` or `vialuce-last-activity` cookies expire (they had 8-hour maxAge) or are absent for any reason, `sessionStart` and `lastActivity` are `undefined`. Both `if` conditions evaluate to `false` (because `undefined && ...` is falsy). **Both timeout checks are silently skipped.** The Supabase auth cookie (400 days) survives, `getUser()` returns a valid user, and the middleware falls through to the authenticated path.

**Impact:** After 8 hours (when vialuce-* cookies expire), the user has NO timeout enforcement but IS still authenticated. Auth bypass.

### Vulnerability 3: maxAge on SESSION_COOKIE_OPTIONS makes ALL cookies persistent

**File:** `web/src/lib/supabase/cookie-config.ts`

```typescript
export const SESSION_COOKIE_OPTIONS = {
  maxAge: 8 * 60 * 60, // 8 hours absolute session lifetime (OWASP)
  ...
};
```

Cookies with `maxAge` are **persistent** — they survive browser close. The OWASP Session Management Cheat Sheet states that for applications handling sensitive financial data, sessions SHOULD terminate when the browser closes. A session cookie (no maxAge) dies when the browser closes. A persistent cookie (with maxAge) does not.

Our `vialuce-session-start` and `vialuce-last-activity` cookies explicitly set `maxAge: SESSION_COOKIE_OPTIONS.maxAge`:
```typescript
supabaseResponse.cookies.set('vialuce-session-start', String(now), {
  maxAge: SESSION_COOKIE_OPTIONS.maxAge,  // <-- Makes cookie persistent
  sameSite: 'lax',
  secure: true,
  path: '/',
});
```

**Impact:** Close browser → reopen → navigate to vialuce.ai → authenticated without login. Combined with Vulnerability 2: after 8 hours, these cookies expire while the Supabase cookie (400 days) persists → timeout checks skipped → indefinite session.

---

## THE FIX — THREE CHANGES, ONE STRUCTURAL RESOLUTION

### Architecture Decision Record

```
ARCHITECTURE DECISION RECORD
============================
Problem: Three linked auth vulnerabilities allow sessions to persist
         indefinitely through browser close and bypass timeout checks.

Option A: Remove maxAge from SESSION_COOKIE_OPTIONS + override setAll + flip timeout guards
  - Scale test: Works at 10x? YES — config, not per-request logic
  - AI-first: Any hardcoding? NO — configuration change
  - Transport: Data through HTTP bodies? NO — cookies only
  - Atomicity: Clean state on failure? YES — old cookies expire naturally

Option B: Keep maxAge, add browser-close detection via JS
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? NO
  - Transport: N/A
  - Atomicity: NO — race condition between page unload and JS execution

CHOSEN: Option A because it is structural (cookies die on browser close),
        compliant (OWASP/NIST), and eliminates all three vulnerabilities
        with config changes. No new code paths, no client-side detection.
REJECTED: Option B because client-side browser-close detection is unreliable
          (page unload events are not guaranteed). Violates Standing Rule 34
          (workaround, not fix).
```

---

## CLT FINDINGS ADDRESSED BY THIS HF

| Finding | Description | Status After HF-167 |
|---------|-------------|---------------------|
| CLT-185 F05 | @supabase/ssr ignores cookieOptions.maxAge (400-day cookie) | ✅ CLOSED — setAll override forces session-scoped cookies |
| CLT-185 F06 | Middleware skips timeout checks when session cookies absent | ✅ CLOSED — missing cookie = expired session |
| CLT-181 F12 | Auth session persists through browser close | ✅ CLOSED — no maxAge = session-scoped (dies on close) |
| AUD-001 F-AUD-024 | maxAge makes cookies persistent, violates OWASP | ✅ CLOSED — maxAge removed |

---

## CC FAILURE PATTERNS TO AVOID

| Pattern | Description | How to Avoid |
|---------|-------------|--------------|
| FP-101 | OB removes capability, deferred promise never built | N/A — this HF completes the fix chain |
| FP-103 | Supabase Dashboard units assumed | Verified: Dashboard now reads 8 hours / 0.5 hours. Do NOT change Dashboard settings. |
| FP-69 | Fix one, leave others | ALL THREE files must be changed. Do not submit PR with partial changes. |
| FP-21 | Dual code path | Single `SESSION_COOKIE_OPTIONS` object without maxAge. Both middleware.ts and server.ts use same override pattern. |

---

## PHASE 1: DIAGNOSTIC — Verify Current State

### Step 1.1: Verify cookie-config.ts

```bash
cd /Users/$(whoami)/Projects/spm-platform
cat web/src/lib/supabase/cookie-config.ts
```

**Expected:** File contains `maxAge: 8 * 60 * 60` in `SESSION_COOKIE_OPTIONS`. If maxAge is already absent, STOP and report — someone already changed this.

### Step 1.2: Verify middleware.ts setAll callback

```bash
grep -n "setAll" web/src/middleware.ts
```

**Expected:** `setAll(cookiesToSet)` callback exists. Inside it, `options` is passed through directly WITHOUT override:
```typescript
cookiesToSet.forEach(({ name, value, options }) =>
  supabaseResponse.cookies.set(name, value, options)
);
```

### Step 1.3: Verify middleware.ts timeout guards

```bash
grep -n "sessionStart &&" web/src/middleware.ts
grep -n "lastActivity &&" web/src/middleware.ts
```

**Expected:** Both guards use `if (sessionStart && ...)` and `if (lastActivity && ...)` — meaning absent values skip the check.

### Step 1.4: Verify server.ts setAll callback

```bash
grep -n "setAll" web/src/lib/supabase/server.ts
```

**Expected:** `setAll(cookiesToSet)` callback passes `options` through directly without override.

### Step 1.5: Verify vialuce-session-start cookie set

```bash
grep -n "vialuce-session-start" web/src/middleware.ts
grep -n "vialuce-last-activity" web/src/middleware.ts
```

**Expected:** Both cookies are set with explicit `maxAge: SESSION_COOKIE_OPTIONS.maxAge`.

### Step 1.6: Commit diagnostic evidence

```bash
echo "=== DIAGNOSTIC: cookie-config.ts ===" > /tmp/hf167-diagnostic.txt
cat web/src/lib/supabase/cookie-config.ts >> /tmp/hf167-diagnostic.txt
echo "" >> /tmp/hf167-diagnostic.txt
echo "=== DIAGNOSTIC: middleware.ts setAll ===" >> /tmp/hf167-diagnostic.txt
grep -n -A5 "setAll" web/src/middleware.ts >> /tmp/hf167-diagnostic.txt
echo "" >> /tmp/hf167-diagnostic.txt
echo "=== DIAGNOSTIC: timeout guards ===" >> /tmp/hf167-diagnostic.txt
grep -n "sessionStart &&\|lastActivity &&" web/src/middleware.ts >> /tmp/hf167-diagnostic.txt
echo "" >> /tmp/hf167-diagnostic.txt
echo "=== DIAGNOSTIC: server.ts setAll ===" >> /tmp/hf167-diagnostic.txt
grep -n -A5 "setAll" web/src/lib/supabase/server.ts >> /tmp/hf167-diagnostic.txt
echo "" >> /tmp/hf167-diagnostic.txt
echo "=== DIAGNOSTIC: vialuce cookies ===" >> /tmp/hf167-diagnostic.txt
grep -n "vialuce-session-start\|vialuce-last-activity" web/src/middleware.ts >> /tmp/hf167-diagnostic.txt
cat /tmp/hf167-diagnostic.txt
```

**PASTE the full output of this diagnostic in the completion report.** Do not summarize.

---

## PHASE 2: IMPLEMENTATION — cookie-config.ts

### Step 2.1: Remove maxAge from SESSION_COOKIE_OPTIONS

**File:** `web/src/lib/supabase/cookie-config.ts`

**BEFORE** (current — approximately 25 lines):
```typescript
export const SESSION_COOKIE_OPTIONS = {
  maxAge: 8 * 60 * 60, // 8 hours absolute session lifetime (OWASP)
  sameSite: 'lax' as const,
  secure: true, // HTTPS only
  path: '/',
};
```

**AFTER:**
```typescript
/**
 * HF-167 / DS-019 Section 4.2: SOC 2 / OWASP / NIST compliant cookie configuration
 *
 * PROVIDER-AGNOSTIC: These values are enforced in OUR code.
 * The Supabase Dashboard has matching server-side settings as defense-in-depth.
 * If the auth provider changes, these values travel with the codebase.
 *
 * HF-167: maxAge REMOVED. Without maxAge, cookies are session-scoped —
 * they die when the browser closes. This satisfies:
 * - OWASP Session Management: sessions terminate on browser close
 * - NIST SP 800-63B: re-authentication after browser close
 * - SOC 2 CC6: session timeout enforcement
 *
 * The 8-hour absolute and 30-minute idle timeouts are enforced by:
 * 1. Supabase Dashboard server-side settings (8h time-box, 0.5h inactivity)
 * 2. Middleware timestamp checks (vialuce-session-start, vialuce-last-activity)
 *
 * CRITICAL: @supabase/ssr ignores cookieOptions.maxAge when calling setAll().
 * The setAll callback in middleware.ts and server.ts MUST spread these options
 * over the Supabase-provided options to enforce session-scoped behavior.
 * Without this override, Supabase SSR sets a 400-day cookie expiry.
 */
export const SESSION_COOKIE_OPTIONS = {
  sameSite: 'lax' as const,
  secure: true, // HTTPS only
  path: '/',
  // NO maxAge — session-scoped cookie dies on browser close (HF-167)
};
```

**SESSION_LIMITS stays UNCHANGED.** The timeout constants are used by the middleware timestamp checks, not by cookie config.

### Step 2.2: Verify and commit

```bash
cd /Users/$(whoami)/Projects/spm-platform
cat web/src/lib/supabase/cookie-config.ts
git add web/src/lib/supabase/cookie-config.ts
git commit -m "HF-167 Phase 2: Remove maxAge from SESSION_COOKIE_OPTIONS — session-scoped cookies"
git push origin dev
```

---

## PHASE 3: IMPLEMENTATION — middleware.ts (THREE CHANGES)

### Change 3A: Override options in setAll callback

Find the `setAll` callback inside the `createServerClient` call. It currently looks like:

```typescript
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value }) =>
    request.cookies.set(name, value)
  );
  supabaseResponse = NextResponse.next({ request });
  cookiesToSet.forEach(({ name, value, options }) =>
    supabaseResponse.cookies.set(name, value, options)
  );
},
```

**REPLACE the entire `setAll` function body with:**

```typescript
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value }) =>
    request.cookies.set(name, value)
  );
  supabaseResponse = NextResponse.next({ request });
  // HF-167: Override Supabase SSR's 400-day cookie options with our
  // session-scoped config. @supabase/ssr ignores cookieOptions.maxAge
  // and injects its own options with ~400-day expiry. Spreading
  // SESSION_COOKIE_OPTIONS LAST ensures our values win.
  cookiesToSet.forEach(({ name, value, options }) =>
    supabaseResponse.cookies.set(name, value, {
      ...options,
      ...SESSION_COOKIE_OPTIONS,
    })
  );
},
```

**WHY `...SESSION_COOKIE_OPTIONS` LAST:** Object spread applies properties left to right. Supabase's `options` may contain `maxAge: 34560000` (400 days). Our `SESSION_COOKIE_OPTIONS` does NOT contain `maxAge` (removed in Phase 2). Spreading ours last overrides `sameSite`, `secure`, and `path` — and since ours has no `maxAge`, the Supabase maxAge is preserved... wait. That's wrong.

**CORRECTION:** Since we removed `maxAge` from `SESSION_COOKIE_OPTIONS`, spreading it over Supabase's options will NOT remove Supabase's `maxAge`. Object spread doesn't delete keys. We need to explicitly delete `maxAge` from the merged options. Updated implementation:

```typescript
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value }) =>
    request.cookies.set(name, value)
  );
  supabaseResponse = NextResponse.next({ request });
  // HF-167: Force session-scoped cookies. @supabase/ssr ignores our
  // cookieOptions and injects its own ~400-day maxAge. We override by:
  // 1. Spreading our SESSION_COOKIE_OPTIONS over theirs
  // 2. Explicitly deleting maxAge so cookies are session-scoped
  // Without maxAge, cookies die on browser close (OWASP/NIST compliant).
  cookiesToSet.forEach(({ name, value, options }) => {
    const sessionOptions = { ...options, ...SESSION_COOKIE_OPTIONS };
    delete sessionOptions.maxAge;
    supabaseResponse.cookies.set(name, value, sessionOptions);
  });
},
```

### Change 3B: Flip timeout guards from skip-when-absent to expire-when-absent

Find the AUTHENTICATED section with the timeout checks. Currently:

```typescript
// Check absolute timeout (8 hours)
if (sessionStart && (now - Number(sessionStart)) > SESSION_LIMITS.ABSOLUTE_TIMEOUT_MS) {
```

**REPLACE with:**

```typescript
// Check absolute timeout (8 hours)
// HF-167: Missing session cookie = expired session. Previously, absent
// sessionStart caused this check to be SKIPPED, allowing auth bypass
// when vialuce-session-start expired but Supabase cookie persisted.
if (!sessionStart || (now - Number(sessionStart)) > SESSION_LIMITS.ABSOLUTE_TIMEOUT_MS) {
```

Find the idle timeout check. Currently:

```typescript
// Check idle timeout (30 minutes)
if (lastActivity && (now - Number(lastActivity)) > SESSION_LIMITS.IDLE_TIMEOUT_MS) {
```

**REPLACE with:**

```typescript
// Check idle timeout (30 minutes)
// HF-167: Missing activity cookie = expired session (same rationale as above).
if (!lastActivity || (now - Number(lastActivity)) > SESSION_LIMITS.IDLE_TIMEOUT_MS) {
```

### Change 3C: Remove maxAge from vialuce-session-start and vialuce-last-activity

Find where these cookies are SET (in the authenticated section, AFTER the timeout checks):

```typescript
if (!sessionStart) {
  supabaseResponse.cookies.set('vialuce-session-start', String(now), {
    maxAge: SESSION_COOKIE_OPTIONS.maxAge,
    sameSite: 'lax',
    secure: true,
    path: '/',
  });
}
supabaseResponse.cookies.set('vialuce-last-activity', String(now), {
  maxAge: SESSION_COOKIE_OPTIONS.maxAge,
  sameSite: 'lax',
  secure: true,
  path: '/',
});
```

**REPLACE with:**

```typescript
// HF-167: Session-scoped cookies — no maxAge. Die on browser close.
// Timeout enforcement is via the timestamp VALUES (checked above),
// not via cookie expiry. SESSION_COOKIE_OPTIONS no longer has maxAge.
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

### Step 3.4: Verify no remaining maxAge references in middleware

```bash
grep -n "maxAge" web/src/middleware.ts
```

**Expected:** Only references to `maxAge: 0` in the `clearAuthCookies` function and in the expired/idle redirect handlers (where cookies are cleared). NO references to `SESSION_COOKIE_OPTIONS.maxAge` should remain for cookie SETTING.

**IMPORTANT:** The `clearAuthCookies` function uses `maxAge: 0` to DELETE cookies. This is CORRECT — `maxAge: 0` tells the browser to remove the cookie immediately. Do NOT change these.

Similarly, the expired session redirect handlers set cookies with `maxAge: 0`:
```typescript
expiredResponse.cookies.set('vialuce-session-start', '', { maxAge: 0, path: '/' });
expiredResponse.cookies.set('vialuce-last-activity', '', { maxAge: 0, path: '/' });
```
These are DELETION operations. Do NOT change them.

### Step 3.5: Commit

```bash
git add web/src/middleware.ts
git commit -m "HF-167 Phase 3: Middleware — setAll override, timeout guard flip, session-scoped vialuce cookies"
git push origin dev
```

---

## PHASE 4: IMPLEMENTATION — server.ts

### Step 4.1: Override options in server.ts setAll callback

**File:** `web/src/lib/supabase/server.ts`

Find the `setAll` callback. Currently:

```typescript
setAll(cookiesToSet) {
  try {
    cookiesToSet.forEach(({ name, value, options }) => {
      cookieStore.set(name, value, options);
    });
  } catch {
    // setAll can fail in Server Components when cookies are read-only.
    // This is expected behavior — session refresh happens in middleware.
  }
},
```

**REPLACE with:**

```typescript
setAll(cookiesToSet) {
  try {
    // HF-167: Override Supabase SSR's 400-day cookie options.
    // Same pattern as middleware.ts — force session-scoped cookies.
    cookiesToSet.forEach(({ name, value, options }) => {
      const sessionOptions = { ...options, ...SESSION_COOKIE_OPTIONS };
      delete sessionOptions.maxAge;
      cookieStore.set(name, value, sessionOptions);
    });
  } catch {
    // setAll can fail in Server Components when cookies are read-only.
    // This is expected behavior — session refresh happens in middleware.
  }
},
```

### Step 4.2: Verify SESSION_COOKIE_OPTIONS is imported

```bash
grep -n "SESSION_COOKIE_OPTIONS" web/src/lib/supabase/server.ts
```

**Expected:** Import already exists from OB-178:
```typescript
import { SESSION_COOKIE_OPTIONS } from './cookie-config';
```

If the import does NOT exist, ADD IT at the top of the file alongside the other imports.

### Step 4.3: Commit

```bash
git add web/src/lib/supabase/server.ts
git commit -m "HF-167 Phase 4: Server client — setAll override for session-scoped cookies"
git push origin dev
```

---

## PHASE 5: BROWSER CLIENT VERIFICATION

### Step 5.1: Check if browser client also passes SESSION_COOKIE_OPTIONS

```bash
grep -n "SESSION_COOKIE_OPTIONS" web/src/lib/supabase/client.ts
```

The browser client uses `createBrowserClient` which handles cookies differently (document.cookie API). It passes `cookieOptions: SESSION_COOKIE_OPTIONS`. Since we removed `maxAge` from `SESSION_COOKIE_OPTIONS`, the browser client will now set session-scoped cookies. This is the CORRECT behavior — no additional changes needed in client.ts.

**HOWEVER:** Verify that the browser client file exists and uses SESSION_COOKIE_OPTIONS. If it doesn't import SESSION_COOKIE_OPTIONS, that's a separate gap (but not introduced by this HF).

### Step 5.2: Commit verification evidence

```bash
echo "=== BROWSER CLIENT CHECK ===" > /tmp/hf167-browser-client.txt
grep -n "SESSION_COOKIE_OPTIONS\|cookieOptions\|maxAge" web/src/lib/supabase/client.ts >> /tmp/hf167-browser-client.txt
cat /tmp/hf167-browser-client.txt
```

---

## PHASE 6: BUILD AND LOCAL VERIFICATION

### Step 6.1: Clean build

```bash
cd /Users/$(whoami)/Projects/spm-platform/web
# Kill any running dev server first
kill $(lsof -ti:3000) 2>/dev/null || true
rm -rf .next
npm run build
```

**Build MUST pass with zero errors.** If build fails, diagnose and fix before proceeding. Do NOT skip this step.

### Step 6.2: Start dev server and verify

```bash
npm run dev
```

Wait for "Ready" message. Navigate to http://localhost:3000. Verify:
1. Login page loads
2. Login with platform@vialuce.com succeeds
3. After login, check DevTools → Application → Cookies:
   - `sb-*-auth-token` should show **Session** in the Expires column (NOT a date 400 days in the future)
   - `vialuce-session-start` should show **Session** (NOT a specific date)
   - `vialuce-last-activity` should show **Session** (NOT a specific date)

### Step 6.3: Screenshot evidence

Take a screenshot of DevTools → Application → Cookies showing the Expires/Max-Age column for all auth cookies. Include in completion report.

---

## PHASE 7: AUTOMATED VERIFICATION SCRIPT

Create and run this verification script:

```bash
cat > /tmp/hf167-verify.sh << 'EOF'
#!/bin/bash
echo "=== HF-167 VERIFICATION ==="
echo ""
echo "1. cookie-config.ts — maxAge should NOT appear:"
grep -n "maxAge" web/src/lib/supabase/cookie-config.ts || echo "   ✅ No maxAge found"
echo ""
echo "2. middleware.ts — setAll should have SESSION_COOKIE_OPTIONS override:"
grep -A3 "sessionOptions" web/src/middleware.ts || echo "   ❌ sessionOptions not found — setAll override missing"
echo ""
echo "3. middleware.ts — timeout guards should use !sessionStart || and !lastActivity ||:"
grep -n "!sessionStart\|!lastActivity" web/src/middleware.ts || echo "   ❌ Flipped guards not found"
echo ""
echo "4. middleware.ts — vialuce cookies should NOT have maxAge (except maxAge: 0 for deletion):"
grep -n "vialuce-session-start\|vialuce-last-activity" web/src/middleware.ts | grep -v "maxAge: 0" | grep "maxAge" && echo "   ❌ maxAge still present on vialuce cookies" || echo "   ✅ No maxAge on vialuce cookie sets"
echo ""
echo "5. server.ts — setAll should have SESSION_COOKIE_OPTIONS override:"
grep -A3 "sessionOptions" web/src/lib/supabase/server.ts || echo "   ❌ sessionOptions not found — setAll override missing"
echo ""
echo "6. No remaining SESSION_COOKIE_OPTIONS.maxAge references:"
grep -rn "SESSION_COOKIE_OPTIONS.maxAge" web/src/ && echo "   ❌ Stale references found" || echo "   ✅ No stale maxAge references"
echo ""
echo "=== END VERIFICATION ==="
EOF
chmod +x /tmp/hf167-verify.sh
cd /Users/$(whoami)/Projects/spm-platform
bash /tmp/hf167-verify.sh
```

**PASTE the full output in the completion report.**

---

## PHASE 8: PR CREATION

```bash
cd /Users/$(whoami)/Projects/spm-platform
gh pr create --base main --head dev \
  --title "HF-167: Session cookie security hardening — three auth vulnerabilities fixed" \
  --body "## What
Three linked auth vulnerabilities allowed sessions to persist indefinitely and bypass timeout checks.

## Vulnerabilities Fixed
1. **@supabase/ssr 400-day cookie** — setAll callback now overrides Supabase's options with SESSION_COOKIE_OPTIONS and explicitly deletes maxAge, making all auth cookies session-scoped.
2. **Missing session cookies = skip timeout** — Middleware timeout guards flipped from \`if (x && ...)\` to \`if (!x || ...)\`. Missing cookie = expired session, not skip check.
3. **Persistent cookies survive browser close** — Removed maxAge from SESSION_COOKIE_OPTIONS. All cookies now session-scoped (die on browser close).

## Files Changed
- \`web/src/lib/supabase/cookie-config.ts\` — Remove maxAge from SESSION_COOKIE_OPTIONS
- \`web/src/middleware.ts\` — setAll override + timeout guard flip + session-scoped vialuce cookies
- \`web/src/lib/supabase/server.ts\` — setAll override for server components

## CLT Findings Closed
- CLT-185 F05: @supabase/ssr 400-day cookie
- CLT-185 F06: Middleware skips timeout when cookies absent
- CLT-181 F12: Session persists through browser close
- AUD-001 F-AUD-024: maxAge makes cookies persistent

## Compliance
- SOC 2 CC6: Session timeout enforcement ✅
- OWASP Session Mgmt: Session dies on browser close ✅
- NIST SP 800-63B: Re-auth after browser close ✅
- DS-019 Section 4.2: Cookie config aligned ✅
- Decision 123: Structural compliance ✅

## Risk
- Existing persistent cookies in user browsers will still have 400-day expiry until they are refreshed. The NEXT request triggers middleware, which rewrites the cookie with session-scoped options. Natural transition, no forced logout.
- Supabase Dashboard server-side settings (8h/0.5h) are the primary enforcement. This HF adds defense-in-depth at the cookie layer.
"
```

---

## PHASE 9: PRODUCTION VERIFICATION (POST-MERGE)

After Andrew merges the PR and Vercel deploys:

### Test 1: Fresh login produces session-scoped cookies
1. Open Incognito window
2. Navigate to vialuce.ai
3. Verify redirect to /login
4. Login with platform@vialuce.com
5. Open DevTools → Application → Cookies
6. **Verify:** `sb-*-auth-token` Expires column shows "Session" (NOT a future date)
7. **Verify:** `vialuce-session-start` Expires column shows "Session"
8. **Verify:** `vialuce-last-activity` Expires column shows "Session"

### Test 2: Browser close terminates session
1. After login (from Test 1), close the Incognito window entirely
2. Open a NEW Incognito window
3. Navigate to vialuce.ai
4. **Verify:** Redirect to /login (session cookies died with the window)

### Test 3: Regular browser — close and reopen
1. In a regular (non-Incognito) Chrome window, navigate to vialuce.ai
2. Login
3. Verify session-scoped cookies in DevTools
4. Close ALL Chrome windows (quit Chrome completely)
5. Reopen Chrome, navigate to vialuce.ai
6. **Verify:** Redirect to /login

### Test 4: Idle timeout still works
1. Login
2. Wait 31+ minutes without any navigation
3. Navigate to any page
4. **Verify:** Redirect to /login?reason=idle_timeout

### Test 5: Existing sessions transition naturally
1. If any browser window still has old persistent cookies (from before HF-167):
2. Navigate to any page — this triggers middleware
3. Check DevTools → Cookies after the page loads
4. **Verify:** Cookie Expires is now "Session" (middleware rewrote the cookie)

---

## COMPLETION REPORT REQUIREMENTS

The completion report MUST include:

1. **Phase 1 diagnostic output** — full paste of `/tmp/hf167-diagnostic.txt`
2. **Phase 2 diff** — `git diff HEAD~1 web/src/lib/supabase/cookie-config.ts`
3. **Phase 3 diff** — `git diff HEAD~1 web/src/middleware.ts` (for the middleware commit)
4. **Phase 4 diff** — `git diff HEAD~1 web/src/lib/supabase/server.ts`
5. **Phase 5 browser client check** — paste output
6. **Phase 6 build output** — `npm run build` showing zero errors
7. **Phase 7 verification script output** — full paste
8. **Phase 8 PR URL** — the created PR link

**SELF-ATTESTATION IS NOT ACCEPTED.** Every claim must have pasted evidence.

---

## WHAT THIS HF DOES NOT DO

- Does NOT change Supabase Dashboard settings (already corrected: 8h/0.5h)
- Does NOT change the browser client file (it inherits the change via SESSION_COOKIE_OPTIONS)
- Does NOT change any RLS policies
- Does NOT change any route logic, page rendering, or workspace access
- Does NOT affect MFA enrollment or challenge flows
- Does NOT touch the clearAuthCookies function (maxAge: 0 for deletion is correct)
- Does NOT touch the expired/idle redirect handlers (maxAge: 0 for cookie clearing is correct)

---

## COMPLIANCE VERIFICATION (Standing Rule 39)

| Standard | Requirement | Status After HF-167 |
|----------|-------------|---------------------|
| SOC 2 CC6 | Session timeout enforcement | ✅ Server-side (Supabase Dashboard 8h/0.5h) + Middleware (timestamp checks) + Session-scoped cookies |
| SOC 2 CC6 | Session dies on browser close | ✅ No maxAge = session-scoped cookies |
| OWASP Session Mgmt | Session terminates on browser close | ✅ Session-scoped cookies die with browser |
| OWASP Session Mgmt | Idle timeout 15-30 min | ✅ 30 min (middleware + Supabase Dashboard) |
| OWASP Session Mgmt | Absolute timeout 4-8 hours | ✅ 8 hours (middleware + Supabase Dashboard) |
| OWASP Cookie Security | Secure, SameSite, HttpOnly | ✅ secure:true, sameSite:lax, path:/ |
| NIST SP 800-63B | Re-auth after browser close | ✅ Session-scoped cookies require new login |
| NIST SP 800-63B | 30-min inactivity timeout | ✅ Middleware enforces, Dashboard enforces |
| DS-019 Section 4.2 | Cookie config | ✅ Aligned — no maxAge, secure, sameSite |
| DS-014 / Decision 126 | Access control | ✅ No permission changes — authentication layer only |
| Decision 123 | Compliance from architecture | ✅ Structural fix, not workaround |

---

*"@supabase/ssr said it accepted our config. It didn't. The cookies said 400 days. The middleware said 'if the cookie is gone, skip the check.' Three lies, compounding. HF-167 makes the code say what it means."*
