# OB-164: BCL PIPELINE PROOF — IMPORT THROUGH SCI
## Delete Seeded Data. Import Files. Prove the Pipeline Works for a Second Tenant.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — all rules, anti-patterns, Governing Principles
2. `SCHEMA_REFERENCE_LIVE.md` — live database schema
3. `DS-012_BCL_Proof_Tenant_Design_20260310.docx` — the proof tenant specification (Decision 125)
4. This prompt in its entirety before writing a single line of code

---

## CONTEXT — WHY THIS EXISTS

### The Problem

OB-163 seeded BCL data directly to the database via scripts. This bypassed the entire import pipeline: no SCI classification, no HC header comprehension, no field identity detection, no AI column mapping, no convergence bindings. The calculation engine produced correct results ($314,978) but the pipeline was never exercised. The second tenant proof is therefore incomplete.

### What This OB Delivers

BCL data enters the platform the way a real customer's data enters: through file upload, SCI processing, and the calculation pipeline. The same 9 files Andrew has ready (plan document, roster, 6 monthly data files) are uploaded through the browser on vialuce.ai. The pipeline processes them. The engine calculates. The result matches GT.

### What This OB Does NOT Do

- No UI changes. No Briefing work. No navigation changes.
- No new features. No refactoring.
- This is pipeline verification. Import → Classify → Map → Calculate → Verify GT.

---

## FIRST PRINCIPLES

1. **PIPELINE PROOF** — Data must enter through the product's import pipeline. Script insertion is not a proof.
2. **GT-FIRST** — After every calculation, compare against GT component-by-component.
3. **KOREAN TEST** — The pipeline must process Spanish column headers through structural heuristics, not name matching.
4. **DECISION 122** — Banker's Rounding with rounding trace. Already proven for Meridian. Must work for BCL.
5. **DO NOT TOUCH THE ENGINE** — The engine works. MX$185,063 and $314,978 are both proven. If BCL calculations are wrong after import, the problem is in the import pipeline, not the engine.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. ALL git commands from repository root (spm-platform)
5. SQL Verification Gate (FP-49): query live schema before writing any SQL
6. PRODUCTION VERIFICATION MANDATORY

---

## PHASE 0: CLEAN BCL — REMOVE SEEDED DATA

### 0A: Identify What OB-163 Seeded

Query the BCL tenant to understand what was seeded directly:

```sql
-- BCL tenant ID from OB-163 completion report
-- Tenant ID: b1c2d3e4-aaaa-bbbb-cccc-111111111111

-- Count seeded data
SELECT 'entities' as tbl, COUNT(*) FROM entities WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
UNION ALL
SELECT 'committed_data', COUNT(*) FROM committed_data WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
UNION ALL
SELECT 'calculation_results', COUNT(*) FROM calculation_results WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
UNION ALL
SELECT 'rule_sets', COUNT(*) FROM rule_sets WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
UNION ALL
SELECT 'rule_set_assignments', COUNT(*) FROM rule_set_assignments WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
UNION ALL
SELECT 'periods', COUNT(*) FROM periods WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
UNION ALL
SELECT 'entity_relationships', COUNT(*) FROM entity_relationships WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
UNION ALL
SELECT 'ingestion_events', COUNT(*) FROM ingestion_events WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
UNION ALL
SELECT 'classification_signals', COUNT(*) FROM classification_signals WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
UNION ALL
SELECT 'calculation_batches', COUNT(*) FROM calculation_batches WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

Paste ALL results. This is the baseline of what must be cleaned.

### 0B: Delete Seeded Data (Preserve Tenant + Admin Profile)

Delete ALL data from the BCL tenant EXCEPT:
- The tenant record itself
- The admin profile (admin@bancocumbre.ec)
- The auth user record

Order matters — delete children before parents:

```sql
-- SQL Verification Gate: verify tables exist and have correct columns BEFORE running deletes
-- Query information_schema for each table first

-- Delete in dependency order
DELETE FROM calculation_results WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM calculation_batches WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM rule_set_assignments WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM entity_relationships WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM committed_data WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM entities WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM periods WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM rule_sets WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM classification_signals WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM ingestion_events WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

### 0C: Also Delete Demo Profiles (Except Admin)

The manager (fernando@bancocumbre.ec) and individual (valentina@bancocumbre.ec) profiles should be deleted — they'll be recreated after import establishes entity_relationships properly.

### 0D: Verify Clean State

Re-run the count query from 0A. ALL counts should be 0 except:
- tenant record: 1
- admin profile: 1

### 0E: Verify VL Admin Survives

```sql
SELECT id, email, role, tenant_id FROM profiles WHERE id = '9c179b53-c5ee-4af7-a36b-09f5db3e35f2';
```

Must return platform@vialuce.com with role='platform' and tenant_id IS NULL.

### 0F: Verify Meridian Untouched

```sql
SELECT COUNT(*) FROM calculation_results WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
-- Should be non-zero (Meridian's calculation results from pipeline proof)
```

**Commit:** `OB-164 Phase 0: BCL cleaned — seeded data removed, tenant and admin preserved`

---

## PHASE 1: STABILIZE IMPORT PREREQUISITES

Before uploading BCL files, verify the import pipeline works:

### 1A: Test File Upload

Upload a small test file (or one of the BCL monthly data files) to the BCL tenant through the browser UI at vialuce.ai.

**Check:**
- [ ] File upload succeeds (no storage RLS error)
- [ ] File appears in ingestion_events
- [ ] SCI classification runs (check Vercel Runtime Logs for SCI execution)

If file upload fails with storage RLS error:
- Check Supabase Storage policies for `ingestion-raw` bucket
- VL Admin must have upload access to BCL tenant's storage path
- Fix the RLS policy. Do NOT create a workaround script.

### 1B: Test Plan Import

Upload BCL_Plan_Comisiones_2025.xlsx through the plan import UI.

**Check:**
- [ ] HC processes all 3 tabs (Plan General, Tablas de Tasas, Metas Mensuales)
- [ ] AI extracts 4 components with correct primitives
- [ ] 2 variants extracted (Ejecutivo Senior, Ejecutivo)
- [ ] Rate tables populated in rule_sets.components
- [ ] Rule set created with status (use Phase 1C to activate if needed)

### 1C: Plan Activation

If the imported plan has status='draft', activate it:
- If a UI mechanism exists (button, status toggle), use it
- If only SQL exists, run: `UPDATE rule_sets SET status = 'active' WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND status = 'draft';`
- Mark this as tech debt if SQL was required

### 1D: Verify Plan Structure

```sql
SELECT id, name, status, 
       jsonb_array_length(components) as component_count
FROM rule_sets 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

Expected: 1 rule set, 4 components, 2 variants, status='active'.

**Commit:** `OB-164 Phase 1: Plan imported through pipeline — [N] components, [N] variants`

---

## PHASE 2: IMPORT ROSTER

Upload BCL_Plantilla_Personal.xlsx through the data import UI.

### 2A: Verification Gates

- [ ] 85 entities created in entities table
- [ ] Entity types correct (individual for all 85)
- [ ] Variant assignment detectable from Nivel_Cargo column
- [ ] rule_set_assignments created: 85 assignments

### 2B: Verify Entity Count

```sql
SELECT COUNT(*) FROM entities WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
-- Expected: 85
```

### 2C: Verify Hierarchy (If Pipeline Supports It)

Check if entity_relationships were created from ID_Gerente column:

```sql
SELECT COUNT(*) FROM entity_relationships WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

If 0: the pipeline may not auto-create relationships from manager ID columns. This is expected — entity_relationships may need to be created separately. Document this as a finding but do NOT block on it.

### 2D: Verify Rule Set Assignments

```sql
SELECT COUNT(*) FROM rule_set_assignments WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
-- Expected: 85
```

**Commit:** `OB-164 Phase 2: Roster imported — [N] entities, [N] assignments`

---

## PHASE 3: IMPORT MONTHLY DATA

Upload all 6 monthly data files (BCL_Datos_Oct2025.xlsx through BCL_Datos_Mar2026.xlsx).

### 3A: Upload Sequence

Upload files one at a time OR in bulk if the import UI supports it. After EACH file:

- [ ] Check Vercel Runtime Logs for SCI execution
- [ ] Verify committed_data row count increased by 85

### 3B: Verify Total Committed Data

```sql
SELECT COUNT(*) FROM committed_data WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
-- Expected: 510 (85 entities × 6 months)
```

### 3C: Verify Source Dates

```sql
SELECT DISTINCT source_date FROM committed_data 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY source_date;
-- Expected: 6 dates (2025-10-01, 2025-11-01, 2025-12-01, 2026-01-01, 2026-02-01, 2026-03-01)
```

### 3D: Verify Key Columns Preserved

```sql
SELECT DISTINCT jsonb_object_keys(row_data) FROM committed_data 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
LIMIT 20;
-- Should include: Cumplimiento_Colocacion, Indice_Calidad_Cartera, Pct_Meta_Depositos, 
-- Cantidad_Productos_Cruzados, Infracciones_Regulatorias (or their mapped equivalents)
```

### 3E: Verify Convergence Bindings

After import, check if convergence bindings were created:

```sql
SELECT * FROM convergence_mappings 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

If convergence bindings are wrong or missing, this is the critical diagnostic moment. The AI column mapping (Decision 118: AI-Primary) must correctly bind:

| Component | Input Role | Expected Column |
|-----------|------------|-----------------|
| C1 | row | Cumplimiento_Colocacion |
| C1 | column | Indice_Calidad_Cartera |
| C2 | actual | Pct_Meta_Depositos |
| C3 | actual | Cantidad_Productos_Cruzados |
| C4 | actual | Infracciones_Regulatorias |

If bindings are wrong, diagnose and fix before proceeding to calculation.

**Commit:** `OB-164 Phase 3: Data imported — [N] committed_data rows, [N] source_dates, convergence bindings [status]`

---

## PHASE 4: CREATE PERIODS + CALCULATE

### 4A: Create Periods

Create 6 periods for BCL. Use the API if it exists (`POST /api/periods` or `/api/periods/create-from-data`), or SQL:

```sql
INSERT INTO periods (id, tenant_id, name, start_date, end_date, status) VALUES
(gen_random_uuid(), 'b1c2d3e4-aaaa-bbbb-cccc-111111111111', 'Octubre 2025', '2025-10-01', '2025-10-31', 'open'),
(gen_random_uuid(), 'b1c2d3e4-aaaa-bbbb-cccc-111111111111', 'Noviembre 2025', '2025-11-01', '2025-11-30', 'open'),
(gen_random_uuid(), 'b1c2d3e4-aaaa-bbbb-cccc-111111111111', 'Diciembre 2025', '2025-12-01', '2025-12-31', 'open'),
(gen_random_uuid(), 'b1c2d3e4-aaaa-bbbb-cccc-111111111111', 'Enero 2026', '2026-01-01', '2026-01-31', 'open'),
(gen_random_uuid(), 'b1c2d3e4-aaaa-bbbb-cccc-111111111111', 'Febrero 2026', '2026-02-01', '2026-02-28', 'open'),
(gen_random_uuid(), 'b1c2d3e4-aaaa-bbbb-cccc-111111111111', 'Marzo 2026', '2026-03-01', '2026-03-31', 'open');
```

### 4B: Calculate Each Period

Run calculation for each period through the calculate UI or API. After EACH period:

1. Check period total against GT
2. If wrong, compare component-by-component
3. Do NOT proceed to next period until current period matches GT

### 4C: GT Verification — Per Period

| Period | GT Total | Engine Total | Delta |
|--------|----------|--------------|-------|
| Oct 2025 | (from GT file) | | |
| Nov 2025 | (from GT file) | | |
| Dec 2025 | (from GT file) | | |
| Jan 2026 | (from GT file) | | |
| Feb 2026 | (from GT file) | | |
| Mar 2026 | (from GT file) | | |
| **Grand Total** | **$314,978** | | |

**NOTE:** The GT values may differ slightly from the OB-163 seeded GT because OB-163 regenerated data with its own seed script. Use the BCL_Resultados_Esperados.xlsx file Andrew generated as the authoritative GT. The CC-generated GT ($314,978) was from a different random seed.

### 4D: Anchor Entity Verification

Verify three anchor entities against the GT file:

**Valentina Salazar (BCL-5012):** C4 should be $100 every month (zero infractions, Ejecutivo).
**Diego Mora (BCL-5063):** C4 should be $0 every month (always has infractions).
**Gabriela Vascones (BCL-5003):** Highest-tier values. C4 = $150 every month (Senior, zero infractions).

### 4E: Verify SCI/Pipeline Artifacts Exist

This is the proof that the pipeline was exercised:

```sql
-- Classification signals from SCI processing (NOT briefing interaction signals)
SELECT COUNT(*), signal_type FROM classification_signals 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
GROUP BY signal_type;

-- Ingestion events from file uploads
SELECT COUNT(*) FROM ingestion_events 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

-- Convergence mappings from AI column matching
SELECT COUNT(*) FROM convergence_mappings 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

ALL must be non-zero. If classification_signals is 0 and ingestion_events is 0, the pipeline was not exercised — something imported through a backdoor.

**Commit:** `OB-164 Phase 4: BCL calculated — $[EXACT] ([MATCH/DELTA] vs GT), all 6 periods verified`

---

## PHASE 5: ENTITY RELATIONSHIPS (IF NOT AUTO-CREATED)

If Phase 2C showed that entity_relationships were NOT populated by the import pipeline:

### 5A: Create Relationships from Roster Data

The BCL_Plantilla_Personal.xlsx has an ID_Gerente column that defines the management hierarchy. Write a script or SQL that reads the roster and creates entity_relationships:

- For each entity with a non-empty ID_Gerente, create a "manages" relationship where the manager is the source and the entity is the target
- Relationship type: "manages" (or whatever the valid enum value is — check the schema)
- Source: "imported_explicit"
- Confidence: 1.0

### 5B: Verify Hierarchy

```sql
SELECT source_entity_id, target_entity_id, relationship_type 
FROM entity_relationships 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
LIMIT 20;
```

**Commit:** `OB-164 Phase 5: Entity relationships created — [N] management relationships`

---

## PHASE 6: DEMO PROFILES (MINIMAL)

### 6A: Create Manager and Individual Profiles

Recreate the demo profiles that were deleted in Phase 0C:

| Profile | Email | Password | Role | Entity Link |
|---------|-------|----------|------|-------------|
| Fernando Hidalgo | fernando@bancocumbre.ec | demo-password-BCL1 | manager | BCL-RM-COSTA (or equivalent entity ID) |
| Valentina Salazar | valentina@bancocumbre.ec | demo-password-BCL1 | individual | BCL-5012 (or equivalent entity ID) |

### 6B: Verify Login

Both demo users should be able to log in on vialuce.ai. They don't need to see the intelligence stream yet (that's Step 2 / OB-165). They just need to authenticate.

**Commit:** `OB-164 Phase 6: Demo profiles created — admin, manager, individual`

---

## PHASE 7: BUILD + VERIFY + PR

### 7A: Completion Report

Create `OB-164_COMPLETION_REPORT.md` with:

1. **Pipeline evidence:** ingestion_events count, classification_signals count, convergence_mappings count — proving data entered through SCI
2. **GT verification table:** all 6 periods, per-period totals, deltas, grand total
3. **Anchor entities:** Valentina, Diego, Gabriela — all 6 months, all 4 components
4. **Entity relationships:** count and sample
5. **Meridian regression:** MX$185,063 unchanged
6. **Anti-Pattern Registry check:** AP-1 through AP-25

### 7B: PR

```bash
gh pr create --base main --head dev \
  --title "OB-164: BCL Pipeline Proof — Import Through SCI" \
  --body "## What This Proves

BCL data imported through the platform's actual import pipeline:
- File upload → SCI classification → HC header comprehension → AI column mapping
- 85 entities from roster import
- 510 committed_data rows from 6 monthly file imports
- Convergence bindings from AI column mapping (Decision 118)
- 6 periods calculated with $[EXACT] grand total ($0 delta vs GT)

## Pipeline Evidence
- ingestion_events: [N] records
- classification_signals: [N] signals from SCI processing
- convergence_mappings: [N] bindings

## What Changed
- Seeded BCL data deleted
- [Any pipeline fixes required during import]

## Meridian Regression
- MX\$185,063 unchanged"
```

---

## PRODUCTION VERIFICATION (Andrew performs after merge)

1. Login to vialuce.ai as admin@bancocumbre.ec
2. Verify BCL tenant shows 85 entities
3. Verify 6 periods with calculation results
4. Verify March 2026 total matches GT
5. Login as platform@vialuce.com → verify Meridian MX$185,063 unchanged
6. Check Vercel Runtime Logs — zero 500 errors

---

## CC FAILURE PATTERN WARNINGS

| Pattern | Risk | Mitigation |
|---------|------|------------|
| FP-60: Completion without production evidence | HIGH | Pipeline evidence (ingestion_events, classification_signals) is mandatory in completion report |
| FP-61: Ignoring GT | HIGH | GT comparison after every period calculation |
| FP-62: Celebrating proximity | HIGH | $314,978 or it's wrong (subject to GT file from Andrew's generation script) |
| Seeding instead of importing | CRITICAL | This is literally what this OB exists to prevent. If CC inserts data via SQL instead of importing through the pipeline, the OB has failed completely. |
| Bypassing SCI | CRITICAL | Data must flow through SCI classification. If CC writes to committed_data directly, the pipeline is not exercised. |

---

## WHAT SUCCESS LOOKS LIKE

1. **ingestion_events > 0** — files were uploaded through the pipeline
2. **classification_signals > 0** — SCI processed the files
3. **convergence_mappings > 0** — AI column mapping ran
4. **$314,978 (or GT-file exact)** — engine produces correct results from pipeline-imported data
5. **Meridian MX$185,063 unchanged** — zero regression

**This OB has one job: prove the pipeline works for a second tenant. No UI. No features. Just truth.**

---

*End of prompt. The files are ready. The GT is known. Import them through the product.*
