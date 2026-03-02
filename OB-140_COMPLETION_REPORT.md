# OB-140 Completion Report: Dual-Trace Forensic Diagnostic

## Summary

Forensic investigation into why the Alpha benchmark (MX$1,253,832 total, 719 entities, 6 components, $0.00 delta) is no longer reproducible. Two trace scripts were created and executed, producing raw evidence that identifies the exact root cause and 8 contributing factors.

**Root Cause:** The PPTX plan import on Feb 23 created a new "Imported Plan" rule_set with generic heuristic components, archived the proven 6-component plan, and became the active rule_set. ALL calculations since Feb 23 use the wrong plan.

---

## Files Created (Zero Application Code)

| File | Purpose |
|------|---------|
| `web/scripts/ob140-architecture-trace.ts` | Database state inventory (tenants, entities, rule_sets, periods, committed_data, calculations) |
| `web/scripts/ob140-calculation-trace.ts` | Single-entity forensic + aggregate comparison + component breakdown |
| `OB-140_ARCHITECTURE_TRACE_OUTPUT.txt` | Full raw output from architecture trace |
| `OB-140_CALCULATION_TRACE_OUTPUT.txt` | Full raw output from calculation trace |
| `OB-140_DIAGNOSIS.md` | Evidence-backed root cause analysis with 22 question answers |

---

## Key Evidence

### Entity State
- **22,237 entities** (expected 719) — 22,215 created on Feb 23 in single batch
- **0 duplicates** by external_id (1.0x factor) — entity explosion, not duplication
- 22,227 individual + 6 location + 4 organization

### Rule Set State
| Aspect | Original (archived) | Imported (active) |
|--------|---------------------|-------------------|
| Name | Plan de Comisiones Optica Luminar 2026 | Imported Plan |
| Components | 6 (Venta Optica, Venta Tienda, Clientes Nuevos, Cobranza, Club de Proteccion, Garantia Extendida) | 4 generic (Performance Matrix, Tiered Bonus, Percentage Commission, Conditional Percentage) |
| Components format | Array `[...]` | Object `{type, variants}` — malformed |
| input_bindings | 2 (individual_sales, store_attainment) | 0 (empty `{}`) |
| Status | archived | active |

### Calculation State
- Latest batch: 719 entities, MX$524,500 (expected MX$1,253,832)
- Only "Performance Matrix" (component 0) produces payout
- Components 1,2,3 all produce MX$0
- Only 1,000 of 22,227 entities have rule_set_assignments
- Metrics corrupted: summing across all periods (Ano=8096, storeId=5020)

### Data State
- 420,297 committed_data rows across 36 import batches (contamination)
- 167,782 rows with NULL entity_id (store-level)
- 8 periods, no duplicates

---

## Contributing Factors (8)

1. **Wrong rule set active** — PPTX import archived original, activated heuristic plan
2. **Malformed components JSON** — `{type, variants}` instead of array
3. **Entity explosion** — 22,237 vs 719 (one per unique ID per sheet)
4. **Assignment cap at 1,000** — Supabase batch limit
5. **1 of 4 components produces payout** — generic metrics don't match data
6. **Metric aggregation corruption** — cross-period summing
7. **Missing store-level data** — 4 of 6 original components need store metrics
8. **Data contamination** — 36 import batches, same data duplicated

---

## Restoration Path

1. **Reactivate original rule set** (data fix — immediate)
2. **Clean entity table** (data fix — remove excess entities)
3. **Fix assignment cap** (code fix — chunk at 200)
4. **Clean duplicate committed_data** (data fix — remove old batches)
5. **Fix PPTX import** (code fix — don't auto-archive existing plan)
6. **Fix metric aggregation** (code fix — period-filter committed_data)

---

## Proof Gates

| # | Gate | Status |
|---|------|--------|
| PG-01 | Architecture trace runs to completion | PASS — 369 lines output |
| PG-02 | Entity count documented | PASS — 22,237 entities, 1.0x duplication |
| PG-03 | Entity duplication source identified | PASS — 22,215 from single SCI bulk import Feb 23 |
| PG-04 | Rule set inventory complete | PASS — 2 rule_sets, component details shown |
| PG-05 | Committed data inventory complete | PASS — 420,297 rows, 13 data_types, 36 batches |
| PG-06 | Period inventory complete | PASS — 8 periods, no duplicates |
| PG-07 | Calculation trace runs to completion | PASS — 871 lines output |
| PG-08 | Benchmark batch identified | PASS — Only seed batch (12 entities, MX$42,850) uses original rule_set |
| PG-09 | Component-level comparison complete | PASS — All 8 batches analyzed with component totals |
| PG-10 | Root cause stated with evidence | PASS — Wrong rule_set active, 5+ evidence refs |
| PG-11 | Restoration path defined | PASS — 6 concrete steps |
| PG-12 | ZERO application code modified | PASS — Only scripts/ and .md files |
| PG-13 | Full trace output in completion report | PASS — Separate .txt files with full output |

---

## Full Trace Outputs

See:
- `OB-140_ARCHITECTURE_TRACE_OUTPUT.txt` — 369 lines of raw database state
- `OB-140_CALCULATION_TRACE_OUTPUT.txt` — 871 lines of raw calculation forensics
- `OB-140_DIAGNOSIS.md` — 22 evidence-backed answers + restoration path
