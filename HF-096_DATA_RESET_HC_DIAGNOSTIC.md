# HF-096: MERIDIAN DATA RESET + HC DIAGNOSTIC LOGGING
## Clean stale import data + add visibility into HC confidence on production
## Type: Hotfix — CLT-160 continuation
## Evidence: Import ran before HF-095 deployed. Data routed on stale classification.

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `web/src/lib/sci/header-comprehension.ts` — HC service
3. `web/src/app/api/import/sci/analyze/route.ts` — where HC runs during analyze
4. `web/src/app/api/import/sci/analyze-document/route.ts` — alternate analyze path (check which one production uses)

---

## THE SITUATION

CLT-160 data import completed but with stale classification (pre-HF-095):
- Datos_Flota_Hub classified as Transaction → routed to committed_data (wrong — should be reference_data)
- Only 50 transaction rows instead of ~150 (possible dedup or single-month issue)
- Convergence produced empty input_bindings
- HF-095 (HC Override Authority) verified on localhost but may not have been active at import time

We need to:
1. Clean the stale data so re-import starts fresh
2. Add diagnostic logging so we can see HC confidence values on the NEXT import
3. Verify the full scoring pipeline runs with HC override active

---

## PHASE 1: DATA CLEANUP

### 1A: Document Current State

```bash
# Run in Supabase SQL Editor — document before cleanup:
```
```sql
SELECT 
  (SELECT count(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data,
  (SELECT count(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT count(*) FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_data,
  (SELECT count(*) FROM reference_items WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_items,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as assignments,
  (SELECT count(*) FROM classification_signals WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as signals,
  (SELECT count(*) FROM import_batches WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as batches;
```

### 1B: Clean Stale Import Data

**Andrew executes in Supabase SQL Editor:**

```sql
-- Delete in dependency order (FK constraints)

-- 1. Committed data (86 rows — 50 transaction + 36 misrouted hub)
DELETE FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- 2. Rule set assignments (50 — will be recreated on re-import)
DELETE FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- 3. Entities (50 — will be recreated on re-import)
DELETE FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- 4. Reference data/items (0 — but clean anyway)
DELETE FROM reference_items WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- 5. Import batches (stale records)
DELETE FROM import_batches WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- 6. Classification signals from stale import (keep clean for flywheel accuracy)
DELETE FROM classification_signals WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND source_file_name IS NOT NULL;

-- DO NOT DELETE: rule_sets (plan is correct), tenant record, foundational_patterns, domain_patterns
```

### 1C: Verify Clean State

```sql
SELECT 
  (SELECT count(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT count(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data,
  (SELECT count(*) FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_data,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as assignments;
-- Expected: rule_sets=1, everything else=0
```

### Proof Gates — Phase 1
- PG-01: Current state documented before cleanup
- PG-02: Cleanup SQL prepared (Andrew executes)
- PG-03: Verify script confirms rule_sets=1, everything else=0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-096 Phase 1: Data cleanup SQL for Meridian re-import" && git push origin dev`

---

## PHASE 2: HC DIAGNOSTIC LOGGING

Add console.log statements to the analyze route that will appear in Vercel Runtime Logs. These show exactly what HC produces and whether the override fires.

### 2A: Find the Analyze Route

```bash
# Which analyze route does production use?
ls -la web/src/app/api/import/sci/analyze/route.ts
ls -la web/src/app/api/import/sci/analyze-document/route.ts 2>/dev/null

# Vercel logs showed POST /api/import/sci/analyze-document returning 200
# So the production path is likely analyze-document
```

### 2B: Add HC Diagnostic Logging

In the analyze route (whichever one production uses), add logging at these points:

```typescript
// 1. AFTER HC runs — log what the LLM returned per sheet
console.log('[SCI-HC-DIAG] Sheet:', sheetName, 'HC available:', !!headerComprehension);
if (headerComprehension?.interpretations) {
  for (const [col, interp] of Object.entries(headerComprehension.interpretations)) {
    console.log('[SCI-HC-DIAG]   Column:', col, 
      'role:', interp.columnRole, 
      'confidence:', interp.confidence,
      'meaning:', interp.semanticMeaning);
  }
}

// 2. AFTER HC override in Content Profile — log what was overridden
console.log('[SCI-HC-DIAG] Profile overrides applied:',
  'identifierOverride:', identifierOverridden ? 'YES' : 'no',
  'temporalSuppressed:', temporalSuppressed ? 'YES' : 'no',
  'currencySuppressed:', currencySuppressed ? 'YES' : 'no');

// 3. AFTER classification — log final result per sheet
console.log('[SCI-HC-DIAG] Classification:', sheetName,
  '→', finalClassification, 
  'at', Math.round(finalConfidence * 100) + '%',
  'source:', decisionSource);
```

### 2C: Add Key Content Profile Values to Logging

```typescript
// 4. AFTER Content Profile generation — log the structural signals
console.log('[SCI-PROFILE-DIAG] Sheet:', sheetName,
  'rows:', profile.rowCount,
  'numericRatio:', profile.numericFieldRatio?.toFixed(2),
  'catRatio:', profile.categoricalFieldRatio?.toFixed(2),
  'identRepeat:', profile.identifierRepeatRatio?.toFixed(2),
  'hasTemporal:', profile.hasTemporalColumns,
  'hasIdentifier:', profile.hasIdentifier,
  'identifierCol:', profile.identifierColumn || 'none',
  'hasStructName:', profile.hasStructuralName);

// 5. AFTER agent scoring — log all agent scores per sheet
console.log('[SCI-SCORES-DIAG] Sheet:', sheetName,
  'scores:', JSON.stringify(agentScores.map(s => ({ agent: s.agent, conf: Math.round(s.confidence * 100) }))));
```

### 2D: Logging Prefix Convention

All diagnostic logs use `[SCI-HC-DIAG]`, `[SCI-PROFILE-DIAG]`, or `[SCI-SCORES-DIAG]` prefix. This makes them:
- Filterable in Vercel Runtime Logs
- Easy to find
- Easy to remove after CLT-160 completes

### Proof Gates — Phase 2
- PG-04: HC diagnostic logging added to production analyze route
- PG-05: Logs show column roles, confidence, semantic meaning per column
- PG-06: Logs show Content Profile structural signals per sheet
- PG-07: Logs show agent scores per sheet
- PG-08: Logs show final classification + decision source per sheet
- PG-09: All logs use filterable prefix
- PG-10: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-096 Phase 2: HC diagnostic logging for Vercel Runtime Logs" && git push origin dev`

---

## PHASE 3: VERIFY HC OVERRIDE ON LOCALHOST

### 3A: Run Classification on Localhost

Before deploying to production, verify the full pipeline on localhost with HC active:

```bash
# Start dev server
kill dev server 2>/dev/null
rm -rf .next
npm run build
npm run dev

# Upload Meridian_Datos_Q1_2025.xlsx on localhost:3000
# Check terminal output for [SCI-HC-DIAG] logs
```

### 3B: Expected Localhost Results

```
[SCI-HC-DIAG] Sheet: Datos_Flota_Hub HC available: true
[SCI-HC-DIAG]   Column: Hub role: reference_key confidence: 0.9X meaning: hub_identifier
[SCI-HC-DIAG]   Column: Mes role: attribute confidence: 0.8X meaning: month_dimension
[SCI-HC-DIAG]   Column: Año role: attribute confidence: 0.8X meaning: year_dimension
[SCI-HC-DIAG]   Column: Capacidad_Total role: measure confidence: 0.8X meaning: total_capacity
[SCI-HC-DIAG] Profile overrides applied: identifierOverride: YES temporalSuppressed: YES currencySuppressed: YES
[SCI-HC-DIAG] Classification: Datos_Flota_Hub → reference at 85% source: signature
```

If HC confidence is below 0.80 for any column → the override won't fire for that column. Document the exact confidence values.

### 3C: Check Row Count for Datos_Rendimiento

While testing on localhost, verify how many committed_data rows the transaction pipeline produces:

```bash
# After import completes on localhost, check DB:
# Expected: ~150 rows (50 employees × 3 months) or ~201 rows (full sheet)
```

If only 50 rows: the entity dedup logic may be deduplicating TRANSACTION rows by entity (keeping only one row per entity instead of one per entity per month). This would be a bug in the execute pipeline.

### Proof Gates — Phase 3
- PG-11: Localhost classification shows Datos_Flota_Hub → Reference
- PG-12: HC confidence values visible in logs (all ≥ 0.80 for override)
- PG-13: Datos_Rendimiento produces correct row count (~150-201)
- PG-14: All three sheets classify correctly on localhost

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-096 Phase 3: Localhost verification with HC diagnostic logging" && git push origin dev`

---

## PHASE 4: BUILD + PR

```bash
kill dev server
rm -rf .next
npm run build
npm run dev
# Confirm localhost:3000 responds
```

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-096: Meridian data reset + HC diagnostic logging for CLT-160 re-import" \
  --body "## Problem
CLT-160 data import ran before HF-095 (HC Override Authority) was deployed.
Datos_Flota_Hub classified as Transaction, routed to committed_data (wrong table).
Only 50 transaction rows instead of ~150.

## What Changed
### 1. Data Cleanup SQL (manual — Andrew executes)
Delete stale committed_data, entities, assignments, signals from Meridian tenant.
Preserve: rule_sets (plan is correct), tenant record, flywheel patterns.

### 2. HC Diagnostic Logging
console.log with [SCI-HC-DIAG] prefix showing:
- HC column roles + confidence per column per sheet
- Content Profile structural signals per sheet
- Agent scores per sheet
- Final classification + decision source
Filterable in Vercel Runtime Logs. Removable after CLT-160.

### 3. Localhost Verification
All three sheets classify correctly with HC override active.
HC confidence values documented.

## Next Step
Andrew: run cleanup SQL → merge PR → deploy → re-import XLSX → check Vercel logs for [SCI-HC-DIAG]"
```

### Proof Gates — Phase 4
- PG-15: `npm run build` exits 0
- PG-16: localhost:3000 responds
- PG-17: PR created

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-096 Complete: Data reset SQL + HC diagnostic logging" && git push origin dev`

---

## AFTER HF-096 MERGES

### Andrew's Steps:
1. Run cleanup SQL in Supabase SQL Editor (Phase 1B)
2. Verify clean state (Phase 1C) — rule_sets=1, everything else=0
3. Wait for Vercel deployment (confirm deployment timestamp > PR merge time)
4. Re-upload Meridian_Datos_Q1_2025.xlsx on vialuce.ai
5. Check Vercel Runtime Logs for `[SCI-HC-DIAG]` entries
6. Report classification results + HC confidence values

### What We're Looking For in the Logs:
- **HC running?** `HC available: true` for all sheets
- **HC confidence?** All column roles ≥ 0.80 for override to fire
- **Override fired?** `identifierOverride: YES`, `temporalSuppressed: YES`, `currencySuppressed: YES` for Datos_Flota_Hub
- **Correct classification?** `Datos_Flota_Hub → reference at ≥75%`
- **Row count?** Datos_Rendimiento should produce ~150 transaction rows (not 50)

---

*HF-096: "Before you can prove the pipeline works, you need clean data and visibility. Clean the stale import. Add the diagnostic logs. Then re-import with eyes open."*
