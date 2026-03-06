# OB-160K Architecture Decision: Synaptic Density for SCI

## Phase 0 Finding: PATH B — PARTIAL INFRASTRUCTURE EXISTS

### What exists
- Calculation density: `synaptic-types.ts` has `PatternDensity`, `ExecutionMode`, `DENSITY_THRESHOLDS`
- Calculation density: `synaptic-surface.ts` determines execution mode from density
- LLM-skip: `header-comprehension.ts` lines 329-349 already skip LLM when all columns have bindings with confirmationCount >= 2 and confidence >= 0.85
- Signal history: `classification_signals` table with structural fingerprints + outcomes
- Foundational/domain aggregation: OB-160I/J just wired

### What's needed
1. `ClassificationDensity` type for SCI (analogous to `PatternDensity` for calculation)
2. `computeClassificationDensity()`: query signal history per fingerprint per tenant
3. `determineExecutionMode()`: full_analysis / light_analysis / confident
4. Wire into analyze route: consult density before scoring
5. Update density after each import's signal write

### Decision
Path B: Create SCI-specific density computation using existing classification_signals data. No new tables needed — density is computed on-the-fly from signal history (lightweight query).
