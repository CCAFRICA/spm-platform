/**
 * DS-009 Layer 3: Entity Resolution — Derived, Not Routed
 *
 * Scans ALL committed_data for a tenant to discover person identifiers
 * from field identities. Creates/updates entities table. Backfills entity_id.
 *
 * Called AFTER all SCI content units complete (post-import), not per-unit.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
import { hiddenBatchIdsForTenant, applyCommittedDataVisibility } from '@/lib/sci/committed-data-visibility';

// HF-110: Guard against row index misidentification
// If most values are sequential small integers (0,1,2... or 1,2,3...), it's likely row indices
// HF-370 (O2): exported so processEntityUnit guards its untrusted heuristic-binding fallback with the
// SAME row-index test the entity-resolution path already uses (a `#` column can't spawn entities).
export function looksLikeRowIndex(values: string[]): boolean {
  if (values.length < 3) return false;
  const nums: number[] = [];
  for (const v of values) {
    const n = parseInt(v, 10);
    if (!isNaN(n) && String(n) === v.trim()) nums.push(n);
  }
  if (nums.length < values.length * 0.8) return false;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[0] <= 1 && sorted[sorted.length - 1] <= sorted.length + 1;
}

// HF-372 Phase C (registry subtraction): the OB-231 prose regexes are DELETED. Each predicate
// reads the field identity's BARE primitives (natureRole/scopeRole — the model's own named
// primitives, persisted since HF-368/HF-372) by EQUALITY against the fixed structural set.
// A legacy field identity without bare primitives reads as NO SIGNAL (loud abstention at the
// consumer — never a prose word-list read, never a silent default guess).
type BareFieldIdentity = { natureRole?: string; scopeRole?: string } | null | undefined;
function natureIsName(fi: BareFieldIdentity): boolean {
  return fi?.natureRole === 'name';
}
function natureIsIdentifier(fi: BareFieldIdentity): boolean {
  return fi?.natureRole === 'identifier' && fi?.scopeRole !== 'reference';
}
function natureIsReferenceKey(fi: BareFieldIdentity): boolean {
  return fi?.natureRole === 'identifier' && fi?.scopeRole === 'reference';
}
function natureIsAttribute(fi: BareFieldIdentity): boolean {
  return fi?.natureRole === 'categorical';
}
// Loud legacy detection: field_identities exist but none carries a bare primitive (a pre-HF-368
// import). Fallbacks ABSTAIN (idColumn stays null → calc-time resolution); re-import restores.
function warnLegacyFieldIdentities(batchId: string, fieldIds: Record<string, { natureRole?: string }> | undefined): boolean {
  if (!fieldIds || Object.keys(fieldIds).length === 0) return false;
  const legacy = Object.values(fieldIds).every(fi => !fi?.natureRole);
  if (legacy) {
    console.error(`[entity-resolution] HF-372: batch ${batchId} field_identities carry NO bare primitives (legacy import) — nature-based fallbacks ABSTAIN (no prose word-list read); re-import self-heals`);
  }
  return legacy;
}

// HF-341 R7 (D1): value-overlap entity-key reconciliation. An entity is identified
// by ONE value-domain per tenant — the value-domain the transactions reference (the
// plan's declared identity, routed by VALUE). An entity/roster batch whose recorded
// key column does NOT overlap that domain (a roster keyed by a NAME because the
// per-sheet recognition favored the prominent person column) but which HAS a column
// that DOES overlap (its DNI) is re-keyed to the overlapping column — so the roster's
// people resolve to the SAME external_ids as the transactions instead of minting a
// private name namespace (the 34 name-entities + 34 DNI-entities = 68 defect).
// Korean Test: pure set-overlap of row VALUES — no column names, no nature reading,
// no accent-folding. GUARDED: switches ONLY when the current key has near-zero
// overlap and another column has substantial overlap, so a tenant whose roster key
// already overlaps the transaction domain (BCL/Meridian) is byte-identical.
type BatchKeyInfo = { idColumn: string; nameColumn: string | null; attributeColumns: string[]; isEventUnit: boolean };
export async function reconcileEntityKeysByValueOverlap(
  supabase: SupabaseClient,
  tenantId: string,
  batchIdentifiers: Map<string, BatchKeyInfo>,
  readBatchRows?: (batchId: string) => Promise<Array<Record<string, unknown>>>,
): Promise<Array<{ batchId: string; from: string; to: string; fromOverlap: number; toOverlap: number }>> {
  const OVERLAP_MIN = 0.5;
  // A re-key target must be ~1:1 with the roster's rows — a true per-entity IDENTIFIER
  // (a DNI, one distinct value per person), NOT a many:1 GROUPING dimension (a branch /
  // Sucursal_ID, few distinct values shared across many people). Without this, a roster
  // correctly keyed by its employee id (ID_Empleado) whose values happen not to overlap
  // the transaction key would be wrongly re-keyed to a high-overlap branch column,
  // COLLAPSING distinct employees into branch-entities (the BCL HALT-CALC hazard).
  const UNIQUE_MIN = 0.9;
  const SAMPLE_CAP = 3000;
  const reader = readBatchRows ?? (async (batchId: string) => {
    const rows: Array<Record<string, unknown>> = [];
    let off = 0;
    while (rows.length < SAMPLE_CAP) {
      const { data } = await supabase.from('committed_data').select('row_data')
        .eq('tenant_id', tenantId).eq('import_batch_id', batchId).range(off, off + 999);
      if (!data || data.length === 0) break;
      for (const r of data) rows.push((r.row_data ?? {}) as Record<string, unknown>);
      if (data.length < 1000) break;
      off += 1000;
    }
    return rows;
  });

  const batchRows = new Map<string, Array<Record<string, unknown>>>();
  for (const batchId of Array.from(batchIdentifiers.keys())) batchRows.set(batchId, await reader(batchId));

  // canonical identity domain = the values event/transaction batches REFERENCE (their idColumn)
  const canonical = new Set<string>();
  for (const [batchId, info] of Array.from(batchIdentifiers.entries())) {
    if (!info.isEventUnit) continue;
    for (const rd of batchRows.get(batchId) ?? []) { const v = rd[info.idColumn]; if (v != null && String(v).trim()) canonical.add(String(v).trim()); }
  }
  const switches: Array<{ batchId: string; from: string; to: string; fromOverlap: number; toOverlap: number }> = [];
  if (canonical.size === 0) return switches; // no transaction-anchored identity domain → nothing to reconcile

  const overlapFrac = (vals: Set<string>): number => {
    if (vals.size === 0) return 0;
    let hit = 0; for (const v of Array.from(vals)) if (canonical.has(v)) hit++;
    return hit / vals.size;
  };
  for (const [batchId, info] of Array.from(batchIdentifiers.entries())) {
    if (info.isEventUnit) continue; // only re-key entity/roster batches (events already key by the reference)
    const rows = batchRows.get(batchId) ?? [];
    if (rows.length === 0) continue;
    const valsOf = (col: string): Set<string> => {
      const s = new Set<string>();
      for (const rd of rows) { const v = rd[col]; if (v != null && String(v).trim()) s.add(String(v).trim()); }
      return s;
    };
    const curOverlap = overlapFrac(valsOf(info.idColumn));
    if (curOverlap >= OVERLAP_MIN) continue; // current key already overlaps the identity domain → leave it (BCL/Meridian)
    const cols = new Set<string>();
    for (const rd of rows.slice(0, 50)) for (const k of Object.keys(rd)) if (!k.startsWith('_')) cols.add(k);
    let best: { col: string; frac: number } | null = null;
    for (const col of Array.from(cols)) {
      if (col === info.idColumn) continue;
      const vals = valsOf(col);
      // skip GROUPING dimensions — a re-key target must be a near-1:1 per-row identifier,
      // not a many:1 column whose values would collapse distinct roster entities together.
      const uniqueness = rows.length > 0 ? vals.size / rows.length : 0;
      if (uniqueness < UNIQUE_MIN) continue;
      const frac = overlapFrac(vals);
      if (!best || frac > best.frac) best = { col, frac };
    }
    if (best && best.frac >= OVERLAP_MIN && best.frac > curOverlap) {
      console.log(`[Entity Resolution] HF-341 R7 D1: batch ${batchId} entity-key '${info.idColumn}' (overlap ${(curOverlap * 100).toFixed(0)}% with the transaction identity domain) → re-keyed to '${best.col}' (overlap ${(best.frac * 100).toFixed(0)}%); the roster's people now resolve to the same external_ids as the transactions.`);
      switches.push({ batchId, from: info.idColumn, to: best.col, fromOverlap: curOverlap, toOverlap: best.frac });
      info.idColumn = best.col;
    }
  }
  return switches;
}

export async function resolveEntitiesFromCommittedData(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ created: number; updated: number; linked: number }> {

  // Step 1: Discover which batches have person identifier columns
  // Priority: entity batches first, then transaction/target, then reference
  // HF-199 D3: also discover attribute columns per batch for entities.materializedState projection
  const batchIdentifiers = new Map<string, { idColumn: string; nameColumn: string | null; attributeColumns: string[]; isEventUnit: boolean }>();
  const batchLabels = new Map<string, string>(); // batchId -> informational_label
  // HF-263 (corrected, Decision 111): batchId -> the structuralType (free-form data_nature) of the
  // column that produced this batch's external_ids (its idColumn). An identifier-natured column =>
  // individual; a reference-key-natured column => a grouping entity (location). Import-order
  // independent — HC characterizes the column the same way regardless of what was imported before.
  // Korean Test: read the column's free-form data_nature only, no column names.
  const batchIdStructType = new Map<string, string>();
  const BATCH_SIZE = 200;

  const seenBatches = new Set<string>();

  // OB-203 D16.1: never discover/bind entities from a non-completed (processing/failed) batch's partial
  // rows. Gating the tenant-wide discovery read keeps hidden batches out of batchIdentifiers entirely, so
  // the per-batch reads + entity_id backfill below never touch them. No-op when none are hidden.
  const hiddenBatchIds = await hiddenBatchIdsForTenant(supabase, tenantId);

  // Scan committed_data metadata for identifier columns
  // Read one row per batch to get metadata (dedup by import_batch_id)
  let offset = 0;
  while (true) {
    let dq = supabase
      .from('committed_data')
      .select('import_batch_id, metadata, data_type')
      .eq('tenant_id', tenantId)
      .range(offset, offset + 999);
    dq = applyCommittedDataVisibility(dq, hiddenBatchIds);
    const { data: rows } = await dq;

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const batchId = row.import_batch_id as string | null;
      if (!batchId || seenBatches.has(batchId)) continue;
      seenBatches.add(batchId);

      // HF-341 R5 (PG-R5-1): the idColumn FALLBACK reads the LLM's EXPRESSION, not the data_type label.
      // A unit that carries a reference-key-natured column is REFERENCING entities — discover entities
      // from that reference key (the entity pointer), never from a per-row identifier (an event id). A
      // unit with NO reference key discovers from its identifier (the identifier IS the entity). The prior
      // `data_type === 'transaction' || 'target'` gate is removed — committed_data.data_type is inert
      // provenance here; the reference-key nature in field_identities is the carried-reality signal.
      const meta = row.metadata as Record<string, unknown> | null;
      if (!meta) continue;
      const fieldIdsForScope = meta.field_identities as Record<string, { structuralType?: string; natureRole?: string; scopeRole?: string }> | undefined;
      const isEventUnit = fieldIdsForScope
        ? Object.values(fieldIdsForScope).some(fi => natureIsReferenceKey(fi))
        : false;

      const label = (meta.informational_label as string) || '';
      batchLabels.set(batchId, label);

      let idColumn: string | null = null;
      let nameColumn: string | null = null;

      // HF-196 Phase 1B (HF-110 Fix C pattern extended): metadata.entity_id_field
      // is the SCI agent's already-recorded choice (set by processEntityUnit/processDataUnit
      // during import). When present, honor it directly — it is the authoritative
      // selection, downstream of HF-186-aware role assignment. Falling back to
      // field_identities re-derivation here was the regression that caused the
      // 11/85 collapse on the BCL roster (resolver picked Sucursal_ID via no-break
      // last-match-wins over field_identities; SCI agent had correctly chosen
      // ID_Empleado but resolver ignored it).
      const recordedIdField = (meta.entity_id_field as string | null | undefined) ?? null;
      if (recordedIdField && typeof recordedIdField === 'string' && recordedIdField.length > 0) {
        idColumn = recordedIdField;
      }

      // Primary fallback: field_identities (DS-009)
      const fieldIds = meta.field_identities as Record<string, {
        structuralType?: string;
        contextualIdentity?: string;
        natureRole?: string;
        scopeRole?: string;
      }> | undefined;
      const legacyFieldIds = warnLegacyFieldIdentities(batchId, fieldIds);

      if (fieldIds && Object.keys(fieldIds).length > 0) {
        // HF-263 (corrected): Korean Test — select by the column's free-form data_nature ONLY. The
        // prior `contextualIdentity.toLowerCase().includes('person')` content-matching (on both the
        // identifier and name selection) was a hardcoded-vocabulary violation and is removed.
        // entity_id_field (above) remains the authoritative override; these are first-match
        // structural fallbacks.
        // Name: first name-natured column (OB-231: tolerant read of the free-form data_nature)
        if (!nameColumn && !legacyFieldIds) {
          for (const [colName, fi] of Object.entries(fieldIds)) {
            if (natureIsName(fi)) {
              nameColumn = colName;
              break;
            }
          }
        }
        // Fallback within field_identities. HF-268 A2: an event unit (transaction/target) must
        // discover entities from its reference_key (the entity pointer), NEVER its identifier (the
        // event ID — keying on it created 170 phantom entities from CRP transaction_ids). When no
        // reference_key is present, idColumn stays null → no entities (calc-time resolution, OB-183).
        // Entity/reference units keep identifier-based discovery (the identifier IS the entity).
        if (!idColumn) {
          // OB-231: select by the column's free-form data_nature. An event unit discovers from a
          // reference-key-natured column; an entity/reference unit discovers from an identifier-natured one.
          const matchesFallback = isEventUnit ? natureIsReferenceKey : natureIsIdentifier;
          for (const [colName, fi] of Object.entries(fieldIds)) {
            if (!legacyFieldIds && matchesFallback(fi)) {
              idColumn = colName;
              break;
            }
          }
        }
      }

      // HF-110 Fix C: Fallback to semantic_roles when field_identities absent or has no person identifier
      if (!idColumn) {
        const semanticRoles = meta.semantic_roles as Record<string, { role?: string }> | undefined;
        if (semanticRoles) {
          // HF-268 A2: do not let an event unit (transaction/target) fall back to its
          // entity_identifier semantic role either — that is the event ID, not an entity.
          for (const [colName, sr] of Object.entries(semanticRoles)) {
            if (sr.role === 'entity_identifier' && !idColumn && !isEventUnit) idColumn = colName;
            if (sr.role === 'entity_name' && !nameColumn) nameColumn = colName;
          }
        }
      }

      if (idColumn) {
        // HF-263 (corrected): record the idColumn's structuralType (free-form data_nature, from
        // field_identities) so the external_ids it produces inherit it for Decision-111 entity typing.
        // Works even when idColumn was chosen via entity_id_field or semantic_roles, as long as
        // field_identities carries the column (Meridian reference batch: idColumn=Hub via
        // semantic_roles, but field_identities[Hub].structuralType reads as a reference-key nature).
        const idFi = fieldIds?.[idColumn];
        // HF-372 Phase C: record the BARE key kind (equality on the model's primitives), never prose.
        if (natureIsIdentifier(idFi)) batchIdStructType.set(batchId, 'identifier');
        else if (natureIsReferenceKey(idFi)) batchIdStructType.set(batchId, 'reference_key');

        // HF-199 D3: discover attribute columns from field_identities (Korean Test compliant —
        // reads each column's free-form data_nature only; no language-specific column-name matching).
        // Only entity-typed batches (Plantilla / roster) carry attribute projections — exclude
        // identifier/name (already used for entity identity) and exclude HF-199 entity-batch-only
        // restriction is implicit because we only project from rows of label='entity' batches below.
        const attributeColumns: string[] = [];
        if (fieldIds && Object.keys(fieldIds).length > 0) {
          for (const [colName, fi] of Object.entries(fieldIds)) {
            if (natureIsAttribute(fi)) {
              attributeColumns.push(colName);
            }
          }
        }
        batchIdentifiers.set(batchId, { idColumn, nameColumn, attributeColumns, isEventUnit });
      }
    }

    if (rows.length < 1000) break;
    offset += 1000;
  }

  if (batchIdentifiers.size === 0) return { created: 0, updated: 0, linked: 0 };

  // HF-341 R7 (D1): before discovery, re-key any entity/roster batch whose key column
  // does not overlap the transaction identity value-domain to the column that does
  // (the roster's DNI over its name) — so the roster's people resolve to the same
  // external_ids as the transactions (eliminates the name-namespace duplicate set).
  // No-op (byte-identical) when the roster key already overlaps (BCL/Meridian).
  const keySwitches = await reconcileEntityKeysByValueOverlap(supabase, tenantId, batchIdentifiers);

  // HF-117: Use ALL batches with identifier columns for entity discovery.
  // The field_identities metadata (from HC/DS-009) marks which columns are
  // entity identifiers — that structural signal is sufficient. The SCI
  // informational_label is unreliable for roster/entity sheets that may be
  // classified as 'reference'. Existing guards (looksLikeRowIndex, dedup)
  // prevent spurious entities from non-person identifier columns.
  const discoveryBatchIds = Array.from(batchIdentifiers.keys());

  // Step 2: Scan committed_data for unique entity identifiers
  const allEntities = new Map<string, string>(); // external_id -> display_name
  // HF-199 D3: per-entity attribute projection. Map external_id → { attrCol → value }.
  // Populated from rows whose batch is data_type='entity' (Plantilla / roster sheets).
  // Iterates field_identities-marked attribute columns only — no language-specific
  // column-name matching. Korean Test compliant.
  const entityAttributes = new Map<string, Record<string, unknown>>();
  // HF-263 (corrected): external_id -> set of structuralType (free-form data_nature) strings of the
  // idColumns that produced it. An identifier-natured source => individual (a real person id wins);
  // else a reference-key-natured source => grouping (location).
  const extIdStructTypes = new Map<string, Set<string>>();
  // OB-203 Phase 6 (D3): external_ids that ORIGINATE from an entity-DEFINING batch (entity / reference
  // — NOT a transaction/target event unit). A transaction's reference_key LINKS to existing entities;
  // it must never FABRICATE them. This is the contextual-role resolution at the consumption layer:
  // Codigo_Turno (a transaction reference_key over shift codes that define no entity) created 8
  // spurious 'location' entities; gating creation to entity-defining origins suppresses that while a
  // real foreign key (its entities pre-created by the roster) still links unchanged.
  const definedByEntityDefiningBatch = new Set<string>();

  for (const batchId of discoveryBatchIds) {
    const { idColumn, nameColumn, attributeColumns, isEventUnit } = batchIdentifiers.get(batchId)!;
    const isEntityBatch = batchLabels.get(batchId) === 'entity';
    let batchOffset = 0;
    const sampleValues: string[] = [];

    while (true) {
      const { data: rows } = await supabase
        .from('committed_data')
        .select('row_data')
        .eq('tenant_id', tenantId)
        .eq('import_batch_id', batchId)
        .range(batchOffset, batchOffset + 999);

      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const rd = row.row_data as Record<string, unknown>;
        const extId = String(rd[idColumn] ?? '').trim();
        if (!extId) continue;
        if (!isEventUnit) definedByEntityDefiningBatch.add(extId);   // D3: only entity-defining batches define entities
        if (sampleValues.length < 50) sampleValues.push(extId);
        const name = nameColumn ? String(rd[nameColumn] ?? extId).trim() : extId;
        if (!allEntities.has(extId)) {
          allEntities.set(extId, name);
        }

        // HF-263 (corrected): record the structuralType of the idColumn that produced this
        // external_id, for Decision-111 entity typing at creation below.
        const idStruct = batchIdStructType.get(batchId);
        if (idStruct) {
          let sts = extIdStructTypes.get(extId);
          if (!sts) { sts = new Set<string>(); extIdStructTypes.set(extId, sts); }
          sts.add(idStruct);
        }

        // HF-199 D3: project attribute columns from entity-typed batches only.
        // For each attribute column flagged by HC (attribute-natured data_nature),
        // capture row's value. Stored per external_id; later written to
        // entities.temporal_attributes (calc-time materialization surface).
        if (isEntityBatch && attributeColumns.length > 0) {
          const existing = entityAttributes.get(extId) ?? {};
          for (const col of attributeColumns) {
            const val = rd[col];
            if (val != null && val !== '' && existing[col] == null) {
              existing[col] = val;
            }
          }
          if (Object.keys(existing).length > 0) {
            entityAttributes.set(extId, existing);
          }
        }
      }

      if (rows.length < 1000) break;
      batchOffset += 1000;
    }

    // HF-110: Guard against row index misidentification
    if (looksLikeRowIndex(sampleValues)) {
      console.log(`[Entity Resolution] Skipping batch ${batchId}: identifier column ${idColumn} looks like row indices`);
      // Remove entities that came from this batch
      for (const val of sampleValues) {
        allEntities.delete(val);
        entityAttributes.delete(val); // HF-199 D3: also drop spurious attribute projections
        extIdStructTypes.delete(val);   // HF-263: drop provenance tracking for skipped ids
      }
    }
  }

  if (allEntities.size === 0) return { created: 0, updated: 0, linked: 0 };

  // Step 3: Dedup against existing entities
  const existingMap = new Map<string, string>();
  const allExtIds = Array.from(allEntities.keys());
  for (let i = 0; i < allExtIds.length; i += BATCH_SIZE) {
    const slice = allExtIds.slice(i, i + BATCH_SIZE);
    const { data: existing } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .in('external_id', slice);

    if (existing) {
      for (const e of existing) {
        if (e.external_id) existingMap.set(e.external_id, e.id);
      }
    }
  }

  // Step 4: Create new entities (HF-199 D3: include attribute projections in temporal_attributes)
  const importDate = new Date().toISOString().split('T')[0];
  const buildTemporalAttrs = (extId: string): Array<{ key: string; value: unknown; effective_from: string; effective_to: null }> => {
    const attrs = entityAttributes.get(extId);
    if (!attrs) return [];
    return Object.entries(attrs).map(([key, value]) => ({
      key,
      value,
      effective_from: importDate,
      effective_to: null,
    }));
  };

  const newEntities: Array<{
    tenant_id: string;
    external_id: string;
    display_name: string;
    entity_type: string;
    status: string;
    temporal_attributes: unknown[];
    metadata: Record<string, unknown>;
  }> = [];

  let suppressedSpurious = 0;
  for (const [extId, name] of Array.from(allEntities.entries())) {
    if (!existingMap.has(extId)) {
      // OB-203 Phase 6 (D3): an external_id that exists in NO entity yet and originates ONLY from a
      // transaction/target reference_key is a categorical dimension, not a foreign key — do not
      // fabricate an entity for it. (A real FK's entities were created by the roster → in existingMap.)
      if (!definedByEntityDefiningBatch.has(extId)) { suppressedSpurious++; continue; }
      // HF-263 (CPI Phase 1, corrected — Decision 111): entity_type derives from the data_nature
      // of the idColumn(s) that produced this external_id. A real person identifier wins (always an
      // 'individual'); otherwise an id discovered as reference-key-natured is a grouping entity →
      // 'location'. Anything else (or no field_identity) defaults to 'individual'. Import-order
      // independent (HC characterizes the column stably). Korean Test: read the free-form data_nature
      // ONLY — never the entity name, external_id format, or contextualIdentity string content.
      // OB-231: the set now holds free-form data_nature strings, so test membership tolerantly.
      const structTypes = extIdStructTypes.get(extId);
      const natures = structTypes ? Array.from(structTypes) : [];
      // HF-372 Phase C: the set holds bare key-kind tokens recorded above ('identifier' /
      // 'reference_key') — fixed-set equality, never prose.
      const entityType = natures.includes('identifier')
        ? 'individual'
        : natures.includes('reference_key')
          ? 'location'
          : 'individual';
      newEntities.push({
        tenant_id: tenantId,
        external_id: extId,
        display_name: name,
        entity_type: entityType,
        status: 'active',
        // HF-199 D3: temporal_attributes populated from field_identities-marked attribute
        // columns. Each attribute becomes a temporal record { key, value, effective_from,
        // effective_to } per the calc-time materialization surface (run/route.ts:1308-1326).
        // Korean Test: keys are column names from HC; no language-specific filtering.
        temporal_attributes: buildTemporalAttrs(extId),
        metadata: {},
      });
    }
  }

  let created = 0;
  if (newEntities.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < newEntities.length; i += CHUNK) {
      const chunk = newEntities.slice(i, i + CHUNK);
      // HF-371 (Root 1): UPSERT, not INSERT. A concurrent finalize pass (the sync-path double-fire) may
      // create the SAME entity between this pass's existing-entity read and its write; a plain insert then
      // conflicts on the unique (tenant_id, external_id), errors, breaks the loop, and this pass links
      // FEWER rows (the observed 425↔0 swing). onConflict do-nothing makes concurrent creation race-safe —
      // both passes converge on the same entity set. (The finalize claim already coalesces to one pass;
      // this is the belt-and-suspenders so the outcome is deterministic even under a stale-takeover race.)
      const { error } = await supabase.from('entities').upsert(chunk, { onConflict: 'tenant_id,external_id', ignoreDuplicates: true });
      if (error) {
        console.error('[Entity Resolution] Upsert failed:', error);
        break;
      }
      created += chunk.length;
    }
  }

  // Step 4.5 (HF-199 D3): Update EXISTING entities with attribute projections.
  // Idempotent merge: for each existing entity that has attribute values from
  // this run, fetch current temporal_attributes, merge new attribute values
  // (close prior records on value change; add new for unseen keys; idempotent
  // for unchanged values). Per OB-177 pattern at processEntityUnit:461-509.
  let updated = 0;
  for (const [extId, attrs] of Array.from(entityAttributes.entries())) {
    const entityId = existingMap.get(extId);
    if (!entityId) continue; // newly-created entities already include attrs in INSERT
    if (!attrs || Object.keys(attrs).length === 0) continue;

    const { data: current } = await supabase
      .from('entities')
      .select('temporal_attributes')
      .eq('id', entityId)
      .single();

    const existingAttrs = (current?.temporal_attributes || []) as Array<{ key: string; value: unknown; effective_from: string; effective_to: string | null }>;
    const newAttrs = [...existingAttrs];
    let changed = false;

    for (const [key, value] of Object.entries(attrs)) {
      const existingOpen = newAttrs.find(a => a.key === key && a.effective_to === null);
      if (existingOpen && existingOpen.value === value) continue; // idempotent
      if (existingOpen) {
        // Close prior open record on value change
        existingOpen.effective_to = importDate;
      }
      newAttrs.push({ key, value, effective_from: importDate, effective_to: null });
      changed = true;
    }

    if (changed) {
      await supabase
        .from('entities')
        .update({ temporal_attributes: newAttrs as unknown as Json })
        .eq('id', entityId);
      updated++;
    }
  }
  if (updated > 0) {
    console.log(`[Entity Resolution] HF-199 D3: ${updated} existing entities enriched with attribute projections`);
  }

  // Step 5: Re-fetch full entity lookup (including newly created)
  const entityLookup = new Map<string, string>();
  for (let i = 0; i < allExtIds.length; i += BATCH_SIZE) {
    const slice = allExtIds.slice(i, i + BATCH_SIZE);
    const { data: ents } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .in('external_id', slice);
    if (ents) {
      for (const e of ents) {
        if (e.external_id) entityLookup.set(e.external_id, e.id);
      }
    }
  }

  // Step 6: Backfill entity_id on ALL committed_data rows across ALL batches
  // (not just discovery batches — transaction/target batches also need entity_id)
  let linked = 0;
  for (const [batchId, { idColumn }] of Array.from(batchIdentifiers.entries())) {
    while (true) {
      const { data: unlinkeds } = await supabase
        .from('committed_data')
        .select('id, row_data')
        .eq('tenant_id', tenantId)
        .eq('import_batch_id', batchId)
        .is('entity_id', null)
        .limit(500);

      if (!unlinkeds || unlinkeds.length === 0) break;

      const updatesByEntityUuid = new Map<string, string[]>();
      for (const row of unlinkeds) {
        const rd = row.row_data as Record<string, unknown>;
        const extId = String(rd[idColumn] ?? '').trim();
        const entityUuid = entityLookup.get(extId);
        if (entityUuid) {
          if (!updatesByEntityUuid.has(entityUuid)) updatesByEntityUuid.set(entityUuid, []);
          updatesByEntityUuid.get(entityUuid)!.push(row.id);
        }
      }

      let linkedThisPage = 0;
      for (const [entityUuid, rowIds] of Array.from(updatesByEntityUuid.entries())) {
        for (let i = 0; i < rowIds.length; i += BATCH_SIZE) {
          const chunk = rowIds.slice(i, i + BATCH_SIZE);
          await supabase
            .from('committed_data')
            .update({ entity_id: entityUuid })
            .in('id', chunk);
          linkedThisPage += chunk.length;
        }
      }
      linked += linkedThisPage;

      if (unlinkeds.length < 500) break;
    }
  }

  // Step 7 (HF-341 R7 D1): purge the now-orphaned entities minted under a re-keyed
  // batch's OLD key (the roster's name-keyed entities, superseded by the DNI key after
  // value-overlap re-keying + backfill). Only entities with ZERO committed_data
  // references (genuinely orphaned post-backfill) are removed, and ONLY for re-keyed
  // batches — so a tenant that never re-keyed (BCL/Meridian) deletes nothing. This is
  // what makes the entity count collapse (68 → 34) instead of leaving the duplicate set.
  let purged = 0;
  for (const sw of keySwitches) {
    const oldVals = new Set<string>();
    let off = 0;
    while (true) {
      const { data } = await supabase.from('committed_data').select('row_data')
        .eq('tenant_id', tenantId).eq('import_batch_id', sw.batchId).range(off, off + 999);
      if (!data || data.length === 0) break;
      for (const r of data) { const v = (r.row_data as Record<string, unknown> | null)?.[sw.from]; if (v != null && String(v).trim()) oldVals.add(String(v).trim()); }
      if (data.length < 1000) break;
      off += 1000;
    }
    const oldList = Array.from(oldVals);
    for (let i = 0; i < oldList.length; i += BATCH_SIZE) {
      const slice = oldList.slice(i, i + BATCH_SIZE);
      const { data: ents } = await supabase.from('entities').select('id, external_id').eq('tenant_id', tenantId).in('external_id', slice);
      for (const e of ents ?? []) {
        // orphan signal: no committed_data row references this entity after the re-key/backfill.
        const { count: cdRefs } = await supabase.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('entity_id', e.id);
        if ((cdRefs ?? 0) > 0) continue; // still referenced → a real entity, never delete
        const { error: delErr } = await supabase.from('entities').delete().eq('id', e.id);
        if (!delErr) purged++;
      }
    }
  }
  if (purged > 0) {
    console.log(`[Entity Resolution] HF-341 R7 D1: purged ${purged} orphaned old-key entity(ies) superseded by value-overlap re-keying (${keySwitches.map(s => `${s.from}→${s.to}`).join(', ')}).`);
  }

  console.log(`[Entity Resolution] DS-009 3.3: ${created} created, ${linked} rows linked across ${batchIdentifiers.size} batches${suppressedSpurious > 0 ? ` · ${suppressedSpurious} spurious entity(ies) suppressed (D3: non-FK reference_key)` : ''}`);

  return { created, updated: 0, linked };
}
