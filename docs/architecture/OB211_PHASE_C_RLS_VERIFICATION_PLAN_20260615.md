# OB-211 Phase C — RLS / Defense-in-Depth Verification Plan

**Date:** 2026-06-15 · **Author:** CC (ultracode) · **Type:** verification plan (architect-context — CC's DB scan is sandbox-blocked; the architect runs the authenticated check).

## Why this phase
WS7-A + Stage 1 closed the **application-read layer**: the statement page refuses out-of-scope `entityId` (WS7-A), the financial route + scope fail closed (WS7-A + Stage 1), and the persona scope defaults to least privilege (Stage 1). But every one of those guards is a **client-side JS conditional preceding a query on the browser Supabase key** — they stop the *page* from issuing the query; they do **not** stop a determined caller from hitting the data API directly with that key. The complete boundary is **RLS** (row-level security) on the scope-gated tables (or routing every scope-gated read through a server route/RPC that re-checks scope). This phase produces the verification, not an assumption (HALT-RLS: document the state, do not assume).

## The scope-gated tables to verify (the app-layer guards' underlying data)
| Table | Read by (scope-gated app path) | Required posture |
|---|---|---|
| `calculation_results` | the statement (WS7-A), the results table, the stream loaders, Simulate | RLS scoping rows to the caller's tenant **at minimum**; entity-level scope is enforced in-app, so tenant RLS + the app guard is the practical boundary |
| `committed_data` | the statement raw-transactions read (WS7-A), the financial route | RLS to the caller's tenant; the financial route additionally filters by `scopeEntityIds` (Stage 1) |
| `entities` | the statement entity list (WS7-A scoped query), financial, results | RLS to the caller's tenant |
| `financial`-backing tables (`committed_data` `data_type='pos_cheque'`, etc.) | the financial route (server) | the route is server-side and now fail-closed on explicit-empty scope (Stage 1); confirm the server uses a service-role client (RLS-exempt) **and** that the only client path is the gated route |
| `classification_signals` | the #510 read-back (per-`actorId`) | tenant RLS; per-user grain is an in-payload `actorId` (not a column) — confirm tenant isolation holds |
| `profile_scope` | the scope derivation (Stage 1) | tenant RLS; this is the scope SOURCE — its integrity is the foundation |

## The verification (architect runs on the live DB)
For each table above, confirm in the authenticated context:
1. **Is RLS enabled?** `SELECT relrowsecurity FROM pg_class WHERE relname = '<table>';`
2. **What policies exist?** `SELECT polname, polcmd, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid = '<table>'::regclass;`
3. **Does a SELECT policy scope by `tenant_id`** to the caller's tenant (e.g. `tenant_id = auth_tenant()` or the project's tenant-claim mechanism)?
4. **Direct-API probe** (the real test): with a *non-privileged* tenant user's token, query `calculation_results` for **another** `entity_id` / another `tenant_id` directly (bypassing the page) → does RLS **deny** it?

## Dispositions (HALT-RLS)
- **RLS present + tenant-scoped on all six → boundary complete.** The app-layer guards (WS7-A/Stage 1) are then defense-in-depth atop RLS — the correct layering. Record the confirmation.
- **RLS absent/weak on a scope-gated table → a defense-in-depth follow-on (R5).** The app layer still holds for *app traffic* (the dominant path); the gap is a determined direct-API caller. The fix is either (a) enable tenant RLS on the table, or (b) route the scope-gated reads through a server route/RPC that re-checks scope (the financial route is already this shape). **Do not assume present; do not block the app-layer wins on this — they stand regardless.**

## Note on entity-level scope
RLS practically enforces **tenant** isolation at the DB. The finer **entity-level** scope (a rep sees only their own statement; a manager only their team) is enforced in-app (WS7-A's `allowedEntityIds` guard, Stage 1's least-privilege scope). A fully DB-enforced entity-level boundary would need per-entity RLS keyed to the caller's resolved scope (a larger change) — out of this plan's scope; the app-layer + tenant-RLS combination is the practical boundary, with the entity-level guard as the app-enforced layer.

---

*OB-211 Phase C · 2026-06-15 · the data-layer boundary beneath the app-layer scope — verified, not assumed (HALT-RLS). R5 tracks any follow-on.*
