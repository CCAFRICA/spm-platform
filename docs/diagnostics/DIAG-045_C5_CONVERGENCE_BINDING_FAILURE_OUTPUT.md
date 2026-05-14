# DIAG-045 -- C5 Convergence Binding Failure Root Cause Output

**Date:** 2026-05-14
**Branch:** diag-045-c5-convergence-binding-failure
**HEAD commit at scaffold:** ab76ae3676e654f453dcae3e76133b8a7298fb91 (post-HF-223 merge)
**Scope:** Why does C5 convergence binding fail when C1-C4 succeed in the same run?

CC pastes verbatim code and data at every section. No interpretation. No PASS/FAIL. No design proposals.

---

## Phase 1 -- Metric requirement extraction

### Phase 1.1 -- Locator grep (head -40)

```
$ grep -nE "metric|requirement|sourceSpec|numerator|denominator|extractMetric|getMetric|componentInput|inputRequirement" web/src/lib/intelligence/convergence-service.ts | head -40
4: * Matches plan requirements to data capabilities through field identity matching
38:// OB-191: Enriched metric context for Pass 4 AI prompt
43:  name: string;          // Programmatic metric name (e.g., "period_equipment_revenue")
48:  semanticIntent?: string;             // HF-198 E5: AI plan-agent reasoning text (per metric_comprehension signal)
49:  metricInputs?: Record<string, unknown> | null;  // HF-198 E5: input shape from plan-agent (per metric_comprehension signal)
52:/** Convert programmatic metric name to human-readable label */
146:  // HF-196 Phase 3: D153 B-E4 atomic cutover — metricComprehension is the
152:    // HF-196 Phase 3: rule-set-scoped metric comprehension signals read from
154:    // (OB-198 vocabulary aligned). These signals carry plan-agent metric
157:    metricComprehension: MetricComprehensionSignal[];
161:// HF-196 Phase 3: shape of metric_comprehension signals consumed as operative
188:  // HF-196 Phase 3: metricComprehension is read unconditionally (not gated on
190:  const observations: ConvergenceResult['observations'] = { withinRun: [], crossRun: [], metricComprehension: [] };
201:  // 2. Extract plan requirements
205:  // HF-196 Phase 3: D153 B-E4 atomic cutover — read metric_comprehension signals
207:  // 'comprehension:plan_interpretation') carry plan-agent metric semantics that
210:  const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
211:  observations.metricComprehension = metricComprehensionSignals;
...
```

### Phase 1.2 -- Function locate (broader)

```
$ grep -nE "function.*[Cc]omponent.*[Bb]inding|function.*generate.*[Bb]inding|function.*extract|function.*[Mm]etric.*[Ff]rom|function extractInputRequirements|function getRequiredMeasure|function generateDerivations" web/src/lib/intelligence/convergence-service.ts
684:  function extractComponents(componentsJson: unknown): PlanComponent[] {
1171: function generateDerivationsForMatch(
1245: function extractInputRequirements(component: PlanComponent): ComponentInputRequirement[] {
2561: function getRequiredMeasureCount(operation: string): number {
```

The relevant requirement-extraction function is `extractInputRequirements` at line 1245. Full body (verbatim, lines 1245-1320):

```typescript
function extractInputRequirements(component: PlanComponent): ComponentInputRequirement[] {
  const intent = component.calculationIntent;
  if (!intent) return [{ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: null }];

  const reqs: ComponentInputRequirement[] = [];
  const op = intent.operation as string;

  // Helper to get field name from a sourceSpec
  const getField = (spec: Record<string, unknown> | undefined): string =>
    spec?.field ? String(spec.field).replace(/^metric:/, '') : 'unknown';

  switch (op) {
    case 'bounded_lookup_2d': {
      const inputs = intent.inputs as Record<string, Record<string, unknown>> | undefined;
      const rowRange = extractRangeFromBoundaries(intent.rowBoundaries as Array<Record<string, unknown>> | undefined);
      const colRange = extractRangeFromBoundaries(intent.columnBoundaries as Array<Record<string, unknown>> | undefined);
      if (inputs) {
        const rowSpec = inputs.row?.sourceSpec as Record<string, unknown> | undefined;
        const colSpec = inputs.column?.sourceSpec as Record<string, unknown> | undefined;
        reqs.push({ role: 'row', metricField: getField(rowSpec), expectedRange: rowRange });
        reqs.push({ role: 'column', metricField: getField(colSpec), expectedRange: colRange });
      } else {
        reqs.push({ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: rowRange });
      }
      break;
    }
    case 'bounded_lookup_1d': {
      const range = extractRangeFromBoundaries(intent.boundaries as Array<Record<string, unknown>> | undefined);
      const inputSpec = (intent.input as Record<string, unknown>)?.sourceSpec as Record<string, unknown> | undefined;
      reqs.push({ role: 'actual', metricField: getField(inputSpec), expectedRange: range });
      break;
    }
    case 'scalar_multiply': {
      const input = intent.input as Record<string, unknown> | undefined;
      if (input?.source === 'ratio') {
        const spec = input.sourceSpec as Record<string, unknown> | undefined;
        const num = spec?.numerator ? String(spec.numerator).replace(/^metric:/, '') : 'unknown';
        const den = spec?.denominator ? String(spec.denominator).replace(/^metric:/, '') : 'unknown';
        reqs.push({ role: 'numerator', metricField: num, expectedRange: null });
        reqs.push({ role: 'denominator', metricField: den, expectedRange: null });
      } else {
        const spec = input?.sourceSpec as Record<string, unknown> | undefined;
        reqs.push({ role: 'actual', metricField: getField(spec), expectedRange: null });
      }
      break;
    }
    case 'conditional_gate': {
      const condLeft = (intent.condition as Record<string, unknown>)?.left as Record<string, unknown> | undefined;
      const spec = condLeft?.sourceSpec as Record<string, unknown> | undefined;
      reqs.push({ role: 'actual', metricField: getField(spec), expectedRange: null });
      break;
    }
    case 'piecewise_linear': {
      // OB-185: piecewise_linear has ratioInput (numerator/denominator) and baseInput
      const ratioIn = intent.ratioInput as Record<string, unknown> | undefined;
      const baseIn = intent.baseInput as Record<string, unknown> | undefined;
      const ratioSpec = ratioIn?.sourceSpec as Record<string, unknown> | undefined;
      const baseSpec = baseIn?.sourceSpec as Record<string, unknown> | undefined;
      if (ratioSpec?.numerator) reqs.push({ role: 'numerator', metricField: String(ratioSpec.numerator).replace(/^metric:/, ''), expectedRange: null });
      if (ratioSpec?.denominator) reqs.push({ role: 'denominator', metricField: String(ratioSpec.denominator).replace(/^metric:/, ''), expectedRange: null });
      if (baseSpec?.field) reqs.push({ role: 'actual', metricField: getField(baseSpec), expectedRange: null });
      break;
    }
    case 'linear_function': {
      // OB-185: linear_function has single input
      const lfInput = intent.input as Record<string, unknown> | undefined;
      const lfSpec = lfInput?.sourceSpec as Record<string, unknown> | undefined;
      reqs.push({ role: 'actual', metricField: getField(lfSpec), expectedRange: null });
      break;
    }
    default:
      reqs.push({ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: null });
  }

  return reqs;
}
```

### Phase 1.3 -- Nested operation handling

```
$ grep -n "conditional_gate\|nested\|recursive\|traverse\|walk\|input\.operation\|input\.source\|deep" web/src/lib/intelligence/convergence-service.ts | head -25
765: // OB-185: Walk nested onTrue/onFalse for conditional_gate chains
766: const walkNested = (obj: Record<string, unknown>) => {
778: if (obj.onTrue && typeof obj.onTrue === 'object') walkNested(obj.onTrue as Record<string, unknown>);
779: if (obj.onFalse && typeof obj.onFalse === 'object') walkNested(obj.onFalse as Record<string, unknown>);
781: if (intent.onTrue || intent.onFalse || intent.condition) walkNested(intent);
1280:    const spec = input.sourceSpec as Record<string, unknown> | undefined;
1291: case 'conditional_gate': {
1610: case 'conditional_gate': {                                                                  (estimateSampleResult — result-estimation, not requirement extraction)
2570: case 'conditional_gate':                                                                    (getRequiredMeasureCount — count only)
```

**The `walkNested` helper (lines 765-781):**

```typescript
      // OB-185: Walk nested onTrue/onFalse for conditional_gate chains
      const walkNested = (obj: Record<string, unknown>) => {
        const spec = (obj.input as Record<string, unknown>)?.sourceSpec as Record<string, unknown> | undefined;
        if (spec?.field) {
          const f = String(spec.field).replace(/^metric:/, '');
          if (!metrics.includes(f)) metrics.push(f);
        }
        const condLeft = (obj.condition as Record<string, unknown>)?.left as Record<string, unknown> | undefined;
        const condSpec = condLeft?.sourceSpec as Record<string, unknown> | undefined;
        if (condSpec?.field) {
          const f = String(condSpec.field).replace(/^metric:/, '');
          if (!metrics.includes(f)) metrics.push(f);
        }
        if (obj.onTrue && typeof obj.onTrue === 'object') walkNested(obj.onTrue as Record<string, unknown>);
        if (obj.onFalse && typeof obj.onFalse === 'object') walkNested(obj.onFalse as Record<string, unknown>);
      };
      if (intent.onTrue || intent.onFalse || intent.condition) walkNested(intent);
```

`walkNested` lives in `extractComponents` (line 684 context per Phase 1.2 locator). It extracts a flat `metrics: string[]` list used elsewhere; it does NOT produce `ComponentInputRequirement` records. It only fires when the *top-level* intent contains `onTrue`/`onFalse`/`condition` (gate at line 781). For C5's HF-223 emission (top-level `operation: 'scalar_multiply'`, with `conditional_gate` *inside* `input`), the gate at line 781 evaluates `intent.onTrue || intent.onFalse || intent.condition` against the scalar_multiply intent — those fields are undefined at the top level, so `walkNested` never runs.

`extractInputRequirements` (the function that produces binding requirements) routes by `intent.operation`. For C5 post-HF-223, `op === 'scalar_multiply'` (line 1277). The `scalar_multiply` branch checks `input?.source === 'ratio'` (line 1279) — but C5's `input` is `{ operation: 'conditional_gate', condition: {...}, onTrue: {...}, onFalse: {...} }`, where `input.source` is `undefined`. Branch falls through to the else clause (line 1285): reads `input?.sourceSpec`, which is also `undefined`. `getField(undefined)` returns `'unknown'` (line 1254). Result: `reqs.push({ role: 'actual', metricField: 'unknown', expectedRange: null })`.

The `case 'conditional_gate'` branch at line 1291 only fires when the *top-level* `intent.operation === 'conditional_gate'`, not when conditional_gate is nested inside scalar_multiply's input.

---

## Phase 2 -- Convergence internals

### Phase 2.1 -- `convergeBindings` signature (lines 175-180)

```typescript
export async function convergeBindings(
  tenantId: string,
  ruleSetId: string,
  supabase: SupabaseClient,
  calculationRunId?: string,  // OB-197 G11: scope signals emitted by this convergence to a calculation run
): Promise<ConvergenceResult> {
```

Setup head (lines 180-203):
```typescript
  const derivations: MetricDerivationRule[] = [];
  const matchReport: ConvergenceResult['matchReport'] = [];
  const signals: ConvergenceResult['signals'] = [];
  const gaps: ConvergenceGap[] = [];
  const componentBindings: Record<string, Record<string, ComponentBinding>> = {};
  const observations: ConvergenceResult['observations'] = { withinRun: [], crossRun: [], metricComprehension: [] };

  // 1. Fetch rule set
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('id', ruleSetId)
    .single();

  if (!ruleSet) return { derivations, matchReport, signals, gaps, componentBindings, observations };

  // 2. Extract plan requirements
  const components = extractComponents(ruleSet.components);
  if (components.length === 0) return { derivations, matchReport, signals, gaps, componentBindings, observations };
```

### Phase 2.2 -- `generateAllComponentBindings` (lines 1918-2081, body of relevance)

```typescript
async function generateAllComponentBindings(
  components: PlanComponent[],
  matches: BindingMatch[],
  capabilities: DataCapability[],
  bindings: Record<string, Record<string, ComponentBinding>>,
  existingConvergenceBindings: Record<string, Record<string, unknown>> | undefined,
  metricComprehension: MetricComprehensionSignal[] = [],
  tenantEntityExternalIds: Set<string> = new Set(),
  tenantId: string = '',
  supabase?: SupabaseClient,
): Promise<void> {
  // HF-222 Phase 1: HF-218 Component 4b tenant-adaptive boundary threshold block RETIRED.
  // The boundary-fallback acceptance mechanism is replaced in Phase 2 by a
  // distribution-derived distinguishability test that computes its threshold from
  // the candidate distribution at decision time.

  // HF-112: Reuse existing bindings if complete (zero AI cost)
  if (hasCompleteBindings(existingConvergenceBindings, components.length)) {
    console.log('[Convergence] HF-112 Existing bindings complete — reusing (zero AI cost)');
    for (const [compKey, compBindings] of Object.entries(existingConvergenceBindings!)) {
      bindings[compKey] = compBindings as Record<string, ComponentBinding>;
    }
    return;
  }

  // Collect all measure columns across matched capabilities
  const measureColumns: Array<{ name: string; fi: FieldIdentity; stats: ColumnValueStats; batchId: string }> = [];
  let primaryCap: DataCapability | undefined;

  for (const match of matches) {
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;
    if (!primaryCap) primaryCap = cap;
    for (const [colName, fi] of Object.entries(cap.fieldIdentities)) {
      if (fi.structuralType === 'measure' && cap.columnStats[colName]) {
        if (!measureColumns.some(mc => mc.name === colName)) {
          measureColumns.push({ name: colName, fi, stats: cap.columnStats[colName], batchId: cap.batchIds[0] || '' });
        }
      }
    }
    // Also include numeric columns with stats but no field identity
    for (const nf of cap.numericFields) {
      if (!measureColumns.some(mc => mc.name === nf.field) && cap.columnStats[nf.field]) {
        measureColumns.push({
          name: nf.field,
          fi: { structuralType: 'measure', contextualIdentity: 'inferred_numeric', confidence: 0.5 },
          stats: cap.columnStats[nf.field],
          batchId: cap.batchIds[0] || '',
        });
      }
    }
  }

  if (measureColumns.length === 0 || !primaryCap) return;

  // Collect all input requirements across all matched components
  const allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }> = [];
  for (const match of matches) {
    const reqs = extractInputRequirements(match.component);
    for (const req of reqs) {
      allRequirements.push({ compIndex: match.component.index, compName: match.component.name, req });
    }
  }

  // HF-112 / HF-199 D2: AI-assisted column mapping (ONE call) with metric_comprehension
  console.log('[Convergence] HF-112 Requesting AI column mapping');
  const aiMapping = await resolveColumnMappingsViaAI(components, allRequirements, measureColumns, metricComprehension);
  console.log(`[Convergence] HF-112 AI proposed ${Object.keys(aiMapping).length} mappings`);

  // Build bindings using AI mapping + boundary validation
  const boundColumns = new Set<string>();

  for (const match of matches) {
    const comp = match.component;
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;

    const compKey = `component_${comp.index}`;
    if (!bindings[compKey]) bindings[compKey] = {};

    const batchId = cap.batchIds[0] || '';
    const requirements = extractInputRequirements(comp);

    for (const req of requirements) {
      const proposedColumnName = aiMapping[req.metricField];

      if (proposedColumnName) {
        const mc = measureColumns.find(c => c.name === proposedColumnName);
        if (mc && !boundColumns.has(proposedColumnName)) {
          const { score: boundaryScore, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
          const isValidated = !req.expectedRange || boundaryScore > 0.1;
          bindings[compKey][req.role] = {
            column: proposedColumnName,
            field_identity: mc.fi,
            match_pass: isValidated ? 1 : 2,
            confidence: isValidated ? 0.9 : 0.6,
            scale_factor: scaleFactor !== 1 ? scaleFactor : undefined,
            learning_provenance: { batch_id: mc.batchId, learned_at: new Date().toISOString() },
          };
          boundColumns.add(proposedColumnName);
          console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${proposedColumnName} (AI${isValidated ? '+validated' : ''}, scale=${scaleFactor})`);
          continue;
        }
      }

      // Fallback: boundary matching for unmapped requirements (HF-111 logic)
      // HF-222 Phase 2: boundary-fallback acceptance uses distribution-derived distinguishability.
      const candidates = measureColumns
        .filter(mc => !boundColumns.has(mc.name))
        .map(mc => {
          const { score, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
          return { ...mc, score, scaleFactor };
        })
        .sort((a, b) => b.score - a.score);

      if (candidates.length > 0 && distinctEnoughToBind(candidates)) {
        const best = candidates[0];
        bindings[compKey][req.role] = {
          column: best.name,
          field_identity: best.fi,
          match_pass: 3,
          confidence: Math.min(0.7, match.matchConfidence * (0.3 + best.score * 0.4)),
          scale_factor: best.scaleFactor !== 1 ? best.scaleFactor : undefined,
          learning_provenance: { batch_id: best.batchId, learned_at: new Date().toISOString() },
        };
        boundColumns.add(best.name);
        console.log(`[Convergence] HF-222 ${comp.name}:${req.role} → ${best.name} (distribution-distinct, top=${candidates[0].score.toFixed(4)})`);
      } else if (candidates.length > 0) {
        console.log(`[Convergence] HF-222: ${comp.name}:${req.role}: candidate distribution insufficient to bind (top=${candidates[0].score.toFixed(4)}, n=${candidates.length}); surfacing as convergence gap.`);
      }
    }

    // ... (HF-218 Component 1 entity-identifier self-verification follows; not reproduced here)
  }
}
```

### Phase 2.3 -- `distinctEnoughToBind` (lines 1906-1916, verbatim)

```typescript
export function distinctEnoughToBind(scoredCandidates: Array<{ score: number }>): boolean {
  if (scoredCandidates.length === 0) return false;
  if (scoredCandidates.length === 1) {
    return scoredCandidates[0].score > 0;
  }
  const scores = scoredCandidates.map(c => c.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);
  return scoredCandidates[0].score - scoredCandidates[1].score > stddev;
}
```

### Phase 2.4 -- Candidate scoring (`scoreColumnForRequirement`, lines 1339-1386, verbatim)

```typescript
function scoreColumnForRequirement(
  columnName: string,
  stats: ColumnValueStats,
  requirement: ComponentInputRequirement,
): { score: number; scaleFactor: number } {
  if (!requirement.expectedRange) {
    // No boundaries to match — return baseline score
    return { score: 0.1, scaleFactor: 1 };
  }

  const { min: expMin, max: expMax } = requirement.expectedRange;
  if (expMax <= expMin) return { score: 0.1, scaleFactor: 1 };

  let bestScore = 0;
  let bestScale = 1;

  // Try multiple scale factors: raw, ×100 (ratio→percentage), ×1000
  const scales = [1, 100];
  for (const scale of scales) {
    const scaledMin = stats.min * scale;
    const scaledMax = stats.max * scale;

    // Does the scaled column range overlap with the boundary range?
    if (scaledMax >= expMin * 0.5 && scaledMin <= expMax * 2) {
      const overlapMin = Math.max(scaledMin, expMin);
      const overlapMax = Math.min(scaledMax, expMax);
      const overlap = Math.max(0, overlapMax - overlapMin);
      const boundarySpan = expMax - expMin;
      const columnSpan = scaledMax - scaledMin;

      const coverageRatio = boundarySpan > 0 ? overlap / boundarySpan : 0;
      const excessRatio = columnSpan > 0 && boundarySpan > 0
        ? Math.min(1, boundarySpan / columnSpan)
        : 0.5;

      const fitScore = coverageRatio * 0.6 + excessRatio * 0.4;
      if (fitScore > bestScore) {
        bestScore = fitScore;
        bestScale = scale;
      }
    }
  }

  return { score: bestScore, scaleFactor: bestScale };
}
```

The top branch (lines 1344-1347): `if (!requirement.expectedRange) { return { score: 0.1, scaleFactor: 1 } }` — returns a flat baseline of `0.1` for every column when the requirement has no expectedRange. The second guard at line 1350 (`expMax <= expMin`) also returns `0.1`. The boundary-match scoring (lines 1352-1385) only runs when both `expectedRange` is non-null AND `expMax > expMin`.

Connection back to the import log surface `(top=0.1000, n=8)`: when every candidate scores exactly `0.1`, the sorted candidate distribution is uniform; `distinctEnoughToBind` computes `mean = 0.1`, `variance = 0`, `stddev = 0`; the gate `top - next > stddev` evaluates `0.1 - 0.1 > 0` which is `false`; binding is refused with the verbatim log line at convergence-service.ts:2079.

---

## Phase 3 -- Meridian data columns

### Phase 3.1 -- committed_data shape

```
=== committed_data sample row count: 5
=== Top-level keys: [id, tenant_id, import_batch_id, entity_id, period_id, data_type, row_data, metadata, created_at, source_date]
  id: string
  tenant_id: string
  import_batch_id: string
  entity_id: string
  period_id: object = null
  data_type: string = "entity"
  row_data: object with 8 keys: [Region, _rowIndex, _sheetName, No_Empleado, Hub_Asignado, Fecha_Ingreso, Nombre_Completo, Tipo_Coordinador]
  metadata: object with 7 keys: [source, proposalId, semantic_roles, entity_id_field, field_identities, resolved_data_type, informational_label]
  created_at: string
  source_date: object = null

=== Inspecting JSONB field "row_data" across all sample rows (entity-class):
Union of all keys: [Fecha_Ingreso, Hub_Asignado, No_Empleado, Nombre_Completo, Region, Tipo_Coordinador, _rowIndex, _sheetName]

=== Rows by data_type:
  entity:      67   (batch 00389689-2dbe-40ca-a42b-d2f7b30ebbc7)
  transaction: 201  (batch 41d0acba-328b-46ae-9480-1e59f5690a39)
  reference:   36   (batch 82f30cba-ba77-42e8-aec9-637208f9c0b6)

Total Meridian committed_data rows: 304
```

### Phase 3.2 -- Fleet/Hub data columns (full inventory across all rows)

```
=== ALL columns (>>> = fleet-pattern match: /hub|fleet|load|capacity|utiliz/i) ===
    Año                           rows={transaction:201, reference:36}  samples=[2025, 2025, 2025]
>>> Capacidad_Flota_Hub           rows={transaction:201}                 samples=[1306, 1306, 1306]
    Capacidad_Total               rows={reference:36}                    samples=[1306, 951, 805]
>>> Cargas_Flota_Hub              rows={transaction:201}                 samples=[1083, 1083, 1083]
    Cargas_Totales                rows={reference:36}                    samples=[1083, 898, 846]
    Cuentas_Nuevas                rows={transaction:201}                 samples=[8, 6, 3]
    Cumplimiento_Ingreso          rows={transaction:201}                 samples=[1.2156, 1.1031, 0.7545]
    Entregas_Tiempo               rows={transaction:201}                 samples=[97, 34, 63]
    Entregas_Totales              rows={transaction:201}                 samples=[99, 43, 73]
    Fecha_Ingreso                 rows={entity:67}                       samples=["2018-04-08", "2021-04-15", "2021-02-12"]
>>> Hub                           rows={transaction:201, reference:36}   samples=["Monterrey Hub", "Monterrey Hub", ...]
>>> Hub_Asignado                  rows={entity:67}                       samples=["Monterrey Hub", "Monterrey Hub", ...]
    Incidentes_Seguridad          rows={transaction:201}                 samples=[0, 0, 0]
    Ingreso_Meta                  rows={transaction:201}                 samples=[361978, 356580, 392062]
    Ingreso_Real                  rows={transaction:201}                 samples=[440003, 393346, 295798]
    Mes                           rows={transaction:201, reference:36}   samples=[1, 1, 1]
    No_Empleado                   rows={entity:67, transaction:201}      samples=["70010", "70019", "70028"]
    Nombre                        rows={transaction:201}                 samples=["Antonio López Hernández", ...]
    Nombre_Completo               rows={entity:67}                       samples=["Antonio López Hernández", ...]
    Pct_Entregas_Tiempo           rows={transaction:201}                 samples=[0.9798, 0.7907, 0.863]
    Region                        rows={entity:67, transaction:201, reference:36}  samples=["Norte", "Norte", "Norte"]
>>> Tasa_Utilizacion              rows={reference:36}                    samples=[0.8292, 0.9443, 1.0509]
>>> Tasa_Utilizacion_Hub          rows={transaction:201}                 samples=[0.8292, 0.8292, 0.8292]
    Tipo_Coordinador              rows={entity:67, transaction:201}      samples=["Coordinador Senior", "Coordinador", ...]
>>> Volumen_Rutas_Hub             rows={transaction:201}                 samples=[1083, 1083, 1083]
    _rowIndex / _sheetName        (metadata markers)
```

**Fleet-pattern columns (subset):**
- `Capacidad_Flota_Hub` (numeric, transaction-rows-only, 201 rows; values ~1306)
- `Cargas_Flota_Hub` (numeric, transaction-rows-only, 201 rows; values ~1083)
- `Volumen_Rutas_Hub` (numeric, transaction-rows-only, 201 rows; values ~1083)
- `Tasa_Utilizacion_Hub` (numeric, transaction-rows-only, 201 rows; values ~0.8292 — a precomputed ratio)
- `Hub` / `Hub_Asignado` (string identifiers — "Monterrey Hub" etc.)
- `Tasa_Utilizacion` (numeric, reference-rows-only, 36 rows; values 0.8292-1.0509)
- `Capacidad_Total` / `Cargas_Totales` (reference-rows-only)

The numeric columns `Cargas_Flota_Hub` (numerator-eligible) and `Capacidad_Flota_Hub` (denominator-eligible) both exist on transaction-class rows with 201 populated values. The C5 plan intent declares the ratio source as `numerator: "hub_total_loads"` / `denominator: "hub_total_capacity"` — programmatic metric names that do not match the actual data column names. Mapping from `hub_total_loads` → `Cargas_Flota_Hub` is the AI-mapping responsibility (resolveColumnMappingsViaAI at line 2005) or the boundary-fallback responsibility (lines 2055-2080) depending on which path executes.
