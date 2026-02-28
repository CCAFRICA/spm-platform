ARCHITECTURE DECISION RECORD — OB-117
======================================
Problem: Two MBC plans produce wrong/zero results due to plan interpretation quality failures.
- Mortgage: tier values are rates (0.002-0.004), interpreted as flat payouts → $0.003 instead of ~$27,845
- Insurance Referral: tierConfig empty (metric="unknown", tiers=[]), calculationIntent has correct scalar_multiply structure

Option A: Fix AI plan interpretation prompt to populate tierConfig correctly
  - Scale test: Works at 10x? YES — prompt improvement applies to all future plans
  - AI-first: Any hardcoding? NO — improving AI interpretation quality
  - Transport: Data through HTTP bodies? N/A
  - Atomicity: Clean state on failure? YES — plan re-interpretation is idempotent
  - Risk: Requires re-running AI interpretation for ALL existing plans. Doesn't fix already-stored configs.

Option B: Fix legacy evaluator to handle both rate-based tiers AND calculationIntent fallback
  - Scale test: Works at 10x? YES — general heuristic + intent fallback
  - AI-first: Any hardcoding? NO — consuming AI output correctly
  - Transport: Data through HTTP bodies? N/A
  - Atomicity: Clean state on failure? YES — evaluator change, no state mutation
  - Advantage: Fixes existing plans WITHOUT re-interpretation. General heuristic works for ANY plan.

Option C: Both — fix evaluator AND improve AI interpretation
  - Scale test: YES
  - AI-first: YES
  - Risk: Larger change surface. Prompt engineering deferred to OB-119 per Decision 64 sequence.

CHOSEN: Option B because:
1. Fixes existing MBC plans immediately without re-running AI interpretation
2. Rate detection heuristic (all non-zero tier values < 1.0) is general and domain-agnostic
3. calculationIntent fallback leverages the AI's EXISTING correct output (scalar_multiply for insurance)
4. Aligns with Decision 64 sequence: OB-117 = Plan Intelligence quality in the evaluator
5. No new evaluator functions — fixes existing evaluateComponent + evaluateTierLookup

REJECTED: Option A because it requires re-running plan interpretation for stored configs.
REJECTED: Option C because prompt engineering is OB-119 scope per Decision 64.

SPECIFIC CHANGES:
1. evaluateTierLookup: Rate detection — if all non-zero tier values < 1.0, multiply rate × metricValue
2. evaluateComponent: When tier_lookup produces $0 and calculationIntent exists, evaluate via intent executor
3. intent-executor: Export executeOperation for use by evaluateComponent
4. intent-executor: Handle isMarginal flag on bounded_lookup_1d (rate × input)
5. intent-transformer: Carry isMarginal from component.calculationIntent to generated intent
