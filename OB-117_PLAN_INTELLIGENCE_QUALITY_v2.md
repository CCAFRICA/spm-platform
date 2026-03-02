# OB-117: PLAN INTELLIGENCE QUALITY — MBC INTERPRETATION FIXES
## Target: alpha.4.0
## Date: March 1, 2026
## Derived From: OB-116 Completion Report + Decision 64 (Dual Intelligence Architecture)
## Depends On: OB-116 merged (PR #127)

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit. If something fails, diagnose and fix — do not stop and ask.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply, all anti-patterns apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `OB-116_COMPLETION_REPORT.md` — calculation results, root cause analysis, remaining failures
4. `DECISION_64_DUAL_INTELLIGENCE_SPECIFICATION.md` — the architecture this OB implements against

**Read all four before doing anything. Do not skim. Do not skip sections.**

---

## WHY THIS OB EXISTS

OB-116 proved the pipeline can produce non-zero calculations ($6.3M Consumer Lending). But it also exposed two **Plan Intelligence quality failures** — cases where the AI interpreted plan documents incorrectly:

### Failure 1: Mortgage Origination Bonus — Rate Misinterpretation
The plan has tiered rates: 0.002, 0.003, 0.004. These are rates to be MULTIPLIED against origination volume. The AI interpreted them as `tier_lookup` (flat payout = tier value). Result: Employee Ruiz with $9.28M volume gets $0.003 instead of $27,845.

**Root cause:** The plan interpreter does not distinguish between tier values that are rates (< 1.0, meant to multiply against a base) and tier values that are absolute amounts (> 1.0, meant to be the payout). When tier values are decimals significantly less than 1.0, they are almost certainly rates.

**Correct interpretation:** This should be a `conditional_percentage` or `scalar_multiply` — look up the rate based on volume tier, then multiply rate × volume to get payout.

### Failure 2: Insurance Referral Program — Empty Configuration
All 5 components have `tierConfig.metric = "unknown"` and `tierConfig.tiers = []` (empty array). The `calculationIntent` has the correct structure (scalar_multiply with rates), but the legacy evaluator reads `tierConfig`, not `calculationIntent`.

**Root cause:** Dual problem:
1. AI plan interpretation failed to populate `tierConfig` fields — everything is "unknown" or empty
2. The evaluator path selection reads `tierConfig` instead of `calculationIntent`

### Important Context: calculationIntent Already Exists
OB-77 built the Calculation Intent system. The AI plan interpreter ALREADY produces `calculationIntent` in component configs using 7 structural primitives (bounded_lookup_1d, scalar_multiply, etc.). The question is whether the evaluator CONSUMES `calculationIntent` or still relies on `tierConfig`.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. Supabase `.in()` calls MUST batch ≤200 items per call.
7. **Every proof gate requires pasted evidence. Proof gates are IMMUTABLE — do not substitute, redefine, or skip any criterion.**
8. **Fix logic not data — never provide answer values, never hardcode expected outputs.**

---

## CC FAILURE PATTERNS — READ AND INTERNALIZE

These are documented failures from 100+ OB sessions. Each one has happened. Each one wasted hours. Do not repeat them.

### Pattern 1: Hardcoding Answer Keys
CC embeds expected values instead of fixing logic. Example: hardcoded tier values instead of reading AI-extracted data.
**For this OB:** Do NOT hardcode any MBC-specific values, rates, thresholds, or field names.

### Pattern 2: Build Without Proving
CC passes its own tests but browser disagrees. Example: code works in theory but browser shows old behavior.
**For this OB:** After every fix, verify with a database query that calculation results actually changed.

### Pattern 3: Regression by Overcorrection
Fixing A breaks B, C, D. Example: OB-85 R4 killed 3 components while fixing inflation.
**For this OB:** After fixing Mortgage/Insurance, re-verify Consumer Lending still produces ~$6.3M. If it changed, you broke something.

### Pattern 4: Parallel Code Paths
CC creates new path instead of fixing existing. Example: GPV + Enhanced coexisting.
**For this OB:** Fix the existing evaluator path. Do NOT create a new evaluator.

### Pattern 5: Browser Access Attempts
CC can't view URLs. Don't try.

### Pattern 6: Theory-First Diagnosis
CC guesses problem without tracing data. Example: R2 guessed "period selection" was wrong — actual problem was different.
**For this OB:** Phase 2 requires reading actual code and actual database state BEFORE proposing any fix. Trace the data flow from component config → evaluator selection → calculation → result.

### Pattern 7: Fix Doesn't Deploy
Code changed but browser shows old behavior. Stale cache, wrong file, wrong branch.
**For this OB:** After every change, the full cycle: kill dev → rm -rf .next → npm run build → npm run dev → confirm localhost:3000.

### Pattern 8: Supabase Silent Failure
`.in()` with >200 UUIDs returns 0 rows, no error. Hit 3 times in production.
**For this OB:** If querying entities or results, batch at 200.

### Pattern 9: Overcorrection
Example: MX$4.19B → MX$525K — killed 3 components while fixing one.
**For this OB:** Touch ONLY the Mortgage and Insurance Referral code paths. Do not touch Consumer Lending or Deposit Growth.

### Pattern 10: "Was Never Broken" Claims
CC claims something was never broken when browser evidence disagrees.
**For this OB:** Trust database query results over code analysis. If the DB says $0.003, the code is wrong regardless of what the logic "should" do.

### Pattern 11: Script Infrastructure Fails
Diagnostic scripts time out on Supabase connection.
**For this OB:** Use the app's existing connection pattern for database queries.

### Pattern 12: Persona Scope Bug
Checking `user.role` instead of `effectivePersona`.
**Not directly relevant to this OB but do not introduce.**

### Pattern 13: Stops Despite Autonomy Directive
CC pauses to ask for confirmation despite being told not to.
**For this OB:** DO NOT STOP. If you encounter an ambiguity, make the best decision, document it, and continue. Report the decision in the completion report.

### Pattern 14: Invents Columns
CC references non-existent database columns.
**For this OB:** Before writing ANY query, verify column names exist using `SCHEMA_REFERENCE.md` or `information_schema.columns`.

### Pattern 15: PDR Substitution
CC redefines proof gate criteria to claim PASS. Registry says "browser screenshot." CC provides grep output and says PASS.
**For this OB:** Proof gates are IMMUTABLE. If a proof gate says "paste calculation results showing non-zero", paste the actual results. Do not substitute a different verification method.

### Pattern 16: Bloodwork Skeleton
CC creates page structure without rendering logic. Pages exist in filesystem, show blank in browser.
**Not directly relevant to this OB.**

### Pattern 17: Observatory Data Trust
Admin surfaces show wrong data for tenants with confirmed data.
**Not directly relevant to this OB.**

---

## CC PROMPT DIRECTIVES — ACCUMULATED FROM 100+ OBs

### TRACE BEFORE FIX
Before fixing any code, trace the full data flow:
1. What data enters the function? (Read the input — `cat` the calling code)
2. What does the function do with it? (Read the function body)
3. What comes out? (Query the database for actual output)
4. Where does the output go? (Read the consumer code)

Do NOT guess. Do NOT theorize. READ THE CODE, then READ THE DATA.

### CONTRACT-FIRST DEVELOPMENT
Before implementing any change to a producer (e.g., fixing how plan interpretation generates component configs), first read the CONSUMER's code (e.g., the evaluator that reads component configs) to understand what field names, types, and structures it expects. Then fix the producer to match that exact contract.

`cat` the consumer interface BEFORE modifying the producer.

### NO PLACEHOLDERS, NO STUBS, NO HARDCODED STAND-INS
If a function receives data from an upstream source (AI response, import pipeline, API), it must USE that data. Never substitute placeholder/hardcoded values "for now" or "as a fallback." If the upstream data is unavailable, throw an error — don't silently replace it with fake data. A visible failure is always better than an invisible wrong answer.

### THINK IN DATA SHAPES
Before applying a fix, answer in writing:
- What does the data look like BEFORE this code?
- What does it look like AFTER?
- What are the edge cases (empty, null, wrong type)?
- What happens when this code runs TWICE?

### READ CODE FIRST, LOG SECOND
When diagnosing a bug, start by reading (cat/view) the relevant source files. Only add diagnostic logging if code review doesn't reveal the issue. Never add diagnostics that require a human to test, screenshot, and report back if you can find the answer by reading the code yourself.

### STALE STATE AWARENESS
After making changes, consider: Is there cached/previous data that will mask the fix? Do old calculation results need to be cleared? Is there a draft/active status distinction that matters? For this OB, you MUST clear old calculation results before re-running, or you'll see stale $0.003 results and think the fix didn't work.

---

## PHASE 0: PRE-FLIGHT — VERIFY OB-116 IS MERGED (10 min)

### 0A: Confirm dev branch is current

```bash
cd ~/spm-platform
git checkout dev && git pull origin dev
git log --oneline -10
```

Verify OB-116 commits are present. If not, STOP.

### 0B: Capture current state — Rule sets and components

Query the database for MBC rule sets and their current interpretation state:

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: tenants } = await sb.from('tenants').select('id, name').ilike('name', '%bank%');
  const tenantId = tenants[0].id;
  console.log('Tenant:', tenants[0].name, tenantId);
  
  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name, status, input_bindings')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  
  for (const rs of ruleSets) {
    console.log('\n=== Rule Set:', rs.name, '===');
    console.log('input_bindings:', JSON.stringify(rs.input_bindings, null, 2));
    
    const { data: components } = await sb.from('rule_set_components')
      .select('id, name, component_type, config')
      .eq('rule_set_id', rs.id);
    
    for (const c of components) {
      console.log('\n  Component:', c.name);
      console.log('  Type:', c.component_type);
      const config = c.config || {};
      if (config.tierConfig) {
        console.log('  tierConfig.metric:', config.tierConfig.metric);
        console.log('  tierConfig.tiers count:', (config.tierConfig.tiers || []).length);
        if (config.tierConfig.tiers?.length > 0) {
          console.log('  First tier:', JSON.stringify(config.tierConfig.tiers[0]));
          console.log('  Last tier:', JSON.stringify(config.tierConfig.tiers[config.tierConfig.tiers.length - 1]));
        }
      }
      if (config.calculationIntent) {
        console.log('  calculationIntent.operation:', config.calculationIntent.operation);
        console.log('  calculationIntent (full):', JSON.stringify(config.calculationIntent, null, 2));
      }
      if (!config.tierConfig && !config.calculationIntent) {
        console.log('  FULL CONFIG:', JSON.stringify(config, null, 2));
      }
    }
  }
}
run();
"
```

**Proof gate 0B (IMMUTABLE):** Paste the FULL output showing current state of all 4 rule sets and their components. This is the baseline.

### 0C: Capture current calculation results

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: tenants } = await sb.from('tenants').select('id, name').ilike('name', '%bank%');
  const tenantId = tenants[0].id;
  
  const { data: results } = await sb.from('calculation_results')
    .select('rule_set_id, period_id, payout_amount')
    .eq('tenant_id', tenantId);
  
  const byRuleSet = {};
  for (const r of results) {
    if (!byRuleSet[r.rule_set_id]) byRuleSet[r.rule_set_id] = { count: 0, total: 0 };
    byRuleSet[r.rule_set_id].count++;
    byRuleSet[r.rule_set_id].total += parseFloat(r.payout_amount || 0);
  }
  
  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name').eq('tenant_id', tenantId).eq('status', 'active');
  const nameMap = {};
  for (const rs of ruleSets) nameMap[rs.id] = rs.name;
  
  console.log('BASELINE CALCULATION RESULTS:');
  for (const [rsId, data] of Object.entries(byRuleSet)) {
    console.log(nameMap[rsId] || rsId, ':', data.count, 'results, total:', data.total.toFixed(2));
  }
  console.log('GRAND TOTAL:', results.reduce((s, r) => s + parseFloat(r.payout_amount || 0), 0).toFixed(2));
}
run();
"
```

**Proof gate 0C (IMMUTABLE):** Paste output showing baseline totals. Expected: Consumer Lending ~$6.3M, Mortgage ~$0.18, Deposit $0, Insurance $0.

---

## PHASE 1: ARCHITECTURE DECISION (15 min)

Before writing ANY code, answer this in writing and commit:

```
ARCHITECTURE DECISION RECORD — OB-117
======================================
Problem: Two MBC plans produce wrong/zero results due to plan interpretation quality failures.
- Mortgage: tier values are rates (0.002-0.004), interpreted as flat payouts
- Insurance Referral: tierConfig empty, calculationIntent may have correct structure

Option A: Fix AI plan interpretation prompt to populate tierConfig correctly
  - Scale test: Works at 10x? YES — prompt improvement applies to all future plans
  - AI-first: Any hardcoding? NO — improving AI interpretation quality
  - Transport: Data through HTTP bodies? N/A
  - Atomicity: Clean state on failure? YES — plan re-interpretation is idempotent
  - Risk: Requires re-running AI interpretation for existing plans

Option B: Make evaluator consume calculationIntent instead of tierConfig
  - Scale test: Works at 10x? YES — calculationIntent is the target architecture
  - AI-first: Any hardcoding? NO — consuming AI output correctly
  - Transport: Data through HTTP bodies? N/A
  - Atomicity: Clean state on failure? YES — evaluator change, no state mutation
  - Risk: calculationIntent may also be wrong/incomplete for some components

Option C: Both — fix evaluator to prefer calculationIntent, AND improve AI interpretation quality
  - Scale test: YES
  - AI-first: YES
  - Risk: Larger change surface, higher regression risk (Pattern #3 and #9)

CHOSEN: Option ___ because ___
REJECTED: Option ___ because ___
```

**Important context for the decision:**
- `calculationIntent` is the architecturally correct path per the Calculation Intent Specification (Decision 64)
- `tierConfig` is a legacy intermediate format
- OB-77 already built calculationIntent production — the AI ALREADY generates it
- The question is: does the evaluator consume it? And is the generated calculationIntent correct for MBC?

**Proof gate 1 (IMMUTABLE):** Paste the completed Architecture Decision Record with chosen option and reasoning.

---

## PHASE 2: DIAGNOSE — TRACE THE EXACT CODE PATHS (30 min)

**DIRECTIVE: READ CODE FIRST. Do not guess. Do not theorize. Read every file in the chain.**

### 2A: Find and read the evaluator path selection

The calculation engine receives a component and decides which evaluator to call. Find this code:

```bash
cd ~/spm-platform
grep -rn "evaluateTierLookup\|evaluatePercentage\|evaluateConditional\|evaluateScalar\|component_type\|calculationIntent" web/src/lib/orchestration/ --include="*.ts" | head -40
```

Then READ the evaluator dispatch function in full:

```bash
# Find the main calculation/evaluation entry point
grep -rn "function evaluate\|function calculate\|function runCalculation\|switch.*component_type\|switch.*operation" web/src/lib/orchestration/ --include="*.ts" | head -20
```

For each file found, `cat` the relevant function completely. Do not read 5 lines — read the entire function.

**Proof gate 2A (IMMUTABLE):** Paste:
1. The file path and function name of the evaluator dispatch
2. The complete dispatch logic (what determines which evaluator is called)
3. Whether it reads `tierConfig` or `calculationIntent` or both

### 2B: Read the Mortgage component config from the database

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: tenants } = await sb.from('tenants').select('id').ilike('name', '%bank%');
  const { data: ruleSets } = await sb.from('rule_sets').select('id').eq('tenant_id', tenants[0].id).ilike('name', '%mortgage%');
  const { data: components } = await sb.from('rule_set_components').select('*').eq('rule_set_id', ruleSets[0].id);
  for (const c of components) {
    console.log('=== MORTGAGE Component:', c.name, '===');
    console.log('component_type:', c.component_type);
    console.log('FULL CONFIG:');
    console.log(JSON.stringify(c.config, null, 2));
  }
}
run();
"
```

**Proof gate 2B (IMMUTABLE):** Paste the COMPLETE config JSON for all Mortgage components. We need to see BOTH tierConfig and calculationIntent contents.

### 2C: Read the Insurance Referral component config from the database

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: tenants } = await sb.from('tenants').select('id').ilike('name', '%bank%');
  const { data: ruleSets } = await sb.from('rule_sets').select('id').eq('tenant_id', tenants[0].id).ilike('name', '%insurance%');
  const { data: components } = await sb.from('rule_set_components').select('*').eq('rule_set_id', ruleSets[0].id);
  for (const c of components) {
    console.log('=== INSURANCE Component:', c.name, '===');
    console.log('component_type:', c.component_type);
    console.log('FULL CONFIG:');
    console.log(JSON.stringify(c.config, null, 2));
  }
}
run();
"
```

**Proof gate 2C (IMMUTABLE):** Paste COMPLETE config JSON for all Insurance Referral components.

### 2D: Read the Consumer Lending component config (the WORKING case)

This is the control case. Consumer Lending works correctly ($6.3M). Understanding WHY it works tells you what the broken ones are missing.

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: tenants } = await sb.from('tenants').select('id').ilike('name', '%bank%');
  const { data: ruleSets } = await sb.from('rule_sets').select('id').eq('tenant_id', tenants[0].id).ilike('name', '%consumer%');
  const { data: components } = await sb.from('rule_set_components').select('*').eq('rule_set_id', ruleSets[0].id);
  for (const c of components) {
    console.log('=== CONSUMER LENDING Component:', c.name, '===');
    console.log('component_type:', c.component_type);
    console.log('FULL CONFIG:');
    console.log(JSON.stringify(c.config, null, 2));
  }
}
run();
"
```

**Proof gate 2D (IMMUTABLE):** Paste COMPLETE config JSON for Consumer Lending. Compare: what does the working case have that Mortgage and Insurance lack?

### 2E: Read the evaluator functions in full

Based on what you found in 2A, `cat` the complete evaluator functions for:
- The evaluator that handles Mortgage (likely `evaluateTierLookup`)
- The evaluator that handles Consumer Lending (likely `evaluatePercentage`)
- Any evaluator that handles `calculationIntent` operations

**Proof gate 2E (IMMUTABLE):** Paste the complete function bodies for each evaluator involved. Annotate what each one reads from the component config.

### 2F: SYNTHESIS — Write the diagnosis

Before proceeding to Phase 3, write a diagnosis document that answers:

1. **Mortgage path:** Component enters evaluator as type X → evaluator reads field Y from config → field Y contains Z → evaluator produces result W. WHY is W wrong?
2. **Insurance path:** Component enters evaluator as type X → evaluator reads field Y from config → field Y is empty/unknown → evaluator produces $0. WHY is Y empty?
3. **Consumer Lending path (control):** Component enters evaluator as type X → evaluator reads field Y → produces correct result. WHAT is different about this path?
4. **The fix:** Based on the above, the exact change needed is [specific file, specific function, specific logic change].

**Proof gate 2F (IMMUTABLE):** Paste the complete diagnosis. This diagnosis drives Phase 3. Do NOT proceed to Phase 3 without completing this.

---

## PHASE 3: FIX — IMPLEMENT BASED ON DIAGNOSIS (60 min)

Based on the Architecture Decision from Phase 1 and the diagnosis from Phase 2, implement the fix.

### Critical constraints:

1. **Do NOT hardcode MBC-specific logic.** No tenant names, no field names, no MBC-specific rates or thresholds. The fix must work for ANY plan with rate-based tiers. (CC Failure Pattern #1)
2. **Do NOT create a new evaluator.** Fix the existing path or make it consume the correct config. (CC Failure Pattern #4)
3. **Rate detection heuristic must be general:** If all tier values are < 1.0 AND the input is a monetary volume, the values are rates (multiply against volume), not flat payouts. This is a reasonable general heuristic.
4. **CONTRACT-FIRST:** Before changing how the evaluator reads config, `cat` the evaluator function to see what it expects. Before changing how the interpreter writes config, `cat` the evaluator to see what it consumes. Match the contract.
5. **THINK IN DATA SHAPES:** What does Mortgage component config look like before your change? After? What happens if a plan has tier values > 1.0 (they're amounts, not rates)? Your fix must handle BOTH cases.
6. **Do NOT touch Consumer Lending or Deposit Growth code paths.** Only Mortgage and Insurance Referral. (CC Failure Pattern #9 — overcorrection)

### After implementing EACH fix (not at the end — after EACH one):

```bash
cd ~/spm-platform
git add -A && git commit -m "OB-117: [description of this specific fix]"
git push origin dev
kill $(lsof -t -i:3000) 2>/dev/null; rm -rf web/.next; cd web && npm run build && npm run dev &
# Wait for server to start, then:
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

**Proof gate 3 (IMMUTABLE):** For each code change, paste:
1. The exact file path and line numbers changed
2. A `git diff` snippet showing the change
3. `localhost:3000` returns HTTP 200 after rebuild

---

## PHASE 4: RE-CALCULATE AND VERIFY (30 min)

### 4A: Clear existing MBC calculation results

**STALE STATE AWARENESS:** You MUST clear old results or you'll see stale data and think the fix didn't work.

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: tenants } = await sb.from('tenants').select('id').ilike('name', '%bank%');
  const tenantId = tenants[0].id;
  
  const r1 = await sb.from('calculation_results').delete().eq('tenant_id', tenantId);
  console.log('Deleted calculation_results:', r1.error || 'OK');
  const r2 = await sb.from('calculation_batches').delete().eq('tenant_id', tenantId);
  console.log('Deleted calculation_batches:', r2.error || 'OK');
  const r3 = await sb.from('entity_period_outcomes').delete().eq('tenant_id', tenantId);
  console.log('Deleted entity_period_outcomes:', r3.error || 'OK');
  
  // Verify clean slate
  const { count } = await sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  console.log('Remaining calculation_results:', count, '(should be 0)');
}
run();
"
```

**Proof gate 4A (IMMUTABLE):** Paste output confirming 0 remaining calculation results.

### 4B: Re-run calculations

Trigger calculation for all 4 MBC rule sets × 3 periods. Use the existing calculation trigger mechanism (API route or function call). If unsure how to trigger, read the code:

```bash
grep -rn "run-calculation\|runCalculation\|/api/calculate" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20
```

### 4C: Verify results — THE CRITICAL GATE

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: tenants } = await sb.from('tenants').select('id').ilike('name', '%bank%');
  const tenantId = tenants[0].id;
  
  const { data: results } = await sb.from('calculation_results')
    .select('rule_set_id, period_id, entity_id, payout_amount, details')
    .eq('tenant_id', tenantId);
  
  const { data: ruleSets } = await sb.from('rule_sets').select('id, name').eq('tenant_id', tenantId).eq('status', 'active');
  const { data: periods } = await sb.from('periods').select('id, label').eq('tenant_id', tenantId);
  const rsNames = Object.fromEntries(ruleSets.map(r => [r.id, r.name]));
  const pNames = Object.fromEntries(periods.map(p => [p.id, p.label]));
  
  // Group by rule set × period
  const groups = {};
  for (const r of results) {
    const key = rsNames[r.rule_set_id] + ' | ' + (pNames[r.period_id] || r.period_id);
    if (!groups[key]) groups[key] = { count: 0, total: 0, nonZero: 0 };
    groups[key].count++;
    const amt = parseFloat(r.payout_amount || 0);
    groups[key].total += amt;
    if (amt > 0) groups[key].nonZero++;
  }
  
  console.log('POST-FIX CALCULATION RESULTS:');
  console.log('=============================');
  for (const [key, data] of Object.entries(groups).sort()) {
    console.log(key + ': ' + data.count + ' results, ' + data.nonZero + ' non-zero, total: $' + data.total.toFixed(2));
  }
  
  const grandTotal = results.reduce((s, r) => s + parseFloat(r.payout_amount || 0), 0);
  console.log('\\nGRAND TOTAL: $' + grandTotal.toFixed(2));
  
  // REGRESSION CHECK: Consumer Lending must still be ~$6.3M
  const clTotal = results
    .filter(r => (rsNames[r.rule_set_id] || '').includes('Consumer'))
    .reduce((s, r) => s + parseFloat(r.payout_amount || 0), 0);
  console.log('\\nREGRESSION CHECK — Consumer Lending total: $' + clTotal.toFixed(2));
  console.log('Consumer Lending expected: ~$6,319,876');
  console.log('Regression:', Math.abs(clTotal - 6319876) > 100000 ? '⚠️ POSSIBLE REGRESSION' : '✓ Within tolerance');
  
  // BENCHMARK: Ruiz Mortgage result
  const { data: entities } = await sb.from('entities').select('id, name').eq('tenant_id', tenantId).ilike('name', '%ruiz%');
  if (entities.length > 0) {
    const ruizMortgage = results.filter(r => 
      r.entity_id === entities[0].id && (rsNames[r.rule_set_id] || '').includes('Mortgage')
    );
    console.log('\\nBENCHMARK — Ruiz Mortgage:');
    for (const r of ruizMortgage) {
      const amt = parseFloat(r.payout_amount || 0);
      console.log('  Period:', pNames[r.period_id], '→ $' + amt.toFixed(2));
      if (r.details) console.log('  Details:', JSON.stringify(r.details).substring(0, 300));
    }
    console.log('  Expected: ~$27,845 (volume $9.28M × rate 0.003)');
    console.log('  Was: $0.003 (pre-fix — rate returned as flat payout)');
  }
  
  // Insurance Referral check
  const irTotal = results
    .filter(r => (rsNames[r.rule_set_id] || '').includes('Insurance'))
    .reduce((s, r) => s + parseFloat(r.payout_amount || 0), 0);
  console.log('\\nINSURANCE REFERRAL total: $' + irTotal.toFixed(2));
  console.log('Was: $0.00 (pre-fix — empty tierConfig)');
}
run();
"
```

**Proof gate 4C (IMMUTABLE — THE CRITICAL GATE):** Paste the FULL output. The following must be true:

| Criterion | Required Result |
|-----------|----------------|
| Consumer Lending total | Within 5% of $6,319,876 (NO REGRESSION) |
| Mortgage Origination — Ruiz | Approximately $27,845 (rate × volume, NOT $0.003) |
| Mortgage Origination — any entity non-zero | At least one entity has payout > $100 |
| Insurance Referral total | Non-zero (any amount — proves the evaluator path works) |
| Deposit Growth total | $0.00 is acceptable (legitimate data gap — no goals) |

**If Consumer Lending regressed:** STOP. You hit CC Failure Pattern #3/#9 (overcorrection/regression). Revert your changes and re-diagnose.

---

## PHASE 5: COMPLETION REPORT AND PR (15 min)

### 5A: Write completion report

Create `OB-117_COMPLETION_REPORT.md` at repo root with:

1. Summary of what was fixed
2. Architecture Decision Record (from Phase 1)
3. Diagnosis (from Phase 2F — the full trace)
4. Code changes (file, line, what changed, git diff)
5. Before/after calculation comparison table
6. Ruiz benchmark verification
7. Regression check result (Consumer Lending unchanged)
8. What remains for Decision 64 (Data Intelligence Profile, Convergence Layer)
9. Any new findings or unexpected behaviors

### 5B: Create PR

```bash
cd ~/spm-platform
gh pr create --base main --head dev --title "OB-117: Plan Intelligence Quality — MBC Rate Interpretation + Insurance Config" --body "
## Changes
- [list each file changed and why]

## Calculation Results (Before → After)
- Consumer Lending: ~\$6.3M → ~\$6.3M (unchanged, regression check passed)
- Mortgage Origination: \$0.18 → \$X (rate × volume)
- Insurance Referral: \$0 → \$Y (evaluator path fixed)
- Deposit Growth: \$0 → \$0 (expected — no goal data)

## Benchmark
- Ruiz Mortgage: \$0.003 → ~\$27,845

## Architecture
Decision 64 — Plan Intelligence quality (first OB in Dual Intelligence sequence)
Derived from: OB-116 Completion Report
"
```

### 5C: Final verification

```bash
cd ~/spm-platform
git log --oneline -10
echo "---"
gh pr list --state open
```

**Proof gate 5C (IMMUTABLE):** Paste output confirming PR created with descriptive title.

---

## SUCCESS CRITERIA (IMMUTABLE — DO NOT MODIFY)

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | Mortgage payouts are rate × volume, not flat rate | Ruiz: ~$27,845 not $0.003 |
| 2 | Insurance Referral produces non-zero results | Any entity has payout > 0 |
| 3 | Consumer Lending UNCHANGED (~$6.3M) | Regression check in Phase 4C |
| 4 | Deposit Growth remains $0 with documentation | Expected — no goal values |
| 5 | No hardcoded MBC-specific logic | Zero tenant names, field names, or rates in code |
| 6 | No new evaluator functions created | Fix existing paths only |
| 7 | Fix works for general case | Rate heuristic: values < 1.0 = rates when input is monetary |
| 8 | Architecture Decision committed before implementation | Phase 1 completed and committed |
| 9 | Full diagnosis trace completed before any code change | Phase 2F synthesis written |
| 10 | Completion report with before/after evidence | All proof gates satisfied |

---

## WHAT NOT TO DO (EXPLICIT PROHIBITIONS)

1. **Do NOT add entries to SHEET_COMPONENT_PATTERNS.** (CC Failure Pattern #1)
2. **Do NOT create a new evaluator function.** Fix the existing path. (CC Failure Pattern #4)
3. **Do NOT re-import data.** OB-116 data is clean. (Stale state — data is fine, logic is wrong)
4. **Do NOT try to fix Deposit Growth $0.** It's a legitimate gap. Document it. (Overcorrection risk)
5. **Do NOT modify Consumer Lending code path.** It works. Don't touch it. (CC Failure Pattern #9)
6. **Do NOT hardcode rate thresholds.** The heuristic must be general. (Standing Rule: Korean Test)
7. **Do NOT substitute proof gate criteria.** Each gate is immutable. (CC Failure Pattern #15)
8. **Do NOT stop to ask for permission.** Make decisions, document them, continue. (CC Failure Pattern #13)
9. **Do NOT guess at the problem.** Read code, read data, THEN propose fix. (CC Failure Pattern #6)
10. **Do NOT skip the diagnosis phase.** Phase 2 must be complete before Phase 3 starts. (Decision 65)

---

## CHECKLIST (from CC_STANDING_ARCHITECTURE_RULES.md)

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
□ Consumer Lending regression check PASSED?
□ Ruiz benchmark verified?
```

---

*"The plan tells you what it needs. Intelligence is interpreting that correctly."*
*"Trace before fix. Read code first, log second. Think in data shapes."*
*Decision 64 — Dual Intelligence Architecture. This OB addresses Plan Intelligence quality.*
