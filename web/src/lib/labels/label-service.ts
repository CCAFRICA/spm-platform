/**
 * Label Service — Domain-agnostic labels from tenant settings
 *
 * Reads hierarchy_labels and entity_type_labels from the tenant config.
 * Falls back to generic English labels when tenant settings are not available.
 *
 * Korean Test: All user-visible strings come from this service or tenant config.
 * No English-only hardcoded terms in UI components.
 */

// ──────────────────────────────────────────────
// Default Labels (English, domain-agnostic)
// ──────────────────────────────────────────────

const DEFAULT_ENTITY_TYPE_LABELS: Record<string, string> = {
  individual: 'Entity',
  location: 'Location',
  team: 'Team',
  organization: 'Organization',
};

const DEFAULT_ENTITY_TYPE_LABELS_PLURAL: Record<string, string> = {
  individual: 'Entities',
  location: 'Locations',
  team: 'Teams',
  organization: 'Organizations',
};

const DEFAULT_HIERARCHY_LABELS: Record<string, string> = {
  '0': 'Organization',
  '1': 'Division',
  '2': 'Unit',
  '3': 'Group',
};

const DEFAULT_DOMAIN_LABELS: Record<string, string> = {
  rule_set: 'Rule Set',
  outcome_value: 'Outcome',
  attainment: 'Achievement',
  period: 'Period',
  outcome_label: 'Outcome',
};

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface TenantLabelConfig {
  hierarchy_labels?: Record<string, string>;
  entity_type_labels?: Record<string, string>;
  settings?: {
    outcome_label?: string;
    domain_labels?: Record<string, string>;
  };
}

// ──────────────────────────────────────────────
// Label Getters
// ──────────────────────────────────────────────

/**
 * Get the label for an entity type.
 * e.g., 'individual' -> 'Asociado' (for RetailCo MX) or 'Entity' (default)
 */
export function getEntityTypeLabel(
  type: string,
  tenantConfig?: TenantLabelConfig | null
): string {
  if (tenantConfig?.entity_type_labels) {
    const labels = tenantConfig.entity_type_labels as Record<string, string>;
    if (labels[type]) return labels[type];
  }
  return DEFAULT_ENTITY_TYPE_LABELS[type] || type;
}

/**
 * Get the plural label for an entity type.
 */
export function getEntityTypeLabelPlural(
  type: string,
  tenantConfig?: TenantLabelConfig | null
): string {
  // Check if tenant provides plural (convention: key + '_plural')
  if (tenantConfig?.entity_type_labels) {
    const labels = tenantConfig.entity_type_labels as Record<string, string>;
    if (labels[`${type}_plural`]) return labels[`${type}_plural`];
    // Fall back to singular + 's' for simple pluralization
    if (labels[type]) return labels[type] + 's';
  }
  return DEFAULT_ENTITY_TYPE_LABELS_PLURAL[type] || type + 's';
}

/**
 * Get the label for a hierarchy level.
 * e.g., level 1 -> 'Region' (for RetailCo MX) or 'Division' (default)
 */
export function getHierarchyLabel(
  level: number,
  tenantConfig?: TenantLabelConfig | null
): string {
  if (tenantConfig?.hierarchy_labels) {
    const labels = tenantConfig.hierarchy_labels as Record<string, string>;
    const key = `level_${level}`;
    if (labels[key]) return labels[key];
    // Also try numeric key
    if (labels[String(level)]) return labels[String(level)];
  }
  return DEFAULT_HIERARCHY_LABELS[String(level)] || `Level ${level}`;
}

/**
 * Get the outcome label for the tenant.
 * e.g., 'Commission' (ICM tenant) or 'Performance Index' (FRMX) or 'Outcome' (default)
 */
export function getOutcomeLabel(
  tenantConfig?: TenantLabelConfig | null
): string {
  if (tenantConfig?.settings?.outcome_label) {
    return tenantConfig.settings.outcome_label;
  }
  return DEFAULT_DOMAIN_LABELS['outcome_label'];
}

/**
 * Get a domain-specific label.
 * e.g., 'rule_set' -> 'Compensation Plan' (ICM) or 'Rule Set' (default)
 */
export function getDomainLabel(
  key: string,
  tenantConfig?: TenantLabelConfig | null
): string {
  if (tenantConfig?.settings?.domain_labels) {
    const labels = tenantConfig.settings.domain_labels;
    if (labels[key]) return labels[key];
  }
  return DEFAULT_DOMAIN_LABELS[key] || key;
}

// ──────────────────────────────────────────────
// React Hook Helper
// ──────────────────────────────────────────────

/**
 * Create a labels object for use in components.
 * Pass the tenant config from useTenant() hook.
 */
export function createLabels(tenantConfig?: TenantLabelConfig | null) {
  return {
    entityType: (type: string) => getEntityTypeLabel(type, tenantConfig),
    entityTypePlural: (type: string) => getEntityTypeLabelPlural(type, tenantConfig),
    hierarchy: (level: number) => getHierarchyLabel(level, tenantConfig),
    outcome: () => getOutcomeLabel(tenantConfig),
    domain: (key: string) => getDomainLabel(key, tenantConfig),
  };
}
