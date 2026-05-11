# E3.1 — committed_data for selected entity (verbatim)

**Query:** `SELECT * FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79' AND entity_id = '007da35a-8e65-453b-ada9-b62337fd8683'`

**Result:** 4 rows (filter on period_id=selected OR period_id IS NULL retains all 4 — every row has `period_id: null`). Verbatim below in the order Postgrest returned.

## Row 1 — transaction (source_date 2025-02-01)

```json
{
  "id": "b55b7756-bdfd-4218-a321-9536b8a7186c",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "import_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "period_id": null,
  "data_type": "transaction",
  "row_data": {
    "Hub": "Mérida Hub",
    "Mes": 2,
    "Año": 2025,
    "Nombre": "Norma Rodríguez Rivera",
    "Region": "Sur",
    "_rowIndex": 103,
    "_sheetName": "Datos_Rendimiento",
    "No_Empleado": "70209",
    "Ingreso_Meta": 227769,
    "Ingreso_Real": 149377,
    "Cuentas_Nuevas": 8,
    "Entregas_Tiempo": 68,
    "Cargas_Flota_Hub": 807,
    "Entregas_Totales": 75,
    "Tipo_Coordinador": "Coordinador Senior",
    "Volumen_Rutas_Hub": 807,
    "Capacidad_Flota_Hub": 1044,
    "Pct_Entregas_Tiempo": 0.9067,
    "Cumplimiento_Ingreso": 0.6558,
    "Incidentes_Seguridad": 0,
    "Tasa_Utilizacion_Hub": 0.773
  },
  "created_at": "2026-05-09T21:05:51.324839+00:00",
  "source_date": "2025-02-01"
}
```

(metadata.semantic_roles and metadata.field_identities omitted from this row excerpt — see /tmp probe output for the full ±300-line JSONB if needed. The data the engine reads is `row_data`; semantic_roles + field_identities are import-time annotations.)

## Row 2 — transaction (source_date 2025-03-01)

```json
{
  "id": "002f99b3-f2e5-470e-a58d-35fdae716fa6",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "import_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "period_id": null,
  "data_type": "transaction",
  "row_data": {
    "Hub": "Mérida Hub",
    "Mes": 3,
    "Año": 2025,
    "Nombre": "Norma Rodríguez Rivera",
    "Region": "Sur",
    "_rowIndex": 170,
    "_sheetName": "Datos_Rendimiento",
    "No_Empleado": "70209",
    "Ingreso_Meta": 241797,
    "Ingreso_Real": 315744,
    "Cuentas_Nuevas": 7,
    "Entregas_Tiempo": 98,
    "Cargas_Flota_Hub": 849,
    "Entregas_Totales": 99,
    "Tipo_Coordinador": "Coordinador Senior",
    "Volumen_Rutas_Hub": 849,
    "Capacidad_Flota_Hub": 820,
    "Pct_Entregas_Tiempo": 0.9899,
    "Cumplimiento_Ingreso": 1.3058,
    "Incidentes_Seguridad": 0,
    "Tasa_Utilizacion_Hub": 1.0354
  },
  "created_at": "2026-05-09T21:05:51.324839+00:00",
  "source_date": "2025-03-01"
}
```

## Row 3 — entity master (source_date null)

```json
{
  "id": "e30dd7cb-4eff-4344-95f4-549aa43db413",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "import_batch_id": "eb3d909b-8ac0-4272-b069-704f6f342fdb",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "period_id": null,
  "data_type": "entity",
  "row_data": {
    "Region": "Sur",
    "_rowIndex": 36,
    "_sheetName": "Plantilla",
    "No_Empleado": "70209",
    "Hub_Asignado": "Mérida Hub",
    "Fecha_Ingreso": "2018-10-03",
    "Nombre_Completo": "Norma Rodríguez Rivera",
    "Tipo_Coordinador": "Coordinador Senior"
  },
  "created_at": "2026-05-09T21:05:51.050534+00:00",
  "source_date": null
}
```

## Row 4 — transaction (source_date 2025-01-01) — period of interest

```json
{
  "id": "34bd82fa-1276-47bb-a6b7-47d0f004eea2",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "import_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "period_id": null,
  "data_type": "transaction",
  "row_data": {
    "Hub": "Mérida Hub",
    "Mes": 1,
    "Año": 2025,
    "Nombre": "Norma Rodríguez Rivera",
    "Region": "Sur",
    "_rowIndex": 36,
    "_sheetName": "Datos_Rendimiento",
    "No_Empleado": "70209",
    "Ingreso_Meta": 151402,
    "Ingreso_Real": 143414,
    "Cuentas_Nuevas": 0,
    "Entregas_Tiempo": 102,
    "Cargas_Flota_Hub": 1044,
    "Entregas_Totales": 116,
    "Tipo_Coordinador": "Coordinador Senior",
    "Volumen_Rutas_Hub": 1044,
    "Capacidad_Flota_Hub": 1370,
    "Pct_Entregas_Tiempo": 0.8793,
    "Cumplimiento_Ingreso": 0.9472,
    "Incidentes_Seguridad": 0,
    "Tasa_Utilizacion_Hub": 0.762
  },
  "created_at": "2026-05-09T21:05:51.324839+00:00",
  "source_date": "2025-01-01"
}
```

## CC observation (verbatim, not classification)

Every committed_data row has `period_id: null`. The period attribution mechanism in this dataset is via `source_date` only.
