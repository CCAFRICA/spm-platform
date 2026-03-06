# OB-160J Architecture Decision: Domain Flywheel

## Phase 0 Finding: PATH B — INFRASTRUCTURE EXISTS, WIRING NEEDED

### What exists
- `aggregateToDomain()` pre-wired in OB-160I in classification-signal-service.ts
- `domain_patterns` table exists (OB-80)
- `TenantConfig.industry: TenantIndustry` already on every tenant
- `loadColdStartPriors()` in flywheel-pipeline.ts reads domain_patterns by domain_id
- `loadPriorsForAgent()` in agent-memory.ts reads domain_patterns

### What's needed
1. Read tenant's industry in execute route → pass as domainId to `aggregateToDomain()`
2. Add domain prior lookup to `lookupPriorSignals()` fallback chain (between tenant and foundational)
3. Domain boost = +0.07 (already wired in synaptic-ingestion-state.ts boost hierarchy)

### Decision
Path B: Wire existing infrastructure. `aggregateToDomain()` already written. Need to call it and add domain fallback to prior lookup.
