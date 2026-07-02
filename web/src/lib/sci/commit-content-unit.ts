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
// HF-356 (RC1): the committed_data WRITE moves to a CSV-to-Storage + S3-FDW bulk load. This serializes
// the SAME row objects buildCommittedRow produces (byte-identical content); the DB loads them.
import { committedRowToCsvLine, committedRowsCsvStream, type CommittedRow } from './committed-row-csv';
import type { PulseManifestEntry } from './pulse-load-types';
// OB-249 — Remediation Stage (the mandatory gate before committed_data, I7). Deterministic
// CONSTRUCT only here; the LLM express ran at proposal time (process-job).
import {
  runRemediationConstruct,
  computeRemediationExclusions,
  dataColumns,
  dbRecall,
  emitStageRunSignal,
} from '@/lib/remediation/remediation-stage';

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

// `source` labels the operational route on metadata.source ('sci' = synchronous execute, 'sci-bulk' =
// the bulk/windowed worker path) identically to the existing inline writers. HF-356: it no longer selects
// a chunk/retry profile — the commit transport (CSV → Storage → one S3-FDW bulk-load RPC) is uniform.
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
  // OB-251 (DS-016 §C chunk-jobs) — ADDITIVE, byte-identical for every existing caller.
  // rowIndexOffset: makes row_data._rowIndex file-global when a large file is committed as
  //   multiple chunk-jobs (each chunk-job feeds its own window of rows). Default 0 ⇒ the
  //   _rowIndex of every existing single-job caller is unchanged.
  rowIndexOffset?: number;
  // entityIdFieldOverride: when a file is split into chunk-jobs, the CLASSIFY worker resolves
  //   entity_id_field ONCE over the file's HC trace + sample and passes it to every chunk so the
  //   multi-candidate value-overlap tie-break (selectEntityIdFieldByOverlap) cannot drift between
  //   chunks. `undefined` (the default) ⇒ resolveEntityIdField runs exactly as today (byte-identical
  //   for BCL/Meridian/MIR and every non-chunked import). `null` is a valid explicit "no entity id".
  entityIdFieldOverride?: string | null;
  // HF-360 (Part A) — HAND-OFF: stage this pulse's CSV to Storage and create its import_batch as 'staged',
  // but do NOT call the FDW load RPC. The pg_cron worker loads it off the serverless clock. The function
  // never spends the load duration. Remediation CONSTRUCT still runs here (the staged CSV is fully built,
  // deterministic, no LLM — Decision 158). Default false ⇒ the synchronous load path is byte-identical for
  // any caller that has not opted into the hand-off. With the worker scheduled, execute-bulk passes true.
  handOff?: boolean;
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
  // HF-360 (Part A) — present when this commit STAGED (handOff) instead of loading: the manifest row the
  // session enqueue records (index is assigned at session scope, in commit order). totalInserted is 0 on a
  // staged result (the rows are not in committed_data yet — the worker loads them).
  stagedPulse?: Omit<PulseManifestEntry, 'index'>;
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
// HF-368: we read the MODEL's BARE primitive directly (Decision 158): DNI_Vendedor
// scope_role="entity"; Folio scope_role="transaction". The entity key is the column the model
// scoped `entity` + nature `identifier` — read by EQUALITY, never a regex over prose. The
// bilingual word-list registry scope-predicates.ts is DELETED (HF-368); the model names the
// primitive, in any language, with no developer synonym list.
// HF-285-A: exported so the execute-bulk entity gate reads the SAME canonical HC surface.

/**
 * HF-351 F5: ALL columns the LLM scoped as entity-scope identifiers (≥ threshold),
 * in emission order. The entity-id is one of these; when there are ≥2 the selection
 * is by value-domain overlap (selectEntityIdFieldByOverlap), never positional.
 * Korean Test: reads the LLM's free-form `identifies`/`data_nature` scope, no names.
 */
export function findHcEntityIdCandidates(
  classificationTrace: Record<string, unknown> | undefined,
): string[] {
  if (!classificationTrace) return [];
  const hcData = classificationTrace.headerComprehension as
    | { interpretations?: Record<string, { scope_role?: string; nature_role?: string; confidence?: number }> }
    | undefined;
  const interpretations = hcData?.interpretations;
  if (!interpretations) return [];
  const candidates: string[] = [];
  for (const [colName, interp] of Object.entries(interpretations)) {
    const conf = typeof interp.confidence === 'number' ? interp.confidence : 0;
    if (conf < HC_IDENTIFIER_THRESHOLD) continue;
    // HF-368: the entity key is the column the MODEL named as an entity-scope identifier — read by
    // EQUALITY against the fixed primitive (scope_role/nature_role), never a regex over prose. A
    // transaction-scope id (scope_role==='transaction') is excluded by the bare equality itself.
    if (interp.scope_role === 'entity' && interp.nature_role === 'identifier') {
      candidates.push(colName);
    }
  }
  return candidates;
}


/** R7 D1 thresholds (entity-resolution.ts:58-135) reused for the commit-time value-domain step. */
const F5_OVERLAP_MIN = 0.5;

/** HF-373 Phase C: a structural selection outcome. `chosen` is '' when nothing was
 *  selected; `ambiguousCompetitors` present means ambiguity survived every structural
 *  fact and the CALLER MUST FAIL LOUD (C2) -- never emission order, never a statistic. */
export interface EntityIdSelection {
  chosen: string;
  reason: string;
  ambiguousCompetitors?: string[];
}

/**
 * HF-373 Phase C (D3): select the entity_id_field among >=2 model-recognized
 * entity-scope identifier candidates by STRUCTURAL FACTS ONLY (Decision 158: the
 * model recognizes the candidates; deterministic construction guarantees the
 * choice). The HF-351 F5 "finest repeating identifier" statistic is DELETED: on an
 * entity/roster sheet it structurally inverted (a roster's true id is bijective
 * with rows = 1.0x repeat, so the repeatRatio>1.1 filter excluded it and preferred
 * the self-referential manager FK -- 84/85 VLTEST2 roster rows mis-linked to the
 * manager's entity on 2026-07-02). Facts, in order (each an arithmetic fact about
 * the columns' VALUES -- no name matching, no word lists, no tunable preference
 * ranking; Korean Test):
 *  (1) strict value-subset elimination: a candidate whose distinct value set is a
 *      strict subset of another candidate's REFERENCES the other's instances
 *      (13 manager ids within 85 employee ids) -- it cannot be the subject key.
 *  (2) entity-sheet construction invariant (classification === 'entity'): one row
 *      IS one entity, so the subject identifier carries a value on every row, all
 *      distinct (bijective with rows). Applied only when it selects EXACTLY one.
 *  (3) value-domain overlap (HF-351 branch (a), unchanged): the candidate whose
 *      values decisively overlap the tenant's existing entity external_ids.
 *  (4) still ambiguous -> ambiguousCompetitors (the caller fails the unit loudly,
 *      naming the competitors) -- never emission order.
 */
export function selectEntityIdFieldStructural(
  candidates: string[],
  rows: Array<Record<string, unknown>>,
  entityDomain: Set<string>,
  classification: string,
): EntityIdSelection {
  if (candidates.length === 0) return { chosen: '', reason: 'no candidates' };
  if (candidates.length === 1) return { chosen: candidates[0], reason: 'single entity-scope identifier' };

  const stats = candidates.map(col => {
    const vals = new Set<string>();
    let nonNull = 0;
    for (const r of rows) {
      const v = r[col];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) { vals.add(s); nonNull++; }
    }
    let overlap = 0; for (const v of Array.from(vals)) if (entityDomain.has(v)) overlap++;
    return { col, vals, nonNull, distinct: vals.size, overlapFrac: vals.size > 0 ? overlap / vals.size : 0 };
  });

  // (1) strict value-subset elimination (strict subset is a partial order, so
  // maximal elements always exist; an all-empty candidate is a subset of any
  // non-empty one and drops here too).
  const isStrictSubset = (a: Set<string>, b: Set<string>): boolean => {
    if (a.size >= b.size) return false;
    for (const v of Array.from(a)) if (!b.has(v)) return false;
    return true;
  };
  const survivors = stats.filter(s => !stats.some(o => o !== s && isStrictSubset(s.vals, o.vals)));
  if (survivors.length === 1) {
    const dropped = stats.filter(s => s !== survivors[0]).map(s => s.col);
    return { chosen: survivors[0].col, reason: `structural: strict value-subset elimination (referencing candidate(s) dropped: ${dropped.join(', ')})` };
  }

  // (2) entity-sheet construction invariant
  if (classification === 'entity') {
    const bijective = survivors.filter(s => s.nonNull === rows.length && s.distinct === s.nonNull);
    if (bijective.length === 1) {
      return { chosen: bijective[0].col, reason: `structural: entity-sheet identifier bijective with rows (${bijective[0].distinct} distinct / ${rows.length} rows)` };
    }
  }

  // (3) value-domain overlap (unchanged HF-351 branch (a))
  if (entityDomain.size > 0) {
    const ranked = survivors.slice().sort((a, b) => b.overlapFrac - a.overlapFrac || b.distinct - a.distinct);
    if (ranked[0].overlapFrac >= F5_OVERLAP_MIN && ranked[0].overlapFrac > (ranked[1]?.overlapFrac ?? 0)) {
      return { chosen: ranked[0].col, reason: `value-domain overlap ${(ranked[0].overlapFrac * 100).toFixed(0)}% (vs ${((ranked[1]?.overlapFrac ?? 0) * 100).toFixed(0)}%)` };
    }
  }

  // (4) ambiguous -> the caller fails LOUD (C2). Never first-match.
  const detail = survivors.map(s => `${s.col}(distinct=${s.distinct}, nonNull=${s.nonNull}, overlap=${(s.overlapFrac * 100).toFixed(0)}%)`).join(', ');
  return {
    chosen: '',
    reason: `ambiguous after structural discrimination: ${detail}`,
    ambiguousCompetitors: survivors.map(s => s.col),
  };
}

function resolveEntityIdField(
  bindings: SemanticBinding[],
  classificationTrace: Record<string, unknown> | undefined,
  classification: Exclude<AgentType, 'plan'>,
  rows: Array<Record<string, unknown>>,
  entityDomain: Set<string>,
): { field: string | null; ambiguousReason: string | null } {
  // Reference data has no entity association -- Decision 111 dimensional
  // lookup semantics. Skip both HC and structural lookups.
  if (classification === 'reference') {
    return { field: null, ambiguousReason: null };
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
  // HF-373 Phase C: collect ALL entity-scope identifier candidates. One candidate ->
  // return it (BCL ID_Empleado, Meridian No_Empleado -- byte-identical). Two or more ->
  // STRUCTURAL discrimination (strict value-subset elimination / entity-sheet
  // bijectivity / value-domain overlap); ambiguity FAILS LOUD at the caller (C2).
  // Zero -> the entity_identifier binding, then null.
  const candidates = findHcEntityIdCandidates(classificationTrace);
  if (candidates.length === 1) return { field: candidates[0], ambiguousReason: null };
  if (candidates.length >= 2) {
    const sel = selectEntityIdFieldStructural(candidates, rows, entityDomain, classification);
    console.log(`[entity-id] HF-373 C: ${candidates.length} entity-scope candidates [${candidates.join(', ')}] -> "${sel.chosen || '(none)'}" (${sel.reason})`);
    if (sel.ambiguousCompetitors) return { field: null, ambiguousReason: sel.reason };
    return { field: sel.chosen || null, ambiguousReason: null };
  }
  const binding = bindings.find(b => b.semanticRole === 'entity_identifier');
  return { field: binding?.sourceField ?? null, ambiguousReason: null };
}

/** HF-351 F5: the tenant's entity domain (existing entities' external_ids) — the
 *  carried reality the multi-identifier value-overlap tie-break ranks against.
 *  Empty on a cold/first import (entity sheet not yet committed) → cardinality fallback. */
export async function readTenantEntityDomain(supabase: SupabaseClient, tenantId: string): Promise<Set<string>> {
  const domain = new Set<string>();
  try {
    const { data } = await supabase.from('entities').select('external_id').eq('tenant_id', tenantId).limit(20000);
    for (const e of data ?? []) { const x = (e as { external_id: string | null }).external_id; if (x) domain.add(String(x).trim()); }
  } catch { /* best-effort; empty domain → cold-start fallback */ }
  return domain;
}

// ── HF-359 (Part A): shared committed-row metadata + byte estimator ─────────────────────────────────
// The pulse boundary (windowed-commit.ts) must size each pulse by its serialized CSV bytes. To measure a
// row's bytes with the SAME serializer + metadata commitContentUnit commits, these helpers are the ONE
// source of the committed-row metadata shape — used BOTH by commitContentUnit's buildCommittedRow AND by
// the pre-commit byte estimator, so they cannot drift.

/** semantic_roles in the committed-row metadata shape (role/confidence/claimedBy), from confirmedBindings. */
export function buildCommitSemanticRoles(
  bindings: SemanticBinding[],
): Record<string, { role: string; confidence: number; claimedBy: string }> {
  const out: Record<string, { role: string; confidence: number; claimedBy: string }> = {};
  for (const binding of bindings) {
    out[binding.sourceField] = { role: binding.semanticRole, confidence: binding.confidence, claimedBy: binding.claimedBy };
  }
  return out;
}

/** The per-row CONSTANT metadata (everything except the rare per-row remediation.changes). */
export function buildUnitCsvMetadata(args: {
  source: string;
  proposalId: string;
  semanticRoles: Record<string, { role: string; confidence: number; claimedBy: string }>;
  dataType: string;
  entityIdField: string | null;
  classification: string;
  fieldIdentities: Record<string, FieldIdentity>;
  agentsRun: string[];
}): Record<string, unknown> {
  return {
    source: args.source,
    proposalId: args.proposalId,
    semantic_roles: args.semanticRoles,
    resolved_data_type: args.dataType,
    entity_id_field: args.entityIdField,
    informational_label: args.classification,
    field_identities: args.fieldIdentities,
    remediation: { _stageRan: true, agents: args.agentsRun },
  };
}

/**
 * The Part A row-byte estimator — the EXACT serialized CSV line size of a row, using the unit's real
 * constant metadata (reuses `committedRowToCsvLine`, the same serializer commitContentUnit uses). Built
 * pre-commit (before remediation), so it uses the raw row + an empty agents list; remediation only
 * canonicalizes a few cells (byte-negligible) and the budget's headroom fraction covers the drift.
 * Placeholder import_batch_id / source_date / _rowIndex are fixed-width and representative.
 */
export function makeRowByteEstimator(
  unit: CommitContentUnitInput,
  classification: Exclude<AgentType, 'plan'>,
  entityIdField: string | null,
  scalars: { tenantId: string; proposalId: string; tabName: string; source: CommitContentUnitSource },
): (row: Record<string, unknown>) => number {
  const dataType = resolveDataTypeFromClassification(classification);
  const semanticRoles = buildCommitSemanticRoles(unit.confirmedBindings);
  const fieldIdentities =
    extractFieldIdentitiesFromTrace(unit.classificationTrace) ?? buildFieldIdentitiesFromBindings(unit.confirmedBindings);
  const metadata = buildUnitCsvMetadata({
    source: scalars.source, proposalId: scalars.proposalId, semanticRoles, dataType,
    entityIdField, classification, fieldIdentities, agentsRun: [],
  });
  return (row: Record<string, unknown>): number => {
    const projection: CommittedRow = {
      tenant_id: scalars.tenantId,
      import_batch_id: '00000000-0000-0000-0000-000000000000',
      entity_id: null,
      period_id: null,
      source_date: '2024-01-01',
      data_type: dataType,
      row_data: { ...row, _sheetName: scalars.tabName, _rowIndex: 0 },
      metadata,
    };
    return Buffer.byteLength(committedRowToCsvLine(projection), 'utf8') + 1; // +1 for the trailing newline
  };
}

// ============================================================
// commitContentUnit — sole committed_data write surface
// ============================================================
//
// HF-356 (RC1): the per-source ROUTE PROFILE (chunk size / retry / inter-chunk pacing) is GONE — those
// existed to keep the per-batch HTTP `.insert` under a Small instance's write ceiling. The commit no
// longer streams rows over HTTP; it writes ONE CSV to Storage and the database bulk-loads it via the S3
// FDW in one RPC, so there is no chunk loop and no instance-ceiling pacing to tune.

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

  // HF-196 Phase 1D — data_type derives from SCI classification (Decisions 154/155).
  const dataType = resolveDataTypeFromClassification(classification);

  // HF-213 — content_unit_hash_sha256 is the supersession identity primitive.
  // OB-251 HOTFIX: salt with the chunk's file-global offset so two byte-identical windows of ONE large
  // file cannot supersede each other (and drop rows). undefined for single-batch callers (offset 0) →
  // byte-identical hash, so HALT-CALC anchors are unaffected.
  const contentUnitHashSha256 = computeContentUnitHashSha256(
    rows,
    params.rowIndexOffset && params.rowIndexOffset > 0 ? `chunk@${params.rowIndexOffset}` : undefined,
  );
  const batchId = crypto.randomUUID();
  const pulseBase = params.pulseBase ?? { landed: 0, total: 0 };

  // HF-362 (Part A): the batch row is the FK target the hand-off worker's bulk_commit_from_storage needs.
  // CHECK the insert error — a failed batch insert (e.g. an invalid status before the constraint migration
  // is applied) must FAIL the commit cleanly here, never leave an orphan `batchId` in the pulse manifest
  // that the worker then fails on with committed_data_import_batch_id_fkey (the HF-360 silent-failure bug).
  const { error: batchInsertErr } = await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: fileName,
    file_type: 'sci',
    // HF-360 (Part A): a hand-off pulse is STAGED, not loaded — the pg_cron worker flips it to 'completed'
    // when it loads the staged CSV. A synchronous commit (handOff falsy) is 'processing' as before.
    // ('staged' is allowed by the HF-362 constraint migration; it is reconciler-exempt + visibility-hidden.)
    status: params.handOff ? 'staged' : 'processing',
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
  if (batchInsertErr) {
    console.error(`[commitContentUnit] import_batches insert failed for "${tabName}" (status=${params.handOff ? 'staged' : 'processing'}): ${batchInsertErr.message}`);
    await accumulateUnitCommitFields({
      tenantId, importSessionId: proposalId, unitId: unit.contentUnitId,
      fields: { rowsCommitted: 0, pulsesLanded: 0, batchCommitted: false },
    }, supabase);
    return {
      batchId, totalInserted: 0, dataType, entityIdField: null, fieldIdentities: {},
      earliestDate: null, latestDate: null, dateCount: 0, success: false,
      error: `import_batches insert failed: ${batchInsertErr.message}`,
    };
  }

  // OB-203 Phase D Hook 2 (batch created): the unit's expected work is now
  // known — record it on the session telemetry row, piggybacked on the batch
  // insert (Amendment 2 D.2). Awaited (never throws) so later pulse patches
  // cannot land before this one. Phase C: pulse counters compose on top of
  // the caller-phase base (entity creation/enrichment pulses already landed).
  await accumulateUnitCommitFields({
    tenantId,
    importSessionId: proposalId,
    unitId: unit.contentUnitId,
    fields: {
      sheetName: tabName,
      expectedRows: rows.length,
      pulsesTotal: pulseBase.total + 1,
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

  // Build semantic_roles map from confirmedBindings (single shape across all four classifications).
  // HF-359: via the shared buildCommitSemanticRoles so the byte estimator measures the SAME metadata.
  const semanticRoles = buildCommitSemanticRoles(unit.confirmedBindings);

  // HF-110 — field_identities: HC trace primary, confirmedBindings fallback (DS-009 1.3).
  const fieldIdentities =
    extractFieldIdentitiesFromTrace(unit.classificationTrace) ??
    buildFieldIdentitiesFromBindings(unit.confirmedBindings);

  // Decision 108 — HC role @ >= 0.80 overrides structural binding.
  // HF-233 — Classification-aware resolution: transaction reads reference_key,
  // entity/target reads identifier, reference is null.
  // HF-341 R3: const — the entity-id is the recognized identifies-scope column, never reassigned by a
  // cardinality override (deleted). The structural existence check below verifies it, not overrides it.
  // HF-351 F5: read the tenant entity domain so a transaction sheet with ≥2
  // entity-scope identifiers (e.g. a branch `sucursal` AND the real `vendedor_id`)
  // selects by value-domain overlap, not emission order. Single-identifier sheets
  // (BCL/Meridian) never consult it — byte-identical.
  // OB-251: a chunk-job passes the entity_id_field the CLASSIFY worker already resolved over the
  // whole file (entityIdFieldOverride) so every chunk commits the SAME key — no per-chunk
  // re-derivation, no value-overlap drift between windows. undefined ⇒ resolve as today.
  const entityDomain = params.entityIdFieldOverride !== undefined
    ? new Set<string>()
    : await readTenantEntityDomain(supabase, tenantId);
  const entityIdSelection = params.entityIdFieldOverride !== undefined
    ? { field: params.entityIdFieldOverride, ambiguousReason: null as string | null }
    : resolveEntityIdField(
        unit.confirmedBindings,
        unit.classificationTrace,
        classification,
        rows as Array<Record<string, unknown>>,
        entityDomain,
      );
  // HF-373 Phase C (D3): ambiguity that survives every structural fact is a LOUD
  // unit failure (C2) -- the unit does not commit with a guessed identity key.
  if (entityIdSelection.ambiguousReason) {
    const reason = `entity-id selection failed for "${tabName}": ${entityIdSelection.ambiguousReason} (HF-373 C2 -- refusing to commit with a guessed identity key)`;
    console.error(`[commitContentUnit] ${reason}`);
    await supabase.from('import_batches').update({
      status: 'failed',
      error_summary: { error: reason, hf: 'HF-373-C' } as unknown as Json,
    }).eq('id', batchId);
    await accumulateUnitCommitFields({
      tenantId,
      importSessionId: proposalId,
      unitId: unit.contentUnitId,
      fields: { rowsCommitted: 0, pulsesLanded: 0, batchCommitted: false },
    }, supabase);
    return { batchId, totalInserted: 0, dataType, entityIdField: null, fieldIdentities, earliestDate: null, latestDate: null, dateCount: 0, success: false, error: reason };
  }
  const entityIdField = entityIdSelection.field;

  // HF-341 R3 (V8 eradication): the entity-id is the column the model scoped as the entity identity
  // (resolveEntityIdField → findHcEntityIdColumn reads the model's bare scope_role/nature_role; a
  // transaction id is excluded by scope_role!=='entity'). The prior OB-231/HF-333 CARDINALITY
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

  // HF-351 F3 (SUBTRACTION of the HF-247 Phase 4 name heuristic): the prior guard
  // REFUSED commit when the resolved entity_id_field column NAME matched a
  // "plan-component-title" shape (length>40 / "C1:" prefix / em-dash / colon+caps).
  // That is a Korean Test / AP-25 violation — it decided validity from the NAME
  // STRING, not the column's VALUES, and HARD-FAILED a valid roster/hierarchy sheet
  // (Jerarquia) whose real entity-id lives in a long MERGED-HEADER (__EMPTY) column.
  // Replaced with a STRUCTURAL value-functioning VALIDATION (does the column carry
  // per-row identifier-functioning values), consistent with the presence check above
  // (Decision 158 / Validation Premise Law) — and it WARNS/flags rather than refusing.
  // A long descriptive column name is never, by itself, a reason to refuse commit.
  if (classification === 'entity' && entityIdField && rows.length >= 20) {
    let present = 0;
    const vals = new Set<string>();
    for (const r of rows) {
      const v = (r as Record<string, unknown>)[entityIdField];
      if (v != null && String(v).trim() !== '') { present += 1; vals.add(String(v).trim()); }
    }
    const presentFrac = present / rows.length;
    // identifier-functioning = present in most rows AND discriminates rows (not a single constant).
    if (presentFrac < 0.5 || vals.size <= 1) {
      console.warn(`[commitContentUnit] HF-351 F3: entity sheet "${tabName}" entity_id_field "${entityIdField}" does not function as an identifier (present in ${(presentFrac * 100).toFixed(0)}% of rows, ${vals.size} distinct value(s)) — flag for review. Committing (recognition trusted; Decision 158 — no name-shape refusal).`);
    }
  }

  // OB-249 — REMEDIATION STAGE (mandatory gate, I7/I9). This is the committed_data writer for the
  // membrane/SCI import path (execute-bulk + execute both route here, HF-231); it routes every row
  // through remediation BEFORE promotion. Clean data passes through as identity and is still STAMPED
  // (_stageRan) so P8 ("clean cannot bypass") is query-provable. (Two PRE-EXISTING non-SCI writers
  // exist — the product-orphaned legacy api/import/commit route and the dead data-service helper;
  // remediation/__tests__/p8-sole-writer.test.ts fails on any NEW writer, and those two are flagged
  // for the architect to 410/route-through — out of OB-249 scope.) CONSTRUCT
  // only (deterministic, no LLM — the express ran at proposal time in process-job, off this 300s
  // atomic-rollback path). The stage NEVER throws: any failure degrades to identity (raw rows
  // committed) + a degraded signal. Ordering (the I3/HF-213 fix): this runs AFTER
  // content_unit_hash_sha256 (:294, raw-row supersession identity) and AFTER entity_id_field
  // resolution; the exclusion set protects the calc join key + identifiers + measure/temporal
  // columns by NATURE, and source_date below is still extracted over the ORIGINAL row.
  const allDataColumns = dataColumns(rows);
  const remediationExclusions = computeRemediationExclusions(allDataColumns, semanticRoles, fieldIdentities, entityIdField);
  const allowedColumns = allDataColumns.filter((c) => !remediationExclusions.has(c));
  const remediation = await runRemediationConstruct({
    tenantId,
    rows,
    columns: allDataColumns,
    allowedColumns,
    recall: dbRecall(supabase, tenantId),
  });
  const correctedRows = remediation.correctedRows;
  const changesByRow = new Map<number, Record<string, { original: unknown; canonical: unknown; basis: string; agent: string }>>();
  for (const ch of remediation.changes) {
    const m = changesByRow.get(ch.rowIndex) ?? {};
    m[ch.column] = { original: ch.original, canonical: ch.canonical, basis: ch.basis, agent: ch.agent };
    changesByRow.set(ch.rowIndex, m);
  }
  if (remediation.changes.length > 0) {
    console.log(
      `[commitContentUnit] OB-249 remediation: ${remediation.changes.length} cell(s) canonicalized across ` +
        `${Object.keys(remediation.report.changesByColumn).length} column(s) on "${tabName}" ` +
        `(agents: ${remediation.report.agentsRun.join(',') || 'none'}; degraded: ${remediation.report.degradedAgents.join(',') || 'none'})`,
    );
  }

  // HF-359 (Part A): the per-row CONSTANT metadata, built ONCE via the shared helper the byte estimator
  // also uses (so the pulse-sizing serialization matches the committed serialization). buildCommittedRow
  // merges the rare per-row remediation.changes onto this base — committed bytes unchanged (PG-A3).
  const csvMetaBase = buildUnitCsvMetadata({
    source, proposalId, semanticRoles, dataType, entityIdField, classification,
    fieldIdentities, agentsRun: remediation.report.agentsRun,
  });

  // OB-152/OB-157 — source_date extraction with period marker composition.
  const dateColumnHint = findDateColumnFromBindings(unit.confirmedBindings);
  const semanticRolesMap = buildSemanticRolesMap(unit.confirmedBindings);
  const periodMarkerHint = detectPeriodMarkerColumns(rows);

  // Build committed_data rows. entity_id and period_id are always NULL at
  // import — engine binds them at calc time (OB-182, Decision 92).
  let earliestDate: string | null = null;
  let latestDate: string | null = null;
  let dateCount = 0;

  // HF-353 P-A / HF-356 (enterprise OOM): the per-row committed_data projection. PREVIOUSLY the FULL
  // payload (`const insertRows = rows.map(...)`) was materialized at once — a third full copy of the
  // parsed data (each row_data spreads all N columns), which on an 86,608×87 ERP export drove ~2GB peak
  // heap → Vercel OOM. The CSV-build loop below calls this once per row, serializes the result to a CSV
  // line, and drops the built object immediately (never holds all built rows at once). Peak heap ≈ the
  // caller's `rows` (one bounded window for a large file — OB-251) + the CSV strings, independent of how
  // the rows are transported. Byte-identical committed rows: the projection (and its source_date
  // side-effect into the outer accumulators) is unchanged — only the transport (CSV+FDW) differs.
  const buildCommittedRow = (row: Record<string, unknown>, i: number) => {
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

    // OB-249: the CANONICAL (remediated) row is what gets promoted — downstream raw-key readers
    // (run-calculation, entity-resolution) see congruent values automatically. The ORIGINAL is
    // retained per-cell in metadata.remediation.changes (I3/P4 — never a destructive overwrite).
    // source_date above was extracted over the ORIGINAL `row` (date columns are nature-excluded
    // from remediation anyway), so temporal extraction is unaffected.
    const correctedRow = correctedRows[i] ?? row;
    const rowChanges = changesByRow.get(i);
    return {
      tenant_id: tenantId,
      import_batch_id: batchId,
      entity_id: null as string | null,
      period_id: null as string | null,
      source_date: sourceDate,
      data_type: dataType,
      // OB-251: _rowIndex is file-global when chunked (rowIndexOffset default 0 ⇒ unchanged).
      row_data: { ...correctedRow, _sheetName: tabName, _rowIndex: (params.rowIndexOffset ?? 0) + i },
      // HF-359: the shared constant metadata (csvMetaBase) + the rare per-row remediation.changes merged
      // onto it. Byte-identical to the prior inline literal — same keys, same order, same values (PG-A3).
      // OB-249 (P8/P4): _stageRan is stamped on EVERY row via csvMetaBase; per-cell originals are retained
      // in remediation.changes when this row changed (Carry Everything, I3).
      metadata: rowChanges
        ? { ...csvMetaBase, remediation: { ...(csvMetaBase.remediation as Record<string, unknown>), changes: rowChanges } }
        : csvMetaBase,
    };
  };

  // HF-356 (RC1) — COMMIT VIA S3-FDW (the row transport that took production down twice is removed). The
  // per-batch HTTP `.insert(slice)` loop is replaced by: serialize the SAME rows `buildCommittedRow`
  // produces into ONE CSV, write it to Storage, and call `bulk_commit_from_storage` ONCE — the database
  // loads that CSV from its OWN Storage via the S3 foreign data wrapper (I1: zero bulk rows over HTTP;
  // I2: one round-trip, seconds, no pooler pressure). committed_data is BYTE-IDENTICAL because the row
  // OBJECTS are unchanged — only the transport differs (PG-1 proves the CSV round-trip). For a windowed
  // large file this runs once per bounded window (each its own batch, as before — windowed-commit.ts:9),
  // so peak heap stays one window (OB-251 SR-2 preserved); a small file runs it once over the whole unit.
  const csvPath = `${tenantId}/committed/${batchId}.csv`;

  // D16 unit-atomicity: a unit that cannot fully commit retains NOTHING. The bulk INSERT…SELECT is a
  // single transaction (so a failed load leaves no partial rows), but this also cleans up on a mismatch
  // and reports rowsCommitted:0 on the telemetry row (Decision 95: the panel never shows rows the table
  // no longer holds).
  const failCommit = async (reason: string): Promise<CommitContentUnitResult> => {
    console.error(`[commitContentUnit] ${reason}`);
    await supabase.from('committed_data').delete().eq('import_batch_id', batchId);
    await supabase.from('import_batches').update({
      status: 'failed',
      error_summary: { error: reason, hf: 'HF-356-COMMIT' } as unknown as Json,
    }).eq('id', batchId);
    await accumulateUnitCommitFields({
      tenantId,
      importSessionId: proposalId,
      unitId: unit.contentUnitId,
      fields: { rowsCommitted: 0, pulsesLanded: 0, batchCommitted: false },
    }, supabase);
    return { batchId, totalInserted: 0, dataType, entityIdField, fieldIdentities, earliestDate, latestDate, dateCount, success: false, error: reason };
  };

  // ONE CSV to Storage (header + one line per row), STREAMED in bounded slices — peak heap is one slice,
  // never the whole window as array + joined string + Buffer (HF-358 Part A, the OOM fix). buildLine
  // builds + serializes one row at a time, in ascending order, so the source-date accumulators and the
  // CSV bytes are identical to the prior materialize-then-upload path (PG-A2). storage-js streams a Node
  // Readable (it sets duplex:'half' for a body with .pipe) so the bytes never fully reside in memory. The
  // bytes never touch the database connection — the DB reads the file from Storage on the next call.
  // HF-360 (Part A): accumulate the serialized CSV byte size as the stream is consumed (one closure add per
  // row, no second pass) — the manifest's `bytes` for the staged pulse (audit + load progress). Byte-neutral
  // for the synchronous path (the value is simply ignored when not handing off).
  let csvByteCount = 0;
  const csvStream = committedRowsCsvStream(
    rows.length,
    (i) => {
      const line = committedRowToCsvLine(buildCommittedRow(rows[i], i) as unknown as CommittedRow);
      csvByteCount += Buffer.byteLength(line, 'utf8') + 1; // +1 for the trailing newline the stream emits
      return line;
    },
  );
  const { error: uploadErr } = await supabase.storage
    .from('ingestion-raw')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upload(csvPath, csvStream as any, { contentType: 'text/csv', upsert: true, duplex: 'half' } as any);
  if (uploadErr) return await failCommit(`commit CSV upload failed for "${tabName}": ${uploadErr.message}`);

  // HF-360 (Part A) — HAND-OFF: the CSV is STAGED. Do NOT call the FDW load RPC, do NOT delete the CSV (the
  // worker reads it), do NOT finalize the batch to 'completed' (the worker does, after it loads). The
  // function never spends the load duration — that is the whole point. Remediation CONSTRUCT already ran
  // while building this CSV (deterministic, no LLM — Decision 158), so emit its stage-run signal now; the
  // worker re-applies nothing. Return the manifest row the session enqueue records (totalInserted is 0 —
  // the rows are NOT in committed_data yet; the truthful surface reads the job for load progress).
  if (params.handOff) {
    await emitStageRunSignal(supabase, {
      tenantId,
      unitId: unit.contentUnitId,
      sheetName: tabName,
      agentsRun: remediation.report.agentsRun,
      columnsConsidered: allowedColumns.length,
      changeCount: remediation.report.changeCount,
      changesByColumn: remediation.report.changesByColumn,
      degradedAgents: remediation.report.degradedAgents,
    });
    return {
      batchId,
      totalInserted: 0,
      dataType,
      entityIdField,
      fieldIdentities,
      earliestDate,
      latestDate,
      dateCount,
      success: true,
      stagedPulse: {
        batchId,
        csvPath,
        expectedRows: rows.length,
        bytes: csvByteCount,
        unitId: unit.contentUnitId,
        sheetName: tabName,
      },
    };
  }

  // ONE bulk load — the DB reads the CSV from Storage via the FDW and inserts under p_tenant_id (I4: the
  // inserted tenant is the PARAMETER, never the CSV's value). Returns the row count it loaded.
  const { data: loadedCount, error: rpcErr } = await supabase.rpc('bulk_commit_from_storage', {
    p_tenant_id: tenantId,
    p_csv_path: csvPath,
    p_import_batch_id: batchId,
  });
  if (rpcErr) return await failCommit(`bulk_commit_from_storage failed for "${tabName}": ${rpcErr.message}`);
  const totalInserted = Number(loadedCount ?? 0);

  // HALT-DATA-LOSS (data loss is never acceptable): the DB must have loaded EXACTLY the rows written.
  if (totalInserted !== rows.length) {
    return await failCommit(`HALT-DATA-LOSS: loaded ${totalInserted} of ${rows.length} rows for "${tabName}" via S3-FDW.`);
  }

  // OB-203 §2/§5: the single bulk load is one PULSE (the panels' pulse/row numbers move with this write).
  ob203Trace('pulse', { unit: unit.contentUnitId, sheet: tabName, pulse: 1, ofTotal: 1, rows: totalInserted });
  await accumulateUnitCommitFields({
    tenantId,
    importSessionId: proposalId,
    unitId: unit.contentUnitId,
    fields: { rowsCommitted: totalInserted, pulsesLanded: pulseBase.landed + 1 },
  }, supabase);

  // HF-356: the CSV was a transient transport artifact — the rows are now in committed_data, so remove it
  // (best-effort; a retry re-uploads via upsert, so leaving it on a delete-failure is harmless). Keeps the
  // ingestion-raw bucket from accumulating one load file per batch.
  try {
    await supabase.storage.from('ingestion-raw').remove([csvPath]);
  } catch (err) {
    console.warn(`[commitContentUnit] commit CSV cleanup @${csvPath} failed (non-blocking):`, err instanceof Error ? err.message : err);
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

  // OB-249 (P8): per-unit stage-run marker on the canonical signal surface — emitted after a
  // successful commit, even on a zero-change (clean) import, so "the stage ran on this data" is
  // query-provable, not merely asserted. Non-throwing.
  await emitStageRunSignal(supabase, {
    tenantId,
    unitId: unit.contentUnitId,
    sheetName: tabName,
    agentsRun: remediation.report.agentsRun,
    columnsConsidered: allowedColumns.length,
    changeCount: remediation.report.changeCount,
    changesByColumn: remediation.report.changesByColumn,
    degradedAgents: remediation.report.degradedAgents,
  });

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
