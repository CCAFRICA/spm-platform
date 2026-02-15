/**
 * RuleSet Service — CRUD for rule sets (5-layer JSONB decomposition)
 *
 * Supabase-only. No localStorage fallback.
 */

import { createClient } from './client';
import type { Database, RuleSet, Json } from './database.types';
import type { CompensationPlanConfig, PlanStatus } from '@/types/compensation-plan';

// ──────────────────────────────────────────────
// RuleSet ↔ CompensationPlanConfig mapping
// ──────────────────────────────────────────────

/**
 * Convert a Supabase rule_set row to CompensationPlanConfig.
 * The 5-layer JSONB is recombined into the configuration shape.
 */
function ruleSetToPlanConfig(rs: RuleSet): CompensationPlanConfig {
  const components = rs.components as unknown;
  const populationConfig = rs.population_config as Record<string, unknown>;
  const cadenceConfig = rs.cadence_config as Record<string, unknown>;
  const outcomeConfig = rs.outcome_config as Record<string, unknown>;
  const metadata = (rs.metadata || {}) as Record<string, unknown>;

  return {
    id: rs.id,
    tenantId: rs.tenant_id,
    name: rs.name,
    description: rs.description || '',
    planType: (metadata.plan_type as string) === 'weighted_kpi' ? 'weighted_kpi' : 'additive_lookup',
    status: rs.status as PlanStatus,
    effectiveDate: rs.effective_from || '',
    endDate: rs.effective_to || null,
    eligibleRoles: (populationConfig.eligible_roles as string[]) || [],
    version: rs.version,
    previousVersionId: (metadata.previous_version_id as string) || null,
    createdBy: rs.created_by || '',
    createdAt: rs.created_at,
    updatedBy: (metadata.updated_by as string) || '',
    updatedAt: rs.updated_at,
    approvedBy: rs.approved_by || null,
    approvedAt: (metadata.approved_at as string) || null,
    configuration: {
      type: (metadata.plan_type as string) === 'weighted_kpi' ? 'weighted_kpi' : 'additive_lookup',
      ...(components as Record<string, unknown>),
      ...(cadenceConfig.cadence ? { cadence: cadenceConfig } : {}),
      ...(outcomeConfig.outcome ? { outcome: outcomeConfig } : {}),
    } as CompensationPlanConfig['configuration'],
  };
}

/**
 * Convert a CompensationPlanConfig to rule_set Insert row.
 * Decomposes into 5-layer JSONB structure.
 */
function planConfigToRuleSetInsert(
  plan: CompensationPlanConfig
): Database['public']['Tables']['rule_sets']['Insert'] {
  return {
    id: plan.id,
    tenant_id: plan.tenantId,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    version: plan.version,
    effective_from: plan.effectiveDate || undefined,
    effective_to: plan.endDate || undefined,
    population_config: {
      eligible_roles: plan.eligibleRoles,
    } as unknown as Json,
    input_bindings: {} as Json,
    components: plan.configuration as unknown as Json,
    cadence_config: {} as Json,
    outcome_config: {} as Json,
    metadata: {
      plan_type: plan.planType,
      previous_version_id: plan.previousVersionId,
      updated_by: plan.updatedBy,
      approved_at: plan.approvedAt,
    } as unknown as Json,
  };
}

// ──────────────────────────────────────────────
// Async CRUD — All operations return Promises
// ──────────────────────────────────────────────

/**
 * Get all rule sets for a tenant.
 */
export async function getRuleSets(tenantId: string): Promise<CompensationPlanConfig[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('rule_sets')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) throw error;
  return ((data || []) as RuleSet[]).map(ruleSetToPlanConfig);
}

/**
 * Get a single rule set by ID.
 */
export async function getRuleSet(tenantId: string, ruleSetId: string): Promise<CompensationPlanConfig | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('rule_sets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', ruleSetId)
    .single();
  if (error) return null;
  return ruleSetToPlanConfig(data as RuleSet);
}

/**
 * Get the active rule set for a tenant.
 */
export async function getActiveRuleSet(tenantId: string): Promise<CompensationPlanConfig | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('rule_sets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .limit(1)
    .single();
  if (error) return null;
  return ruleSetToPlanConfig(data as RuleSet);
}

/**
 * Get rule sets by status.
 */
export async function getRuleSetsByStatus(
  tenantId: string,
  status: PlanStatus
): Promise<CompensationPlanConfig[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('rule_sets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', status);
  if (error) throw error;
  return ((data || []) as RuleSet[]).map(ruleSetToPlanConfig);
}

/**
 * Save (upsert) a rule set.
 */
export async function saveRuleSet(tenantId: string, plan: CompensationPlanConfig): Promise<void> {
  const supabase = createClient();
  const row = planConfigToRuleSetInsert(plan);
  const { error } = await supabase
    .from('rule_sets')
    .upsert(row);
  if (error) throw error;
}

/**
 * Delete a rule set (only if draft).
 */
export async function deleteRuleSet(tenantId: string, ruleSetId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('rule_sets')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', ruleSetId)
    .eq('status', 'draft');
  if (error) return false;
  return true;
}

/**
 * Submit a rule set for approval.
 */
export async function submitRuleSetForApproval(
  tenantId: string,
  ruleSetId: string
): Promise<CompensationPlanConfig | null> {
  const supabase = createClient();
  const updateRow: Database['public']['Tables']['rule_sets']['Update'] = {
    status: 'pending_approval',
  };
  const { data, error } = await supabase
    .from('rule_sets')
    .update(updateRow)
    .eq('tenant_id', tenantId)
    .eq('id', ruleSetId)
    .select()
    .single();
  if (error) return null;
  return ruleSetToPlanConfig(data as RuleSet);
}

/**
 * Approve a rule set.
 */
export async function approveRuleSet(
  tenantId: string,
  ruleSetId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _approvedBy: string
): Promise<CompensationPlanConfig | null> {
  const supabase = createClient();
  const updateRow: Database['public']['Tables']['rule_sets']['Update'] = {
    status: 'active',
    metadata: { approved_at: new Date().toISOString() } as unknown as Json,
  };
  const { data, error } = await supabase
    .from('rule_sets')
    .update(updateRow)
    .eq('tenant_id', tenantId)
    .eq('id', ruleSetId)
    .select()
    .single();
  if (error) return null;
  return ruleSetToPlanConfig(data as RuleSet);
}

/**
 * Archive a rule set.
 */
export async function archiveRuleSet(
  tenantId: string,
  ruleSetId: string
): Promise<CompensationPlanConfig | null> {
  const supabase = createClient();
  const updateRow: Database['public']['Tables']['rule_sets']['Update'] = {
    status: 'archived',
  };
  const { data, error } = await supabase
    .from('rule_sets')
    .update(updateRow)
    .eq('tenant_id', tenantId)
    .eq('id', ruleSetId)
    .select()
    .single();
  if (error) return null;
  return ruleSetToPlanConfig(data as RuleSet);
}

/**
 * Activate a rule set (deactivates others in the tenant).
 */
export async function activateRuleSet(
  tenantId: string,
  ruleSetId: string
): Promise<CompensationPlanConfig | null> {
  const supabase = createClient();
  // Deactivate all other active rule sets
  await supabase
    .from('rule_sets')
    .update({ status: 'archived' } as Database['public']['Tables']['rule_sets']['Update'])
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  // Activate this one
  const updateRow: Database['public']['Tables']['rule_sets']['Update'] = {
    status: 'active',
  };
  const { data, error } = await supabase
    .from('rule_sets')
    .update(updateRow)
    .eq('tenant_id', tenantId)
    .eq('id', ruleSetId)
    .select()
    .single();
  if (error) return null;
  return ruleSetToPlanConfig(data as RuleSet);
}

// ──────────────────────────────────────────────
// Rule Set Assignment CRUD
// ──────────────────────────────────────────────

/**
 * Assign a rule set to an entity.
 */
export async function assignRuleSet(
  tenantId: string,
  ruleSetId: string,
  entityId: string,
  effectiveFrom?: string
): Promise<void> {
  const supabase = createClient();
  const insertRow: Database['public']['Tables']['rule_set_assignments']['Insert'] = {
    tenant_id: tenantId,
    rule_set_id: ruleSetId,
    entity_id: entityId,
    effective_from: effectiveFrom || new Date().toISOString().split('T')[0],
  };
  const { error } = await supabase
    .from('rule_set_assignments')
    .insert(insertRow);
  if (error) throw error;
}

/**
 * Get all entities assigned to a rule set.
 */
export async function getRuleSetAssignments(
  tenantId: string,
  ruleSetId: string
): Promise<Array<{ entity_id: string; effective_from: string | null }>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('rule_set_assignments')
    .select('entity_id, effective_from')
    .eq('tenant_id', tenantId)
    .eq('rule_set_id', ruleSetId);
  if (error) throw error;
  return (data || []) as Array<{ entity_id: string; effective_from: string | null }>;
}

/**
 * Get all rule sets assigned to an entity.
 */
export async function getEntityRuleSetAssignments(
  tenantId: string,
  entityId: string
): Promise<Array<{ rule_set_id: string; effective_from: string | null }>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('rule_set_assignments')
    .select('rule_set_id, effective_from')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId);
  if (error) throw error;
  return (data || []) as Array<{ rule_set_id: string; effective_from: string | null }>;
}
