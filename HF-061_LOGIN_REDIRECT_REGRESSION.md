# HF-061: LOGIN REDIRECT LOOP — REGRESSION FIX

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `PERSISTENT_DEFECT_REGISTRY.md` — this is a P0 blocker; login must work before anything else

**If you have not read both files, STOP and read them now.**

---

## WHY THIS HF EXISTS

CLT-101 browser testing shows login is failing. The page loads `vialuce.ai/operate` with an infinite loading spinner, 276 requests, 3 MB transferred, 55 seconds finish time. Network tab shows `login?redirect=` entries confirming an auth redirect loop.

**This is a regression.** HF-059 (PR #92, merged) fixed this exact issue. PR #93 (OB-99) and PR #94 (HF-060 + OB-100) were merged after. One of these PRs reintroduced the loop, likely through:
- A layout change that re-added a client-side auth check
- A middleware change that broke the route matcher
- The `useFinancialOnly` redirect (OB-100 Phase 2) conflicting with auth flow
- The `effectivePersona` scope derivation (HF-060) triggering a redirect before auth completes

**Nothing else can be tested until login works. This is the #1 blocker.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **MINIMAL CHANGE. Do not restructure auth. Fix only the loop.**

---

## CC FAILURE PATTERN ALERT

This is the THIRD time login redirect has broken:
- First: pre-OB-97 (unknown cause)
- Second: post-OB-97 (fixed by HF-059 — Pattern A/B/C/D/E diagnosed and resolved)
- Third: post-PR#94 (this regression)

**The fix must be durable.** After fixing the immediate loop, add a guard comment at the fix point:

```typescript
// AUTH GATE — HF-059/HF-061
// This is the ONLY location for auth redirect logic.
// DO NOT add auth redirects in layouts, components, or other middleware.
// DO NOT add redirects that fire before auth session hydrates.
// See: CC Failure Pattern — Login Redirect Loop (3x regression)
```

---

## PHASE 0: DIAGNOSTIC — FIND THE REGRESSION

Run every command. Paste ALL output. Do not skip any.

```bash
echo "============================================"
echo "HF-061 PHASE 0: LOGIN REDIRECT LOOP REGRESSION"
echo "============================================"

echo ""
echo "=== 0A: MIDDLEWARE — COMPLETE FILE ==="
cat web/src/middleware.ts

echo ""
echo "=== 0B: ROOT LAYOUT AUTH LOGIC ==="
grep -n "redirect\|auth\|login\|getUser\|getSession\|supabase" web/src/app/layout.tsx | head -20

echo ""
echo "=== 0C: ALL REDIRECT/ROUTER.PUSH IN APP ==="
grep -rn "redirect(\|router\.push(\|router\.replace(" web/src/app/ web/src/middleware.ts --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -i "login\|auth\|operate\|perform\|financial" | head -30

echo ""
echo "=== 0D: CHANGES SINCE HF-059 FIX (PR #92) ==="
echo "--- Files modified in PR #93 (OB-99) that touch auth/redirect ---"
git log --oneline --all | head -15
echo ""
echo "--- Searching for auth-related changes in recent commits ---"
git log --oneline -20 --diff-filter=M -- web/src/middleware.ts web/src/app/layout.tsx
echo ""
git log --oneline -20 --diff-filter=M -- "web/src/app/operate/layout.tsx" "web/src/app/perform/layout.tsx" "web/src/app/financial/layout.tsx" "web/src/app/configure/layout.tsx"

echo ""
echo "=== 0E: useFinancialOnly HOOK (OB-100 suspect) ==="
grep -rn "useFinancialOnly" web/src/ --include="*.ts" --include="*.tsx"
echo "--- Full hook implementation ---"
find web/src -name "*.ts" -o -name "*.tsx" | xargs grep -l "useFinancialOnly" 2>/dev/null | head -5 | while read f; do echo "=== $f ==="; cat "$f"; done

echo ""
echo "=== 0F: effectivePersona REDIRECTS (HF-060 suspect) ==="
grep -rn "effectivePersona.*redirect\|redirect.*persona\|persona.*router\.push\|persona.*router\.replace" web/src/ --include="*.ts" --include="*.tsx" | head -15

echo ""
echo "=== 0G: AUTH CALLBACK ==="
cat web/src/app/auth/callback/route.ts 2>/dev/null || echo "No auth/callback/route.ts"
cat web/src/app/api/auth/callback/route.ts 2>/dev/null || echo "No api/auth/callback/route.ts"

echo ""
echo "=== 0H: LOGIN PAGE ==="
cat web/src/app/login/page.tsx 2>/dev/null | head -50

echo ""
echo "=== 0I: CHROME SIDEBAR / SHELL AUTH ==="
grep -n "redirect\|auth\|login\|session\|getUser\|router\.push\|router\.replace" web/src/components/navigation/ChromeSidebar.tsx 2>/dev/null | head -15

echo ""
echo "=== 0J: CONTEXT PROVIDERS WITH AUTH ==="
grep -rn "redirect\|router\.push.*login\|router\.replace.*login" web/src/contexts/ --include="*.tsx" --include="*.ts" | head -10

echo ""
echo "=== 0K: OPERATE PAGE/LAYOUT ==="
cat web/src/app/operate/page.tsx 2>/dev/null | head -40
cat web/src/app/operate/layout.tsx 2>/dev/null | head -40

echo ""
echo "=== 0L: WORKSPACE REDIRECT LOGIC ==="
grep -rn "redirect\|navigate\|push.*financial\|replace.*financial" web/src/hooks/ web/src/lib/ --include="*.ts" --include="*.tsx" | head -15
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-061 Phase 0: Login redirect loop regression diagnostic" && git push origin dev`

---

## PHASE 1: IDENTIFY AND FIX ROOT CAUSE

Based on Phase 0 output, identify which of these regression patterns is active:

### Regression Pattern R1: useFinancialOnly Redirect Before Auth
OB-100 added `useFinancialOnly` hook that redirects `/operate` → `/financial`. If this hook fires BEFORE the auth session hydrates, it may redirect an unauthenticated user to `/financial`, which then triggers auth middleware → `/login`, which after auth redirects to `/operate`, which triggers useFinancialOnly again → loop.

**Fix:** `useFinancialOnly` must check that auth session exists before executing any redirect. Add an early return if session is loading or null:
```typescript
if (!session || isLoading) return; // Don't redirect until auth is settled
```

### Regression Pattern R2: Persona Context Redirect Before Auth
HF-060 added `effectivePersona` scope derivation that redirects Rep persona to Server Detail. If persona context initializes before auth, it may fire a redirect on an unauthenticated state.

**Fix:** Same pattern — persona redirects must wait for auth:
```typescript
if (!user) return; // Don't derive persona until authenticated
```

### Regression Pattern R3: Layout Auth Check Re-Added
OB-99 or OB-100 may have added a server-side auth check in a layout file that conflicts with middleware.

**Fix:** Remove the duplicate auth check. Middleware is the single source of auth gating.

### Regression Pattern R4: Middleware Route Matcher Changed
A PR may have modified the middleware matcher pattern, excluding routes that need auth gating.

**Fix:** Restore the correct matcher pattern.

### Regression Pattern R5: Multiple Redirects Cascading
The combination of useFinancialOnly + effectivePersona + middleware creates a redirect chain:
`/operate` → (useFinancialOnly) → `/financial` → (persona) → `/financial/server/[id]` → (auth) → `/login` → (callback) → `/operate` → loop

**Fix:** All client-side redirects (useFinancialOnly, persona) must be behind an auth gate AND a loading state check.

**Apply the fix for the identified pattern. If multiple patterns are active, fix all of them.**

**The fix must include the guard comment from the CC Failure Pattern Alert section above.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-061 Phase 1: Login redirect loop regression fixed" && git push origin dev`

---

## PHASE 2: VERIFY FIX

### 2A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 2B: Auth Flow Test

```bash
npm run dev &
sleep 5

# Unauthenticated → single redirect to /login (not a chain)
curl -v http://localhost:3000/operate 2>&1 | grep -E "< HTTP|< [Ll]ocation"
# Expected: 307 → /login?redirect=%2Foperate (SINGLE redirect)

curl -v http://localhost:3000/perform 2>&1 | grep -E "< HTTP|< [Ll]ocation"
# Expected: 307 → /login?redirect=%2Fperform

curl -v http://localhost:3000/financial 2>&1 | grep -E "< HTTP|< [Ll]ocation"
# Expected: 307 → /login?redirect=%2Ffinancial

# Login page itself should NOT redirect
curl -v http://localhost:3000/login 2>&1 | grep -E "< HTTP|< [Ll]ocation"
# Expected: 200 (no redirect)
```

### 2C: Regression Check

```bash
# All 4 workspace routes should exist (not 404)
for route in "operate" "perform" "configure" "financial"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$route)
  echo "/$route: $STATUS (expect 307 to login or 200)"
done
```

### PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Root cause identified | Specific regression pattern (R1-R5) documented |
| PG-2 | Fix applied with guard comment | Auth gate comment present at fix point |
| PG-3 | `npm run build` exits 0 | Clean build |
| PG-4 | `/operate` → single 307 to `/login` | Not a chain, not a loop |
| PG-5 | `/login` → 200 | Login page renders without redirect |
| PG-6 | 4 workspace routes respond | /operate, /perform, /configure, /financial |
| PG-7 | No OB-97/98/99/100 regressions | Navigation, persona, Financial module still functional |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-061 Phase 2: Login fix verified" && git push origin dev`

---

## PHASE 3: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-061: Login redirect loop regression fix" \
  --body "## Root Cause
[Pattern R1-R5]: [Description from Phase 1]

## Fix
[Specific change]: auth-gated client-side redirects, guard comments added

## Verification
- Single redirect to /login: PASS
- /login returns 200: PASS
- All 4 workspace routes respond: PASS
- No regressions: PASS

## Regression Prevention
Guard comments added at all redirect points. Client-side redirects
(useFinancialOnly, effectivePersona) now check auth state before firing.

## CC Failure Pattern
This is the 3rd login redirect loop occurrence. Pattern documented in
PERSISTENT_DEFECT_REGISTRY.md and CC_STANDING_ARCHITECTURE_RULES.md."
```

---

## SCOPE BOUNDARIES

### IN SCOPE
- Login redirect loop diagnosis and fix
- Auth gate on all client-side redirect hooks (useFinancialOnly, persona)
- Guard comments at fix points
- Build and route verification

### OUT OF SCOPE — DO NOT TOUCH
- Navigation structure
- Page content, styling, or components
- Financial module pages
- Calculation engine
- New features of any kind
- OB-101 scope items

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Auth check in both middleware AND layout | Single location — middleware |
| AP-2 | Client-side redirect before auth hydrates | Check session/loading first |
| AP-3 | Redirect chain through multiple hooks | Each hook checks auth independently |
| AP-4 | Broad refactor of auth system | Minimal surgical fix only |
| AP-5 | Removing useFinancialOnly or persona logic | Keep the features — just gate on auth |

---

*ViaLuce.ai — The Way of Light*
*HF-061: Third time this breaks. Fix it, guard it, comment it, never again.*
*"Nothing else matters until login works."*
