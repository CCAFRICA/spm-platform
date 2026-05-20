/**
 * HF-239 Phase 0.3: rule_set_assignments creation module.
 *
 * Extracted from execute/route.ts POST handler (lines 174-258, the HF-126
 * block). Both routes (now: execute-bulk only after HF-239 Phase 3 deletion)
 * call this AFTER executePostCommitConstruction. The calculation engine
 * requires rule_set_assignments to route entities to plans; this function
 * creates any missing pairs for active rule_sets × tenant entities.
 *
 * Idempotent: existing assignments are skipped via a (entity_id, rule_set_id)
 * presence check before insert.
 *
 * Fire-and-forget at caller; this function returns gracefully on internal
 * errors (errors logged, work resumes — does not throw).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const ASSIGN_PAGE = 1000;
const INSERT_BATCH = 5000;

export interface CreateMissingAssignmentsResult {
  ruleSetCount: number;
  entityCount: number;
  alreadyAssignedPairs: number;
  newlyCreatedPairs: number;
}

export async function createMissingAssignments(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<CreateMissingAssignmentsResult> {
  const result: CreateMissingAssignmentsResult = {
    ruleSetCount: 0,
    entityCount: 0,
    alreadyAssignedPairs: 0,
    newlyCreatedPairs: 0,
  };

  try {
    const { data: activeRuleSets } = await supabase
      .from('rule_sets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    if (!activeRuleSets || activeRuleSets.length === 0) {
      return result;
    }
    result.ruleSetCount = activeRuleSets.length;

    const allEntityIds: string[] = [];
    let page = 0;
    while (true) {
      const { data: entityPage } = await supabase
        .from('entities')
        .select('id')
        .eq('tenant_id', tenantId)
        .range(page * ASSIGN_PAGE, (page + 1) * ASSIGN_PAGE - 1);
      if (!entityPage || entityPage.length === 0) break;
      allEntityIds.push(...entityPage.map(e => e.id));
      if (entityPage.length < ASSIGN_PAGE) break;
      page++;
    }
    result.entityCount = allEntityIds.length;

    if (allEntityIds.length === 0) return result;

    const assignedSet = new Set<string>();
    for (let i = 0; i < allEntityIds.length; i += ASSIGN_PAGE) {
      const slice = allEntityIds.slice(i, i + ASSIGN_PAGE);
      const { data: existing } = await supabase
        .from('rule_set_assignments')
        .select('entity_id, rule_set_id')
        .eq('tenant_id', tenantId)
        .in('entity_id', slice);
      if (existing) {
        for (const a of existing) assignedSet.add(`${a.entity_id}:${a.rule_set_id}`);
      }
    }
    result.alreadyAssignedPairs = assignedSet.size;

    const newAssignments: Array<{
      tenant_id: string;
      rule_set_id: string;
      entity_id: string;
      assignment_type: string;
      metadata: Record<string, never>;
    }> = [];
    for (const rs of activeRuleSets) {
      for (const entityId of allEntityIds) {
        if (!assignedSet.has(`${entityId}:${rs.id}`)) {
          newAssignments.push({
            tenant_id: tenantId,
            rule_set_id: rs.id,
            entity_id: entityId,
            assignment_type: 'direct',
            metadata: {},
          });
        }
      }
    }
    result.newlyCreatedPairs = newAssignments.length;

    if (newAssignments.length > 0) {
      for (let i = 0; i < newAssignments.length; i += INSERT_BATCH) {
        const slice = newAssignments.slice(i, i + INSERT_BATCH);
        const { error: insertErr } = await supabase
          .from('rule_set_assignments')
          .insert(slice);
        if (insertErr) {
          console.error(`[SCI assignments] insert batch ${i} error:`, insertErr.message);
        }
      }
      console.log(
        `[SCI assignments] Created ${newAssignments.length} rule_set_assignments ` +
        `for ${allEntityIds.length} entities × ${activeRuleSets.length} rule sets`,
      );
    } else {
      console.log(
        `[SCI assignments] All ${allEntityIds.length} entities already assigned ` +
        `to ${activeRuleSets.length} rule sets`,
      );
    }
  } catch (err) {
    console.error('[SCI assignments] createMissingAssignments error (non-blocking):', err);
  }

  return result;
}
