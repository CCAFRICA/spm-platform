# OB-54: ORGANIZATIONAL CANVAS PHASE 2 — INTERACTIVE SPATIAL MANAGEMENT

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS OB EXISTS

OB-52 Phase 6 verified that the Organizational Canvas Phase 1 is built and working: React Flow v12.10.0 installed, custom nodes (LandscapeNode, UnitNode, TeamNode), custom edges (RelationshipEdge), graph-service reading from Supabase `entities` + `entity_relationships` tables, routed at `/configure/teams`, `/configure/locations`, `/configure/people`.

Phase 1 is read-only. Users can see the organizational graph but cannot interact with it. This OB delivers Phase 2: the canvas becomes an organizational management tool. Drag entities to reassign them. Click entities to see full detail. Search to find entities in large graphs. Create new relationships visually. Every mutation writes back to Supabase.

**Source of truth:** ViaLuce_Entity_Model_Design.docx, Decision D8. OB-44 Phases 2-5 (never executed — this OB delivers them).

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.
6. Commit this prompt to git as first action.
7. Inline styles as primary visual strategy for any property that must not be overridden.
8. VL Admin: all users select preferred language. No forced English override.
9. Rule 25: Completion report is FIRST deliverable, not last. Create before final build, append results.
10. Domain-agnostic always. Canvas labels come from entity data, never hardcoded to ICM vocabulary.

## CC ANTI-PATTERNS TO AVOID

| Anti-Pattern | Prevention |
|---|---|
| **Placeholder panels** | Every panel renders real data from Supabase. No "Coming Soon" cards. |
| **Hardcoded entity names** | All labels from `entity.display_name`. Zero hardcoded "Store León" or "Carlos García". |
| **Mutations without persistence** | Every drag-to-reassign, relationship creation, or edit MUST write to Supabase before confirming to user. |
| **Breaking existing canvas** | Phase 0 verifies current canvas works. Do not break read-only rendering while adding interactivity. |

---

## PHASE 0: DIAGNOSTIC — CURRENT CANVAS STATE

Before adding anything, verify what exists and works.

```bash
echo "============================================"
echo "OB-54 PHASE 0: CANVAS DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: CANVAS COMPONENTS ==="
find web/src/components/canvas -name "*.tsx" | sort
for f in $(find web/src/components/canvas -name "*.tsx" | sort); do
  echo "--- $f: $(wc -l < "$f") lines ---"
  head -5 "$f"
done

echo ""
echo "=== 0B: GRAPH SERVICE ==="
find web/src/lib/canvas -name "*.ts" | sort
cat web/src/lib/canvas/graph-service.ts 2>/dev/null | head -40

echo ""
echo "=== 0C: CANVAS ROUTES ==="
find web/src/app -path "*configure*" -name "page.tsx" | sort
find web/src/app -path "*canvas*" -name "page.tsx" | sort

echo ""
echo "=== 0D: REACT FLOW VERSION ==="
grep "xyflow\|reactflow" web/package.json

echo ""
echo "=== 0E: ENTITY + RELATIONSHIP TABLES ==="
grep -rn "entities\|entity_relationships" web/src/lib/canvas/ --include="*.ts" | head -20

echo ""
echo "=== 0F: CURRENT NODE TYPES ==="
grep -rn "nodeTypes\|nodeType" web/src/components/canvas/ --include="*.tsx" | head -10

echo ""
echo "=== 0G: CURRENT CANVAS IMPORT PATTERN ==="
grep -rn "import.*ReactFlow\|import.*useNodesState\|import.*useEdgesState\|import.*useReactFlow" web/src/components/canvas/ --include="*.tsx" | head -10

echo ""
echo "============================================"
echo "PASTE FULL OUTPUT INTO COMPLETION REPORT"
echo "============================================"
```

**Commit:** `OB-54 Phase 0: Canvas diagnostic — verify Phase 1 state`

---

## PHASE 1: LEVEL-OF-DETAIL ZOOM RENDERING

The canvas currently renders all nodes at the same size regardless of zoom. This phase adds zoom-aware rendering: different node presentations at different zoom levels.

### 1A: Implement zoom-level detection

In the OrganizationalCanvas component, track the current zoom level from React Flow's viewport:

```typescript
import { useReactFlow, useViewport } from '@xyflow/react';

// Zoom thresholds
const ZOOM_LANDSCAPE = 0.4;  // Below this = landscape mode
const ZOOM_UNIT = 0.7;       // Below this = unit mode
const ZOOM_TEAM = 1.2;       // Below this = team mode
                              // Above this = entity card mode

function getZoomLevel(zoom: number): 'landscape' | 'unit' | 'team' | 'entity' {
  if (zoom < ZOOM_LANDSCAPE) return 'landscape';
  if (zoom < ZOOM_UNIT) return 'unit';
  if (zoom < ZOOM_TEAM) return 'team';
  return 'entity';
}
```

### 1B: Enhance node rendering per zoom level

Update the node components to accept a `zoomLevel` prop and render differently:

**Landscape (zoomed out):** Large rectangle, name + entity count badge only. Color intensity = population density (entity count / max entity count in graph). No individual entities visible.

**Unit (medium zoom):** Card with name, entity count, manager initials avatar, status dot. Edges show containment relationships.

**Team (zoomed in):** All entity tiles visible as compact tiles (initials + name + status dot). Tiles clustered by entity_type or variant.

**Entity (most zoomed in):** Full detail tiles with name, external_id, status, variant badge, and performance indicator (if outcomes exist).

Pass `zoomLevel` to nodes via React Flow's node data:

```typescript
const { zoom } = useViewport();
const zoomLevel = getZoomLevel(zoom);

// Update all nodes with current zoom level
const enhancedNodes = nodes.map(n => ({
  ...n,
  data: { ...n.data, zoomLevel }
}));
```

### 1C: Smooth zoom transitions

When the user clicks a node, animate the camera to center on it and zoom in one level:

```typescript
const { setCenter, fitView } = useReactFlow();

function handleNodeClick(event, node) {
  const currentLevel = getZoomLevel(zoom);
  const targetZoom = currentLevel === 'landscape' ? 0.6 :
                     currentLevel === 'unit' ? 1.0 :
                     currentLevel === 'team' ? 1.5 : 2.0;
  setCenter(node.position.x, node.position.y, { zoom: targetZoom, duration: 500 });
}
```

### 1D: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-1 | Zooming out past 0.4 shows landscape-mode nodes (large, population density) | Visual verification |
| PG-2 | Zooming in past 1.2 shows entity-detail tiles (name, external_id, status) | Visual verification |
| PG-3 | Clicking a node zooms in and centers on it with animation | Visual verification |
| PG-4 | Zoom level transitions are smooth (no flickering or layout jumps) | Visual verification |

**Commit:** `OB-54 Phase 1: Level-of-detail zoom rendering — 4 zoom levels`

---

## PHASE 2: ENTITY DETAIL PANEL

When a user clicks an entity node (at team or entity zoom level), a detail panel slides in from the right.

### 2A: Create EntityDetailPanel component

Create `web/src/components/canvas/panels/EntityDetailPanel.tsx`:

```typescript
interface EntityDetailPanelProps {
  entity: {
    id: string;
    display_name: string;
    entity_type: string;
    status: string;
    external_id: string;
    attributes: Record<string, any>;
  };
  relationships: Array<{
    id: string;
    related_entity: { id: string; display_name: string; entity_type: string };
    relationship_type: string;
    confidence: number;
    source: string;
  }>;
  outcomes?: Array<{
    period_id: string;
    total_payout: number;
    attainment_pct: number;
  }>;
  onClose: () => void;
  onReassign: (entityId: string) => void;
}
```

The panel displays:

**Identity Section:**
- Display name (large, white)
- Entity type badge (e.g., "individual", "location", "team")
- Status dot + label
- External ID (muted)

**Relationships Section:**
- List of relationships with type labels (reports_to, works_at, member_of, manages)
- Confidence score for AI-inferred relationships (amber badge: "AI inferred — 78%")
- Each relationship row is clickable → centers canvas on that entity

**Performance Section (if outcomes exist):**
- Latest period payout as HeroMetric
- Attainment % with TrendArrow
- "View full performance →" link to Perform workspace

**Actions Section:**
- "Reassign" button → enables drag mode for this entity
- "Edit attributes" button → inline attribute editor
- "Invite to platform" button → if no profile_id linked, shows user invite form

### 2B: Wire EntityDetailPanel into canvas

```typescript
const [selectedEntity, setSelectedEntity] = useState(null);

function handleNodeClick(event, node) {
  if (zoomLevel === 'team' || zoomLevel === 'entity') {
    // Fetch full entity detail from Supabase
    const detail = await getEntityDetail(supabase, node.id);
    setSelectedEntity(detail);
  } else {
    // Zoom in
    zoomToNode(node);
  }
}
```

### 2C: Fetch entity detail from Supabase

Add to `graph-service.ts`:

```typescript
export async function getEntityDetail(supabase, entityId) {
  const { data: entity } = await supabase
    .from('entities')
    .select('*')
    .eq('id', entityId)
    .single();

  const { data: relationships } = await supabase
    .from('entity_relationships')
    .select(`
      id, relationship_type, confidence, source,
      source_entity_id, target_entity_id
    `)
    .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`)
    .is('effective_end', null);

  // Resolve related entity names
  const relatedIds = relationships?.map(r =>
    r.source_entity_id === entityId ? r.target_entity_id : r.source_entity_id
  ) || [];

  const { data: relatedEntities } = await supabase
    .from('entities')
    .select('id, display_name, entity_type')
    .in('id', relatedIds);

  // Fetch latest outcomes if they exist
  const { data: outcomes } = await supabase
    .from('entity_period_outcomes')
    .select('period_id, total_payout, attainment_pct')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(3);

  return { entity, relationships, relatedEntities, outcomes };
}
```

### 2D: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-5 | Clicking an entity node opens EntityDetailPanel | Navigate to canvas with demo tenant data, click entity |
| PG-6 | Panel shows real entity data from Supabase (display_name, type, status) | Compare panel content to `entities` table |
| PG-7 | Relationships listed with type labels | Panel shows at least one relationship for entities with relationships |
| PG-8 | Clicking a relationship row centers canvas on related entity | Click relationship → canvas pans and centers |
| PG-9 | Panel closes when clicking X or clicking canvas background | Visual verification |

**Commit:** `OB-54 Phase 2: EntityDetailPanel — full entity detail on click`

---

## PHASE 3: CANVAS SEARCH

For tenants with hundreds or thousands of entities, users need to find specific entities without scrolling.

### 3A: Create CanvasSearchBar component

Position a search bar at the top of the canvas (floating, semi-transparent):

```typescript
function CanvasSearchBar({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }

    const { data } = await supabase
      .from('entities')
      .select('id, display_name, entity_type, external_id')
      .eq('tenant_id', currentTenant.id)
      .or(`display_name.ilike.%${q}%,external_id.ilike.%${q}%`)
      .limit(10);

    setResults(data || []);
  };

  return (
    <div style={{
      position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 10, width: '320px',
    }}>
      <input
        value={query}
        onChange={e => handleSearch(e.target.value)}
        placeholder="Search entities..."
        style={{
          width: '100%', padding: '10px 16px', borderRadius: '8px',
          background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(99, 102, 241, 0.3)',
          color: '#e2e8f0', fontSize: '14px', backdropFilter: 'blur(8px)',
        }}
      />
      {results.length > 0 && (
        <div style={{
          marginTop: '4px', borderRadius: '8px', overflow: 'hidden',
          background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(99, 102, 241, 0.2)',
        }}>
          {results.map(r => (
            <div key={r.id} onClick={() => { onSelect(r.id); setQuery(''); setResults([]); }}
              style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(30,41,59,0.5)' }}
            >
              <span style={{ color: '#e2e8f0', fontSize: '13px' }}>{r.display_name}</span>
              <span style={{ color: '#64748b', fontSize: '11px', marginLeft: '8px' }}>{r.entity_type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 3B: Wire search to canvas navigation

When a search result is selected, center the canvas on that entity and open the EntityDetailPanel:

```typescript
function handleSearchSelect(entityId: string) {
  const node = nodes.find(n => n.id === entityId);
  if (node) {
    setCenter(node.position.x, node.position.y, { zoom: 1.5, duration: 500 });
    // Load and show entity detail
    loadEntityDetail(entityId);
  }
}
```

### 3C: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-10 | Search bar appears on canvas | Visual verification |
| PG-11 | Typing 2+ characters returns matching entities from Supabase | Type partial entity name → results appear |
| PG-12 | Selecting a result centers canvas on that entity | Click result → canvas pans and zooms |
| PG-13 | Search works with external_id (not just display_name) | Search by entity ID number |

**Commit:** `OB-54 Phase 3: Canvas search — find and navigate to entities`

---

## PHASE 4: DRAG-TO-REASSIGN

This is the core interactive feature. An admin drags an entity from one parent to another, reviews the impact, and confirms the change.

### 4A: Enable node dragging

React Flow supports drag natively. The key is detecting when a node is dropped ON another node (reassignment) vs. dropped in empty space (repositioning):

```typescript
import { useOnNodeDrag, useOnNodeDragStop } from '@xyflow/react';

function handleDragStop(event, node, nodes) {
  // Find if dropped on another node
  const dropTarget = nodes.find(n =>
    n.id !== node.id &&
    Math.abs(n.position.x - node.position.x) < 80 &&
    Math.abs(n.position.y - node.position.y) < 60
  );

  if (dropTarget && dropTarget.data.entity_type !== 'individual') {
    // Show reassignment confirmation
    setReassignment({
      source: node,
      target: dropTarget,
    });
  }
}
```

### 4B: Create ImpactPreviewPanel

When a drag-to-reassign is initiated, a panel shows:

```
┌─────────────────────────────────────┐
│  REASSIGN ENTITY                    │
│                                     │
│  Moving: Carlos García López        │
│  From: Sucursal León (León)         │
│  To: Sucursal Aguascalientes        │
│                                     │
│  This will:                         │
│  • Change reporting structure       │
│  • Update entity_relationships      │
│  • Rule set assignments reviewed    │
│                                     │
│  Effective: [2026-02-18]            │
│                                     │
│  [Cancel]            [Confirm Move] │
└─────────────────────────────────────┘
```

### 4C: Persist reassignment to Supabase

On confirm:

```typescript
async function confirmReassignment(source, target, effectiveDate) {
  // 1. End current relationship
  const { data: currentRel } = await supabase
    .from('entity_relationships')
    .select('id')
    .eq('source_entity_id', source.id)
    .in('relationship_type', ['works_at', 'member_of', 'reports_to'])
    .is('effective_end', null)
    .single();

  if (currentRel) {
    await supabase
      .from('entity_relationships')
      .update({ effective_end: effectiveDate })
      .eq('id', currentRel.id);
  }

  // 2. Create new relationship
  await supabase
    .from('entity_relationships')
    .insert({
      tenant_id: currentTenant.id,
      source_entity_id: source.id,
      target_entity_id: target.id,
      relationship_type: currentRel?.relationship_type || 'works_at',
      confidence: 1.0,
      source: 'human_confirmed',
      effective_start: effectiveDate,
    });

  // 3. Refresh graph
  await loadGraph();

  // 4. Close panel
  setReassignment(null);
}
```

### 4D: Visual feedback during drag

While dragging, highlight valid drop targets (non-individual entities) with a glow border. Invalid targets (same entity, other individuals) remain unchanged.

### 4E: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-14 | Dragging an entity node onto a unit node opens ImpactPreviewPanel | Drag entity → drop on unit |
| PG-15 | ImpactPreviewPanel shows source name, target name, and effective date picker | Visual verification |
| PG-16 | Confirming reassignment writes to entity_relationships in Supabase | Query entity_relationships table after confirm — old relationship has effective_end, new relationship exists |
| PG-17 | Graph refreshes after reassignment (entity appears under new parent) | Visual verification |
| PG-18 | Canceling reassignment returns entity to original position | Click Cancel → entity snaps back |

**Commit:** `OB-54 Phase 4: Drag-to-reassign with impact preview and Supabase persistence`

---

## PHASE 5: RELATIONSHIP CREATION AND CANVAS TOOLBAR

### 5A: Canvas Toolbar

Create a floating toolbar at the top-right of the canvas with:

- **Zoom controls:** Zoom in (+), Zoom out (-), Fit view (□)
- **Layout toggle:** Hierarchical | Force-directed
- **Add relationship mode:** When active, clicking two nodes in sequence creates a relationship between them

```typescript
function CanvasToolbar({ onLayoutChange, onToggleRelationshipMode, relationshipMode }) {
  return (
    <div style={{
      position: 'absolute', top: '16px', right: '16px', zIndex: 10,
      display: 'flex', gap: '4px', background: 'rgba(15,23,42,0.9)',
      borderRadius: '8px', padding: '4px', border: '1px solid rgba(99,102,241,0.2)',
    }}>
      {/* Zoom controls handled by React Flow's Controls */}
      <ToolbarButton icon={<Grid />} onClick={() => onLayoutChange('hierarchical')} label="Hierarchical" />
      <ToolbarButton icon={<Zap />} onClick={() => onLayoutChange('force')} label="Force" />
      <ToolbarButton
        icon={<Link />}
        onClick={onToggleRelationshipMode}
        active={relationshipMode}
        label="Add Relationship"
      />
    </div>
  );
}
```

### 5B: Relationship creation flow

When "Add Relationship" mode is active:
1. User clicks first node → highlighted as "source" (indigo border pulse)
2. User clicks second node → relationship type selector appears:
   - works_at
   - reports_to
   - member_of
   - manages
   - covers_territory
3. User selects type → relationship saved to Supabase
4. Graph refreshes with new edge

```typescript
async function createRelationship(sourceId, targetId, type) {
  await supabase.from('entity_relationships').insert({
    tenant_id: currentTenant.id,
    source_entity_id: sourceId,
    target_entity_id: targetId,
    relationship_type: type,
    confidence: 1.0,
    source: 'human_confirmed',
    effective_start: new Date().toISOString(),
  });
  await loadGraph();
  setRelationshipMode(false);
}
```

### 5C: Layout engine enhancement

Add a force-directed layout option alongside the existing hierarchical layout:

```typescript
function computeForceLayout(entities, relationships) {
  // Simple force-directed: entities repel, relationships attract
  // Iterate 100 times to stabilize
  const positions = {};
  entities.forEach((e, i) => {
    positions[e.id] = {
      x: Math.cos(2 * Math.PI * i / entities.length) * 300,
      y: Math.sin(2 * Math.PI * i / entities.length) * 300,
    };
  });

  for (let iter = 0; iter < 100; iter++) {
    // Repulsion between all pairs
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const dx = positions[entities[j].id].x - positions[entities[i].id].x;
        const dy = positions[entities[j].id].y - positions[entities[i].id].y;
        const dist = Math.max(Math.sqrt(dx*dx + dy*dy), 1);
        const force = 5000 / (dist * dist);
        positions[entities[i].id].x -= (dx / dist) * force;
        positions[entities[i].id].y -= (dy / dist) * force;
        positions[entities[j].id].x += (dx / dist) * force;
        positions[entities[j].id].y += (dy / dist) * force;
      }
    }
    // Attraction along edges
    relationships.forEach(r => {
      const s = positions[r.source_entity_id];
      const t = positions[r.target_entity_id];
      if (s && t) {
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const force = dist * 0.01;
        s.x += (dx / dist) * force;
        s.y += (dy / dist) * force;
        t.x -= (dx / dist) * force;
        t.y -= (dy / dist) * force;
      }
    });
  }
  return positions;
}
```

### 5D: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-19 | Canvas toolbar visible with layout toggle and relationship button | Visual verification |
| PG-20 | Toggling layout between hierarchical and force-directed re-renders graph | Click toggle → graph re-layouts with animation |
| PG-21 | "Add Relationship" mode: clicking two nodes in sequence creates a relationship | Activate mode → click node A → click node B → select type → edge appears |
| PG-22 | New relationship persisted to entity_relationships in Supabase | Query table after creation |
| PG-23 | Relationship type selector shows domain-agnostic options (works_at, reports_to, etc.) | Visual verification — no ICM-specific labels |

**Commit:** `OB-54 Phase 5: Toolbar, relationship creation, force-directed layout`

---

## PHASE 6: CANVAS VISUAL POLISH AND DS-001 COMPLIANCE

### 6A: Dark theme compliance

Ensure all canvas elements follow the DS-001 dark theme:
- Canvas background: `#0a0e1a` (deep space)
- Node backgrounds: `rgba(24, 24, 27, 0.9)` with backdrop blur
- Node borders: `rgba(99, 102, 241, 0.3)` (indigo undertone)
- Text: `#e2e8f0` (slate-200) for primary, `#94a3b8` (slate-400) for secondary
- Edge colors: `#818cf8` (indigo-400) for confirmed, `#fbbf24` (amber-400) for AI-inferred
- Use inline styles (Standing Rule 7) for all visual properties

### 6B: Edge labels

For the `reports_to` and `manages` relationship types, display a small label on the edge midpoint. Other relationship types show labels only on hover.

### 6C: MiniMap styling

Style the React Flow MiniMap to match the dark theme:
```typescript
<MiniMap
  nodeColor={(node) => {
    if (node.data?.entity_type === 'individual') return '#818cf8';
    if (node.data?.entity_type === 'location') return '#34d399';
    return '#6366f1';
  }}
  maskColor="rgba(10, 14, 26, 0.8)"
  style={{ background: '#0f172a', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px' }}
/>
```

### 6D: Empty state

If the tenant has zero entities, show:
```
No entities discovered yet.
Import your data to auto-discover your organizational structure.
[Import Data →]
```

If the tenant has entities but zero relationships, show the entities as unconnected nodes with a banner:
```
Entities found but no relationships detected.
Import more data to discover relationships, or use Add Relationship mode to define them manually.
```

### 6E: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-24 | Canvas background is #0a0e1a (not white or gray) | Visual verification |
| PG-25 | Node borders have indigo undertone matching DS-001 | Visual verification |
| PG-26 | AI-inferred edges are dashed amber, confirmed edges are solid indigo | Visual verification with tenant that has both types |
| PG-27 | Empty state shows import guidance (not blank canvas) | Navigate to canvas for tenant with no entities |
| PG-28 | MiniMap matches dark theme | Visual verification |

**Commit:** `OB-54 Phase 6: Canvas visual polish — DS-001 compliance, edge labels, empty states`

---

## PHASE 7: AUTOMATED VERIFICATION AND PR

### 7A: Build verification

```bash
cd web
echo "=== TypeScript check ==="
npx tsc --noEmit 2>&1 | tail -10
echo "=== Build ==="
npm run build 2>&1 | tail -10
echo "=== Canvas component count ==="
find src/components/canvas -name "*.tsx" | wc -l
echo "=== Canvas service functions ==="
grep "export.*function\|export.*async" src/lib/canvas/graph-service.ts | wc -l
echo "=== React Flow version ==="
grep "xyflow" package.json
```

### 7B: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-29 | TypeScript: zero errors | `npx tsc --noEmit` exits 0 |
| PG-30 | Build: clean | `npm run build` exits 0 |
| PG-31 | localhost:3000 responds 200 | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` |
| PG-32 | Canvas route accessible without errors | Navigate to canvas URL in browser |

### 7C: Completion report

Create `OB-54_COMPLETION_REPORT.md` at PROJECT ROOT:

```markdown
# OB-54 COMPLETION REPORT
## Organizational Canvas Phase 2 — Interactive Spatial Management
## Date: [date]

## COMMITS
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
[All 32 gates listed with pasted evidence]

## CANVAS CAPABILITIES AFTER OB-54
| Capability | Status |
|---|---|
| Read-only graph rendering | WORKING (OB-52) |
| 4 zoom levels with level-of-detail | [PASS/FAIL] |
| Entity detail panel on click | [PASS/FAIL] |
| Search and navigate | [PASS/FAIL] |
| Drag-to-reassign with persistence | [PASS/FAIL] |
| Relationship creation | [PASS/FAIL] |
| Layout toggle (hierarchical/force) | [PASS/FAIL] |
| DS-001 dark theme compliance | [PASS/FAIL] |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS/FAIL
- Rule 7 (inline styles for visual): PASS/FAIL
- Rule 10 (domain-agnostic labels): PASS/FAIL
- Rule 25 (report before final build): PASS/FAIL

## KNOWN ISSUES

## VERIFICATION OUTPUT
```

### 7D: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-54: Organizational Canvas Phase 2 — Interactive Spatial Management" \
  --body "## Phase 1 → Phase 2

OB-52 delivered read-only canvas (React Flow v12.10.0, custom nodes, Supabase graph). 
OB-54 makes it interactive.

### Phase 1: Level-of-Detail Zoom
- 4 zoom levels: Landscape → Unit → Team → Entity
- Click-to-zoom-in with smooth animation

### Phase 2: Entity Detail Panel
- Click entity → slide-in panel with identity, relationships, outcomes
- Click relationship → navigate to related entity
- Actions: Reassign, Edit, Invite

### Phase 3: Canvas Search
- Search by name or external_id
- Select result → canvas navigates to entity

### Phase 4: Drag-to-Reassign
- Drag entity onto unit → ImpactPreviewPanel
- Confirm → writes to entity_relationships in Supabase
- Old relationship gets effective_end, new relationship created

### Phase 5: Relationship Creation + Toolbar
- Add Relationship mode: click source → click target → select type
- Layout toggle: hierarchical / force-directed
- All mutations persist to Supabase

### Phase 6: Visual Polish
- DS-001 dark theme compliance
- Edge labels, MiniMap styling, empty states

## Proof Gates: 32 — see OB-54_COMPLETION_REPORT.md"
```

**Commit:** `OB-54 Phase 7: Verification, completion report, PR`

---

## PROOF GATE SUMMARY (32 gates)

| # | Gate | Phase |
|---|------|-------|
| PG-1 | Landscape mode at zoom <0.4 | 1 |
| PG-2 | Entity-detail tiles at zoom >1.2 | 1 |
| PG-3 | Click-to-zoom with animation | 1 |
| PG-4 | Smooth zoom transitions (no flicker) | 1 |
| PG-5 | Click entity opens EntityDetailPanel | 2 |
| PG-6 | Panel shows real Supabase data | 2 |
| PG-7 | Relationships listed with type labels | 2 |
| PG-8 | Click relationship navigates to entity | 2 |
| PG-9 | Panel closes on X or background click | 2 |
| PG-10 | Search bar visible on canvas | 3 |
| PG-11 | 2+ chars returns matching entities | 3 |
| PG-12 | Selecting result centers canvas | 3 |
| PG-13 | Search works with external_id | 3 |
| PG-14 | Drag entity onto unit opens ImpactPreview | 4 |
| PG-15 | Panel shows source, target, date picker | 4 |
| PG-16 | Confirm writes to entity_relationships | 4 |
| PG-17 | Graph refreshes after reassignment | 4 |
| PG-18 | Cancel returns entity to original position | 4 |
| PG-19 | Toolbar visible with controls | 5 |
| PG-20 | Layout toggle re-renders graph | 5 |
| PG-21 | Add Relationship creates edge between 2 nodes | 5 |
| PG-22 | New relationship persisted to Supabase | 5 |
| PG-23 | Relationship types are domain-agnostic | 5 |
| PG-24 | Canvas background #0a0e1a | 6 |
| PG-25 | Node borders have indigo undertone | 6 |
| PG-26 | AI-inferred = dashed amber, confirmed = solid indigo | 6 |
| PG-27 | Empty state shows import guidance | 6 |
| PG-28 | MiniMap matches dark theme | 6 |
| PG-29 | TypeScript zero errors | 7 |
| PG-30 | Build clean | 7 |
| PG-31 | localhost:3000 responds 200 | 7 |
| PG-32 | Canvas route accessible without errors | 7 |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-54_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## WHAT IS EXPLICITLY OUT OF SCOPE

| Item | Why | When |
|------|-----|------|
| CPI engine (computing new inferences) | AI pipeline work, not canvas UI | Future OB |
| Geographic map view for locations | Requires map API integration | Future OB |
| Cross-workspace canvas links (Perform → Canvas) | Needs navigation architecture | Future OB |
| Canvas for 150K entities with virtualization | Performance optimization after core interactivity | Future OB |
| Mobile touch gestures | Responsive fallback to tree list is sufficient | Future OB |

---

*OB-54 — February 17, 2026*
*"A read-only graph is a picture. An interactive graph is a management tool."*
*"Drag an entity. See the impact. Confirm the change. The organization restructured in 3 clicks, not 3 meetings."*
