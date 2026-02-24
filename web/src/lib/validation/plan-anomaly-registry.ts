/**
 * OB-91 Mission 1: Plan Anomaly Detection Engine
 *
 * Pure-function validators that scan AdditiveLookupConfig for structural,
 * cross-variant, and completeness anomalies. No side effects, no network calls.
 *
 * Each detector receives config and returns PlanAnomaly[].
 * Registry runs all applicable detectors and aggregates results.
 */

import type {
  AdditiveLookupConfig,
  PlanVariant,
  PlanComponent,
  Band,
} from '@/types/compensation-plan';

// ============================================
// TYPES
// ============================================

export type AnomalyCategory = 'structural' | 'cross_variant' | 'completeness';

export interface PlanAnomaly {
  id: string;               // "S-01", "V-02", etc.
  type: AnomalyCategory;
  severity: 'critical' | 'warning' | 'info';
  component: string;
  variant?: string;
  location: string;          // "Row 4, Column 3"
  extractedValue: number;
  expectedRange?: [number, number];
  explanation: string;
  neighborContext: Record<string, number>;
  suggestions: string[];
}

export interface PlanValidationResult {
  anomalies: PlanAnomaly[];
  totalChecks: number;
  passedChecks: number;
  components: number;
  valuesParsed: number;
}

// ============================================
// STRUCTURAL DETECTORS (S-01 – S-09)
// ============================================

/**
 * S-01: Row Monotonicity
 * In a matrix, each column should be non-decreasing top-to-bottom
 * (higher attainment rows yield >= payout).
 */
function detectRowMonotonicity(
  component: PlanComponent,
  variant: PlanVariant,
): PlanAnomaly[] {
  const matrix = component.matrixConfig;
  if (!matrix || component.componentType !== 'matrix_lookup') return [];

  const anomalies: PlanAnomaly[] = [];
  const { values, rowBands, columnBands } = matrix;

  for (let c = 0; c < (columnBands?.length ?? 0); c++) {
    for (let r = 1; r < (rowBands?.length ?? 0); r++) {
      const current = values?.[r]?.[c];
      const previous = values?.[r - 1]?.[c];
      if (current == null || previous == null) continue;
      if (current < previous) {
        anomalies.push({
          id: 'S-01',
          type: 'structural',
          severity: 'warning',
          component: component.name,
          variant: variant.variantName,
          location: `Row ${r + 1}, Column ${c + 1}`,
          extractedValue: current,
          expectedRange: [previous, Infinity],
          explanation: `Row monotonicity violation: ${formatCurrency(current)} at row ${r + 1} is less than ${formatCurrency(previous)} at row ${r}. Higher attainment rows should yield equal or greater payouts.`,
          neighborContext: {
            [`[${r - 1}][${c}]`]: previous,
            [`[${r}][${c}]`]: current,
          },
          suggestions: [
            `Verify value at Row ${r + 1}, Column ${c + 1} — expected >= ${formatCurrency(previous)}`,
            'Check if row order matches ascending attainment bands',
          ],
        });
      }
    }
  }
  return anomalies;
}

/**
 * S-02: Column Monotonicity
 * In a matrix, each row should be non-decreasing left-to-right
 * (higher volume columns yield >= payout).
 */
function detectColumnMonotonicity(
  component: PlanComponent,
  variant: PlanVariant,
): PlanAnomaly[] {
  const matrix = component.matrixConfig;
  if (!matrix || component.componentType !== 'matrix_lookup') return [];

  const anomalies: PlanAnomaly[] = [];
  const { values, rowBands, columnBands } = matrix;

  for (let r = 0; r < (rowBands?.length ?? 0); r++) {
    for (let c = 1; c < (columnBands?.length ?? 0); c++) {
      const current = values?.[r]?.[c];
      const previous = values?.[r]?.[c - 1];
      if (current == null || previous == null) continue;
      if (current < previous) {
        anomalies.push({
          id: 'S-02',
          type: 'structural',
          severity: 'warning',
          component: component.name,
          variant: variant.variantName,
          location: `Row ${r + 1}, Column ${c + 1}`,
          extractedValue: current,
          expectedRange: [previous, Infinity],
          explanation: `Column monotonicity violation: ${formatCurrency(current)} at column ${c + 1} is less than ${formatCurrency(previous)} at column ${c}. Higher volume columns should yield equal or greater payouts.`,
          neighborContext: {
            [`[${r}][${c - 1}]`]: previous,
            [`[${r}][${c}]`]: current,
          },
          suggestions: [
            `Verify value at Row ${r + 1}, Column ${c + 1} — expected >= ${formatCurrency(previous)}`,
            'Check if column order matches ascending volume bands',
          ],
        });
      }
    }
  }
  return anomalies;
}

/**
 * S-03: Magnitude Outlier
 * A cell deviates >2x from its neighbor interpolation (critical at >5x).
 */
function detectMagnitudeOutlier(
  component: PlanComponent,
  variant: PlanVariant,
): PlanAnomaly[] {
  const matrix = component.matrixConfig;
  if (!matrix || component.componentType !== 'matrix_lookup') return [];

  const anomalies: PlanAnomaly[] = [];
  const { values, rowBands, columnBands } = matrix;
  const rows = rowBands?.length ?? 0;
  const cols = columnBands?.length ?? 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = values?.[r]?.[c];
      if (val == null || val === 0) continue;

      // Collect adjacent neighbors
      const neighbors: number[] = [];
      if (r > 0 && values?.[r - 1]?.[c] != null) neighbors.push(values[r - 1][c]);
      if (r < rows - 1 && values?.[r + 1]?.[c] != null) neighbors.push(values[r + 1][c]);
      if (c > 0 && values?.[r]?.[c - 1] != null) neighbors.push(values[r][c - 1]);
      if (c < cols - 1 && values?.[r]?.[c + 1] != null) neighbors.push(values[r][c + 1]);

      if (neighbors.length < 2) continue;

      const avgNeighbor = neighbors.reduce((s, n) => s + n, 0) / neighbors.length;
      if (avgNeighbor === 0) continue;

      const ratio = val / avgNeighbor;
      const inverseRatio = avgNeighbor / val;
      const deviationRatio = Math.max(ratio, inverseRatio);

      if (deviationRatio > 2) {
        const neighborContext: Record<string, number> = {};
        if (r > 0 && values?.[r - 1]?.[c] != null) neighborContext[`above[${r - 1}][${c}]`] = values[r - 1][c];
        if (r < rows - 1 && values?.[r + 1]?.[c] != null) neighborContext[`below[${r + 1}][${c}]`] = values[r + 1][c];
        if (c > 0 && values?.[r]?.[c - 1] != null) neighborContext[`left[${r}][${c - 1}]`] = values[r][c - 1];
        if (c < cols - 1 && values?.[r]?.[c + 1] != null) neighborContext[`right[${r}][${c + 1}]`] = values[r][c + 1];

        anomalies.push({
          id: 'S-03',
          type: 'structural',
          severity: deviationRatio > 5 ? 'critical' : 'warning',
          component: component.name,
          variant: variant.variantName,
          location: `Row ${r + 1}, Column ${c + 1}`,
          extractedValue: val,
          expectedRange: [avgNeighbor / 2, avgNeighbor * 2],
          explanation: `Magnitude outlier: ${formatCurrency(val)} deviates ${deviationRatio.toFixed(1)}x from neighbor average ${formatCurrency(avgNeighbor)}.${deviationRatio > 5 ? ' CRITICAL: >5x deviation suggests extraction error.' : ''}`,
          neighborContext,
          suggestions: [
            `Check if ${formatCurrency(val)} was correctly extracted from the plan document`,
            `Expected range based on neighbors: ${formatCurrency(avgNeighbor / 2)} – ${formatCurrency(avgNeighbor * 2)}`,
          ],
        });
      }
    }
  }
  return anomalies;
}

/**
 * S-04: Zero in Active Region
 * A matrix cell is 0 where row > 0 AND column > 0 (non-floor region).
 */
function detectZeroInActiveRegion(
  component: PlanComponent,
  variant: PlanVariant,
): PlanAnomaly[] {
  const matrix = component.matrixConfig;
  if (!matrix || component.componentType !== 'matrix_lookup') return [];

  const anomalies: PlanAnomaly[] = [];
  const { values, rowBands, columnBands } = matrix;

  for (let r = 1; r < (rowBands?.length ?? 0); r++) {
    for (let c = 1; c < (columnBands?.length ?? 0); c++) {
      const val = values?.[r]?.[c];
      if (val === 0) {
        anomalies.push({
          id: 'S-04',
          type: 'structural',
          severity: 'warning',
          component: component.name,
          variant: variant.variantName,
          location: `Row ${r + 1}, Column ${c + 1}`,
          extractedValue: 0,
          explanation: `Zero value in active matrix region (row ${r + 1}, column ${c + 1}). Non-floor cells typically have positive payouts.`,
          neighborContext: buildNeighborContext(values, r, c, rowBands?.length ?? 0, columnBands?.length ?? 0),
          suggestions: [
            'Verify this zero is intentional and not a missing/failed extraction',
            'Check the original plan document at this position',
          ],
        });
      }
    }
  }
  return anomalies;
}

/**
 * S-05: Non-Zero in Floor
 * The [0][0] cell (lowest attainment, lowest volume) should typically be 0.
 */
function detectNonZeroFloor(
  component: PlanComponent,
  variant: PlanVariant,
): PlanAnomaly[] {
  const matrix = component.matrixConfig;
  if (!matrix || component.componentType !== 'matrix_lookup') return [];

  const val = matrix.values?.[0]?.[0];
  if (val != null && val !== 0) {
    return [{
      id: 'S-05',
      type: 'structural',
      severity: 'info',
      component: component.name,
      variant: variant.variantName,
      location: 'Row 1, Column 1',
      extractedValue: val,
      explanation: `Floor cell [1][1] is ${formatCurrency(val)} instead of $0. The lowest attainment/volume band usually pays $0.`,
      neighborContext: { '[0][0]': val },
      suggestions: [
        'Confirm whether the lowest band has a guaranteed minimum payout',
      ],
    }];
  }
  return [];
}

/**
 * S-06: Threshold Gap
 * Tier bands have a meaningful gap between one band's max and the next band's min.
 */
function detectThresholdGap(
  component: PlanComponent,
  variant: PlanVariant,
): PlanAnomaly[] {
  const anomalies: PlanAnomaly[] = [];

  // Check tier config
  if (component.componentType === 'tier_lookup' && component.tierConfig) {
    const tiers = component.tierConfig.tiers;
    for (let i = 0; i < tiers.length - 1; i++) {
      const current = tiers[i];
      const next = tiers[i + 1];
      if (current.max !== Infinity && next.min > current.max) {
        const gap = next.min - current.max;
        anomalies.push({
          id: 'S-06',
          type: 'structural',
          severity: 'warning',
          component: component.name,
          variant: variant.variantName,
          location: `Tier ${i + 1} → Tier ${i + 2}`,
          extractedValue: gap,
          explanation: `Gap in tier thresholds: Tier ${i + 1} ends at ${current.max} but Tier ${i + 2} starts at ${next.min}. Values in [${current.max}, ${next.min}) fall into no tier.`,
          neighborContext: {
            [`tier_${i + 1}_max`]: current.max,
            [`tier_${i + 2}_min`]: next.min,
          },
          suggestions: [
            `Adjust Tier ${i + 1} max to ${next.min} or Tier ${i + 2} min to ${current.max}`,
          ],
        });
      }
    }
  }

  // Check matrix band gaps
  if (component.componentType === 'matrix_lookup' && component.matrixConfig) {
    anomalies.push(...detectBandGaps(component.matrixConfig.rowBands, 'Row', component.name, variant.variantName));
    anomalies.push(...detectBandGaps(component.matrixConfig.columnBands, 'Column', component.name, variant.variantName));
  }

  return anomalies;
}

function detectBandGaps(bands: Band[], axis: string, componentName: string, variantName: string): PlanAnomaly[] {
  const anomalies: PlanAnomaly[] = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const current = bands[i];
    const next = bands[i + 1];
    if (current.max !== Infinity && next.min > current.max) {
      const gap = next.min - current.max;
      anomalies.push({
        id: 'S-06',
        type: 'structural',
        severity: 'warning',
        component: componentName,
        variant: variantName,
        location: `${axis} Band ${i + 1} → ${axis} Band ${i + 2}`,
        extractedValue: gap,
        explanation: `Gap in ${axis.toLowerCase()} bands: Band ${i + 1} ends at ${current.max} but Band ${i + 2} starts at ${next.min}.`,
        neighborContext: {
          [`band_${i + 1}_max`]: current.max,
          [`band_${i + 2}_min`]: next.min,
        },
        suggestions: [
          `Close the gap by adjusting Band ${i + 1} max or Band ${i + 2} min`,
        ],
      });
    }
  }
  return anomalies;
}

/**
 * S-07: Threshold Overlap
 * Tier/band ranges overlap (one max > next min).
 */
function detectThresholdOverlap(
  component: PlanComponent,
  variant: PlanVariant,
): PlanAnomaly[] {
  const anomalies: PlanAnomaly[] = [];

  // Check tier config
  if (component.componentType === 'tier_lookup' && component.tierConfig) {
    const tiers = component.tierConfig.tiers;
    for (let i = 0; i < tiers.length - 1; i++) {
      const current = tiers[i];
      const next = tiers[i + 1];
      if (current.max !== Infinity && current.max > next.min) {
        anomalies.push({
          id: 'S-07',
          type: 'structural',
          severity: 'warning',
          component: component.name,
          variant: variant.variantName,
          location: `Tier ${i + 1} → Tier ${i + 2}`,
          extractedValue: current.max - next.min,
          explanation: `Threshold overlap: Tier ${i + 1} max (${current.max}) exceeds Tier ${i + 2} min (${next.min}). Overlapping range assigns ambiguous tier.`,
          neighborContext: {
            [`tier_${i + 1}_max`]: current.max,
            [`tier_${i + 2}_min`]: next.min,
          },
          suggestions: [
            `Adjust boundaries so Tier ${i + 1} max <= Tier ${i + 2} min`,
          ],
        });
      }
    }
  }

  // Check matrix band overlaps
  if (component.componentType === 'matrix_lookup' && component.matrixConfig) {
    anomalies.push(...detectBandOverlaps(component.matrixConfig.rowBands, 'Row', component.name, variant.variantName));
    anomalies.push(...detectBandOverlaps(component.matrixConfig.columnBands, 'Column', component.name, variant.variantName));
  }

  return anomalies;
}

function detectBandOverlaps(bands: Band[], axis: string, componentName: string, variantName: string): PlanAnomaly[] {
  const anomalies: PlanAnomaly[] = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const current = bands[i];
    const next = bands[i + 1];
    if (current.max !== Infinity && current.max > next.min) {
      anomalies.push({
        id: 'S-07',
        type: 'structural',
        severity: 'warning',
        component: componentName,
        variant: variantName,
        location: `${axis} Band ${i + 1} → ${axis} Band ${i + 2}`,
        extractedValue: current.max - next.min,
        explanation: `${axis} band overlap: Band ${i + 1} max (${current.max}) > Band ${i + 2} min (${next.min}).`,
        neighborContext: {
          [`band_${i + 1}_max`]: current.max,
          [`band_${i + 2}_min`]: next.min,
        },
        suggestions: [
          `Adjust ${axis.toLowerCase()} band boundaries to eliminate overlap`,
        ],
      });
    }
  }
  return anomalies;
}

/**
 * S-08: Boundary Ambiguity
 * Band max equals next band min (unclear which band a boundary value falls into).
 */
function detectBoundaryAmbiguity(
  component: PlanComponent,
  variant: PlanVariant,
): PlanAnomaly[] {
  const anomalies: PlanAnomaly[] = [];

  const checkBands = (bands: Band[], label: string) => {
    for (let i = 0; i < bands.length - 1; i++) {
      const current = bands[i];
      const next = bands[i + 1];
      if (current.max !== Infinity && current.max === next.min) {
        anomalies.push({
          id: 'S-08',
          type: 'structural',
          severity: 'info',
          component: component.name,
          variant: variant.variantName,
          location: `${label} Band ${i + 1} → Band ${i + 2}`,
          extractedValue: current.max,
          explanation: `Boundary ambiguity: ${label} Band ${i + 1} max and Band ${i + 2} min are both ${current.max}. Unclear which band captures this exact value.`,
          neighborContext: {
            [`band_${i + 1}_max`]: current.max,
            [`band_${i + 2}_min`]: next.min,
          },
          suggestions: [
            'Clarify whether boundaries are inclusive or exclusive',
          ],
        });
      }
    }
  };

  if (component.componentType === 'tier_lookup' && component.tierConfig) {
    const tiers = component.tierConfig.tiers;
    const asBands: Band[] = tiers.map(t => ({ min: t.min, max: t.max, label: t.label }));
    checkBands(asBands, 'Tier');
  }

  if (component.componentType === 'matrix_lookup' && component.matrixConfig) {
    checkBands(component.matrixConfig.rowBands, 'Row');
    checkBands(component.matrixConfig.columnBands, 'Column');
  }

  return anomalies;
}

/**
 * S-09: Inconsistent Convention
 * Different components use different boundary styles (some have gaps, some overlap, some are exact).
 */
function detectInconsistentConvention(
  config: AdditiveLookupConfig,
): PlanAnomaly[] {
  const conventions: Map<string, 'gap' | 'overlap' | 'exact' | 'mixed'> = new Map();

  for (const variant of config.variants) {
    for (const comp of variant.components) {
      if (!comp.enabled) continue;
      const bands = getAllBands(comp);
      if (bands.length < 2) continue;

      let hasGap = false;
      let hasOverlap = false;
      let hasExact = false;

      for (let i = 0; i < bands.length - 1; i++) {
        if (bands[i].max === Infinity) continue;
        if (bands[i].max < bands[i + 1].min) hasGap = true;
        else if (bands[i].max > bands[i + 1].min) hasOverlap = true;
        else hasExact = true;
      }

      const convention = (hasGap && hasOverlap) || (hasGap && hasExact && hasOverlap)
        ? 'mixed'
        : hasGap ? 'gap' : hasOverlap ? 'overlap' : 'exact';
      conventions.set(comp.name, convention);
    }
  }

  const uniqueConventions = new Set(Array.from(conventions.values()));
  if (uniqueConventions.size > 1) {
    const breakdown = Array.from(conventions.entries())
      .map(([name, conv]) => `${name}: ${conv}`)
      .join(', ');
    return [{
      id: 'S-09',
      type: 'structural',
      severity: 'info',
      component: '(all)',
      location: 'Cross-component',
      extractedValue: uniqueConventions.size,
      explanation: `Inconsistent boundary conventions across components: ${breakdown}. Consider standardizing.`,
      neighborContext: Object.fromEntries(Array.from(conventions.entries()).map(([k, v]) => [k, v === 'gap' ? 1 : v === 'overlap' ? 2 : v === 'exact' ? 3 : 0])),
      suggestions: [
        'Standardize boundary conventions across all components (inclusive/exclusive)',
      ],
    }];
  }
  return [];
}

// ============================================
// CROSS-VARIANT DETECTORS (V-01 – V-03)
// ============================================

/**
 * V-01: Structural Mismatch
 * Same-name matrix across variants differ in dimensions.
 */
function detectStructuralMismatch(
  config: AdditiveLookupConfig,
): PlanAnomaly[] {
  if (config.variants.length < 2) return [];

  const anomalies: PlanAnomaly[] = [];
  const compDims: Map<string, { variant: string; rows: number; cols: number }[]> = new Map();

  for (const variant of config.variants) {
    for (const comp of variant.components) {
      if (comp.componentType !== 'matrix_lookup' || !comp.matrixConfig) continue;
      const key = comp.name;
      const existing = compDims.get(key) || [];
      existing.push({
        variant: variant.variantName,
        rows: comp.matrixConfig.rowBands.length,
        cols: comp.matrixConfig.columnBands.length,
      });
      compDims.set(key, existing);
    }
  }

  for (const [compName, dims] of Array.from(compDims.entries())) {
    if (dims.length < 2) continue;
    const first = dims[0];
    for (let i = 1; i < dims.length; i++) {
      if (dims[i].rows !== first.rows || dims[i].cols !== first.cols) {
        anomalies.push({
          id: 'V-01',
          type: 'cross_variant',
          severity: 'warning',
          component: compName,
          location: `${first.variant} vs ${dims[i].variant}`,
          extractedValue: 0,
          explanation: `Matrix dimension mismatch: "${compName}" is ${first.rows}x${first.cols} in ${first.variant} but ${dims[i].rows}x${dims[i].cols} in ${dims[i].variant}.`,
          neighborContext: {
            [`${first.variant}_rows`]: first.rows,
            [`${first.variant}_cols`]: first.cols,
            [`${dims[i].variant}_rows`]: dims[i].rows,
            [`${dims[i].variant}_cols`]: dims[i].cols,
          },
          suggestions: [
            'Verify both variants use the same matrix structure',
          ],
        });
      }
    }
  }
  return anomalies;
}

/**
 * V-02: Ratio Break
 * If 80%+ of cells maintain a consistent ratio between variants,
 * flag the outliers that deviate >50%.
 */
function detectRatioBreak(
  config: AdditiveLookupConfig,
): PlanAnomaly[] {
  if (config.variants.length < 2) return [];

  const anomalies: PlanAnomaly[] = [];
  const primary = config.variants[0];

  for (let vi = 1; vi < config.variants.length; vi++) {
    const secondary = config.variants[vi];

    for (const pComp of primary.components) {
      if (pComp.componentType !== 'matrix_lookup' || !pComp.matrixConfig) continue;
      const sComp = secondary.components.find(c => c.name === pComp.name);
      if (!sComp?.matrixConfig) continue;

      const pValues = pComp.matrixConfig.values;
      const sValues = sComp.matrixConfig.values;
      const rows = Math.min(pValues.length, sValues.length);

      // Collect ratios for all cells
      const ratios: { r: number; c: number; ratio: number; pVal: number; sVal: number }[] = [];
      for (let r = 0; r < rows; r++) {
        const cols = Math.min(pValues[r]?.length ?? 0, sValues[r]?.length ?? 0);
        for (let c = 0; c < cols; c++) {
          const pVal = pValues[r][c];
          const sVal = sValues[r][c];
          if (pVal > 0 && sVal > 0) {
            ratios.push({ r, c, ratio: sVal / pVal, pVal, sVal });
          }
        }
      }

      if (ratios.length < 4) continue;

      // Find median ratio
      const sortedRatios = ratios.map(r => r.ratio).sort((a, b) => a - b);
      const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];

      // Find outliers (>50% deviation from median)
      const outliers = ratios.filter(r => Math.abs(r.ratio - medianRatio) / medianRatio > 0.5);
      const consistentCount = ratios.length - outliers.length;

      if (consistentCount / ratios.length >= 0.8 && outliers.length > 0) {
        for (const outlier of outliers) {
          anomalies.push({
            id: 'V-02',
            type: 'cross_variant',
            severity: 'warning',
            component: pComp.name,
            location: `Row ${outlier.r + 1}, Column ${outlier.c + 1}`,
            extractedValue: outlier.sVal,
            expectedRange: [outlier.pVal * medianRatio * 0.5, outlier.pVal * medianRatio * 1.5],
            explanation: `Cross-variant ratio break: ${secondary.variantName} has ${formatCurrency(outlier.sVal)} vs ${primary.variantName} ${formatCurrency(outlier.pVal)} (ratio ${outlier.ratio.toFixed(2)}). Median ratio is ${medianRatio.toFixed(2)}.`,
            neighborContext: {
              [`${primary.variantName}`]: outlier.pVal,
              [`${secondary.variantName}`]: outlier.sVal,
              medianRatio,
            },
            suggestions: [
              `Expected ~${formatCurrency(outlier.pVal * medianRatio)} based on median ratio`,
            ],
          });
        }
      }
    }
  }
  return anomalies;
}

/**
 * V-03: Value Exceeds Primary
 * A secondary variant cell exceeds the primary variant at the same position.
 */
function detectValueExceedsPrimary(
  config: AdditiveLookupConfig,
): PlanAnomaly[] {
  if (config.variants.length < 2) return [];

  const anomalies: PlanAnomaly[] = [];
  const primary = config.variants[0];

  for (let vi = 1; vi < config.variants.length; vi++) {
    const secondary = config.variants[vi];

    for (const pComp of primary.components) {
      if (pComp.componentType !== 'matrix_lookup' || !pComp.matrixConfig) continue;
      const sComp = secondary.components.find(c => c.name === pComp.name);
      if (!sComp?.matrixConfig) continue;

      const pValues = pComp.matrixConfig.values;
      const sValues = sComp.matrixConfig.values;
      const rows = Math.min(pValues.length, sValues.length);

      for (let r = 0; r < rows; r++) {
        const cols = Math.min(pValues[r]?.length ?? 0, sValues[r]?.length ?? 0);
        for (let c = 0; c < cols; c++) {
          const pVal = pValues[r][c];
          const sVal = sValues[r][c];
          if (sVal > pVal && pVal > 0) {
            anomalies.push({
              id: 'V-03',
              type: 'cross_variant',
              severity: 'info',
              component: pComp.name,
              variant: secondary.variantName,
              location: `Row ${r + 1}, Column ${c + 1}`,
              extractedValue: sVal,
              expectedRange: [0, pVal],
              explanation: `${secondary.variantName} payout ${formatCurrency(sVal)} exceeds ${primary.variantName} ${formatCurrency(pVal)} at same position. Secondary variants typically pay equal or less.`,
              neighborContext: {
                [`${primary.variantName}`]: pVal,
                [`${secondary.variantName}`]: sVal,
              },
              suggestions: [
                `Verify whether ${secondary.variantName} intentionally pays more than ${primary.variantName} here`,
              ],
            });
          }
        }
      }
    }
  }
  return anomalies;
}

// ============================================
// COMPLETENESS DETECTORS (X-01, X-04)
// ============================================

/**
 * X-01: Missing Data Binding
 * Component has no metric source configured.
 */
function detectMissingDataBinding(
  component: PlanComponent,
  variant: PlanVariant,
): PlanAnomaly[] {
  const hasBinding =
    (component.componentType === 'matrix_lookup' && component.matrixConfig?.rowMetric) ||
    (component.componentType === 'tier_lookup' && component.tierConfig?.metric) ||
    (component.componentType === 'percentage' && component.percentageConfig?.appliedTo) ||
    (component.componentType === 'conditional_percentage' && component.conditionalConfig?.appliedTo);

  if (!hasBinding) {
    return [{
      id: 'X-01',
      type: 'completeness',
      severity: 'warning',
      component: component.name,
      variant: variant.variantName,
      location: 'Metric binding',
      extractedValue: 0,
      explanation: `Component "${component.name}" has no metric source configured. The calculation engine needs metric bindings to resolve data.`,
      neighborContext: {},
      suggestions: [
        'Ensure the component has a metric source (e.g., rowMetric for matrix, metric for tier)',
      ],
    }];
  }
  return [];
}

/**
 * X-04: Partial Matrix
 * Matrix values[][] has null/undefined/NaN, or dimensions mismatch band counts.
 */
function detectPartialMatrix(
  component: PlanComponent,
  variant: PlanVariant,
): PlanAnomaly[] {
  const matrix = component.matrixConfig;
  if (!matrix || component.componentType !== 'matrix_lookup') return [];

  const anomalies: PlanAnomaly[] = [];
  const expectedRows = matrix.rowBands.length;
  const expectedCols = matrix.columnBands.length;
  const actualRows = matrix.values?.length ?? 0;

  // Check dimension mismatch
  if (actualRows !== expectedRows) {
    anomalies.push({
      id: 'X-04',
      type: 'completeness',
      severity: 'critical',
      component: component.name,
      variant: variant.variantName,
      location: 'Matrix dimensions',
      extractedValue: actualRows,
      expectedRange: [expectedRows, expectedRows],
      explanation: `Matrix has ${actualRows} rows but ${expectedRows} row bands. Dimension mismatch will cause lookup failures.`,
      neighborContext: { expectedRows, actualRows },
      suggestions: [
        'Ensure values[][] dimensions match band counts exactly',
      ],
    });
  }

  // Check for missing/invalid cells
  for (let r = 0; r < actualRows; r++) {
    const rowLen = matrix.values[r]?.length ?? 0;
    if (rowLen !== expectedCols) {
      anomalies.push({
        id: 'X-04',
        type: 'completeness',
        severity: 'critical',
        component: component.name,
        variant: variant.variantName,
        location: `Row ${r + 1}`,
        extractedValue: rowLen,
        expectedRange: [expectedCols, expectedCols],
        explanation: `Matrix row ${r + 1} has ${rowLen} columns but expected ${expectedCols}.`,
        neighborContext: { expectedCols, actualCols: rowLen },
        suggestions: [
          `Add missing values to row ${r + 1}`,
        ],
      });
    }

    for (let c = 0; c < rowLen; c++) {
      const val = matrix.values[r][c];
      if (val == null || Number.isNaN(val)) {
        anomalies.push({
          id: 'X-04',
          type: 'completeness',
          severity: 'critical',
          component: component.name,
          variant: variant.variantName,
          location: `Row ${r + 1}, Column ${c + 1}`,
          extractedValue: 0,
          explanation: `Missing or invalid value at matrix position [${r + 1}][${c + 1}].`,
          neighborContext: buildNeighborContext(matrix.values, r, c, actualRows, rowLen),
          suggestions: [
            'Fill in the missing value from the plan document',
          ],
        });
      }
    }
  }

  return anomalies;
}

// ============================================
// REGISTRY: Run all detectors
// ============================================

type ComponentDetector = (component: PlanComponent, variant: PlanVariant) => PlanAnomaly[];
type ConfigDetector = (config: AdditiveLookupConfig) => PlanAnomaly[];

const COMPONENT_DETECTORS: ComponentDetector[] = [
  detectRowMonotonicity,       // S-01
  detectColumnMonotonicity,    // S-02
  detectMagnitudeOutlier,      // S-03
  detectZeroInActiveRegion,    // S-04
  detectNonZeroFloor,          // S-05
  detectThresholdGap,          // S-06
  detectThresholdOverlap,      // S-07
  detectBoundaryAmbiguity,     // S-08
  detectMissingDataBinding,    // X-01
  detectPartialMatrix,         // X-04
];

const CONFIG_DETECTORS: ConfigDetector[] = [
  detectInconsistentConvention, // S-09
  detectStructuralMismatch,     // V-01
  detectRatioBreak,             // V-02
  detectValueExceedsPrimary,    // V-03
];

/**
 * Run all anomaly detectors against an AdditiveLookupConfig.
 * Returns a PlanValidationResult with all found anomalies and check counts.
 */
export function validatePlanConfig(config: AdditiveLookupConfig): PlanValidationResult {
  const anomalies: PlanAnomaly[] = [];
  let totalChecks = 0;
  let componentCount = 0;
  let valuesParsed = 0;

  // Per-component detectors
  for (const variant of config.variants) {
    for (const component of variant.components) {
      if (!component.enabled) continue;
      componentCount++;

      // Count parsed values
      if (component.matrixConfig?.values) {
        for (const row of component.matrixConfig.values) {
          valuesParsed += row?.length ?? 0;
        }
      }
      if (component.tierConfig?.tiers) {
        valuesParsed += component.tierConfig.tiers.length;
      }

      for (const detector of COMPONENT_DETECTORS) {
        totalChecks++;
        const found = detector(component, variant);
        anomalies.push(...found);
      }
    }
  }

  // Config-level detectors
  for (const detector of CONFIG_DETECTORS) {
    totalChecks++;
    const found = detector(config);
    anomalies.push(...found);
  }

  const passedChecks = totalChecks - countFailedChecks(anomalies);

  return {
    anomalies,
    totalChecks,
    passedChecks,
    components: componentCount,
    valuesParsed,
  };
}

/**
 * Get anomalies for a specific component.
 */
export function getAnomaliesForComponent(
  result: PlanValidationResult,
  componentName: string,
): PlanAnomaly[] {
  return result.anomalies.filter(a => a.component === componentName);
}

/**
 * Check if there are unresolved critical anomalies.
 */
export function hasUnresolvedCriticals(
  result: PlanValidationResult,
  resolvedIds: Set<string>,
): boolean {
  return result.anomalies.some(
    a => a.severity === 'critical' && !resolvedIds.has(anomalyKey(a))
  );
}

/**
 * Generate a unique key for an anomaly instance (for tracking resolved state).
 */
export function anomalyKey(anomaly: PlanAnomaly): string {
  return `${anomaly.id}:${anomaly.component}:${anomaly.location}`;
}

// ============================================
// HELPERS
// ============================================

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function buildNeighborContext(
  values: number[][],
  r: number,
  c: number,
  rows: number,
  cols: number,
): Record<string, number> {
  const ctx: Record<string, number> = {};
  if (r > 0 && values?.[r - 1]?.[c] != null) ctx[`above[${r - 1}][${c}]`] = values[r - 1][c];
  if (r < rows - 1 && values?.[r + 1]?.[c] != null) ctx[`below[${r + 1}][${c}]`] = values[r + 1][c];
  if (c > 0 && values?.[r]?.[c - 1] != null) ctx[`left[${r}][${c - 1}]`] = values[r][c - 1];
  if (c < cols - 1 && values?.[r]?.[c + 1] != null) ctx[`right[${r}][${c + 1}]`] = values[r][c + 1];
  return ctx;
}

function getAllBands(component: PlanComponent): Band[] {
  if (component.componentType === 'tier_lookup' && component.tierConfig) {
    return component.tierConfig.tiers.map(t => ({ min: t.min, max: t.max, label: t.label }));
  }
  if (component.componentType === 'matrix_lookup' && component.matrixConfig) {
    return [...component.matrixConfig.rowBands, ...component.matrixConfig.columnBands];
  }
  return [];
}

function countFailedChecks(anomalies: PlanAnomaly[]): number {
  // Count unique detector IDs that found issues
  const failedDetectors = new Set(anomalies.map(a => a.id));
  return failedDetectors.size;
}
