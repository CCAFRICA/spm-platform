# HF-070: AUTH REGRESSION FIX + PDR SWEEP
## Login bypasses authentication. Fix auth FIRST, then sweep PDR items.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST — MANDATORY

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply (v2.0+)
2. `PERSISTENT_DEFECT_REGISTRY.md` — the EXACT item definitions. Do NOT rename, reinterpret, or substitute.
3. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query
4. `AUTH_FLOW_REFERENCE.md` — READ THIS COMPLETELY. This file documents how auth SHOULD work.

**If you have not read all four files, STOP and read them now.**

---

## WHY THIS HF EXISTS — TWO PROBLEMS

### Problem 1: AUTH BYPASS (P0 — BLOCKS EVERYTHING)

After merging HF-067 (Observatory Data Truth, PR #110) and deploying to production, a fresh Incognito window with cleared cache **bypasses authentication entirely**. Instead of landing on the login page, the user goes straight to `/operate` inside the Velocidad Deportiva tenant — a tenant they have not accessed in days.

This is the **4th auth regression:**
- HF-059 fixed login redirect loop (PR #92)
- HF-061 fixed login redirect regression after OB-99/OB-100 merged
- HF-061 Amendment fixed a further regression
- HF-062 addressed another variant
- **Now: auth bypass after HF-067 merge**

This is different from the previous redirect LOOPS. This time, authentication is **skipped entirely** — no redirect to login, no auth challenge. The user lands inside the app as if authenticated.

**HF-067 modified 3 files:**
1. `web/src/app/api/platform/observatory/route.ts` — shared data layer
2. `web/src/components/platform/ObservatoryTab.tsx` — display component
3. `web/src/lib/data/platform-queries.ts` — type additions

None of these are auth files. But the merge or deploy may have introduced a regression through:
- Merge conflict resolution that damaged middleware
- Build artifact caching on Vercel
- A dependency between the Observatory route and the auth middleware
- Supabase session handling in the Observatory API route creating a persistent session

### Problem 2: PDR SWEEP (P2 — DEMO CREDIBILITY)

PDR-01 (currency), PDR-05 (persona), PDR-06 (brand cards), PDR-07 (amber threshold) are cosmetic/UX defects surviving 3+ fix cycles. These are addressed AFTER auth is confirmed working.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **Supabase .in() ≤ 200 items per call.**

---

## SCOPE BOUNDARIES

### IN SCOPE
- **Part A:** Auth regression diagnosis and fix (Phases 0–3)
- **Part B:** PDR-01 currency formatting sweep (Phase 4)
- **Part B:** PDR-05 persona filtering enforcement (Phase 5)
- **Part B:** PDR-06 brand cards as collapsible headers (Phase 6)
- **Part B:** PDR-07 amber threshold ±5% (Phase 7)

### OUT OF SCOPE — DO NOT TOUCH
- Observatory (HF-067 — merged, working)
- Import pipeline (HF-068 — separate scope)
- Landing pages (/operate, /perform content — OB-105 scope)
- Calculation engine
- New features, new components, new pages
- Sidebar / navigation restructuring

### CRITICAL AUTH CONSTRAINT
**You MAY modify auth files in Part A ONLY.** The specific files that may need modification:
- `web/src/middleware.ts` — auth route matching
- `web/src/app/login/page.tsx` — login page
- `web/src/app/auth/callback/route.ts` or `web/src/app/api/auth/callback/route.ts` — callback handler

**You MAY NOT modify:**
- `web/src/contexts/session-context.tsx` — unless Phase 0 proves it is the cause
- `web/src/lib/auth/auth-service.ts` — unless Phase 0 proves it is the cause

**Minimal change. Fix only the bypass. Do not restructure auth.**

---

# ═══════════════════════════════════════════════════
# PART A: AUTH REGRESSION FIX (Phases 0–3)
# ═══════════════════════════════════════════════════

## PHASE 0: AUTH DIAGNOSTIC — FIND THE BYPASS

This is the MOST IMPORTANT phase. Run EVERY command. Paste ALL output. Do NOT skip any.

### 0A: Middleware — Complete File

```bash
echo "============================================"
echo "HF-070 PHASE 0: AUTH BYPASS DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: MIDDLEWARE — COMPLETE FILE ==="
cat web/src/middleware.ts
echo ""
echo "--- Middleware config/matcher ---"
grep -n "config\|matcher\|export" web/src/middleware.ts | head -10
```

### 0B: Auth Files — Current State

```bash
echo ""
echo "=== 0B: AUTH FILES — CURRENT STATE ==="
echo "--- Auth service ---"
head -60 web/src/lib/auth/auth-service.ts 2>/dev/null || echo "No auth-service.ts"
echo ""
echo "--- Session context (auth-related parts) ---"
grep -n "getUser\|getSession\|supabase\|auth\|redirect\|login" web/src/contexts/session-context.tsx | head -20
echo ""
echo "--- Auth callback ---"
cat web/src/app/auth/callback/route.ts 2>/dev/null || echo "Not at auth/callback/route.ts"
cat web/src/app/api/auth/callback/route.ts 2>/dev/null || echo "Not at api/auth/callback/route.ts"
echo ""
echo "--- Login page ---"
cat web/src/app/login/page.tsx 2>/dev/null | head -60
```

### 0C: Recent Git Changes to Auth-Related Files

```bash
echo ""
echo "=== 0C: RECENT CHANGES TO AUTH FILES ==="
echo "--- middleware.ts history ---"
cd /Users/AndrewAfrica/spm-platform
git log --oneline -10 -- web/src/middleware.ts
echo ""
echo "--- Any auth-related file changes in last 10 commits ---"
git log --oneline -10 -- web/src/middleware.ts web/src/app/login/ web/src/app/auth/ web/src/app/api/auth/ web/src/lib/auth/ web/src/contexts/session-context.tsx
echo ""
echo "--- Full diff of middleware.ts from 5 commits ago ---"
git diff HEAD~5..HEAD -- web/src/middleware.ts 2>/dev/null || echo "No changes in last 5 commits"
echo ""
echo "--- Full diff of session-context.tsx from 5 commits ago ---"
git diff HEAD~5..HEAD -- web/src/contexts/session-context.tsx 2>/dev/null || echo "No changes in last 5 commits"
```

### 0D: All Client-Side Redirects

```bash
echo ""
echo "=== 0D: ALL CLIENT-SIDE REDIRECTS ==="
grep -rn "redirect(\|router\.push(\|router\.replace(" web/src/app/ web/src/middleware.ts --include="*.ts" --include="*.tsx" \
  | grep -v node_modules | grep -v ".next" \
  | grep -i "login\|auth\|operate\|perform\|financial\|dashboard" | head -30
echo ""
echo "--- useFinancialOnly hook (if still exists) ---"
grep -rn "useFinancialOnly" web/src/ --include="*.ts" --include="*.tsx" | head -5
echo ""
echo "--- Any auth checks in layouts ---"
grep -rn "getUser\|getSession\|auth\|redirect.*login" web/src/app/operate/layout.tsx web/src/app/perform/layout.tsx web/src/app/financial/layout.tsx web/src/app/layout.tsx 2>/dev/null | head -15
```

### 0E: Supabase Auth Config

```bash
echo ""
echo "=== 0E: SUPABASE AUTH CONFIG ==="
echo "--- Environment variables for auth ---"
grep -rn "NEXT_PUBLIC_SUPABASE\|SUPABASE_SERVICE\|SUPABASE_URL\|SUPABASE_ANON" web/.env* 2>/dev/null | head -5
echo ""
echo "--- Supabase client creation ---"
grep -rn "createClient\|createServerClient\|createBrowserClient\|createMiddlewareClient" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10
echo ""
echo "--- How does middleware create a Supabase client? ---"
grep -n "createMiddleware\|createServerClient\|supabase" web/src/middleware.ts | head -10
```

### 0F: Test Auth Gating Locally

```bash
echo ""
echo "=== 0F: LOCAL AUTH GATE TEST ==="
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -10
npm run dev &
sleep 10

echo ""
echo "--- Unauthenticated request to /operate ---"
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" -L --max-redirs 1 http://localhost:3000/operate
echo ""
echo "--- Unauthenticated request to /perform ---"
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" -L --max-redirs 1 http://localhost:3000/perform
echo ""
echo "--- Login page returns 200 ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/login
echo ""
echo "--- Observatory route (API) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/api/platform/observatory
```

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — HF-070 AUTH BYPASS
//
// MIDDLEWARE:
// - Route matcher covers: [list routes]
// - Auth check method: [getUser / getSession / other]
// - Redirect target for unauthenticated: [/login / other]
// - Last modified: [commit hash, date]
//
// BYPASS CAUSE (one of):
// R1: Middleware route matcher doesn't cover /operate → auth not checked
// R2: Middleware creates Supabase client but doesn't verify session → passes through
// R3: A recent merge damaged the middleware auth check
// R4: Session-context or layout provides a fallback session that bypasses auth
// R5: Vercel deployment cached old middleware that doesn't check auth
// R6: HF-067's Observatory API route somehow establishes a session
// R7: Other: [describe]
//
// LOCAL TEST RESULTS:
// /operate unauthenticated: [HTTP code + redirect?]
// /perform unauthenticated: [HTTP code + redirect?]
// /login: [HTTP code]
//
// ROOT CAUSE: [one sentence]
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-070 Phase 0: Auth bypass diagnostic — finding root cause" && git push origin dev`

**Do NOT write fix code until Phase 0 is committed.**

---

## PHASE 1: AUTH FIX — ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD — HF-070 Auth Fix
============================
Problem: Unauthenticated users bypass login and land inside the app.

Root Cause: [from Phase 0]

Fix Approach: [describe the minimal surgical fix]
  - Scale test: N/A — auth is auth
  - AI-first: N/A
  - Transport: N/A
  - Atomicity: Auth check must be atomic — pass or redirect, no partial state

Files to modify: [list only the files that need changing]
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-070 Phase 1: Auth fix architecture decision" && git push origin dev`

---

## PHASE 2: AUTH FIX — IMPLEMENTATION

Based on Phase 0 root cause, apply the fix. Use the appropriate pattern:

### If R1 (Route Matcher):
```typescript
// Ensure middleware matcher covers all protected routes
export const config = {
  matcher: [
    '/operate/:path*',
    '/perform/:path*',
    '/financial/:path*',
    '/configure/:path*',
    '/observatory/:path*',
    '/dashboard/:path*',
    // Add any other protected routes
  ],
};
```

### If R2 (Session Check):
```typescript
// Middleware must verify the session, not just create a client
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return NextResponse.redirect(new URL('/login', request.url));
}
```

### If R3 (Merge Damage):
Restore middleware to its last known working state. Compare with the commit from HF-061 or HF-062 and reapply the correct auth check.

### If R4 (Session Context Fallback):
Remove any fallback session that allows rendering without authentication. The session context should not assume a valid session exists.

### If R5 (Vercel Cache):
This is a deployment issue, not a code issue. But add a cache-bust header or force revalidation in middleware to prevent stale caching.

### If R6 (Observatory Route):
The Observatory API route may be creating or extending a Supabase session through the service role client. Ensure the API route doesn't set auth cookies or create user sessions.

### Guard Comment — MANDATORY

At the fix point, add this comment:

```typescript
// AUTH GATE — HF-059/HF-061/HF-070
// This is the ONLY location for auth redirect logic.
// DO NOT add auth redirects in layouts, components, or other middleware.
// DO NOT add redirects that fire before auth session hydrates.
// DO NOT create Supabase sessions in API routes using service role client.
// See: CC Failure Pattern — Auth Bypass/Redirect Loop (4x regression)
```

### Verify Fix Locally

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -10
npm run dev &
sleep 10

echo "=== AUTH FIX VERIFICATION ==="
echo "--- /operate → should redirect to /login ---"
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" http://localhost:3000/operate
echo ""
echo "--- /perform → should redirect to /login ---"
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" http://localhost:3000/perform
echo ""
echo "--- /financial → should redirect to /login ---"
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" http://localhost:3000/financial
echo ""
echo "--- /login → should return 200 ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/login
echo ""
echo "--- Expected: 307/302 for protected routes, 200 for /login ---"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-070 Phase 2: Auth bypass fixed — unauthenticated users redirect to login" && git push origin dev`

---

## PHASE 3: AUTH REGRESSION CHECK

Verify the fix doesn't break authenticated access or create a redirect loop:

```bash
echo "=== AUTH REGRESSION CHECK ==="
echo ""
echo "--- All workspace routes exist (not 404) ---"
for route in "operate" "perform" "configure" "financial" "observatory"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$route)
  echo "/$route: HTTP $STATUS (expect 307 to login)"
done
echo ""
echo "--- Login page doesn't redirect to itself ---"
curl -v http://localhost:3000/login 2>&1 | grep -E "< HTTP|< [Ll]ocation"
echo ""
echo "--- API routes don't redirect (they should 401 or function normally) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/api/platform/observatory
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-070 Phase 3: Auth regression check — no loops, no 404s" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# PART B: PDR SWEEP (Phases 4–7)
# Only proceed if Part A auth fix is confirmed working.
# ═══════════════════════════════════════════════════

## PHASE 4: PDR-01 — CURRENCY NO CENTS

### The Rule (from PERSISTENT_DEFECT_REGISTRY.md — EXACT definition)
> All currency displays ≥ MX$10,000 render as whole numbers. No `.00`, no decimal cents.
> **Correct:** MX$1,035,811 · MX$17,023,895 · MX$977,524
> **Wrong:** MX$1,035,811.00 · MX$17,023,894.85 · MX$977,524.00
> **Exception:** Per-check averages and tip amounts below MX$10,000 may retain cents.
> **Scope:** Platform-wide. Every page, every module, every persona.
> **Threshold:** MX$10,000 (NOT MX$1,000).

### 4A: Ensure Single Canonical Currency Formatter

```bash
echo "=== PDR-01: CURRENCY DIAGNOSTIC ==="
grep -rn "formatTenantCurrency\|formatCurrency\|formatAmount\|formatMoney" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15
echo ""
echo "--- Raw formatting bypassing the canonical function ---"
grep -rn "toLocaleString\|\.toFixed\|NumberFormat.*currency" web/src/app/ web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -iv "date\|time" | head -20
```

If no canonical formatter exists, create one:

```typescript
// web/src/lib/utils/format-currency.ts
export function formatCurrency(
  amount: number | null | undefined,
  currency: string = 'MXN',
  locale: string = 'es-MX'
): string {
  if (amount == null || isNaN(amount)) return '—';
  const useDecimals = Math.abs(amount) < 10_000;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: useDecimals ? 2 : 0,
    maximumFractionDigits: useDecimals ? 2 : 0,
  }).format(amount);
}
```

### 4B: Platform-Wide Sweep

Replace ALL raw currency formatting with the canonical function. Sweep:
- `web/src/app/financial/` — all Financial pages
- `web/src/app/operate/` — Results, Operations
- `web/src/app/perform/` — persona dashboards
- `web/src/components/` — shared components (InsightPanel, RepTrajectory, etc.)
- `web/src/components/platform/` — Observatory components

### 4C: Verification

```bash
echo "=== PDR-01 VERIFICATION ==="
echo "--- Raw toLocaleString for currency (should be 0) ---"
grep -rn "toLocaleString" web/src/app/ web/src/components/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -iv "date\|time" | wc -l
echo ""
echo "--- Raw toFixed (should be 0) ---"
grep -rn "\.toFixed" web/src/app/ web/src/components/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l
echo ""
echo "--- Canonical formatter usage count ---"
grep -rn "formatCurrency\|formatTenantCurrency" web/src/app/ web/src/components/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-070 Phase 4: PDR-01 Currency no cents — platform-wide sweep" && git push origin dev`

---

## PHASE 5: PDR-05 — PERSONA FILTERING

### The Rule (from PERSISTENT_DEFECT_REGISTRY.md — EXACT definition)
> All scope/filtering decisions use `effectivePersona = override ?? derivePersona(user, capabilities)`. Never check `user.role`.
> **Correct:** Rep persona sees scoped view.
> **Wrong:** Rep persona sees full admin view.

### 5A: Find and Replace All user.role in Business Logic

```bash
echo "=== PDR-05: PERSONA DIAGNOSTIC ==="
grep -rn "user\.role\|profile\.role\|\.role ==" web/src/app/ web/src/hooks/ web/src/lib/ web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "type \|interface \|Type\|\.d\.ts\|// " | head -20
```

Replace each `user.role` with `effectivePersona` from the persona context/hook.

### 5B: Verification

```bash
echo "=== PDR-05 VERIFICATION ==="
echo "--- user.role in business logic (should be 0) ---"
grep -rn "user\.role\|profile\.role" web/src/app/ web/src/hooks/ web/src/lib/ web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "type \|interface \|Type\|\.d\.ts\|// " | wc -l
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-070 Phase 5: PDR-05 Persona filtering — effectivePersona enforcement" && git push origin dev`

---

## PHASE 6: PDR-06 — BRAND CARDS AS COLLAPSIBLE SECTION HEADERS

### The Rule (from PERSISTENT_DEFECT_REGISTRY.md — EXACT definition)
> Brand cards (Costa Azul, Fuego Dorado, Rápido Verde) appear ABOVE their location groups as section headers. Collapsible — click to expand/collapse. Show: brand name, service type badge, location count, total revenue, avg per-location, tip rate.
> **Correct:** Brand header → locations nested below, expandable/collapsible.
> **Wrong:** Brand cards at bottom, not labeled, not interactive.

### 6A: Diagnostic

```bash
echo "=== PDR-06: BRAND CARDS DIAGNOSTIC ==="
grep -rn "brand\|Brand\|groupBy\|collaps\|expand" web/src/app/financial/ --include="*.tsx" | head -20
find web/src -name "*Brand*" -o -name "*brand*" 2>/dev/null | grep -v node_modules | grep -v ".next" | head -10
```

### 6B: Implement or Fix

Locations must be grouped by brand. Each brand renders as a collapsible section header:

```
[▼ Costa Azul — Seafood — 5 locations — MX$2,450,000 — Avg MX$490,000 — Tip 8.2%]
  [Location 1] [Location 2] [Location 3] [Location 4] [Location 5]

[▼ Fuego Dorado — Mexican Grill — 8 locations — MX$4,200,000 — Avg MX$525,000 — Tip 7.8%]
  [Location 1] [Location 2] ... [Location 8]

[▼ Rápido Verde — Fast Casual — 7 locations — MX$3,100,000 — Avg MX$442,857 — Tip 6.5%]
  [Location 1] [Location 2] ... [Location 7]
```

Use React `useState` per brand, default expanded. Brand header visually distinct from location cards.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-070 Phase 6: PDR-06 Brand cards as collapsible section headers" && git push origin dev`

---

## PHASE 7: PDR-07 — AMBER THRESHOLD ±5%

### The Rule (from PERSISTENT_DEFECT_REGISTRY.md — EXACT definition)
> Green = above average. Amber = within ±5% of average. Red = below 95% of average.
> **Wrong:** ±10% threshold.

### 7A: Find and Fix

```bash
echo "=== PDR-07: AMBER THRESHOLD DIAGNOSTIC ==="
grep -rn "amber\|0\.95\|0\.9[0-9]\|threshold\|getColor\|performanceColor" web/src/app/financial/ web/src/lib/financial/ --include="*.tsx" --include="*.ts" | head -15
```

The color function must use:
```typescript
function getPerformanceColor(value: number, average: number): 'green' | 'amber' | 'red' {
  if (average === 0) return 'green';
  const ratio = value / average;
  if (ratio >= 1.0) return 'green';
  if (ratio >= 0.95) return 'amber';  // ±5% — NOT 0.90
  return 'red';
}
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-070 Phase 7: PDR-07 Amber threshold ±5% enforcement" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# COMPLETION (Phase 8)
# ═══════════════════════════════════════════════════

## PHASE 8: BUILD + COMPLETION REPORT + PR

### 8A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### 8B: Persistent Defect Registry — Verification

**Use the EXACT definitions from PERSISTENT_DEFECT_REGISTRY.md. Do NOT rename or substitute.**

| PDR # | PDR Definition (from registry) | In Scope | Status | Evidence |
|-------|-------------------------------|----------|--------|----------|
| PDR-01 | Currency ≥ MX$10,000 shows no cents | YES | PASS/FAIL | [grep results: 0 raw formatters, formatter uses 10000 threshold] |
| PDR-02 | Module-aware Operate landing | NO | — | OB-105 scope |
| PDR-03 | Bloodwork Financial landing page | NO | — | OB-105 scope |
| PDR-04 | Page loads < 100 network requests | NOTE | PASS/FAIL | [request count on Financial page] |
| PDR-05 | effectivePersona not user.role | YES | PASS/FAIL | [grep results: 0 user.role in business logic] |
| PDR-06 | Brand cards as collapsible section headers | YES | PASS/FAIL | [describe: brand order, collapsible behavior, stats shown] |
| PDR-07 | Amber threshold ±5% visible | YES | PASS/FAIL | [threshold value in code, amber visible or documented reason] |

**PDR-01, PDR-05, PDR-06, PDR-07: MUST show PASS. FAIL blocks PR.**

### 8C: Completion Report

Create `HF-070_COMPLETION_REPORT.md` at PROJECT ROOT:

1. **Auth bypass — root cause** (Phase 0 finding)
2. **Auth bypass — fix applied** (Phase 2 change)
3. **Auth bypass — verification** (Phase 3 curl results)
4. **PDR-01** — formatter location, threshold, grep before/after
5. **PDR-05** — user.role references found and replaced, effectivePersona wiring
6. **PDR-06** — brand grouping, collapsible behavior, stats on header
7. **PDR-07** — threshold value, color function, amber visibility
8. **PDR-04 note** — request count
9. **All proof gates** PASS/FAIL with evidence

### 8D: Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Auth: root cause identified | Specific bypass mechanism documented |
| PG-02 | Auth: /operate redirects to /login | Unauthenticated curl returns 307 → /login |
| PG-03 | Auth: /perform redirects to /login | Unauthenticated curl returns 307 → /login |
| PG-04 | Auth: /login returns 200 | Login page renders, no redirect loop |
| PG-05 | Auth: no redirect loop | Single redirect, not a chain |
| PG-06 | Auth: guard comment present | AUTH GATE comment at fix point |
| PG-07 | Currency: canonical formatter exists | Single function with 10,000 threshold |
| PG-08 | Currency: sweep complete | 0 raw toLocaleString/toFixed for currency |
| PG-09 | Persona: no user.role | 0 user.role in business logic |
| PG-10 | Brands: above locations | Brand headers render above location groups |
| PG-11 | Brands: collapsible | Click toggles location visibility |
| PG-12 | Brands: stats visible | Name, count, revenue, avg, tip rate |
| PG-13 | Amber: threshold ±5% | Code uses 0.95 ratio |
| PG-14 | Amber: visible | At least 1 amber location (or documented data reason) |
| PG-15 | No regression | Financial pages render with data |
| PG-16 | `npm run build` | Exits 0 |
| PG-17 | localhost:3000 | Responds with 200 |

### 8E: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-070: Auth Bypass Fix + PDR Sweep (Currency, Persona, Brand Cards, Amber)" \
  --body "## Part A: Auth Bypass Fix (P0)
Fresh Incognito window bypassed authentication entirely after HF-067 merge.
Root cause: [from Phase 0]
Fix: [from Phase 2]

### Verification
- /operate unauthenticated → 307 to /login: PASS
- /login returns 200: PASS
- No redirect loop: PASS
- Guard comment added: PASS

## Part B: PDR Sweep (P2)

### PDR-01: Currency No Cents
Platform-wide sweep. Single canonical formatter with MX\$10,000 threshold.

### PDR-05: Persona Filtering
All user.role replaced with effectivePersona.

### PDR-06: Brand Cards
Locations grouped by brand. Brand headers collapsible with stats.

### PDR-07: Amber Threshold
Color function uses 0.95 ratio (±5%), not 0.90.

## Proof Gates: 17 — see HF-070_COMPLETION_REPORT.md"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-070 Complete: Auth bypass fix + PDR sweep" && git push origin dev`

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Restructure auth instead of fixing bypass | Minimal surgical fix. Identify root cause, apply targeted change. |
| AP-2 | Skip Phase 0 auth diagnostic | Phase 0 committed BEFORE any fix code. |
| AP-3 | Rename PDR definitions | Use EXACT text from PERSISTENT_DEFECT_REGISTRY.md. |
| AP-4 | Report PASS without evidence | Describe what renders or what grep shows. |
| AP-5 | Change the currency threshold | MX$10,000 as defined. Not MX$1,000. |
| AP-6 | Fix one page, miss others | Platform-wide grep sweep. |
| AP-7 | Add auth redirects in layouts | Middleware is the ONLY auth gate. |
| AP-8 | Proceed to Part B if auth is broken | Part B requires auth working. Stop if Phase 3 fails. |
| AP-9 | Touch Observatory (HF-067) | Already fixed and merged. |
| AP-10 | Touch import pipeline (HF-068) | Separate scope. |

---

## EXECUTION ORDER — NON-NEGOTIABLE

```
Phase 0: Auth diagnostic          → commit
Phase 1: Auth architecture        → commit
Phase 2: Auth fix                 → commit
Phase 3: Auth regression check    → commit
                                    ↓
              IF AUTH WORKS (Phase 3 curl tests pass):
                                    ↓
Phase 4: PDR-01 Currency          → commit
Phase 5: PDR-05 Persona           → commit
Phase 6: PDR-06 Brand cards       → commit
Phase 7: PDR-07 Amber threshold   → commit
Phase 8: Completion + PR          → commit

              IF AUTH FAILS (Phase 3 curl tests fail):
                                    ↓
              STOP. Report failure. Do NOT proceed to Part B.
              Document what was attempted and what failed.
              Create HF-070_FAILURE_REPORT.md at project root.
```

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*HF-070: "Fix the door before polishing the furniture. Auth bypass is the door."*
