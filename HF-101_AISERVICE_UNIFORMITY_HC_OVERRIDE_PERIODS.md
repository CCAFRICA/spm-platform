# HF-101: AIService UNIFORMITY + HC OVERRIDE SCORING + PERIODS ELIMINATION

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` at the project root — authoritative schema source
3. `web/src/lib/ai/ai-service.ts` — the shared AI singleton
4. `web/src/lib/sci/header-comprehension.ts` — HC implementation (now uses AIService)
5. `web/src/lib/sci/agents.ts` — agent scoring logic
6. `web/src/lib/sci/negotiation.ts` — negotiation and HC Override logic
7. `web/src/app/api/import/sci/analyze/route.ts` — analyze route
8. `web/src/app/api/import/sci/analyze-document/route.ts` — plan interpretation (raw fetch bypass)
9. `web/src/contexts/period-context.tsx` — period context provider

**If you have not read ALL NINE files, STOP and read them now.**

---

## WHY THIS HF EXISTS

Three failures persist in production after HF-092 through HF-100. Each has been partially addressed in prior HFs but none have been resolved with production evidence. This HF fixes all three in one PR with Evidentiary Gates — proof artifacts, not PASS/FAIL self-attestation.

### Failure 1: HC Override Authority Not Changing Classification Outcome

**Production evidence (March 7, 2026 17:43 UTC):**
HC correctly identifies `Hub: reference_key@1.00` on Datos_Flota_Hub. But agent scoring produces `transaction@98%, reference@50%`. Decision 108 states: "When HC produces column roles with confidence ≥ 0.80, those roles OVERRIDE structural type detection." HC returned 1.00 confidence on reference_key. The override is not working in the scoring pipeline.

### Failure 2: /api/periods Called on Import Path

**Production evidence (March 7, 2026 17:42 UTC):**
Two `GET /api/periods` calls during import navigation. Decision 92: "The import surface must have zero period references." HF-093 (PR #194) and HF-098 (PR #199) both claimed to fix this. Neither fix held in production.

### Failure 3: Plan Interpretation Bypasses AIService

**Code evidence:**
`analyze-document/route.ts:15` defines `const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'`. This is the only remaining raw AI call outside AIService. AIService already has a `plan_interpretation` task type ready. No JSON repair parity, no retry, no cost tracking, no provider abstraction.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **COMPLETION REPORT IS MANDATORY (Rules 25-28).**
6. **EVIDENTIARY GATES — NOT PASS/FAIL.** Every gate in the completion report must include pasted code, pasted terminal output, or pasted grep results as evidence. "PASS" alone is not accepted. See Phase 5 for the required evidence format.

---

## SQL VERIFICATION GATE (MANDATORY — FP-49)

Before writing ANY SQL or code referencing database column names:
```bash
cat SCHEMA_REFERENCE_LIVE.md
```
Verify every column name against the live schema. No exceptions.

---

## PHASE 0: COMPREHENSIVE DIAGNOSTIC

**DO NOT WRITE ANY FIX CODE UNTIL THIS ENTIRE PHASE IS COMPLETE.**

```bash
echo "============================================"
echo "HF-101 PHASE 0: COMPREHENSIVE DIAGNOSTIC"
echo "============================================"

echo ""
echo "================================================"
echo "SECTION A: HC OVERRIDE IN AGENT SCORING"
echo "================================================"

echo ""
echo "=== A1: Where does HC Override fire in agent scoring? ==="
grep -n "override\|Override\|HC_OVERRIDE\|hcOverride\|columnRole\|reference_key" web/src/lib/sci/agents.ts | head -30

echo ""
echo "=== A2: Where does HC Override fire in negotiation? ==="
grep -n "override\|Override\|HC_OVERRIDE\|hcOverride\|columnRole\|reference_key" web/src/lib/sci/negotiation.ts | head -30

echo ""
echo "=== A3: Full Reference Agent scoring logic ==="
echo "--- Find the Reference Agent section ---"
grep -n "reference\|Reference" web/src/lib/sci/agents.ts | head -20
echo "--- Paste the full Reference Agent scoring function ---"

echo ""
echo "=== A4: How does HC column role feed into agent scores? ==="
echo "--- Trace from HC result → content profile → agent score ---"
grep -n "headerComprehension\|hcResult\|columnRole\|semanticRole" web/src/lib/sci/agents.ts web/src/lib/sci/negotiation.ts web/src/lib/sci/content-profile.ts 2>/dev/null | head -30

echo ""
echo "=== A5: What is the HC Override implementation from HF-095? ==="
grep -n "override\|confidence.*0.8\|0.80\|hc.*authority\|Override.*Authority" web/src/lib/sci/ -r --include="*.ts" | head -20

echo ""
echo "=== A6: Datos_Flota_Hub structural signals ==="
echo "--- What makes Transaction Agent score 98%? ---"
echo "idRepeatRatio=3.00, hasTemporal=true, hasCurrency=0, numericRatio=0.67"
echo "--- What makes Reference Agent score only 50%? ---"
echo "HC says Hub=reference_key@1.00 but Reference Agent only gets 50%"
echo "--- Trace exactly how reference_key column role affects Reference Agent score ---"

echo ""
echo "================================================"
echo "SECTION B: /api/periods ON IMPORT PATH"
echo "================================================"

echo ""
echo "=== B1: EVERY caller of /api/periods ==="
grep -rn "/api/periods\|api/periods\|fetchPeriods\|loadPeriods" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -30

echo ""
echo "=== B2: Period context — full file ==="
cat web/src/contexts/period-context.tsx

echo ""
echo "=== B3: What provides PeriodContext on the import path? ==="
echo "--- Trace the component tree from root layout to import page ---"
grep -rn "PeriodProvider\|PeriodContext" web/src/app/ --include="*.tsx" | head -20

echo ""
echo "=== B4: Operate layout — does it mount PeriodProvider? ==="
cat web/src/app/operate/layout.tsx

echo ""
echo "=== B5: What HF-093 and HF-098 actually changed ==="
grep -n "isImportRoute\|import.*route\|period.*import\|import.*period" web/src/contexts/period-context.tsx | head -10

echo ""
echo "=== B6: Direct Supabase queries for periods outside PeriodContext ==="
grep -rn "from('periods')\|\.from('periods')" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "================================================"
echo "SECTION C: PLAN INTERPRETATION AIService MIGRATION"
echo "================================================"

echo ""
echo "=== C1: Current plan interpretation implementation ==="
cat web/src/app/api/import/sci/analyze-document/route.ts

echo ""
echo "=== C2: AIService plan_interpretation task type ==="
grep -n "plan_interpretation\|interpretPlan\|plan.*interpret" web/src/lib/ai/ai-service.ts | head -10
grep -n "plan_interpretation\|interpretPlan\|plan.*interpret" web/src/lib/ai/types.ts 2>/dev/null | head -5
grep -n "plan_interpretation" web/src/lib/ai/providers/anthropic-adapter.ts | head -10

echo ""
echo "=== C3: AIService plan_interpretation system prompt and user prompt ==="
echo "--- Paste the buildSystemPrompt and buildUserPrompt cases for plan_interpretation ---"
grep -A 10 "plan_interpretation" web/src/lib/ai/providers/anthropic-adapter.ts | head -30

echo ""
echo "=== C4: Zero raw AI calls remaining after fix ==="
echo "--- This is the pre-fix baseline ---"
grep -rn "api.anthropic.com\|api.openai.com" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v ai-service | grep -v "providers/"
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-101 Phase 0: Comprehensive diagnostic — HC Override + periods + plan AI" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION GATE

```
ARCHITECTURE DECISION RECORD
============================

FAILURE 1: HC Override Not Affecting Scores
  Problem: HC identifies reference_key@1.00 but Reference Agent only scores 50%.
           Transaction Agent scores 98% from structural signals alone.
           Decision 108 says HC overrides structural detection when confident.
  
  Root cause from diagnostic: [CC fills — exact code path where override should fire but doesn't]
  
  Fix: When HC identifies reference_key at confidence ≥ 0.80:
       - Reference Agent score MUST be boosted to at least match Transaction Agent
       - OR Transaction Agent score MUST be penalized when HC contradicts its claim
       - The specific mechanism depends on diagnostic findings
  
  Scale test: Works at 10x? YES — HC Override is confidence-gated, not hardcoded
  AP check: Zero Korean Test violations (structural + HC, no field names)

FAILURE 2: /api/periods on Import Path
  Problem: PeriodContext loads at Operate workspace level, fetches periods before
           user reaches import page. Two prior fixes failed.
  
  Root cause from diagnostic: [CC fills — exact component tree showing where PeriodProvider mounts]
  
  Fix options:
    A. Don't mount PeriodProvider on import route
    B. Conditional render: PeriodProvider only mounts for non-import children
    C. Move PeriodProvider from Operate layout to individual pages that need it
  
  Decision 92 compliance: Import surface must have zero period API calls.
  
  CHOSEN: Option [CC fills based on diagnostic]
  REJECTED: Options [CC fills] because [CC fills]

FAILURE 3: Plan Interpretation AIService Migration
  Problem: Raw fetch() to api.anthropic.com. No retry, no cost tracking,
           no provider abstraction.
  
  Fix: Route through AIService using existing plan_interpretation task type.
       Same pattern as HF-100 HC migration.
  
  Scale test: YES — AIService handles all AI calls
  AP-17 check: Eliminates the last dual code path
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-101 Phase 1: Architecture decisions for all three failures" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

Execute all three fixes. Order:

1. **Failure 1 (HC Override)** — most complex, highest impact
2. **Failure 2 (/api/periods)** — must achieve zero period calls on import path
3. **Failure 3 (Plan interpretation)** — straightforward migration using HC as template

After each fix: commit, push, build.

After ALL three fixes:

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-101 Phase 2: All three fixes implemented" && git push origin dev`

---

## PHASE 3: LOCALHOST VERIFICATION WITH EVIDENCE

Start dev server. Import Meridian XLSX on localhost. Capture terminal output.

### V1: HC Override — Datos_Flota_Hub Classification
Import the file. Paste the FULL terminal output for the `[SCI-SCORES-DIAG]` line for Datos_Flota_Hub.
**Required evidence:** The log line showing `winner=reference` (not `winner=transaction`).

### V2: /api/periods — Zero Calls
Open browser Network tab. Navigate from login through tenant selection to import page. Import the file.
**Required evidence:** Screenshot or enumeration of all network requests. Zero requests containing "periods".

### V3: Plan Interpretation — AIService
Import a plan document (PPTX) on localhost if available. Or verify structurally:
```bash
grep -rn "api.anthropic.com" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v ai-service | grep -v "providers/"
```
**Required evidence:** Paste the grep output showing ZERO results.

### V4: Classification Accuracy — All Three Sheets
**Required evidence:** Paste ALL three `[SCI-SCORES-DIAG]` lines from terminal:
- Plantilla: winner=entity
- Datos_Rendimiento: winner=transaction
- Datos_Flota_Hub: winner=reference

### V5: HC Running Through AIService
**Required evidence:** Paste the `[SCI-HC-DIAG]` summary line showing `llmCalled=true`, `avgConf > 0`.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-101 Phase 3: Localhost verification with evidence" && git push origin dev`

---

## PHASE 4: AUTOMATED CLT WITH EVIDENCE

```bash
echo "============================================"
echo "HF-101 CLT: EVIDENTIARY VERIFICATION"
echo "============================================"

echo ""
echo "=== EG-1: Zero raw AI calls outside AIService ==="
echo "Evidence:"
grep -rn "api.anthropic.com\|api.openai.com" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v ai-service | grep -v "providers/"
echo "--- Expected: no output (zero results) ---"
echo "--- If any results appear, list each file and explain ---"

echo ""
echo "=== EG-2: Zero /api/periods references on import path ==="
echo "Evidence:"
echo "--- Component tree from Operate layout to Import page ---"
grep -n "PeriodProvider\|PeriodContext\|period" web/src/app/operate/layout.tsx 2>/dev/null
grep -n "PeriodProvider\|PeriodContext\|period" web/src/app/operate/import/page.tsx 2>/dev/null
grep -n "PeriodProvider\|PeriodContext\|period" web/src/app/operate/import/layout.tsx 2>/dev/null
echo "--- Expected: PeriodProvider NOT mounted on import path ---"

echo ""
echo "=== EG-3: HC Override authority in agent scoring ==="
echo "Evidence:"
echo "--- Paste the specific code block where reference_key HC role boosts Reference Agent ---"
grep -A 15 "reference_key\|hc.*override\|Override.*reference\|columnRole.*reference" web/src/lib/sci/agents.ts | head -30
echo "--- Paste the specific code block where HC Override penalizes conflicting agents ---"
grep -A 10 "override\|penaliz\|contradict\|hc.*boost" web/src/lib/sci/negotiation.ts | head -20

echo ""
echo "=== EG-4: Plan interpretation uses AIService ==="
echo "Evidence:"
grep -n "AIService\|aiService\|getAIService\|ai-service" web/src/app/api/import/sci/analyze-document/route.ts
echo "--- Expected: AIService import and usage present ---"
echo "--- Verify no ANTHROPIC_API_URL constant ---"
grep -n "ANTHROPIC_API_URL\|api.anthropic.com" web/src/app/api/import/sci/analyze-document/route.ts
echo "--- Expected: no output (removed) ---"

echo ""
echo "=== EG-5: Build clean ==="
echo "Evidence:"
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
echo "--- Paste exit code ---"
echo "Exit code: $?"

echo ""
echo "=== EG-6: max_tokens verification ==="
echo "Evidence:"
grep -n "max_tokens" web/src/lib/sci/header-comprehension.ts web/src/app/api/import/sci/analyze-document/route.ts web/src/lib/ai/providers/anthropic-adapter.ts 2>/dev/null
echo "--- All AI calls must have max_tokens >= 4096 ---"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-101 Phase 4: CLT with evidentiary verification" && git push origin dev`

---

## PHASE 5: COMPLETION REPORT + PR

### Completion Report (MANDATORY — Rules 25-28)

Create `HF-101_COMPLETION_REPORT.md` at the project root.

**EVIDENTIARY GATE FORMAT — Every gate must include pasted evidence:**

```markdown
# HF-101 COMPLETION REPORT

## Commits
[list each commit with hash and message]

## Files Changed
[list every file with +/- line counts]

## Evidentiary Gates

### EG-1: Zero Raw AI Calls Outside AIService
**Grep command:** `grep -rn "api.anthropic.com" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v ai-service | grep -v "providers/"`
**Output:**
```
[paste actual output — must be empty]
```
**Conclusion:** [state what the evidence proves]

### EG-2: Zero /api/periods on Import Path
**Component tree evidence:**
```
[paste the layout/page hierarchy showing PeriodProvider is NOT on the import path]
```
**Network evidence from localhost:**
```
[paste the list of network requests during import — zero containing "periods"]
```
**Conclusion:** [state what the evidence proves]

### EG-3: HC Override Authority in Scoring
**Code evidence — Reference Agent boost when HC identifies reference_key:**
```typescript
[paste the exact code block, with file name and line numbers]
```
**Log evidence — Datos_Flota_Hub classification on localhost:**
```
[paste the [SCI-SCORES-DIAG] line showing winner=reference]
```
**Before/after comparison:**
- Before HF-101: transaction@98%, reference@50%
- After HF-101: [paste actual scores]
**Conclusion:** [state what the evidence proves]

### EG-4: Plan Interpretation Uses AIService
**Code evidence — AIService import in analyze-document/route.ts:**
```typescript
[paste the import line and the AIService.execute() or interpretPlan() call]
```
**Removed code evidence — no raw fetch:**
```
[paste grep showing zero ANTHROPIC_API_URL references]
```
**Conclusion:** [state what the evidence proves]

### EG-5: Build Clean
**Build output:**
```
[paste last 10 lines of npm run build output including exit code]
```

### EG-6: All SCI-SCORES-DIAG from Localhost Import
```
[paste all three SCI-SCORES-DIAG lines from terminal]
```
**Expected:** Plantilla=entity, Datos_Rendimiento=transaction, Datos_Flota_Hub=reference

## Anti-Pattern Compliance
- AP-17 (dual code paths): [evidence — grep showing zero raw AI calls]
- AP-25 (Korean Test): [evidence — no field-name matching in scoring changes]
- Decision 92: [evidence — zero period calls on import path]
- Decision 108: [evidence — HC Override code + scoring results]

## Issues Found
[list any issues discovered during implementation]
```

### PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-101: HC Override scoring + /api/periods elimination + plan interpretation AIService migration" \
  --body "## Three Failures Resolved

### 1. HC Override Authority (Decision 108)
HC correctly identifies reference_key@1.00 but scoring pipeline ignored it.
Fixed: [CC fills — mechanism used to give HC authority over agent scores]
Evidence: Datos_Flota_Hub now classifies as reference, not transaction.

### 2. /api/periods on Import Path (Decision 92)
Two prior HFs (093, 098) failed to eliminate period calls during import.
Fixed: [CC fills — architectural change to prevent periods loading on import]
Evidence: Zero /api/periods requests in network tab during import flow.

### 3. Plan Interpretation AIService Migration
Last remaining raw fetch() to api.anthropic.com outside AIService.
Fixed: Migrated to AIService. Zero raw AI calls remain in codebase.
Evidence: grep confirms zero api.anthropic.com references outside ai-service.

## Production Verification Required (Andrew)
See ANDREW: PRODUCTION VERIFICATION section."
```

---

## WHAT NOT TO DO

1. **DO NOT use PASS/FAIL gates.** Every gate requires pasted evidence. Code, output, grep results.
2. **DO NOT tune weights or thresholds without evidence.** Decision 109 was withdrawn for this reason.
3. **DO NOT add an isImportRoute conditional.** That approach failed twice. Find an architectural solution.
4. **DO NOT keep any raw AI calls outside AIService.** Zero exceptions.
5. **DO NOT skip the completion report.** Three consecutive HFs had missing or late reports.
6. **DO NOT reference scope_level.** The column is `role`.
7. **DO NOT write SQL without checking SCHEMA_REFERENCE_LIVE.md.** FP-49.
8. **DO NOT use field-name matching in scoring changes.** Korean Test (AP-25).
9. **DO NOT mark any finding ✅.** Only Andrew marks findings resolved after production verification.

---

## ANDREW: PRODUCTION VERIFICATION (POST-MERGE)

After merging this PR and Vercel deploy completes:

### PV-1: Clean Meridian Data
Run the three DELETE statements (committed_data, entities, classification_signals) filtered by Meridian tenant_id. Verify all three at 0.

### PV-2: Re-import Meridian XLSX
Upload and confirm.

### PV-3: HC Override — Datos_Flota_Hub Classification
Expand `POST /api/import/sci/analyze` in Vercel Runtime Logs.
- **Evidence required:** `[SCI-SCORES-DIAG]` line showing Datos_Flota_Hub `winner=reference` (not transaction)
- **Compare against pre-fix baseline:** `winner=transaction@98%, reference=50%`

### PV-4: HC Running
- **Evidence required:** `[SCI-HC-DIAG]` showing `llmCalled=true`, `avgConf > 0`

### PV-5: Zero /api/periods
Check Vercel Runtime Logs for the full navigation sequence (login → tenant selection → import).
- **Evidence required:** Zero `GET /api/periods` entries in the log during import flow

### PV-6: Browser — Import Results
- **Evidence required:** Screenshot showing:
  - Plantilla: "Entity" or "Team Roster"
  - Datos_Rendimiento: "Transaction Data"
  - Datos_Flota_Hub: "Reference Data"
  - Entities matched > 0

### PV-7: Database Verification
```sql
SELECT 'entities' AS tbl, COUNT(*) AS cnt
FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'committed_data', COUNT(*) FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'reference_data', COUNT(*) FROM reference_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```
- **Evidence required:** entities > 0, committed_data > 0, reference_data > 0

**Only after ALL seven PV checks pass with evidence can findings be marked resolved.**
