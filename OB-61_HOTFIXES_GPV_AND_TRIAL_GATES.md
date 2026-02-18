# OB-61: HOTFIXES, GUIDED PROOF OF VALUE, AND TRIAL GATES

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS OB EXISTS

OB-60 builds the front door — public landing page, self-service signup, Observatory redesign. OB-61 builds what happens AFTER the front door: the 5-minute activation experience that no ICM competitor can match.

But first, two CLT-59 blocking bugs must be fixed. These are folded into Phase 0 so the platform is stable before building new features on top.

**The activation moment:** A new user who just signed up sees their own commission calculations from their own data within 5 minutes. No implementation project. No consultant. No 8-week timeline. Upload plan → Upload data → See results.

This is the Guided Proof of Value (GPV) — the single most important conversion mechanism in the self-service journey.

| # | Mission | Phases | Priority |
|---|---------|--------|----------|
| 1 | CLT-59 Hotfixes (Plan Import UUID + Personnel Crash) | 0 | P0 |
| 2 | Guided Proof of Value Wizard | 1-3 | P0 |
| 3 | Trial Gates + Conversion Prompts | 4 | P0 |
| 4 | Empty State → GPV Routing | 5 | P1 |
| 5 | Verification + PR | 6 | — |

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT.
4. Final step: `gh pr create --base main --head dev`
5. Commit this prompt to git as first action.
6. Inline styles as primary visual strategy for anything that must not be overridden.
7. Domain-agnostic always. The engine doesn't know it's ICM.
8. Brand palette: Deep Indigo (#2D2F8F) + Gold (#E8A838). Inter font family for UI.
9. NEVER provide answer values — fix logic not data.
10. This OB contains both hotfixes and new features. Hotfixes go first. Do NOT proceed to Phase 1 until Phase 0 builds clean.

---

## THE PROOF GATE RULE

Every proof gate must include:
1. **`curl` output** or **Supabase query result**
2. **`grep` count** — for removal/existence proofs
3. **Terminal evidence** — copy-paste from terminal

---

## CC ANTI-PATTERNS

| Anti-Pattern | Prevention |
|---|---|
| Component graveyard | Every component MUST be imported by a page.tsx |
| Self-verified proof gates | Terminal output required |
| Browser client for protected writes | Service role API routes |
| CSS class reliance | Inline styles for anything that must not be overridden |
| N+1 queries | Batch data loading, never per-row |
| Sending wrong field as ID | ALWAYS use `.id` from context objects, NEVER `.name` or `.display_name` |

---

# ═══════════════════════════════════════════════════
# PHASE 0: CLT-59 HOTFIXES
# ═══════════════════════════════════════════════════

Two blocking bugs from CLT-59 browser testing. Fix both, then verify the platform is stable.

## Fix 0A: Plan Import 500 — UUID sent as display name

**Bug:** `POST /api/plan/import` returns 500 with `invalid input syntax for type uuid: 'VL Platform Admin'`

**The console showed:** The correct tenant UUID IS in context (`currentTenant: 9b2b0a40-6b02-4d13-b1fe-c83b5096849f`) but the wrong field is passed to the API call.

### Diagnose

```bash
echo "=== PLAN IMPORT PAGE — HOW tenantId IS SOURCED ==="
grep -rn "tenantId\|tenant_id\|tenant\.id\|currentTenant" web/src/app/*/launch/plan-import/ --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== WHAT GETS SENT TO API ==="
grep -rn "handleImport\|onImport\|savePlan\|confirmImport\|fetch.*plan.*import" web/src/app/*/launch/plan-import/ --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== TENANT CONTEXT SHAPE ==="
grep -rn "useTenant\|TenantContext\|interface.*Tenant" web/src/contexts/ --include="*.tsx" --include="*.ts" | head -15

echo ""
echo "=== API ROUTE EXPECTS ==="
cat web/src/app/api/plan/import/route.ts 2>/dev/null | head -50
```

### Fix

Find where `tenantId` is assigned before the API call. Replace whatever wrong field is being used with the actual UUID:

```typescript
// WRONG — any of these patterns:
const tenantId = user.display_name;           // "VL Platform Admin"
const tenantId = profile.scope_level;         // "VL Platform Admin"
const tenantId = session.user.user_metadata?.name;
const tenantId = tenant?.name;

// CORRECT:
const tenantId = tenant?.id;                  // UUID
```

Also add UUID validation at the top of the API route to prevent cryptic Postgres errors:

```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const { tenantId, ...rest } = await request.json();

if (!tenantId || !UUID_REGEX.test(tenantId)) {
  return NextResponse.json(
    { error: `Invalid tenantId: expected UUID, received "${String(tenantId).substring(0, 50)}"` },
    { status: 400 }
  );
}
```

### Cross-cutting: check ALL API routes for same bug

```bash
echo "=== ALL API ROUTES ACCEPTING tenantId ==="
grep -rn "tenantId" web/src/app/api/ --include="*.ts" | grep -v node_modules | head -20

echo ""
echo "=== ALL CLIENT-SIDE CALLS SENDING tenantId ==="
grep -rn "tenantId.*fetch\|body.*tenantId\|JSON.stringify.*tenantId" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v "route.ts" | head -20
```

Fix any other API call that sends a non-UUID value as tenantId.

## Fix 0B: Personnel Page Crash — Missing context provider

**Bug:** `/configure/people` shows "Something went wrong" with console error: `Seems like you have not used custard provider as an ancestor`

### Diagnose

```bash
echo "=== FIND ERROR SOURCE ==="
grep -rn "custard\|not used.*provider.*ancestor" web/src/ --include="*.tsx" --include="*.ts" | head -10

echo ""
echo "=== ALSO CHECK NODE_MODULES ==="
grep -rn "custard" web/node_modules/@xyflow/ 2>/dev/null | head -5
grep -rn "custard" web/node_modules/reactflow/ 2>/dev/null | head -5

echo ""
echo "=== PERSONNEL PAGE ==="
find web/src/app -path "*people*" -o -path "*personnel*" | head -10
cat web/src/app/configure/people/page.tsx 2>/dev/null | head -50

echo ""
echo "=== CONFIGURE LAYOUT ==="
cat web/src/app/configure/layout.tsx 2>/dev/null | head -30

echo ""
echo "=== WHAT THE PAGE IMPORTS ==="
grep -n "import" web/src/app/configure/people/page.tsx 2>/dev/null | head -20
```

### Fix

The "custard provider" error is almost certainly from `@xyflow/react` — it's their misspelled custom error when a ReactFlow hook is called outside `<ReactFlowProvider>`. This means the Personnel page (or something it imports) has a transitive dependency on ReactFlow that shouldn't be there.

**Most likely cause:** A shared component (like an entity list or org chart widget) imported by Personnel that also imports from canvas components.

**Fix approach (in order of preference):**

1. **Remove the ReactFlow dependency** — If Personnel imports a component that transitively pulls in ReactFlow, find the import chain and break it. Personnel should NOT need ReactFlow.

```bash
echo "=== TRANSITIVE REACTFLOW DEPS FROM PERSONNEL ==="
# Check what Personnel imports
grep "import" web/src/app/configure/people/page.tsx 2>/dev/null

# For each imported component, check if it imports ReactFlow
for comp in $(grep "from.*@/components" web/src/app/configure/people/page.tsx 2>/dev/null | sed "s/.*from '//;s/'.*//"); do
  echo "--- $comp ---"
  grep -rn "@xyflow\|react-flow\|useReactFlow\|ReactFlow" "web/src/${comp#@/}.tsx" 2>/dev/null "web/src/${comp#@/}/index.tsx" 2>/dev/null | head -3
done
```

2. **Lazy-load the problematic component** — If it's a shared component that legitimately needs ReactFlow in some contexts but not Personnel:

```typescript
const OrgChart = dynamic(() => import('@/components/canvas/OrganizationalCanvas'), {
  ssr: false,
  loading: () => <div>Loading...</div>,
});
// Only render OrgChart when explicitly needed, not on Personnel page
```

3. **Wrap with provider as last resort** — Only if Personnel genuinely needs the component:

```typescript
import { ReactFlowProvider } from '@xyflow/react';
<ReactFlowProvider>
  <PersonnelContent />
</ReactFlowProvider>
```

### Verify both fixes

```bash
cd web
rm -rf .next
npm run build

if [ $? -eq 0 ]; then
  echo "✅ Build passes"
  npm run dev &
  sleep 5
  
  echo "=== Plan import page ==="
  curl -s -o /dev/null -w "%{http_code}" localhost:3000/admin/launch/plan-import
  
  echo ""
  echo "=== Personnel page ==="
  curl -s -o /dev/null -w "%{http_code}" localhost:3000/configure/people
  
  echo ""
  echo "=== Design page (canvas still works) ==="
  curl -s -o /dev/null -w "%{http_code}" localhost:3000/design
  
  kill %1 2>/dev/null
else
  echo "❌ Build failed"
fi
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | Plan import sends UUID | `grep "tenantId\|tenant\.id" web/src/app/*/launch/plan-import/page.tsx` shows UUID source | UUID pattern |
| PG-2 | API validates UUID format | `grep -c "UUID\|uuid\|regex\|test" web/src/app/api/plan/import/route.ts` | ≥1 |
| PG-3 | Personnel page doesn't crash | Build passes + page returns non-500 | Exit 0 + 200/307 |
| PG-4 | Design page still works | `curl localhost:3000/design` returns non-500 | 200/307 |
| PG-5 | Build clean | `npm run build` | Exit 0 |

**Commit:** `OB-61 Phase 0: CLT-59 hotfixes — plan import UUID + personnel crash`

---

# ═══════════════════════════════════════════════════
# PHASE 1: GUIDED PROOF OF VALUE — DATA LAYER
# ═══════════════════════════════════════════════════

**What:** The GPV (Guided Proof of Value) is a 3-step wizard that takes a new user from "just signed up" to "seeing their own calculated results" in 5 minutes.

### The Three Steps

```
┌──────────────────┐    ┌──────────────────────────┐    ┌─────────────────────┐
│  ① UPLOAD PLAN   │ →  │  ② UPLOAD DATA           │ →  │  ③ SEE RESULTS      │
│                  │    │                          │    │                     │
│  Drag-drop PPTX, │    │  Drag-drop Excel with    │    │  Preview calculation│
│  PDF, or image   │    │  performance data         │    │  runs automatically │
│                  │    │                          │    │                     │
│  AI interprets   │    │  AI classifies fields    │    │  Results appear     │
│  plan structure   │    │  Maps entities           │    │  per entity         │
│  Shows components │    │  Shows confidence        │    │                     │
│  User confirms    │    │  User confirms           │    │  Compare to current │
└──────────────────┘    └──────────────────────────┘    └─────────────────────┘
```

### 1A: Track GPV progress per tenant

Add GPV state to tenant settings. The signup flow (OB-60) creates the tenant with:

```json
{
  "settings": {
    "gpv": {
      "plan_uploaded": false,
      "plan_confirmed": false,
      "data_uploaded": false,
      "data_confirmed": false,
      "first_calculation": false,
      "completed_at": null
    }
  }
}
```

Create an API route to update GPV state:

Create `web/src/app/api/gpv/route.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { tenantId, step } = await request.json();
  
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!tenantId || !UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: 'Invalid tenantId' }, { status: 400 });
  }
  
  const validSteps = ['plan_uploaded', 'plan_confirmed', 'data_uploaded', 'data_confirmed', 'first_calculation'];
  if (!validSteps.includes(step)) {
    return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
  }
  
  const supabase = createServiceRoleClient();
  
  // Get current settings
  const { data: tenant } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();
  
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }
  
  const settings = tenant.settings || {};
  const gpv = settings.gpv || {};
  gpv[step] = true;
  
  // Mark complete if all steps done
  if (gpv.plan_confirmed && gpv.data_confirmed && gpv.first_calculation) {
    gpv.completed_at = new Date().toISOString();
  }
  
  const { error } = await supabase
    .from('tenants')
    .update({ settings: { ...settings, gpv } })
    .eq('id', tenantId);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ success: true, gpv });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  }
  
  const supabase = createServiceRoleClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();
  
  const gpv = tenant?.settings?.gpv || {
    plan_uploaded: false,
    plan_confirmed: false,
    data_uploaded: false,
    data_confirmed: false,
    first_calculation: false,
    completed_at: null,
  };
  
  return NextResponse.json({ gpv });
}
```

### 1B: Create GPV context hook

Create `web/src/hooks/useGPV.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';

interface GPVState {
  plan_uploaded: boolean;
  plan_confirmed: boolean;
  data_uploaded: boolean;
  data_confirmed: boolean;
  first_calculation: boolean;
  completed_at: string | null;
}

export function useGPV(tenantId: string | undefined) {
  const [gpv, setGPV] = useState<GPVState | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/gpv?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(data => { setGPV(data.gpv); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tenantId]);
  
  const advanceStep = useCallback(async (step: string) => {
    if (!tenantId) return;
    const res = await fetch('/api/gpv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, step }),
    });
    const data = await res.json();
    if (data.gpv) setGPV(data.gpv);
    return data;
  }, [tenantId]);
  
  const isComplete = gpv?.completed_at !== null && gpv?.completed_at !== undefined;
  const currentStep = !gpv ? 0
    : !gpv.plan_confirmed ? 1
    : !gpv.data_confirmed ? 2
    : !gpv.first_calculation ? 3
    : 4; // complete
  
  return { gpv, loading, advanceStep, isComplete, currentStep };
}
```

### 1C: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-6 | GPV API route exists | `find web/src/app/api/gpv -name "route.ts" \| wc -l` | ≥1 |
| PG-7 | GPV hook exists | `find web/src/hooks -name "useGPV*" \| wc -l` | ≥1 |
| PG-8 | API handles GET and POST | `grep -c "export async function" web/src/app/api/gpv/route.ts` | 2 |

**Commit:** `OB-61 Phase 1: GPV data layer — API route + state tracking + hook`

---

# ═══════════════════════════════════════════════════
# PHASE 2: GUIDED PROOF OF VALUE — WIZARD UI
# ═══════════════════════════════════════════════════

### 2A: Create the GPV Wizard component

Create `web/src/components/gpv/GPVWizard.tsx`:

The wizard is a full-page experience that replaces the normal dashboard for tenants that haven't completed GPV.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  Welcome to Vialuce, [orgName]!                                            │
│  Let's get your first calculation running. Three steps, five minutes.       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ① Upload Plan ────────── ② Upload Data ────────── ③ See Results   │    │
│  │  ✅ Complete              ● In Progress              ○ Pending     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │              [ACTIVE STEP CONTENT AREA]                             │    │
│  │                                                                     │    │
│  │  Step 1: Drag-drop zone for plan document                          │    │
│  │  Step 2: Drag-drop zone for data file                              │    │
│  │  Step 3: Results preview with per-entity calculations               │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────┐                                │
│  │  🔒 Trial: 14 days remaining           │                                │
│  │  Free during trial. No credit card.    │                                │
│  └────────────────────────────────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Styling:**
- Background: #020617 (matching landing page)
- Card: #0F172A, border #1E293B, rounded-lg
- Progress bar: steps connected by lines
  - Complete step: #10B981 (green) checkmark + filled circle
  - Active step: #E8A838 (gold) pulsing dot + bold label
  - Pending step: #475569 (gray) empty circle
- Step labels: 14px, active #F8FAFC, complete #10B981, pending #94A3B8
- Welcome heading: 28px, #F8FAFC
- Subheading: 16px, #CBD5E1
- Trial badge: background #1E293B, border #E8A838, text 13px #E8A838
- ALL INLINE STYLES

### 2B: Step 1 — Upload Plan

When step 1 is active, show:

```
Upload Your Compensation Plan

Drag and drop your plan document here, or click to browse.
Supported formats: PPTX, PDF, XLSX, or even a photo.

[─────────────── DROP ZONE ───────────────]
│                                          │
│         📄 Drop file here               │
│         or click to browse              │
│                                          │
[──────────────────────────────────────────]

The AI will interpret your plan structure, extract components,
tiers, and rates, and show you what it found.
```

**On file upload:**
1. Show upload progress indicator
2. Call the existing plan import pipeline (the same one at `/admin/launch/plan-import`)
3. Show AI interpretation results inline (plan name, components, confidence scores — the same data from CLT-59 screenshot)
4. "Confirm Plan →" button advances GPV to step 2

**CRITICAL:** This step reuses the existing plan import infrastructure. Do NOT rebuild the AI interpretation pipeline. Call the same API endpoints. The only difference is the UI wrapper — GPV wizard instead of the full admin plan-import page.

```bash
echo "=== EXISTING PLAN IMPORT INFRASTRUCTURE ==="
find web/src -path "*plan*import*" -o -path "*plan-import*" | grep -v node_modules | head -10
echo ""
echo "=== AI INTERPRETATION HANDLER ==="
grep -rn "interpretPlan\|parsePlan\|aiInterpret\|processFile" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | head -15
```

Extract the core upload + interpret + display logic into reusable components if they aren't already. The GPV wizard imports them.

### 2C: Step 2 — Upload Data

When step 2 is active (plan confirmed), show:

```
Upload Your Performance Data

Drag and drop an Excel file with your performance or transaction data.
The AI will classify each sheet and map fields to your plan components.

[─────────────── DROP ZONE ───────────────]

ℹ️ Your plan expects these metrics:
   • optical_attainment (from Optical Sales Incentive)
   • store_sales_attainment (from Store Sales Incentive)
   • new_customers_attainment (from New Customers Incentive)
   • collections_attainment (from Collections Incentive)
```

**The key innovation:** Show the user WHAT the AI is looking for based on the plan they just confirmed. This bridges the plan and data steps — "your plan needs these fields, let's find them in your data."

**On file upload:**
1. Upload progress
2. Call existing data import/classification pipeline
3. Show field mapping results with confidence scores
4. Show entity list (people/locations discovered)
5. "Confirm Data →" button advances GPV to step 3

Again — reuse existing infrastructure. The data import pipeline, AI field classification, and entity resolution already exist.

### 2D: Step 3 — See Results

When step 3 is active (data confirmed), the calculation runs automatically:

```
Calculating Your Results...

[████████████████░░░░] 80%

Running preview calculation for 22 entities using
RetailCorp Optometrist Incentive Plan...
```

Then, results appear:

```
✅ Preview Complete — 22 entities calculated

┌──────────────────────────────────────────────────────┐
│  Entity              Total Payout    Components       │
│  ─────────────────────────────────────────────────── │
│  María García         MX$2,335.00    7 components     │
│  Carlos Rodríguez     MX$1,890.00    7 components     │
│  Ana López            MX$2,105.00    7 components     │
│  ...                                                  │
│                                                       │
│  Total Payout:        MX$42,150.00                    │
│  Entities Calculated: 22                               │
│  Components Applied:  7                                │
│  Average Confidence:  94%                              │
└──────────────────────────────────────────────────────┘

🎉 Your first calculation is complete!

You just did in 5 minutes what takes 8-12 weeks with other platforms.

[Explore Your Dashboard →]    [Run Another Period →]
```

**On "Explore Your Dashboard":**
1. Mark GPV as complete (`advanceStep('first_calculation')`)
2. Navigate to the normal Admin dashboard
3. GPV wizard never shows again for this tenant

### 2E: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-9 | GPV wizard component exists | `find web/src/components/gpv -name "*.tsx" \| wc -l` | ≥1 |
| PG-10 | Wizard has 3 steps | `grep -c "step.*1\|step.*2\|step.*3\|Upload Plan\|Upload Data\|See Results" web/src/components/gpv/GPVWizard.tsx` | ≥3 |
| PG-11 | Drop zone exists | `grep -c "drop\|Drop\|dragover\|onDrop\|file.*input" web/src/components/gpv/GPVWizard.tsx` | ≥1 |
| PG-12 | Results display exists | `grep -c "total_payout\|totalPayout\|Preview Complete\|calculation.*result" web/src/components/gpv/GPVWizard.tsx` | ≥1 |

**Commit:** `OB-61 Phase 2: GPV wizard — 3-step UI with plan upload, data upload, results preview`

---

# ═══════════════════════════════════════════════════
# PHASE 3: GPV — WIRING TO EXISTING PIPELINES
# ═══════════════════════════════════════════════════

### 3A: Wire Step 1 to plan import pipeline

```bash
echo "=== FIND EXISTING PLAN IMPORT FUNCTIONS ==="
grep -rn "export.*function\|export.*const" web/src/app/*/launch/plan-import/ --include="*.tsx" --include="*.ts" | head -20
grep -rn "export.*function\|export.*const" web/src/lib/ --include="*.ts" | grep -i "plan\|interpret\|import" | head -10
```

The GPV Step 1 must:
1. Accept file drop (same file types as plan import page)
2. Call the same AI interpretation function/API
3. Display results in the wizard's card format (not the full plan-import page)
4. On "Confirm" → call the same plan save API (`/api/plan/import`)
5. Update GPV state: `advanceStep('plan_uploaded')` then `advanceStep('plan_confirmed')` after save

If the existing plan import page has the logic inline (not extracted to reusable functions), extract the key functions:
- `uploadAndInterpretPlan(file: File, tenantId: string) → InterpretationResult`
- `savePlanToRuleSet(tenantId: string, interpretation: InterpretationResult) → RuleSet`

### 3B: Wire Step 2 to data import pipeline

```bash
echo "=== FIND EXISTING DATA IMPORT FUNCTIONS ==="
find web/src -path "*data*import*" -o -path "*ingest*" -o -path "*upload*data*" | grep -v node_modules | head -10
grep -rn "export.*function\|export.*const" web/src/lib/ --include="*.ts" | grep -i "data\|import\|ingest\|classify\|field.*map" | head -10
```

Step 2 must:
1. Accept Excel file drop
2. Call existing data classification/field mapping pipeline
3. Show results: sheets detected, fields mapped, entities resolved, confidence scores
4. On "Confirm" → commit data to `committed_data` + resolve entities
5. Update GPV state: `advanceStep('data_uploaded')` then `advanceStep('data_confirmed')` after commit

### 3C: Wire Step 3 to calculation engine

```bash
echo "=== FIND CALCULATION TRIGGER ==="
grep -rn "calculate\|runCalculation\|triggerCalc\|calculation.*batch" web/src/app/api/ --include="*.ts" | head -10
grep -rn "calculate\|runCalculation" web/src/lib/ --include="*.ts" | head -10
```

Step 3 must:
1. Automatically trigger a PREVIEW calculation when Step 2 completes
2. Poll or subscribe for results
3. Display per-entity results in a simple table
4. On "Explore Dashboard" → `advanceStep('first_calculation')` + navigate to `/`

### 3D: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-13 | GPV calls plan import API | `grep -c "api/plan/import\|interpretPlan\|plan.*import" web/src/components/gpv/ --include="*.tsx" -r` | ≥1 |
| PG-14 | GPV calls data pipeline | `grep -c "committed_data\|data.*import\|classify\|field.*map" web/src/components/gpv/ --include="*.tsx" -r` | ≥1 |
| PG-15 | GPV triggers calculation | `grep -c "calculate\|calculation\|runPreview\|trigger.*calc" web/src/components/gpv/ --include="*.tsx" -r` | ≥1 |
| PG-16 | GPV advances state on completion | `grep -c "advanceStep\|first_calculation" web/src/components/gpv/ --include="*.tsx" -r` | ≥1 |

**Commit:** `OB-61 Phase 3: GPV wired to existing plan import, data pipeline, and calculation engine`

---

# ═══════════════════════════════════════════════════
# PHASE 4: TRIAL GATES + CONVERSION PROMPTS
# ═══════════════════════════════════════════════════

### What trial gates enforce

During the 14-day trial, the user can do everything in PREVIEW mode. Gates activate when they try to do something that requires a paid subscription:

| Action | Gate | What User Sees |
|---|---|---|
| Advance past PREVIEW in lifecycle | **Lifecycle gate** | "Upgrade to advance to Official. Preview calculations are free forever." |
| Export results (CSV, PDF) | **Export gate** | "Upgrade to export your calculation results." |
| Invite more than 2 users | **Invite gate** | "Upgrade to invite your full team. Free trial allows 2 collaborators." |
| Process a second period | **Period gate** | "Upgrade to process multiple periods. Free trial includes 1 period." |
| Access Calculation Forensics detail | **Forensics gate** | "Upgrade for full calculation drill-down. Preview shows summary results." |

### 4A: Create trial check utility

Create `web/src/lib/trial.ts`:

```typescript
interface TrialStatus {
  isTrialing: boolean;
  daysRemaining: number;
  expired: boolean;
  isPaid: boolean;
}

export function getTrialStatus(tenantSettings: any): TrialStatus {
  const trial = tenantSettings?.trial;
  const billing = tenantSettings?.billing;
  
  // If tenant has active billing, they're paid
  if (billing?.stripe_subscription_id || billing?.status === 'active') {
    return { isTrialing: false, daysRemaining: 0, expired: false, isPaid: true };
  }
  
  // If no trial info, treat as expired
  if (!trial?.started_at) {
    return { isTrialing: false, daysRemaining: 0, expired: true, isPaid: false };
  }
  
  const expiresAt = new Date(trial.expires_at || trial.started_at);
  expiresAt.setDate(expiresAt.getDate() + 14);
  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  
  return {
    isTrialing: daysRemaining > 0,
    daysRemaining,
    expired: daysRemaining <= 0,
    isPaid: false,
  };
}

export function checkTrialGate(
  tenantSettings: any,
  gate: 'lifecycle' | 'export' | 'invite' | 'period' | 'forensics'
): { allowed: boolean; message: string } {
  const status = getTrialStatus(tenantSettings);
  
  if (status.isPaid) return { allowed: true, message: '' };
  if (status.expired) return { allowed: false, message: 'Your trial has expired. Upgrade to continue.' };
  
  const messages: Record<string, string> = {
    lifecycle: 'Upgrade to advance beyond Preview. Preview calculations are free during your trial.',
    export: 'Upgrade to export your calculation results.',
    invite: 'Upgrade to invite your full team. Free trial allows 2 collaborators.',
    period: 'Upgrade to process multiple periods. Free trial includes 1 period.',
    forensics: 'Upgrade for full calculation drill-down. Preview shows summary results.',
  };
  
  return { allowed: false, message: messages[gate] || 'Upgrade required.' };
}
```

### 4B: Create TrialGate component

Create `web/src/components/trial/TrialGate.tsx`:

```typescript
'use client';
import React from 'react';

interface TrialGateProps {
  gate: 'lifecycle' | 'export' | 'invite' | 'period' | 'forensics';
  message: string;
  onUpgrade: () => void;
  children: React.ReactNode;
  allowed: boolean;
}

export function TrialGate({ gate, message, onUpgrade, children, allowed }: TrialGateProps) {
  if (allowed) return <>{children}</>;
  
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ filter: 'blur(2px)', opacity: 0.5, pointerEvents: 'none' }}>
        {children}
      </div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', borderRadius: '8px', zIndex: 10,
      }}>
        <div style={{
          background: '#0F172A', border: '1px solid #E8A838', borderRadius: '12px',
          padding: '24px 32px', maxWidth: '400px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '16px', color: '#F8FAFC', marginBottom: '8px', fontWeight: 600 }}>
            Upgrade Required
          </div>
          <div style={{ fontSize: '14px', color: '#CBD5E1', marginBottom: '16px' }}>
            {message}
          </div>
          <button
            onClick={onUpgrade}
            style={{
              background: '#2D2F8F', color: 'white', border: 'none', borderRadius: '8px',
              padding: '10px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            View Plans →
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 4C: Create Trial Badge component

Create `web/src/components/trial/TrialBadge.tsx`:

A small badge shown in the navigation or top bar during trial:

```typescript
export function TrialBadge({ daysRemaining }: { daysRemaining: number }) {
  const urgent = daysRemaining <= 3;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: urgent ? '#1C1017' : '#1E293B',
      border: `1px solid ${urgent ? '#EF4444' : '#E8A838'}`,
      borderRadius: '6px', padding: '4px 10px', fontSize: '12px',
      color: urgent ? '#EF4444' : '#E8A838',
    }}>
      {urgent ? '⚠️' : '🔓'} {daysRemaining}d remaining in trial
    </div>
  );
}
```

### 4D: Wire gates to existing UI

Apply trial gates at the specific interaction points:

1. **Lifecycle button** (AdminDashboard) — wrap "Advance to Official" with `<TrialGate gate="lifecycle">`
2. **Export button** (if exists) — wrap with `<TrialGate gate="export">`
3. **Invite form** (Observatory Onboarding) — check invite count, show gate if >2
4. **Period creation** — check period count, show gate if >1

```bash
echo "=== LIFECYCLE BUTTON LOCATION ==="
grep -rn "Advance\|advanceLifecycle\|lifecycle.*button\|TRANSITION_LABELS" web/src/components/dashboards/ --include="*.tsx" | head -10

echo ""
echo "=== INVITE FORM LOCATION ==="
grep -rn "invite\|Invite\|addUser\|createUser" web/src/components/platform/ --include="*.tsx" | head -10
```

### 4E: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-17 | Trial utility exists | `find web/src/lib -name "trial*" \| wc -l` | ≥1 |
| PG-18 | TrialGate component exists | `find web/src/components/trial -name "*.tsx" \| wc -l` | ≥1 |
| PG-19 | TrialBadge component exists | `grep -c "TrialBadge\|daysRemaining" web/src/components/trial/TrialBadge.tsx` | ≥1 |
| PG-20 | Gate applied to lifecycle button | `grep -rn "TrialGate\|trial.*gate\|checkTrialGate" web/src/components/dashboards/ --include="*.tsx" \| wc -l` | ≥1 |

**Commit:** `OB-61 Phase 4: Trial gates — lifecycle, export, invite, period limits with upgrade prompts`

---

# ═══════════════════════════════════════════════════
# PHASE 5: EMPTY STATE → GPV ROUTING
# ═══════════════════════════════════════════════════

### 5A: Dashboard detects GPV state and routes accordingly

The Admin dashboard (and Manager/Rep dashboards) must check GPV state on load:

```typescript
// In the dashboard page or layout:
const { gpv, loading, isComplete } = useGPV(tenant?.id);

// If GPV not complete → show GPV wizard instead of dashboard
if (!loading && !isComplete) {
  return <GPVWizard tenantId={tenant.id} tenantName={tenant.name} gpvState={gpv} />;
}

// Otherwise → render normal dashboard
return <AdminDashboard />;
```

### 5B: For existing tenants (OL, VD, RCM)

Existing seeded tenants already have calculation data, so GPV should be marked as complete for them. The simplest approach: if a tenant has ANY `calculation_results`, consider GPV implicitly complete.

```typescript
// In useGPV or in the dashboard check:
const hasCalculations = calculationCount > 0;
if (hasCalculations && !gpv?.completed_at) {
  // Existing tenant with data — skip GPV
  return true; // isComplete
}
```

This prevents existing tenants from seeing the GPV wizard.

### 5C: "Skip for now" option

Add a subtle "Skip setup, explore the platform →" link at the bottom of the GPV wizard. Some users (like co-founder testers) may want to explore the dashboard without going through the wizard. Clicking skip navigates to the dashboard but does NOT mark GPV as complete — next login they'll see the wizard again unless they complete it or explicitly dismiss it.

### 5D: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-21 | Dashboard checks GPV state | `grep -rn "useGPV\|gpv\|isComplete\|GPVWizard" web/src/app/ --include="*.tsx" -r \| wc -l` | ≥2 |
| PG-22 | Existing tenants skip GPV | `grep -rn "calculationCount\|hasCalculations\|calculation_results" web/src/hooks/useGPV* web/src/components/gpv/ --include="*.tsx" --include="*.ts" -r \| wc -l` | ≥1 |
| PG-23 | Skip option exists | `grep -rn "Skip\|skip.*setup\|skip.*wizard" web/src/components/gpv/ --include="*.tsx" -r \| wc -l` | ≥1 |

**Commit:** `OB-61 Phase 5: Empty state routing — GPV wizard for new tenants, normal dashboard for existing`

---

# ═══════════════════════════════════════════════════
# PHASE 6: VERIFICATION AND COMPLETION
# ═══════════════════════════════════════════════════

### 6A: Build verification

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### 6B: Full test sequence

```bash
echo "=== OB-61 VERIFICATION ==="

echo "1. Plan import page (Phase 0 fix):"
grep "tenantId\|tenant\.id" web/src/app/*/launch/plan-import/page.tsx | head -3

echo ""
echo "2. Personnel page (Phase 0 fix):"
grep -c "custard" web/src/ -r --include="*.tsx" --include="*.ts" 2>/dev/null

echo ""
echo "3. GPV API:"
find web/src/app/api/gpv -name "route.ts" | wc -l

echo ""
echo "4. GPV wizard component:"
find web/src/components/gpv -name "*.tsx" | wc -l

echo ""
echo "5. Trial gates:"
find web/src/components/trial -name "*.tsx" | wc -l
find web/src/lib -name "trial*" | wc -l

echo ""
echo "6. GPV hook:"
find web/src/hooks -name "useGPV*" | wc -l

echo ""
echo "7. Dashboard checks GPV:"
grep -rn "useGPV\|GPVWizard" web/src/app/ --include="*.tsx" | wc -l

echo ""
echo "8. Build clean:"
echo $?
```

### 6C: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-24 | TypeScript: zero errors | `npx tsc --noEmit` exit code | 0 |
| PG-25 | Build: clean | `npm run build` exit code | 0 |
| PG-26 | localhost responds | `curl -s localhost:3000 \| head -1` | HTML content |

### 6D: Completion report

Create `OB-61_COMPLETION_REPORT.md` at PROJECT ROOT with all 26 proof gates and terminal evidence.

### 6E: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-61: Hotfixes + Guided Proof of Value + Trial Gates" \
  --body "## What This OB Delivers

### Phase 0: CLT-59 Hotfixes (P0)
- Plan Import UUID fix — sends tenant.id instead of display name
- UUID validation on API route (prevents cryptic Postgres errors)
- Personnel page crash fix — missing context provider
- Cross-cutting verification of all API routes

### Phases 1-3: Guided Proof of Value (P0)
- GPV state tracking API (GET/POST per tenant)
- useGPV hook with step progression
- 3-step wizard: Upload Plan → Upload Data → See Results
- Reuses existing AI interpretation + data pipeline + calculation engine
- Results display with per-entity payouts and confidence scores
- 'Explore Your Dashboard' completes GPV and shows normal dashboard

### Phase 4: Trial Gates (P0)
- Trial status utility (trialing / expired / paid)
- TrialGate component — blurs content, shows upgrade prompt
- TrialBadge — shows days remaining in navigation
- Gates on: lifecycle advancement, export, invite (>2), period (>1), forensics

### Phase 5: Empty State Routing (P1)
- Dashboard checks GPV state — shows wizard for incomplete, dashboard for complete
- Existing tenants (with calculation data) skip GPV automatically
- 'Skip for now' option for testers

## Market Position
This delivers the 5-minute activation experience. No ICM competitor offers
signup → calculation in under 5 minutes. Most require 8-12 weeks.

## Self-Service Journey Coverage
- Step 1 (Land) ← OB-60
- Step 2 (Sign Up) ← OB-60
- **Step 3 (Activation) ← THIS OB**
- **Step 4 (Explore/Trial) ← THIS OB**
- Step 5 (Convert) ← OB-62 (Stripe)

## Proof Gates: 26 — see OB-61_COMPLETION_REPORT.md"
```

**Commit:** `OB-61 Phase 6: Verification, completion report, PR`

---

## PROOF GATE SUMMARY (26 gates)

| Range | Mission | Phase | Count |
|-------|---------|-------|-------|
| PG 1-5 | CLT-59 Hotfixes | 0 | 5 |
| PG 6-8 | GPV Data Layer | 1 | 3 |
| PG 9-12 | GPV Wizard UI | 2 | 4 |
| PG 13-16 | GPV Pipeline Wiring | 3 | 4 |
| PG 17-20 | Trial Gates | 4 | 4 |
| PG 21-23 | Empty State Routing | 5 | 3 |
| PG 24-26 | Build + Verification | 6 | 3 |

---

## OUT OF SCOPE

| Item | When |
|------|------|
| Stripe payment integration | OB-62 |
| Google SSO | OB-62 |
| Interactive product tour | OB-62 |
| Agent event bus + Agent Loop | OB-63 |
| Embedded training (CoachMark + user_journey) | OB-63 |
| Expansion signals (usage-driven module recs) | OB-63 |
| Free tier (≤10 entities) | Pricing decision pending |

---

## SELF-SERVICE CUSTOMER JOURNEY

```
STEP 1: LAND          ← OB-60 ✓ (running)
STEP 2: SIGN UP       ← OB-60 ✓ (running)
STEP 3: ACTIVATION    ← OB-61 (this OB) ★
STEP 4: EXPLORE       ← OB-61 (this OB) ★
STEP 5: CONVERT       ← OB-62
STEP 6: CONFIGURE     ← OB-63
STEP 7: EXPAND        ← OB-63
```

After OB-61, a customer can go from Google → signed up → seeing their own calculations → exploring the platform with trial gates. The only missing piece for monetization is Stripe (OB-62).

---

*OB-61 — February 18, 2026*
*"Five minutes from signup to seeing your own commission calculations. No competitor has ever done this."*
