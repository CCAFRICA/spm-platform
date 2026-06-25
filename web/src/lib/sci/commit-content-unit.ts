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
import { ob203Trace } from '@/lib/sci/ob203-verbose';
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
import { accumulateUnitCommitFields } from './session-telemetry-accumulator';

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
  // OB-203 Phase C: pulses the CALLER already landed for this unit before the
  // committed_data commit (entity creation/enrichment chunks). The unit's pulse
  // counters compose caller-phase + commit-phase on the ONE spine — "pulse X of
  // Y" stays a single number line, no entity-specific vocabulary. Default 0/0
  // keeps every other caller byte-identical (DD-7).
  pulseBase?: { landed: number; total: number };
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

// HF-328: Comprehension-authoritative entity_id_field resolution.
//
//   classification  entity_id_field is
//   --------------  ----------------------------------------------------------
//   entity          the `identifier` columnRole (the row IS the entity)
//   target          the `identifier` columnRole (the row is ABOUT the entity)
//   transaction     the `identifier` columnRole (same one path — HF-328)
//   reference       null (dimensional lookup; no entity association)
//
// Lineage. HF-231 routed all 8 import write paths through commitContentUnit.
// HF-233/HF-268 then SPLIT the resolution by classification: transactions read
// the `reference_key` columnRole instead of the `identifier`, on the theory that
// a transaction's own identifier is always an event id and its entity is always a
// foreign key. That theory holds for sales-event files (transaction_id:identifier
// + sales_rep_id:reference_key) but INVERTS on per-entity performance/target data,
// where the `identifier` IS the entity and the `reference_key` is a dimensional
// grouping: Meridian Datos_Rendimiento (No_Empleado:identifier@0.99 +
// Hub:reference_key@0.95) wrongly resolved to "Hub"; BCL Datos (ID_Empleado +
// Sucursal) wrongly resolved to "Sucursal". columnRole alone cannot tell the two
// cases apart, so the split was a re-derivation that guessed wrong half the time.
//
// HF-328 SUBTRACTS the split: comprehension's `identifier` columnRole is the entity
// key for every non-reference classification (Decision 158 — recognition is the
// LLM's; the commit path must not re-derive it). The phantom-entity hazard HF-268
// guarded against is now handled structurally and unconditionally at the consumption
// layer (entity-resolution.ts OB-203 D3: a transaction-only id that defines no entity
// is suppressed, never fabricated), so honoring the identifier here is safe.

// OB-231 (MIR fix): the entity key is the column the LLM characterized as identifying an ENTITY
// SCOPE (a recurring seller/employee/person/account) — NOT a per-row transaction identifier
// (folio/receipt/invoice). The fixed `identifier` columnRole could not tell the two apart (MIR
// Ventas had both Folio and DNI_Vendedor as `identifier`, so confidence ranking picked Folio).
// Now we read the LLM's free-form `identifies` channel directly (Decision 158): DNI_Vendedor
// "identifies":"entity"; Folio "identifies":"transaction". The highest-confidence entity-scope
// column wins. Scope words (entity/transaction/...) are read free-form — no quoted role literal.
// HF-285-A: exported so the execute-bulk entity gate reads the SAME canonical HC surface.
const ENTITY_SCOPE = /\b(entity|entidad|seller|vendedor|employee|empleado|person|persona|account|cuenta|organization|organizaci[oó]n|member|miembro|rep|staff|worker|salesperson|agent|agente)\b/i;
const TXN_SCOPE = /\b(transaction|transacci[oó]n|receipt|recibo|folio|invoice|factura|order|pedido|ticket|event|evento|record|registro|line|l[ií]nea)\b/i;
const IDENTIFIER_NATURE = /\b(identifier|identif|\bid\b|document|documento|dni|code|c[oó]digo|n[uú]mero|key|clave)\b/i;

export function findHcEntityIdColumn(
  classificationTrace: Record<string, unknown> | undefined,
): string | null {
  if (!classificationTrace) return null;
  const hcData = classificationTrace.headerComprehension as
    | { interpretations?: Record<string, { identifies?: string; data_nature?: string; characterization?: string; confidence?: number }> }
    | undefined;
  const interpretations = hcData?.interpretations;
  if (!interpretations) return null;
  let best: { col: string; conf: number } | null = null;
  for (const [colName, interp] of Object.entries(interpretations)) {
    const conf = typeof interp.confidence === 'number' ? interp.confidence : 0;
    if (conf < HC_IDENTIFIER_THRESHOLD) continue;
    const scope = `${interp.identifies ?? ''}`;
    const natureText = `${interp.data_nature ?? ''} ${interp.characterization ?? ''}`;
    const isEntity = ENTITY_SCOPE.test(scope);
    const isTxn = TXN_SCOPE.test(scope);
    // Entity-scope identifier only. A transaction-scope id (folio/receipt) is never the entity key.
    if (isEntity && !isTxn && IDENTIFIER_NATURE.test(natureText)) {
      if (!best || conf > best.conf) best = { col: colName, conf };
    }
  }
  return best?.col ?? null;
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

  // HF-328 (SUBTRACTION — comprehension-authoritative): the column comprehension
  // classified as the `identifier` IS the entity key, for EVERY non-reference
  // classification — entity, target, AND transaction. One path. No re-derivation.
  //
  // The prior `transaction → reference_key` special case (HF-268) was a vestigial
  // independent re-derivation: it ignored the classified identifier and instead
  // picked the reference_key. On per-entity performance data that mis-selected a
  // dimensional grouping column over the real entity identifier — Meridian's
  // Datos_Rendimiento resolved entity_id_field="Hub" (reference_key, a logistics-hub
  // name) instead of "No_Empleado" (identifier@0.99, the employee), and BCL's Datos
  // resolved "Sucursal" (reference_key, a branch) instead of "ID_Empleado"
  // (identifier@0.99). Comprehension had already recognized the identifier
  // correctly (Decision 158); the commit path re-derived the answer and chose wrong.
  //
  // The phantom-entity hazard HF-268 guarded against (keying a sales transaction on
  // its own event id → fabricating one entity per transaction_id) is now prevented
  // STRUCTURALLY at the consumption layer: entity-resolution.ts gates entity
  // *creation* on `definedByEntityDefiningBatch` + `isEventUnit` (OB-203 D3) — an id
  // that originates only from a transaction/target unit and defines no entity is
  // suppressed there, never fabricated, regardless of which column we name here.
  // So honoring the classified identifier cannot reintroduce phantom entities; a
  // real foreign key whose entities the roster already created still links unchanged.
  //
  // When comprehension classified NO identifier on a non-reference sheet, fall back
  // to the entity_identifier binding (this preserves the foreign-key-only transaction
  // case, whose reference_key column derives semanticRole=entity_identifier), then
  // null — the engine resolves at calc time (Decision 92 / OB-183). reference_key is
  // never itself a candidate for entity_id_field (§6A: do not force an identifier
  // where comprehension didn't classify one).
  const hcIdentifier = findHcEntityIdColumn(classificationTrace);
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

// §3e (pulse-size asymmetry, justified): reads batch at 200 (the standing .in() rule — an IN-list
// cardinality cap that bounds query-param size on LOOKUPS); writes pulse at 500 (INSERT payload
// throughput under the Small-instance write ceiling). Different operations, different constraints — the
// two numbers are not the same concept tuned differently, so they are not aligned.
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

  // OB-203 Phase D Hook 2 (batch created): the unit's expected work is now
  // known — record it on the session telemetry row, piggybacked on the batch
  // insert (Amendment 2 D.2). Awaited (never throws) so later pulse patches
  // cannot land before this one. Phase C: pulse counters compose on top of
  // the caller-phase base (entity creation/enrichment pulses already landed).
  const pulseBase = params.pulseBase ?? { landed: 0, total: 0 };
  await accumulateUnitCommitFields({
    tenantId,
    importSessionId: proposalId,
    unitId: unit.contentUnitId,
    fields: {
      sheetName: tabName,
      expectedRows: rows.length,
      pulsesTotal: pulseBase.total + Math.ceil(rows.length / profile.chunkSize),
      rowsCommitted: 0,
      pulsesLanded: pulseBase.landed,
      batchCommitted: false,
    },
  }, supabase);

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
  let entityIdField = resolveEntityIdField(
    unit.confirmedBindings,
    unit.classificationTrace,
    classification,
  );

  // HF-341 R3 (V8 eradication): the entity-id is the column the LLM scoped as the entity identity
  // (resolveEntityIdField → findHcEntityIdColumn reads the free-form `identifies` channel; a
  // transaction/event id is already rejected by TXN_SCOPE). The prior OB-231/HF-333 CARDINALITY
  // HEURISTIC — a developer rule (lowest-cardinality repeating identifier) that OVERRODE the recognized
  // answer — is DELETED (Validation Premise Law: a heuristic standing in front of recognition's output;
  // it can be made "more complete" by editing the ratio threshold → it is a registry of expectation).
  // Construction VERIFIES STRUCTURALLY instead: the resolved column must EXIST in the rows. A column
  // recognition named that the data does not carry is surfaced loudly (C2); recognition is trusted,
  // never overridden by cardinality (Decision 158).
  if (entityIdField && rows.length >= 20) {
    let presentCount = 0;
    for (const r of rows) if (entityIdField in (r as Record<string, unknown>)) presentCount += 1;
    if (presentCount === 0) {
      console.warn(`[entity-id] resolved entity_id_field="${entityIdField}" on "${tabName}" is absent from all ${rows.length} rows — recognition named a column the data does not carry; flag for review (no cardinality override; Decision 158).`);
    }
  }

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
      // OB-203 §2/§5: a write is a PULSE (DS-021 family; "nanobatch" stays reserved for DS-020 learning).
      ob203Trace('pulse', { unit: unit.contentUnitId, sheet: tabName, pulse: chunksCompleted, ofTotal: totalChunks, rows: totalInserted });
      // OB-203 Phase D Hook 2 (pulse landed): ONE counter update per 500-row
      // pulse, never per row (Amendment 2 D.2/D.4). The panels' pulse/row
      // numbers move with this write.
      await accumulateUnitCommitFields({
        tenantId,
        importSessionId: proposalId,
        unitId: unit.contentUnitId,
        fields: { rowsCommitted: totalInserted, pulsesLanded: pulseBase.landed + chunksCompleted },
      }, supabase);
      // D16: inter-pulse pacing — give the instance breathing room between writes (only when more pulses
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
      // OB-203 Phase D Hook 2 (rollback): the unit retains NOTHING (D16) — its
      // telemetry snapshot says so too. Decision 95: the panel never shows rows
      // the table no longer holds.
      await accumulateUnitCommitFields({
        tenantId,
        importSessionId: proposalId,
        unitId: unit.contentUnitId,
        fields: { rowsCommitted: 0, pulsesLanded: 0, batchCommitted: false },
      }, supabase);
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

  // OB-203 Phase D Hook 2 (batch completed): terminal commit truth on the
  // telemetry row, piggybacked on the finalize update.
  await accumulateUnitCommitFields({
    tenantId,
    importSessionId: proposalId,
    unitId: unit.contentUnitId,
    fields: { rowsCommitted: totalInserted, batchCommitted: true },
  }, supabase);

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
