# OB-96: FINANCIAL MODULE DEPTH — CLT-95 Remediation + Product Data + Reporting Intelligence

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query

**If you have not read both files, STOP and read them now.**

---

## WHY THIS OB EXISTS

OB-95 proved domain-agnostic architecture: same entity model, same committed_data, same engine — restaurant franchise data alongside ICM compensation. But CLT-95 browser testing exposed 44 findings across 3 severity levels. The Financial module works architecturally but fails as a product:

1. **Critical bugs** block the demo narrative (Staff page empty, Perform renders wrong page, persona switching breaks)
2. **Missing product/item-level data** prevents the most valuable restaurant reports (product mix, menu engineering, server upsell analysis)
3. **No intelligence layer** — every page is a thermometer (displays data) not a thermostat (surfaces insights and drives action)
4. **UX navigation is disorienting** — users can't discover reports, can't drill into locations, can't understand where they are
5. **Query performance** makes pages unusable in demo (250-1,236 requests per page load)

This OB fixes the critical/high bugs, adds the product data dimension, builds the missing persona surfaces, and adds intelligence indicators. It transforms the Financial module from "proof of architecture" to "compelling product demo."

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
10. **One canonical location per surface (Standing Rule 24).**

---

## CLT-95 FINDING REFERENCE

### Critical (blocks demo)

| # | Finding | Page |
|---|---------|------|
| F-02 | Perform home renders "Govern" content instead of Perform dashboard | /perform |
| F-06 | Trends page shows wrong tenant data / placeholder (not Sabor Grupo) | /perform/trends |
| F-18 | Staff Performance page shows "No Staff Data" despite 48 staff entities + 47K cheques with mesero_id | /financial/staff |
| F-25 | Operate landing page is default destination — no insights, no actions, confusing for all personas | Platform-wide |
| F-07/08/13/19/35/44 | N+1 query explosion: 250-1,236 requests per page, 5-17 MB transferred | All financial pages |

### High (significantly degrades demo)

| # | Finding | Page |
|---|---------|------|
| F-12 | "By Brand" filter breaks Revenue Timeline chart (data disappears) | /financial/timeline |
| F-14 | Brand dropdown on Location Benchmarks shows "All Brands" but no brand options populated | /financial/performance |
| F-24 | Persona switcher on Financial pages: Manager/Rep show no page, Admin doesn't return to Financial | All Financial |
| F-33 | Cancelaciones shows MX$0.00 on Leakage Monitor — anomaly data not surfacing | /financial/leakage |
| F-36 | Time period filter ("This Month" etc.) doesn't work — relative dates find no data | /financial/leakage |
| F-39 | Monthly Summary shows "December 2023" subtitle — wrong period | /financial/summary |

### Medium (UX polish)

| # | Finding | Page |
|---|---------|------|
| F-01 | Location tiles on Network Pulse not clickable | /financial |
| F-03 | Dec 2023 stray period pill on Operate | /operate |
| F-09/10/11 | Sidebar collapses losing navigation context + breadcrumb doesn't match hierarchy | All |
| F-15 | WoW column shows -100.0% for all locations (no prior period) | /financial/performance |
| F-16 | Avg Check benchmarking against network avg, not brand benchmark | /financial/performance |
| F-20/23 | Seed data too uniform — heatmap shows identical days, guests always 3.5 | /financial/patterns |
| F-22 | Dual breadcrumbs — chrome header + page-level breadcrumb conflict | All Financial |
| F-31/42 | Tables not sortable (Leakage rankings, Summary location breakdown) | Multiple |
| F-32/43 | No brand grouping/filtering on tables | Multiple |
| F-40 | "Monthly" too rigid — needs Daily/Weekly/Monthly/Custom granularity | /financial/summary |
| F-41 | Zero intelligence indicators on Operating Summary — all rows look the same | /financial/summary |

### Design-Level (new in this OB)

| # | Finding | Page |
|---|---------|------|
| F-37 | No report discovery — need card-based Financial landing with preview thumbnails | /financial |
| F-38 | No Location Detail drill-down page (composite all metrics for one location) | /financial/location/[id] |
| F-25+ | Persona-aware landing — Admin→Network Pulse, Manager→Benchmarks, Rep→My Shift | Platform-wide |

---

## PRODUCT DATA MODEL

### Source Files Analysis

Two real SoftRestaurant exports inform this data model:

**File 1: Product-by-Server Summary (productospormeseroresumen)**
```
Columns: CLAVE, NOMBRE, CLAVEPRODUCTO, DESCRIPCIONPRODUCTO, DESCRIPCIONGRUPO,
         CANTIDAD, PRECIO, VENTATOTAL, PORCENTAJE, CLAVEGRUPO, franquicia
Scale: 1,514 rows, 228 unique products, 24 groups, 19 servers, 1 franchise
Revenue: MX$513,513 total, 11,480 items sold
```

**File 2: Product Catalog (Catalogo_de_Producos)**
```
Columns: clasificacion_1, clasificacion_menu, tipo_producto, Clasificado
Scale: 203 products, 2 top-level categories, 35 sub-categories
Classification status: Only 2 of 203 marked "Y" — 201 need classification
```

### Product Hierarchy (from real catalog)

```
Comidas (Food)
├── Entradas (Starters): Vegetales, Papas, Aros de Cebolla, Dedos de Queso, Bacon Cheese Fries
├── Alitas (Wings): 350g, 500g, 1kg, 1.5kg, 2kg
├── Boneless: 220g, 440g, 660g, Tiras de Pechuga
├── Burgers: General Grill, Tank, Apache, Burger Tender
├── Artillería Ligera (Light): Ensalada Regular, Ensalada Army, Boneless Light
├── Combos: Combo 1kg, 1.5kg, 2.5kg, Ribs Army
├── Kids: Kid Alitas, Kid Boneless, Kid Tenders
├── Extras: Tocino, Extra Carne, Extra Pollo, Extra Queso, Aguacate, +7 more
├── Provisiones: Bowl de Pollo, Bowl de Res
├── Salsas: Xplosion, Mango Habanero, Cajún, Original Hot, +14 more
├── Postre: Postre
├── Promos: Mega Lunes, All You Can Wings, 3x2
└── Samplers: Army Box I, II, III

Bebidas (Beverages)
├── Refrescos (Soft Drinks): Coca Cola, Agua Mineral, Sprite, +7 more
├── Cervezas Nacionales (Domestic Beer): Corona, Victoria, Modelo, +13 more
├── Cervezas Importadas (Import Beer): Erdinger, Stella Artois, +25 more
├── Cerveza de Barril (Draft): Tarro, Bazooka 3L, Tomahawk 5L
├── Preparados (Beer Cocktails): Chelado, Michelado, Clamaveche, Clamato
├── Coctelería (Cocktails): Piña Colada, Margarita, +14 more
├── Tequila: Hornitos, Sauza, Centenario, +9 more
├── Mezcal: 400 Conejos, Amores, Sacro Imperio, Terra Fuego
├── Ron (Rum): Bacardi, Captain Morgan, Appleton, +4 more
├── Vodka: Smirnoff, Absolut, Stolichnaya, Grey Goose
├── Whisky: Johnnie Walker, Jack Daniel's, Buchanan's, Chivas
├── Ginebra (Gin): Larios, Tanqueray, Bombay, Beefeater
├── Bourbon: Jim Beam, Jim Beam Black
├── Brandy: Torres 5, Torres 10
├── Licor: Baileys, Licor 43, Kahlúa, Disaronno, Sambuca
├── Café: Americano, Capuccino, Expresso
├── Carajillo: Carajillo Roca
├── Army Lemonades: Summred, Maracuyá, Cucumber Fresh
├── Margaritas Beer: Calypso, Nautilus, Neptuno, October
├── Megas: Generica, Premium
└── Vino: Riunite Lambrusco
```

### Normalization Challenge (POS Export → Catalog)

| Catalog (clean) | POS Export (messy) | Challenge |
|---|---|---|
| Alitas 350 g | ALITAS 350 GRS | Unit abbreviation (g → GRS) |
| Boneless 220 g | ALITAS SIN HUESO (BONELESS) 220 GRS. | Alternate name + unit |
| Coca Cola | COCA COLA 355 ML. | Size appended |
| Carajillo Roca | CARAJILLO ROCA 5% ALC. 125 ML. | ABV + size appended |
| All You Can Wings | ALL YOU CAN WINGS / REFILL ALL YOU CAN WINGS / REFILL AL LYOU CAN WINGS SIN PAPAS | Variants + typo ("AL LYOU") |
| Aderezo Ranch | ADEREZO RANCH 2 OZ. / ADEREZO RANCH 4 OZ. | Size variants |
| Salsa Xplosion | SALSA XPLOSION 120ML (4 OZ.) / SALSA XPLOSION 60 ML (2 0Z) / SALSA XPLOSION CHICA | Size + zero-vs-O typo ("0Z") |

This is EXACTLY what the AI normalization workflow is designed to solve. The catalog is the "dictionary" — the POS export is the "wild text" that needs classification.

### committed_data Format for Product Line Items

Each product line item is one row in committed_data:

```
data_type: 'pos_line_item'
entity_id: <location entity UUID>
period_id: <period UUID>
row_data: {
  franquicia: 'FD-CDMX-001',
  mesero_id: 1001,
  mesero_nombre: 'ADRIANA',
  clave_producto: 6003,
  descripcion_producto: 'ALITAS 1 KILO',
  descripcion_grupo: 'ALITAS',
  clave_grupo: 6,
  cantidad: 24,
  precio_unitario: 125.25,
  venta_total: 3006.00,
  porcentaje_mesero: 2.68,
  folio_cheque: 10547,
  fecha: '2024-01-15'
}
```

The `folio_cheque` field links line items back to the parent cheque in committed_data (data_type='pos_cheque'). This enables drill-down from cheque → items.

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "OB-96 PHASE 0: FINANCIAL MODULE DEPTH DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: FINANCIAL DATA SERVICE ==="
wc -l web/src/lib/financial/financial-data-service.ts 2>/dev/null
grep -n "getStaffPerformance\|mesero\|staff\|person\|individual" web/src/lib/financial/financial-data-service.ts 2>/dev/null | head -20

echo ""
echo "=== 0B: STAFF ENTITY TYPE CHECK ==="
cat << 'SQL'
SELECT entity_type, COUNT(*) FROM entities
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo')
GROUP BY entity_type ORDER BY entity_type;
SQL

echo ""
echo "=== 0C: STAFF METADATA SAMPLE ==="
cat << 'SQL'
SELECT external_id, display_name, entity_type, metadata
FROM entities
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo')
AND entity_type IN ('person', 'individual', 'staff')
LIMIT 5;
SQL

echo ""
echo "=== 0D: CHEQUE MESERO_ID SAMPLE ==="
cat << 'SQL'
SELECT row_data->>'mesero_id' as mesero_id, COUNT(*) as cheques
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo')
AND data_type = 'pos_cheque'
GROUP BY row_data->>'mesero_id'
ORDER BY cheques DESC
LIMIT 10;
SQL

echo ""
echo "=== 0E: PERFORM PAGE ROUTING ==="
cat web/src/app/perform/page.tsx 2>/dev/null | head -30
grep -n "Govern\|Acelerar\|governance\|acceleration" web/src/app/perform/page.tsx 2>/dev/null

echo ""
echo "=== 0F: TRENDS DATA SOURCE ==="
grep -n "tenant_id\|tenantId\|currentTenant" web/src/app/perform/trends/page.tsx 2>/dev/null | head -15

echo ""
echo "=== 0G: PERSONA SWITCHER NAVIGATION ==="
grep -n "navigate\|router\|push\|redirect\|defaultWorkspace\|defaultRoute" web/src/components/demo/DemoPersonaSwitcher.tsx 2>/dev/null | head -20

echo ""
echo "=== 0H: BREADCRUMB IMPLEMENTATION ==="
grep -rn "breadcrumb\|Breadcrumb" web/src/app/financial/ --include="*.tsx" 2>/dev/null | head -15
grep -rn "breadcrumb\|Breadcrumb" web/src/components/navigation/ --include="*.tsx" 2>/dev/null | head -10

echo ""
echo "=== 0I: FINANCIAL SIDEBAR CONFIG ==="
grep -A 30 "financial" web/src/lib/navigation/workspace-config.ts 2>/dev/null | head -40

echo ""
echo "=== 0J: BRAND FILTER IMPLEMENTATION ==="
grep -n "brand\|Brand\|filter\|Filter" web/src/app/financial/performance/page.tsx web/src/app/financial/timeline/page.tsx 2>/dev/null | head -20

echo ""
echo "=== 0K: PERIOD DISPLAY ==="
grep -n "Dec\|December\|2023\|period\|Period" web/src/app/financial/summary/page.tsx 2>/dev/null | head -15

echo ""
echo "=== 0L: CANCELLATION DATA ==="
cat << 'SQL'
SELECT
  COUNT(*) as total_cheques,
  SUM(CASE WHEN (row_data->>'cancelado')::int = 1 THEN 1 ELSE 0 END) as cancelled,
  ROUND(SUM(CASE WHEN (row_data->>'cancelado')::int = 1 THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as cancel_rate
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo')
AND data_type = 'pos_cheque';
SQL

echo ""
echo "=== 0M: SEED DATA VARIANCE CHECK ==="
cat << 'SQL'
-- Check if guests per check varies or is constant
SELECT
  (row_data->>'comensales')::text as guests,
  COUNT(*) as cheques
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo')
AND data_type = 'pos_cheque'
GROUP BY row_data->>'comensales'
ORDER BY cheques DESC
LIMIT 10;
SQL

echo ""
echo "=== 0N: EXISTING FINANCIAL ROUTES ==="
find web/src/app/financial -name "page.tsx" | sort

echo ""
echo "=== 0O: QUERY COUNT IN DATA SERVICE ==="
grep -c "\.from\|\.select\|supabase" web/src/lib/financial/financial-data-service.ts 2>/dev/null
```

**PASTE ALL OUTPUT.** Execute the SQL queries in Supabase SQL Editor and paste those results too. This diagnostic reveals root causes for every CLT-95 finding.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Phase 0: Financial Module Depth diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Financial module has critical bugs, missing product data dimension,
no intelligence layer, poor UX navigation, and severe query performance issues.
Need to fix all while adding item-level product data.

Option A: Incremental patches — fix each finding individually
  - Scale test: N/A
  - Problem: Doesn't address root cause of query explosion. Doesn't add product data.
  
Option B: Refactor financial-data-service + add product data + fix UX holistically
  - Replace client-side aggregation with Supabase RPC functions (server-side SQL)
  - Add pos_line_item data_type to committed_data for product-level data
  - Create product_catalog entity type for normalized product dictionary
  - Build card-based Financial landing and Location Detail drill-down
  - Fix all CLT-95 findings as part of the refactor
  - Scale test: YES — SQL aggregation handles 500K+ rows
  - AI-first: YES — product normalization uses classification signals
  - Transport: NO HTTP bodies — Supabase RPC returns aggregated results
  - Atomicity: YES
  
Option C: Create materialized views for financial aggregates
  - Pre-compute location metrics, staff metrics, time series as Supabase views
  - Scale test: YES at extreme scale
  - Problem: Premature for 47K rows. Adds DDL complexity.

CHOSEN: Option B — Refactored service + product data + holistic UX fixes
REASON: The N+1 problem is the #1 issue. Supabase RPC functions do the aggregation
in PostgreSQL instead of fetching 47K rows to the browser. Product data fits the
existing committed_data model (data_type='pos_line_item'). Card-based landing and
Location Detail are new pages, not schema changes.

REJECTED: Option A — Doesn't fix root cause.
REJECTED: Option C — Premature. Revisit at 500K+ cheques.
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Phase 1: ADR — service refactor + product data + UX" && git push origin dev`

---

## PHASE 2: CRITICAL BUG FIXES

Fix the 5 critical findings first. These are blocking the demo.

### 2A: Fix Perform Home Rendering Wrong Page (F-02)

From diagnostic 0E: identify what component `/perform/page.tsx` is rendering. It shows "Govern — Governance & System Health" or "Acelerar — Development & Acceleration" instead of the Perform dashboard.

**Fix:** The Perform home page must render the PerformDashboard component (period summary, calculation results, performance overview). If no calculation results exist for the current period, show a meaningful empty state: "No calculation results for this period. Run a calculation from the Operations Center to see data here."

Do NOT render Govern or Acelerar content on the Perform route.

### 2B: Fix Trends Tenant Isolation (F-06)

From diagnostic 0F: the Trends page shows data from the wrong tenant or shows placeholder/demo data regardless of selected tenant.

**Fix:** Ensure Trends queries filter by `currentTenant.id`. If no calculation results exist for the selected tenant, show empty state — not data from another tenant.

### 2C: Fix Staff Page — Mesero Join (F-18)

From diagnostics 0B/0C/0D: identify the entity_type mismatch. The staff page can't match cheque `mesero_id` to staff entities.

**Root cause investigation:**
1. What entity_type did the seed use for staff? ('person' vs 'individual' vs 'staff')
2. Does the staff entity metadata contain `mesero_id`?
3. Does the financial-data-service `getStaffPerformance()` look for the right entity_type and the right metadata field?

**Fix:** Align the staff page query to match however the seed created staff entities. The join path is:
```
committed_data.row_data->>'mesero_id' 
  → entities.metadata->>'mesero_id' 
  WHERE entities.entity_type = <whatever seed used>
```

### 2D: Fix Persona Switcher on Financial Pages (F-24)

From diagnostic 0G: when switching personas on a Financial page, Manager/Rep see blank, and switching back to Admin dumps to Operate.

**Fix:** The persona switcher must be workspace-aware:
1. When switching persona, check if the current workspace is accessible to the new persona
2. If YES → stay on current page (just re-render with persona-filtered data)
3. If NO → navigate to the best available page for that persona:
   - For Financial workspace: ALL personas should have access (it's a read surface, not an admin workflow)
   - Admin → current page
   - Manager → `/financial/performance` (their locations)
   - Rep/Server → `/financial/staff` (their performance)
4. When switching BACK to Admin, return to the page they were on, not Operate

### 2E: Reduce Query Explosion (F-07/08/13/19/35/44)

This is the root cause of the performance problem. The financial-data-service fetches ALL 47K cheque rows from Supabase via paginated client-side queries, then aggregates in JavaScript.

**Fix: Create Supabase RPC functions** that do aggregation in PostgreSQL and return only the results.

Create these RPC functions via Supabase SQL Editor:

```sql
-- 1. Network summary metrics
CREATE OR REPLACE FUNCTION financial_network_summary(p_tenant_id uuid, p_period_id uuid)
RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'total_revenue', SUM((row_data->>'total')::numeric),
    'total_cheques', COUNT(*),
    'avg_check', AVG((row_data->>'total')::numeric),
    'total_tips', SUM((row_data->>'propina')::numeric),
    'total_discounts', SUM((row_data->>'descuentos')::numeric),
    'total_comps', SUM((row_data->>'cortesias')::numeric),
    'total_cancelled', SUM(CASE WHEN (row_data->>'cancelado')::int = 1 THEN 1 ELSE 0 END),
    'total_cash', SUM((row_data->>'efectivo')::numeric),
    'total_card', SUM((row_data->>'tarjeta')::numeric),
    'total_guests', SUM((row_data->>'comensales')::numeric)
  )
  FROM committed_data
  WHERE tenant_id = p_tenant_id
    AND period_id = p_period_id
    AND data_type = 'pos_cheque'
    AND (row_data->>'cancelado')::int = 0;
$$ LANGUAGE sql STABLE;

-- 2. Location-level metrics
CREATE OR REPLACE FUNCTION financial_location_metrics(p_tenant_id uuid, p_period_id uuid)
RETURNS TABLE(
  entity_id uuid,
  external_id text,
  display_name text,
  metadata jsonb,
  revenue numeric,
  cheques bigint,
  avg_check numeric,
  tips numeric,
  discounts numeric,
  comps numeric,
  cancelled bigint,
  cash numeric,
  card numeric,
  guests numeric
) AS $$
  SELECT
    e.id,
    e.external_id,
    e.display_name,
    e.metadata,
    SUM((cd.row_data->>'total')::numeric) as revenue,
    COUNT(*) as cheques,
    AVG((cd.row_data->>'total')::numeric) as avg_check,
    SUM((cd.row_data->>'propina')::numeric) as tips,
    SUM((cd.row_data->>'descuentos')::numeric) as discounts,
    SUM((cd.row_data->>'cortesias')::numeric) as comps,
    SUM(CASE WHEN (cd.row_data->>'cancelado')::int = 1 THEN 1 ELSE 0 END) as cancelled,
    SUM((cd.row_data->>'efectivo')::numeric) as cash,
    SUM((cd.row_data->>'tarjeta')::numeric) as card,
    SUM((cd.row_data->>'comensales')::numeric) as guests
  FROM committed_data cd
  JOIN entities e ON cd.entity_id = e.id
  WHERE cd.tenant_id = p_tenant_id
    AND cd.period_id = p_period_id
    AND cd.data_type = 'pos_cheque'
  GROUP BY e.id, e.external_id, e.display_name, e.metadata;
$$ LANGUAGE sql STABLE;

-- 3. Staff performance metrics
CREATE OR REPLACE FUNCTION financial_staff_metrics(p_tenant_id uuid, p_period_id uuid)
RETURNS TABLE(
  mesero_id text,
  staff_entity_id uuid,
  staff_name text,
  location_id uuid,
  location_name text,
  revenue numeric,
  cheques bigint,
  avg_check numeric,
  tips numeric,
  tip_rate numeric,
  guests numeric,
  cancelled bigint
) AS $$
  SELECT
    cd.row_data->>'mesero_id',
    staff.id,
    staff.display_name,
    loc.id,
    loc.display_name,
    SUM((cd.row_data->>'total')::numeric),
    COUNT(*),
    AVG((cd.row_data->>'total')::numeric),
    SUM((cd.row_data->>'propina')::numeric),
    CASE WHEN SUM((cd.row_data->>'subtotal')::numeric) > 0
      THEN SUM((cd.row_data->>'propina')::numeric) / SUM((cd.row_data->>'subtotal')::numeric) * 100
      ELSE 0 END,
    SUM((cd.row_data->>'comensales')::numeric),
    SUM(CASE WHEN (cd.row_data->>'cancelado')::int = 1 THEN 1 ELSE 0 END)
  FROM committed_data cd
  JOIN entities loc ON cd.entity_id = loc.id
  LEFT JOIN entities staff ON staff.tenant_id = cd.tenant_id
    AND staff.metadata->>'mesero_id' = cd.row_data->>'mesero_id'
  WHERE cd.tenant_id = p_tenant_id
    AND cd.period_id = p_period_id
    AND cd.data_type = 'pos_cheque'
  GROUP BY cd.row_data->>'mesero_id', staff.id, staff.display_name, loc.id, loc.display_name;
$$ LANGUAGE sql STABLE;

-- 4. Hourly patterns
CREATE OR REPLACE FUNCTION financial_hourly_patterns(p_tenant_id uuid, p_period_id uuid)
RETURNS TABLE(
  hour_of_day int,
  day_of_week int,
  day_name text,
  revenue numeric,
  cheques bigint,
  avg_check numeric,
  guests numeric
) AS $$
  SELECT
    EXTRACT(HOUR FROM (cd.row_data->>'fecha')::timestamp)::int,
    EXTRACT(DOW FROM (cd.row_data->>'fecha')::timestamp)::int,
    TO_CHAR((cd.row_data->>'fecha')::timestamp, 'Dy'),
    SUM((cd.row_data->>'total')::numeric),
    COUNT(*),
    AVG((cd.row_data->>'total')::numeric),
    SUM((cd.row_data->>'comensales')::numeric)
  FROM committed_data cd
  WHERE cd.tenant_id = p_tenant_id
    AND cd.period_id = p_period_id
    AND cd.data_type = 'pos_cheque'
    AND (cd.row_data->>'cancelado')::int = 0
  GROUP BY
    EXTRACT(HOUR FROM (cd.row_data->>'fecha')::timestamp),
    EXTRACT(DOW FROM (cd.row_data->>'fecha')::timestamp),
    TO_CHAR((cd.row_data->>'fecha')::timestamp, 'Dy');
$$ LANGUAGE sql STABLE;

-- 5. Time series (daily/weekly)
CREATE OR REPLACE FUNCTION financial_time_series(p_tenant_id uuid, p_period_id uuid, p_granularity text DEFAULT 'day')
RETURNS TABLE(
  period_key text,
  revenue numeric,
  cheques bigint,
  avg_check numeric,
  tips numeric,
  guests numeric
) AS $$
  SELECT
    CASE p_granularity
      WHEN 'day' THEN TO_CHAR((cd.row_data->>'fecha')::timestamp, 'YYYY-MM-DD')
      WHEN 'week' THEN 'W' || EXTRACT(WEEK FROM (cd.row_data->>'fecha')::timestamp)::text
      WHEN 'month' THEN TO_CHAR((cd.row_data->>'fecha')::timestamp, 'YYYY-MM')
    END,
    SUM((cd.row_data->>'total')::numeric),
    COUNT(*),
    AVG((cd.row_data->>'total')::numeric),
    SUM((cd.row_data->>'propina')::numeric),
    SUM((cd.row_data->>'comensales')::numeric)
  FROM committed_data cd
  WHERE cd.tenant_id = p_tenant_id
    AND cd.period_id = p_period_id
    AND cd.data_type = 'pos_cheque'
    AND (cd.row_data->>'cancelado')::int = 0
  GROUP BY 1
  ORDER BY 1;
$$ LANGUAGE sql STABLE;
```

**Execute ALL RPC functions in Supabase SQL Editor.** Verify each with a test call:
```sql
SELECT financial_network_summary('<TENANT_ID>', '<PERIOD_ID>');
```

**Then refactor financial-data-service.ts** to call these RPCs instead of fetching raw rows:
```typescript
const { data } = await supabase.rpc('financial_network_summary', {
  p_tenant_id: tenantId,
  p_period_id: periodId
});
```

This should reduce page loads from 250-1,236 requests to 2-5 requests per page.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Perform home renders Perform content, not Govern/Acelerar | Visual check on localhost |
| PG-2 | Trends shows Sabor Grupo data or empty state, not other tenant data | Tenant isolation verified |
| PG-3 | Staff page shows 48 servers with performance metrics | All mesero_ids resolved to names |
| PG-4 | Persona switcher preserves Financial workspace context | Manager/Rep stay on Financial pages |
| PG-5 | Network Pulse loads in < 20 requests | Network tab shows ≤ 20 fetches |
| PG-6 | All 5 RPC functions created and verified | Test calls return valid data |
| PG-7 | Revenue Timeline loads in < 20 requests | Network tab verified |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Phase 2: Critical bug fixes — routing, staff join, query performance" && git push origin dev`

---

## PHASE 3: HIGH-SEVERITY FIXES

### 3A: Brand Filter on Timeline (F-12)

The "By Brand" selector on Revenue Timeline empties the chart.

**Fix:** When "By Brand" is selected, the time series query should return data grouped by brand. Create an RPC variant or add a brand parameter:
```sql
-- Add optional brand grouping to time_series
-- When brand is requested, return multiple series keyed by brand name
```

The chart component must handle multiple series (one line per brand: Fuego Dorado, Rápido Verde, Costa Azul).

### 3B: Brand Dropdown on Benchmarks (F-14)

The dropdown shows "All Brands" but has no options.

**Fix:** Populate brand options from the location entity metadata:
```typescript
const brands = locations
  .map(l => l.metadata?.brand_display || l.metadata?.brand_name)
  .filter(Boolean)
  .filter((v, i, a) => a.indexOf(v) === i); // unique
```

### 3C: Cancellation Data in Leakage (F-33)

Leakage Monitor shows MX$0 for Cancelaciones.

**Investigate:** From diagnostic 0L — check if the seed data has cancelled cheques and what field name was used. The leakage calculation may be looking for the wrong field name (e.g., `cancelado` vs `motivo_cancelacion`) or not summing the `total` of cancelled cheques.

**Fix:** Cancelled cheques contribute their `total` to the cancellation leakage category. The query should:
```sql
SUM(CASE WHEN (row_data->>'cancelado')::int = 1 THEN (row_data->>'total')::numeric ELSE 0 END) as cancellation_leakage
```

### 3D: Time Period Filter (F-36)

"This Month / This Week / This Quarter" doesn't work because the data is historical (January 2024) and relative filters look at current date (February 2026).

**Fix:** Replace relative time filters with data-aware period filters. The options should be derived from the actual period(s) available:
- Show period label from `periods` table (e.g., "Enero 2024")
- Within a period, offer granularity: "Full Period / W1 / W2 / W3 / Daily"
- Remove "This Week / This Month / This Quarter" — these only make sense with live data feeds

### 3E: Wrong Period on Summary (F-39)

Monthly Summary shows "December 2023" instead of the actual period.

**Fix:** Read period label from the selected period: `period.label` ("Enero 2024"), not a hardcoded or incorrectly calculated date.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-8 | By Brand shows 3 series on Timeline chart | Fuego Dorado, Rápido Verde, Costa Azul lines visible |
| PG-9 | Brand dropdown has 3 options on Benchmarks | All Brands + 3 brand names |
| PG-10 | Cancellation leakage > MX$0 | Leakage Monitor shows cancellation amount |
| PG-11 | Period filter shows "Enero 2024" and sub-period options | No relative time labels |
| PG-12 | Summary shows "Enero 2024", not December 2023 | Correct period label |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Phase 3: High-severity fixes — filters, cancellations, periods" && git push origin dev`

---

## PHASE 4: SEED DATA IMPROVEMENT

### 4A: Improve Temporal Variance

The current seed data generates too-uniform patterns. Reseed (or update) the cheque data to have:

**Weekend peaks:** Saturday revenue 25-30% higher than Tuesday. Sunday slightly above weekday average (brunch effect for Fuego Dorado).

**Daypart patterns by brand:**
- Fuego Dorado: 15% breakfast/brunch (8-11am), 30% lunch (12-3pm), 45% dinner (6-10pm), 10% late (10pm+)
- Rápido Verde: 0% breakfast, 50% lunch (11am-3pm), 35% dinner (5-9pm), 15% late
- Costa Azul: 10% breakfast (coastal), 35% lunch, 45% dinner, 10% late

**Guest count variance:** Weekday lunch: 1-3 guests (weighted toward 2). Weekend dinner: 2-6 guests (weighted toward 4). Not constant 3.5.

**Anomaly locations must be more pronounced:**
- RV-MTY-002: 8-10% cancellation rate (currently may not be seeded)
- FD-GDL-002: Server 2008 tip rate 1.5-2% vs 12% brand average
- RV-TIJ-001: 85% cash ratio
- CA-VER-001: Night shift revenue 3x afternoon

### 4B: Seed Product Line Item Data

Generate `pos_line_item` committed_data rows for a subset of locations (at minimum 3, one per brand) to demonstrate product-level reporting.

For each cheque at these locations, generate 2-6 line items that:
1. Sum to the cheque total (alimentos + bebidas)
2. Use product names from the catalog hierarchy (Comidas/Bebidas taxonomy)
3. Include normalization variants — some items use messy POS-style names, some use clean catalog names
4. Include the product group (DESCRIPCIONGRUPO) for category grouping

**Target:** ~5,000-8,000 line item rows across 3 locations.

**Line item distribution per cheque:**
- 1-3 food items (weighted by brand menu: alitas-heavy for wing-style, seafood-heavy for Costa Azul)
- 1-2 beverage items (beer most common, followed by refrescos, then spirits)
- 0-1 extras/sauces

### 4C: Seed Product Catalog Entities

Create product catalog entities (entity_type='product') for the normalized dictionary:

```
entity_type: 'product'
external_id: 'PROD-001' through 'PROD-203'
display_name: Clean product name from catalog
metadata: {
  clasificacion_1: 'Comidas' | 'Bebidas',
  clasificacion_menu: 'Alitas' | 'Burgers' | 'Cervezas Importadas' | etc.,
  tipo_producto: 'Alitas 350 g',
  classified: true | false,
  avg_price: <calculated>,
  margin_tier: 'high' | 'medium' | 'low'  // based on classification
}
```

This creates the normalization target: when messy POS names come in, the AI maps them to these clean product entities.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-13 | Weekend revenue > weekday revenue by 20%+ | SQL query confirms |
| PG-14 | Guest variance visible | Multiple guest counts, not constant 3.5 |
| PG-15 | Line item data exists | `SELECT COUNT(*) FROM committed_data WHERE data_type='pos_line_item'` > 5,000 |
| PG-16 | Product catalog entities exist | ~203 product entities |
| PG-17 | RV-MTY-002 cancellation rate > 7% | SQL confirmation |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Phase 4: Seed data improvement — variance + product line items" && git push origin dev`

---

## PHASE 5: UX NAVIGATION FIXES

### 5A: Remove Dual Breadcrumbs (F-22)

Every Financial page has both a chrome-level breadcrumb in the header bar AND a page-level breadcrumb.

**Fix:** Remove page-level breadcrumbs from ALL financial pages. The chrome header breadcrumb is the canonical navigation indicator. Pages should start with their title, not a redundant breadcrumb.

### 5B: Fix Sidebar Collapse Context (F-09/10/11)

When the Financial sidebar collapses, sub-items under "Analysis" and "Controls" become hidden.

**Fix:** Financial sidebar sections should default to expanded when the user is ON a page within that section. If I'm on `/financial/timeline`, the "Analysis" section must be expanded showing Timeline as the active item. Collapsing should only happen on user action, not automatically.

### 5C: WoW / Period Comparison (F-15)

WoW shows -100% when no prior period exists.

**Fix:** When there is no prior period data to compare, show "—" instead of -100% or 0%. Hide the comparison column entirely if no prior period exists for any location.

### 5D: Table Sorting (F-31/42)

Leakage rankings and Summary location breakdown are not sortable.

**Fix:** Add click-to-sort on all column headers in:
- Leakage Monitor location rankings (sort by: amount, rate, location name)
- Monthly Summary location breakdown (sort by: all columns)
- Location Benchmarks (verify existing sort works)

### 5E: Brand Benchmarking (F-16)

Avg Check values show red for Rápido Verde locations (MX$183-186) which are actually on-target for Express format.

**Fix:** Benchmark indicators must compare against brand benchmarks (from brand entity metadata), not network average. An MX$185 avg check at Rápido Verde (benchmark: MX$185) is green, not red.

### 5F: Operating Summary Granularity (F-40)

Replace "Monthly Operating Summary" with "Operating Summary" and add period granularity selector: Daily / Weekly / Monthly / Full Period.

The P&L table structure stays the same — only the aggregation window changes.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-18 | Zero page-level breadcrumbs in Financial pages | Grep returns 0 |
| PG-19 | Sidebar expanded when on child page | Visual: Analysis expanded when on Timeline |
| PG-20 | WoW shows "—" not -100% | Visual on Benchmarks page |
| PG-21 | Leakage table sortable by clicking headers | Click amount → sorts by amount |
| PG-22 | Rápido Verde avg check NOT red | MX$185 shows green/neutral |
| PG-23 | Summary has Daily/Weekly/Monthly selector | Granularity switcher functional |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Phase 5: UX navigation — breadcrumbs, sidebar, sorting, benchmarks" && git push origin dev`

---

## PHASE 6: INTELLIGENCE LAYER

### 6A: Add Anomaly Indicators to All Tables

Every location row in every table should have visual intelligence:

**Color coding rules (read from brand entity metadata benchmarks):**
- 🟢 Green: Metric is at or above brand benchmark
- 🟡 Amber: Metric is within 10% below brand benchmark
- 🔴 Red: Metric is more than 10% below brand benchmark, OR above threshold for inverse metrics (cancellation rate, leakage)

Apply to: Network Pulse tiles, Location Benchmarks rows, Leakage Monitor rankings, Operating Summary rows.

### 6B: Add Insight Cards to Operating Summary (F-41)

Above the P&L table, show 3-4 auto-generated insight cards:

Examples (derived from data, not hardcoded):
- "📊 Costa Azul Playa Norte revenue 36% below brand average — investigate staffing"
- "⚠️ RV-MTY-002 cancellation rate 8.2% — 2x brand threshold of 4%"
- "🎯 Fuego Dorado Polanco tip rate 14.1% — highest in network"
- "💰 Cash transactions at RV-TIJ-001: 85% vs 40% network average"

The logic should identify the top 3-4 most notable deviations from benchmarks and surface them as actionable insights. This is the Thermostat principle in action.

### 6C: Performance Index Tier Badges on Staff Page

When the Staff Performance page works (after Phase 2C fix), add tier badges:
- ⭐ Estrella (85-100)
- ✅ Destacado (70-84)
- ➡️ Estándar (50-69)
- ⚠️ En Desarrollo (0-49)

Calculate the Performance Index score inline using the 4-component formula from the rule set.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-24 | Network Pulse tiles have color-coded borders/indicators | Red/amber/green visible |
| PG-25 | Operating Summary shows ≥ 3 insight cards | Auto-generated from data deviations |
| PG-26 | Staff page shows tier badges | At least one ⭐ and one ⚠️ visible |
| PG-27 | Anomaly location flagged red | RV-MTY-002 shows red indicator |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Phase 6: Intelligence layer — anomaly indicators, insights, tier badges" && git push origin dev`

---

## PHASE 7: NEW PAGES — FINANCIAL LANDING + LOCATION DETAIL

### 7A: Card-Based Financial Landing (F-37)

Replace the current Financial home page with a card-based report discovery surface.

**Route:** `/financial` (same route, new content)

Each card shows:
- Report title (e.g., "Network Pulse", "Revenue Timeline", "Staff Performance")
- Representative mini-visualization or icon
- 1-2 key metrics as preview (e.g., "MX$17M revenue • 20 locations")
- Click → navigates to full report

**Cards (7):**
1. **Network Pulse** — location grid mini-preview + "MX$17M • 20 active"
2. **Revenue Timeline** — mini sparkline + "+1.8% trend"
3. **Location Benchmarks** — mini ranking + "#1 Costa Azul Puerto Juárez"
4. **Operational Patterns** — mini heatmap + "Peak: Wed 2pm"
5. **Leakage Monitor** — mini donut + "MX$163K • 0 above threshold"
6. **Staff Performance** — mini leaderboard + "48 servers • 12 ⭐"
7. **Operating Summary** — P&L icon + "MX$16.8M net revenue"

If product data exists (Phase 4B), add:
8. **Product Mix** — category chart + "228 products • 24 groups"

This is the Bloodwork Principle: clean summary by default, detail on demand.

### 7B: Location Detail Page (F-38)

**Route:** `/financial/location/[id]`

A composite view showing everything about one location:

**Header:** Location name, brand badge, region, status, tags (Oro/Expansión)

**Sections:**
1. **KPI Summary** — Revenue, Cheques, Avg Check, Tip Rate, Leakage Rate, Covers
2. **Revenue Trend** — Daily revenue chart for this location (reuse Timeline component)
3. **Hourly Heatmap** — This location only (reuse Patterns heatmap component)
4. **Staff Ranking** — Servers at this location with performance metrics
5. **Leakage Detail** — Discounts, Comps, Cancellations for this location
6. **Product Mix** (if line item data exists) — Top sellers, category split

This is what the Network Pulse location tiles (F-01) click through to.

### 7C: Wire Location Tile Click-Through (F-01)

On Network Pulse, make each location tile clickable → navigates to `/financial/location/[entity_id]`.

### 7D: Server Detail View (Rep Persona)

**Route:** `/financial/server/[id]`

What a server sees when logged in or filtered:
1. **My Performance** — Revenue, cheques, avg check, tip rate, Performance Index score + tier
2. **My Cheques** — Sortable list of cheques with date, time, table, guests, total, tip, payment method
3. **My Trends** — Daily performance over the period
4. **My Product Mix** (if line item data exists) — What I sell most, category breakdown
5. **My Ranking** — Position vs peers at same location

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-28 | Financial landing shows 7+ cards | Card grid renders with preview metrics |
| PG-29 | Location Detail page renders for any location | Click tile → composite view loads |
| PG-30 | Network Pulse tiles are clickable | Click navigates to /financial/location/[id] |
| PG-31 | Server Detail page renders | /financial/server/[id] shows server data |
| PG-32 | Rep persona lands on server detail | Persona switch to Rep → their server page |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Phase 7: Financial landing + Location Detail + Server Detail" && git push origin dev`

---

## PHASE 8: PRODUCT MIX REPORTING

### 8A: Product Mix Dashboard

**Route:** `/financial/products`

**Section 1: Category Overview**
- Treemap or stacked bar: Comidas vs Bebidas split
- Within each: sub-category breakdown (Alitas, Burgers, Cervezas Importadas, etc.)
- Click category → filter to that category

**Section 2: Top Products**
- Sortable table: Rank, Product Name, Category, Quantity Sold, Revenue, Avg Price, % of Total
- Top 20 by default, expandable
- Filterable by category, brand, location

**Section 3: Product × Server Matrix**
- Heatmap: servers (rows) × product categories (columns)
- Cell intensity: revenue or quantity
- Identifies which servers sell premium items vs basic items

**Section 4: Normalization Status**
- Show classified vs unclassified products
- "228 unique product descriptions → 203 catalog entries → 25 unmapped"
- List unmapped products with suggested matches (AI classification demo)

### 8B: Add Product Mix to Location Detail

In the Location Detail page (Phase 7B), add a Product Mix section showing the top products at that location.

### 8C: Add to Financial Sidebar and Landing

- Add "Product Mix" to the Analysis section in the Financial sidebar
- Add product card to the Financial landing (Phase 7A)

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-33 | Product Mix page renders | Category overview + top products table visible |
| PG-34 | Category filter works | Click "Cervezas Importadas" → filters to beer |
| PG-35 | Product × Server heatmap renders | Matrix shows intensity variation |
| PG-36 | Normalization status visible | Classified vs unclassified count shown |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Phase 8: Product Mix dashboard" && git push origin dev`

---

## PHASE 9: HOURLY REPORTING

### 9A: Enhance Operational Patterns with Brand/Location Filter (F-21)

Add filter selectors to the Operational Patterns page:
- **Scope:** Network / Brand / Location dropdown
- **Brand:** All / Fuego Dorado / Rápido Verde / Costa Azul
- **Location:** All locations (filtered by brand if selected)

When filtered, the heatmap, day-of-week chart, and detail table all update.

This enables the demo story: "Rápido Verde peaks at lunch, Costa Azul peaks at dinner."

### 9B: Speed of Service Metric

Using `fecha` (open time) and `cierre` (close time) from cheque data, calculate ticket time per cheque.

Add to:
- Location Benchmarks: "Avg Ticket Time" column
- Location Detail: ticket time distribution histogram
- Staff Performance: avg ticket time per server (slower = possible issue)

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-37 | Patterns page has brand/location filter | Selectors functional |
| PG-38 | Filtered heatmap shows different patterns per brand | Rápido Verde ≠ Costa Azul |
| PG-39 | Ticket time appears on Benchmarks | New column with time values |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Phase 9: Hourly reporting enhancements" && git push origin dev`

---

## PHASE 10: STRAY PERIOD FIX + OPERATE LANDING

### 10A: Remove Stray Dec 2023 Period (F-03)

From diagnostic: check if a December 2023 period exists in the database for Sabor Grupo. If so, delete it — only Enero 2024 was intended.

```sql
DELETE FROM periods
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo')
AND canonical_key != '2024-01';
```

### 10B: Improve Operate Landing for Dual-Module Tenants (F-25)

When a dual-module tenant (both ICM and Financial enabled) is selected and no calculations have been run, the Operate landing should:

1. Show a module overview card for each enabled module:
   - **Financial Module:** "47,051 cheques imported • 20 locations active • 48 staff" → Click to go to Financial workspace
   - **ICM Module:** "2 rule sets configured • 0 calculations run" → Click to run calculation

2. NOT show the full lifecycle stepper as the primary content — that's the Operations Center detail, not the landing overview.

This is a lightweight improvement, not a full redesign.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-40 | No Dec 2023 period for Sabor Grupo | SQL confirms single period |
| PG-41 | Operate landing shows module overview | Cards for Financial + ICM visible |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Phase 10: Period cleanup + Operate landing improvement" && git push origin dev`

---

## PHASE 11: BUILD + VERIFICATION + COMPLETION

### 11A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 11B: Route Verification

```bash
echo "=== ALL FINANCIAL ROUTES ==="
for route in "financial" "financial/performance" "financial/timeline" "financial/staff" "financial/leakage" "financial/patterns" "financial/summary" "financial/products"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$route)
  echo "$route: $STATUS"
done
```

### 11C: Query Count Verification

For each Financial page, load in browser with Network tab open. Record request count:

| Page | Before (CLT-95) | After (target) |
|------|-----------------|----------------|
| Network Pulse | 251 | ≤ 15 |
| Revenue Timeline | 874 | ≤ 15 |
| Location Benchmarks | 11 | ≤ 10 |
| Staff Performance | 246 | ≤ 15 |
| Leakage Monitor | 859 | ≤ 15 |
| Operational Patterns | 287 | ≤ 15 |
| Monthly Summary | 1,236 | ≤ 15 |
| Product Mix | N/A (new) | ≤ 15 |

### 11D: Completion Report

Create `OB-96_COMPLETION_REPORT.md` at project root:

1. CLT-95 findings resolved (by finding number)
2. RPC functions created (list with test results)
3. Query performance improvement (before/after table)
4. Seed data improvements (variance, anomalies)
5. Product line item data (count, locations covered)
6. New pages created (Financial landing, Location Detail, Server Detail, Product Mix)
7. Intelligence layer additions (anomaly indicators, insight cards, tier badges)
8. UX fixes (breadcrumbs, sorting, benchmarking)
9. All proof gates with PASS/FAIL

### 11E: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-96: Financial Module Depth — CLT-95 Remediation + Product Data + Reporting Intelligence" \
  --body "## CLT-95 Remediation
- Fixed 44 findings across 4 severity levels
- Perform home no longer renders Govern content
- Staff page resolves mesero_id to staff entities
- Persona switcher preserves Financial workspace context
- All brand/period filters functional

## Query Performance
Replaced client-side aggregation (250-1,236 requests/page) with Supabase RPC functions (≤15 requests/page).
5 RPC functions: network_summary, location_metrics, staff_metrics, hourly_patterns, time_series.

## Product Data Layer
- ~5,000-8,000 product line items in committed_data (data_type='pos_line_item')
- 203 product catalog entities with 2-level classification hierarchy
- Normalization challenge visible: messy POS names → clean catalog entries

## New Pages (4)
- Financial Landing: Card-based report discovery with preview metrics
- Location Detail: Composite view — all metrics for one location
- Server Detail: Rep persona view — my cheques, my performance, my ranking
- Product Mix: Category overview, top products, server×product matrix

## Intelligence Layer
- Anomaly indicators (red/amber/green) on all tables using brand benchmarks
- Auto-generated insight cards on Operating Summary
- Performance Index tier badges on Staff page

## UX Improvements
- Removed dual breadcrumbs
- Sidebar stays expanded on active section
- Tables sortable by clicking column headers
- Brand benchmarking (not network average)
- Operating Summary granularity: Daily/Weekly/Monthly
- WoW shows '—' when no prior period

## Proof Gates: 41"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-96 Complete: Financial Module Depth" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- All 44 CLT-95 findings (critical through medium)
- 5 Supabase RPC functions for server-side aggregation
- Product line item seed data (~5K-8K rows, 3 locations)
- Product catalog entities (203 products)
- Financial card-based landing page
- Location Detail composite page
- Server Detail page (Rep persona)
- Product Mix dashboard
- Intelligence indicators (red/amber/green benchmarking)
- Auto-generated insight cards
- Performance Index tier badges
- Seed data variance improvement
- Breadcrumb, sidebar, sorting, period granularity fixes
- Operate landing improvement for dual-module tenants

### OUT OF SCOPE — DO NOT BUILD
- Calculation engine runs (rule sets exist, engine runs separately)
- Normalization dictionary review UI (classification pipeline exists, product data is seed)
- Real-time POS API integration (batch import model)
- Table/seat utilization (requires seating system data not in cheque)
- Franchise fee calculations (future module)
- Tip pool distribution (future)
- Budget/target imports (future data source)
- Mobile-specific layouts (future)
- Full Operate landing redesign (lightweight improvement only)
- Auth user creation for @saborgrupo.mx emails (separate HF)
- New Supabase tables (everything fits committed_data + entities + RPC functions)

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Client-side aggregation of 47K+ rows | Use Supabase RPC functions |
| AP-2 | Hardcode brand names or benchmarks | Read from entity metadata |
| AP-3 | Network-average benchmarking | Use brand-specific benchmarks from brand entity metadata |
| AP-4 | Relative time filters on historical data | Data-aware period selectors |
| AP-5 | Page-level breadcrumbs alongside chrome breadcrumbs | Single canonical breadcrumb in chrome |
| AP-6 | Tables without sort capability | All data tables must be sortable |
| AP-7 | Empty states that show -100% or wrong data | Show "—" or meaningful empty state message |
| AP-8 | Persona switcher that loses workspace context | Preserve current workspace, navigate within it |
| AP-9 | Intelligence-free data tables | Every table row needs anomaly indicator vs benchmark |

---

*ViaLuce.ai — The Way of Light*
*OB-96: From proof of architecture to product that restaurants would actually buy.*
*"A thermostat doesn't just show the temperature. It acts."*
