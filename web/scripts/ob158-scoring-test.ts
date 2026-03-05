import { generateContentProfile } from '@/lib/sci/content-profile';
import { scoreContentUnit } from '@/lib/sci/agents';

const names = ['Juan García López', 'María Rodríguez Pérez', 'Carlos Hernández Torres',
  'Ana López García', 'Pedro Martínez Sánchez', 'Laura González Díaz',
  'Roberto Sánchez Villa', 'Isabel Fernández Cruz', 'Miguel Torres Ríos',
  'Carmen Ruiz Blanco'];

// S1: Performance Data WITH dates
const perfColumns = ['No_Empleado', 'Nombre_Completo', 'Ventas', 'Comisiones', 'Periodo', 'Cumplimiento'];
const perfRows: Record<string, unknown>[] = [];
for (let i = 0; i < 300; i++) {
  const empIdx = i % 10;
  const month = (i % 12) + 1;
  perfRows.push({
    No_Empleado: `EMP${String(empIdx + 1).padStart(3, '0')}`,
    Nombre_Completo: names[empIdx],
    Ventas: (Math.random() * 50000 + 10000).toFixed(2),
    Comisiones: (Math.random() * 5000 + 1000).toFixed(2),
    Periodo: `2025-${String(month).padStart(2, '0')}-01`,
    Cumplimiento: `${Math.floor(Math.random() * 40 + 60)}%`,
  });
}
const p1 = generateContentProfile('Datos_Rendimiento', 0, 'MLG_Data.xlsx', perfColumns, perfRows);
const s1 = scoreContentUnit(p1);
console.log('=== S1: Perf Data WITH dates ===');
console.log('numR:', p1.patterns.numericFieldRatio.toFixed(2), 'idRep:', p1.patterns.identifierRepeatRatio.toFixed(1), 'structName:', p1.patterns.hasStructuralNameColumn, 'date:', p1.patterns.hasDateColumn, 'rows:', p1.patterns.rowCountCategory);
console.log('Winner:', s1[0].agent, (s1[0].confidence*100).toFixed(0)+'%', '| Runner:', s1[1].agent, (s1[1].confidence*100).toFixed(0)+'%');

// S2: Team Roster
const rosterColumns = ['No_Empleado', 'Nombre_Completo', 'Puesto', 'Departamento', 'Region', 'Licencia'];
const rosterRows: Record<string, unknown>[] = [];
const roles2 = ['Vendedor', 'Gerente', 'Coordinador', 'Supervisor', 'Analista'];
const depts2 = ['Ventas Norte', 'Ventas Sur', 'Ventas Centro', 'Logística', 'Soporte'];
const regions2 = ['CDMX', 'Monterrey', 'Guadalajara', 'Puebla'];
for (let i = 0; i < 25; i++) {
  rosterRows.push({
    No_Empleado: `EMP${String(i + 1).padStart(3, '0')}`,
    Nombre_Completo: names[i % 10] + (i >= 10 ? ` ${i}` : ''),
    Puesto: roles2[i % roles2.length],
    Departamento: depts2[i % depts2.length],
    Region: regions2[i % regions2.length],
    Licencia: i % 3 === 0 ? 'Premium' : 'Standard',
  });
}
const p2 = generateContentProfile('Equipo', 1, 'MLG_Data.xlsx', rosterColumns, rosterRows);
const s2 = scoreContentUnit(p2);
console.log('\n=== S2: Team Roster ===');
console.log('numR:', p2.patterns.numericFieldRatio.toFixed(2), 'idRep:', p2.patterns.identifierRepeatRatio.toFixed(1), 'structName:', p2.patterns.hasStructuralNameColumn, 'date:', p2.patterns.hasDateColumn, 'rows:', p2.patterns.rowCountCategory);
console.log('Winner:', s2[0].agent, (s2[0].confidence*100).toFixed(0)+'%', '| Runner:', s2[1].agent, (s2[1].confidence*100).toFixed(0)+'%');

// S3: Performance data WITHOUT dates (was misclassified before OB-158)
const noDateColumns = ['No_Empleado', 'Representante', 'Monto_Ventas', 'Unidades', 'Comision_Pct', 'Total_Pago'];
const noDateRows: Record<string, unknown>[] = [];
for (let i = 0; i < 200; i++) {
  const empIdx = i % 10;
  noDateRows.push({
    No_Empleado: `EMP${String(empIdx + 1).padStart(3, '0')}`,
    Representante: names[empIdx],
    Monto_Ventas: (Math.random() * 50000 + 10000).toFixed(2),
    Unidades: Math.floor(Math.random() * 100 + 10),
    Comision_Pct: `${Math.floor(Math.random() * 10 + 5)}%`,
    Total_Pago: (Math.random() * 5000 + 1000).toFixed(2),
  });
}
const p3 = generateContentProfile('Datos_Rendimiento', 0, 'MLG_Perf.xlsx', noDateColumns, noDateRows);
const s3 = scoreContentUnit(p3);
console.log('\n=== S3: Perf Data WITHOUT dates (critical) ===');
console.log('numR:', p3.patterns.numericFieldRatio.toFixed(2), 'idRep:', p3.patterns.identifierRepeatRatio.toFixed(1), 'structName:', p3.patterns.hasStructuralNameColumn, 'date:', p3.patterns.hasDateColumn, 'rows:', p3.patterns.rowCountCategory);
for (const s of s3) console.log(`  ${s.agent}: ${(s.confidence*100).toFixed(0)}%`);
console.log('Winner:', s3[0].agent, (s3[0].confidence*100).toFixed(0)+'%');
for (const s of s3.slice(0, 2)) {
  console.log(`  ${s.agent}:`, s.signals.map(sig => `${sig.signal}(${sig.weight > 0 ? '+' : ''}${sig.weight})`).join(', '));
}

// Name detection
console.log('\n=== Name Detection ===');
console.log('S1 Nombre_Completo:', p1.fields.find(f => f.fieldName === 'Nombre_Completo')?.nameSignals);
console.log('S3 Representante:', p3.fields.find(f => f.fieldName === 'Representante')?.nameSignals);
