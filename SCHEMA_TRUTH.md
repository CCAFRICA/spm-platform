# SCHEMA TRUTH — Actual Database Column Names
# Generated from database.types.ts + production error reports on 2026-02-19
# MANDATORY REFERENCE — CC must check this before writing any Supabase query

## profiles
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Profile UUID — NOT the same as auth.uid() |
| tenant_id | uuid | FK to tenants |
| auth_user_id | uuid | FK to auth.users — matches auth.uid() |
| display_name | text | |
| email | text | |
| role | text | Values: vl_admin, admin, tenant_admin, manager, viewer |
| capabilities | jsonb | Array of Capability strings |
| locale | text | nullable |
| avatar_url | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**CRITICAL NOTES:**
- `auth.uid()` matches `auth_user_id`, NOT `id`
- Use `.eq('auth_user_id', user.id)` for auth-based lookups
- NO `entity_id` column — use entities.profile_id for profile→entity linkage
- `scope_level` exists in types but user reports it may not exist in DB — verify before use
- `scope_override`, `settings`, `status` exist in types — verify before use

## tenants
| Column | Type |
|--------|------|
| id | uuid |
| name | text |
| slug | text |
| settings | jsonb |
| hierarchy_labels | jsonb |
| entity_type_labels | jsonb |
| currency | text |
| locale | text |
| features | jsonb |
| status | text |
| created_at | timestamptz |
| updated_at | timestamptz |

## entities
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| tenant_id | uuid | |
| entity_type | text | individual, location, team, organization |
| status | text | proposed, active, suspended, terminated |
| external_id | text | nullable — employee ID from source system |
| display_name | text | |
| profile_id | uuid | nullable — FK to profiles.id (entity→profile link) |
| temporal_attributes | jsonb | |
| metadata | jsonb | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

NOTE: Profile→entity linkage goes through entities.profile_id, NOT profiles.entity_id

## entity_relationships
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| source_entity_id | uuid |
| target_entity_id | uuid |
| relationship_type | text |
| source | text |
| confidence | numeric |
| evidence | jsonb |
| context | jsonb |
| effective_from | timestamptz |
| effective_to | timestamptz |
| created_at | timestamptz |
| updated_at | timestamptz |

## reassignment_events
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| entity_id | uuid |
| from_entity_id | uuid |
| to_entity_id | uuid |
| effective_date | date |
| credit_model | jsonb |
| transition_window | jsonb |
| impact_preview | jsonb |
| reason | text |
| created_by | uuid |
| created_at | timestamptz |

## rule_sets
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| name | text |
| description | text |
| status | text |
| version | integer |
| effective_from | date |
| effective_to | date |
| population_config | jsonb |
| input_bindings | jsonb |
| components | jsonb |
| cadence_config | jsonb |
| outcome_config | jsonb |
| metadata | jsonb |
| created_by | uuid |
| approved_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |

## rule_set_assignments
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| rule_set_id | uuid |
| entity_id | uuid |
| effective_from | date |
| effective_to | date |
| assignment_type | text |
| metadata | jsonb |
| created_at | timestamptz |
| updated_at | timestamptz |

## periods
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| canonical_key | text |
| label | text |
| period_type | text |
| start_date | date |
| end_date | date |
| status | text |
| metadata | jsonb |
| created_at | timestamptz |
| updated_at | timestamptz |

## import_batches
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| file_name | text |
| file_type | text |
| row_count | integer |
| status | text |
| error_summary | jsonb |
| uploaded_by | uuid |
| created_at | timestamptz |
| completed_at | timestamptz |

## committed_data
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| import_batch_id | uuid |
| entity_id | uuid |
| period_id | uuid |
| data_type | text |
| row_data | jsonb |
| metadata | jsonb |
| created_at | timestamptz |

## calculation_batches
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| period_id | uuid |
| rule_set_id | uuid |
| batch_type | text |
| lifecycle_state | text |
| superseded_by | uuid |
| supersedes | uuid |
| entity_count | integer |
| summary | jsonb |
| config | jsonb |
| started_at | timestamptz |
| completed_at | timestamptz |
| created_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |

NOTE: lifecycle_state values: DRAFT, PREVIEW, RECONCILE, OFFICIAL, PENDING_APPROVAL, APPROVED, REJECTED, SUPERSEDED, POSTED, CLOSED, PAID, PUBLISHED

## calculation_results
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| batch_id | uuid |
| entity_id | uuid |
| rule_set_id | uuid |
| period_id | uuid |
| total_payout | numeric |
| components | jsonb |
| metrics | jsonb |
| attainment | jsonb |
| metadata | jsonb |
| created_at | timestamptz |

## calculation_traces
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| result_id | uuid |
| component_name | text |
| formula | text |
| inputs | jsonb |
| output | jsonb |
| steps | jsonb |
| created_at | timestamptz |

## disputes
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| entity_id | uuid |
| period_id | uuid |
| batch_id | uuid |
| status | text |
| category | text |
| description | text |
| resolution | text |
| amount_disputed | numeric |
| amount_resolved | numeric |
| filed_by | uuid |
| resolved_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |
| resolved_at | timestamptz |

## reconciliation_sessions
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| period_id | uuid |
| batch_id | uuid |
| status | text |
| config | jsonb |
| results | jsonb |
| summary | jsonb |
| created_by | uuid |
| created_at | timestamptz |
| completed_at | timestamptz |

## classification_signals
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| entity_id | uuid |
| signal_type | text |
| signal_value | jsonb |
| confidence | numeric |
| source | text |
| context | jsonb |
| created_at | timestamptz |

## audit_logs
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| profile_id | uuid |
| action | text |
| resource_type | text |
| resource_id | uuid |
| changes | jsonb |
| metadata | jsonb |
| ip_address | text |
| created_at | timestamptz |

## ingestion_configs
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| name | text |
| source_type | text |
| config | jsonb |
| mapping | jsonb |
| schedule | jsonb |
| is_active | boolean |
| created_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |

## ingestion_events
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| config_id | uuid |
| status | text |
| records_processed | integer |
| records_failed | integer |
| error_log | jsonb |
| started_at | timestamptz |
| completed_at | timestamptz |
| created_at | timestamptz |

## usage_metering
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| metric_name | text |
| metric_value | numeric |
| period_key | text |
| dimensions | jsonb |
| recorded_at | timestamptz |

## period_entity_state
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| entity_id | uuid |
| period_id | uuid |
| resolved_attributes | jsonb |
| resolved_relationships | jsonb |
| entity_type | text |
| status | text |
| materialized_at | timestamptz |

## profile_scope
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| profile_id | uuid |
| scope_type | text |
| visible_entity_ids | uuid[] |
| visible_rule_set_ids | uuid[] |
| visible_period_ids | uuid[] |
| metadata | jsonb |
| materialized_at | timestamptz |

## entity_period_outcomes
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| entity_id | uuid |
| period_id | uuid |
| total_payout | numeric |
| rule_set_breakdown | jsonb |
| component_breakdown | jsonb |
| lowest_lifecycle_state | text |
| attainment_summary | jsonb |
| metadata | jsonb |
| materialized_at | timestamptz |

## platform_settings
| Column | Type |
|--------|------|
| id | uuid |
| key | text |
| value | jsonb |
| description | text |
| updated_by | uuid |
| updated_at | timestamptz |
| created_at | timestamptz |

---

*Generated 2026-02-19. Source: database.types.ts + production error validation.*
*Update this file when schema changes are made.*
