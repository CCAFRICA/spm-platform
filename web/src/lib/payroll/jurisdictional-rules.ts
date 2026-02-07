/**
 * Jurisdictional Rules Engine
 *
 * Resolves payroll rules based on 6-layer jurisdiction hierarchy.
 * Federal < State < County < City < District < Company
 */

import type {
  JurisdictionalRule,
  JurisdictionLevel,
  JurisdictionalRuleType,
  ResolvedRules,
  RuleConflict,
} from '@/types/payroll-period';

// ============================================
// JURISDICTION PRECEDENCE
// ============================================

/**
 * Precedence order for jurisdictions.
 * Higher number = higher precedence (overrides lower).
 */
const JURISDICTION_PRECEDENCE: Record<JurisdictionLevel, number> = {
  federal: 1,
  state: 2,
  county: 3,
  city: 4,
  district: 5,
  company: 6,
};

// ============================================
// RESOLUTION STRATEGIES
// ============================================

type ResolutionStrategy = 'higher_precedence' | 'most_restrictive' | 'most_permissive' | 'sum';

/**
 * Resolution strategy per rule type.
 * Determines how conflicting rules are resolved.
 */
const RULE_RESOLUTION_STRATEGIES: Record<JurisdictionalRuleType, ResolutionStrategy> = {
  minimum_wage: 'most_restrictive', // Use highest minimum wage
  overtime_threshold: 'most_restrictive', // Use lowest threshold (more protective)
  tax_rate: 'sum', // Tax rates are additive
  bonus_treatment: 'higher_precedence',
  commission_timing: 'most_restrictive', // Most protective for employee
  clawback_limit: 'most_restrictive', // Shortest clawback period
  payment_timing: 'most_restrictive', // Fastest payment required
  deduction_order: 'higher_precedence',
  garnishment_priority: 'higher_precedence',
};

// ============================================
// RULE RESOLUTION ENGINE
// ============================================

/**
 * Resolve applicable rules for an employee based on their jurisdictions
 */
export function resolveRulesForEmployee(
  employeeId: string,
  employeeJurisdictions: Array<{ level: JurisdictionLevel; code: string }>,
  allRules: JurisdictionalRule[],
  asOfDate: string = new Date().toISOString()
): ResolvedRules {
  const evaluatedAt = new Date().toISOString();
  const asOfDateObj = new Date(asOfDate);

  // Filter rules that are effective for the given date
  const effectiveRules = allRules.filter((rule) => {
    const effectiveFrom = new Date(rule.effectiveFrom);
    const effectiveTo = rule.effectiveTo ? new Date(rule.effectiveTo) : null;
    return effectiveFrom <= asOfDateObj && (!effectiveTo || effectiveTo >= asOfDateObj);
  });

  // Group rules by jurisdiction
  const rulesByJurisdiction: Record<string, JurisdictionalRule[]> = {};

  for (const { level, code } of employeeJurisdictions) {
    const key = `${level}:${code}`;
    rulesByJurisdiction[key] = effectiveRules.filter(
      (rule) => rule.level === level && rule.jurisdiction === code
    );
  }

  // Build jurisdiction list with rule IDs
  const jurisdictions = employeeJurisdictions.map(({ level, code }) => ({
    level,
    jurisdiction: code,
    ruleIds: rulesByJurisdiction[`${level}:${code}`]?.map((r) => r.id) || [],
  }));

  // Collect all applicable rules
  const applicableRules = Object.values(rulesByJurisdiction).flat();

  // Resolve each rule type
  const conflicts: RuleConflict[] = [];
  const resolvedValues: ResolvedRules['resolvedValues'] = {};

  // Resolve minimum wage
  const minWageResult = resolveRuleType(applicableRules, 'minimum_wage');
  if (minWageResult.value !== undefined) {
    resolvedValues.minimumWage = minWageResult.value as number;
  }
  if (minWageResult.conflict) {
    conflicts.push(minWageResult.conflict);
  }

  // Resolve overtime threshold
  const overtimeResult = resolveRuleType(applicableRules, 'overtime_threshold');
  if (overtimeResult.value !== undefined) {
    const config = overtimeResult.value as { threshold: number; multiplier: number };
    resolvedValues.overtimeThreshold = config.threshold;
    resolvedValues.overtimeMultiplier = config.multiplier;
  }
  if (overtimeResult.conflict) {
    conflicts.push(overtimeResult.conflict);
  }

  // Resolve commission timing
  const commissionResult = resolveRuleType(applicableRules, 'commission_timing');
  if (commissionResult.value !== undefined) {
    resolvedValues.commissionPayOnEarned = (commissionResult.value as { payOnEarned: boolean }).payOnEarned;
  }
  if (commissionResult.conflict) {
    conflicts.push(commissionResult.conflict);
  }

  // Resolve clawback limits
  const clawbackResult = resolveRuleType(applicableRules, 'clawback_limit');
  if (clawbackResult.value !== undefined) {
    const config = clawbackResult.value as { allowed: boolean; maxMonths?: number };
    resolvedValues.clawbackAllowed = config.allowed;
    resolvedValues.clawbackMaxMonths = config.maxMonths;
  }
  if (clawbackResult.conflict) {
    conflicts.push(clawbackResult.conflict);
  }

  // Resolve payment timing
  const paymentResult = resolveRuleType(applicableRules, 'payment_timing');
  if (paymentResult.value !== undefined) {
    resolvedValues.maxPaymentDelay = (paymentResult.value as { maxDays: number }).maxDays;
  }
  if (paymentResult.conflict) {
    conflicts.push(paymentResult.conflict);
  }

  return {
    employeeId,
    evaluatedAt,
    jurisdictions,
    resolvedValues,
    conflicts,
  };
}

/**
 * Resolve a specific rule type from a set of rules
 */
function resolveRuleType(
  rules: JurisdictionalRule[],
  ruleType: JurisdictionalRuleType
): { value?: unknown; conflict?: RuleConflict } {
  const relevantRules = rules.filter((r) => r.type === ruleType);

  if (relevantRules.length === 0) {
    return {};
  }

  if (relevantRules.length === 1) {
    return { value: extractRuleValue(relevantRules[0]) };
  }

  // Multiple rules - need to resolve conflict
  const strategy = RULE_RESOLUTION_STRATEGIES[ruleType];

  // Sort by precedence
  const sortedRules = [...relevantRules].sort(
    (a, b) => JURISDICTION_PRECEDENCE[b.level] - JURISDICTION_PRECEDENCE[a.level]
  );

  let resolvedValue: unknown;
  let resolution: RuleConflict['resolution'] = 'higher_precedence';

  switch (strategy) {
    case 'higher_precedence':
      resolvedValue = extractRuleValue(sortedRules[0]);
      break;

    case 'most_restrictive':
      resolvedValue = findMostRestrictive(sortedRules, ruleType);
      resolution = 'most_restrictive';
      break;

    case 'sum':
      resolvedValue = sumRuleValues(sortedRules, ruleType);
      resolution = 'higher_precedence'; // Sum doesn't have conflict
      break;

    default:
      resolvedValue = extractRuleValue(sortedRules[0]);
  }

  // Build conflict info
  const conflict: RuleConflict = {
    ruleType,
    rules: relevantRules.map((r) => ({
      ruleId: r.id,
      jurisdiction: r.jurisdiction,
      value: extractRuleValue(r),
    })),
    resolution,
    resolvedValue,
  };

  return { value: resolvedValue, conflict };
}

/**
 * Extract the relevant value from a rule's config
 */
function extractRuleValue(rule: JurisdictionalRule): unknown {
  const config = rule.config;

  switch (rule.type) {
    case 'minimum_wage':
      return config.minimumWage?.rate;

    case 'overtime_threshold':
      return {
        threshold: config.overtime?.weeklyThreshold || config.overtime?.dailyThreshold,
        multiplier: config.overtime?.multiplier,
      };

    case 'commission_timing':
      return {
        payOnEarned: config.commissionTiming?.payOnEarned,
      };

    case 'clawback_limit':
      return {
        allowed: config.clawback?.allowed,
        maxMonths: config.clawback?.maxMonths,
      };

    case 'payment_timing':
      return {
        maxDays: config.paymentTiming?.maxDaysAfterPeriodEnd,
      };

    case 'tax_rate':
      return config.tax?.rate;

    default:
      return null;
  }
}

/**
 * Find the most restrictive value (most protective for employee)
 */
function findMostRestrictive(
  rules: JurisdictionalRule[],
  ruleType: JurisdictionalRuleType
): unknown {
  const values = rules.map((r) => extractRuleValue(r));

  switch (ruleType) {
    case 'minimum_wage':
      // Highest minimum wage is most restrictive
      return Math.max(...(values.filter((v) => typeof v === 'number') as number[]));

    case 'overtime_threshold':
      // Lowest threshold is most restrictive (more overtime paid)
      const thresholds = values as Array<{ threshold: number; multiplier: number }>;
      const minThreshold = Math.min(...thresholds.map((t) => t.threshold));
      const maxMultiplier = Math.max(...thresholds.map((t) => t.multiplier));
      return { threshold: minThreshold, multiplier: maxMultiplier };

    case 'clawback_limit':
      // Shortest clawback period is most restrictive
      const clawbacks = values as Array<{ allowed: boolean; maxMonths?: number }>;
      const restrictive = clawbacks.find((c) => !c.allowed);
      if (restrictive) return restrictive;
      const minMonths = Math.min(...clawbacks.filter((c) => c.maxMonths).map((c) => c.maxMonths!));
      return { allowed: true, maxMonths: minMonths };

    case 'payment_timing':
      // Fastest payment is most restrictive
      const timings = values as Array<{ maxDays: number }>;
      return { maxDays: Math.min(...timings.map((t) => t.maxDays)) };

    default:
      return values[0];
  }
}

/**
 * Sum rule values (for additive rules like taxes)
 */
function sumRuleValues(
  rules: JurisdictionalRule[],
  ruleType: JurisdictionalRuleType
): unknown {
  const values = rules.map((r) => extractRuleValue(r));

  if (ruleType === 'tax_rate') {
    return (values.filter((v) => typeof v === 'number') as number[]).reduce((sum, v) => sum + v, 0);
  }

  return values[0];
}

// ============================================
// JURISDICTION VALIDATION
// ============================================

/**
 * Validate that a jurisdiction code is valid for a level
 */
export function validateJurisdiction(
  level: JurisdictionLevel,
  code: string
): { valid: boolean; error?: string } {
  // Basic validation - in production this would check against a database
  if (!code || code.trim() === '') {
    return { valid: false, error: 'Jurisdiction code is required' };
  }

  switch (level) {
    case 'federal':
      // Should be a country code
      if (code.length !== 2) {
        return { valid: false, error: 'Federal jurisdiction should be a 2-letter country code' };
      }
      break;

    case 'state':
      // Should be a state/province code
      if (code.length > 3) {
        return { valid: false, error: 'State jurisdiction should be a 2-3 letter code' };
      }
      break;

    default:
      // City, county, district, company - more flexible
      if (code.length > 100) {
        return { valid: false, error: 'Jurisdiction code is too long' };
      }
  }

  return { valid: true };
}

/**
 * Get the display name for a jurisdiction level
 */
export function getJurisdictionLevelLabel(
  level: JurisdictionLevel,
  isSpanish: boolean = false
): string {
  const labels: Record<JurisdictionLevel, { en: string; es: string }> = {
    federal: { en: 'Federal', es: 'Federal' },
    state: { en: 'State/Province', es: 'Estado/Provincia' },
    county: { en: 'County', es: 'Condado' },
    city: { en: 'City', es: 'Ciudad' },
    district: { en: 'District', es: 'Distrito' },
    company: { en: 'Company', es: 'Empresa' },
  };

  return isSpanish ? labels[level].es : labels[level].en;
}
