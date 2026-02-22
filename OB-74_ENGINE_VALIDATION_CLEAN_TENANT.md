# OB-74: ENGINE VALIDATION — FULL PIPELINE PROOF FROM CLEAN TENANT

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Before reading further, open and read the COMPLETE file `CC_STANDING_ARCHITECTURE_RULES.md` at the project root. Every decision in this OB must comply with all sections (A through F).

**If you have not read that file, STOP and read it now.**

---

## WHY THIS OB EXISTS

**The platform has NEVER proven end-to-end pipeline execution through the browser UI on Supabase.**

Current demo data (Optica Luminar, Velocidad Deportiva) was created by seed scripts (OB-45, HF-023) that wrote directly to Supabase tables. The data never flowed through the actual pipeline:
- No plan document was uploaded through the UI
- No AI interpreted a plan document into a rule_set
- No data file was imported through Enhanced Import with AI field classification
- No AI field mapping occurred without FIELD_ID_MAPPINGS hardcoded constants
- The calculation engine never derived results from UI-imported data on Supabase

**Historical provenance of the problem:**

| Era | What Happened | What Was Proven | What Was NOT Proven |
|-----|---------------|-----------------|---------------------|
| CLT-01→06 (Feb 7-8) | Plan import + data import attempted. Data Package Import crashed on page load. | Plan AI interpretation works (92% confidence, 7 components). | Pipeline beyond plan import. |
| CLT-07→08 (Feb 9) | Field mapping showed AI badges but all defaulted to "Ignore". 119K records committed but all calculations = $0. | Sheet parsing works. Volume (119K) works. | Field mapping auto-select. Calculation. |
| OB-14→16 (Feb 9-10) | Smart Import wired. AI field mapping with three-tier confidence (85%/60%/unresolved). Zero-touch achieved. | AI maps 48 fields automatically. Aggregation produces componentMetrics. | Calculation engine consuming AI mappings. |
| CLT-10 (Feb 10) | $693,677 total — first non-zero. 55% of ground truth ($1,253,832). | Calculation engine CAN produce payouts. 3 of 7 components work. | Full component coverage. Reconciliation. |
| OB-20→30 (Feb 10-13) | Metric bleed fixes, store attribution, boundary normalization, variant routing. Reached $1,263,831 (99.2%). | Math accuracy when data is correctly wired. | Pipeline without localStorage. Pipeline on Supabase. |
| OB-42→48 (Feb 14-15) | Supabase migration. Entity model. Schema alignment. localStorage eliminated from business logic. | Supabase schema works. RLS works. Auth works. | Data flowing through UI to Supabase to calculation. |
| OB-65 (Feb 19) | "Clean Slate Pipeline Proof" — but used existing seed data. RetailCDMX data imported but periods/calculation never verified e2e. | Import pipeline writes to Supabase. | Calculation from UI-imported data. |
| OB-72 (Feb 21) | FIELD_ID_MAPPINGS removed. Korean Test passes (grep). | Zero hardcoded field name constants in code. | AI field mapping actually works at runtime without constants. |
| CLT-72 (Feb 21) | Browser walkthrough. F-41: 50% confidence hardcoded. F-52: 119K records committed with 5 unresolved mappings. F-56: all entities $0 but summary $157K. | The browser reveals truth. | Nothing new about pipeline — confirmed it's broken. |

**The gap:** Between "Korean Test passes" (code has no hardcoded field names) and "the AI pipeline actually resolves fields correctly at runtime" there is a chasm. OB-72's grep-based proof is necessary but not sufficient. This OB provides the sufficient proof.

---

## WHAT THIS OB DOES

Creates a **fresh test tenant**, uploads a plan document through the UI, uploads a data file through the UI, confirms AI field mapping, runs calculation, and validates results — all through the browser, all on Supabase, with zero seed data and zero hardcoded mappings.

**This is not a code-change OB.** This is a diagnostic + fix OB. The primary output is:
1. Identify every break point in the live pipeline
2. Fix each break point
3. Prove the pipeline works end-to-end with browser evidence

---

## STANDING RULES
1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. Architecture Decision Gate before implementation
5. Anti-Pattern Registry check (AP-1 through AP-22)
6. **Supabase migrations MUST be executed live AND verified with DB query**
7. **Git commands from repo root** (spm-platform), NOT from web/
8. **Fix logic, not data.** Do NOT insert test data. Do NOT provide answer values.
9. **Every AI assessment must validate data exists before generating.**
10. OB prompt committed to git as first action.

---

## PHASE 0: DIAGNOSTIC — MAP THE ENTIRE PIPELINE

Before touching any code, trace the complete pipeline to identify every break point.

```bash
cd /Users/AndrewAfrica/spm-platform/web

echo "============================================"
echo "OB-74 PHASE 0: FULL PIPELINE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: PLAN IMPORT PAGE — WHERE IS IT? ==="
echo "--- All plan import related pages ---"
find src/app -path "*plan*import*" -name "page.tsx" 2>/dev/null
find src/app -path "*import*plan*" -name "page.tsx" 2>/dev/null
find src/app -path "*rule*set*" -name "page.tsx" 2>/dev/null
echo "--- Sidebar links to plan import ---"
grep -rn "plan.*import\|import.*plan\|rule.*set.*import" \
  src/components/navigation/ src/lib/navigation/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -10

echo ""
echo "=== 0B: PLAN IMPORT — HOW DOES IT SAVE? ==="
echo "--- Does plan import write to Supabase rule_sets? ---"
for f in $(find src -path "*plan*import*" -o -path "*import*plan*" | grep "page.tsx\|route.ts" | head -5); do
  echo "--- $f ---"
  grep -n "supabase\|rule_sets\|localStorage\|savePlan\|handleImport\|handleConfirm" "$f" 2>/dev/null | head -15
done

echo ""
echo "=== 0C: PLAN IMPORT API — DOES IT USE SERVICE ROLE? ==="
grep -rn "rule_sets" src/app/api/ --include="*.ts" -l 2>/dev/null
for f in $(grep -rn "rule_sets" src/app/api/ --include="*.ts" -l 2>/dev/null); do
  echo "--- $f ---"
  grep -n "service.*role\|createClient\|supabase.*admin\|RLS\|signInWith" "$f" 2>/dev/null | head -10
done

echo ""
echo "=== 0D: DATA IMPORT (ENHANCED) — WHERE IS IT? ==="
find src/app -path "*enhanced*import*" -o -path "*import*enhanced*" | grep "page.tsx" | head -5
find src/app -path "*operate*import*" -name "page.tsx" | head -5

echo ""
echo "=== 0E: AI FIELD CLASSIFICATION — DOES IT CALL ANTHROPIC? ==="
echo "--- AI service calls during import ---"
grep -rn "AIService\|getAIService\|analyzeFile\|classifyField\|classify.*sheet\|classifyColumns" \
  src/lib/ai/ src/app/api/ai/ --include="*.ts" -l 2>/dev/null
echo "--- Anthropic adapter ---"
grep -rn "anthropic\|claude\|ANTHROPIC_API_KEY" \
  src/lib/ai/ --include="*.ts" 2>/dev/null | head -10

echo ""
echo "=== 0F: FIELD MAPPING — DOES IT USE HARDCODED CONSTANTS? ==="
echo "--- FIELD_ID_MAPPINGS or equivalent ---"
grep -rn "FIELD_ID_MAPPINGS\|FIELD_MAPPINGS\|YEAR_FIELDS\|MONTH_FIELDS\|ENTITY_FIELDS\|PERIOD_FIELDS" \
  src/lib/ --include="*.ts" 2>/dev/null | grep -v "// \|/\*\|node_modules\|.next"
echo "--- Hardcoded Spanish field names ---"
grep -rn "'año'\|'ano'\|'anio'\|'mes'\|'fecha'\|'periodo'\|'num_empleado'\|'Vendedor'\|'No_Tienda'" \
  src/lib/ --include="*.ts" 2>/dev/null | grep -v "// \|/\*\|node_modules\|.next\|demo/"

echo ""
echo "=== 0G: CONFIDENCE SCORES — ARE THEY REAL OR HARDCODED? ==="
echo "--- 50% hardcoded confidence (CLT-72 F-41) ---"
grep -rn "0\.5\|50\|confidence.*=.*0\.\|hardcoded.*confidence\|default.*confidence" \
  src/app/operate/import/ src/app/data/import/ src/lib/ai/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null | head -15

echo ""
echo "=== 0H: DATA COMMIT — WHERE DOES IMPORTED DATA GO? ==="
echo "--- Does import write to committed_data table? ---"
grep -rn "committed_data\|from('committed_data')" \
  src/app/api/ src/lib/ --include="*.ts" 2>/dev/null | grep "insert\|upsert\|write\|save\|commit" | head -15

echo ""
echo "=== 0I: ENTITY RESOLUTION — ARE ENTITIES CREATED FROM IMPORT? ==="
grep -rn "from('entities').*insert\|createEntit\|resolveEntit\|upsertEntit" \
  src/lib/ src/app/api/ --include="*.ts" 2>/dev/null | head -10

echo ""
echo "=== 0J: PERIOD CREATION — ARE PERIODS CREATED FROM IMPORT? ==="
grep -rn "from('periods').*insert\|createPeriod\|detectPeriod\|period.*detect" \
  src/lib/ src/app/api/ --include="*.ts" 2>/dev/null | head -10

echo ""
echo "=== 0K: CALCULATION ENGINE — HOW DOES IT READ DATA? ==="
echo "--- What does the engine read? ---"
grep -rn "from('committed_data')\|from('entities')\|from('rule_sets')\|from('calculation_results')" \
  src/lib/calculation/ src/lib/orchestration/ --include="*.ts" 2>/dev/null | head -20
echo "--- How does it resolve metrics per component? ---"
grep -rn "componentMetrics\|extractMetrics\|resolveMetric\|semanticType\|fieldMapping\|import.*context" \
  src/lib/calculation/ src/lib/orchestration/ --include="*.ts" 2>/dev/null | head -15

echo ""
echo "=== 0L: CALCULATION API — ENTRY POINT ==="
grep -rn "calculation\|calculate" src/app/api/ --include="*.ts" -l 2>/dev/null
for f in $(grep -rn "runCalculation\|triggerCalc\|startCalc" src/app/api/ --include="*.ts" -l 2>/dev/null); do
  echo "--- $f ---"
  cat "$f" | head -60
done

echo ""
echo "=== 0M: RULE_SET_ASSIGNMENTS — HOW ARE ENTITIES ASSIGNED TO PLANS? ==="
grep -rn "rule_set_assignments" src/lib/ src/app/api/ --include="*.ts" 2>/dev/null | head -10

echo ""
echo "=== 0N: FIELD MAPPING PERSISTENCE — IS AI CONTEXT SAVED? ==="
echo "--- Where is the AI import context / field mapping stored after import? ---"
grep -rn "import_batches\|import_context\|field_mapping.*save\|classification_signals\|mapping.*persist" \
  src/lib/ src/app/api/ --include="*.ts" 2>/dev/null | head -15

echo ""
echo "=== 0O: SCHEMA CHECK — KEY TABLES ==="
echo "--- Verify key columns exist ---"
grep -rn "\.select(" src/lib/calculation/ src/lib/orchestration/ --include="*.ts" 2>/dev/null | head -20
```

**PASTE the complete output. This is the truth about pipeline state.**

**Commit:** `OB-74 Phase 0: Full pipeline diagnostic — map every break point`

---

## PHASE 1: ARCHITECTURE DECISION

Based on Phase 0 findings, document the pipeline state and fix strategy.

```
ARCHITECTURE DECISION RECORD
============================
Problem: Full pipeline (plan upload → AI interpret → data upload → AI classify →
         AI field map → commit → entity resolve → period create → calculate →
         lifecycle → reconcile) has never been proven end-to-end through the
         browser on Supabase without seed data or hardcoded field mappings.

From Phase 0, classify each pipeline stage:

Stage 1 - Plan Upload:        [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 2 - AI Plan Interpret:   [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 3 - Rule Set Save:       [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 4 - Data File Upload:    [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 5 - AI Sheet Classify:   [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 6 - AI Field Mapping:    [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 7 - Field Mapping UI:    [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 8 - Data Commit:         [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 9 - Entity Resolution:   [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 10 - Period Creation:    [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 11 - Rule Set Assignment:[WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 12 - Calculation Run:    [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 13 - Results Write:      [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 14 - Dashboard Display:  [WORKING / BROKEN / UNTESTED] — Evidence: ___
Stage 15 - Lifecycle Advance:  [WORKING / BROKEN / UNTESTED] — Evidence: ___

Fix strategy: Address BROKEN stages in pipeline order.
If a stage is WORKING, do not touch it.
If UNTESTED, test it first before assuming it works.
```

**Commit:** `OB-74 Phase 1: Architecture decision — pipeline stage assessment`

---

## MISSION 1: TEST TENANT PROVISIONING

### The Goal
Create a clean test tenant with zero data. This tenant will be used for the entire pipeline proof.

### Implementation

Create a seed script that provisions ONLY the tenant and auth users — no entities, no rule_sets, no committed_data, no calculation_results.

```bash
cat > web/scripts/seed-test-pipeline.ts << 'EOF'
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const TENANT_NAME = 'Pipeline Test Co';
const TENANT_SLUG = 'pipeline-test';

async function seed() {
  console.log('=== OB-74: Pipeline Test Tenant ===');
  
  // 1. Create tenant (or verify exists)
  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', TENANT_ID)
    .single();
    
  if (!existing) {
    const { error } = await supabase.from('tenants').insert({
      id: TENANT_ID,
      name: TENANT_NAME,
      slug: TENANT_SLUG,
      industry: 'retail',
      country_code: 'MX',
      default_currency: 'MXN',
      default_locale: 'es-MX',
      settings: {},
    });
    if (error) throw new Error(`Tenant create failed: ${error.message}`);
    console.log('✅ Tenant created:', TENANT_NAME);
  } else {
    console.log('ℹ️  Tenant exists:', TENANT_NAME);
  }
  
  // 2. Create admin auth user
  const adminEmail = 'admin@pipelinetest.mx';
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: 'demo-password-VL1',
    email_confirm: true,
    user_metadata: { display_name: 'Pipeline Admin' }
  });
  
  if (authErr && !authErr.message.includes('already been registered')) {
    throw new Error(`Auth user create failed: ${authErr.message}`);
  }
  
  const userId = authUser?.user?.id || 
    (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === adminEmail)?.id;
  
  if (!userId) throw new Error('Could not find auth user ID');
  
  // 3. Create profile
  const { error: profErr } = await supabase.from('profiles').upsert({
    auth_user_id: userId,
    tenant_id: TENANT_ID,
    display_name: 'Pipeline Admin',
    email: adminEmail,
    role: 'admin',
    locale: 'es-MX',
  }, { onConflict: 'auth_user_id' });
  
  if (profErr) console.warn('Profile upsert warning:', profErr.message);
  else console.log('✅ Profile created for', adminEmail);
  
  // 4. Verify ZERO data in pipeline tables
  const tables = ['entities', 'rule_sets', 'rule_set_assignments', 'periods', 
                  'committed_data', 'calculation_batches', 'calculation_results',
                  'entity_period_outcomes', 'import_batches'];
  
  for (const table of tables) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID);
    console.log(`  ${table}: ${count ?? 0} rows ${count === 0 ? '✅' : '⚠️  NOT CLEAN'}`);
  }
  
  console.log('\n=== Pipeline Test Tenant ready ===');
  console.log(`Login: ${adminEmail} / demo-password-VL1`);
  console.log('Tenant ID:', TENANT_ID);
}

seed().catch(console.error);
EOF
```

Run it:
```bash
cd /Users/AndrewAfrica/spm-platform/web && npx tsx scripts/seed-test-pipeline.ts
```

### Proof Gates (2)
```
PG-1: Tenant exists in Supabase.
      SELECT id, name, slug FROM tenants WHERE id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
      EXPECTED: 1 row with name='Pipeline Test Co'
      EVIDENCE: [paste query result]

PG-2: ALL pipeline tables show 0 rows for this tenant.
      EXPECTED: entities=0, rule_sets=0, committed_data=0, calculation_results=0, etc.
      EVIDENCE: [paste seed script output showing all zeros]
```

**Commit:** `OB-74 Mission 1: Pipeline test tenant provisioned — zero data verified`

---

## MISSION 2: PLAN IMPORT — AI INTERPRETATION → RULE_SET

### The Goal
Andrew will upload a plan document (PPTX) through the browser UI. The AI must interpret it and write a rule_set to Supabase. This mission ensures the plan import page works, the AI API is called, and the result persists.

### Pre-Test Diagnostic

Before Andrew uploads, verify the plan import infrastructure:

```bash
echo "=== MISSION 2: PLAN IMPORT READINESS ==="

echo ""
echo "--- Plan import page exists and renders? ---"
PLAN_PAGE=$(find src/app -path "*plan*import*" -name "page.tsx" | head -1)
echo "Plan import page: $PLAN_PAGE"
[ -n "$PLAN_PAGE" ] && wc -l "$PLAN_PAGE"

echo ""
echo "--- AI interpreter uses AIService (not direct API)? ---"
grep -rn "AIService\|getAIService\|planInterpreter\|interpretPlan" \
  src/lib/ai/ src/app/api/ --include="*.ts" 2>/dev/null | head -15

echo ""
echo "--- API route for plan import exists? ---"
find src/app/api -path "*plan*" -o -path "*rule*set*" | grep route | head -5

echo ""
echo "--- ANTHROPIC_API_KEY configured? ---"
grep "ANTHROPIC_API_KEY" web/.env.local 2>/dev/null | head -1 | sed 's/=.*/=***/'

echo ""
echo "--- rule_sets INSERT path uses service role? ---"
grep -rn "from('rule_sets').*insert\|rule_sets.*insert" \
  src/app/api/ src/lib/ --include="*.ts" 2>/dev/null | head -10
```

### Fix What's Broken

Based on diagnostic, fix each issue found. Common issues from history:

1. **Plan import page not accessible from sidebar** — Add navigation link to `/operate/import` or wherever plan upload lives
2. **AI API key not configured** — Verify `.env.local` has `ANTHROPIC_API_KEY`
3. **rule_sets INSERT uses browser client (RLS blocks)** — Must use server-side API route with service role (HF-040 pattern)
4. **Tenant context lost on plan import page** — Ensure tenant_id flows from auth session
5. **AI response format doesn't match rule_sets schema** — Transform AI output to match `components` JSONB structure

**For each fix, document:**
- What was broken (with evidence from diagnostic)
- What the fix is
- Before/after code change

### Proof Gates (3)
```
PG-3: Plan import page loads at localhost:3000 when logged in as admin@pipelinetest.mx.
      EXPECTED: Page renders with file upload zone. No console errors.
      EVIDENCE: [paste page title + console output]

PG-4: After Andrew uploads PPTX, AI interpretation runs and returns component structure.
      EXPECTED: AI confidence > 80%, components detected, tier tables extracted.
      EVIDENCE: [paste AI response summary — component count, types, confidence]

PG-5: After Andrew confirms, rule_set written to Supabase.
      SELECT id, name, status, jsonb_array_length(components) as component_count
      FROM rule_sets WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
      EXPECTED: 1 row, status='active', component_count > 0
      EVIDENCE: [paste query result]
```

### Compliance Check
```
□ AI interpretation uses AIService abstraction (not direct Anthropic call)? [YES/NO]
□ rule_sets INSERT uses service role client? [YES/NO]
□ tenant_id comes from authenticated session, not hardcoded? [YES/NO]
□ No hardcoded component names or plan structure? [YES/NO]
```

**Commit:** `OB-74 Mission 2: Plan import pipeline verified and fixed`

---

## MISSION 3: DATA IMPORT — AI CLASSIFICATION → COMMITTED_DATA + ENTITIES + PERIODS

### The Goal
Andrew will upload an Excel data file through Enhanced Import. The AI must:
1. Classify sheets (roster, component data, etc.)
2. Map fields to semantic types (employeeId, attainment, amount, goal, period)
3. Show real confidence scores (NOT hardcoded 50% — CLT-72 F-41)
4. Auto-select high-confidence mappings in the dropdown (NOT default to "Ignore")
5. On commit: write to committed_data, create entities, create periods

### Pre-Test Diagnostic

```bash
echo "=== MISSION 3: DATA IMPORT READINESS ==="

echo ""
echo "--- Enhanced Import page exists? ---"
find src/app -path "*enhanced*" -name "page.tsx" | head -3

echo ""
echo "--- Import API route (file upload handler)? ---"
find src/app/api -path "*import*" -name "route.ts" | head -5

echo ""
echo "--- AI classification call (sheet + field)? ---"
grep -rn "classifySheet\|classifyField\|analyzeFile\|sheetAnalysis\|fieldAnalysis" \
  src/lib/ai/ src/app/api/ --include="*.ts" 2>/dev/null | head -10

echo ""
echo "--- Confidence score source (real AI or hardcoded)? ---"
grep -rn "confidence" src/app/operate/import/ src/app/data/import/ \
  --include="*.tsx" 2>/dev/null | grep -v node_modules | head -20

echo ""
echo "--- Field mapping dropdown default value? ---"
grep -rn "Ignore\|ignore\|defaultValue.*ignore\|value.*ignore" \
  src/app/operate/import/ src/app/data/import/ --include="*.tsx" 2>/dev/null | head -10

echo ""
echo "--- Commit path: writes to committed_data? ---"
grep -rn "committed_data.*insert\|from('committed_data')" \
  src/app/api/ src/lib/ --include="*.ts" 2>/dev/null | grep "insert\|upsert" | head -10

echo ""
echo "--- Entity creation from import? ---"
grep -rn "from('entities').*insert\|from('entities').*upsert\|createEntit" \
  src/app/api/ src/lib/ --include="*.ts" 2>/dev/null | head -10

echo ""
echo "--- Period creation from import? ---"
grep -rn "from('periods').*insert\|from('periods').*upsert\|createPeriod\|detectPeriod" \
  src/app/api/ src/lib/ --include="*.ts" 2>/dev/null | head -10

echo ""
echo "--- AI Import Context — is it persisted for calculation to read? ---"
grep -rn "import_context\|import_batches.*field_mapping\|classification_signals" \
  src/lib/ src/app/api/ --include="*.ts" 2>/dev/null | grep "insert\|save\|persist\|write" | head -10
```

### Known Issues to Fix (from CLT-72 and historical CLTs)

**F-41: Hardcoded 50% confidence.** The Enhanced Import page shows "50% confidence" as a placeholder. Find where confidence is set and ensure it reads from the actual AI response.

**F-52: Import commits with unresolved mappings.** There must be a validation gate: if critical fields (employeeId, at minimum one metric per component) are unmapped, the user must be warned before committing. Import should not silently commit with all fields at "Ignore."

**F-49: Low entity match rate.** 719 of 22,215 (3%) entity match. This suggests composite keys (store+employee prefixed IDs) vs simple IDs. The entity resolver must handle both formats.

**Historical: AI maps fields but dropdown shows "Ignore".** The auto-select at confidence threshold (85%/60%/unresolved from CLT-08) may have regressed. The dropdown's `value` prop must read from the AI mapping state, not a separate default.

**Historical: AI Import Context not persisted.** The AI's field mappings and sheet classifications must be saved somewhere the calculation engine can read them. Options: `import_batches.metadata` JSONB, `classification_signals` table, or a dedicated `field_mappings` column on `committed_data`.

### Fix What's Broken

For each issue found, fix it. **The key principle:** AI intelligence generated during import MUST flow through to calculation. If the AI correctly identifies "Cumplimiento" as attainment at 95% confidence, that mapping must:
1. Auto-select in the dropdown ✓
2. Persist to Supabase on commit ✓ 
3. Be readable by the calculation engine ✓

If ANY of these three links break, the pipeline produces $0.

### Proof Gates (5)
```
PG-6: Enhanced Import page loads. File upload accepts .xlsx.
      EXPECTED: Page renders. Andrew can upload file.
      EVIDENCE: [paste page state]

PG-7: AI sheet classification runs with REAL confidence scores (not 50%).
      EXPECTED: Sheets classified with varied confidence (e.g., 88%, 95%, 72%).
      EVIDENCE: [paste confidence scores per sheet from UI or console]

PG-8: AI field mapping auto-selects high-confidence fields in dropdown.
      EXPECTED: Fields ≥85% pre-selected (NOT "Ignore"). Fields <60% show "Unresolved".
      EVIDENCE: [paste field mapping state for one sheet showing auto-selected values]

PG-9: After commit, data exists in Supabase.
      SELECT COUNT(*) FROM committed_data WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
      SELECT COUNT(*) FROM entities WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
      SELECT COUNT(*) FROM periods WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
      EXPECTED: All > 0
      EVIDENCE: [paste query results]

PG-10: AI Import Context (field mappings, sheet classifications) persisted and retrievable.
       EXPECTED: Calculation engine can read which field maps to which semantic type.
       EVIDENCE: [paste where the mapping is stored and a sample mapping record]
```

### Compliance Check
```
□ AI confidence scores are real (from AI response), not hardcoded? [YES/NO]
□ High-confidence mappings auto-select in dropdown? [YES/NO]
□ Commit validates critical fields are mapped? [YES/NO]
□ committed_data, entities, periods all written to Supabase? [YES/NO]
□ AI Import Context persisted for calculation to consume? [YES/NO]
□ Zero FIELD_ID_MAPPINGS or hardcoded field name constants used? [YES/NO]
□ AP-5/AP-6/AP-7 not violated? [YES/NO]
```

**Commit:** `OB-74 Mission 3: Data import pipeline verified and fixed — AI classification to Supabase`

---

## MISSION 4: CALCULATION — ENGINE READS AI MAPPINGS → PRODUCES RESULTS

### The Goal
Run calculation on the test tenant's imported data. The engine must:
1. Read committed_data + rule_sets + entities from Supabase
2. Use the persisted AI field mappings (NOT hardcoded constants) to identify metrics per component
3. Produce calculation_results with non-zero total_payout for at least some entities
4. Write results to calculation_results table

### Pre-Test Diagnostic

```bash
echo "=== MISSION 4: CALCULATION ENGINE READINESS ==="

echo ""
echo "--- Calculation API entry point ---"
find src/app/api -path "*calculat*" -name "route.ts" | head -5

echo ""
echo "--- Engine reads from which tables? ---"
grep -rn "from('committed_data')\|from('entities')\|from('rule_sets')\|from('rule_set_assignments')\|from('periods')" \
  src/lib/calculation/ src/lib/orchestration/ --include="*.ts" 2>/dev/null | head -20

echo ""
echo "--- How does engine resolve metrics per component? ---"
echo "--- Does it use AI Import Context or hardcoded logic? ---"
grep -rn "componentMetric\|extractMetric\|resolveMetric\|semanticType\|fieldMapping\|import.*context\|classification" \
  src/lib/calculation/ src/lib/orchestration/ --include="*.ts" 2>/dev/null | head -20

echo ""
echo "--- Does engine read AI field mappings from Supabase? ---"
grep -rn "import_batch\|field_mapping\|classification_signal\|ai.*context\|mapping.*lookup" \
  src/lib/calculation/ src/lib/orchestration/ --include="*.ts" 2>/dev/null | head -15

echo ""
echo "--- What does the engine write? ---"
grep -rn "from('calculation_results').*insert\|from('calculation_batches').*insert" \
  src/lib/calculation/ src/lib/orchestration/ src/app/api/ --include="*.ts" 2>/dev/null | head -10

echo ""
echo "--- Rule set assignment — how are entities linked to plans? ---"
grep -rn "rule_set_assignment\|assign.*entity\|entity.*rule_set" \
  src/lib/calculation/ src/lib/orchestration/ src/app/api/ --include="*.ts" 2>/dev/null | head -10
```

### The Critical Question

**How does the calculation engine know which column in committed_data represents "attainment" for component "Optical Sales"?**

Pre-FIELD_ID_MAPPINGS removal: hardcoded constants like `YEAR_FIELDS = ['año', 'Año', 'year']` told the engine where to look.

Post-removal (OB-72): The engine must read the AI field mapping from wherever it was persisted during import (Mission 3) and use it.

**If the engine has no way to read the AI field mappings, this is the root cause of all $0 calculations since the Supabase migration.** The engine lost its map when FIELD_ID_MAPPINGS was removed, and no replacement was wired.

### Fix What's Broken

The fix must create a clear data flow:
```
Import: AI classifies "Cumplimiento" → semanticType: "attainment" → persisted to import_batches.metadata
                                                                    or classification_signals table

Calculation: Engine reads import_batches.metadata (or classification_signals)
             → finds "Cumplimiento" = attainment for sheet "Base_Venta_Individual"
             → reads committed_data rows, extracts value from "Cumplimiento" column
             → passes attainment value to tier/matrix lookup
             → produces payout
```

**Every link in this chain must exist in code.** If any link is missing, create it.

### Proof Gates (4)
```
PG-11: Calculation runs without crash for the test tenant.
       EXPECTED: API returns success. No 500 errors.
       EVIDENCE: [paste API response or console output]

PG-12: calculation_results table has rows for the test tenant.
       SELECT COUNT(*), SUM(total_payout) FROM calculation_results 
       WHERE batch_id IN (SELECT id FROM calculation_batches WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd');
       EXPECTED: COUNT > 0, SUM > 0
       EVIDENCE: [paste query result]

PG-13: At least one entity has total_payout > 0.
       SELECT entity_id, total_payout FROM calculation_results 
       WHERE batch_id IN (SELECT id FROM calculation_batches WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd')
       AND total_payout > 0 LIMIT 5;
       EXPECTED: At least 1 row with non-zero payout
       EVIDENCE: [paste query result]

PG-14: Engine used AI field mappings (not hardcoded constants) to resolve metrics.
       EXPECTED: Console or code trace shows field resolution via import context, not via constants.
       EVIDENCE: [paste the resolution path — how did the engine find "attainment" for a specific component?]
```

### Compliance Check
```
□ Engine reads field mappings from Supabase (not hardcoded)? [YES/NO]
□ Zero FIELD_ID_MAPPINGS or Spanish field names in resolution path? [YES/NO]
□ Non-zero payouts produced for at least some entities? [YES/NO]
□ Results written to calculation_results table? [YES/NO]
□ Calculation batch created with correct lifecycle_state? [YES/NO]
□ Korean Test: would this work for a Korean tenant with Hangul column names? [YES/NO]
```

**Commit:** `OB-74 Mission 4: Calculation engine reads AI mappings — non-zero payouts proven`

---

## MISSION 5: DASHBOARD + LIFECYCLE VERIFICATION

### The Goal
After calculation, verify:
1. Dashboard shows real numbers from calculation_results (not seed data, not AI fabrication)
2. Lifecycle stepper reflects the batch state
3. Five Layers proof view shows drill-down data

### Proof Gates (3)
```
PG-15: Dashboard shows non-zero payout total for Pipeline Test Co.
       EXPECTED: Hero card shows calculated total matching SUM(total_payout) from PG-12.
       EVIDENCE: [paste dashboard value + DB query comparison]

PG-16: Lifecycle stepper shows correct state (DRAFT after first calculation).
       EXPECTED: Batch in DRAFT state. Stepper reflects this.
       EVIDENCE: [paste lifecycle display]

PG-17: Five Layers proof view (/operate/results) shows entity-level breakdown.
       EXPECTED: At least 1 entity visible with non-zero payout.
       EVIDENCE: [paste what renders]
```

**Commit:** `OB-74 Mission 5: Dashboard and lifecycle display verified from calculated data`

---

## MISSION 6: PIPELINE TRUTH TABLE + DOCUMENTATION

### The Goal
Document the complete pipeline state — what works, what was fixed, what remains broken.

### Create Pipeline Truth Table

```markdown
# OB-74 PIPELINE TRUTH TABLE
## Date: [today]
## Tenant: Pipeline Test Co (f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd)

| Stage | Description | Status | Evidence |
|-------|-------------|--------|----------|
| 1 | Plan document upload (PPTX) | [PASS/FAIL] | [one-line evidence] |
| 2 | AI plan interpretation | [PASS/FAIL] | [confidence %, component count] |
| 3 | Rule set save to Supabase | [PASS/FAIL] | [row count in rule_sets] |
| 4 | Data file upload (XLSX) | [PASS/FAIL] | [file accepted, sheets detected] |
| 5 | AI sheet classification | [PASS/FAIL] | [confidence scores per sheet] |
| 6 | AI field mapping | [PASS/FAIL] | [auto-selected count vs total fields] |
| 7 | Field mapping UI (dropdown) | [PASS/FAIL] | [high-confidence pre-selected, not "Ignore"] |
| 8 | Data commit to committed_data | [PASS/FAIL] | [row count] |
| 9 | Entity resolution | [PASS/FAIL] | [entity count created] |
| 10 | Period creation | [PASS/FAIL] | [period count created] |
| 11 | Rule set assignment | [PASS/FAIL] | [assignment count] |
| 12 | Calculation run | [PASS/FAIL] | [total payout, entity count] |
| 13 | Results in calculation_results | [PASS/FAIL] | [row count, non-zero count] |
| 14 | Dashboard displays real data | [PASS/FAIL] | [value matches DB] |
| 15 | Lifecycle state correct | [PASS/FAIL] | [state shown] |

## Fixes Applied This OB
| Fix | Stage | Description | Files Modified |
|-----|-------|-------------|----------------|
| ... | ... | ... | ... |

## Remaining Issues (Honest)
| Issue | Stage | Description | Severity |
|-------|-------|-------------|----------|
| ... | ... | ... | ... |
```

### Proof Gates (2)
```
PG-18: Pipeline Truth Table created with evidence for all 15 stages.
       EXPECTED: Every stage has PASS/FAIL with specific evidence.
       EVIDENCE: [table exists in completion report]

PG-19: Build passes with zero errors.
       EXPECTED: npm run build exits 0.
       EVIDENCE: [paste build output summary]
```

**Commit:** `OB-74 Mission 6: Pipeline Truth Table documented`

---

## PHASE FINAL: COMPLETION REPORT + PR

Create `OB-74_COMPLETION_REPORT.md` at PROJECT ROOT with:

1. **Phase 0 Diagnostic Summary** — Complete pipeline state from diagnostic
2. **Architecture Decision** — Stage-by-stage assessment
3. **Mission 1: Test Tenant** — Provisioned, zero data confirmed
4. **Mission 2: Plan Import** — AI interpretation, rule_set written, fixes applied
5. **Mission 3: Data Import** — AI classification, field mapping, commit, entity/period creation
6. **Mission 4: Calculation** — Engine resolution path, field mapping consumption, non-zero payouts
7. **Mission 5: Dashboard + Lifecycle** — Display verification
8. **Mission 6: Pipeline Truth Table** — Complete 15-stage table
9. **Fixes Applied** — Every code change with before/after
10. **Anti-Patterns Addressed** — AP-5 through AP-7 (hardcoded fields), AP-18 (AI hallucination)
11. **Korean Test** — Would this pipeline work for a tenant with Hangul column names? Evidence.
12. **ALL PROOF GATES** — 19 total, evidence for every gate
13. **STANDING RULE COMPLIANCE**
14. **KNOWN ISSUES** — Honest assessment of what still doesn't work

### Create PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-74: Engine Validation — Full Pipeline Proof from Clean Tenant" \
  --body "## What This OB Proves

This is the definitive end-to-end pipeline proof. A fresh tenant with ZERO seed data
proves every stage works through the browser UI on Supabase.

### Pipeline Stages Proven
1. Plan Upload → AI Interpretation → rule_sets in Supabase
2. Data Upload → AI Sheet Classification → AI Field Mapping → committed_data in Supabase
3. Entity Resolution → Period Creation → Rule Set Assignment
4. Calculation Engine → Reads AI field mappings (NOT hardcoded) → Non-zero payouts
5. Dashboard → Real calculated data displayed
6. Lifecycle → Correct state

### The Korean Test (Architectural Proof)
Zero hardcoded field names in the resolution path. The engine reads AI-determined
semantic mappings. A Korean tenant uploading Hangul-named columns would produce
the same pipeline behavior.

### Pipeline Truth Table
15-stage assessment with PASS/FAIL and evidence for each stage.

## Proof Gates: 19 — see OB-74_COMPLETION_REPORT.md"
```

**Commit:** `OB-74 Final: Completion report + PR`

---

## MAXIMUM SCOPE

6 missions, 19 proof gates. After this OB:

1. Fresh tenant provisioned with zero data ✓
2. Plan import through UI → rule_set in Supabase ✓
3. Data import through UI → AI classification + mapping → committed_data ✓
4. Calculation engine reads AI mappings → non-zero payouts ✓
5. Dashboard displays calculated results ✓
6. Complete pipeline truth table documented ✓

**DO NOT** fix RetailCDMX data issues. This is a separate, clean tenant test.
**DO NOT** add new features, dashboard components, or UI polish.
**DO NOT** seed calculation results or entity_period_outcomes directly — they MUST come from the pipeline.
**DO NOT** use localStorage for any business data.

**This OB is INTERACTIVE.** Andrew will upload files at specific points (Missions 2 and 3). CC must pause at those points, confirm infrastructure is ready, and wait for the upload before verifying results. The file uploads are the test — not a formality.

---

## ANTI-PATTERNS TO WATCH

- **AP-5/AP-6/AP-7**: No hardcoded field names anywhere in the resolution path
- **AP-8**: Any Supabase migrations must be executed live and verified
- **AP-9/AP-10**: Proof gates verify LIVE state, not code review
- **AP-11**: Real data displayed, not empty containers
- **AP-13**: All column names verified against SCHEMA_REFERENCE.md
- **AP-18**: AI assessment (if displayed) must validate data exists first

---

*OB-74 — February 21, 2026*
*"The seed scripts proved the math works. This OB proves the pipeline works."*
*"Korean Test: not just zero hardcoded constants — zero hardcoded resolution paths."*
