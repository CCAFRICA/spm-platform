# HF-037: OBSERVATORY TENANT ACCESS AND DEMO SWITCHER

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## Standing Rules
1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Final step: `gh pr create --base main --head dev` with descriptive title and body.

## CC Anti-Patterns (DO NOT DO THESE)
- **Placeholder Syndrome:** Substitutes stubs for real logic
- **Grep-Based Verification:** Verify by tracing rendering chains, not grepping class names
- **Autonomy Leakage:** Stops to ask despite explicit autonomy directive

---

## THE PROBLEM

The Platform Observatory (OB-47) replaced `/select-tenant` for VL Admin users. Three navigation gaps exist:

1. **Cannot enter a tenant from the Observatory.** The Observatory shows tenant fleet cards but clicking them does not navigate into a tenant context. The old tenant picker had clickable cards that set the tenant cookie and redirected to `/`. The Observatory fleet cards may have `handleSelectTenant` wired (HF-036 PG-10 reports PASS) but the actual navigation is not working in the browser.

2. **Demo Persona Switcher not accessible.** The DemoPersonaSwitcher (Admin/Gerente/Vendedor tabs) was previously visible on the tenant select page or within the auth-shell after entering a tenant. With the Observatory replacing the tenant select page, the switcher may not appear until you're already inside a tenant — but you can't get inside a tenant (problem #1). Chicken-and-egg.

3. **Observatory metrics show 0 Tenants.** The fleet hero metrics (Active Tenants, Total Entities, etc.) display zeros despite Óptica Luminar and Velocidad Deportiva existing in the `tenants` table with full seeded data. The Supabase queries in `platform-queries.ts` may have RLS issues or query errors.

---

## PHASE 0: DIAGNOSTIC

### 0A: Trace tenant selection flow

```bash
echo "=== OBSERVATORY TAB — TENANT CARD CLICK HANDLER ==="
grep -n "handleSelectTenant\|selectTenant\|enterTenant\|onClick.*tenant" \
  web/src/components/platform/ObservatoryTab.tsx | head -15

echo ""
echo "=== HOW IS TENANT CONTEXT SET? ==="
grep -rn "setTenant\|vialuce-tenant-id\|tenant.*cookie\|tenant.*context" \
  web/src/contexts/ web/src/lib/ --include="*.ts" --include="*.tsx" | head -15

echo ""
echo "=== WHAT DOES THE OLD TENANT PICKER DO? ==="
# The old TenantPicker component may still exist somewhere
find web/src -name "*TenantPicker*" -o -name "*tenant-picker*" -o -name "*tenant-select*" | head -5
grep -rn "TenantPicker\|tenantPicker" web/src/ --include="*.tsx" | head -10
```

### 0B: Trace demo persona switcher

```bash
echo "=== DEMO PERSONA SWITCHER COMPONENT ==="
find web/src -name "*DemoPersona*" -o -name "*demo-persona*" -o -name "*PersonaSwitcher*" | head -5

echo ""
echo "=== WHERE IS IT RENDERED? ==="
grep -rn "DemoPersonaSwitcher\|PersonaSwitcher" web/src/ --include="*.tsx" | head -10

echo ""
echo "=== DOES IT DEPEND ON TENANT CONTEXT? ==="
# Check if the switcher only renders when a tenant is selected
grep -n "tenantId\|tenant_id\|selectedTenant" web/src/components/**/DemoPersonaSwitcher* 2>/dev/null | head -10
```

### 0C: Trace Observatory metrics

```bash
echo "=== PLATFORM QUERIES — TENANT COUNT ==="
grep -n "tenants\|count\|fleet" web/src/lib/data/platform-queries.ts | head -20

echo ""
echo "=== OBSERVATORY TAB — DATA FETCHING ==="
grep -n "useEffect\|useState\|fetch\|getFleet\|getTenants\|loadData" \
  web/src/components/platform/ObservatoryTab.tsx | head -20

echo ""
echo "=== CHECK RLS POLICIES FOR PLATFORM SCOPE ==="
# The platform user may not have the right RLS permissions for cross-tenant queries
grep -rn "scope_level.*platform\|platform.*scope" web/src/lib/ --include="*.ts" | head -10
```

### Phase 0 Required Output

```
TENANT SELECTION
=====================================
Click handler exists:     [YES/NO — what function?]
Sets tenant context via:  [cookie / state / context / NOT FOUND]
Redirects to:             [/ / dashboard / NOT FOUND]
Navigation actually fires: [YES/NO — trace the full chain]

DEMO PERSONA SWITCHER
=====================================
Component location:       [path]
Rendered in:              [auth-shell / sidebar / Observatory / NOT FOUND]
Requires tenant context:  [YES/NO]
Visible before tenant selection: [YES/NO]

OBSERVATORY METRICS
=====================================
Query function:           [function name]
Returns data:             [YES/NO — paste result or error]
RLS blocking:             [YES/NO]
Tenant count in Supabase: [query directly to verify]
```

**Commit:** `HF-037 Phase 0: diagnostic — tenant selection, persona switcher, metrics`

---

## PHASE 1: FIX TENANT ENTRY FROM OBSERVATORY

The Observatory fleet cards MUST allow VL Admin to enter any tenant.

### If click handler exists but doesn't navigate:
Wire the handler to:
1. Set the tenant context (cookie `vialuce-tenant-id` + any context state)
2. Call `router.push('/')` to navigate to the tenant dashboard

### If click handler doesn't exist:
Add onClick to each tenant fleet card:
```typescript
const handleEnterTenant = (tenantId: string) => {
  // Set tenant cookie
  document.cookie = `vialuce-tenant-id=${tenantId};path=/;max-age=${60*60*24*30}`;
  // Update context if tenant context exists
  if (setSelectedTenant) setSelectedTenant(tenantId);
  // Navigate to dashboard
  router.push('/');
};
```

### Visual treatment:
Each tenant card should have a clear "Enter" button or be entirely clickable with hover state indicating it's interactive.

**Proof gate:** Clicking a tenant card in the Observatory sets the tenant context and navigates to the tenant dashboard. The dashboard shows that tenant's data.

**Commit:** `HF-037 Phase 1: fix tenant entry from Observatory`

---

## PHASE 2: FIX DEMO PERSONA SWITCHER ACCESS

Two options depending on Phase 0 findings:

### Option A: Switcher exists but only shows after tenant selection
This is the chicken-and-egg problem. Fix by adding the switcher to the Observatory itself — below the fleet cards, or as a collapsible panel. It only needs to work for VL Admin (who is the demo operator).

### Option B: Switcher is missing entirely
Re-add the DemoPersonaSwitcher component to the rendering chain. The switcher should appear:
- In the Observatory (for VL Admin switching personas before entering a tenant)
- OR in the auth-shell/sidebar after entering a tenant

The switcher needs to work in this flow:
1. VL Admin sees Observatory
2. Clicks "Enter Tenant" on Óptica Luminar
3. Lands on tenant dashboard as Admin
4. Can switch to Gerente (manager) or Vendedor (rep) persona
5. Dashboard re-renders with persona-appropriate view

### If the switcher needs tenant context to render:
Add it inside the tenant dashboard, not the Observatory. Ensure it's visible and accessible — not buried at the bottom of a collapsed sidebar section.

**Proof gate:** After entering a tenant, VL Admin can switch between Admin/Gerente/Vendedor personas and the dashboard re-renders with the appropriate view.

**Commit:** `HF-037 Phase 2: fix demo persona switcher access`

---

## PHASE 3: FIX OBSERVATORY METRICS

The hero metrics show 0 despite data existing.

### Most likely cause: RLS blocking cross-tenant queries
The VL Admin user (platform@vialuce.com) has `scope_level = 'platform'` in the profiles table. The RLS policies should allow platform-scoped users to read across tenants. But the Supabase client may be using the anon key (which respects RLS) and the policies may not be correct.

### Debug:
```bash
echo "=== CHECK PLATFORM USER PROFILE ==="
# Verify the platform user exists with scope_level = 'platform'
echo "SELECT id, email, scope_level, tenant_id FROM profiles WHERE email = 'platform@vialuce.com'" 

echo ""
echo "=== CHECK RLS ON TENANTS TABLE ==="
# The tenants table should have a policy allowing platform scope to read all
echo "Look for: CREATE POLICY on tenants allowing scope_level = 'platform'"
```

### Fix approaches:

**If RLS is blocking:** The query functions in `platform-queries.ts` may need to use a different approach:
- Option 1: Fix RLS policies to allow platform-scoped users cross-tenant reads
- Option 2: Use an API route with service role key for platform-level queries
- Option 3: The query may be filtering by tenant_id when it shouldn't be

**If queries return errors:** Fix the query logic in `platform-queries.ts`. Common issues:
- Calling `.count()` incorrectly (Supabase count needs `{ count: 'exact', head: true }`)
- Table name mismatches
- Missing error handling (error swallowed, returns 0)

**If data doesn't exist:** Run the seed scripts to verify Óptica Luminar and Velocidad Deportiva are in the tenants table.

**Proof gate:** Observatory hero metrics show real numbers: 2 Active Tenants, correct entity count, correct calculation batch count.

**Commit:** `HF-037 Phase 3: fix Observatory metrics — RLS and query fixes`

---

## PHASE 4: VERIFICATION BUILD

```bash
npx tsc --noEmit        # Must exit 0
npm run build            # Must exit 0
npm run dev              # Must start without errors
```

### Proof Gates

| # | Gate | Check |
|---|------|-------|
| PG-1 | Clicking Óptica Luminar fleet card enters tenant context | |
| PG-2 | After entering tenant, dashboard loads with that tenant's data | |
| PG-3 | Clicking Velocidad Deportiva fleet card enters that tenant | |
| PG-4 | "← Observatory" link returns VL Admin to Observatory | |
| PG-5 | Demo persona switcher accessible after entering a tenant | |
| PG-6 | Switching to Gerente persona re-renders dashboard with manager view | |
| PG-7 | Switching to Vendedor persona re-renders dashboard with rep view | |
| PG-8 | Observatory shows 2 Active Tenants (not 0) | |
| PG-9 | Observatory shows correct entity counts per tenant | |
| PG-10 | Create New Tenant card still present and navigates correctly | |
| PG-11 | Non-VL-Admin users still redirect away from Observatory | |
| PG-12 | npx tsc --noEmit exits 0 | |
| PG-13 | npm run build exits 0 | |

---

## COMMIT SEQUENCE

```
Phase 0: git commit -m "HF-037 Phase 0: diagnostic — tenant entry, persona, metrics"
Phase 1: git commit -m "HF-037 Phase 1: fix tenant entry from Observatory"
Phase 2: git commit -m "HF-037 Phase 2: fix demo persona switcher access"
Phase 3: git commit -m "HF-037 Phase 3: fix Observatory metrics"
Phase 4: git commit -m "HF-037 Phase 4: verification build"
Final:   gh pr create --base main --head dev --title "HF-037: Observatory Tenant Access + Demo Switcher + Metrics" --body "Fixes three gaps in the Platform Observatory: tenant entry via fleet cards (click to enter tenant context), demo persona switcher access (Admin/Gerente/Vendedor), and Observatory hero metrics showing real data instead of zeros."
```

---

*ViaLuce.ai — The Way of Light*
*HF-037: "If you can see it but can't get to it, it's a window, not a door."*
