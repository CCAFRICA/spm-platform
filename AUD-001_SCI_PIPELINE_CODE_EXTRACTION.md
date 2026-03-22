# AUD-001: SCI PIPELINE — COMPREHENSIVE CODE EXTRACTION
## Type: AUD (Audit)
## Date: 2026-03-22
## Purpose: Extract ALL source code in the SCI pipeline for independent audit by Claude
## Estimated Duration: 30-45 minutes

**This is NOT an implementation prompt. CC writes ZERO code. CC extracts and outputs only.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply

---

## WHAT THIS DOES

Produces a single comprehensive markdown file (`AUD-001_CODE_EXTRACTION.md`) containing the complete source code of every file in the SCI pipeline — from the moment a file is uploaded through signal persistence, plan interpretation, convergence, entity resolution, and calculation trigger.

**CC writes no code. CC changes no files. CC creates one output file containing extracted code.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev --title "AUD-001: SCI Pipeline Code Extraction" --body "Complete source extraction of SCI pipeline for independent audit. No code changes."`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 1: DISCOVERY — MAP THE COMPLETE FILE TREE

Run the following diagnostic. Paste the COMPLETE output into the extraction document.

```bash
echo "============================================"
echo "AUD-001 PHASE 1: SCI PIPELINE FILE DISCOVERY"
echo "============================================"

echo ""
echo "=== 1A: SCI CORE ==="
find web/src -path "*sci*" -name "*.ts" -o -path "*sci*" -name "*.tsx" | sort

echo ""
echo "=== 1B: AI / ANTHROPIC LAYER ==="
find web/src -path "*ai*" -name "*.ts" -o -path "*anthropic*" -name "*.ts" -o -path "*plan-interpret*" -name "*.ts" -o -path "*plan_interpret*" -name "*.ts" | sort

echo ""
echo "=== 1C: SIGNAL / PERSISTENCE / FLYWHEEL ==="
find web/src -iname "*signal*" -o -iname "*persist*" -o -iname "*flywheel*" -o -iname "*classification*" | grep -E "\.(ts|tsx)$" | sort

echo ""
echo "=== 1D: IMPORT API ROUTES ==="
find web/src/app/api -path "*import*" -name "*.ts" | sort

echo ""
echo "=== 1E: IMPORT UI COMPONENTS ==="
find web/src/app -path "*import*" -name "*.tsx" | sort
find web/src/components -iname "*import*" -o -iname "*upload*" -o -iname "*file*" | grep -E "\.(tsx|ts)$" | sort

echo ""
echo "=== 1F: CONVERGENCE / ENTITY RESOLUTION ==="
find web/src -iname "*convergence*" -o -iname "*entity*resolv*" -o -iname "*entity*resolution*" | grep -E "\.(ts|tsx)$" | sort

echo ""
echo "=== 1G: CALCULATION ENGINE ==="
find web/src -path "*calculat*" -name "*.ts" -o -path "*engine*" -name "*.ts" | sort

echo ""
echo "=== 1H: AUTH / SESSION / COOKIE ==="
find web/src -iname "*cookie*" -o -iname "*session*" -o -iname "*auth*" -o -iname "*middleware*" | grep -E "\.(ts|tsx)$" | sort

echo ""
echo "=== 1I: SUPABASE CLIENT / CONFIG ==="
find web/src/lib/supabase -name "*.ts" | sort

echo ""
echo "=== 1J: TYPE DEFINITIONS ==="
find web/src -iname "*intent*type*" -o -iname "*calculation*type*" -o -iname "*engine*type*" -o -iname "*plan*type*" | grep -E "\.ts$" | sort

echo ""
echo "=== 1K: CROSS-REFERENCES (fetch calls in SCI) ==="
grep -rn "fetch(" web/src/lib/sci/ web/src/lib/ai/ --include="*.ts" 2>/dev/null | head -30

echo ""
echo "=== 1L: SIGNAL PERSISTENCE SPECIFIC ==="
grep -rn "SignalPersistence\|signalPersist\|persist.*signal\|signal.*write\|signal.*save\|signal.*store" web/src/ --include="*.ts" --include="*.tsx" | head -30

echo ""
echo "=== 1M: ALL API ROUTES (to verify endpoints exist) ==="
find web/src/app/api -name "route.ts" | sort

echo ""
echo "=== TOTAL FILES ==="
echo "SCI core:" $(find web/src -path "*sci*" -name "*.ts" -o -path "*sci*" -name "*.tsx" | wc -l)
echo "AI layer:" $(find web/src -path "*ai*" -name "*.ts" -o -path "*anthropic*" -name "*.ts" | wc -l)
echo "Signal:" $(find web/src -iname "*signal*" -iname "*.ts" -o -iname "*signal*" -iname "*.tsx" | wc -l)
echo "Import routes:" $(find web/src/app/api -path "*import*" -name "*.ts" | wc -l)
echo "Calc engine:" $(find web/src -path "*calculat*" -name "*.ts" -o -path "*engine*" -name "*.ts" | wc -l)
echo "Auth/session:" $(find web/src -iname "*cookie*" -o -iname "*session*" -o -iname "*auth*" -o -iname "*middleware*" | grep -E "\.(ts|tsx)$" | wc -l)
```

**Commit discovery output before proceeding to Phase 2.**

---

## PHASE 2: FULL CODE EXTRACTION

Create a file: `AUD-001_CODE_EXTRACTION.md`

### Structure

The file MUST follow this exact structure. For EVERY file discovered in Phase 1, include the complete source code.

```markdown
# AUD-001: COMPLETE CODE EXTRACTION
## Generated: 2026-03-22
## Purpose: Independent audit of SCI pipeline integrity

---

## TABLE OF CONTENTS

[List every file with section number]

---

## SECTION 1: SCI CORE

### 1.1: [filename]
- **Path:** [full path]
- **Lines:** [line count]
- **Last modified:** [git log -1 --format="%ai" -- filepath]

\`\`\`typescript
[COMPLETE file contents — no truncation, no summarization]
\`\`\`

### 1.2: [next file]
...
```

### Extraction Rules

1. **EVERY file discovered in Phase 1 must be included.** No exceptions.
2. **COMPLETE contents.** No truncation. No "// ... rest of file". No summarization.
3. **Include git metadata** for each file: last commit date, last commit message.
4. **If a file imports from another file NOT in Phase 1 discovery**, add that file too.
5. **If Phase 1 missed files** that are clearly part of the pipeline (e.g., shared utility used by SCI), add them.

### Extraction Order (Sections)

| Section | Category | Source |
|---------|----------|--------|
| 1 | SCI Core | Phase 1A results |
| 2 | AI / Anthropic Layer | Phase 1B results |
| 3 | Signal / Persistence / Flywheel | Phase 1C results |
| 4 | Import API Routes | Phase 1D results |
| 5 | Import UI Components | Phase 1E results |
| 6 | Convergence / Entity Resolution | Phase 1F results |
| 7 | Calculation Engine | Phase 1G results |
| 8 | Auth / Session / Cookie | Phase 1H results |
| 9 | Supabase Client / Config | Phase 1I results |
| 10 | Type Definitions | Phase 1J results |
| 11 | API Route Manifest | Phase 1M results (route.ts files — just the file list, not contents) |
| 12 | Additional Dependencies | Files discovered via imports in Sections 1-10 |

### For each file, CC must also include:

```bash
# Run for each file and paste output
git log -1 --format="Last commit: %ai | %s" -- [filepath]
wc -l [filepath]
```

---

## PHASE 3: ENDPOINT INVENTORY

Create a separate section in the extraction document:

```bash
echo "============================================"
echo "AUD-001 PHASE 3: ENDPOINT INVENTORY"
echo "============================================"

echo ""
echo "=== 3A: ALL fetch() CALLS IN SCI PIPELINE ==="
grep -rn "fetch(" web/src/lib/sci/ --include="*.ts" 2>/dev/null

echo ""
echo "=== 3B: ALL fetch() CALLS IN AI LAYER ==="
grep -rn "fetch(" web/src/lib/ai/ --include="*.ts" 2>/dev/null

echo ""
echo "=== 3C: ALL fetch() CALLS IN SIGNAL LAYER ==="
grep -rn "fetch(" web/src/ --include="*.ts" | grep -i "signal\|persist\|flywheel" 2>/dev/null

echo ""
echo "=== 3D: ALL API ROUTES WITH THEIR HTTP METHODS ==="
for route in $(find web/src/app/api -name "route.ts" | sort); do
  echo "--- $route ---"
  grep -n "export.*async.*function\|export.*function\|GET\|POST\|PUT\|DELETE\|PATCH" "$route" | head -5
done

echo ""
echo "=== 3E: ENVIRONMENT VARIABLES REFERENCED ==="
grep -rn "process.env\.\|NEXT_PUBLIC_" web/src/lib/sci/ web/src/lib/ai/ web/src/lib/supabase/ --include="*.ts" 2>/dev/null | sort -u
```

---

## PHASE 4: DEPENDENCY GRAPH

For the SCI execute pipeline specifically, trace the call chain:

```bash
echo "============================================"
echo "AUD-001 PHASE 4: SCI EXECUTE CALL CHAIN"
echo "============================================"

echo ""
echo "=== 4A: SCI Execute Entry Point ==="
cat web/src/app/api/import/sci/execute/route.ts 2>/dev/null || echo "FILE NOT FOUND at expected path"
echo ""
echo "--- Alternate paths ---"
find web/src -path "*sci*execute*" -name "*.ts" | sort

echo ""
echo "=== 4B: What does the execute route import? ==="
grep "^import" web/src/app/api/import/sci/execute/route.ts 2>/dev/null || find web/src -path "*sci*execute*" -name "*.ts" -exec grep "^import" {} \;

echo ""
echo "=== 4C: Signal write path — trace from execute to persistence ==="
grep -rn "signal\|Signal\|persist\|Persist" web/src/app/api/import/sci/ --include="*.ts" 2>/dev/null
grep -rn "signal\|Signal\|persist\|Persist" web/src/lib/sci/ --include="*.ts" 2>/dev/null

echo ""
echo "=== 4D: Plan interpretation call chain ==="
grep -rn "interpret\|Interpret\|anthropic\|Anthropic\|aiService\|AIService" web/src/lib/sci/ web/src/app/api/import/ --include="*.ts" 2>/dev/null

echo ""
echo "=== 4E: Convergence call chain ==="
grep -rn "convergence\|Convergence\|converge" web/src/lib/sci/ web/src/app/api/import/ --include="*.ts" 2>/dev/null
```

---

## PHASE 5: COMPLETION REPORT

Create `AUD-001_COMPLETION_REPORT.md`:

```markdown
# AUD-001 COMPLETION REPORT

## Files Extracted
[Total count per section]

## Hard Gates
- [ ] Every file from Phase 1 discovery is included in extraction: ___
- [ ] No file is truncated: ___
- [ ] Git metadata included for every file: ___
- [ ] Endpoint inventory complete: ___
- [ ] Dependency graph traces complete: ___
- [ ] All fetch() targets identified: ___

## Evidence
[Paste wc -l output for extraction file]
[Paste file count per section]
```

---

## FINAL STEP

```bash
gh pr create --base main --head dev \
  --title "AUD-001: SCI Pipeline Code Extraction for Independent Audit" \
  --body "Complete source extraction of SCI pipeline. No code changes. Extraction only.

Files:
- AUD-001_CODE_EXTRACTION.md — complete source of all SCI pipeline files
- AUD-001_COMPLETION_REPORT.md — extraction verification

Purpose: Enable independent audit against locked decisions, design specs, and operating directives."
```

---

*This extraction enables AUD-001 Part 2: the actual audit, which will be conducted by Claude against all 146 locked decisions, CC_STANDING_ARCHITECTURE_RULES, Korean Test, domain-agnostic compliance, and the full operating directive set.*
