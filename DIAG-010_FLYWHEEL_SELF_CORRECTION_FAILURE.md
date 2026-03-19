# DIAG-010: Flywheel Fingerprint Self-Correction Failure
## Diagnostic — ZERO code changes

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `COMPLETION_REPORT_ENFORCEMENT.md` — report enforcement applies even to diagnostics

**If you have not read both files, STOP and read them now.**

---

## WHY THIS DIAGNOSTIC EXISTS

The fingerprint flywheel self-correction cycle is broken. HF-145 implemented a confidence threshold gate that correctly demotes Tier 1 to Tier 2 when confidence < 0.5. The gate fires. But the downstream Tier 2 and Tier 3 behavior is wrong.

### The Designed Self-Correction Cycle
```
Import file → Tier 1 lookup by hash
  → confidence >= 0.5 → use cached classification (fast, zero LLM cost)
  → confidence < 0.5  → DEMOTE to Tier 2 → re-classify using existing fingerprint
    → update existing record with corrected classification
    → confidence recovers above 0.5
    → next import uses Tier 1 with correct classification
```

### What Actually Happened (Production Evidence — March 19, 2026)

**Step 1 — Tier 1 demotion (CORRECT):**
```
[SCI-FINGERPRINT] tier=1 DEMOTED to tier=2: hash=fbead6eed137 confidence=0.3231 < 0.5 threshold
```
Tier 1 FOUND the fingerprint record, read its confidence as 0.3231, and correctly demoted.

**Step 2 — Tier 2 match failure (BUG):**
```
[SCI-FINGERPRINT] tier=3 match=false hash=fbead6eed137 — novel structure
```
Tier 2 was SKIPPED or FAILED. The system went straight to Tier 3 and reported `match=false` for hash `fbead6eed137` — the SAME hash that Tier 1 just successfully found and read. Two lookups of the same hash in the same request: one succeeds, one fails.

**Step 3 — Tier 3 fresh classification (MASKED THE BUG):**
```
[SCI-FINGERPRINT] LLM called — Tier 3 novel structure, fingerprint stored for future recognition
```
Full LLM call. Correct result (ID_Empleado identified, 100% entity binding). But the system treated a known structure as novel.

**Step 4 — Fingerprint record replaced (BUG):**
Database query after import:
- `WHERE fingerprint_hash = 'fbead6eed137'` → NO ROWS (old record gone)
- `WHERE tenant_id = BCL` → 2 rows (new records with different hashes)

The old fingerprint was deleted or overwritten. New records were created with different hashes for the same file structure. The flywheel lost its memory instead of correcting it.

### Three Bugs to Diagnose

| # | Bug | Evidence |
|---|-----|----------|
| B1 | Tier 2 returns `match=false` for a hash that Tier 1 just found | Logs: Tier 1 reads 0.3231 from hash, then Tier 3 says match=false for same hash |
| B2 | Old fingerprint record deleted/overwritten instead of updated | DB: hash `fbead6eed137` gone after import. 2 new records exist with different hashes. |
| B3 | Tier 3 creates new fingerprint instead of updating existing | Log: "fingerprint stored for future recognition" — stores new, doesn't update old |

### Why This Matters

The flywheel is the platform's learning mechanism. If every confidence drop triggers a full Tier 3 LLM call and creates orphan records instead of correcting the existing fingerprint, the system:
- Never builds durable recognition (amnesia on every correction)
- Accumulates orphan fingerprint records
- Incurs full LLM cost on every import after any binding failure
- Cannot be trusted for Decision candidate 138 (Flywheel Self-Correction on Binding Failure)

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **ZERO CODE CHANGES.** This is a diagnostic. You are reading and reporting, not fixing.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### CC CONTROL FRAMEWORK (Rules 35-38)
35. EPG mandatory for mathematical/formula phases — N/A for this diagnostic
36. No unauthorized behavioral changes — ZERO CODE CHANGES in this diagnostic
37. Lifecycle wiring requires transition proof — N/A
38. Mathematical review gate — N/A

---

## SCOPE BOUNDARIES

### IN SCOPE
- Reading and pasting the COMPLETE fingerprint-flywheel.ts file
- Reading and pasting execute-bulk route.ts (fingerprint-related sections)
- Reading and pasting any file that calls fingerprint lookup, write, update, or delete
- Tracing the exact code path from Tier 1 demotion → Tier 2 lookup → Tier 3 fallthrough
- Tracing the exact code path that stores/updates/deletes fingerprint records
- Identifying why the hash changes for the same file structure
- Documenting findings with pasted code evidence

### OUT OF SCOPE — DO NOT TOUCH
- ANY code modification (this is read-only)
- Fingerprint-flywheel.ts changes
- Execute-bulk route changes
- SCI worker changes
- Any file in src/ — READ ONLY
- New features of any kind

### CRITICAL CONSTRAINT
**If you change even one character of application code, this diagnostic is a failure.** The ONLY files you create are the prompt file (committed Phase 0) and the completion report.

---

## PHASE 0: COMMIT THIS PROMPT

```bash
cd /Users/AndrewAfrica/spm-platform
cp DIAG-010_FLYWHEEL_SELF_CORRECTION_FAILURE.md .
git add -A && git commit -m "DIAG-010 Phase 0: Flywheel self-correction failure diagnostic prompt" && git push origin dev
```

---

## PHASE 1: FINGERPRINT FLYWHEEL — COMPLETE CODE

**Objective:** Paste the ENTIRE fingerprint-flywheel.ts file. Every line. Do not summarize.

```bash
echo "============================================"
echo "DIAG-010 PHASE 1: FINGERPRINT FLYWHEEL CODE"
echo "============================================"

echo ""
echo "=== 1A: COMPLETE FILE ==="
cat web/src/lib/sci/fingerprint-flywheel.ts

echo ""
echo "=== 1B: LINE COUNT ==="
wc -l web/src/lib/sci/fingerprint-flywheel.ts

echo ""
echo "=== 1C: ALL EXPORTS ==="
grep -n "export " web/src/lib/sci/fingerprint-flywheel.ts
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "DIAG-010 Phase 1: Fingerprint flywheel complete code" && git push origin dev
```

---

## PHASE 2: TIER 1 → TIER 2 → TIER 3 CODE PATH

**Objective:** Trace the exact code path that runs during file classification. Find where Tier 1 demotion hands off to Tier 2, and where Tier 2 hands off to Tier 3.

```bash
echo "============================================"
echo "DIAG-010 PHASE 2: TIER TRANSITION CODE PATH"
echo "============================================"

echo ""
echo "=== 2A: WHERE IS lookupFingerprint CALLED? ==="
grep -rn "lookupFingerprint\|lookup_fingerprint\|fingerprintLookup" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 2B: COMPLETE SCI WORKER FILE (where classification happens) ==="
find web/src -path "*/sci/*worker*" -name "*.ts" | head -5
echo "--- Pasting the file that orchestrates Tier 1/2/3 ---"
for f in $(find web/src -path "*/sci/*worker*" -name "*.ts" | head -3); do
  echo ""
  echo "========== $f =========="
  cat "$f"
done

echo ""
echo "=== 2C: TIER CLASSIFICATION ORCHESTRATION ==="
echo "--- The function that decides Tier 1 vs 2 vs 3 ---"
grep -rn "tier.*1\|tier.*2\|tier.*3\|DEMOTED\|demote\|novel.*structure\|match.*false" web/src/lib/sci/ --include="*.ts" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 2D: FINGERPRINT HASH COMPUTATION ==="
echo "--- How is the hash computed? Does it change between calls? ---"
grep -rn "fingerprint.*hash\|computeHash\|hashFingerprint\|createHash\|crypto.*hash\|md5\|sha" web/src/lib/sci/ --include="*.ts" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 2E: COMPLETE HASH FUNCTION ==="
echo "--- Find and paste the function that generates the fingerprint hash ---"
grep -rn "function.*hash\|function.*fingerprint\|const.*hash.*=\|computeFingerprint\|generateFingerprint\|structuralFingerprint" web/src/lib/sci/ --include="*.ts" | grep -v node_modules | grep -v ".next"
for f in $(grep -rl "function.*fingerprint\|computeFingerprint\|generateFingerprint\|structuralFingerprint" web/src/lib/sci/ --include="*.ts" 2>/dev/null | head -3); do
  echo ""
  echo "========== $f =========="
  cat "$f"
done
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "DIAG-010 Phase 2: Tier transition code path trace" && git push origin dev
```

---

## PHASE 3: FINGERPRINT WRITE/UPDATE/DELETE

**Objective:** Trace every code path that writes, updates, or deletes fingerprint records.

```bash
echo "============================================"
echo "DIAG-010 PHASE 3: FINGERPRINT PERSISTENCE"
echo "============================================"

echo ""
echo "=== 3A: ALL WRITES TO structural_fingerprints ==="
grep -rn "structural_fingerprints" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== 3B: INSERT OPERATIONS ==="
grep -rn "\.insert\|\.upsert" web/src/lib/sci/fingerprint-flywheel.ts

echo ""
echo "=== 3C: UPDATE OPERATIONS ==="
grep -rn "\.update" web/src/lib/sci/fingerprint-flywheel.ts

echo ""
echo "=== 3D: DELETE OPERATIONS ==="
grep -rn "\.delete" web/src/lib/sci/fingerprint-flywheel.ts

echo ""
echo "=== 3E: writeFingerprint FUNCTION — COMPLETE ==="
echo "--- The function that persists fingerprint records ---"
grep -n "writeFingerprint\|storeFingerprint\|saveFingerprint\|updateFingerprint" web/src/lib/sci/fingerprint-flywheel.ts

echo ""
echo "=== 3F: UPSERT vs INSERT BEHAVIOR ==="
echo "--- Is it insert (create new) or upsert (update if exists)? ---"
grep -A 10 "\.insert\|\.upsert" web/src/lib/sci/fingerprint-flywheel.ts

echo ""
echo "=== 3G: OPTIMISTIC LOCKING (HF-145) ==="
echo "--- The .eq('match_count', ...) guard from HF-145 ---"
grep -B 5 -A 10 "match_count\|optimistic\|\.eq(" web/src/lib/sci/fingerprint-flywheel.ts

echo ""
echo "=== 3H: EXECUTE-BULK FINGERPRINT OPERATIONS ==="
echo "--- Does execute-bulk also write/update/delete fingerprints? ---"
grep -n "structural_fingerprints\|fingerprint\|confidence.*decrease\|binding.*failure" web/src/app/api/import/sci/execute-bulk/route.ts
echo ""
echo "--- Full binding failure section ---"
grep -B 5 -A 20 "binding.*failure\|confidence.*decrease\|Entity binding" web/src/app/api/import/sci/execute-bulk/route.ts

echo ""
echo "=== 3I: ANY OTHER FILES THAT TOUCH structural_fingerprints ==="
grep -rn "structural_fingerprints" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v fingerprint-flywheel | grep -v execute-bulk
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "DIAG-010 Phase 3: Fingerprint persistence trace" && git push origin dev
```

---

## PHASE 4: HASH STABILITY ANALYSIS

**Objective:** Determine whether the same file structure produces the same hash on every import, or whether the hash changes.

```bash
echo "============================================"
echo "DIAG-010 PHASE 4: HASH STABILITY"
echo "============================================"

echo ""
echo "=== 4A: WHAT INPUTS GO INTO THE HASH? ==="
echo "--- Find the fingerprint generation function and list every input ---"
echo "--- The hash should be deterministic: same structure = same hash ---"
grep -B 5 -A 30 "function.*fingerprint\|generateFingerprint\|computeFingerprint\|createFingerprint\|structuralSignature" web/src/lib/sci/fingerprint-flywheel.ts

echo ""
echo "=== 4B: DOES THE HASH INCLUDE VOLATILE DATA? ==="
echo "--- If the hash includes timestamps, file names, row counts, or UUIDs ---"
echo "--- then the same structure would produce different hashes each time ---"
grep -n "fileName\|file_name\|timestamp\|Date\|uuid\|random\|rowCount\|row_count" web/src/lib/sci/fingerprint-flywheel.ts

echo ""
echo "=== 4C: CURRENT BCL FINGERPRINTS IN DATABASE ==="
echo "Run this SQL in Supabase Dashboard and paste the result:"
echo ""
echo "SELECT"
echo "  fingerprint_hash,"
echo "  confidence,"
echo "  match_count,"
echo "  classification_result->>'entity_identifier' as entity_identifier,"
echo "  column_roles,"
echo "  created_at,"
echo "  updated_at"
echo "FROM structural_fingerprints"
echo "WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';"
echo ""
echo "=== PASTE THE RESULT OF THE ABOVE QUERY HERE ==="
```

**IMPORTANT: CC must run the SQL query above against the live database using Supabase MCP or API. If CC cannot access the database directly, CC must document this as a BLOCKER and instruct Andrew to run the query and paste the result.**

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "DIAG-010 Phase 4: Hash stability analysis" && git push origin dev
```

---

## PHASE 5: FINDINGS SYNTHESIS

**Objective:** Compile all Phase 1-4 evidence into a structured findings document.

Create file `DIAG-010_FINDINGS.md` in project root with this structure:

```markdown
# DIAG-010 FINDINGS: Flywheel Fingerprint Self-Correction Failure
## Date: [today]

## EXECUTIVE SUMMARY
[One paragraph: what causes each of the three bugs, which functions are responsible, and what class of fix is required]

## BUG 1: Tier 2 returns match=false for a known hash

### Evidence
[Paste the specific code from Phase 2 showing the Tier 2 lookup logic]

### Root Cause
[Explain exactly why the Tier 2 lookup fails to find a hash that Tier 1 found.
Possible causes to investigate:
- Tier 1 and Tier 2 use different query conditions (tenant_id, hash column, etc.)
- Tier 2 lookup happens after the record was already deleted by another operation
- Tier 2 uses a different hash (recomputed) than Tier 1 (stored)
- Race condition: parallel worker deleted the record between Tier 1 and Tier 2 reads]

### Code Location
[File, function name, line numbers]

## BUG 2: Old fingerprint record deleted instead of updated

### Evidence
[Paste the specific code from Phase 3 showing what happens to existing records]

### Root Cause
[Explain exactly what deletes or overwrites the old record.
Possible causes:
- Tier 3 uses INSERT not UPSERT — creates new record, old one orphaned
- Tier 3 deletes old record before inserting new one
- The hash changed, so the new INSERT doesn't match the old record
- Optimistic locking failure causes the update to no-op, then a fresh insert runs]

### Code Location
[File, function name, line numbers]

## BUG 3: Hash instability — same structure produces different hashes

### Evidence
[Paste the hash computation function from Phase 4A]
[Paste the database query showing 2 records with different hashes from Phase 4C]

### Root Cause
[Explain whether the hash is deterministic or includes volatile inputs.
If the hash includes file name, upload timestamp, or other non-structural data,
the same spreadsheet structure would produce a different hash on each import,
making the flywheel unable to recognize previously seen structures.]

### Code Location
[File, function name, line numbers]

## RELATIONSHIP BETWEEN BUGS
[Are these three bugs independent, or does one cause the others?
Most likely scenario: Bug 3 (hash instability) causes Bug 1 (Tier 2 can't find hash)
and Bug 2 (new record instead of update). If the hash changes every import,
Tier 2 looks up the new hash, finds nothing, falls to Tier 3.
Tier 3 stores under the new hash. Old hash record becomes orphaned.]

## RECOMMENDED FIX APPROACH
[Structural fix description — what needs to change and in which functions.
This section informs the HF but does NOT implement anything.
Standing Rule 34: structural fix only, no workarounds.]

## IMPACT ON DECISION CANDIDATES
- Decision 135 (Leader-Follower Fingerprint): [Can/Cannot lock until fix verified]
- Decision 138 (Flywheel Self-Correction on Binding Failure): [Can/Cannot lock — the cycle does not work as designed]
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "DIAG-010 Phase 5: Findings synthesis" && git push origin dev
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `DIAG-010_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | fingerprint-flywheel.ts fully pasted | Phase 1A: complete file, every line, not summarized |
| PG-2 | Tier transition path traced | Phase 2: exact code path from Tier 1 demotion through Tier 2 to Tier 3, with line numbers |
| PG-3 | Write/update/delete operations documented | Phase 3: every operation that touches structural_fingerprints, with pasted code |
| PG-4 | Hash computation function pasted | Phase 4A: complete function with all inputs identified |
| PG-5 | Hash stability assessed | Phase 4B: volatile inputs identified or confirmed absent |
| PG-6 | Current BCL fingerprints queried | Phase 4C: database query result pasted showing current records |
| PG-7 | Bug 1 root cause identified with code evidence | FINDINGS: specific function and line where Tier 2 lookup diverges from Tier 1 |
| PG-8 | Bug 2 root cause identified with code evidence | FINDINGS: specific function and line where old record is lost |
| PG-9 | Bug 3 assessed with code evidence | FINDINGS: hash function inputs documented, stability confirmed or denied |
| PG-10 | DIAG-010_FINDINGS.md exists in project root | File created with all sections populated with pasted code evidence |
| PG-11 | Relationship between bugs documented | FINDINGS: causal chain between Bug 1, 2, and 3 identified |
| PG-12 | ZERO code changes | `git diff --stat HEAD~5..HEAD` shows ONLY .md files |
| PG-13 | npm run build exits 0 | Build clean — no code was changed |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Fixing the bug instead of diagnosing it | ZERO CODE CHANGES — this is a diagnostic |
| AP-2 | Summarizing code instead of pasting it | Every finding must include pasted function bodies |
| AP-3 | Guessing the root cause | Hypotheses must cite specific line numbers and pasted code |
| AP-4 | Assuming the hash is stable | Phase 4 explicitly tests this — do not skip |
| AP-5 | Concluding "it works because binding was 100%" | The OUTCOME was correct. The MECHANISM is broken. Diagnose the mechanism. |
| AP-6 | Recommending a workaround | Standing Rule 34 — structural fix only |
| AP-7 | Skipping the database query | Phase 4C query is critical — must be run and pasted |

---

*ViaLuce.ai — The Way of Light*
*DIAG-010: "The flywheel must learn, not forget. Correct, not reset. The outcome was right by accident — the mechanism must be right by design."*
