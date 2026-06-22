# Per-Transaction Calculation & Storage: Comprehensive Technical Outline

**What this document is:** a deeply technical account of a foundational platform capability gap discovered during OB-216's clawback HALT — grounded in specific live files, functions, tables, and schemas. This is the architect-channel reference for the capability build that follows.

**Why it matters beyond the clawback:** per-transaction calculation and storage is the substrate for the 5-layer audit drill-down, SOC-compliant point-in-time reproducibility, structured disputes, rep transparency ("click on a transaction to see exactly how it was calculated"), and any retroactive adjustment (clawbacks, corrections, reversals). The clawback exposed the gap; these capabilities are what it serves.

---

## 1. WHAT EXISTS TODAY (live, verified)

### 1.1 The engine's current execution model — entity-aggregate

The engine calculates at the **entity level**, not the transaction level. The flow (live in `run/route.ts` and `intent-executor.ts`):

1. **Fetch rows:** for each entity assigned to a plan, fetch all `committed_data` rows matching the entity + period from the bound batches.

2. **Aggregate to one value per metric:** `resolveColumnFromBatch` (`run/route.ts` ~1648-1677, post-OB-216) takes ALL of an entity's rows for a column and returns **one aggregated number** — a SUM for flow columns, a snapshot for stock columns (OB-216 Phase 3′). For entity 10300021 with 147 Cobranza rows: `Monto_Cobrado` → 295,288.17 (sum of 147 rows), `Saldo_Pendiente` → 6,026.29 (snapshot). The individual row values are consumed and lost at this step.

3. **Evaluate the component intent:** `executeOperation` (`intent-executor.ts`) takes the aggregated metrics and evaluates the plan's prime-DAG tree: `if (295,288.17 / 6,026.29) > 0.7 then 295,288.17 × 0.015 else 0` → 4,429.32. This produces **one payout per component per entity** — not per transaction.

4. **Store entity-level results:** `writeCalculationResults` (`run-calculation.ts`) writes to `calculation_results`:
   ```
   { entity_id, rule_set_id, period_id, total_payout: 4429.32,
     components: [{componentId, componentName, payout: 4429.32, details: {inputs, operation}}],
     metrics: {Monto_Cobrado: 295288.17, Saldo_Pendiente: 6026.29},
     attainment: {...}, metadata: {...} }
   ```
   **This is the finest grain of stored calculation.** There is no record of which individual transaction contributed what, at what rate, or via which tier.

### 1.2 The calculation_traces table — exists but empty

The `calculation_traces` table is live in the schema:
```
calculation_traces (9 columns):
  id (uuid PK), tenant_id, result_id (FK → calculation_results.id),
  component_name (text), formula (text nullable),
  inputs (JSONB), output (JSONB), steps (JSONB), created_at
```
And `writeCalculationTraces` exists as a function in `run-calculation.ts` — it accepts an array of `{resultId, componentName, formula, inputs, output, steps}` and batch-inserts them. The function works. **But no code calls it.** The table has **0 rows in production** (confirmed OB-212 "durable trap" finding). The trace infrastructure was built and never wired.

Even if wired, `calculation_traces` is per-component per-entity (keyed by `result_id` → one `calculation_result` per entity), NOT per-transaction. It could store "entity 10300021's commission used inputs {Monto_Cobrado: 295288.17} and formula X" — that's per-component trace, not per-transaction trace.

### 1.3 The entity_period_outcomes table — materialized entity-level

`entity_period_outcomes` stores:
```
entity_id, period_id, total_payout (numeric),
rule_set_breakdown (JSONB), component_breakdown (JSONB),
lowest_lifecycle_state, attainment_summary, metadata, materialized_at
```
This is the dashboard consumption layer — aggregated across all plans for an entity in a period. It is *above* per-transaction, not below it.

### 1.4 The committed_data table — the raw transactions ARE there

`committed_data` stores every individual transaction row with its full `row_data` JSONB:
```
entity_id, period_id, import_batch_id, data_type, source_date, row_data (JSONB),
metadata, created_at
```
For entity 10300021 in January: 147 Cobranza rows, each carrying `{DNI_Vendedor, Monto_Cobrado, Saldo_Pendiente, Fecha_Cobro, ...}`. **The individual transactions exist in the database.** They are read by the engine, aggregated, and the per-row identity is discarded at aggregation time.

### 1.5 The gap analysis confirms this is P0 / NOT BUILT

From `VIALUCE_COMPREHENSIVE_GAP_ANALYSIS_20260314.md` (Category 3: Commission/Payout Reporting):
- **Individual commission statements** (component breakdown, period history, plan detail): **NOT BUILT, P0**
- **Transaction-level detail** (rep sees every transaction that contributed to their payout): **NOT BUILT, P0**
- **Store/variant/component drill-down views**: **NOT BUILT, P1**

The gap analysis states: *"Individual statements and transaction detail are in the VALUE PROPOSITION. They're what we're selling. Empty pages here are a credibility risk."*

### 1.6 The Caribe proof tenant Phase B — designed to build this

From `DUAL_OBJECTIVE_PROOF_TENANT_3_PLUS_CAPABILITIES.md`, Phase B:
> "Per-transaction calculation (vs BCL's per-entity-per-period pattern). Commission statements showing every transaction with its rate and payout. Entity-level drill-down from total → component → transaction."

This was designed as a future proof milestone. It has not been built.

---

## 2. WHAT DOES NOT EXIST (the gap, precisely named)

### 2.1 Per-transaction computation
The engine does not evaluate a component against individual transaction rows. It aggregates all rows into one metric set, then evaluates once. There is no per-row calculation loop.

### 2.2 Per-transaction storage
No table or JSONB structure stores "transaction X earned commission Y at rate Z via tier T with accelerator A." `calculation_results.components` stores per-component totals; `calculation_traces` is empty and per-component.

### 2.3 Transaction-level audit trail
A user cannot click on a specific transaction and see how it was calculated, because that calculation was never performed or stored individually. The promise "every calculation is auditable and explainable" is true at the entity-component level, not at the transaction level.

### 2.4 Cross-period per-transaction retrieval
The clawback needs: "what was the commission earned on transaction TXN-594392 in January?" There is no stored answer. Even if Plan 1 calculated correctly, it would store "entity 10300005 earned X total from commission in January" — not "transaction TXN-594392 earned Y at rate Z." The clawback can only reverse a specific transaction's commission if that transaction's commission was individually computed and stored.

---

## 3. WHAT MUST BE BUILT (the capability, architecturally)

### 3.1 The execution model change — per-transaction-then-aggregate

The engine must evolve from:
```
for each entity:
  aggregate all rows → one metric set
  evaluate component(metric set) → one payout
  store entity-level result
```
to:
```
for each entity:
  for each transaction row:
    extract per-row metrics
    evaluate component(per-row metrics, entity-context) → per-row contribution
    store per-row trace {transaction_ref, inputs, rate, tier, contribution}
  aggregate per-row contributions → entity total (must equal the legacy calculation)
  store entity-level result (unchanged) + transaction-level detail
```

### 3.2 The transaction reference identity
Each transaction row in `committed_data` needs a stable identity for the trace to reference. Candidates:
- `committed_data.id` (the row's UUID) — always present, stable.
- A business reference key (`Folio`, `Folio_Original`, invoice number) — present on some but not all data sets, more meaningful for user-facing display.
- A composite of `import_batch_id + row_data` hash — structurally unique.

The reference identity is what the clawback's `Folio_Original` links to, what the UI displays as "Transaction X," and what the dispute references. It must be structural (Korean Test — no literal), stable (SOC — reproducible), and unique per row.

### 3.3 The per-transaction trace storage

**Option A — extend `calculation_traces`:** add `transaction_ref` (the row identity), and write one trace row per transaction-per-component. The existing schema (`inputs`, `output`, `steps` JSONB) already accommodates the per-row calculation detail. The `writeCalculationTraces` function already exists and batch-inserts. This is the minimum-new-surface option.

**Option B — new `transaction_calculation_details` table:** purpose-built for the per-row model:
```
tenant_id, batch_id, entity_id, period_id, rule_set_id, component_id,
transaction_ref (text — the row identity),
row_inputs (JSONB — the raw values from this row),
rate_applied (numeric), tier_matched (text nullable),
accelerator (numeric nullable), contribution (numeric),
metadata (JSONB), created_at
```
This is more structured than extending JSONB traces but introduces a new table.

Either way, the storage must support: "for entity X, component Y, period Z — show me every transaction with its individual inputs, the rate that was applied, which tier it fell in, and the per-row payout contribution."

### 3.4 Plan-type awareness — not all plans are per-transaction

The per-transaction model is natural for **additive** plans (each transaction independently contributes to the payout): `commission = rate × sale_amount`, summed across transactions.

It is less natural for **threshold/ratio** plans (entity-level aggregates determine the outcome): Plan 3's "if (total_collected / total_balance) > 0.7 then 1.5% of total_collected" — the ratio is entity-level, not per-row. Two approaches:
- **Per-transaction evaluation with entity context:** each row is evaluated with the entity-level ratio already computed, so the per-row result = `(row's Monto_Cobrado × 0.015)` if the entity qualifies. This is attribution: the per-row contributions sum to the entity total.
- **Entity-level calculation with pro-rata attribution:** calculate at entity-level (as today), then attribute the result back to individual rows proportionally. Less precise but simpler.

The architecture must handle both patterns — the first for additive plans (commission, bonus), the second for ratio/threshold plans if per-row evaluation isn't semantically clean. The plan's component type determines which pattern applies.

### 3.5 Cross-period retrieval (the clawback unblock)

Once per-transaction traces are stored, the clawback mechanism becomes:
1. Identify the return transaction (row with `Folio_Original` in the current period).
2. Resolve `Folio_Original` → the original transaction row's identity in a prior period.
3. Look up the stored per-transaction trace for that original transaction: what rate was applied, what the commission contribution was.
4. Reverse: `clawback = −recovery_rate × original_contribution`.

This is the general cross-period capability — structurally recognized reference-key → stored prior-period trace → plan-declared reversal formula. The clawback is one instance; retroactive bonuses, corrections, and adjustments are others.

### 3.6 The mathematical equivalence requirement (SR-38)

**Critical:** the sum of per-transaction contributions MUST equal the entity-level result that the current (aggregate) engine produces. If Plan 3 computes 4,429.32 for entity 10300021 via the aggregate path, the per-transaction model must produce per-row contributions that sum to 4,429.32. Any discrepancy is a regression, not a rounding tolerance. This is the proof that per-transaction computation is additive to the platform, not a replacement that could shift values.

### 3.7 The SOC / audit / dispute chain this enables

Once per-transaction computation and storage exist, the following becomes possible:
- **5-layer drill-down:** Payout total → Plan components → Individual transactions → Per-transaction calculation (rate, tier, inputs, contribution).
- **Point-in-time reproducibility:** any transaction's commission, at any period, is stored and retrievable. No recomputation needed — the trace IS the record.
- **Structured disputes:** a rep clicks a specific transaction, sees the calculation, and disputes "this sale should have been categorized as Alimentos, not Bebidas" with the specific data reference. The dispute references the stored trace, not a recomputation.
- **Clawbacks/corrections/reversals:** look up the stored original, reverse or adjust it. General, structural, no special-case.

---

## 4. THE CATEGORY-CODE MISMATCH (independent, upstream)

Separate from the per-transaction gap, a live plan-interpretation defect blocks Plan 1's correctness:

**Plan 1's rate conditions check** `Categoria == 'ALI' / 'BEB' / 'LIM'` (3-letter codes).
**The actual data in Ventas_Enero** contains `Alimentos / Bebidas / Limpieza / Cuidado Personal` (full Spanish names).
**They never match** → Plan 1 falls through to the else rate (0.035) for every sale, regardless of category.

This means:
- Plan 1's current commission values are probably wrong (applying else-rate universally instead of category-specific rates).
- Even with per-transaction computation, the clawback would reverse the *wrong* commission if Plan 1 is still miscategorizing.
- This is a plan-interpretation defect — the recognizer emitted 3-letter codes instead of grounding against the actual data vocabulary. It connects directly to OB-214 (Plan Interpretation Agent) and the cross-conversation sync note about abstract-field grounding.

**The fix sequence:** fix the category-code mismatch (so Plan 1 calculates correctly with the right rates) → build per-transaction computation (so each transaction's correct commission is individually stored) → the clawback retrieves and reverses the stored correct original commission. That chain is the full resolution.

---

## 5. FILES AND FUNCTIONS THAT BEAR ON THE BUILD

| File | Function/Area | Current role | What changes |
|---|---|---|---|
| `web/src/app/api/calculation/run/route.ts` | `resolveColumnFromBatch` (~1648) | Aggregates all entity rows → one value | Needs a per-row variant returning individual row values with row identity |
| `web/src/app/api/calculation/run/route.ts` | Main entity loop (~1400-2800) | Iterates entities, aggregates, evaluates once | Needs inner per-row loop for per-transaction evaluation |
| `web/src/app/api/calculation/run/route.ts` | `priorDataByEntity` (~959-1034) | Fetches prior-period data but DEAD | Wire for cross-period retrieval |
| `web/src/lib/calculation/intent-executor.ts` | `executeOperation` | Evaluates component against aggregated metrics | Needs to evaluate against single-row metrics for per-transaction |
| `web/src/lib/calculation/intent-executor.ts` | `priorPeriodRows` (~240-353) | Dead code path | Wire for cross-period row retrieval |
| `web/src/lib/calculation/run-calculation.ts` | `writeCalculationTraces` | Exists, never called | Wire as the per-transaction trace writer (extend schema if needed) |
| `web/src/lib/calculation/run-calculation.ts` | `writeCalculationResults` | Writes entity-level results | Unchanged (entity-level stays; per-transaction is additive) |
| `web/src/lib/intelligence/convergence-service.ts` | binding output | Produces per-component column bindings | Must carry the row-identity column for per-transaction referencing |
| DB: `calculation_traces` | Table | 9 columns, 0 rows, no writer | Extend with `transaction_ref`; wire writer |
| DB: `calculation_results` | Table | Entity-level storage | Unchanged (per-transaction is a lower layer) |
| DB: `committed_data` | Table | Individual transaction rows | Read-path only (the per-row source) |

---

## 6. SUMMARY — What this capability IS

Per-transaction calculation and storage is **not a feature** — it is a **platform substrate**. It is the layer that makes the audit promise real, the dispute mechanism functional, the clawback computable, and the rep transparency trustworthy. It is the bridge between "we calculate commissions" (entity-level, which exists) and "every calculation is auditable and explainable" (transaction-level, which doesn't yet).

The clawback was the first plan that made the gap a blocker. The audit drill-down, the disputes, and the rep transparency are the capabilities that make it worth building as a general substrate rather than a clawback-specific hack.

---

*Per-Transaction Calculation & Storage: Technical Outline · 2026-06-18 · vialuce.ai*
