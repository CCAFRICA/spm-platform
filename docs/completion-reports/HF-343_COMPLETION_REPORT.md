# HF-343 COMPLETION REPORT

## Date
2026-06-24

## Execution Time
Single session. Phase-0 diagnosis (parallel-agent investigation) → Phase 1–3 implementation → adversarial-review hardening → build/proof.

---

## PHASE 0 DIAGNOSIS
- **Diagnosis: (C) Both** — operative cause is **(B)**; the (A) cosmetic-switcher anti-pattern survives but is VL-admin-gated and is not the member-leak mechanism.
- **Evidence summary:** A real member's `/perform` leak is the **absence of scope narrowing** — every ICM read passed `ALL_INSIGHTS_SCOPE` (empty `visibleEntityIds` ⇒ "all") + `tenant_id` only; the authenticated `view.own_results` capability and the `entities.profile_id` linkage were never consulted in the read path. The PDR-05 cosmetic-switcher anti-pattern (scope/menu keyed to `override ?? derivePersona`) does survive in `persona-context.tsx:147` and `navigation-context.tsx:112`, but the switcher UI is gated to VL admins (`VialuceSidebar.tsx:233`), so it cannot widen a real member's scope/menu — and `/perform` ignores `persona-context`'s computed scope entirely. Full pasted evidence + change-map: **`docs/adr/HF-343_PHASE0_DIAGNOSIS_ADR.md`** (committed before code, commit `50c2e20b`).
- **Directive item (3) correction:** the OB-237 `staff_rollup` / `patterns_rollup` / `summary_artifacts_fine` tiers are **NOT reachable from `/perform`** (financial-only — `/financial/staff`, `/financial/patterns`; out of scope §6). The in-scope OB-237 path on `/perform` is the tenant-wide `period_outcomes` rollup sentinel read by `getPeriodTotal`/`getComponentTotals` — now scope-gated.

---

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| `50c2e20b` | 0 | Diagnosis ADR (before code) — (C) both, operative cause (B) |
| `58317967` | 1 | Authenticated-scope resolver + read-layer scope threading |
| `59054360` | 2 | Member surface correctness on /perform |
| `b4c53a09` | 3 | Capability-derive the decide-workspace rail (DS-014 §5.3/§9) |
| `59e58449` | Review | Close 3 residuals found by adversarial review (AgentInbox / ManagerDashboard fail-open / RepDashboard cosmetic-entity) |

---

## FILES CREATED
| File | Purpose |
|---|---|
| `docs/adr/HF-343_PHASE0_DIAGNOSIS_ADR.md` | Phase-0 diagnosis ADR (A/B/C verdict + pasted evidence + change-map) |
| `web/src/hooks/use-auth-scope.ts` | `useAuthScope()` — the single authenticated-scope hook every `/perform` read binds to |
| `docs/completion-reports/HF-343_COMPLETION_REPORT.md` | This report |

## FILES MODIFIED
| File | Change |
|---|---|
| `web/src/lib/drill-through/entity-scope.ts` | `resolveAuthenticatedScope` (role→entity set, fail-closed) + `scopeIsDeny`/`scopeIsNarrowed` predicates |
| `web/src/lib/drill-through/entity-results.ts` | `getEntityResults`: DENY-scope guard → `[]` (never collapse a narrowed-empty set to "all") |
| `web/src/lib/drill-through/index.ts` | Re-export `resolveAuthenticatedScope`/`scopeIsDeny`/`scopeIsNarrowed` |
| `web/src/lib/insights/periods.ts` | `getCalculatedPeriods(tenantId, scope?, …)` — thread scope to per-period reads |
| `web/src/lib/insights/intelligence-data.ts` | `getPeriodTotal(tenantId, periodId, scope?, …)` — narrowed scope bypasses tenant sentinel |
| `web/src/lib/insights/distribution.ts` | `getComponentTotals(tenantId, periodId, scope?, …)` — narrowed scope bypasses tenant sentinel |
| `web/src/app/perform/page.tsx` | Consume `useAuthScope`; scope all loaders; capability-gate org panels; sub-dashboards by capability; HALT-C unlinked state |
| `web/src/lib/data/persona-queries.ts` | `getRepDashboardData`: rank/total via aggregate COUNT (no raw peer rows to browser); leaderboard dropped; `buildRelativeNeighbors` removed |
| `web/src/components/dashboards/RepDashboard.tsx` | Reads authoritative `entityId` prop (not cosmetic persona); rank pill → anonymized quartile; AgentInbox removed (unscopable) |
| `web/src/components/dashboards/ManagerDashboard.tsx` | Team drill-through scope via fail-CLOSED `resolveAuthenticatedScope('manager',…)` (was fail-open `resolveEntityScope`) |
| `web/src/lib/navigation/workspace-config.ts` | `/perform`→`view.own_results`, `/insights*`→`view.team_results` (removes §9 role-array fallback) |

---

## PROOF GATES
| # | Criterion (VERBATIM from directive) | PASS/FAIL | Evidence |
|---|---|---|---|
| PG-0 | Phase 0 diagnosis stated (A/B/C) | **PASS** | ADR `50c2e20b`; diagnosis **(C)**, operative **(B)**. Pasted loader query (`perform/page.tsx:164-167`), `ALL_INSIGHTS_SCOPE` (`periods.ts:15`), persona resolution (`persona-context.tsx:147`), grep `effectivePersona\|usePersona`. |
| PG-1 | `profile_scope` reader presence/absence in `/perform` path | **PASS** | Reader EXISTS (`entity-scope.ts:22 resolveEntityScope`) but was NOT consumed by `/perform` (page read `ALL_INSIGHTS_SCOPE`). Now consumed via `resolveAuthenticatedScope`→`resolveEntityScope` for managers. |
| PG-2 | Single authenticated-scope resolver exists, consumed by all `/perform` reads | **PASS** | `resolveAuthenticatedScope` (`entity-scope.ts`) via `useAuthScope` (`use-auth-scope.ts`). Call sites: `perform/page.tsx` (4 loaders), `ManagerDashboard.tsx` (drill-through). |
| PG-3 | No non-admin `/perform` read filters by `tenant_id` alone | **PASS** | `getCalculatedPeriods/getPeriodTotal/getComponentTotals/getEntityResults` all receive `authScope`; narrowed scope `.in('entity_id', scoped)` / bypasses sentinel. `getRepDashboardData` peer rows replaced by aggregate COUNT. |
| PG-4 | Member surface: org-wide panels removed or gated | **PASS** | `{canViewTeam && …}` gates Entities-Paid/Avg/Top-Result tiles + Period-Finding + DistributionPosition + Lifecycle + AI-stub; `{canViewAll && …}` gates ValidityVerdict (`perform/page.tsx`). |
| PG-5 | Relative position anonymized or hidden for member | **PASS** | `quartileLabel()` (RepDashboard) renders "Top quartile / Above average / …" — no rank#, no count; peer leaderboard hidden (`neighbors=[]`); peer payouts never fetched (`persona-queries.ts` COUNT path). |
| PG-6 | Sidebar derived from `hasCapability`, not hardcoded persona | **PASS** | `getWorkspaceRoutesForRole`→`hasCapability` (single PDP); `/perform`→`view.own_results`, `/insights*`→`view.team_results` (`workspace-config.ts`). |
| PG-7 | No dead-end navigation: every visible item resolves for the viewing role | **PASS** | See "BROWSER VERIFICATION STEPS" role tables. RequireCapability-guarded pages are excluded from the member rail by their `requiredCapability` (no Access-Restricted reachable). |
| PG-8 | FP-49 SQL verification gate (only if ANY SQL written) | **N/A** | **No SQL written.** App-layer read-scope filtering only; no migrations, no RLS, no DDL. |
| PG-9 | `npm run build` exits 0 | **PASS** | `BUILD EXIT CODE: 0`; "✓ Compiled successfully"; "✓ Generating static pages (210/210)". |
| PG-10 | `localhost:3000` responds after clean build | **PASS** | `npm run dev` → `/login` HTTP 200, `/` HTTP 307→/login (unauth redirect). |
| PG-11 | PR created | **PASS** | https://github.com/CCAFRICA/spm-platform/pull/600 |

---

## STANDING RULE COMPLIANCE
- **Rule 25: Report created before final build** — PASS (this report written, then the final `npm run build` re-run).
- **Rule 26: Mandatory structure followed** — PASS.
- **Rule 27: Evidence = paste, not describe** — PASS (ADR carries verbatim code; proof gates cite file:line).
- **Rule 28: Commit per phase** — PASS (5 commits: ADR, P1, P2, P3, review-hardening).
- **SR-34: Structural fix, no workaround** — PASS (scope made intrinsic to the read path — Decision 123 — keyed off authenticated role — Decision 39; no per-surface band-aids).
- **DS-014 §9: No per-route role arrays** — PASS (member-facing routes converted from `roles:[]` fallback to `requiredCapability`; filter remains the single `hasCapability` PDP).
- **SR-43 (browser-verified on production):** PENDING — code/build/dev verified; production browser verification by architect (member/manager/admin logins) per steps below. No status moved on localhost/merge alone.

---

## ARTIFACT SYNC
```
ARTIFACT SYNC
MC: HF-343 → IMPLEMENTED (P0 diagnosis + P1 resolver + P2 member surface + P3 menu + review hardening); browser-verify pending (SR-43).
    New item discovered (P0): /api/platform/agent-inbox lacks session-tenant binding + role gate → follow-on route-hardening item.
    New item discovered (review): manager fail-open (OB-226 C) superseded by fail-closed resolveAuthenticatedScope — confirm BCL/MIR demo managers now team/own-scoped (intended least-privilege).
REGISTRY: Access Control / Persona Scoping row → add evidence "/perform reads keyed off authenticated profiles.role via resolveAuthenticatedScope (Decision 39)".
          PDR-05 → CLOSE with evidence: operative /perform leak was (B) absence-of-scope (now scoped); residual (A) derivations are VL-admin-gated, non-widening for real users.
R1: tenant-isolation criterion → still MET (no cross-tenant change; reads add intra-tenant entity narrowing).
    access-control criterion → ADVANCED: member/manager view-scope now enforced at the /perform read + panel layer (app-layer; DB RLS = residual #2).
BOARD: Access Control / Perform surface row → CAPS: member=own-only verified-in-code; manager=team fail-closed; admin=tenant unchanged.
SUBSTRATE: Exercised DS-014 §4.4/§5.3/§9, Decision 39, Decision 123, Korean Test.
           Capture candidate (CONFIRMED by P0): "cosmetic-switcher-as-security-boundary" anti-pattern — scope/menu derived from a persona override rather than authenticated profiles.role; safe only because the switcher is VL-admin-gated. Recommend a substrate note: derive scope from authenticated identity; a switcher may only select among entitled views.
```

---

## KNOWN ISSUES
1. **`/api/platform/agent-inbox` route authz gap (HIGH, pre-existing, documented not fixed).** The route uses a service-role client, trusts the query-param `tenantId`, and applies NO session/role check — a member could `curl ?tenantId=<theirs>&persona=admin` and receive admin-persona inbox items (org-aggregate descriptions). HF-343 removed AgentInbox from the **member surface** (the rendered exposure), but the route remains unguarded. Recommended follow-on: derive `tenantId` from the authenticated session and gate the requested `persona` by capability (`admin`→`view.all_results`, `manager`→`view.team_results`, `rep`→`view.own_results`). Out of the `/perform` surface scope; a platform-route hardening item.
2. **`/insights/*` page-level direct-URL scoping (MED, OB-234 scope).** HF-343 removed the org-analytics `/insights/*` items from the member rail (Phase 3), but the pages themselves have no per-page capability guard — a member typing the URL directly would still render org analytics. Page-level scoping of `/insights/*` is OB-234 (Performance Agent visualization) territory per §6.
3. **`getRepDashboardData(tenantId, null)` demo fallback.** When `entityId` is null it falls back to the top-performing entity (VL-admin demo). On `/perform` this is unreachable for a real member (the page `isDenied` guard returns the unlinked state before mounting RepDashboard, and the page now passes the authoritative `ownEntityId`). Noted for defense-in-depth.

---

## BROWSER VERIFICATION STEPS (for architect)

### Login as member (a tenant user whose `profiles.role` resolves to `member`/`sales_rep`, with `entities.profile_id` linked to their own entity)
- **Expected data visible:** own Period Total (HeroMetric, labelled "My Compensation"), own component breakdown (StackedBar "My Compensation by Component"), own RepDashboard (hero payout, scenarios, what-if, trajectory, own InsightPanel/AssessmentPanel/NextAction), an **anonymized quartile** badge (e.g. "Top quartile").
- **Expected menu items:** Intelligence agent → `/stream`, `/perform`; Compensation agent → Commission Statement (`/perform/statements`); (Notifications). NO Insights analytics sub-pages.
- **Expected hidden:** Entities-Paid / Average-Payout / Top-Result tiles; Period-Finding card; Payout Distribution; Period Lifecycle; AI Findings; Data Quality (ValidityVerdict); peer leaderboard; "#rank of N"; AgentInbox; `/insights/*`; Operate / Configure / Admin.
- **HALT-C check:** a member whose entity is NOT linked (`entities.profile_id` null) sees the "Your results aren't linked yet" state — NEVER tenant data.

### Login as manager (`profiles.role` manager; `profile_scope.visible_entity_ids` = their team)
- **Expected data visible:** team-scoped Period Total / component totals / Payout Distribution / Period-Finding (the entity set in `profile_scope`), ManagerDashboard team leaderboard via the team drill-through.
- **Expected menu items:** Intelligence (`/stream`, `/perform`, Insights), Statements, approvals/disputes surfaces they hold; NO Import/Calculate/Configure.
- **Expected hidden:** Data Quality (ValidityVerdict, tenant batch — `canViewAll` only); AdminDashboard; tenant-wide aggregates. **Unscoped manager (no `profile_scope` row):** drill-through now shows own/empty (fail-closed) — NOT the whole tenant (was OB-226 C fail-open).

### Login as admin (`profiles.role` admin or platform)
- **Expected data visible:** tenant-wide Period Total (rollup sentinel), all org tiles, Payout Distribution, Period-Finding, Data Quality, AdminDashboard — **byte-identical to pre-HF-343** (scope = ALL).
- **Expected menu items:** full workspace access (Intelligence, Compensation, Finance if licensed, Platform Core).

### VL-admin persona switcher (platform admin only)
- Switching to "Rep"/"Manager" narrows the view to that entitled persona (demo); a sample entity is used when the VL admin has no linked entity; switching never DENYs the entitled platform admin.

---

## VERIFICATION SCRIPT OUTPUT

### `npm run test`
```
ℹ tests 294
ℹ pass 294
ℹ fail 0
```

### `npm run build`
```
BUILD EXIT CODE: 0
 ✓ Compiled successfully
 ✓ Generating static pages (210/210)
ƒ /perform   30.9 kB   438 kB
```

### `npm run dev` → localhost:3000
```
✓ Ready in 1033ms
GET /login 200
/ -> HTTP 307   (unauthenticated → /login, as expected)
```

### `npx tsc --noEmit`
```
0 errors
```

### `grep -rn fetchRawDataServer web/src`  (HALT-D)
```
(no matches — confirmed deleted, OB-237)
```

### PR
https://github.com/CCAFRICA/spm-platform/pull/600
