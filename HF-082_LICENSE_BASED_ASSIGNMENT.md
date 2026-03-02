# HF-082: LICENSE-BASED ENTITY ASSIGNMENT FIX

## Target: alpha.2.0
## Depends on: OB-123 (PR #139), HF-081 (PR #140)
## Source: CC-UAT-05 Finding F-01 (Full-Coverage Fallback)

## READ FIRST — IN THIS ORDER
1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL sections
2. `SCHEMA_REFERENCE.md` — rule_set_assignments, entities, rule_sets
3. `CC_UAT_05_FORENSIC_WIRING_TRACE.md` — Layer 3 (Assignment Verification)
4. This entire prompt before executing

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act.

## STANDING RULES
- After EVERY commit: `git push origin dev`
- After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
- Git commands from repo root (`/Users/AndrewAfrica/spm-platform`)
- DO NOT MODIFY ANY AUTH FILE
- Evidence = paste, not describe
- One commit per phase

---

## THE PROBLEM

CC-UAT-05 Layer 3 found 100 assignments for LAB tenant: 25 entities × 4 plans. Every officer assigned to every plan regardless of licenses. The CC-UAT trace identified the root cause:

**Entity licenses:** Stored as comma-separated full names in `metadata.product_licenses`:
```
Officer 1001: "Consumer Lending, Mortgage, Insurance, Deposits"  → should get 4 plans
Officer 1015: "Consumer Lending, Insurance"                       → should get 2 plans
```

**Plan names:** Include suffixes beyond the license keyword:
```
"Consumer Lending Commission Plan 2024"
"Mortgage Origination Bonus Plan 2024"
"CFG Insurance Referral Program 2024"
"Deposit Growth Incentive Plan Q1 2024"
```

**The matching bug:** `normalizeForMatch(license).includes(normalizeForMatch(planName))` or vice versa — substring matching is too loose. Then even when license-based mapping partially works, the full-coverage fallback ALSO runs and fills in remaining assignments, resulting in every entity assigned to everything.

**Expected result after fix:**
- License distribution: Consumer Lending: 25, Mortgage: 14, Insurance: 16, Deposits: 12
- Total assignments: ~67 (not 100)
- Officer with 2 licenses → 2 assignments, not 4

---

## SCOPE BOUNDARIES

### IN SCOPE
- Fix license-to-plan matching in wire API route.ts
- Eliminate full-coverage fallback when license data exists
- Delete and recreate LAB assignments with correct logic
- Verify variable assignment counts per entity

### OUT OF SCOPE
- Calculation re-run (assignments change what results are produced, but recalc is separate)
- MBC assignments (don't touch — MBC has 80 assignments which appears correct)
- Import pipeline, field mapping, or UI changes
- Auth files

---

## PHASE 0: DIAGNOSTIC — READ THE CURRENT MATCHING CODE

```bash
cd /Users/AndrewAfrica/spm-platform

echo "╔══════════════════════════════════════════════════════╗"
echo "║  HF-082 PHASE 0: ASSIGNMENT MATCHING DIAGNOSTIC     ║"
echo "╚══════════════════════════════════════════════════════╝"

echo ""
echo "=== 0A: FIND THE MATCHING LOGIC ==="
grep -n "normalizeForMatch\|license.*match\|match.*license\|fallback\|fullCoverage\|full.coverage\|usedLicense" \
  web/src/app/api/intelligence/wire/route.ts | head -30

echo ""
echo "=== 0B: FIND WHERE ASSIGNMENTS ARE CREATED ==="
grep -n "rule_set_assignments\|assignment.*insert\|insert.*assignment" \
  web/src/app/api/intelligence/wire/route.ts | head -20

echo ""
echo "=== 0C: PRINT THE FULL ASSIGNMENT SECTION ==="
# Print the section of route.ts that handles entity-to-plan assignment
# Adjust line range after 0A reveals where the logic is
grep -n "Step 4\|step 4\|assignment\|license\|fallback" \
  web/src/app/api/intelligence/wire/route.ts | head -20

echo ""
echo "=== 0D: CURRENT LAB ASSIGNMENTS ==="
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

const { data } = await sb.from('rule_set_assignments')
  .select('entity_id, rule_sets!inner(name), entities!inner(external_id, metadata)')
  .eq('tenant_id', LAB);

// Count per entity
const byEntity: Record<string, { name: string; licenses: string; plans: string[] }> = {};
for (const a of data || []) {
  const ext = (a as any).entities?.external_id;
  const meta = (a as any).entities?.metadata || {};
  const plan = (a as any).rule_sets?.name;
  if (!byEntity[ext]) byEntity[ext] = { name: ext, licenses: meta.product_licenses || 'NONE', plans: [] };
  byEntity[ext].plans.push(plan);
}

console.log('Entity assignments (sample):');
const entries = Object.entries(byEntity).slice(0, 8);
for (const [ext, info] of entries) {
  console.log(\`  Officer \${ext}: \${info.plans.length} plans | licenses: \${info.licenses}\`);
  for (const p of info.plans) console.log(\`    → \${p}\`);
}

console.log(\`\nTotal assignments: \${data?.length}\`);
const counts = Object.values(byEntity).map(e => e.plans.length);
const allSame = counts.every(c => c === counts[0]);
console.log(\`All entities have same count: \${allSame} (\${counts[0]})\`);
console.log(\`VERDICT: \${allSame ? 'FULL-COVERAGE FALLBACK ACTIVE' : 'Variable assignment — license-based working'}\`);
"

echo ""
echo "=== 0E: PRINT THE FULL MATCHING FUNCTION ==="
# Now print the exact function. Read the wire route to find line numbers.
cat web/src/app/api/intelligence/wire/route.ts | head -500 | tail -200
```

**PASTE ALL OUTPUT.** We need to see:
- The exact `normalizeForMatch()` function
- Where license-based assignment happens
- Where the fallback triggers
- The condition that decides license vs fallback

**Commit:** `HF-082 Phase 0: Diagnostic — current assignment matching logic`

---

## PHASE 1: FIX THE MATCHING LOGIC

The fix has two parts:

### 1A: Improve License-to-Plan Matching

The current substring `includes()` is unreliable because license names ("Consumer Lending") are substrings of plan names ("Consumer Lending Commission Plan 2024") but the match direction and normalization vary.

Replace with **keyword token overlap scoring:**

```typescript
function matchLicenseToPlan(license: string, planName: string): boolean {
  // Tokenize both into lowercase keywords
  const licenseTokens = license.toLowerCase().split(/[\s,_\-]+/).filter(t => t.length > 2);
  const planTokens = planName.toLowerCase().split(/[\s,_\-]+/).filter(t => t.length > 2);
  
  // Remove common noise words that don't help matching
  const noise = new Set(['plan', 'program', 'bonus', 'commission', 'incentive', 'cfg', '2024', '2025', '2026']);
  const cleanLicense = licenseTokens.filter(t => !noise.has(t));
  const cleanPlan = planTokens.filter(t => !noise.has(t));
  
  // Match if ALL license tokens appear in plan tokens
  // "Consumer Lending" → ["consumer", "lending"]
  // "Consumer Lending Commission Plan 2024" → ["consumer", "lending"] (after noise removal)
  // All license tokens found in plan → MATCH
  if (cleanLicense.length === 0) return false;
  
  const matchCount = cleanLicense.filter(lt => cleanPlan.some(pt => pt.includes(lt) || lt.includes(pt))).length;
  return matchCount === cleanLicense.length;
}
```

**IMPORTANT — Korean Test:** The noise word list contains generic English words. This is acceptable because entity licenses and plan names are customer-provided business labels, not foundational code. A Korean customer would have Korean license names and Korean plan names — the tokenization and overlap logic works regardless of language. The noise words are a heuristic optimization, not a domain hardcode.

However: do NOT add domain-specific words like "mortgage", "insurance", "lending" to the noise list. Those are the matching keywords.

### 1B: Eliminate Fallback When License Data Exists

The current code runs fallback even when license-based mapping partially succeeds. Fix:

```typescript
// BEFORE (broken):
// 1. Try license-based matching → creates SOME assignments
// 2. Fallback ALSO runs → fills in the rest → every entity gets every plan

// AFTER (correct):
// 1. Check if ANY entity has license metadata
// 2. If YES: use license-based matching ONLY. No fallback.
//    Entities without licenses get NO assignments (correct — they need manual assignment)
// 3. If NO entity has license metadata: THEN use full-coverage fallback
//    (this is the legitimate case where no license data was imported)

const entitiesWithLicenses = entities.filter(e => {
  const meta = e.metadata || {};
  const licenses = meta.product_licenses || meta.licenses || meta.ProductLicenses;
  return licenses && String(licenses).trim().length > 0;
});

if (entitiesWithLicenses.length > 0) {
  // License-based assignment — NO FALLBACK
  for (const entity of entities) {
    const meta = entity.metadata || {};
    const licenseStr = meta.product_licenses || meta.licenses || meta.ProductLicenses || '';
    const licenses = String(licenseStr).split(',').map(l => l.trim()).filter(l => l.length > 0);
    
    for (const ruleSet of activeRuleSets) {
      const matched = licenses.some(lic => matchLicenseToPlan(lic, ruleSet.name));
      if (matched) {
        assignments.push({
          tenant_id: tenantId,
          entity_id: entity.id,
          rule_set_id: ruleSet.id,
          effective_from: new Date().toISOString(),
        });
      }
    }
  }
  console.log(`[Wire] License-based: ${assignments.length} assignments for ${entities.length} entities`);
} else {
  // No license data available — full-coverage fallback is legitimate
  for (const entity of entities) {
    for (const ruleSet of activeRuleSets) {
      assignments.push({
        tenant_id: tenantId,
        entity_id: entity.id,
        rule_set_id: ruleSet.id,
        effective_from: new Date().toISOString(),
      });
    }
  }
  console.log(`[Wire] Full-coverage fallback: ${assignments.length} assignments (no license metadata found)`);
}
```

### 1C: Apply the Fix

Read the exact current code from Phase 0E output. Identify:
1. The `normalizeForMatch()` function — replace with `matchLicenseToPlan()`
2. The assignment creation loop — restructure per 1B
3. The fallback trigger — gate behind `entitiesWithLicenses.length === 0`

Make the minimum change necessary. Do not restructure unrelated parts of the wire API.

**Commit:** `HF-082 Phase 1: License-based assignment — token overlap matching, no fallback when licenses exist`

---

## PHASE 2: RE-RUN ASSIGNMENTS FOR LAB

Delete existing LAB assignments and re-run the wire API to create correct ones.

```bash
cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

// Count before
const { count: before } = await sb.from('rule_set_assignments')
  .select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);
console.log('Assignments before:', before);

// Delete
const { error } = await sb.from('rule_set_assignments').delete().eq('tenant_id', LAB);
if (error) { console.error('DELETE FAILED:', error); process.exit(1); }

// Count after
const { count: after } = await sb.from('rule_set_assignments')
  .select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);
console.log('Assignments after delete:', after, '(should be 0)');
"
```

Then trigger the wire API:

```bash
# Start dev server
cd /Users/AndrewAfrica/spm-platform/web
npm run dev &
sleep 10

# Call wire API
curl -s -X POST http://localhost:3000/api/intelligence/wire \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "a630404c-0777-4f6d-b760-b8a190ecd63c"}' | head -100

kill $(lsof -ti:3000) 2>/dev/null || true
```

**PASTE ALL OUTPUT.**

**Commit:** `HF-082 Phase 2: Re-run LAB assignments with license-based matching`

---

## PHASE 3: VERIFICATION

```bash
cd /Users/AndrewAfrica/spm-platform

echo "╔══════════════════════════════════════════════════════╗"
echo "║  HF-082 VERIFICATION: ASSIGNMENT CORRECTNESS        ║"
echo "╚══════════════════════════════════════════════════════╝"

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

const { data, count } = await sb.from('rule_set_assignments')
  .select('*, rule_sets!inner(name), entities!inner(external_id, metadata)', { count: 'exact' })
  .eq('tenant_id', LAB);

console.log('=== TOTAL ASSIGNMENTS ===');
console.log('Count:', count);
console.log('Expected: ~67 (CL:25 + MO:14 + IR:16 + DG:12)');
console.log('Was: 100 (full-coverage fallback)');
console.log('');

console.log('=== ASSIGNMENTS PER PLAN ===');
const byPlan: Record<string, number> = {};
for (const a of data || []) {
  const plan = (a as any).rule_sets?.name || 'UNKNOWN';
  byPlan[plan] = (byPlan[plan] || 0) + 1;
}
for (const [plan, c] of Object.entries(byPlan).sort()) {
  console.log(\`  \${plan}: \${c} entities\`);
}

console.log('');
console.log('=== FULL-COVERAGE CHECK ===');
const byEntity: Record<string, number> = {};
for (const a of data || []) {
  const ext = (a as any).entities?.external_id;
  byEntity[ext] = (byEntity[ext] || 0) + 1;
}
const counts = Object.values(byEntity);
const allSame = counts.every(c => c === counts[0]);
const minAssign = Math.min(...counts);
const maxAssign = Math.max(...counts);
console.log(\`Assignment range: \${minAssign} to \${maxAssign} plans per entity\`);
console.log(\`All same: \${allSame}\`);
console.log(\`VERDICT: \${!allSame || maxAssign < Object.keys(byPlan).length ? 'PASS — variable assignment' : 'FAIL — still full-coverage'}\`);

console.log('');
console.log('=== OFFICER WITH 4 LICENSES (e.g., 1001) ===');
const o1001 = data?.filter(a => (a as any).entities?.external_id === '1001' || (a as any).entities?.external_id === 1001);
console.log(\`Officer 1001: \${o1001?.length} assignments\`);
const o1001Licenses = (o1001?.[0] as any)?.entities?.metadata?.product_licenses;
console.log(\`  Licenses: \${o1001Licenses}\`);
for (const a of o1001 || []) console.log(\`  → \${(a as any).rule_sets?.name}\`);

console.log('');
console.log('=== OFFICER WITH FEWER LICENSES ===');
// Find someone with 2 assignments
const twoAssign = Object.entries(byEntity).find(([_, c]) => c === 2);
if (twoAssign) {
  const entity = data?.find(a => (a as any).entities?.external_id === twoAssign[0]);
  const licenses = (entity as any)?.entities?.metadata?.product_licenses;
  const plans = data?.filter(a => (a as any).entities?.external_id === twoAssign[0])
    .map(a => (a as any).rule_sets?.name);
  console.log(\`Officer \${twoAssign[0]}: \${twoAssign[1]} assignments\`);
  console.log(\`  Licenses: \${licenses}\`);
  for (const p of plans || []) console.log(\`  → \${p}\`);
  console.log('  VERDICT: Plans match licenses?', 'CHECK MANUALLY');
} else {
  console.log('No entity with exactly 2 assignments found.');
  // Show any entity with fewer than max
  const fewerEntry = Object.entries(byEntity).find(([_, c]) => c < maxAssign);
  if (fewerEntry) {
    const entity = data?.find(a => (a as any).entities?.external_id === fewerEntry[0]);
    const licenses = (entity as any)?.entities?.metadata?.product_licenses;
    const plans = data?.filter(a => (a as any).entities?.external_id === fewerEntry[0])
      .map(a => (a as any).rule_sets?.name);
    console.log(\`Officer \${fewerEntry[0]}: \${fewerEntry[1]} assignments\`);
    console.log(\`  Licenses: \${licenses}\`);
    for (const p of plans || []) console.log(\`  → \${p}\`);
  }
}

console.log('');
console.log('=== MBC REGRESSION ===');
const MBC = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';
const { count: mbcCount } = await sb.from('rule_set_assignments')
  .select('*', { count: 'exact', head: true }).eq('tenant_id', MBC);
console.log(\`MBC assignments: \${mbcCount}\`);
console.log(\`Expected: 80\`);
console.log(\`VERDICT: \${mbcCount === 80 ? 'PASS — unchanged' : 'FAIL — regression'}\`);

const { data: mbcResults } = await sb.from('calculation_results')
  .select('total_payout', { count: 'exact' }).eq('tenant_id', MBC);
const mbcTotal = (mbcResults || []).reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
console.log(\`MBC calc total: \$\${mbcTotal.toFixed(2)}\`);
console.log(\`Expected: \$3,245,212.64\`);
console.log(\`VERDICT: \${Math.abs(mbcTotal - 3245212.64) < 0.10 ? 'PASS' : 'FAIL'}\`);
"
```

**PASTE ALL OUTPUT.**

**Commit:** `HF-082 Phase 3: Verification — variable assignments, MBC regression`

---

## PHASE 4: BUILD + COMPLETION REPORT

```bash
cd /Users/AndrewAfrica/spm-platform
kill $(lsof -ti:3000) 2>/dev/null || true
rm -rf web/.next
cd web && npm run build && cd ..
echo "Build exit code: $?"
```

Create `HF-082_COMPLETION_REPORT.md` at project root:

### PROOF GATES

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-01 | `npm run build` exits 0 | Paste exit code |
| PG-02 | LAB assignments < 100 (was 100) | Paste count |
| PG-03 | Assignment counts vary by entity (not all same) | Paste min/max range |
| PG-04 | Officer 1001 (4 licenses) → 4 assignments | Paste trace |
| PG-05 | Officer with 2 licenses → 2 assignments | Paste trace |
| PG-06 | Assignment per plan matches license distribution (CL:25, MO:14, IR:16, DG:12 ±2) | Paste per-plan counts |
| PG-07 | MBC assignments = 80 (unchanged) | Paste count |
| PG-08 | MBC grand total = $3,245,212.64 ± $0.10 | Paste total |
| PG-09 | No auth files modified | git diff |
| PG-10 | No domain vocabulary in matching function (Korean Test) | grep output |

```bash
# Korean Test on new code
echo "=== KOREAN TEST ==="
grep -n "mortgage\|insurance\|lending\|deposit\|loan\|consumer\|referral" \
  web/src/app/api/intelligence/wire/route.ts | grep -v "console.log\|comment\|//" | head -10
echo "Expected: 0 matches (noise list words like 'plan', 'program', 'bonus' are OK)"
```

**Commit:** `HF-082 Phase 4: Build clean + completion report`

---

## FINAL: GIT PROTOCOL

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "HF-082 Complete: License-based assignment — token overlap, no fallback"
git push origin dev

gh pr create --base main --head dev \
  --title "HF-082: License-Based Entity Assignment — Kill Full-Coverage Fallback" \
  --body "Replaces substring includes() with token overlap scoring for license-to-plan matching. Full-coverage fallback only triggers when NO entity has license metadata. LAB: 100 assignments → ~67. MBC: 80 unchanged."
```

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Adding domain words ("mortgage", "insurance") to noise list | These are the matching keywords. Only generic words like "plan", "program", "bonus" in noise. |
| AP-2 | Hardcoding license-to-plan mappings | The matching must work for ANY license name and ANY plan name. Korean Test. |
| AP-3 | Running fallback "just in case" after license matching | If licenses exist, license-based is the ONLY path. Fallback for tenants with NO license data. |
| AP-4 | Modifying MBC assignments | MBC is regression baseline. Zero changes. |
| AP-5 | Re-running calculation as part of this HF | Assignment change affects what entities appear in results. Recalc is separate — the current results become stale but that's a known state. |

---

*"100 assignments passed the row-count check. The forensic trace showed every officer assigned to every plan."*
*"After HF-082: assignments match licenses. An officer with 2 licenses gets 2 plans, not 4."*
