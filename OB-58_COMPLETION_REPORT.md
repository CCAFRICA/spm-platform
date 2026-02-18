# OB-58 Completion Report
## VISUAL POLISH, PIPELINE FIXES, AND SIDEBAR SCOPING

**Branch:** dev
**Date:** 2026-02-17
**Status:** ALL PHASES COMPLETE

---

## Mission Summary

| # | Mission | Phases | Status |
|---|---------|--------|--------|
| 1 | Plan Import 400 Fix | 0 | COMPLETE |
| 2 | Sidebar Scope Enforcement | 1 | COMPLETE |
| 3 | Global Text Brightness | 2 | COMPLETE |
| 4 | Lifecycle Button Fix | 3 | COMPLETE |
| 5 | Periods 400 Fix | 4 | COMPLETE |
| 6 | Plan Import Subway | 5 | COMPLETE |
| 7 | Language Switcher | 6 | COMPLETE |
| — | Verification | 7 | COMPLETE |

---

## Commits

| Hash | Phase | Description |
|------|-------|-------------|
| `e904e32` | — | Prompt committed for traceability |
| `4361758` | 0 | Plan import 400 fix — service role API route |
| `a8a0921` | 1 | Sidebar scope enforcement — persona-filtered workspaces |
| `4f97fa5` | 2 | Global text brightness — sidebar + Observatory + AI panels |
| `2473a9b` | 3 | Lifecycle button shows correct next transition |
| `7ce3459` | 4 | Periods 400 fix — service role API route |
| `7c03d41` | 5 | Plan import subway — 3-step progress indicator |
| `71a17a6` | 6 | Language switcher — stores preference, visual feedback |

---

## Phase Details

### Phase 0: Plan Import 400 Fix
- Created `/api/plan/import/route.ts` using `createServiceRoleClient()`
- Handles upsert + activation + metering in one API call
- Updated plan-import page to call API instead of direct browser insert
- Removed `saveRuleSet`/`activateRuleSet` browser client imports

### Phase 1: Sidebar Scope Enforcement
- WorkspaceSwitcher reads `usePersona()` and maps to `UserRole` via `PERSONA_TO_ROLE`
- `effectiveRole` drives `getAccessibleWorkspaces()` filtering
- `useMemo` for stable workspace list, `useEffect` for auto-redirect
- MissionControlRail cycle indicator respects persona (admin-only)

### Phase 2: Global Text Brightness
- **Navigation:** All labels minimum `#CBD5E1` (14px), headings `#94A3B8` (13px), active `#F8FAFC`
- **Observatory:** Replaced all `#64748B` with `#94A3B8`, all `12px` with `13px`
- **AssessmentPanel:** Heading 16px, body 14px
- **AdminDashboard:** Replaced `#71717a` with `#94A3B8`, `10px`/`11px` with `13px`
- All via inline styles

### Phase 3: Lifecycle Button Fix
- Added `TRANSITION_LABELS` constant with 10 lifecycle states and bilingual labels
- Both "Advance to Official" buttons now dynamic: `transition.label` from `currentState`
- Buttons hidden at terminal states (PUBLISHED, PENDING_APPROVAL)

### Phase 4: Periods 400 Fix
- Created `/api/periods/route.ts` using `createServiceRoleClient()`
- Returns periods + latest batch lifecycle in parallel
- Updated `period-context.tsx` to fetch via API instead of browser Supabase

### Phase 5: Plan Import Subway
- 3-step indicator: Upload → Review AI Interpretation → Confirm & Save
- Bilingual (en/es), dynamically highlighted based on current state
- Completed steps show green checkmark, active step indigo

### Phase 6: Language Switcher
- Language switcher persists preference to `profiles.locale` column in Supabase
- Locale context reads stored preference from profile on init
- Visual feedback via check mark on selected locale (already existed)

---

## Proof Gates (21)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| PG-1 | Plan import API exists | **PASS** | `find` returns 1 file |
| PG-2 | API uses service role | **PASS** | `createServiceRoleClient` in route.ts |
| PG-3 | Page calls API | **PASS** | `/api/plan/import` in page.tsx |
| PG-4 | No direct browser insert | **PASS** | Count: 0 |
| PG-5 | Sidebar reads persona | **PASS** | `usePersona` imported + called |
| PG-6 | Filtering applied | **PASS** | `PERSONA_TO_ROLE` + `effectiveRole` + `getAccessibleWorkspaces` |
| PG-7 | Rep has 1 workspace | **PASS** | `sales_rep: ['perform']` |
| PG-8 | Readable colors in sidebar | **PASS** | Count: 11 (threshold: 5) |
| PG-9 | No faint colors in sidebar | **PASS** | Count: 0 |
| PG-10 | Readable colors in Observatory | **PASS** | Count: 48 (threshold: 10) |
| PG-11 | No <13px text in Observatory | **PASS** | Count: 0 |
| PG-12 | Dynamic transition labels | **PASS** | `TRANSITION_LABELS` with `currentState` lookup |
| PG-13 | No hardcoded button text | **PASS*** | String exists only in TRANSITION_LABELS config (RECONCILE state label), not hardcoded in buttons |
| PG-14 | Periods through API | **PASS** | `/api/periods` called from period-context |
| PG-15 | Subway exists | **PASS** | `STEPS` array + `currentStep` logic |
| PG-16 | Three steps defined | **PASS** | Count: 3 |
| PG-17 | Switcher updates profile | **PASS** | Count: 1 |
| PG-18 | Preference read from profile | **PASS** | Count: 6 |
| PG-19 | TypeScript: zero errors | **PASS** | Exit code: 0 |
| PG-20 | Build: clean | **PASS** | `npm run build` success |
| PG-21 | localhost responds | **PASS** | HTTP 307 (redirect to login) |

*PG-13 note: The string "Advance to Official" appears once in `TRANSITION_LABELS` as the correct label for RECONCILE→OFFICIAL transition. Both button instances use `transition.label` dynamic lookup. No hardcoded button text remains.

---

## Files Created

- `web/src/app/api/plan/import/route.ts` — Service role API for plan import
- `web/src/app/api/periods/route.ts` — Service role API for periods

## Files Modified

### Phase 0
- `web/src/app/admin/launch/plan-import/page.tsx` — API call instead of browser insert

### Phase 1
- `web/src/components/navigation/mission-control/WorkspaceSwitcher.tsx` — Persona-aware filtering
- `web/src/components/navigation/mission-control/MissionControlRail.tsx` — Persona-aware cycle visibility

### Phase 2
- `web/src/components/navigation/mission-control/PulseMetrics.tsx` — Text brightness
- `web/src/components/navigation/mission-control/CycleIndicator.tsx` — Text brightness
- `web/src/components/navigation/Sidebar.tsx` — Text brightness
- `web/src/components/platform/ObservatoryTab.tsx` — #64748B → #94A3B8
- `web/src/components/platform/PlatformObservatory.tsx` — #64748B → #94A3B8
- `web/src/components/platform/BillingUsageTab.tsx` — #64748B → #94A3B8, 12px → 13px
- `web/src/components/platform/InfrastructureTab.tsx` — #64748B → #94A3B8
- `web/src/components/platform/AIIntelligenceTab.tsx` — #64748B → #94A3B8
- `web/src/components/platform/IngestionTab.tsx` — #64748B → #94A3B8, 12px → 13px
- `web/src/components/platform/OnboardingTab.tsx` — #64748B → #94A3B8, 12px → 13px
- `web/src/components/design-system/AssessmentPanel.tsx` — Heading 16px, body 14px

### Phase 3
- `web/src/components/dashboards/AdminDashboard.tsx` — Dynamic TRANSITION_LABELS

### Phase 4
- `web/src/contexts/period-context.tsx` — API route instead of browser Supabase

### Phase 5
- `web/src/app/admin/launch/plan-import/page.tsx` — 3-step subway indicator

### Phase 6
- `web/src/components/layout/language-switcher.tsx` — Persist to profiles.locale
- `web/src/contexts/locale-context.tsx` — Read from profiles.locale on init

---

*OB-58 — February 17, 2026*
*"The dashboards work. Now make everything around them work too."*
