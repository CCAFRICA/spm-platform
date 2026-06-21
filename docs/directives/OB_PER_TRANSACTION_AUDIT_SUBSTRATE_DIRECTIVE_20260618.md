# OB-[TBD] — Per-Transaction Calculation & Storage: The Audit Substrate

**OB number:** architect-assigned. **Verify against live `docs/vp-prompts/` before writing; collision → HALT.**
**Repo:** `CCAFRICA/spm-platform` · **Base:** branch from `main` (post OB-216 merge).
**Type:** BUILD (vertical slice — engine execution model + trace storage + cross-period retrieval + keystone proof, one PR).
**Effort directive:** Execute with **ULTRATHINK / ULTRACODE / maximum reasoning effort.** This is a foundational platform capability — the substrate that makes auditing, disputes, transparency, clawbacks, and corrections real. It is not a feature; it is the bridge between "we calculate commissions" and "every calculation is auditable and explainable at the transaction level." Build it as enduring infrastructure, not a clawback fix.

---

## §0 — CC Standing Rules, Pre-Flight

### §0.0 Standing rules (binding)
Read `CC_STANDING_ARCHITECTURE_RULES.md` in full before starting. Architecture Decision Gate before implementation. Anti-Pattern Registry checked every build. SQL Verification Gate before any SQL. Commit + push after every phase. After all phases: kill dev → `rm -rf .next` → `npm run build` (exit-0) → `npm run dev` → confirm `localhost:3000`. Git from repo root. Final step: `gh pr create --base main`. **DO NOT merge** (SR-44). **No ground-truth values in CC outputs** (reconciliation-channel separation). **Live code only** — DO NOT read `AUD-001_CODE_EXTRACTION.md` or any extract; read fresh from HEAD.

### §0.1 Governing decisions
- **Decision 158 (LLM Recognition + Code Construction):** the per-transaction engine is deterministic. LLM is used only for plan interpretation and convergence binding (upstream, already built). This OB is purely deterministic engine work — no LLM calls in the per-transaction computation or storage.
- **Korean Test (Decision 154, LOCKED):** every structural identifier (transaction reference, trace key, reduction type) is structural; zero language-specific string literals.
- **Decision 110:** no developer-assigned numerical thresholds. The per-transaction computation uses the plan's declared rates/tiers/formulas; no tuned constant.
- **SR-2 (Scale by Design):** per-transaction computation must work for any plan type, any number of transactions, any number of components — not just MIR's 5 plans.
- **SR-38 (Mathematical review gate):** the sum of per-transaction contributions MUST equal the entity-level result from the current (aggregate) engine. Any discrepancy is a regression, not a rounding tolerance. Hand-compute one entity from raw per-row values and show the engine reproduces both the per-row detail and the aggregate total.

---

## §1 — Problem Statement

### §1.1 The current engine execution model
The engine calculates at the **entity level**, not the transaction level:
1. For each entity, it fetches all `committed_data` rows for the period from the bound batches.
2. `resolveColumnFromBatch` (`run/route.ts` ~1648) aggregates ALL rows into **one value per metric** — summing flows, snapshotting stocks. The 147 individual transaction values become one number.
3. `executeOperation` (`intent-executor.ts`) evaluates the component's intent against that single aggregated metric set → one payout per component per entity.
4. `writeCalculationResults` stores `{entity_id, total_payout, components: [{name, payout, details}]}` — entity-level.

**No per-transaction computation exists.** No per-transaction storage exists. A user cannot see "transaction X earned commission Y at rate Z." The platform computes "this rep earned $16,024 in commission" but cannot explain which of their 147 transactions contributed what.

### §1.2 What this gap blocks (beyond the clawback)
- **The 5-layer audit drill-down:** payout → components → transactions → per-transaction calculation. The bottom two layers have no data.
- **SOC-compliant point-in-time reproducibility at the transaction level.**
- **Structured disputes:** a rep cannot reference a specific transaction's calculation because it was never individually computed.
- **Rep transparency:** "full transparency into every transaction" (value proposition) — the pages are empty (gap analysis P0/NOT BUILT).
- **Clawbacks, corrections, reversals:** any retroactive adjustment that targets a specific transaction's original commission has nothing to look up. (OB-216 HALT-source.)
- **The category-code mismatch (Plan 1):** `Categoria` conditions check `ALI`/`BEB`/`LIM` but data contains `Alimentos`/`Bebidas`/`Limpieza` — they never match. Plan 1 applies the fallback rate to every sale. Even with per-transaction computation, wrong rates produce wrong per-transaction results. This must be fixed in this build (it's a plan-interpretation defect, not an engine defect, but it blocks the keystone proof).

### §1.3 What already exists (leverage, don't rebuild)
- **`calculation_traces` table:** 9 columns (result_id, component_name, formula, inputs, output, steps). Schema is live. **0 rows — no production writer.** But `writeCalculationTraces` function EXISTS in `run-calculation.ts` and works (batch-inserts in chunks of 500). The function is just never called.
- **`committed_data`:** every individual transaction row with full `row_data` JSONB — the raw per-row source. Already read by the engine; currently aggregated and discarded.
- **The OB-216 convergence fix:** sheet-aware partition, labeled-candidate binding, role-aware validation, general reduction set. Each plan binds to its own sheet's columns correctly. The per-transaction build operates on the corrected binding path.
- **The OB-216 `resolveColumnFromBatch` with reduction recognition:** already distinguishes sum vs snapshot per column. The per-row variant extends this — instead of aggregating, it returns per-row values.
- **The dead `priorDataByEntity`/`priorPeriodRows` substrate** (`run/route.ts` ~959-1034, `intent-executor.ts` ~240-353): infrastructure for cross-period retrieval, built but never wired.

### §1.4 Definition of done
1. **Per-transaction calculation:** for each entity, each component, each transaction row — the engine computes and stores the individual row's contribution (inputs from that row, rate applied, tier matched, per-row payout).
2. **Mathematical equivalence (SR-38):** the sum of per-transaction contributions equals the entity-level result from the aggregate engine (for every entity, every component, verified by hand-computation).
3. **`calculation_traces` wired and populated** — per-transaction traces written for every calc run, queryable by entity + component + transaction reference.
4. **Cross-period per-transaction retrieval:** given a transaction reference key (e.g., `Folio`) and the original period, retrieve that transaction's stored per-transaction trace (rate, inputs, contribution).
5. **Clawback computes:** MIR Plan 5 retrieves the original transaction's stored commission and reverses it — producing a negative in the return period.
6. **Category-code mismatch fixed:** Plan 1's rate conditions match the actual data values (full category names, not 3-letter codes) — so per-transaction results carry the correct category-specific rates.
7. **No entity-level regression:** BCL/Meridian/CRP entity-level totals unchanged (per-transaction is additive, not a replacement).
8. `npm run build` exit-0; `localhost:3000`; PR opened (not merged).

---

## §2 — PHASE 0: Read the Live Engine Flow (read-only; zero code changes)

Before cutting into the engine, ground every assumption against live code. This phase produces a state map with pasted code — the basis for the ADR.

### §2.1 The entity calculation loop
Read the main entity loop in `run/route.ts` end-to-end (~1400-2800). Record with pasted code:
1. Where does the entity's `committed_data` rows get fetched? (The query, the batch selection, the row set.)
2. Where does `resolveColumnFromBatch` aggregate them? (The exact call site, the reduction logic.)
3. Where does `executeOperation` evaluate the component? (The call, the inputs it receives.)
4. Where does `writeCalculationResults` store the result? (The write, the shape.)
5. Where is the SEAM — the point where per-row identity is discarded and aggregation begins? **This is the insertion point for per-transaction computation.**

### §2.2 The calculation_traces infrastructure
Read `writeCalculationTraces` in `run-calculation.ts`. Confirm:
1. The function signature and what it writes.
2. That it is **never called** (grep for call sites — expect 0 in production paths).
3. The `calculation_traces` schema: confirm `transaction_ref` does NOT exist today (it's per-component, not per-row).
4. Whether extending the schema (adding `transaction_ref`) or adding a new table is the lower-risk path.

### §2.3 The dead cross-period substrate
Read `priorDataByEntity` (~959-1034 route.ts) and `priorPeriodRows` (~240-353 intent-executor.ts). Record:
1. What they fetch (prior-period committed_data for the entity?).
2. Why they're dead (the data is fetched but never passed to the evaluator? the evaluator never reads it?).
3. What wiring is needed to make them live.

### §2.4 The Plan 1 category-code mismatch
Read Plan 1's (`3c195e87`) `rule_sets.components` — find the conditional/filter that checks `Categoria`. Record the exact condition values (`ALI`/`BEB`/`LIM` or whatever the live code shows). Then query the actual `Ventas_Enero` data for distinct `Categoria` values. Confirm the mismatch. Record the exact mapping needed.

### §2.5 EPG-0
State map committed with pasted code for all four targets. The SEAM identified. The trace extension path chosen. The dead substrate's wiring gap mapped. The category-code mapping recorded. **HALT-0** if the engine's structure differs materially from this directive's assumptions (e.g., per-row identity is not available at the SEAM, or `committed_data` rows are not individually addressable).

---

## §3 — PHASE 1: Architecture Decision + Category-Code Fix

### §3.1 ADR — per-transaction computation model
Grounded in Phase 0, commit `OB-[TBD]_ADR.md` answering:

**Q1: Per-transaction-then-aggregate vs entity-aggregate-then-attribute?**
- **Per-transaction-then-aggregate:** for each row, extract per-row metrics, evaluate the component against that row, store the per-row trace, sum per-row contributions → entity total. Natural for additive plans (commission = rate × sale, summed). The per-row evaluation may need entity-level context (attainment ratios, tier boundaries computed from totals) — handle by computing entity-level aggregates first, then distributing to per-row evaluation with that context.
- **Entity-aggregate-then-attribute (pro-rata):** calculate at entity-level (as today), then attribute the result back to individual rows proportionally (each row's share = its metric value / total metric value × entity payout). Simpler, but the per-row "rate" is inferred, not actually computed.

**Recommendation (for the ADR to validate):** **per-transaction-then-aggregate** for additive components (commissions, bonuses where each row independently contributes); **entity-level-then-attribute** for ratio/threshold components (where the decision is entity-level but the attribution is meaningful for audit). The component's structural type determines which path — structural, not per-plan (Korean Test / SR-2).

**Q2: Transaction reference identity**
What identifies a row for tracing and cross-period retrieval? From Phase 0's SEAM: `committed_data.id` (UUID, always present), or a business key from `row_data` (e.g., `Folio`), or a composite. The chosen key appears in `calculation_traces.transaction_ref` and is what the clawback's reference-key joins against.

**Q3: Trace storage**
Extend `calculation_traces` (add `transaction_ref` column) or new table? Based on Phase 0 §2.2 findings.

### §3.2 Category-code fix
Fix Plan 1's (`3c195e87`) conditional/filter to use the actual data vocabulary (`Alimentos`/`Bebidas`/`Limpieza`/`Cuidado Personal`) instead of the 3-letter codes (`ALI`/`BEB`/`LIM`). This is a `rule_sets.components` JSONB update — architect pastes the SQL into Supabase Dashboard SQL Editor (SR-44); CC authors + commits the migration file, verifies post-application.

**EPG-1:** ADR committed. Category-code fix applied. Verify Plan 1 now matches categories correctly (run Plan 1 and show the category-specific rates being applied, not the else rate for everything).

---

## §4 — PHASE 2: Per-Transaction Computation Engine

The core build. Modify the engine's entity loop to compute per-row AND aggregate, storing both.

### §4.1 Per-row metric extraction
At the SEAM (Phase 0 §2.1), where the engine currently calls `resolveColumnFromBatch` to aggregate, add a **per-row variant** that returns the array of individual row values with their row identities:
```
resolveColumnPerRow(batchId, column, entityExternalId):
  → Array<{ rowId: string, value: number | null, rowData: Record<string, unknown> }>
```
The existing `resolveColumnFromBatch` (aggregate) remains for the entity-level total; the per-row variant returns the individual values the aggregate consumed. Korean Test: no column-name literal in the per-row function.

### §4.2 Per-row component evaluation
For each entity, after computing entity-level aggregates (needed for context — attainment ratios, tier boundaries), iterate the entity's transaction rows and evaluate the component against each row's individual metrics + the entity-level context:
- **Additive components** (each row independently contributes): evaluate the component's formula with the per-row metric value + entity-level context (attainment, tier position). Store the per-row rate applied, tier matched, and contribution.
- **Ratio/threshold components** (entity-level decision): compute the entity-level result (as today), then attribute to individual rows (each row's contribution = its metric value / total × entity payout). Store the attribution.

The component's structural type (from the plan's `calculationIntent` operation — multiply/percentage → additive; conditional/bounded_lookup → contextual) determines the path. Korean Test: structural operation type, not component name. No per-plan branch.

### §4.3 Per-transaction trace storage
Wire `writeCalculationTraces` (the existing, never-called function) to write per-transaction traces after each calc run. If Q3 chose schema extension, apply the migration (architect pastes SQL, CC authors + commits migration file):
```sql
ALTER TABLE calculation_traces ADD COLUMN transaction_ref text;
CREATE INDEX idx_calc_traces_txn ON calculation_traces (tenant_id, transaction_ref);
```
Each trace row: `{result_id, component_name, transaction_ref, formula, inputs: {per-row-values}, output: {rate, tier, contribution}, steps: {computation-detail}}`.

### §4.4 Mathematical equivalence verification (SR-38, hard gate)
After per-transaction computation: sum all per-row contributions for an entity-component → compare against the entity-level aggregate result (from the unchanged `resolveColumnFromBatch` path). **They must be equal.** If they differ, the per-transaction model has a defect — HALT and fix before proceeding. This is not a tolerance — it's exact equivalence (within float precision, RATIFIED epsilon from OB-216 `2734`).

**EPG-2:** paste the per-row computation diff. Paste a MIR Plan 3 per-transaction trace for one entity (show individual Cobranza rows with their `Monto_Cobrado` values, the entity-level ratio, the rate applied per row, and the per-row contribution). Paste the SR-38 equivalence proof: sum of per-row contributions = entity-level result. BCL entity-level totals unchanged (no regression). Generality: the computation handles additive + contextual component types (two structural paths, not per-plan).

---

## §5 — PHASE 3: Cross-Period Per-Transaction Retrieval + Clawback

### §5.1 Wire the dead cross-period substrate
Complete `priorDataByEntity` and `priorPeriodRows` (Phase 0 §2.3 wiring) so the engine can, for a given entity + reference key + prior period:
1. Query `calculation_traces` for the original transaction's trace row (by `transaction_ref` matching the reference key, in the original period).
2. Return the stored per-transaction inputs, rate, and contribution — the original commission.

### §5.2 Clawback mechanism (general, not MIR-specific)
Recognize a clawback component structurally: reference-key field (`structuralType: reference_key`) + `applied_in_period: return_period` / `clawback_window_days` metadata. For each return-event row:
1. Extract the reference key (the link to the original transaction).
2. Retrieve the original transaction's stored trace (§5.1).
3. Apply the plan's declared reversal formula (typically `−recovery_rate × original_contribution`).
4. Store the clawback trace (linking the return transaction to the original, with the reversal computation).

Korean Test: the reference-key field is structural (identified by `structuralType`, not by name). The reversal formula comes from the plan's declared intent. No `Folio_Original` literal, no `Ventas_Enero` literal, no Plan-1-rate-table hardcoded.

### §5.3 Constructed second-instance (mandatory)
A synthetic retroactive adjustment with a **different reference-key field and a different reversal formula**, resolving through the same cross-period substrate. **HALT-GC:** if the second instance needs a new hardcoded key/source/formula → the mechanism is MIR-specific in disguise, stop and generalize. Retain the fixture.

### §5.4 SR-38 hand-computation (clawback)
For one MIR return-row entity: recover the original transaction's stored trace, show the original rate + inputs + contribution, apply `−recovery_rate × original_contribution`, and show the engine reproduces the negative. Paste both.

**EPG-3:** paste the cross-period retrieval + clawback diffs. Paste the MIR clawback trace showing: reference-key resolved → original trace retrieved → negative computed → carried to `total_payout`. The §5.3 second-instance proof. SR-38 hand-comp. Architect reconciles clawback value vs ground truth (SR-44).

---

## §6 — PHASE 4: Full Vertical-Slice Verification + PR

### §6.1 All 5 MIR plans
Recalculate all 5 MIR plans (January; clawback also the return period). For each, paste: per-entity total payout + per-transaction trace count + one sample per-transaction trace. Structural success: every plan produces per-transaction traces; the clawback computes negative in the return period; category-specific rates in Plan 1. Architect reconciles values (SR-44).

### §6.2 Regression
BCL/Meridian/CRP entity-level totals unchanged (per-transaction is additive). Per-transaction traces written for these tenants as well (not just MIR — SR-2).

### §6.3 Build + PR
`npm run build` exit-0; `localhost:3000` 200. Then:
```bash
gh pr create --base main --head [branch] \
  --title "OB-[TBD]: Per-transaction calculation & storage — audit substrate" \
  --body "<phase-by-phase evidence + SR-38 equivalence proofs + clawback trace + second-instance fixture>"
```
**DO NOT MERGE.**

---

## §7 — HALT Conditions
- **HALT-0:** engine structure differs materially from assumptions; per-row identity not available at the SEAM; `committed_data` rows not individually addressable.
- **HALT-SR38:** sum of per-row contributions ≠ entity-level result for any entity/component → per-transaction computation has a defect.
- **HALT-GC:** clawback second instance needs a new hardcoded key/source/formula → mechanism not general.
- **HALT-3 (SR-42):** any step requiring a column-name literal, developer threshold, or tenant special-case → surface and halt.
- **HALT-2:** entity-level regression on any proof tenant (BCL/Meridian/CRP totals shift).
- **HALT-CAT:** category-code fix cannot be applied cleanly (e.g., the plan's conditional structure doesn't support the correction without re-interpretation) → report for architect disposition.

---

## §8 — Out of Scope
- UI pages for commission statements, transaction drill-down, disputes (those consume the traces this OB stores; the UI is a separate build).
- Changes to `entity_period_outcomes` (the dashboard materialization layer — unchanged).
- Re-interpretation of plans (OB-214 territory, except the category-code fix which is a data-vocabulary correction, not a re-interpretation).
- Progressive Performance / caching for per-transaction computation (important for performance, separate OB).
- The convergence fix (OB-216 — already on main).

---

## §9 — Residuals / Feed-Forward
- The per-transaction traces become the data source for the commission-statement UI, the transaction-drill-down UI, and the structured-dispute mechanism — each a subsequent OB consuming this substrate.
- The cross-period retrieval generalizes beyond clawbacks: retroactive bonuses, corrections, adjustments all use the same `reference-key → prior-period trace → reversal` pattern.
- The category-code fix is a specific instance of the plan-interpretation grounding problem. OB-214 (Plan Interpretation Agent) addresses the class; this OB fixes the instance to unblock the keystone proof.
- `calculation_traces` population creates a storage-volume consideration — trace rows scale as (entities × components × transactions-per-entity × periods). Index strategy and retention policy are follow-ons.

---

*OB-[TBD] · Per-Transaction Calculation & Storage: The Audit Substrate · 2026-06-18 · vialuce.ai — Intelligence. Acceleration. Performance.*
