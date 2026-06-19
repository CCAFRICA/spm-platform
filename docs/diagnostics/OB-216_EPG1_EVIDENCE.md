# OB-216 Phase 1 — EPG-1 Evidence (sheet-aware partition) · AWAITING ARCHITECT REVIEW (§I PAUSE)

**Branch:** `ob-216-convergence-unified-path` · **File:** `web/src/lib/intelligence/convergence-service.ts` (+98 / −83)
**tsc --noEmit:** exit 0. **Gate:** PAUSE for architect review before Phase 2 (§I).

---

## Change (Phase 1 only)

1. **`DataCapability` gains `partitionKey: string`** — the structural partition identity `${dataType}␟${column-signature}`.
2. **`inventoryData` rewrite** (now `export`ed for EPG-1):
   - **Fetch:** replaced the flat `.limit(500)` sample (which could miss small sheets) with **per-batch sampling** — enumerate the tenant's visible `import_batches`, sample ≤50 rows each, so every batch's schema is represented. Flat-fetch fallback retained for robustness (SR-2).
   - **Partition:** replaced data_type grouping (and the now-obsolete HF-228 schema-coverage loop) with grouping by **`(data_type, column-signature)`**. One capability per schema; same-schema batches (monthly imports) collapse to one; different schemas split — even within one data_type.

## Korean-Test confirmation (§D) — partition is structural, never semantic

The signature is the **set of non-underscore column names as an opaque fingerprint**; the partition never branches on what a name means:
```ts
const sigOf = (rd) => Object.keys(rd).filter(k => !k.startsWith('_')).sort().join(',');
const partitionKeyOf = (dataType, rd) => `${dataType}␟${sigOf(rd)}`;
```
A column named in any language groups purely by the shape of the key-set. No `if (columnName === '…')`, no language literal, no developer threshold in the partition.

## Regression guard (§D) — explicit per-tenant counts

**BCL → 3 capabilities (UNCHANGED from its 3 legitimate data_types):**
```
• reference   | batches=1 | cols=[Año, Capacidad_Total, Cargas_Totales, Mes, Tasa_Utilizacion]      (Datos_Flota_Hub)
• entity      | batches=1 | cols=[Fecha_Ingreso, No_Empleado, …]                                     (Plantilla roster)
• transaction | batches=1 | cols=[Ingreso_Real, Ingreso_Meta, Cuentas_Nuevas, … 15 cols]             (Datos_Rendimiento)
```
A single-schema/monthly tenant stays one capability per schema → no fragmentation.

**MIR → 6 capabilities (was 2 — the bug):**
```
• transaction | batches=6 | Monto_Cobrado:measure, Saldo_Pendiente:measure        → Cobranza   (Plan 3)
• transaction | batches=5 | Monto_Total:measure, Categoria:ATTRIBUTE, Cantidad…   → Ventas     (Plan 1)  [months collapsed]
• transaction | batches=1 | Verificado:ATTRIBUTE(→boolean), Pedidos…:measure      → Clientes_Nuevos (Plan 4)
• transaction | batches=1 | Monto_Total… + Folio_Original:reference_key           → Ventas_Marzo (Plan 5 clawback source)
• transaction | batches=1 | Enero_2025…Junio_2025:measure                         → Cuotas     (Plan 2)
• entity      | batches=1 | DNI:identifier, … 34 rows                             → Nómina (roster)
```
Each plan's columns are now isolated to their own capability.

## DIAG-073 UNKNOWN #2 resolved (incidental, per §6A)

Per-sheet `structuralType`s (from live `field_identities`):
- Cobranza: `Monto_Cobrado:measure`, `Saldo_Pendiente:measure`
- Ventas: `Monto_Total:measure`, `Categoria:attribute` (NOT measure — so it cannot enter a measure-candidate pool; relevant to the §3.4 crash)
- Clientes_Nuevos: `Verificado:attribute` (→ `booleanFields`), `Pedidos_Primeros_60_Dias:measure`
- Cuotas: `Enero_2025…Junio_2025:measure`
- Ventas_Marzo: + `Folio_Original:reference_key` (the clawback cross-period join key)

## Phase-1 boundary note (for review)
Phase 1 changes ONLY `inventoryData`'s output (the capability set). Downstream `matchComponentsToData` / `generateAllComponentBindings` still key on `dataType` and will be updated in **Phase 2** to consume the new `partitionKey` (match a component to its specific sheet capability, role-aware candidates). So full binding correctness is an EPG-2 result; EPG-1 verifies only that the partition produces the correct capability set. tsc is clean; no runtime crash introduced (downstream still finds *a* transaction cap).

*OB-216 Phase 1 / EPG-1 · 2026-06-18 · awaiting architect review · vialuce.ai*
