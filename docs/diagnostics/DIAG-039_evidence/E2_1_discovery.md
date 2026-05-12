# E2.1 — Database table inventory (component-related)

## E2.1a — `information_schema.tables` via `execute_sql` RPC

**Query (verbatim):**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name LIKE '%metric%' OR table_name LIKE '%component%' OR table_name LIKE '%derivation%' OR table_name LIKE '%rule%')
```

**Postgrest RPC result (verbatim):**
```json
{
  "code": "PGRST202",
  "details": "Searched for the function public.execute_sql with parameter query_text or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.",
  "hint": null,
  "message": "Could not find the function public.execute_sql(query_text) in the schema cache"
}
```

**Halt status:** `execute_sql` RPC is not exposed via Postgrest. Direct `information_schema` queries against the Postgrest API also fail (information_schema is not exposed). CC cannot run the directive-specified SQL via Postgrest. CC proceeds with Postgrest table HEAD probes against candidate table names (E2.1b) as the next-most-direct surface.

## E2.1b — Postgrest table HEAD probes for candidate names

CC probed five candidate table names anticipated from prior diagnostic vocabulary. Verbatim results:

| Candidate table | Postgrest response |
|---|---|
| `rule_sets` | **EXISTS** — columns: `id, tenant_id, name, description, status, version, effective_from, effective_to, population_config, input_bindings, components, cadence_config, outcome_config, metadata, created_by, approved_by, created_at, updated_at` |
| `metric_derivation_rules` | `PGRST205 — Could not find the table 'public.metric_derivation_rules' in the schema cache. Hint: Perhaps you meant the table 'public.calculation_traces'` |
| `metric_bindings` | `PGRST205 — Could not find the table 'public.metric_bindings' in the schema cache. Hint: Perhaps you meant the table 'public.platform_settings'` |
| `components` | `PGRST205 — Could not find the table 'public.components' in the schema cache. Hint: Perhaps you meant the table 'public.platform_events'` |
| `plan_components` | `PGRST205 — Could not find the table 'public.plan_components' in the schema cache. Hint: Perhaps you meant the table 'public.platform_events'` |
| `calculation_components` | `PGRST205 — Could not find the table 'public.calculation_components' in the schema cache. Hint: Perhaps you meant the table 'public.calculation_results'` |

Only `rule_sets` is a live table among the candidate names. The component declarations live within the `components` JSONB column of `rule_sets`, not in a dedicated components table. See E2.2 for the verbatim row content.
