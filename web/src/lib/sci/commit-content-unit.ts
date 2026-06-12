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

// Role-confidence threshold for HC override (mirrors HC_ROLE_THRESHOLD in
// hc-pattern-classifier.ts). Below this, fall back to the structural binding.
const HC_IDENTIFIER_THRESHOLD = 0.80;

// HF-233: Classification-aware entity_id_field resolution.
//
// The semantic relationship between HC column roles and entity association
// depends on the file's classification:
//
//   classification  identifier role means      reference_key role means       entity_id_field is
//   --------------  ------------------------   ----------------------------   ------------------
//   entity          this row IS the entity     n/a (or org hierarchy ref)     identifier
//   target          this row is ABOUT entity   n/a                            identifier
//   transaction     this row's own event ID    this row BELONGS TO entity     reference_key
//   reference       dimensional lookup key     n/a                            null
//
// HF-231 collapsed all 8 import write paths through commitContentUnit but
// hardcoded `columnRole === 'identifier'` in resolveEntityIdField. Sales
// files (`transaction_id:identifier@0.95` + `sales_rep_id:reference_key@0.95`)
// resolved entity_id_field to `transaction_id`, causing post-import Entity
// Resolution to create 389 ghost entities (one per transaction_id) and the
// engine to fall back to sheet-matching against 421 "entities".
//
// The fix is domain-agnostic: ANY transaction file's entity association is
// its reference_key, by the HC LLM's definition of those roles. Quota /
// roster / capacity tables are unaffected.

function findHcRole(
  classificationTrace: Record<string, unknown> | undefined,
  targetRole: 'identifier' | 'reference_key',
): string | null {
  if (!classificationTrace) return null;
  const hcData = classificationTrace.headerComprehension as
    | {
        interpretations?: Record<
          string,
          { columnRole?: string; confidence?: number }
        >;
      }
    | undefined;
  const interpretations = hcData?.interpretations;
  if (!interpretations) return null;
  for (const [colName, interp] of Object.entries(interpretations)) {
    if (
      interp.columnRole === targetRole &&
      typeof interp.confidence === 'number' &&
      interp.confidence >= HC_IDENTIFIER_THRESHOLD
    ) {
      return colName;
    }
  }
  return null;
}

function resolveEntityIdField(
  bindings: SemanticBinding[],
  classificationTrace: Record<string, unknown> | undefined,
  classification: Exclude<AgentType, 'plan'>,
): string | null {
  // Reference data has no entity association — Decision 111 dimensional
  // lookup semantics. Skip both HC and structural lookups.
  if (classification === 'reference') {
    return null;
  }

  // Transaction files: the entity association is the reference_key (foreign
  // key to the entity the event belongs to), NOT the row's own identifier.
  // Structural fallback still consults confirmedBindings.entity_identifier in
  // case HC didn't assign a reference_key role above threshold.
  if (classification === 'transaction') {
    // HF-268 A2: a transaction's entity association is its reference_key (the foreign key to the
    // entity the event BELONGS TO). The transaction's OWN identifier is the EVENT ID, not an entity.
    // The prior fallback to the entity_identifier binding selected that event ID when the
    // reference_key was absent (e.g. dropped by a flywheel Tier-1 replay), and entity resolution
    // then created phantom entities from transaction IDs (170 from one CRP sales file). When no
    // reference_key is present, leave entity_id_field null — the engine resolves at calc time
    // (Decision 92 / OB-183). NEVER key a transaction's entity on its own identifier (HF-263 lineage).
    return findHcRole(classificationTrace, 'reference_key');
  }

  // Entity and target files: the identifier IS the entity (entity files) or
  // IS ABOUT the entity (target files). Existing HF-231 behavior preserved.
  const hcIdentifier = findHcRole(classificationTrace, 'identifier');
  if (hcIdentifier) return hcIdentifier;
  const binding = bindings.find(b => b.semanticRole === 'entity_identifier');
  return binding?.sourceField ?? null;
}

// ============================================================
// ROUTE PROFILE — per-source operational parameters
// ============================================================

interface RouteProfile {
  chunkSize: number;
  retryAttempts: number; // 1 means a single attempt; 4 means up to 4 attempts with exponential backoff
  pacingMs: number;      // D16: inter-chunk pause to keep instantaneous write load under the instance ceiling
}

function profileFor(source: CommitContentUnitSource): RouteProfile {
  // D16 (run-4 ceiling): the prior 2000-row chunk overran a Small instance's write ceiling on the
  // ~162k-row Ventas sheet (502 at chunk 11/81, both runs). Drop sci-bulk to 500-row chunks with a
  // 200ms inter-chunk pause — 4× smaller, lower instantaneous load. Implication for the big sheet:
  // ~162k rows / 500 = ~325 chunks; at insert (~150ms) + 200ms pace ≈ ~115s for Ventas, comfortably
  // under Vercel's 300s maxDuration. (This is headroom under the instance ceiling — the durable fix is
  // the BL "Loading Dock" queue, off the request lifecycle.) sci keeps the wide no-retry execute path.
  return source === 'sci-bulk'
    ? { chunkSize: 500, retryAttempts: 4, pacingMs: 200 }
    : { chunkSize: 5000, retryAttempts: 1, pacingMs: 0 };
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

  // Decision 108 — HC role @ >= 0.80 overrides structural binding.
  // HF-233 — Classification-aware resolution: transaction reads reference_key,
  // entity/target reads identifier, reference is null.
  const entityIdField = resolveEntityIdField(
    unit.confirmedBindings,
    unit.classificationTrace,
    classification,
  );

  // HF-247 Phase 4: commit-stage type validation. Refuse to write
  // classification-content inconsistent commits. Pre-HF-247 a misclassified
  // plan sheet (rate-table content classified as `entity`) committed rate
  // table rows into the entities table with column titles like
  // "C1: COLOCACIÓN DE CRÉDITO — Ejecutivo Senior" as the entity identifier.
  //
  // Structural heuristic over the resolved entity_id_field column NAME:
  // a real entity identifier column has a stable, short identifier-like
  // name. Plan component names appearing as column headers carry telltale
  // structural prefixes (e.g., "C1:", "C2:"), descriptive content (em-dash
  // separated phrases, all-caps multi-word labels), or length over the
  // typical identifier ceiling. We don't enumerate domain vocabulary —
  // the check fires on STRUCTURAL shape of the column name.
  if (classification === 'entity' && entityIdField) {
    const looksLikeContentTitle =
      entityIdField.length > 40
      || /^[A-Z]\d+\s*[:.]/.test(entityIdField)
      || entityIdField.includes('—')
      || entityIdField.includes(' – ')
      || /:\s+[A-ZÁÉÍÓÚÑ]{2,}/.test(entityIdField);
    if (looksLikeContentTitle) {
      const reason = `Sheet "${tabName}" classified as 'entity' but resolved entity_id_field "${entityIdField}" matches plan-component-title pattern (length / structural-prefix / descriptive-punctuation). Refusing to commit — classification likely incorrect; the sheet appears to carry plan content.`;
      console.error(`[commitContentUnit] HF-247 Phase 4 type-validation: ${reason}`);
      await supabase
        .from('import_batches')
        .update({
          status: 'failed',
          error_summary: { error: reason, hf: 'HF-247-Phase-4' } as unknown as Json,
        })
        .eq('id', batchId);
      return {
        batchId,
        totalInserted: 0,
        dataType,
        entityIdField,
        fieldIdentities,
        earliestDate: null,
        latestDate: null,
        dateCount: 0,
        success: false,
        error: reason,
      };
    }
  }

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
          // D16: exponential backoff (capped) — gives a saturated/5xx-ing host room to recover between
          // retries rather than hammering it on a fixed cadence (the run-3 502 was instance saturation).
          await new Promise(r => setTimeout(r, Math.min(4000, 500 * 2 ** attempt)));
        }
      } else {
        chunkSuccess = true;
      }
    }

    if (chunkSuccess) {
      totalInserted += slice.length;
      chunksCompleted++;
      // D16: inter-chunk pacing — give the instance breathing room between writes (only when more chunks
      // remain). Keeps the saturating burst pattern that tripped the run-4 502 from re-forming.
      if (profile.pacingMs > 0 && i + profile.chunkSize < insertRows.length) {
        await new Promise(r => setTimeout(r, profile.pacingMs));
      }
    } else {
      // D16 (unit-atomic execute): a unit that cannot fully commit retains NOTHING. Roll back every row
      // already inserted under this batch, mark the batch failed/rolled_back, and return an atomic
      // failure with totalInserted:0. This replaces BOTH the prior sci-bulk "continue / preserve prior
      // chunks" (the run-3 partial-retention that left partial rows behind on the mid-bulk 502) and the
      // sci short-circuit (which also kept its partial rows). The happy path — every chunk succeeds — is
      // byte-identical and never enters here, so proof-tenant imports are unaffected.
      console.error(
        `[commitContentUnit] Chunk ${chunksCompleted + 1}/${totalChunks} failed after ${profile.retryAttempts} attempt(s): ${lastErr}`,
      );
      const { error: rbErr } = await supabase
        .from('committed_data')
        .delete()
        .eq('import_batch_id', batchId);
      await supabase
        .from('import_batches')
        .update({
          status: 'failed',
          error_summary: {
            error: lastErr,
            rolledBack: !rbErr,
            rolledBackRows: totalInserted,
            rollbackError: rbErr?.message ?? null,
          } as unknown as Json,
        })
        .eq('id', batchId);
      console.error(
        `[commitContentUnit] UNIT-ATOMIC ROLLBACK batch=${batchId}: removed ${totalInserted} partial rows ` +
          `(${rbErr ? 'ROLLBACK FAILED: ' + rbErr.message : 'ok'})`,
      );
      return {
        batchId,
        totalInserted: 0,
        dataType,
        entityIdField,
        fieldIdentities,
        earliestDate,
        latestDate,
        dateCount,
        success: false,
        error: `${lastErr} — unit rolled back (${totalInserted} partial rows removed)`,
      };
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
    // D16: reaching here means every chunk committed — failures now roll back and return above, so a
    // successful result carries no residual error.
    error: undefined,
  };
}
