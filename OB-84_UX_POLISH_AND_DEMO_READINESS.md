# OB-84: UX POLISH + DEMO READINESS
## Fix Readability, Simplify Navigation, Wire Data, Remove Dead Ends

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `DS-001_vialuce-ui-design-spec-v3.jsx` — THE canonical design reference
4. `OB-82_COMPLETION_REPORT.md` — current platform state (40+ pages, 0 broken)
5. `OB-83_COMPLETION_REPORT.md` — domain dispatch + assessment panels

**Read all five before writing any code.**

---

## WHY THIS OB EXISTS

OB-82 proved the platform builds clean and all pages render. OB-83 closed both P1 gaps (domain dispatch + AI assessment panels). But the co-founder briefing v2 flagged UX polish as P2 — and co-founders don't demo architectures, they demo surfaces.

CLT-51A (browser verification, February 17) documented specific findings that remain unresolved. This OB addresses the highest-impact subset: the issues that make the platform look unprofessional in a live demo.

**After OB-84, every page a prospect sees in a demo looks intentional, readable, and wired to real data.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. **CC Admin always sees English** regardless of tenant locale. This is Standing Rule 3.
7. **Inline styles for visual-critical properties.** Tailwind has been overridden by globals in 5+ prior attempts. For backgrounds, gradients, font sizes that MUST render: use inline styles.
8. **Fix logic, not data.**
9. **No dead ends.** If a nav item leads to an empty page, either build the page or remove the nav item. Never leave a prospect staring at a blank screen.

## CC ANTI-PATTERNS — THE SPECIFIC FAILURES TO AVOID

| Anti-Pattern | What CC Did Before | What To Do Instead |
|---|---|---|
| Grep-based verification | Searched for class names, reported PASS | Trace rendering chain: HTML → body → layout → wrapper → page. If any parent overrides, child classes lose. |
| Per-component surgery | Added DS-001 classes to individual components | OB-51 fixed globals. If something still looks wrong, find the LOCAL override. |
| Silent fallback on empty data | Returned blank page for Manager/Rep | Show explicit empty state: "No calculation data for this period. Run a calculation from Operate." |
| Report inflation | "All gates PASS" without browser evidence | If you can't verify rendered output, report INCONCLUSIVE |

---

## PHASE 0: DIAGNOSTIC — WHAT DOES THE PLATFORM LOOK LIKE RIGHT NOW?

### 0A: Readability audit

```bash
echo "=== FONT SIZE BASELINE ==="
# Check globals.css and tailwind config for base font size
grep -n "font-size\|fontSize\|--font" web/src/app/globals.css | head -20
grep -n "fontSize" web/tailwind.config.ts web/tailwind.config.js 2>/dev/null | head -10

echo ""
echo "=== SIDEBAR TEXT SIZING ==="
find web/src/components -iname "*sidebar*" -o -iname "*chrome*" -o -iname "*nav*" | head -10
for f in $(find web/src/components -iname "*sidebar*" -o -iname "*chrome*" | head -5); do
  echo "--- $f ---"
  grep -n "text-\|font-\|fontSize\|style.*font" "$f" | head -15
done

echo ""
echo "=== ZINC-500 LABEL COUNT (should be zinc-300+ for dark bg) ==="
grep -rn "text-zinc-500\|text-slate-500\|text-gray-500" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l

echo ""
echo "=== TEXT-XS COUNT (likely too small on dark bg) ==="
grep -rn "text-xs" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l
```

### 0B: Navigation audit

```bash
echo "=== SIDEBAR NAVIGATION STRUCTURE ==="
# Find the navigation config/definition
grep -rn "navItems\|menuItems\|sidebarItems\|workspaces\|navigation" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v test | head -20

echo ""
echo "=== ALL PAGE ROUTES ==="
find web/src/app -name "page.tsx" -not -path "*/api/*" | sort

echo ""
echo "=== PAGES WITH MINIMAL CONTENT (likely dead ends) ==="
for f in $(find web/src/app -name "page.tsx" -not -path "*/api/*" | sort); do
  lines=$(wc -l < "$f")
  if [ "$lines" -lt 30 ]; then
    echo "  $f ($lines lines) — POSSIBLY STUB"
  fi
done
```

### 0C: Admin language audit

```bash
echo "=== ADMIN LANGUAGE — SPANISH LEAKING INTO ADMIN VIEW? ==="
grep -rn "Gobernar\|Distribución\|Ubicaciones\|Presupuesto\|Operaciones\|Rendimiento" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15
```

### 0D: Data wiring audit

```bash
echo "=== DASHBOARD DATA QUERIES ==="
grep -rn "supabase\|from(" web/src/components/dashboards/ --include="*.tsx" 2>/dev/null | head -20
grep -rn "supabase\|from(" web/src/app/**/page.tsx 2>/dev/null | head -20

echo ""
echo "=== EMPTY STATE PATTERNS ==="
grep -rn "No data\|no results\|empty\|Nothing to show\|No calculation" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15
```

### 0E: Import flow audit

```bash
echo "=== IMPORT PAGES ==="
find web/src/app -path "*import*" -name "page.tsx" | sort

echo ""
echo "=== PLAN IMPORT COMPONENT ==="
find web/src/components -iname "*import*" -o -iname "*upload*" -o -iname "*ingest*" | head -10
```

**Commit:** `OB-84 Phase 0: Diagnostic — readability, navigation, language, data, import`

---

## MISSION 1: READABILITY — FONT SIZE + CONTRAST FIX

CLT-51A Finding F-2 (P0): "Labels, sidebar text, taglines all unreadable against dark background."
CLT-51A Finding F-21 (P0): "Workspace names and lifecycle states barely legible."

### 1A: Global font minimum

In `globals.css` (or layout.tsx inline styles), establish minimum readable sizes:

```css
/* Enforce minimum readability on dark backgrounds */
body {
  font-size: 15px;  /* Base — not 14px, dark backgrounds need larger */
  line-height: 1.6;
}
```

### 1B: Label contrast upgrade

The DS-001 spec uses `text-zinc-500` for labels. On the dark background, this is too dim. Upgrade globally:

```bash
# Find and replace zinc-500 label text with zinc-400 (brighter)
# ONLY for text that serves as labels/descriptions, NOT for decorative elements
```

Rule: On dark backgrounds, the minimum contrast for readable text is `zinc-400` (#a1a1aa). For secondary labels, `zinc-300` (#d4d4d8). Pure `zinc-500` (#71717a) is only for decorative separators and disabled states.

### 1C: Sidebar text fix

In the ChromeSidebar (or whatever sidebar component renders):

- Workspace names: minimum `text-sm` (14px), color `zinc-200` (bright)
- Menu items: minimum `text-sm`, color `zinc-300`
- Active item: `text-white` with persona accent indicator
- Lifecycle states: minimum `text-xs` (12px), color `zinc-400`
- All using inline `style={{ fontSize: '14px', color: '#d4d4d8' }}` as insurance

### 1D: Small text audit

Find all `text-xs` (12px) usage. For each:
- If it's a label users need to read → upgrade to `text-sm` (14px)
- If it's a timestamp or metadata → keep `text-xs` but ensure color is `zinc-400` minimum
- If it's decorative → leave as-is

### 1E: Verify

```bash
echo "=== POST-FIX: Zinc-500 text count ==="
grep -rn "text-zinc-500" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l
echo "(Should be significantly lower than Phase 0 count)"

echo ""
echo "=== POST-FIX: text-xs count ==="
grep -rn "text-xs" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l
echo "(Should be lower — only timestamps and metadata)"
```

**Proof gates:**
- PG-1: Base font size ≥ 15px in globals
- PG-2: Sidebar text minimum 14px, color zinc-200/300
- PG-3: Label text upgraded from zinc-500 to zinc-400 minimum
- PG-4: No `text-xs` on labels users need to read (timestamps/metadata OK)

**Commit:** `OB-84 Mission 1: Readability — font size + contrast fix, 4 gates`

---

## MISSION 2: NAVIGATION SIMPLIFICATION + DEAD END REMOVAL

CLT-51A Findings F-45 (12+ items for rep), F-46 (single-child expand), F-47 (dead-end pages), F-28 (dashboard mislabeled), F-29 (duplicate routes).

### 2A: Determine navigation structure per persona

Read the sidebar configuration. Then apply these rules:

**Admin navigation** (trained operator, full access):
- Keep all workspaces but ensure each has content
- Remove any dead-end items that lead to stub/empty pages

**Manager navigation** (people-focused):
- Dashboard (landing) — team overview + AI coaching panel
- Team Performance — team member list with performance data
- Approvals — if approval workflow exists
- Maximum 4-5 top-level items

**Rep/Individual navigation** (personal, motivational):
- My Dashboard (landing) — personal performance + AI growth panel
- My Compensation — statement/details
- Disputes — if dispute workflow exists
- Maximum 3-4 top-level items

### 2B: Single-child rule

```
Rule: If a navigation section has exactly 1 child item, clicking the section
navigates directly to that child. No expand/collapse needed.
Only sections with 2+ children show an accordion.
```

Implement in the sidebar component.

### 2C: Remove dead ends

From Phase 0 diagnostic, identify every stub page (<30 lines). For each:

**Option A (preferred):** If the page route is in the navigation, REMOVE the nav item. A missing nav item is better than a dead-end click.

**Option B:** If removing would leave a workspace with zero items, build a minimal meaningful page:
- Title + description of what this page will show
- "Coming soon" with context, not a blank screen
- Link back to the dashboard

### 2D: Fix duplicate routes

CLT-51A F-28/F-29: If Overview and Performance Dashboard render identical content, eliminate one. Keep the route that makes semantic sense, redirect the other.

### 2E: Verify

```bash
echo "=== POST-FIX: Navigation item count per persona ==="
# Count nav items from the sidebar config
grep -A 50 "admin\|manager\|rep\|individual" web/src/components/navigation/*.tsx 2>/dev/null | grep -c "href\|path\|route" || echo "Check navigation config manually"

echo ""
echo "=== POST-FIX: Stub pages remaining ==="
for f in $(find web/src/app -name "page.tsx" -not -path "*/api/*" | sort); do
  lines=$(wc -l < "$f")
  if [ "$lines" -lt 30 ]; then
    echo "  $f ($lines lines)"
  fi
done
```

**Proof gates:**
- PG-5: Rep has ≤ 4 navigation items
- PG-6: Manager has ≤ 5 navigation items
- PG-7: Zero dead-end pages reachable from navigation (every nav click shows content)
- PG-8: Single-child sections navigate directly (no unnecessary expand)
- PG-9: No duplicate routes rendering identical content

**Commit:** `OB-84 Mission 2: Navigation simplification + dead end removal, 5 gates`

---

## MISSION 3: ADMIN ENGLISH ENFORCEMENT + LANGUAGE CONSISTENCY

CLT-51A Finding F-22: Admin sees Spanish labels despite Standing Rule 3.

### 3A: Identify where labels are hardcoded vs. dynamic

```bash
echo "=== HARDCODED SPANISH IN COMPONENTS ==="
grep -rn '"Gobernar"\|"Operar"\|"Rendimiento"\|"Investigar"\|"Transacciones"\|"Configuración"' web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== I18N/TRANSLATION SYSTEM ==="
find web/src -name "*.json" -path "*locale*" -o -name "*.json" -path "*i18n*" -o -name "*.json" -path "*translation*" | head -10
grep -rn "useTranslation\|t(\|i18n\|intl\|locale" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | head -15
```

### 3B: Apply the rule

**Standing Rule 3: CC Admin always sees English regardless of tenant locale.**

This means:
- VL Admin (platform admin): ALWAYS English
- Tenant Admin: respects tenant language preference
- Manager/Rep: respects user language preference

Implementation approach:
1. If there's an i18n system: ensure admin persona override returns English
2. If labels are hardcoded in Spanish: provide English equivalents for admin context
3. Sidebar workspace names and page titles are the highest priority — these are what you see first

### 3C: Verify

```bash
echo "=== POST-FIX: Spanish visible to VL Admin ==="
# Check sidebar labels and page titles for Spanish text in admin path
grep -rn "Gobernar\|Distribución\|Ubicaciones\|Presupuesto" web/src/components/navigation/ --include="*.tsx" | head -10
```

**Proof gates:**
- PG-10: VL Admin sidebar shows English workspace names
- PG-11: VL Admin page titles in English
- PG-12: Tenant user language preferences preserved (not broken by admin fix)

**Commit:** `OB-84 Mission 3: Admin English enforcement + language consistency, 3 gates`

---

## MISSION 4: DATA WIRING — EMPTY STATES + REAL QUERIES

CLT-51A Findings: F-16/17 (ingestion tab zeros), F-30 (rep shows "No Outcome"), F-38 (statements page empty).

### 4A: Audit every dashboard page for data source

For each persona dashboard (admin, manager, individual):
1. Does it query Supabase? Or display hardcoded data?
2. If it queries Supabase: is the query correct? Does it filter by tenant_id and period?
3. If no data exists: does it show a meaningful empty state?

### 4B: Build meaningful empty states

Every page that could have no data MUST show a contextual empty state. Not blank. Not "Loading..." forever. A helpful message:

```
Pattern:
┌─────────────────────────────────────────┐
│  [Icon]                                  │
│                                          │
│  No calculation results for this period  │
│                                          │
│  Run a calculation from Operate →        │
│  Import to get started →                 │
└─────────────────────────────────────────┘
```

Empty state rules:
- State what's missing (not generic "No data")
- Suggest the next action (link to the relevant page)
- Match the dark theme (zinc-900 card, zinc-400 text)
- Use inline styles for background consistency

### 4C: Observatory ingestion tab

CLT-51A F-16/17: "174 committed rows exist, tab shows 0."

Find the Observatory ingestion metrics query. Fix it to read from the correct table/column. The data exists — the query is wrong.

### 4D: Statements/calculation forensics page

CLT-51A F-38: "Statements page empty" — this is tied to the value prop of auditability.

If calculation results exist for the tenant: wire the Statements page to show entity-level results with component breakdown. This is the execution trace from OB-76/77.

If no calculation results exist: show a meaningful empty state with a link to run a calculation.

### 4E: Verify

```bash
echo "=== POST-FIX: Empty state components ==="
grep -rn "No calculation\|No data\|Get started\|Run a calculation\|Import data" web/src/ --include="*.tsx" | grep -v node_modules | wc -l
echo "(Should be > 0 — empty states exist)"
```

**Proof gates:**
- PG-13: Every dashboard page has a meaningful empty state (not blank)
- PG-14: Empty states include next-action guidance (link to import/calculate)
- PG-15: Observatory ingestion tab shows real data when committed_data rows exist
- PG-16: Statements page shows calculation results or meaningful empty state

**Commit:** `OB-84 Mission 4: Data wiring — empty states + real queries, 4 gates`

---

## MISSION 5: IMPORT FLOW VERIFICATION

The import pipeline is a critical demo moment — prospect uploads their file, AI interprets it. If this flow is broken or confusing, the demo fails.

### 5A: Trace the import flow

1. Navigate to the import page
2. Verify the upload component renders
3. Verify the file upload endpoint exists and responds
4. Verify the field mapping UI renders after upload
5. Verify the commit/save step works

### 5B: Fix any broken steps

For each step that fails:
- If it's a routing issue: fix the route
- If it's a component that doesn't render: fix the import/rendering
- If it's an API endpoint that errors: fix the endpoint
- If it's a Supabase query that returns nothing: fix the query

### 5C: Import flow UX polish

- Upload area should be visually clear (drag-and-drop zone, file type hints)
- Progress indicators during AI processing
- Field mapping results displayed clearly
- Confirmation step before committing
- Success state after commit

### 5D: Verify

```bash
echo "=== IMPORT FLOW FILES ==="
find web/src -path "*import*" -name "*.tsx" | sort
find web/src/app/api -path "*import*" -name "route.ts" | sort

echo ""
echo "=== IMPORT COMPONENTS ==="
grep -rn "upload\|dropzone\|file.*input\|FileUpload" web/src/components/ --include="*.tsx" | grep -v node_modules | head -10
```

**Proof gates:**
- PG-17: Import page renders with upload interface
- PG-18: API routes for import exist and respond (not 500)
- PG-19: Empty state on import page guides user to upload
- PG-20: Build compiles with all import flow fixes

**Commit:** `OB-84 Mission 5: Import flow verification + polish, 4 gates`

---

## MISSION 6: BUILD + COMPLETION REPORT + PR

### 6A: Final build

```bash
cd web && rm -rf .next && npm run build
echo "Final build exit code: $?"
npm run dev &
sleep 5
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
kill %1 2>/dev/null
```

### 6B: Integration checklist

```
□ npm run build exits 0?
□ localhost:3000 responds?
□ Sidebar text readable (14px+, zinc-200/300)?
□ Labels contrast (zinc-400 minimum)?
□ Rep nav ≤ 4 items?
□ Manager nav ≤ 5 items?
□ Zero dead-end pages from nav?
□ VL Admin sees English?
□ Every dashboard has empty state (not blank)?
□ Observatory ingestion wired?
□ Import page renders?
□ No 500 errors on any page?
```

### 6C: Completion report

Save as `OB-84_COMPLETION_REPORT.md` in **PROJECT ROOT**.

Structure:
1. **CLT-51A Findings Addressed**
   - F-2: Font size + contrast — CLOSED
   - F-21: Sidebar readability — CLOSED
   - F-22: Admin English — CLOSED
   - F-45: Navigation overcomplicated — CLOSED
   - F-46: Single-child expand — CLOSED
   - F-47: Dead-end pages — CLOSED
   - F-28: Dashboard mislabel — CLOSED (if applicable)
   - F-29: Duplicate routes — CLOSED (if applicable)
   - F-16/17: Ingestion tab — CLOSED
   - F-38: Statements page — CLOSED (or PARTIAL with detail)
   - F-30: Rep "No Outcome" — CLOSED (or PARTIAL with detail)

2. **Readability metrics**
   - zinc-500 text count: BEFORE → AFTER
   - text-xs count: BEFORE → AFTER
   - Base font size: BEFORE → AFTER

3. **Navigation changes**
   - Admin: BEFORE item count → AFTER
   - Manager: BEFORE item count → AFTER
   - Rep: BEFORE item count → AFTER
   - Dead ends removed: [list]
   - Duplicates eliminated: [list]

4. **Data wiring**
   - Pages with empty states: [count]
   - Pages with Supabase queries: [count]
   - Observatory fix: [detail]

5. **Files created/modified**
6. **Proof gates** — 20 gates, each PASS/FAIL
7. **Remaining issues** — anything not fixable in this OB
8. **Demo readiness assessment** — honest evaluation of "can we show this to a prospect?"

### 6D: PR

```bash
gh pr create --base main --head dev \
  --title "OB-84: UX Polish + Demo Readiness — Readability, Navigation, Data Wiring" \
  --body "## CLT-51A Findings Addressed

### Mission 1: Readability (P0)
- Base font size increased to 15px
- Label contrast upgraded: zinc-500 → zinc-400/300
- Sidebar text: 14px minimum, zinc-200/300
- text-xs reduced to timestamps only

### Mission 2: Navigation Simplification
- Rep: [X] items → [Y] items
- Manager: [X] items → [Y] items  
- Dead-end pages removed from navigation
- Single-child sections navigate directly
- Duplicate routes eliminated

### Mission 3: Admin English Enforcement
- VL Admin sidebar in English
- VL Admin page titles in English
- Tenant user preferences preserved

### Mission 4: Data Wiring + Empty States
- Meaningful empty states on every dashboard
- Next-action guidance (links to import/calculate)
- Observatory ingestion tab wired to real data
- Statements page shows results or helpful empty state

### Mission 5: Import Flow
- Upload interface renders
- API routes respond
- Empty state guides user to upload

### Proof Gates: 20 — see OB-84_COMPLETION_REPORT.md"
```

**Proof gates (final mission):**
- PG-21: `npm run build` exits 0
- PG-22: localhost:3000 responds

**Commit:** `OB-84 Final: Completion report + PR`

---

## MAXIMUM SCOPE

6 missions (Phase 0 + 5 missions + completion), 22 proof gates. After OB-84, the platform is demo-ready: readable, navigable, wired, and free of dead ends.

---

*OB-84 — February 22, 2026*
*"Architecture impresses engineers. Surfaces close deals."*
