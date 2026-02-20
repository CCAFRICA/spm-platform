# HF-050: LOCALSTORAGE AUTH BYPASS — THE REAL ROOT CAUSE

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

**MANDATORY:** Read CC_STANDING_ARCHITECTURE_RULES.md FIRST. Evaluate every change against anti-pattern registry.

---

## THE PROBLEM — DEFINITIVE ROOT CAUSE IDENTIFIED

**P0 — Security. Auth bypass persists after 16 hotfixes (HF-028 through HF-043, HF-049).**

### CLT-65 Evidence (February 19, 2026)

Andrew opened a **fresh Firefox browser** (never used for Vialuce before), navigated to `vialuce.ai`, and performed Cmd+Shift+R (hard refresh). Result:

1. **No login screen was ever displayed**
2. Full authenticated platform rendered — sidebar, navigation, tenant selected ("Retail Conglomerate Mexico"), user identity ("VL Platform Admin"), GPV wizard loaded
3. Firefox DevTools → **Storage → Cookies: EMPTY** — zero cookies
4. Firefox DevTools → **Network tab**: multiple GET/HEAD requests to `bayqxeiltnpjrvflksfa.supabase.co` — all succeeding
5. Request headers on Supabase calls contain **`Authorization: Bearer eyJ...`** — a full valid JWT token
6. The platform is making authenticated API calls to Supabase **without any cookies**

### Where the Token Is Coming From

The `@supabase/supabase-js` browser client stores sessions in **localStorage** by default (key: `sb-bayqxeiltnpjrvflksfa-auth-token`). This is NOT in cookies — it survives:
- Hard refresh (Cmd+Shift+R)
- "Clear site data" (which often clears cookies but not localStorage)
- New browser windows (same profile)
- Browser restarts
- All previous cookie-stripping fixes (HF-032, HF-043)

### Why HF-028 Through HF-043 Never Fixed It

Every previous auth HF targeted one of three mechanisms:
1. **Middleware cookie leakage** (HF-032, HF-043) — stripping `Set-Cookie` headers from redirect responses
2. **Client-side redirect logic** (HF-029, HF-030, HF-031, HF-042) — preventing SPA from rendering before auth check
3. **Cookie persistence** (HF-043) — clearing `sb-*` cookies on logout and redirect

**None of them addressed localStorage.** The Supabase browser client reads the JWT from localStorage on initialization, sets `isAuthenticated = true` before any server validation, and the AuthProvider trusts this client-side state. The middleware never sees the token because it's not in cookies — it's injected by JavaScript after the page loads.

### Chrome Loop (Still Broken)

A separate but related issue: Chrome has been stuck in an auth redirect loop since HF-030. This is likely because Chrome's localStorage has a stale/expired token that keeps triggering auth state changes, causing the redirect loop between `/login` and `/`. This HF should fix both browsers.

---

## WHAT MUST HAPPEN

1. **Middleware must remain the server-side gate** — it correctly redirects unauthenticated requests (curl proves 307)
2. **The AuthProvider must NOT trust localStorage tokens without server-side validation** — `getUser()` (which validates the JWT against Supabase servers) must succeed before `isAuthenticated` becomes `true`
3. **Logout must clear localStorage** — `supabase.auth.signOut()` should do this, but verify it does
4. **The landing page / public routes must NEVER initialize the Supabase auth listener** — public pages should not trigger `onAuthStateChange` or `getSession()`
5. **Chrome recovery**: clear stale localStorage on failed server validation to break the loop

---

## PHASE 0: FORENSIC DIAGNOSTIC (NO CODE CHANGES)

### 0A: Locate Every Supabase Client Creation

```bash
echo "=== BROWSER CLIENT CREATION ==="
grep -rn "createBrowserClient\|createClient" web/src/lib/supabase/ --include="*.ts" --include="*.tsx"

echo ""
echo "=== SERVER CLIENT CREATION ==="
grep -rn "createServerClient\|createServiceRoleClient" web/src/lib/supabase/ --include="*.ts" --include="*.tsx"

echo ""
echo "=== ALL SUPABASE IMPORTS ==="
grep -rn "from '@supabase" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

### 0B: Find Where Auth State Is Initialized

```bash
echo "=== AUTH CONTEXT / PROVIDER ==="
cat web/src/contexts/auth-context.tsx

echo ""
echo "=== AUTH SERVICE ==="
cat web/src/lib/supabase/auth-service.ts 2>/dev/null || echo "No auth-service.ts"

echo ""
echo "=== AUTH SHELL ==="
cat web/src/components/layout/auth-shell.tsx
```

**Document the EXACT sequence:**
1. When does `getSession()` get called? What does it read? (localStorage or server?)
2. When does `getUser()` get called? (This is the server-validated check)
3. What sets `isAuthenticated = true`? Is it gated on `getSession()` (client-side, reads localStorage) or `getUser()` (server-side validation)?
4. Does `onAuthStateChange` fire on page load? What triggers it? Does it trust localStorage tokens?

### 0C: Check localStorage Behavior

```bash
echo "=== REFERENCES TO LOCALSTORAGE ==="
grep -rn "localStorage" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== SUPABASE STORAGE CONFIGURATION ==="
grep -rn "persistSession\|storage\|localStorage\|sessionStorage" web/src/lib/supabase/ --include="*.ts"

echo ""
echo "=== SUPABASE AUTH OPTIONS ==="
grep -rn "auth:" web/src/lib/supabase/ --include="*.ts" -A 5
```

### 0D: Check What Happens on Public Routes

```bash
echo "=== MIDDLEWARE — PUBLIC PATHS ==="
cat web/src/middleware.ts

echo ""
echo "=== LANDING PAGE ==="
cat web/src/app/landing/page.tsx 2>/dev/null || cat web/src/app/page.tsx

echo ""
echo "=== LOGIN PAGE ==="
cat web/src/app/login/page.tsx

echo ""
echo "=== ROOT LAYOUT — Does AuthProvider wrap everything? ==="
cat web/src/app/layout.tsx
```

**Key question:** Does the root layout wrap ALL pages (including landing/login) with AuthProvider? If yes, the Supabase client initializes on every page load, reads localStorage, and fires `onAuthStateChange` — even on public routes where no auth should be happening.

### 0E: Check Logout Flow

```bash
echo "=== LOGOUT HANDLER ==="
grep -rn "signOut\|handleLogout\|handleSignOut\|onLogout" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== DOES SIGNOUT CLEAR LOCALSTORAGE? ==="
grep -rn "localStorage.removeItem\|localStorage.clear" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

### 0F: Document Findings

Create `HF-050_DIAGNOSTIC.md` at project root with:
1. Every Supabase client creation point
2. The exact auth initialization sequence (what calls what, in what order)
3. Whether `isAuthenticated` is gated on `getSession()` (localStorage) or `getUser()` (server)
4. Whether AuthProvider wraps public routes
5. Whether logout clears localStorage
6. Whether the Supabase client is configured with `persistSession: true` (default) or `false`

**Commit:** `HF-050 Phase 0: Auth bypass diagnostic — localStorage token persistence`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Supabase browser client stores JWT in localStorage. AuthProvider 
trusts this token without server-side validation. Users who were previously 
authenticated bypass login indefinitely because localStorage persists.

Option A: Disable localStorage persistence entirely
  - Set persistSession: false on createBrowserClient()
  - Users must log in every page load / browser refresh
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? NONE
  - Transport: N/A
  - Atomicity: Clean — no state persists
  TRADE-OFF: Bad UX — users lose session on every refresh

Option B: Keep localStorage but validate server-side before trusting
  - AuthProvider calls getUser() (server-validated) before setting isAuthenticated=true
  - If getUser() fails (token expired/invalid), clear localStorage and redirect to login
  - onAuthStateChange still fires on load, but isAuthenticated stays FALSE until getUser() confirms
  - Scale test: Works at 10x? YES (one getUser() call per page load)
  - AI-first: Any hardcoding? NONE
  - Transport: N/A
  - Atomicity: If validation fails, localStorage is cleared — clean state
  TRADE-OFF: One extra API call per page load (minimal — Supabase handles this in <100ms)

Option C: Move auth persistence to httpOnly cookies only (remove localStorage)
  - Configure Supabase SSR with cookie-only persistence
  - Middleware handles all session management server-side
  - Browser client never touches localStorage
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? NONE
  - Transport: Cookies only (httpOnly, secure, SameSite)
  - Atomicity: Server controls session lifecycle entirely
  TRADE-OFF: Requires careful Supabase SSR configuration, may conflict with existing middleware

RECOMMENDED: Option B — validate before trusting
  - Lowest risk of regression
  - Compatible with existing architecture
  - Fixes both Firefox (fresh browser) and Chrome (stale token loop)
  - Clear upgrade path to Option C later if needed

REJECTED: A (bad UX), C (too much architectural change for a hotfix)
```

**Commit:** `HF-050 Phase 1: Architecture decision — validate localStorage token server-side`

---

## PHASE 2: IMPLEMENTATION

### Fix 1: AuthProvider Must Validate Before Trusting

In the auth context/provider (likely `web/src/contexts/auth-context.tsx`):

**Current pattern (BROKEN):**
```typescript
// onAuthStateChange fires on page load, reads localStorage
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    setIsAuthenticated(true);    // ← TRUSTS localStorage without validation
    fetchCurrentProfile(session);
  }
});
```

**Fixed pattern:**
```typescript
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session) {
    // VALIDATE the token server-side before trusting it
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (user && !error) {
      setIsAuthenticated(true);
      fetchCurrentProfile(session);
    } else {
      // Token is invalid/expired — clear everything and redirect
      console.warn('[Auth] localStorage token invalid, clearing session');
      await supabase.auth.signOut();
      localStorage.removeItem(`sb-${supabaseProjectRef}-auth-token`);
      setIsAuthenticated(false);
      setIsLoading(false);
      // Do NOT redirect here — let AuthShell handle it
    }
  } else {
    setIsAuthenticated(false);
    setIsLoading(false);
  }
});
```

**CRITICAL:** The `supabaseProjectRef` is `bayqxeiltnpjrvflksfa`. But DO NOT hardcode it — extract it from `process.env.NEXT_PUBLIC_SUPABASE_URL`:

```typescript
const supabaseRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
```

### Fix 2: initAuth() Must Use getUser(), Not getSession()

If `initAuth()` calls `getSession()` as its primary check, it reads localStorage and returns a session even if the token is expired/revoked. Change to:

```typescript
async function initAuth() {
  try {
    // getUser() validates the JWT against Supabase servers
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (!user || error) {
      // No valid session — clear any stale localStorage
      await supabase.auth.signOut();
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }
    
    // User is server-validated — now fetch profile
    setIsAuthenticated(true);
    await fetchCurrentProfile();
  } catch (err) {
    console.error('[Auth] initAuth failed:', err);
    setIsAuthenticated(false);
    setIsLoading(false);
  }
}
```

### Fix 3: Logout Must Explicitly Clear localStorage

In the logout handler:

```typescript
async function logout() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('[Auth] signOut error:', err);
  }
  
  // Belt and suspenders — clear ALL Supabase localStorage keys
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('sb-')) {
      localStorage.removeItem(key);
    }
  });
  
  // Clear tenant state
  localStorage.removeItem('vialuce-tenant-id');
  localStorage.removeItem('vialuce-selected-tenant');
  
  // Clear ALL cookies too (defense in depth)
  document.cookie.split(';').forEach(c => {
    const name = c.trim().split('=')[0];
    if (name.startsWith('sb-') || name.startsWith('vialuce-')) {
      document.cookie = `${name}=; path=/; max-age=0; domain=${window.location.hostname}`;
      document.cookie = `${name}=; path=/; max-age=0`; // without domain too
    }
  });
  
  // Hard redirect — do NOT use router.push
  window.location.href = '/login';
}
```

### Fix 4: Public Routes Must Not Initialize Auth

If the root `layout.tsx` wraps ALL routes with `<AuthProvider>`, the Supabase client initializes on every page — including landing and login. This triggers `onAuthStateChange` which reads localStorage.

**Option 4A (preferred):** Move AuthProvider out of root layout and into a `(protected)` route group layout:

```
web/src/app/
  layout.tsx                    ← Root layout: NO AuthProvider
  page.tsx                      ← Landing page (public)
  login/page.tsx                ← Login page (public)
  signup/page.tsx               ← Signup page (public)
  (protected)/
    layout.tsx                  ← Protected layout: HAS AuthProvider + AuthShell
    admin/...
    configure/...
    operate/...
    perform/...
    govern/...
```

**Option 4B (if 4A is too much restructuring):** Guard the AuthProvider's initialization:

```typescript
// In AuthProvider
useEffect(() => {
  const publicPaths = ['/login', '/signup', '/landing', '/'];
  if (publicPaths.includes(window.location.pathname)) {
    setIsLoading(false);
    setIsAuthenticated(false);
    return; // Do NOT initialize Supabase auth on public routes
  }
  initAuth();
}, []);
```

### Fix 5: Chrome Recovery

For users stuck in the Chrome redirect loop, add a recovery mechanism. In the login page:

```typescript
useEffect(() => {
  // On login page load, forcefully clear any stale auth state
  // This breaks the Chrome redirect loop
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('sb-')) {
      localStorage.removeItem(key);
    }
  });
  // Clear tenant state too
  localStorage.removeItem('vialuce-tenant-id');
  localStorage.removeItem('vialuce-selected-tenant');
}, []);
```

**Commit:** `HF-050 Phase 2: Fix localStorage auth bypass — validate before trust + explicit cleanup`

---

## PHASE 3: VERIFY

### 3A: curl Tests (Server-Side Behavior — Should Still Work)

```bash
echo "=== UNAUTHENTICATED ROOT ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}" --max-redirs 0 http://localhost:3000/
echo ""

echo "=== LOGIN PAGE ==="
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/login
echo ""

echo "=== PROTECTED ROUTE ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}" --max-redirs 0 http://localhost:3000/admin
echo ""

echo "=== LANDING PAGE ==="
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/landing 2>/dev/null || curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/
echo ""
```

### 3B: localStorage Verification

```bash
echo "=== NO LOCALSTORAGE REFERENCES IN PUBLIC PAGES ==="
grep -rn "localStorage" web/src/app/login/ web/src/app/landing/ web/src/app/signup/ --include="*.tsx" --include="*.ts" 2>/dev/null
echo "(should show ONLY cleanup code, not reads)"

echo ""
echo "=== AUTH INIT USES getUser() NOT getSession() ==="
grep -n "getSession\|getUser" web/src/contexts/auth-context.tsx
echo "(getUser must be the primary validation gate)"

echo ""
echo "=== LOGOUT CLEARS LOCALSTORAGE ==="
grep -n "localStorage.removeItem\|localStorage.clear" web/src/contexts/auth-context.tsx web/src/lib/supabase/auth-service.ts 2>/dev/null
echo "(must show sb- cleanup)"
```

### 3C: Build

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

**Commit:** `HF-050 Phase 3: Verification`

---

## PHASE 4: BROWSER PROOF GATES (FOR ANDREW)

These are the definitive tests. curl is necessary but not sufficient — the bug is client-side.

### Test A: Firefox (The CLT-65 Reproduction)

1. Close ALL Firefox windows
2. Open Firefox → Settings → Privacy → Clear Data → check Cookies AND Site Data (which includes localStorage)
3. Open DevTools BEFORE navigating
4. Go to `vialuce.ai`
5. **MUST see login page or landing page — NOT the authenticated platform**
6. Storage tab → Local Storage → `https://vialuce.ai` → **MUST be empty**
7. Storage tab → Cookies → `https://vialuce.ai` → **MUST be empty**
8. Network tab → **ZERO requests to `bayqxeiltnpjrvflksfa.supabase.co`** (no Supabase calls on public page)

### Test B: Chrome Recovery

1. Open Chrome → address bar → `chrome://settings/clearBrowserData`
2. Advanced tab → check ALL boxes → Clear Data
3. Open DevTools BEFORE navigating
4. Go to `vialuce.ai`
5. **MUST see login page or landing page — NOT the redirect loop**
6. Application tab → Local Storage → `https://vialuce.ai` → **MUST be empty**

### Test C: Login Flow

1. From the login page, sign in with valid credentials
2. Platform should load with correct user identity
3. Verify localStorage now HAS `sb-*-auth-token` (this is expected after login)
4. Refresh the page — should stay authenticated (localStorage persistence working correctly)
5. Click Logout
6. **MUST return to login page**
7. localStorage → **MUST be empty** (sb-* keys cleared)
8. Refresh after logout → **MUST stay on login/landing page**

### Test D: Incognito

1. Open incognito/private window
2. Go to `vialuce.ai`
3. **MUST see login page or landing page**
4. localStorage must be empty (incognito starts fresh)

---

## PHASE 5: BUILD + COMPLETION REPORT + PR

### Build

```bash
cd web
rm -rf .next
npm run build
npm run dev
# Confirm localhost:3000 responds
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

### Completion Report

Create `HF-050_COMPLETION_REPORT.md` at PROJECT ROOT:

```markdown
# HF-050 Completion Report: localStorage Auth Bypass Fix

## Root Cause (DEFINITIVE)
The Supabase browser client (@supabase/supabase-js) stores JWT sessions in 
localStorage by default. The AuthProvider trusted this client-side token without 
server-side validation. Users who were previously authenticated retained full 
platform access indefinitely because:
- localStorage persists across browser restarts, hard refreshes, and "clear site data"
- HF-028 through HF-043 only targeted cookies, never localStorage
- The middleware (server-side) correctly redirected, but the SPA client-side 
  JavaScript read the localStorage token and bypassed the redirect

## Evidence
- CLT-65: Fresh Firefox, Cmd+Shift+R, zero cookies, full authenticated platform rendered
- Network tab: Authorization: Bearer eyJ... on all Supabase requests
- Storage tab: Cookies empty, localStorage contained sb-*-auth-token

## Fix
1. AuthProvider validates token server-side (getUser()) before setting isAuthenticated=true
2. Invalid/expired localStorage tokens are cleared automatically
3. Logout explicitly clears all localStorage sb-* keys + cookies
4. Public routes do not initialize Supabase auth listener
5. Login page clears stale auth state on mount (Chrome loop recovery)

## Proof Gates
[Fill from Phase 3 + Phase 4 results]
```

### PR

```bash
git add -A && git commit -m "HF-050 Phase 5: Completion report"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-050: Fix localStorage auth bypass — validate tokens server-side before trusting" \
  --body "## Root Cause (DEFINITIVE)
Supabase browser client stores JWT in localStorage. AuthProvider trusted this 
token without server-side validation (getUser()). HF-028 through HF-043 only 
targeted cookies — the token was never in cookies.

## CLT-65 Evidence
Fresh Firefox, zero cookies, full authenticated platform with Bearer token 
from localStorage on every Supabase request.

## Fix
1. AuthProvider: getUser() validation before isAuthenticated=true
2. Invalid tokens: auto-clear localStorage + signOut()
3. Logout: explicit localStorage + cookie cleanup
4. Public routes: no auth initialization
5. Login page: clear stale state on mount (Chrome recovery)

## Proof Gates: [X]/[X] PASS"
```

---

## ANTI-PATTERNS TO AVOID

| # | Don't | Do Instead |
|---|-------|-----------|
| 1 | Trust getSession() as proof of authentication | Use getUser() — it validates the JWT against Supabase servers |
| 2 | Add more cookie-stripping logic | The token isn't in cookies — it's in localStorage |
| 3 | Add another client-side wrapper component | Fix the AuthProvider's trust model at the source |
| 4 | Disable localStorage entirely (Option A) | Validate then trust (Option B) — preserves good UX |
| 5 | Hardcode the Supabase project reference | Extract from NEXT_PUBLIC_SUPABASE_URL |
| 6 | Use router.push for post-logout redirect | Use window.location.href — forces full page reload, clears React state |
| 7 | Initialize auth on public routes | Public routes must render without touching Supabase auth |
| 8 | Assume incognito means clean state | Incognito inherits extensions and sometimes pre-loaded service workers |

---

## PROPOSED ANTI-PATTERN ADDITION

If this fix works, add to CC_STANDING_ARCHITECTURE_RULES.md Section C:

```
### Auth & Session
| # | Anti-Pattern | Correct Pattern | Source |
|---|---|---|---|
| AP-18 | Trust client-side session state (getSession/localStorage) without server validation | Always validate with getUser() before setting isAuthenticated=true | HF-050 |
| AP-19 | Initialize auth listeners on public routes | Public routes must not trigger onAuthStateChange or Supabase client initialization | HF-050 |
| AP-20 | Target cookies only when diagnosing auth bypass | Check localStorage, sessionStorage, AND cookies — Supabase JS uses localStorage by default | HF-050 |
```

---

*HF-050 — February 19, 2026*
*"We spent 16 hotfixes searching the house for the key. It was in the pocket the whole time."*
