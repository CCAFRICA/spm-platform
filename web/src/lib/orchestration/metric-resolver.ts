/**
 * Plan-Driven Metric Resolver
 *
 * Resolves plan metric names to semantic types using pattern analysis.
 *
 * The plan defines metric names (e.g., "store_optical_sales").
 * The aggregation produces semantic values (attainment, amount, goal).
 * This resolver bridges them without hardcoding customer-specific mappings.
 *
 * PRINCIPLE 1: AI-First, Never Hardcoded.
 * This uses pattern analysis on metric names, not customer-specific translation tables.
 * Works for ANY plan that uses English metric names (which AI interpretation always produces).
 */

export type SemanticType = 'attainment' | 'amount' | 'goal' | 'quantity' | 'unknown';

// Patterns checked in priority order - attainment first to handle "sales_attainment"
const ATTAINMENT_PATTERNS = [
  /attainment/i,
  /rate/i,
  /ratio/i,
  /percentage/i,
  /percent/i,
  /achievement/i,
  /completion/i,
  /fulfillment/i,
  /cumplimiento/i,
];

const AMOUNT_PATTERNS = [
  /sales/i,
  /revenue/i,
  /volume/i,
  /amount/i,
  /premium/i,
  /total/i,
  /income/i,
  /value/i,
  /disbursement/i,
  /monto/i,
  /venta/i,
];

const GOAL_PATTERNS = [
  /goal/i,
  /target/i,
  /quota/i,
  /budget/i,
  /objective/i,
  /meta/i,
];

const QUANTITY_PATTERNS = [
  /count/i,
  /quantity/i,
  /number/i,
  /units/i,
  /customers/i,
  /clients/i,
  /items/i,
];

/**
 * Infer the semantic type of a plan metric name from its name alone.
 * Returns the most likely semantic type based on pattern matching.
 *
 * Priority order ensures "sales_attainment" returns 'attainment' not 'amount'.
 */
export function inferSemanticType(metricName: string): SemanticType {
  if (!metricName) return 'unknown';

  // Check patterns in priority order (attainment first because
  // "sales_attainment" should be attainment, not amount)
  for (const pattern of ATTAINMENT_PATTERNS) {
    if (pattern.test(metricName)) return 'attainment';
  }
  for (const pattern of GOAL_PATTERNS) {
    if (pattern.test(metricName)) return 'goal';
  }
  for (const pattern of QUANTITY_PATTERNS) {
    if (pattern.test(metricName)) return 'quantity';
  }
  for (const pattern of AMOUNT_PATTERNS) {
    if (pattern.test(metricName)) return 'amount';
  }

  return 'unknown';
}

/**
 * Component metric configuration - extracted from plan component configs
 */
export interface ComponentMetricConfig {
  rowMetric?: string;
  columnMetric?: string;
  metric?: string; // For tier lookups
  appliedTo?: string; // For percentage/conditional
}

/**
 * For a given plan component, determine which aggregated semantic value
 * maps to each of the plan's expected metric names.
 *
 * Returns a map: { planMetricName: semanticType }
 */
export function resolveComponentMetrics(
  component: ComponentMetricConfig
): Record<string, SemanticType> {
  const result: Record<string, SemanticType> = {};

  if (component.rowMetric) {
    result[component.rowMetric] = inferSemanticType(component.rowMetric);
  }
  if (component.columnMetric) {
    result[component.columnMetric] = inferSemanticType(component.columnMetric);
  }
  if (component.metric) {
    result[component.metric] = inferSemanticType(component.metric);
  }
  if (component.appliedTo) {
    result[component.appliedTo] = inferSemanticType(component.appliedTo);
  }

  return result;
}

/**
 * Aggregated sheet metrics with semantic types
 */
export interface SheetMetrics {
  attainment?: number;
  amount?: number;
  goal?: number;
  quantity?: number;
}

/**
 * Build the metrics object for one employee on one plan component.
 *
 * Takes the plan's expected metric names and fills them with the
 * aggregated semantic values from the matched sheet.
 *
 * OB-29 Phase 3B CONTEXTUAL FIX:
 * - tier_lookup components ONLY accept attainment values (no amount fallback)
 * - This prevents raw counts/amounts from being incorrectly used as percentages
 * - If attainment is unavailable for tier_lookup, metric is NOT added → engine returns $0
 *
 * @param component - Plan component with metric name config
 * @param sheetMetrics - Aggregated semantic values {attainment, amount, goal, quantity}
 * @param componentType - Optional: the plan component type (tier_lookup, matrix_lookup, etc.)
 * @returns Metrics object with plan-expected keys and aggregated values
 */
export function buildComponentMetrics(
  component: ComponentMetricConfig,
  sheetMetrics: SheetMetrics,
  componentType?: string
): Record<string, number> {
  const metricMap = resolveComponentMetrics(component);
  const result: Record<string, number> = {};

  // OB-29 Phase 3B: tier_lookup expects ATTAINMENT PERCENTAGE, not raw amounts
  const isTierLookup = componentType === 'tier_lookup';

  for (const [metricName, semanticType] of Object.entries(metricMap)) {
    switch (semanticType) {
      case 'attainment':
        if (sheetMetrics.attainment !== undefined) {
          result[metricName] = sheetMetrics.attainment;
        }
        // OB-29: If attainment is undefined (zero-goal), metric is NOT added → engine returns $0
        break;
      case 'amount':
        // OB-29 Phase 3B: For tier_lookup, amount is INVALID - it expects attainment
        if (isTierLookup) {
          // DO NOT add metric - this will trigger zero-goal guard in engine
        } else if (sheetMetrics.amount !== undefined) {
          result[metricName] = sheetMetrics.amount;
        }
        break;
      case 'goal':
        if (sheetMetrics.goal !== undefined) {
          result[metricName] = sheetMetrics.goal;
        }
        break;
      case 'quantity':
        // OB-29 Phase 3B: For tier_lookup, quantity is INVALID - it expects attainment
        if (isTierLookup) {
          // DO NOT add metric - this will trigger zero-goal guard in engine
        } else if (sheetMetrics.quantity !== undefined) {
          result[metricName] = sheetMetrics.quantity;
        }
        break;
      default:
        // OB-29 Phase 3B: For tier_lookup, unknown type gets NO fallback
        if (isTierLookup) {
          // DO NOT add metric - this will trigger zero-goal guard in engine
        } else {
          // Unknown type - try amount as fallback (most common) for non-tier_lookup
          if (sheetMetrics.amount !== undefined) {
            result[metricName] = sheetMetrics.amount;
          }
        }
    }
  }

  return result;
}

/**
 * Extract metric configuration from a plan component
 */
export function extractMetricConfig(component: {
  matrixConfig?: { rowMetric: string; columnMetric: string };
  tierConfig?: { metric: string };
  percentageConfig?: { appliedTo: string };
  conditionalConfig?: { appliedTo: string; conditions?: Array<{ metric: string }> };
}): ComponentMetricConfig {
  const config: ComponentMetricConfig = {};

  if (component.matrixConfig) {
    config.rowMetric = component.matrixConfig.rowMetric;
    config.columnMetric = component.matrixConfig.columnMetric;
  }
  if (component.tierConfig) {
    config.metric = component.tierConfig.metric;
  }
  if (component.percentageConfig) {
    config.appliedTo = component.percentageConfig.appliedTo;
  }
  if (component.conditionalConfig) {
    config.appliedTo = component.conditionalConfig.appliedTo;
    // Also get condition metrics
    const conditionMetrics = component.conditionalConfig.conditions
      ?.map((c) => c.metric)
      .filter(Boolean);
    if (conditionMetrics && conditionMetrics.length > 0) {
      // Store first condition metric in a way we can access it
      config.metric = conditionMetrics[0];
    }
  }

  return config;
}

/**
 * @deprecated SHEET_COMPONENT_PATTERNS is a legacy pattern-matching table.
 * OB-122 will replace this with input_bindings-driven metric resolution.
 * Do NOT add new entries. Use convergence-service.ts for new bindings.
 *
 * OB-24: Sheet-to-component matching patterns
 * Maps sheet name patterns to component types via regex.
 */
export const SHEET_COMPONENT_PATTERNS: Array<{
  sheetPatterns: RegExp[];
  componentPatterns: RegExp[];
}> = [
  {
    // Individual optical sales
    sheetPatterns: [/venta.*individual/i, /individual.*venta/i, /optical.*sales/i],
    componentPatterns: [/optical.*sales/i, /individual.*sales/i, /venta.*optica/i],
  },
  {
    // Store sales
    sheetPatterns: [/venta.*tienda/i, /tienda.*venta/i, /store.*sales/i],
    componentPatterns: [/store.*sales/i, /tienda/i],
  },
  {
    // New customers
    sheetPatterns: [/clientes.*nuevos/i, /new.*customer/i, /nuevos.*clientes/i],
    componentPatterns: [/new.*customer/i, /clientes.*nuevos/i],
  },
  {
    // Collections
    sheetPatterns: [/cobranza/i, /collection/i, /cobro/i],
    componentPatterns: [/collection/i, /cobranza/i],
  },
  {
    // Insurance (Club de Protección)
    sheetPatterns: [/club.*proteccion/i, /proteccion/i, /insurance/i, /seguro/i],
    componentPatterns: [/insurance/i, /proteccion/i, /seguro/i],
  },
  {
    // Extended warranty (Garantía Extendida)
    sheetPatterns: [/garantia.*extendida/i, /warranty/i, /garantia/i],
    componentPatterns: [/service/i, /warranty/i, /garantia/i],
  },
  // ── OB-116: MBC (banking/financial) patterns ──
  {
    // Mortgage origination / closings
    sheetPatterns: [/mortgage/i, /closing/i, /hipoteca/i],
    componentPatterns: [/mortgage/i, /hipoteca/i],
  },
  {
    // Loan disbursements / consumer lending
    sheetPatterns: [/loan.*disbursement/i, /disbursement/i, /desembolso/i, /prestamo/i],
    componentPatterns: [/loan.*commission/i, /lending/i, /prestamo/i],
  },
  {
    // Deposit growth / balances
    sheetPatterns: [/deposit/i, /balance/i, /deposito/i],
    componentPatterns: [/deposit/i, /deposito/i],
  },
  {
    // Insurance referrals (banking)
    sheetPatterns: [/referral/i, /referido/i],
    componentPatterns: [/referral/i, /referido/i],
  },
];

/**
 * Find the sheet that matches a plan component by matching component names/IDs.
 * The AI Import Context stores which sheet feeds which plan component.
 */
export function findSheetForComponent(
  componentName: string,
  componentId: string,
  aiContextSheets: Array<{
    sheetName: string;
    matchedComponent: string | null;
  }>
): string | null {
  if (!aiContextSheets || aiContextSheets.length === 0) {
    return null;
  }

  // Normalize for comparison
  const normName = componentName.toLowerCase().replace(/[-\s]/g, '_');
  const normId = componentId.toLowerCase().replace(/[-\s]/g, '_');

  // STRATEGY 1: Use AI matchedComponent if available
  for (const sheet of aiContextSheets) {
    if (!sheet.matchedComponent) continue;

    const matchedNorm = sheet.matchedComponent.toLowerCase().replace(/[-\s]/g, '_');

    // Check various matching strategies
    if (
      matchedNorm === normName ||
      matchedNorm === normId ||
      matchedNorm.includes(normName) ||
      normName.includes(matchedNorm) ||
      matchedNorm.includes(normId) ||
      normId.includes(matchedNorm)
    ) {
      return sheet.sheetName;
    }
  }

  // STRATEGY 2: OB-24 Pattern-based matching (Spanish sheet names → English components)
  for (const mapping of SHEET_COMPONENT_PATTERNS) {
    // Check if component matches any pattern
    const componentMatches = mapping.componentPatterns.some(
      (pattern) => pattern.test(componentName) || pattern.test(componentId)
    );

    if (componentMatches) {
      // Find a sheet that matches the corresponding sheet patterns
      for (const sheet of aiContextSheets) {
        const sheetMatches = mapping.sheetPatterns.some((pattern) =>
          pattern.test(sheet.sheetName)
        );
        if (sheetMatches) {
          return sheet.sheetName;
        }
      }
    }
  }

  return null;
}
