# HF-041: AUTH BYPASS + PLAN IMPORT UUID FIX

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## THE PROBLEMS

### Problem 1: Auth Bypass (P0 — Security)

An unauthenticated user opening vialuce.ai in an incognito browser (cleared cache, no cookies) lands directly on the authenticated platform with tenant data visible, GPV wizard showing, and full sidebar navigation. No login prompt. No landing page.

**Evidence:** CLT-63 screenshot shows incognito window → vialuce.ai → "Welcome to Vialuce, Retail Conglomerate Mexico!" with sidebar, workspaces, and 112 network requests including tenant data. Network tab shows 400/406/500 errors on period and profile queries.

**Root cause hypothesis:** OB-60 added `/` to the middleware PUBLIC_PATHS to serve the public landing page. But either:
1. The `(public)` route group's page.tsx doesn't exist or doesn't render the landing page
2. Next.js route resolution falls through to the authenticated layout's page.tsx
3. The middleware marks `/` as public but the authenticated layout still renders because there's no separate public layout catching the route

The result: middleware lets `/` through → authenticated layout renders → AuthShell/AuthProvider initializes → somehow gets a session or skips the gate → full platform visible.

### Problem 2: Plan Import UUID (P0 — Functional)

Plan import fails with: `"Failed to import plan — invalid input syntax for type uuid: 'VL Platform Admin'"`. The import sends the user's `display_name` string where a UUID is required. The AI interpretation completes successfully (94% confidence, 7 components, worked examples) but the final save fails.

**Evidence:** CLT-63 screenshot shows the error banner at top of plan-import page. Network tab shows 500 on the import API call. This is the same class of bug OB-61 Phase 0 was supposed to fix (sending display_name instead of tenant.id), but either the fix missed a code path or a second code path exists that still sends the wrong value.

**Root cause hypothesis:** The plan import "Confirm & Import" action sends `profile.display_name` or `user.display_name` instead of `tenant.id` (UUID) to the plan storage API. There may be multiple places where this value is sourced — the OB-61 fix may have caught one but not all.

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

## PHASE 2: FIX PLAN IMPORT UUID

The plan import "Confirm & Import" button sends a display_name string where a UUID is expected. Find every code path that sends the wrong value.

### 2A: Diagnostic — trace the value

```bash
echo "=== PLAN IMPORT API ROUTE ==="
find web/src/app/api -path "*plan*import*" -name "route.ts" | head -5
find web/src/app/api -path "*plan*" -name "route.ts" | sort

echo ""
echo "=== WHAT GETS SENT AS TENANT ID? ==="
for f in $(find web/src/app/api -path "*plan*" -name "route.ts"); do
  echo "--- $f ---"
  grep -n "tenant_id\|tenantId\|tenant\.id\|created_by\|user_id\|userId\|display_name" "$f" | head -10
done

echo ""
echo "=== PLAN IMPORT UI — WHAT DOES THE CLIENT SEND? ==="
find web/src -path "*plan*import*" -name "*.tsx" | head -5
for f in $(find web/src -path "*plan*import*" -name "*.tsx"); do
  echo "--- $f ---"
  grep -n "tenant_id\|tenantId\|tenant\.id\|created_by\|user_id\|profile\.\|currentTenant\|display_name" "$f" | head -10
done

echo ""
echo "=== PLAN INTERPRETATION / CONFIRM HANDLER ==="
grep -rn "confirm.*import\|handleConfirm\|handleImport\|savePlan\|insertPlan" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== OB-61 FIX — DID IT LAND? ==="
# The OB-61 fix was supposed to send tenant.id not display_name
git log --oneline --all | grep -i "uuid\|plan.*import\|HF.*uuid\|OB-61" | head -10
```

### 2B: Fix every occurrence

The error message says `'VL Platform Admin'` — that's a `display_name` from the profiles table. Search for every place this value could be injected:

```bash
echo "=== EVERY REFERENCE TO display_name IN PLAN FLOW ==="
grep -rn "display_name\|displayName" web/src/ --include="*.tsx" --include="*.ts" | grep -iv "node_modules\|.next\|// " | grep -i "plan\|import\|rule_set\|created_by" | head -15

echo ""
echo "=== EVERY REFERENCE TO created_by IN PLAN FLOW ==="
grep -rn "created_by" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15
```

**The fix pattern:** Every Supabase insert/update that takes a `tenant_id`, `user_id`, or `created_by` field MUST use a UUID from the auth context — never a display name. Specifically:

- `tenant_id` → `currentTenant.id` (UUID from tenant context)
- `user_id` or `created_by` → `session.user.id` (UUID from Supabase auth)
- NEVER `profile.display_name`, `user.email`, `tenant.name`, or any string field

Apply the fix to every code path found. If the client sends the wrong value, fix the client. If the API extracts the wrong field, fix the API.

### 2C: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-5 | Zero display_name in plan insert/update paths | `grep -rn "display_name" web/src/app/api/*plan*/ --include="*.ts" \| grep -c "insert\|update\|created_by"` | 0 |
| PG-6 | Plan import API uses UUID for tenant_id | `grep -n "tenant_id\|tenantId" web/src/app/api/plan/import/route.ts \| head -5` | Shows UUID source |
| PG-7 | Plan import API uses UUID for created_by | `grep -n "created_by\|user_id" web/src/app/api/plan/import/route.ts \| head -5` | Shows UUID source |

**Commit:** `HF-041 Phase 2: Fix plan import UUID — display_name replaced with tenant.id and user.id`

---

## PHASE 3: VERIFY AUTH STILL WORKS

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
| PG-8 | /admin returns 307 to /login (unauthenticated) | curl | 307 |
| PG-9 | /operate returns 307 to /login (unauthenticated) | curl | 307 |
| PG-10 | /login returns 200 | curl | 200 |
| PG-11 | /signup returns 200 | curl | 200 |

**Commit:** `HF-041 Phase 3: Auth verification — public routes serve, protected routes redirect`

---

## PHASE 4: VERIFY IN BROWSER (document for Andrew)

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
| M-10 | Plan Import: upload plan file | AI interpretation completes (94%+ confidence) |
| M-11 | Plan Import: click "Confirm & Import" | Saves successfully — NO "invalid input syntax for type uuid" error |

---

## PHASE 5: BUILD + COMPLETION REPORT + PR

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-12 | TypeScript: zero errors | `npx tsc --noEmit` exit code | 0 |
| PG-13 | Build: clean | `npm run build` exit code | 0 |
| PG-14 | localhost responds | `curl -s localhost:3000 \| head -1` | HTML content |

### Completion report

Create `HF-041_COMPLETION_REPORT.md` at PROJECT ROOT with all 14 proof gates and terminal evidence.

### Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-041: Fix auth bypass + plan import UUID" \
  --body "## Problems Fixed

### 1. Auth Bypass (P0 — Security)
Unauthenticated users hitting vialuce.ai in incognito see the full authenticated platform
with tenant data, GPV wizard, and sidebar navigation. No login required.

### 2. Plan Import UUID (P0 — Functional)
Plan import fails: 'invalid input syntax for type uuid: VL Platform Admin'.
display_name sent where UUID required on Confirm & Import.

## Root Causes
[from Phase 0 diagnostic — auth bypass]
[from Phase 2 diagnostic — UUID]

## Fixes
[from Phase 1 — auth routing]
[from Phase 2 — UUID replacement]

## Verification
- curl: / returns 200 with landing page content (unauthenticated)
- curl: /admin returns 307 to /login (unauthenticated)
- Plan import API uses tenant.id (UUID) not display_name
- Browser: incognito shows marketing page, zero console errors
- Build: clean, zero TypeScript errors

## Proof Gates: 14 — see HF-041_COMPLETION_REPORT.md"
```

**Commit:** `HF-041 Phase 5: Build verification, completion report, PR`

---

## PROOF GATE SUMMARY (14 gates)

| Range | Mission | Phase | Count |
|-------|---------|-------|-------|
| PG 1-4 | Auth fix + landing page | 0-1 | 4 |
| PG 5-7 | Plan import UUID fix | 2 | 3 |
| PG 8-11 | Auth verification | 3 | 4 |
| PG 12-14 | Build + verification | 5 | 3 |

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
