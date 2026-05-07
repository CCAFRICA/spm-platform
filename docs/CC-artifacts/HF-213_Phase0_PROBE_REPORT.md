# HF-213 Phase 0 — Read-Only Probe Report

**Branch:** `hf-213-atomic-supersession-resolver-closure`
**Baseline SHA:** `86c0477b1ae31edaeb57f95166cdc4d90d5b1e77`
**Date:** 2026-05-07

---

## Section 1 — Phase 0.1 Branch State Output

```
$ git checkout main && git pull origin main
Switched to branch 'main'
Your branch is up to date with 'origin/main'.
From https://github.com/CCAFRICA/spm-platform
 * branch              main       -> FETCH_HEAD
   46b464ad..86c0477b  main       -> origin/main
Updating 46b464ad..86c0477b
Fast-forward
 docs/completion-reports/HF-212_DIAGNOSTIC_LOG_SURFACE_COMPLETION_REPORT_20260507.md | 270 +++++
 web/src/app/api/calculation/run/route.ts                                            | 136 +++--
 web/src/lib/calculation/intent-executor.ts                                          |  20 +-
 3 files changed, 383 insertions(+), 43 deletions(-)
 create mode 100644 docs/completion-reports/HF-212_DIAGNOSTIC_LOG_SURFACE_COMPLETION_REPORT_20260507.md

$ git checkout -b hf-213-atomic-supersession-resolver-closure
Switched to a new branch 'hf-213-atomic-supersession-resolver-closure'

$ git rev-parse HEAD
86c0477b1ae31edaeb57f95166cdc4d90d5b1e77
```

---

## Section 2 — Phase 0.2 Schema Verification Output

`exec_sql` RPC unavailable (PGRST202). Used Supabase JS client `.from(table).select('*').limit(1)` to surface column shapes via response keys.

### `committed_data` columns (verbatim from Supabase response)

```json
["id","tenant_id","import_batch_id","entity_id","period_id","data_type","row_data","metadata","created_at","source_date"]
```

### `import_batches` columns (verbatim from Supabase response)

```json
["id","tenant_id","file_name","file_type","row_count","status","error_summary","uploaded_by","created_at","completed_at","metadata","superseded_by","supersedes","superseded_at","supersession_reason","file_hash_sha256"]
```

---

## Section 3 — Phase 0.3 calc-time-entity-resolution.ts (verbatim, line-numbered)

`web/src/lib/sci/calc-time-entity-resolution.ts` — 134 lines.

```typescript
  1: /**
  2:  * HF-196 Phase 2: Calc-time entity resolution.
  3:  *
  4:  * Implements the calc-time entity binding architecture per Decision 92
  5:  * (Calculation Sovereignty / IGF-T1-E904) and OB-182's stated intent:
  6:  * "engine resolves at calc time." The calc-side replacement for the
  7:  * post-import back-link work that OB-182 removed.
  8:  *
  9:  * Engineering decision (architect-pre-authorized, HF-196 directive Phase 2):
 10:  *   Durable update at calc time. Engine reads `committed_data.entity_id`
 11:  *   directly (no engine refactor needed). Resolver UPDATEs the column for
 12:  *   rows where entity_id IS NULL and an entities-table match exists.
 13:  *
 14:  * Coexists with HF-196 Phase 1 import-time back-link (defense in depth):
 15:  *   Import-time path populates entity_id immediately for typical imports.
 16:  *   Calc-time path catches any rows the import-time path missed (late-arriving
 17:  *   data, prior tenant state, etc.). The two paths are mutually idempotent.
 18:  *
 19:  * Korean Test (IGF-T1-E910) compliance:
 20:  *   - Tenant-agnostic: tenant_id is a runtime parameter
 21:  *   - Entity matching delegates to resolveEntitiesFromCommittedData which
 22:  *     uses structural identifiers from `field_identities` metadata, not
 23:  *     hardcoded field names
 24:  *   - Zero domain-specific string literals
 25:  */
 26:
 27: import type { SupabaseClient } from '@supabase/supabase-js';
 28: import { resolveEntitiesFromCommittedData } from './entity-resolution';
 29:
 30: export interface CalcTimeEntityResolutionResult {
 31:   totalNullRowsBefore: number;
 32:   matched: number;
 33:   unmatched: number;
 34:   durationMs: number;
 35: }
 36:
 37: /**
 38:  * Run calc-time entity resolution for a tenant.
 39:  *
 40:  * Reads count of `committed_data` rows with NULL `entity_id` (before),
 41:  * delegates to `resolveEntitiesFromCommittedData` for structural matching
 42:  * + back-link UPDATE, then reads count of NULL rows again (after) to
 43:  * compute matched/unmatched counts.
 44:  *
 45:  * Idempotent: safe to call repeatedly. A second call against an already-
 46:  * resolved tenant returns matched=0 since no rows remain with NULL entity_id
 47:  * matchable against existing entities.
 48:  *
 49:  * Non-blocking: errors surface via console.error and the function returns
 50:  * zeros for matched/unmatched. The calc run continues; rows with unresolved
 51:  * entity_id are surfaced as data-quality signals (handled by caller).
 52:  */
 53: export async function resolveEntitiesAtCalcTime(
 54:   tenantId: string,
 55:   supabase: SupabaseClient,
 56: ): Promise<CalcTimeEntityResolutionResult> {
 57:   const startedAt = Date.now();
 58:
 59:   // Count rows with NULL entity_id before resolution
 60:   const beforeCountQ = await supabase
 61:     .from('committed_data')
 62:     .select('id', { count: 'exact', head: true })
 63:     .eq('tenant_id', tenantId)
 64:     .is('entity_id', null);
 65:
 66:   if (beforeCountQ.error) {
 67:     console.error(
 68:       `[CalcTimeEntityResolution] tenant=${tenantId} pre-count query failed:`,
 69:       beforeCountQ.error.message,
 70:     );
 71:     return {
 72:       totalNullRowsBefore: 0,
 73:       matched: 0,
 74:       unmatched: 0,
 75:       durationMs: Date.now() - startedAt,
 76:     };
 77:   }
 78:   const totalNullRowsBefore = beforeCountQ.count ?? 0;
 79:
 80:   if (totalNullRowsBefore === 0) {
 81:     // No work to do
 82:     return {
 83:       totalNullRowsBefore: 0,
 84:       matched: 0,
 85:       unmatched: 0,
 86:       durationMs: Date.now() - startedAt,
 87:     };
 88:   }
 89:
 90:   // Delegate structural matching to existing library function (Korean Test compliant)
 91:   try {
 92:     await resolveEntitiesFromCommittedData(supabase, tenantId);
 93:   } catch (err) {
 94:     console.error(
 95:       `[CalcTimeEntityResolution] tenant=${tenantId} resolveEntitiesFromCommittedData threw (non-blocking):`,
 96:       err,
 97:     );
 98:     return {
 99:       totalNullRowsBefore,
100:       matched: 0,
101:       unmatched: totalNullRowsBefore,
102:       durationMs: Date.now() - startedAt,
103:     };
104:   }
105:
106:   // Count rows still with NULL entity_id after resolution
107:   const afterCountQ = await supabase
108:     .from('committed_data')
109:     .select('id', { count: 'exact', head: true })
110:     .eq('tenant_id', tenantId)
111:     .is('entity_id', null);
112:
113:   if (afterCountQ.error) {
114:     console.error(
115:       `[CalcTimeEntityResolution] tenant=${tenantId} post-count query failed:`,
116:       afterCountQ.error.message,
117:     );
118:     return {
119:       totalNullRowsBefore,
120:       matched: 0,
121:       unmatched: totalNullRowsBefore,
122:       durationMs: Date.now() - startedAt,
123:     };
124:   }
125:   const unmatched = afterCountQ.count ?? 0;
126:   const matched = totalNullRowsBefore - unmatched;
127:
128:   return {
129:     totalNullRowsBefore,
130:     matched,
131:     unmatched,
132:     durationMs: Date.now() - startedAt,
133:   };
134: }
```

---

## Section 4 — Phase 0.4 Calc-time Resolver Invocation Site (verbatim, line-numbered with context)

### Grep output

```
41:import { resolveEntitiesAtCalcTime } from '@/lib/sci/calc-time-entity-resolution';
153:    const entityResolution = await resolveEntitiesAtCalcTime(tenantId, supabase);
556:  const dataByEntity = new Map<string, Map<string, Array<{ row_data: Json }>>>();
558:  const flatDataByEntity = new Map<string, Array<{ row_data: Json }>>();
561:  const storeData = new Map<string | number, Map<string, Array<{ row_data: Json }>>>();
564:  const extIdToUuid = new Map<string, string>();
566:    if (e.external_id) extIdToUuid.set(String(e.external_id).trim(), e.id);
582:  if (!fallbackEntityIdField && extIdToUuid.size > 0 && committedData.length > 0) {
587:        if (!extIdToUuid.has(value.trim())) continue;
594:          if (typeof val === 'string' && extIdToUuid.has(val.trim())) matchCount++;
606:  let calcTimeResolved = 0;
621:          resolvedEntityId = extIdToUuid.get(String(extId).trim()) || null;
622:          if (resolvedEntityId) calcTimeResolved++;
629:      if (!dataByEntity.has(resolvedEntityId)) {
630:        dataByEntity.set(resolvedEntityId, new Map());
632:      const entitySheets = dataByEntity.get(resolvedEntityId)!;
640:      if (!flatDataByEntity.has(resolvedEntityId)) {
641:        flatDataByEntity.set(resolvedEntityId, []);
643:      flatDataByEntity.get(resolvedEntityId)!.push({ row_data: row.row_data });
649:        if (!storeData.has(storeKey)) {
650:          storeData.set(storeKey, new Map());
652:        const storeSheets = storeData.get(storeKey)!;
662:  if (calcTimeResolved > 0) {
663:    addLog(`OB-183: Resolved ${calcTimeResolved} rows to entities at calc time (entity_id was NULL)`);
841:      const sheets = dataByEntity.get(uuid);
863:      const siblingSheetData = dataByEntity.get(siblingId);
866:      if (!dataByEntity.has(primaryId)) { ... }
[etc — additional dataByEntity / flatDataByEntity / storeData consumer sites at lines 866-1872]
```

Note: `entityIdFieldFromMeta` not present in route.ts (zero matches).

### Lines 38-47 — import block

```typescript
 38: // HF-196 Phase 2: calc-time entity resolution per Decision 92 + OB-182 stated intent.
 39: // Closes Break #2 (entity binding gap) by populating committed_data.entity_id at
 40: // calc time for any rows where the import-time path didn't already resolve.
 41: import { resolveEntitiesAtCalcTime } from '@/lib/sci/calc-time-entity-resolution';
 42: import { loadDensity, persistDensityUpdates } from '@/lib/calculation/synaptic-density';
 43: import {
 44:   createSynapticSurface,
 45:   writeSynapse,
 46:   getExecutionMode,
 47:   consolidateSurface,
```

### Lines 145-170 — invocation block

```typescript
145:   // iteration. Read by Tier 2 emission line. Push from any Tier 3 emission site.
146:   let currentEntityFlags: string[] = [];
147:
148:   // ── HF-196 Phase 2: Calc-time entity resolution (Break #2 closure) ──
149:   // Per Decision 92 + OB-182 stated intent. Idempotent — does nothing if all
150:   // rows already have entity_id resolved. Surfaces unmatched rows as a data-
151:   // quality signal but does not halt the calc run.
152:   try {
153:     const entityResolution = await resolveEntitiesAtCalcTime(tenantId, supabase);
154:     addLog(
155:       `Calc-time entity resolution: tenant=${tenantId} ` +
156:       `null_rows_before=${entityResolution.totalNullRowsBefore} ` +
157:       `matched=${entityResolution.matched} ` +
158:       `unmatched=${entityResolution.unmatched} ` +
159:       `(${entityResolution.durationMs}ms)`,
160:     );
161:     if (entityResolution.unmatched > 0) {
162:       addLog(
163:         `[DATA QUALITY] ${entityResolution.unmatched} committed_data rows still have ` +
164:         `entity_id NULL after calc-time resolution; calc will skip these rows`,
165:       );
166:     }
167:   } catch (err) {
168:     // Non-blocking: calc proceeds even if resolution fails. Engine will
169:     // attribute only resolved rows to entities; unresolved rows skipped.
```

### Lines 553-664 — Resolution + grouping block (committed_data → dataByEntity / flatDataByEntity / storeData)

```typescript
553:   addLog(`Fetched ${committedData.length} committed_data rows (hybrid, incl. period-agnostic)`);
554:
555:   // Group entity-level data by entity_id → data_type → rows
556:   const dataByEntity = new Map<string, Map<string, Array<{ row_data: Json }>>>();
557:   // Also keep flat structure for backward compat
558:   const flatDataByEntity = new Map<string, Array<{ row_data: Json }>>();
559:
560:   // Store-level data (NULL entity_id) grouped by storeId → data_type → rows
561:   const storeData = new Map<string | number, Map<string, Array<{ row_data: Json }>>>();
562:
563:   // OB-183: Build entity external_id → UUID map for calc-time resolution
564:   const extIdToUuid = new Map<string, string>();
565:   for (const e of entities) {
566:     if (e.external_id) extIdToUuid.set(String(e.external_id).trim(), e.id);
567:   }
568:
569:   // HF-183: Build fallback entity_id_field from the FIRST row that has one.
570:   // Used only when a row's own metadata lacks entity_id_field (pre-OB-195 imports).
571:   let fallbackEntityIdField: string | null = null;
572:   for (const row of committedData) {
573:     const meta = row.metadata as Record<string, unknown> | null;
574:     if (meta?.entity_id_field && typeof meta.entity_id_field === 'string') {
575:       fallbackEntityIdField = meta.entity_id_field;
576:       break;
577:     }
578:   }
579:
580:   // HF-181 Layer 3: Fallback — discover entity identifier from data when metadata missing
581:   // Korean Test: discovers by VALUE matching (entity external_ids), not by field name
582:   if (!fallbackEntityIdField && extIdToUuid.size > 0 && committedData.length > 0) {
583:     const sampleRow = committedData[0].row_data as Record<string, unknown> | null;
584:     if (sampleRow) {
585:       for (const [field, value] of Object.entries(sampleRow)) {
586:         if (typeof value !== 'string' || !value.trim()) continue;
587:         if (!extIdToUuid.has(value.trim())) continue;
588:         // Found a candidate — verify across a sample
589:         const sampleSize = Math.min(committedData.length, 20);
590:         let matchCount = 0;
591:         for (let s = 0; s < sampleSize; s++) {
592:           const rd = committedData[s].row_data as Record<string, unknown> | null;
593:           const val = rd?.[field];
594:           if (typeof val === 'string' && extIdToUuid.has(val.trim())) matchCount++;
595:         }
596:         const matchRate = matchCount / sampleSize;
597:         if (matchRate >= 0.8) {
598:           fallbackEntityIdField = field;
599:           addLog(`HF-181: entity_id_field not in metadata — discovered '${field}' from data (${matchCount}/${sampleSize} rows matched, ${(matchRate * 100).toFixed(0)}%)`);
600:           break;
601:         }
602:       }
603:     }
604:   }
605:
606:   let calcTimeResolved = 0;
607:   for (const row of committedData) {
608:     let resolvedEntityId = row.entity_id; // Use FK if populated (backward compat for BCL)
609:
610:     // HF-183: Per-row entity_id_field resolution.
611:     // Each row uses its OWN metadata.entity_id_field first, then falls back to global.
612:     // This fixes mixed-source resolution (transaction rows use sales_rep_id, quota rows use entity_id).
613:     if (!resolvedEntityId) {
614:       const rowMeta = row.metadata as Record<string, unknown> | null;
615:       const rowEntityIdField = (rowMeta?.entity_id_field as string) || fallbackEntityIdField;
616:
617:       if (rowEntityIdField) {
618:         const rd = row.row_data as Record<string, unknown> | null;
619:         const extId = rd?.[rowEntityIdField];
620:         if (extId != null) {
621:           resolvedEntityId = extIdToUuid.get(String(extId).trim()) || null;
622:           if (resolvedEntityId) calcTimeResolved++;
623:         }
624:       }
625:     }
626:
627:     if (resolvedEntityId) {
628:       // Entity-level: group by entity + sheet
629:       if (!dataByEntity.has(resolvedEntityId)) {
630:         dataByEntity.set(resolvedEntityId, new Map());
631:       }
632:       const entitySheets = dataByEntity.get(resolvedEntityId)!;
633:       const sheetName = row.data_type || '_unknown';
634:       if (!entitySheets.has(sheetName)) {
635:         entitySheets.set(sheetName, []);
636:       }
637:       entitySheets.get(sheetName)!.push({ row_data: row.row_data });
638:
639:       // Also flat
640:       if (!flatDataByEntity.has(resolvedEntityId)) {
641:         flatDataByEntity.set(resolvedEntityId, []);
642:       }
643:       flatDataByEntity.get(resolvedEntityId)!.push({ row_data: row.row_data });
644:     } else {
645:       // Store-level: group by store identifier
646:       const rd = row.row_data as Record<string, unknown> | null;
647:       const storeKey = (rd?.['storeId'] ?? rd?.['num_tienda'] ?? rd?.['No_Tienda'] ?? rd?.['Tienda']) as string | number | undefined;
648:       if (storeKey !== undefined) {
649:         if (!storeData.has(storeKey)) {
650:           storeData.set(storeKey, new Map());
651:         }
652:         const storeSheets = storeData.get(storeKey)!;
653:         const sheetName = row.data_type || '_unknown';
654:         if (!storeSheets.has(sheetName)) {
655:           storeSheets.set(sheetName, []);
656:         }
657:         storeSheets.get(sheetName)!.push({ row_data: row.row_data });
658:       }
659:     }
660:   }
661:
662:   if (calcTimeResolved > 0) {
663:     addLog(`OB-183: Resolved ${calcTimeResolved} rows to entities at calc time (entity_id was NULL)`);
664:   }
```

---

## Section 5 — Phase 0.5 import-batch-supersession.ts (verbatim, line-numbered)

`web/src/lib/sci/import-batch-supersession.ts` — 227 lines.

```typescript
  1: /**
  2:  * HF-196 Phase 1F — Import batch supersession via SHA-256 content hash.
  3:  * Replaces Phase 1E's structural_fingerprint trigger primitive (which wrongly
  4:  * fired for monthly transaction files sharing column shape per DS-017 §2.3).
  5:  *
  6:  * Architecture: Path Z.1-A (architect-dispositioned 2026-05-03).
  7:  *   import_batches.file_hash_sha256 is the dataset-content identity primitive.
  8:  *   DS-017 structural_fingerprints stays unchanged for analyze-time Tier 1 immunity.
  9:  *   Two surfaces, two primitives, two purposes — D154/D155 single-canonical preserved.
 10:  *
 11:  * Phase 1E architecture preserved:
 12:  *   - Supersession columns (superseded_by, supersedes, superseded_at, supersession_reason)
 13:  *   - CHECK constraint on supersession integrity
 14:  *   - Engine operative-only filter via fetchSupersededBatchIds + NOT IN
 15:  *   - Audit trail discipline (nothing destroyed; SOC 2 CC7.2; GDPR Article 30)
 16:  *
 17:  * Phase 1F changes ONLY the supersession trigger primitive.
 18:  *
 19:  * Korean Test (T1-E910): SHA-256 is structural primitive (cryptographic hash of bytes);
 20:  * tenantId, fileHashSha256, newBatchId are pure structural primitives. Zero domain literals.
 21:  *
 22:  * Path B-prime FK retained (architect invariant 3): structural_fingerprints.import_batch_id
 23:  *   stays populated as lineage primitive for foundational flywheel work; not load-bearing
 24:  *   for supersession decisions in Phase 1F.
 25:  */
 26:
 27: import type { SupabaseClient } from '@supabase/supabase-js';
 28: import { computeFingerprintHashSync } from './structural-fingerprint';
 29: // HF-196 Phase 1F: computeFileHashSha256 lives in @/lib/sci/file-content-hash
 30: // (separate module — kept out of this file so node:crypto is not pulled into client
 31: // bundles via state-reader.ts → fetchSupersededBatchIds chain).
 32:
 33: export interface SupersessionResult {
 34:   prior_batch_id: string | null;
 35:   prior_batch_status: 'superseded' | 'no_prior';
 36:   new_batch_id: string;
 37:   reason: string;
 38: }
 39:
 40: /**
 41:  * Find prior operative batch for this (tenant, file_hash_sha256), if any.
 42:  * Single-query lookup on import_batches — Phase 1F primitive replaces Phase 1E
 43:  * Path B-prime two-step JOIN through structural_fingerprints.
 44:  *
 45:  * Match identifier: (tenant_id, file_hash_sha256). Same content bytes anywhere
 46:  * in the tenant's import history → match. Different content → no match.
 47:  *
 48:  * Filters:
 49:  *   - Operative only (superseded_by IS NULL)
 50:  *   - Excludes the new batch itself
 51:  *   - Most recent prior wins (LIMIT 1, ORDER BY created_at DESC)
 52:  */
 53: async function findPriorOperativeBatch(
 54:   supabase: SupabaseClient,
 55:   tenantId: string,
 56:   fileHashSha256: string,
 57:   newBatchId: string,
 58: ): Promise<string | null> {
 59:   const { data, error } = await supabase
 60:     .from('import_batches')
 61:     .select('id, created_at')
 62:     .eq('tenant_id', tenantId)
 63:     .eq('file_hash_sha256', fileHashSha256)
 64:     .is('superseded_by', null)
 65:     .neq('id', newBatchId)
 66:     .order('created_at', { ascending: false })
 67:     .limit(1);
 68:
 69:   if (error) {
 70:     console.warn(`[Phase 1F supersession] lookup failed: ${error.message}`);
 71:     return null;
 72:   }
 73:   if (!data || data.length === 0) return null;
 74:   return data[0].id as string;
 75: }
 76:
 77: /**
 78:  * Supersede prior operative batch if (tenant_id, file_hash_sha256) match exists.
 79:  *
 80:  * Returns supersession result for caller logging. Throws on update error
 81:  * (caller should treat as non-blocking — original import succeeded; supersession
 82:  * failure means both batches remain operative until manual reconciliation).
 83:  */
 84: export async function supersedePriorBatchIfExists(
 85:   supabase: SupabaseClient,
 86:   tenantId: string,
 87:   fileHashSha256: string,
 88:   newBatchId: string,
 89:   reason: string = 'content_hash_match_reimport',
 90: ): Promise<SupersessionResult> {
 91:   const priorBatchId = await findPriorOperativeBatch(
 92:     supabase,
 93:     tenantId,
 94:     fileHashSha256,
 95:     newBatchId,
 96:   );
 97:
 98:   if (!priorBatchId) {
 99:     return {
100:       prior_batch_id: null,
101:       prior_batch_status: 'no_prior',
102:       new_batch_id: newBatchId,
103:       reason: 'no_prior_operative_batch',
104:     };
105:   }
106:
107:   // Mark prior batch as superseded — both link + audit columns set atomically per
108:   // CHECK constraint (superseded_by NOT NULL → superseded_at NOT NULL).
109:   const { error: updateError } = await supabase
110:     .from('import_batches')
111:     .update({
112:       superseded_by: newBatchId,
113:       superseded_at: new Date().toISOString(),
114:       supersession_reason: reason,
115:     })
116:     .eq('id', priorBatchId);
117:
118:   if (updateError) {
119:     throw new Error(`[Phase 1F supersession] update of prior batch failed: ${updateError.message}`);
120:   }
121:
122:   // Link new batch back to predecessor (back-link is informational; not constrained
123:   // by CHECK because supersedes does not require superseded_at on the same row).
124:   const { error: linkError } = await supabase
125:     .from('import_batches')
126:     .update({ supersedes: priorBatchId })
127:     .eq('id', newBatchId);
128:
129:   if (linkError) {
130:     throw new Error(`[Phase 1F supersession] back-link to predecessor failed: ${linkError.message}`);
131:   }
132:
133:   return {
134:     prior_batch_id: priorBatchId,
135:     prior_batch_status: 'superseded',
136:     new_batch_id: newBatchId,
137:     reason,
138:   };
139: }
140:
141: /**
142:  * Engine-side helper (preserved unchanged from Phase 1E).
143:  * Fetch list of superseded import_batch ids for a tenant. Engine queries use this
144:  * to filter committed_data via NOT IN — surfacing only operative-batch rows.
145:  */
146: export async function fetchSupersededBatchIds(
147:   supabase: SupabaseClient,
148:   tenantId: string,
149: ): Promise<string[]> {
150:   const { data, error } = await supabase
151:     .from('import_batches')
152:     .select('id')
153:     .eq('tenant_id', tenantId)
154:     .not('superseded_by', 'is', null);
155:   if (error) {
156:     console.warn(`[Phase 1E/1F] fetchSupersededBatchIds failed (non-blocking, engine continues unfiltered): ${error.message}`);
157:     return [];
158:   }
159:   return (data ?? []).map(b => b.id as string);
160: }
161:
162: /**
163:  * HF-196 Phase 1F convenience wrapper — replaces Phase 1E's
164:  * linkFingerprintAndSupersedePriorBatch.
165:  *
166:  * Called from each processX function in execute-bulk + execute after import_batches
167:  * insert (which itself includes file_hash_sha256 in the inserted row).
168:  *
169:  * Two responsibilities:
170:  *   1. Lineage link: structural_fingerprints.import_batch_id ← newBatchId
171:  *      (Phase 1E Path B-prime FK preserved per architect invariant 3 — informational
172:  *       only; not load-bearing for supersession trigger.)
173:  *   2. Phase 1F supersession check by SHA-256 content hash.
174:  *
175:  * Non-blocking: lineage link or supersession failure is logged but does not throw.
176:  *
177:  * Returns SupersessionResult for caller-side log emission, or null on failure or
178:  * empty rows (no fingerprint to link → still attempts supersession by SHA alone).
179:  */
180: export async function supersedePriorBatchOnContentMatch(
181:   supabase: SupabaseClient,
182:   tenantId: string,
183:   newBatchId: string,
184:   fileHashSha256: string,
185:   rows: Record<string, unknown>[],
186:   reason: string = 'content_hash_match_reimport',
187: ): Promise<SupersessionResult | null> {
188:   // 1. Lineage link (Phase 1E Path B-prime FK preserved — informational).
189:   if (rows.length > 0) {
200:    try {
191:       const columns = Object.keys(rows[0]);
192:       const fingerprintHash = computeFingerprintHashSync(columns, rows.slice(0, 50));
193:       const { error: linkErr } = await supabase
194:         .from('structural_fingerprints')
195:         .update({ import_batch_id: newBatchId })
196:         .eq('tenant_id', tenantId)
197:         .eq('fingerprint_hash', fingerprintHash)
198:         .is('import_batch_id', null);
199:       if (linkErr) {
200:         console.warn(`[Phase 1F] structural_fingerprints lineage link failed (non-blocking): ${linkErr.message}`);
201:       }
202:     } catch (err) {
203:       console.warn(`[Phase 1F] fingerprint lineage computation failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
204:     }
205:   }
206:
207:   // 2. Phase 1F supersession check by SHA-256 content hash.
208:   try {
209:     const result = await supersedePriorBatchIfExists(
210:       supabase,
211:       tenantId,
212:       fileHashSha256,
213:       newBatchId,
214:       reason,
215:     );
216:     if (result.prior_batch_status === 'superseded') {
217:       console.log(
218:         `[Phase 1F] Superseded prior batch ${result.prior_batch_id} → new batch ${result.new_batch_id} ` +
219:         `(tenant=${tenantId} sha=${fileHashSha256.substring(0, 12)} reason=${result.reason})`,
220:       );
221:     }
222:     return result;
223:   } catch (err) {
224:     console.warn(`[Phase 1F] supersession failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
225:     return null;
226:   }
227: }
```

---

## Section 6 — Phase 0.6 Supersession Write Site (verbatim, line-numbered with context)

### Grep output (`web/src/app/api/import/sci/`)

```
execute-bulk/route.ts:30:// HF-196 Phase 1F — supersession trigger via SHA-256 content hash (replaces 1E fingerprint trigger).
execute-bulk/route.ts:32:// wrongly fired 1E supersession). 1F retains 1E architecture; only the trigger primitive changes.
execute-bulk/route.ts:33:import { supersedePriorBatchOnContentMatch } from '@/lib/sci/import-batch-supersession';
execute-bulk/route.ts:139:    // HF-196 Phase 1F: compute SHA-256 of file content bytes ONCE; thread to all
execute-bulk/route.ts:140:    // process functions for import_batches.file_hash_sha256 + supersession trigger.
execute-bulk/route.ts:141:    const fileHashSha256 = computeFileHashSha256(buffer);
execute-bulk/route.ts:228:          fileHashSha256,
execute-bulk/route.ts:313:  fileHashSha256: string,
execute-bulk/route.ts:317:      return processEntityUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, fileHashSha256);
execute-bulk/route.ts:319:      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'target', fileHashSha256);
execute-bulk/route.ts:321:      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'transaction', fileHashSha256);
execute-bulk/route.ts:323:      return processReferenceUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, profileId, fileHashSha256);
execute-bulk/route.ts:346:  fileHashSha256: string,
execute-bulk/route.ts:527:    // HF-196 Phase 1F: SHA-256 of file content bytes — supersession trigger primitive.
execute-bulk/route.ts:528:    file_hash_sha256: fileHashSha256,
execute-bulk/route.ts:536:  // HF-196 Phase 1F: Rule 30 supersession on SHA-256 content match.
execute-bulk/route.ts:537:  // Idempotent + non-blocking. Returns null on supersession failure.
execute-bulk/route.ts:538:  await supersedePriorBatchOnContentMatch(supabase, tenantId, cdBatchId, fileHashSha256, rows);
execute-bulk/route.ts:623:  fileHashSha256: string,
execute-bulk/route.ts:638:    // HF-196 Phase 1F: SHA-256 of file content bytes — supersession trigger primitive.
execute-bulk/route.ts:639:    file_hash_sha256: fileHashSha256,
execute-bulk/route.ts:647:  // HF-196 Phase 1F: Rule 30 supersession on SHA-256 content match.
execute-bulk/route.ts:648:  await supersedePriorBatchOnContentMatch(supabase, tenantId, batchId, fileHashSha256, rows);
execute-bulk/route.ts:789:  fileHashSha256: string,
execute-bulk/route.ts:807:    // HF-196 Phase 1F: SHA-256 of file content bytes — supersession trigger primitive.
execute-bulk/route.ts:808:    file_hash_sha256: fileHashSha256,
execute-bulk/route.ts:816:  // HF-196 Phase 1F: Rule 30 supersession on SHA-256 content match.
execute-bulk/route.ts:817:  await supersedePriorBatchOnContentMatch(supabase, tenantId, batchId, fileHashSha256, rows);
execute/route.ts:43:// HF-196 Phase 1F — Rule 30 + SHA-256 content hash supersession (replaces 1E fingerprint trigger).
execute/route.ts:44:import { supersedePriorBatchOnContentMatch } from '@/lib/sci/import-batch-supersession';
execute/route.ts:80:    // HF-196 Phase 1F-corrective: Compute SHA-256 over RAW FILE BYTES (not parsed
execute/route.ts:84:    // executePlanPipeline and uses HF-132 rule_sets-layer supersession (not
execute/route.ts:85:    // import_batches Phase 1F supersession), so plan-only requests do not require
execute/route.ts:87:    let fileHashSha256: string | null = null;
execute/route.ts:97:          fileHashSha256 = computeFileHashSha256(fileBuffer);
execute/route.ts:104:    if (nonPlanExists && !fileHashSha256) {
execute/route.ts:106:        { error: 'Phase 1F: storagePath required for non-plan import (file_hash_sha256 mandatory per Rule 30 + OB-50 supersession primitive)' },
execute/route.ts:157:        const result = await executeContentUnit(supabase, tenantId, proposalId, unit, profileId, storagePath, fileHashSha256);
execute/route.ts:462:  fileHashSha256: string | null,
```

### `web/src/app/api/import/sci/execute-bulk/route.ts` lines 520-548 — processEntityUnit insert + supersession invocation

```typescript
520:   await supabase.from('import_batches').insert({
521:     id: cdBatchId,
522:     tenant_id: tenantId,
523:     file_name: `sci-bulk-${proposalId}`,
524:     file_type: 'sci',
525:     status: 'processing',
526:     row_count: rows.length,
527:     // HF-196 Phase 1F: SHA-256 of file content bytes — supersession trigger primitive.
528:     file_hash_sha256: fileHashSha256,
529:     metadata: { source: 'sci-bulk', proposalId, contentUnitId: unit.contentUnitId, classification: 'entity' } as unknown as Json,
530:   });
531:
532:   // HF-196 Phase 1D: data_type derived from SCI classification per D154/D155.
533:   // Identity: data_type === informational_label === 'entity' for this pipeline.
534:   const dataType = resolveDataTypeFromClassification('entity');
535:
536:   // HF-196 Phase 1F: Rule 30 supersession on SHA-256 content match.
537:   // Idempotent + non-blocking. Returns null on supersession failure.
538:   await supersedePriorBatchOnContentMatch(supabase, tenantId, cdBatchId, fileHashSha256, rows);
```

### Lines 630-650 — processDataUnit insert + supersession invocation

```typescript
630:   const batchId = crypto.randomUUID();
631:   await supabase.from('import_batches').insert({
632:     id: batchId,
633:     tenant_id: tenantId,
634:     file_name: `sci-bulk-${proposalId}`,
635:     file_type: 'sci',
636:     status: 'processing',
637:     row_count: rows.length,
638:     // HF-196 Phase 1F: SHA-256 of file content bytes — supersession trigger primitive.
639:     file_hash_sha256: fileHashSha256,
640:     metadata: { source: 'sci-bulk', proposalId, contentUnitId: unit.contentUnitId } as unknown as Json,
641:   });
642:
643:   // HF-196 Phase 1D: data_type derived from SCI classification per D154/D155.
644:   // Identity: data_type === informational_label === classification ('target' | 'transaction').
645:   const dataType = resolveDataTypeFromClassification(classification);
646:
647:   // HF-196 Phase 1F: Rule 30 supersession on SHA-256 content match.
648:   await supersedePriorBatchOnContentMatch(supabase, tenantId, batchId, fileHashSha256, rows);
```

### Lines 800-820 — processReferenceUnit insert + supersession invocation

```typescript
800:   await supabase.from('import_batches').insert({
801:     id: batchId,
802:     tenant_id: tenantId,
803:     file_name: `sci-bulk-${proposalId}`,
804:     file_type: 'sci',
805:     status: 'processing',
806:     row_count: rows.length,
807:     // HF-196 Phase 1F: SHA-256 of file content bytes — supersession trigger primitive.
808:     file_hash_sha256: fileHashSha256,
809:     metadata: { source: 'sci-bulk', proposalId, contentUnitId: unit.contentUnitId, classification: 'reference' } as unknown as Json,
810:   });
811:
812:   // HF-196 Phase 1D: data_type derived from SCI classification per D154/D155.
813:   // Identity: data_type === informational_label === 'reference' for this pipeline.
814:   const dataType = resolveDataTypeFromClassification('reference');
815:
816:   // HF-196 Phase 1F: Rule 30 supersession on SHA-256 content match.
817:   await supersedePriorBatchOnContentMatch(supabase, tenantId, batchId, fileHashSha256, rows);
```

---

## Section 7 — Phase 0.7 Engine Read Filter Sites (verbatim, line-numbered with context)

### Grep output

```
81:  // exclude these via NOT IN — operative-batch-only data per Rule 30.
82:  const { fetchSupersededBatchIds } = await import('@/lib/sci/import-batch-supersession');
83:  const supersededIds = await fetchSupersededBatchIds(supabase, tenantId);
84:  if (supersededIds.length > 0) {
85:    addLog(`Phase 1E: ${supersededIds.length} superseded batches excluded from engine reads`);
492:      if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
519:      if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
544:    if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
754:        if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
778:        if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
1008:    if (supersededIds.length > 0) bq = bq.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
```

`from('committed_data')` SELECT sites: lines 485, 514, 538, 747, 773, 1003 — all 6 followed by `supersededIds` filter at lines 492, 519, 544, 754, 778, 1008 respectively.

### Lines 480-554 — first 3 committed_data SELECT sites (representative pattern)

```typescript
480:    while (true) {
481:      const from = sdPage * PAGE_SIZE;
482:      const to = from + PAGE_SIZE - 1;
483:      // HF-196 Phase 1E: filter out superseded batches per Rule 30.
484:      let q = supabase
485:        .from('committed_data')
486:        .select('entity_id, data_type, row_data, import_batch_id, metadata')
487:        .eq('tenant_id', tenantId)
488:        .not('source_date', 'is', null)
489:        .gte('source_date', period.start_date)
490:        .lte('source_date', period.end_date)
491:        .range(from, to);
492:      if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
493:      const { data: page } = await q;
494:
495:      if (!page || page.length === 0) break;
496:      committedData.push(...page);
497:      if (page.length < PAGE_SIZE) break;
498:      sdPage++;
499:    }
500:    if (committedData.length > 0) {
501:      usedSourceDate = true;
502:      addLog(`OB-152 source_date path: ${committedData.length} rows for ${period.start_date}..${period.end_date}`);
503:    }
504:  }
505:
506:  // Fallback: period_id path (LAB/legacy data without source_date)
507:  if (!usedSourceDate) {
508:    let dataPage = 0;
509:    while (true) {
510:      const from = dataPage * PAGE_SIZE;
511:      const to = from + PAGE_SIZE - 1;
512:      // HF-196 Phase 1E: filter out superseded batches per Rule 30.
513:      let q = supabase
514:        .from('committed_data')
515:        .select('entity_id, data_type, row_data, import_batch_id, metadata')
516:        .eq('tenant_id', tenantId)
517:        .eq('period_id', periodId)
518:        .range(from, to);
519:      if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
520:      const { data: page } = await q;
521:
522:      if (!page || page.length === 0) break;
523:      committedData.push(...page);
524:      if (page.length < PAGE_SIZE) break;
525:      dataPage++;
526:    }
527:    addLog(`OB-152 period_id fallback: ${committedData.length} rows`);
528:  }
529:
530:  // OB-128: Also fetch period-agnostic data (period_id IS NULL, source_date IS NULL)
531:  // Target data from SCI applies to all periods — not bound to a specific period
532:  let nullPeriodPage = 0;
533:  while (true) {
534:    const from = nullPeriodPage * PAGE_SIZE;
535:    const to = from + PAGE_SIZE - 1;
536:    // HF-196 Phase 1E: filter out superseded batches per Rule 30.
537:    let q = supabase
538:      .from('committed_data')
539:      .select('entity_id, data_type, row_data, import_batch_id, metadata')
540:      .eq('tenant_id', tenantId)
541:      .is('period_id', null)
542:      .is('source_date', null)
543:      .range(from, to);
544:    if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
545:    const { data: page } = await q;
546:
547:    if (!page || page.length === 0) break;
548:    committedData.push(...page);
549:    if (page.length < PAGE_SIZE) break;
550:    nullPeriodPage++;
551:  }
552:
553:  addLog(`Fetched ${committedData.length} committed_data rows (hybrid, incl. period-agnostic)`);
```

(Sites at lines 747, 773, 1003 follow identical filter pattern — `if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', '(${supersededIds.join(',')})')` at lines 754, 778, 1008.)

---

## Section 8 — Phase 0.8 execute-bulk Classification Dispatcher (verbatim, line-numbered with context)

### Grep output

```
63:  confirmedClassification: AgentType;
176:      (a, b) => PROCESSING_ORDER[a.confirmedClassification] - PROCESSING_ORDER[b.confirmedClassification]
212:                classification: unit.confirmedClassification,
215:                pipeline: unit.confirmedClassification,
234:          classification: unit.confirmedClassification,
237:          pipeline: unit.confirmedClassification,
315:  switch (unit.confirmedClassification) {
317:      return processEntityUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, fileHashSha256);
319:      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'target', fileHashSha256);
321:      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'transaction', fileHashSha256);
323:      return processReferenceUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, profileId, fileHashSha256);
327:        classification: unit.confirmedClassification,
330:        pipeline: unit.confirmedClassification,
331:        error: `Unsupported classification for bulk processing: ${unit.confirmedClassification}`,
338:async function processEntityUnit(
349:    return { contentUnitId: unit.contentUnitId, classification: 'entity', success: true, rowsProcessed: 0, pipeline: 'entity' };
357:    return { contentUnitId: unit.contentUnitId, classification: 'entity', success: false, rowsProcessed: 0, pipeline: 'entity', error: 'No entity_identifier binding found' };
455:        return { contentUnitId: unit.contentUnitId, classification: 'entity' as const, success: false, rowsProcessed: created, pipeline: 'entity', error: entErr.message };
529:    metadata: { source: 'sci-bulk', proposalId, contentUnitId: unit.contentUnitId, classification: 'entity' } as unknown as Json,
609:  return { contentUnitId: unit.contentUnitId, classification: 'entity', success: true, rowsProcessed: rows.length, pipeline: 'entity' };
614:async function processDataUnit(
622:  classification: 'target' | 'transaction',
690:        // here while present at processEntityUnit/processReferenceUnit. Now uniformly
760:  // Entity creation for roster imports still handled by processEntityUnit (separate path).
779:async function processReferenceUnit(
```

### Lines 300-349 — processContentUnit dispatcher

```typescript
300: }
301:
302: // ── Process a single content unit with server-parsed data ──
303:
304: async function processContentUnit(
305:   supabase: SupabaseClient,
306:   tenantId: string,
307:   proposalId: string,
308:   profileId: string,
309:   unit: BulkContentUnit,
310:   rows: Record<string, unknown>[],
311:   fileName: string,
312:   tabName: string,
313:   fileHashSha256: string,
314: ): Promise<ContentUnitResult> {
315:   switch (unit.confirmedClassification) {
316:     case 'entity':
317:       return processEntityUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, fileHashSha256);
318:     case 'target':
319:       return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'target', fileHashSha256);
320:     case 'transaction':
321:       return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'transaction', fileHashSha256);
322:     case 'reference':
323:       return processReferenceUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, profileId, fileHashSha256);
324:     default:
325:       return {
326:         contentUnitId: unit.contentUnitId,
327:         classification: unit.confirmedClassification,
328:         success: false,
329:         rowsProcessed: 0,
330:         pipeline: unit.confirmedClassification,
331:         error: `Unsupported classification for bulk processing: ${unit.confirmedClassification}`,
332:       };
333:   }
334: }
```

---

## Phase 0 Status

- Branch: `hf-213-atomic-supersession-resolver-closure`
- Baseline SHA: `86c0477b1ae31edaeb57f95166cdc4d90d5b1e77`
- Files probed: 4 (calc-time-entity-resolution.ts, route.ts, import-batch-supersession.ts, execute-bulk/route.ts)
- Sections: 8
- HALT: pending architect disposition before Phase 1+ ships
