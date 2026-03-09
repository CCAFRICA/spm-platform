/**
 * OB-120/OB-162: Convergence Service — Field Identity Binding (Decision 111)
 *
 * Matches plan requirements to data capabilities through field identity matching
 * and token overlap. Generates MetricDerivationRule[] for the calculation engine
 * AND per-component input_bindings for Decision 111 convergence.
 *
 * Korean Test: Zero hardcoded field names. All field names, values, and patterns
 * discovered from runtime data sampling and HC field identities.
 *
 * OB-162 3-pass matching:
 *   Pass 1: Structural match — find batches with required structuralTypes
 *   Pass 2: Contextual match — use contextualIdentity to disambiguate
 *   Pass 3: Token overlap fallback — legacy matching for data without field identities
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetricDerivationRule } from '@/lib/calculation/run-calculation';
import type { FieldIdentity } from '@/lib/sci/sci-types';
import { getAIService } from '@/lib/ai';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface PlanComponent {
  name: string;
  index: number;
  expectedMetrics: string[];
  calculationOp: string;
  calculationRate?: number;
  // HF-111: Carry raw calculationIntent for boundary extraction
  calculationIntent?: Record<string, unknown>;
}

// HF-111: Per-column value statistics for boundary matching
interface ColumnValueStats {
  min: number;
  max: number;
  mean: number;
  sampleCount: number;
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
  // OB-162: Field identity awareness (Decision 111)
  fieldIdentities: Record<string, FieldIdentity>;  // columnName → FieldIdentity
  batchIds: string[];                               // import_batch_ids for this data_type
  // HF-111: Per-column value distributions for boundary matching
  columnStats: Record<string, ColumnValueStats>;    // columnName → value stats
}

// OB-162: Per-component convergence binding (Decision 111)
export interface ComponentBinding {
  source_batch_id: string;
  column: string;
  field_identity: FieldIdentity;
  match_pass: number;  // 1=structural/boundary, 2=contextual/AI, 3=token
  confidence: number;
  // HF-111: Scale factor for percentage columns (e.g., 100 when column is 0-1 ratio but boundary is 0-100)
  scale_factor?: number;
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
  referenceDataAvailable?: boolean;
}

export interface ConvergenceResult {
  derivations: MetricDerivationRule[];
  matchReport: Array<{ component: string; dataType: string; confidence: number; reason: string }>;
  signals: Array<{ domain: string; fieldName: string; semanticType: string; confidence: number }>;
  gaps: ConvergenceGap[];
  // OB-162: Per-component input bindings (Decision 111)
  componentBindings: Record<string, Record<string, ComponentBinding>>;
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
  const componentBindings: Record<string, Record<string, ComponentBinding>> = {};

  // 1. Fetch rule set
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('id', ruleSetId)
    .single();

  if (!ruleSet) return { derivations, matchReport, signals, gaps, componentBindings };

  // 2. Extract plan requirements
  const components = extractComponents(ruleSet.components);
  if (components.length === 0) return { derivations, matchReport, signals, gaps, componentBindings };

  // 3. Inventory data capabilities (OB-162: includes field identities)
  const capabilities = await inventoryData(tenantId, supabase);
  if (capabilities.length === 0) {
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
    return { derivations, matchReport, signals, gaps, componentBindings };
  }

  // 4. OB-162: 3-pass matching — field identities first, token overlap fallback
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

    if (match.matchConfidence < 0.5) continue;

    const generated = generateDerivationsForMatch(match, cap, components, matches);
    derivations.push(...generated);

    for (const d of generated) {
      signals.push({
        domain: match.dataType,
        fieldName: d.source_field || 'row_count',
        semanticType: d.operation === 'sum' ? 'amount' : 'count',
        confidence: match.matchConfidence,
      });
    }

    // Note: per-component bindings generated in bulk below (HF-111)
  }

  // HF-112: Generate all component bindings with AI mapping + boundary validation
  const existingConvergenceBindings = (ruleSet.input_bindings as Record<string, unknown>)?.convergence_bindings as
    Record<string, Record<string, unknown>> | undefined;
  await generateAllComponentBindings(components, matches, capabilities, componentBindings, existingConvergenceBindings);

  // 5b. OB-128: Detect actuals-target pairs via semantic roles
  const targetCapabilities = capabilities.filter(c => c.hasTargetData);
  if (targetCapabilities.length > 0) {
    for (const targetCap of targetCapabilities) {
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

      const actualsDerivation = derivations.find(d =>
        comp.expectedMetrics.includes(d.metric) && d.operation === 'sum'
      );
      if (!actualsDerivation || !targetCap.targetField) continue;

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

      derivations.push({
        metric: `${baseMetric}_target`,
        operation: 'sum',
        source_pattern: targetCap.dataType,
        source_field: targetCap.targetField,
        filters: [],
      });

      const scaleFactor = detectBoundaryScale(ruleSet.components, comp.index);

      derivations.push({
        metric: baseMetric,
        operation: 'ratio',
        source_pattern: '',
        filters: [],
        numerator_metric: `${baseMetric}_actuals`,
        denominator_metric: `${baseMetric}_target`,
        scale_factor: scaleFactor,
      });

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

      // OB-162: Add target binding to component bindings
      const compKey = `component_${comp.index}`;
      if (!componentBindings[compKey]) componentBindings[compKey] = {};
      if (targetCap.batchIds.length > 0) {
        const targetFI = targetCap.fieldIdentities[targetCap.targetField];
        componentBindings[compKey]['target'] = {
          source_batch_id: targetCap.batchIds[0],
          column: targetCap.targetField,
          field_identity: targetFI || { structuralType: 'measure', contextualIdentity: 'performance_target', confidence: 0.7 },
          match_pass: 2,
          confidence: bestCompMatch.score,
        };
      }

      console.log(`[Convergence] OB-128: Detected actuals-target pair for "${comp.name}" — generating ratio derivation (scale=${scaleFactor})`);
    }
  }

  // 6. Detect convergence gaps
  // OB-162: No longer check reference_data (deprecated) — all data in committed_data
  const matchedComponentIndices = new Set(matches.map(m => m.component.index));
  for (const comp of components) {
    if (matchedComponentIndices.has(comp.index)) {
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

  console.log(`[Convergence] ${ruleSet.name}: ${derivations.length} derivations, ${gaps.length} gaps, ${Object.keys(componentBindings).length} component bindings`);
  return { derivations, matchReport, signals, gaps, componentBindings };
}

// ──────────────────────────────────────────────
// Step 1: Extract Plan Components
// ──────────────────────────────────────────────

function extractComponents(componentsJson: unknown): PlanComponent[] {
  const result: PlanComponent[] = [];
  if (!componentsJson) return result;

  // HF-110: Handle both formats (FP-49 — verify structure before assuming)
  // Format 1: { variants: [{ variantId: "...", components: [...] }] }
  // Format 2: Direct array of components [{ name: "...", ... }]
  let comps: Array<Record<string, unknown>> = [];

  if (Array.isArray(componentsJson)) {
    // Direct array of components
    comps = componentsJson as Array<Record<string, unknown>>;
  } else if (typeof componentsJson === 'object') {
    const cj = componentsJson as Record<string, unknown>;
    const variants = cj.variants as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(variants) && variants.length > 0) {
      // Variant structure — use first variant (all share same structural pattern)
      comps = (variants[0].components as Array<Record<string, unknown>>) ?? [];
    }
  }

  for (let i = 0; i < comps.length; i++) {
    const comp = comps[i];
    if (comp.enabled === false) continue;

    const name = (comp.name || comp.id || `Component ${i}`) as string;
    const intent = comp.calculationIntent as Record<string, unknown> | undefined;
    const calcMethod = comp.calculationMethod as Record<string, unknown> | undefined;
    const tierConfig = comp.tierConfig as Record<string, unknown> | undefined;

    const metrics: string[] = [];
    if (tierConfig?.metric) metrics.push(String(tierConfig.metric));

    if (intent) {
      // Handle both 'input' (singular) and 'inputs' (plural) structures
      const inputSpec = (intent.input as Record<string, unknown>)?.sourceSpec as Record<string, unknown> | undefined;
      if (inputSpec?.field) {
        const field = String(inputSpec.field).replace(/^metric:/, '');
        if (!metrics.includes(field)) metrics.push(field);
      }
      if (inputSpec?.numerator) metrics.push(String(inputSpec.numerator).replace(/^metric:/, ''));
      if (inputSpec?.denominator) metrics.push(String(inputSpec.denominator).replace(/^metric:/, ''));

      // 'inputs' plural — multiple named inputs (e.g., { row: { source: "metric", sourceSpec: { field: "..." } } })
      const inputs = intent.inputs as Record<string, Record<string, unknown>> | undefined;
      if (inputs) {
        for (const inputEntry of Object.values(inputs)) {
          const spec = inputEntry?.sourceSpec as Record<string, unknown> | undefined;
          if (spec?.field) {
            const field = String(spec.field).replace(/^metric:/, '');
            if (!metrics.includes(field)) metrics.push(field);
          }
        }
      }
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
      // HF-111: Carry raw calculationIntent for boundary extraction
      calculationIntent: intent || undefined,
    });
  }

  return result;
}

// ──────────────────────────────────────────────
// Step 2: Inventory Data Capabilities
// OB-162: Enhanced with field identity extraction
// ──────────────────────────────────────────────

async function inventoryData(
  tenantId: string,
  supabase: SupabaseClient
): Promise<DataCapability[]> {
  const capabilities: DataCapability[] = [];

  // OB-162: Also read import_batch_id for convergence bindings
  const { data: rows } = await supabase
    .from('committed_data')
    .select('data_type, row_data, metadata, import_batch_id')
    .eq('tenant_id', tenantId)
    .not('data_type', 'is', null)
    .limit(500);

  // OB-128: Separately fetch rows with semantic_roles (SCI-committed data)
  const { data: sciRows } = await supabase
    .from('committed_data')
    .select('data_type, row_data, metadata, import_batch_id')
    .eq('tenant_id', tenantId)
    .not('data_type', 'is', null)
    .not('metadata->semantic_roles', 'is', null)
    .limit(50);

  const allRows = [...(rows || [])];
  if (sciRows) {
    for (const sr of sciRows) {
      const dt = sr.data_type as string;
      if (!allRows.some(r => (r.data_type as string) === dt)) {
        allRows.push(sr);
      }
    }
  }

  if (!allRows.length) return capabilities;

  // Group by data_type
  const byType = new Map<string, Array<Record<string, unknown>>>();
  const countByType = new Map<string, number>();
  const rolesByType = new Map<string, Record<string, string>>();
  // OB-162: Collect field identities and batch IDs per data_type
  const fieldIdentitiesByType = new Map<string, Record<string, FieldIdentity>>();
  const batchIdsByType = new Map<string, Set<string>>();

  for (const row of allRows) {
    const dt = row.data_type as string;
    if (!byType.has(dt)) byType.set(dt, []);
    countByType.set(dt, (countByType.get(dt) || 0) + 1);
    const samples = byType.get(dt)!;
    if (samples.length < 30) {
      const rd = row.row_data as Record<string, unknown> | null;
      if (rd) samples.push(rd);
    }

    // Collect batch IDs
    const batchId = row.import_batch_id as string | null;
    if (batchId) {
      if (!batchIdsByType.has(dt)) batchIdsByType.set(dt, new Set());
      batchIdsByType.get(dt)!.add(batchId);
    }

    // Extract semantic_roles from metadata
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

      // OB-162: Extract field_identities from metadata (Decision 111)
      const fieldIds = meta?.field_identities as Record<string, { structuralType?: string; contextualIdentity?: string; confidence?: number }> | undefined;
      if (fieldIds && Object.keys(fieldIds).length > 0) {
        const identities: Record<string, FieldIdentity> = {};
        for (const [colName, fi] of Object.entries(fieldIds)) {
          identities[colName] = {
            structuralType: (fi.structuralType || 'unknown') as FieldIdentity['structuralType'],
            contextualIdentity: fi.contextualIdentity || 'unknown',
            confidence: typeof fi.confidence === 'number' ? fi.confidence : 0.5,
          };
        }
        fieldIdentitiesByType.set(dt, identities);
      }
    }
  }

  for (const [dataType, samples] of Array.from(byType.entries())) {
    const roles = rolesByType.get(dataType) || {};
    const targetFieldEntry = Object.entries(roles).find(([, role]) => role === 'performance_target');
    const fieldIdentities = fieldIdentitiesByType.get(dataType) || {};
    const batchIds = Array.from(batchIdsByType.get(dataType) || new Set<string>());

    const cap: DataCapability = {
      dataType,
      rowCount: countByType.get(dataType) || 0,
      numericFields: [],
      categoricalFields: [],
      booleanFields: [],
      semanticRoles: roles,
      hasTargetData: !!targetFieldEntry,
      targetField: targetFieldEntry?.[0],
      fieldIdentities,
      batchIds,
      columnStats: {},
    };

    if (samples.length === 0) {
      capabilities.push(cap);
      continue;
    }

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

      if (numericValues.length > values.length * 0.5) {
        const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        if (avg > 100 && (avg < 43000 || avg > 48000)) {
          cap.numericFields.push({ field: key, avg, nonNullCount: numericValues.length });
        }
        // HF-111: Collect per-column value stats for boundary matching
        // Include ALL numeric columns (not just the filtered ones above)
        const minVal = Math.min(...numericValues);
        const maxVal = Math.max(...numericValues);
        cap.columnStats[key] = { min: minVal, max: maxVal, mean: avg, sampleCount: numericValues.length };
      }

      // HF-111: Also parse numeric strings (e.g., "0.85", "265625")
      if (numericValues.length <= values.length * 0.5 && stringValues.length > 0) {
        const parsedNums: number[] = [];
        for (const sv of stringValues) {
          const p = parseFloat(sv.replace(/[,$\s]/g, ''));
          if (!isNaN(p)) parsedNums.push(p);
        }
        if (parsedNums.length > values.length * 0.5) {
          const avg = parsedNums.reduce((a, b) => a + b, 0) / parsedNums.length;
          cap.columnStats[key] = {
            min: Math.min(...parsedNums),
            max: Math.max(...parsedNums),
            mean: avg,
            sampleCount: parsedNums.length,
          };
        }
      }

      if (stringValues.length > values.length * 0.5) {
        const distinctValues = Array.from(new Set(stringValues));
        if (distinctValues.length >= 2 && distinctValues.length <= 20) {
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
// OB-162: 3-pass matching — field identities → contextual → token overlap
// ──────────────────────────────────────────────

function matchComponentsToData(
  components: PlanComponent[],
  capabilities: DataCapability[]
): BindingMatch[] {
  const matches: BindingMatch[] = [];
  const matchedComponents = new Set<number>();

  // OB-162 Pass 1+2: Field identity matching
  // Find capabilities that have field identities with measure columns
  const capsWithFI = capabilities.filter(c => Object.keys(c.fieldIdentities).length > 0);

  if (capsWithFI.length > 0) {
    for (const comp of components) {
      if (matchedComponents.has(comp.index)) continue;

      // Pass 1: Structural match — capability must have a 'measure' structuralType
      const structuralCandidates = capsWithFI.filter(cap => {
        const hasMeasure = Object.values(cap.fieldIdentities).some(fi => fi.structuralType === 'measure');
        const hasIdentifier = Object.values(cap.fieldIdentities).some(fi => fi.structuralType === 'identifier');
        return hasMeasure && hasIdentifier;
      });

      if (structuralCandidates.length === 0) continue;

      // HF-109 Pass 2: Structural co-location — disambiguate by component structural pattern (DS-009 4.2)
      // Uses measure count + contextual type diversity, NOT token overlap with component names
      const requiredMeasures = getRequiredMeasureCount(comp.calculationOp);

      let bestMatch: { cap: DataCapability; score: number; reason: string } | null = null;

      for (const cap of structuralCandidates) {
        let score = 0;
        const reasons: string[] = [];

        // Count measure columns in this capability
        const measureFIs = Object.entries(cap.fieldIdentities)
          .filter(([, fi]) => fi.structuralType === 'measure');
        const measureCount = measureFIs.length;

        // Does the batch have the right number of measures for this component?
        if (measureCount >= requiredMeasures) {
          score += 0.5;
          reasons.push(`${measureCount} measures (need ${requiredMeasures})`);
        }

        // Does the batch have a temporal column?
        const hasTemporal = Object.values(cap.fieldIdentities)
          .some(fi => fi.structuralType === 'temporal');
        if (hasTemporal) {
          score += 0.25;
          reasons.push('has temporal');
        }

        // For ratio/2D components needing 2+ measures: check contextual type diversity
        // (e.g., one currency_amount and one percentage — likely actual + target pair)
        if (requiredMeasures >= 2 && measureCount >= 2) {
          const contextualTypes = new Set(measureFIs.map(([, fi]) => fi.contextualIdentity));
          if (contextualTypes.size >= 2) {
            score += 0.25;
            reasons.push('diverse measure types');
          }
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { cap, score, reason: reasons.join(', ') };
        }
      }

      if (bestMatch && bestMatch.score > 0.3) {
        matches.push({
          component: comp,
          dataType: bestMatch.cap.dataType,
          matchConfidence: Math.min(0.90, 0.4 + bestMatch.score * 0.5),
          matchReason: `HF-109 structural: ${bestMatch.reason}`,
        });
        matchedComponents.add(comp.index);
      }
    }
  }

  // Pass 3: Token overlap fallback for unmatched components
  const dataTypes = capabilities.map(c => c.dataType);
  for (const comp of components) {
    if (matchedComponents.has(comp.index)) continue;

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

  const sameDataTypeMatches = allMatches.filter(m => m.dataType === match.dataType);
  const isSharedBase = sameDataTypeMatches.length > 1;

  if (isSharedBase && capability.categoricalFields.length > 0) {
    return generateFilteredCountDerivations(comp, match.dataType, capability);
  }

  for (const metricName of comp.expectedMetrics) {
    const needsCount = comp.calculationOp === 'scalar_multiply' && comp.calculationRate !== undefined
      && comp.calculationRate > 1;
    const needsSum = !needsCount && capability.numericFields.length > 0;

    if (needsSum) {
      // OB-162: Prefer field identity measure column over highest-average heuristic
      let bestField: { field: string; avg: number } | undefined;
      if (Object.keys(capability.fieldIdentities).length > 0) {
        // Find measure columns from field identities
        const measureCols = Object.entries(capability.fieldIdentities)
          .filter(([, fi]) => fi.structuralType === 'measure')
          .map(([col]) => col);
        // Match measure column to numeric fields
        for (const mc of measureCols) {
          const nf = capability.numericFields.find(f => f.field === mc);
          if (nf && (!bestField || nf.avg > bestField.avg)) {
            bestField = nf;
          }
        }
      }
      // Fallback to highest average numeric field
      if (!bestField) {
        bestField = capability.numericFields.sort((a, b) => b.avg - a.avg)[0];
      }
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

// ──────────────────────────────────────────────
// HF-111: Component Input Requirements
// Extracts what each component needs from its calculationIntent
// ──────────────────────────────────────────────

interface ComponentInputRequirement {
  role: string;  // 'actual', 'row', 'column', 'numerator', 'denominator'
  metricField: string;  // HF-112: from sourceSpec.field (e.g., 'revenue_attainment')
  expectedRange: { min: number; max: number } | null;
}

function extractInputRequirements(component: PlanComponent): ComponentInputRequirement[] {
  const intent = component.calculationIntent;
  if (!intent) return [{ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: null }];

  const reqs: ComponentInputRequirement[] = [];
  const op = intent.operation as string;

  // Helper to get field name from a sourceSpec
  const getField = (spec: Record<string, unknown> | undefined): string =>
    spec?.field ? String(spec.field).replace(/^metric:/, '') : 'unknown';

  switch (op) {
    case 'bounded_lookup_2d': {
      const inputs = intent.inputs as Record<string, Record<string, unknown>> | undefined;
      const rowRange = extractRangeFromBoundaries(intent.rowBoundaries as Array<Record<string, unknown>> | undefined);
      const colRange = extractRangeFromBoundaries(intent.columnBoundaries as Array<Record<string, unknown>> | undefined);
      if (inputs) {
        const rowSpec = inputs.row?.sourceSpec as Record<string, unknown> | undefined;
        const colSpec = inputs.column?.sourceSpec as Record<string, unknown> | undefined;
        reqs.push({ role: 'row', metricField: getField(rowSpec), expectedRange: rowRange });
        reqs.push({ role: 'column', metricField: getField(colSpec), expectedRange: colRange });
      } else {
        reqs.push({ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: rowRange });
      }
      break;
    }
    case 'bounded_lookup_1d': {
      const range = extractRangeFromBoundaries(intent.boundaries as Array<Record<string, unknown>> | undefined);
      const inputSpec = (intent.input as Record<string, unknown>)?.sourceSpec as Record<string, unknown> | undefined;
      reqs.push({ role: 'actual', metricField: getField(inputSpec), expectedRange: range });
      break;
    }
    case 'scalar_multiply': {
      const input = intent.input as Record<string, unknown> | undefined;
      if (input?.source === 'ratio') {
        const spec = input.sourceSpec as Record<string, unknown> | undefined;
        const num = spec?.numerator ? String(spec.numerator).replace(/^metric:/, '') : 'unknown';
        const den = spec?.denominator ? String(spec.denominator).replace(/^metric:/, '') : 'unknown';
        reqs.push({ role: 'numerator', metricField: num, expectedRange: null });
        reqs.push({ role: 'denominator', metricField: den, expectedRange: null });
      } else {
        const spec = input?.sourceSpec as Record<string, unknown> | undefined;
        reqs.push({ role: 'actual', metricField: getField(spec), expectedRange: null });
      }
      break;
    }
    case 'conditional_gate': {
      const condLeft = (intent.condition as Record<string, unknown>)?.left as Record<string, unknown> | undefined;
      const spec = condLeft?.sourceSpec as Record<string, unknown> | undefined;
      reqs.push({ role: 'actual', metricField: getField(spec), expectedRange: null });
      break;
    }
    default:
      reqs.push({ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: null });
  }

  return reqs;
}

function extractRangeFromBoundaries(
  boundaries: Array<Record<string, unknown>> | undefined
): { min: number; max: number } | null {
  if (!boundaries || boundaries.length === 0) return null;
  const first = boundaries[0];
  const last = boundaries[boundaries.length - 1];
  const minVal = (first.min as number) ?? 0;
  const maxVal = (last.max as number) ?? (last.min as number) * 2;
  if (typeof minVal !== 'number' || typeof maxVal !== 'number') return null;
  return { min: minVal, max: maxVal };
}

// ──────────────────────────────────────────────
// HF-111: Score a column against a component requirement
// Korean Test compliant: matches on value distribution vs boundary range
// ──────────────────────────────────────────────

function scoreColumnForRequirement(
  columnName: string,
  stats: ColumnValueStats,
  requirement: ComponentInputRequirement,
): { score: number; scaleFactor: number } {
  if (!requirement.expectedRange) {
    // No boundaries to match — return baseline score
    return { score: 0.1, scaleFactor: 1 };
  }

  const { min: expMin, max: expMax } = requirement.expectedRange;
  if (expMax <= expMin) return { score: 0.1, scaleFactor: 1 };

  let bestScore = 0;
  let bestScale = 1;

  // Try multiple scale factors: raw, ×100 (ratio→percentage), ×1000
  const scales = [1, 100];
  for (const scale of scales) {
    const scaledMin = stats.min * scale;
    const scaledMax = stats.max * scale;

    // Does the scaled column range overlap with the boundary range?
    if (scaledMax >= expMin * 0.5 && scaledMin <= expMax * 2) {
      // Compute fit ratio: how well does the column's range fit within the boundary range?
      const overlapMin = Math.max(scaledMin, expMin);
      const overlapMax = Math.min(scaledMax, expMax);
      const overlap = Math.max(0, overlapMax - overlapMin);
      const boundarySpan = expMax - expMin;
      const columnSpan = scaledMax - scaledMin;

      // Good fit: column values span a meaningful portion of the boundary range
      // but don't wildly exceed it
      const coverageRatio = boundarySpan > 0 ? overlap / boundarySpan : 0;
      const excessRatio = columnSpan > 0 && boundarySpan > 0
        ? Math.min(1, boundarySpan / columnSpan)  // Penalize columns much wider than boundaries
        : 0.5;

      const fitScore = coverageRatio * 0.6 + excessRatio * 0.4;
      if (fitScore > bestScore) {
        bestScore = fitScore;
        bestScale = scale;
      }
    }
  }

  return { score: bestScore, scaleFactor: bestScale };
}

// ──────────────────────────────────────────────
// HF-112: AI-Assisted Column-to-Metric Mapping
// LLM-Primary, Deterministic Validation, Human Authority
// ──────────────────────────────────────────────

// Check if existing bindings are complete (skip AI call if so)
function hasCompleteBindings(
  existingBindings: Record<string, Record<string, unknown>> | undefined,
  componentCount: number,
): boolean {
  if (!existingBindings) return false;
  const boundComponents = Object.keys(existingBindings).length;
  if (boundComponents < componentCount) return false;
  for (const compBindings of Object.values(existingBindings)) {
    const cb = compBindings as Record<string, { column?: string }>;
    if (!cb.actual?.column && !cb.row?.column && !cb.numerator?.column) return false;
  }
  return true;
}

// One AI call: match plan metric field names to data column contextual identities
async function resolveColumnMappingsViaAI(
  components: PlanComponent[],
  allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }>,
  measureColumns: Array<{ name: string; fi: FieldIdentity; stats: ColumnValueStats }>,
): Promise<Record<string, string>> {
  // Build metric requirements list
  const metricLines = allRequirements.map((r, i) => {
    const rangeHint = r.req.expectedRange
      ? `expected values ${r.req.expectedRange.min}-${r.req.expectedRange.max}`
      : 'no boundary constraints';
    return `${i + 1}. "${r.req.metricField}" (component: ${r.compName}, role: ${r.req.role}, ${rangeHint})`;
  });

  // Build column inventory
  const columnLines = measureColumns.map((c, i) => {
    const range = `${c.stats.min.toFixed(2)}-${c.stats.max.toFixed(2)}`;
    return `${i + 1}. "${c.name}" — ${c.fi.contextualIdentity} (values: ${range}, mean: ${c.stats.mean.toFixed(2)})`;
  });

  const systemPrompt = `You match compensation plan metric requirements to data columns. Both metric names and column descriptions are in English. Column names may be in any language. Match based on semantic meaning, not spelling.`;

  const userPrompt = `METRIC REQUIREMENTS (from compensation plan):
${metricLines.join('\n')}

DATA COLUMNS (from imported data):
${columnLines.join('\n')}

For each metric requirement, identify which data column best satisfies it.
Each column should be used at most once.

Respond ONLY with valid JSON object. No markdown, no explanation.
Format: { "metric_field_name": "column_name", ... }`;

  try {
    const aiService = getAIService();
    const response = await aiService.execute({
      task: 'narration',
      input: { system: systemPrompt, userMessage: userPrompt },
      options: { maxTokens: 500 },
    }, false);

    const result = response.result as Record<string, unknown>;
    if (result && typeof result === 'object') {
      const mapping: Record<string, string> = {};
      for (const [key, val] of Object.entries(result)) {
        if (typeof val === 'string') mapping[key] = val;
      }
      console.log(`[Convergence] HF-112 AI mapping: ${JSON.stringify(mapping)}`);
      return mapping;
    }
  } catch (err) {
    console.error('[Convergence] HF-112 AI mapping failed:', err);
  }

  return {};
}

// ──────────────────────────────────────────────
// HF-112: Generate Per-Component Input Bindings
// AI-Primary column selection + boundary validation + column exclusion
// ──────────────────────────────────────────────

async function generateAllComponentBindings(
  components: PlanComponent[],
  matches: BindingMatch[],
  capabilities: DataCapability[],
  bindings: Record<string, Record<string, ComponentBinding>>,
  existingConvergenceBindings: Record<string, Record<string, unknown>> | undefined,
): Promise<void> {
  // HF-112: Reuse existing bindings if complete (zero AI cost)
  if (hasCompleteBindings(existingConvergenceBindings, components.length)) {
    console.log('[Convergence] HF-112 Existing bindings complete — reusing (zero AI cost)');
    for (const [compKey, compBindings] of Object.entries(existingConvergenceBindings!)) {
      bindings[compKey] = compBindings as Record<string, ComponentBinding>;
    }
    return;
  }

  // Collect all measure columns across matched capabilities
  const measureColumns: Array<{
    name: string;
    fi: FieldIdentity;
    stats: ColumnValueStats;
    batchId: string;
  }> = [];
  let primaryCap: DataCapability | undefined;

  for (const match of matches) {
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;
    if (!primaryCap) {
      primaryCap = cap;
    }

    for (const [colName, fi] of Object.entries(cap.fieldIdentities)) {
      if (fi.structuralType === 'measure' && cap.columnStats[colName]) {
        if (!measureColumns.some(mc => mc.name === colName)) {
          measureColumns.push({ name: colName, fi, stats: cap.columnStats[colName], batchId: cap.batchIds[0] || '' });
        }
      }
    }
    // Also include numeric columns with stats but no field identity
    for (const nf of cap.numericFields) {
      if (!measureColumns.some(mc => mc.name === nf.field) && cap.columnStats[nf.field]) {
        measureColumns.push({
          name: nf.field,
          fi: { structuralType: 'measure', contextualIdentity: 'inferred_numeric', confidence: 0.5 },
          stats: cap.columnStats[nf.field],
          batchId: cap.batchIds[0] || '',
        });
      }
    }
  }

  if (measureColumns.length === 0 || !primaryCap) return;

  // Collect all input requirements across all matched components
  const allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }> = [];
  for (const match of matches) {
    const reqs = extractInputRequirements(match.component);
    for (const req of reqs) {
      allRequirements.push({ compIndex: match.component.index, compName: match.component.name, req });
    }
  }

  // HF-112: AI-assisted column mapping (ONE call)
  console.log('[Convergence] HF-112 Requesting AI column mapping');
  const aiMapping = await resolveColumnMappingsViaAI(components, allRequirements, measureColumns);
  console.log(`[Convergence] HF-112 AI proposed ${Object.keys(aiMapping).length} mappings`);

  // Build bindings using AI mapping + boundary validation
  const boundColumns = new Set<string>();

  for (const match of matches) {
    const comp = match.component;
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;

    const compKey = `component_${comp.index}`;
    if (!bindings[compKey]) bindings[compKey] = {};

    const batchId = cap.batchIds[0] || '';
    const requirements = extractInputRequirements(comp);

    for (const req of requirements) {
      const proposedColumnName = aiMapping[req.metricField];

      if (proposedColumnName) {
        const mc = measureColumns.find(c => c.name === proposedColumnName);
        if (mc && !boundColumns.has(proposedColumnName)) {
          // Boundary validation of AI proposal
          const { score: boundaryScore, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
          const isValidated = !req.expectedRange || boundaryScore > 0.1;

          bindings[compKey][req.role] = {
            source_batch_id: mc.batchId,
            column: proposedColumnName,
            field_identity: mc.fi,
            match_pass: isValidated ? 1 : 2,  // 1=AI+validated, 2=AI-only
            confidence: isValidated ? 0.9 : 0.6,
            scale_factor: scaleFactor !== 1 ? scaleFactor : undefined,
          };
          boundColumns.add(proposedColumnName);
          console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${proposedColumnName} (AI${isValidated ? '+validated' : ''}, scale=${scaleFactor})`);
          continue;
        }
      }

      // Fallback: boundary matching for unmapped requirements (HF-111 logic)
      const candidates = measureColumns
        .filter(mc => !boundColumns.has(mc.name))
        .map(mc => {
          const { score, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
          return { ...mc, score, scaleFactor };
        })
        .sort((a, b) => b.score - a.score);

      if (candidates.length > 0 && candidates[0].score > 0) {
        const best = candidates[0];
        bindings[compKey][req.role] = {
          source_batch_id: best.batchId,
          column: best.name,
          field_identity: best.fi,
          match_pass: 3,  // Boundary-only fallback
          confidence: Math.min(0.7, match.matchConfidence * (0.3 + best.score * 0.4)),
          scale_factor: best.scaleFactor !== 1 ? best.scaleFactor : undefined,
        };
        boundColumns.add(best.name);
        console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${best.name} (boundary fallback, score=${best.score.toFixed(2)})`);
      }
    }

    // Find entity identifier column
    const idEntries = Object.entries(cap.fieldIdentities)
      .filter(([, fi]) => fi.structuralType === 'identifier');
    if (idEntries.length > 0) {
      const [colName, fi] = idEntries[0];
      bindings[compKey]['entity_identifier'] = {
        source_batch_id: batchId,
        column: colName,
        field_identity: fi,
        match_pass: 1,
        confidence: match.matchConfidence,
      };
    }

    // Find temporal column
    const temporalEntries = Object.entries(cap.fieldIdentities)
      .filter(([, fi]) => fi.structuralType === 'temporal');
    if (temporalEntries.length > 0) {
      const [colName, fi] = temporalEntries[0];
      bindings[compKey]['period'] = {
        source_batch_id: batchId,
        column: colName,
        field_identity: fi,
        match_pass: 1,
        confidence: match.matchConfidence,
      };
    }
  }

  // Log complete binding map
  for (const [compKey, cb] of Object.entries(bindings)) {
    const roles = Object.entries(cb)
      .filter(([role]) => role !== 'entity_identifier' && role !== 'period')
      .map(([role, b]) => `${role}=${b.column}`)
      .join(', ');
    if (roles) console.log(`[Convergence] HF-112 ${compKey}: ${roles}`);
  }
}

/**
 * Generate COUNT derivation rules with category+boolean filters.
 */
function generateFilteredCountDerivations(
  component: PlanComponent,
  dataType: string,
  capability: DataCapability
): MetricDerivationRule[] {
  const rules: MetricDerivationRule[] = [];
  const compTokens = tokenize(component.name);

  let bestCatField: { field: string; matchedValue: string } | null = null;
  let bestCatScore = 0;

  for (const catField of capability.categoricalFields) {
    for (const value of catField.distinctValues) {
      const valueTokens = tokenize(value);
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

  if (!bestCatField || bestCatScore < 0.3) {
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

  const filters: MetricDerivationRule['filters'] = [
    { field: bestCatField.field, operator: 'eq', value: bestCatField.matchedValue },
  ];

  if (capability.booleanFields.length > 0) {
    const qualField = capability.booleanFields[0];
    filters.push({ field: qualField.field, operator: 'eq', value: qualField.trueValue });
  }

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

function detectBoundaryScale(componentsJson: unknown, componentIndex: number): number {
  const cj = componentsJson as Record<string, unknown> | null;
  if (!cj) return 100;

  const variants = (cj.variants as Array<Record<string, unknown>>) ?? [];
  const comps = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];
  const comp = comps[componentIndex];
  if (!comp) return 100;

  const tierConfig = comp.tierConfig as Record<string, unknown> | undefined;
  const tiers = (tierConfig?.tiers as Array<Record<string, unknown>>) ?? [];
  for (const tier of tiers) {
    const min = tier.min as number | null;
    const max = tier.max as number | null;
    if ((min !== null && min > 1) || (max !== null && max > 1)) {
      return 100;
    }
  }

  const intent = comp.calculationIntent as Record<string, unknown> | undefined;
  const boundaries = (intent?.boundaries as Array<Record<string, unknown>>) ?? [];
  for (const b of boundaries) {
    const min = b.min as number | null;
    const max = b.max as number | null;
    if ((min !== null && min > 1) || (max !== null && max > 1)) {
      return 100;
    }
  }

  return 1;
}

// HF-109: Structural measure count by operation type (DS-009 4.2)
// Used by Pass 2 to match component structural pattern against batch field identities
function getRequiredMeasureCount(operation: string): number {
  switch (operation) {
    case 'ratio':
    case 'bounded_lookup_2d':
      return 2; // actual + target (or numerator + denominator)
    case 'sum':
    case 'count':
    case 'bounded_lookup_1d':
    case 'scalar_multiply':
    case 'conditional_gate':
    case 'aggregate':
    default:
      return 1;
  }
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
