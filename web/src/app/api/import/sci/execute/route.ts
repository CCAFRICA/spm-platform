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
import { convergeBindings } from '@/lib/intelligence/convergence-service';
import { resolveEntitiesFromCommittedData } from '@/lib/sci/entity-resolution';
import { writeClassificationSignal, aggregateToFoundational, aggregateToDomain } from '@/lib/sci/classification-signal-service';
import { writeFingerprint } from '@/lib/sci/fingerprint-flywheel';
import { computeFingerprintHashSync } from '@/lib/sci/structural-fingerprint';
import type { StructuralFingerprint, ClassificationSignalPayload } from '@/lib/sci/classification-signal-service';
import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
import type { Json } from '@/lib/supabase/database.types';
import type {
  SCIExecutionRequest,
  SCIExecutionResult,
  ContentUnitResult,
  ContentUnitExecution,
} from '@/lib/sci/sci-types';
import {
  extractSourceDate,
  findDateColumnFromBindings,
  buildSemanticRolesMap,
  detectPeriodMarkerColumns,
} from '@/lib/sci/source-date-extraction';
import { extractFieldIdentitiesFromTrace } from '@/lib/sci/header-comprehension';
import type { SemanticBinding } from '@/lib/sci/sci-types';
import type { ColumnRole, FieldIdentity } from '@/lib/sci/sci-types';

// HF-110: Build field_identities from confirmedBindings when HC trace is unavailable (DS-009 1.3)
// Maps SemanticRole → ColumnRole + contextualIdentity — guaranteed write, never null
function buildFieldIdentitiesFromBindings(
  bindings: SemanticBinding[],
): Record<string, FieldIdentity> {
  const ROLE_MAP: Record<string, { structuralType: ColumnRole; contextualIdentity: string }> = {
    entity_identifier: { structuralType: 'identifier', contextualIdentity: 'person_identifier' },
    entity_name: { structuralType: 'name', contextualIdentity: 'person_name' },
    entity_attribute: { structuralType: 'attribute', contextualIdentity: 'entity_attribute' },
    entity_relationship: { structuralType: 'attribute', contextualIdentity: 'entity_relationship' },
    entity_license: { structuralType: 'attribute', contextualIdentity: 'entity_license' },
    performance_target: { structuralType: 'measure', contextualIdentity: 'performance_target' },
    baseline_value: { structuralType: 'measure', contextualIdentity: 'baseline_value' },
    transaction_amount: { structuralType: 'measure', contextualIdentity: 'currency_amount' },
    transaction_count: { structuralType: 'measure', contextualIdentity: 'count' },
    transaction_date: { structuralType: 'temporal', contextualIdentity: 'date' },
    transaction_identifier: { structuralType: 'identifier', contextualIdentity: 'transaction_identifier' },
    period_marker: { structuralType: 'temporal', contextualIdentity: 'period' },
    category_code: { structuralType: 'attribute', contextualIdentity: 'category' },
    rate_value: { structuralType: 'measure', contextualIdentity: 'percentage' },
    tier_boundary: { structuralType: 'measure', contextualIdentity: 'threshold' },
    payout_amount: { structuralType: 'measure', contextualIdentity: 'currency_amount' },
    descriptive_label: { structuralType: 'attribute', contextualIdentity: 'label' },
  };

  const identities: Record<string, FieldIdentity> = {};
  for (const binding of bindings) {
    const mapped = ROLE_MAP[binding.semanticRole];
    if (mapped) {
      identities[binding.sourceField] = {
        structuralType: mapped.structuralType,
        contextualIdentity: mapped.contextualIdentity,
        confidence: binding.confidence,
      };
    } else {
      identities[binding.sourceField] = {
        structuralType: 'unknown',
        contextualIdentity: binding.semanticRole || 'unknown',
        confidence: binding.confidence,
      };
    }
  }
  return identities;
}

// Generic role detection targets (AP-5/AP-6: no hardcoded language-specific names)

// Normalize filename to semantic data_type (same logic as import/commit)
function normalizeFileNameToDataType(fn: string): string {
  let stem = fn.replace(/\.[^.]+$/, '');
  stem = stem.replace(/^[A-Z]{2,5}_/, '');
  stem = stem.replace(/_?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{4}$/i, '');
  stem = stem.replace(/_?Q[1-4]_?\d{4}$/i, '');
  stem = stem.replace(/_?\d{4}[-_]\d{2}$/i, '');
  stem = stem.replace(/_?\d{4}$/i, '');
  stem = stem.replace(/_+$/, '');
  return stem.toLowerCase().replace(/[\s-]+/g, '_');
}

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
        const result = await executeContentUnit(supabase, tenantId, proposalId, unit, profileId, storagePath);
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

    // OB-160G: Run convergence ONCE after all pipelines complete (not per-pipeline)
    // Collects convergence report for the execute response
    let convergenceReport: SCIExecutionResult['convergence'] | undefined;
    try {
      const { data: allRuleSets } = await supabase
        .from('rule_sets')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .in('status', ['active', 'draft']);

      if (allRuleSets && allRuleSets.length > 0) {
        const reports: NonNullable<SCIExecutionResult['convergence']>['reports'] = [];
        let totalDerivations = 0;

        for (const rs of allRuleSets) {
          const result = await convergeBindings(tenantId, rs.id, supabase);

          if (result.derivations.length > 0 || Object.keys(result.componentBindings).length > 0) {
            // HF-108: convergence_bindings is the PRIMARY output (Decision 111)
            // metric_derivations preserved as read-only fallback for pre-OB-162 data
            // but no longer written for new convergence runs when convergence_bindings exist
            const updatedBindings: Record<string, unknown> = {};

            if (Object.keys(result.componentBindings).length > 0) {
              // HF-109: convergence_bindings is THE sole output (DS-009 4.3)
              // metric_derivations NOT written — single format, no dual write
              updatedBindings.convergence_bindings = result.componentBindings;
            } else {
              // No convergence_bindings produced — write metric_derivations as primary
              // (legacy path for data without field identities)
              const { data: rsData } = await supabase
                .from('rule_sets')
                .select('input_bindings')
                .eq('id', rs.id)
                .single();

              const existing = ((rsData?.input_bindings as Record<string, unknown>)?.metric_derivations ?? []) as Array<Record<string, unknown>>;
              const merged = [...existing];

              for (const d of result.derivations) {
                if (!merged.some(e => e.metric === d.metric)) {
                  merged.push(d as unknown as Record<string, unknown>);
                }
              }
              updatedBindings.metric_derivations = merged;
            }

            // Preserve existing metric_mappings if present
            const { data: currentRs } = await supabase
              .from('rule_sets')
              .select('input_bindings')
              .eq('id', rs.id)
              .single();
            const currentBindings = (currentRs?.input_bindings as Record<string, unknown>) ?? {};
            if (currentBindings.metric_mappings) {
              updatedBindings.metric_mappings = currentBindings.metric_mappings;
            }
            // Decision 147: Preserve plan_agent_seeds across convergence updates
            if (currentBindings.plan_agent_seeds) {
              updatedBindings.plan_agent_seeds = currentBindings.plan_agent_seeds;
            }

            await supabase
              .from('rule_sets')
              .update({ input_bindings: updatedBindings as unknown as Json })
              .eq('id', rs.id);

            totalDerivations += result.derivations.length;
          }

          reports.push({
            ruleSetId: rs.id,
            ruleSetName: rs.name,
            derivations: result.derivations.length,
            matches: result.matchReport,
            gaps: result.gaps.map(g => ({
              component: g.component,
              reason: g.reason,
              resolution: g.resolution,
              referenceDataAvailable: g.referenceDataAvailable,
            })),
          });
        }

        convergenceReport = {
          ruleSetsProcessed: allRuleSets.length,
          totalDerivations,
          reports,
        };
        console.log(`[SCI Execute] OB-160G: Convergence complete — ${totalDerivations} derivations across ${allRuleSets.length} rule sets`);
      }
    } catch (convErr) {
      console.error('[SCI Execute] Post-execute convergence failed (non-blocking):', convErr);
    }

    // HF-109: Post-import entity resolution (DS-009 3.3)
    // Scans ALL committed_data for person identifiers, creates entities, backfills entity_id
    try {
      const entityResult = await resolveEntitiesFromCommittedData(supabase, tenantId);
      console.log(`[SCI Execute] HF-109 Entity resolution: ${entityResult.created} created, ${entityResult.linked} rows linked`);
    } catch (entityErr) {
      console.error('[SCI Execute] Post-import entity resolution failed (non-blocking):', entityErr);
    }

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
      convergence: convergenceReport,
    };

    // OB-160E/HF-094: Write classification signals via dedicated columns (fire-and-forget)
    // Single write path: writeClassificationSignal (HF-092 dedicated columns)
    try {
      for (const unit of contentUnits) {
        if (!unit.structuralFingerprint) continue;

        const originalClassification = unit.originalClassification || unit.confirmedClassification;
        const wasOverridden = originalClassification !== unit.confirmedClassification;
        const traceData = unit.classificationTrace as ClassificationTrace | undefined;

        const payload: ClassificationSignalPayload = {
          tenantId,
          sourceFileName: unit.sourceFile || '',
          sheetName: unit.tabName || '',
          fingerprint: unit.structuralFingerprint as unknown as StructuralFingerprint,
          classification: unit.confirmedClassification,
          confidence: wasOverridden ? 1.0 : (unit.originalConfidence || 0),
          decisionSource: wasOverridden ? 'human_override' : (traceData?.decisionSource || 'heuristic'),
          classificationTrace: traceData || {} as ClassificationTrace,
          vocabularyBindings: unit.vocabularyBindings || null,
          agentScores: traceData
            ? Object.fromEntries(traceData.round1.map(s => [s.agent, s.confidence]))
            : {},
          humanCorrectionFrom: wasOverridden ? originalClassification : null,
        };

        writeClassificationSignal(
          payload,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {});

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
        if (unit.confirmedBindings && unit.confirmedBindings.length > 0 && unit.rawData && unit.rawData.length > 0) {
          const cols = Object.keys(unit.rawData[0]);
          const hash = computeFingerprintHashSync(cols, unit.rawData.slice(0, 5));
          const confirmedColumnRoles: Record<string, string> = {};
          for (const binding of unit.confirmedBindings) {
            if (binding.sourceField && binding.semanticRole) {
              confirmedColumnRoles[binding.sourceField] = binding.semanticRole;
            }
          }
          writeFingerprint(
            tenantId,
            hash,
            {
              classification: unit.confirmedClassification,
              confidence: 1.0,
              fieldBindings: unit.confirmedBindings,
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
  storagePath?: string,
): Promise<ContentUnitResult> {
  // OB-134: For PARTIAL claims, filter rawData to only include owned + shared fields
  const effectiveUnit = filterFieldsForPartialClaim(unit);

  switch (effectiveUnit.confirmedClassification) {
    case 'target':
      return executeTargetPipeline(supabase, tenantId, proposalId, effectiveUnit);
    case 'transaction':
      return executeTransactionPipeline(supabase, tenantId, proposalId, effectiveUnit);
    case 'entity':
      return executeEntityPipeline(supabase, tenantId, proposalId, effectiveUnit);
    case 'plan':
      return executePlanPipeline(supabase, tenantId, effectiveUnit, userId, storagePath);
    case 'reference':
      return executeReferencePipeline(supabase, tenantId, proposalId, effectiveUnit, userId);
  }
}

// OB-134: Field filtering for PARTIAL claims
function filterFieldsForPartialClaim(unit: ContentUnitExecution): ContentUnitExecution {
  if (unit.claimType !== 'PARTIAL' || !unit.ownedFields || !unit.sharedFields) {
    return unit; // FULL claim — no filtering
  }

  const allowedFields = new Set([...unit.ownedFields, ...unit.sharedFields]);

  // Filter rawData rows to only include allowed fields
  const filteredRows = unit.rawData.map(row => {
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      if (allowedFields.has(key) || key.startsWith('_')) {
        // Keep allowed fields + internal metadata keys (_sheetName, _rowIndex)
        filtered[key] = row[key];
      }
    }
    return filtered;
  });

  // Filter bindings to only allowed fields
  const filteredBindings = unit.confirmedBindings.filter(
    b => allowedFields.has(b.sourceField)
  );

  return {
    ...unit,
    rawData: filteredRows,
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

  // Create import batch
  const batchId = crypto.randomUUID();
  await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: `sci-execute-${proposalId}`,
    file_type: 'sci',
    status: 'processing',
    row_count: rows.length,
    metadata: { source: 'sci', proposalId, contentUnitId: unit.contentUnitId } as unknown as Json,
  });

  // Resolve data_type from contentUnitId (format: fileName::tabName::tabIndex)
  const parts = unit.contentUnitId.split('::');
  const fileName = parts[0] || 'unknown';
  const tabName = parts[1] || 'Sheet1';
  const normalized = normalizeFileNameToDataType(fileName);
  const isGenericTab = tabName === 'Sheet1' || tabName === 'Hoja1';
  const dataType = !isGenericTab && normalized.length > 2
    ? `${normalized}__${tabName.toLowerCase().replace(/[\s\-]+/g, '_')}`
    : normalized || tabName.toLowerCase().replace(/[\s\-]+/g, '_');

  // Build semantic_roles map from bindings
  const semanticRoles: Record<string, { role: string; confidence: number; claimedBy: string }> = {};
  for (const binding of unit.confirmedBindings) {
    semanticRoles[binding.sourceField] = {
      role: binding.semanticRole,
      confidence: binding.confidence,
      claimedBy: binding.claimedBy,
    };
  }

  // HF-110: Extract field identities — HC trace primary, confirmedBindings fallback (DS-009 1.3)
  const tgtFieldIdentities = extractFieldIdentitiesFromTrace(
    unit.classificationTrace as Record<string, unknown> | undefined
  ) || buildFieldIdentitiesFromBindings(unit.confirmedBindings);

  // OB-152: Extract source_date using structural heuristics (Korean Test: zero field names)
  const dateColumnHint = findDateColumnFromBindings(unit.confirmedBindings);
  const semanticRolesMap = buildSemanticRolesMap(unit.confirmedBindings);
  // OB-157: Detect period marker columns (year + month) for composition
  const periodMarkerHint = detectPeriodMarkerColumns(rows);

  // Build committed_data rows with source_date (OB-152)
  // HF-109: entity_id set to null — backfilled post-import by resolveEntitiesFromCommittedData (DS-009 3.3)
  let earliestDate: string | null = null;
  let latestDate: string | null = null;
  let dateCount = 0;

  const insertRows = rows.map((row, i) => {
    // OB-152/OB-157: Extract source_date per row (with period marker composition)
    const sourceDate = extractSourceDate(row, dateColumnHint, semanticRolesMap, periodMarkerHint);
    if (sourceDate) {
      dateCount++;
      if (!earliestDate || sourceDate < earliestDate) earliestDate = sourceDate;
      if (!latestDate || sourceDate > latestDate) latestDate = sourceDate;
    }

    return {
      tenant_id: tenantId,
      import_batch_id: batchId,
      entity_id: null as string | null,
      period_id: null,
      source_date: sourceDate,
      data_type: dataType,
      row_data: { ...row, _sheetName: tabName, _rowIndex: i },
      metadata: {
        source: 'sci',
        proposalId,
        semantic_roles: semanticRoles,
        resolved_data_type: dataType,
        // OB-162: Field identities from HC (Decision 111)
        field_identities: tgtFieldIdentities,
        informational_label: 'target',
      },
    };
  });

  // Bulk insert in 5000-row chunks
  const CHUNK = 5000;
  let totalInserted = 0;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const slice = insertRows.slice(i, i + CHUNK);
    const { error: insertErr } = await supabase
      .from('committed_data')
      .insert(slice);

    if (insertErr) {
      console.error('[SCI Execute] Target insert failed:', insertErr);
      await supabase.from('import_batches').update({
        status: 'failed',
        error_summary: { error: insertErr.message } as unknown as Json,
      }).eq('id', batchId);

      return {
        contentUnitId: unit.contentUnitId,
        classification: 'target',
        success: false,
        rowsProcessed: totalInserted,
        pipeline: 'target',
        error: insertErr.message,
      };
    }
    totalInserted += slice.length;
  }

  // Update batch status
  await supabase.from('import_batches').update({
    status: 'completed',
    row_count: totalInserted,
  }).eq('id', batchId);

  console.log(`[SCI Execute] Target: ${totalInserted} rows committed, data_type=${dataType}, source_dates=${dateCount}/${rows.length} (${earliestDate}..${latestDate})`);

  // OB-153: Period creation removed from import (Decision 92 — periods created at calculate time)
  // OB-144: Post-commit construction — create assignments, bind entity_id, store metadata
  const tgtEntityIdField = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier')?.sourceField;
  await postCommitConstruction(supabase, tenantId, batchId, tgtEntityIdField, unit);

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

  const batchId = crypto.randomUUID();
  await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: `sci-execute-${proposalId}`,
    file_type: 'sci',
    status: 'processing',
    row_count: rows.length,
    metadata: { source: 'sci', proposalId, contentUnitId: unit.contentUnitId } as unknown as Json,
  });

  // Resolve data_type
  const parts = unit.contentUnitId.split('::');
  const fileName = parts[0] || 'unknown';
  const tabName = parts[1] || 'Sheet1';
  const normalized = normalizeFileNameToDataType(fileName);
  const dataType = normalized.length > 2 ? normalized : tabName.toLowerCase().replace(/[\s\-]+/g, '_');

  // Build semantic_roles map from bindings (same as target pipeline)
  const semanticRoles: Record<string, { role: string; confidence: number; claimedBy: string }> = {};
  for (const binding of unit.confirmedBindings) {
    semanticRoles[binding.sourceField] = {
      role: binding.semanticRole,
      confidence: binding.confidence,
      claimedBy: binding.claimedBy,
    };
  }

  // HF-110: Extract field identities — HC trace primary, confirmedBindings fallback (DS-009 1.3)
  const txnFieldIdentities = extractFieldIdentitiesFromTrace(
    unit.classificationTrace as Record<string, unknown> | undefined
  ) || buildFieldIdentitiesFromBindings(unit.confirmedBindings);

  // OB-152: Extract source_date using structural heuristics
  const txnDateHint = findDateColumnFromBindings(unit.confirmedBindings);
  const txnSemanticMap = buildSemanticRolesMap(unit.confirmedBindings);
  // OB-157: Detect period marker columns (year + month) for composition
  const txnPeriodHint = detectPeriodMarkerColumns(rows);

  let txnEarliest: string | null = null;
  let txnLatest: string | null = null;
  let txnDateCount = 0;

  // Build insert rows with source_date (OB-152)
  // HF-109: entity_id set to null — backfilled post-import by resolveEntitiesFromCommittedData (DS-009 3.3)
  const insertRows = rows.map((row, i) => {
    // OB-152/OB-157: Extract source_date per row (with period marker composition)
    const sourceDate = extractSourceDate(row, txnDateHint, txnSemanticMap, txnPeriodHint);
    if (sourceDate) {
      txnDateCount++;
      if (!txnEarliest || sourceDate < txnEarliest) txnEarliest = sourceDate;
      if (!txnLatest || sourceDate > txnLatest) txnLatest = sourceDate;
    }

    return {
      tenant_id: tenantId,
      import_batch_id: batchId,
      entity_id: null as string | null,
      period_id: null,
      source_date: sourceDate,
      data_type: dataType,
      row_data: { ...row, _sheetName: tabName, _rowIndex: i },
      metadata: {
        source: 'sci',
        proposalId,
        semantic_roles: semanticRoles,
        resolved_data_type: dataType,
        // OB-162: Field identities from HC (Decision 111)
        field_identities: txnFieldIdentities,
        informational_label: 'transaction',
      },
    };
  });

  const CHUNK = 5000;
  let totalInserted = 0;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const slice = insertRows.slice(i, i + CHUNK);
    const { error: insertErr } = await supabase
      .from('committed_data')
      .insert(slice);

    if (insertErr) {
      console.error('[SCI Execute] Transaction insert failed:', insertErr);
      return {
        contentUnitId: unit.contentUnitId,
        classification: 'transaction',
        success: false,
        rowsProcessed: totalInserted,
        pipeline: 'transaction',
        error: insertErr.message,
      };
    }
    totalInserted += slice.length;
  }

  await supabase.from('import_batches').update({
    status: 'completed',
    row_count: totalInserted,
  }).eq('id', batchId);

  console.log(`[SCI Execute] Transaction: ${totalInserted} rows committed, data_type=${dataType}, source_dates=${txnDateCount}/${rows.length} (${txnEarliest}..${txnLatest})`);

  // OB-153: Period creation removed from import (Decision 92 — periods created at calculate time)
  // OB-144: Post-commit construction — create assignments, bind entity_id, store metadata
  const txnEntityIdField = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier')?.sourceField;
  await postCommitConstruction(supabase, tenantId, batchId, txnEntityIdField, unit);

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

  // Create import batch for entity data
  const batchId = crypto.randomUUID();
  await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: `sci-execute-${proposalId}`,
    file_type: 'sci',
    status: 'processing',
    row_count: rows.length,
    metadata: { source: 'sci', proposalId, contentUnitId: unit.contentUnitId } as unknown as Json,
  });

  // Resolve data_type from contentUnitId
  const parts = unit.contentUnitId.split('::');
  const fileName = parts[0] || 'unknown';
  const tabName = parts[1] || 'Sheet1';
  const normalized = normalizeFileNameToDataType(fileName);
  const isGenericTab = tabName === 'Sheet1' || tabName === 'Hoja1';
  const dataType = !isGenericTab && normalized.length > 2
    ? `${normalized}__${tabName.toLowerCase().replace(/[\s\-]+/g, '_')}`
    : normalized || tabName.toLowerCase().replace(/[\s\-]+/g, '_');

  // Build semantic_roles map from bindings
  const semanticRoles: Record<string, { role: string; confidence: number; claimedBy: string }> = {};
  for (const binding of unit.confirmedBindings) {
    semanticRoles[binding.sourceField] = {
      role: binding.semanticRole,
      confidence: binding.confidence,
      claimedBy: binding.claimedBy,
    };
  }

  // HF-110: Extract field identities — HC trace primary, confirmedBindings fallback (DS-009 1.3)
  const entityFieldIdentities = extractFieldIdentitiesFromTrace(
    unit.classificationTrace as Record<string, unknown> | undefined
  ) || buildFieldIdentitiesFromBindings(unit.confirmedBindings);

  // HF-184: Unified committed_data writes — same extraction as target/transaction pipelines.
  // Classification is a hint, not a gate. All pipelines carry source_date + entity_id_field.
  const entityIdBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
  const entityIdField = entityIdBinding?.sourceField;
  const dateColumnHint = findDateColumnFromBindings(unit.confirmedBindings);
  const semanticRolesMap = buildSemanticRolesMap(unit.confirmedBindings);
  const periodMarkerHint = detectPeriodMarkerColumns(rows);

  // HF-109: Write ALL entity rows to committed_data ONLY (DS-009 3.3)
  // Entity creation + entity_id backfill handled post-import by resolveEntitiesFromCommittedData
  const insertRows = rows.map((row, i) => ({
    tenant_id: tenantId,
    import_batch_id: batchId,
    entity_id: null as string | null,
    period_id: null as string | null,
    source_date: extractSourceDate(row, dateColumnHint, semanticRolesMap, periodMarkerHint),
    data_type: dataType,
    row_data: { ...row, _sheetName: tabName, _rowIndex: i },
    metadata: {
      source: 'sci',
      proposalId,
      semantic_roles: semanticRoles,
      resolved_data_type: dataType,
      field_identities: entityFieldIdentities,
      informational_label: 'entity',
      entity_id_field: entityIdField || null,
    },
  }));

  const CHUNK = 5000;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const slice = insertRows.slice(i, i + CHUNK);
    const { error: insertErr } = await supabase
      .from('committed_data')
      .insert(slice);

    if (insertErr) {
      console.error('[SCI Execute] Entity→committed_data insert failed:', insertErr);
      await supabase.from('import_batches').update({
        status: 'failed',
        error_summary: { error: insertErr.message } as unknown as Json,
      }).eq('id', batchId);
      return {
        contentUnitId: unit.contentUnitId,
        classification: 'entity' as const,
        success: false,
        rowsProcessed: 0,
        pipeline: 'entity',
        error: insertErr.message,
      };
    }
  }

  console.log(`[SCI Execute] HF-109: Entity data written to committed_data (${rows.length} rows, batch ${batchId})`);

  // Mark import batch complete
  await supabase.from('import_batches').update({
    status: 'completed',
  }).eq('id', batchId);

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'entity',
    success: true,
    rowsProcessed: rows.length,
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

  // Create import batch
  const batchId = crypto.randomUUID();
  await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: `sci-execute-${proposalId}`,
    file_type: 'sci',
    status: 'processing',
    row_count: rows.length,
    metadata: { source: 'sci', proposalId, contentUnitId: unit.contentUnitId, classification: 'reference' } as unknown as Json,
  });

  // Resolve data_type from contentUnitId (same as transaction/target pipelines)
  const parts = unit.contentUnitId.split('::');
  const fileName = parts[0] || 'unknown';
  const tabName = parts[1] || 'Sheet1';
  const normalized = normalizeFileNameToDataType(fileName);
  const isGenericTab = tabName === 'Sheet1' || tabName === 'Hoja1';
  const dataType = !isGenericTab && normalized.length > 2
    ? `${normalized}__${tabName.toLowerCase().replace(/[\s\-]+/g, '_')}`
    : normalized || tabName.toLowerCase().replace(/[\s\-]+/g, '_');

  // Build semantic_roles map from bindings
  const semanticRoles: Record<string, { role: string; confidence: number; claimedBy: string }> = {};
  for (const binding of unit.confirmedBindings) {
    semanticRoles[binding.sourceField] = {
      role: binding.semanticRole,
      confidence: binding.confidence,
      claimedBy: binding.claimedBy,
    };
  }

  // HF-110: Extract field identities — HC trace primary, confirmedBindings fallback (DS-009 1.3)
  const refFieldIdentities = extractFieldIdentitiesFromTrace(
    unit.classificationTrace as Record<string, unknown> | undefined
  ) || buildFieldIdentitiesFromBindings(unit.confirmedBindings);

  // HF-184: Unified committed_data writes — same extraction as target/transaction pipelines.
  // Classification is a hint, not a gate. All pipelines carry source_date + entity_id_field.
  const refEntityIdBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
  const refEntityIdField = refEntityIdBinding?.sourceField;
  const refDateHint = findDateColumnFromBindings(unit.confirmedBindings);
  const refSemanticMap = buildSemanticRolesMap(unit.confirmedBindings);
  const refPeriodHint = detectPeriodMarkerColumns(rows);

  // OB-162: Decision 111 — store ALL data in committed_data with field_identities
  // No writes to reference_data or reference_items tables
  const insertRows = rows.map((row, i) => ({
    tenant_id: tenantId,
    import_batch_id: batchId,
    entity_id: null as string | null,
    period_id: null as string | null,
    source_date: extractSourceDate(row, refDateHint, refSemanticMap, refPeriodHint),
    data_type: dataType,
    row_data: { ...row, _sheetName: tabName, _rowIndex: i },
    metadata: {
      source: 'sci',
      proposalId,
      semantic_roles: semanticRoles,
      resolved_data_type: dataType,
      field_identities: refFieldIdentities,
      informational_label: 'reference',
      entity_id_field: refEntityIdField || null,
    },
  }));

  // Bulk insert in 5000-row chunks
  const CHUNK = 5000;
  let totalInserted = 0;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const slice = insertRows.slice(i, i + CHUNK);
    const { error: insertErr } = await supabase
      .from('committed_data')
      .insert(slice);

    if (insertErr) {
      console.error('[SCI Execute] Reference→committed_data insert failed:', insertErr);
      await supabase.from('import_batches').update({
        status: 'failed',
        error_summary: { error: insertErr.message } as unknown as Json,
      }).eq('id', batchId);

      return {
        contentUnitId: unit.contentUnitId,
        classification: 'reference',
        success: false,
        rowsProcessed: totalInserted,
        pipeline: 'reference',
        error: insertErr.message,
      };
    }
    totalInserted += slice.length;
  }

  // Update batch status
  await supabase.from('import_batches').update({
    status: 'completed',
    row_count: totalInserted,
  }).eq('id', batchId);

  console.log(`[SCI Execute] Reference (Decision 111): ${totalInserted} rows → committed_data, data_type=${dataType}`);

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
