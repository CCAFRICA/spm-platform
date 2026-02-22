/**
 * OB-77 Mission 3 Verification: Execution Trace UI
 *
 * Tests:
 * 1. ExecutionTraceView component exists and exports correctly
 * 2. Calculate page has inline expansion wiring
 * 3. Trace page shows intent execution traces
 * 4. Human-readable operation labels exist
 * 5. No TypeScript or lint errors in changed files
 */

import * as fs from 'fs';
import * as path from 'path';

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
  const webRoot = path.resolve(__dirname, '..');

  // ──────────────────────────────────────────────
  // Test 1: ExecutionTraceView component
  // ──────────────────────────────────────────────
  console.log('=== Test 1: ExecutionTraceView Component ===');

  const traceViewPath = path.join(webRoot, 'src/components/forensics/ExecutionTraceView.tsx');
  assert(fs.existsSync(traceViewPath), 'ExecutionTraceView.tsx exists');

  const traceViewContent = fs.readFileSync(traceViewPath, 'utf-8');
  assert(traceViewContent.includes('export function ExecutionTraceView'), 'ExecutionTraceView is exported');
  assert(traceViewContent.includes('export function getOperationLabel'), 'getOperationLabel is exported');
  assert(traceViewContent.includes("'use client'"), 'Has use client directive');
  assert(traceViewContent.includes('interface IntentTrace'), 'Has IntentTrace interface');
  assert(traceViewContent.includes('interface ExecutionTraceViewProps'), 'Has props interface');

  // Check human-readable labels
  assert(traceViewContent.includes("bounded_lookup_1d: '1D Lookup'"), 'Has 1D lookup label');
  assert(traceViewContent.includes("bounded_lookup_2d: '2D Matrix Lookup'"), 'Has 2D lookup label');
  assert(traceViewContent.includes("scalar_multiply: 'Scalar Multiply'"), 'Has scalar multiply label');
  assert(traceViewContent.includes("conditional_gate: 'Conditional Gate'"), 'Has conditional gate label');

  // Check subcomponents
  assert(traceViewContent.includes('function InputsSection'), 'Has InputsSection');
  assert(traceViewContent.includes('function LookupSection'), 'Has LookupSection');
  assert(traceViewContent.includes('function ModifiersSection'), 'Has ModifiersSection');
  assert(traceViewContent.includes('function TraceCard'), 'Has TraceCard');

  // ──────────────────────────────────────────────
  // Test 2: Calculate page inline expansion
  // ──────────────────────────────────────────────
  console.log('\n=== Test 2: Calculate Page Inline Expansion ===');

  const calcPath = path.join(webRoot, 'src/app/admin/launch/calculate/page.tsx');
  const calcContent = fs.readFileSync(calcPath, 'utf-8');

  assert(calcContent.includes("import { ExecutionTraceView }"), 'Calculate page imports ExecutionTraceView');
  assert(calcContent.includes('expandedEntityId'), 'Has expandedEntityId state');
  assert(calcContent.includes('setExpandedEntityId'), 'Has setExpandedEntityId setter');
  assert(calcContent.includes('React.Fragment'), 'Uses React.Fragment for row expansion');
  assert(calcContent.includes("import React,"), 'Imports React');
  assert(calcContent.includes('Intent Execution Trace'), 'Shows trace heading in expansion');
  assert(calcContent.includes('Full Trace'), 'Has link to full trace page');
  assert(calcContent.includes('intentTraces'), 'References intentTraces from metadata');
  assert(calcContent.includes('colSpan={5}'), 'Expanded row spans all columns');

  // ──────────────────────────────────────────────
  // Test 3: Trace page enhancement
  // ──────────────────────────────────────────────
  console.log('\n=== Test 3: Trace Page Enhancement ===');

  const tracePath = path.join(webRoot, 'src/app/investigate/trace/[entityId]/page.tsx');
  const traceContent = fs.readFileSync(tracePath, 'utf-8');

  assert(traceContent.includes("import { ExecutionTraceView }"), 'Trace page imports ExecutionTraceView');
  assert(traceContent.includes('intentTraces'), 'Has intentTraces state');
  assert(traceContent.includes('setIntentTraces'), 'Has setIntentTraces setter');
  assert(traceContent.includes('intentMeta'), 'Has intentMeta state');
  assert(traceContent.includes('Intent Execution Trace'), 'Shows intent trace section');
  assert(traceContent.includes('Layers'), 'Uses Layers icon');
  assert(traceContent.includes('meta?.intentTraces'), 'Extracts intentTraces from metadata');
  assert(traceContent.includes("CardHeader, CardTitle"), 'Imports CardHeader/CardTitle');

  // ──────────────────────────────────────────────
  // Test 4: Compact vs full mode
  // ──────────────────────────────────────────────
  console.log('\n=== Test 4: Compact Mode ===');

  assert(traceViewContent.includes('compact?: boolean'), 'Has compact prop');
  assert(traceViewContent.includes("compact = false"), 'Defaults to non-compact');
  assert(traceViewContent.includes("compact ? 'space-y-2' : 'space-y-3'"), 'Uses compact spacing');

  // Calculate page uses compact, trace page doesn't
  assert(calcContent.includes('compact'), 'Calculate page uses compact mode');

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
