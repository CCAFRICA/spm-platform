# E3.1 — `classification_signals` Schema Columns (verbatim live read)

**Per directive Section 0 halt-and-surface convention:** the directive's primary command `SELECT ... FROM information_schema.columns ...` requires PostgreSQL function execution. The Supabase deployment for this project exposes Postgrest, which does NOT permit arbitrary SQL via `.rpc('execute_sql', ...)` (the function does not exist in the public schema) and does NOT expose the `information_schema` namespace to Postgrest schema queries.

**Verbatim Postgrest response (RPC attempt):**

```
RPC execute_sql unavailable: Could not find the function public.execute_sql(sql) in the schema cache
```

**Verbatim Postgrest response (information_schema direct-query attempt):**

```
E3.1 fallback unavailable: Invalid schema: information_schema
```

## Fallback: sample-row column-key introspection

CC ran a `SELECT *` against `classification_signals` LIMIT 1 and dumped the row's object keys. This surfaces the **column names** but NOT data_type, is_nullable, or column_default. Architect-channel direct SQL access is required for the full E3.1 specification.

**Total columns observed:** 24

```
id: type=string
tenant_id: type=string
entity_id: type=null
signal_type: type=string
signal_value: type=object/jsonb
confidence: type=null
source: type=null
context: type=object/jsonb
created_at: type=string
source_file_name: type=null
sheet_name: type=null
structural_fingerprint: type=null
classification: type=null
decision_source: type=null
classification_trace: type=null
header_comprehension: type=null
vocabulary_bindings: type=null
agent_scores: type=null
human_correction_from: type=null
scope: type=string
rule_set_id: type=null
metric_name: type=null
component_index: type=null
calculation_run_id: type=null
```

**Note on `type=` entries:** `null` indicates the sample row's column value was null (JSON-serialization-time type, NOT schema definition). Sample-row introspection cannot recover data_type, is_nullable, or column_default from Postgrest in this environment. The 24 column NAMES are reliable; their types/nullability/defaults require direct PostgreSQL access via architect-channel SQL Editor.
