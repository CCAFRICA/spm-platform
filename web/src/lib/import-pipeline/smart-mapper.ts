/**
 * Smart Mapper
 *
 * Progressive learning field mapper for import files.
 * Suggests source->platform field mappings with confidence scores.
 *
 * NOTE: localStorage removed (OB-43A). Mapping history/templates are no-ops.
 */

export interface FieldMapping {
  sourceField: string;
  targetField: string | null;
  confidence: number; // 0-100
  matchType: 'exact' | 'fuzzy' | 'historical' | 'manual' | 'none';
}

export interface MappingTemplate {
  id: string;
  tenantId: string;
  sourceSystem: string;
  name: string;
  mappings: FieldMapping[];
  createdAt: string;
  usageCount: number;
}

// Platform fields that can be mapped to
const PLATFORM_FIELDS = [
  { name: 'orderId', label: 'Order ID', labelEs: 'ID de Pedido', required: false },
  { name: 'transactionId', label: 'Transaction ID', labelEs: 'ID de Transacci\u00f3n', required: false },
  { name: 'externalId', label: 'External ID', labelEs: 'ID Externo', required: false },
  { name: 'repId', label: 'Rep ID', labelEs: 'ID del Rep', required: true },
  { name: 'repName', label: 'Rep Name', labelEs: 'Nombre del Rep', required: false },
  { name: 'date', label: 'Date', labelEs: 'Fecha', required: true },
  { name: 'amount', label: 'Amount', labelEs: 'Monto', required: true },
  { name: 'quantity', label: 'Quantity', labelEs: 'Cantidad', required: false },
  { name: 'productId', label: 'Product ID', labelEs: 'ID del Producto', required: false },
  { name: 'productName', label: 'Product Name', labelEs: 'Nombre del Producto', required: false },
  { name: 'customerId', label: 'Customer ID', labelEs: 'ID del Cliente', required: false },
  { name: 'customerName', label: 'Customer Name', labelEs: 'Nombre del Cliente', required: false },
  { name: 'region', label: 'Region', labelEs: 'Regi\u00f3n', required: false },
  { name: 'territory', label: 'Territory', labelEs: 'Territorio', required: false },
  { name: 'channel', label: 'Channel', labelEs: 'Canal', required: false },
  { name: 'status', label: 'Status', labelEs: 'Estado', required: false },
  { name: 'currency', label: 'Currency', labelEs: 'Moneda', required: false },
  { name: 'commissionRate', label: 'Commission Rate', labelEs: 'Tasa de Comisi\u00f3n', required: false },
  { name: 'notes', label: 'Notes', labelEs: 'Notas', required: false },
];

// Synonyms for fuzzy matching
const FIELD_SYNONYMS: Record<string, string[]> = {
  orderId: ['order_id', 'orderid', 'order_number', 'orderno', 'order #', 'po_number', 'po'],
  transactionId: ['transaction_id', 'txn_id', 'txnid', 'trans_id', 'transaction_number'],
  externalId: ['external_id', 'ext_id', 'extid', 'source_id', 'ref_id', 'reference'],
  repId: ['rep_id', 'sales_rep_id', 'entity_id', 'emp_id', 'salesrep', 'rep_code', 'agent_id'],
  repName: ['rep_name', 'sales_rep', 'employee_name', 'salesperson', 'agent_name', 'seller'],
  date: ['transaction_date', 'order_date', 'sale_date', 'created_at', 'fecha', 'created'],
  amount: ['total', 'value', 'sale_amount', 'revenue', 'price', 'monto', 'total_amount'],
  quantity: ['qty', 'units', 'cantidad', 'count', 'num_units'],
  productId: ['product_id', 'sku', 'item_id', 'product_code', 'prod_id'],
  productName: ['product_name', 'item_name', 'product', 'producto', 'description'],
  customerId: ['customer_id', 'client_id', 'account_id', 'cust_id', 'buyer_id'],
  customerName: ['customer_name', 'client_name', 'account_name', 'cliente', 'buyer'],
  region: ['region_name', 'area', 'zone', 'regi\u00f3n'],
  territory: ['territory_name', 'terr', 'territorio'],
  channel: ['sales_channel', 'canal', 'source'],
  status: ['order_status', 'estado', 'state'],
  currency: ['currency_code', 'curr', 'moneda'],
  commissionRate: ['commission_rate', 'rate', 'commission_pct', 'comm_rate', 'percentage'],
  notes: ['comments', 'remarks', 'notas', 'memo'],
  // HF-065 F25: Hierarchy, contact, employment field synonyms
  branch_name: ['branchname', 'branch', 'sucursal', 'oficina', 'office_name', 'office'],
  branch_id: ['branchid', 'branch_code', 'office_id', 'office_code'],
  department: ['dept', 'departamento', 'division', 'unit'],
  location: ['ubicacion', 'site', 'location_name', 'workplace'],
  manager_id: ['managerid', 'supervisor_id', 'boss_id', 'reports_to'],
  manager_name: ['managername', 'supervisor', 'supervisor_name', 'boss'],
  email: ['employee_email', 'correo', 'email_address', 'e_mail', 'correo_electronico'],
  phone: ['phone_number', 'telefono', 'tel', 'mobile', 'cell'],
  hire_date: ['hiredate', 'start_date', 'fecha_contratacion', 'date_hired', 'join_date'],
  product_licenses: ['productlicenses', 'licenses', 'licencias', 'certifications', 'certs'],
};

// ============================================
// MAIN MAPPING FUNCTION
// ============================================

/**
 * Suggest mappings for source headers
 */
export function suggestMappings(
  headers: string[],
  tenantId: string,
  sourceSystem?: string
): FieldMapping[] {
  // Load historical mappings
  const history = getMappingHistory(tenantId, sourceSystem);

  return headers.map((header) => {
    // Check historical mappings first
    const historicalMatch = findHistoricalMatch(header, history);
    if (historicalMatch) {
      return {
        sourceField: header,
        targetField: historicalMatch.targetField,
        confidence: historicalMatch.confidence,
        matchType: 'historical' as const,
      };
    }

    // Try exact match
    const exactMatch = findExactMatch(header);
    if (exactMatch) {
      return {
        sourceField: header,
        targetField: exactMatch,
        confidence: 100,
        matchType: 'exact' as const,
      };
    }

    // Try fuzzy match
    const fuzzyMatch = findFuzzyMatch(header);
    if (fuzzyMatch) {
      return {
        sourceField: header,
        targetField: fuzzyMatch.field,
        confidence: fuzzyMatch.confidence,
        matchType: 'fuzzy' as const,
      };
    }

    // No match found
    return {
      sourceField: header,
      targetField: null,
      confidence: 0,
      matchType: 'none' as const,
    };
  });
}

// ============================================
// MATCHING FUNCTIONS
// ============================================

function findExactMatch(header: string): string | null {
  const normalized = normalizeField(header);

  for (const field of PLATFORM_FIELDS) {
    if (normalizeField(field.name) === normalized) {
      return field.name;
    }
  }

  return null;
}

function findFuzzyMatch(header: string): { field: string; confidence: number } | null {
  const normalized = normalizeField(header);
  let bestMatch: { field: string; confidence: number } | null = null;

  for (const [fieldName, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    // Check synonyms
    for (const synonym of synonyms) {
      const normalizedSynonym = normalizeField(synonym);

      if (normalizedSynonym === normalized) {
        return { field: fieldName, confidence: 95 };
      }

      // Partial match
      if (normalizedSynonym.includes(normalized) || normalized.includes(normalizedSynonym)) {
        const confidence = calculateSimilarity(normalized, normalizedSynonym);
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { field: fieldName, confidence };
        }
      }
    }
  }

  return bestMatch && bestMatch.confidence >= 60 ? bestMatch : null;
}

function findHistoricalMatch(
  header: string,
  history: HistoricalMapping[]
): { targetField: string; confidence: number } | null {
  const normalized = normalizeField(header);

  for (const mapping of history) {
    if (normalizeField(mapping.sourceField) === normalized) {
      // Boost confidence based on usage count
      const confidence = Math.min(90, 70 + mapping.usageCount * 5);
      return { targetField: mapping.targetField, confidence };
    }
  }

  return null;
}

function normalizeField(field: string): string {
  return field
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 100;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 100;

  const editDistance = levenshteinDistance(longer, shorter);
  const similarity = ((longer.length - editDistance) / longer.length) * 100;

  return Math.round(similarity);
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// ============================================
// MAPPING HISTORY (no-ops, localStorage removed)
// ============================================

interface HistoricalMapping {
  sourceField: string;
  targetField: string;
  sourceSystem: string;
  tenantId: string;
  usageCount: number;
  lastUsed: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getMappingHistory(_tenantId: string, _sourceSystem?: string): HistoricalMapping[] {
  // localStorage removed -- return empty
  return [];
}

/**
 * Save confirmed mappings to history for learning (no-op, localStorage removed)
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
export function saveMappingHistory(
  _tenantId: string,
  _sourceSystem: string,
  _mappings: FieldMapping[]
): void {
/* eslint-enable @typescript-eslint/no-unused-vars */
  // localStorage removed -- no-op
}

// ============================================
// MAPPING TEMPLATES (no-ops, localStorage removed)
// ============================================

/**
 * Get saved mapping templates
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getMappingTemplates(_tenantId: string): MappingTemplate[] {
  // localStorage removed -- return empty
  return [];
}

/**
 * Save a mapping template (no-op, localStorage removed)
 */
export function saveMappingTemplate(
  tenantId: string,
  sourceSystem: string,
  name: string,
  mappings: FieldMapping[]
): MappingTemplate {
  const template: MappingTemplate = {
    id: `template-${Date.now()}`,
    tenantId,
    sourceSystem,
    name,
    mappings,
    createdAt: new Date().toISOString(),
    usageCount: 0,
  };

  // localStorage removed -- save is a no-op

  return template;
}

/**
 * Apply a template to source headers
 */
export function applyTemplate(
  headers: string[],
  template: MappingTemplate
): FieldMapping[] {
  return headers.map((header) => {
    const templateMapping = template.mappings.find(
      (m) => normalizeField(m.sourceField) === normalizeField(header)
    );

    if (templateMapping) {
      return {
        ...templateMapping,
        sourceField: header,
        confidence: 90,
        matchType: 'historical' as const,
      };
    }

    return {
      sourceField: header,
      targetField: null,
      confidence: 0,
      matchType: 'none' as const,
    };
  });
}

/**
 * Increment template usage count (no-op, localStorage removed)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function incrementTemplateUsage(_templateId: string): void {
  // localStorage removed -- no-op
}

// ============================================
// UTILITIES
// ============================================

/**
 * Get platform fields for UI
 */
export function getPlatformFields(): typeof PLATFORM_FIELDS {
  return PLATFORM_FIELDS;
}

/**
 * Get required platform fields
 */
export function getRequiredFields(): string[] {
  return PLATFORM_FIELDS.filter((f) => f.required).map((f) => f.name);
}

/**
 * Check if all required fields are mapped
 */
export function validateMappings(mappings: FieldMapping[]): {
  valid: boolean;
  missingRequired: string[];
} {
  const required = getRequiredFields();
  const mapped = mappings
    .filter((m) => m.targetField)
    .map((m) => m.targetField as string);

  const missingRequired = required.filter((r) => !mapped.includes(r));

  return {
    valid: missingRequired.length === 0,
    missingRequired,
  };
}

/**
 * Calculate overall mapping confidence
 */
export function calculateMappingConfidence(mappings: FieldMapping[]): number {
  if (mappings.length === 0) return 0;

  const total = mappings.reduce((sum, m) => sum + m.confidence, 0);
  return Math.round(total / mappings.length);
}
