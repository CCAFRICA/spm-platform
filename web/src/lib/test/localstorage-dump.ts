/**
 * LocalStorage Dump Script Generator
 *
 * Generates a script that can be pasted in browser DevTools
 * to show exactly what's in localStorage after an import.
 *
 * Run with: npx tsx src/lib/test/localstorage-dump.ts
 */

const script = `
// ==========================================
// LOCALSTORAGE AUDIT SCRIPT
// Paste this in browser DevTools console
// AFTER completing an import flow
// ==========================================

console.log('=== LOCALSTORAGE AUDIT ===');
console.log('Total keys:', localStorage.length);
console.log('');

const keys = [];
for (let i = 0; i < localStorage.length; i++) {
  keys.push(localStorage.key(i));
}
keys.sort();

console.log('All keys:');
keys.forEach(key => console.log('  ' + key));
console.log('');

// Check specific data layer keys
console.log('=== DATA LAYER KEYS ===');
const dataLayerKeys = [
  'data_layer_raw',
  'data_layer_transformed',
  'data_layer_committed',
  'data_layer_batches',
  'data_layer_checkpoints'
];

dataLayerKeys.forEach(key => {
  const val = localStorage.getItem(key);
  if (val) {
    try {
      const parsed = JSON.parse(val);
      console.log(key + ':');
      console.log('  Count: ' + (Array.isArray(parsed) ? parsed.length : 'object'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        const [id, record] = parsed[0];
        console.log('  First ID: ' + id);
        if (record.tenantId) console.log('  First tenantId: ' + record.tenantId);
        if (record.content) {
          const contentKeys = Object.keys(record.content);
          console.log('  Content keys: ' + contentKeys.slice(0, 5).join(', '));
        }
      }
    } catch (e) {
      console.log(key + ': (parse error)');
    }
  } else {
    console.log(key + ': NOT FOUND');
  }
});

console.log('');
console.log('=== EMPLOYEE DATA SEARCH ===');

// Search for employee-related data
keys.forEach(key => {
  const val = localStorage.getItem(key);
  if (val) {
    // Check for employee identifiers
    const hasEmployeeData =
      val.includes('num_empleado') ||
      val.includes('nombre') ||
      val.includes('Datos_Colaborador') ||
      val.includes('96568') ||
      val.includes('maria-rodriguez') ||
      val.includes('james-wilson') ||
      val.includes('sarah-chen');

    if (hasEmployeeData) {
      console.log('FOUND employee data in: ' + key);

      try {
        const parsed = JSON.parse(val);

        if (Array.isArray(parsed)) {
          console.log('  Array length: ' + parsed.length);

          // Look for real employee IDs (numeric) vs demo (names)
          const hasRealIds = val.includes('96568') || val.includes('90125');
          const hasDemoIds = val.includes('maria-rodriguez') || val.includes('james-wilson');

          console.log('  Has real employee IDs: ' + hasRealIds);
          console.log('  Has demo employee IDs: ' + hasDemoIds);

          if (parsed.length > 0) {
            const sample = JSON.stringify(parsed[0]).substring(0, 500);
            console.log('  First record: ' + sample);
          }
        }
      } catch (e) {
        console.log('  (parse error)');
      }
    }
  }
});

console.log('');
console.log('=== TENANT CHECK ===');
const tenants = ['retailcgmx', 'restaurantmx', 'frmx'];
tenants.forEach(tenantId => {
  const batchesVal = localStorage.getItem('data_layer_batches');
  if (batchesVal) {
    try {
      const batches = JSON.parse(batchesVal);
      const tenantBatches = batches.filter(([, b]) => b.tenantId === tenantId);
      console.log('Batches for ' + tenantId + ': ' + tenantBatches.length);
    } catch (e) {}
  }
});

console.log('');
console.log('=== DIAGNOSIS ===');
const committed = localStorage.getItem('data_layer_committed');
const batches = localStorage.getItem('data_layer_batches');

if (!batches) {
  console.log('PROBLEM: No data_layer_batches found');
  console.log('  -> UI submit handler may not be persisting');
} else if (!committed) {
  console.log('PROBLEM: No data_layer_committed found');
  console.log('  -> Data was not committed');
} else {
  try {
    const batchArr = JSON.parse(batches);
    const commitArr = JSON.parse(committed);

    if (batchArr.length === 0) {
      console.log('PROBLEM: data_layer_batches is empty array');
    } else if (commitArr.length === 0) {
      console.log('PROBLEM: data_layer_committed is empty array');
    } else {
      const batchIds = batchArr.map(([id]) => id);
      const hasMatchingCommits = commitArr.some(([, r]) => batchIds.includes(r.importBatchId));

      if (!hasMatchingCommits) {
        console.log('PROBLEM: No committed records match any batch ID');
        console.log('  Batch IDs: ' + batchIds.join(', '));
        const commitBatchIds = [...new Set(commitArr.map(([, r]) => r.importBatchId))];
        console.log('  Commit batch IDs: ' + commitBatchIds.join(', '));
      } else {
        console.log('OK: Data appears to be properly committed');
        console.log('  Batches: ' + batchArr.length);
        console.log('  Committed records: ' + commitArr.length);

        // Check for name fields
        const hasNames = commitArr.some(([, r]) =>
          r.content && (r.content.nombre || r.content.name || r.content.Nombre)
        );
        console.log('  Has name fields: ' + hasNames);
      }
    }
  } catch (e) {
    console.log('PROBLEM: JSON parse error');
  }
}
`;

console.log('=== BROWSER CONSOLE SCRIPT ===');
console.log('');
console.log('After completing a full import flow in the UI,');
console.log('paste the following in browser DevTools console:');
console.log('');
console.log('==========================================');
console.log(script);
console.log('==========================================');
