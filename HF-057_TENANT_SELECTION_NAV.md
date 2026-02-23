# HF-057: TENANT SELECTION NAVIGATION FIX
## select-tenant API returns 200 but page stays on /select-tenant

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `OB-84_COMPLETION_REPORT.md` — current platform state

---

## THE BUG

**Steps to reproduce:**
1. Login as VL Admin
2. Land on Observatory (`/select-tenant`)
3. Click "View Tenant" on any tenant card (e.g., Óptica Luminar)
4. Network tab shows `select-tenant` → 200 (success)
5. URL stays on `/select-tenant` — page does NOT navigate to tenant dashboard
6. User is stuck on Observatory with no way to enter a tenant

**Root cause (suspected):** The "View Tenant" button's click handler calls the `select-tenant` API but does not call `router.push('/dashboard')` (or equivalent) after the successful response. The API correctly sets the tenant context (cookie/session), but the client-side navigation is missing.

**Impact:** P0 — blocks all tenant-level testing. No user can enter any tenant.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**

---

## PHASE 0: DIAGNOSTIC

### 0A: Find the tenant selection UI

```bash
echo "=== TENANT SELECTION COMPONENTS ==="
grep -rn "select-tenant\|selectTenant\|View Tenant\|view.*tenant" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== OBSERVATORY / SELECT-TENANT PAGE ==="
find web/src/app -path "*select-tenant*" -o -path "*observatory*" | head -10

echo ""
echo "=== TENANT FLEET CARDS ==="
grep -rn "View Tenant\|viewTenant\|handleSelectTenant\|onSelectTenant" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

### 0B: Find the select-tenant API

```bash
echo "=== SELECT-TENANT API ROUTE ==="
find web/src/app/api -path "*select*tenant*" -name "route.ts" -o -path "*tenant*select*" -name "route.ts"

echo ""
echo "=== API ROUTE CONTENTS ==="
for f in $(find web/src/app/api -path "*select*tenant*" -name "route.ts" -o -path "*tenant*select*" -name "route.ts"); do
  cat "$f"
done
```

### 0C: Find the click handler

```bash
echo "=== CLICK HANDLER FOR VIEW TENANT ==="
grep -B 10 -A 10 "View Tenant" web/src/ -r --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== ROUTER USAGE NEAR TENANT SELECTION ==="
grep -n "router\.\|useRouter\|redirect\|push\|replace\|refresh" web/src/app/*select-tenant*/page.tsx 2>/dev/null || echo "Not found in select-tenant page"
grep -n "router\.\|useRouter\|redirect\|push\|replace\|refresh" web/src/app/*observatory*/page.tsx 2>/dev/null || echo "Not found in observatory page"
```

### 0D: Trace the full flow

```bash
echo "=== OPERATIONS QUEUE BUTTONS ==="
grep -rn "Run Calculation\|View Tenant\|Review and reconcile\|Upload data\|Run first calculation\|Close period\|Advance to Official\|Post results" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20
```

**Commit:** `HF-057 Phase 0: Diagnostic — tenant selection navigation`

---

## PHASE 1: FIX

Based on the diagnostic, apply the fix. The pattern should be:

```typescript
// After select-tenant API returns 200:
const response = await fetch('/api/select-tenant', { ... });
if (response.ok) {
  router.push('/dashboard');  // Navigate to tenant context
  router.refresh();           // Ensure server components re-render with new tenant
}
```

### Fix checklist:

1. **"View Tenant" button on Tenant Fleet cards** — must navigate after selection
2. **"View Tenant" button in Operations Queue** — same fix
3. **"Run Calculation" button in Operations Queue** — should select tenant AND navigate to calculate page
4. **"Run first calculation" link on Tenant Fleet cards** — same pattern
5. **Any other tenant-entry click target** — apply same pattern

### Navigation targets by action:

| Button/Link | After select-tenant 200 | Navigate to |
|-------------|------------------------|-------------|
| View Tenant | Set tenant context | `/dashboard` |
| Run Calculation | Set tenant context | `/operate/calculate` (or calculation page) |
| Review and reconcile | Set tenant context | `/investigate/reconciliation` |
| Upload data | Set tenant context | `/operate/import` |
| Run first calculation | Set tenant context | `/operate/calculate` |
| Close period | Set tenant context | `/operate` (lifecycle) |
| Advance to Official | Set tenant context | `/operate` (lifecycle) |
| Post results | Set tenant context | `/operate` (lifecycle) |

Every CTA on the Observatory that targets a specific tenant must:
1. Call `select-tenant` API
2. Wait for 200
3. Call `router.push(targetRoute)`
4. Call `router.refresh()` to bust server component cache

### Verify:

```bash
echo "=== POST-FIX: All View Tenant handlers include router.push ==="
grep -A 5 "select-tenant" web/src/ -r --include="*.tsx" | grep -v node_modules | grep "push\|redirect\|refresh"
```

**Proof gates:**
- PG-1: "View Tenant" on fleet card calls router.push after select-tenant 200
- PG-2: "View Tenant" in Operations Queue calls router.push after select-tenant 200
- PG-3: All Operations Queue CTAs navigate to correct target page
- PG-4: URL changes from /select-tenant to /dashboard after tenant selection
- PG-5: Build compiles (`npm run build` exits 0)

**Commit:** `HF-057 Phase 1: Fix tenant selection navigation — router.push after select-tenant`

---

## PHASE 2: BUILD + COMPLETION REPORT + PR

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
npm run dev &
sleep 5
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
kill %1 2>/dev/null
```

### Completion report

Save as `HF-057_COMPLETION_REPORT.md` at **PROJECT ROOT**.

Structure:
1. Bug description
2. Root cause
3. Fix applied (which files, what changed)
4. All CTA buttons verified
5. Proof gates — 5 gates, each PASS/FAIL
6. Commits

### PR

```bash
gh pr create --base main --head dev \
  --title "HF-057: Tenant Selection Navigation Fix — router.push after select-tenant" \
  --body "## Bug
View Tenant and all Observatory CTAs call select-tenant API (returns 200) but don't navigate. URL stays on /select-tenant. User stuck on Observatory.

## Fix
Added router.push(targetRoute) + router.refresh() after every select-tenant call. Each CTA navigates to the contextually correct page.

## Proof Gates: 5 — see HF-057_COMPLETION_REPORT.md"
```

**Commit:** `HF-057 Final: Completion report + PR`

---

## MAXIMUM SCOPE

3 phases, 5 proof gates. Single bug fix. After HF-057, clicking any tenant on the Observatory navigates into that tenant's context.

---

*HF-057 — February 23, 2026*
*"The API said yes. The page didn't listen."*
