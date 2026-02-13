/**
 * Comparison Depth Assessment Engine
 *
 * OB-38 Phase 4: Adaptive Depth Reconciliation (TMR Addendum 4)
 *
 * Given two datasets (VL calculations and a ground-truth/comparison file),
 * this engine assesses what comparison layers are possible and at what depth.
 *
 * COMPARISON LAYERS (deepest to shallowest):
 *   L0 Aggregate  -- Total payout across all employees
 *   L1 Employee   -- Per-employee totals
 *   L2 Component  -- Per-employee per-component breakdowns
 *   L3 Metric     -- Individual metric values per component
 *   L4 Store      -- Store-level groupings (if data supports it)
 *
 * PRINCIPLES:
 *   - Compare at every layer the data supports
 *   - Discover common ground between two independent datasets
 *   - False greens (matching total, mismatched components) are highest priority
 *   - No hardcoded field names (Korean Test)
 */

import type { CalculationResult } from '@/types/compensation-plan';
import type { ColumnMapping } from './ai-column-mapper';

// ============================================
// TYPES
// ============================================

export type ComparisonLayer = 'aggregate' | 'employee' | 'component' | 'metric' | 'store';

export type LayerStatus = 'available' | 'partial' | 'unavailable';

export interface LayerAssessment {
  layer: ComparisonLayer;
  status: LayerStatus;
  depth: number;           // 0-100 confidence that this layer comparison is meaningful
  fieldCount: number;      // Number of comparable fields at this layer
  coveragePercent: number; // What % of records have data at this layer
  notes: string[];         // Human-readable assessment notes
}

export interface DepthAssessment {
  maxDepth: ComparisonLayer;       // Deepest layer with meaningful comparison
  layers: LayerAssessment[];       // Assessment for each layer
  recommendations: string[];       // What the user should do next
  falseGreenRisk: 'low' | 'medium' | 'high'; // Risk of totals matching but components not
  dataQuality: {
    vlRecordCount: number;
    fileRecordCount: number;
    matchableRecords: number;      // Records that can be matched by employee ID
    unmatchedVL: number;
    unmatchedFile: number;
  };
}

export interface DepthAssessmentInput {
  vlResults: CalculationResult[];
  fileRows: Record<string, unknown>[];
  mappings: ColumnMapping[];
  employeeIdField: string;
  totalAmountField: string;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Assess comparison depth between VL results and uploaded file.
 * Returns a layer-by-layer assessment of what comparisons are possible.
 */
export function assessComparisonDepth(input: DepthAssessmentInput): DepthAssessment {
  const { vlResults, fileRows, mappings, employeeIdField, totalAmountField } = input;

  // Build employee ID lookup from file
  const fileEmployeeIds = new Set<string>();
  for (const row of fileRows) {
    const id = normalizeId(String(row[employeeIdField] || ''));
    if (id) fileEmployeeIds.add(id);
  }

  // Build employee ID lookup from VL
  const vlEmployeeIds = new Set<string>();
  for (const r of vlResults) {
    const id = normalizeId(r.employeeId);
    if (id) vlEmployeeIds.add(id);
  }

  // Calculate matchable records
  const matchable = new Set<string>();
  Array.from(fileEmployeeIds).forEach(id => {
    if (vlEmployeeIds.has(id)) matchable.add(id);
  });

  const dataQuality = {
    vlRecordCount: vlResults.length,
    fileRecordCount: fileRows.length,
    matchableRecords: matchable.size,
    unmatchedVL: vlEmployeeIds.size - matchable.size,
    unmatchedFile: fileEmployeeIds.size - matchable.size,
  };

  // Assess each layer
  const layers: LayerAssessment[] = [
    assessAggregateLayer(vlResults, fileRows, totalAmountField),
    assessEmployeeLayer(vlResults, fileRows, employeeIdField, totalAmountField, matchable),
    assessComponentLayer(vlResults, fileRows, mappings, matchable),
    assessMetricLayer(vlResults),
    assessStoreLayer(vlResults, fileRows, mappings),
  ];

  // Determine max depth
  const maxDepth = determineMaxDepth(layers);

  // Assess false green risk
  const falseGreenRisk = assessFalseGreenRisk(vlResults, fileRows, totalAmountField, matchable, mappings);

  // Generate recommendations
  const recommendations = generateRecommendations(layers, dataQuality, falseGreenRisk);

  return {
    maxDepth,
    layers,
    recommendations,
    falseGreenRisk,
    dataQuality,
  };
}

// ============================================
// LAYER ASSESSMENTS
// ============================================

function assessAggregateLayer(
  vlResults: CalculationResult[],
  fileRows: Record<string, unknown>[],
  totalAmountField: string,
): LayerAssessment {
  const notes: string[] = [];

  const vlTotal = vlResults.reduce((sum, r) => sum + (r.totalIncentive || 0), 0);
  const fileTotal = fileRows.reduce((sum, row) => {
    const val = parseFloat(String(row[totalAmountField] || '0'));
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const hasVL = vlResults.length > 0 && vlTotal > 0;
  const hasFile = fileRows.length > 0;
  const hasFileTotal = fileTotal > 0;

  if (hasVL) notes.push(`VL total: ${vlResults.length} employees`);
  if (hasFile) notes.push(`File: ${fileRows.length} rows`);
  if (hasFileTotal) notes.push(`File total amount field detected`);

  const status: LayerStatus = hasVL && hasFileTotal ? 'available' : (hasVL || hasFileTotal ? 'partial' : 'unavailable');

  return {
    layer: 'aggregate',
    status,
    depth: status === 'available' ? 100 : (status === 'partial' ? 50 : 0),
    fieldCount: (hasVL ? 1 : 0) + (hasFileTotal ? 1 : 0),
    coveragePercent: 100,
    notes,
  };
}

function assessEmployeeLayer(
  vlResults: CalculationResult[],
  fileRows: Record<string, unknown>[],
  employeeIdField: string,
  totalAmountField: string,
  matchable: Set<string>,
): LayerAssessment {
  const notes: string[] = [];

  const fileHasEmployeeIds = fileRows.some(row => {
    const id = String(row[employeeIdField] || '').trim();
    return id.length > 0;
  });

  const vlHasEmployeeIds = vlResults.some(r => r.employeeId && r.employeeId.trim().length > 0);

  const matchRate = Math.max(vlResults.length, fileRows.length) > 0
    ? (matchable.size / Math.max(vlResults.length, fileRows.length)) * 100
    : 0;

  notes.push(`Match rate: ${matchable.size}/${Math.max(vlResults.length, fileRows.length)} (${Math.round(matchRate)}%)`);
  if (matchRate < 50) notes.push('Low match rate -- check employee ID format');
  if (matchRate >= 90) notes.push('High match rate -- employee comparison reliable');

  const fileHasTotals = fileRows.some(row => {
    const val = parseFloat(String(row[totalAmountField] || ''));
    return !isNaN(val) && val > 0;
  });

  let status: LayerStatus = 'unavailable';
  if (fileHasEmployeeIds && vlHasEmployeeIds && fileHasTotals && matchable.size > 0) {
    status = matchRate >= 70 ? 'available' : 'partial';
  } else if (fileHasEmployeeIds && vlHasEmployeeIds) {
    status = 'partial';
  }

  return {
    layer: 'employee',
    status,
    depth: Math.round(matchRate),
    fieldCount: (fileHasEmployeeIds ? 1 : 0) + (fileHasTotals ? 1 : 0),
    coveragePercent: Math.round(matchRate),
    notes,
  };
}

function assessComponentLayer(
  vlResults: CalculationResult[],
  fileRows: Record<string, unknown>[],
  mappings: ColumnMapping[],
  matchable: Set<string>,
): LayerAssessment {
  const notes: string[] = [];

  // Check if VL results have component breakdowns
  const vlHasComponents = vlResults.some(r =>
    r.components && r.components.length > 0
  );

  // Check if file mappings include component columns
  const componentMappings = mappings.filter(m =>
    m.mappedTo.startsWith('component:')
  );

  const fileHasComponents = componentMappings.length > 0;

  if (vlHasComponents) {
    const componentNames = new Set<string>();
    for (const r of vlResults) {
      if (r.components) {
        for (const c of r.components) {
          componentNames.add(c.componentName || c.componentId);
        }
      }
    }
    notes.push(`VL has ${componentNames.size} unique components`);
  }

  if (fileHasComponents) {
    notes.push(`File has ${componentMappings.length} component columns mapped`);
  }

  let status: LayerStatus = 'unavailable';
  let depth = 0;
  let coveragePercent = 0;

  if (vlHasComponents && fileHasComponents && matchable.size > 0) {
    status = 'available';
    // Depth based on how many VL components have matching file columns
    const vlComponentIds = new Set<string>();
    for (const r of vlResults) {
      if (r.components) {
        for (const c of r.components) {
          vlComponentIds.add(c.componentId);
        }
      }
    }
    const mappedComponentIds = new Set(componentMappings.map(m => m.mappedTo.replace('component:', '')));
    const overlap = Array.from(vlComponentIds).filter(id => mappedComponentIds.has(id)).length;
    depth = vlComponentIds.size > 0 ? Math.round((overlap / vlComponentIds.size) * 100) : 0;
    coveragePercent = depth;
    notes.push(`${overlap}/${vlComponentIds.size} components mappable`);
  } else if (vlHasComponents || fileHasComponents) {
    status = 'partial';
    depth = 30;
    coveragePercent = 30;
    notes.push('Only one side has component data');
  }

  return {
    layer: 'component',
    status,
    depth,
    fieldCount: componentMappings.length,
    coveragePercent,
    notes,
  };
}

function assessMetricLayer(vlResults: CalculationResult[]): LayerAssessment {
  const notes: string[] = [];

  // Check if VL results include metric-level detail via inputs or sourceData
  const hasInputMetrics = vlResults.some(r =>
    r.components?.some(c =>
      c.inputs && (c.inputs.actual > 0 || c.inputs.target > 0)
    )
  );

  const hasSourceData = vlResults.some(r =>
    r.components?.some(c =>
      c.sourceData && c.sourceData.columns && Object.keys(c.sourceData.columns).length > 0
    )
  );

  if (hasInputMetrics) {
    // Count unique metric types from inputs across all components
    const metricTypes = new Set<string>();
    for (const r of vlResults) {
      if (r.components) {
        for (const c of r.components) {
          if (c.inputs) {
            if (c.inputs.actual > 0) metricTypes.add(`${c.componentName}:actual`);
            if (c.inputs.target > 0) metricTypes.add(`${c.componentName}:target`);
            if (c.inputs.additionalFactors) {
              for (const key of Object.keys(c.inputs.additionalFactors)) {
                metricTypes.add(`${c.componentName}:${key}`);
              }
            }
          }
        }
      }
    }
    notes.push(`VL has ${metricTypes.size} unique metrics across components`);
  }

  if (hasSourceData) {
    notes.push('VL results include data source tracing (sheet, column references)');
  }

  if (!hasInputMetrics && !hasSourceData) {
    notes.push('VL results do not include metric-level detail');
  } else {
    notes.push('Metric-level comparison requires ground-truth metric data');
  }

  const hasMetrics = hasInputMetrics || hasSourceData;
  return {
    layer: 'metric',
    status: hasMetrics ? 'partial' : 'unavailable',
    depth: hasMetrics ? 20 : 0,
    fieldCount: 0,
    coveragePercent: 0,
    notes,
  };
}

function assessStoreLayer(
  vlResults: CalculationResult[],
  fileRows: Record<string, unknown>[],
  mappings: ColumnMapping[],
): LayerAssessment {
  const notes: string[] = [];

  // Check if VL results have store IDs
  const vlHasStores = vlResults.some(r => r.storeId && r.storeId.trim().length > 0);

  // Check if file has store column mapped
  const storeMappings = mappings.filter(m =>
    m.mappedTo === 'store_id' || m.mappedTo === 'location' || m.mappedTo === 'store'
  );
  const fileHasStores = storeMappings.length > 0 || fileRows.some(row => {
    // Check common store column names
    return row['store'] || row['store_id'] || row['storeId'] || row['location'] || row['tienda'];
  });

  if (vlHasStores) {
    const storeIds = new Set(vlResults.map(r => r.storeId).filter(Boolean));
    notes.push(`VL has ${storeIds.size} unique stores`);
  }

  if (fileHasStores) {
    notes.push('File has store-level data');
  }

  let status: LayerStatus = 'unavailable';
  let depth = 0;

  if (vlHasStores && fileHasStores) {
    status = 'available';
    depth = 80;
    notes.push('Store-level grouping and comparison available');
  } else if (vlHasStores || fileHasStores) {
    status = 'partial';
    depth = 30;
    notes.push('Only one side has store data');
  }

  return {
    layer: 'store',
    status,
    depth,
    fieldCount: storeMappings.length,
    coveragePercent: depth,
    notes,
  };
}

// ============================================
// FALSE GREEN DETECTION
// ============================================

/**
 * Assess the risk of false greens: totals match but components diverge.
 * This is the highest-priority signal in reconciliation.
 */
function assessFalseGreenRisk(
  vlResults: CalculationResult[],
  fileRows: Record<string, unknown>[],
  totalAmountField: string,
  matchable: Set<string>,
  mappings: ColumnMapping[],
): 'low' | 'medium' | 'high' {
  // No component data = cannot detect false greens = high risk
  const vlHasComponents = vlResults.some(r =>
    r.components && r.components.length > 1
  );
  const componentMappings = mappings.filter(m => m.mappedTo.startsWith('component:'));
  const fileHasComponents = componentMappings.length > 0;

  if (!vlHasComponents || !fileHasComponents) {
    // If totals look similar but we have no component data, risk is high
    const vlTotal = vlResults.reduce((sum, r) => sum + (r.totalIncentive || 0), 0);
    const fileTotal = fileRows.reduce((sum, row) => {
      const val = parseFloat(String(row[totalAmountField] || '0'));
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    if (vlTotal > 0 && fileTotal > 0) {
      const diff = Math.abs(vlTotal - fileTotal) / Math.max(vlTotal, fileTotal);
      // Totals are close but no component breakdown = high false green risk
      if (diff < 0.05) return 'high';
      if (diff < 0.15) return 'medium';
    }
    return 'medium';
  }

  // Have both component data sources -- false green risk is lower
  if (matchable.size > 0) {
    return 'low';
  }

  return 'medium';
}

// ============================================
// RECOMMENDATIONS
// ============================================

function generateRecommendations(
  layers: LayerAssessment[],
  dataQuality: DepthAssessment['dataQuality'],
  falseGreenRisk: 'low' | 'medium' | 'high',
): string[] {
  const recs: string[] = [];

  // Population quality
  if (dataQuality.unmatchedFile > dataQuality.matchableRecords * 0.2) {
    recs.push(
      `${dataQuality.unmatchedFile} file records could not be matched to VL employees. ` +
      `Check employee ID format consistency.`
    );
  }

  if (dataQuality.unmatchedVL > dataQuality.matchableRecords * 0.2) {
    recs.push(
      `${dataQuality.unmatchedVL} VL employees have no matching file record. ` +
      `Ensure the file covers all employees in the calculation.`
    );
  }

  // False green warning
  if (falseGreenRisk === 'high') {
    recs.push(
      'WARNING: Totals appear to match but no component-level comparison is possible. ' +
      'Map individual component columns to verify the breakdown matches.'
    );
  } else if (falseGreenRisk === 'medium') {
    recs.push(
      'Component-level data is limited. Consider mapping additional component columns ' +
      'to ensure totals are not masking offsetting errors.'
    );
  }

  // Layer-specific recommendations
  const componentLayer = layers.find(l => l.layer === 'component');
  if (componentLayer?.status === 'unavailable') {
    recs.push(
      'No component-level comparison available. Map file columns to plan components ' +
      'for deeper reconciliation.'
    );
  } else if (componentLayer?.status === 'partial') {
    recs.push(
      'Partial component mapping. Additional columns may be mappable to VL components.'
    );
  }

  const storeLayer = layers.find(l => l.layer === 'store');
  if (storeLayer?.status === 'available') {
    recs.push(
      'Store-level grouping is available. Review per-store totals for location-specific discrepancies.'
    );
  }

  if (recs.length === 0) {
    recs.push('Full-depth comparison available across all layers.');
  }

  return recs;
}

// ============================================
// HELPERS
// ============================================

function determineMaxDepth(layers: LayerAssessment[]): ComparisonLayer {
  // Walk from deepest to shallowest, return first available/partial
  const layerOrder: ComparisonLayer[] = ['metric', 'store', 'component', 'employee', 'aggregate'];
  for (const layer of layerOrder) {
    const assessment = layers.find(l => l.layer === layer);
    if (assessment && assessment.status === 'available' && assessment.depth >= 50) {
      return layer;
    }
  }
  // Fall back to shallowest available
  for (const layer of [...layerOrder].reverse()) {
    const assessment = layers.find(l => l.layer === layer);
    if (assessment && assessment.status !== 'unavailable') {
      return layer;
    }
  }
  return 'aggregate';
}

function normalizeId(id: string): string {
  return id.trim().replace(/^0+/, '').toLowerCase();
}
