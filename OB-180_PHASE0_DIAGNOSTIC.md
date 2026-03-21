# OB-180 Phase 0: Comprehensive Diagnostic
## Date: March 20, 2026

## Summary: 23 EXISTS / 3 INCOMPLETE / 2 NOT EXISTS

| # | Capability | Status | Evidence |
|---|-----------|--------|----------|
| D1 | Tenant provisioning | EXISTS | /admin/tenants/new (828 lines, 7-step wizard) |
| D2 | PDF upload | EXISTS | SCIUpload accepts .pdf, DOCUMENT_EXTENSIONS |
| D3 | PDF text extraction | EXISTS | analyze-document/route.ts with AI service |
| D4 | Plan interpretation | EXISTS | Pipeline: plan-interpretation with AI |
| D5 | CSV upload | EXISTS | SCIUpload accepts .csv, parseCsvFile() |
| D6 | CSV processing | EXISTS | SCI proposal flow, XLSX library |
| D7 | Entity creation | EXISTS | processEntityUnit in execute-bulk |
| D8 | Multi-plan assignments | EXISTS | rule_set_assignments table |
| D9 | Bi-weekly periods | EXISTS | PayrollFrequency = 'biweekly' |
| D10 | Mixed cadence | EXISTS | cadence_config in rule_sets |
| D11 | linear_function | INCOMPLETE | Approximated via BoundedLookup1D, no explicit primitive |
| D12 | piecewise_linear | INCOMPLETE | Same — BoundedLookup1D approximation |
| D13 | uncapped modifier | INCOMPLETE | Cap is optional (not required), but needs verification |
| D14 | Per-transaction calc | EXISTS | plan-interpreter defines 'per_transaction' type |
| D15 | Multi-plan calc UI | EXISTS | handleCalculateAll() on calculate page |
| D16 | Cross-plan coordination | NOT EXISTS | No cross-plan data references |
| D17 | Commission statements | EXISTS | /perform/statements (610 lines) |
| D18 | Reconciliation | EXISTS | /operate/reconciliation (1325 + 5700 lines) |
| D19 | Lifecycle transitions | EXISTS | 14 files, full state machine |
| D20 | Lifecycle descriptions | INCOMPLETE | State labels exist, no justification text |
| D21 | Payroll export | EXISTS | handleExportCSV on calculate page |
| D22 | Manager persona | EXISTS | /stream with manager persona adaptation |
| D23 | Rep persona | EXISTS | /stream with rep persona (earnings, allocation) |
| D24 | Entity-user linking | EXISTS | entities.profile_id + UI in /configure/users |
| D25 | Persona-scoped RLS | EXISTS | profile_scope table, auth.uid() chain |
| D26 | Clawback/reversal | EXISTS | temporal_adjustment modifier in intent-types |
| D27 | District aggregate | NOT EXISTS | No scope expansion for aggregate primitive |
| D28 | Separation of duties | EXISTS | TRANSITION_CAPABILITIES enforces different user for approve |

## GAPS TO BUILD (5 items)

1. **D11+D12:** Add explicit `linear_function` and `piecewise_linear` to intent executor
2. **D16:** Cross-plan coordination gate (read another plan's results)
3. **D20:** Lifecycle stage justification text in stepper UI
4. **D27:** Aggregate scope expansion (district/region level)
