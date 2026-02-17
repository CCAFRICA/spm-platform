# HF-036: DASHBOARD RENDERING FIX — THE PAGE IS WHITE AND EVERYTHING IS ILLEGIBLE

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## Standing Rules
1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.
6. Completion report file is created BEFORE final build verification, then appended with build results.

## CC Anti-Patterns (DO NOT DO THESE)
- **Placeholder Syndrome:** Substitutes stubs for real logic
- **Grep-Based Verification:** DO NOT verify visual fixes by grepping source files. Verify by inspecting RENDERED OUTPUT. A class in source means nothing if CSS specificity, wrapper components, or Tailwind purging prevents it from rendering.
- **Report Inflation:** DO NOT report PASS for visual gates without evidence of what actually renders. If you cannot verify in a browser, say so.
- **Silent Fallbacks:** Returns zero/null instead of throwing errors
- **Autonomy Leakage:** Stops to ask despite explicit autonomy directive

---

## THE PROBLEM — READ THIS CAREFULLY

The Óptica Luminar tenant dashboard (the page you see after clicking into a tenant from the Observatory) has the following VISUAL DEFECTS observable in the browser:

1. **THE MAIN CONTENT AREA BACKGROUND IS WHITE.** The sidebar is dark. But the area where the hero card, charts, and employee table render has a white/light gray background. DS-001 specifies `from-slate-950 via-indigo-950/40 to-slate-950` — a deep dark gradient. The rendered page shows white.

2. **ALL CHARTS ARE ILLEGIBLE.** The distribution chart bars exist but labels cannot be read. The component composition stacked bar exists but the legend is unreadable. Dark-themed text on dark-themed cards sitting on a WHITE page creates zero contrast in every direction.

3. **ALL TEXT IS UNREADABLE.** The employee table (Resumen de Nómina) shows names and amounts but they are washed out. The section headers are invisible. Nothing has the sharp white-on-dark contrast that DS-001 specifies.

4. **EVERYTHING IS FLAT.** No glass effect on cards. No floating depth. No frosted borders. The cards are rectangular blocks with no visual separation from the background.

5. **THE TENANT SELECT PAGE LOOKS CORRECT.** The Observatory at `/select-tenant` renders with dark background, readable text, proper card treatment. This proves the design tokens and dark theme CAN work. Something in the tenant dashboard rendering chain is breaking them.

### The Contrast

| Element | Tenant Select (CORRECT) | Dashboard (BROKEN) |
|---------|------------------------|-------------------|
| Background | Dark (#0A0E1A) | White/light gray |
| Cards | Dark with borders, depth | Flat, no contrast |
| Text | Bright white on dark | Washed out, illegible |
| Overall feel | Professional cockpit | Broken admin template |

### Why HF-035 Didn't Fix This

HF-035 added the correct class names to the dashboard components and reported 19/19 PASS. But the verification was done by grepping source files — checking that `bg-zinc-900/80` exists in AdminDashboard.tsx. **It did not verify what actually renders in the browser.**

The most likely causes:
- A parent wrapper (auth-shell, ChromeSidebar layout, or page.tsx) applies a white/light background that overrides the component-level dark classes
- Tailwind's `dark:` variant isn't activating for the dashboard route even though `className="dark"` is on `<html>`
- CSS specificity: a more-specific selector from globals.css or a layout component beats the Tailwind utility classes
- The PersonaLayout gradient wrapper isn't wrapping the dashboard content, or it's being overridden by another wrapper
- The dashboard route uses a different layout chain than the tenant select route

---

## PHASE 0: BROWSER-FIRST DIAGNOSIS

**DO NOT grep source files.** Instead, trace the actual rendering chain.

### 0A: Identify the layout chain for the dashboard route

The dashboard is at `/` (after tenant selection). Trace every layout component from `<html>` to the dashboard content:

```bash
echo "=== ROOT LAYOUT ==="
head -30 web/src/app/layout.tsx

echo ""
echo "=== DOES / USE A SUB-LAYOUT? ==="
cat web/src/app/page.tsx | head -40

echo ""
echo "=== AUTH SHELL ==="
cat web/src/components/layout/auth-shell.tsx 2>/dev/null | head -60

echo ""
echo "=== CHROME SIDEBAR WRAPPER ==="
grep -n "className\|bg-\|background\|min-h\|flex\|wrapper\|main\|content" web/src/components/navigation/ChromeSidebar.tsx | head -30

echo ""
echo "=== PERSONA LAYOUT ==="
cat web/src/components/layout/PersonaLayout.tsx 2>/dev/null | head -40
```

### 0B: Identify the layout chain for the tenant select route

The tenant select page at `/select-tenant` renders correctly. What's different?

```bash
echo "=== SELECT TENANT PAGE ==="
head -40 web/src/app/select-tenant/page.tsx

echo ""
echo "=== IS SELECT-TENANT EXCLUDED FROM CHROME SIDEBAR? ==="
grep -n "SHELL_EXCLUDED\|exclud\|select-tenant" web/src/components/navigation/ChromeSidebar.tsx web/src/components/layout/auth-shell.tsx | head -10
```

### 0C: Find every element that sets a background on the dashboard rendering path

```bash
echo "=== BACKGROUND-SETTING ELEMENTS ==="
# The key question: what element between <html> and the dashboard content sets bg-white or bg-gray or bg-slate-50 or any light background?

# Check globals.css for body/html background
grep -n "background\|bg-white\|bg-gray\|bg-slate\|bg-zinc-[0-4]" web/src/app/globals.css | head -10

# Check Tailwind base layer
grep -n "@layer base" web/src/app/globals.css

# Check if there's a main content wrapper with a light background
grep -rn "bg-white\|bg-gray-50\|bg-gray-100\|bg-slate-50\|bg-slate-100\|bg-zinc-50\|bg-zinc-100" \
  web/src/components/layout/ web/src/components/navigation/ web/src/app/page.tsx \
  --include="*.tsx" | head -15

# Check CSS variables - the --background variable matters
grep -n "\-\-background\|--bg\|background-color" web/src/app/globals.css | head -10
```

### 0D: Compare the two rendering chains

Document the EXACT component chain for each route:

```
DASHBOARD ROUTE (/):
<html class="dark"> → <body> → [?layout?] → [?auth-shell?] → [?ChromeSidebar?] → [?PersonaLayout?] → <AdminDashboard />

TENANT SELECT ROUTE (/select-tenant):
<html class="dark"> → <body> → [?layout?] → <PlatformObservatory />
```

The difference between these two chains IS the bug. One chain has a component injecting a white/light background. Find it.

### Phase 0 Required Output

```
RENDERING CHAIN COMPARISON
=====================================
Dashboard chain:      [list every wrapper from html to content]
Tenant select chain:  [list every wrapper from html to content]
Difference:           [which component(s) exist in dashboard but not tenant select]

BACKGROUND-SETTING ELEMENTS
=====================================
[List every element in the dashboard chain that sets a background color/class]
[Identify which one is overriding the dark theme]

ROOT CAUSE
=====================================
[Exactly which file, which line, which CSS property is making the background white]
```

**Commit:** `HF-036 Phase 0: browser-first rendering diagnosis`

---

## PHASE 1: FIX THE BACKGROUND

Based on Phase 0 findings, fix the root cause. The fix will be ONE of these:

### If a wrapper component sets bg-white/bg-gray/bg-slate-50:
Remove or replace the light background class. Replace with transparent or the persona gradient.

### If CSS variables (--background) are set to a light color:
The dark theme CSS variables should be active (since `<html>` has `class="dark"`). Check if the dashboard route somehow doesn't inherit the dark theme. Fix the variable.

### If the ChromeSidebar layout wraps the main content in a light container:
The `<main>` or content `<div>` inside ChromeSidebar probably has a light background. Replace it with `bg-transparent` or remove the background entirely so the PersonaLayout gradient shows through.

### If PersonaLayout isn't wrapping the dashboard:
Wire PersonaLayout to wrap the dashboard content. PersonaLayout applies the per-persona gradient (indigo for admin, amber for manager, emerald for rep).

### The fix must satisfy:
- The background of the main content area is dark (slate-950 base with persona-colored gradient tint)
- Cards with `bg-zinc-900/80` are VISIBLE against this dark background (semi-transparent dark on dark gradient = subtle glass effect)
- White text (`text-white`) is bright and readable against the dark background

**CRITICAL VERIFICATION:** After making the change:
1. `rm -rf .next && npm run build && npm run dev`
2. Open `http://localhost:3000` in a browser
3. Navigate to a tenant dashboard
4. The background MUST be dark. If it's still white, the fix is wrong. Keep investigating.

**Proof gate:** Main content area background is dark gradient, NOT white.

**Commit:** `HF-036 Phase 1: fix main content background`

---

## PHASE 2: VERIFY CARD VISIBILITY

Once the background is dark, verify that cards are visible:

- Hero card: gradient fill (indigo-to-violet) with bright text — should pop against the dark background
- Standard cards: `bg-zinc-900/80` with `border-zinc-800/60` — should appear as subtle glass panels
- Text inside cards: `text-white` for values, `text-zinc-500` for labels — all readable

If cards are still not visible after the background fix, check if the card classes from HF-035 are actually being applied. The most common issue: a parent component re-renders the dashboard and the HF-035 classes get lost.

**Proof gate:** Cards float above the dark background with visible borders and readable text.

**Commit:** `HF-036 Phase 2: verify card visibility on dark background`

---

## PHASE 3: VERIFY CHART LEGIBILITY

With the dark background fixed, charts should become legible because:
- Distribution chart: colored bars on dark card, light text labels
- Component stack: colored segments on dark card, light legend text
- Benchmark bars: colored fills on dark track

If charts are still illegible after the background fix, check the chart components for any inline styles or class overrides that conflict.

**Proof gate:** Distribution chart labels readable. Component stack legend readable. All chart text > AA contrast ratio against its background.

**Commit:** `HF-036 Phase 3: verify chart legibility`

---

## PHASE 4: VERIFY TEXT HIERARCHY

With dark background, verify the full text hierarchy:

| Element | Expected | Readable? |
|---------|----------|-----------|
| Hero card value (MX$20,662) | text-white text-4xl font-bold | |
| Hero card label | text-indigo-200/60 text-[10px] | |
| Section header (DISTRIBUCIÓN DE LOGRO) | text-zinc-500 text-[10px] uppercase | |
| Employee name (Carlos Garcia Lopez) | text-zinc-200 or text-white | |
| Employee payout (MX$3,348) | text-white font-medium | |
| Lifecycle state badge (Aprobado) | colored badge, readable text | |
| Stats (Mean, Median, Std Dev) | text-zinc-500 with text-white values | |

If any text is unreadable, fix the specific class.

**Proof gate:** All text elements readable. Values bright white. Labels appropriately muted.

**Commit:** `HF-036 Phase 4: verify text hierarchy`

---

## PHASE 5: OBSERVATORY NAVIGATION GAPS

OB-47 replaced `/select-tenant` with the Platform Observatory for VL Admin. Three navigation paths were lost:

### 5A: Tenant Entry from Observatory

The Observatory tab has tenant fleet cards. They MUST be clickable to enter a tenant context. Verify:

1. Each tenant card has a click handler that: sets the tenant context (cookie/state), then redirects to `/`
2. After clicking, the ChromeSidebar loads with that tenant's data and navigation
3. If this is already implemented but broken, fix it. If not implemented, wire it.

### 5B: Create New Tenant

The old tenant select page had a "Create New Tenant / Provision a new customer environment" card. This functionality must exist somewhere in the Observatory. Options:

1. Add a "Create New Tenant" card at the end of the tenant fleet cards (matching the Observatory design language)
2. OR add a "+ New Tenant" button in the Observatory tab header
3. The card/button should navigate to tenant provisioning or show a creation dialog

For now, even if the creation flow isn't fully built, the ENTRY POINT must be visible. A card/button that shows "Coming Soon" or navigates to a placeholder is better than nothing.

### 5C: Demo User Switcher Access

The persona switcher (Admin / Gerente / Vendedor / Auto tabs) was at the bottom of the old tenant select page. With the Observatory replacing that page, demo users need a way to switch personas.

Check: Is the persona switcher still accessible somewhere? If it's in the ChromeSidebar (after entering a tenant), that's acceptable. If it was ONLY on the tenant select page and is now gone, it needs to be restored — either in the Observatory or confirmed as still available in the sidebar.

**Proof gates:**
- Clicking a tenant card in the Observatory enters that tenant context and shows the dashboard
- "Create New Tenant" entry point is visible in the Observatory
- Demo persona switcher is accessible (either in Observatory or in sidebar after entering tenant)

**Commit:** `HF-036 Phase 5: Observatory navigation — tenant entry, create, and persona switcher`

---

## PHASE 6: NETWORK EFFICIENCY AUDIT

The CLT-46 screenshot showed 258 requests / 1.9MB / 5.3 seconds to load the dashboard. This is excessive.

### 6A: Identify duplicate queries

```bash
echo "=== SUPABASE QUERIES IN DASHBOARD CODE ==="
grep -rn "\.from(" web/src/lib/data/persona-queries.ts web/src/components/dashboards/ \
  --include="*.ts" --include="*.tsx" | head -30

echo ""
echo "=== REACT QUERY / SWR USAGE ==="
grep -rn "useQuery\|useSWR\|useEffect.*fetch\|useState.*fetch" web/src/components/dashboards/ \
  --include="*.tsx" | head -15

echo ""
echo "=== HOW MANY TIMES IS DATA FETCHED ON MOUNT? ==="
grep -rn "useEffect\|useMemo\|useCallback" web/src/components/dashboards/AdminDashboard.tsx | head -10
```

### 6B: Fix the most egregious duplicates

If the dashboard fires the same Supabase query multiple times (e.g., `calculation_batches` called 5 times), consolidate into a single fetch. Common patterns:
- Multiple components each fetching the same data independently → lift the fetch to the parent
- useEffect without proper dependency array → infinite re-fetch loop
- No caching → every re-render triggers a new request

Don't implement a full caching layer — just fix the obvious duplicates. Target: under 50 requests for the dashboard load, under 2 seconds.

**Proof gate:** Dashboard loads with fewer than 80 network requests (down from 258).

**Commit:** `HF-036 Phase 6: reduce duplicate Supabase queries`

---

## PHASE 7: VERIFICATION BUILD

```bash
npx tsc --noEmit        # Must exit 0
npm run build            # Must exit 0
npm run dev              # Must start without errors
```

### Proof Gates

| # | Gate | Check |
|---|------|-------|
| PG-1 | Main content background is dark gradient (NOT white) | |
| PG-2 | Hero card gradient visible and text readable | |
| PG-3 | Standard cards show glass effect (bg-zinc-900/80 visible against dark bg) | |
| PG-4 | Distribution chart: bars visible, labels readable | |
| PG-5 | Component stack: segments visible, legend readable | |
| PG-6 | Employee table: names and amounts readable (white/light text on dark) | |
| PG-7 | Section headers: uppercase zinc-500 text visible | |
| PG-8 | Tenant Select / Observatory still renders correctly (no regression) | |
| PG-9 | Observatory tabs still render correctly (no regression) | |
| PG-10 | Clicking tenant card in Observatory enters tenant and shows dashboard | |
| PG-11 | Create New Tenant entry point visible in Observatory | |
| PG-12 | Demo persona switcher accessible (Observatory or sidebar) | |
| PG-13 | Dashboard loads with < 80 network requests | |
| PG-14 | npx tsc --noEmit exits 0 | |
| PG-15 | npm run build exits 0 | |

### VISUAL VERIFICATION REQUIREMENT

For PG-1 through PG-7: paste the RENDERED APPEARANCE description. Not source code. Not class names. Describe what you SEE in the browser or what the build output tells you about the rendering chain.

If you cannot access a browser: document exactly which CSS properties compute to what values based on the rendering chain analysis, and explain WHY the background will be dark (not "because I set the class" but "because this specific CSS rule with this specificity produces this computed value").

---

## COMMIT SEQUENCE

```
Phase 0: git commit -m "HF-036 Phase 0: rendering chain diagnosis"
Phase 1: git commit -m "HF-036 Phase 1: fix main content background to dark"
Phase 2: git commit -m "HF-036 Phase 2: verify card visibility"
Phase 3: git commit -m "HF-036 Phase 3: verify chart legibility"
Phase 4: git commit -m "HF-036 Phase 4: verify text hierarchy"
Phase 5: git commit -m "HF-036 Phase 5: Observatory navigation — tenant entry, create, persona"
Phase 6: git commit -m "HF-036 Phase 6: reduce duplicate queries"
Phase 7: git commit -m "HF-036 Phase 7: verification build"
Final:   gh pr create --base main --head dev --title "HF-036: Dashboard Rendering + Observatory Navigation Fix" --body "Fixes dashboard rendering chain producing white background despite dark theme. Traces component chain from html to dashboard content, identifies wrapper injecting light background, fixes it. Restores Observatory navigation: tenant entry via fleet cards, Create New Tenant entry point, demo persona switcher access. Reduces network requests from 258 to <80."
```

---

*ViaLuce.ai — The Way of Light*
*HF-036: "If you can't read it, it doesn't exist."*
