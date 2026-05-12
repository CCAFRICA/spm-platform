# DIAG-028_HF200_PREREQUISITES — Source-Priority Flip Viability Verification

**Sequence:** 028 (DIAG-025/026/027 assigned this session)
**Type:** Read-only forensic diagnostic + one Supabase SELECT query (no writes)
**Question answered:** Is HF-200 Sub-frame A (single-line source-priority flip) sufficient, or does it require Sub-frame B (entity_id FK repopulation) or Sub-frame C (additional gate enumeration)?
**Decides:** HF-200 final scope (2-3 line change vs. expanded)
**Predecessor:** DIAG-027 Finding 6 — `materializedState` empty AND `tokens=[]` after fallback → suggests `committed_data.entity_id` FK not populated for Meridian Plantilla rows in current database state
**Bindings:** T1-E905 (verbatim evidence); T1-E953 (no claims without paste); T2-E46 (facts only; architect interprets); T5-E1064 (single statement; no per-step ceremony)

## CC PASTE BLOCK

```markdown
# DIAG-028_HF200_PREREQUISITES

**Repo:** `~/spm-platform`
**Branch:** create `diag-028-hf200-prerequisites` from main HEAD
**Type:** READ-ONLY (one Supabase SELECT query; no writes; no code modifications; no commits)
**Bindings:** T1-E905, T1-E953, T2-E46, T5-E1064

## TASK

Verify three prerequisites for HF-200 Sub-frame A (single-line source-priority flip at OB-177 Phase 3 reversal point):

1. Is `committed_data.entity_id` FK populated for Meridian Plantilla rows in current database state?
2. Would source-priority flip produce non-empty tokens for Meridian via `flatDataByEntity` if FK is populated?
3. Are there additional gate/scoring drift commits beyond OB-177 Phase 3 + OB-194 Phase 1 modifying the variant-matcher path?

## DIMENSION 1 — entity_id FK POPULATION (Supabase SELECT)

Execute one Supabase SELECT query against current database. Use existing CC database credentials per standing rules.

```sql
SELECT
  cd.id AS committed_data_id,
  cd.entity_id,
  cd.tenant_id,
  e.name AS entity_name,
  e.tenant_id AS entity_tenant,
  ib.metadata->'plantilla_marker' AS plantilla_flag,
  cd.created_at
FROM committed_data cd
LEFT JOIN entities e ON cd.entity_id = e.id
LEFT JOIN import_batches ib ON cd.batch_id = ib.id
WHERE cd.tenant_id = (SELECT id FROM tenants WHERE slug ILIKE '%meridian%' LIMIT 1)
ORDER BY cd.created_at DESC
LIMIT 50;
```

PASTE verbatim output (table). If query fails, paste the error verbatim.

Then aggregate counts:

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(entity_id) AS rows_with_entity_id,
  COUNT(*) FILTER (WHERE entity_id IS NULL) AS rows_without_entity_id
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug ILIKE '%meridian%' LIMIT 1);
```

PASTE verbatim output.

If `rows_without_entity_id > 0`, identify when entity_id population would have happened in the import path:

```bash
grep -rn "entity_id\s*[:=]" web/src/app/api/import/ web/src/lib/sci/ --include="*.ts" | grep -iE "committed_data|insert|update" | head -30
```

PASTE verbatim output.

## DIMENSION 2 — SOURCE-PRIORITY FLIP SIMULATION (READ-ONLY)

Locate current source-priority logic at calc/run/route.ts (per DIAG-027 Finding 6, mechanism is at lines 1434-1447 as fallback gated on entityTokens.size === 0):

```bash
grep -n -B 5 -A 40 "entityTokens.size\s*===\s*0\|materializedState" web/src/app/api/calculation/run/route.ts | head -120
```

PASTE verbatim output.

Then locate the corresponding reconciliation-era logic at cbaacb12 / 1bd8100b for direct line-by-line comparison:

```bash
git show cbaacb12:web/src/app/api/calculation/run/route.ts 2>/dev/null | sed -n '940,1060p'
```

PASTE verbatim output.

```bash
git show 1bd8100b:web/src/app/api/calculation/run/route.ts 2>/dev/null | sed -n '980,1060p'
```

PASTE verbatim output.

Identify the specific lines that would need to change to flip source-priority back:

CC reports the verbatim before/after diff shape — what lines, what change, what conditions become true/false. NO interpretation; just describe the structural delta between current PRIMARY=materializedState and reconciliation-era PRIMARY=flatDataByEntity.

## DIMENSION 3 — ADDITIONAL DRIFT COMMITS ENUMERATION

DIAG-027 found 25+ commits modified calc/run between reconciliation and current main. DIAG-027 highlighted two decisive commits (bbe8fd33 OB-177 Phase 3; b3f22d3c OB-194 Phase 1). This dimension enumerates the rest.

```bash
git log --oneline cbaacb12..HEAD -- web/src/app/api/calculation/run/route.ts
```

PASTE all output (do not truncate).

For each commit identified, capture full commit message:

```bash
git log -1 --format="%H%n%ad%n%s%n%n%b" <SHA>
```

PASTE for each. Group commits by category:
- Variant-matcher path (touches token extraction, variant scoring, materializedState read, flatDataByEntity read)
- Other calc/run path (touches metric aggregation, period handling, entity resolution unrelated to variant matching)
- Documentation-only / type-only

CC produces a single table listing each commit with category assignment based on commit message + file diff scope. PASTE the table.

## DIMENSION 4 — EMPIRICAL FINDINGS

CC writes 5-7 single-sentence facts:

- Meridian committed_data.entity_id FK population status: <X of Y rows have entity_id; Z null>
- Source-priority flip mechanic: current code at `calc/run/route.ts:<line>` requires <X> change to restore reconciliation-era PRIMARY=flatDataByEntity
- Gate logic between reconciliation-era and current main differs at <list of files:lines>
- Additional drift commits beyond OB-177 Phase 3 + OB-194 Phase 1 affecting variant-matcher: <count, list>
- Of those additional commits, <count> touch gate/scoring logic; <count> touch other concerns
- entity_id population code path location: <file:lines>
- entity_id population path triggered by: <import event / SCI execute / convergence / etc.>

NO interpretation. NO recommendations. NO disposition options. Architect interprets.

## REPORT

Write evidence document to `/tmp/DIAG_028_HF200_PREREQUISITES_REPORT_<YYYYMMDD>.md` with sections corresponding to Dimensions 1-4.

Write completion report to `docs/completion-reports/DIAG-028_HF200_PREREQUISITES_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26 mandatory structure (Commits → Files Created → Files Modified → Hard Gates → Soft Gates → Standing Rule Compliance → Known Issues → Verification Script Output). Hard Gates evidence references `/tmp/` evidence document by section; do not re-paste full output into completion report.

PASTE both file paths + ls -la verification + completion report content in chat.

NO commits. Branch left untracked for architect disposition.
```
