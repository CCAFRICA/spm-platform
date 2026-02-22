# OB-78: INTENT COMPOSABILITY + SYNAPTIC STATE FOUNDATION + ENGINE CUTOVER PLAN

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Calculation_Intent_Specification.md` — the Intent vocabulary
4. `Vialuce_Synaptic_State_Specification.md` — the Synaptic State protocol (NEW — read every section)
5. `OB-76_COMPLETION_REPORT.md` — Intent executor results
6. `OB-77_COMPLETION_REPORT.md` — AI-native Intents, training signals, trace UI

**Read all six before writing any code.**

---

## WHAT THIS OB BUILDS

OB-78 delivers three foundational capabilities that complete Tier 1 of the Agentic Metamorphosis:

1. **Intent Composability** — Operations can nest. A bounded_lookup produces a rate that feeds scalar_multiply. The executor handles recursive Intent trees. This closes the S25 architecture gap.

2. **Synaptic State Foundation** — The in-memory Synaptic Surface, density persistence, pattern signature generation, adaptive execution modes (full_trace / light_trace / silent), and within-run learning. This is the novel agent communication substrate.

3. **Engine Cutover Plan** — Per-tenant, per-component confidence-gated transition from dual-path to Intent-only execution. The current engine removal becomes density-driven, not calendar-driven.

**After OB-78, the system should demonstrably process the same data faster on the second run than the first.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain language in intent-types.ts, intent-executor.ts, synaptic-surface.ts, synaptic-density.ts.**
8. Domain language acceptable in: intent-transformer.ts (bridge), ai-plan-interpreter.ts (Domain Agent), training signal labels, UI display strings.
9. **Scale test every feature: would this work for 150K entities?**
10. **No per-entity Supabase calls during calculation loop.** Batch all DB operations.

---

## PHASE 0: DIAGNOSTIC — READ BEFORE ANY CODE

### 0A: Read the current Intent executor

```bash
echo "=== INTENT EXECUTOR STRUCTURE ==="
cat web/src/lib/calculation/intent-executor.ts | head -80

echo ""
echo "=== INTENT TYPES ==="
cat web/src/lib/calculation/intent-types.ts | head -120

echo ""
echo "=== SCALAR MULTIPLY — current rate field ==="
grep -n "rate\|ScalarMultiply" web/src/lib/calculation/intent-types.ts
grep -n "scalar_multiply\|rate" web/src/lib/calculation/intent-executor.ts

echo ""
echo "=== CONDITIONAL GATE — onTrue/onFalse ==="
grep -n "onTrue\|onFalse\|ConditionalGate" web/src/lib/calculation/intent-types.ts
grep -n "conditional_gate\|onTrue\|onFalse" web/src/lib/calculation/intent-executor.ts
```

### 0B: Read the current calculation route

```bash
echo "=== CALCULATION RUN ROUTE ==="
cat web/src/app/api/calculation/run/route.ts | head -100

echo ""
echo "=== DUAL PATH COMPARISON ==="
grep -n "dual\|dualPath\|intentExecutor\|comparison\|concordance" web/src/app/api/calculation/run/route.ts

echo ""
echo "=== TRAINING SIGNAL WRITES ==="
grep -n "persistSignal\|training\|signal" web/src/app/api/calculation/run/route.ts
```

### 0C: Read the Intent resolver and validator

```bash
echo "=== INTENT RESOLVER ==="
cat web/src/lib/calculation/intent-resolver.ts

echo ""
echo "=== INTENT VALIDATOR ==="
cat web/src/lib/calculation/intent-validator.ts
```

### 0D: Check current database state

```bash
echo "=== EXISTING TABLES ==="
grep -rn "synaptic\|density\|synapse" web/src/ --include="*.ts" --include="*.tsx" | head -10

echo ""
echo "=== classification_signals current usage ==="
grep -rn "classification_signals\|persistSignal" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20

echo ""
echo "=== calculation_results metadata shape ==="
grep -rn "intentTraces\|metadata\.intent\|executionTrace" web/src/ --include="*.ts" --include="*.tsx" | head -20
```

### 0E: Timing baseline

```bash
cat << 'SCRIPT' > web/scripts/ob78-timing-baseline.ts
/**
 * Measures current calculation time for Pipeline Test Co.
 * This becomes the baseline T₁ that subsequent runs should beat.
 */
const start = Date.now();
console.log('OB-78 Timing Baseline');
console.log('====================');
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log(`Purpose: Establish T₁ baseline before Synaptic State`);
console.log('');
console.log('To measure: trigger a calculation run for Pipeline Test Co via the UI or API');
console.log('Record: total time from API call to response');
console.log('Record: number of entities processed');
console.log('Record: number of components per entity');
console.log('');
console.log('Expected baseline (from OB-75): ~719 entities, 6 components each');
SCRIPT
echo "Baseline script created"
```

**Commit:** `OB-78 Phase 0: Diagnostic — Intent executor, calculation route, database state`

---

## PHASE 1: ARCHITECTURE DECISIONS

```
ARCHITECTURE DECISION RECORD — OB-78
=====================================

DECISION 1: How does Intent composability work?
  Problem: ScalarMultiply.rate is currently `number`. It needs to accept IntentOperation too.
  
  Option A: Union type — rate: number | IntentOperation
    - Scale test: Yes, recursive execution is O(depth), not O(entities)
    - AI-first: No hardcoding, structural only
    - Pro: Minimal type change, backward compatible
    - Con: Executor needs recursive dispatch
  
  Option B: Wrapper operation — new "compose" primitive
    - Scale test: Yes
    - AI-first: No hardcoding
    - Pro: Explicit composition
    - Con: New primitive, more complex types
  
  CHOSEN: Option A — union type. Simpler. The executor already handles dispatch.
  
  Additional fields that accept nested operations:
  - ScalarMultiply.rate → number | IntentOperation
  - BoundedLookup1D.input → IntentSource | IntentOperation (input can be computed)
  - BoundedLookup2D.inputs.row / .column → IntentSource | IntentOperation
  - Aggregate.source can already be a metric reference, no nesting needed
  - Ratio.numerator / .denominator → IntentSource (keep simple, values are always data references)

DECISION 2: Where does the SynapticSurface live during a run?
  
  Option A: Module-level singleton (created per API request)
    - Pro: Simple, no dependency injection
    - Con: Must ensure cleanup between requests
  
  Option B: Passed as parameter through the calculation chain
    - Pro: Explicit, testable, no shared state concerns
    - Con: Touches many function signatures
  
  CHOSEN: Option B — explicit parameter. The surface is created in the calculation route,
  passed to the executor, and consolidated after the run. Clean lifecycle.

DECISION 3: Where does synaptic_density persist?

  Option A: New Supabase table `synaptic_density`
    - Pro: Clean schema, proper indexing, RLS
    - Con: New migration
  
  Option B: In tenant metadata or calculation_batches config
    - Pro: No new table
    - Con: Wrong place, poor querying, no indexing
  
  CHOSEN: Option A — new table. Density is a first-class concept.

DECISION 4: How does execution mode affect the current dual-path?

  When density says "silent" (confidence ≥ 0.95):
  - Intent executor runs (fast path)
  - Current engine SKIPPED
  - No dual-path comparison
  - This IS the engine cutover — it happens automatically per component per tenant
  
  When density says "light_trace" or "full_trace":
  - Both engines run (dual-path continues)
  - Comparison feeds density confidence update
  
  This means engine cutover is gradual, automatic, and reversible.
  If an anomaly spikes, density drops, dual-path resumes.
```

**Commit:** `OB-78 Phase 1: Architecture decisions — composability, surface lifecycle, density persistence`

---

## MISSION 1: INTENT COMPOSABILITY (Close the S25 Gap)

### 1A: Extend intent-types.ts

Modify `ScalarMultiply` to accept nested operations:

```typescript
export interface ScalarMultiply {
  operation: 'scalar_multiply';
  input: IntentSource | IntentOperation;  // Can be a nested operation
  rate: number | IntentOperation;          // Can be a nested operation (e.g., lookup result)
}
```

Modify `BoundedLookup1D` input:
```typescript
export interface BoundedLookup1D {
  operation: 'bounded_lookup_1d';
  input: IntentSource | IntentOperation;   // Can be a computed value
  boundaries: Boundary[];
  outputs: number[];
  noMatchBehavior: 'zero' | 'error' | 'nearest';
}
```

Modify `BoundedLookup2D` inputs:
```typescript
export interface BoundedLookup2D {
  operation: 'bounded_lookup_2d';
  inputs: {
    row: IntentSource | IntentOperation;    // Can be computed
    column: IntentSource | IntentOperation;  // Can be computed
  };
  rowBoundaries: Boundary[];
  columnBoundaries: Boundary[];
  outputGrid: number[][];
  noMatchBehavior: 'zero' | 'error' | 'nearest';
}
```

Add a type guard:
```typescript
export function isIntentOperation(value: unknown): value is IntentOperation {
  return typeof value === 'object' && value !== null && 'operation' in value;
}
```

### 1B: Update intent-executor.ts with recursive dispatch

The key change: wherever the executor resolves a source value, check if it's an IntentOperation and recurse.

```typescript
function resolveValue(
  sourceOrOp: IntentSource | IntentOperation,
  entityData: EntityData,
  surface?: SynapticSurface  // optional until Mission 2
): number {
  if (isIntentOperation(sourceOrOp)) {
    // Recursive: execute the nested operation to get a value
    const nestedResult = executeOperation(sourceOrOp, entityData, surface);
    return nestedResult;
  }
  // Existing: resolve from entityData
  return resolveSource(sourceOrOp, entityData);
}
```

Update `executeScalarMultiply`:
```typescript
function executeScalarMultiply(op: ScalarMultiply, entityData: EntityData, surface?: SynapticSurface): number {
  const inputValue = resolveValue(op.input, entityData, surface);
  const rateValue = typeof op.rate === 'number' ? op.rate : resolveValue(op.rate, entityData, surface);
  return inputValue * rateValue;
}
```

Update `executeBoundedLookup1D`:
```typescript
function executeBoundedLookup1D(op: BoundedLookup1D, entityData: EntityData, surface?: SynapticSurface): number {
  const inputValue = resolveValue(op.input, entityData, surface);
  const matchIndex = findBoundaryIndex(op.boundaries, inputValue);
  // ... rest unchanged
}
```

Similarly for `executeBoundedLookup2D` row/column inputs.

### 1C: Update intent-validator.ts for nested operations

The validator must recursively validate nested operations:

```typescript
function validateSource(source: unknown): string[] {
  if (isIntentOperation(source)) {
    return validateIntent(source);  // recursive validation
  }
  // Existing source validation
  return validateIntentSource(source);
}
```

### 1D: Tests for composability

```bash
cat << 'SCRIPT' > web/scripts/ob78-test-composability.ts
import { executeIntent } from '../src/lib/calculation/intent-executor';
// ... import types

// Test 1: Scalar multiply where rate comes from a 1D lookup
// (franchise royalty: rate depends on revenue tier)
const composedIntent: ComponentIntent = {
  componentIndex: 0,
  label: "Composed Test 1",
  confidence: 1.0,
  dataSource: { sheetClassification: "test", entityScope: "entity", requiredMetrics: ["amount"] },
  intent: {
    operation: "scalar_multiply",
    input: { source: "metric", sourceSpec: { field: "metric:amount" } },
    rate: {
      operation: "bounded_lookup_1d",
      input: { source: "metric", sourceSpec: { field: "metric:amount" } },
      boundaries: [
        { min: 0, max: 99999 },
        { min: 100000, max: 249999 },
        { min: 250000, max: null }
      ],
      outputs: [0.06, 0.055, 0.05],
      noMatchBehavior: "zero"
    }
  },
  modifiers: [],
  metadata: {}
};

const entity = { entityId: "test-1", metrics: { "amount": 325000 }, attributes: {} };
const result = executeIntent(composedIntent, entity);
// Expected: amount=325000, lookup → 0.05 (third tier), 325000 * 0.05 = 16250
assert(result.outcome === 16250, `Expected 16250, got ${result.outcome}`);

// Test 2: 1D lookup where input is a ratio (computed, not direct metric)
const ratioInput: ComponentIntent = {
  componentIndex: 1,
  label: "Composed Test 2",
  confidence: 1.0,
  dataSource: { sheetClassification: "test", entityScope: "entity", requiredMetrics: ["actual", "target"] },
  intent: {
    operation: "bounded_lookup_1d",
    input: {
      operation: "ratio",
      numerator: { source: "metric", sourceSpec: { field: "metric:actual" } },
      denominator: { source: "metric", sourceSpec: { field: "metric:target" } },
      zeroDenominatorBehavior: "zero"
    },
    boundaries: [
      { min: 0, max: 0.9999 },
      { min: 1.0, max: 1.0499 },
      { min: 1.05, max: null }
    ],
    outputs: [0, 500, 1000],
    noMatchBehavior: "zero"
  },
  modifiers: [],
  metadata: {}
};

const entity2 = { entityId: "test-2", metrics: { "actual": 105000, "target": 100000 }, attributes: {} };
const result2 = executeIntent(ratioInput, entity2);
// Expected: ratio = 1.05, matches third tier, output = 1000
assert(result2.outcome === 1000, `Expected 1000, got ${result2.outcome}`);

// Test 3: 2D lookup where row input is a computed ratio
const composed2D: ComponentIntent = {
  componentIndex: 2,
  label: "Composed Test 3",
  confidence: 1.0,
  dataSource: { sheetClassification: "test", entityScope: "entity", requiredMetrics: ["actual", "target", "group_total"] },
  intent: {
    operation: "bounded_lookup_2d",
    inputs: {
      row: {
        operation: "ratio",
        numerator: { source: "metric", sourceSpec: { field: "metric:actual" } },
        denominator: { source: "metric", sourceSpec: { field: "metric:target" } },
        zeroDenominatorBehavior: "zero"
      },
      column: { source: "metric", sourceSpec: { field: "metric:group_total" } }
    },
    rowBoundaries: [
      { min: 0, max: 0.9999 },
      { min: 1.0, max: null }
    ],
    columnBoundaries: [
      { min: 0, max: 149999 },
      { min: 150000, max: null }
    ],
    outputGrid: [
      [0, 100],
      [500, 1000]
    ],
    noMatchBehavior: "zero"
  },
  modifiers: [],
  metadata: {}
};

const entity3 = { entityId: "test-3", metrics: { "actual": 110000, "target": 100000, "group_total": 200000 }, attributes: {} };
const result3 = executeIntent(composed2D, entity3);
// Expected: ratio = 1.1 (row 1), group_total = 200000 (col 1), grid[1][1] = 1000
assert(result3.outcome === 1000, `Expected 1000, got ${result3.outcome}`);

// Test 4: Backward compatibility — existing flat intents still work
const flatIntent: ComponentIntent = {
  componentIndex: 3,
  label: "Flat Test",
  confidence: 1.0,
  dataSource: { sheetClassification: "test", entityScope: "entity", requiredMetrics: ["amount"] },
  intent: {
    operation: "scalar_multiply",
    input: { source: "metric", sourceSpec: { field: "metric:amount" } },
    rate: 0.10  // plain number, not nested operation
  },
  modifiers: [],
  metadata: {}
};

const entity4 = { entityId: "test-4", metrics: { "amount": 50000 }, attributes: {} };
const result4 = executeIntent(flatIntent, entity4);
assert(result4.outcome === 5000, `Expected 5000, got ${result4.outcome}`);

// Test 5: Three levels deep — scalar_multiply(lookup_1d(ratio()))
const threeDeep: ComponentIntent = {
  componentIndex: 4,
  label: "Three-Deep Composition",
  confidence: 1.0,
  dataSource: { sheetClassification: "test", entityScope: "entity", requiredMetrics: ["actual", "target"] },
  intent: {
    operation: "scalar_multiply",
    input: { source: "metric", sourceSpec: { field: "metric:actual" } },
    rate: {
      operation: "bounded_lookup_1d",
      input: {
        operation: "ratio",
        numerator: { source: "metric", sourceSpec: { field: "metric:actual" } },
        denominator: { source: "metric", sourceSpec: { field: "metric:target" } },
        zeroDenominatorBehavior: "zero"
      },
      boundaries: [
        { min: 0, max: 0.9999 },
        { min: 1.0, max: null }
      ],
      outputs: [0.05, 0.10],
      noMatchBehavior: "zero"
    }
  },
  modifiers: [],
  metadata: {}
};

const entity5 = { entityId: "test-5", metrics: { "actual": 120000, "target": 100000 }, attributes: {} };
const result5 = executeIntent(threeDeep, entity5);
// Expected: ratio = 1.2, lookup → 0.10, 120000 * 0.10 = 12000
assert(result5.outcome === 12000, `Expected 12000, got ${result5.outcome}`);

console.log('All composability tests passed');
SCRIPT
npx tsx web/scripts/ob78-test-composability.ts
```

**Proof gates:**
- PG-1: Nested scalar_multiply(bounded_lookup_1d()) produces correct result
- PG-2: Nested bounded_lookup_1d(ratio()) produces correct result
- PG-3: Nested bounded_lookup_2d with computed row input works
- PG-4: Flat (non-nested) intents still work (backward compatible)
- PG-5: Three-level deep composition works
- PG-6: Validator accepts nested operations
- PG-7: Validator rejects malformed nested operations
- PG-8: Korean Test — zero domain words in intent-types.ts, intent-executor.ts

**Commit:** `OB-78 Mission 1: Intent composability — recursive execution, nested operations, 8 proof gates`

---

## MISSION 2: SYNAPTIC STATE FOUNDATION

### 2A: Create synaptic-types.ts

```bash
# Create: web/src/lib/calculation/synaptic-types.ts
```

Define all Synaptic State types from the specification:
- `Synapse`, `SynapseType`, `SynapticSurface`, `SynapticDensity`, `PatternDensity`, `ExecutionMode`
- `DENSITY_THRESHOLDS` constants
- `AGENT_SUBSCRIPTIONS` map

**Zero domain language.** Korean Test applies.

### 2B: Create synaptic-surface.ts

```bash
# Create: web/src/lib/calculation/synaptic-surface.ts
```

Implement the in-memory Synaptic Surface:

```typescript
export function createSynapticSurface(density?: SynapticDensity): SynapticSurface {
  // Initialize empty maps
  // Pre-populate from density if provided
}

export function writeSynapse(surface: SynapticSurface, synapse: Synapse): void {
  // Append to appropriate map based on scope
  // Update running stats
  // O(1) — no DB calls
}

export function readSynapses(
  surface: SynapticSurface, 
  type: SynapseType, 
  scope: 'run' | 'component' | 'entity',
  key?: string | number  // componentIndex or entityId
): Synapse[] {
  // Read from appropriate map
  // Filter by propagation threshold
  // O(1) lookup + O(n) filter where n is synapses of that type
}

export function getExecutionMode(
  surface: SynapticSurface,
  patternSignature: string
): ExecutionMode {
  // Check density for this pattern
  // Return full_trace / light_trace / silent based on thresholds
}

export function consolidateSurface(surface: SynapticSurface): {
  densityUpdates: Array<{ signature: string; newConfidence: number; newMode: ExecutionMode }>;
  signalBatch: Array<Record<string, unknown>>;
} {
  // After run: compute density updates from accumulated synapses
  // Produce batch signal writes
  // This is the nanobatch consolidation step
}
```

### 2C: Create synaptic-density.ts

```bash
# Create: web/src/lib/calculation/synaptic-density.ts
```

Implement density persistence:

```typescript
export async function loadDensity(tenantId: string): Promise<SynapticDensity> {
  // Single Supabase query: all density rows for tenant
  // Returns Map<string, PatternDensity>
}

export async function persistDensityUpdates(
  tenantId: string, 
  updates: Array<{ signature: string; newConfidence: number; newMode: ExecutionMode }>
): Promise<void> {
  // Single Supabase upsert (batch)
  // Uses ON CONFLICT (tenant_id, pattern_signature) DO UPDATE
}

export async function nuclearClear(
  tenantId: string, 
  scope: 'all' | 'pattern', 
  patternSignature?: string
): Promise<void> {
  // Reset density to 0.5, execution_mode to 'full_trace'
}
```

### 2D: Create pattern-signature.ts

```bash
# Create: web/src/lib/calculation/pattern-signature.ts
```

```typescript
export function generatePatternSignature(intent: ComponentIntent): string {
  // Structural hash: operation type + source types + boundary count + grid dimensions + modifiers + scope
  // Zero domain language — purely structural
  // Examples:
  //   "bounded_lookup_2d:ratio+aggregate:g4x6:entity"
  //   "scalar_multiply:metric:entity"
  //   "conditional_gate:metric+metric:cap:entity"
}
```

### 2E: Create anomaly-detector.ts

```bash
# Create: web/src/lib/calculation/anomaly-detector.ts
```

Lightweight, inline anomaly checks (no LLM calls):

```typescript
export function checkBoundaryAnomaly(value: number, boundaries: Boundary[], matchIndex: number): Synapse | null;
export function checkOutputAnomaly(output: number, historicalOutputs: number[]): Synapse | null;
export function checkZeroOutput(entityId: string, componentIndex: number): Synapse | null;
export function checkInputRange(input: number, expectedMin: number, expectedMax: number): Synapse | null;
```

### 2F: Create Supabase migration for synaptic_density

```sql
CREATE TABLE IF NOT EXISTS synaptic_density (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pattern_signature TEXT NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  total_executions INTEGER NOT NULL DEFAULT 0,
  last_anomaly_rate NUMERIC DEFAULT 0,
  last_correction_count INTEGER DEFAULT 0,
  execution_mode TEXT NOT NULL DEFAULT 'full_trace',
  learned_behaviors JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(tenant_id, pattern_signature)
);

CREATE INDEX idx_density_tenant ON synaptic_density(tenant_id);
ALTER TABLE synaptic_density ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_density" ON synaptic_density
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    OR (SELECT scope_level FROM profiles WHERE id = auth.uid()) = 'platform'
  );

CREATE POLICY "service_write_density" ON synaptic_density
  FOR ALL USING (true) WITH CHECK (true);
```

**Execute in Supabase SQL Editor. Verify with:**
```sql
SELECT table_name FROM information_schema.tables WHERE table_name = 'synaptic_density';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'synaptic_density';
```

### 2G: Tests for Synaptic State

```bash
cat << 'SCRIPT' > web/scripts/ob78-test-synaptic.ts
// Test 1: Surface creation and synapse read/write
// Test 2: Execution mode determination from density
// Test 3: Pattern signature generation (structural, no domain words)
// Test 4: Anomaly detection (boundary match, zero output, range violation)
// Test 5: Surface consolidation produces correct density updates
// Test 6: Korean Test — zero domain words in all synaptic files
// Test 7: Density persistence round-trip (write + read from Supabase)
// Test 8: Nuclear clear resets density correctly
// Test 9: Pattern signature stability (same intent → same signature)
// Test 10: Different intents with same structure → same signature
SCRIPT
npx tsx web/scripts/ob78-test-synaptic.ts
```

**Proof gates:**
- PG-9: SynapticSurface read/write works in memory
- PG-10: Execution mode correctly determined from density thresholds
- PG-11: Pattern signatures are structural (no domain words in output)
- PG-12: Same structure, different labels → same signature
- PG-13: Anomaly detector fires on boundary exact match
- PG-14: Anomaly detector fires on zero output
- PG-15: Surface consolidation produces valid density updates
- PG-16: Density round-trip to Supabase works
- PG-17: Nuclear clear resets to 0.5 / full_trace
- PG-18: Korean Test — zero domain words in synaptic-types.ts, synaptic-surface.ts, synaptic-density.ts, pattern-signature.ts, anomaly-detector.ts

**Commit:** `OB-78 Mission 2: Synaptic State foundation — surface, density, signatures, anomaly detection`

---

## MISSION 3: WIRE SYNAPTIC STATE INTO CALCULATION

### 3A: Modify the calculation route

In `web/src/app/api/calculation/run/route.ts`:

1. **Before the entity loop:** Load density for the tenant. Create SynapticSurface.
2. **During the entity loop:** For each component:
   - Generate pattern signature
   - Check execution mode from density
   - If **silent**: run Intent executor only (skip current engine). Minimal trace.
   - If **light_trace**: run both engines. Record anomalies only.
   - If **full_trace**: run both engines. Full trace and synapse writes.
   - Write synapses for confidence, anomalies, boundary behavior
3. **After the entity loop:** 
   - Consolidate surface → density updates
   - Batch-write density updates (single Supabase upsert)
   - Batch-write training signals (one per component, not per entity)

### 3B: Add timing instrumentation

```typescript
const runStartTime = performance.now();
let entitiesProcessed = 0;
let silentCount = 0;
let lightCount = 0;
let fullCount = 0;

// ... in the entity loop:
const mode = getExecutionMode(surface, signature);
if (mode === 'silent') silentCount++;
else if (mode === 'light_trace') lightCount++;
else fullCount++;

// ... after the loop:
const runDuration = performance.now() - runStartTime;
const timingMetadata = {
  totalMs: runDuration,
  entitiesProcessed,
  executionModes: { silent: silentCount, light: lightCount, full: fullCount },
  synapsesWritten: surface.stats.totalSynapsesWritten,
  anomalyRate: surface.stats.anomalyRate,
};
```

Store `timingMetadata` in `calculation_batches.config` alongside existing config.

### 3C: Tests for wired Synaptic State

```bash
cat << 'SCRIPT' > web/scripts/ob78-test-wired-synaptic.ts
// Test 1: Calculation route loads density before loop
// Test 2: Calculation route creates SynapticSurface
// Test 3: Pattern signatures generated for each component
// Test 4: Execution mode checked per component
// Test 5: Silent mode skips current engine
// Test 6: Timing metadata stored in batch config
// Test 7: Density updates persisted after run
// Test 8: Training signals batched (one per component, not per entity)
SCRIPT
npx tsx web/scripts/ob78-test-wired-synaptic.ts
```

**Proof gates:**
- PG-19: Density loaded before entity loop
- PG-20: SynapticSurface created and passed to executor
- PG-21: Timing metadata present in calculation_batches.config
- PG-22: Density updates written to synaptic_density table after run
- PG-23: Silent mode entities skip current engine execution
- PG-24: Training signals are batched (verify count = component count, not entity count)

**Commit:** `OB-78 Mission 3: Synaptic State wired into calculation route — density-adaptive execution`

---

## MISSION 4: PROGRESSIVE PERFORMANCE PROOF

This is the critical proof. Run the same calculation three times and demonstrate decreasing processing time.

### 4A: First run — establish baseline

```bash
cat << 'SCRIPT' > web/scripts/ob78-progressive-proof.ts
/**
 * Progressive Performance Proof
 * 
 * Triggers 3 calculation runs for Pipeline Test Co and measures:
 * 1. Processing time per run
 * 2. Execution mode distribution (full/light/silent)
 * 3. Synaptic density progression
 * 
 * Expected: T₂ < T₁, T₃ < T₂
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function triggerCalculation(): Promise<{ duration: number; modes: any; density: any }> {
  // Call the calculation API
  const start = performance.now();
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'http://localhost:3000' : ''}/api/calculation/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: TENANT_ID })
  });
  const duration = performance.now() - start;
  const result = await response.json();
  
  // Read density
  const { data: density } = await supabase
    .from('synaptic_density')
    .select('pattern_signature, confidence, execution_mode, total_executions')
    .eq('tenant_id', TENANT_ID);
  
  // Read batch timing
  const { data: batch } = await supabase
    .from('calculation_batches')
    .select('config')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  return {
    duration,
    modes: (batch?.config as any)?.timingMetadata?.executionModes,
    density: density
  };
}

async function main() {
  console.log('=== Progressive Performance Proof ===');
  console.log('');
  
  // Nuclear clear — start fresh
  await supabase.from('synaptic_density').delete().eq('tenant_id', TENANT_ID);
  console.log('Density cleared. Starting from zero.');
  console.log('');
  
  // Run 1
  console.log('--- Run 1 (baseline) ---');
  const r1 = await triggerCalculation();
  console.log(`Duration: ${r1.duration.toFixed(0)}ms`);
  console.log(`Modes: ${JSON.stringify(r1.modes)}`);
  console.log(`Density entries: ${r1.density?.length || 0}`);
  r1.density?.forEach((d: any) => console.log(`  ${d.pattern_signature}: ${d.confidence} (${d.execution_mode})`));
  console.log('');
  
  // Run 2
  console.log('--- Run 2 (with density from Run 1) ---');
  const r2 = await triggerCalculation();
  console.log(`Duration: ${r2.duration.toFixed(0)}ms`);
  console.log(`Modes: ${JSON.stringify(r2.modes)}`);
  r2.density?.forEach((d: any) => console.log(`  ${d.pattern_signature}: ${d.confidence} (${d.execution_mode})`));
  const improvement1 = ((r1.duration - r2.duration) / r1.duration * 100).toFixed(1);
  console.log(`Improvement vs Run 1: ${improvement1}%`);
  console.log('');
  
  // Run 3
  console.log('--- Run 3 (with density from Run 2) ---');
  const r3 = await triggerCalculation();
  console.log(`Duration: ${r3.duration.toFixed(0)}ms`);
  console.log(`Modes: ${JSON.stringify(r3.modes)}`);
  r3.density?.forEach((d: any) => console.log(`  ${d.pattern_signature}: ${d.confidence} (${d.execution_mode})`));
  const improvement2 = ((r1.duration - r3.duration) / r1.duration * 100).toFixed(1);
  console.log(`Improvement vs Run 1: ${improvement2}%`);
  console.log('');
  
  // Assertions
  console.log('=== Assertions ===');
  const pass1 = r2.duration < r1.duration;
  const pass2 = r3.duration < r2.duration;
  const pass3 = r3.modes?.silent > 0;
  console.log(`Run 2 faster than Run 1: ${pass1 ? 'PASS' : 'FAIL'}`);
  console.log(`Run 3 faster than Run 2: ${pass2 ? 'PASS' : 'FAIL'}`);
  console.log(`Run 3 has silent executions: ${pass3 ? 'PASS' : 'FAIL'}`);
}

main().catch(console.error);
SCRIPT
npx tsx web/scripts/ob78-progressive-proof.ts
```

**Proof gates:**
- PG-25: Run 2 is faster than Run 1
- PG-26: Run 3 is faster than Run 2
- PG-27: Run 3 has at least some silent-mode executions
- PG-28: Density confidence increases with each run
- PG-29: Execution mode distribution shifts from full → light → silent across runs

**Commit:** `OB-78 Mission 4: Progressive performance proof — T₃ < T₂ < T₁`

---

## MISSION 5: ENGINE CUTOVER INTEGRATION

### 5A: Add density-based cutover logic

In the calculation route, the cutover is already implicit in Mission 3 (silent mode skips current engine). Document the cutover criteria explicitly:

```typescript
// Engine cutover is density-driven, not calendar-driven.
// When a component pattern reaches confidence ≥ 0.95 (silent mode):
// - Intent executor runs alone
// - Current engine is NOT executed
// - No dual-path comparison
// - This IS the engine cutover
//
// If anomaly rate spikes, density drops, dual-path resumes automatically.
// Cutover is gradual (per component, per tenant), automatic, and reversible.
```

### 5B: Add cutover dashboard data

Expose density data for the admin UI so operators can see which components have achieved cutover:

```typescript
// In a new API route or extend existing:
// GET /api/admin/synaptic-density?tenantId=...
// Returns: pattern signatures, confidence, execution mode, total executions
// This lets the admin see: "Optical Sales is at 97% confidence (silent), Insurance is at 62% (full_trace)"
```

### 5C: Nuclear clear API

```typescript
// POST /api/admin/nuclear-clear
// Body: { tenantId, scope: 'all' | 'pattern', patternSignature? }
// Resets density to 0.5, execution_mode to 'full_trace'
// Used when: plan changes, data restructures, deliberate re-validation
```

**Proof gates:**
- PG-30: Nuclear clear API resets density
- PG-31: After nuclear clear, next run executes in full_trace mode
- PG-32: Density data retrievable via API for admin visibility

**Commit:** `OB-78 Mission 5: Engine cutover integration — density-driven, reversible, observable`

---

## MISSION 6: KOREAN TEST + INTEGRATION CLT

### 6A: Korean Test

```bash
echo "=== KOREAN TEST — FOUNDATIONAL CODE ==="
echo ""
echo "Zero domain words in these files:"
for f in intent-types.ts intent-executor.ts synaptic-types.ts synaptic-surface.ts synaptic-density.ts pattern-signature.ts anomaly-detector.ts; do
  count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt" "web/src/lib/calculation/$f" 2>/dev/null || echo "0")
  echo "  $f: $count domain words"
done
echo ""
echo "Domain words acceptable in these files:"
for f in intent-transformer.ts intent-resolver.ts; do
  count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt" "web/src/lib/calculation/$f" 2>/dev/null || echo "0")
  echo "  $f: $count (bridge code, acceptable)"
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
□ All composability tests pass? (5 tests)
□ All synaptic tests pass? (10 tests)
□ All wired tests pass? (8 tests)
□ Progressive proof: T₂ < T₁?
□ Progressive proof: T₃ < T₂?
□ Korean Test: 0 domain words in foundational files?
□ Supabase: synaptic_density table exists with correct columns?
□ Supabase: density rows created after calculation run?
□ Nuclear clear resets density?
□ Timing metadata in calculation_batches.config?
□ gh pr create executed?
```

**Commit:** `OB-78 Mission 6: Korean Test + Integration CLT — all gates pass`

---

## COMPLETION REPORT

Save as `OB-78_COMPLETION_REPORT.md` in **PROJECT ROOT**.

Structure:
1. **Architecture Decisions** — all 4 decisions with rationale
2. **Commits** — all with hashes
3. **Files created** — every new file
4. **Files modified** — every changed file
5. **Proof gates** — 32 gates, each PASS/FAIL with evidence
6. **Composability proof** — all 5 composition tests with results
7. **Synaptic State proof** — surface, density, anomaly detection evidence
8. **Progressive Performance Proof** — T₁, T₂, T₃ with percentage improvements
9. **Density Progression** — confidence scores after each run
10. **Korean Test** — grep output for all foundational files
11. **Known issues** — honest gaps

**Include the timing numbers prominently.** This is the proof that the Synaptic State delivers measurable performance improvement.

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-78: Intent Composability + Synaptic State Foundation + Progressive Performance" \
  --body "## Tier 1 Agentic Metamorphosis

### Mission 1: Intent Composability
- Operations nest recursively (scalar_multiply(bounded_lookup_1d()))
- Backward compatible with flat intents
- 5 composition tests pass

### Mission 2: Synaptic State Foundation
- In-memory SynapticSurface with O(1) read/write
- Persistent SynapticDensity in Supabase
- Pattern signature generation (structural, domain-agnostic)
- Lightweight anomaly detection (no LLM calls)
- 10 synaptic tests pass

### Mission 3: Density-Adaptive Execution
- Calculation route loads density, adapts per component
- Silent mode (confidence ≥ 0.95) skips dual-path
- Timing metadata captured per run

### Mission 4: Progressive Performance Proof
- T₂ < T₁, T₃ < T₂ — system gets faster with each run
- Density confidence increases automatically
- Execution modes shift from full_trace → silent

### Mission 5: Engine Cutover
- Density-driven, per-component, per-tenant, reversible
- Nuclear clear API for deliberate re-validation
- Admin visibility into cutover status

### Korean Test: PASS — zero domain words in foundational code
### Proof Gates: 32 — see OB-78_COMPLETION_REPORT.md"
```

**Commit:** `OB-78 Final: Completion report + PR`

---

## MAXIMUM SCOPE

6 missions, 32 proof gates. After OB-78:

1. Intent composability closes S25 gap ✓
2. Synaptic State is live with density-adaptive execution ✓
3. Processing time measurably decreases on repeated runs ✓
4. Engine cutover is automatic, gradual, and reversible ✓
5. All foundational code is domain-agnostic (Korean Test) ✓
6. System scales to 150K entities (no per-entity DB calls, all batch I/O) ✓

---

*"The system gets faster and cheaper the more it's used. This is the moat."*

*"Agents don't send messages to each other. They share a nervous system."*

*"Engine cutover isn't a migration. It's confidence reaching a threshold."*

*OB-78 — February 22, 2026*
