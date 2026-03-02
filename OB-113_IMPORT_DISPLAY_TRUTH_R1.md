# OB-113: IMPORT DISPLAY TRUTH — FRANKENSTEIN CLEANUP + CONFIDENCE FIX
## Target: alpha.3.0
## Date: February 28, 2026
## Derived From: CLT-111 (F-3, F-4, F-5, F-6, F-7, F-22, F-28), OB-112 diagnostic, PDR-08, PDR-09
## PRs Required: Merge #119, #120, #121, #122 to main BEFORE starting this OB

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference

**Read both before writing any code.**

---

## WHY THIS OB EXISTS

OB-112 proved the critical insight: **the server-side import chain was correct all along — the client-side display was lying.** Entity dedup, period dedup, and rule set assignments all work in the database. But the import UI still has five client-side display problems that make the platform look broken even when the data is right:

1. **Frankenstein Sheet Analysis** (CLT-111 F-3): OB-111's merge architecture creates TWO representations of each file — 7 new cards at the top + 7 legacy cards below + a phantom "Sheet1." 15 items for 7 files. The legacy UI was never hidden when the new cards were added.
2. **Hardcoded 50% confidence** (CLT-111 F-4, PDR-08): 5 consecutive CLTs. Every sheet classification card shows 50% regardless of actual AI analysis. AP-7 violation.
3. **Phantom Sheet1** (CLT-111 F-6): A nonexistent 8th "sheet" appears in the Entity Roster section from the legacy single-file code path bleeding through.
4. **Validate page noise** (CLT-111 F-22, PDR-09): 43% "Quality" meaningless. Wrong plan context. No decision support. Useless since CLT-72.
5. **Approve page noise** (CLT-111 F-28): Three representations of 7 files with different metrics. User cannot synthesize into a decision.

**These are all CLIENT-SIDE problems.** The data pipeline works. The display lies. This OB tells the truth.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. **Fix logic not data.**
7. **No new pages.** Fix existing pages. The routes exist — they just don't work correctly.
8. Supabase `.in()` calls MUST batch ≤200 items per call.

## CC ANTI-PATTERNS — THE SPECIFIC FAILURES TO AVOID IN THIS OB

| Anti-Pattern | What Happened Before | What To Do Instead |
|---|---|---|
| **Layer new UI on old** | OB-111 added file cards but legacy cards still render below them — 15 items for 7 files | When adding new UI, conditionally hide or remove old UI. One representation per data item. |
| **Hardcode confidence** | AP-7. Sheet classification returns 50% for every sheet regardless of AI analysis | Calculate real confidence from AI analysis results. If no AI analysis ran, show "Pending" not 50%. |
| **Sum instead of dedup** | OB-112 found client summed entity/period counts across files instead of deduplicating | Use Map/Set keyed by canonical identifier. Math.max for cumulative counts. |
| **Placeholder quality metrics** | Validate page shows 43% "Quality" from formula unrelated to actual data quality | Remove fake metrics. Show only what's real: record count, field mapping status, period detection status. |
| **Multiple conflicting representations** | Approve page shows 3 different views of the same 7 files with different numbers | Single source of truth. One card per file. Consistent metrics throughout. |

---

## PHASE 0: DIAGNOSTIC — READ BEFORE CODING (15 min)

### 0A: Verify PRs #119-122 are merged to main

```bash
cd ~/spm-platform
git checkout main && git pull origin main
git log --oneline -10
```

Confirm OB-110, OB-111, HF-076, and OB-112 commits are all on main. If not, merge them first:
```bash
# Only if PRs not yet merged:
git checkout dev && git pull origin dev
git checkout main && git merge dev
git push origin main
```

Then switch to dev for this OB:
```bash
git checkout dev && git pull origin dev
git merge main  # Ensure dev has everything from main
```

### 0B: Read the import pages

Read these files in full — understand the current structure before changing anything:

```
src/app/data/import/enhanced/page.tsx          # Main import page (Sheet Analysis + Field Mapping + Validate + Approve + Commit)
src/components/import/                          # Import components directory
```

Map the rendering flow:
- Where does Sheet Analysis render its cards?
- Where is the legacy single-file rendering path?
- Where is confidence displayed and where does the value come from?
- Where does the "Sheet1" label originate?
- What does the Validate step render and where do its metrics come from?
- What does the Approve step render?

### 0C: Commit the diagnostic

Write your findings to `OB-113_ARCHITECTURE_DECISION.md` at project root:

```
ARCHITECTURE DECISION RECORD — OB-113
======================================
Problem: Import UI shows duplicate/contradictory information due to legacy + new code coexisting.

DIAGNOSTIC FINDINGS:
- Sheet Analysis rendering flow: [describe what you found]
- Legacy card source: [file:line where old cards render]
- New card source: [file:line where OB-111 cards render]
- Confidence value source: [file:line where 50% comes from]
- Sheet1 phantom source: [file:line where legacy single-file path bleeds through]
- Validate metrics source: [file:line where 43% Quality originates]
- Approve rendering source: [file:line where triple representation lives]

APPROACH:
Option A: Remove legacy rendering entirely, keep only OB-111 file cards
  - Scale test: Works at 10x? Yes — no data volume impact
  - AI-first: Any hardcoding? Removing hardcoding (50%)
  - Atomicity: Clean state on failure? Yes — display only changes

CHOSEN: Option A because the legacy rendering is superseded by OB-111's per-file architecture.
```

Commit: `OB-113 Phase 0: Architecture decision — import display truth`

---

## PHASE 1: FRANKENSTEIN CLEANUP — ONE REPRESENTATION PER FILE (30 min)

### The Problem

OB-111 added per-file cards to Sheet Analysis. But the legacy rendering that shows classification cards (with "Plan Component Data," "Entity Roster Detected," etc.) was never removed. Result: every file appears twice with conflicting confidence scores (50% on new cards, 85-95% on old cards).

### 1A: Remove or conditionally hide legacy sheet classification cards

Find the code that renders the old-style classification cards below OB-111's file cards. This is the "Plan Component Data" / "Entity Roster" section that shows 85-95% confidence.

**Rule:** When multi-file import is active (workbookAnalysis has multiple sheets/files), ONLY show the OB-111 per-file cards. The legacy single-sheet classification cards should only render when there's exactly one file/sheet (backward compatibility with Óptica's single-XLSX flow).

```typescript
// Pattern — conditional rendering based on file count:
const isMultiFile = workbookAnalysis.sheets.length > 1;

// In JSX:
{isMultiFile ? (
  <MultiFileCards sheets={workbookAnalysis.sheets} />
) : (
  <SingleFileClassification sheet={workbookAnalysis.sheets[0]} />
)}
```

### 1B: Eliminate phantom Sheet1

Find where the legacy code path creates a "Sheet1" entry when none exists in the uploaded files. This is the single-file fallback bleeding through on multi-file imports. The fix from 1A should handle this — if multi-file mode skips legacy rendering, the phantom Sheet1 won't appear.

Verify by checking: after the fix, uploading Caribe's 7 CSVs should show exactly 7 cards. Not 8. Not 15.

### 1C: Consistent file labels

Each card should show the **actual filename** (e.g., "Deposits_Dec2023.csv"), not "Sheet1" or a generated label. The filename is available in the workbookAnalysis data from OB-111's file parsing.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Upload 7 CSVs → exactly 7 cards visible in Sheet Analysis | No duplicates, no phantom Sheet1 |
| PG-02 | Each card shows actual filename | Not "Sheet1" or generic labels |
| PG-03 | Upload single XLSX → still works (Óptica regression) | Single-file flow not broken |
| PG-04 | No legacy classification cards visible in multi-file mode | "Plan Component Data" / "Entity Roster" sections hidden |
| PG-05 | `npm run build` exits 0 | Clean build |

**Commit:** `OB-113 Phase 1: Frankenstein cleanup — single representation per file`

---

## PHASE 2: REAL CONFIDENCE SCORES (30 min)

### The Problem

Every sheet card shows 50% confidence. This is AP-7 — hardcoded confidence. It's been reported in CLT-72, CLT-84, CLT-102, CLT-109, and CLT-111. Five consecutive CLTs. PDR-08.

### 2A: Trace confidence from AI analysis to display

The AI sheet classification step (which determines if a sheet is transaction data, entity roster, etc.) returns a confidence score. Find where this score is generated and where it gets lost before reaching the UI.

Likely locations:
- The Anthropic API call that classifies sheets
- The response parsing that extracts classification results
- The state that feeds the sheet cards

### 2B: Wire real confidence OR show honest state

Two acceptable outcomes:

**Option 1 (preferred):** Wire the actual AI confidence score from the classification API response to the card display.

**Option 2 (acceptable if AI doesn't return confidence):** If the AI classification doesn't produce a meaningful confidence score, show "Classified" with a checkmark instead of a fake percentage. An honest "Classified ✓" is infinitely better than a dishonest "50%."

**NOT acceptable:** Any hardcoded number. Any placeholder. Any static value that doesn't change based on actual AI analysis.

### 2C: Confidence display rules

```
AI returned confidence ≥ 0.8  → Show green badge: "95% confidence" (or actual %)
AI returned confidence 0.5-0.8 → Show amber badge: "72% confidence" with "Review recommended"
AI returned confidence < 0.5   → Show red badge: "Low confidence — manual review required"
AI did not run / no score      → Show gray badge: "Pending classification"
Hardcoded 50%                  → NEVER. This is AP-7.
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-06 | Sheet cards do NOT all show identical confidence | At minimum, different files should show different scores |
| PG-07 | No hardcoded 50% in codebase for sheet confidence | `grep -rn "0.5\|50%" src/` shows no sheet confidence hardcoding |
| PG-08 | If AI confidence unavailable, shows "Pending" not a number | Honest state, not fake precision |
| PG-09 | `npm run build` exits 0 | Clean build |

**Commit:** `OB-113 Phase 2: Real confidence scores — PDR-08 resolution`

---

## PHASE 3: VALIDATE PAGE — TRUTH OR NOTHING (30 min)

### The Problem

The Validate/Preview step has been useless since CLT-72. It shows:
- "43% Quality" — from an arbitrary formula unrelated to data quality
- "17% Completeness" — measured against the wrong plan's required fields
- "1/6 required fields mapped" — wrong plan context
- Calculation Preview against wrong plan components

This page adds NO value. It creates confusion. It violates the Bloodwork Principle.

### 3A: Replace fake metrics with real pipeline status

Instead of fabricated quality scores, show the user what's actually true about their import:

```
IMPORT STATUS
─────────────────────────────────
Records:        1,563 across 7 files
Entities:       25 unique (by Officer ID)
Periods:        4 detected (Dec 2023 — Mar 2024)
Field Mapping:  22/28 columns mapped
Unmapped:       6 columns (will be preserved in raw data)
─────────────────────────────────
```

These are real numbers from the pipeline. No fabricated percentages.

### 3B: Remove wrong-plan references

The Validate page currently shows components from whichever plan happens to be selected (often "CFG Insurance Referral" for Caribe data — completely wrong). Remove any calculation preview or plan-specific validation from this step. The plan association happens AFTER import, not during.

### 3C: Period detection display (keep what works)

CLT-111 F-23 confirmed period detection works correctly: 4 periods, monthly frequency, correct date ranges. Keep this display. It's one of the few honest elements on this page.

### 3D: Bloodwork Principle implementation

The page should follow the Bloodwork Principle:
- **Default view:** Clean summary (record count, entity count, period count, mapping status)
- **Attention items only:** Unmapped columns highlighted if they might be important
- **Detail on demand:** Expandable section for full column mapping table

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-10 | No "Quality %" displayed | Fake metric removed |
| PG-11 | No "Completeness %" displayed | Fake metric removed |
| PG-12 | No wrong-plan component references | Insurance components not shown for banking data |
| PG-13 | Real record count displayed | Matches actual data (1,563 for Caribe) |
| PG-14 | Real entity count displayed | Matches deduplicated count (25 for Caribe) |
| PG-15 | Period detection still displays correctly | 4 periods, monthly, correct ranges |
| PG-16 | `npm run build` exits 0 | Clean build |

**Commit:** `OB-113 Phase 3: Validate page — truth or nothing`

---

## PHASE 4: APPROVE PAGE — ONE CLEAR SUMMARY (20 min)

### The Problem

The Approve/Commit step shows three different representations of the same files with different metrics. The user sees conflicting information and cannot make a decision. CLT-111 F-28: "Noise, not decision support."

### 4A: Single summary view

Replace the triple representation with ONE clear summary:

```
READY TO COMMIT
─────────────────────────────────
Files:     7
Records:   1,563 total
Entities:  25 unique officers
Periods:   4 (Dec 2023 — Mar 2024)
Plans:     4 assigned

Per File:
  Deposits_Dec2023.csv      188 records  ✓ mapped
  Deposits_Jan2024.csv      194 records  ✓ mapped
  Deposits_Feb2024.csv      201 records  ✓ mapped
  Deposits_Mar2024.csv      198 records  ✓ mapped
  Referrals_Dec2023.csv     187 records  ✓ mapped
  Referrals_Jan2024.csv     196 records  ✓ mapped
  Referrals_Feb2024.csv     199 records  ✓ mapped
─────────────────────────────────
[Commit All Files]
```

### 4B: Deduplicated counts (OB-112 pattern)

Use the same dedup pattern OB-112 applied to the completion step:
- Entity count: `Math.max` across files (not sum)
- Period count: `Map` keyed by canonical_key (not array concat)
- Rule set count: Distinct plan assignments

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-17 | Single summary view on Approve page | Not three conflicting representations |
| PG-18 | Entity count matches DB (25 for Caribe, not 107) | Deduplication applied |
| PG-19 | Each file listed with record count | Per-file breakdown visible |
| PG-20 | `npm run build` exits 0 | Clean build |

**Commit:** `OB-113 Phase 4: Approve page — single clear summary`

---

## PHASE 5: COMPLETION REPORT + PR (15 min)

### 5A: Verify full import flow

Test the complete flow on localhost:
1. Navigate as Caribe tenant
2. Upload 7 CSV files
3. Sheet Analysis: 7 cards, real filenames, no duplicates, no phantom Sheet1
4. Field Mapping: existing behavior (OB-110 handles this)
5. Validate: real metrics, no fake percentages, no wrong-plan references
6. Approve: single summary, correct counts
7. Commit: data persists

### 5B: Regression check

Switch to Óptica tenant. Upload single XLSX file. Confirm single-file flow still works through all steps.

### 5C: Write completion report

Create `OB-113_COMPLETION_REPORT.md` at project root:

```markdown
# OB-113 COMPLETION REPORT
## Import Display Truth — Frankenstein Cleanup + Confidence Fix
## Date: [today]
## PR: #[number]

### CLT Findings Addressed

| CLT-111 Finding | Description | Resolution |
|---|---|---|
| F-3 | Duplicate cards (15 items for 7 files) | Single representation per file in multi-file mode |
| F-4 | Hardcoded 50% confidence (PDR-08) | [Real confidence / Honest state badge] |
| F-5 | Entity Roster on transaction data | [Legacy classification hidden in multi-file mode] |
| F-6 | Phantom Sheet1 | [Legacy path removed for multi-file imports] |
| F-7 | Two representations with different confidence | [Single card set per file] |
| F-22 | Validate page useless (PDR-09) | [Real metrics replacing fake quality scores] |
| F-28 | Approve page noise | [Single clear summary] |

### PDR Resolutions

| PDR | Description | Status |
|---|---|---|
| PDR-08 | Hardcoded 50% confidence | [RESOLVED / IMPROVED] |
| PDR-09 | Validate/Preview page useless | [RESOLVED / IMPROVED] |

### Proof Gate Results

[Paste all 20 proof gate results with PASS/FAIL and evidence]

### Files Modified

[List all files changed with brief description]

### Commits

[List all commits in order]

### Release Context

Target: alpha.3.0
PR: #[number]
CLT verification: CLT-113
```

### 5D: Create PR

```bash
gh pr create --base main --head dev --title "OB-113: Import Display Truth — Frankenstein Cleanup + Confidence Fix" --body "Addresses CLT-111 F-3/F-4/F-5/F-6/F-7/F-22/F-28. Resolves PDR-08 (hardcoded confidence) and PDR-09 (validate page). Single representation per file in multi-file mode, real confidence scores, truthful validate/approve pages."
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-21 | Full Caribe 7-CSV flow completes without display errors | End-to-end on localhost |
| PG-22 | Óptica single-XLSX regression passes | Single-file flow works |
| PG-23 | Completion report exists at project root | File created with evidence |
| PG-24 | PR created | `gh pr create` output |
| PG-25 | `npm run build` exits 0 on final state | Clean final build |

**Commit:** `OB-113 Phase 5: Completion report and PR`

---

## PROOF GATE SUMMARY

| # | Gate | Phase | Criterion |
|---|------|-------|-----------|
| PG-01 | 7 CSVs → 7 cards | 1 | No duplicates, no phantom |
| PG-02 | Actual filenames | 1 | Not "Sheet1" |
| PG-03 | Single XLSX regression | 1 | Óptica still works |
| PG-04 | No legacy cards in multi-file | 1 | Old rendering hidden |
| PG-05 | Build clean | 1 | npm run build exits 0 |
| PG-06 | Non-identical confidence | 2 | Different files ≠ same score |
| PG-07 | No hardcoded 50% | 2 | Grep confirms |
| PG-08 | Honest state if no AI score | 2 | "Pending" not fake number |
| PG-09 | Build clean | 2 | npm run build exits 0 |
| PG-10 | No "Quality %" | 3 | Fake metric gone |
| PG-11 | No "Completeness %" | 3 | Fake metric gone |
| PG-12 | No wrong-plan references | 3 | Insurance not shown for banking |
| PG-13 | Real record count | 3 | 1,563 for Caribe |
| PG-14 | Real entity count | 3 | 25 for Caribe |
| PG-15 | Period detection works | 3 | 4 periods, monthly |
| PG-16 | Build clean | 3 | npm run build exits 0 |
| PG-17 | Single approve summary | 4 | Not triple representation |
| PG-18 | Entity count = DB | 4 | 25 not 107 |
| PG-19 | Per-file breakdown | 4 | Each file listed |
| PG-20 | Build clean | 4 | npm run build exits 0 |
| PG-21 | Full Caribe flow | 5 | End-to-end passes |
| PG-22 | Óptica regression | 5 | Single-file works |
| PG-23 | Completion report | 5 | File exists with evidence |
| PG-24 | PR created | 5 | gh pr output |
| PG-25 | Final build clean | 5 | npm run build exits 0 |

**Total: 5 phases, 25 proof gates.**

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-113_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## QUICK CHECKLIST

```
Before submitting completion report, verify:
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ All Supabase migrations executed AND verified with DB query?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Browser console clean on localhost?
□ Real data displayed, no placeholders?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
```

---

*"The data was right. The display was lying. This OB tells the truth."*
*Vialuce.ai — Intelligence. Acceleration. Performance.*
