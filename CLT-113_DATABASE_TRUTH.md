# CLT-113 DATABASE TRUTH REPORT
Generated: 2026-02-28
Source: Live Supabase queries (bayqxeiltnpjrvflksfa.supabase.co)

---

## TENANT: Mexican Bank Co (MBC)
  ID: fa6a48c5-56dc-416d-9b7d-9c93d4882251
  Slug: mexican-bank-co
  Locale: es-MX
  Currency: MXN
  Features: {"coaching":false,"learning":false,"apiAccess":false,"mobileApp":false,"forecasting":false,"performance":true,"compensation":true,"gamification":false,"salesFinance":true,"transactions":true,"whatsappIntegration":false}
  **NOTE: No "financial" key. No "primary_module" key. No "icm" key.**

  Entities: 25
  Periods: 4 — December 2023 (2023-12), January 2024 (2024-01), February 2024 (2024-02), March 2024 (2024-03)

  Rule Sets: **18 total** (massive duplication)
    Active (5):
      - CFG Insurance Referral Program 2024 (59146196...)
      - Consumer Lending Commission Plan 2024 (9ab2c0d1...)
      - Deposit Growth Incentive — Q1 2024 (ecc2507b...)
      - Insurance Referral Program 2024 (574faa83...)
      - Mortgage Origination Bonus Plan 2024 (af511146...)
    Archived (13): Duplicates of the above with archived status
    **CRITICAL: 5 active plans, not 4. "CFG Insurance Referral" and "Insurance Referral" are BOTH active.**
    **CRITICAL: ALL input_bindings are NULL across all active rule sets.**

  Assignments: 50 (25 entities assigned to 2 rule sets)
  Committed Data: 1,661 rows across 25 entities and 4 periods

  Calculation Results: 25
    Calculated entities: 25
    Calculated periods: 1
    Calculated rule sets: 1 (af511146... = Mortgage Origination Bonus Plan 2024)
    **Total payout sum: $0.00**
    **ROOT CAUSE: metricValue=0 in every result. Engine expects "quarterly_mortgage_origination_volume" but input_bindings is NULL — no mapping from committed_data fields to component metrics.**

  Calculation Batches: 1 (PREVIEW state)
  Import Batches: 10 completed
    Files: CFG_Loan_Defaults_Q1_2024.csv, CFG_Loan_Disbursements_Jan2024.csv, CFG_Insurance_Referrals_Q1_2024.csv, CFG_Personnel_Q1_2024.xlsx, CFG_Loan_Disbursements_Feb2024.csv, CFG_Mortgage_Closings_Q1_2024.csv, CFG_Loan_Disbursements_Mar2024.csv, CFG_Deposit_Balances_Q1_2024.csv

  Sample committed_data row_data keys (Personnel type):
    name, role, Email, Title, email, Branch, Region, Status, region, status, storeId, HireDate, LastName, entityId, FirstName, _rowIndex, hire_date, BranchName, EmployeeID, _sheetName, branch_name, ProductLicenses, product_licenses

  Sample calculation_results.metrics:
    date, rate, amount, entityId, quantity, OfficerID, _rowIndex, LoanAmount, Term_Months, InterestRate, DisbursementDate
    **These are raw field values, NOT semantic metric names.**

---

## TENANT: Optica Luminar
  ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Slug: optica-luminar
  Locale: es-MX
  Currency: MXN
  Features: {"sandbox":true,"disputes":true,"performance":true,"compensation":true,"reconciliation":true}
  **NOTE: No "financial" key. No "primary_module" key.**

  Entities: 22,237
  Periods: 8 — January 2024 through July 2024, plus Febrero 2026

  Rule Sets: 2
    - Imported Plan (active, 7657fc95...)
    - Plan de Comisiones Optica Luminar 2026 (archived, b1b2c3d4...)

  Assignments: 1,000 (1,000 entities assigned to 2 rule sets)
  Committed Data: 238,276 rows across 1,000 entities and 1 period

  Calculation Results: 3,607
    Calculated entities: 731
    Calculated periods: 3
    Calculated rule sets: 2
    **Total payout sum: $4,192,522,508.96**
    **NOTE: Previous memory said ~$1,253,832. Current total is $4.19B — suggests multiple calculation runs or data scale change.**

  Calculation Batches: 6 (4 DRAFT, 1 PREVIEW, 1 PUBLISHED)
  Import Batches: 3 completed
    Files: optica_luminar_febrero_2026.xlsx, BacktTest_Optometrista_mar2025_Proveedores.xlsx

---

## TENANT: Sabor Grupo Gastronomico
  ID: 10000000-0001-0000-0000-000000000001
  Slug: sabor-grupo
  Locale: es-MX
  Currency: MXN
  Features: {"disputes":true,"financial":true,"performance":true,"compensation":true,"reconciliation":true}
  **NOTE: Has "financial":true. No "primary_module" key. Has "compensation":true also.**

  Entities: 64
  Periods: 1 — Enero 2024 (2024-01)

  Rule Sets: 2
    - Comision por Ventas - Meseros (active, 10000000...)
    - Indice de Desempeno - Sabor Grupo Gastronomico (active, 10000000...)

  Assignments: 80 (40 entities assigned to 2 rule sets)
  Committed Data: 47,051 rows across 11 entities and 1 period

  Calculation Results: **0** — No calculations have ever been run
  Calculation Batches: **0** — No batches exist
  Import Batches: 1 completed
    Files: sabor_grupo_enero_2024_pos.csv

---

## CRITICAL CROSS-TENANT OBSERVATIONS

1. **Feature JSONB inconsistency**: No tenant has "primary_module" or "icm" key. HF-076 routing code may be checking keys that don't exist.
2. **MBC rule set duplication**: 18 rule sets where 5 unique names × versions exist. 13 are archived. UI may show all 18 or filter incorrectly.
3. **MBC $0.00 root cause**: input_bindings is NULL on every rule set. The engine has component definitions but NO bindings to map committed_data fields → component metrics.
4. **Sabor has financial:true but also compensation:true**: Routing logic needs to handle this overlap.
5. **Optica payout seems inflated**: $4.19B suggests either calculation scale issue or intentional test data.
6. **Sabor has never run calculation**: Zero batches, zero results, despite having 47K committed data rows.
