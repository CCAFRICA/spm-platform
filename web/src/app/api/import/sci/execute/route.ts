// SCI Execute API — POST /api/import/sci/execute
// Decision 77 — OB-127
// Processes confirmed proposals through classification-specific pipelines.
// Zero domain vocabulary. Korean Test applies.

// OB-133/OB-150: Extended timeout for plan interpretation (AI takes 20-60s on production)
export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro max

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
// HF-196 Phase 1: post-commit construction unified via shared module.
// Replaces direct call to resolveEntitiesFromCommittedData; the library function
// is now invoked indirectly through the shared module to keep both import
// endpoints' post-commit work identical.
import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
// OB-199 Phase 4: writeClassificationSignal deleted; migrated to canonical writer below.
import { aggregateToFoundational, aggregateToDomain, writeClassificationSignal } from '@/lib/sci/classification-signal-service';
import { CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
import { writeFingerprint } from '@/lib/sci/fingerprint-flywheel';
import { computeFingerprintHashSync } from '@/lib/sci/structural-fingerprint';
// OB-199 Phase 4: ClassificationSignalPayload no longer used at call site.
import type { StructuralFingerprint } from '@/lib/sci/classification-signal-service';
import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
import type { Json } from '@/lib/supabase/database.types';
import type {
  SCIExecutionRequest,
  SCIExecutionResult,
  ContentUnitResult,
  ContentUnitExecution,
} from '@/lib/sci/sci-types';
// HF-231: source_date extraction, supersession, hashing, field_identities,
// and data_type resolution all moved into commitContentUnit. Only the file-
// hash helper is still used here (computed once over raw file bytes and
// threaded into commitContentUnit per content unit).
import { computeFileHashSha256 } from '@/lib/sci/file-content-hash';
// HF-231: sole committed_data writer — collapses 4 inline write sites in
// this route (plus 4 in execute-bulk/route.ts) into one function.
import { commitContentUnit } from '@/lib/sci/commit-content-unit';

// Generic role detection targets (AP-5/AP-6: no hardcoded language-specific names)

// HF-196 Phase 1D: normalizeFileNameToDataType deleted — D154 violation removed.
// data_type now derives from SCI classification via @/lib/sci/data-type-resolver
// (single canonical surface).

export async function POST(req: NextRequest) {
  try {
    // HF-084: Get authenticated user ID for created_by fields
    const authClient = await createServerSupabaseClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body: SCIExecutionRequest = await req.json();
    const { proposalId, tenantId, contentUnits, storagePath } = body;

    if (!tenantId || !proposalId || !contentUnits || contentUnits.length === 0) {
      return NextResponse.json(
        { error: 'tenantId, proposalId, and contentUnits required' },
        { status: 400 }
      );
    }

    // HF-090: Use auth.uid() directly for created_by attribution (JWT-verified identity)
    const profileId = authUser.id;

    // HF-196 Phase 1F-corrective: Compute SHA-256 over RAW FILE BYTES (not parsed
    // JSON intermediates per FP-43 / AP-34 / OB-50). Single canonical computation
    // per request; threaded through all dispatch pipelines that insert into
    // import_batches. Plan path goes through executeBatchedPlanInterpretation /
    // executePlanPipeline and uses HF-132 rule_sets-layer supersession (not
    // import_batches Phase 1F supersession), so plan-only requests do not require
    // SHA. Non-plan requests REQUIRE storagePath + successful download.
    let fileHashSha256: string | null = null;
    if (storagePath) {
      try {
        const { data: fileData, error: dlErr } = await supabase.storage
          .from('ingestion-raw')
          .download(storagePath);
        if (dlErr || !fileData) {
          console.error(`[SCI Execute Phase 1F] file download failed for SHA: ${dlErr?.message ?? 'no data'}`);
        } else {
          const fileBuffer = Buffer.from(await fileData.arrayBuffer());
          fileHashSha256 = computeFileHashSha256(fileBuffer);
        }
      } catch (err) {
        console.error(`[SCI Execute Phase 1F] file fetch threw (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const nonPlanExists = contentUnits.some(u => u.confirmedClassification !== 'plan');
    if (nonPlanExists && !fileHashSha256) {
      return NextResponse.json(
        { error: 'Phase 1F: storagePath required for non-plan import (file_hash_sha256 mandatory per Rule 30 + OB-50 supersession primitive)' },
        { status: 400 }
      );
    }

    // Verify tenant exists + read industry for domain flywheel (OB-160J)
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, settings')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const tenantSettings = (tenant.settings as Record<string, unknown>) ?? {};
    const tenantDomainId = (tenantSettings.industry as string) || '';

    const results: ContentUnitResult[] = [];

    // HF-109: Pipeline order — reference before data for convergence, plan independent
    // Entity resolution is post-import (DS-009 3.3), so no ordering constraint for entity pipeline
    const PIPELINE_ORDER: Record<string, number> = { reference: 0, entity: 1, target: 1, transaction: 1, plan: 2 };
    const sorted = [...contentUnits].sort((a, b) =>
      (PIPELINE_ORDER[a.confirmedClassification] ?? 9) - (PIPELINE_ORDER[b.confirmedClassification] ?? 9)
    );

    // HF-130: Batch all plan-classified units from the same file into ONE interpretation call.
    // A multi-sheet XLSX plan (e.g., overview + rate tables + targets) must be interpreted as
    // a single document — the AI needs cross-sheet context to extract complete components.
    const planUnits = sorted.filter(u => u.confirmedClassification === 'plan');
    const handledPlanUnitIds = new Set<string>();

    if (planUnits.length > 0 && storagePath) {
      try {
        const batchResults = await executeBatchedPlanInterpretation(
          supabase, tenantId, planUnits, profileId, storagePath
        );
        for (const r of batchResults) {
          results.push(r);
          handledPlanUnitIds.add(r.contentUnitId);
        }
      } catch (err) {
        // If batched interpretation fails, fall through to per-unit processing
        console.error('[SCI Execute] Batched plan interpretation failed, falling back to per-unit:', err);
      }
    }

    for (const unit of sorted) {
      if (handledPlanUnitIds.has(unit.contentUnitId)) continue; // HF-130: already handled in batch
      try {
        const result = await executeContentUnit(supabase, tenantId, proposalId, unit, profileId, storagePath, fileHashSha256);
        results.push(result);
      } catch (err) {
        results.push({
          contentUnitId: unit.contentUnitId,
          classification: unit.confirmedClassification,
          success: false,
          rowsProcessed: 0,
          pipeline: unit.confirmedClassification,
          error: String(err),
        });
      }
    }

    // HF-224: Import-time convergence (OB-160G) removed. Convergence binding is
    // performed at calc time (HF-165) so each calculation run sees a complete
    // dataset and a fresh component-binding decision. Pre-HF-224 the partial
    // bindings written here could prevent HF-165 from re-running cleanly.

    // HF-196 Phase 1: post-commit construction via shared module (Break #3 closure).
    // Entity resolution + entity_id back-link runs identically for both import endpoints.
    await executePostCommitConstruction({ supabase, tenantId, source: 'sci-execute' });

    // HF-126: Auto-create rule_set_assignments after entity resolution.
    // The calculation engine requires assignments to route entities to plans.
    // This runs AFTER entity resolution so all entities exist.
    try {
      const { data: activeRuleSets } = await supabase
        .from('rule_sets')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');

      if (activeRuleSets && activeRuleSets.length > 0) {
        // Fetch all entity IDs for this tenant
        const ASSIGN_PAGE = 1000;
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

        if (allEntityIds.length > 0) {
          // Check which entities already have assignments
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

          // Build missing assignments
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

          if (newAssignments.length > 0) {
            const INSERT_BATCH = 5000;
            for (let i = 0; i < newAssignments.length; i += INSERT_BATCH) {
              const slice = newAssignments.slice(i, i + INSERT_BATCH);
              const { error: insertErr } = await supabase
                .from('rule_set_assignments')
                .insert(slice);
              if (insertErr) {
                console.error(`[SCI Execute] HF-126 assignment insert batch ${i} error:`, insertErr.message);
              }
            }
            console.log(`[SCI Execute] HF-126: Created ${newAssignments.length} rule_set_assignments for ${allEntityIds.length} entities x ${activeRuleSets.length} rule sets`);
          } else {
            console.log(`[SCI Execute] HF-126: All ${allEntityIds.length} entities already assigned`);
          }
        }
      }
    } catch (assignErr) {
      console.error('[SCI Execute] HF-126 assignment creation failed (non-blocking):', assignErr);
    }

    const response: SCIExecutionResult = {
      proposalId,
      results,
      overallSuccess: results.every(r => r.success),
    };

    // OB-160E/HF-094: Write classification signals via dedicated columns (fire-and-forget)
    // Single write path: writeClassificationSignal (HF-092 dedicated columns)
    try {
      for (const unit of contentUnits) {
        if (!unit.structuralFingerprint) continue;

        const originalClassification = unit.originalClassification || unit.confirmedClassification;
        const wasOverridden = originalClassification !== unit.confirmedClassification;
        const traceData = unit.classificationTrace as ClassificationTrace | undefined;

        // OB-199 Phase 4 supplement A: thin facade re-establishes SCI structural markers.
        // Decision 30 v2 inclusive bound: confidence=1.0 on human-override admissible.
        const confidenceValue = wasOverridden ? 1.0 : (unit.originalConfidence || 0);
        writeClassificationSignal({
          tenantId,
          sourceFileName: unit.sourceFile || '',
          sheetName: unit.tabName || '',
          fingerprint: unit.structuralFingerprint as unknown as StructuralFingerprint,
          classification: unit.confirmedClassification,
          confidence: confidenceValue,
          decisionSource: wasOverridden ? 'human_override' : (traceData?.decisionSource || 'heuristic'),
          classificationTrace: (traceData ?? ({} as unknown as ClassificationTrace)),
          vocabularyBindings: unit.vocabularyBindings || null,
          agentScores: traceData
            ? Object.fromEntries(traceData.round1.map(s => [s.agent, s.confidence]))
            : {},
          humanCorrectionFrom: wasOverridden ? originalClassification : null,
        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
          if (err instanceof CanonicalWriteError) {
            console.warn(`[SCIExecute] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
          } else {
            console.warn('[SCIExecute] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
          }
        });

        // OB-160I: Aggregate anonymized structural pattern to foundational scope (fire-and-forget)
        // Privacy: only structural fingerprint + classification + confidence cross the tenant boundary
        const aggConfidence = wasOverridden ? 1.0 : (unit.originalConfidence || 0);
        aggregateToFoundational(
          unit.structuralFingerprint as unknown as StructuralFingerprint,
          unit.confirmedClassification,
          aggConfidence,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {});

        // OB-160J: Aggregate to domain scope (fire-and-forget)
        aggregateToDomain(
          unit.structuralFingerprint as unknown as StructuralFingerprint,
          unit.confirmedClassification,
          aggConfidence,
          tenantDomainId,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {});

        // HF-181 Layer 2: Update fingerprint with CONFIRMED bindings (fire-and-forget)
        // The analyze route wrote the fingerprint from pre-LLM structural-only bindings.
        // After user confirmation, update with the confirmed roles so future Tier 1 lookups
        // have correct semantic roles (especially entity_identifier).
        //
        // HF-236 (DIAG-050 closure Layer 1): Enrich each cached binding with the
        // native HeaderInterpretation.columnRole + identifiesWhat from the HC
        // trace so the next Tier-1 replay can reconstruct HeaderInterpretation
        // directly without a hardcoded semanticRole→columnRole registry. Per
        // T1-E910 v2 (Korean Test, locked 2026-05-18): structural primitives
        // exist in exactly one canonical declaration. Caching the native role
        // alongside the semantic role makes the flywheel-replay path emit the
        // same HeaderInterpretation shape as the fresh-LLM path — closing the
        // Adjacent-Arm Drift (T1-E952) that DIAG-050 identified.
        if (unit.confirmedBindings && unit.confirmedBindings.length > 0 && unit.rawData && unit.rawData.length > 0) {
          const cols = Object.keys(unit.rawData[0]);
          const hash = computeFingerprintHashSync(cols, unit.rawData.slice(0, 5));
          const confirmedColumnRoles: Record<string, string> = {};
          for (const binding of unit.confirmedBindings) {
            if (binding.sourceField && binding.semanticRole) {
              confirmedColumnRoles[binding.sourceField] = binding.semanticRole;
            }
          }

          // HF-236: read native columnRole + identifiesWhat from classificationTrace's
          // headerComprehension.interpretations to enrich each cached binding.
          const hcInterps = (unit.classificationTrace as Record<string, unknown> | undefined)
            ?.headerComprehension as
              | { interpretations?: Record<string, { columnRole?: string; identifiesWhat?: string }> }
              | undefined;
          const interpMap = hcInterps?.interpretations ?? {};

          const enrichedFieldBindings = unit.confirmedBindings.map(b => {
            const interp = interpMap[b.sourceField];
            return {
              ...b,
              ...(interp?.columnRole ? { columnRole: interp.columnRole } : {}),
              ...(interp?.identifiesWhat ? { identifiesWhat: interp.identifiesWhat } : {}),
            };
          });

          writeFingerprint(
            tenantId,
            hash,
            {
              classification: unit.confirmedClassification,
              confidence: 1.0,
              fieldBindings: enrichedFieldBindings,
              tabName: unit.tabName || '',
            },
            confirmedColumnRoles,
            unit.sourceFile || '',
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          ).catch(() => {});
        }
      }
    } catch {
      // Flywheel signal failure must NEVER block import
    }

    return NextResponse.json(response);

  } catch (err) {
    console.error('[SCI Execute] Error:', err);
    return NextResponse.json(
      { error: 'Execution failed', details: String(err) },
      { status: 500 }
    );
  }
}

async function executeContentUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution,
  userId: string,
  storagePath: string | undefined,
  fileHashSha256: string | null,
): Promise<ContentUnitResult> {
  // OB-134: For PARTIAL claims, filter rawData to only include owned + shared fields
  const effectiveUnit = filterFieldsForPartialClaim(unit);

  switch (effectiveUnit.confirmedClassification) {
    case 'target':
      // POST handler validation guarantees fileHashSha256 non-null for non-plan classifications.
      return executeTargetPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
    case 'transaction':
      return executeTransactionPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
    case 'entity':
      return executeEntityPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
    case 'plan':
      return executePlanPipeline(supabase, tenantId, effectiveUnit, userId, storagePath);
    case 'reference':
      return executeReferencePipeline(supabase, tenantId, proposalId, effectiveUnit, userId, fileHashSha256!);
  }
}

// OB-134: Field filtering for PARTIAL claims
// HF-236 (DIAG-050 closure): Per T1-E902 v2 + T2-E06 v2 (locked 2026-05-18),
// PARTIAL narrows agent ownership semantics only. rawData persists
// unconditionally; confirmedBindings narrow to the agent's owned + shared
// field set. See execute-bulk/route.ts:filterFieldsForPartialClaim for the
// mirror site and full substrate citation.
function filterFieldsForPartialClaim(unit: ContentUnitExecution): ContentUnitExecution {
  if (unit.claimType !== 'PARTIAL' || !unit.ownedFields || !unit.sharedFields) {
    return unit; // FULL claim — no filtering
  }

  const allowedFields = new Set([...unit.ownedFields, ...unit.sharedFields]);

  // Filter bindings to only allowed fields. rawData passes through unchanged.
  const filteredBindings = unit.confirmedBindings.filter(
    b => allowedFields.has(b.sourceField)
  );

  return {
    ...unit,
    confirmedBindings: filteredBindings,
  };
}

// ============================================================
// TARGET PIPELINE — the critical new addition
// ============================================================

async function executeTargetPipeline(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution,
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  const rows = unit.rawData;
  if (!rows || rows.length === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'target',
      success: true,
      rowsProcessed: 0,
      pipeline: 'target',
    };
  }

  // tabName retained for row_data._sheetName provenance.
  const tabName = unit.contentUnitId.split('::')[1] || 'Sheet1';

  // HF-231: Unified committed_data write via shared commitContentUnit.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'target',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-execute-${proposalId}`,
    source: 'sci',
    fileHashSha256,
  });

  if (!commitResult.success) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'target',
      success: false,
      rowsProcessed: commitResult.totalInserted,
      pipeline: 'target',
      error: commitResult.error,
    };
  }

  const totalInserted = commitResult.totalInserted;

  // OB-153: Period creation removed from import (Decision 92 — periods created at calculate time)
  // OB-144: Post-commit construction — create assignments, bind entity_id, store metadata
  await postCommitConstruction(supabase, tenantId, commitResult.batchId, commitResult.entityIdField ?? undefined, unit);

  // OB-160G: Per-pipeline convergence removed — runs once after all pipelines complete
  console.log(`[SCI Execute] Target pipeline complete: ${totalInserted} rows`);

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'target',
    success: true,
    rowsProcessed: totalInserted,
    pipeline: 'target',
  };
}

// ============================================================
// TRANSACTION PIPELINE — standard committed_data insert
// ============================================================

async function executeTransactionPipeline(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution,
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  const rows = unit.rawData;
  if (!rows || rows.length === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'transaction',
      success: true,
      rowsProcessed: 0,
      pipeline: 'transaction',
    };
  }

  const tabName = unit.contentUnitId.split('::')[1] || 'Sheet1';

  // HF-231: Unified committed_data write via shared commitContentUnit.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'transaction',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-execute-${proposalId}`,
    source: 'sci',
    fileHashSha256,
  });

  if (!commitResult.success) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'transaction',
      success: false,
      rowsProcessed: commitResult.totalInserted,
      pipeline: 'transaction',
      error: commitResult.error,
    };
  }

  const totalInserted = commitResult.totalInserted;

  // OB-153: Period creation removed from import (Decision 92 — periods created at calculate time)
  // OB-144: Post-commit construction — create assignments, bind entity_id, store metadata
  await postCommitConstruction(supabase, tenantId, commitResult.batchId, commitResult.entityIdField ?? undefined, unit);

  // OB-160G: Per-pipeline convergence removed — runs once after all pipelines complete

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'transaction',
    success: true,
    rowsProcessed: totalInserted,
    pipeline: 'transaction',
  };
}

// ============================================================
// ENTITY PIPELINE — HF-109: committed_data only (DS-009 3.3)
// Entity creation + entity_id backfill moved to post-import
// resolveEntitiesFromCommittedData (entity-resolution.ts)
// ============================================================

async function executeEntityPipeline(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution,
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  const rows = unit.rawData;
  if (!rows || rows.length === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'entity',
      success: true,
      rowsProcessed: 0,
      pipeline: 'entity',
    };
  }

  const tabName = unit.contentUnitId.split('::')[1] || 'Sheet1';

  // HF-231: Unified committed_data write via shared commitContentUnit.
  // HF-109 contract preserved: entity_id stays NULL at import, backfilled
  // post-import by resolveEntitiesFromCommittedData (DS-009 3.3).
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'entity',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-execute-${proposalId}`,
    source: 'sci',
    fileHashSha256,
  });

  if (!commitResult.success) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'entity' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'entity',
      error: commitResult.error,
    };
  }

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'entity',
    success: true,
    rowsProcessed: commitResult.totalInserted,
    pipeline: 'entity',
  };
}

// ============================================================
// REFERENCE PIPELINE — OB-162: Decision 111 — unified committed_data storage
// All data → committed_data with field_identities in metadata.
// reference_data/reference_items tables deprecated — zero new writes.
// ============================================================

async function executeReferencePipeline(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution,
  userId: string,
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  void userId; // No longer needed — reference_data.created_by not used
  const rows = unit.rawData;
  if (!rows || rows.length === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'reference',
      success: true,
      rowsProcessed: 0,
      pipeline: 'reference',
    };
  }

  const tabName = unit.contentUnitId.split('::')[1] || 'Sheet1';

  // HF-231: Unified committed_data write via shared commitContentUnit.
  // OB-162 / Decision 111 contract preserved: reference data flows to
  // committed_data only — no writes to reference_data / reference_items.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'reference',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-execute-${proposalId}`,
    source: 'sci',
    fileHashSha256,
  });

  if (!commitResult.success) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'reference',
      success: false,
      rowsProcessed: commitResult.totalInserted,
      pipeline: 'reference',
      error: commitResult.error,
    };
  }

  const totalInserted = commitResult.totalInserted;

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'reference',
    success: true,
    rowsProcessed: totalInserted,
    pipeline: 'reference',
  };
}

// ============================================================
// HF-130: BATCHED PLAN INTERPRETATION
// When multiple sheets from the same file are classified as plan,
// combine them into ONE AI interpretation call with full cross-sheet context.
// ============================================================

async function executeBatchedPlanInterpretation(
  supabase: SupabaseClient,
  tenantId: string,
  planUnits: ContentUnitExecution[],
  userId: string,
  storagePath: string,
): Promise<ContentUnitResult[]> {
  // Use first unit's contentUnitId as the primary (for rule_set metadata)
  const primaryUnit = planUnits[0];
  const primaryContentUnitId = primaryUnit.contentUnitId;

  // HF-133: Removed "already exists" early return — stale draft rule_sets from prior
  // failed runs were short-circuiting the HF-129/130/131/132 chain. HF-132's supersede
  // logic handles duplicates: old rule_sets get status='superseded', new one gets 'active'.

  // Download file from storage
  console.log(`[SCI Execute] Batched plan interpretation: ${planUnits.length} sheets from ${storagePath}`);
  const { data: fileData, error: downloadErr } = await supabase.storage
    .from('ingestion-raw')
    .download(storagePath);

  if (downloadErr || !fileData) {
    console.error(`[SCI Execute] Storage download failed: ${downloadErr?.message || 'No data'}`);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: `Failed to download plan file: ${downloadErr?.message || 'No data'}`,
    }));
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer());
  const ext = storagePath.split('.').pop()?.toLowerCase();

  // Extract text content from the file
  let documentContent = '';
  let pdfBase64ForAI: string | undefined;
  let pdfMediaType: string | undefined;

  if (ext === 'pdf') {
    pdfBase64ForAI = fileBuffer.toString('base64');
    pdfMediaType = 'application/pdf';
    documentContent = `[PDF document: ${pdfBase64ForAI.length} bytes base64]`;
  } else if (ext === 'xlsx' || ext === 'xls') {
    // XLSX: Extract text from ALL plan-classified sheets using xlsx library
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Build a set of sheet names from the plan units' tab names
    const planSheetNames = new Set(planUnits.map(u => u.tabName).filter(Boolean));

    const sheetTexts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      // Include sheets that are plan-classified, or ALL sheets if we can't match by name
      // (fallback ensures the AI gets full context even if tabName doesn't match exactly)
      if (planSheetNames.size > 0 && !planSheetNames.has(sheetName)) continue;

      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      // Convert sheet to array of arrays for text representation
      const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rows.length === 0) continue;

      sheetTexts.push(`=== Sheet: ${sheetName} ===`);
      for (const row of rows) {
        const values = (row as unknown[]).map(v => String(v ?? '').trim());
        if (values.some(v => v !== '')) {
          sheetTexts.push(values.join('\t'));
        }
      }
      sheetTexts.push(''); // blank line between sheets
    }

    // If no plan sheets matched by name, fall back to ALL sheets
    if (sheetTexts.length === 0) {
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;
        const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (rows.length === 0) continue;
        sheetTexts.push(`=== Sheet: ${sheetName} ===`);
        for (const row of rows) {
          const values = (row as unknown[]).map(v => String(v ?? '').trim());
          if (values.some(v => v !== '')) {
            sheetTexts.push(values.join('\t'));
          }
        }
        sheetTexts.push('');
      }
    }

    documentContent = sheetTexts.join('\n');
    console.log(`[SCI Execute] XLSX plan text extracted: ${documentContent.length} chars from ${planSheetNames.size} sheets`);
  } else {
    // PPTX/DOCX: extract text via JSZip (existing logic)
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(fileBuffer);

    if (ext === 'pptx') {
      const slideFiles = Object.keys(zip.files)
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
          return numA - numB;
        });
      const texts: string[] = [];
      for (const sf of slideFiles) {
        const content = await zip.file(sf)?.async('string');
        if (!content) continue;
        const matches = Array.from(content.matchAll(/<a:t>([^<]*)<\/a:t>/g));
        for (const m of matches) {
          const t = m[1].trim();
          if (t) texts.push(t);
        }
      }
      documentContent = texts.join('\n');
    } else {
      // DOCX
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (docXml) {
        const matches = Array.from(docXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g));
        documentContent = matches.map(m => m[1].trim()).filter(Boolean).join(' ');
      }
    }
  }

  if (!documentContent && !pdfBase64ForAI) {
    console.log(`[SCI Execute] No document content extracted from ${storagePath}`);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: 'No document content could be extracted from the plan file',
    }));
  }

  // ONE AI interpretation call with combined content from all sheets
  console.log(`[SCI Execute] Batched plan interpretation starting — ${documentContent.length} chars`);
  const { getAIService } = await import('@/lib/ai');
  const aiService = getAIService();

  const response = await aiService.interpretPlan(
    documentContent,
    pdfBase64ForAI ? 'pdf' : 'text',
    { tenantId },
    pdfBase64ForAI,
    pdfMediaType
  );

  const interpretation = response.result;

  if (interpretation.fallback || interpretation.error) {
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: String(interpretation.error || 'AI interpretation returned no results'),
    }));
  }

  // Bridge AI output to engine format — ONE rule_set
  const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
  const engineFormat = bridgeAIToEngineFormat(
    interpretation as Record<string, unknown>,
    tenantId,
    userId,
  );

  const ruleSetId = crypto.randomUUID();
  const filenameFallback = primaryContentUnitId.split('::')[0]?.replace(/\.[^.]+$/, '') || '';
  const planName = engineFormat.name || filenameFallback || 'Untitled Plan';

  // HF-132: Supersede any existing active rule_sets for this tenant before activating the new one
  await supabase
    .from('rule_sets')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  const { error: upsertError } = await supabase
    .from('rule_sets')
    .upsert({
      id: ruleSetId,
      tenant_id: tenantId,
      name: planName,
      description: engineFormat.description || '',
      status: 'active' as const, // HF-132: Auto-activate on creation
      version: 1,
      population_config: {
        eligible_roles: [],
      },
      input_bindings: engineFormat.inputBindings as unknown as Json,
      components: engineFormat.components as unknown as Json,
      // OB-186: Store cadence from AI interpretation (defaults to monthly)
      cadence_config: { period_type: ((response as unknown as Record<string, unknown>).cadence as string) || 'monthly' } as unknown as Json,
      outcome_config: {},
      metadata: {
        plan_type: 'additive_lookup',
        source: 'sci',
        contentUnitId: primaryContentUnitId,
        batchedSheets: planUnits.map(u => u.contentUnitId),
        aiConfidence: response.confidence,
      } as unknown as Json,
      created_by: userId,
    });

  if (upsertError) {
    console.error('[SCI Execute] Batched plan save failed:', upsertError);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: upsertError.message,
    }));
  }

  const variants = engineFormat.components.variants || [];
  const componentCount = variants.reduce((sum: number, v: { components?: unknown[] }) => sum + (v.components?.length || 0), 0);
  console.log(`[SCI Execute] Batched plan saved: ${planName} (${ruleSetId}), ${variants.length} variants, ${componentCount} components from ${planUnits.length} sheets`);

  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2)
  // so convergence Pass 4 reads authoritative semantic intent before AI derivation.
  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
  // signal carries plan-agent reasoning verbatim. PlanComponent (engine-format) drops
  // reasoning during convertComponent; routing to interpretation.components preserves it.
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }

  // Return results: primary unit gets full result, others marked as included in batch
  return planUnits.map((u, i) => ({
    contentUnitId: u.contentUnitId,
    classification: 'plan' as const,
    success: true,
    rowsProcessed: i === 0 ? componentCount : 0,
    pipeline: i === 0 ? 'plan-interpretation' : 'plan-batch-included',
  }));
}

// ============================================================
// PLAN PIPELINE — routes to existing plan interpretation
// OB-133: Wired from stub to real AI interpretation + rule_set save
// ============================================================

async function executePlanPipeline(
  supabase: SupabaseClient,
  tenantId: string,
  unit: ContentUnitExecution,
  userId: string,
  storagePath?: string,
): Promise<ContentUnitResult> {
  // HF-133: Removed "already exists" early return — stale draft rule_sets from prior
  // failed runs were short-circuiting the HF-129/130/131/132 chain. HF-132's supersede
  // logic handles duplicates: old rule_sets get status='superseded', new one gets 'active'.

  const docMeta = unit.documentMetadata;
  let fileBase64 = docMeta?.fileBase64;
  let mimeType = docMeta?.mimeType;

  // HF-129: When fileBase64 is not in the request, retrieve from Supabase Storage
  if (!fileBase64 && storagePath) {
    console.log(`[SCI Execute] Plan ${unit.contentUnitId} — retrieving file from storage: ${storagePath}`);
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from('ingestion-raw')
      .download(storagePath);

    if (downloadErr || !fileData) {
      console.error(`[SCI Execute] Storage download failed: ${downloadErr?.message || 'No data'}`);
      return {
        contentUnitId: unit.contentUnitId,
        classification: 'plan',
        success: false,
        rowsProcessed: 0,
        pipeline: 'plan-interpretation',
        error: `Failed to retrieve plan document from storage: ${downloadErr?.message || 'No data'}`,
      };
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    fileBase64 = buffer.toString('base64');
    console.log(`[SCI Execute] Plan file retrieved from storage: ${(buffer.length / 1024).toFixed(1)}KB`);

    // Infer MIME type from storage path extension
    if (!mimeType) {
      const ext = storagePath.split('.').pop()?.toLowerCase();
      const MIME_MAP: Record<string, string> = {
        pdf: 'application/pdf',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
        csv: 'text/csv',
      };
      mimeType = (ext && MIME_MAP[ext]) || 'application/octet-stream';
    }
  }

  if (!fileBase64) {
    // No document data and no storage path — fallback for tabular plan classification
    console.log(`[SCI Execute] Plan content unit ${unit.contentUnitId} — no document data, deferred`);
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'plan',
      success: true,
      rowsProcessed: 0,
      pipeline: 'plan-deferred',
    };
  }

  console.log(`[SCI Execute] Plan interpretation starting for ${unit.contentUnitId}`);

  // 1. Call plan interpretation API (same service as Configure → Plan Import)
  const { getAIService } = await import('@/lib/ai');
  const aiService = getAIService();

  const isPdf = mimeType === 'application/pdf';
  let documentContent = '';
  let pdfBase64: string | undefined;
  let pdfMediaType: string | undefined;

  if (isPdf) {
    pdfBase64 = fileBase64;
    pdfMediaType = 'application/pdf';
    documentContent = `[PDF document: ${fileBase64.length} bytes base64]`;
  } else if (mimeType?.includes('spreadsheetml') || mimeType?.includes('ms-excel') || unit.contentUnitId.endsWith('.xlsx') || unit.contentUnitId.endsWith('.xls')) {
    // HF-130: XLSX text extraction — extract all sheets as tab-separated text
    const XLSX = await import('xlsx');
    const buffer = Buffer.from(fileBase64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetTexts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;
      const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rows.length === 0) continue;
      sheetTexts.push(`=== Sheet: ${sheetName} ===`);
      for (const row of rows) {
        const values = (row as unknown[]).map(v => String(v ?? '').trim());
        if (values.some(v => v !== '')) {
          sheetTexts.push(values.join('\t'));
        }
      }
      sheetTexts.push('');
    }
    documentContent = sheetTexts.join('\n');
  } else {
    // For PPTX/DOCX, extract text server-side
    const JSZip = (await import('jszip')).default;
    const buffer = Buffer.from(fileBase64, 'base64');
    const zip = await JSZip.loadAsync(buffer);

    if (mimeType?.includes('presentationml') || unit.contentUnitId.endsWith('.pptx')) {
      // PPTX text extraction
      const slideFiles = Object.keys(zip.files)
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
          return numA - numB;
        });
      const texts: string[] = [];
      for (const sf of slideFiles) {
        const content = await zip.file(sf)?.async('string');
        if (!content) continue;
        const matches = Array.from(content.matchAll(/<a:t>([^<]*)<\/a:t>/g));
        for (const m of matches) {
          const t = m[1].trim();
          if (t) texts.push(t);
        }
      }
      documentContent = texts.join('\n');
    } else {
      // DOCX text extraction
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (docXml) {
        const matches = Array.from(docXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g));
        documentContent = matches.map(m => m[1].trim()).filter(Boolean).join(' ');
      }
    }
  }

  const response = await aiService.interpretPlan(
    documentContent,
    isPdf ? 'pdf' : 'text',
    { tenantId },
    pdfBase64,
    pdfMediaType
  );

  const interpretation = response.result;

  if (interpretation.fallback || interpretation.error) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'plan',
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: String(interpretation.error || 'AI interpretation returned no results'),
    };
  }

  // 2. OB-155: Bridge AI output to engine-compatible format
  // The AI produces calculationType/calculationIntent; the engine needs componentType/tierConfig/matrixConfig etc.
  const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
  const engineFormat = bridgeAIToEngineFormat(
    interpretation as Record<string, unknown>,
    tenantId,
    userId,
  );

  const ruleSetId = crypto.randomUUID();
  const filenameFallback = unit.contentUnitId.split('::')[0]?.replace(/\.[^.]+$/, '') || '';
  const planName = engineFormat.name || filenameFallback || 'Untitled Plan';

  // HF-132: Supersede any existing active rule_sets for this tenant before activating the new one
  await supabase
    .from('rule_sets')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  const { error: upsertError } = await supabase
    .from('rule_sets')
    .upsert({
      id: ruleSetId,
      tenant_id: tenantId,
      name: planName,
      description: engineFormat.description || '',
      status: 'active' as const, // HF-132: Auto-activate on creation
      version: 1,
      population_config: {
        eligible_roles: [],
      },
      input_bindings: engineFormat.inputBindings as unknown as Json,
      components: engineFormat.components as unknown as Json,
      // OB-186: Store cadence from AI interpretation (defaults to monthly)
      cadence_config: { period_type: ((response as unknown as Record<string, unknown>).cadence as string) || 'monthly' } as unknown as Json,
      outcome_config: {},
      metadata: {
        plan_type: 'additive_lookup',
        source: 'sci',
        contentUnitId: unit.contentUnitId,
        aiConfidence: response.confidence,
      } as unknown as Json,
      created_by: userId,
    });

  if (upsertError) {
    console.error('[SCI Execute] Plan save failed:', upsertError);
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'plan',
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: upsertError.message,
    };
  }

  const variants = engineFormat.components.variants || [];
  const componentCount = variants.reduce((sum: number, v: { components?: unknown[] }) => sum + (v.components?.length || 0), 0);
  console.log(`[SCI Execute] Plan saved: ${planName} (${ruleSetId}), ${variants.length} variants, ${componentCount} components`);

  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2).
  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
  // signal carries plan-agent reasoning verbatim.
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'plan',
    success: true,
    rowsProcessed: componentCount,
    pipeline: 'plan-interpretation',
  };
}

// ──────────────────────────────────────────────
// OB-153: detectAndCreatePeriods + parseDateValue REMOVED
// Decision 92: Periods created at calculate time, not import time.
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// OB-144: Post-Commit Construction (OB-153: period binding removed)
// Creates missing entities, binds entity_id, creates assignments.
// Korean Test: entity field name comes from semantic role, not hardcoded.
// ──────────────────────────────────────────────

async function postCommitConstruction(
  supabase: SupabaseClient,
  tenantId: string,
  importBatchId: string,
  entityIdField: string | undefined,
  unit: ContentUnitExecution,
): Promise<void> {
  const BATCH = 200;

  // OB-157: Entity creation removed from postCommitConstruction.
  // Only entity-classified content units create entities (via executeEntityPipeline).
  // Target/transaction units bind to existing entities only.
  if (entityIdField) {
    // Collect unique identifiers from the imported data
    const allIdentifiers = new Set<string>();
    for (const row of unit.rawData) {
      const val = row[entityIdField];
      if (val != null && String(val).trim()) {
        allIdentifiers.add(String(val).trim());
      }
    }

    if (allIdentifiers.size > 0) {
      const allIds = Array.from(allIdentifiers);

      // OB-153: Create rule_set_assignments for ALL entities that lack them
      // (not just newly created — existing entities may also need assignments)
      const { data: ruleSets } = await supabase
        .from('rule_sets')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('status', ['active', 'draft']);

      if (ruleSets && ruleSets.length > 0) {
        // Fetch ALL entity IDs for these identifiers
        const allEntityIds: string[] = [];
        for (let i = 0; i < allIds.length; i += BATCH) {
          const slice = allIds.slice(i, i + BATCH);
          const { data } = await supabase
            .from('entities')
            .select('id')
            .eq('tenant_id', tenantId)
            .in('external_id', slice);
          if (data) allEntityIds.push(...data.map(e => e.id));
        }

        // Check which entities already have assignments
        const assignedEntityIds = new Set<string>();
        for (let i = 0; i < allEntityIds.length; i += BATCH) {
          const slice = allEntityIds.slice(i, i + BATCH);
          const { data } = await supabase
            .from('rule_set_assignments')
            .select('entity_id')
            .eq('tenant_id', tenantId)
            .in('entity_id', slice);
          if (data) {
            for (const a of data) assignedEntityIds.add(a.entity_id);
          }
        }

        const unassigned = allEntityIds.filter(id => !assignedEntityIds.has(id));
        if (unassigned.length > 0) {
          for (const rs of ruleSets) {
            for (let i = 0; i < unassigned.length; i += BATCH) {
              const slice = unassigned.slice(i, i + BATCH);
              const assignments = slice.map(entityId => ({
                tenant_id: tenantId,
                rule_set_id: rs.id,
                entity_id: entityId,
              }));
              await supabase.from('rule_set_assignments').insert(assignments);
            }
          }
          console.log(`[SCI Execute] Created assignments for ${unassigned.length} unassigned entities × ${ruleSets.length} rule sets`);
        }
      }

      // Bind entity_id on committed_data rows for this import batch
      // Build entity_id map (including newly created entities)
      const entityIdMap = new Map<string, string>();
      for (let i = 0; i < allIds.length; i += BATCH) {
        const slice = allIds.slice(i, i + BATCH);
        const { data } = await supabase
          .from('entities')
          .select('id, external_id')
          .eq('tenant_id', tenantId)
          .in('external_id', slice);
        if (data) {
          for (const e of data) {
            if (e.external_id) entityIdMap.set(e.external_id, e.id);
          }
        }
      }

      // Update committed_data rows that have NULL entity_id
      let entityBound = 0;
      let page = 0;
      while (true) {
        const { data: rows } = await supabase
          .from('committed_data')
          .select('id, row_data')
          .eq('tenant_id', tenantId)
          .eq('import_batch_id', importBatchId)
          .is('entity_id', null)
          .limit(500);

        if (!rows || rows.length === 0) break;

        const groups = new Map<string, string[]>();
        for (const r of rows) {
          const rd = r.row_data as Record<string, unknown>;
          const extId = String(rd[entityIdField] ?? '').trim();
          const eid = entityIdMap.get(extId);
          if (eid) {
            if (!groups.has(eid)) groups.set(eid, []);
            groups.get(eid)!.push(r.id);
          }
        }

        for (const [entityId, ids] of Array.from(groups.entries())) {
          for (let i = 0; i < ids.length; i += BATCH) {
            const slice = ids.slice(i, i + BATCH);
            await supabase.from('committed_data').update({ entity_id: entityId }).in('id', slice);
            entityBound += slice.length;
          }
        }

        page++;
        if (rows.length < 500 || page > 200) break;
      }
      if (entityBound > 0) {
        console.log(`[SCI Execute] Bound entity_id on ${entityBound} committed_data rows`);
      }
    }
  }

  // OB-146 Step 1b: Populate entity store metadata from import data.
  // After entities are created and entity_id is bound, scan the same batch
  // for store identifiers (storeId/num_tienda/No_Tienda) and volume tier info.
  // This bridges entity→store association so the calculation engine can
  // resolve store-level data for each entity.
  if (entityIdField) {
    const STORE_FIELDS = ['storeId', 'num_tienda', 'No_Tienda', 'Tienda'];
    const TIER_FIELDS = ['store_volume_tier', 'Rango_Tienda', 'Rango de Tienda'];
    const VOLUME_KEY_FIELDS = ['LLave Tamaño de Tienda'];

    // Build employee→store mapping from imported data
    const empToStore = new Map<string, string>();
    const empToTier = new Map<string, string>();
    const empToVolumeKey = new Map<string, string>();

    for (const row of unit.rawData) {
      const empId = String(row[entityIdField] ?? '').trim();
      if (!empId) continue;

      if (!empToStore.has(empId)) {
        for (const f of STORE_FIELDS) {
          const val = row[f];
          if (val != null && String(val).trim()) {
            empToStore.set(empId, String(val).trim());
            break;
          }
        }
      }

      if (!empToTier.has(empId)) {
        for (const f of TIER_FIELDS) {
          const val = row[f];
          if (val != null && String(val).trim()) {
            empToTier.set(empId, String(val).trim());
            break;
          }
        }
      }

      if (!empToVolumeKey.has(empId)) {
        for (const f of VOLUME_KEY_FIELDS) {
          const val = row[f];
          if (val != null && String(val).trim()) {
            empToVolumeKey.set(empId, String(val).trim());
            break;
          }
        }
      }
    }

    if (empToStore.size > 0) {
      // Fetch entities that need store metadata
      const allEmpIds = Array.from(empToStore.keys());
      let storeUpdated = 0;

      for (let i = 0; i < allEmpIds.length; i += BATCH) {
        const slice = allEmpIds.slice(i, i + BATCH);
        const { data: ents } = await supabase
          .from('entities')
          .select('id, external_id, metadata')
          .eq('tenant_id', tenantId)
          .in('external_id', slice);

        if (!ents) continue;

        for (const ent of ents) {
          const extId = ent.external_id ?? '';
          const store = empToStore.get(extId);
          if (!store) continue;

          const existingMeta = (ent.metadata ?? {}) as Record<string, unknown>;
          if (existingMeta.store_id === store) continue;

          const newMeta: Record<string, unknown> = {
            ...existingMeta,
            store_id: store,
          };

          const tier = empToTier.get(extId);
          if (tier) newMeta.volume_tier = tier;

          const volKey = empToVolumeKey.get(extId);
          if (volKey) newMeta.volume_key = volKey;

          await supabase
            .from('entities')
            .update({ metadata: newMeta })
            .eq('id', ent.id)
            .eq('tenant_id', tenantId);
          storeUpdated++;
        }
      }

      if (storeUpdated > 0) {
        console.log(`[SCI Execute] OB-146: Updated store metadata for ${storeUpdated} entities (${empToStore.size} mapped)`);
      }
    }
  }

  // OB-153: Period binding removed from import (Decision 92)
  // Engine uses source_date range at calculation time, not period_id FK
}
