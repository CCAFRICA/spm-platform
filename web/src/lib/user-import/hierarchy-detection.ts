/**
 * Hierarchy Auto-Detection Engine
 *
 * Detects organizational hierarchy from import data using 7 detection signals.
 * Implements confidence scoring and relationship inversion detection.
 */

import type {
  HierarchySignal,
  SignalObservation,
  HierarchyDetectionResult,
  HierarchyConflict,
  RelationshipInversion,
  ImportRecord,
} from '@/types/user-import';

// ============================================
// SIGNAL WEIGHTS
// ============================================

/**
 * Weight assigned to each detection signal for confidence calculation.
 * Higher weight = more reliable signal.
 */
const SIGNAL_WEIGHTS: Record<HierarchySignal, number> = {
  explicit_manager_id: 1.0, // Most reliable - direct reference
  title_pattern: 0.7, // Job titles often indicate level
  department_structure: 0.6, // Department names can show hierarchy
  transaction_approval: 0.8, // Approval patterns are strong indicators
  compensation_tier: 0.65, // Comp levels correlate with hierarchy
  location_rollup: 0.5, // Location can indicate regional hierarchy
  email_domain_pattern: 0.4, // Least reliable - many exceptions
};

// ============================================
// TITLE PATTERNS
// ============================================

/**
 * Title patterns mapped to organizational levels.
 * Level 1 = highest (CEO), higher numbers = lower in org.
 */
const TITLE_LEVEL_PATTERNS: Array<{ pattern: RegExp; level: number; confidence: number }> = [
  // C-Suite
  { pattern: /\b(ceo|chief\s+executive|presidente)\b/i, level: 1, confidence: 0.95 },
  { pattern: /\b(coo|cfo|cto|cmo|cio|chro|chief\s+\w+\s+officer)\b/i, level: 2, confidence: 0.9 },

  // Executive
  { pattern: /\b(evp|executive\s+vice\s+president)\b/i, level: 3, confidence: 0.85 },
  { pattern: /\b(svp|senior\s+vice\s+president)\b/i, level: 3, confidence: 0.85 },
  { pattern: /\b(vp|vice\s+president|vicepresidente)\b/i, level: 4, confidence: 0.8 },

  // Director
  { pattern: /\b(senior\s+director)\b/i, level: 5, confidence: 0.75 },
  { pattern: /\b(director|directora?)\b/i, level: 6, confidence: 0.7 },

  // Manager
  { pattern: /\b(senior\s+manager)\b/i, level: 7, confidence: 0.7 },
  { pattern: /\b(manager|gerente|jefe)\b/i, level: 8, confidence: 0.65 },
  { pattern: /\b(supervisor|supervisora?)\b/i, level: 9, confidence: 0.6 },
  { pattern: /\b(team\s+lead|lead)\b/i, level: 9, confidence: 0.55 },

  // Individual contributor
  { pattern: /\b(senior\s+(specialist|analyst|associate|engineer|developer))\b/i, level: 10, confidence: 0.5 },
  { pattern: /\b(specialist|analyst|associate|engineer|developer)\b/i, level: 11, confidence: 0.45 },
  { pattern: /\b(junior|entry|intern|trainee|asistente)\b/i, level: 12, confidence: 0.4 },
];

// ============================================
// DEPARTMENT PATTERNS
// ============================================

/**
 * Patterns that suggest department hierarchy structure
 */
const DEPARTMENT_HIERARCHY_PATTERNS = [
  // Corporate > Regional > Local
  { pattern: /^corporate/i, level: 1 },
  { pattern: /^(region|regional)/i, level: 2 },
  { pattern: /^(district|area)/i, level: 3 },
  { pattern: /^(store|location|branch)/i, level: 4 },

  // Functional hierarchy
  { pattern: /^(executive|c-suite)/i, level: 1 },
  { pattern: /(operations|finance|hr|marketing|sales|it)$/i, level: 2 },
];

// ============================================
// DETECTION FUNCTIONS
// ============================================

/**
 * Detect hierarchy signals from explicit manager references
 */
export function detectExplicitManagerSignal(
  record: ImportRecord,
  allRecords: ImportRecord[],
  sourceId: string
): SignalObservation | null {
  const parsed = record.parsedData;
  if (!parsed) return null;

  // Look for explicit manager ID
  if (parsed.managerId) {
    const managerRecord = allRecords.find(
      (r) =>
        r.parsedData?.employeeNumber === parsed.managerId ||
        r.parsedData?.email === parsed.managerId
    );

    if (managerRecord) {
      return {
        signal: 'explicit_manager_id',
        sourceId,
        observedValue: parsed.managerId,
        inferredRelationship: {
          type: 'reports_to',
          targetEmployeeId: managerRecord.id,
          confidence: 0.95,
        },
        confidence: 0.95,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Look for manager email
  if (parsed.managerEmail) {
    const managerRecord = allRecords.find(
      (r) => r.parsedData?.email?.toLowerCase() === parsed.managerEmail?.toLowerCase()
    );

    if (managerRecord) {
      return {
        signal: 'explicit_manager_id',
        sourceId,
        observedValue: parsed.managerEmail,
        inferredRelationship: {
          type: 'reports_to',
          targetEmployeeId: managerRecord.id,
          confidence: 0.9,
        },
        confidence: 0.9,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Look for manager name (lower confidence due to name ambiguity)
  if (parsed.managerName) {
    const nameParts = parsed.managerName.toLowerCase().split(/\s+/);
    const managerRecords = allRecords.filter((r) => {
      const firstName = r.parsedData?.firstName?.toLowerCase();
      const lastName = r.parsedData?.lastName?.toLowerCase();
      return nameParts.includes(firstName || '') || nameParts.includes(lastName || '');
    });

    if (managerRecords.length === 1) {
      return {
        signal: 'explicit_manager_id',
        sourceId,
        observedValue: parsed.managerName,
        inferredRelationship: {
          type: 'reports_to',
          targetEmployeeId: managerRecords[0].id,
          confidence: 0.7,
        },
        confidence: 0.7,
        timestamp: new Date().toISOString(),
      };
    }
  }

  return null;
}

/**
 * Detect hierarchy signals from job title patterns
 */
export function detectTitlePatternSignal(
  record: ImportRecord,
  sourceId: string
): SignalObservation | null {
  const title = record.parsedData?.title;
  if (!title) return null;

  for (const { pattern, level: titleLevel, confidence } of TITLE_LEVEL_PATTERNS) {
    if (pattern.test(title)) {
      return {
        signal: 'title_pattern',
        sourceId,
        observedValue: `${title} (level ${titleLevel})`,
        inferredRelationship: undefined, // Title doesn't tell us who the manager is
        confidence,
        timestamp: new Date().toISOString(),
      };
    }
  }

  return null;
}

/**
 * Detect hierarchy signals from department structure
 */
export function detectDepartmentSignal(
  record: ImportRecord,
  allRecords: ImportRecord[],
  sourceId: string
): SignalObservation | null {
  const department = record.parsedData?.department;
  if (!department) return null;

  // Check for hierarchical department naming
  for (const { pattern, level: deptLevel } of DEPARTMENT_HIERARCHY_PATTERNS) {
    if (pattern.test(department)) {
      return {
        signal: 'department_structure',
        sourceId,
        observedValue: department,
        confidence: 0.5 + (1 - deptLevel / 10) * 0.3, // Higher levels = higher confidence
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Check for sub-department patterns (e.g., "Sales > West > Seattle")
  if (department.includes('>') || department.includes('-')) {
    const parts = department.split(/[>\-]/);
    if (parts.length >= 2) {
      // Find records in parent department
      const parentDept = parts.slice(0, -1).join('>').trim();
      const parentRecords = allRecords.filter(
        (r) => r.parsedData?.department?.trim() === parentDept
      );

      if (parentRecords.length > 0) {
        // Look for manager-level titles in parent department
        const potentialManagers = parentRecords.filter((r) => {
          const title = r.parsedData?.title?.toLowerCase() || '';
          return /manager|director|vp|head/i.test(title);
        });

        if (potentialManagers.length === 1) {
          return {
            signal: 'department_structure',
            sourceId,
            observedValue: department,
            inferredRelationship: {
              type: 'reports_to',
              targetEmployeeId: potentialManagers[0].id,
              confidence: 0.6,
            },
            confidence: 0.6,
            timestamp: new Date().toISOString(),
          };
        }
      }
    }
  }

  return null;
}

/**
 * Detect hierarchy from compensation tiers
 */
export function detectCompensationSignal(
  record: ImportRecord,
  allRecords: ImportRecord[],
  sourceId: string
): SignalObservation | null {
  // This would require compensation data in the import
  // Placeholder for when comp data is available
  const rawData = record.rawData as Record<string, unknown>;
  const salary = rawData.salary || rawData.compensation || rawData.base_pay;

  if (typeof salary === 'number' && salary > 0) {
    // Calculate percentile in the dataset
    const allSalaries = allRecords
      .map((r) => {
        const raw = r.rawData as Record<string, unknown>;
        return raw.salary || raw.compensation || raw.base_pay;
      })
      .filter((s): s is number => typeof s === 'number' && s > 0)
      .sort((a, b) => b - a);

    const rank = allSalaries.indexOf(salary);
    const percentile = rank / allSalaries.length;

    // Higher percentile = likely higher in org
    // Calculate inferred level from compensation tier
    const inferredLevel =
      percentile <= 0.01 ? 1 :
      percentile <= 0.05 ? 2 :
      percentile <= 0.1 ? 3 :
      percentile <= 0.2 ? 4 :
      percentile <= 0.4 ? 5 : 6;

    return {
      signal: 'compensation_tier',
      sourceId,
      observedValue: `${salary} (level ${inferredLevel})`,
      confidence: 0.5 + percentile * 0.3, // Higher earners = more confident
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Detect hierarchy from location rollup patterns
 */
export function detectLocationSignal(
  record: ImportRecord,
  allRecords: ImportRecord[],
  sourceId: string
): SignalObservation | null {
  const location = record.parsedData?.location;
  if (!location) return null;

  // Look for corporate/regional/local patterns
  if (/corporate|headquarters|hq/i.test(location)) {
    return {
      signal: 'location_rollup',
      sourceId,
      observedValue: location,
      confidence: 0.6,
      timestamp: new Date().toISOString(),
    };
  }

  // Check for regional manager patterns
  if (/region|district|territory/i.test(location)) {
    return {
      signal: 'location_rollup',
      sourceId,
      observedValue: location,
      confidence: 0.5,
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

// ============================================
// HIERARCHY DETECTION ENGINE
// ============================================

/**
 * Run full hierarchy detection for an employee record
 */
export function detectHierarchy(
  record: ImportRecord,
  allRecords: ImportRecord[],
  sourceId: string
): HierarchyDetectionResult {
  const detectedSignals: SignalObservation[] = [];
  const conflicts: HierarchyConflict[] = [];

  // Collect all signals
  const explicitSignal = detectExplicitManagerSignal(record, allRecords, sourceId);
  if (explicitSignal) detectedSignals.push(explicitSignal);

  const titleSignal = detectTitlePatternSignal(record, sourceId);
  if (titleSignal) detectedSignals.push(titleSignal);

  const deptSignal = detectDepartmentSignal(record, allRecords, sourceId);
  if (deptSignal) detectedSignals.push(deptSignal);

  const compSignal = detectCompensationSignal(record, allRecords, sourceId);
  if (compSignal) detectedSignals.push(compSignal);

  const locationSignal = detectLocationSignal(record, allRecords, sourceId);
  if (locationSignal) detectedSignals.push(locationSignal);

  // Aggregate manager inference
  const managerSignals = detectedSignals.filter((s) => s.inferredRelationship?.type === 'reports_to');
  let inferredManager: HierarchyDetectionResult['inferredManager'];

  if (managerSignals.length > 0) {
    // Group by manager ID
    const managerVotes: Record<string, { count: number; totalConfidence: number; signals: HierarchySignal[] }> = {};

    for (const signal of managerSignals) {
      const managerId = signal.inferredRelationship!.targetEmployeeId;
      if (!managerVotes[managerId]) {
        managerVotes[managerId] = { count: 0, totalConfidence: 0, signals: [] };
      }
      managerVotes[managerId].count++;
      managerVotes[managerId].totalConfidence += signal.confidence * SIGNAL_WEIGHTS[signal.signal];
      managerVotes[managerId].signals.push(signal.signal);
    }

    // Pick the manager with highest weighted confidence
    const sortedCandidates = Object.entries(managerVotes).sort(
      ([, a], [, b]) => b.totalConfidence - a.totalConfidence
    );

    if (sortedCandidates.length > 0) {
      const [bestManagerId, bestVote] = sortedCandidates[0];
      inferredManager = {
        employeeId: bestManagerId,
        confidence: Math.min(100, Math.round(bestVote.totalConfidence * 100)),
        supportingSignals: bestVote.signals,
      };

      // Check for manager conflicts
      if (sortedCandidates.length > 1) {
        const [, secondVote] = sortedCandidates[1];
        if (secondVote.totalConfidence > bestVote.totalConfidence * 0.7) {
          conflicts.push({
            type: 'manager_mismatch',
            employeeIds: [record.id, sortedCandidates[0][0], sortedCandidates[1][0]],
            signals: [...bestVote.signals, ...secondVote.signals],
            description: 'Multiple potential managers detected with similar confidence',
            severity: 'medium',
            suggestedResolution: 'Review employee record to confirm correct reporting relationship',
          });
        }
      }
    }
  }

  // Calculate overall confidence
  const overallConfidence = calculateOverallConfidence(detectedSignals, inferredManager);

  return {
    employeeId: record.id,
    detectedSignals,
    inferredManager,
    inferredLevel: inferLevelFromSignals(detectedSignals),
    conflicts,
    overallConfidence,
    requiresManualReview: overallConfidence < 70 || conflicts.length > 0,
  };
}

/**
 * Calculate overall hierarchy confidence from signals
 */
function calculateOverallConfidence(
  signals: SignalObservation[],
  inferredManager?: HierarchyDetectionResult['inferredManager']
): number {
  if (signals.length === 0) return 0;

  // Weight-adjusted average of signal confidences
  let totalWeight = 0;
  let weightedSum = 0;

  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.signal];
    totalWeight += weight;
    weightedSum += signal.confidence * weight;
  }

  const baseConfidence = (weightedSum / totalWeight) * 100;

  // Boost confidence if we have an inferred manager
  if (inferredManager) {
    return Math.min(100, baseConfidence * 1.1);
  }

  return Math.round(baseConfidence);
}

/**
 * Infer organizational level from signals
 */
function inferLevelFromSignals(
  signals: SignalObservation[]
): HierarchyDetectionResult['inferredLevel'] | undefined {
  const titleSignal = signals.find((s) => s.signal === 'title_pattern');

  if (titleSignal) {
    const title = titleSignal.observedValue;
    for (const { pattern, level, confidence } of TITLE_LEVEL_PATTERNS) {
      if (pattern.test(title)) {
        return {
          level,
          confidence: Math.round(confidence * 100),
          supportingSignals: ['title_pattern'],
        };
      }
    }
  }

  return undefined;
}

// ============================================
// RELATIONSHIP INVERSION DETECTION
// ============================================

/**
 * Detect relationship inversions across sources
 */
export function detectInversions(
  results: HierarchyDetectionResult[]
): RelationshipInversion[] {
  const inversions: RelationshipInversion[] = [];

  // Build a map of employee -> manager by source
  const managerBySource: Record<string, Record<string, string>> = {};

  for (const result of results) {
    if (!result.inferredManager) continue;

    for (const signal of result.detectedSignals) {
      if (signal.inferredRelationship?.type === 'reports_to') {
        const sourceId = signal.sourceId;
        if (!managerBySource[sourceId]) {
          managerBySource[sourceId] = {};
        }
        managerBySource[sourceId][result.employeeId] = signal.inferredRelationship.targetEmployeeId;
      }
    }
  }

  // Check for inversions
  for (const [sourceA, relationshipsA] of Object.entries(managerBySource)) {
    for (const [sourceB, relationshipsB] of Object.entries(managerBySource)) {
      if (sourceA >= sourceB) continue; // Skip duplicates

      for (const [empA, managerA] of Object.entries(relationshipsA)) {
        // In source A, empA reports to managerA
        // Check if source B says managerA reports to empA (inversion!)
        if (relationshipsB[managerA] === empA) {
          inversions.push({
            employeeA: empA,
            employeeB: managerA,
            sourceASaysAReportsToB: true,
            sourceBSaysBReportsToA: true,
            sourceA,
            sourceB,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  return inversions;
}

/**
 * Detect circular references in hierarchy
 */
export function detectCircularReferences(
  results: HierarchyDetectionResult[]
): HierarchyConflict[] {
  const conflicts: HierarchyConflict[] = [];

  // Build adjacency list (employee -> manager)
  const reportsTo: Record<string, string> = {};
  for (const result of results) {
    if (result.inferredManager) {
      reportsTo[result.employeeId] = result.inferredManager.employeeId;
    }
  }

  // Check for cycles using DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(employeeId: string, path: string[]): string[] | null {
    if (inStack.has(employeeId)) {
      // Found a cycle - return the path from the cycle start
      const cycleStart = path.indexOf(employeeId);
      return path.slice(cycleStart);
    }

    if (visited.has(employeeId)) return null;

    visited.add(employeeId);
    inStack.add(employeeId);
    path.push(employeeId);

    const managerId = reportsTo[employeeId];
    if (managerId) {
      const cycle = hasCycle(managerId, path);
      if (cycle) return cycle;
    }

    inStack.delete(employeeId);
    path.pop();
    return null;
  }

  for (const employeeId of Object.keys(reportsTo)) {
    if (!visited.has(employeeId)) {
      const cycle = hasCycle(employeeId, []);
      if (cycle) {
        conflicts.push({
          type: 'circular_reference',
          employeeIds: cycle,
          signals: ['explicit_manager_id'],
          description: `Circular reporting structure detected: ${cycle.join(' -> ')} -> ${cycle[0]}`,
          severity: 'high',
          suggestedResolution: 'Review and correct the reporting chain to remove the circular reference',
        });
      }
    }
  }

  return conflicts;
}
