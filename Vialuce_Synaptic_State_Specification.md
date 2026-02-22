# Vialuce Synaptic State Specification
## The Communication Substrate Between Agents
### v1 — February 22, 2026

---

## PURPOSE

The Synaptic State is the shared computational surface through which all Vialuce agents communicate. It replaces traditional message-passing (request/response between agents) with a continuous, shared state that updates at the granularity of individual Intent executions.

**Traditional agent communication:** Agent A sends message → Agent B receives → Agent B responds → Agent A acts. Latency per round trip. No learning from the communication itself.

**Synaptic State:** Agents read from and write to a shared surface during execution. No round trips. No serialization overhead. Intelligence propagates within a single calculation run — not after it completes, not after a human reviews, not after a retraining cycle.

**The analogy is biological, not mechanical.** Neurons don't send HTTP requests to each other. They share a chemical environment. A neurotransmitter released by one neuron is immediately available to every neuron in the synapse. The Synaptic State is that shared chemical environment for Vialuce's agents.

---

## DESIGN PRINCIPLES

### 1. Agents Think at Design Time, Execute at Run Time

LLM calls happen when plans change, data is imported, or users request analysis. The per-entity calculation loop is pure structural math — lookups, multiplications, comparisons. No agent requires a real-time LLM call during calculation.

**The Synaptic State enforces this.** Synapses are lightweight structured data, not AI prompts. Reading a synapse is a hash lookup. Writing a synapse is an in-memory append. The synaptic surface adds nanoseconds per operation, not seconds.

**Scale litmus test:** Would this work for 150K entities in a single run? If a synaptic operation requires per-entity AI calls, it fails. If it requires per-entity synchronous writes, it fails. If it's pure data + batch I/O, it passes.

### 2. Observation IS Action

Borrowed from high-frequency trading: eliminate the distinction between observing a signal and acting on it. The Calculation Agent doesn't observe a confidence synapse, then decide what to do, then act. The synapse's presence in the shared surface IS the action — it modifies the execution context for all subsequent operations.

### 3. Learning Happens at the Smallest Viable Granularity

This is the nanobatch principle. Traditional ML: accumulate a dataset → train → deploy. Micro-batch ML: accumulate a mini-batch → update → continue. Nanobatch: every individual operation can update the shared state, and subsequent operations read the updated state. Learning propagates within a single run.

### 4. Cost Decreases with Usage

A new tenant generates maximum synaptic activity — everything is uncertain, everything is traced. An established tenant generates minimal synaptic activity — the system is confident, most operations execute silently. Operational cost per calculation is a decreasing function of cumulative usage. This is the inverse of traditional platforms where cost per calculation is constant.

### 5. Zero Domain Language

The Synaptic State is Foundational Agent infrastructure. It knows nothing about compensation, royalties, or any domain. Synapse types are structural: confidence, anomaly, correction, pattern. The Korean Test applies.

---

## THE SYNAPTIC ARCHITECTURE

### Layer 1: Synapse Types

A Synapse is the atomic unit of agent communication. It is a lightweight, structured signal that one agent writes and any agent can read.

```typescript
interface Synapse {
  id: string;                          // unique within run
  entityId: string | null;             // null for run-level synapses
  componentIndex: number | null;       // null for entity-level or run-level
  operationIndex: number | null;       // position in execution sequence
  
  type: SynapseType;
  source: 'ingestion' | 'interpretation' | 'calculation' | 'reconciliation' | 'insight' | 'resolution';
  
  value: number;                       // normalized 0-1 (confidence, severity, weight)
  context: Record<string, unknown>;    // minimal structured metadata
  
  scope: 'operation' | 'entity' | 'component' | 'run' | 'persistent';
  timestamp: number;                   // monotonic counter within run
}

type SynapseType = 
  | 'confidence'        // How certain is this result?
  | 'anomaly'           // Something unexpected was detected
  | 'correction'        // A previous result should be adjusted
  | 'pattern'           // A structural pattern was identified
  | 'boundary_behavior' // How boundaries behave (inclusive/exclusive)
  | 'data_quality'      // Input data quality signal
  | 'resolution_hint'   // Disambiguation preference
  | 'performance'       // Execution timing signal
  ;
```

### Layer 2: The Synaptic Surface

The Synaptic Surface is the in-memory shared state that all agents read from and write to during a calculation run. It is NOT a database table during execution. It is an in-memory data structure — a Map of Maps — optimized for O(1) reads and O(1) writes.

```typescript
interface SynapticSurface {
  // Run-level synapses (apply to entire run)
  runSynapses: Map<SynapseType, Synapse[]>;
  
  // Component-level synapses (apply to all entities for a component)
  componentSynapses: Map<number, Map<SynapseType, Synapse[]>>;  // componentIndex → type → synapses
  
  // Entity-level synapses (apply to a specific entity)
  entitySynapses: Map<string, Map<SynapseType, Synapse[]>>;     // entityId → type → synapses
  
  // Accumulated density scores (read at start, updated at end)
  density: SynapticDensity;
  
  // Counters for adaptive behavior
  stats: {
    totalSynapsesWritten: number;
    synapsesPerType: Map<SynapseType, number>;
    anomalyRate: number;         // anomalies / total operations
    confidenceMean: number;      // running mean of confidence synapses
    confidenceVariance: number;  // running variance
  };
}
```

### Layer 3: Synaptic Density

Synaptic Density is the pre-computed confidence score that determines how much tracing and signaling occurs for a given tenant + component pattern. It's the mechanism by which the system gets faster over time.

```typescript
interface SynapticDensity {
  tenantId: string;
  patternSignatures: Map<string, PatternDensity>;
}

interface PatternDensity {
  signature: string;           // structural hash of the Intent (operation type + boundary count + source types)
  confidence: number;          // 0-1, derived from accumulated run history
  totalExecutions: number;     // how many times this pattern has run
  lastAnomalyRate: number;     // anomaly rate from most recent run
  lastCorrectionCount: number; // corrections from most recent reconciliation
  executionMode: ExecutionMode;
  
  // Nanobatch learning state
  boundaryBehavior: 'inclusive' | 'exclusive' | 'unknown';
  commonResolutions: Map<string, string>;  // ambiguity → preferred resolution
}

type ExecutionMode = 'full_trace' | 'light_trace' | 'silent';

// Thresholds (configurable per tenant)
const DENSITY_THRESHOLDS = {
  full_trace: { max: 0.70 },       // confidence < 0.70 → trace everything
  light_trace: { min: 0.70, max: 0.95 },  // 0.70-0.95 → trace anomalies only
  silent: { min: 0.95 },           // confidence ≥ 0.95 → execute, store result, done
};
```

### Layer 4: The Nanobatch Propagation Protocol

This defines how synapses propagate between agents during execution.

**Rule 1: Write is always local.** An agent writes a synapse to the shared surface. No network call. No serialization. In-memory append.

**Rule 2: Read is always by subscription.** Agents declare which synapse types they consume. The surface filters. Only relevant synapses reach each agent.

**Rule 3: Propagation is weighted.** Not every synapse reaches every subscriber. A synapse has a propagation weight derived from its value (confidence/severity). Subscribers have a threshold. Only synapses above the threshold propagate.

**Rule 4: Within-run learning.** When the Calculation Agent processes entity #1,000 and writes a pattern synapse (e.g., "boundaries are inclusive for this component"), entity #1,001 reads that synapse before executing. The learning is immediate.

**Rule 5: Cross-run consolidation.** After a run completes, the persistent synapses are consolidated into updated density scores. This takes milliseconds — it's arithmetic, not ML training. The next run starts with updated density.

```typescript
// Agent subscription declarations
const AGENT_SUBSCRIPTIONS: Record<string, SynapseType[]> = {
  calculation:     ['pattern', 'boundary_behavior', 'correction', 'resolution_hint'],
  reconciliation:  ['confidence', 'anomaly', 'data_quality'],
  insight:         ['anomaly', 'confidence', 'pattern', 'performance'],
  resolution:      ['anomaly', 'correction', 'confidence'],
};

// Propagation during execution
function shouldPropagate(synapse: Synapse, subscriberThreshold: number): boolean {
  // High-value signals always propagate
  if (synapse.type === 'anomaly' && synapse.value > 0.8) return true;
  if (synapse.type === 'correction') return true;  // corrections always propagate
  
  // Normal signals propagate if above threshold
  return synapse.value >= subscriberThreshold;
}
```

---

## EXECUTION FLOW WITH SYNAPTIC STATE

### Before the Run

1. Load Synaptic Density for this tenant from persistent storage
2. Initialize empty SynapticSurface in memory
3. Pre-populate run-level synapses from density (boundary behaviors, common resolutions)

### During the Run (per entity, per component)

```
For each entity:
  For each component:
    1. Check density → determine ExecutionMode
    
    IF silent (confidence ≥ 0.95):
      Execute Intent with no trace
      Store result
      Increment stats.totalExecutions
      → No synapses written. Maximum speed.
    
    IF light_trace (0.70 ≤ confidence < 0.95):
      Execute Intent with boundary-only trace
      IF anomaly detected (unexpected boundary match, zero output, extreme value):
        Write anomaly synapse
        Write confidence synapse (lower than expected)
      Store result + light trace
    
    IF full_trace (confidence < 0.70):
      Execute Intent with complete trace
      Write confidence synapse for every operation
      Write pattern synapse if structural pattern detected
      Write boundary_behavior synapse on boundary matches
      Store result + full trace
    
    2. Read component-level synapses written by prior entities
       - Apply pattern corrections (e.g., inclusive boundaries)
       - Apply resolution hints (e.g., field disambiguation)
    
    3. Update running stats (confidenceMean, anomalyRate)
```

### After the Run

1. Consolidate persistent synapses into density updates:
   ```
   newConfidence = weightedAverage(
     previousConfidence,     weight: 0.7
     runConfidenceMean,      weight: 0.2
     1 - runAnomalyRate,     weight: 0.1
   )
   ```

2. Batch-write updated density to persistent storage (single Supabase upsert)

3. Batch-write aggregated training signals (one per component, not one per entity)

4. Archive run-level synapses for the Reconciliation Agent (if run is flagged for review)

---

## PERSISTENCE MODEL

### What Lives in Memory (during run only)

- The SynapticSurface (all synapse maps)
- Running stats
- Entity-level and operation-level synapses
- Component-level pattern synapses

### What Persists to Supabase (after run)

**Table: `synaptic_density`** (new table)

```sql
CREATE TABLE synaptic_density (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pattern_signature TEXT NOT NULL,           -- structural hash of Intent shape
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  total_executions INTEGER NOT NULL DEFAULT 0,
  last_anomaly_rate NUMERIC DEFAULT 0,
  last_correction_count INTEGER DEFAULT 0,
  execution_mode TEXT NOT NULL DEFAULT 'full_trace',
  learned_behaviors JSONB DEFAULT '{}',     -- boundary behavior, common resolutions
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(tenant_id, pattern_signature)
);

CREATE INDEX idx_density_tenant ON synaptic_density(tenant_id);
ALTER TABLE synaptic_density ENABLE ROW LEVEL SECURITY;
```

**`classification_signals` table** (existing — extended usage)

Training signals continue to write here, but now batched: one signal per component per run instead of one per entity. The signal_value JSONB includes aggregated stats from the synaptic surface.

### What Never Persists

- Operation-level synapses (ephemeral, used within the run only)
- Entity-level synapses (ephemeral, used for within-run learning only)
- Raw stats counters (consolidated into density scores)

---

## PATTERN SIGNATURE GENERATION

The pattern signature is a structural hash that identifies "this type of calculation" without any domain knowledge. Two components with the same pattern signature will share density scores.

```typescript
function generatePatternSignature(intent: ComponentIntent): string {
  const parts: string[] = [];
  
  // Operation type
  parts.push(intent.intent?.operation || 'variant');
  
  // Input source types (sorted for stability)
  const sources = extractSourceTypes(intent);
  parts.push(sources.sort().join('+'));
  
  // Structural shape (boundary count, grid dimensions)
  if (intent.intent?.operation === 'bounded_lookup_1d') {
    parts.push(`b${(intent.intent as any).boundaries.length}`);
  }
  if (intent.intent?.operation === 'bounded_lookup_2d') {
    const op = intent.intent as any;
    parts.push(`g${op.rowBoundaries.length}x${op.columnBoundaries.length}`);
  }
  
  // Modifier types
  const mods = intent.modifiers.map(m => m.modifier).sort();
  if (mods.length > 0) parts.push(mods.join('+'));
  
  // Entity scope
  parts.push(intent.dataSource.entityScope);
  
  return parts.join(':');
}

// Examples:
// "bounded_lookup_2d:ratio+aggregate:g4x6:entity"     → 2D matrix with 4 rows, 6 columns
// "bounded_lookup_1d:ratio:b5:entity"                  → 1D tier lookup with 5 tiers
// "scalar_multiply:metric:entity"                      → simple percentage
// "conditional_gate:metric+metric:cap:entity"           → conditional with cap modifier
```

This means two different tenants with structurally similar plans (e.g., both have 5-tier lookup tables based on ratios) will share Foundational flywheel density — without sharing any tenant-specific data.

---

## ANOMALY DETECTION (Lightweight, In-Run)

The Synaptic State enables lightweight anomaly detection DURING execution, not as a post-hoc analysis step. These are structural anomalies, not domain-specific.

```typescript
interface AnomalyDetector {
  // Checks run inline with calculation, no LLM needed
  checkBoundaryAnomaly(value: number, boundaries: Boundary[], matchIndex: number): Synapse | null;
  checkOutputAnomaly(output: number, priorOutputs: number[]): Synapse | null;
  checkInputAnomaly(input: number, expectedRange: [number, number]): Synapse | null;
  checkZeroOutput(entityId: string, componentIndex: number): Synapse | null;
}

// Example: boundary anomaly
function checkBoundaryAnomaly(value: number, boundaries: Boundary[], matchIndex: number): Synapse | null {
  const boundary = boundaries[matchIndex];
  
  // Value falls exactly on boundary edge — ambiguous
  if (value === boundary.min || value === boundary.max) {
    return {
      type: 'boundary_behavior',
      value: 0.6,  // moderate confidence
      context: {
        reason: 'exact_boundary_match',
        boundaryValue: value,
        matchIndex,
        adjacentOutputDelta: Math.abs(outputs[matchIndex] - (outputs[matchIndex - 1] ?? 0))
      },
      scope: 'component'
    };
  }
  
  return null;
}
```

---

## THE PROGRESSIVE PERFORMANCE PROFILE

This is the key measurable outcome. Processing time should decrease with each reprocessing of the same data, even without code changes.

### Run 1 (First calculation for a tenant)
- Density: all patterns at 0.5 (unknown)
- Execution mode: 100% full_trace
- All synapses active
- Expected: baseline processing time T₁
- Signals written: one per component (batch)
- Density update: initial scores based on anomaly rate + confidence mean

### Run 2 (Same data, reprocessed)
- Density: updated from Run 1 (typically 0.6-0.75 for clean data)
- Execution mode: mixed (some light_trace, some full_trace)
- Pattern synapses pre-loaded from Run 1 density
- Expected: T₂ ≈ 0.7 × T₁
- Fewer traces written, fewer anomaly checks on confident patterns

### Run 3 (Same data, reprocessed again)
- Density: updated from Run 2 (typically 0.8-0.9 for consistently clean data)
- Execution mode: mostly light_trace, some silent
- Expected: T₃ ≈ 0.4 × T₁
- Most operations skip trace generation

### Run 5+ (Established tenant)
- Density: 0.95+ for stable patterns
- Execution mode: 95%+ silent
- Expected: T₅ ≈ 0.1-0.15 × T₁
- Only novel patterns or anomalies generate synaptic activity

### Nuclear Clear
When a tenant's plan fundamentally changes (new plan document, restructured components), the density for affected pattern signatures resets to 0.5. The system re-enters full_trace mode for those components. This is the "Nuclear Clear" — intentional density reset.

```typescript
async function nuclearClear(tenantId: string, scope: 'all' | 'component', patternSignature?: string): Promise<void> {
  if (scope === 'all') {
    await supabase.from('synaptic_density')
      .update({ confidence: 0.5, execution_mode: 'full_trace', learned_behaviors: '{}' })
      .eq('tenant_id', tenantId);
  } else if (patternSignature) {
    await supabase.from('synaptic_density')
      .update({ confidence: 0.5, execution_mode: 'full_trace', learned_behaviors: '{}' })
      .eq('tenant_id', tenantId)
      .eq('pattern_signature', patternSignature);
  }
}
```

---

## RELATIONSHIP TO EXISTING ARCHITECTURE

### Synaptic State and the Calculation Intent Layer

The Intent is the contract. The Synapse is the feedback. The Intent says "execute a 2D bounded lookup." The Synapse says "that lookup matched on a boundary edge — confidence 0.6." The next run's density says "this pattern is 0.85 confident — use light_trace."

### Synaptic State and the Three Flywheels

- **Flywheel 1 (Tenant):** Entity-level and component-level synapses persist as density scores per tenant. Learning is isolated. SOC2-clean.
- **Flywheel 2 (Foundational):** Pattern signatures are structural — they contain no tenant data. The density scores for a signature like `bounded_lookup_2d:ratio+aggregate:g4x6:entity` can be aggregated across all tenants to produce foundational priors. A new tenant with the same structural pattern starts with foundational density instead of 0.5.
- **Flywheel 3 (Domain):** When a Domain Agent tags a component with a vertical indicator (e.g., "retail_optical"), the density for that pattern + vertical combines across all tenants in that vertical.

### Synaptic State and Training Signals

Training signals (OB-77) are the coarse-grained learning mechanism: one signal per run, capturing concordance and lifecycle transitions. Synaptic State is the fine-grained mechanism: learning propagates within a run. They complement, not replace.

### Synaptic State and the Execution Trace

In full_trace mode, the execution trace is generated as before (OB-76). In light_trace mode, a minimal trace records only anomalies. In silent mode, no trace is generated. The trace becomes a density-adaptive feature, not a constant overhead.

---

## COMPOSABILITY INTEGRATION

The Intent composability gap (S25) is resolved by the Synaptic State architecture. When operations nest (a bounded_lookup produces a rate that feeds scalar_multiply), each operation writes its own synapse. The composite confidence is the product of child confidences.

```typescript
function executeCompositeIntent(intent: IntentOperation, surface: SynapticSurface): { result: number; confidence: number } {
  if (intent.operation === 'scalar_multiply' && typeof intent.rate !== 'number') {
    // rate is itself an operation — execute recursively
    const rateResult = executeCompositeIntent(intent.rate as IntentOperation, surface);
    const inputResult = resolveSource(intent.input);
    
    const compositeConfidence = rateResult.confidence * (surface.getConfidence(intent) ?? 1.0);
    
    return {
      result: inputResult * rateResult.result,
      confidence: compositeConfidence
    };
  }
  
  // Base case: primitive operation
  return executePrimitive(intent, surface);
}
```

---

## COMPETITIVE ANALYSIS

| Capability | Traditional ICM | AI-Bolted ICM | Vialuce (Synaptic State) |
|---|---|---|---|
| Learning cycle | Never (static config) | Weeks (retrain model) | Per-entity within run |
| Cost per calculation over time | Constant | Constant | Decreasing |
| Cross-tenant intelligence | None | Possible but risky | Structural, anonymized, automatic |
| Anomaly detection timing | Post-hoc batch | Post-hoc batch | Inline during execution |
| New tenant cold start | Manual config | AI with no history | AI + foundational density priors |
| Agent communication | N/A | Message-passing | Shared state (zero serialization) |

---

*"The AI is not a feature of the platform. The AI IS the platform. The Synaptic State is how the platform thinks."*

*"Agents don't send messages to each other. They share a nervous system."*

*"The system gets faster and cheaper the more it's used. This is the moat."*
