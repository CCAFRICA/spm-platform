# OB-132: PLATFORM HARDENING + OPERATE LIFECYCLE
## Login Stability + Navigation Cleanup + Lifecycle State Machine + Demo Path Polish
## Date: 2026-03-01
## Type: Overnight Batch
## Estimated Duration: 16-20 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `PERSISTENT_DEFECT_REGISTRY.md` — PDR items to verify
4. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE without reading this
5. `DS-003_VISUALIZATION_VOCABULARY.md` — component library

---

## WHY THIS OB EXISTS

OB-127 through OB-131 built the SCI pipeline: Import → Calculate → Reconcile. The engine works. The UI exists. But can someone actually sit down, log in, and use it without hitting a wall?

This OB answers that question by fixing everything between "open browser" and "see reconciliation results" that isn't the core SCI pipeline itself. These are the paper cuts, the dead ends, the redirect loops, and the missing lifecycle states that make the difference between a demo and a product.

**The test:** A customer logs in, navigates to Import, uploads a file, confirms the SCI proposal, navigates to Calculate, runs a single plan, views results, navigates to Reconcile, uploads a benchmark, and sees 100% match. If any step breaks — login loops, navigation dead-ends, missing routes, broken lifecycle states — this OB fixes it.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev --title "OB-132: Platform Hardening + Operate Lifecycle" --body "..."`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain vocabulary.** Korean Test applies.
8. **DO NOT MODIFY AUTH FILES** unless explicitly required by Phase 2 diagnostic. Read AUTH_FLOW_REFERENCE.md first.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 0: FULL PLATFORM DIAGNOSTIC

This is the most important phase. Map EVERY broken path before writing a single line of code.

### 0A: Login flow

```bash
echo "=== LOGIN FLOW ==="
cd web && npm run build 2>&1 | tail -5
npm run dev &
sleep 10

# Test each entry point
for route in "" "operate" "operate/import" "operate/calculate" "operate/reconciliation" "perform" "configure" "financial"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$route)
  LOCATION=$(curl -s -D - -o /dev/null http://localhost:3000/$route 2>/dev/null | grep -i "location:" | head -1)
  echo "/$route: $STATUS $LOCATION"
done

echo ""
echo "=== LOGIN PAGE ITSELF ==="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login)
echo "/login: $STATUS (should be 200, NOT redirect)"

kill %1 2>/dev/null
```

### 0B: Navigation — dead ends and stubs

```bash
echo "=== ALL PAGE.TSX FILES ==="
find web/src/app -name "page.tsx" | sort

echo ""
echo "=== PAGES WITH REDIRECT ==="
grep -rn "redirect\|router\.push\|router\.replace" web/src/app/ --include="page.tsx" | grep -v node_modules | head -30

echo ""
echo "=== PAGES WITH 'COMING SOON' OR STUB CONTENT ==="
grep -rn "coming soon\|Coming Soon\|placeholder\|TODO\|STUB\|stub" web/src/app/ --include="page.tsx" --include="*.tsx" | head -20

echo ""
echo "=== SIDEBAR NAV ITEMS ==="
cat web/src/components/navigation/Sidebar.tsx | grep -A2 "href\|to=\|path\|route" | head -40
```

### 0C: Operate workspace routes

```bash
echo "=== OPERATE ROUTES ==="
find web/src/app/operate -name "page.tsx" | sort

echo ""
echo "=== OPERATE LAYOUT ==="
cat web/src/app/operate/layout.tsx 2>/dev/null | head -30

echo ""
echo "=== OPERATE HUB PAGE ==="
cat web/src/app/operate/page.tsx | head -50
```

### 0D: Lifecycle state machine

```bash
echo "=== LIFECYCLE SERVICE ==="
find web/src -name "*lifecycle*" | sort
cat web/src/lib/lifecycle/lifecycle-service.ts 2>/dev/null | head -60

echo ""
echo "=== CALCULATION BATCHES STATES ==="
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await sb.from('calculation_batches')
    .select('lifecycle_state, tenant_id')
    .limit(20);
  const states = {};
  for (const b of data || []) {
    states[b.lifecycle_state] = (states[b.lifecycle_state] || 0) + 1;
  }
  console.log('Lifecycle states in use:', states);
}
main();
"

echo ""
echo "=== LIFECYCLE STATE TRANSITIONS ==="
grep -n "canTransition\|TRANSITIONS\|state.*machine\|allowed.*transition" web/src/lib/lifecycle/lifecycle-service.ts 2>/dev/null | head -15
```

### 0E: N+1 query hotspots

```bash
echo "=== CONTEXT PROVIDERS ==="
find web/src/contexts -name "*.tsx" | sort
grep -rn "useEffect.*fetch\|useEffect.*supabase\|useSWR\|useQuery" web/src/contexts/ --include="*.tsx" | head -15

echo ""
echo "=== SUPABASE CALLS IN PAGE COMPONENTS ==="
grep -rn "supabase\.\(from\|rpc\)" web/src/app/operate/ --include="*.tsx" | wc -l
echo "(count of direct Supabase calls in Operate pages)"
```

### 0F: PDR items — check current state

```bash
echo "=== PDR-01: Currency formatting ==="
grep -rn "toLocaleString\|Intl.NumberFormat\|formatCurrency\|currency.*format" web/src/ --include="*.tsx" --include="*.ts" | head -10

echo ""
echo "=== PDR-04: N+1 requests ==="
grep -rn "\.from(\|\.select(" web/src/contexts/ --include="*.tsx" | wc -l
echo "(Supabase queries in context providers)"
```

**Commit:** `OB-132 Phase 0: Full platform diagnostic — login, navigation, lifecycle, N+1, PDR`

---

## PHASE 1: LOGIN STABILITY

Based on Phase 0A diagnostic, fix any login issues found.

### 1.1: If redirect loop exists

Apply the fix pattern from HF-059/HF-061:
- All client-side redirects must check auth session before firing
- `useFinancialOnly` must have auth gate
- `effectivePersona` must have auth gate
- Add guard comment at every fix point:

```typescript
// AUTH GATE — OB-132
// Client-side redirect gated on auth session.
// See HF-059/HF-061 for pattern history.
if (!session || isLoading) return;
```

### 1.2: If login page itself redirects

The `/login` page must return HTTP 200 for unauthenticated users. If it redirects, the middleware matcher may be wrong.

### 1.3: If all clean

Document "Login flow clean — no fix needed" and move on.

**Verification:**
```bash
npm run dev &
sleep 10
# Every route should redirect to /login with single 307
for route in "operate" "operate/import" "operate/calculate" "operate/reconciliation"; do
  REDIRECTS=$(curl -s -D - -o /dev/null http://localhost:3000/$route 2>/dev/null | grep -ci "location:")
  echo "/$route: $REDIRECTS redirect(s) (should be 1)"
done
# Login itself should be 200
curl -s -o /dev/null -w "/login: %{http_code}\n" http://localhost:3000/login
kill %1 2>/dev/null
```

**Commit:** `OB-132 Phase 1: Login stability — auth gates verified or fixed`

---

## PHASE 2: NAVIGATION CLEANUP

### 2.1: Remove dead-end pages

Any page that shows "Coming Soon", a stub, or a blank screen should either:
- Be removed (if nothing links to it)
- Be replaced with a meaningful redirect to the nearest working page
- Be replaced with an empty state that guides the user ("This feature is available in a future release")

### 2.2: Fix broken sidebar links

Every sidebar navigation item must point to a page that renders. Verify:
- Import → `/operate/import` (OB-129)
- Calculate → `/operate/calculate` (OB-130)
- Reconcile → `/operate/reconciliation` (OB-131)
- All other sidebar items → working pages

### 2.3: Remove duplicate routes

Standing Rule 24: One canonical location per surface. If multiple routes point to the same functionality (e.g., `/data/import` and `/operate/import`), redirect the non-canonical to the canonical.

### 2.4: Operate hub page

`/operate` should be a meaningful landing that shows:
- Quick status of current period (if any)
- Links to Import, Calculate, Reconcile
- Recent activity summary (last import, last calculation, last reconciliation)

If the current Operate hub is broken or stale, update it to reflect the SCI pipeline.

**Commit:** `OB-132 Phase 2: Navigation cleanup — dead ends removed, sidebar verified, Operate hub updated`

---

## PHASE 3: LIFECYCLE STATE MACHINE

The calculation lifecycle needs to work for the Alpha demo path: Draft → Preview → Official.

### 3.1: Verify lifecycle service

Check that the lifecycle service supports at minimum:
- `DRAFT` → `PREVIEW` (Run calculation)
- `PREVIEW` → `PREVIEW` (Re-run calculation, same batch mutated)
- `PREVIEW` → `OFFICIAL` (Mark as official)
- `OFFICIAL` → `APPROVED` (future — not required for Alpha)

### 3.2: Fix lifecycle transitions if broken

From CLT-39 B1: "Forward transitions to POST, CLOSE, PAID, PUBLISH are not defined." For Alpha, we need at minimum Draft → Preview → Official. The full 9-state lifecycle is post-Alpha.

```typescript
// Minimum Alpha lifecycle transitions
const ALPHA_TRANSITIONS: Record<string, string[]> = {
  'DRAFT': ['PREVIEW'],
  'PREVIEW': ['PREVIEW', 'OFFICIAL'],
  'OFFICIAL': [],  // Terminal for Alpha. Post-Alpha: PENDING_APPROVAL
};
```

### 3.3: Wire lifecycle to Calculate page

On the OB-130 calculate page:
- When calculation runs, batch state should be `PREVIEW`
- A "Mark Official" button on results should advance to `OFFICIAL`
- Official results should be visually distinct (locked icon, timestamp)

### 3.4: Wire lifecycle to Reconcile page

After reconciliation (OB-131), the results page should show:
- Current lifecycle state of the compared batch
- If `PREVIEW`: offer to advance to `OFFICIAL` after successful reconciliation
- If `OFFICIAL`: show locked state

**Commit:** `OB-132 Phase 3: Lifecycle state machine — Alpha transitions wired to Calculate and Reconcile`

---

## PHASE 4: PDR ITEMS — PERSISTENT DEFECTS

Address the persistent defect registry items that affect the demo path.

### 4.1: PDR-01 — Currency formatting

Currency should show cents for small amounts and no cents for large amounts, OR consistently show full precision. Check all currency displays in the SCI pipeline:
- PlanCard totals (OB-130)
- PlanResults entity payouts (OB-130)
- ReconciliationResults deltas (OB-131)
- SCIExecution outcome numbers (OB-129)

If inconsistent, create a shared `formatCurrency(amount, locale?)` utility and use it everywhere.

### 4.2: PDR-04 — N+1 query reduction

The context providers re-fetch on every render. For the Alpha demo path, identify the worst offenders:
- How many Supabase calls fire when navigating to `/operate/calculate`?
- How many fire when viewing PlanResults?
- How many fire on `/operate/reconciliation`?

For each hotspot:
- Add data caching (even simple useState with stale detection)
- Batch related queries into single calls
- Remove duplicate fetches across context providers

**Target:** The calculate page should load with < 10 Supabase calls. Currently may be 30+.

### 4.3: PDR-05 — Persona filtering

If `effectivePersona` filtering still causes issues, verify it works correctly for the `admin` persona (the Alpha demo persona). VL Admin should see all workspaces.

**Commit:** `OB-132 Phase 4: PDR items — currency formatting, N+1 reduction, persona verification`

---

## PHASE 5: END-TO-END WALKTHROUGH

The critical test. Walk the entire Alpha path in the browser:

### 5.1: Login
1. Open fresh browser / incognito
2. Navigate to `vialuce.ai` or `localhost:3000`
3. Login with LAB admin credentials
4. Verify: lands on dashboard or Operate hub (not redirect loop)

### 5.2: Navigate to Import
5. Click "Import" in sidebar (or navigate to `/operate/import`)
6. Verify: SCI upload surface renders (OB-129)
7. Verify: no console errors

### 5.3: Navigate to Calculate
8. Click "Calculate" in sidebar (or navigate to `/operate/calculate`)
9. Verify: Plan cards render with 4 LAB plans (OB-130)
10. Verify: Each card shows entity count, payout total, data readiness
11. Click "View Results" on DG plan
12. Verify: Entity table shows variable payouts ($0 to $30K)

### 5.4: Navigate to Reconcile
13. Click "Reconcile" in sidebar (or navigate to `/operate/reconciliation`)
14. Verify: Plan selector with 4 plans (OB-131)
15. Verify: page renders without errors

### 5.5: Navigate back
16. Click sidebar links to move between Import, Calculate, Reconcile
17. Verify: no dead ends, no broken pages, no redirect loops
18. Verify: browser back button works correctly

### 5.6: Operate hub
19. Navigate to `/operate`
20. Verify: hub page shows meaningful content (not blank or redirect)
21. Verify: links to Import, Calculate, Reconcile all work

**Document every issue found. If critical (blocks the flow), fix immediately. If cosmetic, log for future.**

**Commit:** `OB-132 Phase 5: End-to-end walkthrough — full Alpha path verified`

---

## PHASE 6: KOREAN TEST + BUILD + COMPLETION REPORT + PR

### 6.1: Korean Test

```bash
grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus" \
  web/src/app/operate/ --include="*.tsx" --include="*.ts" | grep -v node_modules

# Expected: 0 matches (or only in data-driven strings like plan names, not in code)
```

### 6.2: Build clean

```bash
cd web && rm -rf .next && npm run build
```

### 6.3: Regression

```sql
-- Verify no calculation data affected
SELECT rs.name, COUNT(*) as results, SUM(cr.total_payout) as total
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
WHERE cr.tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
GROUP BY rs.name;
```

Expected: CL $6,540,774.36, MO $989,937.41, IR $366,600.00, DG $601,000.00

### 6.4: Completion Report

Create `OB-132_COMPLETION_REPORT.md` at project root.

### Proof Gates — Hard

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Build exits 0 | npm run build clean |
| PG-02 | Login works | Single 307 redirect to /login, login returns 200 |
| PG-03 | No redirect loops | All Operate routes: single redirect, not chain |
| PG-04 | /operate renders | Hub page shows meaningful content |
| PG-05 | /operate/import renders | SCI upload surface (OB-129) |
| PG-06 | /operate/calculate renders | Plan cards grid (OB-130) |
| PG-07 | /operate/reconciliation renders | Plan selector (OB-131) |
| PG-08 | Sidebar links all work | Every nav item points to a rendering page |
| PG-09 | No dead-end pages | Zero "Coming Soon" or blank pages reachable from nav |
| PG-10 | Lifecycle Draft→Preview | Calculation creates PREVIEW batch |
| PG-11 | Lifecycle Preview→Official | "Mark Official" button advances state |
| PG-12 | Currency formatting consistent | formatCurrency used across all new components |
| PG-13 | CL regression | 100 results, $6,540,774.36 |
| PG-14 | DG regression | 48 results, $601,000.00 |
| PG-15 | MBC regression | 240 results, $3,245,212.66 ± $0.10 |
| PG-16 | Korean Test | 0 domain vocabulary in modified files |
| PG-17 | No auth files modified inappropriately | Only fixes identified in Phase 1 diagnostic |

### Proof Gates — Soft

| # | Gate | Criterion |
|---|------|-----------|
| SPG-01 | E2E walkthrough clean | Login → Import → Calculate → Reconcile without breaks |
| SPG-02 | N+1 reduction | Calculate page loads with < 15 Supabase calls |
| SPG-03 | Browser back button works | Navigation history intact across Operate pages |
| SPG-04 | Console clean | Zero errors during E2E walkthrough |

**Create PR:** `gh pr create --base main --head dev --title "OB-132: Platform Hardening + Operate Lifecycle — Alpha Path Solid" --body "Login stability, navigation cleanup, lifecycle state machine (Draft→Preview→Official), currency formatting, N+1 reduction. E2E walkthrough: Login → Import → Calculate → Reconcile verified clean."`

**Commit:** `OB-132 Phase 6: Korean Test + build + completion report + PR`

---

## FILES MODIFIED (Expected — varies by diagnostic findings)

| Category | Expected Changes |
|----------|-----------------|
| Auth/login | Guard comments on client-side redirects (if needed) |
| Navigation | Sidebar links verified, dead pages removed/redirected |
| Operate hub | Updated to reflect SCI pipeline |
| Lifecycle service | Alpha transition matrix verified/fixed |
| Calculate page | "Mark Official" button, lifecycle state display |
| Currency utility | Shared formatCurrency function |
| Context providers | Query deduplication, caching |

---

## WHAT SUCCESS LOOKS LIKE

Someone opens a browser. They log in. They see the Operate hub with clear links to Import, Calculate, and Reconcile. They navigate between them without hitting a single dead end, redirect loop, or broken page. The sidebar always shows where they are. The lifecycle shows their calculation progressing from Draft to Preview to Official. Currency amounts are formatted consistently. The platform feels solid, not fragile.

This isn't glamorous work. It's the work that makes everything else work.

---

*"OB-127 through OB-131 built the engine. OB-132 paves the road to it."*
