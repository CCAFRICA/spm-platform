// OB-159: Scoring simulation for Meridian's three sheets
// Simulates ContentProfile for each sheet and runs scoring pipeline

import { generateContentProfile } from '../src/lib/sci/content-profile';
import { scoreContentUnit } from '../src/lib/sci/agents';
import { detectSignatures } from '../src/lib/sci/signatures';

// ── Simulate Datos_Rendimiento ──
// 201 rows, 50 employees x ~4 months, columns: No_Empleado, Nombre_Completo, Mes, Año, + 8 numeric metrics
const datosColumns = ['No_Empleado', 'Nombre_Completo', 'Mes', 'Año', 'Ventas_Totales', 'Meta_Ventas', 'Unidades', 'Meta_Unidades', 'Clientes_Nuevos', 'Meta_Clientes', 'Entregas', 'Rendimiento'];
const datosRows: Record<string, unknown>[] = [];
const names = ['Carlos Garcia Lopez', 'Maria Rodriguez Martinez', 'Juan Hernandez Diaz', 'Ana Torres Gonzalez', 'Pedro Sanchez Flores',
  'Laura Ramirez Cruz', 'Miguel Moreno Reyes', 'Sofia Castro Mendoza', 'Diego Gutierrez Vargas', 'Elena Ruiz Ortega'];
for (let emp = 1; emp <= 50; emp++) {
  for (const mes of [1, 2, 3, 4]) {
    datosRows.push({
      No_Empleado: `EMP-${String(emp).padStart(3, '0')}`,
      Nombre_Completo: names[emp % 10],
      Mes: mes,
      Año: 2025,
      Ventas_Totales: Math.round(Math.random() * 500000 + 100000),
      Meta_Ventas: 300000,
      Unidades: Math.round(Math.random() * 200 + 50),
      Meta_Unidades: 150,
      Clientes_Nuevos: Math.round(Math.random() * 20 + 5),
      Meta_Clientes: 10,
      Entregas: Math.round(Math.random() * 100 + 20),
      Rendimiento: Math.round(Math.random() * 30 + 70) / 100,
    });
  }
}
// Take only 50 rows as sample (browser sends sample)
const datosSample = datosRows.slice(0, 50);

const datosProfile = generateContentProfile('Datos_Rendimiento', 0, 'Meridian_Datos_Q1_2025.xlsx', datosColumns, datosSample, 201);
const datosSignatures = detectSignatures(datosProfile);
const datosScores = scoreContentUnit(datosProfile);

console.log('═══════════════════════════════════════════');
console.log('DATOS_RENDIMIENTO (201 rows, 50 employees x 4 months)');
console.log('═══════════════════════════════════════════');
console.log(`Structure: rowCount=${datosProfile.structure.rowCount}, repeatRatio=${datosProfile.structure.identifierRepeatRatio.toFixed(2)}, numericRatio=${(datosProfile.structure.numericFieldRatio * 100).toFixed(0)}%`);
console.log(`Patterns: hasDate=${datosProfile.patterns.hasDateColumn}, periodMarkers=${datosProfile.patterns.hasPeriodMarkers}, volumePattern=${datosProfile.patterns.volumePattern}`);
console.log(`Signatures: ${datosSignatures.map(s => `${s.agent}:${s.signatureName}@${(s.confidence*100).toFixed(0)}%`).join(', ') || 'none'}`);
console.log('Scores:');
datosScores.forEach(s => console.log(`  ${s.agent}: ${(s.confidence * 100).toFixed(0)}%`));
console.log(`WINNER: ${datosScores[0].agent} at ${(datosScores[0].confidence * 100).toFixed(0)}%`);
console.log(`  → ${datosScores[0].agent === 'transaction' ? 'PASS' : 'FAIL'} (expected: transaction >= 75%)`);

// ── Simulate Plantilla ──
// ~50 rows, 1 per employee, columns: No_Empleado, Nombre_Completo, Puesto, Departamento, Fecha_Ingreso, Licencia
const plantillaColumns = ['No_Empleado', 'Nombre_Completo', 'Puesto', 'Departamento', 'Sucursal', 'Turno', 'Estatus'];
const plantillaRows: Record<string, unknown>[] = [];
const puestos = ['Vendedor', 'Supervisor', 'Gerente', 'Coordinador', 'Analista'];
const deptos = ['Ventas', 'Logistica', 'Administracion', 'Operaciones'];
const sucursales = ['Norte', 'Sur', 'Centro', 'Poniente', 'Oriente'];
for (let emp = 1; emp <= 50; emp++) {
  plantillaRows.push({
    No_Empleado: `EMP-${String(emp).padStart(3, '0')}`,
    Nombre_Completo: names[emp % 10],
    Puesto: puestos[emp % 5],
    Departamento: deptos[emp % 4],
    Sucursal: sucursales[emp % 5],
    Turno: emp % 3 === 0 ? 'Nocturno' : emp % 2 === 0 ? 'Vespertino' : 'Matutino',
    Estatus: 'Activo',
  });
}

const plantillaProfile = generateContentProfile('Plantilla', 1, 'Meridian_Datos_Q1_2025.xlsx', plantillaColumns, plantillaRows, 50);
const plantillaSignatures = detectSignatures(plantillaProfile);
const plantillaScores = scoreContentUnit(plantillaProfile);

console.log('\n═══════════════════════════════════════════');
console.log('PLANTILLA (50 rows, 1 per employee)');
console.log('═══════════════════════════════════════════');
console.log(`Structure: rowCount=${plantillaProfile.structure.rowCount}, repeatRatio=${plantillaProfile.structure.identifierRepeatRatio.toFixed(2)}, categoricalRatio=${(plantillaProfile.structure.categoricalFieldRatio * 100).toFixed(0)}%`);
console.log(`Patterns: hasName=${plantillaProfile.patterns.hasStructuralNameColumn}, volumePattern=${plantillaProfile.patterns.volumePattern}`);
console.log(`Signatures: ${plantillaSignatures.map(s => `${s.agent}:${s.signatureName}@${(s.confidence*100).toFixed(0)}%`).join(', ') || 'none'}`);
console.log('Scores:');
plantillaScores.forEach(s => console.log(`  ${s.agent}: ${(s.confidence * 100).toFixed(0)}%`));
console.log(`WINNER: ${plantillaScores[0].agent} at ${(plantillaScores[0].confidence * 100).toFixed(0)}%`);
console.log(`  → ${plantillaScores[0].agent === 'entity' && plantillaScores[0].confidence >= 0.85 ? 'PASS' : 'FAIL'} (expected: entity >= 85%)`);

// ── Simulate Datos_Flota_Hub ──
// ~20 rows, fleet/hub reference data
const flotaColumns = ['Clave_Hub', 'Nombre_Hub', 'Ubicacion', 'Tipo', 'Capacidad_Unidades'];
const flotaRows: Record<string, unknown>[] = [];
const ubicaciones = ['CDMX', 'Monterrey', 'Guadalajara', 'Puebla', 'Queretaro', 'Merida', 'Cancun'];
const tipos = ['Principal', 'Secundario', 'Satélite'];
for (let i = 1; i <= 20; i++) {
  flotaRows.push({
    Clave_Hub: `HUB-${String(i).padStart(2, '0')}`,
    Nombre_Hub: `Hub ${ubicaciones[i % 7]} ${i}`,
    Ubicacion: ubicaciones[i % 7],
    Tipo: tipos[i % 3],
    Capacidad_Unidades: Math.round(Math.random() * 50 + 10),
  });
}

const flotaProfile = generateContentProfile('Datos_Flota_Hub', 2, 'Meridian_Datos_Q1_2025.xlsx', flotaColumns, flotaRows, 20);
const flotaSignatures = detectSignatures(flotaProfile);
const flotaScores = scoreContentUnit(flotaProfile);

console.log('\n═══════════════════════════════════════════');
console.log('DATOS_FLOTA_HUB (20 rows, fleet/hub reference)');
console.log('═══════════════════════════════════════════');
console.log(`Structure: rowCount=${flotaProfile.structure.rowCount}, repeatRatio=${flotaProfile.structure.identifierRepeatRatio.toFixed(2)}, categoricalCount=${flotaProfile.structure.categoricalFieldCount}`);
console.log(`Patterns: hasEntityId=${flotaProfile.patterns.hasEntityIdentifier}, volumePattern=${flotaProfile.patterns.volumePattern}`);
console.log(`Signatures: ${flotaSignatures.map(s => `${s.agent}:${s.signatureName}@${(s.confidence*100).toFixed(0)}%`).join(', ') || 'none'}`);
console.log('Scores:');
flotaScores.forEach(s => console.log(`  ${s.agent}: ${(s.confidence * 100).toFixed(0)}%`));
console.log(`WINNER: ${flotaScores[0].agent} at ${(flotaScores[0].confidence * 100).toFixed(0)}%`);
console.log(`  → ${flotaScores[0].agent === 'reference' && flotaScores[0].confidence >= 0.75 ? 'PASS' : 'NEEDS_REVIEW'} (expected: reference >= 75%)`);

console.log('\n═══════════════════════════════════════════');
console.log('SUMMARY');
console.log('═══════════════════════════════════════════');
const datosOk = datosScores[0].agent === 'transaction' && datosScores[0].confidence >= 0.75;
const plantillaOk = plantillaScores[0].agent === 'entity' && plantillaScores[0].confidence >= 0.85;
const flotaOk = flotaScores[0].agent === 'reference';
console.log(`Datos_Rendimiento → transaction >= 75%: ${datosOk ? 'PASS' : 'FAIL'}`);
console.log(`Plantilla → entity >= 85%: ${plantillaOk ? 'PASS' : 'FAIL'}`);
console.log(`Datos_Flota_Hub → reference: ${flotaOk ? 'PASS' : 'FAIL'}`);
console.log(`\nOVERALL: ${datosOk && plantillaOk && flotaOk ? 'ALL PASS' : 'SOME FAIL'}`);
