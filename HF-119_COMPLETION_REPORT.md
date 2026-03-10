# HF-119 COMPLETION REPORT
## Variant Routing via Token Overlap Matching

### Commits
| Phase | Commit | Description |
|-------|--------|-------------|
| Prompt | `023aa75` | Commit prompt |
| 0 | `fa27672` | Architecture decision — token overlap with discriminant resolution |
| 1 | `b26714e` | Token overlap variant matching + intent path concordance fix |
| 2 | This commit | Completion report + PR |

### Files Changed
| File | Change |
|------|--------|
| `web/src/app/api/calculation/run/route.ts` | Replaced exact-match variant routing (HF-117 + OB-85) with token overlap scoring using discriminant tokens. Fixed intent path to use selected variant's components. |

### Hard Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-1: matchEntityToVariant implemented | PASS | Token overlap scoring with discriminant resolution in route.ts entity loop. `variantTokenize`, `variantTokenSets`, `variantDiscriminants` built once before entity loop. Per-entity: build entity tokens, score discriminant matches, resolve ties with total overlap, default to last variant. |
| PG-2: Discriminant tokens structural | PASS | `variantDiscriminants = variantTokenSets.map((tokens, i) => { otherTokens = ...; return tokens.filter(t => !otherTokens.has(t)); })` — zero hardcoded tokens |
| PG-3: Tokenize removes accents | PASS | `text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')` — NFD normalization strips combining marks |
| PG-4: Logging shows variant selection | PASS | `console.log('[VARIANT] ${entityName}: disc=[V0:${matches},...] → variant_${idx} (${method})')` |
| PG-5: Intent path uses selected variant | PASS | `const entityIntents = selectedVariantIndex === 0 ? componentIntents : transformVariant(selectedComponents);` |
| PG-6: Build exits 0 (Phase 1) | PASS | `npm run build` succeeds |
| PG-7: Final build exits 0 | PASS | Clean build (`rm -rf .next && npm run build`) succeeds |

### Standing Rule Compliance
| Rule | Status |
|------|--------|
| Korean Test | PASS — zero hardcoded tokens, field names, or language-specific strings. Discriminants discovered structurally from variant metadata. |
| Fix Logic Not Data | PASS — engine routing logic change, not data/binding adjustment |
| Scale by Design | PASS — token sets built once per variant (O(variants)). Per-entity scoring is O(fields × tokens). Works for any number of variants, any language. |
| Architecture Decision Gate | PASS — HF-119_ARCHITECTURE_DECISION.md committed before implementation |

### Algorithm
```
1. Tokenize each variant: name + description + id → token set
2. Discriminant tokens: tokens in variant_i but NOT in any other variant
3. Per entity: tokenize ALL string field values
4. Score: count discriminant matches per variant
5. Highest discriminant score wins (confidence=0.9)
6. Tie → total overlap score (confidence=0.7)
7. Still tied → default to last variant (confidence=0.5)
```

**Example:**
```
V0 discriminants: {senior}    V1 discriminants: {standard}

"Coordinador Senior" tokens: {coordinador, senior}
  → V0 disc matches: 1, V1 disc matches: 0 → V0 (Senior) ✓

"Coordinador" tokens: {coordinador}
  → V0 disc matches: 0, V1 disc matches: 0 → tied → last variant → V1 (Standard) ✓
```

### Post-Merge Production Verification (FOR ANDREW)
| Gate | Status | Evidence |
|------|--------|----------|
| PG-8: PR created | | |
| PG-9: Grand total = MX$185,063 | | |
| PG-10: Claudia (70001) = MX$1,573 (Standard) | | |
| PG-11: Antonio (70010) = MX$6,263 (Senior) | | |
| PG-12: 67 calculation_results | | |
| PG-13: Vercel logs show [VARIANT] entries | | |

---
*HF-119 Complete | March 9, 2026*
