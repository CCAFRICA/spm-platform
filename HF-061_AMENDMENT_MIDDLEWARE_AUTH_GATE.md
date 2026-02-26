# HF-061 AMENDMENT: MIDDLEWARE AUTH GATE + TIMEOUT FALLBACK

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `PERSISTENT_DEFECT_REGISTRY.md` — login is still broken

**If you have not read both files, STOP and read them now.**

---

## WHAT HAPPENED

HF-061 (PR #96, merged) fixed the redirect LOOP by:
1. Adding `loadedForTenant` tracking to SessionProvider
2. Gating `useFinancialOnly` on auth state
3. Adding guard comments at 4 redirect points

**The loop is gone. But login is STILL broken.** Here's what the browser network tab shows:

```
vialuce.ai       → 307 redirect
vialuce.ai       → 307 redirect  
operate          → 200 OK         ← THIS IS THE PROBLEM
[46 scripts]     → 200
[loading spinner forever]
```

The middleware is letting unauthenticated users through to `/operate` with a 200. The page renders, loads all scripts, then sits on "Loading..." forever because:
- The auth context tries to get a session
- There is no session (user is not logged in)
- The guard comments from HF-061 prevent the client-side redirect to `/login`
- Nothing ever resolves — the user sees a spinner forever

**The middleware is not doing its job.** Unauthenticated requests to protected routes MUST get a 307 to `/login`. They are currently getting 200.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**

---

## PHASE 0: DIAGNOSTIC — WHY IS MIDDLEWARE NOT GATING?

```bash
echo "============================================"
echo "HF-061 AMENDMENT PHASE 0: MIDDLEWARE AUTH GATE"
echo "============================================"

echo ""
echo "=== 0A: COMPLETE MIDDLEWARE FILE ==="
cat web/src/middleware.ts

echo ""
echo "=== 0B: MIDDLEWARE EXPORT CONFIG ==="
grep -A 30 "export const config" web/src/middleware.ts

echo ""
echo "=== 0C: AUTH SHELL / AUTH CONTEXT ==="
echo "--- Files with 'AuthShell' or 'auth-shell' ---"
find web/src -name "*auth*" -type f | head -10
echo ""
echo "--- auth-shell content ---"
find web/src -name "*auth-shell*" -o -name "*AuthShell*" | head -3 | while read f; do echo "=== $f ==="; cat "$f"; done

echo ""
echo "=== 0D: SESSION CONTEXT (HF-061 modified) ==="
cat web/src/contexts/session-context.tsx 2>/dev/null | head -80

echo ""
echo "=== 0E: AUTH CONTEXT / AUTH PROVIDER ==="
find web/src -name "*auth*context*" -o -name "*auth*provider*" | head -5 | while read f; do echo "=== $f ==="; cat "$f"; done

echo ""
echo "=== 0F: ROOT LAYOUT — HOW AUTH WRAPS THE APP ==="
cat web/src/app/layout.tsx

echo ""
echo "=== 0G: OPERATE LAYOUT ==="
cat web/src/app/operate/layout.tsx 2>/dev/null || echo "No operate/layout.tsx"

echo ""
echo "=== 0H: SUPABASE MIDDLEWARE CLIENT CREATION ==="
grep -rn "createMiddlewareClient\|createServerComponentClient\|createServerClient\|createClient" web/src/middleware.ts
echo ""
echo "--- Supabase utility files ---"
find web/src -path "*supabase*" -name "*.ts" | head -5 | while read f; do echo "=== $f ==="; cat "$f"; done

echo ""
echo "=== 0I: VERIFY THE CURRENT MATCHER PATTERN ==="
echo "Does the matcher include /operate, /perform, /configure, /financial?"
grep -E "matcher|operate|perform|configure|financial" web/src/middleware.ts

echo ""
echo "=== 0J: ENVIRONMENT VARIABLES FOR AUTH ==="
echo "Checking .env files for Supabase URL and anon key..."
grep -l "SUPABASE" web/.env* 2>/dev/null | while read f; do echo "=== $f ==="; grep "SUPABASE" "$f" | sed 's/=.*/=***REDACTED***/'; done

echo ""
echo "=== 0K: CURL TEST — WHAT DOES MIDDLEWARE ACTUALLY RETURN? ==="
cd web && npm run build 2>&1 | tail -5
npm run dev &
sleep 8
echo "--- Testing /operate without auth cookie ---"
curl -v http://localhost:3000/operate 2>&1 | grep -E "< HTTP|< [Ll]ocation|< set-cookie" | head -10
echo ""
echo "--- Testing /login ---"
curl -v http://localhost:3000/login 2>&1 | grep -E "< HTTP|< [Ll]ocation" | head -5
echo ""
echo "--- Testing / ---"
curl -v http://localhost:3000/ 2>&1 | grep -E "< HTTP|< [Ll]ocation" | head -5
kill %1 2>/dev/null
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-061 Amendment Phase 0: Middleware auth gate diagnostic" && git push origin dev`

---

## PHASE 1: FIX MIDDLEWARE AUTH GATE

The middleware MUST do this for every protected route:

1. Create a Supabase server client
2. Call `getUser()` (NOT `getSession()` — `getUser()` is the secure check)
3. If no user → redirect to `/login?redirect={original_path}`
4. If user exists → allow the request through

### The correct middleware pattern:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // AUTH GATE — HF-059/HF-061/HF-061-AMENDMENT
  // This is the ONLY location for auth redirect logic.
  // DO NOT add auth redirects in layouts, components, or other middleware.
  // DO NOT add redirects that fire before auth session hydrates.
  // See: CC Failure Pattern — Login Redirect Loop (4x occurrence)

  const { pathname } = request.nextUrl

  // Skip auth check for public routes
  const publicPaths = ['/login', '/auth', '/api/auth', '/_next', '/favicon.ico']
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Create Supabase client with cookie handling
  let supabaseResponse = NextResponse.next({ request })
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // CRITICAL: Use getUser() not getSession() — getUser() validates with Supabase Auth server
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Not authenticated → redirect to login with return URL
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Authenticated → allow through
  return supabaseResponse
}

export const config = {
  matcher: [
    // Match all routes EXCEPT static files and public paths
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### What to check in the EXISTING middleware:

1. **Is `getUser()` being called?** If it uses `getSession()`, change to `getUser()`
2. **Is the matcher correct?** It must catch `/operate`, `/perform`, `/configure`, `/financial`
3. **Is the redirect actually firing?** Check for early returns or conditions that skip the auth check
4. **Is the Supabase client created correctly?** The `@supabase/ssr` pattern requires proper cookie handling
5. **Are there any try/catch blocks swallowing auth errors?** A failed `getUser()` should redirect to login, not fall through

### Common bugs that cause middleware to not gate:

- `getSession()` returns a stale/cached session even when there is none → use `getUser()` 
- Matcher pattern doesn't match the route → request bypasses middleware entirely
- try/catch around `getUser()` catches the error and calls `NextResponse.next()` → user passes through
- Condition checks `if (user)` instead of `if (!user)` → inverted logic
- Middleware returns `NextResponse.next()` before reaching the auth check → early return

**Fix the middleware based on what Phase 0 reveals. Use the correct pattern above as reference.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-061 Amendment Phase 1: Middleware auth gate fixed" && git push origin dev`

---

## PHASE 2: ADD TIMEOUT FALLBACK IN AUTH SHELL

The middleware is the primary gate. But as defense-in-depth, the client-side auth wrapper should have a timeout:

- If auth session hasn't hydrated after **3 seconds**, redirect to `/login`
- This catches edge cases where middleware passes but the session cookie is invalid/expired
- This does NOT fire immediately (which caused the original loop) — it waits 3 seconds

Find the auth shell / auth wrapper component (likely `AuthShell`, `AuthProvider`, or the root layout's auth check) and add:

```typescript
// TIMEOUT FALLBACK — HF-061 Amendment
// If auth hasn't resolved after 3 seconds, assume unauthenticated.
// This is defense-in-depth — middleware is the primary gate.
// The 3s delay prevents the redirect loop that occurred when this fired immediately.
useEffect(() => {
  if (!isLoading) return // Auth resolved, no timeout needed
  
  const timeout = setTimeout(() => {
    if (!user && !isLoading) return // Already resolved
    // Still loading after 3s — likely no valid session
    console.warn('[AuthShell] Auth timeout — redirecting to login')
    router.replace('/login')
  }, 3000)
  
  return () => clearTimeout(timeout)
}, [isLoading, user, router])
```

**IMPORTANT:** Do NOT remove the existing guard comments from HF-061. The timeout is an addition, not a replacement. The guard comments prevent immediate redirects. The timeout provides a delayed fallback.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-061 Amendment Phase 2: Auth timeout fallback added" && git push origin dev`

---

## PHASE 3: VERIFY

### 3A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 3B: Auth Gate Test

```bash
npm run dev &
sleep 8

echo "=== TEST 1: /operate without auth → must get 307 to /login ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" http://localhost:3000/operate

echo "=== TEST 2: /perform without auth → must get 307 to /login ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" http://localhost:3000/perform

echo "=== TEST 3: /financial without auth → must get 307 to /login ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" http://localhost:3000/financial

echo "=== TEST 4: /configure without auth → must get 307 to /login ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" http://localhost:3000/configure

echo "=== TEST 5: /login → must get 200 (no redirect) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/login

echo "=== TEST 6: / → check behavior ==="
curl -v http://localhost:3000/ 2>&1 | grep -E "< HTTP|< [Ll]ocation" | head -5

kill %1 2>/dev/null
```

**Expected results:**
- Tests 1-4: HTTP 307 → contains `/login` in redirect URL
- Test 5: HTTP 200
- Test 6: Either 307 to /login or 307 to /operate (which then 307s to /login)

**If ANY of Tests 1-4 return 200 instead of 307, THE FIX DID NOT WORK. Go back to Phase 1.**

### PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Middleware gates /operate | curl returns 307 to /login |
| PG-2 | Middleware gates /perform | curl returns 307 to /login |
| PG-3 | Middleware gates /financial | curl returns 307 to /login |
| PG-4 | Middleware gates /configure | curl returns 307 to /login |
| PG-5 | /login returns 200 | No redirect on login page |
| PG-6 | Timeout fallback exists | Auth shell has 3s timeout |
| PG-7 | `npm run build` exits 0 | Clean build |
| PG-8 | Guard comments preserved | HF-061 guard comments still present |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-061 Amendment Phase 3: Verified — middleware gates all protected routes" && git push origin dev`

---

## PHASE 4: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-061 Amendment: Middleware auth gate + timeout fallback" \
  --body "## Problem
HF-061 fixed the redirect loop but middleware was not gating unauthenticated users.
/operate returned 200 without auth, causing an infinite loading spinner.

## Root Cause
[FROM PHASE 0 — describe what was wrong with middleware]

## Fixes
1. Middleware now properly calls getUser() and redirects to /login when unauthenticated
2. Auth shell has 3-second timeout fallback as defense-in-depth
3. Guard comments from HF-061 preserved

## Verification
- /operate without auth: 307 → /login ✅
- /perform without auth: 307 → /login ✅
- /financial without auth: 307 → /login ✅
- /configure without auth: 307 → /login ✅
- /login: 200 ✅
- Build: PASS ✅

## CC Failure Pattern Update
This is the 4th login auth occurrence:
1. Pre-OB-97: unknown cause
2. Post-OB-97: HF-059 fixed redirect loop (Pattern A-E)
3. Post-PR#94: HF-061 fixed stale session + useFinancialOnly race
4. Post-HF-061: This amendment — middleware not gating

Root cause chain: redirect loop fix → removed client-side redirects →
exposed that middleware was never properly gating → infinite spinner.
Each fix peeled back a layer to reveal the next issue."
```

---

## SCOPE BOUNDARIES

### IN SCOPE
- Middleware auth gate — make it actually redirect unauthenticated users
- Auth shell timeout fallback (3 seconds)
- Preserving all HF-061 guard comments and fixes

### OUT OF SCOPE — DO NOT TOUCH
- useFinancialOnly logic (HF-061 fixed this — leave it)
- SessionProvider loadedForTenant (HF-061 fixed this — leave it)
- Navigation, sidebar, page content
- Financial module pages
- Any feature work

---

*ViaLuce.ai — The Way of Light*
*HF-061 Amendment: The middleware was the unlocked front door the whole time.*
