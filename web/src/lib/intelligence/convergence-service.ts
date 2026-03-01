/**
 * OB-120: Convergence Service — Surface-Driven Binding
 *
 * Matches plan requirements to data capabilities through semantic type alignment
 * and token overlap. Generates MetricDerivationRule[] for the calculation engine.
 *
 * Korean Test: Zero hardcoded field names. All field names, values, and patterns
 * discovered from runtime data sampling.
 *
 * TMR Addendum 10: Convergence as surface read — structural matching first,
 * AI disambiguation only for ambiguous cases (not implemented in v1).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetricDerivationRule } from '@/lib/calculation/run-calculation';
// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface PlanComponent {
  name: string;
  index: number;
  expectedMetrics: string[];
  calculationOp: string;
  calculationRate?: number;
}

interface DataCapability {
  dataType: string;
  rowCount: number;
  numericFields: Array<{ field: string; avg: number; nonNullCount: number }>;
  categoricalFields: Array<{ field: string; distinctValues: string[]; count: number }>;
  booleanFields: Array<{ field: string; trueValue: string; falseValue: string }>;
  // OB-128: Semantic role awareness — discovered from committed_data metadata
  semanticRoles: Record<string, string>;  // fieldName → semanticRole
  hasTargetData: boolean;                 // true if any field has 'performance_target' role
  targetField?: string;                   // field name with 'performance_target' role
}

interface BindingMatch {
  component: PlanComponent;
  dataType: string;
  matchConfidence: number;
  matchReason: string;
}

export interface ConvergenceGap {
  component: string;
  componentIndex: number;
  requiredMetrics: string[];
  calculationOp: string;
  reason: string;
  resolution: string;
}

export interface ConvergenceResult {
  derivations: MetricDerivationRule[];
  matchReport: Array<{ component: string; dataType: string; confidence: number; reason: string }>;
  signals: Array<{ domain: string; fieldName: string; semanticType: string; confidence: number }>;
  gaps: ConvergenceGap[];
}

// ──────────────────────────────────────────────
// Main Entry Point
// ──────────────────────────────────────────────

export async function convergeBindings(
  tenantId: string,
  ruleSetId: string,
  supabase: SupabaseClient
): Promise<ConvergenceResult> {
  const derivations: MetricDerivationRule[] = [];
  const matchReport: ConvergenceResult['matchReport'] = [];
  const signals: ConvergenceResult['signals'] = [];
  const gaps: ConvergenceGap[] = [];

  // 1. Fetch rule set
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('id', ruleSetId)
    .single();

  if (!ruleSet) return { derivations, matchReport, signals, gaps };

  // 2. Extract plan requirements
  const components = extractComponents(ruleSet.components);
  if (components.length === 0) return { derivations, matchReport, signals, gaps };

  // 3. Inventory data capabilities
  const capabilities = await inventoryData(tenantId, supabase);
  if (capabilities.length === 0) {
    // All components are gaps — no data at all
    for (const comp of components) {
      gaps.push({
        component: comp.name,
        componentIndex: comp.index,
        requiredMetrics: comp.expectedMetrics,
        calculationOp: comp.calculationOp,
        reason: 'No committed data found for this tenant',
        resolution: `Import data for this plan's components`,
      });
    }
    return { derivations, matchReport, signals, gaps };
  }

  // 4. Match components to data types
  const matches = matchComponentsToData(components, capabilities);

  // 5. Generate derivation rules
  for (const match of matches) {
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;

    matchReport.push({
      component: match.component.name,
      dataType: match.dataType,
      confidence: match.matchConfidence,
      reason: match.matchReason,
    });

    // Skip low-confidence matches
    if (match.matchConfidence < 0.5) continue;

    const generated = generateDerivationsForMatch(match, cap, components, matches);
    derivations.push(...generated);

    // Capture signals
    for (const d of generated) {
      signals.push({
        domain: match.dataType,
        fieldName: d.source_field || 'row_count',
        semanticType: d.operation === 'sum' ? 'amount' : 'count',
        confidence: match.matchConfidence,
      });
    }
  }

  // 5b. OB-128: Detect actuals-target pairs via semantic roles
  // When target data (performance_target) exists for a component that already
  // has an actuals derivation, generate target + ratio derivations.
  const targetCapabilities = capabilities.filter(c => c.hasTargetData);
  if (targetCapabilities.length > 0) {
    for (const targetCap of targetCapabilities) {
      // Find which component this target data matches (token overlap)
      const targetTokens = tokenize(targetCap.dataType);
      let bestCompMatch: { comp: PlanComponent; score: number } | null = null;

      for (const comp of components) {
        const compTokens = tokenize(comp.name);
        const overlap = compTokens.filter(t => targetTokens.some(d => d.includes(t) || t.includes(d)));
        const score = overlap.length / Math.max(compTokens.length, 1);
        if (score > 0.2 && (!bestCompMatch || score > bestCompMatch.score)) {
          bestCompMatch = { comp, score };
        }
      }

      if (!bestCompMatch) continue;
      const comp = bestCompMatch.comp;

      // Check if this component already has an actuals derivation
      const actualsDerivation = derivations.find(d =>
        comp.expectedMetrics.includes(d.metric) && d.operation === 'sum'
      );
      if (!actualsDerivation || !targetCap.targetField) continue;

      // OB-128: If the "actuals" derivation is from the target data_type itself
      // (standard matching picked it due to high token overlap), find the REAL
      // actuals source — a non-target data_type that matches this component
      if (actualsDerivation.source_pattern === targetCap.dataType) {
        const nonTargetCaps = capabilities.filter(c => !c.hasTargetData);
        const compTokens = tokenize(comp.name);
        let bestActualsDt = '';
        let bestActualsScore = 0;

        for (const nc of nonTargetCaps) {
          const dtTokens = tokenize(nc.dataType);
          const overlap = compTokens.filter(t => dtTokens.some(d => d.includes(t) || t.includes(d)));
          const score = overlap.length / Math.max(compTokens.length, 1);
          if (score > bestActualsScore && nc.numericFields.length > 0) {
            bestActualsScore = score;
            bestActualsDt = nc.dataType;
          }
        }

        if (bestActualsDt) {
          const actualsCap = nonTargetCaps.find(c => c.dataType === bestActualsDt);
          if (actualsCap) {
            const bestField = [...actualsCap.numericFields].sort((a, b) => b.avg - a.avg)[0];
            if (bestField) {
              actualsDerivation.source_pattern = bestActualsDt;
              actualsDerivation.source_field = bestField.field;
            }
          }
        }
      }

      const baseMetric = actualsDerivation.metric;

      // Generate target derivation: sum of target field per entity
      derivations.push({
        metric: `${baseMetric}_target`,
        operation: 'sum',
        source_pattern: targetCap.dataType,
        source_field: targetCap.targetField,
        filters: [],
      });

      // Detect scale factor from component boundaries
      // If boundaries use values > 1 (e.g., 60, 80, 100), scale ratio by 100
      const scaleFactor = detectBoundaryScale(ruleSet.components, comp.index);

      // Generate ratio derivation: actuals / target × scale
      // This MUST run after the sum derivations (array order matters)
      derivations.push({
        metric: baseMetric,
        operation: 'ratio',
        source_pattern: '',   // ratio doesn't use source_pattern
        filters: [],
        numerator_metric: `${baseMetric}_actuals`,
        denominator_metric: `${baseMetric}_target`,
        scale_factor: scaleFactor,
      });

      // Rename the existing actuals derivation (so ratio can reference it)
      actualsDerivation.metric = `${baseMetric}_actuals`;

      matchReport.push({
        component: comp.name,
        dataType: targetCap.dataType,
        confidence: bestCompMatch.score,
        reason: `Semantic role: performance_target on field "${targetCap.targetField}"`,
      });

      signals.push({
        domain: targetCap.dataType,
        fieldName: targetCap.targetField,
        semanticType: 'performance_target',
        confidence: bestCompMatch.score,
      });

      console.log(`[Convergence] OB-128: Detected actuals-target pair for "${comp.name}" — generating ratio derivation (scale=${scaleFactor})`);
    }
  }

  // 6. Detect convergence gaps — components with no matching data
  const matchedComponentIndices = new Set(matches.map(m => m.component.index));
  for (const comp of components) {
    if (matchedComponentIndices.has(comp.index)) {
      // Check if matched component still has unresolved metrics
      const compDerivations = derivations.filter(d =>
        comp.expectedMetrics.includes(d.metric)
      );
      const resolvedMetrics = new Set(compDerivations.map(d => d.metric));
      const unresolvedMetrics = comp.expectedMetrics.filter(m => !resolvedMetrics.has(m));
      if (unresolvedMetrics.length > 0) {
        gaps.push({
          component: comp.name,
          componentIndex: comp.index,
          requiredMetrics: unresolvedMetrics,
          calculationOp: comp.calculationOp,
          reason: `Matched data type but ${unresolvedMetrics.length} metric(s) could not be derived`,
          resolution: `Import data containing fields that map to: ${unresolvedMetrics.join(', ')}`,
        });
      }
    } else {
      // No matching data type at all
      const opHint = comp.calculationOp === 'ratio' || comp.calculationOp === 'bounded_lookup_1d'
        ? 'ratio/lookup-based calculation requires structured data with numerator and denominator fields'
        : `${comp.calculationOp} calculation requires matching data`;
      gaps.push({
        component: comp.name,
        componentIndex: comp.index,
        requiredMetrics: comp.expectedMetrics,
        calculationOp: comp.calculationOp,
        reason: `No matching data type found — ${opHint}`,
        resolution: comp.expectedMetrics.length > 0
          ? `Import data for metrics: ${comp.expectedMetrics.join(', ')}`
          : `Import data with a data_type matching component "${comp.name}"`,
      });
    }
  }

  console.log(`[Convergence] ${ruleSet.name}: ${derivations.length} derivations, ${gaps.length} gaps from ${matches.length} matches`);
  return { derivations, matchReport, signals, gaps };
}

// ──────────────────────────────────────────────
// Step 1: Extract Plan Components
// ──────────────────────────────────────────────

function extractComponents(componentsJson: unknown): PlanComponent[] {
  const result: PlanComponent[] = [];
  const cj = componentsJson as Record<string, unknown> | null;
  if (!cj) return result;

  const variants = (cj.variants as Array<Record<string, unknown>>) ?? [];
  const comps = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];

  for (let i = 0; i < comps.length; i++) {
    const comp = comps[i];
    if (comp.enabled === false) continue;

    const name = (comp.name || comp.id || `Component ${i}`) as string;
    const intent = comp.calculationIntent as Record<string, unknown> | undefined;
    const calcMethod = comp.calculationMethod as Record<string, unknown> | undefined;
    const tierConfig = comp.tierConfig as Record<string, unknown> | undefined;

    // Extract expected metrics from all possible sources
    const metrics: string[] = [];
    if (tierConfig?.metric) metrics.push(String(tierConfig.metric));

    if (intent) {
      const inputSpec = (intent.input as Record<string, unknown>)?.sourceSpec as Record<string, unknown> | undefined;
      if (inputSpec?.field) {
        const field = String(inputSpec.field).replace(/^metric:/, '');
        if (!metrics.includes(field)) metrics.push(field);
      }
      // For ratio sources
      if (inputSpec?.numerator) metrics.push(String(inputSpec.numerator).replace(/^metric:/, ''));
      if (inputSpec?.denominator) metrics.push(String(inputSpec.denominator).replace(/^metric:/, ''));
    }

    if (calcMethod?.metric) {
      const cm = String(calcMethod.metric);
      if (!metrics.includes(cm)) metrics.push(cm);
    }

    const op = (intent?.operation || calcMethod?.type || 'unknown') as string;
    const rate = typeof intent?.rate === 'number' ? intent.rate : undefined;

    result.push({
      name,
      index: i,
      expectedMetrics: metrics,
      calculationOp: op,
      calculationRate: rate,
    });
  }

  return result;
}

// ──────────────────────────────────────────────
// Step 2: Inventory Data Capabilities
// ──────────────────────────────────────────────

async function inventoryData(
  tenantId: string,
  supabase: SupabaseClient
): Promise<DataCapability[]> {
  const capabilities: DataCapability[] = [];

  // Get distinct data_types with counts — OB-128: also read metadata for semantic_roles
  const { data: rows } = await supabase
    .from('committed_data')
    .select('data_type, row_data, metadata')
    .eq('tenant_id', tenantId)
    .not('data_type', 'is', null)
    .limit(500);

  // OB-128: Separately fetch rows with semantic_roles (SCI-committed data)
  // These may be beyond the 500-row limit of the main query
  const { data: sciRows } = await supabase
    .from('committed_data')
    .select('data_type, row_data, metadata')
    .eq('tenant_id', tenantId)
    .not('data_type', 'is', null)
    .not('metadata->semantic_roles', 'is', null)
    .limit(50);

  // Merge SCI rows into main result set (dedup by id not needed — we group by data_type)
  const allRows = [...(rows || [])];
  if (sciRows) {
    for (const sr of sciRows) {
      // Add if this data_type isn't already represented
      const dt = sr.data_type as string;
      if (!allRows.some(r => (r.data_type as string) === dt)) {
        allRows.push(sr);
      }
    }
  }

  if (!allRows.length) return capabilities;

  // Group by data_type, keep first 30 rows per type for analysis
  const byType = new Map<string, Array<Record<string, unknown>>>();
  const countByType = new Map<string, number>();
  // OB-128: Collect semantic_roles per data_type (first non-null wins)
  const rolesByType = new Map<string, Record<string, string>>();

  for (const row of allRows) {
    const dt = row.data_type as string;
    if (!byType.has(dt)) byType.set(dt, []);
    countByType.set(dt, (countByType.get(dt) || 0) + 1);
    const samples = byType.get(dt)!;
    if (samples.length < 30) {
      const rd = row.row_data as Record<string, unknown> | null;
      if (rd) samples.push(rd);
    }
    // OB-128: Extract semantic_roles from metadata
    // SCI stores roles as either { field: "role" } or { field: { role: "...", confidence, claimedBy } }
    if (!rolesByType.has(dt)) {
      const meta = row.metadata as Record<string, unknown> | null;
      const rawRoles = meta?.semantic_roles as Record<string, unknown> | undefined;
      if (rawRoles && Object.keys(rawRoles).length > 0) {
        const normalized: Record<string, string> = {};
        for (const [field, val] of Object.entries(rawRoles)) {
          if (typeof val === 'string') {
            normalized[field] = val;
          } else if (val && typeof val === 'object' && 'role' in val) {
            normalized[field] = String((val as Record<string, unknown>).role);
          }
        }
        if (Object.keys(normalized).length > 0) {
          rolesByType.set(dt, normalized);
        }
      }
    }
  }

  for (const [dataType, samples] of Array.from(byType.entries())) {
    // OB-128: Resolve semantic roles for this data_type
    const roles = rolesByType.get(dataType) || {};
    const targetFieldEntry = Object.entries(roles).find(([, role]) => role === 'performance_target');

    const cap: DataCapability = {
      dataType,
      rowCount: countByType.get(dataType) || 0,
      numericFields: [],
      categoricalFields: [],
      booleanFields: [],
      semanticRoles: roles,
      hasTargetData: !!targetFieldEntry,
      targetField: targetFieldEntry?.[0],
    };

    if (samples.length === 0) {
      capabilities.push(cap);
      continue;
    }

    // Analyze fields from samples
    const allKeys = new Set<string>();
    for (const sample of samples) {
      for (const key of Object.keys(sample)) {
        if (!key.startsWith('_')) allKeys.add(key);
      }
    }

    for (const key of Array.from(allKeys)) {
      const values = samples.map(s => s[key]).filter(v => v !== null && v !== undefined);
      if (values.length === 0) continue;

      const numericValues = values.filter(v => typeof v === 'number') as number[];
      const stringValues = values.filter(v => typeof v === 'string') as string[];

      // Numeric field analysis
      if (numericValues.length > values.length * 0.5) {
        const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        // Skip serial date range (43000-48000) and entity IDs (small integers)
        if (avg > 100 && (avg < 43000 || avg > 48000)) {
          cap.numericFields.push({ field: key, avg, nonNullCount: numericValues.length });
        }
      }

      // Categorical field analysis (string values with limited distinct count)
      if (stringValues.length > values.length * 0.5) {
        const distinctValues = Array.from(new Set(stringValues));
        if (distinctValues.length >= 2 && distinctValues.length <= 20) {
          // Check if boolean-like (exactly 2 values)
          if (distinctValues.length === 2) {
            const lower = distinctValues.map(v => v.toLowerCase());
            const isBoolLike = lower.some(v => ['yes', 'no', 'sí', 'si', 'true', 'false', 'qualified', 'not qualified'].includes(v));
            if (isBoolLike) {
              const trueVal = distinctValues.find(v => ['yes', 'sí', 'si', 'true', 'qualified'].includes(v.toLowerCase()));
              const falseVal = distinctValues.find(v => v !== trueVal);
              cap.booleanFields.push({
                field: key,
                trueValue: trueVal || distinctValues[0],
                falseValue: falseVal || distinctValues[1],
              });
              continue;
            }
          }
          cap.categoricalFields.push({
            field: key,
            distinctValues,
            count: stringValues.length,
          });
        }
      }
    }

    capabilities.push(cap);
  }

  return capabilities;
}

// ──────────────────────────────────────────────
// Step 3: Match Components to Data Types
// ──────────────────────────────────────────────

function matchComponentsToData(
  components: PlanComponent[],
  capabilities: DataCapability[]
): BindingMatch[] {
  const matches: BindingMatch[] = [];
  const dataTypes = capabilities.map(c => c.dataType);

  for (const comp of components) {
    // OB-122: Semantic matching only — no hardcoded patterns
    // Token-based matching — component name tokens vs data_type tokens
    const compTokens = tokenize(comp.name);
    let bestDt = '';
    let bestScore = 0;

    for (const dt of dataTypes) {
      const dtTokens = tokenize(dt);
      const overlap = compTokens.filter(t => dtTokens.some(d => d.includes(t) || t.includes(d)));
      const score = overlap.length / Math.max(compTokens.length, 1);
      if (score > bestScore) {
        bestScore = score;
        bestDt = dt;
      }
    }

    if (bestDt && bestScore > 0.2) {
      matches.push({
        component: comp,
        dataType: bestDt,
        matchConfidence: Math.min(0.80, 0.4 + bestScore * 0.4),
        matchReason: `Token overlap: ${(bestScore * 100).toFixed(0)}%`,
      });
    }
  }

  return matches;
}

// ──────────────────────────────────────────────
// Step 4: Generate Derivation Rules
// ──────────────────────────────────────────────

function generateDerivationsForMatch(
  match: BindingMatch,
  capability: DataCapability,
  allComponents: PlanComponent[],
  allMatches: BindingMatch[]
): MetricDerivationRule[] {
  const rules: MetricDerivationRule[] = [];
  const comp = match.component;

  // Check if this is a shared-base pattern (multiple components → same data_type)
  const sameDataTypeMatches = allMatches.filter(m => m.dataType === match.dataType);
  const isSharedBase = sameDataTypeMatches.length > 1;

  if (isSharedBase && capability.categoricalFields.length > 0) {
    // Shared-base pattern: generate COUNT with filters per component
    return generateFilteredCountDerivations(comp, match.dataType, capability);
  }

  // Single component → single derivation
  for (const metricName of comp.expectedMetrics) {
    // Determine operation: scalar_multiply with constant rate → count, otherwise → sum
    const needsCount = comp.calculationOp === 'scalar_multiply' && comp.calculationRate !== undefined
      && comp.calculationRate > 1; // Fixed rate per unit = count-based
    const needsSum = !needsCount && capability.numericFields.length > 0;

    if (needsSum) {
      // Find the best numeric field (highest average, likely the amount field)
      const bestField = capability.numericFields.sort((a, b) => b.avg - a.avg)[0];
      if (bestField) {
        rules.push({
          metric: metricName,
          operation: 'sum',
          source_pattern: match.dataType,
          source_field: bestField.field,
          filters: [],
        });
      }
    } else if (needsCount) {
      rules.push({
        metric: metricName,
        operation: 'count',
        source_pattern: match.dataType,
        filters: [],
      });
    }
  }

  return rules;
}

/**
 * Generate COUNT derivation rules with category+boolean filters.
 * Handles the shared-base pattern: multiple components each needing
 * a count of rows filtered by category + boolean status.
 */
function generateFilteredCountDerivations(
  component: PlanComponent,
  dataType: string,
  capability: DataCapability
): MetricDerivationRule[] {
  const rules: MetricDerivationRule[] = [];

  // Extract the variant token from this component's name
  const compTokens = tokenize(component.name);

  // Find the categorical field whose values best match component name tokens
  let bestCatField: { field: string; matchedValue: string } | null = null;
  let bestCatScore = 0;

  for (const catField of capability.categoricalFields) {
    for (const value of catField.distinctValues) {
      const valueTokens = tokenize(value);
      // Check token overlap between component name and category value
      const overlap = compTokens.filter(t =>
        valueTokens.some(v => v.includes(t) || t.includes(v))
      );
      const score = overlap.length / Math.max(valueTokens.length, 1);
      if (score > bestCatScore) {
        bestCatScore = score;
        bestCatField = { field: catField.field, matchedValue: value };
      }
    }
  }

  // Fallback: try matching metric tokens against category values in each field
  if (!bestCatField || bestCatScore < 0.3) {
    // Try matching metric name tokens against category values
    for (const metricName of component.expectedMetrics) {
      const metricTokens = tokenize(metricName);
      for (const catField of capability.categoricalFields) {
        for (const value of catField.distinctValues) {
          const valueTokens = tokenize(value);
          const overlap = metricTokens.filter(t =>
            valueTokens.some(v => v.includes(t) || t.includes(v))
          );
          const score = overlap.length / Math.max(metricTokens.length, 1);
          if (score > bestCatScore) {
            bestCatScore = score;
            bestCatField = { field: catField.field, matchedValue: value };
          }
        }
      }
    }
  }

  if (!bestCatField) return rules;

  // Build the filter set
  const filters: MetricDerivationRule['filters'] = [
    { field: bestCatField.field, operator: 'eq', value: bestCatField.matchedValue },
  ];

  // Add boolean/qualified filter if available
  if (capability.booleanFields.length > 0) {
    const qualField = capability.booleanFields[0];
    filters.push({ field: qualField.field, operator: 'eq', value: qualField.trueValue });
  }

  // Generate one derivation per expected metric
  for (const metricName of component.expectedMetrics) {
    rules.push({
      metric: metricName,
      operation: 'count',
      source_pattern: dataType,
      filters,
    });
  }

  return rules;
}

// ──────────────────────────────────────────────
// OB-128: Boundary Scale Detection
// ──────────────────────────────────────────────

/**
 * Detect whether tier boundaries use percentage-scale (0-100+) or decimal-scale (0-1).
 * If boundaries have values > 1, the ratio should be scaled by 100 to match.
 * Returns 100 for percentage-scale boundaries, 1 for decimal-scale.
 */
function detectBoundaryScale(componentsJson: unknown, componentIndex: number): number {
  const cj = componentsJson as Record<string, unknown> | null;
  if (!cj) return 100; // Default: percentage scale

  const variants = (cj.variants as Array<Record<string, unknown>>) ?? [];
  const comps = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];
  const comp = comps[componentIndex];
  if (!comp) return 100;

  // Check tierConfig for boundary values
  const tierConfig = comp.tierConfig as Record<string, unknown> | undefined;
  const tiers = (tierConfig?.tiers as Array<Record<string, unknown>>) ?? [];
  for (const tier of tiers) {
    const min = tier.min as number | null;
    const max = tier.max as number | null;
    if ((min !== null && min > 1) || (max !== null && max > 1)) {
      return 100; // Boundaries in percentage form
    }
  }

  // Also check calculationIntent boundaries
  const intent = comp.calculationIntent as Record<string, unknown> | undefined;
  const boundaries = (intent?.boundaries as Array<Record<string, unknown>>) ?? [];
  for (const b of boundaries) {
    const min = b.min as number | null;
    const max = b.max as number | null;
    if ((min !== null && min > 1) || (max !== null && max > 1)) {
      return 100;
    }
  }

  return 1; // Boundaries in decimal form
}

// ──────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────

function tokenize(name: string): string[] {
  return name
    .replace(/([A-Z])/g, '_$1')  // camelCase → snake_case
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')  // Non-alphanumeric → underscore
    .split('_')
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'per', 'ins', 'cfg', 'q1', 'q2', 'q3', 'q4',
  '2024', '2025', '2026', 'plan', 'program',
]);
