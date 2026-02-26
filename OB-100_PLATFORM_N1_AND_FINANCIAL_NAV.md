# OB-100: Platform-Wide N+1 Elimination & Financial Tenant Navigation

**Priority:** P0 (systemic performance) + P1 (navigation/UX)
**Trigger:** CLT-99 findings F-1, F-2, F-6, F-7, F-8, F-9, F-10, F-11, F-12
**Depends on:** HF-060 merged first
**Branch:** dev
**Estimated time:** 2-3 hours

---

## STANDING RULES
1. Read `CC_STANDING_ARCHITECTURE_RULES.md` first.
2. Commit + push after every change.
3. Kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000 before completion report.
4. Git from repo root (spm-platform), NOT web/.
5. Supabase .in() ≤ 200 items.
6. Zero component-level Supabase calls (Standing Rule 26).
7. Korean Test on all code.
8. Commit this prompt to git as first action.

---

## THE PROBLEM

Every page on the platform generates 500-860+ Supabase requests regardless of content. An empty Perform page: 726 requests, 17.4 min. A 4-row Team Management table: 863 requests, 19.1 min. The Financial N+1 was fixed in OB-99, but the PLATFORM N+1 remains — shared context hooks, layout components, and auth checks are hammering Supabase on every mount and re-render.

Additionally, the platform assumes ICM is always the primary experience. For Financial-only tenants (Sabor Grupo Gastronomico), the Operate, Perform, and Workforce pages are empty/irrelevant, creating a broken first impression.

---

## PHASE 0: Diagnostic — Identify the N+1 Sources

### 0A: Profile the request waterfall

Start the dev server and navigate to any page. Open Network tab. Categorize every request:

```bash
# Find all Supabase query patterns in the codebase
grep -rn "\.from(" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l

# Find which files make the most Supabase calls
grep -rn "\.from(" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | sed 's/:.*//g' | sort | uniq -c | sort -rn | head -20

# Find context providers that fetch data
grep -rn "supabase.*from\|\.from(" web/src/contexts/ web/src/providers/ | head -20

# Find layout components that fetch data
grep -rn "supabase.*from\|\.from(" web/src/app/layout.tsx web/src/app/*/layout.tsx web/src/components/shell/ web/src/components/layout/ 2>/dev/null | head -20

# Find useEffect fetches without proper dependency control
grep -rn "useEffect" web/src/contexts/ web/src/providers/ | head -20
```

### 0B: Identify the repeat offenders

From the network tab pattern (tenants?select=*, profiles?select=*, calculation_batches?*, rule_sets?*), the likely culprits are:

1. **TenantContext** — re-fetches tenant data on every navigation
2. **AuthShell / AuthShellProtected** — re-checks auth + profile on every mount
3. **PeriodSelector** — fetches periods + calculation_batches + rule_sets for the selector
4. **PersonaSwitcher** — fetches profiles for persona list
5. **Layout components** — nested layouts each fetching their own context

### 0C: Quantify the problem

For each identified source, count:
- How many requests it generates per page load
- Whether it caches results
- Whether it re-fetches on navigation between pages
- Whether multiple instances exist (e.g., 3 components all calling the same query)

### PROOF GATE 0:
```
Document: "X files make direct Supabase calls. Y context providers fetch on mount.
The top 5 request generators are: [list with request counts]"
Write findings to OB-100_PHASE0_DIAGNOSTIC.md, commit + push.
```

---

## PHASE 1: Eliminate Redundant Platform Queries

### Strategy: Centralized data loading with caching

The fix pattern:
1. **Single fetch per data type per navigation** — if TenantContext already fetched the tenant, nothing else should fetch it again
2. **Cache at context level** — React context providers should check if data is already loaded before fetching
3. **Prevent re-fetch on re-render** — use refs or state flags to prevent useEffect from re-triggering
4. **Deduplicate concurrent requests** — if 3 components call the same query simultaneously, only 1 request should fire

### 1A: Fix TenantContext (if identified as culprit)

```typescript
// PATTERN: Fetch-once with staleness check
const [tenant, setTenant] = useState(null);
const fetchingRef = useRef(false);

useEffect(() => {
  if (tenant || fetchingRef.current) return; // Already have data or fetching
  fetchingRef.current = true;
  // ... single fetch ...
}, [tenantId]); // Only re-fetch if tenant actually changes
```

### 1B: Fix AuthShell queries (if identified)

Auth checks should happen ONCE at the shell level and propagate via context. No child component should independently verify auth.

### 1C: Fix PeriodSelector / calculation_batches

The period selector fetches periods, calculation_batches, and rule_sets for its dropdown. This should:
- Fetch once when the tenant is selected
- Cache the result
- Only re-fetch when the user changes tenant or when a new calculation run occurs

### 1D: Evaluate SWR or React Query

If the codebase doesn't already use a data-fetching library with built-in caching and deduplication, consider adding one for the shared platform queries. BUT: do NOT refactor the entire codebase. Only apply to the identified top-5 request generators.

### PROOF GATE 1:
```
Navigate to Perform page (was 726 requests, 17.4 min)
Target: < 50 requests, < 5 seconds
Navigate to Workforce/Teams (was 863 requests, 19.1 min)
Target: < 50 requests, < 5 seconds
Navigate between pages: no re-fetch of already-loaded data
```

---

## PHASE 2: Financial Tenant Navigation Awareness

### 2A: Detect Financial-only tenant

A tenant is "Financial-only" when:
- It has `hasFinancial` flag/feature enabled
- It has NO active ICM rule sets (no compensation plans configured), OR
- Its only rule sets are Financial module rule sets (Performance Index, Server Commission)

```bash
# Check how hasFinancial is determined
grep -rn "hasFinancial\|financial.*module\|module.*financial" web/src/ --include="*.ts" --include="*.tsx" | head -20
```

### 2B: Operate landing redirect (F-2)

When a Financial-only tenant user navigates to `/operate`:
- Instead of showing the ICM lifecycle stepper, redirect to `/financial` OR
- Show the Financial Module banner as the PRIMARY content, not a secondary banner below an empty ICM lifecycle
- The ICM lifecycle stepper should be hidden when there are no ICM-relevant rule sets

### 2C: Perform redirect (F-6)

When a Financial-only tenant user navigates to `/perform`:
- Redirect to `/financial` OR
- Show Financial performance metrics (network summary, top locations, trend) instead of empty ICM dashboard

### 2D: Navigation sidebar adaptation

For Financial-only tenants, the left nav should:
- Elevate "Financial" to be a primary workspace (not nested under others)
- De-emphasize or hide ICM-specific items: Operations, Calculate, Reconciliation under OPERATE
- De-emphasize or hide: Dashboard, Results under PERFORM
- Hide or relabel: Team Management under WORKFORCE (unless teams are relevant)

**Implementation approach:** Don't delete routes. Add conditional rendering in the sidebar based on tenant module flags. A tenant with both ICM and Financial sees everything. A Financial-only tenant sees Financial-first navigation.

### PROOF GATE 2:
```
Login as Sabor Grupo Gastronomico admin
Navigate to /operate → lands on Financial module (not empty ICM lifecycle)
Navigate to /perform → lands on Financial module (not empty ICM dashboard)
Left nav shows Financial as primary workspace
ICM-specific items de-emphasized or hidden
```

---

## PHASE 3: Network Pulse Brand Card Fixes

### 3A: Brand cards above location groups (F-10)

Current: Brand summary cards at bottom of page, below all locations.
Fix: Brand card renders as a section header above its location cluster.

Layout:
```
[Costa Azul — Brand — 5 locations — MX$X revenue]
  [Costa Azul Puerto Juarez] [Costa Azul Malecon] [Costa Azul Boca del Rio] ...

[Fuego Dorado — Brand — 8 locations — MX$X revenue]
  [Fuego Dorado San Pedro] [Fuego Dorado Chapultepec] ...

[Rapido Verde — Brand — 7 locations — MX$X revenue]
  [Rapido Verde Tlaquepaque] [Rapido Verde Coyoacan] ...
```

### 3B: Brand cards clickable (F-9)

Brand header cards should be clickable:
- Click → filter Network Pulse to show only that brand's locations, OR
- Click → navigate to a brand summary page, OR
- Click → scroll to / expand that brand's section

Minimum viable: click toggles the brand's location visibility (expand/collapse).

### 3C: Brand label (F-11)

Add "Brand" label or use distinct visual treatment:
- Larger card with brand icon/color dot
- "Brand" subtitle or badge
- Visually distinct from location cards (different background, wider, full-width)

### 3D: Amber threshold verification (F-12)

Check the threshold logic:
```bash
grep -rn "amber\|within\|±10\|threshold\|getLocation" web/src/app/financial/page.tsx web/src/lib/financial/ | head -20
```

If no locations fall within ±10% of network average, that's valid data distribution — not a bug. But verify the threshold is actually being applied (not just green/red with no amber path).

### PROOF GATE 3:
```
Network Pulse renders: Brand header → its locations → next brand header → its locations
Brand headers are clickable (expand/collapse or filter)
Brand headers labeled with "Brand" indicator
Amber threshold logic verified (either locations appear amber or threshold confirmed correct)
```

---

## PHASE 4: Observatory Fleet Fix (F-1)

### 4A: Identify Fleet filter

```bash
grep -rn "Tenant Fleet\|tenant.*fleet\|fleet" web/src/ --include="*.ts" --include="*.tsx" | head -20
grep -rn "TenantFleet\|FleetCard" web/src/ --include="*.ts" --include="*.tsx" | head -20
```

### 4B: Fix the filter

Optica Luminar has seeded data with completed calculations. It should appear in the Fleet. The filter is likely:
- Checking for `committed_data` rows (Optica may store in a different structure)
- Checking for recent activity (Optica's seed timestamp may be too old)
- Checking for a specific flag that Optica doesn't have

Fix: Fleet should show any tenant that has either committed_data rows OR completed calculation_batches. Both Optica and Sabor qualify.

### PROOF GATE 4:
```
Observatory Command Center shows Tenant Fleet with at least Optica Luminar and Sabor Grupo
Both cards show correct entity counts, period, and last calc date
```

---

## PHASE 5: Build + Verify + Completion

```bash
kill dev server
rm -rf .next
npm run build  # must exit 0
npm run dev

# Full verification:
# 1. Observatory: Fleet shows Optica + Sabor
# 2. Sabor /operate: lands on Financial, not empty ICM
# 3. Sabor /perform: lands on Financial, not empty ICM
# 4. Sabor /financial: Network Pulse with brand headers above locations
# 5. Brand cards clickable
# 6. All pages: < 50 requests per navigation
# 7. Page-to-page navigation: no redundant re-fetch

gh pr create --base main --head dev --title "OB-100: Platform N+1 elimination + Financial tenant navigation" --body "CLT-99 resolution: systemic N+1 fixed (500-860 requests → <50), Financial-only tenants get Financial-first navigation, brand card UX improvements, Observatory Fleet filter fixed. 12 findings, all addressed."
```

---

## SCOPE BOUNDARIES

**IN SCOPE:**
- Platform-wide N+1 elimination (F-8) — the main event
- Financial tenant Operate/Perform/Teams navigation (F-2, F-6, F-7)
- Brand card positioning, clickability, labeling (F-9, F-10, F-11)
- Amber threshold verification (F-12)
- Observatory Fleet filter (F-1)

**OUT OF SCOPE:**
- Financial data service changes (handled in OB-99)
- Persona filtering (handled in HF-060)
- Location Detail queries (handled in HF-060)
- New Financial pages or calculation engine changes
- Mobile layouts
- Seed data changes

---

## ANTI-PATTERNS TO AVOID

- **AP-1:** Multiple components independently fetching the same data → Single source of truth per data type
- **AP-2:** useEffect without proper dependency arrays → Always specify dependencies, use refs to prevent re-fetch
- **AP-3:** Fetching on every re-render → Cache results, check before fetching
- **AP-4:** Hiding routes by deleting them → Conditional rendering based on module flags
- **AP-5:** Hardcoding tenant module detection → Read from tenant metadata/flags
- **AP-6:** Making navigation changes that break ICM tenants → All changes must be conditional on module type
