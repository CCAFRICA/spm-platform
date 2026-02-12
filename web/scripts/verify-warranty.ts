/**
 * HF-019: Warranty Calculation Diagnostic Script
 *
 * Runs headlessly (no browser) to trace warranty calculation.
 *
 * Usage: npx tsx scripts/verify-warranty.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Simulated localStorage for headless execution
const localStorageData: Record<string, string> = {};

// Load localStorage data from a JSON dump
function loadLocalStorageFromDump(): void {
  // We'll read directly from the test or look for a dump file
  const dumpPath = path.join(__dirname, 'localStorage-dump.json');
  if (fs.existsSync(dumpPath)) {
    const data = JSON.parse(fs.readFileSync(dumpPath, 'utf-8'));
    Object.assign(localStorageData, data);
    console.log(`Loaded ${Object.keys(data).length} localStorage keys from dump`);
  }
}

// Mock localStorage for Node.js
const mockLocalStorage = {
  getItem: (key: string): string | null => localStorageData[key] || null,
  setItem: (key: string, value: string): void => { localStorageData[key] = value; },
  removeItem: (key: string): void => { delete localStorageData[key]; },
  clear: (): void => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); },
  get length(): number { return Object.keys(localStorageData).length; },
  key: (i: number): string | null => Object.keys(localStorageData)[i] || null,
};

// @ts-ignore
global.localStorage = mockLocalStorage;
// @ts-ignore
global.window = { localStorage: mockLocalStorage };

// Now import the modules that use localStorage
import { createRetailCGMXUnifiedPlan } from '../src/lib/compensation/retailcgmx-plan';
import { savePlan, getPlans } from '../src/lib/compensation/plan-storage';
import type { CalculationResult } from '../src/types/compensation-plan';

// Plan types we need
interface SheetMetrics {
  attainment?: number;
  amount?: number;
  goal?: number;
  quantity?: number;
}

interface AggregatedEmployee {
  employeeId: string;
  name?: string;
  storeId?: string;
  role?: string;
  componentMetrics?: Record<string, SheetMetrics>;
  [key: string]: unknown;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function loadAggregatedEmployees(tenantId: string): AggregatedEmployee[] {
  const key = `data_layer_committed_aggregated_${tenantId}`;
  const data = mockLocalStorage.getItem(key);
  if (!data) {
    console.error(`No aggregated data found for tenant: ${tenantId}`);
    return [];
  }
  return JSON.parse(data);
}

function findWarrantySheet(componentMetrics: Record<string, SheetMetrics>): [string, SheetMetrics] | null {
  // Look for sheet matching warranty patterns
  for (const [sheetName, metrics] of Object.entries(componentMetrics)) {
    const name = sheetName.toLowerCase();
    if (name.includes('garantia') || name.includes('warranty') || name.includes('extendida')) {
      return [sheetName, metrics];
    }
  }
  return null;
}

function findInsuranceSheet(componentMetrics: Record<string, SheetMetrics>): [string, SheetMetrics] | null {
  // Look for sheet matching insurance patterns
  for (const [sheetName, metrics] of Object.entries(componentMetrics)) {
    const name = sheetName.toLowerCase();
    if (name.includes('seguro') || name.includes('insurance') || name.includes('proteccion')) {
      return [sheetName, metrics];
    }
  }
  return null;
}

// ============================================
// MAIN DIAGNOSTIC
// ============================================

async function main() {
  console.log('='.repeat(70));
  console.log('HF-019: WARRANTY CALCULATION DIAGNOSTIC');
  console.log('='.repeat(70));
  console.log();

  // Load localStorage dump
  loadLocalStorageFromDump();

  const tenantId = 'vialuce';

  // Load employees
  const employees = loadAggregatedEmployees(tenantId);
  console.log(`Loaded ${employees.length} employees for tenant: ${tenantId}`);
  console.log();

  if (employees.length === 0) {
    console.error('ERROR: No employee data found. Export localStorage first.');
    console.log();
    console.log('To export localStorage, run this in browser console:');
    console.log('  copy(JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))))');
    console.log('Then save to: scripts/localStorage-dump.json');
    process.exit(1);
  }

  // Initialize plan
  const plan = createRetailCGMXUnifiedPlan();
  savePlan(plan);
  console.log(`Plan initialized: ${plan.name}`);
  console.log();

  // Find warranty component configuration
  const certifiedVariant = plan.configuration.variants[0];
  const warrantyComponent = certifiedVariant.components.find(c => c.id === 'servicios');

  console.log('WARRANTY COMPONENT CONFIGURATION:');
  console.log(`  ID: ${warrantyComponent?.id}`);
  console.log(`  Name: ${warrantyComponent?.name}`);
  console.log(`  Type: ${warrantyComponent?.componentType}`);
  console.log(`  Rate: ${warrantyComponent?.percentageConfig?.rate} (${(warrantyComponent?.percentageConfig?.rate || 0) * 100}%)`);
  console.log(`  Applied To: ${warrantyComponent?.percentageConfig?.appliedTo}`);
  console.log();

  // ============================================
  // TRACE 1: High warranty employee (90195508, store 1000)
  // ============================================

  console.log('='.repeat(70));
  console.log('TRACE 1: HIGH WARRANTY EMPLOYEE');
  console.log('='.repeat(70));

  const highWarrantyEmp = employees.find(e => String(e.employeeId) === '90195508');

  if (highWarrantyEmp) {
    console.log(`Employee ID: ${highWarrantyEmp.employeeId}`);
    console.log(`Store ID: ${highWarrantyEmp.storeId}`);
    console.log(`Name: ${highWarrantyEmp.name || 'N/A'}`);
    console.log();

    const componentMetrics = highWarrantyEmp.componentMetrics;
    if (componentMetrics) {
      console.log('All sheet names in componentMetrics:');
      for (const sheetName of Object.keys(componentMetrics)) {
        const m = componentMetrics[sheetName];
        console.log(`  - ${sheetName}: amount=${m.amount}, goal=${m.goal}, attainment=${m.attainment}`);
      }
      console.log();

      const warrantySheet = findWarrantySheet(componentMetrics);
      if (warrantySheet) {
        const [sheetName, metrics] = warrantySheet;
        console.log(`Warranty sheet found: "${sheetName}"`);
        console.log(`  amount (Monto): ${metrics.amount}`);
        console.log(`  goal: ${metrics.goal}`);
        console.log(`  attainment: ${metrics.attainment}`);
        console.log();

        const expectedPayout = (metrics.amount || 0) * 0.04;
        console.log(`Expected warranty payout: ${metrics.amount} × 4% = ${expectedPayout.toFixed(2)}`);
      } else {
        console.log('WARNING: No warranty sheet found in componentMetrics');
      }
    } else {
      console.log('WARNING: No componentMetrics found for this employee');
    }
  } else {
    console.log('Employee 90195508 not found');
  }

  console.log();

  // ============================================
  // TRACE 2: Zero warranty employee (find one with Monto = 0)
  // ============================================

  console.log('='.repeat(70));
  console.log('TRACE 2: ZERO WARRANTY EMPLOYEE');
  console.log('='.repeat(70));

  // Find an employee with zero warranty (Monto = 0 or undefined)
  const zeroWarrantyEmp = employees.find(e => {
    if (!e.componentMetrics) return false;
    const ws = findWarrantySheet(e.componentMetrics);
    if (!ws) return true; // No warranty sheet = should be $0
    const [, metrics] = ws;
    return metrics.amount === 0 || metrics.amount === undefined || metrics.amount === null;
  });

  if (zeroWarrantyEmp) {
    console.log(`Employee ID: ${zeroWarrantyEmp.employeeId}`);
    console.log(`Store ID: ${zeroWarrantyEmp.storeId}`);
    console.log(`Name: ${zeroWarrantyEmp.name || 'N/A'}`);
    console.log();

    const componentMetrics = zeroWarrantyEmp.componentMetrics;
    if (componentMetrics) {
      console.log('All sheet names in componentMetrics:');
      for (const sheetName of Object.keys(componentMetrics)) {
        const m = componentMetrics[sheetName];
        console.log(`  - ${sheetName}: amount=${m.amount}, goal=${m.goal}, attainment=${m.attainment}`);
      }
      console.log();

      const warrantySheet = findWarrantySheet(componentMetrics);
      if (warrantySheet) {
        const [sheetName, metrics] = warrantySheet;
        console.log(`Warranty sheet found: "${sheetName}"`);
        console.log(`  amount (Monto): ${metrics.amount}`);
        console.log(`  goal: ${metrics.goal}`);
        console.log(`  attainment: ${metrics.attainment}`);
        console.log();
        console.log(`Expected warranty payout: ${metrics.amount || 0} × 4% = ${((metrics.amount || 0) * 0.04).toFixed(2)}`);
      } else {
        console.log('No warranty sheet found - expected payout: $0');
      }
    } else {
      console.log('No componentMetrics - expected payout: $0');
    }
  } else {
    console.log('No zero-warranty employee found');
  }

  console.log();

  // ============================================
  // ANALYSIS: Count employees by warranty status
  // ============================================

  console.log('='.repeat(70));
  console.log('WARRANTY DISTRIBUTION ANALYSIS');
  console.log('='.repeat(70));

  let hasWarrantyData = 0;
  let hasNonZeroWarranty = 0;
  let hasZeroWarranty = 0;
  let noWarrantySheet = 0;
  let totalWarrantyAmount = 0;
  let totalExpectedPayout = 0;

  for (const emp of employees) {
    const cm = emp.componentMetrics;
    if (!cm) {
      noWarrantySheet++;
      continue;
    }

    const ws = findWarrantySheet(cm);
    if (!ws) {
      noWarrantySheet++;
      continue;
    }

    hasWarrantyData++;
    const [, metrics] = ws;
    const amount = metrics.amount || 0;

    if (amount > 0) {
      hasNonZeroWarranty++;
      totalWarrantyAmount += amount;
      totalExpectedPayout += amount * 0.04;
    } else {
      hasZeroWarranty++;
    }
  }

  console.log(`Total employees: ${employees.length}`);
  console.log(`Employees with warranty sheet: ${hasWarrantyData}`);
  console.log(`  - Non-zero Monto: ${hasNonZeroWarranty}`);
  console.log(`  - Zero Monto: ${hasZeroWarranty}`);
  console.log(`Employees without warranty sheet: ${noWarrantySheet}`);
  console.log();
  console.log(`Total warranty sales (Monto): $${totalWarrantyAmount.toLocaleString()}`);
  console.log(`Expected total warranty payout (4%): $${totalExpectedPayout.toLocaleString()}`);
  console.log(`Ground truth warranty payout: $66,872`);
  console.log(`ViaLuce implied warranty payout: $76,881`);
  console.log(`Gap: $${(76881 - 66872).toLocaleString()}`);
  console.log();

  // ============================================
  // HYPOTHESIS TEST
  // ============================================

  console.log('='.repeat(70));
  console.log('HYPOTHESIS TEST');
  console.log('='.repeat(70));

  // Hypothesis A: Small payouts to many employees who should get $0
  // $9,999 / 711 = $14.06 per employee
  const hypA_perEmployee = 9999 / (employees.length - hasNonZeroWarranty);
  console.log(`Hypothesis A: Small payouts to ${employees.length - hasNonZeroWarranty} zero-warranty employees`);
  console.log(`  Would require: $${hypA_perEmployee.toFixed(2)} per employee`);
  console.log();

  // Hypothesis B: Higher rate for employees with warranty sales
  // $76,881 / $1,671,803 (implied) = 4.60%
  // Or: $76,881 = total sales * rate -> total sales = $76,881 / 0.04 = $1,922,025
  console.log(`Hypothesis B: Higher rate for ${hasNonZeroWarranty} warranty employees`);
  const impliedTotalSales = 76881 / 0.04;
  console.log(`  At 4%, $76,881 implies total warranty sales of: $${impliedTotalSales.toLocaleString()}`);
  console.log(`  Actual total warranty sales found: $${totalWarrantyAmount.toLocaleString()}`);
  if (totalWarrantyAmount > 0) {
    const actualRate = totalExpectedPayout / totalWarrantyAmount;
    const impliedRate = 76881 / totalWarrantyAmount;
    console.log(`  Actual rate in data: ${(actualRate * 100).toFixed(2)}%`);
    console.log(`  Implied rate from ViaLuce result: ${(impliedRate * 100).toFixed(2)}%`);
  }
  console.log();
}

main().catch(console.error);
