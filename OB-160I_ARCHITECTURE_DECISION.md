# OB-160I Architecture Decision: Cross-Tenant Flywheel

## Phase 0 Finding: PATH B — EXISTS BUT INCOMPLETE

### What exists (OB-80 built for CALCULATION pipeline)
- `flywheel-pipeline.ts`: `aggregateFoundational()`, `aggregateDomain()`, `loadColdStartPriors()`, `postConsolidationFlywheel()`
- `agent-memory.ts`: `loadPriorsForAgent()` reads foundational_patterns + domain_patterns + synaptic_density
- Tables: `foundational_patterns`, `domain_patterns` — exist with correct schema
- Trigger: `postConsolidationFlywheel()` called from calculation run route after density consolidation

### What's missing (SCI CLASSIFICATION pipeline not wired)
1. `writeClassificationSignal()` writes `scope: 'tenant'` only — no foundational aggregation
2. `lookupPriorSignals()` queries only `scope: 'tenant'` — no fallback to foundational/domain
3. Zero connection between classification_signals and foundational_patterns/domain_patterns
4. No anonymization of classification signals for cross-tenant aggregation

### Decision
**Path B: Wire existing infrastructure.** The flywheel tables and aggregation functions exist. Need to:
1. Add post-signal aggregation: after writing tenant-scoped classification signal, aggregate anonymized structural pattern into foundational_patterns
2. Extend `lookupPriorSignals()` with foundational fallback (+0.05 boost vs tenant's +0.10)
3. Privacy: strip tenant_id, file names, sheet names — retain only structural fingerprint + classification outcome
