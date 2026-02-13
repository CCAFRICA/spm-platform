/**
 * Financial Module Types
 *
 * TypeScript interfaces for the Financial Management module.
 * Supports restaurant franchise financial intelligence derived from POS data.
 */

// ============================================
// ORGANIZATIONAL ENTITIES
// ============================================

/**
 * Franchisor - Top-level entity that owns the brand(s)
 */
export interface Franchisor {
  id: string;
  name: string;
  legalName?: string;
  country: string;
  taxId?: string;
  contactEmail?: string;
  contactPhone?: string;
  brands: string[]; // Brand IDs
  createdAt: string;
  updatedAt: string;
}

/**
 * Brand - A restaurant brand under a franchisor
 */
export interface Brand {
  id: string;
  franchisorId: string;
  name: string;
  logo?: string;
  cuisine?: string;
  posSystem?: 'softrestaurant' | 'icg' | 'other';
  createdAt: string;
  updatedAt: string;
}

/**
 * Franchisee - Entity that operates one or more locations
 */
export interface Franchisee {
  id: string;
  franchisorId: string;
  name: string;
  legalName?: string;
  taxId?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  locations: string[]; // Location IDs
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

/**
 * FranchiseLocation - A physical restaurant location
 */
export interface FranchiseLocation {
  id: string; // numero_franquicia from POS
  franchiseeId?: string;
  brandId?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country: string;
  posSystem?: 'softrestaurant' | 'icg' | 'other';
  timezone?: string;
  status: 'active' | 'inactive' | 'closed';
  openDate?: string;
  // Derived from import
  discoveredAt?: string;
  lastChequeDate?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * StaffMember - Restaurant staff (servers, managers)
 */
export interface StaffMember {
  id: string; // mesero_id from POS
  locationId?: string;
  name?: string;
  role?: 'server' | 'manager' | 'host' | 'bartender' | 'other';
  status: 'active' | 'inactive';
  // Derived from import
  discoveredAt?: string;
  lastChequeDate?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// TRANSACTIONAL ENTITIES
// ============================================

/**
 * Turno - Shift definition
 */
export interface Turno {
  id: number; // 1, 2, or 3
  name: string;
  nameEs: string;
  startHour: number;
  endHour: number;
}

/**
 * Shift constants
 */
export const TURNOS: Turno[] = [
  { id: 1, name: 'Morning', nameEs: 'Matutino', startHour: 7, endHour: 15 },
  { id: 2, name: 'Afternoon', nameEs: 'Vespertino', startHour: 15, endHour: 23 },
  { id: 3, name: 'Night', nameEs: 'Nocturno', startHour: 23, endHour: 7 },
];

/**
 * Cheque - POS transaction record (23 columns)
 * Matches the cheques_YYYYMMDD.TXT format from SoftRestaurant/ICG
 */
export interface Cheque {
  // Identifiers
  numeroFranquicia: string;     // Location ID
  turnoId: number;              // Shift (1=Morning, 2=Afternoon, 3=Night)
  folio: number;                // Sequential per location/shift
  numeroCheque: number;         // Check number

  // Timestamps
  fecha: string;                // Transaction datetime (ISO)
  cierre: string;               // Close datetime (ISO)

  // Party info
  numeroPersonas: number;       // Party size

  // Staff
  meseroId: number;             // Server ID

  // Status flags
  pagado: boolean;              // 1 = paid, 0 = unpaid
  cancelado: boolean;           // 1 = cancelled, 0 = not cancelled

  // Item counts
  totalArticulos: number;       // Total items

  // Amounts (MXN)
  total: number;                // Total amount
  efectivo: number;             // Cash payment
  tarjeta: number;              // Card payment
  propina: number;              // Tip amount
  descuento: number;            // Discount amount (deprecated?)
  subtotal: number;             // Subtotal before tax
  subtotalConDescuento: number; // Subtotal with discounts applied
  totalImpuesto: number;        // Tax amount (IVA 16%)
  totalDescuentos: number;      // Total discounts
  totalCortesias: number;       // Comps/comped items
  totalAlimentos: number;       // Food total
  totalBebidas: number;         // Beverage total

  // Metadata
  importBatchId?: string;
  importedAt?: string;
}

/**
 * Articulo - POS item-level detail record (12 columns)
 * Matches the articulos_YYYYMMDD.TXT companion file from SoftRestaurant/ICG.
 * Each row is one line item within a cheque.
 */
export interface Articulo {
  // Identifiers
  numeroFranquicia: string;     // Location ID (links to cheque)
  numeroCheque: number;         // Parent cheque number
  folioArticulo: number;        // Line item sequence number

  // Context
  fecha: string;                // Transaction date (ISO)
  meseroId: number;             // Server ID

  // Product
  articuloId: number;           // Product/SKU ID
  descripcion: string;          // Product description (raw, messy -- normalization target)
  grupo: string;                // Product group/category (raw)

  // Amounts (MXN)
  cantidad: number;             // Quantity
  precioUnitario: number;       // Unit price
  importe: number;              // Line total (qty x price)
  descuento: number;            // Discount on this item

  // Metadata
  importBatchId?: string;
  importedAt?: string;
}

/**
 * Column name aliases for articulos files
 */
export const ARTICULO_COLUMN_ALIASES: Record<string, keyof Articulo> = {
  // SoftRestaurant aliases
  'numero_franquicia': 'numeroFranquicia',
  'numero_cheque': 'numeroCheque',
  'folio_articulo': 'folioArticulo',
  'fecha': 'fecha',
  'mesero_id': 'meseroId',
  'articulo_id': 'articuloId',
  'descripcion': 'descripcion',
  'grupo': 'grupo',
  'cantidad': 'cantidad',
  'precio_unitario': 'precioUnitario',
  'importe': 'importe',
  'descuento': 'descuento',

  // ICG aliases
  'num_franquicia': 'numeroFranquicia',
  'no_cheque': 'numeroCheque',
  'folio_item': 'folioArticulo',
  'id_mesero': 'meseroId',
  'id_articulo': 'articuloId',
  'description': 'descripcion',
  'group': 'grupo',
  'quantity': 'cantidad',
  'unit_price': 'precioUnitario',
  'amount': 'importe',
  'discount': 'descuento',

  // Uppercase aliases (common in export files)
  'producto': 'descripcion',
  'nombre_articulo': 'descripcion',
  'categoria': 'grupo',
  'precio': 'precioUnitario',
  'total_linea': 'importe',
};

/**
 * Column name aliases for POS systems
 */
export const CHEQUE_COLUMN_ALIASES: Record<string, keyof Cheque> = {
  // SoftRestaurant aliases
  'numero_franquicia': 'numeroFranquicia',
  'turno_id': 'turnoId',
  'folio': 'folio',
  'numero_cheque': 'numeroCheque',
  'fecha': 'fecha',
  'cierre': 'cierre',
  'numero_de_personas': 'numeroPersonas',
  'mesero_id': 'meseroId',
  'pagado': 'pagado',
  'cancelado': 'cancelado',
  'total_articulos': 'totalArticulos',
  'total': 'total',
  'efectivo': 'efectivo',
  'tarjeta': 'tarjeta',
  'propina': 'propina',
  'descuento': 'descuento',
  'subtotal': 'subtotal',
  'subtotal_con_descuento': 'subtotalConDescuento',
  'total_impuesto': 'totalImpuesto',
  'total_descuentos': 'totalDescuentos',
  'total_cortesias': 'totalCortesias',
  'total_alimentos': 'totalAlimentos',
  'total_bebidas': 'totalBebidas',

  // ICG aliases (if different)
  'num_franquicia': 'numeroFranquicia',
  'id_turno': 'turnoId',
  'no_cheque': 'numeroCheque',
  'personas': 'numeroPersonas',
  'id_mesero': 'meseroId',
  'items': 'totalArticulos',
  'cash': 'efectivo',
  'card': 'tarjeta',
  'tip': 'propina',
  'discount': 'descuento',
  'tax': 'totalImpuesto',
  'food': 'totalAlimentos',
  'beverage': 'totalBebidas',
};

// ============================================
// COMPUTED / DERIVED ENTITIES
// ============================================

/**
 * PeriodSummary - Aggregated metrics for a time period
 */
export interface PeriodSummary {
  period: string;               // 'YYYY-MM-DD' or 'YYYY-MM' or 'YYYY-WW'
  periodType: 'day' | 'week' | 'month';
  locationId?: string;          // Null for network-wide
  staffId?: number;             // Null for location/network

  // Volume metrics
  chequeCount: number;
  guestCount: number;
  itemCount: number;

  // Revenue metrics (MXN)
  totalRevenue: number;
  cashRevenue: number;
  cardRevenue: number;
  foodRevenue: number;
  beverageRevenue: number;

  // Other amounts
  totalTips: number;
  totalDiscounts: number;
  totalComps: number;
  totalTax: number;

  // Derived ratios
  avgCheck: number;             // totalRevenue / chequeCount
  avgGuestCheck: number;        // totalRevenue / guestCount
  avgItemsPerCheck: number;     // itemCount / chequeCount
  foodBevRatio: number;         // foodRevenue / beverageRevenue
  tipRate: number;              // totalTips / (totalRevenue - totalTax)
  discountRate: number;         // totalDiscounts / subtotal
  cancellationRate: number;     // cancelledCount / totalChecks

  // Counts
  cancelledCount: number;
  unpaidCount: number;
}

/**
 * StaffPerformance - Per-server metrics
 */
export interface StaffPerformance {
  staffId: number;
  staffName?: string;
  locationId: string;
  period: string;

  // Volume
  chequeCount: number;
  guestCount: number;

  // Revenue
  totalRevenue: number;
  avgCheck: number;

  // Tips
  totalTips: number;
  tipRate: number;

  // Ranking
  revenueRank?: number;
  avgCheckRank?: number;
  tipRank?: number;
}

/**
 * LocationRanking - Location comparison
 */
export interface LocationRanking {
  locationId: string;
  locationName?: string;
  rank: number;
  metric: string;
  value: number;
  networkAvg: number;
  percentile: number;
  trend?: 'up' | 'down' | 'stable';
  change?: number;
}

// ============================================
// IMPORT ENTITIES
// ============================================

/**
 * ChequeImportResult - Result of parsing a cheque file
 */
export interface ChequeImportResult {
  batchId: string;
  fileName: string;
  tenantId: string;
  importedAt: string;
  importedBy: string;
  status: 'pending' | 'committed' | 'failed' | 'rolled_back';

  // Counts
  totalRows: number;
  validRows: number;
  errorRows: number;

  // Metadata
  dateRange: {
    start: string;
    end: string;
  };
  locations: string[];
  staff: number[];
  shifts: number[];

  // Financials
  totalRevenue: number;
  currency: string;

  // Errors
  errors: ChequeImportError[];
}

/**
 * ChequeImportError - Error during import
 */
export interface ChequeImportError {
  row: number;
  column?: string;
  value?: string;
  message: string;
  severity: 'error' | 'warning';
}

// ============================================
// CONFIGURATION
// ============================================

/**
 * FinancialModuleConfig - Module configuration per tenant
 */
export interface FinancialModuleConfig {
  tenantId: string;
  enabled: boolean;
  currency: string;
  timezone: string;
  posSystem: 'softrestaurant' | 'icg' | 'other';
  features: {
    staffTracking: boolean;
    tipsTracking: boolean;
    inventoryIntegration: boolean;
    loyaltyIntegration: boolean;
  };
  createdAt: string;
  updatedAt: string;
}
