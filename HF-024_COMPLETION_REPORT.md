# HF-024 Completion Report
## PRODUCTION AUTH DIAGNOSTIC AND FIX

**Date:** 2026-02-15
**Branch:** dev
**Commits:** `d76ab7f` (Phase 0), `9ad5c42` (Phase 1), `7dce405` (Phase 2), `46b1bde` (Phase 2B)

---

## Root Cause

**The `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel is set to a wrong, non-JWT value.**

Production build chunk `4126-2ab67e72c3d15d61.js` contains:
```
t="eyJsb_publishable_u_1bHIyX35Tqu8K-7uy-fw_PgmNYx9I"
```

This is **not** a valid Supabase anon key. A correct key is a JWT starting with `eyJhbGciOi...`.

The local build (`4126-fb478467407a6557.js`) correctly has:
```
t="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsIn..."
```

Since Next.js `NEXT_PUBLIC_*` vars are **baked at build time**, the wrong key was embedded into the production JS bundle. Every `signInWithPassword` call sends this invalid key as the `apikey` header, causing Supabase to return 401.

### To Fix Production

1. **Vercel Dashboard** -> Environment Variables -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. Update value to the correct JWT (same as in `.env.local`)
3. Trigger redeploy (push to main, or manual redeploy in Vercel)
4. Verify: `curl https://vialuce.ai/api/health/auth` should show `anon_key_prefix: "eyJhbGciOiJIUzI1NiIs..."`

---

## Changes Made

### Phase 1: Build-Time Env Validation (`next.config.mjs`)
- Validates `NEXT_PUBLIC_SUPABASE_URL` contains `.supabase.co`
- Validates `NEXT_PUBLIC_SUPABASE_ANON_KEY` starts with `eyJ` (valid JWT)
- Build **fails loudly** if either check fails — prevents deploying broken auth

### Phase 2A: Auth Health Check Endpoint (`/api/health/auth`)
- Returns env var status: presence, domain, key prefix, JWT validity
- Public route (no auth required) — accessible for deployment verification
- Added `/api/health` to middleware public paths

### Phase 2B: Login Error Diagnostics
- `auth-context.tsx`: `login()` now returns `{ success, error }` with categorized messages:
  - "Invalid email or password" for wrong credentials
  - "Please confirm your email" for unconfirmed accounts
  - "Account found but profile is missing" for auth success but missing profile
  - Full error message for unexpected failures (includes console.error)
- `login/page.tsx`: Displays the specific error message from auth context

### Phase 2C: Seed Script Password Guard
- `seed-optica-luminar.ts`: When user already exists, calls `updateUserById` to sync password
- Prevents "user exists but has no password" scenario on re-runs

---

## Proof Gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | Root cause identified | PASS | Wrong anon key in Vercel: `eyJsb_publishable_u_...` vs correct `eyJhbGciOi...` |
| 2 | Production auth fix | PENDING | Requires Vercel env var update + redeploy |
| 3 | /api/health/auth returns status | PASS | `{"status":"ok","anon_key_prefix":"eyJhbGciOiJIUzI1NiIs..."}` |
| 4 | Login shows meaningful errors | PASS | Returns specific error messages per failure type |
| 5 | Build fails if env vars wrong | PASS | `Error: Invalid NEXT_PUBLIC_SUPABASE_ANON_KEY: must be a JWT` |
| 6 | Seed script syncs passwords | PASS | `password synced` for existing users |
| 7 | Build passes with zero errors | PASS | Clean build, zero warnings |

---

## Files Modified

| File | Change |
|------|--------|
| `web/next.config.mjs` | Build-time env validation |
| `web/src/middleware.ts` | Added `/api/health` to public paths |
| `web/src/app/api/health/auth/route.ts` | NEW: Health check endpoint |
| `web/src/contexts/auth-context.tsx` | login() returns categorized errors |
| `web/src/app/login/page.tsx` | Displays specific error messages |
| `web/scripts/seed-optica-luminar.ts` | Password sync for existing users |
| `HF-024_DIAGNOSTIC_FINDINGS.md` | Detailed diagnostic analysis |

---

## Action Required (Manual)

**Update Vercel env var `NEXT_PUBLIC_SUPABASE_ANON_KEY`** to the correct value, then redeploy. After that, verify with:
```bash
curl -s https://vialuce.ai/api/health/auth | python3 -m json.tool
```
Expected: `"anon_key_valid_jwt": true`
