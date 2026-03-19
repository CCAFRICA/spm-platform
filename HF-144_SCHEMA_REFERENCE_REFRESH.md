# HF-144: Schema Reference Refresh
## March 18, 2026

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. The current `SCHEMA_REFERENCE_LIVE.md` in project root — understand the exact format
3. This prompt

---

## PROBLEM

`SCHEMA_REFERENCE_LIVE.md` was generated March 7, 2026 from the live Supabase OpenAPI spec. Since then, at least two tables have been added to production via migrations:
- `structural_fingerprints` (OB-174, PR #260)
- `processing_jobs` (OB-174, PR #260)

The schema reference currently lists 34 tables. The live database has more. Every CC prompt that says "verify against SCHEMA_REFERENCE_LIVE.md" is verifying against a stale document. This has directly caused errors — both by CC (schema fabrication, FP-49/FP-82) and by Claude (fabricating `convergence_bindings` table in a CLT).

**This is a blocking issue.** DIAG-008 and all future OBs depend on an accurate schema reference.

---

## WHAT TO DO

### Phase 1: Query the live schema

Connect to the production Supabase instance. Query ALL public tables and their columns:

```sql
SELECT 
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.tables t
JOIN information_schema.columns c 
  ON t.table_name = c.table_name 
  AND t.table_schema = c.table_schema
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;
```

**Paste the COMPLETE output.**

### Phase 2: Generate SCHEMA_REFERENCE_LIVE.md

Using the query output from Phase 1, regenerate `SCHEMA_REFERENCE_LIVE.md` in the EXACT same format as the current file:

```markdown
# Live Schema Reference

*Generated: 2026-03-18*

*Source: Supabase live database (information_schema)*

## Tables (N)

### table_name

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| column_name | data_type | YES/NO | default_value |
```

**Format requirements:**
- One `### table_name` section per table, alphabetically ordered
- One row per column in ordinal position order
- Nullable: "YES" or "NO" (from is_nullable)
- Default: show the default value, or empty if none
- Table count in the `## Tables (N)` header must be accurate
- No commentary, no annotations — just the schema

### Phase 3: Diff report

After generating the new file, produce a brief diff summary:

```markdown
## CHANGES FROM MARCH 7 GENERATION

### New Tables
- table_name_1 (N columns) — added by [PR/OB if known]
- table_name_2 (N columns) — added by [PR/OB if known]

### Removed Tables
- (list any that no longer exist)

### Modified Tables (new columns added)
- table_name: +column_name (type)

### Column Changes
- table_name.column_name: type changed from X to Y
```

This diff goes in the completion report, NOT in the schema reference file itself.

### Phase 4: Commit and PR

```bash
git add SCHEMA_REFERENCE_LIVE.md
git commit -m "HF-144: Schema Reference Refresh — regenerated from live database March 18, 2026"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-144: Schema Reference Refresh" \
  --body "## Schema Reference Regenerated\n\nRegenerated SCHEMA_REFERENCE_LIVE.md from live Supabase database.\n\nPrevious: March 7, 2026 (34 tables)\nCurrent: March 18, 2026 (N tables)\n\nSee HF-144_COMPLETION_REPORT.md for diff summary."
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-144_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch

---

## COMPLETION REPORT TEMPLATE

```markdown
# HF-144 COMPLETION REPORT
## Date: [DATE]

## COMMITS
| Hash | Description |
|------|-------------|
| | Schema reference regenerated from live database |

## PROOF GATES
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | information_schema query executed against production | | [paste row count] |
| 2 | New SCHEMA_REFERENCE_LIVE.md has correct table count | | [paste table count] |
| 3 | structural_fingerprints table present with all columns | | [paste column list] |
| 4 | processing_jobs table present with all columns | | [paste column list] |
| 5 | All 34 original tables still present | | [paste confirmation] |
| 6 | Format matches original (### headers, pipe tables, alphabetical) | | PASS/FAIL |

## DIFF SUMMARY
[Paste the diff report from Phase 3]

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push): PASS/FAIL
```

---

## WHAT THIS HF DOES NOT DO

- Does not modify any application code
- Does not change any database tables
- Does not add or remove columns
- Only regenerates the documentation file from the live source of truth
