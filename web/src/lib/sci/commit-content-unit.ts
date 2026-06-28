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
import { ENTITY_SCOPE, TXN_SCOPE, IDENTIFIER_NATURE } from './scope-predicates';
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
// HF-341 R4: ENTITY_SCOPE / TXN_SCOPE / IDENTIFIER_NATURE moved to scope-predicates.ts (single source —
// the sheet classifier reads the identical scope surface; no duplicated regex registry). Imported at top.

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
    | { interpretations?: Record<string, { identifies?: string; data_nature?: string; characterization?: string; confidence?: number }> }
    | undefined;
  const interpretations = hcData?.interpretations;
  if (!interpretations) return [];
  const candidates: string[] = [];
  for (const [colName, interp] of Object.entries(interpretations)) {
    const conf = typeof interp.confidence === 'number' ? interp.confidence : 0;
    if (conf < HC_IDENTIFIER_THRESHOLD) continue;
    const scope = `${interp.identifies ?? ''}`;
    const natureText = `${interp.data_nature ?? ''} ${interp.characterization ?? ''}`;
    // Entity-scope identifier only. A transaction-scope id (folio/receipt) is never the entity key.
    if (ENTITY_SCOPE.test(scope) && !TXN_SCOPE.test(scope) && IDENTIFIER_NATURE.test(natureText)) {
      candidates.push(colName);
    }
  }
  return candidates;
}

/**
 * Backward-compatible single-result accessor (execute-bulk gate, HF-285-A). Returns
 * the FIRST entity-scope identifier — the entity-id for the single-candidate case
 * (BCL/Meridian — byte-identical). Multi-candidate disambiguation happens at commit
 * time via selectEntityIdFieldByOverlap (value-domain overlap), not here.
 */
export function findHcEntityIdColumn(
  classificationTrace: Record<string, unknown> | undefined,
): string | null {
  return findHcEntityIdCandidates(classificationTrace)[0] ?? null;
}

/** R7 D1 thresholds (entity-resolution.ts:58-135) reused for the commit-time tie-break. */
const F5_OVERLAP_MIN = 0.5;

/**
 * HF-351 F5 (THE CLASS FIX): select the entity_id_field among ≥2 entity-scope
 * identifier candidates by VALUE-DOMAIN OVERLAP against the tenant's entity domain,
 * never by emission order / confidence (the deleted first-match). Korean Test: ranks
 * by the columns' VALUES only — no column-name matching.
 *
 *  (a) entity domain non-empty → the candidate whose row values most overlap the
 *      existing entity external_ids wins (a branch/grouping column like `sucursal`
 *      has ~0% overlap and loses to the real seller id — proven on MIR: DNI 100%
 *      vs Almacen 0%, though Almacen out-REPEATS DNI, defeating cardinality alone).
 *  (b) cold start (empty domain — the entity sheet not yet committed) → among the
 *      REPEATING candidates (a transaction sheet's entity id repeats), prefer the
 *      finest-grained one (most distinct values) — a coarse grouping dimension has
 *      far fewer distinct values than the entity it groups.
 *  (c) still ambiguous → C2: warn, name the competitors, fall back to first-match
 *      (never silently worse than the prior behavior). Decision 158 / Validation
 *      Premise Law: this VALIDATES the recognized candidates against carried reality.
 */
export function selectEntityIdFieldByOverlap(
  candidates: string[],
  rows: Array<Record<string, unknown>>,
  entityDomain: Set<string>,
): { chosen: string; reason: string } {
  if (candidates.length === 0) return { chosen: '', reason: 'no candidates' };
  if (candidates.length === 1) return { chosen: candidates[0], reason: 'single entity-scope identifier' };

  const stats = candidates.map(col => {
    const vals = new Set<string>();
    for (const r of rows) { const v = r[col]; if (v == null) continue; const s = String(v).trim(); if (s) vals.add(s); }
    let overlap = 0; for (const v of Array.from(vals)) if (entityDomain.has(v)) overlap++;
    const distinct = vals.size;
    return { col, distinct, overlapFrac: distinct > 0 ? overlap / distinct : 0, repeatRatio: distinct > 0 ? rows.length / distinct : 0 };
  });

  // (a) value-domain overlap (domain non-empty)
  if (entityDomain.size > 0) {
    const ranked = stats.slice().sort((a, b) => b.overlapFrac - a.overlapFrac || b.distinct - a.distinct);
    if (ranked[0].overlapFrac >= F5_OVERLAP_MIN && ranked[0].overlapFrac > (ranked[1]?.overlapFrac ?? 0)) {
      return { chosen: ranked[0].col, reason: `value-domain overlap ${(ranked[0].overlapFrac * 100).toFixed(0)}% (vs ${(ranked[1]?.overlapFrac * 100 || 0).toFixed(0)}%)` };
    }
  }
  // (b) cold start / no overlap winner → finest-grained repeating identifier
  const repeating = stats.filter(s => s.repeatRatio > 1.1);
  if (repeating.length > 0) {
    const ranked = repeating.slice().sort((a, b) => b.distinct - a.distinct);
    if (ranked.length === 1 || ranked[0].distinct > ranked[1].distinct) {
      return { chosen: ranked[0].col, reason: `cold-start finest repeating identifier (distinct=${ranked[0].distinct}, repeat=${ranked[0].repeatRatio.toFixed(1)}x)` };
    }
  }
  // (c) ambiguous → C2 fail-loud, first-match fallback
  console.warn(`[entity-id] HF-351 F5 C2: ${candidates.length} entity-scope identifiers competed and none was definitively selected — ${stats.map(s => `${s.col}(distinct=${s.distinct},overlap=${(s.overlapFrac * 100).toFixed(0)}%,repeat=${s.repeatRatio.toFixed(1)}x)`).join(', ')}. Falling back to first; flag for review.`);
  return { chosen: candidates[0], reason: 'ambiguous — first-match fallback (C2 flagged)' };
}

function resolveEntityIdField(
  bindings: SemanticBinding[],
  classificationTrace: Record<string, unknown> | undefined,
  classification: Exclude<AgentType, 'plan'>,
  rows: Array<Record<string, unknown>>,
  entityDomain: Set<string>,
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
  // HF-351 F5: collect ALL entity-scope identifier candidates. One candidate →
  // return it (BCL ID_Empleado, Meridian No_Empleado — byte-identical). Two or more
  // → disambiguate by VALUE-DOMAIN OVERLAP against the entity domain (never emission
  // order). Zero → fall back to the entity_identifier binding, then null.
  const candidates = findHcEntityIdCandidates(classificationTrace);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length >= 2) {
    const sel = selectEntityIdFieldByOverlap(candidates, rows, entityDomain);
    console.log(`[entity-id] HF-351 F5: ${candidates.length} entity-scope candidates [${candidates.join(', ')}] → "${sel.chosen}" (${sel.reason})`);
    return sel.chosen || null;
  }
  const binding = bindings.find(b => b.semanticRole === 'entity_identifier');
  return binding?.sourceField ?? null;
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
  const entityIdField = params.entityIdFieldOverride !== undefined
    ? params.entityIdFieldOverride
    : resolveEntityIdField(
        unit.confirmedBindings,
        unit.classificationTrace,
        classification,
        rows as Array<Record<string, unknown>>,
        entityDomain,
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

  // OB-152/OB-157 — source_date extraction with period marker composition.
  const dateColumnHint = findDateColumnFromBindings(unit.confirmedBindings);
  const semanticRolesMap = buildSemanticRolesMap(unit.confirmedBindings);
  const periodMarkerHint = detectPeriodMarkerColumns(rows);

  // Build committed_data rows. entity_id and period_id are always NULL at
  // import — engine binds them at calc time (OB-182, Decision 92).
  let earliestDate: string | null = null;
  let latestDate: string | null = null;
  let dateCount = 0;

  // HF-353 P-A (enterprise OOM): the per-row committed_data projection. PREVIOUSLY the
  // FULL payload (`const insertRows = rows.map(...)`) was materialized at once — a third
  // full copy of the parsed data (each row_data spreads all N columns), which on an
  // 86,608×87 ERP export drove ~2GB peak heap → Vercel OOM. The chunked INSERT loop below
  // already bounds the WRITES; now it also bounds MEMORY by building each chunk's payload
  // inline from a `rows.slice(...)` and dropping it after the insert (peak ≈ 2× parsed +
  // one chunk, independent of file size — SR-2). Byte-identical committed rows: the
  // projection (and its source_date side-effect into the outer accumulators) is unchanged;
  // only WHEN each row object is built moved from "all upfront" to "per chunk".
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
      metadata: {
        source,
        proposalId,
        semantic_roles: semanticRoles,
        resolved_data_type: dataType,
        entity_id_field: entityIdField,
        informational_label: classification,
        field_identities: fieldIdentities,
        // OB-249 (P8/P4): _stageRan stamped on EVERY committed row (even zero-change) so a clean
        // import that traversed the stage is provably distinct from a bypass; per-cell originals
        // retained alongside the committed canonical (Carry Everything, I3).
        remediation: {
          _stageRan: true,
          agents: remediation.report.agentsRun,
          ...(rowChanges ? { changes: rowChanges } : {}),
        },
      },
    };
  };

  // Chunked insert — per-source profile (sci-bulk retries; sci does not).
  let totalInserted = 0;
  const totalChunks = Math.ceil(rows.length / profile.chunkSize);
  let chunksCompleted = 0;

  for (let i = 0; i < rows.length; i += profile.chunkSize) {
    // HF-353 P-A: build THIS chunk's payload inline (never the whole array at once).
    const slice = rows.slice(i, i + profile.chunkSize).map((r, j) => buildCommittedRow(r, i + j));
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
      if (profile.pacingMs > 0 && i + profile.chunkSize < rows.length) {
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

  // HF-353 P-A (HALT-DATA-LOSS): chunked commitment must commit EXACTLY the parsed row
  // count. A failed chunk already triggers the unit-atomic rollback above; this invariant
  // catches any other shortfall (the directive forbids silent partial commits — data loss
  // is never acceptable). Belt-and-suspenders: on the happy path totalInserted === rows.length.
  if (totalInserted !== rows.length) {
    const reason = `HALT-DATA-LOSS: committed ${totalInserted} of ${rows.length} parsed rows for "${tabName}" — chunked commitment lost rows.`;
    console.error(`[commitContentUnit] ${reason}`);
    await supabase.from('committed_data').delete().eq('import_batch_id', batchId);
    await supabase.from('import_batches').update({
      status: 'failed',
      error_summary: { error: reason, hf: 'HF-353-DATA-LOSS' } as unknown as Json,
    }).eq('id', batchId);
    return { batchId, totalInserted: 0, dataType, entityIdField, fieldIdentities, earliestDate, latestDate, dateCount, success: false, error: reason };
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
