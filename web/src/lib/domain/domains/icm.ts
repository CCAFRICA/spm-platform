/**
 * ICM Domain Agent Registration
 *
 * Domain-specific content lives ONLY in this file.
 * Domain language is acceptable here — this IS the domain agent.
 */

import type { DomainRegistration } from '../domain-registry';
import { registerDomain } from '../domain-registry';

export const ICM_DOMAIN: DomainRegistration = {
  domainId: 'icm',
  displayName: 'Incentive Compensation Management',
  version: '1.0.0',

  terminology: {
    entity: 'employee',
    entityGroup: 'store',
    outcome: 'payout',
    outcomeVerb: 'earned',
    ruleset: 'compensation plan',
    period: 'pay period',
    performance: 'attainment',
    target: 'quota',
  },

  requiredPrimitives: [
    'bounded_lookup_1d',
    'bounded_lookup_2d',
    'scalar_multiply',
    'conditional_gate',
    'aggregate',
    'ratio',
    'constant',
    'weighted_blend',
  ],

  vocabularyExtensions: [],

  benchmarkTypes: [
    'legacy_system_export',
    'manual_spreadsheet',
    'prior_period_results',
  ],

  disputeCategories: [
    'data_error',
    'calculation_error',
    'plan_interpretation',
    'missing_transaction',
    'store_assignment',
    'tier_placement',
  ],

  complianceFrameworks: ['SOC2', 'GAAP'],

  verticalHints: ['retail', 'telecom', 'pharma', 'financial_services', 'technology'],

  interpretationContext: `
    Plans define how entities earn outcomes based on performance metrics.
    Plans typically have multiple components, each with its own calculation logic.
    Common patterns: tier tables (1D lookup on performance ratio), matrix tables
    (2D lookup on performance ratio × group aggregate), percentage of metric value,
    conditional eligibility gates, scope blending (individual + team).
    Plans may have variants (e.g., certified vs non-certified entity classification).
    Clawback and adjustment provisions are common for temporal corrections.
  `,
};

// Register on import
registerDomain(ICM_DOMAIN);
