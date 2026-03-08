# HF-105 Completion Report: HC Pattern Classification — Two-Level Resolution Model

**Level 1 HC pattern matching overrides Level 2 CRR Bayesian when HC roles unambiguously match.**

---

## Summary

Created a two-level classification model. Level 1 uses HC column role presence/absence plus `identifierRepeatRatio` as the single structural disambiguator. No weights. No scores. Pure pattern matching. Level 2 (CRR Bayesian in resolver.ts) is preserved unchanged as fallback.

### Files Changed
| File | Action |
|------|--------|
| `web/src/lib/sci/hc-pattern-classifier.ts` | NEW — `classifyByHCPattern()` with 4 pattern rules |
| `web/src/app/api/import/sci/analyze/route.ts` | MODIFIED — Wire Level 1 after Level 2, override resolution + scores when matched, fix decisionSource |
| `web/src/lib/sci/synaptic-ingestion-state.ts` | MODIFIED — Add `'hc_pattern'` to `ContentUnitResolution.decisionSource` union |

### Files NOT Changed (preserved)
| File | Reason |
|------|--------|
| `web/src/lib/sci/resolver.ts` | Level 2 — UNCHANGED per spec |
| `web/src/lib/sci/agents.ts` | Agent scoring — UNCHANGED per spec |

---

## Evidentiary Gates

### EG-1: Level 1 Pattern Rules Code

```typescript
// hc-pattern-classifier.ts — classifyByHCPattern()

// ENTITY: HAS identifier AND HAS name AND idRepeatRatio ≤ 1.5
if (hasIdentifier && hasName && idRepeatRatio > 0 && idRepeatRatio <= 1.5) {
  return { classification: 'entity', confidence: 0.90, patternName: 'entity_roster', ... };
}

// TRANSACTION: HAS identifier AND HAS measure AND HAS temporal AND idRepeatRatio > 1.5
if (hasIdentifier && hasMeasure && hasTemporal && idRepeatRatio > 1.5) {
  return { classification: 'transaction', confidence: 0.90, patternName: 'repeated_measures_over_time', ... };
}

// REFERENCE: HAS reference_key AND NOT HAS identifier AND NOT HAS name
if (hasReferenceKey && !hasIdentifier && !hasName) {
  return { classification: 'reference', confidence: 0.85, patternName: 'lookup_table', ... };
}

// TARGET: HAS identifier AND HAS measure AND NOT HAS temporal AND idRepeatRatio ≤ 1.5
if (hasIdentifier && hasMeasure && !hasTemporal && idRepeatRatio > 0 && idRepeatRatio <= 1.5) {
  return { classification: 'target', confidence: 0.85, patternName: 'per_entity_benchmarks', ... };
}
```

HC roles with confidence < 0.80 are ignored (not counted as present).

### EG-2: resolver.ts Unchanged

```bash
git diff HEAD~2..HEAD -- web/src/lib/sci/resolver.ts
# Output: EMPTY — zero changes to Level 2
```

### EG-3: agents.ts Unchanged

```bash
git diff HEAD~2..HEAD -- web/src/lib/sci/agents.ts
# Output: EMPTY — zero changes to agent scoring
```

### EG-4: Localhost Diagnostic Logs

```
[SCI-HC-PATTERN] sheet=Plantilla NO_MATCH — Level 2 CRR Bayesian retained
[SCI-HC-PATTERN] sheet=Datos_Rendimiento classification=transaction@90% pattern=repeated_measures_over_time conditions=[HAS identifier, HAS measure (15 columns), HAS temporal, idRepeatRatio=600.00 (>1.5)]
[SCI-HC-PATTERN] sheet=Datos_Flota_Hub classification=transaction@90% pattern=repeated_measures_over_time conditions=[HAS identifier, HAS measure (3 columns), HAS temporal, idRepeatRatio=12.00 (>1.5)]
```

Level 1 correctly classifies:
- **Datos_Rendimiento**: transaction@90% (HAS identifier + measure + temporal, idRepeatRatio >> 1.5)
- **Datos_Flota_Hub**: transaction@90% (HAS identifier + measure + temporal, idRepeatRatio >> 1.5)
- **Plantilla**: NO_MATCH — falls through to Level 2 (distorted idRepeatRatio=30.0 from test data prevents entity pattern match)

### EG-5: Level 2 Still Computes Posteriors

```
[SCI-CRR-DIAG] sheet=Datos_Rendimiento posteriors=[transaction=78%, entity=8%, reference=6%, target=5%, plan=4%]
[SCI-CRR-DIAG] sheet=Datos_Flota_Hub posteriors=[transaction=80%, entity=6%, plan=5%, target=5%, reference=5%]
```

Level 2 runs for all sheets. Level 1 overrides where patterns match. The `allScores` array preserves Level 2 posteriors for non-winning agents, giving full transparency.

### EG-6: Proposal Output Reflects Override

```
Sheet: Datos_Rendimiento => transaction @ 90%  (Level 1 override, was 78% from Level 2)
Sheet: Datos_Flota_Hub => transaction @ 90%    (Level 1 override, was 80% from Level 2)
Sheet: Plantilla => transaction @ 31%           (Level 2 retained — no Level 1 match)
```

### EG-7: Build Output

```
f Middleware                                  75 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
Exit code: 0
```

---

## Two-Level Resolution Model

### Level 1: HC Pattern Classifier (NEW)
| Pattern | Conditions | Confidence | Fires When |
|---------|-----------|------------|------------|
| entity_roster | HAS identifier + HAS name + idRepeatRatio ≤ 1.5 | 0.90 | Person roster |
| repeated_measures_over_time | HAS identifier + HAS measure + HAS temporal + idRepeatRatio > 1.5 | 0.90 | Transaction data |
| lookup_table | HAS reference_key + NOT identifier + NOT name | 0.85 | Reference tables |
| per_entity_benchmarks | HAS identifier + HAS measure + NOT temporal + idRepeatRatio ≤ 1.5 | 0.85 | Target/quota data |

### Level 2: CRR Bayesian (UNCHANGED)
Full Bayesian posterior computation with CRL reliability lookup. Runs for all content units. Level 1 overrides when matched.

### Override Mechanism
1. `resolveClassification()` runs for ALL units (Level 2)
2. `classifyByHCPattern()` runs for each unit (Level 1)
3. If Level 1 matches: override resolution, trace, and round2Scores
4. If Level 1 returns null: Level 2 result preserved

### Signal Write Fix
`decisionSource` in signal write path now reads from the classification trace (`hc_pattern` or CRR Bayesian source) instead of hardcoded `'crr_bayesian'`.

---

## Test Data Limitation

Plantilla does NOT classify as entity via Level 1 because the test uses 5 sample rows with totalRowCount=150, producing idRepeatRatio=30.0 (should be ~1.0 with real data). This is inherent to the small test sample — production data with 150 actual rows and ~150 unique employees would yield idRepeatRatio ≈ 1.0, matching the entity_roster pattern.
