# OB-174: ASYNC INGESTION ARCHITECTURE + STRUCTURAL FINGERPRINTING
## Implementation of DS-016 (Async Ingestion) and DS-017 (Progressive Immunity)

**Date:** March 17, 2026
**Type:** Objective Build
**Sequence:** OB-174
**Governing Specifications:** DS-016 (Async Ingestion Architecture), DS-017 (Structural Fingerprinting and Progressive Immunity), DS-013 (Platform Experience Architecture)
**Governing Principles:** Decision 123 (Transparent Architectural Compliance), Decision 124 (Research-Derived Design)
**Standing Rules:** CC_STANDING_ARCHITECTURE_RULES.md v3.0 — read in entirety before proceeding.

---

## STANDING RULES ACTIVE

All rules from CC_STANDING_ARCHITECTURE_RULES.md v3.0 apply. Read that file first.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### ADDITIONAL RULES
- Standing Rule 2: Scale by Design. 150K Test on all architecture.
- Standing Rule 30: One root cause per phase.
- Standing Rule 34: No bypass recommendations. No workarounds.
- Korean Test on all code. Structural fingerprints are domain-agnostic.
- Supabase .in() ≤ 200 items.
- Git from repo root (spm-platform), NOT web/.

---

## WHAT THIS OB DELIVERS

The current import pipeline is synchronous: N files × 12s LLM call = linear timeout. It fails at 6 files (72s exceeds Vercel timeout). It cannot serve production workloads (52 weekly files, 250K row files, millions of records).

This OB replaces the synchronous pipeline with:
1. **Async job queue** — files upload instantly, processing happens in background workers
2. **Structural fingerprinting** — known file structures skip LLM entirely (~100ms vs ~12s)
3. **Nanobatch commitment** — large files committed in 1K-5K row chunks, resumable
4. **Progressive import dashboard** — user sees per-file status updates in real time

**Scale targets:** 6 files < 15s. 52 files < 60s. 250K rows < 120s. Second import of known structure < 1s total regardless of file count.

---

## READ THESE DOCUMENTS BEFORE PROCEEDING

1. `DS-016_017_Ingestion_Architecture.docx` — the governing specification (in project knowledge)
2. `CC_STANDING_ARCHITECTURE_RULES.md` — at repo root
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — SCI architecture (in project knowledge)
4. `SCHEMA_REFERENCE_LIVE.md` — authoritative schema (in project knowledge)

---

## ARCHITECTURE DECISION GATE (MANDATORY)

Complete BEFORE writing any implementation code. Commit to git.

```
ARCHITECTURE DECISION RECORD — OB-174
======================================
Problem: Synchronous import pipeline fails at N>4 files. Cannot scale to 
         production workloads (52 weekly files, 250K rows, millions of records).

Approach: DS-016 async architecture + DS-017 structural fingerprinting.
         6-phase implementation.

Worker Trigger Decision (DS-016 §5 — choose one):
  Option A: Database trigger + Supabase Edge Function
    - Scale test: ___
    - Complexity: ___
    - Latency: ___
  Option B: Vercel Cron polling (5-10s interval)
    - Scale test: ___
    - Complexity: ___
    - Latency: ___
  Option C: Client-initiated parallel processing calls
    - Scale test: ___
    - Complexity: ___
    - Latency: ___
  CHOSEN: Option ___ because ___
  REJECTED: Options ___ because ___

G1 (Standards): [identify applicable standards]
G2 (Embodiment): [how architecture guarantees compliance]
G3 (Traceability): [standard → architecture → implementation mapping]
G4 (Discipline): Distributed systems (producer-consumer), immunology (affinity maturation), stream processing (nanobatching)
G5 (Abstraction): All patterns domain-agnostic — work for any data, any domain
G6 (Evidence): Cited in DS-016/017 research foundation

CONSTRAINTS:
- DO NOT modify calculation engine, convergence bindings, or any API that produces correct results
- Korean Test: all new tables, columns, and identifiers are domain-agnostic
- Supabase .in() ≤ 200 items
- Git from repo root (spm-platform), NOT web/
- VL Admin (platform@vialuce.com, tenant_id IS NULL) must survive ALL operations
```

**DO NOT proceed to Phase 1 until this is committed.**

---

## PHASE 1: PROCESSING_JOBS TABLE + MIGRATION

Create the job queue table as specified in DS-016 §4.

### Mission 1.1: Supabase migration
Create `processing_jobs` table with all columns from DS-016 §4:
- id, tenant_id, status, file_storage_path, file_name, structural_fingerprint, classification_result, recognition_tier, chunk_progress, error_detail, retry_count, created_at, started_at, completed_at, uploaded_by
- RLS policy: tenant isolation (same pattern as committed_data)
- Indexes: tenant_id, status (for worker polling), structural_fingerprint (for flywheel lookup)

### Mission 1.2: Execute migration live
Run the migration against Supabase. Verify with:
```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'processing_jobs' 
ORDER BY ordinal_position;
```
Paste full output.

### Hard Proof Gates — Phase 1
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-1-1 | processing_jobs table exists with all DS-016 columns | Paste information_schema query output |
| HG-1-2 | RLS policy active on processing_jobs | Paste policy query output |
| HG-1-3 | Indexes exist on tenant_id, status, structural_fingerprint | Paste index query output |

### Commit
`git add -A && git commit -m "OB-174 Phase 1: processing_jobs table + migration"`

---

## PHASE 2: STRUCTURAL FINGERPRINT COMPUTATION

Implement the fingerprint algorithm from DS-017 §2.

### Mission 2.1: Create fingerprint utility
Create a utility function `computeStructuralFingerprint(parsedData)` that:
- Takes parsed file data (columns, sample rows, detected types)
- Computes: column count, sorted column names (lowercased), sorted column data types, structural ratios (identifierRepeatRatio, numericFieldRatio rounded to 1 decimal)
- Returns SHA-256 hash of the composite string
- This function must be FAST — operates on header + sample, not full file
- Korean Test: no domain-specific logic. Works for any columns in any language.

### Mission 2.2: Fingerprint storage schema in flywheel
Create a `structural_fingerprints` table (or extend existing flywheel tables) to store:
- fingerprint (text, indexed)
- tenant_id (uuid, nullable — NULL for foundational/F2 patterns)
- classification_result (jsonb — full classification trace)
- column_roles (jsonb — per-column role mapping)
- match_count (integer — how many times this fingerprint has been matched)
- confidence (numeric — increases with each successful match)
- created_at, updated_at

### Hard Proof Gates — Phase 2
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-2-1 | computeStructuralFingerprint produces identical fingerprint for two files with same structure but different data | Paste test output showing two BCL monthly files produce same fingerprint |
| HG-2-2 | computeStructuralFingerprint produces different fingerprint for files with different structures | Paste test output showing BCL datos vs personal produce different fingerprints |
| HG-2-3 | structural_fingerprints table exists with all columns | Paste schema query |
| HG-2-4 | Fingerprint computation completes in < 10ms for 85 rows | Paste timing output |
| HG-2-5 | Fingerprint computation completes in < 10ms for 1000 rows (sample-based, not full scan) | Paste timing output |

### Commit
`git add -A && git commit -m "OB-174 Phase 2: Structural fingerprint computation + storage"`

---

## PHASE 3: FLYWHEEL READ PATH + TIER ROUTING

Implement DS-017 §3 (Three Tiers of Recognition) and §4.2 (Read Path).

### Mission 3.1: Flywheel lookup before LLM
In the SCI classification pipeline, BEFORE calling the LLM for header comprehension:
1. Compute the structural fingerprint of the new file
2. Query `structural_fingerprints` WHERE fingerprint = computed AND tenant_id = current tenant (Tier 1 check)
3. If match found: skip LLM, apply stored classification_result and column_roles, set recognition_tier = 1
4. If no tenant match: query WHERE fingerprint structural_similarity > threshold AND tenant_id IS NULL (Tier 2 check — foundational flywheel)
5. If F2 match found: use targeted LLM prompt (column role mapping only, not full comprehension), set recognition_tier = 2
6. If no match at any level: full LLM classification (existing path), set recognition_tier = 3

### Mission 3.2: Flywheel write after classification
After every successful classification (any tier):
- Upsert into structural_fingerprints: fingerprint, tenant_id, classification_result, column_roles
- Increment match_count
- Update confidence (Bayesian update: each successful match increases confidence)

### Mission 3.3: Logging
Add log lines that DS-017 can use as evidence:
```
[SCI-FINGERPRINT] file={fileName} fingerprint={hash} tier={1|2|3} match={true|false} confidence={N}
[SCI-FINGERPRINT] LLM skipped — Tier 1 match from {match_count} prior imports
[SCI-FINGERPRINT] LLM called — Tier 3 novel structure, fingerprint stored for future recognition
```

### Hard Proof Gates — Phase 3
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-3-1 | Second import of same file structure skips LLM (Tier 1) | Paste Vercel logs showing [SCI-FINGERPRINT] tier=1 LLM skipped |
| HG-3-2 | First import of novel structure calls LLM (Tier 3) | Paste Vercel logs showing [SCI-FINGERPRINT] tier=3 |
| HG-3-3 | Confidence increases after Tier 1 match | Paste structural_fingerprints query showing match_count > 1 and confidence > initial |
| HG-3-4 | Fingerprint stored after Tier 3 classification | Paste structural_fingerprints query showing new record |

### Commit
`git add -A && git commit -m "OB-174 Phase 3: Flywheel read path + tier routing"`

---

## PHASE 4: ASYNC UPLOAD LAYER REFACTOR

Implement DS-016 §3.1 (Upload Layer).

### Mission 4.1: Refactor import page
Replace the current synchronous analyze call with:
1. Files upload to Supabase Storage (existing, keep as-is)
2. For each uploaded file, create a `processing_jobs` record with status 'pending'
3. Return job IDs to the client immediately
4. Client transitions to the import progress dashboard (new component)

### Mission 4.2: Worker invocation
Implement the chosen worker trigger mechanism (from Architecture Decision Gate):
- Each pending job triggers a worker function
- Worker: downloads file → computes fingerprint → checks flywheel → classifies (Tier 1/2/3) → updates job to 'classified'
- Workers run in parallel — each is an independent serverless invocation

### Mission 4.3: Import progress dashboard
Create a progress component that:
- Polls processing_jobs for the current import session (or uses Supabase Realtime)
- Shows per-file status: pending → classifying → classified → confirming → committing → committed
- Shows recognition tier for each file (Tier 1 = "Recognized instantly", Tier 2 = "Similar structure found", Tier 3 = "New structure — classifying...")
- Classification proposals appear as each file completes, not all at once

### Hard Proof Gates — Phase 4
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-4-1 | Uploading 3 files creates 3 processing_jobs records with status 'pending' | Paste DB query showing 3 records |
| HG-4-2 | Browser connection ends after upload (no synchronous classification) | Paste network tab showing upload response time < 5s |
| HG-4-3 | Workers process files in parallel (overlap in started_at timestamps) | Paste processing_jobs showing started_at within 1s of each other |
| HG-4-4 | Progress dashboard shows per-file status updating | Paste DOM or screenshot showing status transitions |
| HG-4-5 | Each file shows recognition tier | Paste dashboard showing Tier 1/2/3 labels |

### Commit
`git add -A && git commit -m "OB-174 Phase 4: Async upload layer + worker invocation + progress dashboard"`

---

## PHASE 5: NANOBATCH COMMITMENT

Implement DS-016 §3.4 (Commitment Layer).

### Mission 5.1: Chunk commit logic
When a confirmed file transitions to 'committing':
- Split rows into chunks of 2,000 rows each
- Each chunk: INSERT into committed_data with correct entity_id, source_date, batch_id
- Update chunk_progress on the job record after each chunk: {total_rows, committed_rows, chunks_completed}
- If a chunk fails: log error, retry up to 3 times, skip permanently failed chunks to dead-letter
- Source_date extracted per-row from each row's temporal column (Decision 92)

### Mission 5.2: Large file test
Create a test with a 10,000+ row file (can be synthetic — duplicate BCL data rows to create volume). Verify:
- File is chunked into multiple batches
- Progress updates incrementally
- All rows committed with correct source_dates

### Hard Proof Gates — Phase 5
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-5-1 | File with > 2000 rows is chunked into multiple commits | Paste chunk_progress JSON showing multiple chunks |
| HG-5-2 | Each chunk committed independently (partial failure doesn't lose committed chunks) | Describe test or paste evidence |
| HG-5-3 | Progress dashboard shows row count updating incrementally | Paste DOM or log showing progressive updates |
| HG-5-4 | Source_date correct per-row across all chunks | Paste committed_data query showing correct dates across chunk boundaries |

### Commit
`git add -A && git commit -m "OB-174 Phase 5: Nanobatch commitment with chunked progress"`

---

## PHASE 6: END-TO-END VERIFICATION — BCL 6-MONTH PROOF

**This phase does NOT write code. It verifies the complete pipeline in production.**

### Mission 6.1: Clean slate
Delete all BCL transactional committed_data (preserve personal):
```sql
DELETE FROM committed_data 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND source_date IS NOT NULL;
```
Delete all BCL calculation results:
```sql
DELETE FROM entity_period_outcomes WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM calculation_results WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM calculation_batches WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

### Mission 6.2: Upload all 6 files simultaneously
Upload Oct, Nov, Dec, Jan, Feb, Mar files in one multi-file upload.

**Expected behavior:**
- Upload completes in < 5s (files to storage + job records)
- File 1 classified via Tier 3 (novel — first import through new pipeline): ~12s
- Files 2-6 classified via Tier 1 (fingerprint match): < 1s each
- Total classification time: ~15s (not 72s)
- Progress dashboard shows per-file status updating progressively
- All 6 proposals appear for confirmation

### Mission 6.3: Confirm and commit
Confirm all 6 files. Commitment proceeds via nanobatch (if files are small, single chunk per file is fine).

### Mission 6.4: Verify data
```sql
SELECT date_trunc('month', source_date)::date AS month, count(*) AS rows
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND source_date IS NOT NULL
GROUP BY 1 ORDER BY 1;
```
**Expected:** 6 months, 85 rows each, distinct source_dates.

### Mission 6.5: Calculate all 6 months
| Period | GT |
|---|---|
| October 2025 | $44,590 |
| November 2025 | $46,291 |
| December 2025 | $61,986 |
| January 2026 | $47,545 |
| February 2026 | $53,215 |
| March 2026 | $58,406 |
| **TOTAL** | **$312,033** |

**Every month must be exact. 100% reconciliation is the only gate (Decision 95).**

### Mission 6.6: Verify flywheel
```sql
SELECT fingerprint, match_count, confidence, recognition_tier
FROM structural_fingerprints
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```
**Expected:** One fingerprint with match_count >= 5, confidence > 95%.

### Hard Proof Gates — Phase 6
| # | Criterion | Evidence |
|---|-----------|----------|
| HG-6-1 | 6 files uploaded simultaneously without timeout | Paste upload response time |
| HG-6-2 | Files 2-6 classified as Tier 1 (fingerprint match) | Paste Vercel logs showing [SCI-FINGERPRINT] tier=1 for 5 files |
| HG-6-3 | 6 months × 85 rows = 510 rows with correct source_dates | Paste SQL query output |
| HG-6-4 | Oct = $44,590 | Paste calculation log: Grand total: 44590 |
| HG-6-5 | Nov = $46,291 | Paste calculation log: Grand total: 46291 |
| HG-6-6 | Dec = $61,986 | Paste calculation log: Grand total: 61986 |
| HG-6-7 | Jan = $47,545 | Paste calculation log: Grand total: 47545 |
| HG-6-8 | Feb = $53,215 | Paste calculation log: Grand total: 53215 |
| HG-6-9 | Mar = $58,406 | Paste calculation log: Grand total: 58406 |
| HG-6-10 | Total = $312,033 | Sum of above |
| HG-6-11 | Flywheel shows match_count >= 5, confidence > 95% | Paste structural_fingerprints query |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-174_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### Completion Report Structure (Rule 26 — MANDATORY)

```markdown
# OB-174 COMPLETION REPORT
## Date: [date]
## Execution Time: [start] to [end]

## ARCHITECTURE DECISION
[Paste the completed Architecture Decision Record]

## COMMITS (in order)
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
[All 30 proof gates from Phases 1-6]

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS/FAIL
- Rule 2 (Scale by Design): PASS/FAIL
- Rule 25 (report BEFORE final build): PASS/FAIL
- Rule 26 (mandatory structure): PASS
- Rule 27 (evidence = paste): PASS/FAIL
- Rule 28 (one commit per phase): PASS/FAIL
- Rule 30 (one root cause per phase): PASS/FAIL
- Rule 34 (no bypass): PASS/FAIL

## KNOWN ISSUES
- [anything discovered]

## BUILD OUTPUT
[paste last 10 lines of npm run build]
```

### Workflow (Rule 25)
1. Execute Phase 1 — commit
2. Execute Phase 2 — commit
3. Execute Phase 3 — commit
4. Execute Phase 4 — commit
5. Execute Phase 5 — commit
6. Execute Phase 6 — production verification (Andrew)
7. **CREATE `OB-174_COMPLETION_REPORT.md` in project root with all evidence from Phases 1-5**
8. `git add -A && git commit -m "OB-174: Completion report (Phase 6 pending Andrew verification)"`
9. Kill dev server → `rm -rf .next` → `npm run build`
10. **APPEND build output to completion report**
11. `git add -A && git commit -m "OB-174: Build verification appended"`
12. `git push origin dev`
13. `gh pr create --base main --head dev --title "OB-174: Async Ingestion + Structural Fingerprinting (DS-016/017)" --body "Replaces synchronous import pipeline with async job queue, structural fingerprinting for instant recognition of known file structures, nanobatch commitment for large files, progressive import dashboard. Scale: 6 files <15s, 52 files <60s, 250K rows <120s. Second import of known structure <1s. Completion report: OB-174_COMPLETION_REPORT.md"`

---

## BROWSER TEST (Andrew — after merge)

### Test 1: 6-file simultaneous upload
Upload Oct/Nov/Dec/Jan/Feb/Mar BCL files simultaneously.
- Upload completes instantly (< 5s)
- Progress dashboard shows 6 files processing
- Files 2-6 show "Recognized instantly" (Tier 1)
- All 6 proposals appear for confirmation
- Confirm all → commit
- Calculate each month → all 6 exact → $312,033 total

### Test 2: Re-import one month
Upload BCL_Datos_Oct2025.xlsx again (single file).
- Classified instantly as Tier 1
- Confidence shows > 95%
- LLM not called (verify in Vercel logs: no SCI Header comprehension log)

### Test 3: Verify regression
- October still $44,590
- Meridian still MX$185,063 (if recalculated)
- No cross-tenant data leaks

---

## WHAT THIS OB DOES NOT ADDRESS

| Item | Reason | When |
|---|---|---|
| HF-141 (third-file source_date) | Superseded by DS-016 async architecture — per-file isolation is structural | Verified in Phase 6 |
| Tier 2 cross-tenant structural analogy | Requires multi-tenant data to test | After second tenant onboards |
| API/SFTP automated ingestion | Future DS — manual upload must work first | After DS-016/017 proven |
| Entity-to-user linking | Separate OB | After ingestion architecture proven |
| Manager/rep persona | Separate OB | After entity linking |

---

## ANTI-PATTERN AWARENESS

| Pattern | Risk | Mitigation |
|---|---|---|
| FP-70 (no completion report) | 4 consecutive misses in prior session | Enforcement block with file creation + git commit |
| FP-73 (backend exists, frontend broken) | Job queue exists but no dashboard | Phase 4 includes progress dashboard |
| FP-74 (fix unreachable) | Fingerprinting works but never queried | Phase 3 implements read path explicitly |
| FP-78 (bundled fixes) | 6 phases could blur | Each phase has its own commit and proof gates |

---

*"New files are logically expensive. The second file is free."*
*DS-016 makes the pipeline async. DS-017 makes the intelligence instant.*
