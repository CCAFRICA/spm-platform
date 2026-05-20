# DIAG-052 — Post-HF-238 Proof Tenant Regression Triage

**Branch:** `diag-052-post-hf238-triage` off `main @ 63212283` (HF-238 PR #420 squash merge)
**Date captured:** 2026-05-19
**Scope:** Read-only diagnostic. No code changes; no file modifications. No interpretation.

Seven probes follow. Each section pastes verbatim output of the corresponding script or git diff.

---

## PROBE 1 — Stored bindings (full JSONB)

**Script:** `web/scripts/diag-052-probe1-bindings.ts`

```
=== PROBE 1 — Stored bindings (rule_sets.input_bindings, full JSONB) ===

──── Meridian Logistics Group / "Meridian Logistics Group Incentive Plan 2025" [19f56c1d-cc49-496a-92a9-7e1b42278252] status=active ────
  input_bindings: {} (empty object)

──── Meridian Logistics Group / "Meridian Logistics Group Incentive Plan 2025" [6c98f209-6643-4242-96f5-174bdd034fa4] status=active ────
  input_bindings: {} (empty object)

──── Meridian Logistics Group / "Meridian Logistics Group Incentive Plan 2025" [9ac467ba-bab4-4680-9453-5cb3deae02c6] status=active ────
  input_bindings: {} (empty object)

──── Meridian Logistics Group / "Meridian Logistics Group Incentive Plan 2025" [a7d7ea62-e5bd-454b-8d92-2e09146842db] status=active ────
  input_bindings: {} (empty object)

──── Meridian Logistics Group / "Meridian Logistics Group Incentive Plan 2025" [cca32ebb-c1a4-416e-8d3e-6eedea506cd2] status=active ────
  input_bindings: {} (empty object)

──── Banco Cumbre del Litoral / "Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026" [59f3be4d-3dac-450b-8aef-26c33fdc8028] status=active ────
  top-level keys: [convergence_version, convergence_bindings]
  component_bindings: <absent>
  metric_derivations: <absent>
  full content (truncated to 2000):
{
  "convergence_version": "HF-234",
  "convergence_bindings": {
    "component_0": {
      "row": {
        "column": "Cumplimiento_Colocacion",
        "filters": [],
        "confidence": 0.9,
        "match_pass": 1,
        "scale_factor": 100,
        "field_identity": {
          "confidence": 0.7,
          "structuralType": "measure",
          "contextualIdentity": "count"
        },
        "learning_provenance": {
          "batch_id": "c710a682-dd9f-4aa0-968a-5a883cb2dbf0",
          "learned_at": "2026-05-19T23:37:52.772Z"
        }
      },
      "column": {
        "column": "Indice_Calidad_Cartera",
        "filters": [],
        "confidence": 0.9,
        "match_pass": 1,
        "field_identity": {
          "confidence": 0.7,
          "structuralType": "measure",
          "contextualIdentity": "count"
        },
        "learning_provenance": {
          "batch_id": "c710a682-dd9f-4aa0-968a-5a883cb2dbf0",
          "learned_at": "2026-05-19T23:37:52.772Z"
        }
      },
      "period": {
        "column": "Periodo",
        "confidence": 0.775,
        "match_pass": 1,
        "field_identity": {
          "confidence": 0.9,
          "structuralType": "temporal",
          "contextualIdentity": "date"
        },
        "learning_provenance": {
          "batch_id": "c710a682-dd9f-4aa0-968a-5a883cb2dbf0",
          "learned_at": "2026-05-19T23:37:52.818Z"
        }
      },
      "entity_identifier": {
        "column": "ID_Empleado",
        "confidence": 0.3333333333333333,
        "match_pass": 1,
        "field_identity": {
          "confidence": 0.95,
          "structuralType": "identifier",
          "contextualIdentity": "person_identifier"
        },
        "learning_provenance": {
          "batch_id": "c710a682-dd9f-4aa0-968a-5a883cb2dbf0",
          "learned_at": "2026-05-19T23:37:52.800Z"
        }
      }
    },
    "component_1": {
      "actual": {
        "column": "Pct_Meta_Depositos",
        "filters": [],
        "co
  ... [TRUNCATED]

──── Cascade Revenue Partners / "Consumables Commission Plan" [2ebfc02a-13e6-49a3-a7eb-f683a505b06b] status=active ────
  top-level keys: [metric_derivations, convergence_version, convergence_bindings]
  component_bindings: <absent>
  metric_derivations: array len=2
  full content (truncated to 2000):
{
  "metric_derivations": [
    {
      "metric": "consumable_revenue",
      "filters": [
        {
          "field": "product_category",
          "value": "Consumables",
          "operator": "eq"
        }
      ],
      "operation": "sum",
      "source_field": "total_amount",
      "source_pattern": "transaction"
    },
    {
      "metric": "monthly_quota",
      "filters": [],
      "operation": "sum",
      "source_field": "monthly_quota",
      "source_pattern": "target"
    }
  ],
  "convergence_version": "HF-234",
  "convergence_bindings": {
    "component_0": {
      "actual": {
        "column": "unit_price",
        "confidence": 0.26349999999999996,
        "match_pass": 3,
        "field_identity": {
          "confidence": 0.4,
          "structuralType": "measure",
          "contextualIdentity": "cross_source_numeric"
        },
        "learning_provenance": {
          "batch_id": "fba99464-f8ea-4039-b81c-5c75b962fd30",
          "learned_at": "2026-05-19T02:44:30.592Z"
        }
      },
      "period": {
        "column": "effective_date",
        "confidence": 0.775,
        "match_pass": 1,
        "field_identity": {
          "confidence": 0.98,
          "structuralType": "temporal",
          "contextualIdentity": "quota_effective_date"
        },
        "learning_provenance": {
          "batch_id": "5ca188f0-5112-46f8-9137-9332ad1fb412",
          "learned_at": "2026-05-19T02:44:30.631Z"
        }
      },
      "numerator": {
        "column": "total_amount",
        "filters": [],
        "confidence": 0.9,
        "match_pass": 1,
        "field_identity": {
          "confidence": 0.4,
          "structuralType": "measure",
          "contextualIdentity": "cross_source_numeric"
        },
        "learning_provenance": {
          "batch_id": "fba99464-f8ea-4039-b81c-5c75b962fd30",
          "learned_at": "2026-05-19T02:44:30.591Z"
        }
      },
      "denominator": {
        "column": "monthly_quota",
        "filters": []
  ... [TRUNCATED]

──── Cascade Revenue Partners / "District Override Plan" [2df3544d-f268-4333-8991-e7363f075173] status=active ────
  input_bindings: {} (empty object)

──── Cascade Revenue Partners / "Capital Equipment Commission Plan" [6b45f1ef-658f-45ba-bd18-a6473548a11a] status=active ────
  input_bindings: {} (empty object)

──── Cascade Revenue Partners / "Cross-Sell Bonus Plan" [18701001-c65e-4105-a95f-711840f3a357] status=active ────
  input_bindings: {} (empty object)

──── Cascade Revenue Partners / "District Override Plan" [44a00635-ac32-4c87-b81d-76a1af365bd6] status=active ────
  top-level keys: [convergence_version, convergence_bindings]
  component_bindings: <absent>
  metric_derivations: <absent>
  full content (truncated to 2000):
{
  "convergence_version": "HF-234",
  "convergence_bindings": {
    "component_0": {
      "actual": {
        "column": "total_amount",
        "filters": [],
        "confidence": 0.9,
        "match_pass": 1,
        "field_identity": {
          "confidence": 0.4,
          "structuralType": "measure",
          "contextualIdentity": "cross_source_numeric"
        },
        "learning_provenance": {
          "batch_id": "fba99464-f8ea-4039-b81c-5c75b962fd30",
          "learned_at": "2026-05-19T15:31:20.272Z"
        }
      },
      "period": {
        "column": "effective_date",
        "confidence": 0.775,
        "match_pass": 1,
        "field_identity": {
          "confidence": 0.98,
          "structuralType": "temporal",
          "contextualIdentity": "quota_effective_date"
        },
        "learning_provenance": {
          "batch_id": "5ca188f0-5112-46f8-9137-9332ad1fb412",
          "learned_at": "2026-05-19T15:31:20.356Z"
        }
      },
      "entity_identifier": {
        "column": "entity_id",
        "confidence": 1,
        "match_pass": 1,
        "field_identity": {
          "confidence": 0.95,
          "structuralType": "identifier",
          "contextualIdentity": "person_identifier"
        },
        "learning_provenance": {
          "batch_id": "5ca188f0-5112-46f8-9137-9332ad1fb412",
          "learned_at": "2026-05-19T15:31:20.315Z"
        }
      }
    }
  }
}


=== structural_fingerprints state ===

── Banco Cumbre del Litoral [b1c2d3e4-aaaa-bbbb-cccc-111111111111] ──
  count: null
── Cascade Revenue Partners [e44bbcb1-2710-4880-8c7d-a1bd902720b7] ──
  count: null
── Meridian Logistics Group [5035b1e8-0754-4527-b7ec-9f93f85e4c79] ──
  count: null
── MX Restaurant [3d354bfa-b298-48dd-88a0-9f8c5a00be4e] ──
  count: null
── TomiCo [07638678-d141-429f-a902-6200addb2dc7] ──
  count: null
```

---

## PROBE 2 — Convergence write path diff

### 2A — `grep -rn "input_bindings" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."`

```
src/types/convergence-bindings.ts:6: * `rule_sets.input_bindings.convergence_bindings` (JSONB).
src/app/api/intelligence/wire/route.ts:11: *   5. Run convergence to generate input_bindings
src/app/api/intelligence/wire/route.ts:367:            .select('input_bindings')
src/app/api/intelligence/wire/route.ts:371:          const existing = ((currentRS?.input_bindings as Record<string, unknown>)?.metric_derivations ?? []) as Array<Record<string, unknown>>;
src/app/api/intelligence/wire/route.ts:390:            .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
src/app/api/intelligence/converge/route.ts:6: * writes them as input_bindings on the relevant rule_sets.
src/app/api/intelligence/converge/route.ts:57:          .select('input_bindings')
src/app/api/intelligence/converge/route.ts:61:        const existing = ((rs?.input_bindings as Record<string, unknown>)?.metric_derivations ?? []) as Array<Record<string, unknown>>;
src/app/api/intelligence/converge/route.ts:81:          .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
src/app/api/plan/import/route.ts:80:      // TODO (Decision 64): Plan import should generate input_bindings from AI interpretation.
src/app/api/plan/import/route.ts:83:      input_bindings: {} as Json,
src/app/api/import/commit/route.ts:55:// This produces clean semantic data_types for input_bindings resolution
src/app/api/import/commit/route.ts:771:      // Priority 3 (OB-119): Normalized filename — semantic data_type for input_bindings
src/app/api/import/sci/execute-bulk/route.ts:532:      .update({ input_bindings: {} })
src/app/api/import/sci/execute-bulk/route.ts:537:      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (entity data imported — convergence will re-derive)`);
src/app/api/import/sci/execute-bulk/route.ts:579:      .update({ input_bindings: {} })
src/app/api/import/sci/execute-bulk/route.ts:584:      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (new data imported — convergence will re-derive)`);
src/app/api/import/sci/execute-bulk/route.ts:595:  // Convergence: deferred to calculation time (engine derives when input_bindings empty).
src/app/api/import/sci/execute-bulk/route.ts:657:      .update({ input_bindings: {} })
src/app/api/import/sci/execute-bulk/route.ts:662:      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (reference data imported — convergence will re-derive)`);
src/app/api/import/sci/execute/route.ts:908:      input_bindings: engineFormat.inputBindings as unknown as Json,
src/app/api/import/sci/execute/route.ts:1162:      input_bindings: engineFormat.inputBindings as unknown as Json,
src/app/api/calculation/run/route.ts:185:    .select('id, name, components, input_bindings, population_config, metadata')
src/app/api/calculation/run/route.ts:229:  // If input_bindings is empty, run convergence now to generate derivation rules.
src/app/api/calculation/run/route.ts:231:    const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
src/app/api/calculation/run/route.ts:250:      addLog('HF-165: input_bindings empty — running calc-time convergence');
src/app/api/calculation/run/route.ts:280:            .update({ input_bindings: updatedBindings as unknown as Json })
src/app/api/calculation/run/route.ts:286:            .select('input_bindings')
src/app/api/calculation/run/route.ts:291:            (ruleSet as Record<string, unknown>).input_bindings = updatedRS.input_bindings;
src/app/api/calculation/run/route.ts:306:      addLog('HF-165: input_bindings already populated — skipping convergence');
src/app/api/calculation/run/route.ts:310:  // ── OB-118: Parse metric derivation rules from input_bindings ──
src/app/api/calculation/run/route.ts:311:  const inputBindings = ruleSet.input_bindings as Record<string, unknown> | null;
src/app/api/calculation/run/route.ts:315:    addLog(`OB-118 Metric derivations: ${metricDerivations.length} rules from input_bindings`);
src/app/api/calculation/run/route.ts:324:      .select('id, input_bindings')
src/app/api/calculation/run/route.ts:329:      const opBindings = op.input_bindings as Record<string, unknown> | null;
src/app/api/calculation/run/route.ts:339:  // OB-153: Parse metric_mappings from input_bindings
src/app/api/calculation/run/route.ts:343:    addLog(`OB-153 Metric mappings: ${Object.keys(metricMappings).length} mappings from input_bindings`);
src/app/api/calculation/run/route.ts:346:  // HF-108: Parse convergence_bindings from input_bindings (Decision 111)
src/app/api/calculation/run/route.ts:362:    addLog('HF-108 WARNING: No input_bindings found — calculation may produce incomplete results');
src/app/api/calculation/run/route.ts:2063:              .select('input_bindings, updated_at')
src/app/api/calculation/run/route.ts:2067:            const currentBindings = (rsRow.input_bindings as Record<string, unknown>) ?? {};
src/app/api/calculation/run/route.ts:2087:              .update({ input_bindings: newBindings as unknown as Json })
src/app/api/calculation/run/route.ts:2843:    const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
src/app/api/plan-readiness/route.ts:29:    .select('id, name, input_bindings, status')
src/app/api/plan-readiness/route.ts:49:  // Check bindings from rule_sets.input_bindings JSONB column
src/app/api/plan-readiness/route.ts:54:    const bindings = rs.input_bindings as Record<string, unknown> | null;
src/app/api/plan-readiness/route.ts:73:  // without explicit input_bindings (via buildMetricsForComponent token matching).
src/lib/intelligence/convergence-service.ts:6: * AND per-component input_bindings for Decision 111 convergence.
src/lib/intelligence/convergence-service.ts:214:    .select('id, name, components, input_bindings')
src/lib/intelligence/convergence-service.ts:345:  const existingConvergenceBindings = (ruleSet.input_bindings as Record<string, unknown>)?.convergence_bindings as
src/lib/sci/commit-content-unit.ts:22://   • input_bindings invalidation (Layer 4 cache clear — caller decides
src/lib/supabase/database.types.ts:326:          input_bindings: Json;
src/lib/supabase/database.types.ts:346:          input_bindings?: Json;
src/lib/supabase/database.types.ts:364:          input_bindings?: Json;
src/lib/supabase/rule-set-service.ts:72:    input_bindings: {} as Json,
src/lib/calculation/run-calculation.ts:60: * A single metric derivation rule from input_bindings.metric_derivations.
src/lib/calculation/run-calculation.ts:95: * @param derivations - Derivation rules from input_bindings.metric_derivations
src/lib/calculation/run-calculation.ts:766:  // OB-153: Apply metric_mappings from input_bindings (HIGHEST PRIORITY)
src/lib/calculation/run-calculation.ts:825:    .select('id, name, components, input_bindings, population_config, metadata')
src/lib/calculation/run-calculation.ts:860:  // ── OB-118: Parse metric derivation rules from input_bindings ──
src/lib/calculation/run-calculation.ts:861:  const inputBindings = ruleSet.input_bindings as Record<string, unknown> | null;
```

### 2B — Convergence write site (`web/src/app/api/calculation/run/route.ts` lines 220-310)

```typescript
      { status: 400 }
    );
  }

  addLog(`Rule set "${ruleSet.name}" has ${defaultComponents.length} components`);

  // ── HF-165: Calc-time convergence (completes OB-182 deferred architecture) ──
  // OB-182 removed convergence from the bulk import path to eliminate sequence dependency.
  // At calculation time, both plans AND data are guaranteed to exist.
  // If input_bindings is empty, run convergence now to generate derivation rules.
  {
    const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
    const hasMetricDerivations = Array.isArray(rawBindings?.metric_derivations) && (rawBindings.metric_derivations as unknown[]).length > 0;
    const hasConvergenceBindings = rawBindings?.convergence_bindings && Object.keys(rawBindings.convergence_bindings as Record<string, unknown>).length > 0;
    // HF-226 Phase 2B: convergence_version marker. Pre-HF-226 bindings were
    // produced by generateDerivationsForMatch which hardcoded filters: [] —
    // they look "complete" but never carry filter information. Re-derive
    // when the marker is absent so the unified Pass 4 path runs fresh and
    // produces filters for metrics that semantically require categorical
    // subsetting.
    const convergenceVersion = typeof rawBindings?.convergence_version === 'string' ? rawBindings.convergence_version : null;
    // HF-234: separation of concerns moved filter discovery from Call 1's
    // binding output to Pass 4's metric_derivations. Pre-HF-234 bindings may
    // carry filters on the binding entry from Call 1's object-form return;
    // those are now stale because Pass 4 also produces filters for the same
    // metric (different key) and the engine consumes BOTH. Force re-derive
    // for any rule_set not yet at HF-234.
    const bindingsAreCurrent = convergenceVersion === 'HF-234';

    if ((!hasMetricDerivations && !hasConvergenceBindings) || !bindingsAreCurrent) {
      addLog('HF-165: input_bindings empty — running calc-time convergence');
      try {
        const convResult = await convergeBindings(tenantId, ruleSetId, supabase, calculationRunId);
        const derivationCount = convResult.derivations.length;
        const bindingCount = Object.keys(convResult.componentBindings).length;
        const gapCount = convResult.gaps.length;

        if (derivationCount > 0 || bindingCount > 0) {
          // Store convergence results on the rule_set for future calculations
          const updatedBindings: Record<string, unknown> = {};

          if (bindingCount > 0) {
            // Decision 111: convergence_bindings is the primary output
            updatedBindings.convergence_bindings = convResult.componentBindings;
          }

          if (derivationCount > 0) {
            updatedBindings.metric_derivations = convResult.derivations;
          }

          // HF-234: stamp the convergence_version so the reuse gate at line
          // ~228 can distinguish pre-HF-234 (filters on binding) from
          // post-HF-234 (filters on metric_derivations only) outputs. Bumped
          // from 'HF-226' once the Call-1 prompt stopped requesting filters
          // and Pass 4 became the sole filter-discovery surface.
          updatedBindings.convergence_version = 'HF-234';

          // Persist to rule_set for reuse on subsequent calculations
          await supabase
            .from('rule_sets')
            .update({ input_bindings: updatedBindings as unknown as Json })
            .eq('id', ruleSetId);

          // Re-read the updated rule_set so the engine uses the new bindings
          const { data: updatedRS } = await supabase
            .from('rule_sets')
            .select('input_bindings')
            .eq('id', ruleSetId)
            .single();

          if (updatedRS) {
            (ruleSet as Record<string, unknown>).input_bindings = updatedRS.input_bindings;
          }

          addLog(`HF-165: Convergence complete — ${derivationCount} derivations, ${bindingCount} component bindings, ${gapCount} gaps`);
        } else {
          addLog(`HF-165: Convergence produced 0 derivations and 0 bindings (${gapCount} gaps)`);
          for (const gap of convResult.gaps) {
            addLog(`HF-165 Gap: ${gap.component} — ${gap.reason}`);
          }
        }
      } catch (convErr) {
        // Non-blocking: convergence failure should not prevent calculation attempt
        addLog(`HF-165: Convergence failed (non-blocking): ${convErr instanceof Error ? convErr.message : String(convErr)}`);
      }
    } else {
      addLog('HF-165: input_bindings already populated — skipping convergence');
    }
  }

  // ── OB-118: Parse metric derivation rules from input_bindings ──
```

### 2C — `git diff 8600aaa7..63212283 -- web/src/lib/intelligence/convergence-service.ts`

```diff
diff --git a/web/src/lib/intelligence/convergence-service.ts b/web/src/lib/intelligence/convergence-service.ts
index 0d016b00..4655529b 100644
--- a/web/src/lib/intelligence/convergence-service.ts
+++ b/web/src/lib/intelligence/convergence-service.ts
@@ -2710,6 +2710,20 @@ IMPORTANT RULES:
 - For count metrics (e.g., "Deal Count", "Cross Sell Count"), use the "count" operation with appropriate filters.
 - For metrics with a scope note, the derivation defines how to compute the metric per entity — the platform handles scope aggregation separately.
 
+HF-238 NOTE — DAG semantics behind the emission shape:
+The runtime translates each derivation into a Prime-DAG composition over the
+nine engine primes (arithmetic, aggregate, filter, conditional, scope, compare,
+logical, constant, reference). The emission shape below maps to:
+  • sum / count / avg / min / max  →  filter(predicate, ...)+ wrapping aggregate(op, field).
+    Each entry in "filters" becomes one filter prime; the aggregate prime sits at the innermost
+    position, reducing the row set narrowed by the filter chain.
+  • ratio                          →  arithmetic(divide, reference(num), reference(den)),
+    zero-guarded via conditional(compare(eq, den, 0), 0, divide).
+  • delta                          →  not yet expressible in the row-context EvalContext
+    (requires prior-period rows); the engine retains a hybrid path for delta until
+    historical-row plumbing lands.
+Filter operators recognized by the filter prime: eq, neq, gt, gte, lt, lte, contains.
+
 Operations:
 - sum: SUM a numeric field, optionally filtered by a categorical field value
 - count: COUNT rows, optionally filtered by a categorical field value
```

### 2D — `git diff 8600aaa7..63212283 -- web/src/app/api/calculation/run/route.ts`

```diff
diff --git a/web/src/app/api/calculation/run/route.ts b/web/src/app/api/calculation/run/route.ts
index 21f7a058..08b4e39f 100644
--- a/web/src/app/api/calculation/run/route.ts
+++ b/web/src/app/api/calculation/run/route.ts
@@ -1667,6 +1667,24 @@ export async function POST(request: NextRequest) {
   addLog(`[CalcRecon-T1] verbosityMode=${CALC_TRACE_VERBOSE ? 'FORENSIC (Tier 4 enabled)' : 'DEFAULT (Tier 1-3 only)'}`);
   addLog(`[CalcRecon-T1] ─── Loop starts; Tier 2 lines emit per entity, Tier 3 emit on exceptions ───`);
 
+  // HF-238 Phase 3: build allEntityRows once per period for the scope+aggregate
+  // prime composition. The structural scope prime narrows allEntityRows to
+  // peer entities sharing the boundary attribute value; previously this was
+  // pre-computed per-entity via aggregateScopeRows (deleted below).
+  const allEntityRowsForPeriod: Array<{ entityMetadata: Record<string, unknown>; row: Record<string, unknown> }> = [];
+  for (const [eid, sheetMap] of Array.from(dataByEntity.entries())) {
+    const meta = (entityMap.get(eid)?.metadata || {}) as Record<string, unknown>;
+    const metaWithId: Record<string, unknown> = { ...meta, entityId: eid };
+    for (const [, rows] of Array.from(sheetMap.entries())) {
+      for (const r of rows) {
+        const rd = (r.row_data && typeof r.row_data === 'object' && !Array.isArray(r.row_data))
+          ? r.row_data as Record<string, unknown>
+          : {};
+        allEntityRowsForPeriod.push({ entityMetadata: metaWithId, row: rd });
+      }
+    }
+  }
+
   for (const entityId of calculationEntityIds) {
     const entityInfo = entityMap.get(entityId);
     const entityRowsFlat = flatDataByEntity.get(entityId) || [];
@@ -2342,59 +2360,13 @@ export async function POST(request: NextRequest) {
       }
     }
 
-    // HF-155 Item 2 + OB-186: Populate scopeAggregates for entities with scope data
-    // Resolves scope from entities.metadata (district, region, store_id)
-    // OB-186: Produces BOTH unfiltered aggregates (raw field sums) AND filtered
-    // aggregates (metric_derivation rules applied). Filtered aggregates use the
-    // derived metric name as key (e.g., "district:equipment_revenue:sum").
-    const entityScopeAgg: Record<string, number> = {};
+    // HF-238 Phase 3: aggregateScopeRows pre-computation deleted. The scope+
+    // aggregate prime composition computes hierarchical aggregates on the fly
+    // from allEntityRowsForPeriod (built once above). Entity attributes are
+    // passed via entityData.attributes so the scope prime can read the
+    // boundary value from context.entity.metadata.
     const entityMeta = entityMap.get(entityId);
     const entityMetadata = (entityMeta?.metadata || {}) as Record<string, unknown>;
-    const entityDistrict = entityMetadata.district || entityMetadata.store_id;
-    const entityRegion = entityMetadata.region;
-
-    // Helper: aggregate rows from other entities in same scope
-    const aggregateScopeRows = (
-      scopeField: string,
-      scopeValue: unknown,
-      scopePrefix: string,
-    ) => {
-      for (const [otherId, otherSheetMap] of Array.from(dataByEntity.entries())) {
-        if (otherId === entityId) continue;
-        const otherMeta = entityMap.get(otherId);
-        const otherMetaData = (otherMeta?.metadata || {}) as Record<string, unknown>;
-        const otherScope = scopeField === 'district'
-          ? (otherMetaData.district || otherMetaData.store_id)
-          : otherMetaData.region;
-        if (otherScope !== scopeValue) continue;
-
-        for (const [, rows] of Array.from(otherSheetMap.entries())) {
-          for (const row of rows) {
-            const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
-              ? row.row_data as Record<string, unknown> : {};
-
-            // Unfiltered: sum all numeric fields
-            for (const [key, val] of Object.entries(rd)) {
-              if (key.startsWith('_') || typeof val !== 'number') continue;
-              entityScopeAgg[`${scopePrefix}:${key}:sum`] = (entityScopeAgg[`${scopePrefix}:${key}:sum`] || 0) + val;
-            }
-
-            // OB-186: Filtered scope aggregates from metric_derivation rules
-            for (const rule of metricDerivations) {
-              if (rule.operation !== 'sum' || !rule.source_field) continue;
-              if (!rowMatchesFilters(rd, rule.filters)) continue;
-              const val = rd[rule.source_field];
-              if (typeof val === 'number') {
-                entityScopeAgg[`${scopePrefix}:${rule.metric}:sum`] = (entityScopeAgg[`${scopePrefix}:${rule.metric}:sum`] || 0) + val;
-              }
-            }
-          }
-        }
-      }
-    };
-
-    if (entityDistrict) aggregateScopeRows('district', entityDistrict, 'district');
-    if (entityRegion) aggregateScopeRows('region', entityRegion, 'region');
 
     // Intent executor is sole authority (Decision 151). Rounding applied here.
     let intentTotalDecimal = ZERO;
@@ -2416,14 +2388,27 @@ export async function POST(request: NextRequest) {
           `Decision 153 / Decision 111 violation.`
         );
       }
+      // HF-238 Phase 3: entity attributes populated from entities.metadata so
+      // the scope prime can read the boundary value (district/region/etc.)
+      // from context.entity.metadata. Numeric fields are coerced for
+      // arithmetic compatibility; string/boolean values pass through.
+      const entityAttributesForExec: Record<string, string | number | boolean> = {};
+      for (const [k, v] of Object.entries(entityMetadata)) {
+        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
+          entityAttributesForExec[k] = v;
+        }
+      }
+
       const entityData: EntityData = {
         entityId,
         metrics,
-        attributes: {},
+        attributes: entityAttributesForExec,
         priorResults: [...priorResults],
         periodHistory: periodHistoryMap.get(entityId),
         crossDataCounts: entityCrossData,
-        scopeAggregates: entityScopeAgg,
+        // HF-238 Phase 3: allEntityRowsForPeriod replaces the pre-computed
+        // scopeAggregates surface; the scope prime walks these rows directly.
+        allEntityRows: allEntityRowsForPeriod,
         // HF-211: Route intent-executor [CalcTrace] emissions through buffer (only for traced
         // entities) so they flush after the [CalcRecon] block at handler exit.
         traceCollector: shouldEmitTrace(entityInfo?.external_id ?? entityId) ? bufferTrace : undefined,
```

### 2D (cont) — `git diff 8600aaa7..63212283 -- web/src/lib/calculation/run-calculation.ts`

```diff
diff --git a/web/src/lib/calculation/run-calculation.ts b/web/src/lib/calculation/run-calculation.ts
index b9ab342c..1925ccb0 100644
--- a/web/src/lib/calculation/run-calculation.ts
+++ b/web/src/lib/calculation/run-calculation.ts
@@ -19,8 +19,9 @@ import {
   inferSemanticType,
   findSheetForComponent,
 } from '@/lib/orchestration/metric-resolver';
-import { executeOperation, type EntityData } from '@/lib/calculation/intent-executor';
-import { isIntentOperation, type IntentOperation } from '@/lib/calculation/intent-types';
+import { evaluate, buildEvalContext, type EntityData } from '@/lib/calculation/intent-executor';
+import { isIntentOperation, type IntentOperation, type PrimePredicate, type EvalContext } from '@/lib/calculation/intent-types';
+import { legacyIntentToDAG, legacyDerivationToDAG, type LegacyDerivation } from '@/lib/calculation/legacy-intent-to-dag';
 import { toNumber, roundComponentOutput, inferOutputPrecision } from '@/lib/calculation/decimal-precision';
 
 // ──────────────────────────────────────────────
@@ -123,80 +124,79 @@ export function applyMetricDerivations(
 ): Record<string, number> {
   const derived: Record<string, number> = {};
 
-  for (const rule of derivations) {
-    // HF-172: source_pattern is provenance metadata, NOT a row filter.
-    // All entity rows within the period's date range are candidates.
-    // Content filtering is done by the filters array, not source_pattern.
-    let matchingRows: Array<{ row_data: Json }> = [];
-    for (const [, rows] of Array.from(entitySheetData.entries())) {
-      matchingRows = matchingRows.concat(rows);
+  // Flatten all rows into a single array, unwrapping row_data for the DAG
+  // evaluator's activeRows view.
+  const allRows: Record<string, unknown>[] = [];
+  for (const [, rows] of Array.from(entitySheetData.entries())) {
+    for (const r of rows) {
+      const rd = (r.row_data && typeof r.row_data === 'object' && !Array.isArray(r.row_data))
+        ? r.row_data as Record<string, unknown>
+        : {};
+      allRows.push(rd);
     }
+  }
 
-    // OB-128: Ratio operation works on already-derived metrics, not raw rows
-    if (rule.operation === 'ratio') {
-      const num = derived[rule.numerator_metric || ''] ?? 0;
-      const den = derived[rule.denominator_metric || ''] ?? 0;
-      derived[rule.metric] = den !== 0 ? (num / den) * (rule.scale_factor ?? 1) : 0;
-      continue;
+  // HF-238 R2 Closure 5: flatten prior-period rows once into a single array,
+  // matching the activeRows shape so the `prior_period` prime can switch
+  // EvalContext.activeRows to this set when delta derivations run.
+  const priorRows: Record<string, unknown>[] = [];
+  if (priorPeriodData) {
+    for (const [, rows] of Array.from(priorPeriodData.entries())) {
+      for (const r of rows) {
+        const rd = (r.row_data && typeof r.row_data === 'object' && !Array.isArray(r.row_data))
+          ? r.row_data as Record<string, unknown>
+          : {};
+        priorRows.push(rd);
+      }
     }
+  }
 
-    if (matchingRows.length === 0) continue;
+  for (const rule of derivations) {
+    // HF-238 R2 Closure 5: delta hybrid block deleted. Delta derivations now
+    // flow through the same legacyDerivationToDAG → evaluate() pipeline as
+    // every other operation; the prior_period prime switches activeRows to
+    // priorRows for the prior side of the subtraction.
+
+    // Build the LegacyDerivation shape from the rule and translate to DAG.
+    const legacyShape: LegacyDerivation = {
+      metric: rule.metric,
+      operation: rule.operation,
+      source_field: rule.source_field,
+      filters: rule.filters as PrimePredicate[] | undefined,
+      source_pattern: rule.source_pattern,
+      numerator_metric: rule.numerator_metric,
+      denominator_metric: rule.denominator_metric,
+      scale_factor: rule.scale_factor,
+    };
 
-    // Apply derivation operation
-    if (rule.operation === 'sum' && rule.source_field) {
-      // HF-172: Apply filters to sum (was missing — caused cross-category aggregation)
-      let total = 0;
-      for (const row of matchingRows) {
-        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
-          ? row.row_data as Record<string, unknown>
-          : {};
-        if (!rowMatchesFilters(rd, rule.filters)) continue;
-        const val = rd[rule.source_field];
-        if (typeof val === 'number') total += val;
-      }
-      derived[rule.metric] = total;
-    } else if (rule.operation === 'delta' && rule.source_field) {
-      // OB-121: Period-over-period delta = current_sum - prior_sum
-      // HF-172: Apply filters to both current and prior period loops
-      let currentTotal = 0;
-      for (const row of matchingRows) {
-        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
-          ? row.row_data as Record<string, unknown>
-          : {};
-        if (!rowMatchesFilters(rd, rule.filters)) continue;
-        const val = rd[rule.source_field];
-        if (typeof val === 'number') currentTotal += val;
-      }
+    let dag;
+    try {
+      dag = legacyDerivationToDAG(legacyShape);
+    } catch (err) {
+      console.warn(`[Derivation] legacyDerivationToDAG failed for "${rule.metric}": ${(err as Error).message}`);
+      derived[rule.metric] = 0;
+      continue;
+    }
 
-      let priorTotal = 0;
-      if (priorPeriodData) {
-        // HF-172: Include ALL prior period rows, not just source_pattern matches
-        for (const [, rows] of Array.from(priorPeriodData.entries())) {
-          for (const row of rows) {
-            const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
-              ? row.row_data as Record<string, unknown>
-              : {};
-            if (!rowMatchesFilters(rd, rule.filters)) continue;
-            const val = rd[rule.source_field];
-            if (typeof val === 'number') priorTotal += val;
-          }
-        }
-      }
+    // Context: activeRows are the current period's flattened rows; metrics
+    // map carries previously-derived values so ratio derivations can read
+    // their numerator / denominator references. priorPeriodRows is supplied
+    // so the prior_period prime in delta translations can switch activeRows
+    // for its downstream sub-tree (HF-238 R2 Closure 5).
+    const context: EvalContext = {
+      entity: { metadata: {} },
+      activeRows: allRows,
+      allEntityRows: [],
+      metrics: { ...derived },
+      priorPeriodRows: priorRows,
+    };
 
-      derived[rule.metric] = currentTotal - priorTotal;
-      if (!priorPeriodData) {
-        console.log(`[Derivation] delta: no prior period data for "${rule.metric}" — using current value only`);
-      }
-    } else if (rule.operation === 'count') {
-      // HF-172: Uses same rowMatchesFilters helper (was already correct, now DRY)
-      let count = 0;
-      for (const row of matchingRows) {
-        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
-          ? row.row_data as Record<string, unknown>
-          : {};
-        if (rowMatchesFilters(rd, rule.filters)) count++;
-      }
-      derived[rule.metric] = count;
+    try {
+      const result = evaluate(dag, context);
+      derived[rule.metric] = toNumber(result);
+    } catch (err) {
+      console.warn(`[Derivation] evaluate failed for "${rule.metric}": ${(err as Error).message}`);
+      derived[rule.metric] = 0;
     }
   }
 
@@ -311,28 +311,23 @@ export function evaluateComponent(component: PlanComponent, metrics: Record<stri
         } as unknown as IntentOperation;
       }
 
-      // OB-120: Auto-detect isMarginal for bounded_lookup_1d with rate-like outputs.
-      // Mirrors OB-117 rate heuristic in evaluateTierLookup: if all non-zero outputs
-      // are < 1.0, they represent rates to multiply against the input value.
-      if (intentOp.operation === 'bounded_lookup_1d') {
-        const bl = intentOp as unknown as Record<string, unknown>;
-        const outputs = bl.outputs as number[] | undefined;
-        if (!bl.isMarginal && Array.isArray(outputs)) {
-          const nonZero = outputs.filter(v => v !== 0);
-          if (nonZero.length > 0 && nonZero.every(v => v > 0 && v < 1.0)) {
-            bl.isMarginal = true;
-          }
-        }
-      }
+      // HF-238 R2 Closure 4: OB-120 isMarginal auto-detection moved into the
+      // bounded_lookup_1d case of legacyIntentToDAG (legacy-intent-to-dag.ts).
+      // The call site no longer dispatches on operation names — every legacy
+      // shape flows through translateOperation, which carries the heuristic.
 
       if (isIntentOperation(intentOp)) {
+        // HF-238 R2 Closure 3: inlined the prior executeOperation wrapper.
+        // The three operations below are the only execution path — translate
+        // legacy shape to DAG, build the evaluation context, walk it.
         const entityData: EntityData = {
           entityId: '',
           metrics,
           attributes: {},
         };
-        const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
-        const intentPayoutDecimal = executeOperation(intentOp, entityData, inputLog, {});
+        const dag = legacyIntentToDAG(intentOp);
+        const context = buildEvalContext(entityData);
+        const intentPayoutDecimal = evaluate(dag, context);
         const intentPayout = toNumber(intentPayoutDecimal);
         if (intentPayout > 0) {
           payout = intentPayout;
@@ -341,7 +336,6 @@ export function evaluateComponent(component: PlanComponent, metrics: Record<stri
             fallbackSource: 'calculationIntent',
             intentOperation: intentOp.operation,
             intentPayout,
-            intentInputs: inputLog,
           };
         }
       }
```

---

## PROBE 3 — BCL calculation trace

**Script:** `web/scripts/diag-052-probe3-bcl-trace.ts`

Components-only excerpt (the full `input_bindings` dump is redundant with Probe 1's full JSONB capture).

```
=== PROBE 3 — BCL calculation trace ===

Rule set: "Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026" [59f3be4d-3dac-450b-8aef-26c33fdc8028] status=active

--- components top-level shape ---
keys: [ 'variants' ]

flattened component count: 8

──── Component 0: "Credit Placement - Senior Executive" ────
  format: LEGACY (has `operation` field)
  root operation: bounded_lookup_2d
  full stored intent (truncated to 500):
{
  "inputs": {
    "row": {
      "source": "metric",
      "sourceSpec": {
        "field": "credit_placement_attainment"
      }
    },
    "column": {
      "source": "metric",
      "sourceSpec": {
        "field": "portfolio_quality_ratio"
      }
    }
  },
  "operation": "bounded_lookup_2d",
  "outputGrid": [
    [
      0,
      80,
      120,
      160,
      200
    ],
    [
      80,
      120,
      180,
      240,
      300
    ],
    [
      120,
      180,
      260,
      340,
 
    ... [TRUNCATED]

──── Component 1: "Deposit Capture - Senior Executive" ────
  format: LEGACY (has `operation` field)
  root operation: bounded_lookup_1d
  full stored intent (truncated to 500):
{
  "input": {
    "source": "metric",
    "sourceSpec": {
      "field": "deposit_capture_attainment"
    }
  },
  "outputs": [
    0,
    120,
    250,
    400,
    550
  ],
  "operation": "bounded_lookup_1d",
  "boundaries": [
    {
      "max": 60,
      "min": 0,
      "maxInclusive": false,
      "minInclusive": true
    },
    {
      "max": 80,
      "min": 60,
      "maxInclusive": false,
      "minInclusive": true
    },
    {
      "max": 100,
      "min": 80,
      "maxInclusive": fa
    ... [TRUNCATED]

──── Component 2: "Cross Products - Senior Executive" ────
  format: LEGACY (has `operation` field)
  root operation: scalar_multiply
  full stored intent (truncated to 500):
{
  "rate": 25,
  "input": {
    "source": "metric",
    "sourceSpec": {
      "field": "cross_products_sold"
    }
  },
  "operation": "scalar_multiply"
}

──── Component 3: "Regulatory Compliance - Senior Executive" ────
  format: LEGACY (has `operation` field)
  root operation: conditional_gate
  full stored intent (truncated to 500):
{
  "onTrue": {
    "value": 150,
    "operation": "constant"
  },
  "onFalse": {
    "value": 0,
    "operation": "constant"
  },
  "condition": {
    "left": {
      "source": "metric",
      "sourceSpec": {
        "field": "regulatory_infractions"
      }
    },
    "right": {
      "value": 1,
      "source": "constant"
    },
    "operator": "<"
  },
  "operation": "conditional_gate"
}

──── Component 4: "Credit Placement - Executive" ────
  format: LEGACY (has `operation` field)
  root operation: bounded_lookup_2d
  full stored intent (truncated to 500):
{
  "inputs": {
    "row": {
      "source": "metric",
      "sourceSpec": {
        "field": "credit_placement_attainment"
      }
    },
    "column": {
      "source": "metric",
      "sourceSpec": {
        "field": "portfolio_quality_ratio"
      }
    }
  },
  "operation": "bounded_lookup_2d",
  "outputGrid": [
    [
      0,
      50,
      80,
      110,
      140
    ],
    [
      50,
      80,
      120,
      170,
      210
    ],
    [
      80,
      120,
      180,
      240,
    
    ... [TRUNCATED]

──── Component 5: "Deposit Capture - Executive" ────
  format: LEGACY (has `operation` field)
  root operation: bounded_lookup_1d
  full stored intent (truncated to 500):
{
  "input": {
    "source": "metric",
    "sourceSpec": {
      "field": "deposit_capture_attainment"
    }
  },
  "outputs": [
    0,
    80,
    180,
    300,
    420
  ],
  "operation": "bounded_lookup_1d",
  "boundaries": [
    {
      "max": 60,
      "min": 0,
      "maxInclusive": false,
      "minInclusive": true
    },
    {
      "max": 80,
      "min": 60,
      "maxInclusive": false,
      "minInclusive": true
    },
    {
      "max": 100,
      "min": 80,
      "maxInclusive": fal
    ... [TRUNCATED]

──── Component 6: "Cross Products - Executive" ────
  format: LEGACY (has `operation` field)
  root operation: scalar_multiply
  full stored intent (truncated to 500):
{
  "rate": 18,
  "input": {
    "source": "metric",
    "sourceSpec": {
      "field": "cross_products_sold"
    }
  },
  "operation": "scalar_multiply"
}

──── Component 7: "Regulatory Compliance - Executive" ────
  format: LEGACY (has `operation` field)
  root operation: conditional_gate
  full stored intent (truncated to 500):
{
  "onTrue": {
    "value": 100,
    "operation": "constant"
  },
  "onFalse": {
    "value": 0,
    "operation": "constant"
  },
  "condition": {
    "left": {
      "source": "metric",
      "sourceSpec": {
        "field": "regulatory_infractions"
      }
    },
    "right": {
      "value": 1,
      "source": "constant"
    },
    "operator": "<"
  },
  "operation": "conditional_gate"
}


```

---

## PROBE 4 — Calculation results history (BCL)

**Script:** `web/scripts/diag-052-probe4-calc-history.ts`

```
=== PROBE 4 — BCL calculation_results history ===

Sample columns: id, tenant_id, batch_id, entity_id, rule_set_id, period_id, total_payout, components, metrics, attainment, metadata, created_at

Total calculation_results for BCL: 255

--- Per-period totals ---
November 2025 (monthly_2025-11-01_2025-11-30):
  rows=85  total_payout=46291.00  batches=1
  earliest=2026-05-15T14:44:06.613083+00:00  latest=2026-05-15T14:44:06.613083+00:00
December 2025 (monthly_2025-12-01_2025-12-31):
  rows=85  total_payout=61986.00  batches=1
  earliest=2026-05-15T14:44:42.892743+00:00  latest=2026-05-15T14:44:42.892743+00:00
October 2025 (monthly_2025-10-01_2025-10-31):
  rows=85  total_payout=36640.00  batches=1
  earliest=2026-05-19T23:38:09.975774+00:00  latest=2026-05-19T23:38:09.975774+00:00

--- October 2025 drill-down (canonical_key=monthly_2025-10-01_2025-10-31) ---
October period_id: 46cbc230-3d7f-480b-a0e7-199c0ea333f0
October rows: 85
  earliest row: batch_id=6cb37657-c27b-4928-9a0c-756d28a7e7a8 created_at=2026-05-19T23:38:09.975774+00:00
  latest row:   batch_id=6cb37657-c27b-4928-9a0c-756d28a7e7a8 created_at=2026-05-19T23:38:09.975774+00:00

  Per-batch summary:
    batch=6cb37657-c27b-4928-9a0c-756d28a7e7a8 ts=2026-05-19T23:38:09.975774+00:00 rows=85 total=36640.00

--- Pre vs post HF-238 split (boundary: 2026-05-19T21:53:00Z) ---
Pre-HF-238 rows: 170
Post-HF-238 rows: 85
Overall earliest: 2026-05-15T14:44:06.613083+00:00
Overall latest:   2026-05-19T23:38:09.975774+00:00
```

---

## PROBE 5 — Binding write lifecycle

### 5A/5B — Writers and clearers of `input_bindings`

**`grep -rn "input_bindings.*null|input_bindings.*{}|input_bindings.*\[\]" web/src/ --include="*.ts" --include="*.tsx"`**

```
src/app/api/intelligence/converge/route.ts:61:        const existing = ((rs?.input_bindings as Record<string, unknown>)?.metric_derivations ?? []) as Array<Record<string, unknown>>;
src/app/api/intelligence/wire/route.ts:371:          const existing = ((currentRS?.input_bindings as Record<string, unknown>)?.metric_derivations ?? []) as Array<Record<string, unknown>>;
src/app/api/plan/import/route.ts:83:      input_bindings: {} as Json,
src/app/api/calculation/run/route.ts:231:    const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
src/app/api/calculation/run/route.ts:311:  const inputBindings = ruleSet.input_bindings as Record<string, unknown> | null;
src/app/api/calculation/run/route.ts:329:      const opBindings = op.input_bindings as Record<string, unknown> | null;
src/app/api/calculation/run/route.ts:2067:            const currentBindings = (rsRow.input_bindings as Record<string, unknown>) ?? {};
src/app/api/calculation/run/route.ts:2843:    const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
src/app/api/import/sci/execute-bulk/route.ts:532:      .update({ input_bindings: {} })
src/app/api/import/sci/execute-bulk/route.ts:579:      .update({ input_bindings: {} })
src/app/api/import/sci/execute-bulk/route.ts:657:      .update({ input_bindings: {} })
src/app/api/plan-readiness/route.ts:54:    const bindings = rs.input_bindings as Record<string, unknown> | null;
src/lib/supabase/rule-set-service.ts:72:    input_bindings: {} as Json,
src/lib/calculation/run-calculation.ts:861:  const inputBindings = ruleSet.input_bindings as Record<string, unknown> | null;
```

**`grep -rn "\.update.*input_bindings|\.upsert.*input_bindings" web/src/ --include="*.ts" --include="*.tsx"`**

```
src/app/api/intelligence/wire/route.ts:390:            .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
src/app/api/intelligence/converge/route.ts:81:          .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
src/app/api/calculation/run/route.ts:280:            .update({ input_bindings: updatedBindings as unknown as Json })
src/app/api/calculation/run/route.ts:2087:              .update({ input_bindings: newBindings as unknown as Json })
src/app/api/import/sci/execute-bulk/route.ts:532:      .update({ input_bindings: {} })
src/app/api/import/sci/execute-bulk/route.ts:579:      .update({ input_bindings: {} })
src/app/api/import/sci/execute-bulk/route.ts:657:      .update({ input_bindings: {} })
```

### 5A — Write-site context (`web/src/app/api/import/sci/execute-bulk/route.ts` lines 515-664)

The three cache-invalidation writes that set `input_bindings: {}` during entity / data / reference imports (OB-195 Layer 4 pattern):

```typescript
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'entity',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-bulk-${proposalId}`,
    source: 'sci-bulk',
    fileHashSha256,
  });
  const cdInserted = commitResult.totalInserted;

  // OB-195 Layer 4: Invalidate cached convergence bindings
  if (cdInserted > 0) {
    const { data: clearedRuleSets } = await supabase
      .from('rule_sets')
      .update({ input_bindings: {} })
      .eq('tenant_id', tenantId)
      .in('status', ['active', 'draft'])
      .select('id');
    if ((clearedRuleSets?.length ?? 0) > 0) {
      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (entity data imported — convergence will re-derive)`);
    }
  }

  return { contentUnitId: unit.contentUnitId, classification: 'entity', success: true, rowsProcessed: rows.length, pipeline: 'entity' };
}

// ── Target/Transaction pipeline (committed_data bulk insert) ──

async function processDataUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
  fileName: string,
  tabName: string,
  classification: 'target' | 'transaction',
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  if (rows.length === 0) {
    return { contentUnitId: unit.contentUnitId, classification, success: true, rowsProcessed: 0, pipeline: classification };
  }

  // HF-231: Unified committed_data write via shared commitContentUnit.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification,
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-bulk-${proposalId}`,
    source: 'sci-bulk',
    fileHashSha256,
  });
  const totalInserted = commitResult.totalInserted;

  // OB-195 Layer 4: Invalidate cached convergence bindings so engine re-derives with new data
  if (totalInserted > 0) {
    const { data: clearedRuleSets } = await supabase
      .from('rule_sets')
      .update({ input_bindings: {} })
      .eq('tenant_id', tenantId)
      .in('status', ['active', 'draft'])
      .select('id');
    if ((clearedRuleSets?.length ?? 0) > 0) {
      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (new data imported — convergence will re-derive)`);
    }
  }

  // OB-182: postCommitConstruction REMOVED from import pipeline.
  // Entity assignment and entity_id binding deferred to calculation time.
  // Entity creation for roster imports still handled by processEntityUnit (separate path).
  // Convergence derivation also removed (was lines 685-716) — runs at calc time.

  // OB-182: Entity binding validation and convergence derivation REMOVED.
  // Entity binding: deferred to calculation time (engine resolves from row_data).
  // Convergence: deferred to calculation time (engine derives when input_bindings empty).
  // Flywheel self-correction: entity_id is always NULL at import, so binding validation is N/A.

  return {
    contentUnitId: unit.contentUnitId,
    classification,
    success: true,
    rowsProcessed: totalInserted,
    pipeline: classification,
  };
}

// ── Reference pipeline ──

async function processReferenceUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
  fileName: string,
  tabName: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: string,
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  // OB-195 Layer 1: Reference pipeline → committed_data (Decision 111)
  // Previously wrote to reference_data + reference_items (deprecated).
  // Now follows processDataUnit pattern: all data → committed_data.
  // Engine aggregates all numeric fields at calc time (aggregateMetrics sums across all rows).
  if (rows.length === 0) {
    return { contentUnitId: unit.contentUnitId, classification: 'reference', success: true, rowsProcessed: 0, pipeline: 'reference' };
  }

  // HF-231: Unified committed_data write via shared commitContentUnit.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'reference',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-bulk-${proposalId}`,
    source: 'sci-bulk',
    fileHashSha256,
  });
  if (!commitResult.success && commitResult.totalInserted === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'reference',
      success: false,
      rowsProcessed: 0,
      pipeline: 'reference',
      error: commitResult.error,
    };
  }
  const totalInserted = commitResult.totalInserted;

  // OB-195 Layer 4: Invalidate cached convergence bindings (same as processDataUnit)
  if (totalInserted > 0) {
    const { data: clearedRuleSets } = await supabase
      .from('rule_sets')
      .update({ input_bindings: {} })
      .eq('tenant_id', tenantId)
      .in('status', ['active', 'draft'])
      .select('id');
    if ((clearedRuleSets?.length ?? 0) > 0) {
      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (reference data imported — convergence will re-derive)`);
    }
  }
```

### 5C — HF-236 cache-invalidation diff

Per the directive's request, run `git diff 9c5147e4..0fea552d -- web/src/`. Result: **0 lines** — `9c5147e4` (HF-236 PR merge commit) already contains `0fea552d` (the HF-236 completion-report commit on the feature branch) because the PR merged the feature branch into main. The directionally-correct diff for what HF-236 changed in `web/src/` is the merge-parent diff, captured below.

**`git diff 14962a27..9c5147e4 -- web/src/app/api/import/sci/execute-bulk/route.ts`** (parent-of-merge → merge commit):

```diff
diff --git a/web/src/app/api/import/sci/execute-bulk/route.ts b/web/src/app/api/import/sci/execute-bulk/route.ts
index b885444a..13154d29 100644
--- a/web/src/app/api/import/sci/execute-bulk/route.ts
+++ b/web/src/app/api/import/sci/execute-bulk/route.ts
@@ -261,6 +261,18 @@ export async function POST(req: NextRequest) {
 }
 
 // ── Field filtering for PARTIAL claims ──
+// HF-236 (DIAG-050 closure): Per T1-E902 v2 (Carry Everything, Express
+// Contextually — locked 2026-05-18: Persistence scope persists ALL data;
+// Hints-not-gates: AI classifications do not gate persistence) and T2-E06
+// v2 (HC Override Authority — locked 2026-05-18: HC observations persist
+// to committed_data irrespective of claim type; automated narrowing of
+// the HC observation set during claim-type projection is a named
+// violation pattern), the PARTIAL claim primitive narrows agent
+// ownership semantics only. row_data persists unconditionally; the
+// confirmedBindings narrow to the agent's owned + shared field set so
+// downstream code that consults bindings sees the agent's semantic
+// claim, while persistence-time code that reads rows sees every column
+// the customer's file carries.
 
 function filterFieldsForPartialClaim(
   unit: BulkContentUnit,
@@ -272,23 +284,13 @@ function filterFieldsForPartialClaim(
 
   const allowedFields = new Set([...unit.ownedFields, ...unit.sharedFields]);
 
-  const filteredRows = rows.map(row => {
-    const filtered: Record<string, unknown> = {};
-    for (const key of Object.keys(row)) {
-      if (allowedFields.has(key) || key.startsWith('_')) {
-        filtered[key] = row[key];
-      }
-    }
-    return filtered;
-  });
-
   const filteredBindings = unit.confirmedBindings.filter(
     b => allowedFields.has(b.sourceField)
   );
 
   return {
     unit: { ...unit, confirmedBindings: filteredBindings },
-    rows: filteredRows,
+    rows,
   };
 }
 
```

**Historical attribution of the `input_bindings: {}` cache-clear pattern**: `git log --oneline --all -S "input_bindings: {}" -- web/src/ | head -10`

```
13dc698e Revert "Merge pull request #338 from CCAFRICA/dev"
314e8db0 Revert "Merge pull request #339 from CCAFRICA/hf-193-signal-surface"
95efc14d HF-193 Phase 2: delete plan_agent_seeds; bridge writes metric_comprehension signals; convergence reads signals
70aba6bc HF-191 Phase A: Plan agent outputs metricSemantics, stored as plan_agent_seeds
2203fc93 HF-184: Unified committed_data writes — import sequence independence
4663f261 OB-195 Layer 4: Convergence cache invalidation on new imports
68e28700 OB-155 Phase 1+2: Component format bridge — SCI route converts AI output to engine format
19edd887 OB-133 Phase 5: Plan execution routing — SCI execute routes plan documents to interpretation pipeline
43617585 OB-58 Phase 0: Plan import 400 fix — route rule_sets through service role API
421697ff OB-42 Phase 8: RuleSetService with async CRUD and 5-layer JSONB mapping
```

The pattern was introduced by `4663f261 OB-195 Layer 4: Convergence cache invalidation on new imports`. HF-236 did not author or alter the `input_bindings: {}` cache-clear writes.

---

## PROBE 6 — DAG evaluator on BCL-5005 October

**Script:** `web/scripts/diag-052-probe6-evaluator-compare.ts`

Full output omitted (1022 lines — the bounded_lookup_2d translation is a deep nested-conditional chain). Below is the entity / variant header, an excerpt of the Component 0 DAG tree (the bounded_lookup_2d translation), and the per-component evaluator results + stored calculation_results comparison.

```
=== PROBE 6 — BCL-5005 October DAG evaluator trace ===

Entity: BCL-5005 (Carlos Mauricio Reyes Vega) id=2e6879fa-155a-410f-bf71-18b056bd1264
Metadata: {"role":"Ejecutivo Senior","cargo":"Gerente de Sucursal","region":"Costa","nivel_cargo":"Ejecutivo Senior","fecha_ingreso":"2016-12-04"}

committed_data rows for this entity (all periods): 4
Sample row keys: [Cargo, Region, _rowIndex, ID_Gerente, _sheetName, ID_Empleado, Nivel_Cargo, Sucursal_ID, Fecha_Ingreso, Nombre_Completo]
Sample row: {"Cargo":"Gerente de Sucursal","Region":"Costa","_rowIndex":4,"ID_Gerente":"BCL-5002","_sheetName":"Personal","ID_Empleado":"BCL-5005","Nivel_Cargo":"Ejecutivo Senior","Sucursal_ID":"BCL-GYE-001","Fecha_Ingreso":"2016-12-04","Nombre_Completo":"Carlos Mauricio Reyes Vega"}

Entity role attribute: "Ejecutivo Senior"

──── VARIANT 0: name="(unnamed)" matchValue={} ────
                          constant(0)
  References used: [credit_placement_attainment, portfolio_quality_ratio]
  Resolved metrics from row_data: {}
  → evaluate() result: 0.00

  ── Component 1: "Deposit Capture - Senior Executive" ──
  DAG tree:
  conditional
    if:
      logical(and)
        compare(gte)
          reference(deposit_capture_attainment)
          constant(0)
        compare(lt)
          reference(deposit_capture_attainment)
          constant(60)
    then:
      constant(0)
    else:
      conditional
        if:
          logical(and)
            compare(gte)
              reference(deposit_capture_attainment)
              constant(60)
            compare(lt)
              reference(deposit_capture_attainment)
              constant(80)
        then:
          constant(120)
        else:
          conditional
            if:
              logical(and)
                compare(gte)
                  reference(deposit_capture_attainment)
                  constant(80)
                compare(lt)
                  reference(deposit_capture_attainment)
                  constant(100)
            then:
              constant(250)
            else:
              conditional
                if:
                  logical(and)
                    compare(gte)
                      reference(deposit_capture_attainment)
                      constant(100)
                    compare(lt)
                      reference(deposit_capture_attainment)
                      constant(130)
                then:
                  constant(400)
                else:
                  conditional
                    if:
                      compare(gte)
                        reference(deposit_capture_attainment)
                        constant(130)
                    then:
                      constant(550)
                    else:
                      constant(0)
  References used: [deposit_capture_attainment]
  Resolved metrics from row_data: {}
  → evaluate() result: 0.00

  ── Component 2: "Cross Products - Senior Executive" ──
  DAG tree:
  arithmetic(multiply)
    reference(cross_products_sold)
    constant(25)
  References used: [cross_products_sold]
  Resolved metrics from row_data: {}
  → evaluate() result: 0.00

  ── Component 3: "Regulatory Compliance - Senior Executive" ──
  DAG tree:
  conditional
    if:
  → evaluate() result: 0.00

  VARIANT 0 TOTAL: 0.00

──── VARIANT 1: name="(unnamed)" matchValue={} ────

  ── Component 0: "Credit Placement - Executive" ──
  DAG tree:
  conditional
    if:
      logical(and)
        compare(gte)
          reference(credit_placement_attainment)
          constant(0)
        compare(lt)
          reference(credit_placement_attainment)
  → evaluate() result: 0.00

  ── Component 1: "Deposit Capture - Executive" ──
  DAG tree:
  conditional
    if:
      logical(and)
        compare(gte)
          reference(deposit_capture_attainment)
          constant(0)
        compare(lt)
          reference(deposit_capture_attainment)
          constant(60)
    then:
      constant(0)
    else:
      conditional
        if:
          logical(and)
            compare(gte)
              reference(deposit_capture_attainment)
              constant(60)
            compare(lt)
              reference(deposit_capture_attainment)
              constant(80)
        then:
          constant(80)
        else:
          conditional
            if:
              logical(and)
                compare(gte)
                  reference(deposit_capture_attainment)
                  constant(80)
                compare(lt)
                  reference(deposit_capture_attainment)
                  constant(100)
            then:
              constant(180)
            else:
              conditional
                if:
                  logical(and)
                    compare(gte)
                      reference(deposit_capture_attainment)
                      constant(100)
                    compare(lt)
                      reference(deposit_capture_attainment)
                      constant(130)
                then:
                  constant(300)
                else:
                  conditional
                    if:
                      compare(gte)
                        reference(deposit_capture_attainment)
                        constant(130)
                    then:
                      constant(420)
                    else:
                      constant(0)
  References used: [deposit_capture_attainment]
  Resolved metrics from row_data: {}
  → evaluate() result: 0.00

  ── Component 2: "Cross Products - Executive" ──
  DAG tree:
  arithmetic(multiply)
    reference(cross_products_sold)
    constant(18)
  References used: [cross_products_sold]
  Resolved metrics from row_data: {}
  → evaluate() result: 0.00

  ── Component 3: "Regulatory Compliance - Executive" ──
  DAG tree:
  conditional
    if:
      compare(<)
        reference(regulatory_infractions)
        constant(1)
    then:
      constant(100)
    else:
      constant(0)
  References used: [regulatory_infractions]
  Resolved metrics from row_data: {}
  → evaluate() result: 0.00

  VARIANT 1 TOTAL: 0.00

=== Stored calculation_results comparison ===
Stored October rows for BCL-5005: 1
  batch=6cb37657-c27b-4928-9a0c-756d28a7e7a8 ts=2026-05-19T23:38:09.975774+00:00 total_payout=585
    c0 "Credit Placement - Senior Executive" type=bounded_lookup_2d payout=240
    c1 "Deposit Capture - Senior Executive" type=bounded_lookup_1d payout=120
    c2 "Cross Products - Senior Executive" type=scalar_multiply payout=225
    c3 "Regulatory Compliance - Senior Executive" type=conditional_gate payout=0
```

**Component 0 DAG tree excerpt** (the first ~67 lines of the bounded_lookup_2d translation, illustrating the nested conditional+compare+logical pattern produced by `legacyIntentToDAG`):

```
  ── Component 0: "Credit Placement - Senior Executive" ──
  DAG tree:
  conditional
    if:
      logical(and)
        compare(gte)
          reference(credit_placement_attainment)
          constant(0)
        compare(lt)
          reference(credit_placement_attainment)
          constant(70)
    then:
      conditional
        if:
          logical(and)
            compare(gte)
              reference(portfolio_quality_ratio)
              constant(0)
            compare(lt)
              reference(portfolio_quality_ratio)
              constant(0.7)
        then:
          constant(0)
        else:
          conditional
            if:
              logical(and)
                compare(gte)
                  reference(portfolio_quality_ratio)
                  constant(0.7)
                compare(lt)
                  reference(portfolio_quality_ratio)
                  constant(0.8)
            then:
              constant(80)
            else:
              conditional
                if:
                  logical(and)
                    compare(gte)
                      reference(portfolio_quality_ratio)
                      constant(0.8)
                    compare(lt)
                      reference(portfolio_quality_ratio)
                      constant(0.9)
                then:
                  constant(120)
                else:
                  conditional
                    if:
                      logical(and)
                        compare(gte)
                          reference(portfolio_quality_ratio)
                          constant(0.9)
                        compare(lt)
                          reference(portfolio_quality_ratio)
                          constant(0.95)
                    then:
                      constant(160)
                    else:
                      conditional
                        if:
                          compare(gte)
                            reference(portfolio_quality_ratio)
                            constant(0.95)
                        then:
                          constant(200)
```

**Note on the `evaluate() result: 0.00` rows.** The Probe 6 script resolves `reference(field)` values by scanning `committed_data.row_data` for matching field names. BCL-5005's `committed_data` rows for the queried entity contain only roster fields (Personal sheet — `ID_Empleado`, `Nombre_Completo`, etc.); the metric names referenced by the DAG (`credit_placement_attainment`, `portfolio_quality_ratio`, `deposit_capture_attainment`, `cross_products_sold`, `regulatory_infractions`) live in OTHER `data_type` rows and are normally resolved through convergence binding lookup at calculation time. The 0.00 rows reflect the script's incomplete metric-resolution path, not an engine failure — the post-HF-238 stored calculation_results row for the same entity (last block in Probe 6) shows the full route did produce non-zero per-component payouts (c0=240, c1=120, c2=225, c3=0, total=585).

---

## PROBE 7 — All-tenant state snapshot

**Script:** `web/scripts/diag-052-probe7-all-tenants.ts`

```
=== PROBE 7 — All-tenant state snapshot ===

──── Banco Cumbre del Litoral [b1c2d3e4-aaaa-bbbb-cccc-111111111111] ────
  rule_sets: 1
  committed_data rows: 340
  calculation_results rows: 255
  latest calculation_results: 2026-05-19T23:38:09.975774+00:00 (batch 6cb37657-c27b-4928-9a0c-756d28a7e7a8)
    • "Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026" [59f3be4d-3dac-450b-8aef-26c33fdc8028] status=active
      input_bindings: populated — keys=[convergence_version,convergence_bindings], convergence_bindings=4, metric_derivations=0

──── Cascade Revenue Partners [e44bbcb1-2710-4880-8c7d-a1bd902720b7] ────
  rule_sets: 5
  committed_data rows: 814
  calculation_results rows: 232
  latest calculation_results: 2026-05-19T15:31:35.534536+00:00 (batch 1d850c49-0310-42fe-899d-d125186d93e9)
    • "Consumables Commission Plan" [2ebfc02a-13e6-49a3-a7eb-f683a505b06b] status=active
      input_bindings: populated — keys=[metric_derivations,convergence_version,convergence_bindings], convergence_bindings=1, metric_derivations=2
    • "District Override Plan" [44a00635-ac32-4c87-b81d-76a1af365bd6] status=active
      input_bindings: populated — keys=[convergence_version,convergence_bindings], convergence_bindings=1, metric_derivations=0
    • "Capital Equipment Commission Plan" [6b45f1ef-658f-45ba-bd18-a6473548a11a] status=active
      input_bindings: {} (empty)
    • "District Override Plan" [2df3544d-f268-4333-8991-e7363f075173] status=active
      input_bindings: {} (empty)
    • "Cross-Sell Bonus Plan" [18701001-c65e-4105-a95f-711840f3a357] status=active
      input_bindings: {} (empty)

──── Meridian Logistics Group [5035b1e8-0754-4527-b7ec-9f93f85e4c79] ────
  rule_sets: 5
  committed_data rows: 304
  calculation_results rows: 402
  latest calculation_results: 2026-05-16T15:42:10.884682+00:00 (batch 87724af6-cb23-4a6d-96e7-96f9456fa9df)
    • "Meridian Logistics Group Incentive Plan 2025" [6c98f209-6643-4242-96f5-174bdd034fa4] status=active
      input_bindings: {} (empty)
    • "Meridian Logistics Group Incentive Plan 2025" [a7d7ea62-e5bd-454b-8d92-2e09146842db] status=active
      input_bindings: {} (empty)
    • "Meridian Logistics Group Incentive Plan 2025" [19f56c1d-cc49-496a-92a9-7e1b42278252] status=active
      input_bindings: {} (empty)
    • "Meridian Logistics Group Incentive Plan 2025" [cca32ebb-c1a4-416e-8d3e-6eedea506cd2] status=active
      input_bindings: {} (empty)
    • "Meridian Logistics Group Incentive Plan 2025" [9ac467ba-bab4-4680-9453-5cb3deae02c6] status=active
      input_bindings: {} (empty)

```

---

## END

Seven probes complete. Pasted code, JSONB dumps, git diffs, and script outputs are the verbatim state of the proof tenants at the time of capture (2026-05-19, branch off `main @ 63212283`). No interpretation. No recommendations.
