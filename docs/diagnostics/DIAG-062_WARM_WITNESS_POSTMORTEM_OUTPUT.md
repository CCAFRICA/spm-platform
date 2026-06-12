# DIAG-062 — Warm-Witness Post-Mortem (OB-203 Phase 6B, Phase A)

**Date:** 2026-06-12 · **Branch:** `OB-203-phase-6` · **Tenant:** MX Restaurant `3d354bfa-b298-48dd-88a0-9f8c5a00be4e`
**Warm session:** `d8085364-72b1-4c6f-9d9e-20606fb14831` · **Discipline:** read-only; zero code shipped (read scripts only).
**Verdict:** **HALT-2 TRIGGERED at A4** (engine-visible Ventas ≠ 160,443; D16.1 gate alone double-counts). Phases B–E gated on HALT-1.

The cascade, one line: **A5 (heavy telemetry derive every 2s) → DB saturation → A2 (per-entity synchronous writes) slow to 9–23s/row → entity phase exceeds Vercel's 300s → response death → 5 entity rosters never create a batch → A3 cannot detect "no batch" → A1 panel shows stale telemetry.** A4 is an independent supersede-visibility hazard on the same census.

---

## A1 — Session-state persistence surface: DURABLE (signals); the EXECUTION is response-scoped

**Evidence — `web/src/lib/sci/comprehension-state-service.ts`:**
```
277  export async function rebuildSessionState(...) {
287      .from('classification_signals')          // unit-states reconstructed from the canonical signal table
326  export async function deriveImportTelemetry(...) {
338      .from('classification_signals')          // analyze counters
371      const view = await rebuildSessionState(...)
381      .from('import_batches')                  // execute counters (expected rows + per-unit)
         // + committed_data count by metadata->>proposalId (actual rows)
```
**Finding:** the session SPINE is **durable** — unit-states live in `classification_signals` (one canonical surface, Decision 64 v3 already satisfied), pulse/row counters derive from `import_batches` + `committed_data`, the conclusion summary derives from the same. **Nothing is process-memory-resident.** What IS response-scoped is the **execute LOOP itself** (the `for (const unit of sortedUnits)` in execute-bulk runs inside the HTTP request; F2 confirms no `processing_jobs` spine). Response death at 300s stops the loop; durable state is intact but **unprocessed units are orphaned**.

**Why "1 of 326 / 0 rows" after 11 commits:** the header ("11 of 16") reads the **cheap streamed unit-states** (`rebuildSessionState`, fast); the pulse panel reads the **heavy `deriveImportTelemetry`** (A5), which under saturation timed out / returned stale → 1 pulse / 0 rows, cycling. **Two panels, two surfaces, one screen → D19.** No data loss (F3): the committed rows are durable; only the derive was stale.

---

## A2 — Entity-resolution write pattern: PER-ENTITY SYNCHRONOUS — FAILS the DS-020 litmus

**Evidence — `web/src/app/api/import/sci/execute-bulk/route.ts`, `processEntityUnit` enrich loop:**
```
790  for (const eid of allIds) {                                  // ← per ENTITY
820    const { data: entData } = await supabase.from('entities').select('metadata').eq('id', entityId).single();   // 1 read / entity
829    await supabase.from('entities').update({ temporal_attributes..., metadata... }).eq('id', entityId);          // 1 write / entity
```
**DS-020 litmus (verbatim):** *"If it requires per-entity synchronous writes, it fails."* This path is **per-entity synchronous read + write** → **FAILS**.
- **(b) Why 6–50-row rosters take minutes while 160,443-row Ventas commits in seconds:** Ventas (transaction) is `commitContentUnit` **batch insert** (passes the litmus). A roster of N entities is **N×(fetch+update) round-trips**. Under the A5-induced saturation (round-trips observed at **9–23s each** in the run log), 50 entities ≈ 100 round-trips × ~15s ≈ **1,500s ≫ 300s**.
- **(c) Where the loop stopped:** the entity rosters are sorted FIRST (`PROCESSING_ORDER` entity=1), but the per-entity enrich loop never completed for the 5 rosters within the response window → they never reached their `commitContentUnit` call → **no `import_batches` row** (F1: zero batches for the 5). It is the **death of the response-scoped loop inside the slow entity phase**, not queue ordering.
- **(d) Why the entity phase emits no pulses/VERBOSE/telemetry:** `commitContentUnit` (which emits the `pulse` VERBOSE + creates the batch the telemetry counts) **was never reached**; the enrich loop emits nothing. The phase is structurally silent.

---

## A3 — D16.1 reconciliation vs "unit never created a batch": OUTSIDE the detection surface (invariant gap)

**Evidence — `web/src/lib/sci/committed-data-visibility.ts` (`reconcileStaleBatches`):**
```
36   .from('import_batches')
39   .neq('status', 'completed');     // detection iterates EXISTING batch rows only
```
**Finding:** reconciliation detects stale/partial batches by scanning `import_batches`. The 5 rosters produced **no `import_batches` row at all** (A2). A unit that never created a batch is **invisible to reconciliation** — there is nothing to scan. This is a **gap in the D16.1 invariant**: the self-heal covers *partial* commits, not *never-started* units. (No fix this phase; named for Phase B/§6A.)

---

## A4 — F4 supersede visibility: **CONFIRMED HAZARD (HALT-2)**

**Supersede WRITE — `web/src/lib/sci/import-batch-supersession.ts`:**
```
114    superseded_by: newBatchId,
115    superseded_at: new Date().toISOString(),   // mutates ONLY supersession columns — status stays 'completed'
```
**Read-side filters:**
```
148  fetchSupersededBatchIds(...)   156  .not('superseded_by', 'is', null)   // calc engine's HF-196 filter
// run-calculation.ts: q = q.not('import_batch_id','in',(supersededIds));  THEN  q = applyCommittedDataVisibility(q, hidden)
// committed-data-visibility.ts (D16.1 gate): hides only NON-completed batches — does NOT consider superseded_by
```

**Decisive check (live, tenant `3d354bfa`, Ventas_Transaccional):**
```
import_batches: total=26  completed=26  superseded(superseded_by != null)=10

AS THE ENGINE READS IT (HF-196 superseded filter applied):     160,315
D16.1 gate ONLY (status='completed', no superseded filter):    321,236   ← ≈2× : BOTH generations visible
```

**Finding — F4 confirmed at the predicate level:**
1. The **D16.1 visibility gate does NOT subsume supersession.** Status stays `completed` on superseded batches, so the gate (which hides only non-completed) leaves **both generations visible → 321,236 ≈ 320,886**. Any consumer relying on the D16.1 gate *alone* (per its ratified phrasing "reads count only `status='completed'`") **double-counts the fact table** — a Decision 95 reconciliation-invariant violation.
2. The **calc engine is protected only by the SEPARATE legacy HF-196 `fetchSupersededBatchIds` filter**, not by the D16.1 gate. With it, the engine reads **160,315** ≈ one generation.
3. **ANOMALY to disposition:** engine read **160,315 ≠ 160,443** (gap of **128 rows**). One generation, not a double — but not the exact warm count. Candidate causes (not resolved this phase): a partially-superseded boundary, or a read-pagination artifact in the evidence script. Flagged for architect.

**Per HALT-2:** engine ≠ 160,443 → halt; F4's fix (Phase E invariant: *exactly one generation visible to any consumer; supersession recorded on the surface visibility predicates actually read*) jumps to the front. **HALT-4 likely applies** (status-vocabulary or predicate change). The decisive risk is consumers that use the D16.1 gate without the HF-196 filter.

---

## A5 — Telemetry-derive cost: contends with the write path

**Evidence — `deriveImportTelemetry` (comprehension-state-service.ts):** per `?telemetry=1` poll (every 2s from `ImportTelemetryPanel`) it runs: a full `classification_signals` scan for the session, `rebuildSessionState` (another signals scan), an `import_batches` scan, **and a `committed_data` count by `metadata->>proposalId`** — the last against a table now holding **325,757 rows** (F3). Run log shows these polls at **9–23s each**. On the Small tier this **contends directly with the per-entity entity writes (A2)**, which is what stretched each entity round-trip to 9–23s and starved the entity phase. The poll cadence (2s) is far below the query latency → pile-up → sustained saturation → `getUser()` middleware timeouts.

---

## Disposition map (for HALT-1 release of Phases B–E)

| Defect | Class lineage | Phase | Invariant |
|---|---|---|---|
| D20 response-scoped execute loop orphans units | D13/D18, F2 | **B** | session/queue survives response death; resumable from the durable spine |
| D21 entity phase per-entity sync writes + silent | DS-020 litmus, A2 | **C** | entity resolution is batch I/O; emits pulses/VERBOSE/telemetry like every phase |
| D19 two panels disagree; heavy derive gates progress | D14/D17, A5 | **D** | progress renders from the cheap streamed spine; telemetry derive never contends with writes |
| F4 supersede invisible to the D16.1 gate | HF-213/D16.1 seam | **E** | exactly one generation visible to ANY consumer; supersession on the read predicate's surface |
| A3 "never-created-a-batch" outside reconcile | D16.1 gap | §6A | follow-on |

**Phase A ends here (HALT-1).** No fix code shipped. A4 additionally triggers **HALT-2**: F4 to the front of the fix sequence; nothing else ships first per Decision 95.
