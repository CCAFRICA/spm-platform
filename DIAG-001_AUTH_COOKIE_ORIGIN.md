# DIAG-001: AUTH COOKIE ORIGIN — PURE DIAGNOSTIC

**This prompt produces ZERO code changes. Diagnostic only. Evidence collection only.**

**Do NOT fix anything. Do NOT modify any files except the diagnostic report. The goal is to find WHERE a Supabase auth cookie is being set and HOW it reaches a Chrome incognito window.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `SCHEMA_REFERENCE_LIVE.md`

---

## THE PROBLEM

A fresh Chrome incognito window (no other Chrome windows open, cache cleared, hard refresh, CMD+SHIFT+R) navigates to vialuce.ai and renders full tenant data without logging in. A Supabase auth cookie containing a valid JWT for Patricia Zambrano is present in the incognito browser despite no login occurring.

**What we know for certain:**
1. `curl -v https://vialuce.ai/stream` returns 307 → /login, NO Set-Cookie, correct Cache-Control headers. The SERVER does not send auth cookies to unauthenticated requests.
2. Firefox and Safari redirect to /login correctly. No cookie present.
3. Chrome incognito has the cookie. No other vialuce.ai window is open when incognito launches.
4. Clearing cookies in incognito → /login renders correctly.
5. The middleware auth check (getUser) works — it validates the JWT correctly. The problem is the JWT existing in the first place.

**Three HFs (136, 137, 138) attempted fixes without diagnosing the cause. All failed to resolve the incognito issue. This diagnostic finds the cause.**

---

## PHASE 1: INVENTORY EVERY COOKIE-SETTING MECHANISM

### 1A: Find ALL Places Cookies Are Set in the Codebase

```bash
echo "=== 1A-1: Server-side cookie setting ==="
grep -rn "\.cookies\.set\|setCookie\|Set-Cookie\|setAll" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== 1A-2: Client-side cookie setting ==="
grep -rn "document\.cookie\|js-cookie\|cookie.*=.*\|Cookies\.set" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== 1A-3: Supabase client cookie configuration ==="
grep -rn "cookies:\|cookieOptions\|cookie.*storage\|storage.*cookie" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== 1A-4: Next.js cookies() usage ==="
grep -rn "from 'next/headers'\|cookies()" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort
```

**Paste ALL output.** Every single line.

### 1B: Find ALL Supabase Client Initializations

```bash
echo "=== 1B-1: createBrowserClient ==="
grep -rn "createBrowserClient\|createClient.*supabase" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== 1B-2: createServerClient ==="
grep -rn "createServerClient" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== 1B-3: Full client creation files ==="
find web/src -name "*supabase*" -o -name "*client*" | \
  grep -v node_modules | grep -v ".next" | sort
```

For EACH client initialization found, paste the FULL initialization code (including cookie/storage configuration).

### 1C: Find Service Worker Registration

```bash
echo "=== 1C-1: Service worker files ==="
find web/ -name "sw.*" -o -name "service-worker*" -o -name "worker*" | \
  grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== 1C-2: Service worker registration ==="
grep -rn "serviceWorker\|navigator\.service\|workbox\|sw\.register" \
  web/src/ --include="*.ts" --include="*.tsx" --include="*.js" | \
  grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== 1C-3: Next.js PWA config ==="
grep -rn "pwa\|workbox\|service.worker\|next-pwa\|serwist" \
  web/package.json web/next.config.* 2>/dev/null
```

### 1D: Find Auth State Persistence

```bash
echo "=== 1D-1: localStorage usage ==="
grep -rn "localStorage\|local_storage\|localStorageAdapter" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== 1D-2: sessionStorage usage ==="
grep -rn "sessionStorage\|session_storage" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== 1D-3: BroadcastChannel usage ==="
grep -rn "BroadcastChannel\|broadcast.*channel\|cross.*tab\|tab.*sync" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== 1D-4: Auth state change listeners ==="
grep -rn "onAuthStateChange\|auth\.onAuth\|authStateChange" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== 1D-5: persistSession configuration ==="
grep -rn "persistSession\|autoRefreshToken\|detectSessionInUrl\|storageKey\|flowType" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort
```

### 1E: Check the Middleware setAll Behavior

```bash
echo "=== 1E: Full middleware file ==="
cat -n web/src/middleware.ts
```

Specifically document:
1. Does the `setAll` callback in the middleware fire for EVERY request (including unauthenticated)?
2. Does `getUser()` trigger a token refresh that causes `setAll` to write cookies?
3. What cookies does `setAll` write when there IS no user?

### 1F: Check Vercel Build Output for Cached Pages

```bash
echo "=== 1F-1: Static pages in build output ==="
ls web/.next/server/app/ 2>/dev/null | head -20

echo ""
echo "=== 1F-2: Check for prerendered HTML ==="
find web/.next/server -name "*.html" | head -10

echo ""
echo "=== 1F-3: Check route config for dynamic/static ==="
grep -rn "dynamic\|revalidate\|force-static\|force-dynamic\|generateStaticParams" \
  web/src/app/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | head -20
```

---

## PHASE 2: LOCAL REPRODUCTION

### 2A: Test on localhost

```bash
cd web
npm run build
npm run start &
sleep 5

echo "=== Curl test (no cookies) ==="
curl -v http://localhost:3000/stream 2>&1 | grep -iE "< HTTP|< location|< set-cookie|< cache-control"
```

### 2B: Open Chrome Incognito Against Localhost

1. Close ALL Chrome windows
2. Open Chrome
3. Open incognito (CMD+SHIFT+N)
4. Navigate to localhost:3000
5. Check: does it redirect to /login?
6. Check: Application → Cookies — any sb- cookies?

**If localhost incognito ALSO has the cookie:** The issue is in the application code (client-side Supabase sets cookies via JavaScript)
**If localhost incognito does NOT have the cookie:** The issue is specific to the production Vercel deployment

### 2C: Network Tab First Request

In the incognito window, BEFORE navigating to vialuce.ai:
1. Open DevTools → Network tab
2. Check "Preserve log"
3. Navigate to vialuce.ai
4. Look at the VERY FIRST request (before any JavaScript runs)
5. Check Request Headers: does Chrome SEND a cookie?
6. Check Response Headers: does the server SET a cookie?

**If Chrome SENDS a cookie on the first request:** Chrome has the cookie from somewhere outside the server (browser storage, sync, etc.)
**If the server SETS a cookie in the response:** The server is writing cookies despite the curl test showing it doesn't (meaning the behavior differs for Chrome vs curl)

Document the EXACT Request Headers and Response Headers for the first request.

---

## PHASE 3: DIAGNOSTIC REPORT

Create `DIAG-001_AUTH_COOKIE_DIAGNOSTIC.md` at project root:

```markdown
# DIAG-001: Auth Cookie Origin — Diagnostic Report

## Cookie-Setting Mechanisms Found
[List every file/line that sets cookies]

## Supabase Client Configurations
[List every client initialization with its cookie/storage config]

## Service Workers
[Present / Not Present — if present, what do they do?]

## Auth State Persistence
[localStorage / sessionStorage / cookies / BroadcastChannel — what's used?]

## Middleware setAll Behavior
[Does it write cookies for unauthenticated requests? What cookies?]

## Local Reproduction
- localhost incognito: [cookie present / not present]
- curl localhost: [307 / 200]

## Network Tab Analysis
- First request to vialuce.ai in incognito:
  - Chrome SENDS cookie: [YES / NO]
  - Server SETS cookie: [YES / NO]
  - Request headers: [paste]
  - Response headers: [paste]

## Root Cause Determination
[Based on evidence above — exactly WHERE and HOW the cookie gets into incognito]

## Recommended Fix
[Based on diagnosed root cause — what specifically should change]
```

**Commit:** `git add DIAG-001_AUTH_COOKIE_DIAGNOSTIC.md && git commit -m "DIAG-001: Auth cookie origin diagnostic report" && git push origin dev`

---

## WHAT THIS DIAGNOSTIC MUST ANSWER

One question: **Where does the cookie come from?**

The answer is one of:
- **A)** The server sends it (contradicts curl test — need to explain why)
- **B)** Client-side JavaScript sets it (a Supabase browser client writing to document.cookie or triggering a Set-Cookie)
- **C)** A Service Worker replays a cached response containing Set-Cookie
- **D)** Chrome itself carries it from a non-incognito context (browser-level, outside app control)
- **E)** Something else (document with evidence)

The fix follows from the answer. Do NOT propose a fix without the answer.

---

*DIAG-001 — March 15, 2026*
*"Find the cause. Then fix the cause. Not before."*
