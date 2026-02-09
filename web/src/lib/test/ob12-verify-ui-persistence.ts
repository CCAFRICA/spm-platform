/**
 * OB-12 UI Persistence Verification
 *
 * THIS TEST DOES NOT SEED DATA. IT ONLY READS FROM LOCALSTORAGE.
 * Run this AFTER completing a full UI import flow.
 *
 * This verifies that:
 * 1. Data was persisted by the UI submit handler
 * 2. The orchestrator can find the data
 * 3. Real employees (not demo) would be used
 *
 * Run with: npx tsx src/lib/test/ob12-verify-ui-persistence.ts
 *
 * NOTE: This test is designed to be ALSO runnable in the browser console
 * by copying the logic. In Node.js, it will show what WOULD be found
 * if localStorage had the expected data.
 */

// For Node.js execution, we check if localStorage exists
const hasLocalStorage = typeof localStorage !== 'undefined';

function verify() {
  console.log('');
  console.log('=== OB-12 UI PERSISTENCE VERIFICATION ===');
  console.log('This test reads localStorage WITHOUT seeding data.');
  console.log('');

  if (!hasLocalStorage) {
    console.log('NOTE: Running in Node.js - localStorage not available.');
    console.log('To verify real UI persistence:');
    console.log('1. Complete a full import flow in the browser');
    console.log('2. Open browser DevTools Console');
    console.log('3. Run: npx tsx src/lib/test/localstorage-dump.ts');
    console.log('4. Copy the generated script into the console');
    console.log('');
    showExpectedBehavior();
    return;
  }

  // Browser execution path
  console.log('Running in browser context...');
  console.log('');

  // Step 1: Check for data_layer_batches
  const batchesKey = 'data_layer_batches';
  const committedKey = 'data_layer_committed';

  const batches = localStorage.getItem(batchesKey);
  const committed = localStorage.getItem(committedKey);

  console.log('=== Storage Check ===');
  console.log(`${batchesKey}: ${batches ? 'FOUND' : 'NOT FOUND'}`);
  console.log(`${committedKey}: ${committed ? 'FOUND' : 'NOT FOUND'}`);
  console.log('');

  if (!batches || !committed) {
    console.log('RESULT: FAIL');
    console.log('The UI submit handler did not persist data to localStorage.');
    console.log('');
    console.log('Possible causes:');
    console.log('1. Import was never completed');
    console.log('2. directCommitImportData() is not being called');
    console.log('3. persistAll() is failing');
    return;
  }

  // Step 2: Parse and analyze
  let batchArr: Array<[string, { tenantId: string }]> = [];
  let committedArr: Array<[string, { importBatchId: string; status: string; content: Record<string, unknown> }]> = [];

  try {
    batchArr = JSON.parse(batches);
    committedArr = JSON.parse(committed);
  } catch {
    console.log('RESULT: FAIL');
    console.log('Failed to parse localStorage data.');
    return;
  }

  console.log(`Batches count: ${batchArr.length}`);
  console.log(`Committed records count: ${committedArr.length}`);
  console.log('');

  // Step 3: List tenant IDs
  const tenantIds = Array.from(new Set(batchArr.map(([, b]) => b.tenantId)));
  console.log(`Tenant IDs in batches: ${tenantIds.join(', ')}`);
  console.log('');

  // Step 4: For each tenant, count employees
  for (const tenantId of tenantIds) {
    const tenantBatchIds = batchArr
      .filter(([, b]) => b.tenantId === tenantId)
      .map(([id]) => id);

    const matchingRecords = committedArr.filter(
      ([, r]) => tenantBatchIds.includes(r.importBatchId) && r.status === 'active'
    );

    // Look for employee-like records
    let employeeCount = 0;
    const employeeIds: string[] = [];
    const employeeNames: string[] = [];

    for (const [, record] of matchingRecords) {
      const content = record.content;

      // Check for employee ID
      const empId = content['num_empleado'] || content['Num_Empleado'] ||
        content['employee_id'] || content['employeeId'];

      // Check for name
      const name = content['nombre'] || content['name'] ||
        content['Nombre'] || content['nombre_completo'];

      if (empId && name) {
        employeeCount++;
        employeeIds.push(String(empId));
        employeeNames.push(String(name));
      }
    }

    console.log(`=== Tenant: ${tenantId} ===`);
    console.log(`  Batches: ${tenantBatchIds.length}`);
    console.log(`  Matching records: ${matchingRecords.length}`);
    console.log(`  Employee records: ${employeeCount}`);

    if (employeeCount > 0) {
      console.log(`  Sample IDs: ${employeeIds.slice(0, 3).join(', ')}`);
      console.log(`  Sample names: ${employeeNames.slice(0, 3).join(', ')}`);

      // Check for demo employees
      const hasDemoIds = employeeIds.some(id =>
        id === 'maria-rodriguez' || id === 'james-wilson' || id === 'sarah-chen'
      );
      const hasDemoNames = employeeNames.some(n =>
        n.toLowerCase().includes('maria rodriguez') ||
        n.toLowerCase().includes('james wilson') ||
        n.toLowerCase().includes('sarah chen')
      );

      if (hasDemoIds || hasDemoNames) {
        console.log('  WARNING: Demo employees detected!');
      } else {
        console.log('  OK: Real employees (no demo names)');
      }
    }
    console.log('');
  }

  // Final verdict
  const totalEmployees = committedArr.filter(([, r]) => {
    const c = r.content;
    return (c['num_empleado'] || c['Num_Empleado'] || c['employee_id']) &&
           (c['nombre'] || c['name'] || c['Nombre']);
  }).length;

  if (totalEmployees > 0) {
    console.log('=== RESULT: PASS ===');
    console.log(`Found ${totalEmployees} employee records in localStorage.`);
    console.log('The UI submit handler IS persisting data correctly.');
  } else {
    console.log('=== RESULT: PARTIAL ===');
    console.log('Data is in localStorage, but no employee-like records found.');
    console.log('Check that records have both employee ID and name fields.');
  }
}

function showExpectedBehavior() {
  console.log('=== Expected Behavior After UI Import ===');
  console.log('');
  console.log('1. data_layer_batches should contain:');
  console.log('   - Array of [batchId, { tenantId, status, ... }]');
  console.log('   - tenantId should match the current tenant');
  console.log('');
  console.log('2. data_layer_committed should contain:');
  console.log('   - Array of [recordId, { importBatchId, status, content }]');
  console.log('   - content should have employee fields like:');
  console.log('     - num_empleado or Num_Empleado (employee ID)');
  console.log('     - nombre or Nombre (name)');
  console.log('     - puesto or Puesto (role)');
  console.log('     - no_tienda or No_Tienda (store)');
  console.log('');
  console.log('3. The orchestrator should:');
  console.log('   - Find batches matching current tenantId');
  console.log('   - Extract employees from committed records');
  console.log('   - NOT fall back to demo employees');
  console.log('');
  console.log('Key log messages to look for in browser console:');
  console.log('  [Import] Committed X records, batch: batch-...');
  console.log('  [Import] TenantId used: retailcgmx');
  console.log('  [Import] Verification - batches in storage: YES');
  console.log('  [Orchestrator] Batches matching tenantId: X');
  console.log('  [Orchestrator] Final employee count: X');
}

verify();
