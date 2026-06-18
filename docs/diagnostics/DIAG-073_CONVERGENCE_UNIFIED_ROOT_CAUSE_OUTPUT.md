# DIAG-073 — Convergence Unified-Path Root-Cause Forensic — OUTPUT

**Type:** DIAGNOSTIC · READ-ONLY (no code changed; only this artifact + the directive are committed)
**Method:** Live source read at recorded HEAD + live DB queries (service-role). Adversarially verified by an independent agent panel (3 trace + 3 refute passes). **AUD-001 and all `docs/` extracts disqualified and unused.**
**Reconciliation-channel discipline:** This output reports code structure and observed runtime values verbatim. **No ground-truth payout values appear here** — the architect reconciles against ground truth in the architect channel.

---

## 1 — Reference (§3)

### 1.1 HEAD

```
$ git log --oneline -1
5400baa5 Merge pull request #545 from CCAFRICA/reapply-hf309-hf310

$ git log --oneline | grep -E "HF-302|HF-303"
968759fc HF-303: replace arbitrary 0.5 rollup-overlap threshold with relative strongest-membership derivation (Decision 110) + no-developer-numbers gate
e8d37b70 HF-302: convergence file-affinity (RC-1 data_type partition) + entity-key rollup (RC-3) + batch-selection at resolution (RC-2, no contract change)
```

**HEAD = `5400baa5`.** Contains HF-302 (`e8d37b70`) and HF-303 (`968759fc`) as required. (`dev`, `main`, and `origin/main` all point to `5400baa5`; the working tree reflects main's HEAD.)

**DIAG-073 collision check:** highest existing diagnostic is DIAG-072 (`DIAG-072_CONVERGENCE_WRONG_FILE_BINDING`). No `DIAG-073_*_OUTPUT.md` exists. **No collision.**

### 1.2 Live file inventory (HALT-B resolved)

| File | Lines | Note |
|---|---|---|
| `web/src/lib/intelligence/convergence-service.ts` | **3615** | **HALT-B:** the directive's guessed path `web/src/lib/sci/convergence-service.ts` is WRONG. Live path is `web/src/lib/intelligence/`. All §4/§5 findings reference the real path. |
| `web/src/app/api/calculation/run/route.ts` | 3272 | Engine (Track C, §7.3) |
| `web/src/lib/ai/providers/anthropic-adapter.ts` | — | `convergence_mapping` system prompt (§4.3) |
| `web/src/lib/calculation/intent-executor.ts` | — | DAG `reference`/`prior_period` primes (§7.3, Track B) |
| `web/src/types/convergence-bindings.ts` | 51 | Binding types |

### 1.3 CRR substrate (HALT-A NOT triggered — substrate is present and live)

```
$ ls web/src/lib/sci/{resolver,contextual-reliability,seed-priors}.ts
web/src/lib/sci/contextual-reliability.ts   web/src/lib/sci/resolver.ts   web/src/lib/sci/seed-priors.ts
```

`contextual-reliability.ts:1-3`:
```
// Contextual Reliability Lookup (CRL) — Decision 110
// Five levels: fingerprint → category → boundary → global → seed prior.
```

The OB-161/Decision-110 substrate exists. `contextualReliabilityLookup(...) → Promise<CRLResult>` and `resolveClassification(...)` are live. **Track A′ replacement authority therefore exists** (detailed in §3.4 below).

---

## 2 — Track A: Candidate Construction & Data_Type Matching (§4)

### 2.0 Empirical ground (§4.4) — the candidate universe (live DB, tenant `972c8eb0`)

All 75,227 `committed_data` rows share **one** `data_type = 'transaction'** across 14 import batches. The real file boundary is `row_data._sheetName`. Column sets per sheet (full union of `row_data` keys, live query):

| `_sheetName` | rows | columns (measure-relevant) | → Plan |
|---|---|---|---|
| `Cobranza_Enero..Junio` (6) | 51,533 | `Monto_Cobrado`, `Saldo_Pendiente` | Plan 3 (Cobranza) |
| `Ventas_Enero..Junio` (6) | 23,230 | `Monto_Total`, `Categoria`(text), `Cantidad`, `Precio_Unitario` | Plan 1 (Ventas) |
| `Ventas_Marzo` (subset) | — | + `Folio_Original`, `Fecha_Original`, `Motivo_Devolucion` | Plan 5 (Clawback) source |
| `Clientes_Nuevos` (1) | 434 | `Verificado`(text), `Pedidos_Primeros_60_Dias`(count) | Plan 4 (Cartera Nueva) |
| `Cuotas` (1) | 30 | `Enero_2025..Junio_2025` | Plan 2 (Bono Cuota) |

`entity_id_field` is `DNI_Vendedor` for most sheets (also `Almacen`; `Cuotas` uses `DNI`).

**This single fact reframes Track A:** HF-302's "RC-1 data_type partition / file affinity" partitions on `data_type`, but `data_type` is a **constant** for this tenant. The partition is degenerate → there is no file affinity → all sheets' columns are one undifferentiated pool. Proven below in code.

### 2.1 The data_type matcher (§4.1) — partitions on `data_type`, never on `_sheetName`

`inventoryData` builds `DataCapability[]` by grouping on `data_type` and **explicitly stripping `_`-prefixed keys — which is exactly where `_sheetName` lives**:

`convergence-service.ts:1012-1014`:
```ts
  for (const row of allRows) {
    const dt = row.data_type as string;
    if (!byType.has(dt)) byType.set(dt, []);
```

`convergence-service.ts:1112-1117` (column-stat union strips `_*` keys — `_sheetName` is invisible):
```ts
    const allKeys = new Set<string>();
    for (const sample of samples) {
      for (const key of Object.keys(sample)) {
        if (!key.startsWith('_')) allKeys.add(key);   // _sheetName invisible
      }
    }
```

`convergence-service.ts:1071-1085` — the HF-228 schema-coverage loop **merges every sheet's distinct column-signature into the same `data_type` bucket**:
```ts
  for (const [dt, samples] of Array.from(byType.entries())) {
    const sigOf = (rd) => Object.keys(rd).filter(k => !k.startsWith('_')).sort().join(',');
    const seenSignatures = new Set(samples.map(rd => sigOf(rd)));
    for (const row of allRows) {
      if (samples.length >= 50) break;
      if ((row.data_type as string) !== dt) continue;
      const rd = row.row_data as Record<string, unknown> | null;
      if (!rd) continue;
      const sig = sigOf(rd);
      if (seenSignatures.has(sig)) continue;
      samples.push(rd); seenSignatures.add(sig);
    }
  }
```

`matchComponentsToData` then assigns each component a **`dataType`** (never a sheet) — `convergence-service.ts:1208-1213, 1261-1267`:
```ts
      // Pass 1: Structural match — capability must have a 'measure' structuralType
      const structuralCandidates = capsWithFI.filter(cap => {
        const hasMeasure = Object.values(cap.fieldIdentities).some(fi => fi.structuralType === 'measure');
        const hasIdentifier = Object.values(cap.fieldIdentities).some(fi => fi.structuralType === 'identifier');
        return hasMeasure && hasIdentifier;
      });
      ...
      if (bestMatch && bestMatch.score > 0.3) {
        matches.push({ component: comp, dataType: bestMatch.cap.dataType, ... });
```
Pass 3 fallback scores **token overlap between the component name and the `data_type` string** (`convergence-service.ts:1282-1292`) — again `data_type`, not sheet.

**Answer to §4.1:** The matcher's signal is a *structural score* (measure-count vs `requiredMeasures`, temporal presence, contextual-type diversity) or *component-name↔data_type token overlap*. The match key is always `dataType`. With one `data_type='transaction'`, `capsWithFI.length === 1`; every component that matches matches the **same single merged capability**. **The matcher structurally cannot discriminate by sheet.**

### 2.2 Candidate construction (§4.2) — `measureColumns`: measure-only, cross-sheet pool

`convergence-service.ts:2700-2736`:
```ts
  // Collect all measure columns across matched capabilities
  const measureColumns: Array<{ name: string; fi: FieldIdentity; stats: ColumnValueStats; batchId: string; }> = [];
  let primaryCap: DataCapability | undefined;

  for (const match of matches) {
    const cap = capabilities.find(c => c.dataType === match.dataType);   // single data_type → SAME cap every iteration
    if (!cap) continue;
    if (!primaryCap) primaryCap = cap;

    for (const [colName, fi] of Object.entries(cap.fieldIdentities)) {
      if (fi.structuralType === 'measure' && cap.columnStats[colName]) {     // ← THE candidate predicate
        if (!measureColumns.some(mc => mc.name === colName)) {
          measureColumns.push({ name: colName, fi, stats: cap.columnStats[colName], batchId: cap.batchIds[0] || '' });
        }
      }
    }
    // Also include numeric columns with stats but no field identity
    for (const nf of cap.numericFields) {
      if (!measureColumns.some(mc => mc.name === nf.field) && cap.columnStats[nf.field]) {
        measureColumns.push({ name: nf.field, fi: { structuralType: 'measure', contextualIdentity: 'inferred_numeric', confidence: 0.5 }, stats: cap.columnStats[nf.field], batchId: cap.batchIds[0] || '' });
      }
    }
  }
```

**(a) The candidate predicate** is `fi.structuralType === 'measure'` (line 2717) OR `cap.numericFields` (bare numeric, line 2724).

**(b) Non-measure columns are excluded.** `Verificado` (text "No"/"Sí") is classified `boolean` → pushed to `cap.booleanFields` with a `continue` (`convergence-service.ts:1156-1170`), never reaching `measureColumns`. `Categoria` (text ALI/BEB/LIM…) is classified `categorical` → `cap.categoricalFields` (`convergence-service.ts:1173`), never a measure candidate.
> **Adversarial correction (CONFIRMED by refute pass):** `Pedidos_Primeros_60_Dias` (a *count*) is **NOT** excluded. Per `field-identities.ts:29` `count` maps to `{ structuralType: 'measure', contextualIdentity: 'count' }`, and `ColumnRole` (`sci-types.ts:71-79`) has no `'count'` member. A count column has `structuralType === 'measure'`, passes line 2717, and **is** admitted. This *strengthens* the cross-sheet-pooling finding (Clientes_Nuevos's count also pools in). The load-bearing exclusions are `Verificado` (boolean) and `Categoria` (text) only.

**(c) Scoping is per matched `dataType` (degenerate).** The comment at `convergence-service.ts:2751-2762` declares the pool "scoped to the data_type(s) the BOUNDARY MATCHER associated with this plan's components … deterministic file affinity, keyed on data_type/batchId." But `cap = capabilities.find(c => c.dataType === match.dataType)` resolves to the **single** `'transaction'` capability every time, whose `fieldIdentities`/`columnStats` already union **all sheets' columns** (§2.1). So `measureColumns` = `{Monto_Total, Monto_Cobrado, Saldo_Pendiente, Cantidad, Precio_Unitario, Enero_2025…Junio_2025, Pedidos_Primeros_60_Dias, …}` — **one cross-sheet measure pool, with no sheet label attached** (the pushed record carries `name`, `fi`, `stats`, `batchId` — never a sheet). HF-302's "file affinity" is a no-op when files are sheets, not data_types.

### 2.3 The AI mapping call (§4.3)

`resolveColumnMappingsViaAI` (`convergence-service.ts:2355-2534`) receives `measureColumns` and sends ONLY their names:

`convergence-service.ts:2363`: `const columnNames = measureColumns.map(c => c.name);`
`convergence-service.ts:2416-2427`: the `DATA COLUMNS` block lists `measureColumns` (name + contextualIdentity + `[min,max,mean]`). The cross-source WARN (`2423-2424`) only fires for `contextualIdentity === 'cross_source_numeric'`, which **never occurs here** (that flag tagged *other* data_types; with one data_type nothing is cross-source). So **every sheet's column appears as an equal, unlabeled candidate.**

The **live `convergence_mapping` system prompt** (`anthropic-adapter.ts:940-945`):
```
You map compensation plan metric requirements to data columns. Given a list of metric field
names (from plan interpretation) and data columns (with descriptions), return a flat JSON object
mapping each metric to its best-matching column.

Each column may be used at most once. Match by semantic meaning, not by string similarity.

Respond ONLY with valid JSON, no preamble, no markdown, no explanation:
{"metric_field_name": "column_name", "metric_field_name_2": "column_name_2"}
```
Task call: `task: 'convergence_mapping'`, `maxTokens: 500`, `responseFormat: 'json'` (`convergence-service.ts:2481-2485`). The model is told to return each metric's **"best-matching column"** from the provided list — **it cannot abstain**; there is no "no match" output. Whatever it returns is then **hard-filtered to `columnNames`** — `convergence-service.ts:2502, 2507` accept a value only `if (columnNames.includes(val/col))`. **The AI literally cannot return `Verificado` or `Categoria` — they are not in `columnNames`.**

**Validation (the "7th threshold" check):** `isValidColumnMapping` is **membership-only**, gated by a bare `0.5` ratio — `convergence-service.ts:2316-2325`:
```ts
  const mappedCount = metricFields.filter(m => { const val = result[m];
    if (typeof val === 'string') return columnNames.includes(val);
    if (typeof val === 'object' && val !== null) { const col = (val as Record<string, unknown>).column;
      return typeof col === 'string' && columnNames.includes(col); }
    return false; }).length;
  return mappedCount >= Math.ceil(metricFields.length * 0.5);
```
This validates that *≥50% of metrics mapped to some listed column* — **it never checks correctness** (right sheet, right semantic). It is a real bare-float (`0.5`) but it is not scan-flagged (it is in a `return`, not an `if`-comparison the gate matches). Recorded as a **7th AUTHORITY constant** (membership floor), non-causal to the wrong-sheet choice.

### 2.4 The decisive Track-A root (§4.3 decisive question)

> When Plan 4 binds `Verificado → Monto_Cobrado` and Plan 1 binds `Monto_Total → Saldo_Pendiente`, the root is **(a) candidate construction**, driven by the degenerate data_type partition — NOT (c) the AI choosing wrong from a correct set, and NOT (d) a threshold rejecting a correct candidate.

Two co-resident candidate-construction defects, both at `convergence-service.ts:2700-2736`, both upstream of every threshold:

1. **Measure-only exclusion (Plan 4 / `Verificado`):** the correct column is *never offered*. `Verificado` is filtered out at classification (boolean, `1156-1170`) so it is absent from `measureColumns` (line 2717) and from `columnNames` (2363). The AI is structurally incapable of returning it (parser gate 2502/2507) → it maps the plan's metric to the best available *measure* → `Monto_Cobrado`. **Root = (a), the column was never a candidate.**

2. **Cross-sheet pooling (Plans 1/2/3/5):** for Plan 1 the correct column `Monto_Total` *is* in the pool, yet the AI picked `Saldo_Pendiente` (a Cobranza column). This is enabled **only because the pool offers Cobranza columns to a Ventas plan** — there is no sheet affinity to exclude them (§2.1–§2.2), and they carry no sheet label or cross-source warning (§2.3). The AI's mispick is *downstream of, and caused by,* the contaminated candidate set. Had the pool been sheet-scoped, `Saldo_Pendiente` would not be a candidate and `Monto_Total → Monto_Total` would be forced. **Root = (a)/(b) co-resident: cross-sheet candidate pool from a degenerate matcher partition.** The prompt's "always return a best column, never abstain" instruction (§2.3) is the proximate trigger but not the root; with a correctly scoped pool the same prompt yields the right answer.

**No threshold is on this path.** `measureColumns` is built (2700-2736) with **zero** threshold — only the `=== 'measure'` filter. Every one of the 6 scan-flagged thresholds sits *after* the pool exists (proven in §3).

---

## 3 — Track A′: Threshold Classification (§5)

### 3.1 The authoritative gate set (`no-developer-numbers-scan.sh`, live run)

```
$ bash scripts/no-developer-numbers-scan.sh
web/src/lib/intelligence/convergence-service.ts:338:    if (match.matchConfidence < 0.5) continue;
web/src/lib/intelligence/convergence-service.ts:514:        if (score > 0.2 && (!bestCompMatch || score > bestCompMatch.score)) {
web/src/lib/intelligence/convergence-service.ts:1261:      if (bestMatch && bestMatch.score > 0.3) {
web/src/lib/intelligence/convergence-service.ts:1292:    if (bestDt && bestScore > 0.2) {
web/src/lib/intelligence/convergence-service.ts:2883:          const isValidated = !req.expectedRange || boundaryScore > 0.1;
web/src/lib/intelligence/convergence-service.ts:3202:  if (!bestCatField || bestCatScore < 0.3) {
web/src/app/api/calculation/run/route.ts:730:        if (matchRate >= 0.8) {
web/src/app/api/calculation/run/route.ts:2734:      const compMatch = ... Math.abs(componentResults[ci].payout - (priorResults[ci] ?? 0)) < 0.01;
```

The directive's **6 named thresholds are confirmed**, all in `convergence-service.ts` at the exact predicted lines. The gate also flags 2 in `run/route.ts` (outside the directive's scope: `730` = roster match-rate floor; `2734` = the one true float-precision **TOLERANCE**, `< 0.01` payout-equality epsilon).

### 3.2 Classification table (the 6, with live context)

| # | Line | Threshold | Containing function | Decision it gates | On the Track-A defect path? | AUTHORITY/TOLERANCE | Replacement form |
|---|---|---|---|---|---|---|---|
| 1 | 338 | `match.matchConfidence < 0.5` | `convergeBindings` | Whether a match emits the per-match signal / (superseded) `generateDerivationsForMatch` | **No** — the `generateDerivationsForMatch` call is commented out (`340-346`); gates signal emission on a superseded path | **AUTHORITY** | CRL-reliability of the match source, or drop (dead consumer) |
| 2 | 514 | `score > 0.2 && (!bestCompMatch \|\| score > bestCompMatch.score)` | `convergeBindings` (OB-128 actuals/target pairing) | Accept a component↔target-capability token-overlap pairing | **No** — fires only for `hasTargetData` capabilities (MIR has none) | **AUTHORITY** floor (`>0.2`); argmax part already relative | Keep argmax, drop `>0.2`, accept on relative separation gap |
| 3 | 1261 | `bestMatch.score > 0.3` | `matchComponentsToData` Pass 1 | Accept the structural component→data_type match | **On the matcher path, non-causal** — with one data_type the single cap scores ≥0.5 and passes; does not cause the wrong *sheet* pool | **AUTHORITY** floor | argmax + relative-separation (import resolver.ts pattern) |
| 4 | 1292 | `bestDt && bestScore > 0.2` | `matchComponentsToData` Pass 3 | Accept the component-name↔data_type token-overlap fallback match | **On the matcher path, non-causal** — Pass 1 already matched everything to `'transaction'` | **AUTHORITY** floor | same as #3 |
| 5 | 2883 | `boundaryScore > 0.1` | `generateAllComponentBindings` | Sets `isValidated` → `match_pass` 1 vs 2 and confidence 0.9 vs 0.6 | **No** — a *confidence label only*; the AI's `proposedColumnName` is bound either way (`2885-2901`). `scoreColumnForRequirement` returns baseline `0.1` when no `expectedRange` (`1918-1920`), so this never vetoes | **AUTHORITY** (lowest impact; borderline) | CRL-derived confidence, or drop the label |
| 6 | 3202 | `bestCatScore < 0.3` | `generateFilteredCountDerivations` | Falls back to `expectedMetrics` token matching for categorical filter discovery | **No** — this function is **SUPERSEDED** (`3169-3175`) and self-flagged a **Korean-Test (E910) violation** (token overlap of component-name vs categorical values; "fails for non-English data"); retained for rollback only | **AUTHORITY** floor (on dead path) | n/a — remove with the dead function; live path is the AI categorical filter (§2.3) |

**Additional un-flagged AUTHORITY bare-floats** (the scan misses these; they are `else if` chains, not single `if`-comparisons): the scale-inference bounds `max <= 1.5` / `max <= 150` / `min < 1.5` etc. at `convergence-service.ts:2014-2024` and `2039-2044`. These classify a column's scale (`ratio_0_1`, `percentage_0_100`, `integer_count`, …) inside `scoreColumnForRequirement`'s normalization. **AUTHORITY-class** (developer-stated scale boundaries). They are not on the wrong-binding path but are developer numbers the unified OB should fold into the same relative/CRL treatment for completeness.

**TOLERANCE count within `convergence-service.ts`: 0.** None of the 6 is a float-precision epsilon; all are developer-assigned decision boundaries (AUTHORITY). The only TOLERANCE the gate surfaces is `run/route.ts:2734` (`< 0.01`), outside the directive's scope.

### 3.3 Decisive §5 finding — thresholds are CO-RESIDENT, NOT causal

**Threshold elimination ALONE does NOT fix Track A.** The wrong-sheet binding is produced entirely in candidate construction (`measureColumns`, `2700-2736`) and the merged-capability inventory (`1012-1117`), both of which run **before any of the 6 thresholds** and contain **no** threshold. Of the six: #1/#6 sit on superseded/dead paths; #3/#4 are matcher-acceptance floors that *pass* under a single data_type (so they don't cause the wrong pool); #5 is a confidence label that never vetoes; #2 is for target-pairing that MIR doesn't exercise. **They are present, mostly on observation/superseded/labeling paths, and orthogonal to the root.** They must still be eliminated to satisfy Decision 110 / turn `no-developer-numbers-scan.sh` green — but in the unified OB they are a *co-resident* cleanup on the rewritten path, **not** *the* fix.

### 3.4 The live dynamic-authority substrate the replacements use (§3.3 deep)

`CRLResult` (`contextual-reliability.ts:21-27`): `{ sourceType, reliability: 0-1, level: 'fingerprint'|'category'|'boundary'|'global'|'seed', observations, description }`. `contextualReliabilityLookup(sourceType, fingerprint, tenantId, …) → Promise<CRLResult>` is keyed by **`SignalSourceType` + structural fingerprint** (sourced from `classification_signals`), used as a reliability multiplier `w = reliability × strength` in `resolveClassification`. **It scores a classification source's reliability — not a column→requirement match.**

The **relative-selection pattern is already live** in `resolver.ts`: argmax (`posteriors.sort((a,b)=>b.posterior-a.posterior)`), normalize-to-sum-1, and a **relative separation gate** `scores[0] - scores[1] < 0.10` (review trigger) — no fixed accept/reject cutoff except a residual `winner.confidence < 0.50`. `convergence-service.ts` already has the argmax half (`score > bestMatch.score`); what it lacks is the *relative* accept rule (it uses `> 0.2/0.3/0.5` floors instead). **Both substrates exist live in `lib/sci/` and are wired into `resolveClassification`, but NOT into `convergence-service.ts`.** That asymmetry is precisely what Track A′ closes.

---

## 4 — Track C: `column_in_no_batch` Resolution Failure (§6)

`resolveColumnFromBatch` (`run/route.ts:1609-1638`):
```ts
  function resolveColumnFromBatch(column: string, entityExternalId: string, filters?: ...): number | null {
    // HF-302 (RC-2): select the batch whose rows actually CARRY `column` (non-null) for this entity …
    //   No source_batch_id needed (the persisted binding carries none).
    let entityRows; let anyRowsForEntity = false;
    for (const [, map] of Array.from(dataByBatch.entries())) {
      const rows = map.get(entityExternalId);
      if (!rows || rows.length === 0) continue;
      anyRowsForEntity = true;
      if (rows.some(rd => rd[column] !== null && rd[column] !== undefined)) { entityRows = rows; break; }
    }
    if (!entityRows) {
      bufferTrace(`… resolveColumnFromBatch:exit … column=${column} | reason=${anyRowsForEntity ? 'column_in_no_batch' : 'no_rows'} | returned=null`);
      return null;
    }
    …
```

**(1) What `column_in_no_batch` means:** the entity has rows in `dataByBatch` (`anyRowsForEntity` true) but **no batch's rows carry the bound `column` non-null**. The resolver is column-name-keyed and scans *all* batches for one that carries the column.

**(2) Binding-time vs resolution-time:** there is **no binding-time batch** to diverge from — `run/route.ts:1614-1619` ("No source_batch_id needed (the persisted binding carries none)") and `803-809` ("the prior batch-id-keyed intermediary map … is eliminated … iterate dataByBatch by column name; no batch_id mediation"). Selection happens purely at resolution time by **column presence** (line 1626). The binding contributes only the column *name* (+ filters/scale).

The reachability of an entity's rows is gated on a **single global entity column** — `run/route.ts:813-820`:
```ts
    const knownEntityCols = Array.from(new Set(
      Object.values(convergenceBindings)
        .map(comp => comp?.entity_identifier as { column?: string } | undefined)
        .map(eid => eid?.column)
        .filter((col): col is string => !!col && col.length > 0)));
    const entityCol: string | undefined = knownEntityCols[0];     // ← ONE column for ALL sheets
```
and every row of every batch is primary-keyed by it — `run/route.ts:889-894`:
```ts
        const entityKey = String(rd[entityCol] ?? '').trim();
        if (entityKey) { entityMap.get(entityKey) … .push(rd); continue; }
```
(RC-3 secondary rollup at `897-907` recovers rows lacking `entityCol`, via the HF-303 argmax membership key — itself threshold-free, `850-876`.)

**(3) Same root as Track A, or independent?** **Structurally the SAME root, with a co-resident resolution-time defect — and the headline outcome is premise-contingent (adversarially tempered):**

- The *mechanism* is confirmed airtight: the failure is genuinely "the bound column is present in **no batch the resolver can scope to** for this entity," because reachability is gated on the single `entityCol = knownEntityCols[0]`. This is **not** a binding-time/resolution-time batch divergence.
- **Same-root link:** the `entity_identifier` column that becomes `entityCol` is itself selected from the **same merged cross-sheet capability** as Track A (`convergence-service.ts:3027-3081`, `fieldIdentities` filtered to `structuralType === 'identifier'` — which now contains *every* sheet's id columns: `DNI_Vendedor`, `Codigo_Cliente`, `Folio`, `Folio_Cobro`, `DNI`, `Almacen`…). The degenerate partition that contaminates the measure pool also lets `knownEntityCols[0]` be the wrong sheet's identifier → `dataByBatch` keyed wrong → the Cobranza rows that carry `Monto_Cobrado` are filed under a key the iterated entity (a `DNI_Vendedor`) never matches → `column_in_no_batch`. So the **Track-A fix (sheet-aware partition) is necessary for Track C too**.
- **Co-resident resolution-time defect (must also be fixed in the same OB):** even with correct bindings, `entityCol = knownEntityCols[0]` assumes **one entity column suffices for all sheets**, and selection order over `Object.values(convergenceBindings)` is data-dependent (`813-820`). A plan whose sheets are keyed by different identifiers is not served by `[0]` alone.
- **Adversarial temper (residual UNKNOWN, §6 of synthesis):** the observed "every entity null → grand total 0 for Plan 3" is **premise-contingent on `entityCol !== 'DNI_Vendedor'`**. If `knownEntityCols[0]` resolves to `DNI_Vendedor` (Cobranza's own field), Cobranza rows *are* keyed correctly, `rows.some(rd => rd['Monto_Cobrado'] != null)` is true, and the resolver returns a real sum. The static code does **not** force the zero-total outcome; which column wins `[0]` at runtime for Plan 3's binding is the one fact not provable from source (the architect observed it failing). **This is the single most important residual UNKNOWN.**

---

## 5 — Track B: Clawback Accommodation (§7)

### 5.1 Declared structure (§7.1, live `rule_sets` `2f615968`)

`components.variants[0].components[0]` (`clawback-devolucion`): `componentType: "prime_dag"`, `measurementLevel: "store"`. The intent is a **negative product**:
```
multiply(  constant(-1),  multiply( multiply( ref(Monto_Original), ref(Tasa_Comision_Original) ), ref(Multiplicador_Acelerador_Original) )  )
```
`compositional_intent.metadata`: `{ recovery_rate: 1, applied_in_period: "return_period", clawback_window_days: 45 }`. It encodes a **sign** (the `constant(-1)`) and references **three original-sale attributes**: `Monto_Original`, `Tasa_Comision_Original`, `Multiplicador_Acelerador_Original`.

### 5.2 Source data (§7.2, live DB) — the decisive Track-B fact

The devolution columns live only on `Ventas_Marzo`. Five real return rows exist (live query, `Folio_Original` non-empty):
```
{"Folio":"DEV-653971","Cantidad":-129,"Monto_Total":-3031.5,"Fecha":"2025-03-26","Fecha_Original":"2025-01-30","Folio_Original":"TXN-653971","Motivo_Devolucion":"Cliente no solicitó","DNI_Vendedor":"10300005", …}
{"Folio":"DEV-702059","Cantidad":-188,"Monto_Total":-6243.48,"Fecha":"2025-03-10","Fecha_Original":"2025-01-09","Folio_Original":"TXN-702059","Motivo_Devolucion":"Producto dañado","DNI_Vendedor":"10300019", …}
… (5 total; every Fecha_Original is in JANUARY)
```
Existence check across **all** rows:
```
Monto_Original:                    rows with non-null value = 0
Tasa_Comision_Original:            rows with non-null value = 0
Multiplicador_Acelerador_Original: rows with non-null value = 0
Folio_Original (non-empty):        rows = 5
```

**The clawback's three declared input fields do not exist as columns anywhere.** A return row carries: its own **negative** `Monto_Total`, a `Folio_Original` linking to a **January** original sale (`Fecha_Original` ∈ January; returns are in March = `return_period`), and `Motivo_Devolucion`. It does **not** carry the original sale's amount, commission rate, or accelerator.

**→ Track B is CROSS-PERIOD (Design-Gate), NOT self-contained.** To honor the declared formula `−(Monto_Original × Tasa_Comision_Original × Multiplicador_Acelerador_Original)`, the engine must look up the **original January sale's commission inputs** by matching `Folio_Original` → the original `Folio` in a prior period. The within-period inputs are insufficient. (Source data is present — HALT-C does **not** trigger; this is a convergence+engine finding, not an import-scope finding.)

> The within-period alternative — use the return row's own negative `Monto_Total` — is a **different computation** (it reverses the net line amount, not the original commission `Monto×Tasa×Multiplier`) and does **not** match the declared field references. Adopting it would be a plan re-declaration, not an implementation of this plan.

### 5.3 Negative-outcome + conditional-firing engine support (§7.3)

**Negative carries through (supported).** `entityTotal = intentTotal` (`run/route.ts:2730`) → `total_payout: entityTotal` (`2778`); persisted at `2915, 2954, 3028, 3083`. **No `Math.max(0,…)` clamp** exists on `total_payout` (grep clean). The `prime_dag` intent already contains the `constant(-1)`, so a negative result would carry structurally — *if its inputs resolved*.

**But the clawback's inputs cannot resolve as declared (CONFIRMED by refute pass):**
- `prime_dag` resolution (`run/route.ts:1448-1472`) extracts the DAG's reference fields (`extractReferencesFromDAG`, `convergence-service.ts:1493-1523`) → `[Monto_Original, Tasa_Comision_Original, Multiplicador_Acelerador_Original]`, looks up each one's convergence binding, and calls `resolveColumnFromBatch` against **current-period `dataByBatch` only**. Non-existent columns → `null` → field omitted from `dagMetrics`.
- The evaluator's `reference` prime reads only `context.metrics[node.field]` and returns **ZERO** when the field is absent — `intent-executor.ts:151-154`:
  ```ts
      case 'reference': { const raw = context.metrics[node.field];
        return raw === undefined || raw === null ? ZERO : toDecimal(raw); }
  ```
  So the declared multiplicative term collapses to 0 (or, after convergence force-binds the three references to whatever measures exist — per §2.4, e.g. `Monto_Original→Monto_Cobrado` — to a *garbage* product of unrelated Cobranza values).
- **No cross-period machinery exists in the calc path.** `priorDataByEntity` IS fetched (`run/route.ts:959-1034`) but is **dead — never consumed after construction**. The `prior_period` prime (`intent-executor.ts:240-248`) only swaps `activeRows` to `context.priorPeriodRows ?? []`, and `buildEvalContext` (`intent-executor.ts:310-353`) **never sets `priorPeriodRows`**; `EntityData` (`intent-executor.ts:32-48`) doesn't declare it, and `run/route.ts:2669-2682` doesn't pass it. There is **no `Folio_Original` join** anywhere in the resolution path.

**Conditional firing:** the engine supports **filter-conditioned sums** (`resolveColumnFromBatch` `filters` param → `rowMatchesFilters`, `run/route.ts:1648-1657`; `conditional_gate` count path at `1993`). A "fires only when a return occurred" rule is expressible as a filter on the devolution rows (e.g. `Motivo_Devolucion`/sign of `Monto_Total`). What is **absent** is the cross-period *retrieval* of the original sale's commission inputs that the declared formula needs.

---

## 6 — Unified-Path Synthesis (§8)

### 6.1 Ratified root-cause statement (§8.1)

Every observed failure traces to **one structural-class defect: the convergence layer models the file boundary as `data_type`, but this tenant's five files are five `_sheetName`s inside a single `data_type='transaction'`.** `inventoryData` strips `_sheetName` and merges all sheet schemas into one `DataCapability` (`convergence-service.ts:1012-1117`); `matchComponentsToData` can only key on `data_type` (`1193-1303`); `generateAllComponentBindings` therefore builds one cross-sheet `measureColumns` pool, additionally excluding non-measure columns via `structuralType === 'measure'` (`2700-2736`); the AI mapper (`2355-2534`) is handed that contaminated, label-less pool and a prompt that forbids abstention. The **same** degenerate partition feeds the engine's single global `entityCol = knownEntityCols[0]` (`run/route.ts:813-820`), so resolution-time row reachability is also sheet-blind (Track C). The clawback (Track B) rides the same broken path *and* needs a cross-period mechanism the engine does not have. **These are not four independent bugs — they are (i) one missing sheet-aware partition + (ii) one over-narrow candidate filter + (iii) six co-resident developer thresholds + (iv) one cross-period gap, all on a single convergence→resolution path.** Tracks A, A′, and C share root (i); A also needs (ii); A′ is (iii); B needs (iv) plus the corrected candidate admission.

### 6.2 The unified path the OB rewrites (no registry, no thresholds) (§8.2)

In order along convergence→resolution:

1. **`inventoryData` (`convergence-service.ts:~1004-1190`)** — *current:* groups by `data_type`, strips `_sheetName`, merges sheet schemas into one capability. *required:* partition the capability set by the **structural file/sheet boundary** (the persisted sheet/source key, `_sheetName`/`import_batch_id`), so each sheet is its own `DataCapability`. Korean-Test-clean: partition on the structural source identifier, not on column-name content.
2. **`matchComponentsToData` (`~1193-1303`)** — *current:* scores against `data_type`, accepts on `>0.3`/`>0.2` floors. *required:* match each component to the sheet-scoped capability by structural fit; replace the floors with **argmax + relative-separation** (import the live `resolver.ts` pattern) — no fixed cutoff.
3. **`generateAllComponentBindings` → `measureColumns` (`2700-2736`)** — *current:* `structuralType === 'measure'` only, pooled across the single capability. *required:* build candidates from the **matched sheet's** columns and **admit all structuralTypes a requirement can need** (measure, count, **attribute** like `Verificado`, identifier) per the requirement's structural role — so the right column is offered and wrong-sheet columns are not.
4. **`resolveColumnMappingsViaAI` validity (`2311-2325`)** — *current:* membership-only `≥ ceil(n*0.5)`. *required:* correctness-aware acceptance (sheet/role-consistent), relative not bare-float.
5. **The 6 thresholds (`338, 514, 1261, 1292, 2883, 3202`) + scale bounds (`2014-2044`) + validity `0.5`** — replace each with argmax/relative-separation or CRL-`reliability`-derived authority (§3.4); remove the superseded dead functions carrying `338`/`3202`.
6. **Engine keying `entityCol = knownEntityCols[0]` (`run/route.ts:813-820, 889-894`)** — *required:* derive the entity key **per matched sheet/component** (not one global `[0]`), so `resolveColumnFromBatch` reaches the rows that carry the bound column. This closes Track C's co-resident resolution-time defect on the same path.

**Single path, no special-casing:** all six edits are on the one convergence→resolution pipeline; none is MIR-specific, none is a per-plan branch, none is a lookup registry. The corrected behavior is "partition by the real file boundary, offer role-appropriate candidates from the matched file, select relatively."

### 6.3 Clawback integration point (§8.3)

The clawback attaches at the **same** corrected path, not beside it:
- **Candidate admission (step 3):** the corrected, role-aware candidate construction must admit the devolution-row attributes the clawback's requirement needs; with sheet-scoping, the clawback's component matches `Ventas_Marzo` (where the devolution columns live), not Cobranza.
- **Cross-period sub-mechanism (Design-Gate):** because the declared inputs (`Monto_Original/Tasa/Multiplier`) are **not on the return row** (§5.2), the OB must add a **`Folio_Original` → original-period sale** lookup that recovers the original commission inputs. This is the one genuinely new mechanism. The dead `priorDataByEntity` (`run/route.ts:959-1034`) is the natural attach point; `prior_period`/`priorPeriodRows` plumbing (`intent-executor.ts:240-353`) must be completed (it is currently inert).
- **Outcome path:** already carries negative `total_payout` unclamped (§5.3) — no change needed there.
- **Conditional firing:** expressible via the existing `filters` contract (§5.3).

So the clawback = **(corrected candidate admission on the unified path) + (one new cross-period reversal sub-component)**. The within-period parts ride the Track-A fix; only the cross-period lookup is net-new (Design-Gate).

### 6.4 EECI pre-assessment (§8.4)

- **Efficiency — ONE invariant rewrite.** The single general mechanism is *partition convergence by the real file boundary and select candidates/matches relatively*. Tracks A, A′, C collapse into it; B adds one bounded sub-mechanism. Not N patches.
- **Efficacy.** The 4 non-clawback plans bind correctly when (a) `inventoryData` partitions by sheet (so each plan's candidates are its own file's columns) and (b) `measureColumns` admits role-appropriate non-measure columns — correctness guaranteed by the rewritten `inventoryData`/`measureColumns` pair. Plan 3 also resolves once the engine derives the entity key per-sheet (`run/route.ts:813-820`). The clawback computes its negative once the `Folio_Original` cross-period lookup feeds `Monto_Original/Tasa/Multiplier` into `dagMetrics` (`run/route.ts:1448-1472`) and the `reference` prime reads them (`intent-executor.ts:151-154`).
- **Comprehensive.** The corrected candidate/match path must cover all structuralTypes (**measure, count, attribute, identifier, temporal**) and all plan shapes (commission, bonus, **ratio**, **count/threshold** like Cartera Nueva, **clawback**). Currently uncovered shapes: **attribute-valued metrics** (Plan 4's `Verificado`) and the **cross-period clawback** (Plan 5). Both are explicitly in scope above.
- **Innovation (constitutional advance).** Extending **Decision 110 flywheel authority** (CRL `reliability` + relative-separation selection, today live only in `resolveClassification`) to **convergence matching** generalizes the flywheel from *classification* to *binding* — convergence becomes threshold-free and evidence-governed like classification already is. The substrate (`contextual-reliability.ts`, `resolver.ts`) exists; the advance is wiring it into `convergence-service.ts`.

### 6.5 Residual unknowns (§8.5) — the only items the OB probes at build time

1. **Which column wins `knownEntityCols[0]` for Plan 3 at runtime** (`run/route.ts:813-820`). The grand-total-0 outcome is premise-contingent on it being ≠ `DNI_Vendedor`; static code does not force it. The OB must capture the live binding's `entity_identifier.column` for each plan to confirm Track C's exact bite. **(Most important.)**
2. **The exact `structuralType` the live classifier assigns to each sheet's identifier/measure columns** in the merged capability (e.g., is `Folio`/`Folio_Cobro` an `identifier` that pollutes `knownEntityCols`?). Needs the live `inventoryData` field-identity output per sheet.
3. **The persisted `_sheetName`/source key available at convergence time** — whether `import_batch_id` alone is a sufficient sheet proxy, or `_sheetName` (currently stripped) must be preserved through `committed_data` → capability. Determines the step-1 partition key.
4. **The original-sale commission availability for the clawback** — whether January's `calculation_results` (original commission per `Folio`) are queryable by `Folio_Original`, or whether the original `Monto_Total × rate × multiplier` must be recomputed from `Ventas_Enero` rows. Sizes the Design-Gate sub-component.
5. **The Plan-1 `Categoria` → DecimalError crash locus** — confirmed to originate *downstream* of convergence (no text column enters `measureColumns`; the crash is in `intent-executor.ts`/`run-calculation.ts` when a categorical reaches `new Decimal()`). The exact path (filter-value vs a binding that routed `Categoria` through a non-`measureColumns` route) was not fully traced in the engine and should be confirmed at build time; within `convergence-service.ts` the only structural guards are the `=== 'measure'` filter (`2717`) and the membership validity (`2325`).

---

## 7 — Summary

`DIAG-073 COMPLETE. HEAD=5400baa5. Track A root=candidate-construction (degenerate data_type partition + measure-only filter; single data_type='transaction' pools all 5 sheets' measures, Verificado/Categoria excluded; AI cannot abstain and is hard-filtered to that pool). Thresholds: 6 AUTHORITY, 0 TOLERANCE (within convergence-service.ts; the lone TOLERANCE <0.01 is in run/route.ts), causal=N (all downstream of candidate construction; co-resident cleanup, not the fix). Track C root=same (shared degenerate partition → wrong global entityCol=knownEntityCols[0]) + co-resident resolution-time defect; grand-total-0 outcome premise-contingent (residual UNKNOWN #1). Clawback=cross-period (declared inputs Monto_Original/Tasa/Multiplier have 0 rows; only Folio_Original→January original + negative Monto_Total exist; engine has no Folio cross-period join, priorDataByEntity is dead). Unified OB scope=ONE path (sheet-aware partition + role-aware candidates + relative/CRL selection + per-sheet entity key) + ONE net-new cross-period clawback sub-component (Design-Gate). 5 residual UNKNOWNs.`

---
*DIAG-073 · Convergence Unified-Path Root-Cause Forensic · 2026-06-18 · READ-ONLY · vialuce.ai — Intelligence. Acceleration. Performance.*
