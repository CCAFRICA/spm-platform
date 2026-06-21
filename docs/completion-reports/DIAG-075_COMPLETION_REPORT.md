# DIAG-075 — Completion Report

**Branch:** `diag-075-performance-profiling` · **Date:** 2026-06-21 · **Mode:** READ-ONLY (zero application code changed).

## Deliverable
`docs/diagnostics/DIAG-075_PERFORMANCE_PROFILE.md` — full M1–M5 profile, bottleneck ranking, optimization recommendations, scale projection.

## Headline
The `/financial` delay is a **single architectural defect**: `fetchRawDataServer` (`route.ts:77-125`) fetches **every `pos_cheque` row with full `row_data` JSONB into JavaScript and aggregates in-process**. For Sabor that is **263,250 rows = 163.9 MB over 264 sequential round-trips = ~96.7 s cold** — to return **4–35 KB**. A SQL `COUNT` of the same set is **250 ms**; BCL (0 rows) is **333 ms**. The defect is **100 % data-volume driven (Sabor)**, not platform-context overhead.

## How measured (Rule 7 — Prove Don't Describe)
A standalone harness invoked the **real** `POST` handler per mode (cold = fresh process / cache miss; warm = cache hit) and replicated its exact Supabase queries to decompose cost. A 4-agent read-only workflow covered query/index, page network, persona switching, and aggregator complexity. No instrumentation left in app files.

## Key numbers
- Sabor cold raw-fetch **96,805 ms** (163.9 MB, 264 pages); warm per-mode agg **39–307 ms**; response **4–35 KB**.
- Decomposition: JSONB payload ≈ **54 s / 150 MB**; round-trips ≈ **41 s** (264, **forced by PostgREST's 1000-row cap** — bigger page size does not help); `COUNT` = **250 ms**.
- BCL baseline **333 ms** (0 rows) → ~**290×** gap, isolating the cause to volume.
- Index `idx_committed_data_type (tenant_id, data_type)` **exists and serves the filter** — **not** a missing-index problem.

## HALT outcomes
- **HALT-1** (exec_sql RPC): `exec_sql` confirmed **absent**; index status obtained via migrations → **KNOWN** (not UNKNOWN). Documented.
- **HALT-2** (architecture changed): no — still mode-based POST. N/A.
- **HALT-3** (persona switcher): functional; M4 traced from code (no live browser). N/A.

## Top recommendation (for a follow-up optimization HF — C3: not implemented here)
**Push aggregation to SQL** (Postgres RPC/views returning per-location/day/staff rollups). Expected **~96.7 s → <1 s cold (~100×)**; eliminates both the 150 MB payload and the 264 round-trips; the **only** option that scales to 10×/26× (current architecture OOMs at 2.6 M rows). Full ranked list (durable cache, SQL scope-filter, summary table, PDR-04 count consolidation) in the profile.

## Residuals
R-16 localhost↔remote latency inflates the absolute seconds (production multi-second, separate measurement); the *defect* (fetch 163.9 MB to compute 8 KB) is latency-independent. R-17 chart render not measured (tiny payloads make it unlikely dominant). Side-finding: BCL `null` results are never cached (`route.ts:120`) — every empty-tenant request re-queries ~333 ms (trivial fix).

**Commit:** directive + profile + this report. Zero application code in the diff.
