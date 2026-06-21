# DIAG-075: Performance Profile — Financial Pages + Persona Switching

**Date:** 2026-06-21 · **Branch:** `diag-075-performance-profiling` · **Base:** `main` @ `10439405`
**Method:** READ-ONLY. Runtime measurements via a standalone harness that invokes the real `POST` handler from `web/src/app/api/financial/data/route.ts` and replicates its exact Supabase queries (no application code modified). Static analysis of queries, indexes, page hooks, persona switcher, and aggregator complexity. Tenants: **Sabor** (`f7093bcc`, 263,250 `pos_cheque` rows) and **BCL** (`b1c2d3e4`, 0 `pos_cheque` rows). All timings `performance.now()` ms; median of 3 unless noted (C2). **Localhost → remote Supabase** (see R-16 for production delta).

---

## EXECUTIVE FINDING

The `/financial` delay is **one defect**: the route handler **fetches every `pos_cheque` row (full `row_data` JSONB) into JavaScript and aggregates in-process** — `fetchRawDataServer` (`route.ts:77-125`). For Sabor that is **263,250 rows = 163.9 MB transferred over 264 sequential round-trips = ~96.7 s (cold)** to produce a response of **4–35 KB**. The JS aggregation itself is trivial (39–307 ms). A pure SQL `COUNT` of the same rows returns in **250 ms** — proving the database is not the bottleneck; **shipping 163.9 MB to compute 8 KB is.** BCL (0 rows) returns in **333 ms**, so the problem is **100 % data-volume driven (Sabor-specific)**, not platform-wide context overhead. Persona switching and the PDR-04 provider tax are real but secondary.

---

## M1 — Route Handler Timing (Sabor, per mode)

Shared cost — `fetchRawDataServer` cold fetch (median of 3):

| Segment | Median | Detail |
|---|---|---|
| entities query (`route.ts:84-87`) | **109 ms** | 68 rows, specific columns |
| `pos_cheque` fetch (`route.ts:101-106`) | **96,695 ms** | **263,250 rows · 264 pages · 163.9 MB** |
| **cold raw-fetch total** | **~96,805 ms** | — |

Per-mode (real `POST`; **cold** = first call in a fresh process = fetch+agg; **warm** = cache hit ⇒ aggregation + serialization only):

| Mode | Warm (JS agg) | Cold (fetch+agg) | Response payload |
|---|---|---|---|
| network_pulse | 56 ms | ~96,860 ms | 8 KB |
| leakage | 283 ms | ~97,087 ms | 5 KB |
| performance | 256 ms | ~97,061 ms | 9 KB |
| staff | 212 ms | ~97,016 ms | 14 KB |
| timeline | 42 ms | ~96,846 ms | 4 KB |
| patterns | 266 ms | ~97,071 ms | 15 KB |
| summary | 307 ms | ~97,111 ms | 5 KB |
| products | 39 ms | ~96,843 ms | 6 KB |
| cheques | 265 ms | ~97,070 ms | 35 KB |

**Reading:** every mode's cold cost is ~96.8 s of shared fetch + a few hundred ms of aggregation. The mode you pick is irrelevant; the fetch dominates by ~300×. Warm (within the 5-min in-process cache) all modes are sub-350 ms.

### Decomposition of the 96.7 s fetch (1 run each, Sabor)

| Variant | Time | Round-trips | Payload | Isolates |
|---|---|---|---|---|
| Baseline `select(entity_id,row_data)` page=1000 | **95,658 ms** | 264 | 163.9 MB | — |
| Thin `select(entity_id)` page=1000 | **41,476 ms** | 264 | 14.0 MB | JSONB payload |
| `select(...)` page=**10000** | 313 ms | **1** | 0.6 MB | — *(see note)* |
| `count(*) head:true` | **250 ms** | 1 | — | DB compute |

- **JSONB `row_data` payload** = **~54 s / ~150 MB** (baseline − thin). Biggest single lever.
- **Round-trips** = the remaining **~41 s** (thin case is still 264 trips). **NOTE:** page=10000 returned only **1 page (1000 rows)** — **PostgREST hard-caps responses at 1000 rows**, so the **264 round-trips are forced by the server cap and cannot be reduced by a larger page size.** The only way to cut round-trips is to **return fewer rows** (SQL aggregation).
- **`COUNT` = 250 ms** confirms Postgres + the index are fast; 100 % of the cost is transferring rows to JS.
- Per-row wire payload ≈ **622 bytes/row** (163.9 MB / 263,250). Avg round-trip ≈ **366 ms** (localhost↔remote Supabase; R-16).

---

## M2 — Query Analysis

Three Supabase queries in the route; **zero `.rpc()`, zero SQL `GROUP BY`/`SUM`** — all aggregation is JavaScript over fetched rows.

| # | Location | Table | SELECT | Filters | Pagination | Aggregation |
|---|---|---|---|---|---|---|
| 1 | `route.ts:84-87` | `entities` | `id, display_name, external_id, entity_type, metadata` | `tenant_id` | none | JS |
| 2 | `route.ts:101-106` | `committed_data` | **`entity_id, row_data`** | `tenant_id` + `data_type='pos_cheque'` | `.range`, page 1000 | **JS (the bottleneck)** |
| 3 | `route.ts:909` | `periods` | `label` | `tenant_id`, `limit(1)` | n/a | none |

**Indexes on `committed_data`** (from migrations; `exec_sql` RPC does **not** exist — HALT-1 path b used, status **KNOWN**):
- `idx_committed_data_type (tenant_id, data_type)` — `003:82` — **directly serves query #2's filters.**
- `(tenant_id)`, `(entity_id)`, `(period_id)`, `(import_batch_id)` — `003:79-83`
- partial `(tenant_id, source_date)`, `(tenant_id, entity_id, source_date)` — `018:12-19`

**Verdict: not a missing-index problem.** The filter is index-served. The defect is that the query **returns all ~263 K matching rows + full `row_data` JSONB** and aggregates in JS. A covering index cannot help while the JSONB blob is selected and aggregation stays in the app tier.

---

## M3 — Page-Level Network Profile (by code trace)

All four pages share one shape: **exactly one `POST /api/financial/data` on mount** (one mode), via `financial-data-service.ts:294`. No shared hook; each page owns a `useEffect`.

| Page | Mode | Own fetches on mount | Other API on mount |
|---|---|---|---|
| `/financial` (`page.tsx:71`) | network_pulse | 1 | none |
| `/financial/pulse` (`pulse/page.tsx:78`) | network_pulse | 1 | none |
| `/financial/leakage` (`leakage/page.tsx:82`) | leakage | 1 | none (ChequeList `cheques` mode fires on click only) |
| `/financial/summary` (`summary/page.tsx:59`) | summary | 1 | none (re-fires on month change) |

**Global provider tax (every page, PDR-04), cold app load:**
- `SessionProvider` (`session-context.tsx:80`) — **6 parallel count queries** (entities, periods, calculation_batches, rule_sets, import_batches, classification_signals). Single biggest fixed cost.
- `TenantProvider` (`tenant-context.tsx:140`) — 1 (`tenants`).
- `PersonaProvider` (`persona-context.tsx:139`) — ~2–3 (profiles, entities, profile_scope; cached 5 min).
- `AuthProvider` (`auth-context.tsx:169`) — ~2 (validate + profile), despite server-passed `initialAuthState`.
- `LocaleProvider`/`ConfigProvider` — no API (bundle chunks / defaults).

**Net ≈ 12–13 network requests** on a cold financial-page load; **~1** on warm in-app navigation between financial pages (shell providers already mounted/cached). The four pages are within ~1 request of each other — **structurally identical**; the page-specific cost is entirely the single `/api/financial/data` call (which carries the 96.7 s fetch on a cold instance).

---

## M4 — Persona Switching Profile (by code trace)

Switcher = `PersonaSwitcher.tsx` (VL-admin floating bar; chips Admin/Manager/Rep). Clicking calls `setPersonaOverride` → mutates `override` state (`persona-context.tsx:110`), persists to **sessionStorage** `vl_persona_override` (`:122-128`). **No signOut/reload.**

**Providers that RE-FETCH on switch:**
- `persona-context` (the source) — scope re-fetch effect dep `override` (`:139-335`): ~2–4 Supabase queries (profiles, entities, profile_scope), **cached 5 min** (`:54-74`) → 0 on repeat A→B→A.
- **`/api/financial/data` re-fires on every mounted financial page** — each derives `financialScope = {scopeEntityIds: scope.entityIds}` and lists it in its fetch-effect deps (`financial/page.tsx:71` + 8 sibling pages). Dashboards re-fetch too (`ManagerDashboard.tsx:164`, `RepDashboard.tsx:123`).

**Providers that do NOT re-fetch on switch (decoupled by design):** `tenant-context` (dep `user/isAdmin`), `period-context` (dep `tenantId` only), `operate-context` (rule_sets/periods/calculation_batches, dep `tenantId`), `navigation-context` clock calls (keyed on **raw** `userRole`, not override).

**Cost per switch:** ~2–4 scope queries (or 0 cached) + 1 `/api/financial/data` refetch per mounted financial surface. Because the raw-cheque cache (5 min) is reused, the financial refetch on switch is **usually warm** (the route re-loads cache then re-filters cheques by `scopeEntityIds` **in JS** at `route.ts:1354-1363`) → a few hundred ms, **unless the cache expired**, in which case it pays the full **96.7 s** again. Persona switching is a **bounded amplifier** — it does *not* re-trigger the heaviest platform fan-out (operate/period). The full PDR-04 95–278 req/page hit only occurs when a switch **crosses a workspace boundary** and `router.push` forces a fresh page load (`PersonaSwitcher.tsx:77-85`).

---

## M5 — Comparative Baseline (BCL vs Sabor)

| Metric | Sabor (263 K cheques) | BCL (0 cheques) | Δ |
|---|---|---|---|
| cold raw-fetch | **96,805 ms** | **333 ms** | **~290×** |
| `pos_cheque` fetch | 96,695 ms / 163.9 MB | 122 ms / 0 MB | — |
| cold network_pulse POST | 99,359 ms | 371 ms | ~268× |
| warm per mode | 39–307 ms | 302–405 ms* | — |

**Conclusion:** the delay is **entirely Sabor's `pos_cheque` volume**. BCL's financial route returns `null` in ~333 ms (`fetchRawDataServer` returns early, `route.ts:120`). The platform-context tax (M3/M4) applies equally to both tenants and is therefore **not** the cause of the *financial-page* delay — it is a separate, platform-wide concern.

*Side-finding: BCL's `null` result is **never cached** (`route.ts:120` returns before the cache write at `:122`), so every BCL financial request re-queries ~333 ms. Trivial, but a free fix.

---

## BOTTLENECK IDENTIFICATION (ranked)

1. **`fetchRawDataServer` cold fetch — ~96.7 s, 163.9 MB, 264 round-trips** (`route.ts:101-118`). Dominates by ~300×. Two coupled levers: JSONB payload (~54 s/150 MB) and round-trip count (~41 s, **fixed at 264 by PostgREST's 1000-row cap**). **The only fix that addresses both is returning fewer rows — SQL-side aggregation.**
2. **In-process cache doesn't survive serverless cold starts** (`_serverCache`, `route.ts:74`). The 5-min cache only helps within a warm Lambda; on Vercel each cold instance re-pays the full fetch (R-16). Production users hit cold instances repeatedly.
3. **Persona-coupled financial refetch + JS scope filtering** (`route.ts:1354`). Every financial page re-fires on persona switch; the route re-filters all cheques in JS. Bounded, but re-pays the fetch if the cache expired.
4. **PDR-04 global provider tax** — `SessionProvider`'s 6 count queries + Tenant/Persona/Auth ≈ 12–13 cold requests/page. Platform-wide (affects BCL too); not the financial-delay cause but a real latency floor.
5. **JS aggregation** — 39–307 ms warm. **Not a bottleneck** at current scale.

---

## RECOMMENDED OPTIMIZATIONS (ranked by impact; C3 — not implemented)

> A targeted optimization HF should scope #1 first; it alone resolves the observed defect and is the only option that scales.

1. **[HIGHEST] Push aggregation to SQL (Postgres RPC functions or views).** Replace the 263 K-row fetch + JS aggregation with server-side `GROUP BY`/`SUM` (one RPC per mode shape, or a few shared aggregate RPCs returning per-location / per-day / per-staff rollups). Returns ~20 location rows instead of 263 K. **Expected: ~96.7 s → <1 s cold (~100×)**; eliminates the 150 MB payload *and* the 264 round-trips. Evidence: `COUNT` of the same set = 250 ms. **Complexity:** medium-high (author SQL per mode; architect applies via SQL Editor, SR-44). **Risk:** medium — SQL output must reconcile byte-for-byte against current JS aggregates (reconciliation gate required). **Scales to 2.6 M / 26 M.**
2. **[HIGH] Precomputed summary table / materialized aggregates refreshed on import.** Compute per-location/day/staff rollups at import time into a small table; pages query KB not MB. **Expected: <500 ms cold.** **Complexity:** high (new table + refresh hook in the import pipeline). **Risk:** medium (staleness; refresh-on-new-data). Best long-term for 100×.
3. **[MEDIUM] Durable cache** (Redis / a `financial_cache` table) keyed by `(tenant, mode, scope, data_version)`, invalidated on import. Fixes R-16/#2 — survives serverless cold starts. Must combine with #1/#2 (first request still pays the cost). **Complexity:** medium. **Risk:** low-medium (invalidation correctness).
4. **[MEDIUM] Push `scopeEntityIds` into the SQL `WHERE` (`entity_id IN (...)`)** instead of fetching all rows then filtering in JS (`route.ts:1354`). A scoped manager/rep then fetches only their rows. Combined with #1, persona-scoped queries return tiny sets and cut persona-switch cost. **Complexity:** low-medium. **Risk:** low.
5. **[MEDIUM] If the row fetch must remain short-term:** a DB **view projecting `row_data->>'field'` into typed columns** removes ~54 s/150 MB of JSONB-key overhead — but keeps 264 round-trips (~41 s). **Partial; not sufficient alone.** Lower value than #1.
6. **[LOW-MEDIUM] PDR-04:** consolidate `SessionProvider`'s 6 count queries into one RPC; keep persona scope cached. Trims the ~12–13 cold-load platform requests. Platform-wide benefit; secondary to #1 for `/financial`.
7. **[LOW] Cache empty/`null` tenant results** (`route.ts:120` returns before caching) so 0-row tenants don't re-query ~333 ms each request. Trivial.
8. **[LOW] `aggregateCheques`** is the only `O(N log N)` (full-N sort, `route.ts:1304`) — it's drill-through (output capped 200). At scale, push its filter+sort+limit to SQL (`ORDER BY fecha LIMIT 200`). Low priority until scale.

---

## SCALE PROJECTION

JS aggregation is **O(N)** for all modes (a few ~kN, k≤4; `aggregateCheques` O(N log N); `aggregateStaff` has an N-independent O(S²) in staff count). **Time scales ~linearly, but the wall is MEMORY/PAYLOAD in `fetchRawDataServer`** (full `row_data` per row, module-cached). Per-row ≈ 622 B wire / ~1.2 KB resident.

| Scale | Rows | Transfer | Resident | Round-trips | Cold fetch (localhost) | Verdict |
|---|---|---|---|---|---|---|
| **1×** (Sabor today) | 263 K | 163.9 MB | ~315 MB | 264 | ~96.7 s | Slow but works |
| **10×** (200 locations, 2 yrs) | 2.6 M | ~1.5 GB | ~3.1 GB | ~2,600 | ~16 min | **OOM risk; infeasible** |
| **100×** | 26 M | ~15 GB | ~31 GB | ~26,000 | hours | **Categorically infeasible** |

With recommendation **#1 (SQL aggregation)**, every tier returns in **~hundreds of ms to low seconds** (index-served `GROUP BY`), because only ~20 aggregate rows cross the wire **regardless of N**. The current architecture does not reach 10×; SQL aggregation is not an optimization but a **prerequisite for scale**.

---

## RESIDUALS

- **R-16 (production vs localhost).** The 96.7 s localhost number is inflated by geographic round-trip latency to remote Supabase (~366 ms × 264). In-region production (Vercel + Supabase co-located) would be faster per trip but still **multi-second** (163.9 MB transfer + Postgres JSONB serialization of 263 K rows + 264 round-trips even at ~10 ms ≈ 2.6 s of latency alone), and the in-process cache rarely survives cold serverless instances. The **architectural defect — fetch 163.9 MB to compute 8 KB — is latency-independent**. Production-grade numbers require Vercel/Supabase dashboard profiling (separate measurement).
- **R-17 (chart rendering).** Recharts client-render time was not measured (no browser harness). Response payloads are tiny (4–35 KB), so client render is unlikely to be the dominant cost; if charts feel slow it is a separate client-side concern.
