# OB-218: Cross-Period Retrieval + Clawback Mechanism — MIR Keystone Proof

**Sequence:** OB-218 — architect-assigned 2026-06-18. Collision check against live `docs/vp-prompts/` mandatory; collision → HALT.
**Repo:** `CCAFRICA/spm-platform` · **Branch:** `ob-218-clawback-mechanism` from `main`
**Type:** BUILD (cross-period retrieval + clawback engine + keystone proof, one PR)
**Effort:** ULTRATHINK / ULTRACODE / maximum reasoning effort.
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

**Prerequisites (all merged to `main`):**
- **OB-217 merged:** per-transaction traces in `calculation_traces` via prime-DAG `extractAdditiveTerms` classifier. `committed_data_id` + `transaction_ref` columns live. Writer wired at `run/route.ts` (grep `writeCalculationTraces`). SR-38 proven 510/510 on BCL.
- **HF-302/HF-303 merged:** C1 (plan supersession) and C3 (waitUntil) fixed. All 5 MIR plans active.
- **OB-217 migration applied (SR-44):** `calculation_traces` has 11 columns. BCL recalculated post-migration.

**CC instance:** FRESH.

---

## §0 — CC STANDING RULES HEADER

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full before starting. Architecture Decision Gate before implementation. Anti-Pattern Registry checked every build. SQL Verification Gate before any SQL. Commit + push after every phase. After all phases: kill dev → `rm -rf .next` → `npm run build` (exit-0) → `npm run dev` → confirm `localhost:3000`. Git from repo root (`spm-platform`, NOT `web/`). Final step: `gh pr create --base main --head ob-218-clawback-mechanism`. **DO NOT merge** (SR-44). **No ground-truth values in CC outputs** (reconciliation-channel separation). **Live code only** — read fresh from HEAD.

**First action:** write this directive to `docs/vp-prompts/OB-218_CLAWBACK_MECHANISM_DIRECTIVE_20260618.md` and commit.

### §0.1 OB-217 codebase facts (binding context — verified against completion report + ADR)

These are not assumptions — they are verified facts from OB-217's build. Read the live code to confirm they haven't drifted, but do not re-discover what is already known.

| Fact | Value |
|---|---|
| Live component model | `componentType: 'prime_dag'`; PrimeNode DAG (`prime: conditional\|arithmetic\|compare\|reference\|constant`). Legacy `operation` vocabulary (scalar_multiply, conditional_gate, bounded_lookup_*) is DEAD — zero live components use it. |
| Attribution classifier | `extractAdditiveTerms(primeNode)` — recursive walker collecting `{rate, metricField, kind}` from `multiply(reference(F), constant(R))` patterns. 0 terms → Pattern C; ≥1 ungated → Pattern A; ≥1 under conditional → Pattern B. |
| Trace writer | `writeCalculationTraces` in `web/src/lib/supabase/calculation-service.ts` (~L444). Takes optional service-role client param. Chunk-inserts (500). |
| Trace call site | `run/route.ts` (grep `writeCalculationTraces`) — AFTER results bulk insert, using `entity_id → result_id` map. |
| Per-row data source | `attribRowsByBatch` — parallel structure carrying `committed_data.id` + `row_data` + `metadata`, keyed identically to `dataByBatch`. Existing aggregation path (`dataByBatch`) untouched. |
| transaction_ref extraction | From `committed_data.metadata.field_identities`: column with `structuralType === 'identifier'` that is NOT `metadata.entity_id_field`. NOT from `row_data` keys directly. |
| SR-38 model | Two-tier: (1) exact decimal match to `rawOutcome` from `metadata.roundingTrace.components[idx].rawValue`; (2) `round_half_even(Σ, 0) === storedPayout`. |
| Math library | `decimal.js` with `Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN })`. All per-row computations use Decimal, not native JS. |
| Results insert | Inline in `run/route.ts`, bulk, `.select('id, entity_id')` returns the FK. `calculation_traces.result_id` is NOT NULL FK. |
| BCL tenant ID | `b1c2d3e4-aaaa-bbbb-cccc-111111111111` |
| MIR tenant ID | `972c8eb0-e3ae-4e4c-ad30-8b34804c893a` |
| CRP status | **WIPED** (0 committed_data, 0 bindings, 0 results). Not a valid regression or proof target. |

### §0.2 Known data vocabulary (from architect channel — embed, do not re-discover)

| Item | Known value | What CC confirms |
|---|---|---|
| Category-code mismatch | Plan 1 conditions check `ALI`/`BEB`/`LIM`; actual data has `Alimentos`/`Bebidas`/`Limpieza`/`Cuidado Personal` | The exact JSONB path in the component where these values appear |
| MIR data types | Ventas (sales), Cobranza (collections), Devolucion (returns) — verify exact `data_type` strings via query | The exact string (may include period suffix like `_Enero`) |
| Return reference column | Likely `Folio_Original` in Devolucion data linking to `Folio` in Ventas | Confirm exact column names via `jsonb_object_keys` query |
| Recovery rate | Likely 1.0 (full reversal) — confirm from plan structure or default | What the plan declares (or 1.0 if undeclared) |

---

## §1 — PROBLEM STATEMENT

### §1.1 Three problems, one vertical slice

**Problem 1 — Category-code mismatch:** MIR Plan 1's prime-DAG conditional checks 3-letter codes against `row_data.Categoria`. The actual values are full Spanish names. They never match → fallback rate for all sales → per-transaction traces (from OB-217) carry wrong rates. Fix: JSONB path update to `rule_sets.components`.

**Problem 2 — Cross-period retrieval:** Given a reference key (e.g., `Folio_Original = 'X'`), find the original transaction in a prior period's `committed_data`, then look up its stored trace in `calculation_traces`. The infrastructure for this does not exist. Dead code (`priorDataByEntity`, `priorPeriodRows`) may or may not be usable — CC reads and decides.

**Problem 3 — Clawback computation:** For each return-event row: extract reference → retrieve original trace (Problem 2) → compute `−recoveryRate × originalContribution` using `decimal.js` → store a negative-contribution trace. Structural: the reference-key column and recovery rate come from the plan's declared `temporal_adjustment` modifier, not from code literals.

### §1.2 Definition of done

1. Category-code fix applied; Plan 1 per-transaction traces show ≥2 distinct rates (not fallback-for-all).
2. `retrieveOriginalTrace` live: reference key + prior period → original trace returned.
3. Clawback computes: negative-contribution traces from `−recoveryRate × originalContribution`.
4. Generality proven: integration test with `InvoiceNumber` (not `Folio`) + `recoveryRate: 0.5` (not `1.0`) passes without code changes.
5. MIR keystone: all 5 plans produce per-transaction traces; clawback produces negatives.
6. Regression: BCL $312,033 unchanged; Meridian MX$185,063 unchanged.
7. `npm run build` exit-0; PR opened (not merged).

---

## §2 — SUBSTRATE-BOUND DISCIPLINE APPLICATIONS

**Korean Test (Decision 154):** `retrieveOriginalTrace` takes `originalKeyColumn`, `referenceValue`, `originalDataType` as parameters read from the plan's `temporal_adjustment` modifier JSONB. Zero column-name literals in engine code. The modifier's column names are DATA VOCABULARY (above the Deterministic Calculation Boundary), read structurally (below).

**Decision 158:** clawback reversal is pure math: `new Decimal(recoveryRate).neg().mul(originalContribution)`. Zero LLM calls.

**SR-38:** Two-tier (matching OB-217's established model): (1) exact decimal match of per-row clawback contribution to independently hand-computed reversal, (2) rounding reconciliation to stored integer payout via `ROUND_HALF_EVEN` 0 dp.

**SR-34:** If `retrieveOriginalTrace` returns not-found, produce a structured error trace with `contribution: 0` and full diagnostic in `steps`. Never silently skip.

---

## §3 — PHASE 1: Diagnostic + All SQL Corrections + Non-Clawback Baseline

One diagnostic scan, one migration file, one architect gate, one baseline verification. No back-and-forth.

### §3.1 Diagnostic scan

Run these queries. Paste ALL output.

**Q1 — MIR plans (all of them):**
```sql
SELECT id, name, status,
  jsonb_pretty(components) AS components
FROM rule_sets
WHERE tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
  AND status = 'active'
ORDER BY name;
```
From the output: (a) identify each plan's `id` and `name`; (b) for the Ventas/sales plan, find the conditional node in its prime DAG that compares `Categoria` — record the exact JSONB path and the literal values (`ALI`/`BEB`/`LIM` or whatever); (c) for the Devolucion/returns plan, check if any component carries a `temporal_adjustment` modifier — record present/absent; (d) identify the clawback plan's `id`.

**Q2 — MIR data types:**
```sql
SELECT DISTINCT data_type, COUNT(*) AS rows
FROM committed_data
WHERE tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
GROUP BY data_type ORDER BY rows DESC;
```

**Q3 — Return data columns (for the Devolucion data type from Q2):**
```sql
SELECT jsonb_object_keys(row_data) AS col, COUNT(*) AS freq
FROM committed_data
WHERE tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
  AND data_type = '<devolucion_data_type_from_Q2>'
GROUP BY col ORDER BY freq DESC;
```
Identify the reference-key column linking returns to originals (contains "Original" or "Folio" — record the exact name).

**Q4 — Ventas data columns (confirm the target of the reference):**
```sql
SELECT jsonb_object_keys(row_data) AS col, COUNT(*) AS freq
FROM committed_data
WHERE tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
  AND data_type ILIKE '%venta%'
GROUP BY col ORDER BY freq DESC;
```
Confirm the column that the return reference links TO (expected: `Folio` or similar).

**Q5 — MIR period IDs:**
```sql
SELECT id, label, start_date, end_date
FROM periods
WHERE tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
ORDER BY start_date;
```

### §3.2 Author ALL corrections in one migration file

Create `web/supabase/migrations/<timestamp>_ob218_mir_plan_corrections.sql`. This file contains every SQL correction. CC uses Q1–Q5 results to fill in the exact values.

**Correction A — Category-code vocabulary alignment:**

Using the JSONB path found in Q1(b), update the category condition values from 3-letter codes to full Spanish names. The exact SQL shape depends on the prime-DAG structure CC finds — it's a `jsonb_set` on the condition's comparison value(s). Expected mapping:
- `ALI` → `Alimentos`
- `BEB` → `Bebidas`
- `LIM` → `Limpieza`

If a fourth category `Cuidado Personal` exists in the data (Q2/Q4) but has no code in the plan, note it in the completion report — it may need its own rate condition (architect disposition).

**Correction B — temporal_adjustment modifier (if absent per Q1(c)):**

If Q1(c) found NO `temporal_adjustment` modifier on the clawback plan, add one. Use the exact column names from Q3 and Q4:

```sql
-- OB-218 Correction B: clawback modifier
-- Exact JSONB path depends on component index found in Q1(d)
UPDATE rule_sets
SET components = jsonb_set(
  components,
  '{<component_index>,modifiers}',
  COALESCE(components #> '{<component_index>,modifiers}', '[]'::jsonb) || '[{
    "modifier": "temporal_adjustment",
    "adjustmentType": "per_transaction_reversal",
    "referenceMapping": {
      "returnField": "<Q3_reference_column>",
      "originalField": "<Q4_target_column>",
      "originalDataType": "<Q2_ventas_data_type>"
    },
    "recoveryRate": 1.0,
    "lookbackPeriods": 1,
    "metadata": { "description": "Full reversal of original transaction commission on return" }
  }]'::jsonb
)
WHERE id = '<Q1_clawback_plan_id>'
  AND tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
```

If Q1(c) found an EXISTING modifier: skip Correction B, record it.

**HALT-STRUCTURE:** if no MIR plan references the Devolucion/return data type at all (no convergence binding, no component, no data_type mapping) → the plan interpretation missed clawbacks entirely. Report all 5 plans' structures and stop. This is re-interpretation territory (OB-214), not a targeted fix.

### §3.3 Architect gate

Present the completed migration file. State: **"ARCHITECT GATE: paste the following SQL into Supabase SQL Editor for MIR tenant 972c8eb0."** Wait for architect confirmation.

After confirmation, verify:
```sql
-- Verify category-code fix: query Plan 1's component, confirm condition values are full Spanish names
-- Verify temporal_adjustment: query clawback plan's component, confirm modifier present
-- (exact queries depend on the JSONB paths found in Q1 — CC constructs them)
```

### §3.4 Run non-clawback MIR plans — establish baseline

Identify non-clawback plans (those WITHOUT `temporal_adjustment` modifier). Run them on localhost via authenticated browser or calculation API.

Verify and paste:
1. At least one plan produces non-zero entity totals (pipeline working).
2. Per-transaction traces exist: `SELECT COUNT(*) FROM calculation_traces WHERE tenant_id = '972c8eb0...' AND committed_data_id IS NOT NULL`.
3. For Plan 1: query traces for one entity — confirm ≥2 distinct `output->>'rate'` values across rows (category-specific rates, not uniform fallback).
4. SR-38: for one entity, sum per-row `output->>'contribution'` values, compare against entity-level `calculation_results.components[idx].payout` (or rawValue from roundingTrace).

Commit: `"OB-218 Phase 1: plan corrections + non-clawback baseline verified"`

### §3.5 EPG-1

Paste: (a) Q1–Q5 output. (b) migration file. (c) post-fix verification. (d) non-clawback trace count. (e) Plan 1 distinct rates. (f) SR-38 check. (g) `npm run build` exit-0.

**HALT-PIPELINE:** non-clawback plans produce $0 or 0 traces → pipeline broken. Do not proceed.

---

## §4 — PHASE 2: Cross-Period Retrieval + Clawback Engine

Pure engine work. Zero architect gates. All code in the OB-217 module family (`per-row-attribution.ts` or sibling).

### §4.1 Locate cross-period dead code

```bash
grep -rn 'priorDataByEntity\|priorPeriodRows\|prior.*period\|cross.*period\|lookback' \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/
```

Read every match. Determine if the dead functions are usable as the retrieval substrate, or if `retrieveOriginalTrace` is better written fresh. Either path is acceptable — the function contract (below) is what matters.

### §4.2 Build `retrieveOriginalTrace`

Place in the per-row-attribution module (or `calculation-service.ts` alongside the trace writer). Use the service-role Supabase client.

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Decimal from 'decimal.js';
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

interface OriginalTraceResult {
  found: boolean;
  committedDataId: string | null;
  contribution: Decimal | null;   // decimal.js, not number
  rate: number | null;
  inputs: Record<string, unknown> | null;
  componentName: string | null;
  error: string | null;
}

async function retrieveOriginalTrace(
  supabase: SupabaseClient,
  tenantId: string,
  originalKeyColumn: string,   // from plan's referenceMapping.originalField
  referenceValue: string,       // from the return row's row_data[returnField]
  originalDataType: string,     // from plan's referenceMapping.originalDataType
  priorPeriodId: string
): Promise<OriginalTraceResult> {
  // Step 1: find the original committed_data row
  const { data: cdRows } = await supabase
    .from('committed_data')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('data_type', originalDataType)
    .eq('period_id', priorPeriodId)
    .filter(`row_data->>` + originalKeyColumn, 'eq', referenceValue)
    .limit(1);

  if (!cdRows || cdRows.length === 0) {
    return { found: false, committedDataId: null, contribution: null, rate: null,
             inputs: null, componentName: null,
             error: `original_not_found: ${originalKeyColumn}=${referenceValue} in ${originalDataType} period=${priorPeriodId}` };
  }

  const originalCdId = cdRows[0].id;

  // Step 2: find the stored trace for that row
  const { data: traces } = await supabase
    .from('calculation_traces')
    .select('component_name, output, inputs')
    .eq('tenant_id', tenantId)
    .eq('committed_data_id', originalCdId);

  if (!traces || traces.length === 0) {
    return { found: false, committedDataId: originalCdId, contribution: null, rate: null,
             inputs: null, componentName: null,
             error: `trace_not_found: committed_data_id=${originalCdId} has no calculation_trace` };
  }

  const trace = traces[0];
  const output = (trace.output && typeof trace.output === 'object') ? trace.output as Record<string, unknown> : {};
  const contribution = output.contribution != null ? new Decimal(String(output.contribution)) : null;

  return {
    found: true,
    committedDataId: originalCdId,
    contribution,
    rate: typeof output.rate === 'number' ? output.rate : null,
    inputs: (trace.inputs && typeof trace.inputs === 'object') ? trace.inputs as Record<string, unknown> : null,
    componentName: trace.component_name,
    error: null
  };
}
```

**Korean Test verification:** grep the function body — zero string literals naming specific columns or data types. `originalKeyColumn`, `originalDataType`, `referenceValue` are ALL parameters.

### §4.3 Add Pattern D to the attribution classifier

In the OB-217 attribution module, the existing `extractAdditiveTerms` classifies into Patterns A/B/C. Add Pattern D as a **pre-check** before the prime-DAG walk:

```typescript
type AttributionPattern = 'additive' | 'qualified' | 'non-attributable' | 'clawback';

function classifyAttributionPattern(component: ComponentRecord): AttributionPattern {
  // Pattern D: check for temporal_adjustment BEFORE prime-DAG analysis
  const modifiers: unknown[] =
    (component.calculationIntent as Record<string, unknown>)?.modifiers as unknown[] ??
    (component as Record<string, unknown>).modifiers as unknown[] ??
    [];
  const temporalMod = modifiers.find((m: unknown) => {
    const mod = m as Record<string, unknown>;
    return mod.modifier === 'temporal_adjustment'
        && mod.adjustmentType === 'per_transaction_reversal';
  });
  if (temporalMod) return 'clawback';

  // Existing prime-DAG classification (OB-217)
  const terms = extractAdditiveTerms(component.calculationIntent);
  if (terms.length === 0) return 'non-attributable';
  // ... existing Pattern A/B logic ...
}
```

The string `'temporal_adjustment'` and `'per_transaction_reversal'` are structural vocabulary from the Calculation Intent Specification — they are modifier-type identifiers, not data vocabulary. Korean Test clean (same class as `'conditional'`, `'arithmetic'`, `'reference'` in the prime vocabulary).

### §4.4 Build clawback attribution handler

When the classifier returns `'clawback'`, the attribution loop dispatches to this handler instead of the standard per-row computation:

```typescript
async function attributeClawbackRows(
  supabase: SupabaseClient,
  tenantId: string,
  component: ComponentRecord,
  entityRows: AttribRow[],          // from attribRowsByBatch
  resultId: string,                 // from entity_id→result_id map (OB-217 pattern)
  periods: PeriodRecord[]           // for lookback resolution
): Promise<TraceRow[]> {
  // Read the temporal_adjustment modifier
  const modifiers = /* extract from component as in §4.3 */;
  const mod = modifiers.find(m => m.modifier === 'temporal_adjustment') as Record<string, unknown>;
  const refMap = mod.referenceMapping as Record<string, string>;
  const returnField = refMap.returnField;        // e.g., 'Folio_Original'
  const originalField = refMap.originalField;    // e.g., 'Folio'
  const originalDataType = refMap.originalDataType; // e.g., 'Ventas_Enero'
  const recoveryRate = new Decimal(String(mod.recoveryRate ?? 1.0));
  const lookbackPeriods = (mod.lookbackPeriods as number) ?? 1;

  const traces: TraceRow[] = [];

  for (const row of entityRows) {
    const rowData = row.row_data as Record<string, unknown>;
    const referenceValue = String(rowData[returnField] ?? '');
    if (!referenceValue) continue; // no reference key in this row

    // Determine prior period(s) to search
    const priorPeriodIds = resolveLookbackPeriods(row.period_id, periods, lookbackPeriods);

    let originalTrace: OriginalTraceResult = { found: false, /* ... */ error: 'no_periods_to_search' };
    for (const ppId of priorPeriodIds) {
      originalTrace = await retrieveOriginalTrace(
        supabase, tenantId, originalField, referenceValue, originalDataType, ppId
      );
      if (originalTrace.found) break;
    }

    let clawbackContribution: Decimal;
    if (originalTrace.found && originalTrace.contribution) {
      clawbackContribution = recoveryRate.neg().mul(originalTrace.contribution);
    } else {
      clawbackContribution = new Decimal(0); // SR-34: structured error, not silent skip
    }

    traces.push({
      resultId,
      componentName: String(component.name),
      committedDataId: row.id,             // the return-event row's committed_data.id
      transactionRef: referenceValue,       // the reference value linking to the original
      formula: `−${recoveryRate} × ${originalTrace.contribution?.toString() ?? '?'}`,
      inputs: rowData,
      output: {
        contribution: clawbackContribution.toNumber(),
        rate: recoveryRate.toNumber(),
        pattern: 'clawback',
        originalContribution: originalTrace.contribution?.toNumber() ?? null,
        originalRate: originalTrace.rate,
        originalCommittedDataId: originalTrace.committedDataId,
      },
      steps: [
        { action: 'resolve_reference', returnField, referenceValue, originalField, originalDataType },
        { action: 'retrieve_original', found: originalTrace.found, error: originalTrace.error },
        { action: 'compute_reversal', recoveryRate: recoveryRate.toNumber(),
          originalContribution: originalTrace.contribution?.toNumber() ?? null,
          result: clawbackContribution.toNumber() }
      ]
    });
  }
  return traces;
}
```

Wire this into the trace accumulation loop at the OB-217 seam: if `classifyAttributionPattern(component) === 'clawback'`, call `attributeClawbackRows` instead of the existing additive attribution. Accumulated traces go into the same `allTraces` array and are written by the same `writeCalculationTraces` call.

### §4.5 Generality integration test

Create `web/scripts/ob218-test-clawback-generality.ts`:

```typescript
#!/usr/bin/env npx tsx
/**
 * OB-218 Generality Test: prove retrieveOriginalTrace + clawback reversal
 * work with a DIFFERENT reference-key field and a DIFFERENT recovery rate.
 * No MIR-specific code or column names.
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob218-test-clawback-generality.ts
 */
import { createClient } from '@supabase/supabase-js';
import Decimal from 'decimal.js';
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });
// import { retrieveOriginalTrace } from '../src/lib/calculation/per-row-attribution';
// (or wherever it lives — adjust import path)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const MIR = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
const TEST_ENTITY = '__OB218_GENERALITY_TEST__';
const TEST_DATA_TYPE = 'GeneralityTest_Sales';
const TEST_COMP_NAME = 'GeneralityTest_Commission';

async function main() {
  // Fetch a real period_id and result_id for FK satisfaction
  const { data: periods } = await supabase.from('periods')
    .select('id').eq('tenant_id', MIR).limit(1);
  const periodId = periods?.[0]?.id;
  if (!periodId) throw new Error('No MIR period found');

  const { data: results } = await supabase.from('calculation_results')
    .select('id').eq('tenant_id', MIR).limit(1);
  const resultId = results?.[0]?.id;
  if (!resultId) throw new Error('No MIR result found — run a non-clawback plan first');

  // --- SETUP: insert test data ---
  const { data: origRow, error: e1 } = await supabase.from('committed_data').insert({
    tenant_id: MIR, entity_id: TEST_ENTITY, period_id: periodId,
    data_type: TEST_DATA_TYPE, source_date: '2026-01-15',
    row_data: { InvoiceNumber: 'GEN-TEST-001', SaleAmount: 10000.00 },
    metadata: { test: true, ob: 'OB-218-generality' }
  }).select('id').single();
  if (e1 || !origRow) throw new Error(`Insert original row failed: ${e1?.message}`);
  console.log(`Inserted original row: ${origRow.id}`);

  const { error: e2 } = await supabase.from('calculation_traces').insert({
    tenant_id: MIR, result_id: resultId, component_name: TEST_COMP_NAME,
    committed_data_id: origRow.id, transaction_ref: 'GEN-TEST-001',
    inputs: { SaleAmount: 10000.00 },
    output: { contribution: 500.00, rate: 0.05, pattern: 'additive' },
    steps: []
  });
  if (e2) throw new Error(`Insert test trace failed: ${e2.message}`);
  console.log('Inserted test trace: contribution=500.00, rate=0.05');

  // --- EXECUTE: retrieve with DIFFERENT field names ---
  const result = await retrieveOriginalTrace(
    supabase, MIR,
    'InvoiceNumber',          // NOT Folio — different field name
    'GEN-TEST-001',           // the reference value
    TEST_DATA_TYPE,           // NOT Ventas — different data type
    periodId
  );

  // --- ASSERT ---
  const errors: string[] = [];
  if (!result.found) errors.push(`Expected found=true, got false (error: ${result.error})`);
  if (result.committedDataId !== origRow.id) errors.push(`Expected cdId=${origRow.id}, got ${result.committedDataId}`);
  if (result.contribution && !result.contribution.eq(500)) errors.push(`Expected contribution=500, got ${result.contribution}`);
  if (result.rate !== 0.05) errors.push(`Expected rate=0.05, got ${result.rate}`);

  // Compute clawback with DIFFERENT recovery rate
  const recoveryRate = new Decimal('0.5'); // NOT 1.0
  const clawback = result.contribution ? recoveryRate.neg().mul(result.contribution) : new Decimal(0);
  if (!clawback.eq(-250)) errors.push(`Expected clawback=-250, got ${clawback}`);

  // --- CLEANUP ---
  await supabase.from('calculation_traces').delete()
    .eq('component_name', TEST_COMP_NAME).eq('tenant_id', MIR);
  await supabase.from('committed_data').delete()
    .eq('entity_id', TEST_ENTITY).eq('tenant_id', MIR);
  console.log('Test data cleaned up.');

  // --- REPORT ---
  if (errors.length > 0) {
    console.log('\n❌ GENERALITY TEST FAILED:');
    errors.forEach(e => console.log(`  ${e}`));
    console.log('\nHALT-GC: check retrieveOriginalTrace for hardcoded column names or data types.');
    process.exit(1);
  }
  console.log('\n✅ GENERALITY TEST PASSED');
  console.log('  Reference key:    InvoiceNumber (not Folio)');
  console.log('  Data type:        GeneralityTest_Sales (not Ventas)');
  console.log('  Recovery rate:    0.5 (not 1.0)');
  console.log('  Original trace:   contribution=500.00, rate=0.05');
  console.log(`  Clawback result:  ${clawback.toString()}`);
  console.log('  Korean Test:      PASS — zero MIR-specific literals in retrieval path');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
```

Adjust the import path for `retrieveOriginalTrace` to match the actual module location. Run: `cd web && set -a && source .env.local && set +a && npx tsx scripts/ob218-test-clawback-generality.ts`

**HALT-GC:** script exits non-zero → mechanism not general. Report which assertion failed.

### §4.6 SR-38 hand-computation (clawback)

For one MIR return-event entity after clawback calculation:
1. Query the return row's `row_data` — extract the reference value.
2. Query the original transaction's trace: `SELECT output FROM calculation_traces WHERE committed_data_id = '<original_cd_id>'`.
3. Hand-compute: `new Decimal(recoveryRate).neg().mul(new Decimal(originalContribution))`.
4. Query the clawback trace: `SELECT output FROM calculation_traces WHERE committed_data_id = '<return_cd_id>'`.
5. Compare: hand-computed value === stored `output.contribution`.

Paste both values. They must be exactly equal.

Commit: `"OB-218 Phase 2: cross-period retrieval + clawback engine + generality test"`

### §4.7 EPG-2

Paste: (a) grep results for dead cross-period code. (b) `retrieveOriginalTrace` diff. (c) Pattern D classifier extension diff. (d) `attributeClawbackRows` diff. (e) one MIR clawback trace showing negative contribution. (f) SR-38 hand-computation match. (g) generality test script output (PASSED). (h) `npm run build` exit-0.

**HALT-SR38:** hand-computation ≠ stored trace → stop.
**HALT-GC:** generality test exits non-zero → stop.

---

## §5 — PHASE 3: MIR Keystone Verification + Regression + PR

### §5.1 All 5 MIR plans

Run all 5 plans for all available periods. For each, paste:
1. Plan name + entity-level total.
2. Trace count: `SELECT COUNT(*) FROM calculation_traces WHERE tenant_id = '972c8eb0...' AND committed_data_id IS NOT NULL AND result_id IN (SELECT id FROM calculation_results WHERE rule_set_id = '<plan_id>')`.
3. One sample trace showing `committed_data_id`, `transaction_ref`, `output` (with `contribution`, `rate`, `pattern`).

Structural success:
- Non-clawback plans: positive traces with correct rates. Plan 1: ≥2 distinct rates.
- Clawback plan: traces with `pattern: 'clawback'` and negative `contribution`.
- SR-38: for one entity per plan, per-row sum = entity-level payout.

**Architect reconciles against `MIR_Resultados_Esperados.xlsx` (SR-44). CC reports calculated values only.**

### §5.2 Regression

- **BCL:** Oct $44,590 · Nov $46,291 · Dic $61,986 · Ene $47,545 · Feb $53,215 · Mar $58,406 = **$312,033**. Run and paste.
- **Meridian:** **MX$185,063**. Run and paste.
- **CRP:** SKIP (wiped — 0 data).

**HALT-REG:** any total differs → stop with expected vs actual.

### §5.3 Build + PR

```bash
npm run build  # exit-0
gh pr create --base main --head ob-218-clawback-mechanism \
  --title "OB-218: Cross-period retrieval + clawback — MIR keystone" \
  --body "Category-code fix: Plan 1 category-specific rates (Alimentos/Bebidas/Limpieza).
Cross-period retrieval: retrieveOriginalTrace (parameterized, Korean Test clean).
Clawback Pattern D: decimal.js reversal → negative traces.
Generality: InvoiceNumber + 0.5 recovery rate PASSED.
MIR: 5 plans, per-transaction traces + clawback negatives.
Regression: BCL \$312,033, Meridian MX\$185,063 unchanged."
```

**DO NOT MERGE** (SR-44).

---

## §5A — REPORTING DISCIPLINE

Completion report at `docs/completion-reports/OB-218_COMPLETION_REPORT.md`. Per Rules 25–28:

1. **Pasted evidence:** Q1–Q5 diagnostic, migration SQL, post-fix category rates, `retrieveOriginalTrace` function, clawback trace with negative, SR-38 hand-computation, generality test output, all 5 MIR plans, BCL + Meridian regression.
2. **SHA:** merge-ready commit.
3. **ARTIFACT SYNC:**
   ```
   ARTIFACT SYNC
   MC: [category-code mismatch CLOSED; clawback engine BUILT; CRP wiped (no data)]
   REGISTRY: [Calculation Engine → clawback evidence; Audit Trail → cross-period retrieval]
   R1: [clawback capability criteria if applicable]
   BOARD: [clawback/reversal: NOT BUILT → BUILT; cross-period retrieval: NOT BUILT → BUILT]
   SUBSTRATE: [Korean Test (generality PASS), Decision 158, SR-38, SR-34, Decision 122 (decimal.js)]
   ```

---

## §6 — OUT OF SCOPE

- UI drill-down / commission statements / dispute UI — consume traces. Separate build.
- Retroactive adjustments beyond clawback (late posts, corrections) — same retrieval, different lifecycle. Separate OB.
- Progressive Performance for cross-period retrieval — performance at scale. Separate OB.
- OB-214 (Plan Interpretation Agent) — auto-correcting interpretation loop. This OB fixes one instance.
- entity_period_outcomes changes — materialization layer unchanged.
- CRP restoration / re-import — deferred.

---

## §6A — RESIDUALS

1. **OB-217 + OB-218 together** deliver: per-transaction calculation, per-transaction storage, cross-period retrieval, clawback reversal, category-code vocabulary alignment. Five of six P0 gap items structurally enabled. UI surfaces are the sixth.

2. **Generality fixture** (`ob218-test-clawback-generality.ts`) retained as regression anchor. Run in CI to catch generality regressions.

3. **CRP restoration** needed for Pattern B live proof and full CRP reconciliation ($566,728.97 pre-clawback). Currently wiped — no data, bindings, or results.

4. **`resolveLookbackPeriods`** helper: the directive sketches it as a function that finds prior period IDs given a current period and lookback count. Implementation depends on whether `periods` has a `sequence` or `ordinal` column, or must be sorted by `start_date`. CC builds from what exists.

5. **Multiple traces per original:** if the original transaction earned traces across multiple components, `retrieveOriginalTrace` currently returns the first trace. For multi-component clawback (reverse all components' contributions to one transaction), the function would need to return all matching traces. Log as residual if encountered.

---

*OB-218 · Cross-Period Retrieval + Clawback Mechanism — MIR Keystone Proof · 2026-06-18*
*Grounded in OB-217 ADR + completion report (prime-DAG model, decimal.js, attribRowsByBatch, field_identities)*
*Architect gates: ONE (§3.3 SQL paste). All other phases autonomous.*
