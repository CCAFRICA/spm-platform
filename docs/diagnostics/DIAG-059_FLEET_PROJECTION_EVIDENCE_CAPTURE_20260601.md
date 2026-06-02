# DIAG-059 — Fleet Projection & Hub Entity Evidence Capture — COMPLETION REPORT
## Classification: READ-ONLY diagnostic. No code, no SQL, no state mutation.
## HEAD SHA: `b31bd688f719f4563821cf0379111f39b18b9fc2`
## Date: 2026-06-01
## Tenant: Meridian Logistics Group `5035b1e8-0754-4527-b7ec-9f93f85e4c79` · rule_set `2fb555d4-53fe-42e8-9662-cae3d07da4f4`

---

## §P1 — Entity State

```
Total entities: 79
Employees (numeric external_id): 67
Non-employee entities: 12

=== NON-EMPLOYEE ENTITIES (full) ===   (all 12, identical shape)
{"external_id":"Acapulco Hub","display_name":"Acapulco Hub","entity_type":"individual","metadata":{},"temporal_attributes":[]}
{"external_id":"CDMX Hub",...,"metadata":{},"temporal_attributes":[]}
{"external_id":"Chihuahua Hub","id":"65bc7c36-ad70-466a-a569-83dbf25a6c11",...,"metadata":{},"temporal_attributes":[]}
{"external_id":"Culiacán Hub",...,"metadata":{},"temporal_attributes":[]}
{"external_id":"Guadalajara Hub",...,"metadata":{},"temporal_attributes":[]}
{"external_id":"Mérida Hub",...,"metadata":{},"temporal_attributes":[]}
{"external_id":"Monterrey Hub",...,"metadata":{},"temporal_attributes":[]}
{"external_id":"Oaxaca Hub",...,"metadata":{},"temporal_attributes":[]}
{"external_id":"Puebla Hub",...,"metadata":{},"temporal_attributes":[]}
{"external_id":"Querétaro Hub",...,"metadata":{},"temporal_attributes":[]}
{"external_id":"Tijuana Hub","id":"61686ab1-448b-464c-b4c4-ce21b183fa77",...,"metadata":{},"temporal_attributes":[]}
{"external_id":"Villahermosa Hub",...,"metadata":{},"temporal_attributes":[]}

=== SAMPLE EMPLOYEE (full) ===
{"external_id":"70001","display_name":"Claudia Cruz Ramírez","entity_type":"individual",
 "metadata":{"region":"Norte","fecha_ingreso":"2023-02-22","tipo_coordinador":"Coordinador"},
 "temporal_attributes":[
   {"key":"tipo_coordinador","value":"Coordinador","source":"import","effective_from":"2026-06-01","effective_to":null},
   {"key":"region","value":"Norte","source":"import",...},
   {"key":"fecha_ingreso","value":"2023-02-22","source":"import",...},
   {"key":"Region","value":"Norte",...},
   {"key":"Tipo_Coordinador","value":"Coordinador",...}]}

Employees with temporal_attributes: 67/67
Temporal attribute keys (all employees): ["Region","Tipo_Coordinador","fecha_ingreso","region","tipo_coordinador"]
Metadata keys (all employees):          ["fecha_ingreso","region","tipo_coordinador"]
Metadata keys (hub entities):           []
```

### Finding P1-F1: **Boundary field ABSENT from entity creation (HALT-1 flagged, non-blocking).**
`Hub_Asignado` (the employee→hub boundary) appears in **neither** employee `metadata` (`{region, fecha_ingreso, tipo_coordinador}`) **nor** `temporal_attributes` (`{region/Region, tipo_coordinador/Tipo_Coordinador, fecha_ingreso}`). The entity-creation pipeline (`processEntityUnit`) captures `Region/Tipo_Coordinador/Fecha_Ingreso` as enrichment but **not** `Hub_Asignado`. All 12 hub entities carry `metadata={}` / `temporal_attributes=[]` and `entity_type='individual'` (indistinguishable from employees by type).

---

## §P2 — Committed Data Structure

```
Total committed_data rows: 304 · Distinct (data_type, batch) groups: 3

=== data_type="entity" batch="2cc6d459-…" rows=67 (sheet Plantilla) ===
  row_data keys: ["Fecha_Ingreso","Hub_Asignado","No_Empleado","Nombre_Completo","Region","Tipo_Coordinador","_rowIndex","_sheetName"]
  *** FLEET-RELATED COLUMNS: ["Hub_Asignado"]
  sample: No_Empleado=70057 Hub_Asignado="Tijuana Hub"  (entity_id→employee; 67 linked, 0 null)

=== data_type="reference" batch="94ed4675-…" rows=36 (sheet Datos_Flota_Hub) ===
  row_data keys: ["Año","Capacidad_Total","Cargas_Totales","Hub","Mes","Region","Tasa_Utilizacion","_rowIndex","_sheetName"]
  *** FLEET-RELATED COLUMNS: ["Capacidad_Total","Cargas_Totales","Hub"]
  sample: entity_id=65bc7c36(Chihuahua Hub) source_date=2025-01-01 Hub="Chihuahua Hub" Cargas_Totales=898 Capacidad_Total=951 Tasa_Utilizacion=0.9443
          entity_id=61686ab1(Tijuana Hub)   Hub="Tijuana Hub"  Cargas_Totales=846 Capacidad_Total=805   (36 linked, 0 null)

=== data_type="transaction" batch="50b6d0d5-…" rows=201 (sheet Datos_Rendimiento) ===
  row_data keys: ["Año","Capacidad_Flota_Hub","Cargas_Flota_Hub","Cuentas_Nuevas","Cumplimiento_Ingreso","Entregas_Tiempo",
                  "Entregas_Totales","Hub","Incidentes_Seguridad","Ingreso_Meta","Ingreso_Real","Mes","No_Empleado","Nombre",
                  "Pct_Entregas_Tiempo","Region","Tasa_Utilizacion_Hub","Tipo_Coordinador","Volumen_Rutas_Hub","_rowIndex","_sheetName"]
  *** FLEET-RELATED COLUMNS: ["Capacidad_Flota_Hub","Cargas_Flota_Hub","Hub","Tasa_Utilizacion_Hub","Volumen_Rutas_Hub"]
  sample: No_Empleado=70033 Hub="Chihuahua Hub" Cargas_Flota_Hub=898 Capacidad_Flota_Hub=951 Tasa_Utilizacion_Hub=0.9443  (201 linked, 0 null)
```

### P2.2 — fleet-row cross-reference
```
Rows with reference fleet columns (Cargas_Totales/Capacidad_Total): 36 of 304
  → belong to 12 distinct entities, all HUBS (3 rows each = 3 months):
    Chihuahua/Tijuana/CDMX/Querétaro/Mérida/Oaxaca/Villahermosa/Guadalajara/Culiacán/Acapulco/Puebla/Monterrey Hub
Rows with Hub_Asignado column: 67  → distinct values = the same 12 hub names
Rows with transaction fleet columns (Cargas_Flota_Hub/Capacidad_Flota_Hub): 201
  → sample No_Empleado=70033 Hub="Chihuahua Hub" Cargas_Flota_Hub=898 Capacidad_Flota_Hub=951
```

### Finding P2-F1: Fleet data exists in **two** layouts.
- **Hub-keyed (reference, batch `94ed4675`):** `Cargas_Totales`/`Capacidad_Total`, one row per hub per month, `entity_id` = a hub entity. `source_date` populated (`2025-01-01`).
- **Employee-keyed (transaction, batch `50b6d0d5`):** `Cargas_Flota_Hub`/`Capacidad_Flota_Hub` denormalized onto each employee-month row carrying `No_Empleado`. The values match the reference (Chihuahua: 898 / 951 in both).

### Finding P2-F2: **Employee rows carry `Hub_Asignado` (YES).** All 67 Plantilla rows carry `Hub_Asignado` ∈ the 12 hub names — an exact match to the reference `Hub` values. The structural employee→hub boundary exists in the data; it is simply not promoted into `entities.metadata`/`temporal_attributes` (P1-F1).

---

## §P3 — Convergence Binding Shape

```
Rule set: "Plan de Incentivos 2025 - Coordinadores de Logística" · input_bindings: {convergence_version:"HF-234", convergence_bindings:{…}}

convergence_bindings.component_4 (fleet) and component_9 (variant twin) — identical shape:
  period            → column "Mes"            (batch 50b6d0d5 transaction)
  entity_identifier → column "No_Empleado"    (batch 50b6d0d5 transaction; contextualIdentity "employee_identifier")
  cargas_totales_hub  → column "Cargas_Totales"  (batch 94ed4675 REFERENCE; field_identity.confidence 0.4; contextualIdentity "cross_source_numeric"; filters [])
  capacidad_total_hub → column "Capacidad_Total" (batch 94ed4675 REFERENCE; field_identity.confidence 0.4; contextualIdentity "cross_source_numeric"; filters [])

fleet component v0.c4 name="Utilización de Flota" componentType="prime_dag" — FULL calculationIntent:
  multiply(
    conditional(
      condition: gt( divide(reference:cargas_totales_hub, reference:capacidad_total_hub), constant 1.5 ),
      then:  constant 1.5,
      else:  divide(reference:cargas_totales_hub, reference:capacidad_total_hub) ),
    constant 800 )
  → NO `scope` prime anywhere; two `reference` leaves read context.metrics by field name.

non-fleet binding columns (c0–c3), all employee-keyed:
  component_0: {ingreso_meta:"Ingreso_Meta", ingreso_real:"Ingreso_Real", volumen_rutas_hub:"Volumen_Rutas_Hub"}
  component_1: {porcentaje_entregas_tiempo:"Pct_Entregas_Tiempo"}
  component_2: {cuentas_nuevas:"Cuentas_Nuevas"}
  component_3: {incidentes_seguridad:"Incidentes_Seguridad"}
```

### Finding P3-F1: **The fleet binding cross-keys.** The two fleet measures bind to the **hub-keyed reference batch `94ed4675`** (`Cargas_Totales`/`Capacidad_Total`), while `entity_identifier` resolves on the **employee** key `No_Empleado` (transaction batch `50b6d0d5`). Convergence itself flagged these as low-confidence cross-source (`field_identity.confidence 0.4`, `contextualIdentity "cross_source_numeric"`). The intent is a `reference` tree (variant base `800`; the `then`-clamp is `1.5`); it contains **no `scope` prime**, so it never consults entity metadata or `allEntityRows`.

---

## §P4 — Code Surfaces at HEAD `b31bd688`

> Path correction: the directive cited `web/src/lib/compensation/intent-executor.ts`; the live path is **`web/src/lib/calculation/intent-executor.ts`**.

### P4.1 `resolveColumnFromBatch` — `web/src/app/api/calculation/run/route.ts:1473-1531`
```ts
function resolveColumnFromBatch(column: string, entityExternalId: string, filters?: MetricDerivationRule['filters']): number | null {
  let entityRows: Array<Record<string, unknown>> | undefined;
  for (const [, map] of Array.from(dataByBatch.entries())) {
    const rows = map.get(entityExternalId);            // ← keyed STRICTLY on the entity external id
    if (rows && rows.length > 0) { entityRows = rows; break; }
  }
  if (!entityRows) { …; return null; }                 // ← no key match → null. NO boundary-join fallback.
  const hasActiveFilters = Array.isArray(filters) && filters.length > 0;
  let sum = 0, found = false;
  for (const rd of entityRows) {
    if (hasActiveFilters && !rowMatchesFilters(rd, filters!)) { … continue; }
    const val = rd[column];
    if (val === null || val === undefined) continue;
    if (typeof val === 'number') { sum += val; found = true; }
    else if (typeof val === 'string') { const parsed = parseFloat(val.replace(/[,$\s]/g,'')); if (!isNaN(parsed)) { sum += parsed; found = true; } }
  }
  return found ? sum : null;
}
```
**No boundary-join fallback.** Resolution is `dataByBatch.<batch>.get(entityExternalId)`. An employee key never matches the hub-keyed reference batch → `null` → fleet metric absent.

### P4.2 Entity assignment / fetch — `run/route.ts:369-450` (assignments) + `:498-512` (details)
```ts
// :369  ── 2. Fetch entities via assignments (OB-75: paginated, no 1000-row cap) ──
//        reads rule_set_assignments → entityIds (all assigned; self-heal at :398-433 assigns ALL tenant entities)
// :450  addLog(`${entityIds.length} entities assigned (paginated fetch)`);   // 79, incl. 12 hubs
…
const entities: Array<{ id; external_id; display_name; metadata }> = [];
for (let i = 0; i < entityIds.length; i += ENTITY_BATCH) {
  const { data: page } = await supabase.from('entities')
    .select('id, external_id, display_name, metadata')
    .in('id', batch);                                  // ← NO entity_type filter, NO provenance filter
  if (page) entities.push(...page);
}
// :1046 let calculationEntityIds = entityIds;          // narrowed only if a roster sheet is detected (:1048),
//       which is inert for Meridian (Plantilla matches no Tier-3 keyword) → all 79 calculated.
```
**Entity assignment does NOT filter by `entity_type` or provenance.** All 79 (incl. 12 hubs) enter the calc loop.

### P4.3 `allEntityRowsForPeriod` — `run/route.ts:1708-1720` (built) / `:2445` (wired)
```ts
const allEntityRowsForPeriod: Array<{ entityMetadata: Record<string, unknown>; row: Record<string, unknown> }> = [];
for (const [eid, sheetMap] of Array.from(dataByEntity.entries())) {   // dataByEntity = ALL entities (incl. hubs)
  const meta = (entityMap.get(eid)?.metadata || {}) as Record<string, unknown>;
  const metaWithId: Record<string, unknown> = { ...meta, entityId: eid };
  for (const [, rows] of Array.from(sheetMap.entries()))
    for (const r of rows) { const rd = …; allEntityRowsForPeriod.push({ entityMetadata: metaWithId, row: rd }); }
}
// :2445  allEntityRows: allEntityRowsForPeriod,   // passed to EntityData for the scope prime
```
Built from `dataByEntity` (all entities, incl. hubs); each row's `entityMetadata` = that entity's `entities.metadata` (so hub rows carry `{}` + `entityId`).

### P4.4 `buildEvalContext` — `web/src/lib/calculation/intent-executor.ts:310-354`
```ts
export function buildEvalContext(data: EntityData): EvalContext {
  const metrics: Record<string, number> = { ...data.metrics };
  if (data.groupMetrics) for (const [k,v] of Object.entries(data.groupMetrics)) metrics[`group:${k}`] = v;
  for (const [attr, raw] of Object.entries(data.attributes)) metrics[`attr:${attr}`] = <numeric>;
  if (data.priorResults) … metrics[`prior:${i}`] = …;
  if (data.crossDataCounts) … metrics[`cross_data:${k}`] = …;
  // HF-238 R2 Closure 2: scope_aggregate pre-population block removed. The scope prime narrows
  // allEntityRows directly; there is no `scope_aggregate:*` synthetic key in context.metrics.
  return { entity: { metadata: { ...data.attributes, entityId: data.entityId } },
           activeRows: data.activeRows ?? [], allEntityRows: data.allEntityRows ?? [], metrics };
}
```
`allEntityRows` is carried into `EvalContext` and consumed **only** by the `scope` prime (`intent-executor.ts:223-238`). The fleet intent has no `scope` prime → `allEntityRows` is never read for the fleet.

### P4.5 `resolveMetricsFromConvergenceBindings` (prime_dag branch) — `run/route.ts:1272-1337`
```ts
function resolveMetricsFromConvergenceBindings(compBindings, component, entityExternalId, componentIdx?) {
  const eidBinding = compBindings.entity_identifier;
  let lookupKey = entityExternalId;
  if (eidBinding?.via?.roster_data_type && …) { … lookupKey = translated; }   // HF-216 via-join (fleet has NO via)
  const compType = component.componentType; const intent = component.calculationIntent;
  const intentIsPrimeNode = !!intent && typeof intent.prime === 'string';
  if (compType === 'prime_dag' || intentIsPrimeNode) {
    const refs = extractReferencesFromDAG(intent);            // ['cargas_totales_hub','capacidad_total_hub']
    const dagMetrics: Record<string, number> = {};
    for (const field of refs) {
      const fieldBinding = compBindings[field];               // → column 'Cargas_Totales' / 'Capacidad_Total'
      if (!fieldBinding?.column) continue;
      const rawValue = resolveColumnFromBatch(fieldBinding.column, lookupKey, fieldBinding.filters);  // employee key
      if (rawValue === null) continue;                        // hub column + employee key → null → metric omitted
      dagMetrics[field] = fieldBinding.scale_factor ? rawValue * fieldBinding.scale_factor : rawValue;
    }
    return Object.keys(dagMetrics).length > 0 ? dagMetrics : null;
  }
  …
}
```
The chain is **binding → `resolveColumnFromBatch(column, employeeKey)` → data lookup by employee external_id**. Entity metadata is never consulted. The fleet `entity_identifier` carries **no `via`**, so no roster-join translation occurs either.

---

## §SUMMARY — Evidence Inventory for HF Drafting
1. **Boundary field survives entity creation:** **NO** — `Hub_Asignado` absent from employee `metadata` and `temporal_attributes`; hubs `metadata={}` (P1-F1).
2. **Fleet data location:** **both** — hub-keyed reference rows (`Cargas_Totales`/`Capacidad_Total`, batch `94ed4675`, `entity_id`=hub) **and** employee-keyed transaction rows (`Cargas_Flota_Hub`/`Capacidad_Flota_Hub`, batch `50b6d0d5`, carries `No_Empleado`), same values (P2-F1).
3. **Employee rows carry `Hub_Asignado`:** **YES** — all 67 Plantilla rows, 12 distinct values = exact match to reference `Hub` (P2-F2).
4. **Convergence binding `source_batch` points to:** **hub fleet batch** `94ed4675` (reference) for the two measures; `entity_identifier`→`No_Empleado` (transaction `50b6d0d5`). Cross-key; convergence-flagged `confidence 0.4` / `cross_source_numeric` (P3-F1).
5. **`resolveColumnFromBatch` has boundary-join fallback:** **NO** (P4.1).
6. **Entity assignment filters by `entity_type`:** **NO** (P4.2).
7. **`allEntityRowsForPeriod` includes hub entities:** **YES** — built from `dataByEntity` (all entities incl. 12 hubs); hub rows carry `entityMetadata={}` (P4.3).

### Cross-cutting note for the HF (not a verdict)
The employee-keyed transaction columns `Cargas_Flota_Hub`/`Capacidad_Flota_Hub` (batch `50b6d0d5`, keyed by `No_Empleado`) carry the same fleet values the hub-keyed reference columns hold. A binding re-target to those columns would resolve C5 through the existing `resolveColumnFromBatch` path **without** boundary projection, metadata population, or a `scope`-node intent. The projection route (reference→member via `Hub_Asignado`) and the via-join route remain the alternatives. Lever selection is the HF's decision (architect channel); DIAG-059 captures the evidence only.

*DIAG-059 — read-only evidence capture at `b31bd688`. No code, no SQL, no state mutation. Temp scripts removed.*
