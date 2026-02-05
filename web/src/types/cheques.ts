export interface Franquicia {
  numero_franquicia: string;
  nombre: string;
  ciudad: string;
  estado: string;
  region: 'West' | 'North' | 'Central' | 'South' | 'East';
  tier: 'Premium' | 'Standard';
  target_avg_ticket: number;
  fecha_apertura: string;
  gerente: string;
  status: 'active' | 'inactive';
}

export interface Mesero {
  mesero_id: number;
  nombre: string;
  numero_franquicia: string;
  fecha_ingreso: string;
  turno_default: number;
  commission_rate: number;
  status: 'active' | 'inactive';
}

export interface Turno {
  turno_id: number;
  nombre: string;
  nombre_en: string;
  hora_inicio: string;
  hora_fin: string;
  multiplier: number;
}

export interface Cheque {
  numero_franquicia: string;
  turno_id: number;
  folio: number;
  numero_cheque: number;
  fecha: string;
  cierre: string;
  numero_de_personas: number;
  mesero_id: number;
  pagado: number;
  cancelado: number;
  total_articulos: number;
  total: number;
  efectivo: number;
  tarjeta: number;
  propina: number;
  descuento: number;
  subtotal: number;
  subtotal_con_descuento: number;
  total_impuesto: number;
  total_descuentos: number;
  total_cortesias: number;
  total_alimentos: number;
  total_bebidas: number;
}

export interface ChequeImportField {
  key: keyof Cheque;
  label: string;
  labelEs: string;
  required: boolean;
  type: 'string' | 'number' | 'datetime' | 'currency' | 'boolean';
}

export const CHEQUE_FIELDS: ChequeImportField[] = [
  { key: 'numero_franquicia', label: 'Franchise ID', labelEs: 'Núm. Franquicia', required: true, type: 'string' },
  { key: 'turno_id', label: 'Shift ID', labelEs: 'ID Turno', required: true, type: 'number' },
  { key: 'folio', label: 'Folio', labelEs: 'Folio', required: true, type: 'number' },
  { key: 'numero_cheque', label: 'Check #', labelEs: 'Núm. Cheque', required: true, type: 'number' },
  { key: 'fecha', label: 'Open Time', labelEs: 'Fecha Apertura', required: true, type: 'datetime' },
  { key: 'cierre', label: 'Close Time', labelEs: 'Fecha Cierre', required: true, type: 'datetime' },
  { key: 'numero_de_personas', label: 'Party Size', labelEs: 'Núm. Personas', required: true, type: 'number' },
  { key: 'mesero_id', label: 'Server ID', labelEs: 'ID Mesero', required: true, type: 'number' },
  { key: 'pagado', label: 'Paid', labelEs: 'Pagado', required: true, type: 'boolean' },
  { key: 'cancelado', label: 'Cancelled', labelEs: 'Cancelado', required: true, type: 'boolean' },
  { key: 'total_articulos', label: 'Total Items', labelEs: 'Total Artículos', required: true, type: 'number' },
  { key: 'total', label: 'Total', labelEs: 'Total', required: true, type: 'currency' },
  { key: 'efectivo', label: 'Cash', labelEs: 'Efectivo', required: true, type: 'currency' },
  { key: 'tarjeta', label: 'Card', labelEs: 'Tarjeta', required: true, type: 'currency' },
  { key: 'propina', label: 'Tip', labelEs: 'Propina', required: true, type: 'currency' },
  { key: 'descuento', label: 'Discount', labelEs: 'Descuento', required: true, type: 'number' },
  { key: 'subtotal', label: 'Subtotal', labelEs: 'Subtotal', required: true, type: 'currency' },
  { key: 'subtotal_con_descuento', label: 'Disc. Subtotal', labelEs: 'Subtotal c/Desc', required: true, type: 'currency' },
  { key: 'total_impuesto', label: 'Tax', labelEs: 'Impuesto', required: true, type: 'currency' },
  { key: 'total_descuentos', label: 'Total Discounts', labelEs: 'Total Descuentos', required: true, type: 'currency' },
  { key: 'total_cortesias', label: 'Complimentary', labelEs: 'Cortesías', required: true, type: 'currency' },
  { key: 'total_alimentos', label: 'Food Total', labelEs: 'Total Alimentos', required: true, type: 'currency' },
  { key: 'total_bebidas', label: 'Beverage Total', labelEs: 'Total Bebidas', required: true, type: 'currency' },
];

export const TAX_RATE = 0.16;

// Helper type for cheques data file structure
export interface ChequesData {
  cheques: Cheque[];
  lastImport: string | null;
  totalImported: number;
}

// Helper type for franquicias data file structure
export interface FranquiciasData {
  franquicias: Franquicia[];
}

// Helper type for meseros data file structure
export interface MeserosData {
  meseros: Mesero[];
}

// Helper type for turnos data file structure
export interface TurnosData {
  turnos: Turno[];
}
