# DIAG-009: Auth Session Persistence — Chrome Incognito Bypass
## Diagnostic — ZERO code changes

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `COMPLETION_REPORT_ENFORCEMENT.md` — report enforcement applies even to diagnostics

**If you have not read both files, STOP and read them now.**

---

## WHY THIS DIAGNOSTIC EXISTS

**Fourth occurrence of auth bypass.** Users can access the platform without logging in. A valid Supabase JWT cookie persists across Chrome browser contexts (incognito, cache clear, hard refresh). The middleware sees a valid token and routes to /stream instead of /login.

Firefox private browsing correctly redirects to /login. Chrome does not. The server-side boundary is proven correct (curl returns 307 → /login, no Set-Cookie). The problem is client-side session persistence that survives browser context boundaries.

### Previous Fix Attempts (All Insufficient)
| HF | What It Fixed | Why It Didn't Resolve This |
|----|---------------|---------------------------|
| HF-059 (PR #92) | Redirect loop — dual auth checks in middleware + layout | Addressed redirect logic, not session persistence |
| HF-061 (PR #94) | Redirect regression — client-side redirects before auth hydration | Addressed redirect timing, not session persistence |
| HF-136 (PR #249) | 4 API routes in PUBLIC_PATHS bypassing auth | Addressed route config, not session persistence |
| HF-138 (PR #251) | Cache-Control: private, no-store on middleware responses | Addressed HTTP caching, not cookie/localStorage persistence |

### The Cookie Evidence
A Supabase auth cookie captured from a Chrome incognito window (no login performed) contains:
- Valid JWT for Patricia Zambrano (admin@bancocumbre.ec)
- Token issued: 2026-03-19T12:05:01Z (auto-refreshed)
- Last explicit login: 2026-03-18T23:30:59Z (12.5 hours earlier)
- Refresh token present: enables indefinite session renewal
- Token expiry: 60-minute window, auto-refreshed before expiry

**The middleware is NOT broken.** It correctly validates the JWT. The problem is that the JWT should not exist in that browser context.

### CLT Finding
CLT122-F2: "Auth login bypassed in incognito" — OPEN since February 28, 2026.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **ZERO CODE CHANGES.** This is a diagnostic. You are reading and reporting, not fixing.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### CC CONTROL FRAMEWORK (Rules 35-38)
35. EPG mandatory for mathematical/formula phases — N/A for this diagnostic
36. No unauthorized behavioral changes — ZERO CODE CHANGES in this diagnostic
37. Lifecycle wiring requires transition proof — N/A
38. Mathematical review gate — N/A

---

## SCOPE BOUNDARIES

### IN SCOPE
- Reading and pasting configuration files related to auth, session, cookies
- Reading and pasting middleware auth logic
- Reading and pasting Supabase client configuration
- Querying Supabase auth settings via API or dashboard
- Documenting findings with pasted evidence

### OUT OF SCOPE — DO NOT TOUCH
- ANY code modification (this is read-only)
- Middleware changes
- Auth context changes
- Cookie configuration changes
- Supabase client configuration changes
- Any file in src/ — READ ONLY
- New features of any kind

### CRITICAL CONSTRAINT
**If you change even one character of application code, this diagnostic is a failure.** The ONLY files you create are the prompt file (committed Phase 0) and the completion report.

---

## PHASE 0: COMMIT THIS PROMPT

```bash
cd /Users/AndrewAfrica/spm-platform
cp DIAG-009_AUTH_SESSION_PERSISTENCE.md .
git add -A && git commit -m "DIAG-009 Phase 0: Auth session persistence diagnostic prompt" && git push origin dev
```

---

## PHASE 1: SUPABASE CLIENT CONFIGURATION

**Objective:** Identify how the Supabase client is configured for session persistence.

Run every command. Paste ALL output. Do not skip any. Do not summarize.

```bash
echo "============================================"
echo "DIAG-009 PHASE 1: SUPABASE CLIENT CONFIGURATION"
echo "============================================"

echo ""
echo "=== 1A: ALL SUPABASE CLIENT CREATION ==="
echo "--- Every file that creates a Supabase client ---"
grep -rn "createClient\|createBrowserClient\|createServerClient\|createMiddlewareClient\|createRouteHandlerClient\|createServerComponentClient" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 1B: SUPABASE CLIENT UTILITY FILES — COMPLETE CONTENTS ==="
echo "--- These are the files that configure the Supabase client ---"
for f in $(find web/src -name "*.ts" -o -name "*.tsx" | xargs grep -l "createClient\|createBrowserClient\|createServerClient\|createMiddlewareClient" 2>/dev/null | grep -v node_modules | grep -v ".next" | head -10); do
  echo ""
  echo "========== $f =========="
  cat "$f"
done

echo ""
echo "=== 1C: SUPABASE ENVIRONMENT VARIABLES ==="
grep -rn "NEXT_PUBLIC_SUPABASE\|SUPABASE_" web/.env* 2>/dev/null | grep -v node_modules
echo "--- .env.local ---"
cat web/.env.local 2>/dev/null | grep -i supabase || echo "No .env.local or no supabase vars"
echo "--- .env ---"
cat web/.env 2>/dev/null | grep -i supabase || echo "No .env or no supabase vars"

echo ""
echo "=== 1D: SUPABASE SSR PACKAGE ==="
echo "--- Which Supabase packages are installed ---"
cat web/package.json | grep -i supabase

echo ""
echo "=== 1E: persistSession / cookieOptions / storage CONFIGURATION ==="
grep -rn "persistSession\|cookieOptions\|storage.*localStorage\|storage.*cookie\|autoRefreshToken\|detectSessionInUrl" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

**Commit Phase 1 output as part of the diagnostic file.**

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "DIAG-009 Phase 1: Supabase client configuration audit" && git push origin dev
```

---

## PHASE 2: MIDDLEWARE AUTH LOGIC

**Objective:** Understand exactly how the middleware reads and validates the session.

```bash
echo "============================================"
echo "DIAG-009 PHASE 2: MIDDLEWARE AUTH LOGIC"
echo "============================================"

echo ""
echo "=== 2A: COMPLETE MIDDLEWARE FILE ==="
cat web/src/middleware.ts

echo ""
echo "=== 2B: MIDDLEWARE CONFIG (route matcher) ==="
grep -A 20 "export const config" web/src/middleware.ts

echo ""
echo "=== 2C: PUBLIC_PATHS / AUTH EXCLUSIONS ==="
grep -rn "PUBLIC_PATHS\|publicPaths\|isPublic\|skipAuth\|excludeAuth\|unprotected" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 2D: HOW MIDDLEWARE READS THE SESSION ==="
grep -n "getUser\|getSession\|auth\.\|supabase\.\|cookie\|token" web/src/middleware.ts

echo ""
echo "=== 2E: CACHE-CONTROL HEADERS (HF-138) ==="
grep -n "Cache-Control\|no-store\|no-cache\|private\|must-revalidate" web/src/middleware.ts

echo ""
echo "=== 2F: SET-COOKIE IN MIDDLEWARE ==="
grep -n "Set-Cookie\|setCookie\|cookie.*set\|response.*cookie" web/src/middleware.ts
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "DIAG-009 Phase 2: Middleware auth logic audit" && git push origin dev
```

---

## PHASE 3: AUTH CONTEXT AND SESSION MANAGEMENT

**Objective:** Understand client-side session handling — how the browser initializes, refreshes, and persists auth state.

```bash
echo "============================================"
echo "DIAG-009 PHASE 3: AUTH CONTEXT AND SESSION MANAGEMENT"
echo "============================================"

echo ""
echo "=== 3A: AUTH CONTEXT PROVIDER — COMPLETE FILE ==="
for f in $(find web/src -name "*auth*context*" -o -name "*auth*provider*" -o -name "*session*context*" -o -name "*session*provider*" | grep -v node_modules | grep -v ".next"); do
  echo ""
  echo "========== $f =========="
  cat "$f"
done

echo ""
echo "=== 3B: AUTH SERVICE / AUTH UTILITY — COMPLETE FILE ==="
for f in $(find web/src -name "*auth*service*" -o -name "*auth*util*" -o -name "*auth-shell*" | grep -v node_modules | grep -v ".next"); do
  echo ""
  echo "========== $f =========="
  cat "$f"
done

echo ""
echo "=== 3C: onAuthStateChange LISTENERS ==="
grep -rn "onAuthStateChange\|authStateChange\|SIGNED_IN\|SIGNED_OUT\|TOKEN_REFRESHED\|INITIAL_SESSION" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 3D: LOGOUT / SIGN OUT IMPLEMENTATION ==="
grep -rn "signOut\|sign_out\|logout\|logOut" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 3E: LOGIN PAGE — COMPLETE FILE ==="
cat web/src/app/login/page.tsx

echo ""
echo "=== 3F: AUTH CALLBACK — COMPLETE FILE ==="
cat web/src/app/auth/callback/route.ts 2>/dev/null || echo "No auth/callback/route.ts"
cat web/src/app/api/auth/callback/route.ts 2>/dev/null || echo "No api/auth/callback/route.ts"
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "DIAG-009 Phase 3: Auth context and session management audit" && git push origin dev
```

---

## PHASE 4: COOKIE CONFIGURATION AND BEHAVIOR

**Objective:** Determine exact cookie attributes set by the platform and Supabase.

```bash
echo "============================================"
echo "DIAG-009 PHASE 4: COOKIE CONFIGURATION"
echo "============================================"

echo ""
echo "=== 4A: ALL COOKIE REFERENCES IN CODEBASE ==="
grep -rn "cookie\|Cookie" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "// " | grep -v "cookieconsent" | head -40

echo ""
echo "=== 4B: SUPABASE COOKIE NAME PATTERN ==="
grep -rn "sb-.*-auth-token\|supabase.*cookie\|COOKIE_NAME\|cookieName" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 4C: COOKIE OPTIONS (maxAge, sameSite, secure, httpOnly, path, domain) ==="
grep -rn "maxAge\|max-age\|SameSite\|sameSite\|httpOnly\|HttpOnly\|Secure\|secure.*true\|domain.*cookie\|path.*cookie" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 4D: SUPABASE SSR COOKIE HANDLING ==="
echo "--- @supabase/ssr source for cookie defaults ---"
find web/node_modules/@supabase/ssr -name "*.js" -o -name "*.ts" | head -10
echo ""
echo "--- Cookie serialization in @supabase/ssr ---"
grep -rn "serialize\|maxAge\|sameSite\|httpOnly\|secure\|expires\|Max-Age" web/node_modules/@supabase/ssr/dist/ 2>/dev/null | head -20

echo ""
echo "=== 4E: NEXT.JS COOKIES API USAGE ==="
grep -rn "cookies()\|nextCookies\|RequestCookies\|ResponseCookies" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 4F: CURL TEST — COOKIE HEADERS ON UNAUTHENTICATED REQUEST ==="
echo "--- What cookies does the server set on a fresh request? ---"
curl -sI https://vialuce.ai/ 2>&1 | grep -i "set-cookie\|location\|cache-control\|HTTP/"
echo ""
curl -sI https://vialuce.ai/stream 2>&1 | grep -i "set-cookie\|location\|cache-control\|HTTP/"
echo ""
curl -sI https://vialuce.ai/login 2>&1 | grep -i "set-cookie\|location\|cache-control\|HTTP/"
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "DIAG-009 Phase 4: Cookie configuration audit" && git push origin dev
```

---

## PHASE 5: TOKEN REFRESH MECHANISM

**Objective:** Understand how and when the Supabase client refreshes tokens, and whether refresh tokens can be revoked server-side.

```bash
echo "============================================"
echo "DIAG-009 PHASE 5: TOKEN REFRESH MECHANISM"
echo "============================================"

echo ""
echo "=== 5A: AUTO-REFRESH CONFIGURATION ==="
grep -rn "autoRefreshToken\|refreshSession\|refresh_token\|setSession\|startAutoRefresh\|stopAutoRefresh" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 5B: SUPABASE AUTH CONFIG IN GOTRUE / AUTH JS ==="
echo "--- Default auth options in @supabase/auth-js ---"
grep -rn "autoRefreshToken\|persistSession\|storageKey\|storage:" web/node_modules/@supabase/auth-js/dist/ 2>/dev/null | head -20
echo ""
grep -rn "autoRefreshToken\|persistSession\|storageKey\|storage:" web/node_modules/@supabase/gotrue-js/dist/ 2>/dev/null | head -20

echo ""
echo "=== 5C: STORAGE ADAPTER ==="
echo "--- What storage does Supabase use for session persistence? ---"
grep -rn "localStorage\|sessionStorage\|cookieStorage\|memoryStorage\|customStorage" web/node_modules/@supabase/ssr/dist/ 2>/dev/null | head -20
echo ""
grep -rn "localStorage\|sessionStorage" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "// "

echo ""
echo "=== 5D: SUPABASE PROJECT AUTH SETTINGS ==="
echo "--- Check if JWT expiry, refresh token rotation, or session limits are configured ---"
echo "(These are set in Supabase Dashboard > Authentication > Settings)"
echo "The JWT secret and expiry from environment:"
grep -i "JWT_SECRET\|JWT_EXPIRY\|jwt_exp\|JWT_EXP" web/.env* 2>/dev/null || echo "No JWT config in env files"

echo ""
echo "=== 5E: ROOT LAYOUT — DOES IT INITIALIZE SUPABASE CLIENT? ==="
cat web/src/app/layout.tsx
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "DIAG-009 Phase 5: Token refresh mechanism audit" && git push origin dev
```

---

## PHASE 6: FINDINGS SYNTHESIS

**Objective:** Compile all Phase 1-5 evidence into a structured findings document.

Create file `DIAG-009_FINDINGS.md` in project root with this structure:

```markdown
# DIAG-009 FINDINGS: Auth Session Persistence
## Date: [today]

## EXECUTIVE SUMMARY
[One paragraph: what causes the auth bypass, which layer is responsible, and what class of fix is required]

## EVIDENCE SUMMARY

### 1. Supabase Client Configuration
- persistSession: [value from Phase 1E, or default if not set]
- autoRefreshToken: [value from Phase 1E, or default if not set]
- Storage adapter: [localStorage / cookie / custom — from Phase 1B]
- Client creation pattern: [browser/server/middleware — from Phase 1A]

### 2. Middleware Auth Check
- How session is read: [getUser / getSession / JWT decode — from Phase 2D]
- What happens when no session: [redirect to /login / return 401 — from Phase 2A]
- PUBLIC_PATHS: [list from Phase 2C]
- Cache-Control headers: [present/absent, values — from Phase 2E]

### 3. Client-Side Session Management
- Auth state listener: [present/absent — from Phase 3C]
- Token refresh behavior: [auto-refresh enabled/disabled — from Phase 5A]
- Logout implementation: [client-only / server-side revocation — from Phase 3D]

### 4. Cookie Attributes
- Cookie name: [from Phase 4B]
- SameSite: [value — from Phase 4C]
- HttpOnly: [value — from Phase 4C]
- Secure: [value — from Phase 4C]
- Max-Age / Expires: [value — from Phase 4C]
- Domain / Path: [value — from Phase 4C]

### 5. Token Refresh
- Refresh token rotation: [enabled/disabled]
- Session lifetime: [duration before forced re-login]
- Server-side session revocation: [available/not available]

## ROOT CAUSE ANALYSIS
[Based on evidence: why does the cookie persist in Chrome incognito when it should not?]

### Hypothesis A: Supabase persistSession stores in localStorage
[Evidence for/against from Phase 1E, 5C]

### Hypothesis B: Supabase cookie lacks proper attributes
[Evidence for/against from Phase 4C — missing SameSite, missing Secure, etc.]

### Hypothesis C: Supabase SSR middleware sets cookies on every response
[Evidence for/against from Phase 2F, 4A]

### Hypothesis D: Root layout initializes client which triggers auto-refresh
[Evidence for/against from Phase 5E, 3A]

### Hypothesis E: Refresh token has no server-side expiry/rotation
[Evidence for/against from Phase 5D]

## CONFIRMED ROOT CAUSE
[Which hypothesis or combination is confirmed by the evidence]

## RECOMMENDED FIX APPROACH
[Structural fix description — what needs to change and in which layer]
[This section informs HF-146 but does NOT implement anything]

## SECURITY IMPACT ASSESSMENT
- Can an unauthenticated user access tenant data? [Yes/No + conditions]
- Can a different user on the same machine access another user's data? [Yes/No + conditions]
- Is this Chrome-specific or platform-wide? [Evidence: Firefox test]
- Does this affect production? [Yes — reproducible]
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "DIAG-009 Phase 6: Findings synthesis" && git push origin dev
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `DIAG-009_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Supabase client config documented | Phase 1 output pasted: persistSession, autoRefreshToken, storage adapter, cookie options |
| PG-2 | Middleware auth logic documented | Phase 2 output pasted: complete middleware.ts, PUBLIC_PATHS, session reading method |
| PG-3 | Client-side session management documented | Phase 3 output pasted: auth context, onAuthStateChange, signOut, login page, auth callback |
| PG-4 | Cookie attributes documented | Phase 4 output pasted: cookie name, SameSite, HttpOnly, Secure, Max-Age, curl test results |
| PG-5 | Token refresh mechanism documented | Phase 5 output pasted: autoRefreshToken config, storage adapter, root layout |
| PG-6 | DIAG-009_FINDINGS.md exists in project root | File created with all sections populated with evidence |
| PG-7 | Root cause identified with evidence | CONFIRMED ROOT CAUSE section cites specific Phase output |
| PG-8 | Fix approach documented | RECOMMENDED FIX APPROACH describes structural change (not workaround) |
| PG-9 | ZERO code changes | `git diff --stat HEAD~6..HEAD` shows ONLY .md files |
| PG-10 | npm run build exits 0 | Build clean — no code was changed, so build must still pass |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Fixing the bug instead of diagnosing it | ZERO CODE CHANGES — this is a diagnostic |
| AP-2 | Summarizing instead of pasting | Every finding must include pasted grep/cat output |
| AP-3 | Guessing the root cause | Hypotheses must cite specific Phase evidence |
| AP-4 | Recommending a workaround | Standing Rule 34 — structural fix only |
| AP-5 | Skipping the curl test | Phase 4F curl is critical — proves server behavior |
| AP-6 | Ignoring @supabase/ssr defaults | Phase 4D and 5B examine the library defaults |

---

*ViaLuce.ai — The Way of Light*
*DIAG-009: "Four fixes at the wrong layer. This time, find the right one."*
