/**
 * AI Forensics Integration Layer
 *
 * Provides AI-assisted analysis for the forensics environment:
 * 1. Column mapping suggestions for comparison data
 * 2. Pattern analysis on reconciliation results
 * 3. Compensation explainer for employee traces
 *
 * Degrades gracefully — all functions return useful defaults
 * when AI is unavailable. Frontend never breaks.
 */

import type { CalculationTrace, ReconciliationSession } from './types';
import type { PlanComponent } from '@/types/compensation-plan';

// =============================================================================
// COLUMN MAPPING SUGGESTIONS
// =============================================================================

export interface ColumnSuggestion {
  sourceColumn: string;
  suggestedMapping: string;
  confidence: number;
  reasoning: string;
}

/**
 * Suggest column mappings for comparison data.
 * Uses heuristic matching — no external API call needed.
 * Works in any language (Korean Test compliant).
 */
export function suggestColumnMappings(
  headers: string[],
  components: PlanComponent[]
): ColumnSuggestion[] {
  return headers.map(header => {
    const normalized = header.toLowerCase().trim();

    // Employee ID patterns (multi-language)
    if (matchesAny(normalized, ['employee', 'emp_id', 'employeeid', 'employee_id', 'id_empleado', 'empleado', 'rep_id', 'associate', 'id'])) {
      return { sourceColumn: header, suggestedMapping: 'employee_id', confidence: 0.9, reasoning: 'Matches employee identifier pattern' };
    }

    // Total patterns
    if (matchesAny(normalized, ['total', 'grand_total', 'payout', 'incentive', 'comision_total', 'total_pago'])) {
      return { sourceColumn: header, suggestedMapping: 'total', confidence: 0.85, reasoning: 'Matches total/payout pattern' };
    }

    // Match against plan components
    for (const comp of components) {
      const compName = comp.name.toLowerCase().trim();
      const similarity = calculateSimilarity(normalized, compName);
      if (similarity > 0.5) {
        return {
          sourceColumn: header,
          suggestedMapping: `component:${comp.id}`,
          confidence: similarity,
          reasoning: `Similar to plan component "${comp.name}" (${(similarity * 100).toFixed(0)}% match)`,
        };
      }
    }

    return { sourceColumn: header, suggestedMapping: 'unmapped', confidence: 0, reasoning: 'No match found' };
  });
}

// =============================================================================
// PATTERN ANALYSIS
// =============================================================================

export interface ReconciliationPattern {
  type: 'systematic_offset' | 'component_mismatch' | 'population_gap' | 'rounding' | 'coincidental_cluster';
  severity: 'info' | 'warning' | 'error';
  description: string;
  affectedCount: number;
  recommendation: string;
}

/**
 * Analyze reconciliation results for patterns.
 * Returns actionable patterns sorted by severity.
 */
export function analyzeReconciliationPatterns(
  session: ReconciliationSession
): ReconciliationPattern[] {
  const patterns: ReconciliationPattern[] = [];

  // 1. Systematic offset: Most differences have the same sign
  const diffs = session.employeeResults.map(e => e.difference);
  const positiveDiffs = diffs.filter(d => d > 0.01).length;
  const negativeDiffs = diffs.filter(d => d < -0.01).length;
  const totalWithDiff = positiveDiffs + negativeDiffs;

  if (totalWithDiff > 5) {
    const dominantDirection = positiveDiffs > negativeDiffs ? 'positive' : 'negative';
    const dominantCount = Math.max(positiveDiffs, negativeDiffs);
    const ratio = dominantCount / totalWithDiff;

    if (ratio > 0.8) {
      patterns.push({
        type: 'systematic_offset',
        severity: 'warning',
        description: `${dominantCount} of ${totalWithDiff} differences are ${dominantDirection}, suggesting a systematic offset`,
        affectedCount: dominantCount,
        recommendation: 'Check if a component is consistently over/under-calculated. Compare plan configuration against ground truth rules.',
      });
    }
  }

  // 2. Component mismatch patterns
  for (const ct of session.aggregates.componentTotals) {
    if (ct.difference !== undefined && ct.employeesAffected !== undefined) {
      if (ct.employeesAffected > session.population.totalEmployees * 0.3 && Math.abs(ct.difference) > 100) {
        patterns.push({
          type: 'component_mismatch',
          severity: 'warning',
          description: `"${ct.componentName}" affects ${ct.employeesAffected} employees with total diff $${ct.difference.toLocaleString()}`,
          affectedCount: ct.employeesAffected,
          recommendation: `Review the calculation logic for "${ct.componentName}". Check tier/matrix configuration.`,
        });
      }
    }
  }

  // 3. Coincidental match cluster
  if (session.population.coincidentalMatches > 0) {
    patterns.push({
      type: 'coincidental_cluster',
      severity: 'error',
      description: `${session.population.coincidentalMatches} coincidental matches detected (totals match but component values differ)`,
      affectedCount: session.population.coincidentalMatches,
      recommendation: 'These employees have matching totals but different component breakdowns. This could mask real calculation differences.',
    });
  }

  // 4. Population gaps
  const { unmatchedVL, unmatchedGT } = session.population;
  if (unmatchedVL.length > 0 || unmatchedGT.length > 0) {
    patterns.push({
      type: 'population_gap',
      severity: unmatchedVL.length + unmatchedGT.length > 10 ? 'warning' : 'info',
      description: `${unmatchedVL.length} VL-only employees, ${unmatchedGT.length} GT-only employees`,
      affectedCount: unmatchedVL.length + unmatchedGT.length,
      recommendation: 'Verify employee ID matching. Check for formatting differences (leading zeros, name vs ID).',
    });
  }

  // 5. Rounding pattern: many small diffs
  const smallDiffs = diffs.filter(d => Math.abs(d) > 0 && Math.abs(d) < 2).length;
  if (smallDiffs > totalWithDiff * 0.5 && smallDiffs > 5) {
    patterns.push({
      type: 'rounding',
      severity: 'info',
      description: `${smallDiffs} employees have differences under $2, likely rounding`,
      affectedCount: smallDiffs,
      recommendation: 'Small differences are likely due to rounding precision. Consider acceptable tolerance.',
    });
  }

  // Sort by severity
  const severityOrder = { error: 0, warning: 1, info: 2 };
  patterns.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return patterns;
}

// =============================================================================
// COMPENSATION EXPLAINER
// =============================================================================

/**
 * Generate a human-readable explanation of an employee's compensation.
 * All component names come from the trace — zero hardcoded text.
 */
export function explainCompensation(trace: CalculationTrace): string {
  const lines: string[] = [];

  lines.push(`${trace.employeeName} (${trace.employeeRole}) earned $${trace.totalIncentive.toLocaleString()} in total incentive.`);
  lines.push('');
  lines.push(`Variant: ${trace.variant.variantName}`);
  lines.push('');
  lines.push('Breakdown:');

  for (const comp of trace.components) {
    const pct = trace.totalIncentive > 0
      ? ((comp.outputValue / trace.totalIncentive) * 100).toFixed(1)
      : '0';

    lines.push(`  ${comp.componentName}: $${comp.outputValue.toLocaleString()} (${pct}% of total)`);
    lines.push(`    ${comp.calculationSentence}`);

    if (comp.flags.length > 0) {
      for (const flag of comp.flags) {
        lines.push(`    ⚠ ${flag.message}`);
      }
    }
  }

  if (trace.flags.length > 0) {
    lines.push('');
    lines.push('Flags:');
    for (const flag of trace.flags) {
      lines.push(`  - ${flag}`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// HELPERS
// =============================================================================

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some(p => text.includes(p));
}

/**
 * Simple string similarity (Jaccard on character n-grams).
 * Works across languages — no English-specific logic.
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const ngramSize = 2;
  const aNgrams = new Set<string>();
  const bNgrams = new Set<string>();

  for (let i = 0; i <= a.length - ngramSize; i++) {
    aNgrams.add(a.substring(i, i + ngramSize));
  }
  for (let i = 0; i <= b.length - ngramSize; i++) {
    bNgrams.add(b.substring(i, i + ngramSize));
  }

  let intersection = 0;
  Array.from(aNgrams).forEach(gram => {
    if (bNgrams.has(gram)) intersection++;
  });

  const union = aNgrams.size + bNgrams.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
