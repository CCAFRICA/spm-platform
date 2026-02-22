/**
 * OB-78 Mission 5 Tests: Engine Cutover Integration
 *
 * Tests:
 * PG-27: Density API route exports GET and DELETE handlers
 * PG-28: Nuclear clear function signature and behavior
 * PG-29: Density-driven execution mode switching
 * PG-30: Reversible cutover — nuclear clear resets to full_trace
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  createSynapticSurface,
  getExecutionMode,
  initializePatternDensity,
} from '../src/lib/calculation/synaptic-surface';
import type { SynapticDensity } from '../src/lib/calculation/synaptic-types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}`);
    failed++;
  }
}

function main() {
  // ──────────────────────────────────────────────
  // PG-27: Density API route structure
  // ──────────────────────────────────────────────
  console.log('=== PG-27: Density API route ===');

  const routePath = path.resolve(__dirname, '../src/app/api/calculation/density/route.ts');
  assert(fs.existsSync(routePath), 'Density API route file exists');

  const routeContent = fs.readFileSync(routePath, 'utf-8');
  assert(routeContent.includes('export async function GET'), 'Route exports GET handler');
  assert(routeContent.includes('export async function DELETE'), 'Route exports DELETE handler');
  assert(routeContent.includes('loadDensity'), 'GET uses loadDensity');
  assert(routeContent.includes('nuclearClearDensity'), 'DELETE uses nuclearClearDensity');
  assert(routeContent.includes('tenantId'), 'Route requires tenantId param');

  // ──────────────────────────────────────────────
  // PG-28: Nuclear clear function exists and signature
  // ──────────────────────────────────────────────
  console.log('\n=== PG-28: Nuclear clear ===');

  const densityPath = path.resolve(__dirname, '../src/lib/calculation/synaptic-density.ts');
  const densityContent = fs.readFileSync(densityPath, 'utf-8');

  assert(densityContent.includes('export async function nuclearClearDensity'), 'nuclearClearDensity exported');
  assert(densityContent.includes('tenantId: string'), 'Takes tenantId parameter');
  assert(densityContent.includes('.delete()'), 'Uses Supabase .delete()');
  assert(densityContent.includes("'synaptic_density'"), 'Targets synaptic_density table');

  // ──────────────────────────────────────────────
  // PG-29: Density-driven execution mode switching
  // ──────────────────────────────────────────────
  console.log('\n=== PG-29: Execution mode switching ===');

  // Simulate full cutover lifecycle
  const density: SynapticDensity = new Map();

  // Pattern at full_trace level
  density.set('pattern_a', {
    signature: 'pattern_a',
    confidence: 0.50,
    totalExecutions: 10,
    lastAnomalyRate: 0.1,
    lastCorrectionCount: 0,
    executionMode: 'full_trace',
    learnedBehaviors: {},
  });

  // Pattern at light_trace level
  density.set('pattern_b', {
    signature: 'pattern_b',
    confidence: 0.80,
    totalExecutions: 100,
    lastAnomalyRate: 0.02,
    lastCorrectionCount: 0,
    executionMode: 'light_trace',
    learnedBehaviors: {},
  });

  // Pattern at silent level (fully cut over)
  density.set('pattern_c', {
    signature: 'pattern_c',
    confidence: 0.98,
    totalExecutions: 500,
    lastAnomalyRate: 0.001,
    lastCorrectionCount: 0,
    executionMode: 'silent',
    learnedBehaviors: {},
  });

  const surface = createSynapticSurface(density);

  assert(getExecutionMode(surface, 'pattern_a') === 'full_trace', 'Low confidence → full_trace');
  assert(getExecutionMode(surface, 'pattern_b') === 'light_trace', 'Medium confidence → light_trace');
  assert(getExecutionMode(surface, 'pattern_c') === 'silent', 'High confidence → silent');

  // Per-component: each pattern independently determines its execution mode
  assert(getExecutionMode(surface, 'unknown') === 'full_trace', 'Unknown pattern → full_trace (safe default)');

  // ──────────────────────────────────────────────
  // PG-30: Reversible cutover — nuclear clear resets to full_trace
  // ──────────────────────────────────────────────
  console.log('\n=== PG-30: Reversible cutover ===');

  // After nuclear clear, density is empty → all patterns revert to full_trace
  const emptyDensity: SynapticDensity = new Map();
  const freshSurface = createSynapticSurface(emptyDensity);

  assert(getExecutionMode(freshSurface, 'pattern_a') === 'full_trace', 'After clear: pattern_a → full_trace');
  assert(getExecutionMode(freshSurface, 'pattern_b') === 'full_trace', 'After clear: pattern_b → full_trace');
  assert(getExecutionMode(freshSurface, 'pattern_c') === 'full_trace', 'After clear: pattern_c → full_trace');

  // Re-initializing patterns sets them at 0.5 confidence (full_trace)
  initializePatternDensity(freshSurface, 'pattern_a', 0);
  assert(
    freshSurface.density.get('pattern_a')!.confidence === 0.5,
    'Re-initialized pattern starts at 0.5 confidence'
  );
  assert(
    getExecutionMode(freshSurface, 'pattern_a') === 'full_trace',
    'Re-initialized pattern in full_trace mode'
  );

  // Verify cutover route has proper response shape
  assert(routeContent.includes('full_trace'), 'Response mentions full_trace');
  assert(routeContent.includes('message'), 'DELETE response includes message');

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
