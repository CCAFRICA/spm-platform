# OB-46C: PLATFORM CHROME
## NEVER ask, just build. Full autonomy. Do not stop for confirmation.

---

## CONTEXT

This is Part C of the 3-part UI rebuild (OB-46A/B/C).

**OB-46A (PR #20, merged):** Foundation — 11 shared design system components, persona context, persona-scoped data queries, 9-state lifecycle service, PersonaLayout wrapper, TopBar.

**OB-46B (PR #21, merged):** Surfaces — 3 persona-driven dashboards (Admin/Manager/Rep), Operate cockpit, My Compensation page, Period Ribbon, Period Context, 10 new viz components. 26 total design system components.

**OB-46C (this batch):** Chrome — the persistent frame around every page. Collapsible sidebar with navigation + Mission Control (Cycle/Queue/Pulse), auth diagnostic and impersonation fix, demo persona switcher, layout integration that wires everything together.

**Critical Known Issue:** The DemoPersonaSwitcher currently triggers a full Supabase signOut → signIn cycle, which drops the user to the login screen. It must be replaced with in-memory persona impersonation that swaps the PersonaContext without any auth round-trip.

---

## STANDING RULES

1. Always commit+push after every change
2. After every push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000
3. VL Admin: all users select preferred language. No forced English override.
4. Never provide CC with answer values — fix logic not data
5. Security/scale/performance by design not retrofitted. AI-first never hardcoded. Domain-agnostic always.
6. ViaLuce (formerly ClearComp). Domain: ViaLuce.ai. Supabase + Vercel + Cloudflare.
7. One commit per phase. Do NOT squash phases.
8. Completion report created BEFORE final build as a FILE at PROJECT ROOT.
9. If referencing anything from 46A/46B, read the actual file first. Do not assume — verify.
10. FigmaSiteTree_2_0.png is OBSOLETE. Never reference it. Workspace architecture is defined by DS-002 and OB-46 series only.

### CC ANTI-PATTERNS TO AVOID
- **Placeholder Syndrome:** No `// TODO`, no stub functions in any component that is in scope.
- **Schema Disconnect:** Use EXACT column names from schema. Read 46A/46B actual files before writing queries.
- **Silent Fallbacks:** Every query that returns empty data renders an explicit empty state, never a blank div.
- **Auth Round-Trip:** Demo persona switching must NEVER call Supabase signOut/signIn. Context swap only.
- **Report Burial:** Completion report at PROJECT ROOT only.
- **Over-scope:** Do NOT rebuild dashboard content, design system components, or page surfaces. Those are 46A/46B.

---

## 46A/46B FOUNDATION — WHAT YOU HAVE

Read these files FIRST before writing any code:

```
# 46A Foundation
web/src/lib/design/tokens.ts                          — PERSONA_TOKENS, WORKSPACE_TOKENS
web/src/contexts/persona-context.tsx                   — usePersona(), PersonaProvider, setPersonaOverride()
web/src/lib/data/persona-queries.ts                    — admin/manager/rep dashboard queries
web/src/lib/lifecycle/lifecycle-service.ts              — LIFECYCLE_STATES, getNextAction()
web/src/components/layout/PersonaLayout.tsx             — Gradient wrapper
web/src/components/layout/TopBar.tsx                    — Persona-aware top bar

# 46B Surfaces
web/src/contexts/period-context.tsx                    — usePeriod(), PeriodProvider
web/src/components/design-system/PeriodRibbon.tsx       — Multi-period strip
web/src/components/design-system/LifecycleStepper.tsx   — 9-state horizontal stepper
web/src/components/dashboards/AdminDashboard.tsx        — Gobernar view
web/src/components/dashboards/ManagerDashboard.tsx      — Acelerar view
web/src/components/dashboards/RepDashboard.tsx          — Crecer view
web/src/app/page.tsx                                   — Persona-driven dashboard router
web/src/app/operate/page.tsx                           — Lifecycle cockpit
web/src/app/my-compensation/page.tsx                   — Waterfall drill-down

# Auth (existing)
web/src/contexts/auth-context.tsx                      — Current auth provider
web/src/middleware.ts                                   — Supabase auth middleware
web/src/components/demo/DemoPersonaSwitcher.tsx         — THE BROKEN COMPONENT
web/src/app/login/page.tsx                             — Login page
```

**CRITICAL:** Run `cat` on ALL files listed above before starting Phase 1. Paste key findings into completion report Phase 0.

---

## SUPABASE SCHEMA REFERENCE

```
tenants             (id, name, slug, settings JSONB, locale, currency_code, ...)
profiles            (id, tenant_id, display_name, role, entity_id UUID, capabilities TEXT[], ...)
entities            (id, tenant_id, external_id, entity_type, display_name, attributes JSONB, ...)
periods             (id, tenant_id, period_key, label, status, start_date, end_date, ...)
calculation_batches (id, tenant_id, rule_set_id, period_id, lifecycle_state, entity_count, total_payout, ...)
calculation_results (id, tenant_id, calculation_batch_id, entity_id, components JSONB, total_payout, ...)
entity_period_outcomes (tenant_id, period_key, entity_id, rule_set_outcomes JSONB, total_payout, ...)
profile_scope       (profile_id, tenant_id, full_visibility_entity_ids UUID[], ...)
```

---

## PHASE 0: AUTH AND CHROME DIAGNOSTIC

Full diagnostic of the current auth flow and navigation chrome. This is read-only — no code changes.

```bash
echo "=== AUTH DIAGNOSTIC ==="

# Current auth context
cat web/src/contexts/auth-context.tsx

# Current middleware
cat web/src/middleware.ts

# DemoPersonaSwitcher — THE PROBLEM
cat web/src/components/demo/DemoPersonaSwitcher.tsx

# Auth shell / wrapper
find web/src -name "*auth*" -name "*.tsx" | head -10
find web/src -name "*auth*" -name "*.ts" | head -10

# How does persona switching currently work?
grep -rn "signOut\|signIn\|switchUser\|setUser\|impersonat" web/src/components/demo/ --include="*.tsx" | head -15
grep -rn "signOut\|signIn" web/src/contexts/auth-context.tsx | head -10

# What does setPersonaOverride do in persona-context?
grep -n "setPersonaOverride\|personaOverride\|override" web/src/contexts/persona-context.tsx | head -10

echo ""
echo "=== NAVIGATION CHROME DIAGNOSTIC ==="

# Current sidebar / navigation
find web/src -name "*sidebar*" -o -name "*Sidebar*" -o -name "*nav*" -o -name "*Nav*" | grep -v node_modules | grep ".tsx" | head -15

# Current layout structure
cat web/src/app/layout.tsx

# Mission Control components
find web/src -path "*mission-control*" -name "*.tsx" | head -10
find web/src -path "*navigation*" -name "*.tsx" | head -15

# Current Cycle/Queue/Pulse
grep -rn "CycleIndicator\|QueuePanel\|PulseMetrics\|CompensationClock" web/src --include="*.tsx" --include="*.ts" | head -15

# Where is user identity rendered?
grep -rn "UserIdentity\|user.*avatar\|user.*name\|displayName" web/src/components/navigation/ --include="*.tsx" | head -10
grep -rn "UserIdentity\|user.*avatar" web/src/components/layout/ --include="*.tsx" | head -10

# Any ClearComp references remaining?
grep -rn "ClearComp\|clearcomp\|CLEARCOMP" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10

# Any mock/placeholder data in navigation?
grep -rn "mock\|Mock\|placeholder\|PLACEHOLDER\|TODO" web/src/components/navigation/ --include="*.tsx" | head -15

echo ""
echo "=== CURRENT ROUTE STRUCTURE ==="
find web/src/app -name "page.tsx" | sort
```

Paste ALL output into completion report Phase 0.

**Key questions Phase 0 must answer:**
1. Does DemoPersonaSwitcher call Supabase signOut/signIn? (Expected: yes — this is the bug)
2. Does persona-context.tsx have setPersonaOverride? (Expected: yes — 46A built it)
3. What is the current layout.tsx structure? Does it already include PersonaLayout?
4. Do Mission Control components exist? What data do they read?
5. Is there an existing sidebar component to modify, or must we build from scratch?

**Commit:** `OB-46C Phase 0: Auth and chrome diagnostic`

---

## PHASE 1: FIX DEMO PERSONA SWITCHER — IN-MEMORY IMPERSONATION

This is the highest-priority fix. The switcher must swap persona WITHOUT auth round-trip.

### 1A: Understand the Current Flow

The current DemoPersonaSwitcher likely:
1. Has a list of demo user credentials (email + password)
2. Calls Supabase `signOut()` when user clicks a persona
3. Calls Supabase `signIn()` with the new user's credentials
4. This triggers middleware redirect → login page flash → re-auth → dashboard reload

### 1B: The Fix — Context-Only Impersonation

Replace the auth round-trip with:
1. When user clicks a persona chip, call `setPersonaOverride(persona)` from persona-context.tsx
2. Also update the profile in auth context to reflect the new persona's profile data
3. The dashboard re-renders with the new persona's view — no navigation, no page reload

**Implementation:**

```typescript
// In DemoPersonaSwitcher (rewrite)
function handlePersonaSwitch(targetPersona: 'admin' | 'manager' | 'rep') {
  // 1. Set persona override (from 46A)
  setPersonaOverride(targetPersona);
  
  // 2. Load the matching demo profile for this tenant
  // Query profiles table for a user with matching role in this tenant
  // Update the auth context's current profile (if auth context exposes a setter)
  
  // 3. NO signOut. NO signIn. NO page reload.
  // The PersonaProvider re-derives tokens, scope, queries.
  // The dashboard re-renders with new persona view.
}
```

### 1C: Profile Data for Impersonation

The switcher needs demo profile data for each persona. Two approaches:
- **A) Query Supabase for tenant profiles** — get all profiles for current tenant, group by role
- **B) Use tenant.settings.demo_users** — read from tenant settings JSONB

Check which approach the current DemoPersonaSwitcher uses. Use the same data source but skip the auth calls.

### 1D: Visual Update

The switcher should show:
- Current active persona (highlighted chip)
- Available personas for this tenant (other chips)
- Persona name + role label
- Click = instant switch, no loading spinner needed (it's a context swap)

### 1E: Verification

After fix:
1. Click persona chip → dashboard content changes immediately
2. No redirect to login page
3. No Supabase signOut/signIn calls in network tab
4. URL stays the same (/)
5. Period Ribbon + TopBar update to reflect new persona tokens

**Commit:** `OB-46C Phase 1: Demo persona switcher — in-memory impersonation (no auth round-trip)`

---

## PHASE 2: COLLAPSIBLE SIDEBAR

Build the persistent sidebar that frames every page.

### 2A: Sidebar Architecture

Two zones in the sidebar:

**Navigation Zone (top):**
- ViaLuce logo (small, at top)
- Workspace links — persona-scoped:
  - **Admin sees:** Dashboard, Operate, Disputes
  - **Manager sees:** Dashboard, My Compensation, Disputes
  - **Rep sees:** Dashboard, My Compensation, Disputes
- Active route highlighted with persona accent color
- Each item has icon + label (collapsed: icon only)

**Mission Control Zone (bottom):**
- Cycle: current lifecycle phase for active period
- Queue: count of pending action items
- Pulse: 3 vital sign dots (healthy/warning/critical)
- User identity: avatar + name + role

### 2B: Collapsed vs Expanded

**Collapsed state (~64px wide, DEFAULT):**
- Logo icon only
- Workspace icons (no labels)
- Cycle: single dot showing phase color
- Queue: badge count number
- Pulse: 3 colored dots
- User: avatar only

**Expanded state (~256px wide):**
- Logo + "ViaLuce" text
- Workspace icons + labels
- Cycle: phase name + period label + mini stepper
- Queue: top 3 items with descriptions
- Pulse: 3 metrics with labels and sparklines
- User: avatar + name + role + "Switch Persona" link

**Toggle:** Hamburger/chevron icon at bottom of nav zone. Click to expand/collapse. State persists in localStorage.

### 2C: Create Component

Create `web/src/components/layout/Sidebar.tsx`:

```typescript
interface SidebarProps {
  // Sidebar reads from PersonaContext and PeriodContext
  // No props needed — all data from context
}
```

The sidebar uses persona tokens for accent colors. Admin sidebar has indigo accents. Manager has amber. Rep has emerald. This is the Wayfinder system — the sidebar ambient color subtly communicates whose view you're in.

### 2D: Responsive

- Desktop (>1024px): Sidebar visible, collapsible
- Tablet (768-1024px): Sidebar collapsed by default, expandable
- Mobile (<768px): Sidebar hidden, accessible via hamburger in TopBar

**Commit:** `OB-46C Phase 2: Collapsible sidebar with navigation and Mission Control zones`

---

## PHASE 3: MISSION CONTROL DATA WIRING

Wire the Cycle/Queue/Pulse to read from Supabase instead of mock data.

### 3A: Cycle Data

The Cycle shows the current lifecycle phase for the active period.

Data source: `calculation_batches` table — latest batch for active period.

```typescript
async function getCycleState(tenantId: string, periodId: string) {
  const { data } = await supabase
    .from('calculation_batches')
    .select('lifecycle_state, calculated_at')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  return {
    phase: data?.lifecycle_state || 'draft',
    lastRun: data?.calculated_at || null,
  };
}
```

If no calculation_batch exists for this period, show "draft" (no calculations yet).

### 3B: Queue Data

The Queue shows pending action items, persona-specific.

```typescript
async function getQueueItems(tenantId: string, periodKey: string, persona: string) {
  const items = [];
  
  // Check lifecycle state — suggest next action
  const cycle = await getCycleState(tenantId, periodId);
  const nextAction = getNextAction(cycle.phase); // from lifecycle-service
  if (nextAction) {
    items.push({ type: 'lifecycle', label: nextAction.label, route: '/operate' });
  }
  
  // Check for missing data (admin only)
  if (persona === 'admin') {
    // Check if rule_sets exist for this tenant
    const { count: ruleSetCount } = await supabase
      .from('rule_sets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    if (ruleSetCount === 0) {
      items.push({ type: 'data', label: 'Importar Plan de Compensación', route: '/operate' });
    }
  }
  
  return items;
}
```

When the Queue is empty, show: "Todo en orden — el ciclo está saludable."

### 3C: Pulse Data

The Pulse shows vital signs — persona-specific.

**Admin Pulse:**
- Entity count (from entity_period_outcomes)
- Active periods (from periods where status = 'open')
- Outstanding items (Queue count)

**Manager Pulse:**
- Team size (from scope.entityIds.length)
- Team avg attainment (from entity_period_outcomes)
- Coaching opportunities (from acceleration signals)

**Rep Pulse:**
- My attainment %
- My rank position
- Period progress (days elapsed / total days)

### 3D: CompensationClockService

Create `web/src/lib/navigation/compensation-clock-service.ts`:

This is the single service that powers all three Mission Control zones. It reads from the same Supabase tables that the dashboard queries use. When lifecycle state changes, all three update.

```typescript
export async function getCompensationClock(
  tenantId: string,
  periodId: string,
  periodKey: string,
  persona: PersonaKey,
  scope: ScopeInfo
): Promise<{
  cycle: { phase: string; lastRun: string | null; periodLabel: string };
  queue: { items: QueueItem[]; count: number };
  pulse: { metrics: PulseMetric[] };
}> {
  // Single function, three outputs, one data source
}
```

**Commit:** `OB-46C Phase 3: CompensationClockService — Cycle/Queue/Pulse wired to Supabase`

---

## PHASE 4: APP LAYOUT INTEGRATION

Wire the sidebar, TopBar, PersonaLayout, and PeriodRibbon into a unified layout.

### 4A: Rewrite layout.tsx

The app layout becomes:

```
┌──────────────────────────────────────────────────────────────┐
│ ┌──────┐ ┌─────────────────────────────────────────────────┐ │
│ │      │ │ TopBar (persona-aware)                          │ │
│ │      │ ├─────────────────────────────────────────────────┤ │
│ │ Side │ │ PeriodRibbon (multi-period)                     │ │
│ │ bar  │ ├─────────────────────────────────────────────────┤ │
│ │      │ │                                                 │ │
│ │ Nav  │ │  Page Content                                   │ │
│ │ Zone │ │  (Dashboard / Operate / My Comp / Disputes)     │ │
│ │      │ │                                                 │ │
│ │──────│ │                                                 │ │
│ │      │ │                                                 │ │
│ │ MC   │ │                                                 │ │
│ │ Zone │ │                                                 │ │
│ │      │ │                                                 │ │
│ └──────┘ └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 4B: Provider Stack

The layout wraps children in this provider order:
1. AuthProvider (outermost — handles Supabase session)
2. PersonaProvider (derives persona from profile)
3. PeriodProvider (loads periods, sets active period)
4. Layout components (Sidebar + TopBar + PeriodRibbon + children)

### 4C: Auth Gate

Before rendering any layout, check auth state:
- If auth is loading → show ViaLuce logo centered on dark background (no flash)
- If not authenticated → redirect to /login (middleware handles this, but client-side guard too)
- If authenticated → render full layout with sidebar + content

The /login route renders WITHOUT the sidebar layout (full-screen login form).

### 4D: Demo Persona Switcher Placement

The DemoPersonaSwitcher (fixed in Phase 1) renders inside the sidebar's user identity section. It is ONLY visible when:
- User's profile has role = 'vl_admin' (platform admin), OR
- Tenant settings have demo_mode = true

For non-demo users, the user identity section just shows avatar + name + sign out button.

**Commit:** `OB-46C Phase 4: Unified app layout — Sidebar + TopBar + PeriodRibbon + auth gate`

---

## PHASE 5: ROUTE CLEANUP AND EMPTY STATES

### 5A: Route Inventory

After 46A/46B/46C, these are the ONLY active routes:

| Route | Page | Persona |
|-------|------|---------|
| `/` | Dashboard (persona-driven) | All |
| `/operate` | Lifecycle Cockpit | Admin |
| `/my-compensation` | Calculation Waterfall | Rep, Manager |
| `/disputes` | Dispute list (stub for now) | All |
| `/login` | Login form | Unauthenticated |
| `/select-tenant` | Tenant picker | VL Admin |
| `/test-ds` | Design system test page | Dev only |

### 5B: Remove Dead Routes

Find and remove any route pages that are no longer in scope:
- `/perform/*` — should already redirect to / (from 46B)
- `/insights/*` — legacy, remove
- `/transactions/*` — legacy, remove
- Any other pages from the pre-46 era that are not in the route table above

Do NOT delete `/select-tenant` — VL Admin needs it to pick a tenant after login.

### 5C: Disputes Stub Page

If `/disputes` doesn't exist, create a clean stub:
- Page title: "Disputas"
- Empty state: "No hay disputas abiertas. Las disputas se pueden iniciar desde tu panel de compensación."
- This is intentionally minimal — full dispute system is a future OB.

### 5D: Route Protection

Admin-only routes (`/operate`) must redirect non-admin personas to `/`:
```typescript
// In operate/page.tsx
const { persona } = usePersona();
if (persona !== 'admin') redirect('/');
```

**Commit:** `OB-46C Phase 5: Route cleanup, empty states, route protection`

---

## PHASE 6: CLEANUP AND POLISH

### 6A: Remove Stale ClearComp References

```bash
grep -rn "ClearComp\|clearcomp\|CLEARCOMP" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next"
```

Replace all with ViaLuce.

### 6B: Remove Mock/Placeholder Data

```bash
grep -rn "mock\|Mock\|placeholder\|PLACEHOLDER\|hardcode" web/src/components/navigation/ web/src/lib/navigation/ --include="*.tsx" --include="*.ts" | head -20
```

Replace with real Supabase queries or explicit empty states.

### 6C: Consolidate Duplicate Surfaces

Check for duplicate identity displays (top header + rail) and duplicate search (search bar + ⌘K). Consolidate:
- User identity: sidebar bottom only. TopBar shows minimal tenant name + period label.
- Search: ⌘K command palette only (if it exists). No separate search bar. If command palette doesn't exist, skip — not in 46C scope.

### 6D: Language Consistency

Verify all sidebar labels, Mission Control text, empty states, and navigation items use Spanish for Spanish-locale tenants. UI chrome must respect the user's preferred language from their profile.

**Commit:** `OB-46C Phase 6: Cleanup — ClearComp references, mock data, duplicate surfaces, language`

---

## PHASE 7: VERIFICATION

### 7A: Type Check
```bash
npx tsc --noEmit 2>&1 | head -30
```

### 7B: Build
```bash
rm -rf .next && npm run build
```

### 7C: Visual Verification at localhost:3000

| # | Test | Expected |
|---|------|----------|
| 1 | Fresh load (incognito) → / | Login page (no dashboard flash) |
| 2 | Login as platform@vialuce.com | Tenant selector or dashboard |
| 3 | Dashboard loads | Sidebar visible (collapsed), dashboard content |
| 4 | Sidebar shows navigation | Dashboard, Operate, Disputes (admin persona) |
| 5 | Expand sidebar | Labels appear, Mission Control shows Cycle/Queue/Pulse |
| 6 | Cycle shows lifecycle phase | Not "Progress 0%" — real state from Supabase |
| 7 | Queue shows items or "todo en orden" | No stale "Import Commission Plan" if plan exists |
| 8 | Pulse shows real metrics | Not "Active Tenants: 4, Total Users: 156" |
| 9 | Click persona chip → rep | Dashboard switches to Crecer view INSTANTLY |
| 10 | No redirect to login | URL stays /, no page reload |
| 11 | Network tab: zero signOut/signIn calls | Context swap only |
| 12 | Click persona chip → admin | Dashboard returns to Gobernar view |
| 13 | Navigate to /operate | Lifecycle cockpit renders |
| 14 | Navigate to /my-compensation | Waterfall renders |
| 15 | Navigate to /perform | Redirected to / |
| 16 | No console errors | Clean |

**Commit:** `OB-46C Phase 7: Verification and completion report`

---

## PROOF GATES

| # | Gate | Criteria | Evidence |
|---|------|----------|----------|
| PG-1 | Auth diagnostic complete | Phase 0 output in completion report | Paste output |
| PG-2 | Persona switch = no auth calls | Network tab shows zero signOut/signIn on persona switch | Manual verify |
| PG-3 | Persona switch = instant | Dashboard content changes without page reload or login redirect | Manual verify |
| PG-4 | Sidebar exists | `web/src/components/layout/Sidebar.tsx` renders collapsed by default | cat file |
| PG-5 | Sidebar collapses/expands | Toggle button works, state persists | Manual verify |
| PG-6 | Sidebar persona-scoped | Admin sees Operate, Rep does not | Switch personas, verify |
| PG-7 | Cycle reads Supabase | Shows real lifecycle state, not mock | grep for mock data |
| PG-8 | Queue reads Supabase | Shows contextual items or empty state | grep for mock data |
| PG-9 | Pulse reads Supabase | Shows real metrics, not hardcoded | grep for mock data |
| PG-10 | Layout unified | Sidebar + TopBar + PeriodRibbon + content on every authenticated page | Visual verify |
| PG-11 | Login page has no sidebar | /login renders full-screen, no chrome | Visual verify |
| PG-12 | No auth flash | Fresh load shows loading state then login, never dashboard | Incognito test |
| PG-13 | Dead routes removed | /insights, /transactions return 404 or redirect | curl verify |
| PG-14 | /operate admin-only | Rep persona on /operate redirects to / | Persona switch test |
| PG-15 | Zero ClearComp references | grep returns empty | Paste grep output |
| PG-16 | Zero mock data in nav | grep returns empty | Paste grep output |
| PG-17 | Build passes | `npm run build` exits 0 | Paste output |
| PG-18 | No type errors | `npx tsc --noEmit` exits 0 | Paste output |

---

## COMPLETION REPORT ENFORCEMENT

File: `OB-46C_COMPLETION_REPORT.md` at PROJECT ROOT.
Created BEFORE final build. Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence.

---

## CLT PHASE

After all phases pass, verify at localhost:3000:

1. Incognito → login page (no flash, no sidebar)
2. Login → dashboard with sidebar
3. Sidebar collapsed by default, expand toggle works
4. Mission Control: Cycle shows real phase, Queue shows items or empty, Pulse shows metrics
5. Click rep persona → instant switch, Crecer dashboard, sidebar updates
6. Click admin persona → instant switch, Gobernar dashboard, Operate appears in nav
7. Navigate all routes: /, /operate, /my-compensation, /disputes
8. /perform → redirected to /
9. Zero console errors
10. Sign out → returns to login

Add CLT results to completion report.

---

## FINAL STEP

```bash
gh pr create --base main --head dev --title "OB-46C: Platform Chrome — Sidebar, Mission Control, Auth Fix" --body "Part C of 3-part UI rebuild. Creates collapsible sidebar with persona-scoped navigation, wires Mission Control (Cycle/Queue/Pulse) to Supabase data, fixes demo persona switcher to use in-memory impersonation instead of auth round-trip, integrates unified layout (Sidebar + TopBar + PeriodRibbon), removes dead routes, cleans up ClearComp references and mock data. 18 proof gates."
```

---

*ViaLuce.ai — The Way of Light*
*OB-46C: The frame that holds the light. Navigation, awareness, identity — all in one living sidebar.*
*"Chrome is what makes a tool feel like a place."*
