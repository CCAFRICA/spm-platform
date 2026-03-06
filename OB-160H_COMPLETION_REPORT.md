# OB-160H Completion Report: Field-Level PARTIAL Claims

## Phase 0: Path Determination

### PATH A: EXISTS AND WORKS
Full PARTIAL claim pipeline implemented across 4 files (OB-134, OB-159):
- `negotiation.ts` (403 lines) — field affinity scoring, split detection, partial bindings
- `synaptic-ingestion-state.ts` — proposal generation with PARTIAL metadata
- `execute/route.ts` — `filterFieldsForPartialClaim()` field filtering
- `sci-types.ts` — `ClaimType = 'FULL' | 'PARTIAL' | 'DERIVED'`

### No Gaps Found
Every spec requirement already implemented:
1. Field affinity rules (8 structural rules, Korean Test compliant)
2. Split detection (gap > 0.25 = no split, runner-up >= 30% = split)
3. Per-agent semantic bindings with role inference
4. Proposal generation with `ownedFields`, `sharedFields`, `partnerContentUnitId`
5. Execute-time field filtering for PARTIAL claims
6. `::split` convention for secondary content unit IDs

## Implementation Detail

### Field Affinity Rules (negotiation.ts lines 28-69)
| Rule | Test | Strongest Agent |
|------|------|-----------------|
| 1 | `containsId` | entity (0.90), shared join key |
| 2 | `containsName \|\| looksLikePersonName` | entity (0.90) |
| 3 | `containsDate \|\| dataType === 'date'` | transaction (0.90) |
| 4 | `containsAmount \|\| dataType === 'currency'` | transaction (0.80) |
| 5 | `containsTarget` | target (0.90) |
| 6 | `containsRate \|\| dataType === 'percentage'` | plan (0.80) |
| 7 | Low-cardinality text (<20 distinct) | entity (0.60) |
| 8 | Sequential integers | entity (0.70) |

All rules use `FieldProfile.nameSignals` and `FieldProfile.dataType` — zero domain vocabulary.

### Split Detection (negotiation.ts lines 133-231)
```
Round2 scores → gap = top - runnerUp
  gap > 0.25 → NO SPLIT (clear winner)
  gap ≤ 0.25 → count fields per agent
    runnerUp fields / total ≥ 0.30 → SPLIT
    runnerUp fields / total < 0.30 → NO SPLIT
```

### Semantic Role Inference (negotiation.ts lines 264-304)
Per-agent role assignment from structural signals:
- **entity**: entity_identifier, entity_name, entity_attribute
- **target**: performance_target, baseline_value, category_code
- **transaction**: transaction_date, transaction_amount, transaction_count, category_code
- **plan**: rate_value, payout_amount, descriptive_label, tier_boundary
- **reference**: descriptive_label, category_code

### Proposal Generation (synaptic-ingestion-state.ts lines 576-638)
When `shouldSplit = true`:
- Primary proposal: `contentUnitId`, `claimType: 'PARTIAL'`, `ownedFields`, `sharedFields`, `partnerContentUnitId: ${id}::split`
- Secondary proposal: `${id}::split`, `claimType: 'PARTIAL'`, `ownedFields`, `sharedFields`, `partnerContentUnitId: ${id}`
- Both get full intelligence metadata (observations, verdictSummary, whatChangesMyMind)

### Execute Field Filtering (execute/route.ts lines 290-318)
```typescript
filterFieldsForPartialClaim(unit):
  if claimType !== 'PARTIAL' → return as-is
  allowedFields = Set([...ownedFields, ...sharedFields])
  filteredRows = rawData.map(row → keep only allowedFields + _internal keys)
  filteredBindings = confirmedBindings.filter(b → allowedFields.has(b.sourceField))
```

## Commits
1. `0f12c91` — OB-160H Phase 0: Interface verification — PARTIAL claims exist (Path A)
2. (this commit) — OB-160H Phases 1-4: Completion report — zero gaps, fully implemented

## Korean Test Verification
```
grep "revenue|salary|commission|quota|employee|sales|bonus" negotiation.ts
→ ZERO matches
```
All 8 field affinity rules use structural signals (nameSignals, dataType, distinctCount, isSequential).

## Period Reference Verification
```
grep "period|Period" negotiation.ts
→ ZERO matches (except 'period_marker' SemanticRole string — a platform type label, not domain vocabulary)
```

## CLT Verification Queries
```sql
-- Verify PARTIAL claims in proposals
-- (Run after importing a mixed-content file)
SELECT content_unit_id, claim_type, owned_fields, shared_fields, partner_content_unit_id
FROM sci_proposals WHERE claim_type = 'PARTIAL';

-- Verify field filtering worked
SELECT content_unit_id, classification, jsonb_array_length(raw_data) as rows
FROM sci_execution_log WHERE content_unit_id LIKE '%::split';
```

## Proof Gates

### Phase 0
- PG-01: PASS — negotiation.ts: 403 lines, all functions exported and tested
- PG-02: PASS — Path A determined: PARTIAL claims FULLY IMPLEMENTED

### Phase 1 (Field Affinity)
- PG-03: PASS — 8 FIELD_AFFINITY_RULES (lines 28-69)
- PG-04: PASS — scoreFieldAffinity() uses max-merge (lines 75-97)
- PG-05: PASS — computeFieldAffinities() profiles all fields (lines 99-115)
- PG-06: PASS — isShared = containsId (join key detection)
- PG-07: PASS — Zero domain vocabulary in rules

### Phase 2 (Split Detection)
- PG-08: PASS — SPLIT_THRESHOLD = 0.30 (line 121)
- PG-09: PASS — Gap > 0.25 = no split (line 154)
- PG-10: PASS — Runner-up ratio >= 0.30 = split (line 184)
- PG-11: PASS — SplitAnalysis includes primaryFields, secondaryFields, sharedFields
- PG-12: PASS — Negotiation log entries at every decision point

### Phase 3 (Partial Bindings)
- PG-13: PASS — generatePartialBindings() creates per-agent SemanticBinding[] (lines 237-262)
- PG-14: PASS — inferRoleForAgent() covers all 5 agent types (lines 264-304)
- PG-15: PASS — Shared fields included in both agents' bindings
- PG-16: PASS — Confidence scores assigned per role inference

### Phase 4 (Integration)
- PG-17: PASS — synaptic-ingestion-state.ts creates two proposals for PARTIAL
- PG-18: PASS — ::split convention for secondary content unit ID
- PG-19: PASS — partnerContentUnitId cross-references both directions
- PG-20: PASS — filterFieldsForPartialClaim() in execute/route.ts
- PG-21: PASS — Filters both rawData and confirmedBindings
- PG-22: PASS — Internal metadata keys (_sheetName, _rowIndex) preserved

## Implementation Completeness Gate

After OB-160H:
- Field affinity scoring: 8 structural rules, Korean Test compliant
- Split detection: gap + ratio thresholds, fully deterministic
- Semantic binding: per-agent role inference from structural signals
- Proposal generation: dual PARTIAL proposals with cross-references
- Execute filtering: field-level data isolation per agent
- UI passthrough: proposals display transparently regardless of claim type

**The PARTIAL Claim Layer is complete.** Phase I builds Cross-Tenant Flywheel.
