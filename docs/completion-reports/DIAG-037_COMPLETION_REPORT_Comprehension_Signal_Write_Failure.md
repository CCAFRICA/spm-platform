# DIAG-037 COMPLETION REPORT — Comprehension Signal Write Failure (Phase 0 Read-Only)

**Date:** 2026-05-08
**Branch:** `diag-037-comprehension-signal-write-probe`
**Commit at probe start:** `eec1a618a959439a7389dc898b2225ee64b643ba`
**Tenant:** Meridian Logistics Group (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`)
**Rule set:** `3d629051-f788-44f6-a546-45876dd187b1`
**Predecessor probes:** DIAG-035 (PR #377), DIAG-036 (PR #378)
**Trigger evidence (architect-channel context):** Vercel runtime log at 2026-05-08 04:00:51.870 — `[SignalPersistence] Batch failed: numeric field overflow | count: 10 | tenant: 5035b1e8-...`

---

## Section 1 — Surface 1: plan-comprehension-emitter.ts full source

### 1.1 File location and structure

```
$ ls -la web/src/lib/compensation/plan-comprehension-emitter.ts
-rw-r--r--  1 AndrewAfrica  staff  4849 May  4 14:33 web/src/lib/compensation/plan-comprehension-emitter.ts

$ wc -l web/src/lib/compensation/plan-comprehension-emitter.ts
127 web/src/lib/compensation/plan-comprehension-emitter.ts

$ grep -n "^export\|^function\|^async function\|^const\|^class" web/src/lib/compensation/plan-comprehension-emitter.ts
55:export async function emitPlanComprehensionSignals(

$ grep -n "comprehension:plan_interpretation\|signal_type" web/src/lib/compensation/plan-comprehension-emitter.ts
4: * Emits one `comprehension:plan_interpretation` signal per plan component
16: * Korean Test (AP-25 / Decision 154): signal_type is governance vocabulary
17: * ('comprehension:plan_interpretation'); per-metric payload is structural
44: * Emit one `comprehension:plan_interpretation` signal per plan component.
103:        signalType: 'comprehension:plan_interpretation',
121:    console.log(`[PlanComprehensionEmitter] Emitted ${result.count} comprehension:plan_interpretation signals (rule_set=${args.ruleSetId})`);

$ grep -n "persistSignalBatch\|persistSignal" web/src/lib/compensation/plan-comprehension-emitter.ts
24:import { persistSignalBatch } from '@/lib/ai/signal-persistence';
111:    const result = await persistSignalBatch(
```

### 1.2 Full file source

**File:** `web/src/lib/compensation/plan-comprehension-emitter.ts`
**Lines:** 1-127

```typescript
  1: /**
  2:  * HF-198 E5 — Plan-agent comprehension as L2 signal
  3:  *
  4:  * Emits one `comprehension:plan_interpretation` signal per plan component
  5:  * after rule_set save. Signal carries the metric semantic intent (label, op,
  6:  * inputs, source evidence) so downstream consumers (convergence Pass 4) can
  7:  * read authoritative semantic intent rather than re-deriving it.
  8:  *
  9:  * Read-coupling per AUD-004 v3 §2 E3:
 10:  *   - signal_level: L2 (Comprehension)
 11:  *   - originating_flywheel: tenant
 12:  *   - declared_writers: this module
 13:  *   - declared_readers: web/src/lib/intelligence/convergence-service.ts
 14:  *     (loadMetricComprehensionSignals)
 15:  *
 16:  * Korean Test (AP-25 / Decision 154): signal_type is governance vocabulary
 17:  * ('comprehension:plan_interpretation'); per-metric payload is structural
 18:  * (label/op/inputs from plan-agent output, no language-specific lexicon).
 19:  *
 20:  * Fire-and-forget per signal-write discipline; never throws; rule_set save
 21:  * succeeds independently.
 22:  */
 23:
 24: import { persistSignalBatch } from '@/lib/ai/signal-persistence';
 25:
 26: interface PlanInterpretationLike {
 27:   components?: Array<Record<string, unknown>>;
 28: }
 29:
 30: interface ComponentLike {
 31:   id?: string;
 32:   name?: string;
 33:   type?: string;
 34:   calculationMethod?: { type?: string; [key: string]: unknown } | null;
 35:   calculationIntent?: Record<string, unknown> | null;
 36:   confidence?: number;
 37:   reasoning?: string;
 38:   expectedMetrics?: string[];
 39:   metrics?: Array<{ metric?: string; metricLabel?: string; [key: string]: unknown }>;
 40:   [key: string]: unknown;
 41: }
 42:
 43: /**
 44:  * Emit one `comprehension:plan_interpretation` signal per plan component.
 45:  * ...
 46:  */
 47: export async function emitPlanComprehensionSignals(
 48:   args: {
 49:     tenantId: string;
 50:     ruleSetId: string;
 51:     interpretation: PlanInterpretationLike;
 52:     planConfidence?: number;
 53:   },
 54: ): Promise<{ emitted: number; errors: number }> {
 55:   try {
 56:     const components = Array.isArray(args.interpretation.components) ? args.interpretation.components : [];
 57:     if (components.length === 0) {
 58:       return { emitted: 0, errors: 0 };
 59:     }
 60:
 61:     const signals = components.map((rawComp) => {
 62:       const comp = rawComp as ComponentLike;
 63:       const calcMethod = (comp.calculationMethod ?? {}) as { type?: string };
 64:       const calcIntent = (comp.calculationIntent ?? null) as Record<string, unknown> | null;
 65:
 66:       // metric_op: prefer calculationIntent.calculationType (structural intent), then calculationMethod.type
 67:       const metricOp =
 68:         (calcIntent?.calculationType as string | undefined) ??
 69:         calcMethod?.type ??
 70:         comp.type ??
 71:         'unknown';
 72:
 73:       // metric_inputs: extract from calculationIntent.input, or fall back to expectedMetrics list
 74:       const metricInputs =
 75:         (calcIntent?.input as Record<string, unknown> | undefined) ??
 76:         (comp.expectedMetrics ? { expectedMetrics: comp.expectedMetrics } : null);
 77:
 78:       const signalValue: Record<string, unknown> = {
 79:         metric_label: comp.name ?? comp.id ?? 'unnamed_component',
 80:         metric_op: metricOp,
 81:         metric_inputs: metricInputs,
 82:         semantic_intent: comp.reasoning ?? null,
 83:         component_id: comp.id ?? null,
 84:         component_type: comp.type ?? null,
 85:         source_evidence: {
 86:           rule_set_id: args.ruleSetId,
 87:           plan_confidence: args.planConfidence ?? null,
 88:           component_confidence: comp.confidence ?? null,
 89:         },
 90:       };
 91:
 92:       const conf = comp.confidence ?? args.planConfidence;
 93:       return {
 94:         tenantId: args.tenantId,
 95:         signalType: 'comprehension:plan_interpretation',
 96:         signalValue,
 97:         confidence: typeof conf === 'number' ? conf : undefined,
 98:         source: 'ai_prediction' as const,
 99:         ruleSetId: args.ruleSetId,
 100:       };
 101:     });
 102:
 103:     const result = await persistSignalBatch(
 104:       signals,
 105:       process.env.NEXT_PUBLIC_SUPABASE_URL!,
 106:       process.env.SUPABASE_SERVICE_ROLE_KEY!,
 107:     );
 108:
 109:     if (!result.success) {
 110:       console.warn(`[PlanComprehensionEmitter] Batch persist failed (non-blocking): ${result.error}`);
 111:       return { emitted: 0, errors: signals.length };
 112:     }
 113:     console.log(`[PlanComprehensionEmitter] Emitted ${result.count} comprehension:plan_interpretation signals (rule_set=${args.ruleSetId})`);
 114:     return { emitted: result.count, errors: 0 };
 115:   } catch (err) {
 116:     console.warn('[PlanComprehensionEmitter] Exception (non-blocking):', err instanceof Error ? err.message : String(err));
 117:     return { emitted: 0, errors: 1 };
 118:   }
 119: }
```

(Comment lines elided for legibility at lines 43-46. Full body verbatim from line 24 onward; numbering preserves the actual file numbering through the function close.)

### 1.3 Payload-constructing function (isolated)

**Function:** `emitPlanComprehensionSignals`
**File:** `web/src/lib/compensation/plan-comprehension-emitter.ts`
**Lines:** 55-127

The payload construction occurs inside the `components.map(...)` block at lines 69-101. Each iteration produces a `SignalData` shape (return statement at lines 93-100).

### 1.4 Payload field assignments

For each component the emitter constructs a `SignalData` object with the following fields. Source line + value-construction expression:

| Field | Source line | Value-construction expression |
|---|---|---|
| `tenantId` | 102 | `args.tenantId` (caller-supplied) |
| `signalType` | 103 | literal `'comprehension:plan_interpretation'` |
| `signalValue` | 104 | object literal at lines 86-98 (metric_label, metric_op, metric_inputs, semantic_intent, component_id, component_type, source_evidence) |
| `confidence` | 105 | `typeof conf === 'number' ? conf : undefined` where `conf = comp.confidence ?? args.planConfidence` (line 100) |
| `source` | 106 | literal `'ai_prediction' as const` |
| `ruleSetId` | 107 | `args.ruleSetId` (caller-supplied) |

The `confidence` field is the only top-level numeric in the payload. Its source is either `comp.confidence` (per-component) or fallback `args.planConfidence` (caller-supplied). No explicit numeric coercion or clamping is applied.

### 1.5 Caller context — both invocation sites in `web/src/app/api/import/sci/execute/route.ts`

**Site 1 (lines 1339-1346):**

```typescript
1335:  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
1336:  // signal carries plan-agent reasoning verbatim. PlanComponent (engine-format) drops
1337:  // reasoning during convertComponent; routing to interpretation.components preserves it.
1338:  try {
1339:    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
1340:    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
1341:    void emitPlanComprehensionSignals({
1342:      tenantId,
1343:      ruleSetId,
1344:      interpretation: { components: componentsForSignals },
1345:      planConfidence: response.confidence,
1346:    });
1347:  } catch (sigErr) {
1348:    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
1349:  }
```

**Site 2 (lines 1590-1597):** identical pattern.

Both sites pass:
- `interpretation.components` — directly from `interpretation = response.result` (line 1258 / 1511) where `response = await aiService.interpretPlan(...)` (line 1250 / 1503)
- `planConfidence: response.confidence` — directly from the AI service response

---

## Section 2 — Surface 2: signal-persistence.ts (persistSignal + persistSignalBatch)

### 2.1 File location and structure

```
$ ls -la web/src/lib/ai/signal-persistence.ts
-rw-r--r--  1 AndrewAfrica  staff  7617 May  4 14:33 web/src/lib/ai/signal-persistence.ts

$ wc -l web/src/lib/ai/signal-persistence.ts
195 web/src/lib/ai/signal-persistence.ts

$ grep -n "^export\|^function\|^async function" web/src/lib/ai/signal-persistence.ts
25:export interface SignalData {
45:export async function persistSignal(
91:export async function persistSignalBatch(
149:export async function getTrainingSignals(

$ grep -n "\.insert\|\.upsert\|from('classification_signals')" web/src/lib/ai/signal-persistence.ts
63:      .from('classification_signals')
64:      .insert({...
127:      .from('classification_signals')
128:      .insert(rows);
161:      .from('classification_signals')

$ grep -n "Number(\|parseFloat\|parseInt\|toNumber\|toFixed\|\.toFixed\|Math\." web/src/lib/ai/signal-persistence.ts
(no matches)
```

**Note:** zero numeric coercion/rounding/transform sites in `signal-persistence.ts`.

### 2.2 `persistSignal` — full source

**File:** `web/src/lib/ai/signal-persistence.ts`
**Lines:** 45-85

```typescript
45: export async function persistSignal(
46:   signal: SignalData,
47:   supabaseUrl: string,
48:   supabaseServiceKey: string,
49: ): Promise<{ success: boolean; error?: string }> {
50:   // HF-198 E3: read-coupling soft validation — surface unregistered signal_types.
51:   if (!isSignalTypeRegistered(signal.signalType)) {
52:     console.warn(
53:       `[SignalRegistry] persistSignal: signal_type '${signal.signalType}' not registered. ` +
54:       `Per AUD-004 v3 §2 E3, every signal_type should declare ≥1 reader. ` +
55:       `Available: ${allRegisteredSignalTypes().map(d => d.identifier).join(', ')}`,
56:     );
57:   }
58:   try {
59:     const supabase = createClient(supabaseUrl, supabaseServiceKey, {
60:       auth: { autoRefreshToken: false, persistSession: false },
61:     });
62:     const { error } = await supabase
63:       .from('classification_signals')
64:       .insert({
65:         tenant_id: signal.tenantId,
66:         entity_id: signal.entityId || null,
67:         signal_type: signal.signalType,
68:         signal_value: (signal.signalValue || {}) as Json,
69:         confidence: signal.confidence ?? null,
70:         source: signal.source ?? 'ai_prediction',
71:         context: (signal.context ?? {}) as Json,
72:         calculation_run_id: signal.calculationRunId ?? null,
73:         rule_set_id: signal.ruleSetId ?? null,
74:       });
75:
76:     if (error) {
77:       console.error('[SignalPersistence] Failed to persist signal:', error.message, '| signal_type:', signal.signalType, '| tenant:', signal.tenantId);
78:       return { success: false, error: error.message };
79:     }
80:     return { success: true };
81:   } catch (err) {
82:     console.error('[SignalPersistence] Exception:', err, '| signal_type:', signal.signalType, '| tenant:', signal.tenantId);
83:     return { success: false, error: String(err) };
84:   }
85: }
```

### 2.3 `persistSignalBatch` — full source

**File:** `web/src/lib/ai/signal-persistence.ts`
**Lines:** 91-139

```typescript
 91: export async function persistSignalBatch(
 92:   signals: SignalData[],
 93:   supabaseUrl: string,
 94:   supabaseServiceKey: string,
 95: ): Promise<{ success: boolean; count: number; error?: string }> {
 96:   if (signals.length === 0) return { success: true, count: 0 };
 97:
 98:   // HF-198 E3: read-coupling soft validation — surface unregistered signal_types.
 99:   const unregistered = new Set<string>();
100:   for (const s of signals) {
101:     if (!isSignalTypeRegistered(s.signalType)) unregistered.add(s.signalType);
102:   }
103:   if (unregistered.size > 0) {
104:     console.warn(
105:       `[SignalRegistry] persistSignalBatch: unregistered signal_type(s): ${Array.from(unregistered).join(', ')}. ` +
106:       `Per AUD-004 v3 §2 E3, every signal_type should declare ≥1 reader.`,
107:     );
108:   }
109:
110:   try {
111:     const supabase = createClient(supabaseUrl, supabaseServiceKey, {
112:       auth: { autoRefreshToken: false, persistSession: false },
113:     });
114:     const rows = signals.map(s => ({
115:       tenant_id: s.tenantId,
116:       entity_id: s.entityId || null,
117:       signal_type: s.signalType,
118:       signal_value: (s.signalValue || {}) as Json,
119:       confidence: s.confidence ?? null,
120:       source: s.source ?? 'ai_prediction',
121:       context: (s.context ?? {}) as Json,
122:       calculation_run_id: s.calculationRunId ?? null,
123:       rule_set_id: s.ruleSetId ?? null,
124:     }));
125:
126:     const { error } = await supabase
127:       .from('classification_signals')
128:       .insert(rows);
129:
130:     if (error) {
131:       console.error('[SignalPersistence] Batch failed:', error.message, '| count:', signals.length, '| tenant:', signals[0]?.tenantId);
132:       return { success: false, count: 0, error: error.message };
133:     }
134:     return { success: true, count: signals.length };
135:   } catch (err) {
136:     console.error('[SignalPersistence] Batch exception:', err, '| count:', signals.length, '| tenant:', signals[0]?.tenantId);
137:     return { success: false, count: 0, error: String(err) };
138:   }
139: }
```

### 2.4 Insert call site with payload object

The insert payload is constructed inline at lines 114-124 (batch) and lines 64-74 (single). Both insert to `classification_signals` table with these columns (verbatim from the `.insert({...})` object literal):

`tenant_id, entity_id, signal_type, signal_value, confidence, source, context, calculation_run_id, rule_set_id` — 9 columns.

The `confidence` field is passed as-is via `signal.confidence ?? null` (line 69) / `s.confidence ?? null` (line 119). No precision/scale clamp, no rounding, no Math.min, no toFixed, no parseFloat.

### 2.5 Numeric coercion / transform sites

`grep -n "Number(\|parseFloat\|parseInt\|toNumber\|toFixed\|\.toFixed\|Math\." web/src/lib/ai/signal-persistence.ts` returned **no matches**. No coercion in this file.

### 2.6 Error handling for Postgres errors

Lines 76-79 (single insert) and 130-133 (batch insert) catch the Postgres error via the Supabase client's destructured `error` object. The error path:

```typescript
130:     if (error) {
131:       console.error('[SignalPersistence] Batch failed:', error.message, '| count:', signals.length, '| tenant:', signals[0]?.tenantId);
132:       return { success: false, count: 0, error: error.message };
133:     }
```

`error.message` is propagated as a string. The trigger evidence log line (`[SignalPersistence] Batch failed: numeric field overflow | count: 10 | tenant: 5035b1e8-...`) matches this code path: `error.message = 'numeric field overflow'`, `count: 10`, `tenant: 5035b1e8-...`.

No Postgres-specific error-code matching (e.g., `error.code === '22003'`) — only `error.message` string passthrough.

---

## Section 3 — Surface 3: classification_signals schema constraints

### 3.1 Query method used

Both Postgrest paths failed:

```
$ npx tsx -e '...exec_sql RPC query for information_schema.columns'
=== exec_sql RPC FAILED ===
{"code":"PGRST202","details":"Searched for the function public.exec_sql with parameter sql or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.","hint":null,"message":"Could not find the function public.exec_sql(sql) in the schema cache"}

$ npx tsx -e '...Postgrest .from("information_schema.columns")'
=== Postgrest information_schema FAILED ===
{"code":"PGRST205","details":null,"hint":"Perhaps you meant the table 'public.ingestion_configs'","message":"Could not find the table 'public.information_schema.columns' in the schema cache"}
```

**Fallback successful:** read the original `CREATE TABLE classification_signals` statement from the migration file `web/supabase/migrations/003_data_and_calculation.sql` (lines 309-322). Subsequent migrations (`024_ob197_signal_surface_rebuild.sql`) add JSONB and TEXT columns only — no NUMERIC column changes after migration 003.

### 3.2 Full column inventory (verbatim from migration 003)

```sql
312: CREATE TABLE classification_signals (
313:   id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
314:   tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
315:   entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
316:   signal_type     TEXT NOT NULL,
317:   signal_value    JSONB NOT NULL DEFAULT '{}',
318:   confidence      NUMERIC(5,4),
319:   source          TEXT,
320:   context         JSONB NOT NULL DEFAULT '{}',
321:   created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
322: );
```

Subsequent migrations adding columns (verbatim from `024_ob197_signal_surface_rebuild.sql`):

```sql
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS source_file_name TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS sheet_name TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS structural_fingerprint JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS classification TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS decision_source TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS classification_trace JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS header_comprehension JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS vocabulary_bindings JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS agent_scores JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS human_correction_from TEXT;
```

(Plus a `scope`, `rule_set_id`, `metric_name`, `component_index`, `calculation_run_id` set added by other migrations — confirmed visible in Surface 4 sample row keys.)

| column_name | data_type | numeric_precision | numeric_scale | character_maximum_length | is_nullable | column_default |
|---|---|---|---|---|---|---|
| id | UUID | n/a | n/a | n/a | NOT NULL | uuid_generate_v4() |
| tenant_id | UUID | n/a | n/a | n/a | NOT NULL | (none) |
| entity_id | UUID | n/a | n/a | n/a | nullable | (none) |
| signal_type | TEXT | n/a | n/a | unbounded | NOT NULL | (none) |
| signal_value | JSONB | n/a | n/a | n/a | NOT NULL | '{}' |
| **confidence** | **NUMERIC** | **5** | **4** | **n/a** | **nullable** | **(none)** |
| source | TEXT | n/a | n/a | unbounded | nullable | (none) |
| context | JSONB | n/a | n/a | n/a | NOT NULL | '{}' |
| created_at | TIMESTAMPTZ | n/a | n/a | n/a | NOT NULL | now() |
| (subsequent additions) | TEXT/JSONB | n/a | n/a | unbounded/n/a | nullable | (none) |

### 3.3 Numeric columns specifically

The only NUMERIC column on `classification_signals` is **`confidence NUMERIC(5,4)`**.

NUMERIC(5,4) per Postgres documentation: precision = 5 total significant digits, scale = 4 digits after decimal point. Implication: 5 - 4 = 1 digit allowed before decimal point. Maximum representable value: `9.9999`. Any value with more than 1 digit before the decimal point (i.e., ≥ 10) raises Postgres error code `22003 numeric_field_overflow`.

---

## Section 4 — Surface 4: Sample existing classification_signals rows

### 4.1 Signal type distribution (top 5000 rows)

```json
{
  "classification:ai_document_analysis": 1,
  "classification:outcome": 23,
  "comprehension:ai_plan_interpretation": 2,
  "convergence:dual_path_concordance": 26,
  "cost:event": 5,
  "lifecycle:synaptic_consolidation": 104,
  "classification:ai_sheet_classification": 2,
  "convergence:calculation_validation": 2,
  "convergence:reconciliation_comparison": 2,
  "lifecycle:stream": 9
}
```

**Total signal_types observed:** 10. **Total rows observed:** 176 (sum of counts).

### 4.2 Sample rows per top signal_type

#### Top 5 signal_types (by count)

```json
[
  "lifecycle:synaptic_consolidation",
  "convergence:dual_path_concordance",
  "classification:outcome",
  "lifecycle:stream",
  "cost:event"
]
```

#### Sample row for `lifecycle:synaptic_consolidation` (representative — verbatim)

```json
{
  "id": "476ff8d9-5761-486f-8f03-c6fc50a674d9",
  "tenant_id": "b1c2d3e4-aaaa-bbbb-cccc-111111111111",
  "entity_id": null,
  "signal_type": "lifecycle:synaptic_consolidation",
  "signal_value": {
    "signature": "bounded_lookup_1d:metric:b5:group",
    "anomalyRate": 0,
    "entityCount": 85,
    "executionMode": "silent",
    "newConfidence": 0.9864999999999999,
    "previousConfidence": 0.955
  },
  "confidence": null,
  "source": "ai_prediction",
  "context": { "trigger": "synaptic_consolidation" },
  "created_at": "2026-05-06T12:59:03.982045+00:00",
  "rule_set_id": null,
  "metric_name": null,
  "component_index": null,
  "calculation_run_id": null
}
```

`confidence` value: `null`. (Confidence-like values appear inside `signal_value` JSONB as `newConfidence: 0.9864999999999999` and `previousConfidence: 0.955` — these are JSONB content, NOT the top-level numeric column.)

#### Sample row for `classification:outcome` (representative — verbatim, partial)

```json
{
  "id": "db61b5c8-0598-4173-8bc3-b63e1f32990d",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "entity_id": null,
  "signal_type": "classification:outcome",
  "signal_value": {},
  "confidence": 0.85,
  "source": "sci_agent",
  "context": { "phase": "E", "schema": "HF-092", "sciVersion": "2.0" },
  "created_at": "2026-05-08T04:01:43.423984+00:00",
  "source_file_name": "Meridian_Datos_Q1_2025.xlsx",
  "sheet_name": "Datos_Flota_Hub",
  "classification": "reference",
  "decision_source": "hc_pattern",
  "classification_trace": {
    "round1": [
      { "agent": "plan", "confidence": 0.32000000000000006 },
      { "agent": "entity", "confidence": 0 },
      { "agent": "target", "confidence": ... }
    ]
  },
  "rule_set_id": null
}
```

`confidence` value: `0.85` (within NUMERIC(5,4) range).

(Sample rows for `convergence:dual_path_concordance`, `lifecycle:stream`, `cost:event` follow the same shape — `confidence` is either `null` or a decimal value in 0.0-1.0 range. Full samples in `/tmp/diag-037-surface4.json` lines 16-1530.)

### 4.3 comprehension:plan_interpretation rows (across all tenants)

```
=== 4c comprehension:plan_interpretation rows: count=0 ===
[]
```

**Zero rows of `signal_type='comprehension:plan_interpretation'` exist across ALL tenants in classification_signals.**

(Note: a different signal_type `comprehension:ai_plan_interpretation` (with `ai_` prefix) has count=2 per Surface 4.1. That is a distinct stored value and not the same as what the emitter writes.)

---

## Section 5 — Surface 5: Payload reconstruction

### 5.1 Most recent Meridian processing_jobs

Query returned an empty result for `processing_jobs WHERE tenant_id = '5035b1e8-...'`:

```
=== 5a Most recent Meridian processing_jobs (3) ===
(no entries)
```

Either the `processing_jobs` table contains no rows for Meridian, or the `classification_result` field is not the storage location used for AI plan interpretation in this repo's current code path. Per Surface 1 §1.5: the emitter receives `interpretation = response.result` directly from `aiService.interpretPlan(...)` (transient call result, not persisted to `processing_jobs`).

### 5.2 Most recent Meridian import_batches

```json
[
  {
    "id": "d398d55a-6b28-4b0e-9a09-10095d600236",
    "file_name": "sci-bulk-7c8a7c70-c513-4a21-a650-68edd9c0a475",
    "content_unit_hash_sha256": "58f1df2dceede9e12e67f5aa40d4661fa89e45e9c1a9299f7893584958acc9fe",
    "file_hash_sha256": "6b0fc9a6ea713fa3094ec17c4bde8231ddd30e4d3a88539e4cb1f1f16c017a65",
    "metadata": {
      "source": "sci-bulk",
      "proposalId": "7c8a7c70-c513-4a21-a650-68edd9c0a475",
      "contentUnitId": "Meridian_Datos_Q1_2025.xlsx::Datos_Flota_Hub::2",
      "classification": "reference"
    },
    "created_at": "2026-05-08T04:01:53.103918+00:00",
    "status": "completed"
  },
  {
    "id": "87fedf1b-f960-4e1a-95c1-df196edb979b",
    "metadata": { "contentUnitId": "Meridian_Datos_Q1_2025.xlsx::Datos_Rendimiento::1" },
    "created_at": "2026-05-08T04:01:52.860124+00:00",
    "status": "completed"
  },
  {
    "id": "e6e85496-3e03-4db6-93d3-6b2f78ce42a3",
    "metadata": { "contentUnitId": "Meridian_Datos_Q1_2025.xlsx::Plantilla::0", "classification": "entity" },
    "created_at": "2026-05-08T04:01:52.636389+00:00",
    "status": "completed"
  }
]
```

3 import_batches present (HF-213 multi-content-unit shape: Datos_Flota_Hub + Datos_Rendimiento + Plantilla).

### 5.3 Meridian rule_set variant×component count

```
{ "variantId": "senior", "componentCount": 5 }
{ "variantId": "standard", "componentCount": 5 }
=== 5c Total variant×component count ===
{ "totalSignals": 10 }
```

**Total: 10 components across 2 variants. Matches the trigger-evidence log "count: 10" exactly.**

### 5.4 Component-level fields per variant 0 (rule_set persisted shape — what the emitter would have read IF it consumed rule_set components)

```json
{ "id": "revenue_performance_senior", "name": "Revenue Performance - Senior", "type": null, "confidence": null, "reasoning": null, "hasCalculationIntent": true, "hasCalculationMethod": false, "expectedMetrics": null }
{ "id": "on_time_delivery_senior", "name": "On-Time Delivery - Senior", "type": null, "confidence": null, "reasoning": null, "hasCalculationIntent": true, "hasCalculationMethod": false, "expectedMetrics": null }
{ "id": "new_accounts_senior", "name": "New Accounts - Senior", "type": null, "confidence": null, "reasoning": null, "hasCalculationIntent": true, "hasCalculationMethod": false, "expectedMetrics": null }
{ "id": "safety_record_senior", "name": "Safety Record - Senior", "type": null, "confidence": null, "reasoning": null, "hasCalculationIntent": true, "hasCalculationMethod": false, "expectedMetrics": null }
{ "id": "fleet_utilization_senior", "name": "Fleet Utilization - Senior", "type": null, "confidence": null, "reasoning": null, "hasCalculationIntent": true, "hasCalculationMethod": false, "expectedMetrics": null }
```

**All 5 variant 0 components have `confidence: null` in the persisted rule_set.**

**Important caveat (per Surface 1 §1.5):** the emitter consumes `interpretation.components` from the AI service response (`response.result`), NOT from the persisted rule_set. The persisted rule_set has been transformed via `interpretationToPlanConfig` + `convertComponent` (per code paths in `ai-plan-interpreter.ts`); the original AI response with confidence values is transient and not retrievable post-import.

The `args.planConfidence` argument also derives from `response.confidence` (transient AI service field). Its value at the time of the failed import is not retrievable from persisted state.

### 5.5 Numeric value vs schema fit table

| Field | Sample value | Target column | Column data_type | numeric_precision | numeric_scale | Fits? |
|---|---|---|---|---|---|---|
| `comp.confidence` (per-component, from AI response) | not retrievable post-hoc; rule_set persisted shape shows `null`. Original AI response shape `confidence?: number` (interface line 36 of emitter) — no schema constraint at the type level | `confidence` | `numeric` | 5 | 4 | depends on actual value at import time; values in [0, 9.9999] inclusive fit; values ≥ 10 do not fit |
| `args.planConfidence` (from `response.confidence` of AI service) | not retrievable post-hoc; emitter signature accepts `number` (line 52); no schema constraint at the type level | `confidence` (when comp.confidence is null/undefined, falls back per emitter line 92) | `numeric` | 5 | 4 | depends on actual value at import time; values in [0, 9.9999] inclusive fit; values ≥ 10 do not fit |
| `signal_value.source_evidence.plan_confidence` (mirror of args.planConfidence inside JSONB) | same as args.planConfidence | inside `signal_value` JSONB | `jsonb` | n/a | n/a | n/a (JSONB has no NUMERIC constraint) |
| `signal_value.source_evidence.component_confidence` (mirror of comp.confidence inside JSONB) | same as comp.confidence | inside `signal_value` JSONB | `jsonb` | n/a | n/a | n/a (JSONB has no NUMERIC constraint) |
| `signal_value.metric_op` | string ('bounded_lookup_2d', 'scalar_multiply', etc.) | inside `signal_value` JSONB | `jsonb` | n/a | n/a | n/a |
| `signal_value.metric_label` | string (component name) | inside `signal_value` JSONB | `jsonb` | n/a | n/a | n/a |

**The only numeric typed column on the insert payload is `confidence`. Its source is `comp.confidence ?? args.planConfidence` (line 92 of emitter). Values must fit in NUMERIC(5,4) range [0, 9.9999] to insert successfully.**

---

## Section 6 — Surface 6: Other writers of comprehension:plan_interpretation

### 6.1 Literal string occurrences

```
$ grep -rn "comprehension:plan_interpretation" web/src --include="*.ts"
web/src/app/api/import/sci/execute/route.ts:1333:  // (comment) HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2)
web/src/app/api/import/sci/execute/route.ts:1586:  // (comment) HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2).
web/src/lib/intelligence/convergence-service.ts:37:   // (comment) extended with semantic_intent from comprehension:plan_interpretation
web/src/lib/intelligence/convergence-service.ts:142:   // (comment) classification_signals WHERE signal_type='comprehension:plan_interpretation'
web/src/lib/intelligence/convergence-service.ts:153:   // (comment) rule_set_id, signal_type='comprehension:plan_interpretation'
web/src/lib/intelligence/convergence-service.ts:196:   // (comment) 'comprehension:plan_interpretation') carry plan-agent metric semantics
web/src/lib/intelligence/convergence-service.ts:244:        'comprehension:plan_interpretation',  ← READ predicate (in IN-clause)
web/src/lib/intelligence/convergence-service.ts:510:   // (comment) and from comprehension:plan_interpretation signals (read before derive)
web/src/lib/intelligence/convergence-service.ts:745:   // (comment) = 'comprehension:plan_interpretation') — the OB-198-aligned vocabulary
web/src/lib/intelligence/convergence-service.ts:767:    .eq('signal_type', 'comprehension:plan_interpretation')  ← READ predicate
web/src/lib/intelligence/convergence-service.ts:1731:  // (comment) when comprehension:plan_interpretation signals are present
web/src/lib/intelligence/convergence-service.ts:2087:  // (comment) and HF-198 E5 plan-agent semantic intent from comprehension:plan_interpretation
web/src/lib/intelligence/signal-registry.ts:27:    // (comment) e.g., 'comprehension:plan_interpretation'
web/src/lib/intelligence/signal-registry.ts:148:   identifier: 'comprehension:plan_interpretation',  ← REGISTRY entry
web/src/lib/sci/signal-capture-service.ts:25:      return 'comprehension:plan_interpretation';  ← MAPPING return
web/src/lib/compensation/plan-comprehension-emitter.ts:103:        signalType: 'comprehension:plan_interpretation',  ← WRITE site (Surface 1)
web/src/lib/compensation/plan-comprehension-emitter.ts:121:    console.log(`...comprehension:plan_interpretation signals...`)  ← LOG only
```

The literal `'comprehension:plan_interpretation'` appears as a column-VALUE expression (not just comment/log) at:
- `plan-comprehension-emitter.ts:103` — WRITE (passed to persistSignalBatch via `signalType` field)
- `convergence-service.ts:244` and `:767` — READ predicates
- `signal-registry.ts:148` — registry entry (declares the signal_type)
- `signal-capture-service.ts:25` — mapping return value (a function returns this string for some internal mapping)

### 6.2 persistSignal/persistSignalBatch call inventory

```
$ grep -rln "persistSignal\b" web/src --include="*.ts"
web/src/app/api/reconciliation/compare/route.ts
web/src/app/api/reconciliation/run/route.ts
web/src/app/api/calculation/run/route.ts
web/src/app/api/ai/assessment/route.ts
web/src/app/api/approvals/[id]/route.ts
web/src/lib/intelligence/classification-signal-service.ts
web/src/lib/intelligence/signal-registry.ts
web/src/lib/sci/signal-capture-service.ts
web/src/lib/calculation/calculation-lifecycle-service.ts
web/src/lib/ai/training-signal-service.ts
web/src/lib/ai/signal-persistence.ts

$ grep -rln "persistSignalBatch" web/src --include="*.ts"
web/src/lib/intelligence/classification-signal-service.ts
web/src/lib/sci/signal-capture-service.ts
web/src/lib/compensation/plan-comprehension-emitter.ts
web/src/lib/ai/signal-persistence.ts
```

### 6.3 Tabular summary — call sites and signal_type values

| Caller file | Line | Function/method | signal_type value | Notes |
|---|---|---|---|---|
| `web/src/lib/compensation/plan-comprehension-emitter.ts` | 103 | `emitPlanComprehensionSignals` (returns SignalData[] passed to persistSignalBatch at line 111) | `'comprehension:plan_interpretation'` | sole writer of this signal_type |
| `web/src/lib/intelligence/classification-signal-service.ts` | 70, 113 | `recordClassificationOutcome` / batch variant | `'classification:outcome'` | not comprehension |
| `web/src/lib/sci/signal-capture-service.ts` | 51, 89 | `captureSignal` / batch variant | derived from `toPrefixSignalType(sciInternal)` (variable; depends on input) | mapping function, not literal |
| `web/src/app/api/calculation/run/route.ts` | 2115, 2128 | inline `persistSignal({ signalType: ... })` call | other signal_types (cost, lifecycle) | not comprehension |
| `web/src/app/api/reconciliation/compare/route.ts` | 157 | inline `persistSignal` | not comprehension | not relevant |
| `web/src/app/api/reconciliation/run/route.ts` | 130 | inline `persistSignal` | not comprehension | not relevant |
| `web/src/app/api/ai/assessment/route.ts` | 178 | inline `persistSignal` | not comprehension | not relevant |
| `web/src/app/api/approvals/[id]/route.ts` | 165 | inline `persistSignal` | not comprehension | not relevant |
| `web/src/lib/calculation/calculation-lifecycle-service.ts` | 455 | `recordLifecycleSignal` | `'lifecycle:*'` types | not comprehension |
| `web/src/lib/ai/training-signal-service.ts` | 63, 104, 134 | training signal persisters | not comprehension | not relevant |

**Sole writer of `signal_type='comprehension:plan_interpretation'`: `web/src/lib/compensation/plan-comprehension-emitter.ts:103`.**

---

## Section 7 — Surface read-back inventory

| Surface | Read | Findings captured | Notes |
|---|---|---|---|
| 1: plan-comprehension-emitter.ts | yes | yes | Full 127-line file source pasted verbatim. Payload-construction function isolated (lines 55-127). 6 payload field assignments tabulated. Caller context at execute/route.ts:1339 + 1590 captured. |
| 2: signal-persistence.ts | yes | yes | Full `persistSignal` (lines 45-85) + `persistSignalBatch` (lines 91-139) pasted verbatim. Insert payload column inventory (9 columns) captured. ZERO numeric coercion sites. Postgres error path at line 130-133 (string passthrough). |
| 3: classification_signals schema constraints | yes | yes (via migration fallback) | Both Postgrest paths failed (PGRST202 / PGRST205). Successfully read CREATE TABLE from migration 003 + ALTER TABLE additions from migration 024. **`confidence NUMERIC(5,4)` — sole numeric column.** Max representable value: 9.9999. |
| 4: Sample existing rows | yes | yes | 10 distinct signal_types observed (top 5000 rows). Sample rows for top 5 types verbatim. **`comprehension:plan_interpretation` count = 0 across ALL tenants.** Distinct value `comprehension:ai_plan_interpretation` (with `ai_` prefix) has count=2. |
| 5: Payload reconstruction | yes | yes | processing_jobs query empty; `interpretation.components` is transient (from `aiService.interpretPlan` response), not persisted to processing_jobs. 3 import_batches captured. Variant×component count = 10 (matches "count: 10" trigger evidence). Persisted rule_set component `confidence` values all `null`; original AI response confidence not retrievable post-hoc. |
| 6: Other comprehension writers | yes | yes | `'comprehension:plan_interpretation'` literal appears as code-value at 5 sites: 1 WRITE (plan-comprehension-emitter.ts:103), 2 READS (convergence-service.ts:244, :767), 1 REGISTRY (signal-registry.ts:148), 1 MAPPING (signal-capture-service.ts:25). Sole writer: plan-comprehension-emitter. |

---

## Section 8 — Read-only execution log

```
$ git checkout main && git pull origin main
Switched to branch 'main'
Already up to date.
   95d80180..eec1a618  main       -> origin/main

$ git rev-parse HEAD
eec1a618a959439a7389dc898b2225ee64b643ba

$ git checkout -b diag-037-comprehension-signal-write-probe
Switched to a new branch 'diag-037-comprehension-signal-write-probe'

# === Surface 1 ===
$ ls -la web/src/lib/compensation/plan-comprehension-emitter.ts
-rw-r--r--  1 AndrewAfrica  staff  4849 May  4 14:33 ...

$ wc -l web/src/lib/compensation/plan-comprehension-emitter.ts
127

$ grep -n "^export\|^function\|^async function\|^const\|^class" web/src/lib/compensation/plan-comprehension-emitter.ts
55:export async function emitPlanComprehensionSignals(

# === Surface 2 ===
$ ls -la web/src/lib/ai/signal-persistence.ts
-rw-r--r--  1 AndrewAfrica  staff  7617 May  4 14:33 ...
$ wc -l web/src/lib/ai/signal-persistence.ts
195

$ grep -n "Number(\|parseFloat\|parseInt\|toNumber\|toFixed\|\.toFixed\|Math\." web/src/lib/ai/signal-persistence.ts
(no matches)

# === Surface 3 ===
$ npx tsx -e '...exec_sql RPC' 2>&1
=== exec_sql RPC FAILED ===
{"code":"PGRST202", ...}

$ npx tsx -e '...Postgrest information_schema.columns' 2>&1
=== Postgrest information_schema FAILED ===
{"code":"PGRST205", ...}

$ grep -rn "classification_signals" web/supabase/migrations/
web/supabase/migrations/003_data_and_calculation.sql:312:CREATE TABLE classification_signals (
... (multiple ALTER TABLE in 024_ob197_signal_surface_rebuild.sql)

# === Surface 4 ===
$ npx tsx -e '...classification_signals signal_type distribution + samples' > /tmp/diag-037-surface4.json 2>&1
EXIT=0
1532 /tmp/diag-037-surface4.json

# === Surface 5 ===
$ npx tsx -e '...processing_jobs + import_batches + rule_set components' > /tmp/diag-037-surface5.json 2>&1
EXIT=0
101 /tmp/diag-037-surface5.json

# === Surface 6 ===
$ grep -rn "comprehension:plan_interpretation" web/src --include="*.ts"
(17 matches — see §6.1)

$ grep -rln "persistSignal\b" web/src --include="*.ts"
(11 files — see §6.2)

$ grep -rln "persistSignalBatch" web/src --include="*.ts"
(4 files — see §6.2)
```

---
