# OB258 P0 Discovery — Quota Allocation Canvas & Quota Intelligence

*Phase P0 (Discovery & Grounding) of `docs/vp-prompts/OB258_QUOTA_ALLOCATION_INTELLIGENCE_DIRECTIVE_20260701.md`.*

- **Date:** 2026-07-02
- **Branch:** `ob-258` (created off `hf-373` at `a813209d` — a strict superset of `main` at `fe9281de`; merge-base(main, hf-373) == main HEAD, so this tree is main + the 11 open HF-373 PR #658 commits)
- **HEAD SHA at discovery:** `a813209d`
- **Method:** six parallel read-only discovery streams (P0.1–P0.6), each grounded in pasted source excerpts plus FP-49 live service-role probes. **No product code changed.** Probe scripts left on disk for audit (SELECT-only):
  - `web/scripts/_ob258_p01_target_probe.ts`
  - `web/scripts/_ob258_p02_graph_probe.ts`
  - `web/scripts/_ob258_p03_attainment_probe.ts`
  - `web/scripts/_ob258_p04_caps_probe.ts`
  - `web/scripts/_ob258_p05_modules_probe.ts`
  - `web/scripts/_ob258_p06_msp_probe.ts`
- **Proof tenant id (live-verified):** VLTEST2 = `5b078b52-55c9-4612-8f86-96038c198bfe`
- **Reconciliation-channel separation honored:** this report states calculated/observed values verbatim; no reconciliation interpretation.

---
## P0.1 — Target data path

### 1. How target (quota) data ENTERS the platform (Decision 92 Target SCI)

**1a. The `'target'` class is declared in the SCI type system and the canonical data_type resolver.**

`/Users/AndrewAfrica/spm-platform/web/src/lib/sci/data-type-resolver.ts:15-46`
```ts
export type SemanticDataType = 'entity' | 'transaction' | 'target' | 'reference' | 'plan';

export type SCIClassification = 'entity' | 'transaction' | 'target' | 'reference' | 'plan';

/**
 * Resolve data_type from SCI classification.
 *
 * Identity: data_type === informational_label (no translation).
 * The SCI agent's classification IS the canonical structural class per D154/D155.
 */
export function resolveDataTypeFromClassification(
  classification: SCIClassification,
): SemanticDataType {
  // Exhaustiveness via discriminated union — TS compile-time guard
  switch (classification) {
    case 'entity':
      return 'entity';
    case 'transaction':
      return 'transaction';
    case 'target':
      return 'target';
    case 'reference':
      return 'reference';
    case 'plan':
      return 'plan';
    ...
```

`/Users/AndrewAfrica/spm-platform/web/src/lib/sci/sci-types.ts:219`
```ts
export type AgentType = 'plan' | 'entity' | 'target' | 'transaction' | 'reference';
```

**1b. CRITICAL: the current (post-HF-367/368) sheet classifier can NEVER emit `'target'`.** The sole classification producer (`deriveClassificationFromExpression`) constructs only `transaction` / `entity` / `reference` — there is no `target` branch:

`/Users/AndrewAfrica/spm-platform/web/src/lib/sci/expression-classifier.ts:119-180`
```ts
  // The model's per-column recognition, read by EQUALITY against the fixed primitive. An
  // identifier the model scopes as a TRANSACTION identifies an event; as an ENTITY, a recurring entity.
  const txnIdCol = recognized.find(i => i.nature_role === 'identifier' && i.scope_role === 'transaction');
  const entityIdCol = recognized.find(i => i.nature_role === 'identifier' && i.scope_role === 'entity');
  const hasMeasure = recognized.some(i => i.nature_role === 'measure');
  const hasPeriod = recognized.some(i => i.nature_role === 'temporal');

  if (txnIdCol) {
    return {
      classification: 'transaction',
      ...
  if (entityIdCol) {
    if (hasMeasure && hasPeriod) {
      return {
        classification: 'transaction',
        ...
    return {
      classification: 'entity',
      ...
  return {
    classification: 'reference',
    confidence: strongest.confidence,
    matchedConditions: ['model recognized no entity- and no transaction-identifying column — a dimensional lookup (reference)'],
  };
```

**1c. The only LIVE entry point for a fresh `'target'` classification today is the manual "Assign" override in the SCI proposal UI** (the user reclassifies a content unit to `target`):

`/Users/AndrewAfrica/spm-platform/web/src/components/sci/SCIProposal.tsx:73`
```ts
const CLASSIFICATIONS: AgentType[] = ['entity', 'target', 'transaction', 'reference', 'plan'];
```
`/Users/AndrewAfrica/spm-platform/web/src/components/sci/SCIProposal.tsx:242-247` (Assign ▾ dropdown)
```tsx
                {CLASSIFICATIONS.map(c => (
                  isVialuce
                    ? <button key={c} type="button" onClick={() => { setShowAssign(false); onAssign(c); }} ...>{c}</button>
                    : <button key={c} type="button" onClick={() => { setShowAssign(false); onAssign(c); }} className="block w-full px-3 py-1.5 text-left text-xs capitalize text-zinc-200 hover:bg-violet-500/10">{c}</button>
                ))}
```

The confirmed classification is carried to the server verbatim:

`/Users/AndrewAfrica/spm-platform/web/src/components/sci/SCIExecution.tsx:383-389`
```ts
    const bulkUnits = dataUnits.map(eu => {
      const proposalUnit = confirmedUnits.find(u => u.contentUnitId === eu.contentUnitId);
      if (!proposalUnit) return null;
      return {
        contentUnitId: eu.contentUnitId,
        confirmedClassification: eu.classification,
        confirmedBindings: proposalUnit.fieldBindings,
```

(The document-modality path also cannot yield `target`: `/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/analyze-document/route.ts:167-173` — `classificationMap` maps only to `plan`/`entity`/`transaction`; the type annotation includes `'target'` but no map value is `'target'`.)

**1d. Commit routing: a `'target'`-classified unit is written to committed_data with `data_type='target'`.**

`/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/execute-bulk/route.ts:1079-1087`
```ts
  switch (unit.confirmedClassification) {
    case 'entity':
      return processEntityUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, fileHashSha256);
    case 'target':
      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'target', fileHashSha256);
    case 'transaction':
      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'transaction', fileHashSha256);
    case 'reference':
      return processReferenceUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, profileId, fileHashSha256);
```

`processDataUnit` funnels into `commitContentUnit` — the sole sanctioned committed_data writer — where `data_type` derives from the classification and lands on every row (via CSV → `bulk_commit_from_storage` RPC):

`/Users/AndrewAfrica/spm-platform/web/src/lib/sci/commit-content-unit.ts:505-506`
```ts
  // HF-196 Phase 1D — data_type derives from SCI classification (Decisions 154/155).
  const dataType = resolveDataTypeFromClassification(classification);
```
`/Users/AndrewAfrica/spm-platform/web/src/lib/sci/commit-content-unit.ts:451-460` (row projection serialized into the committed_data CSV)
```ts
    const projection: CommittedRow = {
      tenant_id: scalars.tenantId,
      import_batch_id: '00000000-0000-0000-0000-000000000000',
      entity_id: null,
      period_id: null,
      source_date: '2024-01-01',
      data_type: dataType,
      row_data: { ...row, _sheetName: scalars.tabName, _rowIndex: 0 },
      metadata,
    };
```

### 2. How the ENGINE reads target data and computes `calculation_results.attainment`

The live engine is `/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts`. It fetches ALL committed_data for the period (no `data_type` filter) — and explicitly also fetches period-agnostic rows because "Target data from SCI applies to all periods":

`/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:824-837`
```ts
  // OB-128: Also fetch period-agnostic data (period_id IS NULL, source_date IS NULL)
  // Target data from SCI applies to all periods — not bound to a specific period
  let nullPeriodPage = 0;
  while (true) {
    ...
    let q = supabase
      .from('committed_data')
      .select('id, entity_id, data_type, row_data, import_batch_id, metadata')
      .eq('tenant_id', tenantId)
      .is('period_id', null)
      .is('source_date', null)
      .range(from, to);
```

Target VALUES are resolved per component through the convergence-binding `target` slot (a column name bound on `rule_sets.input_bindings.convergence_bindings`), read out of committed_data rows by `resolveColumnFromBatch`, and **attainment = actual / target** is computed here:

`/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:1655-1656`
```ts
    const actualBinding = (compBindings.actual || compBindings.row) as ConvergenceBindingEntry | undefined;
    const targetBinding = (compBindings.target || compBindings.column) as ConvergenceBindingEntry | undefined;
```
`/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:1744-1767` (the exact computation)
```ts
      if (effCol(targetBinding)) {
        // HF-227: filters read from the binding entry directly.
        const rawTargetValue = resolveColumnFromBatch(effCol(targetBinding)!, lookupKey, targetBinding!.filters, effRed(targetBinding), effKey(targetBinding));
        let targetValue = rawTargetValue;
        if (targetBinding?.scale_factor && targetValue !== null) targetValue *= targetBinding.scale_factor;
        ...
        if (targetValue !== null && targetValue !== 0) {
          const targetMetricName = expectedMetrics.length > 1
            ? expectedMetrics[1]
            : `${expectedMetrics[0]}_target`;
          metrics[targetMetricName] = targetValue;

          // Only compute attainment for actual+target pairs, NOT row+column 2D lookups
          if (compBindings.actual && compBindings.target) {
            metrics['attainment'] = actualValue / targetValue;
            ...
```

That metric is stamped onto the result row and written into `calculation_results.attainment`:

`/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:3339-3346`
```ts
    entityResults.push({
      entity_id: entityId,
      rule_set_id: ruleSetId,
      period_id: periodId,
      total_payout: entityTotal,
      components: componentResults,
      metrics: allEntityMetrics,
      attainment: { overall: allEntityMetrics['attainment'] ?? 0 },
```
`/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:3488-3491` (insert projection)
```ts
    metrics: r.metrics as unknown as Json,
    attainment: r.attainment as unknown as Json,
    metadata: r.metadata as unknown as Json,
  }));
```

Secondary/legacy attainment computations that also exist:

`/Users/AndrewAfrica/spm-platform/web/src/lib/calculation/run-calculation.ts:586-595` (metric-name path — `goal` key, not data_type)
```ts
function computeAttainmentFromGoal(metrics: Record<string, number>): void {
  if (metrics['goal'] && metrics['goal'] > 0) {
    const actual = metrics['amount'] ?? metrics['quantity'] ?? 0;
    const computedAttainment = actual / metrics['goal'];
    // Override if attainment is missing or looks like a monetary value (>1000)
    if (metrics['attainment'] === undefined || metrics['attainment'] > 1000) {
      metrics['attainment'] = computedAttainment;
    }
  }
}
```
`/Users/AndrewAfrica/spm-platform/web/src/lib/calculation/run-calculation.ts:1478` — `attainment: { overall: allEntityMetrics['attainment'] ?? 0 } as unknown as Json,`

`/Users/AndrewAfrica/spm-platform/web/src/lib/calculation/intent-transformer.ts:155-160` (OB-186: per-component constant `targetValue` inside plan intent, when no target column exists)
```ts
    const tv = rawIntent.targetValue ?? calcMethod?.targetValue ?? meta?.targetValue;
    operation = {
      operation: 'piecewise_linear',
      ratioInput: normalizeIntentInput(rawIntent.ratioInput),
      baseInput: normalizeIntentInput(rawIntent.baseInput),
      ...(tv != null && Number(tv) > 0 ? { targetValue: Number(tv) } : {}),
```
with the DAG fallback `attainment = baseValue / targetValue` at `/Users/AndrewAfrica/spm-platform/web/src/lib/calculation/legacy-intent-to-dag.ts:278-295`, and the orphaned quota engine `calculateQuotaAttainment` at `/Users/AndrewAfrica/spm-platform/web/src/lib/calculation/engine.ts:94-121` (`attainmentPercentage = quotaAmount > 0 ? (attainedAmount / quotaAmount) * 100 : 0`).

**Key structural fact:** the engine never filters on `data_type='target'` — `data_type` is used only as a sheet-grouping key (`run/route.ts` / `run-calculation.ts:1071` `const sheetName = row.data_type || '_unknown'`), and entity resolution explicitly treats it as inert:

`/Users/AndrewAfrica/spm-platform/web/src/lib/sci/entity-resolution.ts:195-200`
```ts
      // HF-341 R5 (PG-R5-1): the idColumn FALLBACK reads the LLM's EXPRESSION, not the data_type label.
      // ... The prior
      // `data_type === 'transaction' || 'target'` gate is removed — committed_data.data_type is inert
      // provenance here; the reference-key nature in field_identities is the carried-reality signal.
```

### 3. Any write path for target data besides file import?

**Answer: NO — no API route or code path writes target values into committed_data outside the file-import pipelines.** The repo carries a build-gate test enumerating every committed_data write site:

`/Users/AndrewAfrica/spm-platform/web/src/lib/remediation/__tests__/p8-sole-writer.test.ts:46-53`
```ts
  const KNOWN = [
    'app/api/import/commit/route.ts',   // pre-existing legacy field-mapper (product-orphaned; flagged)
    'lib/sci/commit-content-unit.ts',   // OB-249 gate / HF-356 transport — runRemediationConstruct → bulk_commit_from_storage
    'lib/supabase/data-service.ts',     // pre-existing generic helper (dead: zero callers; flagged)
  ].sort();
```

Search evidence (`grep -rn "from('committed_data')" web/src` + mutation filter):
- `lib/sci/commit-content-unit.ts` — SCI import (sole sanctioned writer, via `bulk_commit_from_storage` RPC); its `.delete()` at :806 is failure cleanup.
- `app/api/import/commit/route.ts:854-855` `.insert(slice)` — legacy field-mapper **file import** (product-orphaned per the guard).
- `lib/supabase/data-service.ts:168` `writeCommittedData` `.insert(chunk)` — **dead: `grep -rn "writeCommittedData" web/src` returns zero callers outside the file itself** (verified this session).
- Non-value mutations only: `app/api/intelligence/wire/route.ts:119-124` `.update({ data_type: normalized })` (renames legacy `component_data:*` labels — cannot mint target values); `lib/sci/entity-resolution.ts:614` and `lib/summary/resolve-entity-ids.ts:108` `.update({ entity_id })` (entity backfill); `lib/sci/committed-data-visibility.ts:124`, `lib/sci/pulse-load-enqueue.ts:160` (deletes).
- `find web/src/app/api -type d -iname "*target*" -o -iname "*quota*"` → **no matches**; there is no target/quota authoring endpoint. (`api/entities/[id]/targets` does not exist; nothing under `api/` mentions inserting `data_type='target'`.)

### 4. Live probe (script left on disk at `/Users/AndrewAfrica/spm-platform/web/scripts/_ob258_p01_target_probe.ts`)

```
=== OB-258 P0.1 target-data-path probe ===

TENANTS (16):
  972c8eb0-e3ae-4e4c-ad30-8b34804c893a  slug=almacenes-mirasol  name=Almacenes Mirasol
  b1c2d3e4-aaaa-bbbb-cccc-111111111111  slug=banco-cumbre-litoral  name=Banco Cumbre del Litoral
  2d9979ba-5032-48a7-bccf-1928f3e6dadf  slug=casa-diaz  name=Casa Diaz
  e44bbcb1-2710-4880-8c7d-a1bd902720b7  slug=cascade-revenue-partners  name=Cascade Revenue Partners
  a5da0cee-f76d-4f75-b091-53e64821ac9d  slug=diestra-grupo-empresarial  name=Diestra Grupo Empresarial
  5035b1e8-0754-4527-b7ec-9f93f85e4c79  slug=meridian-logistics-group  name=Meridian Logistics Group
  3d354bfa-b298-48dd-88a0-9f8c5a00be4e  slug=mx-restaurant  name=MX Restaurant
  74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2  slug=robles-maquinaria  name=Robles Maquinaria
  f7093bcc-e90b-4918-9680-69da7952dd65  slug=sabor-grupo  name=Sabor Grupo Gastronomico
  abb9da8d-d6d5-4ebc-af42-ebb9c972bd8b  slug=test-a1  name=Test #A1
  03d28288-700b-43e3-a96b-49a4f849d2df  slug=tomi-test-1  name=Tomi Test #1
  2fdbebce-aa80-4c5a-b37b-aad2e281baf5  slug=tomi-test-2  name=Tomi Test #2
  07638678-d141-429f-a902-6200addb2dc7  slug=tomico  name=TomiCo
  dbe3b308-1483-4cd8-8032-6fdd4a8a8f5c  slug=trial-1  name=Trial 1
  1b770e90-9ad9-44ba-b66b-152f71c40b9a  slug=trial2  name=Trial2
  5b078b52-55c9-4612-8f86-96038c198bfe  slug=vltest2  name=VLTEST2

COMMITTED_DATA COUNTS BY tenant × data_type:
  [almacenes-mirasol] 972c8eb0-e3ae-4e4c-ad30-8b34804c893a:
    entity: 34
    target: 30
    transaction: 75163
  [banco-cumbre-litoral] b1c2d3e4-aaaa-bbbb-cccc-111111111111:
    entity: 85
    transaction: 510
  [casa-diaz] (no committed_data rows)
  [cascade-revenue-partners] (no committed_data rows)
  [diestra-grupo-empresarial] (no committed_data rows)
  [meridian-logistics-group] 5035b1e8-0754-4527-b7ec-9f93f85e4c79:
    entity: 67
    reference: 36
    transaction: 201
  [mx-restaurant] (no committed_data rows)
  [robles-maquinaria] (no committed_data rows)
  [sabor-grupo] f7093bcc-e90b-4918-9680-69da7952dd65:
    pos_cheque: 263250
  [test-a1] abb9da8d-d6d5-4ebc-af42-ebb9c972bd8b:
    reference: 331714
  [tomi-test-1] 03d28288-700b-43e3-a96b-49a4f849d2df:
    target: 400
  [tomi-test-2] (no committed_data rows)
  [tomico] (no committed_data rows)
  [trial-1] (no committed_data rows)
  [trial2] (no committed_data rows)
  [vltest2] 5b078b52-55c9-4612-8f86-96038c198bfe:
    entity: 170
    reference: 20
    transaction: 510

GLOBAL data_type='target' row total (across all tenants above): 430
```

VLTEST2 tenant id = `5b078b52-55c9-4612-8f86-96038c198bfe` — it has **zero** `data_type='target'` rows. Sample target rows (Tomi Test #1, created 2026-06-11 — i.e. by the pre-HF-367 agent pipeline; note `metadata.semantic_roles.*.claimedBy: "target"` and `role: "performance_target"`):

```
{
  "id": "89f31956-7024-4366-a978-74acd65a605d",
  "tenant_id": "03d28288-700b-43e3-a96b-49a4f849d2df",
  "import_batch_id": "9c3c4b9a-f827-4971-b808-673dac8e09ca",
  "entity_id": "a7fde76a-2f90-49a8-b973-daa32a311ed7",
  "period_id": null,
  "source_date": null,
  "data_type": "target",
  "row_data": {
    "Name": "Valeria García", "Role": "Rep Senior", "Team": "Mexico-Norte", "Region": "Norte",
    "Country": "Mexico", "Currency": "MXN", "_rowIndex": 1, "_sheetName": "Sheet1",
    "Employee ID": "MXN0002", "Final Payout": 1807916, "Perf Profile": "over",
    "Monthly Base Salary": 164807, "Target Bonus Amount": 1318456, "Scorecard Multiplier": 1.3712,
    "Target Bonus (months)": 8, "Net Billed Sales — Attain%": 131.4, "Net Billed Sales — Payout%": 131.4,
    "Renewal Hit Rate — Attain%": 163.8, "Renewal Hit Rate — Payout%": 150,
    "New Biz Commitment — Attain%": 152.8, "New Biz Commitment — Payout%": 150,
    "Profitability (GM) — Attain%": 98, "Profitability (GM) — Payout%": 95.1,
    "New Biz Signings (GM) — Attain%": 165.7, "New Biz Signings (GM) — Payout%": 150
  },
  "metadata": {
    "source": "sci-bulk",
    "proposalId": "e297ed6b-5812-446f-9891-1369bd09fdd0",
    "semantic_roles": {
      "Employee ID": { "role": "entity_identifier", "claimedBy": "target", "confidence": 0.85 },
      "Target Bonus Amount": { "role": "performance_target", "claimedBy": "target", "confidence": 0.8 },
      … (21 more columns, all "claimedBy": "target"; measures are "role": "performance_target", categoricals "category_code") …
    },
    "entity_id_field": "Employee ID",
    "field_identities": {
      "Employee ID": { "confidence": 0.85, "structuralType": "identifier", "contextualIdentity": "Employee ID — identifier (cardinality fallback, uniqueness 13%)" },
      "Target Bonus Amount": { "confidence": 0.8, "structuralType": "measure", "contextualIdentity": "Target Bonus Amount — measure/goal" },
      … (21 more columns, measures as structuralType "measure" / "… — measure/goal") …
    },
    "resolved_data_type": "target",
    "informational_label": "target"
  },
  "created_at": "2026-06-11T00:49:18.312182+00:00"
}
{
  "id": "0713ec88-3ca8-4f13-85b0-94afdae5ac15",
  "tenant_id": "03d28288-700b-43e3-a96b-49a4f849d2df",
  "import_batch_id": "9c3c4b9a-f827-4971-b808-673dac8e09ca",
  "entity_id": "4c2fba7b-7c4d-4cf1-bd2a-ce153ffbbdad",
  "period_id": null,
  "source_date": null,
  "data_type": "target",
  "row_data": { "Name": "Nicolás Vargas", "Role": "Rep Cuentas", "Employee ID": "MXN0003",
    "Target Bonus Amount": 438498, "Target Bonus (months)": 6, "Monthly Base Salary": 73083,
    "Scorecard Multiplier": 0.8167, "Final Payout": 358139, … (same column set as above) … },
  "metadata": { "source": "sci-bulk", "resolved_data_type": "target", "informational_label": "target", … (same shape) … },
  "created_at": "2026-06-11T00:49:18.312182+00:00"
}
```
(Sample-row metadata elisions marked `…` cover only repeated per-column entries of identical shape; full JSON is reproducible by re-running the probe script.)

### 5. committed_data schema — SCHEMA_REFERENCE_LIVE.md vs live

`/Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md:163-176`
```
### committed_data (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO | |
| import_batch_id | uuid | YES | |
| entity_id | uuid | YES | |
| period_id | uuid | YES | |
| data_type | text | NO | |
| row_data | jsonb | NO | |
| metadata | jsonb | NO | |
| created_at | timestamp with time zone | NO | now() |
| source_date | date | YES | |
```
Live probe column set (keys of a sampled row):
```
LIVE committed_data COLUMN SET (keys of one sampled row):
  created_at, data_type, entity_id, id, import_batch_id, metadata, period_id, row_data, source_date, tenant_id
```
**Match: 10/10 columns, byte-identical names — SCHEMA_REFERENCE_LIVE.md is accurate for committed_data.**

**HALT-RISK:** The fresh SCI classification path can no longer produce `data_type='target'` — the HF-367/368 classifier (`expression-classifier.ts:119-180`) emits only `transaction`/`entity`/`reference`, so a quota sheet imported today classifies as `transaction` or `reference` unless a human manually reassigns it to `target` via the SCIProposal "Assign ▾" override (`SCIProposal.tsx:73,242`); all 430 live target rows predate HF-367 (created 2026-06-11: Almacenes Mirasol 30, Tomi Test #1 400) and **VLTEST2 has zero target rows**, meaning the OB-258 quota path has no automatic ingestion entry today and the engine's actual/target attainment (`run/route.ts:1762`) depends entirely on convergence `target`-slot column bindings, not on the `target` data_type.
---

## P0.2 — Organizational graph

### 1. `entity_relationships` edge shape

**SCHEMA_REFERENCE_LIVE.md:268-283:**

```
### entity_relationships (13 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO | |
| source_entity_id | uuid | NO | |
| target_entity_id | uuid | NO | |
| relationship_type | text | NO | |
| source | text | NO | imported_explicit |
| confidence | numeric | NO | 1.0 |
| evidence | jsonb | NO | |
| context | jsonb | NO | |
| effective_from | date | YES | |
| effective_to | date | YES | |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
```

**Live verification (probe output, matches schema doc exactly — 13 columns):**

```
entity_relationships LIVE COLUMNS: id, tenant_id, source_entity_id, target_entity_id,
relationship_type, source, confidence, evidence, context, effective_from, effective_to,
created_at, updated_at
```

`relationship_type` is `text` in the DB, but the TypeScript layer declares a closed union — `/Users/AndrewAfrica/spm-platform/web/src/lib/supabase/database.types.ts:44-53`:

```ts
export type RelationshipType =
  | 'contains'
  | 'manages'
  | 'works_at'
  | 'assigned_to'
  | 'member_of'
  | 'participates_in'
  | 'oversees'
  | 'assists';
```

Note: `'reports_to'` is NOT in this enum, yet import code writes it (below) — and live VLTEST2 data contains values outside the enum entirely (see probe).

**Writers (import path).** All import-time edges are written by `runPostCommitConstruction` in `/Users/AndrewAfrica/spm-platform/web/src/lib/sci/post-commit-construction.ts`, via three constructors:

(a) **HF-353 P-B role-based hierarchy** (the path that produced VLTEST2's live edges) — `post-commit-construction.ts:370-401`. Direction: **SOURCE = subordinate (the row's entity), TARGET = superior (the reference-pointer column value)**; type = the categorical typeCol's raw cell value, defaulting to `'reports_to'`:

```ts
export function buildRoleBasedHierarchyEdges(
  rows: Array<{ row_data: Record<string, unknown>; entity_id: string | null }>,
  ...
    const type = (roles.typeCol ? String(row_data[roles.typeCol] ?? '').trim() : '') || 'reports_to';
    const dedup = `${source}|${target}|${type}`;
    ...
    edges.push({
      tenant_id: tenantId, source_entity_id: source, target_entity_id: target,
      relationship_type: type, source: 'imported_explicit', confidence: 1.0,
      evidence: { signal: 'hierarchy_sheet_role', targetCol: roles.targetCol, typeCol: roles.typeCol, sourceCol: roles.sourceCol },
      context: { recognized_relationship: type },
      effective_from: nowIso,
    });
```

(b) **OB-248 value-overlap fallback** — same orientation, documented at `post-commit-construction.ts:264-269`:

```ts
 * Construct directed child→parent edges from a detected hierarchy sheet. The edge
 * TYPE is the LLM-recognized relationship value carried in the data (`typeCol`),
 * or the supplied `recognizedType` characterization — never a literal in this
 * logic (Decision 158 / Korean Test). Orientation: SOURCE=subordinate so a
 * distribution originator walks UP via outbound edges.
```

(c) **HF-263 CPI shared-attribute** — `post-commit-construction.ts:174-183`: **SOURCE = individual, TARGET = grouping entity**, type `'assigned_to'`, `source: 'ai_inferred'`, conf 0.85. And the OB-204 CPI recognizer maps dimensions to types at `/Users/AndrewAfrica/spm-platform/web/src/lib/entities/cpi.ts:18-24` — `containment: 'manages'` / `hierarchical_by_exclusion: 'manages'` / `shared_attribute: 'shares_attribute'` / `cardinality: 'contains'`, all written `source: 'ai_inferred'` (hints only).

All writers upsert on `onConflict: 'tenant_id,source_entity_id,target_entity_id,relationship_type'` (`post-commit-construction.ts:477-484`).

**Readers.** For `'manages'`, every reader assumes the OPPOSITE orientation from (a)/(b): **SOURCE = manager, TARGET = report** (edge points DOWN). Scope materializer `/Users/AndrewAfrica/spm-platform/web/src/lib/entities/profile-scope.ts:36-45`:

```ts
    const { data: edges } = await sb.from('entity_relationships')
      .select('target_entity_id, source, effective_to')
      .eq('tenant_id', tenantId)
      .eq('source_entity_id', managerEntityId)
      .eq('relationship_type', 'manages');
    for (const e of (edges ?? [])) {
      if (SCOPE_SOURCES.includes(e.source as string) && (e.effective_to == null)) {
        visible.add(e.target_entity_id as string);
      }
    }
```

Same DOWN convention in `/Users/AndrewAfrica/spm-platform/web/src/lib/data/briefing-loader.ts:379-386` ("Get team members (entities managed by this manager)" — filters `source_entity_id = managerEntityId`, collects targets), `/Users/AndrewAfrica/spm-platform/web/src/lib/data/intelligence-stream-loader.ts:418-431`, and canvas `/Users/AndrewAfrica/spm-platform/web/src/lib/canvas/graph-service.ts:82-89`:

```ts
  // Build parent map: for each entity, who is their parent (via 'contains' or 'manages')?
  const parentMap = new Map<string, string>();
  ...
  for (const rel of relList) {
    if (rel.relationship_type === 'contains' || rel.relationship_type === 'manages') {
      parentMap.set(rel.target_entity_id, rel.source_entity_id);
```

So the platform has **two coexisting direction conventions**: `'manages'`/`'contains'` edges point parent→child (source=superior), while import-constructed hierarchy edges (`'reports_to'` and free-text types) point child→parent (source=subordinate).

### 2. DS-014 scope derivation from the graph

The chain is: import/confirm → `materializeProfileScope` writes `profile_scope` (scope_type=`'graph_derived'`) → `resolveEntityScope` reads it fail-closed → `resolveAuthScope` produces the AuthScope union.

**Materializer (writer)** — `/Users/AndrewAfrica/spm-platform/web/src/lib/entities/profile-scope.ts:14, 26-61`. Only ONE hop, only `'manages'`, only confirmed/explicit sources, only active edges:

```ts
const SCOPE_SOURCES = ['human_confirmed', 'human_created', 'imported_explicit'];
...
export async function materializeProfileScope(profileId: string, sb: SupabaseClient): Promise<MaterializeResult> {
  ...
  const visible = new Set<string>();
  if (managerEntityId && tenantId) {
    visible.add(managerEntityId);   // a manager sees their own entity
    const { data: edges } = await sb.from('entity_relationships')
      ...
      .eq('source_entity_id', managerEntityId)
      .eq('relationship_type', 'manages');
    ...
    const row = {
      tenant_id: tenantId, profile_id: profileId, scope_type: 'graph_derived',
      visible_entity_ids: visibleEntityIds, visible_rule_set_ids: [], visible_period_ids: [],
      metadata: { derived_from: 'manages_subgraph', edge_count: visibleEntityIds.length },
```

Note: despite the header comment saying "Traverses the CONFIRMED/EXPLICIT `manages` subgraph", the code is **single-hop** (direct reports only — no recursive traversal). It is re-run on every edge confirm/reject (`/Users/AndrewAfrica/spm-platform/web/src/lib/entities/relationships.ts:19-32`); `ai_inferred` edges never feed scope until confirmed.

**Persisted shape** — SCHEMA_REFERENCE_LIVE.md:452-465: `profile_scope (9 columns)`: `id, tenant_id, profile_id, scope_type text NO default 'graph_derived', visible_entity_ids uuid[], visible_rule_set_ids uuid[], visible_period_ids uuid[], metadata jsonb, materialized_at`.

**Reader** — `/Users/AndrewAfrica/spm-platform/web/src/lib/drill-through/entity-scope.ts:16-37` (fail-CLOSED: no profile / no row / empty array → `{ type: 'deny' }`; non-empty → `{ type: 'team', entityIds }`). Consumed by the single resolver `/Users/AndrewAfrica/spm-platform/web/src/lib/auth/scope.ts:130-139`:

```ts
    if (viewRole === 'manager') {
      // profile_scope (fail-closed reader) names the team; empty/missing → deny from there.
      const teamScope = await resolveEntityScope(profile.id, profile.tenantId, sb);
      if (teamScope.type === 'team') return { scope: teamScope, ownEntityId: null, viewRole };
      // No team → fail CLOSED to own entity only (AP4), then deny if unlinked.
```

Role map (`scope.ts:108-113`): platform/admin → `all`; manager → `team` from profile_scope else `own` else `deny`; member/viewer → `own` (via `entities.profile_id` linkage) else `deny`; unknown → `deny`.

### 3. Hierarchy expression convention (region → team → rep)

From write/read code, the convention is: **the org tree is a set of directed `entity_relationships` edges among `entities` rows (entity_type: individual/location/team/organization), temporal (never deleted — `effective_to` end-dates), with two type-dependent orientations:**
- **Downward-typed edges** (`'manages'`, `'contains'`): source = parent/superior, target = child/report. Region→team→rep would be `region --contains--> team --contains/manages--> rep` (graph-service parent map + profile-scope both assume this).
- **Upward-typed edges** (imported hierarchy sheets, `'reports_to'` or the sheet's own categorical label): source = subordinate, target = superior — `rep --reports_to--> team-lead --reports_to--> region-manager`.
- Group membership: `individual --assigned_to--> grouping-entity` (source = member, target = group).
Permission scope is NOT computed by graph traversal at read time — it is a materialized single-hop `'manages'` fan-out into `profile_scope.visible_entity_ids`.

### 4. Live probe (script left at `/Users/AndrewAfrica/spm-platform/web/scripts/_ob258_p02_graph_probe.ts`)

```
TENANTS (16):
  972c8eb0-e3ae-4e4c-ad30-8b34804c893a  Almacenes Mirasol  slug=almacenes-mirasol
  b1c2d3e4-aaaa-bbbb-cccc-111111111111  Banco Cumbre del Litoral  slug=banco-cumbre-litoral
  2d9979ba-5032-48a7-bccf-1928f3e6dadf  Casa Diaz  slug=casa-diaz
  e44bbcb1-2710-4880-8c7d-a1bd902720b7  Cascade Revenue Partners  slug=cascade-revenue-partners
  a5da0cee-f76d-4f75-b091-53e64821ac9d  Diestra Grupo Empresarial  slug=diestra-grupo-empresarial
  5035b1e8-0754-4527-b7ec-9f93f85e4c79  Meridian Logistics Group  slug=meridian-logistics-group
  3d354bfa-b298-48dd-88a0-9f8c5a00be4e  MX Restaurant  slug=mx-restaurant
  74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2  Robles Maquinaria  slug=robles-maquinaria
  f7093bcc-e90b-4918-9680-69da7952dd65  Sabor Grupo Gastronomico  slug=sabor-grupo
  abb9da8d-d6d5-4ebc-af42-ebb9c972bd8b  Test #A1  slug=test-a1
  03d28288-700b-43e3-a96b-49a4f849d2df  Tomi Test #1  slug=tomi-test-1
  2fdbebce-aa80-4c5a-b37b-aad2e281baf5  Tomi Test #2  slug=tomi-test-2
  07638678-d141-429f-a902-6200addb2dc7  TomiCo  slug=tomico
  dbe3b308-1483-4cd8-8032-6fdd4a8a8f5c  Trial 1  slug=trial-1
  1b770e90-9ad9-44ba-b66b-152f71c40b9a  Trial2  slug=trial2
  5b078b52-55c9-4612-8f86-96038c198bfe  VLTEST2  slug=vltest2

PER-TENANT EDGE COUNTS:
  Sabor Grupo Gastronomico (sabor-grupo): 83 edges (83 active/effective_to IS NULL)
    types: contains=63, member_of=20
    sources: human_created=83
  VLTEST2 (vltest2): 84 edges (84 active/effective_to IS NULL)
    types: Gerente de Sucursal=9, Oficial de Crédito=72, Gerente Regional=3
    sources: imported_explicit=84
  (all 14 other tenants: 0 edges)

MULTI-LEVEL CHAIN in VLTEST2 (tenant 5b078b52-55c9-4612-8f86-96038c198bfe):
  A: 7c9fa036-e703-42f5-a79f-a3319f65edea "Carlos Mauricio Reyes Vega" [individual] ext=BCL-5005
    --Gerente de Sucursal (source=imported_explicit, conf=1, edge de50adcb-960f-406d-a3de-9a380a806b73)-->
  B: 0ea239af-177f-4fd2-88d7-0f7eaad8d62b "Fernando Hidalgo Paredes" [individual] ext=BCL-5002
    --Gerente Regional (source=imported_explicit, conf=1, edge d47df678-c95e-425a-a8d6-abe305356f72)-->
  C: 877d289e-9610-46d1-8bd2-62933e7ff61b "Adriana Reyes Molina" [individual] ext=BCL-5001
```

A multi-level (2-edge) directed chain EXISTS in VLTEST2: rep BCL-5005 → branch manager BCL-5002 → regional manager BCL-5001, all `imported_explicit` @ conf 1.0, active. Direction confirms the upward (source=subordinate) convention of `buildRoleBasedHierarchyEdges`, with `relationship_type` = the raw typeCol cell value (the TARGET's Spanish job title).

**HALT-RISK:** VLTEST2's entire live graph (84/84 edges) carries free-text Spanish `relationship_type` values ("Gerente de Sucursal", "Oficial de Crédito", "Gerente Regional") — none is `'manages'` and none is in the `RelationshipType` enum (database.types.ts:44-53). Consequences for a cascade design: (1) DS-014 scope materialization (`profile-scope.ts:40` filters `.eq('relationship_type','manages')`) derives ZERO `graph_derived` scope from this graph — no manager on VLTEST2 can get a team scope from these edges; (2) every `'manages'` reader (briefing-loader.ts:384, intelligence-stream-loader.ts:418-430, graph-service.ts:87) assumes source=manager→target=report, the OPPOSITE direction of the imported edges (source=subordinate→target=superior), so even a naive type-normalization to `'manages'` would invert the tree; (3) the materializer is single-hop only (direct `manages` targets), so a region→team→rep cascade cannot be scope-derived transitively without new traversal code.
---


## P0.3 — Attainment record

### 1. Who writes `calculation_results` — the production path

The production writer is the API route `web/src/app/api/calculation/run/route.ts` (intent engine, "Decision 151 sole authority"; the UI's Run Calculation button calls this endpoint — `web/src/components/operate/LifecycleCockpit.tsx:185`). A second, dormant library path exists in `web/src/lib/calculation/run-calculation.ts` (its `runCalculation` has no production importers; the route imports only helpers like `aggregateMetrics` from it), and a generic writer helper exists in `web/src/lib/supabase/calculation-service.ts`. All three build the same attainment shape.

#### 1a. The per-entity result accumulator (route path) — declared shape

`/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:2024-2033`
```ts
  const entityResults: Array<{
    entity_id: string;
    rule_set_id: string;
    period_id: string;
    total_payout: number;
    components: ComponentResult[];
    metrics: Record<string, number>;
    attainment: { overall: number };
    metadata: Record<string, unknown>;
  }> = [];
```

#### 1b. Construction of the attainment object per entity

`/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:3339-3361`
```ts
    entityResults.push({
      entity_id: entityId,
      rule_set_id: ruleSetId,
      period_id: periodId,
      total_payout: entityTotal,
      components: componentResults,
      metrics: allEntityMetrics,
      attainment: { overall: allEntityMetrics['attainment'] ?? 0 },
      metadata: {
        entityName: entityInfo?.display_name ?? entityId,
        externalId: entityInfo?.external_id ?? '',
        intentTraces,
        intentTotal,
        roundingTrace: {
          rawTotal: entityRoundingTraces.reduce((s, t) => s + t.rawValue, 0),
          roundedTotal: entityTotal,
          totalRoundingAdjustment: entityRoundingTraces.reduce((s, t) => s + t.roundingAdjustment, 0),
          components: entityRoundingTraces,
        },
        // HF-218 Component 5: SOC-grade preservation snapshot.
        binding_snapshot: bindingSnapshot,
      },
    });
```

`allEntityMetrics` is the per-entity SUM of every numeric `row_data` field, keyed by the literal source column name (`route.ts:2334` → `const allEntityMetrics = aggregateMetrics(entityRowsFlat);`):

`/Users/AndrewAfrica/spm-platform/web/src/lib/calculation/run-calculation.ts:426-444`
```ts
export function aggregateMetrics(
  rows: Array<{ row_data: Json }>
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const row of rows) {
    const data = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
      ? row.row_data as Record<string, Json | undefined>
      : {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'number') {
        result[key] = (result[key] || 0) + value;
      }
    }
  }

  return result;
}
```

**Consequence:** `attainment.overall` is non-zero only if a committed source column is literally named `attainment`. No tenant's data has such a column, so the engine writes `{"overall": 0}` for every row (confirmed live below).

The engine DOES compute real attainment ratios per component from convergence bindings — but into the transient per-component `metrics` map, not the persisted `attainment` column:

`/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:1760-1766`
```ts
          // Only compute attainment for actual+target pairs, NOT row+column 2D lookups
          if (compBindings.actual && compBindings.target) {
            metrics['attainment'] = actualValue / targetValue;
            if (shouldEmitTrace(entityExternalId)) {
              bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:attainment_computed entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | actualValue=${actualValue} | targetValue=${targetValue} | attainment=${metrics['attainment']}`);
            }
          }
```

#### 1c. The INSERT — exact persisted JSONB shape (attainment + components + total_payout)

`/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:3474-3491`
```ts
  const insertRows = entityResults.map(r => ({
    tenant_id: tenantId,
    batch_id: batch.id,
    entity_id: r.entity_id,
    rule_set_id: r.rule_set_id,
    period_id: r.period_id,
    total_payout: r.total_payout,
    components: r.components.map(c => ({
      componentId: c.componentId,
      componentName: c.componentName,
      componentType: c.componentType,
      payout: c.payout,
      details: c.details,
    })) as unknown as Json,
    metrics: r.metrics as unknown as Json,
    attainment: r.attainment as unknown as Json,
    metadata: r.metadata as unknown as Json,
  }));
```

Note the insert map **drops `metricValues`** from `ComponentResult` — the full in-memory type is:

`/Users/AndrewAfrica/spm-platform/web/src/lib/calculation/run-calculation.ts:38-52`
```ts
export interface ComponentResult {
  componentId: string;
  componentName: string;
  componentType: string;
  payout: number;
  metricValues: Record<string, number>;
  details: Record<string, unknown>;
  // HF-272: per-component resolution failure — set when a required reference token mapped
  // to NO real data column at convergence (the relocated hallucination-catch). When present
  // the component is a LOUD failure (status 'failed', named token), NOT a silent $0; the run
  // continues and other components compute (Option 1 — no run abort). Absent on every
  // component whose tokens resolve to real columns (DD-7: those compute identically).
  status?: 'failed';
  resolutionFailure?: { token: string; reason: string };
}
```

`details` is seeded `{}` unless a resolution failure occurred (`route.ts:3010-3012`), and live rows confirm `details: {}`.

**Exact persisted JSONB shapes (engine path):**
- `attainment` = `{ "overall": <number> }` — single key; live value is always `0`.
- `components` = `[ { "componentId": string, "componentName": string, "componentType": string (e.g. "prime_dag"), "payout": number, "details": {} | {failed, reason, unresolvedToken} }, ... ]` — NO per-component attainment, NO metricValues.
- `total_payout` = numeric scalar (sum of Decision-122-rounded component payouts).
- `metrics` = flat `{ <source column name>: <per-entity sum> }` (e.g. `"Cumplimiento_Colocacion": 1.1788`) — attainment-like ratios survive here only under tenant-specific source column names.
- `metadata` = `{ entityName, externalId, intentTraces[], intentTotal, roundingTrace{...}, binding_snapshot{...} }`; `intentTraces[].inputs` is the only place per-component resolved input values (incl. attainment inputs) persist (`intent-types.ts:276-295`).

#### 1d. Dormant library path + generic writer (same shape)

`/Users/AndrewAfrica/spm-platform/web/src/lib/calculation/run-calculation.ts:1465-1483`
```ts
    entityResults.push({
      entityId,
      ruleSetId,
      periodId,
      totalPayout: entityTotal,
      components: componentResults.map(c => ({
        componentId: c.componentId,
        componentName: c.componentName,
        componentType: c.componentType,
        payout: c.payout,
        details: c.details,
      })) as unknown as Json,
      metrics: allEntityMetrics as unknown as Json,
      attainment: { overall: allEntityMetrics['attainment'] ?? 0 } as unknown as Json,
      metadata: {
        entityName: entityInfo?.display_name ?? entityId,
        externalId: entityInfo?.external_id ?? '',
      } as unknown as Json,
    });
```

`/Users/AndrewAfrica/spm-platform/web/src/lib/supabase/calculation-service.ts:345-356`
```ts
  const insertRows: CalcResultInsert[] = results.map(r => ({
    tenant_id: tenantId,
    batch_id: batchId,
    entity_id: r.entityId,
    rule_set_id: r.ruleSetId || null,
    period_id: r.periodId || null,
    total_payout: r.totalPayout,
    components: r.components,
    metrics: r.metrics,
    attainment: r.attainment || ({} as Json),
    metadata: r.metadata || ({} as Json),
  }));
```

### 2. `entity_period_outcomes.attainment_summary` — who writes it, shape

Two writers; both COPY `calculation_results.attainment` verbatim (never recompute):

**Writer 1 — fresh calculation (route.ts step 9):**
`/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:3631-3649`
```ts
  // ── 9. Materialize entity_period_outcomes ──
  const outcomeRows = entityResults.map(r => ({
    tenant_id: tenantId,
    entity_id: r.entity_id,
    period_id: r.period_id,
    total_payout: r.total_payout,
    lowest_lifecycle_state: 'PREVIEW',
    rule_set_breakdown: [{
      rule_set_id: ruleSetId,
      total_payout: r.total_payout,
    }] as unknown as Json,
    component_breakdown: r.components.map(c => ({
      componentId: c.componentId,
      componentName: c.componentName,
      payout: c.payout,
    })) as unknown as Json,
    attainment_summary: r.attainment as unknown as Json,
    metadata: {} as unknown as Json,
  }));
```

**Writer 2 — lifecycle transitions (OFFICIAL/APPROVED/POSTED/PUBLISHED):**
`/Users/AndrewAfrica/spm-platform/web/src/lib/supabase/calculation-service.ts:579-590`
```ts
    const outcome: Omit<EntityPeriodOutcomeRow, 'id'> & { id?: string } = {
      tenant_id: tenantId,
      entity_id: entityId,
      period_id: periodId,
      total_payout: totalPayout,
      rule_set_breakdown: ruleSetBreakdown as unknown as Json,
      component_breakdown: allComponents as unknown as Json,
      lowest_lifecycle_state: lowestLifecycleState,
      attainment_summary: (results[0]?.attainment || {}) as Json,
      metadata: {} as Json,
      materialized_at: new Date().toISOString(),
    };
```

So `attainment_summary` inherits the identical `{"overall": 0}` shape (Writer 2 even takes only `results[0]` — first result's attainment — when multiple rule sets exist).

### 3. SCHEMA_REFERENCE_LIVE.md rows

`/Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md:107` — `### calculation_results (12 columns)`
```
| total_payout | numeric | NO | 0 |
| components | jsonb | NO | |
| metrics | jsonb | NO | |
| attainment | jsonb | NO | |
| metadata | jsonb | NO | |
```

`/Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md:252` — `### entity_period_outcomes (11 columns)`
```
| total_payout | numeric | NO | 0 |
| rule_set_breakdown | jsonb | NO | |
| component_breakdown | jsonb | NO | |
| lowest_lifecycle_state | text | NO | DRAFT |
| attainment_summary | jsonb | NO | |
| metadata | jsonb | NO | |
| materialized_at | timestamp with time zone | NO | now() |
```
Both match the live probe (columns queried directly succeeded).

### 4. Live probe (script left on disk: `/Users/AndrewAfrica/spm-platform/web/scripts/_ob258_p03_attainment_probe.ts`)

```
=== OB-258 P0.3 Attainment Probe ===

TENANTS (16):
  972c8eb0-e3ae-4e4c-ad30-8b34804c893a  slug=almacenes-mirasol  name=Almacenes Mirasol
  b1c2d3e4-aaaa-bbbb-cccc-111111111111  slug=banco-cumbre-litoral  name=Banco Cumbre del Litoral
  2d9979ba-5032-48a7-bccf-1928f3e6dadf  slug=casa-diaz  name=Casa Diaz
  e44bbcb1-2710-4880-8c7d-a1bd902720b7  slug=cascade-revenue-partners  name=Cascade Revenue Partners
  a5da0cee-f76d-4f75-b091-53e64821ac9d  slug=diestra-grupo-empresarial  name=Diestra Grupo Empresarial
  5035b1e8-0754-4527-b7ec-9f93f85e4c79  slug=meridian-logistics-group  name=Meridian Logistics Group
  3d354bfa-b298-48dd-88a0-9f8c5a00be4e  slug=mx-restaurant  name=MX Restaurant
  74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2  slug=robles-maquinaria  name=Robles Maquinaria
  f7093bcc-e90b-4918-9680-69da7952dd65  slug=sabor-grupo  name=Sabor Grupo Gastronomico
  abb9da8d-d6d5-4ebc-af42-ebb9c972bd8b  slug=test-a1  name=Test #A1
  03d28288-700b-43e3-a96b-49a4f849d2df  slug=tomi-test-1  name=Tomi Test #1
  2fdbebce-aa80-4c5a-b37b-aad2e281baf5  slug=tomi-test-2  name=Tomi Test #2
  07638678-d141-429f-a902-6200addb2dc7  slug=tomico  name=TomiCo
  dbe3b308-1483-4cd8-8032-6fdd4a8a8f5c  slug=trial-1  name=Trial 1
  1b770e90-9ad9-44ba-b66b-152f71c40b9a  slug=trial2  name=Trial2
  5b078b52-55c9-4612-8f86-96038c198bfe  slug=vltest2  name=VLTEST2

PER-TENANT calculation_results:
  almacenes-mirasol: rows=1360 nonEmptyAttainment=1360 nonZeroOverall=0 minPayout=0 maxPayout=32401
  banco-cumbre-litoral: rows=510 nonEmptyAttainment=510 nonZeroOverall=0 minPayout=184 maxPayout=1775
  casa-diaz: 0 rows
  cascade-revenue-partners: 0 rows
  diestra-grupo-empresarial: 0 rows
  meridian-logistics-group: rows=201 nonEmptyAttainment=201 nonZeroOverall=0 minPayout=585 maxPayout=6484
  mx-restaurant: 0 rows
  robles-maquinaria: 0 rows
  sabor-grupo: rows=60 nonEmptyAttainment=60 nonZeroOverall=0 minPayout=0 maxPayout=33215.95
  test-a1: 0 rows
  tomi-test-1: 0 rows
  tomi-test-2: 0 rows
  tomico: 0 rows
  trial-1: 0 rows
  trial2: 0 rows
  vltest2: 0 rows

SAMPLE attainment JSONB (prefer non-zero overall):
  (only 0 non-zero-overall rows platform-wide; padding with any rows)
  tenant=almacenes-mirasol batch=8a96d64e-db8c-4b6f-a634-53e23dbadbd8 period=9415b2e4-1827-4f3a-a7f0-b0ddcdadedb1 entity=711d57c0-2919-44f9-83df-c1d26d54e979 total_payout=1
    attainment={"overall":0}
  tenant=almacenes-mirasol batch=8a96d64e-db8c-4b6f-a634-53e23dbadbd8 period=9415b2e4-1827-4f3a-a7f0-b0ddcdadedb1 entity=549ddd05-c471-4d85-8d89-a6937510baf3 total_payout=1
    attainment={"overall":0}
  tenant=almacenes-mirasol batch=8a96d64e-db8c-4b6f-a634-53e23dbadbd8 period=9415b2e4-1827-4f3a-a7f0-b0ddcdadedb1 entity=96ef0063-82ce-49d1-9bfb-9065d9b35adc total_payout=1
    attainment={"overall":0}

ATTAINMENT KEY SHAPES (sample up to 1000 rows platform-wide):
  keys=[overall] x940
  keys=[bonus,commission,total] x40
  keys=[tier,tier_key,weighted_score] x20

entity_period_outcomes.attainment_summary shapes (sample up to 1000):
  keys=[overall] x983

SAMPLE components JSONB (one row, first tenant with rows):
  tenant=almacenes-mirasol entity=711d57c0-2919-44f9-83df-c1d26d54e979 period=d3c6229b-359c-4af2-8579-9f2c4874a5ab total_payout=0
  components count=1
  components[0]={"payout":0,"details":{},"componentId":"incentivo-cobranza","componentName":"Tasa de Incentivo por Cobranza","componentType":"prime_dag"}
  metrics keys=[]
  attainment={"overall":0}

ALTERNATE-SHAPE attainment samples:
  [has total] tenant=sabor-grupo batch=ac82b514-10c1-4696-8f8f-734ecb012a83 period=849991e5-396e-4b06-ba39-c760383bad1b entity=71fc117a-35ae-4357-8ff4-98dba9dc2140 total_payout=16401.18
    attainment={"bonus":500,"total":16401.18,"commission":15901.18}
  [has total] tenant=sabor-grupo batch=ac82b514-10c1-4696-8f8f-734ecb012a83 period=849991e5-396e-4b06-ba39-c760383bad1b entity=8ab55e2e-5834-497f-be49-72854e969577 total_payout=33215.95
    attainment={"bonus":500,"total":33215.95,"commission":32715.95}
  [has weighted_score] tenant=sabor-grupo batch=ac82b514-10c1-4696-8f8f-734ecb012a83 period=849991e5-396e-4b06-ba39-c760383bad1b entity=998232f0-d0be-4c55-85b2-590bacec5198 total_payout=0
    attainment={"tier":"Destacado","tier_key":"destacado","weighted_score":73.08}
  [has weighted_score] tenant=sabor-grupo batch=ac82b514-10c1-4696-8f8f-734ecb012a83 period=849991e5-396e-4b06-ba39-c760383bad1b entity=d6dafed7-6822-41e1-a24f-88c14c1fd3a0 total_payout=0
    attainment={"tier":"Destacado","tier_key":"destacado","weighted_score":83.47}

SAMPLE full row (banco-cumbre-litoral, non-zero payout):
  entity=e939a648-0831-446d-a1e4-e7f466213a74 period=ee85490b-8ca5-4a64-a343-14399b8d9dc9 batch=9a5b5081-5df9-4c85-8381-cb5dd2b31aab total_payout=1155
  components=[{"payout":480,"details":{},"componentId":"c1-colocacion-senior","componentName":"Colocación de Crédito","componentType":"prime_dag"},{"payout":400,"details":{},"componentId":"c2-captacion-senior","componentName":"Captación de Depósitos","componentType":"prime_dag"},{"payout":125,"details":{},"componentId":"c3-productos-cruzados-senior","componentName":"Productos Cruzados","componentType":"prime_dag"},{"payout":150,"details":{},"componentId":"c4-cumplimiento-senior","componentName":"Cumplimiento Regulatorio","componentType":"prime_dag"}]
  metrics={"_rowIndex":4,"Meta_Depositos":45000,"Meta_Colocacion":150000,"Monto_Colocacion":176814.26,"Pct_Meta_Depositos":1.2829,"Depositos_Nuevos_Netos":57729.22,"Indice_Calidad_Cartera":0.8882,"Cumplimiento_Colocacion":1.1788,"Infracciones_Regulatorias":0,"Cantidad_Productos_Cruzados":5}
  attainment={"overall":0}
```

**Provenance of the alternate shapes:** the 60 sabor-grupo rows (`{bonus,commission,total}` and `{tier,tier_key,weighted_score}`) were written by the demo seed script, NOT the engine — `/Users/AndrewAfrica/spm-platform/web/scripts/frmx/p6-calc.ts:44,57`:
```ts
      attainment:{ weighted_score:weighted, tier:tier[0], tier_key:tier[1] }, metadata:{module:'financial'} });
...
      attainment:{ commission:r2(comm), bonus, total:payout }, metadata:{module:'icm'} });
```

### 5. Assessment — node-level attainment-distribution summary (Decision 158: consume, never re-derive)

A node-level distribution (min/p25/median/mean/p75/max, count-below-threshold, count-above-threshold over a node's leaf population) requires, per leaf entity, ONE scalar attainment value, plus the node→leaf entity mapping (readable from `entity_relationships` / entity hierarchy — consumption, not derivation). Against the observed shapes:

- **Over `total_payout`: YES, purely by reading.** `total_payout` is a non-null numeric on every live row (2,131 rows across 4 tenants, min 0 / max 33,215.95). Percentiles, mean, and threshold counts are pure aggregation over existing rows.
- **Over attainment via `calculation_results.attainment`: NO — the column is informationally empty.** The engine-written shape is exactly `{"overall": <number>}` where `overall = allEntityMetrics['attainment'] ?? 0` (`route.ts:3346`), and `allEntityMetrics` keys are literal source column names (`aggregateMetrics`, `run-calculation.ts:426-444`). Live proof: `nonZeroOverall=0` on all 2,071 engine-written rows in every tenant. Any distribution computed from this key today would summarize a constant zero. `entity_period_outcomes.attainment_summary` is a verbatim copy (`route.ts:3647`, `calculation-service.ts:587`) — same emptiness.
- **Over attainment via `calculation_results.metrics`: PARTIALLY, with a binding read.** Real attainment ratios DO survive in `metrics` under tenant-specific source column names (BCL sample: `"Cumplimiento_Colocacion":1.1788`, `"Pct_Meta_Depositos":1.2829`). A reader could compute a distribution purely by reading, but only if it also reads the plan's convergence bindings (`metadata.binding_snapshot.convergence_bindings_used` is persisted per row) to learn WHICH metric key is the attainment for which component — and the value is a per-entity SUM of row values (aggregateMetrics adds across rows), so for multi-row entities the summed ratio is not the entity's attainment. This is fragile consumption, not clean Decision-158 serving.
- **The computed-but-discarded signal:** the engine computes true per-component attainment (`metrics['attainment'] = actualValue / targetValue`, `route.ts:1762`) but the insert map (`route.ts:3481-3487`) persists components WITHOUT `metricValues`, and the row-level `attainment` object never receives it. The only persisted trace is deep inside `metadata.intentTraces[].inputs` (per-primitive shape, `intent-types.ts:276-295`) — technically readable but not a serving surface.
- **What a clean read-only distribution requires:** the write path must place the already-computed per-component attainment into the persisted record — e.g. `attainment: { overall, <componentId>: ratio }` or retain `metricValues` in `components[]` — a write-path change to `route.ts:3339-3361`/`3474-3491`. Once written, the node summary is pure consumption: read leaf rows' attainment scalars + node→leaf mapping, aggregate. No re-derivation of any calculation is needed or permitted.

**HALT-RISK:** (1) HALT-3-relevant — `calculation_results.attainment` is `{"overall": 0}` on 100% of engine-written rows platform-wide (probe: `nonZeroOverall=0` for almacenes-mirasol 1360, banco-cumbre-litoral 510, meridian-logistics-group 201; the only non-zero attainment JSONB is 60 seed-script rows in sabor-grupo from `scripts/frmx/p6-calc.ts`); the engine computes real attainment at `route.ts:1762` but discards it before persistence, so any OB-258 attainment-distribution surface consuming this column today would render constant zeros. (2) Proof-tenant gap — VLTEST2 (`5b078b52-55c9-4612-8f86-96038c198bfe`) has **0 calculation_results rows live**, so no attainment/payout evidence exists yet for the OB-258 proof tenant; a calculation run (HF-373 EPG-J, architect-pending) must land before any P-gate can read real VLTEST2 results.
---

## P0.4 — Capability + persona substrate

### 1. The PDP — capability enumeration and check structure

The single source of truth is `web/src/lib/auth/permissions.ts` ("DS-014 Permission Infrastructure — Single Source of Truth"). The PDP is **role → capability matrix in code** (`hasCapability(role, capability, tenantOverrides?)`), NOT a read of `profiles.capabilities`. The `profiles.capabilities` jsonb array is a **provision-time snapshot** written by the single writer (`deriveCapabilities(role)` → provision-user) and is consulted only by *server-side* gates that cannot run the in-app matrix cheaply (the enqueue route, pulse-load authz, and RLS) — i.e. the platform has **two capability substrates**: the code matrix (browser + middleware PDP) and the persisted jsonb (API-route + RLS PDP).

#### 1a. The complete `Capability` union (31 typed capabilities, verbatim)

`/Users/AndrewAfrica/spm-platform/web/src/lib/auth/permissions.ts:23-63`
```ts
export type Role = 'platform' | 'admin' | 'manager' | 'member' | 'viewer' | 'cda';

export type Capability =
  // Platform
  | 'platform.provision_tenant'
  | 'platform.view_all_tenants'
  | 'platform.access_observatory'
  | 'platform.system_config'
  // Tenant
  | 'tenant.manage_users'
  | 'tenant.configure_periods'
  | 'tenant.configure_entities'
  | 'tenant.view_settings'
  | 'tenant.edit_settings'
  // Data
  | 'data.import'
  | 'data.upload' // OB-247 DS-032: Customer Data Administrator — deliver a file via the focused portal
  | 'data.upload_storage'
  | 'data.calculate'
  | 'data.advance_lifecycle'
  | 'data.reconcile'
  | 'data.approve_results'
  | 'data.export'
  // View
  | 'view.all_results'
  | 'view.team_results'
  | 'view.own_results'
  | 'view.own_uploads' // OB-247 DS-032: CDA sees only their own deliveries
  | 'view.intelligence_stream'
  | 'view.all_entities'
  | 'view.team_entities'
  | 'view.audit_trail'
  // Dispute
  | 'dispute.submit'
  | 'dispute.resolve'
  // Statement
  | 'statement.view'
  // ICM
  | 'icm.configure_plans'
  | 'icm.view_plan_details'
  | 'icm.simulate';
```

**One capability exists LIVE but NOT in the typed union:** `platform.data_operations` (HF-355). It is declared as a raw string constant in `web/src/app/api/import/sci/enqueue/route.ts:27` and `web/src/lib/sci/pulse-load-authz.ts:13` and granted by migration directly into `profiles.capabilities` — it never passes through `deriveCapabilities`. The live probe (below) confirms all 3 platform profiles hold it, appended un-sorted at the end of the array.

#### 1b. Role → capability matrix (explicit, no inheritance)

`/Users/AndrewAfrica/spm-platform/web/src/lib/auth/permissions.ts:105-226` (abridged to the shape + the two smallest roles; platform/admin hold effectively everything, manager a governance subset, member/viewer view-only):
```ts
const ROLE_CAPABILITIES: Record<Role, Set<Capability>> = {
  platform: new Set<Capability>([ /* ALL 30 non-CDA-specific caps incl. platform.* */ ]),
  admin: new Set<Capability>([ /* everything except platform.* — 26 caps */ ]),
  manager: new Set<Capability>([
    'tenant.view_settings', 'data.approve_results',
    'view.team_results', 'view.own_results', 'view.intelligence_stream', 'view.team_entities',
    'dispute.submit', 'dispute.resolve', 'statement.view', 'icm.view_plan_details',
  ]),
  member: new Set<Capability>([
    'view.own_results', 'view.intelligence_stream', 'dispute.submit', 'statement.view',
  ]),
  viewer: new Set<Capability>([
    'view.own_results', 'view.intelligence_stream', 'statement.view',
  ]),
  // OB-247 DS-032 Slice A — Customer Data Administrator ...
  cda: new Set<Capability>([
    'data.upload',
    'view.own_uploads',
  ]),
};
```

#### 1c. The core PDP check

`/Users/AndrewAfrica/spm-platform/web/src/lib/auth/permissions.ts:248-270`
```ts
export function hasCapability(
  role: string,
  capability: Capability,
  tenantOverrides?: TenantPermissionOverrides
): boolean {
  const resolved = resolveRole(role);
  if (!resolved) return false;

  const base = ROLE_CAPABILITIES[resolved];

  if (tenantOverrides) {
    // Check revocations first
    if (tenantOverrides.revocations?.[resolved]?.includes(capability)) {
      return false;
    }
    // Then grants
    if (tenantOverrides.grants?.[resolved]?.includes(capability)) {
      return true;
    }
  }

  return base.has(capability);
}
```

Role aliases resolve first (`permissions.ts:96-99`): `vl_admin`→`platform` (via `PLATFORM_ROLE_VALUES` in resolve-identity.ts), `tenant_admin`→`admin`, `individual`/`sales_rep`→`member`.

#### 1d. The jsonb writer seam

`/Users/AndrewAfrica/spm-platform/web/src/lib/auth/permissions.ts:320-322`
```ts
export function deriveCapabilities(role: Role): string[] {
  return Array.from(getCapabilities(role)).sort();
}
```
Comment at :307-319: "`profiles.capabilities` is NEVER authored by hand … the single writer (provision-user) and any future per-tenant override layer call this."

#### 1e. Legacy co-resident PDP — role-permissions.ts (role-array, pre-DS-014)

`/Users/AndrewAfrica/spm-platform/web/src/lib/auth/role-permissions.ts:14-57` (still on disk, hardcoded role arrays — the file permissions.ts:11 says never to use):
```ts
// Workspace-level access (checked by middleware)
export const WORKSPACE_ACCESS: Record<string, string[]> = {
  '/admin':         ['platform'],
  '/operate':       ['platform', 'admin', 'tenant_admin'],
  ...
};
// Page-level access (checked by RequireRole HOC — finer grain)
export const PAGE_ACCESS: Record<string, string[]> = {
  '/admin/launch/calculate':       ['platform', 'admin'],
  ...
  '/data/import':                  ['platform', 'admin'],
};
// Action-level permissions (checked inline via useCanPerform)
export const ACTION_PERMISSIONS: Record<string, string[]> = {
  'import_data':     ['platform', 'admin', 'tenant_admin'],
  'run_calculation': ['platform', 'admin'],
  'approve_results': ['platform', 'admin', 'manager'],
  'publish_results': ['platform', 'admin'],
  'manage_users':    ['platform', 'admin'],
  'manage_tenants':  ['platform'],
  'toggle_features': ['platform'],
  'submit_dispute':  ['platform', 'admin', 'manager', 'viewer', 'sales_rep'],
  'view_team':       ['platform', 'admin', 'manager'],
  'export_payroll':  ['platform', 'admin'],
};
```
The current middleware imports `canAccessWorkspace` from **permissions.ts** (middleware.ts:25), not this file — role-permissions.ts is the legacy layer, but note the action strings (`manage_tenants`, `manage_team`-style verbs) still leak into live code paths (middleware.ts:360 checks `capabilities.includes('manage_tenants')`; derivePersona checks `manage_team`/`approve_outcomes` — see §3).

### 2. The four PEPs — one concrete enforcement example each

#### 2a. PEP-1: Middleware (workspace + tenant-feature gates)

`/Users/AndrewAfrica/spm-platform/web/src/middleware.ts:383-404`
```ts
  // ── DS-014: CAPABILITY-BASED WORKSPACE AUTHORIZATION ──
  if (isRestrictedWorkspace(pathname)) {
    let role = user.user_metadata?.role as string | undefined
      || user.app_metadata?.role as string | undefined;

    if (!role) {
      // HF-282: canonical reader ... On null, role stays undefined → allow through
      // (client-side RequireCapability catches), preserving prior behavior (DD-7).
      const identity = await resolveIdentity(supabase, user.id);
      role = identity?.role || undefined;
    }

    if (role) {
      const resolved = resolveRole(role);
      const roleToCheck = resolved || role;
      if (!canAccessWorkspace(roleToCheck, pathname)) {
        logAuthEvent('auth.permission.denied', { pathname, role: roleToCheck }, user.id);
        return noCacheResponse(NextResponse.redirect(new URL('/unauthorized', request.url)));
      }
    }
  }
```
It resolves prefixes via `WORKSPACE_CAPABILITIES` (`permissions.ts:332-343`):
```ts
export const WORKSPACE_CAPABILITIES: Record<string, Capability> = {
  '/admin': 'platform.system_config',
  '/operate': 'data.import',
  '/configure': 'tenant.edit_settings',
  '/configuration': 'tenant.edit_settings',
  '/govern': 'data.approve_results',
  '/data': 'data.import',
  '/portal': 'data.upload', // OB-247: the CDA focused portal (middleware workspace gate)
  '/stream': 'view.intelligence_stream',
  '/financial': 'view.team_results',
  '/approvals': 'data.approve_results',
};
```
A second middleware gate (OB-250/OB-252, middleware.ts:406-436) requires a **tenant feature** for exact path prefixes via `WORKSPACE_FEATURES` (`permissions.ts:357-391` — `/data/submit`→`prism_enabled`, `/financial`→`financial`, `/revenue`→`revenue_enabled`, `/operate/calculate` etc.→`compensation_enabled`, `/insights`→`intelligence_enabled`), reading `tenants.features` and failing closed.

#### 2b. PEP-2: Page-level guard (`RequireCapability` client component)

`/Users/AndrewAfrica/spm-platform/web/src/components/auth/RequireCapability.tsx:26-47`
```tsx
export function RequireCapability({ capability, fallback, children }: RequireCapabilityProps) {
  const { user, isLoading } = useAuth();
  // OB-252 Phase 3 / DS-014 §9: intersect role capabilities with the tenant's entitlement
  // (tenants.features) — deterministic, zero LLM. ...
  const features = useTenantFeaturesSafe();

  if (isLoading) {
    return fallback || <CapabilityGate reason="loading" />;
  }

  if (!user) {
    return fallback || <CapabilityGate reason="loading" />;
  }

  if (!hasCapability(user.role, capability, tenantEntitlementRevocations(features))) {
    return fallback || <CapabilityGate reason="denied" />;
  }

  return <>{children}</>;
}
```
Concrete usage — `/Users/AndrewAfrica/spm-platform/web/src/app/operate/import/page.tsx:670`
```tsx
    <RequireCapability capability="data.import">
```

#### 2c. PEP-3: API-route guard — `/api/import/sci/enqueue` gating on `platform.data_operations`

`/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/enqueue/route.ts:27,58-76`
```ts
const PLATFORM_DATA_OPERATIONS = 'platform.data_operations';
...
    // 2. Resolve the caller's profile (tenant_id + capabilities) and AUTHORIZE — before any write (I7).
    const { data: profile, error: profErr } = await service
      .from('profiles')
      .select('tenant_id, capabilities')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();
    if (profErr) {
      return NextResponse.json({ error: 'Could not resolve your profile to authorize the import.' }, { status: 500 });
    }
    const caps: string[] = Array.isArray(profile?.capabilities) ? (profile!.capabilities as string[]) : [];
    const isTenantMember = !!profile?.tenant_id && profile.tenant_id === tenantId;
    const isPlatformOperator = caps.includes(PLATFORM_DATA_OPERATIONS);
    if (!isTenantMember && !isPlatformOperator) {
      // Refuse — explicit, actionable. Nothing was written (I7: no handle opened on this branch).
      return NextResponse.json({
        error: 'Not authorized to import for this tenant. A platform operator needs the platform.data_operations capability; a tenant member can import only their own tenant.',
        code: 'ENQUEUE_FORBIDDEN',
      }, { status: 403 });
    }
```
Note: **this PEP reads `profiles.capabilities` jsonb directly** (not the role matrix). The same pattern is shared by `web/src/lib/sci/pulse-load-authz.ts` (pulse-load state/rollback/resume routes).

#### 2d. PEP-4: RLS — the HF-355 capability-gated `processing_jobs` policy

`/Users/AndrewAfrica/spm-platform/web/supabase/migrations/20260629_hf355_platform_data_operations.sql:29-58`
```sql
UPDATE profiles
SET capabilities = capabilities || '["platform.data_operations"]'::jsonb,
    updated_at = now()
WHERE role = 'platform'
  AND NOT (capabilities @> '["platform.data_operations"]'::jsonb);

-- 2. Capability-gated WRITE policy on processing_jobs. ... Keys on the
--    CAPABILITY, never on tenant_id IS NULL (I3). ...
DROP POLICY IF EXISTS "Platform operators can manage processing jobs" ON processing_jobs;
CREATE POLICY "Platform operators can manage processing jobs"
  ON processing_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["platform.data_operations"]'::jsonb
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["platform.data_operations"]'::jsonb
    )
  );
```

### 3. Persona derivation and the existing personas

Persona is a **visual/intent token derived from role + capabilities**, hoisted per HF-345 so scope lives in auth-context. Derivation:

`/Users/AndrewAfrica/spm-platform/web/src/contexts/persona-context.tsx:45-64`
```ts
function derivePersona(user: User | null, capabilities: string[]): PersonaKey {
  if (!user) return 'rep';

  // VL Platform Admin or tenant admin
  if (user.role === 'platform' || user.role === 'admin') return 'admin';

  // Manager capability or manages relationships
  if (
    capabilities.includes('manage_team') ||
    capabilities.includes('approve_outcomes')
  ) {
    return 'manager';
  }

  // Also check role-based detection for managers
  if (user.role === 'manager') return 'manager';

  // Default: individual contributor
  return 'rep';
}
```
Note: `manage_team` and `approve_outcomes` are **not in the `Capability` union and appear in zero live profiles** (probe below) — the capability branch is dead; role decides in practice.

**Existing persona tokens (the enumeration)** — `/Users/AndrewAfrica/spm-platform/web/src/lib/design/tokens.ts:17-59` (abridged):
```ts
export const PERSONA_TOKENS = {
  admin:   { ... intent: 'Govern',   intentDescription: 'Governance & System Health' },
  manager: { ... intent: 'Acelerar', intentDescription: 'Development & Acceleration' },
  rep:     { ... intent: 'Crecer',   intentDescription: 'Mastery & Progress' },
} as const;

export type PersonaKey = keyof typeof PERSONA_TOKENS;
```
So the persona universe today is: **`admin` | `manager` | `rep`** (PersonaKey), plus **`all`** as an agent_inbox wildcard value, plus **`cda`** as a role-level persona with its own landing but NO PERSONA_TOKENS entry.

**agent_inbox.persona consumer** — `/Users/AndrewAfrica/spm-platform/web/src/app/api/platform/agent-inbox/route.ts:16-20,38-44`:
```ts
// OB-246 5c: a caller may read inbox items only for personas at or below their authenticated role —
function gateInboxPersona(requested: string, role: string): string {
  if (['platform', 'vl_admin', 'admin'].includes(role)) return requested; // any
  if (role === 'manager') return requested === 'admin' ? 'manager' : requested; // not admin
  return 'rep'; // member / viewer / sales_rep → own only
}
...
    .from('agent_inbox')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`persona.eq.${persona},persona.eq.all`)
```

**Per-persona landing** — `/Users/AndrewAfrica/spm-platform/web/src/lib/auth/landing.ts:16-19`:
```ts
export function landingPathForRole(role: string | null | undefined): string {
  if (resolveRole(role ?? '') === 'cda') return '/portal';
  return '/stream';
}
```

### 4. Per-tenant capability grants — the overlay

The seam exists in the PDP (`permissions.ts:232-237`):
```ts
export interface TenantPermissionOverrides {
  /** Additional capabilities granted to specific roles for this tenant */
  grants?: Partial<Record<Role, Capability[]>>;
  /** Capabilities revoked from specific roles for this tenant */
  revocations?: Partial<Record<Role, Capability[]>>;
}
```
**The ONLY production feeder of this seam is entitlement-derived REVOCATION** — there is NO grant path and NO per-tenant per-role capability store anywhere (no table, no UI). `/Users/AndrewAfrica/spm-platform/web/src/lib/navigation/workspace-config.ts:617-674` (abridged):
```ts
export function tenantEntitlementRevocations(
  features: Record<string, unknown> | null | undefined,
): TenantPermissionOverrides {
  const isWorkspaceEntitled = (wsId: WorkspaceId): boolean => {
    const ws = WORKSPACES[wsId];
    if (!ws.featureFlag) return true; // ungated (Platform Core) → always entitled
    return isFeatureEnabled(features, ws.featureFlag);
  };
  // Structural ownership, derived from WORKSPACES routes (no hardcoded capability→agent map):
  ...
  // A capability owned solely by de-entitled agents cannot be exercised by ANY role in that tenant —
  // apply the same revocation list across every canonical role.
  const revocations: Partial<Record<Role, Capability[]>> = {};
  for (const role of CANONICAL_ROLES) revocations[role] = revokedCaps;
  return { revocations };
}
```
So "which role gets which capability in tenant T" = `ROLE_CAPABILITIES[role]` MINUS capabilities whose owning workspaces are all de-entitled by `tenants.features`. The `grants` half of the seam is declared but unused. The one true per-profile grant that exists live (`platform.data_operations`) was applied by SQL migration outside the seam.

### 5. Live probe (FP-49) — `web/scripts/_ob258_p04_caps_probe.ts`

Probe script left on disk at `/Users/AndrewAfrica/spm-platform/web/scripts/_ob258_p04_caps_probe.ts` (SELECT-only). Output, verbatim:

```
=== tenants (id, name, slug) ===
972c8eb0-e3ae-4e4c-ad30-8b34804c893a  Almacenes Mirasol  slug=almacenes-mirasol
b1c2d3e4-aaaa-bbbb-cccc-111111111111  Banco Cumbre del Litoral  slug=banco-cumbre-litoral
2d9979ba-5032-48a7-bccf-1928f3e6dadf  Casa Diaz  slug=casa-diaz
e44bbcb1-2710-4880-8c7d-a1bd902720b7  Cascade Revenue Partners  slug=cascade-revenue-partners
a5da0cee-f76d-4f75-b091-53e64821ac9d  Diestra Grupo Empresarial  slug=diestra-grupo-empresarial
5035b1e8-0754-4527-b7ec-9f93f85e4c79  Meridian Logistics Group  slug=meridian-logistics-group
3d354bfa-b298-48dd-88a0-9f8c5a00be4e  MX Restaurant  slug=mx-restaurant
74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2  Robles Maquinaria  slug=robles-maquinaria
f7093bcc-e90b-4918-9680-69da7952dd65  Sabor Grupo Gastronomico  slug=sabor-grupo
abb9da8d-d6d5-4ebc-af42-ebb9c972bd8b  Test #A1  slug=test-a1
03d28288-700b-43e3-a96b-49a4f849d2df  Tomi Test #1  slug=tomi-test-1
2fdbebce-aa80-4c5a-b37b-aad2e281baf5  Tomi Test #2  slug=tomi-test-2
07638678-d141-429f-a902-6200addb2dc7  TomiCo  slug=tomico
dbe3b308-1483-4cd8-8032-6fdd4a8a8f5c  Trial 1  slug=trial-1
1b770e90-9ad9-44ba-b66b-152f71c40b9a  Trial2  slug=trial2
5b078b52-55c9-4612-8f86-96038c198bfe  VLTEST2  slug=vltest2
```

**VLTEST2 tenant id = `5b078b52-55c9-4612-8f86-96038c198bfe`.**

Profiles (15 rows; capability arrays abridged ONLY where identical to the admin matrix — the four notable rows verbatim):
```
=== profiles (15 rows) ===
9 × role=admin (Beti Moran/Diestra, Test User 100/VLTEST2, Richard Kern/Cascade, Eugenio/Trial 1,
  Jane doe/Tomi Test #2, Yo/Trial2, Jorge Ruiz/Mirasol, Carlos Mendoza/Sabor, Mario Gonzales/MX)
  — each with the 25-26-cap admin set, e.g.:

id=c2d0329a-1504-4643-8123-32b4459ee755
  role=admin  tenant_id=5b078b52-55c9-4612-8f86-96038c198bfe  display_name=Test User 100   <-- VLTEST2
  capabilities=["data.advance_lifecycle","data.approve_results","data.calculate","data.export","data.import","data.reconcile","data.upload_storage","dispute.resolve","dispute.submit","icm.configure_plans","icm.simulate","icm.view_plan_details","statement.view","tenant.configure_entities","tenant.configure_periods","tenant.edit_settings","tenant.manage_users","tenant.view_settings","view.all_entities","view.all_results","view.audit_trail","view.intelligence_stream","view.own_results","view.team_entities","view.team_results"]

id=698f8f0e-9f79-4408-af41-c83f2d2caf26
  role=cda  tenant_id=972c8eb0-e3ae-4e4c-ad30-8b34804c893a  display_name=CDA Demo
  capabilities=["data.upload","view.own_uploads"]

id=07fa3350-a7fb-4404-b983-86ab1b726174
  role=manager  tenant_id=f7093bcc-e90b-4918-9680-69da7952dd65  display_name=Ana Martínez
  capabilities=["data.approve_results","dispute.resolve","dispute.submit","icm.view_plan_details","statement.view","tenant.view_settings","view.intelligence_stream","view.own_results","view.team_entities","view.team_results"]

id=e555dff1-944e-448b-9407-6144a133f9f0
  role=member  tenant_id=f7093bcc-e90b-4918-9680-69da7952dd65  display_name=Diego Ramírez
  capabilities=["dispute.submit","statement.view","view.intelligence_stream","view.own_results"]

3 × role=platform  tenant_id=null  (VL Admin 9c179b53-c5ee-4af7-a36b-09f5db3e35f2,
  TD Admin ee18f0e5-db8b-4c81-b167-b9215811d87b, EO Admin bab0697b-812f-4995-ab61-a459520f9dd2)
  capabilities=[...29 matrix caps...,"platform.data_operations"]   <-- HF-355 grant present, appended unsorted
```
Live observations vs the code matrix:
- All 3 platform profiles hold `platform.data_operations` (HF-355 migration IS applied live).
- **Snapshot drift proven live:** only Beti Moran (provisioned post-OB-247) has `data.upload` in her admin array; the other 8 admin rows (incl. VLTEST2's Test User 100) lack it, though the CURRENT admin matrix includes it. Harmless for the in-app PDP (matrix-derived from role) but a live proof that `profiles.capabilities` is a provision-time snapshot: **any NEW capability added for OB-258 will exist in jsonb only for newly-provisioned profiles unless backfilled by migration** (the HF-355 pattern).
- VLTEST2 has exactly ONE profile: `Test User 100` (admin). No platform profile is tenant-bound to VLTEST2 (platform admins operate on it via the `vialuce-tenant-id` cookie).
- No live profile contains `manage_team`, `approve_outcomes`, or `manage_tenants` — the legacy capability strings read by `derivePersona` (persona-context.tsx:52-54) and middleware.ts:360 match nothing in the live data.

### 6. SCHEMA_REFERENCE_LIVE.md rows (relevant)

`/Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md:466` — profiles (11 columns):
```
| Column | Type | Nullable | Default |
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | YES | |
| auth_user_id | uuid | NO | |
| display_name | text | NO | |
| email | text | NO | |
| role | text | NO | viewer |
| capabilities | jsonb | NO | |
| locale | text | YES | |
| avatar_url | text | YES | |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
```
`/Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md:15` — agent_inbox (16 columns), persona column:
```
| persona | text | NO | admin |
```
(persona is free `text` defaulting to `'admin'` — values in use: admin|manager|rep|all; no CHECK constraint documented.)

**HALT-RISK:** none for reading the substrate as-is, but two concrete gaps for OB-258 O1 (new `target.*` capabilities + Revenue-leader persona), each evidenced above: (1) `profiles.capabilities` jsonb is a provision-time snapshot, not re-derived — live drift proven (8 of 9 admin profiles lack `data.upload`, added to the matrix by OB-247 after provisioning), so any new capability that must be readable by API-route/RLS PEPs (the enqueue/pulse-load/HF-355 pattern) requires a backfill migration, not just a matrix edit; (2) the persona universe is hard-coded to `admin|manager|rep` (`PERSONA_TOKENS`, `PersonaKey`, `gateInboxPersona`, `agent_inbox.persona` default `'admin'` with no enum/CHECK) and `derivePersona`'s capability branch keys on `manage_team`/`approve_outcomes` — strings absent from both the `Capability` union and every live profile — so a new persona cannot be expressed without touching tokens.ts + persona-context.tsx + gateInboxPersona + the agent_inbox writer conventions simultaneously.
---

## P0.5 — Module gating

### 1. How a module is determined enabled/disabled for a tenant

**Mechanism: `tenants.features` JSONB is the single source of truth**, read through ONE deterministic predicate with a `DEFAULT_FEATURES` fallback. There is no separate modules table.

**The canonical resolver** — `/Users/AndrewAfrica/spm-platform/web/src/lib/tenant/feature-flags.ts:19-40`:

```ts
import { DEFAULT_FEATURES } from '@/types/tenant';

const DEFAULTS = DEFAULT_FEATURES as unknown as Record<string, boolean | undefined>;

/**
 * Is the given tenant feature entitled?
 * Explicit boolean in `features` wins; otherwise the DEFAULT_FEATURES value; otherwise false
 * (fail-closed for any unknown key).
 */
export function isFeatureEnabled(
  features: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  const explicit = features?.[key];
  if (typeof explicit === 'boolean') return explicit;
  return DEFAULTS[key] === true;
}

/** The default entitlement for a feature key when a tenant has no explicit value (DEFAULT_FEATURES). */
export function isEntitledByDefault(key: string): boolean {
  return DEFAULTS[key] === true;
}
```

**The typed feature contract + defaults** — `/Users/AndrewAfrica/spm-platform/web/src/types/tenant.ts:40-80` (module flags relevant here; the file also carries 11 legacy camelCase billing-era keys):

```ts
  financial: boolean; // Financial Module - POS data analysis for restaurants
  // OB-250: PRISM data-acquisition capability ... Snake_case
  // key matches the canonical PRISM_FEATURE_KEY (lib/prism/capability.ts) — the directive's literal name.
  prism_enabled: boolean;
  // OB-252: AGENT-ENTITLEMENT gates for the two core agents ...
  intelligence_enabled: boolean; // gates the Intelligence (decide) workspace
  compensation_enabled: boolean; // gates the Compensation (calculate) workspace
  // OB-257: AGENT-ENTITLEMENT gate for the Revenue agent ...
  revenue_enabled: boolean; // gates the Revenue workspace
  ...
export const DEFAULT_FEATURES: TenantFeatures = {
  ...
  financial: false, // Disabled by default, enabled per tenant
  prism_enabled: false, // OB-250: PRISM off by default — platform admin enables per tenant
  intelligence_enabled: true, // OB-252: core agent — entitled by default (absent key → shown)
  compensation_enabled: true, // OB-252: core agent — entitled by default (absent key → shown)
  revenue_enabled: false, // OB-257: Revenue agent — licensable, default OFF, platform admin enables per tenant
};
```

**A module = a workspace declaring a `featureFlag`.** Declarations in `/Users/AndrewAfrica/spm-platform/web/src/lib/navigation/workspace-config.ts`:

```ts
// line 52  (decide / Intelligence workspace)
    featureFlag: 'intelligence_enabled',
// line 109 (calculate / Compensation workspace)
    featureFlag: 'compensation_enabled',
// line 200 (finance workspace)
    featureFlag: 'financial',
// line 246 (revenue workspace)
    featureFlag: REVENUE_FEATURE_KEY,
// line 291 (data-operations workspace)
    featureFlag: PRISM_FEATURE_KEY, // TENANT gate (prism_enabled)
```

**Call-site pattern 1 — client menu / workspace access (the two-gate composition)** — `/Users/AndrewAfrica/spm-platform/web/src/lib/navigation/role-workspaces.ts:68-75`:

```ts
export function canAccessWorkspace(role: UserRole, workspace: WorkspaceId, enabledFeatures?: Record<string, boolean>): boolean {
  const ws = WORKSPACES[workspace];
  // OB-252: default-on aware (isFeatureEnabled falls back to DEFAULT_FEATURES). Byte-identical for
  // the default-OFF agents (finance/prism: absent key → blocked); default-ON for the core agents
  // (decide/calculate: absent key → entitled, so existing tenants are not regressed).
  if (ws?.featureFlag && enabledFeatures && !isFeatureEnabled(enabledFeatures, ws.featureFlag)) return false;
  return getWorkspaceRoutesForRole(workspace, role, enabledFeatures).length > 0;
}
```

consumed by the sidebars — `/Users/AndrewAfrica/spm-platform/web/src/components/navigation/ChromeSidebar.tsx:181-185` (same pattern in `VialuceSidebar.tsx:62-64` and `mission-control/WorkspaceSwitcher.tsx:53`):

```ts
  // OB-250: single two-gate composition — getAccessibleWorkspaces now enforces the WORKSPACE-level
  // featureFlag (tenant gate) against currentTenant.features, so there is no per-sidebar .filter to drift.
  const accessibleWorkspaces = effectiveRole
    ? getAccessibleWorkspaces(effectiveRole as UserRole, (currentTenant?.features ?? {}) as Record<string, boolean>)
    : [];
```

Section-level gating inside a workspace — `/Users/AndrewAfrica/spm-platform/web/src/lib/navigation/workspace-config.ts:478-483`:

```ts
  return workspace.sections
    .filter(section => {
      if (!section.featureFlag) return true;        // not module-gated
      if (!enabledFeatures) return true;            // caller didn't supply features → capability-only
      return isFeatureEnabled(enabledFeatures, section.featureFlag); // OB-252: default-on aware (DEFAULT_FEATURES)
    })
```

**Call-site pattern 2 — server deep-link gate (middleware)** — path-prefix → feature map in `/Users/AndrewAfrica/spm-platform/web/src/lib/auth/permissions.ts:357-393`:

```ts
export const WORKSPACE_FEATURES: ReadonlyArray<{ prefix: string; feature: string }> = [
  { prefix: '/data/submit', feature: PRISM_FEATURE_KEY },
  { prefix: '/data/in-progress', feature: PRISM_FEATURE_KEY },
  { prefix: '/data-operations', feature: PRISM_FEATURE_KEY },
  ...
  { prefix: '/financial', feature: 'financial' },
  ...
  { prefix: '/revenue', feature: 'revenue_enabled' },
  ...
  { prefix: '/operate/calculate', feature: 'compensation_enabled' },
  { prefix: '/operate/reconciliation', feature: 'compensation_enabled' },
  { prefix: '/operate/results', feature: 'compensation_enabled' },
  { prefix: '/operate/pay', feature: 'compensation_enabled' },
  { prefix: '/operate/lifecycle', feature: 'compensation_enabled' },
  { prefix: '/approvals', feature: 'compensation_enabled' },
  { prefix: '/performance/adjustments', feature: 'compensation_enabled' },
  { prefix: '/configure/plans', feature: 'compensation_enabled' },
  { prefix: '/insights', feature: 'intelligence_enabled' },
  { prefix: '/acceleration', feature: 'intelligence_enabled' },
];
```

enforced in `/Users/AndrewAfrica/spm-platform/web/src/middleware.ts:406-436`:

```ts
  // ── OB-250: TENANT-FEATURE GATE (server-side deep-link protection — the second gate) ──
  ...
  const requiredFeature = requiredFeatureForPath(pathname);
  if (requiredFeature) {
    const identity = await resolveIdentity(supabase, user.id);
    const effectiveTenantId = identity?.canonicalRole === 'platform'
      ? (request.cookies.get('vialuce-tenant-id')?.value || identity?.tenantId || null)
      : (identity?.tenantId || null);
    let featureOn = false;
    if (effectiveTenantId) {
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('features')
        .eq('id', effectiveTenantId)
        .maybeSingle();
      const features = ((tenantRow?.features ?? {}) as Record<string, unknown>);
      featureOn = isFeatureEnabled(features, requiredFeature);
    }
    if (!featureOn) {
      logAuthEvent('auth.permission.feature_denied', { pathname, feature: requiredFeature }, user.id);
      return noCacheResponse(NextResponse.redirect(new URL('/unauthorized', request.url)));
    }
  }
```

**Call-site pattern 3 — functional API gate (per-module server helper, service-role read).** PRISM: `/Users/AndrewAfrica/spm-platform/web/src/lib/prism/tenant-feature.ts:14-23`:

```ts
export async function isPrismEnabledForTenant(tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return false;
  try {
    const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;
    const { data } = await sb.from('tenants').select('features').eq('id', tenantId).maybeSingle();
    return isPrismEnabled((data?.features ?? null) as Record<string, unknown> | null);
  } catch {
    return false; // fail-closed
  }
}
```

Revenue mirrors it: `/Users/AndrewAfrica/spm-platform/web/src/lib/revenue/tenant-feature.ts:15-24` (`isRevenueEnabledForTenant`, same shape via `isFeatureEnabled(..., REVENUE_FEATURE_KEY)`), used e.g. in `/Users/AndrewAfrica/spm-platform/web/src/app/api/revenue/insights/route.ts:38-40`:

```ts
  if (!(await isRevenueEnabledForTenant(tenantId))) {
    return NextResponse.json({ error: 'Revenue agent is not enabled for this tenant' }, { status: 403 });
  }
```

Note the PRISM predicate itself (`/Users/AndrewAfrica/spm-platform/web/src/lib/prism/capability.ts:21-33`) defines the canonical key + strict `=== true` read:

```ts
export const PRISM_FEATURE_KEY = 'prism_enabled' as const;
...
export function isPrismEnabled(features: FeatureBag): boolean {
  if (!features) return false;
  return (features as Record<string, unknown>)[PRISM_FEATURE_KEY] === true;
}
```

**Call-site pattern 4 — client layout/hook gates.** `/Users/AndrewAfrica/spm-platform/web/src/app/revenue/layout.tsx:16-22`:

```tsx
export default function RevenueLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate feature="revenue_enabled" redirectTo="/unauthorized">
      {children}
    </FeatureGate>
  );
}
```

and the hook `/Users/AndrewAfrica/spm-platform/web/src/contexts/tenant-context.tsx:306-311`:

```ts
export function useFeature(featureKey: keyof TenantConfig['features']): boolean {
  const { currentTenant } = useTenant();
  if (!currentTenant?.features) return false;
  const value = currentTenant.features[featureKey];
  return typeof value === 'boolean' ? value : !!value;
}
```

(NOTE: `useFeature` does NOT apply the DEFAULT_FEATURES fallback itself — the client tenant-context pre-merges defaults; the raw hook is fail-closed on absent key.)

**The writer** — the Observatory entitlement toggle, `/Users/AndrewAfrica/spm-platform/web/src/app/api/platform/tenants/[tenantId]/entitlement/route.ts` (PATCH): validates `featureKey` against the structurally-derived set, writes ONLY `tenants.features`, audits, and (OB-257) runs revenue activation inline on false→true:

```ts
    if (!toggleableFeatureKeys().includes(featureKey)) {
      return NextResponse.json(
        { error: `featureKey '${featureKey}' is not a toggleable agent entitlement`, allowed: toggleableFeatureKeys() },
        { status: 400 },
      );
    }
    ...
    const previous = isFeatureEnabled(features, featureKey);
    features[featureKey] = enabled;
    // ONLY features — no settings.billing mutation (decoupled, PRISM precedent).
    const { error: writeErr } = await supabase
      .from('tenants')
      .update({ features, updated_at: new Date().toISOString() })
      .eq('id', tenantId);
```

The toggleable set is derived, never hardcoded — `/Users/AndrewAfrica/spm-platform/web/src/lib/navigation/workspace-config.ts:588-603`:

```ts
export function getToggleableAgents(): ToggleableAgent[] {
  return Object.values(WORKSPACES)
    .filter((ws) => !!ws.featureFlag)
    .map((ws) => ({
      workspaceId: ws.id,
      label: ws.label,
      labelEs: ws.labelEs,
      featureKey: ws.featureFlag as string,
      entitledByDefault: isEntitledByDefault(ws.featureFlag as string),
    }));
}
```

Billing is a SEPARATE store: `/Users/AndrewAfrica/spm-platform/web/src/app/api/platform/tenants/[tenantId]/modules/route.ts` mutates `settings.billing.modules` (+ legacy camelCase `features` keys), decoupled from entitlement (live evidence: BCL/Trial 1 carry `settings.billing.modules.tfi`).

### 2. Capability namespacing by module (DS-014 §3.7)

Capabilities are dot-namespaced strings; the namespace is the segment before the first `.`. The role→capability matrix — `/Users/AndrewAfrica/spm-platform/web/src/lib/auth/permissions.ts:25-63`:

```ts
export type Capability =
  // Platform
  | 'platform.provision_tenant'
  | 'platform.view_all_tenants'
  | 'platform.access_observatory'
  | 'platform.system_config'
  // Tenant
  | 'tenant.manage_users'
  ...
  // Data
  | 'data.import'
  | 'data.upload'
  ...
  // View
  | 'view.all_results'
  ...
  // ICM
  | 'icm.configure_plans'
  | 'icm.view_plan_details'
  | 'icm.simulate';
```

**How the namespace interacts with module gating** — capability↔module intersection is DERIVED structurally: a capability is revoked for a tenant iff every workspace owning it is de-entitled; a routeless capability inherits its module namespace's ownership. `/Users/AndrewAfrica/spm-platform/web/src/lib/navigation/workspace-config.ts:617-674` (`tenantEntitlementRevocations`):

```ts
  // Structural ownership, derived from WORKSPACES routes (no hardcoded capability→agent map):
  //   capOwners — the workspaces whose routes require capability C exactly.
  //   nsOwners  — the workspaces whose routes use ANY capability in the module namespace (the prefix
  //               before the first '.'), so a routeless capability (e.g. icm.simulate) inherits its
  //               module's ownership — the DS-014 §9 "module-aware" notion.
  ...
        const ns = cap.split('.')[0];
        if (!nsOwners.has(ns)) nsOwners.set(ns, new Set());
        nsOwners.get(ns)!.add(ws.id);
  ...
  universe.forEach((cap) => {
    const direct = capOwners.get(cap);
    if (direct && direct.size > 0) {
      // Gates ≥1 route → revoke iff every owning workspace is de-entitled (shared caps survive).
      if (allOwnersDeEntitled(direct)) revokedCaps.push(cap);
    } else if (allOwnersDeEntitled(nsOwners.get(cap.split('.')[0]))) {
      // Routeless → module-namespace fallback (icm.* without a route still dies with Compensation;
      // a namespace co-owned by an entitled workspace, e.g. data.*/view.* via Platform Core, survives).
      revokedCaps.push(cap);
    }
  });
```

**Second, parallel capability store (DB-side):** `platform.data_operations` lives in `profiles.capabilities` (JSONB array), NOT in the TS `Capability` union — granted by migration `/Users/AndrewAfrica/spm-platform/web/supabase/migrations/20260629_hf355_platform_data_operations.sql:29-58`:

```sql
UPDATE profiles
SET capabilities = capabilities || '["platform.data_operations"]'::jsonb,
    updated_at = now()
WHERE role = 'platform'
  AND NOT (capabilities @> '["platform.data_operations"]'::jsonb);

DROP POLICY IF EXISTS "Platform operators can manage processing jobs" ON processing_jobs;
CREATE POLICY "Platform operators can manage processing jobs"
  ON processing_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["platform.data_operations"]'::jsonb
    )
  ) ...
```

and checked in-route as a raw string — `/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/enqueue/route.ts:27,67-76` (same pattern in `lib/sci/pulse-load-authz.ts:13`):

```ts
const PLATFORM_DATA_OPERATIONS = 'platform.data_operations';
...
    const caps: string[] = Array.isArray(profile?.capabilities) ? (profile!.capabilities as string[]) : [];
    const isTenantMember = !!profile?.tenant_id && profile.tenant_id === tenantId;
    const isPlatformOperator = caps.includes(PLATFORM_DATA_OPERATIONS);
    if (!isTenantMember && !isPlatformOperator) {
      return NextResponse.json({
        error: 'Not authorized to import for this tenant. A platform operator needs the platform.data_operations capability; a tenant member can import only their own tenant.',
        code: 'ENQUEUE_FORBIDDEN',
      }, { status: 403 });
    }
```

So there are TWO capability seams: (a) the role-derived matrix (`hasCapability`, permissions.ts:248-270, with `TenantPermissionOverrides` revocations fed by `tenantEntitlementRevocations`), and (b) per-profile `profiles.capabilities` JSONB checked directly (HF-355 class). Module gating (features) intersects only with seam (a).

### 3. How the Intelligence module is gated today

- **Flag:** `intelligence_enabled` — DEFAULT-ON (`DEFAULT_FEATURES.intelligence_enabled = true`, types/tenant.ts:77). Workspace binding at workspace-config.ts:49-52:

```ts
    // OB-252 Phase 3: the Intelligence agent is entitlement-gated like Finance/PRISM. Gate key is the
    // DEDICATED 'intelligence_enabled' (DEFAULT_FEATURES = true → ENTITLED by default; absent on every
    // existing tenant → none regressed; decoupled from any billing key). Only an explicit Observatory
    // toggle-off hides it.
    featureFlag: 'intelligence_enabled',
```

- **Server deep-link gates:** only `/insights` and `/acceleration` (permissions.ts:391-392, pasted above). `/stream` (the Intelligence landing) is DELIBERATELY ungated — permissions.ts comment: "NEVER /stream (the universal landing, Decision 128)".
- **Client gate example (Revenue↔Intelligence interaction):** `/Users/AndrewAfrica/spm-platform/web/src/components/revenue/InsightSlot.tsx:49,60`:

```ts
  const intelligenceEnabled = useFeature('intelligence_enabled');
  ...
    if (!intelligenceEnabled) return; // upsell placeholder — no fetch, no computation
```

- **NO functional API gate exists for Intelligence.** Unlike PRISM/Revenue there is no `lib/intelligence/tenant-feature.ts`; grep for `intelligence_enabled` outside nav/types/tests hits ONLY `InsightSlot.tsx`. The OB-232 insight engine writes/deletes `intelligence_artifacts` with no feature check (`/Users/AndrewAfrica/spm-platform/web/src/lib/insight/insight-engine.ts:199,240` — `sb.from('intelligence_artifacts').delete()...` / `.insert({...})`), and `/api/revenue/insights` gates on `revenue_enabled` only (route.ts:38).
- **Other module flags that exist:** `prism_enabled` (default OFF), `financial` (default OFF), `revenue_enabled` (default OFF), `compensation_enabled` (default ON), plus 11 legacy camelCase keys (billing-era: `compensation`, `performance`, `salesFinance`, `transactions`, `forecasting`, `gamification`, `learning`, `coaching`, `whatsappIntegration`, `mobileApp`, `apiAccess`).

### 4. Live probe (slug: p05_modules)

Probe script (left on disk): `/Users/AndrewAfrica/spm-platform/web/scripts/_ob258_p05_modules_probe.ts`. Output — ALL 16 rows verbatim:

```
tenants rows: 16
---
id: 972c8eb0-e3ae-4e4c-ad30-8b34804c893a
name: Almacenes Mirasol
slug: almacenes-mirasol
features: {"coaching":true,"learning":true,"apiAccess":true,"financial":true,"mobileApp":true,"forecasting":true,"performance":true,"compensation":true,"gamification":true,"salesFinance":true,"transactions":true,"whatsappIntegration":true}
settings: {"industry":"Retail","timezone":"America/Lima","admin_name":"Jorge Ruiz","admin_email":"jruiz@MIR.Pr","country_code":"PE","display_name":"MIR","primary_color":"#85c346"}
---
id: b1c2d3e4-aaaa-bbbb-cccc-111111111111
name: Banco Cumbre del Litoral
slug: banco-cumbre-litoral
features: {"financial":false,"compensation":false,"prism_enabled":false,"revenue_enabled":true}
settings: {"billing":{"modules":{"tfi":{"enabled":true,"license":199}},"platform_fee":299,"monthly_total":498,"bundle_discount":0},"industry":"Banking","country_code":"EC"}
---
id: 2d9979ba-5032-48a7-bccf-1928f3e6dadf
name: Casa Diaz
slug: casa-diaz
features: {"coaching":true,"learning":true,"apiAccess":true,"financial":false,"mobileApp":true,"forecasting":true,"performance":true,"compensation":true,"gamification":true,"salesFinance":true,"transactions":true,"prism_enabled":false,"whatsappIntegration":true}
settings: {"industry":"Manufacturing","logo_url":"https://www.casadiaz.com.mx/imagenes/logo-casa-diaz.jpg","timezone":"America/Mexico_City","admin_name":"CD POC User","admin_email":"aafrica@vialuce.ai","country_code":"MX","display_name":"CD-POC","primary_color":"#fed500"}
---
id: e44bbcb1-2710-4880-8c7d-a1bd902720b7
name: Cascade Revenue Partners
slug: cascade-revenue-partners
features: {"coaching":false,"learning":false,"apiAccess":false,"mobileApp":false,"forecasting":true,"performance":true,"compensation":true,"gamification":false,"salesFinance":true,"transactions":true,"whatsappIntegration":false}
settings: {"industry":"Manufacturing","timezone":"America/Chicago","admin_name":"Richard Kern","admin_email":"admin@crp.com","country_code":"US","display_name":"CRP MFG","primary_color":"#ae5f1e"}
---
id: a5da0cee-f76d-4f75-b091-53e64821ac9d
name: Diestra Grupo Empresarial
slug: diestra-grupo-empresarial
features: {"coaching":true,"learning":true,"apiAccess":true,"financial":true,"mobileApp":true,"forecasting":true,"performance":true,"compensation":true,"gamification":true,"salesFinance":true,"transactions":true,"whatsappIntegration":true}
settings: {"industry":"Manufacturing","timezone":"America/Mexico_City","admin_name":"Beti Moran","admin_email":"bmoran@vialuce.com","country_code":"MX","display_name":"DGE","primary_color":"#1e40af"}
---
id: 5035b1e8-0754-4527-b7ec-9f93f85e4c79
name: Meridian Logistics Group
slug: meridian-logistics-group
features: {"coaching":false,"learning":false,"apiAccess":false,"mobileApp":false,"forecasting":true,"performance":true,"compensation":true,"gamification":false,"salesFinance":true,"transactions":true,"whatsappIntegration":false}
settings: {"industry":"Manufacturing","timezone":"America/Mexico_City","admin_name":"Lucia Mendez","admin_email":"admin@vialuce.ai","country_code":"MX","display_name":"MeridianLG","primary_color":"#1eae55"}
---
id: 3d354bfa-b298-48dd-88a0-9f8c5a00be4e
name: MX Restaurant
slug: mx-restaurant
features: {"coaching":false,"learning":false,"apiAccess":false,"financial":true,"mobileApp":true,"forecasting":false,"performance":true,"compensation":true,"gamification":true,"salesFinance":false,"transactions":true,"whatsappIntegration":true}
settings: {"industry":"Hospitality","timezone":"America/Mexico_City","admin_name":"Mario Gonzales","admin_email":"aafrica@vialuce.ai","country_code":"MX","display_name":"RestMXCo","primary_color":"#1e40af"}
---
id: 74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2
name: Robles Maquinaria
slug: robles-maquinaria
features: {"coaching":true,"learning":true,"apiAccess":true,"financial":true,"mobileApp":true,"forecasting":true,"performance":true,"compensation":true,"gamification":true,"salesFinance":true,"transactions":true,"prism_enabled":true,"whatsappIntegration":true}
settings: {"industry":"Manufacturing","timezone":"America/Mexico_City","admin_name":"RM ADMIN","admin_email":"aafrica@vialuce.ai","country_code":"MX","display_name":"Robles","primary_color":"#e5db6c"}
---
id: f7093bcc-e90b-4918-9680-69da7952dd65
name: Sabor Grupo Gastronomico
slug: sabor-grupo
features: {"icm":true,"import":true,"disputes":true,"financial":true,"reconciliation":true}
settings: {"hq_city":"Mazatlán","modules":["icm","financial"],"hq_state":"Sinaloa","industry":"Restaurant Franchise","financial_config":{"brands":["Cocina Dorada","Taco Veloz","Mar y Brasa"],"tax_rate":0.16,"pos_format":"softrestaurant_23col","shift_definitions":{"night":{"end":"07:00","start":"23:00"},"morning":{"end":"15:00","start":"07:00"},"afternoon":{"end":"23:00","start":"15:00"}}}}
---
id: abb9da8d-d6d5-4ebc-af42-ebb9c972bd8b
name: Test #A1
slug: test-a1
features: {"coaching":false,"learning":false,"apiAccess":false,"mobileApp":false,"forecasting":false,"performance":true,"compensation":true,"gamification":false,"salesFinance":false,"transactions":true,"whatsappIntegration":false}
settings: {"industry":"Technology","timezone":"America/Mexico_City","admin_name":"TomTest #A1","admin_email":"tomdelcarlo@gmail.com","country_code":"MX","display_name":"Test #A1","primary_color":"#1e40af"}
---
id: 03d28288-700b-43e3-a96b-49a4f849d2df
name: Tomi Test #1
slug: tomi-test-1
features: {"coaching":false,"learning":false,"apiAccess":false,"mobileApp":false,"forecasting":false,"performance":true,"compensation":true,"gamification":true,"salesFinance":true,"transactions":true,"whatsappIntegration":false}
settings: {"industry":"Retail","timezone":"America/Mexico_City","admin_name":"Test John","admin_email":"tdelcarlo@vialuce.ai","country_code":"MX","display_name":"Tomi LLC","primary_color":"#1ea5ae"}
---
id: 2fdbebce-aa80-4c5a-b37b-aad2e281baf5
name: Tomi Test #2
slug: tomi-test-2
features: {"coaching":false,"learning":false,"apiAccess":false,"mobileApp":false,"forecasting":true,"performance":true,"compensation":true,"gamification":false,"salesFinance":true,"transactions":true,"whatsappIntegration":false}
settings: {"industry":"Manufacturing","timezone":"America/Mexico_City","admin_name":"Jane doe","admin_email":"tomdelcarlo@gmail.com","country_code":"MX","display_name":"Tomi C-corp","primary_color":"#1ea5ae"}
---
id: 07638678-d141-429f-a902-6200addb2dc7
name: TomiCo
slug: tomico
features: {"coaching":false,"learning":false,"apiAccess":false,"financial":false,"mobileApp":true,"forecasting":false,"performance":true,"compensation":true,"gamification":false,"salesFinance":false,"transactions":true,"whatsappIntegration":false}
settings: {"industry":"Hospitality","timezone":"America/Mexico_City","admin_name":"Tomi Delcarlo","admin_email":"tdelcarlo@vialuce.ai","country_code":"MX","display_name":"TCo","primary_color":"#1e40af"}
---
id: dbe3b308-1483-4cd8-8032-6fdd4a8a8f5c
name: Trial 1
slug: trial-1
features: {"coaching":true,"learning":true,"apiAccess":true,"financial":true,"mobileApp":true,"forecasting":true,"performance":true,"compensation":false,"gamification":true,"salesFinance":true,"transactions":true,"whatsappIntegration":true}
settings: {"billing":{"modules":{"tfi":{"enabled":true,"license":199}},"platform_fee":299,"monthly_total":498,"bundle_discount":0},"industry":"Other","timezone":"Europe/Madrid","admin_name":"Eugenio","admin_email":"ecoliden@gmail.com","country_code":"GB","display_name":"Trial 1","primary_color":"#1e40af"}
---
id: 1b770e90-9ad9-44ba-b66b-152f71c40b9a
name: Trial2
slug: trial2
features: {"coaching":true,"learning":true,"apiAccess":false,"financial":true,"mobileApp":false,"forecasting":true,"performance":true,"compensation":true,"gamification":true,"salesFinance":true,"transactions":true,"whatsappIntegration":false}
settings: {"industry":"Technology","timezone":"Europe/Madrid","admin_name":"Yo","admin_email":"eoliden@vialuce.ai","country_code":"GB","display_name":"Trial2","primary_color":"#1e40af"}
---
id: 5b078b52-55c9-4612-8f86-96038c198bfe
name: VLTEST2
slug: vltest2
features: {"coaching":true,"learning":true,"apiAccess":true,"financial":false,"mobileApp":true,"forecasting":true,"performance":true,"compensation":true,"gamification":true,"salesFinance":true,"transactions":true,"prism_enabled":false,"whatsappIntegration":true}
settings: {"industry":"Technology","timezone":"America/New_York","admin_name":"Test User 100","admin_email":"TU100@vialuce.ai","country_code":"ES","display_name":"VLTEST2","primary_color":"#1e40af"}
```

**Live-state readings (via the `isFeatureEnabled` semantics):**
- `intelligence_enabled`: EXPLICIT on ZERO tenants → default-ON for ALL 16 (every tenant has Intelligence entitled today, including VLTEST2).
- `compensation_enabled`: EXPLICIT on ZERO tenants → default-ON for all 16 (the legacy billing `compensation:false` on BCL/Trial 1 does NOT disable the agent — dedicated-key design working as intended).
- `prism_enabled`: true ONLY on Robles Maquinaria; explicitly false on BCL, Casa Diaz, VLTEST2. (Memory's "VLTEST2/Robles are the only prism_enabled tenants" is STALE — VLTEST2 is now false live.)
- `revenue_enabled`: true ONLY on Banco Cumbre del Litoral; absent (→ default OFF) everywhere else including VLTEST2.
- `financial`: true on Almacenes Mirasol, Diestra, MX Restaurant, Robles, Sabor, Trial 1, Trial2.
- Anomaly: Sabor Grupo's `features` uses a pre-contract shape (`{"icm":true,"import":true,"disputes":true,"financial":true,"reconciliation":true}`) plus a `settings.modules` ARRAY — keys like `icm`/`import` match NO code path (fail-closed unknown-key rule applies; only `financial` is read).
- Proof tenant VLTEST2 id: `5b078b52-55c9-4612-8f86-96038c198bfe`.

### 5. SCHEMA_REFERENCE_LIVE.md — tenants

`/Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md:637-652`:

```
### tenants (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| name | text | NO | |
| slug | text | NO | |
| settings | jsonb | NO | |
| hierarchy_labels | jsonb | NO | |
| entity_type_labels | jsonb | NO | |
| features | jsonb | NO | |
| locale | text | NO | en |
| currency | text | NO | USD |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
```

Live probe confirms `features` and `settings` exist and are populated as documented (no drift on this table).

**HALT-RISK:** (1) Proof tenant VLTEST2 (5b078b52-55c9-4612-8f86-96038c198bfe) has `revenue_enabled` ABSENT (→ default OFF) and `prism_enabled:false` live — any OB-258 surface hung off the Revenue module needs an entitlement toggle (PATCH /api/platform/tenants/[id]/entitlement) before an activation proof on VLTEST2; only BCL has `revenue_enabled:true` today. (2) Intelligence has NO functional API-level gate to reuse — no `isIntelligenceEnabledForTenant` helper exists (grep: `intelligence_enabled` call sites outside nav/types/tests = InsightSlot.tsx only), and insight-engine.ts:199/240 writes `intelligence_artifacts` ungated — new module-gated Action Cards (O4) must add their own functional gate. (3) Two parallel capability stores: the TS `Capability` union/role matrix (permissions.ts:25-63) vs `profiles.capabilities` JSONB (`platform.data_operations`, HF-355 migration) — module-gating intersection (`tenantEntitlementRevocations`) covers ONLY the former, so a new `target.*` capability must choose its seam deliberately.
---


## P0.6 — Materialization precedent

### 1. OB-237 MSP materializations: `summary_artifacts` and `summary_artifacts_fine`

#### (a) Definition — migrations and DDL provenance

**Finding on provenance:** neither table's `CREATE TABLE` exists in `web/supabase/migrations/` — both were architect-applied in the Supabase SQL Editor (SR-44). The repo carries: the OB-229 migration (compute **function** + indexes, table pre-existing), the OB-237 spec DDL for the fine table (architect gate), and — the newest MSP-family precedent — the OB-257 `summary_rollups` migration whose `CREATE TABLE` **is** repo-tracked. All three pasted below; live existence is probe-confirmed in the probe section.

`/Users/AndrewAfrica/spm-platform/web/supabase/migrations/20260622_ob229_summary_engine.sql:1-33,73-79` (the aggregation function + read-path indexes over `summary_artifacts`; idempotent tenant-replace):

```sql
-- OB-229 — Summary Engine: domain-agnostic import-time aggregation.
-- SR-44: authored by CC, APPLIED BY THE ARCHITECT in the Supabase SQL Editor. Not run by CC.
--
-- Aggregates committed_data.row_data into summary_artifacts at import time so visualization surfaces
-- read O(1) instead of fetching+aggregating raw rows on every page load (the 97s / 164MB defect).
...
CREATE OR REPLACE FUNCTION compute_summary_artifacts(p_tenant_id uuid)
RETURNS TABLE (artifacts_written integer, rows_skipped integer)
...
  -- idempotent replace (Constraint 6)
  DELETE FROM summary_artifacts WHERE tenant_id = p_tenant_id;
...
GRANT EXECUTE ON FUNCTION compute_summary_artifacts(uuid) TO service_role;

-- Read-path index: visualization surfaces filter by tenant + (entity|date) + data_type.
CREATE INDEX IF NOT EXISTS idx_summary_artifacts_tenant_date
  ON summary_artifacts (tenant_id, data_type, summary_date);
CREATE INDEX IF NOT EXISTS idx_summary_artifacts_tenant_entity
  ON summary_artifacts (tenant_id, entity_id, data_type);
```

`summary_artifacts` schema as recorded at OB-237 completion — `/Users/AndrewAfrica/spm-platform/docs/completion-reports/OB-237_COMPLETION_REPORT.md:86-93` (PG-SCHEMA):

```
id uuid · tenant_id uuid · entity_id uuid · summary_date date(string) · period_id (null)
data_type text · metrics jsonb · row_count int · convergence_hash (null) · computed_at · created_at
sample metrics (lowercase raw keys): { mesa, folio, total, pagado, propina, tarjeta, efectivo,
  subtotal, ..., total_descuentos, total_cortesias, cancelado, + OB-237 derived:
  cancelled_revenue, cancelled_count, discount_count, comp_count }
```

`summary_artifacts_fine` DDL (architect-applied per the ARCHITECT GATE) — `/Users/AndrewAfrica/spm-platform/docs/diagnostics/OB-237_FINER_MATERIALIZATION_SPEC.md:46-58`:

```
**(ii) Sibling `summary_artifacts_fine` (entity, mesero, date, hour):**
summary_artifacts_fine (
  id uuid pk, tenant_id uuid, entity_id uuid,
  mesero_id text,          -- the server (row_data.mesero_id)
  summary_date date,       -- row_data.fecha::date
  hour smallint,           -- extract(hour from row_data.fecha)  (0-23)
  data_type text,          -- 'pos_cheque'
  metrics jsonb,           -- SUM of all numeric row_data fields for this (entity,mesero,date,hour)
  row_count int,           -- cheque count for the bucket
  computed_at timestamptz, created_at timestamptz
)
-- indexes: (tenant_id, entity_id), (tenant_id, mesero_id), (tenant_id, summary_date)
```

and its architect gate — `/Users/AndrewAfrica/spm-platform/docs/completion-reports/OB-237_COMPLETION_REPORT.md:113`:

```
**CREATE `summary_artifacts_fine`** (schema modeled on `summary_artifacts` above, **plus `mesero_id text`, `hour smallint`**, grain (entity, mesero, date, hour); the OB-237 conditional metrics carry into its `metrics`) **AND the aggregation RPCs** ... **Both needed, one SQL Editor session.**
```

The newest MSP-family table with a repo-tracked migration — `/Users/AndrewAfrica/spm-platform/web/supabase/migrations/20260704_ob257_summary_rollups.sql:1-51`:

```sql
-- OB-257 — summary_rollups: domain-agnostic period/dimension-grain materialization store (MSP family).
-- SR-44: authored by CC, APPLIED BY THE ARCHITECT in the Supabase SQL Editor. Not run by CC.
...
-- Writers own a data_type namespace and idempotently replace ONLY their own namespace — this table is not
-- subject to the summary-engine tenant-wide wipe.
...
create table if not exists public.summary_rollups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_id uuid references public.periods(id) on delete cascade,
  summary_date date,
  data_type text not null,           -- writer-owned namespace (open vocabulary, AP-26)
  entity_id uuid references public.entities(id) on delete cascade,
  dimension_role text,               -- recognized semantic role for dimension-grain rows
  dimension_member text,             -- dimension member value (tenant data)
  metrics jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
...
-- Concurrency guard: concurrent materializer runs (finalize-import / entitlement toggle / activate)
-- race delete-then-insert -- without this, the second writer silently DOUBLES every rollup a reader
-- sums. The unique grain makes the second inserter fail LOUDLY instead; the idempotent re-run heals.
-- coalesce() folds the nullable grain columns to sentinels so NULL <> NULL cannot admit duplicates.
create unique index if not exists uq_summary_rollups_grain
  on public.summary_rollups (
    tenant_id, data_type,
    coalesce(period_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(dimension_role, ''), coalesce(dimension_member, '')
  );
```

#### (b) WRITER — write-time, in the finalize path

`summary_artifacts` is computed and written **at import finalize** (after committed_data + entity resolution, before the job stamps done) — `/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/finalize-import/route.ts:129-143`:

```typescript
    // 4. OB-229: pre-compute summary_artifacts now that committed_data is written AND entity resolution
    //    is done (step 1). Production path is the SQL RPC (fast); JS fallback until the RPC is applied.
    //    Awaited (HF-300 reliability model — post-response work dies on Vercel).
    let summary: { written: number; skipped: number; via: 'rpc' | 'js' } | null = null;
    try {
      summary = await runSummaryEngine(supabase, tenantId, trace);
      trace(`summary-engine-done via=${summary.via} written=${summary.written} skipped=${summary.skipped}`);
    } catch (err) {
      // HF-373 Phase F (D8): a summary failure SURFACES — loud in the log AND on the job record
      // (metadata.summary_error) — never a silent pass. The import itself still completes (summaries
      // are derived data; /api/admin/summary-backfill re-runs deterministically).
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SCI Finalize] summary engine failed:', msg);
      await markJobsByProposal(supabase, tenantId, proposalId, { summaryError: msg });
    }
```

The engine entry point (RPC when no comprehension, JS path when comprehension maps exist) — `/Users/AndrewAfrica/spm-platform/web/src/lib/summary/summary-engine.ts:308-331`:

```typescript
/**
 * Engine entry point (import-trigger + admin API). OB-233: recognize labels+methods (cached), then read
 * the comprehension maps. A tenant WITH comprehension takes the JS path (semantic keys + method-aware,
 * fail-loud). A tenant WITHOUT comprehension keeps the fast raw-key SQL RPC (unchanged from OB-229).
 */
export async function runSummaryEngine(
  sb: SupabaseClient,
  tenantId: string,
  log: (m: string) => void = () => {},
): Promise<{ written: number; skipped: number; via: 'rpc' | 'js' }> {
  ...
  const { labelMap, methodMap } = await buildSemanticMaps(sb, tenantId);
  if (Object.keys(labelMap).length === 0 && Object.keys(methodMap).length === 0) {
    const rpc = await runSummaryEngineRpc(sb, tenantId);
    if (rpc) return { ...rpc, via: 'rpc' };
  }
  const js = await backfillSummariesJs(sb, tenantId, labelMap, methodMap, log);
  return { written: js.written, skipped: js.skipped, via: 'js' };
}
```

with the JS writer's idempotent replace at `/Users/AndrewAfrica/spm-platform/web/src/lib/summary/summary-engine.ts:283-301`:

```typescript
  const { error: delErr } = await sb.from('summary_artifacts').delete().eq('tenant_id', tenantId);
  if (delErr) throw new Error(`summary_artifacts delete: ${delErr.message}`);
  ...
    const { error } = await sb.from('summary_artifacts').insert(batch);
    if (error) throw new Error(`summary_artifacts insert: ${error.message}`);
```

`summary_artifacts_fine` (and its third-tier rollup data_types) is populated **at materialization time by per-tenant admin scripts** — NOT yet wired into finalize-import — `/Users/AndrewAfrica/spm-platform/web/scripts/ob237-populate-fine-sabor.ts:15,115-127`:

```typescript
 * Idempotent: delete summary_artifacts_fine WHERE tenant_id=Sabor, then insert (batch 500).
...
  const { error: delErr } = await sb.from('summary_artifacts_fine').delete().eq('tenant_id', SABOR);
  if (delErr) throw new Error(`delete: ${delErr.message}`);
...
    const { error } = await sb.from('summary_artifacts_fine').insert(batch);
    if (error) throw new Error(`insert: ${error.message}`);
```

and the rollup tier (`staff_rollup`/`patterns_rollup` data_types, namespace-scoped delete) — `/Users/AndrewAfrica/spm-platform/web/scripts/ob237-populate-rollups-sabor.ts:130-135`:

```typescript
    const { error } = await sb.from('summary_artifacts_fine').delete().eq('tenant_id', SABOR).eq('data_type', dt);
...
    const { error } = await sb.from('summary_artifacts_fine').insert(all.slice(i, i + 500));
```

The strongest write-time precedent for OB258 is the **OB-248 period-outcomes sentinel**, written inside the calculation run immediately after outcomes materialize — `/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:3678-3731` (step 9b):

```typescript
  // ── 9b. OB-237 T-AGG / OB-248: write-time period-rollup sentinel ──
  // The O(1) period rollup the serving layer reads (summary_artifacts data_type='period_outcomes';
  // getPeriodTotal / getComponentTotals / getPeriodRollup, intelligence-data.ts:58). It was previously
  // populated ONLY by per-tenant scripts ... Materializing it HERE
  // makes EVERY calc serve O(1) with no separate script ...
  if (!outcomeWriteErr && outcomeRows.length > 0) {
    ...
    const sentinelRow = {
      tenant_id: tenantId,
      entity_id: outcomeRows[0].entity_id,   // FK host: a real entity in the period (entity_id NOT NULL)
      summary_date: null as string | null,   // informational; getPeriodRollup selects by (period_id, data_type)
      period_id: periodId,
      data_type: 'period_outcomes',
      metrics: {
        total_payout: sentinelTotal,
        entity_count: outcomeRows.length,
        component_totals: componentTotals,
        component_totals_by_name: componentTotalsByName,
        component_entity_counts_by_name: componentEntityCountsByName,
      } as unknown as Json,
      row_count: outcomeRows.length,
    };
    // idempotent per-period replace — does NOT touch other periods or the data_type='transaction' namespace.
    const saTable = supabase as unknown as SupabaseClient;
    await saTable.from('summary_artifacts').delete()
      .eq('tenant_id', tenantId).eq('data_type', 'period_outcomes').eq('period_id', periodId);
    const { error: sentErr } = await saTable.from('summary_artifacts').insert(sentinelRow as unknown as Json);
    if (sentErr) addLog(`WARNING: period_outcomes sentinel write failed: ${sentErr.message}`);
```

#### (c) READER — serving by lookup, zero aggregation

Single-row sentinel lookup (no reduce at all) — `/Users/AndrewAfrica/spm-platform/web/src/lib/insights/intelligence-data.ts:57-101`:

```typescript
/** Read the one period-rollup sentinel row for (tenant, period), or null if it hasn't been materialized. */
async function getPeriodRollup(
  tenantId: string,
  periodId: string,
  sb: SupabaseClient<Database>,
): Promise<PeriodRollup | null> {
  if (!tenantId || !periodId) return null;
  const { data } = await (sb as any)
    .from('summary_artifacts')
    .select('metrics')
    .eq('tenant_id', tenantId)
    .eq('data_type', 'period_outcomes')
    .eq('period_id', periodId)
    .limit(1);
  ...
}
...
export async function getPeriodTotal(
  ...
  if (scopeCanViewAll(scope)) {
    const rollup = await getPeriodRollup(tenantId, periodId, sb);
    if (rollup) return rollup.total_payout; // one row, no reduce
  }
```

Fine-table lookup reader (indexed, predicate pushed into the query) — `/Users/AndrewAfrica/spm-platform/web/src/app/api/financial/data/route.ts:113-158`:

```typescript
// OB-237 T-FIN: summary_artifacts_fine reader (entity, mesero/sub_entity, date, hour grain).
// The fine sibling materialization unblocks the sub-entity / hourly modes (staff, location_detail
// staff-section, patterns, server_detail) that the (entity, day) summary_artifacts cannot serve.
...
async function getFineArtifacts(
  sb: SupabaseClient,
  tenantId: string,
  q: { entityId?: string; subEntityId?: string } = {},
): Promise<FineArtifact[]> {
  ...
    let query = sb
      .from('summary_artifacts_fine')
      .select('entity_id, sub_entity_id, summary_date, hour, metrics, row_count')
      .eq('tenant_id', tenantId)
      .eq('data_type', 'pos_cheque');
    if (q.entityId) query = query.eq('entity_id', q.entityId);
    if (q.subEntityId) query = query.eq('sub_entity_id', q.subEntityId);
```

and the pre-aggregated rollup-tier reader (display-grain rows, ~40-140 rows, zero multi-row reduces) — `/Users/AndrewAfrica/spm-platform/web/src/app/api/financial/data/route.ts:160-166,174-197`:

```typescript
// OB-237 RESIDUAL: write-time rollup reader (the THIRD materialization tier). staff_rollup (per
// location×mesero, ~40 rows) and patterns_rollup (per entity×day-of-week, ~140 rows) are pre-aggregated
// from summary_artifacts_fine at materialization time so the staff/patterns surfaces read a small set
// instead of reducing 88K fine rows in JS.
...
async function getRollupRows(
  sb: SupabaseClient,
  tenantId: string,
  dataType: string,
  entityId?: string,
): Promise<RollupRow[]> {
  ...
    let query = sb
      .from('summary_artifacts_fine')
      .select('entity_id, sub_entity_id, metrics, row_count')
      .eq('tenant_id', tenantId)
      .eq('data_type', dataType);
```

### 2. Secondary precedent: `entity_period_outcomes` and `period_entity_state`

DDL — `/Users/AndrewAfrica/spm-platform/web/supabase/migrations/004_materializations.sql:136-151` and `:11-23`:

```sql
CREATE TABLE entity_period_outcomes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id             UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  period_id             UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  total_payout          NUMERIC(15,2) NOT NULL DEFAULT 0,
  rule_set_breakdown    JSONB NOT NULL DEFAULT '[]',
  component_breakdown   JSONB NOT NULL DEFAULT '[]',
  lowest_lifecycle_state TEXT NOT NULL DEFAULT 'DRAFT',
  attainment_summary    JSONB NOT NULL DEFAULT '{}',
  metadata              JSONB NOT NULL DEFAULT '{}',
  materialized_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, entity_id, period_id)
);
```

```sql
CREATE TABLE period_entity_state (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  period_id       UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  resolved_attributes JSONB NOT NULL DEFAULT '{}',
  resolved_relationships JSONB NOT NULL DEFAULT '[]',
  entity_type     TEXT NOT NULL,
  status          TEXT NOT NULL,
  materialized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, entity_id, period_id)
);
```

**Writer: `entity_period_outcomes`** — written at the end of every calculation run (step 9, delete-then-insert per tenant+period) — `/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:3631-3660`:

```typescript
  // ── 9. Materialize entity_period_outcomes ──
  const outcomeRows = entityResults.map(r => ({
    tenant_id: tenantId,
    entity_id: r.entity_id,
    period_id: r.period_id,
    total_payout: r.total_payout,
    lowest_lifecycle_state: 'PREVIEW',
    ...
  }));

  // Delete existing outcomes for this tenant+period first
  await supabase
    .from('entity_period_outcomes')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId);

  // OB-75: Batched insert for 22K+ outcomes
  ...
    const { error: outErr } = await supabase
      .from('entity_period_outcomes')
      .insert(slice);
```

Service-layer twin (lifecycle-transition materializer, same delete-then-insert) — `/Users/AndrewAfrica/spm-platform/web/src/lib/supabase/calculation-service.ts:519` (`materializeEntityPeriodOutcomes`), write at `:594-620`:

```typescript
  // Upsert: delete existing for this period, then insert new
  if (outcomes.length > 0) {
    await supabase
      .from('entity_period_outcomes')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId);
    ...
      const { error } = await supabase.from('entity_period_outcomes').insert(chunk);
      if (error) throw error;
```

**Writer: `period_entity_state`** — written during the same calc run (OB-177 temporal-attribute materialization, delete-then-insert per tenant+period) — `/Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts:2102-2118`:

```typescript
      // Write to period_entity_state for audit trail
      if (materializedState.size > 0) {
        await supabase.from('period_entity_state').delete().eq('tenant_id', tenantId).eq('period_id', periodId);
        const pesRows = Array.from(materializedState.entries()).map(([entityId, resolved]) => ({
          tenant_id: tenantId,
          entity_id: entityId,
          period_id: periodId,
          resolved_attributes: resolved as Json,
          ...
        }));
        const PES_BATCH = 1000;
        for (let i = 0; i < pesRows.length; i += PES_BATCH) {
          await supabase.from('period_entity_state').insert(pesRows.slice(i, i + PES_BATCH));
        }
      }
```

(secondary writer: `/Users/AndrewAfrica/spm-platform/web/src/lib/supabase/entity-service.ts:250` `await supabase.from('period_entity_state').insert(insertRows);`)

### SCHEMA_REFERENCE_LIVE.md rows

`/Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md:8`:

```
> - `summary_artifacts` — **LIVE but undocumented here** (11 cols: id, tenant_id, entity_id, summary_date, period_id, data_type, metrics, row_count, convergence_hash, computed_at, created_at). OB-229 migration applied.
```

`/Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md:252-266` documents `entity_period_outcomes` (11 columns, `UNIQUE` grain via table DDL) and `:374-386` documents `period_entity_state` (9 columns) — both match the live probe column lists below. `summary_artifacts_fine` is NOT documented in SCHEMA_REFERENCE_LIVE.md at all (stale gap — FP-49 live verification below covers it).

### Live probe (slug: p06_msp)

Script: `/Users/AndrewAfrica/spm-platform/web/scripts/_ob258_p06_msp_probe.ts` (left on disk). Output:

```
=== OB-258 P0.6 MSP materialization probe ===

TENANTS (full list):
  972c8eb0-e3ae-4e4c-ad30-8b34804c893a  Almacenes Mirasol  (slug=almacenes-mirasol)
  b1c2d3e4-aaaa-bbbb-cccc-111111111111  Banco Cumbre del Litoral  (slug=banco-cumbre-litoral)
  2d9979ba-5032-48a7-bccf-1928f3e6dadf  Casa Diaz  (slug=casa-diaz)
  e44bbcb1-2710-4880-8c7d-a1bd902720b7  Cascade Revenue Partners  (slug=cascade-revenue-partners)
  a5da0cee-f76d-4f75-b091-53e64821ac9d  Diestra Grupo Empresarial  (slug=diestra-grupo-empresarial)
  5035b1e8-0754-4527-b7ec-9f93f85e4c79  Meridian Logistics Group  (slug=meridian-logistics-group)
  3d354bfa-b298-48dd-88a0-9f8c5a00be4e  MX Restaurant  (slug=mx-restaurant)
  74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2  Robles Maquinaria  (slug=robles-maquinaria)
  f7093bcc-e90b-4918-9680-69da7952dd65  Sabor Grupo Gastronomico  (slug=sabor-grupo)
  abb9da8d-d6d5-4ebc-af42-ebb9c972bd8b  Test #A1  (slug=test-a1)
  03d28288-700b-43e3-a96b-49a4f849d2df  Tomi Test #1  (slug=tomi-test-1)
  2fdbebce-aa80-4c5a-b37b-aad2e281baf5  Tomi Test #2  (slug=tomi-test-2)
  07638678-d141-429f-a902-6200addb2dc7  TomiCo  (slug=tomico)
  dbe3b308-1483-4cd8-8032-6fdd4a8a8f5c  Trial 1  (slug=trial-1)
  1b770e90-9ad9-44ba-b66b-152f71c40b9a  Trial2  (slug=trial2)
  5b078b52-55c9-4612-8f86-96038c198bfe  VLTEST2  (slug=vltest2)

MSP TABLES (existence + column list):
  summary_artifacts: EXISTS (11 cols)
    cols: id, tenant_id, entity_id, summary_date, period_id, data_type, metrics, row_count, convergence_hash, computed_at, created_at
  summary_artifacts_fine: EXISTS (13 cols)
    cols: id, tenant_id, entity_id, sub_entity_id, summary_date, hour, period_id, data_type, metrics, row_count, convergence_hash, computed_at, created_at
  summary_rollups: EXISTS (12 cols)
    cols: id, tenant_id, period_id, summary_date, data_type, entity_id, dimension_role, dimension_member, metrics, row_count, computed_at, created_at
  entity_period_outcomes: EXISTS (11 cols)
    cols: id, tenant_id, entity_id, period_id, total_payout, rule_set_breakdown, component_breakdown, lowest_lifecycle_state, attainment_summary, metadata, materialized_at
  period_entity_state: EXISTS (9 cols)
    cols: id, tenant_id, entity_id, period_id, resolved_attributes, resolved_relationships, entity_type, status, materialized_at

ROW COUNTS PER TENANT:
  Almacenes Mirasol (972c8eb0-...): summary_artifacts=5429  summary_artifacts_fine=0  entity_period_outcomes=272  period_entity_state=0
  Banco Cumbre del Litoral (b1c2d3e4-...): summary_artifacts=516  summary_artifacts_fine=0  entity_period_outcomes=510  period_entity_state=510
  Casa Diaz (2d9979ba-...): summary_artifacts=0  summary_artifacts_fine=0  entity_period_outcomes=0  period_entity_state=0
  Meridian Logistics Group (5035b1e8-...): summary_artifacts=0  summary_artifacts_fine=0  entity_period_outcomes=201  period_entity_state=0
  Sabor Grupo Gastronomico (f7093bcc-...): summary_artifacts=2520  summary_artifacts_fine=88640  entity_period_outcomes=0  period_entity_state=0
  VLTEST2 (5b078b52-55c9-4612-8f86-96038c198bfe): summary_artifacts=85  summary_artifacts_fine=0  entity_period_outcomes=0  period_entity_state=0
  [all other tenants: 0 across all four tables]

SENTINEL / NAMESPACE CHECK — summary_artifacts data_type values per tenant (sample capped at 1000 rows/tenant):
  Almacenes Mirasol: transaction(1000)
  Banco Cumbre del Litoral: transaction(510), period_outcomes(6)
  Sabor Grupo Gastronomico: pos_cheque(1000)
  VLTEST2: transaction(85)

convergence_hash population check (summary_artifacts, first 5 non-null):
  (no rows with non-null convergence_hash)
```

**Proof tenant:** VLTEST2 = `5b078b52-55c9-4612-8f86-96038c198bfe` — 85 `summary_artifacts` rows (data_type='transaction', written by the finalize-import summary engine), 0 fine rows, 0 `entity_period_outcomes` (HF-373 EPG-J calc runs are architect-pending). BCL shows the full precedent stack live: per-entity summaries (510) + the `period_outcomes` sentinel rows (6) + per-entity outcomes (510) + period state (510).

### 3. The reusable pattern for OB258's cascade roll-up materialization

The contract established by the MSP family is: **(i) write-at-author-time** — the materialization is computed and written synchronously inside the authoring path itself (summary engine at `finalize-import` step 4; `entity_period_outcomes` + the `period_outcomes` sentinel at calculation-run steps 9/9b), awaited (HF-300: post-response work dies on Vercel), fail-loud-but-non-fatal (HF-373 D8: failure surfaces on the job record, the authoring operation still completes, a deterministic backfill re-runs it); **(ii) served-by-lookup** — readers do an indexed `.eq()` lookup keyed by (tenant_id, data_type[, period_id | entity_id | dimension]) and perform zero (sentinel: one row, "no reduce") or bounded-small aggregation — never a reduce over base rows; **(iii) idempotent namespace-scoped replace** — each writer owns a `data_type` namespace and delete-then-inserts ONLY its own namespace + grain (per tenant+period), never wiping siblings; OB-257's `summary_rollups` hardens this with a unique-grain index so racing materializers fail loudly instead of silently doubling; **(iv) grain keying, not hash keying, in current practice** — `convergence_hash` exists on both summary tables but is live-NULL everywhere; freshness is achieved by re-running the idempotent replace at every authoring event, so OB258's roll-up should key on its natural grain (tenant, data_type namespace, period/entity/dimension) with a unique-grain guard, and MUST be re-materialized inside every write path that changes its inputs (quota author/approve → recalc → re-roll-up), not on read. For period-grain or dimension-grain rows, `summary_rollups` (nullable `entity_id`, `dimension_role`/`dimension_member`) is the semantically honest home — `summary_artifacts.entity_id` is FK NOT NULL and the sentinel's borrowed-entity-id hack is explicitly "not extended" (20260704_ob257_summary_rollups.sql:7-10).

**HALT-RISK:** two evidence-backed gaps, neither blocking: (1) `summary_artifacts` and `summary_artifacts_fine` have NO repo-tracked `CREATE TABLE` migration — both were architect-applied in the SQL Editor (OB-229 header "APPLIED BY THE ARCHITECT"; OB-237 completion report ARCHITECT GATE line 113); live existence probe-confirmed, but any OB258 DDL modeled on them must be verified against the live column lists above, not migrations. (2) `summary_artifacts_fine` has no production write path — it is populated only by per-tenant scripts (`ob237-populate-fine-sabor.ts`, `ob237-populate-rollups-sabor.ts`), so the "write-at-author-time" precedent OB258 should copy is the finalize-import summary engine + the calc-run step 9/9b sentinel, not the fine tier; and `convergence_hash` is live-NULL in all rows, so generation/convergence keying is an aspiration in the schema, not a proven pattern.
---

## EPG P0 — Assessment and HALT evaluation

### HALT-1 (P0 grounding): NOT FIRED

All six streams (P0.1–P0.6) are grounded in current source with pasted excerpts and FP-49 live probes. A write path for target data has a clear, Decision-92-compliant place to be added (a `target.author`-gated API route writing `data_type='target'` rows through the platform's sanctioned committed_data seam, attaching to existing `periods` rows). P0 is complete; O1 is unblocked.

### Directive-premise deltas (evidence-backed; architect attention flagged where a §9 HALT will fire downstream)

**Δ1 — Attainment persistence gap (will fire HALT-3 at the O2 EPG unless treated as O2 scope).** `calculation_results.attainment` is `{"overall": 0}` on 100% of engine-written rows platform-wide (P0.3 probe: nonZeroOverall=0 across almacenes-mirasol 1360, banco-cumbre-litoral 510, meridian-logistics-group 201; the only non-zero shapes are 60 seed-script rows in sabor-grupo). The engine COMPUTES true per-component attainment (`run/route.ts:1762`, `metrics['attainment'] = actualValue / targetValue`) but the persisted `attainment` object never receives it (`route.ts:3346` reads `allEntityMetrics['attainment']`, which is non-zero only if a source column is literally named `attainment`). EPG O2 requires proving "`calculation_results.attainment` recomputed to the new ratio" — that proof gate is unpassable anywhere until the already-computed value is persisted. Persisting an engine-computed value is not a new calculation primitive (§11 stays intact) but IS a named engine-write-path behavior expansion (DD-7) — proposed disposition: in-scope for O2, named explicitly in the O2 Architecture Decision Record.

**Δ2 — Proof-tenant data state (HALT-3 tenant confirmation needed at the O0/O4 boundary per §2).** VLTEST2 live state: **zero** `data_type='target'` rows, **zero** `calculation_results` rows (HF-373 EPG-J calc run architect-pending), `revenue_enabled` absent (default OFF), `prism_enabled:false`, one admin profile (Test User 100). The §6A premise "the VLTEST2 seasonal target dataset proves the canvas" refers to data not yet in the database. Live tenants with usable evidence today: almacenes-mirasol (30 target rows + 1360 calc results), banco-cumbre-litoral (510 calc results, `revenue_enabled:true`, no target rows), tomi-test-1 (400 target rows, no calc results).

**Δ3 — No automatic target ingestion.** The post-HF-367/368 classifier (`expression-classifier.ts:119-180`) emits only `transaction`/`entity`/`reference` — never `target`. Fresh quota sheets reach `data_type='target'` only via the manual SCIProposal "Assign ▾" override. All 430 live target rows predate HF-367. Not an OB-258 blocker (O2.2 builds the platform's first in-product target write path), but the Target-SCI ingestion gap is a residual for the architect channel.

**Δ4 — Graph vocabulary and orientation (cascade design constraint).** VLTEST2's live graph (84/84 edges) carries free-text Spanish `relationship_type` values with child→parent orientation (source=subordinate), while every `'manages'` reader assumes parent→child; `profile_scope` materialization (single-hop, `'manages'`-only) derives zero scope from this graph. The O2.1/O3.1 cascade must consume edges structurally (Korean Test — no relationship-type word lists) and handle both orientations; scope derivation for the cascade needs new traversal logic, not the existing single-hop materializer.

**Δ5 — Persona universe is closed today.** `PersonaKey` = `admin|manager|rep` (tokens.ts), `derivePersona`'s capability branch keys on strings absent from both the Capability union and every live profile. O1.2's Revenue-leader persona is a named behavior expansion touching tokens.ts + persona-context.tsx + `gateInboxPersona` + agent_inbox conventions together.

**Δ6 — Two capability substrates.** The role→capability TS matrix (browser + middleware PDP) vs `profiles.capabilities` jsonb snapshot (API-route + RLS PDP; provision-time, drift proven live). New `target.*` capabilities that must be readable by API/RLS PEPs require the HF-355 backfill-migration pattern in addition to the matrix edit.

**Δ7 — Intelligence module has no functional API gate.** No `isIntelligenceEnabledForTenant` helper exists; `intelligence_enabled` is enforced only at nav/middleware/client-slot level. O4's module gating must add the functional server-side gate (mirroring the PRISM/Revenue `tenant-feature.ts` pattern).

**Δ8 — Materialization home.** The MSP contract is proven and reusable (write-at-author-time, served-by-lookup, idempotent namespace-scoped replace, unique-grain guard). `summary_rollups` (live, 12 cols, repo-tracked migration, writer-owned `data_type` namespace, nullable entity grain columns) is the semantically honest home for the cascade roll-up — using it avoids a new architect-applied table for the serving layer. `convergence_hash` is live-NULL everywhere; grain keying + idempotent replace is the operative freshness mechanism.

### HALT-2 / HALT-6 pre-checks

- HALT-2 (O1): the PDP seam (`permissions.ts` union + `ROLE_CAPABILITIES` + `deriveCapabilities`) accepts additive capabilities without touching any existing capability's enforcement — no early signal of a HALT-2 condition.
- HALT-6 (schema): every table this OB touches was live-verified this phase (committed_data 10/10 match, entity_relationships 13/13, calculation_results/entity_period_outcomes match, tenants match, summary_rollups live with 12 cols, summary_artifacts live 11 cols/undocumented-in-doc, summary_artifacts_fine live 13 cols/undocumented). No fabricated-schema risk carried forward.
