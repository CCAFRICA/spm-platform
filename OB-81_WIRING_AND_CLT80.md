# OB-81: WIRE THE NERVOUS SYSTEM INTO THE LIVE PIPELINE
## Connect OB-78/79/80 Infrastructure to Production Execution Path

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Synaptic_State_Specification.md` — Synaptic State protocol
4. `OB-78_COMPLETION_REPORT.md` — Synaptic State foundation
5. `OB-79_COMPLETION_REPORT.md` — Reconciliation + Insight + Resolution Agents
6. `OB-80_COMPLETION_REPORT.md` — Negotiation protocol, flywheels, agent memory

**Critical context from OB-80 completion report — "What's Next" section:**
> 1. Domain Agent Runtime: Wire negotiation protocol into actual pipeline execution
> 2. Flywheel Write Path: Wire `postConsolidationFlywheel()` into the calculation route
> 3. Agent Memory Integration: Wire `loadPriorsForAgent()` into agent initialization
> 4. Temporal Window Data Loading: Batch-load period history in the calculation pipeline
> 5. Additional Domains: Insurance, Royalties, Channel Incentives

Items 1-4 are this OB. Item 5 is future work.

**Read all six files before writing any code.**

---

## WHAT THIS OB DOES

OB-78/79/80 built the infrastructure. OB-81 connects it. Every system built in the metamorphosis gets wired into the live execution path:

1. **Flywheel write path** — After synaptic density consolidation, `postConsolidationFlywheel()` fires to aggregate into foundational_patterns and domain_patterns.

2. **Agent memory read path** — Before the calculation loop, `loadPriorsForAgent()` loads three-flywheel priors. Priors replace the direct `loadDensityForTenant()` call with the unified interface that includes cold start support.

3. **Period history loading** — Before the calculation loop, batch-load prior period results for temporal_window support. One query, cached for the run.

4. **Reconciliation agent wiring** — POST /api/reconciliation/run calls `reconcile()` with priors loaded. Correction synapses persist to density.

5. **Insight agent wiring** — Post-calculation, `generateFullAnalysis()` fires async with priors. Inline insights checked during calculation at checkpoints.

6. **Resolution agent wiring** — POST /api/disputes/[id]/investigate calls `investigate()` with priors loaded.

7. **Supabase migration execution** — Run migration 015 (synaptic_density) and 016 (flywheel tables) against live database.

**This is plumbing, not architecture. The decisions are made. The code exists. Wire it.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain language in Foundational code.** Korean Test still applies.
8. **No per-entity Supabase calls during calculation loop.**
9. **No per-entity LLM calls.**
10. **Every wiring change must preserve existing behavior.** If the wiring fails, the calculation must still produce correct results. Defensive coding — try/catch around all new wiring, log errors, never block the response.

---

## PHASE 0: DIAGNOSTIC

### 0A: Read the calculation route (the main wiring target)

```bash
echo "=== CALCULATION ROUTE — FULL FILE ==="
cat web/src/app/api/calculation/run/route.ts
```

### 0B: Read the Supabase migration files

```bash
echo "=== MIGRATION 015 (Synaptic Density) ==="
cat web/supabase/migrations/015_synaptic_density.sql 2>/dev/null || echo "NOT FOUND"

echo ""
echo "=== MIGRATION 016 (Flywheel Tables) ==="
cat web/supabase/migrations/016_flywheel_tables.sql 2>/dev/null || echo "NOT FOUND"

echo ""
echo "=== ALL MIGRATIONS ==="
ls -la web/supabase/migrations/ 2>/dev/null || ls -la supabase/migrations/ 2>/dev/null
```

### 0C: Read the flywheel pipeline and agent memory

```bash
echo "=== FLYWHEEL PIPELINE ==="
cat web/src/lib/calculation/flywheel-pipeline.ts

echo ""
echo "=== AGENT MEMORY ==="
cat web/src/lib/agents/agent-memory.ts
```

### 0D: Read the API routes for reconciliation, insights, disputes

```bash
echo "=== RECONCILIATION ROUTE ==="
cat web/src/app/api/reconciliation/run/route.ts 2>/dev/null || echo "NOT FOUND — needs creation or check path"
find web/src/app/api -path "*reconcil*" -name "route.ts" | head -5

echo ""
echo "=== INSIGHTS ROUTE ==="
find web/src/app/api -path "*insight*" -name "route.ts" | head -5
cat web/src/app/api/insights/route.ts 2>/dev/null || echo "NOT FOUND — check path"

echo ""
echo "=== DISPUTE INVESTIGATION ROUTE ==="
find web/src/app/api -path "*dispute*" -name "route.ts" | head -5
find web/src/app/api -path "*investigate*" -name "route.ts" | head -5
```

### 0E: Read the density route and density loading

```bash
echo "=== DENSITY ROUTE ==="
cat web/src/app/api/calculation/density/route.ts 2>/dev/null || echo "NOT FOUND"

echo ""
echo "=== DENSITY LOADING FUNCTION ==="
grep -n "loadDensity\|loadPatterns\|getDensity" web/src/lib/calculation/synaptic-density.ts
```

### 0F: Check if prior period data is accessible

```bash
echo "=== CALCULATION RESULTS TABLE STRUCTURE ==="
grep -rn "calculation_results\|calculation_batches" web/src/app/api/calculation/ --include="*.ts" | head -15

echo ""
echo "=== PERIOD STRUCTURE ==="
grep -rn "period_id\|periods" web/src/app/api/calculation/ --include="*.ts" | head -10
```

**Commit:** `OB-81 Phase 0: Diagnostic — calculation route, migrations, API routes, density loading`

---

## MISSION 1: SUPABASE MIGRATIONS — EXECUTE LIVE

### 1A: Verify and execute migration 015 (synaptic_density)

The migration file was created in OB-78 but may not have been executed against the live database. Check and execute:

```bash
# Check if synaptic_density table exists
echo "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'synaptic_density');" | \
  npx supabase db execute 2>/dev/null || echo "Cannot execute directly — check Supabase dashboard"
```

If the table doesn't exist, execute the migration. If Supabase CLI isn't available for direct execution, create a migration script that can be run through the Supabase dashboard or API.

### 1B: Verify and execute migration 016 (flywheel tables)

Same for foundational_patterns and domain_patterns.

### 1C: Verify RLS policies

Both flywheel tables should have:
- SELECT for authenticated users (anyone can read structural priors)
- INSERT/UPDATE restricted to service role (only the aggregation pipeline writes)

### 1D: Verify synaptic_density RLS

```bash
echo "=== VERIFY RLS ==="
grep -n "POLICY\|RLS\|ENABLE ROW" web/supabase/migrations/015_synaptic_density.sql 2>/dev/null
grep -n "POLICY\|RLS\|ENABLE ROW" web/supabase/migrations/016_flywheel_tables.sql 2>/dev/null
```

**Proof gates:**
- PG-1: synaptic_density table exists (or migration ready to execute)
- PG-2: foundational_patterns table exists (or migration ready to execute)
- PG-3: domain_patterns table exists (or migration ready to execute)

**Commit:** `OB-81 Mission 1: Supabase migrations verified and ready`

---

## MISSION 2: WIRE FLYWHEEL + AGENT MEMORY INTO CALCULATION ROUTE

This is the core wiring mission. The calculation route is the main pipeline. Everything connects here.

### 2A: Replace direct density loading with Agent Memory

Currently the calculation route calls `loadDensityForTenant()` or similar. Replace with `loadPriorsForAgent()`:

```typescript
// BEFORE (OB-78):
// const density = await loadDensityForTenant(tenantId);

// AFTER (OB-81):
import { loadPriorsForAgent } from '@/lib/agents/agent-memory';

// Determine domain from tenant config or default to 'icm'
const domainId = tenantConfig?.domainId || 'icm';
const verticalHint = tenantConfig?.verticalHint;

let priors;
try {
  priors = await loadPriorsForAgent(tenantId, domainId, 'calculation', verticalHint);
} catch (err) {
  console.error('Agent memory load failed, falling back to direct density:', err);
  // Fallback: load density directly if agent memory fails
  priors = { tenantDensity: await loadDensityForTenant(tenantId), foundationalPriors: new Map(), domainPriors: new Map(), signalHistory: { fieldMappingSignals: [], interpretationSignals: [], reconciliationSignals: [], resolutionSignals: [] } };
}

// Use priors.tenantDensity where density was used before
// Cold start: if tenantDensity is empty, loadPriorsForAgent already populated from F2+F3
```

### 2B: Wire flywheel post-consolidation

After the existing synaptic density consolidation (already fire-and-forget from OB-78), add flywheel aggregation:

```typescript
import { postConsolidationFlywheel } from '@/lib/calculation/flywheel-pipeline';

// After synaptic density upsert (existing OB-78 code):
// ... existing consolidation ...

// NEW: Flywheel aggregation (fire-and-forget)
try {
  const densityUpdates = consolidatedDensity.map(d => ({
    patternSignature: d.patternSignature,
    confidence: d.confidence,
    executionCount: d.totalExecutions,
    anomalyRate: d.lastAnomalyRate || 0,
    learnedBehaviors: d.learnedBehaviors || {},
  }));
  
  postConsolidationFlywheel(tenantId, domainId, verticalHint, densityUpdates)
    .catch(err => console.error('Flywheel aggregation error (non-blocking):', err));
} catch (err) {
  console.error('Flywheel wiring error (non-blocking):', err);
}
```

### 2C: Wire period history for temporal_window

Before the entity loop, batch-load prior period results:

```typescript
// Load period history for temporal_window support
let periodHistory: Map<string, Map<string, number[]>> = new Map();
try {
  // Query: for this tenant, load the last N periods of calculation results
  // Grouped by entity_id, keyed by metric name, values as arrays ordered by period
  // This is ONE query, not per-entity
  const TEMPORAL_WINDOW_MAX = 12; // max periods to load
  
  const { data: priorResults } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components, period_id')
    .eq('tenant_id', tenantId)
    .neq('period_id', currentPeriodId)  // exclude current period
    .order('period_id', { ascending: false })
    .limit(TEMPORAL_WINDOW_MAX * entityCount); // rough limit
  
  if (priorResults) {
    // Build: entityId → metric → [values ordered by period]
    for (const row of priorResults) {
      if (!periodHistory.has(row.entity_id)) {
        periodHistory.set(row.entity_id, new Map());
      }
      const entityMetrics = periodHistory.get(row.entity_id)!;
      // Store total_payout as a metric
      const key = 'total_outcome';
      if (!entityMetrics.has(key)) entityMetrics.set(key, []);
      entityMetrics.get(key)!.push(row.total_payout);
    }
  }
} catch (err) {
  console.error('Period history load failed (temporal_window will use current values):', err);
  // periodHistory stays empty — temporal_window gracefully degrades
}

// Pass periodHistory to the executor alongside entityData and surface
```

### 2D: Wire inline insights during calculation

At checkpoint intervals during the entity loop, check inline insights:

```typescript
import { checkInlineInsights } from '@/lib/agents/insight-agent';

// Inside entity loop, at checkpoints:
const INSIGHT_CHECKPOINT_INTERVAL = Math.max(100, Math.floor(entityCount / 10));

for (let i = 0; i < entities.length; i++) {
  // ... existing entity calculation logic ...
  
  // Inline insight check at intervals
  if (i > 0 && i % INSIGHT_CHECKPOINT_INTERVAL === 0) {
    try {
      const inlineInsights = checkInlineInsights(surface, insightConfig, i);
      if (inlineInsights.length > 0) {
        // Store inline insights for batch summary
        allInlineInsights.push(...inlineInsights);
      }
    } catch (err) {
      // Never block calculation for insight failure
      console.error('Inline insight check failed (non-blocking):', err);
    }
  }
}
```

### 2E: Wire async full analysis post-calculation

After the entity loop and consolidation, fire async insight analysis:

```typescript
import { generateFullAnalysis } from '@/lib/agents/insight-agent';

// After consolidation, before response:
// Fire-and-forget: full AI analysis
try {
  generateFullAnalysis(tenantId, batchId, surface, calculationSummary, undefined, priors)
    .then(async (analysis) => {
      // Store analysis in calculation_batches.config
      await supabase
        .from('calculation_batches')
        .update({ config: { ...existingConfig, insightAnalysis: analysis } })
        .eq('id', batchId);
    })
    .catch(err => console.error('Full analysis failed (non-blocking):', err));
} catch (err) {
  console.error('Insight wiring error (non-blocking):', err);
}
```

### 2F: Include inline insights and synaptic stats in response

```typescript
// Add to the API response:
return NextResponse.json({
  ...existingResponse,
  synapticStats: surface.stats,
  inlineInsights: allInlineInsights,
  densityProfile: {
    patternsTracked: priors.tenantDensity.size,
    coldStart: priors.tenantDensity.size === 0,
    flywheelPriorsLoaded: priors.foundationalPriors.size + priors.domainPriors.size,
  },
});
```

### 2G: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob81-test-calculation-wiring.ts
// Test 1: Calculation route compiles with all wiring
// Test 2: Agent memory loads without error (mock Supabase)
// Test 3: Flywheel post-consolidation fires (mock — verify call made)
// Test 4: Period history loads in batch (one query, not per-entity)
// Test 5: Inline insights fire at checkpoints
// Test 6: Full analysis fires async (does not block response)
// Test 7: Response includes synapticStats
// Test 8: Response includes densityProfile
// Test 9: Cold start path works (empty tenant density → F2+F3 priors)
// Test 10: Fallback works (agent memory fails → direct density load)
// Test 11: All wiring is try/catch (failures never block calculation)
// Test 12: Korean Test — no domain words added to calculation route
SCRIPT
npx tsx web/scripts/ob81-test-calculation-wiring.ts
```

**Proof gates:**
- PG-4: Agent memory replaces direct density loading
- PG-5: Flywheel post-consolidation wired and fires
- PG-6: Period history loaded in batch (one query)
- PG-7: Inline insights fire at checkpoints during calculation
- PG-8: Full analysis fires async post-calculation
- PG-9: Response includes synapticStats and densityProfile
- PG-10: All wiring is defensive (try/catch, never blocks)
- PG-11: Cold start path works end-to-end

**Commit:** `OB-81 Mission 2: Wire flywheel + agent memory + insights into calculation route, 8 gates`

---

## MISSION 3: WIRE RECONCILIATION AND RESOLUTION API ROUTES

### 3A: Wire Reconciliation API route

The route was created in OB-79. Wire it to use agent memory and persist results:

```typescript
// In POST /api/reconciliation/run/route.ts:

import { reconcile } from '@/lib/agents/reconciliation-agent';
import { loadPriorsForAgent } from '@/lib/agents/agent-memory';
import { persistDensityUpdates } from '@/lib/calculation/synaptic-density';

export async function POST(request: Request) {
  // 1. Parse request: tenantId, batchId, benchmarkData
  // 2. Load priors for reconciliation agent
  const priors = await loadPriorsForAgent(tenantId, domainId, 'reconciliation');
  
  // 3. Load calculation results for the batch
  // 4. Load execution traces for the batch
  // 5. Create SynapticSurface (or load from batch)
  
  // 6. Run reconciliation
  const report = await reconcile({
    tenantId, batchId, benchmarkData, executionTraces, surface, priors
  });
  
  // 7. Persist report to calculation_batches.config.reconciliation
  // 8. Persist correction synapses → density updates
  // 9. Write training signal (signal_type: 'training:reconciliation_outcome')
  // 10. Return report
}
```

### 3B: Wire Resolution API route

```typescript
// In POST /api/disputes/[id]/investigate/route.ts (or disputes/investigate/route.ts):

import { investigate } from '@/lib/agents/resolution-agent';
import { loadPriorsForAgent } from '@/lib/agents/agent-memory';

export async function POST(request: Request) {
  // 1. Parse request: disputeId (or from URL params)
  // 2. Load dispute from Supabase
  // 3. Load priors for resolution agent
  const priors = await loadPriorsForAgent(tenantId, domainId, 'resolution');
  
  // 4. Load execution traces for the disputed entity
  // 5. Load synaptic history for the disputed entity
  
  // 6. Run investigation
  const investigation = await investigate({ ...disputeContext, priors });
  
  // 7. Persist investigation to disputes.resolution JSONB
  // 8. Write resolution synapse to density
  // 9. Write training signal (signal_type: 'training:dispute_resolution')
  // 10. Return investigation
}
```

### 3C: Wire Insights API route

```typescript
// In GET /api/insights/route.ts (or /api/insights/[batchId]/route.ts):

export async function GET(request: Request) {
  // 1. Parse query params: batchId, persona
  // 2. Load insightAnalysis from calculation_batches.config
  // 3. If not yet available (async still running), return { status: 'processing' }
  // 4. Route to persona using routeToPersona()
  // 5. Return filtered insights
}
```

### 3D: Tests

```bash
cat << 'SCRIPT' > web/scripts/ob81-test-api-wiring.ts
// Test 1: Reconciliation route loads priors
// Test 2: Reconciliation route persists report to calculation_batches
// Test 3: Reconciliation route writes training signal
// Test 4: Resolution route loads priors
// Test 5: Resolution route persists investigation to disputes table
// Test 6: Resolution route writes training signal
// Test 7: Insights route returns persona-filtered results
// Test 8: Insights route returns 'processing' when analysis not ready
// Test 9: All routes use defensive error handling
// Test 10: Korean Test — no domain words added to route handlers
SCRIPT
npx tsx web/scripts/ob81-test-api-wiring.ts
```

**Proof gates:**
- PG-12: Reconciliation route loads priors and persists report
- PG-13: Resolution route loads priors and persists investigation
- PG-14: Insights route returns persona-filtered results
- PG-15: All routes write training signals
- PG-16: All routes use defensive error handling

**Commit:** `OB-81 Mission 3: Wire reconciliation, resolution, insights API routes, 5 gates`

---

## MISSION 4: CLT-80 EXECUTION — AGENTIC METAMORPHOSIS ACCEPTANCE TEST

**This mission runs the CLT-80 acceptance test suite.** The test file should exercise the live wired pipeline, not isolated unit tests.

### 4A: Build the CLT-80 test runner

```bash
cat << 'SCRIPT' > web/scripts/clt80-acceptance.ts
// CLT-80: Agentic Metamorphosis — Complete Acceptance Test
//
// This script exercises the LIVE WIRED PIPELINE, not mocks.
// It calls the actual API routes and verifies end-to-end behavior.
//
// ═══════════════════════════════════════════════
// TEST 1: PROGRESSIVE PERFORMANCE
// ═══════════════════════════════════════════════
// 1. Nuclear clear density for test tenant
// 2. Run calculation 5 times, recording duration and execution modes
// 3. Verify: T₂ < T₁, T₃ < T₂, confidence increases, silent count increases
// 4. Verify: total payout identical across all 5 runs
//
// ═══════════════════════════════════════════════
// TEST 2: NUCLEAR CLEAR AND RE-LEARN
// ═══════════════════════════════════════════════
// 1. After Test 1 peak, nuclear clear
// 2. Verify density resets
// 3. Run once — verify full_trace, payouts identical
//
// ═══════════════════════════════════════════════
// TEST 3: THE CLOSED LOOP
// ═══════════════════════════════════════════════
// 1. Run calculation → confidence synapses
// 2. Run reconciliation with deliberate mismatch → correction synapses
// 3. Run calculation again → density adjusts
// 4. Verify correction synapses affected density
//
// ═══════════════════════════════════════════════
// TEST 4: MULTI-DOMAIN DVT
// ═══════════════════════════════════════════════
// 1. Register ICM, Rebate, Franchise
// 2. Run DVT — all natural_fit
// 3. Verify terminology mapping
// 4. Verify IAP scoring
//
// ═══════════════════════════════════════════════
// TEST 5: FLYWHEEL COLD START
// ═══════════════════════════════════════════════
// 1. Build density (3 runs for existing tenant)
// 2. Trigger flywheel aggregation
// 3. Load cold start priors for a hypothetical new tenant
// 4. Verify priors populated, confidence discounted
//
// ═══════════════════════════════════════════════
// TEST 6: VOCABULARY COMPLETENESS (9 PRIMITIVES)
// ═══════════════════════════════════════════════
// 1. Execute all 9 primitives with known inputs
// 2. Verify correct outputs
// 3. Verify composition (weighted_blend of lookups, temporal_window of ratio)
//
// ═══════════════════════════════════════════════
// TEST 7: AGENT MEMORY READ SIDE
// ═══════════════════════════════════════════════
// 1. Load priors for each agent type
// 2. Verify structure contains all three flywheel sources
//
// ═══════════════════════════════════════════════
// TEST 8: CORRECTNESS INVARIANT
// ═══════════════════════════════════════════════
// 1. Run in full_trace (nuclear clear first)
// 2. Run 5 more times to reach silent
// 3. Compare every payout — must be identical
//
// ═══════════════════════════════════════════════
// TEST 9: TWO-TIER BOUNDARY
// ═══════════════════════════════════════════════
// 1. Scan imports — no domain/ imports in agents/ or calculation/
// 2. Korean Test on all foundational files
//
// ═══════════════════════════════════════════════
// TEST 10: SCALE PROJECTION
// ═══════════════════════════════════════════════
// 1. Based on Test 1 timing, project for larger entity counts
// 2. Verify no per-entity DB calls
// 3. Verify batch write counts
//
// ═══════════════════════════════════════════════
// SCORECARD
// ═══════════════════════════════════════════════
// Print pass/fail for all 10 tests
// Print aggregate: X/10 tests passed
// Print: "Agentic Metamorphosis: PROVEN" or "Agentic Metamorphosis: INCOMPLETE"
SCRIPT
npx tsx web/scripts/clt80-acceptance.ts
```

### 4B: Document CLT-80 results

Create `CLT-80_RESULTS.md` at project root with:
1. Each test result with evidence
2. Timing data from progressive performance
3. Density progression data
4. Cold start proof
5. Correctness invariant data (payout comparison)
6. Korean Test output
7. Overall scorecard

**Proof gates:**
- PG-17: CLT-80 Test 1 passes (progressive performance)
- PG-18: CLT-80 Test 2 passes (nuclear clear + re-learn)
- PG-19: CLT-80 Test 3 passes (closed loop)
- PG-20: CLT-80 Test 4 passes (multi-domain DVT)
- PG-21: CLT-80 Test 5 passes (flywheel cold start)
- PG-22: CLT-80 Test 6 passes (9 primitives)
- PG-23: CLT-80 Test 7 passes (agent memory)
- PG-24: CLT-80 Test 8 passes (correctness invariant)
- PG-25: CLT-80 Test 9 passes (two-tier boundary)
- PG-26: CLT-80 Test 10 passes (scale projection)

**Commit:** `OB-81 Mission 4: CLT-80 acceptance test — 10 tests executed`

---

## MISSION 5: BUILD + KOREAN TEST + COMPLETION

### 5A: Build verification

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
```

### 5B: Korean Test

```bash
echo "=== KOREAN TEST — ALL FOUNDATIONAL FILES ==="

echo ""
echo "--- Calculation files ---"
for f in intent-types.ts intent-executor.ts intent-validator.ts intent-transformer.ts synaptic-types.ts synaptic-surface.ts synaptic-density.ts pattern-signature.ts anomaly-detector.ts flywheel-pipeline.ts; do
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
echo "--- Protocol files ---"
for f in domain-registry.ts negotiation-protocol.ts domain-viability.ts; do
  count=$(grep -ciE "commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise" "web/src/lib/domain/$f" 2>/dev/null || echo "0")
  echo "  $f: $count domain words"
done
```

Note: API route handlers (app/api/**/route.ts) are exempt from Korean Test — they interface with database columns that have fixed names. See OB-79 CC log for precedent.

### 5C: Integration checklist

```
□ npm run build exits 0?
□ localhost:3000 responds?
□ Calculation wiring tests pass?
□ API wiring tests pass?
□ CLT-80 acceptance tests executed?
□ CLT-80 results documented?
□ Korean Test: 0 domain words in all foundational files?
□ All wiring is defensive (try/catch)?
□ No per-entity DB calls added?
□ Flywheel post-consolidation fires?
□ Agent memory loads from three flywheels?
□ Cold start path works?
□ gh pr create executed?
```

**Proof gates:**
- PG-27: Korean Test passes on all foundational files
- PG-28: npm run build exits 0

**Commit:** `OB-81 Mission 5: Build + Korean Test + completion`

---

## COMPLETION REPORT

Save as `OB-81_COMPLETION_REPORT.md` in **PROJECT ROOT**.

Structure:
1. **What was wired** — every connection point with before/after
2. **Commits** — all with hashes
3. **Files modified** — every changed file
4. **Proof gates** — 28 gates, each PASS/FAIL with evidence
5. **CLT-80 Results** — full scorecard, 10/10 target
6. **Defensive coding** — list every try/catch added
7. **Performance impact** — does wiring add latency? (should be negligible — all fire-and-forget)
8. **Agentic Metamorphosis Final Status:**

```
Tier 1 (OB-78): Synaptic State Foundation     — 178/178 tests
Tier 2 (OB-79): Agent Autonomy                — 170/170 tests
Tier 3 (OB-80): Nervous System                — 223/223 tests
Wiring (OB-81): Live Pipeline Integration      — see completion report
CLT-80: Acceptance Test                        — X/10 tests passed

TOTAL: Agentic Metamorphosis — [PROVEN/INCOMPLETE]
```

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-81: Wire Nervous System + CLT-80 Acceptance — Agentic Metamorphosis Complete" \
  --body "## Wire the Nervous System into the Live Pipeline

### Mission 1: Supabase Migrations
- synaptic_density, foundational_patterns, domain_patterns verified/executed

### Mission 2: Calculation Route Wiring
- Agent memory replaces direct density loading (with cold start support)
- Flywheel post-consolidation fires after each calculation
- Period history batch-loaded for temporal_window
- Inline insights checked at intervals during calculation
- Full analysis fires async post-calculation
- All wiring is defensive (try/catch, never blocks)

### Mission 3: API Route Wiring
- Reconciliation: loads priors, persists report, writes training signal
- Resolution: loads priors, persists investigation, writes training signal
- Insights: returns persona-filtered results, handles async processing

### Mission 4: CLT-80 Acceptance Test
- 10 acceptance tests covering the complete Agentic Metamorphosis
- Progressive performance, nuclear clear, closed loop, multi-domain DVT
- Flywheel cold start, vocabulary completeness, agent memory
- Correctness invariant, two-tier boundary, scale projection

### Agentic Metamorphosis: COMPLETE
- Tier 1 (OB-78): 178/178 — Synaptic State
- Tier 2 (OB-79): 170/170 — Agent Autonomy
- Tier 3 (OB-80): 223/223 — Nervous System
- Wiring (OB-81): Live pipeline integration + CLT-80 acceptance"
```

**Commit:** `OB-81 Final: Completion report + PR`

---

## MAXIMUM SCOPE

5 missions, 28 proof gates. After OB-81:

- Every system built in OB-78/79/80 is connected to the live pipeline
- The calculation route loads agent memory, writes to flywheels, fires insights
- Reconciliation, Resolution, and Insight API routes are fully wired
- CLT-80 proves the complete metamorphosis end-to-end
- All wiring is defensive — failures never block calculation

**This is the last OB of the Agentic Metamorphosis. After this, every claim is a test result.**

---

*OB-81 — February 22, 2026*
