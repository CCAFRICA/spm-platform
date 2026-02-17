# OB-52: Functional Pipeline Restoration — Completion Report

**Status:** IN PROGRESS
**Date:** 2026-02-17
**Branch:** dev

---

## PHASE 0: DIAGNOSTIC RESULTS

### Executive Summary
The prompt assumed 7 features were broken or missing. Diagnostic found most are already working:

| Component | Prompt Assumed | Actual Status | Action |
|-----------|---------------|---------------|--------|
| Plan Import | Broken | **WORKING** on Supabase + AI | Phase 1: Verify only |
| Data Import | Broken | **WORKING** on Supabase + AI | Phase 2: Verify only |
| Tenant Creation UI | Does not exist | **EXISTS** — 823-line wizard | Phase 3: Wire user creation + metering |
| Tenant Creation API | Does not exist | **EXISTS** — service role API route | Phase 3: Add metering |
| User Invite | Does not exist | **MISSING** — form collects data, no auth user created | Phase 4: Build |
| Billing Tab | Placeholder | **REAL DATA** from entity/batch counts | Phase 5: Add event metering |
| usage_metering table | Does not exist | **EXISTS** in Supabase types | Phase 5: Write events |
| Organizational Canvas | Zero code | **FULLY BUILT** — React Flow + custom nodes | Phase 6: Verify only |
| localStorage | Regression risk | **CLEAN** — zero business data | N/A |

### Key Architecture Files Verified

**Plan Import Pipeline:**
- `web/src/app/admin/launch/plan-import/page.tsx` — 1489 lines, full AI interpretation flow
- `web/src/lib/supabase/rule-set-service.ts` — Supabase CRUD, 5-layer JSONB decomposition
- `web/src/app/api/interpret-plan/route.ts` — Server-side AI via AIService
- Storage: `saveRuleSet()` → `rule_sets` table, NO localStorage

**Data Import Pipeline:**
- `web/src/app/data/import/enhanced/page.tsx` — Multi-sheet AI classification + field mapping
- `web/src/lib/supabase/data-service.ts` — `directCommitImportDataAsync()` → Supabase
- Storage: `committed_data`, `import_batches`, `entities` tables, NO localStorage

**Tenant Creation:**
- `web/src/app/admin/tenants/new/page.tsx` — 7-step wizard (Basic, Localization, Branding, Modules, Admin, Review, Provision)
- `web/src/app/api/admin/tenants/create/route.ts` — Service role client, slug uniqueness check
- **GAP**: Admin step collects email/name but does NOT create auth user

**User Invite:**
- Zero code for `inviteUserByEmail` or `auth.admin.createUser` in entire codebase
- **GAP**: No user creation anywhere

**Billing & Metering:**
- `web/src/components/platform/BillingUsageTab.tsx` — Real data from entity/batch counts
- `usage_metering` table defined in database.types.ts (metric_name, metric_value, period_key, metadata)
- **GAP**: No events written to usage_metering table

**Organizational Canvas:**
- `@xyflow/react` v12.10.0 installed
- `web/src/components/canvas/OrganizationalCanvas.tsx` — Full React Flow with custom nodes
- Custom nodes: `LandscapeNode`, `UnitNode`, `TeamNode`
- Custom edges: `RelationshipEdge`
- Hooks: `useCanvasData` → `getEntityGraph(tenantId)` → Supabase
- Routed at: `/configure/teams`, `/configure/locations`, `/configure/people`

**Observatory Onboarding Tab:**
- Shows onboarding pipeline (6 stages per tenant) — READ-ONLY
- No "Create Tenant" button
- **GAP**: No link to tenant creation wizard

### localStorage Regression Check
```
grep -rn "localStorage\." web/src/lib/ web/src/app/ --include="*.ts" --include="*.tsx"
```
Results: ONLY comments saying "No localStorage" — ZERO actual localStorage usage for business data.
Acceptable UI state uses: sidebar collapsed, theme preference, demo persona, nav signals — all confirmed absent from business logic.

---

## PROOF GATES

| # | Gate | Phase | Status | Evidence |
|---|------|-------|--------|----------|
| PG-1 | Plan import page loads | 1 | | |
| PG-2 | Tenant context available on plan import | 1 | | |
| PG-3 | AI plan interpretation API reachable | 1 | | |
| PG-4 | Plan saves to rule_sets table | 1 | | |
| PG-5 | No localStorage in plan import | 1 | | |
| PG-6 | Post-import guidance renders | 1 | | |
| PG-7 | Data import page loads | 2 | | |
| PG-8 | Tenant context available on data import | 2 | | |
| PG-9 | AI classification API reachable | 2 | | |
| PG-10 | No localStorage in data import | 2 | | |
| PG-11 | Past imports listable | 2 | | |
| PG-12 | Import creates audit record | 2 | | |
| PG-13 | Create Tenant form in Observatory | 3 | | |
| PG-14 | Form creates tenant row | 3 | | |
| PG-15 | New tenant in Observatory fleet | 3 | | |
| PG-16 | API uses service role client | 3 | | |
| PG-17 | Metering event for tenant creation | 3 | | |
| PG-18 | User invite form accessible | 4 | | |
| PG-19 | Invite creates auth user | 4 | | |
| PG-20 | Invite creates profile with tenant_id | 4 | | |
| PG-21 | Role template sets scope + capabilities | 4 | | |
| PG-22 | Metering event for user_invited | 4 | | |
| PG-23 | Invited user can log in | 4 | | |
| PG-24 | usage_metering table exists | 5 | | |
| PG-25 | Tenant creation metering event | 5 | | |
| PG-26 | User invite metering event | 5 | | |
| PG-27 | Billing tab shows real data | 5 | | |
| PG-28 | Entity count matches real data | 5 | | |
| PG-29 | @xyflow/react installed | 6 | | |
| PG-30 | Canvas page renders | 6 | | |
| PG-31 | Nodes appear for tenant | 6 | | |
| PG-32 | Edges connect entities | 6 | | |
| PG-33 | Zoom and pan work | 6 | | |
| PG-34 | Empty state for new tenants | 6 | | |
| PG-35 | TypeScript: zero errors | 8 | | |
| PG-36 | Production build: clean | 8 | | |
| PG-37 | Login-to-Login trace documented | 7 | | |

---

## LOGIN-TO-LOGIN TRACE
(To be filled in Phase 7)

---

## FILES CREATED/MODIFIED
(To be updated per phase)

---

## DEFERRED ITEMS
(To be filled at completion)
