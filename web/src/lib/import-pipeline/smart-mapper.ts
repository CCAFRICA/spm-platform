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

// ============================================
// OB-110: EXPANDED FIELD TYPE TAXONOMY (22 types)
// ============================================

/**
 * Expanded field type taxonomy — 22 types organized by category.
 *
 * Design principles:
 * - Korean Test compliant: no type depends on English column names
 * - Directional metrics distinguished: growth ≠ reduction
 * - Identity types distinguished: ID ≠ Name, Entity ≠ Store
 * - Financial types distinguished: Amount ≠ Currency Code ≠ Rate
 * - Every type has a description used in the AI prompt
 *
 * Source: OB-110 (alpha.2.0), derived from CLT-109 F-21/CLT-102 F-51
 */
export const BASE_FIELD_TYPES = {
  // === Identity ===
  entity_id:       { label: 'Entity ID',            category: 'identity',       description: 'Unique identifier for a person, account, or entity (numeric or alphanumeric code)' },
  entity_name:     { label: 'Entity Name',           category: 'identity',       description: 'Display name of a person or entity — contains human-readable names like "Carlos Garcia"' },
  store_id:        { label: 'Store/Location ID',     category: 'identity',       description: 'Identifier code for a store, branch, office, or location' },
  store_name:      { label: 'Store/Location Name',   category: 'identity',       description: 'Human-readable name of a store, branch, office, or location' },
  transaction_id:  { label: 'Transaction ID',        category: 'identity',       description: 'Unique identifier for a transaction, order, event, or record' },
  reference_id:    { label: 'Reference ID',          category: 'identity',       description: 'A cross-reference to another record, system, or external identifier' },

  // === Temporal ===
  date:            { label: 'Date',                  category: 'temporal',       description: 'A date value — transaction date, snapshot date, hire date, effective date' },
  period:          { label: 'Period',                category: 'temporal',       description: 'A time period label or identifier — month name, quarter label, period code' },

  // === Financial ===
  amount:          { label: 'Amount',                category: 'financial',      description: 'A monetary value — revenue, deposit balance, payout, sale total, balance' },
  currency_code:   { label: 'Currency Code',         category: 'financial',      description: 'ISO currency code like USD, MXN, EUR — short text strings, NOT monetary amounts' },
  rate:            { label: 'Rate/Percentage',       category: 'financial',      description: 'A rate, percentage, or ratio — commission rate, tip percentage, discount rate' },

  // === Metrics (directional) ===
  count_growth:    { label: 'Growth Count',          category: 'metric',         description: 'Count of items ADDED, opened, gained, acquired — new accounts, new customers, units sold' },
  count_reduction: { label: 'Reduction Count',       category: 'metric',         description: 'Count of items REMOVED, closed, lost, churned — closed accounts, cancellations, returns' },
  quantity:        { label: 'Quantity',              category: 'metric',         description: 'A generic count when direction is unclear or neutral — total items, headcount, visits' },
  achievement_pct: { label: 'Achievement %',         category: 'metric',         description: 'Attainment or achievement as a percentage of goal or target' },
  score:           { label: 'Score/Rating',          category: 'metric',         description: 'A performance score, quality rating, index value, or ranking number' },

  // === Classification ===
  role:            { label: 'Role/Position',         category: 'classification', description: 'Job title, role, position, or function — values like "Manager", "Sales Rep", "mesero"' },
  product_code:    { label: 'Product Code',          category: 'classification', description: 'SKU, product ID, product code, or catalog number' },
  product_name:    { label: 'Product Name',          category: 'classification', description: 'Product or service description or name' },
  category:        { label: 'Category',              category: 'classification', description: 'A grouping label — department, division, segment, tier, type, class' },
  status:          { label: 'Status',                category: 'classification', description: 'A status indicator — active, inactive, approved, pending, open, closed' },
  boolean_flag:    { label: 'Yes/No Flag',           category: 'classification', description: 'A boolean or binary value — 0/1, true/false, yes/no, si/no' },

  // === Other ===
  text:            { label: 'Text/Description',      category: 'other',          description: 'Free text, notes, comments, or descriptions — not classifiable as a structured type' },
  unknown:         { label: 'Unknown',               category: 'other',          description: 'Cannot determine field type — will be preserved in raw data regardless' },
} as const;

export type BaseFieldType = keyof typeof BASE_FIELD_TYPES;

/**
 * Backward compatibility aliases — map old keys to new.
 * Handles both camelCase (existing platform IDs) and legacy names.
 */
export const FIELD_TYPE_ALIASES: Record<string, BaseFieldType> = {
  // Legacy name aliases
  'name': 'entity_name',
  'employee_id': 'entity_id',
  'location': 'store_name',
  'location_id': 'store_id',
  'percent': 'rate',
  'pct': 'achievement_pct',
  // CamelCase aliases (used by existing extractTargetFieldsFromPlan)
  'entityId': 'entity_id',
  'entityName': 'entity_name',
  'storeId': 'store_id',
  'storeName': 'store_name',
  'transactionId': 'transaction_id',
  'referenceId': 'reference_id',
  'currencyCode': 'currency_code',
  'currency': 'currency_code',
  'countGrowth': 'count_growth',
  'countReduction': 'count_reduction',
  'achievementPct': 'achievement_pct',
  'attainment': 'achievement_pct',
  'goal': 'amount',  // goals are monetary amounts
  'storeRange': 'category',
  'productId': 'product_code',
  'productName': 'product_name',
  'boolean': 'boolean_flag',
};

/**
 * Resolve a field type key to a canonical BaseFieldType.
 * Handles aliases, camelCase variants, and direct keys.
 */
export function resolveFieldType(type: string): BaseFieldType {
  if (type in BASE_FIELD_TYPES) return type as BaseFieldType;
  if (type in FIELD_TYPE_ALIASES) return FIELD_TYPE_ALIASES[type];
  return 'unknown';
}

/**
 * Get all field types as an array for dropdown display.
 * Grouped by category for UI organization.
 */
export function getFieldTypeOptions(): Array<{ value: string; label: string; category: string }> {
  return Object.entries(BASE_FIELD_TYPES).map(([key, def]) => ({
    value: key,
    label: def.label,
    category: def.category,
  }));
}

/**
 * Get field type descriptions for inclusion in AI prompts.
 */
export function getFieldTypePromptList(): string {
  return Object.entries(BASE_FIELD_TYPES)
    .map(([key, def]) => `- ${key}: ${def.description}`)
    .join('\n');
}

/**
 * Extract sample values from parsed row data for each column.
 * Returns up to `maxSamples` non-null, non-empty values per column.
 * Used to give the AI actual data examples for more accurate classification.
 */
export function extractSampleValues(
  rows: Record<string, unknown>[],
  maxSamples: number = 5
): Record<string, string[]> {
  const samples: Record<string, string[]> = {};
  if (!rows || rows.length === 0) return samples;

  const columns = Object.keys(rows[0]);
  for (const col of columns) {
    const checkRows = rows.slice(0, Math.min(maxSamples * 3, rows.length));
    const values = checkRows
      .map(row => row[col])
      .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
      .slice(0, maxSamples)
      .map(v => String(v).slice(0, 100));
    samples[col] = values;
  }
  return samples;
}

/**
 * Post-AI confidence calibration.
 * Catches patterns the LLM might miss by cross-referencing
 * the AI's suggested type against actual sample values.
 */
export function calibrateFieldMappings(
  mappings: Array<{ column: string; target: string; confidence: number; reasoning: string }>,
  sampleValues: Record<string, string[]>
): Array<{ column: string; target: string; confidence: number; reasoning: string; warning?: string }> {

  const calibrated = mappings.map(m => {
    const samples = sampleValues[m.column] || [];
    let adjusted = m.confidence;
    let warning: string | undefined;

    // Rule 1: "amount" target but samples contain non-numeric text
    if (m.target === 'amount' && samples.length > 0) {
      const numericCount = samples.filter(v => !isNaN(Number(v.replace(/[,$.\s]/g, '')))).length;
      if (numericCount < samples.length * 0.5) {
        adjusted = Math.min(adjusted, 0.25);
        warning = 'Sample values contain non-numeric text but mapped to Amount. Check if this should be currency_code or text.';
      }
    }

    // Rule 2: "entity_name" or "role" but all samples are numeric
    if (['entity_name', 'role'].includes(m.target) && samples.length > 0) {
      const allNumeric = samples.every(v => !isNaN(Number(v)));
      if (allNumeric) {
        adjusted = Math.min(adjusted, 0.35);
        warning = `Sample values are all numeric but mapped to ${m.target}. Check if this should be entity_id or score.`;
      }
    }

    // Rule 3: "currency_code" but samples are numeric (probably amount)
    if (m.target === 'currency_code' && samples.length > 0) {
      const allNumeric = samples.every(v => !isNaN(Number(v.replace(/[,$.\s]/g, ''))));
      if (allNumeric) {
        adjusted = Math.min(adjusted, 0.35);
        warning = 'Sample values are numeric but mapped to Currency Code. Check if this should be amount.';
      }
    }

    // Rule 4: "date" but samples don't look like dates
    if (m.target === 'date' && samples.length > 0) {
      const datePattern = /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{5,}/;
      const looksLikeDate = samples.some(v => datePattern.test(v));
      if (!looksLikeDate) {
        adjusted = Math.min(adjusted, 0.40);
        warning = "Sample values don't look like dates. Check mapping.";
      }
    }

    // Rule 5: All sample values identical — possible default or placeholder
    if (samples.length >= 3) {
      const unique = new Set(samples);
      if (unique.size === 1) {
        adjusted = Math.min(adjusted, Math.max(m.confidence - 0.2, 0.3));
        warning = (warning ? warning + ' ' : '') + `All sample values identical ("${samples[0]}") — possible default value.`;
      }
    }

    return { ...m, confidence: Math.round(adjusted * 100) / 100, warning };
  });

  // Batch-level: detect duplicate target assignments for different columns
  const targetCounts = new Map<string, string[]>();
  for (const m of calibrated) {
    if (m.target === 'unknown' || m.target === 'text') continue;
    const existing = targetCounts.get(m.target) || [];
    existing.push(m.column);
    targetCounts.set(m.target, existing);
  }

  return calibrated.map(m => {
    const dupes = targetCounts.get(m.target) || [];
    if (dupes.length > 1 && m.target !== 'amount' && m.target !== 'date') {
      return {
        ...m,
        confidence: Math.min(m.confidence, 0.50),
        warning: (m.warning ? m.warning + ' ' : '') +
          `Multiple columns mapped to "${m.target}": [${dupes.join(', ')}]. Consider using more specific types (e.g., count_growth vs count_reduction).`,
      };
    }
    return m;
  });
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
