# E6 — Schema cross-reference (verbatim)

## E6.1 — Column-key inventory via Postgrest sample-row probe

**Halt-noted:** `information_schema.columns` is not exposed via Postgrest. Sample-row column-key introspection (Postgrest `select('*').limit(1)`) used as fallback per the prior AUD-007 finding. CC surfaces.

Verbatim probe output below for the 7 tables E2/E3/E4 read from.

### `rule_sets` — 18 columns
```
id: string                  population_config: object
tenant_id: string           input_bindings: object
name: string                components: object
description: string         cadence_config: object
status: string              outcome_config: object
version: number             metadata: object
effective_from: null        created_by: string
effective_to: null          approved_by: null
                            created_at: string
                            updated_at: string
```

### `committed_data` — 10 columns
```
id: string                  data_type: string
tenant_id: string           row_data: object
import_batch_id: string     metadata: object
entity_id: string           created_at: string
period_id: null             source_date: null
```

### `entities` — 11 columns
```
id: string                  profile_id: null
tenant_id: string           temporal_attributes: array
entity_type: string         metadata: object
status: string              created_at: string
external_id: string         updated_at: string
display_name: string
```

### `periods` — 11 columns
```
id: string                  start_date: string
tenant_id: string           end_date: string
label: string               canonical_key: string
period_type: string         metadata: object
status: string              created_at: string
                            updated_at: string
```

### `calculation_results` — 12 columns
```
id: string                  total_payout: number
tenant_id: string           components: array
batch_id: string            metrics: object
entity_id: string           attainment: object
rule_set_id: string         metadata: object
period_id: string           created_at: string
```

### `entity_period_outcomes` — 11 columns
```
id: string                  rule_set_breakdown: array
tenant_id: string           component_breakdown: array
entity_id: string           lowest_lifecycle_state: string
period_id: string           attainment_summary: object
total_payout: number        metadata: object
                            materialized_at: string
```

### `calculation_batches` — 16 columns
```
id: string                  entity_count: number
tenant_id: string           summary: object
period_id: string           config: object
rule_set_id: string         started_at: string
batch_type: string          completed_at: string
lifecycle_state: string     created_by: null
superseded_by: null         created_at: string
supersedes: null            updated_at: string
```

## E6.2 — Foreign-key relationships (verbatim from migrations)

**Halt-noted:** `information_schema.table_constraints + key_column_usage` are not exposed via Postgrest. The canonical FK declarations are in `supabase/migrations/*.sql`. Verbatim `REFERENCES` lines from the table-declaring migrations below.

### `rule_sets` (supabase/migrations/002_rule_sets_and_periods.sql)

```
12: CREATE TABLE rule_sets (
14:   tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
28:   created_by        UUID REFERENCES profiles(id),
29:   approved_by       UUID REFERENCES profiles(id),
```

### `periods` (supabase/migrations/002_rule_sets_and_periods.sql)

```
136: CREATE TABLE periods (
138:   tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
```

### `entities` (supabase/migrations/001_core_tables.sql)

```
57: CREATE TABLE entities (
59:   tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
```

### `committed_data` (supabase/migrations/003_data_and_calculation.sql)

```
51: CREATE TABLE committed_data (
53:   tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
54:   import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
55:   entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
56:   period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
```

### `calculation_batches` (supabase/migrations/003_data_and_calculation.sql)

```
90:  CREATE TABLE calculation_batches (
92:    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
93:    period_id       UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
94:    rule_set_id     UUID REFERENCES rule_sets(id) ON DELETE SET NULL,
103:   superseded_by   UUID REFERENCES calculation_batches(id),
104:   supersedes      UUID REFERENCES calculation_batches(id),
110:   created_by      UUID REFERENCES profiles(id),
```

### `calculation_results` (supabase/migrations/003_data_and_calculation.sql)

```
151: CREATE TABLE calculation_results (
153:   tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
154:   batch_id        UUID NOT NULL REFERENCES calculation_batches(id) ON DELETE CASCADE,
155:   entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
156:   rule_set_id     UUID REFERENCES rule_sets(id) ON DELETE SET NULL,
157:   period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
```

### `entity_period_outcomes` (supabase/migrations/004_materializations.sql)

```
136: CREATE TABLE entity_period_outcomes (
138:   tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
139:   entity_id             UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
140:   period_id             UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
```

## CC observations (verbatim, not classification)

- `committed_data.period_id` is `nullable` (FK `ON DELETE SET NULL`), and the live row sample's `period_id` is `null` (E3.1 — all 4 rows for the selected entity).
- `calculation_results.period_id` is also nullable; the live row sample's `period_id` is non-null (`3c2557f4-…`).
- `entity_period_outcomes.period_id` is `NOT NULL` (no FK SET NULL); the live row sample's `period_id` matches the selected period.
- No FK named after the c4 component exists at the schema layer; c4 is a JSONB element within `rule_sets.components.variants[0].components[4]`.
