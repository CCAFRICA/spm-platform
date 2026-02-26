# HF-060: Financial Module Persona Filtering & Location Detail Query Fix

**Priority:** P0 — Demo Blocker
**Trigger:** CLT-99 findings F-3, F-4
**Branch:** dev
**Estimated time:** 30-45 minutes

---

## STANDING RULES
1. Read `CC_STANDING_ARCHITECTURE_RULES.md` first.
2. Commit + push after every change.
3. Kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000 before completion report.
4. Git from repo root (spm-platform), NOT web/.
5. Supabase .in() ≤ 200 items.
6. Zero component-level Supabase calls (Standing Rule 26).
7. Korean Test on all code.

---

## CONTEXT

OB-99 (PR #93, merged and deployed) created a server-side API route at `/api/financial/data` with 10 aggregation modes to eliminate N+1 queries. It also added persona filtering via `usePersona()` and `scopeEntityIds` parameter.

**Two things are broken:**

1. **Persona filtering doesn't work.** Rep persona in DemoPersonaSwitcher shows full admin Network Pulse (all 20 locations, all 3 brands, MX$17M total). 486 requests, 6.8 min. The Rep (server) should see only their assigned location.

2. **Location Detail still N+1.** `/financial/location/[id]` page generates 577 requests, 13 min load. OB-99 claimed this was rewritten but the network tab shows hundreds of individual Supabase fetches.

---

## PHASE 1: Diagnose Persona Filtering

### 1A: Trace the persona data flow

```bash
# Find how DemoPersonaSwitcher communicates persona
grep -rn "usePersona\|PersonaContext\|DemoPersonaSwitcher\|persona" web/src/app/financial/page.tsx | head -20

# Find what scopeEntityIds actually contains when Rep is selected
grep -rn "scopeEntityIds\|scope" web/src/app/api/financial/data/route.ts | head -20

# Find persona → entity mapping
grep -rn "persona.*entity\|entity.*persona\|rep.*scope\|server.*scope" web/src/lib/ web/src/contexts/ | head -20
```

### 1B: Identify the disconnect

The likely failure is one of:
- **DemoPersonaSwitcher sets persona role but doesn't set entity scope** — the persona context has `role: 'rep'` but no `entityId` or `scopeEntityIds`
- **Financial pages read persona role but don't look up the entity** — `usePersona()` returns the role, but nobody translates `role='rep'` into `scopeEntityIds=['specific-server-entity-id']`
- **API route receives scopeEntityIds but it's empty/undefined** — the parameter exists but is never populated

### 1C: Verify the API route filtering

Check `/api/financial/data/route.ts`:
- Does it accept `scopeEntityIds` parameter?
- Does it actually filter `committed_data` queries when scopeEntityIds is provided?
- What happens when scopeEntityIds is empty/undefined? (should it return nothing for rep, or everything?)

---

## PHASE 2: Fix Persona Filtering

Based on diagnosis, implement the correct fix:

### If the issue is DemoPersonaSwitcher → entity mapping:

The DemoPersonaSwitcher needs to set not just the role but the entity scope. For Sabor Grupo:
- **Admin:** All entities (no filter)
- **Manager:** All entities in their region/brand (or all with manager banner)
- **Rep:** Single server entity — the persona's own entity_id

The mapping likely needs to come from the `profiles` table or the persona switcher configuration — when switching to Rep, look up which entity corresponds to that profile and set scopeEntityIds accordingly.

### If the issue is financial pages not passing scope to API:

Each financial page should:
1. Call `usePersona()` to get current role and entity scope
2. Pass `scopeEntityIds` to the financial data service function
3. The service function includes scopeEntityIds in the API route request body
4. The API route filters `committed_data` WHERE `entity_id IN scopeEntityIds`

### For Rep persona specifically:

A server (Rep) in a restaurant context should NOT see Network Pulse at all. They should be redirected to their Server Detail page (`/financial/server/[id]`). If the persona is Rep and we have their entity_id:
- Redirect `/financial` → `/financial/server/[entity_id]`
- This shows their checks, revenue, tips, Performance Index

**Important:** Don't hardcode entity IDs. Read from the persona/profile context.

### PROOF GATE 2:
```
Switch to Rep persona → Financial module loads Server Detail for that rep's entity
Switch to Manager persona → Financial module loads Network Pulse scoped to their entities
Switch to Admin persona → Financial module loads full Network Pulse
```

---

## PHASE 3: Fix Location Detail N+1

### 3A: Audit `/financial/location/[id]/page.tsx`

```bash
# Check if page still has direct Supabase calls
grep -n "supabase\|createClient\|from(" web/src/app/financial/location/\\[id\\]/page.tsx | head -20

# Check if it calls the API route
grep -n "api/financial\|fetch.*financial\|loadLocation" web/src/app/financial/location/\\[id\\]/page.tsx | head -20
```

### 3B: Identify what's generating 577 requests

The 577 requests may be:
1. **Direct Supabase calls still in the page** — OB-99 rewrite may have been incomplete
2. **Shared platform context queries** — tenant, profiles, calculation_batches, rule_sets queries from layout/shell components (this is the systemic F-8 problem — don't solve the systemic issue here, just confirm whether the financial-specific queries are fixed)

If it's #1: Complete the rewrite — all data fetching through `/api/financial/data?mode=location_detail&locationId=X`

If it's #2: The financial-specific fix is working but the 577 requests are platform overhead. Document this and move on — OB-100 handles the systemic N+1.

### 3C: Verify location detail data loading

```bash
# In browser, open Network tab, navigate to a location detail page
# Filter by "financial" or "data" in the Name column
# Should see exactly 1 request to /api/financial/data
# All other requests (tenants, profiles, etc.) are platform overhead — not this HF's scope
```

### PROOF GATE 3:
```
Navigate to any location detail page
Filter network tab for "api/financial" → exactly 1 request
Page renders with: revenue, checks, tip rate, guests, leakage, weekly chart, food/beverage, staff table
```

---

## PHASE 4: Build + Verify + Completion

```bash
# Standard build verification
kill dev server
rm -rf .next
npm run build  # must exit 0
npm run dev
# Visit localhost:3000
# Test: Admin sees full Network Pulse
# Test: Rep redirects to Server Detail (or sees scoped view)
# Test: Location Detail loads with 1 financial API request

# PR creation
gh pr create --base main --head dev --title "HF-060: Financial persona filtering + location detail query fix" --body "Fixes CLT-99 F-3 (Rep sees admin view) and F-4 (Location Detail N+1). Rep persona now routes to Server Detail. Location Detail uses API route exclusively."
```

---

## SCOPE BOUNDARIES

**IN SCOPE:**
- Persona filtering on Financial pages (F-3)
- Rep → Server Detail redirect
- Location Detail query fix (F-4)
- Location Detail chart Y-axis formatting (F-5)

**OUT OF SCOPE:**
- Systemic platform N+1 (F-8) — OB-100
- Navigation awareness for Financial-only tenants (F-2, F-6, F-7) — OB-100
- Brand card positioning and clickability (F-9, F-10, F-11) — OB-100
- Observatory Fleet filter (F-1) — OB-100
- Amber threshold verification (F-12) — OB-100
