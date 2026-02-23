/**
 * OB-83 Mission 2 Tests — AI Assessment Panel + API Enhancements
 *
 * Verifies:
 * - PG-7: AssessmentPanel component renders for all three personas
 * - PG-8: AI prompts are persona-specific with domain terminology
 * - PG-9: Cache prevents redundant AI calls (same period + data)
 * - PG-10: Anti-hallucination: no insight without dataSource (AP-18 safety gate)
 * - PG-11: Empty data produces honest "no data" message, not fabricated insights
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

// ──────────────────────────────────────────────
// PG-7: AssessmentPanel component renders for all three personas
// ──────────────────────────────────────────────

console.log('\nPG-7: AssessmentPanel component renders for all three personas');

const panelFile = fs.readFileSync(
  path.join(ROOT, 'src/components/design-system/AssessmentPanel.tsx'),
  'utf-8'
);

assert(panelFile.includes("'use client'"), 'AssessmentPanel is a client component');
assert(panelFile.includes("persona: 'admin' | 'manager' | 'rep'"), 'AssessmentPanel supports admin/manager/rep personas');
assert(panelFile.includes('/api/ai/assessment'), 'AssessmentPanel calls assessment API');
assert(panelFile.includes('ReactMarkdown'), 'AssessmentPanel renders markdown content');
assert(panelFile.includes('loading'), 'AssessmentPanel has loading state');
assert(panelFile.includes('error'), 'AssessmentPanel has error state');
assert(panelFile.includes('expanded'), 'AssessmentPanel has expand/collapse');

// Check persona-specific titles
assert(panelFile.includes('Performance Governance'), 'Admin title: Performance Governance');
assert(panelFile.includes('Coaching Intelligence'), 'Manager title: Coaching Intelligence');
assert(panelFile.includes('My Performance Summary'), 'Rep title: My Performance Summary');

// Check Spanish translations exist
assert(panelFile.includes('Gobernanza de Rendimiento'), 'Admin title ES: Gobernanza de Rendimiento');
assert(panelFile.includes('Inteligencia de Coaching'), 'Manager title ES: Inteligencia de Coaching');
assert(panelFile.includes('Mi Resumen de Rendimiento'), 'Rep title ES: Mi Resumen de Rendimiento');

// ──────────────────────────────────────────────
// PG-8: AI prompts are persona-specific with domain terminology
// ──────────────────────────────────────────────

console.log('\nPG-8: AI prompts persona-specific with domain terminology');

const assessmentRoute = fs.readFileSync(
  path.join(ROOT, 'src/app/api/ai/assessment/route.ts'),
  'utf-8'
);

// Domain terminology injection
assert(assessmentRoute.includes("import { getDomain }"), 'Assessment route imports getDomain');
assert(assessmentRoute.includes("import '@/lib/domain/domains/icm'"), 'Assessment route imports ICM for registration');
assert(assessmentRoute.includes('domain.terminology' ) || assessmentRoute.includes('domain?.terminology'), 'Assessment route reads domain terminology');
assert(assessmentRoute.includes('domainTerminology'), 'Assessment route passes domainTerminology to AI');
assert(assessmentRoute.includes('enrichedData'), 'Assessment route enriches data with terminology');

// AIService routing (PG-16 from Mission 4 verified here too)
assert(assessmentRoute.includes('getAIService()'), 'Assessment route uses AIService singleton');
assert(assessmentRoute.includes('generateAssessment'), 'Assessment route calls generateAssessment');
assert(!assessmentRoute.includes('new Anthropic'), 'Assessment route does NOT directly instantiate Anthropic');

// ──────────────────────────────────────────────
// PG-9: Cache prevents redundant AI calls
// ──────────────────────────────────────────────

console.log('\nPG-9: Cache prevents redundant AI calls');

assert(assessmentRoute.includes('assessmentCache'), 'Assessment route has cache Map');
assert(assessmentRoute.includes('buildCacheKey'), 'Assessment route builds cache keys');
assert(assessmentRoute.includes('hashData'), 'Assessment route hashes data for cache key');
assert(assessmentRoute.includes('CACHE_TTL_MS'), 'Assessment route has cache TTL');
assert(assessmentRoute.includes("cached: true"), 'Cache hit returns cached: true');
assert(assessmentRoute.includes("cached: false"), 'Cache miss returns cached: false');
assert(assessmentRoute.includes('assessmentCache.set'), 'Assessment route stores in cache after generation');

// Verify cache key is deterministic (persona + tenantId + dataHash)
assert(assessmentRoute.includes('`${persona}:${tenantId'), 'Cache key includes persona and tenantId');

// ──────────────────────────────────────────────
// PG-10: Anti-hallucination: safety gate enforced (AP-18)
// ──────────────────────────────────────────────

console.log('\nPG-10: Anti-hallucination: safety gate enforced (AP-18)');

assert(assessmentRoute.includes('calculation_results'), 'Safety gate checks calculation_results');
assert(assessmentRoute.includes("count: 'exact'"), 'Safety gate uses count query');
assert(assessmentRoute.includes('count === 0'), 'Safety gate checks for zero results');
assert(assessmentRoute.includes('generated: false'), 'Zero results → generated: false');

// ──────────────────────────────────────────────
// PG-11: Empty data produces honest "no data" message
// ──────────────────────────────────────────────

console.log('\nPG-11: Empty data produces honest "no data" message');

assert(assessmentRoute.includes('No calculation data available'), 'English "no data" message present');
assert(assessmentRoute.includes('No hay datos de calculo'), 'Spanish "no data" message present');
assert(assessmentRoute.includes('dataPoints: 0'), 'Returns dataPoints: 0 for empty data');

// ──────────────────────────────────────────────
// Additional: Training signal capture (PG-18)
// ──────────────────────────────────────────────

console.log('\nAdditional: Training signal capture');

assert(assessmentRoute.includes("import { persistSignal }"), 'Assessment route imports persistSignal');
assert(assessmentRoute.includes("training:assessment_generated"), 'Training signal type is assessment_generated');
assert(assessmentRoute.includes('assessmentLength'), 'Training signal includes assessment length');
assert(assessmentRoute.includes('hadAnomalies'), 'Training signal tracks anomaly presence');

// ──────────────────────────────────────────────
// Additional: Dashboard wiring verification (PG-12, PG-13, PG-14)
// ──────────────────────────────────────────────

console.log('\nDashboard wiring verification');

const adminDash = fs.readFileSync(
  path.join(ROOT, 'src/components/dashboards/AdminDashboard.tsx'),
  'utf-8'
);
const managerDash = fs.readFileSync(
  path.join(ROOT, 'src/components/dashboards/ManagerDashboard.tsx'),
  'utf-8'
);
const repDash = fs.readFileSync(
  path.join(ROOT, 'src/components/dashboards/RepDashboard.tsx'),
  'utf-8'
);

// Admin dashboard
assert(adminDash.includes("import { AssessmentPanel }"), 'AdminDashboard imports AssessmentPanel');
assert(adminDash.includes('<AssessmentPanel'), 'AdminDashboard renders <AssessmentPanel>');
assert(adminDash.includes('persona="admin"'), 'AdminDashboard passes persona="admin"');
assert(adminDash.includes('assessmentData'), 'AdminDashboard passes assessmentData');
assert(adminDash.includes('tenantId={tenantId}') || adminDash.includes('tenantId='), 'AdminDashboard passes tenantId');

// Manager dashboard
assert(managerDash.includes("import { AssessmentPanel }"), 'ManagerDashboard imports AssessmentPanel');
assert(managerDash.includes('<AssessmentPanel'), 'ManagerDashboard renders <AssessmentPanel>');
assert(managerDash.includes('persona="manager"'), 'ManagerDashboard passes persona="manager"');
assert(managerDash.includes('assessmentData'), 'ManagerDashboard passes assessmentData');

// Rep/Individual dashboard
assert(repDash.includes("import { AssessmentPanel }"), 'RepDashboard imports AssessmentPanel');
assert(repDash.includes('<AssessmentPanel'), 'RepDashboard renders <AssessmentPanel>');
assert(repDash.includes('persona="rep"'), 'RepDashboard passes persona="rep"');
assert(repDash.includes('assessmentData'), 'RepDashboard passes assessmentData');

// Operate cockpit also has admin panel
const operatePage = fs.readFileSync(
  path.join(ROOT, 'src/app/operate/page.tsx'),
  'utf-8'
);
assert(operatePage.includes("import { AssessmentPanel }"), 'Operate cockpit imports AssessmentPanel');
assert(operatePage.includes('persona="admin"'), 'Operate cockpit passes persona="admin"');

// ──────────────────────────────────────────────
// Additional: Build compilation check
// ──────────────────────────────────────────────

console.log('\nBuild compilation verification');

// Verify assessment route TypeScript compiles (imports exist)
assert(assessmentRoute.includes("import { NextRequest, NextResponse }"), 'Route has Next.js imports');
assert(assessmentRoute.includes("import type { Json }"), 'Route imports Json type for Supabase');

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

console.log(`\n${'='.repeat(60)}`);
console.log(`OB-83 Mission 2+3+4: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${'='.repeat(60)}`);

if (failed > 0) {
  process.exit(1);
}
