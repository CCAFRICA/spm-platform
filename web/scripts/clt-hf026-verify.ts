#!/usr/bin/env npx tsx
/**
 * CLT-HF026 Verification Script
 *
 * Automated verification of HF-026 fixes:
 * - Phase 1: No more hardcoded tenant fallbacks
 * - Phase 2: All Supabase read functions guarded
 * - Phase 3: DemoPersonaSwitcher password correct
 *
 * Run: npx tsx web/scripts/clt-hf026-verify.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const WEB_SRC = path.resolve(__dirname, '../src');
let passed = 0;
let failed = 0;
const results: Array<{ gate: string; status: 'PASS' | 'FAIL'; detail: string }> = [];

function gate(name: string, ok: boolean, detail: string) {
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passed++;
  else failed++;
  results.push({ gate: name, status, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

function readFile(relPath: string): string {
  const full = path.resolve(WEB_SRC, relPath);
  if (!fs.existsSync(full)) return '';
  return fs.readFileSync(full, 'utf-8');
}

function grepInFile(relPath: string, pattern: RegExp): string[] {
  const content = readFile(relPath);
  if (!content) return [];
  return content.split('\n').filter(line => pattern.test(line));
}

function countInFile(relPath: string, pattern: RegExp): number {
  return grepInFile(relPath, pattern).length;
}

// ══════════════════════════════════════════════════
// SECTION 1: No hardcoded tenant fallbacks
// ══════════════════════════════════════════════════
console.log('\n═══ SECTION 1: Hardcoded tenant fallbacks ═══\n');

const PAGE_FILES = [
  'app/notifications/page.tsx',
  'app/insights/analytics/page.tsx',
  'app/admin/access-control/page.tsx',
  'app/data/quality/page.tsx',
  'app/workforce/permissions/page.tsx',
  'app/workforce/roles/page.tsx',
  'app/performance/approvals/plans/page.tsx',
  'app/operate/normalization/page.tsx',
];

for (const file of PAGE_FILES) {
  const retailcoFallbacks = countInFile(file, /\|\|\s*['"]retailco['"]/);
  const frmxFallbacks = countInFile(file, /\|\|\s*['"]frmx-demo['"]/);
  const total = retailcoFallbacks + frmxFallbacks;
  gate(
    `No fallback in ${path.basename(file)}`,
    total === 0,
    total === 0 ? 'Clean' : `Found ${total} hardcoded fallback(s)`
  );
}

// Check SubmitForApprovalDialog
const dialogRetailco = countInFile(
  'components/plan-approval/SubmitForApprovalDialog.tsx',
  /\|\|\s*['"]retailco['"]/
);
gate(
  'No retailco in SubmitForApprovalDialog',
  dialogRetailco === 0,
  dialogRetailco === 0 ? 'Clean (uses || \'\')' : `Found ${dialogRetailco} fallback(s)`
);

// ══════════════════════════════════════════════════
// SECTION 2: requireTenantId guards in Supabase services
// ══════════════════════════════════════════════════
console.log('\n═══ SECTION 2: requireTenantId guards ═══\n');

const SERVICE_FILES: Array<{ file: string; expectedGuards: number }> = [
  { file: 'lib/supabase/calculation-service.ts', expectedGuards: 12 }, // 4 write + 8 read
  { file: 'lib/supabase/entity-service.ts', expectedGuards: 7 },      // 4 write + 3 read
  { file: 'lib/supabase/data-service.ts', expectedGuards: 10 },       // 3 write + 7 read
  { file: 'lib/supabase/rule-set-service.ts', expectedGuards: 7 },    // 1 write + 6 read
  { file: 'lib/calculation/calculation-lifecycle-service.ts', expectedGuards: 2 }, // 1 write + 1 read
];

for (const { file, expectedGuards } of SERVICE_FILES) {
  const count = countInFile(file, /requireTenantId\(/);
  gate(
    `Guards in ${path.basename(file)}`,
    count >= expectedGuards,
    `${count} guards (expected >= ${expectedGuards})`
  );
}

// Verify specific read functions have guards
const CALC_SERVICE = readFile('lib/supabase/calculation-service.ts');
const readFunctions = [
  'getCalculationBatch', 'listCalculationBatches', 'getActiveBatch',
  'getCalculationResults', 'getEntityResults', 'getCalculationTraces',
  'getEntityPeriodOutcomes', 'getEntityOutcome',
];

for (const fn of readFunctions) {
  // Find the function, then check if requireTenantId appears before the next export
  const fnIndex = CALC_SERVICE.indexOf(`export async function ${fn}`);
  if (fnIndex === -1) {
    gate(`Guard in ${fn}`, false, 'Function not found');
    continue;
  }
  const nextExport = CALC_SERVICE.indexOf('export ', fnIndex + 10);
  const fnBody = CALC_SERVICE.slice(fnIndex, nextExport > fnIndex ? nextExport : undefined);
  const hasGuard = fnBody.includes('requireTenantId(');
  gate(`Guard in ${fn}`, hasGuard, hasGuard ? 'Guarded' : 'MISSING guard');
}

// ══════════════════════════════════════════════════
// SECTION 3: DemoPersonaSwitcher
// ══════════════════════════════════════════════════
console.log('\n═══ SECTION 3: DemoPersonaSwitcher ═══\n');

const switcherContent = readFile('components/demo/DemoPersonaSwitcher.tsx');

// Check password is correct
const hasCorrectPassword = switcherContent.includes("'demo-password-VL1'");
const hasOldPassword = switcherContent.includes("'VL-platform-2024!'");
gate(
  'Correct platform password',
  hasCorrectPassword && !hasOldPassword,
  hasCorrectPassword ? 'demo-password-VL1' : 'WRONG password'
);

// Check visibility guards
const hasVLAdminCheck = switcherContent.includes('isVLAdmin');
const hasTenantCheck = switcherContent.includes('currentTenant');
const hasDemoUsersCheck = switcherContent.includes('demoUsers.length');
gate(
  'Visibility guards',
  hasVLAdminCheck && hasTenantCheck && hasDemoUsersCheck,
  `isVLAdmin=${hasVLAdminCheck}, tenant=${hasTenantCheck}, demoUsers=${hasDemoUsersCheck}`
);

// Check it fetches demo_users from settings
const fetchesSettings = switcherContent.includes("settings.demo_users") || switcherContent.includes("'demo_users'");
gate(
  'Fetches demo_users from settings',
  fetchesSettings,
  fetchesSettings ? 'Reads from tenant settings JSONB' : 'NOT fetching from settings'
);

// Check it's rendered in auth-shell
const authShell = readFile('components/layout/auth-shell.tsx');
const renderedInShell = authShell.includes('<DemoPersonaSwitcher');
gate(
  'Rendered in auth-shell',
  renderedInShell,
  renderedInShell ? 'Present in layout' : 'NOT in layout'
);

// ══════════════════════════════════════════════════
// SECTION 4: Build verification
// ══════════════════════════════════════════════════
console.log('\n═══ SECTION 4: Build artifact check ═══\n');

const nextDir = path.resolve(__dirname, '../.next');
const buildExists = fs.existsSync(nextDir);
gate('Build artifact exists', buildExists, buildExists ? '.next directory present' : 'No .next directory');

if (buildExists) {
  const buildManifest = path.resolve(nextDir, 'build-manifest.json');
  const manifestExists = fs.existsSync(buildManifest);
  gate('Build manifest valid', manifestExists, manifestExists ? 'build-manifest.json present' : 'Missing manifest');
}

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════');
console.log(`  TOTAL: ${passed + failed} gates`);
console.log(`  PASSED: ${passed}`);
console.log(`  FAILED: ${failed}`);
console.log(`  SCORE: ${Math.round((passed / (passed + failed)) * 100)}%`);
console.log('═══════════════════════════════════════\n');

if (failed > 0) {
  console.log('FAILED GATES:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  ❌ ${r.gate}: ${r.detail}`);
  });
  console.log('');
}

process.exit(failed > 0 ? 1 : 0);
