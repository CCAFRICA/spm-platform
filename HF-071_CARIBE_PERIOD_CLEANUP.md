# HF-071: CARIBE ERRONEOUS PERIOD CLEANUP
## Delete 22 hire-date periods from Caribe Financial tenant

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `PERSISTENT_DEFECT_REGISTRY.md` — verify in-scope items
3. `CLT-102_FINDINGS.md` — findings CLT102-F10, F-21, F-23

---

## WHY THIS HF EXISTS

CLT-102 Caribe Financial walkthrough: importing a roster file (CFG_Personnel_Q1_2024.xlsx) triggered period detection on the HireDate column, creating 22 periods spanning February 2015 to May 2023. These are employee hire dates, not performance periods. They now pollute the period selector, making it impossible to select actual performance periods (Q1 2024) for calculation.

This is a database cleanup — no code changes. OB-107 will prevent this from recurring by suppressing period detection on roster files. This HF cleans up the damage already done.

**CLT-102 findings addressed:** CLT102-F10, CLT102-F21, CLT102-F23

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Commit this prompt to git as first action.
5. **DO NOT MODIFY ANY CODE FILES.** This is a database-only cleanup.

---

## PHASE 0: DIAGNOSTIC — WHAT'S IN THE PERIODS TABLE

```sql
-- Caribe tenant ID: fa6a48c5-56dc-416d-9b7d-9c93d4882251

-- 0A: Count all periods for Caribe
SELECT COUNT(*) as total_periods FROM periods
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

-- 0B: List all periods with dates
SELECT id, label, start_date, end_date, canonical_key, created_at
FROM periods
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251'
ORDER BY start_date ASC;

-- 0C: Identify erroneous periods (pre-2024 = hire dates)
SELECT id, label, start_date, end_date
FROM periods
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251'
AND start_date < '2024-01-01'
ORDER BY start_date ASC;

-- 0D: Identify legitimate periods (2024+ = actual performance data)
SELECT id, label, start_date, end_date
FROM periods
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251'
AND start_date >= '2024-01-01'
ORDER BY start_date ASC;

-- 0E: Check if any calculation_batches or committed_data reference erroneous periods
SELECT p.id, p.label, p.start_date,
  (SELECT COUNT(*) FROM calculation_batches cb WHERE cb.period_id = p.id) as calc_refs,
  (SELECT COUNT(*) FROM committed_data cd WHERE cd.period_key = p.canonical_key AND cd.tenant_id = p.tenant_id) as data_refs
FROM periods p
WHERE p.tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251'
AND p.start_date < '2024-01-01'
ORDER BY p.start_date ASC;
```

**Paste ALL output before proceeding.**

---

## PHASE 1: CLEANUP — DELETE ERRONEOUS PERIODS

**Only execute if Phase 0E shows zero calc_refs and zero data_refs for pre-2024 periods.**

If ANY pre-2024 period has references, do NOT delete those specific periods. Document which ones have references and why.

```sql
-- Delete erroneous hire-date periods (pre-2024 only)
DELETE FROM periods
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251'
AND start_date < '2024-01-01';

-- Verify deletion
SELECT COUNT(*) as remaining_periods FROM periods
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

-- List remaining periods (should be only 2024 performance periods)
SELECT id, label, start_date, end_date, canonical_key
FROM periods
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251'
ORDER BY start_date ASC;
```

---

## PHASE 2: VERIFY NO COLLATERAL DAMAGE

```sql
-- Other tenants' periods untouched
SELECT tenant_id, COUNT(*) as period_count
FROM periods
GROUP BY tenant_id
ORDER BY period_count DESC;

-- Specifically check Óptica and Pipeline Proof Co
SELECT id, label, start_date FROM periods
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' -- Óptica
ORDER BY start_date;

SELECT id, label, start_date FROM periods
WHERE tenant_id = 'dfc1041e-7c39-4657-81e5-40b1cea5680c' -- Pipeline Proof Co
ORDER BY start_date;
```

---

## PHASE 3: COMPLETION

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Diagnostic output pasted | Phase 0 SQL results |
| PG-02 | Pre-2024 periods deleted | Zero periods with start_date < 2024-01-01 for Caribe |
| PG-03 | Legitimate periods preserved | Dec 2023 - Mar 2024 periods remain (from transaction import) |
| PG-04 | No collateral damage | Other tenants' periods unchanged |
| PG-05 | No code files modified | Git diff shows zero .ts/.tsx changes |

### Commit

```bash
cd /Users/AndrewAfrica/spm-platform && \
git add -A && \
git commit -m "HF-071: Caribe erroneous period cleanup — 22 hire-date periods deleted" && \
git push origin dev
```

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*HF-071: "Clean the database. OB-107 prevents the recurrence."*
