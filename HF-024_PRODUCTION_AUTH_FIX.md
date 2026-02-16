# HF-024: PRODUCTION AUTH DIAGNOSTIC AND FIX

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## Standing Rules
After EVERY commit: `git push origin dev`
After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.

---

## CONTEXT

### What Works
- Supabase auth users exist with correct passwords (verified via Supabase Dashboard Raw JSON)
- Direct curl to Supabase auth endpoint returns valid access_token for all 4 users
- All code is merged to `main` (PR #1: OB-44, PR #2: HF-023)
- Vercel shows successful deployment with green "Ready" status
- Environment variables verified in Vercel
- Same Supabase instance (bayqxeiltnpjrvflksfa) for local and production
- localhost:3000 returns HTTP 307 (auth enforcement working locally)

### What Fails
- vialuce.ai login page: `POST /auth/v1/token?grant_type=password` returns 401 (Unauthorized)
- This happens for ALL users including admin@opticaluminar.mx, platform@vialuce.com
- The request originates from the browser JS bundle, not from server-side code

### Implication
The Supabase JS client in the production build is either:
1. Using a different/wrong anon key than what's in the env vars
2. Sending malformed credentials (encoding, trimming, transformation)
3. Has a stale build that pre-dates the env var configuration
4. The login form is interfering with the credential values before they reach the Supabase client

---

## PHASE 0: COMPREHENSIVE DIAGNOSTIC

This phase is DIAGNOSTIC ONLY. Do NOT change any code. Capture findings.

### 0A: Verify Environment Variable Chain

```bash
cd /Users/AndrewAfrica/spm-platform/web

# 1. What does .env.local contain?
echo "=== .env.local ==="
grep "SUPABASE" .env.local

# 2. What does .env.production contain (if it exists)?
echo "=== .env.production ==="
cat .env.production 2>/dev/null || echo "No .env.production file"

# 3. What does next.config.js/ts expose?
echo "=== next.config ==="
grep -n "env\|SUPABASE\|publicRuntimeConfig" next.config.* 2>/dev/null

# 4. How is the Supabase client created?
echo "=== Supabase client creation ==="
grep -rn "createClient\|createBrowserClient\|SUPABASE_URL\|SUPABASE_ANON" \
  src/lib/supabase/ --include="*.ts" --include="*.tsx"

# 5. How does the login page call signInWithPassword?
echo "=== Login page auth call ==="
cat src/app/login/page.tsx
```

### 0B: Verify the Auth Flow End-to-End

```bash
# 6. Test auth directly using the anon key from .env.local
ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON .env.local | cut -d= -f2)
SUPA_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)

echo "Testing auth with key: ${ANON_KEY:0:20}..."
echo "Against URL: $SUPA_URL"

curl -s -w "\nHTTP_CODE: %{http_code}" \
  -X POST "$SUPA_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@opticaluminar.mx","password":"demo-password-OL1"}'
```

### 0C: Check What Vercel Actually Has

```bash
# 7. Check Vercel env vars (requires vercel CLI)
npx vercel env ls production 2>/dev/null || echo "Vercel CLI not configured — check manually"

# 8. Check if there's a .env file being committed that overrides
git ls-files | grep -i env
cat .env 2>/dev/null || echo "No .env file in repo"

# 9. Check if the build embeds the env vars correctly
# After a local production build, check the output
npm run build 2>&1 | tail -5
# Then search the build output for the Supabase URL
grep -r "bayqxeiltnpjrvflksfa" .next/static/ 2>/dev/null | head -3 || echo "URL not found in static build"
grep -r "SUPABASE" .next/static/ 2>/dev/null | head -3 || echo "SUPABASE not found in static build"
```

### 0D: Check for Build-Time vs Runtime Variable Issue

Next.js `NEXT_PUBLIC_*` variables are **baked into the JS bundle at build time**, not read at runtime. This means:

1. If Vercel built the app BEFORE the env vars were set → the bundle has empty/wrong values
2. If the env vars were added AFTER the initial deployment → a redeploy is needed

```bash
# 10. Check when Vercel env vars were last updated vs when the last deploy happened
# This requires checking Vercel dashboard — note this in findings

# 11. Check if the Supabase URL is actually embedded in the production bundle
# Build locally with production mode
NODE_ENV=production npm run build 2>&1 | tail -10

# Search for the anon key in the build output
ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON .env.local | cut -d= -f2)
grep -r "${ANON_KEY:0:20}" .next/ 2>/dev/null | head -3
```

### 0E: Examine the Login Component Closely

```bash
# 12. Full login page — look for form handling, trimming, encoding
cat src/app/login/page.tsx

# 13. Check if there's a separate auth utility
grep -rn "signIn\|signUp\|login\|authenticate" src/lib/ --include="*.ts" | head -10

# 14. Check for any auth interceptors or middleware that might modify the request
grep -rn "onAuthStateChange\|auth.onAuthStateChange" src/ --include="*.ts" --include="*.tsx" | head -10
```

**Commit findings as:** `HF-024 Phase 0: Production auth diagnostic findings`

Document ALL findings in a file: `HF-024_DIAGNOSTIC_FINDINGS.md` in PROJECT ROOT.

---

## PHASE 1: ROOT CAUSE FIX

Based on Phase 0 findings, implement the fix. The most likely scenarios and their fixes:

### Scenario A: Build-Time Variable Embedding (Most Likely)

If the Supabase URL/anon key is NOT found in the `.next/static/` build output, or if the wrong values are embedded:

**Fix:** The Vercel build needs to be triggered AFTER env vars are correctly set.

1. Verify env vars are set in Vercel Dashboard (Production environment)
2. Trigger a fresh build: `git commit --allow-empty -m "HF-024: Trigger Vercel rebuild for env vars" && git push origin main`
3. Wait for Vercel to rebuild and deploy
4. Test vialuce.ai login

### Scenario B: .env File Conflict

If there's a `.env` or `.env.production` file committed to git that overrides the Vercel env vars:

**Fix:** Remove the conflicting file:
```bash
git rm .env.production 2>/dev/null
git rm .env 2>/dev/null
# Ensure .gitignore includes all .env files
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore  
echo ".env.production" >> .gitignore
echo ".env.production.local" >> .gitignore
```

### Scenario C: Supabase Client Misconfiguration

If the client is created with hardcoded values or from the wrong env var names:

**Fix:** Ensure the Supabase browser client reads from `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` at build time. These MUST use the `NEXT_PUBLIC_` prefix for Next.js to include them in the client bundle.

```typescript
// src/lib/supabase/client.ts (or wherever the browser client is created)
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### Scenario D: Login Form Credential Handling

If the form is mangling the email or password:

**Fix:** Ensure the login page passes credentials exactly as entered:
```typescript
const { error } = await supabase.auth.signInWithPassword({
  email: email.trim(),
  password: password,  // Do NOT trim passwords — spaces may be intentional
});
```

### Scenario E: Auth URL Configuration

If Supabase's "Site URL" or "Redirect URLs" are not configured for vialuce.ai:

**Fix:** In Supabase Dashboard → Authentication → URL Configuration:
- Site URL: `https://vialuce.ai`
- Redirect URLs: `https://vialuce.ai/**`

This shouldn't cause a 401 on password auth, but it could affect the token exchange.

### Implement the Fix

Apply whichever fix matches the Phase 0 findings. If multiple issues exist, fix all of them.

**Commit:** `HF-024 Phase 1: Fix production auth — [describe root cause]`

---

## PHASE 2: LONG-TERM AUTH RESILIENCE

Regardless of the root cause, implement these safeguards to prevent future auth issues:

### 2A: Auth Health Check Endpoint

Create `src/app/api/health/auth/route.ts`:

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return NextResponse.json({
    supabase_url_set: !!url,
    supabase_url_domain: url ? new URL(url).hostname : null,
    anon_key_set: !!key,
    anon_key_prefix: key ? key.substring(0, 20) + '...' : null,
    environment: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV || 'not-vercel',
    build_time: new Date().toISOString(),
  });
}
```

This endpoint lets you verify at any time that the production build has the correct env vars baked in. Visit `vialuce.ai/api/health/auth` to check.

### 2B: Login Page Error Diagnostics

Enhance the login page to show meaningful error messages instead of just "401":

```typescript
if (error) {
  if (error.message.includes('Invalid login credentials')) {
    setError('Email or password is incorrect.');
  } else if (error.message.includes('Email not confirmed')) {
    setError('Please confirm your email before logging in.');
  } else if (error.status === 0 || error.message.includes('fetch')) {
    setError('Cannot reach authentication server. Please check your connection.');
  } else {
    setError(`Login failed: ${error.message}`);
    console.error('Auth error details:', {
      message: error.message,
      status: error.status,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30),
    });
  }
}
```

### 2C: Environment Variable Validation at Build Time

Add to `next.config.ts` (or `.js`):

```typescript
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set. Build cannot proceed.');
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Build cannot proceed.');
}
```

This prevents Vercel from deploying a build with missing env vars — the build will fail loudly instead of deploying a broken app.

### 2D: Seed Script Idempotency Guard

Update `scripts/seed-optica-luminar.ts` to check if user already exists AND has a password before creating:

```typescript
// When creating user, always pass password
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name }
});

// If user already exists, update their password
if (error?.message?.includes('already been registered')) {
  const { data: users } = await supabase.auth.admin.listUsers();
  const existing = users.users.find(u => u.email === email);
  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, { password });
    console.log(`  Updated password for existing user: ${email}`);
  }
}
```

**Commit:** `HF-024 Phase 2: Auth resilience — health check, error diagnostics, build validation, seed guard`

---

## PHASE 3: VERIFICATION

### 3A: Local Verification

```bash
rm -rf .next && npm run build && npm run dev &
sleep 10

# Health check
curl -s http://localhost:3000/api/health/auth | python3 -m json.tool

# Auth test
curl -s -w "\nHTTP: %{http_code}" \
  -X POST "$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)/auth/v1/token?grant_type=password" \
  -H "apikey: $(grep NEXT_PUBLIC_SUPABASE_ANON .env.local | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@opticaluminar.mx","password":"demo-password-OL1"}'
```

### 3B: Production Verification (after merge to main)

After the PR is merged and Vercel deploys:

```bash
# Health check on production
curl -s https://vialuce.ai/api/health/auth | python3 -m json.tool

# Auth test on production (using the same anon key)
# The health endpoint will reveal the anon key prefix so you can verify it matches
```

### 3C: Browser Test

1. Open vialuce.ai in incognito
2. Login as admin@opticaluminar.mx / demo-password-OL1
3. Console: ZERO 401 errors
4. Should enter Optica Luminar tenant

**Commit:** `HF-024 Phase 3: Verification complete`

---

## PHASE 4: COMPLETION REPORT

Create `HF-024_COMPLETION_REPORT.md` in PROJECT ROOT.

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | Root cause identified and documented | | |
| 2 | Production auth works (vialuce.ai login succeeds) | | |
| 3 | /api/health/auth returns correct env var status | | |
| 4 | Login page shows meaningful error messages | | |
| 5 | Build fails if SUPABASE env vars missing | | |
| 6 | Seed script handles existing users with password update | | |
| 7 | Zero 401 errors in browser console after login | | |
| 8 | Build passes with zero errors | | |

**Commit:** `HF-024 Phase 4: Completion report`
**Push:** `git push origin dev`

Then create PR: `gh pr create --base main --head dev --title "HF-024: Production auth fix + long-term resilience" --body "Root cause: [from findings]. Fix: [description]. Added: health check endpoint, build-time env validation, login error diagnostics, seed idempotency guard."`

---

## CRITICAL NOTES

- Phase 0 is DIAGNOSTIC ONLY. Do not change code until root cause is identified.
- The most likely root cause is Scenario A (build-time variable embedding) — Next.js `NEXT_PUBLIC_*` vars are baked in at build time, not runtime.
- The health check endpoint (/api/health/auth) becomes a permanent diagnostic tool for future deployments.
- The build-time validation in next.config prevents silent deployment of broken builds.
- This HF addresses both the immediate 401 and the systemic pattern of auth issues recurring.
