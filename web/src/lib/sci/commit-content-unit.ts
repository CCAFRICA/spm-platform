// HF-231: Unified Import Pipeline — single committed_data write site.
//
// Predecessors closed partial unification:
//   HF-184 (PR #331) — partial committed_data unification.
//   HF-194 (PR #370) — partial field_identities alignment.
//   DIAG-022           — PARALLEL_SPECIALIZED verdict.
// AP-17 (parallel metadata construction in import pipelines) recurred four
// times under those partial fixes. HF-231 closes it permanently: every
// committed_data write originating from the SCI import surface flows
// through this one function.
//
// Eight inline write sites collapse into this one function:
//   execute-bulk/route.ts: processEntityUnit + processDataUnit (target/transaction) + processReferenceUnit
//   execute/route.ts:      executeEntityPipeline + executeTargetPipeline + executeTransactionPipeline + executeReferencePipeline
//
// Side effects NOT owned by commitContentUnit (preserved at caller level):
//   • Entity creation in `entities` table (execute-bulk's processEntityUnit
//     creates entities BEFORE committed_data writes — out of scope here).
//   • Plan interpretation AI call (executePlanPipeline does not write
//     committed_data directly — out of scope here).
//   • postCommitConstruction (executeTargetPipeline + executeTransactionPipeline).
//   • input_bindings invalidation (Layer 4 cache clear — caller decides
//     timing, since some callers batch this across multiple units).
//
// Decision 108 (HC Override Authority, LOCKED 2026-03-07) is enforced by
// the entity_id_field resolution order: HC `identifier` role at >= 0.80
// confidence is consulted FIRST; confirmedBindings `entity_identifier`
// role is the structural fallback.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
import type {
  AgentType,
  SemanticBinding,
  FieldIdentity,
} from './sci-types';
import {
  extractSourceDate,
  findDateColumnFromBindings,
  buildSemanticRolesMap,
  detectPeriodMarkerColumns,
} from './source-date-extraction';
import { buildFieldIdentitiesFromBindings } from './field-identities';
import { resolveDataTypeFromClassification } from './data-type-resolver';
import { computeContentUnitHashSha256 } from './content-unit-hash';
import { supersedePriorBatchOnContentMatch } from './import-batch-supersession';
import { extractFieldIdentitiesFromTrace } from './header-comprehension';

// ============================================================
// PUBLIC SHAPE — minimal common surface both callers can satisfy
// ============================================================

// Minimal common shape between BulkContentUnit (execute-bulk) and
// ContentUnitExecution (execute). Both carry contentUnitId + bindings;
// only the execute path threads classificationTrace through.
export interface CommitContentUnitInput {
  contentUnitId: string;
  confirmedBindings: SemanticBinding[];
  classificationTrace?: Record<string, unknown>;
}

// `source` drives the operational profile per route:
//   sci-bulk  → 2000-row chunks + 3-retry-with-backoff per chunk
//                (OB-174 Phase 5 / DS-016 §3.4 nanobatch contract)
//   sci       → 5000-row chunks + no retry (existing execute behavior)
// Both label metadata.source identically to the existing inline writers.
export type CommitContentUnitSource = 'sci' | 'sci-bulk';

export interface CommitContentUnitParams {
  unit: CommitContentUnitInput;
  rows: Record<string, unknown>[];
  classification: Exclude<AgentType, 'plan'>; // plan does not write committed_data
  tenantId: string;
  proposalId: string;
  tabName: string;
  fileName: string;
  source: CommitContentUnitSource;
  fileHashSha256: string;
}

export interface CommitContentUnitResult {
  batchId: string;
  totalInserted: number;
  dataType: string;
  entityIdField: string | null;
  fieldIdentities: Record<string, FieldIdentity>;
  earliestDate: string | null;
  latestDate: string | null;
  dateCount: number;
  success: boolean;
  error?: string;
}

// ============================================================
// HC-FIRST ENTITY_ID_FIELD RESOLUTION (Decision 108)
// ============================================================

// Identifier role threshold for HC override (mirrors HC_ROLE_THRESHOLD in
// hc-pattern-classifier.ts). Below this, fall back to the structural binding.
const HC_IDENTIFIER_THRESHOLD = 0.80;

function resolveEntityIdField(
  bindings: SemanticBinding[],
  classificationTrace: Record<string, unknown> | undefined,
): string | null {
  // Layer 1 — HC identifier role at >= 0.80 (Decision 108 override authority).
  if (classificationTrace) {
    const hcData = classificationTrace.headerComprehension as
      | {
          interpretations?: Record<
            string,
            { columnRole?: string; confidence?: number }
          >;
        }
      | undefined;
    const interpretations = hcData?.interpretations;
    if (interpretations) {
      for (const [colName, interp] of Object.entries(interpretations)) {
        if (
          interp.columnRole === 'identifier' &&
          typeof interp.confidence === 'number' &&
          interp.confidence >= HC_IDENTIFIER_THRESHOLD
        ) {
          return colName;
        }
      }
    }
  }

  // Layer 2 — structural fallback: confirmedBindings entity_identifier role.
  const binding = bindings.find(b => b.semanticRole === 'entity_identifier');
  return binding?.sourceField ?? null;
}

// ============================================================
// ROUTE PROFILE — per-source operational parameters
// ============================================================

interface RouteProfile {
  chunkSize: number;
  retryAttempts: number; // 1 means a single attempt; 3 means up to 3 attempts with backoff
}

function profileFor(source: CommitContentUnitSource): RouteProfile {
  // sci-bulk preserves OB-174 Phase 5 nanobatch contract (2000-row chunks,
  // up to 3 retries with linear backoff). sci uses the wider 5000-row
  // chunks with no retry — the existing execute behavior.
  return source === 'sci-bulk'
    ? { chunkSize: 2000, retryAttempts: 3 }
    : { chunkSize: 5000, retryAttempts: 1 };
}

// ============================================================
// commitContentUnit — sole committed_data write surface
// ============================================================

export async function commitContentUnit(
  supabase: SupabaseClient,
  params: CommitContentUnitParams,
): Promise<CommitContentUnitResult> {
  const {
    unit,
    rows,
    classification,
    tenantId,
    proposalId,
    tabName,
    fileName,
    source,
    fileHashSha256,
  } = params;

  // Empty-rows short-circuit — preserve existing caller contract.
  if (rows.length === 0) {
    return {
      batchId: '',
      totalInserted: 0,
      dataType: resolveDataTypeFromClassification(classification),
      entityIdField: null,
      fieldIdentities: {},
      earliestDate: null,
      latestDate: null,
      dateCount: 0,
      success: true,
    };
  }

  const profile = profileFor(source);

  // HF-196 Phase 1D — data_type derives from SCI classification (Decisions 154/155).
  const dataType = resolveDataTypeFromClassification(classification);

  // HF-213 — content_unit_hash_sha256 is the supersession identity primitive.
  const contentUnitHashSha256 = computeContentUnitHashSha256(rows);
  const batchId = crypto.randomUUID();

  await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: fileName,
    file_type: 'sci',
    status: 'processing',
    row_count: rows.length,
    // HF-196 Phase 1F — file-level hash retained for audit (supersedure trigger
    // moved to content_unit_hash_sha256 at HF-213).
    file_hash_sha256: fileHashSha256,
    content_unit_hash_sha256: contentUnitHashSha256,
    metadata: {
      source,
      proposalId,
      contentUnitId: unit.contentUnitId,
      classification,
    } as unknown as Json,
  });

  // HF-213 Rule 30 — supersession on content_unit_hash_sha256 match.
  await supersedePriorBatchOnContentMatch(
    supabase,
    tenantId,
    batchId,
    contentUnitHashSha256,
    rows,
  );

  // Build semantic_roles map from confirmedBindings (single shape across
  // all four classifications).
  const semanticRoles: Record<
    string,
    { role: string; confidence: number; claimedBy: string }
  > = {};
  for (const binding of unit.confirmedBindings) {
    semanticRoles[binding.sourceField] = {
      role: binding.semanticRole,
      confidence: binding.confidence,
      claimedBy: binding.claimedBy,
    };
  }

  // HF-110 — field_identities: HC trace primary, confirmedBindings fallback (DS-009 1.3).
  const fieldIdentities =
    extractFieldIdentitiesFromTrace(unit.classificationTrace) ??
    buildFieldIdentitiesFromBindings(unit.confirmedBindings);

  // Decision 108 — HC `identifier` role @ >= 0.80 overrides structural binding.
  const entityIdField = resolveEntityIdField(
    unit.confirmedBindings,
    unit.classificationTrace,
  );

  // OB-152/OB-157 — source_date extraction with period marker composition.
  const dateColumnHint = findDateColumnFromBindings(unit.confirmedBindings);
  const semanticRolesMap = buildSemanticRolesMap(unit.confirmedBindings);
  const periodMarkerHint = detectPeriodMarkerColumns(rows);

  // Build committed_data rows. entity_id and period_id are always NULL at
  // import — engine binds them at calc time (OB-182, Decision 92).
  let earliestDate: string | null = null;
  let latestDate: string | null = null;
  let dateCount = 0;

  const insertRows = rows.map((row, i) => {
    const sourceDate = extractSourceDate(
      row,
      dateColumnHint,
      semanticRolesMap,
      periodMarkerHint,
    );
    if (sourceDate) {
      dateCount++;
      if (!earliestDate || sourceDate < earliestDate) earliestDate = sourceDate;
      if (!latestDate || sourceDate > latestDate) latestDate = sourceDate;
    }

    return {
      tenant_id: tenantId,
      import_batch_id: batchId,
      entity_id: null as string | null,
      period_id: null as string | null,
      source_date: sourceDate,
      data_type: dataType,
      row_data: { ...row, _sheetName: tabName, _rowIndex: i },
      metadata: {
        source,
        proposalId,
        semantic_roles: semanticRoles,
        resolved_data_type: dataType,
        entity_id_field: entityIdField,
        informational_label: classification,
        field_identities: fieldIdentities,
      },
    };
  });

  // Chunked insert — per-source profile (sci-bulk retries; sci does not).
  let totalInserted = 0;
  let firstError: string | undefined;
  const totalChunks = Math.ceil(insertRows.length / profile.chunkSize);
  let chunksCompleted = 0;

  for (let i = 0; i < insertRows.length; i += profile.chunkSize) {
    const slice = insertRows.slice(i, i + profile.chunkSize);
    let chunkSuccess = false;
    let lastErr = '';

    for (let attempt = 0; attempt < profile.retryAttempts && !chunkSuccess; attempt++) {
      const { error: insertErr } = await supabase
        .from('committed_data')
        .insert(slice as unknown as Json[]);
      if (insertErr) {
        lastErr = insertErr.message;
        if (profile.retryAttempts > 1 && attempt < profile.retryAttempts - 1) {
          // Linear backoff between retries — preserves sci-bulk behavior.
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
      } else {
        chunkSuccess = true;
      }
    }

    if (chunkSuccess) {
      totalInserted += slice.length;
      chunksCompleted++;
    } else {
      // First chunk failure is fatal for the sci (no-retry) profile and gets
      // recorded for sci-bulk callers that decide to surface partial failure.
      if (!firstError) firstError = lastErr;
      console.error(
        `[commitContentUnit] Chunk ${chunksCompleted + 1}/${totalChunks} failed: ${lastErr}`,
      );
      if (profile.retryAttempts === 1) {
        // sci behavior: mark batch failed and short-circuit.
        await supabase
          .from('import_batches')
          .update({
            status: 'failed',
            error_summary: { error: lastErr } as unknown as Json,
          })
          .eq('id', batchId);
        return {
          batchId,
          totalInserted,
          dataType,
          entityIdField,
          fieldIdentities,
          earliestDate,
          latestDate,
          dateCount,
          success: false,
          error: lastErr,
        };
      }
      // sci-bulk behavior: continue with next chunk (preserve prior chunks).
    }
  }

  // Finalize batch.
  await supabase
    .from('import_batches')
    .update({
      status: 'completed',
      row_count: totalInserted,
    })
    .eq('id', batchId);

  console.log(
    `[commitContentUnit] ${classification} (${source}): ${totalInserted} rows committed, ` +
      `data_type=${dataType}, entity_id_field="${entityIdField ?? 'none'}", ` +
      `source_dates=${dateCount}/${rows.length} (${earliestDate}..${latestDate})`,
  );

  return {
    batchId,
    totalInserted,
    dataType,
    entityIdField,
    fieldIdentities,
    earliestDate,
    latestDate,
    dateCount,
    success: true,
    error: firstError,
  };
}
