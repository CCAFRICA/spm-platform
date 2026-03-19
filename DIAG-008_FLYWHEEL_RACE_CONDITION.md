# DIAG-008: Flywheel Self-Correction Race Condition
## March 18, 2026

---

## READ FIRST — IN THIS ORDER

1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL rules including Section 0
2. `SCHEMA_REFERENCE_LIVE.md` — verify every column name before writing SQL or code
3. This prompt (read COMPLETELY before writing any code)

**STANDING RULE 29: No code changes until diagnostic identifies root cause with evidence.**
**This is a DIAGNOSTIC. Zero code changes. Zero fixes. Observation and evidence only.**

**CRITICAL: The `structural_fingerprints` table was created in OB-174 (after the March 7 schema generation). Before writing ANY SQL or code referencing this table, run:**
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'structural_fingerprints' ORDER BY ordinal_position;
```
**Paste the output. Use ONLY the columns that exist.**

---

## PROBLEM STATEMENT

The OB-177 flywheel self-correction (Phase 4) detects entity_id binding failures and decreases fingerprint confidence. However, production Vercel logs reveal the self-correction is unreliable due to race conditions between parallel workers and conflicting confidence updates between the classification step (process-job) and the commitment step (execute-bulk).

### Evidence from Production Logs (March 18, 2026)

**Issue 1: Batch 1 binding failures never decreased confidence.**
```
16:31:31.68 [OB-177] Entity binding failure: 0.0% for batch 5045d3b8
16:31:33.81 [OB-177] Entity binding failure: 0.0% for batch 30b60774
16:31:35.13 [OB-177] Entity binding failure: 0.0% for batch b7f4642a
```
Three binding failures logged. Zero confidence decrease messages. Either the decrease code didn't execute, or an error was swallowed silently.

**Issue 2: Parallel worker race condition on fingerprint update.**
```
16:39:28.538 [SCI-FINGERPRINT] Updated: hash=fbead6eed137 matchCount=12 confidence=0.9231
16:39:28.582 [SCI-FINGERPRINT] Updated: hash=fbead6eed137 matchCount=13 confidence=0.9286
16:39:28.585 [SCI-FINGERPRINT] Updated: hash=fbead6eed137 matchCount=12 confidence=0.9231
```
Three parallel workers updated the same fingerprint record within 47ms. matchCount went 12→13→12. Last writer wins. The matchCount is non-deterministic under parallel execution.

**Issue 3: Classification increases confidence AFTER binding failure detected.**
```
16:39:28.34  [OB-177] Entity binding failure: 0.0% for batch 43723338
16:39:28.538 [SCI-FINGERPRINT] Updated: matchCount=12 confidence=0.9231  ← INCREASED
16:39:28.893 [OB-177] Entity binding failure: 0.0% for batch 43723338   ← same batch again
16:39:29.019 [OB-177] Fingerprint confidence decreased: 0.9231 → 0.7231
```
The process-job handler increased confidence (Tier 1 match → bump matchCount). Then execute-bulk detected binding failure and decreased it. The two code paths are in different HTTP request handlers, operating on the same database row with no coordination.

**Issue 4: Same batch fires binding failure twice.**
Batch 43723338 appears at both 16:39:28.34 and 16:39:28.893. Either the check runs twice per batch, or there's a retry/duplicate execution.

---

## DIAGNOSTIC PHASES

### PHASE 0: TRACE THE CONFIDENCE UPDATE CODE PATHS

There are TWO code paths that modify fingerprint confidence. Find both.

**0A: Classification path (process-job handler)**
```bash
grep -n "confidence\|matchCount\|match_count\|SCI-FINGERPRINT" \
  web/src/app/api/import/sci/process-job/route.ts | head -30
```
Find the code that increases matchCount and confidence when a Tier 1 match is found.
**Paste the complete function or code block.**

**0B: Binding validation path (execute-bulk handler)**
```bash
grep -n "binding failure\|OB-177\|confidence.*decrease\|match_rate\|matchRate" \
  web/src/app/api/import/sci/execute-bulk/route.ts | head -30
```
Find the code that detects binding failure and decreases confidence.
**Paste the complete function or code block.**

**0C: Are there any other paths that modify fingerprint confidence?**
```bash
grep -rn "structural_fingerprints.*update\|\.update.*structural_fingerprints\|confidence" \
  web/src/app/api/import/ web/src/lib/sci/ --include="*.ts" | grep -v node_modules | head -20
```
**Paste the output.**

**Commit:** `DIAG-008 Phase 0: Confidence update code path trace`

---

### PHASE 1: ANALYZE THE RACE CONDITION

From Phase 0 code, answer these questions with evidence:

**1A: Does the classification path read-then-write or use atomic update?**
- Read-then-write: `SELECT confidence → compute new → UPDATE confidence` (race-prone)
- Atomic: `UPDATE SET confidence = confidence + X` (race-safe)
- Or: uses a transaction/lock?

**Paste the exact code showing the read/write pattern.**

**1B: Does the binding validation path read-then-write or use atomic update?**
Same question for the execute-bulk confidence decrease.
**Paste the exact code.**

**1C: Can both paths execute simultaneously for the same fingerprint?**
Process-job and execute-bulk are separate HTTP handlers. In the OB-174 async pipeline:
- process-job classifies (and bumps confidence)
- execute-bulk commits data (and checks binding)
- Are these sequential within one file's processing, or can they overlap across parallel workers?

**Paste the code that orchestrates process-job → execute-bulk for a single file.**

**1D: Why does Batch 1 (16:31) show no confidence decrease?**
Three binding failures logged but zero decrease messages. Either:
- The decrease code was added in OB-177 but Batch 1 ran on pre-OB-177 code (deployment timing)
- The decrease code has a conditional that prevented execution
- The decrease code threw an error that was caught silently

**Check: was OB-177 (PR #269) deployed before 16:31?**
```bash
# Check git log for merge time
git log --oneline --format="%H %ai %s" | grep "OB-177\|269" | head -5
```

**Commit:** `DIAG-008 Phase 1: Race condition analysis`

---

### PHASE 2: QUERY THE CURRENT FINGERPRINT STATE

**2A: Current state of BCL fingerprint**
```sql
-- FIRST: verify the table columns
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'structural_fingerprints' ORDER BY ordinal_position;
```
**Paste the output. Then use ONLY those columns in subsequent queries.**

**2B: Query the BCL fingerprint record** (use column names from 2A)
Query for fingerprint hash `fbead6eed137` or tenant `b1c2d3e4-aaaa-bbbb-cccc-111111111111`.
Show all columns. **Paste the complete row.**

Key questions from the data:
- What is the current confidence?
- What is the current matchCount?
- Is there a `needs_reclass` flag or equivalent?
- What is the cached entity_identifier field classification?
- Will the next import trigger Tier 2 re-classification based on the current state?

**Commit:** `DIAG-008 Phase 2: Current fingerprint state query`

---

### PHASE 3: DETERMINE IF SELF-CORRECTION WILL ACTUALLY TRIGGER

Based on Phases 0-2, answer:

**3A: On the next import of a file with hash fbead6eed137, what happens?**
Trace the process-job code path step by step:
1. Fingerprint hash matches → Tier 1 candidate
2. What confidence threshold determines Tier 1 vs Tier 2?
3. Does the current confidence (from 2B) clear or fail that threshold?
4. If Tier 1: matchCount increases, confidence increases → self-correction is defeated
5. If Tier 2: re-classification runs → self-correction works

**3B: Is there a mechanism to prevent the classification path from bumping confidence when binding failures have been detected?**
Or does the classification path always bump confidence on a Tier 1 hash match regardless of prior binding failures?

**3C: Proposed fix direction (DO NOT IMPLEMENT)**
Based on the findings, what architectural change would make self-correction reliable? Options include:
- Atomic confidence updates (prevent race condition)
- Binding failure flag that classification path respects
- Confidence decrease happens in process-job, not execute-bulk (single code path)
- Sequential processing (no parallel workers for same fingerprint)

State the recommended approach with reasoning. **Do not implement.**

**Commit:** `DIAG-008 Phase 3: Self-correction effectiveness determination`

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `DIAG-008_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## COMPLETION REPORT TEMPLATE

```markdown
# DIAG-008 COMPLETION REPORT
## Date: [DATE]

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| | Phase 0 | Confidence update code path trace |
| | Phase 1 | Race condition analysis |
| | Phase 2 | Current fingerprint state query |
| | Phase 3 | Self-correction effectiveness determination |

## DIAGNOSTIC FINDINGS

### Phase 0: Two Confidence Update Paths
[Paste both code blocks — classification path AND binding validation path]

### Phase 1: Race Condition Analysis
1A: [Read-then-write or atomic? Paste code]
1B: [Read-then-write or atomic? Paste code]
1C: [Can they overlap? Paste orchestration code]
1D: [Why no decrease for Batch 1? Paste evidence]

### Phase 2: Current Fingerprint State
2A: [Paste column listing from information_schema]
2B: [Paste complete fingerprint row]

### Phase 3: Self-Correction Effectiveness
3A: [Step-by-step trace of next import behavior]
3B: [Is there a binding-failure flag the classification path respects?]
3C: [Recommended fix direction — NOT IMPLEMENTED]

## STANDING RULE COMPLIANCE
- Rule 29 (no code changes until diagnostic): PASS/FAIL — zero source files modified
```

---

## PR COMMAND

After all phases committed:
```bash
gh pr create --base main --head dev --title "DIAG-008: Flywheel Self-Correction Race Condition" --body "## Diagnostic Only — Zero Code Changes\n\nTraces the two competing confidence update paths (classification vs binding validation) to determine why self-correction is unreliable under parallel worker execution.\n\nSee DIAG-008_COMPLETION_REPORT.md for findings."
```

---

## WHAT THIS DIAGNOSTIC DOES NOT DO

- Does NOT fix the race condition
- Does NOT modify any source code (Standing Rule 29)
- Does NOT change the fingerprint table, the confidence formula, or the parallel worker orchestration
- Does NOT bundle a fix with the diagnostic (Standing Rule 30)

The fix will be a separate HF prompt drafted AFTER the diagnostic results are reviewed by Andrew.
