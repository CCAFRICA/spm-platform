# HF-147: Auth Compliance Gap Closure — OB-178 Remaining Items
## Closes all gaps identified in CLT-178 production testing

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `COMPLETION_REPORT_ENFORCEMENT.md` — report enforcement applies
3. `DIAG-009_FINDINGS.md` — auth root cause reference
4. `OB-178_COMPLETION_REPORT.md` — what was delivered, what was missed

**If you have not read all four files, STOP and read them now.**

---

## WHY THIS HF EXISTS

OB-178 delivered the core auth security compliance (cookie hardening, signOut global, MFA pages, auth context refactoring, flywheel fix). Production testing (CLT-178) identified 6 gaps that must be closed for full DS-019 compliance. This HF closes all of them in a single PR.

### Gap Inventory

| # | Gap | Source | Severity |
|---|-----|--------|----------|
| G1 | VL Admin (platform role) not redirected to MFA enrollment | CLT-178 localhost test | P0 — platform role has cross-tenant access |
| G2 | Session expiry warning (25 min idle banner) not built | DS-019 Section 4.5 | P1 — UX requirement |
| G3 | Auth event logging returns 403 (RLS blocks INSERT) | CLT-178 console error | P1 — audit trail broken |
| G4 | Auth logging incomplete — only 3 of 7+ events wired | OB-178 PG-15 | P1 — SOC 2 audit coverage |
| G5 | Browser client write-only not verified | OB-178 PG-12 | P2 — architectural verification |
| G6 | Compliance verification (Phase G) not executed | OB-178 PG-16 | P2 — evidentiary gate |

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### CC CONTROL FRAMEWORK (Rules 35-39)
35. EPG mandatory for mathematical/formula phases — N/A
36. No unauthorized behavioral changes — fix ONLY the listed gaps
37. Lifecycle wiring requires transition proof — N/A
38. Mathematical review gate — N/A
39. **COMPLIANCE VERIFICATION GATE** — Phase 5 runs the full compliance verification from OB-178 Phase G

---

## SCOPE BOUNDARIES

### IN SCOPE
- Fix VL Admin MFA enforcement in middleware
- Build session expiry warning component
- Fix auth logging RLS (platform_events INSERT policy)
- Wire remaining auth event log calls (MFA enroll, MFA verify, session expiry, permission denied)
- Verify browser client is write-only (grep + document)
- Run OB-178 Phase G compliance verification and paste output

### OUT OF SCOPE — DO NOT TOUCH
- Cookie configuration (already correct)
- signOut implementation (already correct)
- Provider-agnostic session cookies (already correct)
- MFA enrollment/challenge pages (already working)
- Auth context refactoring (already working)
- Flywheel fix (already working with EPG)
- Calculation engine, SCI pipeline, Intelligence Stream
- RLS policies on any table OTHER than platform_events
- New features of any kind

---

## PHASE 0: COMMIT THIS PROMPT + DIAGNOSTIC

```bash
cd /Users/AndrewAfrica/spm-platform
cp HF-147_AUTH_COMPLIANCE_GAP_CLOSURE.md .
git add -A && git commit -m "HF-147 Phase 0: Auth compliance gap closure prompt" && git push origin dev
```

Then diagnose the gaps:

```bash
echo "============================================"
echo "HF-147 PHASE 0: GAP DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== G1: VL ADMIN MFA ENFORCEMENT ==="
echo "--- Find the MFA role check in middleware ---"
grep -n "MFA_REQUIRED\|platform.*mfa\|role.*mfa\|aal\|getAuthenticatorAssuranceLevel" web/src/middleware.ts

echo ""
echo "=== G2: SESSION EXPIRY WARNING ==="
echo "--- Does session-monitor exist? ---"
find web/src -name "*session*monitor*" -o -name "*session*warning*" -o -name "*expiry*" | grep -v node_modules | grep -v ".next"
echo "--- Is it integrated into auth context or layout? ---"
grep -rn "sessionMonitor\|startSessionMonitor\|SessionWarning\|expiryWarning\|idleWarning" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== G3: AUTH LOGGING RLS ==="
echo "--- Current RLS policies on platform_events ---"
echo "Run this SQL in Supabase:"
echo "SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual FROM pg_policies WHERE tablename = 'platform_events';"

echo ""
echo "=== G4: AUTH LOGGING COMPLETENESS ==="
echo "--- All logAuthEvent call sites ---"
grep -rn "logAuthEvent" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== G5: BROWSER CLIENT USAGE ==="
echo "--- Every file that imports or uses the browser Supabase client ---"
grep -rn "createBrowserClient\|from.*supabase/client\|from.*lib/supabase/client" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
echo ""
echo "--- What operations are called on the browser client? ---"
grep -rn "supabase\.\|\.auth\.\|\.from(" web/src/app/login/ web/src/app/auth/ web/src/lib/supabase/auth-service.ts --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | head -30

echo ""
echo "=== G6: EXISTING COMPLIANCE VERIFICATION ==="
echo "--- Run OB-178 Phase G checks ---"
echo "SOC 2 CC6 — Session Controls:"
grep -rn "SESSION_LIMITS\|IDLE_TIMEOUT\|ABSOLUTE_TIMEOUT\|session-start\|last-activity" web/src/middleware.ts
echo ""
echo "SOC 2 CC6 — Session Revocation:"
grep -rn "scope.*global" web/src/ --include="*.ts" | grep -v node_modules
echo ""
echo "OWASP — Cookie Attributes:"
grep -rn "maxAge.*28800\|8.*60.*60\|secure.*true\|sameSite" web/src/lib/supabase/cookie-config.ts 2>/dev/null
echo ""
echo "OWASP — No 400-day Cookie:"
grep -rn "400.*24.*60\|34560000" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-147 Phase 0: Gap diagnostic complete" && git push origin dev
```

---

## PHASE 1: FIX VL ADMIN MFA ENFORCEMENT (G1)

**Objective:** The `platform` role must be redirected to MFA enrollment, same as `admin`.

The middleware AAL check already works for `admin` (proven in production). The gap is that `platform` is either not in the `MFA_REQUIRED_ROLES` array, or the check has a code path that skips for platform users (e.g., tenant_id NULL handling).

### Investigation
Read the middleware's MFA section carefully. Find where the role check happens and why `platform` is excluded. Common causes:
- `platform` not in the `MFA_REQUIRED_ROLES` array
- The profile lookup fails for platform (tenant_id IS NULL) and the role check never executes
- The middleware short-circuits for platform users before reaching the AAL check (e.g., an early return for tenant_id NULL)

### Fix
Ensure `platform` is in `MFA_REQUIRED_ROLES` AND the code path reaches the AAL check even when tenant_id is NULL. The platform role is the MOST important role to enforce MFA on — it has cross-tenant access to all financial data.

### Verification
```bash
# MFA_REQUIRED_ROLES includes platform
grep -A 3 "MFA_REQUIRED_ROLES" web/src/middleware.ts

# The code path reaches AAL check for platform users
# Trace the middleware logic for a user with role=platform, tenant_id=null
grep -n "tenant_id.*null\|role.*platform\|aal\|mfa" web/src/middleware.ts
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-147 Phase 1: VL Admin (platform role) MFA enforcement fixed" && git push origin dev
```

---

## PHASE 2: SESSION EXPIRY WARNING (G2)

**Objective:** When a user has been idle for 25 minutes (5 minutes before the 30-minute timeout), show a non-intrusive banner warning them.

### Create Session Monitor

Create `web/src/components/session/SessionExpiryWarning.tsx`:

A client component that:
1. Tracks user activity (mousedown, keydown, scroll, touchstart) — passive listeners
2. After 25 minutes of no activity, shows a banner at the top of the page: "Your session will expire in 5 minutes due to inactivity. Click anywhere to stay logged in."
3. When user interacts (any activity event), the banner dismisses and the timer resets
4. Uses the `SESSION_LIMITS.WARNING_BEFORE_IDLE_MS` constant from cookie-config.ts
5. Calls `stopSessionMonitor()` on unmount

**Keep this SIMPLE.** A single banner div with a text message. No modals, no countdown timers, no complex animations. The server enforces timeout — this just warns.

### Integrate

Add `<SessionExpiryWarning />` to the root layout or the AuthProvider's rendered output — it should only render when the user is authenticated.

### Verification
```bash
# Component exists
ls web/src/components/session/SessionExpiryWarning.tsx

# Integrated in layout or auth provider
grep -rn "SessionExpiryWarning" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-147 Phase 2: Session expiry warning banner" && git push origin dev
```

---

## PHASE 3: FIX AUTH EVENT LOGGING (G3 + G4)

**Objective:** Fix the 403 error on platform_events INSERT and wire all 7+ auth event types.

### G3: Fix RLS on platform_events

The `platform_events` table has `tenant_id NOT NULL`. Auth events from the middleware may not have a tenant_id context (e.g., login events happen before tenant context is established).

**Two possible fixes (choose the architecturally correct one):**

**Option A:** Use the service role client for auth logging. Auth events are system-level operations that bypass RLS intentionally. Create a server-side logging function that uses the service role Supabase client (which already exists for admin operations).

**Option B:** Add an RLS INSERT policy for authenticated users on platform_events that allows inserts where actor_id = auth.uid().

**Option A is preferred** — auth logging is a system-level concern, and the service role client is the correct tool. The admin/member Supabase client should not need INSERT on platform_events.

### G4: Wire Remaining Auth Events

The logAuthEvent function exists. Wire it at these additional call sites:

| Event | Where to Add | Trigger |
|-------|-------------|---------|
| auth.mfa.enroll | MFA enrollment page, after successful verify | supabase.auth.mfa.verify succeeds |
| auth.mfa.verify.success | MFA challenge page, after successful verify | supabase.auth.mfa.verify succeeds |
| auth.mfa.verify.failure | MFA challenge page, after failed verify | supabase.auth.mfa.verify fails |
| auth.session.expired.idle | Middleware, when idle timeout triggers | vialuce-last-activity check fails |
| auth.session.expired.absolute | Middleware, when absolute timeout triggers | vialuce-session-start check fails |
| auth.permission.denied | Middleware, when role/AAL check fails redirect | Redirect to /unauthorized or /auth/mfa |

**Important:** If using service role client for logging, the logAuthEvent function must be updated to accept or create a service role client instead of using the user's client.

### Verification
```bash
# Auth logging uses service role (no 403)
grep -rn "service.*role\|createServiceClient\|SUPABASE_SERVICE_ROLE" web/src/lib/auth/auth-logger.ts

# All 7+ event types wired
grep -rn "logAuthEvent" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l
echo "Should be 9+ call sites (login success, login failure, logout, mfa enroll, mfa verify success, mfa verify failure, session expired idle, session expired absolute, permission denied)"

# Event types match DS-019 Section 8
grep -rn "auth\.\|AuthEventType" web/src/lib/auth/auth-logger.ts
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-147 Phase 3: Auth event logging fixed (service role) and all events wired" && git push origin dev
```

---

## PHASE 4: BROWSER CLIENT VERIFICATION (G5)

**Objective:** Verify and document that the browser Supabase client is used ONLY for write operations (login, logout, MFA).

```bash
echo "============================================"
echo "HF-147 PHASE 4: BROWSER CLIENT AUDIT"
echo "============================================"

echo ""
echo "=== Every import of browser client ==="
grep -rn "from.*lib/supabase/client\|from.*supabase/client\|createBrowserClient" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== Operations called on browser client ==="
echo "--- Searching for getUser, getSession, onAuthStateChange on browser client ---"
for f in $(grep -rl "from.*lib/supabase/client\|from.*supabase/client" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"); do
  echo ""
  echo "=== $f ==="
  grep -n "getUser\|getSession\|onAuthStateChange\|signIn\|signOut\|mfa\.\|\.from(" "$f" | head -20
done
```

If any file uses the browser client for `getUser()` or `getSession()` (read operations), document it as a finding. If it's in the auth context for signout detection only (listening for SIGNED_OUT event), that's acceptable — document why.

Add a comment block at the top of `web/src/lib/supabase/client.ts`:

```typescript
// OB-178 / DS-019 Section 4.3: Browser Supabase Client
// WRITE-ONLY for auth operations:
//   - signInWithPassword (login)
//   - signOut (logout)
//   - mfa.enroll / mfa.challenge / mfa.verify (MFA ceremony)
//   - onAuthStateChange (SIGNED_OUT detection only — not for session init)
// READ operations (getUser, getSession) are done SERVER-SIDE
// via getServerAuthState() in server-auth.ts
// Do NOT add getUser() or getSession() calls using this client.
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-147 Phase 4: Browser client write-only audit and documentation" && git push origin dev
```

---

## PHASE 5: COMPLIANCE VERIFICATION (G6)

**Objective:** Run the full OB-178 Phase G compliance verification and paste all output.

```bash
echo "============================================"
echo "HF-147 PHASE 5: FULL COMPLIANCE VERIFICATION"
echo "============================================"

echo ""
echo "=== SOC 2 CC6 — Session Controls ==="
grep -rn "SESSION_LIMITS\|IDLE_TIMEOUT\|ABSOLUTE_TIMEOUT\|session-start\|last-activity" web/src/middleware.ts
echo ""
echo "=== SOC 2 CC6 — Session Revocation ==="
grep -rn "scope.*global" web/src/ --include="*.ts" | grep -v node_modules
echo ""
echo "=== SOC 2 CC6 — MFA Enforcement ==="
grep -rn "MFA_REQUIRED_ROLES\|getAuthenticatorAssuranceLevel\|aal" web/src/middleware.ts
echo ""
echo "=== SOC 2 CC6 — MFA for Platform Role ==="
grep -A 3 "MFA_REQUIRED_ROLES" web/src/middleware.ts
echo ""
echo "=== SOC 2 CC6 — Audit Logging ==="
grep -rn "logAuthEvent" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
echo "call sites (should be 9+)"
echo ""
echo "=== OWASP — Cookie Attributes ==="
cat web/src/lib/supabase/cookie-config.ts
echo ""
echo "=== OWASP — No 400-day Cookie ==="
FOUND=$(grep -rn "400.*24.*60\|34560000" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l)
echo "400-day references in src/: $FOUND (should be 0)"
echo ""
echo "=== NIST — Provider-Agnostic Enforcement ==="
grep -rn "vialuce-session-start\|vialuce-last-activity" web/src/middleware.ts
echo ""
echo "=== DS-019 — Server-Side Auth Resolution ==="
grep -rn "getServerAuthState" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
echo ""
echo "=== DS-019 — Auth Context Props ==="
grep -n "initialAuthState" web/src/contexts/auth-context.tsx 2>/dev/null || grep -n "initialAuthState" web/src/**/auth*context* 2>/dev/null
echo ""
echo "=== DS-019 — Browser Client Write-Only ==="
echo "Comment block present:"
head -10 web/src/lib/supabase/client.ts
echo ""
echo "=== DIAG-010 — Flywheel Tier 2 Fix ==="
grep -n "DEMOTED.*tier.*2\|tier.*2.*match.*true" web/src/lib/sci/fingerprint-flywheel.ts
echo ""
echo "=== Session Expiry Warning ==="
grep -rn "SessionExpiryWarning\|sessionMonitor\|expiryWarning" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
echo ""
echo "============================================"
echo "COMPLIANCE VERIFICATION COMPLETE"
echo "============================================"
```

**Paste the COMPLETE output above into the completion report.**

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-147 Phase 5: Full compliance verification passed" && git push origin dev
```

---

## PHASE 6: BUILD + PR

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build
# MUST exit 0
```

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-147: Auth compliance gap closure — MFA platform role, session warning, audit logging" \
  --body "## Closes OB-178 Remaining Gaps (CLT-178)

## Gaps Closed
1. G1: VL Admin (platform role) MFA enforcement — now redirects to /auth/mfa/enroll
2. G2: Session expiry warning — banner at 25 min idle
3. G3: Auth event logging 403 — uses service role client, bypasses RLS
4. G4: Auth logging completeness — 9+ event types wired (login/logout/mfa/expiry/denied)
5. G5: Browser client write-only — audited and documented
6. G6: Compliance verification — full output pasted in completion report

## Compliance
Standing Rule 39: SOC 2 CC6, OWASP, NIST SP 800-63B verified
DS-019 Phases A-C: All requirements now met

## Testing
- Login as platform@vialuce.com → must redirect to /auth/mfa/enroll
- Login as admin@bancocumbre.ec → must redirect to /auth/mfa/enroll
- Idle 25 min → session warning banner appears
- Check platform_events: SELECT * FROM platform_events WHERE event_type LIKE 'auth.%' ORDER BY created_at DESC LIMIT 10;"
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-147_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Platform role MFA | MFA_REQUIRED_ROLES includes 'platform', middleware reaches AAL check for tenant_id NULL users |
| PG-2 | Session expiry warning | SessionExpiryWarning component exists and is integrated |
| PG-3 | Auth logging no 403 | logAuthEvent uses service role client, INSERT succeeds |
| PG-4 | All auth events wired | grep shows 9+ logAuthEvent call sites |
| PG-5 | Browser client documented | Write-only comment block in client.ts |
| PG-6 | Compliance verification output | Phase 5 complete output pasted in completion report |
| PG-7 | npm run build exits 0 | Build clean |
| PG-8 | VL Admin MFA verified on localhost | Login as platform@vialuce.com → redirected to /auth/mfa/enroll |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Changing cookie config or signOut | Already correct — don't touch |
| AP-2 | Complex session warning UI | Simple banner. One div. One message. |
| AP-3 | Adding RLS INSERT policy for admin on platform_events | Use service role client — auth logging is a system concern |
| AP-4 | Modifying MFA enrollment/challenge pages | Already working in production |
| AP-5 | Skipping compliance verification | Phase 5 is mandatory — Standing Rule 39 |

---

*ViaLuce.ai — The Way of Light*
*HF-147: "Close every gap. Leave nothing deferred."*
