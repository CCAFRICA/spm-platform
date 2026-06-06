# HF-260 — Grouping Entity Resolution (CPI Phase 1)

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` at repo root before executing any phase. This directive is governed by the standing rules throughout (AP-25, SR-34, SR-35, SR-38, SR-41, Rules 25–28). Drafting discipline per `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**HF number confirmation:** verify this is the next available HF number by running `git log --oneline --all | grep -oP 'HF-\d+' | sort -t- -k2 -n | tail -5`. If HF-260 is not sequential, rename this file and all internal references before proceeding.

**Combined-treatment rationale:** Four extensions to four existing code surfaces share a single defect class: the platform cannot resolve grouping-entity attributes (hub, territory, department, franchise) onto individual entity calculations. Each extension is necessary; no subset produces correct results. Dependency chain: Phase 1 → Phase 2 (needs typed entities), Phase 1 → Phase 4 (needs entity_type to filter on), Phase 3 (independent, convergence surface). Phase 5 is integration verification.

---

## §1 — Problem Statement

**Defect class:** Grouping Entity Resolution — the platform creates grouping entities (hubs, territories, departments) as `entity_type='individual'`, establishes no entity_relationships between individuals and their grouping entities, binds metrics to cross-key-space batches without key-space awareness, and calculates grouping entities as if they were payable individuals.

**Evidence (DIAG-059 at HEAD `b31bd688`, read-only):**
- 12 hub entities carry `entity_type='individual'`, `metadata={}`, `temporal_attributes=[]` — indistinguishable from employees (P1-F1)
- Hub fleet metrics bound to reference batch `94ed4675` (hub-keyed) while entity_identifier bound to transaction batch `50b6d0d5` (employee-keyed) — cross-key-space, convergence flagged confidence 0.4 / `cross_source_numeric` (P3-F1)
- `resolveColumnFromBatch` strict entity-external-id lookup, no boundary-join fallback — employee key never matches hub-keyed reference rows (P4.1)
- Entity assignment fetches all 79 entities (67 employees + 12 hubs) with no entity_type filter (P4.2)
- Employee-keyed transaction rows carry identical fleet values (`Cargas_Flota_Hub`/`Capacidad_Flota_Hub`) to hub-keyed reference rows, in the same batch as the employee entity_identifier — resolvable through existing `resolveColumnFromBatch` if convergence binds to them (P2-F1)

**Prior diagnostics consumed:** DIAG-058 (`e85a7678`, Condition A confirmed), DIAG-059 (`b31bd688`, evidence capture), AUD-0015 (`dede922b`, ingestion trace), AUD-0014 (`c75ad63d`, ingestion path audit).

**Governing specification:** Entity Model Design (TMR Addendum 8), Decisions D1 (entity registry), D2 (relationship graph), D3 (multiple hierarchy types). CPI (Contextual Proximity Inference) six proximity dimensions. Decision 111 (convergence bindings).

---

## §2 — Substrate-Bound Discipline Applications

**T1-E910 (Korean Test):** Entity type classification uses structural discriminants only — source content-unit classification, key cardinality, numeric-vs-categorical external_id pattern. Zero language-specific or column-name heuristics. A Korean logistics tenant with Hangul hub names must produce identical type classifications.

**T1-E902 (Carry Everything):** Entity enrichment captures ALL columns from entity-classified content units (processEntityUnit already does this for temporal_attributes via OB-177 enrichment). Grouping-entity relationship fields (Hub_Asignado or equivalent) are carried through the same enrichment path — no new column-name registry.

**Decision 111 (convergence bindings):** Convergence bindings remain the sole engine input. The key-space preference is an extension of the existing binding construction in `generateAllComponentBindings`, not a new binding path. The AI column-mapping prompt receives additional structural context (key-space annotation); binding shape is unchanged.

**Decision 153 (signal surface):** Entity type classification and relationship discovery signals flow through the canonical signal surface (`writeSignal`). No private JSONB channels.

**Reconciliation-channel separation:** This directive produces structural evidence (entity types, relationship counts, binding shapes, entity counts, per-entity calc output). The architect channel holds ground-truth values and performs reconciliation interpretation. No GT values appear in this directive or completion report.

---

## §3 — Phase Prose

**Phase ordering rationale:** Phase 1 (entity type) is prerequisite for Phases 2 and 4. Phase 2 (relationships) depends on typed entities existing to detect value-set overlap. Phase 3 (convergence) is independent of 1-2 but logically follows because binding preference may consult entity type. Phase 4 (entity filtering) depends on Phase 1's type assignment. Phase 5 (integration) depends on all prior phases.

### §3.1 — Phase 1: Entity Type Intelligence

**Objective:** Entities created from reference-classified data are typed as non-individual. Entities created from entity-classified data remain `'individual'`.

**P1.0 — Diagnostic read.** Before modifying code, identify WHERE hub entities are created for the Meridian tenant. Run:

```bash
cd ~/spm-platform
grep -rn "entity_type.*individual\|entity_type:.*individual\|'individual'" \
  web/src/app/api/import/sci/execute-bulk/route.ts \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/sci/ \
  --include='*.ts' | grep -v node_modules | grep -v '.next'
```

Also query which code path created the Meridian hub entities:

```bash
cat > /tmp/hf260_p1_diag.ts << 'SCRIPT'
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  // Find how hub entities were created — check created_at timestamp alignment with import_batches
  const { data: hubs } = await supabase.from('entities')
    .select('id, external_id, created_at')
    .eq('tenant_id', '5035b1e8-0754-4527-b7ec-9f93f85e4c79')
    .not('external_id', '~', '^[0-9]+$');
  console.log('Hub entities:', JSON.stringify(hubs, null, 2));
  // Check which import_batches exist for this tenant
  const { data: batches } = await supabase.from('import_batches')
    .select('id, file_name, created_at, metadata')
    .eq('tenant_id', '5035b1e8-0754-4527-b7ec-9f93f85e4c79')
    .order('created_at');
  console.log('Import batches:', JSON.stringify(batches, null, 2));
  // Check committed_data rows with entity_id pointing to a hub entity
  if (hubs && hubs.length > 0) {
    const hubId = hubs[0].id;
    const { data: cd } = await supabase.from('committed_data')
      .select('id, import_batch_id, data_type, metadata')
      .eq('entity_id', hubId).limit(3);
    console.log(`committed_data for hub ${hubs[0].external_id}:`, JSON.stringify(cd, null, 2));
  }
}
main().catch(console.error);
SCRIPT
cd ~/spm-platform && npx tsx /tmp/hf260_p1_diag.ts
```

Paste the full output. Identify the exact file and function where hub entities are created. **HALT-1** if the creation path is not in `execute-bulk/route.ts` or `run/route.ts` (see §4).

**P1.1 — Modify entity creation for reference-provenance entities.** At each identified creation site where `entity_type: 'individual'` is set, add a structural discriminant:

When the entity is being created from a committed_data row whose `data_type` is `'reference'`, OR when the entity's `external_id` was discovered from a reference-classified import batch (check `import_batches.metadata.classification`), set `entity_type: 'location'` instead of `'individual'`.

The structural discriminant is the DATA CLASSIFICATION of the source, not the entity's name or external_id format. Korean Test: a reference-classified content unit in any language produces a location-typed entity.

Implementation pattern (adapt to the actual creation site found in P1.0):

```typescript
// At the entity creation site, determine entity_type from source classification
const entityType = sourceClassification === 'reference' ? 'location' : 'individual';
```

Where `sourceClassification` is derived from the import_batch metadata or committed_data data_type that triggered entity creation.

**P1.2 — EPG-1: Entity type verification.** After the code change, delete existing Meridian hub entities and re-import. Run:

```bash
cat > /tmp/hf260_epg1.ts << 'SCRIPT'
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
  const { data } = await supabase.from('entities')
    .select('external_id, entity_type, metadata')
    .eq('tenant_id', TENANT)
    .order('external_id');
  const individuals = (data || []).filter(e => e.entity_type === 'individual');
  const locations = (data || []).filter(e => e.entity_type === 'location');
  const other = (data || []).filter(e => !['individual','location'].includes(e.entity_type));
  console.log(`Total: ${data?.length}, individual: ${individuals.length}, location: ${locations.length}, other: ${other.length}`);
  for (const e of locations) console.log(`  location: ${e.external_id}`);
  for (const e of other) console.log(`  OTHER TYPE: ${e.external_id} → ${e.entity_type}`);
}
main().catch(console.error);
SCRIPT
cd ~/spm-platform && npx tsx /tmp/hf260_epg1.ts
```

**EPG-1 PASS criteria:** 67 entities with `entity_type='individual'`, 12 entities with `entity_type='location'` (or equivalent non-individual type). Zero entities with entity_type='other'. Paste full output.

Commit: `HF-260 Phase 1: entity type intelligence — reference-provenance entities typed as location`

### §3.2 — Phase 2: CPI Relationship Discovery

**Objective:** When entity-classified data carries a column whose distinct values match existing non-individual entities, create `entity_relationships` rows. This is CPI Dimension 1 (Shared Attribute) implemented inline in the existing entity creation pipeline.

**P2.1 — Extend processEntityUnit.** In `web/src/app/api/import/sci/execute-bulk/route.ts`, function `processEntityUnit`, AFTER the entity creation/update loop (after the "OB-177: Enrich EXISTING entities" block), add a relationship discovery step:

```typescript
// HF-260: CPI Phase 1 — Shared Attribute relationship discovery.
// For each enrichment field on entity rows, check if its distinct values
// match external_ids of existing non-individual entities. When a match is
// found, create entity_relationships rows connecting the individual to the
// grouping entity.
// Korean Test: relationship discovery uses value-set intersection, not
// column name matching. A Korean tenant with Hangul hub names works identically.

// 1. Fetch non-individual entities for this tenant
const { data: groupingEntities } = await supabase
  .from('entities')
  .select('id, external_id, entity_type')
  .eq('tenant_id', tenantId)
  .neq('entity_type', 'individual');

if (groupingEntities && groupingEntities.length > 0) {
  const groupingByExtId = new Map(groupingEntities.map(e => [e.external_id, e]));

  // 2. For each enrichment field, check value-set overlap with grouping entities
  for (const binding of enrichmentBindings) {
    const fieldValues = new Set<string>();
    for (const row of rows) {
      const val = row[binding.sourceField];
      if (val != null && String(val).trim()) fieldValues.add(String(val).trim());
    }

    // Compute intersection with grouping entity external_ids
    let intersectionCount = 0;
    for (const v of fieldValues) {
      if (groupingByExtId.has(v)) intersectionCount++;
    }

    // Structural threshold: >50% of distinct values match grouping entities
    if (intersectionCount > 0 && intersectionCount / fieldValues.size > 0.5) {
      // 3. Create entity_relationships for each individual→grouping match
      const relationships: Array<{
        tenant_id: string; source_entity_id: string; target_entity_id: string;
        relationship_type: string; source: string; confidence: number;
        evidence: unknown; context: unknown;
      }> = [];

      for (const row of rows) {
        const empId = row[idBinding.sourceField];
        if (!empId) continue;
        const empExtId = String(empId).trim();
        const empEntityId = existingMap.get(empExtId) || /* newly created */ '';

        const groupVal = row[binding.sourceField];
        if (!groupVal) continue;
        const groupEntity = groupingByExtId.get(String(groupVal).trim());
        if (!groupEntity) continue;

        // Skip if empEntityId not found (shouldn't happen post-creation)
        const resolvedEmpId = existingMap.get(empExtId);
        if (!resolvedEmpId) continue;

        relationships.push({
          tenant_id: tenantId,
          source_entity_id: resolvedEmpId,
          target_entity_id: groupEntity.id,
          relationship_type: 'assigned_to',
          source: 'ai_inferred',
          confidence: 0.85,
          evidence: { signal: 'shared_attribute', field: binding.sourceField, import_source: 'processEntityUnit' },
          context: {},
        });
      }

      if (relationships.length > 0) {
        // Upsert: avoid duplicates on re-import
        for (let i = 0; i < relationships.length; i += 500) {
          const slice = relationships.slice(i, i + 500);
          const { error: relErr } = await supabase.from('entity_relationships').upsert(
            slice,
            { onConflict: 'tenant_id,source_entity_id,target_entity_id,relationship_type' }
          );
          if (relErr) {
            console.warn(`[HF-260 CPI] entity_relationships upsert error: ${relErr.message}`);
          }
        }
        console.log(`[HF-260 CPI] Created ${relationships.length} ${binding.sourceField} relationships`);
      }
    }
  }
}
```

**HALT-2** if `entity_relationships` table lacks a unique constraint on `(tenant_id, source_entity_id, target_entity_id, relationship_type)`. If absent, add the constraint first (see §4). **HALT-3** if `existingMap` (the entity external_id → UUID map) is not in scope at the insertion point — the variable must be accessible from the OB-177 enrichment block's scope.

**P2.2 — EPG-2: Relationship verification.** After re-import:

```bash
cat > /tmp/hf260_epg2.ts << 'SCRIPT'
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
  const { data, error } = await supabase.from('entity_relationships')
    .select('source_entity_id, target_entity_id, relationship_type, confidence, evidence')
    .eq('tenant_id', TENANT);
  if (error) { console.error(error); return; }
  console.log(`Total relationships: ${data?.length}`);
  // Join to get external_ids
  const entityIds = new Set<string>();
  for (const r of (data || [])) { entityIds.add(r.source_entity_id); entityIds.add(r.target_entity_id); }
  const { data: entities } = await supabase.from('entities')
    .select('id, external_id, entity_type')
    .in('id', Array.from(entityIds));
  const eMap = new Map((entities || []).map(e => [e.id, e]));
  // Show sample relationships
  for (const r of (data || []).slice(0, 10)) {
    const src = eMap.get(r.source_entity_id);
    const tgt = eMap.get(r.target_entity_id);
    console.log(`  ${src?.external_id} (${src?.entity_type}) → ${r.relationship_type} → ${tgt?.external_id} (${tgt?.entity_type})`);
  }
  // Count per target (hub)
  const byTarget = new Map<string, number>();
  for (const r of (data || [])) {
    const tgt = eMap.get(r.target_entity_id)?.external_id || r.target_entity_id;
    byTarget.set(tgt, (byTarget.get(tgt) || 0) + 1);
  }
  console.log('Relationships per hub:');
  for (const [hub, count] of Array.from(byTarget.entries()).sort()) console.log(`  ${hub}: ${count}`);
}
main().catch(console.error);
SCRIPT
cd ~/spm-platform && npx tsx /tmp/hf260_epg2.ts
```

**EPG-2 PASS criteria:** 67 entity_relationships rows, each connecting an individual employee to a location hub via relationship_type='assigned_to'. 12 distinct target hubs. Paste full output.

Commit: `HF-260 Phase 2: CPI relationship discovery — shared attribute detection in processEntityUnit`

### §3.3 — Phase 3: Convergence Key-Space Preference

**Objective:** When convergence constructs bindings, cross-source columns (from a different batch than the entity_identifier, confidence 0.4) are deprioritized when a same-key-space column with matching value distribution exists.

**P3.1 — Annotate cross-source columns in the AI prompt.** In `web/src/lib/intelligence/convergence-service.ts`, function `generateAllComponentBindings`, the cross-source column discovery block (HF-228, approximately line 2090+) adds columns with `contextualIdentity: 'cross_source_numeric'`. In the same function, function `resolveColumnMappingsViaAI` builds the column list for the AI prompt.

Modify the column list builder in `resolveColumnMappingsViaAI` to annotate cross-source columns:

```typescript
const columnList = measureColumns.map((c, i) => {
  const s = c.stats;
  const range = s ? ` [min=${s.min}, max=${s.max}, mean=${s.mean.toFixed(2)}]` : '';
  // HF-260: Key-space annotation. Cross-source columns are keyed differently
  // from the entity identifier — the AI should prefer same-batch columns when
  // both carry equivalent data, because same-batch columns resolve through the
  // existing resolveColumnFromBatch path without a boundary join.
  const crossSourceNote = c.fi.contextualIdentity === 'cross_source_numeric'
    ? ' ⚠ CROSS-SOURCE: keyed by a different entity than the primary identifier — prefer same-batch alternatives when available'
    : '';
  return `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})${range}${crossSourceNote}`;
}).join('\n');
```

This is a prompt-only change. The binding construction code is unchanged. The AI receives the same columns but with structural context about key-space alignment. Korean Test: the annotation is structural (cross_source_numeric flag), not name-based.

**P3.2 — Post-AI validation for cross-source binding.** After the AI mapping returns, in the per-requirement binding loop (inside `generateAllComponentBindings`), add a validation check: if the AI-proposed column is cross-source AND a same-batch column exists with a matching value distribution (same order of magnitude), prefer the same-batch column.

In the per-requirement loop, after `const proposedColumnName = ...` and before the `if (proposedColumnName)` block:

```typescript
// HF-260: Cross-source binding validation. When the AI proposes a cross-source
// column, check if a same-batch column exists with matching value distribution.
// Prefer same-batch because it shares the entity_identifier's key space.
if (proposedColumnName) {
  const proposedMC = measureColumns.find(c => c.name === proposedColumnName);
  if (proposedMC && proposedMC.fi.contextualIdentity === 'cross_source_numeric') {
    // Find the entity_identifier's batch
    const eidBinding = bindings[compKey]?.entity_identifier;
    const eidBatchId = eidBinding?.learning_provenance?.batch_id;
    if (eidBatchId) {
      // Look for a same-batch column with matching magnitude
      const sameBatchAlternative = measureColumns.find(alt =>
        alt.batchId === eidBatchId &&
        alt.name !== proposedColumnName &&
        !boundColumnToField.has(alt.name) &&
        alt.stats && proposedMC.stats &&
        Math.abs(Math.log10(Math.max(alt.stats.mean, 0.001)) - Math.log10(Math.max(proposedMC.stats.mean, 0.001))) < 1
      );
      if (sameBatchAlternative) {
        console.log(`[Convergence] HF-260: Redirecting ${req.metricField} from cross-source "${proposedColumnName}" to same-batch "${sameBatchAlternative.name}" (key-space alignment)`);
        // Override: use the same-batch column
        // Reassign proposedColumnName (requires let declaration above)
        // Implementation: replace the const with let and reassign here
      }
    }
  }
}
```

**Implementation note:** The `proposedColumnName` variable is declared as `const` via destructuring. To allow reassignment, change the declaration pattern. The specific refactor: extract `proposedColumnName` to a `let` variable before the cross-source check, then reassign if a same-batch alternative is found. Preserve the `proposedFilters` extraction unchanged.

**HALT-4** if `measureColumns` entries do not carry `batchId` at this point in the code (see §4). DIAG-059 showed `learning_provenance.batch_id` on the binding output, and the `measureColumns` array is built with `batchId` in the same function. Confirm by reading the `measureColumns` type and population.

**P3.3 — EPG-3: Convergence binding verification.** Clear existing Meridian `input_bindings` (set to `null` on `rule_sets`), trigger a fresh convergence run via calc, verify the fleet metrics bind to same-batch columns:

```bash
cat > /tmp/hf260_epg3.ts << 'SCRIPT'
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const RS = '2fb555d4-53fe-42e8-9662-cae3d07da4f4';
  // Clear input_bindings to force fresh convergence
  await supabase.from('rule_sets').update({ input_bindings: null }).eq('id', RS);
  console.log('input_bindings cleared — next calc run will trigger fresh convergence');
  console.log('Run calculation for Meridian via the UI, then re-run this script to verify:');
  // After calc: read the new bindings
  const { data } = await supabase.from('rule_sets').select('input_bindings').eq('id', RS).single();
  const bindings = (data?.input_bindings as Record<string, unknown>)?.convergence_bindings as Record<string, unknown>;
  if (!bindings) { console.log('No convergence_bindings yet — run calc first'); return; }
  // Show fleet component bindings (c4 and c9)
  for (const key of ['component_4', 'component_9']) {
    const cb = bindings[key] as Record<string, unknown>;
    if (!cb) continue;
    console.log(`\n${key}:`);
    for (const [role, binding] of Object.entries(cb)) {
      const b = binding as Record<string, unknown>;
      const prov = b.learning_provenance as Record<string, unknown> | undefined;
      console.log(`  ${role}: column="${b.column}" batch="${prov?.batch_id}" confidence=${b.confidence} contextual="${(b.field_identity as Record<string,unknown>)?.contextualIdentity}"`);
    }
  }
}
main().catch(console.error);
SCRIPT
cd ~/spm-platform && npx tsx /tmp/hf260_epg3.ts
```

**EPG-3 PASS criteria:** Fleet component bindings (`component_4`, `component_9`) bind `cargas_totales_hub` and `capacidad_total_hub` to columns in the SAME batch as `entity_identifier` (the transaction batch), NOT to the cross-source reference batch. The column names may be `Cargas_Flota_Hub`/`Capacidad_Flota_Hub` (transaction) rather than `Cargas_Totales`/`Capacidad_Total` (reference). Both carry identical values per DIAG-059 P2-F1. Paste full output.

Commit: `HF-260 Phase 3: convergence key-space preference — cross-source binding deprioritization`

### §3.4 — Phase 4: Calculable Entity Filtering

**Objective:** Only `entity_type='individual'` entities enter the calculation loop. Grouping entities remain as data sources in committed_data and allEntityRowsForPeriod but are excluded from the calculation entity set.

**P4.1 — Filter entity assignment.** In `web/src/app/api/calculation/run/route.ts`, at the entity fetch block (DIAG-059 P4.2: lines ~498-512), add an entity_type filter to the query:

```typescript
// Existing (from DIAG-059 P4.2):
const { data: page } = await supabase.from('entities')
  .select('id, external_id, display_name, metadata')
  .in('id', batch);

// Modified:
const { data: page } = await supabase.from('entities')
  .select('id, external_id, display_name, metadata')
  .in('id', batch)
  .eq('entity_type', 'individual');  // HF-260: exclude grouping entities from calculation
```

Also apply the same filter to the self-heal entity assignment block (lines ~398-433) that assigns ALL tenant entities when rule_set_assignments is empty:

```typescript
// In the self-heal block that fetches all tenant entities:
// Add .eq('entity_type', 'individual') to the query
```

**P4.2 — Preserve grouping entities in data sources.** Confirm that `allEntityRowsForPeriod` (DIAG-059 P4.3, lines ~1708-1720) is built from `dataByEntity` which is populated from `committed_data`, NOT from the filtered entity list. Grouping entity data rows must remain in the resolution pool — they are data sources, not calculation targets. If `allEntityRowsForPeriod` is built from the calculation entity list rather than committed_data, the scope prime's sibling-aggregation capability would lose hub data. **HALT-5** if `allEntityRowsForPeriod` is derived from the filtered entity set (see §4).

**P4.3 — EPG-4: Entity count verification.** Run calculation and verify the entity count:

```bash
# After triggering calc for Meridian, check the logs:
# The log line "X entities assigned (paginated fetch)" should show 67, not 79.
# The log line "entitiesCalculated=N" in the reconciliation footer should show 67.
# Search the Vercel logs or local dev logs for these lines.
```

**EPG-4 PASS criteria:** `entities assigned` = 67. `entitiesCalculated` = 67. No hub entity names appear in CalcRecon-T2 output. Paste the reconciliation header and footer from the calc log.

Commit: `HF-260 Phase 4: calculable entity filtering — entity_type='individual' only`

### §3.5 — Phase 5: Integration Verification

**Objective:** Full Meridian re-import + calculation run. Verify C1-C4 unchanged (convergence anchor preserved) and C5 > 0 (grouping entity resolution working).

**P5.1 — Fresh Meridian import.** Delete existing Meridian entities, committed_data, and rule_set_assignments. Re-import the Meridian data files through the UI import flow (Datos_Rendimiento + Plantilla + Datos_Flota_Hub + plan document). This exercises the full pipeline: SCI classification → entity creation with type intelligence → CPI relationship discovery → convergence with key-space preference → calculation with entity filtering.

**P5.2 — Trigger calculation.** Run calculation for all 3 Meridian periods (Jan/Feb/Mar 2025). Capture the full CalcRecon output (headers, per-entity T2 lines, footers) for all 3 periods.

**P5.3 — EPG-5: Structural verification.** Paste the following evidence:

1. Entity count in calc: `entitiesCalculated` for each period (must be 67)
2. Component totals per period: `componentTotals` from each CalcRecon-T1 footer (C1-C4 must be nonzero; C5 must be nonzero)
3. `variantDistribution` from each footer
4. Grand total per period
5. Five sample per-entity T2 lines showing all 5 components (select entities from different hubs to show C5 variation)
6. The `perEntityTotals` JSON from the `CalcTrace` log for each period

**EPG-5 PASS criteria:**
- entitiesCalculated = 67 for all 3 periods
- C1-C4 component totals are nonzero and stable across re-import
- C5 (Utilización de Flota) component total is nonzero for all 3 periods
- No hub entity names in per-entity output
- Per-entity totals are higher than pre-HF-260 values (because C5 is now nonzero)

The architect reconciles the per-entity totals against the GT in the architect channel. The completion report carries the raw numbers only.

Commit: `HF-260 Phase 5: integration verification — Meridian 3-period calc with grouping entity resolution`

Final: `gh pr create --base main --head dev --title "HF-260: Grouping Entity Resolution (CPI Phase 1)" --body "Entity type intelligence, CPI relationship discovery, convergence key-space preference, calculable entity filtering. Closes DIAG-058 Condition A (fleet projection) and DIAG-059 Class A (C5=0) + Class B (hub entity contamination). Governing spec: Entity Model Design D1-D3."`

---

## §4 — HALT Conditions

**HALT-1:** Hub entity creation path is not in `execute-bulk/route.ts` or `run/route.ts`. If hub entities are created by a third code path (e.g., a post-commit construction step, a worker process, or the reference_items pipeline), the Phase 1 modification site is wrong. Surface the actual creation path with file:line evidence. Resume after architect disposition.

**HALT-2:** `entity_relationships` table lacks a unique constraint on `(tenant_id, source_entity_id, target_entity_id, relationship_type)`. The upsert in Phase 2 requires this constraint. If absent, create it:

```sql
ALTER TABLE entity_relationships ADD CONSTRAINT uq_entity_relationship
  UNIQUE (tenant_id, source_entity_id, target_entity_id, relationship_type);
```

Apply via Supabase SQL Editor (architect operation). Resume after constraint is confirmed.

**HALT-3:** `existingMap` (entity external_id → UUID map) is not in scope at the Phase 2 insertion point. If processEntityUnit restructured since AUD-001 extraction and the map is not accessible, surface the current function structure. Resume after architect determines the correct variable reference.

**HALT-4:** `measureColumns` array entries do not carry `batchId` at the point where the cross-source validation runs. Confirm by reading the `measureColumns` type declaration and its population in `generateAllComponentBindings`. If `batchId` is not present, the same-batch check cannot be performed. Surface the actual measureColumns shape. Resume after architect disposition.

**HALT-5:** `allEntityRowsForPeriod` is built from the filtered calculation entity set rather than from `committed_data`/`dataByEntity`. If filtering entities also removes their data from the resolution pool, the scope prime loses hub data for sibling aggregation (CRP district-override class). Confirm by reading the construction block. If coupled, the entity filter must be applied AFTER `allEntityRowsForPeriod` construction. Surface the dependency with pasted code.

---

## §5 — Reporting Discipline

**Completion report location:** `docs/completion-reports/HF-260_GROUPING_ENTITY_RESOLUTION_COMPLETION_20260601.md`

**Structure (Rules 25-28, pasted evidence only):**

```markdown
# HF-260 — Grouping Entity Resolution — COMPLETION REPORT
## HEAD SHA: <post-merge SHA>
## Date: 2026-06-01

## Phase 1: Entity Type Intelligence
### P1.0 Diagnostic: entity creation path
<paste grep output + diagnostic script output>
### P1.1 Code change
<paste git diff for the modified function>
### EPG-1: Entity type verification
<paste EPG-1 script output>
**PASS/FAIL**

## Phase 2: CPI Relationship Discovery
### P2.1 Code change
<paste git diff for processEntityUnit extension>
### EPG-2: Relationship verification
<paste EPG-2 script output>
**PASS/FAIL**

## Phase 3: Convergence Key-Space Preference
### P3.1-P3.2 Code changes
<paste git diff for convergence-service.ts>
### EPG-3: Binding verification
<paste EPG-3 script output>
**PASS/FAIL**

## Phase 4: Calculable Entity Filtering
### P4.1 Code change
<paste git diff for run/route.ts entity fetch>
### P4.2 Data source preservation
<paste evidence that allEntityRowsForPeriod is NOT filtered>
### EPG-4: Entity count verification
<paste log lines showing entitiesCalculated=67>
**PASS/FAIL**

## Phase 5: Integration Verification
### P5.1-P5.2 Import + calc
<paste import log summary>
### EPG-5: Structural verification
<paste: entity counts, component totals per period, variant distribution,
 grand totals, sample T2 lines, perEntityTotals JSON for all 3 periods>
**PASS/FAIL**
```

---

## §6 — Out of Scope

- CRP Plan 2/3 intent-constructor cognition_violation errors (separate defect class — plan comprehension, not grouping entity resolution)
- Full CPI implementation (Dimensions 2-6: Containment, Transactional, Temporal, Hierarchical Exclusion, Cardinality) — this HF implements Dimension 1 (Shared Attribute) only
- Organizational Canvas UX (Entity Model Design D8) — no UI changes
- Period Entity State materialization (Entity Model Design D5) — relationship graph is populated but not materialized into `period_entity_state`
- Via-join mechanism (`resolveMetricsFromConvergenceBindings` via property) — convergence key-space preference makes via unnecessary for the denormalized-data case; via is a separate capability for reference-only data
- Reference→member projection engine path (DIAG-058 scope prime route) — same as above; key-space preference resolves the Meridian class without a new engine path
- HF-259 scope (ingestion path Q3+Q6+Q4) — independent deliverable, different surface
- AUD-005 refresh — separate artifact if HEAD has changed since `e85a7678`

## §6A — Residuals

- **CPI Dimensions 2-6:** Shared Attribute (Dimension 1, this HF) handles the common case where employee rows carry a grouping-entity identifier column. Dimensions 2-6 (Containment, Transactional, Temporal, Hierarchical Exclusion, Cardinality) remain unimplemented. They are needed for organizational structures discoverable only from transaction co-occurrence or cardinality patterns.
- **Reference-only data (no denormalized copy):** If a future tenant's data has grouping-entity metrics ONLY on reference-keyed rows (no employee-keyed copy), the convergence key-space preference has no same-batch alternative to redirect to. The via-join mechanism or reference→member projection engine path (DIAG-058) would be needed. This is the next capability expansion after this HF proves the CPI foundation.
- **Entity type vocabulary:** This HF uses `'location'` for hub entities. The Entity Model Design specifies `'location'`, `'team'`, `'organization'` as entity types. A structural classifier that distinguishes between these types (location = geographic/physical, team = organizational unit, organization = top-level) is not implemented — all non-individual reference entities get `'location'`. Refinement is a follow-on.
- **DIAG-058 `undefined===undefined` scope-match footgun:** Hub entities with empty metadata matching other empty-metadata entities in the scope prime. Phase 4's entity filtering removes hubs from the calculation loop, which partially mitigates this, but the footgun remains for any entity with genuinely empty metadata. Hardening candidate.
- **CRP Plan 2/3 import errors:** Plan 2 rep variant `cognition_violation: unknown shape "undefined"` and Plan 3 `branch is neither a structure nor an operand`. Separate DIAG warranted to capture the LLM's actual compositional_intent output vs intent-constructor expectations.
