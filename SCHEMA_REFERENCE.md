# SCHEMA_REFERENCE.md — Live Database Schema
# Source: Supabase OpenAPI endpoint (NOT TypeScript types)
# Queried: 2026-02-18
# Project: bayqxeiltnpjrvflksfa.supabase.co

**This file is the source of truth for all Supabase queries.**
**Do NOT trust database.types.ts — it may be out of sync.**

---

## profiles
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| auth_user_id | uuid |
| display_name | text |
| email | text |
| role | text |
| capabilities | jsonb |
| locale | text |
| avatar_url | text |
| created_at | timestamptz |
| updated_at | timestamptz |

## tenants
| Column | Type |
|--------|------|
| id | uuid PK |
| name | text |
| slug | text |
| settings | jsonb |
| hierarchy_labels | jsonb |
| entity_type_labels | jsonb |
| features | jsonb |
| locale | text |
| currency | text |
| created_at | timestamptz |
| updated_at | timestamptz |

## periods
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| label | text NOT NULL |
| period_type | text NOT NULL |
| status | text NOT NULL |
| start_date | date NOT NULL |
| end_date | date NOT NULL |
| canonical_key | text NOT NULL |
| metadata | jsonb NOT NULL DEFAULT '{}' |
| created_at | timestamptz |
| updated_at | timestamptz |

**NOTE: NO `period_key` column. Use `canonical_key`.**

## entities
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| entity_type | text |
| status | text |
| external_id | text |
| display_name | text |
| profile_id | uuid FK → profiles.id (nullable) |
| temporal_attributes | jsonb |
| metadata | jsonb |
| created_at | timestamptz |
| updated_at | timestamptz |

## committed_data
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| import_batch_id | uuid FK → import_batches.id |
| entity_id | uuid FK → entities.id |
| period_id | uuid FK → periods.id |
| data_type | text |
| row_data | jsonb |
| metadata | jsonb |
| created_at | timestamptz |

**NOTE: NO `period_key` column. Uses `period_id` FK.**

## rule_sets
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
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
| created_by | uuid FK → profiles.id |
| approved_by | uuid FK → profiles.id |
| created_at | timestamptz |
| updated_at | timestamptz |

## rule_set_assignments
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| rule_set_id | uuid FK → rule_sets.id |
| entity_id | uuid FK → entities.id |
| effective_from | date |
| effective_to | date |
| assignment_type | text |
| metadata | jsonb |
| created_at | timestamptz |
| updated_at | timestamptz |

## calculation_batches
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| period_id | uuid FK → periods.id |
| rule_set_id | uuid FK → rule_sets.id |
| batch_type | text |
| lifecycle_state | text |
| superseded_by | uuid FK → calculation_batches.id |
| supersedes | uuid FK → calculation_batches.id |
| entity_count | integer |
| summary | jsonb |
| config | jsonb |
| started_at | timestamptz |
| completed_at | timestamptz |
| created_by | uuid FK → profiles.id |
| created_at | timestamptz |
| updated_at | timestamptz |

## calculation_results
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| batch_id | uuid FK → calculation_batches.id |
| entity_id | uuid FK → entities.id |
| rule_set_id | uuid FK → rule_sets.id |
| period_id | uuid FK → periods.id |
| total_payout | numeric |
| components | jsonb |
| metrics | jsonb |
| attainment | jsonb |
| metadata | jsonb |
| created_at | timestamptz |

**NOTE: `total_payout` is a top-level numeric column, NOT inside result_data JSONB.**

## import_batches
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| file_name | text |
| file_type | text |
| row_count | integer |
| status | text |
| error_summary | jsonb |
| uploaded_by | uuid FK → profiles.id |
| created_at | timestamptz |
| completed_at | timestamptz |

## usage_metering
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| metric_name | text |
| metric_value | numeric |
| period_key | text |
| dimensions | jsonb |
| recorded_at | timestamptz |

**NOTE: Has `period_key` (correct for this table), `dimensions` (NOT metadata), `recorded_at` (NOT created_at).**

## classification_signals
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| entity_id | uuid FK → entities.id |
| signal_type | text |
| signal_value | jsonb |
| confidence | numeric |
| source | text |
| context | jsonb |
| created_at | timestamptz |

## entity_period_outcomes
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| entity_id | uuid FK → entities.id |
| period_id | uuid FK → periods.id |
| total_payout | numeric |
| rule_set_breakdown | jsonb |
| component_breakdown | jsonb |
| lowest_lifecycle_state | text |
| attainment_summary | jsonb |
| metadata | jsonb |
| materialized_at | timestamptz |

---

## KEY SCHEMA DISCOVERIES (vs TypeScript types)

1. **periods**: `canonical_key` NOT `period_key`. Has `label`, `metadata`. No `parent_period_id`, no `payment_date`.
2. **usage_metering**: `dimensions` NOT `metadata`. `recorded_at` NOT `created_at`. `period_key` is correct for this table.
3. **calculation_results**: `total_payout` is top-level numeric. `batch_id` NOT `calculation_batch_id`. Has `components`, `metrics`, `attainment`, `metadata`.
4. **calculation_batches**: `lifecycle_state` NOT `status`. Has `batch_type`, `config`, `superseded_by`, `supersedes`.
5. **entity_period_outcomes**: Separate materialized table with `rule_set_breakdown`, `component_breakdown`, `lowest_lifecycle_state`, `attainment_summary`.
