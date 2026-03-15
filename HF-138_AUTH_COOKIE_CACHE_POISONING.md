# HF-138: AUTH COOKIE CACHE POISONING — VERCEL EDGE + SUPABASE SSR

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

**SEVERITY: P0 — SECURITY. Cached auth cookies served to unauthenticated users via Vercel edge.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `SCHEMA_REFERENCE_LIVE.md`
3. `PRE_PROMPT_COMPLIANCE_DIRECTIVE.md`

---

## WHY THIS HF EXISTS

CLT-172 found that Supabase auth cookies appear in fresh incognito browser windows without the user logging in. This allows unauthenticated access to production tenant data.

**Root cause (from Supabase official documentation, March 2026):**

> "When @supabase/ssr refreshes a session token server-side, it writes the updated JWT to the HTTP response via a Set-Cookie header. If your CDN (e.g. Vercel Edge, Cloudflare) caches that response and serves it to a different user, that user's browser will store the cached token and be signed in as the wrong person."
> 
> "To prevent this, set Cache-Control: private, no-store on responses from any route that handles authentication, typically your middleware."

**Source:** https://supabase.com/docs/guides/auth/server-side/advanced-guide

The vialuce middleware uses `createServerClient` with cookie `setAll`, which writes `Set-Cookie` headers on every response. Vercel's edge network caches these responses and serves them to subsequent visitors, including the auth cookies. This is why an incognito window receives a valid auth cookie without logging in.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**

---

## PHASE 0: DIAGNOSTIC (Zero Code Changes)

### 0A: Verify the Middleware Cookie Pattern

```bash
# Find the middleware
cat web/src/middleware.ts 2>/dev/null || cat web/middleware.ts 2>/dev/null

# Find Set-Cookie / cache-control handling
grep -n "setAll\|Set-Cookie\|Cache-Control\|cache-control\|no-store\|private\|response\.cookies\|supabaseResponse" \
  web/src/middleware.ts web/middleware.ts 2>/dev/null
```

**Expected finding:** The middleware creates a `NextResponse`, passes it to `createServerClient` with `setAll` callback that writes cookies to the response, but does NOT set `Cache-Control: private, no-store` on the response headers.

### 0B: Check Vercel Configuration

```bash
# Check for any cache headers in next.config.js or vercel.json
grep -rn "cache\|Cache-Control\|stale\|revalidate\|s-maxage" \
  web/next.config.* web/vercel.json 2>/dev/null

# Check if any pages use ISR or static generation
grep -rn "revalidate\|generateStaticParams\|force-static\|force-dynamic" \
  web/src/app/ --include="*.ts" --include="*.tsx" | head -10
```

**Commit:** `git add -A && git commit -m "HF-138 Phase 0: Diagnostic — cache-control + Supabase cookie pattern" && git push origin dev`

---

## PHASE 1: FIX — CACHE-CONTROL HEADERS ON MIDDLEWARE RESPONSE

### The Fix (Supabase-Recommended)

In the middleware, add `Cache-Control: private, no-store` to EVERY response. This tells Vercel's edge network to never cache the response, ensuring `Set-Cookie` headers are never served to a different user.

```typescript
// In middleware.ts, AFTER creating the response and BEFORE returning it:

// CRITICAL: Prevent Vercel edge from caching responses with Set-Cookie headers
// https://supabase.com/docs/guides/auth/server-side/advanced-guide
response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
response.headers.set('Pragma', 'no-cache');
response.headers.set('Expires', '0');

return response;
```

This must be applied to EVERY return path in the middleware — not just the authenticated path. Including:
- The redirect to /login response
- The NextResponse.next() for authenticated requests  
- Any error responses

### Implementation Pattern

Find every `return` statement in the middleware and ensure the response has cache-control headers:

```typescript
// Helper function
function noCacheResponse(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

// Then every return:
return noCacheResponse(response);
return noCacheResponse(NextResponse.redirect(loginUrl));
return noCacheResponse(NextResponse.next());
```

### Verification Headers

Also add to `next.config.js` as a belt-and-suspenders measure:

```javascript
// next.config.js
const nextConfig = {
  // ... existing config
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, no-cache, must-revalidate',
          },
        ],
      },
    ];
  },
};
```

**Note:** This applies no-cache to ALL routes. For a production platform handling sensitive compensation data, this is the correct default. Performance optimization via selective caching can come later for truly static assets.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Middleware adds Cache-Control to all responses | grep confirms header on every return path |
| PG-2 | next.config.js has Cache-Control headers | Belt-and-suspenders |
| PG-3 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "HF-138 Phase 1: Cache-Control private no-store on all middleware responses" && git push origin dev`

---

## PHASE 2: VERIFICATION

### 2A: Response Header Check

After build, verify the response headers include Cache-Control:

```bash
# Start dev server
npm run dev &
sleep 5

# Check response headers (unauthenticated)
curl -I http://localhost:3000/ 2>/dev/null | grep -i "cache-control\|set-cookie\|location"
# EXPECTED: Cache-Control: private, no-store, no-cache, must-revalidate
# EXPECTED: Location: /login (redirect)
# EXPECTED: No Set-Cookie with auth tokens

# Check authenticated response headers
# (Would need auth cookie — verify in browser)
```

### 2B: Browser Verification

1. Login as Patricia in main browser window
2. Open incognito window
3. Navigate to vialuce.ai
4. **EXPECTED:** Redirect to /login, NO auth cookie set
5. Check DevTools → Network tab → Response Headers on the redirected request
6. **Verify:** `Cache-Control: private, no-store` present in response headers

### 2C: Deployment Verification

After Vercel deploys:
1. Wait 2 minutes (allow edge cache to propagate)
2. Open truly fresh incognito window
3. Navigate to vialuce.ai
4. **EXPECTED:** Redirect to /login
5. Check Application → Cookies — ZERO Supabase auth cookies

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-4 | Response headers include Cache-Control | curl or DevTools confirms |
| PG-5 | Incognito → /login (no cached auth cookie) | No sb- cookies in Application tab |
| PG-6 | Authenticated access still works | Patricia can login and see data |
| PG-7 | Meridian MX$185,063 | No regression |

**Commit:** `git add -A && git commit -m "HF-138 Phase 2: Cache-Control verification" && git push origin dev`

---

## PHASE 3: COMPLETION REPORT + PR

```bash
gh pr create --base main --head dev \
  --title "HF-138: Auth Cookie Cache Poisoning — Cache-Control Headers" \
  --body "## SECURITY FIX

### Root Cause
Supabase SSR writes Set-Cookie headers on middleware responses.
Vercel edge caches these responses and serves them to other users,
including the auth cookies. Documented by Supabase:
https://supabase.com/docs/guides/auth/server-side/advanced-guide

### Fix
Cache-Control: private, no-store, no-cache, must-revalidate on ALL
middleware responses. Prevents Vercel edge from caching responses
that contain Set-Cookie headers.

### Verification
- All responses include Cache-Control headers
- Incognito window receives no cached auth cookies
- Authenticated access preserved

## Proof Gates: see HF-138_COMPLETION_REPORT.md"
```

**Commit:** `git add -A && git commit -m "HF-138 Phase 3: Completion report + PR" && git push origin dev`

---

## PRODUCTION VERIFICATION — FOR ANDREW (HIGHEST PRIORITY)

After merge and Vercel deploy:

1. **Wait 5 minutes** — allow Vercel edge cache to invalidate
2. **Open fresh incognito window** — navigate to vialuce.ai
3. **MUST redirect to /login with ZERO cookies**
4. **Login as Patricia** — must see /stream with $44,590
5. **Open ANOTHER fresh incognito window** — must redirect to /login again
6. If step 3 or 5 still shows cached cookies, the Vercel edge cache may need a manual purge via Vercel dashboard

---

*HF-138 — March 15, 2026*
*"The CDN must never cache authentication state. Every response must be private."*
*vialuce.ai — Intelligence. Acceleration. Performance.*
