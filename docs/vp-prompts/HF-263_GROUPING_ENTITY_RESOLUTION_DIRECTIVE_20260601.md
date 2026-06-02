# HF-263 — Grouping Entity Resolution (CPI Phase 1)

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` at repo root. All standing rules apply (AP-25, SR-34, SR-35, SR-38, SR-41, Rules 25–28). Drafting discipline: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

Commit + push after every phase. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 before completion report. Git from repo root (`spm-platform`) NOT `web/`. Final step: `gh pr create --base main --head dev` with descriptive title + body.

---

## §1 — Problem Statement

**Defect class:** Grouping Entity Resolution — the platform creates grouping entities (hubs, territories, departments, franchises) as `entity_type='individual'`, establishes no `entity_relationships` between individuals and their grouping entities, binds metrics to cross-key-space batches without key-space awareness, and calculates grouping entities as if they were payable individuals.

**Witness:** Meridian Logistics Group (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`). 12 hub entities typed `'individual'` with `metadata={}`. C5 (Fleet Utilization) = 0 across all entities because convergence bound fleet metrics to the hub-keyed reference batch while the entity_identifier is employee-keyed. 12 hubs receive spurious c3 (Seguridad) payouts ($5,800/period).

**Evidence consumed:** DIAG-058 (`e85a7678`), DIAG-059 (`b31bd688`), AUD-0015 (`dede922b`), AUD-0014 (`c75ad63d`), HF-260 ADR (`2dcf324c`).

**Architect-confirmed HALT-1 disposition:** Hub entities are created by `resolveEntitiesFromCommittedData` at `web/src/lib/sci/entity-resolution.ts:283` via `post-commit-construction.ts:59`. NOT by processEntityUnit or run/route.ts. Evidence: hub entities carry `metadata={}` / `temporal_attributes=[]` (no enrichment), created immediately after reference batch — matches entity-resolution insert, not processEntityUnit enrichment.

**Architect-confirmed HALT-2 disposition:** Unique constraint `uq_entity_relationship(tenant_id, source_entity_id, target_entity_id, relationship_type)` applied to `entity_relationships` table via SQL Editor.

**Combined-treatment rationale:** Four extensions share one defect class. Dependency chain: Phase 1 → Phases 2 & 4, Phase 3 independent. No subset produces correct results.

---

## §2 — Substrate-Bound Discipline

**T1-E910 (Korean Test):** Entity type uses source data classification (`data_type='reference'`), not entity name or external_id format. Relationship discovery uses value-set intersection, not column names. A Korean tenant with Hangul hub names produces identical results.

**T1-E902 (Carry Everything):** Enrichment fields flow through existing OB-177 path. No new column-name registry.

**Decision 111:** Convergence bindings remain the sole engine input. Key-space preference extends existing binding construction.

**Reconciliation-channel separation:** This directive produces structural evidence only. No ground-truth values. Architect reconciles in architect channel.

---

## §3 — Phase Prose

**Ordering:** Phase 1 (entity type) → Phase 2 (relationships, needs typed entities) → Phase 3 (convergence, independent) → Phase 4 (entity filtering, needs entity type). Phase 5 is architect-executed (requires UI interaction).

### §3.1 — Phase 1: Entity Type Intelligence

**Objective:** Entities discovered from reference-classified committed_data rows are typed `'location'` instead of `'individual'`.

**P1.1 — Read `entity-resolution.ts`.** Open `web/src/lib/sci/entity-resolution.ts`. Locate function `resolveEntitiesFromCommittedData`. Find the entity insert block (approximately line 283) where `entity_type: 'individual'` is hardcoded. Paste the full insert block (10-20 lines).

**P1.2 — Modify the insert block.** At the entity creation point, derive `entity_type` from the source committed_data rows' `data_type` field. The function is iterating committed_data rows — `data_type` is available on each row.

Implementation: for each discovered external_id, track which `data_type` values its source rows carry. If ALL source rows for that external_id have `data_type='reference'`, set `entity_type: 'location'`. Otherwise `entity_type: 'individual'`.

The structural discriminant is the data classification, not the entity name. This is Korean Test compliant: a reference-classified content unit in any language produces a location-typed entity.

**P1.3 — Also check `post-commit-construction.ts`.** Confirm this is the sole invocation site of `resolveEntitiesFromCommittedData`. If there are other callers, apply the same entity_type logic. Paste the grep output:

```bash
grep -rn 'resolveEntitiesFromCommittedData' web/src/lib/ web/src/app/ --include='*.ts' | grep -v node_modules
```

**P1.4 — Build + verify compilation.** `npm run build` must succeed. No runtime test needed yet — EPG-1 runs after all phases.

Commit: `HF-263 Phase 1: entity type intelligence — reference-provenance entities typed as location`

### §3.2 — Phase 2: CPI Relationship Discovery

**Objective:** When `processEntityUnit` creates/updates entities from entity-classified data, discover shared-attribute relationships with existing non-individual entities and write `entity_relationships` rows.

**P2.1 — Confirm HALT-2 resolved.** Before modifying code, verify the unique constraint exists:

```bash
cat > /tmp/hf263_halt2.ts << 'SCRIPT'
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  // Test the constraint by attempting a dummy upsert pattern
  const { error } = await supabase.rpc('pg_catalog', undefined as never).catch(() => null) as { error: null };
  // Just check if the table is accessible with the expected columns
  const { data, error: qErr } = await supabase.from('entity_relationships')
    .select('id, tenant_id, source_entity_id, target_entity_id, relationship_type')
    .limit(0);
  if (qErr) console.error('entity_relationships query failed:', qErr.message);
  else console.log('entity_relationships accessible, columns confirmed');
}
main().catch(console.error);
SCRIPT
cd ~/spm-platform && npx tsx /tmp/hf263_halt2.ts
```

If the table is not accessible or missing expected columns, **HALT — report to architect.**

**P2.2 — Extend `processEntityUnit`.** In `web/src/app/api/import/sci/execute-bulk/route.ts`, function `processEntityUnit`, AFTER the entity creation/update loop AND after the OB-177 enrichment block (where `existingMap` is fully populated), add the CPI relationship discovery block.

First, read the current end of processEntityUnit to identify the exact insertion point. The block goes after entity creation and enrichment are complete, before the function returns.

```typescript
// ── HF-263: CPI Phase 1 — Shared Attribute relationship discovery ──
// For each enrichment field on entity rows, check if its distinct values
// match external_ids of existing non-individual entities (entity_type != 'individual').
// When overlap exceeds 50% of distinct values, create entity_relationships rows.
// Korean Test: value-set intersection only, no column-name matching.

const { data: groupingEntities } = await supabase
  .from('entities')
  .select('id, external_id, entity_type')
  .eq('tenant_id', tenantId)
  .neq('entity_type', 'individual');

if (groupingEntities && groupingEntities.length > 0) {
  const groupingByExtId = new Map(
    groupingEntities.map(e => [e.external_id?.trim(), e])
  );

  for (const binding of enrichmentBindings) {
    // Collect distinct values for this field across all entity rows
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
    if (intersectionCount === 0 || intersectionCount / fieldValues.size <= 0.5) continue;

    const relationships: Array<{
      tenant_id: string;
      source_entity_id: string;
      target_entity_id: string;
      relationship_type: string;
      source: string;
      confidence: number;
      evidence: Record<string, unknown>;
      context: Record<string, unknown>;
    }> = [];

    for (const row of rows) {
      const empIdRaw = row[idBinding.sourceField];
      if (!empIdRaw) continue;
      const empExtId = String(empIdRaw).trim();
      const empEntityId = existingMap.get(empExtId);
      if (!empEntityId) continue;

      const groupVal = row[binding.sourceField];
      if (!groupVal) continue;
      const groupEntity = groupingByExtId.get(String(groupVal).trim());
      if (!groupEntity || !groupEntity.id) continue;

      relationships.push({
        tenant_id: tenantId,
        source_entity_id: empEntityId,
        target_entity_id: groupEntity.id,
        relationship_type: 'assigned_to',
        source: 'ai_inferred',
        confidence: 0.85,
        evidence: {
          signal: 'shared_attribute',
          field: binding.sourceField,
          import_source: 'processEntityUnit',
        },
        context: {},
      });
    }

    if (relationships.length > 0) {
      for (let i = 0; i < relationships.length; i += 500) {
        const slice = relationships.slice(i, i + 500);
        const { error: relErr } = await supabase
          .from('entity_relationships')
          .upsert(slice, {
            onConflict: 'tenant_id,source_entity_id,target_entity_id,relationship_type',
          });
        if (relErr) {
          console.warn(`[HF-263 CPI] entity_relationships upsert error: ${relErr.message}`);
        }
      }
      console.log(
        `[HF-263 CPI] Created ${relationships.length} '${binding.sourceField}' → assigned_to relationships`
      );
    }
  }
}
```

**Scope note:** `existingMap`, `idBinding`, `enrichmentBindings`, and `rows` are all variables from the existing processEntityUnit function scope. They must be in scope at the insertion point. If any are not accessible (e.g., if the function was restructured), **HALT — report with the current function structure.**

**P2.3 — Build.** `npm run build` must succeed.

Commit: `HF-263 Phase 2: CPI relationship discovery — shared attribute detection in processEntityUnit`

### §3.3 — Phase 3: Convergence Key-Space Preference

**Objective:** When convergence binds metrics, cross-source columns (confidence 0.4, from a batch different than entity_identifier) are deprioritized when a same-key-space column exists.

**Two modifications in `web/src/lib/intelligence/convergence-service.ts`:**

**P3.1 — Annotate cross-source columns in the AI prompt.** In function `resolveColumnMappingsViaAI`, find the `columnList` builder (the `measureColumns.map(...)` call that builds the numbered column list for the AI prompt). It currently outputs:

```typescript
return `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})${range}`;
```

Modify to annotate cross-source columns:

```typescript
// HF-263: Key-space annotation for cross-source columns.
const crossSourceNote = c.fi.contextualIdentity === 'cross_source_numeric'
  ? ' ⚠ CROSS-SOURCE: keyed by a different entity than the primary identifier — prefer same-batch alternatives when available'
  : '';
return `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})${range}${crossSourceNote}`;
```

**P3.2 — Post-AI validation for cross-source bindings.** In function `generateAllComponentBindings`, inside the per-requirement binding loop — AFTER `const proposedColumnName` is extracted from the AI mapping, and BEFORE the `if (proposedColumnName)` block that creates the binding — add a cross-source redirect check.

Find the block that looks like:

```typescript
const proposedMapping = aiMapping[req.metricField];
const proposedColumnName = typeof proposedMapping === 'string'
  ? proposedMapping
  : proposedMapping?.column;
const proposedFilters = ...;
```

Change `const proposedColumnName` to `let proposedColumnName` and add the redirect check after the extraction:

```typescript
// HF-263: Cross-source binding validation.
// When the AI proposes a cross-source column, check if the entity_identifier's
// batch has a column with matching magnitude. Same-batch columns resolve
// through existing resolveColumnFromBatch without a boundary join.
if (proposedColumnName) {
  const proposedMC = measureColumns.find(c => c.name === proposedColumnName);
  if (proposedMC && proposedMC.fi.contextualIdentity === 'cross_source_numeric') {
    const eidBinding = bindings[compKey]?.entity_identifier;
    const eidBatchId = eidBinding?.learning_provenance?.batch_id;
    if (eidBatchId) {
      const sameBatchAlt = measureColumns.find(alt =>
        alt.batchId === eidBatchId &&
        alt.name !== proposedColumnName &&
        !boundColumnToField.has(alt.name) &&
        alt.stats && proposedMC.stats &&
        Math.abs(
          Math.log10(Math.max(alt.stats.mean, 0.001)) -
          Math.log10(Math.max(proposedMC.stats.mean, 0.001))
        ) < 1  // same order of magnitude
      );
      if (sameBatchAlt) {
        console.log(
          `[Convergence] HF-263: Redirecting ${req.metricField} from cross-source ` +
          `"${proposedColumnName}" to same-batch "${sameBatchAlt.name}" (key-space alignment)`
        );
        proposedColumnName = sameBatchAlt.name;
      }
    }
  }
}
```

**P3.3 — Verify `measureColumns` carries `batchId`.** Grep to confirm:

```bash
grep -n 'batchId' web/src/lib/intelligence/convergence-service.ts | head -20
```

The `measureColumns` array is populated in `generateAllComponentBindings` with `batchId: cap.batchIds[0] || ''`. Confirm this is present. If `batchId` is not on the measureColumns entries at the validation point, **HALT — report.**

**P3.4 — Build.** `npm run build` must succeed.

Commit: `HF-263 Phase 3: convergence key-space preference — cross-source column deprioritization`

### §3.4 — Phase 4: Calculable Entity Filtering

**Objective:** Only `entity_type='individual'` entities enter the calculation loop.

**P4.1 — Filter entity fetch in `run/route.ts`.** In `web/src/app/api/calculation/run/route.ts`, find the entity detail fetch (the paginated loop that builds the `entities` array — DIAG-059 P4.2 showed lines ~498-512). Add `.eq('entity_type', 'individual')` to the query:

```typescript
const { data: page } = await supabase.from('entities')
  .select('id, external_id, display_name, metadata')
  .in('id', batch)
  .eq('entity_type', 'individual');  // HF-263: exclude grouping entities
```

**P4.2 — Also filter the self-heal assignment block.** Find the self-heal block (~lines 398-433) that fetches ALL tenant entities when `rule_set_assignments` is empty. Add the same `.eq('entity_type', 'individual')` filter so grouping entities are never assigned for calculation.

```bash
grep -n 'self.heal\|all.*tenant.*entities\|entity_type' web/src/app/api/calculation/run/route.ts | head -20
```

Locate the self-heal query and add the filter.

**P4.3 — Verify `allEntityRowsForPeriod` is NOT filtered.** The `allEntityRowsForPeriod` construction (DIAG-059 P4.3, lines ~1708-1720) must remain unfiltered — it's built from `dataByEntity` (all committed_data), not from the calculation entity list. Grouping entity data rows must stay in the resolution pool for the scope prime's sibling-aggregation capability.

```bash
grep -n 'allEntityRows\|dataByEntity' web/src/app/api/calculation/run/route.ts | head -20
```

Confirm that `allEntityRowsForPeriod` iterates `dataByEntity` (which comes from `committed_data`), not from the filtered `entities`/`entityIds` array. If it derives from the filtered set, **HALT — report** (HALT-5 from directive: data source preservation).

**P4.4 — Build.** `npm run build` must succeed.

Commit: `HF-263 Phase 4: calculable entity filtering — entity_type individual only in calc loop`

### §3.5 — Phase 5: Architect-Executed Verification

**This phase is NOT executed by CC.** CC provides the verification scripts as committed files. The architect executes the re-import, calc run, and EPG scripts via browser + terminal.

**P5.1 — Create EPG verification scripts.** Write the following scripts to `scripts/hf263/`:

**`scripts/hf263/epg1-entity-types.ts`** — queries entities for Meridian tenant, reports counts by entity_type, lists all non-individual entities:

```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
async function main() {
  const { data } = await supabase.from('entities')
    .select('external_id, entity_type, display_name, metadata')
    .eq('tenant_id', TENANT).order('external_id');
  if (!data) { console.error('No data'); return; }
  const byType = new Map<string, number>();
  for (const e of data) byType.set(e.entity_type, (byType.get(e.entity_type) || 0) + 1);
  console.log('Entity counts by type:');
  for (const [t, c] of byType) console.log(`  ${t}: ${c}`);
  console.log('\nNon-individual entities:');
  for (const e of data.filter(e => e.entity_type !== 'individual'))
    console.log(`  ${e.external_id} → ${e.entity_type} metadata=${JSON.stringify(e.metadata)}`);
  console.log(`\nEPG-1: ${byType.get('individual') || 0} individual, ${(byType.get('location') || 0)} location`);
  console.log(`PASS: individual=67, location=12 → ${byType.get('individual') === 67 && byType.get('location') === 12 ? 'YES' : 'NO'}`);
}
main().catch(console.error);
```

**`scripts/hf263/epg2-relationships.ts`** — queries entity_relationships for Meridian, reports counts per hub:

```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
async function main() {
  const { data } = await supabase.from('entity_relationships')
    .select('source_entity_id, target_entity_id, relationship_type, confidence')
    .eq('tenant_id', TENANT);
  if (!data) { console.error('No data'); return; }
  console.log(`Total relationships: ${data.length}`);
  const entityIds = new Set<string>();
  for (const r of data) { entityIds.add(r.source_entity_id); entityIds.add(r.target_entity_id); }
  const { data: entities } = await supabase.from('entities')
    .select('id, external_id, entity_type').in('id', Array.from(entityIds));
  const eMap = new Map((entities || []).map(e => [e.id, e]));
  console.log('\nSample (first 10):');
  for (const r of data.slice(0, 10)) {
    const src = eMap.get(r.source_entity_id);
    const tgt = eMap.get(r.target_entity_id);
    console.log(`  ${src?.external_id}(${src?.entity_type}) → ${r.relationship_type} → ${tgt?.external_id}(${tgt?.entity_type})`);
  }
  const byTarget = new Map<string, number>();
  for (const r of data) {
    const tgt = eMap.get(r.target_entity_id)?.external_id || '?';
    byTarget.set(tgt, (byTarget.get(tgt) || 0) + 1);
  }
  console.log('\nPer hub:');
  for (const [hub, count] of Array.from(byTarget).sort()) console.log(`  ${hub}: ${count}`);
  console.log(`\nEPG-2 PASS: total=67, 12 distinct hubs → ${data.length === 67 && byTarget.size === 12 ? 'YES' : 'NO'}`);
}
main().catch(console.error);
```

**`scripts/hf263/epg3-bindings.ts`** — reads rule_sets.input_bindings for Meridian plan, shows fleet component binding source:

```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const RS = '2fb555d4-53fe-42e8-9662-cae3d07da4f4';
async function main() {
  const { data } = await supabase.from('rule_sets').select('input_bindings').eq('id', RS).single();
  const cb = (data?.input_bindings as Record<string,unknown>)?.convergence_bindings as Record<string,unknown>;
  if (!cb) { console.log('No convergence_bindings — run calc first'); return; }
  for (const key of ['component_4', 'component_9']) {
    const comp = cb[key] as Record<string,unknown>;
    if (!comp) { console.log(`${key}: not found`); continue; }
    console.log(`\n${key}:`);
    for (const [role, b] of Object.entries(comp)) {
      const binding = b as Record<string,unknown>;
      const fi = binding.field_identity as Record<string,unknown>;
      const prov = binding.learning_provenance as Record<string,unknown>;
      console.log(`  ${role}: column="${binding.column}" contextual="${fi?.contextualIdentity}" batch="${prov?.batch_id}" conf=${binding.confidence}`);
    }
  }
  // Check if fleet bindings are cross-source or same-batch
  const c4 = cb.component_4 as Record<string,unknown>;
  if (c4) {
    const eid = c4.entity_identifier as Record<string,unknown>;
    const fleet1 = c4.cargas_totales_hub as Record<string,unknown>;
    const eidBatch = (eid?.learning_provenance as Record<string,unknown>)?.batch_id;
    const fleetBatch = (fleet1?.learning_provenance as Record<string,unknown>)?.batch_id;
    const fi = (fleet1?.field_identity as Record<string,unknown>)?.contextualIdentity;
    console.log(`\nKey-space check: eid_batch=${eidBatch}, fleet_batch=${fleetBatch}, match=${eidBatch === fleetBatch}`);
    console.log(`EPG-3 PASS: fleet NOT cross_source_numeric AND same batch as eid → ${fi !== 'cross_source_numeric' && eidBatch === fleetBatch ? 'YES' : 'NO'}`);
  }
}
main().catch(console.error);
```

**`scripts/hf263/epg4-entity-count.ts`** — checks latest Meridian calc batch for entity count:

```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
async function main() {
  const { data } = await supabase.from('calculation_results')
    .select('entity_id, total_payout')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .limit(100);
  if (!data) { console.error('No results'); return; }
  const entityIds = new Set(data.map(r => r.entity_id));
  console.log(`Distinct entities in latest calc results: ${entityIds.size}`);
  // Check if any hub entities are in results
  const { data: entities } = await supabase.from('entities')
    .select('id, external_id, entity_type').in('id', Array.from(entityIds));
  const hubs = (entities || []).filter(e => e.entity_type !== 'individual');
  console.log(`Hub entities in calc results: ${hubs.length}`);
  for (const h of hubs) console.log(`  SPURIOUS: ${h.external_id} (${h.entity_type})`);
  console.log(`\nEPG-4 PASS: entities=67, hubs=0 → ${entityIds.size === 67 && hubs.length === 0 ? 'YES' : 'NO'}`);
}
main().catch(console.error);
```

**`scripts/hf263/epg5-calc-output.ts`** — dumps per-entity calc results for architect reconciliation:

```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
async function main() {
  const { data: batches } = await supabase.from('calculation_batches')
    .select('id, period_id, config')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .limit(3);
  if (!batches) { console.error('No batches'); return; }
  for (const batch of batches) {
    const periodLabel = (batch.config as Record<string,unknown>)?.periodLabel || batch.period_id;
    console.log(`\n=== Batch ${batch.id} period=${periodLabel} ===`);
    const { data: results } = await supabase.from('calculation_results')
      .select('entity_id, total_payout, components')
      .eq('batch_id', batch.id);
    if (!results) continue;
    const entityIds = results.map(r => r.entity_id);
    const { data: entities } = await supabase.from('entities')
      .select('id, external_id').in('id', entityIds);
    const eMap = new Map((entities || []).map(e => [e.id, e.external_id]));
    let total = 0;
    const perEntity: Record<string, number> = {};
    for (const r of results) {
      const extId = eMap.get(r.entity_id) || r.entity_id;
      total += Number(r.total_payout);
      perEntity[extId] = Number(r.total_payout);
    }
    console.log(`Entities: ${results.length}, Grand total: ${total}`);
    console.log(`perEntityTotals: ${JSON.stringify(perEntity)}`);
  }
}
main().catch(console.error);
```

Commit all scripts: `HF-263 Phase 5: EPG verification scripts for architect execution`

**P5.2 — PR creation.**

```bash
gh pr create --base main --head dev \
  --title "HF-263: Grouping Entity Resolution (CPI Phase 1)" \
  --body "Entity type intelligence (entity-resolution.ts), CPI relationship discovery (processEntityUnit), convergence key-space preference (convergence-service.ts), calculable entity filtering (run/route.ts). Closes DIAG-058 Condition A + DIAG-059 Class A/B. Governing spec: Entity Model Design D1-D3. EPG scripts at scripts/hf263/ for architect verification."
```

**P5.3 — Report to architect.** After PR creation, report:
- Phase 1-4 code diffs (paste `git diff` for each modified file)
- Build status
- Any HALTs encountered
- Note that EPG verification requires architect-driven re-import + calc via UI

The architect will: delete Meridian entities, re-import via browser, run calc, execute EPG scripts, capture evidence, and assemble the completion report at `docs/completion-reports/HF-263_GROUPING_ENTITY_RESOLUTION_COMPLETION.md`.

---

## §4 — HALT Conditions

**HALT-1:** RESOLVED. Hub entities created by `resolveEntitiesFromCommittedData` at `entity-resolution.ts:283`. Phase 1 targets this site.

**HALT-2:** RESOLVED. Unique constraint `uq_entity_relationship` applied by architect.

**HALT-3:** `existingMap`, `idBinding`, `enrichmentBindings`, or `rows` not in scope at the Phase 2 insertion point in processEntityUnit. If processEntityUnit was restructured and these variables are inaccessible, surface the current function structure with line numbers. Do not guess — paste the function signature and variable declarations.

**HALT-4:** `measureColumns` entries do not carry `batchId` at the cross-source validation point in `generateAllComponentBindings`. Confirm by grepping `batchId` in the measureColumns type and population. If absent, report.

**HALT-5:** `allEntityRowsForPeriod` is built from the filtered calculation entity set rather than from `committed_data`/`dataByEntity`. If Phase 4's entity filter also removes grouping entity data from the resolution pool, the scope prime loses hub data. Report the construction block with line numbers.

---

## §5 — Reporting Discipline

Completion report location: `docs/completion-reports/HF-263_GROUPING_ENTITY_RESOLUTION_COMPLETION.md`

CC produces: Phase 1-4 code diffs, build status, HALT status. Architect appends: EPG-1 through EPG-5 output, calc log excerpts, reconciliation verdict.

---

## §6 — Out of Scope

- CRP Plan 2/3 intent-constructor cognition_violation errors (separate defect class)
- CPI Dimensions 2-6 (Containment, Transactional, Temporal, Hierarchical Exclusion, Cardinality)
- Organizational Canvas UX (Entity Model Design D8)
- Period Entity State materialization (D5)
- Via-join mechanism in resolveMetricsFromConvergenceBindings
- Reference→member projection engine path (DIAG-058 scope prime route)
- HF-259 scope (ingestion path Q3+Q6+Q4)
- AUD-005 refresh

## §6A — Residuals

- **Reference-only data (no denormalized copy):** If a future tenant's data has grouping-entity metrics ONLY on reference-keyed rows, the convergence key-space preference has no same-batch alternative. The via-join or projection path is needed. Next capability expansion.
- **Entity type vocabulary refinement:** All non-individual reference entities get `'location'`. Distinguishing `'team'` vs `'organization'` vs `'location'` is a follow-on.
- **DIAG-058 `undefined===undefined` scope-match footgun:** Phase 4 filtering partially mitigates. Hardening candidate.
- **CRP Plan 2/3 errors:** Separate DIAG for intent-constructor cognition_violation on the rep variant (Plan 2) and cross-sell conditional (Plan 3).
- **HF-260 ADR residuals R1/R2/R3:** Stuck-claim-on-throw, CanonicalWriter retry/backoff, data-import hang mechanism — all independent of this HF.
