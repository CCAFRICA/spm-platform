# OB-95: FINANCIAL AGENT — SABOR GRUPO GASTRONOMICO DUAL-MODULE TENANT

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query

**If you have not read both files, STOP and read them now.**

---

## WHY THIS OB EXISTS

Vialuce's core value proposition is domain-agnostic performance intelligence. The ICM vertical is proven — 100% calculation accuracy, 719 entities, 6 components. But "domain-agnostic" is just a claim until a second domain runs on the same engine.

This OB builds the Financial Agent — a complete restaurant franchise performance management module — and proves it runs on the same Foundational Agents (data import, entity resolution, calculation engine, reconciliation) with a different Domain Agent. One tenant, two modules, same platform.

**The tenant:** Sabor Grupo Gastronomico — a fictional Mexican restaurant franchisor with 3 brands, 20 locations, 40 servers across 4 regions.

**What it proves:**
1. Same entity model → different entity types (locations, servers instead of sales reps)
2. Same calculation engine → different outcomes (Performance Index tiers, not commission payouts)
3. Same import pipeline → different data format (POS cheques, not sales transactions)
4. Same reconciliation → different benchmark (POS system reports, not spreadsheet ground truth)
5. Both ICM and Financial active on one tenant — the navigation, sidebar, and workspace system handle it

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Fix logic, not data.** Do not insert answer values. Let the engine derive results.
7. **Domain-agnostic always.** The Financial Agent uses the SAME engine infrastructure — it does NOT create parallel pipelines.
8. **Korean Test on all code.** Would this work for a Korean franchise? If not, it's hardcoded.
9. **Supabase .in() ≤ 200 items.** Batch larger sets.
10. **Zero component-level Supabase calls (Standing Rule 26).** Components render props. Pages load via contexts/loaders.

---

## ENTITY MODEL — SABOR GRUPO GASTRONOMICO

### Organization Hierarchy

```
Sabor Grupo Gastronomico (franchisor — entity_type: 'organization')
├── Fuego Dorado (brand — entity_type: 'brand')
│   ├── FD-CDMX-001 Fuego Dorado Polanco (entity_type: 'location')
│   ├── FD-CDMX-002 Fuego Dorado Condesa
│   ├── FD-MTY-001 Fuego Dorado San Pedro
│   ├── FD-GDL-001 Fuego Dorado Chapultepec
│   ├── FD-GDL-002 Fuego Dorado Providencia
│   ├── FD-CUN-001 Fuego Dorado Zona Hotelera
│   ├── FD-PUE-001 Fuego Dorado Angelópolis
│   └── FD-QRO-001 Fuego Dorado Juriquilla
├── Rápido Verde (brand — entity_type: 'brand')
│   ├── RV-CDMX-001 Rápido Verde Roma
│   ├── RV-CDMX-002 Rápido Verde Coyoacán
│   ├── RV-MTY-001 Rápido Verde Garza García
│   ├── RV-MTY-002 Rápido Verde Cumbres
│   ├── RV-GDL-001 Rápido Verde Tlaquepaque
│   ├── RV-TIJ-001 Rápido Verde Zona Río
│   └── RV-LEO-001 Rápido Verde Centro Max
└── Costa Azul (brand — entity_type: 'brand')
    ├── CA-CUN-001 Costa Azul Malecón
    ├── CA-CUN-002 Costa Azul Puerto Juárez
    ├── CA-PVR-001 Costa Azul Marina Vallarta
    ├── CA-MAZ-001 Costa Azul Playa Norte
    └── CA-VER-001 Costa Azul Boca del Río
```

**Regions:** Centro (CDMX, PUE, QRO), Norte (MTY, TIJ, LEO), Occidente (GDL), Sureste (CUN, PVR, MAZ, VER)

### Location Metadata (stored in entities.metadata JSONB)

```typescript
interface LocationMetadata {
  brand: string;           // 'fuego_dorado' | 'rapido_verde' | 'costa_azul'
  brand_display: string;   // 'Fuego Dorado'
  format: string;          // 'full_service' | 'express' | 'seafood'
  region: string;          // 'centro' | 'norte' | 'occidente' | 'sureste'
  state: string;           // 'CDMX' | 'NL' | 'JAL' | 'QROO' | 'PUE' | 'QRO' | 'SIN' | 'VER' | 'BCN' | 'GTO'
  city: string;            // 'Ciudad de México' | 'Monterrey' | etc.
  capacity_tables: number; // 25-65
  pos_system: string;      // 'softrestaurant_v11' | 'softrestaurant_v12' | 'icg'
  status: string;          // 'active' | 'inactive' | 'temporarily_closed'
  tags: Record<string, string | boolean>; // { "Oro": true, "Expansión": true }
  nickname?: string;       // Short display alias
}
```

**Tag assignments for seed:**
- **Oro** (6 locations): FD-CDMX-001, FD-MTY-001, FD-CUN-001, CA-CUN-001, CA-PVR-001, RV-CDMX-001
- **Expansión** (4 locations): FD-QRO-001, RV-TIJ-001, RV-LEO-001, CA-VER-001
- **Both** (1 location): CA-MAZ-001 (new flagship)
- **Neither** (9 locations): the rest (established steady-state)

### Staff Entities (entity_type: 'individual')

40 servers across 20 locations (2 per location). Each server has:

```typescript
interface StaffMetadata {
  location_id: string;     // external_id of parent location
  role: string;            // 'server' | 'shift_manager'
  hire_date: string;       // ISO date
  shift_pattern: number;   // default turno_id (1=morning, 2=afternoon, 3=night)
  mesero_id: number;       // POS system server ID
}
```

### Entity Relationships

Use the existing `entity_relationships` table (or create via committed_data if no dedicated table exists):
- Organization → Brand (parent relationship)
- Brand → Location (parent relationship)
- Location → Staff (reports_to relationship)

---

## POS CHEQUE DATA MODEL

POS cheque data enters the platform through committed_data, just like ICM transaction data. The data_type distinguishes them.

### Committed Data Format

Each POS cheque record is stored as one row in `committed_data`:

```
data_type: 'pos_cheque'
row_data: {
  numero_franquicia: 'FD-CDMX-001',
  turno_id: 2,
  folio: 10547,
  numero_cheque: 3842,
  fecha: '2024-01-15T14:23:00',
  cierre: '2024-01-15T15:45:00',
  numero_de_personas: 4,
  mesero_id: 1001,
  pagado: 1,
  cancelado: 0,
  total_articulos: 12,
  total: 1680.00,
  efectivo: 800.00,
  tarjeta: 880.00,
  propina: 252.00,
  descuento: 0.00,
  subtotal: 1448.28,
  subtotal_con_descuento: 1448.28,
  total_impuesto: 231.72,
  total_descuentos: 0.00,
  total_cortesias: 0.00,
  total_alimentos: 1200.00,
  total_bebidas: 480.00
}
```

The entity_id on each committed_data row links to the location entity. The mesero_id inside row_data links to the staff entity via staff metadata.

---

## PERFORMANCE FRAMEWORK (RULE SET)

This is NOT a compensation plan. It is a performance evaluation framework stored as a rule_set, proving the engine handles non-monetary outcomes.

### Rule Set: "Índice de Desempeño — Sabor Grupo Gastronomico"

```
components: [
  {
    name: "Eficiencia de Ingresos",
    name_en: "Revenue Efficiency",
    weight: 0.30,
    metric: "revenue_per_shift_hour",
    calculation: "SUM(total WHERE pagado=1 AND cancelado=0) / shift_hours",
    output_type: "score_0_100"
  },
  {
    name: "Calidad de Servicio",
    name_en: "Service Quality",
    weight: 0.25,
    metric: "avg_check_times_tip_rate",
    calculation: "(subtotal / numero_de_personas) * (propina / subtotal)",
    output_type: "score_0_100"
  },
  {
    name: "Disciplina Operativa",
    name_en: "Operational Discipline",
    weight: 0.25,
    metric: "inverse_cancellation_rate",
    calculation: "100 - ((COUNT(cancelado=1) / COUNT(*)) * 100)",
    output_type: "score_0_100"
  },
  {
    name: "Volumen",
    name_en: "Volume",
    weight: 0.20,
    metric: "covers_per_shift",
    calculation: "SUM(numero_de_personas) / shifts_worked",
    output_type: "score_0_100"
  }
]

outcome_config: {
  type: "tier_classification",
  tiers: [
    { label: "Estrella", label_en: "Star", min_score: 85, max_score: 100, action: "Quarterly bonus + public recognition + schedule priority" },
    { label: "Destacado", label_en: "Outstanding", min_score: 70, max_score: 84, action: "Partial quarterly bonus + monthly meeting mention" },
    { label: "Estándar", label_en: "Standard", min_score: 50, max_score: 69, action: "Individual development plan with monthly follow-up" },
    { label: "En Desarrollo", label_en: "Developing", min_score: 0, max_score: 49, action: "Immediate improvement plan with biweekly review" }
  ]
}
```

### Brand-Specific Benchmarks (stored in rule_set metadata)

Each brand has different benchmark targets based on their service format:

| Brand | Format | Revenue/Hr Benchmark | Avg Check Benchmark | Tip % Benchmark | Cancel % Max |
|-------|--------|---------------------|--------------------|-----------------|----|
| Fuego Dorado | Full-Service | MX$850/hr | MX$420 | 12% | ≤2.5% |
| Rápido Verde | Express | MX$1,200/hr | MX$185 | 5% | ≤4.0% |
| Costa Azul | Seafood | MX$780/hr | MX$580 | 15% | ≤2.0% |

---

## SERVER COMMISSION PLAN (ICM BRIDGE)

This is the ICM rule set that proves "one import, two modules." The same POS data that feeds the Performance Index also feeds server commission calculations.

### Rule Set: "Comisión por Ventas — Meseros"

```
components: [
  {
    name: "Comisión Base por Ventas",
    name_en: "Base Sales Commission",
    weight: 1.0,
    metric: "server_net_sales",
    calculation: "SUM(total WHERE pagado=1 AND cancelado=0 AND mesero_id=entity)",
    rate_table: [
      { min: 0, max: 25000, rate: 0.02 },      // 2% on first MX$25K
      { min: 25001, max: 50000, rate: 0.03 },   // 3% on MX$25K-50K
      { min: 50001, max: null, rate: 0.04 }      // 4% above MX$50K
    ],
    output_type: "monetary_mxn"
  }
]

outcome_config: {
  type: "monetary_payout",
  currency: "MXN"
}
```

This rule set is assigned to all 40 server entities. The calculation engine processes it exactly the same way it processes Optical Sales commissions for Pipeline Test Co.

---

## SEED DATA SPECIFICATION

### Cheque Volume

Generate 3 weeks of POS data (January 1-21, 2024) across 20 locations:

| Brand | Locations | Avg Cheques/Day/Location | Total ≈ |
|-------|-----------|------------------------|---------|
| Fuego Dorado | 8 | 80-120 (full-service) | ~16,800 |
| Rápido Verde | 7 | 120-180 (express, higher volume) | ~22,050 |
| Costa Azul | 5 | 60-90 (seafood, lower volume) | ~7,875 |
| **Total** | **20** | | **~46,700** |

### Data Patterns to Seed

**Normal locations (14):** Realistic distribution — 3 shifts, proper cash/card split (~40/60), tip rates matching brand benchmarks, cancellation rate 1.5-3%.

**Anomaly locations (6):** These create the stories for the demo:

| Location | Anomaly | Expected Detection |
|----------|---------|-------------------|
| RV-MTY-002 (Rápido Verde Cumbres) | 8% cancellation rate (brand max: 4%) | Leakage Monitor flags red |
| FD-GDL-002 (Fuego Dorado Providencia) | Server 2008 has 1.8% tip rate (brand avg: 12%) | Staff Leaderboard flags |
| CA-MAZ-001 (Costa Azul Playa Norte) | Revenue 25% below brand average | Network Pulse / Benchmarks flags |
| RV-TIJ-001 (Rápido Verde Zona Río) | 85% cash transactions (network avg: 40%) | Payment method anomaly |
| FD-CUN-001 (Fuego Dorado Zona Hotelera) | One server handles 45% of all checks | Concentration anomaly |
| CA-VER-001 (Costa Azul Boca del Río) | Night shift revenue 3x afternoon (unusual) | Time pattern anomaly |

### Cheque Generation Rules

For each cheque:
1. **fecha:** Random timestamp within shift hours (Shift 1: 07:00-15:00, Shift 2: 15:00-23:00, Shift 3: 23:00-07:00)
2. **cierre:** fecha + 30-90 minutes (random)
3. **numero_de_personas:** 1-8 (weighted: 2-person most common)
4. **mesero_id:** Assigned from the 2 servers at that location, weighted by shift_pattern
5. **pagado:** 1 (99% of cheques), 0 for cancelled
6. **cancelado:** Based on location cancellation rate
7. **total:** Brand-specific range (FD: MX$300-800, RV: MX$100-350, CA: MX$400-1200)
8. **efectivo/tarjeta:** Split based on location cash ratio
9. **propina:** Brand tip rate × subtotal (with variance)
10. **descuento:** 0 for 90% of cheques, 10-20% discount for the rest
11. **subtotal:** total / 1.16 (IVA 16%)
12. **total_impuesto:** total - subtotal
13. **total_alimentos / total_bebidas:** Brand-specific food:bev ratio (FD: 70/30, RV: 80/20, CA: 60/40)
14. **total_cortesias:** 0 for 97% of cheques, small amount for rest
15. **folio/numero_cheque:** Sequential per location per day

---

## IMPORTABLE POS FILES FOR NORMALIZATION DEMO

In addition to the seed data, generate 3 TSV files that can be uploaded through Smart Import to demonstrate the normalization workflow.

### File 1: `cheques_20240122_FD-GDL-001.txt` — Clean baseline
- ~120 cheques, 1 day
- Standard SoftRestaurant format, clean Spanish headers
- No normalization needed — demonstrates "import just works"

### File 2: `cheques_20240122_RV-MTY-001.txt` — English abbreviations
- ~150 cheques, 1 day
- Product descriptions in English abbreviations in a companion items column (if included) or mesero names with English nicknames
- Column headers slightly different from standard (e.g., "check_num" instead of "numero_cheque", "server" instead of "mesero_id")
- Triggers AI field mapping + normalization review

### File 3: `cheques_20240122_CA-CUN-001.txt` — Messy mixed format
- ~80 cheques, 1 day
- Mix of Spanish/English column headers
- Some numeric columns formatted as text with currency symbols ("$1,680.00" instead of 1680.00)
- Extra columns not in standard spec (ignored by import)
- Demonstrates the platform handling "real world" data chaos

**Tab-delimited format (23 columns matching SoftRestaurant spec):**
```
numero_franquicia	turno_id	folio	numero_cheque	fecha	cierre	numero_de_personas	mesero_id	pagado	cancelado	total_articulos	total	efectivo	tarjeta	propina	descuento	subtotal	subtotal_con_descuento	total_impuesto	total_descuentos	total_cortesias	total_alimentos	total_bebidas
```

---

## PHASE 0: DIAGNOSTIC — MAP CURRENT STATE

```bash
echo "============================================"
echo "OB-95 PHASE 0: FINANCIAL AGENT DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: EXISTING FINANCIAL MODULE PAGES ==="
find web/src/app -path "*financial*" -name "page.tsx" | sort
find web/src/app -path "*financial*" -name "*.tsx" | sort

echo ""
echo "=== 0B: EXISTING FINANCIAL SERVICES ==="
find web/src/lib -path "*financial*" -name "*.ts" | sort

echo ""
echo "=== 0C: MODULE REGISTRATION ==="
grep -rn "financial\|Financial\|module" web/src/lib/tenant/ web/src/contexts/tenant-context.tsx --include="*.ts" --include="*.tsx" 2>/dev/null | head -20

echo ""
echo "=== 0D: SIDEBAR FINANCIAL SECTION ==="
grep -n "financial\|Financial" web/src/components/navigation/ChromeSidebar.tsx web/src/lib/navigation/role-workspaces.ts 2>/dev/null | head -20

echo ""
echo "=== 0E: EXISTING FINANCIAL TYPES ==="
find web/src -name "*financial*types*" -o -name "*cheque*" -o -name "*pos*" | grep -E "\.ts$" | sort

echo ""
echo "=== 0F: EXISTING SEED SCRIPTS ==="
find web/src -name "*seed*" -o -name "*provision*" | grep -E "\.ts$|\.tsx$" | sort
find scripts -name "*seed*" -o -name "*provision*" 2>/dev/null | sort

echo ""
echo "=== 0G: TENANT FEATURES/MODULES STRUCTURE ==="
cat << 'SQL'
-- Check how modules are stored on tenants:
SELECT id, name, features, settings
FROM tenants
WHERE features IS NOT NULL
LIMIT 5;
SQL

echo ""
echo "=== 0H: EXISTING ENTITY TYPES IN USE ==="
cat << 'SQL'
SELECT entity_type, COUNT(*) as count
FROM entities
GROUP BY entity_type
ORDER BY count DESC;
SQL

echo ""
echo "=== 0I: EXISTING DATA TYPES IN committed_data ==="
cat << 'SQL'
SELECT data_type, COUNT(*) as count
FROM committed_data
GROUP BY data_type
ORDER BY count DESC;
SQL

echo ""
echo "=== 0J: FINANCIAL IMPORT PIPELINE ==="
grep -rn "cheque\|pos_cheque\|financial.*import\|\.txt\|\.tsv" web/src/lib/services/ web/src/app/api/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -20

echo ""
echo "=== 0K: localStorage REFERENCES IN FINANCIAL CODE ==="
grep -rn "localStorage\|sessionStorage" web/src/lib/financial/ web/src/app/financial/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -20
```

**PASTE ALL OUTPUT.** This diagnostic reveals what exists from the localStorage era and what needs migration to Supabase.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-95 Phase 0: Financial Agent diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Build a Financial Agent (restaurant franchise performance management)
that runs on the same engine as ICM, demonstrating domain-agnostic architecture.
Data must be in Supabase (not localStorage). One tenant must support both modules.

Option A: Dedicated financial_* Supabase tables (financial_locations, financial_cheques, etc.)
  - New tables for location metadata, cheque transactions, staff records
  - Separate from ICM data model
  - Scale test: YES
  - AI-first: YES
  - Transport: NO HTTP bodies
  - Atomicity: YES
  - Problem: Creates parallel infrastructure. Violates domain-agnostic principle (Rule 8).

Option B: Use EXISTING entity/committed_data model with domain-specific metadata
  - Locations, brands, staff = entities with entity_type and metadata JSONB
  - POS cheques = committed_data rows with data_type='pos_cheque'
  - Performance framework = rule_set with tier_classification outcome
  - Server commissions = rule_set with monetary outcome
  - Scale test: YES — same tables, different data_type discriminator
  - AI-first: YES — no domain-specific schema
  - Transport: Same bulk import pipeline as ICM
  - Atomicity: YES — same transaction boundaries
  - Advantage: PROVES domain-agnostic. Same queries, same pages, same engine.

Option C: Hybrid — entities model for org structure, dedicated table for cheques
  - Entities for locations/staff, but cheques get their own indexed table
  - Rationale: cheques are high-volume transactions that benefit from dedicated indexes
  - Scale test: YES
  - Problem: 46,700 cheques in committed_data is trivial. Dedicated table premature optimization.

CHOSEN: Option B — Existing entity/committed_data model
REASON: This IS the domain-agnostic proof. If the Financial Agent needs separate tables,
the architecture claim is false. 46K cheques in committed_data with JSONB row_data is
well within Supabase/PostgreSQL capabilities. Entity metadata JSONB handles brand/region/format
without schema changes. The calculation engine processes rule_sets regardless of domain.

REJECTED: Option A — Creates the parallel infrastructure it claims to not need.
REJECTED: Option C — Premature optimization. Revisit only if scale testing shows bottleneck.
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-95 Phase 1: ADR — domain-agnostic via existing entity model" && git push origin dev`

---

## PHASE 2: SUPABASE SCHEMA — TENANT + ENTITIES

### 2A: Create Sabor Grupo Gastronomico Tenant

Execute in Supabase SQL Editor:

```sql
INSERT INTO tenants (id, name, slug, locale, currency, features, settings, hierarchy_labels, entity_type_labels)
VALUES (
  gen_random_uuid(),
  'Sabor Grupo Gastronomico',
  'sabor-grupo',
  'es-MX',
  'MXN',
  '{"modules": ["icm", "financial"], "financial_enabled": true, "icm_enabled": true}'::jsonb,
  '{"demo": true, "dual_module": true}'::jsonb,
  '{"L0": "Corporativo", "L1": "Marca", "L2": "Región", "L3": "Sucursal", "L4": "Colaborador"}'::jsonb,
  '{"organization": "Franquiciador", "brand": "Marca", "region": "Región", "location": "Sucursal", "individual": "Colaborador"}'::jsonb
);
```

**Verify:**
```sql
SELECT id, name, slug, features, currency FROM tenants WHERE slug = 'sabor-grupo';
```

Save the returned tenant ID — all subsequent inserts use it.

### 2B: Create Entity Hierarchy

Create entities in order: organization → brands → locations → staff.

**Organization (1):**
```sql
INSERT INTO entities (id, tenant_id, entity_type, status, external_id, display_name, metadata)
VALUES (gen_random_uuid(), '<TENANT_ID>', 'organization', 'active', 'SGG-CORP',
  'Sabor Grupo Gastronomico',
  '{"role": "franchisor", "hq_city": "Mazatlán", "hq_state": "SIN"}'::jsonb);
```

**Brands (3):**
```sql
INSERT INTO entities (id, tenant_id, entity_type, status, external_id, display_name, metadata) VALUES
(gen_random_uuid(), '<TENANT_ID>', 'brand', 'active', 'FUEGO-DORADO', 'Fuego Dorado',
  '{"format": "full_service", "format_display": "Servicio Completo", "benchmark_revenue_hr": 850, "benchmark_avg_check": 420, "benchmark_tip_pct": 12, "benchmark_cancel_max": 2.5}'::jsonb),
(gen_random_uuid(), '<TENANT_ID>', 'brand', 'active', 'RAPIDO-VERDE', 'Rápido Verde',
  '{"format": "express", "format_display": "Express / Casual Rápido", "benchmark_revenue_hr": 1200, "benchmark_avg_check": 185, "benchmark_tip_pct": 5, "benchmark_cancel_max": 4.0}'::jsonb),
(gen_random_uuid(), '<TENANT_ID>', 'brand', 'active', 'COSTA-AZUL', 'Costa Azul',
  '{"format": "seafood", "format_display": "Mariscos — Servicio de Mesa", "benchmark_revenue_hr": 780, "benchmark_avg_check": 580, "benchmark_tip_pct": 15, "benchmark_cancel_max": 2.0}'::jsonb);
```

**Locations (20):** Insert all 20 locations from the entity model above. Each location entity has:
- `entity_type`: 'location'
- `external_id`: The SUC_ID (e.g., 'FD-CDMX-001')
- `display_name`: Full location name
- `metadata`: LocationMetadata JSONB as defined above (brand, format, region, state, city, capacity_tables, pos_system, status, tags, nickname)

POS system distribution:
- 14 locations: softrestaurant_v11
- 4 locations: softrestaurant_v12
- 2 locations: icg (RV-TIJ-001, CA-VER-001)

**Staff (40 servers):** 2 servers per location. Generate with:
- `entity_type`: 'individual'
- `external_id`: Sequential (SGG-SRV-001 through SGG-SRV-040)
- `display_name`: Realistic Mexican names (4-name format: nombre, segundo_nombre, apellido_paterno, apellido_materno)
- `metadata`: StaffMetadata JSONB with location_id, role, hire_date, shift_pattern, mesero_id

Mesero IDs: 1001-1040 (sequential, 2 per location).

### 2C: Entity Relationships

Create parent relationships:
- Organization → each Brand
- Each Brand → its Locations
- Each Location → its Staff

Use `entity_relationships` table if it exists, or store in committed_data with `data_type='entity_relationship'`.

### 2D: Create Profiles for Demo Personas

Create at least 3 profiles linked to this tenant:
1. **Admin profile:** role='admin', display_name='Carlos Mendoza', email='admin@saborgrupo.mx'
2. **Manager profile:** role='manager', display_name='Ana Martínez', email='gerente@saborgrupo.mx'
3. **Rep/Server profile:** role='sales_rep', display_name='Diego Ramírez', email='mesero@saborgrupo.mx', entity_id linked to one of the server entities

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Tenant exists in Supabase | `SELECT * FROM tenants WHERE slug = 'sabor-grupo'` returns 1 row with dual modules |
| PG-2 | 24 entities created | 1 org + 3 brands + 20 locations + 40 staff (or verify correct count if adjusted) |
| PG-3 | Location metadata has tags | `SELECT metadata->>'tags' FROM entities WHERE entity_type='location' AND tenant_id='...' LIMIT 3` shows Oro/Expansión |
| PG-4 | Entity relationships exist | Parent-child chain: org → brand → location → staff queryable |
| PG-5 | Profiles linked to tenant | 3 profiles for sabor-grupo with correct roles |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-95 Phase 2: Supabase tenant + entity hierarchy" && git push origin dev`

---

## PHASE 3: SEED POS CHEQUE DATA

### 3A: Create Seed Script

Create `web/src/scripts/seed-sabor-grupo.ts` (or appropriate location matching existing seed scripts).

The script generates ~46,700 POS cheque records following the specification in the "Seed Data Specification" section above.

**Key requirements:**
1. All cheques go into `committed_data` with `data_type = 'pos_cheque'`
2. Each cheque's `entity_id` points to its location entity
3. Each cheque's `period_id` points to the January 2024 period for this tenant
4. Bulk insert in batches ≤5,000 rows (Standing Rule — scale by design)
5. Use `crypto.randomUUID()` for all IDs (AP-12)
6. Include the 6 anomaly patterns described in the seed data spec
7. Use realistic MXN amounts matching brand benchmarks

### 3B: Create Period

```sql
INSERT INTO periods (id, tenant_id, label, period_type, status, start_date, end_date, canonical_key)
VALUES (gen_random_uuid(), '<TENANT_ID>', 'Enero 2024', 'monthly', 'closed',
  '2024-01-01', '2024-01-31', '2024-01');
```

### 3C: Execute Seed Script

Run the seed script. Verify:

```sql
SELECT COUNT(*) FROM committed_data
WHERE tenant_id = '<TENANT_ID>' AND data_type = 'pos_cheque';
-- Expected: ~46,700

SELECT
  e.external_id as location,
  COUNT(cd.id) as cheques,
  SUM((cd.row_data->>'total')::numeric) as total_revenue
FROM committed_data cd
JOIN entities e ON cd.entity_id = e.id
WHERE cd.tenant_id = '<TENANT_ID>' AND cd.data_type = 'pos_cheque'
GROUP BY e.external_id
ORDER BY total_revenue DESC;
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-6 | Period exists | January 2024 period for sabor-grupo |
| PG-7 | Cheque count ≥ 40,000 | `COUNT(*)` on committed_data for this tenant |
| PG-8 | All 20 locations have cheques | Every location external_id appears in results |
| PG-9 | Anomaly location has high cancellation | RV-MTY-002 cancellation rate > 7% |
| PG-10 | Revenue in MXN range | Total network revenue in realistic MXN range (MX$15M-25M for 3 weeks) |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-95 Phase 3: POS cheque seed data — 46K records across 20 locations" && git push origin dev`

---

## PHASE 4: RULE SETS — PERFORMANCE INDEX + SERVER COMMISSION

### 4A: Create Performance Index Rule Set

Insert the "Índice de Desempeño" rule set as defined in the Performance Framework section. Store it exactly like ICM rule sets — same table, same structure, different `outcome_config.type`.

### 4B: Create Server Commission Rule Set

Insert the "Comisión por Ventas — Meseros" rule set. This is a standard ICM-style monetary payout rule set.

### 4C: Create Rule Set Assignments

- Performance Index rule set → assigned to all 40 server entities
- Server Commission rule set → assigned to all 40 server entities

Both use the same `rule_set_assignments` table.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-11 | Performance Index rule set exists | `SELECT * FROM rule_sets WHERE tenant_id='...' AND name LIKE '%Desempeño%'` |
| PG-12 | Server Commission rule set exists | `SELECT * FROM rule_sets WHERE tenant_id='...' AND name LIKE '%Comisión%'` |
| PG-13 | Assignments exist | 40 assignments per rule set (80 total) |
| PG-14 | Both rule sets have correct components | 4 components for Performance Index, 1 for Commission |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-95 Phase 4: Performance Index + Server Commission rule sets" && git push origin dev`

---

## PHASE 5: GENERATE IMPORTABLE POS FILES

### 5A: Create File Generator

Create a script that generates 3 TSV files for the normalization demo:

1. **`cheques_20240122_FD-GDL-001.txt`** — Clean, standard 23-column format
2. **`cheques_20240122_RV-MTY-001.txt`** — Variant column headers (English-ish), requires AI field mapping
3. **`cheques_20240122_CA-CUN-001.txt`** — Messy: mixed headers, currency-formatted numbers, extra columns

### 5B: Output Location

Save generated files to `web/public/demo-data/` so they're accessible for download/upload during demos.

### 5C: File 2 Column Variants

Instead of standard headers, use:
```
franchise_id	shift	folio_num	check_number	open_time	close_time	guests	server	paid	cancelled	items	total_amount	cash	credit_card	tip	discount	subtotal	subtotal_after_disc	tax	total_disc	comps	food_total	bev_total
```

This triggers the AI field mapping to resolve "franchise_id" → "numero_franquicia", "server" → "mesero_id", etc.

### 5D: File 3 Messiness

- Column headers: mix of Spanish and English (`numero_franquicia	shift	folio	check_number	fecha	cierre	personas	mesero_id	paid	cancelado	items	total	cash	tarjeta	tip	descuento	subtotal	subtotal_desc	tax	total_descuentos	cortesias	alimentos	bebidas`)
- Numeric values with formatting: `"$1,680.00"` instead of `1680.00`
- Extra column at end: `notas` (always empty or "OK")
- A few rows with trailing whitespace or extra tabs

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-15 | 3 TSV files generated | Files exist in web/public/demo-data/ |
| PG-16 | File 1 has standard headers | First line matches 23-column spec exactly |
| PG-17 | File 2 has variant headers | First line uses English column names |
| PG-18 | File 3 has mixed format | Currency-formatted numbers present |
| PG-19 | All files have valid cheque data | Row count > 50 per file, amounts in MXN range |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-95 Phase 5: Importable POS files for normalization demo" && git push origin dev`

---

## PHASE 6: FINANCIAL DASHBOARD MIGRATION — localStorage → SUPABASE

### 6A: Audit Existing Financial Pages

From Phase 0 diagnostic, identify all financial pages currently reading from localStorage. Each page needs to be rewired to query Supabase via the existing entity + committed_data model.

### 6B: Create Financial Data Service

Create `web/src/lib/services/financial-data-service.ts`:

This service provides all financial dashboard data by querying committed_data WHERE data_type='pos_cheque'. It does NOT create new Supabase tables.

```typescript
interface FinancialDataService {
  // Network-level aggregates
  getNetworkSummary(tenantId: string, periodId: string): Promise<NetworkSummary>;

  // Location-level metrics
  getLocationMetrics(tenantId: string, periodId: string): Promise<LocationMetric[]>;

  // Staff performance
  getStaffPerformance(tenantId: string, periodId: string, locationId?: string): Promise<StaffMetric[]>;

  // Time series
  getTimeSeries(tenantId: string, periodId: string, granularity: 'day' | 'week' | 'month', metric: string): Promise<TimeSeriesPoint[]>;

  // Leakage (discounts + comps + cancellations)
  getLeakageMetrics(tenantId: string, periodId: string): Promise<LeakageMetric[]>;

  // Operational patterns (new — covers FRMX #8, #10, #11)
  getHourlyPatterns(tenantId: string, periodId: string, locationId?: string): Promise<HourlyPattern[]>;
  getDayOfWeekPatterns(tenantId: string, periodId: string, locationId?: string): Promise<DayOfWeekPattern[]>;

  // Payment method breakdown (new — covers FRMX #19)
  getPaymentBreakdown(tenantId: string, periodId: string, locationId?: string): Promise<PaymentBreakdown[]>;
}
```

**All queries are against `committed_data` + `entities`.** The service aggregates JSONB `row_data` fields using PostgreSQL JSON operators.

**Performance note:** For 46K cheques, client-side aggregation is feasible but server-side is better. If an API route exists for financial queries, use it. If not, query from the client with appropriate `.select()` and let PostgreSQL do the aggregation.

### 6C: Rewire Each Page

For each existing financial page, replace localStorage reads with the financial data service:

| Page | Current | New |
|------|---------|-----|
| Network Pulse (`/financial`) | localStorage cheques | `getNetworkSummary()` + `getLocationMetrics()` |
| Location Benchmarks (`/financial/performance`) | localStorage | `getLocationMetrics()` sorted/ranked |
| Revenue Timeline (`/financial/timeline`) | localStorage | `getTimeSeries()` |
| Staff Leaderboard (`/financial/staff`) | localStorage | `getStaffPerformance()` |
| Leakage Monitor (`/financial/leakage`) | localStorage | `getLeakageMetrics()` |

### 6D: Fix Currency Display

ALL financial pages must display MX$ (MXN), not US$ (USD). Read currency from tenant.currency.

### 6E: Fix Naming

- Page title: "Network Pulse" → Use tenant-appropriate terminology. For Sabor Grupo, keep "Pulso de Red" (Spanish) or let the page title derive from the tenant hierarchy labels.
- Brand names must match seed data (Fuego Dorado, Rápido Verde, Costa Azul), not hardcoded test names.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-20 | Zero localStorage references in financial code | `grep -c "localStorage" web/src/lib/financial/ web/src/app/financial/` returns 0 |
| PG-21 | Network Pulse loads from Supabase | Dashboard shows MXN amounts from seed data |
| PG-22 | Location Benchmarks shows 20 locations | All locations with correct brand names |
| PG-23 | Staff Leaderboard shows 40 servers | Ranked by Performance Index composite |
| PG-24 | Currency is MX$ everywhere | No USD formatting on any financial page |
| PG-25 | Revenue Timeline renders | Day/Week/Month selectors work with Supabase data |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-95 Phase 6: Financial dashboards migrated to Supabase" && git push origin dev`

---

## PHASE 7: NEW DASHBOARD VIEWS

### 7A: Operational Patterns Page

Create `/financial/patterns/page.tsx` — covers FRMX dashboard requests #8, #10, #11.

**Section 1: Hourly Heatmap**
- X axis: Hour of day (7:00 - 02:00)
- Y axis: Day of week (Lunes - Domingo)
- Cell color intensity: Revenue or check count
- Click cell to see detail for that hour+day combination
- Scope selector: Network / Brand / Location

**Section 2: Day of Week Performance**
- Bar chart: Net Sales and Ticket count by day of week
- Overlay: Average check as line

**Section 3: Peak Hours Analysis**
- Combo chart: Customers (bars) + Avg Ticket (line) + Avg Sales per Hour (line)
- X axis: Hour of day
- Highlights peak hours with annotation

### 7B: Monthly Operating Summary Page

Create `/financial/summary/page.tsx` — covers FRMX dashboard request #17 + #19.

**Full P&L-style table:**

| Category | Amount (MX$) | % of Revenue |
|----------|-------------|-------------|
| Alimentos (Food) | | |
| Bebidas (Beverages) | | |
| Subtotal | | |
| Descuentos (Discounts) | | |
| Cortesías (Comps) | | |
| Ventas Netas (Net Sales) | | |
| IVA (Tax 16%) | | |
| Total con Impuesto | | |
| Propinas (Tips) | | |
| **Total con Propina** | | |
| --- | --- | --- |
| Efectivo (Cash) | | % |
| Tarjeta (Card) | | % |
| --- | --- | --- |
| Cheques | count | |
| Comensales (Covers) | count | |
| Cheque Promedio (Avg Check) | | |
| Cancelaciones | count | rate% |

Filterable by: Brand, Region, Location. Period selector at top.

### 7C: Add to Financial Sidebar

Add navigation entries for the two new pages:
- "Patrones Operativos" → `/financial/patterns`
- "Resumen Mensual" → `/financial/summary`

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-26 | Hourly heatmap renders | Grid shows revenue intensity by hour×day |
| PG-27 | Day of week chart renders | 7 bars with overlay line |
| PG-28 | Monthly summary table renders | All P&L rows populated with MXN amounts |
| PG-29 | Cash/card breakdown shows | Payment method split with percentages |
| PG-30 | Both pages in sidebar | Navigation links work from Financial section |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-95 Phase 7: Operational Patterns + Monthly Summary pages" && git push origin dev`

---

## PHASE 8: DUAL-MODULE TENANT WIRING

### 8A: Module-Aware Sidebar

When a user selects Sabor Grupo Gastronomico, the sidebar should show BOTH:
- Standard workspaces (Operate, Perform, Investigate, Design, Configure, Govern) — these work with the Server Commission rule set (ICM behavior)
- Financial workspace — these show the Financial Agent views (Network Pulse, Benchmarks, etc.)

Check how the sidebar currently handles the Financial workspace visibility. It should key off `tenant.features.financial_enabled` or equivalent.

### 8B: Module-Aware Operate Surface

When in the Operate workspace for Sabor Grupo, the OperateContext Plan selector should show BOTH rule sets:
1. "Índice de Desempeño — Sabor Grupo Gastronomico" (Performance Index)
2. "Comisión por Ventas — Meseros" (Server Commission)

Selecting different plans shows different results — one shows tier classifications, the other shows MXN payouts. Same engine, different outcome types.

### 8C: Tenant Selector Visibility

Ensure Sabor Grupo Gastronomico appears in the tenant selector for platform@vialuce.com. It should NOT be hidden as a test tenant — it's a demo tenant.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-31 | Tenant selector shows Sabor Grupo | Selectable alongside existing tenants |
| PG-32 | Sidebar shows Financial workspace | Financial section visible with all 7 navigation items |
| PG-33 | Sidebar shows standard workspaces too | Operate, Perform, etc. all present |
| PG-34 | Plan selector shows both rule sets | OperateSelector dropdown has 2 entries |
| PG-35 | Persona switcher works for this tenant | Admin/Manager/Rep filtering applies |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-95 Phase 8: Dual-module tenant wiring" && git push origin dev`

---

## PHASE 9: BUILD + VERIFICATION + COMPLETION

### 9A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 9B: Route Verification

```bash
echo "=== FINANCIAL ROUTE VERIFICATION ==="
for route in "financial" "financial/performance" "financial/timeline" "financial/staff" "financial/leakage" "financial/patterns" "financial/summary"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$route)
  echo "$route: $STATUS"
done
```

### 9C: Data Verification

```sql
-- Verify seed data integrity
SELECT
  'Tenant' as check, COUNT(*) as count FROM tenants WHERE slug = 'sabor-grupo'
UNION ALL
SELECT 'Entities', COUNT(*) FROM entities WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo')
UNION ALL
SELECT 'Cheques', COUNT(*) FROM committed_data WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo') AND data_type = 'pos_cheque'
UNION ALL
SELECT 'Rule Sets', COUNT(*) FROM rule_sets WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo')
UNION ALL
SELECT 'Assignments', COUNT(*) FROM rule_set_assignments WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo')
UNION ALL
SELECT 'Periods', COUNT(*) FROM periods WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo')
UNION ALL
SELECT 'Profiles', COUNT(*) FROM profiles WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sabor-grupo');
```

### 9D: Completion Report

Create `OB-95_COMPLETION_REPORT.md` at project root with:

1. Phase 0 diagnostic findings — what existed from localStorage era, what was migrated
2. Architecture decision — domain-agnostic via existing entity/committed_data model
3. Entity hierarchy — counts and relationship verification
4. Seed data — cheque count, revenue totals, anomaly verification
5. Rule sets — Performance Index + Server Commission created
6. Importable files — 3 TSV files generated with normalization variants
7. Dashboard migration — all 5 pages migrated from localStorage to Supabase
8. New views — Operational Patterns + Monthly Summary
9. Dual-module wiring — sidebar, plan selector, tenant selector
10. All proof gates with PASS/FAIL and evidence
11. FRMX Dashboard cross-reference: which of 21 requests are covered

### 9E: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-95: Financial Agent — Sabor Grupo Gastronomico Dual-Module Tenant" \
  --body "## What This OB Delivers

### Domain-Agnostic Proof
Same entity model, same committed_data, same calculation engine, same reconciliation —
applied to restaurant franchise performance management instead of sales compensation.

### Sabor Grupo Gastronomico Tenant
- 3 brands: Fuego Dorado (full-service), Rápido Verde (express), Costa Azul (seafood)
- 20 locations across 4 regions and 10 states
- 40 servers with POS-assigned mesero IDs
- Customer tags: Oro (flagship), Expansión (new openings)
- ~46,700 POS cheque records (January 2024, 3 weeks)

### Dual Module
- ICM: Server commission calculation (tiered rate table on server net sales)
- Financial: Performance Index (4-component weighted scoring with tier classification)
- Both rule sets in OperateSelector — same engine, different outcomes

### Financial Dashboards (7 pages, all Supabase-backed)
- Network Pulse: 6 metric cards, location grid, brand comparison
- Location Benchmarks: 20-location sortable table with sparklines
- Revenue Timeline: Day/Week/Month granularity with YoY
- Staff Leaderboard: 40 servers ranked by Performance Index
- Leakage Monitor: Discounts + comps + cancellations by location
- Operational Patterns (NEW): Hourly heatmap + day-of-week analysis
- Monthly Summary (NEW): Full P&L table with cash/card breakdown

### Importable Demo Files
- 3 TSV files with normalization variants (clean, English headers, messy mixed)
- Proves AI field mapping handles format diversity

### FRMX Dashboard Coverage: 16 of 21 requested views
- 14 fully covered by 7 pages
- 2 partially covered (seasonal, cash/card without debit split)
- 4 require item-level POS data (deferred)
- 1 requires seating system data (not feasible)

## Proof Gates: 35
## Standing Rules Enforced: 8 (domain-agnostic), 26 (zero component queries)"
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-36 | `npm run build` exits 0 | Clean build |
| PG-37 | All financial routes return 200 | 7 pages accessible |
| PG-38 | Seed data counts verified | SQL verification query returns expected counts |
| PG-39 | PR created | URL pasted |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-95 Complete: Financial Agent — Sabor Grupo Gastronomico" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Sabor Grupo Gastronomico tenant with dual modules (ICM + Financial)
- Entity hierarchy: organization → brands → locations → staff
- Customer tags (Oro, Expansión) on location entities
- ~46,700 POS cheque records seeded into committed_data
- Performance Index rule set (tier classification output)
- Server Commission rule set (monetary payout output)
- 7 financial dashboard pages (5 migrated + 2 new)
- 3 importable TSV files for normalization demo
- Dual-module sidebar + plan selector wiring
- All financial data in MXN with es-MX locale

### OUT OF SCOPE — DO NOT BUILD
- Calculation engine runs (the engine exists — seeding rule sets is sufficient)
- Normalization dictionary/review UI (import pipeline exists, files prove format diversity)
- Item-level POS data or product analytics views (requires separate data source)
- Franchise fee calculation (future module feature)
- Tip pool distribution logic (future)
- Mobile server persona views (future)
- POS API integration (future — batch file import is the current model)
- Budget/target data import (future data source)
- New Supabase tables (use existing entity/committed_data model)

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Create financial_locations or financial_cheques tables | Use entities + committed_data with data_type discriminator |
| AP-2 | Hardcode brand names in dashboard code | Read from entity metadata |
| AP-3 | USD formatting on financial pages | Read tenant.currency, format as MXN |
| AP-4 | localStorage for any financial data | Supabase only. Zero localStorage references. |
| AP-5 | Sequential per-cheque database inserts | Bulk insert ≤5,000 rows per batch |
| AP-6 | Hardcoded benchmark values in UI | Read from brand entity metadata or rule_set metadata |
| AP-7 | Separate calculation pipeline for financial | Same engine. Same rule_sets table. Same calculation_results. |
| AP-8 | Component-level Supabase calls in dashboards | Financial data service + page loaders. Standing Rule 26. |
| AP-9 | ICM-specific terminology in shared surfaces | "Components" not "Commission Components". "Outcomes" not "Payouts" for Performance Index. |

---

*ViaLuce.ai — The Way of Light*
*OB-95: The second domain that proves the first was never the point.*
*"Same engine. Different vocabulary. One platform. Every domain."*
