// HF-104 test: Call /api/import/sci/analyze with Meridian-like data
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf104-test-classify.ts

const TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'; // Meridian Logistics Group

// Meridian file structure (simplified — enough columns/rows for classification)
const payload = {
  tenantId: TENANT_ID,
  files: [{
    fileName: 'Meridian_Test.xlsx',
    sheets: [
      {
        sheetName: 'Plantilla',
        columns: ['No_Empleado', 'Nombre', 'Puesto', 'Region', 'Hub', 'Fecha_Ingreso', 'Status'],
        rows: [
          { No_Empleado: '1001', Nombre: 'Carlos Martinez', Puesto: 'Conductor', Region: 'Norte', Hub: 'MTY-01', Fecha_Ingreso: '2023-01-15', Status: 'Activo' },
          { No_Empleado: '1002', Nombre: 'Ana Lopez', Puesto: 'Operadora', Region: 'Centro', Hub: 'CDMX-02', Fecha_Ingreso: '2023-03-01', Status: 'Activo' },
          { No_Empleado: '1003', Nombre: 'Pedro Ramirez', Puesto: 'Conductor', Region: 'Norte', Hub: 'MTY-01', Fecha_Ingreso: '2022-06-10', Status: 'Activo' },
          { No_Empleado: '1004', Nombre: 'Maria Garcia', Puesto: 'Supervisor', Region: 'Sur', Hub: 'GDL-03', Fecha_Ingreso: '2021-11-20', Status: 'Activo' },
          { No_Empleado: '1005', Nombre: 'Luis Hernandez', Puesto: 'Conductor', Region: 'Centro', Hub: 'CDMX-02', Fecha_Ingreso: '2024-01-05', Status: 'Activo' },
        ],
        totalRowCount: 150,
      },
      {
        sheetName: 'Datos_Rendimiento',
        columns: ['No_Empleado', 'Nombre', 'Hub', 'Mes', 'Ano', 'Entregas_Completadas', 'Entregas_Fallidas', 'Km_Recorridos', 'Consumo_Combustible', 'Calificacion_Cliente', 'Puntualidad', 'Incidentes', 'Horas_Extra', 'Bonificacion_Base', 'Penalizaciones', 'Ingreso_Bruto', 'Deducciones', 'Ingreso_Neto', 'Tasa_Utilizacion', 'Costo_Por_Entrega'],
        rows: [
          { No_Empleado: '1001', Nombre: 'Carlos Martinez', Hub: 'MTY-01', Mes: 1, Ano: 2025, Entregas_Completadas: 245, Entregas_Fallidas: 12, Km_Recorridos: 3200, Consumo_Combustible: 450, Calificacion_Cliente: 4.5, Puntualidad: 0.92, Incidentes: 1, Horas_Extra: 15, Bonificacion_Base: 5000, Penalizaciones: 200, Ingreso_Bruto: 28000, Deducciones: 3500, Ingreso_Neto: 24500, Tasa_Utilizacion: 0.87, Costo_Por_Entrega: 95 },
          { No_Empleado: '1001', Nombre: 'Carlos Martinez', Hub: 'MTY-01', Mes: 2, Ano: 2025, Entregas_Completadas: 260, Entregas_Fallidas: 8, Km_Recorridos: 3400, Consumo_Combustible: 470, Calificacion_Cliente: 4.7, Puntualidad: 0.95, Incidentes: 0, Horas_Extra: 10, Bonificacion_Base: 5500, Penalizaciones: 0, Ingreso_Bruto: 29500, Deducciones: 3600, Ingreso_Neto: 25900, Tasa_Utilizacion: 0.91, Costo_Por_Entrega: 88 },
          { No_Empleado: '1002', Nombre: 'Ana Lopez', Hub: 'CDMX-02', Mes: 1, Ano: 2025, Entregas_Completadas: 180, Entregas_Fallidas: 5, Km_Recorridos: 2100, Consumo_Combustible: 310, Calificacion_Cliente: 4.8, Puntualidad: 0.97, Incidentes: 0, Horas_Extra: 8, Bonificacion_Base: 4800, Penalizaciones: 0, Ingreso_Bruto: 26000, Deducciones: 3200, Ingreso_Neto: 22800, Tasa_Utilizacion: 0.83, Costo_Por_Entrega: 102 },
          { No_Empleado: '1002', Nombre: 'Ana Lopez', Hub: 'CDMX-02', Mes: 2, Ano: 2025, Entregas_Completadas: 195, Entregas_Fallidas: 3, Km_Recorridos: 2300, Consumo_Combustible: 330, Calificacion_Cliente: 4.9, Puntualidad: 0.98, Incidentes: 0, Horas_Extra: 5, Bonificacion_Base: 5200, Penalizaciones: 0, Ingreso_Bruto: 27000, Deducciones: 3300, Ingreso_Neto: 23700, Tasa_Utilizacion: 0.86, Costo_Por_Entrega: 96 },
          { No_Empleado: '1003', Nombre: 'Pedro Ramirez', Hub: 'MTY-01', Mes: 1, Ano: 2025, Entregas_Completadas: 220, Entregas_Fallidas: 15, Km_Recorridos: 2900, Consumo_Combustible: 420, Calificacion_Cliente: 4.2, Puntualidad: 0.88, Incidentes: 2, Horas_Extra: 20, Bonificacion_Base: 4500, Penalizaciones: 500, Ingreso_Bruto: 27000, Deducciones: 3800, Ingreso_Neto: 23200, Tasa_Utilizacion: 0.82, Costo_Por_Entrega: 105 },
        ],
        totalRowCount: 1800,
      },
      {
        sheetName: 'Datos_Flota_Hub',
        columns: ['Region', 'Hub', 'Mes', 'Ano', 'Capacidad_Total', 'Cargas_Totales', 'Tasa_Utilizacion'],
        rows: [
          { Region: 'Norte', Hub: 'MTY-01', Mes: 1, Ano: 2025, Capacidad_Total: 5000, Cargas_Totales: 4200, Tasa_Utilizacion: 0.84 },
          { Region: 'Norte', Hub: 'MTY-01', Mes: 2, Ano: 2025, Capacidad_Total: 5000, Cargas_Totales: 4500, Tasa_Utilizacion: 0.90 },
          { Region: 'Centro', Hub: 'CDMX-02', Mes: 1, Ano: 2025, Capacidad_Total: 8000, Cargas_Totales: 6800, Tasa_Utilizacion: 0.85 },
          { Region: 'Centro', Hub: 'CDMX-02', Mes: 2, Ano: 2025, Capacidad_Total: 8000, Cargas_Totales: 7200, Tasa_Utilizacion: 0.90 },
          { Region: 'Sur', Hub: 'GDL-03', Mes: 1, Ano: 2025, Capacidad_Total: 3000, Cargas_Totales: 2400, Tasa_Utilizacion: 0.80 },
        ],
        totalRowCount: 36,
      },
    ],
  }],
};

async function main() {
  console.log('Calling POST /api/import/sci/analyze...');
  const res = await fetch('http://localhost:3000/api/import/sci/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`FAILED: ${res.status} ${err}`);
    process.exit(1);
  }

  const proposal = await res.json();
  console.log('\n=== CLASSIFICATION RESULTS ===');
  for (const unit of proposal.contentUnits) {
    console.log(`Sheet: ${unit.tabName} => ${unit.classification} @ ${(unit.confidence * 100).toFixed(0)}%`);
    if (unit.allScores) {
      const sorted = [...unit.allScores].sort((a: any, b: any) => b.confidence - a.confidence);
      for (const s of sorted) {
        console.log(`  ${s.agent}: ${(s.confidence * 100).toFixed(1)}%`);
      }
    }
  }
  console.log('\n=== CHECK DEV SERVER LOGS FOR [SCI-CRR-DIAG] and [SCI-HC-DIAG] ===');
}

main().catch(err => { console.error(err); process.exit(1); });
