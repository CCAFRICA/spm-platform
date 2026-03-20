# HF-152: MIDDLEWARE MFA EXEMPTION FOR AUTH LOGGING
## Priority: P0 — SOC 2 CC6 Compliance Closure
## Date: March 20, 2026
## Prerequisite: HF-151 merged (PR #281). DIAG-011 completed (PR #280).
## Scope: ONE line change in middleware.ts.

---

## CC_STANDING_ARCHITECTURE_RULES (v3.0)

Include the full CC_STANDING_ARCHITECTURE_RULES.md at the top of this prompt. All rules apply.

---

## COMPLIANCE VERIFICATION GATE (Standing Rule 39)

**This prompt touches: auth (middleware), audit logging.**
- **SOC 2 CC6:** Two CC6 controls are in conflict — MFA enforcement (Section 5 of DS-019) is blocking audit logging (Section 8 of DS-019). Both are compliance requirements. This HF resolves the conflict.
- **Decision 141 (LOCKED):** MFA required for platform and admin roles. Must remain enforced.
- **Decision 143 (LOCKED):** All auth events logged. Must not be blocked by MFA enforcement.

---

## ROOT CAUSE — 100% CERTAINTY

**Confirmed by reading the actual middleware.ts source code (March 20, 2026).**

### The Conflict

The middleware enforces MFA at approximately line 213:

```typescript
if (!pathname.startsWith('/auth/mfa')) {
  // ... check AAL level ...
  if (currentLevel === 'aal1' && nextLevel === 'aal2') {
    return NextResponse.redirect(new URL('/auth/mfa/verify', request.url));
  }
}
```

When a user completes `signInWithPassword` but has NOT yet completed MFA:
- The user is authenticated at **AAL1** (password only)
- The middleware redirects ALL non-MFA requests to `/auth/mfa/verify`
- This includes `POST /api/auth/log-event` — the auth logging API
- The POST gets a **307 redirect** to `/auth/mfa/verify`
- The `auth.login.success` event is LOST — it never reaches the API route

### Why Other Events Work

| Event | When It Fires | AAL Level | Middleware Action | Result |
|-------|--------------|-----------|-------------------|--------|
| auth.login.failure | Before authentication | No user | NOT AUTHENTICATED path → PUBLIC_PATHS check → `/api/auth` matches → pass through | ✅ 200 |
| auth.login.success | After signInWithPassword, before MFA | AAL1 | AUTHENTICATED path → MFA check → AAL1 + nextLevel AAL2 → **307 redirect** | ❌ LOST |
| auth.mfa.verify.success | After MFA completion | AAL2 | AUTHENTICATED path → MFA check → AAL2 → passes | ✅ 200 |
| auth.logout | After full authentication | AAL2 (or session being destroyed) | AUTHENTICATED path → MFA check → passes | ✅ 200 |

### Why `/api/auth` Being in PUBLIC_PATHS Doesn't Help

PUBLIC_PATHS only applies to the **NOT AUTHENTICATED** branch (line ~145):

```typescript
if (!user) {
  // ... checks PUBLIC_PATHS ...
}
```

When login.success fires, the user IS authenticated (at AAL1). So the middleware takes the AUTHENTICATED branch, which does NOT check PUBLIC_PATHS — it goes straight to session timeout checks and then MFA enforcement.

### The Fix

The MFA enforcement check must exempt auth logging API routes. These routes must be reachable at AAL1 so that the `auth.login.success` event can be logged before MFA completes.

This is not a security weakening — the log-event API route uses the service role client for INSERTs and only writes audit trail records. It does not expose any tenant data or provide any capability to the user.

---

## THE FIX — ONE LINE

**File:** `web/src/middleware.ts`
**Line:** ~213 (the MFA enforcement check)

**Current code:**
```typescript
if (!pathname.startsWith('/auth/mfa')) {
```

**Required change:**
```typescript
if (!pathname.startsWith('/auth/mfa') && !pathname.startsWith('/api/auth/log-event')) {
```

**That's it.** This exempts the auth logging API route from MFA enforcement, allowing the `auth.login.success` POST to reach the API route handler at AAL1.

### Why Not Exempt All `/api/auth`?

`/api/auth` includes the auth callback route. The MFA enforcement should still apply to auth callback routes that could be exploited to bypass MFA. Only the log-event route needs exemption — it's a write-only audit trail endpoint.

---

## PHASE 1: APPLY THE FIX

**File:** `web/src/middleware.ts`

Find the line:
```typescript
if (!pathname.startsWith('/auth/mfa')) {
```

Change it to:
```typescript
if (!pathname.startsWith('/auth/mfa') && !pathname.startsWith('/api/auth/log-event')) {
```

Add a comment above explaining why:

```typescript
// OB-178: MFA enforcement — redirect AAL1 users to MFA verify
// HF-152: Exempt /api/auth/log-event from MFA redirect so auth.login.success
// can be logged BEFORE MFA completion. The user is authenticated (password correct)
// but at AAL1 — the login event must be recorded before AAL2 is reached.
// This is a SOC 2 CC6 requirement: audit logging must not conflict with MFA enforcement.
if (!pathname.startsWith('/auth/mfa') && !pathname.startsWith('/api/auth/log-event')) {
```

### Verification

```bash
# Confirm the exemption exists
grep -n "api/auth/log-event" web/src/middleware.ts

# Confirm the MFA check still applies to all other routes
grep -n "auth/mfa" web/src/middleware.ts

# Confirm no other changes made to middleware
git diff --stat
# Expected: 1 file changed, ~3 insertions (comment + line change)
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-152: Exempt /api/auth/log-event from MFA redirect — SOC 2 CC6 audit logging must not conflict with MFA enforcement" && git push origin dev
```

---

## PHASE 2: BUILD

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-152 Phase 2: Build clean" && git push origin dev
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-152_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Middleware exempts log-event from MFA check | `grep "api/auth/log-event" web/src/middleware.ts` returns the exemption line |
| PG-2 | MFA enforcement still applies to all other routes | `grep "auth/mfa" web/src/middleware.ts` shows the check exists |
| PG-3 | Comment explains the exemption | HF-152 + SOC 2 CC6 rationale in comment |
| PG-4 | Only middleware.ts modified | `git diff --stat` shows 1 file |
| PG-5 | npm run build exits 0 | Clean build |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Exempting all `/api/auth` from MFA | Only `/api/auth/log-event` — auth callback must remain MFA-enforced |
| AP-2 | Modifying the MFA enforcement logic | The MFA enforcement is correct. The exemption is for a specific audit trail endpoint only. |
| AP-3 | Modifying auth-logger.ts or auth-service.ts | This HF touches middleware.ts ONLY. HF-151 fixes are already in place. |
| AP-4 | Adding conditional logic based on AAL level in the API route | The middleware is the correct enforcement point. The API route doesn't need to know about AAL. |

---

## POST-MERGE PRODUCTION VERIFICATION (Andrew)

After merge and deploy:

1. Fresh incognito → vialuce.ai
2. Enter wrong password for VL Admin (login.failure)
3. Enter correct password → should redirect to MFA verify
4. Complete MFA → /select-tenant
5. Log out
6. Log in as Patricia → MFA → /stream
7. Log out
8. Run:

```sql
SELECT tenant_id, event_type, actor_id,
       payload->>'email' as email,
       payload->>'reason' as reason,
       created_at
FROM platform_events
WHERE created_at > NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC;
```

**This time, `auth.login.success` MUST appear.** Expected rows:

| event_type | actor_id | email | tenant_id |
|-----------|----------|-------|-----------|
| auth.logout | Patricia UUID | admin@bancocumbre.ec | BCL UUID |
| auth.mfa.verify.success | Patricia UUID | admin@bancocumbre.ec | BCL UUID |
| auth.login.success | Patricia UUID | admin@bancocumbre.ec | NULL |
| auth.login.failure | null | admin@bancocumbre.ec | NULL |
| auth.logout | VL Admin UUID | platform@vialuce.com | NULL |
| auth.mfa.verify.success | VL Admin UUID | platform@vialuce.com | NULL |
| auth.login.success | VL Admin UUID | platform@vialuce.com | NULL |
| auth.login.failure | null | platform@vialuce.com | NULL |

**Note:** `auth.login.success` will have `tenant_id = NULL` because at the moment of password authentication, the user hasn't selected a tenant yet (VL Admin) or the session is at AAL1 and tenant context isn't fully resolved. This is correct — the login event records "who authenticated when," not "which tenant they're working in." The tenant context appears on subsequent events (MFA verify, logout).

**Vercel log check:** There should be NO `POST /api/auth/log-event → 307` during the login flow. All POSTs to log-event should return 200.

---

## PR

```bash
gh pr create --base main --head dev \
  --title "HF-152: Exempt auth logging from MFA redirect — SOC 2 CC6 compliance" \
  --body "## Root Cause (100% certainty from middleware source review)

The MFA enforcement in middleware.ts redirects ALL authenticated AAL1 requests 
to /auth/mfa/verify. This includes POST /api/auth/log-event, which means 
auth.login.success is NEVER logged — the POST gets 307'd to the MFA page.

This has persisted across HF-149, HF-150, and HF-151 because the root cause 
was in the middleware, not the client-side logging code.

## Fix

One-line change: exempt /api/auth/log-event from the MFA redirect check.

\`\`\`typescript
// Before:
if (!pathname.startsWith('/auth/mfa')) {

// After:  
if (!pathname.startsWith('/auth/mfa') && !pathname.startsWith('/api/auth/log-event')) {
\`\`\`

## Security Assessment

This does NOT weaken MFA enforcement. The log-event route:
- Uses service role client (not user session) for INSERTs
- Only writes audit trail records
- Does not expose tenant data or provide any user capability
- Is a SOC 2 CC6 requirement (audit logging) that was being blocked by another CC6 requirement (MFA)

## Evidence Chain
- DIAG-011: Identified POST→307 but couldn't confirm source (60% certainty)
- Andrew pulled middleware.ts source — 100% confirmed MFA redirect is the cause
- Lines ~213-219: AAL1 check redirects to /auth/mfa/verify for all non-MFA paths

## Proof Gates: see HF-152_COMPLETION_REPORT.md"
```

---

*ViaLuce.ai — The Way of Light*
*HF-152: "Two compliance controls cannot conflict. When they do, fix the interaction — not the controls."*
