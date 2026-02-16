# HF-028: Fix Auth Middleware — Unauthenticated Users Must See Login

**Autonomy Directive: Execute all phases without stopping for confirmation. NEVER ask yes/no questions. If uncertain, make the safe choice and document it. Do NOT stop between phases.**

## THE PROBLEM

**vialuce.ai allows unauthenticated users to reach the dashboard.** Opening a fresh incognito window and navigating to vialuce.ai renders the full dashboard with "Welcome back, User!" and "Associate" role — with no login screen ever appearing. Console shows a 500 error from Supabase because there's no session.

This is the ONLY problem. Fix this ONE thing: unauthenticated requests to any page except `/login` must redirect to `/login`.

## CONTEXT

This auth flow has been debugged across HF-023, HF-024, HF-025, HF-026, and HF-027. The components exist but something in the middleware chain is broken. We need a forensic diagnostic first, then a surgical fix.

**What works:** Supabase Auth itself works. Users can sign in with email/password. Profile queries work. RLS policies work. The login PAGE works when you navigate to it directly.

**What's broken:** The middleware is not blocking unauthenticated requests. Users bypass login entirely and hit the dashboard with no session.

## STANDING RULES
1. Commit + push after every change
2. After every commit: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
3. All work via OB/HF prompts. Prompt committed to git before work begins.
4. Reports and proof gates at PROJECT ROOT only
5. Final step: `gh pr create --base main --head dev`

## PHASE 0: FORENSIC DIAGNOSTIC (NO CODE CHANGES)

This is the most important phase. Understand the EXACT state before touching anything.

### 0A: Middleware Existence and Configuration

```bash
# Does middleware.ts exist? Where?
find web/src -name "middleware.ts" -o -name "middleware.js" | head -20
find web -maxdepth 1 -name "middleware.ts" -o -name "middleware.js" | head -20

# What's the matcher config? This determines which routes the middleware runs on.
cat web/src/middleware.ts 2>/dev/null || cat web/middleware.ts 2>/dev/null

# Is there a next.config that affects middleware?
grep -r "middleware" web/next.config.* 2>/dev/null
```

### 0B: Auth Context and Layout Guards

```bash
# What does the auth context/provider look like?
find web/src -name "auth-context*" -o -name "auth-provider*" -o -name "AuthContext*" | head -10
# Read each one found

# What does the root layout look like? Is there an auth guard wrapper?
cat web/src/app/layout.tsx

# What does the auth shell / protected layout look like?
find web/src -name "auth-shell*" -o -name "protected*layout*" | head -10
# Read each one found

# Is there a route group like (protected) or (authenticated)?
find web/src/app -type d -name "*protected*" -o -name "*auth*" | head -10
ls web/src/app/
```

### 0C: Login Page Flow

```bash
# Where is the login page?
find web/src -path "*/login/page*" | head -5
cat $(find web/src -path "*/login/page*" | head -1)

# What happens after successful login? Where does it redirect?
grep -rn "redirect\|router.push\|router.replace\|window.location" web/src/app/login/ 2>/dev/null
```

### 0D: Supabase Client Configuration

```bash
# How is the Supabase client created for middleware?
find web/src -name "client.ts" -path "*/supabase/*" | head -5
# Read each one

# Is there a server client vs browser client distinction?
find web/src -name "*server*" -path "*/supabase/*" | head -5
grep -rn "createServerClient\|createMiddlewareClient\|createBrowserClient" web/src/lib/ 2>/dev/null
```

### 0E: Test the Auth Flow Locally

```bash
# Start dev server and test what happens with NO cookies/session
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3000/
# Expected: 307 http://localhost:3000/login
# If 200: middleware is NOT blocking

# Test the login page directly
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
# Expected: 200

# Test the health endpoint
curl -s http://localhost:3000/api/health/auth 2>/dev/null | head -20
```

**Document ALL findings before proceeding. Commit as diagnostic.**

**Commit:** `HF-028 Phase 0: Auth middleware diagnostic`

---

## PHASE 1: FIX THE MIDDLEWARE

Based on Phase 0 findings, apply the correct fix. The requirements are simple:

### Requirements (non-negotiable)

1. **Unauthenticated users hitting ANY route except `/login` and `/api/` must be redirected to `/login`**
2. **The login page itself must NOT require auth (no redirect loop)**
3. **Static assets (_next, favicon, images) must NOT be intercepted**
4. **After successful login, users go to `/select-tenant` (platform admin) or `/` (tenant users)**

### If middleware.ts exists but isn't working:

The most common failures:
- **Matcher config too narrow** — not matching all routes
- **getSession() vs getUser()** — `getSession()` can return stale data; `getUser()` is authoritative
- **Not calling `response = supabase.auth.getUser()`** — some implementations create the client but never check auth
- **Returning NextResponse.next() on all paths** — the redirect is conditional but the condition is wrong

### If middleware.ts doesn't exist or is a no-op:

Create `web/src/middleware.ts` (or `web/middleware.ts` depending on Next.js app structure — check where `next.config` lives):

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth check for public paths
  const publicPaths = ['/login', '/api/'];
  const isPublic = publicPaths.some(p => pathname.startsWith(p));
  
  // Skip static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.')) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response = NextResponse.next({ request: { headers: request.headers } });
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // IMPORTANT: Use getUser() not getSession() — getUser() validates with Supabase server
  const { data: { user }, error } = await supabase.auth.getUser();

  // Not authenticated and not on a public path → redirect to login
  if (!user && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but on login page → redirect to home
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
```

### CRITICAL: Verify the matcher

The `config.matcher` is what determines which routes the middleware even RUNS on. If this is wrong, the middleware is invisible. The pattern above catches everything except Next.js internals.

**After implementing, test immediately:**

```bash
# Kill dev server, rebuild, restart
# Then test unauthenticated access:
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
# MUST return: 307 http://localhost:3000/login

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
# MUST return: 200
```

If curl shows 200 for `/` instead of 307, the middleware is still not running. Check:
1. Is the file in the right location? (Next.js expects `middleware.ts` at project root OR in `src/`)
2. Is `config.matcher` exported?
3. Are there TypeScript errors preventing middleware compilation?

**Commit:** `HF-028 Phase 1: Fix auth middleware to enforce login`

---

## PHASE 2: VERIFY AUTH FLOW END-TO-END

### 2A: Unauthenticated Tests

```bash
# Root → login redirect
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
# Expected: 307 → /login

# Deep link → login redirect with return URL
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/insights/analytics
# Expected: 307 → /login?redirect=/insights/analytics

# Login page renders
curl -s http://localhost:3000/login | grep -o "Sign In" | head -1
# Expected: Sign In

# API routes still work
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health/auth
# Expected: 200
```

### 2B: Authenticated Tests

```bash
# Sign in and capture session cookies
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const { data, error } = await sb.auth.signInWithPassword({
  email: 'platform@vialuce.com',
  password: 'demo-password-VL1'
});
if (error) { console.error('AUTH FAILED:', error.message); process.exit(1); }
console.log('ACCESS TOKEN:', data.session?.access_token?.substring(0, 50) + '...');
console.log('Auth works. Platform user can sign in.');
await sb.auth.signOut();
"
```

### 2C: Browser Test (Manual — Document Results)

Open localhost:3000 in an incognito browser window:
1. Should see login page immediately (not dashboard)
2. Sign in as platform@vialuce.com / demo-password-VL1
3. Should route to tenant selector or dashboard
4. Console should show zero 500 errors
5. "Welcome back" should show display name, not "User"

Document what happens at each step.

**Commit:** `HF-028 Phase 2: Auth flow verification`

---

## PHASE 3: AUTOMATED CLT + COMPLETION

### 3A: CLT Script

Create `web/scripts/clt-hf028-verify.ts`:

Gates:
1. middleware.ts exists and exports config.matcher
2. matcher pattern catches root path
3. matcher pattern catches deep paths
4. matcher excludes _next/static
5. matcher excludes login
6. middleware checks supabase.auth.getUser()
7. middleware redirects when no user
8. middleware passes through when user exists
9. login page does not require auth
10. curl to localhost:3000/ returns 307 (not 200)
11. curl to localhost:3000/login returns 200
12. curl to localhost:3000/api/health/auth returns 200

### 3B: Completion Report

Create `HF-028_COMPLETION_REPORT.md` at PROJECT ROOT:
- Phase 0 findings (what was wrong)
- Phase 1 fix (what changed)
- Phase 2 test results
- Phase 3 CLT gate count

### 3C: PR

```bash
git add -A && git commit -m "HF-028 Phase 3: CLT verification + completion report"
git push origin dev
gh pr create --base main --head dev --title "HF-028: Fix auth middleware — unauthenticated users must see login" --body "Root cause: [from Phase 0 findings]. Fix: [from Phase 1]. Verified: [gate count] gates pass."
```

## ANTI-PATTERNS TO AVOID

- **Do NOT add new features.** This HF fixes ONE thing: unauthenticated access bypass. Nothing else.
- **Do NOT restructure the auth system.** The login page, profile lookup, RLS policies all work. Only the middleware gate is broken.
- **Do NOT modify Supabase configuration.** The database side is correct after HF-027 + migration 005.
- **Do NOT change passwords, profiles, or tenant data.** Data layer is stable.
- **Do NOT use getSession() in middleware.** Use getUser() — it validates with the Supabase server, not just local token state.
- **If you find the middleware file exists and looks correct, check the FILE LOCATION.** Next.js is very specific about where middleware.ts must live. If it's in the wrong directory, it's invisible.
