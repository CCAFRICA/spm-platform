# DIAG-072: Convergence Binds Plan Components to Wrong Data File

**Date:** 2026-06-17
**Category:** DIAG — root cause a regression (read + prove, no fix yet)
**Number:** DIAG-072. VERIFY: `ls docs/diagnostics/ | grep -iE "^DIAG-072"` must be empty.

---

## §0 — THE OBSERVED FAILURE (forensic evidence, do not re-collect)

MIR tenant, clean reimport, calculating PLAN DE AJUSTES Y DEVOLUCIONES (CLAWBACK), January 2025. Every entity returns $0. The forensic trace proves WHY:

**Convergence produced this AI mapping (from calc logs):**
```
HF-114 AI mapping: {
  "monto_original":"Saldo_Pendiente",
  "dias_desde_transaccion_original":"Monto_Cobrado",
  "tasa_comision_original":"Monto_Cobrado",
  "multiplicador_acelerador_original":"Monto_Cobrado"
}
```

The CLAWBACK plan's four component inputs (`monto_original`, `tasa_comision_original`, `dias_desde_transaccion_original`, `multiplicador_acelerador_original`) were ALL mapped to two columns — `Monto_Cobrado` and `Saldo_Pendiente` — which are columns from the **Cobranza** (collections) file. A clawback adjustment is computed from ORIGINAL SALES data (the Ventas file: `Monto_Total`, `Precio_Unitario`), not collections data.

**Then the engine resolves those columns and finds NULL:**
```
resolveColumnFromBatch: entity=10300007 column=Monto_Cobrado rowCount=3 perRowValues=[null,null,null] returned=null
resolveColumnFromBatch: entity=10300007 column=Saldo_Pendiente rowCount=3 perRowValues=[null,null,null] returned=null
```

The entity's 3 resolved rows came from `Clientes_Nuevos` (resolved via `DNI_Vendedor`). Those rows don't contain `Monto_Cobrado` at all. Result: NULL → 0 → grand total 0.

**Two compounding facts the data proves:**
- `11762 committed_data rows (133 entity-level, 11629 store-level)` — only 133 of 11,762 rows resolved to the 34 vendedor entities. The 11,629 Cobranza/Ventas rows are keyed by `Codigo_Cliente`, which does NOT match the vendedor DNI entities, so they're "store-level" (unresolved).
- Convergence bound the plan to `Monto_Cobrado`/`Saldo_Pendiente` (Cobranza columns) but the entities that DID resolve only carry `Clientes_Nuevos` columns. The bound columns and the resolved rows are from different files.

**This is the regression.** Single-file/single-plan tenants (BCL, Meridian) had exactly one data source, so convergence could not bind to the wrong file. MIR is multi-file/multi-plan and exposes that convergence has no plan-to-data-file affinity — it binds a plan's components to arbitrary columns from whatever committed_data exists.

---

## §1 — DISCIPLINE

`CC_STANDING_ARCHITECTURE_RULES.md` applies. **This is a DIAGNOSTIC. Read and prove. No code fix in this directive.** The deliverable is a committed `docs/diagnostics/DIAG-072_*.md` with the root cause proven from the live code, and a proposed fix the architect reviews BEFORE any implementation.

---

## §2 — SETUP

```bash
cd ~/spm-platform
git checkout main && git pull origin main
git rev-parse HEAD
mkdir -p docs/diagnostics
```

---

## §3 — TRACE THE CONVERGENCE BINDING LOGIC (read live code, paste it)

### 3.1 — How does convergence select which committed_data to bind against?
```bash
wc -l web/src/lib/intelligence/convergence-service.ts
grep -n "committed_data\|data_type\|import_batch\|source_file\|Monto_Cobrado\|column.*map\|AI.*mapping\|HF-114\|HF-253\|HF-287" web/src/lib/intelligence/convergence-service.ts
```
Read `convergeBindings`. Paste:
- How it fetches the candidate columns to map the plan's component inputs against. Does it pull columns from ALL committed_data for the tenant, or does it scope to a specific data_type / import_batch / file?
- The AI column-mapping call (HF-114 / HF-253). What candidate column set is handed to the AI? Is it all columns across all files, or scoped?
- Whether there is ANY notion of "this plan's data lives in this file/data_type."

### 3.2 — How is the AI mapping prompt constructed?
Find the prompt that asks the AI to map plan metric names → data columns. Paste it. Determine: when 4 plan inputs are presented and the candidate column pool contains columns from 4 different files (Clientes_Nuevos, Cobranza, Ventas, Cuotas), what stops the AI from mapping all 4 inputs to 2 unrelated columns? Is there a per-file or per-data_type partition, or is it a flat column pool?

### 3.3 — How does the engine resolve a bound column to a value at calc time?
```bash
grep -n "resolveColumnFromBatch\|dataByBatch\|source_batch_id\|row_data\[" web/src/app/api/calculation/run/route.ts
```
Paste `resolveColumnFromBatch`. Determine: when convergence binds `monto_original → Saldo_Pendiente`, which batch/file does the engine look in for `Saldo_Pendiente`? Does the binding carry a `source_batch_id` identifying WHICH file the column came from, or does it search all the entity's rows regardless of file?

### 3.4 — The entity-key mismatch
The CLAWBACK data the plan actually needs is in the Ventas/Cobranza files, keyed by `Codigo_Cliente`. The plan pays vendedores, keyed by `DNI`/`DNI_Vendedor`. Determine from the code: when a transaction file is keyed by `Codigo_Cliente` but the plan's entity is the vendedor (`DNI_Vendedor` is a COLUMN in that same file), how is the row supposed to be associated to the vendedor entity? Is there an aggregation step that groups transaction rows by a non-primary identifier column (`DNI_Vendedor`) up to the paying entity? Trace whether that step exists or was removed.

### 3.5 — Compare to the last known-good multi-source path
```bash
git log --oneline -- web/src/lib/intelligence/convergence-service.ts | head -20
```
Identify when convergence binding logic last changed. The assertion is that the system was stable a few days ago. Find the commits to convergence-service.ts and the calc route's metric resolution in the OB-196/OB-197 (Pulses/Atoms) era and after. Determine whether a `source_batch_id` / data_type scoping that existed before was dropped, or whether multi-file affinity was never present and only single-file tenants were ever proven.

---

## §4 — START FROM AUD-0016'S CONFIRMED FINDINGS (do not re-derive)

AUD-0016 (committed PR #535) already established the mechanism. Use it as the starting point, do not re-trace from scratch:

- **AUD-0016 Phase 8** states: `convergeBindings` (`convergence-service.ts:212`) calls `inventoryData(tenantId, supabase)` at **`:254`**, which "inventories the tenant's committed_data capabilities (**whole-tenant**), matches plan metrics to data columns." The audit flags `inventoryData` as **whole-tenant**.

This is the confirmed mechanism for the wrong-file binding: the candidate column pool handed to the AI mapping is built from ALL the tenant's committed_data, with no per-file / per-data_type / per-plan partition. Confirm this directly:

```bash
grep -n "inventoryData" web/src/lib/intelligence/convergence-service.ts
sed -n '/function inventoryData/,/^}/p' web/src/lib/intelligence/convergence-service.ts | head -80
```

Paste `inventoryData`. Answer definitively:
1. Does it select committed_data filtered by anything (data_type, import_batch, file) or ALL rows for the tenant?
2. Does the column inventory it returns carry which file/data_type/batch each column came from?
3. When that inventory feeds the AI mapping (HF-114/HF-253), is the candidate column set partitioned by source, or is it one flat list?

- **AUD-0016 Phase 7d** documents OB-183 resolving `entity_id` from `row_data[metadata.entity_id_field]` — but the audit did NOT examine what happens when `entity_id_field` is a client key (`Codigo_Cliente`) while the plan's paying entity is the vendedor (`DNI_Vendedor`, a non-primary column in the same rows). This is the audit's gap. Prove it: confirm there is no step that aggregates transaction rows by a non-primary identifier column up to the paying entity. (`grep -n "DNI_Vendedor\|groupBy\|aggregate.*entity\|secondary.*identifier\|reference_key" web/src/app/api/calculation/run/route.ts web/src/lib/intelligence/convergence-service.ts`)

---

## §5 — DELIVERABLE: `docs/diagnostics/DIAG-072_CONVERGENCE_WRONG_FILE_BINDING.md`

Structure:
```markdown
# DIAG-072: Convergence Binds Plan Components to Wrong Data File

## Observed Failure
[The forensic evidence above — the AI mapping + NULL resolution]

## Root Cause (proven from live code)
[Paste the convergence code that builds the candidate column pool.
 State definitively: is the pool flat (all files) or scoped (per file/data_type)?
 Paste the binding-to-value resolution. Does the binding carry source_batch_id?
 State the exact mechanism by which 4 plan inputs map to 2 wrong-file columns.]

## The Entity-Key Dimension
[Does an aggregation-by-non-primary-identifier step exist (group Cobranza rows
 by DNI_Vendedor up to the vendedor)? If not, that is a second root cause.]

## Regression Analysis
[git history: when did convergence binding last change? Was file-affinity or
 source_batch_id scoping present before OB-196/197 and dropped? Or never present?
 Why did BCL/Meridian pass — single file means no wrong-file binding possible.]

## Proposed Fix (architect-gated — DO NOT IMPLEMENT YET)
[The minimal structural fix. Likely candidates — CC determines from the code:
  - Scope the convergence candidate column pool per data_type/file so a plan's
    components only map to columns from the file(s) that match the plan.
  - Carry source_batch_id on each binding so the engine resolves the column from
    the correct file, and aggregate transaction rows by the plan's entity key.
 State which, with the code justification.]

## Scope Fence
[What this does NOT change.]
```

Commit it. Then **HALT** — architect reviews the root cause and approves the fix before any implementation.

```bash
git add docs/diagnostics/DIAG-072_CONVERGENCE_WRONG_FILE_BINDING.md
git commit -m "DIAG-072: Convergence binds plan components to wrong data file — root cause"
git push origin main   # if main is protected, open a PR instead and state the number
```

State the commit SHA (or PR number).

---

*DIAG-072 · Convergence Wrong-File Binding · 2026-06-17*
