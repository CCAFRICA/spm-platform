/**
 * Domain Registry — Registration and Vocabulary for Domain Agents
 *
 * The two-tier boundary: Foundational Agents (src/lib/agents/, src/lib/calculation/)
 * NEVER import from here. Domain Agents import from both.
 *
 * This file defines the DomainRegistration interface and the registry.
 * Domain-specific content lives ONLY in domain registration files (src/lib/domain/domains/).
 *
 * ZERO domain language in this file. Korean Test applies.
 */

// ──────────────────────────────────────────────
// Domain Registration Interface
// ──────────────────────────────────────────────

export interface DomainRegistration {
  domainId: string;
  displayName: string;
  version: string;

  /** Mapping between domain-specific terms and structural terms */
  terminology: DomainTerminology;

  /** Subset of available vocabulary primitives this domain uses */
  requiredPrimitives: string[];

  /** Additional vocabulary extensions this domain needs beyond the base set */
  vocabularyExtensions: string[];

  /** Types of benchmark data for reconciliation */
  benchmarkTypes: string[];

  /** Categories of contested outcomes */
  disputeCategories: string[];

  /** Applicable compliance frameworks */
  complianceFrameworks: string[];

  /** Vertical industry hints for Flywheel 3 */
  verticalHints: string[];

  /** Contextual information for rule interpretation */
  interpretationContext: string;
}

export interface DomainTerminology {
  entity: string;
  entityGroup: string;
  outcome: string;
  outcomeVerb: string;
  ruleset: string;
  period: string;
  performance: string;
  target: string;
}

// ──────────────────────────────────────────────
// Structural Term Mapping
// ──────────────────────────────────────────────

/** Map from structural term to the domain's display term */
const STRUCTURAL_KEYS: Array<keyof DomainTerminology> = [
  'entity', 'entityGroup', 'outcome', 'outcomeVerb',
  'ruleset', 'period', 'performance', 'target',
];

export function toStructural(domainTerm: string, domain: DomainRegistration): string {
  for (const key of STRUCTURAL_KEYS) {
    if (domain.terminology[key] === domainTerm) return key;
  }
  return domainTerm; // passthrough if not found
}

export function toDomain(structuralTerm: string, domain: DomainRegistration): string {
  const key = structuralTerm as keyof DomainTerminology;
  if (key in domain.terminology) return domain.terminology[key];
  return structuralTerm; // passthrough if not found
}

// ──────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────

const registeredDomains = new Map<string, DomainRegistration>();

export function registerDomain(domain: DomainRegistration): void {
  registeredDomains.set(domain.domainId, domain);
}

export function getDomain(domainId: string): DomainRegistration | undefined {
  return registeredDomains.get(domainId);
}

export function getAllDomains(): DomainRegistration[] {
  return Array.from(registeredDomains.values());
}

export function clearRegistry(): void {
  registeredDomains.clear();
}

// ──────────────────────────────────────────────
// Available Primitives — the foundational vocabulary
// ──────────────────────────────────────────────

export const AVAILABLE_PRIMITIVES = [
  'bounded_lookup_1d',
  'bounded_lookup_2d',
  'scalar_multiply',
  'conditional_gate',
  'aggregate',
  'ratio',
  'constant',
  'weighted_blend',
  'temporal_window',
];
