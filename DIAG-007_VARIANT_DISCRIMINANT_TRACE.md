# DIAG-007: Variant Discriminant Routing Failure — BCL Senior Entities
## March 18, 2026

---

## READ FIRST — IN THIS ORDER

1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL rules including Section 0
2. `SCHEMA_REFERENCE_LIVE.md` — verify every column name before writing SQL or code
3. This prompt (read COMPLETELY before writing any code)

**STANDING RULE 29: No code changes until diagnostic identifies root cause with evidence.**
**STANDING RULE 35: EPG script required for verification.**
**This is a DIAGNOSTIC. Zero code changes. Zero fixes. Observation and evidence only.**

---

## PROBLEM STATEMENT

After a clean slate (all pipeline data deleted) and reimport of 3 BCL datos files (Oct/Nov/Dec transaction data) through the async pipeline, ALL 85 entities route to variant_1 (Standard/Ejecutivo). Zero entities route to variant_0 (Senior).

The engine log shows:
```
HF-119 Variant discriminants: V0=[senior] V1=[]
Adriana Reyes Molina: disc=[V0:0,V1:0] → variant_1 (default_last)
```

The plan correctly defines V0=[senior]. The discriminant system correctly reads the token. But it scores V0:0 for every entity — including the 13 who are Ejecutivo Senior.

**Before the clean slate**, with stale committed_data from a previous import cycle present, the same entities routed correctly:
```
Adriana Reyes Molina: disc=[V0:1,V1:0] → variant_0 (discriminant_token)
```

**Impact:** October produces $41,814 instead of GT $44,590 (delta $2,776 = exactly the Senior→Standard rate difference across 13 entities × 4 components). November produces $43,094 instead of GT $46,291 (delta $3,197, same pattern). Both deltas mathematically proven.

**Historical context:** This is the same class of bug as the Optical variant misselection (AI_ML_Architecture_Briefing.docx) where isCertified was not set on employee context and all entities fell through to variants[0]. The pattern: discriminant token not found → silent fallback to default variant → wrong rates applied → wrong totals.

---

## WHAT THE CLEAN SLATE DELETED

```sql
-- These tables were emptied for BCL tenant:
-- entity_period_outcomes, calculation_traces, calculation_results, approval_requests
-- calculation_batches, committed_data, processing_jobs, import_batches
-- classification_signals, ingestion_events, agent_inbox, synaptic_density
-- reconciliation_sessions, disputes, usage_metering, user_journey
-- platform_events, audit_logs
```

**These tables were NOT deleted (preserved):**
- `entities` — 85 BCL entities (13 Senior, 72 Ejecutivo)
- `periods` — 6 periods (Oct 2025 – Mar 2026)
- `rule_sets` — BCL commission plan with population_config defining V0=[senior], V1=[]
- `rule_set_assignments` — entity-to-plan bindings
- `tenants`, `profiles` — BCL tenant and Patricia admin account
- `structural_fingerprints` — flywheel state

---

## DIAGNOSTIC PHASES

### PHASE 0: TRACE THE DISCRIMINANT MATCHING CODE

Find the code that evaluates variant discriminants at calculation time. The log tag is `[VARIANT]` and `HF-119`.

```bash
# Find the variant discriminant matching code
grep -rn "discriminant\|VARIANT\|HF-119\|disc=\[" web/src/lib/ web/src/app/api/calculate/ --include="*.ts" | head -30
```

**Paste the FULL output.**

Then read the function that:
1. Takes an entity
2. Takes the plan's population_config.variants (with discriminant tokens)
3. Returns which variant the entity matches

**Paste the COMPLETE function** — every line, not a summary.

**Commit:** `DIAG-007 Phase 0: Variant discriminant code trace`

---

### PHASE 1: IDENTIFY THE DATA SOURCE FOR DISCRIMINANT MATCHING

From the code found in Phase 0, determine exactly what data source the discriminant matcher reads. Specifically:

1. Does it read from `entities.metadata`?
2. Does it read from `entities.temporal_attributes`?
3. Does it read from `committed_data.row_data`?
4. Does it read from `import_batches.metadata` (the AI context)?
5. Does it combine multiple sources?

For each data source it accesses, paste the exact code line showing the query or field access.

**Commit:** `DIAG-007 Phase 1: Discriminant data source identification`

---

### PHASE 2: QUERY THE CURRENT DATA STATE

Run these queries against the LIVE production database and **paste the complete output**.

**2A: Entity metadata for a known Senior entity (BCL-5001 = Adriana Reyes Molina)**
```sql
SELECT external_id, display_name, entity_type, 
       temporal_attributes, metadata
FROM entities
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND external_id = 'BCL-5001';
```

**2B: Entity metadata for a known Standard entity (BCL-5012 = Valentina Salazar)**
```sql
SELECT external_id, display_name, entity_type,
       temporal_attributes, metadata
FROM entities
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND external_id = 'BCL-5012';
```

**2C: Committed data for BCL-5001 (Adriana) — what fields exist?**
```sql
SELECT id, data_type, source_date,
       jsonb_object_keys(row_data) as field
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND entity_id = (
  SELECT id FROM entities 
  WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' 
  AND external_id = 'BCL-5001'
)
LIMIT 20;
```

**2D: Plan population_config — what are the exact variant definitions?**
```sql
SELECT population_config
FROM rule_sets
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND status = 'active';
```

**2E: Are there ANY committed_data rows with data_type containing 'roster', 'plantilla', 'personnel', or 'employee'?**
```sql
SELECT DISTINCT data_type
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

**Commit:** `DIAG-007 Phase 2: Production data state queries`

---

### PHASE 3: ROOT CAUSE DETERMINATION

Based on Phases 0-2, answer these questions with evidence (pasted code + pasted query output):

1. **Where does the discriminant matcher look for the "senior" token?**
   - Cite the exact code line and data source.

2. **Is the "senior" token present in that data source for BCL-5001?**
   - Cite the query result from Phase 2.

3. **Was the "senior" token present before the clean slate?**
   - If the matcher reads from committed_data: the clean slate deleted it. Root cause = discriminant depends on committed_data that no longer exists.
   - If the matcher reads from entities.metadata: the clean slate preserved it. Root cause = something else.

4. **What is the architectural fix?**
   - Option A: Discriminant reads from entities table (durable — survives clean slate)
   - Option B: Discriminant reads from committed_data but roster import is required (fragile — depends on import order)
   - Option C: Other (specify)
   
   **Do NOT implement the fix.** State the recommended option with reasoning.

**Commit:** `DIAG-007 Phase 3: Root cause determination and recommended fix`

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `DIAG-007_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## COMPLETION REPORT TEMPLATE

```markdown
# DIAG-007 COMPLETION REPORT
## Date: [DATE]

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| | Phase 0 | Variant discriminant code trace |
| | Phase 1 | Discriminant data source identification |
| | Phase 2 | Production data state queries |
| | Phase 3 | Root cause determination |

## DIAGNOSTIC FINDINGS

### Phase 0: Discriminant Code Location
[Paste the grep output AND the complete discriminant matching function]

### Phase 1: Data Source
[State which data source(s) the discriminant reads, with code line citations]

### Phase 2: Data State
[Paste ALL query outputs from 2A through 2E]

### Phase 3: Root Cause
[Answer questions 1-4 with evidence]

## RECOMMENDED FIX
[Option A, B, or C with reasoning — DO NOT IMPLEMENT]

## STANDING RULE COMPLIANCE
- Rule 29 (no code changes until diagnostic): PASS/FAIL — zero source files modified
- Rule 35 (EPG): N/A — diagnostic only, no formula changes
```

---

## WHAT THIS DIAGNOSTIC DOES NOT DO

- Does NOT fix the variant routing
- Does NOT modify any source code (Standing Rule 29)
- Does NOT change the engine, the import pipeline, or the entities table
- Does NOT bundle a fix with the diagnostic (Standing Rule 30)

The fix will be a separate HF prompt drafted AFTER the diagnostic results are reviewed by Andrew.

---

## PR COMMAND

After all phases committed:
```bash
gh pr create --base main --head dev --title "DIAG-007: Variant Discriminant Routing Failure — BCL Senior Entities" --body "## Diagnostic Only — Zero Code Changes\n\nTraces the variant discriminant matching code path to determine why all 13 Senior entities route to Standard after clean slate + reimport.\n\nSee DIAG-007_COMPLETION_REPORT.md for findings."
```
