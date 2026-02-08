/**
 * Data-to-Component Mapper
 *
 * Connects imported data sheet fields to plan component metrics.
 * Supports auto-mapping based on naming conventions and manual overrides.
 */

import type { CompensationPlanConfig } from '@/types/compensation-plan';
import { getPlans } from '@/lib/compensation/plan-storage';

// ============================================
// STORAGE
// ============================================

const STORAGE_KEY = 'clearcomp_data_component_mappings';

// ============================================
// TYPES
// ============================================

export interface MetricMapping {
  /** Source field name from imported data */
  sourceField: string;
  /** Source sheet/batch this mapping applies to */
  sourceSheet?: string;
  /** Target metric name expected by plan component */
  targetMetric: string;
  /** How this mapping was created */
  mappingType: 'auto' | 'manual' | 'inferred';
  /** Confidence score for auto-mappings (0-1) */
  confidence: number;
  /** Optional transformation to apply */
  transform?: {
    type: 'multiply' | 'divide' | 'percentage' | 'none';
    factor?: number;
  };
}

export interface DataComponentMapping {
  id: string;
  tenantId: string;
  /** Plan ID this mapping applies to (or 'default' for tenant-wide) */
  planId: string;
  /** Component ID within the plan */
  componentId: string;
  /** Component name for display */
  componentName: string;
  /** Required metrics for this component */
  requiredMetrics: string[];
  /** Mappings from source fields to target metrics */
  mappings: MetricMapping[];
  /** Whether all required metrics are mapped */
  isComplete: boolean;
  /** Last updated timestamp */
  updatedAt: string;
  /** User who last updated */
  updatedBy?: string;
}

export interface ComponentDataMap {
  tenantId: string;
  planId: string;
  planName: string;
  components: DataComponentMapping[];
  /** Unmapped source fields (available for manual mapping) */
  unmappedFields: string[];
  /** Overall mapping completeness (0-1) */
  completeness: number;
}

export interface AutoMappingResult {
  mappings: DataComponentMapping[];
  suggestions: Array<{
    sourceField: string;
    possibleTargets: Array<{
      metric: string;
      confidence: number;
      reason: string;
    }>;
  }>;
  unmappedFields: string[];
  unmappedMetrics: string[];
}

// ============================================
// AUTO-MAPPING KEYWORDS
// ============================================

/**
 * Keyword patterns for auto-mapping source fields to target metrics.
 * Supports multiple languages (English, Spanish).
 */
const METRIC_KEYWORDS: Record<string, string[]> = {
  // Optical metrics
  optical_volume: [
    'optical', 'optico', 'óptico', 'lenses', 'lentes', 'frames', 'armazones',
    'eyewear', 'glasses', 'anteojos', 'venta_optica', 'optical_sales',
    'base_venta_individual', 'individual_sales', 'venta_individual'
  ],
  optical_attainment: [
    'optical_attainment', 'attainment_optical', 'cumplimiento_optico',
    'optical_quota_pct', 'optical_percent', 'optico_porcentaje',
    'pct_cumplimiento', 'porcentaje_cumplimiento', 'cumplimiento'
  ],
  optical_quota: [
    'optical_quota', 'quota_optical', 'meta_optica', 'cuota_optica',
    'optical_target', 'objetivo_optico', 'meta'
  ],

  // Store metrics
  store_attainment: [
    'store_attainment', 'tienda_cumplimiento', 'store_performance',
    'store_quota_pct', 'sucursal_attainment', 'branch_attainment',
    'cumplimiento_tienda', 'pct_tienda'
  ],
  store_volume: [
    'store_volume', 'store_sales', 'tienda_ventas', 'sucursal_ventas',
    'branch_sales', 'total_store', 'venta_tienda', 'venta_optica_tienda'
  ],
  store_optical_sales: [
    'store_optical_sales', 'venta_optica_tienda', 'optical_tienda',
    'tienda_optica', 'store_optical', 'tienda_optical'
  ],

  // Customer metrics
  new_customers_attainment: [
    'new_customers', 'nuevos_clientes', 'customer_attainment',
    'clientes_nuevos', 'new_customer_pct', 'customer_acquisition'
  ],
  new_customers_count: [
    'customer_count', 'conteo_clientes', 'num_customers',
    'cantidad_clientes', 'total_customers'
  ],

  // Collection metrics
  collection_rate: [
    'collection', 'cobranza', 'collections', 'cobro', 'payment_rate',
    'tasa_cobranza', 'collection_pct', 'recovery_rate'
  ],
  insurance_collection_rate: [
    'insurance_collection', 'cobranza_seguro', 'seguro_cobranza',
    'insurance_recovery', 'cobro_seguro'
  ],

  // Insurance metrics
  insurance_premium_total: [
    'insurance_premium', 'prima_seguro', 'premium_total', 'seguro_total',
    'total_premium', 'insurance_sales', 'venta_seguro'
  ],
  insurance_volume: [
    'insurance_volume', 'volumen_seguro', 'insurance_amount',
    'monto_seguro'
  ],

  // Services metrics
  services_revenue: [
    'services', 'servicios', 'additional_services', 'servicios_adicionales',
    'service_revenue', 'ingresos_servicios', 'services_total'
  ],

  // Generic metrics
  revenue: [
    'revenue', 'ingresos', 'sales', 'ventas', 'total_sales', 'total_revenue'
  ],
  units: [
    'units', 'unidades', 'quantity', 'cantidad', 'count', 'conteo'
  ],
  quota: [
    'quota', 'cuota', 'target', 'meta', 'objetivo', 'goal'
  ],
  attainment: [
    'attainment', 'cumplimiento', 'achievement', 'logro', 'percent', 'porcentaje'
  ],
};

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Get all mappings for a tenant
 */
export function getMappings(tenantId: string): DataComponentMapping[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    const allMappings: DataComponentMapping[] = JSON.parse(stored);
    return allMappings.filter((m) => m.tenantId === tenantId);
  } catch {
    return [];
  }
}

/**
 * Get mappings for a specific plan
 */
export function getPlanMappings(tenantId: string, planId: string): DataComponentMapping[] {
  return getMappings(tenantId).filter((m) => m.planId === planId || m.planId === 'default');
}

/**
 * Save a single mapping
 */
export function saveMapping(mapping: DataComponentMapping): DataComponentMapping {
  if (typeof window === 'undefined') return mapping;

  const allMappings = getAllMappings();
  const existingIndex = allMappings.findIndex(
    (m) =>
      m.tenantId === mapping.tenantId &&
      m.planId === mapping.planId &&
      m.componentId === mapping.componentId
  );

  const updated: DataComponentMapping = {
    ...mapping,
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    allMappings[existingIndex] = updated;
  } else {
    allMappings.push(updated);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(allMappings));
  return updated;
}

/**
 * Save multiple mappings
 */
export function saveMappings(mappings: DataComponentMapping[]): void {
  if (typeof window === 'undefined') return;

  const allMappings = getAllMappings();

  for (const mapping of mappings) {
    const existingIndex = allMappings.findIndex(
      (m) =>
        m.tenantId === mapping.tenantId &&
        m.planId === mapping.planId &&
        m.componentId === mapping.componentId
    );

    const updated: DataComponentMapping = {
      ...mapping,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      allMappings[existingIndex] = updated;
    } else {
      allMappings.push(updated);
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(allMappings));
}

/**
 * Delete a mapping
 */
export function deleteMapping(tenantId: string, planId: string, componentId: string): boolean {
  if (typeof window === 'undefined') return false;

  const allMappings = getAllMappings();
  const filtered = allMappings.filter(
    (m) =>
      !(m.tenantId === tenantId && m.planId === planId && m.componentId === componentId)
  );

  if (filtered.length === allMappings.length) return false;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

// ============================================
// AUTO-MAPPING
// ============================================

/**
 * Extract required metrics from a plan configuration
 */
export function extractRequiredMetrics(plan: CompensationPlanConfig): Map<string, string[]> {
  const componentMetrics = new Map<string, string[]>();

  if (plan.configuration.type !== 'additive_lookup') {
    return componentMetrics;
  }

  for (const variant of plan.configuration.variants) {
    for (const component of variant.components) {
      const metrics: string[] = [];

      switch (component.componentType) {
        case 'matrix_lookup':
          if (component.matrixConfig) {
            metrics.push(component.matrixConfig.rowMetric);
            metrics.push(component.matrixConfig.columnMetric);
          }
          break;
        case 'tier_lookup':
          if (component.tierConfig) {
            metrics.push(component.tierConfig.metric);
          }
          break;
        case 'percentage':
          if (component.percentageConfig) {
            metrics.push(component.percentageConfig.appliedTo);
          }
          break;
        case 'conditional_percentage':
          if (component.conditionalConfig) {
            metrics.push(component.conditionalConfig.appliedTo);
            // Also need the condition metric
            if (component.conditionalConfig.conditions.length > 0) {
              metrics.push(component.conditionalConfig.conditions[0].metric);
            }
          }
          break;
      }

      componentMetrics.set(component.id, metrics);
    }
  }

  return componentMetrics;
}

/**
 * Auto-map source fields to target metrics based on keyword matching
 */
export function autoMapFields(
  sourceFields: string[],
  targetMetrics: string[]
): MetricMapping[] {
  const mappings: MetricMapping[] = [];
  const usedSources = new Set<string>();
  const usedTargets = new Set<string>();

  // Normalize field name for comparison
  const normalize = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');

  // Calculate match score
  const calculateScore = (source: string, targetKeywords: string[]): number => {
    const normalizedSource = normalize(source);
    let maxScore = 0;

    for (const keyword of targetKeywords) {
      const normalizedKeyword = normalize(keyword);

      // Exact match
      if (normalizedSource === normalizedKeyword) {
        return 1.0;
      }

      // Contains match
      if (normalizedSource.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedSource)) {
        const score = Math.min(normalizedKeyword.length, normalizedSource.length) /
          Math.max(normalizedKeyword.length, normalizedSource.length);
        maxScore = Math.max(maxScore, score * 0.9);
      }

      // Word overlap
      const sourceWords = normalizedSource.split('_');
      const keywordWords = normalizedKeyword.split('_');
      const overlap = sourceWords.filter((w) => keywordWords.includes(w)).length;
      if (overlap > 0) {
        const overlapScore = overlap / Math.max(sourceWords.length, keywordWords.length);
        maxScore = Math.max(maxScore, overlapScore * 0.7);
      }
    }

    return maxScore;
  };

  // First pass: find best matches for each target metric
  for (const targetMetric of targetMetrics) {
    if (usedTargets.has(targetMetric)) continue;

    const keywords = METRIC_KEYWORDS[targetMetric] || [targetMetric];
    let bestMatch: { source: string; score: number } | null = null;

    for (const sourceField of sourceFields) {
      if (usedSources.has(sourceField)) continue;

      const score = calculateScore(sourceField, keywords);
      if (score > 0.5 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { source: sourceField, score };
      }
    }

    if (bestMatch) {
      mappings.push({
        sourceField: bestMatch.source,
        targetMetric,
        mappingType: 'auto',
        confidence: bestMatch.score,
      });
      usedSources.add(bestMatch.source);
      usedTargets.add(targetMetric);
    }
  }

  return mappings;
}

/**
 * Run auto-mapping for a plan against available source fields
 */
export function autoMapPlan(
  plan: CompensationPlanConfig,
  sourceFields: string[]
): AutoMappingResult {
  const componentMetrics = extractRequiredMetrics(plan);
  const mappings: DataComponentMapping[] = [];
  const allSuggestions: AutoMappingResult['suggestions'] = [];
  const allUnmappedMetrics: string[] = [];
  const usedSourceFields = new Set<string>();

  if (plan.configuration.type !== 'additive_lookup') {
    return {
      mappings: [],
      suggestions: [],
      unmappedFields: sourceFields,
      unmappedMetrics: [],
    };
  }

  // Process each component
  for (const variant of plan.configuration.variants) {
    for (const component of variant.components) {
      const requiredMetrics = componentMetrics.get(component.id) || [];
      const componentMappings = autoMapFields(sourceFields, requiredMetrics);

      // Track used source fields
      componentMappings.forEach((m) => usedSourceFields.add(m.sourceField));

      // Find unmapped metrics
      const mappedMetrics = new Set(componentMappings.map((m) => m.targetMetric));
      const unmapped = requiredMetrics.filter((m) => !mappedMetrics.has(m));
      allUnmappedMetrics.push(...unmapped);

      // Generate suggestions for unmapped metrics
      for (const metric of unmapped) {
        const keywords = METRIC_KEYWORDS[metric] || [metric];
        const suggestions = sourceFields
          .filter((f) => !usedSourceFields.has(f))
          .map((sourceField) => {
            const normalizedSource = sourceField.toLowerCase().replace(/[^a-z0-9]/g, '_');
            let confidence = 0;
            let reason = '';

            for (const keyword of keywords) {
              const normalizedKeyword = keyword.toLowerCase().replace(/[^a-z0-9]/g, '_');
              if (normalizedSource.includes(normalizedKeyword.substring(0, 4))) {
                confidence = 0.4;
                reason = `Partial keyword match: "${keyword}"`;
                break;
              }
            }

            return { metric, confidence, reason, sourceField };
          })
          .filter((s) => s.confidence > 0)
          .slice(0, 3);

        if (suggestions.length > 0) {
          const existing = allSuggestions.find((s) => s.sourceField === suggestions[0].sourceField);
          if (existing) {
            existing.possibleTargets.push(
              ...suggestions.map((s) => ({
                metric: s.metric,
                confidence: s.confidence,
                reason: s.reason,
              }))
            );
          } else {
            allSuggestions.push({
              sourceField: suggestions[0].sourceField,
              possibleTargets: suggestions.map((s) => ({
                metric: s.metric,
                confidence: s.confidence,
                reason: s.reason,
              })),
            });
          }
        }
      }

      mappings.push({
        id: `mapping-${plan.id}-${component.id}`,
        tenantId: plan.tenantId,
        planId: plan.id,
        componentId: component.id,
        componentName: component.name,
        requiredMetrics,
        mappings: componentMappings,
        isComplete: componentMappings.length === requiredMetrics.length,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const unmappedFields = sourceFields.filter((f) => !usedSourceFields.has(f));

  return {
    mappings,
    suggestions: allSuggestions,
    unmappedFields,
    unmappedMetrics: Array.from(new Set(allUnmappedMetrics)),
  };
}

/**
 * Build a ComponentDataMap for a tenant showing mapping status
 */
export function buildComponentDataMap(
  tenantId: string,
  sourceFields: string[]
): ComponentDataMap[] {
  const plans = getPlans(tenantId).filter((p) => p.status === 'active');
  const results: ComponentDataMap[] = [];

  for (const plan of plans) {
    const existingMappings = getPlanMappings(tenantId, plan.id);
    const autoResult = autoMapPlan(plan, sourceFields);

    // Merge existing manual mappings with auto-mappings
    const mergedComponents = autoResult.mappings.map((autoMapping) => {
      const existing = existingMappings.find(
        (e) => e.componentId === autoMapping.componentId
      );

      if (existing) {
        // Preserve manual mappings, supplement with auto
        const manualMappings = existing.mappings.filter((m) => m.mappingType === 'manual');
        const autoMappings = autoMapping.mappings.filter(
          (am) => !manualMappings.some((mm) => mm.targetMetric === am.targetMetric)
        );

        return {
          ...existing,
          mappings: [...manualMappings, ...autoMappings],
          isComplete:
            [...manualMappings, ...autoMappings].length === autoMapping.requiredMetrics.length,
        };
      }

      return autoMapping;
    });

    // Calculate completeness
    const totalRequired = mergedComponents.reduce(
      (sum, c) => sum + c.requiredMetrics.length,
      0
    );
    const totalMapped = mergedComponents.reduce(
      (sum, c) => sum + c.mappings.length,
      0
    );
    const completeness = totalRequired > 0 ? totalMapped / totalRequired : 0;

    results.push({
      tenantId,
      planId: plan.id,
      planName: plan.name,
      components: mergedComponents,
      unmappedFields: autoResult.unmappedFields,
      completeness,
    });
  }

  return results;
}

// ============================================
// METRIC RESOLUTION
// ============================================

/**
 * Resolve source data to metrics using mappings
 */
export function resolveMetrics(
  sourceData: Record<string, unknown>,
  mappings: DataComponentMapping[]
): Record<string, number> {
  const metrics: Record<string, number> = {};

  for (const componentMapping of mappings) {
    for (const mapping of componentMapping.mappings) {
      const sourceValue = sourceData[mapping.sourceField];

      if (sourceValue === undefined || sourceValue === null) continue;

      let numericValue: number;

      // Convert to number
      if (typeof sourceValue === 'number') {
        numericValue = sourceValue;
      } else if (typeof sourceValue === 'string') {
        // Handle percentage strings (e.g., "95%")
        const cleaned = sourceValue.replace(/[%,$\s]/g, '');
        numericValue = parseFloat(cleaned);
        if (isNaN(numericValue)) continue;
      } else {
        continue;
      }

      // Apply transform if specified
      if (mapping.transform) {
        switch (mapping.transform.type) {
          case 'multiply':
            numericValue *= mapping.transform.factor || 1;
            break;
          case 'divide':
            numericValue /= mapping.transform.factor || 1;
            break;
          case 'percentage':
            numericValue *= 100;
            break;
        }
      }

      metrics[mapping.targetMetric] = numericValue;
    }
  }

  return metrics;
}

/**
 * Add or update a manual mapping
 */
export function addManualMapping(
  tenantId: string,
  planId: string,
  componentId: string,
  sourceField: string,
  targetMetric: string,
  transform?: MetricMapping['transform'],
  userId?: string
): DataComponentMapping | null {
  const existingMappings = getMappings(tenantId);
  let mapping = existingMappings.find(
    (m) => m.planId === planId && m.componentId === componentId
  );

  if (!mapping) {
    // Need to create a new mapping - get component info from plan
    const plans = getPlans(tenantId);
    const plan = plans.find((p) => p.id === planId);
    if (!plan || plan.configuration.type !== 'additive_lookup') return null;

    let componentName = '';
    let requiredMetrics: string[] = [];

    for (const variant of plan.configuration.variants) {
      const component = variant.components.find((c) => c.id === componentId);
      if (component) {
        componentName = component.name;
        const metricsMap = extractRequiredMetrics(plan);
        requiredMetrics = metricsMap.get(componentId) || [];
        break;
      }
    }

    mapping = {
      id: `mapping-${planId}-${componentId}`,
      tenantId,
      planId,
      componentId,
      componentName,
      requiredMetrics,
      mappings: [],
      isComplete: false,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    };
  }

  // Add or update the mapping
  const existingIndex = mapping.mappings.findIndex(
    (m) => m.targetMetric === targetMetric
  );

  const newMapping: MetricMapping = {
    sourceField,
    targetMetric,
    mappingType: 'manual',
    confidence: 1.0,
    transform,
  };

  if (existingIndex >= 0) {
    mapping.mappings[existingIndex] = newMapping;
  } else {
    mapping.mappings.push(newMapping);
  }

  // Update completeness
  mapping.isComplete = mapping.mappings.length === mapping.requiredMetrics.length;
  mapping.updatedAt = new Date().toISOString();
  mapping.updatedBy = userId;

  return saveMapping(mapping);
}

// ============================================
// HELPERS
// ============================================

function getAllMappings(): DataComponentMapping[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Reset all mappings for a tenant
 */
export function resetTenantMappings(tenantId: string): void {
  if (typeof window === 'undefined') return;

  const allMappings = getAllMappings();
  const filtered = allMappings.filter((m) => m.tenantId !== tenantId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Get available source fields from committed data
 */
export function getAvailableSourceFields(tenantId: string): string[] {
  if (typeof window === 'undefined') return [];

  // Get tenant batch IDs first
  const batchesKey = 'data_layer_batches';
  const batchesStored = localStorage.getItem(batchesKey);

  let tenantBatchIds: string[] = [];
  if (batchesStored) {
    try {
      const batches: [string, { tenantId: string }][] = JSON.parse(batchesStored);
      tenantBatchIds = batches
        .filter(([, batch]) => batch.tenantId === tenantId)
        .map(([id]) => id);
    } catch {
      // Ignore
    }
  }

  // Try to get fields from committed records
  const committedKey = 'data_layer_committed';
  const stored = localStorage.getItem(committedKey);

  if (!stored) return [];

  try {
    const entries: [string, { importBatchId: string; content: Record<string, unknown> }][] = JSON.parse(stored);
    const fieldsSet = new Set<string>();

    for (const [, record] of entries) {
      // Filter by tenant if we have batch IDs
      if (tenantBatchIds.length > 0 && !tenantBatchIds.includes(record.importBatchId)) {
        continue;
      }

      if (record.content) {
        Object.keys(record.content).forEach((key) => fieldsSet.add(key));
      }
    }

    return Array.from(fieldsSet).sort();
  } catch {
    return [];
  }
}
