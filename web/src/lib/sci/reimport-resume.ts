/**
 * HF-248 Phase 3 — reimport-resume context loader + persistence.
 *
 * When a plan import partially succeeds (some components validate, others
 * fail with cognition_truncation / cognition_violation), the rule_set is
 * persisted with the SUCCESSFUL components only. The import_batch's
 * error_summary records per-component outcomes and the failed component
 * IDs. On reimport of the same plan file (same storage path / content
 * fingerprint), this module loads the prior outcomes and returns:
 *
 *   - resumeSkipIds: component IDs that succeeded prior — skip the per-
 *     component LLM call this run; reuse the persisted DAG tree from the
 *     active rule_set.
 *   - priorComponents: the persisted OrchestratedComponent payloads keyed
 *     by id, so the orchestrator can splice them back into the assembled
 *     interpretation.
 *
 * Read-before-derive per T1-E906 v2: the loop reads its own prior outputs
 * before regenerating.
 *
 * Reconciles with HF-244 Phase 3 supersession: a partial-success rule_set
 * is still upserted on reimport (HF-244 archives prior, the new rule_set
 * becomes active). The resume context contributes the cached trees BEFORE
 * the upsert, so the new rule_set inherits the successful components
 * without re-emitting them. The archive of the prior rule_set is correct
 * — it represents the prior state; the new rule_set represents the
 * current state including the resumed components.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
import type { OrchestratedComponent, OrchestrationResult } from './plan-orchestration';
import type { ComponentOutcome } from './interpretation-errors';

export interface ResumeContext {
  priorBatchId: string | null;
  resumeSkipIds: Set<string>;
  priorComponents: Map<string, OrchestratedComponent>;
}

interface PriorImportSummary {
  hf?: string;
  componentOutcomes?: ComponentOutcome[];
  partialSuccess?: boolean;
  retryableFailures?: string[];
  storagePath?: string;
  ruleSetId?: string;
}

/**
 * Find the most recent prior import_batch for this tenant + storage path
 * with partialSuccess=true. Returns the component IDs that succeeded
 * before and the corresponding DAG-tree payloads from the active rule_set's
 * components JSON.
 */
export async function loadResumeContext(
  supabase: SupabaseClient,
  tenantId: string,
  storagePath: string,
): Promise<ResumeContext> {
  const emptyCtx: ResumeContext = {
    priorBatchId: null,
    resumeSkipIds: new Set(),
    priorComponents: new Map(),
  };

  // Find the most recent import_batch for this tenant whose metadata.storagePath
  // (or error_summary.storagePath) matches the current storagePath AND that
  // carries an HF-248 componentOutcomes record. Use error_summary.storagePath
  // since metadata schema varies historically.
  const { data: batches, error } = await supabase
    .from('import_batches')
    .select('id, error_summary, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error || !batches) {
    return emptyCtx;
  }

  let summary: PriorImportSummary | null = null;
  let batchId: string | null = null;
  for (const b of batches) {
    const es = b.error_summary as PriorImportSummary | null;
    if (!es || es.hf !== 'HF-248') continue;
    if (es.storagePath !== storagePath) continue;
    if (!es.partialSuccess) continue;
    summary = es;
    batchId = b.id;
    break;
  }
  if (!summary || !batchId) return emptyCtx;

  const successOutcomes = (summary.componentOutcomes ?? []).filter(o => o.status === 'success');
  if (successOutcomes.length === 0) return emptyCtx;

  // Pull the persisted components from the active rule_set associated with
  // the prior batch's ruleSetId (preferred) or by tenant-active lookup.
  let ruleSetRow: { components: Json | null } | null = null;
  if (summary.ruleSetId) {
    const { data } = await supabase
      .from('rule_sets')
      .select('components')
      .eq('id', summary.ruleSetId)
      .maybeSingle();
    ruleSetRow = data;
  }
  if (!ruleSetRow) {
    const { data } = await supabase
      .from('rule_sets')
      .select('components')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    ruleSetRow = data;
  }
  if (!ruleSetRow) return emptyCtx;

  const variants = (ruleSetRow.components as Record<string, unknown> | null)?.variants;
  if (!Array.isArray(variants)) return emptyCtx;

  // Build an id → component map from the persisted variants.
  const compById = new Map<string, OrchestratedComponent>();
  for (const v of variants as Array<Record<string, unknown>>) {
    const vc = v.components as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(vc)) continue;
    for (const c of vc) {
      const id = String(c.id ?? '');
      if (!id) continue;
      // Skip duplicates across variants — first occurrence wins, same shape.
      if (compById.has(id)) continue;
      compById.set(id, {
        id,
        name: String(c.name ?? ''),
        nameEs: c.nameEs ? String(c.nameEs) : undefined,
        type: String(c.componentType ?? c.type ?? 'prime_dag'),
        appliesToEmployeeTypes: ['all'],
        calculationIntent: c.calculationIntent as Record<string, unknown> | undefined,
        calculationMethod: (c.metadata as Record<string, unknown> | undefined)?.intent as Record<string, unknown> | undefined ?? undefined,
        confidence: typeof c.confidence === 'number' ? c.confidence : 0.8,
        reasoning: typeof c.reasoning === 'string' ? c.reasoning : '',
      });
    }
  }

  const resumeSkipIds = new Set<string>();
  const priorComponents = new Map<string, OrchestratedComponent>();
  for (const o of successOutcomes) {
    if (compById.has(o.id)) {
      resumeSkipIds.add(o.id);
      priorComponents.set(o.id, compById.get(o.id)!);
    }
  }

  return { priorBatchId: batchId, resumeSkipIds, priorComponents };
}

/**
 * Persist componentOutcomes + storagePath on the import_batch's error_summary
 * after a (possibly partial) orchestration completes. Subsequent imports of
 * the same plan can resume from here.
 *
 * Best-effort write; never throws.
 */
export async function persistComponentOutcomes(
  supabase: SupabaseClient,
  tenantId: string,
  storagePath: string,
  ruleSetId: string,
  orchestration: OrchestrationResult,
): Promise<void> {
  // Locate the most recent import_batch for this tenant that has not yet
  // been marked with HF-248 outcomes. We update its error_summary in-place
  // so the resume loader can find it on reimport.
  const { data: batches } = await supabase
    .from('import_batches')
    .select('id, error_summary, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (!batches || batches.length === 0) return;

  const summary: PriorImportSummary = {
    hf: 'HF-248',
    componentOutcomes: orchestration.componentOutcomes,
    partialSuccess: orchestration.partialSuccess,
    retryableFailures: orchestration.retryableFailures,
    storagePath,
    ruleSetId,
  };

  const targetBatch = batches[0];
  await supabase
    .from('import_batches')
    .update({ error_summary: summary as unknown as Json })
    .eq('id', targetBatch.id);

  console.log(
    `[reimport-resume] persisted componentOutcomes for batch=${targetBatch.id} ruleSet=${ruleSetId} ` +
      `partial=${orchestration.partialSuccess} retryable=${orchestration.retryableFailures.length}`,
  );
}
