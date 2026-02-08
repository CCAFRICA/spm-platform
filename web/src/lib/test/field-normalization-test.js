// Field Normalization Test Script

const FIELD_ID_MAPPINGS = {
  'employee_id': 'employeeId',
  'num_empleado': 'employeeId',
  'numero_empleado': 'employeeId',
  'employeeid': 'employeeId',
  'store_id': 'storeId',
  'no_tienda': 'storeId',
  'numero_tienda': 'storeId',
  'storeid': 'storeId',
  'date': 'date',
  'fecha': 'date',
  'fecha_corte': 'date',
  'period': 'period',
  'periodo': 'period',
  'mes': 'period',
  'month': 'period',
  'ano': 'period',
  'year': 'period',
  'amount': 'amount',
  'monto': 'amount',
  'total': 'amount',
  'value': 'amount',
  'venta': 'amount',
  'revenue': 'amount',
  'attainment': 'attainment',
  'cumplimiento': 'attainment',
  'porcentaje': 'attainment',
  'percentage': 'attainment',
  'pct_cumplimiento': 'attainment',
  'goal': 'goal',
  'meta': 'goal',
  'target': 'goal',
  'quota': 'goal',
  'cuota': 'goal',
  'quantity': 'quantity',
  'cantidad': 'quantity',
  'count': 'quantity',
  'units': 'quantity',
};

const targetFields = [
  { id: 'employeeId', label: 'Employee ID' },
  { id: 'storeId', label: 'Store ID' },
  { id: 'date', label: 'Date' },
  { id: 'period', label: 'Period' },
  { id: 'amount', label: 'Amount' },
  { id: 'attainment', label: 'Attainment %' },
  { id: 'goal', label: 'Goal' },
  { id: 'quantity', label: 'Quantity' },
];

function normalizeAISuggestionToFieldId(suggestion, targetFields) {
  if (!suggestion) return null;

  const normalized = suggestion.toLowerCase().replace(/[\s_-]+/g, '_').trim();

  // First try direct mapping
  const directMatch = FIELD_ID_MAPPINGS[normalized];
  if (directMatch && targetFields.some(f => f.id === directMatch)) {
    return directMatch;
  }

  // Try matching against targetFields directly
  for (const field of targetFields) {
    const fieldNorm = field.id.toLowerCase();
    const labelNorm = field.label.toLowerCase().replace(/[\s_-]+/g, '_');

    if (normalized === fieldNorm || normalized === labelNorm) {
      return field.id;
    }

    // Partial match
    if (normalized.includes(fieldNorm) || fieldNorm.includes(normalized)) {
      return field.id;
    }
  }

  return null;
}

// Test cases based on what AI might return
const testCases = [
  'Employee ID',
  'employee_id',
  'Num_Empleado',
  'num_empleado',
  'Store ID',
  'No_Tienda',
  'Date',
  'Fecha',
  'Period',
  'Mes',
  'Amount',
  'Monto',
  'Attainment',
  'Cumplimiento',
  'Pct_Cumplimiento',
  'Goal',
  'Meta',
  'Optical Sales',
  'random_column'
];

console.log('=== FIELD NORMALIZATION TEST ===');
testCases.forEach(tc => {
  const result = normalizeAISuggestionToFieldId(tc, targetFields);
  console.log(tc + ' -> ' + (result || 'null'));
});

// Count success rate
const mapped = testCases.filter(tc => normalizeAISuggestionToFieldId(tc, targetFields) !== null);
console.log('\nMapped: ' + mapped.length + '/' + testCases.length);
