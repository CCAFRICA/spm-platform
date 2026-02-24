# OB-89: PLATFORM HARDENING AND DEMO READINESS
## Persona Switcher. Stub Cleanup. Console Silence. Navigation Truth.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. This prompt in its entirety before writing a single line of code

---

## CONTEXT — WHY THIS EXISTS

The platform has 87+ OBs of functional code, but the browser experience is degraded by accumulated debris: a broken persona switcher, 20+ stub pages that redirect confusingly, console errors on page load, and duplicate routes. A prospect or co-founder opening the platform today would encounter:

1. **Persona switcher broken** — Cannot switch between Admin/Manager/Rep without logging out. Removed during OB-84 cleanup or broken by auth changes. This blocks every demo.
2. **20+ stub pages redirect to parent workspace** — Clicking "Revenue Analytics" sends you to /operate with no explanation. Feels broken.
3. **Console errors on every page** — 400s from Supabase, TypeError .trim(), configuration.variants undefined. Not customer-facing but shows during demos with DevTools open.
4. **Duplicate routes** — Reconciliation in both Operate and Investigate. Calculations in both. Periods in both Configure and Operate.
5. **N+1 query pattern** — 5,928 requests on page load. Every component re-fetches tenant/profile/calculation data independently.

This OB fixes the browser experience without touching calculation logic, reconciliation, or AI pipelines.

---

## FIRST PRINCIPLES

1. **DELETE OVER FIX** — A stub page that redirects is worse than no page. Remove it.
2. **SILENCE THE CONSOLE** — Every console error is a trust signal to technical evaluators.
3. **ONE HOME PER FEATURE** — Reconciliation lives in ONE place. Calculations in ONE place.
4. **PERSONA SWITCHING MUST WORK** — This is the core demo capability. Without it, every demo requires 4 separate logins.
5. **KOREAN TEST** — No hardcoded tenant names, user names, or language-specific strings.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. Architecture Decision Gate before implementation
5. Anti-Pattern Registry check (AP-1 through AP-20)
6. Supabase batch ≤200 for all `.in()` calls
7. Build EXACTLY what this prompt specifies
8. ALL git commands from repository root (spm-platform)

---

## PHASE 0: FULL DIAGNOSTIC

Before changing any code, build a complete inventory of what exists and what's broken.

### 0A: Demo Persona Switcher State

```bash
cd /Users/AndrewAfrica/spm-platform/web

echo "=== DEMO PERSONA SWITCHER ==="
find src -name "*DemoPersona*" -o -name "*PersonaSwitcher*" -o -name "*persona-switch*" | head -10

echo ""
echo "=== SWITCHER COMPONENT CODE ==="
cat src/components/demo/DemoPersonaSwitcher.tsx 2>/dev/null || echo "FILE NOT FOUND"

echo ""
echo "=== WHERE IS IT MOUNTED? ==="
grep -rn "DemoPersonaSwitcher\|PersonaSwitcher" src/ --include="*.tsx" | head -10

echo ""
echo "=== PERSONA CONTEXT ==="
cat src/contexts/persona-context.tsx 2>/dev/null || echo "FILE NOT FOUND"

echo ""
echo "=== AUTH CONTEXT — signIn/signOut usage ==="
grep -n "signIn\|signOut\|switchUser\|impersonat" src/contexts/auth-context.tsx 2>/dev/null | head -15

echo ""
echo "=== TENANT SETTINGS — demo_users ==="
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data } = await sb.from('tenants').select('name, settings');
  data?.forEach(t => {
    const du = t.settings?.demo_users;
    console.log(t.name + ':', du ? du.length + ' demo users' : 'NO demo_users');
    du?.forEach(u => console.log('  ', u.email, u.role || u.scope_level));
  });
})();
"
```

### 0B: Stub Page Inventory

```bash
echo "=== ALL ROUTE PAGES ==="
find src/app -name "page.tsx" | sort

echo ""
echo "=== PAGES THAT REDIRECT ==="
grep -rn "redirect\|router.push\|router.replace\|window.location" src/app/ --include="page.tsx" -l | sort

echo ""
echo "=== PAGES WITH useEffect REDIRECT PATTERNS ==="
grep -rn "useEffect.*redirect\|useEffect.*push\|useEffect.*replace" src/app/ --include="page.tsx" -l | sort

echo ""
echo "=== SIDEBAR NAV ITEMS ==="
grep -rn "href.*=\|path.*=\|route.*=" src/components/navigation/ --include="*.tsx" | grep -v node_modules | head -40
# Also check for sidebar config files
find src -name "*sidebar*config*" -o -name "*nav*config*" -o -name "*routes*" | grep -v node_modules | head -10
```

### 0C: Console Error Sources

```bash
echo "=== POTENTIAL NULL TENANT READS ==="
grep -rn "\.eq.*tenant_id" src/lib/ src/app/api/ --include="*.ts" | grep -v "requireTenantId" | head -20

echo ""
echo "=== .trim() CALLS WITHOUT NULL GUARD ==="
grep -rn "\.trim()" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== configuration.variants ACCESS ==="
grep -rn "configuration\.\|variants\.\|\.variants" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== DUPLICATE ROUTES ==="
echo "Reconciliation pages:"
find src/app -path "*reconcil*" -name "page.tsx" | sort
echo ""
echo "Calculation pages:"
find src/app -path "*calc*" -name "page.tsx" | sort
echo ""
echo "Period pages:"
find src/app -path "*period*" -name "page.tsx" | sort
```

### 0D: N+1 Query Pattern

```bash
echo "=== SUPABASE CLIENT CREATION PER COMPONENT ==="
grep -rn "createClient\|createBrowserClient\|createServerClient" src/components/ --include="*.tsx" --include="*.ts" -l | head -20

echo ""
echo "=== DATA FETCHING IN COMPONENTS (not services) ==="
grep -rn "supabase.*from\|\.from(" src/components/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l
echo "(count of direct Supabase calls in components)"

echo ""
echo "=== DATA FETCHING IN LAYOUT ==="
grep -rn "supabase\|fetch\|useQuery" src/app/layout.tsx src/app/\(authenticated\)/layout.tsx 2>/dev/null | head -10
```

**PASTE ALL OUTPUT.** This is the source of truth for every fix in this OB.

**Commit:** `OB-89 Phase 0: Platform diagnostic — switcher state, stub inventory, console error sources`

---

## MISSION 1: FIX DEMO PERSONA SWITCHER

The persona switcher is the #1 demo-blocking issue. It MUST work after this mission.

### 1A: Determine Current Failure Mode

From Phase 0 output, determine which failure case applies:

| Case | Symptom | Fix |
|------|---------|-----|
| A | DemoPersonaSwitcher.tsx doesn't exist | Rebuild from scratch |
| B | Exists but not mounted in layout | Mount it |
| C | Mounted but uses signOut/signIn (auth round-trip) | Replace with context-only impersonation |
| D | Mounted but wrong password | Fix password to `demo-password-VL1` |
| E | Mounted but tenant.settings.demo_users is empty | Populate demo_users in tenant settings |
| F | Mounted but doesn't persist on navigation | Store persona override in sessionStorage + context |

**Most likely: combination of C + E + F.** Fix all that apply.

### 1B: Architecture — Context-Only Impersonation

The switcher must NOT call `signOut()` / `signIn()`. Instead:

1. VL Admin is always the authenticated user (Supabase auth session).
2. Clicking a persona chip sets a **persona override** in context + sessionStorage.
3. The override changes: displayed role, visible workspaces, data scope, dashboard content.
4. Navigation does NOT reset the override (sessionStorage persists across page loads).
5. Clicking "Platform" / "Demo" chip clears the override → back to VL Admin.

### 1C: Implementation

**Step 1: Ensure persona-context supports override persistence**

```typescript
// persona-context.tsx should have:
const [personaOverride, setPersonaOverride] = useState<string | null>(() => {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('vl_persona_override');
  }
  return null;
});

useEffect(() => {
  if (personaOverride) {
    sessionStorage.setItem('vl_persona_override', personaOverride);
  } else {
    sessionStorage.removeItem('vl_persona_override');
  }
}, [personaOverride]);
```

**Step 2: DemoPersonaSwitcher component**

- Reads demo users from tenant settings OR from profiles table for current tenant
- Renders as a fixed bottom bar (visible only when user is VL Admin or scope_level is 'vl_admin')
- Chips: Platform Admin | Tenant Admin | Manager | Rep
- Click sets personaOverride → context re-derives permissions, workspace visibility, data scope
- Active chip is visually highlighted
- NO auth round-trip. NO page reload. NO signOut/signIn.

**Step 3: Populate demo_users in tenant settings**

For Optica Luminar and Velocidad Deportiva, ensure tenant.settings.demo_users contains:

```json
[
  { "email": "admin@opticaluminar.mx", "role": "admin", "label": "Admin" },
  { "email": "gerente@opticaluminar.mx", "role": "manager", "label": "Gerente" },
  { "email": "vendedor@opticaluminar.mx", "role": "individual", "label": "Vendedor" }
]
```

Run a Supabase update if needed:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Get existing tenants
const { data: tenants } = await sb.from('tenants').select('id, name, settings');
for (const t of tenants || []) {
  if (!t.settings?.demo_users || t.settings.demo_users.length === 0) {
    // Look up profiles for this tenant
    const { data: profiles } = await sb.from('profiles').select('email, role, display_name, scope_level')
      .eq('tenant_id', t.id).neq('scope_level', 'vl_admin');
    
    if (profiles && profiles.length > 0) {
      const demoUsers = profiles.map(p => ({
        email: p.email,
        role: p.role || p.scope_level,
        label: p.display_name || p.email.split('@')[0],
        password: 'demo-password-VL1'
      }));
      
      const newSettings = { ...t.settings, demo_users: demoUsers };
      await sb.from('tenants').update({ settings: newSettings }).eq('id', t.id);
      console.log('Updated', t.name, 'with', demoUsers.length, 'demo users');
    }
  } else {
    console.log(t.name, 'already has', t.settings.demo_users.length, 'demo users');
  }
}
"
```

**Step 4: Mount in layout**

Ensure DemoPersonaSwitcher is rendered in the authenticated layout, visible only to VL Admin scope.

### 1D: Verification

```bash
echo "=== PERSONA SWITCHER VERIFICATION ==="
# Component exists
ls -la src/components/demo/DemoPersonaSwitcher.tsx

# No signOut/signIn
grep -n "signOut\|signIn" src/components/demo/DemoPersonaSwitcher.tsx | head -5
# MUST return zero results

# sessionStorage persistence
grep -n "sessionStorage" src/components/demo/DemoPersonaSwitcher.tsx src/contexts/persona-context.tsx | head -5
# MUST find sessionStorage usage

# Mounted in layout
grep -rn "DemoPersonaSwitcher" src/app/ --include="*.tsx" | head -5
# MUST find at least one mount point
```

**Commit:** `OB-89 Mission 1: Persona switcher fixed — context-only impersonation, sessionStorage persistence`

---

## MISSION 2: STUB PAGE CLEANUP

### 2A: Define the Page Inventory

From Phase 0 output, categorize every page into:

| Category | Action |
|----------|--------|
| **LIVE** — Has real content, reads from Supabase | KEEP |
| **FUNCTIONAL** — Works but needs polish | KEEP |
| **STUB** — Redirects to parent or shows empty shell | REMOVE page, keep sidebar link as disabled OR remove link |
| **DUPLICATE** — Same feature in two locations | REMOVE one, redirect the other |

### 2B: Remove Stub Pages

For every page classified as STUB in Phase 0:

1. Delete the `page.tsx` file
2. Remove or disable the corresponding sidebar navigation link
3. If the feature is planned (not abandoned), replace with a meaningful empty state:

```tsx
// Empty state template for planned features
export default function PlannedFeaturePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-4xl mb-4">🚧</div>
      <h2 className="text-xl font-semibold text-gray-700 mb-2">Coming Soon</h2>
      <p className="text-gray-500 max-w-md">
        This feature is in development. Check back soon.
      </p>
    </div>
  );
}
```

### 2C: Resolve Duplicate Routes

Based on Phase 0 findings, consolidate:

| Feature | Keep | Remove/Redirect |
|---------|------|-----------------|
| Reconciliation | `/investigate/reconciliation` (OB-87 rewrite lives here) | Any other reconciliation route → redirect here |
| Calculations | `/operate/calculate` (primary) | `/investigate/calculations` → redirect to operate |
| Periods | `/operate/periods` OR `/configure/periods` (pick ONE) | Redirect the other |

### 2D: Sidebar Navigation Sync

After removing stub pages, update the sidebar configuration so it only shows links to pages that exist and work:

```bash
echo "=== SIDEBAR CONFIG ==="
find src -name "*sidebar*" -o -name "*nav-items*" -o -name "*navigation-config*" | grep -v node_modules | head -10
```

Remove or disable (gray out with "Coming Soon" tooltip) any sidebar link whose destination page was removed.

**Commit:** `OB-89 Mission 2: Stub pages removed, duplicates consolidated, sidebar synced`

---

## MISSION 3: CONSOLE ERROR SILENCE

### 3A: Null Tenant Guard on Reads

The most common console error is Supabase 400 from read queries with null/empty tenant_id. From Phase 0 output, find all unguarded read queries and add early returns:

```typescript
// Pattern: guard every Supabase read that filters by tenant_id
export async function fetchSomeData(tenantId: string | null) {
  if (!tenantId) return [];  // ← THIS IS THE FIX
  
  const { data, error } = await supabase
    .from('some_table')
    .select('*')
    .eq('tenant_id', tenantId);
  
  if (error) {
    console.error('fetchSomeData error:', error.message);
    return [];
  }
  return data;
}
```

Apply this pattern to EVERY read function that takes tenant_id. Do NOT add `requireTenantId()` assertions to reads — those throw and crash the page. Reads should gracefully return empty.

### 3B: .trim() Null Guards

Find every `.trim()` call and guard:

```typescript
// Before (crashes if value is null/undefined)
const cleaned = value.trim();

// After
const cleaned = (value ?? '').trim();
```

### 3C: configuration.variants Guard

Find the component that accesses `configuration.variants` and add a guard:

```typescript
// Before
const variants = configuration.variants;

// After
const variants = configuration?.variants ?? [];
```

### 3D: Verify Console Silence

After fixes, start the dev server and check:

```bash
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10

# Check for TypeErrors in build output
grep -i "error\|TypeError\|undefined" .next/build-output.log 2>/dev/null || echo "No build log"
```

Then manually open localhost:3000 and verify the console shows zero errors on:
1. Login page
2. Tenant selector
3. Dashboard (after selecting a tenant)
4. Navigate to 3 different pages

**Commit:** `OB-89 Mission 3: Console errors silenced — null guards on reads, .trim(), variants`

---

## MISSION 4: N+1 QUERY MITIGATION

### 4A: Identify Top Offenders

From Phase 0 output, identify which components make direct Supabase calls instead of using shared services.

### 4B: Create Shared Data Provider (if not exists)

If there's no centralized data fetching for the authenticated session, create one:

```typescript
// web/src/contexts/session-data-context.tsx
// Fetches ONCE on mount: tenant, profile, periods, latest batch
// All child components read from context instead of individual queries
```

This context fetches on auth + tenant selection:
- Current tenant details
- Current user profile  
- Active periods for this tenant
- Latest calculation batch (if any)

Components that previously made individual queries now consume from this context.

### 4C: Deduplicate Component Queries

For the top 5 most-queried data points (likely: tenant, profile, periods, entities count, batch status), replace direct Supabase calls in components with context reads.

**NOTE:** This is a mitigation, not a full rewrite. Reduce from 5,928 to under 50 requests on page load. A full data layer redesign is a separate effort.

**Commit:** `OB-89 Mission 4: N+1 query mitigation — shared session data context`

---

## MISSION 5: TENANT SELECTOR CLEANUP

### 5A: Hide Non-Demo Tenants

The tenant selector should only show tenants that are demo-ready. Hide any tenant that:
- Has no entities
- Has a name containing "Test", "Pipeline", "RetailCo", "FRMX", "Retail Conglomerate"
- Was created by development scripts (not seed scripts)

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: tenants } = await sb.from('tenants').select('id, name, slug');
console.log('All tenants:');
tenants?.forEach(t => console.log('  ', t.id.substring(0, 8), t.name, '(' + t.slug + ')'));
"
```

**Option A (preferred):** Add `demo_ready: boolean` to tenant settings. Only show tenants where `settings.demo_ready === true`.

**Option B (simpler):** Filter on the client — exclude tenants with known test slugs.

### 5B: Add VL Admin Indicator

The tenant selector should clearly show that the user is a VL Admin (platform-level access). Add a subtle indicator:

```
┌──────────────────────────────────────────┐
│  🔑 VL Admin — Select a tenant          │
│                                          │
│  ┌──────────┐  ┌──────────────────────┐  │
│  │ Optica   │  │ Velocidad            │  │
│  │ Luminar  │  │ Deportiva            │  │
│  │ 22 users │  │ 35 users             │  │
│  └──────────┘  └──────────────────────┘  │
└──────────────────────────────────────────┘
```

**Commit:** `OB-89 Mission 5: Tenant selector — hide test tenants, demo-ready filter`

---

## MISSION 6: BUILD + VERIFICATION

### 6A: Build

```bash
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### 6B: Verification Script

Create `web/scripts/ob89-verify.ts`:

```bash
echo "=== OB-89 VERIFICATION ==="

echo ""
echo "1. Persona Switcher"
ls web/src/components/demo/DemoPersonaSwitcher.tsx && echo "  ✅ Component exists" || echo "  ❌ MISSING"
grep -c "signOut\|signIn" web/src/components/demo/DemoPersonaSwitcher.tsx 2>/dev/null
echo "  (should be 0 — no auth round-trip)"
grep -c "sessionStorage" web/src/components/demo/DemoPersonaSwitcher.tsx web/src/contexts/persona-context.tsx 2>/dev/null
echo "  (should be >0 — persistence)"

echo ""
echo "2. Stub Pages Removed"
STUBS=$(grep -rn "redirect\|router.push\|router.replace" web/src/app/ --include="page.tsx" -l 2>/dev/null | wc -l)
echo "  Pages with redirects: $STUBS (target: <5)"

echo ""
echo "3. Console Error Sources"
UNGUARDED=$(grep -rn "\.trim()" web/src/ --include="*.ts" --include="*.tsx" | grep -v "??" | grep -v "|| ''" | grep -v node_modules | grep -v ".next" | wc -l)
echo "  Unguarded .trim() calls: $UNGUARDED (target: 0)"

echo ""
echo "4. Duplicate Routes"
echo "  Reconciliation pages:"
find web/src/app -path "*reconcil*" -name "page.tsx" | sort
echo "  (target: exactly 1)"

echo ""
echo "5. Build"
echo "  npm run build exit code: $?"
```

### 6C: Browser Verification Checklist

Manually verify in localhost:3000 (paste results into completion report):

| # | Test | Expected |
|---|------|----------|
| 1 | Login as platform@vialuce.com | Tenant selector |
| 2 | Only demo-ready tenants visible | Optica Luminar + Velocidad Deportiva (no test tenants) |
| 3 | Select Optica Luminar | Dashboard loads, zero console errors |
| 4 | Persona switcher visible at bottom | Fixed bar with Admin/Gerente/Vendedor chips |
| 5 | Click "Admin" chip | Dashboard changes to admin view |
| 6 | Click "Gerente" chip | Dashboard changes to manager view |
| 7 | Click "Vendedor" chip | Dashboard changes to rep view |
| 8 | Navigate to another page while in Vendedor | Persona persists (sessionStorage) |
| 9 | Click "Platform" to return to VL Admin | Full access restored |
| 10 | Navigate to removed stub page URL directly | 404 or redirect to parent (not blank page) |
| 11 | Console: zero 400 errors through entire flow | Clean |
| 12 | Console: zero TypeErrors through entire flow | Clean |

**Commit:** `OB-89 Mission 6: Build verification — clean build, browser checklist`

---

## MISSION 7: COMPLETION REPORT + PR

### Completion Report

Save as `OB-89_COMPLETION_REPORT.md` in PROJECT ROOT.

1. Phase 0 diagnostic output (summary, not full paste)
2. Persona switcher: before/after, implementation approach
3. Stub pages: inventory of removed pages, remaining live pages
4. Console errors: list of fixes applied
5. N+1 mitigation: before/after request count estimate
6. Tenant selector: hidden tenants
7. All proof gates with PASS/FAIL and evidence
8. Browser verification checklist results

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-89: Platform Hardening — Persona Switcher, Stub Cleanup, Console Silence" \
  --body "## What This Fixes

### Demo Persona Switcher
- Context-only impersonation (no auth round-trip)
- sessionStorage persistence across navigation
- Chips: Platform Admin | Admin | Manager | Rep

### Stub Page Cleanup
- [N] stub pages removed
- Duplicate routes consolidated (reconciliation, calculations)
- Sidebar navigation synced to actual pages

### Console Error Silence
- Null tenant guards on all read queries
- .trim() null guards
- configuration.variants guard

### N+1 Query Mitigation
- Shared session data context
- Reduced from ~5,928 to ~[N] requests on page load

### Tenant Selector
- Test/development tenants hidden
- Only demo-ready tenants visible

## Proof Gates: see OB-89_COMPLETION_REPORT.md"
```

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Phase 0 diagnostic committed | Full platform inventory |
| PG-2 | DemoPersonaSwitcher exists | Component file present |
| PG-3 | No signOut/signIn in switcher | grep returns 0 results |
| PG-4 | sessionStorage persistence | Persona survives navigation |
| PG-5 | Switcher mounted in layout | grep finds mount point |
| PG-6 | demo_users populated in tenant settings | Both demo tenants have demo_users |
| PG-7 | Stub pages removed | <5 redirect-only pages remain |
| PG-8 | Duplicate routes resolved | Exactly 1 reconciliation page, 1 calculation page |
| PG-9 | Sidebar links sync to pages | No sidebar link points to removed page |
| PG-10 | Null tenant read guards | All read functions return [] on null tenant |
| PG-11 | .trim() guarded | Zero unguarded .trim() calls |
| PG-12 | configuration.variants guarded | No crash on undefined variants |
| PG-13 | Session data context exists | Shared context for tenant/profile/periods |
| PG-14 | Test tenants hidden from selector | Only demo-ready tenants shown |
| PG-15 | npm run build exits 0 | Clean build |
| PG-16 | localhost:3000 responds | HTTP 200/307 |
| PG-17 | Zero console errors on dashboard load | DevTools console clean |
| PG-18 | Persona switch works without page reload | Context-only, no auth round-trip |
| PG-19 | Persona persists across navigation | sessionStorage checked |
| PG-20 | Korean Test | Zero hardcoded tenant names, user names, or language strings |
| PG-21 | Completion report committed | OB-89_COMPLETION_REPORT.md |

---

## CC FAILURE PATTERN WARNING

| Pattern | What Happened Before | What To Do Instead |
|---------|---------------------|-------------------|
| Auth round-trip for persona switch | OB-46C planned context-only but prior code used signOut/signIn | Context override ONLY. Zero auth calls. |
| Removing pages without updating sidebar | Previous cleanups left dead links | Update sidebar config in SAME commit as page removal |
| Theory console silence | Claimed "fixed" without running dev server | Start dev server, open browser, verify DevTools console EMPTY |
| Mock data in demo components | Replaced real queries with hardcoded arrays | All data from Supabase or explicit empty states |
| N+1 "fix" breaks existing pages | Refactored data layer causes regressions | Additive context — components can ALSO use context, old code still works |

---

## WHAT THIS OB DOES NOT BUILD

- New features (no new pages, no new calculations, no new AI pipelines)
- Mobile responsive design
- Navigation IA redesign (separate design session needed)
- Billing/stripe integration
- Role-based middleware authorization (separate OB)

This OB ONLY fixes the browser experience: broken switcher, dead pages, console noise, duplicate routes.

---

*OB-89 — February 24, 2026*
*"The platform has 869 tests. The browser has 5,928 requests per page load and a broken persona switcher. Fix the browser."*
