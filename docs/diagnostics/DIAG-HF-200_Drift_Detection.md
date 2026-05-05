# DIAG-HF-200 — Drift Detection: HF-190 + HF-199 + OB-177 Surface State

## Date
2026-05-04

## Execution Time
~2026-05-04T23:50Z – ~2026-05-05T00:30Z (single session)

## Provenance

- **Branch:** `diag-hf-200-drift-detection` (from `main` HEAD `373579e4`)
- **Predecessors verified in main:**
  - PR #337 — HF-190 LOCKED 2026-04-05 (`283d4c24 Merge pull request #337 from CCAFRICA/dev`)
  - PR #360 — HF-197B per-sheet cache keying (`eee38096`)
  - PR #361 — HF-198 OB-196 closure (`819eea1c`)
  - PR #362 — HF-199 Meridian three-defect closure (`373579e4`)

## FILES READ (no modifications)

- `web/src/app/api/import/sci/execute-bulk/route.ts` (HF-190 surface; `processEntityUnit` lines 338–514)
- `web/src/lib/sci/entity-resolution.ts` (HF-199 surface; `resolveEntitiesFromCommittedData` Step 4 + 4.5 lines 254–351)
- `web/src/app/api/calculation/run/route.ts` (OB-177 bridge; lines 1280–1330)
- `entities` table for tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79` (10 sample entities)
- `periods` table for tenant (1 period)
- `period_entity_state` table for tenant (0 rows)
- `committed_data` table for tenant (3 entity-typed rows)

## FILES CREATED

- `vp-prompts/DIAG-HF-200_Drift_Detection.md` (this directive copy, Rule 14)
- `docs/diagnostics/DIAG-HF-200_Drift_Detection.md` (this report — overwrites the staged directive scaffold)

## SCRIPTS EXECUTED AND DELETED (FP-49 evidence captured)

- `web/scripts/diag-hf-200-meridian-state.ts` — Phase δ (entities + periods + period_entity_state)
- `web/scripts/diag-hf-200-committed-data.ts` — Phase ε (Plantilla committed_data sample)

---

## Hypothesis Verdicts

### H1 — HF-190 Construction-Layer Regression
**Verdict: NEGATIVE (HF-190 INTACT).**

**Phase α evidence — `web/src/app/api/import/sci/execute-bulk/route.ts:417–512`:**

```typescript
417:  // OB-177: Build temporal_attributes from enrichment fields
418:  const importDate = new Date().toISOString().split('T')[0];
419:  function buildTemporalAttrs(enrichment: Record<string, string>): Json[] {
420:    return Object.entries(enrichment).map(([key, value]) => ({
421:      key, value, effective_from: importDate, effective_to: null, source: 'import',
422:    }));
423:  }

433:    const newEntities = newIds.map(eid => {
434:      const meta = entityData.get(eid);
435:      return {
…
441:        temporal_attributes: buildTemporalAttrs(meta?.enrichment || {}) as Json[],
442:        metadata: {
443:          ...(meta?.enrichment || {}),  // HF-190: All enrichment fields in metadata for scope resolution
444:          ...(meta?.role ? { role: meta.role } : {}),
445:          ...(meta?.licenses ? { product_licenses: meta.licenses } : {}),
446:        } as Record<string, Json>,
447:      };
448:    });

491:    // HF-190: Spread ALL enrichment fields into metadata (not just role)
492:    {
493:      const { data: entData } = await supabase.from('entities').select('metadata').eq('id', entityId).single();
494:      const existingMeta = (entData?.metadata ?? {}) as Record<string, unknown>;
495:      const mergedMeta = {
496:        ...existingMeta,
497:        ...meta.enrichment,  // HF-190: All enrichment fields in metadata for scope resolution
498:        ...(meta.role ? { role: meta.role } : {}),
499:      };
500:      const metaChanged = JSON.stringify(existingMeta) !== JSON.stringify(mergedMeta);
501:      if (metaChanged || newAttrs.length !== existingAttrs.length) {
502:        await supabase.from('entities').update({
503:          temporal_attributes: newAttrs as unknown as Json[],
504:          metadata: mergedMeta as unknown as Json,
505:        }).eq('id', entityId);
…
511:    // HF-190: temporal-only update path removed — unified update above handles both metadata + temporal
```

Both HF-190 sites operative:
- Line 441–446: NEW entity insert co-writes `temporal_attributes` AND `metadata` (enrichment spread + role + licenses).
- Line 491–509: EXISTING entity unified update co-writes both fields.

**Phase δ empirical confirmation:** Plantilla employee `Silvia Pérez Rodríguez (70028)` shows `metadata: {"region":"Norte","hub_asignado":"Monterrey Hub","fecha_ingreso":"2021-02-12","tipo_coordinador":"Coordinador"}` — HF-190 successfully spread enrichment into metadata at construction layer.

### H2 — HF-199 Adjacent-Surface Drift (Adjacent-Arm Drift)
**Verdict: CONFIRMED (HF-199 writes only to `temporal_attributes`; metadata not touched).**

**Phase β evidence — `web/src/lib/sci/entity-resolution.ts:254–351`:**

```typescript
254:  // Step 4: Create new entities (HF-199 D3: include attribute projections in temporal_attributes)
255:  const importDate = new Date().toISOString().split('T')[0];
256:  const buildTemporalAttrs = (extId: string): Array<{ key: string; value: unknown; effective_from: string; effective_to: null }> => {
257:    const attrs = entityAttributes.get(extId);
258:    if (!attrs) return [];
259:    return Object.entries(attrs).map(([key, value]) => ({
260:      key, value, effective_from: importDate, effective_to: null,
261:    }));
262:  };
…
277:  for (const [extId, name] of Array.from(allEntities.entries())) {
278:    if (!existingMap.has(extId)) {
279:      newEntities.push({
…
289:        temporal_attributes: buildTemporalAttrs(extId),
290:        metadata: {},   // ← HF-199 writes EMPTY metadata for new entities
291:      });
292:    }
293:  }
…
309:  // Step 4.5 (HF-199 D3): Update EXISTING entities with attribute projections.
…
341:    if (changed) {
342:      await supabase
343:        .from('entities')
344:        .update({ temporal_attributes: newAttrs as unknown as Json })   // ← HF-199 only touches temporal_attributes
345:        .eq('id', entityId);
346:      updated++;
347:    }
348:  }
```

Compare to HF-190 unified update (execute-bulk:502–505):
```typescript
await supabase.from('entities').update({
  temporal_attributes: newAttrs as unknown as Json[],
  metadata: mergedMeta as unknown as Json,
}).eq('id', entityId);
```

HF-199 does **not** spread `entityAttributes` into `metadata` at either insert or update site. The HF-190 closure pattern ("co-write metadata alongside temporal_attributes") is missing at the HF-199 re-import / resolution surface — Adjacent-Arm Drift.

**Empirical impact:** for Plantilla rows imported via `processEntityUnit` (HF-190 site), metadata is populated. For any entity created or updated through the post-import `resolveEntitiesFromCommittedData` path (HF-199 site) — including all reference-typed entities (Hubs) and any entity not covered by `processEntityUnit` — metadata stays `{}`.

Phase δ confirmation: 9 of 10 sampled Meridian entities are Hubs (reference-typed); all show `metadata: {}` and `temporal_attributes count: 0`. The Plantilla employee shows populated metadata — but only because HF-190 at the construction layer already populated it; HF-199 at re-import added duplicate temporal_attributes (e.g., both `Region` capital-case and `region` lowercase visible) without touching metadata.

### H3 — OB-177 Bridge Filter Exclusion (Decision-Implementation Gap)
**Verdict: CONFIRMED.**

**Phase γ evidence — `web/src/app/api/calculation/run/route.ts:1280–1330`:**

```typescript
1280:  // OB-177: Materialize period_entity_state and load for variant matching
1281:  // Resolves entities.temporal_attributes as-of period date into flat resolved_attributes
1282:  const materializedState = new Map<string, Record<string, unknown>>();
…
1290:      const asOfDate = period?.end_date || new Date().toISOString().split('T')[0];
…
1310:          const attrs = (ent.temporal_attributes || []) as Array<{ key: string; value: Json; effective_from: string; effective_to: string | null }>;
1311:          const resolved: Record<string, unknown> = {};
1312:          // Resolve each temporal attribute as-of period date
1313:          const sorted = [...attrs].sort((a, b) => (b.effective_from || '').localeCompare(a.effective_from || ''));
1314:          for (const attr of sorted) {
1315:            if (attr.key in resolved) continue;
1316:            if (attr.effective_from && attr.effective_from > asOfDate) continue;   // ← excludes future-dated
1317:            if (attr.effective_to && attr.effective_to < asOfDate) continue;
1318:            resolved[attr.key] = attr.value;
1319:          }
1320:          // Also include metadata.role if present (backward compat)
1321:          const meta = (ent.metadata || {}) as Record<string, unknown>;
1322:          if (meta.role && !resolved['role']) resolved['role'] = meta.role;   // ← narrow: only `role` key
…
```

**Two structural gaps at the bridge:**

1. **Filter at line 1316 excludes `effective_from > asOfDate`.** HF-190 and HF-199 both write `effective_from = importDate = today` (`'2026-05-04'`). For periods ending earlier (e.g., January 2025 with `end_date='2025-01-31'`), `'2026-05-04' > '2025-01-31'` is TRUE → entry skipped.

2. **Metadata fallback at line 1322 is narrow.** Only handles `meta.role`. Plantilla metadata carries `tipo_coordinador`, `region`, `hub_asignado`, `fecha_ingreso` — none of these surface as resolved attributes via this fallback.

**Phase δ empirical confirmation:**

Periods table:
```
=== Meridian periods ===
count: 1
  id=059cddeb-331c-462a-b0f3-fbd2199ff90c label=January 2025 2025-01-01..2025-01-31 status=open
```

`period_entity_state` for January 2025 period:
```
=== period_entity_state ===
  Period January 2025 (end=2025-01-31): 0 pes rows
```

`calculation_batches`: zero rows (calc never persisted; was blocked upstream by empty materializedState → 0 entities passing variant discrimination).

Sample Plantilla entry showing future-dated entries:
```
--- Silvia Pérez Rodríguez (70028) ---
  metadata: {"region":"Norte","hub_asignado":"Monterrey Hub","fecha_ingreso":"2021-02-12","tipo_coordinador":"Coordinador"}
  temporal_attributes count: 8
  temporal_attributes (first 5):
    {"key":"tipo_coordinador","value":"Coordinador","source":"import","effective_to":null,"effective_from":"2026-05-04"}
    {"key":"region","value":"Norte","source":"import","effective_to":null,"effective_from":"2026-05-04"}
    {"key":"fecha_ingreso","value":"2021-02-12","source":"import","effective_to":null,"effective_from":"2026-05-04"}
    {"key":"Region","value":"Norte","effective_to":null,"effective_from":"2026-05-04"}
    {"key":"Hub_Asignado","value":"Monterrey Hub","effective_to":null,"effective_from":"2026-05-04"}
```

Trace at the bridge:
- `asOfDate = '2025-01-31'` (period January 2025 `end_date`)
- For every `temporal_attributes` entry: `effective_from = '2026-05-04'` > `'2025-01-31'` → skipped
- Metadata fallback: only `meta.role` checked; `meta.role` is **absent** for Plantilla (metadata has `tipo_coordinador` instead) — fallback miss
- `resolved` ends empty → `materializedState.set(...)` not called → entity not in `materializedState`

The chain produces empty `materializedState` for every entity, regardless of the populated metadata HF-190 wrote.

---

## EMPIRICAL EVIDENCE — Meridian State (Phase δ + ε)

### Entity records sample (Phase δ — 10 entities; verbatim, abridged for repetition)

```
--- CDMX Hub (CDMX Hub) ---
  entity_type: individual
  created_at: 2026-05-04T21:16:15
  metadata: {}
  temporal_attributes count: 0

--- Querétaro Hub (Querétaro Hub) ---       (same shape: metadata={}, ta=0)
--- Puebla Hub (Puebla Hub) ---             (same shape)
--- Mérida Hub (Mérida Hub) ---             (same shape)
--- Oaxaca Hub (Oaxaca Hub) ---             (same shape)
--- Villahermosa Hub (Villahermosa Hub) --- (same shape)
--- Guadalajara Hub (Guadalajara Hub) ---   (same shape)
--- Culiacán Hub (Culiacán Hub) ---         (same shape)
--- Acapulco Hub (Acapulco Hub) ---         (same shape)

--- Silvia Pérez Rodríguez (70028) ---
  entity_type: individual
  created_at: 2026-05-04T21:16:14
  updated_at: 2026-05-04T23:47:00
  metadata: {"region":"Norte","hub_asignado":"Monterrey Hub","fecha_ingreso":"2021-02-12","tipo_coordinador":"Coordinador"}
  temporal_attributes count: 8
  (sampled entries above)
```

Hub entities (9/10) — reference-typed, derived from `Datos_Flota_Hub` batch (`data_type='reference'`); HF-199 projection only operates on entity-typed batches (`batchLabels.get(batchId) === 'entity'`); Hubs produce no temporal_attributes / metadata. Out of scope per directive (separate scope).

Plantilla employee (1/10) — entity-typed; HF-190 populated metadata; HF-199 added temporal_attributes (with both lowercase + capital-case keys due to dual-write between the two surfaces).

### Period state (Phase δ)

```
count: 1
  id=059cddeb-331c-462a-b0f3-fbd2199ff90c
  label=January 2025
  start_date=2025-01-01  end_date=2025-01-31
  status=open
```

### period_entity_state output (Phase δ — bridge result)

```
Period January 2025 (end=2025-01-31): 0 pes rows
```

Zero entities materialized.

### calculation_batches state (Phase δ)

```
=== calculation_batches ===
(zero rows)
```

Calc never persisted — upstream block from empty `materializedState` → zero entities passing variant discrimination → calc engine returns nothing of substance.

### committed_data field_identities sample (Phase ε — 3 Plantilla rows)

```
--- row id=d47c9db5-... entity_id=cdc7e170-... ---
  row_data keys: Region, _rowIndex, _sheetName, No_Empleado, Hub_Asignado, Fecha_Ingreso, Nombre_Completo, Tipo_Coordinador
  field_identities count: 6
    Region: structuralType=attribute contextualIdentity=entity_attribute
    No_Empleado: structuralType=identifier contextualIdentity=person_identifier
    Hub_Asignado: structuralType=attribute contextualIdentity=entity_relationship
    Fecha_Ingreso: structuralType=attribute contextualIdentity=entity_attribute
    Nombre_Completo: structuralType=name contextualIdentity=person_name
    Tipo_Coordinador: structuralType=attribute contextualIdentity=entity_attribute
  metadata.entity_id_field: No_Empleado
  row_data sample: Region="Pacífico" | No_Empleado="70363" | Hub_Asignado="Acapulco Hub" | Fecha_Ingreso="2018-04-22"

(same shape across the 3 rows)
```

HF-199 had correct inputs: 4 columns marked `structuralType: 'attribute'` (Region, Hub_Asignado, Fecha_Ingreso, Tipo_Coordinador); row_data populated with values.

---

## SYNTHESIZED CLOSURE PATH (Adjacent-Arm Drift discipline + Decision-Implementation Gap)

Structural class of defect:

> **"Entity attribute capture writes to one or more durable surfaces, but the calc-time bridge filter excludes those entries (effective_from > period.end_date) and the metadata fallback is too narrow (only `role` key surfaced)."**

The class is **two-headed**: H2 (drift at HF-199 re-import surface — missing metadata co-write) AND H3 (bridge filter + narrow fallback at calc-time materialization). Closing only one leaves the other.

### Operative shape: **Shape B (combined fix)**

Per the directive's shape disposition guide:
- H1 (HF-190): NEGATIVE
- H2 (HF-199 adjacent surface): CONFIRMED
- H3 (bridge filter): CONFIRMED

**Shape B with bridge generalization** — three coordinated surface changes:

1. **HF-199 site (`entity-resolution.ts`)** — mirror HF-190 metadata co-write:
   - At new-entity insert (line 290): `metadata: { ...entityAttributes.get(extId) ?? {} }` (or equivalent spread)
   - At existing-entity update (line 341–347): unified `update({ temporal_attributes, metadata: { ...existingMeta, ...attrs } })` per HF-190 pattern at `execute-bulk:502–505`

2. **`effective_from` semantic alignment** — choose ONE of:
   - **Option B1 (preferred):** Write `effective_from: null` (or omit) at HF-199 + HF-190 sites; the bridge treats `null` as "always-effective" via the existing `if (attr.effective_from && attr.effective_from > asOfDate)` guard (which already short-circuits on falsy `effective_from`).
   - **Option B2:** Write `effective_from = period.start_date` if a period context is available at write time. Less attractive — write-time may not know the operative period.
   - **Option B3:** Write `effective_from = "1970-01-01"` (epoch) for roster-derived entries, semantically meaning "all time" for static entity attributes.

3. **Bridge metadata fallback generalization** (`run/route.ts:1320–1322`):
   - Replace narrow `if (meta.role && !resolved['role'])` with full metadata spread:
     ```
     for (const [k, v] of Object.entries(meta)) {
       if (!(k in resolved) && typeof v !== 'object') resolved[k] = v;
     }
     ```
   - Korean-Test-clean: iterates metadata keys structurally; no language-specific lexicon.
   - Surfaces tipo_coordinador, region, hub_asignado, fecha_ingreso (and any future attribute key) when temporal_attributes are excluded by the date filter.

Either fix-2 (effective_from) or fix-3 (broadened fallback) alone closes the immediate calc-blocking; doing both is structurally redundant but defense-in-depth and aligns with HF-190's stated semantic "metadata for scope resolution" (architect-channel disposition).

### Alternative: Shape A (minimum)

If architect dispositions ONLY the bridge fallback generalization (fix-3), HF-200 closes the calc-blocking without touching HF-199 site. Trade-off: HF-199 Adjacent-Arm Drift remains structurally — entities without HF-190 metadata population (Hubs, future re-imports without enrichment) still surface empty. Acceptable if Hubs are out of scope and HF-190 always runs at construction layer.

---

## STANDING RULE COMPLIANCE

- **Rule 25** (report before final): N/A — diagnostic, no build phase
- **Rule 26** (mandatory structure): PASS
- **Rule 27** (paste evidence): PASS — every verdict has pasted code/query output verbatim
- **Rule 29** (CC paste last): PASS
- **Korean Test (AP-25 + Decision 154):** PASS — all reads structural; verdicts derived from `structuralType` / column-iteration patterns; no language-specific lexical matching
- **FP-80** (false PASS without evidence): PASS — no PASS claims; verdicts derived from pasted output
- **Reconciliation-Channel Separation:** PASS — no GT values; no calc execution; raw substrate state only
- **Adjacent-Arm Drift discipline:** applied — diagnostic checks construction (HF-190 site) + adjacent (HF-199 site) + bridge (OB-177 line 1320–1322) layers
- **Decision-Implementation Gap:** applied — H3 verdict surfaces gap between HF-190's stated semantic ("metadata for scope resolution") and bridge's narrow `meta.role`-only fallback

---

## ARCHITECT HANDOFF

Architect reviews verdicts. Three possible HF-200 directive shapes:

- **Shape A (bridge-only fix):** Generalize `run/route.ts:1320–1322` metadata fallback from `meta.role` to full metadata spread. Single file change. Closes the immediate calc-blocking via HF-190's already-populated metadata for Plantilla. Hub entities + any entity without HF-190 enrichment remain empty (acceptable if out of scope).

- **Shape B (combined fix):** All three changes — HF-199 metadata co-write + `effective_from` alignment + bridge fallback generalization. Closes both Adjacent-Arm Drift (H2) and Decision-Implementation Gap (H3). Most thorough; matches HF-190's stated semantic at all surfaces.

- **Shape C:** N/A — H1 verdict NEGATIVE means no HF-190 restoration needed.

**Recommended:** Shape B. The bridge fallback alone (Shape A) closes the calc-blocking but leaves H2 structural drift active. Shape B forecloses future regressions where a new entity surface (e.g., a domain agent's roster import) bypasses HF-190's construction-layer pattern.

Architect dispositions Shape; CC drafts HF-200 directive against operative shape.

---

## OUT OF SCOPE FOR DIAG-HF-200

- HF-200 directive drafting (architect dispositions Shape first)
- Fixing any of the surfaces (read-only diagnostic)
- D2 convergence binding gap (HF-199 Phase γ partial closure; separate or scope into HF-200)
- Hub entity attribute projection (9 of 10 sampled Hubs; reference-typed; separate scope per directive)
- D1 false-defect verdict (verified intact at HF-199 Phase β; no action)

These remain open carry-forward.
