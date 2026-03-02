# OB-117: PLAN INTELLIGENCE QUALITY — MBC INTERPRETATION FIXES
## Target: alpha.4.0
## Date: March 1, 2026
## Derived From: OB-116 Completion Report + Decision 64 (Dual Intelligence Architecture)
## Depends On: OB-116 merged (PR #127)

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `OB-116_COMPLETION_REPORT.md` — calculation results, root cause analysis, remaining failures
4. `DECISION_64_DUAL_INTELLIGENCE_SPECIFICATION.md` — the architecture this OB implements against

**Read all four before doing anything.**

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

**Correct behavior:** Either (a) fix AI to populate `tierConfig` correctly, or (b) make the evaluator consume `calculationIntent` instead of `tierConfig`. Option (b) is architecturally correct — `calculationIntent` is the target format per the Calculation Intent Specification.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. Supabase `.in()` calls MUST batch ≤200 items per call.
7. **Every proof gate requires pasted evidence.**

---

## PHASE 0: PRE-FLIGHT — VERIFY OB-116 IS MERGED (10 min)

### 0A: Confirm dev branch is current

```bash
cd ~/spm-platform
git checkout dev && git pull origin dev
git log --oneline -10
```

Verify OB-116 commits are present. If not, STOP.

### 0B: Capture current state

Query the database for MBC rule sets and their current interpretation state:

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  // Get MBC tenant
  const { data: tenants } = await sb.from('tenants').select('id, name').ilike('name', '%bank%');
  const tenantId = tenants[0].id;
  console.log('Tenant:', tenants[0].name, tenantId);
  
  // Get all active rule sets
  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name, status, input_bindings')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  
  for (const rs of ruleSets) {
    console.log('\n=== Rule Set:', rs.name, '===');
    console.log('input_bindings:', JSON.stringify(rs.input_bindings, null, 2));
    
    // Get components
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
        }
      }
      if (config.calculationIntent) {
        console.log('  calculationIntent.operation:', config.calculationIntent.operation);
      }
    }
  }
}
run();
"
```

**Proof gate 0B:** Paste the FULL output showing current state of all 4 rule sets and their components.

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
  
  // Group by rule_set_id
  const byRuleSet = {};
  for (const r of results) {
    if (!byRuleSet[r.rule_set_id]) byRuleSet[r.rule_set_id] = { count: 0, total: 0 };
    byRuleSet[r.rule_set_id].count++;
    byRuleSet[r.rule_set_id].total += parseFloat(r.payout_amount || 0);
  }
  
  // Get rule set names
  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  
  const nameMap = {};
  for (const rs of ruleSets) nameMap[rs.id] = rs.name;
  
  console.log('\\nBASELINE CALCULATION RESULTS:');
  for (const [rsId, data] of Object.entries(byRuleSet)) {
    console.log(nameMap[rsId] || rsId, ':', data.count, 'results, $' + data.total.toFixed(2));
  }
  console.log('\\nGRAND TOTAL:', results.reduce((s, r) => s + parseFloat(r.payout_amount || 0), 0).toFixed(2));
}
run();
"
```

**Proof gate 0C:** Paste output showing baseline totals (expected: Consumer Lending ~$6.3M, Mortgage ~$0.18, Deposit $0, Insurance $0).

---

## PHASE 1: ARCHITECTURE DECISION (15 min)

Before writing ANY code, document the architecture decision:

```
ARCHITECTURE DECISION RECORD
============================
Problem: Two MBC plans produce wrong/zero results due to plan interpretation quality failures.
Mortgage: tier values are rates, interpreted as flat payouts.
Insurance Referral: tierConfig empty, calculationIntent has correct structure but evaluator doesn't read it.

Option A: Fix AI plan interpretation prompt to populate tierConfig correctly
  - Scale test: Works at 10x? YES — prompt improvement applies to all future plans
  - AI-first: Any hardcoding? NO — improving AI interpretation quality
  - Transport: Data through HTTP bodies? N/A
  - Atomicity: Clean state on failure? YES — plan re-interpretation is idempotent

Option B: Make evaluator consume calculationIntent instead of tierConfig
  - Scale test: Works at 10x? YES — calculationIntent is the target architecture
  - AI-first: Any hardcoding? NO — consuming AI output correctly
  - Transport: Data through HTTP bodies? N/A  
  - Atomicity: Clean state on failure? YES — evaluator change, no state mutation

Option C: Both A and B — fix interpretation AND fix evaluator path
  - Scale test: YES
  - AI-first: YES — improving both interpretation AND consumption
  - Transport: N/A
  - Atomicity: YES

CHOSEN: Option ___ because ___
REJECTED: Option ___ because ___
```

**Important context for the decision:** The `calculationIntent` is the architecturally correct path per the Calculation Intent Specification. The `tierConfig` is a legacy intermediate format. Long-term, the evaluator MUST consume `calculationIntent`. Short-term, the question is whether to fix both paths or just the correct one.

**Proof gate 1:** Paste the completed Architecture Decision Record.

---

## PHASE 2: DIAGNOSE — TRACE THE EXACT INTERPRETATION AND EVALUATION PATHS (30 min)

### 2A: Find the plan interpretation code

Locate the AI prompt that interprets plan documents and produces component configurations:

```bash
cd ~/spm-platform
grep -rn "tierConfig\|tier_config\|calculationIntent\|calculation_intent" web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v ".next"
```

**Proof gate 2A:** Paste output showing all files that reference tierConfig and calculationIntent.

### 2B: Find the evaluator path selection

Locate where the calculation engine decides which evaluator to use and what config it reads:

```bash
cd ~/spm-platform
grep -rn "evaluateTierLookup\|evaluatePercentage\|evaluateConditional\|component_type\|calculationIntent" web/src/lib/orchestration/ --include="*.ts" | head -30
```

**Proof gate 2B:** Paste output showing evaluator selection logic.

### 2C: Read the Mortgage component configuration in detail

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
    console.log('=== Component:', c.name, '===');
    console.log(JSON.stringify(c.config, null, 2));
  }
}
run();
"
```

**Proof gate 2C:** Paste FULL config JSON for all Mortgage components. We need to see exactly what tierConfig and calculationIntent contain.

### 2D: Read the Insurance Referral component configuration in detail

Same as 2C but for Insurance Referral:

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
    console.log('=== Component:', c.name, '===');
    console.log(JSON.stringify(c.config, null, 2));
  }
}
run();
"
```

**Proof gate 2D:** Paste FULL config JSON for all Insurance Referral components.

### 2E: Read the evaluator functions

```bash
cd ~/spm-platform
# Find the run-calculation or evaluator files
find web/src/lib/orchestration -name "*.ts" | head -20
```

Then read the evaluator functions that handle tier_lookup, percentage, and conditional calculations. We need to understand exactly what path the engine takes for each component type.

**Proof gate 2E:** Paste the evaluator function signatures and the key logic for tier_lookup, percentage, and conditional evaluators.

---

## PHASE 3: FIX — IMPLEMENT BASED ON ARCHITECTURE DECISION (60 min)

Based on the Architecture Decision from Phase 1 and the diagnosis from Phase 2, implement the fix.

### Critical constraints:

1. **Do NOT hardcode MBC-specific logic.** The fix must work for ANY plan with rate-based tiers.
2. **Rate detection heuristic must be general:** If all tier values are < 1.0 AND the input is a monetary volume, the values are rates (multiply against volume), not flat payouts. This is a reasonable general heuristic that works across domains.
3. **If fixing the evaluator to consume calculationIntent:** The calculationIntent already has the correct structural operation (per the Calculation Intent Specification). The evaluator should dispatch on calculationIntent.operation, not on component_type + tierConfig.
4. **Insurance Referral fix:** If calculationIntent has the correct structure, and the evaluator now reads it, this may self-resolve. If not, trace why calculationIntent was correct but tierConfig was empty — the plan interpretation prompt may need a quality fix.

### After implementing each fix:

```bash
cd ~/spm-platform
git add -A && git commit -m "OB-117: [description of this specific fix]"
git push origin dev
# Then: kill dev, rm -rf .next, npm run build, npm run dev, confirm localhost:3000
```

**Proof gate 3:** For each code change, paste:
- The exact file and line numbers changed
- A `git diff` snippet showing the change
- Confirmation that localhost:3000 responds after rebuild

---

## PHASE 4: RE-CALCULATE AND VERIFY (30 min)

### 4A: Clear existing calculation results for MBC

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: tenants } = await sb.from('tenants').select('id').ilike('name', '%bank%');
  const tenantId = tenants[0].id;
  
  const { data: d1, error: e1 } = await sb.from('calculation_results').delete().eq('tenant_id', tenantId);
  console.log('Deleted calculation_results:', e1 || 'OK');
  
  const { data: d2, error: e2 } = await sb.from('calculation_batches').delete().eq('tenant_id', tenantId);
  console.log('Deleted calculation_batches:', e2 || 'OK');
  
  const { data: d3, error: e3 } = await sb.from('entity_period_outcomes').delete().eq('tenant_id', tenantId);
  console.log('Deleted entity_period_outcomes:', e3 || 'OK');
}
run();
"
```

### 4B: Re-run calculations

Trigger calculation for all 4 MBC rule sets × 3 periods. Use whatever mechanism the calculation engine provides (API route, CLI script, or direct function call).

### 4C: Verify results

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
  
  // Get names
  const { data: ruleSets } = await sb.from('rule_sets').select('id, name').eq('tenant_id', tenantId).eq('status', 'active');
  const { data: periods } = await sb.from('periods').select('id, label').eq('tenant_id', tenantId);
  const rsNames = Object.fromEntries(ruleSets.map(r => [r.id, r.name]));
  const pNames = Object.fromEntries(periods.map(p => [p.id, p.label]));
  
  // Group by rule set × period
  const groups = {};
  for (const r of results) {
    const key = rsNames[r.rule_set_id] + ' | ' + pNames[r.period_id];
    if (!groups[key]) groups[key] = { count: 0, total: 0, nonZero: 0 };
    groups[key].count++;
    const amt = parseFloat(r.payout_amount || 0);
    groups[key].total += amt;
    if (amt > 0) groups[key].nonZero++;
  }
  
  console.log('\\nPOST-FIX CALCULATION RESULTS:');
  console.log('============================');
  for (const [key, data] of Object.entries(groups).sort()) {
    console.log(key + ':', data.count, 'results,', data.nonZero, 'non-zero, $' + data.total.toFixed(2));
  }
  console.log('\\nGRAND TOTAL:', results.reduce((s, r) => s + parseFloat(r.payout_amount || 0), 0).toFixed(2));
  
  // Spot check: Show Ruiz's mortgage result (the benchmark case)
  const { data: entities } = await sb.from('entities').select('id, name').eq('tenant_id', tenantId).ilike('name', '%ruiz%');
  if (entities.length > 0) {
    const ruizResults = results.filter(r => r.entity_id === entities[0].id && rsNames[r.rule_set_id]?.includes('Mortgage'));
    console.log('\\nBENCHMARK — Ruiz Mortgage results:');
    for (const r of ruizResults) {
      console.log('  Period:', pNames[r.period_id], '→ $' + parseFloat(r.payout_amount || 0).toFixed(2));
      if (r.details) console.log('  Details:', JSON.stringify(r.details).substring(0, 200));
    }
    console.log('  Expected: ~$27,845 (volume $9.28M × rate 0.003)');
  }
}
run();
"
```

**Proof gate 4C — THE CRITICAL GATE:** Paste the FULL output. We need to see:

| Rule Set | Expected Change |
|----------|----------------|
| Consumer Lending | Should remain ~$6.3M (unchanged, already working) |
| Mortgage Origination | Should jump from ~$0.18 to thousands (rates × volume) |
| Insurance Referral | Should produce non-zero if evaluator now reads calculationIntent |
| Deposit Growth | Will remain $0 — this is a legitimate data gap (no goal values). This is EXPECTED. |

**Specifically for Ruiz:** Mortgage payout should be approximately $27,845 (volume ~$9.28M × rate 0.003), not $0.003.

---

## PHASE 5: COMPLETION REPORT AND PR (15 min)

### 5A: Write completion report

Create `OB-117_COMPLETION_REPORT.md` at repo root with:

1. Summary of what was fixed
2. Architecture Decision Record (from Phase 1)
3. Code changes (file, line, what changed)
4. Before/after calculation comparison
5. Ruiz benchmark verification
6. What remains for Decision 64 (Data Intelligence Profile, Plan Requirements Manifest, Convergence Layer)
7. Any new findings

### 5B: Create PR

```bash
cd ~/spm-platform
gh pr create --base main --head dev --title "OB-117: Plan Intelligence Quality — MBC Interpretation Fixes" --body "
## Changes
- [list code changes]

## Results
- Mortgage: \$X → \$Y (rate × volume interpretation fixed)
- Insurance Referral: \$0 → \$Z (evaluator path / interpretation fixed)
- Consumer Lending: unchanged at ~\$6.3M
- Deposit Growth: remains \$0 (legitimate data gap — no goals)

## Benchmark
- Ruiz Mortgage: \$0.003 → ~\$27,845

## Derived From
OB-116 Completion Report + Decision 64 Specification
"
```

### 5C: Final proof

```bash
cd ~/spm-platform
git log --oneline -10
echo "---"
gh pr list --state open
```

**Proof gate 5C:** Paste output confirming PR created.

---

## SUCCESS CRITERIA

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | Mortgage payouts are rate × volume, not flat rate | Ruiz: ~$27,845 not $0.003 |
| 2 | Insurance Referral produces non-zero results | Any entity has payout > 0 |
| 3 | Consumer Lending unchanged | Total still ~$6.3M |
| 4 | Deposit Growth remains $0 with clear documentation | Expected — no goal values |
| 5 | No hardcoded MBC-specific logic added | Code review — no tenant names, no field names |
| 6 | Fix works for general case (rates < 1.0 = multiply, not flat) | Architecture decision documents the heuristic |
| 7 | Completion report with before/after evidence | Pasted in report |

---

## WHAT NOT TO DO

1. **Do NOT add more entries to SHEET_COMPONENT_PATTERNS.** That's CC Failure Pattern #1 (hardcoding answer keys). OB-116 was the last tactical pattern addition.
2. **Do NOT create a new evaluator type.** Fix the existing path selection or make it consume calculationIntent.
3. **Do NOT re-import data.** OB-116 already re-imported with correct data_types. Data is clean.
4. **Do NOT try to fix Deposit Growth $0.** That's a legitimate data gap (no goal values). Document it, don't hack it.
5. **Do NOT modify committed_data.** Fix logic, not data.

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
```

---

*"The plan tells you what it needs. Intelligence is interpreting that correctly."*
*Decision 64 — Dual Intelligence Architecture. This OB addresses Plan Intelligence quality.*
