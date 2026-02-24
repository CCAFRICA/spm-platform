# OB-93: N+1 QUERY ELIMINATION — PLATFORM-WIDE PERFORMANCE

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Before reading further, open and read the COMPLETE file `CC_STANDING_ARCHITECTURE_RULES.md` at the project root.

**If you have not read that file, STOP and read it now.**

---

## WHY THIS OB EXISTS

CLT-91 browser verification measured catastrophic request counts on every page:

| Page | Requests | Transfer | Finish Time |
|------|----------|----------|-------------|
| Operations Center | 3,748 | 52.6 MB | 8.5 min |
| Results Dashboard | 5,240 | 58.6 MB | — |
| Pipeline Proof Co Results | 5,503 | 83.3 MB | — |
| Governance Center | 3,850 | 52.7 MB | — |

**This is not one bad page. It is every page.** A co-founder waiting 8 minutes for a page to load will not be impressed by 100% calculation accuracy.

### Root Cause

Every component independently creates a Supabase client and fires its own queries on mount. A single page with 20 widgets makes 20+ independent round trips to Supabase, many querying the same tables (`tenants`, `profiles`, `calculation_batches`, `periods`). Each widget's `useEffect` fires independently, creating a cascade of duplicate requests.

```
CURRENT (BROKEN):
Page mounts
  → LifecycleSubway mounts → fetches calculation_batches, periods
  → CalcSummary mounts → fetches calculation_batches, calculation_results
  → EntityList mounts → fetches entities, calculation_results
  → AttainmentChart mounts → fetches calculation_results, entity_period_outcomes
  → TopEntities mounts → fetches calculation_results
  → AIAssessment mounts → fetches calculation_batches, entities, calculation_results
  → PersonaSwitcher mounts → fetches profiles
  → Sidebar mounts → fetches tenants, profiles
  → PeriodRibbon mounts → fetches periods
  = 20+ independent Supabase round trips, many duplicated
```

### Target State

```
TARGET (FIXED):
Page mounts
  → SessionContext provides: tenant, profile, locale (fetched ONCE at auth)
  → OperateContext provides: plan, period, batch, results (fetched ONCE per selection)
  → Page receives pre-loaded data as props from context
  → Components render from props — ZERO independent fetches
  = 3-5 Supabase round trips total, zero duplicates
```

### Performance Target

| Metric | Current | Target |
|--------|---------|--------|
| Requests per page | 3,748–5,503 | **< 50** |
| Transfer size | 52–83 MB | **< 5 MB** |
| Time to interactive | 8+ min | **< 3 sec** |

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Do NOT modify calculation engine, reconciliation logic, or AI pipelines.**
7. **Do NOT change what data is displayed — only change HOW it's fetched.**
8. **Supabase `.in()` calls must batch ≤200 items.**

---

## PHASE 0: DIAGNOSTIC — MAP EVERY QUERY

Before changing any code, produce a complete inventory of every Supabase query in the codebase.

```bash
echo "============================================"
echo "OB-93 PHASE 0: N+1 QUERY DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: TOTAL SUPABASE QUERY SITES ==="
grep -rn "\.from(" web/src/app/ web/src/components/ web/src/contexts/ web/src/lib/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | wc -l

echo ""
echo "=== 0B: QUERIES BY TABLE (most queried = most duplicated) ==="
for table in tenants profiles entities calculation_batches calculation_results rule_sets periods entity_period_outcomes import_batches classification_signals rule_set_assignments assessment_results audit_logs usage_metering; do
  count=$(grep -rn "from('${table}')" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | wc -l)
  if [ "$count" -gt 0 ]; then
    echo "  ${table}: ${count} query sites"
  fi
done

echo ""
echo "=== 0C: COMPONENT-LEVEL SUPABASE CALLS (the problem) ==="
echo "These are components that create their own Supabase client:"
grep -rn "createClient\|createBrowserClient\|createServerClient" web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | wc -l
echo "--- Detail ---"
grep -rln "createClient\|createBrowserClient" web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | sort

echo ""
echo "=== 0D: CONTEXT PROVIDERS THAT FETCH ==="
grep -rln "supabase\|\.from(" web/src/contexts/ --include="*.tsx" --include="*.ts" | sort
for f in $(find web/src/contexts -name "*.tsx"); do
  count=$(grep -c "\.from(" "$f" 2>/dev/null)
  if [ "$count" -gt 0 ]; then
    echo "  $(basename $f): ${count} queries"
  fi
done

echo ""
echo "=== 0E: useEffect CHAINS THAT FIRE QUERIES ==="
grep -rn "useEffect" web/src/components/ --include="*.tsx" -A5 | grep -B1 "supabase\|\.from(" | head -60

echo ""
echo "=== 0F: PAGE-LEVEL DATA LOADING ==="
echo "Pages that load data in the component (should use context instead):"
for f in $(find web/src/app -name "page.tsx"); do
  count=$(grep -c "\.from(\|createClient\|supabase\." "$f" 2>/dev/null)
  if [ "$count" -gt 0 ]; then
    route=$(echo "$f" | sed 's|web/src/app||;s|/page.tsx||')
    echo "  ${route}: ${count} direct queries"
  fi
done

echo ""
echo "=== 0G: EXISTING CONTEXTS (what OB-92 may have added) ==="
ls -la web/src/contexts/
cat web/src/contexts/operate-context.tsx 2>/dev/null | head -30 || echo "No operate-context yet"

echo ""
echo "=== 0H: SERVICE FILES (shared query functions) ==="
find web/src/lib -name "*service*" -o -name "*loader*" -o -name "*query*" | grep -E "\.ts$" | sort
```

**PASTE ALL OUTPUT.** This diagnostic determines the exact fix plan.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-93 Phase 0: N+1 query diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Every component independently queries Supabase, causing
3,748–5,503 requests per page load. Must reduce to <50.

Option A: SessionContext (global) + PageLoaders (per-route)
  - SessionContext fetches: tenant, profile, locale ONCE at auth
  - Each route has a loader function that batches all page-specific queries via Promise.all()
  - Components receive data as props from page — zero independent fetches
  - Scale test: YES — adding a component doesn't add a query
  - AI-first: YES — no hardcoding
  - Atomicity: YES — loader either succeeds with all data or shows error

Option B: React Query / SWR with deduplication
  - Add a query library that auto-deduplicates identical requests
  - Components still fetch independently but the library merges identical calls
  - Scale test: PARTIAL — reduces duplicates but doesn't prevent proliferation
  - AI-first: YES
  - Atomicity: PARTIAL — each query resolves independently

Option C: Server Components (Next.js RSC)
  - Move data fetching to server components
  - Scale test: YES
  - Risk: Requires significant component refactoring, may conflict with client-side contexts

CHOSEN: Option A — SessionContext + PageLoaders
REASON: Simplest conceptual model. OB-92 already created OperateContext as proof.
Extends the same pattern platform-wide. No new dependencies. Each page has
exactly ONE data loading function. Components become pure renders.

REJECTED: Option B — deduplication hides the problem rather than solving it.
REJECTED: Option C — too much refactoring risk for a performance OB.
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-93 Phase 1: Architecture decision — SessionContext + PageLoaders" && git push origin dev`

---

## PHASE 2: SESSION CONTEXT — GLOBAL DATA (Fetch Once at Auth)

### 2A: Create or enhance SessionContext

If OB-92 created an OperateContext, leave it alone. SessionContext is the GLOBAL layer above it.

Create `web/src/contexts/session-context.tsx` (or enhance existing auth-context):

**Data fetched ONCE when user authenticates + selects tenant:**

```typescript
interface SessionData {
  // Auth (from Supabase auth)
  user: User;

  // Profile (one query)
  profile: Profile;

  // Tenant (one query)
  tenant: Tenant;

  // Counts for sidebar badges and overview metrics (one batched query)
  entityCount: number;
  periodCount: number;
  batchCount: number;
  ruleSetCount: number;

  // Loading state
  isLoading: boolean;

  // Refresh
  refreshSession: () => Promise<void>;
}
```

**Fetch pattern:**

```typescript
async function loadSessionData(userId: string, tenantId: string): Promise<SessionData> {
  const supabase = createClient();

  const [profileResult, tenantResult, countsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('auth_user_id', userId).eq('tenant_id', tenantId).single(),
    supabase.from('tenants').select('*').eq('id', tenantId).single(),
    // Batch all counts into one query using Supabase's count feature
    Promise.all([
      supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('periods').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('calculation_batches').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('rule_sets').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    ]),
  ]);

  return {
    profile: profileResult.data,
    tenant: tenantResult.data,
    entityCount: countsResult[0].count ?? 0,
    periodCount: countsResult[1].count ?? 0,
    batchCount: countsResult[2].count ?? 0,
    ruleSetCount: countsResult[3].count ?? 0,
    isLoading: false,
  };
}
```

**This replaces:** Every component that independently queries `tenants`, `profiles`, or counts.

### 2B: Wire SessionContext into app layout

```tsx
// web/src/app/layout.tsx or auth-shell
<SessionProvider>
  <OperateProvider>  {/* from OB-92 — only wraps Operate pages */}
    {children}
  </OperateProvider>
</SessionProvider>
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | SessionContext loads profile in 1 query | Network tab: single `profiles?select=*` |
| PG-2 | SessionContext loads tenant in 1 query | Network tab: single `tenants?select=*` |
| PG-3 | SessionContext loads counts in batch | 4 head queries, not 4 full table scans |
| PG-4 | SessionContext provides data to children | `useSession()` returns profile, tenant, counts |
| PG-5 | No component queries `tenants` or `profiles` independently | `grep -rn "from('tenants')\|from('profiles')" web/src/components/` returns 0 hits (outside contexts) |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-93 Phase 2: SessionContext — global data fetched once" && git push origin dev`

---

## PHASE 3: PAGE LOADERS — BATCHED DATA PER ROUTE

### 3A: Create page loader functions

Create `web/src/lib/data/page-loaders.ts`:

Each page that needs data beyond SessionContext gets ONE loader function that batches all queries via `Promise.all()`.

```typescript
// Pattern: one function per page, all queries batched

export async function loadOperateDashboard(tenantId: string, batchId?: string) {
  const supabase = createClient();
  const [batch, results, periods] = await Promise.all([
    batchId
      ? supabase.from('calculation_batches').select('*').eq('id', batchId).single()
      : supabase.from('calculation_batches').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1).single(),
    batchId
      ? supabase.from('calculation_results').select('entity_id, total_payout, components').eq('calculation_batch_id', batchId)
      : supabase.from('calculation_results').select('entity_id, total_payout, components').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100),
    supabase.from('periods').select('*').eq('tenant_id', tenantId).order('start_date', { ascending: false }),
  ]);
  return { batch: batch.data, results: results.data, periods: periods.data };
}

export async function loadInvestigateDashboard(tenantId: string) {
  const supabase = createClient();
  const [batches, signals, anomalies] = await Promise.all([
    supabase.from('calculation_batches').select('id, status, total_payout, entity_count, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
    supabase.from('classification_signals').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('assessment_results').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(20),
  ]);
  return { batches: batches.data, signalCount: signals.count, anomalies: anomalies.data };
}

export async function loadGovernDashboard(tenantId: string) {
  const supabase = createClient();
  const [batches, signals] = await Promise.all([
    supabase.from('calculation_batches').select('id, status, lifecycle_state, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
    supabase.from('classification_signals').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  ]);
  return { batches: batches.data, signalCount: signals.count };
}

export async function loadConfigureDashboard(tenantId: string) {
  const supabase = createClient();
  const [ruleSets, entities, periods] = await Promise.all([
    supabase.from('rule_sets').select('*').eq('tenant_id', tenantId),
    supabase.from('entities').select('id, display_name, entity_type, external_id').eq('tenant_id', tenantId),
    supabase.from('periods').select('*').eq('tenant_id', tenantId).order('start_date', { ascending: false }),
  ]);
  return { ruleSets: ruleSets.data, entities: entities.data, periods: periods.data };
}

// Add loaders for every workspace landing page
// Each loader uses Promise.all() — ONE round trip with parallel queries
```

### 3B: Wire page loaders into pages

Each page.tsx calls its loader in a useEffect (or via OperateContext for Operate pages), then passes data to child components as props.

```typescript
// Pattern for each page
export default function InvestigatePage() {
  const { tenant } = useSession();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (tenant?.id) {
      loadInvestigateDashboard(tenant.id).then(setData);
    }
  }, [tenant?.id]);

  if (!data) return <LoadingSkeleton />;

  return (
    <>
      <BatchList batches={data.batches} />
      <SignalCount count={data.signalCount} />
      <AnomalyList anomalies={data.anomalies} />
    </>
  );
}
```

### 3C: Components become pure renders

After wiring page loaders, each child component receives data as props. Remove ALL independent Supabase calls from components.

**The rule:** If a component file contains `createClient()` or `.from(`, it is wrong. Components render props. Pages load data.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-6 | page-loaders.ts exists | File contains loader functions using Promise.all() |
| PG-7 | Operate page uses loader or OperateContext | Zero direct Supabase calls in page component |
| PG-8 | Investigate page uses loader | Zero direct Supabase calls |
| PG-9 | Govern page uses loader | Zero direct Supabase calls |
| PG-10 | Configure page uses loader | Zero direct Supabase calls |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-93 Phase 3: Page loaders — batched data per route" && git push origin dev`

---

## PHASE 4: ELIMINATE COMPONENT-LEVEL QUERIES

This is the surgery. For every component that contains a direct Supabase call:

### 4A: Inventory from Phase 0

Phase 0 diagnostic (0C) listed every component with `createClient()`. For each one:

1. Identify what data it fetches
2. Determine which page(s) render this component
3. Move the data fetch into the page's loader (or SessionContext if it's global data)
4. Change the component to accept data as props
5. Remove the `createClient()` import and all Supabase calls

### 4B: Common offenders to fix

Based on prior diagnostics, these are the most duplicated:

| Component Pattern | What It Fetches | Move To |
|---|---|---|
| Sidebar / navigation | tenant name, profile, role | SessionContext |
| PeriodRibbon | periods list | SessionContext or OperateContext |
| PersonaSwitcher | profiles | SessionContext |
| Any dashboard widget | calculation_batches, results | Page loader |
| Entity list | entities | Page loader |
| AI Assessment panel | batches, entities, results | Page loader |
| Language switcher | tenant locale | SessionContext |

### 4C: Verification after each component fix

After fixing each component:
```bash
# Verify component no longer imports supabase
grep "createClient\|\.from(" web/src/components/[COMPONENT_PATH] 
# Expected: 0 results

# Verify build still passes
npm run build 2>&1 | tail -5
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-11 | Zero components create their own Supabase client | `grep -rn "createClient" web/src/components/ --include="*.tsx"` returns 0 (excluding test files) |
| PG-12 | Sidebar reads from SessionContext | No direct tenant/profile queries |
| PG-13 | PeriodRibbon reads from context | No direct periods query |
| PG-14 | PersonaSwitcher reads from context | No direct profiles query |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-93 Phase 4: Component queries eliminated — all data from context/props" && git push origin dev`

---

## PHASE 5: PERFORMANCE MEASUREMENT

### 5A: Before/after comparison

Create a simple measurement script or document the Network tab results:

```bash
echo "=== PERFORMANCE MEASUREMENT ==="
echo "Open each page in Chrome DevTools Network tab (Disable cache checked)"
echo "Record: request count, transfer size, finish time"
echo ""
echo "Pages to measure:"
echo "  1. /operate (Operations Center)"
echo "  2. /operate/results (Results Dashboard)"
echo "  3. /investigate"
echo "  4. /govern"
echo "  5. /configure"
echo "  6. / (Dashboard)"
```

### 5B: Request count verification

For each measured page:

| Page | Before (CLT-91) | After | Target |
|------|-----------------|-------|--------|
| /operate | 3,748 | ? | < 50 |
| /operate/results | 5,240 | ? | < 50 |
| /govern | 3,850 | ? | < 50 |
| /investigate | ~3,500 (est.) | ? | < 50 |
| /configure | ~3,500 (est.) | ? | < 50 |

### 5C: Remaining query sites audit

```bash
echo "=== REMAINING SUPABASE CALLS IN COMPONENTS ==="
grep -rn "createClient\|\.from(" web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | wc -l
echo "(Target: 0)"

echo ""
echo "=== SUPABASE CALLS BY LOCATION ==="
echo "Contexts (expected — these are the approved fetch points):"
grep -rn "\.from(" web/src/contexts/ --include="*.tsx" | wc -l

echo "Lib/services (expected — shared loaders):"
grep -rn "\.from(" web/src/lib/ --include="*.ts" | wc -l

echo "Components (should be 0):"
grep -rn "\.from(" web/src/components/ --include="*.tsx" | grep -v node_modules | wc -l

echo "Pages (should be 0 — use loaders):"
grep -rn "\.from(" web/src/app/ --include="*.tsx" | grep -v node_modules | wc -l
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-15 | Operations Center < 50 requests | Network tab measurement |
| PG-16 | Results Dashboard < 50 requests | Network tab measurement |
| PG-17 | Govern < 50 requests | Network tab measurement |
| PG-18 | Zero Supabase calls in components | grep returns 0 |
| PG-19 | All Supabase calls in contexts + lib/services only | Verified by location audit |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-93 Phase 5: Performance measurement — before/after" && git push origin dev`

---

## PHASE 6: LOADING STATES

With data now loaded via context/loaders, pages need proper loading states.

### 6A: Loading skeleton component

Create `web/src/components/ui/LoadingSkeleton.tsx` (if not exists):

A simple skeleton that matches the page layout — pulsing placeholder cards where data will appear. NOT a spinner. NOT a blank page.

### 6B: Apply to every page

Every page that uses a loader should show `<LoadingSkeleton />` while data is loading, then render content when data arrives. No flash of empty state.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-20 | Loading skeleton exists | Component file created |
| PG-21 | Pages show skeleton during load | No blank flash on navigation |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-93 Phase 6: Loading skeletons for data-dependent pages" && git push origin dev`

---

## PHASE 7: BUILD + COMPLETION

### 7A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 7B: Completion Report

Create `OB-93_COMPLETION_REPORT.md` at project root:

1. Phase 0 diagnostic: total query sites before, queries by table, component-level clients
2. SessionContext: what it provides, query count
3. Page loaders: functions created, tables batched
4. Component cleanup: files changed, createClient() calls removed
5. Performance measurement: before/after per page (request count, transfer, time)
6. Remaining query locations: contexts (approved), lib (approved), components (must be 0)
7. Loading skeletons: pages covered
8. All proof gates with PASS/FAIL

### 7C: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-93: N+1 Query Elimination — Platform-Wide Performance" \
  --body "## What This OB Delivers

### The Problem
Every component independently queried Supabase, causing:
- Operations Center: 3,748 requests / 52.6 MB / 8.5 min
- Results Dashboard: 5,240 requests / 58.6 MB
- Governance Center: 3,850 requests / 52.7 MB

### The Fix

**SessionContext** — Global data (tenant, profile, counts) fetched ONCE at auth.
No component ever queries tenants or profiles independently.

**Page Loaders** — Each route has ONE loader function that batches all queries
via Promise.all(). Components receive data as props — zero independent fetches.

**Component Cleanup** — Every createClient() call removed from components.
All Supabase queries consolidated into contexts (global) or lib/services (page-specific).

### Results
| Page | Before | After | Reduction |
|------|--------|-------|-----------|
| /operate | 3,748 | [X] | [Y]% |
| /operate/results | 5,240 | [X] | [Y]% |
| /govern | 3,850 | [X] | [Y]% |

### Loading States
Skeleton loading for all data-dependent pages. No blank flash on navigation.

## Proof Gates: 21
## Target: < 50 requests per page, zero component-level Supabase calls"
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-22 | `npm run build` exits 0 | Clean build |
| PG-23 | PR created | URL pasted |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-93 Complete: N+1 query elimination" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- SessionContext for global data (tenant, profile, counts)
- Page loader functions for every workspace landing page
- Eliminate ALL component-level Supabase calls
- Loading skeletons
- Performance measurement before/after

### OUT OF SCOPE — DO NOT BUILD
- OperateContext changes (OB-92 owns this — just use it)
- Calculation engine changes
- Reconciliation logic changes
- AI pipeline changes
- New features or pages
- Server-side rendering / RSC migration
- React Query / SWR / third-party state management

### INTERACTION WITH OB-92

OB-92 created OperateContext for Operate workspace pages. OB-93 does NOT modify OperateContext. Instead:
- SessionContext sits ABOVE OperateContext (global vs workspace-specific)
- Operate pages use BOTH: SessionContext for global data, OperateContext for plan/period/batch
- Non-Operate pages use SessionContext + their page loader
- If OB-92 already eliminated component queries in Operate pages, skip those in Phase 4

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Component creates its own Supabase client | ALL queries in contexts or lib/services. Components render props. |
| AP-2 | Page queries same table twice | Use Promise.all() in loader. Each table queried exactly once. |
| AP-3 | Context re-fetches on every render | Fetch on mount + dependency change only. Use useRef to prevent double-fire. |
| AP-4 | Loading state shows blank page | LoadingSkeleton component renders immediately. |
| AP-5 | Over-fetching (SELECT * on large tables) | Select only needed columns. Use count+head for badge numbers. |
| AP-6 | Supabase `.in()` > 200 | Batch all .in() calls ≤200 items |
| AP-7 | Breaking OB-92 OperateContext | Do NOT modify operate-context.tsx. SessionContext wraps ABOVE it. |

---

## NEW STANDING RULE (add to CC_STANDING_ARCHITECTURE_RULES.md)

```
### Data Loading
26. **Zero component-level Supabase calls.** Components render props. Pages load data through 
    context (SessionContext, OperateContext) or page loader functions (lib/data/page-loaders.ts). 
    No component file should contain createClient() or .from(). Approved fetch locations: 
    contexts/, lib/services/, lib/data/. Target: <50 network requests per page.
```

---

*ViaLuce.ai — The Way of Light*
*OB-93: The platform that loads in seconds, not minutes.*
*"3,748 requests → 50. Same data. Same accuracy. A hundred times faster."*
