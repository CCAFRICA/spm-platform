# ARCHITECTURE DECISION RECORD — OB-70

## DECISION 1: Calculation Trigger Wiring

**Problem:** "Run Preview →" button calls `transitionLifecycle()` which tries to UPDATE an existing batch. But no batch exists — the calculation API has never been called.

**Option A:** Wire the "Run Preview" action in operate/page.tsx to POST /api/calculation/run FIRST, then refresh page data (which loads the new batch).
- Pro: API route already exists and is verified correct (OB-69). Frontend-only change.
- Pro: After calc completes, page reload picks up the batch and lifecycle shows DRAFT/PREVIEW.

**Option B:** Navigate to /admin/launch/calculate which may have its own trigger.
- Con: Different page, breaks the workflow. Admin shouldn't have to leave /operate.

**CHOSEN:** Option A — Wire operate page to POST /api/calculation/run on "Run Preview" action.
**REJECTED:** Option B — Forces navigation away from the cockpit.

---

## DECISION 2: Personnel Page Fix

**Problem:** /configure/people uses ReactFlowProvider + OrganizationalCanvas. Table mode just redirects to /workforce/personnel (which uses mock data).

**Option A:** Replace /configure/people with a Supabase-backed entity table directly. Remove ReactFlow dependency.
- Pro: Personnel page becomes immediately useful showing 24K real entities.
- Pro: No canvas dependency, no crash risk.

**Option B:** Wrap in ReactFlowProvider and fix canvas loading.
- Con: Canvas is overkill for a personnel roster. Entity table is more useful.

**CHOSEN:** Option A — Replace with entity table querying Supabase. Show external_id, display_name, entity_type, status with search and pagination.
**REJECTED:** Option B — Canvas doesn't serve the entity roster use case.

---

## DECISION 3: Entity Display in Results

**Problem:** Dashboard shows entity_id UUIDs or lookup via entityNames Map. Need display_name + external_id.

**Option A:** The existing `loadOperatePageData()` already JOINs entities to get `entityNames` Map. Extend it to include external_id.
- Pro: No schema change. Data already loaded. Just add external_id to the entity query and display format.

**Option B:** Denormalize entity_name into calculation_results.
- Con: Stale if entity name changes. Extra write on every calculation.

**CHOSEN:** Option A — Extend existing entity query in page-loaders.ts to include external_id, update display to show "Name (ExternalID)" format.
**REJECTED:** Option B — Denormalization creates staleness risk.
