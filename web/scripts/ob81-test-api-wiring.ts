/**
 * OB-81 Mission 3: API Route Wiring Verification
 *
 * Verifies reconciliation and resolution routes use agent memory.
 * Static analysis — reads source, checks imports, wiring patterns.
 *
 * PG-12: Reconciliation route imports loadPriorsForAgent
 * PG-13: Reconciliation uses agent memory with fallback
 * PG-14: Resolution route imports loadPriorsForAgent
 * PG-15: Resolution uses agent memory with fallback
 * PG-16: Both routes retain loadDensity as fallback
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

const reconPath = path.join(__dirname, '..', 'src', 'app', 'api', 'reconciliation', 'run', 'route.ts');
const disputePath = path.join(__dirname, '..', 'src', 'app', 'api', 'disputes', 'investigate', 'route.ts');
const reconContent = fs.readFileSync(reconPath, 'utf-8');
const disputeContent = fs.readFileSync(disputePath, 'utf-8');

// ══════════════════════════════════════════════
// PG-12: Reconciliation route agent memory import
// ══════════════════════════════════════════════
console.log('\n=== PG-12: Reconciliation agent memory import ===');
{
  assert(reconContent.includes("import { loadPriorsForAgent }"), 'loadPriorsForAgent imported');
  assert(reconContent.includes("from '@/lib/agents/agent-memory'"), 'Imports from agent-memory module');
}

// ══════════════════════════════════════════════
// PG-13: Reconciliation uses agent memory with fallback
// ══════════════════════════════════════════════
console.log('\n=== PG-13: Reconciliation agent memory usage ===');
{
  assert(reconContent.includes("loadPriorsForAgent(tenantId"), 'loadPriorsForAgent called with tenantId');
  assert(reconContent.includes("'reconciliation'"), 'Agent type is reconciliation');
  assert(reconContent.includes("priors.tenantDensity"), 'Extracts tenantDensity from priors');

  // Fallback to loadDensity
  const priorsCallIdx = reconContent.indexOf("loadPriorsForAgent(tenantId");
  const fallbackIdx = reconContent.indexOf("loadDensity(tenantId)", priorsCallIdx);
  assert(fallbackIdx > priorsCallIdx, 'Falls back to loadDensity after agent memory failure');

  // Surface creation still present
  assert(reconContent.includes("createSynapticSurface(density)"), 'Surface created from density');
}

// ══════════════════════════════════════════════
// PG-14: Resolution route agent memory import
// ══════════════════════════════════════════════
console.log('\n=== PG-14: Resolution agent memory import ===');
{
  assert(disputeContent.includes("import { loadPriorsForAgent }"), 'loadPriorsForAgent imported');
  assert(disputeContent.includes("from '@/lib/agents/agent-memory'"), 'Imports from agent-memory module');
}

// ══════════════════════════════════════════════
// PG-15: Resolution uses agent memory with fallback
// ══════════════════════════════════════════════
console.log('\n=== PG-15: Resolution agent memory usage ===');
{
  assert(disputeContent.includes("loadPriorsForAgent(context.tenantId"), 'loadPriorsForAgent called with context.tenantId');
  assert(disputeContent.includes("'resolution'"), 'Agent type is resolution');
  assert(disputeContent.includes("priors.tenantDensity"), 'Extracts tenantDensity from priors');

  // Fallback to loadDensity
  const priorsCallIdx = disputeContent.indexOf("loadPriorsForAgent(context.tenantId");
  const fallbackIdx = disputeContent.indexOf("loadDensity(context.tenantId)", priorsCallIdx);
  assert(fallbackIdx > priorsCallIdx, 'Falls back to loadDensity after agent memory failure');

  // Surface creation still present
  assert(disputeContent.includes("createSynapticSurface(density)"), 'Surface created from density');
}

// ══════════════════════════════════════════════
// PG-16: Both retain loadDensity as fallback
// ══════════════════════════════════════════════
console.log('\n=== PG-16: Fallback integrity ===');
{
  assert(reconContent.includes("import { loadDensity }"), 'Reconciliation still imports loadDensity');
  assert(disputeContent.includes("import { loadDensity }"), 'Resolution still imports loadDensity');

  // Both have nested try/catch for fallback
  assert(reconContent.includes('Fallback to direct density loading'), 'Reconciliation has fallback comment');
  assert(disputeContent.includes('Fallback to direct density loading'), 'Resolution has fallback comment');

  // Both construct empty Map as last resort
  assert(reconContent.includes("new Map() as Awaited"), 'Reconciliation has empty Map fallback');
  assert(disputeContent.includes("new Map() as Awaited"), 'Resolution has empty Map fallback');
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`OB-81 Mission 3 API Wiring: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
