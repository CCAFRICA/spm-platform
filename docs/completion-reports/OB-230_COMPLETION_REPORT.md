# OB-230 — User Observability Surface — COMPLETION REPORT

**Branch:** `ob-230-user-observability` · **Date:** 2026-06-22 · **Repo:** VP `CCAFRICA/spm-platform`
**Directive:** `docs/vp-prompts/OB-230_DIRECTIVE_20260622.md` · **ADR:** `docs/completion-reports/OB-230_ARCHITECTURE_DECISION_RECORD.md`
**Mode:** ULTRACODE. **Status:** built, type-clean, build-clean, dev-verified. **PR:** https://github.com/CCAFRICA/spm-platform/pull/584 — opened by CC; architect merges + browser-verifies + applies migration (SR-43/SR-44).

> Sequence check (HALT-4): `OB-230` maps uniquely to this objective. The directive file was architect-pre-placed; no competing OB-230 exists (no branch, no completion report). OB-231 (free-form characterization) is a separate, already-merged objective; OB-229 has no directive. Non-sequential build order, but **no collision** → proceeded.

---

## 1. What shipped (vertical slice — data + UI + signals in one PR)

| Layer | Deliverable |
|---|---|
| **Obj 1 — API** | `GET /api/admin/users` (list/search/paginate, composite state) · `GET /api/admin/users/[id]` (deep detail) · 6 audited actions: `force-logout`, `ban`, `unban`, `reset-password`, `reset-mfa`, `resend-confirmation` |
| **Obj 2 — UI** | 7th Observatory tab "Users" → `UsersTab` → `UserListView` + `UserDetailView` (5 panels: Identity, Session Health, Event Timeline, Admin Actions, Journey & Activity) |
| **Obj 3 — Signals** | 3A client error capture (`ClientErrorReporter` + `global-error` reporting), 3B session-churn (middleware reinit hook), 3C navigation breadcrumbs (opt-in) |
| **Foundation** | `web/src/lib/observability/*` (classification, ua-parser, auth-health, admin-action-log, event-queries, api-types, event-types, resolve-target-user) + `authorize-platform-observability` guard |
| **Migration** | `web/supabase/migrations/20260622_ob230_observability.sql` (actor/entity indexes + flag seed) — **architect applies (SR-44)** |

Commits: `0fc45769` directive · `0dbcf933` ADR · `925efe42` Obj1 · `2adbdc79` Obj2 · `789905ba` Obj3 · `<lint>` build fix.

---

## 2. HALT determinations (all four resolved; see ADR §B)

- **HALT-1 (auth.sessions inaccessible):** FIRED. Panel 2 "Session Health" is **inferred from `platform_events`** (`inferSessions()`), not `auth.sessions`. Disclosed in-UI via `sessionHealthNote`. No fabricated session rows.
- **HALT-2 (force-logout):** FIRED. `auth.admin.signOut` needs the user's JWT (unavailable server-side). force-logout calls the **official GoTrue admin logout endpoint** `POST {SUPABASE_URL}/auth/v1/admin/users/{id}/logout?scope=global` (sanctioned Admin API, not raw `auth.*` SQL). Errors surfaced to the admin.
- **HALT-3 (nav-breadcrumb volume):** FIRED (precautionary). 3C is **opt-in, default OFF** via `enable_navigation_tracking`; seed delivered in the migration (PATCH doesn't upsert).
- **HALT-5 (no actor_id index):** FIRED. `(actor_id, created_at DESC)` + `(entity_id, created_at DESC)` indexes delivered in the migration; build proceeds; `indexWarning` surfaced in API responses. **Not applied by CC.**

---

## 3. Per-objective evidence (pasted)

### 3.1 Type-check — 0 errors (whole project)
```
$ npx tsc --noEmit   →   (no output)   [grep -c "error TS" = 0]
```

### 3.2 Build — compiled successfully; all 8 routes present as dynamic functions
```
 ✓ Compiled successfully
├ ƒ /api/admin/users                           0 B                0 B
├ ƒ /api/admin/users/[id]                      0 B                0 B
├ ƒ /api/admin/users/[id]/ban                  0 B                0 B
├ ƒ /api/admin/users/[id]/force-logout         0 B                0 B
├ ƒ /api/admin/users/[id]/resend-confirmation  0 B                0 B
├ ƒ /api/admin/users/[id]/reset-mfa            0 B                0 B
├ ƒ /api/admin/users/[id]/reset-password       0 B                0 B
├ ƒ /api/admin/users/[id]/unban                0 B                0 B
```
("Dynamic server usage" log lines during static generation are standard Next.js notices for cookie/searchParams routes — every `getServerAuthState` route emits them; not errors. Build exit 0.)

### 3.3 Dev server + auth guard (runtime, headless — SR-44 reserves browser to architect)
```
 ✓ Ready in 1405ms   ·   Local: http://localhost:3000
GET /                  → HTTP 307   (app up; unauth → /login)
GET /api/admin/users   → HTTP 401   (authorizePlatformObservability rejects unauthenticated callers)
```
The 401 proves the single shared platform-capability gate works end-to-end at runtime. Authenticated cross-tenant data render + the admin-action audit round-trip are the architect's browser verification (§4).

### 3.4 Pure-logic proofs (Obj 1/2 helpers; §6A named case + Korean Test)
```
UA FxiOS  -> Firefox iOS 152 / iPhone iOS 18.7      ← §6A named test case (exact)
UA Chrome -> Chrome 149 / Windows 10
class auth.login.failure       -> {"kind":"auth","severity":"danger"}
class admin.user.ban           -> {"kind":"admin","severity":"warn"}
class navigation.route_change  -> {"kind":"navigation","severity":"info"}
class future.brand.new (unknown) -> {"kind":"other","severity":"info"}   ← Korean Test: unknown event_type renders automatically
health(banned)     -> problem
health(5 failures) -> problem
health(clean)      -> healthy
```

### 3.5 Objective 3 wiring (code evidence)
- 3A: `app/layout.tsx` mounts `<ClientErrorReporter/>`; `app/global-error.tsx` now POSTs `client.error.unhandled` (previously logged nothing — the exact gap DIAG-076 flagged).
- 3B: `middleware.ts` reinit branch calls `void detectSessionChurn(user.id, null)` right after `auth.session.bookkeeping_reset`.
- 3C: `app/layout.tsx` mounts `<NavigationBreadcrumbs/>` (no-ops until `enable_navigation_tracking` is true).

---

## 4. Architect verification script (browser — SR-44/SR-43)

1. Log in as a platform admin → Observatory (`/select-tenant`) → **Users** tab. Confirm the list renders real users across tenants (BCL / Meridian), each with health dot, parsed device, last sign-in.
2. Search by email/name; filter by role/tenant/health; page next/prev (SR-2 pagination).
3. Click a user → confirm 5 panels render (Identity, Session Health w/ inference note, Event Timeline with prefix colors + anomaly markers, Admin Actions, Journey & Activity).
4. Run an admin action (e.g. **Reset Password** → confirm a recovery link returns; or **Force Logout**). Confirm the action's `admin.user.*` event appears in that user's timeline (audit round-trip — Decision 143).
5. Apply the migration in the SQL Editor; optionally flip `enable_navigation_tracking` to test 3C breadcrumbs.

---

## 5. Compliance & scope
- **AP-17:** new `/api/admin/users` namespace justified vs. tenant-admin `/api/users` (different capability `platform.system_config` vs `tenant.manage_users`+AAL2, cross-tenant vs tenant-scoped, diagnostic vs management). One shared guard + one shared audit writer back every route.
- **Decision 142/143, DS-014, DS-019 §8, SOC 2 CC6:** service-role server-side only; every admin action audit-logged before returning; platform-capability gate. **Korean Test/AP-25:** timeline classification is structural (proof §3.4). **SR-2:** list + timeline paginate. **Channel boundary:** no governance-surface edits; Admin SDK / official admin HTTP API only, never raw `auth.*` SQL.
- **Out of scope (per §6) untouched:** impersonation, tenant-admin user mgmt, RUM, in-platform email, user creation, role/capability edits.

## ARTIFACT SYNC
```
MC:        OB-230 → built/type-clean/build-clean/dev-verified; awaiting architect merge + browser verify + migration apply.
REGISTRY:  User Management → NEW platform-admin observability surface (/api/admin/users + Observatory Users tab).
           Evidence: 8 dynamic routes compiled; 401 unauth guard; admin.user.* audit events.
R1:        "Platform admin can diagnose a user's login issue in-platform" → MET pending architect browser verify
           (replaces the 4-round manual SQL triage that produced HF-331).
BOARD:     CAPS — OB-230 status: BUILT / PR-OPEN / awaiting architect (SR-43 close on prod verify + SHA).
SUBSTRATE: Decision 143 exercised (audit logging extended to admin.user.* actions). DS-014 exercised
           (platform.system_config gate). HALT-1/2/3/5 all fired and resolved (auth.sessions inference;
           GoTrue admin logout endpoint; nav-tracking opt-in; actor_id index migration). global-error now
           reports client errors — closes the no-logging gap DIAG-076 identified.
```

_Final SHA + PR URL appended at PR creation. CC does not merge (SR-44)._
