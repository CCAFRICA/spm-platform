# HF-335 COMPLETION REPORT — Comprehensive Localization Sweep and Repair (Increment 1)

## Date
2026-06-22

## Execution Time
Single session, 2026-06-22 (Phase 1 diagnostic → Phase 2 ADR → Phase 3 es-PE normalization → Phase 4 partial → report/PR).

## Scope Statement
This increment delivers the structural foundation and the majority es-PE normalization sweep. It does NOT claim full PG-2 closure ("zero English-only user-facing strings"). Remaining Type-1 new-string completion, Type-2 locale-threading, and deeper Class B AI prompt localization are deferred to a follow-on HF (scoped in KNOWN ISSUES). Branch: `hf-335-localization-sweep`.

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| `7a86ea25625e8f411fae84c63fed1cbefcbc830b` | 0 | HF-335: directive committed |
| `ff80d43776858d93497e5d71e7317fbfce46d1f6` | 1 | HF-335 Phase 1: localization diagnostic sweep |
| `8b3b6c4e93087f266434a38795c5a12c1134c029` | 2 | HF-335 Phase 2: architecture decision record |
| `64a7809df610aff9612de5cac65a51fec9ccb96e` | 3 | HF-335 Phase 3: normalize Spanish detection to startsWith('es') — es-PE fix (88 files) |
| `9a64b5157a167be171865668d74def800de5d6a1` | 4 | HF-335 Phase 4: AI locale props use isSpanishLocale (es-PE → Spanish AI) |
| _(this commit)_ | 5 | HF-335: completion report (increment 1) |

## FILES CREATED
| File | Purpose |
|------|---------|
| `docs/vp-prompts/HF-335_LOCALIZATION_SWEEP_DIRECTIVE_20260622.md` | The directive (file-is-the-prompt) |
| `docs/diagnostics/HF-335_LOCALIZATION_INVENTORY.md` | Phase 1 inventory + Phase 2 ADR section |
| `docs/completion-reports/HF-335_COMPLETION_REPORT.md` | This report |
| _(no new code files — utilities were added to existing `web/src/lib/i18n.ts`)_ | |

## FILES MODIFIED

### Special handling (not pure sweep)
| File | Change |
|------|--------|
| `web/src/lib/i18n.ts` | Added `isSpanishLocale()` + `localeToLanguageName()` presentation-layer utilities |
| `web/src/contexts/locale-context.tsx` | Added `isSpanish` to context value (computed via util); re-exported both utils |
| `web/src/contexts/navigation-context.tsx` | Replaced exact `=== 'es-MX'` with `isSpanishLocale()` + import (relative-path variant) |
| `web/src/components/navigation/Navbar.tsx` | Replaced exact `=== 'es-MX'` with `isSpanishLocale()` + import (double-quote variant) |
| `web/src/components/navigation/Sidebar.tsx` | Replaced exact `=== 'es-MX'` with `isSpanishLocale()` + import (double-quote variant) |
| `web/src/components/dashboards/ManagerDashboard.tsx` | Sweep + AI panel locale prop `=== 'es-MX' ? 'es':'en'` → `isSpanishLocale(locale) ? 'es':'en'` |
| `web/src/components/dashboards/RepDashboard.tsx` | Sweep + AI panel locale prop → `isSpanishLocale(locale) ? 'es':'en'` |

### Bulk normalization sweep — "Replaced exact `=== 'es-MX'` derivation with `isSpanishLocale()` call" (81 files)
```
web/src/app/admin/access-control/page.tsx
web/src/app/approvals/page.tsx
web/src/app/configuration/locations/page.tsx
web/src/app/configure/people/page.tsx
web/src/app/configure/periods/page.tsx
web/src/app/data/quality/page.tsx
web/src/app/financial/location/[id]/page.tsx
web/src/app/financial/page.tsx
web/src/app/financial/performance/page.tsx
web/src/app/financial/pulse/page.tsx
web/src/app/financial/server/[id]/page.tsx
web/src/app/financial/staff/page.tsx
web/src/app/insights/analytics/page.tsx
web/src/app/insights/compensation/page.tsx
web/src/app/insights/performance/page.tsx
web/src/app/integrations/catalog/page.tsx
web/src/app/notifications/page.tsx
web/src/app/operate/lifecycle/page.tsx
web/src/app/operate/monitor/quality/page.tsx
web/src/app/operate/page.tsx
web/src/app/operate/reconciliation/page.tsx
web/src/app/operations/audits/logins/page.tsx
web/src/app/operations/audits/page.tsx
web/src/app/operations/data-readiness/page.tsx
web/src/app/operations/messaging/page.tsx
web/src/app/operations/rollback/page.tsx
web/src/app/perform/page.tsx
web/src/app/performance/approvals/plans/page.tsx
web/src/app/spm/alerts/page.tsx
web/src/app/workforce/permissions/page.tsx
web/src/app/workforce/personnel/page.tsx
web/src/app/workforce/roles/page.tsx
web/src/app/workforce/teams/page.tsx
web/src/components/access-control.tsx
web/src/components/analytics/BreakdownChart.tsx
web/src/components/analytics/ExportDialog.tsx
web/src/components/analytics/KPICard.tsx
web/src/components/analytics/MetricTrendChart.tsx
web/src/components/analytics/SavedReportsList.tsx
web/src/components/approvals/approval-request-card.tsx
web/src/components/approvals/impact-rating-badge.tsx
web/src/components/bulk/BulkProgressDialog.tsx
web/src/components/bulk/BulkSelectionBar.tsx
web/src/components/charts/leaderboard.tsx
web/src/components/charts/sales-history-chart.tsx
web/src/components/dashboards/AdminDashboard.tsx
web/src/components/data-quality/QualityScoreGauge.tsx
web/src/components/data-quality/QuarantineTable.tsx
web/src/components/design-system/ConfidenceRing.tsx
web/src/components/design-system/ImpactRatingBadge.tsx
web/src/components/design-system/StateIndicator.tsx
web/src/components/financial/ChequeList.tsx
web/src/components/help/HelpPanel.tsx
web/src/components/help/KeyboardShortcutsDialog.tsx
web/src/components/hierarchy/HierarchyNode.tsx
web/src/components/hierarchy/HierarchyViewer.tsx
web/src/components/import/field-mapper.tsx
web/src/components/import/import-summary-dashboard.tsx
web/src/components/layout/language-switcher.tsx
web/src/components/navigation/ChromeSidebar.tsx
web/src/components/navigation/command-palette/CommandPalette.tsx
web/src/components/navigation/mission-control/MissionControlRail.tsx
web/src/components/navigation/mission-control/UserIdentity.tsx
web/src/components/operate/LifecycleCockpit.tsx
web/src/components/permissions/PermissionMatrix.tsx
web/src/components/permissions/RoleEditor.tsx
web/src/components/permissions/UserPermissionCard.tsx
web/src/components/plan-approval/ApprovalWorkflowTimeline.tsx
web/src/components/plan-approval/ReviewerActionsPanel.tsx
web/src/components/plan-approval/SubmitForApprovalDialog.tsx
web/src/components/plan-surface/ComponentCard.tsx
web/src/components/plan-surface/ConsequenceTray.tsx
web/src/components/plan-surface/PlanSurfaceShell.tsx
web/src/components/plan-surface/ProvenancePanel.tsx
web/src/components/rbac/AuditLogTable.tsx
web/src/components/rbac/RoleCard.tsx
web/src/components/rbac/RoleEditorDialog.tsx
web/src/components/rbac/UserRoleAssignments.tsx
web/src/components/search/GlobalSearchDialog.tsx
web/src/components/search/global-search.tsx
web/src/components/user-import/HierarchyReviewPanel.tsx
```
(`ChequeList.tsx` derivation was `const es = locale === 'es-MX'` → `isSpanishLocale(locale)`; the rest were `const isSpanish = … 'es-MX'`, including the admin-coerced `isVLAdmin(user) ? false : …` variants whose English-lock guard is preserved.)

## PROOF GATES — HARD

| # | Criterion (VERBATIM from directive) | PASS/FAIL | Evidence |
|---|-------------------------------------|-----------|----------|
| PG-1 | `npm run build` exits 0 after all phases complete | **PASS** | `BUILD EXIT CODE: 0` · `Failed-to-compile: 0` · `✓ Compiled successfully` · `✓ Generating static pages (205/205)` (full output appended in FINAL BUILD VERIFICATION) |
| PG-2 | Zero English-only user-facing strings in components that render for Spanish-locale tenants | **PARTIAL** | This increment completes es-PE normalization: 88 files now route Spanish detection through `isSpanishLocale()` (was exact `=== 'es-MX'`, which left es-PE tenants in English). Remaining UNRESOLVED (from Phase 1 inventory §2/§3): **Type-1 gaps** (e.g. `app/configure/periods/page.tsx:289,293,326,397,424,436` toasts; `app/financial/staff/page.tsx:348,355,367,396`; `app/acceleration/page.tsx:293,298,302`; `components/drill-through/ComponentCards.tsx:110,130`; `components/drill-through/DisputeInline.tsx:107`; `components/sci/SCIProposal.tsx:188`); **Type-2 files** (no locale access — `app/operate/calculate/page.tsx`, `app/operate/results/page.tsx`, `app/operate/import/quarantine/page.tsx`, `app/configure/users/invite/page.tsx`, `app/insights/my-team/page.tsx`, `app/insights/trends/page.tsx`, `app/financial/leakage/page.tsx`, `app/financial/patterns/page.tsx`, `components/sci/ImportProgress.tsx`, `components/import/import-history.tsx`). Full closure deferred to follow-on HF. |
| PG-3 | Every AI prompt that produces user-facing content includes locale-language instruction | **PARTIAL** | Existing `dashboard_assessment` prompt (`anthropic-adapter.ts:1570`) already carries `Locale: ${input.locale === 'en' ? 'English' : 'Spanish'}`; this increment fixes its FEED so es-PE reaches it (`ManagerDashboard.tsx`/`RepDashboard.tsx`: `locale={isSpanishLocale(locale) ? 'es' : 'en'}`), and `narration` is likewise already localized. Remaining AI surfaces NOT yet localized (Phase 1 Class B inventory §3): `recommendation` (`anthropic-adapter.ts:849/:1541`), `natural_language_query` (`:860/:1557`), `anomaly_detection` explanation (`:827/:1531`), `reconciliation_diagnosis` agent (`reconciliation-diagnosis-agent.ts:14`). `localeToLanguageName()` util is in place for them. |
| PG-4 | Localhost verification: navigate to a Spanish-locale tenant's dashboard, import page, plan view, and at least one AI assessment panel — confirm Spanish rendering | **PARTIAL (code-verified; live browser = architect SR-44)** | Dev server confirmed serving: `✓ Ready in 1406ms` · `Local: http://localhost:3000` · `GET / -> HTTP 307` (app up; unauth → /login). An authenticated Spanish-locale-tenant visual capture requires a logged-in browser session and is the architect's SR-44 verification (headless is auth-gated → 307). Code-level es-PE coverage is proven by PG-6 (the util) + the 88-file sweep routing all Spanish detection through it. No screenshot is fabricated (Rule 27 / AP-10). |
| PG-5 | AP-25: zero language-specific string literals added to foundational code (engine/SCI/calculation) | **PASS** | `grep -rnE "es-MX\|es-PE\|Spanish\|español\|isSpanishLocale" web/src/lib/engine web/src/lib/sci web/src/lib/calculation` → only pre-existing hit `web/src/lib/calculation/__tests__/temporal-binding.test.ts:8` (a test comment "Spanish months" — NOT added by HF-335; not in this branch's diff). `web/src/lib/engine` does not exist. Zero `isSpanishLocale`/literals added by this HF to foundational code; utils live in `lib/i18n.ts` (presentation layer). |
| PG-6 | Locale-to-language mapping utility is extensible and lives in presentation layer | **PASS** | `web/src/lib/i18n.ts`: <br>`export function isSpanishLocale(locale?: string \| null): boolean { return !!locale && locale.toLowerCase().startsWith('es'); }` <br>`export function localeToLanguageName(locale?: string \| null): string { const l = (locale \|\| '').toLowerCase(); if (l.startsWith('es')) return 'Spanish'; if (l.startsWith('pt')) return 'Portuguese'; if (l.startsWith('fr')) return 'French'; return 'English'; }` — prefix-based, one line per locale family (extensible), presentation layer (NOT engine/SCI/calculation). |

## PROOF GATES — SOFT

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| PG-S1 | Translation quality: formal register | N/A this increment | This increment is normalization (detection logic), not new translation strings. No new Spanish prose added; quality applies to the deferred Type-1/Type-2 completion. |
| PG-S2 | Consistency: same concept same term | PASS (mechanism) | Consistency is now enforced structurally — a single `isSpanishLocale()` predicate replaces 6 divergent detection forms (exact es-MX / 2-letter es / admin-coerced / useAdminLocale / tenant-locale), so es-PE behaves identically everywhere. |
| PG-S3 | No truncation/layout breakage | N/A this increment | No string-length changes (detection-only). Applies to deferred new-string work. |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): **PASS** — 6 commits, one per phase/logical group, each pushed.
- Rule 25 (report before final build): **PASS** — report authored, then FINAL BUILD VERIFICATION appended (Step 2).
- Rule 26 (mandatory structure): **PASS** — this file follows the prescribed structure.
- Rule 27 (evidence = paste): **PASS** — PG-1/PG-4/PG-5/PG-6 contain pasted output; PG-2/PG-3 cite exact file:line inventory items.
- Rule 28 (commit per phase): **PASS**.
- AP-25 (Korean Test): **PASS** — PG-5 evidence; utils are presentation-layer prefix predicates, no language keywords in foundational code.
- SR-34 (no bypass — class not instance): **PASS** — es-PE normalization closes the detection class (all 88 derivation sites + the hook), not a single instance. The new-string completion (a separate class) is explicitly deferred, not silently dropped.

## KNOWN ISSUES
1. **Type-1 gaps (new strings needed):** ~8 surfaces with hardcoded English inside already-branched files (toasts/placeholders/titles) — see PG-2 list (`configure/periods`, `financial/staff`, `acceleration`, `drill-through/*`, `sci/SCIProposal`, etc.). These need Spanish branches ADDED (not just normalization).
2. **Type-2 gaps (locale not threaded):** ~10 tenant-facing files with no `useLocale` access — see PG-2 list (`operate/calculate`, `operate/results`, `operate/import/quarantine`, `configure/users/invite`, `insights/my-team`, `insights/trends`, `financial/leakage`, `financial/patterns`, `sci/ImportProgress`, `import/import-history`). Need locale threaded via `useLocale()` then strings branched.
3. **Class B remaining AI surfaces:** `recommendation`, `natural_language_query`, `anomaly_detection`, `reconciliation_diagnosis` agent — per-task `LANGUAGE REQUIREMENT` injection not yet implemented (`localeToLanguageName()` util is ready). pt-BR extension of assessment/narration also pending.
4. **Vestigial t()+JSON layer:** ~259 keys, ~8 usages (Phase 1). Forward-input for the §6A #1 OB (centralized localization migration, AUD-001 F-AUD-008). Not touched.
5. **VL-admin Observatory suite:** `components/platform/*` admin-only surfaces excluded from PG-2 tenant-facing scope ("components that render for Spanish-locale **tenants**"). English on those admin surfaces is not a tenant-facing defect.
6. **Two divergent `Locale` types:** `lib/i18n.ts` (`en-US|es-MX|pt-BR`) vs `types/tenant.ts` (`+es-PE|en-GB|fr-FR`). `isSpanishLocale`/`localeToLanguageName` accept broad `string` to bridge them. Unifying the types is a forward cleanup.

## ARTIFACT SYNC
```
MC:        HF-335 Increment 1 shipped (Phases 1-3 + Phase 4 partial). NEW items discovered:
           Type-1 localization gaps (~8 files), Type-2 locale-threading gaps (~10 tenant-facing files),
           Class B AI prompt localization remaining (recommendation/nlq/anomaly/recon-diagnosis) → follow-on HF.
REGISTRY:  Localization mechanism: 6 divergent Spanish-detection forms collapsed to one shared
           isSpanishLocale() predicate; es-PE tenants now Spanish on all already-branched surfaces.
           Centralized t()+JSON layer recorded as vestigial (259 keys / 8 usages) for the §6A OB.
R1:        Spanish-locale (incl. es-PE) tenant UI — es-PE structural gap CLOSED for already-branched
           surfaces; remaining new-string/Type-2/Class-B gaps tracked (PG-2 PARTIAL).
BOARD:     CAPS — HF-335 status: Increment 1 complete (es-PE normalization + AI feed) / PR open.
SUBSTRATE: T1-E910 (AP-25) PASS (PG-5); T1-E952 (Adjacent-Arm Drift) — detection class swept whole, not
           instance (SR-34); T1-E953 (Decision-Implementation Gap) — locale threaded where missing in the
           swept set; Decision 158 — LLM generates language, code passes locale (Class B util in place).
```

## FINAL BUILD VERIFICATION (Step 2)
Run from repo root after all phases (`kill $(lsof -t -i:3000); rm -rf .next; npm run build`):
```
FINAL BUILD EXIT CODE: 0
 ✓ Compiled successfully
 ✓ Generating static pages (205/205)
Route (app)                                    Size     First Load JS
+ First Load JS shared by all                  88.1 kB
```
PG-1 confirmed: clean production build, exit 0, 205/205 static pages. ("Dynamic server usage" notices during static generation are standard Next.js logs for cookie/searchParams routes, pre-existing across the app — not errors.)
