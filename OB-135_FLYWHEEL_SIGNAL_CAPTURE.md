# OB-135: FLYWHEEL SIGNAL CAPTURE
## SCI Classification Signals + Weight Evolution Foundation + Cost Curve Infrastructure
## Date: 2026-03-02
## Type: Overnight Batch
## Estimated Duration: 12-16 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference (classification_signals table schema)
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — SCI architecture, Phase 4 flywheel requirements
4. `web/src/lib/sci/sci-types.ts` — SCI type definitions
5. `web/src/lib/sci/agents.ts` — agent scoring models + claim resolution
6. `web/src/lib/sci/content-profile.ts` — Content Profile generator
7. `web/src/app/api/import/sci/analyze/route.ts` — SCI analyze API
8. `web/src/app/api/import/sci/execute/route.ts` — SCI execute API

---

## WHAT THIS OB DOES

Implements Phase 4 of SCI: Flywheel Integration. Every SCI agent classification, every user confirmation, every user override, and every reconciliation outcome becomes a classification signal stored in Supabase. These signals are the ground truth that makes the three-scope flywheel measurable.

**After OB-135:**
1. Every SCI analyze call writes Level 1 classification signals (agent predictions + confidence)
2. Every SCI execute call (user confirmation) writes Level 1 outcome signals (accepted vs overridden)
3. Every reconciliation completion writes Level 2 convergence signals (plan interpretation accuracy proxy)
4. A weight evolution service reads accumulated signals and computes adjusted Tier 1 heuristic weights per tenant
5. A cost tracking service records AI API call counts per import, enabling cost curve measurement
6. The Observatory AI Intelligence Panel displays real metrics computed from real signals — zero hardcoded values

**What this does NOT do (deferred):**
- Cross-tenant foundational flywheel aggregation (needs 2+ tenants with signal history)
- Domain flywheel metrics (needs 5+ tenants)
- Automatic prompt enrichment from signals (Stage 1 enhancement — after measurement proves value)
- pgvector embeddings or fine-tuning (Stage 2+ maturity)
- Learned heuristic weight promotion (needs statistical significance threshold design)

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev --title "OB-135: Flywheel Signal Capture — SCI Classification Signals + Weight Evolution" --body "..."`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain vocabulary in signal capture infrastructure.** Korean Test applies to ALL new files.
8. **Classification Signal — NOT "Training Signal".** Decision 30 locked.
9. **We enrich prompts, not retrain models.** Terminology precision matters.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## CC FAILURE PATTERN WARNING

| # | Pattern | Risk | Mitigation |
|---|---------|------|------------|
| 19 | Domain vocabulary leak | Signal types named after ICM concepts ("commission_signal") | Korean Test on ALL signal types. Structural names only. |
| 20 | Hardcoded metrics | Display "94.2% accuracy" as a constant | Every metric computed from actual classification_signals rows |
| 22 | Mock data in production | Seed fake signals to make dashboard look good | Zero mock data. Empty states are honest states. |
| 25 | Enhance over rewrite | Rewriting signal service that already exists (OB-86) | Phase 0 diagnostic first — audit what OB-86 built |
| NEW | Signal capture breaks import flow | Errors in signal writing prevent import completion | Signal capture is fire-and-forget. try/catch every write. Import NEVER fails because signal capture fails. |
| NEW | Signal volume explosion | Writing 50 signals per field × 100 fields per file | One signal per content unit per agent (Round 1). One signal per user confirmation/override event. Not per field. |

---

## PHASE 0: DIAGNOSTIC — WHAT EXISTS TODAY

**Do not write ANY code until this phase is committed.**

### 0A: Audit existing signal capture infrastructure

```bash
echo "=== 0A: CLASSIFICATION_SIGNALS TABLE STATUS ==="
# Check if the table has any data
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { count } = await sb.from('classification_signals').select('*', { count: 'exact', head: true });
console.log('Total signals in DB:', count);
const { data } = await sb.from('classification_signals').select('signal_type, confidence').limit(10);
console.log('Sample signals:', JSON.stringify(data, null, 2));
"

echo ""
echo "=== 0B: EXISTING SIGNAL SERVICE ==="
# Does OB-86 signal service exist?
find web/src/lib/ai -name "*signal*" -o -name "*classification*" | sort
find web/src/lib/sci -name "*signal*" | sort

echo ""
echo "=== 0C: WHERE DO SCI AGENTS WRITE SCORES? ==="
grep -rn "captureSignal\|classificationSignal\|signal.*capture\|writeSignal" web/src/lib/sci/ web/src/app/api/import/sci/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== 0D: WHERE DOES USER CONFIRMATION HAPPEN? ==="
grep -rn "confirmedClassification\|executeProposal\|confirmImport\|handleConfirm" web/src/app/operate/import/ web/src/app/api/import/sci/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== 0E: EXISTING AI METRICS SERVICE ==="
find web/src/lib/ai -name "*metric*" | sort
find web/src/app/api/ai -name "*.ts" | sort

echo ""
echo "=== 0F: OBSERVATORY AI PANEL STATUS ==="
grep -rn "aiIntelligence\|AIIntelligence\|ai.*quality\|flywheel.*chart\|signal.*count" web/src/app/ --include="*.tsx" | head -15

echo ""
echo "=== 0G: RECONCILIATION SIGNAL OPPORTUNITIES ==="
grep -rn "reconcil.*result\|match.*rate\|delta.*zero\|100.*percent" web/src/app/operate/reconciliation/ web/src/lib/ --include="*.ts" --include="*.tsx" | head -15
```

### 0B: Document findings

```
PHASE 0 DIAGNOSTIC RESULTS
===========================
CLASSIFICATION_SIGNALS TABLE:
  Row count: [N]
  Signal types found: [list]
  
EXISTING SIGNAL SERVICE:
  OB-86 service location: [path or "NOT FOUND"]
  Methods available: [captureSignal, recordOutcome, etc. or "NONE"]
  
SCI SIGNAL CAPTURE:
  Agents write signals: [Y/N, locations]
  User confirmation captures signals: [Y/N, locations]
  
AI METRICS SERVICE:
  Exists: [Y/N]
  Computes from real data: [Y/N]
  
OBSERVATORY PANEL:
  AI Intelligence section exists: [Y/N]
  Displays real metrics: [Y/N] or hardcoded: [Y/N]

RECONCILIATION SIGNALS:
  Match rate available: [Y/N]
  
DECISION: 
  If OB-86 service exists → extend it to capture SCI signals
  If OB-86 service does not exist → create new service using classification_signals table
  If OB-86 metrics service exists → wire SCI signals into it
  If OB-86 metrics service does not exist → create minimal metrics computation
```

**Commit:** `OB-135 Phase 0: Signal capture infrastructure diagnostic`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Where and how to capture classification signals from SCI agent decisions
         and user confirmation/override events?

Option A: Extend OB-86 classification-signal-service.ts with SCI-specific signal types
  - Scale test: Works at 10x? YES — signals are individual inserts, not bulk
  - AI-first: Any hardcoding? NO — signal types are structural, not domain
  - Transport: Data through HTTP bodies? NO — signals written server-side during import
  - Atomicity: Clean state on failure? YES — signal capture is fire-and-forget, import succeeds regardless

Option B: Create new SCI-specific signal service in web/src/lib/sci/
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? NO
  - Transport: NO
  - Atomicity: YES
  - Risk: Dual signal services (Pattern 21 — dual code path)

Option C: Add signal capture directly into agents.ts and analyze/execute routes
  - Scale test: YES
  - AI-first: NO — entangles scoring with capture
  - Transport: NO
  - Atomicity: YES — but messy if capture fails
  - Risk: Violates single responsibility

CHOSEN: Option A if OB-86 service exists. Option B if it does not.
  Signal service is a shared utility. SCI agents call it, import flow calls it.
  Signal capture NEVER blocks import flow (try/catch, fire-and-forget).
  
REJECTED: Option C — mixing scoring logic with signal persistence violates
  single responsibility and makes testing harder.
```

**Commit:** `OB-135 Phase 1: Architecture decision — signal capture service extension`

---

## PHASE 2: SCI SIGNAL TYPE DEFINITIONS

### File: `web/src/lib/sci/sci-signal-types.ts`

Define the signal types that SCI generates. These map to the existing `classification_signals` table schema.

```typescript
// SCI Signal Types — Classification Signal definitions for SCI events
// Decision 30 — "Classification Signal" not "Training Signal"
// Korean Test — zero domain vocabulary

// ============================================================
// SIGNAL TYPE ENUM
// ============================================================

export type SCISignalType =
  | 'content_classification'        // Agent scored a content unit
  | 'content_classification_outcome' // User confirmed or overrided agent classification
  | 'field_binding'                  // Agent assigned semantic role to a field
  | 'field_binding_outcome'          // User confirmed or changed field binding
  | 'negotiation_round'             // Round 2 score adjustment (if OB-134 is merged)
  | 'processing_order'              // SCI determined processing order
  | 'convergence_outcome'           // Reconciliation match rate as plan interpretation proxy
  | 'cost_event'                    // AI API call made during import
  ;

// ============================================================
// SIGNAL PAYLOAD STRUCTURES
// ============================================================

export interface ContentClassificationSignal {
  signalType: 'content_classification';
  contentUnitId: string;
  sourceFile: string;
  tabName: string;
  agentScores: Array<{
    agent: string;           // 'plan' | 'entity' | 'target' | 'transaction'
    confidence: number;      // 0-1
    claimType: string;       // 'FULL' | 'PARTIAL' | 'NONE'
    topSignals: string[];    // what contributed to the score
  }>;
  winningAgent: string;
  winningConfidence: number;
  requiresHumanReview: boolean;
  round: number;             // 1 = independent, 2 = after negotiation
}

export interface ContentClassificationOutcomeSignal {
  signalType: 'content_classification_outcome';
  contentUnitId: string;
  predictedClassification: string;     // what the agent proposed
  confirmedClassification: string;     // what the user accepted
  wasOverridden: boolean;              // predicted !== confirmed
  predictionConfidence: number;        // original confidence
  overrideReason?: string;             // if user provided one
}

export interface FieldBindingSignal {
  signalType: 'field_binding';
  contentUnitId: string;
  sourceField: string;                 // customer vocabulary
  predictedSemanticRole: string;       // what the agent assigned
  predictedPlatformType: string;       // internal type mapping
  confidence: number;
  claimedBy: string;                   // which agent
}

export interface FieldBindingOutcomeSignal {
  signalType: 'field_binding_outcome';
  contentUnitId: string;
  sourceField: string;
  predictedSemanticRole: string;
  confirmedSemanticRole: string;
  wasOverridden: boolean;
  predictionConfidence: number;
}

export interface ConvergenceOutcomeSignal {
  signalType: 'convergence_outcome';
  planId: string;
  periodId: string;
  entityCount: number;
  matchRate: number;                   // 0-1 from reconciliation
  totalDelta: number;                  // absolute $ delta
  isExactMatch: boolean;              // delta === 0
}

export interface CostEventSignal {
  signalType: 'cost_event';
  eventType: 'ai_api_call';
  provider: string;                   // 'anthropic'
  model: string;                      // 'claude-sonnet-4-5-...'
  purpose: string;                    // 'plan_interpretation' | 'document_extraction' | 'field_disambiguation'
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
  importSequence: number;             // nth import for this tenant
}

// ============================================================
// SIGNAL CAPTURE INTERFACE
// ============================================================

export interface SCISignalCapture {
  tenantId: string;
  signal: ContentClassificationSignal 
        | ContentClassificationOutcomeSignal
        | FieldBindingSignal
        | FieldBindingOutcomeSignal
        | ConvergenceOutcomeSignal
        | CostEventSignal;
  entityId?: string;                  // optional — not all signals relate to entities
}
```

**Korean Test:** Zero domain vocabulary. No "compensation", "commission", "loan", "officer", "payout" in signal types. Only structural terms: content, field, binding, classification, convergence, cost.

**Commit:** `OB-135 Phase 2: SCI signal type definitions`

---

## PHASE 3: SIGNAL CAPTURE SERVICE

Create or extend the signal capture service that writes to the `classification_signals` table.

### Determine approach based on Phase 0 diagnostic:

**If OB-86 service exists at `web/src/lib/ai/classification-signal-service.ts`:**
- Import and extend it. Add SCI signal type support. Do NOT duplicate the service.
- Add a `captureSCISignal()` wrapper that maps SCISignalCapture → the existing service interface.

**If OB-86 service does NOT exist:**
- Create `web/src/lib/sci/signal-capture-service.ts`

### Service Requirements (apply to either approach):

```typescript
// Core function — maps SCI signals to classification_signals table
export async function captureSCISignal(capture: SCISignalCapture): Promise<string | null> {
  // Maps to classification_signals columns:
  //   tenant_id → capture.tenantId
  //   entity_id → capture.entityId (nullable)
  //   signal_type → capture.signal.signalType
  //   signal_value → JSON.stringify(capture.signal)  [the full signal payload]
  //   confidence → extract confidence from signal (varies by type)
  //   source → 'sci-v1'
  //   context → { importTimestamp: now, sciVersion: '1.0' }
  //
  // Returns: signal ID (uuid) on success, null on failure
  // CRITICAL: try/catch — NEVER throw. Signal capture failure must NOT block import.
}

// Batch capture — for efficiency when writing multiple signals at once
export async function captureSCISignalBatch(captures: SCISignalCapture[]): Promise<number> {
  // Batch insert to classification_signals
  // Returns: count of successfully written signals
  // Uses Supabase bulk insert (batch ≤ 200 per Standing Rule)
  // CRITICAL: try/catch — NEVER throw
}

// Record outcome — update a prediction signal with user's decision
export async function recordSCIOutcome(
  signalId: string,
  outcome: { confirmed: boolean; userValue?: string; overrideReason?: string }
): Promise<void> {
  // Updates the signal_value JSONB to include outcome
  // Or writes a new paired outcome signal (content_classification_outcome)
  // CRITICAL: try/catch — NEVER throw
}

// Query signals for metrics — used by Observatory and analytics
export async function getSignalsByTenant(
  tenantId: string,
  options?: { signalType?: string; limit?: number; after?: string }
): Promise<Array<{ id: string; signal_type: string; signal_value: any; confidence: number; created_at: string }>> {
  // Read from classification_signals with RLS
  // Returns empty array on failure, not throw
}

// Compute accuracy for a signal type
export async function computeAccuracy(
  tenantId: string,
  signalType: string
): Promise<{ total: number; correct: number; accuracy: number; overrideRate: number } | null> {
  // Count outcome signals where wasOverridden = false (correct) vs true (override)
  // Returns null if no signals exist (honest empty state)
}

// Compute flywheel trend — confidence over sequential imports
export async function computeFlywheelTrend(
  tenantId: string
): Promise<Array<{ importSequence: number; avgConfidence: number; accuracy: number }> | null> {
  // Group signals by import sequence (chronological order)
  // Compute average confidence and accuracy per import
  // Returns null if < 2 imports (need at least 2 points for a trend)
}

// Compute cost curve — AI API costs over sequential imports
export async function computeCostCurve(
  tenantId: string
): Promise<Array<{ importSequence: number; totalCostUSD: number; apiCalls: number }> | null> {
  // Group cost_event signals by import sequence
  // Returns null if no cost events
}
```

### CRITICAL REQUIREMENTS:

1. **Fire-and-forget.** Every capture function uses try/catch. Returns null/0/empty on failure. NEVER throws.
2. **Use existing table.** `classification_signals` already exists in Supabase (see SCHEMA_REFERENCE.md). Do NOT create a new table.
3. **Supabase service role** for writes. Standard RLS for reads.
4. **Tenant isolation.** All signals scoped by tenant_id. Cross-tenant queries only for VL Admin.
5. **No mock data.** Zero hardcoded signal values. Empty array = no signals yet.
6. **Korean Test.** Zero domain vocabulary in signal types or service code.

**Tests:** Create `web/scripts/ob135-test-signal-capture.ts`:
- Test 1: Write a content_classification signal → returns UUID
- Test 2: Write a content_classification_outcome signal → returns UUID
- Test 3: Write a cost_event signal → returns UUID
- Test 4: Batch write 5 signals → returns 5
- Test 5: computeAccuracy with no signals → returns null
- Test 6: computeAccuracy with signals → returns computed values
- Test 7: getSignalsByTenant filters by type correctly
- Test 8: Signal capture failure → returns null, does NOT throw

**Commit:** `OB-135 Phase 3: Signal capture service — fire-and-forget writes to classification_signals`

---

## PHASE 4: WIRE SIGNALS INTO SCI ANALYZE

Wire signal capture into the SCI analyze API so every agent classification is recorded.

### File: `web/src/app/api/import/sci/analyze/route.ts`

**WHERE to capture (after agent scoring, before returning proposal):**

```typescript
// AFTER agents score all content units
// AFTER claim resolution (Round 1 or Round 2)
// BEFORE returning the proposal to the client

// For each content unit in the proposal:
for (const unit of proposal.contentUnits) {
  await captureSCISignal({
    tenantId: proposal.tenantId,
    signal: {
      signalType: 'content_classification',
      contentUnitId: unit.contentUnitId,
      sourceFile: unit.sourceFile,
      tabName: unit.tabName,
      agentScores: unit.allScores.map(s => ({
        agent: s.agent,
        confidence: s.confidence,
        claimType: s.claimType || 'FULL',
        topSignals: s.signals?.slice(0, 3) || [],
      })),
      winningAgent: unit.classification,
      winningConfidence: unit.confidence,
      requiresHumanReview: unit.allScores.length >= 2 && 
        (unit.allScores[0].confidence - unit.allScores[1].confidence) < 0.10,
      round: /* 1 if Phase 1 scoring, 2 if OB-134 negotiation is active */,
    },
  });
  
  // Field-level signals (one per field binding, not per field)
  // Group to avoid signal explosion: one signal per content unit with all bindings
  await captureSCISignal({
    tenantId: proposal.tenantId,
    signal: {
      signalType: 'field_binding',
      contentUnitId: unit.contentUnitId,
      sourceField: '[grouped]',
      predictedSemanticRole: '[grouped]',
      predictedPlatformType: '[grouped]',
      confidence: unit.confidence,
      claimedBy: unit.classification,
    },
  });
}
```

**IMPORTANT:** Do not capture 50 individual field_binding signals for a 50-column file. Capture ONE content_classification signal per content unit (with all agent scores inside it) and ONE grouped field_binding signal per content unit (with binding summary in signal_value JSONB). The detailed field bindings live in the proposal — the signal captures the aggregate confidence and claim type.

### Signal volume budget per import:
- Content classification: 1 signal per tab (a 5-tab file = 5 signals)
- Field binding: 1 signal per tab (grouped)
- Total for a typical 3-tab file: ~6 Level 1 signals

**Commit:** `OB-135 Phase 4: Wire signal capture into SCI analyze API`

---

## PHASE 5: WIRE SIGNALS INTO SCI EXECUTE (USER CONFIRMATION)

Wire signal capture into the SCI execute API so every user confirmation/override is recorded.

### File: `web/src/app/api/import/sci/execute/route.ts`

**WHERE to capture (at execution time, when user has confirmed the proposal):**

```typescript
// For each content unit in the execution request:
for (const unit of request.contentUnits) {
  // Retrieve the original proposal to compare
  // The confirmedClassification may differ from the proposal's classification
  
  await captureSCISignal({
    tenantId: request.tenantId,
    signal: {
      signalType: 'content_classification_outcome',
      contentUnitId: unit.contentUnitId,
      predictedClassification: /* original from proposal */,
      confirmedClassification: unit.confirmedClassification,
      wasOverridden: unit.confirmedClassification !== /* original */,
      predictionConfidence: /* original confidence */,
    },
  });
  
  // Field binding outcomes — check if user changed any bindings
  for (const binding of unit.confirmedBindings) {
    const originalBinding = /* find in original proposal */;
    if (originalBinding && originalBinding.semanticRole !== binding.semanticRole) {
      await captureSCISignal({
        tenantId: request.tenantId,
        signal: {
          signalType: 'field_binding_outcome',
          contentUnitId: unit.contentUnitId,
          sourceField: binding.sourceField,
          predictedSemanticRole: originalBinding.semanticRole,
          confirmedSemanticRole: binding.semanticRole,
          wasOverridden: true,
          predictionConfidence: originalBinding.confidence,
        },
      });
    }
  }
}
```

### Proposal retrieval strategy:

The execute endpoint needs access to the original proposal to determine what was overridden. Two approaches:

**Approach A (preferred):** The proposal is stored in-memory or passed in the execution request. The SCIExecutionRequest already contains `confirmedClassification` and `confirmedBindings`. Add the original prediction values from the proposal.

**Approach B (fallback):** Store the proposal temporarily in Supabase (or in the content_classification signal's signal_value). Retrieve it during execution to compare.

Choose the approach that requires the least new infrastructure. If the original proposal values are already available in the execution flow, use them directly.

**Commit:** `OB-135 Phase 5: Wire signal capture into SCI execute — outcome recording`

---

## PHASE 6: WIRE SIGNALS INTO AI API CALLS (COST TRACKING)

Wire cost event signals into every place the platform makes an Anthropic API call during import.

### Identify AI API call points:

```bash
echo "=== FIND ALL ANTHROPIC API CALLS ==="
grep -rn "anthropic\|claude\|messages\.create\|api\.anthropic\|ANTHROPIC_API" web/src/lib/ web/src/app/api/ --include="*.ts" | grep -v node_modules | head -30
```

### For each AI API call site:

```typescript
// After the API call returns successfully:
const startTime = Date.now();
const response = await anthropicClient.messages.create({ ... });
const duration = Date.now() - startTime;

// Capture cost signal
await captureSCISignal({
  tenantId,
  signal: {
    signalType: 'cost_event',
    eventType: 'ai_api_call',
    provider: 'anthropic',
    model: response.model || 'claude-sonnet-4-5',
    purpose: /* 'plan_interpretation' | 'document_extraction' | 'field_disambiguation' */,
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
    estimatedCostUSD: computeEstimatedCost(response.usage),
    importSequence: /* get import count for this tenant */,
  },
});
```

### Cost estimation helper:

```typescript
// Approximate cost computation — updated when pricing changes
function computeEstimatedCost(usage: { input_tokens?: number; output_tokens?: number }): number {
  // Sonnet 4.5 pricing as of March 2026 (approximate)
  // These values are intentionally soft — used for trend analysis, not billing
  const INPUT_COST_PER_1K = 0.003;
  const OUTPUT_COST_PER_1K = 0.015;
  const inputCost = ((usage?.input_tokens || 0) / 1000) * INPUT_COST_PER_1K;
  const outputCost = ((usage?.output_tokens || 0) / 1000) * OUTPUT_COST_PER_1K;
  return Math.round((inputCost + outputCost) * 10000) / 10000; // 4 decimal places
}
```

**NOTE:** Cost figures are approximate and used for trend analysis ("costs are decreasing with usage"). They are NOT used for billing. The goal is to show that the 10th import costs less than the 1st import as heuristics handle more classifications.

**Commit:** `OB-135 Phase 6: Wire cost event signals into AI API calls`

---

## PHASE 7: WIRE SIGNALS INTO RECONCILIATION

Wire convergence outcome signals into the reconciliation flow so plan interpretation accuracy has a feedback loop.

### File: Reconciliation results handler (find the location in Phase 0)

**WHERE to capture (after reconciliation comparison completes):**

```typescript
// After reconciliation computes match rate and delta:
await captureSCISignal({
  tenantId,
  signal: {
    signalType: 'convergence_outcome',
    planId: plan.id,
    periodId: period.id,
    entityCount: results.length,
    matchRate: matchingEntities / totalEntities,
    totalDelta: Math.abs(vlTotal - benchmarkTotal),
    isExactMatch: Math.abs(vlTotal - benchmarkTotal) < 0.01,
  },
});
```

This signal is the most valuable in the system. A 100% reconciliation match rate validates that the entire chain — plan interpretation → field binding → convergence → calculation — worked correctly. It's Level 2 (comprehension) ground truth.

**Commit:** `OB-135 Phase 7: Wire convergence outcome signals into reconciliation`

---

## PHASE 8: WEIGHT EVOLUTION FOUNDATION

Create the infrastructure for heuristic weight adjustment based on accumulated signals. This phase does NOT automatically adjust weights — it computes what the adjusted weights WOULD be and stores them for future use.

### File: `web/src/lib/sci/weight-evolution-service.ts`

```typescript
// Weight Evolution Service — computes adjusted agent heuristic weights
// from accumulated classification signals
//
// This is READ-ONLY analysis. It does not modify agent behavior.
// Weight promotion requires manual review + decision.

export interface WeightEvolution {
  tenantId: string;
  computedAt: string;
  importCount: number;           // how many imports contributed
  signalCount: number;           // total classification signals analyzed
  currentWeights: AgentWeights;  // the weights currently in agents.ts
  suggestedWeights: AgentWeights; // what the signals suggest
  confidence: number;            // 0-1, how confident are we in the suggestion
  reasoning: string;             // human-readable explanation
}

interface AgentWeights {
  // Mirror the weight structure from agents.ts
  // Each agent has named signals with numeric weights
  [agentType: string]: { [signalName: string]: number };
}

export async function computeWeightEvolution(tenantId: string): Promise<WeightEvolution | null> {
  // 1. Retrieve all content_classification and content_classification_outcome signals
  // 2. For each signal where the agent was overridden:
  //    - Identify which signal contributed most to the wrong classification
  //    - Compute a weight adjustment (reduce by override frequency)
  // 3. For each signal where the agent was confirmed:
  //    - Identify which signals contributed most to the correct classification
  //    - Compute a weight boost (increase by confirmation frequency)
  // 4. Require minimum 5 imports before suggesting any weight changes
  // 5. Cap weight adjustments at ±20% of current weight
  // 6. Return the analysis — do NOT write to any config
  
  // Returns null if < 5 imports (insufficient data)
}
```

**IMPORTANT:** This service is analytical only. It answers: "If we adjusted the weights based on what users have confirmed/overridden, what would the new weights look like?" The actual weight change requires a human decision (Andrew) and a code change. This follows the "Human Authority" principle.

**Tests:** Create `web/scripts/ob135-test-weight-evolution.ts`:
- Test 1: < 5 imports → returns null
- Test 2: All confirmations → suggested weights ≈ current weights (system is already calibrated)
- Test 3: Consistent override pattern → suggested weights shift away from the failing signal

**Commit:** `OB-135 Phase 8: Weight evolution foundation — analytical, read-only`

---

## PHASE 9: OBSERVATORY WIRING

Wire real signal data into the Observatory AI Intelligence Panel. If OB-86 built this panel, enhance it. If not, add a minimal panel.

### Approach: Enhance what exists (Pattern 25 — enhance over rewrite)

Run Phase 0 diagnostic output to determine what the Observatory currently shows. Then:

**If Observatory AI Intelligence Panel EXISTS:**
- Replace any hardcoded/mock metrics with calls to `computeAccuracy()` and `computeFlywheelTrend()`
- Add cost curve visualization from `computeCostCurve()`
- Ensure empty states say "Import data to begin intelligence measurement"

**If Observatory AI Intelligence Panel does NOT EXIST:**
- Add a section to the Observatory page with 4 metric cards:
  1. **Classification Accuracy** — `computeAccuracy(tenantId, 'content_classification_outcome')`
  2. **Signal Count** — total classification signals for this tenant
  3. **Override Rate** — percentage of user overrides
  4. **Import Cost Trend** — direction arrow (↑ stable ↓) from cost curve

### Metrics API Route

Create or verify: `web/src/app/api/ai/metrics/route.ts`

```typescript
// GET /api/ai/metrics?tenantId=xxx
// Returns: {
//   accuracy: { total, correct, accuracy, overrideRate } | null,
//   flywheelTrend: [...] | null,
//   costCurve: [...] | null,
//   signalCount: number,
//   lastSignalAt: string | null,
// }
```

### Empty state requirements:
- No signals → "Import data to begin intelligence measurement"
- < 2 imports → "Complete more imports to see trends"
- Zero hardcoded values anywhere in the AI metrics panel

**Commit:** `OB-135 Phase 9: Observatory AI Intelligence Panel — real metrics from real signals`

---

## PHASE 10: REGRESSION VERIFICATION

### 10A: LAB Regression

```bash
echo "=== LAB REGRESSION CHECK ==="
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';
const { data, count } = await sb.from('calculation_results').select('total_payout', { count: 'exact' }).eq('tenant_id', LAB);
const total = data?.reduce((sum, r) => sum + Number(r.total_payout), 0);
console.log('LAB results:', count, 'Total:', total?.toFixed(2));
console.log('Expected: 268 results, \$8,498,311.77');
console.log('PASS:', count === 268 && Math.abs(total - 8498311.77) < 0.01 ? 'YES' : 'NO');
"
```

### 10B: MBC Regression

```bash
echo "=== MBC REGRESSION CHECK ==="
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MBC = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';
const { data, count } = await sb.from('calculation_results').select('total_payout', { count: 'exact' }).eq('tenant_id', MBC);
const total = data?.reduce((sum, r) => sum + Number(r.total_payout), 0);
console.log('MBC results:', count, 'Total:', total?.toFixed(2));
console.log('Expected: 240 results, \$3,245,212.66');
console.log('PASS:', count === 240 && Math.abs(total - 3245212.66) < 0.01 ? 'YES' : 'NO');
"
```

### 10C: Signal capture verification

```bash
echo "=== SIGNAL CAPTURE STATUS ==="
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await sb.from('classification_signals')
  .select('signal_type, confidence, created_at')
  .order('created_at', { ascending: false })
  .limit(10);
console.log('Recent signals:', JSON.stringify(data, null, 2));
const { count } = await sb.from('classification_signals').select('*', { count: 'exact', head: true });
console.log('Total signal count:', count);
"
```

### 10D: Build + localhost

```bash
cd web && npm run build
# Must exit 0

npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Must return 200
```

**Commit:** `OB-135 Phase 10: Regression verification — LAB + MBC + signals + build`

---

## PHASE 11: COMPLETION REPORT + PR

### Completion Report

Save as `OB-135_COMPLETION_REPORT.md` in PROJECT ROOT:

1. **Phase 0 diagnostic** — what signal infrastructure existed before OB-135
2. **Signal types defined** — list all SCISignalType values
3. **Signal capture service** — how signals are captured, where wired, fire-and-forget proof
4. **SCI analyze wiring** — signals written on every agent classification
5. **SCI execute wiring** — outcome signals written on every user confirmation/override
6. **AI cost tracking** — cost events captured on every API call
7. **Reconciliation wiring** — convergence outcome signals on every reconciliation
8. **Weight evolution** — analytical service exists, returns null < 5 imports
9. **Observatory** — AI Intelligence Panel shows real metrics or honest empty states
10. **Regression** — LAB $8,498,311.77, MBC $3,245,212.66
11. **Signal count** — how many signals now in DB
12. **Sample signal** — one actual signal JSON from Supabase
13. **All proof gates** — PASS/FAIL with pasted evidence

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-135: Flywheel Signal Capture — SCI Classification Signals + Weight Evolution Foundation" \
  --body "## What This Builds

### Classification Signal Capture (SCI)
- Every agent classification → content_classification signal
- Every user confirmation/override → content_classification_outcome signal
- Every reconciliation → convergence_outcome signal
- Every AI API call → cost_event signal
- All signals fire-and-forget — import NEVER fails due to signal capture

### Weight Evolution Foundation
- Analytical service computes what adjusted weights would look like
- Read-only — no automatic weight changes
- Requires 5+ imports before suggesting adjustments
- Human Authority principle: Andrew approves any weight change

### Observatory AI Intelligence Panel
- Classification accuracy from real signals
- Override rate from real signals
- Cost curve trend
- Honest empty states — zero hardcoded metrics

### Cost Curve Infrastructure
- Token usage and estimated cost per AI API call
- Grouped by import sequence
- Trend visualization: does the 10th import cost less than the 1st?

## Regression: LAB \$8,498,311.77 (268), MBC \$3,245,212.66 (240)
## Proof Gates: see OB-135_COMPLETION_REPORT.md"
```

**Commit:** `OB-135 Phase 11: Completion report + PR`

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Build exits 0 | `npm run build` clean |
| PG-02 | Signal type definitions exist | `sci-signal-types.ts` exports all 7 signal types |
| PG-03 | Signal capture service exists | `captureSCISignal()` function operational |
| PG-04 | Fire-and-forget proven | Signal capture failure does NOT block import (test evidence) |
| PG-05 | SCI analyze writes signals | Import a file → content_classification signals appear in DB |
| PG-06 | SCI execute writes outcome signals | Confirm import → content_classification_outcome signals appear |
| PG-07 | Cost events captured | AI API call → cost_event signal with token counts |
| PG-08 | Reconciliation writes convergence signals | Run reconciliation → convergence_outcome signal appears |
| PG-09 | computeAccuracy returns real data | With signals: returns computed values. Without: returns null |
| PG-10 | computeFlywheelTrend works | With 2+ imports: returns trend array. With < 2: returns null |
| PG-11 | computeCostCurve works | With cost events: returns curve. Without: returns null |
| PG-12 | Weight evolution returns null < 5 imports | Analytical service respects minimum threshold |
| PG-13 | Observatory shows real metrics or empty state | No hardcoded values — grep confirms |
| PG-14 | Zero hardcoded metric values | `grep -rn "94\.\|91\.\|97\.\|88\." web/src/ --include="*.tsx"` in AI metrics returns 0 |
| PG-15 | Classification Signal terminology | Zero instances of "Training Signal" in new code |
| PG-16 | Korean Test | Zero domain vocabulary in `web/src/lib/sci/` signal files |
| PG-17 | LAB regression | 268 results, $8,498,311.77 ± $0.01 |
| PG-18 | MBC regression | 240 results, $3,245,212.66 ± $0.01 |
| PG-19 | localhost:3000 responds | HTTP 200 |
| PG-20 | Signal count > 0 after test import | At least one signal written to classification_signals |

---

## WHAT OB-135 DOES NOT BUILD

- Cross-tenant foundational flywheel aggregation (needs 2+ active tenants)
- Domain flywheel metrics (needs 5+ tenants in same vertical)
- Automatic prompt enrichment from signals (Stage 1 enhancement — after measurement proves value)
- pgvector embeddings or ML model training (Stage 2+)
- Automatic weight promotion (needs statistical significance design + human approval workflow)
- Tier 3 ML confidence resolution (needs sufficient signal volume)
- Import sequence counter (use signal timestamp ordering as proxy)

---

## SCOPE CONTROL

**If any phase takes more than 2× its expected time, STOP and report what's blocking.**

Expected durations:
- Phase 0: 10 min (read-only diagnostic)
- Phase 1: 5 min (architecture decision)
- Phase 2: 15 min (type definitions)
- Phase 3: 30 min (signal capture service)
- Phase 4: 20 min (SCI analyze wiring)
- Phase 5: 20 min (SCI execute wiring)
- Phase 6: 20 min (cost tracking)
- Phase 7: 10 min (reconciliation wiring)
- Phase 8: 20 min (weight evolution)
- Phase 9: 30 min (Observatory)
- Phase 10: 15 min (regression)
- Phase 11: 15 min (report + PR)

**Total: ~3.5 hours. If approaching 5 hours, something is wrong.**

---

## WHAT SUCCESS LOOKS LIKE

After OB-135, the flywheel has a pulse. Every import generates classification signals. Every user confirmation generates outcome signals. Every reconciliation generates convergence signals. Every AI call generates cost signals. The Observatory shows real numbers — accuracy, override rate, cost trend — computed from actual data. The weight evolution service can tell you: "Based on 10 imports, here's how the agent weights should change." The system is measuring itself.

The next import is smarter than the last — not because the AI model changed, but because the prompts are enriched with accumulated pattern memory. And now we can prove it.

---

*OB-135 — March 2, 2026*
*"The flywheel starts with the first signal."*
*"If you can't measure it, you can't prove it. If you can't prove it, it's not a feature — it's a story."*
