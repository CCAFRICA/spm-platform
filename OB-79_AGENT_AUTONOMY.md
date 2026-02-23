# OB-79: RECONCILIATION AGENT + INSIGHT AGENT + RESOLUTION AGENT
## Tier 2: Agent Autonomy — Agents Do What Humans Currently Do Manually

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Calculation_Intent_Specification.md` — the Intent vocabulary
4. `Vialuce_Synaptic_State_Specification.md` — the Synaptic State protocol
5. `OB-78_COMPLETION_REPORT.md` — Synaptic State foundation results
6. `OB-77_COMPLETION_REPORT.md` — training signals, execution traces
7. `OB-76_COMPLETION_REPORT.md` — Intent executor, execution trace structure

**Read all seven before writing any code.**

---

## WHAT THIS OB BUILDS

Three Foundational Agents that close the loop between calculation, verification, and resolution. They share the Synaptic Surface and their value comes from how they interact:

1. **Reconciliation Agent** — Compares execution traces against benchmark data. Produces structured findings. Writes correction synapses that backpropagate to the next calculation run. The system self-corrects.

2. **Insight Agent** — Lightweight synaptic consumer during calculation. Post-run prescriptive analysis. Moves from "here's what happened" to "here's what to do about it." Persona-aware: Admin sees governance, Manager sees coaching, Rep sees growth.

3. **Resolution Agent** — Traces disputed payouts through execution traces. Identifies root cause (data error, logic error, interpretation ambiguity). Recommends resolution with evidence and confidence score. Feeds resolution patterns back as training signals.

**After OB-79, the platform doesn't just calculate payouts — it verifies them, explains them, and resolves disputes about them. All three agents read from and write to the Synaptic Surface.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain language in Foundational Agent code.** These three agents are Foundational — they work in structural language. They don't know they're processing compensation.
8. Domain language acceptable in: Domain Agent code (ai-plan-interpreter.ts), training signal labels, UI display strings only.
9. **Scale test every feature: would this work for 150K entities?**
10. **No per-entity Supabase calls during calculation loop.** Batch all DB operations.
11. **No per-entity LLM calls.** AI analysis runs post-calculation on aggregated data, never per-entity in the loop.
12. **All three agents consume/produce synapses.** The Synaptic Surface is their communication substrate.

---

## PHASE 0: DIAGNOSTIC — READ BEFORE ANY CODE

### 0A: Read the Synaptic State infrastructure from OB-78

```bash
echo "=== SYNAPTIC STATE FILES ==="
cat web/src/lib/calculation/synaptic-types.ts | head -80
echo "---"
cat web/src/lib/calculation/synaptic-surface.ts | head -80
echo "---"
cat web/src/lib/calculation/synaptic-density.ts | head -80
echo "---"
cat web/src/lib/calculation/anomaly-detector.ts | head -80
echo "---"
cat web/src/lib/calculation/pattern-signature.ts | head -80
```

### 0B: Read existing reconciliation, assessment, and dispute code

```bash
echo "=== EXISTING RECONCILIATION ==="
find web/src -path "*reconcil*" -name "*.ts" -o -path "*reconcil*" -name "*.tsx" | sort
grep -rn "reconcil\|comparison\|benchmark\|adaptive" web/src/lib/ --include="*.ts" | head -20

echo ""
echo "=== EXISTING AI ASSESSMENT ==="
find web/src -path "*assessment*" -name "*.ts" -o -path "*assessment*" -name "*.tsx" | sort
grep -rn "generateAssessment\|AIService\|aiService" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== EXISTING DISPUTES ==="
find web/src -path "*dispute*" -name "*.ts" -o -path "*dispute*" -name "*.tsx" | sort
grep -rn "disputes" web/src/app/api/ --include="*.ts" | head -10

echo ""
echo "=== EXISTING ANOMALY DETECTION ==="
grep -rn "detectAnomalies\|anomaly" web/src/lib/ --include="*.ts" | head -15
```

### 0C: Read execution trace structure from OB-76/77

```bash
echo "=== EXECUTION TRACE SHAPE ==="
grep -rn "ExecutionTrace\|intentTraces\|trace" web/src/lib/calculation/intent-types.ts | head -20

echo ""
echo "=== HOW TRACES ARE STORED ==="
grep -rn "intentTraces\|metadata\.intent" web/src/app/api/calculation/ --include="*.ts" | head -10

echo ""
echo "=== EXECUTION TRACE VIEW (OB-77) ==="
cat web/src/components/forensics/ExecutionTraceView.tsx | head -60
```

### 0D: Read current calculation route (with Synaptic State from OB-78)

```bash
echo "=== CALCULATION ROUTE — SYNAPTIC WIRING ==="
cat web/src/app/api/calculation/run/route.ts | head -120

echo ""
echo "=== SYNAPTIC SURFACE USAGE ==="
grep -n "surface\|synapse\|density\|writeSynapse\|consolidate" web/src/app/api/calculation/run/route.ts
```

### 0E: Check classification_signals and disputes tables

```bash
echo "=== CLASSIFICATION SIGNALS SHAPE ==="
grep -rn "classification_signals" web/src/ --include="*.ts" | head -10

echo ""
echo "=== DISPUTES TABLE ==="
grep -rn "disputes" web/src/ --include="*.ts" | grep "from(" | head -10
```

**Commit:** `OB-79 Phase 0: Diagnostic — existing agents, traces, synaptic state, disputes`

---

## PHASE 1: ARCHITECTURE DECISIONS

```
ARCHITECTURE DECISION RECORD — OB-79
=====================================

DECISION 1: Where do these agents live in the codebase?

  Option A: Single file per agent in src/lib/agents/
    - reconciliation-agent.ts, insight-agent.ts, resolution-agent.ts
    Pro: Clean organization, discoverable
    Con: New directory

  Option B: In src/lib/calculation/ alongside existing calculation code
    Pro: Close to the data they consume
    Con: Pollutes calculation directory

  CHOSEN: Option A — src/lib/agents/ directory. Agents are distinct from calculation.
  Each agent has a clear responsibility and interface.

DECISION 2: How do agents interact with the Synaptic Surface?

  All three agents receive the SynapticSurface as a parameter (same as Calculation Agent in OB-78).
  - Reconciliation Agent: reads confidence synapses, writes correction synapses
  - Insight Agent: reads anomaly + pattern synapses, writes insight synapses
  - Resolution Agent: reads all synapses for a disputed entity, writes resolution synapses

  Agents do NOT communicate directly. They communicate THROUGH the surface.
  This is the Synaptic State protocol — shared state, not message-passing.

DECISION 3: When do agents run?

  - Reconciliation Agent: POST-CALCULATION. Triggered after calculation completes.
    Runs on the consolidated surface. Compares results against benchmark if available.
    NOT in the per-entity loop.

  - Insight Agent: DUAL-MODE.
    (a) Lightweight consumer DURING calculation — reads synaptic stats (anomaly rate,
        confidence mean) and writes insight synapses if thresholds crossed.
        This is the only agent that operates within the calculation loop, but it
        reads aggregated stats, not per-entity data. O(1) per check, not O(n).
    (b) Full analysis POST-CALCULATION — AI-powered prescriptive analysis using
        the consolidated surface + calculation results. One LLM call per run maximum.

  - Resolution Agent: ON-DEMAND. Triggered when a dispute is filed or reviewed.
    Reads execution traces for the disputed entity. Reads synaptic history.
    One LLM call per dispute maximum.

DECISION 4: How does the Reconciliation Agent get benchmark data?

  Option A: Upload benchmark file through existing import pipeline
    Pro: Reuses existing infrastructure
    Con: Needs differentiation between "data import" and "benchmark import"

  Option B: Dedicated reconciliation upload (separate API route)
    Pro: Clean separation
    Con: Duplicate upload logic

  CHOSEN: Option A with tagging — import_batches.metadata includes
  { purpose: 'benchmark', linked_batch_id: '<calculation_batch_id>' }.
  The reconciliation agent reads committed_data where batch purpose = 'benchmark'.

DECISION 5: How does the Insight Agent avoid hallucination (AP-18)?

  The Insight Agent NEVER fabricates data. Its AI prompt includes:
  - Actual numbers from calculation_results (aggregated, not per-entity)
  - Synaptic surface stats (anomaly rate, confidence mean, mode distribution)
  - Pattern synapse summaries (what structural patterns were detected)
  - STRICT instruction: "If you don't have data for a claim, say so. Never invent numbers."
  - Output is structured JSON, not free text. Each insight has a data_source field.

DECISION 6: What structural vocabulary do these agents speak?

  | Domain Concept | Foundational Concept (used in agent code) |
  |---|---|
  | Reconciliation gap | Discrepancy magnitude |
  | False green | Offset compensation — total matches but details diverge |
  | Dispute | Contested outcome |
  | Resolution | Evidence-based adjustment recommendation |
  | Coaching agenda | Prescriptive action set |
  | Anomaly | Statistical deviation from expected pattern |
  | Root cause | Trace-derived origin classification |
```

**Commit:** `OB-79 Phase 1: Architecture decisions — agent organization, synaptic interaction, timing`

---

## MISSION 1: RECONCILIATION AGENT

### 1A: Create src/lib/agents/reconciliation-agent.ts

The Reconciliation Agent compares calculation results against benchmark data and produces structured findings. It operates entirely in structural language.

```typescript
export interface ReconciliationInput {
  tenantId: string;
  batchId: string;                    // calculation batch to verify
  benchmarkData: BenchmarkRecord[];    // external reference data
  executionTraces: Map<string, ExecutionTrace[]>;  // from calculation
  surface: SynapticSurface;           // shared state
}

export interface BenchmarkRecord {
  entityExternalId: string;           // match key
  componentIndex: number;
  expectedOutcome: number;
  metadata?: Record<string, unknown>;
}

export interface ReconciliationFinding {
  entityId: string;
  entityExternalId: string;
  componentIndex: number;
  calculatedOutcome: number;
  expectedOutcome: number;
  delta: number;                      // absolute difference
  deltaPercent: number;               // percentage difference
  classification: DiscrepancyClass;
  confidence: number;                 // how confident in the classification
  traceEvidence: TraceEvidence;       // what the execution trace shows
  synapticContext: SynapticContext;    // what the synaptic surface says
}

export type DiscrepancyClass =
  | 'match'                    // within tolerance (configurable, default ±$0.01)
  | 'rounding'                 // < $1 difference, systematic pattern
  | 'data_divergence'          // input data differs between systems
  | 'logic_divergence'         // same inputs, different outputs (rule interpretation)
  | 'scope_mismatch'           // different entities included in each dataset
  | 'temporal_mismatch'        // data from different time windows
  | 'offset_compensation'      // "false green" — total matches, details don't
  | 'unclassified';            // needs human review

export interface ReconciliationReport {
  batchId: string;
  timestamp: string;
  entityCount: { calculated: number; benchmark: number; matched: number; unmatched: number };
  totalOutcome: { calculated: number; benchmark: number; delta: number; deltaPercent: number };
  findings: ReconciliationFinding[];
  classifications: Record<DiscrepancyClass, number>;  // count per class
  synapticDensityImpact: Array<{ signature: string; confidenceAdjustment: number }>;
  falseGreenDetected: boolean;
  correctionSynapses: Synapse[];      // written to surface for next run
}

export async function reconcile(input: ReconciliationInput): Promise<ReconciliationReport> {
  // 1. Match entities between calculated and benchmark (by external_id)
  // 2. Compare per-entity, per-component outcomes
  // 3. Classify each discrepancy using trace evidence
  // 4. Detect false greens (total within tolerance but components diverge)
  // 5. Write correction synapses to surface
  // 6. Calculate density impact (discrepancies lower confidence)
  // 7. Produce structured report
}
```

### 1B: Classification logic

The classification engine is deterministic (no LLM). It uses the execution trace to determine WHY outcomes differ:

```typescript
function classifyDiscrepancy(
  calculated: number,
  expected: number,
  trace: ExecutionTrace,
  surface: SynapticSurface
): { classification: DiscrepancyClass; confidence: number; evidence: TraceEvidence } {
  const delta = Math.abs(calculated - expected);
  const deltaPercent = expected !== 0 ? (delta / Math.abs(expected)) * 100 : (delta === 0 ? 0 : 100);
  
  // Tolerance check
  if (delta <= 0.01) return { classification: 'match', confidence: 1.0, evidence: { reason: 'within_tolerance' } };
  
  // Rounding pattern (< $1, common in legacy system comparisons)
  if (delta < 1.0) return { classification: 'rounding', confidence: 0.9, evidence: { reason: 'sub_dollar_variance' } };
  
  // Check trace for input differences
  // If the trace shows the input values differ from what benchmark implies → data_divergence
  
  // Check if entity is missing from one dataset → scope_mismatch
  
  // If inputs match but outputs differ → logic_divergence (rule interpretation)
  
  // Default
  return { classification: 'unclassified', confidence: 0.3, evidence: { reason: 'manual_review_needed' } };
}
```

### 1C: False green detection

```typescript
function detectFalseGreens(findings: ReconciliationFinding[]): boolean {
  // Total delta within tolerance but component-level deltas are large and offsetting
  const totalCalculated = findings.reduce((s, f) => s + f.calculatedOutcome, 0);
  const totalExpected = findings.reduce((s, f) => s + f.expectedOutcome, 0);
  const totalDelta = Math.abs(totalCalculated - totalExpected);
  
  const componentDeltas = findings.filter(f => f.classification !== 'match');
  const sumAbsDeltas = componentDeltas.reduce((s, f) => s + Math.abs(f.delta), 0);
  
  // If total looks fine but individual components have large offsetting errors
  return totalDelta < 1.0 && sumAbsDeltas > 100;
}
```

### 1D: Correction synapse generation

When the Reconciliation Agent finds discrepancies, it writes correction synapses to the surface. These backpropagate: the next calculation run reads correction synapses and adjusts behavior.

```typescript
function generateCorrectionSynapses(findings: ReconciliationFinding[], surface: SynapticSurface): Synapse[] {
  const corrections: Synapse[] = [];
  
  for (const finding of findings) {
    if (finding.classification === 'match' || finding.classification === 'rounding') continue;
    
    corrections.push({
      type: 'correction',
      source: 'reconciliation',
      value: 1 - (finding.confidence),  // severity
      scope: 'persistent',
      entityId: finding.entityId,
      componentIndex: finding.componentIndex,
      context: {
        discrepancyClass: finding.classification,
        delta: finding.delta,
        expectedOutcome: finding.expectedOutcome,
        calculatedOutcome: finding.calculatedOutcome
      }
    });
    
    // Write to surface
    writeSynapse(surface, corrections[corrections.length - 1]);
  }
  
  return corrections;
}
```

### 1E: Reconciliation API route

```bash
# Create: web/src/app/api/reconciliation/run/route.ts
# POST — triggers reconciliation for a calculation batch against benchmark data
# Reads: calculation_results, committed_data (benchmark), execution traces
# Writes: reconciliation report to calculation_batches.config.reconciliation
# Writes: correction synapses to synaptic surface → density update
# Writes: training signal (signal_type: 'training:reconciliation_outcome')
```

### 1F: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob79-test-reconciliation.ts
// Test 1: Perfect match — all entities within tolerance
// Test 2: Rounding discrepancy detection (systematic $0.01-$0.99)
// Test 3: Data divergence classification (inputs differ)
// Test 4: Scope mismatch (entity in one dataset but not other)
// Test 5: False green detection (total matches, components don't)
// Test 6: Correction synapse generation (writes to surface)
// Test 7: Density impact — discrepancies lower confidence
// Test 8: Report structure completeness
// Test 9: Korean Test — zero domain words in reconciliation-agent.ts
// Test 10: Scale — 1000 entity comparison completes in < 100ms
SCRIPT
npx tsx web/scripts/ob79-test-reconciliation.ts
```

**Proof gates:**
- PG-1: Reconciliation produces structured report with classifications
- PG-2: False green detected when total matches but components diverge
- PG-3: Correction synapses written to Synaptic Surface
- PG-4: Density confidence decreases for patterns with discrepancies
- PG-5: Training signal written with reconciliation outcome
- PG-6: Rounding pattern detected and classified separately from logic errors
- PG-7: Korean Test — zero domain words in reconciliation-agent.ts
- PG-8: 1000-entity reconciliation completes in < 100ms

**Commit:** `OB-79 Mission 1: Reconciliation Agent — classification, false greens, correction synapses, 8 gates`

---

## MISSION 2: INSIGHT AGENT

### 2A: Create src/lib/agents/insight-agent.ts

The Insight Agent operates in two modes: lightweight inline (during calculation) and full analysis (post-calculation).

```typescript
export interface InsightConfig {
  thresholds: {
    anomalyRateAlert: number;       // default 0.05 (5% anomaly rate triggers alert)
    confidenceDropAlert: number;    // default 0.1 (10% confidence drop triggers alert)
    zeroOutcomeAlert: number;       // default 0.1 (10% zero outcomes triggers alert)
    concentrationAlert: number;     // default 0.5 (50% of total in top 10% entities)
  };
}

// INLINE MODE — runs during calculation, reads surface stats
export interface InlineInsight {
  type: 'anomaly_rate_high' | 'confidence_dropping' | 'zero_outcome_cluster' | 'concentration_risk';
  severity: number;           // 0-1
  metric: string;             // which stat triggered this
  currentValue: number;
  threshold: number;
  entityCount: number;        // how many entities processed when detected
  recommendation: string;     // structural, not domain
}

export function checkInlineInsights(
  surface: SynapticSurface, 
  config: InsightConfig,
  entitiesProcessed: number
): InlineInsight[] {
  // Check surface.stats against thresholds
  // Only runs when entitiesProcessed is at checkpoints (every 100, or 10%, whichever is smaller)
  // Returns insights if thresholds crossed
  // Writes insight synapses to surface
  // O(1) per check — reads aggregate stats, not per-entity data
}

// FULL ANALYSIS MODE — runs post-calculation, uses AI for prescriptive analysis
export interface FullAnalysis {
  runSummary: RunSummary;
  insights: PrescriptiveInsight[];
  alerts: Alert[];
  coachingActions: CoachingAction[];   // persona: manager
  governanceFlags: GovernanceFlag[];   // persona: admin
  growthSignals: GrowthSignal[];       // persona: rep
}

export interface PrescriptiveInsight {
  id: string;
  category: 'performance' | 'data_quality' | 'process' | 'risk';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  dataSource: string[];              // REQUIRED — what data backs this claim
  confidence: number;
}

export async function generateFullAnalysis(
  tenantId: string,
  batchId: string,
  surface: SynapticSurface,
  calculationSummary: CalculationSummary,
  reconciliationReport?: ReconciliationReport
): Promise<FullAnalysis> {
  // 1. Build analysis context from surface stats + calculation results + reconciliation
  // 2. ONE LLM call maximum — structured JSON output
  // 3. Validate: every insight has dataSource (AP-18 compliance)
  // 4. Strip any insights where dataSource is empty (never fabricate)
  // 5. Write insight training signal
}
```

### 2B: AI prompt for full analysis

The AI prompt is structured to prevent hallucination:

```typescript
const INSIGHT_SYSTEM_PROMPT = `
You are a structural analysis agent. You analyze calculation results and produce prescriptive insights.

CRITICAL RULES:
1. NEVER invent numbers. Every number you cite must come from the data provided.
2. NEVER reference specific entity names, identifiers, or domain concepts.
3. Use structural language: "entities", "outcomes", "components", "deviations".
4. Every insight MUST include a dataSource array listing which input fields support the claim.
5. If you cannot support a claim with provided data, do not make the claim.
6. Output ONLY valid JSON matching the schema below.

ANALYSIS CONTEXT:
{context}

OUTPUT SCHEMA:
{
  "insights": [
    {
      "category": "performance|data_quality|process|risk",
      "severity": "info|warning|critical",
      "title": "string",
      "description": "string",
      "recommendation": "string",
      "dataSource": ["string"],
      "confidence": 0.0-1.0
    }
  ],
  "alerts": [...],
  "coachingActions": [...],
  "governanceFlags": [...],
  "growthSignals": [...]
}
`;
```

### 2C: Persona routing

The Insight Agent produces one analysis. The persona layer filters:

```typescript
export function routeToPersona(analysis: FullAnalysis, persona: 'admin' | 'manager' | 'rep'): PersonaInsights {
  switch (persona) {
    case 'admin':
      return {
        insights: analysis.insights.filter(i => i.category === 'process' || i.category === 'risk'),
        alerts: analysis.alerts,
        governance: analysis.governanceFlags,
      };
    case 'manager':
      return {
        insights: analysis.insights.filter(i => i.category === 'performance'),
        coaching: analysis.coachingActions,
      };
    case 'rep':
      return {
        insights: analysis.insights.filter(i => i.category === 'performance' && i.severity === 'info'),
        growth: analysis.growthSignals,
      };
  }
}
```

### 2D: Wire into calculation route

In the calculation route (post-loop, after consolidation):

```typescript
// After surface consolidation, before response:
const inlineInsights = getInlineInsightsFromSurface(surface);
// Store inline insights in batch summary

// Fire-and-forget: full analysis (async, does not block response)
generateFullAnalysis(tenantId, batchId, surface, calculationSummary)
  .then(analysis => {
    // Store analysis in calculation_batches.config.insightAnalysis
    // Write training signal
  })
  .catch(err => console.error('Insight analysis failed:', err));
```

### 2E: Insight API route

```bash
# Create: web/src/app/api/insights/[batchId]/route.ts
# GET — retrieves stored insight analysis for a batch
# Query param: ?persona=admin|manager|rep
# Returns persona-filtered insights
# If analysis not yet complete (async), returns { status: 'processing' }
```

### 2F: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob79-test-insight.ts
// Test 1: Inline insight fires when anomaly rate exceeds threshold
// Test 2: Inline insight fires when confidence drops significantly
// Test 3: Inline insight is O(1) — reads stats, not per-entity
// Test 4: Full analysis validates dataSource on every insight
// Test 5: Insights with empty dataSource are stripped (AP-18)
// Test 6: Persona routing filters correctly (admin, manager, rep)
// Test 7: Full analysis produces structured JSON (not free text)
// Test 8: Insight training signal written
// Test 9: Korean Test — zero domain words in insight-agent.ts
// Test 10: Full analysis runs async (does not block calculation response)
SCRIPT
npx tsx web/scripts/ob79-test-insight.ts
```

**Proof gates:**
- PG-9: Inline insight fires on high anomaly rate
- PG-10: Inline insight is O(1) per check
- PG-11: Full analysis never has empty dataSource (AP-18)
- PG-12: Persona routing returns different subsets per persona
- PG-13: Full analysis stored in calculation_batches.config
- PG-14: Insight API returns persona-filtered results
- PG-15: Full analysis runs async — calculation response not delayed
- PG-16: Korean Test — zero domain words in insight-agent.ts

**Commit:** `OB-79 Mission 2: Insight Agent — inline + full analysis, persona routing, AP-18 safe, 8 gates`

---

## MISSION 3: RESOLUTION AGENT

### 3A: Create src/lib/agents/resolution-agent.ts

The Resolution Agent investigates disputes by tracing payouts through execution traces and the Synaptic Surface.

```typescript
export interface DisputeContext {
  disputeId: string;
  tenantId: string;
  entityId: string;
  entityExternalId: string;
  periodId: string;
  batchId: string;
  category: string;           // from disputes table
  description: string;        // from disputes table
  amountDisputed: number;
}

export interface ResolutionInvestigation {
  disputeId: string;
  entityId: string;
  
  // Trace evidence
  executionTraces: ExecutionTrace[];       // all component traces for this entity
  synapticHistory: Synapse[];              // all synapses for this entity
  
  // Root cause analysis
  rootCause: RootCause;
  
  // AI-generated recommendation (one LLM call)
  recommendation: ResolutionRecommendation;
  
  // Training signal
  signalType: string;
}

export interface RootCause {
  classification: 'data_error' | 'logic_error' | 'interpretation_ambiguity' | 'boundary_edge' | 'scope_error' | 'no_error_found';
  confidence: number;
  evidence: TraceEvidence[];
  affectedComponents: number[];        // which component indices
  suggestedAdjustment: number | null;  // if calculable
}

export interface ResolutionRecommendation {
  action: 'approve_adjustment' | 'reject_with_evidence' | 'escalate_to_human' | 'request_data';
  adjustmentAmount: number | null;
  reasoning: string;
  evidenceSummary: string;
  confidence: number;
  dataSource: string[];                // AP-18: what data supports this
}

export async function investigate(context: DisputeContext): Promise<ResolutionInvestigation> {
  // 1. Load execution traces for this entity + batch
  // 2. Load synaptic history (all synapses for this entity)
  // 3. Deterministic root cause analysis (no LLM):
  //    - Check if entity has anomaly synapses → boundary_edge or data_error
  //    - Check if entity has correction synapses from reconciliation → known discrepancy
  //    - Check execution trace inputs against committed_data → data_error if mismatch
  //    - Check if component confidence is low → interpretation_ambiguity
  //    - If none of the above → no_error_found
  // 4. ONE LLM call for recommendation (structured JSON)
  // 5. Write resolution synapse to surface
  // 6. Write training signal (signal_type: 'training:dispute_resolution')
}
```

### 3B: Deterministic root cause analysis

The root cause analysis is deterministic — no LLM. It reads the execution trace and synaptic history:

```typescript
function analyzeRootCause(
  traces: ExecutionTrace[],
  synapses: Synapse[],
  disputeContext: DisputeContext
): RootCause {
  // Check 1: Does the entity have anomaly synapses?
  const anomalySynapses = synapses.filter(s => s.type === 'anomaly');
  if (anomalySynapses.length > 0) {
    const boundaryAnomalies = anomalySynapses.filter(s => s.context?.reason === 'exact_boundary_match');
    if (boundaryAnomalies.length > 0) {
      return {
        classification: 'boundary_edge',
        confidence: 0.85,
        evidence: boundaryAnomalies.map(s => ({ type: 'synapse', data: s })),
        affectedComponents: [...new Set(boundaryAnomalies.map(s => s.componentIndex!))],
        suggestedAdjustment: null
      };
    }
  }
  
  // Check 2: Does the entity have correction synapses from reconciliation?
  const correctionSynapses = synapses.filter(s => s.type === 'correction');
  if (correctionSynapses.length > 0) {
    const totalDelta = correctionSynapses.reduce((s, syn) => {
      return s + ((syn.context?.calculatedOutcome as number) - (syn.context?.expectedOutcome as number));
    }, 0);
    return {
      classification: 'data_error',
      confidence: 0.8,
      evidence: correctionSynapses.map(s => ({ type: 'synapse', data: s })),
      affectedComponents: [...new Set(correctionSynapses.map(s => s.componentIndex!))],
      suggestedAdjustment: -totalDelta  // reverse the error
    };
  }
  
  // Check 3: Is any component confidence low?
  const lowConfidence = traces.filter(t => {
    const confSynapses = synapses.filter(s => s.type === 'confidence' && s.componentIndex === t.componentIndex);
    return confSynapses.some(s => s.value < 0.7);
  });
  if (lowConfidence.length > 0) {
    return {
      classification: 'interpretation_ambiguity',
      confidence: 0.6,
      evidence: lowConfidence.map(t => ({ type: 'trace', data: t })),
      affectedComponents: lowConfidence.map(t => t.componentIndex),
      suggestedAdjustment: null
    };
  }
  
  // Default: no error found
  return {
    classification: 'no_error_found',
    confidence: 0.5,
    evidence: traces.map(t => ({ type: 'trace', data: t })),
    affectedComponents: [],
    suggestedAdjustment: null
  };
}
```

### 3C: AI recommendation prompt

One LLM call per dispute. Structured JSON output:

```typescript
const RESOLUTION_SYSTEM_PROMPT = `
You are a dispute resolution agent. You review calculation evidence and recommend actions.

CRITICAL RULES:
1. NEVER invent evidence. Only reference data provided in the context.
2. Every recommendation must have a dataSource listing what supports it.
3. If evidence is inconclusive, recommend 'escalate_to_human'.
4. Be specific about adjustment amounts when evidence supports it.
5. Output ONLY valid JSON.

DISPUTE CONTEXT:
{context}

ROOT CAUSE ANALYSIS:
{rootCause}

EXECUTION TRACES:
{traces}

OUTPUT SCHEMA:
{
  "action": "approve_adjustment|reject_with_evidence|escalate_to_human|request_data",
  "adjustmentAmount": number|null,
  "reasoning": "string",
  "evidenceSummary": "string",
  "confidence": 0.0-1.0,
  "dataSource": ["string"]
}
`;
```

### 3D: Resolution API route

```bash
# Create: web/src/app/api/disputes/[id]/investigate/route.ts
# POST — triggers Resolution Agent investigation for a dispute
# Reads: disputes, calculation_results (traces), synaptic history
# Writes: investigation results to disputes.resolution JSONB
# Writes: resolution synapse to surface
# Writes: training signal (signal_type: 'training:dispute_resolution')
```

### 3E: Resolution pattern tracking

When the Resolution Agent resolves multiple disputes with the same root cause, it detects patterns:

```typescript
export async function detectResolutionPatterns(
  tenantId: string,
  recentResolutions: ResolutionInvestigation[]
): Promise<ResolutionPattern[]> {
  // Group by rootCause.classification
  // If >3 disputes with same classification in same period → pattern
  // Write pattern synapse (persistent, scope: 'run')
  // The Interpretation Agent can read this next time it interprets a plan:
  //   "This tenant has recurring boundary_edge disputes. Consider adjusting boundary behavior."
}
```

### 3F: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob79-test-resolution.ts
// Test 1: Root cause — anomaly synapses → boundary_edge classification
// Test 2: Root cause — correction synapses → data_error classification
// Test 3: Root cause — low confidence → interpretation_ambiguity
// Test 4: Root cause — no issues → no_error_found
// Test 5: AI recommendation validates dataSource (AP-18)
// Test 6: Resolution synapse written to surface
// Test 7: Training signal written
// Test 8: Resolution pattern detection (3+ same classification)
// Test 9: Korean Test — zero domain words in resolution-agent.ts
// Test 10: Investigation completes in < 2s (one LLM call max)
SCRIPT
npx tsx web/scripts/ob79-test-resolution.ts
```

**Proof gates:**
- PG-17: Root cause classification uses trace + synapse evidence
- PG-18: No fabrication — recommendation has dataSource (AP-18)
- PG-19: Resolution synapse written to Synaptic Surface
- PG-20: Training signal captures dispute resolution outcome
- PG-21: Resolution pattern detected when 3+ disputes share classification
- PG-22: Investigation stored in disputes table (resolution column)
- PG-23: Korean Test — zero domain words in resolution-agent.ts
- PG-24: One LLM call maximum per investigation

**Commit:** `OB-79 Mission 3: Resolution Agent — root cause analysis, AI recommendation, pattern tracking, 8 gates`

---

## MISSION 4: AGENT INTERACTION PROOF

This mission proves the three agents work as a cohesive system through the Synaptic Surface.

### 4A: The closed loop test

```
1. Run calculation → Calculation Agent writes confidence synapses
2. Run reconciliation (with benchmark data) → Reconciliation Agent writes correction synapses
3. Run calculation AGAIN → Calculation Agent reads correction synapses
   → Verify: density adjusts based on corrections
4. File a dispute → Resolution Agent reads correction + confidence synapses
   → Verify: root cause classification uses reconciliation evidence
5. Insight Agent reads all synaptic activity
   → Verify: prescriptive insight references reconciliation findings
```

### 4B: Interaction test script

```bash
cat << 'SCRIPT' > web/scripts/ob79-test-agent-interaction.ts
// The Closed Loop Test
//
// This test proves all three agents communicate through the Synaptic Surface.
//
// Step 1: Nuclear clear density
// Step 2: Run calculation → surface has confidence synapses
// Step 3: Run reconciliation with deliberately wrong benchmark → correction synapses
// Step 4: Verify correction synapses exist on surface
// Step 5: Run calculation again → density should drop for corrected patterns
// Step 6: Create a test dispute for an entity that has corrections
// Step 7: Run Resolution Agent → should find correction synapses in evidence
// Step 8: Run Insight Agent full analysis → should reference reconciliation findings
// Step 9: Verify training signals written for all three agents
//
// This IS the Synaptic State proof — agents that never directly communicate
// share intelligence through the surface.
SCRIPT
npx tsx web/scripts/ob79-test-agent-interaction.ts
```

**Proof gates:**
- PG-25: Reconciliation correction synapses persist on surface
- PG-26: Second calculation run density adjusts from corrections
- PG-27: Resolution Agent finds correction synapses in dispute evidence
- PG-28: Insight Agent references reconciliation in analysis
- PG-29: Training signals written for all three agents (3 signal types)
- PG-30: The closed loop completes end-to-end

**Commit:** `OB-79 Mission 4: Agent interaction proof — the closed loop, 6 gates`

---

## MISSION 5: KOREAN TEST + INTEGRATION CLT

### 5A: Korean Test

```bash
echo "=== KOREAN TEST — ALL AGENT FILES ==="
for f in reconciliation-agent.ts insight-agent.ts resolution-agent.ts; do
  count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt" "web/src/lib/agents/$f" 2>/dev/null || echo "0")
  echo "  $f: $count domain words"
done

echo ""
echo "=== FOUNDATIONAL FILES (from OB-78) ==="
for f in intent-types.ts intent-executor.ts synaptic-types.ts synaptic-surface.ts synaptic-density.ts pattern-signature.ts anomaly-detector.ts; do
  count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt" "web/src/lib/calculation/$f" 2>/dev/null || echo "0")
  echo "  $f: $count domain words"
done
```

### 5B: Build verification

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
```

### 5C: Integration CLT

```
□ npm run build exits 0?
□ localhost:3000 responds?
□ Reconciliation tests pass? (10 tests)
□ Insight tests pass? (10 tests)
□ Resolution tests pass? (10 tests)
□ Agent interaction tests pass? (closed loop)
□ Korean Test: 0 domain words in 3 agent files?
□ Korean Test: 0 domain words in 7 foundational files?
□ Reconciliation API: POST → structured report?
□ Insight API: GET with persona → filtered insights?
□ Resolution API: POST → investigation with evidence?
□ All training signals written (3 types)?
□ gh pr create executed?
```

**Proof gates:**
- PG-31: Korean Test — 0 domain words in all 3 agent files
- PG-32: npm run build exits 0

**Commit:** `OB-79 Mission 5: Korean Test + Integration CLT — all gates pass`

---

## COMPLETION REPORT

Save as `OB-79_COMPLETION_REPORT.md` in **PROJECT ROOT**.

Structure:
1. **Architecture Decisions** — all 6 decisions with rationale
2. **Commits** — all with hashes
3. **Files created** — every new file (3 agents + 3 API routes + tests)
4. **Files modified** — every changed file
5. **Proof gates** — 32 gates, each PASS/FAIL with evidence
6. **Reconciliation Agent proof** — classification accuracy, false green detection, correction synapses
7. **Insight Agent proof** — inline detection timing, full analysis structure, AP-18 compliance
8. **Resolution Agent proof** — root cause accuracy, recommendation structure, pattern detection
9. **Agent Interaction proof** — the closed loop with synaptic evidence
10. **Korean Test** — grep output for all 10+ foundational files
11. **Known issues** — honest gaps

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-79: Reconciliation + Insight + Resolution Agents — Tier 2 Agent Autonomy" \
  --body "## Tier 2 Agentic Metamorphosis — Agent Autonomy

### Mission 1: Reconciliation Agent
- Compares calculation results against benchmark data
- 8 discrepancy classifications (match, rounding, data_divergence, logic_divergence, etc.)
- False green detection (total matches but components diverge)
- Correction synapses backpropagate through Synaptic Surface
- Density confidence adjusts from reconciliation findings

### Mission 2: Insight Agent
- Dual-mode: inline (O(1) during calculation) + full analysis (post-run AI)
- Persona-aware routing (Admin/Manager/Rep)
- AP-18 compliant: every insight has dataSource, never fabricates
- Async full analysis does not block calculation response

### Mission 3: Resolution Agent
- Traces disputed payouts through execution traces + synaptic history
- Deterministic root cause analysis (no LLM)
- AI recommendation (one LLM call max, structured JSON)
- Resolution pattern tracking (3+ disputes with same root cause)

### Mission 4: Agent Interaction — The Closed Loop
- Reconciliation writes corrections → Calculation reads them
- Resolution reads corrections in dispute evidence
- Insight references reconciliation in analysis
- All three agents communicate exclusively through the Synaptic Surface

### Korean Test: PASS — zero domain words in all agent files
### Proof Gates: 32 — see OB-79_COMPLETION_REPORT.md"
```

**Commit:** `OB-79 Final: Completion report + PR`

---

## MAXIMUM SCOPE

5 missions, 32 proof gates. After OB-79:

1. Reconciliation Agent verifies calculations against benchmarks ✓
2. Insight Agent surfaces prescriptive intelligence (not just descriptions) ✓
3. Resolution Agent investigates disputes with evidence ✓
4. All three agents communicate through the Synaptic Surface ✓
5. The closed loop: correction → recalculation → improved density ✓
6. All agents are domain-agnostic (Korean Test) ✓
7. No per-entity LLM calls (scale-safe) ✓
8. AP-18 compliant — no fabrication, every claim has dataSource ✓

---

*"The Reconciliation Agent finds the truth. The Insight Agent tells you what to do about it. The Resolution Agent proves it."*

*"They never speak to each other. They speak through the Synaptic Surface."*

*"Correction synapses don't just fix today's calculation. They make tomorrow's faster and more accurate."*

*OB-79 — February 22, 2026*
