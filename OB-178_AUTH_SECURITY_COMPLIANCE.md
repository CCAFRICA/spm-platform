# OB-178: Authentication Security Compliance — DS-019 Phases A-C + Flywheel Fix
## Governed by DS-019 (Authentication and Identity Architecture)

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `COMPLETION_REPORT_ENFORCEMENT.md` — report enforcement applies
3. `DIAG-009_FINDINGS.md` — auth root cause (400-day cookie, local signOut, no timeouts)
4. `DIAG-010_FINDINGS.md` — flywheel Tier 2 fallthrough gap

**If you have not read all four files, STOP and read them now.**

---

## WHY THIS OB EXISTS

DS-019 (Authentication and Identity Architecture) specifies the holistic security foundation for vialuce. The Supabase Dashboard has been hardened with server-side session controls (8h time-box, 30 min idle, single session, MFA enabled, leaked password prevention, audit logs). This OB implements the code-level changes required for full compliance.

### What the Supabase Dashboard Now Enforces (Already Applied)
- Session time-box: 8 hours
- Inactivity timeout: 30 minutes
- Single session per user: enabled
- AAL1 session limit: 15 minutes (users with MFA must complete it)
- TOTP MFA: enabled (max 2 factors)
- Leaked password prevention: enabled (HaveIBeenPwned)
- Minimum password: 12 chars, all character types
- Secure password change: requires recent auth
- Auth audit logs to database: enabled
- Sign-in rate limit: 10/5 min
- Token refresh rate limit: 30/5 min
- Refresh token compromise detection: enabled

### What This OB Delivers (Code Changes)
1. **Phase A:** Cookie hardening + signOut global scope + provider-agnostic session enforcement
2. **Phase B:** MFA enrollment and challenge flows for admin/platform roles
3. **Phase C:** Auth context refactoring — server-side session resolution, client receives props
4. **Phase D:** DIAG-010 flywheel Tier 2 fallthrough fix
5. **Phase E:** Auth event logging to platform_events (provider-agnostic audit trail)

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### CC CONTROL FRAMEWORK (Rules 35-39)
35. EPG mandatory for mathematical/formula phases — Phase D (flywheel) requires EPG
36. No unauthorized behavioral changes — auth refactoring must preserve all existing user journeys
37. Lifecycle wiring requires transition proof — N/A
38. Mathematical review gate — Phase D flywheel confidence formula
39. **COMPLIANCE VERIFICATION GATE** — Every phase must verify against SOC 2 CC6, OWASP Session Management, NIST SP 800-63B. Non-compliant code is not shippable.

---

## SCOPE BOUNDARIES

### IN SCOPE
- Cookie configuration override (maxAge, secure, sameSite)
- Shared cookie config file imported by all Supabase clients
- signOut scope: global with try/catch fallback to local
- Provider-agnostic session enforcement in middleware (idle + absolute timeout tracked in our code)
- Provider-agnostic password validation (length, complexity, HaveIBeenPwned check on our forms)
- MFA enrollment page (QR code, verify code, redirect)
- MFA challenge page (enter code after password login)
- AAL check in middleware (redirect to MFA if aal1 but user has enrolled factors)
- Auth context refactoring: server-side session resolution via Server Components
- Client components receive auth state as props (user, role, tenant, capabilities)
- Browser Supabase client used ONLY for login/logout (write operations)
- Auth event logging to platform_events table
- DIAG-010 flywheel fix: demoted Tier 1 returns as Tier 2 match
- Session expiry notification (banner at 25 min idle)
- Build verification

### OUT OF SCOPE — DO NOT TOUCH
- Calculation engine
- SCI pipeline (except flywheel fix in Phase D)
- Intelligence Stream content
- Commission statements
- Lifecycle workflow
- RLS policies (existing auth.uid() chain unchanged)
- SSO/SAML (DS-019 Phase G — deferred)
- Step-up authentication (DS-019 Phase D — separate OB)
- User management UI (DS-019 Phase F — separate OB)
- New Supabase migrations (use existing tables: platform_events, audit_logs, profiles)

### CRITICAL CONSTRAINTS
1. **Do NOT change RLS policies.** The auth.uid() → profiles → tenant_id chain is proven and working.
2. **Do NOT remove the browser Supabase client.** It is still needed for login (signInWithPassword) and logout (signOut). What changes is that it is NO LONGER used for reading session state.
3. **Do NOT break the VL Admin flow.** platform@vialuce.com (tenant_id NULL, role platform) must continue to work. MFA enrollment should be prompted but not blocking during development.
4. **Cookie maxAge, signOut scope, and session timeout values are LOCKED per DS-019 Section 4.** Do not change them.
5. **The flywheel fix (Phase D) is a SINGLE function change** in lookupFingerprint. Do not modify writeFingerprint or any other flywheel function.

---

## PHASE 0: COMMIT THIS PROMPT + INTERFACE VERIFICATION

```bash
cd /Users/AndrewAfrica/spm-platform
cp OB-178_AUTH_SECURITY_COMPLIANCE.md .
git add -A && git commit -m "OB-178 Phase 0: Auth security compliance prompt" && git push origin dev
```

Then read these files completely before any code changes:

```bash
echo "============================================"
echo "OB-178 PHASE 0: INTERFACE VERIFICATION"
echo "============================================"

echo ""
echo "=== 0A: ALL SUPABASE CLIENT FILES ==="
for f in $(find web/src/lib/supabase -name "*.ts" -o -name "*.tsx" | sort); do
  echo "========== $f =========="
  cat "$f"
done

echo ""
echo "=== 0B: MIDDLEWARE — COMPLETE ==="
cat web/src/middleware.ts

echo ""
echo "=== 0C: AUTH CONTEXT — COMPLETE ==="
for f in $(find web/src -name "*auth*context*" -o -name "*auth*provider*" -o -name "*session*context*" | grep -v node_modules | grep -v ".next" | sort); do
  echo "========== $f =========="
  cat "$f"
done

echo ""
echo "=== 0D: AUTH SERVICE — COMPLETE ==="
for f in $(find web/src -name "*auth*service*" -o -name "*auth-shell*" | grep -v node_modules | grep -v ".next" | sort); do
  echo "========== $f =========="
  cat "$f"
done

echo ""
echo "=== 0E: LOGIN PAGE — COMPLETE ==="
cat web/src/app/login/page.tsx

echo ""
echo "=== 0F: ALL useAuth CONSUMERS ==="
grep -rn "useAuth\|useSession\|useUser" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "auth-context\|auth-provider\|session-context" | head -40

echo ""
echo "=== 0G: FLYWHEEL FILE ==="
cat web/src/lib/sci/fingerprint-flywheel.ts

echo ""
echo "=== 0H: ROOT LAYOUT ==="
cat web/src/app/layout.tsx
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-178 Phase 0: Interface verification complete" && git push origin dev
```

---

## PHASE A: COOKIE HARDENING + SIGNOUT + PROVIDER-AGNOSTIC ENFORCEMENT

### A1: Shared Cookie Configuration

Create `web/src/lib/supabase/cookie-config.ts`:

```typescript
// OB-178 / DS-019 Section 4.2: SOC 2 / OWASP / NIST compliant cookie configuration
// These values are derived from security standards for financial data applications:
// - OWASP Session Management: absolute timeout 4-8 hours
// - NIST SP 800-63B: re-authentication every 12 hours
// - SOC 2 CC6: session timeout enforcement mandatory
//
// PROVIDER-AGNOSTIC: These values are enforced in OUR code.
// The Supabase Dashboard has matching server-side settings as defense-in-depth.
// If the auth provider changes, these values travel with the codebase.

export const SESSION_COOKIE_OPTIONS = {
  maxAge: 8 * 60 * 60, // 8 hours — absolute session lifetime (OWASP)
  sameSite: 'lax' as const,
  secure: true, // HTTPS only
  // httpOnly intentionally not set here — requires Phase C auth context refactoring
  // DS-019 Section 4.3 specifies the httpOnly architecture
};

// Provider-agnostic session limits (enforced in middleware, not by Supabase)
export const SESSION_LIMITS = {
  IDLE_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes inactivity (OWASP/NIST)
  ABSOLUTE_TIMEOUT_MS: 8 * 60 * 60 * 1000, // 8 hours absolute (OWASP)
  WARNING_BEFORE_IDLE_MS: 5 * 60 * 1000, // Warn 5 min before idle timeout
};
```

### A2: Apply Cookie Options to All Supabase Clients

Import `SESSION_COOKIE_OPTIONS` in:
- `web/src/lib/supabase/client.ts` — pass to `createBrowserClient` as `cookieOptions`
- `web/src/lib/supabase/server.ts` (if exists) — pass to `createServerClient`
- `web/src/middleware.ts` — pass to `createServerClient` in the middleware's cookie handling

**Every Supabase client creation must import from the shared config. No inline cookie values.**

### A3: signOut Global Scope

In `web/src/lib/supabase/auth-service.ts`, replace the signOut implementation:

```typescript
// OB-178 / DS-019 Section 4.4: SOC 2 CC6 — server-side session revocation on logout
// scope: 'global' revokes ALL refresh tokens on the Supabase server.
// Fallback to 'local' only if Supabase server is unreachable (network error).
try {
  await supabase.auth.signOut({ scope: 'global' });
} catch (globalSignOutError) {
  console.warn('[OB-178] Global signOut failed (network?), falling back to local:', globalSignOutError);
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (localSignOutError) {
    console.error('[OB-178] Local signOut also failed:', localSignOutError);
  }
}
```

Verify NO other file calls `signOut` with a different scope:
```bash
grep -rn "signOut" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

### A4: Provider-Agnostic Session Enforcement in Middleware

Add session timing enforcement to the middleware. This runs on EVERY request, independent of Supabase's server-side controls:

1. Read a `vialuce-session-start` cookie (set on login) — if current time minus session start > `ABSOLUTE_TIMEOUT_MS`, invalidate and redirect to /login
2. Read a `vialuce-last-activity` cookie (updated on every request) — if current time minus last activity > `IDLE_TIMEOUT_MS`, invalidate and redirect to /login
3. On every authenticated request, update the `vialuce-last-activity` cookie

These cookies are OUR cookies, not Supabase's. They travel with the codebase regardless of auth provider.

### A5: Session Expiry Warning

Create `web/src/lib/session/session-monitor.ts`:

A lightweight client-side activity tracker that warns the user at 25 minutes of inactivity. Simple banner notification — NOT a modal, NOT a countdown timer. The server enforces timeout; this just warns.

Integrate into the auth context or root layout — call `startSessionMonitor()` on auth, `stopSessionMonitor()` on signout.

### Verification

```bash
# Cookie config imported by all clients
grep -rn "SESSION_COOKIE_OPTIONS\|cookie-config" web/src/lib/supabase/ web/src/middleware.ts

# signOut uses global scope
grep -rn "scope.*global\|scope.*local" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

# Provider-agnostic session cookies
grep -rn "vialuce-session-start\|vialuce-last-activity" web/src/middleware.ts

# No 400-day maxAge anywhere in src
grep -rn "400.*24.*60\|34560000" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-178 Phase A: Cookie hardening, signOut global, provider-agnostic session enforcement" && git push origin dev
```

---

## PHASE B: MFA ENROLLMENT AND CHALLENGE

### B1: MFA Enrollment Page

Create `web/src/app/auth/mfa/enroll/page.tsx`:

This page is shown when a user with role `platform` or `admin` logs in without MFA enrolled. The flow:
1. Call `supabase.auth.mfa.enroll({ factorType: 'totp' })`
2. Display the QR code SVG returned
3. User scans with authenticator app
4. User enters 6-digit verification code
5. Call `supabase.auth.mfa.challengeAndVerify()` with the code
6. On success, redirect to /stream (or the original destination)
7. On failure, show error and allow retry

**Keep the UI minimal and professional.** vialuce branding, dark theme consistent with the platform. No complex animations or multi-step wizards. QR code, text input, verify button, done.

Also show the secret as plain text below the QR code for manual entry.

### B2: MFA Challenge Page

Create `web/src/app/auth/mfa/verify/page.tsx`:

This page is shown on subsequent logins when the user has MFA enrolled but hasn't verified this session (aal1 → needs aal2). The flow:
1. Call `supabase.auth.mfa.challenge()` to get a challenge
2. User enters 6-digit code from authenticator app
3. Call `supabase.auth.mfa.verify()` with challenge ID and code
4. On success, redirect to /stream
5. On failure, show error and allow retry

### B3: AAL Check in Middleware

In the middleware, after successful `getUser()`:
1. Call `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`
2. If `currentLevel === 'aal1'` and `nextLevel === 'aal2'` (user has MFA enrolled but not verified this session), redirect to `/auth/mfa/verify`
3. If user's role is `platform` or `admin` and they have NO factors enrolled (`nextLevel === 'aal1'`), redirect to `/auth/mfa/enroll`

Add `/auth/mfa/enroll` and `/auth/mfa/verify` to PUBLIC_PATHS (they need to be accessible post-login but pre-MFA).

### B4: MFA Enforcement by Role

The MFA enforcement is in OUR middleware, not Supabase's configuration. This is provider-agnostic:

```typescript
// DS-019 Section 5.1: MFA Policy
// platform + admin: REQUIRED (redirect to enroll if not set up)
// manager: RECOMMENDED (prompt after login, don't block)
// member + viewer: OPTIONAL (available in settings)
const MFA_REQUIRED_ROLES = ['platform', 'admin'];
const MFA_PROMPTED_ROLES = ['manager'];
```

### Verification

```bash
# MFA pages exist
ls -la web/src/app/auth/mfa/enroll/page.tsx web/src/app/auth/mfa/verify/page.tsx

# AAL check in middleware
grep -n "getAuthenticatorAssuranceLevel\|aal1\|aal2\|MFA_REQUIRED" web/src/middleware.ts

# MFA routes in PUBLIC_PATHS
grep -n "mfa" web/src/middleware.ts
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-178 Phase B: MFA enrollment, challenge, and role-based enforcement" && git push origin dev
```

---

## PHASE C: AUTH CONTEXT REFACTORING

**This is the most significant change. Read carefully.**

### C1: Server-Side Session Resolution

The current pattern:
```
Browser client reads cookie → auth context provides user to components
```

The new pattern (DS-019 Section 4.3):
```
Middleware reads cookie (server) → Server Components resolve user/role/tenant → pass as props to client components
```

### C2: Create Server Auth Utility

Create `web/src/lib/auth/server-auth.ts`:

```typescript
// OB-178 / DS-019 Section 4.3: Server-side session resolution
// This utility resolves auth state on the server. Client components
// receive the result as props. No client-side cookie reading.

import { createClient } from '@/lib/supabase/server';

export interface AuthState {
  user: { id: string; email: string } | null;
  profile: { role: string; tenant_id: string | null; display_name: string; capabilities: any } | null;
  isAuthenticated: boolean;
  aal: 'aal1' | 'aal2' | null;
}

export async function getServerAuthState(): Promise<AuthState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return { user: null, profile: null, isAuthenticated: false, aal: null };
  }
  
  // Resolve profile from our database
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, tenant_id, display_name, capabilities')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  
  // Get AAL level
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  
  return {
    user: { id: user.id, email: user.email || '' },
    profile: profile || null,
    isAuthenticated: true,
    aal: aalData?.currentLevel || null,
  };
}
```

### C3: Refactor Auth Context

The auth context becomes a THIN WRAPPER around server-provided props, not a cookie reader:

1. Create a new `AuthProvider` that accepts `initialAuthState: AuthState` as a prop
2. The provider stores this in React state and provides it via context
3. The provider listens for `onAuthStateChange` ONLY for sign-out events (to clear state)
4. The provider does NOT call `getUser()` or `getSession()` — the server already did that

### C4: Update Root Layout

In `web/src/app/layout.tsx` (which is a Server Component):

```typescript
import { getServerAuthState } from '@/lib/auth/server-auth';

export default async function RootLayout({ children }) {
  const authState = await getServerAuthState();
  
  return (
    <html>
      <body>
        <AuthProvider initialAuthState={authState}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

### C5: Update All useAuth Consumers

Phase 0G identified all components calling `useAuth()`. Each must be verified to ensure it works with the new prop-based auth state. The interface should be identical — `useAuth()` still returns the same shape — but the source changes from "read cookie" to "received from server."

```bash
# Find all consumers
grep -rn "useAuth\|useSession" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "auth-context\|auth-provider"
```

For each consumer: verify it uses `useAuth()` hook (not direct cookie access). If any component directly reads Supabase cookies or localStorage, refactor it to use the context.

### C6: Browser Client — Login/Logout Only

Verify the browser Supabase client (`web/src/lib/supabase/client.ts`) is used ONLY for:
- `signInWithPassword()` — login form
- `signOut()` — logout button
- `mfa.enroll()` / `mfa.challenge()` / `mfa.verify()` — MFA pages

It should NOT be used for:
- `getUser()` — done on server
- `getSession()` — done on server
- `onAuthStateChange()` — only for signout detection, not session init

```bash
# Verify browser client usage
grep -rn "createBrowserClient\|supabaseBrowser\|createClient.*from.*client" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

### Verification

```bash
# Server auth utility exists
cat web/src/lib/auth/server-auth.ts

# Root layout passes auth state
grep -n "getServerAuthState\|initialAuthState" web/src/app/layout.tsx

# Auth context receives props, doesn't read cookies
grep -n "initialAuthState\|cookie\|getSession\|getUser" web/src/*/auth*context* web/src/*/auth*provider* 2>/dev/null

# DFTG: Trace auth state from login to rendered component
echo "=== AUTH STATE FLOW TRACE ==="
echo "1. Login: browser client signInWithPassword → Supabase sets cookie"
echo "2. Redirect: middleware reads cookie via getUser() → validates → redirects to /stream"
echo "3. Layout: getServerAuthState() reads cookie server-side → resolves profile → passes to AuthProvider"
echo "4. Components: useAuth() returns server-resolved state"
echo "5. Verify with grep:"
grep -rn "signInWithPassword" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -5
grep -rn "getServerAuthState" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -5
grep -rn "useAuth\(\)" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-178 Phase C: Auth context refactored to server-side resolution" && git push origin dev
```

---

## PHASE D: FLYWHEEL TIER 2 FALLTHROUGH FIX (DIAG-010)

### D1: Fix lookupFingerprint

In `web/src/lib/sci/fingerprint-flywheel.ts`, in the `lookupFingerprint` function:

After the Tier 1 confidence check fails (confidence < 0.5), instead of falling through to the Tier 2 cross-tenant query, return the existing record as a Tier 2 match:

```typescript
// DIAG-010 fix: After Tier 1 demotion, return existing data as Tier 2 match
// The caller runs targeted re-classification (HC + CRR) instead of full Tier 3 LLM
if (conf < 0.5) {
  console.log(`[SCI-FINGERPRINT] tier=1 DEMOTED to tier=2: hash=${fingerprintHash} confidence=${conf} < 0.5 threshold`);
  return {
    tier: 2,
    match: true,
    fingerprintHash,
    classificationResult: tier1.classification_result,
    columnRoles: tier1.column_roles,
    confidence: conf,
    matchCount: tier1.match_count,
  };
}
```

### D2: EPG Verification Script

Create `web/scripts/verify/OB-178_flywheel_tier2.ts`:

This script must verify:
1. A fingerprint with confidence 0.3 is demoted from Tier 1
2. The demotion returns tier: 2, match: true (NOT tier: 3, match: false)
3. The returned data includes the existing classificationResult and columnRoles
4. Confidence 0.5 returns tier: 1 (threshold boundary)
5. Confidence 0.9 returns tier: 1 (above threshold)

Run the script and paste complete output.

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-178 Phase D: DIAG-010 flywheel Tier 2 fallthrough fix with EPG" && git push origin dev
```

---

## PHASE E: AUTH EVENT LOGGING

### E1: Auth Event Logger

Create `web/src/lib/auth/auth-logger.ts`:

```typescript
// OB-178 / DS-019 Section 8: Provider-agnostic auth event logging
// Logs to platform_events table — travels with the codebase regardless of auth provider
// Supabase audit_log_entries is the provider's log; this is ours.

export type AuthEventType = 
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'auth.mfa.enroll'
  | 'auth.mfa.verify.success'
  | 'auth.mfa.verify.failure'
  | 'auth.session.expired.idle'
  | 'auth.session.expired.absolute'
  | 'auth.permission.denied';

export async function logAuthEvent(
  supabase: any,
  eventType: AuthEventType,
  payload: Record<string, any>,
  actorId?: string,
  tenantId?: string,
) {
  try {
    await supabase.from('platform_events').insert({
      tenant_id: tenantId || '00000000-0000-0000-0000-000000000000', // system events use zero UUID
      event_type: eventType,
      actor_id: actorId || null,
      payload: {
        ...payload,
        timestamp: new Date().toISOString(),
        user_agent: typeof window !== 'undefined' ? navigator.userAgent : 'server',
      },
    });
  } catch (err) {
    // Auth logging must never block the auth flow
    console.error('[OB-178] Auth event logging failed:', err);
  }
}
```

### E2: Integrate Logging

Add `logAuthEvent` calls at:
- Login success (after signInWithPassword)
- Login failure (catch block)
- Logout (after signOut)
- MFA enrollment success
- MFA verify success/failure
- Session expired (in middleware, when idle/absolute timeout triggers)
- Permission denied (in middleware, when AAL or role check fails)

### E3: Verification

```bash
# platform_events schema matches our insert
grep -A 10 "platform_events" /path/to/SCHEMA_REFERENCE_LIVE.md

# All auth events logged
grep -rn "logAuthEvent" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-178 Phase E: Provider-agnostic auth event logging to platform_events" && git push origin dev
```

---

## PHASE F: BUILD + LOCAL VERIFICATION

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build
# MUST exit 0

npm run dev &
sleep 5

echo "=== VERIFICATION CHECKLIST ==="
echo "1. Navigate to localhost:3000 → should redirect to /login"
echo "2. Log in as platform@vialuce.com → should prompt MFA enrollment (if not enrolled)"
echo "3. After login, check cookies — maxAge should be ~28800 (8 hours)"
echo "4. Navigate to /stream → should render with auth state from server"
echo "5. Open browser console → no errors related to auth context"
echo "6. Check platform_events table for login event"
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-178 Phase F: Build verified clean" && git push origin dev
```

---

## PHASE G: COMPLIANCE VERIFICATION (Standing Rule 39)

Before creating the PR, verify compliance:

```bash
echo "=== COMPLIANCE VERIFICATION ==="
echo ""
echo "SOC 2 CC6 — Session Controls:"
grep -rn "SESSION_LIMITS\|IDLE_TIMEOUT\|ABSOLUTE_TIMEOUT\|session-start\|last-activity" web/src/middleware.ts
echo ""
echo "SOC 2 CC6 — Session Revocation:"
grep -rn "scope.*global" web/src/ --include="*.ts" | grep -v node_modules
echo ""
echo "SOC 2 CC6 — MFA:"
grep -rn "MFA_REQUIRED_ROLES\|getAuthenticatorAssuranceLevel\|aal" web/src/middleware.ts
echo ""
echo "SOC 2 CC6 — Audit Logging:"
grep -rn "logAuthEvent" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
echo "auth event log call sites (should be 7+)"
echo ""
echo "OWASP — Cookie Attributes:"
grep -rn "SESSION_COOKIE_OPTIONS\|maxAge.*28800\|secure.*true\|sameSite" web/src/lib/supabase/cookie-config.ts
echo ""
echo "OWASP — No 400-day Cookie:"
grep -rn "400.*24.*60\|34560000" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
echo "(should be zero results)"
echo ""
echo "Provider-Agnostic Controls:"
grep -rn "vialuce-session-start\|vialuce-last-activity" web/src/middleware.ts
echo ""
echo "DIAG-010 Fix:"
grep -n "DEMOTED.*tier.*2\|tier.*2.*match.*true" web/src/lib/sci/fingerprint-flywheel.ts
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-178 Phase G: Compliance verification passed" && git push origin dev
```

---

## PHASE H: PR CREATION

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-178: Authentication Security Compliance — DS-019 Phases A-C + Flywheel Fix" \
  --body "## Governed by DS-019 (Authentication and Identity Architecture)

## Problem
Platform had ZERO session security controls. 400-day cookies, local-only signOut,
no MFA, no idle timeout, no audit logging. Non-compliant with SOC 2 CC6, OWASP,
NIST SP 800-63B. DIAG-009 identified root cause. DIAG-010 identified flywheel gap.

## What This OB Does
- Phase A: Cookie maxAge 8h, secure, signOut global, provider-agnostic session enforcement
- Phase B: MFA enrollment + challenge for admin/platform roles
- Phase C: Auth context refactored to server-side resolution (httpOnly-compatible architecture)
- Phase D: DIAG-010 flywheel Tier 2 fallthrough fix (EPG verified)
- Phase E: Auth event logging to platform_events (provider-agnostic audit trail)

## Compliance
- SOC 2 CC6: Session controls, MFA, audit logging, server-side revocation
- OWASP: Cookie attributes, idle/absolute timeout, server-side enforcement
- NIST SP 800-63B: 30-min inactivity, 8h absolute, re-authentication
- Standing Rule 39: Compliance Verification Gate passed

## Supabase Dashboard (Already Applied)
Time-box 8h, idle 30min, single session, TOTP MFA, leaked passwords, 12-char min,
audit logs, rate limits hardened. Dashboard = defense-in-depth. Code = primary.

## Testing
Login as platform@vialuce.com → MFA enrollment → verify → /stream renders
Login as admin@bancocumbre.ec → MFA enrollment → verify → BCL stream renders
Idle 35 min → session expires → redirected to /login
Log out → all sessions revoked server-side
Check platform_events for auth event records"
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-178_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Shared cookie config | cookie-config.ts exists, imported by all 3 Supabase clients |
| PG-2 | Cookie maxAge = 8 hours | grep confirms 28800 or 8 * 60 * 60 |
| PG-3 | No 400-day maxAge | grep for 400 * 24 returns zero in src/ |
| PG-4 | signOut scope global | grep confirms scope: 'global' with try/catch fallback |
| PG-5 | Provider-agnostic session cookies | vialuce-session-start and vialuce-last-activity in middleware |
| PG-6 | MFA enrollment page exists | web/src/app/auth/mfa/enroll/page.tsx renders QR code |
| PG-7 | MFA challenge page exists | web/src/app/auth/mfa/verify/page.tsx accepts 6-digit code |
| PG-8 | AAL check in middleware | getAuthenticatorAssuranceLevel called, MFA_REQUIRED_ROLES checked |
| PG-9 | Server auth utility | getServerAuthState() resolves user + profile + AAL |
| PG-10 | Root layout passes auth state | layout.tsx calls getServerAuthState, passes to AuthProvider |
| PG-11 | Auth context receives props | AuthProvider accepts initialAuthState, does NOT read cookies |
| PG-12 | Browser client write-only | createBrowserClient used only for signIn/signOut/mfa, NOT getUser |
| PG-13 | Flywheel Tier 2 fix | Demoted Tier 1 returns tier: 2, match: true (EPG verified) |
| PG-14 | EPG output pasted | Flywheel verification script output in completion report |
| PG-15 | Auth event logging | logAuthEvent called at 7+ points (login/logout/mfa/expiry/denied) |
| PG-16 | Compliance verification | Phase G output pasted — all checks pass |
| PG-17 | npm run build exits 0 | Build clean |
| PG-18 | VL Admin works | platform@vialuce.com login → select-tenant → functional |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Changing session timeout values | LOCKED per DS-019. 30 min idle, 8h absolute. |
| AP-2 | Removing browser Supabase client | Still needed for login/logout/MFA write operations |
| AP-3 | Breaking VL Admin flow | tenant_id NULL, role platform must work |
| AP-4 | Complex MFA UI | Simple QR + input + verify. No wizards. |
| AP-5 | Client-side session enforcement | Server enforces. Client only warns. |
| AP-6 | Auth logging blocking auth flow | try/catch — logging failure never blocks login/logout |
| AP-7 | Modifying RLS policies | auth.uid() chain unchanged |
| AP-8 | Modifying writeFingerprint | Only lookupFingerprint changes for DIAG-010 fix |
| AP-9 | Skipping compliance verification | Phase G is mandatory — Standing Rule 39 |
| AP-10 | Setting httpOnly: true without Phase C | httpOnly requires server-side auth state. Phase C enables it. |

---

## POST-MERGE ACTIONS (Andrew)

1. **Wait 5 minutes** for Vercel deployment
2. **Test in Firefox private browsing:**
   - Navigate to vialuce.ai → should redirect to /login
   - Log in as platform@vialuce.com → should prompt MFA enrollment
   - Complete MFA → should land on /select-tenant or /stream
   - Log in as admin@bancocumbre.ec → should prompt MFA enrollment
   - Complete MFA → should land on BCL /stream
3. **Test idle timeout:**
   - Log in → wait 35 minutes with no interaction → navigate → should redirect to /login
4. **Test signOut:**
   - Log in on Chrome → log in on Firefox → the Chrome session should be terminated (single session)
   - Log out → try to use the same URL → should redirect to /login
5. **Verify audit trail:**
   - Query: `SELECT event_type, payload, created_at FROM platform_events WHERE event_type LIKE 'auth.%' ORDER BY created_at DESC LIMIT 10;`
6. **Lock Decisions 139-143** if all tests pass

---

*ViaLuce.ai — The Way of Light*
*OB-178: "Security is not a feature. It is a property that emerges from architecture." — Decision 123*
*"The rules exist because we learned them the hard way. Arriving at a non-compliant auth environment unknowingly is not acceptable." — Standing Rule 39*
