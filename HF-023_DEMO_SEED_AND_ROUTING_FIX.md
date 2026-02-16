# HF-023: DEMO TENANT SEED + VL ADMIN ROUTING FIX

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## Standing Rules
Read VIALUCE_STANDING_PRINCIPLES.md if it exists. All principles are non-negotiable.
After EVERY commit: `git push origin dev`
After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.

---

## CONTEXT

OB-44 is merged to main. The platform loads but three critical issues exist:

1. **No login gate.** The VL Platform Admin lands directly on the home dashboard without being prompted to log in. There is either a stale session or the auth middleware is not enforcing authentication.

2. **No tenant picker redirect.** Even when authenticated, the VL Platform Admin (scope_level = 'platform') should be redirected to `/select-tenant` before seeing any workspace. Instead, it lands on the home dashboard with no tenant selected.

3. **400 Bad Request flood.** Every Supabase query sends null tenant_id because no tenant is selected. The console shows 65+ errors. All pages assume a tenant is in context and fire queries immediately on mount.

4. **No demo data.** Supabase tables exist but have no meaningful tenant data. The dashboard shows $0.00, 0 entities, nothing to demonstrate.

These issues are connected: without authentication enforcement, without tenant routing, and without demo data, the platform appears broken.

---

## PHASE 0: RECONNAISSANCE

```bash
cd /Users/AndrewAfrica/spm-platform/web

# What auth users exist in Supabase?
grep -rn "createUser\|seed\|platform@\|sofia@\|diego@" supabase/ src/lib/ --include="*.sql" --include="*.ts" | head -20

# Check middleware for auth enforcement
cat src/middleware.ts

# Check auth context
grep -n "scope_level\|platform\|select-tenant\|redirect\|tenant" src/contexts/auth-context.tsx | head -20

# Check auth shell for routing logic
grep -n "scope_level\|platform\|select-tenant\|tenant" src/components/layout/auth-shell.tsx | head -20

# Check if login page exists
ls src/app/login/ 2>/dev/null || echo "No login directory"
cat src/app/login/page.tsx 2>/dev/null | head -30

# Check tenant picker
cat src/app/select-tenant/page.tsx | head -40

# Check what Supabase tables have data
# (We can't query Supabase from CLI, but check seed files)
ls supabase/seed* 2>/dev/null
cat supabase/seed.sql 2>/dev/null | head -50

# Check env for Supabase service role key (needed for admin user creation)
grep "SERVICE_ROLE\|SUPABASE_URL" .env.local 2>/dev/null | head -5
```

Read all results. Understand current state completely before proceeding.

**Commit:** `HF-023 Phase 0: Reconnaissance findings`

---

## PHASE 1: AUTH AND ROUTING FIX

### Problem
The platform admin bypasses login AND bypasses tenant selection, causing every Supabase query to fail with 400 because tenant_id is null.

### 1A: Enforce Authentication in Middleware

In `src/middleware.ts`, ensure:
- ALL routes except `/login`, `/api/auth/`, and static assets require an active Supabase session
- If no session exists, redirect to `/login`
- The middleware must check `supabase.auth.getUser()` or `supabase.auth.getSession()` on every request

```typescript
// Pseudocode for middleware logic:
const publicPaths = ['/login', '/api/auth'];
const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p));

if (!isPublic) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
```

### 1B: Platform Admin → Tenant Picker Redirect

After authentication is confirmed, check if the user is a platform admin who needs to select a tenant:

```typescript
// After session is confirmed:
// Load the user's profile to get scope_level
// If scope_level === 'platform' AND no tenant is currently selected:
//   redirect to /select-tenant
//
// "No tenant selected" can be determined by:
//   - A cookie: 'vialuce-selected-tenant' 
//   - Or a URL parameter
//   - Or absence of tenant_id in the profile's current context
```

The tenant selection should be stored in a **cookie** so the middleware can check it without a database call on every request. When the user selects a tenant on `/select-tenant`, set the cookie. When they click "switch tenant" in the nav rail, clear the cookie and redirect to `/select-tenant`.

**Important:** Non-platform users (scope_level = 'tenant', 'division', 'individual') get their tenant_id from their profile and should NEVER see the tenant picker. They go straight to the home dashboard.

### 1C: Null Tenant Guard on Service Layer

Find the main Supabase service files (likely in `src/lib/supabase/`) and add a guard:

```typescript
export function requireTenantId(tenantId: string | null | undefined): string {
  if (!tenantId) {
    console.warn('No tenant selected — skipping Supabase query');
    throw new Error('TENANT_REQUIRED');
  }
  return tenantId;
}
```

Call this at the top of every function that queries tenant-scoped data. This converts 400 errors into caught exceptions that the UI can handle gracefully (show "Select a tenant" message instead of broken state).

### 1D: Auth Shell Guard

In `src/components/layout/auth-shell.tsx` (or equivalent layout wrapper):
- If user is loading: show spinner
- If user is not authenticated: show nothing (middleware handles redirect)
- If user is platform-scoped and no tenant selected: show nothing (middleware handles redirect)  
- If user has a tenant: render children normally

This prevents the brief flash of the dashboard with 400 errors before redirect kicks in.

### 1E: Verify

1. Clear browser localStorage and cookies for localhost
2. Navigate to localhost:3000 → should redirect to `/login`
3. Console should show ZERO 400 errors on login page
4. Log in as platform@vialuce.com → should redirect to `/select-tenant`
5. Console should show ZERO 400 errors on tenant picker page

**Commit:** `HF-023 Phase 1: Auth enforcement, tenant picker redirect, null tenant guard`

---

## PHASE 2: OPTICA LUMINAR DEMO TENANT SEED

Create a seed script that populates the Optica Luminar demo tenant. This must use the Supabase admin API for auth user creation.

### 2A: Create Seed Script

Create `web/scripts/seed-optica-luminar.ts` (TypeScript) that uses `@supabase/supabase-js` with the service role key.

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
```

### 2B: Tenant Record

```sql
-- Use a deterministic UUID so the script is idempotent
INSERT INTO tenants (id, name, slug, industry, country_code, currency_code, locale, tier, modules_enabled, settings)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Optica Luminar',
  'optica-luminar',
  'retail_optical',
  'MX',
  'MXN',
  'es-MX',
  'professional',
  '{icm}',
  '{
    "hierarchy_labels": {"0": "Organización", "1": "Zona", "2": "Tienda", "3": "Equipo"},
    "entity_type_labels": {"individual": "Empleado", "location": "Tienda", "team": "Equipo", "organization": "Empresa"},
    "outcome_label": "Comisión",
    "domain_labels": {"rule_set": "Plan de Compensación", "outcome_value": "Pago"}
  }'
)
ON CONFLICT (id) DO NOTHING;
```

### 2C: Auth Users (3 for Optica Luminar)

Use `supabase.auth.admin.createUser()`:

| Email | Password | Display Name | scope_level | capabilities |
|-------|----------|-------------|-------------|-------------|
| admin@opticaluminar.mx | demo-password-OL1 | Laura Mendez | tenant | view_outcomes, approve_outcomes, export_results, manage_rule_sets, manage_assignments, design_scenarios |
| gerente@opticaluminar.mx | demo-password-OL2 | Roberto Castillo | division | view_outcomes, approve_outcomes, export_results |
| vendedor@opticaluminar.mx | demo-password-OL3 | Sofia Navarro | individual | view_outcomes |

Set `email_confirm: true` so they can log in immediately. After creating each auth user, insert a matching row in the `profiles` table linking them to the Optica Luminar tenant.

Also ensure the existing platform@vialuce.com user has a profile with scope_level = 'platform'.

### 2D: Entities (22 total)

Create entities in the `entities` table with deterministic UUIDs:

**1 Organization:**
- Optica Luminar (type: organization)

**3 Zones:**
- Zona Centro, Zona Norte, Zona Sur (type: zone or region — check what entity_type values exist)

**6 Locations (Stores):**

| external_id | display_name | Zone | Pattern |
|------------|-------------|------|---------|
| OL-CDMX-001 | Optica Luminar Polanco | Centro | Star (125% attainment) |
| OL-CDMX-002 | Optica Luminar Reforma | Centro | Strong (105% attainment) |
| OL-MTY-001 | Optica Luminar San Pedro | Norte | Strong (98%) |
| OL-GDL-001 | Optica Luminar Providencia | Sur | Normal (85%) |
| OL-PUE-001 | Optica Luminar Angelopolis | Centro | Below target (72%) |
| OL-CAN-001 | Optica Luminar Kukulcan | Sur | Seasonal star (110%) |

**12 Individuals (2 per store):**

Use Mexican names. Store the certification status in attributes JSONB:

| Store | Individual 1 | Cert | Individual 2 | Cert |
|-------|-------------|------|-------------|------|
| Polanco | Carlos Garcia Lopez | certificado | Maria Rodriguez Hernandez | certificado |
| Reforma | Juan Martinez Perez | certificado | Ana Gonzalez Torres | no_certificado |
| San Pedro | Pedro Sanchez Rivera | certificado | Sofia Flores Gomez | certificado |
| Providencia | Miguel Diaz Cruz | no_certificado | Isabella Morales Reyes | no_certificado |
| Angelopolis | Luis Gutierrez Ortiz | no_certificado | Valentina Castillo Ramos | certificado |
| Kukulcan | Diego Santos Jimenez | certificado | Camila Ruiz Mendoza | no_certificado |

Each entity gets:
```json
{
  "attributes": {
    "certification": "certificado",  // or "no_certificado"
    "hire_date": "2022-03-15",
    "role": "Vendedor"
  }
}
```

### 2E: Entity Relationships

Wire the hierarchy in `entity_relationships`:
- Organization → 3 Zones (relationship_type: 'parent_of')
- Zones → Locations (relationship_type: 'parent_of')
- Locations → Individuals (relationship_type: 'member_of')

All relationships: source = 'seed', confidence = 1.0, status = 'active', human_confirmed = true.

### 2F: Rule Set

Insert one rule set into `rule_sets` with a 5-layer JSONB definition representing the Optica Luminar 6-component compensation plan:

```json
{
  "meta": {
    "name": "Plan de Comisiones Optica Luminar 2024",
    "effective_date": "2024-01-01",
    "end_date": "2024-12-31",
    "cadence": "monthly",
    "currency": "MXN"
  },
  "variants": [
    {
      "id": "certificado",
      "name": "Certificado",
      "conditions": [{"field": "certification", "operator": "eq", "value": "certificado"}]
    },
    {
      "id": "no_certificado",
      "name": "No Certificado",
      "conditions": [{"field": "certification", "operator": "eq", "value": "no_certificado"}]
    }
  ],
  "components": [
    {
      "id": "venta_optica",
      "name": "Venta Óptica",
      "type": "matrix_lookup",
      "weight": 1.0,
      "config": {
        "row_dimension": "store_attainment_percent",
        "col_dimension": "store_volume_tier",
        "variant_matrices": {
          "certificado": {
            "rows": [{"min": 0, "max": 79, "label": "<80%"}, {"min": 80, "max": 99, "label": "80-99%"}, {"min": 100, "max": 119, "label": "100-119%"}, {"min": 120, "max": 999, "label": "120%+"}],
            "cols": [{"min": 0, "max": 300000, "label": "Bajo"}, {"min": 300001, "max": 500000, "label": "Medio"}, {"min": 500001, "max": 999999999, "label": "Alto"}],
            "values": [[500, 600, 750], [800, 1000, 1200], [1200, 1500, 1800], [1500, 1800, 2200]]
          },
          "no_certificado": {
            "rows": [{"min": 0, "max": 79, "label": "<80%"}, {"min": 80, "max": 99, "label": "80-99%"}, {"min": 100, "max": 119, "label": "100-119%"}, {"min": 120, "max": 999, "label": "120%+"}],
            "cols": [{"min": 0, "max": 300000, "label": "Bajo"}, {"min": 300001, "max": 500000, "label": "Medio"}, {"min": 500001, "max": 999999999, "label": "Alto"}],
            "values": [[250, 300, 375], [400, 500, 600], [600, 750, 900], [750, 900, 1100]]
          }
        }
      }
    },
    {
      "id": "venta_tienda",
      "name": "Venta Tienda",
      "type": "tiered_lookup",
      "weight": 1.0,
      "config": {
        "metric": "store_attainment_percent",
        "tiers": [
          {"min": 0, "max": 79, "value": 0},
          {"min": 80, "max": 99, "value": 150},
          {"min": 100, "max": 119, "value": 300},
          {"min": 120, "max": 999, "value": 500}
        ]
      }
    },
    {
      "id": "clientes_nuevos",
      "name": "Clientes Nuevos",
      "type": "tiered_lookup",
      "weight": 1.0,
      "config": {
        "metric": "new_customers_attainment_percent",
        "tiers": [
          {"min": 0, "max": 79, "value": 0},
          {"min": 80, "max": 99, "value": 75},
          {"min": 100, "max": 119, "value": 150},
          {"min": 120, "max": 999, "value": 250}
        ]
      }
    },
    {
      "id": "cobranza",
      "name": "Cobranza",
      "type": "tiered_lookup",
      "weight": 1.0,
      "config": {
        "metric": "collections_attainment_percent",
        "tiers": [
          {"min": 0, "max": 79, "value": 0},
          {"min": 80, "max": 99, "value": 75},
          {"min": 100, "max": 119, "value": 150},
          {"min": 120, "max": 999, "value": 250}
        ]
      }
    },
    {
      "id": "club_proteccion",
      "name": "Club de Protección",
      "type": "percentage_with_gate",
      "weight": 1.0,
      "config": {
        "metric": "individual_insurance_sales",
        "gate_metric": "store_insurance_attainment_percent",
        "rates": [
          {"gate_min": 0, "gate_max": 99, "rate": 0.03},
          {"gate_min": 100, "gate_max": 999, "rate": 0.05}
        ]
      }
    },
    {
      "id": "garantia_extendida",
      "name": "Garantía Extendida",
      "type": "flat_percentage",
      "weight": 1.0,
      "config": {
        "metric": "individual_warranty_sales",
        "rate": 0.04
      }
    }
  ],
  "aggregation": {
    "method": "sum",
    "output_type": "monetary",
    "currency": "MXN"
  }
}
```

### 2G: Rule Set Assignments

Assign all 12 individual entities to this rule set. The variant (certificado/no_certificado) is determined at calculation time from the entity's attributes, but the assignment links entity to rule_set.

### 2H: Committed Data (Period 2024-01)

Insert committed_data for period "2024-01" with store-level and individual-level metrics. Use realistic values that produce the attainment patterns specified:

**Store-level metrics (in committed_data or wherever the platform reads them):**

| Store | optical_sales | store_target | attainment% | volume_tier | new_cust_att% | collections_att% | insurance_att% |
|-------|-------------|-------------|------------|------------|--------------|-----------------|---------------|
| Polanco | 625,000 | 500,000 | 125% | Alto | 115% | 108% | 105% |
| Reforma | 525,000 | 500,000 | 105% | Alto | 102% | 95% | 110% |
| San Pedro | 441,000 | 450,000 | 98% | Medio | 92% | 88% | 95% |
| Providencia | 340,000 | 400,000 | 85% | Medio | 80% | 82% | 78% |
| Angelopolis | 259,200 | 360,000 | 72% | Bajo | 68% | 70% | 65% |
| Kukulcan | 385,000 | 350,000 | 110% | Medio | 105% | 98% | 102% |

**Individual-level metrics (per entity):**

| Entity | insurance_sales | warranty_sales |
|--------|----------------|---------------|
| Carlos Garcia (Polanco, cert) | 2,800 | 5,200 |
| Maria Rodriguez (Polanco, cert) | 3,100 | 4,800 |
| Juan Martinez (Reforma, cert) | 2,200 | 3,900 |
| Ana Gonzalez (Reforma, no_cert) | 1,900 | 4,100 |
| Pedro Sanchez (San Pedro, cert) | 2,500 | 3,500 |
| Sofia Flores (San Pedro, cert) | 2,100 | 3,200 |
| Miguel Diaz (Providencia, no_cert) | 1,400 | 2,800 |
| Isabella Morales (Providencia, no_cert) | 1,200 | 2,500 |
| Luis Gutierrez (Angelopolis, no_cert) | 900 | 1,800 |
| Valentina Castillo (Angelopolis, cert) | 1,100 | 2,200 |
| Diego Santos (Kukulcan, cert) | 2,600 | 4,000 |
| Camila Ruiz (Kukulcan, no_cert) | 2,000 | 3,400 |

### 2I: Run the Seed Script

```bash
npx tsx scripts/seed-optica-luminar.ts
```

Or if tsx isn't available:
```bash
npx ts-node --esm scripts/seed-optica-luminar.ts
```

The script must:
- Check for existing data before inserting (idempotent)
- Log what it creates
- Handle errors gracefully
- Exit with code 0 on success

**Commit:** `HF-023 Phase 2: Optica Luminar demo tenant seed — tenant, users, entities, relationships, rule set, data`

---

## PHASE 3: VERIFICATION

### 3A: Clean Build

```bash
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Must return 200 (or 307 redirect to /login which is also correct).

### 3B: Auth Flow — Platform Admin

1. Open localhost:3000 in a fresh browser (or incognito)
2. Should redirect to `/login`
3. Log in as `platform@vialuce.com` / whatever password was set
4. Should redirect to `/select-tenant`
5. Should see "Optica Luminar" as a selectable tenant
6. Click it → enters tenant context → home dashboard loads
7. Console: ZERO 400 errors throughout this entire flow

### 3C: Auth Flow — Tenant Admin

1. Log out
2. Log in as `admin@opticaluminar.mx` / `demo-password-OL1`
3. Should go directly to home dashboard (NOT tenant picker)
4. Navigate to Configure → should see 22 entities
5. Navigate to Design or wherever rule sets are visible → should see the commission plan
6. Console: ZERO 400 errors

### 3D: Data Presence

- Home dashboard should show non-zero values (entities count, some outcome data if materialized)
- Entities page should list individuals, locations, zones
- Rule set should be visible and inspectable

### 3E: Console Audit

```bash
# While the app is running, check browser console
# Must see: ZERO 400 errors
# Must see: ZERO unhandled promise rejections
# Acceptable: warnings about missing optional data
```

**Commit:** `HF-023 Phase 3: Verification — auth flow, data presence, zero errors`

---

## PHASE 4: COMPLETION REPORT

Create `HF-023_COMPLETION_REPORT.md` in **PROJECT ROOT** (same level as package.json).

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | Unauthenticated user redirects to /login | | |
| 2 | Platform admin redirects to /select-tenant after login | | |
| 3 | Zero 400 errors on /login page | | |
| 4 | Zero 400 errors on /select-tenant page | | |
| 5 | Optica Luminar tenant exists in Supabase | | |
| 6 | 3 auth users created and can log in | | |
| 7 | 22 entities visible (1 org + 3 zones + 6 stores + 12 individuals) | | |
| 8 | Entity relationships form correct hierarchy | | |
| 9 | Rule set visible with 6 components + 2 variants | | |
| 10 | Committed data exists for 2024-01 | | |
| 11 | Tenant-scoped user (admin@opticaluminar.mx) skips tenant picker | | |
| 12 | Build passes with zero errors | | |
| 13 | localhost:3000 responds correctly | | |

**Commit:** `HF-023 Phase 4: Completion report`
**Push:** `git push origin dev`

---

## CRITICAL NOTES

- Auth users require the Supabase admin API — you CANNOT insert into auth.users via SQL. Use `createClient` with the `SUPABASE_SERVICE_ROLE_KEY`.
- Check `.env.local` for `SUPABASE_SERVICE_ROLE_KEY`. If it doesn't exist, check the Supabase dashboard → Settings → API → service_role key.
- All entity UUIDs should be deterministic (hardcoded) so the seed is idempotent and can be re-run safely.
- The seed script must handle `ON CONFLICT` / check-before-insert patterns.
- The cookie for tenant selection should be httpOnly if possible, or at minimum a secure cookie. Name suggestion: `vialuce-tenant-id`.
- Do NOT break existing functionality. The auth changes must still work for users who already have sessions.
