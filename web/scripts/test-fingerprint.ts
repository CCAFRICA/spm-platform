/**
 * OB-174 Phase 2: Test structural fingerprint computation
 * Verifies: same-structure files produce same hash, different structures produce different hashes
 */

import { computeFingerprintHashSync, computeFingerprintComposite } from '../src/lib/sci/structural-fingerprint';

// BCL Datos structure — same columns, different data values
const datosColumns = [
  'ID_Empleado', 'Nombre_Completo', 'Sucursal', 'Periodo',
  'Monto_Colocacion', 'Meta_Colocacion', 'Cumplimiento_Colocacion',
  'Depositos_Captados', 'Meta_Depositos', 'Pct_Meta_Depositos',
  'Cantidad_Productos_Cruzados', 'Indice_Calidad_Cartera',
  'Infracciones_Regulatorias',
];

// January data (sample)
const janRows = [
  { ID_Empleado: 'BCL-5001', Nombre_Completo: 'Adriana Reyes', Sucursal: 'HQ', Periodo: '2026-01-01', Monto_Colocacion: 140387.13, Meta_Colocacion: 150000, Cumplimiento_Colocacion: 0.936, Depositos_Captados: 34635, Meta_Depositos: 45000, Pct_Meta_Depositos: 0.7697, Cantidad_Productos_Cruzados: 4, Indice_Calidad_Cartera: 0.962, Infracciones_Regulatorias: 0 },
  { ID_Empleado: 'BCL-5002', Nombre_Completo: 'Fernando Hidalgo', Sucursal: 'Regional', Periodo: '2026-01-01', Monto_Colocacion: 91533.58, Meta_Colocacion: 150000, Cumplimiento_Colocacion: 0.610, Depositos_Captados: 28900, Meta_Depositos: 45000, Pct_Meta_Depositos: 0.642, Cantidad_Productos_Cruzados: 2, Indice_Calidad_Cartera: 0.945, Infracciones_Regulatorias: 1 },
];

// February data (same columns, different values)
const febRows = [
  { ID_Empleado: 'BCL-5001', Nombre_Completo: 'Adriana Reyes', Sucursal: 'HQ', Periodo: '2026-02-01', Monto_Colocacion: 155000.50, Meta_Colocacion: 150000, Cumplimiento_Colocacion: 1.033, Depositos_Captados: 42000, Meta_Depositos: 45000, Pct_Meta_Depositos: 0.933, Cantidad_Productos_Cruzados: 5, Indice_Calidad_Cartera: 0.971, Infracciones_Regulatorias: 0 },
  { ID_Empleado: 'BCL-5002', Nombre_Completo: 'Fernando Hidalgo', Sucursal: 'Regional', Periodo: '2026-02-01', Monto_Colocacion: 120000.00, Meta_Colocacion: 150000, Cumplimiento_Colocacion: 0.800, Depositos_Captados: 35000, Meta_Depositos: 45000, Pct_Meta_Depositos: 0.778, Cantidad_Productos_Cruzados: 3, Indice_Calidad_Cartera: 0.955, Infracciones_Regulatorias: 0 },
];

// BCL Personal structure — different columns
const personalColumns = [
  'ID_Empleado', 'Nombre_Completo', 'Cargo', 'Region',
  'ID_Gerente', 'Sucursal_ID', 'Nivel_Cargo', 'Fecha_Ingreso',
];

const personalRows = [
  { ID_Empleado: 'BCL-5001', Nombre_Completo: 'Adriana Reyes', Cargo: 'Oficial de Crédito', Region: 'Costa', ID_Gerente: 'BCL-5010', Sucursal_ID: 'BCL-GYE-001', Nivel_Cargo: 'Senior', Fecha_Ingreso: '2019-03-15' },
  { ID_Empleado: 'BCL-5002', Nombre_Completo: 'Fernando Hidalgo', Cargo: 'Oficial de Crédito', Region: 'Sierra', ID_Gerente: 'BCL-5010', Sucursal_ID: 'BCL-UIO-001', Nivel_Cargo: 'Junior', Fecha_Ingreso: '2021-07-01' },
];

console.log('=== OB-174 Phase 2: Structural Fingerprint Test ===\n');

// Test 1: Same structure, different data → same fingerprint
const t1Start = performance.now();
const janHash = computeFingerprintHashSync(datosColumns, janRows);
const t1End = performance.now();

const t2Start = performance.now();
const febHash = computeFingerprintHashSync(datosColumns, febRows);
const t2End = performance.now();

console.log('Test 1: Same structure (BCL datos Jan vs Feb)');
console.log(`  Jan hash: ${janHash}`);
console.log(`  Feb hash: ${febHash}`);
console.log(`  Match: ${janHash === febHash ? 'YES ✓' : 'NO ✗'}`);
console.log(`  Jan time: ${(t1End - t1Start).toFixed(2)}ms`);
console.log(`  Feb time: ${(t2End - t2Start).toFixed(2)}ms`);

// Test 2: Different structure → different fingerprint
const t3Start = performance.now();
const personalHash = computeFingerprintHashSync(personalColumns, personalRows);
const t3End = performance.now();

console.log('\nTest 2: Different structure (BCL datos vs personal)');
console.log(`  Datos hash:    ${janHash}`);
console.log(`  Personal hash: ${personalHash}`);
console.log(`  Different: ${janHash !== personalHash ? 'YES ✓' : 'NO ✗'}`);
console.log(`  Personal time: ${(t3End - t3Start).toFixed(2)}ms`);

// Test 3: Show composite for debugging
console.log('\nTest 3: Composite strings (pre-hash)');
console.log(`  Datos:    ${computeFingerprintComposite(datosColumns, janRows)}`);
console.log(`  Personal: ${computeFingerprintComposite(personalColumns, personalRows)}`);

// Test 4: Performance with 1000 rows (sample-based, should still be <10ms)
const largeRows = [];
for (let i = 0; i < 1000; i++) {
  largeRows.push({ ...janRows[i % 2], ID_Empleado: `BCL-${5000 + i}` });
}
const t4Start = performance.now();
const largeHash = computeFingerprintHashSync(datosColumns, largeRows);
const t4End = performance.now();

console.log('\nTest 4: Performance with 1000 rows');
console.log(`  Hash: ${largeHash}`);
console.log(`  Same as 2-row: ${largeHash === janHash ? 'YES ✓ (sample-based)' : 'NO ✗'}`);
console.log(`  Time: ${(t4End - t4Start).toFixed(2)}ms`);

// Test 5: Performance with 10000 rows
const hugeRows = [];
for (let i = 0; i < 10000; i++) {
  hugeRows.push({ ...janRows[i % 2], ID_Empleado: `BCL-${5000 + i}` });
}
const t5Start = performance.now();
const hugeHash = computeFingerprintHashSync(datosColumns, hugeRows);
const t5End = performance.now();

console.log('\nTest 5: Performance with 10000 rows');
console.log(`  Hash: ${hugeHash}`);
console.log(`  Time: ${(t5End - t5Start).toFixed(2)}ms`);
console.log(`  Still <10ms: ${(t5End - t5Start) < 10 ? 'YES ✓' : 'NO ✗'}`);

console.log('\n=== ALL TESTS COMPLETE ===');
