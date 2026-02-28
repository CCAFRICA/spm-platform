ARCHITECTURE DECISION RECORD — OB-115
======================================
Problem: MBC calculation produces $0.00 because:
  1. committed_data.data_type = "Sheet1" for all CSVs (T-15)
  2. rule_sets.input_bindings = {} (empty, not NULL) (T-14)
  3. Engine metric names don't match data field names (T-13)

DIAGNOSTIC FINDINGS:

- data_type set at: import/commit/route.ts:581 — value comes from: sheet.sheetName (XLSX.js SheetNames array)
  For CSVs, XLSX.js defaults to "Sheet1". For XLSX, uses actual tab names.

- AI classification available at commit time: YES — aiContext is passed in request body (route.ts:75)
  aiContext.sheets[].classification = "component_data" | "roster" | "reference" | "unrelated"
  aiContext.sheets[].matchedComponent = matched plan component name or null

- Engine reads input_bindings at: run-calculation.ts:554 (fetched but NOT used in current code)
  The engine selects input_bindings in the query but never references it after that.

- findMatchingSheet logic (run-calculation.ts:282-322):
  1. AI context sheets (from import_batches.metadata) — tries findSheetForComponent()
  2. Direct name matching: normSheet.includes(normComponent) || normComponent.includes(normSheet)
  3. SHEET_COMPONENT_PATTERNS regex patterns (Optica-specific optical/sales patterns)
  For MBC: "sheet1" doesn't include "mortgage_origination_bonus" → no match → engine uses ALL data

- Component metric names (from DB query):
  - Mortgage Origination Bonus Plan: metric = "quarterly_mortgage_origination_volume"
  - Deposit Growth Incentive: metric = "deposit_growth_attainment"
  - Consumer Lending Commission: 3 components, NO metrics defined (type undefined)
  - Insurance Referral: 5 components, all metric = "unknown"

- Plan import sets input_bindings at: plan/import/route.ts:77 — `input_bindings: {} as Json` (empty object, always)
  The plan import route NEVER populates input_bindings with actual bindings.

- MBC committed_data breakdown:
  - "Personnel": 50 rows (roster data)
  - "Sheet1": 950 rows (ALL financial CSV data lumped together)

APPROACH:

Fix 1 (data_type): Use aiContext classification at commit time
  - When aiContext is available AND sheet has matchedComponent → use matchedComponent as data_type
  - When aiContext is available but no matchedComponent → use classification + original filename
  - When no aiContext → use filename (strip extension) instead of XLSX sheet name for CSV files
  - Scale test: Works at 10x? Yes — per-row metadata, no volume impact
  - AI-first: Uses AI classification result, no hardcoding
  - Transport: No change — metadata only
  - Atomicity: Same as current — committed_data insert is already chunked

Fix 2 (input_bindings): Populate for determinable MBC plans
  - Only Mortgage Origination Bonus has a clear mapping: quarterly_mortgage_origination_volume → LoanAmount
  - Deposit Growth has: deposit_growth_attainment → TotalDepositBalance (needs attainment calc)
  - Consumer Lending: No metrics defined — cannot map. Leave as {}
  - Insurance Referral: All metrics "unknown" — cannot map. Leave as {}
  - Scale test: Data migration, not ongoing. Future plans need Decision 64.
  - AI-first: The binding values come from understanding the data semantically
  - Transport: Direct DB update
  - Atomicity: Single update per rule set

Fix 3 (Sabor routing): Archive ICM rule sets
  - Sabor is demo financial showcase, ICM plans from OB-95 seed data
  - Scale test: N/A — data decision
  - AI-first: N/A
  - Transport: N/A
  - Atomicity: Single UPDATE

CHOSEN: All three — independent fixes on different files/tables.
REJECTED: None — each fix addresses a different layer of the failure chain.
