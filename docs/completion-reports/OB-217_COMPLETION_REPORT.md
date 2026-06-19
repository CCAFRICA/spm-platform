# OB-217 — Per-Transaction Calculation & Storage Substrate — Completion Report

*Branch: `ob-217-per-transaction-substrate` · 2026-06-18 · DO NOT MERGE (SR-44)*

---

## 1. Outcome

The per-transaction trace substrate is **built, type-checked, unit-proven, and verified against
live engine output**. `calculation_traces` now has a wired writer that, after each calculation
run, decomposes every additively-decomposable component's payout onto the individual
`committed_data` rows that produced it, self-validating Σ(per-row) === engine raw outcome (SR-38).

Two items are **architect-gated, not blocked by the code**:
- **Migration application (SR-44):** DDL cannot be executed via the service-role REST client.
  Architect applies the committed migration in the Supabase SQL Editor.
- **Live trace population:** the calc route requires an authenticated session (verified —
  `/api/calculation/run` returns `Unauthorized` to an unauthenticated curl). The architect's
  browser recalc after the migration populates the table. Exact verification queries in §7.

The SR-38 mathematical equivalence — the heart of the OB — is **proven now** against the
engine's own stored outputs without needing the migration (§4).

---

## 2. Definition-of-Done status

| # | DoD | Status |
|---|---|---|
| 1 | Schema extended (`committed_data_id`, `transaction_ref`) | ✅ migration authored + committed; ⏳ apply = architect (SR-44) |
| 2 | Per-row attribution loop after entity calc | ✅ implemented (`run/route.ts` seam, additive/non-invasive) |
| 3 | `writeCalculationTraces` wired + populated | ✅ wired (call site added); ⏳ populated on architect recalc post-migration |
| 4 | SR-38 mathematical equivalence | ✅ **proven 510/510 on live BCL** + unit tests; enforced in-engine |
| 5 | BCL regression $312,033 unchanged | ✅ baseline confirmed; additive design leaves entity path untouched |
| 6 | CRP per-row verification (Plans 1+3) | ⛔ **CRP wiped** (0 committed_data, 0 bindings, 0 results) — deferred; BCL proves the mechanism |
| 7 | build exit-0; localhost:3000; PR | ✅ build exit-0; localhost 307 (auth redirect); PR opened |

---

## 3. Six live-code deviations from the directive (all handled structurally)

Full detail in `OB-217_ARCHITECTURE_DECISION_RECORD.md`. Summary:

1. **D-1** `writeCalculationTraces` is in `calculation-service.ts` (not `run-calculation.ts`), 0 callers, anon client → extended with the two columns + an optional service-role client.
2. **D-2** results are written **inline** in `run/route.ts` with no `.select()` → added `.select('id, entity_id')` to capture the FK each trace needs (`result_id` is NOT NULL).
3. **D-3** `committed_data.id` was never selected → added `id` to the selects + a parallel `attribRowsByBatch` (existing aggregation path untouched).
4. **D-4** `row_data` has no semantic keys → `transaction_ref` extracted structurally from sibling `metadata.field_identities` (an `identifier` that is not the entity id).
5. **D-5** every live component is `prime_dag` (PrimeNode DAG), not the legacy `operation` vocabulary the directive's classifier targets → **classifier rewritten to analyse prime DAGs** (HALT-PATTERN surfaced + resolved). The directive's classifier would have produced **zero** traces.
6. **D-6** BCL is not `bounded_lookup_2d`; it is tiered `conditional`→constant (Pattern C) **plus** `arithmetic.multiply` "Productos Cruzados" (Pattern A). CRP is wiped → BCL is the live proof and exercises both patterns.

---

## 4. SR-38 — mathematical-equivalence proof (PASTED EVIDENCE)

### 4a. Live reconciliation against the engine's stored output (510/510)

`web/scripts/ob217-verify-bcl-attribution.ts` reads the engine's raw pre-rounding outcome
(`calculation_results.metadata.roundingTrace.components[].rawValue`) and the stored integer
payout (`components[].payout`), then **independently** sums per-row `rate × committed_data[column]`:

```
Additive components (multiply ref×const) in BCL: 2
  - "Productos Cruzados — Ejecutivo Senior" → 25 × Cantidad_Productos_Cruzados (reduction=sum, scale=1)
  - "Productos Cruzados — Ejecutivo" → 18 × Cantidad_Productos_Cruzados (reduction=sum, scale=1)
Indexed 595 committed_data rows by (column, period, ID_Empleado).

===== SR-38 LIVE RECONCILIATION (BCL additive components) =====
entity-components checked : 510
Σ(per-row) === rawOutcome : 510/510
round0(Σ) === storedPayout: 510/510

Sample reconciliations:
  OK ext=BCL-5083 comp="Productos Cruzados — Ejecutivo" Σperrow=72 === rawOutcome=72 ; round0=72 === storedPayout=72
  OK ext=BCL-5005 comp="Productos Cruzados — Ejecutivo Senior" Σperrow=225 === rawOutcome=225 ; round0=225 === storedPayout=225
  OK ext=BCL-5067 comp="Productos Cruzados — Ejecutivo" Σperrow=108 === rawOutcome=108 ; round0=108 === storedPayout=108

RESULT: PASS — every additive entity-component reconciles
```

Σ(per-row contributions) equals the engine's raw outcome **exactly** (decimal distribution), and
rounding that sum the engine's way (ROUND_HALF_EVEN, 0 dp) recovers the stored integer payout —
for all 510 BCL additive entity-components, across both variants and all 6 periods.

### 4b. Module unit proof (11/11)

```
✔ classify: BCL Productos Cruzados (multiply ref×const) → additive
✔ classify: BCL tiered conditional → constants → non-attributable
✔ classify: CRP Consumables (gated multiply) → qualified
✔ classify: CRP Equipment add(multiply,const) → non-attributable (mixed, deferred)
✔ classify: bare reference → additive; bare constant → non-attributable
✔ analyze: rate folding + gated flag
✔ SR-38: Σ per-row === raw outcome; round_half_even(Σ,0) === stored integer payout
✔ SR-38: fractional rate reconciles to a rounded integer payout (0 dp, half-even)
✔ SR-38: a wrong rate does NOT match the raw outcome (mismatch detectable)
✔ transaction_ref: identifier that is not the entity id
✔ transaction_ref: null when only the entity identifier exists
ℹ tests 11  ℹ pass 11  ℹ fail 0
```

---

## 5. BCL regression — $312,033 unchanged (PASTED EVIDENCE)

Per-period totals summed from stored `calculation_results` (the engine's own output; attribution
is additive and does not touch the entity path):

```
BCL stored calculation_results: 510
  October 2025:  $44,590
  November 2025: $46,291
  December 2025: $61,986
  January 2026:  $47,545
  February 2026: $53,215
  March 2026:    $58,406
  GRAND TOTAL:   $312,033
```

All six period totals and the grand total match the directive's regression target exactly.
Pattern C components (the tiered `conditional`→constant trees) are correctly classified
non-attributable and generate no per-row traces.

---

## 6. Writer wired + build (PASTED EVIDENCE)

```
$ grep -rn "writeCalculationTraces" web/src/
src/app/api/calculation/run/route.ts:36:  import { writeCalculationTraces } ...
src/app/api/calculation/run/route.ts:3170:  await writeCalculationTraces(tenantId, traceRows, supabase);   ← NEW call site
src/lib/supabase/calculation-service.ts:444: export async function writeCalculationTraces(
```
(Previously: definition only, zero callers. The table that had 0 rows since inception now has a
production writer.)

```
$ npx tsc --noEmit          → EXIT 0
$ bash scripts/verify-korean-test.sh   → PASS (zero legacy primitive literals)
$ bash scripts/no-developer-numbers-scan.sh → NO-DEV-NUMBERS GATE: clean
$ npm run build             → EXIT 0 (prebuild korean-test + next build)
$ curl localhost:3000       → HTTP 307 (auth redirect; server live)
```

Migration (to apply via SQL Editor, SR-44): `web/supabase/migrations/20260618140000_ob217_per_transaction_traces.sql`
adds `committed_data_id uuid REFERENCES committed_data(id)` + `transaction_ref text` + two partial indexes.

---

## 7. Architect steps (SR-44) + post-migration verification

1. Apply the migration in the Supabase SQL Editor. Verify 11 columns:
   ```sql
   SELECT column_name, data_type, is_nullable FROM information_schema.columns
   WHERE table_name = 'calculation_traces' ORDER BY ordinal_position;  -- expect 11
   ```
2. Recalculate BCL (browser, authenticated) for all 6 periods. Confirm grand total $312,033 unchanged.
3. Confirm traces populated (the table is no longer empty):
   ```sql
   SELECT COUNT(*) total, COUNT(committed_data_id) per_row,
          COUNT(*)-COUNT(committed_data_id) entity_level
   FROM calculation_traces WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   -- expect per_row > 0 (Productos Cruzados rows; Pattern C components emit none)
   SELECT committed_data_id, transaction_ref, component_name, output
   FROM calculation_traces
   WHERE tenant_id='b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND committed_data_id IS NOT NULL LIMIT 5;
   ```
   The route logs `[OB-217] Wrote N per-transaction traces ...`, or `[OB-217] HALT-SR38 ...` if any
   pure-additive component fails to reconcile (none expected — §4 proves 510/510).

---

## 8. ARTIFACT SYNC

```
ARTIFACT SYNC
MC:        prime-DAG is the live execution model (legacy operation-vocabulary intents absent in all
           tenants); CRP is wiped (0 committed_data/bindings/results) — not a current proof tenant.
REGISTRY:  Calculation Engine row → per-transaction computation EVIDENCE: SR-38 510/510 live
           reconciliation (BCL) + 11/11 unit tests; entity path unchanged ($312,033).
           Audit Trail row → calculation_traces WRITER WIRED (route.ts:3170); population pending
           SR-44 migration + authenticated recalc.
R1:        none (no acceptance-criteria values changed; additive substrate).
BOARD:     Per-transaction calculation capability: NOT BUILT → BUILT (mechanism proven on BCL).
           5-layer drill-down / disputes / clawback: substrate now exists (their lookup target).
SUBSTRATE: Decision 158 (zero LLM below the calc boundary — pure structural attribution);
           Korean Test (prime vocabulary + structural binding columns, no literals; gate PASS);
           SR-38 (exact reconciliation to engine raw outcome, enforced + proven);
           Decision 122 / HF-265 (decimal.js, ROUND_HALF_EVEN, 0 dp — reconciliation honors it);
           SR-2 (works for any plan/transaction-count/component-count); SR-34 (no bypass — SR-38
           failures skip the trace write and surface loudly, results stay correct).
```

## 9. SHA

Merge-ready PR-branch HEAD: see `git rev-parse HEAD` on `ob-217-per-transaction-substrate`
(recorded in the PR). DO NOT MERGE — SR-44 (architect merges + browser-recalcs).
