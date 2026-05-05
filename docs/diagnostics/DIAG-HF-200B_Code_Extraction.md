# DIAG-HF-200B — Comprehensive Code Extraction

**Type:** Read-only code archaeology. No fix proposals. No verdicts beyond DIAG-HF-200's H1/H2/H3.
**Predecessor:** DIAG-HF-200 (verdict synthesis); architect requested raw code before HF-200 directive drafting.

## Date
2026-05-04

## Branch
`diag-hf-200b-code-extraction` (from `main` HEAD `373579e4`)

## DIAG-HF-200 Verdicts (already established)
- **H1 — HF-190 regressed:** NEGATIVE
- **H2 — HF-199 Adjacent-Arm Drift:** CONFIRMED
- **H3 — OB-177 bridge filter exclusion:** CONFIRMED

---

## SECTIONS

### Section A — HF-190 Construction Layer (`web/src/app/api/import/sci/execute-bulk/route.ts`)

#### A.1 — Function discovery output

```
$ grep -nE 'processEntityUnit|HF-190' web/src/lib/sci/execute-bulk/route.ts
ugrep: warning: web/src/lib/sci/execute-bulk/route.ts: No such file or directory

$ grep -nE 'processEntityUnit|HF-190' web/src/lib/sci/execute.ts
ugrep: warning: web/src/lib/sci/execute.ts: No such file or directory

$ grep -rn 'processEntityUnit' web/src/lib/sci/ --include='*.ts'
web/src/lib/sci/entity-resolution.ts:68:      // is the SCI agent's already-recorded choice (set by processEntityUnit/processDataUnit
web/src/lib/sci/entity-resolution.ts:313:  // for unchanged values). Per OB-177 pattern at processEntityUnit:461-509.

$ grep -rn 'processEntityUnit' web/src/app/api/import/sci/ --include='*.ts'
web/src/app/api/import/sci/execute-bulk/route.ts:317:      return processEntityUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, fileHashSha256);
web/src/app/api/import/sci/execute-bulk/route.ts:338:async function processEntityUnit(
web/src/app/api/import/sci/execute-bulk/route.ts:690:        // here while present at processEntityUnit/processReferenceUnit. Now uniformly
web/src/app/api/import/sci/execute-bulk/route.ts:760:  // Entity creation for roster imports still handled by processEntityUnit (separate path).
```

`processEntityUnit` lives at `web/src/app/api/import/sci/execute-bulk/route.ts:338`, not at the directive's hypothesized `web/src/lib/sci/execute.ts`. References from `entity-resolution.ts` at lines 68 and 313 are comments only.

#### A.2 — `processEntityUnit` full function body (lines 338–610)

```typescript
338: async function processEntityUnit(
339:   supabase: SupabaseClient,
340:   tenantId: string,
341:   proposalId: string,
342:   unit: BulkContentUnit,
343:   rows: Record<string, unknown>[],
344:   fileName: string,
345:   tabName: string,
346:   fileHashSha256: string,
347: ): Promise<ContentUnitResult> {
348:   if (rows.length === 0) {
349:     return { contentUnitId: unit.contentUnitId, classification: 'entity', success: true, rowsProcessed: 0, pipeline: 'entity' };
350:   }
351:
352:   const idBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
353:   const nameBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_name');
354:   const licenseBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_license');
355:
356:   if (!idBinding) {
357:     return { contentUnitId: unit.contentUnitId, classification: 'entity', success: false, rowsProcessed: 0, pipeline: 'entity', error: 'No entity_identifier binding found' };
358:   }
359:
360:   // Collect unique external IDs with metadata + enrichment attributes
361:   const entityData = new Map<string, { name: string; role?: string; licenses?: string; enrichment: Record<string, string> }>();
362:   // OB-177: Detect enrichment fields — entity_attribute bindings that are text (not ID/name)
363:   const enrichmentBindings = unit.confirmedBindings.filter(b =>
364:     b.semanticRole === 'entity_attribute' || b.semanticRole === 'descriptive_label'
365:   );
366:   for (const row of rows) {
367:     const eid = row[idBinding.sourceField];
368:     if (eid == null || !String(eid).trim()) continue;
369:     const key = String(eid).trim();
370:     if (entityData.has(key)) continue;
371:
372:     const name = nameBinding ? String(row[nameBinding.sourceField] || key).trim() : key;
373:     const meta: { name: string; role?: string; licenses?: string; enrichment: Record<string, string> } = { name, enrichment: {} };
374:
375:     for (const binding of unit.confirmedBindings) {
376:       if (binding.semanticRole === 'entity_attribute') {
377:         const fieldLower = binding.sourceField.toLowerCase().replace(/[\s_-]+/g, '');
378:         if (ROLE_TARGETS.some(t => fieldLower.includes(t))) {
379:           meta.role = String(row[binding.sourceField] || '').trim();
380:         }
381:       }
382:     }
383:     if (licenseBinding) {
384:       meta.licenses = String(row[licenseBinding.sourceField] || '').trim();
385:     }
386:
387:     // OB-177: Collect ALL enrichment field values for temporal_attributes
388:     for (const binding of enrichmentBindings) {
389:       const val = row[binding.sourceField];
390:       if (val != null && typeof val === 'string' && val.trim()) {
391:         const normalizedKey = binding.sourceField.toLowerCase().replace(/[\s]+/g, '_');
392:         meta.enrichment[normalizedKey] = val.trim();
393:       }
394:     }
395:
396:     entityData.set(key, meta);
397:   }
398:
399:   // Fetch existing entities in batches of 200 (Section G)
400:   const allIds = Array.from(entityData.keys());
401:   const existingMap = new Map<string, string>();
402:   const BATCH = 200;
403:   for (let i = 0; i < allIds.length; i += BATCH) {
404:     const slice = allIds.slice(i, i + BATCH);
405:     const { data: existing } = await supabase
406:       .from('entities')
407:       .select('id, external_id')
408:       .eq('tenant_id', tenantId)
409:       .in('external_id', slice);
410:     if (existing) {
411:       for (const e of existing) {
412:         if (e.external_id) existingMap.set(e.external_id, e.id);
413:       }
414:     }
415:   }
416:
417:   // OB-177: Build temporal_attributes from enrichment fields
418:   const importDate = new Date().toISOString().split('T')[0];
419:   function buildTemporalAttrs(enrichment: Record<string, string>): Json[] {
420:     return Object.entries(enrichment).map(([key, value]) => ({
421:       key,
422:       value,
423:       effective_from: importDate,
424:       effective_to: null,
425:       source: 'import',
426:     }));
427:   }
428:
429:   // Create new entities — bulk insert in 5000-row chunks
430:   const newIds = allIds.filter(eid => !existingMap.has(eid));
431:   let created = 0;
432:   if (newIds.length > 0) {
433:     const newEntities = newIds.map(eid => {
434:       const meta = entityData.get(eid);
435:       return {
436:         tenant_id: tenantId,
437:         external_id: eid,
438:         display_name: meta?.name || eid,
439:         entity_type: 'individual' as const,
440:         status: 'active' as const,
441:         temporal_attributes: buildTemporalAttrs(meta?.enrichment || {}) as Json[],
442:         metadata: {
443:           ...(meta?.enrichment || {}),  // HF-190: All enrichment fields in metadata for scope resolution
444:           ...(meta?.role ? { role: meta.role } : {}),
445:           ...(meta?.licenses ? { product_licenses: meta.licenses } : {}),
446:         } as Record<string, Json>,
447:       };
448:     });
449:
450:     const INSERT_BATCH = 5000;
451:     for (let i = 0; i < newEntities.length; i += INSERT_BATCH) {
452:       const slice = newEntities.slice(i, i + INSERT_BATCH);
453:       const { error: entErr } = await supabase.from('entities').insert(slice);
454:       if (entErr) {
455:         return { contentUnitId: unit.contentUnitId, classification: 'entity' as const, success: false, rowsProcessed: created, pipeline: 'entity', error: entErr.message };
456:       }
457:       created += slice.length;
458:     }
459:   }
460:
461:   // OB-177: Enrich EXISTING entities — merge temporal_attributes (don't overwrite)
462:   let enriched = 0;
463:   for (const eid of allIds) {
464:     const entityId = existingMap.get(eid);
465:     if (!entityId) continue;
466:     const meta = entityData.get(eid);
467:     if (!meta?.enrichment || Object.keys(meta.enrichment).length === 0) continue;
468:
469:     // Fetch current temporal_attributes
470:     const { data: current } = await supabase
471:       .from('entities')
472:       .select('temporal_attributes')
473:       .eq('id', entityId)
474:       .single();
475:
476:     const existingAttrs = (current?.temporal_attributes || []) as Array<{ key: string; value: Json; effective_from: string; effective_to: string | null }>;
477:
478:     // Merge: for each enrichment field, check if value changed
479:     const newAttrs = [...existingAttrs];
480:     for (const [key, value] of Object.entries(meta.enrichment)) {
481:       const existing = newAttrs.find(a => a.key === key && a.effective_to === null);
482:       if (existing && existing.value === value) continue; // Same value, idempotent
483:       if (existing) {
484:         // Close current entry
485:         existing.effective_to = importDate;
486:       }
487:       // Add new entry
488:       newAttrs.push({ key, value, effective_from: importDate, effective_to: null });
489:     }
490:
491:     // HF-190: Spread ALL enrichment fields into metadata (not just role)
492:     {
493:       const { data: entData } = await supabase.from('entities').select('metadata').eq('id', entityId).single();
494:       const existingMeta = (entData?.metadata ?? {}) as Record<string, unknown>;
495:       const mergedMeta = {
496:         ...existingMeta,
497:         ...meta.enrichment,  // HF-190: All enrichment fields in metadata for scope resolution
498:         ...(meta.role ? { role: meta.role } : {}),
499:       };
500:       const metaChanged = JSON.stringify(existingMeta) !== JSON.stringify(mergedMeta);
501:       if (metaChanged || newAttrs.length !== existingAttrs.length) {
502:         await supabase.from('entities').update({
503:           temporal_attributes: newAttrs as unknown as Json[],
504:           metadata: mergedMeta as unknown as Json,
505:         }).eq('id', entityId);
506:         enriched++;
507:         continue;
508:       }
509:     }
510:
511:     // HF-190: temporal-only update path removed — unified update above handles both metadata + temporal
512:   }
513:
514:   console.log(`[SCI Bulk] Entity: ${created} new, ${existingMap.size} existing, ${enriched} enriched`);
515:
516:   …  (lines 516–609 — committed_data write of Plantilla rows, not part of HF-190 entity-table writes)
610: }
```

#### A.3 — Calling sites of `processEntityUnit`

```
$ grep -rnE 'processEntityUnit\(' web/src/ --include='*.ts'
web/src/app/api/import/sci/execute-bulk/route.ts:317:      return processEntityUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, fileHashSha256);
web/src/app/api/import/sci/execute-bulk/route.ts:338:async function processEntityUnit(
```

Single caller at `execute-bulk/route.ts:317` (within `processContentUnit` switch on `unit.confirmedClassification`):

```typescript
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
```

#### A.4 — `meta.enrichment` construction (where the field is built)

```typescript
59: const ROLE_TARGETS = ['role', 'position', 'puesto', 'title', 'cargo'];
…
360:   const entityData = new Map<string, { name: string; role?: string; licenses?: string; enrichment: Record<string, string> }>();
361:   // OB-177: Detect enrichment fields — entity_attribute bindings that are text (not ID/name)
362:   const enrichmentBindings = unit.confirmedBindings.filter(b =>
363:     b.semanticRole === 'entity_attribute' || b.semanticRole === 'descriptive_label'
364:   );
…
373:     const meta: { name: string; role?: string; licenses?: string; enrichment: Record<string, string> } = { name, enrichment: {} };
374:
375:     for (const binding of unit.confirmedBindings) {
376:       if (binding.semanticRole === 'entity_attribute') {
377:         const fieldLower = binding.sourceField.toLowerCase().replace(/[\s_-]+/g, '');
378:         if (ROLE_TARGETS.some(t => fieldLower.includes(t))) {
379:           meta.role = String(row[binding.sourceField] || '').trim();
380:         }
381:       }
382:     }
…
387:     // OB-177: Collect ALL enrichment field values for temporal_attributes
388:     for (const binding of enrichmentBindings) {
389:       const val = row[binding.sourceField];
390:       if (val != null && typeof val === 'string' && val.trim()) {
391:         const normalizedKey = binding.sourceField.toLowerCase().replace(/[\s]+/g, '_');
392:         meta.enrichment[normalizedKey] = val.trim();
393:       }
394:     }
395:
396:     entityData.set(key, meta);
```

Key normalization at line 391: `binding.sourceField.toLowerCase().replace(/[\s]+/g, '_')` — HF-190 writes lowercase keys (`Tipo_Coordinador` → `tipo_coordinador`).

#### A.5 — `buildTemporalAttrs` / `effective_from` semantic

```typescript
417:   // OB-177: Build temporal_attributes from enrichment fields
418:   const importDate = new Date().toISOString().split('T')[0];
419:   function buildTemporalAttrs(enrichment: Record<string, string>): Json[] {
420:     return Object.entries(enrichment).map(([key, value]) => ({
421:       key,
422:       value,
423:       effective_from: importDate,
424:       effective_to: null,
425:       source: 'import',
426:     }));
427:   }
```

`importDate` = today (UTC ISO date). HF-190 entries carry `source: 'import'`.

---

### Section B — HF-199 Adjacent Surface (`web/src/lib/sci/entity-resolution.ts`)

#### B.1 — Function discovery output

```
$ wc -l web/src/lib/sci/entity-resolution.ts
     415 web/src/lib/sci/entity-resolution.ts

$ grep -nE 'resolveEntitiesFromCommittedData|HF-199' web/src/lib/sci/entity-resolution.ts | head -10
27:export async function resolveEntitiesFromCommittedData(
34:  // HF-199 D3: also discover attribute columns per batch for entities.materializedState projection
136:        // HF-199 D3: discover attribute columns from field_identities (Korean Test compliant —
141:         const attributeColumns: string[] = [];
149:         batchIdentifiers.set(batchId, { idColumn, nameColumn, attributeColumns });
169:  // HF-199 D3: per-entity attribute projection. Map external_id → { attrCol → value }.
201:        // HF-199 D3: project attribute columns from entity-typed batches only.
229:        entityAttributes.delete(val); // HF-199 D3: also drop spurious attribute projections
254:  // Step 4: Create new entities (HF-199 D3: include attribute projections in temporal_attributes)
285:        // HF-199 D3: temporal_attributes populated from field_identities-marked attribute
309:  // Step 4.5 (HF-199 D3): Update EXISTING entities with attribute projections.

$ grep -rnE 'resolveEntitiesFromCommittedData\(' web/src/ --include='*.ts'
web/src/lib/sci/entity-resolution.ts:27:export async function resolveEntitiesFromCommittedData(
web/src/lib/sci/post-commit-construction.ts:59:    const result = await resolveEntitiesFromCommittedData(supabase, tenantId);
web/src/lib/sci/calc-time-entity-resolution.ts:92:    await resolveEntitiesFromCommittedData(supabase, tenantId);
```

#### B.2 — `resolveEntitiesFromCommittedData` full function body (lines 27–415)

```typescript
27: export async function resolveEntitiesFromCommittedData(
28:   supabase: SupabaseClient,
29:   tenantId: string,
30: ): Promise<{ created: number; updated: number; linked: number }> {
31:
32:   // Step 1: Discover which batches have person identifier columns
33:   // Priority: entity batches first, then transaction/target, then reference
34:   // HF-199 D3: also discover attribute columns per batch for entities.materializedState projection
35:   const batchIdentifiers = new Map<string, { idColumn: string; nameColumn: string | null; attributeColumns: string[] }>();
36:   const batchLabels = new Map<string, string>(); // batchId -> informational_label
37:   const BATCH_SIZE = 200;
…
58:       const meta = row.metadata as Record<string, unknown> | null;
59:       if (!meta) continue;
60:
61:       const label = (meta.informational_label as string) || '';
62:       batchLabels.set(batchId, label);
…
75:       const recordedIdField = (meta.entity_id_field as string | null | undefined) ?? null;
76:       if (recordedIdField && typeof recordedIdField === 'string' && recordedIdField.length > 0) {
77:         idColumn = recordedIdField;
78:       }
…
80:       // Primary fallback: field_identities (DS-009)
81:       const fieldIds = meta.field_identities as Record<string, {
82:         structuralType?: string;
83:         contextualIdentity?: string;
84:       }> | undefined;
…  (lines 86–134 — id/name column discovery via field_identities + semantic_roles fallbacks; preserved unchanged)
135:       if (idColumn) {
136:         // HF-199 D3: discover attribute columns from field_identities (Korean Test compliant —
137:         // iterates structuralType only; no language-specific column-name matching).
138:         // Only entity-typed batches (Plantilla / roster) carry attribute projections — exclude
139:         // identifier/name (already used for entity identity) and exclude HF-199 entity-batch-only
140:         // restriction is implicit because we only project from rows of label='entity' batches below.
141:         const attributeColumns: string[] = [];
142:         if (fieldIds && Object.keys(fieldIds).length > 0) {
143:           for (const [colName, fi] of Object.entries(fieldIds)) {
144:             if (fi.structuralType === 'attribute') {
145:               attributeColumns.push(colName);
146:             }
147:           }
148:         }
149:         batchIdentifiers.set(batchId, { idColumn, nameColumn, attributeColumns });
150:       }
151:     }
…
167:   // Step 2: Scan committed_data for unique entity identifiers
168:   const allEntities = new Map<string, string>(); // external_id -> display_name
169:   // HF-199 D3: per-entity attribute projection. Map external_id → { attrCol → value }.
170:   // Populated from rows whose batch is data_type='entity' (Plantilla / roster sheets).
171:   // Iterates field_identities-marked attribute columns only — no language-specific
172:   // column-name matching. Korean Test compliant.
173:   const entityAttributes = new Map<string, Record<string, unknown>>();
174:
175:   for (const batchId of discoveryBatchIds) {
176:     const { idColumn, nameColumn, attributeColumns } = batchIdentifiers.get(batchId)!;
177:     const isEntityBatch = batchLabels.get(batchId) === 'entity';
…
191:       for (const row of rows) {
192:         const rd = row.row_data as Record<string, unknown>;
193:         const extId = String(rd[idColumn] ?? '').trim();
194:         if (!extId) continue;
…
201:         // HF-199 D3: project attribute columns from entity-typed batches only.
202:         // For each attribute column flagged by HC (structuralType==='attribute'),
203:         // capture row's value. Stored per external_id; later written to
204:         // entities.temporal_attributes (calc-time materialization surface).
205:         if (isEntityBatch && attributeColumns.length > 0) {
206:           const existing = entityAttributes.get(extId) ?? {};
207:           for (const col of attributeColumns) {
208:             const val = rd[col];
209:             if (val != null && val !== '' && existing[col] == null) {
210:               existing[col] = val;
211:             }
212:           }
213:           if (Object.keys(existing).length > 0) {
214:             entityAttributes.set(extId, existing);
215:           }
216:         }
217:       }
…
253:
254:   // Step 4: Create new entities (HF-199 D3: include attribute projections in temporal_attributes)
255:   const importDate = new Date().toISOString().split('T')[0];
256:   const buildTemporalAttrs = (extId: string): Array<{ key: string; value: unknown; effective_from: string; effective_to: null }> => {
257:     const attrs = entityAttributes.get(extId);
258:     if (!attrs) return [];
259:     return Object.entries(attrs).map(([key, value]) => ({
260:       key,
261:       value,
262:       effective_from: importDate,
263:       effective_to: null,
264:     }));
265:   };
266:
267:   const newEntities: Array<{
268:     tenant_id: string;
269:     external_id: string;
270:     display_name: string;
271:     entity_type: string;
272:     status: string;
273:     temporal_attributes: unknown[];
274:     metadata: Record<string, unknown>;
275:   }> = [];
276:
277:   for (const [extId, name] of Array.from(allEntities.entries())) {
278:     if (!existingMap.has(extId)) {
279:       newEntities.push({
280:         tenant_id: tenantId,
281:         external_id: extId,
282:         display_name: name,
283:         entity_type: 'individual',
284:         status: 'active',
285:         // HF-199 D3: temporal_attributes populated from field_identities-marked attribute
286:         // columns. Each attribute becomes a temporal record { key, value, effective_from,
287:         // effective_to } per the calc-time materialization surface (run/route.ts:1308-1326).
288:         // Korean Test: keys are column names from HC; no language-specific filtering.
289:         temporal_attributes: buildTemporalAttrs(extId),
290:         metadata: {},
291:       });
292:     }
293:   }
…
309:   // Step 4.5 (HF-199 D3): Update EXISTING entities with attribute projections.
310:   // Idempotent merge: for each existing entity that has attribute values from
311:   // this run, fetch current temporal_attributes, merge new attribute values
312:   // (close prior records on value change; add new for unseen keys; idempotent
313:   // for unchanged values). Per OB-177 pattern at processEntityUnit:461-509.
314:   let updated = 0;
315:   for (const [extId, attrs] of Array.from(entityAttributes.entries())) {
316:     const entityId = existingMap.get(extId);
317:     if (!entityId) continue; // newly-created entities already include attrs in INSERT
318:     if (!attrs || Object.keys(attrs).length === 0) continue;
319:
320:     const { data: current } = await supabase
321:       .from('entities')
322:       .select('temporal_attributes')
323:       .eq('id', entityId)
324:       .single();
325:
326:     const existingAttrs = (current?.temporal_attributes || []) as Array<{ key: string; value: unknown; effective_from: string; effective_to: string | null }>;
327:     const newAttrs = [...existingAttrs];
328:     let changed = false;
329:
330:     for (const [key, value] of Object.entries(attrs)) {
331:       const existingOpen = newAttrs.find(a => a.key === key && a.effective_to === null);
332:       if (existingOpen && existingOpen.value === value) continue; // idempotent
333:       if (existingOpen) {
334:         // Close prior open record on value change
335:         existingOpen.effective_to = importDate;
336:       }
337:       newAttrs.push({ key, value, effective_from: importDate, effective_to: null });
338:       changed = true;
339:     }
340:
341:     if (changed) {
342:       await supabase
343:         .from('entities')
344:         .update({ temporal_attributes: newAttrs as unknown as Json })
345:         .eq('id', entityId);
346:       updated++;
347:     }
348:   }
349:   if (updated > 0) {
350:     console.log(`[Entity Resolution] HF-199 D3: ${updated} existing entities enriched with attribute projections`);
351:   }
…  (lines 353–415 — Step 5 entity_id backfill on committed_data; preserved unchanged)
415: }
```

#### B.3 — Calling sites

```
$ grep -rnE 'resolveEntitiesFromCommittedData\(' web/src/ --include='*.ts'
web/src/lib/sci/entity-resolution.ts:27:export async function resolveEntitiesFromCommittedData(
web/src/lib/sci/post-commit-construction.ts:59:    const result = await resolveEntitiesFromCommittedData(supabase, tenantId);
web/src/lib/sci/calc-time-entity-resolution.ts:92:    await resolveEntitiesFromCommittedData(supabase, tenantId);
```

Two call sites:
- `post-commit-construction.ts:59` — post-import construction (after SCI execute completes)
- `calc-time-entity-resolution.ts:92` — calc-time resolution (idempotent re-run before calc)

#### B.4 — Caller data shape

Both callers pass only `(supabase, tenantId)`. The function fetches `committed_data` rows itself: line 45–49 for batch metadata; line 182–187 for row scan. It reads `field_identities` from `committed_data.metadata.field_identities` (line 81 + 143). No row data is passed by caller.

Data flow:
```
caller (post-commit-construction.ts:59 OR calc-time-entity-resolution.ts:92)
  → resolveEntitiesFromCommittedData(supabase, tenantId)
    → SELECT import_batch_id, metadata FROM committed_data WHERE tenant_id = tenantId
      → discover idColumn (entity_id_field) + attributeColumns (structuralType==='attribute')
    → SELECT row_data FROM committed_data WHERE import_batch_id = X
      → for entity-typed batches: collect attribute values per external_id
    → SELECT id, external_id FROM entities WHERE tenant_id = tenantId
      → existingMap
    → INSERT new entities (with temporal_attributes; metadata: {})
    → UPDATE existing entities (only temporal_attributes; metadata not touched)
    → backfill committed_data.entity_id
```

#### B.5 — Side-by-side: HF-190 vs HF-199 patterns

**INSERT — new entity construction:**

| Site | metadata write | temporal_attributes write | effective_from |
|---|---|---|---|
| HF-190 (`execute-bulk/route.ts:441-446`) | `{ ...meta?.enrichment, ...role, ...licenses }` | `buildTemporalAttrs(meta?.enrichment)` (with `source: 'import'`) | `importDate = today` |
| HF-199 (`entity-resolution.ts:289-290`) | `{}` ← **EMPTY** | `buildTemporalAttrs(extId)` (no `source` field) | `importDate = today` |

```typescript
// HF-190 — execute-bulk/route.ts:441-446
temporal_attributes: buildTemporalAttrs(meta?.enrichment || {}) as Json[],
metadata: {
  ...(meta?.enrichment || {}),  // HF-190: All enrichment fields in metadata for scope resolution
  ...(meta?.role ? { role: meta.role } : {}),
  ...(meta?.licenses ? { product_licenses: meta.licenses } : {}),
} as Record<string, Json>,
```

```typescript
// HF-199 — entity-resolution.ts:289-290
temporal_attributes: buildTemporalAttrs(extId),
metadata: {},
```

**UPDATE — existing entity merge:**

| Site | metadata write | temporal_attributes write |
|---|---|---|
| HF-190 (`execute-bulk/route.ts:495-505`) | unified `{ ...existingMeta, ...meta.enrichment, ...role }` written | `temporal_attributes: newAttrs` written |
| HF-199 (`entity-resolution.ts:341-347`) | not written | `temporal_attributes: newAttrs` written |

```typescript
// HF-190 — execute-bulk/route.ts:495-505
const mergedMeta = {
  ...existingMeta,
  ...meta.enrichment,  // HF-190: All enrichment fields in metadata for scope resolution
  ...(meta.role ? { role: meta.role } : {}),
};
…
await supabase.from('entities').update({
  temporal_attributes: newAttrs as unknown as Json[],
  metadata: mergedMeta as unknown as Json,
}).eq('id', entityId);
```

```typescript
// HF-199 — entity-resolution.ts:341-347
if (changed) {
  await supabase
    .from('entities')
    .update({ temporal_attributes: newAttrs as unknown as Json })
    .eq('id', entityId);
  updated++;
}
```

**Key normalization:**

| Site | Source key | Persisted key |
|---|---|---|
| HF-190 (line 391) | `binding.sourceField` (e.g., `"Tipo_Coordinador"`) | `binding.sourceField.toLowerCase().replace(/[\s]+/g, '_')` (e.g., `"tipo_coordinador"`) |
| HF-199 (line 207) | `colName` from `field_identities` (e.g., `"Tipo_Coordinador"`) | `colName` unchanged (e.g., `"Tipo_Coordinador"`) |

Phase ε empirical evidence in Section E confirms BOTH key cases coexist in the same entity's `temporal_attributes` (HF-190 lowercase + HF-199 capital-case for the same Plantilla columns).

---

### Section C — OB-177 Bridge (`web/src/app/api/calculation/run/route.ts`)

#### C.1 — Bridge location

```
$ grep -nE 'OB-177|materializedState|period_entity_state.*resolved_attributes' web/src/app/api/calculation/run/route.ts | head -20
1280:  // OB-177: Materialize period_entity_state and load for variant matching
1281:  // Resolves entities.temporal_attributes as-of period date into flat resolved_attributes
1282:  const materializedState = new Map<string, Record<string, unknown>>();
1290:      const asOfDate = period?.end_date || new Date().toISOString().split('T')[0];
1293:      const entitiesWithAttrs: Array<{ id: string; temporal_attributes: Json; metadata: Json }> = [];
1299:          .select('id, temporal_attributes, metadata')
1310:          const attrs = (ent.temporal_attributes || []) as Array<{ key: string; value: Json; effective_from: string; effective_to: string | null }>;
1316:            if (attr.effective_from && attr.effective_from > asOfDate) continue;
1317:            if (attr.effective_to && attr.effective_to < asOfDate) continue;
1324:            materializedState.set(ent.id, resolved);
1327:        if (materializedState.size > 0) {
1328:          addLog(`OB-177 Materialized: ${materializedState.size} entities with resolved attributes`);
1332:      // Write to period_entity_state for audit trail
1334:        await supabase.from('period_entity_state').delete().eq('tenant_id', tenantId).eq('period_id', periodId);
1335:        const pesRows = Array.from(materializedState.entries()).map(([entityId, resolved]) => ({
1346:          await supabase.from('period_entity_state').insert(pesRows.slice(i, i + PES_BATCH));
1350:      console.warn('[OB-177] Materialization failed (non-blocking):', matErr);
1360:      const resolvedAttrs = materializedState.get(eid);
1365:      addLog(`[VARIANT-DIAG] ${eName}: materializedState=${JSON.stringify(resolvedAttrs || {})}`);
1414:    // OB-177: PRIMARY source is materializedState (period_entity_state resolved_attributes)
1422:      // OB-177: Read from materialized state FIRST (Living → Materialized layer)
1423:      const resolvedAttrs = materializedState.get(entityId);
```

#### C.2 — Full bridge surface (lines 1280–1352)

```typescript
1280:  // OB-177: Materialize period_entity_state and load for variant matching
1281:  // Resolves entities.temporal_attributes as-of period date into flat resolved_attributes
1282:  const materializedState = new Map<string, Record<string, unknown>>();
1283:  if (variants.length > 1) {
1284:    try {
1285:      const { data: period } = await supabase
1286:        .from('periods')
1287:        .select('end_date')
1288:        .eq('id', periodId)
1289:        .single();
1290:      const asOfDate = period?.end_date || new Date().toISOString().split('T')[0];
1291:
1292:      // OB-190: Batch entity fetch to avoid Supabase .in() URL length limits
1293:      const entitiesWithAttrs: Array<{ id: string; temporal_attributes: Json; metadata: Json }> = [];
1294:      const MAT_BATCH = 200;
1295:      for (let i = 0; i < calculationEntityIds.length; i += MAT_BATCH) {
1296:        const batch = calculationEntityIds.slice(i, i + MAT_BATCH);
1297:        const { data: page, error: matFetchErr } = await supabase
1298:          .from('entities')
1299:          .select('id, temporal_attributes, metadata')
1300:          .eq('tenant_id', tenantId)
1301:          .in('id', batch);
1302:        if (matFetchErr) {
1303:          console.warn(`[OB-190] Materialization batch ${i}-${i + batch.length} error:`, matFetchErr.message);
1304:        }
1305:        if (page) entitiesWithAttrs.push(...page);
1306:      }
1307:
1308:      if (entitiesWithAttrs.length > 0) {
1309:        for (const ent of entitiesWithAttrs) {
1310:          const attrs = (ent.temporal_attributes || []) as Array<{ key: string; value: Json; effective_from: string; effective_to: string | null }>;
1311:          const resolved: Record<string, unknown> = {};
1312:          // Resolve each temporal attribute as-of period date
1313:          const sorted = [...attrs].sort((a, b) => (b.effective_from || '').localeCompare(a.effective_from || ''));
1314:          for (const attr of sorted) {
1315:            if (attr.key in resolved) continue;
1316:            if (attr.effective_from && attr.effective_from > asOfDate) continue;
1317:            if (attr.effective_to && attr.effective_to < asOfDate) continue;
1318:            resolved[attr.key] = attr.value;
1319:          }
1320:          // Also include metadata.role if present (backward compat)
1321:          const meta = (ent.metadata || {}) as Record<string, unknown>;
1322:          if (meta.role && !resolved['role']) resolved['role'] = meta.role;
1323:          if (Object.keys(resolved).length > 0) {
1324:            materializedState.set(ent.id, resolved);
1325:          }
1326:        }
1327:        if (materializedState.size > 0) {
1328:          addLog(`OB-177 Materialized: ${materializedState.size} entities with resolved attributes`);
1329:        }
1330:      }
1331:
1332:      // Write to period_entity_state for audit trail
1333:      if (materializedState.size > 0) {
1334:        await supabase.from('period_entity_state').delete().eq('tenant_id', tenantId).eq('period_id', periodId);
1335:        const pesRows = Array.from(materializedState.entries()).map(([entityId, resolved]) => ({
1336:          tenant_id: tenantId,
1337:          entity_id: entityId,
1338:          period_id: periodId,
1339:          resolved_attributes: resolved as Json,
1340:          resolved_relationships: {} as Json,
1341:          entity_type: 'individual',
1342:          status: 'active',
1343:        }));
1344:        const PES_BATCH = 1000;
1345:        for (let i = 0; i < pesRows.length; i += PES_BATCH) {
1346:          await supabase.from('period_entity_state').insert(pesRows.slice(i, i + PES_BATCH));
1347:        }
1348:      }
1349:    } catch (matErr) {
1350:      console.warn('[OB-177] Materialization failed (non-blocking):', matErr);
1351:    }
1352:  }
```

Filter conditions verbatim:
- Line 1316: `if (attr.effective_from && attr.effective_from > asOfDate) continue;` — excludes future-dated entries
- Line 1317: `if (attr.effective_to && attr.effective_to < asOfDate) continue;` — excludes past-expired entries
- Line 1322: `if (meta.role && !resolved['role']) resolved['role'] = meta.role;` — only `role` key fallback from metadata

`asOfDate = period?.end_date || today` (line 1290).

Bridge gates on `variants.length > 1` (line 1283); single-variant plans skip materialization entirely.

#### C.3 — Bridge invocation context

The bridge is inline in the calc-time orchestrator. Lines 1250–1283 set up `variantTokenize`, `variantTokenSets`, `variantDiscriminants`; line 1283 enters bridge block conditional on `variants.length > 1`:

```typescript
1250:  // HF-119: Token overlap variant matching — build token sets once before entity loop
1251:  const variantTokenize = (text: string): string[] =>
1252:    text
1253:      .toLowerCase()
1254:      .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove accents
1255:      .replace(/[^a-z0-9\s_]/g, ' ')
1256:      .split(/[\s_]+/)
1257:      .filter(t => t.length > 2);
1258:
1259:  const variantTokenSets = variants.map(v => {
1260:    const text = [
1261:      String(v.variantName ?? ''),
1262:      String(v.description ?? ''),
1263:      String(v.variantId ?? ''),
1264:    ].join(' ');
1265:    return new Set(variantTokenize(text));
1266:  });
1267:
1268:  // Discriminant tokens: tokens unique to each variant (not in any other variant)
1269:  const variantDiscriminants = variantTokenSets.map((tokens, i) => {
1270:    const otherTokens = new Set<string>();
1271:    variantTokenSets.forEach((t, j) => { if (j !== i) t.forEach(tok => otherTokens.add(tok)); });
1272:    return new Set(Array.from(tokens).filter(t => !otherTokens.has(t)));
1273:  });
…
1283:  if (variants.length > 1) {                ← bridge block opens
…
1352:  }                                          ← bridge block closes
```

#### C.4 — Variant discrimination consumer of `materializedState`

```typescript
1354:  // OB-190: VARIANT-DIAG — trace why variant matching fails for first 3 entities
1355:  if (variants.length > 1) {
1356:    let diagCount = 0;
1357:    for (const eid of calculationEntityIds) {
1358:      if (diagCount >= 3) break;
1359:      diagCount++;
1360:      const resolvedAttrs = materializedState.get(eid);
1361:      const eInfo = entityMap.get(eid);
1362:      const eRowsFlat = flatDataByEntity.get(eid) || [];
1363:      const eName = eInfo?.display_name ?? eid;
1364:
1365:      addLog(`[VARIANT-DIAG] ${eName}: materializedState=${JSON.stringify(resolvedAttrs || {})}`);
1366:      const eMeta = (eInfo as { metadata?: Record<string, unknown> })?.metadata;
1367:      addLog(`[VARIANT-DIAG] ${eName}: metadata.role=${JSON.stringify(eMeta?.role || 'NONE')}`);
1368:      const sampleRd = eRowsFlat.length > 0 ? (eRowsFlat[0] as { row_data?: Record<string, unknown> })?.row_data : null;
1369:      addLog(`[VARIANT-DIAG] ${eName}: flatDataRows=${eRowsFlat.length}, sampleRowKeys=${sampleRd ? Object.keys(sampleRd).join(',') : 'NONE'}`);
1370:
1371:      // Show what tokens would be generated from materializedState
1372:      const testTokens = new Set<string>();
1373:      if (resolvedAttrs) {
1374:        for (const val of Object.values(resolvedAttrs)) {
1375:          if (typeof val === 'string' && val.length > 1) {
1376:            for (const token of variantTokenize(val)) {
1377:              testTokens.add(token);
1378:            }
1379:          }
1380:        }
1381:      }
1382:      addLog(`[VARIANT-DIAG] ${eName}: generated tokens=[${Array.from(testTokens).join(',')}]`);
1383:      addLog(`[VARIANT-DIAG] ${eName}: V0 disc=[${Array.from(variantDiscriminants[0] || []).join(',')}], V1 disc=[${Array.from(variantDiscriminants[1] || []).join(',')}]`);
1384:    }
1385:    addLog(`[VARIANT-DIAG] materializedState.size=${materializedState.size}, calculationEntityIds.length=${calculationEntityIds.length}`);
1386:  }
1387:
1388:  // OB-194: Track excluded entities
1389:  const excludedEntities: Array<{ entityId: string; entityName: string; externalId: string; reason: string; tokens: string }> = [];
1390:
1391:  for (const entityId of calculationEntityIds) {
…
1413:    // HF-119: Token overlap variant matching — cross-language, structural
1414:    // OB-177: PRIMARY source is materializedState (period_entity_state resolved_attributes)
1415:    // FALLBACK: flatDataByEntity (committed_data entity_id FK path)
1416:    let selectedComponents = defaultComponents;
1417:    let selectedVariantIndex = 0;
1418:    if (variants.length > 1) {
1419:      // Build entity token set
1420:      const entityTokens = new Set<string>();
1421:
1422:      // OB-177: Read from materialized state FIRST (Living → Materialized layer)
1423:      const resolvedAttrs = materializedState.get(entityId);
1424:      if (resolvedAttrs && Object.keys(resolvedAttrs).length > 0) {
1425:        for (const val of Object.values(resolvedAttrs)) {
1426:          if (typeof val === 'string' && val.length > 1) {
1427:            for (const token of variantTokenize(val)) {
1428:              entityTokens.add(token);
1429:            }
1430:          }
1431:        }
1432:      }
1433:
1434:      // Fallback: also read from flatDataByEntity (committed_data rows)
1435:      if (entityTokens.size === 0) {
1436:        for (const row of entityRowsFlat) {
1437:          const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
1438:            ? row.row_data as Record<string, unknown> : {};
1439:          for (const val of Object.values(rd)) {
1440:            if (typeof val === 'string' && val.length > 1) {
1441:              for (const token of variantTokenize(val)) {
1442:                entityTokens.add(token);
1443:              }
1444:            }
1445:          }
1446:        }
1447:      }
1448:
1449:      // Score by discriminant token matches
1450:      const discScores = variantDiscriminants.map((disc, i) => {
1451:        const matched = Array.from(disc).filter(t => entityTokens.has(t));
1452:        return { index: i, matches: matched.length, tokens: matched };
1453:      });
…  (lines 1454–1513 — variant scoring, total-overlap fallback, OB-194 NO MATCH exclusion)
```

Tokens are built from `Object.values(resolvedAttrs)` (line 1425) — values only, keys ignored. Fallback at line 1435 reads `flatDataByEntity` (committed_data row_data values) when materializedState is empty.

---

### Section D — Convergence HF-114 Surface (`web/src/lib/intelligence/convergence-service.ts`)

#### D.1 — HF-199 γ phase locations

```
$ wc -l web/src/lib/intelligence/convergence-service.ts
    2333 web/src/lib/intelligence/convergence-service.ts

$ grep -nE 'HF-199|HF-114|resolveColumnMappingsViaAI|generateAllComponentBindings|metricComprehension|BOUNDARY_FALLBACK_MIN_SCORE|loadMetricComprehension' web/src/lib/intelligence/convergence-service.ts | head -40
135:  // HF-196 Phase 3: D153 B-E4 atomic cutover — metricComprehension is the
146:    metricComprehension: MetricComprehensionSignal[];
177:  // HF-196 Phase 3: metricComprehension is read unconditionally (not gated on
179:  const observations: ConvergenceResult['observations'] = { withinRun: [], crossRun: [], metricComprehension: [] };
199:  const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
200:  observations.metricComprehension = metricComprehensionSignals;
201:  if (metricComprehensionSignals.length > 0) {
202:    console.log(`[Convergence] HF-196 D153 cutover: ${metricComprehensionSignals.length} metric_comprehension signals loaded as operative input (rule_set=${ruleSetId})`);
292:  // HF-112 / HF-199 D2: Generate all component bindings with AI mapping + boundary validation.
293:  // metricComprehension signals (HF-198 E5) flow through as authoritative semantic intent,
297:  await generateAllComponentBindings(components, matches, capabilities, componentBindings, existingConvergenceBindings, observations.metricComprehension);
522:      const matchedSignal = observations.metricComprehension.find(sig => {
757:async function loadMetricComprehensionSignals(
1681:async function resolveColumnMappingsViaAI(
1685:  metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2
1690:  // HF-199 D2: Build per-metric semantic intent map from comprehension signals.
1697:    const matchedSignal = metricComprehension.find(sig => {
1730:  // HF-114 / HF-199 D2: User prompt now carries plan-agent semantic intent per metric
1749:    // HF-114: convergence_mapping task type — purpose-built system prompt + passthrough user prompt
1760:      console.error(`[Convergence] HF-114 AI response invalid (keys: ${Object.keys(result).join(', ')}). Falling back to boundary matching.`);
1770:    console.log(`[Convergence] HF-114 AI mapping: ${JSON.stringify(mapping)}`);
1773:    console.error('[Convergence] HF-114 AI mapping failed:', err);
1784:async function generateAllComponentBindings(
1790:  metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2: E5 signals threaded through
1848:  // HF-112 / HF-199 D2: AI-assisted column mapping (ONE call) with metric_comprehension
1851:  const aiMapping = await resolveColumnMappingsViaAI(components, allRequirements, measureColumns, metricComprehension);
1893:      // HF-199 D2: structured threshold raised from `> 0` to `>= 0.50`. Below
1899:      const BOUNDARY_FALLBACK_MIN_SCORE = 0.50;
1908:      if (candidates.length > 0 && candidates[0].score >= BOUNDARY_FALLBACK_MIN_SCORE) {
1921:        console.log(`[Convergence] HF-199 D2: ${comp.name}:${req.role} boundary candidate "${candidates[0].name}" rejected (score=${candidates[0].score.toFixed(2)} < ${BOUNDARY_FALLBACK_MIN_SCORE} threshold). Requirement left unbound; gap will be recorded.`);
```

#### D.2 — `resolveColumnMappingsViaAI` full function body (lines 1680–1777)

```typescript
1680: // One AI call: match plan metric field names to data column contextual identities
1681: async function resolveColumnMappingsViaAI(
1682:   components: PlanComponent[],
1683:   allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }>,
1684:   measureColumns: Array<{ name: string; fi: FieldIdentity; stats: ColumnValueStats }>,
1685:   metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2
1686: ): Promise<Record<string, string>> {
1687:   const metricFields = allRequirements.map(r => r.req.metricField).filter(f => f !== 'unknown');
1688:   const columnNames = measureColumns.map(c => c.name);
1689:
1690:   // HF-199 D2: Build per-metric semantic intent map from comprehension signals.
1691:   // Match by component name (signal.metric_label) and then by metricField. Per
1692:   // AUD-004 v3 §2 E5, plan-agent semantic intent is authoritative; AI prompt
1693:   // includes it so column-to-metric binding has structured plan context.
1694:   const semanticIntentByMetricField = new Map<string, { intent: string; inputs: string }>();
1695:   for (const r of allRequirements) {
1696:     const ownerComp = components.find(c => c.name === r.compName);
1697:     const matchedSignal = metricComprehension.find(sig => {
1698:       const sv = sig.signal_value as Record<string, unknown> | null;
1699:       if (!sv) return false;
1700:       const sigLabel = (sv.metric_label as string | undefined) ?? '';
1701:       return sigLabel === r.compName || sigLabel === ownerComp?.name;
1702:     });
1703:     if (matchedSignal) {
1704:       const sv = (matchedSignal.signal_value ?? {}) as Record<string, unknown>;
1705:       const intent = (sv.semantic_intent as string | undefined) ?? '';
1706:       const inputs = sv.metric_inputs ? JSON.stringify(sv.metric_inputs).slice(0, 200) : '';
1707:       if (intent || inputs) {
1708:         semanticIntentByMetricField.set(r.req.metricField, { intent, inputs });
1709:       }
1710:     }
1711:   }
1712:
1713:   // Build metric list with semantic intent annotations when available
1714:   const metricList = metricFields.map((f, i) => {
1715:     const ctx = semanticIntentByMetricField.get(f);
1716:     if (ctx) {
1717:       const parts = [`${i + 1}. "${f}"`];
1718:       if (ctx.intent) parts.push(`   plan-agent intent: ${ctx.intent}`);
1719:       if (ctx.inputs) parts.push(`   plan-agent inputs: ${ctx.inputs}`);
1720:       return parts.join('\n');
1721:     }
1722:     return `${i + 1}. "${f}"`;
1723:   }).join('\n');
1724:
1725:   // Build column list with contextual identities
1726:   const columnList = measureColumns.map((c, i) =>
1727:     `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})`
1728:   ).join('\n');
1729:
1730:   // HF-114 / HF-199 D2: User prompt now carries plan-agent semantic intent per metric
1731:   // when comprehension:plan_interpretation signals are present (HF-198 E5 read).
1732:   // System prompt is defined in SYSTEM_PROMPTS['convergence_mapping'] (anthropic-adapter.ts).
1733:   const userPrompt = `Match each metric field to the best data column. Each column used at most once.
1734: Plan-agent intent and inputs (when shown) are AUTHORITATIVE — bind columns that
1735: satisfy the stated intent over columns that merely share contextual labels.
1736:
1737: METRIC FIELDS:
1738: ${metricList}
1739:
1740: DATA COLUMNS:
1741: ${columnList}
1742:
1743: EXAMPLE OUTPUT:
1744: {"${metricFields[0] || 'metric_a'}": "${columnNames[0] || 'Column_A'}", "${metricFields[1] || 'metric_b'}": "${columnNames[1] || 'Column_B'}"}`;
1745:
1746:   try {
1747:     const aiService = getAIService();
1748:
1749:     // HF-114: convergence_mapping task type — purpose-built system prompt + passthrough user prompt
1750:     const response = await aiService.execute({
1751:       task: 'convergence_mapping',
1752:       input: { userMessage: userPrompt },
1753:       options: { maxTokens: 500, responseFormat: 'json' as const },
1754:     }, false);
1755:
1756:     const result = response.result as Record<string, unknown>;
1757:
1758:     // Validate: at least some keys are metric fields with values being column names
1759:     if (!isValidColumnMapping(result, metricFields, columnNames)) {
1760:       console.error(`[Convergence] HF-114 AI response invalid (keys: ${Object.keys(result).join(', ')}). Falling back to boundary matching.`);
1761:       return {};
1762:     }
1763:
1764:     const mapping: Record<string, string> = {};
1765:     for (const [key, val] of Object.entries(result)) {
1766:       if (typeof val === 'string' && columnNames.includes(val)) {
1767:         mapping[key] = val;
1768:       }
1769:     }
1770:     console.log(`[Convergence] HF-114 AI mapping: ${JSON.stringify(mapping)}`);
1771:     return mapping;
1772:   } catch (err) {
1773:     console.error('[Convergence] HF-114 AI mapping failed:', err);
1774:   }
1775:
1776:   return {};
1777: }
```

#### D.3 — `generateAllComponentBindings` metricComprehension flow

```typescript
1784: async function generateAllComponentBindings(
1785:   components: PlanComponent[],
1786:   matches: BindingMatch[],
1787:   capabilities: DataCapability[],
1788:   bindings: Record<string, Record<string, ComponentBinding>>,
1789:   existingConvergenceBindings: Record<string, Record<string, unknown>> | undefined,
1790:   metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2: E5 signals threaded through
1791: ): Promise<void> {
…
1848:   // HF-112 / HF-199 D2: AI-assisted column mapping (ONE call) with metric_comprehension
1849:   // signals as authoritative semantic intent.
1850:   console.log('[Convergence] HF-112 Requesting AI column mapping');
1851:   const aiMapping = await resolveColumnMappingsViaAI(components, allRequirements, measureColumns, metricComprehension);
1852:   console.log(`[Convergence] HF-112 AI proposed ${Object.keys(aiMapping).length} mappings`);
```

Caller in `convergeBindings`:

```typescript
292:   // HF-112 / HF-199 D2: Generate all component bindings with AI mapping + boundary validation.
293:   // metricComprehension signals (HF-198 E5) flow through as authoritative semantic intent,
294:   // raising binding accuracy and the boundary-fallback acceptance threshold.
295:   const existingConvergenceBindings = (ruleSet.input_bindings as Record<string, unknown>)?.convergence_bindings as
296:     Record<string, Record<string, unknown>> | undefined;
297:   await generateAllComponentBindings(components, matches, capabilities, componentBindings, existingConvergenceBindings, observations.metricComprehension);
```

#### D.4 — Boundary fallback threshold (HF-199 D2)

```typescript
1880:           column: proposedColumnName,
1881:           field_identity: mc.fi,
1882:           match_pass: isValidated ? 1 : 2,  // 1=AI+validated, 2=AI-only
1883:           confidence: isValidated ? 0.9 : 0.6,
1884:           scale_factor: scaleFactor !== 1 ? scaleFactor : undefined,
1885:         };
1886:         boundColumns.add(proposedColumnName);
1887:         console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${proposedColumnName} (AI${isValidated ? '+validated' : ''}, scale=${scaleFactor})`);
1888:         continue;
1889:       }
1890:     }
1891:
1892:     // Fallback: boundary matching for unmapped requirements (HF-111 logic)
1893:     // HF-199 D2: structured threshold raised from `> 0` to `>= 0.50`. Below
1894:     // threshold, the boundary fallback is structurally too weak to bind reliably
1895:     // (DIAG evidence: New Accounts:actual → Año at score=0.10 produced
1896:     // 506× peer-median ratio anomaly). Below-threshold candidates are rejected
1897:     // and the requirement remains unbound; downstream gap detection records
1898:     // it as a convergence gap rather than silently binding the wrong column.
1899:     const BOUNDARY_FALLBACK_MIN_SCORE = 0.50;
1900:     const candidates = measureColumns
1901:       .filter(mc => !boundColumns.has(mc.name))
1902:       .map(mc => {
1903:         const { score, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
1904:         return { ...mc, score, scaleFactor };
1905:       })
1906:       .sort((a, b) => b.score - a.score);
1907:
1908:     if (candidates.length > 0 && candidates[0].score >= BOUNDARY_FALLBACK_MIN_SCORE) {
1909:       const best = candidates[0];
1910:       bindings[compKey][req.role] = {
1911:         source_batch_id: best.batchId,
1912:         column: best.name,
1913:         field_identity: best.fi,
1914:         match_pass: 3,  // Boundary-only fallback
1915:         confidence: Math.min(0.7, match.matchConfidence * (0.3 + best.score * 0.4)),
1916:         scale_factor: best.scaleFactor !== 1 ? best.scaleFactor : undefined,
1917:       };
1918:       boundColumns.add(best.name);
1919:       console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${best.name} (boundary fallback, score=${best.score.toFixed(2)})`);
1920:     } else if (candidates.length > 0) {
1921:       console.log(`[Convergence] HF-199 D2: ${comp.name}:${req.role} boundary candidate "${candidates[0].name}" rejected (score=${candidates[0].score.toFixed(2)} < ${BOUNDARY_FALLBACK_MIN_SCORE} threshold). Requirement left unbound; gap will be recorded.`);
1922:     }
1923:   }
```

#### D.5 — `metric_comprehension` signal loading (E5 read)

```typescript
757: async function loadMetricComprehensionSignals(
758:   tenantId: string,
759:   ruleSetId: string,
760:   supabase: SupabaseClient,
761: ): Promise<MetricComprehensionSignal[]> {
762:   const { data, error } = await supabase
763:     .from('classification_signals')
764:     .select('signal_value, confidence, rule_set_id')
765:     .eq('tenant_id', tenantId)
766:     .eq('rule_set_id', ruleSetId)
767:     .eq('signal_type', 'comprehension:plan_interpretation')
768:     .order('created_at', { ascending: false });
769:
770:   if (error) {
771:     console.warn(`[Convergence] metric_comprehension signal read failed (non-blocking): ${error.message}`);
772:     return [];
773:   }
774:   return (data ?? []) as MetricComprehensionSignal[];
775: }
```

Caller in `convergeBindings` (lines 199–202):

```typescript
199:   const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
200:   observations.metricComprehension = metricComprehensionSignals;
201:   if (metricComprehensionSignals.length > 0) {
202:     console.log(`[Convergence] HF-196 D153 cutover: ${metricComprehensionSignals.length} metric_comprehension signals loaded as operative input (rule_set=${ruleSetId})`);
```

Read query filters by `(tenant_id, rule_set_id, signal_type='comprehension:plan_interpretation')`. Order: `created_at` descending.

---

### Section E — Empirical State

#### E.1 — Silvia Pérez Rodríguez record + period_entity_state output

```
$ cd web && npx tsx scripts/diag-hf-200b-silvia-state.ts

=== Silvia Pérez Rodríguez (or matches) ===
--- entity_id=463dc8ce-bd01-4253-908d-5fa2324279f9 external_id=70028 display=Silvia Pérez Rodríguez ---
  entity_type: individual
  created_at: 2026-05-04T21:16:14.210752+00:00
  updated_at: 2026-05-04T23:47:00.732987+00:00
  metadata: {
  "region": "Norte",
  "hub_asignado": "Monterrey Hub",
  "fecha_ingreso": "2021-02-12",
  "tipo_coordinador": "Coordinador"
}
  temporal_attributes: [
  {
    "key": "tipo_coordinador",
    "value": "Coordinador",
    "source": "import",
    "effective_to": null,
    "effective_from": "2026-05-04"
  },
  {
    "key": "region",
    "value": "Norte",
    "source": "import",
    "effective_to": null,
    "effective_from": "2026-05-04"
  },
  {
    "key": "fecha_ingreso",
    "value": "2021-02-12",
    "source": "import",
    "effective_to": null,
    "effective_from": "2026-05-04"
  },
  {
    "key": "Region",
    "value": "Norte",
    "effective_to": null,
    "effective_from": "2026-05-04"
  },
  {
    "key": "Hub_Asignado",
    "value": "Monterrey Hub",
    "effective_to": null,
    "effective_from": "2026-05-04"
  },
  {
    "key": "Fecha_Ingreso",
    "value": "2021-02-12",
    "effective_to": null,
    "effective_from": "2026-05-04"
  },
  {
    "key": "Tipo_Coordinador",
    "value": "Coordinador",
    "effective_to": null,
    "effective_from": "2026-05-04"
  },
  {
    "key": "hub_asignado",
    "value": "Monterrey Hub",
    "effective_to": null,
    "effective_from": "2026-05-04"
  }
]

=== Recent Periods ===
  id=059cddeb-331c-462a-b0f3-fbd2199ff90c label=January 2025 2025-01-01..2025-01-31 status=open

=== period_entity_state for Silvia in January 2025 ===
Rows: 0

=== Total period_entity_state rows for tenant in January 2025: 0 ===

=== Hub entities sample ===
--- CDMX Hub (CDMX Hub) ---
  entity_type: individual
  metadata: {}
  temporal_attributes count: 0
--- Querétaro Hub (Querétaro Hub) ---
  entity_type: individual
  metadata: {}
  temporal_attributes count: 0
--- Puebla Hub (Puebla Hub) ---
  entity_type: individual
  metadata: {}
  temporal_attributes count: 0
```

Observations (no synthesis):
- `metadata` populated with 4 lowercase keys (`region`, `hub_asignado`, `fecha_ingreso`, `tipo_coordinador`) per HF-190 normalization at execute-bulk:391.
- `temporal_attributes` carries 8 entries — 4 lowercase with `source: 'import'` (HF-190 shape per execute-bulk:425), 4 capital-case without `source` (HF-199 shape per entity-resolution:259-264). All 8 have `effective_from: '2026-05-04'`.
- `period_entity_state`: 0 rows for January 2025 period (`end_date='2025-01-31'`).
- Hub entities (3 sampled): `metadata: {}`, `temporal_attributes count: 0` — neither HF-190 nor HF-199 populated; Hubs are reference-typed batches and HF-199 limits projection to `isEntityBatch` (entity-resolution:177, 205).

---

## ARCHITECT HANDOFF

This document is raw code only. No synthesis, no fix proposals, no verdicts beyond DIAG-HF-200's H1/H2/H3.

Architect dispositions HF-200 fix shape against this code with the following empirically grounded options:

- **Option A** — Mirror HF-190 pattern at HF-199 site (Sections A.2 vs B.2 side-by-side; B.5 contrasts written explicitly)
- **Option B** — Generalize OB-177 bridge to surface metadata structurally (Section C.2 fallback at lines 1320-1322)
- **Option C** — Align effective_from semantic across HF-190 + HF-199 (Sections A.5 + B.2 lines 256-265)
- **Option D** — Combined Options A + B + C
- **Option E** — Defer D2 convergence binding to HF-201; HF-200 closes D3 only (Sections D.2 + D.4 still relevant for HF-201 forward)
- **Option F** — Other shape architect identifies from reading the extracted code

No HF-200 directive will be drafted until architect dispositions Option from this document.
