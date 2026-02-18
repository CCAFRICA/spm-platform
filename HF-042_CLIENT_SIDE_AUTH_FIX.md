# HF-042: AUTH BYPASS — CLIENT-SIDE REDIRECT KILLS THE GATE

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## THE PROBLEM

**P0 — Security. Auth bypass STILL PRESENT after HF-041.**

HF-041 fixed the middleware fail-open bug (env var guard returned `NextResponse.next()` when Supabase env vars were missing). That was a real bug but NOT the production root cause. In production, Vercel has env vars configured, so the middleware was already working.

**The proof:** Andrew sees a momentary FLASH of a redirect page before being sent to the full authenticated platform. This means:
1. Middleware DOES fire and redirect to `/landing` or `/login` — CONFIRMED (the flash)
2. The landing/login page loads momentarily — CONFIRMED (visible for a split second)
3. **Client-side JavaScript on that page immediately redirects INTO the authenticated platform** — THIS IS THE BUG

The browser ends up at `vialuce.ai` showing the GPV wizard with full sidebar, "Welcome to Vialuce, Retail Conglomerate Mexico!", persona switcher, tenant data — all without any login prompt. Incognito window, cleared cache.

**The middleware is not the problem. The client-side auth context is.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT.
4. Final step: `gh pr create --base main --head dev`
5. Commit this prompt to git as first action.

---

## PHASE 0: TRACE THE CLIENT-SIDE REDIRECT

The middleware works. Something in the React app redirects unauthenticated users INTO the platform. Find it.

```bash
echo "============================================"
echo "HF-042 Phase 0: CLIENT-SIDE REDIRECT TRACE"
echo "============================================"

echo ""
echo "=== 0A: EVERY router.push AND router.replace IN THE CODEBASE ==="
grep -rn "router\.push\|router\.replace" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "// " | sort

echo ""
echo "=== 0B: EVERY window.location REDIRECT ==="
grep -rn "window\.location" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "// "

echo ""
echo "=== 0C: EVERY next/navigation redirect() CALL ==="
grep -rn "redirect(" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "// " | grep -v "redirectTo\|redirect_url\|redirect=" | head -20

echo ""
echo "=== 0D: AUTH CONTEXT — FULL FILE ==="
echo "--- Find auth context/provider ---"
find web/src -name "*auth*" -name "*.tsx" -o -name "*auth*" -name "*.ts" | grep -v node_modules | grep -v ".next" | sort
echo ""
echo "--- Read each one (FULL, not just grep) ---"
for f in $(find web/src -name "*auth*" -name "*.tsx" -o -name "*auth*" -name "*.ts" | grep -v node_modules | grep -v ".next"); do
  echo ""
  echo "========== $f =========="
  cat "$f"
done

echo ""
echo "=== 0E: AUTH SHELL — FULL FILE ==="
find web/src -name "*AuthShell*" -o -name "*auth-shell*" -o -name "*ProtectedRoute*" | grep -v node_modules | grep -v ".next" | sort
for f in $(find web/src -name "*AuthShell*" -o -name "*auth-shell*" -o -name "*ProtectedRoute*" | grep -v node_modules | grep -v ".next"); do
  echo ""
  echo "========== $f =========="
  cat "$f"
done

echo ""
echo "=== 0F: ROOT LAYOUT — WHAT WRAPS EVERYTHING? ==="
cat web/src/app/layout.tsx

echo ""
echo "=== 0G: LANDING PAGE — DOES IT REDIRECT? ==="
cat web/src/app/landing/page.tsx 2>/dev/null || echo "No /landing page found"
cat web/src/app/\(public\)/page.tsx 2>/dev/null || echo "No (public)/page.tsx found"
cat web/src/app/page.tsx 2>/dev/null | head -50

echo ""
echo "=== 0H: LOGIN PAGE — DOES IT REDIRECT? ==="
cat web/src/app/login/page.tsx | head -80

echo ""
echo "=== 0I: PUBLIC PATHS IN AUTH SHELL ==="
echo "--- What routes does AuthShell consider 'public'? ---"
grep -rn "public\|PUBLIC\|isPublic\|publicPath\|publicRoute" web/src/ --include="*.tsx" --include="*.ts" | grep -iv "node_modules\|.next\|supabase_url\|supabase_key\|NEXT_PUBLIC" | head -20

echo ""
echo "=== 0J: MIDDLEWARE PUBLIC PATHS ==="
grep -rn "PUBLIC_PATHS\|publicPaths\|isPublic\|\/landing\|\/login\|\/signup" web/src/middleware.ts

echo ""
echo "=== 0K: WHAT HAPPENS WHEN AUTH STATE IS 'LOADING' OR 'NULL'? ==="
echo "--- Does AuthShell render children while loading? Does it render a spinner? Does it redirect? ---"
grep -rn "isLoading\|loading\|isAuthenticated.*false\|!isAuthenticated\|!session\|session.*null\|!user" web/src/ --include="*.tsx" | grep -iv "node_modules\|.next" | grep -i "return\|redirect\|push\|replace\|render\|children" | head -20
```

**CRITICAL: Read the FULL auth context and auth shell files. Do not skim. The bug is a conditional redirect that fires when it shouldn't.**

**Document ALL findings. The root cause is in this diagnostic.**

**Commit:** `HF-042 Phase 0: Client-side redirect trace — auth context and shell analysis`

---

## PHASE 1: IDENTIFY AND FIX THE REDIRECT

Based on Phase 0, you will find ONE of these patterns causing the bypass:

### PATTERN A: AuthProvider redirects to `/` when no session (instead of staying on login/landing)

```typescript
// BUG: This fires on the landing page too, sending users to /
useEffect(() => {
  if (!isLoading && !session) {
    router.push('/');  // ← WRONG — this sends unauthenticated users to root
  }
}, [isLoading, session]);
```

**Fix:** Remove this redirect entirely, or change it to only fire on PROTECTED routes:
```typescript
useEffect(() => {
  if (!isLoading && !session && !isPublicRoute) {
    router.push('/login');  // Redirect to login, not root
  }
}, [isLoading, session, isPublicRoute]);
```

### PATTERN B: AuthShell renders children for ALL routes when session is null (no gate)

```typescript
// BUG: Returns children instead of redirect when not authenticated
if (!isAuthenticated) {
  return children;  // ← WRONG — should redirect to /login
}
```

**Fix:** AuthShell must redirect unauthenticated users on protected routes:
```typescript
if (!isLoading && !isAuthenticated && !isPublicRoute) {
  router.replace('/login');
  return <LoadingSpinner />;  // Show spinner while redirecting
}
if (isPublicRoute) {
  return <>{children}</>;  // Public routes render without auth
}
```

### PATTERN C: Root layout wraps EVERYTHING in AuthProvider, which auto-navigates

The root `layout.tsx` wraps all routes (including `/landing` and `/login`) in `<AuthProvider>`. AuthProvider's `onAuthStateChange` or `initAuth` detects "no session" and fires a redirect that conflicts with the landing page rendering.

**Fix:** Either:
1. Don't wrap public routes in AuthProvider (use route groups)
2. OR make AuthProvider aware of public routes and skip redirects for them:

```typescript
// In AuthProvider
const pathname = usePathname();
const PUBLIC_ROUTES = ['/landing', '/login', '/signup', '/auth/callback'];
const isPublicRoute = PUBLIC_ROUTES.some(r => pathname?.startsWith(r)) || pathname === '/';

// In the redirect logic:
if (!session && !isPublicRoute) {
  router.replace('/login');
}
// If public route — do NOTHING. Don't redirect. Don't navigate. Just render.
```

### PATTERN D: The root page.tsx (`/`) has a redirect that fires before auth check

```typescript
// BUG: page.tsx at / redirects to dashboard before checking auth
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.push('/admin/dashboard');  // ← Fires for everyone, including unauthenticated
  }, []);
}
```

**Fix:** The root page must check auth first:
```typescript
export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.push('/select-tenant');
    }
    // If NOT authenticated, do nothing — let the landing page render
    // The middleware already redirected to /landing, so we shouldn't be here
    // But if we ARE here, don't redirect to the dashboard
  }, [isAuthenticated, isLoading]);
}
```

### PATTERN E: Landing page itself has a useEffect that navigates away

```typescript
// BUG: Landing page component redirects somewhere
useEffect(() => {
  // Check if user is logged in, redirect to dashboard
  if (session) router.push('/');  // This is fine
  // BUT — there might also be:
  router.push('/admin/launch/plan-import');  // ← WRONG — unconditional redirect
}, []);
```

**Fix:** Landing page should ONLY redirect if user IS authenticated. If not authenticated, render the marketing content.

---

### THE UNIVERSAL FIX PRINCIPLE

After identifying the specific pattern, apply this rule across the entire auth flow:

**PUBLIC ROUTES (`/`, `/landing`, `/login`, `/signup`, `/auth/callback`):**
- If authenticated → redirect to `/select-tenant` (existing users don't need landing page)
- If NOT authenticated → RENDER THE PAGE. Do NOT redirect. Do NOT navigate. Just render.

**PROTECTED ROUTES (everything else):**
- If authenticated → render the page
- If NOT authenticated → redirect to `/login`
- If loading → show spinner, do NOT render children, do NOT redirect

### Implementation checklist

After finding and fixing the bug:

```bash
echo "=== VERIFY: No unconditional redirects on public pages ==="
echo "--- Landing page ---"
grep -n "router\.push\|router\.replace\|window\.location\|redirect(" web/src/app/landing/page.tsx 2>/dev/null || echo "No landing page"
grep -n "router\.push\|router\.replace\|window\.location\|redirect(" web/src/app/\(public\)/page.tsx 2>/dev/null || echo "No (public) page"
grep -n "router\.push\|router\.replace\|window\.location\|redirect(" web/src/app/page.tsx 2>/dev/null

echo ""
echo "--- Login page ---"
grep -n "router\.push\|router\.replace\|window\.location\|redirect(" web/src/app/login/page.tsx

echo ""
echo "--- Auth context/provider ---"
grep -n "router\.push\|router\.replace\|window\.location\|redirect(" web/src/contexts/auth*.tsx web/src/contexts/auth*.ts web/src/providers/auth*.tsx 2>/dev/null

echo ""
echo "--- Auth shell ---"
grep -n "router\.push\|router\.replace\|window\.location\|redirect(" web/src/components/auth/AuthShell*.tsx web/src/components/auth/*.tsx 2>/dev/null

echo ""
echo "=== VERIFY: Public routes list includes / and /landing ==="
grep -n "PUBLIC\|public.*route\|public.*path\|isPublic" web/src/ -r --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next"
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | Root cause identified and documented | Commit message describes the exact line(s) | Documented |
| PG-2 | No unconditional redirects on landing page | grep for router.push/replace in landing page | 0 unconditional |
| PG-3 | No unconditional redirects on login page | grep for router.push/replace in login page | Only auth-gated redirects |
| PG-4 | AuthShell/AuthProvider doesn't redirect on public routes | Code review | isPublicRoute check present |
| PG-5 | curl / without cookies returns 200 or 307→/landing | curl test | Not 307→/admin or /dashboard |

**Commit:** `HF-042 Phase 1: Fix client-side auth redirect — [describe exact pattern found]`

---

## PHASE 2: VERIFY

```bash
echo "=== 2A: UNAUTHENTICATED TESTS ==="
echo "--- / returns landing page or redirects to /landing ---"
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}" --max-redirs 0 http://localhost:3000/
echo ""

echo "--- /landing returns 200 ---"
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/landing
echo ""

echo "--- /login returns 200 ---"
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/login
echo ""

echo "--- /signup returns 200 ---"
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/signup
echo ""

echo "--- /admin returns redirect to /login ---"
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}" --max-redirs 0 http://localhost:3000/admin
echo ""

echo "--- /configure returns redirect to /login ---"
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}" --max-redirs 0 http://localhost:3000/configure
echo ""

echo "--- /operate returns redirect to /login ---"
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}" --max-redirs 0 http://localhost:3000/operate
echo ""

echo ""
echo "=== 2B: LANDING PAGE CONTENT (not just status code) ==="
echo "--- First 20 lines of HTML from /landing ---"
curl -s http://localhost:3000/landing | head -20
echo ""
echo "--- Does it contain landing page content? ---"
curl -s http://localhost:3000/landing | grep -c "Vialuce\|Intelligence\|Start Free\|Log In\|landing"
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-6 | /landing returns 200 with content | curl | 200 + landing keywords |
| PG-7 | /login returns 200 | curl | 200 |
| PG-8 | /admin redirects to /login (unauthenticated) | curl | 307 |
| PG-9 | /configure redirects to /login (unauthenticated) | curl | 307 |

**Commit:** `HF-042 Phase 2: Verification — public routes render, protected routes redirect`

---

## PHASE 3: BUILD + COMPLETION REPORT + PR

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-10 | TypeScript: zero errors | `npx tsc --noEmit` exit code | 0 |
| PG-11 | Build: clean | `npm run build` exit code | 0 |
| PG-12 | localhost responds | `curl -s localhost:3000 \| head -1` | HTML content |

### Completion report

Create `HF-042_COMPLETION_REPORT.md` at PROJECT ROOT with all 12 proof gates and terminal evidence.

### Manual browser gates (for Andrew)

| # | Test | Expected |
|---|------|----------|
| M-1 | Incognito → vialuce.ai | Landing page renders — NO sidebar, NO tenant data, NO GPV wizard |
| M-2 | Stay on landing page | Page does NOT redirect away. No flash. Stable render. |
| M-3 | No console errors | Zero 400/500 errors in DevTools |
| M-4 | No Supabase data queries | Network tab shows zero /rest/v1/ calls |
| M-5 | "Start Free" → /signup | Signup form loads |
| M-6 | "Log In" → /login | Login form loads |
| M-7 | Login with platform@vialuce.com | Dashboard loads with sidebar |
| M-8 | After login, vialuce.ai/ → dashboard | Authenticated root goes to platform, not landing |

### Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-042: Fix client-side auth bypass — public routes must not redirect to platform" \
  --body "## Problem
HF-041 fixed middleware fail-open. Auth bypass persists because client-side
JavaScript in [AuthProvider/AuthShell/root page] redirects unauthenticated
users INTO the authenticated platform after the middleware correctly serves
the landing page.

Andrew confirmed: momentary flash of landing page visible before redirect.

## Root Cause
[Exact pattern from Phase 0 — which file, which line, which redirect]

## Fix  
[Description of fix]

## Verification
- curl: /landing returns 200 with marketing content
- curl: /admin returns 307 to /login
- Browser: incognito stays on landing page, zero data queries
- Build: clean, zero TypeScript errors

## Proof Gates: 12 — see HF-042_COMPLETION_REPORT.md"
```

**Commit:** `HF-042 Phase 3: Build verification, completion report, PR`

---

## PROOF GATE SUMMARY (12 gates)

| Range | Mission | Phase | Count |
|-------|---------|-------|-------|
| PG 1-5 | Client-side redirect fix | 0-1 | 5 |
| PG 6-9 | Route verification | 2 | 4 |
| PG 10-12 | Build + verification | 3 | 3 |

---

## ANTI-PATTERNS TO AVOID

- **Do NOT modify the middleware again.** The middleware works. HF-041 confirmed it redirects. The bug is CLIENT-SIDE.
- **Do NOT add new features.** Fix ONE thing: the client-side redirect.
- **The test is BROWSER-BASED:** Open incognito, go to vialuce.ai, and the landing page must STAY VISIBLE. If it flashes and redirects, the bug is not fixed.
- **curl tests are NECESSARY but NOT SUFFICIENT.** curl doesn't execute JavaScript. The bug only manifests in a browser. But curl confirms the server-side behavior is correct.
- **Read the FULL auth context file.** Do not skim for keywords. The bug might be a subtle conditional that looks correct but has a logic error (e.g., `!session` evaluating to false because session is `{}` not `null`).

---

*HF-042 — February 18, 2026*
*"The middleware is the bouncer at the door. But someone inside is waving everybody through."*
