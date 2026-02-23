/**
 * Rebate Domain Agent Registration (Template — v0.1.0)
 *
 * Domain-specific content lives ONLY in this file.
 * Domain language is acceptable here — this IS the domain agent.
 */

import type { DomainRegistration } from '../domain-registry';
import { registerDomain } from '../domain-registry';

export const REBATE_DOMAIN: DomainRegistration = {
  domainId: 'rebate',
  displayName: 'B2B Rebate Management',
  version: '0.1.0',

  terminology: {
    entity: 'partner',
    entityGroup: 'distributor',
    outcome: 'rebate',
    outcomeVerb: 'accrued',
    ruleset: 'rebate agreement',
    period: 'fiscal quarter',
    performance: 'volume',
    target: 'threshold',
  },

  requiredPrimitives: [
    'bounded_lookup_1d',
    'scalar_multiply',
    'conditional_gate',
    'aggregate',
    'ratio',
    'constant',
  ],

  vocabularyExtensions: [],

  benchmarkTypes: [
    'erp_export',
    'accounting_reconciliation',
  ],

  disputeCategories: [
    'tier_misapplication',
    'volume_discrepancy',
    'program_eligibility',
    'timing_dispute',
  ],

  complianceFrameworks: ['SOC2', 'GAAP', 'ASC_606'],

  verticalHints: ['manufacturing', 'distribution', 'technology', 'beverage'],

  interpretationContext: `
    Agreements define retrospective payments to partners based on purchase volume
    or revenue thresholds. Tiered structures are common: higher volume = higher rate.
    Stepped (rate per tier band) and retrospective (full rate on all units) calculation
    methods exist. Multi-year agreements with escalating tiers are common.
  `,
};

registerDomain(REBATE_DOMAIN);
