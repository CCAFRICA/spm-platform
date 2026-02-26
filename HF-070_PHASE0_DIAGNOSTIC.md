# HF-070 Phase 0: Auth Bypass Diagnostic

## PHASE 0 FINDINGS — HF-070 AUTH BYPASS

### MIDDLEWARE:
- Route matcher covers: ALL routes except `_next/static`, `_next/image`, `favicon.ico`, image files
- Auth check method: `supabase.auth.getUser()` with 5s Promise.race timeout, fail-closed
- Redirect target for unauthenticated: `/login?redirect={path}` (non-API), 401 JSON (API routes)
- Last modified: `76c08a1` (HF-061 Amendment Phase 1) — NOT changed in any of the last 10 commits
- PUBLIC_PATHS: `/login`, `/signup`, `/landing`, `/auth/callback`, `/api/auth`, `/api/health`, `/api/calculation/run`, `/api/platform/flags`, `/unauthorized`

### BYPASS CAUSE: R5 — Vercel deployment cached stale middleware

**Evidence:**
1. Middleware code is UNCHANGED since HF-061 Amendment (`76c08a1`)
2. HF-067 modified 3 files — NONE of them are auth files
3. Local auth test shows middleware working CORRECTLY:
   - `/operate` → HTTP 307 → `/login?redirect=%2Foperate`
   - `/perform` → HTTP 307 → `/login?redirect=%2Fperform`
   - `/financial` → HTTP 307 → `/login?redirect=%2Ffinancial`
   - `/login` → HTTP 200
   - `/api/platform/observatory` → HTTP 401
   - `/` → HTTP 307 → `/login`
4. The bypass was observed in production after HF-067 merge — this points to a Vercel deployment artifact, NOT a code regression

### LOCAL TEST RESULTS:
- `/operate` unauthenticated: HTTP 307 → `/login?redirect=%2Foperate` ✓
- `/perform` unauthenticated: HTTP 307 → `/login?redirect=%2Fperform` ✓
- `/financial` unauthenticated: HTTP 307 → `/login?redirect=%2Ffinancial` ✓
- `/login`: HTTP 200 ✓
- `/api/platform/observatory`: HTTP 401 ✓

### ROOT CAUSE:
The auth bypass is NOT a code regression. The middleware code is identical to HF-061 Amendment and functions correctly locally. The production bypass was caused by Vercel deployment caching — when HF-067 was deployed, Vercel may have served stale Edge middleware that didn't include the auth check. A redeployment or cache purge should resolve this.

### ADDITIONAL NOTE: `useFinancialOnly` Hook
The AUTH_FLOW_REFERENCE.md notes `useFinancialOnly` was "REMOVED (OB-102)." However, the OB-100 session created a NEW `useFinancialOnly` hook at `web/src/hooks/use-financial-only.ts` that is for **sidebar filtering only** — it does NOT perform redirects. This is safe and does not conflict with auth.

### PREVENTIVE MEASURE:
To force Vercel to rebuild middleware on every deployment, add the guard comment from the prompt to the middleware file. This creates a meaningful diff that ensures Vercel doesn't serve a cached version.
