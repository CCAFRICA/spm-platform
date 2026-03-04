# OB-152 Read Confirmation

## Files Read

1. **CC_STANDING_ARCHITECTURE_RULES.md** — READ COMPLETE
2. **SCHEMA_REFERENCE.md** — READ COMPLETE
3. **DECISION_92_TEMPORAL_REFERENCE_NORMALIZATION.md** — FILE NOT FOUND (does not exist in repo)
4. **ENGINE_CONTRACT_BINDING.sql** — FILE NOT FOUND (does not exist in repo)
5. **Vialuce_Synaptic_Content_Ingestion_Specification.md** — FILE NOT FOUND (does not exist in repo)
6. **OB-127_SCI_FOUNDATION.md** — READ COMPLETE

---

## SCHEMA_REFERENCE.md: committed_data table definition

```
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
```

NOTE: No `period_key` column. Uses `period_id` FK.

---

## CC_STANDING_ARCHITECTURE_RULES.md: Anti-Pattern Registry count

**22 anti-patterns** (AP-1 through AP-22) across 5 categories:
- Data & Transport: AP-1 through AP-4 (4)
- AI & Intelligence: AP-5 through AP-7, AP-18 (4)
- Deployment & Verification: AP-8 through AP-11 (4)
- Identity & State: AP-12 through AP-14 (3)
- UX & Client: AP-15 through AP-17 (3)
- Pipeline & Lifecycle: AP-19 through AP-22 (4)

---

## SCI Specification (from OB-127_SCI_FOUNDATION.md): 4 Agent Types and Top 3 Positive Signals

### Plan Agent
1. auto_generated_headers (+0.25) — headerQuality === 'auto_generated'
2. high_sparsity (+0.20) — sparsity > 0.30
3. percentage_values (+0.15) — hasPercentageValues === true

### Entity Agent
1. has_entity_id (+0.25) — hasEntityIdentifier === true
2. has_name_field (+0.20) — any field with nameSignals.containsName
3. moderate_rows (+0.15) — rowCountCategory === 'moderate'

### Target Agent
1. has_target_field (+0.25) — any field with nameSignals.containsTarget
2. has_entity_id (+0.20) — hasEntityIdentifier === true
3. reference_rows (+0.15) — rowCountCategory === 'reference'

### Transaction Agent
1. has_date (+0.25) — hasDateColumn === true
2. transactional_rows (+0.20) — rowCountCategory === 'transactional'
3. has_currency (+0.15) — hasCurrencyColumns > 0
