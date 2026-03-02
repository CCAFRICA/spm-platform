# HF-083: DG Junk Data Cleanup + Isolated Recalculation
## Type: Hotfix
## Priority: HIGH
## Date: 2026-03-01
## Prerequisite: Read CC_STANDING_ARCHITECTURE_RULES.md first

---

## CONTEXT

CLT-126 imported the DG plan file (`CFG_Deposit_Growth_Incentive_Q1_2024.xlsx`) through the DPI path to test whether Tab 2 per-entity target data could reach the calculation engine. The import succeeded but committed 17 junk rows from Tab 1 (plan rules parsed as data rows with `__EMPTY` columns) alongside 12 legitimate target rows from Tab 2.

No recalculation has been performed since the import. The junk data must be cleaned before any recalculation to prevent contamination.

**Import ID:** #eae63444
**Tenant:** LAB / Caribe Financial Group (`a630404c-0777-4f6d-b760-b8a190ecd63c`)

---

## OBJECTIVE

1. Remove the 17 junk rows from Tab 1 (plan rules committed as data)
2. Verify the 12 target rows from Tab 2 remain intact
3. Recalculate ONLY Deposit Growth (not all 4 plans) via API
4. Compare DG results: if payouts vary by entity, F-04 is closing. If still uniform $30K, the engine doesn't consume target data — document the gap.
5. Verify CL, Mortgage, IR results are UNTOUCHED (no recalculation, no regression)

---

## ANTI-PATTERN WARNING

- **AP-5:** Do NOT fix calculation logic in this HF. This is cleanup + measurement only.
- **AP-1:** Do NOT modify product code. Scripts only.
- **Pattern 21 (Dual code path):** Do not create new routes or components.
- **Pattern 18 (Stale accumulation):** After deleting junk rows, verify row counts match expectations.

---

## PHASE 0: DIAGNOSTIC — Identify Junk Data

### Step 0.1: Query committed_data for import #eae63444
```sql
SELECT data_type, COUNT(*), 
  jsonb_object_keys(field_mappings) as sample_fields
FROM committed_data 
WHERE tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
  AND import_id = 'eae63444'  -- or however import_id is stored
GROUP BY data_type;
```

Identify:
- Which data_type(s) were created (expect `deposit_growth__plan_rules` and `deposit_growth__growth_targets` or similar)
- Row counts per data_type
- Field names in each data_type (junk rows will have `__EMPTY` fields)

### Step 0.2: Identify junk rows specifically
```sql
SELECT id, data_type, raw_data
FROM committed_data
WHERE tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
  AND (raw_data::text LIKE '%__EMPTY%' OR raw_data::text LIKE '%ATTAINMENT%' OR raw_data::text LIKE '%CARIBE FINANCIAL GROUP%')
LIMIT 30;
```

### Step 0.3: Verify existing DG data is intact
```sql
SELECT data_type, COUNT(*)
FROM committed_data
WHERE tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
  AND data_type LIKE '%deposit%'
GROUP BY data_type;
```

Expected: `deposit_balances` (existing transaction data) + new data_types from this import.

**COMMIT Phase 0 diagnostic results.**

---

## PHASE 1: DELETE JUNK DATA

Delete ONLY the Tab 1 junk rows. Preserve Tab 2 target rows.

### Step 1.1: Delete by identifying characteristics
Use the diagnostic from Phase 0 to build precise DELETE statements. The junk rows will be identifiable by:
- `__EMPTY` in field names or raw_data
- Plan rule text content ("ATTAINMENT TIERS", "Below Threshold", "No bonus earned")
- The data_type assigned to Tab 1 (likely contains `plan_rules` in the name)

### Step 1.2: Verify deletion
```sql
SELECT data_type, COUNT(*)
FROM committed_data
WHERE tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
  AND data_type LIKE '%deposit_growth__%'
GROUP BY data_type;
```

Expected: Only Tab 2 target rows remain (12 rows with entity IDs and target amounts).

### Step 1.3: Verify no other data was affected
```sql
SELECT data_type, COUNT(*)
FROM committed_data
WHERE tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
GROUP BY data_type
ORDER BY data_type;
```

Compare against OB-126 Phase 0 snapshot (1588 rows across 6 data_types + new target rows).

**COMMIT Phase 1.**

---

## PHASE 2: ISOLATED DG RECALCULATION

Recalculate ONLY Deposit Growth, all 4 periods. Do NOT recalculate CL, Mortgage, or IR.

### Step 2.1: Record pre-recalculation DG state
```sql
SELECT rs.name as plan_name, p.name as period_name, COUNT(*) as results, SUM(cr.payout_amount) as total
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
JOIN periods p ON cr.period_id = p.id
WHERE cr.tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
  AND rs.name LIKE '%Deposit Growth%'
GROUP BY rs.name, p.name
ORDER BY p.name;
```

Expected: 48 results, $1,440,000 total (uniform $30K × 12 entities × 4 periods).

### Step 2.2: Delete DG results only (Rule 25: DELETE before INSERT)
```sql
DELETE FROM calculation_results
WHERE tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
  AND rule_set_id = (
    SELECT id FROM rule_sets 
    WHERE tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c' 
    AND name LIKE '%Deposit Growth%'
  );
```

Also delete corresponding batches and outcomes for DG only.

### Step 2.3: Recalculate DG only
Use `POST /api/calculation/run` for each of the 4 periods, specifying only the DG plan.
4 API calls total (Dec 2023, Jan 2024, Feb 2024, Mar 2024).

### Step 2.4: Record post-recalculation DG state
Same query as Step 2.1. Compare results.

**KEY QUESTION: Do payouts vary by entity?**
- If YES: Target data is being consumed. F-04 is closing. Record the new per-entity amounts.
- If NO (still uniform $30K): The engine doesn't reference `deposit_growth__growth_targets` in its input_bindings. Document the gap — this becomes an engine wiring issue for a future OB.

**COMMIT Phase 2.**

---

## PHASE 3: REGRESSION CHECK

### Step 3.1: Verify CL, Mortgage, IR results unchanged
```sql
SELECT rs.name as plan_name, COUNT(*) as results, SUM(cr.payout_amount) as total
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
WHERE cr.tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
  AND rs.name NOT LIKE '%Deposit Growth%'
GROUP BY rs.name;
```

Expected (from OB-126 CC-UAT-06):
- Consumer Lending: 100 results, $6,540,774.36
- Mortgage Origination: 56 results, $989,937.41
- Insurance Referral: 64 results, $366,600.00

These MUST be identical. No recalculation was performed on them.

### Step 3.2: Verify MBC unchanged
```sql
SELECT COUNT(*) as results, SUM(payout_amount) as total
FROM calculation_results
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';
```

Expected: 240 results, $3,245,212.66.

**COMMIT Phase 3.**

---

## PHASE 4: COMPLETION REPORT

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Junk data removed | 0 rows with `__EMPTY` fields in committed_data for LAB |
| PG-02 | Target data preserved | 12 rows with entity IDs and target amounts in deposit_growth__growth_targets (or equivalent data_type) |
| PG-03 | DG recalculated | 48 results for DG (12 entities × 4 periods) |
| PG-04 | DG payout analysis | Document whether payouts vary or remain uniform $30K |
| PG-05 | CL unchanged | 100 results, $6,540,774.36 |
| PG-06 | Mortgage unchanged | 56 results, $989,937.41 |
| PG-07 | IR unchanged | 64 results, $366,600.00 |
| PG-08 | MBC regression | 240 results, $3,245,212.66 ± $0.10 |
| PG-09 | No product code changes | Only scripts in web/scripts/ |
| PG-10 | Build clean | npm run build exits 0 |

**COMMIT completion report. Create PR.**

---

## STANDING RULES CHECKLIST
- [ ] Rule 1: Commit+push after every phase
- [ ] Rule 2: Cache clear + build after changes
- [ ] Rule 5: Completion report at PROJECT ROOT
- [ ] Rule 25: DELETE before INSERT on calculation_results
- [ ] Rule 26: CC-UAT trace included (DG-specific)
- [ ] Rule 27: Evidence = pasted terminal output
- [ ] Rule 28: One commit per phase

---

*"Clean the junk, recalculate one plan, and let the numbers tell us whether the engine can see the targets."*
