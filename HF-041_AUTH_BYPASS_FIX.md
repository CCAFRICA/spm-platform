# HF-041: AUTH BYPASS — UNAUTHENTICATED USERS SEE PLATFORM

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## THE PROBLEM

**P0 — Security.** An unauthenticated user opening vialuce.ai in an incognito browser (cleared cache, no cookies) lands directly on the authenticated platform with tenant data visible, GPV wizard showing, and full sidebar navigation. No login prompt. No landing page.

**Evidence:** CLT-63 screenshot shows incognito window → vialuce.ai → "Welcome to Vialuce, Retail Conglomerate Mexico!" with sidebar, workspaces, and 112 network requests including tenant data. Network tab shows 400/406/500 errors on period and profile queries.

**Root cause hypothesis:** OB-60 added `/` to the middleware PUBLIC_PATHS to serve the public landing page. But either:
1. The `(public)` route group's page.tsx doesn't exist or doesn't render the landing page
2. Next.js route resolution falls through to the authenticated layout's page.tsx
3. The middleware marks `/` as public but the authenticated layout still renders because there's no separate public layout catching the route

The result: middleware lets `/` through → authenticated layout renders → AuthShell/AuthProvider initializes → somehow gets a session or skips the gate → full platform visible.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT.
4. Final step: `gh pr create --base main --head dev`
5. Commit this prompt to git as first action.

---

## PHASE 0: DIAGNOSTIC — UNDERSTAND THE ROUTING

Before changing anything, map exactly what happens.

```bash
echo "=== 0A: MIDDLEWARE — WHAT PATHS ARE PUBLIC? ==="
cat web/src/middleware.ts 2>/dev/null || cat web/middleware.ts 2>/dev/null

echo ""
echo "=== 0B: ROOT PAGE — WHAT RENDERS AT /? ==="
echo "--- Route group structure ---"
find web/src/app -maxdepth 2 -name "page.tsx" | sort
echo ""
echo "--- (public) route group ---"
find web/src/app -path "*(public)*" -type f | sort
echo ""
echo "--- Root page.tsx ---"
cat web/src/app/page.tsx 2>/dev/null | head -30
echo ""
echo "--- (public)/page.tsx ---"
cat web/src/app/\(public\)/page.tsx 2>/dev/null | head -30

echo ""
echo "=== 0C: LAYOUT CHAIN — WHICH LAYOUT WRAPS /? ==="
echo "--- Root layout ---"
cat web/src/app/layout.tsx | head -40
echo ""
echo "--- (public) layout ---"
cat web/src/app/\(public\)/layout.tsx 2>/dev/null | head -30
echo ""
echo "--- (protected) or (authenticated) layout? ---"
find web/src/app -maxdepth 1 -type d | sort

echo ""
echo "=== 0D: AUTH SHELL — DOES IT GATE OR ALLOW? ==="
grep -rn "isAuthenticated\|isLoading\|AuthShell\|ProtectedRoute\|AuthProvider" web/src/app/layout.tsx | head -10
grep -rn "PUBLIC_PATHS\|publicPaths\|isPublicRoute" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== 0E: CURL TEST — WHAT DOES / RETURN? ==="
# Start dev server first if needed
curl -s -o /dev/null -w "HTTP Status: %{http_code}\nRedirect: %{redirect_url}\n" --max-redirs 0 http://localhost:3000/
echo ""
echo "--- Login page ---"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/login
echo ""
echo "--- Signup page ---"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/signup
```

**Document ALL findings. Commit diagnostic.**

**Commit:** `HF-041 Phase 0: Auth bypass diagnostic — routing and middleware analysis`

---

## PHASE 1: FIX THE ROUTING

Based on Phase 0 findings, apply the appropriate fix. There are three likely scenarios:

### SCENARIO A: No (public) route group exists — landing page is inside authenticated layout

**Fix:** Create proper route group separation:

```
web/src/app/
  (public)/
    page.tsx          ← Public landing page (marketing)
    signup/page.tsx   ← Public signup form
    layout.tsx        ← Clean layout — NO auth shell, NO sidebar
  (authenticated)/
    layout.tsx        ← Auth shell + sidebar + navigation context
    page.tsx          ← Dashboard (authenticated root)
    admin/...
    manager/...
    operate/...
    ...all authenticated routes
  login/page.tsx      ← Login (public, own layout or none)
  auth/callback/route.ts
  api/...
```

Move the current root `page.tsx` (dashboard) into `(authenticated)/page.tsx`.
The `(public)/page.tsx` becomes the landing page.

**CRITICAL:** Next.js route groups with `()` don't affect URL paths. Both `(public)/page.tsx` and `(authenticated)/page.tsx` resolve to `/`. Only ONE can exist. The solution is:

**Option 1 (preferred):** Keep a single root `page.tsx` that checks auth and renders conditionally:

```typescript
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import PublicLandingPage from '@/components/public/LandingPage';

export default async function RootPage() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Authenticated → go to dashboard
    redirect('/select-tenant');
  }

  // Not authenticated → show public landing page
  return <PublicLandingPage />;
}
```

**Option 2:** Use middleware to route differently based on auth:

In middleware.ts, for the `/` path specifically:
```typescript
if (pathname === '/') {
  if (user) {
    // Authenticated user on / → redirect to dashboard
    return NextResponse.redirect(new URL('/select-tenant', request.url));
  } else {
    // Unauthenticated user on / → let through to landing page
    return response;
  }
}
```

### SCENARIO B: (public) route group exists but authenticated layout is ALSO rendering

**Fix:** The root `layout.tsx` likely wraps everything with AuthProvider/AuthShell. The `(public)` layout needs to NOT include auth components.

Check if root `layout.tsx` wraps children in `<AuthProvider>` or `<AuthShell>`. If so:

```typescript
// root layout.tsx — should be minimal
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}  {/* NO AuthProvider here — let route groups handle it */}
      </body>
    </html>
  );
}
```

Then `(authenticated)/layout.tsx` wraps with AuthProvider:
```typescript
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthShell>
        <NavigationContext>
          {children}
        </NavigationContext>
      </AuthShell>
    </AuthProvider>
  );
}
```

And `(public)/layout.tsx` does NOT:
```typescript
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;  // No auth wrapper
}
```

### SCENARIO C: Middleware PUBLIC_PATHS is too broad

**Fix:** Remove `/` from PUBLIC_PATHS. Instead, handle it specifically:

```typescript
// In middleware.ts
const PUBLIC_PATHS = ['/login', '/signup', '/auth/callback', '/api/'];
// NOTE: / is NOT in this list

// Special handling for root
if (pathname === '/') {
  if (!user) {
    // Not authenticated → serve landing page (don't redirect to /login)
    return response;  // Let the page.tsx handle rendering
  }
  // Authenticated → redirect to dashboard
  return NextResponse.redirect(new URL('/select-tenant', request.url));
}
```

**BUT** this requires the root page.tsx to render the landing page for unauthenticated users. If the root page.tsx is inside an authenticated layout that calls AuthProvider → which fires Supabase queries → which causes the 400/500 errors in the network tab → the layout must be changed per Scenario B.

### THE COMBINED FIX (most likely needed)

1. **Middleware:** Keep `/` accessible without login, but also keep `/login`, `/signup`, `/auth/callback` public
2. **Root page.tsx:** Server component that checks `getUser()` — if authenticated redirect to `/select-tenant`, if not render `<PublicLandingPage />`
3. **Root layout.tsx:** Must NOT wrap in AuthProvider unconditionally — only authenticated routes get AuthProvider
4. **Landing page component:** Must be importable without triggering any auth context

### Implementation guidance

```bash
echo "=== FIND WHAT TO MOVE ==="
echo "--- Current page.tsx at root ---"
wc -l web/src/app/page.tsx
echo "--- AuthProvider/AuthShell usage in root layout ---"
grep -n "AuthProvider\|AuthShell\|TenantContext\|NavigationContext" web/src/app/layout.tsx
echo "--- How many routes depend on root layout auth? ---"
find web/src/app -name "page.tsx" | wc -l
```

**KEY PRINCIPLE:** The fix must not break any existing authenticated routes. Every page that currently works behind login must continue to work.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | Root cause identified | Diagnostic output in commit message | Documented |
| PG-2 | Unauthenticated / returns 200 (not redirect) | `curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 localhost:3000/` | 200 |
| PG-3 | Landing page content renders | `curl -s localhost:3000/ \| grep -c "Vialuce\|Intelligence\|Start Free"` | ≥1 |
| PG-4 | No auth queries fire for unauthenticated / | `curl -s localhost:3000/ 2>&1 \| grep -c "supabase\|profiles\|tenants"` | 0 (in HTML) |

**Commit:** `HF-041 Phase 1: Fix auth bypass — [describe which scenario applied]`

---

## PHASE 2: VERIFY AUTH STILL WORKS

After fixing the public route, verify authenticated flows aren't broken.

```bash
echo "=== 2A: UNAUTHENTICATED TESTS ==="
echo "--- / shows landing page ---"
curl -s localhost:3000/ | head -5

echo ""
echo "--- /login shows login form ---"
curl -s -o /dev/null -w "%{http_code}" localhost:3000/login

echo ""
echo "--- /signup shows signup form ---"
curl -s -o /dev/null -w "%{http_code}" localhost:3000/signup

echo ""
echo "--- /admin redirects to login ---"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" --max-redirs 0 localhost:3000/admin

echo ""
echo "--- /operate redirects to login ---"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" --max-redirs 0 localhost:3000/operate

echo ""
echo "--- /upgrade shows page (public or redirect?) ---"
curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 localhost:3000/upgrade

echo ""
echo "=== 2B: API ROUTES STILL WORK ==="
echo "--- Billing checkout API exists ---"
curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/billing/checkout
echo ""
echo "--- Events API exists ---"
curl -s -o /dev/null -w "%{http_code}" localhost:3000/api/platform/events
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-5 | /admin returns 307 to /login (unauthenticated) | curl | 307 |
| PG-6 | /operate returns 307 to /login (unauthenticated) | curl | 307 |
| PG-7 | /login returns 200 | curl | 200 |
| PG-8 | /signup returns 200 | curl | 200 |

**Commit:** `HF-041 Phase 2: Auth verification — public routes serve, protected routes redirect`

---

## PHASE 3: VERIFY IN BROWSER (document for Andrew)

The definitive test is browser-based. Document these checks for Andrew:

### Manual Browser Gates

Open incognito window (no cookies, no cache):

| # | Test | Expected |
|---|------|----------|
| M-1 | Navigate to vialuce.ai | Public landing page with hero, pricing, CTAs |
| M-2 | No sidebar visible | Clean marketing page, no workspace navigation |
| M-3 | No tenant data visible | No "Retail Conglomerate Mexico" or any tenant name |
| M-4 | Console: zero errors | No 400, 406, 500 errors |
| M-5 | Network: zero Supabase data queries | No /rest/v1/profiles, /rest/v1/tenants, etc. |
| M-6 | "Start Free" → /signup | Signup form loads |
| M-7 | "Log In" → /login | Login form loads |
| M-8 | Login as platform@vialuce.com | Dashboard loads with sidebar |
| M-9 | After login, navigate to / | Redirects to /select-tenant (not landing page) |

---

## PHASE 4: BUILD + COMPLETION REPORT + PR

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-9 | TypeScript: zero errors | `npx tsc --noEmit` exit code | 0 |
| PG-10 | Build: clean | `npm run build` exit code | 0 |
| PG-11 | localhost responds | `curl -s localhost:3000 \| head -1` | HTML content |

### Completion report

Create `HF-041_COMPLETION_REPORT.md` at PROJECT ROOT with all 11 proof gates and terminal evidence.

### Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-041: Fix auth bypass — unauthenticated users must see landing page, not platform" \
  --body "## Problem
Unauthenticated users hitting vialuce.ai in incognito see the full authenticated platform
with tenant data, GPV wizard, and sidebar navigation. No login required.

## Root Cause
[from Phase 0 diagnostic]

## Fix
[from Phase 1]

## Verification
- curl: / returns 200 with landing page content
- curl: /admin returns 307 to /login
- Browser: incognito shows marketing page, zero console errors
- Build: clean, zero TypeScript errors

## Proof Gates: 11 — see HF-041_COMPLETION_REPORT.md"
```

**Commit:** `HF-041 Phase 4: Build verification, completion report, PR`

---

## PROOF GATE SUMMARY (11 gates)

| Range | Mission | Phase | Count |
|-------|---------|-------|-------|
| PG 1-4 | Auth fix + landing page | 0-1 | 4 |
| PG 5-8 | Auth verification | 2 | 4 |
| PG 9-11 | Build + verification | 4 | 3 |

---

## ANTI-PATTERNS TO AVOID

- **Do NOT remove the landing page.** The page must still render for unauthenticated users. The fix is routing, not content removal.
- **Do NOT break authenticated routes.** Every page that works behind login today must continue working.
- **Do NOT add features.** This HF fixes ONE thing: the auth bypass. Nothing else.
- **Do NOT restructure the entire auth system.** Minimal, targeted fix.
- **If you move layouts, verify EVERY route still renders.** Route group changes in Next.js can silently break deep links.

---

*HF-041 — February 18, 2026*
*"The front door is open to everyone. The back office is not."*
