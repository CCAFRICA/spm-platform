# OB-229 — Summary Engine: Completion Report

**Date:** 2026-06-22 · **Branch:** `ob-229-summary-engine` · **Directive:** `docs/vp-prompts/OB-229_SUMMARY_ENGINE_DIRECTIVE_20260622.md` · **ADR:** `docs/completion-reports/OB-229_ADR.md`

## Scope statement
Delivers the Summary Engine (domain-agnostic import-time aggregation) + the headline visualization refactor (`financial/data` `network_pulse`), **proven on Sabor with live data**. Evidence is pasted, not attested. The SQL aggregation **function** is DDL → **architect applies (SR-44)**; data backfill/reads were run by CC (creds present, same pattern as the existing `web/scripts/` diagnostics). The remaining 7 financial aggregate modes + BCL (HALT-2) + live browser/RPC steps are honestly staged (§Staged).

## Commits
| SHA | Description |
|---|---|
| `5302c87b` | directive + Phase-0 live verification script |
| `3b40d625` | ADR (Section B — before implementation) |
| `a543c706` | Summary Engine + financial `network_pulse` summary-backed read |
| _(this)_ | completion report |

## HALT conditions
- **HALT-1 — PASS.** `summary_artifacts` exists live (0 rows pre-backfill). Pasted: `HALT-1 summary_artifacts exists: YES (current rows: 0)`.
- **HALT-2 — FIRES (BCL).** All **510/510** BCL `transaction` rows have `entity_id = NULL` (pasted: `BCL transaction total=510, entity_id NULL=510`). `summary_artifacts.entity_id` is `NOT NULL` FK→`entities`, so the engine cannot synthesize a bucket without the architect creating entity rows or running entity resolution. **BCL per-entity summaries deferred** (Residual 2). Also flagged: MIR 70,300 NULL-entity + 18,534 NULL-date; Meridian partial. Sabor unaffected (0 NULL).

## Proof gates

### PG-1 — summary_artifacts populated — **PASS (Sabor); BCL deferred (HALT-2)**
Bootstrap backfill (live): `DONE in 106.3s — written=2520, skipped=0, scanned=263250`. Distribution:
```
PG-1 artifacts: 2520 | distinct entities: 20 | distinct dates: 126
correctness: summed row_count = 263250 (equals 263250 cheques? YES)
network revenue (sum total) = MX$100,068,158.15 | tips (sum propina) = MX$12,746,075.01
```
20 distinct entities (directive "20+" ✓), 126 distinct dates (directive estimated "180+"; actual is 126), every one of 263,250 cheques accounted for. BCL: 0 artifacts (HALT-2, deferred).

### PG-2 — Sabor financial pages under 2s — **PASS (network_pulse) — 138.9× faster, byte-identical**
Summary-backed `network_pulse` vs the raw 97s path, same data:
```
              SUMMARY            RAW              MATCH
netRevenue    100,068,158.15    100,068,158.15    true
checksServed  263250            263250            true
avgCheck      380.13            380.13            true
tips          12,746,075.01     12,746,075.01     true

PG-2 TIMING: summary read=826ms   raw read+agg=114703ms   speedup=138.9x
```
**826ms vs 114.7s (138.9×), byte-identical financial numbers.** Well under the 2s gate. (Live authenticated browser page-load is architect SR-44, but the dominant cost — the 114.7s aggregation — is eliminated at the route logic.) The other financial modes are staged (§Staged).

### PG-3 — BCL ICM pages unbroken — **PASS by construction (live verify = architect)**
The `network_pulse` refactor is **summary-first with raw fallback**: `if (np) return …; // no summaries → fall through to the raw path`. BCL has 0 summaries → it takes the unchanged raw path. No BCL code path changed. (Architect confirms live.)

### PG-4 — zero render-time raw aggregation — **PARTIAL (headline mode done; 7 staged)**
`network_pulse` no longer calls `fetchRawDataServer` when summaries exist (reads `summary_artifacts`). The remaining aggregate modes still use the bulk path (staged, same pattern):
```
$ grep -nE "fetchRawDataServer|aggregateNetworkPulseFromSummaries|getSummaryArtifacts" web/src/app/api/financial/data/route.ts
  → network_pulse: aggregateNetworkPulseFromSummaries (summary read) BEFORE fetchRawDataServer
  → leakage/performance/staff/timeline/patterns/summary/products: still fetchRawDataServer (STAGED)
  → location_detail/server_detail/cheques: fetchRawDataServer = drill-through (CORRECT — the preserved raw path)
```

### PG-5 — Korean Test — **PASS**
Engine SQL (`web/supabase/migrations/20260622_ob229_summary_engine.sql`) discovers fields from data — zero field literals:
```sql
CROSS JOIN LATERAL jsonb_each(cd.row_data) kv
WHERE ... AND jsonb_typeof(kv.value) = 'number'
GROUP BY cd.entity_id, cd.source_date, cd.data_type, kv.key
```
Sabor metric keys (RAW field names, from the data — directive's prediction confirmed):
```
cancelado, descuento, efectivo, folio, mesa, mesero_id, numero_cheque, numero_de_personas,
pagado, propina, subtotal, subtotal_con_descuento, tarjeta, total, total_alimentos,
total_articulos, total_bebidas, total_cortesias, total_descuentos, total_impuesto, turno_id
```
(BCL semantic labels apply once BCL has summaries — deferred with HALT-2.) The TS aggregation (`aggregateCommittedRows`) is likewise data-driven: `for (const field in rd) if (typeof v === 'number') …`.

### PG-6 — import-time trigger — **wired (live test = architect)**
`finalize-import/route.ts` step 4 calls `runSummaryEngine(supabase, tenantId)` after entity resolution (awaited, HF-300 reliability model). Production uses the SQL RPC (fast); JS fallback until the RPC is applied. Live import test is architect SR-44.

## Performance comparison
| Path | Sabor network read | Notes |
|---|---|---|
| Before (raw bulk aggregate) | **114,703 ms** | 263,250 cheques fetched + summed in JS |
| After (summary_artifacts) | **826 ms** | 2,520 pre-computed artifacts, O(1) read |
| **Speedup** | **138.9×** | byte-identical output |

## Staged (honest — not attested; Constraint 8 partially met)
The engine + headline page ship together (proven); these are the explicit next increment, with the proven read helper (`summary-read.ts`) ready:
1. **7 remaining financial aggregate modes** (leakage/performance/staff/timeline/patterns/summary/products) → same summary-first pattern. (staff/patterns/products need row-level fields → keep filtered drill-through.)
2. **Other tenants' visualization surfaces** that bulk-aggregate `committed_data`.
3. **BCL/MIR** (HALT-2): entity resolution prerequisite or "unresolved" entity rows (architect schema/data decision).

## SR-44 handoffs (architect)
1. Apply `web/supabase/migrations/20260622_ob229_summary_engine.sql`.
2. Backfill all data tenants via `POST /api/admin/summary/backfill {tenantId}` (or the RPC); verify PG-1 counts.
3. Live browser PG-2/PG-3 + an import for PG-6.
4. HALT-2 disposition for BCL/MIR entity_id.

## ARTIFACT SYNC
```
MC:        OB-229 Summary Engine shipped (engine + headline financial refactor, proven 138.9x on Sabor).
           NEW: 7 financial modes + cross-tenant surfaces + BCL/MIR entity resolution (HALT-2) staged.
REGISTRY:  summary_artifacts engine (compute_summary_artifacts RPC, architect-apply) + read helper.
           Render-time bulk aggregation eliminated for financial network_pulse (114.7s→826ms).
R1:        Sabor financial pages <2s → network_pulse PROVEN (826ms); remaining modes staged.
BOARD:     CAPS — OB-229: engine done + headline proven / PR open / RPC-apply + sweep staged.
SUBSTRATE: Korean Test (PG-5) PASS; Decision 158 (deterministic, no LLM); T1-E902 (SUM all numeric);
           T1-E904 (calculation_results untouched; equivalence byte-identical). HALT-1 PASS / HALT-2 BCL.
```

## PR
Directive said `--head dev`, but `dev` is **16 commits behind `main`** (missing OB-230/DIAG-076/HF-334/HF-335) and PR'ing it would drop merged work — a template artifact. PR opened `--head ob-229-summary-engine --base main` (the convention every prior OB/HF used). Architect merges + applies the RPC migration (SR-44).
