# HF-118: IMPORT PIPELINE TRUNCATION — 67 ROWS IN FILE, 50 IN COMMITTED_DATA
## Data Loss During SCI Execute — Root Cause of 67→50 Entity Gap

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference

**Read both before writing any code.**

---

## CONTEXT

The Meridian XLSX has three sheets:
- **Plantilla:** 67 rows (roster — 67 employees)
- **Datos_Rendimiento:** 201 rows (performance — 67 employees × 3 months)
- **Datos_Flota_Hub:** 36 rows (fleet — 12 hubs × 3 months)

After SCI import, committed_data contains:
- **plantilla:** 50 rows (SHOULD BE 67 — missing 17)
- **datos_rendimiento:** 50 rows (SHOULD BE 67 for January alone — missing 17+)
- **datos_flota_hub:** 36 rows (correct)

**17 rows are silently dropped during import.** This is the root cause of:
- 50 entities instead of 67
- MX$193,156 instead of MX$185,063
- Every downstream calculation being wrong

The truncation happens BEFORE entity resolution, BEFORE convergence, BEFORE calculation. Nothing downstream can compensate for missing data.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Commit this prompt as first action.
5. DO NOT MODIFY ANY AUTH FILE.
6. Supabase .in() ≤ 200 items.

---

## COMPLETION REPORT RULES (25-28)

25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## CC ANTI-PATTERNS

| Anti-Pattern | What To Do Instead |
|---|---|
| FP-49: SQL schema fabrication | Verify EVERY column name against SCHEMA_REFERENCE_LIVE.md |
| FP-45: Reactive debugging | Phase 0 reads the code. Find the truncation point. Don't guess. |
| FP-61: Ignoring GT | After fix, verify 67 rows in committed_data for Plantilla, not just "build passes" |

---

## PHASE 0: FIND THE TRUNCATION POINT

**No code changes. Code reading only.**

The SCI analyze log shows "3 content units for 3 sheets" — it sees all 3 sheets. The SCI execute log shows "50 created, 50 rows linked" — by the time execute runs, only 50 rows are being processed.

The truncation happens somewhere between:
1. XLSX parsing (SheetJS reads the file)
2. SCI analyze (sends sheet data to the API)
3. SCI execute (commits rows to committed_data)

```bash
echo "============================================"
echo "HF-118 PHASE 0: IMPORT TRUNCATION TRACE"
echo "============================================"

echo ""
echo "=== 1. FIND THE SCI ANALYZE ROUTE ==="
find web/src/app/api/import/sci -name "*.ts" | sort

echo ""
echo "=== 2. HOW DOES ANALYZE RECEIVE SHEET DATA? ==="
# Does the frontend send all rows or a sample?
grep -rn "rows\|sampleRows\|maxRows\|slice\|limit\|\.slice\|\.splice\|firstN\|take\|head" \
  web/src/app/api/import/sci/analyze/route.ts | head -20

echo ""
echo "=== 3. HOW DOES THE FRONTEND SEND DATA? ==="
# Does the frontend component limit rows before sending?
grep -rn "rows\|sampleRows\|maxRows\|slice\|limit\|\.slice\(.*50\|\.slice\(.*100\|firstN\|MAX_ROWS\|ROW_LIMIT" \
  web/src/app/operate/import/ web/src/components/import/ --include="*.ts" --include="*.tsx" | head -30

echo ""
echo "=== 4. HOW DOES EXECUTE RECEIVE DATA? ==="
grep -rn "rows\|sampleRows\|maxRows\|slice\|limit\|\.slice\|committed_data\|insert" \
  web/src/app/api/import/sci/execute/route.ts | head -30

echo ""
echo "=== 5. FIND ANY HARDCODED ROW LIMITS ==="
grep -rn "50\b\|MAX_ROWS\|ROW_LIMIT\|BATCH_SIZE\|maxSample\|sampleSize" \
  web/src/app/api/import/sci/ web/src/app/operate/import/ \
  web/src/components/import/ web/src/lib/sci/ --include="*.ts" --include="*.tsx" | head -30

echo ""
echo "=== 6. CHECK FILE PARSING ==="
# Does the XLSX parser limit rows?
grep -rn "SheetJS\|xlsx\|XLSX\|read.*sheet\|parse.*sheet\|sheet_to_json\|utils\.sheet" \
  web/src/app/api/import/ web/src/app/operate/import/ \
  web/src/components/import/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== 7. PRINT THE FRONTEND IMPORT COMPONENT — DATA PREPARATION ==="
# Find where the frontend reads the file and prepares data for the API
find web/src -path "*import*" -name "*.tsx" | head -10
# Print the section that reads the XLSX and sends to analyze
grep -rn "FileReader\|readAsArrayBuffer\|XLSX.read\|sheet_to_json\|fetch.*analyze\|rows.*length" \
  web/src/app/operate/import/ web/src/components/import/ --include="*.tsx" | head -20

echo ""
echo "=== 8. CHECK THE FULL EXECUTE ROUTE FOR ROW PROCESSING ==="
wc -l web/src/app/api/import/sci/execute/route.ts
# Print the section that writes to committed_data
grep -n "committed_data\|insert\|bulk\|batch\|rows.*length\|\.length" \
  web/src/app/api/import/sci/execute/route.ts | head -30
```

### PHASE 0 DELIVERABLE

Write `HF-118_ARCHITECTURE_DECISION.md`:

```
ARCHITECTURE DECISION RECORD
============================
Problem: XLSX has 67 rows per sheet. committed_data has 50. 17 rows silently dropped.

TRUNCATION POINT FOUND:
- Where: [file:line]
- What: [hardcoded limit? slice? sample? batch size?]
- Why it exists: [performance? sample preview? legacy?]

EVIDENCE:
- [paste the line that limits rows]
- [paste the row count at each stage if visible in logs]

FIX:
- What: [remove limit / increase limit / make configurable]
- Where: [file:line]
- Scale test: Works for 2M rows? [if limit exists for performance, replace with chunking]
```

**Commit:** `git add -A && git commit -m "HF-118 Phase 0: Import truncation diagnostic — find where 67 becomes 50" && git push origin dev`

---

## PHASE 1: FIX THE TRUNCATION

Based on Phase 0 findings, remove or fix the row limit so all rows in the XLSX reach committed_data.

### Constraints

- **ALL rows must reach committed_data.** 67 rows in Plantilla → 67 rows in committed_data. 201 rows in Datos_Rendimiento → 201 rows in committed_data (or 67 for January if filtered by period).
- **Scale by Design:** If the limit exists for performance reasons, replace it with chunked processing, not a higher hardcoded limit. The solution must work for 10,000-row files.
- **No sample/preview limits on the execute path.** Sample rows for AI analysis (HC, classification) are fine — those only need 5-20 rows. But the EXECUTE path must commit ALL rows.
- **Datos_Flota_Hub already has 36/36** — it's not affected. The truncation likely applies per-sheet with a limit around 50.

### Proof Gates — Phase 1

- PG-1: Truncation point identified (paste the code that limits rows)
- PG-2: Fix applied (paste the change)
- PG-3: No hardcoded row limit on the execute path (grep for the old limit returns 0)
- PG-4: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-118 Phase 1: Remove import row truncation — all rows reach committed_data" && git push origin dev`

---

## PHASE 2: BUILD + PR

```bash
rm -rf .next
npm run build
npm run dev

gh pr create --base main --head dev \
  --title "HF-118: Fix import truncation — all XLSX rows reach committed_data" \
  --body "## What
Remove row limit that truncated XLSX imports to 50 rows per sheet.

## Why
Meridian XLSX has 67 employees in Plantilla and 201 rows in Datos_Rendimiento. Only 50 rows per sheet reached committed_data. 17 employees silently dropped. Root cause of 67→50 entity gap and MX\$193,156 vs MX\$185,063.

## Impact
All XLSX rows now committed. Entity resolution discovers all employees. Calculation covers full population."
```

### Post-Merge Steps (FOR ANDREW)

1. Merge PR
2. Nuclear clear Meridian data:
```sql
DELETE FROM calculation_traces WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM entity_period_outcomes WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM calculation_results WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM calculation_batches WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM classification_signals WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM import_batches WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM periods WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM synaptic_density WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```
3. Re-import plan PPTX + data XLSX
4. Verify committed_data counts:
```sql
SELECT data_type, count(*)
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
GROUP BY data_type;
```
Expected: plantilla=67, datos_rendimiento≥67 (maybe 201 for all Q1), datos_flota_hub=36

5. Verify entity count:
```sql
SELECT count(*) FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```
Expected: 67

6. Create period + activate plan, then calculate
7. Verify grand total = MX$185,063

### Proof Gates — Phase 2

- PG-5: `npm run build` exits 0 (paste output)
- PG-6: PR created (paste URL)
- PG-7: committed_data plantilla count = 67 (FOR ANDREW)
- PG-8: committed_data datos_rendimiento count ≥ 67 (FOR ANDREW)
- PG-9: Entity count = 67 (FOR ANDREW)
- PG-10: Grand total = MX$185,063 (FOR ANDREW)

**Commit:** `git add -A && git commit -m "HF-118 Phase 2: Build + PR" && git push origin dev`

---

## COMPLETION REPORT

Create file `HF-118_COMPLETION_REPORT.md` in PROJECT ROOT:

```markdown
# HF-118 COMPLETION REPORT
## Import Pipeline Truncation Fix

### Root Cause
[Where the truncation happens — file:line, what limit, why it existed]

### Commits
[list all phases]

### Files Changed
[list files]

### Hard Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-1: Truncation point found | | [paste the limiting code] |
| PG-2: Fix applied | | [paste the change] |
| PG-3: No hardcoded limit remains | | [paste grep result] |
| PG-4: Build exits 0 | | [paste] |
| PG-5: Final build exits 0 | | [paste] |
| PG-6: PR created | | [paste URL] |

### Post-Merge (FOR ANDREW)
| Gate | Status | Evidence |
|------|--------|----------|
| PG-7: plantilla = 67 | | |
| PG-8: datos_rendimiento ≥ 67 | | |
| PG-9: entities = 67 | | |
| PG-10: grand total = MX$185,063 | | |
```

**Commit:** `git add -A && git commit -m "HF-118 Completion Report" && git push origin dev`

---

## WHAT SUCCESS LOOKS LIKE

1. The truncation point is found and removed
2. ALL 67 Plantilla rows reach committed_data
3. ALL 201 Datos_Rendimiento rows reach committed_data (or at minimum, all 67 January rows)
4. Entity resolution creates 67 entities
5. Calculation produces MX$185,063

**"If the data doesn't make it to committed_data, nothing downstream matters. Fix the pipe first."**
