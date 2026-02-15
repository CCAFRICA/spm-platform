# OB-44: UI TRANSFORMATION -- THE FULL VISION
## February 15, 2026
## AUTONOMY DIRECTIVE: NEVER ask yes/no. NEVER say "shall I". JUST ACT. Execute all phases without stopping.

After every commit: `pkill -f "next dev" 2>/dev/null; rm -rf .next; npm run build; npm run dev`
Git commits: ASCII only. Always commit + push after each phase.

---

## BRANCH PROTOCOL

- All work happens on `dev`. NEVER push to `main`.
- First action: `git branch` -- if not on dev, run `git checkout dev && git pull origin dev`
- After final commit: `git push origin dev`
- Production deployment happens when Andrew merges dev -> main via GitHub PR

---

## STANDING PRINCIPLES

Read any `/CLEARCOMP_STANDING_PRINCIPLES.md` or `/VIALUCE_STANDING_PRINCIPLES.md` if present. All principles are non-negotiable.

## CC OPERATIONAL RULES (non-negotiable)

1. Always commit + push to `dev` after changes
2. After every commit: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`
3. VL Admin always sees English regardless of tenant locale
4. Git commit messages: ASCII only
5. Never provide CC with answer values -- fix logic not data
6. Completion reports saved to PROJECT ROOT (same level as package.json)
7. Proof gate criteria are IMMUTABLE -- do not rewrite, reinterpret, or substitute
8. OB closing: kill dev, rm -rf .next, build, dev, confirm localhost:3000, write report
9. NEVER ask yes/no. NEVER say "shall I". Just act.
10. Rule 29: This prompt file committed to git before work begins.

## ANTI-PATTERN RULES (11-18)

11. NO PLACEHOLDERS -- real logic or throw error
12. CONTRACT-FIRST -- `cat` consumer code before building producer
13. TRACE BEFORE FIX
14. READ CODE FIRST
15. DATA SHAPE AWARENESS
16. NO SILENT FALLBACKS
17. STATE-AWARE
18. NO PROOF GATE REWRITING

## DESIGN PRINCIPLES

- AI-first, never hardcoded. Korean Test: would this work in Hangul?
- Domain-agnostic ALWAYS. No ICM-specific labels in shared components.
- Fix logic, not data.
- Carry Everything, Express Contextually.
- Calculation Sovereignty.
- Prove, Don't Describe.
- Thermostat, Not Thermometer.

---

## WHAT THIS OB DELIVERS

This is the most important UI batch in ViaLuce history. The Supabase migration (OB-43A) proved the engine. This OB builds the body that matches the engine. Four deliverables, in priority order:

1. **Organizational Canvas** -- The spatial visualization of the entity relationship graph (D8 from Entity Model Design)
2. **Domain-Agnostic Labels** -- Kill every ICM-biased term in the UI
3. **7-State Lifecycle Buttons** -- The full lifecycle state machine with UI surface
4. **Tenant Picker + VL Admin Landing** -- Multi-tenant administration

When this OB is complete, the platform visually expresses the architectural innovation that has been built underneath.

---

## PHASE 0: RECONNAISSANCE (Read only -- no changes)

Before writing any code, understand exactly what exists.

```bash
echo "============================================"
echo "PHASE 0: RECONNAISSANCE"
echo "============================================"

echo ""
echo "=== 0A: CURRENT PAGE STRUCTURE ==="
find src/app -name "page.tsx" | sort

echo ""
echo "=== 0B: ENTITY/RELATIONSHIP TABLES IN SUPABASE ==="
grep -rn "entities\|entity_relationships\|reassignment_events" src/lib/supabase/ --include="*.ts" | head -30

echo ""
echo "=== 0C: CURRENT CONFIGURE WORKSPACE PAGES ==="
find src/app/configure -name "page.tsx" | sort
cat src/app/configure/page.tsx | head -40

echo ""
echo "=== 0D: CURRENT PERSONNEL PAGE ==="
cat src/app/configure/personnel/page.tsx | head -60

echo ""
echo "=== 0E: ENTITY SERVICE ==="
cat src/lib/supabase/entity-service.ts 2>/dev/null | head -80
cat src/lib/entities/entity-service.ts 2>/dev/null | head -80

echo ""
echo "=== 0F: TENANT SETTINGS (hierarchy_labels, entity_type_labels) ==="
grep -rn "hierarchy_labels\|entity_type_labels\|settings" src/lib/supabase/ --include="*.ts" | head -20

echo ""
echo "=== 0G: ICM-BIASED TERMS AUDIT ==="
grep -rn "Employee\|employee\|Compensation\|compensation\|Sales\|sales\|Commission\|commission\|Rep\|Payout\|payout" src/app/ --include="*.tsx" -l | sort

echo ""
echo "=== 0H: LIFECYCLE SERVICE CURRENT STATE ==="
cat src/lib/calculation/calculation-lifecycle-service.ts 2>/dev/null | head -100
grep -rn "lifecycle\|DRAFT\|PREVIEW\|OFFICIAL\|APPROVED\|PENDING" src/lib/ --include="*.ts" -l | sort

echo ""
echo "=== 0I: WORKSPACE CONFIG ==="
cat src/lib/navigation/workspace-config.ts 2>/dev/null | head -80

echo ""
echo "=== 0J: AUTH CONTEXT -- CURRENT USER/ROLE/TENANT ==="
cat src/contexts/auth-context.tsx | head -60

echo ""
echo "=== 0K: NAVIGATION CONTEXT ==="
cat src/contexts/navigation-context.tsx | head -60

echo ""
echo "=== 0L: TENANT CONTEXT ==="
cat src/contexts/tenant-context.tsx 2>/dev/null | head -60

echo ""
echo "=== 0M: SUPABASE TENANTS TABLE SEED DATA ==="
grep -rn "INSERT INTO tenants\|hierarchy_labels\|entity_type_labels" supabase/ --include="*.sql" | head -20

echo ""
echo "=== 0N: CURRENT GRAPH VISUALIZATION LIBRARIES ==="
grep -rn "d3\|three\|react-force-graph\|@xyflow\|reactflow\|vis-network\|sigma" package.json | head -10

echo ""
echo "=== RECON COMPLETE ==="
```

Document all findings before proceeding.

**Commit:** `OB-44 Phase 0: Reconnaissance -- document current UI state`

---

## PART 1: THE ORGANIZATIONAL CANVAS (Phases 1-5)

The canvas is the highest-priority deliverable. It is a zoomable, interactive spatial surface that renders the entity relationship graph. Source of truth: ViaLuce_Entity_Model_Design.docx, Decision D8.

### PHASE 1: CANVAS INFRASTRUCTURE

**1A: Install graph visualization library**

```bash
cd web
npm install @xyflow/react
```

Use React Flow (formerly reactflow) -- it provides:
- Canvas with pan/zoom
- Custom nodes
- Custom edges
- Layout engine hooks
- Drag-and-drop support
- Performance at scale (handles 1000+ nodes)

If @xyflow/react is not available or has issues, use `reactflow` package instead.

**1B: Create canvas components directory**

```
src/
  components/
    canvas/
      OrganizationalCanvas.tsx     -- Main canvas container with React Flow
      CanvasToolbar.tsx             -- Zoom controls, lens toggles, search
      CanvasLegend.tsx              -- Relationship type legend, confidence scale
      nodes/
        LandscapeNode.tsx           -- Zoom Level 1: large unit nodes with population density
        UnitNode.tsx                -- Zoom Level 2: store/branch nodes with entity counts
        TeamNode.tsx                -- Zoom Level 3: entity tiles clustered by variant/performance
        EntityCardNode.tsx          -- Zoom Level 4: expanded entity detail panel
      edges/
        RelationshipEdge.tsx        -- Typed, styled edges (solid=confirmed, dashed=proposed)
        ConfidenceEdge.tsx          -- Edge with confidence score label
      panels/
        ImpactPreviewPanel.tsx      -- Slides in when drag-to-reassign initiated
        EntityDetailPanel.tsx       -- Right panel showing full entity details
        CpiVisualization.tsx        -- Shows how AI discovered relationships
      hooks/
        useCanvasData.ts            -- Fetches entities + relationships from Supabase
        useCanvasLayout.ts          -- Computes layout positions using graph algorithms
        useCanvasZoom.ts            -- Manages zoom level state and transitions
        useCanvasActions.ts         -- Drag-to-reassign, click-to-edit, draw-to-relate
  lib/
    canvas/
      graph-service.ts              -- Supabase queries for entity graph data
      layout-engine.ts              -- Force-directed and hierarchical layout algorithms
      zoom-engine.ts                -- Level-of-detail rendering based on zoom
```

**1C: Create graph-service.ts**

This service reads from the entities and entity_relationships tables in Supabase:

```typescript
// Functions needed:
// getEntityGraph(tenantId) -- returns all entities + relationships for tenant
// getEntityChildren(entityId) -- returns direct children in hierarchy
// getEntityRelationships(entityId) -- returns all relationships for one entity
// getEntityCard(entityId) -- returns full entity detail including outcomes, assignments
// searchEntities(tenantId, query) -- search entities by name, external_id, type
```

All queries must:
- Filter by tenant_id (RLS handles this, but explicit filter too)
- Filter by effective_end IS NULL for current relationships
- Include confidence scores and source (ai_inferred vs human_confirmed)
- Return entity_type for node rendering decisions

**1D: Create layout-engine.ts**

Two layout modes:
- **Hierarchical** (default): entities arranged by relationship depth, parent above children
- **Force-directed**: entities arranged by relationship proximity, clusters emerge naturally

The layout must handle:
- 10 entities (RetailCo MX seed data) -- immediate
- 200 entities (Casa Diaz scale) -- smooth
- 700+ entities (RetailCGMX scale) -- performant with virtualization
- 150,000 entities (enterprise scale) -- viewport culling, only render visible nodes

For 150K: implement viewport culling. Only render nodes that are within the visible viewport bounds plus a buffer. React Flow supports this natively.

**Commit:** `OB-44-1: Canvas infrastructure -- components, services, layout engine`

---

### PHASE 2: FOUR ZOOM LEVELS

The canvas renders differently based on zoom level. The zoom level is determined by the camera's zoom factor.

**Zoom Level 1 -- Landscape (furthest out)**

Sofia sees: Entire organization at a glance. Large nodes for top-level units (organizations, divisions, zones). Color intensity = population density. Status overlays show where attention is needed.

Implementation:
- LandscapeNode renders a large rounded rectangle with:
  - Unit name (from entity display_name)
  - Entity count badge
  - Population density as background opacity (more entities = more intense)
  - Status indicator: calculated lifecycle state for this unit's entities
- Edges between landscape nodes show containment relationships
- Clicking a landscape node zooms into it (Level 2)

**Zoom Level 2 -- Unit / Zone**

Sofia sees: Internal structure of a unit. Store/branch nodes with entity counts. Manager portraits/initials. Lines showing containment. Rule set assignment indicators.

Implementation:
- UnitNode renders a card with:
  - Location/team name
  - Entity count
  - Manager name and initials avatar
  - Rule set assignment badges
  - Performance summary (if outcomes exist)
- Edges show: contains, manages, works_at relationships
- Clicking a unit node zooms into it (Level 3)
- Drag a unit node to reassign it -> triggers ImpactPreviewPanel

**Zoom Level 3 -- Team / Store**

Sofia sees: Every entity in the team. Small portrait tiles clustered by variant or performance tier. Status indicators per entity.

Implementation:
- TeamNode renders a compact tile with:
  - Entity initials or first letter
  - Display name
  - Status dot (active=green, proposed=amber, suspended=gray)
  - Variant badge (if assigned)
  - Performance indicator (if outcomes exist)
- Tiles clustered by: entity_type, variant_key, or performance tier
- Drag entity tile to another cluster -> ImpactPreviewPanel
- Click entity tile -> EntityDetailPanel opens (Level 4)

**Zoom Level 4 -- Entity Card**

Sofia sees: Full entity detail in a side panel (not a node -- a panel that slides in from the right).

Implementation via EntityDetailPanel:
- Identity: display_name, external_id, entity_type, status
- Mini-graph: this entity's immediate relationships (rendered as a small React Flow instance)
- Attributes: temporal history (salary changes, role changes, variant changes)
- Rule set assignments: which rule sets, which variant, current period outcomes
- Timeline: key events (created, confirmed, reassigned, promoted)
- Actions: Edit attributes, Reassign (drag target), Invite to platform, View disputes, View forensic trace
- If entity has a profile_id: show user account status, last login, capabilities

**Zoom transitions**: Animate smoothly between levels. Use React Flow's `fitView()` and `setCenter()` for transitions. When zooming in past a threshold, replace LandscapeNodes with UnitNodes. This is level-of-detail rendering.

**Commit:** `OB-44-2: Four zoom levels with level-of-detail rendering`

---

### PHASE 3: SPATIAL ACTIONS

These are the interactions that make the canvas an organizational management tool, not just a visualization.

**3A: Drag-to-Reassign**

When a user drags an entity tile (Level 3) or unit node (Level 2) from one cluster to another:
1. The ImpactPreviewPanel slides in from the right
2. Panel shows:
   - Source: "Moving [entity name] from [current parent]"
   - Target: "to [new parent]"
   - Impact preview: "This will change reporting structure. Rule set assignments will be reviewed."
   - Credit model selector (if applicable): Full credit / Split credit / No credit
   - Effective date picker (defaults to today)
   - Confirm / Cancel buttons
3. On confirm:
   - Create new entity_relationship with new target
   - End-date old entity_relationship (set effective_end = effective_date)
   - Create reassignment_event record
   - Update canvas layout
   - Capture as audit_log entry

**3B: Click-to-Edit**

Clicking an attribute value on the Entity Card (Level 4) enables inline editing:
1. Value becomes editable input
2. "Effective date" prompt appears below (defaults to today)
3. On save:
   - Append to temporal attributes JSONB array
   - Record in audit_log
   - Training signal if AI-proposed value was corrected

**3C: Draw-to-Relate**

Drawing a line from one entity to another creates a new relationship:
1. Drag from entity edge/handle
2. Drop on target entity
3. Relationship type selector appears: contains, manages, works_at, assigned_to, member_of, participates_in, oversees, assists
4. Context qualifier (optional): LOB, domain, hierarchy name
5. Confidence set to 1.00 (human-created)
6. Source set to 'human_created'
7. Effective_start set to today
8. On confirm: create entity_relationship record

**3D: Confirm AI Proposal**

When relationships have source='ai_inferred' and confidence < 1.0:
- Edge renders as dashed line with confidence score label
- Checkmark icon on the edge
- Clicking checkmark: changes source to 'human_confirmed', confidence to 0.95+
- Captures as training signal (classification_signals table)

**3E: Correct AI Proposal**

When user drags an entity from the AI-proposed position to the correct position:
- Old AI-proposed relationship marked as incorrect (training signal: negative)
- New relationship created with source='human_created'
- Captures correction as training signal

**Commit:** `OB-44-3: Spatial actions -- reassign, edit, relate, confirm, correct`

---

### PHASE 4: ONBOARDING MODE AND CPI VISUALIZATION

**4A: Onboarding Mode (First Import)**

When a tenant has entities with status='proposed', the canvas enters onboarding/confirmation mode:

Visual differences:
- All proposed relationships render as dashed lines
- Confidence scores visible on every edge
- Banner at top: "AI has proposed this organizational structure based on your data. Review and confirm."
- "Confirm All" button (if all confidence scores > 0.8): one-click confirmation of entire structure
- "Confirm Selected" button: confirms only checked relationships
- Each relationship has: checkmark (confirm) and X (reject) icons

On confirmation:
- Entity status: 'proposed' -> 'active'
- Relationship source: 'ai_inferred' -> 'human_confirmed'
- Confidence adjusted based on action

**4B: CPI Visualization**

A collapsible panel showing HOW the AI discovered relationships:

For each AI-proposed relationship, show the evidence:
- Which proximity dimension triggered the inference
- The specific data values that matched
- The confidence score calculation breakdown

Six proximity dimensions (from Entity Model Design):
1. Shared Attribute -- entities share a field value (same branch, same location)
2. Transactional Co-occurrence -- entities appear in same transaction records
3. Sequential Reference -- one entity's output is another's input
4. Naming Convention -- entity IDs follow a pattern suggesting hierarchy
5. Structural Position -- entity appears in a "manager" column or header row
6. Cross-Sheet Reference -- entity ID in one sheet referenced in another

Display as cards within the CPI panel:
```
[Shared Attribute] Confidence: 0.92
Entity "Maria Rodriguez" and Entity "Sucursal Leon" share
location field value "LEON" in import batch IB-001.
```

**4C: Multi-LOB Lens Toggles**

For tenants with multiple rule sets per entity:
- Toolbar shows lens toggle buttons: [All] [Rule Set A] [Rule Set B] ...
- Labels come from rule_sets table (domain-agnostic names)
- Selecting a specific lens:
  - Filters canvas to show only entities assigned to that rule set
  - Shows only that rule set's outcomes on entity cards
  - Colors/groups entities by their variant within that rule set
- "All" shows total outcomes from entity_period_outcomes

**Commit:** `OB-44-4: Onboarding confirmation mode, CPI visualization, LOB lens`

---

### PHASE 5: CANVAS ROUTING AND INTEGRATION

**5A: Wire canvas into Configure workspace**

The Organizational Canvas replaces three sub-pages in Configure:
- `/configure/personnel` -> Canvas at zoom level 3, filtered for entity_type='individual'
- `/configure/team-management` -> Canvas at zoom level 2-3, showing reporting structures
- `/configure/location-management` -> Canvas filtered for entity_type='location'

All three are the SAME canvas component with different initial filters and zoom levels. One data model, three views.

The existing Personnel page (entity list/table) becomes an alternative view mode. Add a toggle:
[Canvas View] [Table View]

Canvas is default. Table is the fallback for users who prefer traditional data grid.

**5B: Canvas search**

Search box in CanvasToolbar:
- Searches entities by display_name, external_id
- Results appear as dropdown
- Selecting a result: canvas pans and zooms to that entity, opens EntityDetailPanel

**5C: Canvas in other workspaces**

The canvas is primarily in Configure but is referenced from:
- Perform: clicking an entity name in results opens a mini-canvas showing that entity's position
- Investigate: Employee Trace links back to canvas position
- Operate: Import confirmation shows canvas in onboarding mode for new entities

For this phase, only build the Configure workspace integration. Cross-workspace references are future work.

**5D: Responsive behavior**

- Desktop (>1200px): Canvas fills main content area. EntityDetailPanel is a right sidebar.
- Tablet (768-1200px): Canvas fills viewport. EntityDetailPanel is a bottom sheet.
- Mobile (<768px): Canvas is replaced by a hierarchical tree list (canvas interactions not supported on touch). Entity cards are full-width.

**PROOF GATE PART 1 -- ORGANIZATIONAL CANVAS:**

| # | Gate | Criteria |
|---|------|----------|
| PG-1 | Canvas renders | Navigate to /configure/team-management. Canvas loads with entities from Supabase entities table. Nodes visible. |
| PG-2 | Zoom levels work | Zoom out: landscape nodes appear. Zoom in: entity tiles appear. Smooth transitions between levels. |
| PG-3 | Entity card opens | Click any entity tile. EntityDetailPanel slides in showing display_name, external_id, entity_type, status, relationships. |
| PG-4 | Relationships visible | Edges connect entities based on entity_relationships table. Solid lines for confirmed, dashed for proposed. |
| PG-5 | Search works | Type an entity name in canvas search. Result found. Clicking result pans to that entity. |
| PG-6 | Canvas/Table toggle | Toggle between Canvas View and Table View on Personnel page. Both show same entity data. |
| PG-7 | Build passes | `rm -rf .next && npm run build` completes with zero errors. |

**Commit:** `OB-44-5: Canvas routing, search, responsive, Configure integration`

---

## PART 2: DOMAIN-AGNOSTIC LABELS (Phases 6-7)

Every user-visible string in the platform must be domain-agnostic. "Employee" -> "Entity" (or tenant-configured label). "Compensation" -> "Outcome". "Sales" -> removed. "Commission" -> removed. "Payout" -> "Outcome value" or tenant-configured.

### PHASE 6: LABEL ARCHITECTURE

**6A: Create label service**

```typescript
// src/lib/labels/label-service.ts
// Reads from tenant settings JSONB: hierarchy_labels and entity_type_labels
// Provides functions:
// getEntityTypeLabel(type: string, tenantId: string) -> string
//   'individual' -> tenant might call this 'Employee', 'Server', 'Agent', 'Representative'
//   'location' -> tenant might call this 'Store', 'Restaurant', 'Branch', 'Office'
//   'team' -> tenant might call this 'Team', 'Zone', 'Region', 'Division'
//   'organization' -> tenant might call this 'Company', 'Franchise', 'Business Unit'
// getHierarchyLabel(level: number, tenantId: string) -> string
//   Level 0 -> 'Organization', Level 1 -> 'Region', Level 2 -> 'Store', etc.
// getOutcomeLabel(tenantId: string) -> string
//   ICM tenant: 'Commission', FRMX tenant: 'Performance Index', generic: 'Outcome'
// getDomainLabel(key: string, tenantId: string) -> string
//   Generic lookup from tenant settings JSONB
```

**6B: Ensure tenant settings include label configuration**

The tenants table settings JSONB must include:
```json
{
  "hierarchy_labels": {
    "0": "Organization",
    "1": "Region",
    "2": "Store",
    "3": "Team"
  },
  "entity_type_labels": {
    "individual": "Employee",
    "location": "Store",
    "team": "Team",
    "organization": "Company"
  },
  "outcome_label": "Commission",
  "domain_labels": {
    "rule_set": "Compensation Plan",
    "outcome_value": "Payout",
    "attainment": "Quota Attainment",
    "period": "Pay Period"
  }
}
```

Update Supabase seed data for RetailCo MX tenant to include these settings.

**Commit:** `OB-44-6: Label service architecture and tenant settings`

---

### PHASE 7: LABEL SWEEP

**7A: Audit and replace every ICM-biased term**

Search the entire `src/app/` directory for these terms and replace with label service calls or generic terms:

| ICM Term | Replace With | Notes |
|----------|-------------|-------|
| Employee | Entity (or label service call) | In page titles, table headers, breadcrumbs |
| Employees | Entities | Plural form |
| Sales | (remove or make generic) | "Sales Performance" -> "Performance" |
| Sales Rep | (label service for individual type) | Tenant-configured |
| Commission | Outcome (or label service) | "Commission" only if tenant's outcome_label says so |
| Compensation | Outcome / Rule Set | "Compensation Plan" -> use domain_labels.rule_set |
| Payout | Outcome value (or label service) | "Total Payout" -> tenant-configured |
| Quota | Target / Goal | More domain-agnostic |
| Attainment | Achievement / Progress | Or label service |
| Rep | (entity type label) | Never hardcode "Rep" |
| YTD Compensation | YTD Outcomes | Or label service |

**7B: Page titles and workspace labels**

- "Sales Performance" in any dashboard title -> "Performance"
- "Compensation Plans" -> "Rule Sets" (or label service for domain_labels.rule_set)
- "Employee Breakdown" -> "Entity Results" or label service
- "Team Payout" -> "Team Outcomes"
- "Employees: 10" -> "{entity_type_label}: 10"

**7C: Breadcrumbs and navigation**

- Breadcrumbs should use label service for entity types
- Navigation sub-items should use generic or tenant-configured labels
- "Personnel" label is acceptable (generic enough) but can also use label service

**7D: Korean Test validation**

After the sweep, mentally verify: if a Korean tenant configured their labels in Hangul, would every user-visible string render correctly? No English-only hardcoded terms should remain in UI components that display to end users. (Internal code comments and variable names remain English -- this is about user-facing strings only.)

**PROOF GATE PART 2 -- DOMAIN-AGNOSTIC LABELS:**

| # | Gate | Criteria |
|---|------|----------|
| PG-8 | No hardcoded "Employee" | `grep -rn '"Employee"' src/app/ --include="*.tsx"` returns zero results in user-visible strings (variable names OK) |
| PG-9 | No hardcoded "Sales" | `grep -rn '"Sales"' src/app/ --include="*.tsx"` returns zero results in user-visible labels |
| PG-10 | No hardcoded "Commission" | `grep -rn '"Commission"' src/app/ --include="*.tsx"` returns zero results in user-visible labels |
| PG-11 | Label service used | At least 5 pages import and use the label service for entity type labels |
| PG-12 | Build passes | `rm -rf .next && npm run build` completes with zero errors |

**Commit:** `OB-44-7: Domain-agnostic label sweep -- kill ICM bias`

---

## PART 3: 7-STATE LIFECYCLE BUTTONS (Phases 8-9)

The lifecycle state machine exists in the calculation engine but has ZERO UI surface for most transitions. This part builds the full lifecycle UI.

### PHASE 8: LIFECYCLE STATE MACHINE COMPLETION

**8A: Define the complete transition matrix**

States (corrected from BACKLOG_UPDATE_20260214.md):
```
DRAFT -> PREVIEW -> OFFICIAL -> PENDING_APPROVAL -> APPROVED -> POSTED -> CLOSED -> PAID -> PUBLISHED
                                                                                          |
                                                     SUPERSEDED <-- (re-run from OFFICIAL)
                                                     REJECTED <-- (reject from PENDING_APPROVAL -> back to OFFICIAL)
```

**8B: Update lifecycle service**

The lifecycle service must:
- Define ALL valid transitions
- Define required capabilities for each transition
- Enforce prohibited transitions (OFFICIAL -> PREVIEW, APPROVED -> DRAFT, etc.)
- Record every transition in audit_logs with user, timestamp, reason
- Support the "different user for approval" rule (submitter cannot be approver)

**8C: Lifecycle actions that create side effects**

| Transition | Side Effect |
|-----------|-------------|
| PREVIEW -> OFFICIAL | Lock calculation results (immutable from this point) |
| OFFICIAL -> PENDING_APPROVAL | Create approval request in queue |
| PENDING_APPROVAL -> APPROVED | Record approver, clear from queue |
| PENDING_APPROVAL -> REJECTED | Record rejection reason, return to OFFICIAL |
| APPROVED -> POSTED | Make results visible to all roles in Perform |
| POSTED -> CLOSED | Prevent further changes to this period's data |
| CLOSED -> PAID | Record payment reference, date |
| PAID -> PUBLISHED | Terminal state. Full audit trail sealed. |
| OFFICIAL -> SUPERSEDED | When re-running: create new batch, old batch marked SUPERSEDED |

**Commit:** `OB-44-8: Complete lifecycle state machine with transition matrix and side effects`

---

### PHASE 9: LIFECYCLE UI SURFACE

**9A: Lifecycle Subway (enhanced)**

The lifecycle subway visualization already exists (CLT-39 confirmed it renders). Enhance it:
- Each state node is a clickable button (not just a visual indicator)
- Current state is highlighted
- Next valid action is pulsing/glowing (call to action)
- Completed states show checkmark
- Each state shows timestamp of when it was reached
- Hovering a state shows: who performed the action, when, any notes

**9B: Action Bar**

Below the lifecycle subway, render an action bar with ONLY the valid actions for the current state:

| Current State | Action Bar Shows |
|--------------|-----------------|
| DRAFT | [Run Preview Calculation] |
| PREVIEW | [Run Preview Again] [Run Official Calculation] |
| OFFICIAL | [Submit for Approval] [Re-Run (creates new batch)] |
| PENDING_APPROVAL (submitter view) | "Awaiting approval by [approver]" (no buttons) |
| PENDING_APPROVAL (approver view) | [Approve] [Reject (requires reason)] |
| APPROVED | [Post Results] [Export] |
| POSTED | [Close Period] [Export] |
| CLOSED | [Mark as Paid] [Export] |
| PAID | [Publish] [Export] |
| PUBLISHED | "Period complete. [View Audit Trail]" |

**9C: Approval workflow**

When transitioning to PENDING_APPROVAL:
1. Write approval request to a queue (could be calculation_batches metadata or a separate queue)
2. The Queue panel in Mission Control Rail shows "1 Approval Pending" for users with approve_outcomes capability
3. Clicking the queue item navigates to the calculation page with the approval action bar
4. Approval requires the approver to be a DIFFERENT user than the submitter (enforce in lifecycle service)

**9D: Post gates Perform visibility**

When transitioning to POSTED:
1. Perform workspace for entities (sales reps, servers, agents) shows their outcomes
2. Before POSTED: Perform shows "Your results for [period] are being processed"
3. After POSTED: Perform shows per-component breakdown, total outcome, period

**9E: Export Payroll**

The Export button (available APPROVED or later):
- Downloads CSV with columns: Entity External ID, Entity Name, Period, Total Outcome, [one column per rule set component]
- Column names from rule set components (domain-agnostic)
- Currency formatted for tenant locale
- File name: `{TenantName}_{Period}_Results.csv`

**PROOF GATE PART 3 -- LIFECYCLE BUTTONS:**

| # | Gate | Criteria |
|---|------|----------|
| PG-13 | Full state machine | Lifecycle service defines transitions for ALL states: DRAFT through PUBLISHED plus SUPERSEDED and REJECTED |
| PG-14 | Action bar renders | On calculation page, action bar shows correct buttons for current lifecycle state |
| PG-15 | State advances | Clicking action buttons advances lifecycle state. Subway updates. |
| PG-16 | Audit trail | Every state transition creates an audit_log entry with user, timestamp, and action |
| PG-17 | Build passes | `rm -rf .next && npm run build` completes with zero errors |

**Commit:** `OB-44-9: Lifecycle UI surface -- subway, action bar, approval workflow`

---

## PART 4: TENANT PICKER AND VL ADMIN LANDING (Phases 10-11)

### PHASE 10: TENANT PICKER

**10A: Tenant selection page**

Create `/select-tenant/page.tsx`:

When a VL Platform Admin logs in (scope_level = 'platform'), they land on this page instead of going directly into a tenant.

The page shows:
- ViaLuce branding (not tenant branding)
- "Select Organization" heading
- Grid of tenant cards, one per tenant in the tenants table
- Each card shows:
  - Tenant name (from tenants.name)
  - Domain/industry indicator (from tenants.settings.domain or module type)
  - Entity count
  - Active period
  - Current lifecycle state
  - Last activity timestamp
- Clicking a card enters that tenant's context (sets currentTenant in context)

For non-platform users (scope_level = 'tenant' or lower):
- Skip this page entirely
- Go directly to their tenant's dashboard

**10B: Cross-tenant navigation**

Once inside a tenant, the VL Admin needs a way to return to tenant selection:
- In the Mission Control Rail, the tenant name/logo area becomes clickable for platform-scope users
- Clicking it returns to /select-tenant
- This replaces the old "Return to Admin" button that didn't work

**10C: Tenant switcher in rail**

Alternatively, a dropdown in the tenant identity area of the rail:
- Shows current tenant name
- Dropdown lists all tenants (for platform-scope users only)
- Selecting a different tenant switches context without full page navigation

**Commit:** `OB-44-10: Tenant picker and VL Admin landing`

---

### PHASE 11: WAYFINDER FOUNDATION AND COMPLETION

**11A: Workspace ambient identity**

Implement the Wayfinder Layer 1 foundation. Each workspace gets a subtle ambient difference:

| Workspace | Ambient Character | Implementation |
|-----------|------------------|----------------|
| Operate | Control room: structured, sequential | Slightly cooler background tint, process-oriented layout |
| Perform | Motivational: warm, encouraging | Slightly warmer background tint, progress-focused elements |
| Investigate | Forensic lab: precise, evidence-based | Higher density, cooler tones, monospace data displays |
| Design | Creative: open, sandbox-like | More whitespace, configuration-focused layout |
| Configure | Organizational: spatial, structural | Canvas-first, relationship-focused |
| Govern | Compliance: formal, audit-oriented | Structured tables, timestamp-heavy, formal typography |

Implementation approach:
- CSS custom properties per workspace (set on workspace layout wrapper)
- `--workspace-accent`, `--workspace-bg-tint`, `--workspace-density`
- Subtle enough to feel, not dramatic enough to jar
- Transition animation when switching workspaces (200ms fade)

**11B: State communication vocabulary**

Define shared CSS classes for the Wayfinder Layer 2 state vocabulary:

```css
/* Confidence/match states -- NEVER use stoplight red/yellow/green */
.state-confirmed { opacity: 1.0; }
.state-proposed { opacity: 0.7; border-style: dashed; }
.state-attention { /* subtle attention-drawing treatment */ }
.state-neutral { opacity: 0.5; }

/* Completeness pattern */
.completeness-bar { /* progress bar filling toward target */ }

/* AI confidence */
.confidence-high { /* solid fill */ }
.confidence-medium { /* partial fill */ }
.confidence-low { /* outline only, dashed */ }
```

**11C: Final integration verification**

Walk through the entire platform:
1. Login as VL Platform Admin -> tenant picker appears
2. Select RetailCo MX tenant -> dashboard loads
3. Navigate to Configure -> Team Management -> canvas loads with entities
4. Zoom in/out -> levels transition
5. Click entity -> detail panel opens
6. Navigate to Operate -> Calculate -> lifecycle action bar visible
7. Check workspace ambient transitions (subtle tint change between workspaces)
8. Verify no "Employee", "Sales", "Commission" in user-visible labels
9. Verify breadcrumbs use label service

**PROOF GATE PART 4 -- TENANT PICKER AND WAYFINDER:**

| # | Gate | Criteria |
|---|------|----------|
| PG-18 | Tenant picker renders | Login as platform admin. /select-tenant page shows tenant cards. |
| PG-19 | Tenant selection works | Click a tenant card. Platform context switches to that tenant. |
| PG-20 | Return to picker | Inside a tenant, click tenant name in rail. Returns to /select-tenant. |
| PG-21 | Workspace ambience | Navigate between Operate and Perform. Subtle visual difference perceivable. |
| PG-22 | Build passes | `rm -rf .next && npm run build` completes with zero errors |

**Commit:** `OB-44-11: Wayfinder foundation, tenant picker integration, final verification`

---

## PHASE 12: COMPLETION REPORT AND CLOSING

**12A: Kill dev server, clean build**

```bash
pkill -f "next dev" 2>/dev/null
rm -rf .next
npm run build
npm run dev
```

Confirm localhost:3000 responds.

**12B: Create completion report**

Create `OB-44_COMPLETION_REPORT.md` in PROJECT ROOT (same level as package.json):

```markdown
# OB-44 Completion Report: UI Transformation -- The Full Vision
## Date: [timestamp]
## Branch: dev

### Commits
[List every commit hash and message from this OB]

### Files Created
[List all new files]

### Files Modified
[List all modified files]

### Part 1: Organizational Canvas
[PG-1 through PG-7 with PASS/FAIL and evidence]

### Part 2: Domain-Agnostic Labels
[PG-8 through PG-12 with PASS/FAIL and evidence]

### Part 3: Lifecycle Buttons
[PG-13 through PG-17 with PASS/FAIL and evidence]

### Part 4: Tenant Picker and Wayfinder
[PG-18 through PG-22 with PASS/FAIL and evidence]

### Known Issues
[Any issues encountered]

### Recommendations
[Follow-up items for next OB]
```

**12C: Commit report**

```bash
git add OB-44_COMPLETION_REPORT.md
git commit -m "OB-44: Completion report -- UI Transformation"
git push origin dev
```

**Commit:** `OB-44-12: Completion report and closing`

---

## HARD GATES SUMMARY

| # | Part | Gate | Pass Criteria |
|---|------|------|---------------|
| PG-1 | Canvas | Renders | Canvas loads with Supabase entities |
| PG-2 | Canvas | Zoom | Four levels with smooth transitions |
| PG-3 | Canvas | Entity card | Click entity -> detail panel |
| PG-4 | Canvas | Relationships | Edges from entity_relationships, solid/dashed |
| PG-5 | Canvas | Search | Find entity by name, pan to it |
| PG-6 | Canvas | View toggle | Canvas/Table toggle on Personnel |
| PG-7 | Canvas | Build | Zero errors |
| PG-8 | Labels | No "Employee" | Zero user-visible hardcoded instances |
| PG-9 | Labels | No "Sales" | Zero user-visible hardcoded instances |
| PG-10 | Labels | No "Commission" | Zero user-visible hardcoded instances |
| PG-11 | Labels | Service used | 5+ pages use label service |
| PG-12 | Labels | Build | Zero errors |
| PG-13 | Lifecycle | State machine | All states defined with transitions |
| PG-14 | Lifecycle | Action bar | Correct buttons per state |
| PG-15 | Lifecycle | Advances | Clicking buttons changes state |
| PG-16 | Lifecycle | Audit | Every transition logged |
| PG-17 | Lifecycle | Build | Zero errors |
| PG-18 | Tenant | Picker renders | Platform admin sees tenant cards |
| PG-19 | Tenant | Selection works | Click card -> enters tenant |
| PG-20 | Tenant | Return | Click tenant name -> back to picker |
| PG-21 | Wayfinder | Ambience | Visual difference between workspaces |
| PG-22 | Wayfinder | Build | Zero errors |

---

## WAYFINDER COMPLIANCE

**Layer 1 (Wayfinding):** This OB establishes the ambient identity foundation for all 6 workspaces. The Configure workspace gets the Organizational Canvas as its defining spatial experience. Each workspace gets CSS custom properties for ambient identity.

**Layer 2 (State Communication):** Entity status (proposed/active/suspended) uses opacity/dashed patterns. AI confidence uses completeness patterns. Lifecycle state uses the subway with completion indicators. NEVER stoplight red/yellow/green.

**Layer 3 (Interaction Patterns):** Core patterns: search, navigation, table sorting remain unchanged. Module extensions: drag-to-reassign (Configure-specific), lifecycle action bar (Operate-specific), canvas zoom (Configure-specific). Universal landmarks: Mission Control Rail, Command Palette unchanged.

---

## KEY FILES REFERENCE

| Component | File |
|-----------|------|
| Canvas Container | `src/components/canvas/OrganizationalCanvas.tsx` |
| Landscape Node | `src/components/canvas/nodes/LandscapeNode.tsx` |
| Unit Node | `src/components/canvas/nodes/UnitNode.tsx` |
| Team Node | `src/components/canvas/nodes/TeamNode.tsx` |
| Entity Card Panel | `src/components/canvas/panels/EntityDetailPanel.tsx` |
| Impact Preview | `src/components/canvas/panels/ImpactPreviewPanel.tsx` |
| CPI Visualization | `src/components/canvas/panels/CpiVisualization.tsx` |
| Graph Service | `src/lib/canvas/graph-service.ts` |
| Layout Engine | `src/lib/canvas/layout-engine.ts` |
| Label Service | `src/lib/labels/label-service.ts` |
| Lifecycle Service | `src/lib/calculation/calculation-lifecycle-service.ts` |
| Tenant Picker | `src/app/select-tenant/page.tsx` |
| Entity Service | `src/lib/supabase/entity-service.ts` |

---

## WHAT IS EXPLICITLY OUT OF SCOPE

| Item | Why |
|------|-----|
| Cross-workspace canvas links | Future OB -- canvas references from Perform, Investigate |
| Geographic map view for locations | Requires map API -- separate OB |
| CPI engine (computing inferences) | This OB displays CPI evidence. Computing new inferences is AI pipeline work. |
| Calculation engine changes | This is pure UI. Calculation logic unchanged. |
| Demo tenant seed data beyond RetailCo MX | Separate demo file creation track |
| Mobile touch gestures on canvas | Responsive fallback to tree list is sufficient for now |

---

## ESTIMATED EFFORT

| Phase | Estimated Hours |
|-------|----------------|
| 0: Reconnaissance | 0.5 |
| 1: Canvas infrastructure | 3 |
| 2: Four zoom levels | 5 |
| 3: Spatial actions | 4 |
| 4: Onboarding + CPI | 3 |
| 5: Canvas routing + integration | 2 |
| 6: Label architecture | 1.5 |
| 7: Label sweep | 2 |
| 8: Lifecycle state machine | 2 |
| 9: Lifecycle UI surface | 3 |
| 10: Tenant picker | 2 |
| 11: Wayfinder + integration | 2 |
| 12: Completion | 1 |
| **Total** | **31 hours** |

If this exceeds a single CC session, the natural split point is after Part 2 (Phase 7).
- **OB-44A:** Parts 1-2 (Canvas + Labels) -- the visual transformation
- **OB-44B:** Parts 3-4 (Lifecycle + Tenant Picker) -- the operational transformation

---

*ViaLuce.ai -- The Way of Light*
*OB-44: UI Transformation -- The Full Vision*
*February 2026*
*"The engine is proven. Now the body matches."*
