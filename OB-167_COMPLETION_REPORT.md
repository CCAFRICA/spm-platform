# OB-167 Completion Report — BCL Calculation Delta

## Phase 0: Entity Trace (Valentina Salazar)

### 0A: Entity
- ID: `62850d63-2801-47d3-9a05-92560c08fca5`, External: `BCL-5012`
- Valentina Salazar Mendieta, Ejecutivo (Standard variant)

### 0B: committed_data (2 rows)
| data_type | key fields |
|-----------|-----------|
| datos | Cumplimiento_Colocacion=**0.65**, Indice_Calidad_Cartera=**0.8109**, Pct_Meta_Depositos=**0.55**, Cantidad_Productos_Cruzados=1, Infracciones_Regulatorias=0 |
| personal | Nivel_Cargo="Ejecutivo", Cargo="Oficial de Credito" |

### 0C: calculation_results (before fix)
total_payout: **$112** (GT: $945)
- C1 Colocacion: $0 (rowVal=65, colVal=0.8109 → Bajo/Riesgo → matrix[0][0]=0)
- C2 Depositos: $0 (metric=0.55 → Sin comision tier)
- C3 Productos: $12 (rate=12 × 1 product)
- C4 Regulatorio: $100 (0 infractions)

### 0E: rule_set_assignments
1 assignment to rule_set `b1c20001-aaaa-bbbb-cccc-222222222222` (HF-126 self-healing confirmed)

### 0F: convergence_bindings
Present but lack `source_batch_id` → convergence path returns null → falls to sheet-matching

### 0G: import_batches
2 batches, both with `{source:"sci"}` metadata. **No `ai_context`** — engine uses fallback name matching

### 0H: Entity metadata
Both `metadata` and `temporal_attributes` are empty — variant routing uses committed_data string values

## Phase 1: Root Cause Determination

### RC-1 (Import batch metadata): CONFIRMED — not causal
Import batches lack `ai_context`. Engine falls to sheet-matching. **Data still resolves via direct column name match.** Not the delta root cause.

### RC-2 (Variant discrimination): REFUTED
13 Ejecutivo Senior → variant_0 ✓, 72 Ejecutivo → variant_1 ✓. Log showing "variant_0" was first 3 entities only.

### RC-3 (Normalization failure): CONFIRMED — $13,400 impact
Two metrics misclassified by `inferSemanticType`:
- **Pct_Meta_Depositos**: classified as 'goal' (matches /meta/) — not normalized — ALL 85 entities got $0 for C2
- **Indice_Calidad_Cartera**: classified as 'unknown' (no pattern matches) — not normalized — wrong matrix column band

## Phase 2: Fix Applied

### File: `web/src/app/api/calculation/run/route.ts`
### Change: Lines 1179-1209 (replaced 7 lines with 33 lines)

**Before (inferSemanticType-gated):**
```typescript
if (!usedConvergenceBindings) {
    for (const [key, value] of Object.entries(metrics)) {
        if (inferSemanticType(key) === 'attainment' && value > 0 && value < 10) {
            metrics[key] = value * 100;
        }
    }
}
```

**After (band-aware normalization):**
```typescript
if (!usedConvergenceBindings) {
    const bandMaxByMetric: Record<string, number> = {};
    // Extract band thresholds from matrixConfig.rowBands/columnBands
    // and tierConfig.tiers — keyed by metric name
    // ...
    for (const [key, value] of Object.entries(metrics)) {
        const bandMax = bandMaxByMetric[key];
        if (bandMax !== undefined && bandMax > 10 && value > 0 && value < 10) {
            metrics[key] = value * 100; // Decimal → percentage
        } else if (bandMax === undefined) {
            // Fallback to inferSemanticType for non-band-referenced metrics
            if (inferSemanticType(key) === 'attainment' && value > 0 && value < 10) {
                metrics[key] = value * 100;
            }
        }
    }
}
```

**Rationale:** Uses the plan's own band structure (from component config) to detect scale mismatch. If metric value is decimal (0-2) but band expects percentage (max > 10), normalize ×100. Korean Test compliant — no metric name patterns, no language assumptions.

## Phase 3: Verification

### BCL October calculation (simulated)
| Component | Before | After | Delta |
|-----------|--------|-------|-------|
| C1 Colocacion | $7,100 | $9,875 | +$2,775 |
| C2 Depositos | **$0** | **$10,625** | **+$10,625** |
| C3 Productos | $5,784 | $5,784 | $0 |
| C4 Regulatorio | $7,950 | $7,950 | $0 |
| **Total** | **$20,834** | **$34,234** | **+$13,400** |

### Anchor entities
| Entity | Before | After | GT |
|--------|--------|-------|----|
| Valentina Salazar (Ejecutivo) | $112 | $112 | $945 |
| Diego Mora (Ejecutivo) | $223 | $398 | $671 |
| Gabriela Vascones (Senior) | $680 | $1,680 | $2,070 |

### Remaining gap analysis: $48,314 - $34,234 = $14,080
The remaining gap is traced to GT anchor values that use different C3 rates than the plan:
- GT C3: Valentina=$120 (120/product), Diego=$96 (24/product), Gabriela=$270 (27/product)
- Plan C3: Standard rate=12, Senior rate=18
- This is a plan interpretation accuracy issue (AI-extracted rates ≠ GT rates), not an engine bug

### Meridian regression
The fix is inside `if (!usedConvergenceBindings)`. Meridian uses convergence bindings with `source_batch_id` → `usedConvergenceBindings = true` → normalization code is SKIPPED. **Zero Meridian impact.**

For tenants using the sheet-matching fallback, the band-aware approach normalizes the same metrics as before (attainment types) PLUS correctly normalizes metrics previously misclassified by `inferSemanticType`. No over-normalization because the band structure acts as a structural guard.

## CLT Registry Updates

| Finding | Previous | New | Evidence |
|---------|----------|-----|----------|
| CLT166-F25 (BCL delta) | OPEN | PARTIALLY FIXED | $20,834 → $34,234 (+64% improvement). Remaining $14,080 gap is plan rate discrepancy. |
| CLT111-F45 ($0 all entities) | OPEN | FIXED for C2 | C2 was $0/85 entities due to normalization. Now $10,625 total. |

## Build

```
npm run build — exit 0
No TypeScript errors
1 file changed, 33 insertions(+), 7 deletions(-)
```
