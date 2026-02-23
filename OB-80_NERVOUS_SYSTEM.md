# OB-80: NEGOTIATION PROTOCOL + FLYWHEEL PIPELINES + VOCABULARY EXTENSION
## Tier 3: Agentic Metamorphosis — The Nervous System

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Calculation_Intent_Specification.md` — the Intent vocabulary (7 primitives + missing primitives section)
4. `Vialuce_Synaptic_State_Specification.md` — Synaptic State protocol (density, surface, flywheels)
5. `OB-78_COMPLETION_REPORT.md` — Synaptic State foundation (composability, density, pattern signatures)
6. `OB-79_COMPLETION_REPORT.md` — Reconciliation + Insight + Resolution Agents
7. `OB-76_COMPLETION_REPORT.md` — Intent executor, transformer, Korean Test
8. `OB-77_COMPLETION_REPORT.md` — Training signals, execution traces

**Read all eight before writing any code.**

---

## WHAT THIS OB BUILDS

Tier 3 completes the Agentic Metamorphosis by building the infrastructure that connects everything:

1. **Vocabulary Extension** — Two new structural primitives (`weighted_blend` and `temporal_window`) that expand the calculation vocabulary to cover all seven candidate domains identified in the Domain Viability Test. Added to Intent types, executor, validator, transformer.

2. **Domain Agent Negotiation Protocol** — The formal interface by which Domain Agents (ICM, Rebate, Franchise, etc.) register with the platform, request work from Foundational Agents, and translate between domain language and structural language. Multi-domain from day one.

3. **Flywheel Pipelines** — The three-scope learning infrastructure: Flywheel 1 (Tenant — already implicit in synaptic density), Flywheel 2 (Foundational — cross-tenant structural pattern aggregation with anonymization), Flywheel 3 (Domain — vertical expertise accumulation with domain tagging).

4. **Agent Memory Read Side** — Foundational Agents consult accumulated intelligence before acting. The Ingestion Agent reads field mapping priors. The Interpretation Agent reads plan pattern priors. The Calculation Agent already reads density (OB-78). Wire the read side for all agents.

**After OB-80, the platform is a multi-domain, self-learning agentic architecture with a formal negotiation protocol between tiers.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain language in Foundational code.** The negotiation protocol types, flywheel pipelines, and vocabulary extensions are all Foundational. Korean Test applies.
8. Domain language acceptable in: Domain Agent registration data, domain-specific configuration, UI display strings only.
9. **Scale test every feature: would this work for 150K entities?**
10. **No per-entity Supabase calls during calculation loop.** Batch all DB operations.
11. **No per-entity LLM calls.** AI runs at design time (plan interpretation, domain registration), not at execution time.
12. **Every OB touching calculation includes Vialuce_Synaptic_State_Specification.md** in READ FIRST.

---

## PHASE 0: DIAGNOSTIC — READ BEFORE ANY CODE

### 0A: Read current Intent vocabulary

```bash
echo "=== INTENT TYPES ==="
cat web/src/lib/calculation/intent-types.ts

echo ""
echo "=== INTENT EXECUTOR ==="
cat web/src/lib/calculation/intent-executor.ts

echo ""
echo "=== INTENT VALIDATOR ==="
cat web/src/lib/calculation/intent-validator.ts

echo ""
echo "=== INTENT TRANSFORMER ==="
cat web/src/lib/calculation/intent-transformer.ts
```

### 0B: Read Synaptic State infrastructure

```bash
echo "=== SYNAPTIC TYPES ==="
cat web/src/lib/calculation/synaptic-types.ts

echo ""
echo "=== PATTERN SIGNATURE ==="
cat web/src/lib/calculation/pattern-signature.ts

echo ""
echo "=== SYNAPTIC DENSITY ==="
cat web/src/lib/calculation/synaptic-density.ts
```

### 0C: Read Agent infrastructure from OB-79

```bash
echo "=== AGENT FILES ==="
ls -la web/src/lib/agents/
for f in web/src/lib/agents/*.ts; do
  echo "--- $(basename $f) ---"
  head -40 "$f"
  echo ""
done
```

### 0D: Read training signals and classification signals

```bash
echo "=== TRAINING SIGNAL CAPTURE ==="
grep -rn "classification_signals\|training.*signal\|captureSignal\|emitSignal" web/src/lib/ --include="*.ts" | head -20

echo ""
echo "=== EXISTING FIELD MAPPING PRIORS ==="
grep -rn "field_map\|fieldMapping\|semantic.*field\|prior\|learned" web/src/lib/ --include="*.ts" | head -20

echo ""
echo "=== AI PLAN INTERPRETER — HOW IT PRODUCES INTENTS ==="
grep -rn "ComponentIntent\|intent\|interpretation" web/src/lib/ai/ --include="*.ts" | head -20
```

### 0E: Read existing domain-specific code to understand boundary

```bash
echo "=== AI PLAN INTERPRETER (Domain Agent candidate) ==="
cat web/src/lib/ai/ai-plan-interpreter.ts | head -80

echo ""
echo "=== DOMAIN LANGUAGE IN EXISTING CODE ==="
grep -rn "commission\|compensation\|attainment\|quota\|payout" web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v ".test." | grep -v "agents/" | head -20
```

**Commit:** `OB-80 Phase 0: Diagnostic — vocabulary, synaptic state, agents, domain boundary`

---

## PHASE 1: ARCHITECTURE DECISIONS

```
ARCHITECTURE DECISION RECORD — OB-80
=====================================

DECISION 1: Vocabulary Extension Strategy

  Problem: Need to add weighted_blend and temporal_window to the structural
  vocabulary without breaking existing Intents, tests, or the executor.

  Approach: Same pattern as OB-78 composability extension.
  - Add new operation types to IntentOperation union
  - Add executor functions for each
  - Add validator rules for each
  - Add pattern signature generation for each
  - Extend transformer to produce them when appropriate
  - All existing tests continue to pass

  CHOSEN: Additive extension — union type grows, no breaking changes.

DECISION 2: Where Does the Negotiation Protocol Live?

  Option A: In src/lib/agents/negotiation-protocol.ts
    Pro: Alongside agents. Discoverable.
    Con: The protocol is foundational infrastructure, not an agent.

  Option B: In src/lib/domain/ — new directory for Domain Agent infrastructure
    Pro: Clean separation. Domain registration, terminology mapping, negotiation
    all in one place. Foundational Agents don't import from here.
    Con: New directory.

  CHOSEN: Option B — src/lib/domain/ directory.
  - domain-registry.ts — domain registration and vocabulary
  - negotiation-protocol.ts — request/response types, IAP scoring
  - terminology-map.ts — domain↔structural term mapping
  
  Domain Agents live here. Foundational Agents never import from src/lib/domain/.
  Domain Agents import from src/lib/agents/ and src/lib/calculation/.
  This IS the two-tier boundary in the codebase.

DECISION 3: Flywheel Pipeline Architecture

  Problem: Three flywheel scopes (tenant, foundational, domain) need different
  aggregation and privacy rules. Currently all synaptic density is tenant-scoped.

  Approach:
  - Flywheel 1 (Tenant): Already exists — synaptic_density table keyed by tenant_id + pattern_signature.
    No changes needed.
  
  - Flywheel 2 (Foundational): New table foundational_patterns. Aggregates density across
    tenants by pattern_signature ONLY. No tenant_id. No entity data. No raw values.
    Updated asynchronously after each tenant density consolidation.
  
  - Flywheel 3 (Domain): New table domain_patterns. Aggregates density by pattern_signature +
    domain_id + vertical_hint. No tenant_id. Updated asynchronously.
  
  New tenant cold start: Load foundational_patterns → pre-populate density with structural priors.
  New tenant in known vertical: Also load domain_patterns for that vertical.

  CHOSEN: Three-table architecture with privacy firewall between them.

DECISION 4: Agent Memory Read Side Scope

  Problem: Agents should consult accumulated intelligence before acting.
  Currently only the Calculation Agent reads density (OB-78).
  
  What agents should read:
  - Calculation Agent: synaptic density (already done)
  - Ingestion Agent: field mapping priors from classification_signals
  - Interpretation Agent: plan structure priors from classification_signals
  - Reconciliation Agent: correction pattern history from synaptic density
  - Insight Agent: baseline stats from prior runs
  - Resolution Agent: resolution pattern history from synaptic density

  Approach: Create a unified AgentMemory interface that abstracts the read side.
  Each agent requests priors for its scope. The memory layer queries the appropriate
  tables (synaptic_density, classification_signals, foundational_patterns, domain_patterns).

  CHOSEN: AgentMemory abstraction in src/lib/agents/agent-memory.ts.
  Foundational code. Korean Test applies.

DECISION 5: Domain Agent Registration — Runtime or Configuration?

  Option A: Domain Agents register at runtime (programmatic API)
    Pro: Dynamic, testable, composable
    Con: State management

  Option B: Domain Agents register via configuration (JSON/TypeScript config files)
    Pro: Simple, versionable, reviewable
    Con: Less dynamic

  CHOSEN: Hybrid — TypeScript configuration objects exported from domain registration files,
  loaded at startup. The ICM Domain Agent is the first, registered in
  src/lib/domain/domains/icm.ts. Adding a new domain = adding a new file + registration.
  No code changes to Foundational Agents.

DECISION 6: IAP Scoring Implementation

  Problem: IAP arbitrates disagreements between agents. Need a computable scoring mechanism.

  Approach: IAP score is a weighted triple:
    IAP(action) = w_I × Intelligence + w_A × Acceleration + w_P × Performance

  Defaults: w_I = 0.4, w_A = 0.3, w_P = 0.3 (intelligence-biased)
  Tenant-configurable: some tenants may weight acceleration (speed) higher.

  Each dimension scores 0-1:
  - Intelligence: Does this action produce learning? (captures training signal = 1, doesn't = 0)
  - Acceleration: Does this action reduce time to outcome? (skips manual step = 1, requires human = 0)
  - Performance: Does this action improve outcome quality? (higher confidence = higher score)

  Agents propose actions. IAP scores them. Highest-scoring action wins.
  If two agents disagree, the IAP-optimal resolution is chosen automatically.

  CHOSEN: Computable IAP triple with tenant-configurable weights.
```

**Commit:** `OB-80 Phase 1: Architecture decisions — vocabulary, domain boundary, flywheels, IAP scoring`

---

## MISSION 1: VOCABULARY EXTENSION — weighted_blend + temporal_window

### 1A: Add weighted_blend to Intent types

```typescript
// In intent-types.ts, add to IntentOperation union:

interface WeightedBlendOperation {
  operation: 'weighted_blend';
  inputs: Array<{
    source: IntentSource | IntentOperation;   // composable — can be nested
    weight: number;                            // 0-1, all weights must sum to 1.0
    scope?: 'entity' | 'group';               // optional scope override per input
  }>;
  metadata?: {
    description: string;
    inputCount: number;
  };
}
```

**Use cases across domains:**
- ICM: 50% individual performance + 50% team performance
- Franchise: 60% sales royalty + 40% advertising contribution (blended fee)
- Channel: 70% deal revenue + 30% partner satisfaction score
- Insurance: Weighted portfolio performance across product lines

### 1B: Add temporal_window to Intent types

```typescript
// In intent-types.ts, add to IntentOperation union:

interface TemporalWindowOperation {
  operation: 'temporal_window';
  input: IntentSource | IntentOperation;       // composable
  windowSize: number;                           // number of periods
  aggregation: 'sum' | 'average' | 'min' | 'max' | 'trend';
  includeCurrentPeriod: boolean;
  metadata?: {
    description: string;
    windowDescription: string;                  // e.g., "rolling 3-period average"
  };
}
```

**Use cases across domains:**
- ICM: Rolling 3-quarter average for recovery eligibility
- Rebate: YoY growth comparison (current vs prior period)
- Franchise: Trailing 12-month average for sliding royalty tier
- Insurance: Policy renewal rate over trailing 4 quarters
- IP/Media: Cumulative usage for advance recoupment tracking

### 1C: Executor implementation

```typescript
// In intent-executor.ts, add to resolveValue/executeOperation:

function executeWeightedBlend(op: WeightedBlendOperation, entityData: Record<string, unknown>, surface?: SynapticSurface): number {
  // 1. Validate weights sum to 1.0 (±0.001 tolerance)
  // 2. Resolve each input (recursive — composable)
  // 3. Multiply each resolved value by its weight
  // 4. Sum weighted values
  // 5. Write confidence synapse (composite = product of child confidences × blend uniformity)
  const totalWeight = op.inputs.reduce((s, i) => s + i.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    // Write anomaly synapse: weights don't sum to 1.0
  }
  
  let result = 0;
  for (const input of op.inputs) {
    const value = resolveValue(input.source, entityData, surface);
    result += value * input.weight;
  }
  return result;
}

function executeTemporalWindow(op: TemporalWindowOperation, entityData: Record<string, unknown>, periodHistory?: PeriodHistory): number {
  // 1. Load prior period values for this entity + metric
  // 2. Apply window size (take last N periods)
  // 3. Include or exclude current period
  // 4. Apply aggregation function
  // NOTE: periodHistory is loaded BEFORE the entity loop (batch, not per-entity)
  // If periodHistory unavailable (first period), return current value with low confidence synapse
}
```

### 1D: Validator and pattern signature extensions

```typescript
// In intent-validator.ts:
// Add validation for weighted_blend (weights sum to 1.0, at least 2 inputs)
// Add validation for temporal_window (windowSize > 0, valid aggregation)

// In pattern-signature.ts:
// Add signature generation:
//   weighted_blend → "weighted_blend:N_inputs:scope_blend" 
//   temporal_window → "temporal_window:sum|avg|...:N_periods"
```

### 1E: Transformer extension

```typescript
// In intent-transformer.ts:
// When AI plan interpretation detects a blended component, produce weighted_blend
// When AI detects rolling/trailing/YoY calculation, produce temporal_window
// These are rare in current test data but must be expressible
```

### 1F: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob80-test-vocabulary.ts
// Test 1: weighted_blend with 2 inputs (50/50)
// Test 2: weighted_blend with 3 inputs (40/30/30)
// Test 3: weighted_blend with nested operations (blend of two lookups)
// Test 4: weighted_blend weight validation (must sum to 1.0)
// Test 5: weighted_blend with scope override per input
// Test 6: temporal_window with sum aggregation
// Test 7: temporal_window with average aggregation
// Test 8: temporal_window with trend (slope)
// Test 9: temporal_window graceful degradation (no history → current value)
// Test 10: temporal_window with nested input (window of a ratio)
// Test 11: Backward compatibility — all existing OB-76/78 tests still pass
// Test 12: Pattern signatures generated correctly for new primitives
// Test 13: Korean Test — zero domain words in updated files
SCRIPT
npx tsx web/scripts/ob80-test-vocabulary.ts
```

**Proof gates:**
- PG-1: weighted_blend produces correct output for 2 and 3 inputs
- PG-2: weighted_blend composes with nested operations
- PG-3: temporal_window produces correct aggregations
- PG-4: temporal_window graceful degradation (no history)
- PG-5: All existing OB-76/78 Intent tests still pass (backward compatibility)
- PG-6: Pattern signatures generated for both new primitives
- PG-7: Korean Test passes on all updated files

**Commit:** `OB-80 Mission 1: Vocabulary extension — weighted_blend + temporal_window, 7 gates`

---

## MISSION 2: DOMAIN AGENT NEGOTIATION PROTOCOL

### 2A: Create src/lib/domain/ directory

This directory is the two-tier boundary. Foundational Agents (src/lib/agents/, src/lib/calculation/) NEVER import from here. Domain Agents import from both.

### 2B: Create src/lib/domain/domain-registry.ts

```typescript
export interface DomainRegistration {
  domainId: string;                          // 'icm', 'rebate', 'franchise', 'channel', 'ip_royalty', 'insurance'
  displayName: string;
  version: string;
  
  // Terminology mapping: domain language ↔ structural language
  terminology: DomainTerminology;
  
  // What vocabulary primitives this domain uses (subset of all available)
  requiredPrimitives: string[];
  
  // Vocabulary extensions this domain needs beyond the base set
  vocabularyExtensions?: string[];
  
  // Benchmark types for reconciliation
  benchmarkTypes: string[];
  
  // Dispute categories
  disputeCategories: string[];
  
  // Compliance frameworks
  complianceFrameworks: string[];
  
  // Vertical hints for Flywheel 3
  verticalHints: string[];
  
  // Plan interpretation prompt context (what the AI should know about this domain)
  interpretationContext: string;
}

export interface DomainTerminology {
  entity: string;                             // "employee", "partner", "franchisee"
  entityGroup: string;                        // "store", "distributor", "location"
  outcome: string;                            // "payout", "rebate", "royalty"
  outcomeVerb: string;                        // "earned", "accrued", "owed"
  ruleset: string;                            // "comp plan", "rebate agreement", "franchise agreement"
  period: string;                             // "pay period", "fiscal quarter", "reporting month"
  performance: string;                        // "attainment", "volume", "gross sales"
  target: string;                             // "quota", "threshold", "minimum"
}

// Domain → Structural translation
export function toStructural(domainTerm: string, domain: DomainRegistration): string {
  // Maps domain language to foundational language
  // "attainment" → "ratio of actual to reference"
  // "commission tier" → "1D bounded threshold mapping"
  // "partner rebate" → "entity outcome"
}

// Structural → Domain translation (for display)
export function toDomain(structuralTerm: string, domain: DomainRegistration): string {
  // Maps foundational language to domain language for UI
  // "entity" → "employee" (in ICM)
  // "outcome" → "royalty" (in franchise)
}

// Registry
const registeredDomains = new Map<string, DomainRegistration>();

export function registerDomain(domain: DomainRegistration): void {
  // Validate: required primitives are all available
  // Validate: vocabulary extensions are either available or flagged
  // Store in registry
  registeredDomains.set(domain.domainId, domain);
}

export function getDomain(domainId: string): DomainRegistration | undefined {
  return registeredDomains.get(domainId);
}

export function getAllDomains(): DomainRegistration[] {
  return Array.from(registeredDomains.values());
}
```

### 2C: Create src/lib/domain/negotiation-protocol.ts

```typescript
// The negotiation protocol defines how Domain Agents request work from Foundational Agents.

export interface NegotiationRequest {
  requestId: string;
  domainId: string;
  requestType: NegotiationRequestType;
  payload: unknown;                           // type depends on requestType
  iapPreference?: IAPWeights;                 // domain can suggest IAP weighting
  urgency: 'immediate' | 'batch' | 'deferred';
}

export type NegotiationRequestType =
  | 'ingest_data'              // Domain → Ingestion Agent
  | 'interpret_rules'          // Domain → Interpretation Agent (produces Intents)
  | 'calculate_outcomes'       // Domain → Calculation Agent
  | 'reconcile_results'        // Domain → Reconciliation Agent
  | 'generate_insights'        // Domain → Insight Agent
  | 'investigate_dispute'      // Domain → Resolution Agent
  | 'query_memory';            // Domain → Agent Memory (read priors)

export interface NegotiationResponse {
  requestId: string;
  status: 'completed' | 'partial' | 'failed' | 'deferred';
  result: unknown;
  confidence: number;
  iapScore: IAPScore;
  trainingSignal?: TrainingSignalPayload;     // every negotiation can produce a signal
}

export interface IAPWeights {
  intelligence: number;    // 0-1, default 0.4
  acceleration: number;    // 0-1, default 0.3
  performance: number;     // 0-1, default 0.3
}

export interface IAPScore {
  intelligence: number;    // 0-1: did this produce learning?
  acceleration: number;    // 0-1: did this reduce time to outcome?
  performance: number;     // 0-1: did this improve outcome quality?
  composite: number;       // weighted sum
}

export function scoreIAP(
  action: { producesLearning: boolean; automatesStep: boolean; confidence: number },
  weights: IAPWeights = { intelligence: 0.4, acceleration: 0.3, performance: 0.3 }
): IAPScore {
  const intelligence = action.producesLearning ? 1.0 : 0.0;
  const acceleration = action.automatesStep ? 1.0 : 0.0;
  const performance = action.confidence;
  
  return {
    intelligence,
    acceleration,
    performance,
    composite: weights.intelligence * intelligence +
               weights.acceleration * acceleration +
               weights.performance * performance
  };
}

// Arbitration: when two approaches are available, IAP picks the winner
export function arbitrate(
  options: Array<{ id: string; action: { producesLearning: boolean; automatesStep: boolean; confidence: number } }>,
  weights?: IAPWeights
): { winnerId: string; score: IAPScore; allScores: Array<{ id: string; score: IAPScore }> } {
  const scored = options.map(opt => ({
    id: opt.id,
    score: scoreIAP(opt.action, weights)
  }));
  scored.sort((a, b) => b.score.composite - a.score.composite);
  return {
    winnerId: scored[0].id,
    score: scored[0].score,
    allScores: scored
  };
}
```

### 2D: Create src/lib/domain/domains/icm.ts — First Domain Agent Registration

```typescript
import { DomainRegistration, registerDomain } from '../domain-registry';

export const ICM_DOMAIN: DomainRegistration = {
  domainId: 'icm',
  displayName: 'Incentive Compensation Management',
  version: '1.0.0',
  
  terminology: {
    entity: 'employee',
    entityGroup: 'store',
    outcome: 'payout',
    outcomeVerb: 'earned',
    ruleset: 'compensation plan',
    period: 'pay period',
    performance: 'attainment',
    target: 'quota',
  },
  
  requiredPrimitives: [
    'bounded_lookup_1d',
    'bounded_lookup_2d',
    'scalar_multiply',
    'conditional_gate',
    'aggregate',
    'ratio',
    'constant',
    'weighted_blend',       // for scope blending
  ],
  
  vocabularyExtensions: [],  // all primitives already exist
  
  benchmarkTypes: [
    'legacy_system_export',
    'manual_spreadsheet',
    'prior_period_results',
  ],
  
  disputeCategories: [
    'data_error',
    'calculation_error',
    'plan_interpretation',
    'missing_transaction',
    'store_assignment',
    'tier_placement',
  ],
  
  complianceFrameworks: ['SOC2', 'GAAP'],
  
  verticalHints: ['retail', 'telecom', 'pharma', 'financial_services', 'technology'],
  
  interpretationContext: `
    Compensation plans define how entities earn outcomes based on performance metrics.
    Plans typically have multiple components, each with its own calculation logic.
    Common patterns: tier tables (1D lookup on performance ratio), matrix tables 
    (2D lookup on performance ratio × group aggregate), percentage of metric value,
    conditional eligibility gates, scope blending (individual + team).
    Plans may have variants (e.g., certified vs non-certified entity classification).
    Clawback and adjustment provisions are common for temporal corrections.
  `,
};

// Register on import
registerDomain(ICM_DOMAIN);
```

### 2E: Create template registrations for expansion domains

```typescript
// src/lib/domain/domains/rebate.ts
export const REBATE_DOMAIN: DomainRegistration = {
  domainId: 'rebate',
  displayName: 'B2B Rebate Management',
  version: '0.1.0',  // template — not yet activated
  terminology: {
    entity: 'partner',
    entityGroup: 'distributor',
    outcome: 'rebate',
    outcomeVerb: 'accrued',
    ruleset: 'rebate agreement',
    period: 'fiscal quarter',
    performance: 'volume',
    target: 'threshold',
  },
  requiredPrimitives: ['bounded_lookup_1d', 'scalar_multiply', 'conditional_gate', 'aggregate', 'ratio', 'constant'],
  vocabularyExtensions: [],
  benchmarkTypes: ['erp_export', 'accounting_reconciliation'],
  disputeCategories: ['tier_misapplication', 'volume_discrepancy', 'program_eligibility', 'timing_dispute'],
  complianceFrameworks: ['SOC2', 'GAAP', 'ASC_606'],
  verticalHints: ['manufacturing', 'distribution', 'technology', 'beverage'],
  interpretationContext: `Rebate agreements define retrospective payments to partners based on purchase volume or revenue thresholds. Tiered structures are common: higher volume = higher rebate rate. Stepped (rate per tier band) and retrospective (full rate on all units) calculation methods exist.`,
};

// src/lib/domain/domains/franchise.ts
export const FRANCHISE_DOMAIN: DomainRegistration = {
  domainId: 'franchise',
  displayName: 'Franchise Royalty Management',
  version: '0.1.0',
  terminology: {
    entity: 'franchisee',
    entityGroup: 'location',
    outcome: 'royalty',
    outcomeVerb: 'owed',
    ruleset: 'franchise agreement',
    period: 'reporting month',
    performance: 'gross sales',
    target: 'minimum royalty',
  },
  requiredPrimitives: ['scalar_multiply', 'bounded_lookup_1d', 'conditional_gate', 'aggregate', 'constant'],
  vocabularyExtensions: [],
  benchmarkTypes: ['pos_system_export', 'financial_statement'],
  disputeCategories: ['sales_reporting', 'fee_calculation', 'territory_dispute', 'compliance_penalty'],
  complianceFrameworks: ['SOC2', 'GAAP', 'ASC_606', 'FTC_franchise_rule'],
  verticalHints: ['food_service', 'retail', 'hospitality', 'fitness', 'automotive'],
  interpretationContext: `Franchise agreements define royalty obligations as percentage of gross sales, often with declining tiers for higher volumes, minimum floors, and additional fees (advertising fund, technology fee). Multi-unit operators may receive volume discounts.`,
};
```

### 2F: Domain Viability Test — Runtime

```typescript
// src/lib/domain/domain-viability.ts

export interface DVTResult {
  domainId: string;
  score: 'natural_fit' | 'strong_fit' | 'requires_extension' | 'incompatible';
  gateResults: {
    ruleExpressibility: 'pass' | 'partial' | 'fail';
    dataShapeCompatibility: 'pass' | 'partial' | 'fail';
    outcomeSemantics: 'pass' | 'partial' | 'fail';
    reconciliationApplicability: 'pass' | 'partial' | 'fail';
    scaleProfile: 'pass' | 'partial' | 'fail';
  };
  missingPrimitives: string[];
  flywheel2Overlap: number;      // 0-1: how much structural overlap with existing patterns
  flywheel3Neighbors: string[];  // domain IDs with similar vertical hints
}

export function evaluateDomainViability(
  registration: DomainRegistration,
  availablePrimitives: string[]
): DVTResult {
  // Gate 1: All required primitives available?
  const missingPrimitives = registration.requiredPrimitives.filter(p => !availablePrimitives.includes(p));
  const ruleExpressibility = missingPrimitives.length === 0 ? 'pass' : 
    (missingPrimitives.length <= 1 ? 'partial' : 'fail');
  
  // Gates 2-5 evaluated from registration metadata
  // (Data shape, outcome semantics, reconciliation, scale are design-time properties
  //  encoded in the registration — the DVT validates the registration is complete)
  
  const passCount = [ruleExpressibility /* ... other gates */].filter(g => g === 'pass').length;
  
  return {
    domainId: registration.domainId,
    score: passCount === 5 ? 'natural_fit' : passCount >= 4 ? 'strong_fit' : passCount >= 3 ? 'requires_extension' : 'incompatible',
    gateResults: { ruleExpressibility, /* ... */ },
    missingPrimitives,
    flywheel2Overlap: 0, // calculated from foundational_patterns
    flywheel3Neighbors: [] // calculated from domain_patterns
  };
}
```

### 2G: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob80-test-negotiation.ts
// Test 1: ICM domain registration — all primitives available
// Test 2: Rebate domain registration — validates correctly
// Test 3: Franchise domain registration — validates correctly
// Test 4: Domain terminology mapping — structural ↔ domain roundtrip
// Test 5: IAP scoring — intelligence-biased defaults
// Test 6: IAP arbitration — highest composite wins
// Test 7: IAP with custom weights — acceleration-biased
// Test 8: Negotiation request/response types compile correctly
// Test 9: DVT evaluates ICM as natural_fit
// Test 10: DVT evaluates a domain with missing primitive as requires_extension
// Test 11: Domain registry — register, get, getAll
// Test 12: Korean Test — zero domain words in domain-registry.ts, negotiation-protocol.ts, domain-viability.ts
// Test 13: Two-tier boundary — no imports from src/lib/domain/ in src/lib/agents/ or src/lib/calculation/
SCRIPT
npx tsx web/scripts/ob80-test-negotiation.ts
```

**Proof gates:**
- PG-8: ICM domain registered with all primitives passing DVT
- PG-9: Terminology mapping roundtrips correctly
- PG-10: IAP scoring produces correct composite scores
- PG-11: IAP arbitration picks highest-scoring option
- PG-12: DVT evaluates domains correctly (natural_fit, requires_extension)
- PG-13: Two-tier boundary enforced — no cross-imports
- PG-14: Korean Test passes on all protocol files

**Commit:** `OB-80 Mission 2: Negotiation protocol — domain registry, IAP scoring, DVT, 7 gates`

---

## MISSION 3: FLYWHEEL PIPELINES

### 3A: Supabase migration — foundational_patterns and domain_patterns

```sql
-- 016_flywheel_tables.sql

-- Flywheel 2: Cross-tenant structural intelligence
-- PRIVACY: No tenant_id. No entity data. No raw values. Pattern signatures only.
CREATE TABLE foundational_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_signature TEXT NOT NULL UNIQUE,
  
  -- Aggregated across all tenants
  confidence_mean NUMERIC DEFAULT 0.5,
  confidence_variance NUMERIC DEFAULT 0.0,
  total_executions BIGINT DEFAULT 0,
  tenant_count INTEGER DEFAULT 0,           -- how many tenants have this pattern
  anomaly_rate_mean NUMERIC DEFAULT 0.0,
  
  -- Learned structural behaviors
  learned_behaviors JSONB DEFAULT '{}',     -- boundary behavior, common resolutions
  
  -- No tenant identification
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flywheel 3: Domain vertical expertise
-- PRIVACY: No tenant_id. No entity data. Domain + vertical tagging only.
CREATE TABLE domain_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_signature TEXT NOT NULL,
  domain_id TEXT NOT NULL,                  -- 'icm', 'rebate', 'franchise'
  vertical_hint TEXT,                       -- 'retail', 'telecom', 'pharma'
  
  -- Aggregated across tenants in this domain+vertical
  confidence_mean NUMERIC DEFAULT 0.5,
  total_executions BIGINT DEFAULT 0,
  tenant_count INTEGER DEFAULT 0,
  
  -- Domain-specific learned behaviors
  learned_behaviors JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(pattern_signature, domain_id, vertical_hint)
);

-- RLS: These tables have NO tenant_id column.
-- Access is read-only for all authenticated users (they get structural priors).
-- Write access is restricted to service role (aggregation pipeline only).
ALTER TABLE foundational_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read foundational patterns"
  ON foundational_patterns FOR SELECT TO authenticated USING (true);

ALTER TABLE domain_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read domain patterns"
  ON domain_patterns FOR SELECT TO authenticated USING (true);
```

### 3B: Create src/lib/calculation/flywheel-pipeline.ts

```typescript
// Flywheel aggregation pipeline — runs AFTER tenant density consolidation

export interface FlywheelAggregationInput {
  tenantId: string;
  domainId: string;
  verticalHint?: string;
  densityUpdates: Array<{
    patternSignature: string;
    confidence: number;
    executionCount: number;
    anomalyRate: number;
    learnedBehaviors: Record<string, unknown>;
  }>;
}

// Flywheel 2: Foundational aggregation
// Strips ALL tenant identity. Aggregates by pattern_signature only.
export async function aggregateFoundational(input: FlywheelAggregationInput): Promise<void> {
  // For each pattern in the input:
  // 1. Read existing foundational_patterns row for this signature
  // 2. Update running averages:
  //    confidence_mean = EMA(existing_mean, new_confidence, weight=0.1)
  //    total_executions += new_execution_count
  //    anomaly_rate_mean = EMA(existing_rate, new_rate, weight=0.1)
  //    tenant_count = increment if first time this tenant contributes
  // 3. Merge learned_behaviors (structural only — no values, no names)
  // 4. Upsert foundational_patterns
  //
  // PRIVACY FIREWALL:
  // - input.tenantId is used ONLY to increment tenant_count
  // - It is NOT stored in the row
  // - No entity data, no metric values, no field names cross this boundary
  // - Only: pattern_signature, confidence, execution count, anomaly rate, structural behaviors
}

// Flywheel 3: Domain aggregation
// Strips tenant identity. Tags by domain + vertical.
export async function aggregateDomain(input: FlywheelAggregationInput): Promise<void> {
  // Same as Foundational but additionally filtered by domain_id + vertical_hint
  // A "bounded_lookup_2d" pattern from ICM/retail accumulates separately from
  // the same structural pattern in franchise/food_service
}

// Cold start: Load priors for a new tenant
export async function loadColdStartPriors(
  domainId: string,
  verticalHint?: string
): Promise<Map<string, { confidence: number; learnedBehaviors: Record<string, unknown> }>> {
  // 1. Load foundational_patterns (structural priors for ALL patterns)
  // 2. Load domain_patterns for this domain + vertical
  // 3. Merge: domain-specific priors override foundational where both exist
  // 4. Return map of pattern_signature → { confidence, learnedBehaviors }
  //
  // A new tenant starts with confidence from the community, not from zero.
  // This is the compound moat.
}

// Wire into existing consolidation (OB-78)
// After SynapticSurface consolidation writes to synaptic_density (tenant-scoped),
// fire-and-forget: aggregateFoundational + aggregateDomain
export async function postConsolidationFlywheel(
  tenantId: string,
  domainId: string,
  verticalHint: string | undefined,
  densityUpdates: FlywheelAggregationInput['densityUpdates']
): Promise<void> {
  // Fire-and-forget — do not block calculation response
  await Promise.allSettled([
    aggregateFoundational({ tenantId, domainId, verticalHint, densityUpdates }),
    aggregateDomain({ tenantId, domainId, verticalHint, densityUpdates }),
  ]);
}
```

### 3C: Wire flywheel into calculation route

In the calculation route (after synaptic density consolidation, already fire-and-forget from OB-78):

```typescript
// After tenant density upsert:
postConsolidationFlywheel(tenantId, domainId, verticalHint, densityUpdates)
  .catch(err => console.error('Flywheel aggregation error:', err));
```

### 3D: Wire cold start into density loading

In the calculation route (where density is loaded before entity loop):

```typescript
// Load tenant density
let densityMap = await loadDensityForTenant(tenantId);

// If tenant has no density (cold start), load priors from flywheels
if (densityMap.size === 0) {
  const priors = await loadColdStartPriors(domainId, verticalHint);
  // Pre-populate tenant density from priors (with reduced confidence — priors, not proven)
  for (const [sig, prior] of priors) {
    densityMap.set(sig, {
      patternSignature: sig,
      confidence: prior.confidence * 0.6,  // Prior confidence discounted — not yet proven for this tenant
      totalExecutions: 0,
      executionMode: prior.confidence * 0.6 >= 0.7 ? 'light_trace' : 'full_trace',
      learnedBehaviors: prior.learnedBehaviors,
    });
  }
}
```

### 3E: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob80-test-flywheel.ts
// Test 1: Foundational aggregation — strips tenant_id, aggregates by signature
// Test 2: Domain aggregation — tags by domain_id + vertical_hint
// Test 3: Privacy firewall — no tenant_id in foundational_patterns rows
// Test 4: Privacy firewall — no entity data in domain_patterns rows
// Test 5: Cold start — new tenant loads priors from foundational
// Test 6: Cold start — domain + vertical priors override foundational
// Test 7: Prior confidence discount — cold start uses 0.6× factor
// Test 8: EMA aggregation — confidence_mean updates correctly
// Test 9: Tenant count — increments correctly (once per tenant per pattern)
// Test 10: Post-consolidation wiring — flywheel runs after density update
// Test 11: Korean Test — zero domain words in flywheel-pipeline.ts
// Test 12: Migration executes — foundational_patterns and domain_patterns created
SCRIPT
npx tsx web/scripts/ob80-test-flywheel.ts
```

**Proof gates:**
- PG-15: Foundational aggregation strips tenant_id
- PG-16: Domain aggregation tags correctly
- PG-17: Cold start loads priors and discounts confidence
- PG-18: EMA produces correct running averages
- PG-19: Privacy firewall — no tenant data in cross-tenant tables
- PG-20: Post-consolidation wiring fires correctly
- PG-21: Korean Test passes on flywheel code

**Commit:** `OB-80 Mission 3: Flywheel pipelines — three-scope aggregation, cold start, privacy firewall, 7 gates`

---

## MISSION 4: AGENT MEMORY READ SIDE

### 4A: Create src/lib/agents/agent-memory.ts

```typescript
// Unified read interface for agent priors — what does the system already know?

export interface AgentPriors {
  // From synaptic density (Flywheel 1)
  tenantDensity: Map<string, PatternDensity>;
  
  // From foundational patterns (Flywheel 2)
  foundationalPriors: Map<string, { confidence: number; learnedBehaviors: Record<string, unknown> }>;
  
  // From domain patterns (Flywheel 3)
  domainPriors: Map<string, { confidence: number; learnedBehaviors: Record<string, unknown> }>;
  
  // From classification signals (training history)
  signalHistory: SignalSummary;
}

export interface SignalSummary {
  fieldMappingSignals: Array<{
    sourceColumn: string;
    mappedField: string;
    confidence: number;
    occurrences: number;
  }>;
  interpretationSignals: Array<{
    componentPattern: string;
    confidence: number;
    occurrences: number;
  }>;
  reconciliationSignals: Array<{
    discrepancyClass: string;
    count: number;
    lastSeen: string;
  }>;
  resolutionSignals: Array<{
    rootCause: string;
    count: number;
    lastSeen: string;
  }>;
}

// Load priors scoped to what an agent needs
export async function loadPriorsForAgent(
  tenantId: string,
  domainId: string,
  agentType: 'ingestion' | 'interpretation' | 'calculation' | 'reconciliation' | 'insight' | 'resolution',
  verticalHint?: string
): Promise<AgentPriors> {
  // Each agent gets the same interface but different emphasis:
  
  // Calculation Agent: primarily reads density (OB-78 already does this — unify)
  // Ingestion Agent: primarily reads fieldMappingSignals (what fields mapped before)
  // Interpretation Agent: primarily reads interpretationSignals + componentPattern density
  // Reconciliation Agent: primarily reads reconciliationSignals + correction density
  // Insight Agent: primarily reads all (broadest consumer)
  // Resolution Agent: primarily reads resolutionSignals + correction density
  
  // Implementation:
  // 1. Load tenant density from synaptic_density
  // 2. Load foundational priors from foundational_patterns (for cold start or augmentation)
  // 3. Load domain priors from domain_patterns (for vertical context)
  // 4. Load signal summary from classification_signals (aggregated, not raw)
  // 5. Return unified AgentPriors
  
  // PERFORMANCE: This is called ONCE before a pipeline run, not per-entity.
  // Results are cached for the duration of the run.
}
```

### 4B: Wire into existing agents

Each agent's main entry point should optionally accept priors:

```typescript
// Reconciliation Agent
export async function reconcile(input: ReconciliationInput & { priors?: AgentPriors }): Promise<ReconciliationReport> {
  // If priors available, use reconciliationSignals to:
  // - Pre-classify known rounding patterns (don't re-discover)
  // - Adjust tolerance based on historical discrepancy patterns
  // - Skip investigation of patterns already classified as systematic
}

// Insight Agent
export async function generateFullAnalysis(
  tenantId: string,
  batchId: string,
  surface: SynapticSurface,
  calculationSummary: CalculationSummary,
  reconciliationReport?: ReconciliationReport,
  priors?: AgentPriors
): Promise<FullAnalysis> {
  // If priors available, use signal history to:
  // - Compare current stats to historical baselines
  // - Flag DEVIATIONS from normal (not just absolute thresholds)
  // - Enrich AI prompt with trend context
}

// Resolution Agent
export async function investigate(
  context: DisputeContext & { priors?: AgentPriors }
): Promise<ResolutionInvestigation> {
  // If priors available, use resolutionSignals to:
  // - Pre-populate root cause with known patterns
  // - Adjust confidence based on similar prior resolutions
  // - Reference resolution history in recommendation
}
```

### 4C: Wire into calculation route

```typescript
// In calculation route, before entity loop:
const priors = await loadPriorsForAgent(tenantId, domainId, 'calculation', verticalHint);
// priors.tenantDensity replaces current loadDensityForTenant call
// priors.foundationalPriors + priors.domainPriors available for cold start
```

### 4D: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob80-test-agent-memory.ts
// Test 1: loadPriorsForAgent returns complete AgentPriors structure
// Test 2: Priors include tenant density (Flywheel 1)
// Test 3: Priors include foundational patterns (Flywheel 2)
// Test 4: Priors include domain patterns (Flywheel 3)
// Test 5: Priors include signal summary from classification_signals
// Test 6: Agent memory is loaded ONCE, not per-entity
// Test 7: Reconciliation Agent uses priors to pre-classify known patterns
// Test 8: Resolution Agent uses priors to reference historical resolutions
// Test 9: Cold start tenant — priors come from foundational + domain
// Test 10: Korean Test — zero domain words in agent-memory.ts
SCRIPT
npx tsx web/scripts/ob80-test-agent-memory.ts
```

**Proof gates:**
- PG-22: AgentPriors contains all three flywheel sources
- PG-23: Signal summary aggregates from classification_signals
- PG-24: Agent memory loaded once per run (not per-entity)
- PG-25: Cold start tenant receives foundational + domain priors
- PG-26: Reconciliation Agent reads priors for pre-classification
- PG-27: Korean Test passes on agent-memory.ts

**Commit:** `OB-80 Mission 4: Agent memory read side — unified priors, three-flywheel read, 6 gates`

---

## MISSION 5: FULL INTEGRATION PROOF

### 5A: Multi-domain calculation proof

```bash
cat << 'SCRIPT' > web/scripts/ob80-test-integration.ts
// The Multi-Domain Integration Test
//
// This test proves the complete Tier 3 architecture works end-to-end.
//
// PART 1: VOCABULARY
// Step 1: Create an Intent with weighted_blend (50% lookup_1d + 50% lookup_1d)
// Step 2: Execute it — verify correct weighted output
// Step 3: Create an Intent with temporal_window (3-period average)
// Step 4: Execute it — verify correct aggregation
// Step 5: Verify both generate valid pattern signatures
//
// PART 2: NEGOTIATION PROTOCOL
// Step 6: Register ICM domain
// Step 7: Register Rebate domain (template)
// Step 8: Register Franchise domain (template)
// Step 9: Run DVT on all three — all score natural_fit
// Step 10: Create a negotiation request from ICM domain
// Step 11: Score it with IAP — verify composite calculation
// Step 12: Arbitrate between two options — verify winner selection
//
// PART 3: FLYWHEEL PIPELINES
// Step 13: Simulate tenant density consolidation
// Step 14: Trigger foundational aggregation — verify row in foundational_patterns
// Step 15: Trigger domain aggregation — verify row in domain_patterns
// Step 16: Nuclear clear the tenant
// Step 17: Load cold start priors — verify priors populated from flywheels
// Step 18: Verify cold start confidence is discounted (0.6× factor)
//
// PART 4: AGENT MEMORY
// Step 19: Load priors for calculation agent — all three flywheel sources
// Step 20: Load priors for reconciliation agent — includes signal history
// Step 21: Verify agent memory is a single load (not per-entity)
//
// PART 5: THE TWO-TIER BOUNDARY
// Step 22: Verify no imports from src/lib/domain/ in src/lib/agents/
// Step 23: Verify no imports from src/lib/domain/ in src/lib/calculation/
// Step 24: Verify no domain words in foundational files (expanded Korean Test)
//
// This IS the Tier 3 proof — vocabulary, protocol, flywheels, memory, boundary.
SCRIPT
npx tsx web/scripts/ob80-test-integration.ts
```

**Proof gates:**
- PG-28: Multi-domain DVT — all three domains score natural_fit
- PG-29: Flywheel cold start — new tenant receives priors
- PG-30: Two-tier boundary — zero cross-imports from domain → foundational
- PG-31: Full integration test completes end-to-end

**Commit:** `OB-80 Mission 5: Full integration proof — multi-domain, flywheels, boundary, 4 gates`

---

## MISSION 6: KOREAN TEST + BUILD + COMPLETION

### 6A: Expanded Korean Test

```bash
echo "=== KOREAN TEST — ALL FOUNDATIONAL FILES ==="

echo ""
echo "--- Calculation files ---"
for f in intent-types.ts intent-executor.ts intent-validator.ts synaptic-types.ts synaptic-surface.ts synaptic-density.ts pattern-signature.ts anomaly-detector.ts; do
  count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise" "web/src/lib/calculation/$f" 2>/dev/null || echo "0")
  echo "  $f: $count domain words"
done

echo ""
echo "--- Agent files ---"
for f in reconciliation-agent.ts insight-agent.ts resolution-agent.ts agent-memory.ts; do
  count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise" "web/src/lib/agents/$f" 2>/dev/null || echo "0")
  echo "  $f: $count domain words"
done

echo ""
echo "--- Protocol files (Foundational) ---"
for f in domain-registry.ts negotiation-protocol.ts domain-viability.ts; do
  count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise" "web/src/lib/domain/$f" 2>/dev/null || echo "0")
  echo "  $f: $count domain words"
done

echo ""
echo "--- Flywheel files ---"
count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise" "web/src/lib/calculation/flywheel-pipeline.ts" 2>/dev/null || echo "0")
echo "  flywheel-pipeline.ts: $count domain words"

echo ""
echo "--- Domain files (MAY contain domain words — this is correct) ---"
for f in web/src/lib/domain/domains/*.ts; do
  count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise" "$f" 2>/dev/null || echo "0")
  echo "  $(basename $f): $count domain words (EXPECTED — domain agent)"
done
```

### 6B: Build verification

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
```

### 6C: Integration CLT

```
□ npm run build exits 0?
□ localhost:3000 responds?
□ Vocabulary tests pass? (13 tests)
□ Negotiation tests pass? (13 tests)
□ Flywheel tests pass? (12 tests)
□ Agent memory tests pass? (10 tests)
□ Integration tests pass? (24 steps)
□ Korean Test: 0 domain words in ALL foundational files?
□ Korean Test: domain words PRESENT in domain registration files?
□ Two-tier boundary: zero cross-imports?
□ All three domains register and pass DVT?
□ Cold start priors load from both flywheel tables?
□ IAP scoring produces correct composites?
□ Backward compatibility: OB-78 + OB-79 tests still pass?
□ gh pr create executed?
```

**Proof gates:**
- PG-32: Korean Test — 0 domain words in all foundational files
- PG-33: npm run build exits 0
- PG-34: Backward compatibility — all prior tests pass

**Commit:** `OB-80 Mission 6: Korean Test + Build + CLT — all gates pass`

---

## COMPLETION REPORT

Save as `OB-80_COMPLETION_REPORT.md` in **PROJECT ROOT**.

Structure:
1. **Architecture Decisions** — all 6 decisions with rationale
2. **Commits** — all with hashes
3. **Files created** — every new file
4. **Files modified** — every changed file
5. **Proof gates** — 34 gates, each PASS/FAIL with evidence
6. **Vocabulary Extension** — weighted_blend + temporal_window proof
7. **Negotiation Protocol** — ICM registration, DVT results, IAP scoring
8. **Flywheel Pipelines** — three-scope aggregation, cold start, privacy proof
9. **Agent Memory** — unified read side, three-flywheel integration
10. **Integration Proof** — multi-domain, end-to-end
11. **Korean Test** — expanded grep output for ALL files (foundational + domain)
12. **Known issues** — honest gaps
13. **Agentic Metamorphosis Status** — Tier 1 (OB-78) + Tier 2 (OB-79) + Tier 3 (OB-80) summary

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-80: Negotiation Protocol + Flywheel Pipelines + Vocabulary Extension — Tier 3 Agentic Metamorphosis" \
  --body "## Tier 3 Agentic Metamorphosis — The Nervous System

### Mission 1: Vocabulary Extension
- weighted_blend: N-input weighted combination with scope overrides
- temporal_window: Rolling N-period aggregation (sum, average, min, max, trend)
- Both compose with existing primitives (nested operations)
- Pattern signatures generated for both
- All 7 candidate domains now fully expressible

### Mission 2: Domain Agent Negotiation Protocol
- DomainRegistration interface: terminology mapping, primitive requirements, compliance
- ICM domain fully registered as first Domain Agent
- Rebate + Franchise domains registered as templates (v0.1.0)
- IAP scoring: computable triple (Intelligence × Acceleration × Performance)
- IAP arbitration: highest composite score wins
- Domain Viability Test: runtime gate for new domain registration
- Two-tier boundary enforced in codebase (domain/ never imported by agents/ or calculation/)

### Mission 3: Flywheel Pipelines
- Flywheel 1 (Tenant): existing synaptic_density — no changes needed
- Flywheel 2 (Foundational): foundational_patterns table — cross-tenant structural aggregation
- Flywheel 3 (Domain): domain_patterns table — vertical expertise accumulation
- Privacy firewall: no tenant_id in cross-tenant tables
- Cold start: new tenant loads priors from both flywheel tables at 0.6× confidence
- Post-consolidation wiring: fire-and-forget aggregation after each calculation

### Mission 4: Agent Memory Read Side
- Unified AgentPriors interface for all six Foundational Agents
- Three-flywheel read: tenant density + foundational priors + domain priors
- Signal summary from classification_signals (field mapping, interpretation, reconciliation, resolution)
- Loaded once per run, cached, not per-entity

### Mission 5: Full Integration Proof
- Multi-domain DVT: ICM, Rebate, Franchise all score natural_fit
- Flywheel cold start proven end-to-end
- Two-tier boundary verified (zero cross-imports)
- Backward compatibility with OB-78/79

### Korean Test: PASS — zero domain words in all foundational files
### Proof Gates: 34 — see OB-80_COMPLETION_REPORT.md

### Agentic Metamorphosis Complete:
- Tier 1 (OB-78): Synaptic State Foundation — 178/178 tests
- Tier 2 (OB-79): Agent Autonomy — 170/170 tests
- Tier 3 (OB-80): Nervous System — see completion report"
```

**Commit:** `OB-80 Final: Completion report + PR`

---

## MAXIMUM SCOPE

6 missions, 34 proof gates. After OB-80, the Agentic Metamorphosis is complete:

**Tier 1 (OB-78):** The Synaptic State Foundation
- Intent composability (3-level nested operations)
- Synaptic Surface (in-memory, O(1) read/write)
- Synaptic Density (persistent, density-driven execution modes)
- Progressive performance (system gets faster with usage)
- Engine cutover (automatic, gradual, reversible)

**Tier 2 (OB-79):** Agent Autonomy
- Reconciliation Agent (finds truth in gaps between datasets)
- Insight Agent (surfaces prescriptive intelligence)
- Resolution Agent (investigates disputes with evidence)
- Closed loop (correction → recalculation → improved density)

**Tier 3 (OB-80):** The Nervous System
- Vocabulary extension (9 primitives cover all 7 candidate domains)
- Negotiation protocol (multi-domain from day one)
- Flywheel pipelines (three-scope, privacy-preserving, cold start)
- Agent memory (unified read side across all flywheels)

**The compound moat:**
- Every tenant calculation improves that tenant's agents (Flywheel 1)
- Every tenant's structural patterns improve ALL tenants' agents (Flywheel 2)
- Every vertical's domain patterns improve that vertical's new customers (Flywheel 3)
- New domains deploy by adding a Domain Agent registration — no foundational changes
- The system gets faster, cheaper, and more accurate with every calculation run

---

*"The Domain Agent speaks its language. The Foundational Agent speaks math. The Calculation Intent is the contract. The Synaptic State is the nervous system. The Flywheels are the memory."*

*"No competitor has this. Not because they can't build agents — but because they can't unbuild millions of lines of deterministic code first."*

*OB-80 — February 22, 2026*
