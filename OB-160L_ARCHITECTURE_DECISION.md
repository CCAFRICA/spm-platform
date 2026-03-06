# OB-160L Architecture Decision: Pattern Promotion

## Phase 0 Finding: PATH B — PARTIAL INFRASTRUCTURE EXISTS

### What exists
- `weight-evolution.ts` (307 lines): Full weight evolution analysis service
  - Reads classification_signals outcomes
  - Computes signal-level correctness rates
  - Proposes weight adjustments (read-only — never auto-applies)
  - LEARNING_RATE = 0.3, MAX_ADJUSTMENT = 0.05, MIN_SAMPLE_SIZE = 5
- `signatures.ts` (186 lines): Composite structural signatures
  - 5 signatures: transaction, entity, target, plan, reference
  - Each sets a confidence floor (0.75-0.85) when structural signals align
  - These are the Tier 1 heuristic rules
- `foundational_patterns` table: Cross-tenant patterns with classification_distribution (OB-160I)

### What's needed
1. Pattern identification: query foundational_patterns for statistically significant patterns
2. Promoted pattern storage: configurable confidence floors (not hardcoded)
3. Promoted pattern application: check during scoring alongside composite signatures
4. Auditability: evidence stored with each promotion

### Decision
Path B: Add promoted pattern service that queries foundational_patterns for promotion candidates,
stores them as platform configuration, and applies them as confidence floors in the scoring pipeline.
The `signatures.ts` mechanism (confidence floors from structural signals) is the exact pattern to extend.
