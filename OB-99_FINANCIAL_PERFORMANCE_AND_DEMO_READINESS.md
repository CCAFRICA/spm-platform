# OB-99: FINANCIAL MODULE PERFORMANCE & DEMO READINESS

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query

**If you have not read both files, STOP and read them now.**

---

## OB-97/98 CONTEXT

OB-97 restructured navigation to 4 workspaces: Perform / Operate / Configure / Financial.
OB-98 added agentic intelligence (InsightPanel, RepTrajectory, NextAction) on Perform dashboards.
HF-059 fixed the login redirect loop.

Key files to read before starting:
- `web/src/lib/navigation/workspace-config.ts` — 4-workspace navigation config
- `web/src/lib/financial/financial-data-service.ts` — current Financial data layer (THE PRIMARY TARGET)
- `web/src/app/financial/` — all Financial page files

---

## WHY THIS OB EXISTS

CLT-98 browser testing of the Financial module (Sabor Grupo Gastronomico) revealed 10 findings, including two P0 performance blockers that make the Financial demo unusable:

| # | Finding | Priority | Evidence |
|---|---------|----------|----------|
| F-1 | Network Pulse: 431 requests, 3.9 min load | **P0** | N+1 on committed_data — fetches 46K rows client-side |
| F-10 | Product Mix: 1,409 requests, 19 min, 202 MB | **P0** | Same root cause, worse page |
| F-2 | Brand cards disconnected from location grid | P1 | No visual grouping between brands and their locations |
| F-3 | Cents on million-peso amounts | P1 | MX$1,035,810.90 clutters cards |
| F-4 | Blue border rendered, legend says amber | P1 | Color mismatch — legend and UI disagree |
| F-5 | Legend text too small | P2 | Easy to miss at bottom of grid |
| F-6 | Location/brand tiles not clickable | P1 | Dead-end cards — violates Thermostat principle |
| F-7 | Operate workspace ICM-flavored for Financial tenant | P1 | POS import flow not aligned |
| F-8 | Persona Switcher doesn't filter Financial pages | P1 | Rep sees full admin view |
| F-9 | Rep persona not applicable to Financial context | P1 | Server needs their own view, not Product Mix |

**Root cause of F-1 and F-10:** `financial-data-service.ts` fetches ALL ~46,700 cheque rows from Supabase via paginated client-side queries, then aggregates in JavaScript. OB-96 designed RPC functions to fix this but the pages are still using the old data path.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Fix logic, not data.**
7. **Domain-agnostic always.** Korean Test on all code.
8. **Supabase .in() ≤ 200 items.**
9. **Zero component-level Supabase calls (Standing Rule 26).**

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "OB-99 PHASE 0: FINANCIAL MODULE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: FINANCIAL DATA SERVICE — THE ROOT CAUSE ==="
cat web/src/lib/financial/financial-data-service.ts 2>/dev/null || cat web/src/lib/services/financial-data-service.ts 2>/dev/null || echo "No financial data service found"
echo ""
echo "Line count:"
wc -l web/src/lib/financial/financial-data-service.ts 2>/dev/null || wc -l web/src/lib/services/financial-data-service.ts 2>/dev/null

echo ""
echo "=== 0B: HOW MANY .from('committed_data') CALLS IN FINANCIAL SERVICE ==="
grep -cn "\.from\|\.select\|committed_data\|supabase" web/src/lib/financial/financial-data-service.ts 2>/dev/null
grep -n "\.from.*committed_data\|\.rpc(" web/src/lib/financial/financial-data-service.ts 2>/dev/null | head -30

echo ""
echo "=== 0C: EXISTING RPC FUNCTIONS IN SUPABASE ==="
cat << 'SQL'
-- Run in Supabase SQL Editor:
SELECT routine_name, routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE 'financial%'
ORDER BY routine_name;
SQL

echo ""
echo "=== 0D: FINANCIAL PAGE FILES ==="
find web/src/app/financial -name "page.tsx" | sort
find web/src/app/financial -name "*.tsx" | sort

echo ""
echo "=== 0E: NETWORK PULSE PAGE — WHAT IT FETCHES ==="
cat web/src/app/financial/page.tsx 2>/dev/null | head -80
echo "---"
# Also check the network-specific page
find web/src/app/financial -path "*network*" -name "page.tsx" | xargs cat 2>/dev/null | head -80

echo ""
echo "=== 0F: PRODUCT MIX PAGE ==="
find web/src/app/financial -path "*product*" -name "page.tsx" | xargs cat 2>/dev/null | head -80

echo ""
echo "=== 0G: LOCATION CARD COMPONENT — COLOR LOGIC ==="
grep -rn "green\|amber\|blue\|red\|border.*color\|bg-\|border-" web/src/app/financial/ --include="*.tsx" | grep -i "location\|card\|tile\|network" | head -20

echo ""
echo "=== 0H: CURRENCY FORMATTING ==="
grep -rn "toLocaleString\|toFixed\|formatCurrency\|Intl.NumberFormat" web/src/app/financial/ --include="*.tsx" | head -15

echo ""
echo "=== 0I: PERSONA CONTEXT ON FINANCIAL PAGES ==="
grep -rn "persona\|usePersona\|PersonaContext\|role" web/src/app/financial/ --include="*.tsx" | head -15

echo ""
echo "=== 0J: CLICK HANDLERS ON LOCATION/BRAND CARDS ==="
grep -rn "onClick\|href\|Link\|router.*push" web/src/app/financial/ --include="*.tsx" | grep -i "location\|brand\|card\|tile" | head -15

echo ""
echo "=== 0K: COMMITTED DATA VOLUME ==="
cat << 'SQL'
-- Run in Supabase SQL Editor:
SELECT 
  data_type,
  COUNT(*) as row_count
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo')
GROUP BY data_type;
SQL

echo ""
echo "=== 0L: OPERATE WORKSPACE LANDING FOR SABOR ==="
cat web/src/app/operate/page.tsx 2>/dev/null | head -40
grep -n "financial\|module\|pos\|cheque\|restaurant" web/src/app/operate/page.tsx 2>/dev/null | head -10
```

**PASTE ALL OUTPUT.** Execute SQL queries in Supabase SQL Editor and paste results.

**Critical Phase 0 deliverable:** Determine whether RPC functions from OB-96 exist in Supabase or need to be created. This determines Phase 1 scope.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-99 Phase 0: Financial module performance diagnostic" && git push origin dev`

---

## PHASE 1: RPC FUNCTIONS — KILL THE N+1

This is the P0 fix. Replace client-side aggregation with server-side SQL.

### 1A: Check if OB-96 RPC functions exist

From Phase 0C output, determine if these functions already exist in Supabase:
- `financial_network_summary`
- `financial_location_metrics`
- `financial_staff_metrics`
- `financial_hourly_patterns`
- `financial_time_series`

**If they exist:** Skip to Phase 1C (rewire the service).
**If they don't exist:** Create them now.

### 1B: Create RPC Functions (if needed)

Execute in Supabase SQL Editor:

```sql
-- 1. Network summary metrics
CREATE OR REPLACE FUNCTION financial_network_summary(p_tenant_id uuid, p_period_id uuid)
RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'total_revenue', COALESCE(SUM((row_data->>'total')::numeric), 0),
    'total_cheques', COUNT(*),
    'avg_check', COALESCE(AVG((row_data->>'total')::numeric), 0),
    'total_tips', COALESCE(SUM((row_data->>'propina')::numeric), 0),
    'total_food', COALESCE(SUM((row_data->>'total_alimentos')::numeric), 0),
    'total_beverage', COALESCE(SUM((row_data->>'total_bebidas')::numeric), 0),
    'total_discounts', COALESCE(SUM((row_data->>'total_descuentos')::numeric), 0),
    'total_comps', COALESCE(SUM((row_data->>'total_cortesias')::numeric), 0),
    'total_cancelled', SUM(CASE WHEN (row_data->>'cancelado')::int = 1 THEN 1 ELSE 0 END),
    'total_cash', COALESCE(SUM((row_data->>'efectivo')::numeric), 0),
    'total_card', COALESCE(SUM((row_data->>'tarjeta')::numeric), 0),
    'total_guests', COALESCE(SUM((row_data->>'numero_de_personas')::numeric), 0)
  )
  FROM committed_data
  WHERE tenant_id = p_tenant_id
    AND period_id = p_period_id
    AND data_type = 'pos_cheque'
    AND (row_data->>'cancelado')::int = 0;
$$ LANGUAGE sql STABLE;

-- 2. Per-location metrics
CREATE OR REPLACE FUNCTION financial_location_metrics(p_tenant_id uuid, p_period_id uuid)
RETURNS TABLE(
  location_id text,
  revenue numeric,
  cheques bigint,
  avg_check numeric,
  tips numeric,
  tip_rate numeric,
  food_total numeric,
  bev_total numeric,
  food_pct numeric,
  discount_total numeric,
  comp_total numeric,
  cancel_count bigint,
  guests numeric,
  leakage_rate numeric
) AS $$
  SELECT
    cd.row_data->>'numero_franquicia',
    SUM((cd.row_data->>'total')::numeric),
    COUNT(*),
    AVG((cd.row_data->>'total')::numeric),
    SUM((cd.row_data->>'propina')::numeric),
    CASE WHEN SUM((cd.row_data->>'total')::numeric) > 0
      THEN ROUND(SUM((cd.row_data->>'propina')::numeric) / SUM((cd.row_data->>'total')::numeric) * 100, 1)
      ELSE 0 END,
    SUM((cd.row_data->>'total_alimentos')::numeric),
    SUM((cd.row_data->>'total_bebidas')::numeric),
    CASE WHEN SUM((cd.row_data->>'total')::numeric) > 0
      THEN ROUND(SUM((cd.row_data->>'total_alimentos')::numeric) / SUM((cd.row_data->>'total')::numeric) * 100, 1)
      ELSE 0 END,
    SUM((cd.row_data->>'total_descuentos')::numeric),
    SUM((cd.row_data->>'total_cortesias')::numeric),
    SUM(CASE WHEN (cd.row_data->>'cancelado')::int = 1 THEN 1 ELSE 0 END),
    SUM((cd.row_data->>'numero_de_personas')::numeric),
    CASE WHEN SUM((cd.row_data->>'total')::numeric) > 0
      THEN ROUND(
        (SUM((cd.row_data->>'total_descuentos')::numeric) + SUM((cd.row_data->>'total_cortesias')::numeric))
        / SUM((cd.row_data->>'total')::numeric) * 100, 1)
      ELSE 0 END
  FROM committed_data cd
  WHERE cd.tenant_id = p_tenant_id
    AND cd.period_id = p_period_id
    AND cd.data_type = 'pos_cheque'
  GROUP BY cd.row_data->>'numero_franquicia';
$$ LANGUAGE sql STABLE;

-- 3. Per-staff metrics
CREATE OR REPLACE FUNCTION financial_staff_metrics(p_tenant_id uuid, p_period_id uuid)
RETURNS TABLE(
  mesero_id text,
  location_id text,
  revenue numeric,
  cheques bigint,
  avg_check numeric,
  tips numeric,
  tip_rate numeric,
  guests numeric
) AS $$
  SELECT
    cd.row_data->>'mesero_id',
    cd.row_data->>'numero_franquicia',
    SUM((cd.row_data->>'total')::numeric),
    COUNT(*),
    AVG((cd.row_data->>'total')::numeric),
    SUM((cd.row_data->>'propina')::numeric),
    CASE WHEN SUM((cd.row_data->>'total')::numeric) > 0
      THEN ROUND(SUM((cd.row_data->>'propina')::numeric) / SUM((cd.row_data->>'total')::numeric) * 100, 1)
      ELSE 0 END,
    SUM((cd.row_data->>'numero_de_personas')::numeric)
  FROM committed_data cd
  WHERE cd.tenant_id = p_tenant_id
    AND cd.period_id = p_period_id
    AND cd.data_type = 'pos_cheque'
    AND (cd.row_data->>'cancelado')::int = 0
  GROUP BY cd.row_data->>'mesero_id', cd.row_data->>'numero_franquicia';
$$ LANGUAGE sql STABLE;

-- 4. Product mix (food vs beverage by location)
CREATE OR REPLACE FUNCTION financial_product_mix(p_tenant_id uuid, p_period_id uuid)
RETURNS TABLE(
  location_id text,
  food_total numeric,
  bev_total numeric,
  total numeric,
  food_pct numeric,
  bev_pct numeric
) AS $$
  SELECT
    cd.row_data->>'numero_franquicia',
    SUM((cd.row_data->>'total_alimentos')::numeric),
    SUM((cd.row_data->>'total_bebidas')::numeric),
    SUM((cd.row_data->>'total')::numeric),
    CASE WHEN SUM((cd.row_data->>'total')::numeric) > 0
      THEN ROUND(SUM((cd.row_data->>'total_alimentos')::numeric) / SUM((cd.row_data->>'total')::numeric) * 100, 1)
      ELSE 0 END,
    CASE WHEN SUM((cd.row_data->>'total')::numeric) > 0
      THEN ROUND(SUM((cd.row_data->>'total_bebidas')::numeric) / SUM((cd.row_data->>'total')::numeric) * 100, 1)
      ELSE 0 END
  FROM committed_data cd
  WHERE cd.tenant_id = p_tenant_id
    AND cd.period_id = p_period_id
    AND cd.data_type = 'pos_cheque'
    AND (cd.row_data->>'cancelado')::int = 0
  GROUP BY cd.row_data->>'numero_franquicia';
$$ LANGUAGE sql STABLE;
```

**Execute ALL functions in Supabase SQL Editor. Verify each:**
```sql
SELECT financial_network_summary(
  (SELECT id FROM tenants WHERE slug = 'sabor-grupo'),
  (SELECT id FROM periods WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo') LIMIT 1)
);
```

### 1C: Rewire financial-data-service.ts

Replace every `.from('committed_data').select()...` pattern with `.rpc('financial_...')` calls. The service should make **1 RPC call per data need**, not hundreds of row fetches.

**Before:** Page load → service fetches 46K rows → client aggregates → renders
**After:** Page load → service calls RPC → Postgres aggregates → returns 20 rows → renders

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | RPC functions exist in Supabase | All 4 verified with test calls |
| PG-2 | financial-data-service uses .rpc() | Zero .from('committed_data') for aggregated data |
| PG-3 | Network Pulse loads < 50 requests | Network tab verified |
| PG-4 | Product Mix loads < 50 requests | Network tab verified |
| PG-5 | Page load time < 5 seconds | Measured from navigation click to render |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-99 Phase 1: RPC functions — kill the N+1" && git push origin dev`

---

## PHASE 2: LOCATION CARD VISUAL FIXES

### 2A: Fix Color Mismatch (F-4)

The legend says "Green = above avg, Amber = within 10%, Red = below avg" but the code renders blue instead of amber.

**Diagnostic:** From Phase 0G output, find the color logic. Fix to match the legend:
- Green (`emerald-500` or `#10B981`): revenue > network average
- Amber (`amber-500` or `#F59E0B`): revenue within 10% of network average
- Red (`red-500` or `#EF4444`): revenue < 90% of network average

If the blue is intentional (e.g., brand color), then update the legend to match. **Legend and visual MUST agree.**

### 2B: Remove Cents (F-3)

For amounts > MX$10,000, format as whole numbers. Change the currency formatter:

```typescript
// Current: MX$1,035,810.90
// Target: MX$1,035,811
const formatCurrency = (amount: number, locale: string, currency: string) => {
  const opts: Intl.NumberFormatOptions = { style: 'currency', currency };
  if (Math.abs(amount) >= 10000) opts.maximumFractionDigits = 0;
  return new Intl.NumberFormat(locale, opts).format(amount);
};
```

Apply this to all Financial page location cards and hero metrics. Keep cents for per-check averages and tip amounts (MX$361.82 is meaningful).

### 2C: Brand Grouping (F-2)

Move brand summary cards ABOVE their respective location clusters. Group locations by brand:

```
[Fuego Dorado brand card — 8 locations, MX$8.2M revenue]
  [FD Location 1] [FD Location 2] [FD Location 3] [FD Location 4]
  [FD Location 5] [FD Location 6] [FD Location 7] [FD Location 8]

[Rapido Verde brand card — 7 locations, MX$4.1M revenue]
  [RV Location 1] [RV Location 2] [RV Location 3] [RV Location 4]
  ...

[Costa Azul brand card — 5 locations, MX$4.7M revenue]
  ...
```

The brand card acts as the section header. Locations within each brand are sorted by revenue (highest first).

### 2D: Improve Legend (F-5)

Move the color legend from tiny text at the bottom to a compact inline legend at the top of the location grid, near the "Location Performance" heading:

```
Location Performance   ● Above avg  ● Within 10%  ● Below avg
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-6 | Colors match legend — green/amber/red, no blue | Visual check |
| PG-7 | Amounts ≥ MX$10K show no cents | MX$1,035,811 not MX$1,035,810.90 |
| PG-8 | Locations grouped under brand headers | Brand card → location cards for that brand |
| PG-9 | Legend visible near heading, not buried at bottom | Inline color key |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-99 Phase 2: Location card visual fixes" && git push origin dev`

---

## PHASE 3: CLICKABLE TILES + DRILL-DOWN (F-6)

### 3A: Location Cards → Location Detail

Each location card becomes clickable. On click, navigate to a location detail view.

**Option A (preferred):** Slide-out panel or modal showing that location's metrics:
- Revenue, checks, avg check, tip rate, food:bev ratio
- Staff performance for that location
- Time trend for that location

**Option B:** Navigate to `/financial/locations/[locationId]` detail page.

Choose based on what already exists from OB-95/96. If a Location Detail page exists, use it. If not, a slide-out panel is lighter to build.

Add hover state (slight scale or border brightness) and cursor pointer to indicate clickability.

### 3B: Brand Cards → Filter

Clicking a brand card scrolls to that brand's location section (since Phase 2C groups them by brand). Or, if the page has a brand filter, clicking the brand card activates that filter.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-10 | Location cards have hover state | cursor-pointer + visual feedback |
| PG-11 | Clicking location card shows detail | Panel or page with location-specific data |
| PG-12 | Brand cards scroll or filter | Click navigates to brand section |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-99 Phase 3: Clickable tiles with drill-down" && git push origin dev`

---

## PHASE 4: PERSONA FILTERING ON FINANCIAL PAGES (F-8, F-9)

### 4A: Diagnose Current Persona Behavior

From Phase 0I: determine if Financial pages read PersonaContext at all. If they ignore it, every persona sees the full admin view.

### 4B: Implement Persona Filtering

**Admin persona:** Sees everything — all locations, all brands, all servers. Current behavior (keep as-is).

**Manager persona:** Sees their region's locations only. Filter location metrics by the manager's entity scope (the entities they manage). If scope data isn't available, show all locations but with a banner: "Viewing all locations — scope filtering requires entity assignment."

**Rep/Server persona:** Does NOT see Network Pulse or Product Mix. Instead, redirect to a Server Detail view showing:
- My checks served this period
- My revenue, avg check, tips
- My Performance Index score and tier
- My ranking vs other servers (without revealing their individual data)

This uses the existing RepTrajectory pattern from OB-98 — same concept, Financial context.

### 4C: Persona Switcher Awareness

When switching to Rep persona on a Financial page, navigate to the server detail view — don't show the admin page with a blank filter.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-13 | Admin sees all locations | Full Network Pulse |
| PG-14 | Manager sees scoped or all-with-banner | Filtered or flagged view |
| PG-15 | Rep sees server detail, not admin view | Redirect to appropriate view |
| PG-16 | Persona switch navigates correctly | No blank pages |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-99 Phase 4: Persona filtering on Financial pages" && git push origin dev`

---

## PHASE 5: OPERATE ALIGNMENT (F-7)

### 5A: Diagnose Operate Landing

From Phase 0L: the Operate workspace shows ICM-style Operations Center for Sabor Grupo. The active plan shows "Comision por Ventas - Meseros" which is correct (it's one of two rule sets), but the import flow and lifecycle labels are ICM-flavored.

### 5B: Module-Aware Operate Card

On the Operate landing, when a tenant has the Financial module enabled, show a prominent card:

```
┌─────────────────────────────────────────────────────────┐
│ 📊 Financial Module Active                               │
│ Import POS data, view network pulse, and benchmarks.     │
│                                          [Open Financial →] │
└─────────────────────────────────────────────────────────┘
```

This already partially exists (the first Sabor screenshot showed a "Financial Module Active" card). Verify it links correctly to `/financial`.

### 5C: Plan Selector Shows Both Rule Sets

Verify the OperateSelector plan dropdown shows both:
1. "Índice de Desempeño — Sabor Grupo Gastronomico" (Performance Index)
2. "Comisión por Ventas — Meseros" (Server Commission)

If only one shows, the RLS or query filter may exclude the other.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-17 | Financial Module card links to /financial | Click navigates correctly |
| PG-18 | Both rule sets visible in plan selector | Dropdown shows 2 plans |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-99 Phase 5: Operate alignment for Financial module" && git push origin dev`

---

## PHASE 6: BUILD + VERIFICATION + COMPLETION

### 6A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 6B: Verification

```bash
echo "=== FINANCIAL DATA SERVICE ==="
grep -c "\.rpc(" web/src/lib/financial/financial-data-service.ts 2>/dev/null
grep -c "\.from.*committed_data" web/src/lib/financial/financial-data-service.ts 2>/dev/null
# Target: rpc count > 0, from('committed_data') count = 0 for aggregated queries

echo ""
echo "=== COLOR LOGIC ==="
grep -n "amber\|#F59E0B\|amber-500" web/src/app/financial/ -r --include="*.tsx" | head -5

echo ""
echo "=== CLICK HANDLERS ==="
grep -n "onClick\|href.*location" web/src/app/financial/ -r --include="*.tsx" | head -10

echo ""
echo "=== PERSONA FILTERING ==="
grep -n "persona\|usePersona" web/src/app/financial/ -r --include="*.tsx" | head -10
```

### 6C: Completion Report

Create `OB-99_COMPLETION_REPORT.md` at project root with:

1. RPC functions: which exist, which were created, test results
2. Query performance: before (431/1409 requests) → after (target <50)
3. Visual fixes: colors, cents, grouping, legend
4. Clickable tiles: what happens on click
5. Persona filtering: admin/manager/rep behavior
6. Operate alignment: card link, plan selector
7. All proof gates PASS/FAIL

### 6D: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-99: Financial Module Performance & Demo Readiness" \
  --body "## P0: Query Performance
- Replaced client-side aggregation (431-1,409 requests/page) with Supabase RPC functions
- Network Pulse: target <50 requests, <5 seconds
- Product Mix: target <50 requests, <5 seconds
- 4 RPC functions: network_summary, location_metrics, staff_metrics, product_mix

## Visual Fixes
- Color mismatch: amber now renders correctly, legend matches UI
- Currency: whole numbers for amounts ≥ MX\$10K
- Brand grouping: locations clustered under brand headers
- Legend: inline at top, not buried at bottom

## Interactive Tiles
- Location cards clickable → detail view
- Brand cards → filter/scroll to section
- Hover states indicating interactivity

## Persona Filtering
- Admin: full view (unchanged)
- Manager: scoped or flagged view
- Rep/Server: redirects to server detail view

## Operate Alignment
- Financial Module card links correctly
- Both rule sets visible in plan selector

## CLT-98 Findings: 10/10 addressed
## Proof Gates: 18"
```

### Proof Gates (Final)

| # | Gate | Criterion |
|---|------|-----------|
| PG-19 | `npm run build` exits 0 | Clean build |
| PG-20 | localhost:3000 responds | HTTP 200 |
| PG-21 | PR created | URL pasted |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-99 Complete: Financial Module Performance & Demo Readiness" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- RPC functions for server-side aggregation (kill N+1)
- Rewire financial-data-service.ts to use RPC calls
- Location card colors matching legend (green/amber/red)
- Currency formatting (no cents on large amounts)
- Brand grouping of location cards
- Legend placement improvement
- Clickable location and brand tiles
- Persona filtering on Financial pages
- Operate landing Financial module card
- Plan selector showing both rule sets

### OUT OF SCOPE — DO NOT BUILD
- New Financial pages
- Calculation engine changes
- New Supabase tables
- POS import flow redesign (F-7 gets lightweight fix only)
- Mobile layouts
- Budget/target imports
- Full Operate landing redesign
- Seed data changes

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Client-side aggregation of 46K+ rows | Use Supabase RPC functions exclusively |
| AP-2 | Hardcoded brand names or location IDs | Read from entity metadata |
| AP-3 | Color values that don't match legend text | Single source of truth for color mapping |
| AP-4 | Dead-end cards with no click handler | Every data card must be interactive |
| AP-5 | Rep persona seeing admin views | Persona-aware routing on Financial pages |
| AP-6 | Creating new routes that don't exist in workspace-config | Work within existing navigation |
| AP-7 | Cents on million-peso display | Conditional formatting based on magnitude |

---

*ViaLuce.ai — The Way of Light*
*OB-99: A demo that takes 19 minutes to load is not a demo.*
*"Performance is a feature. Speed is trust."*
