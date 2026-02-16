# HF-025: TENANT PICKER CLEANUP AND OPTICA LUMINAR SURFACE

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## Standing Rules
After EVERY commit: `git push origin dev`
After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.

---

## CONTEXT

Production auth is working (HF-024 fixed the anon key issue). The VL Platform Admin can log in and reach the tenant picker. However:

### Issue 1: Optica Luminar Not Visible
The select-tenant page shows 4 legacy static JSON tenants (TechCorp, RestaurantMX, RetailCo, FRMX Demo) but NOT Optica Luminar, which was seeded into Supabase by HF-023. The Supabase tenants table has Optica Luminar but the page either isn't querying Supabase or isn't merging results.

### Issue 2: Legacy Static Tenants Cause 400 Floods
The static JSON tenants (TechCorp, RestaurantMX, RetailCo, FRMX Demo) don't exist in Supabase. Selecting any of them causes every dashboard query to return 400 Bad Request because there's no matching tenant_id in Supabase. The console shows 20+ errors per page load.

### Issue 3: Stale Tenant Branding in Nav
After selecting a tenant, the top-left corner under the ViaLuce logo shows a hardcoded tenant name and description (e.g., "FRMX Demo TS"). The header breadcrumb bar also shows the old tenant name (e.g., "FRMX Restauran..."). These should display the SELECTED tenant's name dynamically, or be removed if no tenant-specific branding is needed.

### Issue 4: "Customer Launch" Banner
The tenant picker shows a prominent "Customer Launch — Start the O1→O8 onboarding flow for a new customer" banner. This is either a placeholder or future feature. If the flow doesn't exist yet, the banner should be hidden or marked as "Coming Soon" to avoid a dead-end click.

---

## PHASE 0: RECONNAISSANCE

```bash
cd /Users/AndrewAfrica/spm-platform/web

# 1. How does select-tenant load tenants?
cat src/app/select-tenant/page.tsx

# 2. Where are static JSON tenant configs?
find src/ -name "*.json" -path "*tenant*" | head -10
grep -rn "TechCorp\|RetailCo\|RestaurantMX\|FRMX" src/ --include="*.ts" --include="*.tsx" --include="*.json" | head -20

# 3. How is tenant name displayed in nav/sidebar?
grep -rn "FRMX\|tenant.*name\|tenantName\|tenant_name" src/components/layout/ --include="*.tsx" | head -20

# 4. What's in the tenant context?
cat src/contexts/tenant-context.tsx | head -80

# 5. Where does the breadcrumb/header get tenant info?
grep -rn "breadcrumb\|FRMX Restauran" src/ --include="*.tsx" | head -10

# 6. What tenants exist in Supabase?
# Check the seed output
cat scripts/seed-optica-luminar.ts | grep "tenant" | head -10

# 7. Check if Customer Launch is a real route
ls src/app/customer-launch/ 2>/dev/null || echo "No customer-launch route"
grep -rn "customer-launch\|Customer Launch\|onboarding" src/ --include="*.tsx" | head -10
```

**Commit:** `HF-025 Phase 0: Reconnaissance`

---

## PHASE 1: TENANT PICKER — SUPABASE ONLY

### 1A: Remove Static JSON Tenant Registry

Find and remove (or deprecate) the static tenant configuration files. These were useful when the app ran on localStorage but are now superseded by Supabase.

If removing them entirely would break other parts of the app (e.g., theme configs, module configs), instead mark them as deprecated and ensure the tenant picker does NOT load from them.

### 1B: Select-Tenant Loads from Supabase Only

Rewrite the select-tenant page to query ONLY the Supabase `tenants` table:

```typescript
// Pseudocode
const { data: tenants } = await supabase
  .from('tenants')
  .select('id, name, slug, industry, country_code, modules_enabled, settings')
  .order('name');
```

Each tenant card should display:
- Tenant name (from Supabase)
- Industry label
- Country flag (derive from country_code)
- Entity count (query entities table: `select count(*) from entities where tenant_id = ?`)
- Status badge ("active")

### 1C: Remove or Defer Customer Launch Banner

If the Customer Launch flow (/customer-launch or O1→O8 onboarding) doesn't exist as a working feature:
- Hide the banner entirely, OR
- Replace with a subtle "Coming Soon" card that is not the primary visual element

The banner is currently the most prominent element on the page — it shouldn't be a dead-end.

### 1D: Create New Tenant Card

The "Create New Tenant" card can stay if it leads to a working provisioning flow. If not, hide it or make it "Coming Soon" as well.

**Commit:** `HF-025 Phase 1: Tenant picker loads from Supabase only, legacy static configs removed`

---

## PHASE 2: TENANT BRANDING IN NAV

### 2A: Sidebar Tenant Name

The top-left area under the ViaLuce logo should display the CURRENTLY SELECTED tenant's name dynamically. Find where this is hardcoded or loaded from static config and replace with the tenant context value.

```typescript
// Should read from tenant context, not static config
const { tenant } = useTenantContext();
// Display: tenant.name (e.g., "Optica Luminar")
// Sub-text: tenant.industry or tenant.settings.domain_labels or nothing
```

If no tenant is selected (platform admin hasn't chosen yet), show "ViaLuce Platform" or "Select Organization."

### 2B: Header Breadcrumb

The header breadcrumb shows "FRMX Restauran..." — this should show the selected tenant's name or be removed if redundant with the sidebar. Ensure it reads from tenant context dynamically.

### 2C: Tenant Selector Dropdown in Header

The header shows a dropdown labeled "FRMX Demo" with a flag. This should:
- Display the selected tenant's name and country flag
- Allow switching tenants (redirect back to /select-tenant)
- Show "No tenant selected" if platform admin hasn't chosen

**Commit:** `HF-025 Phase 2: Dynamic tenant branding in nav, sidebar, header`

---

## PHASE 3: ELIMINATE 400 ERRORS

### 3A: Audit All Supabase Queries

Search for every Supabase query that uses tenant_id and ensure it has a null guard:

```bash
grep -rn "tenant_id\|tenantId" src/lib/ src/services/ src/contexts/ --include="*.ts" | head -30
```

Every query function should check for null/undefined tenant_id before executing:

```typescript
if (!tenantId) {
  console.warn('Skipping query — no tenant selected');
  return { data: null, error: null };
}
```

### 3B: Dashboard Components Guard

Dashboard widgets (YTD Outcome, Target Achievement, Team Ranking, Pending Outcomes) should handle the "no data" case gracefully — show placeholder/empty state instead of crashing or showing "$0.00" with errors underneath.

### 3C: Console Zero Audit

After all changes:
1. Log in as platform@vialuce.com
2. Navigate to /select-tenant — ZERO errors
3. Select Optica Luminar — ZERO errors
4. Navigate through Operate, Perform, Configure — ZERO 400 errors
5. Some pages may show "No data" empty states — that's correct behavior

**Commit:** `HF-025 Phase 3: Null tenant guards, zero 400 errors`

---

## PHASE 4: VERIFICATION

### 4A: Build

```bash
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### 4B: Platform Admin Flow

1. Open localhost:3000 incognito → redirects to /login
2. Log in as platform@vialuce.com / demo-password-VL1
3. Redirects to /select-tenant
4. **Optica Luminar visible** as a tenant card
5. NO TechCorp, RetailCo, RestaurantMX, FRMX Demo cards (unless they exist in Supabase)
6. Click Optica Luminar → enters dashboard
7. Sidebar shows "Optica Luminar" (not "FRMX Demo TS")
8. Header shows "Optica Luminar" in breadcrumb/dropdown
9. Console: ZERO 400 errors

### 4C: Tenant Admin Flow

1. Log out → log in as admin@opticaluminar.mx / demo-password-OL1
2. Goes directly to dashboard (no tenant picker)
3. Sidebar shows "Optica Luminar"
4. Dashboard shows entity count and any seeded data
5. Console: ZERO 400 errors

**Commit:** `HF-025 Phase 4: Verification complete`

---

## PHASE 5: COMPLETION REPORT

Create `HF-025_COMPLETION_REPORT.md` in PROJECT ROOT.

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | Optica Luminar visible on tenant picker | | |
| 2 | Legacy static tenants removed from picker | | |
| 3 | Tenant name displays dynamically in sidebar | | |
| 4 | Tenant name displays dynamically in header | | |
| 5 | Customer Launch banner removed or deferred | | |
| 6 | Zero 400 errors on /select-tenant | | |
| 7 | Zero 400 errors after selecting Optica Luminar | | |
| 8 | Zero 400 errors navigating workspace pages | | |
| 9 | Tenant admin skips picker, sees correct branding | | |
| 10 | Build passes with zero errors | | |
| 11 | localhost:3000 responds correctly | | |

**Commit:** `HF-025 Phase 5: Completion report`
**Push:** `git push origin dev`

---

## CRITICAL NOTES

- Do NOT delete the static tenant JSON files if other parts of the app depend on them for theming or module config. Instead, ensure the tenant picker doesn't read them, and the tenant context loads config from Supabase.
- The 400 errors are caused by queries firing before a valid tenant is selected. The fix is guards at the query level, not suppressing errors.
- Optica Luminar's tenant ID is `a1b2c3d4-e5f6-7890-abcd-ef1234567890` (from the seed script).
- After this HF, the ONLY tenants visible should be those in the Supabase `tenants` table.
