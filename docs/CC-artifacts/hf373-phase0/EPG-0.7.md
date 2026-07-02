# HF-373 Phase 0 — EPG-0.7

**Verdict:** PARTIAL

**Root cause:** The post-commit summary engine's JS path (backfillSummariesJs, taken whenever the tenant has ANY comprehension_artifacts labels — which all 6 data-bearing tenants now have) reads the ENTIRE tenant's committed_data via PostgREST OFFSET pagination with the shape `.select('entity_id, source_date, data_type, row_data').eq('tenant_id', tenantId).order('id', {ascending:true}).range(offset, offset+999)` (summary-engine.ts:210-215). committed_data.id is a uuid_generate_v4() PRIMARY KEY and the only tenant indexes are (tenant_id) and (tenant_id, data_type) — there is NO (tenant_id, id) composite index (003_data_and_calculation.sql:52,79-83). Against the live 672,291-row shared table this shape hits Supabase's ~8s statement timeout two ways: (A) for a rare tenant the planner's id-order scan filters the whole table and times out on the FIRST page (Casa Diaz, 186 rows: 8.1-8.3s timeout reproduced twice, even selecting only `id`; same query without order or ordered by created_at: 119-140ms); (B) for a large tenant, deep OFFSET pages re-sort/skip the tenant's whole row set each page (Sabor 263,250 rows: OK at offset 0/1000, timeout at offset>=50,000; Test #A1 331,714 rows: timeout at offset>=165,000), so the full scan can never complete. The error propagates as `committed_data read: canceling statement due to statement timeout` (throw at summary-engine.ts:216) up through runSummaryEngine (:291) into finalize-import's step-4 catch (route.ts:136-138), which console.errors and CONTINUES — completeFinalize (:146) and job status 'finalized' (:149) run anyway. Result: silently absent/stale summary_artifacts (Casa Diaz: 0 rows despite fresh 2026-07-02 import; Test #A1: 0 rows). Note the delete of old artifacts happens only AFTER a successful full read (:245), so a read-phase timeout leaves prior artifacts stale rather than wiped.

**HALT-1 notes:** The directive's three core claims are CONFIRMED: (1) the exact log line exists (route.ts:137 catches and logs "summary engine failed: <err>", and the thrown message "committed_data read: canceling statement due to statement timeout" comes from summary-engine.ts:216); (2) the failure is logged-but-swallowed — the catch at finalize-import/route.ts:136-138 does not rethrow, `summary` stays null, and execution proceeds to completeFinalize (:146) and markJobsByProposal status='finalized' (:149), so the import completes "as if fine"; (3) at large-tenant scale the scan genuinely cannot complete. BUT the "large tenant" attribution is INCOMPLETE/WRONG as the mechanism: live reproduction shows the read times out deterministically on Casa Diaz with only 186 rows (8.1-8.3s, twice, even with select('id') and no row_data), on PAGE 0. There are TWO distinct failure modes, both rooted in the query shape `.eq('tenant_id',X).order('id').range(offset, offset+999)` against a 672,291-row shared table whose PK `id` is uuid_generate_v4() with NO composite (tenant_id, id) index: (Mode A — small/rare tenant) the planner walks the whole table's id-order (PK index) filtering for the rare tenant and cannot fill LIMIT 1000 within the ~8s statement timeout — removing .order('id') or ordering by created_at returns the same 186 rows in 119-140ms; (Mode B — large tenant) page 0 is fast (360ms) but OFFSET-based paging degrades: Sabor (263,250 rows) times out at offset>=50,000 and Test #A1 (331,714 rows) at offset>=165,000, so the 264+/332-page JS scan can NEVER finish regardless of plan. Consequence visible live: Casa Diaz (last finalize 2026-07-02 01:29, status=finalized) has 0 summary_artifacts; Test #A1 has 0 summary_artifacts despite 331,714 committed rows. The fix must address the query shape/index/aggregation locus, not merely tenant-size chunking.

**Fix implications:** The fix must eliminate the JS whole-tenant OFFSET scan of committed_data as the summary aggregation locus, not merely chunk it, because BOTH failure modes are structural: (Mode A) `.order('id')` on a uuid PK with no (tenant_id, id) composite index makes even a 186-row tenant's PAGE-0 read exceed the ~8s statement timeout on the 672K-row shared table (plan walks the whole table in id order); (Mode B) OFFSET-depth degradation makes a 263K/331K-row tenant's scan deterministically unfinishable (timeouts from offset ~50K). Constraints observed: (1) Supabase PostgREST statement timeout is ~8s (observed 8107-8255ms) and applies per statement, service-role included; (2) all data-bearing tenants have labeled comprehension_artifacts, so the 'RPC fast path' at summary-engine.ts:287-290 is dead in practice — every real tenant takes backfillSummariesJs; (3) backfillSummariesJs also RETAINS all rows in memory (rows.push, summary-engine.ts:206/219 — DIAG-078 OOM class) and deletes old artifacts only after a successful read (:245), so today a timeout leaves absent/stale artifacts silently (Casa Diaz: 0 artifacts after a 'finalized' 2026-07-02 import; Test #A1: 0 artifacts over 331,714 rows). Concrete options the evidence supports: (a) move label/method-aware aggregation into SQL — extend compute_summary_artifacts (web/supabase/migrations/20260622_ob229_summary_engine.sql:14) to accept the labelMap/methodMap as jsonb parameters and do the whole aggregation set-based DB-side (one statement, no OFFSET; the existing RPC already proves the jsonb_each pattern); if a single statement risks the 8s ceiling at 331K rows, route it through the pg_cron worker precedent (HF-360 process_pulse_load_jobs) or a SET LOCAL statement_timeout inside the SECURITY DEFINER function; (b) any remaining per-tenant id-ordered scan (including web/src/lib/revenue/materializer.ts:72-92 scanCommittedData and every lib/serving/paged.ts pagedScan caller with this shape) requires a NEW MIGRATION adding a composite index ON committed_data (tenant_id, id) — that alone fixes Mode A and enables keyset pagination (.gt('id', lastId).order('id').limit(N)) which fixes Mode B without OFFSET; (c) the swallow at finalize-import/route.ts:136-138 must become observable: record the failure on processing_jobs.error_detail / metadata (markJobsByProposal is already imported) or the finalize response, so an import whose summaries failed is not reported clean; (d) destination tables: summary_artifacts (live columns: id, tenant_id, entity_id, summary_date, period_id, data_type, metrics, row_count, convergence_hash, computed_at, created_at) for the engine, and summary_rollups (EXISTS live with uq_summary_rollups_grain; currently only BCL revenue_* namespaces) if the fix adopts the OB-257 Materialized-Serving-Path/namespace-writer pattern — writers own a data_type namespace and replace only their own rows, which would also retire the tenant-wide summary_artifacts wipe at summary-engine.ts:245. Tables/files to touch: web/src/lib/summary/summary-engine.ts, web/src/app/api/import/sci/finalize-import/route.ts, new supabase migration (composite index + extended RPC), and — same defect class — web/src/lib/revenue/materializer.ts / web/src/lib/serving/paged.ts. Probe scripts left in place (read-only): web/scripts/_hf373_epg07_scale.ts, web/scripts/_hf373_epg07_isolate.ts, web/scripts/_hf373_epg07_freshness.ts.

## Evidence

### web/src/app/api/import/sci/finalize-import/route.ts:129-138 (call chain from finalize + catch site: logged-but-swallowed)

```
    // 4. OB-229: pre-compute summary_artifacts now that committed_data is written AND entity resolution
    //    is done (step 1). Production path is the SQL RPC (fast); JS fallback until the RPC is applied.
    //    Awaited (HF-300 reliability model — post-response work dies on Vercel).
    let summary: { written: number; skipped: number; via: 'rpc' | 'js' } | null = null;
    try {
      summary = await runSummaryEngine(supabase, tenantId, trace);
      trace(`summary-engine-done via=${summary.via} written=${summary.written} skipped=${summary.skipped}`);
    } catch (err) {
      console.error('[SCI Finalize] summary engine failed:', err instanceof Error ? err.message : err);
    }
```

### web/src/app/api/import/sci/finalize-import/route.ts:146-150 (finalize proceeds as if fine after the swallow)

```
    await completeFinalize(supabase, tenantId, proposalId, true);

    // HF-372 Phase D: the import is COMPLETE — the job record says so, server-side, before insights.
    await markJobsByProposal(supabase, tenantId, proposalId, { status: 'finalized', phase: 'completed', completedAt: true });
    trace('import-complete (insights follow off the critical path)');
```

### web/src/lib/summary/summary-engine.ts:205-223 (the timing-out committed_data read: whole-tenant scan, OFFSET pagination, PAGE=1000, order by uuid id, all rows RETAINED in memory)

```
  const PAGE = 1000;
  const rows: CommittedRow[] = [];
  let scanned = 0;
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('committed_data')
      .select('entity_id, source_date, data_type, row_data')
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`committed_data read: ${error.message}`);
    if (!data || data.length === 0) break;
    scanned += data.length;
    rows.push(...(data as CommittedRow[]));
    log(`scanned ${scanned}`);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
```

### web/src/lib/summary/summary-engine.ts:275-293 (entry point + path selection: ANY comprehension label/method => JS scan path; RPC only for tenants with NO comprehension)

```
export async function runSummaryEngine(
  sb: SupabaseClient,
  tenantId: string,
  log: (m: string) => void = () => {},
): Promise<{ written: number; skipped: number; via: 'rpc' | 'js' }> {
  try {
    const n = await recognizeLabelsAndMethods(sb, tenantId);
    if (n > 0) log(`recognized label+method for ${n} fields`);
  } catch (err) {
    log(`label/method recognition failed (continuing): ${err instanceof Error ? err.message : err}`);
  }
  const { labelMap, methodMap } = await buildSemanticMaps(sb, tenantId);
  if (Object.keys(labelMap).length === 0 && Object.keys(methodMap).length === 0) {
    const rpc = await runSummaryEngineRpc(sb, tenantId);
    if (rpc) return { ...rpc, via: 'rpc' };
  }
  const js = await backfillSummariesJs(sb, tenantId, labelMap, methodMap, log);
  return { written: js.written, skipped: js.skipped, via: 'js' };
}
```

### web/src/lib/summary/summary-engine.ts:244-246 (stale-artifact consequence: delete happens only AFTER a successful full read, so a read timeout leaves OLD artifacts in place / none ever written)

```
  // idempotent replace (Constraint 6)
  const { error: delErr } = await sb.from('summary_artifacts').delete().eq('tenant_id', tenantId);
  if (delErr) throw new Error(`summary_artifacts delete: ${delErr.message}`);
```

### web/supabase/migrations/003_data_and_calculation.sql:51-60,79-83 (committed_data DDL: uuid_generate_v4 PK; NO (tenant_id, id) composite index)

```
CREATE TABLE committed_data (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
  entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
  period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
  data_type       TEXT NOT NULL,
  row_data        JSONB NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
...
CREATE INDEX idx_committed_data_tenant ON committed_data(tenant_id);
CREATE INDEX idx_committed_data_entity ON committed_data(entity_id);
CREATE INDEX idx_committed_data_period ON committed_data(period_id);
CREATE INDEX idx_committed_data_type ON committed_data(tenant_id, data_type);
CREATE INDEX idx_committed_data_batch ON committed_data(import_batch_id);
```

### probe _hf373_epg07_scale.ts — live committed_data row counts (total + per tenant; only tenants with rows shown)

```
=== committed_data counts ===
TOTAL: 672291
Almacenes Mirasol (972c8eb0-e3ae-4e4c-ad30-8b34804c893a): 75227
Banco Cumbre del Litoral (b1c2d3e4-aaaa-bbbb-cccc-111111111111): 595
Casa Diaz (2d9979ba-5032-48a7-bccf-1928f3e6dadf): 186
Meridian Logistics Group (5035b1e8-0754-4527-b7ec-9f93f85e4c79): 304
Sabor Grupo Gastronomico (f7093bcc-e90b-4918-9680-69da7952dd65): 263250
Test #A1 (abb9da8d-d6d5-4ebc-af42-ebb9c972bd8b): 331714
Tomi Test #1 (03d28288-700b-43e3-a96b-49a4f849d2df): 400
VLTEST2 (5b078b52-55c9-4612-8f86-96038c198bfe): 615
```

### probe _hf373_epg07_scale.ts — FP-49 committed_data column introspection (1 live row)

```
=== committed_data columns ===
id, tenant_id, import_batch_id, entity_id, period_id, data_type, row_data, metadata, created_at, source_date
row_data type: object keys: 27
```

### probe _hf373_epg07_isolate.ts — LIVE REPRODUCTION of the exact error, Mode A (Casa Diaz, 186 rows, page 0): order('id') is the trigger, not row volume; ~8s = statement timeout

```
=== Casa Diaz (186 rows) variants ===
  exact engine shape (order id, range 0-999), attempt 1: ERROR after 8255ms -> canceling statement due to statement timeout
  exact engine shape, attempt 2: ERROR after 8107ms -> canceling statement due to statement timeout
  NO order, range 0-999: 186 rows in 140ms
  order created_at, range 0-999: 186 rows in 119ms
  order id, small select (no row_data): ERROR after 8109ms -> canceling statement due to statement timeout
```

### probe _hf373_epg07_isolate.ts — Mode B (large tenants): OFFSET-depth degradation makes the full paged scan unfinishable

```
=== Sabor Grupo Gastronomico (263,250 rows) — page-depth degradation ===
  order id, offset=0: 1000 rows in 360ms
  order id, offset=1000: 1000 rows in 615ms
  order id, offset=50000: ERROR after 8140ms -> canceling statement due to statement timeout
  order id, offset=130000: ERROR after 8113ms -> canceling statement due to statement timeout
  order id, offset=262000: ERROR after 8114ms -> canceling statement due to statement timeout

=== Test #A1 (331,714 rows) — first page + deep page ===
  order id, offset=0: 1000 rows in 378ms
  order id, offset=165000: ERROR after 8118ms -> canceling statement due to statement timeout
  order id, offset=330000: ERROR after 8111ms -> canceling statement due to statement timeout

=== VLTEST2 (615 rows) re-check ===
  exact engine shape: 615 rows in 203ms
```

### probe _hf373_epg07_freshness.ts — swallowed-failure consequence live: tenants with fresh imports but ABSENT summary_artifacts

```
VLTEST2: summary_artifacts=85 newest_computed_at=2026-07-02T01:03:12.096+00:00 newest_committed_data=2026-07-02T01:02:22.910944+00:00
Casa Diaz: summary_artifacts=0 newest_computed_at=NONE newest_committed_data=2026-07-02T01:21:05.81015+00:00
Sabor: summary_artifacts=2520 newest_computed_at=2026-06-25T01:25:38.164+00:00 newest_committed_data=2026-06-21T05:57:25.952051+00:00
Test #A1: summary_artifacts=0 newest_computed_at=NONE newest_committed_data=2026-06-28T18:11:32.238086+00:00
Mirasol: summary_artifacts=5429 newest_computed_at=2026-06-26T04:34:01.815+00:00 newest_committed_data=2026-06-26T04:31:30.073062+00:00
BCL: summary_artifacts=516 newest_computed_at=2026-06-25T02:35:59.04+00:00 newest_committed_data=2026-06-21T13:59:43.573937+00:00
```

### probe _hf373_epg07_isolate.ts — last-48h evidentiary finalize runs (processing_jobs; columns: id, tenant_id, status, file_storage_path, file_name, file_size_bytes, structural_fingerprint, classification_result, recognition_tier, proposal, chunk_progress, error_detail, retry_count, uploaded_by, session_id, created_at, started_at, completed_at, batch_id, chunk_id, total_chunks, metadata)

```
2026-07-02T01:29:09 tenant=2d9979ba status=finalized file=..._Abril_00001_1_demo_REF.xlsx meta={"phase":"completed","phase_at":"2026-07-02T01:37:04.186Z",...}
2026-07-02T01:11:11 tenant=2d9979ba status=committed file=..._COMISIONES___AUTORIZADOS_-_copia.xlsx meta={"phase":"finalizing",...}
2026-07-02T01:00:56 tenant=5b078b52 status=finalized file=..._BCL_Datos_Dic2025.xlsx meta={"phase":"completed",...} (+5 sibling Datos files, all finalized)
[Casa Diaz finalized at 01:29/01:37 yet has 0 summary_artifacts -> the summary step failed and was swallowed on this run]
```

### probe _hf373_epg07_scale.ts — path selector: every data-bearing tenant has labeled comprehension => ALL take the vulnerable JS scan path, never the RPC

```
=== comprehension_artifacts (path selector: >0 labeled rows => JS path) ===
Almacenes Mirasol: total=29 withDisplayLabel=29
Banco Cumbre del Litoral: total=21 withDisplayLabel=21
Casa Diaz: total=39 withDisplayLabel=39
Robles Maquinaria: total=20 withDisplayLabel=20
Sabor Grupo Gastronomico: total=27 withDisplayLabel=27
VLTEST2: total=35 withDisplayLabel=35
```

### probe _hf373_epg07_scale.ts — FP-49 destination table summary_artifacts (live introspection; DDL not in repo migrations, table pre-exists)

```
=== summary_artifacts ===
columns: id, tenant_id, entity_id, summary_date, period_id, data_type, metrics, row_count, convergence_hash, computed_at, created_at
metrics sample: {"mesa":2074,"folio":535161994,"total":56914.749999999985,"pagado":56478.00999999998,"propina":6595.619999999999,"tarjeta":31158.499999999993,"efectivo":25756.230000000014,"subtotal":50878.019999999975,"turno_id":254,"cancelado":1,"descuento":818.9300000000001,"mesero_id":271,"comp_count":50,...}
```

### probe _hf373_epg07_scale.ts — FP-49 summary_rollups (OB-257) EXISTS live; currently only BCL revenue namespaces

```
=== summary_rollups (OB-257) ===
exists; total rows: 583
columns: id, tenant_id, period_id, summary_date, data_type, entity_id, dimension_role, dimension_member, metrics, row_count, computed_at, created_at
sample row: {"id":"1c474645-...","tenant_id":"b1c2d3e4-aaaa-bbbb-cccc-111111111111","period_id":null,"summary_date":null,"data_type":"revenue_meta",...}
  b1c2d3e4-...|revenue_dimension_period: 66
  b1c2d3e4-...|revenue_entity_period: 510
  b1c2d3e4-...|revenue_meta: 1
  b1c2d3e4-...|revenue_period: 6
```

### web/supabase/migrations/20260704_ob257_summary_rollups.sql:18-50 (summary_rollups DDL — applied live; unique grain guard)

```
create table if not exists public.summary_rollups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_id uuid references public.periods(id) on delete cascade,
  summary_date date,
  data_type text not null,           -- writer-owned namespace (open vocabulary, AP-26)
  entity_id uuid references public.entities(id) on delete cascade,
  dimension_role text,
  dimension_member text,
  metrics jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
...
create unique index if not exists uq_summary_rollups_grain
  on public.summary_rollups (
    tenant_id, data_type,
    coalesce(period_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(dimension_role, ''), coalesce(dimension_member, '')
  );
```

### web/supabase/migrations/20260622_ob229_summary_engine.sql:14-43 (existing SQL RPC candidate — set-based, DB-side, one statement, currently reached only when tenant has NO comprehension)

```
CREATE OR REPLACE FUNCTION compute_summary_artifacts(p_tenant_id uuid)
RETURNS TABLE (artifacts_written integer, rows_skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
...
  WITH fields AS (
    SELECT cd.entity_id, cd.source_date, cd.data_type, kv.key AS k,
           sum((kv.value)::numeric) AS v_sum
    FROM committed_data cd
    CROSS JOIN LATERAL jsonb_each(cd.row_data) kv
    WHERE cd.tenant_id = p_tenant_id
      AND cd.entity_id IS NOT NULL
      AND cd.source_date IS NOT NULL
      AND jsonb_typeof(kv.value) = 'number'
    GROUP BY cd.entity_id, cd.source_date, cd.data_type, kv.key
  ),
```

### web/src/lib/revenue/materializer.ts:72-92 (OB-257 materializer uses the SAME vulnerable scan shape — same D8 class; also the MSP single-writer precedent)

```
/** Paged committed_data scan: each page is handed to onPage then discarded (bounded memory). */
async function scanCommittedData(
  sb: SupabaseClient,
  tenantId: string,
  columns: string,
  onPage: (rows: Record<string, unknown>[]) => void,
): Promise<void> {
  try {
    await pagedScan<Record<string, unknown>>(
      (from, to) =>
        sb
          .from('committed_data')
          .select(columns)
          .eq('tenant_id', tenantId)
          .order('id', { ascending: true }) // unique key -- no page-boundary duplicates
          .range(from, to),
      onPage,
    );
  } catch (err) {
    throw new Error(`committed_data read: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

### web/src/lib/serving/paged.ts:22-37 (shared OFFSET-pagination helper — the pattern's single definition)

```
export async function pagedScan<T>(
  build: PageQuery,
  onPage: (rows: T[]) => void,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<void> {
  let offset = 0;
  for (;;) {
    const { data, error } = await build(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    if (rows.length === 0) break;
    onPage(rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
}
```

### grep resolveEntityIds / resolve-entity-ids across web/src (excluding its own file)

```
(no matches) — web/src/lib/summary/resolve-entity-ids.ts (which contains an identical committed_data read shape at :70-73) has ZERO importers; it is NOT on the finalize path, so the logged error's throw site is definitively summary-engine.ts:216. The only other runSummaryEngine caller is web/src/app/api/admin/summary/backfill/route.ts:25 (platform-admin manual recompute; there the error is NOT swallowed — returned as HTTP 500).
```

