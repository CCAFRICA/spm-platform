# OB-211 Phase C — RLS VERIFICATION RUNBOOK: produce the LITERAL executable test (real users, real IDs, real requests, real pass/fail) — NOT a plan

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-15 (architect channel)
**Type:** OB-211 Phase C — the RLS/defense-in-depth verification, delivered as a RUNBOOK THE ARCHITECT CAN EXECUTE STEP BY STEP. The prior Phase C deliverable was a plan (which tables, what to check); it left the architect translating "probe the table" into actions. This directive makes CC produce the LITERAL test: the real user accounts, the real entity/tenant IDs, the exact request to send, and the exact response that means pass vs. fail — filled in from the live schema and data, not described abstractly.
**Gate:** #522 (Phase B + the Phase C plan) on main. This SUPERSEDES the abstract plan with an executable runbook.
**Branch:** CC's choice — a docs branch producing the runbook. No production code change (this is a verification artifact). tsc N/A (docs).

**THE PRINCIPLE (architect-set): the runbook must be executable by a non-coder with real values, not a plan in code-speak.** "Run the pg_policy probe" / "POST with scopeEntityIds" is not actionable without the actual account to log in as, the actual ID to use, the actual request to send, and the actual response that distinguishes a locked DB from an open one. CC HAS the codebase, the schema, and (via the service-role client) the live data to fill every blank. The deliverable is a runbook where every step is a concrete action with a concrete expected result.

**Why CC produces this and the architect runs it:** the test needs a REAL authenticated session against the LIVE database (a logged-in user actually requesting data) — CC's environment is sandboxed off from that. CC fills in every specific FROM the live schema/data (real accounts, real IDs, the traced auth mechanism, the exact request shape); the architect executes the filled-in runbook with real credentials.

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. This is a verification-artifact task. Binding: SR-42 (surface what's genuinely unknown), SR-43, SR-44 (the architect runs the test). **No fabrication:** every value in the runbook (account, ID, URL, expected response) is READ from the live system — if a value can't be determined, the runbook says so explicitly and tells the architect how to get it, rather than inventing one.

**Read-before-write:** CC traces the actual auth mechanism (the financial route's auth grep came back empty — CC must determine: cookie session? service-role? bearer? — this determines HOW the architect hits the endpoint directly), the actual data-API routes (the financial route is a POST taking `{tenantId, ..., scopeEntityIds?}`), and the actual RLS state on the six tables (don't assume — query it).

**FP-49:** CC reads the schema + live data via the service-role client (`npx tsx scripts/...`) to fill in real account emails, real entity/tenant IDs, real period IDs.

AUTONOMY: act; produce the complete runbook. No yes/no questions.

---

## §1 — THE SIX TABLES (the scope-gated stores to verify)
The runbook covers the scope-gated tables the security foundation protects at the app layer: **`calculation_results`, `committed_data`, `entities`** (the core three named in the comprehensive directive) — plus CC confirms from the schema which of the others carry tenant/entity-scoped sensitive data (e.g. the financial reads, audit/approval tables). CC LISTS the actual set with, for each, whether RLS is currently enabled (queried, not assumed).

---

## §2 — WHAT THE RUNBOOK MUST CONTAIN (every blank filled from the live system)

For the architect to execute, the runbook provides ALL of:

### 2.1 The test accounts (real, named)
CC reads the live `profiles`/users for BCL (or the demo tenant) and NAMES:
- **A scoped manager** — a real account email + which entities/team they're scoped to (their `profile_scope`), so the architect logs in AS them. If NO scoped manager exists, CC says so and gives the exact steps to create/seed one (this ties to the HALT-SCOPE-DEMO seeding — a scoped manager is needed both for the demo AND this test).
- **The entity IDs:** the real `entity_id` values — one IN the manager's scope, one OUTSIDE it (another team's) — so the test has concrete "allowed" and "should-be-denied" targets.
- **The tenant ID:** the real BCL tenant UUID (for the POST body).
- **An admin account** (for the contrast: admin should see all; the comparison proves the scoping is real, not a blanket block).

### 2.2 The deployed URL + the exact endpoints
- The real deployed base URL (CC reads it from the Vercel/env config, or names where the architect finds it).
- For each data-API route that reads a scope-gated table (the financial data route `/api/financial/data` and the others CC identifies): the **method** (the financial one is POST), the **exact request body** (with the real `tenantId` filled in, and the `scopeEntityIds` field shown), and **how it authenticates** (CC's trace: cookie session from the logged-in browser? a header? — this tells the architect HOW to send the request as the logged-in user — e.g. via the browser devtools/Network tab, or curl with the session cookie).

### 2.3 The three concrete tests (each: action → expected pass → expected fail)
**TEST 1 — front door (app layer, confirm it holds):**
- Action: logged in as the scoped manager (account from 2.1), navigate to the statement/financial screens; then change the URL parameter to the OUT-OF-SCOPE entity ID (from 2.1).
- PASS: denied / no other-team data shown. FAIL: the other entity's data appears.
- (This re-confirms WS7-A + Stage 1; expected PASS.)

**TEST 2 — back door (the real Phase C test — does the DB itself filter?):**
- Action: as the SAME logged-in scoped manager, send the data-API request DIRECTLY (the exact POST from 2.2 — CC gives the literal request, including how to issue it with the manager's session: the browser Network tab "copy as fetch/curl", or the steps to do it). Send it (a) with `scopeEntityIds` OMITTED, and (b) with `scopeEntityIds: []`.
- **PASS (DB is locked / boundary holds):** the response contains ONLY the manager's scoped data (or zero) — even though the request didn't restrict it, the database refused to return other teams'.
- **FAIL (DB is open / app is the only lock):** the response contains the WHOLE TENANT's data — the manager, by going around the screens, sees everyone's pay.
- CC states EXACTLY what the pass vs. fail response looks like (the shape/fields, an example of "scoped result" vs "whole-tenant result") so the architect can tell which they got.

**TEST 3 — the direct table read (the deepest check, if reachable):**
- Action: if there's a way to query a scope-gated table directly with a USER token (not the service-role) — CC says whether the architecture allows this (e.g. a Supabase client with the anon/user key) and, if so, the literal query.
- PASS: RLS returns only the user's rows. FAIL: returns all rows. If the architecture doesn't expose a user-token table read, CC says so — TEST 2 (the API route) is then the operative back-door test.

### 2.4 The RLS state readout (what CC CAN determine from the schema)
CC queries and reports, per table: is RLS ENABLED? are there POLICIES? what do they filter on (tenant? entity? nothing)? This is the code-side half — it tells the architect what to EXPECT before running the live test, and whether a FAIL is "no RLS at all" vs "RLS present but mis-scoped."

### 2.5 The disposition guide (what each result MEANS + what to do)
- **All tests PASS** → the boundary is complete at app + DB layers. Phase C closes clean. Nothing more.
- **TEST 2/3 FAIL on a table** → the app layer (WS7-A + Stage 1) protects normal screen users, but a direct-API/direct-DB call bypasses it → that table needs RLS (or a server-route scope re-check). This is the **R5 RLS follow-on** — CC names the table(s) and the fix shape (the policy each needs). NOT a demo blocker for a controlled demo (the screens hold); a MUST before real customers with real data.
- CC states the SEVERITY plainly: who could exploit it (a logged-in user of the tenant, going around the UI), and what they'd see.

---

## §3 — THE DELIVERABLE
`docs/runbooks/OB-211_PHASE_C_RLS_RUNBOOK_20260615.md` — the executable runbook: §2.1 real accounts/IDs, §2.2 real URL/endpoints/auth-method, §2.3 the three tests each as action→pass→fail with real values, §2.4 the RLS state readout, §2.5 the disposition guide. Every blank filled from the live system; every unknown explicitly flagged with how to resolve it (no fabricated value).

**The test of the runbook:** a non-coder can execute it top to bottom — log in as the named account, send the given request, compare the response to the stated pass/fail — without translating anything into code or guessing a value.

```
ARTIFACT SYNC (Phase C runbook)
MC: Phase C delivered as an EXECUTABLE runbook (not an abstract plan) — real test accounts (scoped manager + admin), real entity/tenant IDs (in-scope + out-of-scope targets), the real deployed URL + data-API endpoints + traced auth mechanism, and the three tests (front-door app-layer, back-door API-route, direct-table-read) each as action→expected-pass→expected-fail with real values + the disposition guide. The architect executes with real credentials (CC's env is sandboxed off the live authenticated session). Pending architect execution.
REGISTRY: "RLS Boundary" → executable verification runbook delivered; the DB-layer test is now runnable by the architect.
R1: the RLS-verification gate is now executable (real values, clear pass/fail) → pending the architect's run.
SUBSTRATE: defense-in-depth made testable — the app-read layer is closed (WS7-A + Stage 1); this runbook tests whether the DB independently filters (the deeper boundary); a FAIL on any table is the R5 RLS follow-on (named table + policy shape), not a controlled-demo blocker.
```

---

## §4 — NOTES
- This is a verification artifact — NO production code change. If a test FAILS, the FIX (adding RLS) is a SEPARATE increment (R5), not part of this runbook.
- The scoped-manager account this runbook needs is the SAME need as HALT-SCOPE-DEMO (a demo manager with a real `profile_scope`) — if CC finds none exists, producing/seeding one serves both the demo and this test. CC notes the overlap.
- If CC cannot determine a value from the live system (e.g. the deployed URL isn't in the repo), the runbook states the value is architect-supplied and WHERE to find it — never a fabricated placeholder.
