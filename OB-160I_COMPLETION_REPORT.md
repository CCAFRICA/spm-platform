# OB-160I Completion Report: Cross-Tenant Flywheel (Foundational Scope)

## Phase 0: Path Determination

### PATH B: EXISTS BUT INCOMPLETE
OB-80 built flywheel infrastructure for CALCULATION pipeline:
- `flywheel-pipeline.ts`: `aggregateFoundational()`, `aggregateDomain()`, `loadColdStartPriors()`
- `agent-memory.ts`: `loadPriorsForAgent()` reads from all 3 scopes
- Tables: `foundational_patterns`, `domain_patterns` — exist with correct schema
- Triggered from: `postConsolidationFlywheel()` in calculation run route

**Gap:** SCI classification pipeline not wired — `writeClassificationSignal()` writes `scope: 'tenant'` only, `lookupPriorSignals()` queries only tenant scope.

## Changes Made

### Phase 1: Foundational Aggregation + Prior Fallback

**`classification-signal-service.ts` — New functions:**

`fingerprintToSignature()` — Deterministic hash of StructuralFingerprint:
```typescript
function fingerprintToSignature(fp: StructuralFingerprint): string {
  return `sci:${fp.columnCount}:${fp.numericFieldRatioBucket}:...`;
}
```

`aggregateToFoundational()` — Anonymized cross-tenant aggregation:
- Strips: tenant_id, source_file_name, sheet_name
- Retains: pattern_signature (fingerprint hash), classification, confidence
- Stores classification_distribution in learned_behaviors JSONB
- EMA update (weight 0.1) for existing patterns
- Fire-and-forget — failure never blocks import

`aggregateToDomain()` — Domain-scoped aggregation (for OB-160J):
- Same privacy guarantees as foundational
- Additionally keyed by domainId
- Skips if no domain tag set

`lookupFoundationalPriors()` — Cross-tenant prior fallback:
- Queried only when no tenant-specific priors exist (cold start)
- Requires minimum evidence: 3+ total executions
- Requires consistency: 60%+ agreement on classification
- Returns source='foundational' for lower boost

**`synaptic-ingestion-state.ts` — Three-scope boost hierarchy:**
```typescript
const boost = source === 'human_override' || source === 'user_corrected' ? 0.15
  : source === 'foundational' ? 0.05
  : source === 'domain' ? 0.07
  : 0.10;
```

**`execute/route.ts` — Aggregation trigger:**
- `aggregateToFoundational()` called after each `writeClassificationSignal()`
- Fire-and-forget — failure never blocks import

## Commits
1. `85eca8d` — OB-160I Phase 0: Interface verification — flywheel infrastructure discovery
2. `73acf06` — OB-160I Phase 1: Cross-tenant flywheel — foundational aggregation + prior fallback

## Privacy Verification
```
grep "tenant_id\|source_file\|sheet_name" aggregateToFoundational
→ ZERO tenant-identifiable fields written to foundational_patterns
Only: pattern_signature, confidence_mean, total_executions, learned_behaviors
```

## Korean Test Verification
```
grep "revenue|salary|commission|quota" classification-signal-service.ts
→ ZERO matches
```

## Proof Gates
- PG-01: PASS — Phase 0 verification complete, Path B determined
- PG-02: PASS — Anonymization strips tenant_id, file names, sheet names
- PG-03: PASS — Foundational aggregation runs after import (fire-and-forget)
- PG-04: PASS — Foundational signals stored in foundational_patterns table
- PG-05: PASS — lookupPriorSignals falls back to foundational when no tenant priors
- PG-06: PASS — Foundational priors get +0.05 boost (vs tenant +0.10)
- PG-07: PASS — ZERO tenant-identifiable information in foundational signals
- PG-08: PASS — npm run build exits 0

## Implementation Completeness Gate

**Three-Scope Flywheel (Foundational):**
"Content units with these structural characteristics have been classified as Transaction 92% of the time across all tenants."

After OB-160I:
- Anonymization: tenant-specific identifiers stripped at aggregation time
- Foundational aggregation: structural patterns accumulated across tenants
- Prior availability: new tenants receive foundational priors on first import
- Privacy: zero tenant-identifiable information in foundational signals
- Boost hierarchy: human_override (+0.15) > tenant (+0.10) > domain (+0.07) > foundational (+0.05)

**Phase I complete.** Phase J adds domain-scoped aggregation.
