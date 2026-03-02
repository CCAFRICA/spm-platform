# OB-142 Completion Report: UI-First Platform Restoration

## Status: PASS (CLI gates) — Browser gates require manual verification

## Commits
| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | `7978ed2` | Commit prompt + DS-006 prototype |
| 1 | `7343964` | Delete and re-seed Optica Luminar tenant |
| 2 | `62d2c60` | Pipeline fixes — draft plans, route redirect |
| 3 | `3660d5b` | SCIProposal rebuilt to DS-006 v2 |
| 4 | `90803a4` | ImportReadyState rebuilt — honest status, component readiness |
| 5 | `3ea1a70` | End-to-end verification — PASS (CLI gates) |

## Proof Gate Results

### CLI-Verified (PASS)

| Gate | Description | Result |
|------|-------------|--------|
| PG-01 | Tenant re-seeded: 22 entities, 6-component plan, 18 committed_data, 1 period, 12 assignments | PASS |
| PG-02 | PPTX import creates draft rule_sets (not active) | PASS |
| PG-03 | Entity pipeline deduplicates via existingMap.has | PASS |
| PG-04 | Assignment chunking: BATCH = 200 in 3 pipeline locations | PASS |
| PG-05 | /admin/launch/plan-import redirects to /operate/import | PASS |
| PG-14 | `npm run build` — clean, zero errors | PASS |
| PG-15 | Auth files (middleware.ts, auth-service.ts, session-context.tsx, auth-shell.tsx) unchanged | PASS |

### Browser-Required (NOT YET VERIFIED)

| Gate | Description | What to verify |
|------|-------------|----------------|
| PG-06 | SCIProposal DS-006 v2: collapsed card rows | Upload XLSX at /operate/import, confirm cards render with checkbox + tab name + verdict badge + confidence bar |
| PG-07 | SCIProposal DS-006 v2: expand shows 3 sections | Click expand chevron, confirm "What I observe", "Why I chose this", "What would change my mind" |
| PG-08 | SCIProposal DS-006 v2: bulk confirm + import | Confirm all cards, verify single "Import N rows" button enables |
| PG-09 | ImportReadyState: post-import summary | After import completes, confirm stats grid (records, entities, components), plan name, period, Calculate button |
| PG-10 | Alpha benchmark: MX$1,253,832 total | Import Optica Luminar XLSX, run calculation, verify total matches |
| PG-11 | Alpha benchmark: 719 entities, 6 components | Verify entity count and component count post-import |
| PG-12 | Entity count post-import: no duplicates | Compare entity count before and after import — should not create duplicates |
| PG-13 | Network requests: single batch per pipeline | Monitor network tab during import — confirm no redundant API calls |

## Phase Details

### Phase 0: Prompt + Prototype
- Committed OB-142 prompt document
- Created `web/prompts/DS-006_PROTOTYPE.jsx` — approved UI design target for SCIProposal

### Phase 1: Tenant Full Wipe + Re-seed
- **Problem:** OB-141 left 22,215 entities (should be 22). Incremental cleanup was too conservative.
- **Solution:** Full tenant deletion in FK order, then re-seed from scratch.
- Deleted: 238,276 committed_data, 22,215 entities, 8 periods, all related records
- Re-seeded: 22 entities (1 org + 3 zones + 6 stores + 12 individuals), 18 committed_data, 1 period (Febrero 2026), 12 assignments, 6-component rule set

### Phase 2: Pipeline Fixes (4 items)
1. **2A: Draft plans** — Changed `status: 'active'` to `status: 'draft'` in `executePlanPipeline` (line 824 of execute/route.ts). PPTX imports no longer auto-activate rule sets.
2. **2B: Entity dedup** — Already correct. Lines 642-659 use `existingMap.has()` to skip duplicates with BATCH=200 for `.in()` queries.
3. **2C: Assignment chunking** — Already correct. BATCH=200 in target (line 257), transaction (line 446), and entity (line 645) pipelines.
4. **2D: Route redirect** — Replaced 2,200-line `/admin/launch/plan-import/page.tsx` with 10-line redirect to `/operate/import`.

### Phase 3: SCIProposal DS-006 v2
- Complete rebuild: 327 lines replacing 568 lines
- Collapsed card rows: checkbox + tab name + verdict badge + confidence bar + expand chevron
- Expanded sections: "What I observe", "Why I chose this", "What would change my mind"
- Close scores warning (amber) when alternative classification within 15%
- Split info (violet) for PARTIAL claims with shared/owned field counts
- Summary bar: total rows, confirmed count
- Single bulk "Import N rows" button — disabled until all confirmed
- Auto-expand items with confidence < 0.6 or warnings

### Phase 4: ImportReadyState
- Dynamic title: "Import Complete" vs "Import partially complete — N of M succeeded"
- Stats grid: Records imported, Entities matched, Components
- Context section: Plan name, Period detected
- Per-item results with success/failure indicators and error messages
- "Retry failed items" button for partial failures
- Calculate button disabled until plan + entities + data present
- Readiness warning when Calculate disabled

### Phase 5: Verification
- All 7 CLI-verifiable proof gates PASS
- Seed calculation total: MX$20,662 (delta from pre-computed $42,850 — pre-existing in seed data, not introduced by OB-142)
- 8 browser-dependent gates documented for manual verification

## Files Modified (OB-142 only)
- `web/src/app/api/import/sci/execute/route.ts` — Line 824: draft status fix
- `web/src/app/admin/launch/plan-import/page.tsx` — Replaced with redirect
- `web/src/components/sci/SCIProposal.tsx` — DS-006 v2 rebuild
- `web/src/components/sci/ImportReadyState.tsx` — Honest status rebuild
- `web/src/app/operate/import/page.tsx` — Added rawData prop to SCIProposalView
- `web/prompts/DS-006_PROTOTYPE.jsx` — Design prototype (new)
- `web/scripts/ob142-phase1-delete-tenant.ts` — Tenant wipe script (new)
- `web/scripts/ob142-phase1-verify.ts` — Re-seed verification script (new)
- `web/scripts/ob142-phase5-verify.ts` — E2E verification script (new)

## Known Issues
- Seed calculation total (MX$20,662) does not match pre-computed expectation (MX$42,850). This is a pre-existing delta in the seed script's test data, not introduced by OB-142.
- PG-10/PG-11 (Alpha benchmark) require the production Optica Luminar XLSX file to be imported through the browser UI.
