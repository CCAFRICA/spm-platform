#!/usr/bin/env node
/**
 * Extract ground truth data from CLT14B_Reconciliation_Detail.xlsx
 *
 * Column mapping (from Excel):
 * C1 = Optical Sales (Venta Individual) - matrix lookup
 * C2 = Store Sales (Venta Tienda) - tier lookup
 * C3 = New Customers (Clientes Nuevos) - tier lookup
 * C4 = Collections (Cobranza en Tienda) - tier lookup
 * C5 = Insurance (Club de Proteccion) - percentage
 * C6 = Warranty (Garantia Extendida) - percentage (DATA MISSING)
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const FILE_PATH = '/Users/AndrewAfrica/Downloads/CLT14B_Reconciliation_Detail.xlsx';

const workbook = XLSX.readFile(FILE_PATH);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet);

console.log(`Total rows: ${data.length}`);

// Process employees using correct column names
const groundTruth = {};
let totals = {
  optical: 0,
  store: 0,
  newCustomers: 0,
  collections: 0,
  insurance: 0,
  warranty: 0,
  total: 0
};

// Track certification breakdown
let certifiedCount = 0;
let nonCertifiedCount = 0;

for (const row of data) {
  const empId = String(row['Employee'] || '').trim();
  if (!empId || empId === 'undefined') continue;

  const emp = {
    employeeId: empId,
    store: String(row['Store'] || ''),
    role: String(row['Role'] || ''),
    certified: Boolean(row['Certified']),
    // Component values - use C*_Expected which is the ground truth
    optical: Number(row['C1_Expected'] || 0),
    store: Number(row['C2_Expected'] || 0),
    newCustomers: Number(row['C3_Expected'] || 0),
    collections: Number(row['C4_Expected'] || 0),
    insurance: Number(row['C5_Expected'] || 0),
    warranty: Number(row['C6_Expected'] || 0),
    // Additional context for debugging
    c1_att: Number(row['C1_Att_Exact'] || 0),
    c2_att: Number(row['C2_Att'] || 0),
    c3_att: Number(row['C3_Att'] || 0),
    c4_att: Number(row['C4_Att'] || 0),
    c5_monto: Number(row['C5_Monto'] || 0),
    c6_monto: Number(row['C6_Monto'] || 0)
  };
  emp.total = emp.optical + emp.store + emp.newCustomers + emp.collections + emp.insurance + emp.warranty;

  groundTruth[empId] = emp;

  totals.optical += emp.optical;
  totals.store += emp.store;
  totals.newCustomers += emp.newCustomers;
  totals.collections += emp.collections;
  totals.insurance += emp.insurance;
  totals.warranty += emp.warranty;
  totals.total += emp.total;

  if (emp.certified) certifiedCount++;
  else nonCertifiedCount++;
}

console.log(`\nProcessed ${Object.keys(groundTruth).length} employees`);
console.log(`  Certified: ${certifiedCount}`);
console.log(`  Non-certified: ${nonCertifiedCount}`);

console.log('\n=== GROUND TRUTH COMPONENT TOTALS ===');
console.log(`  C1 Optical (Venta Individual):  $${totals.optical.toLocaleString()}`);
console.log(`  C2 Store (Venta Tienda):        $${totals.store.toLocaleString()}`);
console.log(`  C3 New Customers:               $${totals.newCustomers.toLocaleString()}`);
console.log(`  C4 Collections (Cobranza):      $${totals.collections.toLocaleString()}`);
console.log(`  C5 Insurance (Club Proteccion): $${totals.insurance.toLocaleString()}`);
console.log(`  C6 Warranty (Garantia):         $${totals.warranty.toLocaleString()}`);
console.log(`  ----------------------------------------`);
console.log(`  GRAND TOTAL:                    $${totals.total.toLocaleString()}`);

// Count employees with warranty > 0
const withWarranty = Object.values(groundTruth).filter(e => e.warranty > 0);
console.log(`\nEmployees with warranty payout: ${withWarranty.length}`);
if (withWarranty.length > 0 && withWarranty.length <= 10) {
  console.log('Warranty payouts:');
  withWarranty.forEach(e => {
    console.log(`  ${e.employeeId}: $${e.warranty} (monto: $${e.c6_monto})`);
  });
}

// Save ground truth - simplified version for reconciliation
const simplified = {};
for (const [empId, emp] of Object.entries(groundTruth)) {
  simplified[empId] = {
    optical: emp.optical,
    store: emp.store,
    newCustomers: emp.newCustomers,
    collections: emp.collections,
    insurance: emp.insurance,
    warranty: emp.warranty,
    total: emp.total,
    certified: emp.certified
  };
}

const outputPath = path.join(__dirname, 'ground-truth-data.json');
fs.writeFileSync(outputPath, JSON.stringify(simplified, null, 2));
console.log(`\nGround truth saved to: ${outputPath}`);

// Save component totals separately
const totalsPath = path.join(__dirname, 'ground-truth-totals.json');
fs.writeFileSync(totalsPath, JSON.stringify({
  employeeCount: Object.keys(groundTruth).length,
  certifiedCount,
  nonCertifiedCount,
  componentTotals: totals,
  warrantyEmployeeCount: withWarranty.length
}, null, 2));
console.log(`Totals saved to: ${totalsPath}`);
