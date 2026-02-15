/**
 * OB-12 PROOF GATE
 *
 * CRITICAL: THIS SCRIPT DOES NOT SEED ANY DATA.
 * It ONLY reads from localStorage to verify that the UI pipeline works.
 *
 * Run this AFTER completing a real import flow through enhanced/page.tsx
 *
 * Usage:
 * 1. In browser DevTools console, paste the script from localstorage-dump.ts
 * 2. Or copy the verify() function below and run it
 *
 * This verifies:
 * 1. directCommitImportData() persisted data to localStorage
 * 2. The orchestrator can find the data with matching tenantId
 * 3. Employee records are from import, NOT demo fallback
 */

// ============================================
// BROWSER VERIFICATION SCRIPT
// (Copy this to browser console after import)
// ============================================

const OB12_PROOF_SCRIPT = `
// OB-12 PROOF GATE - Run after completing a real import
(function verifyOB12() {
  console.log('');
  console.log('========================================');
  console.log('   OB-12 PROOF GATE VERIFICATION');
  console.log('   NO DATA SEEDING - READ ONLY');
  console.log('========================================');
  console.log('');

  const results = {
    dataLayerBatches: false,
    dataLayerCommitted: false,
    batchCount: 0,
    recordCount: 0,
    entityCount: 0,
    tenantIds: [],
    sampleEmployees: [],
    hasDemoData: false,
    orchestratorWouldFind: 0,
  };

  // Step 1: Check storage keys exist
  const batches = localStorage.getItem('data_layer_batches');
  const committed = localStorage.getItem('data_layer_committed');

  results.dataLayerBatches = !!batches;
  results.dataLayerCommitted = !!committed;

  console.log('=== STORAGE CHECK ===');
  console.log('data_layer_batches:', batches ? 'FOUND' : 'NOT FOUND');
  console.log('data_layer_committed:', committed ? 'FOUND' : 'NOT FOUND');
  console.log('');

  if (!batches || !committed) {
    console.log('VERDICT: FAIL');
    console.log('Storage keys missing. The UI import flow did not persist data.');
    console.log('');
    console.log('Debug steps:');
    console.log('1. Open enhanced/page.tsx and look for directCommitImportData call');
    console.log('2. Add console.log before persistAll() to verify it runs');
    console.log('3. Check for errors in console during import');
    return results;
  }

  // Step 2: Parse data
  let batchArr, committedArr;
  try {
    batchArr = JSON.parse(batches);
    committedArr = JSON.parse(committed);
  } catch (e) {
    console.log('VERDICT: FAIL');
    console.log('Could not parse localStorage data:', e.message);
    return results;
  }

  results.batchCount = batchArr.length;
  results.recordCount = committedArr.length;

  console.log('=== DATA COUNTS ===');
  console.log('Batches:', results.batchCount);
  console.log('Committed records:', results.recordCount);
  console.log('');

  // Step 3: Extract tenant IDs
  results.tenantIds = [...new Set(batchArr.map(([, b]) => b.tenantId))];
  console.log('=== TENANT IDS ===');
  console.log('Tenants in storage:', results.tenantIds.join(', ') || '(none)');
  console.log('');

  // Step 4: Find employees per tenant
  console.log('=== EMPLOYEE DETECTION ===');

  for (const tenantId of results.tenantIds) {
    const tenantBatchIds = batchArr
      .filter(([, b]) => b.tenantId === tenantId)
      .map(([id]) => id);

    const tenantRecords = committedArr.filter(
      ([, r]) => tenantBatchIds.includes(r.importBatchId) && r.status === 'active'
    );

    // Detect employees (records with ID and name)
    const employees = [];
    for (const [, record] of tenantRecords) {
      const c = record.content;
      const empId = c.num_empleado || c.Num_Empleado || c.entity_id || c.entityId;
      const name = c.nombre || c.Nombre || c.name || c.nombre_completo;

      if (empId && name) {
        employees.push({ id: String(empId), name: String(name) });
      }
    }

    console.log('Tenant:', tenantId);
    console.log('  Batches:', tenantBatchIds.length);
    console.log('  Records:', tenantRecords.length);
    console.log('  Employees detected:', employees.length);

    if (employees.length > 0) {
      results.entityCount += employees.length;
      results.sampleEmployees.push(...employees.slice(0, 3));

      // Check for demo data
      const demoIds = ['maria-rodriguez', 'james-wilson', 'sarah-chen'];
      const hasDemoIds = employees.some(e => demoIds.includes(e.id.toLowerCase()));
      const hasDemoNames = employees.some(e =>
        e.name.toLowerCase().includes('maria rodriguez') ||
        e.name.toLowerCase().includes('james wilson') ||
        e.name.toLowerCase().includes('sarah chen')
      );

      if (hasDemoIds || hasDemoNames) {
        console.log('  WARNING: Demo employees detected!');
        results.hasDemoData = true;
      } else {
        console.log('  OK: Real employees (no demo data)');
      }

      console.log('  Sample IDs:', employees.slice(0, 3).map(e => e.id).join(', '));
      console.log('  Sample names:', employees.slice(0, 3).map(e => e.name).join(', '));
    }
    console.log('');
  }

  // Step 5: Simulate orchestrator lookup
  console.log('=== ORCHESTRATOR SIMULATION ===');
  const currentTenant = results.tenantIds[0] || 'unknown';
  console.log('Simulating orchestrator with tenantId:', currentTenant);

  const orchestratorBatches = batchArr.filter(([, b]) => b.tenantId === currentTenant);
  const orchestratorBatchIds = orchestratorBatches.map(([id]) => id);
  const orchestratorRecords = committedArr.filter(
    ([, r]) => orchestratorBatchIds.includes(r.importBatchId)
  );

  results.orchestratorWouldFind = orchestratorRecords.length;
  console.log('Orchestrator would find:', orchestratorRecords.length, 'records');
  console.log('');

  // Final verdict
  console.log('========================================');
  if (results.entityCount > 0 && !results.hasDemoData) {
    console.log('VERDICT: PASS');
    console.log('The UI import flow IS persisting real employee data.');
    console.log('Employees found:', results.entityCount);
  } else if (results.entityCount > 0 && results.hasDemoData) {
    console.log('VERDICT: PARTIAL');
    console.log('Data exists but contains demo employees.');
    console.log('This might be from a previous demo reset.');
  } else if (results.recordCount > 0) {
    console.log('VERDICT: PARTIAL');
    console.log('Records exist but no employees detected.');
    console.log('Check field mapping (num_empleado, nombre).');
  } else {
    console.log('VERDICT: FAIL');
    console.log('No data in storage.');
  }
  console.log('========================================');

  return results;
})();
`;

// ============================================
// NODE.JS RUNNER
// ============================================

function runNodeVerification() {
  console.log('');
  console.log('=== OB-12 PROOF GATE ===');
  console.log('');
  console.log('This script cannot access browser localStorage from Node.js.');
  console.log('');
  console.log('To verify the UI pipeline:');
  console.log('');
  console.log('1. Open the app in a browser');
  console.log('2. Complete a FULL import flow through /data/import/enhanced');
  console.log('3. Open DevTools Console (F12)');
  console.log('4. Paste the following script:');
  console.log('');
  console.log('------- COPY FROM HERE -------');
  console.log(OB12_PROOF_SCRIPT);
  console.log('------- TO HERE -------');
  console.log('');
  console.log('Expected console output during import:');
  console.log('  [Import] Committed X records, batch: batch-...');
  console.log('  [Import] TenantId used: retailcgmx');
  console.log('  [Import] Verification - batches in storage: YES');
  console.log('');
  console.log('Expected console output during calculation:');
  console.log('  [Orchestrator] Looking for batches, tenantId: retailcgmx');
  console.log('  [Orchestrator] Batches matching tenantId: X');
  console.log('  [Orchestrator] Final employee count: X');
  console.log('');
}

// Check if running in Node.js
if (typeof window === 'undefined') {
  runNodeVerification();
}
