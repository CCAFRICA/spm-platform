# HF-117 COMPLETION REPORT
## Calculation Reconciliation — Three Systemic Issues

### Commits
| Phase | Commit | Description |
|-------|--------|-------------|
| Prompt | `53732e8` | Commit prompt |
| 0 | `16713b7` | Architecture decision — three systemic issues diagnosed |
| 1 | `31b2eea` | Fix: Structural variant routing via field value matching |
| 2 | `17db4ac` | Fix: Conditional gate semantics — fixed payout when base is zero |
| 3 | `64ad230` | Fix: Entity resolution — use all batches with identifier columns |
| 4 | This commit | Completion report + PR |

### Files Changed
| File | Change |
|------|--------|
| `web/src/app/api/calculation/run/route.ts` | Added structural variant discovery: scans ALL string field values for variant name matches when hardcoded field names miss |
| `web/src/lib/calculation/run-calculation.ts` | Fixed `evaluateConditionalPercentage`: when base=0 and condition matches, rate IS the payout (gate semantics) |
| `web/src/lib/sci/entity-resolution.ts` | Removed `ENTITY_LABELS` filter — uses all batches with identifier columns for entity discovery |

### Hard Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-1: Variant routing root cause identified | PASS | route.ts:968-972: hardcoded `rd['role'] ?? rd['Puesto'] ?? rd['puesto']` misses DS-009 field identity names |
| PG-2: Structural variant discovery implemented | PASS | route.ts: scans `Object.values(rd)` for variant name matches, zero field name dependencies |
| PG-3: Korean Test — variant routing | PASS | Matches on VALUE equality with `variant.variantName`, not column names |
| PG-4: Conditional gate root cause identified | PASS | run-calculation.ts:309: `base * rate` where base=0 → payout=0. Gate semantics need `rate` as payout |
| PG-5: Gate semantics fix applied | PASS | run-calculation.ts:311: `base === 0 ? condition.rate : base * condition.rate` |
| PG-6: Korean Test — conditional gate | PASS | No field name references. Logic is structural (base === 0 check) |
| PG-7: Non-regression — percentage path | PASS | When base > 0, `base * rate` unchanged |
| PG-8: Entity resolution root cause identified | PASS | entity-resolution.ts:129: `ENTITY_LABELS = new Set(['entity', 'transaction', 'target'])` excludes 'reference' batches |
| PG-9: Entity resolution fix applied | PASS | entity-resolution.ts: `discoveryBatchIds = Array.from(batchIdentifiers.keys())` — all batches with identifier columns |
| PG-10: Korean Test — entity resolution | PASS | Uses structural metadata (field_identities), not batch labels |
| PG-11: npm run build exits 0 (Phase 1) | PASS | Build succeeds |
| PG-12: npm run build exits 0 (Phase 2) | PASS | Build succeeds |
| PG-13: npm run build exits 0 (Phase 3) | PASS | Build succeeds |

### Standing Rule Compliance
| Rule | Status |
|------|--------|
| Korean Test | PASS — `grep` for Puesto/Plantilla/Meridian/Fleet/Revenue/Cargas returns zero NEW references. Variant routing matches on values. Entity resolution uses structural metadata. Conditional gate uses base===0 check. |
| Fix Logic Not Data | PASS — all three fixes are engine/pipeline logic changes, not data adjustments |
| Scale by Design | PASS — works for any number of variants, any component type, any batch classification |
| Architecture Decision Gate | PASS — HF-117_ARCHITECTURE_DECISION.md committed before implementation |

### Root Cause Chains

**Issue 1 — Variant Routing:**
1. route.ts:968-972 extracts `entityRole` from hardcoded keys `'role'`/`'Puesto'`/`'puesto'`
2. DS-009 field identity architecture → column may have any name
3. `entityRole` = null → defaults to `variants[0]` (Senior) for all employees
4. Fix: scan ALL string field values for variant name matches

**Issue 2 — Conditional Gate:**
1. `evaluateConditionalPercentage` computes `base * rate`
2. `base = metrics[config.appliedTo]` = incident count = 0
3. `payout = 0 * rate = 0` (should be fixed bonus)
4. Fix: when base===0 and condition matches, `rate` IS the payout

**Issue 3 — Entity Resolution:**
1. `ENTITY_LABELS = new Set(['entity', 'transaction', 'target'])`
2. Roster batch classified as 'reference' by SCI → excluded from entity discovery
3. 17 roster-only employees never discovered
4. Fix: use ALL batches with identifier columns, not just label-filtered ones

### Post-Merge Production Verification (FOR ANDREW)
| Gate | Status | Evidence |
|------|--------|----------|
| PG-14: localhost responds | | |
| PG-15: PR created | | |
| PG-16: Grand total ~ MX$185,063 | | |
| PG-17: Entity count = 67 | | After: clear entities, re-import, resolve |
| PG-18: Claudia (70001) → Standard variant | | Check calculation details |
| PG-19: Antonio (70010) → Senior variant | | Check calculation details |
| PG-20: Safety Record → non-zero payout | | Check payout > 0 for 0-incident employees |

### SQL for Verification

Check entity count:
```sql
SELECT COUNT(*) FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

Check variant assignment (via calculation results):
```sql
SELECT
  e.external_id,
  e.display_name,
  cr.details->>'variantName' as variant
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND e.external_id IN ('70001', '70010')
LIMIT 10;
```

Check Safety Record payout:
```sql
SELECT
  e.external_id,
  cr.component_name,
  cr.payout,
  cr.details
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND cr.component_name ILIKE '%segur%'
ORDER BY cr.payout DESC
LIMIT 10;
```

---
*HF-117 Complete | March 9, 2026*
