# HF-263 Continuation — HALT-A + HALT-B Resolution

## §0 — Context

This continues HF-263. Phases 1, 3-P3.1, 4, and 5-scripts are committed (d684925e, 9932be86, ebffcc28, dbfc4fdd). Two structural HALTs were reported. Architect dispositions below. After both are implemented, create the PR.

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Commit + push after each phase. Build gate before completion.

---

## §1 — HALT-A Disposition: Relocate Phase 2 (CPI Relationships) to post-commit-construction.ts

**Problem:** The directive placed CPI relationship discovery in `processEntityUnit` (execute-bulk `:326`), but `resolveEntitiesFromCommittedData` runs at `:345` — after. On fresh import, zero location entities exist when processEntityUnit runs. Additionally, `existingMap` only holds pre-existing entities, not newly created ones.

**Disposition:** Relocate CPI relationship discovery to `web/src/lib/sci/post-commit-construction.ts`, AFTER the `resolveEntitiesFromCommittedData` call. At that point both employee entities (from processEntityUnit) and hub/location entities (from resolveEntitiesFromCommittedData) exist in the database.

**Implementation:**

**P-A.1 — Read `post-commit-construction.ts`.** Identify the function structure, the `resolveEntitiesFromCommittedData` call site, and what parameters are available (tenantId, supabase, batchIds, etc.). Paste the function signature and the 20 lines surrounding the resolveEntitiesFromCommittedData call.

**P-A.2 — Add CPI relationship discovery block AFTER resolveEntitiesFromCommittedData returns.** The block:

1. Queries all entities for this tenant, partitioned by entity_type:
   - `individual` entities (employees)
   - Non-individual entities (locations/hubs) — the set just created by resolveEntitiesFromCommittedData

2. If zero non-individual entities exist, skip (no grouping entities to relate to).

3. Reads committed_data rows from the entity-classified batch(es) for this tenant. These are the rows that carry enrichment fields like `Hub_Asignado`. Identify entity-classified batches by querying import_batches where `metadata->>'classification' = 'entity'` for this tenant, or by reading committed_data where `data_type = 'entity'`.

4. For each column in the entity rows, computes value-set intersection with non-individual entity external_ids. When >50% of distinct values match, this column is a shared-attribute relationship bridge.

5. For each entity row, resolves the employee's entity UUID by querying `entities` WHERE `tenant_id` AND `external_id` matches the row's identifier value. Resolves the target grouping entity UUID similarly.

6. Creates `entity_relationships` rows via upsert (the unique constraint `uq_entity_relationship` is in place).

```typescript
// HF-263 Phase 2: CPI Shared Attribute relationship discovery.
// Runs after resolveEntitiesFromCommittedData so both individual and
// location entities exist. Korean Test: value-set intersection only.

// 1. Fetch all non-individual entities for this tenant
const { data: groupingEntities } = await supabase
  .from('entities')
  .select('id, external_id, entity_type')
  .eq('tenant_id', tenantId)
  .neq('entity_type', 'individual');

if (groupingEntities && groupingEntities.length > 0) {
  const groupingByExtId = new Map(
    groupingEntities.filter(e => e.external_id).map(e => [e.external_id!.trim(), e])
  );

  // 2. Read entity-classified committed_data rows (the roster/plantilla rows
  //    that carry enrichment fields like Hub_Asignado)
  const { data: entityRows } = await supabase
    .from('committed_data')
    .select('row_data, entity_id')
    .eq('tenant_id', tenantId)
    .eq('data_type', 'entity')
    .not('entity_id', 'is', null)
    .limit(2000);

  if (entityRows && entityRows.length > 0) {
    // 3. Discover all column keys from entity rows
    const allKeys = new Set<string>();
    for (const r of entityRows) {
      const rd = r.row_data as Record<string, unknown>;
      if (rd) for (const k of Object.keys(rd)) {
        if (!k.startsWith('_')) allKeys.add(k);
      }
    }

    // 4. For each column, check value-set intersection with grouping entities
    for (const colKey of allKeys) {
      const colValues = new Set<string>();
      for (const r of entityRows) {
        const rd = r.row_data as Record<string, unknown>;
        const val = rd?.[colKey];
        if (val != null && typeof val === 'string' && val.trim()) {
          colValues.add(val.trim());
        }
      }
      if (colValues.size === 0) continue;

      let intersectionCount = 0;
      for (const v of colValues) {
        if (groupingByExtId.has(v)) intersectionCount++;
      }

      // Structural threshold: >50% of distinct values match grouping entities
      if (intersectionCount === 0 || intersectionCount / colValues.size <= 0.5) continue;

      // 5. Build relationship rows
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

      for (const r of entityRows) {
        const rd = r.row_data as Record<string, unknown>;
        const groupVal = rd?.[colKey];
        if (!groupVal || typeof groupVal !== 'string' || !groupVal.trim()) continue;

        const groupEntity = groupingByExtId.get(groupVal.trim());
        if (!groupEntity) continue;

        // entity_id on the committed_data row IS the employee's entity UUID
        if (!r.entity_id) continue;

        relationships.push({
          tenant_id: tenantId,
          source_entity_id: r.entity_id,
          target_entity_id: groupEntity.id,
          relationship_type: 'assigned_to',
          source: 'ai_inferred',
          confidence: 0.85,
          evidence: {
            signal: 'shared_attribute',
            field: colKey,
            import_source: 'post_commit_construction',
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
          `[HF-263 CPI] Created ${relationships.length} '${colKey}' → assigned_to relationships ` +
          `(${groupingByExtId.size} grouping entities)`
        );
      }
    }
  }
}
```

**Key difference from the original Phase 2:** This version does NOT depend on `existingMap`, `idBinding`, `enrichmentBindings`, or `rows` — those were processEntityUnit-scoped variables. Instead it:
- Queries `entities` directly for grouping entities (they now exist, typed `'location'` by Phase 1)
- Reads `committed_data` WHERE `data_type='entity'` for entity rows
- Uses `entity_id` on committed_data rows (already backfilled by processEntityUnit) as the employee's entity UUID — no map lookup needed
- Iterates ALL non-underscore columns structurally (no column-name registry)

**P-A.3 — Verify `entity_id` is populated on entity committed_data rows.** The CPI block reads `r.entity_id` from entity-classified committed_data. Confirm processEntityUnit backfills `entity_id` on these rows. If `entity_id` is null on entity-classified rows at this point in the pipeline, the approach needs adjustment. Check:

```bash
grep -n 'entity_id' web/src/app/api/import/sci/execute-bulk/route.ts | head -30
```

If entity_id is NOT backfilled on entity-classified committed_data rows by the time post-commit-construction runs, use the alternative: join on `row_data->>'<identifier_column>'` against `entities.external_id`. The identifier column can be discovered from the same committed_data rows by finding the column whose distinct values have the highest intersection with `entities.external_id` WHERE `entity_type='individual'`.

**P-A.4 — Build.** `npm run build` must succeed.

Commit: `HF-263 Phase 2: CPI relationship discovery — relocated to post-commit-construction (HALT-A)`

---

## §2 — HALT-B Disposition: P3.2 Cross-Source Redirect as Post-Pass

**Problem:** The directive placed the cross-source redirect inside the measure-binding loop (`:2633`), but `entity_identifier` isn't bound until `:2781`. The eidBatchId is always undefined.

**Disposition:** Implement the redirect as a post-pass after ALL bindings (including entity_identifier) are constructed, at the end of each variant group's processing — just before the closing `} // end for (match of groupMatches)` or equivalently after the entity_identifier binding block.

**Implementation:**

**P-B.1 — Locate the insertion point.** In `web/src/lib/intelligence/convergence-service.ts`, inside `generateAllComponentBindings`, find the end of each variant group's processing. This is after the entity_identifier and period binding blocks, before the `} // HF-253 end for (variant group)` closing brace. The "Log complete binding map" block is after all variant groups; the post-pass should be inside each group.

Paste the 10 lines before `} // HF-253 end for (variant group)` to confirm the insertion point.

**P-B.2 — Add the post-pass.** After all bindings for the variant group are constructed (entity_identifier is now known), sweep the measure bindings and redirect any cross-source binding that has a same-batch alternative:

```typescript
    // HF-263 P3.2: Post-pass cross-source redirect.
    // Now that entity_identifier is bound, check each measure binding:
    // if it points to a cross_source_numeric column and a same-batch
    // column exists with matching magnitude, redirect.
    for (const match of groupMatches) {
      const compKey = `component_${match.component.index}`;
      const cb = bindings[compKey];
      if (!cb) continue;

      const eidBinding = cb.entity_identifier;
      const eidBatchId = eidBinding?.learning_provenance?.batch_id;
      if (!eidBatchId) continue;

      for (const [role, binding] of Object.entries(cb)) {
        if (role === 'entity_identifier' || role === 'period') continue;
        if (binding.field_identity?.contextualIdentity !== 'cross_source_numeric') continue;

        // Find a same-batch column with matching magnitude
        const currentMC = measureColumns.find(mc => mc.name === binding.column);
        if (!currentMC?.stats) continue;

        const sameBatchAlt = measureColumns.find(alt =>
          alt.batchId === eidBatchId &&
          alt.name !== binding.column &&
          alt.stats &&
          Math.abs(
            Math.log10(Math.max(alt.stats.mean, 0.001)) -
            Math.log10(Math.max(currentMC.stats.mean, 0.001))
          ) < 1
        );

        if (sameBatchAlt) {
          console.log(
            `[Convergence] HF-263 P3.2: Post-pass redirect ${compKey}:${role} ` +
            `from cross-source "${binding.column}" to same-batch "${sameBatchAlt.name}"`
          );
          binding.column = sameBatchAlt.name;
          binding.field_identity = sameBatchAlt.fi;
          binding.confidence = Math.max(binding.confidence, 0.7);
          if (binding.learning_provenance) {
            binding.learning_provenance.batch_id = sameBatchAlt.batchId;
          }
        }
      }
    }
```

**Scope check:** `measureColumns` must be in scope at this point. It is — it's declared at the top of `generateAllComponentBindings` and is available throughout the function. `bindings` is the output parameter, also in scope. `groupMatches` is the current variant group's match array. All three are accessible.

**P-B.3 — Build.** `npm run build` must succeed.

Commit: `HF-263 Phase 3 P3.2: post-pass cross-source redirect (HALT-B)`

---

## §3 — PR Creation

After both commits build clean:

```bash
gh pr create --base main --head dev \
  --title "HF-263: Grouping Entity Resolution (CPI Phase 1)" \
  --body "Entity type intelligence (entity-resolution.ts), CPI relationship discovery (post-commit-construction.ts), convergence key-space preference with prompt annotation + post-pass redirect (convergence-service.ts), calculable entity filtering (run/route.ts). Closes DIAG-058 Condition A + DIAG-059 Class A/B. Governing spec: Entity Model Design D1-D3. EPG scripts at scripts/hf263/ for architect verification."
```

Report to architect: paste git diffs for both new commits, build status, and PR URL.

---

## §4 — HALT Conditions

**HALT-C:** `entity_id` is null on entity-classified committed_data rows when post-commit-construction runs. If the backfill hasn't happened yet, the CPI block can't join employees to their rows. Report the `entity_id` state on entity-classified committed_data. The alternative approach (value-intersection discovery of the identifier column) is described in P-A.3.

**HALT-D:** `measureColumns` is not in scope at the P3.2 insertion point (after the variant group's binding loop). This would only happen if the variable was redeclared in a narrower scope. Confirm by reading the declaration. Report if not accessible.
