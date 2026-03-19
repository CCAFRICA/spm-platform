# HF-148: MFA Route Isolation — Fix Blank Enrollment Page
## Surgical fix — exempt MFA routes from all competing redirects

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `COMPLETION_REPORT_ENFORCEMENT.md` — report enforcement applies

**If you have not read both files, STOP and read them now.**

---

## WHY THIS HF EXISTS

The MFA enrollment page (`/auth/mfa/enroll`) renders as a blank page for VL Admin (platform role). Production Vercel logs show:

```
GET /              → 307 (redirect to /auth/mfa/enroll)
GET /auth/mfa/enroll → 200 (page loads)
GET /select-tenant → 307 (redirect BACK to /auth/mfa/enroll)
GET /auth/mfa/enroll → 200 (page reloads — blank)
```

**Root cause:** After the MFA enrollment page loads and the React app hydrates, the auth context or layout detects VL Admin (platform role, tenant_id NULL) and triggers a client-side redirect to `/select-tenant` (tenant selection logic for platform users). The middleware catches this redirect and sends it back to `/auth/mfa/enroll`. The result is a redirect loop that prevents the page from rendering.

The MFA enrollment page cannot complete because a competing redirect fires before the user can interact with it.

**The fix:** All redirect logic — tenant selection, persona routing, workspace routing, financial-only routing — must be suppressed when the user is on any `/auth/mfa/*` route. The MFA ceremony is a gated flow that must complete without interference.

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

---

## SCOPE BOUNDARIES

### IN SCOPE
- Exempt `/auth/mfa/*` routes from tenant selection redirect
- Exempt `/auth/mfa/*` routes from persona/workspace routing
- Exempt `/auth/mfa/*` routes from any client-side redirect in auth context
- Exempt `/auth/mfa/*` routes from any layout-level redirect
- Verify MFA enrollment page renders completely (QR code visible)
- Verify MFA challenge page renders completely (6-digit input visible)

### OUT OF SCOPE — DO NOT TOUCH
- MFA enrollment logic (supabase.auth.mfa.enroll — already works)
- MFA challenge logic (supabase.auth.mfa.verify — already works)
- Middleware MFA enforcement (already works — correctly redirects to /auth/mfa/enroll)
- Cookie configuration, signOut, session enforcement
- Tenant selection logic for non-MFA routes
- Any page outside of `/auth/mfa/*`

### CRITICAL CONSTRAINT
**The ONLY change is adding route checks that suppress competing redirects on MFA routes.** No new features, no refactoring, no changes to MFA pages themselves.

---

## PHASE 0: COMMIT THIS PROMPT + FIND ALL REDIRECTS

```bash
cd /Users/AndrewAfrica/spm-platform
cp HF-148_MFA_ROUTE_ISOLATION.md .
git add -A && git commit -m "HF-148 Phase 0: MFA route isolation prompt" && git push origin dev
```

Then find every redirect that could interfere with MFA routes:

```bash
echo "============================================"
echo "HF-148 PHASE 0: REDIRECT AUDIT"
echo "============================================"

echo ""
echo "=== ALL CLIENT-SIDE REDIRECTS ==="
grep -rn "router\.push\|router\.replace\|window\.location\|redirect(" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "auth/mfa" | head -40

echo ""
echo "=== TENANT SELECTION REDIRECTS ==="
grep -rn "select-tenant\|selectTenant\|tenant.*redirect\|redirect.*tenant" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== AUTH CONTEXT REDIRECTS ==="
grep -n "router\.push\|router\.replace\|redirect\|navigate" web/src/contexts/auth-context.tsx 2>/dev/null
grep -n "router\.push\|router\.replace\|redirect\|navigate" web/src/**/auth*context* 2>/dev/null

echo ""
echo "=== LAYOUT REDIRECTS ==="
grep -n "router\.push\|router\.replace\|redirect" web/src/app/layout.tsx

echo ""
echo "=== MIDDLEWARE REDIRECTS (for reference — should already handle MFA) ==="
grep -n "auth/mfa\|mfa.*enroll\|mfa.*verify\|PUBLIC_PATHS" web/src/middleware.ts

echo ""
echo "=== PERSONA / WORKSPACE ROUTING ==="
grep -rn "useFinancialOnly\|effectivePersona\|persona.*redirect\|workspace.*redirect" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== AUTH SHELL / CHROME SIDEBAR REDIRECTS ==="
grep -n "router\.push\|router\.replace\|redirect" web/src/components/navigation/ChromeSidebar.tsx 2>/dev/null
find web/src -name "*auth*shell*" -exec grep -n "router\.push\|router\.replace\|redirect" {} \;
```

**From the output, identify every redirect that fires on page load or auth state change. Each one is a candidate for MFA route suppression.**

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-148 Phase 0: Redirect audit complete" && git push origin dev
```

---

## PHASE 1: ADD MFA ROUTE GUARD

**Objective:** Create a single utility function that checks if the current route is an MFA route. Every redirect in the app checks this before firing.

### 1A: Create Route Guard Utility

Create `web/src/lib/auth/mfa-route-guard.ts`:

```typescript
// HF-148: MFA Route Isolation
// When a user is on an MFA route (/auth/mfa/*), NO other redirect should fire.
// The MFA ceremony must complete without interference from:
// - Tenant selection redirects (platform users → /select-tenant)
// - Persona routing (effectivePersona → workspace)
// - Financial-only routing (useFinancialOnly → /financial)
// - Any other client-side redirect

const MFA_ROUTE_PREFIX = '/auth/mfa';

export function isOnMfaRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith(MFA_ROUTE_PREFIX);
}

export function isMfaRoute(pathname: string): boolean {
  return pathname.startsWith(MFA_ROUTE_PREFIX);
}
```

### 1B: Add Guard to Every Client-Side Redirect

For EVERY redirect identified in Phase 0, add an early return:

```typescript
// At the top of any redirect logic:
if (isOnMfaRoute()) return; // HF-148: MFA ceremony must not be interrupted
```

This includes:
- Auth context `useEffect` that redirects based on tenant/role
- Layout redirects
- ChromeSidebar or navigation redirects
- useFinancialOnly hook
- effectivePersona hook
- Any component that calls `router.push()` or `router.replace()` on mount

### 1C: Add Guard to Middleware (Belt-and-Suspenders)

In the middleware, BEFORE the tenant selection logic, add:

```typescript
// HF-148: MFA routes are fully isolated — skip all non-MFA redirects
if (isMfaRoute(request.nextUrl.pathname)) {
  // Only the MFA enforcement redirect (already handled above) applies
  // Skip tenant selection, persona routing, and all other redirects
  return supabaseResponse;
}
```

### Verification

```bash
# MFA route guard exists
cat web/src/lib/auth/mfa-route-guard.ts

# Guard used in all redirect locations
grep -rn "isOnMfaRoute\|isMfaRoute" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

# Middleware has MFA route early return
grep -n "isMfaRoute\|auth/mfa.*skip\|MFA.*isolated" web/src/middleware.ts
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-148 Phase 1: MFA route guard — all competing redirects suppressed" && git push origin dev
```

---

## PHASE 2: BUILD + LOCAL VERIFICATION

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build
# MUST exit 0

npm run dev &
sleep 5
```

**Test on localhost:**
1. Log in as platform@vialuce.com
2. Should redirect to /auth/mfa/enroll
3. The page MUST render completely — shield icon, "Set Up Two-Factor Authentication", "Begin Setup" button
4. Click "Begin Setup" — QR code MUST appear
5. The page must NOT redirect to /select-tenant at any point
6. Open Network tab — confirm NO requests to /select-tenant after enroll loads

**Paste the localhost test result — what renders, what the network tab shows.**

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "HF-148 Phase 2: Build verified, MFA enrollment renders on localhost" && git push origin dev
```

---

## PHASE 3: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-148: MFA route isolation — fix blank enrollment page" \
  --body "## Problem
MFA enrollment page renders blank for VL Admin. Root cause: after page loads,
auth context detects platform role with no tenant and triggers redirect to
/select-tenant. Middleware catches this and redirects back to /auth/mfa/enroll.
Result: redirect loop, blank page, MFA ceremony cannot complete.

## Fix
MFA route guard (isOnMfaRoute/isMfaRoute) added to every redirect location.
When user is on /auth/mfa/* routes, all competing redirects are suppressed.
Guard applied in: auth context, middleware, layout, persona routing hooks.

## Testing
Login as platform@vialuce.com → /auth/mfa/enroll renders with QR setup
Login as admin@bancocumbre.ec → /auth/mfa/enroll renders with QR setup
No /select-tenant requests in network tab while on MFA routes"
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-148_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | MFA route guard exists | mfa-route-guard.ts with isOnMfaRoute and isMfaRoute functions |
| PG-2 | Guard applied to all redirects | grep shows guard in auth context, middleware, and any redirect hooks |
| PG-3 | MFA enrollment renders on localhost | Screenshot or description: shield icon, Begin Setup button visible |
| PG-4 | No /select-tenant on MFA routes | Network tab shows zero requests to /select-tenant while on /auth/mfa/* |
| PG-5 | QR code appears on Begin Setup | Clicking Begin Setup shows QR code (mfa.enroll succeeded) |
| PG-6 | Tenant selection still works on non-MFA routes | After MFA complete, platform user reaches /select-tenant normally |
| PG-7 | npm run build exits 0 | Build clean |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Modifying MFA pages | Pages work — only redirects are broken |
| AP-2 | Removing tenant selection logic | Only suppress on MFA routes, not globally |
| AP-3 | Adding MFA route check in only some locations | Phase 0 identifies ALL redirects — guard ALL of them |
| AP-4 | Checking pathname with string comparison instead of startsWith | Use isMfaRoute utility — single source of truth |

---

## POST-MERGE VERIFICATION (Andrew)

1. Log in as platform@vialuce.com → /auth/mfa/enroll must render (not blank)
2. Click Begin Setup → QR code must appear
3. **Enroll MFA with your authenticator app** — scan QR, enter code, verify
4. After successful enrollment → should redirect to /select-tenant
5. Log out → log back in → should see MFA challenge page (enter code from authenticator)
6. Complete MFA challenge → should reach /select-tenant with full Platform Observatory

**This is the moment where VL Admin gets MFA protection. Have your authenticator app ready.**

---

*ViaLuce.ai — The Way of Light*
*HF-148: "The MFA ceremony is sacred. No redirect shall interrupt it."*
