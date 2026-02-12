#!/usr/bin/env node
/**
 * Generate the full reconciliation script with embedded ground truth
 */

const fs = require('fs');
const path = require('path');

// Read the compact ground truth
const groundTruth = fs.readFileSync(path.join(__dirname, 'ground-truth-compact.json'), 'utf8');

const scriptTemplate = `
/**
 * OB-30 Full Per-Component Reconciliation Script
 * Paste this entire script into browser console after running calculation
 *
 * Prerequisites:
 * - Run calculation on /operate/calculate page
 * - window.__VL_RESULTS should contain 719 employee results
 */

(function() {
  'use strict';

  // Ground Truth Data (719 employees from CLT14B_Reconciliation_Detail.xlsx)
  const GT = ${groundTruth};

  // Ground Truth Totals
  const GT_TOTALS = {
    optical: 748600,
    store: 116250,
    newCustomers: 39100,
    collections: 283000,
    insurance: 10,
    warranty: 66872,
    total: 1253832
  };

  // Component name mapping: VL component name patterns -> GT field
  const COMPONENT_MAP = {
    // Optical Sales (C1) - Matrix lookup
    optical: [
      'optical', 'optica', 'venta individual', 'venta_individual',
      'individual sales', 'c1', 'ventas opticas'
    ],
    // Store Sales (C2) - Tier lookup
    store: [
      'store', 'tienda', 'venta de tienda', 'venta_tienda',
      'store sales', 'c2', 'ventas tienda'
    ],
    // New Customers (C3) - Tier lookup
    newCustomers: [
      'new customer', 'cliente', 'clientes nuevos', 'new_customer',
      'nuevos', 'c3', 'captacion'
    ],
    // Collections (C4) - Tier lookup
    collections: [
      'collection', 'cobranza', 'cobro', 'collections',
      'c4', 'recaudacion'
    ],
    // Insurance (C5) - Percentage
    insurance: [
      'insurance', 'seguro', 'club', 'proteccion', 'protection',
      'c5', 'seguros'
    ],
    // Warranty (C6) - Percentage (DATA MISSING)
    warranty: [
      'warranty', 'garantia', 'extended', 'extendida',
      'c6', 'garantias'
    ],
    // Services - Not in GT but may be in VL
    services: [
      'service', 'servicio', 'services', 'servicios'
    ]
  };

  function classifyComponent(componentName) {
    const name = (componentName || '').toLowerCase();
    for (const [gtField, patterns] of Object.entries(COMPONENT_MAP)) {
      if (patterns.some(p => name.includes(p))) {
        return gtField;
      }
    }
    return 'unknown';
  }

  function runReconciliation() {
    // Get VL results
    const vlResults = window.__VL_RESULTS;
    if (!vlResults || !Array.isArray(vlResults)) {
      console.error('ERROR: window.__VL_RESULTS not found or invalid');
      console.log('Run calculation first, then run this script');
      return;
    }

    console.log('='.repeat(70));
    console.log('OB-30 FULL RECONCILIATION REPORT');
    console.log('Generated:', new Date().toISOString());
    console.log('='.repeat(70));
    console.log('');

    // Initialize accumulators
    const vlTotals = {
      optical: 0, store: 0, newCustomers: 0, collections: 0,
      insurance: 0, warranty: 0, services: 0, unknown: 0, total: 0
    };

    const employeeComparisons = [];
    const discrepancyCategories = {
      variantMismatch: { count: 0, impact: 0, employees: [] },
      exactMatch: { count: 0 },
      within1: { count: 0 },
      within10: { count: 0 },
      over10: { count: 0, impact: 0, employees: [] }
    };

    let matchedEmployees = 0;
    let unmatchedVL = 0;
    let unmatchedGT = 0;

    // Process each VL result
    const processedGT = new Set();

    for (const emp of vlResults) {
      const empId = String(emp.employeeId || '').trim();
      if (!empId) continue;

      const gtData = GT[empId];
      processedGT.add(empId);

      // Classify and sum VL components
      const vlComponents = { optical: 0, store: 0, newCustomers: 0, collections: 0, insurance: 0, warranty: 0, services: 0, unknown: 0 };

      for (const comp of (emp.components || [])) {
        const category = classifyComponent(comp.componentName);
        const value = Number(comp.outputValue || 0);
        vlComponents[category] += value;
        vlTotals[category] += value;
      }

      const vlTotal = emp.totalIncentive || 0;
      vlTotals.total += vlTotal;

      if (!gtData) {
        unmatchedVL++;
        continue;
      }

      matchedEmployees++;

      // Compare per-component
      // FIX: Proper variant detection - 'no certificado' contains 'certificado' so must check for negation
      const vId = (emp.variantId || '').toLowerCase();
      const vName = (emp.variantName || '').toLowerCase();
      const isNonCert = vId === 'non-certified' || vId.includes('non') || vName.includes('no certificado') || vName.includes('no cert');
      const isCert = !isNonCert && (vId === 'certified' || vName.includes('certificado') || vName.includes('certified'));

      const comparison = {
        employeeId: empId,
        certified: gtData.certified,
        vlCertified: isCert,
        vlTotal,
        gtTotal: gtData.total,
        diff: vlTotal - gtData.total,
        components: {}
      };

      for (const field of ['optical', 'store', 'newCustomers', 'collections', 'insurance', 'warranty']) {
        comparison.components[field] = {
          vl: vlComponents[field],
          gt: gtData[field],
          diff: vlComponents[field] - gtData[field]
        };
      }

      // Check for variant mismatch
      if (comparison.vlCertified !== gtData.certified) {
        discrepancyCategories.variantMismatch.count++;
        discrepancyCategories.variantMismatch.impact += Math.abs(comparison.diff);
        discrepancyCategories.variantMismatch.employees.push({
          id: empId,
          vlVariant: comparison.vlCertified ? 'certified' : 'non-certified',
          gtVariant: gtData.certified ? 'certified' : 'non-certified',
          diff: comparison.diff
        });
      }

      // Categorize by difference magnitude
      const absDiff = Math.abs(comparison.diff);
      if (absDiff === 0) {
        discrepancyCategories.exactMatch.count++;
      } else if (absDiff <= 1) {
        discrepancyCategories.within1.count++;
      } else if (absDiff <= 10) {
        discrepancyCategories.within10.count++;
      } else {
        discrepancyCategories.over10.count++;
        discrepancyCategories.over10.impact += absDiff;
        discrepancyCategories.over10.employees.push(comparison);
      }

      employeeComparisons.push(comparison);
    }

    // Check for GT employees not in VL
    for (const gtId of Object.keys(GT)) {
      if (!processedGT.has(gtId)) {
        unmatchedGT++;
      }
    }

    // OUTPUT 1: Component Totals
    console.log('OUTPUT 1: COMPONENT TOTALS');
    console.log('-'.repeat(70));
    console.log('Component            VL Total      GT Total      Difference');
    console.log('-'.repeat(70));

    const componentOrder = ['optical', 'store', 'newCustomers', 'collections', 'insurance', 'warranty'];
    const componentNames = {
      optical: 'Optical Sales (C1)',
      store: 'Store Sales (C2)',
      newCustomers: 'New Customers (C3)',
      collections: 'Collections (C4)',
      insurance: 'Insurance (C5)',
      warranty: 'Warranty (C6)'
    };

    let totalDiff = 0;
    for (const comp of componentOrder) {
      const vl = vlTotals[comp];
      const gt = GT_TOTALS[comp];
      const diff = vl - gt;
      totalDiff += diff;
      const status = Math.abs(diff) < 100 ? 'OK' : diff > 0 ? 'OVER' : 'UNDER';
      console.log(
        componentNames[comp].padEnd(20) +
        ('$' + vl.toLocaleString()).padStart(12) +
        ('$' + gt.toLocaleString()).padStart(12) +
        (diff >= 0 ? '+$' : '-$').padStart(8) + Math.abs(diff).toLocaleString().padStart(8) +
        '  [' + status + ']'
      );
    }

    if (vlTotals.services > 0) {
      console.log('Services (extra)'.padEnd(20) + ('$' + vlTotals.services.toLocaleString()).padStart(12) + '(not in GT)'.padStart(12));
    }
    if (vlTotals.unknown > 0) {
      console.log('Unknown'.padEnd(20) + ('$' + vlTotals.unknown.toLocaleString()).padStart(12) + '(unclassified)'.padStart(12));
    }

    console.log('-'.repeat(70));
    console.log(
      'TOTAL'.padEnd(20) +
      ('$' + vlTotals.total.toLocaleString()).padStart(12) +
      ('$' + GT_TOTALS.total.toLocaleString()).padStart(12) +
      (totalDiff >= 0 ? '+$' : '-$').padStart(8) + Math.abs(totalDiff).toLocaleString().padStart(8)
    );
    console.log('');

    // Excluding warranty calculation
    const vlExclWarranty = vlTotals.total - vlTotals.warranty;
    const gtExclWarranty = GT_TOTALS.total - GT_TOTALS.warranty;
    console.log('EXCLUDING WARRANTY:');
    console.log('  VL Total (excl warranty):  $' + vlExclWarranty.toLocaleString());
    console.log('  GT Total (excl warranty):  $' + gtExclWarranty.toLocaleString());
    console.log('  Difference:                ' + (vlExclWarranty >= gtExclWarranty ? '+' : '-') + '$' + Math.abs(vlExclWarranty - gtExclWarranty).toLocaleString());
    console.log('');

    // OUTPUT 2: Top 20 Employee Discrepancies
    console.log('OUTPUT 2: TOP 20 EMPLOYEE DISCREPANCIES');
    console.log('-'.repeat(70));

    const sorted = employeeComparisons
      .filter(e => Math.abs(e.diff) > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 20);

    if (sorted.length === 0) {
      console.log('No discrepancies found - all employees match exactly!');
    } else {
      for (const emp of sorted) {
        console.log('Employee ' + emp.employeeId + ': VL=$' + emp.vlTotal.toLocaleString() + ' GT=$' + emp.gtTotal.toLocaleString() + ' Diff=' + (emp.diff >= 0 ? '+' : '') + '$' + emp.diff.toLocaleString());
        console.log('  Variant: VL=' + (emp.vlCertified ? 'certified' : 'non-certified') + ' GT=' + (emp.certified ? 'certified' : 'non-certified') + (emp.vlCertified !== emp.certified ? ' [MISMATCH]' : ''));
        for (const [comp, data] of Object.entries(emp.components)) {
          if (data.vl !== 0 || data.gt !== 0 || data.diff !== 0) {
            console.log('    ' + comp.padEnd(12) + ': VL=$' + data.vl.toLocaleString().padStart(6) + ' GT=$' + data.gt.toLocaleString().padStart(6) + ' Diff=' + (data.diff >= 0 ? '+' : '') + '$' + data.diff.toLocaleString());
          }
        }
      }
    }
    console.log('');

    // OUTPUT 3: Discrepancy Categories
    console.log('OUTPUT 3: DISCREPANCY CATEGORIES');
    console.log('-'.repeat(70));
    console.log('Variant misselection: ' + discrepancyCategories.variantMismatch.count + ' employees, $' + discrepancyCategories.variantMismatch.impact.toLocaleString() + ' impact');
    if (discrepancyCategories.variantMismatch.count > 0 && discrepancyCategories.variantMismatch.count <= 10) {
      for (const e of discrepancyCategories.variantMismatch.employees) {
        console.log('  - ' + e.id + ': VL=' + e.vlVariant + ' GT=' + e.gtVariant + ' diff=$' + e.diff);
      }
    }
    console.log('');
    console.log('Match breakdown:');
    console.log('  Exact match ($0):     ' + discrepancyCategories.exactMatch.count + ' employees');
    console.log('  Within $1:            ' + discrepancyCategories.within1.count + ' employees');
    console.log('  Within $10:           ' + discrepancyCategories.within10.count + ' employees');
    console.log('  Over $10 difference:  ' + discrepancyCategories.over10.count + ' employees, $' + discrepancyCategories.over10.impact.toLocaleString() + ' total impact');
    console.log('');
    console.log('Employee matching:');
    console.log('  Matched:              ' + matchedEmployees + ' employees');
    console.log('  VL only (not in GT):  ' + unmatchedVL + ' employees');
    console.log('  GT only (not in VL):  ' + unmatchedGT + ' employees');
    console.log('');

    // Summary
    console.log('='.repeat(70));
    console.log('RECONCILIATION SUMMARY');
    console.log('='.repeat(70));
    const variantOK = discrepancyCategories.variantMismatch.count === 0;
    const totalDiffExclWarranty = vlExclWarranty - gtExclWarranty;
    const totalOK = Math.abs(totalDiffExclWarranty) < 5000;

    console.log('');
    console.log('PROOF GATE CHECKS:');
    console.log('  [' + (variantOK ? 'PASS' : 'FAIL') + '] Variant mismatches: ' + discrepancyCategories.variantMismatch.count + ' (target: 0)');
    console.log('  [' + (totalOK ? 'PASS' : 'FAIL') + '] Total (excl warranty) within +/-$5K: ' + (totalDiffExclWarranty >= 0 ? '+' : '') + '$' + totalDiffExclWarranty.toLocaleString() + ' (target: +/-$5K of $' + gtExclWarranty.toLocaleString() + ')');
    console.log('');
    console.log('  [INFO] Warranty data gap: $' + GT_TOTALS.warranty.toLocaleString() + ' (8 employees with GT warranty data)');
    console.log('');

    // Component-level checks
    const checks = [
      { name: 'Optical', vl: vlTotals.optical, gt: GT_TOTALS.optical, tolerance: 5000 },
      { name: 'Store', vl: vlTotals.store, gt: GT_TOTALS.store, tolerance: 500 },
      { name: 'New Customers', vl: vlTotals.newCustomers, gt: GT_TOTALS.newCustomers, tolerance: 500 },
      { name: 'Collections', vl: vlTotals.collections, gt: GT_TOTALS.collections, tolerance: 500 },
      { name: 'Insurance', vl: vlTotals.insurance, gt: GT_TOTALS.insurance, tolerance: 100 }
    ];

    for (const c of checks) {
      const diff = c.vl - c.gt;
      const ok = Math.abs(diff) <= c.tolerance;
      console.log('  [' + (ok ? 'PASS' : 'FAIL') + '] ' + c.name + ': ' + (diff >= 0 ? '+' : '') + '$' + diff.toLocaleString() + ' (tolerance: +/-$' + c.tolerance.toLocaleString() + ')');
    }

    console.log('');
    console.log('='.repeat(70));

    // Store results for further analysis
    window.__VL_RECONCILIATION = {
      vlTotals,
      gtTotals: GT_TOTALS,
      comparisons: employeeComparisons,
      categories: discrepancyCategories,
      timestamp: new Date().toISOString()
    };
    console.log('Full reconciliation data saved to window.__VL_RECONCILIATION');
  }

  runReconciliation();
})();
`;

// Write the final script
fs.writeFileSync(path.join(__dirname, 'reconcile-full.js'), scriptTemplate);
console.log('Generated: scripts/reconcile-full.js');
console.log('Size:', scriptTemplate.length, 'bytes');
