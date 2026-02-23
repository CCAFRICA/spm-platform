/**
 * OB-81 Mission 2: Calculation Route Wiring Verification
 *
 * Verifies all 7 wiring points are correctly integrated in the calculation route.
 * Static analysis — reads source, checks imports, patterns, defensive coding.
 *
 * PG-4: Agent memory replaces direct density loading
 * PG-5: Flywheel post-consolidation wired after density persist
 * PG-6: Period history batch-loaded before entity loop
 * PG-7: Inline insights checked at intervals during entity loop
 * PG-8: Full analysis generated post-calculation
 * PG-9: Response includes densityProfile and inlineInsights
 * PG-10: All wiring wrapped in try/catch (defensive coding)
 * PG-11: No per-entity Supabase/LLM calls in new wiring
 */

import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

const routePath = path.join(__dirname, '..', 'src', 'app', 'api', 'calculation', 'run', 'route.ts');
const content = fs.readFileSync(routePath, 'utf-8');

// ══════════════════════════════════════════════
// PG-4: Agent memory replaces direct density loading
// ══════════════════════════════════════════════
console.log('\n=== PG-4: Agent memory wiring ===');
{
  assert(content.includes("import { loadPriorsForAgent"), 'loadPriorsForAgent imported');
  assert(content.includes("import { postConsolidationFlywheel }"), 'postConsolidationFlywheel imported');
  assert(content.includes("type AgentPriors"), 'AgentPriors type imported');
  assert(content.includes("loadPriorsForAgent(tenantId"), 'loadPriorsForAgent called with tenantId');
  assert(content.includes("priors.tenantDensity"), 'Extracts tenantDensity from priors');
  assert(content.includes("priors.foundationalPriors"), 'Accesses foundationalPriors');
  assert(content.includes("priors.domainPriors"), 'Accesses domainPriors');

  // Fallback pattern: still imports loadDensity as backup
  assert(content.includes("import { loadDensity"), 'loadDensity still imported as fallback');
  assert(content.includes("catch (memErr)"), 'Agent memory has catch block for fallback');
}

// ══════════════════════════════════════════════
// PG-5: Flywheel post-consolidation
// ══════════════════════════════════════════════
console.log('\n=== PG-5: Flywheel post-consolidation ===');
{
  assert(content.includes("postConsolidationFlywheel("), 'postConsolidationFlywheel called');

  // Must be AFTER density persist
  const densityPersistIdx = content.indexOf('persistDensityUpdates(tenantId');
  const flywheelIdx = content.indexOf('postConsolidationFlywheel(');
  assert(densityPersistIdx > 0 && flywheelIdx > 0 && flywheelIdx > densityPersistIdx,
    'Flywheel fires AFTER density persist');

  // Must be inside try/catch
  const flywheelSection = content.substring(flywheelIdx - 200, flywheelIdx + 300);
  assert(flywheelSection.includes('try {') || flywheelSection.includes('catch (fwErr)'),
    'Flywheel wiring wrapped in try/catch');

  // Must include .catch for the promise
  assert(content.includes("Flywheel aggregation error (non-blocking)"), 'Flywheel errors are non-blocking');
}

// ══════════════════════════════════════════════
// PG-6: Period history batch-loaded
// ══════════════════════════════════════════════
console.log('\n=== PG-6: Period history batch loading ===');
{
  assert(content.includes('periodHistoryMap'), 'periodHistoryMap exists');

  // Must be a single batch query, not per-entity
  assert(content.includes("from('calculation_results')"), 'Queries calculation_results table');
  assert(content.includes("TEMPORAL_WINDOW_MAX"), 'Uses TEMPORAL_WINDOW_MAX constant');

  // Must be before entity loop
  const periodHistIdx = content.indexOf('periodHistoryMap = new Map');
  const entityLoopIdx = content.indexOf('for (const entityId of calculationEntityIds)');
  assert(periodHistIdx > 0 && entityLoopIdx > 0 && periodHistIdx < entityLoopIdx,
    'Period history loaded BEFORE entity loop');

  // Graceful degradation
  assert(content.includes('temporal_window will') || content.includes('temporal_window support'),
    'Graceful degradation comment present');
}

// ══════════════════════════════════════════════
// PG-7: Inline insights at intervals
// ══════════════════════════════════════════════
console.log('\n=== PG-7: Inline insights during calculation ===');
{
  assert(content.includes("import {") && content.includes("checkInlineInsights"), 'checkInlineInsights imported');
  assert(content.includes('INSIGHT_CHECKPOINT_INTERVAL'), 'Checkpoint interval defined');
  assert(content.includes('allInlineInsights'), 'Inline insights collector exists');

  // checkInlineInsights must be INSIDE the entity loop
  const entityLoopStart = content.indexOf('for (const entityId of calculationEntityIds)');
  const entityLoopEnd = content.indexOf('concordanceRate', entityLoopStart);
  const checkInsightsIdx = content.indexOf('checkInlineInsights(surface', entityLoopStart);
  assert(checkInsightsIdx > entityLoopStart && checkInsightsIdx < entityLoopEnd,
    'checkInlineInsights called INSIDE entity loop');

  // Must check at intervals
  assert(content.includes('% INSIGHT_CHECKPOINT_INTERVAL === 0'),
    'Checks at interval boundaries');
}

// ══════════════════════════════════════════════
// PG-8: Full analysis post-calculation
// ══════════════════════════════════════════════
console.log('\n=== PG-8: Full analysis generation ===');
{
  assert(content.includes('generateFullAnalysis('), 'generateFullAnalysis called');
  assert(content.includes("type CalculationSummary"), 'CalculationSummary type imported');
  assert(content.includes("type InlineInsight"), 'InlineInsight type imported');

  // Must include summary construction
  assert(content.includes('calcSummary: CalculationSummary'), 'CalculationSummary constructed');
  assert(content.includes('medianOutcome'), 'Median outcome computed');
  assert(content.includes('zeroOutcomeCount') || content.includes('zeroCount'), 'Zero outcome counted');
  assert(content.includes('topEntities') && content.includes('bottomEntities'), 'Top/bottom entities included');

  // Must be after entity loop
  const entityLoopIdx = content.indexOf('for (const entityId of calculationEntityIds)');
  const fullAnalysisIdx = content.indexOf('generateFullAnalysis(batch.id');
  assert(fullAnalysisIdx > entityLoopIdx, 'Full analysis after entity loop');
}

// ══════════════════════════════════════════════
// PG-9: Response includes new OB-81 fields
// ══════════════════════════════════════════════
console.log('\n=== PG-9: Response shape ===');
{
  assert(content.includes('densityProfile:'), 'Response includes densityProfile');
  assert(content.includes('coldStart'), 'densityProfile has coldStart');
  assert(content.includes('flywheelPriorsLoaded'), 'densityProfile has flywheelPriorsLoaded');
  assert(content.includes('agentMemorySource'), 'densityProfile has agentMemorySource');
  assert(content.includes('inlineInsights:'), 'Response includes inlineInsights');
}

// ══════════════════════════════════════════════
// PG-10: Defensive coding — all wiring in try/catch
// ══════════════════════════════════════════════
console.log('\n=== PG-10: Defensive coding ===');
{
  // Agent memory loading has try/catch
  assert(content.includes('catch (memErr)'), 'Agent memory has try/catch');

  // Period history has try/catch
  assert(content.includes('catch (histErr)') || content.includes('temporal_window will degrade'),
    'Period history has try/catch');

  // Inline insights in try/catch
  const inlineSection = content.substring(
    content.indexOf('checkInlineInsights(surface'),
    content.indexOf('checkInlineInsights(surface') + 200
  );
  assert(inlineSection.includes('catch') || content.includes('Never block calculation for insight'),
    'Inline insights in try/catch');

  // Full analysis in try/catch
  assert(content.includes('catch (insightErr)'), 'Full analysis in try/catch');

  // Flywheel in try/catch
  assert(content.includes('catch (fwErr)'), 'Flywheel post-consolidation in try/catch');
}

// ══════════════════════════════════════════════
// PG-11: No per-entity Supabase/LLM calls in new wiring
// ══════════════════════════════════════════════
console.log('\n=== PG-11: No per-entity calls ===');
{
  // Extract the entity loop body
  const loopStart = content.indexOf('for (const entityId of calculationEntityIds)');
  const loopBody = content.substring(loopStart, content.indexOf('concordanceRate', loopStart));

  // No supabase calls inside the loop from OB-81 wiring
  const ob81Sections = loopBody.split('OB-81');
  let hasPerEntitySupabase = false;
  for (let i = 1; i < ob81Sections.length; i++) {
    // Check the 200 chars after each OB-81 marker for supabase calls
    const section = ob81Sections[i].substring(0, 200);
    if (section.includes("supabase.from(") || section.includes("await supabase")) {
      hasPerEntitySupabase = true;
    }
  }
  assert(!hasPerEntitySupabase, 'No per-entity Supabase calls in OB-81 wiring');

  // periodHistoryMap.get is O(1) lookup, not a query
  assert(loopBody.includes('periodHistoryMap.get(entityId)'), 'Period history uses O(1) Map.get');

  // checkInlineInsights reads surface stats, not DB
  assert(!loopBody.includes('loadPriorsForAgent'), 'No agent memory calls inside loop');
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`OB-81 Mission 2 Calculation Wiring: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
