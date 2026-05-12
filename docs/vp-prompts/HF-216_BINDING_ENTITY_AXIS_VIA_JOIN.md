# HF-216: Binding entity-axis via-join — `convergence_bindings.entity_identifier.via` clause

**Sequence:** HF-216
**Defect anchor:** DIAG-039 (Meridian Logistics, c4 Fleet Utilization, Norma Rodríguez Rivera × January 2025)
**Decision candidate:** Decision 158 — binding-axis via shape
**Predecessors:** HF-196 (Phase 1G structural-arm OR-fold closure, PR #359, SHA `73d52791`, BCL $312,033 EXACT)
**Discipline:** Vertical Slice — schema + ingestion + resolver, single PR

---

## Architect-channel framing (read before CC dispatch)

**Defect class:** Schema-gap, not code-defect. `input_bindings.convergence_bindings.{component}.entity_identifier` admits only single-column entity axes. Meridian's Fleet Utilization component requires a two-stage join (employee → roster's `Hub_Asignado` → Hub-keyed measure column). Convergence picked the best single column available (`Hub`), engine resolved it correctly given the schema, the answer is wrong because the schema cannot express the join the plan needs.

**Not a regression of HF-196.** HF-196 Phase 1G fixed the structural-arm OR-fold that mis-assigned `structuralType` to numeric measure columns. That defect is closed and verified (BCL $312,033 exact). DIAG-039's c4 = $2 comes from a different structural class — the convergence layer cannot express a join-axis, so the engine's correct execution of an under-specified binding produces the wrong answer.

**Not a cap-modifier defect.** The cap modifier is dormant in current data. Once the join resolves correctly (Norma's hub Mérida produces 1044/1370 = 0.762), `0.762 × 800 = 609.6`, cap at 1.5 doesn't fire, rounds to 610. Cap-slot semantics may warrant later examination; not in HF-216 scope.

**Korean Test:** No language-specific literals introduced. `via` clause is structural — names a roster data_type and field. Works for any tenant where an employee-axis plan consumes a non-employee-axis measure.

**Reconciliation channel:** Verification targets ($610 for Norma January c4; $185,063 grand total) operate architect-channel only. CC directive scrubbed of target values. CC reports calculated values verbatim; produces no reconciliation interpretation.

---

## Standing rules (read first, every CC turn)

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Specifically:

- **SR-34:** No bypass; structural fixes only
- **SR-39:** Compliance verification gate (no auth/access surfaces touched here; SR-39 satisfied by exclusion)
- **SR-41:** Revert via `git revert <SHA>` on pushed contamination, not force-push
- **SR-42:** Locked-rule halt — surface rule verbatim, name dictated action, halt for architect
- Architecture Decision Gate before implementation
- Anti-Pattern Registry checked every build
- Commit + push after every change
- Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 → only then completion report
- Git from repo root (`spm-platform/`), NOT `web/`
- Final step: `gh pr create --base main --head dev` with descriptive title + body
- 8-category file prefix: `HF-216` for all new artifacts
- `.in()` batch ≤ 200
- Production verification mandatory: every HF ends with post-merge verification; localhost ≠ production

---

## Defect anchor (verbatim, DIAG-039 reference)

**Subject:** Meridian Logistics Group (tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79`), rule_set `939cf576-4096-4ceb-a142-539a486868b3`, entity `007da35a-8e65-453b-ada9-b62337fd8683` (Norma Rodríguez Rivera, external_id 70209), period `3c2557f4-d922-4b30-a073-ac4811f1f3cb` (January 2025).

**Empirical anchor (verbatim from DIAG-039 E3.4a `calculation_results.id = a159f155-...`):**

- `components[4].payout = 2`
- `intentTraces[4].inputs.hub_total_loads.rawValue = 116`
- `intentTraces[4].inputs.hub_total_capacity.rawValue = 116`
- `modifiers = [{ before: 800, after: 1.5, modifier: 'cap' }]`
- `metrics.Cargas_Flota_Hub = 1044` (committed_data row's actual value)
- `metrics.Capacidad_Flota_Hub = 1370` (committed_data row's actual value)
- `metadata.intentMatch = false`, `intentTotal = 1402`, `legacyTotal = 2200`

**Committed data row 4 verbatim (DIAG-039 E3.1, id `34bd82fa-1276-47bb-a6b7-47d0f004eea2`):**

- `data_type = "transaction"`
- `Hub = "Mérida Hub"`
- `Cargas_Flota_Hub = 1044`
- `Capacidad_Flota_Hub = 1370`
- `Tasa_Utilizacion_Hub = 0.762`
- `Tipo_Coordinador = "Coordinador Senior"`
- `No_Empleado = "70209"`

**Entity master row verbatim (DIAG-039 E3.1 row 3, id `e30dd7cb-4eff-4344-95f4-549aa43db413`):**

- `data_type = "entity"`
- `No_Empleado = "70209"`
- `Hub_Asignado = "Mérida Hub"`
- `Tipo_Coordinador = "Coordinador Senior"`

**Convergence binding verbatim (DIAG-039 E3.3):**

```json
"component_4": {
  "numerator":   { "column": "Cargas_Flota_Hub", ... },
  "denominator": { "column": "Capacidad_Flota_Hub", ... },
  "entity_identifier": {
    "column": "Hub",
    "field_identity": {
      "structuralType": "identifier",
      "contextualIdentity": "person_identifier"
    }
  }
}
```

(`contextualIdentity: "person_identifier"` on the Hub column is mis-tagged per DS-009 precedent — Hub should be `location_code`. Separate defect, NOT in HF-216 scope. The via-clause makes this mis-tag harmless for resolution.)

---

## Structural diagnosis (architect-disposed; CC does not re-diagnose)

The convergence binding declares `entity_identifier.column = "Hub"` for component_4 (and components 0–3). The `dataByBatch` cache in `web/src/app/api/calculation/run/route.ts` (DIAG-039 E1.2.c lines 778–825) indexes committed_data rows by `row_data[entity_identifier.column]` — keying every row by its Hub name value ("Mérida Hub", "Guadalajara Hub", …).

At calc time, `resolveColumnFromBatch(batchId, column, entityExternalId="70209")` is called with the employee's external_id. The cache has no key `"70209"` because the cache is keyed by Hub names. DIAG-003 fallback searches all batches for `"70209"` — also not present. Function returns `null`.

`resolveMetricsFromConvergenceBindings` returns `null`. Engine falls through to `buildMetricsForComponent` + `applyMetricDerivations`. The latter applies `operation: "count"` rules and produces 116 for both `hub_total_loads` and `hub_total_capacity` (count of Norma's rows passing the `Tipo_Coordinador` filter). Ratio = 1. `1 × 800 = 800`. Cap at 1.5 fires. Rounds to 2.

The schema gap: `entity_identifier` admits one column. Meridian's plan needs `employee.No_Empleado → roster.Hub_Asignado → transaction.Hub → measure column`. The binding can only express the final hop.

---

## Fix shape — Decision 158 candidate: `via` clause on `entity_identifier`

Extend `convergence_bindings.{component_N}.entity_identifier` JSONB shape with an optional `via` field expressing a single-stage join:

```jsonc
"entity_identifier": {
  "column": "Hub",                     // measure-batch column to match against
  "field_identity": { ... },
  "source_batch_id": "...",
  "via": {                             // NEW (optional)
    "roster_data_type": "entity",      // committed_data.data_type of roster batch
    "roster_field": "Hub_Asignado",    // field in roster row_data carrying join value
    "entity_field": "No_Empleado"      // field in roster row_data carrying employee external_id
  }
}
```

**Semantic:** "To resolve the entity identity for this measure binding, look up the entity's external_id (`entity_field`) in roster rows (`roster_data_type`), read the value of `roster_field`, and use that value to match `column` in the measure batch."

**Backward compatibility:** When `via` is absent, behavior is unchanged. Existing bindings (BCL, CRP) continue to work. Only bindings that declare `via` exercise the join.

---

## Phases

### Phase 0 — Pre-implementation reads (mandatory)

CC reads, in order, before writing any code:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — full
2. `SCHEMA_REFERENCE_LIVE.md` — confirm `rule_sets.input_bindings` is JSONB, `committed_data.row_data` is JSONB, `committed_data.data_type` is text
3. `web/src/app/api/calculation/run/route.ts` — lines 778–825 (`dataByBatch` indexing) and lines 1361–1500 (`resolveMetricsFromConvergenceBindings` + `resolveColumnFromBatch`)
4. DIAG-039 `E2_4_c4_full_declaration.md` for c4 binding shape
5. DIAG-039 `E3_1_committed_data.md` for entity master row shape (`Hub_Asignado` field present)

**CC reports back:** "Phase 0 reads complete. Confirmed: `input_bindings` is JSONB. `route.ts:778` builds `entityColsByBatch` from convergence_bindings. `route.ts:1361` is `resolveMetricsFromConvergenceBindings`. Roster row carries `Hub_Asignado` and `No_Empleado` in row_data."

If any read produces a different state than declared above, **HALT** and surface to architect. Do not proceed.

### Phase 1 — Type definition

**File:** `web/src/types/convergence-bindings.ts` (create if absent; else extend existing type)

Add the optional `via` field to the `ConvergenceBindingEntry` type:

```typescript
export interface ConvergenceBindingEntry {
  source_batch_id: string;
  column: string;
  field_identity?: { structuralType?: string; contextualIdentity?: string };
  match_pass?: number;
  confidence?: number;
  scale_factor?: number;
  // HF-216: Optional via-join for entity-axis bridging across data_types.
  // When present on entity_identifier binding, the resolver performs a
  // two-stage lookup: entity external_id → roster_field value → measure column.
  via?: {
    roster_data_type: string;
    roster_field: string;
    entity_field: string;
  };
}
```

**Commit message:** `HF-216 Phase 1: ConvergenceBindingEntry.via type definition`

### Phase 2 — Resolver: build roster join index

**File:** `web/src/app/api/calculation/run/route.ts`

Before the entity loop (after `dataByBatch` is built, before `// ── 6. Evaluate each entity ──`), construct a per-tenant roster-join index:

```typescript
// HF-216: Build roster join index for entity_identifier.via bindings.
// Indexes: "data_type|entity_field|roster_field" → Map<entity_external_id, roster_field_value>
const rosterJoinIndex = new Map<string, Map<string, string>>();
if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
  const viaSpecs = new Set<string>();
  for (const compBindings of Object.values(convergenceBindings)) {
    const cb = compBindings as Record<string, ConvergenceBindingEntry>;
    const eid = cb.entity_identifier;
    if (eid?.via?.roster_data_type && eid.via.roster_field && eid.via.entity_field) {
      viaSpecs.add(`${eid.via.roster_data_type}|${eid.via.entity_field}|${eid.via.roster_field}`);
    }
  }

  for (const spec of viaSpecs) {
    const [rosterDataType, entityField, rosterField] = spec.split('|');
    const map = new Map<string, string>();
    for (const row of committedData) {
      if (row.data_type !== rosterDataType) continue;
      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      const entityVal = rd[entityField];
      const rosterVal = rd[rosterField];
      if (entityVal != null && rosterVal != null) {
        map.set(String(entityVal).trim(), String(rosterVal).trim());
      }
    }
    rosterJoinIndex.set(`${rosterDataType}|${entityField}|${rosterField}`, map);
  }

  addLog(`HF-216 Roster join index: ${rosterJoinIndex.size} via-specs indexed`);
}
```

**Commit message:** `HF-216 Phase 2: roster join index pre-computation`

### Phase 3 — Resolver: consume `via` in `resolveMetricsFromConvergenceBindings`

**File:** `web/src/app/api/calculation/run/route.ts`

Modify `resolveMetricsFromConvergenceBindings` to compute the effective lookup key once per call, using the binding's `entity_identifier.via` if present:

```typescript
// Inside resolveMetricsFromConvergenceBindings, before any resolveColumnFromBatch call:
// HF-216: If entity_identifier carries a via-clause, translate entityExternalId
// through the roster-join index to produce the lookup key against the measure batch.
const eidBinding = compBindings.entity_identifier as ConvergenceBindingEntry | undefined;
let lookupKey = entityExternalId;
if (eidBinding?.via?.roster_data_type && eidBinding.via.roster_field && eidBinding.via.entity_field) {
  const viaKey = `${eidBinding.via.roster_data_type}|${eidBinding.via.entity_field}|${eidBinding.via.roster_field}`;
  const map = rosterJoinIndex.get(viaKey);
  const translated = map?.get(String(entityExternalId).trim());
  if (translated) {
    lookupKey = translated;
    if (shouldEmitTrace(entityExternalId)) {
      bufferTrace(`[CalcTrace] HF-216 via-join translated entity=${entityExternalId} | viaKey=${viaKey} | translatedLookupKey=${translated}`);
    }
  } else {
    // Via declared but no roster mapping — surface as exception, return null
    addLog(`[CalcRecon-T3] EXCEPTION entity=${entityExternalId} type=via_join_unresolved viaKey=${viaKey}`);
    currentEntityFlags.push('viaJoinUnresolved');
    return null;
  }
}
```

Then pass `lookupKey` (instead of `entityExternalId`) to every `resolveColumnFromBatch` call within `resolveMetricsFromConvergenceBindings`.

The existing `dataByBatch` indexing in route.ts lines 778–825 already indexes by `entity_identifier.column` — for via bindings this is the measure-side join target (`Hub`), which is exactly what `lookupKey` will hold post-translation. **No change to `dataByBatch` indexing is required.**

**Commit message:** `HF-216 Phase 3: via-join lookup translation in resolveMetricsFromConvergenceBindings`

### Phase 4 — Backfill Meridian binding (data-only; no code change)

For Meridian's existing rule_set (`939cf576-4096-4ceb-a142-539a486868b3`), components 0–4 all declare `entity_identifier.column = "Hub"`. Per DIAG-039 E2.4 + E3.3, every component needs the `via` clause because the plan's entity is the employee but the measure columns are Hub-keyed in transaction data.

CC produces a one-time backfill script: `scripts/HF-216_backfill_meridian_via.ts`

```typescript
// HF-216 backfill: add via-clause to Meridian convergence_bindings.entity_identifier
// One-time migration; not a generalized framework.
// CC executes via tsx-script per VP capability routing.

import { createClient } from '@supabase/supabase-js';

const TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const RULE_SET_ID = '939cf576-4096-4ceb-a142-539a486868b3';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: rs, error } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', RULE_SET_ID)
    .single();
  if (error || !rs) throw new Error(`fetch failed: ${error?.message}`);

  const bindings = rs.input_bindings as Record<string, unknown>;
  const cb = bindings.convergence_bindings as Record<string, Record<string, unknown>>;

  const viaShape = {
    roster_data_type: 'entity',
    roster_field: 'Hub_Asignado',
    entity_field: 'No_Empleado',
  };

  for (const compKey of Object.keys(cb)) {
    const eid = cb[compKey].entity_identifier as Record<string, unknown> | undefined;
    if (eid && eid.column === 'Hub') {
      eid.via = viaShape;
      console.log(`Updated ${compKey}.entity_identifier with via clause`);
    }
  }

  const { error: updErr } = await supabase
    .from('rule_sets')
    .update({ input_bindings: bindings })
    .eq('id', RULE_SET_ID);
  if (updErr) throw new Error(`update failed: ${updErr.message}`);

  // Verify
  const { data: verify } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', RULE_SET_ID)
    .single();
  const verifyCb = (verify?.input_bindings as Record<string, unknown>)?.convergence_bindings as Record<string, Record<string, unknown>>;
  for (const compKey of Object.keys(verifyCb)) {
    const eid = verifyCb[compKey].entity_identifier as Record<string, unknown>;
    console.log(`VERIFY ${compKey}.entity_identifier.via:`, JSON.stringify(eid?.via));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

**CC runs via:** `cd web && npx tsx scripts/HF-216_backfill_meridian_via.ts`

CC pastes complete stdout including the VERIFY block. Architect reads the VERIFY block to confirm all 5 components carry the via clause.

**Commit message:** `HF-216 Phase 4: Meridian convergence_bindings backfill script + execution evidence`

### Phase 5 — Build + browser verification

1. From `spm-platform/` (repo root, **NOT** `web/`): `pkill -f "next dev" || true && rm -rf web/.next && cd web && npm run build && npm run dev`
2. Confirm `localhost:3000` returns 200 OK before continuing
3. CC pastes the build output (last 30 lines) and a curl probe of `http://localhost:3000` showing HTTP 200

### Phase 6 — Localhost calculation re-run

CC produces a tsx-script that POSTs to `/api/calculation/run` for Meridian × January 2025:

- tenant: `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
- ruleSet: `939cf576-4096-4ceb-a142-539a486868b3`
- period: `3c2557f4-d922-4b30-a073-ac4811f1f3cb`

After the POST returns, CC reads the resulting `calculation_results` row for entity `007da35a-8e65-453b-ada9-b62337fd8683` and pastes verbatim:

- `total_payout`
- All 5 entries of `components[].payout`
- `metadata.intentTraces[4].inputs.hub_total_loads.rawValue`
- `metadata.intentTraces[4].inputs.hub_total_capacity.rawValue`
- `metadata.intentTraces[4].modifiers`
- `metadata.intentTraces[4].finalOutcome`
- `metadata.intentMatch`
- `metadata.intentTotal`
- `metadata.legacyTotal`

**CC does not interpret these values.** CC does not state PASS or FAIL. CC pastes verbatim and halts for architect reconciliation.

**Commit message:** `HF-216 Phase 6: localhost calc re-run evidence`

### Phase 7 — PR creation + architect production sign-off

From repo root:

```bash
gh pr create --base main --head dev \
  --title "HF-216: convergence_bindings entity_identifier via-join clause" \
  --body "$(cat docs/hotfixes/HF-216_DESCRIPTION.md)"
```

CC produces `docs/hotfixes/HF-216_DESCRIPTION.md` containing:

- Defect anchor (verbatim from this directive, §"Defect anchor")
- Phase summaries (1 paragraph each)
- File diff inventory
- Phase 6 verbatim evidence
- "Architect verifies in production after merge per SR-44"

**CC does NOT merge. CC does NOT verify production.** Both are architect-only per capability routing.

---

## Halt conditions (CC must halt and surface verbatim)

- Any read in Phase 0 returns a state different from this directive's declarations
- Any code path discovered during implementation that requires touching `evaluateComponent`, `executeIntent`, `executeRatioOp`, or any intent-executor primitive
- Any code path discovered that requires modifying `applyMetricDerivations` or `metric_derivations` shape
- Any test failure during `npm run build`
- `localhost:3000` does not return 200 OK
- Phase 4 verify block does not show `via` clause on all 5 components
- Phase 6 calculation POST returns non-200 status
- Phase 6 produces `total_payout = 0` or throws an exception

**On halt:** paste the exact failure output, name the rule or directive constraint dictating halt, halt for architect disposition. Do not retry, do not modify scope, do not invent alternate paths.

---

## What HF-216 explicitly does NOT do

- Does NOT modify the intent-executor or any execution primitive
- Does NOT modify `applyMetricDerivations` or the `metric_derivations` shape
- Does NOT modify cap-modifier semantics
- Does NOT modify HC prompts or field-identity classification
- Does NOT modify `contextualIdentity = "person_identifier"` mis-tagging on the Hub column (separate defect, deferred candidate)
- Does NOT modify convergence-agent binding generation (the agent will need to learn to emit `via` clauses for future tenants — separate work, deferred)
- Does NOT add a signal-on-substitution at engine handoff (HF-205 invariant improvement — deferred candidate)
- Does NOT touch BCL or CRP — both reconciled exact; their bindings have no `via` and behavior unchanged
- Does NOT verify production. Architect verifies post-merge per SR-44.

---

## Completion report requirements

CC's completion report MUST include:

1. **Pasted git log** showing all HF-216 commits on dev branch
2. **Pasted file diffs** for `web/src/types/convergence-bindings.ts` (or wherever `ConvergenceBindingEntry` lives), `web/src/app/api/calculation/run/route.ts`, `scripts/HF-216_backfill_meridian_via.ts`, `docs/hotfixes/HF-216_DESCRIPTION.md`
3. **Pasted build output** (`npm run build` final lines)
4. **Pasted curl probe** of `localhost:3000` showing HTTP 200
5. **Pasted Phase 4 backfill stdout** including VERIFY block
6. **Pasted Phase 6 calculation-result fields** (verbatim, no interpretation)
7. **PR number** from `gh pr create` output
8. **No PASS/FAIL self-attestation.** No "calculation matches expected." No reconciliation language. Architect reconciles from pasted evidence.

Per SR-44: production verification is architect-only. CC reports localhost evidence; architect verifies production after merge.

---

## File inventory

**Files CC creates this HF:**

- `web/src/types/convergence-bindings.ts` (or edit existing if already exists)
- `scripts/HF-216_backfill_meridian_via.ts`
- `docs/hotfixes/HF-216_DESCRIPTION.md`

**Files CC modifies this HF:**

- `web/src/app/api/calculation/run/route.ts` (Phase 2 + Phase 3)

That is the complete file inventory. Any additional file change requires architect disposition.

---

## Architect notes (not in CC dispatch)

- The `via` clause shape is intentionally minimal — three string fields, all required when via is present. No nested via, no multi-hop. Multi-hop is a future extension when a tenant produces it; YAGNI now.
- Phase 4 backfill is one-time data migration for the Meridian rule_set. The convergence-agent learning to emit `via` for future tenants is Decision 153 plan-intelligence-forward work, **NOT** in HF-216. After HF-216 lands, the agent still won't emit `via` on its own — that's the next substrate step.
- Phase 6 emits raw values for architect reconciliation. Ground truth: c4 should resolve `1044/1370 × 800 = 609.6 → 610`, total_payout should land near $2,210 for Norma January. Architect verifies; CC stays out.
- HF-217 reserved. Likely candidates: convergence-agent emit-via, or `contextualIdentity` mis-tagging closure, or signal-on-substitution at engine handoff. Disposition after HF-216 lands and reconciles.
- Decision 158 candidate: `convergence_bindings.entity_identifier.via` shape. Lock after HF-216 lands and reconciles.

---

**End of HF-216 directive.**
