# DIAG-072: Convergence Binds Plan Components to Wrong Data File

**Date:** 2026-06-17 · **Mode:** DIAGNOSTIC (read + prove, NO fix) · **Branch:** `diag-072-convergence-wrong-file`
**Main HEAD:** `dd01dfb9` · **Predecessor:** AUD-0016 (PR #535).
**Verdict:** confirmed — **three compounding root causes.** RC-1 flat cross-data-type candidate pool (the wrong-file binding); RC-2 resolution drops the source batch; RC-3 no secondary-identifier aggregation (the entity-key mismatch). RC-1's wrong-file guard existed (HF-263 P3.2) and was **removed by HF-269 Phase A** — a regression.

---

## Observed Failure (forensic, from the directive)
MIR · PLAN DE AJUSTES Y DEVOLUCIONES (CLAWBACK) · Jan 2025 · every entity $0. Convergence produced:
```
HF-114 AI mapping: { "monto_original":"Saldo_Pendiente", "dias_desde_transaccion_original":"Monto_Cobrado",
  "tasa_comision_original":"Monto_Cobrado", "multiplicador_acelerador_original":"Monto_Cobrado" }
```
All four clawback inputs (which need ORIGINAL-SALES data from **Ventas**) were bound to **Cobranza** columns (`Saldo_Pendiente`, `Monto_Cobrado`). The engine then resolved them against the entity's rows (which came from `Clientes_Nuevos`) and found NULL → 0.

---

## Root Cause 1 — flat cross-data-type candidate pool (the wrong-file binding)

`convergeBindings` boundary-matches each component to a `data_type`, then `resolveColumnMappingsViaAI` is asked to map the component's inputs to columns. The candidate pool (`measureColumns`) is **not** scoped to the matched file — HF-228 deliberately adds every *unmatched* data_type's numeric columns to it (`convergence-service.ts:2764-2777`):
```ts
const matchedDataTypes = new Set(matches.map(m => m.dataType));
for (const cap of capabilities) {
  if (matchedDataTypes.has(cap.dataType)) continue;        // ← for EVERY OTHER data_type/file…
  for (const nf of cap.numericFields) {
    measureColumns.push({ name: nf.field,
      fi: { structuralType: 'measure', contextualIdentity: 'cross_source_numeric', confidence: 0.4 }, // ← SOFT tag only
      stats: cap.columnStats[nf.field], batchId: cap.batchIds[0] || '' });
  }
}
```
That full pool is handed to the AI as one flat list (`:2843` → prompt `:2449-2466`):
```
Match each metric field to the best data column. Each column used at most once.
…
DATA COLUMNS:
${columnList}              // ← matched-file columns + ALL cross-source numeric columns, one flat list
```
**There is no per-file/per-data_type partition and no hard guard** — only a 0.4 confidence annotation and the HF-263 P3.1 "key-space" prose hint. So when the clawback components don't cleanly match the Ventas file, the AI binds their inputs to Cobranza's `Monto_Cobrado`/`Saldo_Pendiente` (and even reused `Monto_Cobrado` 3× despite "used at most once"). **Scope of the pool: flat across all the tenant's files.**

## Root Cause 2 — resolution drops the source batch
The binding the engine reads carries `column` + `filters` but **no source batch**. `resolveColumnFromBatch` (`run/route.ts:1534-1546`) therefore uses the **first** batch that has any rows for the entity:
```ts
function resolveColumnFromBatch(column, entityExternalId, filters?) {
  let entityRows;
  for (const [, map] of Array.from(dataByBatch.entries())) {   // ← iterate ALL batches
    const rows = map.get(entityExternalId);
    if (rows && rows.length > 0) { entityRows = rows; break; } // ← FIRST batch with rows wins
  }
  …  const val = rd[column];  // look for the bound column in THOSE rows
}
```
`measureColumns` knows each column's `batchId` (`:2773`), but that source is **not threaded into the persisted binding or this resolver**. So even a correct binding can be resolved against the wrong file's rows; here the wrong-file binding is resolved against Clientes_Nuevos rows → `perRowValues=[null,null,null]` → null.

## The Entity-Key Dimension — Root Cause 3 (no secondary-identifier aggregation)
`dataByBatch` is keyed by each batch's **primary** `entity_id_field` (`run/route.ts:800-845`). Cobranza/Ventas are keyed by `Codigo_Cliente`, so those batches' maps are keyed by client ids — `map.get(<vendedor DNI>)` finds nothing. The vendedor's only rows are from `Clientes_Nuevos` (keyed by `DNI_Vendedor`). There is **no step that aggregates transaction rows by a non-primary identifier column** (`DNI_Vendedor`) up to the paying entity. The only aggregation primitive, `scope.entity_group_by` (`convergence-service.ts:3380`), groups **entities by an entity attribute** (district/team siblings) — not transaction rows keyed by a different entity. Confirmed: `grep DNI_Vendedor|groupBy|aggregate.*entity|secondary.*identifier` finds only `aggregateMetrics(entityRowsFlat)` (per-entity flatten) and the sibling `scope` doc — no client→vendedor rollup. So even with a correct Ventas binding, the Ventas rows would not associate to the vendedor.

> **Net:** RC-1 binds to the wrong file; RC-2 means the source is lost at resolution; RC-3 means the *right* file's rows wouldn't reach the vendedor anyway. All three must be addressed for the clawback to compute non-zero.

---

## Regression Analysis (git history, `convergence-service.ts` + calc route)
- `be1e6ec3` **HF-228 Phase 3** — *"cross-data-type column discovery in generateAllComponentBindings"* — introduced the flat cross-file pool (RC-1's mechanism).
- `9932be86` **HF-263 P3.1** — *"convergence key-space annotation — flag cross-source columns in AI prompt"* — soft mitigation (still present).
- `dc9c89e3` **HF-263 P3.2** — *"post-pass cross-source redirect (HALT-B)"* — a **hard** guard that redirected cross-source mis-bindings.
- `bc57f1df` **HF-269 Phase A** — *"remove HF-263 P3.2 magnitude-proxy redirect (override-class closure)"* — **REMOVED the hard cross-source redirect.** After this, only the soft 0.4 tag + prose annotation remain.
- `source_batch_id` scoping in convergence: **never present** (`git log -S` empty) — RC-2 is a latent gap, not a regression.

So RC-1 is a **regression**: cross-file binding was possible after HF-228, mitigated by HF-263 P3.2, then re-exposed when HF-269 A removed that guard. **Why BCL/Meridian passed:** single data source → `matchedDataTypes` covers it → the `cross_source` add-loop (`:2766 continue`) contributes nothing → no wrong-file columns in the pool → wrong-file binding is impossible. MIR (4 files: Clientes_Nuevos, Cobranza, Ventas, Cuotas) is the first multi-file tenant, so it's the first to expose RC-1/RC-3.

---

## Proposed Fix (ARCHITECT-GATED — DO NOT IMPLEMENT YET)
Minimal structural fix = **file affinity at binding + entity-key rollup at resolution.** Two edits, both required for clawback ≠ 0:

1. **RC-1 — partition the candidate pool by the component's matched data_type** (`resolveColumnMappingsViaAI` caller, `:2764-2843`). A component's inputs should be offered ONLY columns from the data_type(s) the boundary matcher associated with it (and its declared cross-references), not every numeric column tenant-wide. The cleanest forms: (a) drop/gate the HF-228 cross-source add-loop so the pool is matched-data_type-scoped, or (b) restore a **hard** cross-source guard (the HF-269-removed HF-263 P3.2, in its non-magnitude-proxy form) that rejects a binding whose column's `batchId`/data_type doesn't feed the component. Prefer (a) — a hard partition is deterministic and Korean-Test-clean (keys on `data_type`/`batchId`, no names).
2. **RC-3 — aggregate transaction rows by the plan's entity key.** When a file carries the paying entity's identifier as a **non-primary** column (e.g. `DNI_Vendedor` in Ventas/Cobranza keyed by `Codigo_Cliente`), index those rows in `dataByBatch` (also) by that secondary identifier so they roll up to the vendedor. This is the structural step that does not exist today.
3. **RC-2 (supporting) — thread `source_batch_id` from the binding into `resolveColumnFromBatch`** so a column resolves against the batch it came from, not the first batch with rows. Subsumed by (1)+(2) for the happy path but closes the latent cross-file resolution gap.

CC's read: (1) is the primary regression fix (restores file affinity removed by HF-269); (3) hardens resolution; (2) is the missing capability for multi-key tenants. The architect chooses scope.

## Scope Fence (what a fix would NOT touch)
Import pipeline, plan interpretation, entity creation, the engine math (intent executor), single-file tenants (BCL/Meridian — the matched-data_type partition is a no-op when there is one source), schema. No change to HF-300/HF-301.

---

**HALT — architect reviews this root cause and approves a fix before any implementation.**

*DIAG-072 · Convergence Wrong-File Binding · 2026-06-17 · vialuce.ai*
