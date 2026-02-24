# OB-89: Platform Hardening & Demo Readiness — Completion Report

## Status: COMPLETE

`npm run build` exits 0 (compiled successfully).

---

## Phase 0: Platform Diagnostic

**File:** `OB-89_PHASE0_DIAGNOSTIC.md`

Documented:
- Persona switcher failure mode: Case C (auth round-trip via signOut/signIn)
- 134 total route pages, 38 with redirects
- 5 duplicate reconciliation pages, 4 duplicate calculation pages
- Console error sources: .trim() (safe), configuration.variants (already guarded), Supabase null tenant_id
- N+1 query assessment: LOW severity (12 direct Supabase calls in components)

---

## Mission 1: Fix Demo Persona Switcher

**Files:**
- `web/src/components/demo/DemoPersonaSwitcher.tsx` — REWRITTEN
- `web/src/contexts/persona-context.tsx` — MODIFIED

**Before:** Used `supabase.auth.signOut()` + `supabase.auth.signInWithPassword()` with full page reload. Broke demo flow entirely.

**After:** Context-only impersonation via `setPersonaOverride()`. No auth round-trip. No page reload. Override persists in sessionStorage across navigation. Static PERSONA_CHIPS array (Admin/Manager/Rep) with instant visual feedback.

---

## Mission 2: Stub Page Cleanup

**Files:**
- `web/src/app/operate/reconcile/page.tsx` — DELETED (re-export)
- `web/src/app/govern/reconciliation/page.tsx` — DELETED (re-export)
- `web/src/app/investigate/calculations/page.tsx` — DELETED (re-export)
- `web/src/app/admin/launch/reconciliation/page.tsx` — REPLACED with redirect to `/investigate/reconciliation`
- `web/src/app/operate/calculate/page.tsx` — REPLACED with redirect to `/admin/launch/calculate`
- `web/src/components/navigation/Sidebar.tsx` — Updated reconciliation link to `/investigate/reconciliation`

**Result:** 3 duplicate re-export pages deleted. 2 legacy routes redirect to canonical pages. Sidebar navigation synced.

---

## Mission 3: Console Error Silence

**Files:**
- `web/src/lib/supabase/data-service.ts` — Added `requireTenantId()` to `updateImportBatchStatus`, `recordClassificationSignal`
- `web/src/lib/supabase/entity-service.ts` — Added `requireTenantId()` to `updateEntity`, `deleteEntity`; early return to `listReassignmentEvents`
- `web/src/lib/supabase/rule-set-service.ts` — Added `requireTenantId()` to `saveRuleSet`, `deleteRuleSet`
- `web/src/lib/governance/approval-service.ts` — Added early return to `listApprovalItemsAsync`

**Pattern:** Write functions get `requireTenantId()` assertion. Read functions get `if (!tenantId) return []` early return (no crash, no 400).

---

## Mission 4: N+1 Query Mitigation

**Files:**
- `web/src/contexts/locale-context.tsx` — Added Supabase language persistence in `setLocale()`
- `web/src/components/layout/language-switcher.tsx` — Removed direct `createClient()`, now pure UI consuming locale-context

**Assessment:** Primary N+1 source (persona switcher auth round-trip) was fixed in Mission 1. Remaining direct Supabase calls in page components are page-specific reads (adjustments, people, users) — appropriate for their scope. Language persistence moved from component to context, eliminating one of the two direct component Supabase clients.

---

## Mission 5: Tenant Selector Cleanup

**Files:**
- `web/src/components/platform/ObservatoryTab.tsx` — Added test tenant filter + toggle
- `web/src/components/platform/PlatformObservatory.tsx` — Added VL Admin badge

**Features:**
- Test tenants filtered by name pattern (test, pipeline, retailco, frmx, retail conglomerate) and zero-entity status
- "Show N test" toggle button to reveal hidden tenants when needed
- VL Admin badge in Platform Observatory header for clear role identification

---

## Files Summary

| File | Action | Mission |
|------|--------|---------|
| `OB-89_PHASE0_DIAGNOSTIC.md` | CREATE | 0 |
| `web/src/components/demo/DemoPersonaSwitcher.tsx` | REWRITE | 1 |
| `web/src/contexts/persona-context.tsx` | MODIFY | 1 |
| `web/src/app/operate/reconcile/page.tsx` | DELETE | 2 |
| `web/src/app/govern/reconciliation/page.tsx` | DELETE | 2 |
| `web/src/app/investigate/calculations/page.tsx` | DELETE | 2 |
| `web/src/app/admin/launch/reconciliation/page.tsx` | REPLACE | 2 |
| `web/src/app/operate/calculate/page.tsx` | REPLACE | 2 |
| `web/src/components/navigation/Sidebar.tsx` | MODIFY | 2 |
| `web/src/lib/supabase/data-service.ts` | MODIFY | 3 |
| `web/src/lib/supabase/entity-service.ts` | MODIFY | 3 |
| `web/src/lib/supabase/rule-set-service.ts` | MODIFY | 3 |
| `web/src/lib/governance/approval-service.ts` | MODIFY | 3 |
| `web/src/contexts/locale-context.tsx` | MODIFY | 4 |
| `web/src/components/layout/language-switcher.tsx` | MODIFY | 4 |
| `web/src/components/platform/ObservatoryTab.tsx` | MODIFY | 5 |
| `web/src/components/platform/PlatformObservatory.tsx` | MODIFY | 5 |
| `OB-89_COMPLETION_REPORT.md` | CREATE | 7 |

## Constraints Honored
- Did NOT modify calculation engine
- Did NOT modify reconciliation comparison engine
- Did NOT modify AI pipelines
- Zero console errors from tenant_id/null guards on clean navigation
