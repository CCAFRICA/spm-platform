# HF-153: MFA VERIFY — FIX DOUBLE-CODE REQUIREMENT
## Priority: P0 — Users cannot reliably complete MFA on first attempt
## Date: March 20, 2026
## Prerequisite: HF-152 merged (PR #282).
## Scope: One line change in MFA verify page + one line in MFA enroll page.

---

## CC_STANDING_ARCHITECTURE_RULES (v3.0)

Include the full CC_STANDING_ARCHITECTURE_RULES.md at the top of this prompt. All rules apply.

---

## COMPLIANCE VERIFICATION GATE (Standing Rule 39)

**This prompt touches: auth (MFA flow).**
- **Decision 141 (LOCKED):** MFA required for platform and admin roles. The MFA flow must work reliably.
- **DS-019 Section 5.2:** MFA enrollment and challenge flows must complete without interference.
- **SOC 2 CC6:** MFA enforcement is a compliance control. An unreliable MFA flow undermines the control.

---

## ROOT CAUSE — 100% CERTAINTY

**Confirmed by reading the actual MFA verify page source code AND correlating with middleware.ts behavior across 6 test cycles on March 20, 2026.**

### The Pattern (Consistent Across ALL Test Cycles Today)

1. User enters correct password → `signInWithPassword` succeeds → session at **AAL1**
2. Middleware redirects to `/auth/mfa/verify` (correct — AAL1 + MFA enrolled)
3. MFA verify page loads, user enters TOTP code, clicks Verify
4. `mfa.challenge()` + `mfa.verify()` succeed — session is now **AAL2** on Supabase's server
5. Code calls `router.push('/')` — **client-side soft navigation**
6. Middleware intercepts `/`, calls `getUser()` + `getAuthenticatorAssuranceLevel()`
7. **The AAL2 state has NOT yet propagated to the cookies.** The middleware still sees AAL1.
8. Middleware redirects back to `/auth/mfa/verify` — **page remounts, code field resets to 000000**
9. User enters SECOND TOTP code, clicks Verify
10. This time the cookies have been refreshed (by the middleware's `getUser()` call in step 6, which wrote updated cookies to the response). The verify succeeds AND the navigation works.

### Why `router.push` Fails But `window.location.href` Would Work

`router.push('/')` is a **Next.js client-side navigation**. It uses the existing page's JavaScript context and the in-memory session state. It does NOT trigger a full HTTP request — the middleware receives a soft navigation that may carry stale cookies.

`window.location.href = '/'` is a **full browser navigation**. It triggers a fresh HTTP request to the server. The browser includes ALL current cookies. Critically, the Supabase `setAll` callback in the middleware writes the updated session cookies to the response during `getUser()`. On a full page load, these fresh cookies are available for the AAL check.

### Evidence From Vercel Logs

Every test cycle shows this sequence after MFA verify:

```
POST /auth/mfa/verify       → 200 (verify succeeds)
GET  /                       → 307 (middleware redirects)
GET  /select-tenant          → 307 (middleware AAL check → back to MFA)
GET  /auth/mfa/verify        → 200 (page remounts — user sees 000000)
```

After the SECOND verify:

```
POST /auth/mfa/verify       → 200 (verify succeeds again)
GET  /                       → 307 → /stream or /select-tenant (works this time)
```

### Console Evidence

The screenshot shows: `POST https://...supabase.co/auth/v1/token?gra... 400 (Bad Request)`

This 400 is from the second page mount. When the page remounts after the redirect loop, the `loadFactor` useEffect fires again. The Supabase client may attempt to refresh the token with stale credentials, producing the 400. This is a side effect of the remount, not the root cause.

---

## THE FIX

**File:** `web/src/app/auth/mfa/verify/page.tsx`

**Current code (line ~67):**
```typescript
router.push('/');
```

**Required change:**
```typescript
window.location.href = '/';
```

This forces a full browser navigation after MFA verify succeeds, ensuring the middleware receives fresh cookies with the AAL2 session state.

**Also apply the same fix to the MFA enroll page** if it uses `router.push` after successful enrollment:

**File:** `web/src/app/auth/mfa/enroll/page.tsx`

Search for `router.push` after the enrollment success flow and change to `window.location.href`.

---

## PHASE 1: APPLY THE FIX

### 1A: MFA Verify Page

**File:** `web/src/app/auth/mfa/verify/page.tsx`

Find:
```typescript
router.push('/');
```

Replace with:
```typescript
// HF-153: Full page navigation ensures middleware receives AAL2 cookies.
// router.push('/') is client-side soft navigation — cookies may be stale
// after the AAL1→AAL2 transition, causing a redirect loop back to this page.
window.location.href = '/';
```

### 1B: MFA Enroll Page

**File:** `web/src/app/auth/mfa/enroll/page.tsx`

Find any `router.push` after successful enrollment and apply the same change:
```typescript
// HF-153: Same fix as verify — full navigation after MFA state change.
window.location.href = '/';
```

### Verification

```bash
# No router.push after MFA success in either page
grep -n "router.push" web/src/app/auth/mfa/verify/page.tsx
grep -n "router.push" web/src/app/auth/mfa/enroll/page.tsx
# Expected: zero results (or only in error/redirect-to-enroll cases, not success cases)

# window.location.href used instead
grep -n "window.location.href" web/src/app/auth/mfa/verify/page.tsx
grep -n "window.location.href" web/src/app/auth/mfa/enroll/page.tsx
# Expected: 1 result per file — the success redirect
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-153: Full page navigation after MFA verify — router.push carries stale AAL1 cookies" && git push origin dev
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
git add -A && git commit -m "HF-153 Phase 2: Build clean" && git push origin dev
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-153_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | MFA verify page uses window.location.href | `grep "window.location.href" web/src/app/auth/mfa/verify/page.tsx` returns line |
| PG-2 | MFA verify page does NOT use router.push for success | `grep "router.push" web/src/app/auth/mfa/verify/page.tsx` returns zero results for success path |
| PG-3 | MFA enroll page uses window.location.href for success | `grep "window.location.href" web/src/app/auth/mfa/enroll/page.tsx` returns line |
| PG-4 | Comment explains why | HF-153 rationale in comment |
| PG-5 | npm run build exits 0 | Clean build |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Adding delays or timeouts to "wait for cookies" | The issue is the navigation method, not timing. Full navigation solves it cleanly. |
| AP-2 | Calling router.refresh() before router.push() | This is a partial fix — router.refresh triggers a server re-render but may still carry stale cookies in the soft navigation. |
| AP-3 | Modifying the middleware AAL check | The middleware is correct. The problem is the client navigation method. |
| AP-4 | Adding retry logic for MFA verify | The verify SUCCEEDS. The redirect loop is the problem, not the verification. |
| AP-5 | Changing any verify or challenge logic | The MFA API calls are correct. Only the post-success navigation changes. |

---

## POST-MERGE PRODUCTION VERIFICATION (Andrew)

After merge and deploy:

1. Fresh incognito → vialuce.ai
2. Log in as VL Admin → correct password → MFA verify page appears
3. Enter TOTP code → click Verify **ONCE**
4. **Expected: Single verify → lands on /select-tenant or /stream. No redirect back to MFA. No second code required.**
5. If successful: log out → log in as Patricia → single MFA verify → /stream

**The test is simple: does MFA work on the FIRST code?**

Also run the auth logging query to confirm login.success appears (HF-152 fix):

```sql
SELECT tenant_id, event_type, actor_id,
       payload->>'email' as email,
       payload->>'reason' as reason,
       created_at
FROM platform_events
WHERE created_at > NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC;
```

---

## PR

```bash
gh pr create --base main --head dev \
  --title "HF-153: Fix MFA double-verify — full navigation after AAL2 transition" \
  --body "## Root Cause (100% certainty from source + 6 test cycles)

After MFA verify succeeds, the session transitions from AAL1 to AAL2 on 
Supabase's server. But router.push('/') is a client-side soft navigation 
that carries stale AAL1 cookies. The middleware sees AAL1, redirects back 
to /auth/mfa/verify, the page remounts (code resets to 000000), and the 
user must enter a second TOTP code.

## Fix

router.push('/') → window.location.href = '/'

Full browser navigation ensures the middleware receives fresh AAL2 cookies.

## Evidence

This pattern was consistent across ALL 6 test cycles on March 20, 2026.
Vercel logs show the redirect loop: /auth/mfa/verify → / → /select-tenant → /auth/mfa/verify
on every first MFA attempt. Second attempt always works (cookies refreshed by then).

## Proof Gates: see HF-153_COMPLETION_REPORT.md"
```

---

*ViaLuce.ai — The Way of Light*
*HF-153: "The session state changed. Tell the browser."*
