# HF-136: AUTHENTICATION ENFORCEMENT — UNAUTHENTICATED ACCESS TO PRODUCTION DATA

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

**SEVERITY: P0 — SECURITY. Production platform accessible without authentication.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root
2. `SCHEMA_REFERENCE_LIVE.md` — for any auth-related column references
3. `PRE_PROMPT_COMPLIANCE_DIRECTIVE.md`

---

## WHY THIS HF EXISTS

CLT-172 post-deploy verification: a fresh incognito window (no cookies, no session, no login) navigated to vialuce.ai and rendered the full Perform dashboard with live Meridian data (MX$185,063, 79 entities, lifecycle stepper, AI governance intelligence). No login prompt. No redirect to /login.

**This means unauthenticated users can see production tenant data.** This is the highest severity security issue possible in a multi-tenant platform.

The console shows `tenant-config 403 (Forbidden)` — the API layer IS checking auth. But the page itself renders with data, meaning either:
- The middleware allows unauthenticated requests through to page rendering
- The page uses server-side data fetching with service role (bypassing auth entirely)
- Or both

**Prior art:** CLT122-F2 documented "Auth login bypassed in incognito" as OPEN. HF-059 and HF-061 addressed login redirect loops. OB-168 (PR #237) restructured middleware to capability-based. The auth gap may have existed before this session but was not previously classified as P0.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **This is a SECURITY fix. Do not introduce new features. Fix the auth gap only.**

---

## PHASE 0: DIAGNOSTIC — TRACE THE AUTH CHAIN (Zero Code Changes)

### 0A: Map the Middleware

```bash
# Find the middleware file
find web/src -name "middleware.ts" -o -name "middleware.js" | sort
cat web/src/middleware.ts 2>/dev/null || cat web/middleware.ts 2>/dev/null

# If middleware is in a different location
find web -name "middleware*" -not -path "*/node_modules/*" | sort
```

**Paste the COMPLETE middleware file.** The critical question: does it check for a valid Supabase auth session BEFORE checking capabilities?

### 0B: Check Auth Session Verification

```bash
# How does the middleware verify auth?
grep -rn "auth\|session\|getUser\|getSession\|supabase.*auth\|createMiddleware\|createServerClient" \
  web/src/middleware.ts web/middleware.ts 2>/dev/null

# Is there a Supabase middleware helper?
grep -rn "createMiddlewareClient\|createServerClient\|auth.getUser\|auth.getSession" \
  web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20
```

### 0C: Check RequireCapability — Does It Assume Auth?

```bash
# Find RequireCapability implementation
grep -rn "RequireCapability\|requireCapability" web/src/ --include="*.ts" --include="*.tsx" | head -10

# Read the implementation
find web/src -name "permissions.ts" -o -name "require-capability*" -o -name "RequireCapability*" | sort
```

**Key question:** Does RequireCapability check `if (!session) redirect('/login')` or does it assume a session exists?

### 0D: Check Page-Level Data Fetching

```bash
# How does /perform page get data? Server component? Client component?
cat web/src/app/perform/page.tsx 2>/dev/null | head -50
cat web/src/app/\(authenticated\)/perform/page.tsx 2>/dev/null | head -50

# Find server-side data fetching
grep -rn "createServerClient\|SERVICE_ROLE\|service.role" \
  web/src/app/perform/ web/src/app/stream/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -20

# Check if pages are in an (authenticated) route group
ls -la web/src/app/\(authenticated\)/ 2>/dev/null
find web/src/app -name "layout.tsx" -exec grep -l "auth\|session\|redirect\|login" {} \;
```

### 0E: Check Route Group Auth Layout

Next.js uses route groups like `(authenticated)` with layouts that enforce auth. Check if this pattern exists:

```bash
# Is there an auth-enforcing layout?
grep -rn "redirect.*login\|auth.*getUser\|session.*redirect" \
  web/src/app/*/layout.tsx web/src/app/layout.tsx 2>/dev/null | head -10

# Check the app-level layout
cat web/src/app/layout.tsx | head -30
```

### 0F: Check Supabase Client Configuration

```bash
# How is the Supabase browser client created?
grep -rn "createBrowserClient\|createClient.*supabase\|NEXT_PUBLIC_SUPABASE" \
  web/src/lib/ --include="*.ts" | head -10

# Is there a session persistence config?
grep -rn "persistSession\|storage.*cookie\|cookieOptions" \
  web/src/ --include="*.ts" | grep -v node_modules | head -10
```

### 0G: Document Root Cause

Based on all diagnostic output, answer these questions in the completion report:

1. **Does the middleware check for auth?** YES/NO. If yes, what happens when auth fails?
2. **Does RequireCapability assume auth exists?** YES/NO. If yes, what happens with no session?
3. **Do pages use service role for data fetching?** YES/NO. If yes, they bypass RLS regardless of auth.
4. **Is there a route group layout that enforces auth?** YES/NO. If yes, which routes are covered?
5. **What is the EXACT path that allows an unauthenticated request to render data?**

**Commit:** `git add -A && git commit -m "HF-136 Phase 0: Auth chain diagnostic — tracing unauthenticated access" && git push origin dev`

---

## PHASE 1: FIX — ENFORCE AUTHENTICATION

### Fix Strategy

The fix must be layered (defense in depth):

**Layer 1: Middleware (First Gate)**

The middleware must be the first line of defense. Every request to any route OTHER than `/login`, `/auth/callback`, and static assets must have a valid Supabase session. If not → redirect to `/login`.

```typescript
// middleware.ts — AUTHENTICATION MUST BE FIRST
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require auth
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/auth/confirm', '/favicon.ico'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip auth check for public routes and static assets
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route)) || pathname.startsWith('/_next/')) {
    return NextResponse.next();
  }
  
  // Create Supabase client for middleware
  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookies) { cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); },
      },
    }
  );
  
  // CHECK AUTH — THIS IS THE CRITICAL GATE
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (!user || error) {
    // No valid session → redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // User authenticated — proceed to capability checks if needed
  // ... (existing RequireCapability logic goes AFTER this point)
  
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

**CRITICAL:** The `getUser()` call validates the JWT server-side against Supabase. It is NOT a client-side check. An expired, missing, or forged token will fail.

**Layer 2: Page-Level Auth Guard**

If any page fetches data server-side (server components), it must also verify auth:

```typescript
// In any server component that fetches data
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';

export default async function ProtectedPage() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }
  
  // Now safe to fetch data — use browser client (RLS enforced)
  // NOT service role
}
```

**Layer 3: Client Component Auth Context**

If pages use client components that call Supabase directly, the auth context provider should redirect on session expiry:

```typescript
// Ensure the auth context redirects on null session
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      router.push('/login');
    }
  });
  return () => subscription.unsubscribe();
}, []);
```

### Implementation Rules

1. **Do NOT break VL Admin access.** VL Admin (tenant_id NULL, role='platform') must still authenticate via login.
2. **Do NOT break the persona switcher.** Persona switching changes the view context, not the auth session.
3. **Do NOT introduce a login redirect loop.** The login page itself must be excluded from the auth check. This was the bug in HF-059/HF-061.
4. **Preserve the `redirectTo` parameter.** After login, redirect the user back to where they were trying to go.
5. **Test in incognito.** The proof is: fresh incognito window → vialuce.ai → redirected to /login. No data visible.

### Anti-Pattern Check

- **FP-74 (Fix present but unreachable):** The auth check must be the FIRST thing in middleware, not nested inside a conditional that might not execute.
- **HF-059/061 pattern:** Login redirect loops were caused by the middleware redirecting /login to /login. The PUBLIC_ROUTES exclusion prevents this.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Root cause documented | Exact code path that allows unauthenticated rendering |
| PG-2 | Middleware checks auth FIRST | `getUser()` before any capability check |
| PG-3 | No-session → redirect /login | Middleware redirects unauthenticated requests |
| PG-4 | /login excluded from auth check | No redirect loop |
| PG-5 | /auth/callback excluded | OAuth flow not broken |
| PG-6 | Static assets excluded | /_next/ paths not intercepted |
| PG-7 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "HF-136 Phase 1: Auth enforcement — middleware requires valid session" && git push origin dev`

---

## PHASE 2: BROWSER VERIFICATION

### 2A: Incognito Test (The Critical Test)

1. Open a NEW incognito window (fresh, no cookies, no localStorage)
2. Navigate to `localhost:3000` (dev) or `vialuce.ai` (production after deploy)
3. **EXPECTED:** Redirected to /login. No data visible. No dashboard. No tenant information.
4. Navigate directly to `localhost:3000/perform` — **EXPECTED:** Redirected to /login
5. Navigate directly to `localhost:3000/stream` — **EXPECTED:** Redirected to /login
6. Navigate directly to `localhost:3000/operate` — **EXPECTED:** Redirected to /login
7. Navigate directly to `localhost:3000/operate/calculate` — **EXPECTED:** Redirected to /login

### 2B: Authenticated Test (Must Still Work)

1. On the /login page, login as Patricia (BCL admin)
2. **EXPECTED:** Redirected to /stream (or the redirectTo path)
3. Navigate to /perform/statements — data renders
4. Navigate to /stream — $44,590 visible
5. Logout — redirected to /login
6. Navigate to /stream — redirected to /login (session expired)

### 2C: VL Admin Test

1. Login as platform@vialuce.com
2. **EXPECTED:** Can switch between tenants, see all data
3. No auth errors in console

### 2D: Meridian Regression

1. Login as Meridian admin (if available) or switch to Meridian as VL Admin
2. **EXPECTED:** MX$185,063 visible
3. No auth errors

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-8 | Incognito → /login redirect | No data visible without auth |
| PG-9 | Direct URL /perform → /login | Cannot bypass by typing URL |
| PG-10 | Direct URL /stream → /login | Cannot bypass |
| PG-11 | Direct URL /operate → /login | Cannot bypass |
| PG-12 | Login works | Patricia can authenticate |
| PG-13 | Post-login data renders | /stream shows $44,590 |
| PG-14 | Logout → /login | Session cleared |
| PG-15 | Post-logout → /login redirect | Cannot access pages after logout |
| PG-16 | VL Admin access works | Can switch tenants |
| PG-17 | No login redirect loop | /login does not redirect to /login |

**Commit:** `git add -A && git commit -m "HF-136 Phase 2: Auth verification — incognito + authenticated + VL Admin" && git push origin dev`

---

## PHASE 3: COMPLETION REPORT + PR

Create `HF-136_COMPLETION_REPORT.md` at project root:

```markdown
# HF-136: Authentication Enforcement — Completion Report

## Status: [COMPLETE / PARTIAL / FAILED]

## Phase 0: Root Cause
- Middleware auth check: [present / missing / conditional]
- RequireCapability auth assumption: [checks / assumes]
- Page data fetching: [browser client / service role / mixed]
- Route group auth layout: [exists / missing]
- Root cause: [exact description of why unauthenticated requests render data]
- Code path: [file:line → file:line → renders without auth]

## Phase 1: Fix
- Middleware change: [description]
- Page-level change: [description, if any]
- Auth context change: [description, if any]
- Login redirect loop prevention: [how /login is excluded]

## Phase 2: Verification
- Incognito → /login: [YES/NO]
- /perform direct → /login: [YES/NO]
- /stream direct → /login: [YES/NO]
- Login works: [YES/NO]
- Post-login data: [YES/NO]
- Logout → /login: [YES/NO]
- VL Admin: [YES/NO]
- No redirect loop: [YES/NO]

## Proof Gates Summary
[PG-1 through PG-17: PASS/FAIL]
```

### PR

```bash
gh pr create --base main --head dev \
  --title "HF-136: Authentication Enforcement — Block Unauthenticated Access to Production Data" \
  --body "## SECURITY FIX

### Problem
Unauthenticated users could access production tenant data (MX\$185,063 Meridian data visible in incognito).

### Root Cause
[from diagnostic]

### Fix
- Middleware enforces auth.getUser() as FIRST gate on every request
- No-session → redirect to /login with redirectTo parameter
- Public routes excluded: /login, /auth/callback, static assets
- [Additional fixes if needed]

### Verification
- Incognito window → redirected to /login (no data visible)
- Authenticated user → normal access
- VL Admin → cross-tenant access preserved
- No login redirect loops

## Proof Gates: see HF-136_COMPLETION_REPORT.md"
```

**Commit:** `git add -A && git commit -m "HF-136 Phase 3: Completion report + PR" && git push origin dev`

---

## PRODUCTION VERIFICATION — FOR ANDREW (Post-Merge, HIGHEST PRIORITY)

After merging and Vercel deploys:

1. **Open incognito window**
2. **Navigate to vialuce.ai** — MUST redirect to login
3. **Navigate to vialuce.ai/perform** — MUST redirect to login
4. **Navigate to vialuce.ai/stream** — MUST redirect to login
5. **Login as Patricia** — MUST see BCL data
6. **Login as VL Admin** — MUST see all tenants

**If step 1-3 show ANY data, the fix is incomplete. Do not proceed with any other work.**

---

*HF-136 — March 15, 2026*
*"Authentication is not a feature. It is a prerequisite for everything else."*
*vialuce.ai — Intelligence. Acceleration. Performance.*
