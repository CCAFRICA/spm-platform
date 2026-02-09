/**
 * Financial Module Constants
 *
 * Storage keys, configuration defaults, and constants for the Financial Module.
 */

// ============================================
// STORAGE KEYS
// ============================================

export const FINANCIAL_STORAGE_KEYS = {
  // Three-layer data architecture
  RAW: 'financial_raw',
  TRANSFORMED: 'financial_transformed',
  COMMITTED: 'financial_committed',

  // Import tracking
  IMPORTS: 'financial_imports',
  IMPORT_HISTORY: 'financial_import_history',

  // Entity storage
  FRANCHISORS: 'financial_franchisors',
  BRANDS: 'financial_brands',
  FRANCHISEES: 'financial_franchisees',
  LOCATIONS: 'financial_locations',
  STAFF: 'financial_staff',

  // Cached computations
  PERIOD_SUMMARIES: 'financial_period_summaries',
  LOCATION_RANKINGS: 'financial_location_rankings',

  // Configuration
  CONFIG: 'financial_config',
} as const;

/**
 * Get tenant-scoped storage key
 */
export function getStorageKey(baseKey: keyof typeof FINANCIAL_STORAGE_KEYS, tenantId: string): string {
  return `${FINANCIAL_STORAGE_KEYS[baseKey]}_${tenantId}`;
}

// ============================================
// DEFAULTS
// ============================================

export const FINANCIAL_DEFAULTS = {
  currency: 'MXN' as const,
  timezone: 'America/Mexico_City',
  posSystem: 'softrestaurant' as const,
  taxRate: 0.16, // IVA 16%
  dateFormat: 'YYYY-MM-DD',
  timeFormat: 'HH:mm:ss',
};

// ============================================
// SHIFT DEFINITIONS
// ============================================

export const SHIFT_DEFINITIONS = {
  1: { name: 'Morning', nameEs: 'Matutino', startHour: 7, endHour: 15 },
  2: { name: 'Afternoon', nameEs: 'Vespertino', startHour: 15, endHour: 23 },
  3: { name: 'Night', nameEs: 'Nocturno', startHour: 23, endHour: 7 },
} as const;

// ============================================
// CHEQUE FILE FORMAT
// ============================================

export const CHEQUE_COLUMNS = [
  'numero_franquicia',
  'turno_id',
  'folio',
  'numero_cheque',
  'fecha',
  'cierre',
  'numero_de_personas',
  'mesero_id',
  'pagado',
  'cancelado',
  'total_articulos',
  'total',
  'efectivo',
  'tarjeta',
  'propina',
  'descuento',
  'subtotal',
  'subtotal_con_descuento',
  'total_impuesto',
  'total_descuentos',
  'total_cortesias',
  'total_alimentos',
  'total_bebidas',
] as const;

export const CHEQUE_COLUMN_COUNT = 23;

// ============================================
// VALIDATION RULES
// ============================================

export const VALIDATION_RULES = {
  // Numeric fields must be >= 0
  NON_NEGATIVE_FIELDS: [
    'total',
    'efectivo',
    'tarjeta',
    'propina',
    'subtotal',
    'subtotal_con_descuento',
    'total_impuesto',
    'total_descuentos',
    'total_cortesias',
    'total_alimentos',
    'total_bebidas',
    'numero_de_personas',
    'total_articulos',
  ],

  // Boolean fields (0 or 1)
  BOOLEAN_FIELDS: ['pagado', 'cancelado'],

  // Shift values
  VALID_SHIFTS: [1, 2, 3],

  // Date format
  DATE_REGEX: /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/,
};

// ============================================
// METRIC CALCULATIONS
// ============================================

export const METRIC_DEFINITIONS = {
  revenue: {
    name: 'Revenue',
    nameEs: 'Ingresos',
    formula: 'SUM(total) WHERE pagado=1 AND cancelado=0',
    unit: 'currency',
  },
  avgCheck: {
    name: 'Average Check',
    nameEs: 'Ticket Promedio',
    formula: 'revenue / chequeCount',
    unit: 'currency',
  },
  foodBevRatio: {
    name: 'Food:Beverage Ratio',
    nameEs: 'Ratio Alimentos:Bebidas',
    formula: 'totalAlimentos / totalBebidas',
    unit: 'ratio',
  },
  tipRate: {
    name: 'Tip Rate',
    nameEs: 'Tasa de Propina',
    formula: 'totalTips / (revenue - totalTax)',
    unit: 'percentage',
  },
  discountRate: {
    name: 'Discount Rate',
    nameEs: 'Tasa de Descuento',
    formula: 'totalDescuentos / subtotal',
    unit: 'percentage',
  },
  cancellationRate: {
    name: 'Cancellation Rate',
    nameEs: 'Tasa de Cancelacion',
    formula: 'cancelledCount / totalChecks',
    unit: 'percentage',
  },
  avgGuestCount: {
    name: 'Average Party Size',
    nameEs: 'Comensales Promedio',
    formula: 'totalGuests / chequeCount',
    unit: 'number',
  },
};

// ============================================
// UI CONFIGURATION
// ============================================

export const UI_CONFIG = {
  defaultPageSize: 25,
  maxLocationsPerPage: 50,
  maxStaffPerPage: 100,
  chartColors: [
    '#2563eb', // blue-600
    '#16a34a', // green-600
    '#dc2626', // red-600
    '#ca8a04', // yellow-600
    '#9333ea', // purple-600
    '#0891b2', // cyan-600
    '#ea580c', // orange-600
    '#4f46e5', // indigo-600
  ],
};
