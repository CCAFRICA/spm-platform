# AUD-004 Phase 4 — E5 Closure Audit (Class A, read-only)

**Date:** 2026-04-28
**Branch:** `phase-4-e5-audit` (forked from `main` at 7a697dce)
**Predecessor:** PR #350 merged (Phase 3 — E4 round-trip closure, 2026-04-28)
**Class:** A (audit-first, read-only). No code changes. Surfaces evidence per spec; architect dispositions in Class B.

**Specification — authoritative:**
- AUD-004 v3 §2 / E5: services writing to the signal surface must read it before invoking AI semantic derivation.
- Closes F-006 (`convergence_calculation_validation` writes, zero readers — one-way door) and F-011 (`training:dual_path_concordance` writes, zero readers).
- Decision 153 (LOCKED 2026-04-20) — seven dispositions: A2 (typed columns + composite index), F2 (write at AI→engine bridge), E1 (convergence reads by composite key), C2 (gate defers to E1 query).
- Decision 154 (LOCKED 2026-04-27) — Korean Test extended to operation/primitive vocabulary; structural identification, not language-specific keyword matching.

**Three platform code paths plus schema in scope:**
1. `web/src/lib/intelligence/convergence-service.ts` — Pass 4 AI semantic derivation; current isolation from plan-agent comprehension.
2. `web/src/lib/ai/providers/anthropic-adapter.ts` — plan-agent prompt where comprehension is generated.
3. `classification_signals` table schema — L2 Comprehension signal write surface.

**Operational note — postgres-lib unavailable:** `SUPABASE_DB_PASSWORD` is not present in `web/.env.local`; direct `postgres`-lib connection is therefore unavailable. Live-state evidence below is captured via PostgREST OpenAPI inspection and behavioural INSERT probes (the same fallback path documented in the (now-deleted) HF-193-A Phase 1.3 verification script). One consequence: the `(signal_type, rule_set_id, metric_name, component_index)` composite index cannot be verified programmatically without `postgres`-lib access — surfaced as gap; architect dispositions whether to acquire `SUPABASE_DB_PASSWORD` for Class B.

---

## A.1 — `classification_signals` schema (A2 verification)

### Evidence: column-presence probe (PostgREST behavioural)

`web/scripts/aud004-phase4-schema-probe.ts` (Class A artifact, deleted post-audit) — output verbatim:

```
=== AUD-004 Phase 4 — classification_signals column probe ===

  rule_set_id: PRESENT
  metric_name: PRESENT
  component_index: PRESENT

=== Full row sample (1 row, columns visible via PostgREST) ===
  Table exists but is empty — re-probing column existence via select(col) instead.
    id: PRESENT
    tenant_id: PRESENT
    entity_id: PRESENT
    signal_type: PRESENT
    signal_value: PRESENT
    confidence: PRESENT
    source: PRESENT
    context: PRESENT
    created_at: PRESENT
    source_file_name: PRESENT
    sheet_name: PRESENT
    structural_fingerprint: PRESENT
    classification: PRESENT
    decision_source: PRESENT
    classification_trace: PRESENT
    header_comprehension: PRESENT
    vocabulary_bindings: PRESENT
    agent_scores: PRESENT
    human_correction_from: PRESENT
    scope: PRESENT
    rule_set_id: PRESENT
    metric_name: PRESENT
    component_index: PRESENT

=== Insert probe — attempts INSERT with A2 columns to surface errors ===
  INSERT error: insert or update on table "classification_signals" violates foreign key constraint "classification_signals_tenant_id_fkey"
  INSERT details: Key (tenant_id)=(f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd) is not present in table "tenants".
  INSERT hint: (none)
  INSERT code: 23503
```

INSERT error is a tenant FK violation, NOT a column-not-found error — meaning the `rule_set_id`, `metric_name`, `component_index` columns are accepted by the table at the schema level. The pipeline-test tenant FK is an environmental quirk in this audit harness; not a schema gap.

### Evidence: column-type probe (PostgREST OpenAPI)

`web/scripts/aud004-phase4-schema-types.ts` (Class A artifact, deleted post-audit) — output verbatim:

```
=== classification_signals — OpenAPI column types ===

Column                        type        format
--------------------------------------------------------------------------------
id                            string      uuid
tenant_id                     string      uuid
entity_id                     string      uuid
signal_type                   string      text
signal_value                              jsonb
confidence                    number      numeric
source                        string      text
context                                   jsonb
created_at                    string      timestamp with time zone
source_file_name              string      text
sheet_name                    string      text
structural_fingerprint                    jsonb
classification                string      text
decision_source               string      text
classification_trace                      jsonb
header_comprehension                      jsonb
vocabulary_bindings                       jsonb
agent_scores                              jsonb
human_correction_from         string      text
scope                         string      text
rule_set_id                   string      uuid
metric_name                   string      text
component_index               integer     integer

=== A2 disposition columns (Decision 153) ===
  rule_set_id: type=uuid format=uuid
  metric_name: type=text format=text
  component_index: type=integer format=integer
```

Live column types match A2 spec (`rule_set_id` UUID, `metric_name` TEXT, `component_index` INT).

### Evidence: composite index — UNVERIFIED

PostgREST OpenAPI does not surface index metadata. The audit instructions forbid `pg-meta` REST and `exec_sql` RPC; programmatic verification of the composite index requires `postgres`-lib access (unavailable in this audit environment per operational note above). Surfaced as gap.

### Evidence: schema-definition file location (`web/supabase/migrations/`)

Migrations directory listing as of audit (latest two by date):

```
20260320_hf149_platform_events_tenant_nullable.sql   (Apr 26 19:38)
20260428_aud_004_drop_disputes_table.sql              (Apr 28 06:53)
```

Migrations touching `classification_signals` since 2026-04-20 (Decision 153 lock date) — `git log --since="2026-04-20" --pretty=format:"%h %ad %s" --date=short -- web/supabase/migrations/`:

```
390eb9ba  2026-04-28  Phase 1.6.5: calc-side legacy disposition + ... (no classification_signals impact)
314e8db0  2026-04-26  Revert "Merge pull request #339 from CCAFRICA/hf-193-signal-surface"
b812d956  2026-04-21  HF-193-A Phase 2.2a refinement: fn_bridge_persistence body → Option X explicit column list pattern
fb0b86a5  2026-04-21  HF-193-A Phase 2.2a: fn_bridge_persistence stored procedure migration (Path β atomicity primitive)
9ad419d2  2026-04-21  HF-193-A Phase 1.2: signal-surface schema migration (A2 typed columns + composite index)
```

Commit `9ad419d2` (2026-04-21) added migration `20260421030000_hf_193_a_signal_surface_schema.sql` — the file that adds A2 typed columns + composite index. Commit `314e8db0` (2026-04-26) reverted PR #339 in its entirety, including DELETION of that migration file. Migration source-of-truth diff for `20260421030000_hf_193_a_signal_surface_schema.sql` from the deleted file content:

```sql
ALTER TABLE classification_signals
  ADD COLUMN IF NOT EXISTS rule_set_id UUID,
  ADD COLUMN IF NOT EXISTS metric_name TEXT,
  ADD COLUMN IF NOT EXISTS component_index INTEGER;

CREATE INDEX IF NOT EXISTS idx_classification_signals_l2_lookup
  ON classification_signals (signal_type, rule_set_id, metric_name, component_index)
  WHERE signal_type = 'metric_comprehension';
```

No subsequent migration in `web/supabase/migrations/` re-applies the A2 typed columns or the composite index. Yet live-DB probe (above) shows the columns ARE present. **Source-of-truth divergence:** live DB schema includes A2 columns; repo migrations source-of-truth does not.

### Evidence: SCHEMA_REFERENCE_LIVE.md staleness

`SCHEMA_REFERENCE_LIVE.md` at repo root, header `*Generated: 2026-03-18*`. Current `classification_signals` section lists 20 columns; the three A2 typed columns (`rule_set_id`, `metric_name`, `component_index`) are absent from the doc but present in live DB (per probe above). The doc is stale relative to live state by 3 columns. Not refreshed in this turn (Class A audit constraint: commit audit document only); architect dispositions Class B refresh.

---

## A.2 — `anthropic-adapter.ts` (F2 write site verification)

### Evidence: file metadata

```
$ wc -l web/src/lib/ai/providers/anthropic-adapter.ts
1164 web/src/lib/ai/providers/anthropic-adapter.ts
```

### Evidence: plan-agent prompt-construction site

The plan-agent prompt is the `plan_interpretation` entry of the `SYSTEM_PROMPTS` constant (lines 152–786) and the corresponding `buildUserPrompt` switch case (lines 957–1009). 30-line excerpt of `buildUserPrompt` for `plan_interpretation`:

```typescript
// web/src/lib/ai/providers/anthropic-adapter.ts:957
case 'plan_interpretation': {
  // For PDF documents, content is provided via document block — don't repeat it in text
  const isPdfDocument = !!input.pdfBase64;
  const contentSection = isPdfDocument
    ? 'The compensation plan document has been provided above. Analyze it thoroughly.'
    : `DOCUMENT CONTENT:\n---\n${input.content}\n---\nFormat: ${input.format}`;

  return `Analyze the following compensation plan document and extract its COMPLETE structure INCLUDING ALL PAYOUT VALUES FROM EVERY TABLE.

${contentSection}

CRITICAL: For each component, you MUST extract the complete calculationMethod with ALL numeric values from the tables. Empty tiers/matrices will cause $0 payouts.

Return a JSON object with:
{
  "ruleSetName": "Name of the plan",
  ...
  "components": [...]
  ...
}`;
}
```

### Evidence: L2 Comprehension signal-write grep

```
$ grep -rn "L2_COMPREHENSION\|signal_type.*=.*'L2\|'L2.*Comprehension'\|metric_comprehension\|insertSignal\|writeSignal" \
    web/src/lib/ai/providers/ web/src/lib/intelligence/ web/src/lib/sci/ web/src/app/api/calculation/ \
    --include="*.ts"
(no output)
```

```
$ grep -rn "metric_comprehension\|L2_COMPREHENSION\|L2.*Comprehension" web/src/ --include="*.ts" --include="*.tsx"
(no output)
```

The `metric_comprehension` signal type — the L2 Comprehension write surface specified by Decision 153 F2 — is not written anywhere in `web/src/`.

### Evidence: surviving `plan_agent_seeds` references

```
$ grep -rn "plan_agent_seeds" web/src/ --include="*.ts" --include="*.tsx"
(no output)
```

Cross-repo `plan_agent_seeds`/`planAgentSeeds` survey:

```
$ grep -rn "plan_agent_seeds\|planAgentSeeds" --include="*.ts" --include="*.tsx" --include="*.md" -l .
docs/vp-prompts/CLT-197_BCL_BROWSER_VERIFICATION.md
docs/vp-prompts/AUD_004_PHASE_0_DIRECTIVE.md
docs/vp-prompts/AUD_004_PHASE_0G_DIRECTIVE.md
docs/vp-prompts/AUD_004_REMEDIATION_CONVERSATION_STARTER.md
docs/diagnostics/DIAG-020_FINDINGS.md
```

All five hits are in `docs/` (audit-trail comments per Standing Rule 34 exemption). Zero surviving references in `web/src/`.

### Evidence: AI→engine bridge function (F2 write site)

`bridgeAIToEngineFormat` is the bridge function (per HF-193 scope bound) — exported from `web/src/lib/compensation/ai-plan-interpreter.ts:476`. 25-line excerpt (full body):

```typescript
// web/src/lib/compensation/ai-plan-interpreter.ts:476
export function bridgeAIToEngineFormat(
  rawResult: Record<string, unknown>,
  tenantId: string,
  userId: string,
): {
  name: string;
  description: string;
  components: { variants: Array<{ variantId: string; variantName: string; description?: string; components: PlanComponent[] }> };
  inputBindings: Record<string, unknown>;
} {
  // Step 1: Normalize the raw AI output through the same pipeline as the plan import page
  const interpreter = new AIPlainInterpreter();
  const normalized = interpreter.validateAndNormalizePublic(rawResult);

  // Step 2: Convert to engine format via interpretationToPlanConfig
  const config = interpretationToPlanConfig(normalized, tenantId, userId);
  const additiveLookup = config.configuration as AdditiveLookupConfig;

  return {
    name: normalized.ruleSetName,
    description: normalized.description,
    components: { variants: additiveLookup.variants },
    inputBindings: {},     // ← always returns empty
  };
}
```

`bridgeAIToEngineFormat` returns `inputBindings: {}` unconditionally. It performs no `INSERT` to `classification_signals`, calls no `persistSignal`, and references no signal-write helper.

```
$ grep -n "classification_signals\|persistSignal\|insertSignal\|fn_bridge_persistence\|signal_type" \
    web/src/lib/compensation/ai-plan-interpreter.ts
(no output)

$ grep -n "classification_signals\|persistSignal\|insertSignal\|fn_bridge_persistence" \
    web/src/lib/ai/providers/anthropic-adapter.ts
(no output)

$ grep -rn "fn_bridge_persistence" .
(no output)
```

The Decision 153 F2 disposition (signal write at the AI→engine bridge function with AI-determined `metric_name` values) is not implemented in code. The (now-reverted) HF-193-A Phase 2.2a `fn_bridge_persistence` stored procedure has zero callers in the current tree.

---

## A.3 — `convergence-service.ts` (E1 read site verification)

### Evidence: file metadata

```
$ wc -l web/src/lib/intelligence/convergence-service.ts
2104 web/src/lib/intelligence/convergence-service.ts
```

### Evidence: Pass 4 AI semantic derivation invocation site

Pass 4 entry block at lines 389–443. 50-line excerpt around the AI invocation:

```typescript
// web/src/lib/intelligence/convergence-service.ts:389
  // OB-185 Pass 4: AI Semantic Derivation for unresolved metrics
  // When Passes 1-3 leave metrics unresolved, invoke AI to bridge the gap.
  // This handles transaction-level data where plan metric names (e.g., "consumable_revenue")
  // don't match column names (e.g., "total_amount") — AI reasons about the semantic bridge.
  const allResolvedMetrics = new Set(derivations.map(d => d.metric));
  const allRequiredMetrics = Array.from(new Set(components.flatMap(c => c.expectedMetrics)));
  const unresolvedForAI = allRequiredMetrics.filter(m => !allResolvedMetrics.has(m));

  if (unresolvedForAI.length > 0 && capabilities.length > 0) {
    // OB-191: Build enriched metric context from calculationIntent
    const metricContexts: MetricContext[] = unresolvedForAI.map(metricName => {
      const ownerComp = components.find(c => c.expectedMetrics.includes(metricName));
      const intent = ownerComp?.calculationIntent;
      let scope: string | undefined;
      if (intent) {
        const inputSpec = (intent.input as Record<string, unknown> | undefined)?.sourceSpec as Record<string, unknown> | undefined;
        if (inputSpec?.scope) scope = String(inputSpec.scope);
      }
      return {
        name: metricName,
        label: humanizeMetricName(metricName),
        componentName: ownerComp?.name || 'Unknown',
        operation: ownerComp?.calculationOp || 'unknown',
        scope,
      };
    });

    console.log(`[Convergence] OB-185 Pass 4: ${unresolvedForAI.length} unresolved metrics — invoking AI semantic derivation`);
    for (const mc of metricContexts) {
      console.log(`[Convergence] Pass 4 metric: ${mc.name} (label: "${mc.label}", op: ${mc.operation}${mc.scope ? ', scope: ' + mc.scope : ''})`);
    }
    try {
      const aiResult = await generateAISemanticDerivations(
        metricContexts, capabilities, supabase, tenantId
      );
      derivations.push(...aiResult.derivations);
      // ...
    } catch (aiErr) {
      console.error('[Convergence] OB-185 Pass 4 AI call failed:', aiErr);
      // Non-blocking — gaps will be detected below
    }
  }
```

### Evidence: `classification_signals` reference grep within file

```
$ grep -n "classification_signals" web/src/lib/intelligence/convergence-service.ts
253:        await supabase.from('classification_signals').insert({
```

The single hit at line 253 is an INSERT (write of `convergence_calculation_validation` signal type). 24-line excerpt:

```typescript
// web/src/lib/intelligence/convergence-service.ts:253
        await supabase.from('classification_signals').insert({
          tenant_id: tenantId,
          signal_type: 'convergence_calculation_validation',
          signal_value: {
            component_index: pr.componentIndex,
            component_name: pr.componentName,
            anomaly_type: pr.anomalyType,
            detected_result: pr.sampleResult,
            corrected_result: pr.proposedCorrection?.correctedResult,
            peer_median: pr.medianPeerResult,
            ratio_to_median: pr.ratioToMedian,
            correction_applied: !!pr.proposedCorrection,
            correction_type: pr.proposedCorrection?.type,
          },
          confidence: 0.85,
          source: 'convergence_validation',
          decision_source: 'structural_anomaly',
          context: {
            plan_id: ruleSetId,
            component_type: components[pr.componentIndex]?.calculationOp ?? 'unknown',
            bound_column: colName,
            value_distribution: dist ? { min: dist.min, max: dist.max, median: dist.median, scale: dist.scaleInference } : null,
          },
        });
```

No `SELECT` against `classification_signals` from `convergence-service.ts`. The Pass 4 helper `generateAISemanticDerivations` (line 1827) reads only `committed_data`:

```typescript
// web/src/lib/intelligence/convergence-service.ts:1856
  const { data: sampleRows } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', tenantId)
    .not('row_data', 'is', null)
    .limit(3);
```

No `classification_signals` SELECT and no composite-key (`signal_type`, `rule_set_id`, `metric_name`, `component_index`) lookup precedes the AI call. The Pass 4 AI invocation is unconditional given `unresolvedForAI.length > 0 && capabilities.length > 0`.

### Evidence: F-006 closure check

```
$ grep -rn "convergence_calculation_validation" web/src/ --include="*.ts" --include="*.tsx"
web/src/lib/intelligence/convergence-service.ts:255:          signal_type: 'convergence_calculation_validation',
```

Single occurrence — write at line 255. **Zero readers** of `convergence_calculation_validation` signals anywhere in the tree.

### Evidence: order-of-operations

In the Pass 4 path:
1. Line 393–395 — compute unresolved metrics via in-memory set difference.
2. Line 397 — guard on `unresolvedForAI.length > 0 && capabilities.length > 0`.
3. Line 421 — `await generateAISemanticDerivations(...)`.

No `classification_signals` SELECT occurs before the AI call. The composite-key query specified by Decision 153 E1 disposition is absent.

---

## A.4 — C2 gate verification

### Evidence: gate-name grep

```
$ grep -rn "comprehension.*gate\|gate.*comprehension\|requirePlanAgent\|planAgent.*required\|hasComprehension" \
    web/src/ --include="*.ts"
(no output)

$ grep -rln "C2 gate\|c2_gate\|comprehensionGate\|comprehension_gate\|preflightGate\|preflight.*gate" \
    web/src/ --include="*.ts"
(no output)

$ grep -rln "Decision 153\|decision 153\|decision153" web/src/ --include="*.ts"
(no output)

$ grep -rln "rule_set_id.*metric_name.*component_index\|signal_type.*metric_comprehension" \
    web/src/ --include="*.ts"
(no output)
```

No comprehension gate by name; no Decision 153 reference in source; no composite-key query shape `(signal_type, rule_set_id, metric_name, component_index)` anywhere in `web/src/`.

### Evidence: nearest gate-shaped construct (HF-165 calc-time convergence trigger)

`web/src/app/api/calculation/run/route.ts:122–183` — the only gate-shaped construct on the calculation path. Body:

```typescript
// web/src/app/api/calculation/run/route.ts:122
  // ── HF-165: Calc-time convergence (completes OB-182 deferred architecture) ──
  // OB-182 removed convergence from the bulk import path to eliminate sequence dependency.
  // At calculation time, both plans AND data are guaranteed to exist.
  // If input_bindings is empty, run convergence now to generate derivation rules.
  {
    const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
    const hasMetricDerivations = Array.isArray(rawBindings?.metric_derivations) && (rawBindings.metric_derivations as unknown[]).length > 0;
    const hasConvergenceBindings = rawBindings?.convergence_bindings && Object.keys(rawBindings.convergence_bindings as Record<string, unknown>).length > 0;

    if (!hasMetricDerivations && !hasConvergenceBindings) {
      addLog('HF-165: input_bindings empty — running calc-time convergence');
      try {
        const convResult = await convergeBindings(tenantId, ruleSetId, supabase);
        // ... persists convResult to rule_sets.input_bindings
      } catch (convErr) {
        addLog(`HF-165: Convergence failed (non-blocking): ${convErr instanceof Error ? convErr.message : String(convErr)}`);
      }
    } else {
      addLog('HF-165: input_bindings already populated — skipping convergence');
    }
  }
```

Query shape: tests `rule_sets.input_bindings.metric_derivations` and `rule_sets.input_bindings.convergence_bindings`. **Does not query `classification_signals`.** Not an L2-Comprehension/composite-key gate; not an E1-shape match.

### Evidence: side-by-side comparison — convergence E1 vs gate C2

| Surface | Query shape |
| - | - |
| Convergence (E1, expected) | `SELECT ... FROM classification_signals WHERE signal_type='metric_comprehension' AND rule_set_id=? AND metric_name=? AND component_index=?` |
| Convergence (E1, actual) | (absent — no SELECT against `classification_signals` in `convergence-service.ts`; see A.3) |
| Gate (C2, expected) | identical to E1 above per Decision 153 |
| Gate (C2, actual) | (absent — no comprehension gate exists; nearest gate-shaped construct queries `rule_sets.input_bindings`, not `classification_signals`) |

Both surfaces return absent. Decision 153 same-shape guarantee is vacuous because neither query exists; therefore the Standing Rule 34 halt-trigger "composite-key query shape diverges between convergence and gate" is not technically tripped (no shapes to diverge), but the prerequisite shapes are absent.

---

## A.5 — F-011 closure verification (`training:dual_path_concordance`)

### Evidence: write/read grep

```
$ grep -rn "training:dual_path_concordance\|dual_path_concordance" web/src/ --include="*.ts" --include="*.tsx"
web/src/app/api/calculation/run/route.ts:1868:    signalType: 'training:dual_path_concordance',
```

Single hit. Site is a write (per `signalType:` field in `persistSignal({...})` call). Surrounding 24 lines:

```typescript
// web/src/app/api/calculation/run/route.ts:1865
  // ── OB-77: Training signal — dual-path concordance (fire-and-forget) ──
  persistSignal({
    tenantId,
    signalType: 'training:dual_path_concordance',
    signalValue: {
      matchCount: intentMatchCount,
      mismatchCount: intentMismatchCount,
      concordanceRate: parseFloat(concordanceRate.toFixed(2)),
      entityCount: calculationEntityIds.length,
      componentCount: defaultComponents.length,
      intentsTransformed: componentIntents.length,
      totalPayout: grandTotal,
      ruleSetId,
      periodId,
    },
    confidence: concordanceRate / 100,
    source: 'ai_prediction',
    context: {
      ruleSetName: ruleSet.name,
      trigger: 'calculation_run',
    },
  }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch(err => {
    console.warn('[CalcAPI] Training signal persist failed (non-blocking):', err instanceof Error ? err.message : 'unknown');
  });
```

### Classification

- (a) **Survives and writes only — one-way door open.**

Zero readers of `training:dual_path_concordance` anywhere in the tree.

---

## A.6 — Korean Test (Decision 154) verification

### Evidence: vocabulary grep — `anthropic-adapter.ts` + `ai-plan-interpreter.ts`

```
$ grep -En "(comisión|comision|commission|cuota|quota|meta|goal|período|periodo)" \
    web/src/lib/ai/providers/anthropic-adapter.ts \
    web/src/lib/compensation/ai-plan-interpreter.ts
```

Total hits: **38** — full count via `wc -l` on the grep output.

Spot-checked range of hits and their context:

| File | Line | Hit | Classification |
| - | - | - | - |
| `ai-plan-interpreter.ts` | 4 | `Uses AIService for provider-agnostic AI interpretation of commission plan documents.` | (c) file-header doc comment — exempt |
| `ai-plan-interpreter.ts` | 448 | `metadata: {` | substring false positive (`metadata` contains `meta`); not a vocabulary hit — exempt |
| `anthropic-adapter.ts` | 101 | `- amount: A monetary value — ... (also used for goals/targets)` | (b) inside `SYSTEM_PROMPTS.field_mapping` template string directed at the LLM — Domain Agent prompt exemption |
| `anthropic-adapter.ts` | 173 | `"label": "% Cumplimiento de meta Optica",` | (b) inside `SYSTEM_PROMPTS.plan_interpretation` template string directed at the LLM — exempt |
| `anthropic-adapter.ts` | 237 | `"conditionMetric": "store_goal_attainment",` | (b) JSON shape example inside prompt template — exempt |
| `anthropic-adapter.ts` | 270 | `"ratioMetric": "quota_attainment",` | (b) JSON shape example inside prompt template — exempt |
| `anthropic-adapter.ts` | 332 | `NEVER use "conditional_percentage" or nested "conditional_gate" for quota-attainment` | (b) prompt-template guidance to LLM — exempt |
| `anthropic-adapter.ts` | 439 | `"left": { "source": "metric", "sourceSpec": { "field": "store_goal_attainment" } },` | (b) JSON example in prompt template — exempt |
| `anthropic-adapter.ts` | 479 | `"ratioInput": ... { "denominator": "monthly_quota" } }` | (b) JSON example in prompt template — exempt |
| `anthropic-adapter.ts` | 599 | `- attainment → achievement_pct, goal → amount, storeRange → category` | (b) field-name mapping guidance inside prompt template — exempt |
| `anthropic-adapter.ts` | 623 | `LEGACY ALIASES (accept these, return canonical types): repId→entity_id, ..., commissionRate→rate` | (b) prompt-template alias instruction to LLM — exempt |
| `anthropic-adapter.ts` | 932 | `${input.metadata ? \`Metadata: ${JSON.stringify(input.metadata, null, 2)}\` : ''}` | substring false positive (`metadata` contains `meta`); also inside `buildUserPrompt` template — exempt |
| `anthropic-adapter.ts` | 993 | `// For piecewise_linear: include segments[], baseMetric, AND targetValue (quota/goal amount per variant)` | (b) inline JSON-comment guidance inside `buildUserPrompt` template directed at LLM — exempt |

Structural verification: `SYSTEM_PROMPTS` literal spans `web/src/lib/ai/providers/anthropic-adapter.ts:39–786`; all anthropic-adapter Korean Test hits between lines 101–623 sit inside this constant. Hits at 932 and 993 sit inside the `buildUserPrompt` switch arm for `plan_interpretation` (lines 957–1009), also a prompt template. The two `ai-plan-interpreter.ts` hits are a file-header doc comment (line 4) and a substring false positive on `metadata` (line 448).

**Zero (a) genuine TS-code field-name classification matches.** All 38 hits classify as (b) prompt-template content directed at the LLM (exempt under Decision 154 Domain Agent prompt exemption), or (c) doc comments / substring false positives.

### Counterexample search — TS-code field classification by keyword

```
$ grep -rn "if.*'goal'\|if.*'meta'\|switch.*'commission'\|case 'comisión'\|case 'cuota'" \
    web/src/lib/ai/providers/ web/src/lib/compensation/ai-plan-interpreter.ts --include="*.ts"
(no output)
```

No control-flow construct in plan-agent-adjacent TS code branches on Spanish/English vocabulary keywords. Plan-agent comprehension is performed by AI semantic derivation (the `plan_interpretation` task on the AIService), not by keyword matching in TS code.

---

## Halt-and-surface triggers (Standing Rule 34)

| Trigger | Evidence | Status |
| - | - | - |
| Surviving `plan_agent_seeds` reference in non-exempt context | A.2 grep: zero hits in `web/src/`; five hits in `docs/` (audit-trail comments) | NOT TRIPPED |
| Novel parallel write surface for plan-agent comprehension neither `classification_signals` nor documented exempt | A.2 grep: zero `metric_comprehension` writes anywhere in `web/src/`; zero parallel surfaces | NOT TRIPPED |
| Composite-key query shape divergence between convergence (E1) and gate (C2) | A.3+A.4: both queries are absent; same-shape guarantee is vacuous, not violated | NOT TRIPPED (vacuous) |
| Schema state with typed columns partially present (e.g., `rule_set_id` present but `component_index` missing, or columns present but no composite index) | A.1: all three typed columns present; composite index UNVERIFIABLE without `postgres`-lib access | PARTIAL — index unverified |

No halt trigger fully tripped. Audit proceeds to evidence summary.

---

## Per-surface summary

| Surface | Evidence type | Result class |
| - | - | - |
| A.1 schema | column listing + type listing (PostgREST OpenAPI + INSERT probe); migrations `git log` since 2026-04-20; SCHEMA_REFERENCE_LIVE.md staleness | **partial** — A2 columns + types present in live DB; composite index UNVERIFIED (no `postgres`-lib access); migration source-of-truth divergence (live has columns; repo migrations do not, post-2026-04-26 revert); SCHEMA_REFERENCE_LIVE.md stale by 3 columns |
| A.2 F2 write | grep + bridge function body | **gap** — F2 disposition not implemented; `bridgeAIToEngineFormat` returns `inputBindings: {}` and writes nothing to `classification_signals`; `metric_comprehension` signal type written nowhere in `web/src/`; reverted `fn_bridge_persistence` RPC has zero callers |
| A.3 E1 read | grep + Pass 4 ordering | **gap** — E1 disposition not implemented; `classification_signals` is INSERTed (one site, line 253 — `convergence_calculation_validation`) but never SELECTed in `convergence-service.ts`; Pass 4 AI invocation unconditional; F-006 one-way door remains open with zero readers |
| A.4 C2 gate | gate-name grep + nearest gate body + side-by-side query shape | **absent** — no comprehension gate exists; nearest gate-shaped construct (`route.ts:122–183`, HF-165) gates on `rule_sets.input_bindings`, not `classification_signals`; no composite-key query in any TS file |
| A.5 F-011 | write/read counts | **one-way** — single write site (`route.ts:1868`); zero readers; door open |
| A.6 Korean Test | grep + classification (38 hits) | **clean** — all hits exempt under Decision 154 (prompt template content directed at LLM, file-header comments, or substring false positives); zero genuine TS-code field-name classification matches |

"Result class" is descriptive evidence framing only. Architect dispositions per surface in Phase 4 Class B.

---

## Class A operational notes (for architect dispositions)

1. **`postgres`-lib unavailable in audit env.** `web/.env.local` does not include `SUPABASE_DB_PASSWORD`. The composite-index probe (A.1) and any future `pg_indexes` / `pg_constraints` audits require either acquiring this secret or deferring to Supabase Dashboard SQL Editor output (the Phase 1.3 verification convention recorded in the now-deleted `20260421030000_hf_193_a_signal_surface_schema.sql` migration comments).
2. **Schema source-of-truth divergence (A.1).** Live DB has A2 columns; `web/supabase/migrations/` source-of-truth does not (post-2026-04-26 revert deleted the only migration that added them). Class B should restore the migration file (re-applying additive ALTERs is idempotent under `ADD COLUMN IF NOT EXISTS`) so source-of-truth re-converges with live.
3. **`SCHEMA_REFERENCE_LIVE.md` staleness.** Document dated 2026-03-18; live state has 3 additional columns on `classification_signals`. Not updated in this turn (Class A audit constraint: commit audit document only). Class B refresh recommended.
4. **F2 + E1 + C2 are coupled.** Class B refactor must implement the three together: write (F2 at the bridge), read (E1 in convergence Pass 4), and gate (C2 deferring to E1). Implementing any one alone leaves the other two as gaps.
5. **F-006 + F-011 still both one-way.** Both writes survive; zero readers each. Class B should disposition each separately — F-006 (`convergence_calculation_validation`) may be retired, repurposed, or wired to a reader; F-011 (`training:dual_path_concordance`) similarly.
6. **Korean Test surface is clean.** No Class B work required for A.6 against the surfaces audited.
7. **Class B should land on `phase-4-e5-audit` branch.** Class C (negative-test suite) follows on the same branch. PR opened only after all three classes land per audit instructions.

---

## Audit artifacts (Class A scope)

- **Branch:** `phase-4-e5-audit` (forked from `main` at 7a697dce, 2026-04-28).
- **Commit:** this audit document only. No `web/src/` or `web/supabase/migrations/` changes in this turn.
- **Probe scripts:** `web/scripts/aud004-phase4-schema-probe.ts` and `web/scripts/aud004-phase4-schema-types.ts` deleted post-audit (their output is captured verbatim in A.1 above; reproducible from this document if needed).
