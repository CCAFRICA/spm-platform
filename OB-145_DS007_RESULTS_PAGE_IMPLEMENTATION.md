# OB-145: DS-007 RESULTS PAGE IMPLEMENTATION
## Hero + Heatmap + Narrative+Spine — The Proof Surface

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply (including new Rules 27, 28, 29)
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `web/src/app/operate/calculate/page.tsx` OR wherever the calculate route lives — THE CURRENT page
4. `web/src/contexts/operate-context.tsx` — OperateContext providing Plan × Period × Batch
5. `web/src/lib/data/page-loaders.ts` — if exists, the approved data loading pattern

**Standing Rule 26:** Zero component-level Supabase calls. Components render props. Pages load data through context or page loader functions.

**Standing Rule 27:** Engine Contract verification query in every calculation OB.

**Standing Rule 28:** No PR merge without browser or SQL verification.

**Standing Rule 29:** Bulk mutations (>1,000 rows) do not require confirmation.

**Read all files before writing any code.**

---

## CONTEXT

OB-144 wired the pipeline and produced calculation results for Óptica Luminar. The current results display shows UUIDs, flat rows, and no component breakdowns. DS-007 v3 specifies the replacement:

1. **Hero section** — Total payout with animated number, 3 stat cards, component breakdown horizontal bars
2. **Store × Component heatmap** — Rows = stores, columns = 6 components, cell color = avg payout
3. **Population health strip** — Three-segment bar (Exceeds / On Track / Below)
4. **Entity table** — Sortable by payout, attainment, name, ID. Filterable by status. Searchable.
5. **Narrative + Spine expanded row** — AI summary sentence + attainment tracks with gate markers
6. **Source data teaser** — Sheet names, key field values, "View Full Trace" link

### Design Decisions (LOCKED)
- **Narrative + Spine** for expanded rows (not card grid, not waterfall)
- **Store × Component heatmap** for population view (not scatter, not treemap)
- **Five Layers of Proof** mapping: L5=Hero, L4=Heatmap+Table, L3=Narrative+Spine, L2=Source teaser, L1=Trace link
- **DM Sans** for UI text, **JetBrains Mono** for data values
- **Dark theme** consistent with DS-001 (slate-950 backgrounds, indigo admin accent)
- **Admin persona** density level (highest — governance context)

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. Fix logic not data.
7. **Korean Test:** All field references come from data, not hardcoded strings. Component names display from the rule_set components array. Store names display from entity metadata. No hardcoded "Venta Óptica" in render code.
8. **Standing Rule 26:** Zero Supabase calls in components. All data loading in page loader or context.
9. **Standing Rule 27:** Run Engine Contract verification at Phase 0 and Phase 7.

---

## ENGINE CONTRACT VERIFICATION

Run at Phase 0 and Phase 7:

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT 
  (SELECT COUNT(*) FROM entities WHERE tenant_id = t.id) as entity_count,
  (SELECT COUNT(*) FROM periods WHERE tenant_id = t.id) as period_count,
  (SELECT COUNT(*) FROM rule_sets WHERE tenant_id = t.id AND status = 'active') as active_plans,
  (SELECT COUNT(*) FROM rule_set_assignments WHERE tenant_id = t.id) as assignment_count,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = t.id AND entity_id IS NOT NULL AND period_id IS NOT NULL) as bound_data_rows,
  (SELECT COUNT(*) FROM calculation_results WHERE tenant_id = t.id) as result_count,
  (SELECT COALESCE(SUM(total_payout), 0) FROM calculation_results WHERE tenant_id = t.id) as total_payout
FROM t;
```

---

# PHASE 0: DIAGNOSTIC — MAP THE CURRENT STATE

### 0A: Engine Contract verification
Paste output. Confirm calculation results exist and total_payout > 0.

### 0B: Current calculate page structure

```bash
echo "=== CALCULATE PAGE LOCATION ==="
find web/src -path "*calculate*page*" -name "*.tsx" | head -5
find web/src -path "*results*page*" -name "*.tsx" | head -5

echo ""
echo "=== CURRENT CALCULATE PAGE ==="
# Read the full file
cat $(find web/src -path "*calculate*page*" -name "*.tsx" | head -1)

echo ""
echo "=== CURRENT RESULTS RENDERING ==="
grep -rn "calculation_results\|total_payout\|component\|payout" \
  web/src/app/operate/ --include="*.tsx" | head -30

echo ""
echo "=== HOW ARE RESULTS FETCHED? ==="
grep -rn "\.from('calculation_results')\|calculationResults\|calcResults" \
  web/src/ --include="*.ts" --include="*.tsx" | head -15
```

### 0C: Data shape for results

```sql
-- What does a calculation_result row look like?
SELECT 
  cr.id, cr.entity_id, cr.period_id, cr.rule_set_id,
  cr.total_payout,
  jsonb_pretty(cr.component_results) as components,
  jsonb_pretty(cr.metadata) as meta
FROM calculation_results cr
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
LIMIT 2;
```

```sql
-- What entity data is available for display?
SELECT e.id, e.external_id, e.display_name, e.metadata
FROM entities e
WHERE e.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
LIMIT 5;
```

```sql
-- What store info is on each entity?
SELECT DISTINCT e.metadata->>'No_Tienda' as store, COUNT(*) as entity_count
FROM entities e
WHERE e.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND e.metadata->>'No_Tienda' IS NOT NULL
GROUP BY e.metadata->>'No_Tienda'
ORDER BY entity_count DESC
LIMIT 20;
```

```sql
-- Component structure from rule_set
SELECT jsonb_array_length(components) as component_count,
  jsonb_pretty(components->0) as first_component
FROM rule_sets
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND status = 'active';
```

### 0D: OperateContext and data loading patterns

```bash
echo "=== OPERATE CONTEXT ==="
cat web/src/contexts/operate-context.tsx | head -80

echo ""
echo "=== PAGE LOADERS ==="
cat web/src/lib/data/page-loaders.ts 2>/dev/null | head -50 || echo "NO page-loaders.ts found"

echo ""
echo "=== EXISTING COMPONENT LIBRARY ==="
find web/src/components -name "*.tsx" | grep -i "hero\|metric\|heatmap\|chart\|bar\|table\|expand" | head -15
```

### 0E: Installed dependencies

```bash
echo "=== CHECK FOR CHARTING LIBS ==="
grep -E "recharts|d3|chart\.js|plotly" web/package.json || echo "No charting library installed"

echo ""
echo "=== FONT IMPORTS ==="
grep -rn "DM Sans\|JetBrains\|font\|google.*font" web/src/app/layout.tsx web/src/app/globals.css | head -10
```

**Document all findings.** This determines:
- Whether we modify the existing calculate page or create a new results route
- What data shape calculation_results uses (component_results format)
- Whether entities have store metadata for the heatmap
- What data loading patterns to follow (OperateContext vs page loader)
- Whether we need to install fonts or charting libs

**Proof gate PG-00:** Diagnostic complete. Data shape documented. Architecture decision recorded.

**Commit:** `OB-145 Phase 0: Diagnostic — results data shape, page structure, component library`

---

## PHASE 1: DATA LOADER — RESULTS QUERY

Create the data loading function that fetches everything the results page needs in ONE batch.

### 1A: Create results page loader

File: `web/src/lib/data/results-loader.ts` (or add to page-loaders.ts if it exists)

```typescript
// This function fetches ALL data for the results page in parallel.
// Standing Rule 26: Components render props. This is the single data source.

export interface ResultsPageData {
  // L5: Outcome
  totalPayout: number;
  resultCount: number;
  componentTotals: { componentName: string; componentType: string; total: number; color: string }[];
  
  // L4: Population
  entities: EntityResult[];
  storeComponentMatrix: StoreComponentCell[][];
  stores: string[];
  
  // Metadata
  planName: string;
  periodLabel: string;
  componentDefinitions: ComponentDef[];
}

export interface EntityResult {
  entityId: string;
  externalId: string;
  displayName: string;
  store: string;
  totalPayout: number;
  attainment: number | null;
  status: 'exceeds' | 'on_track' | 'below';
  componentPayouts: { componentName: string; amount: number; attainment: number | null; gateStatus: string }[];
  sourceSheets: string[];
}
```

**Requirements:**
1. Single function: `loadResultsPage(tenantId, periodId, ruleSetId)` → `ResultsPageData`
2. Use `Promise.all()` for parallel fetches: calculation_results + entities + rule_set + period
3. JOIN entities to results to get external_id, display_name, metadata (store)
4. Parse component_results from each calculation_result row
5. Build storeComponentMatrix by grouping entities by store
6. Compute attainment from committed_data or component_results metadata
7. Handle the Supabase 200-item batch limit if using `.in()`
8. Total query count target: ≤ 5 Supabase calls

### 1B: Type definitions

Create types that match the ACTUAL database schema. Read Phase 0C output to get:
- calculation_results.component_results format (JSONB — array? object? keyed by component name?)
- entities.metadata format (JSONB — does it have No_Tienda?)
- rule_set.components format (JSONB array with name, type, color, etc.)

Do NOT invent types. Read the data, then type it.

**Proof gate PG-01:** Results loader function exists. Returns all required data. ≤ 5 Supabase calls.

**Commit:** `OB-145 Phase 1: Results data loader — single batch, zero component queries`

---

## PHASE 2: HERO SECTION COMPONENT

### File: `web/src/components/results/ResultsHero.tsx`

**Left panel:**
- Total payout (animated number, large — 40px+ font)
- Plan name below
- Three stat cards: Entities with payout / Avg per entity / Components active

**Right panel:**
- Component breakdown horizontal bars
- Each bar: color swatch, component name, type badge, percentage of total, amount
- Sorted by contribution (largest first)

**Props:** Receives data from page loader, NOT from direct Supabase query.

**Design tokens:**
- Background: `rgba(99,102,241,0.08)` gradient to card surface
- Text: slate-200 for values, slate-400 for labels, slate-500 for muted
- Font: DM Sans for text, tabular-nums for all numbers
- Component type badge: monospace, small, muted background

**Korean Test:** Component names come from `componentDefinitions[].name`. Type badges from `componentDefinitions[].type`. Nothing hardcoded.

**Proof gate PG-02:** Hero section renders with real data. Total payout matches Engine Contract query. Component bars show all 6 components.

**Commit:** `OB-145 Phase 2: ResultsHero — total payout + component breakdown`

---

## PHASE 3: STORE × COMPONENT HEATMAP

### File: `web/src/components/results/StoreHeatmap.tsx`

**Structure:**
- Grid: rows = stores (sorted by avg total payout, highest first), columns = component definitions
- Header row: component names with their color swatches
- Each cell: average payout for that store's entities on that component
- Cell background: component color at opacity proportional to value/max
- Rightmost column: avg total payout per store
- Leftmost column: store identifier + entity count

**Interactions:**
- Hover cell → tooltip showing avg amount + entity count
- Click store row → filter entity table to that store (via callback prop)

**Edge cases:**
- Store with 0 entities for a component → dash, no color
- Component with gate → cells for stores below gate threshold show muted/red tint
- Single-entity stores → show as individual, not average

**Props:** `storeComponentMatrix`, `stores`, `componentDefinitions` from page loader.

**Korean Test:** Store identifiers come from entity metadata. Component names from rule_set. Zero hardcoded names.

**Proof gate PG-03:** Heatmap renders with real data. Store count matches entity grouping. Color intensity varies by value.

**Commit:** `OB-145 Phase 3: StoreHeatmap — population patterns at a glance`

---

## PHASE 4: POPULATION HEALTH + ENTITY TABLE

### File: `web/src/components/results/PopulationHealth.tsx`

Three-segment bar (Exceeds / On Track / Below) with counts. Simple. From DS-007 v3.

### File: `web/src/components/results/EntityTable.tsx`

**Columns:** Rank | External ID | Name | Store | Attainment | Component Mini-Bar | Payout | Expand

**Features:**
- Sort by: payout (default desc), attainment, name, external ID
- Filter by: status (All / Exceeds / On Track / Below)
- Filter by: store (from heatmap click or dropdown)
- Search: name, external ID, store
- Virtual scroll or paginated (load 50, "show more" button)

**Mini-bar:** 6px stacked bar per row showing component contribution proportions. Colors match component definitions.

**Props:** `entities: EntityResult[]`, `componentDefinitions`, `onStoreFilter` callback.

**Korean Test:** Column headers can be generic ("ID", "Name", "Store", "Attainment", "Payout"). Component names in mini-bar tooltips come from data.

**Proof gate PG-04:** Table renders all entities. Sorting works on all columns. Search filters correctly. Mini-bars show component proportions.

**Commit:** `OB-145 Phase 4: PopulationHealth + EntityTable — sortable, filterable, searchable`

---

## PHASE 5: NARRATIVE + SPINE EXPANDED ROW

### File: `web/src/components/results/NarrativeSpine.tsx`

**Narrative section:**
- One paragraph summarizing the entity's payout
- Template: "Earned {total}, driven by {top component} ({amount}, {attainment}% attainment). {exceptions}."
- Exceptions: gates not met, components significantly above/below peer average
- If no exceptions: "All components within expected range."

**Building the narrative:**
- Sort components by amount descending
- Top component = first sentence driver
- Zero-amount components with gates = "paid nothing — gate not met"
- Components > 130% of peer average = "above peer average"
- Components < 60% of peer average = "below peer average"
- If ALL components are zero: "All components at zero — no gates passed."

**Exception badges:**
- Gate not met: red background, ✕ icon
- Above average: green background, ▲ icon
- Below average: amber background, △ icon
- All normal: green "All components within expected range" inline

**Spine section:**
- One row per component (sorted by amount, largest first)
- Left: component name (120px)
- Center: horizontal track with attainment fill, gate marker (if applicable), 100% reference tick, dot at attainment value with percentage label
- Right: payout amount

**Spine details:**
- Track background: rgba(100,116,139,0.07)
- Fill color: component color at 50% opacity
- Dot: 12px circle, component color, 2px dark border, subtle glow
- Gate marker: 2px vertical line, green if passed, red if failed, with percentage label above
- Zero-payout row: red dot, red fill, "gate not met" text
- Flat-rate component (no attainment): show "flat rate" text instead of track

**Source data teaser (L2):**
- One line below spine: "Sources: {sheet names}" + "View Full Trace →" link
- Sheet names from entityResult.sourceSheets
- "View Full Trace" is non-functional for now (placeholder for future L1/L2 drill)

**Props:** `entity: EntityResult`, `componentDefinitions`, `peerAverages` (computed from full entity list)

**Korean Test:** All text derived from data. No hardcoded component names, sheet names, or metric names.

**Proof gate PG-05:** Narrative generates correct summary for top and bottom performers. Spine tracks show attainment with gate markers. Zero-payout components show red state.

**Commit:** `OB-145 Phase 5: NarrativeSpine — AI summary + attainment tracks`

---

## PHASE 6: WIRE THE PAGE

### 6A: Create or modify the results page

If the calculate page currently shows results inline → add a results view state
If there's a separate results route → modify it
If neither → create `web/src/app/operate/results/page.tsx`

**Page structure:**

```tsx
export default function ResultsPage() {
  // 1. Get tenant, period, ruleSet from OperateContext
  // 2. Load data via results loader
  // 3. Render components in order:
  
  return (
    <div>
      {/* Header: breadcrumb + period badge + status + action buttons */}
      <ResultsHeader />
      
      {/* L5: Outcome */}
      <ResultsHero data={heroData} />
      
      {/* L4: Population pattern */}
      <StoreHeatmap matrix={storeMatrix} onStoreFilter={setStoreFilter} />
      
      {/* L4: Population summary */}
      <PopulationHealth entities={entities} />
      
      {/* Search + filters bar */}
      <ResultsFilters />
      
      {/* L4: Entity detail */}
      <EntityTable entities={filteredEntities} onExpand={setExpandedId} />
      
      {/* Footer: calculation metadata */}
      <ResultsFooter />
    </div>
  );
}
```

### 6B: Action buttons

- **Export CSV** — download entity results as CSV (entityId, name, store, attainment, totalPayout, per-component amounts)
- **Approve Period** — placeholder (future: mark period as approved)
- **Reconcile** — navigate to `/operate/reconciliation` with current period context

### 6C: Loading state

While results loader fetches data, show skeleton placeholders matching the layout shape:
- Hero area: two gray rectangles
- Heatmap area: grid of gray cells
- Table area: row placeholders

### 6D: Empty state

If calculation_results has 0 rows for this period:
- Show message: "No calculation results for {period}. Run a calculation first."
- Link to calculate page

**Proof gate PG-06:** Full page renders with real data. All sections visible. Loading skeleton appears during fetch. Empty state shows when no results.

**Commit:** `OB-145 Phase 6: Results page — full DS-007 wired with real data`

---

## PHASE 7: BROWSER VERIFICATION

### 7A: Engine Contract verification
Run SQL query. Paste output. Confirm result_count and total_payout match what the page shows.

### 7B: Navigate to results page in browser

```
1. Open localhost:3000
2. Log in as Óptica Luminar admin
3. Navigate to Operate → Calculate (or wherever results display)
4. Select Enero 2024 period
5. Verify the results page loads
```

**Capture evidence for each section:**

- Hero section: total payout number visible and matches SQL
- Component breakdown: all 6 components with bars and amounts
- Store heatmap: stores as rows, components as columns, color intensity varies
- Population health: three-segment bar with counts
- Entity table: entities listed with external IDs (not UUIDs), names, stores, payouts
- Expand one entity: narrative sentence appears, spine tracks show attainment, gate markers visible
- Search: type a name, table filters
- Sort: click Payout header, order reverses

### 7C: Verify Korean Test

- No hardcoded component names in rendered HTML (inspect element)
- No hardcoded store names
- All text derived from database values

### 7D: Request count

Open Network tab. Count requests after page fully loads. Target: < 50.

**Proof gate PG-07:** Browser shows full DS-007 results page with real calculation data. All 7 sections render. Entity expansion shows Narrative + Spine.

**Commit:** `OB-145 Phase 7: Browser verification — DS-007 renders with production data`

---

## PHASE 8: FONTS AND POLISH

### 8A: Font setup

If DM Sans and JetBrains Mono are not already available:

```bash
# Check current fonts
grep -rn "font\|Font\|google" web/src/app/layout.tsx

# If using next/font:
# Add DM_Sans and JetBrains_Mono imports
# If using CSS:
# Add @import to globals.css
```

### 8B: Visual polish

- Numbers use `font-variant-numeric: tabular-nums` everywhere
- Animated number on hero total (CSS counter or simple JS animation)
- Smooth expand/collapse on entity rows (CSS transition)
- Hover states on heatmap cells, table rows, action buttons
- Skeleton loading matches final layout proportions

### 8C: Responsive check

Page should be usable at:
- 1920px (full desktop) — normal layout
- 1280px (laptop) — heatmap may scroll horizontally
- 1024px (small laptop) — heatmap scrolls, table columns may compact

**Proof gate PG-08:** Fonts render correctly. Animations smooth. Responsive at 1280px.

**Commit:** `OB-145 Phase 8: Visual polish — fonts, animations, responsive`

---

## PHASE 9: COMPLETION REPORT + PR

### 9A: Final build

```bash
cd web && rm -rf .next && npm run build
echo "Final build exit code: $?"
```

### 9B: Completion report

Save as `OB-145_COMPLETION_REPORT.md` in **PROJECT ROOT**.

```markdown
# OB-145 COMPLETION REPORT
## DS-007 Results Page Implementation

### Engine Contract
[Paste Phase 0 + Phase 7 SQL output]

### Sections Implemented
| Section | Component | Status | Evidence |
|---------|-----------|--------|----------|
| Hero | ResultsHero.tsx | | Total payout: MX$[X] |
| Heatmap | StoreHeatmap.tsx | | [X] stores × 6 components |
| Health Strip | PopulationHealth.tsx | | Exceeds: [X] / On Track: [X] / Below: [X] |
| Entity Table | EntityTable.tsx | | [X] entities, sortable, filterable |
| Narrative+Spine | NarrativeSpine.tsx | | Expand shows AI summary + attainment tracks |
| Source Teaser | (in NarrativeSpine) | | Sheet names displayed |

### Data Loading
- Results loader: [X] Supabase calls via Promise.all()
- Component-level Supabase calls: 0 (Standing Rule 26)
- Network requests on page load: [X] (target: <50)

### Korean Test
- Hardcoded component names in render code: 0
- Hardcoded store names: 0
- All display text from database: YES/NO

### Browser Verification (Standing Rule 28)
- Total payout matches SQL: YES/NO
- All 6 components in hero bars: YES/NO
- Heatmap shows store × component: YES/NO
- Entity expansion shows Narrative + Spine: YES/NO
- Search filters correctly: YES/NO
- Sort works: YES/NO

### Proof Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-00 | | Diagnostic |
| PG-01 | | Results loader |
| PG-02 | | Hero section |
| PG-03 | | Store heatmap |
| PG-04 | | Entity table |
| PG-05 | | Narrative + Spine |
| PG-06 | | Full page wired |
| PG-07 | | Browser verification |
| PG-08 | | Visual polish |

### Files Created
[List all new files with paths]

### Files Modified
[List all modified files with what changed]
```

### 9C: PR

```bash
gh pr create --base main --head dev \
  --title "OB-145: DS-007 Results Page — Hero + Heatmap + Narrative+Spine" \
  --body "## Calculation Results Page

Replaces UUID-based flat display with Five Layers of Proof visualization.

### Sections
- Hero: Total payout MX$[X] with component breakdown bars
- Store × Component Heatmap: [X] stores × 6 components
- Population Health: Exceeds/OnTrack/Below distribution
- Entity Table: Sortable, filterable, searchable with mini-bars
- Narrative + Spine: AI summary + attainment tracks on entity expand

### Design Decisions
- DS-007 v3: Narrative + Spine (locked)
- DS-007 v4: Store × Component heatmap (locked)
- Standing Rule 26: Zero component-level Supabase calls
- Standing Rule 27: Engine Contract verified
- Standing Rule 28: Browser verified

### Korean Test: PASS — zero hardcoded names"
```

**Proof gate PG-09:** PR created. Completion report committed. Build exits 0.

**Commit:** `OB-145 Phase 9: Completion report + PR`

---

## CC ANTI-PATTERNS — SPECIFIC TO THIS OB

| Anti-Pattern | What CC Has Done Before | What To Do Instead |
|---|---|---|
| Hardcode component names | `{name === "Venta Óptica" && ...}` | Read name from `componentDefinitions[i].name` |
| Fetch data in every component | `const { data } = await supabase.from(...)` in component | Page loader fetches once, passes via props |
| Skip the heatmap | "Heatmap is complex, I'll add it later" | Phase 3 is mandatory. The heatmap is the population insight layer. |
| Build charting library integration | `import { BarChart } from 'recharts'` for the heatmap | Pure CSS/HTML grid with background-color intensity. No charting lib needed for the heatmap. |
| Show UUIDs | `{entity.id}` in the table | Show `entity.externalId` and `entity.displayName` |
| Create a separate results route without checking | New `/operate/results/page.tsx` | Phase 0D determines whether to modify existing page or create new route |
| Ignore OperateContext | Fetch tenant/period/plan independently | Read from OperateContext. That's what it's for. |
| Report PASS without browser screenshot | "Page renders with data" | Phase 7 requires navigating to the page and verifying each section |

---

## WHAT SUCCESS LOOKS LIKE

After this OB, you open localhost:3000, navigate to Operate → Results for Enero 2024, and see:

1. **MX$[total]** in large animated text with component breakdown bars
2. **A heatmap** showing which stores are strong on which components — immediately revealing patterns
3. **741 entities** in a sortable table with real names, external IDs, and store assignments
4. **Click any entity** → Narrative sentence explains their payout + Spine shows attainment on each component with gate markers
5. **Zero UUIDs visible anywhere**
6. **< 50 network requests**

This is the page you show in the demo. This is where the value proposition becomes visible.

---

*"The number proves the engine works. The page proves the platform works. The explanation proves trust is possible."*
