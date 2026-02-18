# OB-58: VISUAL POLISH, PIPELINE FIXES, AND SIDEBAR SCOPING

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS OB EXISTS

CLT-56 browser verification (Feb 18, 2026) confirmed that persona dashboards are working — Admin, Manager, and Rep views all render real data with AI intelligence surfaces. However, browser testing revealed:

1. **Plan Import fails with 400** — AI interpretation works perfectly (95% confidence, 7 components) but "Confirm & Import Plan" returns 400 on rule_sets insert (RLS blocks browser client)
2. **Sidebar shows all workspaces for every persona** — Vendedor sees Operate, Investigate, Design, Configure, Govern (should see Perform only)
3. **Sidebar text too faint** — navigation labels barely readable against dark background
4. **Observatory text too faint** — same issue across all Observatory tabs (confirmed multiple times)
5. **Language switcher not functional** — globe icon shows "English" but clicking doesn't change labels
6. **Lifecycle button label wrong** — Admin dashboard shows "Advance to Official" when batch is already past Official (should show next valid transition)
7. **Periods 400 error in console** — RLS blocking periods query from browser client
8. **Plan Import has no step indicator** — no subway showing Upload → Review → Confirm progress

This OB fixes every CLT-56 finding. Seven missions:

| # | Mission | Phases | Priority |
|---|---------|--------|----------|
| 1 | Plan Import 400 Fix | 0 | P0 |
| 2 | Sidebar Scope Enforcement | 1 | P0 |
| 3 | Global Text Brightness | 2 | P0 |
| 4 | Lifecycle Button Fix | 3 | P1 |
| 5 | Periods 400 Fix | 4 | P1 |
| 6 | Plan Import UX (subway) | 5 | P1 |
| 7 | Language Switcher | 6 | P1 |

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT.
4. Final step: `gh pr create --base main --head dev` with descriptive title and body.
5. Commit this prompt to git as first action.
6. Inline styles as primary visual strategy.
7. VL Admin: all users select preferred language. No forced English override.
8. Domain-agnostic always.

---

## THE PROOF GATE RULE

Same as OB-56/57. Every proof gate must include:
1. **`curl` output** — proves page renders expected content
2. **Supabase query result** — proves data exists
3. **`grep` count** — for removal/existence proofs

**NOT VALID:** "Code path confirmed" ❌, "Component file exists" ❌, "Function is called" ❌

---

## CC ANTI-PATTERNS — STILL IN EFFECT

| Anti-Pattern | Prevention |
|---|---|
| Component graveyard | Every component MUST be imported by a page.tsx |
| Self-verified proof gates | Terminal output required |
| Silent failure | Every API route returns meaningful error |
| Browser client for protected writes | Protected table inserts go through service role API routes |
| CSS class reliance | Inline styles for anything that must not be overridden |

---

# ═══════════════════════════════════════════════════
# PHASE 0: PLAN IMPORT 400 FIX
# ═══════════════════════════════════════════════════

**Problem:** "Confirm & Import Plan" fails with 400 on `rule_sets` insert. The plan import page uses the browser Supabase client to insert into `rule_sets`, but RLS blocks it.

**Fix:** Route the rule_sets insert through a server-side API using the service role client.

### 0A: Find the current insert

```bash
echo "=== WHERE DOES PLAN IMPORT WRITE TO RULE_SETS ==="
grep -rn "rule_sets.*insert\|\.from.*rule_sets.*\.insert\|saveRuleSet\|activateRuleSet" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== PLAN IMPORT PAGE ==="
cat web/src/app/admin/launch/plan-import/page.tsx | grep -n "supabase\|rule_set\|insert\|save\|confirm\|handleImport" | head -20
```

### 0B: Create API route

Create `web/src/app/api/plan/import/route.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = createServiceRoleClient();
    const body = await request.json();
    
    const { tenantId, name, components, domain, inputBindings, populationConfig, status } = body;
    
    if (!tenantId || !name || !components) {
      return NextResponse.json(
        { error: 'Missing required fields: tenantId, name, components' }, 
        { status: 400 }
      );
    }
    
    // Insert rule set
    const { data: ruleSet, error } = await supabase
      .from('rule_sets')
      .insert({
        tenant_id: tenantId,
        name,
        components,
        domain: domain || 'compensation',
        input_bindings: inputBindings || {},
        population_config: populationConfig || {},
        status: status || 'active',
      })
      .select()
      .single();
    
    if (error) {
      console.error('Rule set insert failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Write metering event
    await supabase.from('usage_metering').insert({
      tenant_id: tenantId,
      event_type: 'plan_import',
      quantity: 1,
      metadata: { rule_set_id: ruleSet.id, component_count: components.length },
    }).catch(e => console.error('Metering failed (non-blocking):', e));
    
    return NextResponse.json({ ruleSet });
  } catch (e) {
    console.error('Plan import API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### 0C: Update plan import page

In the plan import page, replace the direct `supabase.from('rule_sets').insert(...)` with a fetch to the API route:

```typescript
// BEFORE (browser client — blocked by RLS):
// const { data, error } = await supabase.from('rule_sets').insert({...}).select().single();

// AFTER (API route — uses service role):
const response = await fetch('/api/plan/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenantId: currentTenantId,
    name: parsedPlan.name,
    components: parsedPlan.components,
    domain: parsedPlan.domain,
    inputBindings: parsedPlan.inputBindings,
    populationConfig: parsedPlan.populationConfig,
    status: 'active',
  }),
});

if (!response.ok) {
  const err = await response.json();
  console.error('Plan import failed:', err);
  // Show error in UI — do NOT swallow
  setError(`Failed to save plan: ${err.error}`);
  return;
}

const { ruleSet } = await response.json();
// Success — navigate or show confirmation
```

### 0D: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | API route exists | `find web/src/app/api -path "*plan*import*" -name "route.ts" \| wc -l` | Output: ≥1 |
| PG-2 | API uses service role client | `grep "ServiceRole\|service.role\|SUPABASE_SERVICE_ROLE" web/src/app/api/plan/import/route.ts` | Match found |
| PG-3 | Plan import page calls API (not direct insert) | `grep "api/plan/import\|fetch.*plan.*import" web/src/app/admin/launch/plan-import/page.tsx` | Match found |
| PG-4 | No direct rule_sets insert from browser client | `grep -n "supabase.*from.*rule_sets.*insert" web/src/app/admin/launch/plan-import/page.tsx \| wc -l` | Output: 0 |

**Commit:** `OB-58 Phase 0: Plan import 400 fix — route rule_sets insert through service role API`

---

# ═══════════════════════════════════════════════════
# PHASE 1: SIDEBAR SCOPE ENFORCEMENT
# ═══════════════════════════════════════════════════

**Problem:** Persona switcher changes dashboard content but sidebar shows all 6 workspaces for every persona. CLT-56 confirmed: Vendedor sees Operate, Investigate, Design, Configure, Govern (should see Perform only).

### 1A: Find the sidebar component

```bash
echo "=== SIDEBAR / WORKSPACE COMPONENTS ==="
grep -rn "Operate\|Perform\|Investigate\|Design\|Configure\|Govern" web/src/components/navigation/ --include="*.tsx" -l
grep -rn "workspace" web/src/components/ --include="*.tsx" -l | head -10

echo ""
echo "=== ROLE WORKSPACES CONFIG ==="
find web/src -name "*role*workspace*" -o -name "*workspace*config*" -o -name "*workspace*role*" | sort
cat web/src/lib/navigation/role-workspaces.ts 2>/dev/null | head -40
```

### 1B: The visibility matrix

This MUST be enforced at render time:

```typescript
const WORKSPACE_VISIBILITY: Record<string, string[]> = {
  admin:   ['operate', 'perform', 'investigate', 'design', 'configure', 'govern'],
  manager: ['perform', 'investigate', 'govern'],
  rep:     ['perform'],
};
```

### 1C: Wire persona to sidebar

Find where the sidebar renders the workspace list. It MUST read from `usePersona()` and filter:

```typescript
const { persona } = usePersona();
const visibleWorkspaces = allWorkspaces.filter(w => 
  WORKSPACE_VISIBILITY[persona]?.includes(w.key.toLowerCase())
);
```

If the sidebar component does NOT currently import `usePersona`, add it. If `role-workspaces.ts` already defines visibility but the sidebar doesn't read it, wire the connection.

**CRITICAL:** The issue is NOT that the config doesn't exist — OB-56 verified the config exists. The issue is that the sidebar component doesn't READ the config when rendering. Find the disconnect and fix it.

### 1D: Default landing per persona

When persona changes:
- Admin → navigate to `/operate`
- Manager → navigate to `/perform` (or stay on current if accessible)
- Rep → navigate to `/perform` (or stay on current if accessible)

If the user is on a workspace they can no longer see (e.g., Vendedor on /design), redirect to their default.

### 1E: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-5 | Sidebar reads persona context | `grep "usePersona\|persona" web/src/components/navigation/ChromeSidebar.tsx` | Match found |
| PG-6 | WORKSPACE_VISIBILITY applied at render | `grep "WORKSPACE_VISIBILITY\|visibleWorkspace\|filter.*workspace.*persona\|getAccessibleWorkspaces" web/src/components/navigation/ -r` | Match found in sidebar render path |
| PG-7 | Rep config has exactly 1 workspace | `grep -A2 "rep.*:" web/src/lib/navigation/role-workspaces.ts \| head -5` | Shows ['perform'] or equivalent |

**Commit:** `OB-58 Phase 1: Sidebar scope enforcement — workspaces filtered by persona`

---

# ═══════════════════════════════════════════════════
# PHASE 2: GLOBAL TEXT BRIGHTNESS
# ═══════════════════════════════════════════════════

**Problem:** Sidebar navigation labels and Observatory text are too faint/small. Confirmed across multiple CLT-56 screenshots. This has been flagged in CLT-54, CLT-55, and CLT-56 — three consecutive sessions.

### 2A: Define the standards

```typescript
// MANDATORY MINIMUM STANDARDS — apply globally via inline styles
const VL_TEXT = {
  // Colors
  PRIMARY: '#E2E8F0',      // Main text — headings, labels, body
  SECONDARY: '#CBD5E1',    // Supporting text — descriptions, metadata
  MUTED: '#94A3B8',        // Supplementary — timestamps, tertiary info
  WHITE: '#F8FAFC',        // Hero numbers, primary emphasis
  
  // NEVER USE THESE — too faint on dark backgrounds:
  // #64748B, #475569, #334155, #1E293B
  
  // Sizes
  HERO: '28px',            // Hero metric numbers
  HEADING: '18px',         // Section headings
  SUBHEADING: '15px',      // Sub-section headings
  BODY: '14px',            // Body text, labels, descriptions
  SECONDARY_SIZE: '13px',  // Secondary info (ABSOLUTE MINIMUM)
  
  // NEVER USE smaller than 13px for any text content
};
```

### 2B: Fix sidebar navigation

```bash
echo "=== SIDEBAR STYLING ==="
grep -rn "color\|fontSize\|font-size\|text-" web/src/components/navigation/ChromeSidebar.tsx | head -20
grep -rn "color\|fontSize\|font-size\|text-" web/src/components/navigation/ --include="*.tsx" | grep -v "node_modules" | head -30
```

For EVERY workspace label, sub-item label, and section heading in the sidebar:
- Color: minimum `#CBD5E1` (currently appears to be ~#64748B or fainter)
- Font size: minimum 14px for workspace labels, 13px for sub-items
- Active workspace: `#F8FAFC` (white) with highlight indicator
- Use INLINE STYLES — not Tailwind classes that might be overridden

### 2C: Fix Observatory tabs

```bash
echo "=== OBSERVATORY COMPONENT STYLING ==="
find web/src/components/platform/ -name "*.tsx" | sort
```

For EVERY Observatory component:
- Section headings: 18px, `#E2E8F0`, font-weight 600
- Body text: 14px, `#E2E8F0`
- Secondary text: 13px, `#CBD5E1`
- Hero numbers: 28px, `#F8FAFC`, font-weight 700
- Card backgrounds: `#0F172A` with `#1E293B` borders
- ALL via inline styles

### 2D: Fix AI Assessment / Coaching Intelligence panels

The AI insight panels on dashboards have readable content but headings are small. Fix:
- Panel heading ("Governance Assessment", "Coaching Intelligence", "Personal Performance Insight"): 16px, `#E2E8F0`, font-weight 600
- Panel body: 14px, `#CBD5E1`
- Bold sections within body: `#E2E8F0`

### 2E: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-8 | Sidebar uses readable colors | `grep -rn "CBD5E1\|E2E8F0\|F8FAFC" web/src/components/navigation/ --include="*.tsx" \| wc -l` | ≥5 |
| PG-9 | No faint colors in sidebar | `grep -rn "64748B\|475569\|334155" web/src/components/navigation/ChromeSidebar.tsx \| grep "color" \| wc -l` | Output: 0 |
| PG-10 | Observatory uses readable colors | `grep -rn "CBD5E1\|E2E8F0\|F8FAFC" web/src/components/platform/ --include="*.tsx" \| wc -l` | ≥10 |
| PG-11 | No text smaller than 13px in Observatory | `grep -rn "font.*[0-9]*px\|fontSize.*[0-9]" web/src/components/platform/ --include="*.tsx" \| grep -E "(10|11|12)px" \| grep -v "border\|gap\|padding\|margin\|radius\|width\|height\|//" \| wc -l` | Output: 0 |

**Commit:** `OB-58 Phase 2: Global text brightness — sidebar + Observatory + AI panels`

---

# ═══════════════════════════════════════════════════
# PHASE 3: LIFECYCLE BUTTON FIX
# ═══════════════════════════════════════════════════

**Problem:** Admin dashboard shows "Advance to Official →" when the calculation batch is already at "Approved" state. The button should show the NEXT valid transition from the CURRENT state.

### 3A: Find the button

```bash
echo "=== LIFECYCLE BUTTON ==="
grep -rn "Advance to Official\|advance.*official\|Official" web/src/components/ --include="*.tsx" | head -10
grep -rn "lifecycle.*button\|action.*bar\|transition.*button" web/src/components/ --include="*.tsx" -l | head -10
```

### 3B: Fix the logic

The button label must derive from the CURRENT lifecycle_state and show the NEXT valid transition:

```typescript
const TRANSITION_LABELS: Record<string, { label: string; next: string }> = {
  DRAFT:              { label: 'Run Preview →',         next: 'PREVIEW' },
  PREVIEW:            { label: 'Run Reconciliation →',  next: 'RECONCILE' },
  RECONCILE:          { label: 'Advance to Official →', next: 'OFFICIAL' },
  OFFICIAL:           { label: 'Submit for Approval →', next: 'PENDING_APPROVAL' },
  PENDING_APPROVAL:   { label: 'Awaiting Approval',     next: '' }, // no button — different user approves
  APPROVED:           { label: 'Post Results →',        next: 'POSTED' },
  POSTED:             { label: 'Close Period →',        next: 'CLOSED' },
  CLOSED:             { label: 'Mark as Paid →',        next: 'PAID' },
  PAID:               { label: 'Publish →',             next: 'PUBLISHED' },
  PUBLISHED:          { label: 'Complete',              next: '' }, // terminal
};

const currentState = batch.lifecycle_state;
const transition = TRANSITION_LABELS[currentState];
```

If the label is hardcoded to "Advance to Official," replace it with the dynamic lookup above.

### 3C: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-12 | Transition labels are dynamic | `grep "TRANSITION_LABELS\|lifecycle_state.*label\|currentState.*label" web/src/components/ -r \| wc -l` | ≥1 |
| PG-13 | No hardcoded "Advance to Official" in dashboard | `grep -rn "Advance to Official" web/src/components/dashboards/ \| wc -l` | Output: 0 |

**Commit:** `OB-58 Phase 3: Lifecycle button shows correct next transition`

---

# ═══════════════════════════════════════════════════
# PHASE 4: PERIODS 400 FIX
# ═══════════════════════════════════════════════════

**Problem:** Console shows 400 error on GET to `/rest/v1/periods?select=...` — same RLS pattern as plan import.

### 4A: Find the periods query

```bash
echo "=== PERIODS QUERIES ==="
grep -rn "\.from.*periods\|periods.*select" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "// " | head -20
```

### 4B: Fix the query

Options (in order of preference):
1. **Move to page loader** — if the periods query is in a component, move it to page-loaders.ts
2. **Fix RLS policy** — if the query should work from browser client, the RLS policy needs a tenant_id match
3. **Route through API** — if RLS can't be fixed, create an API route

Most likely the periods query is missing the tenant_id filter or the user's JWT doesn't include the tenant_id claim. Check:

```bash
echo "=== CHECK PERIODS QUERY FILTERS ==="
grep -B5 -A10 "\.from.*periods" web/src/lib/data/page-loaders.ts 2>/dev/null
grep -B5 -A10 "\.from.*periods" web/src/contexts/ --include="*.tsx" 2>/dev/null | head -30
```

Ensure every periods query includes `.eq('tenant_id', tenantId)`.

### 4C: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-14 | All periods queries include tenant_id filter | `grep -A3 "\.from.*periods" web/src/lib/data/page-loaders.ts \| grep "tenant_id"` | Match found after every periods query |

**Commit:** `OB-58 Phase 4: Periods 400 fix — add tenant_id filter`

---

# ═══════════════════════════════════════════════════
# PHASE 5: PLAN IMPORT UX — SUBWAY INDICATOR
# ═══════════════════════════════════════════════════

**Problem:** Plan import has no step indicator. User uploads file and sees results with no sense of where they are in the process.

### 5A: Add 3-step subway

At the top of the plan import page, add a step indicator:

```
Step 1: Upload          Step 2: Review          Step 3: Confirm
  ●───────────────────────○───────────────────────○
```

States:
- **Upload**: Active when no file uploaded. Shows file picker / drag-drop zone.
- **Review**: Active after AI interpretation completes. Shows detected components, confidence scores, worked examples.
- **Confirm**: Active after user clicks "Confirm & Import Plan". Shows success + navigation options.

### 5B: Implementation

```typescript
const STEPS = [
  { key: 'upload', label: 'Upload Plan Document' },
  { key: 'review', label: 'Review AI Interpretation' },
  { key: 'confirm', label: 'Confirm & Save' },
];

function PlanImportSubway({ currentStep }: { currentStep: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
      {STEPS.map((step, i) => {
        const isCurrent = step.key === currentStep;
        const isPast = STEPS.findIndex(s => s.key === currentStep) > i;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && <div style={{ flex: 1, height: '2px', background: isPast ? '#10B981' : '#1E293B' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: isPast ? '#10B981' : isCurrent ? '#6366F1' : '#1E293B',
                color: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 600,
              }}>
                {isPast ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: '14px', color: isCurrent ? '#E2E8F0' : '#94A3B8' }}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
```

### 5C: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-15 | Subway component exists in plan import | `grep -n "Step.*Upload\|step.*upload\|subway\|STEPS.*upload\|PlanImportSubway" web/src/app/admin/launch/plan-import/page.tsx` | Match found |
| PG-16 | Three steps defined | `grep "upload.*review.*confirm\|STEPS.*length\|step.*1.*2.*3" web/src/app/admin/launch/plan-import/page.tsx` | 3 steps found |

**Commit:** `OB-58 Phase 5: Plan import subway — 3-step progress indicator`

---

# ═══════════════════════════════════════════════════
# PHASE 6: LANGUAGE SWITCHER
# ═══════════════════════════════════════════════════

**Problem:** Language switcher in the top bar shows "English" with flag icon but clicking doesn't change UI labels. The tenant locale drives labels, not the user's language preference.

### 6A: Audit current state

```bash
echo "=== LANGUAGE SWITCHER COMPONENT ==="
grep -rn "language\|locale\|i18n\|translate\|English\|Spanish\|Español" web/src/components/ --include="*.tsx" -l | head -10
grep -rn "LanguageSwitcher\|language-switcher\|lang.*switch" web/src/ --include="*.tsx" | head -10

echo ""
echo "=== PROFILE LANGUAGE FIELD ==="
grep -rn "profile.*language\|language.*profile\|setLanguage" web/src/ --include="*.ts" --include="*.tsx" | head -10
```

### 6B: Expected behavior

The language switcher should:
1. Read current language from the user's profile (`profiles.language`)
2. On click, toggle between available languages (es, en, pt)
3. Update `profiles.language` in Supabase
4. Re-render labels in the selected language

If a full i18n system doesn't exist, the minimum viable implementation is:
- Dashboard section headings and UI chrome labels have a simple lookup
- AI-generated content language is controlled by the prompt (already works — sends in tenant locale)
- User preference stored in profile for future full i18n

### 6C: Minimum viable fix

If full i18n is too large for this OB:
1. Make the switcher correctly update `profiles.language`
2. Use the stored language to control the AI insight prompt language
3. Add a comment: `// TODO: Full i18n for UI chrome labels — OB-59`
4. Ensure the switcher gives visual feedback (selected language highlighted)

### 6D: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-17 | Language switcher updates profile | `grep "profiles.*update.*language\|language.*update.*profile\|setLanguage" web/src/ -r --include="*.ts" --include="*.tsx" \| wc -l` | ≥1 |
| PG-18 | Language preference is read from profile | `grep "profile.*language\|language.*profile" web/src/ -r --include="*.ts" --include="*.tsx" \| wc -l` | ≥2 |

**Commit:** `OB-58 Phase 6: Language switcher — stores preference, visual feedback`

---

# ═══════════════════════════════════════════════════
# PHASE 7: VERIFICATION AND COMPLETION
# ═══════════════════════════════════════════════════

### 7A: Build verification

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
curl -s localhost:3000 | head -5
```

### 7B: Cross-cutting verification

```bash
echo "=== FINAL VERIFICATION ==="

echo "1. Plan import API exists and uses service role:"
grep "ServiceRole\|service.role" web/src/app/api/plan/import/route.ts 2>/dev/null

echo ""
echo "2. No direct rule_sets insert from browser:"
grep -n "supabase.*from.*rule_sets.*insert" web/src/app/admin/launch/plan-import/page.tsx 2>/dev/null | wc -l

echo ""
echo "3. Sidebar reads persona:"
grep "usePersona\|persona" web/src/components/navigation/ChromeSidebar.tsx 2>/dev/null | head -3

echo ""
echo "4. Faint colors in sidebar (must be 0):"
grep -rn "64748B\|475569\|334155" web/src/components/navigation/ChromeSidebar.tsx 2>/dev/null | grep "color" | wc -l

echo ""
echo "5. Observatory readable colors:"
grep -rn "E2E8F0\|CBD5E1\|F8FAFC" web/src/components/platform/ --include="*.tsx" | wc -l

echo ""
echo "6. Hardcoded 'Advance to Official' (must be 0):"
grep -rn "Advance to Official" web/src/components/dashboards/ 2>/dev/null | wc -l

echo ""
echo "7. Plan import subway exists:"
grep "upload.*review.*confirm\|STEPS\|PlanImportSubway" web/src/app/admin/launch/plan-import/page.tsx 2>/dev/null | head -3
```

### 7C: Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-19 | TypeScript: zero errors | `npx tsc --noEmit` exit code | 0 |
| PG-20 | Build: clean | `npm run build` exit code | 0 |
| PG-21 | localhost responds | `curl -s localhost:3000 \| head -1` | HTML content |

### 7D: Completion report

Create `OB-58_COMPLETION_REPORT.md` at PROJECT ROOT with all 21 proof gates and terminal evidence.

### 7E: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-58: Visual Polish, Pipeline Fixes, Sidebar Scoping" \
  --body "## What This OB Delivers

### Phase 0: Plan Import 400 Fix (P0)
- Service role API route for rule_sets insert
- Plan import page calls API instead of direct browser insert
- Error handling with user-visible messages

### Phase 1: Sidebar Scope Enforcement (P0)
- Workspace visibility filtered by persona at render time
- Admin: 6 workspaces, Manager: 3, Rep: 1
- Redirect when persona changes and current workspace not accessible

### Phase 2: Global Text Brightness (P0)
- Sidebar: minimum #CBD5E1, 14px workspace labels
- Observatory: all tabs minimum 14px body, 18px headings
- AI panels: 16px headings, 14px body
- All inline styles — CSS cannot override

### Phase 3: Lifecycle Button Fix (P1)
- Dynamic button label from current lifecycle state
- APPROVED → 'Post Results', not 'Advance to Official'

### Phase 4: Periods 400 Fix (P1)
- tenant_id filter on all periods queries

### Phase 5: Plan Import Subway (P1)
- 3-step indicator: Upload → Review → Confirm

### Phase 6: Language Switcher (P1)
- Updates profile.language in Supabase
- Visual feedback on selection

## Proof Gates: 21 — see OB-58_COMPLETION_REPORT.md"
```

**Commit:** `OB-58 Phase 7: Verification, completion report, PR`

---

## PROOF GATE SUMMARY (21 gates)

| Range | Mission | Phase | Count |
|-------|---------|-------|-------|
| PG 1-4 | Plan Import 400 Fix | 0 | 4 |
| PG 5-7 | Sidebar Scoping | 1 | 3 |
| PG 8-11 | Text Brightness | 2 | 4 |
| PG 12-13 | Lifecycle Button | 3 | 2 |
| PG 14 | Periods 400 | 4 | 1 |
| PG 15-16 | Plan Import Subway | 5 | 2 |
| PG 17-18 | Language Switcher | 6 | 2 |
| PG 19-21 | Build + Verification | 7 | 3 |

---

## OUT OF SCOPE

| Item | When |
|------|------|
| Canvas (React Flow) | OB-59 |
| Full i18n system | OB-59 |
| Uniform -9.1% budget delta investigation | OB-59 |
| Data Operations flow discussion | Strategic session |
| Embedded training system | Backlog P2 |
| Stripe/payment integration | Future |

---

## OPEN DISCUSSION ITEM (NOT FOR CC)

**Data Operations Flow and Locations** — flagged by Andrew during CLT-56. The Operate workspace navigation (Import, Calculate, Reconcile, Approve, Pay, Monitor) needs a design discussion about:
- Where does transactional data import live vs plan import?
- Should Import split into "Import Plan" and "Import Data"?
- How does the Data Ingestion Facility relate to the Operate sidebar?
- Is the Data workspace (from Figma Site Tree 2.0 — OBSOLETE) being replaced by Operate > Import?

This is a strategic design decision, not a code fix. Schedule for next strategy session.

---

*OB-58 — February 18, 2026*
*"The dashboards work. Now make everything around them work too."*
