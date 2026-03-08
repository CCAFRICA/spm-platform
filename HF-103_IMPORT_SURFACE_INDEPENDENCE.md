# HF-103: IMPORT SURFACE INDEPENDENCE — ZERO EXTERNAL DEPENDENCIES IN CLASSIFICATION

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` at the project root — authoritative schema source
3. `Vialuce_Contextual_Reliability_Resolution_Specification.md` — CRR controlling specification
4. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — SCI specification, Design Principle #1
5. `web/src/lib/sci/agents.ts` — agent scoring (tenant context signals)
6. `web/src/lib/sci/resolver.ts` — CRR resolver (signal extraction)
7. `web/src/lib/sci/synaptic-ingestion-state.ts` — Synaptic Surface (tenant context state)
8. `web/src/app/api/import/sci/analyze/route.ts` — analyze route
9. `web/src/components/layout/auth-shell.tsx` — PeriodProvider mounting
10. `web/src/contexts/period-context.tsx` — period context

**If you have not read ALL TEN files, STOP and read them now.**

---

## WHY THIS HF EXISTS

The import surface has two classes of external dependency that violate locked architectural decisions. Both have persisted across multiple HFs (093, 098, 101) despite being "fixed" each time.

### Violation 1: Tenant Context in Classification (Decision 72)

Decision 72: "Each tab in a multi-tab XLSX file is classified independently."
SCI Specification Design Principle #1: "The File Is Not the Unit of Intelligence — The Content Is."

The classification pipeline queries the tenant's existing state (plans, entities, committed_data) and uses that state as scoring signals:
- "Tenant has a plan but no committed_data" → Transaction Agent boosted
- "Tenant has entities" → Entity Agent suppressed
- "Tenant has no plans" → Plan Agent boosted

This creates **import-order dependency**. The same sheet classifies differently depending on what else exists in the tenant. A customer who uploads transaction data before their plan gets a different classification than one who uploads the plan first. This is fundamentally wrong.

Import order is random. Plan may arrive before or after data. Roster may arrive alone. Reference data may arrive months later. Classification must be deterministic based solely on the content unit's own structural properties and HC column roles.

### Violation 2: /api/periods on Import Path (Decision 92)

Decision 92: "The import surface must have zero period references. Period is a calculation parameter, not navigation context."

Vercel Runtime Logs from March 7, 2026 (multiple timestamps) show `GET /api/periods` called during every import flow. HF-093 (PR #194), HF-098 (PR #199), and HF-101 (PR #202) all claimed to fix this. Production evidence shows it persists.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **COMPLETION REPORT IS MANDATORY (Rules 25-28).**
6. **EVIDENTIARY GATES — NOT PASS/FAIL.** Every gate requires pasted evidence.

---

## SQL VERIFICATION GATE (MANDATORY — FP-49)

Before writing ANY SQL or code referencing database column names:
```bash
cat SCHEMA_REFERENCE_LIVE.md
```

---

## PHASE 0: COMPREHENSIVE DIAGNOSTIC

**DO NOT WRITE ANY FIX CODE UNTIL THIS ENTIRE PHASE IS COMPLETE.**

```bash
echo "============================================"
echo "HF-103 PHASE 0: IMPORT INDEPENDENCE DIAGNOSTIC"
echo "============================================"

echo ""
echo "================================================"
echo "SECTION A: TENANT CONTEXT IN CLASSIFICATION"
echo "================================================"

echo ""
echo "=== A1: Where is tenant state queried during classification? ==="
grep -rn "tenant.*context\|tenantContext\|existing.*plan\|existing.*entit\|plan.*count\|entity.*count\|committed.*count" web/src/lib/sci/ --include="*.ts" | head -30

echo ""
echo "=== A2: Tenant context in agent scoring ==="
grep -n "tenantContext\|tenant_context\|existingPlan\|existingEntit\|planCount\|entityCount" web/src/lib/sci/agents.ts | head -20

echo ""
echo "=== A3: Tenant context in Synaptic Ingestion State ==="
grep -n "tenantContext\|tenant_context\|existingPlan\|existingEntit\|planCount\|entityCount" web/src/lib/sci/synaptic-ingestion-state.ts | head -20

echo ""
echo "=== A4: Tenant context in resolver signal extraction ==="
grep -n "tenant_context\|tenantContext" web/src/lib/sci/resolver.ts | head -10

echo ""
echo "=== A5: Tenant context in analyze route ==="
grep -n "tenantContext\|tenant_context\|existingPlan\|existingEntit\|planCount\|entityCount" web/src/app/api/import/sci/analyze/route.ts | head -10

echo ""
echo "=== A6: Tenant context queries (Supabase calls during import) ==="
grep -rn "from('rule_sets')\|from('entities')\|from('committed_data')\|from('periods')" web/src/lib/sci/ web/src/app/api/import/sci/analyze/ --include="*.ts" | head -20

echo ""
echo "=== A7: Seed prior for tenant_context ==="
grep -n "tenant_context" web/src/lib/sci/seed-priors.ts

echo ""
echo "================================================"
echo "SECTION B: /api/periods ON IMPORT PATH"
echo "================================================"

echo ""
echo "=== B1: ALL callers of /api/periods or periods endpoint ==="
grep -rn "/api/periods\|from('periods')\|fetchPeriods\|loadPeriods\|usePeriod" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -30

echo ""
echo "=== B2: PeriodProvider in auth-shell.tsx ==="
grep -n "PeriodProvider\|isImportRoute\|period\|Period" web/src/components/layout/auth-shell.tsx | head -15

echo ""
echo "=== B3: Full auth-shell PeriodProvider section ==="
grep -A 5 -B 5 "PeriodProvider" web/src/components/layout/auth-shell.tsx

echo ""
echo "=== B4: Any component on import path that references periods ==="
grep -rn "period\|Period\|usePeriod" web/src/app/operate/import/ --include="*.ts" --include="*.tsx" | head -15

echo ""
echo "=== B5: period-context.tsx — full file ==="
cat web/src/contexts/period-context.tsx

echo ""
echo "=== B6: HF-101 auth-shell change — what was done ==="
echo "--- Show the isImportRoute conditional ---"
grep -n "isImportRoute\|import.*route\|pathname.*import" web/src/components/layout/auth-shell.tsx | head -10

echo ""
echo "=== B7: Does Operate layout also mount PeriodProvider? ==="
cat web/src/app/operate/layout.tsx

echo ""
echo "=== B8: Network path from login → import (all intermediate layouts) ==="
echo "--- Which layouts/pages load between auth and /operate/import? ---"
ls -la web/src/app/layout.tsx web/src/app/operate/layout.tsx web/src/app/operate/import/layout.tsx 2>/dev/null
for f in web/src/app/layout.tsx web/src/app/operate/layout.tsx web/src/app/operate/import/layout.tsx; do
  if [ -f "$f" ]; then
    echo "=== $f ==="
    grep -n "PeriodProvider\|period\|Period\|Provider" "$f" | head -10
  fi
done

echo ""
echo "================================================"
echo "SECTION C: ANY OTHER CROSS-FILE DEPENDENCIES"
echo "================================================"

echo ""
echo "=== C1: Any classification signal that depends on OTHER sheets in same file ==="
grep -rn "otherSheet\|crossSheet\|cross_sheet\|sibling\|adjacent\|companion" web/src/lib/sci/ --include="*.ts" | head -10

echo ""
echo "=== C2: Processing order dependencies in classification (not execution) ==="
grep -rn "processingOrder\|processing_order\|dependency.*graph\|depends.*on" web/src/lib/sci/ --include="*.ts" | grep -v execute | head -10

echo ""
echo "=== C3: Any import-time queries to tables OTHER than the file being imported ==="
grep -rn "from('rule_sets')\|from('entities')\|from('committed_data')\|from('reference_data')\|from('periods')\|from('calculation')" web/src/app/api/import/sci/analyze/ --include="*.ts" | head -15
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-103 Phase 0: Import independence diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION GATE

```
ARCHITECTURE DECISION RECORD
============================
Problem 1: Classification depends on tenant state (existing plans, entities).
           Same content classifies differently depending on import order.
           Decision 72: each tab classified independently.

Problem 2: /api/periods called on import path.
           Decision 92: import surface has zero period references.
           Three prior HFs failed to eliminate this.

Fix for Problem 1:
  REMOVE all tenant context signals from classification.
  Classification inputs are ONLY:
    a. Structural properties of the content unit (Content Profile)
    b. HC column role interpretations
    c. Prior classification signals from the flywheel (for structurally similar content)
    d. Composite structural signatures
  
  Classification inputs are NEVER:
    a. Whether a plan exists in the tenant
    b. Whether entities exist in the tenant
    c. Whether committed_data exists in the tenant
    d. Whether periods exist in the tenant
    e. Any state external to the content unit itself

  Remove tenant_context from seed-priors.ts.
  Remove tenant context queries from the analyze route.
  Remove tenant context from Synaptic Ingestion State.
  Remove tenant context agent score adjustments from agents.ts.
  Remove tenant_context signal extraction from resolver.ts.

Fix for Problem 2:
  The prior HF-101 approach (conditional PeriodProvider in auth-shell.tsx)
  either didn't deploy or has a timing issue.
  
  Diagnostic-first: determine WHERE the /api/periods call originates.
  Is it PeriodContext? Operate layout? A component on the import page?
  Direct Supabase query?
  
  Based on diagnostic: architectural fix, not another conditional hack.

Scale test: YES — import-order independence is a scale requirement
Korean Test: YES — no field-name matching
Domain-agnostic: YES — no domain vocabulary in classification decisions
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-103 Phase 1: Architecture decision — import independence" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

### 2A: Remove Tenant Context from Classification

1. Remove tenant context queries from the analyze route (no Supabase calls to rule_sets, entities, committed_data, periods during classification)
2. Remove tenant context from Synaptic Ingestion State
3. Remove tenant context agent score adjustments from agents.ts
4. Remove tenant_context signal extraction from resolver.ts
5. Remove tenant_context from seed-priors.ts
6. Verify: classification produces identical results whether tenant has existing data or not

### 2B: Eliminate /api/periods on Import Path

Based on Phase 0 diagnostic findings, implement the architectural fix. This is the FOURTH attempt — the fix must be comprehensive. Trace the exact origin of the /api/periods call and eliminate it at the source.

### After ALL implementation:

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-103 Phase 2: Tenant context removed, periods eliminated" && git push origin dev`

---

## PHASE 3: LOCALHOST VERIFICATION WITH EVIDENCE

### V1: Zero Tenant Context in Classification
```bash
grep -rn "tenant_context\|tenantContext\|existingPlan\|existingEntit\|planCount\|entityCount" web/src/lib/sci/ --include="*.ts"
```
**Required evidence:** Paste output — must be zero results (or only in comments).

### V2: Zero Import-Time Queries to External Tables
```bash
grep -rn "from('rule_sets')\|from('entities')\|from('committed_data')\|from('periods')" web/src/app/api/import/sci/analyze/ --include="*.ts"
```
**Required evidence:** Paste output — must be zero results.

### V3: Classification Same With and Without Existing Plan
Import Meridian XLSX on localhost with existing rule_set. Record classification results.
Delete rule_set. Re-import same file. Record classification results.
**Required evidence:** Both sets of `[SCI-CRR-DIAG]` posteriors — must be identical.

### V4: Zero /api/periods on Import Path
Start dev server. Open browser Network tab. Navigate login → tenant selection → import → import file.
**Required evidence:** List of network requests. Zero containing "periods".

### V5: Build Clean
```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
```
**Required evidence:** Paste output including exit code.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-103 Phase 3: Localhost verification with evidence" && git push origin dev`

---

## PHASE 4: AUTOMATED CLT WITH EVIDENTIARY GATES

```bash
echo "============================================"
echo "HF-103 CLT: IMPORT INDEPENDENCE VERIFICATION"
echo "============================================"

echo ""
echo "=== EG-1: Zero tenant context in classification pipeline ==="
echo "Evidence:"
grep -rn "tenant_context\|tenantContext\|existingPlan\|existingEntit\|planCount\|entityCount" web/src/lib/sci/ --include="*.ts" | grep -v "// "
echo "--- Expected: no output ---"

echo ""
echo "=== EG-2: Zero import-time queries to external tables ==="
echo "Evidence:"
grep -rn "from('rule_sets')\|from('entities')\|from('committed_data')\|from('periods')" web/src/app/api/import/sci/analyze/ --include="*.ts"
echo "--- Expected: no output ---"

echo ""
echo "=== EG-3: tenant_context removed from seed priors ==="
echo "Evidence:"
grep "tenant_context" web/src/lib/sci/seed-priors.ts
echo "--- Expected: no output ---"

echo ""
echo "=== EG-4: PeriodProvider NOT on import path ==="
echo "Evidence:"
grep -n "PeriodProvider\|isImportRoute" web/src/components/layout/auth-shell.tsx web/src/app/operate/layout.tsx 2>/dev/null
echo "--- Show architectural mechanism ---"

echo ""
echo "=== EG-5: Build clean ==="
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
echo "Exit code: $?"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-103 Phase 4: CLT with evidentiary gates" && git push origin dev`

---

## PHASE 5: COMPLETION REPORT + PR

### Completion Report (MANDATORY)

Create `HF-103_COMPLETION_REPORT.md` at project root. Every gate must include pasted evidence.

### PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-103: Import surface independence — remove tenant context, eliminate /api/periods" \
  --body "## Two Architectural Violations Fixed

### 1. Tenant Context Removed from Classification (Decision 72)
Classification no longer queries tenant state (existing plans, entities, committed_data).
Each content unit is classified solely on its own structural properties and HC column roles.
Import order does not affect classification results.

### 2. /api/periods Eliminated from Import Path (Decision 92)
Fourth and final fix. [CC fills — architectural mechanism used].
Zero /api/periods calls during import flow.

## Evidence
- Zero tenant_context references in classification pipeline
- Zero import-time queries to external tables
- Classification identical with and without existing plan data
- Zero /api/periods in network tab during import

## Production Verification Required (Andrew)
See PV-1 through PV-4 in prompt."
```

---

## WHAT NOT TO DO

1. **DO NOT add conditional skips for tenant context.** Remove it entirely. Classification does not depend on tenant state.
2. **DO NOT add another isImportRoute hack for periods.** Three prior attempts failed. Find and fix the source.
3. **DO NOT query rule_sets, entities, committed_data, or periods during the analyze route.** Classification reads ONLY the uploaded content and flywheel signals.
4. **DO NOT use field-name matching.** Korean Test (AP-25).
5. **DO NOT skip the completion report.**
6. **DO NOT skip V3 (classification same with and without plan).** This is the definitive test of import independence.

---

## ANDREW: PRODUCTION VERIFICATION (POST-MERGE)

### PV-1: Zero /api/periods on Import
Navigate login → tenant → import → import file. Check Vercel Runtime Logs.
**Evidence required:** Zero `GET /api/periods` entries during the import flow.

### PV-2: Classification Correct
**Evidence required:** `[SCI-CRR-DIAG]` showing correct posteriors for all three sheets.

### PV-3: HC Running
**Evidence required:** `[SCI-HC-DIAG]` showing llmCalled=true, avgConf > 0.

### PV-4: Import Independence
Import with existing plan. Then delete plan, clean data, re-import without plan.
**Evidence required:** Classification results identical in both cases.

**Only after ALL four PV checks pass with evidence can import independence be considered production-verified.**
