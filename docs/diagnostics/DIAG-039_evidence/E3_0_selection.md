# E3.0 — Selection (entity, period) (verbatim)

**Selection rule:** first entity_id alphabetically ascending × earliest period_id by start_date ascending.

## Counts

```
Entity count: 79
Period count: 3
```

## Selected entity

```json
{
  "id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "display_name": "Norma Rodríguez Rivera",
  "entity_type": "individual",
  "external_id": "70209",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "metadata": {
    "region": "Sur",
    "fecha_ingreso": "2018-10-03",
    "tipo_coordinador": "Coordinador Senior"
  }
}
```

## All 3 Meridian periods (start_date ascending)

```json
[
  {
    "id": "3c2557f4-d922-4b30-a073-ac4811f1f3cb",
    "label": "January 2025",
    "period_type": "monthly",
    "status": "open",
    "start_date": "2025-01-01",
    "end_date": "2025-01-31",
    "canonical_key": "monthly_2025-01-01_2025-01-31",
    "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79"
  },
  {
    "id": "95c303a0-0287-47ed-bbe5-f0a766a6843e",
    "label": "February 2025",
    "period_type": "monthly",
    "status": "open",
    "start_date": "2025-02-01",
    "end_date": "2025-02-28",
    "canonical_key": "monthly_2025-02-01_2025-02-28",
    "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79"
  },
  {
    "id": "8bfc8730-458d-4abb-96cb-dc3f936bc2da",
    "label": "March 2025",
    "period_type": "monthly",
    "status": "open",
    "start_date": "2025-03-01",
    "end_date": "2025-03-31",
    "canonical_key": "monthly_2025-03-01_2025-03-31",
    "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79"
  }
]
```

## Selection IDs (chosen for trace)

```json
{
  "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
  "entity_external_id": "70209",
  "entity_display_name": "Norma Rodríguez Rivera",
  "periodId": "3c2557f4-d922-4b30-a073-ac4811f1f3cb",
  "period_label": "January 2025",
  "period_start": "2025-01-01",
  "period_end": "2025-01-31"
}
```
