# HF-114: AI COLUMN MAPPING FORMAT FIX
## Convergence AI Call Returns Wrong JSON Format — Fix to Achieve MX$185,063

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference (rule_sets.input_bindings is JSONB)
3. `DS-009_Field_Identity_Architecture_20260308.md` — controlling specification

**Read all three before writing any code.**

---

## CONTEXT

The Decision 111 (Field Identity Architecture) pipeline works end-to-end in production:

- Import → field identity → unified committed_data → convergence → engine
- 50 employees + 12 hubs resolved correctly
- 5 component bindings produced (structural matching works)
- Engine resolves data through convergence bindings with 100% concordance
- Binding reuse proven (zero AI cost on subsequent runs)

**The ONE problem:** All 5 component bindings bind to the WRONG columns because the convergence AI call returns the wrong JSON format. The engine runs correctly on wrong inputs → MX$13.2B instead of MX$185,063.

**Three prior attempts failed (HF-112, HF-113 ×2):**
- HF-112: Used `task: 'narration'` → AI returned narrative text
- HF-113 attempt 1: Fixed to `task: 'field_mapping'` + `responseFormat: 'json'` → AI returned `{suggestedField, alternativeFields, confidence, reasoning}` instead of flat mapping
- HF-113 attempt 2: Stripped-down retry prompt → same structured analysis format

**Root cause hypothesis:** Nobody inspected what AIService actually does with these parameters. The system prompt applied by AIService for `task: 'field_mapping'` likely instructs the AI to "analyze" or "provide suggestions with confidence scores," which overrides the user prompt's request for flat JSON.

**The proven pattern:** Header Comprehension (HC) calls AIService and gets reliable JSON output. Whatever task type, system prompt, and JSON enforcement mechanism HC uses — replicate it for column mapping.

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

## MERIDIAN LOGISTICS GROUP — GROUND TRUTH

- **Tenant ID:** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
- **Plan ID:** `022b0e46-2968-451e-8634-fc7877912649`
- **Period ID:** `f22267d9-b78c-4aea-80f2-dadc4d4051fa` (January 2025)
- **Ground truth grand total:** MX$185,063
- **Current wrong total:** MX$13,246,207,636

### Correct Column Bindings (What Convergence MUST Produce)

| Component | Operation | Input Role | Correct Column | Example Value |
|---|---|---|---|---|
| 0: Revenue Performance | bounded_lookup_2d | row | Cumplimiento_Ingreso | 1.015 (→101.5%) |
| 0: Revenue Performance | bounded_lookup_2d | column | Volumen_Rutas_Hub | 1083 |
| 1: On-Time Delivery | bounded_lookup_1d | actual | Pct_Entregas_Tiempo | 0.8649 (→86.49%) |
| 2: New Accounts | scalar_multiply | actual | Cuentas_Nuevas | 0 |
| 3: Safety Record | conditional_gate | actual | Incidentes_Seguridad | 0 |
| 4: Fleet Utilization | scalar_multiply (ratio) | numerator | Cargas_Flota_Hub | 1083 |
| 4: Fleet Utilization | scalar_multiply (ratio) | denominator | Capacidad_Flota_Hub | 1306 |

**DO NOT hardcode these column names anywhere.** The AI must derive these bindings semantically. These values are here ONLY for verification — to check that the AI produced the correct result. This is Fix Logic Not Data.

---

## CC ANTI-PATTERNS — THE SPECIFIC FAILURES TO AVOID

| Anti-Pattern | What CC Did Before | What To Do Instead |
|---|---|---|
| Prompt tweaking without code inspection (FP-57) | HF-113 tried 3 prompt rewrites without understanding AIService system prompt | Phase 0 inspects AIService code FIRST. Paste actual code. |
| Wrong task type (FP-56) | HF-112 used `task: 'narration'` | Verify task type registration. Log the task type used. |
| Logging without consuming (FP-53) | OB-162 engine logged convergence bindings but didn't use them | Already fixed HF-108. Don't regress. |
| SQL schema fabrication (FP-49/59) | Claude wrote SQL with columns that don't exist (name→label, status='active'→check constraint) | Verify EVERY column name against SCHEMA_REFERENCE_LIVE.md before ANY SQL. No exceptions. |
| Completion report without evidence (FP-50) | Multiple HFs claimed PASS without production data | Every proof gate requires pasted evidence. |

---

## PHASE 0: DIAGNOSTIC — INSPECT AISERVICE CODE PATH

**This phase produces NO code changes. Only inspection and committed analysis.**

This is the most important phase. Three prompt attempts failed because nobody read the code. Read it now.

```bash
echo "============================================"
echo "HF-114 PHASE 0: AISERVICE CODE PATH INSPECTION"
echo "============================================"

echo ""
echo "=== 1. FIND AISERVICE ==="
find web/src -path "*ai-service*" -o -path "*ai/service*" -o -path "*aiService*" -o -path "*AIService*" | grep -v node_modules | grep -v .next | sort

echo ""
echo "=== 2. FIND ALL REGISTERED TASK TYPES ==="
# What task types does AIService recognize?
grep -rn "task\|taskType\|'narration'\|'field_mapping'\|'comprehension'\|'classification'\|'analysis'" \
  web/src/lib/ai/ --include="*.ts" | head -40

echo ""
echo "=== 3. FIND HC'S AISERVICE CALL PATTERN ==="
# HC produces reliable JSON. How does it call AIService?
grep -rn "aiService\|AIService\|callLLM\|callAI\|anthropic\|messages\|system.*prompt" \
  web/src/lib/sci/header-comprehension.ts | head -20

# Also check the actual HC function that builds the prompt
cat web/src/lib/sci/header-comprehension.ts | head -100

echo ""
echo "=== 4. FIND CONVERGENCE'S AISERVICE CALL ==="
# Where does convergence call the AI for column mapping?
grep -rn "aiService\|AIService\|callLLM\|callAI\|field_mapping\|columnMap\|metricMap" \
  web/src/lib/sci/convergence*.ts web/src/lib/engine/ web/src/app/api/ --include="*.ts" | head -30

echo ""
echo "=== 5. FIND SYSTEM PROMPT CONSTRUCTION ==="
# What system prompt does AIService inject per task type?
grep -rn "system\|systemPrompt\|system_prompt\|role.*system" \
  web/src/lib/ai/ --include="*.ts" | head -30

echo ""
echo "=== 6. FIND responseFormat HANDLING ==="
# Does AIService actually pass responseFormat to the API?
grep -rn "responseFormat\|response_format\|json_mode\|json" \
  web/src/lib/ai/ --include="*.ts" | head -20

echo ""
echo "=== 7. PRINT FULL AISERVICE FILE ==="
# Print the main AIService file to understand the full code path
wc -l web/src/lib/ai/ai-service.ts 2>/dev/null || echo "File not found at expected path"
cat web/src/lib/ai/ai-service.ts 2>/dev/null | head -200

echo ""
echo "=== 8. PRINT CONVERGENCE AI CALL FILE ==="
# Find and print the file that makes the convergence AI call
find web/src -name "convergence*" -name "*.ts" | sort
# Print the first convergence file found
for f in $(find web/src -name "convergence*" -name "*.ts" | sort); do
  echo "--- FILE: $f ---"
  cat "$f" | head -150
  echo ""
done
```

### PHASE 0 DELIVERABLE: Written Analysis

After running the diagnostic, write `HF-114_ARCHITECTURE_DECISION.md` answering:

```
ARCHITECTURE DECISION RECORD
============================
Problem: AI column mapping returns structured analysis object instead of flat {metric: column} JSON.

FINDINGS FROM CODE INSPECTION:
1. AIService task types found: [list them]
2. System prompt for 'field_mapping': [paste it or "no handler found — falls back to ___"]
3. System prompt for HC's task type: [paste it — this is the working pattern]
4. Does responseFormat actually constrain output? [yes/no, with code evidence]
5. HC's call pattern: [task type, system prompt approach, JSON enforcement mechanism]

Option A: Register a new task type for column mapping, with system prompt mirroring HC's pattern
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

Option B: Use HC's exact task type with a column-mapping-specific user prompt
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

Option C: Bypass AIService's system prompt — construct the full messages array directly
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

CHOSEN: Option ___ because ___
REJECTED: Option ___ because ___
```

**Commit:** `git add -A && git commit -m "HF-114 Phase 0: AIService code path inspection + architecture decision" && git push origin dev`

**DO NOT proceed to Phase 1 until this is committed with pasted code evidence.**

---

## PHASE 1: FIX THE AI COLUMN MAPPING CALL

Based on Phase 0 findings, fix the convergence AI call to return flat JSON.

### What the AI Call Must Return

```json
{
  "revenue_attainment": "Cumplimiento_Ingreso",
  "hub_route_volume": "Volumen_Rutas_Hub",
  "on_time_delivery_percentage": "Pct_Entregas_Tiempo",
  "new_accounts_count": "Cuentas_Nuevas",
  "safety_incidents": "Incidentes_Seguridad",
  "total_hub_loads": "Cargas_Flota_Hub",
  "total_hub_capacity": "Capacidad_Flota_Hub"
}
```

A flat JSON object. Keys = plan metric field names (from calculationIntent.sourceSpec.field). Values = data column names (from committed_data row_data keys).

### Implementation Constraints

1. **Mirror HC's proven pattern.** Whatever makes HC produce reliable JSON — use the same mechanism. Do NOT invent a new approach.

2. **The prompt must include BOTH sides in English:**
   - Plan side: metric field names + descriptions from calculationIntent
   - Data side: column names + contextual identities from metadata.field_identities (HC output)
   - The AI matches English-to-English. The column names may be Spanish/Korean/anything — the contextual identities are always English.

3. **System prompt must demand flat JSON.** Something like: "You are a data column matcher. Return ONLY a JSON object mapping metric names to column names. No analysis, no explanations, no confidence scores. Just {metric: column}."

4. **Parse response with fallback.** Strip markdown fences. Try JSON.parse. If it fails or contains unexpected keys (suggestedField, alternativeFields, confidence, reasoning), LOG the raw response and fall through to boundary matching. Do NOT silently accept wrong format.

5. **Log the AI response.** Always log what the AI returned so Vercel Runtime Logs show exactly what happened. Include the task type used, the response format requested, and the first 500 chars of the response.

6. **Korean Test compliant.** The prompt sends contextual identities (English) and metric names (English). No column name matching against hardcoded dictionaries. The AI understands semantics.

7. **Binding reuse unchanged.** The hasCompleteBindings check must still skip AI when existing bindings are valid. Do NOT break binding reuse.

### Proof Gates — Phase 1

- PG-1: HC's call pattern identified and documented (paste the code)
- PG-2: Convergence AI call uses same mechanism as HC (paste the new code)
- PG-3: System prompt demands flat JSON (paste the system prompt)
- PG-4: Response parsing handles malformed responses (logs and falls back)
- PG-5: AI response logged with task type + format + first 500 chars
- PG-6: `npm run build` exits 0
- PG-7: No Korean Test violations (grep for hardcoded column names returns 0)

**Commit:** `git add -A && git commit -m "HF-114 Phase 1: Fix convergence AI call — mirror HC pattern for flat JSON" && git push origin dev`

---

## PHASE 2: RESET CONVERGENCE BINDINGS AND RE-CONVERGE

### Step 2A: Verify Schema Before SQL

```bash
echo "=== VERIFY SCHEMA ==="
echo "Checking rule_sets columns..."
# Verify against SCHEMA_REFERENCE_LIVE.md
# rule_sets has: input_bindings (jsonb), metadata (jsonb)
# DO NOT reference columns that don't exist
```

### Step 2B: Clear Existing Wrong Bindings

The wrong convergence bindings are stored in rule_sets.input_bindings. Clear them so convergence runs fresh.

```sql
-- VERIFY column exists first
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'rule_sets' AND column_name IN ('input_bindings', 'metadata');

-- Clear convergence bindings for Meridian plan
UPDATE rule_sets 
SET input_bindings = '{}'::jsonb,
    metadata = metadata - 'convergence_bindings'
WHERE id = '022b0e46-2968-451e-8634-fc7877912649';

-- Verify cleared
SELECT id, name, 
  jsonb_pretty(input_bindings) as bindings,
  metadata->'convergence_bindings' as conv_bindings
FROM rule_sets
WHERE id = '022b0e46-2968-451e-8634-fc7877912649';
```

### Step 2C: Trigger Re-Convergence

Navigate to the Meridian tenant → Operate → Calculate → Execute. This triggers convergence which should now call the fixed AI mapping.

### Step 2D: Verify Convergence Bindings via SQL

```sql
-- After execution, check what convergence produced
SELECT 
  jsonb_pretty(input_bindings) as new_bindings,
  metadata->'convergence_bindings' as conv_bindings
FROM rule_sets
WHERE id = '022b0e46-2968-451e-8634-fc7877912649';
```

**Expected:** The bindings should map to the correct columns per the table in the MERIDIAN section above.

### Step 2E: Verify Calculation Result

```sql
-- Check calculation result
SELECT 
  cr.entity_id,
  e.display_name,
  cr.total_payout,
  jsonb_pretty(cr.components) as components
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.rule_set_id = '022b0e46-2968-451e-8634-fc7877912649'
  AND cr.period_id = 'f22267d9-b78c-4aea-80f2-dadc4d4051fa'
ORDER BY cr.total_payout DESC
LIMIT 10;

-- Check grand total
SELECT SUM(total_payout) as grand_total
FROM calculation_results
WHERE rule_set_id = '022b0e46-2968-451e-8634-fc7877912649'
  AND period_id = 'f22267d9-b78c-4aea-80f2-dadc4d4051fa';
```

**Expected grand total: MX$185,063** (approximately — exact ground truth for January 2025).

### Proof Gates — Phase 2

- PG-8: Schema verified before any SQL (paste information_schema query result)
- PG-9: Old bindings cleared (paste UPDATE result)
- PG-10: New convergence bindings contain correct column names (paste query result)
- PG-11: Grand total approximately MX$185,063 (paste SUM query result)
- PG-12: At least 3 individual entity payouts shown (paste top 10 query)

**Commit:** `git add -A && git commit -m "HF-114 Phase 2: Convergence re-run with correct AI mapping — verify MX$185,063" && git push origin dev`

---

## PHASE 3: PRODUCTION VERIFICATION

### Step 3A: Build and Deploy

```bash
# Kill dev server
# Clean build
rm -rf .next
npm run build
# Verify build succeeds
npm run dev
# Confirm localhost:3000 responds
```

### Step 3B: Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-114: Fix convergence AI column mapping format" \
  --body "## What
Fix convergence AI call to return flat JSON mapping instead of structured analysis object.

## Why
Three prior attempts (HF-112, HF-113 x2) failed because AIService code path was not inspected. The system prompt for the task type caused the AI to return analysis instead of flat mapping.

## How
Mirrored HC's proven JSON pattern for the convergence column mapping call.

## Result
Convergence binds correct columns → engine produces MX\$185,063 (Meridian ground truth)."
```

### Step 3C: Post-Merge Production Steps (FOR ANDREW)

After merging PR to main:

1. Wait for Vercel deployment to complete
2. Navigate to vialuce.ai → log in as Meridian admin
3. Go to Operate → Calculate → Execute
4. Check Vercel Runtime Logs for:
   - `[CONVERGENCE]` AI call response (should show flat JSON mapping)
   - `[ENGINE]` convergence binding resolution (should show correct columns)
5. Verify calculation total = MX$185,063

### Proof Gates — Phase 3

- PG-13: `npm run build` exits 0 (paste terminal output)
- PG-14: localhost:3000 responds (paste confirmation)
- PG-15: PR created with URL (paste PR URL)
- PG-16: Vercel Runtime Logs show AI returning flat JSON (paste log excerpt — FOR ANDREW)
- PG-17: Production calculation = MX$185,063 (paste result — FOR ANDREW)

**Commit:** `git add -A && git commit -m "HF-114 Phase 3: Build verification + PR creation" && git push origin dev`

---

## COMPLETION REPORT

Create file `HF-114_COMPLETION_REPORT.md` in PROJECT ROOT with:

```markdown
# HF-114 COMPLETION REPORT
## AI Column Mapping Format Fix

### Commits
- Phase 0: [hash] — AIService code path inspection + architecture decision
- Phase 1: [hash] — Fix convergence AI call
- Phase 2: [hash] — Convergence re-run + verification
- Phase 3: [hash] — Build + PR

### Files Changed
[list every file modified]

### Hard Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-1: HC call pattern identified | | [paste code] |
| PG-2: Convergence mirrors HC | | [paste code] |
| PG-3: System prompt demands flat JSON | | [paste prompt] |
| PG-4: Malformed response handling | | [paste code] |
| PG-5: AI response logged | | [paste log line] |
| PG-6: npm run build exits 0 | | [paste output] |
| PG-7: Zero Korean Test violations | | [paste grep result] |
| PG-8: Schema verified | | [paste query] |
| PG-9: Old bindings cleared | | [paste result] |
| PG-10: New bindings correct | | [paste result] |
| PG-11: Grand total ≈ MX$185,063 | | [paste SUM result] |
| PG-12: Individual payouts shown | | [paste top 10] |
| PG-13: Build exits 0 | | [paste output] |
| PG-14: localhost responds | | [paste confirmation] |
| PG-15: PR created | | [paste URL] |

### Compliance
| Rule | Status |
|------|--------|
| Korean Test | |
| Fix Logic Not Data | |
| Scale by Design | |
| AI-First | |
| Binding reuse preserved | |

### Post-Merge Production Verification (FOR ANDREW)
| Gate | Status | Evidence |
|------|--------|----------|
| PG-16: Vercel logs show flat JSON | | |
| PG-17: Production total = MX$185,063 | | |

### Issues Found
[any issues discovered during execution]
```

**Commit:** `git add -A && git commit -m "HF-114 Completion Report" && git push origin dev`

---

## DECISION NUMBERING NOTE

DS-008 series (A1-A3) locked Decisions 111-116 in the strategy conversation. The DS-009 session (build conversation) reused 111-114 for different decisions. The build conversation decisions need renumbering to 117-120:

| Current # | Should Be | Decision |
|---|---|---|
| 111 (DS-009) | **117** | Field Identity Architecture |
| 112 (DS-009) | **118** | Convergence column matching is AI-Primary |
| 113 (DS-009) | **119** | Periods are user business decisions |
| 114 (DS-009) | **120** | Plan status 'draft' should not block calculation |

This renumbering is informational for the build conversation to reconcile. DS-008 series Decisions 111-116 retain their numbers.

---

## WHAT SUCCESS LOOKS LIKE

1. Phase 0 produces pasted AIService code showing exactly why the format was wrong
2. Phase 1 mirrors HC's proven pattern — no invention, no improvisation
3. Phase 2 shows convergence binding the correct 7 columns to the correct 5 components
4. Grand total = MX$185,063
5. Binding reuse still works (second execute = zero AI cost)
6. Zero hardcoded column names anywhere in the change

**"The AI already understands both sides. Plan metrics are in English. Column identities are in English. The bridge is English-to-English semantic matching. The obstacle was never capability — it was format."**
