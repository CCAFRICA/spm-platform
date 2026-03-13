# OB-167 Phase 1: Root Cause Determination

## RC-1: Import batch metadata missing AI context

**Hypothesis:** Metric resolver falls to sheet-matching fallback because import_batches lack AI context metadata.

**Evidence:**
- import_batches.metadata for both BCL batches: `{source:"sci", proposalId:..., contentUnitId:...}` — NO `ai_context` field
- Engine log confirms: "No AI context found in import_batches — using fallback name matching"
- The SCI execute pipeline (`api/import/sci/execute/route.ts`) creates batches but does NOT store AI context in batch metadata

**Impact:** Engine falls to sheet-matching path → OB-157 semantic fallback → metrics DO resolve via direct column name match. The data reaches the engine. This is a suboptimal path but NOT the cause of the calculation delta.

**Determination: CONFIRMED but NOT a delta root cause.** Data resolution works through the fallback. The normalization failure (RC-3) is the actual problem.

---

## RC-2: Variant discrimination failure

**Hypothesis:** All 85 entities route to variant_0 (Senior) when 58 should be variant_1 (Standard).

**Evidence:**
- Nivel_Cargo distribution: 13 "Ejecutivo Senior", 72 "Ejecutivo"
- Calculation results componentIds: 13 entities have "senior" IDs, 72 have "standard" IDs
- Discriminant tokens: V0=["senior","con","tasas","mejoradas"], V1=["estandar"]
- Entity with Nivel_Cargo="Ejecutivo Senior" has token "senior" → matches V0 discriminant → variant_0 ✓
- Entity with Nivel_Cargo="Ejecutivo" has no discriminant match → tie → defaults to last variant (variant_1) ✓
- Log showing "variant_0" was for first 3 entities only (happened to be Senior executives)

**Determination: REFUTED.** Variant routing is correct. 13 Senior → variant_0, 72 Standard → variant_1. The production log only showed the first 3 entities, creating a false impression that all entities went to variant_0.

---

## RC-3: Component binding / metric normalization failure

**Hypothesis:** Component bindings can't resolve data columns → 3 of 4 components get $0.

**Evidence — the ACTUAL root cause is normalization, not binding resolution:**

### The convergence binding path fails silently
Convergence bindings exist but have `source: "committed_data"` WITHOUT `source_batch_id`. The engine's `resolveMetricsFromConvergenceBindings()` checks:
```typescript
if (!actualBinding?.source_batch_id && !numBinding?.source_batch_id) return null;
```
Returns null → falls to sheet-matching. But sheet-matching WORKS — metrics resolve via direct column name match.

### The normalization failure is the delta root cause
After metrics resolve, the engine normalizes decimal→percentage for attainment metrics:
```typescript
if (inferSemanticType(key) === 'attainment' && value > 0 && value < 10) {
    metrics[key] = value * 100;
}
```

Two metrics are MISCLASSIFIED by `inferSemanticType`:

| Metric | Value | inferSemanticType | Expected | Why wrong |
|--------|-------|------------------|----------|-----------|
| Cumplimiento_Colocacion | 0.65 | 'attainment' ✓ | attainment | /cumplimiento/ matches |
| **Indice_Calidad_Cartera** | **0.8109** | **'unknown' ✗** | **attainment** | **No pattern matches "indice" or "calidad" or "cartera"** |
| **Pct_Meta_Depositos** | **0.55** | **'goal' ✗** | **attainment** | **/meta/ in GOAL_PATTERNS matches before attainment** |
| Cantidad_Productos_Cruzados | 1 | 'quantity' ✓ | quantity | /cantidad/ matches |
| Infracciones_Regulatorias | 0 | 'quantity' ✓ | quantity | /infracci/ matches |

### Impact quantified
**C2 (Captacion de Depositos):** Pct_Meta_Depositos stays as 0.xx → ALL 85 entities in tier "Sin comision" (0-60) → **$0 total** → should be **$10,625**

**C1 (Colocacion de Credito):** Indice_Calidad_Cartera stays as 0.xx → ALL 85 entities in column "Riesgo" (0-90) → entities with calidad 90-98% get wrong column → **$2,625 underpayment**

**Determination: CONFIRMED.** Two metrics misclassified by `inferSemanticType` → decimal values compared against percentage-scale bands → $13,250 total underpayment.

---

## Root cause summary

| RC | Status | Impact | Fix needed |
|----|--------|--------|-----------|
| RC-1 (Missing AI context) | CONFIRMED (not causal) | Suboptimal path, data still resolves | None for delta |
| RC-2 (Variant routing) | REFUTED | Zero impact | None |
| RC-3 (Normalization failure) | **CONFIRMED** | **$13,250 underpayment** | **Band-aware normalization** |

### The structural fix
The current normalization uses `inferSemanticType` (name-pattern matching) to decide which metrics to scale. This fails for metrics whose names don't match any pattern (Indice_Calidad_Cartera) or match the WRONG pattern (Pct_Meta_Depositos matches /meta/ → 'goal' instead of 'attainment').

**Fix: Band-aware normalization.** Compare metric values against the component's band ranges. If the value is in decimal range (0-2) but the band expects percentage range (max > 10), normalize ×100. This is structural (uses the plan's own specification), not name-dependent (Korean Test compliant).

### Remaining gap: $14,230
After normalization fix, projected total = $34,084 vs GT $48,314. The remaining gap is traced to GT anchor values that don't match the plan rates in the database:
- C3: GT rates (120/product, 24/product, 27/product) ≠ plan rates (12, 18)
- This suggests the GT was computed from a different plan specification than what AI interpretation produced

This is NOT an engine bug — it's a plan interpretation accuracy question. The engine correctly applies rate × base as specified in the plan. If the plan rates are wrong, that's an AI interpretation issue for a separate OB.
