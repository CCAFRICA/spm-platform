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
import { SHEET_COMPONENT_PATTERNS } from '@/lib/orchestration/metric-resolver';

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
}

interface BindingMatch {
  component: PlanComponent;
  dataType: string;
  matchConfidence: number;
  matchReason: string;
}

export interface ConvergenceResult {
  derivations: MetricDerivationRule[];
  matchReport: Array<{ component: string; dataType: string; confidence: number; reason: string }>;
  signals: Array<{ domain: string; fieldName: string; semanticType: string; confidence: number }>;
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

  // 1. Fetch rule set
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('id', ruleSetId)
    .single();

  if (!ruleSet) return { derivations, matchReport, signals };

  // 2. Extract plan requirements
  const components = extractComponents(ruleSet.components);
  if (components.length === 0) return { derivations, matchReport, signals };

  // 3. Inventory data capabilities
  const capabilities = await inventoryData(tenantId, supabase);
  if (capabilities.length === 0) return { derivations, matchReport, signals };

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

  console.log(`[Convergence] ${ruleSet.name}: ${derivations.length} derivations from ${matches.length} matches`);
  return { derivations, matchReport, signals };
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

  // Get distinct data_types with counts
  const { data: rows } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .not('data_type', 'is', null)
    .limit(500);

  if (!rows?.length) return capabilities;

  // Group by data_type, keep first 30 rows per type for analysis
  const byType = new Map<string, Array<Record<string, unknown>>>();
  const countByType = new Map<string, number>();

  for (const row of rows) {
    const dt = row.data_type as string;
    if (!byType.has(dt)) byType.set(dt, []);
    countByType.set(dt, (countByType.get(dt) || 0) + 1);
    const samples = byType.get(dt)!;
    if (samples.length < 30) {
      const rd = row.row_data as Record<string, unknown> | null;
      if (rd) samples.push(rd);
    }
  }

  for (const [dataType, samples] of Array.from(byType.entries())) {
    const cap: DataCapability = {
      dataType,
      rowCount: countByType.get(dataType) || 0,
      numericFields: [],
      categoricalFields: [],
      booleanFields: [],
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
    // Tier 1: Try SHEET_COMPONENT_PATTERNS (existing infrastructure)
    let matched = false;
    for (const pattern of SHEET_COMPONENT_PATTERNS) {
      const compMatch = pattern.componentPatterns.some(p => p.test(comp.name));
      if (compMatch) {
        for (const dt of dataTypes) {
          const dtMatch = pattern.sheetPatterns.some(p => p.test(dt));
          if (dtMatch) {
            matches.push({
              component: comp,
              dataType: dt,
              matchConfidence: 0.85,
              matchReason: 'SHEET_COMPONENT_PATTERNS match',
            });
            matched = true;
            break;
          }
        }
      }
      if (matched) break;
    }
    if (matched) continue;

    // Tier 2: Token-based matching — component name tokens vs data_type tokens
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
