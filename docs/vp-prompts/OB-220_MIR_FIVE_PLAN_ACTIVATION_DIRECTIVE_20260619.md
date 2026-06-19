# OB-220: MIR Five-Plan Activation — Platform Capability Gaps

**Sequence:** OB-220 — architect-assigned 2026-06-19. Collision check mandatory.
**Repo:** `CCAFRICA/spm-platform` · **Branch:** `ob-220-mir-five-plan-activation` from `main`
**Type:** BUILD (engine fix + convergence evolution + plan corrections, one PR)
**Effort:** ULTRATHINK / ULTRACODE
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

**Prerequisites (merged to `main`):** OB-217 (#549), OB-218 (#550). OB-219 (#551) should be merged but is not blocking.
**MIR tenant:** `972c8eb0-e3ae-4e4c-ad30-8b34804c893a` — freshly imported, 5 plans interpreted, Plan 3 calculating (161,371 PEN January). Plans 1, 2, 4, 5 blocked by the five issues below.

**CC instance:** FRESH.

---

## §0 — CC STANDING RULES HEADER

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Commit + push after every phase. Kill dev → `rm -rf .next` → `npm run build` (exit-0) → `npm run dev` → confirm `localhost:3000`. Git from repo root. Final: `gh pr create`. **DO NOT merge** (SR-44).

**First action:** write this directive to `docs/vp-prompts/OB-220_MIR_FIVE_PLAN_ACTIVATION_DIRECTIVE_20260619.md` and commit.

### §0.1 Codebase context (from OB-217/218 ADRs — verified)

| Fact | Value |
|---|---|
| Component model | `componentType: 'prime_dag'`; PrimeNode DAG (`prime: conditional\|arithmetic\|compare\|reference\|constant`). Legacy operation vocabulary DEAD. |
| Prime DAG evaluator | Recursive walker — the `e3` function visible in the stack trace. Located via `grep -rn 'Decimal\|decimal' web/src/app/api/calculation/run/route.ts \| grep -i 'compare\|condition'` or by tracing the stack trace `e3 → eW → new o (Decimal)`. |
| Convergence binding | `convergence-service.ts` — OB-216 §2-S4 LLM binding proposals. The LLM receives available columns + plan field requirements, proposes column mappings. Stored in `rule_sets.input_bindings.convergence_bindings`. |
| resolveColumnFromBatch | `route.ts` (~L1648 pre-OB-217) — reads `committed_data` rows for an entity + column, returns aggregated value (sum/snapshot). The binding tells it which column to read. |
| Math library | `decimal.js` with ROUND_HALF_EVEN, precision 20. |
| Tenant data | MIR: Ventas (6 months × ~4500 rows, cols: Folio, Fecha, DNI_Vendedor, Categoria, Monto_Total, etc.), Cobranza (6 months × ~7500 rows, cols: Folio_Cobro, Monto_Cobrado, Saldo_Pendiente), Clientes_Nuevos (521 rows, cols: Codigo_Cliente_Nuevo, Verificado, Pedidos_Primeros_60_Dias), Cuotas (30 rows, wide-format: DNI, Enero_2025..Junio_2025), Nómina (34 rows, entity sheet). |

### §0.2 The five issues (all platform-level, not tenant-specific)

| # | Issue | Layer | What crashes / fails | Plans blocked |
|---|---|---|---|---|
| 1 | Compare node routes string operands through decimal.js | Engine | `[DecimalError] Invalid argument: ALI` | Any plan with categorical conditional (Plan 1 + all future) |
| 2 | Plan comparison values don't match data vocabulary | Plan interpretation | Condition `field == "ALI"` never matches data value `"Alimentos"` | Plan 1 |
| 3 | Wide-format temporal columns can't bind to a single metric | Convergence | LLM abstains: "wide-format month-specific columns" | Plan 2 |
| 4 | Count-based bonus expressed as column reference instead of row-count operation | Plan interpretation | Convergence rejects identifier column for categorical slot | Plan 4 |
| 5 | Clawback references computed values (original rate, accelerator) as data columns | Plan interpretation | LLM abstains: "no commission rate column exists" — correct, because these are outputs of Plan 1, not data | Plan 5 |

---

## §1 — PROBLEM STATEMENT

Five platform capability gaps block four of MIR's five plans. Plan 3 (Cobranza) calculates correctly (161,371 PEN, January). The gaps span three layers: one engine defect (the prime DAG compare node crashes on strings), three plan interpretation issues (vocabulary mismatch, wrong operation for count bonus, computed values expressed as data columns), and one convergence limitation (wide-format temporal data). All five are general — they affect any tenant with the same data patterns, not just MIR.

### §1.1 Definition of done

1. **Engine:** Compare node handles string operands without decimal.js crash. Unit-tested with string equality, string inequality, mixed string/numeric (should reject or handle gracefully).
2. **Plan 1:** Calculates with correct category-specific rates. Per-transaction traces show distinct rates for different categories. No crash.
3. **Plan 2:** Calculates with period-matched quota values from the wide-format Cuotas sheet.
4. **Plan 4:** Calculates with a count of verified new clients × bonus amount.
5. **Plan 5:** Carries `temporal_adjustment` modifier. Binding phase does NOT abort on missing rate/accelerator columns (those fields removed or made optional). Clawback engine path activatable when prior-period traces exist.
6. **MIR January:** All 5 plans produce calculation_results with non-zero totals (except Plan 5 which may produce 0 if no returns exist in January — that's correct).
7. **BCL regression:** $312,033 unchanged.
8. `npm run build` exit-0; PR opened (not merged).

---

## §2 — SUBSTRATE DISCIPLINES

**Korean Test:** The engine string comparison fix is type-detection, not value-detection. The convergence temporal binding is structural pattern recognition, not column-name matching. Plan corrections use data values discovered from the live database, not hardcoded in engine code.

**Decision 158:** Engine fix is below the boundary. Plan corrections are above it (plan interpretation layer). Convergence extension is the binding layer (above).

**SR-38:** After the engine fix, per-transaction trace sums must still equal entity-level totals for all plans.

**SR-34:** No silent bypass. If the temporal binding can't resolve a period, produce a structured error. If the compare node receives unexpected types, produce a structured error (not crash, not silent $0).

---

## §3 — PHASE 1: Engine String Comparison Fix

This is the highest-priority fix — it's a hard crash that blocks any categorical conditional for any tenant.

### §3.1 Locate the compare node

The stack trace from the production crash:
```
Error: [DecimalError] Invalid argument: ALI
  at e3 → e3 → e3 → e3 (recursive prime DAG walk)
```

Find the compare/conditional evaluation in the prime DAG walker:
```bash
grep -rn 'new Decimal\|Decimal(' web/src/app/api/calculation/run/route.ts | head -30
grep -rn 'compare\|===\|!==\|condition' web/src/app/api/calculation/run/route.ts | head -30
```

The crash happens when the `conditional` node evaluates its condition. The condition's `compare` sub-node receives a `reference` value (the entity's `Categoria` field value, e.g., `"Alimentos"`) and a `constant` value (the plan's comparison literal, e.g., `"ALI"`). Both are passed to `new Decimal(value)` which throws on non-numeric strings.

### §3.2 Fix the compare evaluation

In the compare/conditional evaluation path, add type detection before decimal construction:

```typescript
// BEFORE (crashes on strings):
const left = new Decimal(leftValue);
const right = new Decimal(rightValue);
// compare left vs right with the operator

// AFTER (type-aware):
const leftIsNumeric = typeof leftValue === 'number' ||
  (typeof leftValue === 'string' && leftValue.trim() !== '' && !isNaN(Number(leftValue)));
const rightIsNumeric = typeof rightValue === 'number' ||
  (typeof rightValue === 'string' && rightValue.trim() !== '' && !isNaN(Number(rightValue)));

if (leftIsNumeric && rightIsNumeric) {
  // Numeric comparison via decimal.js (existing path)
  const left = new Decimal(String(leftValue));
  const right = new Decimal(String(rightValue));
  // ... existing comparison logic ...
} else {
  // String comparison — equality/inequality only
  const leftStr = String(leftValue);
  const rightStr = String(rightValue);
  switch (operator) {
    case '==': case 'eq': return leftStr === rightStr;
    case '!=': case 'ne': return leftStr !== rightStr;
    default:
      // Ordering operators (<, >, <=, >=) on strings are not meaningful
      // in compensation logic — produce structured warning + return false
      console.warn(`[PrimeDAG] String comparison with ordering operator "${operator}": left=${leftStr}, right=${rightStr} — returning false`);
      return false;
  }
}
```

The exact variable names and operator representations depend on the live code. CC reads the function and adapts.

### §3.3 Unit tests

Add tests for the compare node:
- String equality: `"Alimentos" == "Alimentos"` → true
- String inequality: `"Alimentos" == "Bebidas"` → false
- Mixed: `"Alimentos" == 42` → false (string vs number)
- Numeric (existing path preserved): `100 > 80` → true
- Numeric decimal: `new Decimal("0.7") > new Decimal("0.5")` → true

### §3.4 Verify no BCL regression

The fix must NOT change behavior for numeric comparisons. BCL's conditional components all use numeric operands — they must still work identically. Run BCL calculation after the fix:
```bash
# Localhost or via the OB-217 verification script
cd web && set -a && source .env.local && set +a && npx tsx scripts/ob217-verify-bcl-attribution.ts
```
Confirm: 510/510 SR-38 reconciliation, $312,033 unchanged.

Commit: `"OB-220 Phase 1: prime DAG compare handles string operands"`

### §3.5 EPG-1

Paste: (a) the compare function before/after diff. (b) unit test results. (c) BCL 510/510 + $312,033. (d) `npm run build` exit-0.

**HALT-REG:** BCL regression → stop.

---

## §4 — PHASE 2: Plan Interpretation Corrections (SQL) + Convergence Temporal Binding

This phase has two parts: SQL corrections for Plans 1/4/5 (one architect gate) and a code change for the convergence layer (Plan 2 temporal binding).

### §4.1 Read all MIR plans

```sql
SELECT id, name, status,
  jsonb_pretty(components) AS components,
  jsonb_pretty(input_bindings) AS bindings
FROM rule_sets
WHERE tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
  AND status = 'active'
ORDER BY name;
```

Paste the full output. Then for each blocked plan, identify the specific JSONB structure that needs correction.

### §4.2 Correction A — Plan 1 category comparison values

In Plan 1's component prime DAG, find the `conditional` → `compare` nodes that test the `Categoria` field. The comparison values will be abbreviated codes (like `"ALI"`, `"BEB"`, `"LIM"`). Replace with the actual data vocabulary:

Query the actual vocabulary:
```sql
SELECT DISTINCT row_data->>'Categoria' AS cat, COUNT(*) AS cnt
FROM committed_data
WHERE tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
  AND row_data->>'Categoria' IS NOT NULL
GROUP BY cat ORDER BY cnt DESC;
```

Author the `jsonb_set` update that replaces each code with the correct full name. The exact JSONB path depends on the prime DAG structure CC discovers in §4.1.

### §4.3 Correction B — Plan 4 operation restructure

Read Plan 4's component ("Bono por cliente nuevo verificado"). The current prime DAG references `Codigo_Cliente_Nuevo` as a metric input needing categorical data. The convergence layer can't bind it because it's an identifier.

The plan should express: "for each entity, count the rows from the Clientes_Nuevos data where the verification condition is met, multiplied by the bonus amount." CC reads the plan PDF interpretation to understand the exact bonus formula (e.g., "S/. 50 per verified new client"), then restructures the prime DAG to:

1. Reference a column that IS bindable (e.g., `Pedidos_Primeros_60_Dias` which is a measure, or `Verificado` which is an attribute).
2. Express the count as a structural operation on the data rows, not as a lookup of a single column value.

If the prime DAG vocabulary supports `aggregate.count` or `aggregate.distinct_count` with a filter, use that. If not, identify the closest expressible operation and note the limitation.

Author the `jsonb_set` update for Plan 4's component.

### §4.4 Correction C — Plan 5 temporal_adjustment modifier

Read Plan 5's component ("Ajuste por Devoluciones (Clawback)"). The current prime DAG references `Monto_Original`, `Tasa_Comision_Original`, and `Multiplicador_Acelerador_Original`. Only `Monto_Original` can bind (to `Monto_Total`). The other two are outputs of Plan 1's calculation — they don't exist in any data file.

Replace: remove `Tasa_Comision_Original` and `Multiplicador_Acelerador_Original` from the prime DAG's required inputs. Add a `temporal_adjustment` modifier to the component (or the component's metadata):

```json
{
  "modifier": "temporal_adjustment",
  "adjustmentType": "per_transaction_reversal",
  "referenceMapping": {
    "returnField": "<reference key column in Ventas return rows — from §4.1>",
    "originalField": "<matching column in original Ventas rows — from §4.1>",
    "originalDataType": "transaction"
  },
  "recoveryRate": 1.0,
  "lookbackPeriods": 6,
  "metadata": {
    "description": "Full reversal of original transaction commission via stored trace lookup"
  }
}
```

The return rows live in the Ventas sheets (rows with a reference key populated and negative amount — CC confirmed this from the Ventas_Marzo import logs showing `Folio_Original` and `Motivo_Devolucion` columns). Use the actual column names discovered in §4.1.

Also simplify the prime DAG to reference only `Monto_Original` (or remove the DAG entirely and let the `temporal_adjustment` modifier drive the computation via `retrieveOriginalTrace`). The engine's Pattern D handler (OB-218) reads the modifier and bypasses the prime DAG formula.

Author the SQL update.

### §4.5 Convergence temporal binding — Plan 2

Read the convergence binding pipeline in `convergence-service.ts`. Locate the LLM binding step (grep for `OB-216 §2-S4`). The current behavior:

1. LLM receives: plan needs `cuota_mensual_asignada`; available columns include `Enero_2025`, `Febrero_2025`, `Marzo_2025`, `Abril_2025`, `Mayo_2025`, `Junio_2025`.
2. LLM responds: ABSTAIN — "wide-format month-specific columns; a pivot or explicit month selection would be required."
3. Convergence records a gap. Calc aborts.

**The fix — period-aware temporal column binding:**

After the LLM binding step, if a field has an ABSTAIN result AND the available columns contain a temporal pattern (multiple columns whose names match month/period patterns with the same data type), produce a temporal binding map instead of a gap:

```typescript
// Detect temporal column pattern
interface TemporalBinding {
  type: 'temporal_map';
  columnMap: Record<string, string>; // periodKey → columnName
  reduction: string; // sum, snapshot, etc.
}

// Example output for MIR Cuotas:
// {
//   type: 'temporal_map',
//   columnMap: {
//     '2025-01': 'Enero_2025',
//     '2025-02': 'Febrero_2025',
//     '2025-03': 'Marzo_2025',
//     '2025-04': 'Abril_2025',
//     '2025-05': 'Mayo_2025',
//     '2025-06': 'Junio_2025'
//   },
//   reduction: 'snapshot'
// }
```

**Detection logic** (structural, Korean Test compliant — no hardcoded month names):

1. Scan columns that the LLM abstained on binding.
2. For each abstained field, check if multiple columns in the same sheet share the same data type (measure) and have names matching a temporal pattern.
3. Temporal pattern detection: columns whose names contain year identifiers (4-digit numbers like 2025) and/or sequential labels. Use the header comprehension's `structuralType` if available, or parse column names for temporal indicators.
4. If detected: build the `columnMap` by mapping each column's temporal label to a period key.

**Resolution at calc time:**

In `resolveColumnFromBatch` (or `resolveMetricsFromConvergenceBindings`), when the binding has `type: 'temporal_map'`:

1. Read the current calculation period's key (start_date, canonical_key, or label).
2. Look up the matching column from `columnMap`.
3. Resolve that column's value for the entity (same as existing `resolveColumnFromBatch` logic but with the dynamically selected column name).
4. If no matching period key → structured error (SR-34).

The temporal map is stored in the binding JSONB alongside standard bindings. Non-temporal bindings are unaffected.

### §4.6 Author all SQL corrections in one migration file

Create `web/supabase/migrations/<timestamp>_ob220_mir_plan_corrections.sql` containing Corrections A, B, C from §4.2–§4.4.

**ARCHITECT GATE:** Present the completed migration file. State: "ARCHITECT GATE: paste the following SQL into Supabase SQL Editor for MIR tenant." Wait for confirmation.

After confirmation, verify each plan's updated structure.

Commit: `"OB-220 Phase 2: plan corrections + convergence temporal binding"`

### §4.7 EPG-2

Paste: (a) §4.1 full plan output. (b) category vocabulary query. (c) migration file diff. (d) post-fix plan verification queries. (e) convergence temporal binding code diff. (f) `npm run build` exit-0.

**HALT-STRUCTURE:** If any plan's prime DAG structure can't be corrected without introducing per-tenant logic → stop and report. The correction must be structural (a JSONB path update), not a code branch.

---

## §5 — PHASE 3: MIR Five-Plan Verification + Regression + PR

### §5.1 Calculate all 5 MIR plans for January

Run each plan for the January period via the Calculate page or API. For each plan, paste:
1. Plan name + grand total.
2. Entity count calculated.
3. Per-transaction trace count: `SELECT COUNT(*) FROM calculation_traces WHERE tenant_id = '972c8eb0...' AND committed_data_id IS NOT NULL AND result_id IN (SELECT id FROM calculation_results WHERE rule_set_id = '<plan_id>')`.
4. One sample trace showing `component_name`, `output` (contribution, rate, pattern).
5. Any errors or warnings.

**Expected outcomes:**
- Plan 1 (Ventas commission): non-zero total, traces show ≥2 distinct rates for different categories.
- Plan 2 (Monthly quota bonus): non-zero total for entities meeting quota (binding resolved to `Enero_2025` column for January).
- Plan 3 (Cobranza incentive): ~161,371 PEN (already calculated — should be stable or recalculated to match).
- Plan 4 (New client bonus): non-zero total reflecting count of verified new clients × bonus amount.
- Plan 5 (Clawback): 0 for January (returns are in March data — no Ventas_Enero rows have `Folio_Original`). Binding should NOT abort. Calc should complete with $0 total (no return-event rows in scope).

**Architect reconciles against `MIR_Resultados_Esperados.xlsx` (SR-44). CC reports calculated values only.**

### §5.2 BCL regression

```bash
cd web && set -a && source .env.local && set +a && npx tsx scripts/ob217-verify-bcl-attribution.ts
```
Confirm: 510/510 SR-38, $312,033.

**HALT-REG:** BCL regression → stop.

### §5.3 PR

```bash
gh pr create --base main --head ob-220-mir-five-plan-activation \
  --title "OB-220: MIR five-plan activation — string compare + temporal binding + plan corrections" \
  --body "Engine: prime DAG compare node handles string operands (categorical conditionals no longer crash).
Convergence: temporal column binding for wide-format period data (Cuotas sheet).
Plan 1: category vocabulary aligned to actual data values.
Plan 4: component restructured for count-based bonus.
Plan 5: temporal_adjustment modifier added; unresolvable computed-value fields removed.
MIR: all 5 plans calculate for January.
BCL: \$312,033 unchanged, 510/510 SR-38."
```

**DO NOT MERGE** (SR-44).

---

## §5A — REPORTING DISCIPLINE

Completion report at `docs/completion-reports/OB-220_COMPLETION_REPORT.md`.

1. **Pasted evidence:** compare node diff + unit tests, convergence temporal binding diff, all 5 MIR plan results with sample traces, BCL regression, migration SQL.
2. **SHA:** merge-ready commit.
3. **ARTIFACT SYNC:**
   ```
   ARTIFACT SYNC
   MC: [String comparison: ENGINE DEFECT → FIXED; Temporal binding: CONVERGENCE GAP → FIXED;
        Plan vocabulary mismatch: INSTANCE FIX (class → OB-214);
        Count-based bonus: INSTANCE FIX (class → OB-214);
        Clawback interpretation: INSTANCE FIX + temporal_adjustment modifier added]
   REGISTRY: [Calculation Engine → categorical conditional evidence; Convergence → temporal binding]
   BOARD: [MIR: 1/5 plans calculating → 5/5 plans calculating]
   SUBSTRATE: [Korean Test (string compare is type-detection; temporal binding is pattern detection),
               Decision 158 (engine fix below boundary), SR-38 (BCL 510/510 preserved)]
   ```

---

## §6 — OUT OF SCOPE

- OB-214 (Plan Interpretation Agent) — structural class fixes for vocabulary grounding, count-based patterns, and clawback recognition. This OB applies instance corrections.
- MIR multi-period calculation (calculating February through June after January traces exist). Follow-on.
- MIR clawback live proof (calculating March to exercise Plan 5 returns against January traces). Follow-on after multi-period.
- Meridian regression — no MIR changes affect Meridian. Meridian verified in OB-218 ($556,985).
- Commission statement visual verification — OB-219 renders traces; visual walkthrough is architect browser step.

---

## §6A — RESIDUALS

1. **Multi-period calculation sequence:** After this OB merges, calculate January → February → March → April → May → June in order. Each period's traces must exist before the next period is calculated (temporal sequencing for clawback). March should produce Plan 5 clawback traces (5 return rows with `Folio_Original`).

2. **Temporal binding generality:** The wide-format temporal column detection should be verified with a second tenant's quota/target data to confirm it's truly structural. MIR's Cuotas sheet is the first instance.

3. **Plan 4 count operation:** The prime DAG vocabulary may not natively support `aggregate.count` with filters. If CC restructures Plan 4 as `sum(Pedidos_Primeros_60_Dias > 0 ? 1 : 0) × bonus` or similar, note the workaround and flag it as a primitive the DAG vocabulary should support natively.

4. **Three plan interpretation classes for OB-214:** (a) vocabulary grounding against actual data, (b) count-of-qualified-entities pattern, (c) clawback/reversal recognition producing temporal_adjustment modifier.

---

*OB-220 · MIR Five-Plan Activation · 2026-06-19*
*Platform capability gaps: engine string compare + convergence temporal binding + 3 plan corrections*
*Architect gates: ONE (§4.6 SQL paste). All other phases autonomous.*
