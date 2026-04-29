# Live Schema Reference

*Generated: 2026-04-29*

*Source: Supabase live database (information_schema via OpenAPI spec).*

*Refreshed via `web/scripts/refresh-schema-reference.mjs`. Captures table list, columns, types, nullability, defaults, and FK relationships. Index/CHECK/RLS metadata not in OpenAPI surface — query Supabase Dashboard SQL Editor when needed.*

## Tables (35)

### agent_inbox (16 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO |  |
| agent_id | text | NO |  |
| type | text | NO |  |
| title | text | NO |  |
| description | text | YES |  |
| severity | text | NO | info |
| action_url | text | YES |  |
| action_label | text | YES |  |
| metadata | jsonb | YES |  |
| persona | text | NO | admin |
| expires_at | timestamp with time zone | YES |  |
| read_at | timestamp with time zone | YES |  |
| dismissed_at | timestamp with time zone | YES |  |
| acted_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |

### alias_registry (12 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | YES |  |
| reference_item_id | uuid | NO |  |
| alias_text | text | NO |  |
| alias_normalized | text | NO |  |
| confidence | numeric | NO | 0 |
| confirmation_count | integer | NO | 0 |
| source | text | NO | ai |
| scope | text | NO | tenant |
| metadata | jsonb | NO |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### approval_requests (13 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO |  |
| batch_id | uuid | NO |  |
| period_id | uuid | NO |  |
| request_type | text | NO | calculation_approval |
| status | text | NO | pending |
| requested_by | uuid | YES |  |
| decided_by | uuid | YES |  |
| decision_notes | text | YES |  |
| requested_at | timestamp with time zone | NO | now() |
| decided_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### audit_logs (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| profile_id | uuid | YES |  |
| action | text | NO |  |
| resource_type | text | NO |  |
| resource_id | uuid | YES |  |
| changes | jsonb | NO |  |
| metadata | jsonb | NO |  |
| ip_address | inet | YES |  |
| created_at | timestamp with time zone | NO | now() |

### calculation_batches (16 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| period_id | uuid | NO |  |
| rule_set_id | uuid | YES |  |
| batch_type | text | NO | standard |
| lifecycle_state | text | NO | DRAFT |
| superseded_by | uuid | YES |  |
| supersedes | uuid | YES |  |
| entity_count | integer | NO | 0 |
| summary | jsonb | NO |  |
| config | jsonb | NO |  |
| started_at | timestamp with time zone | YES |  |
| completed_at | timestamp with time zone | YES |  |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### calculation_results (12 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| batch_id | uuid | NO |  |
| entity_id | uuid | NO |  |
| rule_set_id | uuid | YES |  |
| period_id | uuid | YES |  |
| total_payout | numeric | NO | 0 |
| components | jsonb | NO |  |
| metrics | jsonb | NO |  |
| attainment | jsonb | NO |  |
| metadata | jsonb | NO |  |
| created_at | timestamp with time zone | NO | now() |

### calculation_traces (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| result_id | uuid | NO |  |
| component_name | text | NO |  |
| formula | text | YES |  |
| inputs | jsonb | NO |  |
| output | jsonb | NO |  |
| steps | jsonb | NO |  |
| created_at | timestamp with time zone | NO | now() |

### classification_signals (23 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| entity_id | uuid | YES |  |
| signal_type | text | NO |  |
| signal_value | jsonb | NO |  |
| confidence | numeric | YES |  |
| source | text | YES |  |
| context | jsonb | NO |  |
| created_at | timestamp with time zone | NO | now() |
| source_file_name | text | YES |  |
| sheet_name | text | YES |  |
| structural_fingerprint | jsonb | YES |  |
| classification | text | YES |  |
| decision_source | text | YES |  |
| classification_trace | jsonb | YES |  |
| header_comprehension | jsonb | YES |  |
| vocabulary_bindings | jsonb | YES |  |
| agent_scores | jsonb | YES |  |
| human_correction_from | text | YES |  |
| scope | text | YES | tenant |
| rule_set_id | uuid | YES |  |
| metric_name | text | YES |  |
| component_index | integer | YES |  |

### committed_data (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| import_batch_id | uuid | YES |  |
| entity_id | uuid | YES |  |
| period_id | uuid | YES |  |
| data_type | text | NO |  |
| row_data | jsonb | NO |  |
| metadata | jsonb | NO |  |
| created_at | timestamp with time zone | NO | now() |
| source_date | date | YES |  |

### domain_patterns (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| pattern_signature | text | NO |  |
| domain_id | text | NO |  |
| vertical_hint | text | YES |  |
| confidence_mean | numeric | YES | 0.5 |
| total_executions | bigint | YES | 0 |
| tenant_count | integer | YES | 0 |
| learned_behaviors | jsonb | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### entities (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| entity_type | text | NO | individual |
| status | text | NO | active |
| external_id | text | YES |  |
| display_name | text | NO |  |
| profile_id | uuid | YES |  |
| temporal_attributes | jsonb | NO |  |
| metadata | jsonb | NO |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### entity_period_outcomes (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| entity_id | uuid | NO |  |
| period_id | uuid | NO |  |
| total_payout | numeric | NO | 0 |
| rule_set_breakdown | jsonb | NO |  |
| component_breakdown | jsonb | NO |  |
| lowest_lifecycle_state | text | NO | DRAFT |
| attainment_summary | jsonb | NO |  |
| metadata | jsonb | NO |  |
| materialized_at | timestamp with time zone | NO | now() |

### entity_relationships (13 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| source_entity_id | uuid | NO |  |
| target_entity_id | uuid | NO |  |
| relationship_type | text | NO |  |
| source | text | NO | imported_explicit |
| confidence | numeric | NO | 1 |
| evidence | jsonb | NO |  |
| context | jsonb | NO |  |
| effective_from | date | YES |  |
| effective_to | date | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### foundational_patterns (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| pattern_signature | text | NO |  |
| confidence_mean | numeric | YES | 0.5 |
| confidence_variance | numeric | YES | 0 |
| total_executions | bigint | YES | 0 |
| tenant_count | integer | YES | 0 |
| anomaly_rate_mean | numeric | YES | 0 |
| learned_behaviors | jsonb | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### import_batches (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| file_name | text | NO |  |
| file_type | text | NO |  |
| row_count | integer | NO | 0 |
| status | text | NO | pending |
| error_summary | jsonb | NO |  |
| uploaded_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| completed_at | timestamp with time zone | YES |  |
| metadata | jsonb | YES |  |

### ingestion_configs (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| name | text | NO |  |
| source_type | text | NO |  |
| config | jsonb | NO |  |
| mapping | jsonb | NO |  |
| schedule | jsonb | NO |  |
| is_active | boolean | NO | true |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### ingestion_events (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| config_id | uuid | YES |  |
| status | text | NO | pending |
| records_processed | integer | NO | 0 |
| records_failed | integer | NO | 0 |
| error_log | jsonb | NO |  |
| started_at | timestamp with time zone | YES |  |
| completed_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |

### period_entity_state (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| entity_id | uuid | NO |  |
| period_id | uuid | NO |  |
| resolved_attributes | jsonb | NO |  |
| resolved_relationships | jsonb | NO |  |
| entity_type | text | NO |  |
| status | text | NO |  |
| materialized_at | timestamp with time zone | NO | now() |

### periods (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| label | text | NO |  |
| period_type | text | NO | monthly |
| status | text | NO | open |
| start_date | date | NO |  |
| end_date | date | NO |  |
| canonical_key | text | NO |  |
| metadata | jsonb | NO |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### platform_events (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | YES |  |
| event_type | text | NO |  |
| actor_id | uuid | YES |  |
| entity_id | uuid | YES |  |
| payload | jsonb | YES |  |
| processed_by | jsonb | YES |  |
| created_at | timestamp with time zone | NO | now() |

### platform_settings (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| key | text | NO |  |
| value | jsonb | NO |  |
| description | text | YES |  |
| updated_by | uuid | YES |  |
| updated_at | timestamp with time zone | NO | now() |
| created_at | timestamp with time zone | NO | now() |

### processing_jobs (18 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO |  |
| status | text | NO | pending |
| file_storage_path | text | NO |  |
| file_name | text | NO |  |
| file_size_bytes | bigint | YES |  |
| structural_fingerprint | text | YES |  |
| classification_result | jsonb | YES |  |
| recognition_tier | integer | YES |  |
| proposal | jsonb | YES |  |
| chunk_progress | jsonb | YES |  |
| error_detail | text | YES |  |
| retry_count | integer | NO | 0 |
| uploaded_by | uuid | YES |  |
| session_id | uuid | NO | gen_random_uuid() |
| created_at | timestamp with time zone | NO | now() |
| started_at | timestamp with time zone | YES |  |
| completed_at | timestamp with time zone | YES |  |

### profile_scope (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| profile_id | uuid | NO |  |
| scope_type | text | NO | graph_derived |
| visible_entity_ids | uuid[] | NO |  |
| visible_rule_set_ids | uuid[] | NO |  |
| visible_period_ids | uuid[] | NO |  |
| metadata | jsonb | NO |  |
| materialized_at | timestamp with time zone | NO | now() |

### profiles (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | YES |  |
| auth_user_id | uuid | NO |  |
| display_name | text | NO |  |
| email | text | NO |  |
| role | text | NO | viewer |
| capabilities | jsonb | NO |  |
| locale | text | YES |  |
| avatar_url | text | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### reassignment_events (12 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| entity_id | uuid | NO |  |
| from_entity_id | uuid | YES |  |
| to_entity_id | uuid | YES |  |
| effective_date | date | NO |  |
| credit_model | jsonb | NO |  |
| transition_window | jsonb | NO |  |
| impact_preview | jsonb | NO |  |
| reason | text | YES |  |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |

### reconciliation_sessions (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| period_id | uuid | YES |  |
| batch_id | uuid | YES |  |
| status | text | NO | pending |
| config | jsonb | NO |  |
| results | jsonb | NO |  |
| summary | jsonb | NO |  |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| completed_at | timestamp with time zone | YES |  |

### reference_data (13 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO |  |
| reference_type | text | NO |  |
| name | text | NO |  |
| version | integer | NO | 1 |
| status | text | NO | draft |
| key_field | text | NO |  |
| schema_definition | jsonb | YES |  |
| import_batch_id | uuid | YES |  |
| metadata | jsonb | NO |  |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### reference_items (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO |  |
| reference_data_id | uuid | NO |  |
| external_key | text | NO |  |
| display_name | text | YES |  |
| category | text | YES |  |
| attributes | jsonb | NO |  |
| status | text | NO | active |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### rule_set_assignments (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| rule_set_id | uuid | NO |  |
| entity_id | uuid | NO |  |
| effective_from | date | YES |  |
| effective_to | date | YES |  |
| assignment_type | text | NO | direct |
| metadata | jsonb | NO |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### rule_sets (18 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| name | text | NO |  |
| description | text | YES |  |
| status | text | NO | draft |
| version | integer | NO | 1 |
| effective_from | date | YES |  |
| effective_to | date | YES |  |
| population_config | jsonb | NO |  |
| input_bindings | jsonb | NO |  |
| components | jsonb | NO |  |
| cadence_config | jsonb | NO |  |
| outcome_config | jsonb | NO |  |
| metadata | jsonb | NO |  |
| created_by | uuid | YES |  |
| approved_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### structural_fingerprints (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | YES |  |
| fingerprint | text | NO |  |
| fingerprint_hash | text | NO |  |
| classification_result | jsonb | NO |  |
| column_roles | jsonb | NO |  |
| match_count | integer | NO | 1 |
| confidence | numeric | NO | 0.7 |
| source_file_sample | text | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### synaptic_density (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO |  |
| signature | text | NO |  |
| confidence | numeric | NO | 0.5 |
| execution_mode | text | NO | full_trace |
| total_executions | integer | NO | 0 |
| last_anomaly_rate | numeric | NO | 0 |
| last_correction_count | integer | NO | 0 |
| learned_behaviors | jsonb | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### tenants (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| name | text | NO |  |
| slug | text | NO |  |
| settings | jsonb | NO |  |
| hierarchy_labels | jsonb | NO |  |
| entity_type_labels | jsonb | NO |  |
| features | jsonb | NO |  |
| locale | text | NO | en |
| currency | text | NO | USD |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### usage_metering (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO |  |
| metric_name | text | NO |  |
| metric_value | numeric | NO | 0 |
| period_key | text | NO |  |
| dimensions | jsonb | NO |  |
| recorded_at | timestamp with time zone | NO | now() |

### user_journey (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| tenant_id | uuid | NO |  |
| milestone | text | NO |  |
| completed_at | timestamp with time zone | NO | now() |
| metadata | jsonb | YES |  |

## Foreign Key Relationships (65)

| From Table | From Column | → | To Table | To Column |
|------------|-------------|---|----------|-----------|
| agent_inbox | tenant_id | → | tenants | id |
| alias_registry | reference_item_id | → | reference_items | id |
| alias_registry | tenant_id | → | tenants | id |
| approval_requests | batch_id | → | calculation_batches | id |
| approval_requests | period_id | → | periods | id |
| approval_requests | tenant_id | → | tenants | id |
| audit_logs | tenant_id | → | tenants | id |
| calculation_batches | period_id | → | periods | id |
| calculation_batches | rule_set_id | → | rule_sets | id |
| calculation_batches | superseded_by | → | calculation_batches | id |
| calculation_batches | supersedes | → | calculation_batches | id |
| calculation_batches | tenant_id | → | tenants | id |
| calculation_results | batch_id | → | calculation_batches | id |
| calculation_results | entity_id | → | entities | id |
| calculation_results | period_id | → | periods | id |
| calculation_results | rule_set_id | → | rule_sets | id |
| calculation_results | tenant_id | → | tenants | id |
| calculation_traces | result_id | → | calculation_results | id |
| calculation_traces | tenant_id | → | tenants | id |
| classification_signals | entity_id | → | entities | id |
| classification_signals | tenant_id | → | tenants | id |
| committed_data | entity_id | → | entities | id |
| committed_data | import_batch_id | → | import_batches | id |
| committed_data | period_id | → | periods | id |
| committed_data | tenant_id | → | tenants | id |
| entities | profile_id | → | profiles | id |
| entities | tenant_id | → | tenants | id |
| entity_period_outcomes | entity_id | → | entities | id |
| entity_period_outcomes | period_id | → | periods | id |
| entity_period_outcomes | tenant_id | → | tenants | id |
| entity_relationships | source_entity_id | → | entities | id |
| entity_relationships | target_entity_id | → | entities | id |
| entity_relationships | tenant_id | → | tenants | id |
| import_batches | tenant_id | → | tenants | id |
| ingestion_configs | tenant_id | → | tenants | id |
| ingestion_events | config_id | → | ingestion_configs | id |
| ingestion_events | tenant_id | → | tenants | id |
| period_entity_state | entity_id | → | entities | id |
| period_entity_state | period_id | → | periods | id |
| period_entity_state | tenant_id | → | tenants | id |
| periods | tenant_id | → | tenants | id |
| platform_events | tenant_id | → | tenants | id |
| processing_jobs | tenant_id | → | tenants | id |
| profile_scope | profile_id | → | profiles | id |
| profile_scope | tenant_id | → | tenants | id |
| profiles | tenant_id | → | tenants | id |
| reassignment_events | entity_id | → | entities | id |
| reassignment_events | from_entity_id | → | entities | id |
| reassignment_events | tenant_id | → | tenants | id |
| reassignment_events | to_entity_id | → | entities | id |
| reconciliation_sessions | batch_id | → | calculation_batches | id |
| reconciliation_sessions | period_id | → | periods | id |
| reconciliation_sessions | tenant_id | → | tenants | id |
| reference_data | import_batch_id | → | import_batches | id |
| reference_data | tenant_id | → | tenants | id |
| reference_items | reference_data_id | → | reference_data | id |
| reference_items | tenant_id | → | tenants | id |
| rule_set_assignments | entity_id | → | entities | id |
| rule_set_assignments | rule_set_id | → | rule_sets | id |
| rule_set_assignments | tenant_id | → | tenants | id |
| rule_sets | tenant_id | → | tenants | id |
| structural_fingerprints | tenant_id | → | tenants | id |
| synaptic_density | tenant_id | → | tenants | id |
| usage_metering | tenant_id | → | tenants | id |
| user_journey | tenant_id | → | tenants | id |

## Tenant-Scoped Tables (31)

Tables containing a `tenant_id` column. Used for clean-slate DELETE script generation.

- `agent_inbox` — tenant_id uuid, NOT NULL
- `alias_registry` — tenant_id uuid, nullable
- `approval_requests` — tenant_id uuid, NOT NULL
- `audit_logs` — tenant_id uuid, NOT NULL
- `calculation_batches` — tenant_id uuid, NOT NULL
- `calculation_results` — tenant_id uuid, NOT NULL
- `calculation_traces` — tenant_id uuid, NOT NULL
- `classification_signals` — tenant_id uuid, NOT NULL
- `committed_data` — tenant_id uuid, NOT NULL
- `entities` — tenant_id uuid, NOT NULL
- `entity_period_outcomes` — tenant_id uuid, NOT NULL
- `entity_relationships` — tenant_id uuid, NOT NULL
- `import_batches` — tenant_id uuid, NOT NULL
- `ingestion_configs` — tenant_id uuid, NOT NULL
- `ingestion_events` — tenant_id uuid, NOT NULL
- `period_entity_state` — tenant_id uuid, NOT NULL
- `periods` — tenant_id uuid, NOT NULL
- `platform_events` — tenant_id uuid, nullable
- `processing_jobs` — tenant_id uuid, NOT NULL
- `profile_scope` — tenant_id uuid, NOT NULL
- `profiles` — tenant_id uuid, nullable
- `reassignment_events` — tenant_id uuid, NOT NULL
- `reconciliation_sessions` — tenant_id uuid, NOT NULL
- `reference_data` — tenant_id uuid, NOT NULL
- `reference_items` — tenant_id uuid, NOT NULL
- `rule_set_assignments` — tenant_id uuid, NOT NULL
- `rule_sets` — tenant_id uuid, NOT NULL
- `structural_fingerprints` — tenant_id uuid, nullable
- `synaptic_density` — tenant_id uuid, NOT NULL
- `usage_metering` — tenant_id uuid, NOT NULL
- `user_journey` — tenant_id uuid, NOT NULL
