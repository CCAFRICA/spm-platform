/**
 * OB-91 Mission 4: Reconciliation Report Data Engine
 *
 * Pure client-side function that transforms ComparisonResultData into
 * a structured ReconciliationReport with executive summary, component
 * analysis, and prioritized findings.
 *
 * Mission 6 adds XLSX export to this file.
 */

// ============================================
// TYPES
// ============================================

export interface ReconciliationReport {
  summary: ReportSummary;
  components: ComponentAnalysis[];
  findings: ReportFinding[];
  generatedAt: string;
  periodLabel: string;
  tenantName: string;
}

export interface ReportSummary {
  overallMatchPercent: number;
  totalEngine: number;
  totalBenchmark: number;
  totalDelta: number;
  entityCount: number;
  exactMatchCount: number;
  deltaEntityCount: number;
  componentCount: number;
  componentsAtZeroDelta: number;
  topFinding: string;
}

export interface ComponentAnalysis {
  name: string;
  engineTotal: number;
  benchmarkTotal: number;
  delta: number;
  deltaPercent: number;
  entityCount: number;
  exactMatchCount: number;
  entities: EntityDetail[];
  isExact: boolean;
}

export interface EntityDetail {
  entityId: string;
  externalId: string;
  name: string;
  enginePayout: number;
  benchmarkPayout: number;
  delta: number;
  flag: string;
}

export interface ReportFinding {
  severity: 'critical' | 'warning' | 'info' | 'exact';
  title: string;
  description: string;
  impact: string;
  impactAmount: number;
  entityCount: number;
  action: string;
  componentName?: string;
  pattern: string;
}

// ============================================
// INPUT TYPE (matches reconciliation page)
// ============================================

interface ComparisonEmployee {
  entityId: string;
  entityName: string;
  population: 'matched' | 'file_only' | 'vl_only';
  fileTotal: number;
  vlTotal: number;
  totalDelta: number;
  totalDeltaPercent: number;
  totalFlag: string;
  components: Array<{
    componentId: string;
    componentName: string;
    fileValue: number;
    vlValue: number;
    delta: number;
    deltaPercent: number;
    flag: string;
  }>;
}

interface ComparisonSummary {
  totalEmployees: number;
  matched: number;
  fileOnly: number;
  vlOnly: number;
  exactMatches: number;
  toleranceMatches: number;
  amberFlags: number;
  redFlags: number;
  fileTotalAmount: number;
  vlTotalAmount: number;
  totalDelta: number;
}

interface ComparisonFinding {
  priority: number;
  type: string;
  entityId?: string;
  message: string;
  messageEs: string;
  detail: string;
}

export interface ComparisonResultInput {
  employees: ComparisonEmployee[];
  summary: ComparisonSummary;
  falseGreenCount: number;
  findings: ComparisonFinding[];
  periodsCompared: string[];
  depthAchieved: number;
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Generate a structured reconciliation report from comparison results.
 * Pure client-side function — no network calls, no side effects.
 */
export function generateReconciliationReport(
  compResult: ComparisonResultInput,
  metadata: { periodLabel: string; tenantName: string },
): ReconciliationReport {
  const matched = compResult.employees.filter(e => e.population === 'matched');

  // Build component analysis
  const componentMap = new Map<string, {
    engineTotal: number;
    benchmarkTotal: number;
    exactCount: number;
    entities: EntityDetail[];
  }>();

  for (const emp of matched) {
    for (const comp of emp.components) {
      const existing = componentMap.get(comp.componentName) || {
        engineTotal: 0,
        benchmarkTotal: 0,
        exactCount: 0,
        entities: [],
      };
      existing.engineTotal += comp.vlValue;
      existing.benchmarkTotal += comp.fileValue;
      if (comp.flag === 'exact') existing.exactCount++;
      existing.entities.push({
        entityId: emp.entityId,
        externalId: emp.entityId,
        name: emp.entityName,
        enginePayout: comp.vlValue,
        benchmarkPayout: comp.fileValue,
        delta: comp.delta,
        flag: comp.flag,
      });
      componentMap.set(comp.componentName, existing);
    }
  }

  const components: ComponentAnalysis[] = Array.from(componentMap.entries()).map(([name, data]) => {
    const delta = data.engineTotal - data.benchmarkTotal;
    const deltaPercent = data.benchmarkTotal !== 0 ? (delta / data.benchmarkTotal) * 100 : 0;
    return {
      name,
      engineTotal: data.engineTotal,
      benchmarkTotal: data.benchmarkTotal,
      delta,
      deltaPercent,
      entityCount: data.entities.length,
      exactMatchCount: data.exactCount,
      entities: data.entities,
      isExact: Math.abs(delta) < 0.01,
    };
  });

  // Sort components: non-exact first (by abs delta desc), then exact
  components.sort((a, b) => {
    if (a.isExact !== b.isExact) return a.isExact ? 1 : -1;
    return Math.abs(b.delta) - Math.abs(a.delta);
  });

  // Generate findings
  const findings = generateFindings(compResult, matched, components);

  // Build summary
  const exactMatchCount = compResult.summary.exactMatches + compResult.summary.toleranceMatches;
  const deltaEntityCount = compResult.summary.amberFlags + compResult.summary.redFlags;
  const componentsAtZeroDelta = components.filter(c => c.isExact).length;

  const topFinding = findings.length > 0
    ? findings[0].title
    : (exactMatchCount === matched.length ? 'Perfect reconciliation — all entities match' : 'Review required');

  const summary: ReportSummary = {
    overallMatchPercent: matched.length > 0 ? (exactMatchCount / matched.length) * 100 : 0,
    totalEngine: compResult.summary.vlTotalAmount,
    totalBenchmark: compResult.summary.fileTotalAmount,
    totalDelta: compResult.summary.totalDelta,
    entityCount: matched.length,
    exactMatchCount,
    deltaEntityCount,
    componentCount: components.length,
    componentsAtZeroDelta,
    topFinding,
  };

  return {
    summary,
    components,
    findings,
    generatedAt: new Date().toISOString(),
    periodLabel: metadata.periodLabel,
    tenantName: metadata.tenantName,
  };
}

// ============================================
// FINDING GENERATORS
// ============================================

function generateFindings(
  compResult: ComparisonResultInput,
  matched: ComparisonEmployee[],
  components: ComponentAnalysis[],
): ReportFinding[] {
  const findings: ReportFinding[] = [];

  // Pattern: Matrix value error — multiple entities with identical delta at same component
  for (const comp of components) {
    if (comp.isExact) continue;

    const deltaMap = new Map<string, EntityDetail[]>();
    for (const entity of comp.entities) {
      if (Math.abs(entity.delta) < 0.01) continue;
      const deltaKey = entity.delta.toFixed(2);
      const existing = deltaMap.get(deltaKey) || [];
      existing.push(entity);
      deltaMap.set(deltaKey, existing);
    }

    for (const [deltaValue, entities] of Array.from(deltaMap.entries())) {
      if (entities.length >= 3) {
        const totalImpact = parseFloat(deltaValue) * entities.length;
        findings.push({
          severity: 'critical',
          title: `Systematic delta in ${comp.name}`,
          description: `${entities.length} entities share identical delta of $${deltaValue} — suggests a plan configuration error (e.g., wrong matrix value at a specific band position).`,
          impact: `$${Math.abs(totalImpact).toFixed(2)} total impact`,
          impactAmount: Math.abs(totalImpact),
          entityCount: entities.length,
          action: `Review the ${comp.name} matrix/tier configuration for the band that covers these entities. Check the plan import for extraction errors at this position.`,
          componentName: comp.name,
          pattern: 'matrix_value_error',
        });
      }
    }
  }

  // Pattern: Variant concentration — all deltas in one variant (if component data available)
  const nonExactComponents = components.filter(c => !c.isExact);
  if (nonExactComponents.length === 1 && components.length > 1) {
    const problematic = nonExactComponents[0];
    findings.push({
      severity: 'warning',
      title: `All deltas concentrated in ${problematic.name}`,
      description: `Only ${problematic.name} has deltas — ${components.length - 1} other component(s) match perfectly. This isolates the discrepancy to a single component.`,
      impact: `$${Math.abs(problematic.delta).toFixed(2)} total delta`,
      impactAmount: Math.abs(problematic.delta),
      entityCount: problematic.entities.filter(e => Math.abs(e.delta) >= 0.01).length,
      action: `Focus investigation on ${problematic.name} configuration only — all other components are validated.`,
      componentName: problematic.name,
      pattern: 'variant_concentration',
    });
  }

  // Pattern: Perfect match components
  const perfectComponents = components.filter(c => c.isExact);
  if (perfectComponents.length > 0) {
    findings.push({
      severity: 'exact',
      title: `${perfectComponents.length} component(s) at zero delta`,
      description: `${perfectComponents.map(c => c.name).join(', ')} — all entities match exactly across these components.`,
      impact: 'No discrepancy',
      impactAmount: 0,
      entityCount: matched.length,
      action: 'No action required — these components are fully validated.',
      pattern: 'perfect_match',
    });
  }

  // Pattern: False greens
  if (compResult.falseGreenCount > 0) {
    findings.push({
      severity: 'critical',
      title: `${compResult.falseGreenCount} false green(s) detected`,
      description: `Entity totals appear to match but component-level breakdown reveals offsetting errors. Total-only comparison would miss these discrepancies.`,
      impact: `${compResult.falseGreenCount} entities with hidden errors`,
      impactAmount: 0,
      entityCount: compResult.falseGreenCount,
      action: 'Expand each false-green entity to inspect component-level deltas. The errors may cancel out at the total level.',
      pattern: 'false_green',
    });
  }

  // Pattern: Population mismatch
  if (compResult.summary.vlOnly > 0 || compResult.summary.fileOnly > 0) {
    const total = compResult.summary.vlOnly + compResult.summary.fileOnly;
    findings.push({
      severity: 'warning',
      title: `${total} population mismatch(es)`,
      description: `${compResult.summary.vlOnly} entities in VL only, ${compResult.summary.fileOnly} in benchmark only. These cannot be compared.`,
      impact: `${total} entities excluded from comparison`,
      impactAmount: 0,
      entityCount: total,
      action: 'Verify entity IDs match between data sources. Check for ID format differences (leading zeros, case sensitivity).',
      pattern: 'population_mismatch',
    });
  }

  // Pattern: High overall match
  const matchRate = matched.length > 0
    ? ((compResult.summary.exactMatches + compResult.summary.toleranceMatches) / matched.length) * 100
    : 0;
  if (matchRate >= 99) {
    findings.push({
      severity: 'exact',
      title: `${matchRate.toFixed(1)}% match rate achieved`,
      description: `${compResult.summary.exactMatches} exact + ${compResult.summary.toleranceMatches} tolerance matches out of ${matched.length} entities.`,
      impact: 'Excellent reconciliation result',
      impactAmount: Math.abs(compResult.summary.totalDelta),
      entityCount: matched.length,
      action: matchRate === 100 ? 'Reconciliation complete — no action required.' : 'Review remaining tolerance-level matches for final sign-off.',
      pattern: 'high_match_rate',
    });
  }

  // Sort findings: critical first, then warning, then info, then exact
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, exact: 3 };
  findings.sort((a, b) => {
    const sA = severityOrder[a.severity] ?? 99;
    const sB = severityOrder[b.severity] ?? 99;
    if (sA !== sB) return sA - sB;
    return b.impactAmount - a.impactAmount;
  });

  return findings;
}
