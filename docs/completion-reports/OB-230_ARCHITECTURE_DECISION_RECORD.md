# OB-230 — Architecture Decision Record (Section B gate)

**Committed BEFORE any source modification** per `CC_STANDING_ARCHITECTURE_RULES.md` Section B.
**Branch:** `ob-230-user-observability` · **Date:** 2026-06-22 · **Directive:** `docs/vp-prompts/OB-230_DIRECTIVE_20260622.md`

This ADR records the Phase-0 interface verification, premise corrections, the four HALT determinations, the Anti-Pattern Registry (Section C) check, and the chosen architecture for each objective.

---

## A. Phase-0 verified interfaces (Mandatory Interface Verification — read-before-build)

| Concern | Verified fact (file:line) |
|---|---|
| Observatory host | `web/src/app/select-tenant/page.tsx` → `<PlatformObservatory/>` (client; gates on `isVLAdmin`, `role==='platform'`) |
| Tab registry | `web/src/components/platform/PlatformObservatory.tsx`: `TabId` union (L38), `TABS[]` (L40-47), `lazy()` imports (L30-36), conditional render block (L161-167); **local `useState` switching, no router** |
| Visual vocabulary | Observatory uses **inline styles on `--strag-*` tokens** (NOT shadcn). `--strag-deep` #020617 (bg), `--strag-panel` #0F172A (card), `--strag-s8` #1e293b (border), text ramp `--strag-s0`→`--strag-s4`; accents indigo `#7B7FD4/#4845E4`, gold `#E8A838`, status green `#10B981`/amber `#F59E0B`/red `#EF4444`/blue `#60A5FA`. Match `ObservatoryTab.tsx` card patterns. |
| `platform_events` schema | `web/src/lib/events/schema.sql:4-13`: `id, tenant_id(NULLABLE), event_type(TEXT), actor_id(UUID,NULLABLE), entity_id, payload(JSONB — NOT "metadata"), processed_by, created_at` |
| `platform_events` indexes | `idx_*_tenant`, `idx_*_type`, partial `(tenant_id,created_at DESC)`. **NO `actor_id` index** → HALT-5 |
| Event logger | `web/src/lib/auth/auth-logger.ts`: `logAuthEvent(type,payload,actorId?,tenantId?)` server service-role insert; `logAuthEventClient(type,payload)` → `POST /api/auth/log-event`; dedup `Map` keyed on `eventType` only, 5000ms, client-only |
| Client log route | `web/src/app/api/auth/log-event/route.ts` — service-role insert, enriches `payload.ip`/`payload.user_agent`/`payload.email` server-side, resolves actor from cookies |
| Service-role client | `createServiceRoleClient()` (`web/src/lib/supabase/server.ts:49`, async); caller id via `createServerSupabaseClient()` (L13) |
| Platform guard | `hasCapability(role,'platform.system_config')` (`web/src/lib/auth/permissions.ts`) — **alias-safe** (handles `vl_admin`); role `'platform'` canonical |
| Supabase SDK | `@supabase/supabase-js@2.95.3` — `listUsers`, `getUserById`, `updateUserById`, `generateLink`, `mfa.listFactors`, `mfa.deleteFactor` present; `signOut(jwt,scope)` requires a **JWT** |
| profiles | `001_core_tables.sql:39` + `preferences jsonb` (HF-309); `tenant_id` nullable |
| audit_logs | `003_data_and_calculation.sql:344`: `tenant_id, profile_id(FK dropped), action, resource_type, resource_id, changes(jsonb), metadata(jsonb), ip_address(inet), created_at` — **columns are `resource_type/resource_id/changes`, filter by `profile_id`** (directive §1 said `entity_type/details/actor` — corrected) |
| user_journey | `web/src/lib/training/schema.sql:4`: `user_id(=auth user id, no FK), tenant_id, milestone, completed_at, metadata` |
| Existing user UI | `web/src/components/users/UserAdminConsole.tsx` + `/api/users` (`authorizeUserMgmt`, AAL2 + `tenant.manage_users`, tenant-admin scope) — a DIFFERENT surface (see AP-17 below) |
| Middleware churn hook | `web/src/middleware.ts` `resolveSessionOwnership` → `ownership.reinit` branch already emits `auth.session.bookkeeping_reset` via `logAuthEvent` |
| Platform settings | `platform_settings(key,value jsonb)`; read via `createServiceRoleClientSafe().from('platform_settings').select('value').eq('key',…).maybeSingle()`; **PATCH does not upsert → a new flag row must be seeded by migration** |
| UA parser | none exists — must add |
| Client error capture | none (`global-error.tsx`/`error.tsx` are display-only; no `window.onerror`/`unhandledrejection`/ErrorBoundary) — must add |

### Premise corrections (directive vs. live code)
1. Observatory has **6 tabs** (command-center, intelligence, ai-models, ai-cost, revenue, settings) — not the 5 named in §1. The "Users" tab is the **7th**.
2. `platform_events` metadata column is **`payload`**, not `metadata`.
3. `audit_logs` uses `resource_type/resource_id/changes` and `profile_id` (not `entity_type/entity_id/details/actor_id`).
4. A platform user-admin surface already exists (`/api/users` + `UserAdminConsole`) — see AP-17 disposition.

---

## B. HALT determinations

- **HALT-1 (auth.sessions) — FIRES.** No access, no precedent, and the Admin SDK exposes no "list sessions for user". **Decision:** Panel 2 "Session Health" is sourced by **inference from `platform_events`** (login.success / logout / session.expired.* / bookkeeping_reset / session_churn / mfa.verify.*), NOT from `auth.sessions`. The MFA-step-up signal ("aal1 when aal2 required") is derived from `auth.mfa.verify.*` and the user's MFA-factor state. Named gap in §6A; no fabricated session rows.
- **HALT-2 (force-logout) — FIRES.** `auth.admin.signOut(jwt,scope)` requires the user's access token (unavailable server-side); the JS SDK has no `signOut(userId)`. **Decision:** the force-logout route calls the **official GoTrue admin logout HTTP endpoint** `POST {SUPABASE_URL}/auth/v1/admin/users/{id}/logout?scope=global` with the service-role bearer (the sanctioned Admin API the Supabase dashboard itself uses — **NOT** a raw `auth.*` SQL write, which the channel boundary forbids). On non-2xx, the Supabase error detail is surfaced to the admin. Documented as a limitation/alternative per HALT-2.
- **HALT-3 (nav-breadcrumb volume) — FIRES (precautionary).** Route-change events are the highest-volume addition. **Decision:** Objective 3C ships **opt-in, default OFF**, gated by platform setting `enable_navigation_tracking`. Client logger no-ops unless the flag reads true. A seed migration (`INSERT … ON CONFLICT DO NOTHING`) is delivered for the architect to apply (SR-44), because `platform_settings` PATCH does not upsert. Same-route-within-2s dedup applied client-side.
- **HALT-5 (actor_id index) — FIRES.** **Decision:** deliver `CREATE INDEX CONCURRENTLY idx_platform_events_actor_created ON platform_events(actor_id, created_at DESC)` as a migration for the architect to apply (SR-44). Build proceeds; timeline/detail queries cap at LIMIT and the perf risk-at-scale is noted in the completion report. Not applied by CC.

---

## C. Anti-Pattern Registry check

- **AP-17 (one pipeline, one entry point).** The existing `/api/users` + `UserAdminConsole` is **tenant-admin user *management*** (`authorizeUserMgmt`: AAL2 step-up + `tenant.manage_users`, tenant-scoped, create/role/enable/disable). OB-230 is **platform-admin *diagnostic observability*** (`platform.system_config`, cross-tenant, composite read + remediation). Different capability, scope, and purpose → a distinct namespace `/api/admin/users/` is justified, **not** duplication. Mitigation against drift: a **single shared guard** (`authorizePlatformObservability()`) and a **single shared audit writer** (`logAdminUserAction()`) back every route — one auth path, one audit path. Overlapping semantics (ban≈disable) are documented; OB-230 does not re-expose tenant-admin management here.
- **AP-25 (no hardcoded field names) / Korean Test.** The event timeline classifies events for color/icon by **structural prefix** (`auth.` / `tenant.` / `admin.` / `client.` / `navigation.` / `identity.` + `*.failure`/`*.denied`/`*.error` → danger, `*.success` → ok) computed by `classifyEventType()`, never by an enumerated literal list. New event types render automatically. Auth-health synthesis uses structural rules over signal counts, not a status enum.
- **AP-9/AP-10 (no false attestation).** Completion report pastes route responses, audit-trail round-trips, and `npm run build` output; HALT items are reported, not papered over.

---

## D. Architecture per objective

**Shared foundation (`web/src/lib/observability/`):**
- `event-classification.ts` — `classifyEventType(type)` → `{ kind, severity }` by structural prefix (Korean Test); pure, no I/O.
- `ua-parser.ts` — `parseUserAgent(ua)` → `{ browser, os, label }`; structural token rules incl. the FxiOS named case (§6A).
- `auth-health.ts` — `synthesizeAuthHealth(signals)` → `{ status: 'healthy'|'attention'|'problem', reasons[] }` by structural rules.
- `admin-action-log.ts` — `logAdminUserAction(serviceClient, { action, actorId, targetUserId, tenantId, ip, userAgent, success, detail })` → service-role insert of `admin.user.{action}` into `platform_events`. **Every Objective-1C route calls this before returning** (audit not optional).
- `event-types.ts` — `ObservabilityEventType` union for the new `admin.user.*`, `client.error.unhandled`, `platform.user.session_churn`, `navigation.route_change` literals (typing only; UI never switches on them).

**Auth guard (`web/src/lib/auth/authorize-platform-observability.ts`):** mirrors `authorizeUserMgmt` shape (`{ok,caller}|{ok:false,status,error}`) but gates on `hasCapability(role,'platform.system_config')` via `getServerAuthState()`; no AAL2 step-up (reads + platform-scoped remediation; directive requires the platform capability, not step-up — noted as a future hardening option).

**Event-logger generalization (`auth-logger.ts`):** widen the client path to `logAuthEventClient(type: AuthEventType | ObservabilityEventType, payload, dedupKey?)` — `dedupKey` lets navigation key dedup on `type+pathname` (satisfying 3C's same-route-2s rule) instead of the coarse type-only 5s guard. Server admin writes use `logAdminUserAction` (above). Reuses the existing `/api/auth/log-event` insert + IP/UA enrichment. The route's runtime `eventType` presence check is unchanged; the closed-union narrowing is relaxed to accept the new prefixes.

**Objective 1 — `/api/admin/users/`:** `route.ts` (GET list/search composite), `[id]/route.ts` (GET detail), and 6 action routes (`force-logout`, `ban`, `unban`, `reset-password`, `reset-mfa`, `resend-confirmation`). All call `authorizePlatformObservability()` first and `logAdminUserAction()` before returning. List composes `profiles` + `auth.admin.listUsers` (paged) + per-user MFA (`mfa.listFactors`) + a batched recent-event summary; SR-2 pagination on the list and on the event reads.

**Objective 2 — Observatory "Users" tab:** add the 7th tab (4 edits in `PlatformObservatory.tsx`). New `components/platform/UsersTab.tsx` host with list/detail view state; `users/UserListView.tsx` (search/filter/health/paginate) and `users/UserDetailView.tsx` composing 5 panels (`IdentityCard`, `SessionHealth`, `EventTimeline`, `AdminActions`, `JourneyActivity`). All styled with the `--strag-*` inline vocabulary. Timeline paginates/caps (no DOM-dump), parses UA, highlights anomalies by structural rule, renders prefix-derived color. Every action button confirms before firing.

**Objective 3 (parallel with O2):**
- 3A: `components/observability/ClientErrorReporter.tsx` — mounted in root layout; `window.onerror` + `unhandledrejection` → `logAuthEventClient('client.error.unhandled', …)` (truncated stack, pathname). global-error.tsx also reports its caught error.
- 3B: `lib/observability/session-churn.ts` `detectSessionChurn(actorId, tenantId)` — counts session-establishment events in a 5-min window; emits `platform.user.session_churn` at ≥3. Called fire-and-forget from the middleware `reinit` branch.
- 3C: `components/observability/NavigationBreadcrumbs.tsx` — `usePathname` effect → `logAuthEventClient('navigation.route_change', {pathname,from}, type+pathname)`; **no-ops unless `enable_navigation_tracking` flag is true** (read via a small public flag check). Default OFF.

**Migrations delivered for architect (SR-44, NOT applied by CC):**
`web/supabase/migrations/20260622_ob230_observability.sql` — the `actor_id` index (HALT-5) + the `enable_navigation_tracking` settings seed (HALT-3).

---

## E. Vertical-slice & channel compliance
Every API route built is consumed by a rendered panel in the same PR (no data-only/UI-only split). CC creates routes/components/types only; does not edit governance surfaces; uses the Supabase Admin SDK / official admin HTTP API via service-role, never raw `auth.*` SQL. CC opens the PR; the architect merges + browser-verifies + applies migrations (SR-43/SR-44).
