# OB-45: Full Demo Data Seed — Optica Luminar + Velocidad Deportiva

**Autonomy Directive: Execute all phases without stopping for confirmation. NEVER ask yes/no questions. If uncertain, make the safe choice and document it. Do NOT stop between phases.**

## REPO ROOT RULE
**git commands must run from repo root (`/Users/AndrewAfrica/spm-platform`), NOT from `web/`. Always `cd /Users/AndrewAfrica/spm-platform` before `git add/commit/push/status`. `npm`/`npx` commands run from `web/`.**

---

## SITUATION

Both demo tenants exist in the Supabase `tenants` table (visible in tenant selector). BUT there is **zero data** in either — no entities, no relationships, no rule sets, no committed data, no calculation results, no outcomes. The seed scripts either never ran successfully or failed.

Auth users exist (platform@vialuce.com + 6 tenant users). Passwords are all `demo-password-VL1`.

**The goal:** Both tenants fully populated with realistic demo data so the dashboards show meaningful metrics, the lifecycle shows active state, and the persona switcher demonstrates role-based views.

---

## PHASE 0: DIAGNOSTIC — Confirm Starting State

```bash
cd /Users/AndrewAfrica/spm-platform/web

# 1. Tenants
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await sb.from('tenants').select('id, name, slug');
console.table(data);
"

# 2. Row counts for ALL data tables by tenant
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tables = ['entities', 'entity_relationships', 'rule_sets', 'rule_set_assignments', 'periods', 'committed_data', 'calculation_batches', 'calculation_results', 'outcomes'];
for (const t of tables) {
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
  console.log(t + ':', count ?? 0);
}
"

# 3. Auth users / profiles
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await sb.from('profiles').select('display_name, email:auth_user_id, tenant_id, role, scope_level');
console.table(data);
"

# 4. Check for existing seed scripts
ls -la scripts/seed-*.ts 2>/dev/null || echo 'No seed scripts found'
cat scripts/seed-optica-luminar.ts 2>/dev/null | head -20 || echo 'Optica seed script not found'
cat scripts/seed-velocidad-deportiva.ts 2>/dev/null | head -20 || echo 'VD seed script not found'
```

**Document findings. Commit:** `OB-45 Phase 0: Diagnostic — document starting state`

---

## PHASE 1: OPTICA LUMINAR — Full Seed

### Tenant
- **Tenant ID:** `a1b2c3d4-e5f6-7890-abcd-ef1234567890` (already exists in `tenants` table)
- **Name:** Optica Luminar
- **Industry:** retail_optical | **Country:** MX | **Currency:** MXN | **Locale:** es-MX

### Auth Users (already exist — verify passwords work, update if needed)

| Email | Password | Display Name | scope_level | capabilities |
|-------|----------|-------------|-------------|-------------|
| admin@opticaluminar.com | demo-password-VL1 | Laura Mendez | tenant | full admin |
| gerente@opticaluminar.com | demo-password-VL1 | Roberto Castillo | division | approve + export |
| vendedor@opticaluminar.com | demo-password-VL1 | Sofia Navarro | individual | view only |

Use `supabase.auth.admin.listUsers()` to find existing users. If they exist, use `updateUserById()` to ensure password is `demo-password-VL1`. If not, create with `admin.createUser()` with `email_confirm: true`.

### Entity Hierarchy (22 entities)

```
Optica Luminar (organization) — OL-ORG
├── Zona Centro (zone) — OL-ZC
│   ├── Optica Luminar Polanco (location) — OL-T01
│   │   ├── Carlos Garcia Lopez (individual, certificado) — OL-E01
│   │   └── Maria Rodriguez Hernandez (individual, certificado) — OL-E02
│   ├── Optica Luminar Reforma (location) — OL-T02
│   │   ├── Juan Martinez Perez (individual, certificado) — OL-E03
│   │   └── Ana Gonzalez Torres (individual, no_certificado) — OL-E04
│   └── Optica Luminar Angelopolis (location) — OL-T05
│       ├── Luis Gutierrez Ortiz (individual, no_certificado) — OL-E09
│       └── Valentina Castillo Ramos (individual, certificado) — OL-E10
├── Zona Norte (zone) — OL-ZN
│   └── Optica Luminar San Pedro (location) — OL-T03
│       ├── Pedro Sanchez Rivera (individual, certificado) — OL-E05
│       └── Sofia Flores Gomez (individual, certificado) — OL-E06
└── Zona Sur (zone) — OL-ZS
    ├── Optica Luminar Providencia (location) — OL-T04
    │   ├── Miguel Diaz Cruz (individual, no_certificado) — OL-E07
    │   └── Isabella Morales Reyes (individual, no_certificado) — OL-E08
    └── Optica Luminar Kukulcan (location) — OL-T06
        ├── Diego Santos Jimenez (individual, certificado) — OL-E11
        └── Camila Ruiz Mendoza (individual, no_certificado) — OL-E12
```

Use deterministic UUIDs. Pattern: hash the external_id with the tenant UUID, or use a fixed namespace. The IDs above (OL-ORG, OL-ZC, etc.) are external_ids — generate stable UUIDs from them.

Each individual's `attributes` JSONB must include:
```json
{
  "certification": "certificado",  // or "no_certificado"
  "hire_date": "2022-03-15",
  "role": "Vendedor"
}
```

### Entity Relationships

Wire the hierarchy with `relationship_type: 'parent_of'`:
- OL-ORG → OL-ZC, OL-ZN, OL-ZS
- OL-ZC → OL-T01, OL-T02, OL-T05
- OL-ZN → OL-T03
- OL-ZS → OL-T04, OL-T06
- Each store → its 2 individuals (`relationship_type: 'member_of'`)

All relationships: `source = 'seed'`, `confidence = 1.0`, `status = 'active'`, `human_confirmed = true`.

### Rule Set: Plan de Comisiones 2024

One rule set with 6 components. Store in `rule_sets` table with `components` JSONB:

```json
{
  "name": "Plan de Comisiones Óptica 2024",
  "status": "active",
  "effective_start": "2024-01-01",
  "effective_end": "2024-12-31",
  "components": [
    {
      "name": "Ventas Ópticas",
      "type": "tiered_commission",
      "weight": 0.40,
      "variants": {
        "certificado": {
          "tiers": [
            {"min_attainment": 0, "max_attainment": 0.80, "rate": 0.02},
            {"min_attainment": 0.80, "max_attainment": 1.00, "rate": 0.035},
            {"min_attainment": 1.00, "max_attainment": 1.20, "rate": 0.045},
            {"min_attainment": 1.20, "max_attainment": 999, "rate": 0.055}
          ]
        },
        "no_certificado": {
          "tiers": [
            {"min_attainment": 0, "max_attainment": 0.80, "rate": 0.015},
            {"min_attainment": 0.80, "max_attainment": 1.00, "rate": 0.025},
            {"min_attainment": 1.00, "max_attainment": 999, "rate": 0.038}
          ]
        }
      }
    },
    {
      "name": "Ventas de Tienda",
      "type": "store_bonus",
      "weight": 0.20,
      "description": "Store-level attainment bonus shared equally among store staff"
    },
    {
      "name": "Clientes Nuevos",
      "type": "acquisition_bonus",
      "weight": 0.10,
      "description": "New customer acquisition bonus based on attainment %"
    },
    {
      "name": "Cobranza",
      "type": "collections_bonus",
      "weight": 0.15,
      "description": "Collections attainment bonus"
    },
    {
      "name": "Seguros",
      "type": "cross_sell",
      "weight": 0.08,
      "description": "Insurance product cross-sell bonus"
    },
    {
      "name": "Garantías",
      "type": "cross_sell",
      "weight": 0.07,
      "description": "Warranty cross-sell bonus"
    }
  ]
}
```

### Rule Set Assignments

12 assignments — one per individual linked to the rule set. Each assignment includes the individual's entity_id and the rule_set_id.

### Period: 2024-01

```json
{
  "name": "Enero 2024",
  "period_type": "monthly",
  "start_date": "2024-01-01",
  "end_date": "2024-01-31",
  "status": "closed",
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### Committed Data

Store-level metrics:

| Store | optical_sales | store_target | attainment | new_cust_att | collections_att | insurance_att |
|-------|-------------|-------------|-----------|-------------|----------------|--------------|
| Polanco | 625000 | 500000 | 1.25 | 1.15 | 1.08 | 1.05 |
| Reforma | 525000 | 500000 | 1.05 | 1.02 | 0.95 | 1.10 |
| San Pedro | 441000 | 450000 | 0.98 | 0.92 | 0.88 | 0.95 |
| Providencia | 340000 | 400000 | 0.85 | 0.80 | 0.82 | 0.78 |
| Angelopolis | 259200 | 360000 | 0.72 | 0.68 | 0.70 | 0.65 |
| Kukulcan | 385000 | 350000 | 1.10 | 1.05 | 0.98 | 1.02 |

Individual metrics:

| Entity | insurance_sales | warranty_sales |
|--------|----------------|---------------|
| OL-E01 Carlos Garcia | 2800 | 5200 |
| OL-E02 Maria Rodriguez | 3100 | 4800 |
| OL-E03 Juan Martinez | 2200 | 3900 |
| OL-E04 Ana Gonzalez | 1900 | 4100 |
| OL-E05 Pedro Sanchez | 2500 | 3500 |
| OL-E06 Sofia Flores | 2100 | 3200 |
| OL-E07 Miguel Diaz | 1400 | 2800 |
| OL-E08 Isabella Morales | 1200 | 2500 |
| OL-E09 Luis Gutierrez | 900 | 1800 |
| OL-E10 Valentina Castillo | 1100 | 2200 |
| OL-E11 Diego Santos | 2600 | 4000 |
| OL-E12 Camila Ruiz | 2000 | 3400 |

Store the data in `committed_data` with the entity_id, period_id, and metrics in the `data` JSONB field.

### Calculation Batch

One batch for period 2024-01:
```json
{
  "tenant_id": "a1b2c3d4-...",
  "period_id": "<period_uuid>",
  "lifecycle_state": "approved",
  "status": "completed",
  "initiated_by": "<admin_profile_id>",
  "completed_at": "2024-02-05T10:00:00Z"
}
```

### Calculation Results (12)

One result per individual with component breakdowns. Calculate realistic values based on the committed data and the rule set tiers. Each result includes:
```json
{
  "entity_id": "<individual_uuid>",
  "tenant_id": "a1b2c3d4-...",
  "period_id": "<period_uuid>",
  "batch_id": "<batch_uuid>",
  "rule_set_id": "<rule_set_uuid>",
  "total_payout": 15250.00,
  "currency": "MXN",
  "status": "approved",
  "components": [
    {"name": "Ventas Ópticas", "output_value": 8500.00, "attainment": 1.25, "rate": 0.055, "variant": "certificado"},
    {"name": "Ventas de Tienda", "output_value": 3100.00},
    {"name": "Clientes Nuevos", "output_value": 1500.00},
    {"name": "Cobranza", "output_value": 1200.00},
    {"name": "Seguros", "output_value": 450.00},
    {"name": "Garantías", "output_value": 500.00}
  ]
}
```

**Calculate actual values that are internally consistent.** Use the store attainment + individual metrics + rule set tiers to produce realistic payouts. Star performers (Polanco, certificado) should have the highest payouts. Below-target stores with no_certificado employees should have noticeably lower payouts. The numbers must tell a story.

### Outcomes (12)

One outcome per individual for period 2024-01:
```json
{
  "entity_id": "<individual_uuid>",
  "tenant_id": "a1b2c3d4-...",
  "period_id": "<period_uuid>",
  "total_value": 15250.00,
  "currency": "MXN",
  "status": "approved",
  "outcome_type": "commission"
}
```

### Create/Run Seed Script

Create `web/scripts/seed-optica-luminar.ts` (or fix existing one):
- Deterministic UUIDs (use uuid v5 with namespace, or hardcode)
- Idempotent (ON CONFLICT DO UPDATE or check-before-insert)
- Service role key for all writes
- Log progress
- Exit 0 on success

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx scripts/seed-optica-luminar.ts
```

**Verify:**
```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const tables = ['entities', 'entity_relationships', 'rule_sets', 'rule_set_assignments', 'periods', 'committed_data', 'calculation_batches', 'calculation_results', 'outcomes'];
for (const t of tables) {
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
  console.log(t + ':', count);
}
"
```

**Expected counts:**
| Table | Count |
|-------|-------|
| entities | 22 |
| entity_relationships | 18+ |
| rule_sets | 1 |
| rule_set_assignments | 12 |
| periods | 1 |
| committed_data | 18+ (6 store + 12 individual) |
| calculation_batches | 1 |
| calculation_results | 12 |
| outcomes | 12 |

**Commit:** `OB-45 Phase 1: Optica Luminar seed — 22 entities, 1 rule set, 12 calc results`

---

## PHASE 2: VELOCIDAD DEPORTIVA — Full Seed

### Tenant
- **Tenant ID:** `b2c3d4e5-f6a7-8901-bcde-f12345678901` (already exists)
- **Name:** Velocidad Deportiva
- **Industry:** retail_sporting | **Country:** MX | **Currency:** MXN | **Locale:** es-MX

### Key Demo Patterns
1. **Gamification medals** — Oro/Plata/Bronce based on attainment %
2. **Deferred payment** — Monthly calculation, quarterly payout
3. **Attendance gates** — ≥90% required, below = zero payout
4. **Streak bonuses** — 3+ consecutive qualifying months = bonus multiplier
5. **Multi-plan coordination** — 2 rule sets (Floor Sales + Online Assist)

### Auth Users (already exist — verify/update passwords)

| Email | Password | Display Name | scope_level |
|-------|----------|-------------|-------------|
| admin@velocidad.com | demo-password-VL1 | Alejandra Torres | tenant |
| gerente@velocidad.com | demo-password-VL1 | Roberto Vega | division |
| vendedor@velocidad.com | demo-password-VL1 | Diana Cruz | individual |

### Entity Hierarchy (35 entities)

```
Velocidad Deportiva S.A. de C.V. (organization) — VD-ORG
├── Zona Metropolitana (region) — VD-REG-CDMX
│   ├── Velocidad Polanco (location, flagship) — VD-T01 [target: 800 units]
│   │   ├── Carlos Mendoza (calzado, 98% attendance, STAR) — VD-A01
│   │   └── Sofia Rivera (textil, 95%) — VD-A02
│   │   └── Miguel Herrera (rodados, 92%) — VD-A03
│   ├── Velocidad Santa Fe (location, premium) — VD-T02 [target: 650]
│   │   ├── Valentina Soto (calzado, 96%) — VD-A04
│   │   └── Diego Castillo (textil, 88%, ATTENDANCE FAIL) — VD-A05
│   └── Velocidad Interlomas (location, standard) — VD-T03 [target: 500]
│       ├── Isabella Moreno (rodados, 94%) — VD-A06
│       └── Andres Jimenez (calzado, 91%) — VD-A07
├── Zona Norte (region) — VD-REG-NOR
│   ├── Velocidad Monterrey (location, premium) — VD-T04 [target: 600]
│   │   ├── Camila Vargas (textil, 97%) — VD-A08
│   │   └── Fernando Reyes (rodados, 93%) — VD-A09
│   └── Velocidad Saltillo (location, standard) — VD-T05 [target: 400]
│       ├── Daniela Lopez (calzado, 87%, ATTENDANCE FAIL) — VD-A10
│       └── Alejandro Ruiz (textil, 95%) — VD-A11
└── Zona Occidente (region) — VD-REG-OCC
    ├── Velocidad Guadalajara (location, flagship) — VD-T06 [target: 700]
    │   ├── Gabriel Herrera (calzado, 96%) — VD-A12
    │   └── Lucia Navarro (rodados, 94%) — VD-A13
    │   └── Ricardo Ortiz (textil, 92%) — VD-A14
    ├── Velocidad Zapopan (location, standard) — VD-T07 [target: 450]
    │   ├── Patricia Flores (calzado, 95%) — VD-A15
    │   └── Eduardo Ramos (rodados, 91%) — VD-A16
    └── Velocidad Leon (location, standard) — VD-T08 [target: 400]
        ├── Monica Gutierrez (textil, 93%) — VD-A17
        └── Roberto Diaz (calzado, 90%) — VD-A18
        └── Sandra Martinez (rodados, 96%) — VD-A19
        └── Jose Garcia (textil, 94%) — VD-A20

Teams (cross-store):
├── Equipo Calzado (team) — VD-EQ-CAL
├── Equipo Rodados (team) — VD-EQ-ROD
└── Equipo Textil (team) — VD-EQ-TXT
```

Each individual's `attributes` JSONB:
```json
{
  "team": "calzado",
  "attendance_pct": 0.98,
  "hire_date": "2021-06-15",
  "role": "Vendedor de Piso"
}
```

### Rule Sets (2)

**Plan de Piso (Floor Sales):**
- Tiered commission on in-store sales
- Attendance gate: ≥90% required
- Medal tiers: Oro (≥120%), Plata (≥100%), Bronce (≥80%), Sin Medalla (<80%)

**Plan de Asistencia Online (Online Assist):**
- Flat-rate bonus for online order support
- Same attendance gate

### Periods (8)

6 monthly: Jul 2024 through Dec 2024
2 quarterly: Q3 2024 (closed/paid), Q4 2024 (approved/pending)

### Committed Data

18 associates × 6 months × multiple metrics per associate. Create realistic sales patterns:
- VD-A01 (star): consistently high, 6-month qualifying streak
- VD-A05 (attendance fail): good sales but 88% attendance = zero payout
- VD-A10 (attendance fail): 87% attendance = zero payout
- VD-A12: 4-month consecutive qualifying streak

### Calculation Results

18 associates × 6 months = 108 results with component breakdowns. Include:
- Medal assignment in result metadata
- Attendance gate flag
- Streak counter

### Outcomes

18 associates × 2 quarters = 36 outcomes (quarterly payouts)
- Q3: status = 'paid'
- Q4: status = 'approved'

### Create/Run Seed Script

Create `web/scripts/seed-velocidad-deportiva.ts`:

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx scripts/seed-velocidad-deportiva.ts
```

**Verify with same pattern as Optica.**

**Expected counts:**
| Table | Count |
|-------|-------|
| entities | 35 |
| entity_relationships | ~40 |
| rule_sets | 2 |
| rule_set_assignments | 36 (18 × 2) |
| periods | 8 |
| committed_data | 100+ |
| calculation_batches | 8 |
| calculation_results | 108 |
| outcomes | 36 |

**Commit:** `OB-45 Phase 2: Velocidad Deportiva seed — 35 entities, 2 rule sets, 108 calc results, gamification + attendance gates`

---

## PHASE 3: DEMO PERSONA SWITCHER — Verify Passwords Match

The DemoPersonaSwitcher at `web/src/components/demo/DemoPersonaSwitcher.tsx` calls `signInWithPassword()`. It must use the CURRENT passwords, which are `demo-password-VL1` for ALL users (set during HF-027).

Check the component:
```bash
cat web/src/components/demo/DemoPersonaSwitcher.tsx | grep -A5 "password"
```

If passwords reference `demo-password-OL1`, `demo-password-OL2`, etc., update them ALL to `demo-password-VL1`.

Also check if the switcher reads passwords from the tenant settings JSONB — if so, update the tenant settings:
```sql
-- In the seed script, set tenant.settings.demo_users with correct passwords
```

**Commit:** `OB-45 Phase 3: DemoPersonaSwitcher password sync`

---

## PHASE 4: BUILD + CLT

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
```

### Browser Test (localhost:3000)

Open incognito browser:

| # | Test | Expected |
|---|------|----------|
| 1 | Navigate to localhost:3000 | Login page |
| 2 | Login: platform@vialuce.com / demo-password-VL1 | Tenant selector |
| 3 | Select Optica Luminar | Dashboard with populated metrics |
| 4 | YTD Outcome card | Non-zero MXN value |
| 5 | The Pulse: Active Tenants | Shows a number, not "—" |
| 6 | Total Users | Shows a number |
| 7 | Console: zero 400 errors | Clean console |
| 8 | Navigate workspaces (Operate, Perform, etc.) | Pages load without errors |
| 9 | Click Admin persona | Reloads as tenant admin |
| 10 | Click Vendedor persona | Reloads as sales rep |
| 11 | Click Demo to return to platform admin | Returns to VL Admin |
| 12 | Go back to tenant selector, pick Velocidad Deportiva | Dashboard with VD metrics |
| 13 | VD YTD Outcome | Non-zero MXN value |
| 14 | Console: zero 400 errors on VD | Clean |
| 15 | VD persona switcher works | Admin/Gerente/Vendedor roles |

### Verification Script

Create `web/scripts/verify-all-seeds.ts` that checks both tenants:

| # | Gate | Check |
|---|------|-------|
| 1 | Optica Luminar: 22 entities | Count matches |
| 2 | Optica Luminar: 1 rule set | Count matches |
| 3 | Optica Luminar: 12 assignments | Count matches |
| 4 | Optica Luminar: 12 calculation results | Count matches |
| 5 | Optica Luminar: 12 outcomes | Count matches |
| 6 | Optica Luminar: star performer (Carlos Garcia) highest payout | Verified |
| 7 | Velocidad Deportiva: 35 entities | Count matches |
| 8 | Velocidad Deportiva: 2 rule sets | Count matches |
| 9 | Velocidad Deportiva: 36 assignments | Count matches |
| 10 | Velocidad Deportiva: 108 calculation results | Count matches |
| 11 | Velocidad Deportiva: 36 outcomes | Count matches |
| 12 | VD-A05 attendance gate: zero payout | Verified |
| 13 | VD-A10 attendance gate: zero payout | Verified |
| 14 | VD-A01 streak: 6 months | Verified |
| 15 | Build passes | Zero errors |

**Commit:** `OB-45 Phase 4: CLT verification — both tenants`

---

## PHASE 5: COMPLETION REPORT + PR

Create `OB-45_COMPLETION_REPORT.md` at PROJECT ROOT.

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "OB-45: Full demo data seed — Optica Luminar + Velocidad Deportiva"
git push origin dev
gh pr create --base main --head dev \
  --title "OB-45: Full demo data seed — both tenants populated" \
  --body "Seeded complete demo data for both tenants. Optica Luminar: 22 entities, 6-component commission plan with certification gating, 12 calc results. Velocidad Deportiva: 35 entities, 2 rule sets (floor sales + online), 108 calc results across 6 months, gamification medals, attendance gates, streak bonuses. Both dashboards show populated metrics. CLT: [X]/15 gates pass."
```

---

## ANTI-PATTERNS TO AVOID

- **Do NOT create entities with random UUIDs.** Use deterministic UUIDs so seeds are idempotent.
- **Do NOT skip calculation results.** The dashboard cards (YTD Outcome, Target Achievement, etc.) read from calculation_results. No results = empty dashboard.
- **Do NOT use placeholder/zero values.** The numbers must tell a story — star performers earn more, attendance-gated employees earn zero, certification matters.
- **Service role key for ALL inserts.** RLS blocks normal writes for seed data. Use the service role key to bypass.
- **git commands from spm-platform/ root. npm commands from web/.**
- **Test that the dashboard actually shows data after seeding.** Don't just verify row counts — verify the UI renders meaningful numbers.
