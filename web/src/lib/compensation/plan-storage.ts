/**
 * Compensation Plan Storage Service
 *
 * Manages plan CRUD operations using localStorage
 */

import type {
  CompensationPlanConfig,
  PlanSummary,
  PlanStatus,
  PlanChangeRecord,
} from '@/types/compensation-plan';
import { createRetailCGMXUnifiedPlan } from './retailcgmx-plan';
import { audit } from '@/lib/audit-service';

const STORAGE_KEY_PLANS = 'compensation_plans';
const STORAGE_KEY_PLAN_HISTORY = 'compensation_plan_history';

// ============================================
// CRUD OPERATIONS
// ============================================

export function getPlans(tenantId: string): CompensationPlanConfig[] {
  const plans = getAllPlans();
  return plans.filter((p) => p.tenantId === tenantId);
}

export function getPlan(planId: string): CompensationPlanConfig | null {
  const plans = getAllPlans();
  return plans.find((p) => p.id === planId) || null;
}

export function getActivePlan(tenantId: string, role: string): CompensationPlanConfig | null {
  const plans = getPlans(tenantId);
  const now = new Date().toISOString();

  return (
    plans.find(
      (p) =>
        p.status === 'active' &&
        p.eligibleRoles.includes(role) &&
        p.effectiveDate <= now &&
        (p.endDate === null || p.endDate >= now)
    ) || null
  );
}

export function getPlansByStatus(tenantId: string, status: PlanStatus): CompensationPlanConfig[] {
  return getPlans(tenantId).filter((p) => p.status === status);
}

export function getPlanSummaries(tenantId: string): PlanSummary[] {
  return getPlans(tenantId).map((p) => ({
    id: p.id,
    name: p.name,
    planType: p.planType,
    status: p.status,
    effectiveDate: p.effectiveDate,
    endDate: p.endDate,
    eligibleRoles: p.eligibleRoles,
    version: p.version,
  }));
}

export function savePlan(plan: CompensationPlanConfig): CompensationPlanConfig {
  const plans = getAllPlans();
  const existingIndex = plans.findIndex((p) => p.id === plan.id);

  const updatedPlan = {
    ...plan,
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    plans[existingIndex] = updatedPlan;
  } else {
    plans.push(updatedPlan);
  }

  savePlans(plans);
  return updatedPlan;
}

export function deletePlan(planId: string): boolean {
  const plans = getAllPlans();
  const filtered = plans.filter((p) => p.id !== planId);

  if (filtered.length === plans.length) {
    return false;
  }

  savePlans(filtered);
  return true;
}

/**
 * Create a new plan with the provided configuration
 */
export function createPlan(params: {
  name: string;
  description: string;
  tenantId: string;
  effectiveDate: string;
  endDate?: string | null;
  createdBy: string;
  configuration: CompensationPlanConfig['configuration'];
  eligibleRoles?: string[];
  planType?: 'weighted_kpi' | 'additive_lookup';
}): CompensationPlanConfig | null {
  const now = new Date().toISOString();

  const newPlan: CompensationPlanConfig = {
    id: generatePlanId(),
    tenantId: params.tenantId,
    name: params.name,
    description: params.description,
    planType: params.planType ?? 'additive_lookup',
    status: 'draft',
    effectiveDate: params.effectiveDate,
    endDate: params.endDate || null,
    eligibleRoles: params.eligibleRoles || ['sales_rep'],
    version: 1,
    previousVersionId: null,
    createdBy: params.createdBy,
    createdAt: now,
    updatedBy: params.createdBy,
    updatedAt: now,
    approvedBy: null,
    approvedAt: null,
    configuration: params.configuration,
  };

  return savePlan(newPlan);
}

// ============================================
// VERSIONING & CLONING
// ============================================

export function clonePlan(planId: string, newName: string, userId: string): CompensationPlanConfig | null {
  const original = getPlan(planId);
  if (!original) return null;

  const now = new Date().toISOString();
  const newPlan: CompensationPlanConfig = {
    ...original,
    id: generatePlanId(),
    name: newName,
    status: 'draft',
    version: 1,
    previousVersionId: original.id,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
    approvedBy: null,
    approvedAt: null,
    configuration: JSON.parse(JSON.stringify(original.configuration)), // Deep clone
  };

  return savePlan(newPlan);
}

export function createNewVersion(planId: string, userId: string): CompensationPlanConfig | null {
  const original = getPlan(planId);
  if (!original) return null;

  const now = new Date().toISOString();
  const newVersion: CompensationPlanConfig = {
    ...original,
    id: generatePlanId(),
    status: 'draft',
    version: original.version + 1,
    previousVersionId: original.id,
    updatedBy: userId,
    updatedAt: now,
    approvedBy: null,
    approvedAt: null,
    configuration: JSON.parse(JSON.stringify(original.configuration)),
  };

  return savePlan(newVersion);
}

export function getPlanHistory(planId: string): CompensationPlanConfig[] {
  const plan = getPlan(planId);
  if (!plan) return [];

  const history: CompensationPlanConfig[] = [plan];
  let currentId = plan.previousVersionId;

  while (currentId) {
    const previous = getPlan(currentId);
    if (previous) {
      history.push(previous);
      currentId = previous.previousVersionId;
    } else {
      break;
    }
  }

  return history;
}

// ============================================
// STATUS WORKFLOW
// ============================================

export function submitForApproval(planId: string, userId: string): CompensationPlanConfig | null {
  const plan = getPlan(planId);
  if (!plan || plan.status !== 'draft') return null;

  return savePlan({
    ...plan,
    status: 'pending_approval',
    updatedBy: userId,
  });
}

export function approvePlan(planId: string, userId: string): CompensationPlanConfig | null {
  const plan = getPlan(planId);
  if (!plan || plan.status !== 'pending_approval') return null;

  const now = new Date().toISOString();

  // Archive previous active versions for same roles
  const plans = getAllPlans();
  plans.forEach((p) => {
    if (
      p.id !== planId &&
      p.tenantId === plan.tenantId &&
      p.status === 'active' &&
      p.eligibleRoles.some((r) => plan.eligibleRoles.includes(r))
    ) {
      savePlan({ ...p, status: 'archived', updatedBy: userId });
    }
  });

  return savePlan({
    ...plan,
    status: 'active',
    approvedBy: userId,
    approvedAt: now,
    updatedBy: userId,
  });
}

export function rejectPlan(planId: string, userId: string): CompensationPlanConfig | null {
  const plan = getPlan(planId);
  if (!plan || plan.status !== 'pending_approval') return null;

  return savePlan({
    ...plan,
    status: 'draft',
    updatedBy: userId,
  });
}

export function archivePlan(planId: string, userId: string): CompensationPlanConfig | null {
  const plan = getPlan(planId);
  if (!plan || plan.status !== 'active') return null;

  return savePlan({
    ...plan,
    status: 'archived',
    updatedBy: userId,
  });
}

/**
 * Directly activate a plan (bypasses approval workflow).
 * Use for demo/testing or when approval is handled externally.
 */
export function activatePlan(planId: string, userId: string): CompensationPlanConfig | null {
  const plan = getPlan(planId);
  if (!plan) return null;

  // Can activate from draft or pending_approval
  if (plan.status !== 'draft' && plan.status !== 'pending_approval') {
    return null;
  }

  const now = new Date().toISOString();

  // Archive previous active versions for same tenant/roles
  const plans = getAllPlans();
  plans.forEach((p) => {
    if (
      p.id !== planId &&
      p.tenantId === plan.tenantId &&
      p.status === 'active' &&
      p.eligibleRoles.some((r) => plan.eligibleRoles.includes(r))
    ) {
      savePlan({ ...p, status: 'archived', updatedBy: userId });
      audit.log({
        action: 'update',
        entityType: 'plan',
        entityId: p.id,
        entityName: p.name,
        changes: [{ field: 'status', oldValue: 'active', newValue: 'archived' }],
        reason: `Superseded by activation of ${plan.name}`,
      });
    }
  });

  const activated = savePlan({
    ...plan,
    status: 'active',
    approvedBy: userId,
    approvedAt: now,
    updatedBy: userId,
  });

  // Log plan activation
  audit.log({
    action: 'update',
    entityType: 'plan',
    entityId: planId,
    entityName: plan.name,
    changes: [{ field: 'status', oldValue: plan.status, newValue: 'active' }],
    reason: 'Plan activated',
  });

  return activated;
}

// ============================================
// CHANGE TRACKING
// ============================================

export function recordPlanChange(change: PlanChangeRecord): void {
  const history = getPlanChangeHistory();
  history.push(change);

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_PLAN_HISTORY, JSON.stringify(history));
  }
}

export function getPlanChangeHistory(): PlanChangeRecord[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(STORAGE_KEY_PLAN_HISTORY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function getPlanChanges(planId: string): PlanChangeRecord[] {
  return getPlanChangeHistory().filter((c) => c.planId === planId);
}

// ============================================
// STALE PLAN DETECTION (OB-26)
// ============================================

export interface StalePlanInfo {
  plan: CompensationPlanConfig;
  reason: 'expired' | 'old_draft' | 'old_archived';
  staleSince: string;
}

/**
 * Get stale plans that may need cleanup or attention
 * - Expired: Plans with endDate in the past
 * - Old Draft: Draft plans not updated in 30+ days
 * - Old Archived: Archived plans older than 90 days
 */
export function getStalePlans(tenantId: string): StalePlanInfo[] {
  const plans = getPlans(tenantId);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const stale: StalePlanInfo[] = [];

  for (const plan of plans) {
    // Check for expired plans
    if (plan.endDate && new Date(plan.endDate) < now && plan.status === 'active') {
      stale.push({
        plan,
        reason: 'expired',
        staleSince: plan.endDate,
      });
    }

    // Check for old drafts
    if (plan.status === 'draft') {
      const updatedAt = new Date(plan.updatedAt);
      if (updatedAt < thirtyDaysAgo) {
        stale.push({
          plan,
          reason: 'old_draft',
          staleSince: plan.updatedAt,
        });
      }
    }

    // Check for old archived plans
    if (plan.status === 'archived') {
      const updatedAt = new Date(plan.updatedAt);
      if (updatedAt < ninetyDaysAgo) {
        stale.push({
          plan,
          reason: 'old_archived',
          staleSince: plan.updatedAt,
        });
      }
    }
  }

  return stale;
}

/**
 * Clean up stale plans by deleting old archived plans
 * Returns count of cleaned up plans
 */
export function cleanupStalePlans(tenantId: string): number {
  const stalePlans = getStalePlans(tenantId);
  let cleanedCount = 0;

  for (const staleInfo of stalePlans) {
    // Only auto-cleanup old archived plans
    if (staleInfo.reason === 'old_archived') {
      audit.log({
        action: 'delete',
        entityType: 'plan',
        entityId: staleInfo.plan.id,
        entityName: staleInfo.plan.name,
        reason: `Automatic cleanup of archived plan (stale since ${staleInfo.staleSince})`,
      });
      deletePlan(staleInfo.plan.id);
      cleanedCount++;
    }
  }

  return cleanedCount;
}

// ============================================
// HELPERS
// ============================================

function getAllPlans(): CompensationPlanConfig[] {
  if (typeof window === 'undefined') return getDefaultPlans();

  const stored = localStorage.getItem(STORAGE_KEY_PLANS);
  if (!stored) {
    // Initialize with default plans (preserve Infinity)
    const defaults = getDefaultPlans();
    localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(defaults, (_, value) =>
      value === Infinity ? 'INFINITY' : value
    ));
    return defaults;
  }

  try {
    // OB-30: Restore Infinity values that were serialized as "INFINITY"
    return JSON.parse(stored, (_, value) =>
      value === 'INFINITY' ? Infinity : value
    );
  } catch {
    return getDefaultPlans();
  }
}

function savePlans(plans: CompensationPlanConfig[]): void {
  if (typeof window !== 'undefined') {
    // OB-30: Preserve Infinity values during serialization
    localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(plans, (_, value) =>
      value === Infinity ? 'INFINITY' : value
    ));
  }
}

function generatePlanId(): string {
  return `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================
// DEFAULT RETAILCO PLANS
// ============================================

function getDefaultPlans(): CompensationPlanConfig[] {
  return [
    createRetailCoCertifiedPlan(),
    createRetailCoNonCertifiedPlan(),
    createRetailCGMXUnifiedPlan(),
  ];
}

function createRetailCoCertifiedPlan(): CompensationPlanConfig {
  return {
    id: 'plan-retailco-certified-2025',
    tenantId: 'retailco',
    name: 'Sales Associate Certified - 2025',
    description: 'Compensation plan for certified sales associates with full optical incentives',
    planType: 'additive_lookup',
    status: 'active',
    effectiveDate: '2025-01-01T00:00:00Z',
    endDate: null,
    eligibleRoles: ['sales_rep'],
    version: 1,
    previousVersionId: null,
    createdBy: 'sofia-chen',
    createdAt: '2024-12-01T00:00:00Z',
    updatedBy: 'sofia-chen',
    updatedAt: '2024-12-15T00:00:00Z',
    approvedBy: 'sofia-chen',
    approvedAt: '2024-12-20T00:00:00Z',
    configuration: {
      type: 'additive_lookup',
      variants: [
        {
          variantId: 'certified',
          variantName: 'Certified Associate',
          description: 'For associates with optical certification',
          eligibilityCriteria: { isCertified: true },
          components: [
            // Component 1: Optical Sales (Matrix)
            {
              id: 'comp-optical',
              name: 'Optical Sales',
              description: 'Matrix lookup based on attainment % and sales volume',
              order: 1,
              enabled: true,
              componentType: 'matrix_lookup',
              measurementLevel: 'individual',
              matrixConfig: {
                rowMetric: 'optical_attainment',
                rowMetricLabel: 'Attainment %',
                rowBands: [
                  { min: 0, max: 79.99, label: '< 80%' },
                  { min: 80, max: 89.99, label: '80-90%' },
                  { min: 90, max: 99.99, label: '90-100%' },
                  { min: 100, max: 109.99, label: '100-110%' },
                  { min: 110, max: Infinity, label: '> 110%' },
                ],
                columnMetric: 'optical_volume',
                columnMetricLabel: 'Sales Volume',
                columnBands: [
                  { min: 0, max: 119999, label: '< $120K' },
                  { min: 120000, max: 149999, label: '$120-150K' },
                  { min: 150000, max: 179999, label: '$150-180K' },
                  { min: 180000, max: 209999, label: '$180-210K' },
                  { min: 210000, max: Infinity, label: '> $210K' },
                ],
                values: [
                  [0, 0, 0, 0, 0],           // < 80%
                  [500, 750, 1000, 1250, 1500],    // 80-90%
                  [750, 1000, 1250, 1500, 1750],   // 90-100%
                  [1000, 1250, 1500, 1750, 2000],  // 100-110%
                  [1250, 1500, 1750, 2000, 2500],  // > 110%
                ],
                currency: 'USD',
              },
            },
            // Component 2: Store Sales (Tier)
            {
              id: 'comp-store',
              name: 'Store Performance',
              description: 'Tier lookup based on store attainment',
              order: 2,
              enabled: true,
              componentType: 'tier_lookup',
              measurementLevel: 'store',
              tierConfig: {
                metric: 'store_attainment',
                metricLabel: 'Store Attainment %',
                tiers: [
                  { min: 0, max: 89.99, label: '< 90%', value: 0 },
                  { min: 90, max: 94.99, label: '90-95%', value: 200 },
                  { min: 95, max: 99.99, label: '95-100%', value: 350 },
                  { min: 100, max: 104.99, label: '100-105%', value: 500 },
                  { min: 105, max: Infinity, label: '> 105%', value: 750 },
                ],
                currency: 'USD',
              },
            },
            // Component 3: New Customers (Tier)
            {
              id: 'comp-customers',
              name: 'New Customers',
              description: 'Tier lookup based on new customer attainment',
              order: 3,
              enabled: true,
              componentType: 'tier_lookup',
              measurementLevel: 'individual',
              tierConfig: {
                metric: 'new_customers_attainment',
                metricLabel: 'New Customers Attainment %',
                tiers: [
                  { min: 0, max: 89.99, label: '< 90%', value: 0 },
                  { min: 90, max: 99.99, label: '90-100%', value: 150 },
                  { min: 100, max: 109.99, label: '100-110%', value: 250 },
                  { min: 110, max: Infinity, label: '> 110%', value: 400 },
                ],
                currency: 'USD',
              },
            },
            // Component 4: Collections (Tier)
            {
              id: 'comp-collections',
              name: 'Collections',
              description: 'Tier lookup based on collection rate',
              order: 4,
              enabled: true,
              componentType: 'tier_lookup',
              measurementLevel: 'store',
              tierConfig: {
                metric: 'collection_rate',
                metricLabel: 'Collection Rate %',
                tiers: [
                  { min: 0, max: 94.99, label: '< 95%', value: 0 },
                  { min: 95, max: 97.99, label: '95-98%', value: 100 },
                  { min: 98, max: 99.99, label: '98-100%', value: 200 },
                  { min: 100, max: Infinity, label: '100%', value: 350 },
                ],
                currency: 'USD',
              },
            },
            // Component 5: Insurance (Conditional)
            {
              id: 'comp-insurance',
              name: 'Insurance Sales',
              description: 'Percentage of insurance premium based on collection threshold',
              order: 5,
              enabled: true,
              componentType: 'conditional_percentage',
              measurementLevel: 'individual',
              conditionalConfig: {
                conditions: [
                  { metric: 'insurance_collection_rate', metricLabel: 'Collection Rate', min: 0, max: 94.99, rate: 0, label: '< 95% collected' },
                  { metric: 'insurance_collection_rate', metricLabel: 'Collection Rate', min: 95, max: 99.99, rate: 0.03, label: '95-100% collected' },
                  { metric: 'insurance_collection_rate', metricLabel: 'Collection Rate', min: 100, max: Infinity, rate: 0.05, label: '100% collected' },
                ],
                appliedTo: 'insurance_premium_total',
                appliedToLabel: 'Insurance Premium Total',
              },
            },
            // Component 6: Services (Percentage)
            {
              id: 'comp-services',
              name: 'Additional Services',
              description: 'Flat percentage of services revenue',
              order: 6,
              enabled: true,
              componentType: 'percentage',
              measurementLevel: 'individual',
              percentageConfig: {
                rate: 0.04,
                appliedTo: 'services_revenue',
                appliedToLabel: 'Services Revenue',
                minThreshold: 0,
              },
            },
          ],
        },
      ],
    },
  };
}

function createRetailCoNonCertifiedPlan(): CompensationPlanConfig {
  return {
    id: 'plan-retailco-noncertified-2025',
    tenantId: 'retailco',
    name: 'Sales Associate Non-Certified - 2025',
    description: 'Compensation plan for non-certified sales associates with reduced optical incentives',
    planType: 'additive_lookup',
    status: 'active',
    effectiveDate: '2025-01-01T00:00:00Z',
    endDate: null,
    eligibleRoles: ['sales_rep'],
    version: 1,
    previousVersionId: null,
    createdBy: 'sofia-chen',
    createdAt: '2024-12-01T00:00:00Z',
    updatedBy: 'sofia-chen',
    updatedAt: '2024-12-15T00:00:00Z',
    approvedBy: 'sofia-chen',
    approvedAt: '2024-12-20T00:00:00Z',
    configuration: {
      type: 'additive_lookup',
      variants: [
        {
          variantId: 'non-certified',
          variantName: 'Non-Certified Associate',
          description: 'For associates without optical certification',
          eligibilityCriteria: { isCertified: false },
          components: [
            // Component 1: Optical Sales (Matrix) - Lower values
            {
              id: 'comp-optical',
              name: 'Optical Sales',
              description: 'Matrix lookup based on attainment % and sales volume (reduced rates)',
              order: 1,
              enabled: true,
              componentType: 'matrix_lookup',
              measurementLevel: 'individual',
              matrixConfig: {
                rowMetric: 'optical_attainment',
                rowMetricLabel: 'Attainment %',
                rowBands: [
                  { min: 0, max: 79.99, label: '< 80%' },
                  { min: 80, max: 89.99, label: '80-90%' },
                  { min: 90, max: 99.99, label: '90-100%' },
                  { min: 100, max: 109.99, label: '100-110%' },
                  { min: 110, max: Infinity, label: '> 110%' },
                ],
                columnMetric: 'optical_volume',
                columnMetricLabel: 'Sales Volume',
                columnBands: [
                  { min: 0, max: 119999, label: '< $120K' },
                  { min: 120000, max: 149999, label: '$120-150K' },
                  { min: 150000, max: 179999, label: '$150-180K' },
                  { min: 180000, max: 209999, label: '$180-210K' },
                  { min: 210000, max: Infinity, label: '> $210K' },
                ],
                values: [
                  [0, 0, 0, 0, 0],           // < 80%
                  [300, 450, 600, 750, 900],    // 80-90%
                  [450, 600, 750, 900, 1050],   // 90-100%
                  [600, 750, 900, 1050, 1200],  // 100-110%
                  [750, 900, 1050, 1200, 1500], // > 110%
                ],
                currency: 'USD',
              },
            },
            // Component 2: Store Sales (Tier) - Same as certified
            {
              id: 'comp-store',
              name: 'Store Performance',
              description: 'Tier lookup based on store attainment',
              order: 2,
              enabled: true,
              componentType: 'tier_lookup',
              measurementLevel: 'store',
              tierConfig: {
                metric: 'store_attainment',
                metricLabel: 'Store Attainment %',
                tiers: [
                  { min: 0, max: 89.99, label: '< 90%', value: 0 },
                  { min: 90, max: 94.99, label: '90-95%', value: 200 },
                  { min: 95, max: 99.99, label: '95-100%', value: 350 },
                  { min: 100, max: 104.99, label: '100-105%', value: 500 },
                  { min: 105, max: Infinity, label: '> 105%', value: 750 },
                ],
                currency: 'USD',
              },
            },
            // Component 3: New Customers (Tier) - Same as certified
            {
              id: 'comp-customers',
              name: 'New Customers',
              description: 'Tier lookup based on new customer attainment',
              order: 3,
              enabled: true,
              componentType: 'tier_lookup',
              measurementLevel: 'individual',
              tierConfig: {
                metric: 'new_customers_attainment',
                metricLabel: 'New Customers Attainment %',
                tiers: [
                  { min: 0, max: 89.99, label: '< 90%', value: 0 },
                  { min: 90, max: 99.99, label: '90-100%', value: 150 },
                  { min: 100, max: 109.99, label: '100-110%', value: 250 },
                  { min: 110, max: Infinity, label: '> 110%', value: 400 },
                ],
                currency: 'USD',
              },
            },
            // Component 4: Collections (Tier) - Same as certified
            {
              id: 'comp-collections',
              name: 'Collections',
              description: 'Tier lookup based on collection rate',
              order: 4,
              enabled: true,
              componentType: 'tier_lookup',
              measurementLevel: 'store',
              tierConfig: {
                metric: 'collection_rate',
                metricLabel: 'Collection Rate %',
                tiers: [
                  { min: 0, max: 94.99, label: '< 95%', value: 0 },
                  { min: 95, max: 97.99, label: '95-98%', value: 100 },
                  { min: 98, max: 99.99, label: '98-100%', value: 200 },
                  { min: 100, max: Infinity, label: '100%', value: 350 },
                ],
                currency: 'USD',
              },
            },
            // Component 5: Insurance (Conditional) - Lower rates
            {
              id: 'comp-insurance',
              name: 'Insurance Sales',
              description: 'Percentage of insurance premium based on collection threshold (reduced rates)',
              order: 5,
              enabled: true,
              componentType: 'conditional_percentage',
              measurementLevel: 'individual',
              conditionalConfig: {
                conditions: [
                  { metric: 'insurance_collection_rate', metricLabel: 'Collection Rate', min: 0, max: 94.99, rate: 0, label: '< 95% collected' },
                  { metric: 'insurance_collection_rate', metricLabel: 'Collection Rate', min: 95, max: 99.99, rate: 0.02, label: '95-100% collected' },
                  { metric: 'insurance_collection_rate', metricLabel: 'Collection Rate', min: 100, max: Infinity, rate: 0.03, label: '100% collected' },
                ],
                appliedTo: 'insurance_premium_total',
                appliedToLabel: 'Insurance Premium Total',
              },
            },
            // Component 6: Services (Percentage) - Lower rate
            {
              id: 'comp-services',
              name: 'Additional Services',
              description: 'Flat percentage of services revenue (reduced rate)',
              order: 6,
              enabled: true,
              componentType: 'percentage',
              measurementLevel: 'individual',
              percentageConfig: {
                rate: 0.03,
                appliedTo: 'services_revenue',
                appliedToLabel: 'Services Revenue',
                minThreshold: 0,
              },
            },
          ],
        },
      ],
    },
  };
}

// ============================================
// INITIALIZATION
// ============================================

export function initializePlans(): void {
  if (typeof window === 'undefined') return;

  const existing = localStorage.getItem(STORAGE_KEY_PLANS);
  if (!existing) {
    const defaults = getDefaultPlans();
    localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(defaults));
  }
}

/**
 * OB-30: Reset a tenant's plans to the hardcoded defaults from retailcgmx-plan.ts.
 * This replaces any AI-imported plans with the known-good values.
 * Use when AI extraction produced wrong tier tables/payout values.
 * Returns the number of plans reset.
 */
export function resetToDefaultPlans(tenantId: string): number {
  if (typeof window === 'undefined') return 0;

  const defaults = getDefaultPlans();
  const tenantDefaults = defaults.filter((p) => p.tenantId === tenantId);

  if (tenantDefaults.length === 0) {
    console.warn(`[PlanStorage] No default plans found for tenant "${tenantId}"`);
    return 0;
  }

  // Remove all existing plans for this tenant, keep other tenants' plans
  const allPlans = getAllPlans();
  const otherTenantPlans = allPlans.filter((p) => p.tenantId !== tenantId);

  // Activate the defaults
  const activatedDefaults = tenantDefaults.map(p => ({
    ...p,
    status: 'active' as const,
    updatedAt: new Date().toISOString(),
  }));

  const updated = [...otherTenantPlans, ...activatedDefaults];
  // Serialize with Infinity preservation (JSON.stringify drops Infinity → null)
  const serialized = JSON.stringify(updated, (_, value) =>
    value === Infinity ? 'INFINITY' : value
  );
  localStorage.setItem(STORAGE_KEY_PLANS, serialized);

  console.log(`[PlanStorage] Reset ${activatedDefaults.length} plans for tenant "${tenantId}" to defaults`);
  activatedDefaults.forEach(p => {
    const config = p.configuration;
    const variantCount = config.type === 'additive_lookup' ? config.variants.length : 0;
    console.log(`  - ${p.name} (${p.id}): ${variantCount} variants, status=active`);
  });

  return activatedDefaults.length;
}

/**
 * Ensure a tenant has at least default plans seeded.
 * Call this when a tenant accesses calculation features.
 */
export function ensureTenantPlans(tenantId: string): void {
  if (typeof window === 'undefined') return;

  const existing = getPlans(tenantId);
  if (existing.length > 0) return;

  // No plans for this tenant - seed defaults based on tenant ID
  const defaults = getDefaultPlans();
  const tenantDefaults = defaults.filter((p) => p.tenantId === tenantId);

  if (tenantDefaults.length > 0) {
    // Tenant has matching default plans - save them
    const allPlans = getAllPlans();
    const updated = [...allPlans, ...tenantDefaults];
    localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(updated));
  }
}

/**
 * Get all plans (active or not) for a tenant with their status.
 * Useful for UI to show available plans.
 */
export function getPlansWithStatus(tenantId: string): Array<{ plan: CompensationPlanConfig; isActive: boolean; canActivate: boolean }> {
  const plans = getPlans(tenantId);
  return plans.map((plan) => ({
    plan,
    isActive: plan.status === 'active',
    canActivate: plan.status === 'draft' || plan.status === 'pending_approval',
  }));
}

export function resetToDefaults(): void {
  if (typeof window === 'undefined') return;

  const defaults = getDefaultPlans();
  localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(defaults));
  localStorage.removeItem(STORAGE_KEY_PLAN_HISTORY);
}
