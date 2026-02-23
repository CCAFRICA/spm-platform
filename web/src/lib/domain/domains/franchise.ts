/**
 * Franchise Domain Agent Registration (Template — v0.1.0)
 *
 * Domain-specific content lives ONLY in this file.
 * Domain language is acceptable here — this IS the domain agent.
 */

import type { DomainRegistration } from '../domain-registry';
import { registerDomain } from '../domain-registry';

export const FRANCHISE_DOMAIN: DomainRegistration = {
  domainId: 'franchise',
  displayName: 'Franchise Royalty Management',
  version: '0.1.0',

  terminology: {
    entity: 'franchisee',
    entityGroup: 'location',
    outcome: 'royalty',
    outcomeVerb: 'owed',
    ruleset: 'franchise agreement',
    period: 'reporting month',
    performance: 'gross sales',
    target: 'minimum royalty',
  },

  requiredPrimitives: [
    'scalar_multiply',
    'bounded_lookup_1d',
    'conditional_gate',
    'aggregate',
    'constant',
  ],

  vocabularyExtensions: [],

  benchmarkTypes: [
    'pos_system_export',
    'financial_statement',
  ],

  disputeCategories: [
    'sales_reporting',
    'fee_calculation',
    'territory_dispute',
    'compliance_penalty',
  ],

  complianceFrameworks: ['SOC2', 'GAAP', 'ASC_606', 'FTC_franchise_rule'],

  verticalHints: ['food_service', 'retail', 'hospitality', 'fitness', 'automotive'],

  interpretationContext: `
    Agreements define obligations as percentage of gross revenue, often with
    declining tiers for higher volumes, minimum floors, and additional fees
    (advertising fund, technology fee). Multi-unit operators may receive volume
    discounts. Sliding scale structures are common.
  `,
};

registerDomain(FRANCHISE_DOMAIN);
