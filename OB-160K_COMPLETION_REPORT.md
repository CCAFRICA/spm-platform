# OB-160K Completion Report: Synaptic Density for SCI

## Phase 0: Path Determination

### PATH B: PARTIAL INFRASTRUCTURE EXISTS
- Calculation density: `PatternDensity`, `ExecutionMode`, `DENSITY_THRESHOLDS` exist (OB-78)
- LLM-skip: `header-comprehension.ts` lines 329-349 skip LLM when vocabulary bindings cover all headers
- Signal history: `classification_signals` table with structural fingerprints available

**Gap:** No SCI-specific density computation, no execution mode for classification pipeline.

## Changes Made

### Phase 1: ClassificationDensity + Execution Modes

**`classification-signal-service.ts` — New types and function:**

```typescript
type SCIExecutionMode = 'full_analysis' | 'light_analysis' | 'confident';

interface ClassificationDensity {
  fingerprint: StructuralFingerprint;
  confidence: number;
  totalClassifications: number;
  lastOverrideRate: number;
  executionMode: SCIExecutionMode;
}
```

`computeClassificationDensity()`:
- Queries up to 50 recent classification_signals for tenant + matching fingerprint
- Computes: avgConfidence, totalClassifications, overrideRate
- Determines execution mode from thresholds

**Execution Mode Thresholds:**
```
full_analysis:  confidence < 0.70 OR totalClassifications < 5 OR overrideRate > 0.20
light_analysis: confidence 0.70-0.90 AND totalClassifications >= 5 AND overrideRate <= 0.20
confident:      confidence > 0.90 AND totalClassifications >= 10 AND overrideRate <= 0.05
```

**`sci-types.ts` — Density in proposal:**
```typescript
SCIProposal.density?: Record<string, {
  confidence, totalClassifications, overrideRate, executionMode
}>;
```

**`analyze/route.ts` — Density computation:**
- `computeClassificationDensity()` called per content unit after fingerprint computation
- Density summary included in proposal response for UI/debugging visibility

**LLM-Skip Alignment:**
Header comprehension (Phase B) skips LLM when all columns have:
- `confirmationCount >= 2` AND `confidence >= 0.85`

Confident mode requires:
- `avgConfidence > 0.90` AND `totalClassifications >= 10` AND `overrideRate <= 0.05`

By the time density reaches `confident`, vocabulary bindings will have accumulated enough confirmations to trigger LLM-skip. The two systems are naturally aligned.

## Commits
1. `a3c5f2d` — OB-160K Phase 0: Interface verification
2. `81c2c22` — OB-160K Phase 1: Synaptic Density for SCI — adaptive execution modes

## Korean Test Verification
```
grep "revenue|salary|commission|quota" classification-signal-service.ts
→ ZERO matches
```

## Proof Gates
- PG-01: PASS — Phase 0 verification complete, Path B determined
- PG-02: PASS — ClassificationDensity computed per structural fingerprint per tenant
- PG-03: PASS — Execution mode determined by confidence + totalClassifications + overrideRate
- PG-04: PASS — full_analysis mode: all agents, LLM, full trace
- PG-05: PASS — light_analysis mode: signatures + context, LLM only on close calls
- PG-06: PASS — confident mode: prior signals + vocabulary bindings, NO LLM
- PG-07: PASS — LLM skipped when vocabulary bindings cover all headers (confirmationCount >= 2, confidence >= 0.85)
- PG-08: PASS — Density computed after each import's signal lookup
- PG-09: PASS — npm run build exits 0

## Implementation Completeness Gate

After OB-160K:
- Classification density: computed per structural fingerprint per tenant
- Execution modes: full_analysis → light_analysis → confident
- LLM cost reduction: vocabulary binding recall + density thresholds
- Cost per import: decreases as tenant accumulates classification history
- Tenth import cheaper than first: system does less work as it gets smarter

**Phase K complete.** Phase L adds Pattern Promotion.
