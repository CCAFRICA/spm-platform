# OB-97: PLATFORM UX RECONCILIATION — Navigation Redesign + N+1 Root Cause + Design Polish

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query

**If you have not read both files, STOP and read them now.**

---

## WHY THIS OB EXISTS

OB-89 through OB-96 delivered architectural victories: 100% calculation accuracy, unified Operate lifecycle, persona wiring, N+1 SessionContext infrastructure, Financial module depth, and Financial Agent. But accumulated CLT findings across CLT-51A, CLT-84, CLT-85, CLT-91, and CLT-95 reveal persistent UX debt that undermines every demo:

1. **Navigation IA is incoherent** — workspaces mix metaphors (Perform vs Operate vs Investigate vs Govern), the sidebar has too many items per persona, single-child sections require unnecessary expand clicks, and the organizing principle is unclear
2. **N+1 query residue** — OB-93 introduced SessionContext + PageLoaders but CLT has not verified actual request counts post-merge. Components may still create independent Supabase clients. Must measure and fix residual violations
3. **Readability failures** — font sizes too small on dark backgrounds, zinc-500 labels unreadable, period ribbon nearly unreadable, sidebar text dim
4. **Import UX confusion** — sheet analysis pills unclear, unmapped fields appear as "won't be imported" (should say "preserved"), import confirmation missing period info, internal component IDs visible
5. **Terminology debt** — "Batch" is internal jargon (should be "Calculation Run"), stale period labels, reconciliation labels show wrong period
6. **Visual fit violations** — duplicate chart types on Trends page, cognitive fit below diversity minimum on several pages, missing reference frames

This OB is the design session Andrew has been requesting — a comprehensive sweep of every visual and navigation issue, executed as code.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Do NOT modify calculation engine, reconciliation comparison logic, or AI pipelines.**
7. **Domain-agnostic always.** Korean Test on all code.
8. **Supabase .in() ≤ 200 items.**
9. **Zero component-level Supabase calls (Standing Rule 26).**
10. **One canonical location per surface (Standing Rule 24).**

---

## FINDINGS ADDRESSED BY THIS OB

### From CLT-51A (Feb 17)
| # | Finding | Severity |
|---|---------|----------|
| F-2 | Font too small / low contrast throughout | P0 |
| F-21 | Sidebar rail text too small and dull | P0 |
| F-22 | Language selector not enforced for Admin | P1 |
| F-28 | Dashboard mislabeled as "Operate" | P1 |
| F-29 | Overview = Performance Dashboard (duplicate) | P1 |
| F-42 | Cognitive fit violations — duplicate chart types | P2 |
| F-45 | Navigation overcomplicated — 12+ items for rep | P1 |
| F-46 | Single-child menu sections require unnecessary expand click | P1 |
| F-47 | Dead-end pages in navigation | P1 |

### From CLT-84/85 (Feb 23)
| # | Finding | Severity |
|---|---------|----------|
| F-40 | Sheet analysis pills unclear | P1 |
| F-41 | Unmapped fields appear as "won't be imported" | P1 |
| F-50 | Import confirmation missing period info | P1 |
| F-53 | "Batch" terminology is internal jargon | P2 |
| F-57 | Components column empty on calculate page | P1 |
| F-58 | Zero-payout calculation advances lifecycle without warning | P2 |
| F-59 | Period ribbon nearly unreadable | P1 |

### From CLT-91 (Feb 24)
| # | Finding | Severity |
|---|---------|----------|
| F-05/17/22 | N+1 query residue — verify actual counts post OB-93 | P1 |
| F-19 | Persona switcher cosmetic only — verify post OB-94 | P2 |

### Navigation IA Redesign (S30 from Strategic Discussion Backlog)
| Topic | Priority |
|-------|----------|
| Navigation IA redesign — Andrew design session | HIGH |
| F-20: Navigation mixes metaphors | OPEN |
| 20+ stub/placeholder pages | Cleanup |

---

## PHASE 0: DIAGNOSTIC — MEASURE THE CURRENT STATE

Before changing any code, produce a comprehensive audit.

```bash
echo "============================================"
echo "OB-97 PHASE 0: PLATFORM UX DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: READABILITY BASELINE ==="
grep -rn "text-zinc-500\|text-slate-500\|text-gray-500" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l
echo "text-xs count:"
grep -rn "text-xs" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l
echo "Base font size:"
grep -n "font-size\|fontSize\|--font" web/src/app/globals.css | head -10

echo ""
echo "=== 0B: SIDEBAR NAVIGATION STRUCTURE ==="
find web/src/components -iname "*sidebar*" -o -iname "*chrome*" -o -iname "*nav*" | grep -E "\.tsx$" | sort
echo "--- Nav item count by persona ---"
grep -rn "admin\|manager\|rep\|individual\|role" web/src/components/navigation/ --include="*.tsx" --include="*.ts" | grep -ci "href\|path\|route"

echo ""
echo "=== 0C: ALL PAGE ROUTES (total page inventory) ==="
find web/src/app -name "page.tsx" -not -path "*/api/*" | sort | wc -l
echo "--- Stub pages (<30 lines) ---"
for f in $(find web/src/app -name "page.tsx" -not -path "*/api/*" | sort); do
  lines=$(wc -l < "$f")
  if [ "$lines" -lt 30 ]; then
    echo "  $f ($lines lines)"
  fi
done

echo ""
echo "=== 0D: N+1 RESIDUE — COMPONENT-LEVEL SUPABASE CALLS ==="
echo "Components with createClient():"
grep -rln "createClient\|createBrowserClient" web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | sort
echo "Count:"
grep -rn "createClient\|createBrowserClient" web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | wc -l
echo ""
echo "Components with .from():"
grep -rn "\.from(" web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | wc -l

echo ""
echo "=== 0E: LANGUAGE LEAKAGE — SPANISH IN ADMIN VIEW ==="
grep -rn '"Gobernar"\|"Operar"\|"Rendimiento"\|"Investigar"\|"Transacciones"\|"Configuración"\|"Distribucion"' web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0F: TERMINOLOGY AUDIT — "BATCH" IN UI ==="
grep -rn '"[Bb]atch"\|batch_id\|batchId' web/src/components/ web/src/app/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0G: IMPORT FLOW FILES ==="
find web/src -path "*import*" -name "*.tsx" | sort
find web/src -path "*sheet*analysis*" -o -path "*SheetAnalysis*" | sort
grep -rn '"won.*t be imported"\|"will not be imported"\|unmapped\|"not mapped"' web/src/ --include="*.tsx" | head -10

echo ""
echo "=== 0H: PERIOD RIBBON ==="
find web/src -name "*period*" -o -name "*Period*" | grep -E "\.tsx$" | sort
grep -rn "text-xs\|text-\[10\|text-\[11" web/src/components/*period* web/src/components/*Period* 2>/dev/null | head -10

echo ""
echo "=== 0I: DUPLICATE ROUTES ==="
echo "Reconciliation pages:"
find web/src/app -path "*reconcil*" -name "page.tsx" | sort
echo "Calculate pages:"
find web/src/app -path "*calculat*" -name "page.tsx" | sort
echo "Overview/Dashboard duplicates:"
find web/src/app -name "page.tsx" | xargs grep -l "dashboard\|overview\|Dashboard\|Overview" 2>/dev/null | head -10

echo ""
echo "=== 0J: WORKSPACE LABELS ==="
grep -rn "Perform\|Operate\|Investigate\|Govern\|Configure\|Design" web/src/components/navigation/ --include="*.tsx" | grep -v node_modules | head -30
```

**PASTE ALL OUTPUT.** This diagnostic determines the exact fix plan for every phase.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-97 Phase 0: Platform UX diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Navigation IA is incoherent. 6 workspaces with unclear boundaries,
too many nav items per persona, dead ends, and duplicate routes.

Option A: Keep 6 workspaces, clean up dead ends only
  - Lowest risk
  - Doesn't fix the fundamental IA confusion
  - REJECTED: Fixing dead ends without fixing the mental model leaves the problem

Option B: Consolidate to 4 workspaces with clear purpose
  - Perform: See data (dashboards, results, reports) — READ
  - Operate: Do things (import, calculate, reconcile, approve) — ACT
  - Configure: Set up (plans, periods, entities, settings) — SETUP
  - Financial: Module-specific workspace (when enabled) — MODULE
  - Remove: Investigate (fold dispute queue into Operate), Govern (fold audit into Configure), Design (fold plan editing into Configure)
  - Scale test: YES — fewer workspaces means clearer navigation
  - AI-first: YES — no hardcoded workspace labels
  - Domain-agnostic: YES — Korean Test passes

Option C: Single sidebar with role-filtered flat list
  - Admin: 8–10 items, no workspace grouping
  - Manager: 4–5 items
  - Rep: 3 items
  - Scale test: YES
  - Risk: Flat list doesn't scale as modules grow

CHOSEN: Option B — 4 workspace model
REASON: Workspaces provide the mental model customers need.
The READ/ACT/SETUP framework is universally understandable.
Module workspaces (Financial, future domains) extend cleanly.
Persona filtering still applies — Rep sees 3 items in Perform + their Financial views.

REJECTED: Option A — doesn't fix the root cause.
REJECTED: Option C — doesn't scale for multi-module.
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-97 Phase 1: Architecture decision — 4 workspace model" && git push origin dev`

---

## PHASE 2: NAVIGATION REDESIGN — 4 WORKSPACE MODEL

### 2A: Define the new navigation structure

**Admin Navigation:**
```
PERFORM (see data)
  ├── Dashboard (landing — module-aware overview)
  ├── Results (calculation results — batch-aware from OB-92)
  └── Trends (if exists with real data, otherwise remove)

OPERATE (do things)
  ├── Operations Center (lifecycle subway)
  ├── Import Data
  ├── Calculate
  ├── Reconciliation (canonical — Standing Rule 24)
  └── Approvals (if built, otherwise remove)

CONFIGURE (set up)
  ├── Plans (rule sets)
  ├── Periods
  ├── Entities (personnel)
  └── Settings (tenant config)

FINANCIAL (module, when enabled)
  ├── Financial Landing (card-based from OB-96)
  ├── Performance (Network Pulse)
  ├── Timeline
  ├── Staff
  ├── Leakage
  ├── Patterns
  ├── Summary
  └── Products (from OB-96)
```

**Manager Navigation:**
```
PERFORM
  ├── Dashboard (team overview)
  └── Results (team results)

OPERATE
  └── Approvals (if built)

FINANCIAL (if enabled)
  ├── Financial Landing
  └── [filtered to their locations]
```

**Rep/Individual Navigation:**
```
PERFORM
  ├── My Dashboard (personal performance)
  └── My Compensation

FINANCIAL (if enabled)
  └── Server Detail (my performance)
```

### 2B: Implement sidebar navigation

Refactor the sidebar configuration to implement the 4-workspace model:

1. **Single navigation config file** — one source of truth for all workspace × persona combinations
2. **Single-child rule** — if a workspace has only 1 child for this persona, clicking the workspace navigates directly (no expand)
3. **Role filtering** — sidebar reads from persona context (OB-94) to determine which items to show
4. **Module awareness** — Financial workspace only shows when tenant has financial module enabled
5. **Active state** — current page highlighted, parent workspace expanded
6. **No dead ends** — every sidebar item points to a real, functional page

### 2C: Remove eliminated workspaces

Delete or redirect these workspace routes:
- `/investigate/*` → if dispute queue exists, move to `/operate/disputes`; otherwise delete
- `/govern/*` → if audit log exists, move to `/configure/audit`; otherwise delete
- `/design/*` → plan editing lives in `/configure/plans`
- `/data/*` → data import lives in `/operate/import`

For each deleted route, create a redirect to the new location (Next.js middleware or page-level redirect).

### 2D: Verification

```bash
echo "=== POST-REDESIGN: Navigation items per persona ==="
echo "Admin:"
grep -c "href\|path" [SIDEBAR_CONFIG_FILE] # Replace with actual path
echo "Manager:"
echo "Rep:"

echo ""
echo "=== Dead ends remaining ==="
for f in $(find web/src/app -name "page.tsx" -not -path "*/api/*" | sort); do
  lines=$(wc -l < "$f")
  if [ "$lines" -lt 20 ]; then
    echo "  $f ($lines lines) — STILL STUB"
  fi
done

echo ""
echo "=== Workspace routes ==="
echo "Investigate (should be 0 or redirects only):"
find web/src/app/investigate -name "page.tsx" 2>/dev/null | wc -l
echo "Govern (should be 0 or redirects only):"
find web/src/app/govern -name "page.tsx" 2>/dev/null | wc -l
echo "Design (should be 0 or redirects only):"
find web/src/app/design -name "page.tsx" 2>/dev/null | wc -l
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Admin has ≤ 15 nav items total | Across all workspaces |
| PG-2 | Manager has ≤ 6 nav items total | Including Financial if enabled |
| PG-3 | Rep has ≤ 4 nav items total | Personal views only |
| PG-4 | Zero dead-end pages in navigation | Every nav click shows real content |
| PG-5 | Single-child workspaces navigate directly | No unnecessary expand click |
| PG-6 | Investigate/Govern/Design removed or redirected | No direct routes remain |
| PG-7 | Sidebar reads from persona context | OB-94 PersonaContext consumed |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-97 Phase 2: Navigation redesign — 4 workspace model" && git push origin dev`

---

## PHASE 3: READABILITY — FONT SIZE + CONTRAST + PERIOD RIBBON

### 3A: Global font minimum

Ensure base font is ≥ 15px in `globals.css`. Dark backgrounds require larger type than light.

### 3B: Label contrast upgrade

Find and replace all `text-zinc-500` on labels with `text-zinc-400` minimum:
- Labels users need to read → `text-zinc-300` (#d4d4d8)
- Secondary metadata → `text-zinc-400` (#a1a1aa)
- Decorative/disabled only → `text-zinc-500` (#71717a)

### 3C: Sidebar text

- Workspace names: min `text-sm` (14px), color `zinc-200`
- Menu items: min `text-sm`, color `zinc-300`
- Active item: `text-white` with persona accent
- Lifecycle states: min `text-xs` (12px), color `zinc-400`

### 3D: Period ribbon fix (F-59)

The period ribbon uses tiny text with low contrast. Fix:
- Period name: min `text-sm`, color `zinc-200`, font-medium
- Selected period: white text, persona accent background or underline
- Period status: `text-xs` is OK but color `zinc-400` minimum

### 3E: text-xs audit

Find all `text-xs` usage. For each:
- If it's a label users read → upgrade to `text-sm`
- If it's a timestamp or metadata → keep but ensure `zinc-400` min
- If it's decorative → leave

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-8 | Base font ≥ 15px | globals.css verified |
| PG-9 | zinc-500 text count reduced by ≥ 50% | Before/after grep count |
| PG-10 | Sidebar text minimum 14px, zinc-200/300 | Visual inspection |
| PG-11 | Period ribbon readable | Text size and contrast upgraded |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-97 Phase 3: Readability — font, contrast, period ribbon" && git push origin dev`

---

## PHASE 4: N+1 QUERY RESIDUE — MEASURE AND FIX

### 4A: Measure actual state

OB-93 introduced SessionContext + PageLoaders. Verify that component-level Supabase calls are actually eliminated:

```bash
echo "=== COMPONENT-LEVEL SUPABASE CALLS ==="
echo "Target: 0"
grep -rn "createClient\|createBrowserClient" web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== COMPONENTS WITH .from() ==="
echo "Target: 0"
grep -rn "\.from(" web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== APPROVED QUERY LOCATIONS ==="
echo "Contexts (approved):"
grep -rn "\.from(" web/src/contexts/ --include="*.tsx" | wc -l
echo "Lib/services (approved):"
grep -rn "\.from(" web/src/lib/ --include="*.ts" | wc -l
echo "Pages (should use loaders, not direct):"
grep -rn "\.from(" web/src/app/ --include="*.tsx" | grep -v node_modules | wc -l
```

### 4B: Fix remaining violations

For every component still creating its own Supabase client:
1. Identify what data it fetches
2. Move the query to SessionContext (if global) or the page loader (if page-specific)
3. Pass data as props
4. Remove createClient() import

### 4C: Browser verification instructions

Document for Andrew to verify:
```
Load each page in Chrome DevTools Network tab (Disable cache checked).
Record: request count, transfer size, finish time.

Pages to measure:
  1. /operate — target: < 50 requests
  2. /operate/results — target: < 50 requests
  3. /perform — target: < 50 requests
  4. /configure — target: < 50 requests
  5. /financial — target: < 15 requests (OB-96 RPC functions)
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-12 | Zero createClient() in components | grep returns 0 |
| PG-13 | Zero .from() in components | grep returns 0 |
| PG-14 | All queries in contexts or lib/services | Location audit passes |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-97 Phase 4: N+1 residue elimination" && git push origin dev`

---

## PHASE 5: IMPORT UX — PILLS, PRESERVATION, PERIODS

### 5A: Sheet analysis pills (F-40)

On the import sheet analysis page, each detected sheet shows colored pills for field status. Make the status pills clear:
- **Mapped** (green pill): "Employee ID → entity_external_id"
- **Preserved** (blue pill): "Will be preserved in raw data" (NOT "unmapped" or blank)
- **Ignored** (gray pill): Only if user explicitly chooses to ignore

### 5B: Unmapped fields (F-41)

Every field that doesn't have a selected mapping must show: **"Preserved in raw data"** with a blue indicator. This is the "Carry Everything, Express Contextually" principle made visible.

Do NOT show: blank, empty, "won't be imported", or "unmapped" — all of these imply the data is lost.

### 5C: Import confirmation with period info (F-50)

After import completes, the confirmation must show:
- Total records imported
- Periods detected (with names)
- Records per period
- Whether each period is new or existing
- If existing: current lifecycle state

### 5D: Remove internal component IDs from UI

Search for and replace all visible instances of `comp-1771854367335-2` style internal IDs with human-readable component names from the plan.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-15 | Unmapped fields show "Preserved" not blank | Visual inspection on import page |
| PG-16 | Import confirmation shows period info | Period names, record counts visible |
| PG-17 | No internal component IDs visible | grep finds zero in UI-facing strings |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-97 Phase 5: Import UX — pills, preservation, periods" && git push origin dev`

---

## PHASE 6: TERMINOLOGY + LANGUAGE CLEANUP

### 6A: "Batch" → "Calculation Run" (F-53)

Replace all user-facing instances of "batch" with "Calculation Run" or "Import":
- Calculation batch → "Calculation Run" in UI text
- Import batch → "Import" in UI text
- Batch selector dropdown labels → "Run: Preview — MX$1,253,832"
- Database column names DO NOT change — only UI labels

### 6B: Admin English enforcement (F-22)

VL Admin and Platform Admin must see English UI regardless of tenant locale. Find and fix any hardcoded Spanish labels in the sidebar, workspace names, or page titles that appear for admin persona.

### 6C: Reconciliation period labels (F-60)

Reconciliation page must show the correct period from the selected OperateContext, not a stale or default period label.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-18 | Zero user-facing "batch" instances | grep in components/app, excluding comments and variable names |
| PG-19 | Admin sees English sidebar | No Spanish workspace labels for admin persona |
| PG-20 | Reconciliation shows correct period | Period from OperateContext displayed |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-97 Phase 6: Terminology — batch, language, period labels" && git push origin dev`

---

## PHASE 7: CALCULATE PAGE — COMPONENT COLUMN + ZERO-PAYOUT WARNING

### 7A: Components column (F-57)

The calculate results page has an empty "Components" column. Parse `calculation_results.component_results` and display per-component payout breakdown inline or on expand.

### 7B: Zero-payout warning (F-58)

If a calculation produces $0 total payout (or all entities at $0), show a warning banner instead of silently advancing to Preview:

```
⚠ Calculation Complete — Attention Required

719 entities processed. Total payout: MX$0.00.
This typically means data fields are not mapped to plan components.
Review: Import → Sheet Analysis to verify field mappings.
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-21 | Components column shows per-component values | At least component names + amounts visible |
| PG-22 | Zero-payout shows warning banner | Not silent success |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-97 Phase 7: Calculate page — components + zero-payout warning" && git push origin dev`

---

## PHASE 8: COGNITIVE FIT — DUPLICATE CHARTS + REFERENCE FRAMES

### 8A: Trends page duplicate charts (F-42)

If Trends page has two identical line charts for the same data type, remove the duplicate. Each visual form should appear only once per page.

### 8B: Reference frames

Every metric card must include at least one reference frame:
- Trend arrow (QoQ, YoY, or period-over-period)
- Target/budget comparison
- Percentile or rank

Cards showing raw numbers with no context violate the "Thermostat not Thermometer" principle.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-23 | No duplicate chart types on Trends | Each visual form appears once |
| PG-24 | Every hero metric has a reference frame | Trend arrow or comparison visible |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-97 Phase 8: Cognitive fit — duplicate charts, reference frames" && git push origin dev`

---

## PHASE 9: BUILD + VERIFICATION + COMPLETION

### 9A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 9B: Route verification

```bash
echo "=== ALL ROUTES RETURN 200 ==="
for route in "" "perform" "operate" "operate/results" "operate/reconciliation" "operate/calculate" "configure" "configure/plans" "configure/periods" "configure/entities" "financial" "financial/performance" "financial/staff" "financial/products"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$route)
  echo "/$route: $STATUS"
done

echo ""
echo "=== ELIMINATED ROUTES (should redirect or 404) ==="
for route in "investigate" "govern" "design" "data"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$route)
  echo "/$route: $STATUS (expect 307 or 404)"
done
```

### 9C: Readability metrics

```bash
echo "=== POST-FIX METRICS ==="
echo "zinc-500 text count:"
grep -rn "text-zinc-500" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l
echo "text-xs count:"
grep -rn "text-xs" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l
echo "Component Supabase calls:"
grep -rn "createClient\|\.from(" web/src/components/ --include="*.tsx" | grep -v node_modules | wc -l
echo "User-facing 'batch':"
grep -rn '"[Bb]atch"' web/src/components/ web/src/app/ --include="*.tsx" | grep -v node_modules | wc -l
```

### 9D: Completion Report

Create `OB-97_COMPLETION_REPORT.md` at project root:

1. Navigation redesign: workspace model before → after, nav items per persona before → after
2. Readability: zinc-500 count before → after, text-xs count before → after, base font
3. N+1 residue: component createClient() count before → after
4. Import UX: pills, preservation, period confirmation
5. Terminology: "batch" count before → after, Spanish leakage fixed
6. Calculate page: components column, zero-payout warning
7. Cognitive fit: duplicate charts fixed, reference frames added
8. All proof gates with PASS/FAIL

### 9E: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-97: Platform UX Reconciliation — Navigation Redesign + Readability + N+1 + Import UX" \
  --body "## Navigation Redesign
- Consolidated from 6 workspaces to 4: Perform, Operate, Configure, Financial
- Admin: ≤15 items | Manager: ≤6 items | Rep: ≤4 items
- Investigate, Govern, Design eliminated (functionality folded into Operate/Configure)
- Single-child workspaces navigate directly
- Zero dead-end pages in navigation

## Readability
- Base font: 15px minimum
- Label contrast: zinc-500 → zinc-400/300 (dark background)
- Sidebar: 14px minimum, zinc-200/300
- Period ribbon: readable text with contrast

## N+1 Query Residue
- Zero component-level Supabase calls remaining
- All queries in contexts or lib/services

## Import UX
- Unmapped fields show 'Preserved in raw data' (not blank)
- Import confirmation shows period breakdown
- No internal component IDs visible

## Terminology
- 'Batch' → 'Calculation Run' in all UI text
- Admin sees English (no Spanish leakage)
- Reconciliation shows correct period

## Calculate Page
- Components column shows per-component breakdown
- Zero-payout calculation shows warning (not silent advance)

## Cognitive Fit
- Duplicate chart types eliminated on Trends
- Every hero metric has a reference frame

## Proof Gates: 24
## CLT Findings Addressed: 20+"
```

### Proof Gates (Final)

| # | Gate | Criterion |
|---|------|-----------|
| PG-25 | `npm run build` exits 0 | Clean build |
| PG-26 | localhost:3000 responds | HTTP 200 |
| PG-27 | PR created | URL pasted |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-97 Complete: Platform UX Reconciliation" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Navigation IA redesign (4 workspace model)
- Persona-filtered sidebar items
- Readability: font size, contrast, period ribbon
- N+1 query residue elimination
- Import UX: pills, preservation, period confirmation
- Terminology: "batch" → "Calculation Run", English enforcement
- Calculate page: components column, zero-payout warning
- Cognitive fit: duplicate charts, reference frames
- Workspace route consolidation (Investigate → Operate, Govern → Configure, Design → Configure)

### OUT OF SCOPE — DO NOT BUILD
- Calculation engine changes
- Reconciliation comparison logic changes
- AI pipeline changes
- New features (disputes, clawbacks, approvals)
- Financial module pages (OB-96 owns those)
- New data models or Supabase tables
- Mobile layouts
- Full page redesigns — this is navigation + readability + terminology, not content rebuilds

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Hardcoded workspace names | Read from navigation config, not inline strings |
| AP-2 | Creating new Supabase clients in components | Use contexts/loaders only (Standing Rule 26) |
| AP-3 | zinc-500 on readable text | zinc-400 minimum on dark backgrounds |
| AP-4 | Dead-end nav items | If it's not built, it's not in the nav |
| AP-5 | "Batch" in user-facing text | "Calculation Run" or "Import" |
| AP-6 | Internal IDs in UI | Human-readable names always |
| AP-7 | Silent zero-payout | Warning banner with actionable guidance |
| AP-8 | Duplicate chart types per page | One visual form per data type |
| AP-9 | Spanish labels for admin | English always for VL Admin / Platform Admin |

---

*ViaLuce.ai — The Way of Light*
*OB-97: The design session, executed as code.*
*"Architecture impresses engineers. Surfaces close deals."*
