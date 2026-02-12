#!/usr/bin/env npx tsx
/**
 * OB-30 STEP 2: Calculation Reconciliation Script
 *
 * Compares ViaLuce calculated results with ground truth to identify:
 * - Per-employee per-component differences
 * - Variant selection issues (HF-020)
 * - Missing/extra employees
 *
 * Usage:
 *   1. Run calculation in browser at localhost:3000/operate/calculate
 *   2. Export results: copy(JSON.stringify(localStorage))
 *   3. Save to scripts/localStorage-export.json
 *   4. Run: npx tsx scripts/reconcile.ts
 *
 * Output: CLT-16_PRE_FIX_RECONCILIATION.md or CLT-16_POST_FIX_RECONCILIATION.md
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// TYPES
// ============================================

interface CalculationStep {
  componentId: string;
  componentName: string;
  componentType: string;
  outputValue: number;
  variantId?: string;
  calculation?: string;
}

interface CalculationResult {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  variantId?: string;
  variantName?: string;
  components: CalculationStep[];
  totalIncentive: number;
}

interface CalculationRun {
  id: string;
  tenantId: string;
  period: string;
  status: string;
  totalEmployees: number;
  totalPayout: number;
  calculatedAt: string;
}

interface GroundTruthEmployee {
  employeeId: string;
  name: string;
  role: string;
  components: Record<string, number>; // componentId -> amount
  total: number;
}

interface ReconciliationDiff {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  variant: {
    calculated: string | undefined;
    expected: string | undefined;
    match: boolean;
  };
  components: Array<{
    componentId: string;
    componentName: string;
    calculated: number;
    expected: number;
    diff: number;
    diffPercent: number;
  }>;
  totalCalculated: number;
  totalExpected: number;
  totalDiff: number;
}

interface ReconciliationReport {
  timestamp: string;
  tenantId: string;
  period: string;
  runId: string;
  summary: {
    totalEmployees: number;
    matchedEmployees: number;
    diffEmployees: number;
    totalCalculated: number;
    totalExpected: number;
    totalDiff: number;
    diffPercent: number;
  };
  byComponent: Record<string, {
    calculatedTotal: number;
    expectedTotal: number;
    diff: number;
    diffPercent: number;
    employeesWithDiff: number;
  }>;
  variantIssues: Array<{
    employeeId: string;
    employeeName: string;
    role: string;
    calculatedVariant: string | undefined;
    expectedVariant: string | undefined;
  }>;
  topDiffs: ReconciliationDiff[];
  allDiffs: ReconciliationDiff[];
}

// ============================================
// CONSTANTS
// ============================================

const TENANT_ID = 'vialuce';
const GROUND_TRUTH_TOTAL = 1253832; // From HF-019 report

// Component mapping (plan component ID -> ground truth column)
const COMPONENT_MAPPING: Record<string, string> = {
  'optical_sales_certified': 'Venta Óptica',
  'optical_sales_non_certified': 'Venta Óptica',
  'store_sales': 'Venta Tienda',
  'new_customers': 'Clientes Nuevos',
  'collections': 'Cobranza',
  'club_protection': 'Club Protección',
  'warranty': 'Garantía Extendida',
};

// ============================================
// DATA LOADING
// ============================================

function loadLocalStorageExport(): Record<string, string> {
  const exportPath = path.join(__dirname, 'localStorage-export.json');

  if (!fs.existsSync(exportPath)) {
    console.error(`ERROR: localStorage export not found at ${exportPath}`);
    console.log('\nTo create the export:');
    console.log('1. Open browser at localhost:3000');
    console.log('2. Run calculation at /operate/calculate');
    console.log('3. In console: copy(JSON.stringify(localStorage))');
    console.log('4. Save to scripts/localStorage-export.json');
    process.exit(1);
  }

  const content = fs.readFileSync(exportPath, 'utf-8');
  return JSON.parse(content);
}

function getLatestRun(storage: Record<string, string>): CalculationRun | null {
  const runsKey = 'calculation_runs';
  const runsStr = storage[runsKey];

  if (!runsStr) {
    console.error('No calculation_runs found in localStorage export');
    return null;
  }

  const runs: CalculationRun[] = JSON.parse(runsStr);
  const tenantRuns = runs
    .filter(r => r.tenantId === TENANT_ID)
    .sort((a, b) => new Date(b.calculatedAt).getTime() - new Date(a.calculatedAt).getTime());

  if (tenantRuns.length === 0) {
    console.error(`No runs found for tenant ${TENANT_ID}`);
    return null;
  }

  return tenantRuns[0];
}

function getCalculationResults(storage: Record<string, string>, runId: string): CalculationResult[] {
  const metaKey = `calculation_results_${runId}_meta`;
  const metaStr = storage[metaKey];

  if (!metaStr) {
    console.error(`No results metadata found for run ${runId}`);
    return [];
  }

  const meta = JSON.parse(metaStr);
  const results: CalculationResult[] = [];

  for (let i = 0; i < meta.chunks; i++) {
    const chunkKey = `calculation_results_${runId}_${i}`;
    const chunkStr = storage[chunkKey];
    if (chunkStr) {
      const chunk = JSON.parse(chunkStr);
      results.push(...chunk);
    }
  }

  return results;
}

function loadGroundTruth(): Map<string, GroundTruthEmployee> {
  // For now, generate from expected patterns
  // In production, this would load from an Excel file
  const gtPath = path.join(__dirname, 'ground-truth.json');

  if (fs.existsSync(gtPath)) {
    const content = fs.readFileSync(gtPath, 'utf-8');
    const data: GroundTruthEmployee[] = JSON.parse(content);
    return new Map(data.map(e => [e.employeeId, e]));
  }

  // No ground truth file - return empty map
  console.warn('WARNING: No ground-truth.json found. Will report calculated values only.');
  return new Map();
}

// ============================================
// VARIANT DERIVATION (mirrors calculation-orchestrator.ts)
// ============================================

function deriveExpectedVariant(role: string): string {
  const normalizedRole = (role || '').toUpperCase().replace(/\s+/g, ' ').trim();

  const hasNoCertificado =
    normalizedRole.includes('NO CERTIFICADO') ||
    normalizedRole.includes('NO-CERTIFICADO') ||
    normalizedRole.includes('NON-CERTIFICADO') ||
    normalizedRole.includes('NO CERT') ||
    normalizedRole.includes('NON-CERT');

  const hasCertificado =
    normalizedRole.includes('CERTIFICADO') ||
    normalizedRole.includes('CERTIFIED');

  const isCertified = hasCertificado && !hasNoCertificado;

  return isCertified ? 'certified' : 'non-certified';
}

// ============================================
// RECONCILIATION
// ============================================

function reconcile(
  results: CalculationResult[],
  groundTruth: Map<string, GroundTruthEmployee>
): ReconciliationReport {
  const diffs: ReconciliationDiff[] = [];
  const variantIssues: ReconciliationReport['variantIssues'] = [];
  const componentTotals: Record<string, { calculated: number; expected: number; diffCount: number }> = {};

  let totalCalculated = 0;
  let totalExpected = 0;

  for (const result of results) {
    totalCalculated += result.totalIncentive;

    // Check variant
    const expectedVariant = deriveExpectedVariant(result.employeeRole);
    const calculatedVariant = result.variantId;
    const variantMatch = calculatedVariant === expectedVariant;

    if (!variantMatch) {
      variantIssues.push({
        employeeId: result.employeeId,
        employeeName: result.employeeName,
        role: result.employeeRole,
        calculatedVariant,
        expectedVariant,
      });
    }

    // Get ground truth for this employee
    const gt = groundTruth.get(result.employeeId);
    const expectedTotal = gt?.total || 0;
    totalExpected += expectedTotal;

    // Compare components
    const componentDiffs: ReconciliationDiff['components'] = [];

    for (const comp of result.components) {
      // Track component totals
      if (!componentTotals[comp.componentId]) {
        componentTotals[comp.componentId] = { calculated: 0, expected: 0, diffCount: 0 };
      }
      componentTotals[comp.componentId].calculated += comp.outputValue;

      const expectedCompValue = gt?.components[comp.componentId] || 0;
      componentTotals[comp.componentId].expected += expectedCompValue;

      const diff = comp.outputValue - expectedCompValue;
      if (Math.abs(diff) > 0.01) {
        componentTotals[comp.componentId].diffCount++;
        componentDiffs.push({
          componentId: comp.componentId,
          componentName: comp.componentName,
          calculated: comp.outputValue,
          expected: expectedCompValue,
          diff,
          diffPercent: expectedCompValue !== 0 ? (diff / expectedCompValue) * 100 : (diff !== 0 ? 100 : 0),
        });
      }
    }

    const totalDiff = result.totalIncentive - expectedTotal;

    if (!variantMatch || Math.abs(totalDiff) > 0.01) {
      diffs.push({
        employeeId: result.employeeId,
        employeeName: result.employeeName,
        employeeRole: result.employeeRole,
        variant: {
          calculated: calculatedVariant,
          expected: expectedVariant,
          match: variantMatch,
        },
        components: componentDiffs,
        totalCalculated: result.totalIncentive,
        totalExpected: expectedTotal,
        totalDiff,
      });
    }
  }

  // Build component summary
  const byComponent: ReconciliationReport['byComponent'] = {};
  for (const [compId, totals] of Object.entries(componentTotals)) {
    const diff = totals.calculated - totals.expected;
    byComponent[compId] = {
      calculatedTotal: totals.calculated,
      expectedTotal: totals.expected,
      diff,
      diffPercent: totals.expected !== 0 ? (diff / totals.expected) * 100 : 0,
      employeesWithDiff: totals.diffCount,
    };
  }

  // Sort diffs by absolute total diff
  diffs.sort((a, b) => Math.abs(b.totalDiff) - Math.abs(a.totalDiff));

  const totalDiff = totalCalculated - (totalExpected || GROUND_TRUTH_TOTAL);

  return {
    timestamp: new Date().toISOString(),
    tenantId: TENANT_ID,
    period: '',
    runId: '',
    summary: {
      totalEmployees: results.length,
      matchedEmployees: results.length - diffs.length,
      diffEmployees: diffs.length,
      totalCalculated,
      totalExpected: totalExpected || GROUND_TRUTH_TOTAL,
      totalDiff,
      diffPercent: (totalDiff / (totalExpected || GROUND_TRUTH_TOTAL)) * 100,
    },
    byComponent,
    variantIssues,
    topDiffs: diffs.slice(0, 20),
    allDiffs: diffs,
  };
}

// ============================================
// REPORT GENERATION
// ============================================

function generateMarkdownReport(report: ReconciliationReport, isPreFix: boolean): string {
  const lines: string[] = [];
  const title = isPreFix ? 'CLT-16: Pre-Fix Reconciliation Baseline' : 'CLT-16: Post-Fix Reconciliation';

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**Generated**: ${report.timestamp}`);
  lines.push(`**Tenant**: ${report.tenantId}`);
  lines.push(`**Run ID**: ${report.runId}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Employees | ${report.summary.totalEmployees} |`);
  lines.push(`| Employees with Diffs | ${report.summary.diffEmployees} |`);
  lines.push(`| **VL Calculated Total** | $${report.summary.totalCalculated.toLocaleString()} |`);
  lines.push(`| **Ground Truth Total** | $${report.summary.totalExpected.toLocaleString()} |`);
  lines.push(`| **Total Diff** | $${report.summary.totalDiff.toLocaleString()} (${report.summary.diffPercent.toFixed(2)}%) |`);
  lines.push('');

  // Variant Issues (HF-020)
  lines.push('## Variant Selection Issues (HF-020)');
  lines.push('');
  if (report.variantIssues.length === 0) {
    lines.push('**None found** - All employees assigned correct variant.');
  } else {
    lines.push(`**${report.variantIssues.length} employees have incorrect variant selection:**`);
    lines.push('');
    lines.push('| Employee ID | Name | Role | Calculated | Expected |');
    lines.push('|-------------|------|------|------------|----------|');
    for (const issue of report.variantIssues.slice(0, 50)) {
      lines.push(`| ${issue.employeeId} | ${issue.employeeName} | ${issue.role} | ${issue.calculatedVariant} | ${issue.expectedVariant} |`);
    }
    if (report.variantIssues.length > 50) {
      lines.push(`| ... | ... | ... | ... | ... |`);
      lines.push(`| (${report.variantIssues.length - 50} more) | | | | |`);
    }
  }
  lines.push('');

  // By Component
  lines.push('## By Component');
  lines.push('');
  lines.push('| Component | Calculated | Expected | Diff | Diff % | # Employees |');
  lines.push('|-----------|------------|----------|------|--------|-------------|');
  for (const [compId, data] of Object.entries(report.byComponent)) {
    lines.push(`| ${compId} | $${data.calculatedTotal.toLocaleString()} | $${data.expectedTotal.toLocaleString()} | $${data.diff.toLocaleString()} | ${data.diffPercent.toFixed(2)}% | ${data.employeesWithDiff} |`);
  }
  lines.push('');

  // Top Diffs
  lines.push('## Top 20 Differences');
  lines.push('');
  for (const diff of report.topDiffs) {
    lines.push(`### ${diff.employeeId}: ${diff.employeeName}`);
    lines.push(`- **Role**: ${diff.employeeRole}`);
    lines.push(`- **Variant**: ${diff.variant.calculated} ${diff.variant.match ? '✓' : `(expected: ${diff.variant.expected}) ✗`}`);
    lines.push(`- **Total**: $${diff.totalCalculated.toLocaleString()} (expected: $${diff.totalExpected.toLocaleString()}, diff: $${diff.totalDiff.toLocaleString()})`);
    if (diff.components.length > 0) {
      lines.push('- **Component Diffs**:');
      for (const comp of diff.components) {
        lines.push(`  - ${comp.componentName}: $${comp.calculated.toLocaleString()} vs $${comp.expected.toLocaleString()} (diff: $${comp.diff.toLocaleString()})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('='.repeat(70));
  console.log('OB-30 STEP 2: Calculation Reconciliation');
  console.log('='.repeat(70));
  console.log('');

  // Determine if this is pre-fix or post-fix
  const isPreFix = process.argv.includes('--pre-fix') || !process.argv.includes('--post-fix');
  console.log(`Mode: ${isPreFix ? 'PRE-FIX baseline' : 'POST-FIX verification'}`);
  console.log('');

  // Load localStorage export
  console.log('Loading localStorage export...');
  const storage = loadLocalStorageExport();
  console.log(`  Found ${Object.keys(storage).length} keys`);

  // Get latest run
  console.log('Finding latest calculation run...');
  const run = getLatestRun(storage);
  if (!run) {
    process.exit(1);
  }
  console.log(`  Run ID: ${run.id}`);
  console.log(`  Period: ${run.period}`);
  console.log(`  Status: ${run.status}`);
  console.log(`  Employees: ${run.totalEmployees}`);
  console.log(`  Total: $${run.totalPayout.toLocaleString()}`);
  console.log(`  Calculated: ${run.calculatedAt}`);

  // Get results
  console.log('Loading calculation results...');
  const results = getCalculationResults(storage, run.id);
  console.log(`  Loaded ${results.length} employee results`);

  if (results.length === 0) {
    console.error('ERROR: No results found. Make sure calculation completed successfully.');
    process.exit(1);
  }

  // Load ground truth
  console.log('Loading ground truth...');
  const groundTruth = loadGroundTruth();
  console.log(`  Loaded ${groundTruth.size} ground truth records`);

  // Run reconciliation
  console.log('Running reconciliation...');
  const report = reconcile(results, groundTruth);
  report.period = run.period;
  report.runId = run.id;

  // Print summary
  console.log('');
  console.log('='.repeat(70));
  console.log('RECONCILIATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Employees:     ${report.summary.totalEmployees}`);
  console.log(`With Differences:    ${report.summary.diffEmployees}`);
  console.log(`VL Calculated:       $${report.summary.totalCalculated.toLocaleString()}`);
  console.log(`Ground Truth:        $${report.summary.totalExpected.toLocaleString()}`);
  console.log(`Total Diff:          $${report.summary.totalDiff.toLocaleString()} (${report.summary.diffPercent.toFixed(2)}%)`);
  console.log('');
  console.log(`Variant Issues:      ${report.variantIssues.length}`);
  if (report.variantIssues.length > 0) {
    console.log('  First 5:');
    for (const issue of report.variantIssues.slice(0, 5)) {
      console.log(`    - ${issue.employeeId}: ${issue.role} → ${issue.calculatedVariant} (should be ${issue.expectedVariant})`);
    }
  }

  // Generate report
  const markdown = generateMarkdownReport(report, isPreFix);
  const outputFile = isPreFix ? 'CLT-16_PRE_FIX_RECONCILIATION.md' : 'CLT-16_POST_FIX_RECONCILIATION.md';
  const outputPath = path.join(__dirname, '..', outputFile);

  fs.writeFileSync(outputPath, markdown);
  console.log('');
  console.log(`Report saved: ${outputFile}`);

  // Also save raw JSON for debugging
  const jsonPath = path.join(__dirname, isPreFix ? 'reconciliation-pre.json' : 'reconciliation-post.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`Raw data saved: ${path.basename(jsonPath)}`);
}

main().catch(console.error);
