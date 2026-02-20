# HF-051: PRODUCTION PAGES NOT RESOLVING + GPV FEATURE FLAG + SIDEBAR FONTS

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

**MANDATORY:** Read CC_STANDING_ARCHITECTURE_RULES.md FIRST. Evaluate every change against anti-pattern registry.

---

## THE PROBLEMS — CLT-65 FINDINGS (February 19, 2026)

Browser testing on production (vialuce.ai) after HF-050 auth fix revealed multiple issues:

### Problem 1: PAGES NOT RESOLVING (P0)
Multiple authenticated pages show infinite loading spinners. The Operate page shows "Loading periods..." forever despite the RSC request returning 200 with 14KB of data. The server has the data — the client isn't rendering it. This pattern likely affects multiple workspace pages (Operate, Configure, Govern, Investigate) wherever a query returns empty results or the loading state resolution logic has a gap.

**Root cause hypothesis:** Pages check for data, and when data is empty (no periods, no calculation batches, no entities), the loading state never transitions to an empty state. The component stays in `isLoading=true` forever because the "loaded" condition requires `data.length > 0` rather than `data !== null`.

### Problem 2: GPV WIZARD EXPOSED PUBLICLY (P1)
The Guided Proof of Value wizard renders as the default landing for every tenant after login. It shows "Upload Your Compensation Plan" with file drop zone. This is:
- Not ready for public exposure
- ICM-biased language ("Compensation Plan") violating domain-agnostic principle
- Blocking access to the actual admin tools
- Needs a feature flag so it can be toggled on/off from Observatory

### Problem 3: SIDEBAR FONTS TOO SMALL (P2 — RECURRING)
The sidebar navigation menu items are consistently too small across all pages. This has been flagged multiple times and keeps not getting fixed. Menu items (Observatory, Operate, Perform, etc.), section headers (WORKSPACES, PERFORM, MY PAY, MY TEAM, TRENDS), and the search bar are all undersized.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. Architecture Decision Gate before implementation
5. Anti-Pattern Registry check (AP-1 through AP-20)

---

## PHASE 0: DIAGNOSTIC — IDENTIFY ALL BROKEN PAGES

### 0A: Audit every workspace page for loading state handling

```bash
echo "=== ALL WORKSPACE PAGES ==="
find web/src/app -name "page.tsx" | sort

echo ""
echo "=== LOADING STATE PATTERNS ==="
echo "--- Pages with loading/spinner that might never resolve ---"
grep -rn "isLoading\|loading\|Loading\|Cargando\|spinner\|Spinner" web/src/app/*/page.tsx web/src/app/*/*/page.tsx --include="*.tsx" 2>/dev/null | head -40

echo ""
echo "=== EMPTY STATE HANDLING ==="
echo "--- Do pages handle empty data? ---"
grep -rn "length === 0\|\.length\|no data\|no.*found\|empty\|Empty" web/src/app/*/page.tsx web/src/app/*/*/page.tsx --include="*.tsx" 2>/dev/null | head -40

echo ""
echo "=== SUPABASE QUERIES IN PAGES ==="
echo "--- What data does each page fetch? ---"
grep -rn "from('\|\.select\|useQuery\|useSWR\|fetch.*api" web/src/app/operate/ web/src/app/configure/ web/src/app/govern/ web/src/app/investigate/ web/src/app/perform/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -40

echo ""
echo "=== PERIOD QUERIES SPECIFICALLY ==="
grep -rn "periods\|period" web/src/app/operate/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -20
```

### 0B: Test each workspace page on localhost

```bash
# Start dev server and test each route
echo "=== TESTING WORKSPACE ROUTES ==="
for route in operate configure govern investigate perform admin; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$route)
  echo "$route → HTTP $STATUS"
done
```

### 0C: Identify the GPV rendering trigger

```bash
echo "=== GPV WIZARD RENDERING ==="
grep -rn "GPVWizard\|useGPV\|gpv_state\|isComplete\|gpv" web/src/app/*/page.tsx web/src/app/*/*/page.tsx --include="*.tsx" 2>/dev/null | head -20

echo ""
echo "=== WHERE GPV OVERRIDES NORMAL DASHBOARD ==="
grep -rn "GPVWizard" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v components/gpv

echo ""
echo "=== GPV COMPLETION CHECK ==="
cat web/src/hooks/useGPV.ts 2>/dev/null || cat web/src/hooks/useGPV.tsx 2>/dev/null
```

### 0D: Sidebar font sizes

```bash
echo "=== SIDEBAR COMPONENT ==="
find web/src -name "*sidebar*" -o -name "*Sidebar*" -o -name "*side-bar*" -o -name "*rail*" -o -name "*Rail*" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== CURRENT FONT SIZES IN SIDEBAR ==="
grep -rn "text-xs\|text-sm\|text-\[10\|text-\[11\|text-\[12\|fontSize.*1[0-2]" web/src/components/layout/sidebar* web/src/components/layout/rail* web/src/components/navigation/ --include="*.tsx" 2>/dev/null | head -30
```

### 0E: Document all findings

Create `HF-051_DIAGNOSTIC.md` at project root with:
1. List of every page tested and whether it resolves
2. The exact loading state pattern causing infinite spinners
3. Where GPV wizard rendering is triggered
4. Current sidebar font sizes

**Commit:** `HF-051 Phase 0: Production page resolution diagnostic`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Multiple production pages fail to resolve. GPV exposed publicly.
         Sidebar fonts too small. Three fixes needed.

MISSION A: Page Resolution
  Option A1: Fix each page individually (case by case)
    REJECTED — fragile, will miss pages, doesn't prevent recurrence
  Option A2: Create a universal empty state wrapper component
    CHOSEN — <DataGuard data={data} loading={loading}> renders empty state
    or children. Applied once per page. Handles null, undefined, empty array.
    Scale: works for any page. AI-first: no hardcoding. Atomic: pure UI.

MISSION B: GPV Feature Flag
  Option B1: Platform-wide feature flag in platform_settings table
    CHOSEN — simple boolean, readable by any page, toggleable from Observatory.
    Future flags (trial gates, dispute resolution, etc.) use same table.
  Option B2: Per-tenant flag
    REJECTED for now — complexity not needed yet. Can upgrade later.

MISSION C: Sidebar Fonts
  Option C1: Increase Tailwind classes across sidebar components
    CHOSEN — direct, verifiable, proof gate = screenshot with readable text.
    Minimum: menu items text-sm (14px), section headers text-xs (12px) with
    font-medium, search text-sm.
```

**Commit:** `HF-051 Phase 1: Architecture decision`

---

## PHASE 2: FIX PAGES NOT RESOLVING

### 2A: Create universal DataGuard component

Create `web/src/components/ui/DataGuard.tsx`:

```typescript
'use client';

interface DataGuardProps {
  loading: boolean;
  data: unknown[] | null | undefined;
  loadingMessage?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  children: React.ReactNode;
}

export function DataGuard({
  loading,
  data,
  loadingMessage = 'Loading...',
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'Get started by importing data or configuring your workspace.',
  emptyAction,
  children,
}: DataGuardProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-4" />
        <p className="text-sm">{loadingMessage}</p>
      </div>
    );
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center px-4">
        <div className="text-4xl mb-4">📋</div>
        <h3 className="text-lg font-semibold text-slate-200 mb-2">{emptyTitle}</h3>
        <p className="text-sm text-slate-400 max-w-md mb-4">{emptyMessage}</p>
        {emptyAction}
      </div>
    );
  }

  return <>{children}</>;
}
```

### 2B: Fix Operate page

Find the Operate page and wrap its content with DataGuard:

```bash
cat web/src/app/operate/page.tsx
```

Replace the loading pattern:
```typescript
// BEFORE (broken — loading never resolves on empty data)
if (loading) return <Spinner />;
// ... renders data assuming it exists

// AFTER (handles both loading and empty)
<DataGuard
  loading={loading}
  data={periods}
  loadingMessage="Loading periods..."
  emptyTitle="No periods configured"
  emptyMessage="Create your first period to begin managing your compensation lifecycle."
  emptyAction={
    <button onClick={() => router.push('/configure/periods/new')}
      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500">
      Create Period
    </button>
  }
>
  {/* existing page content */}
</DataGuard>
```

### 2C: Audit and fix ALL workspace pages

Apply DataGuard to EVERY page that fetches data. Check each one:

```bash
# List every page that has a loading state
for dir in operate configure govern investigate perform admin insights; do
  echo "=== /$dir ==="
  grep -l "loading\|isLoading\|Loading" web/src/app/$dir/page.tsx web/src/app/$dir/*/page.tsx 2>/dev/null
done
```

For each page found:
1. Identify what data it fetches
2. Identify the loading state
3. Wrap with DataGuard using contextually appropriate empty state messaging
4. Ensure loading resolves to empty state when data is null/empty

**IMPORTANT:** Empty state messages must be domain-agnostic. NOT "No compensation plans" — instead "No rule sets configured" or "No data imported for this period."

### 2D: Add timeout safety net

In case a query genuinely hangs (Supabase timeout, network issue), add a 15-second timeout to the loading state:

```typescript
// In DataGuard or in individual pages
useEffect(() => {
  if (loading) {
    const timeout = setTimeout(() => {
      setTimedOut(true);
    }, 15000);
    return () => clearTimeout(timeout);
  }
}, [loading]);
```

When timed out, show: "This is taking longer than expected. Try refreshing the page." with a refresh button.

**Commit:** `HF-051 Phase 2: Fix page resolution — DataGuard + empty states + timeout`

---

## PHASE 3: GPV FEATURE FLAG

### 3A: Create platform_settings table

```sql
-- Execute in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the GPV flag (OFF by default)
INSERT INTO platform_settings (key, value, description) VALUES
  ('gpv_enabled', 'false'::jsonb, 'Guided Proof of Value wizard — when OFF, authenticated users see normal dashboard'),
  ('trial_gates_enabled', 'false'::jsonb, 'Trial limitation gates — when OFF, all features unrestricted'),
  ('public_signup_enabled', 'true'::jsonb, 'Public signup flow — when OFF, signup page shows "coming soon"')
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Platform admins can read
CREATE POLICY "platform_read_settings" ON platform_settings
  FOR SELECT USING (
    (SELECT scope_level FROM profiles WHERE id = auth.uid()) = 'platform'
  );

-- Platform admins can update
CREATE POLICY "platform_update_settings" ON platform_settings
  FOR UPDATE USING (
    (SELECT scope_level FROM profiles WHERE id = auth.uid()) = 'platform'
  );

-- VL Admin service role can do everything
CREATE POLICY "service_role_settings" ON platform_settings
  FOR ALL USING (auth.role() = 'service_role');
```

**EXECUTE THIS IN SUPABASE SQL EDITOR. THEN VERIFY:**
```sql
SELECT * FROM platform_settings;
-- Must return 3 rows
```

### 3B: Create API route for settings

Create `web/src/app/api/platform/settings/route.ts`:

- GET: Returns all platform settings (platform admin only)
- PATCH: Updates a single setting by key (platform admin only)
- Uses service role client for writes
- Returns the updated setting

### 3C: Create usePlatformSettings hook

Create `web/src/hooks/usePlatformSettings.ts`:

```typescript
export function usePlatformSettings() {
  // Fetches settings from API
  // Returns { settings, loading, updateSetting }
  // updateSetting(key, value) → PATCH /api/platform/settings
}

export function useFeatureFlag(key: string, defaultValue: boolean = false): boolean {
  const { settings, loading } = usePlatformSettings();
  if (loading) return defaultValue;
  const setting = settings?.find(s => s.key === key);
  return setting ? setting.value === true : defaultValue;
}
```

### 3D: Gate the GPV wizard behind the feature flag

Find where GPV renders (from Phase 0C diagnostic) and add the gate:

```typescript
const gpvEnabled = useFeatureFlag('gpv_enabled', false);

// If GPV is disabled, skip the wizard entirely — show normal dashboard
if (!gpvEnabled) {
  return <NormalDashboard />;
}

// Original GPV logic
if (!loading && !isComplete) {
  return <GPVWizard ... />;
}
```

### 3E: Add toggle to Observatory

In the Observatory billing/settings tab, add a Feature Flags section:

```typescript
// Simple toggle row
<div className="flex items-center justify-between py-3 border-b border-slate-700">
  <div>
    <p className="text-sm font-medium text-slate-200">Guided Proof of Value</p>
    <p className="text-xs text-slate-400">When enabled, new tenants see the onboarding wizard</p>
  </div>
  <button
    onClick={() => updateSetting('gpv_enabled', !gpvEnabled)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      gpvEnabled ? 'bg-indigo-600' : 'bg-slate-600'
    }`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
      gpvEnabled ? 'translate-x-6' : 'translate-x-1'
    }`} />
  </button>
</div>
```

**Commit:** `HF-051 Phase 3: GPV feature flag — platform_settings table + Observatory toggle`

---

## PHASE 4: SIDEBAR FONT SIZE FIX

### 4A: Identify sidebar component(s)

```bash
echo "=== SIDEBAR FILES ==="
find web/src/components -name "*sidebar*" -o -name "*Sidebar*" -o -name "*navigation*" -o -name "*Navigation*" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== RAIL FILES ==="
find web/src/components -name "*rail*" -o -name "*Rail*" | grep -v node_modules | grep -v ".next"
```

### 4B: Apply font size increases

**Minimum font sizes for sidebar elements:**

| Element | Current (likely) | Target | Tailwind Class |
|---------|-----------------|--------|---------------|
| Workspace items (Operate, Perform, etc.) | text-xs (12px) | text-sm (14px) | `text-sm` |
| Section headers (WORKSPACES, PERFORM, etc.) | text-[10px] or text-xs | text-xs (12px) + font-semibold | `text-xs font-semibold` |
| Sub-items (Home, My Pay, My Team, etc.) | text-xs (12px) | text-sm (14px) | `text-sm` |
| Search bar text | text-xs | text-sm | `text-sm` |
| User name at bottom | text-xs or text-sm | text-sm (14px) | `text-sm` |
| User role at bottom | text-[10px] or text-xs | text-xs (12px) | `text-xs` |

### 4C: Apply changes

Find and replace font size classes in all sidebar/navigation components. Use `grep` to find every instance:

```bash
# Find all small text classes in sidebar
grep -rn "text-\[10px\]\|text-\[11px\]\|text-xs" web/src/components/layout/sidebar* web/src/components/layout/rail* web/src/components/navigation/ --include="*.tsx" 2>/dev/null
```

Replace:
- Menu items: `text-xs` → `text-sm`
- Section headers: `text-[10px]` → `text-xs font-semibold tracking-wider`
- Sub-items: `text-xs` → `text-sm`
- Any `text-[10px]` or `text-[11px]` → minimum `text-xs`

**NO element in the sidebar should be smaller than 12px (text-xs).**

### 4D: Verify visually

After changes, take note of the sidebar on localhost:3000. Every menu item must be clearly readable without squinting.

**Commit:** `HF-051 Phase 4: Sidebar font size fix — minimum 12px, menu items 14px`

---

## PHASE 5: VERIFICATION + BUILD + PR

### 5A: Page resolution test

```bash
echo "=== TESTING ALL WORKSPACE PAGES ==="
for route in operate configure govern investigate perform admin insights observatory; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$route)
  SIZE=$(curl -s http://localhost:3000/$route | wc -c)
  echo "$route → HTTP $STATUS (${SIZE} bytes)"
done
```

### 5B: Feature flag test

```bash
echo "=== FEATURE FLAG TEST ==="
# Check settings exist
curl -s http://localhost:3000/api/platform/settings | head -200
echo ""
# GPV should be OFF
echo "GPV flag should be false"
```

### 5C: Build

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

### 5D: Proof gates

| # | Gate | Pass Criteria | Method |
|---|------|--------------|--------|
| PG-1 | Diagnostic documents all broken pages | List created | Phase 0 |
| PG-2 | DataGuard component exists | File exists + exported | grep |
| PG-3 | Operate page resolves (not infinite loading) | curl returns 200, page renders content or empty state | Browser |
| PG-4 | Configure page resolves | Same | Browser |
| PG-5 | Govern page resolves | Same | Browser |
| PG-6 | Investigate page resolves | Same | Browser |
| PG-7 | Perform page resolves | Same | Browser |
| PG-8 | Empty state shows guidance (not spinner) | Visual check | Browser |
| PG-9 | platform_settings table exists with 3 rows | DB query | Supabase |
| PG-10 | GPV flag is OFF by default | API returns false | curl |
| PG-11 | GPV wizard does NOT render when flag is OFF | Visual check | Browser |
| PG-12 | Observatory has feature flag toggle | Visual check | Browser |
| PG-13 | Sidebar menu items are text-sm (14px) minimum | Visual check | Browser |
| PG-14 | No sidebar element smaller than text-xs (12px) | grep for text-[10px] returns 0 | grep |
| PG-15 | Build clean | npm run build exit 0 | Terminal |
| PG-16 | Zero new anti-pattern violations | AP-1 through AP-20 | Review |

### 5E: Completion report

Create `HF-051_COMPLETION_REPORT.md` at PROJECT ROOT.

### 5F: PR

```bash
git add -A && git commit -m "HF-051 Phase 5: Verification + completion report"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-051: Fix page resolution + GPV feature flag + sidebar fonts" \
  --body "## Problems (CLT-65)
1. Multiple workspace pages stuck on infinite loading (empty data = permanent spinner)
2. GPV wizard publicly exposed before ready
3. Sidebar fonts too small (recurring issue)

## Fixes
1. DataGuard component: universal loading → empty state handler with timeout
2. platform_settings table + Observatory toggle: GPV OFF by default
3. Sidebar font minimum: 14px menu items, 12px section headers

## Proof Gates: 16 — see HF-051_COMPLETION_REPORT.md"
```

---

## ANTI-PATTERNS TO AVOID

| # | Don't | Do Instead |
|---|-------|-----------|
| 1 | Leave loading state that never resolves | Always handle: loading → data → empty state |
| 2 | Hardcode feature flags in code | Store in database, expose via API, toggle in Observatory |
| 3 | Use text-[10px] or text-[11px] anywhere in sidebar | Minimum text-xs (12px), prefer text-sm (14px) for menu items |
| 4 | Show ICM-specific language in empty states | Domain-agnostic: "No data imported" not "No commissions" |
| 5 | Fix one page and assume others are fine | Audit ALL workspace pages for the same pattern |
| 6 | Create the migration file without executing | Execute in SQL Editor AND verify with DB query |

---

## PROPOSED ANTI-PATTERN ADDITION

```
### UX & Client
| AP-21 | Loading state that never resolves on empty data | DataGuard: loading → data → empty state, always | HF-051 |
```

---

*HF-051 — February 19, 2026*
*"A page that loads forever is worse than a page that says 'nothing here yet.' One is broken. The other is honest."*
