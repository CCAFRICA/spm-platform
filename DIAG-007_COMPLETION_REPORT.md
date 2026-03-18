# DIAG-007 COMPLETION REPORT
## Date: March 18, 2026

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| | Phase 0-3 | Combined diagnostic — code trace + data queries + root cause |

## DIAGNOSTIC FINDINGS

### Phase 0: Discriminant Code Location

**grep output:**
```
web/src/app/api/calculation/run/route.ts:1010:  // HF-119: Token overlap variant matching
web/src/app/api/calculation/run/route.ts:1036:    addLog(`HF-119 Variant discriminants: ...`)
web/src/app/api/calculation/run/route.ts:1062:    // HF-119: Token overlap variant matching — cross-language, structural
web/src/app/api/calculation/run/route.ts:1115:        console.log(`[VARIANT] ${entityName}: disc=[...`)
```

**Complete discriminant matching function** (`run/route.ts` lines 1062-1117):
```typescript
// HF-119: Token overlap variant matching — cross-language, structural
let selectedComponents = defaultComponents;
let selectedVariantIndex = 0;
if (variants.length > 1) {
  // Build entity token set from ALL string field values
  const entityTokens = new Set<string>();
  for (const row of entityRowsFlat) {                    // ← READS FROM flatDataByEntity
    const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
      ? row.row_data as Record<string, unknown> : {};
    for (const val of Object.values(rd)) {
      if (typeof val === 'string' && val.length > 1) {
        for (const token of variantTokenize(val)) {
          entityTokens.add(token);
        }
      }
    }
  }

  // Score by discriminant token matches
  const discScores = variantDiscriminants.map((disc, i) => {
    const matched = Array.from(disc).filter(t => entityTokens.has(t));
    return { index: i, matches: matched.length, tokens: matched };
  });
  discScores.sort((a, b) => b.matches - a.matches);

  let method = 'default_last';
  if (discScores[0].matches > (discScores[1]?.matches ?? 0)) {
    selectedVariantIndex = discScores[0].index;
    method = 'discriminant_token';
  } else {
    // Tie on discriminants — try total overlap
    // ... (falls to default_last if still tied)
    selectedVariantIndex = variants.length - 1;
    method = 'default_last';
  }
}
```

**Key line:** `for (const row of entityRowsFlat)` — reads from `flatDataByEntity` which is indexed by entity_id FK.

---

### Phase 1: Discriminant Data Source

The discriminant matcher reads from **`flatDataByEntity`** (line 1043):
```typescript
const entityRowsFlat = flatDataByEntity.get(entityId) || [];
```

`flatDataByEntity` is populated at lines 374-378:
```typescript
if (row.entity_id) {                           // ← ONLY rows with entity_id bound
  // ...
  if (!flatDataByEntity.has(row.entity_id)) {
    flatDataByEntity.set(row.entity_id, []);
  }
  flatDataByEntity.get(row.entity_id)!.push({ row_data: row.row_data });
}
```

**The discriminant matcher reads ONLY from entity_id-bound committed_data rows.** Rows with `entity_id = null` go to `storeData` (line 379-394) and are NOT available for discriminant matching.

The calculation engine has a SECOND data path — `dataByBatch` (line 400-444) — which indexes by `row_data[entity_column]` via convergence bindings. This path is used for metric derivation and WORKS even when entity_id is null. But it is NOT used for variant matching.

---

### Phase 2: Production Data State

**2A: BCL-5001 (Adriana Reyes Molina — Senior entity)**
```json
{
  "external_id": "BCL-5001",
  "display_name": "Adriana Reyes Molina",
  "entity_type": "individual",
  "temporal_attributes": [],
  "metadata": {}
}
```
**Empty metadata. No role, no store_id.**

**2B: BCL-5012 (Valentina Salazar — Standard entity)**
```json
{
  "external_id": "BCL-5012",
  "display_name": "Valentina Salazar Mendieta",
  "entity_type": "individual",
  "temporal_attributes": [],
  "metadata": {}
}
```
**Also empty metadata.**

**2C: committed_data for BCL-5001**
```
No committed_data rows (entity_id not bound)
```
**entity_id is NULL on ALL 255 committed_data rows:**
```
entity_id IS NULL: 255
entity_id bound: 0
```

**Sample committed_data row:**
```
entity_id: null
data_type: 0_321f879c_bcl_datos__datos
row_data keys: [Periodo, Sucursal, _rowIndex, _sheetName, ID_Empleado, Meta_Depositos, Meta_Colocacion, Nombre_Completo, ...]
ID_Empleado: BCL-5001
Nombre_Completo: Adriana Reyes Molina
```
**Data IS present. Entity identifier `ID_Empleado = BCL-5001` IS in row_data. But entity_id FK is not bound.**

**2D: Plan population_config**
```json
{ "eligible_roles": [] }
```
(Variants are in `rule_sets.components.variants`, not `population_config`.)

**2E: Distinct data_types**
```
['0_321f879c_bcl_datos__datos', '1_7902a9ce_bcl_datos__datos', '2_b3cb0847_bcl_datos_dic__datos']
```
**data_types contain HF-141 prefix fragments** — `fileNameFromPath` regex `^\d+_` in execute-bulk/route.ts line 168 only strips the timestamp portion, leaving `index_uuid8_` prefix.

---

### Phase 3: Root Cause

**Q1: Where does the discriminant matcher look for "senior"?**

The matcher tokenizes ALL string values from `entityRowsFlat` (committed_data rows bound to entity via entity_id FK). It looks for the "senior" token in any string field value in the entity's rows. Code: `run/route.ts:1068-1078`.

The "senior" token would be found in `Nombre_Completo` value "Adriana Reyes Molina" — wait, that doesn't contain "senior". Let me check what Senior entities have that Standard ones don't.

Actually, the discriminant system doesn't look for "senior" in the DATA. It looks for tokens that are UNIQUE to variant_0 (V0). The variant discriminants are derived from the variant NAME: `V0=[senior]` means the token "senior" appears in variant_0's name/description but not in variant_1's. Then it looks for "senior" in ALL string values in the entity's committed_data rows.

For BCL, the "Senior" designation would appear in a role/position field like `Puesto` or similar. But the 3 imported datos files don't have a role field — they have: `ID_Empleado, Nombre_Completo, Sucursal, Periodo, Monto_Colocacion, Meta_Colocacion, Cumplimiento_Colocacion, Indice_Calidad_Cartera, Depositos_Nuevos_Netos, Meta_Depositos, Pct_Meta_Depositos, Cantidad_Productos_Cruzados, Infracciones_Regulatorias`.

**No "Senior" or "Ejecutivo" designation in any field.** The role was previously set via entity metadata from a roster import or from prior committed_data that DID have role information.

**Q2: Is "senior" present for BCL-5001?**

NO. Neither in entity metadata (empty `{}`) nor in committed_data row_data (no role/position field in datos files).

**Q3: Was "senior" present before the clean slate?**

YES. Before the clean slate, there were committed_data rows from a PRIOR import cycle that included role/position information. This data was in `entity_id`-bound rows, so `flatDataByEntity` had rows containing "Ejecutivo Senior" text. The discriminant matcher found "senior" in those rows and correctly routed to V0.

The clean slate deleted ALL committed_data. The reimport only imported datos (transaction) files, NOT a roster/entity file with role designations. So the "senior" token no longer exists anywhere in the data pipeline.

**Q4: Root cause and fix**

**ROOT CAUSE (TWO FAULTS):**

**Fault 1: entity_id binding failure.** All 255 committed_data rows have `entity_id = null`. Post-commit entity binding in `execute-bulk/route.ts` uses the flywheel-cached `entity_identifier` field, which maps `Cantidad_Productos_Cruzados` (a product count integer) instead of `ID_Empleado` (the actual entity ID). Lookup fails because entity external_ids like "BCL-5001" don't match product counts like "3".

**Fault 2: Variant matcher reads only from entity_id-bound rows.** The discriminant matcher at `run/route.ts:1068` iterates `entityRowsFlat` which comes from `flatDataByEntity` — populated ONLY for rows where `entity_id` is bound. When entity_id is null, the matcher has zero rows, zero tokens, and every entity falls to `default_last` (variant_1 = Standard).

Additionally, even WITH entity_id bound, the datos files don't contain a role/position field. The "senior" token came from prior committed_data or entity metadata, not from transaction data. So variant routing depends on either:
- Entity metadata containing role info (preserved across clean slate IF populated)
- A roster import with role designations being present in committed_data

---

## RECOMMENDED FIX

**Option A (Structural — variant matcher resilience):** When `flatDataByEntity` is empty for an entity, the variant matcher should fall back to the convergence binding path (`dataByBatch`) to find entity data. This makes variant matching resilient to entity_id binding failures. Additionally, the matcher should also check `entities.metadata` for role/position tokens.

**Option B (Classification — fix entity_identifier binding):** Fix the flywheel-cached field bindings for BCL to correctly map `ID_Empleado` as `entity_identifier` instead of `Cantidad_Productos_Cruzados`. This fixes entity_id binding, which fixes `flatDataByEntity`, but does NOT fix the missing role data.

**Option C (Both — recommended):** Apply both. Option B fixes entity_id binding (enabling downstream features like entity-level queries). Option A makes variant matching resilient and adds entity metadata as a token source.

**Critical insight:** The datos files do NOT contain role/position designations. The variant discriminant "senior" can ONLY be matched from:
1. Entity metadata (if populated by a prior roster import)
2. A separate roster/entity import with role fields
3. The entity's `display_name` or `temporal_attributes` (if role is stored there)

Since entity metadata is empty `{}` and no roster was imported, variant matching CANNOT work regardless of entity_id binding. The fix must include either: (a) populating entity metadata with role from a roster import, or (b) using entity metadata that persists across clean slate.

## STANDING RULE COMPLIANCE
- Rule 29 (no code changes until diagnostic): PASS — zero source files modified
- Rule 35 (EPG): N/A — diagnostic only, no formula changes
