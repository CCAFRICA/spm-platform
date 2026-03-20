# DIAG-011: AUTH EVENT LOGGING — ROOT CAUSE DIAGNOSTIC
## Priority: P0 — Prerequisite to compliance fix
## Date: March 20, 2026
## Type: DIAGNOSTIC ONLY — Zero code changes
## Purpose: Determine with 100% certainty why auth events are missing or malformed

---

## CC_STANDING_ARCHITECTURE_RULES (v3.0)

Include the full CC_STANDING_ARCHITECTURE_RULES.md at the top of this prompt. All rules apply.

---

## CONTEXT

HF-149 (PR #278) and HF-150 (PR #279) attempted to fix auth event logging. After BOTH PRs merged and deployed, production testing reveals 5 persistent failures:

| # | Failure | Evidence | Attempts to Fix |
|---|---------|----------|-----------------|
| 1 | **`auth.login.success` NEVER appears** | Zero rows across 4 test cycles, 2 PRs. Vercel logs show `GET /api/auth/log-event → 307` at exact login.success moment. | HF-149 (not wired), HF-150 (claimed wired — still fails) |
| 2 | **Patricia logout `tenant_id` always NULL** | Should be BCL UUID `b1c2d3e4-aaaa-bbbb-cccc-111111111111`. VL Admin logout NULL is correct. Patricia NULL is wrong. | HF-150 claimed explicit pass — still NULL |
| 3 | **`auth.login.failure` reason always NULL** | `payload->>'reason'` returns NULL. Should contain error message. | HF-150 claimed wired with reason — still NULL |
| 4 | **3 duplicate `auth.mfa.verify.success` per Patricia login** | Consistent across all test cycles. Rows are 10+ seconds apart so deduplication window doesn't catch them. | HF-150 added 5-second dedup — doesn't help |
| 5 | **`POST /api/auth/log-event → 307` during login flow** | Vercel logs show POST becoming 307 redirect at specific moments in the auth flow. Events lost. | HF-150 added GET 405 handler — POST 307 is different issue |

**What works correctly:**
- `auth.login.failure` — row exists with email (reason NULL)
- `auth.mfa.verify.success` — row exists with actor_id, email, correct tenant_id for Patricia
- `auth.logout` — row exists with actor_id, email (but tenant_id wrong for Patricia)
- Service role INSERT succeeds (rows appear in table)
- IP + user_agent captured in payload

---

## DIAGNOSTIC RULES

1. **ZERO code changes.** This is a read-only diagnostic. Do not modify any file.
2. **Paste COMPLETE file contents** for every file examined. Not excerpts, not summaries — the full file.
3. **Trace each event type** through its complete code path: trigger → logAuthEventClient → fetch → API route → INSERT.
4. **For each failure, identify the EXACT line** where the failure occurs and explain WHY.
5. **Do not hypothesize.** State only what the code proves.

---

## PHASE 1: THE LOGGING INFRASTRUCTURE

### 1A: The Logger Function

```bash
echo "============================================"
echo "DIAG-011 PHASE 1A: LOGGER IMPLEMENTATION"
echo "============================================"

echo ""
echo "=== auth-logger.ts — COMPLETE FILE ==="
cat web/src/lib/auth/auth-logger.ts

echo ""
echo "=== ALL EXPORTS from auth-logger ==="
grep -n "export" web/src/lib/auth/auth-logger.ts
```

**Questions this answers:**
- What is the function signature of `logAuthEventClient`?
- Does it accept explicit `actor_id`, `email`, `tenant_id` parameters?
- Where is the 5-second deduplication? What key does it deduplicate on?
- What is the fetch URL? Is it relative (`/api/auth/log-event`) or absolute?
- What HTTP method does the fetch use?
- What headers does it send?
- What body does it send?

### 1B: The API Route

```bash
echo ""
echo "============================================"
echo "DIAG-011 PHASE 1B: API ROUTE"
echo "============================================"

echo ""
echo "=== /api/auth/log-event/route.ts — COMPLETE FILE ==="
cat web/src/app/api/auth/log-event/route.ts
```

**Questions this answers:**
- Does the POST handler exist?
- Does the GET handler exist and return 405?
- How does it resolve actor_id? From cookies? From request body?
- How does it resolve tenant_id? From cookies? From request body?
- How does it resolve email? From cookies? From request body?
- Does it use the service role client for INSERT?
- What columns does it INSERT into platform_events?
- Does it include `reason` in the payload JSONB?
- What error handling exists? Does it swallow errors?

---

## PHASE 2: THE LOGIN FLOW

### 2A: Login Page

```bash
echo ""
echo "============================================"
echo "DIAG-011 PHASE 2: LOGIN FLOW"
echo "============================================"

echo ""
echo "=== Login Page — COMPLETE FILE ==="
cat web/src/app/login/page.tsx
```

**Questions this answers:**
- Where is `signInWithPassword` called?
- Is `logAuthEventClient('auth.login.success')` called AFTER successful sign-in?
- Is `logAuthEventClient('auth.login.failure')` called in the error/catch block?
- What arguments are passed? Is email passed explicitly?
- Is there a redirect (router.push, window.location) IMMEDIATELY after sign-in that could interrupt the fetch?
- Is the logAuthEventClient call `await`ed or fire-and-forget?
- Could the redirect race with the fetch?

### 2B: Auth Callback (if exists)

```bash
echo ""
echo "=== Auth Callback Route — if exists ==="
cat web/src/app/auth/callback/route.ts 2>/dev/null || echo "NOT FOUND: web/src/app/auth/callback/route.ts"
cat web/src/app/api/auth/callback/route.ts 2>/dev/null || echo "NOT FOUND: web/src/app/api/auth/callback/route.ts"
```

### 2C: Auth Service

```bash
echo ""
echo "=== Auth Service — COMPLETE FILE ==="
cat web/src/lib/supabase/auth-service.ts
```

**Questions this answers:**
- Is `logAuthEventClient` called from auth-service.ts instead of (or in addition to) the login page?
- Could there be TWO call sites for login.success — one that works and one that doesn't?

---

## PHASE 3: THE LOGOUT FLOW

### 3A: Every signOut Call Site

```bash
echo ""
echo "============================================"
echo "DIAG-011 PHASE 3: LOGOUT FLOW"
echo "============================================"

echo ""
echo "=== EVERY FILE CONTAINING signOut ==="
grep -rn "signOut" web/src/ --include="*.ts" --include="*.tsx" -l | grep -v node_modules | grep -v ".next" | while read f; do
  echo ""
  echo "=== $f — COMPLETE FILE ==="
  cat "$f"
done
```

**Questions this answers:**
- Where is signOut called?
- Is getUser() called BEFORE signOut?
- Is tenant_id captured BEFORE signOut?
- What value is passed as tenant_id for Patricia? Where does it come from?
- Is the auth context or profile still accessible at the point where tenant_id is read?
- Could the auth context have already cleared tenant_id before the log call?

---

## PHASE 4: THE MFA FLOW

### 4A: MFA Verify Page

```bash
echo ""
echo "============================================"
echo "DIAG-011 PHASE 4: MFA FLOW"
echo "============================================"

echo ""
echo "=== MFA Verify Page — COMPLETE FILE ==="
cat web/src/app/auth/mfa/verify/page.tsx
```

**Questions this answers:**
- Where is logAuthEventClient('auth.mfa.verify.success') called?
- Is it inside a useEffect that could re-run on re-render?
- Is it inside the verify handler with a loading guard?
- What triggers 3 separate events 10+ seconds apart?
- Is there a loop, retry, or re-render cycle?

### 4B: MFA Enroll Page

```bash
echo ""
echo "=== MFA Enroll Page — COMPLETE FILE ==="
cat web/src/app/auth/mfa/enroll/page.tsx
```

---

## PHASE 5: THE SESSION MONITOR

### 5A: Session Monitor Implementation

```bash
echo ""
echo "============================================"
echo "DIAG-011 PHASE 5: SESSION MONITOR"
echo "============================================"

echo ""
echo "=== ALL session monitor files ==="
find web/src -name "*session*" -o -name "*Session*" | grep -v node_modules | grep -v ".next" | while read f; do
  echo ""
  echo "=== $f ==="
  cat "$f"
done
```

**Questions this answers:**
- Does the session monitor redirect at 30 minutes or just show a banner?
- Does it hide content (sessionExpired state)?
- Does it call signOut before redirect?
- Does it log auth.session.expiry?

### 5B: Session Monitor Integration

```bash
echo ""
echo "=== Where is session monitor mounted? ==="
grep -rn "SessionMonitor\|SessionExpiry\|session-monitor\|sessionMonitor" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

---

## PHASE 6: THE MIDDLEWARE

### 6A: Middleware — Complete File

```bash
echo ""
echo "============================================"
echo "DIAG-011 PHASE 6: MIDDLEWARE"
echo "============================================"

echo ""
echo "=== middleware.ts — COMPLETE FILE ==="
cat web/src/middleware.ts
```

**Questions this answers:**
- Does the middleware check vialuce-session-start and vialuce-last-activity cookies?
- Does the middleware intercept `/api/auth/log-event`? Is it in PUBLIC_PATHS?
- Could the middleware be redirecting the POST to `/api/auth/log-event` → 307 because the session isn't fully established yet during the login flow?
- Does the middleware update vialuce-last-activity on every request (including auto-refresh)?

**CRITICAL HYPOTHESIS TO VERIFY:** The `POST /api/auth/log-event → 307` seen in Vercel logs may be the MIDDLEWARE redirecting the request because it doesn't recognize the user's session during the login transition. If `/api/auth/log-event` is NOT in PUBLIC_PATHS, the middleware would redirect unauthenticated requests to /login — which becomes a 307. This would explain why login.success always fails: at the moment login.success fires, the session cookie may not yet be readable by the middleware.

---

## PHASE 7: THE REQUEST FLOW TRACE

### 7A: Reproduce the exact failure

```bash
echo ""
echo "============================================"
echo "DIAG-011 PHASE 7: REQUEST FLOW TRACE"
echo "============================================"

echo ""
echo "=== Is /api/auth/log-event in PUBLIC_PATHS? ==="
grep -n "PUBLIC_PATHS\|public.*path\|publicPath" web/src/middleware.ts
echo ""
echo "=== Full PUBLIC_PATHS array ==="
grep -A 30 "PUBLIC_PATHS\|publicPaths\|public_paths" web/src/middleware.ts | head -40

echo ""
echo "=== Does middleware match /api/auth/log-event? ==="
grep -n "api/auth\|log-event\|api.*auth.*log" web/src/middleware.ts

echo ""
echo "=== Middleware matcher config ==="
grep -A 10 "export const config\|matcher" web/src/middleware.ts
```

**This is the most likely root cause.** If the middleware requires authentication for `/api/auth/log-event`, then:
- During login: session cookie just created → middleware can't validate it yet → 307 redirect → login.success event LOST
- During MFA verify: session exists at aal1 → middleware may accept or reject depending on AAL check → explains inconsistent behavior
- During logout: session about to be destroyed → timing race

### 7B: Cookie State During Login

```bash
echo ""
echo "=== Cookie configuration ==="
cat web/src/lib/supabase/cookie-config.ts 2>/dev/null || find web/src -name "*cookie*config*" -o -name "*cookie*" | grep -v node_modules | grep -v ".next" | while read f; do echo "=== $f ==="; cat "$f"; done

echo ""
echo "=== How Supabase client is created for API routes ==="
grep -rn "createServerClient\|createRouteHandlerClient\|createClient" web/src/app/api/auth/log-event/route.ts
```

---

## PHASE 8: EVIDENCE SUMMARY

After examining all files, CC must produce a root cause summary in this EXACT format:

```markdown
## ROOT CAUSE ANALYSIS — EVIDENCE-BASED

### Failure 1: auth.login.success never appears
- **File:** [exact file path]
- **Line:** [exact line number]
- **What happens:** [exact description based on code]
- **Why it fails:** [exact reason with code evidence]
- **Certainty:** [100% if proven by code, <100% if hypothesis]

### Failure 2: Patricia logout tenant_id = NULL
- **File:** [exact file path]
- **Line:** [exact line number]
- **What happens:** [exact description]
- **Why it fails:** [exact reason]
- **Certainty:** [%]

### Failure 3: login.failure reason = NULL
- **File:** [exact file path]
- **Line:** [exact line number]
- **What happens:** [exact description]
- **Why it fails:** [exact reason]
- **Certainty:** [%]

### Failure 4: 3 duplicate MFA verify events
- **File:** [exact file path]
- **Line:** [exact line number]
- **What happens:** [exact description]
- **Why it triggers 3 times:** [exact reason]
- **Certainty:** [%]

### Failure 5: POST /api/auth/log-event → 307
- **File:** [exact file path]
- **Line:** [exact line number]
- **What intercepts the POST:** [exact mechanism]
- **Why 307 instead of 200:** [exact reason]
- **Certainty:** [%]
```

**If CC cannot determine a root cause with certainty from the code, CC MUST state "INCONCLUSIVE — requires runtime debugging" rather than guessing.**

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `DIAG-011_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final push
- Contains ALL file contents examined (FULL files, not excerpts)
- Contains the evidence summary in the EXACT format above
- Committed to git as part of the batch

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | auth-logger.ts full content pasted | Complete file in report |
| PG-2 | /api/auth/log-event/route.ts full content pasted | Complete file in report |
| PG-3 | Login page full content pasted | Complete file in report |
| PG-4 | Every signOut call site full content pasted | Complete files in report |
| PG-5 | MFA verify page full content pasted | Complete file in report |
| PG-6 | Session monitor full content pasted | Complete file(s) in report |
| PG-7 | middleware.ts full content pasted | Complete file in report |
| PG-8 | PUBLIC_PATHS identified | Exact array contents in report |
| PG-9 | Root cause for each failure stated with certainty % | Evidence summary in exact format |
| PG-10 | No code changes made | git diff shows zero modifications |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Modifying any file | This is DIAGNOSTIC ONLY. Zero changes. |
| AP-2 | Summarizing file contents instead of pasting | COMPLETE files required. Every line matters. |
| AP-3 | Guessing at root cause without code evidence | State "INCONCLUSIVE" if uncertain. |
| AP-4 | Proposing fixes in this diagnostic | Fixes come in HF-151 AFTER root causes are confirmed. |
| AP-5 | Examining only the happy path | Trace the FAILING path for each event type. |

---

## WHAT HAPPENS NEXT

1. DIAG-011 produces evidence
2. Andrew + Claude review the root cause analysis
3. Claude drafts HF-151 with 100% certainty of what to fix
4. HF-151 is the LAST auth logging HF — it must close ALL 5 failures in one PR

---

## PR

```bash
gh pr create --base main --head dev \
  --title "DIAG-011: Auth Event Logging Root Cause Analysis (read-only diagnostic)" \
  --body "## Pure diagnostic — ZERO code changes

Examines every file in the auth event logging chain to determine with 100% certainty
why 5 persistent failures survive across HF-149 and HF-150:

1. auth.login.success never logged
2. Patricia logout tenant_id always NULL
3. login.failure reason always NULL  
4. 3 duplicate MFA verify events per login
5. POST /api/auth/log-event → 307 during login flow

Full file contents + evidence-based root cause analysis in DIAG-011_COMPLETION_REPORT.md

## NO CODE CHANGES — git diff is empty"
```

---

*ViaLuce.ai — The Way of Light*
*DIAG-011: "Diagnose with evidence. Fix with certainty."*
