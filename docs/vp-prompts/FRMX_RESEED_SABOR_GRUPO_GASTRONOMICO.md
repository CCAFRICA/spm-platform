# FRMX RESEED: SABOR GRUPO GASTRONOMICO — FINANCIAL MODULE PROOF TENANT

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference for every Supabase query

**If you have not read both files, STOP and read them now.**

---

## WHY THIS PROMPT EXISTS

The Sabor Grupo Gastronomico tenant was previously built (OB-95, PR #89) and has since been wiped. This prompt re-establishes the tenant from scratch using the current schema. The original OB-95 seeded 64 entities, 47,051 POS cheques, 2 rule sets, and 7 financial dashboard pages — all backed by Supabase, zero localStorage.

This tenant proves **domain agnosticism**: the same `entities`, `committed_data`, `entity_relationships`, `rule_sets`, `calculation_results` tables that serve ICM compensation also serve restaurant franchise POS analytics. Zero new tables. Zero schema changes.

---

## TENANT IDENTITY

| Field | Value |
|-------|-------|
| Name | Sabor Grupo Gastronomico |
| Slug | `sabor-grupo` |
| Industry | Restaurant Franchise |
| Locale | `es-MX` |
| Currency | `MXN` |
| Modules | Financial + ICM (dual-module tenant) |
| HQ | Mazatlán, Sinaloa |

### Tenant Settings

```json
{
  "modules": ["icm", "financial"],
  "financial_config": {
    "pos_format": "softrestaurant_23col",
    "shift_definitions": {
      "morning": { "start": "07:00", "end": "15:00" },
      "afternoon": { "start": "15:00", "end": "23:00" },
      "night": { "start": "23:00", "end": "07:00" }
    },
    "tax_rate": 0.16,
    "brands": ["Cocina Dorada", "Taco Veloz", "Mar y Brasa"]
  }
}
```

### Hierarchy Labels

```json
{
  "level_0": "Red",
  "level_1": "Marca",
  "level_2": "Región",
  "level_3": "Sucursal",
  "level_4": "Mesero"
}
```

### Entity Type Labels

```json
{
  "organization": "Franquicia",
  "brand": "Marca",
  "region": "Región",
  "location": "Sucursal",
  "individual": "Mesero"
}
```

### Features

```json
{
  "icm": true,
  "financial": true,
  "import": true,
  "reconciliation": true,
  "disputes": true
}
```

---

## ENTITY HIERARCHY

### Organization (1)

| external_id | display_name | entity_type | metadata |
|-------------|-------------|-------------|----------|
| FRMX-HQ | Sabor Grupo Gastronomico | organization | `{"hq_city": "Mazatlán", "hq_state": "Sinaloa", "founded": 2015}` |

### Brands (3)

| external_id | display_name | entity_type | metadata |
|-------------|-------------|-------------|----------|
| FRMX-CD | Cocina Dorada | brand | `{"format": "Full-Service Dining", "concept": "casual_dining", "avg_check_target": 380}` |
| FRMX-TV | Taco Veloz | brand | `{"format": "Express/Fast-Casual", "concept": "fast_casual", "avg_check_target": 185}` |
| FRMX-MB | Mar y Brasa | brand | `{"format": "Premium Seafood & Grill", "concept": "premium_dining", "avg_check_target": 580}` |

### Regions (4)

| external_id | display_name | entity_type | metadata |
|-------------|-------------|-------------|----------|
| FRMX-REG-CENTRO | Centro | region | `{"states": ["CDMX", "Puebla", "Querétaro"]}` |
| FRMX-REG-NORTE | Norte | region | `{"states": ["Nuevo León", "Chihuahua"]}` |
| FRMX-REG-OCCIDENTE | Occidente | region | `{"states": ["Jalisco", "Guanajuato", "Sinaloa"]}` |
| FRMX-REG-SURESTE | Sureste | region | `{"states": ["Quintana Roo", "Yucatán", "Oaxaca"]}` |

### Locations (20)

Each location has `entity_type = 'location'` and metadata containing brand, city, state, format, embedded anomaly pattern, and customer tags (Oro/Expansión).

| external_id | display_name | Brand | City | State | Region | Pattern | Tags |
|-------------|-------------|-------|------|-------|--------|---------|------|
| FRMX-CD-CDMX-001 | Cocina Dorada Polanco | Cocina Dorada | CDMX | CDMX | Centro | Strong | `["Oro"]` |
| FRMX-CD-CDMX-002 | Cocina Dorada Roma | Cocina Dorada | CDMX | CDMX | Centro | Star | `["Oro"]` |
| FRMX-CD-GDL-001 | Cocina Dorada Guadalajara | Cocina Dorada | Guadalajara | Jalisco | Occidente | Declining (-5%/wk) | `[]` |
| FRMX-CD-MTY-001 | Cocina Dorada Monterrey | Cocina Dorada | Monterrey | Nuevo León | Norte | Strong | `["Oro"]` |
| FRMX-CD-PUE-001 | Cocina Dorada Puebla | Cocina Dorada | Puebla | Puebla | Centro | Normal | `[]` |
| FRMX-CD-CAN-001 | Cocina Dorada Cancún | Cocina Dorada | Cancún | Quintana Roo | Sureste | Seasonal/Weekend | `["Expansión"]` |
| FRMX-CD-QRO-001 | Cocina Dorada Querétaro | Cocina Dorada | Querétaro | Querétaro | Centro | Normal | `["Expansión"]` |
| FRMX-CD-OAX-001 | Cocina Dorada Oaxaca | Cocina Dorada | Oaxaca | Oaxaca | Sureste | Slow/Underperformer | `[]` |
| FRMX-TV-CDMX-001 | Taco Veloz Condesa | Taco Veloz | CDMX | CDMX | Centro | Strong | `["Oro"]` |
| FRMX-TV-CDMX-002 | Taco Veloz Coyoacán | Taco Veloz | CDMX | CDMX | Centro | Normal | `[]` |
| FRMX-TV-GDL-001 | Taco Veloz Guadalajara | Taco Veloz | Guadalajara | Jalisco | Occidente | Normal | `[]` |
| FRMX-TV-MTY-001 | Taco Veloz Monterrey | Taco Veloz | Monterrey | Nuevo León | Norte | High Cancellation (8%) | `[]` |
| FRMX-TV-TIJ-001 | Taco Veloz Tijuana | Taco Veloz | Tijuana | Baja California | Norte | Strong | `["Expansión"]` |
| FRMX-TV-LEO-001 | Taco Veloz León | Taco Veloz | León | Guanajuato | Occidente | Normal | `[]` |
| FRMX-TV-MER-001 | Taco Veloz Mérida | Taco Veloz | Mérida | Yucatán | Sureste | Slow/Underperformer | `[]` |
| FRMX-MB-CDMX-001 | Mar y Brasa Polanco | Mar y Brasa | CDMX | CDMX | Centro | Star | `["Oro"]` |
| FRMX-MB-CAN-001 | Mar y Brasa Cancún | Mar y Brasa | Cancún | Quintana Roo | Sureste | Seasonal/Tourist | `["Oro", "Expansión"]` |
| FRMX-MB-MTY-001 | Mar y Brasa Monterrey | Mar y Brasa | Monterrey | Nuevo León | Norte | Strong | `["Oro"]` |
| FRMX-MB-GDL-001 | Mar y Brasa Guadalajara | Mar y Brasa | Guadalajara | Jalisco | Occidente | Normal | `[]` |
| FRMX-MB-PUE-001 | Mar y Brasa Puebla | Mar y Brasa | Puebla | Puebla | Centro | Declining (-5%/wk) | `["Expansión"]` |

**Location metadata structure** (store in `metadata` JSONB on each location entity):

```json
{
  "brand": "Cocina Dorada",
  "brand_code": "CD",
  "city": "CDMX",
  "state": "CDMX",
  "region": "Centro",
  "format": "Full-Service Dining",
  "pattern": "Strong",
  "tags": ["Oro"],
  "avg_check_benchmark": 380,
  "daily_covers_target": 180,
  "staff_count": 4
}
```

### Servers/Staff (40 individuals)

Generate 40 server entities distributed across all 20 locations. Use realistic 4-part Mexican names. Each location gets 1-4 servers based on format:
- **Express locations (Taco Veloz):** 1-2 servers each
- **Dine-in (Cocina Dorada):** 2-3 servers each
- **Premium (Mar y Brasa):** 2-3 servers each

Each server entity has `entity_type = 'individual'` and metadata:

```json
{
  "role": "mesero",
  "location_id": "<external_id of their location>",
  "brand": "Cocina Dorada",
  "hire_date": "2023-XX-XX",
  "mesero_id": "MES-XXX"
}
```

**Star servers** (embed 2-3 across the network, assigned to Star-pattern locations):
- One at FRMX-CD-CDMX-002: consistently top 5% revenue, high tip rate
- One at FRMX-MB-CDMX-001: premium upselling, highest average check

### Entity Relationships

Create parent-child relationships in `entity_relationships` table:

```
Organization → each Brand (relationship_type: 'parent')
Each Brand → its Locations (relationship_type: 'parent')
Each Location → its Staff (relationship_type: 'parent')
```

Also create region assignments:
```
Each Region → its Locations (relationship_type: 'region_assignment')
```

Use `source: 'seeded'`, `confidence: 1.0`.

---

## PROFILES AND AUTH

Create 3 profiles linked to this tenant for demo persona switching:

| display_name | email | role | capabilities | Persona |
|-------------|-------|------|-------------|---------|
| Carlos Mendoza | admin@saborgrupo.mx | admin | `{"admin": true, "financial": true, "icm": true}` | Franchisor HQ / Corporate |
| Ana Martínez | gerente@saborgrupo.mx | manager | `{"manager": true, "financial": true}` | Location Manager |
| Diego Ramírez | mesero@saborgrupo.mx | sales_rep | `{"rep": true}` | Server / Individual |

**Auth users:** Create in Supabase Auth via the admin API or SQL. Link `auth_user_id` in profiles.

For each profile, also create the auth user:

```typescript
const { data: authUser } = await supabaseAdmin.auth.admin.createUser({
  email: 'admin@saborgrupo.mx',
  password: 'sabor-demo-2024',
  email_confirm: true
});
```

---

## PERIODS

Create periods for January 2024 (3 weekly periods + 1 monthly aggregate):

| label | period_type | status | start_date | end_date | canonical_key |
|-------|------------|--------|------------|----------|--------------|
| Semana 1 - Enero 2024 | weekly | closed | 2024-01-01 | 2024-01-07 | 2024-W01 |
| Semana 2 - Enero 2024 | weekly | closed | 2024-01-08 | 2024-01-14 | 2024-W02 |
| Semana 3 - Enero 2024 | weekly | closed | 2024-01-15 | 2024-01-21 | 2024-W03 |
| Enero 2024 | monthly | closed | 2024-01-01 | 2024-01-31 | 2024-01 |

---

## SEED POS CHEQUE DATA

### Data Model

All POS cheque records go into `committed_data` with:
- `data_type = 'pos_cheque'`
- `entity_id` → the location entity UUID
- `period_id` → the appropriate weekly period UUID
- `source_date` → the cheque date (business date)
- `row_data` → JSONB with the 23-column SoftRestaurant fields

### 23-Column SoftRestaurant Cheque Specification

Each cheque record in `row_data` JSONB must contain:

```json
{
  "folio": "CHQ-FRMX-CD-CDMX-001-20240102-0001",
  "fecha": "2024-01-02",
  "hora_apertura": "12:15",
  "hora_cierre": "13:42",
  "mesa": 12,
  "mesero_id": "MES-001",
  "mesero_nombre": "María Elena Gutiérrez Flores",
  "num_comensales": 3,
  "turno": "afternoon",
  "subtotal_alimentos": 685.00,
  "subtotal_bebidas": 210.00,
  "descuento": 0.00,
  "cortesia": 0.00,
  "cancelado": 0.00,
  "subtotal": 895.00,
  "iva": 143.20,
  "total": 1038.20,
  "propina": 155.73,
  "efectivo": 600.00,
  "tarjeta": 438.20,
  "forma_pago": "mixto",
  "sucursal_id": "FRMX-CD-CDMX-001",
  "tipo_servicio": "dine_in"
}
```

### Volume Targets

Generate approximately **47,000 cheques** across 21 days (January 1-21, 2024, 3 weeks):

| Brand | Locations | Avg Cheques/Day/Location | Avg Check (MXN) | Est. Total Cheques |
|-------|-----------|-------------------------|------------------|--------------------|
| Cocina Dorada | 8 | 80-120 | $350-410 | ~16,800 |
| Taco Veloz | 7 | 100-160 | $155-215 | ~19,110 |
| Mar y Brasa | 5 | 50-80 | $500-660 | ~6,825 |
| **Network** | **20** | | | **~42,735** |

Add ±15% daily variance. Weekend multiplier: 1.3x for all brands, 1.5x for Seasonal/Tourist locations.

### Embedded Anomaly Patterns

These patterns MUST be visible in the seeded data for dashboard demonstration:

| Location | Pattern | How to Implement |
|----------|---------|-----------------|
| FRMX-CD-OAX-001 | Slow/Underperformer | Revenue 25-35% below Cocina Dorada average. Fewer covers, lower check avg. |
| FRMX-TV-MER-001 | Slow/Underperformer | Revenue 20-30% below Taco Veloz average. |
| FRMX-CD-GDL-001 | Declining | Week 1 normal, Week 2 -5%, Week 3 -10% cumulative. Visible downward trend. |
| FRMX-MB-PUE-001 | Declining | Same pattern: -5%/week compounding decline. |
| FRMX-TV-MTY-001 | High Cancellation | Normal revenue but `cancelado` field averages 8% of subtotal (network avg ~2%). |
| FRMX-CD-CAN-001 | Seasonal/Weekend | Weekday revenue 40% lower than weekend. Saturday/Sunday spike to 1.5x. |
| FRMX-MB-CAN-001 | Seasonal/Tourist | Same weekend spike pattern, even more extreme (2x on weekends). |
| FRMX-CD-CDMX-002 | Star Location | Top revenue, highest tip rate, lowest cancellation rate. 2 star servers here. |
| FRMX-MB-CDMX-001 | Star Location | Highest average check in network. 1 star server here. |

### Shift Distribution

Each cheque has a `turno` field:
- Morning (07:00-15:00): 30% of daily volume
- Afternoon (15:00-23:00): 50% of daily volume (peak)
- Night (23:00-07:00): 20% of daily volume

### Payment Mix

- Cash (`efectivo`): 35-45% of total
- Card (`tarjeta`): 50-60% of total
- Mixed (`mixto`): 5-10% (both cash + card, amounts split)

### Tip Rate

- Network average: 12-15% of subtotal
- Star servers: 18-22%
- Underperforming locations: 8-10%
- Premium brand (Mar y Brasa): 15-18% baseline

### Leakage Metrics (for Leakage Monitor dashboard)

- Network average discount rate: 3-5% of subtotal
- Network average comp (cortesia) rate: 1-2% of subtotal
- Network average cancellation rate: 1.5-2.5% of subtotal
- FRMX-TV-MTY-001 cancellation: 7-9% (the anomaly)

### Bulk Insert

Insert cheques in batches of ≤5,000 rows. Use `crypto.randomUUID()` for all IDs.

---

## RULE SETS

### Rule Set 1: Performance Index (Financial Module)

This is NOT a compensation plan. It is a performance evaluation framework with weighted metrics and tier-based classification output.

```json
{
  "name": "Índice de Desempeño - Sucursales",
  "description": "Performance Index for franchise locations based on 4 weighted components",
  "status": "active",
  "effective_from": "2024-01-01",
  "effective_to": null,
  "components": {
    "revenue_efficiency": {
      "weight": 0.30,
      "metric": "revenue_per_shift_hour",
      "description": "Revenue per shift hour vs brand benchmark",
      "output_type": "score_0_100"
    },
    "service_quality": {
      "weight": 0.25,
      "metric": "avg_check_x_tip_rate",
      "description": "Average check amount × tip rate percentage",
      "output_type": "score_0_100"
    },
    "operational_discipline": {
      "weight": 0.25,
      "metric": "inverse_cancellation_rate",
      "description": "Inverse of cancellation + comp rate (lower leakage = higher score)",
      "output_type": "score_0_100"
    },
    "volume": {
      "weight": 0.20,
      "metric": "covers_per_shift",
      "description": "Number of covers (comensales) per shift vs target",
      "output_type": "score_0_100"
    }
  },
  "outcome_config": {
    "output_type": "tier_classification",
    "tiers": {
      "estrella": { "min": 85, "label": "Estrella", "color": "#FFD700" },
      "destacado": { "min": 70, "max": 84, "label": "Destacado", "color": "#4CAF50" },
      "estandar": { "min": 50, "max": 69, "label": "Estándar", "color": "#2196F3" },
      "en_desarrollo": { "max": 49, "label": "En Desarrollo", "color": "#FF9800" }
    }
  },
  "population_config": {
    "entity_type": "location",
    "scope": "all_locations"
  },
  "metadata": {
    "module": "financial",
    "domain": "restaurant_franchise",
    "cadence": "weekly"
  }
}
```

### Rule Set 2: Server Commission (ICM Module — bridges Financial to ICM)

This IS a compensation plan, proving the same engine handles both modules.

```json
{
  "name": "Comisión por Ventas - Meseros",
  "description": "Tiered commission on net server sales. Bridges Financial data to ICM payouts.",
  "status": "active",
  "effective_from": "2024-01-01",
  "effective_to": null,
  "components": {
    "base_commission": {
      "type": "tiered_rate",
      "tiers": [
        { "min": 0, "max": 50000, "rate": 0.02 },
        { "min": 50001, "max": 100000, "rate": 0.03 },
        { "min": 100001, "rate": 0.04 }
      ],
      "basis": "net_server_sales",
      "description": "2% on first $50K, 3% on $50K-$100K, 4% above $100K"
    },
    "tip_bonus": {
      "type": "threshold_bonus",
      "threshold": 0.15,
      "metric": "tip_rate",
      "bonus": 500,
      "description": "MX$500 bonus if tip rate exceeds 15%"
    }
  },
  "population_config": {
    "entity_type": "individual",
    "scope": "all_servers"
  },
  "outcome_config": {
    "output_type": "monetary",
    "currency": "MXN"
  },
  "metadata": {
    "module": "icm",
    "domain": "restaurant_franchise",
    "cadence": "monthly"
  }
}
```

### Rule Set Assignments

Assign Rule Set 1 (Performance Index) to ALL 20 location entities.
Assign Rule Set 2 (Server Commission) to ALL 40 server/individual entities.

Use `rule_set_assignments` table. `assignment_type = 'direct'`.

---

## CALCULATION RESULTS

### For Performance Index (Rule Set 1 — 20 locations)

Pre-calculate and seed `calculation_results` for each location for the monthly period (Enero 2024). Derive scores from the actual seeded cheque data:

- **Revenue Efficiency**: Sum location revenue / (shifts × hours). Score = (actual / benchmark) × 100, capped at 100.
- **Service Quality**: (avg_check × avg_tip_rate) / brand_target × 100, capped at 100.
- **Operational Discipline**: (1 - cancellation_and_comp_rate) × 100. Network avg ~96-98. High-cancellation location ~91-93.
- **Volume**: total_covers / (days × daily_target) × 100.
- **Weighted Total**: Sum of (component_score × weight).

Expected tier distribution from embedded patterns:
- Estrella (85+): 3-4 locations (FRMX-CD-CDMX-002, FRMX-MB-CDMX-001, FRMX-CD-CDMX-001, FRMX-TV-CDMX-001)
- Destacado (70-84): 8-10 locations (most Strong/Normal patterns)
- Estándar (50-69): 4-5 locations (Normal/Seasonal patterns)
- En Desarrollo (<50): 2-3 locations (Underperformers + deep decliners)

Store in `calculation_results`:
```json
{
  "total_payout": 0,
  "components": {
    "revenue_efficiency": { "score": 87, "weight": 0.30, "weighted": 26.1 },
    "service_quality": { "score": 82, "weight": 0.25, "weighted": 20.5 },
    "operational_discipline": { "score": 97, "weight": 0.25, "weighted": 24.25 },
    "volume": { "score": 78, "weight": 0.20, "weighted": 15.6 }
  },
  "metrics": {
    "revenue_per_shift_hour": 4250.00,
    "avg_check": 395.00,
    "avg_tip_rate": 0.145,
    "cancellation_rate": 0.018,
    "total_covers": 2340,
    "total_revenue": 924300.00
  },
  "attainment": {
    "weighted_score": 86.45,
    "tier": "Estrella",
    "tier_key": "estrella"
  }
}
```

### For Server Commission (Rule Set 2 — 40 servers)

Pre-calculate monthly commission for each server. Use the seeded cheque data to derive each server's net sales (sum of `subtotal` for cheques where `mesero_id` matches).

Store in `calculation_results` with `total_payout` as the actual MXN commission amount.

### Calculation Batch

Create one `calculation_batches` record:
- `batch_type`: 'standard'
- `lifecycle_state`: 'APPROVED'
- `period_id`: monthly period UUID
- `entity_count`: 60 (20 locations + 40 servers)

---

## FINANCIAL DASHBOARD PAGES

All 7 financial pages must exist and render with real Supabase-backed data. All query `committed_data` WHERE `tenant_id` = sabor-grupo tenant AND `data_type = 'pos_cheque'`.

### Page 1: Network Pulse (`/financial`)

The landing page. Shows network-level health at a glance.

**Components:**
- 6 metric cards: Total Revenue, Avg Check, Total Covers, Tip Rate, Leakage Rate, Active Locations
- Location grid: 20 tiles, one per location, color-coded by Performance Index tier (Estrella=gold, Destacado=green, Estándar=blue, En Desarrollo=orange)
- Brand comparison: 3-column summary (Cocina Dorada vs Taco Veloz vs Mar y Brasa) showing revenue, avg check, tip rate, covers
- All amounts formatted as MXN (MX$ with comma separators, no cents per PDR-01)

### Page 2: Location Benchmarks (`/financial/performance`)

**Components:**
- Sortable table with 20 rows (one per location)
- 10 columns: Location Name, Brand, City, Revenue, Avg Check, Covers, Tip Rate, Leakage %, Performance Score, Tier Badge
- Sparklines on Revenue column (3-week trend from weekly periods)
- Sort by any column. Default sort: Performance Score descending
- Color-coded tier badge in last column

### Page 3: Revenue Timeline (`/financial/timeline`)

**Components:**
- Configurable line/bar chart
- Granularity selector: Day / Week / Month
- Metric selector: Revenue / Avg Check / Covers / Tip Rate
- Scope selector: Network / Brand / Region / Location
- YoY comparison toggle (shows prior year if data exists — for seed, show placeholder)
- Default view: Daily revenue across network for January 2024

### Page 4: Staff Leaderboard (`/financial/staff`)

**Components:**
- Ranked table of 40 servers
- Columns: Rank, Name, Location, Brand, Net Sales, Commission, Tip Rate, Covers, Performance Index Score
- Top 3 highlighted with gold/silver/bronze badge
- Star servers should naturally rank in top 5
- Filterable by brand, location, region

### Page 5: Leakage Monitor (`/financial/leakage`)

**Components:**
- 3 leakage categories (Discounts, Comps, Cancellations) — NOT 5, because POS data only supports 3
- Network total leakage amount and rate
- Per-location leakage breakdown (sortable table)
- FRMX-TV-MTY-001 should be flagged/highlighted as anomaly (8% cancellation vs ~2% network avg)
- Trend chart showing leakage rate over 3 weeks

### Page 6: Operational Patterns (`/financial/patterns`)

**Components:**
- Hourly heatmap: 24 hours × 7 days, color intensity = revenue or covers
- Peak identification: highlight busiest hours/days
- Day-of-week analysis: bar chart showing Mon-Sun revenue distribution
- Shift analysis: Morning/Afternoon/Night revenue split
- Brand filter: show patterns by brand

### Page 7: Monthly Operating Summary (`/financial/summary`)

**Components:**
- P&L-style table showing:
  - Gross Sales (Alimentos + Bebidas)
  - Less: Discounts, Comps, Cancellations
  - Net Sales
  - IVA (16%)
  - Total with Tax
  - Tips collected
  - Payment breakdown: Cash / Card / Mixed
- Network-level and per-brand columns
- Per-location drill-down available

---

## IMPORTABLE DEMO FILES

Generate 3 TSV files in the project for normalization demo purposes. Place in `web/public/demo-data/frmx/`:

### File 1: `cheques_20240122_clean.tsv`
- Week 4 data, ~18,000 records
- Standard 23-column format with clean Spanish column headers
- No normalization challenges — baseline import

### File 2: `cheques_20240129_english.tsv`
- Week 5 data, ~18,000 records
- Same 23 columns but with ENGLISH column headers (e.g., "receipt_number" instead of "folio", "date" instead of "fecha")
- Proves AI field mapping handles language variation

### File 3: `cheques_20240205_messy.tsv`
- Week 6 data, ~18,000 records
- Mixed column headers (some Spanish, some English, some abbreviated)
- Some columns renamed ("vta_comida" instead of "subtotal_alimentos")
- Includes a 24th column: `descripcion_producto` with the messy product names per the normalization specification (each location uses different naming conventions)
- This is the normalization showcase file

---

## IMPLEMENTATION PHASES

### Phase 0: Diagnostic

Before creating anything, run diagnostic queries to understand current state:

```typescript
// Run via: npx tsx scripts/diagnostic-sabor.ts
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 1. Check if sabor-grupo tenant already exists
const { data: tenant } = await sb.from('tenants').select('*').eq('slug', 'sabor-grupo');
console.log('Existing sabor-grupo tenant:', tenant);

// 2. Check entity counts per tenant
const { data: entities } = await sb.from('entities').select('tenant_id, entity_type');
const counts: Record<string, Record<string, number>> = {};
entities?.forEach(e => {
  counts[e.tenant_id] = counts[e.tenant_id] || {};
  counts[e.tenant_id][e.entity_type] = (counts[e.tenant_id][e.entity_type] || 0) + 1;
});
console.log('Entity counts by tenant:', JSON.stringify(counts, null, 2));

// 3. Check committed_data counts
const { count } = await sb.from('committed_data').select('*', { count: 'exact', head: true });
console.log('Total committed_data rows:', count);

// 4. Check rule_sets
const { data: ruleSets } = await sb.from('rule_sets').select('id, name, tenant_id, status');
console.table(ruleSets);

// 5. Check existing profiles
const { data: profiles } = await sb.from('profiles').select('id, display_name, email, tenant_id, role');
console.table(profiles);
```

If sabor-grupo tenant exists, delete all its data (entities, committed_data, rule_sets, rule_set_assignments, calculation_results, calculation_batches, entity_relationships, profiles, periods) before re-seeding. Use cascading deletes or delete in reverse dependency order.

**Commit:** `git add -A && git commit -m "FRMX Reseed Phase 0: Diagnostic" && git push origin dev`

### Phase 1: Create Tenant + Periods

Insert the tenant row with all settings, hierarchy_labels, entity_type_labels, features as specified above. Create the 4 period rows.

**Proof Gate:** `SELECT * FROM tenants WHERE slug = 'sabor-grupo'` returns 1 row. `SELECT COUNT(*) FROM periods WHERE tenant_id = '<UUID>'` returns 4.

**Commit:** `git add -A && git commit -m "FRMX Reseed Phase 1: Tenant + Periods" && git push origin dev`

### Phase 2: Create Entity Hierarchy

Insert all entities: 1 org + 3 brands + 4 regions + 20 locations + 40 servers = 68 entities.
Insert all entity_relationships: org→brands, brands→locations, locations→servers, regions→locations.

**Proof Gate:** `SELECT entity_type, COUNT(*) FROM entities WHERE tenant_id = '<UUID>' GROUP BY entity_type` returns organization:1, brand:3, region:4, location:20, individual:40.

**Commit:** `git add -A && git commit -m "FRMX Reseed Phase 2: Entity Hierarchy (68 entities)" && git push origin dev`

### Phase 3: Create Profiles + Auth Users

Create 3 auth users and 3 linked profiles as specified.

**Proof Gate:** 3 profiles with correct roles and tenant_id.

**Commit:** `git add -A && git commit -m "FRMX Reseed Phase 3: Profiles + Auth" && git push origin dev`

### Phase 4: Seed POS Cheque Data

Generate and insert ~47,000 POS cheques into `committed_data`. Implement all embedded anomaly patterns. Bulk insert in ≤5,000 row batches.

**Proof Gates:**
- `SELECT COUNT(*) FROM committed_data WHERE tenant_id = '<UUID>' AND data_type = 'pos_cheque'` returns ~47,000
- `SELECT COUNT(*) FROM committed_data WHERE tenant_id = '<UUID>' AND row_data->>'sucursal_id' = 'FRMX-TV-MTY-001' AND (row_data->>'cancelado')::numeric > 0` shows elevated cancellations
- Revenue by brand query returns Cocina Dorada > Taco Veloz (by avg check) but Taco Veloz > Cocina Dorada (by volume)

**Commit:** `git add -A && git commit -m "FRMX Reseed Phase 4: 47K POS Cheques Seeded" && git push origin dev`

### Phase 5: Create Rule Sets + Assignments

Insert both rule sets. Create 60 rule_set_assignments (20 locations → Performance Index, 40 servers → Server Commission).

**Proof Gate:** 2 rule sets, 60 assignments.

**Commit:** `git add -A && git commit -m "FRMX Reseed Phase 5: Rule Sets + Assignments" && git push origin dev`

### Phase 6: Seed Calculation Results

Create calculation batch. Calculate and insert 60 calculation_results (20 location scores + 40 server commissions) derived from actual seeded data.

**Proof Gate:** 60 calculation_results, batch lifecycle_state = 'APPROVED'.

**Commit:** `git add -A && git commit -m "FRMX Reseed Phase 6: Calculation Results" && git push origin dev`

### Phase 7: Financial Dashboard Pages

Verify all 7 financial pages exist and render with Supabase-backed data. If any pages are missing or broken, create/fix them. All pages must:
- Query `committed_data` with tenant filter
- Format amounts as MXN (MX$ with comma separators, no cents)
- Use the location/brand/server entities for labels and grouping
- Read Performance Index tiers from calculation_results

Check these routes exist and render:
1. `/financial` — Network Pulse
2. `/financial/performance` — Location Benchmarks
3. `/financial/timeline` — Revenue Timeline
4. `/financial/staff` — Staff Leaderboard
5. `/financial/leakage` — Leakage Monitor
6. `/financial/patterns` — Operational Patterns
7. `/financial/summary` — Monthly Operating Summary

If the financial data service (`financial-data-service.ts` or equivalent) needs updating to query Supabase instead of localStorage, update it.

**Proof Gate:** All 7 routes return 200. Each page renders data (not empty containers).

**Commit:** `git add -A && git commit -m "FRMX Reseed Phase 7: Financial Dashboard Verification" && git push origin dev`

### Phase 8: Importable Demo Files

Generate the 3 TSV files and place in `web/public/demo-data/frmx/`.

**Proof Gate:** 3 files exist with correct record counts.

**Commit:** `git add -A && git commit -m "FRMX Reseed Phase 8: Demo Import Files" && git push origin dev`

### Phase 9: Dual-Module Wiring Verification

Verify that when logged in as admin@saborgrupo.mx:
- Tenant picker shows "Sabor Grupo Gastronomico"
- Sidebar shows both Financial and ICM navigation items
- Financial pages show restaurant POS data
- ICM Operate/Perform pages show Server Commission rule set
- Both modules use the same underlying data

**Proof Gate:** Sidebar renders both module nav items. Both `/financial` and `/operate` load without errors.

**Commit:** `git add -A && git commit -m "FRMX Reseed Phase 9: Dual-Module Verification" && git push origin dev`

### Phase 10: Build + PR

```bash
cd /Users/AndrewAfrica/spm-platform
kill dev server if running
rm -rf .next
npm run build
npm run dev
# Confirm localhost:3000 responds
# Navigate to sabor-grupo tenant, verify financial pages render

git add -A
git commit -m "FRMX Reseed Complete: Sabor Grupo Gastronomico — 68 entities, ~47K cheques, 7 dashboards, dual-module"
git push origin dev

gh pr create --base main --head dev \
  --title "FRMX Reseed: Sabor Grupo Gastronomico Financial Module Proof Tenant" \
  --body "## What This PR Delivers

### Domain-Agnostic Proof
Same entities + committed_data + calculation_results tables serve both ICM compensation
and restaurant POS analytics — zero new tables, zero schema changes.

### Sabor Grupo Gastronomico Tenant
- 3 brands: Cocina Dorada (full-service), Taco Veloz (express), Mar y Brasa (seafood)
- 20 locations across 4 regions and 10 states
- 40 servers with POS-assigned mesero IDs
- Customer tags: Oro (flagship), Expansión (new openings)
- ~47,000 POS cheque records (January 2024, 3 weeks)
- 9 embedded anomaly patterns for dashboard demonstration

### Dual Module
- ICM: Server commission calculation (tiered rate table on server net sales)
- Financial: Performance Index (4-component weighted scoring with tier classification)
- Both rule sets active — same engine, different outcomes

### Financial Dashboards (7 pages, all Supabase-backed)
- Network Pulse: 6 metric cards, location grid, brand comparison
- Location Benchmarks: 20-location sortable table with sparklines
- Revenue Timeline: Day/Week/Month granularity with YoY
- Staff Leaderboard: 40 servers ranked by composite score
- Leakage Monitor: Discounts + comps + cancellations by location
- Operational Patterns: Hourly heatmap + day-of-week analysis
- Monthly Summary: Full P&L table with cash/card breakdown

### Importable Demo Files
- 3 TSV files with format diversity (clean, English headers, messy mixed)
- Proves AI field mapping handles format variation

### All amounts MXN. All labels domain-agnostic. Zero hardcoded field names."
```

---

## SCOPE BOUNDARIES

### IN SCOPE
- Sabor Grupo Gastronomico tenant with dual modules (ICM + Financial)
- Entity hierarchy: organization → brands → regions → locations → staff (68 entities)
- Customer tags (Oro, Expansión) on location entities
- ~47,000 POS cheque records seeded into committed_data
- Performance Index rule set (tier classification output)
- Server Commission rule set (monetary payout output)
- 7 financial dashboard pages (all Supabase-backed)
- 3 importable TSV files for normalization demo
- 60 calculation results (20 location scores + 40 server commissions)
- Dual-module sidebar + plan selector wiring
- All financial data in MXN with es-MX locale

### OUT OF SCOPE — DO NOT BUILD
- Normalization dictionary/review UI (import pipeline exists, files prove format diversity)
- Item-level POS data or product analytics views (requires separate data source)
- Franchise fee calculation (future module feature)
- Tip pool distribution logic (future)
- Mobile server persona views (future)
- POS API integration (future — batch file import is the current model)
- Budget/target data import (future data source)
- New Supabase tables — use existing entity/committed_data model with data_type discriminator

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Correct Pattern |
|---|---|---|
| AP-1 | Create financial_locations or financial_cheques tables | Use `entities` + `committed_data` with `data_type` discriminator |
| AP-2 | Hardcode brand names in dashboard code | Read from entity metadata |
| AP-3 | USD formatting on financial pages | Read `tenant.currency`, format as MXN |
| AP-4 | localStorage for any financial data | Supabase only. Zero localStorage references. |
| AP-5 | Sequential per-cheque database inserts | Bulk insert ≤5,000 rows per batch |
| AP-6 | Hardcoded benchmark values in UI | Read from brand entity metadata or rule_set metadata |
| AP-7 | Separate calculation pipeline for financial | Same engine. Same rule_sets table. Same calculation_results. |
| AP-8 | Component-level Supabase calls in dashboards | Financial data service + page loaders |
| AP-9 | ICM-specific terminology in shared surfaces | "Components" not "Commission Components". "Outcomes" not "Payouts" on shared surfaces. |
| AP-25 | Hardcoded field names or language-specific string matching | Structural heuristics only. Korean Test. |

---

## QUICK CHECKLIST (Before Completion Report)

```
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ All Supabase data verified with DB query?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Browser console clean on localhost?
□ Real data displayed, no placeholders?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
□ MXN formatting throughout financial pages?
□ All 7 financial routes return 200?
□ Dual-module sidebar renders correctly?
□ 68 entities, ~47K cheques, 60 calc results — counts verified?
```

---

## CC PASTE BLOCK

*This section is the last content in this document. Nothing follows.*
