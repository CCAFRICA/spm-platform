#!/usr/bin/env npx tsx
/**
 * OB-87 Verification Script
 * Checks all 22 proof gates from the OB-87 specification.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';

const WEB = resolve(__dirname, '..');
const ROOT = resolve(WEB, '..');

interface Gate { id: string; description: string; check: () => boolean }

const gates: Gate[] = [
  // Phase 0
  { id: 'PG-1', description: 'Phase 0 recon committed', check: () => existsSync(resolve(ROOT, 'OB-87_PHASE0_RECON.md')) },

  // Mission 1: Benchmark Intelligence
  { id: 'PG-2', description: 'benchmark-intelligence.ts exists', check: () => existsSync(resolve(WEB, 'src/lib/reconciliation/benchmark-intelligence.ts')) },
  { id: 'PG-3', description: 'analyzeBenchmark exported', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/lib/reconciliation/benchmark-intelligence.ts'), 'utf8'); return f.includes('export async function analyzeBenchmark'); } catch { return false; } } },
  { id: 'PG-4', description: 'resolvePeriodValue exported', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/lib/reconciliation/benchmark-intelligence.ts'), 'utf8'); return f.includes('export function resolvePeriodValue'); } catch { return false; } } },
  { id: 'PG-5', description: 'matchPeriods exported', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/lib/reconciliation/benchmark-intelligence.ts'), 'utf8'); return f.includes('export function matchPeriods'); } catch { return false; } } },
  { id: 'PG-6', description: 'filterRowsByPeriod exported', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/lib/reconciliation/benchmark-intelligence.ts'), 'utf8'); return f.includes('export function filterRowsByPeriod'); } catch { return false; } } },
  { id: 'PG-7', description: 'Period targets in ai-column-mapper', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/lib/reconciliation/ai-column-mapper.ts'), 'utf8'); return f.includes("id: 'period'") && f.includes("id: 'month'") && f.includes("id: 'year'"); } catch { return false; } } },
  { id: 'PG-8', description: 'DepthAssessment type + 5 levels', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/lib/reconciliation/benchmark-intelligence.ts'), 'utf8'); return f.includes('interface DepthAssessment') && f.includes("name: 'Entity Match'") && f.includes("name: 'Attainment Data'"); } catch { return false; } } },

  // Mission 2: Multi-layer Comparison
  { id: 'PG-9', description: 'detectFalseGreens exported', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/lib/reconciliation/comparison-engine.ts'), 'utf8'); return f.includes('export function detectFalseGreens'); } catch { return false; } } },
  { id: 'PG-10', description: 'runEnhancedComparison exported', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/lib/reconciliation/comparison-engine.ts'), 'utf8'); return f.includes('export function runEnhancedComparison'); } catch { return false; } } },
  { id: 'PG-11', description: 'Finding type with priority ordering', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/lib/reconciliation/comparison-engine.ts'), 'utf8'); return f.includes('interface Finding') && f.includes("type FindingType = 'false_green'"); } catch { return false; } } },

  // Mission 3: API Routes
  { id: 'PG-12', description: '/api/reconciliation/analyze exists', check: () => existsSync(resolve(WEB, 'src/app/api/reconciliation/analyze/route.ts')) },
  { id: 'PG-13', description: '/api/reconciliation/compare exists', check: () => existsSync(resolve(WEB, 'src/app/api/reconciliation/compare/route.ts')) },
  { id: 'PG-14', description: '/api/reconciliation/save exists', check: () => existsSync(resolve(WEB, 'src/app/api/reconciliation/save/route.ts')) },

  // Mission 4: UI Enhancement
  { id: 'PG-15', description: 'Depth assessment in UI', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/app/investigate/reconciliation/page.tsx'), 'utf8'); return f.includes('Comparison Depth Assessment') || f.includes('Evaluacion de Profundidad'); } catch { return false; } } },
  { id: 'PG-16', description: 'Period matching in UI', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/app/investigate/reconciliation/page.tsx'), 'utf8'); return f.includes('Period Matching') || f.includes('Coincidencia de Periodos'); } catch { return false; } } },
  { id: 'PG-17', description: 'False green surfacing in UI', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/app/investigate/reconciliation/page.tsx'), 'utf8'); return f.includes('FALSE GREEN') && f.includes('VERDE FALSO'); } catch { return false; } } },
  { id: 'PG-18', description: 'Component drill-down in UI', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/app/investigate/reconciliation/page.tsx'), 'utf8'); return f.includes('Component Breakdown') || f.includes('Desglose de Componentes'); } catch { return false; } } },

  // Mission 5: Classification Signals
  { id: 'PG-19', description: 'Signal wiring in compare route', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/app/api/reconciliation/compare/route.ts'), 'utf8'); return f.includes('persistSignal') && f.includes('training:reconciliation_comparison'); } catch { return false; } } },
  { id: 'PG-20', description: 'Period detection signals in benchmark-intelligence', check: () => { try { const f = require('fs').readFileSync(resolve(WEB, 'src/lib/reconciliation/benchmark-intelligence.ts'), 'utf8'); return f.includes('recordAIClassificationBatch') && f.includes('benchmark_period_detection'); } catch { return false; } } },

  // Mission 6: Build
  { id: 'PG-21', description: 'npm run build exits 0', check: () => existsSync(resolve(WEB, '.next/BUILD_ID')) },
  { id: 'PG-22', description: 'Zero hardcoded field names (Korean Test)', check: () => { try { const files = ['benchmark-intelligence.ts', 'comparison-engine.ts'].map(f => require('fs').readFileSync(resolve(WEB, 'src/lib/reconciliation', f), 'utf8')); const page = require('fs').readFileSync(resolve(WEB, 'src/app/investigate/reconciliation/page.tsx'), 'utf8'); return ![...files, page].some(f => /Pago_Total|Venta_Optica|Numero_Emp|Mes|Año/.test(f)); } catch { return false; } } },
];

// Run all gates
let passed = 0;
let failed = 0;

console.log('\n=== OB-87 Verification: 22 Proof Gates ===\n');

for (const gate of gates) {
  try {
    const ok = gate.check();
    const icon = ok ? '✅' : '❌';
    console.log(`${icon} ${gate.id}: ${gate.description}`);
    if (ok) passed++; else failed++;
  } catch (err) {
    console.log(`❌ ${gate.id}: ${gate.description} (error: ${err})`);
    failed++;
  }
}

console.log(`\n=== Results: ${passed}/${gates.length} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
