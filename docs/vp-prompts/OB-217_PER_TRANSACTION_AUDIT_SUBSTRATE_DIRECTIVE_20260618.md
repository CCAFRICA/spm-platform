# OB-217: Per-Transaction Calculation & Storage Substrate

**Sequence:** OB-217 — architect-assigned 2026-06-18. Phase 0 collision check against live `docs/vp-prompts/` is mandatory; collision → HALT.
**Repo:** `CCAFRICA/spm-platform` · **Branch:** `ob-217-per-transaction-substrate` from `main`
**Type:** BUILD (engine execution model + trace storage, one PR)
**Effort:** ULTRATHINK / ULTRACODE / maximum reasoning effort. This is the platform substrate that makes the audit promise real, the dispute mechanism functional, and the rep transparency trustworthy. It is not a feature — it is the bridge between "we calculate commissions" (entity-level, which exists) and "every calculation is auditable and explainable" (transaction-level, which does not). Build as enduring infrastructure.
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt; no internal duplication; ends at §6A.

---

## §0 — CC STANDING RULES HEADER

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full before starting. Architecture Decision Gate before implementation. Anti-Pattern Registry checked every build. SQL Verification Gate before any SQL. Commit + push after every phase. After all phases: kill dev → `rm -rf .next` → `npm run build` (exit-0) → `npm run dev` → confirm `localhost:3000`. Git from repo root (`spm-platform`, NOT `web/`). Final step: `gh pr create --base main --head ob-217-per-transaction-substrate`. **DO NOT merge** (SR-44). **No ground-truth values in CC outputs** (reconciliation-channel separation). **Live code only** — read fresh from HEAD; do NOT reference `AUD-001_CODE_EXTRACTION.md` or any extract.

**First action:** write this directive verbatim to `docs/vp-prompts/OB-217_PER_TRANSACTION_AUDIT_SUBSTRATE_DIRECTIVE_20260618.md` and commit (`"OB-217: directive committed"`).

---

## §1 — PROBLEM STATEMENT

### §1.1 The engine's current execution model — entity-aggregate

The engine calculates at the **entity level**, not the transaction level:

1. For each entity assigned to a plan, fetch all `committed_data` rows matching the entity + period from bound batches.
2. `resolveColumnFromBatch` (`run/route.ts` ~1648) aggregates ALL rows into **one value per metric** — SUM for flow columns, snapshot for stock columns. 147 individual transaction values become one number. **Per-row identity is discarded here.**
3. `executeOperation` (`intent-executor.ts`) evaluates the component's calculationIntent against the single aggregated metric set → one payout per component per entity.
4. `writeCalculationResults` (`run-calculation.ts`) stores `{entity_id, total_payout, components: [{name, payout, details}]}`.

**The finest grain of stored calculation is entity × component × period.** There is no record of which individual transaction contributed what, at what rate, or via which tier.

### §1.2 What this gap blocks

Five value-proposition capabilities depend on per-transaction computation and storage. None can function without it:

- **5-layer audit drill-down:** payout → components → transactions → per-transaction calculation. The bottom two layers have no data source.
- **SOC-compliant point-in-time reproducibility** at the transaction level.
- **Structured disputes:** a rep cannot reference a specific transaction's calculation because it was never individually computed.
- **Rep transparency:** "full transparency into every transaction" — gap analysis Category 3, P0 / NOT BUILT.
- **Clawbacks, corrections, reversals:** any retroactive adjustment targeting a specific transaction's original commission has nothing to look up (OB-216 HALT source).

### §1.3 Existing infrastructure to leverage (do not rebuild)

- **`calculation_traces` table:** 9 columns (`id`, `tenant_id`, `result_id` FK→`calculation_results.id`, `component_name`, `formula`, `inputs` JSONB, `output` JSONB, `steps` JSONB, `created_at`). Schema is live. **0 rows in production — no writer is called.** But `writeCalculationTraces` in `run-calculation.ts` exists and works (batch-inserts in chunks of 500). The function has no callers.
- **`committed_data`:** every individual transaction row with full `row_data` JSONB. The raw per-row source. Already fetched by the engine; currently aggregated and discarded at the `resolveColumnFromBatch` call.
- **`resolveColumnFromBatch` reduction recognition:** already distinguishes SUM (flow) vs snapshot (stock) per column. The per-row path reads the same rows but retains individual values.

### §1.4 Definition of done

1. **Schema extended:** `calculation_traces` has `committed_data_id` (uuid FK) and `transaction_ref` (text) columns.
2. **Per-row attribution loop:** after entity-level calculation (unchanged), the engine iterates each `committed_data` row for each component, computes the per-row contribution, and stores a per-row trace.
3. **`writeCalculationTraces` wired and populated:** per-row traces written for every calculation run. `calculation_traces` is no longer empty.
4. **SR-38 mathematical equivalence:** sum of per-row contributions = entity-level result for every entity, every component. Verified by inline check + hand computation.
5. **BCL regression:** $312,033 entity-level total unchanged. Per-transaction is additive, not a replacement.
6. **CRP per-row verification:** Plans 1 + 3 produce per-row traces; sums match entity totals.
7. `npm run build` exit-0; `localhost:3000`; PR opened (not merged).

---

## §2 — ARCHITECT DECISIONS (BINDING) + SUBSTRATE DISCIPLINES

### §2.1 D1 — Storage surface: extend `calculation_traces` (no new table)

**Decided.** Add two columns to the existing `calculation_traces` table. Do NOT create a new table.

- `committed_data_id` — uuid, nullable, FK → `committed_data.id`. The structural identity of the source transaction row. Always present for per-row traces; null for any legacy entity-level traces.
- `transaction_ref` — text, nullable. The business reference key extracted from `row_data` (Folio, invoice number, loan ID). For user-facing display and cross-period linking. Nullable because not all data sets carry a business reference.

**Rationale:** Korean Test (one canonical trace declaration), AUD-009 (one invariant per layer). The existing writer function and JSONB columns accommodate per-row detail without a parallel surface.

### §2.2 D2 — Transaction reference identity: dual (structural + business)

**Decided.** Every per-row trace carries two identities:

- **Structural:** `committed_data_id` (the source row's UUID). Always present, FK-stable, used for all system-internal operations (joins, lookups, cross-period retrieval).
- **Business:** `transaction_ref` (extracted from `row_data` at calculation time). Data-dependent — populated when the row's data contains a recognizable reference key; null otherwise. For this OB, extract `transaction_ref` from `row_data` using the convergence binding's recognized identifier columns. If no transaction-level reference key is identifiable, leave null — the structural identity (`committed_data_id`) is always sufficient.

### §2.3 D3 — Attribution pattern: three patterns, selected by operation type

**Decided.** The component's `calculationIntent` operation tree determines the attribution pattern. No per-plan branching. No configuration flag.

**Pattern A — Additive (per-row independent):** The operation produces a result independently computable per row. Operation types: `scalar_multiply` where input source is `metric`; `bounded_lookup_1d` where output is a rate applied to per-row values. Each row: `contribution = rate × row_metric_value`. Sum = entity total (by construction).

**Pattern B — Qualified (entity-level qualification, per-row contribution):** The operation has an entity-level qualification gate (ratio, threshold, condition) and an inner operation applied to per-row values. Operation types: `conditional_gate` wrapping `scalar_multiply` or rate-producing lookup. Entity-level qualification computed first (from the existing aggregate calculation). Each qualifying row: `contribution = rate × row_metric_value`. Each row's trace carries the qualification context (entity ratio, threshold, met/unmet). Sum = entity total (same rate × same values).

**Pattern C — Non-attributable (entity-level only):** The component produces a result not decomposable to individual transaction rows. Operation types: `bounded_lookup_1d`/`bounded_lookup_2d` with flat-amount outputs (not rate outputs); `constant`; any operation where the result is a function of entity-level aggregates with no per-row decomposition. These components produce entity-level traces only (as today). No per-row loop executes.

**Pattern classification function:** examine the calculationIntent operation tree structurally. If the operation's input source is per-row (`metric`) and the output is multiplicative with per-row values → Pattern A. If the operation is a gate wrapping a per-row multiplicative inner → Pattern B. If the output is a flat amount or constant → Pattern C.

### §2.4 Governing decisions (binding throughout)

- **Decision 158:** per-transaction computation is below the Deterministic Calculation Boundary. Zero LLM calls.
- **Korean Test (Decision 154, LOCKED):** structural identifiers only. No column-name literals, no language-specific strings, no per-tenant branches.
- **Decision 110:** no developer-assigned numerical thresholds.
- **SR-2 (Scale by Design):** works for any plan type, any transaction count, any component count.
- **SR-38 (Mathematical review gate):** per-row sum MUST equal entity-level result. Hard gate.
- **SR-34 (No Bypass):** no workarounds. If per-row attribution doesn't sum correctly, fix the attribution — don't skip the component.

---

## §3 — PHASE 1: Schema Migration + Writer Extension

### §3.1 Read and verify the existing trace infrastructure

Read `writeCalculationTraces` in `web/src/lib/calculation/run-calculation.ts`. Confirm with pasted code:
1. The function signature (what parameters, what shape of trace objects it accepts).
2. That it is never called (`grep -rn 'writeCalculationTraces' web/src/` — expect the definition and zero call sites in production paths).
3. The batch-insert mechanism (chunking, the columns it inserts into).

Read the `calculation_traces` schema (`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'calculation_traces' ORDER BY ordinal_position`). Confirm 9 columns, no `committed_data_id`, no `transaction_ref`.

### §3.2 Schema migration

Author the migration file at `web/supabase/migrations/<timestamp>_ob217_per_transaction_traces.sql`:

```sql
-- OB-217: Per-transaction trace columns
ALTER TABLE calculation_traces
  ADD COLUMN committed_data_id uuid REFERENCES committed_data(id),
  ADD COLUMN transaction_ref text;

CREATE INDEX idx_calc_traces_committed_data
  ON calculation_traces (tenant_id, committed_data_id)
  WHERE committed_data_id IS NOT NULL;

CREATE INDEX idx_calc_traces_transaction_ref
  ON calculation_traces (tenant_id, transaction_ref)
  WHERE transaction_ref IS NOT NULL;

COMMENT ON COLUMN calculation_traces.committed_data_id IS 'FK to source transaction row — structural identity for per-row traces';
COMMENT ON COLUMN calculation_traces.transaction_ref IS 'Business reference key extracted from row_data — for display and cross-period linking';
```

Architect applies via Supabase SQL Editor (SR-44). CC authors + commits the migration file. After application, verify:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'calculation_traces'
ORDER BY ordinal_position;
-- Expect 11 columns (9 original + committed_data_id + transaction_ref)
```

### §3.3 Extend `writeCalculationTraces`

Modify the function to accept and insert the two new columns. The trace object type gains:
- `committedDataId?: string` — the source row's UUID
- `transactionRef?: string | null` — the business reference

The INSERT statement gains the two columns. Existing callers (there are none) are unaffected because the new fields are optional.

Commit: `"OB-217 Phase 1: schema migration + writer extension"`

### §3.4 EPG-1

Paste: (a) schema query showing 11 columns. (b) `writeCalculationTraces` diff showing new columns in insert. (c) grep confirming 0 production call sites (wired in Phase 2). (d) `npm run build` exit-0.

**HALT-SCHEMA:** if migration fails (FK constraint, naming collision) → report with error text.

---

## §4 — PHASE 2: Per-Row Attribution Loop + Trace Wiring

This is the core build. The approach is **additive, not invasive**: the existing entity-level calculation path is UNCHANGED. After it produces the entity-level result (as today), a NEW per-row attribution step runs, computes per-row contributions, verifies the sum, and stores traces.

### §4.1 Read the entity calculation loop

Read the main entity loop in `web/src/app/api/calculation/run/route.ts` (~1400–2800). Identify with pasted code:
1. Where the entity's `committed_data` rows are fetched (the query, the batch selection, the row set variable).
2. Where `resolveColumnFromBatch` is called to aggregate them (the exact call site).
3. Where the component result is computed via `executeOperation` or the legacy evaluator.
4. Where `writeCalculationResults` stores the entity-level result.
5. **The SEAM:** the point AFTER entity-level computation where per-row attribution can be inserted — the entity result is computed, the committed_data rows are still in scope, and the traces have not yet been (not) written.

### §4.2 Pattern classification function

Create a function (in `run-calculation.ts` or a new `per-row-attribution.ts` module) that classifies a component's attribution pattern:

```typescript
type AttributionPattern = 'additive' | 'qualified' | 'non-attributable';

function classifyAttributionPattern(component: PlanComponent): AttributionPattern {
  const intent = component.calculationIntent;
  if (!intent) return 'non-attributable'; // legacy components without intent

  // Pattern A: scalar_multiply with metric input, or rate-producing lookups
  if (intent.operation === 'scalar_multiply') {
    const inputSource = intent.input?.source;
    if (inputSource === 'metric') return 'additive';
  }

  // Pattern B: conditional_gate wrapping a per-row multiplicative operation
  if (intent.operation === 'conditional_gate') {
    const inner = intent.onTrue;
    if (inner?.operation === 'scalar_multiply' && inner?.input?.source === 'metric') {
      return 'qualified';
    }
  }

  // Pattern A: bounded_lookup producing a rate (isMarginal or postProcessing.rateFromLookup)
  if (intent.operation === 'bounded_lookup_1d') {
    const raw = intent as Record<string, unknown>;
    if (raw.isMarginal || (raw.postProcessing as Record<string, unknown>)?.rateFromLookup) {
      return 'additive';
    }
    // Flat-amount lookup → non-attributable
    return 'non-attributable';
  }

  // bounded_lookup_2d: typically flat-amount (matrix) → non-attributable
  if (intent.operation === 'bounded_lookup_2d') return 'non-attributable';

  // Default: non-attributable (conservative — don't attribute what you can't prove)
  return 'non-attributable';
}
```

**HALT-SR42:** if classifying a live tenant's component requires a component-name literal, plan-name literal, or tenant-specific branch → the classification is not structural. Stop and generalize.

### §4.3 Per-row attribution function

After the entity-level calculation produces the component result, run per-row attribution for Pattern A and Pattern B components. For each component:

1. **Get the per-row metric values.** The entity's `committed_data` rows are already fetched (§4.1 step 1). For each row, extract the relevant metric value from `row_data` using the convergence binding's column name (the same column that `resolveColumnFromBatch` aggregated). This is a read of `row.row_data[bindingColumnName]` — no aggregation, no new query.

2. **Get the effective rate.** For Pattern A (`scalar_multiply`): the rate is the literal `intent.rate`. For Pattern B (`conditional_gate` → `scalar_multiply`): the rate is the inner operation's `intent.onTrue.rate`, applied only if the entity qualified (which is known from the entity-level result being > 0).

3. **Compute per-row contribution.** For each row: `contribution = effectiveRate × rowMetricValue`.

4. **Extract transaction_ref.** From `row.row_data`, look for a reference-key field. Use the convergence binding's identified `entity_id_field` column or any field with `structuralType: 'identifier'` that is NOT the entity identifier. If none found, `transaction_ref = null`. The structural identity `committed_data_id = row.id` is always available.

5. **SR-38 inline check.** Sum all per-row contributions. Compare against the entity-level component payout (already computed). They MUST be equal (within IEEE 754 precision: `Math.abs(sum - entityPayout) < 0.005`). If they differ → log a loud error with the delta. **HALT-SR38** if the delta exceeds 0.005 for ANY entity-component pair.

6. **Build trace objects.** For each row, construct:
   ```typescript
   {
     resultId: entityCalculationResult.id,
     componentName: component.name,
     committedDataId: row.id,         // committed_data.id — structural identity
     transactionRef: extractedRef,     // business reference or null
     formula: `${effectiveRate} × ${bindingColumnName}`,
     inputs: { [bindingColumnName]: rowMetricValue },
     output: {
       contribution: perRowContribution,
       rate: effectiveRate,
       pattern: attributionPattern,    // 'additive' | 'qualified'
       ...(attributionPattern === 'qualified' ? {
         qualification: {
           entityMetric: entityAggregateValue,
           threshold: thresholdFromIntent,
           met: true
         }
       } : {})
     },
     steps: []  // can be enriched later
   }
   ```

### §4.4 Wire the trace writer

At the SEAM (§4.1 step 5), after entity-level results are written and per-row attribution is computed, call `writeCalculationTraces` with the accumulated per-row trace objects. This is the call site that has never existed — the function works; it just needs to be called.

For Pattern C components: no per-row traces. Optionally write one entity-level trace per component (the legacy intent of `calculation_traces`). This is additive and recommended but not blocking.

### §4.5 Integration point

The per-row attribution loop runs INSIDE the existing entity iteration, AFTER the entity-level component evaluation, BEFORE (or alongside) the result write. Pseudo-structure:

```
for each entity:
  // === EXISTING CODE (unchanged) ===
  fetch committed_data rows
  for each component:
    resolveColumnFromBatch → aggregate metrics
    executeOperation → entity-level payout
  writeCalculationResults → entity-level result stored

  // === NEW CODE (OB-217) ===
  for each component:
    pattern = classifyAttributionPattern(component)
    if pattern is 'additive' or 'qualified':
      traces = attributeComponentToRows(entity rows, component, entity result, convergence bindings)
      // SR-38 check is inside attributeComponentToRows
      allTraces.push(...traces)

  if allTraces.length > 0:
    writeCalculationTraces(tenantId, allTraces)
```

The entity-level calculation is completely untouched. Per-row attribution is a post-calculation enrichment step. If it fails, entity-level results are already stored correctly.

Commit: `"OB-217 Phase 2: per-row attribution loop + trace wiring"`

### §4.6 EPG-2

Paste: (a) the per-row attribution function diff. (b) the pattern classifier diff. (c) the trace writer call site diff. (d) one sample calculation run showing per-row traces stored in `calculation_traces` (query: `SELECT committed_data_id, transaction_ref, component_name, output FROM calculation_traces WHERE tenant_id = '<BCL or CRP tenant>' LIMIT 5`). (e) SR-38 equivalence proof: for one entity, show sum of per-row contributions vs entity-level payout — must be equal.

`npm run build` exit-0.

**HALT-SR38:** per-row contribution sum ≠ entity-level result for any entity-component → stop. Report the entity, component, sum, entity result, and delta.
**HALT-SR42:** any step requiring a column-name literal, developer threshold, or tenant branch → stop and report.
**HALT-PATTERN:** classification function produces 'non-attributable' for a component that the architect expects to be Pattern A or B → stop and report the component's calculationIntent structure.

---

## §5 — PHASE 3: Verification + Regression Gate + PR

### §5.1 BCL regression gate

Run BCL calculation (all 6 periods). Entity-level totals MUST be unchanged:

- Oct: $44,590 · Nov: $46,291 · Dic: $61,986 · Ene: $47,545 · Feb: $53,215 · Mar: $58,406
- Grand total: $312,033

Paste the Vercel log or localhost output showing per-period totals. **HALT-REG** if any period total differs.

BCL's components are `bounded_lookup_2d` (matrix → flat amount) — Pattern C. Verify that the classifier correctly identifies them as non-attributable and no per-row traces are generated for BCL matrix components.

### §5.2 CRP per-row verification

Run CRP calculation (Plans 1 + 3). These plans exercise:
- Plan 1 (`linear_function` / `scalar_multiply`): Pattern A — per-row traces expected.
- Plan 3 (`conditional_gate`): Pattern B — per-row traces expected with qualification context.

Paste for each plan:
1. Entity-level total payout (must match prior verified value — Plans 1+3 PASS).
2. Count of per-row traces generated (`SELECT COUNT(*) FROM calculation_traces WHERE tenant_id = '<CRP>' AND committed_data_id IS NOT NULL`).
3. One sample per-row trace showing `committed_data_id`, `transaction_ref`, `inputs`, `output` (with `contribution`, `rate`, `pattern`).
4. SR-38 proof: for one entity per plan, paste sum of per-row contributions vs entity payout.

### §5.3 Trace existence verification

```sql
SELECT
  COUNT(*) AS total_traces,
  COUNT(committed_data_id) AS per_row_traces,
  COUNT(*) - COUNT(committed_data_id) AS entity_level_traces
FROM calculation_traces
WHERE tenant_id IN ('<BCL>', '<CRP>');
```

Confirm `per_row_traces > 0`. The table that has had 0 rows since inception now has data.

### §5.4 Build + PR

`npm run build` exit-0. `localhost:3000` returns 200. Then:

```bash
gh pr create --base main --head ob-217-per-transaction-substrate \
  --title "OB-217: Per-transaction calculation traces — audit substrate" \
  --body "Per-row attribution loop for Pattern A (additive) and Pattern B (qualified) components.
Schema: committed_data_id + transaction_ref added to calculation_traces.
SR-38: per-row sums verified equal to entity totals.
BCL regression: \$312,033 unchanged (Pattern C — no per-row traces for matrix components).
CRP Plans 1+3: per-row traces stored, sums verified.
calculation_traces populated for the first time in production."
```

**DO NOT MERGE** (SR-44).

Commit: `"OB-217 Phase 3: verification + PR"`

---

## §5A — REPORTING DISCIPLINE

Completion report at `docs/completion-reports/OB-217_COMPLETION_REPORT.md`. Per Rules 25–28, must include:

1. **Pasted evidence** (not self-attestation): schema query showing 11 columns, grep showing writer call site, sample traces from calculation_traces, SR-38 equivalence proof, BCL regression totals, CRP per-row trace samples.
2. **SHA:** the merge-ready commit SHA on the PR branch.
3. **ARTIFACT SYNC block** (per `CC_STANDING_ARCHITECTURE_RULES.md` / INF-003):
   ```
   ARTIFACT SYNC
   MC: [new items discovered during build, if any]
   REGISTRY: [Calculation Engine row → per-transaction calculation evidence; Audit Trail row → calculation_traces populated evidence]
   R1: [criteria affected, if any]
   BOARD: [capability data deltas]
   SUBSTRATE: [entries exercised: Decision 158, Korean Test, SR-38]
   ```
4. **Build verification:** `npm run build` exit-0, `localhost:3000` 200.

---

## §6 — OUT OF SCOPE

- **Category-code mismatch** (MIR Plan 1: `ALI`/`BEB`/`LIM` vs `Alimentos`/`Bebidas`/`Limpieza`) — plan-interpretation defect, separate HF. Does not block the substrate build; blocks correct MIR Plan 1 values.
- **Clawback mechanism** — consumes the per-transaction substrate. Separate OB (cross-period retrieval + reversal computation + negative entry storage). OB-217 builds what the clawback looks up.
- **Cross-period retrieval wiring** (`priorDataByEntity`, `priorPeriodRows` — dead code) — part of clawback OB, not substrate.
- **UI drill-down surfaces** (commission statements, transaction detail pages, dispute UI) — consume traces stored by this OB. Separate build.
- **Progressive Performance / caching** for per-transaction computation — performance optimization, separate OB.
- **Convergence-layer transaction_ref extraction evolution** — enriching `transaction_ref` population via convergence binding recognition. For this OB, simple extraction from `row_data` identifiers is sufficient.
- **MIR tenant verification** — blocked by HF-302/HF-303 (unmerged, PR 537) and C1 (plan supersession). Deferred to post-merge.
- **Marginal-tier per-row attribution** (cumulative position dependency) — complex Pattern A sub-case. Not present in any current proof tenant. Deferred.
- **Changes to `entity_period_outcomes`** — dashboard materialization layer remains entity-level, unchanged.

---

## §6A — RESIDUALS

1. **MIR as keystone proof:** once HF-302/HF-303 merge and category-code mismatch is fixed, MIR becomes the full proof: 5 plans × per-transaction traces × clawback consuming stored traces. OB-217's CRP proof validates the mechanism; MIR validates the mission.

2. **Storage volume:** per-row traces scale as `entities × components × transactions_per_entity × periods`. For MIR's entity 10300021 with 147 Cobranza rows × 1 component × 1 period = 147 trace rows. At scale (1,000 entities × 3 components × 200 transactions × 12 periods = 7.2M rows/year), index strategy and retention policy become material. Follow-on.

3. **Pattern classification completeness:** the classifier handles `scalar_multiply`, `conditional_gate`, `bounded_lookup_1d` (rate vs flat), `bounded_lookup_2d`. New primitives (`weighted_blend`, `temporal_adjustment`, `ranked_selection`) will need classification rules added when they arrive. The structural-classification approach extends naturally.

4. **Entity-level trace enrichment:** Pattern C components currently produce no trace rows. Writing one entity-level trace per Pattern C component (using the existing `calculation_traces` schema without `committed_data_id`) would complete the trace surface for all components. Additive, low-risk, follow-on.

5. **The clawback chain:** OB-217 (per-transaction substrate) → HF for category-code fix → OB for clawback mechanism (cross-period retrieval + reversal). The substrate must exist before the clawback can be built. This OB is step 1.

---

*OB-217 · Per-Transaction Calculation & Storage Substrate · 2026-06-18 · vialuce.ai — Intelligence. Acceleration. Performance.*
*Drafting SOP: INF_Structured_Compliant_Drafting_Reference_20260513.md · Architect decisions D1/D2/D3 ratified 2026-06-18*
