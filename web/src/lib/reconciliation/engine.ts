/**
 * Reconciliation Engine
 *
 * Core matching and reconciliation logic for dual-mode (migration/operational) processing.
 */

import type {
  ReconciliationSession,
  ReconciliationSummary,
  ReconciliationItem,
  ReconciliationRule,
  MatchStatus,
  MatchCriterion,
  DiscrepancyField,
} from '@/types/reconciliation';

// ============================================
// MATCHING ENGINE
// ============================================

interface SourceRecord {
  id: string;
  entityId: string;
  amount: number;
  date: string;
  type: string;
  description?: string;
  rawData: Record<string, unknown>;
}

interface MatchResult {
  sourceRecord: SourceRecord;
  targetRecord?: SourceRecord;
  matchStatus: MatchStatus;
  matchConfidence: number;
  matchMethod: 'exact' | 'fuzzy' | 'rule_based' | 'manual';
  discrepancies: DiscrepancyField[];
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  if (!a || !b) return 0;

  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 100;

  const matrix: number[][] = [];
  const aLen = aLower.length;
  const bLen = bLower.length;

  for (let i = 0; i <= aLen; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bLen; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(aLen, bLen);
  return Math.round(((maxLen - matrix[aLen][bLen]) / maxLen) * 100);
}

/**
 * Check if two values match based on criterion type
 */
function evaluateCriterion(
  criterion: MatchCriterion,
  sourceValue: unknown,
  targetValue: unknown,
  tolerance?: { amount?: { type: 'absolute' | 'percentage'; value: number }; date?: number }
): { matched: boolean; confidence: number } {
  if (sourceValue === undefined || targetValue === undefined) {
    return { matched: false, confidence: 0 };
  }

  switch (criterion.matchType) {
    case 'exact':
      if (sourceValue === targetValue) {
        return { matched: true, confidence: 100 };
      }
      return { matched: false, confidence: 0 };

    case 'fuzzy':
      if (typeof sourceValue === 'string' && typeof targetValue === 'string') {
        const similarity = stringSimilarity(sourceValue, targetValue);
        return { matched: similarity >= 80, confidence: similarity };
      }
      return { matched: sourceValue === targetValue, confidence: sourceValue === targetValue ? 100 : 0 };

    case 'contains':
      if (typeof sourceValue === 'string' && typeof targetValue === 'string') {
        const contains = sourceValue.toLowerCase().includes(targetValue.toLowerCase()) ||
          targetValue.toLowerCase().includes(sourceValue.toLowerCase());
        return { matched: contains, confidence: contains ? 85 : 0 };
      }
      return { matched: false, confidence: 0 };

    case 'numeric_range':
      if (typeof sourceValue === 'number' && typeof targetValue === 'number') {
        if (tolerance?.amount) {
          let diff: number;
          if (tolerance.amount.type === 'percentage') {
            diff = Math.abs((sourceValue - targetValue) / sourceValue) * 100;
            const matched = diff <= tolerance.amount.value;
            return { matched, confidence: matched ? Math.round(100 - diff) : 0 };
          } else {
            diff = Math.abs(sourceValue - targetValue);
            const matched = diff <= tolerance.amount.value;
            return { matched, confidence: matched ? Math.round(100 - (diff / tolerance.amount.value) * 100) : 0 };
          }
        }
        return { matched: sourceValue === targetValue, confidence: sourceValue === targetValue ? 100 : 0 };
      }
      return { matched: false, confidence: 0 };

    case 'date_range':
      if (typeof sourceValue === 'string' && typeof targetValue === 'string') {
        const sourceDate = new Date(sourceValue);
        const targetDate = new Date(targetValue);
        const daysDiff = Math.abs((sourceDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
        const toleranceDays = tolerance?.date || 0;
        const matched = daysDiff <= toleranceDays;
        return { matched, confidence: matched ? Math.round(100 - (daysDiff / Math.max(toleranceDays, 1)) * 50) : 0 };
      }
      return { matched: false, confidence: 0 };

    default:
      return { matched: false, confidence: 0 };
  }
}

/**
 * Find best match for a source record in target records
 */
export function findBestMatch(
  sourceRecord: SourceRecord,
  targetRecords: SourceRecord[],
  rules: ReconciliationRule[]
): MatchResult {
  let bestMatch: MatchResult = {
    sourceRecord,
    matchStatus: 'unmatched',
    matchConfidence: 0,
    matchMethod: 'exact',
    discrepancies: [],
  };

  // Try exact match first
  const exactMatch = targetRecords.find(
    (t) =>
      t.entityId === sourceRecord.entityId &&
      t.amount === sourceRecord.amount &&
      t.date === sourceRecord.date &&
      t.type === sourceRecord.type
  );

  if (exactMatch) {
    return {
      sourceRecord,
      targetRecord: exactMatch,
      matchStatus: 'matched',
      matchConfidence: 100,
      matchMethod: 'exact',
      discrepancies: [],
    };
  }

  // Try rule-based matching
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    if (!rule.isActive) continue;

    for (const targetRecord of targetRecords) {
      let totalWeight = 0;
      let matchedWeight = 0;
      let allRequiredMatched = true;
      const discrepancies: DiscrepancyField[] = [];

      for (const criterion of rule.matchCriteria) {
        const sourceValue = getFieldValue(sourceRecord, criterion.sourceField);
        const targetValue = getFieldValue(targetRecord, criterion.targetField);

        const result = evaluateCriterion(criterion, sourceValue, targetValue, {
          amount: rule.amountTolerance,
          date: rule.dateTolerance,
        });

        totalWeight += criterion.weight;
        if (result.matched) {
          matchedWeight += criterion.weight * (result.confidence / 100);
        } else if (criterion.required) {
          allRequiredMatched = false;
        }

        // Track discrepancies
        if (!result.matched && sourceValue !== undefined && targetValue !== undefined) {
          discrepancies.push({
            field: criterion.sourceField,
            sourceValue,
            targetValue,
            significance: criterion.required ? 'critical' : 'minor',
          });
        }
      }

      if (!allRequiredMatched) continue;

      const confidence = totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 0;

      if (confidence >= rule.matchThreshold && confidence > bestMatch.matchConfidence) {
        const hasDiscrepancies = discrepancies.length > 0;
        bestMatch = {
          sourceRecord,
          targetRecord,
          matchStatus: hasDiscrepancies ? 'discrepancy' : 'matched',
          matchConfidence: Math.round(confidence),
          matchMethod: 'rule_based',
          discrepancies,
        };
      }
    }
  }

  // Try fuzzy matching as fallback
  if (bestMatch.matchConfidence < 50) {
    for (const targetRecord of targetRecords) {
      if (targetRecord.entityId !== sourceRecord.entityId) continue;

      const amountDiff = Math.abs(sourceRecord.amount - targetRecord.amount);
      const amountSimilarity = 100 - Math.min(100, (amountDiff / Math.max(sourceRecord.amount, 1)) * 100);

      const dateDiff = Math.abs(
        new Date(sourceRecord.date).getTime() - new Date(targetRecord.date).getTime()
      ) / (1000 * 60 * 60 * 24);
      const dateSimilarity = Math.max(0, 100 - dateDiff * 10);

      const typeSimilarity = sourceRecord.type === targetRecord.type ? 100 : 0;

      const overallConfidence = (amountSimilarity * 0.5 + dateSimilarity * 0.3 + typeSimilarity * 0.2);

      if (overallConfidence > bestMatch.matchConfidence && overallConfidence >= 60) {
        const discrepancies: DiscrepancyField[] = [];

        if (sourceRecord.amount !== targetRecord.amount) {
          discrepancies.push({
            field: 'amount',
            sourceValue: sourceRecord.amount,
            targetValue: targetRecord.amount,
            significance: amountDiff > 100 ? 'critical' : 'important',
          });
        }

        if (sourceRecord.date !== targetRecord.date) {
          discrepancies.push({
            field: 'date',
            sourceValue: sourceRecord.date,
            targetValue: targetRecord.date,
            significance: dateDiff > 7 ? 'important' : 'minor',
          });
        }

        bestMatch = {
          sourceRecord,
          targetRecord,
          matchStatus: discrepancies.length > 0 ? 'partial_match' : 'matched',
          matchConfidence: Math.round(overallConfidence),
          matchMethod: 'fuzzy',
          discrepancies,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Get field value from record using dot notation
 */
function getFieldValue(record: SourceRecord, field: string): unknown {
  if (field.startsWith('rawData.')) {
    const key = field.replace('rawData.', '');
    return record.rawData[key];
  }
  return record[field as keyof SourceRecord];
}

// ============================================
// RECONCILIATION PROCESSING
// ============================================

/**
 * Process reconciliation between source and target records
 */
export function processReconciliation(
  sessionId: string,
  sourceRecords: SourceRecord[],
  targetRecords: SourceRecord[],
  rules: ReconciliationRule[]
): { items: ReconciliationItem[]; summary: ReconciliationSummary } {
  const items: ReconciliationItem[] = [];
  const matchedTargetIds = new Set<string>();

  // Match source records to target records
  for (const sourceRecord of sourceRecords) {
    const availableTargets = targetRecords.filter((t) => !matchedTargetIds.has(t.id));
    const matchResult = findBestMatch(sourceRecord, availableTargets, rules);

    if (matchResult.targetRecord) {
      matchedTargetIds.add(matchResult.targetRecord.id);
    }

    const item: ReconciliationItem = {
      id: `rec-item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sessionId,
      matchStatus: matchResult.matchStatus,
      matchConfidence: matchResult.matchConfidence,
      matchMethod: matchResult.matchMethod,
      sourceRecord: {
        id: sourceRecord.id,
        entityId: sourceRecord.entityId,
        amount: sourceRecord.amount,
        date: sourceRecord.date,
        type: sourceRecord.type,
        description: sourceRecord.description,
        rawData: sourceRecord.rawData,
      },
      targetRecord: matchResult.targetRecord
        ? {
            id: matchResult.targetRecord.id,
            entityId: matchResult.targetRecord.entityId,
            amount: matchResult.targetRecord.amount,
            date: matchResult.targetRecord.date,
            type: matchResult.targetRecord.type,
            description: matchResult.targetRecord.description,
            rawData: matchResult.targetRecord.rawData,
          }
        : undefined,
    };

    if (matchResult.discrepancies.length > 0) {
      const amountDiff = matchResult.targetRecord
        ? sourceRecord.amount - matchResult.targetRecord.amount
        : sourceRecord.amount;

      item.discrepancy = {
        fields: matchResult.discrepancies,
        amountDifference: amountDiff,
        severity: determineSeverity(matchResult.discrepancies, amountDiff),
        suggestedResolution: suggestResolution(matchResult.discrepancies),
      };
    }

    items.push(item);
  }

  // Find unmatched target records (missing in source)
  for (const targetRecord of targetRecords) {
    if (!matchedTargetIds.has(targetRecord.id)) {
      items.push({
        id: `rec-item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sessionId,
        matchStatus: 'missing_source',
        matchConfidence: 0,
        matchMethod: 'exact',
        targetRecord: {
          id: targetRecord.id,
          entityId: targetRecord.entityId,
          amount: targetRecord.amount,
          date: targetRecord.date,
          type: targetRecord.type,
          description: targetRecord.description,
          rawData: targetRecord.rawData,
        },
      });
    }
  }

  // Generate summary
  const summary = generateSummary(items, sourceRecords, targetRecords);

  return { items, summary };
}

/**
 * Determine severity of discrepancy
 */
function determineSeverity(
  discrepancies: DiscrepancyField[],
  amountDiff: number
): 'low' | 'medium' | 'high' {
  const hasCritical = discrepancies.some((d) => d.significance === 'critical');
  if (hasCritical || Math.abs(amountDiff) > 1000) {
    return 'high';
  }

  const hasImportant = discrepancies.some((d) => d.significance === 'important');
  if (hasImportant || Math.abs(amountDiff) > 100) {
    return 'medium';
  }

  return 'low';
}

/**
 * Suggest resolution based on discrepancies
 */
function suggestResolution(discrepancies: DiscrepancyField[]): string {
  if (discrepancies.length === 0) return 'No resolution needed';

  const criticalFields = discrepancies.filter((d) => d.significance === 'critical');
  if (criticalFields.length > 0) {
    return `Review critical discrepancies in: ${criticalFields.map((d) => d.field).join(', ')}`;
  }

  const hasAmountDiff = discrepancies.some((d) => d.field === 'amount');
  if (hasAmountDiff) {
    return 'Verify amount difference with source system';
  }

  return 'Manual review recommended';
}

/**
 * Generate reconciliation summary
 */
function generateSummary(
  items: ReconciliationItem[],
  sourceRecords: SourceRecord[],
  targetRecords: SourceRecord[]
): ReconciliationSummary {
  const matched = items.filter((i) => i.matchStatus === 'matched').length;
  const partialMatch = items.filter((i) => i.matchStatus === 'partial_match').length;
  const unmatched = items.filter((i) => i.matchStatus === 'unmatched').length;
  const missingSource = items.filter((i) => i.matchStatus === 'missing_source').length;
  const missingTarget = items.filter((i) => !i.targetRecord && i.sourceRecord).length;
  const discrepancy = items.filter((i) => i.matchStatus === 'discrepancy').length;

  const sourceTotal = sourceRecords.reduce((sum, r) => sum + r.amount, 0);
  const targetTotal = targetRecords.reduce((sum, r) => sum + r.amount, 0);
  const difference = sourceTotal - targetTotal;
  const percentageDifference = targetTotal > 0 ? (difference / targetTotal) * 100 : 0;

  const highConfidence = items.filter((i) => i.matchConfidence >= 90).length;
  const needsReview = items.filter((i) => i.matchConfidence < 90 && i.matchConfidence > 0).length;

  return {
    totalRecords: items.length,
    matchedRecords: matched + partialMatch,
    unmatchedRecords: unmatched + missingSource + missingTarget,
    discrepancies: discrepancy,
    byType: {
      matched,
      missingInSource: missingSource,
      missingInTarget: missingTarget,
      amountDifference: items.filter((i) => i.discrepancy?.fields.some((f) => f.field === 'amount')).length,
      fieldDifference: items.filter((i) => i.discrepancy && !i.discrepancy.fields.some((f) => f.field === 'amount')).length,
    },
    sourceTotal,
    targetTotal,
    difference,
    percentageDifference: Math.round(percentageDifference * 100) / 100,
    overallConfidence: items.length > 0
      ? Math.round(items.reduce((sum, i) => sum + i.matchConfidence, 0) / items.length)
      : 0,
    autoReconciled: highConfidence,
    manualReviewRequired: needsReview + unmatched + missingSource + missingTarget,
  };
}

// ============================================
// AUTO-RESOLUTION
// ============================================

/**
 * Apply auto-resolution rules to reconciliation items
 */
export function applyAutoResolution(
  items: ReconciliationItem[],
  rules: ReconciliationRule[],
  userId: string
): ReconciliationItem[] {
  const autoResolveRules = rules.filter((r) => r.autoResolve && r.isActive);

  return items.map((item) => {
    // Skip already resolved items
    if (item.resolution) return item;

    // Skip items that need manual review
    if (item.matchConfidence < 95 || item.discrepancy?.severity === 'high') {
      return item;
    }

    // Find applicable auto-resolve rule
    for (const rule of autoResolveRules) {
      if (item.matchConfidence >= rule.matchThreshold) {
        let resolvedValue: unknown;

        switch (rule.resolutionAction) {
          case 'accept_source':
            resolvedValue = item.sourceRecord?.amount;
            break;
          case 'accept_target':
            resolvedValue = item.targetRecord?.amount;
            break;
          case 'average':
            resolvedValue = item.sourceRecord && item.targetRecord
              ? (item.sourceRecord.amount + item.targetRecord.amount) / 2
              : item.sourceRecord?.amount || item.targetRecord?.amount;
            break;
          case 'higher':
            resolvedValue = Math.max(
              item.sourceRecord?.amount || 0,
              item.targetRecord?.amount || 0
            );
            break;
          case 'lower':
            resolvedValue = Math.min(
              item.sourceRecord?.amount || Infinity,
              item.targetRecord?.amount || Infinity
            );
            break;
        }

        return {
          ...item,
          resolution: {
            action: rule.resolutionAction === 'average' || rule.resolutionAction === 'higher' || rule.resolutionAction === 'lower'
              ? 'manual_override'
              : rule.resolutionAction || 'accept_source',
            resolvedValue,
            resolvedBy: userId,
            resolvedAt: new Date().toISOString(),
            notes: `Auto-resolved by rule: ${rule.name}`,
          },
        };
      }
    }

    return item;
  });
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate reconciliation session completeness
 */
export function validateReconciliationSession(
  session: ReconciliationSession,
  items: ReconciliationItem[]
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for unresolved high-severity discrepancies
  const unresolvedHigh = items.filter(
    (i) => i.discrepancy?.severity === 'high' && !i.resolution
  );
  if (unresolvedHigh.length > 0) {
    errors.push(`${unresolvedHigh.length} high-severity discrepancies remain unresolved`);
  }

  // Check for missing source records
  const missingSource = items.filter((i) => i.matchStatus === 'missing_source');
  if (missingSource.length > 0) {
    warnings.push(`${missingSource.length} records exist in target but not in source`);
  }

  // Check for missing target records
  const missingTarget = items.filter((i) => i.matchStatus === 'missing_target');
  if (missingTarget.length > 0) {
    warnings.push(`${missingTarget.length} records exist in source but not in target`);
  }

  // Check overall confidence
  if (session.summary && session.summary.overallConfidence < 80) {
    warnings.push(`Overall confidence is ${session.summary.overallConfidence}% - consider manual review`);
  }

  // Check amount difference threshold
  if (session.summary) {
    const diffPercentage = Math.abs(session.summary.percentageDifference);
    if (diffPercentage > 5) {
      errors.push(`Amount difference exceeds 5% threshold (${diffPercentage.toFixed(2)}%)`);
    } else if (diffPercentage > 1) {
      warnings.push(`Amount difference is ${diffPercentage.toFixed(2)}%`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// REPORTING
// ============================================

/**
 * Generate reconciliation report data
 */
export function generateReportData(
  session: ReconciliationSession,
  items: ReconciliationItem[]
): {
  topDiscrepancies: Array<{ itemId: string; amount: number; description: string; severity: 'low' | 'medium' | 'high' }>;
  byEmployee: Array<{ entityId: string; itemCount: number; matchedCount: number; discrepancyAmount: number }>;
} {
  // Get top discrepancies
  const discrepancyItems = items
    .filter((i) => i.discrepancy)
    .sort((a, b) => Math.abs(b.discrepancy!.amountDifference) - Math.abs(a.discrepancy!.amountDifference))
    .slice(0, 10);

  const topDiscrepancies = discrepancyItems.map((item) => ({
    itemId: item.id,
    amount: item.discrepancy!.amountDifference,
    description: item.sourceRecord?.description || item.targetRecord?.description || 'No description',
    severity: item.discrepancy!.severity,
  }));

  // Aggregate by employee
  const employeeMap = new Map<string, { itemCount: number; matchedCount: number; discrepancyAmount: number }>();

  for (const item of items) {
    const entityId = item.sourceRecord?.entityId || item.targetRecord?.entityId || 'unknown';
    const existing = employeeMap.get(entityId) || { itemCount: 0, matchedCount: 0, discrepancyAmount: 0 };

    existing.itemCount++;
    if (item.matchStatus === 'matched') {
      existing.matchedCount++;
    }
    if (item.discrepancy) {
      existing.discrepancyAmount += Math.abs(item.discrepancy.amountDifference);
    }

    employeeMap.set(entityId, existing);
  }

  const byEmployee = Array.from(employeeMap.entries())
    .map(([entityId, stats]) => ({
      entityId,
      ...stats,
    }))
    .sort((a, b) => b.discrepancyAmount - a.discrepancyAmount);

  return {
    topDiscrepancies,
    byEmployee,
  };
}
