# OB-96 Phase 0: Financial Module Depth Diagnostic

## 0A: Financial Data Service
- 1,082 lines
- Staff filter: `entity_type === 'person'` (line 585) — **WRONG: seed used `individual`**
- Staff join: matches by `external_id` (mesero_id as string)

## 0B: Entity Type Distribution
```
organization: 4
location: 20
individual: 40
```
**No `person` entities exist. Staff are `individual`. This is why F-18 staff page is empty.**

## 0C: Staff Metadata Sample (entity_type = 'individual')
```json
{
  "role": "mesero",
  "status": "active",
  "hire_date": "2021-08-20",
  "mesero_id": 1002,
  "brand_code": "FD",
  "location_id": "10000000-3000-...",
  "shift_pattern": 2,
  "location_ext_id": "FD-CDMX-001"
}
```
- Has `mesero_id` in metadata (numeric)
- Has `location_id` for join to location entity

## 0D: Cheque Row Data Keys
```
fecha, folio, total, cierre, pagado, propina, tarjeta, efectivo,
subtotal, turno_id, cancelado, descuento, mesero_id, numero_cheque,
total_bebidas, total_impuesto, total_alimentos, total_articulos,
total_cortesias, total_descuentos, numero_franquicia, numero_de_personas,
subtotal_con_descuento
```

### Field Mismatches (data service assumes vs actual):
| Data service reads | Actual cheque field | Impact |
|---|---|---|
| `comensales` | `numero_de_personas` | **Guest counts all undefined** |
| `subtotal_alimentos` | `total_alimentos` | Food split wrong |
| `subtotal_bebidas` | `total_bebidas` | Bev split wrong |
| `descuentos` | `total_descuentos` | Discounts zero |
| `cortesias` | `total_cortesias` | Comps zero |
| `impuestos` | `total_impuesto` | Tax zero |

## 0E: Perform Page Routing
- Renders persona-appropriate dashboard (OB-94)
- Admin sees AdminDashboard (labelled "Govern") — **confusing on Perform route (F-02)**
- Manager sees ManagerDashboard
- Rep sees RepDashboard

## 0F: Trends Data Source
- `/perform/trends/page.tsx` re-exports `@/app/insights/trends/page`
- No tenant filtering found — likely shows wrong tenant data (F-06)

## 0G: Persona Switcher
- Always navigates to default workspace for selected persona (line 63)
- Admin default → `/operate`, Manager default → `/perform/trends`
- **Loses Financial workspace context entirely (F-24)**
- Rep (`sales_rep`) has NO access to `financial` workspace

## 0H: Breadcrumbs
- All 7 financial pages have page-level breadcrumbs (ChevronRight)
- Chrome header also shows breadcrumbs → **dual breadcrumbs (F-22)**

## 0I: Sidebar Config
- 7 routes across 3 sections: Network, Analysis, Controls
- Feature flag: `financial`
- Roles: vl_admin, admin, manager (staff/rep excluded)

## 0J: Brand Filters
- Performance: has brandFilter state, populated from `loc.brandId/brandName`
- Timeline: has scope state ('all' | 'brand'), reads brandData from service
- **Brand fields depend on data service populating them correctly**

## 0K: Period
- Single period: Enero 2024 (2024-01-01 to 2024-01-31)
- Summary periodLabel comes from data service computation

## 0L: Cancellation Stats (1000-row sample)
- 55 cancelled / 1000 = 5.50%
- Cancellations exist in data
- Leakage monitor reads wrong field name

## 0M: Guest Variance
- ALL guests = `undefined` — seed uses `numero_de_personas` but service reads `comensales`
- When the field is read correctly: values ARE varied (sample cheque shows 4)

## 0N: Location Metadata
```json
{
  "brand_code": "FD",
  "brand_id": "10000000-2000-...",
  "city": "Ciudad de Mexico",
  "format": "full_service",
  "region": "centro",
  "capacity_tables": 45
}
```
- Has `brand_code` and `brand_id` — NO `brand_name` or `brand_display`
- Brand name must come from brand entity (organization type with brand_id)

## Root Causes

| Finding | Root Cause |
|---|---|
| F-18 Staff empty | `entity_type === 'person'` should be `'individual'` |
| F-20/23 Uniform guests | Service reads `comensales`, data has `numero_de_personas` |
| F-33 Zero cancellations | Service reads wrong field names for discounts/comps |
| F-02 Govern on Perform | AdminDashboard labelled as Govern content |
| F-06 Wrong tenant trends | Re-exports insights/trends with no tenant filter |
| F-24 Persona loses context | Switcher always navigates to default workspace |
| F-22 Dual breadcrumbs | Both chrome and page-level breadcrumbs present |
| F-12 Brand filter empty | Brand data depends on correct entity metadata mapping |
| F-39 Wrong period | Period label computed incorrectly or hardcoded |
| F-07/08 Query explosion | 47K rows fetched client-side, aggregated in JS |
