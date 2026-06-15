# OB-211 Phase C — RLS Verification Runbook (EXECUTABLE)

**Authored:** 2026-06-15 · **Type:** OB-211 Phase C — defense-in-depth / RLS verification, as a step-by-step runbook.
**Supersedes:** the abstract Phase C plan on #522. **Branch:** `ob211-phaseC-rls-runbook` (docs only; no production code change).
**Who runs it:** the architect, with real credentials. CC's sandbox is cut off from a live *authenticated browser session*, so CC filled every blank from the live schema + service-role data; the architect executes.

> **How to read this:** every value below was READ from the live system on 2026-06-15 (project `bayqxeiltnpjrvflksfa`). Two values CC genuinely cannot obtain — the **deployed URL** and the **account passwords** — are marked **`[ARCHITECT-SUPPLIED]`** with exactly where to get them. Nothing is fabricated.

---

## §0 — SITUATION (read this first — it changes the test target)

CC probed the live DB (read-only, service-role + anon). Three findings reshape the test:

1. **BCL cannot be the live-login target.** "Banco Cumbre del Litoral" (`b1c2d3e4-aaaa-bbbb-cccc-111111111111`) has **data but ZERO tenant users** — no admin, no manager, no rep; `profile_scope` is empty; all 85 entities have `profile_id=NULL`. You cannot "log in as a BCL manager" because none exists. (This is the **HALT-SCOPE-DEMO gap**, same root cause.) BCL is still used below for the RLS *readout* and as the cross-tenant "should-be-denied" target.

2. **The executable target is "Sabor Grupo Gastronomico"** (`f7093bcc-e90b-4918-9680-69da7952dd65`) — the only tenant with a real **manager + admin + member** AND the data the test needs (43,875 `pos_cheque` rows, a brand/location hierarchy). All three tests below run against Sabor.

3. **No scoped manager exists anywhere** (every tenant: `profile_scope` empty / no `manages` edges). Sabor's manager `gerente@saborgrupo.mx` has **no linked entity and 0 `manages` edges**, so its graph-derived scope materializes **empty** → fail-closed → the manager currently sees **nothing**. **You must seed a scope first** — see **§2.5 PRECONDITION**. (This seeding is the same artifact HALT-SCOPE-DEMO needs.)

**Headline finding (knowable from code, to be confirmed by TEST 2/3):** the data-read API routes use the Supabase **service-role client, which bypasses RLS entirely** (`web/src/lib/supabase/server.ts` → `createServiceRoleClient()` uses `SUPABASE_SERVICE_ROLE_KEY`). The financial route additionally performs **no caller validation at all** (`web/src/app/api/financial/data/route.ts:1280`). The database's RLS is real but enforces **tenant isolation only — there is no entity/manager-scope policy** (§4). So manager-scoping lives **only** in the UI. The deep question Phase C answers: *when a user goes around the screens, does anything still filter?* — answered per-test below.

---

## §1 — THE SCOPE-GATED TABLES (live RLS status)

Core three named in the comprehensive directive: **`calculation_results`, `committed_data`, `entities`**. CC confirmed the other tenant/entity-scoped sensitive stores from the schema. **All have RLS ENABLED** (verified against migrations + the live anon probe in §4).

| # | Table | Holds | RLS enabled? | SELECT policy (code-side) | Live anon probe (no session) |
|---|---|---|---|---|---|
| 1 | `calculation_results` | per-entity pay outputs | ✅ | `tenant_id IN (caller's tenant)` + `*_select_vl_admin` | **0 rows** (denied) |
| 2 | `committed_data` | raw imported rows (cheques, txns) | ✅ | `tenant_id IN (caller's tenant)` + vl_admin | timeout on count — **never returns data** |
| 3 | `entities` | people/teams/locations | ✅ | `tenant_id IN (caller's tenant)` + vl_admin | **0 rows** (denied) |
| 4 | `entity_period_outcomes` | per-entity per-period payout | ✅ | `tenant_id IN (caller's tenant)` + vl_admin | **0 rows** (denied) |
| 5 | `approval_requests` | approval workflow | ✅ (013/022) | tenant-scoped | **0 rows** (denied) |
| 6 | `audit_logs` | audit trail | ✅ | `tenant_id IN (caller's tenant)` + vl_admin | **0 rows** (denied) |
| + | `profile_scope` | the manager-scope store itself | ✅ | own row (`profile_id`) + admin (tenant) + vl_admin | **0 rows** (denied) |
| + | `periods`, `rule_sets`, `calculation_batches`, `entity_period_outcomes`, `period_entity_state` | scoped config/results | ✅ | `tenant_id IN (caller's tenant)` + vl_admin | **0 rows** (denied) |

**Interpretation of the live anon probe:** an unauthenticated client gets **0 rows** on every table while the service-role control returns rows from the same tables → **RLS is on and denying** the anonymous role. The remaining question — *what an authenticated, non-vl_admin user sees* — is TEST 3.

---

## §2 — THE FILL-INS (real accounts, IDs, URL, endpoint, auth)

### 2.1 — Test accounts (live, named)

Project: `https://bayqxeiltnpjrvflksfa.supabase.co`

| Role in test | Email | Role (DB) | `profile_id` | Password |
|---|---|---|---|---|
| **Scoped manager** (subject) | `gerente@saborgrupo.mx` | `manager` | `07fa3350-a7fb-4404-b983-86ab1b726174` | **[ARCHITECT-SUPPLIED]** |
| **Admin** (contrast: sees all of tenant) | `admin@saborgrupo.mx` | `admin` | `dad5ab3d-cf94-4430-9b47-a88a74028e36` | **[ARCHITECT-SUPPLIED]** |
| **Member / rep** (sees own only) | `mesero@saborgrupo.mx` | `member` | `e555dff1-944e-448b-9407-6144a133f9f0` | **[ARCHITECT-SUPPLIED]** |
| **Platform / vl_admin** (sees all tenants) | `platform@vialuce.com` (or `eoadmin@vialuce.com`, `tdadmin@vialuce.com`) | `platform` (vl_admin) | `9c179b53-c5ee-4af7-a36b-09f5db3e35f2` | **[ARCHITECT-SUPPLIED]** |

> **Passwords:** CC cannot read them (write-only in Supabase Auth). Get/reset them in the Supabase dashboard → Authentication → Users (filter by the email) → "Send recovery"/"Reset password", or set a known password there. Dashboard: `https://supabase.com/dashboard/project/bayqxeiltnpjrvflksfa/auth/users`.

### 2.2 — Tenant + entity IDs (live)

| Thing | Value |
|---|---|
| **Test tenant** — Sabor Grupo Gastronomico | `f7093bcc-e90b-4918-9680-69da7952dd65` |
| **Cross-tenant "should-be-denied" tenant** — BCL | `b1c2d3e4-aaaa-bbbb-cccc-111111111111` |
| **IN-SCOPE targets** — "Cocina Dorada" brand locations (cheques key on `location` entities) | Polanco `998232f0-d0be-4c55-85b2-590bacec5198` · Querétaro `6a03bfe7-56bd-487a-b35a-b98e45228112` · Monterrey `3a17faa3-face-4afd-b18a-67f4bf67afa6` · Puebla `acf9329f-072f-4507-9071-b0b125b45e73` · Oaxaca `2ae38f4e-a17e-48d2-a42f-fb6ed5a09b4b` |
| **OUT-OF-SCOPE target** — another brand ("Taco Veloz") | Taco Veloz Condesa `32f589cc-12cf-4945-a330-03dbec217d4d` |
| Brand team entities (for seeding) | Cocina Dorada `168a9baa-c793-4258-8483-769bf277ee11` · Taco Veloz `ed2c0fe7-019f-407a-84db-d12774be6d1f` |
| Sabor period (closed) | "Enero 2024" `849991e5-396e-4b06-ba39-c760383bad1b` |

> **Why locations, not people:** Sabor's `pos_cheque` rows carry `entity_id = a location` (12 distinct locations on the sample). The route filters cheques by `scopeEntityIds.includes(c.entity_id)`, so the scope set must contain **location** IDs.

### 2.3 — The deployed URL + the endpoint

- **Base URL:** the repo only contains `NEXT_PUBLIC_APP_URL=http://localhost:3000`. The **real deployed (Vercel) URL is `[ARCHITECT-SUPPLIED]`** — it's the URL in your browser's address bar when you're logged into the live app (Vercel dashboard → spm-platform → Domains). Substitute it for `<BASE>` below. (To run against local dev instead, use `http://localhost:3000` with `npm run dev`.)
- **Endpoint under test:** `POST <BASE>/api/financial/data`
  - **Body:** `{ "tenantId": "<uuid>", "mode": "summary", "scopeEntityIds"?: ["<entity-uuid>", ...] }`
    (other optional fields: `granularity`, `locationFilter`, `locationId`, `serverId`; `mode` ∈ `network_pulse|leakage|performance|staff|timeline|patterns|summary|products|location_detail|server_detail`).
  - **Source of truth:** `web/src/app/api/financial/data/route.ts:1280-1319`.

### 2.4 — How it authenticates (this is HOW you send the request)

- **Middleware** (`web/src/middleware.ts:160-166`): a request to `/api/financial/data` **without a valid session → `401 {"error":"Unauthorized"}`** (it is NOT a public path). So you must send the request **with a logged-in user's session cookie**.
- **The route itself** does **no** auth/tenant check (`route.ts:1280` reads `body.tenantId` and goes straight to a service-role fetch). So *any* authenticated session is accepted, regardless of which tenant the caller belongs to or whether `scopeEntityIds` are theirs.
- **Practical way to send it as the logged-in user:** log into `<BASE>` as the account, open DevTools → Network, do any action that loads `/financial`, find the `POST /api/financial/data` request → right-click → **Copy → Copy as fetch** (or "Copy as cURL"). That copies the request *with the session cookie*. Then edit the JSON body per each test and re-send (paste the fetch into the DevTools Console, or the cURL into a terminal).

---

## §2.5 — PRECONDITION (REQUIRED): seed a usable scoped manager

**Why:** §0/finding 3 — `gerente@saborgrupo.mx` has no entity link and Sabor has no `manages` edges, so its scope is empty and it currently sees nothing (fail-closed). Without a scope, TEST 1 has no "allowed vs denied" to observe. Give the manager a **partial** scope = the Cocina Dorada locations. This is a **data** change (a demo fixture), not production code, and it is the same fixture HALT-SCOPE-DEMO needs.

**Option A — direct (fastest; recommended for the test).** Insert one `profile_scope` row. Run in the Supabase SQL editor (`https://supabase.com/dashboard/project/bayqxeiltnpjrvflksfa/sql/new`):

```sql
insert into profile_scope (tenant_id, profile_id, scope_type, visible_entity_ids, visible_rule_set_ids, visible_period_ids, metadata, materialized_at)
values (
  'f7093bcc-e90b-4918-9680-69da7952dd65',
  '07fa3350-a7fb-4404-b983-86ab1b726174',          -- gerente@saborgrupo.mx
  'graph_derived',
  array['998232f0-d0be-4c55-85b2-590bacec5198',    -- Cocina Dorada Polanco
        '6a03bfe7-56bd-487a-b35a-b98e45228112',    -- Cocina Dorada Querétaro
        '3a17faa3-face-4afd-b18a-67f4bf67afa6',    -- Cocina Dorada Monterrey
        'acf9329f-072f-4507-9071-b0b125b45e73',    -- Cocina Dorada Puebla
        '2ae38f4e-a17e-48d2-a42f-fb6ed5a09b4b'],   -- Cocina Dorada Oaxaca
  '{}', '{}', '{"derived_from":"phaseC_runbook_fixture"}'::jsonb, now()
);
```

After this, the manager's scope = the 5 Cocina Dorada locations; **Taco Veloz Condesa (`32f589cc…`) is deliberately OUT of scope.** (To reset after testing: `delete from profile_scope where profile_id='07fa3350-a7fb-4404-b983-86ab1b726174';`)

**Option B — production-true (graph-derived).** Link `gerente@` to a manager entity, add `manages` edges (Cocina Dorada team → its locations), then call `materializeProfileScope(profileId, sb)` (`web/src/lib/entities/profile-scope.ts`). More faithful, more steps; Option A is sufficient to make the tests meaningful.

> **Verify the front-end actually sees the scope:** the UI reads scope via `usePersona()` → `scope.entityIds` (`web/src/app/financial/page.tsx:46,66`). If after seeding the manager still sees nothing in the UI, the hook may compute scope from a different source — fall back to TEST 2's direct-request form (which doesn't depend on the hook) and note it.

---

## §3 — THE THREE TESTS (action → expected PASS → expected FAIL)

### TEST 1 — Front door (app layer; expected PASS)

**Action:**
1. Log into `<BASE>` as `gerente@saborgrupo.mx` (after §2.5 seeding).
2. Open `/financial` (or `/financial/summary`). Note the brands/locations shown — should be **Cocina Dorada only**.
3. Try to view an out-of-scope location directly: navigate to `<BASE>/financial/location/32f589cc-12cf-4945-a330-03dbec217d4d` (Taco Veloz Condesa), or pick Taco Veloz from any location selector.

- **PASS:** the manager sees only Cocina Dorada data; the Taco Veloz location shows **no data / access denied / empty**.
- **FAIL:** Taco Veloz Condesa's revenue/cheques render for the manager.

*(Re-confirms WS7-A + Stage 1 at the UI layer. Expected: PASS.)*

### TEST 2 — Back door (the real Phase C test: does anything filter when you skip the UI?)

**Action:** as the SAME logged-in manager, send the API request **directly** (per §2.4 "Copy as fetch"), changing only the body. Run both variants:

**(a) `scopeEntityIds` OMITTED:**
```jsonc
POST <BASE>/api/financial/data
{ "tenantId": "f7093bcc-e90b-4918-9680-69da7952dd65", "mode": "summary" }
```
**(b) `scopeEntityIds: []` (empty):**
```jsonc
POST <BASE>/api/financial/data
{ "tenantId": "f7093bcc-e90b-4918-9680-69da7952dd65", "mode": "summary", "scopeEntityIds": [] }
```

**What PASS vs FAIL looks like** (the response `data` is an aggregate; check whether it spans brands beyond Cocina Dorada — e.g. the `summary`/`network_pulse` location list, or use `mode:"location_detail"` to enumerate locations):

- **(b) empty array — expected PASS (fail-closed):** response returns **zero cheques / empty aggregate**. The route's WS7 Stage 1 logic denies an empty scope (`route.ts:1310-1319`). ✅
- **(a) omitted — the decisive check:**
  - **PASS (DB/route independently scopes):** response contains only the manager's Cocina Dorada data (or zero).
  - **FAIL (route trusts the client; no server-side scope):** response contains the **WHOLE Sabor tenant** — every brand (Taco Veloz, Mar y Brasa, …), every location. The manager, by omitting scope, sees all teams' financials.
  - **Code predicts FAIL:** with `scopeEntityIds === undefined` the route returns `raw` = the full tenant (`route.ts:1310`, `: raw`). The route never re-derives scope from the caller. **Confirm live** — this is the operative Phase C result.

**(c) Cross-tenant variant (most severe — run if the manager's password works):** same request but point at **another tenant**:
```jsonc
POST <BASE>/api/financial/data
{ "tenantId": "<a DIFFERENT tenant's id, e.g. MX Restaurant 3d354bfa-b298-48dd-88a0-9f8c5a00be4e>", "mode": "summary" }
```
- **PASS:** denied / empty (caller can't read a tenant they don't belong to).
- **FAIL:** you get the other tenant's financials. Code predicts **FAIL** — the route has no caller-tenant check and uses the service-role client (RLS bypassed). A logged-in user of any tenant can read any other tenant's financials by knowing its UUID.

### TEST 3 — Direct table read with a USER token (deepest DB-layer check)

The architecture **does** expose a user-token path (the browser anon client + the user's session → RLS enforced). This tests the database directly, independent of any route. Run it as a script (architect fills the password):

```ts
// scripts/ob211-test3-usertoken.ts   →   npx tsx --env-file=.env.local scripts/ob211-test3-usertoken.ts
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
await c.auth.signInWithPassword({ email: 'gerente@saborgrupo.mx', password: '[ARCHITECT-SUPPLIED]' });
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';
const BCL   = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
for (const tbl of ['calculation_results','committed_data','entities','entity_period_outcomes']) {
  const all  = await c.from(tbl).select('*', { count: 'exact', head: true });                 // no filter
  const mine = await c.from(tbl).select('*', { count: 'exact', head: true }).eq('tenant_id', SABOR);
  const other= await c.from(tbl).select('*', { count: 'exact', head: true }).eq('tenant_id', BCL);
  console.log(tbl, '| total visible:', all.count, '| Sabor:', mine.count, '| BCL(other tenant):', other.count);
}
```

**Read the result two ways:**
- **Cross-tenant (the BCL count): expected PASS** — `BCL = 0`. RLS tenant-isolation blocks reading another tenant's rows. ✅
- **Entity-scope (the Sabor count vs the manager's scope): expected FAIL** — `Sabor` count = the **whole tenant** (all 40 individuals / 20 locations / 510 results), **not** just the 5 Cocina Dorada locations. The DB has **no entity/manager-scope policy** (§4), so a manager reading the table directly sees every team in their tenant.
  - **PASS would be:** the manager sees only their scoped entities' rows. Code predicts this does **NOT** happen (no such policy exists).

---

## §4 — RLS STATE READOUT (what to EXPECT, code-side + live)

**Code-side (from `web/supabase/migrations/`):**
- RLS is `ENABLE`d on every scope-gated table (`001_core_tables.sql` entities; `002…` periods/rule_sets; `003_data_and_calculation.sql:63,166` committed_data/calculation_results; `004_materializations.sql` entity_period_outcomes/profile_scope; `013`/`022` approval_requests; etc.).
- The **SELECT** policy on the core/data tables is **tenant isolation**:
  `… FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()))`
  — e.g. `entities_select_tenant` (001:178), `committed_data_select_tenant` (003:65), `calculation_results_select_tenant` (003:169).
- `006_vl_admin_cross_tenant_read.sql` adds `*_select_vl_admin` overlays: `EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')` (platform cross-tenant read).
- `profile_scope` has `profile_scope_select_own` (`profile_id = own`) + `profile_scope_select_admin` (tenant) + vl_admin (004:86-96, 006:119).
- **There is NO entity-level / manager-scope SELECT policy on any table.** ⇒ DB enforces **tenant isolation only**; entity/manager scope is purely app-layer.

**Live (CC's anon probe, 2026-06-15):** unauthenticated SELECT returns **0 rows** on `entities`, `calculation_results`, `periods`, `profile_scope`, `calculation_batches`, `entity_period_outcomes`, `approval_requests`, `audit_logs`, `rule_sets`; `committed_data` times out (never returns data). Service-role control returns rows from the same tables ⇒ **RLS is enabled and denying anon**. ✅ (Consistent with code-side.)

**Authoritative live confirmation (architect runs once, in the SQL editor — reads the catalog, no user session needed):**
```sql
-- Is RLS on?
select tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in ('entities','committed_data','calculation_results','entity_period_outcomes',
                    'periods','profile_scope','approval_requests','audit_logs');

-- What do the SELECT policies filter on? (look for any policy that ISN'T tenant_id/vl_admin/own)
select tablename, policyname, cmd, qual
from pg_policies
where schemaname='public'
  and tablename in ('entities','committed_data','calculation_results','entity_period_outcomes',
                    'periods','profile_scope','approval_requests','audit_logs')
order by tablename, cmd;
```
Expected: `rowsecurity = true` for all; SELECT `qual` = `tenant_id IN (… auth.uid())` (+ a vl_admin EXISTS). **If any table shows `rowsecurity=false`, or a SELECT policy with `qual = true` / no tenant predicate → that's a live drift from the migrations and a finding in its own right** (record it).

---

## §5 — DISPOSITION GUIDE (what each result MEANS + what to do)

| Outcome | Meaning | Action |
|---|---|---|
| **TEST 1 PASS + TEST 2(a) PASS + TEST 3 (Sabor scoped) PASS** | Boundary complete at app + DB. | Phase C closes clean. Nothing more. |
| **TEST 2(a) FAIL** (omitted scope → whole tenant) | The financial route trusts client-supplied scope and does not re-derive it from the caller; the service-role client bypasses RLS. A logged-in manager going around the UI sees **all teams in their tenant**. | **R5 RLS follow-on (route-scope variant).** Fix shape: in `/api/financial/data` (and the other service-role data routes — `calculation/run`, `reconciliation/*`, `intelligence/wire`, `canvas`, `periods`), resolve the caller via `createServerSupabaseClient().auth.getUser()`, then (a) verify `caller.tenantId === body.tenantId` (or caller is platform), and (b) for managers, **derive** `scopeEntityIds` server-side from `profile_scope` rather than trusting the body. NOT a controlled-demo blocker (the screens hold); a **MUST before real customers**. |
| **TEST 2(c) FAIL** (cross-tenant via route) | A logged-in user of **any** tenant can read **another** tenant's financials by posting its UUID. | **R5 — highest severity.** Same fix as above; the `caller.tenantId === body.tenantId` check is the load-bearing one. Exploitable by any authenticated tenant user with a known tenant UUID. |
| **TEST 3 Sabor = whole tenant** (entity-scope FAIL) but **BCL = 0** (tenant PASS) | DB enforces **tenant** isolation, not **entity/manager** scope. A manager with a direct user-token query reads every team in their tenant. | **R5 RLS follow-on (DB-policy variant).** Fix shape: add an entity-scoped SELECT policy on `calculation_results`/`committed_data`/`entity_period_outcomes`/`entities` (e.g. `entity_id IN (SELECT unnest(visible_entity_ids) FROM profile_scope WHERE profile_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()))`), OR accept that all manager-scoping is app-layer and ensure every read path is server-route-mediated (no user-token table reads). NOT a controlled-demo blocker; a MUST before real multi-team customer data. |
| **TEST 3 BCL > 0** (cross-tenant DB read) | RLS tenant-isolation is broken / disabled live. | **Blocker.** Re-apply migrations 001-006; confirm `rowsecurity=true` (§4 SQL). This contradicts the migrations and the anon probe — treat as drift; investigate before any customer data. |
| **§4 SQL shows `rowsecurity=false` or a `qual=true` SELECT policy** | Live DB drifted from migrations (e.g. a permissive policy added in the dashboard). | **Blocker.** Record the offending table/policy; re-apply the migration policy. |

**Severity statement (plain):** Today, the manager-scope boundary is enforced **only in the UI**. Anyone who can authenticate (a manager omitting scope, or — worse — a user of a different tenant) and is willing to call the API directly can read beyond their scope, up to and including another tenant's financials, because the data routes use the RLS-bypassing service-role client and don't check the caller. The database's own RLS stops cross-**tenant** reads but not cross-**team** reads within a tenant. None of this is reachable through the screens, so it does not block a controlled demo — but it must be fixed (R5) before real customers hold real data in the same tenant or across tenants.

---

## §6 — REPRODUCE CC's DATA PROBES (read-only)

CC's findings come from three read-only scripts (service-role + anon), runnable from `web/`:
```
npx tsx --env-file=.env.local scripts/ob211-phaseC-rls-probe.ts        # tenants, BCL accounts/scope/data, anon RLS probe
npx tsx --env-file=.env.local scripts/ob211-phaseC-rls-probe2.ts       # per-tenant readiness (finds Sabor), clean anon re-probe
npx tsx --env-file=.env.local scripts/ob211-phaseC-probe3-sabor.ts     # Sabor entities, manager linkage, in/out-of-scope targets
npx tsx --env-file=.env.local scripts/ob211-phaseC-probe4-cheque.ts    # confirms cheques key on `location` entities
```
They only `.select()` — no writes. Re-run them any time the live data changes (e.g. after seeding §2.5) to refresh the IDs.

---

## §7 — FLAGGED UNKNOWNS (architect-supplied; not fabricated)

| Unknown | Why CC can't fill it | How to get it |
|---|---|---|
| **Deployed base URL `<BASE>`** | Repo only contains `NEXT_PUBLIC_APP_URL=http://localhost:3000`; the production domain isn't in the codebase. | Vercel dashboard → spm-platform → Domains, or your browser address bar when logged into the live app. (Or use `http://localhost:3000` with `npm run dev`.) |
| **Account passwords** | Stored hashed/write-only in Supabase Auth. | Supabase dashboard → Authentication → Users → set/reset for `gerente@`, `admin@`, `mesero@saborgrupo.mx`. |
| **Whether the live DB matches the migrations** | CC's anon probe confirms RLS *denies anon*, but the authoritative per-policy state needs catalog access (no `SUPABASE_DB_PASSWORD` in `.env.local`). | Run the §4 `pg_policies` SQL in the dashboard SQL editor. |
| **Whether the financial UI honors a seeded `profile_scope`** | Depends on the `usePersona()` runtime source, not statically certain. | After §2.5, log in as the manager and check `/financial`; if still empty, rely on TEST 2's direct form. |

---

### One-line status for the artifact sync
Phase C delivered as an executable runbook against the **live** system: target pivoted to **Sabor** (BCL has data but no users — the HALT-SCOPE-DEMO gap), real accounts/IDs/endpoint/auth filled in, a required scope-seeding precondition (no scoped manager exists anywhere), and three tests (front-door / back-door route / direct user-token table read) each with action→expected-pass→fail and a disposition guide. Code predicts the back-door and entity-scope tests **FAIL** (service-role routes bypass RLS + trust client scope; DB enforces tenant-isolation only) → the **R5 RLS/route-scope follow-on**, named with fix shapes, not a controlled-demo blocker. Pending the architect's live run with real credentials.
