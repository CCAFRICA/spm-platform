# OB-52: FUNCTIONAL PIPELINE RESTORATION — LOGIN TO LOGIN

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS OB EXISTS

ViaLuce has been in a cycle: design ambitious feature → hit blocking issue → hotfix → more hotfixes → original feature never completes → next feature starts. The result: Plan Import is broken. Data Ingestion is unverified on Supabase. There is no Tenant Creation UI. There is no User Invite flow. There is no Billing Engine. The Organizational Canvas — specified as the "highest-priority deliverable" in OB-44 — has zero code.

A customer cannot be launched through the platform. Every demo tenant was seeded via terminal scripts. The platform cannot scale without a working UI pipeline from "new customer says yes" to "rep checks their commission."

This OB restores the functional pipeline. It is not about visual design. It is about making things work.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.
6. Commit this prompt to git as first action.
7. Security/scale/performance by design not retrofitted. AI-first never hardcoded. Domain-agnostic always.
8. VL Admin: all users select preferred language. No forced English override.
9. Rule 25: Completion report is FIRST deliverable, not last. Create before final build, append results.

## CC ANTI-PATTERNS — THE FAILURES THAT LED HERE

| Anti-Pattern | What Happened | Prevention |
|---|---|---|
| **Feature Leap** | OB-44 specified Organizational Canvas as #1 priority. CC built page layouts instead. Canvas was never started. | Phase gates: do NOT proceed to Phase N+1 until Phase N proof gates pass. |
| **Seed Script Substitution** | Every demo tenant was created by seed scripts. Import pipeline was never wired to Supabase through the UI. | This OB tests through the UI, not seed scripts. Every phase proves the UI flow works. |
| **Silent Regression** | Plan Import broke when tenant context was null after auth refactoring. Nobody noticed for 7 days. | Phase 1 specifically tests Plan Import. If it fails, fix it before proceeding. |
| **localStorage Regression** | ANY code path that reads/writes localStorage for business data is a BUG. All business data flows through Supabase. | grep for localStorage usage in business logic. Flag and fix. |
| **Placeholder Syndrome** | CC substitutes stubs for real logic. "Coming Soon" cards everywhere. | Every phase has proof gates requiring REAL data to flow. No stubs. |

---

## DESIGN REFERENCES — READ BEFORE PHASE 1

```bash
echo "=== READING ALL REFERENCES ==="

echo "--- Login-to-Login journey ---"
cat VIALUCE_TENANT_ONBOARDING_LOGIN_TO_LOGIN.md 2>/dev/null | head -100
# If not at root, try project files
cat /mnt/project/VIALUCE_TENANT_ONBOARDING_LOGIN_TO_LOGIN.md 2>/dev/null | head -100

echo ""
echo "--- Open Items / Backlog ---"
cat VIALUCE_OPEN_ITEMS.md 2>/dev/null | head -100

echo ""
echo "--- Entity Model Design (for Canvas) ---"
# This is a docx — read programmatically if available, otherwise check project knowledge
echo "Entity Model Design: D8 = Organizational Canvas — zoomable spatial surface, 4 zoom levels, drag-to-reassign, draw-to-relate, AI confirmation mode"

echo ""
echo "--- DS-005 Data Ingestion Facility ---"
cat DS-005_DATA_INGESTION_FACILITY.md 2>/dev/null | head -60

echo ""
echo "--- OB-48 Import Pipeline E2E ---"
cat OB-48_IMPORT_PIPELINE_E2E.md 2>/dev/null | head -60

echo ""
echo "--- Current Supabase Schema ---"
find supabase -name "*.sql" | sort
```

---

## PHASE 0: DIAGNOSTIC — WHAT WORKS AND WHAT DOESN'T

Before fixing anything, map the current state of every pipeline component.

```bash
echo "============================================"
echo "OB-52 PHASE 0: PIPELINE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: PLAN IMPORT — DOES THE PAGE EXIST? ==="
find web/src/app -path "*plan*import*" -name "page.tsx" 2>/dev/null
find web/src/app -path "*import*plan*" -name "page.tsx" 2>/dev/null
find web/src/app -path "*operate*import*" -name "page.tsx" 2>/dev/null
find web/src/app -path "*launch*plan*" -name "page.tsx" 2>/dev/null
echo "--- All import-related pages ---"
find web/src/app -path "*import*" -name "page.tsx" | sort

echo ""
echo "=== 0B: PLAN IMPORT — DOES IT USE SUPABASE OR LOCALSTORAGE? ==="
for f in $(find web/src -path "*plan*import*" -o -path "*plan*interpret*" | grep -E "\.(tsx?|ts)$" | head -10); do
  echo "--- $f ---"
  grep -n "localStorage\|supabase\|rule_sets\|createClient\|useSupabase" "$f" 2>/dev/null | head -5
done

echo ""
echo "=== 0C: PLAN INTERPRETER — AI WIRING ==="
find web/src -name "*plan-interpret*" -o -name "*ai-plan*" | grep -E "\.ts$" | head -5
echo "--- API routes for plan ---"
find web/src/app/api -path "*plan*" -name "route.ts" | sort

echo ""
echo "=== 0D: DATA IMPORT — ENHANCED IMPORT PAGE ==="
find web/src/app -path "*data*import*" -o -path "*enhanced*import*" | head -5
echo "--- Does it use Supabase? ---"
for f in $(find web/src -path "*import*" -name "page.tsx" | head -5); do
  echo "--- $f ---"
  grep -n "localStorage\|supabase\|committed_data\|import_batches" "$f" 2>/dev/null | head -5
done

echo ""
echo "=== 0E: TENANT CONTEXT — IS IT AVAILABLE ON IMPORT PAGES? ==="
grep -rn "currentTenant\|useAuth\|useTenant\|tenant_id\|tenantId" \
  web/src/app/*import*/*.tsx web/src/app/operate/*/*.tsx 2>/dev/null | head -10

echo ""
echo "=== 0F: TENANT CREATION — WHAT EXISTS? ==="
echo "--- Observatory Onboarding tab ---"
find web/src -path "*onboard*" -name "*.tsx" | head -5
echo "--- Tenant creation API ---"
find web/src/app/api -path "*tenant*" -name "route.ts" | sort
echo "--- Seed scripts (what we're replacing) ---"
find web -name "seed-*" -o -name "provision-*" | head -5

echo ""
echo "=== 0G: USER INVITE — WHAT EXISTS? ==="
grep -rn "inviteUserByEmail\|createUser\|auth.admin" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10
echo "--- Resend integration ---"
find web/src -path "*email*" -o -path "*invite*" -o -path "*resend*" | grep -E "\.ts$" | head -5

echo ""
echo "=== 0H: BILLING / METERING — WHAT EXISTS? ==="
grep -rn "usage_metering\|metering\|billing\|subscription" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10
echo "--- Supabase metering table ---"
grep -rn "usage_metering\|metering" supabase/ --include="*.sql" 2>/dev/null | head -5

echo ""
echo "=== 0I: ORGANIZATIONAL CANVAS — WHAT EXISTS? ==="
grep -rn "xyflow\|reactflow\|react-flow\|OrganizationalCanvas\|CanvasToolbar" \
  web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | head -5
echo "--- React Flow in package.json? ---"
grep "xyflow\|reactflow" web/package.json 2>/dev/null

echo ""
echo "=== 0J: LIFECYCLE STATE MACHINE ==="
grep -rn "lifecycle\|DRAFT\|PREVIEW\|OFFICIAL\|APPROVED\|POSTED\|CLOSED\|PAID" \
  web/src/lib/ --include="*.ts" | grep -v node_modules | head -15

echo ""
echo "=== 0K: ENTITY TABLES IN SUPABASE ==="
grep -rn "entities\|entity_relationships\|entity_period_outcomes\|rule_set_assignments" \
  web/src/lib/ --include="*.ts" | grep -v node_modules | head -15

echo ""
echo "=== 0L: ALL PAGE ROUTES ==="
find web/src/app -name "page.tsx" | sort

echo ""
echo "=== 0M: LOCALSTORAGE REGRESSION CHECK ==="
grep -rn "localStorage\." web/src/lib/ web/src/app/ --include="*.ts" --include="*.tsx" \
  | grep -v node_modules | grep -v ".next" | grep -v "// " \
  | grep -v "collapsed\|theme\|sidebar\|ui_state\|demo_persona\|nav_signals" | head -20
echo "ABOVE: Any localStorage usage that is NOT ephemeral UI state is a BUG"

echo ""
echo "============================================"
echo "PASTE FULL OUTPUT INTO COMPLETION REPORT"
echo "============================================"
```

**Commit:** `OB-52 Phase 0: Pipeline diagnostic — plan import, data import, tenant creation, billing, canvas`

---

## PHASE 1: FIX PLAN IMPORT — RESTORE AI PLAN INTERPRETATION ON SUPABASE

### The Problem
Plan Import was last verified working on Feb 9-10 (CLT sessions). The specific failure diagnosed was `currentTenant is null/undefined` when clicking "Confirm & Import Plan." Since then, OB-42/43 migrated to Supabase, OB-44-51 rebuilt UI. Plan Import was never re-verified.

### 1A: Trace the Plan Import flow

```bash
echo "=== PLAN IMPORT: Full file trace ==="
# Find the plan import page
PLAN_PAGE=$(find web/src/app -path "*plan*import*" -name "page.tsx" | head -1)
echo "Plan import page: $PLAN_PAGE"
cat "$PLAN_PAGE" 2>/dev/null | head -100

echo ""
echo "--- Where does it save the plan? ---"
grep -n "handleImport\|savePlan\|insertPlan\|rule_sets\|localStorage\|supabase" "$PLAN_PAGE" 2>/dev/null | head -20

echo ""
echo "--- AI interpretation API route ---"
PLAN_API=$(find web/src/app/api -path "*plan*" -name "route.ts" | head -1)
echo "Plan API: $PLAN_API"
cat "$PLAN_API" 2>/dev/null | head -60
```

### 1B: Fix tenant context availability

The plan import page must have access to `currentTenant` (or equivalent tenant context). If it's null:
1. Check if the page is wrapped in the auth/tenant context provider
2. Check if the import page is inside the authenticated layout that provides tenant context
3. If the page is a standalone route outside the auth shell, move it inside or pass tenant context via URL params

### 1C: Fix plan storage — localStorage → Supabase

After AI interpretation, the confirmed plan must be saved to the `rule_sets` table in Supabase:

```typescript
// The confirmed plan save MUST do this:
const { data, error } = await supabase
  .from('rule_sets')
  .insert({
    tenant_id: currentTenant.id,
    name: parsedPlan.name || 'Imported Plan',
    description: `AI-interpreted from ${fileName}`,
    components: parsedPlan.components,  // JSONB
    source: 'ai_interpreted',
    confidence: parsedPlan.overallConfidence,
    status: 'active',
    version: 1,
    created_by: currentUser.id,
  })
  .select()
  .single();
```

If the page currently writes to localStorage, replace with Supabase insert. If it already uses Supabase but the insert fails, diagnose (RLS policy? missing columns? null tenant?).

### 1D: After plan save — assign entities

After the rule set is created, assign all tenant entities to it:

```typescript
// Get all entities for this tenant
const { data: entities } = await supabase
  .from('entities')
  .select('id')
  .eq('tenant_id', currentTenant.id)
  .eq('status', 'active');

// Create rule_set_assignments
if (entities?.length) {
  const assignments = entities.map(e => ({
    entity_id: e.id,
    rule_set_id: ruleSet.id,
    tenant_id: currentTenant.id,
    effective_start: new Date().toISOString(),
    source: 'import_auto',
  }));
  await supabase.from('rule_set_assignments').insert(assignments);
}
```

### 1E: Post-import guidance

After successful plan save, show:
```
✅ Plan imported successfully — [N] components, [M] entities assigned
→ Next: Upload your performance data to start calculations
[Upload Data →] button linking to data import page
```

### 1F: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-1 | Plan import page loads without errors | Navigate to plan import URL |
| PG-2 | Tenant context is available (not null) | Console log currentTenant on page load |
| PG-3 | AI interpretation API is reachable | Check for Anthropic API route, verify env var exists |
| PG-4 | Confirmed plan saves to `rule_sets` table in Supabase | After confirm, query `rule_sets` for new row |
| PG-5 | No localStorage writes for plan data | grep plan import page for localStorage — count must be 0 |
| PG-6 | Post-import guidance shows with "Upload Data →" link | UI renders after successful save |

**Commit:** `OB-52 Phase 1: Plan Import restored — Supabase storage, tenant context, post-import guidance`

---

## PHASE 2: FIX DATA IMPORT — VERIFY FULL PIPELINE ON SUPABASE

### The Problem
Data import (Enhanced Import) was last tested on Feb 10 (CLT-14B). The full pipeline: Upload Excel → AI classifies sheets → AI maps fields → Admin confirms → Data committed to `committed_data` table. This has not been verified since the UI rebuild (OB-46 onwards).

### 2A: Trace the Data Import flow

```bash
echo "=== DATA IMPORT: Full file trace ==="
# Find the enhanced/data import page
IMPORT_PAGE=$(find web/src/app -path "*import*" -name "page.tsx" | grep -v plan | head -1)
echo "Import page: $IMPORT_PAGE"
cat "$IMPORT_PAGE" 2>/dev/null | head -100

echo ""
echo "--- Storage: localStorage or Supabase? ---"
grep -n "localStorage\|supabase\|committed_data\|import_batches\|data_layer" "$IMPORT_PAGE" 2>/dev/null | head -20

echo ""
echo "--- AI classification API ---"
find web/src/app/api -path "*workbook*" -o -path "*classify*" -o -path "*import*" | grep "route.ts" | sort

echo ""
echo "--- Data layer services ---"
find web/src/lib -name "*data-layer*" -o -name "*import*service*" | head -10
```

### 2B: Verify AI Classification → Supabase

The sheet classification (AI call) must:
1. Hit the Anthropic API route (not browser-side API call)
2. Return classified sheets with semantic types
3. Store classification results in `import_batches` or `classification_signals` table

### 2C: Verify Field Mapping → Supabase

The field mapping (AI auto-suggestion) must:
1. Suggest mappings with confidence scores
2. Allow admin override
3. Store final mappings (for ML learning loop)

### 2D: Verify Data Commitment → Supabase

After admin confirms mappings and approves:
1. Raw data → `committed_data` table (not localStorage!)
2. Entity resolution → `entities` table (new entities created for unrecognized IDs)
3. Period detection → `periods` table (new period created if not exists)
4. Import batch record → `import_batches` table with metadata

### 2E: Eliminate localStorage remnants

```bash
echo "=== localStorage in import pipeline ==="
for f in $(find web/src -path "*import*" -o -path "*data-layer*" | grep -E "\.tsx?$"); do
  hits=$(grep -c "localStorage" "$f" 2>/dev/null)
  if [ "$hits" -gt "0" ]; then
    echo "⚠️  $f: $hits localStorage references"
  fi
done
```

Replace ALL localStorage business data reads/writes with Supabase operations. The ONLY acceptable localStorage uses are: sidebar collapsed state, theme preference, demo persona selection, nav signals.

### 2F: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-7 | Import page loads, file upload zone renders | Navigate to import page |
| PG-8 | Tenant context available on import page | Console log currentTenant |
| PG-9 | AI classification API reachable | Check API route exists, Anthropic key configured |
| PG-10 | No localStorage writes for business data in import pipeline | grep count = 0 |
| PG-11 | If existing import_batches table has data, import page can list past imports | Query and display |
| PG-12 | Import audit trail: every import creates a record in import_batches with batch_id, tenant_id, file metadata | Schema check |

**Commit:** `OB-52 Phase 2: Data Import verified on Supabase — no localStorage regression`

---

## PHASE 3: TENANT CREATION UI — OBSERVATORY ONBOARDING

### The Problem
Every demo tenant was created via seed scripts. No UI exists to create a tenant. The Login-to-Login journey begins with "VL Admin creates tenant" — and that step requires running a terminal command.

### 3A: Build the Tenant Creation Form

Location: Observatory Onboarding tab (VL Admin only). The form should be a multi-step wizard or a single form with sections:

**Step 1: Basic Information**
- Name (required): e.g., "Óptica Luminar"
- Slug (auto-derived from name, editable): e.g., "optica-luminar"
- Industry (dropdown: Retail, Telecommunications, Financial Services, Restaurant/F&B, Manufacturing, Professional Services, Other)
- Country (dropdown)
- Currency (auto from country, editable): MXN, COP, USD, EUR, etc.
- Locale (auto from country, editable): es-MX, en-US, etc.

**Step 2: Module Selection**
- Checkboxes: ICM (Incentive Compensation), FRMX (Financial/Restaurant), SPM (Sales Performance) — with descriptions
- At least one module required

**Step 3: Configuration Labels (optional, can skip with defaults)**
- Hierarchy labels: Level 1 name (default: "Region"), Level 2 (default: "Zone"), Level 3 (default: "Location")
- Entity type labels: Individual (default: "Employee"), Location (default: "Store")
- These populate the `settings` JSONB

### 3B: API Route — Server-side tenant creation

```
POST /api/platform/tenants/create
```

This MUST use `createServiceRoleClient()` (not browser client) because:
- RLS may block tenant creation from browser
- `auth.admin.createUser()` requires service role for creating the first admin user

```typescript
// API route handler
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const body = await request.json();
  
  // 1. Create tenant
  const { data: tenant, error } = await supabase
    .from('tenants')
    .insert({
      name: body.name,
      slug: body.slug,
      industry: body.industry,
      country: body.country,
      currency: body.currency,
      locale: body.locale,
      modules_enabled: body.modules,
      settings: {
        hierarchy_labels: body.hierarchyLabels || defaultLabels,
        entity_type_labels: body.entityTypeLabels || defaultEntityLabels,
      },
    })
    .select()
    .single();
  
  if (error) return Response.json({ error: error.message }, { status: 400 });
  
  // 2. Write metering event (billing foundation)
  await supabase.from('usage_metering').insert({
    tenant_id: tenant.id,
    event_type: 'tenant_created',
    quantity: 1,
    metadata: { created_by: 'vl_admin', industry: body.industry },
  }).catch(() => {}); // Don't fail on metering
  
  return Response.json({ tenant });
}
```

### 3C: After creation — navigate to tenant

After successful creation:
1. Show success: "Tenant [name] created"
2. Offer two actions:
   - "Create First Admin User →" (goes to Phase 4 invite flow)
   - "Go to Tenant Dashboard →" (sets tenant context, navigates to /)
3. New tenant appears in Observatory fleet cards immediately

### 3D: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-13 | Onboarding tab has "Create Tenant" button or form | Navigate to Observatory → Onboarding |
| PG-14 | Form submits and creates row in `tenants` table | Create test tenant, query Supabase |
| PG-15 | New tenant appears in Observatory fleet cards | Refresh Observatory after creation |
| PG-16 | API route uses service role client (not browser client) | Check createServiceRoleClient() in route |
| PG-17 | Metering event written for tenant creation | Query usage_metering table |

**Commit:** `OB-52 Phase 3: Tenant creation UI — form, API route, Observatory integration`

---

## PHASE 4: USER INVITE FLOW — FROM CREATION TO LOGIN

### The Problem
All users are created via seed scripts using `auth.admin.createUser()`. No UI exists to invite a user. Resend is configured and tested, but no invite email flow is built.

### 4A: Build the User Invite Form

Location: Could live in:
- Observatory → Onboarding tab → inside the new tenant creation flow ("Create First Admin User")
- OR a User Management page within the tenant context (Configure → Personnel)

For now, build it in the Observatory Onboarding flow as the natural next step after tenant creation.

**Form fields:**
- Email (required)
- Display Name (required)
- Role template (dropdown): Platform Admin, Tenant Admin, Manager, Individual/Rep
  - Each template sets `scope_level` and `capabilities` automatically
- Custom capabilities override (advanced, collapsible)

### 4B: API Route — Server-side user creation + invite

```
POST /api/platform/users/invite
```

```typescript
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const body = await request.json();
  
  // Role template → scope + capabilities mapping
  const roleTemplates = {
    'platform_admin': { scope: 'platform', capabilities: ['full_access'] },
    'tenant_admin': { scope: 'tenant', capabilities: ['admin', 'approve', 'import', 'calculate', 'configure'] },
    'manager': { scope: 'team', capabilities: ['view_team', 'approve_team'] },
    'individual': { scope: 'individual', capabilities: ['view_own', 'dispute'] },
  };
  
  const template = roleTemplates[body.role] || roleTemplates.individual;
  
  // 1. Create auth user via invite (sends email automatically)
  const { data: authUser, error: authError } = await supabase.auth.admin.inviteUserByEmail(body.email, {
    data: { display_name: body.displayName, tenant_id: body.tenantId },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login`,
  });
  
  if (authError) return Response.json({ error: authError.message }, { status: 400 });
  
  // 2. Create profile record
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authUser.user.id,
      tenant_id: body.tenantId,
      email: body.email,
      display_name: body.displayName,
      scope_level: template.scope,
      capabilities: template.capabilities,
    });
  
  if (profileError) return Response.json({ error: profileError.message }, { status: 400 });
  
  // 3. Metering event
  await supabase.from('usage_metering').insert({
    tenant_id: body.tenantId,
    event_type: 'user_invited',
    quantity: 1,
    metadata: { role: body.role, email: body.email },
  }).catch(() => {});
  
  return Response.json({ user: { id: authUser.user.id, email: body.email, role: body.role } });
}
```

### 4C: Verify Resend delivers the email

Supabase `inviteUserByEmail()` sends through the configured SMTP (Resend). Verify:
1. Supabase Auth settings → SMTP → Custom SMTP enabled
2. SMTP host: smtp.resend.com, port 465, credentials from env
3. From address: noreply@vialuce.ai
4. Redirect URL: https://vialuce.ai/login

If `inviteUserByEmail()` is not suitable (Supabase invite flow may not use custom SMTP for invites), alternative:
1. Create user with `auth.admin.createUser({ email, password: generateTempPassword(), email_confirm: true })`
2. Send custom invite email via Resend API directly with the temp password and login link
3. Force password change on first login

### 4D: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-18 | User invite form accessible from Observatory | Navigate to invite UI |
| PG-19 | Invite creates auth user in Supabase | Query auth.users |
| PG-20 | Invite creates profile in profiles table with correct tenant_id | Query profiles |
| PG-21 | Role template correctly sets scope_level and capabilities | Inspect profile record |
| PG-22 | Metering event written for user_invited | Query usage_metering |
| PG-23 | Invited user can log in at /login | If email is deliverable, verify; otherwise verify auth user exists with confirmed email |

**Commit:** `OB-52 Phase 4: User invite flow — form, API route, Resend integration, role templates`

---

## PHASE 5: BILLING FOUNDATION — METERING + OBSERVATORY TAB

### The Problem
The billing concept is designed but nothing is built. The `usage_metering` table may or may not exist in Supabase. No events are written. The Observatory Billing tab shows placeholder content.

### 5A: Create the usage_metering table if it doesn't exist

```sql
CREATE TABLE IF NOT EXISTS usage_metering (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  event_type TEXT NOT NULL,        -- 'tenant_created', 'user_invited', 'calculation_run', 'ai_inference', 'data_import', 'plan_import'
  quantity NUMERIC DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: VL Admin can read all, tenant users can read their own
ALTER TABLE usage_metering ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read all metering" ON usage_metering
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND scope_level = 'platform')
  );

CREATE POLICY "Tenant users read own metering" ON usage_metering
  FOR SELECT USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- Service role can insert (API routes)
CREATE POLICY "Service role inserts metering" ON usage_metering
  FOR INSERT WITH CHECK (true);

CREATE INDEX idx_metering_tenant ON usage_metering(tenant_id);
CREATE INDEX idx_metering_type ON usage_metering(event_type);
CREATE INDEX idx_metering_created ON usage_metering(created_at);
```

Run this via Supabase SQL editor or migration file.

### 5B: Instrument metering events

Add metering writes to key operations. These were already added in Phases 3 and 4. Additionally:

**In calculation trigger (wherever calculation_batch is created):**
```typescript
await supabase.from('usage_metering').insert({
  tenant_id, event_type: 'calculation_run', quantity: entityCount,
  metadata: { period_id, batch_id }
}).catch(() => {});
```

**In AI inference calls (plan interpretation, sheet classification, field mapping):**
```typescript
await supabase.from('usage_metering').insert({
  tenant_id, event_type: 'ai_inference', quantity: 1,
  metadata: { inference_type: 'plan_interpretation', tokens_used: response.usage?.total_tokens }
}).catch(() => {});
```

**In data import commit:**
```typescript
await supabase.from('usage_metering').insert({
  tenant_id, event_type: 'data_import', quantity: recordCount,
  metadata: { batch_id, sheets: sheetCount }
}).catch(() => {});
```

### 5C: Observatory Billing & Usage Tab — Real Data

The Billing tab should read from `usage_metering` and display:

**Per-tenant usage cards:**
- Entity count (from `entities` table)
- Calculation runs this month (from `usage_metering` where event_type = 'calculation_run')
- AI inferences this month (from `usage_metering` where event_type = 'ai_inference')
- Data imports this month (from `usage_metering` where event_type = 'data_import')

**Usage meters:** Horizontal bars showing usage vs capacity (capacity can be hardcoded initially: 50 entities, 10 calculations, 100 AI calls per month per tenant as "Standard" tier defaults).

**Cost estimate:** If AI inference events have `tokens_used` in metadata, estimate cost: tokens × $0.003/1K (rough Anthropic pricing).

### 5D: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-24 | usage_metering table exists in Supabase | SQL query |
| PG-25 | Tenant creation writes metering event | Query after Phase 3 tenant creation |
| PG-26 | User invite writes metering event | Query after Phase 4 invite |
| PG-27 | Observatory Billing tab shows real data (not placeholder) | Navigate to Billing tab |
| PG-28 | Per-tenant usage cards show entity count from real data | Compare to `entities` table count |

**Commit:** `OB-52 Phase 5: Billing foundation — metering table, event instrumentation, Observatory tab`

---

## PHASE 6: ORGANIZATIONAL CANVAS — PHASE 1 (READ-ONLY GRAPH)

### The Problem
The Organizational Canvas was specified as the "highest-priority deliverable" in OB-44 (Feb 15). Zero code exists. This phase gets Phase 1 visible: install React Flow, render the entity graph, and make it zoomable. Full interactivity (drag-to-reassign, draw-to-relate) is OB-53.

### 6A: Install React Flow

```bash
cd web
npm install @xyflow/react
```

If `@xyflow/react` is not available, try `reactflow`.

### 6B: Create Canvas Infrastructure

```
web/src/
  components/
    canvas/
      OrganizationalCanvas.tsx    — Main canvas with React Flow
      nodes/
        UnitNode.tsx              — Location/team node (name, entity count, status dot)
        EntityNode.tsx            — Individual entity node (name, role, status)
      edges/
        RelationshipEdge.tsx      — Typed edge (solid=confirmed, dashed=proposed)
  lib/
    canvas/
      graph-service.ts            — Supabase queries: getEntityGraph(tenantId)
      layout-engine.ts            — Compute positions from graph data
```

### 6C: Graph Service — Read entities and relationships

```typescript
// graph-service.ts
export async function getEntityGraph(supabase, tenantId) {
  // Get all entities
  const { data: entities } = await supabase
    .from('entities')
    .select('id, display_name, entity_type, status, external_id, attributes')
    .eq('tenant_id', tenantId);

  // Get all relationships
  const { data: relationships } = await supabase
    .from('entity_relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, confidence, source')
    .eq('tenant_id', tenantId);

  return { entities: entities || [], relationships: relationships || [] };
}
```

### 6D: OrganizationalCanvas Component

```tsx
'use client';
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export function OrganizationalCanvas({ tenantId }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  
  useEffect(() => {
    loadGraph();
  }, [tenantId]);

  async function loadGraph() {
    const { entities, relationships } = await getEntityGraph(supabase, tenantId);
    
    // Convert to React Flow format
    const rfNodes = entities.map((e, i) => ({
      id: e.id,
      type: e.entity_type === 'individual' ? 'entityNode' : 'unitNode',
      position: computePosition(e, i, entities.length), // Simple grid or force layout
      data: { 
        label: e.display_name, 
        type: e.entity_type, 
        status: e.status,
        external_id: e.external_id,
      },
    }));
    
    const rfEdges = relationships.map(r => ({
      id: r.id,
      source: r.source_entity_id,
      target: r.target_entity_id,
      type: 'relationshipEdge',
      data: { 
        type: r.relationship_type, 
        confidence: r.confidence,
        confirmed: r.source !== 'ai_inferred',
      },
      style: { 
        stroke: r.source === 'ai_inferred' ? '#fbbf24' : '#818cf8',
        strokeDasharray: r.source === 'ai_inferred' ? '5,5' : undefined,
      },
    }));
    
    setNodes(rfNodes);
    setEdges(rfEdges);
  }

  return (
    <div style={{ width: '100%', height: '600px', background: '#0a0e1a', borderRadius: '16px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{ unitNode: UnitNode, entityNode: EntityNode }}
        edgeTypes={{ relationshipEdge: RelationshipEdge }}
        fitView
      >
        <Background color="#1e293b" gap={20} />
        <Controls />
        <MiniMap nodeColor="#818cf8" />
      </ReactFlow>
    </div>
  );
}
```

### 6E: Custom Nodes — Dark theme, minimal

**UnitNode** (location/team):
```tsx
function UnitNode({ data }) {
  return (
    <div style={{
      background: 'rgba(24, 24, 27, 0.9)',
      border: '1px solid rgba(99, 102, 241, 0.3)',
      borderRadius: '12px',
      padding: '12px 16px',
      minWidth: '140px',
    }}>
      <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600 }}>{data.label}</div>
      <div style={{ color: '#71717a', fontSize: '10px', marginTop: '2px' }}>{data.type}</div>
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: data.status === 'active' ? '#34d399' : data.status === 'proposed' ? '#fbbf24' : '#71717a',
        position: 'absolute', top: '8px', right: '8px',
      }} />
    </div>
  );
}
```

**EntityNode** (individual):
```tsx
function EntityNode({ data }) {
  const initials = data.label.split(' ').map(w => w[0]).join('').slice(0,2);
  return (
    <div style={{
      background: 'rgba(24, 24, 27, 0.9)',
      border: '1px solid rgba(39, 39, 42, 0.6)',
      borderRadius: '12px',
      padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      <div style={{
        width: '28px', height: '28px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #818cf8, #6366f1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '10px', fontWeight: 700, color: 'white',
      }}>{initials}</div>
      <div>
        <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 500 }}>{data.label}</div>
        <div style={{ color: '#71717a', fontSize: '9px' }}>{data.external_id}</div>
      </div>
    </div>
  );
}
```

### 6F: Route the Canvas

Place the Organizational Canvas in the Configure workspace:
- Route: `/configure/organization` or `/configure/personnel`
- The page renders the Canvas for the current tenant
- If `entity_relationships` table has no data, show: "Import data to discover your organizational structure. The platform uses AI to infer entity relationships from your data."

### 6G: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-29 | @xyflow/react installed (in package.json) | grep package.json |
| PG-30 | Canvas page renders at its route without errors | Navigate to page |
| PG-31 | If entities exist for tenant, nodes appear on canvas | Check with Óptica Luminar (22 entities) |
| PG-32 | If entity_relationships exist, edges connect nodes | Visual check |
| PG-33 | Canvas supports zoom and pan (React Flow controls visible) | Interact with canvas |
| PG-34 | Empty state renders meaningful message for new tenants | Test with a tenant that has no entities |

**Commit:** `OB-52 Phase 6: Organizational Canvas Phase 1 — React Flow, entity graph rendering, custom nodes`

---

## PHASE 7: LOGIN-TO-LOGIN VERIFICATION

### The Integration Test

This phase does NOT build anything. It traces the complete journey end-to-end and documents which steps pass and which fail.

```bash
echo "============================================"
echo "OB-52 PHASE 7: LOGIN-TO-LOGIN TRACE"
echo "============================================"

echo ""
echo "=== STEP 1: TENANT CREATION ==="
echo "Can a VL Admin create a tenant through the Observatory UI?"
echo "Route: /observatory or /select-tenant → Onboarding tab → Create Tenant"
echo "Test: submit form, verify tenant row in Supabase"

echo ""
echo "=== STEP 2: USER INVITE ==="
echo "Can a VL Admin invite a tenant admin?"
echo "Route: invite form in Observatory or onboarding flow"
echo "Test: submit form, verify auth.users + profiles rows"

echo ""
echo "=== STEP 3: PLAN IMPORT ==="
echo "Can a tenant admin upload and interpret a PPTX plan?"
echo "Route: [whatever plan import route exists]"
echo "Test: upload PPTX, AI interprets, confirm, verify rule_sets row"

echo ""
echo "=== STEP 4: DATA IMPORT ==="
echo "Can a tenant admin upload an Excel data package?"
echo "Route: [whatever data import route exists]"
echo "Test: upload XLSX, AI classifies, map fields, commit, verify committed_data"

echo ""
echo "=== STEP 5: CALCULATION ==="
echo "Can a tenant admin trigger a calculation run?"
echo "Route: /operate → calculation trigger"
echo "Test: trigger calculation, verify calculation_results rows"

echo ""
echo "=== STEP 6: RESULTS ON DASHBOARD ==="
echo "Does the admin dashboard show calculation results?"
echo "Route: / (dashboard)"
echo "Test: total payout, entity count, distribution, lifecycle state"

echo ""
echo "=== STEP 7: REP EXPERIENCE ==="
echo "Can a rep log in and see their compensation?"
echo "Route: /login as vendedor → /"
echo "Test: personal payout, component breakdown"

echo ""
echo "For each step, record:"
echo "  PASS — works end-to-end"
echo "  PARTIAL — page exists but functionality broken"
echo "  FAIL — page missing or critical error"
echo "  NOT TESTED — dependency not met (e.g., no data to calculate)"
echo "============================================"
```

Document the results in the completion report. This is the ground truth for what works.

**Commit:** `OB-52 Phase 7: Login-to-Login trace documented`

---

## PHASE 8: CLOSING SEQUENCE

### Build verification
```bash
cd web
npx tsc --noEmit 2>&1 | tail -10
npm run build 2>&1 | tail -10
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run dev &
sleep 15
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
kill %1
```

### PROOF GATE SUMMARY

| # | Gate | Category | Phase |
|---|------|----------|-------|
| PG-1 | Plan import page loads | Plan Import | 1 |
| PG-2 | Tenant context available on plan import | Plan Import | 1 |
| PG-3 | AI plan interpretation API reachable | Plan Import | 1 |
| PG-4 | Plan saves to rule_sets table | Plan Import | 1 |
| PG-5 | No localStorage in plan import | Plan Import | 1 |
| PG-6 | Post-import guidance renders | Plan Import | 1 |
| PG-7 | Data import page loads | Data Import | 2 |
| PG-8 | Tenant context available on data import | Data Import | 2 |
| PG-9 | AI classification API reachable | Data Import | 2 |
| PG-10 | No localStorage in data import pipeline | Data Import | 2 |
| PG-11 | Past imports listable (if data exists) | Data Import | 2 |
| PG-12 | Import creates audit record | Data Import | 2 |
| PG-13 | Create Tenant form in Observatory | Tenant Creation | 3 |
| PG-14 | Form creates tenant row in Supabase | Tenant Creation | 3 |
| PG-15 | New tenant in Observatory fleet cards | Tenant Creation | 3 |
| PG-16 | API uses service role client | Tenant Creation | 3 |
| PG-17 | Metering event for tenant creation | Billing | 3 |
| PG-18 | User invite form accessible | User Invite | 4 |
| PG-19 | Invite creates auth user | User Invite | 4 |
| PG-20 | Invite creates profile with tenant_id | User Invite | 4 |
| PG-21 | Role template sets scope + capabilities | User Invite | 4 |
| PG-22 | Metering event for user_invited | Billing | 4 |
| PG-23 | Invited user can log in | User Invite | 4 |
| PG-24 | usage_metering table exists | Billing | 5 |
| PG-25 | Tenant creation metering event recorded | Billing | 5 |
| PG-26 | User invite metering event recorded | Billing | 5 |
| PG-27 | Billing tab shows real data | Billing | 5 |
| PG-28 | Entity count matches real data | Billing | 5 |
| PG-29 | @xyflow/react installed | Canvas | 6 |
| PG-30 | Canvas page renders without errors | Canvas | 6 |
| PG-31 | Nodes appear for seeded tenant | Canvas | 6 |
| PG-32 | Edges connect related entities | Canvas | 6 |
| PG-33 | Zoom and pan work | Canvas | 6 |
| PG-34 | Empty state for new tenants | Canvas | 6 |
| PG-35 | TypeScript: zero errors | Build | 8 |
| PG-36 | Production build: clean | Build | 8 |
| PG-37 | Login-to-Login trace documented | Integration | 7 |

### Completion Report

Create `OB-52_COMPLETION_REPORT.md` at PROJECT ROOT with:
1. Phase 0 diagnostic output (FULL)
2. All 37 proof gates with PASS/FAIL/INCONCLUSIVE
3. Login-to-Login trace results (7 steps)
4. localStorage regression check results
5. Files created/modified count
6. New Supabase tables/migrations created
7. Deferred items with rationale

```bash
gh pr create --base main --head dev \
  --title "OB-52: Functional Pipeline Restoration — Login to Login" \
  --body "## The Problem
ViaLuce has 7 designed features with zero working end-to-end pipeline.
Every demo tenant was created via seed scripts. Plan Import is broken.
Data Import is unverified on Supabase. No tenant creation UI. No user
invite flow. No billing metering. Organizational Canvas has zero code.

## What This OB Restores

### Phase 1: Plan Import
- Tenant context fix
- localStorage → Supabase storage
- Post-import guidance

### Phase 2: Data Import
- Full pipeline verification on Supabase
- localStorage elimination from business logic
- Import audit records

### Phase 3: Tenant Creation UI
- Multi-step form in Observatory Onboarding tab
- Server-side API route with service role client
- Immediate fleet card appearance

### Phase 4: User Invite Flow
- Invite form with role templates
- Supabase auth.admin.inviteUserByEmail or createUser + Resend
- Profile creation with scope + capabilities

### Phase 5: Billing Foundation
- usage_metering table + RLS policies
- Event instrumentation (tenant_created, user_invited, calculation_run, ai_inference, data_import)
- Observatory Billing tab reads real data

### Phase 6: Organizational Canvas Phase 1
- React Flow installed and rendering
- Entity graph from Supabase (entities + entity_relationships)
- Custom dark-theme nodes (UnitNode, EntityNode)
- Zoom, pan, minimap
- Empty state for new tenants

### Phase 7: Login-to-Login Trace
- 7-step integration verification documented
- Ground truth for what works

## Proof Gates: See OB-52_COMPLETION_REPORT.md (37 gates)"
```

---

*OB-52 — February 17, 2026*
*"A platform that can only be populated by terminal scripts is a prototype. A platform where an admin clicks 'Create Tenant' and a rep logs in 10 minutes later is a product."*
*"The Canvas was supposed to be the highest-priority deliverable. Five OBs later, it has zero code. Priority means doing it first, not designing it first."*
