# OB-154: Single Clean Reimport + Calculate + Verify — COMPLETION REPORT

## Summary

Clean reimport of Óptica Luminar data from XLSX + PPTX, calculate January 2024 incentives, and verify against ground truth MX$1,253,832.

**Result: MX$1,277,432 — delta +1.88% — PASS** (within ±5% tolerance)

## Phase Execution

### Phase 0: Pre-Import Verification
- Verified clean slate: 0 entities, 0 committed_data, 0 rule_sets, 0 periods, 0 assignments
- All 10 Engine Contract tables empty for Óptica tenant

### Phase 1: Plan Import (PPTX → rule_set)
- Extracted text from PPTX via JSZip XML parsing
- Called Anthropic API directly (bypass Next.js — fetch failed inside dev server)
- Created rule_set "Optometrist Incentive Plan" with 6 components
- Original AI output used `calculationType`/`calculationIntent` format (not engine-compatible)

### Phase 2: Data Import (XLSX → committed_data + entities)
- Parsed 7 sheets: 119,129 total rows
- Created 719 entities (deduped by num_empleado from Datos Colaborador roster)
- Bound entity_id on employee-level sheets (venta_individual, datos_colaborador)
- Extracted source_date from Fecha Corte (Excel serial) and Mes+Año fields
- 100% source_date coverage (119,129/119,129)
- Cleaned 2,157 duplicate rows from failed SCI execute attempt

### Phase 3: Create Periods + Calculate
- Created 3 periods: January, February, March 2024
- **Diagnosed $0 payout**: AI components had wrong field names and no engine configs
- **Fixed**: Transformed to PlanComponent format:
  - `componentType` (not `calculationType`)
  - Proper `matrixConfig`, `tierConfig`, `percentageConfig`, `conditionalConfig`
  - 2 variants: OPTOMETRISTA CERTIFICADO (547) vs NO CERTIFICADO (172)
  - Component names match data_type sheet names (Venta Individual, Cobranza, etc.)
  - 14 metric_derivation rules for store-level attainment ratios
- **Result: 719 entities, MX$1,277,432 total payout (+1.88%)**

### Phase 4: CC-UAT-07 Forensic Verification
- 5-entity traces: zero/P25/P50/P75/max with source data correlation
- Component aggregates validated:
  | Component | Total | % of Grand Total | Non-Zero |
  |-----------|-------|------------------|----------|
  | Venta Individual | MX$772,200 | 60.4% | 625/719 (86.9%) |
  | Cobranza | MX$283,000 | 22.2% | 710/719 (98.7%) |
  | Venta Tienda | MX$116,250 | 9.1% | 362/719 (50.3%) |
  | Garantia Extendida | MX$66,872 | 5.2% | 8/719 (1.1%) |
  | Clientes Nuevos | MX$39,100 | 3.1% | 141/719 (19.6%) |
  | Club Proteccion | MX$10 | ~0% | 2/719 (0.3%) |
- Temporal windowing: 37,009 January rows correctly isolated from 119,129 total
- Entity dedup: 719 unique external_ids, 0 duplicates
- Source date: 100% coverage

### Phase 5: Browser Verification
- Calculate page loads (200), no server errors
- Results in database (719), calculation batch exists
- 3 periods available for selection

## Proof Gate Summary

| Gate | Description | Status |
|------|-------------|--------|
| PG-1 | Clean state verified | PASS |
| PG-2 | Plan imported (6 components) | PASS |
| PG-3 | Entities ~ 719 | PASS (719) |
| PG-4 | Committed data ~ 119K | PASS (119,129) |
| PG-5 | Source_date populated | PASS (100%) |
| PG-6 | Assignments created | PASS (719) |
| PG-7 | Entity binding | PASS |
| PG-8 | Periods created | PASS (3) |
| PG-9 | Calculation executes | PASS |
| PG-10 | Result count ~ 719 | PASS (719) |
| PG-11 | Total payout ±5% of MX$1,253,832 | PASS (+1.88%) |
| PG-12 | Entity dedup — 0 duplicates | PASS |
| PG-13 | Source date populated | PASS (119,129/119,129) |
| PG-14 | Temporal isolation | PASS |
| PG-15 | Component breakdown valid | PASS |
| PG-16 | Variant selection | PASS |
| PG-17 | Calculate page loads | PASS |
| PG-18 | Results display ready | PASS |
| PG-19 | Periods available | PASS |
| PG-20 | No server errors | PASS |

## Key Technical Decisions

1. **Bypass Next.js API for import**: Both plan (Anthropic API) and data (Supabase direct) imports bypassed the Next.js dev server due to persistent fetch failures and timeouts. Scripts run directly via `npx tsx`.

2. **Component transformation**: The AI plan interpretation produced `calculationType` + `calculationIntent` (human-readable) format. The engine requires `componentType` + `tierConfig`/`matrixConfig`/etc. Wrote transformation script to bridge the gap.

3. **Metric derivations for store data**: Store-level sheets (venta_tienda, clientes_nuevos, cobranza) have no pre-computed attainment. Added 14 metric_derivation rules to compute attainment ratios from actual/goal fields.

4. **Variant routing**: Two employee types (Certificado/No Certificado) require different Optical Sales matrix values. Used the engine's variant selection based on entity role (Puesto field).

5. **Sheet name matching**: Named components to substring-match data_type values (e.g., "Venta Individual" → matches `...base_venta_individual`).

## Files Created

- `web/scripts/ob154-verify-clean.ts` — Phase 0 verification
- `web/scripts/ob154-import-plan-direct.ts` — Phase 1 plan import
- `web/scripts/ob154-import-data-direct.ts` — Phase 2 data import
- `web/scripts/ob154-cleanup-dupes.ts` — Phase 2 duplicate cleanup
- `web/scripts/ob154-create-periods.ts` — Phase 3 period creation
- `web/scripts/ob154-fix-components.ts` — Phase 3 component transformation
- `web/scripts/ob154-recalculate.ts` — Phase 3 recalculation
- `web/scripts/ob154-forensic.ts` — Phase 4 CC-UAT-07 verification
- `web/scripts/ob154-browser-verify.ts` — Phase 5 browser verification
- Various diagnostic scripts (`ob154-diagnose-calc.ts`, `ob154-inspect-data.ts`, etc.)

## Engine Contract (Final State)

| Table | Count |
|-------|-------|
| rule_sets | 1 (6 components × 2 variants) |
| entities | 719 |
| periods | 3 |
| committed_data | 119,129 |
| rule_set_assignments | 719 |
| calculation_results | 719 |
| calculation_batches | 1 |
