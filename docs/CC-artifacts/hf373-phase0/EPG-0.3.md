# HF-373 Phase 0 — EPG-0.3

**Verdict:** PARTIAL

**Root cause:** At roster commit time, commit-content-unit.ts resolveEntityIdField found TWO model-recognized entity-scope identifier candidates (ID_Gerente and ID_Empleado — both genuinely carry the bare primitives scope_role='entity' + nature_role='identifier' in the live HC trace and v5 atoms, so HF-368 recognition alone cannot discriminate) and handed selection to the developer statistic selectEntityIdFieldByOverlap (commit-content-unit.ts:243-277). Branch (a) value-overlap tied at 100%/100% because the manager column is a self-referential FK whose 13 values are all employee ids (subset of the entity domain), so the strict `ranked[0].overlapFrac > ranked[1].overlapFrac` gate failed; branch (b) "finest repeating identifier" then filtered on repeatRatio > 1.1, which EXCLUDES a roster's true per-row identifier by construction (85 distinct/85 rows = 1.0x) and selected the only repeating candidate, ID_Gerente (distinct=13, 6.5x) — emitting the exact quoted log at commit-content-unit.ts:329 with the reason string from :271 (which mislabels the populated-domain fall-through as "cold-start"). The wrong choice was PERSISTED as metadata.entity_id_field="ID_Gerente" on all 85 roster committed_data rows; entity-resolution.ts honors that field as authoritative (:222-225) and backfilled entity_id from row_data[ID_Gerente] (:582-623), mis-attributing 84/85 roster rows to the manager's entity (1 null for the blank-manager CEO row). Entity CREATION escaped only via an unrelated path: processEntityUnit (execute-bulk route.ts:1107-1112) preferred the negotiation binding ID_Empleado→entity_identifier@0.95, which agreed with the model candidate set — and that binding was only correct because agents.ts:80's surviving OB-231 English prose-regex matched "foreign key" in ID_Gerente's data_nature prose and diverted it to entity_relationship@0.75 (agents.ts:143-145). Net: two co-resident selection surfaces (creation vs entity_id_field) disagreed in the same run; the developer statistic overrode structurally available truth (row-bijection + value-subset FK signature), and the persisted metadata corrupted roster row linkage.

**HALT-1 notes:** Three framing corrections, each live-proven. (1) NOT actually cold-start: the 85 entities were created at 2026-07-02T00:55:17.674Z, BEFORE the roster commitContentUnit ran (roster committed_data created_at 00:55:18.134Z), so readTenantEntityDomain returned a populated 85-id domain. Branch (a) value-domain overlap DID run but TIED at 100% for both candidates — all 13 ID_Gerente values are a subset of ID_Empleado values (self-referential manager FK), so overlapFrac was 1.0 vs 1.0 and the strict `>` tie-break failed. Control fell to branch (b), whose reason string hardcodes the label "cold-start" even when the domain is populated (commit-content-unit.ts:271). Branch (b)'s `repeatRatio > 1.1` filter then EXCLUDED the true id (ID_Empleado: 85 distinct / 85 rows = 1.0x — unique per row on a roster, exactly as a roster id must be) and left ID_Gerente (13 distinct, 6.5x) as the ONLY "repeating" candidate → chosen. The heuristic was designed for transaction sheets (entity id repeats there); on an entity/roster sheet it structurally inverts and is guaranteed to prefer a grouping/manager column. (2) "Downstream outcomes happened to survive" is WRONG for roster linkage: all 85 roster committed_data rows persisted metadata.entity_id_field="ID_Gerente", and entity-resolution honors metadata.entity_id_field as the authoritative idColumn (entity-resolution.ts:214-225) then backfills entity_id from row_data[idColumn] (582-623) → live check shows 84/85 roster rows have entity_id pointing at the MANAGER's entity (row ID_Empleado=BCL-5015 → entity BCL-5002) and 1 row null (the CEO, blank ID_Gerente). Only entity CREATION survived (85 correct external_ids BCL-5001..5085), and only because processEntityUnit independently honored the negotiation binding ID_Empleado→entity_identifier (execute-bulk route.ts:1107-1112) — and THAT binding was correct only because a surviving OB-231 English prose-regex (agents.ts:80 NATURE_IS_REFERENCE_KEY matching "foreign key" in ID_Gerente's data_nature prose) diverted ID_Gerente to entity_relationship@0.75. I.e. the correct outcome depended on a Korean-Test-violating word list that HF-367 flagged as a residual for eradication. (3) The directive's fix formula "model recognition (scope_role=entity AND nature_role=identifier) + row-ordinal guard, loud gap when absent" is UNDERSPECIFIED for this exact sheet: BOTH ID_Empleado (0.98) and ID_Gerente (0.97) carry scope_role=entity + nature_role=identifier (live HC trace AND live v5 atoms), so recognition-by-bare-primitive alone yields TWO candidates; and ID_Gerente's values are "BCL-XXXX" strings, so looksLikeRowIndex can never reject it. Something must discriminate: either a structural fact (on an entity-classified sheet the entity id is bijective with rows — 85/85 unique — while a self-referential FK repeats AND its value set is a strict subset of the other candidate's) or an extended bare primitive where the model itself names "reference to another instance of the same entity" (its prose already says exactly this: "self-referential foreign key", "References ID_Empleado in the same sheet" — but those channels are prose, forbidden to word-match under HF-368 law).

**Fix implications:** WHAT THE FIX MUST DO. (1) Remove/replace the developer statistic selectEntityIdFieldByOverlap (web/src/lib/sci/commit-content-unit.ts:243-277) as the multi-candidate discriminator — but NOT with "recognition alone": live evidence proves both roster columns legitimately carry scope_role=entity + nature_role=identifier, so the directive's formula (recognition + row-ordinal guard + loud gap) yields TWO candidates on this sheet and the row-ordinal guard (looksLikeRowIndex, entity-resolution.ts:18-28) cannot reject "BCL-XXXX" values. The fix needs ONE of: (i) a structural discriminator that is a Korean-clean arithmetic fact — on an ENTITY-classified sheet the entity id is bijective with rows (ID_Empleado 85 distinct/85 rows) while a self-referential FK repeats AND its distinct-value set is a strict subset of the bijective candidate's (13/13 ⊆ 85 — live-proven); classification-aware: on transaction sheets the current repeat expectation is inverted (there the entity id DOES repeat); or (ii) extend the bare-primitive vocabulary so the MODEL names the distinction (the producer prompt anthropic-adapter.ts:876-894 + skeleton validation in structural-primitives.ts + HeaderInterpretation in sci-types.ts:104-120 + atom write path header-comprehension.ts:593-595/atom-flywheel.ts) — e.g. a key primitive distinguishing "identifier OF this row's subject" from "reference TO another instance"; the model's prose already states this exactly ("self-referential foreign key", relationships: "References ID_Empleado in the same sheet") but prose must never be word-matched (HF-368 law; the surviving agents.ts:79-85 OB-231 prose regexes that accidentally saved entity creation this run are themselves slated for eradication and must not become the fix). If neither discriminates → C2 loud gap (fail the unit, name competitors), never a silent statistic. (2) ONE selection consumed by ALL surfaces: this run had creation keyed on ID_Empleado (execute-bulk route.ts:1107-1112 via binding-agrees-with-model) while committed metadata got entity_id_field=ID_Gerente (commit-content-unit resolveEntityIdField) — the same import wrote two different answers; also fix the third call site commitUnitStreamed (windowed-commit.ts:266-288) and the first-match findHcEntityIdColumn (commit-content-unit.ts:216-220, returns emission-order-first = ID_Gerente on this sheet). (3) RETAIN the HF-371 EPG-C1 row-ordinal guard verbatim (execute-bulk route.ts:1129-1138 applying looksLikeRowIndex to the FINAL chosen id) — it closes a different hole (ordinal '#' columns) and is orthogonal. (4) Fix the misleading "cold-start" reason label (commit-content-unit.ts:271) or delete it with the branch — the live run was NOT cold-start (entities existed 0.46s before commit; branch (a) tied at 100%/100%). (5) Rewrite web/src/lib/sci/__tests__/hf351-entity-id-selection.test.ts (line 46 asserts the defective "finest repeating identifier" behavior). CONSTRAINTS OBSERVED: read path is jsonb-additive (proposal.contentUnits[].classificationTrace.headerComprehension.interpretations + structural_fingerprints.column_roles) — extending primitives requires an ATOM_ALGORITHM_VERSION bump (currently 5, atom-fingerprint.ts:45; HF-369 lesson: schema change without bump = stale warm recall) and prompt+skeleton+type changes together; no SQL migration strictly required for option (i). DATA REPAIR: VLTEST2 roster batch is live-corrupted — all 85 committed_data (data_type=entity) rows carry metadata.entity_id_field="ID_Gerente" and 84/85 have entity_id pointing at the manager's entity (1 null) — clean-slate re-import after the fix, or a targeted backfill (entity-resolution Step 6 only fills NULL entity_id, so existing wrong links will NOT self-heal without clearing entity_id/metadata first). SEPARATE-DEFECT FLAG (not EPG-0.3): 425/510 VLTEST2 transaction rows have entity_id NULL (only the 2025-12 batch backfilled; all txn rows carry the CORRECT entity_id_field=ID_Empleado) — route to the finalize/backfill EPG. TABLES/FILES: commit-content-unit.ts, windowed-commit.ts, execute-bulk/route.ts (processEntityUnit), entity-resolution.ts (consumer, unchanged semantics), possibly anthropic-adapter.ts + structural-primitives.ts + sci-types.ts + header-comprehension.ts/atom-flywheel.ts (option ii), hf351-entity-id-selection.test.ts; DB: committed_data (VLTEST2 roster batch metadata.entity_id_field + entity_id), structural_fingerprints (version bump if primitives extended).

## Evidence

### web/src/lib/sci/commit-content-unit.ts:243-277 (selectEntityIdFieldByOverlap — the selection site, full function)

```
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
      return { chosen: ranked[0].col, reason: `value-domain overlap ...` };
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
  console.warn(`[entity-id] HF-351 F5 C2: ...`);
  return { chosen: candidates[0], reason: 'ambiguous — first-match fallback (C2 flagged)' };
}
// NOTE: F5_OVERLAP_MIN = 0.5 (line 223). Branch (a) requires STRICT > between ranked[0] and ranked[1] — a 1.0 vs 1.0 tie falls through. Branch (b)'s reason string says "cold-start" even when entityDomain.size > 0.
```

### web/src/lib/sci/commit-content-unit.ts:321-334 (resolveEntityIdField — caller + the exact quoted log at :329)

```
  const candidates = findHcEntityIdCandidates(classificationTrace);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length >= 2) {
    const sel = selectEntityIdFieldByOverlap(candidates, rows, entityDomain);
    console.log(`[entity-id] HF-351 F5: ${candidates.length} entity-scope candidates [${candidates.join(', ')}] → "${sel.chosen}" (${sel.reason})`);
    return sel.chosen || null;
  }
  const binding = bindings.find(b => b.semanticRole === 'entity_identifier');
  return binding?.sourceField ?? null;
```

### web/src/lib/sci/commit-content-unit.ts:187-208 + :140 (findHcEntityIdCandidates — bare-primitive candidate collection; iteration in emission order)

```
const HC_IDENTIFIER_THRESHOLD = 0.80;  // :140
...
export function findHcEntityIdCandidates(
  classificationTrace: Record<string, unknown> | undefined,
): string[] {
  ...
  for (const [colName, interp] of Object.entries(interpretations)) {
    const conf = typeof interp.confidence === 'number' ? interp.confidence : 0;
    if (conf < HC_IDENTIFIER_THRESHOLD) continue;
    if (interp.scope_role === 'entity' && interp.nature_role === 'identifier') {
      candidates.push(colName);
    }
  }
  return candidates;
}
```

### web/src/lib/sci/commit-content-unit.ts:565-576 (entity domain read LIVE at commit time — not frozen at classify)

```
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
```

### probe _hf373_epg03_roster_interps.ts — live processing_jobs 66551591-9376-4b77-8850-db1be4af85f5 (BCL_Plantilla_Personal.xlsx, 2026-07-02T00:54:30Z) proposal.contentUnits[0].classificationTrace.headerComprehension.interpretations — BOTH columns carry scope_role=entity + nature_role=identifier

```
COL ID_Gerente: scope_role=entity nature_role=identifier conf=0.97 identifies="Identifies the direct manager of the employee by referencing another employee's ID, enabling the construction of the org chart hierarchy." data_nature="A self-referential foreign key linking each employee to their manager within the same roster table."
COL ID_Empleado: scope_role=entity nature_role=identifier conf=0.98 identifies="Identifies each individual employee uniquely within the organization; serves as the primary key of this roster sheet." data_nature="A unique employee identifier code that persists across the organization's data systems."
COL Sucursal_ID: scope_role=reference nature_role=identifier conf=0.92 (correctly excluded — scope_role!=entity)
COL Nombre_Completo: scope_role=entity nature_role=name conf=0.99 (excluded — nature_role!=identifier)
(column emission order: Cargo, Region, ID_Gerente, ID_Empleado, Nivel_Cargo, Sucursal_ID, Fecha_Ingreso, Nombre_Completo — ID_Gerente precedes ID_Empleado, so first-match fallback would ALSO pick ID_Gerente)
```

### probe _hf373_epg03_atoms_v5.ts — live structural_fingerprints (granularity=atom, algorithm_version=5, tenant VLTEST2) column_roles jsonb — same signals persisted at atom level, incl. directional relationships prose

```
ATOM 9eb1f59f-9c05-4817-af30-3c8712dcfc5e (ID_Gerente): {"role":"A self-referential foreign key linking each employee to their manager within the same roster table.","plan_role":"none","identifies":"Identifies the direct manager of the employee by referencing another employee's ID...","scope_role":"entity","nature_role":"identifier","relationships":["References ID_Empleado in the same sheet to form a parent-child management hierarchy","Empty value indicates the top of the reporting chain"],"roleConfidence":0.97,...}
ATOM b2c78df3-7a0d-4428-9466-6d7ae90d325a (ID_Empleado): {"role":"ambiguous","plan_role":"none","identifies":"Identifies each individual employee uniquely within the organization; serves as the primary key of this roster sheet.","scope_role":"entity","nature_role":"identifier","relationships":["Referenced by ID_Gerente in the same sheet to establish the management hierarchy","Likely referenced by transaction/performance sheets to link results to employees"],"roleConfidence":0.98,"characterization":"A unique alphanumeric identifier ... formatted as 'BCL-XXXX'. This is the primary key for the employee roster..."}
(FP-49: structural_fingerprints keys = [id,tenant_id,fingerprint,fingerprint_hash,classification_result,column_roles,match_count,confidence,source_file_sample,created_at,updated_at,import_batch_id,granularity,algorithm_version,scope,atom_features]; VLTEST2 has 37 atom/v5 + 9 sheet/v1 rows)
```

### probe _hf373_epg03_bindings_atoms.ts — live roster unit fieldBindings (negotiation output) — this surface DID discriminate

```
BINDING ID_Empleado -> entity_identifier (conf=0.95, claimedBy=entity)
BINDING ID_Gerente -> entity_relationship (conf=0.75, claimedBy=entity)
BINDING Nombre_Completo -> entity_name (conf=0.85, claimedBy=entity)
BINDING Sucursal_ID -> entity_attribute (conf=0.7, claimedBy=entity)
```

### web/src/lib/sci/agents.ts:79-80 + 143-145 (WHY the binding discriminated: surviving OB-231 English prose-regex over data_nature — matched 'foreign key' in ID_Gerente's prose → entity_relationship@0.75; a non-English prose emission would miss)

```
const NATURE_IS_IDENTIFIER = (n?: string) => !!n && /\b(identifier|\bid\b|primary[ _-]?key)\b/i.test(n);
const NATURE_IS_REFERENCE_KEY = (n?: string) => !!n && /\b(reference[ _-]?key|ref[ _-]?key|foreign[ _-]?key|lookup[ _-]?key)\b/i.test(n);
...
  if (NATURE_IS_REFERENCE_KEY(hcNature)) {
    if (agent === 'entity') {
      return { role: 'entity_relationship', context: `${field.fieldName} — hierarchical reference (HF-186: entity-agent reference key → entity_relationship)`, confidence: 0.75 };
    }
(the observed live binding entity_relationship@0.75 matches this site exactly; negotiation.ts's bare-primitive twin natureIsReferenceKey (negotiation.ts:42-44: nature_role==='identifier' && scope_role==='reference') is FALSE for ID_Gerente (scope_role=entity), so the bare-primitive path could NOT have produced this binding)
```

### web/src/app/api/import/sci/execute-bulk/route.ts:1106-1126 (entity CREATION selection — model-primary, binding honored iff it agrees with model; this is why creation used ID_Empleado while entity_id_field got ID_Gerente)

```
  const modelCandidates = findHcEntityIdCandidates(unit.classificationTrace);
  let idSourceField: string | null =
    // The heuristic binding is honored ONLY when it agrees with the model (preserves the multi-
    // candidate disambiguation, e.g. ID_Empleado chosen over ID_Gerente). Otherwise the model wins.
    (idBinding && modelCandidates.includes(idBinding.sourceField))
      ? idBinding.sourceField
      : (findHcEntityIdColumn(unit.classificationTrace) ?? null);
  ...
  if (!idSourceField) {
    return { ... error: 'No model-recognized entity identifier (scope_role=entity, nature_role=identifier); the heuristic binding was absent or a row-index — refusing to spawn entities from a non-identifier column (HF-370 O2)' };
  }
(idBinding = ID_Empleado→entity_identifier; modelCandidates = [ID_Gerente, ID_Empleado] ∋ ID_Empleado → creation keyed on ID_Empleado. NOTE the else-arm findHcEntityIdColumn returns candidates[0] = FIRST in emission order = ID_Gerente — creation is one binding-divergence away from the same defect)
```

### web/src/app/api/import/sci/execute-bulk/route.ts:1129-1138 (HF-371 EPG-C1 row-ordinal structural guard — TO BE RETAINED; applied to the FINAL chosen id, model or heuristic)

```
  // HF-371 (Root 3, EPG-C1): the "code guarantees" half of Decision 158. A column whose VALUES ARE THE
  // ROW POSITIONS (1,2,3…N in row order) carries no identity beyond position — it can NEVER be an entity
  // key, regardless of the model's semantic guess ... This is a structural/arithmetic fact — zero
  // language strings (Korean Test) — applied to the FINAL chosen id column, whether it came from the model
  // or the heuristic binding. (HF-370 O2 guarded only the fallback; this guards the model candidate too.)
  const idSample = rows.slice(0, 200).map(r => (r[idSourceField as string] == null ? '' : String(r[idSourceField as string]).trim())).filter(Boolean);
  if (looksLikeRowIndex(idSample)) {
    return { ... error: `Refusing entity key "${idSourceField}" — its values are the row ordinals (1..N); a row-position column can never identify entities (HF-371 EPG-C1 structural guard).` };
  }
```

### web/src/lib/sci/entity-resolution.ts:18-28 (looksLikeRowIndex — the structural predicate the guard uses; note it CANNOT reject ID_Gerente, whose values are 'BCL-XXXX' strings)

```
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
```

### web/src/lib/sci/entity-resolution.ts:214-225 + 582-623 (the persisted entity_id_field is AUTHORITATIVE for post-import entity_id backfill — the corruption propagation mechanism)

```
      const recordedIdField = (meta.entity_id_field as string | null | undefined) ?? null;
      if (recordedIdField && typeof recordedIdField === 'string' && recordedIdField.length > 0) {
        idColumn = recordedIdField;
      }
...
  // Step 6: Backfill entity_id on ALL committed_data rows across ALL batches
  for (const [batchId, { idColumn }] of Array.from(batchIdentifiers.entries())) {
      ...
      for (const row of unlinkeds) {
        const rd = row.row_data as Record<string, unknown>;
        const extId = String(rd[idColumn] ?? '').trim();
        const entityUuid = entityLookup.get(extId);
        ...
          await supabase.from('committed_data').update({ entity_id: entityUuid }).in('id', chunk);
```

### probe _hf373_epg03_downstream.ts — LIVE downstream state for VLTEST2 (did it survive? PARTIALLY — entities yes, roster linkage NO)

```
entities count: 85
by entity_type: {"individual":85}
first 10 external_ids: ["BCL-5001","BCL-5002",...,"BCL-5010"]; last: ..."BCL-5085"  (all correct employee ids)
committed_data data_type=entity count: 85
metadata.entity_id_field: "ID_Gerente"  — distinct entity_id_field values on roster rows: ["ID_Gerente"] (ALL 85 rows)
linkage: entity_id matches ID_Empleado=0, matches ID_Gerente=84, null=1, other=0 (of 85 sampled)
  ROW ID_Empleado=BCL-5001 ID_Gerente= -> entity_id=null (the CEO row, blank manager)
  ROW ID_Empleado=BCL-5015 ID_Gerente=BCL-5002 -> entity_id=08f95ede... (external_id=BCL-5002 — the MANAGER)
roster rows=85; distinct ID_Empleado=85; distinct ID_Gerente=13
ID_Gerente values that are also ID_Empleado values: 13/13 (self-referential FK — explains the branch-(a) 100%-vs-100% overlap tie)
(13 distinct over 85 rows = 6.5x repeat — matches the quoted log's distinct=13, repeat=6.5x exactly)
```

### probe _hf373_epg03_timing.ts — LIVE timestamps proving the domain was POPULATED at commit (refutes literal cold-start)

```
entities first created_at: 2026-07-02T00:55:17.674534+00:00 (all 85 identical)
roster committed_data created_at: 2026-07-02T00:55:18.134588+00:00 (0.46s AFTER entity creation — processEntityUnit creates entities THEN calls commitContentUnit, execute-bulk route.ts:1326→1342)
```

### web/src/lib/sci/windowed-commit.ts:266-288 (commitUnitStreamed — SECOND call site of the same heuristic on the streamed path; any fix must cover it)

```
  // HF-372 Phase F (EPG-0.8 divergence 2-B): ... ≥2 → value-overlap tie-break against the
  // tenant's entity domain over a bounded streamed sample of the candidate columns.
  ...
      const entityDomain = await readTenantEntityDomain(supabase, params.tenantId);
      const sel = selectEntityIdFieldByOverlap(candidates, narrowRows, entityDomain);
      entityIdField = sel.chosen || null;
```

### web/src/lib/ai/providers/anthropic-adapter.ts:876-881 (the PRODUCER prompt — the fixed scope_role vocabulary has no token for 'references another instance of the same entity class', so the model correctly labels BOTH columns entity)

```
- scope_role: which of the platform's THREE fixed structural ROLES this column plays. Reply with EXACTLY ONE bare token, no other words:
    - "entity"      — the column identifies a recurring subject the rows are ABOUT and group by (it repeats across many rows, or the sheet is the roster/master listing those subjects).
    - "transaction" — the column identifies an OCCURRENCE...
    - "reference"   — the column identifies an item of a dimensional lookup / catalog / definition list...
    - "none"        — the column identifies no scope...
(nature_role tokens :882-888: identifier|measure|temporal|name|categorical. Under these definitions ID_Gerente's scope_role=entity is a CORRECT model answer — it identifies an employee — the vocabulary simply cannot express self-reference.)
```

### probe _hf373_epg03_txn_check.ts / _hf373_epg03_txn_batches.ts — context: transaction rows chose correctly (single candidate) but linkage is broken for 5/6 batches (SEPARATE defect, out of EPG-0.3 scope)

```
transaction rows count: 510; entity_id_field values on txn rows: {"ID_Empleado":510} (all correct — Datos sheets have ONE entity-scope identifier so the heuristic never ran)
txn linkage: entity_id matches row ID_Empleado=85, mismatch=0, null=425
per batch: 228a9cf0 (2025-12-01): 85/85 linked; the other five batches (2025-10 .. 2026-03): 0/85 linked each — backfill appears to have run for only one Datos batch; flag for the EPG owning finalize/backfill.
```

### web/src/lib/sci/__tests__/hf351-entity-id-selection.test.ts:46 (test codifies the defective heuristic — must be rewritten with the fix)

```
assert.match(sel.reason, /finest repeating identifier/);
```

