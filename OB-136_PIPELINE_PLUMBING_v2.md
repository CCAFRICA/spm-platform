# OB-136 v2: PIPELINE PLUMBING — PHANTOM TABLE FIX + SCI-TO-CALCULATE BRIDGE
## Root cause: plan-readiness API queries `from('input_bindings')` — a table that doesn't exist.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. This prompt in its entirety before writing a single line of code

---

## CONTEXT

CLT-137 tested Óptica Luminar (719 entities, 6 components, MX$1,253,832 benchmark) through SCI → Calculate → Reconcile on production (vialuce.ai).

**What worked:** SCI classification was excellent — PARTIAL claims on mixed content, customer vocabulary preserved, 7/8 tabs processed (65,109 records committed).

**What broke:** Calculate page shows "No bindings" on the plan card. Cannot calculate.

### ROOT CAUSE (discovered during CLT-137)

The `plan-readiness` API (approximately lines 42-45) queries:
```typescript
from('input_bindings')  // ← PHANTOM TABLE — DOES NOT EXIST IN SCHEMA
```

The actual schema has `rule_sets.input_bindings` as a **JSONB column** on the `rule_sets` table. There is no standalone `input_bindings` table. The API queries a non-existent table, Supabase returns zero rows, and the UI reports "No bindings."

**The bindings may already exist** on the rule_set from OB-88/90 script-based setup. If so, the fix is surgical: change the query to read from the correct location. If bindings are empty, THEN the convergence bridge is also needed.

### SECONDARY FINDINGS (CLT-137)

- Period shows "Febrero 2026" — auto-detected from current date, not from imported data
- Entity count shows 1,000 instead of 719 — stale accumulation from multiple imports
- Plan name shows "Imported Plan" — not the AI-extracted plan identity
- HTTP 413 on one large tab — payload exceeds Vercel request body limit
- N+1 query explosion — 147-334 requests per page load

---

## STANDING ARCHITECTURE RULES

1. **Read CC_STANDING_ARCHITECTURE_RULES.md first.**
2. **Kill dev server, rm -rf .next, npm run build, npm run dev, verify localhost:3000** after every phase.
3. **Commit + push after EVERY phase.**
4. **Fix logic, not data.**
5. **Zero domain vocabulary in any new code.** Korean Test on all new files.
6. **Phase 0 diagnostic first** (Standing Rule 27 — Enhance Over Rewrite).
7. **Evidence = paste code/output, NOT "this was implemented."**

---

## PHASE 0: DIAGNOSTIC — CONFIRM ROOT CAUSE + ASSESS SCOPE

### 0A: Find the phantom table query

```bash
echo "=== PLAN READINESS API ==="
find web/src -path "*plan-readiness*" -o -path "*planReadiness*" -o -path "*plan_readiness*" | sort
echo ""
echo "=== ALL REFERENCES TO from('input_bindings') ==="
grep -rn "from('input_bindings')\|from(\"input_bindings\")" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
echo ""
echo "=== PLAN READINESS ROUTE CONTENT ==="
find web/src -path "*plan-readiness*" -exec cat {} \;
echo ""
echo "=== ANY OTHER PHANTOM TABLE REFERENCES ==="
grep -rn "input_bindings" web/src/app/api/ --include="*.ts" | head -30
```

### 0B: Check if bindings ALREADY EXIST on rule_sets

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Pipeline Test Co / Óptica Luminar
const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const { data } = await sb.from('rule_sets')
  .select('id, name, status, input_bindings')
  .eq('tenant_id', PTC);

console.log('=== PIPELINE TEST CO RULE SETS ===');
data?.forEach(rs => {
  const bindings = rs.input_bindings;
  const hasBindings = bindings && Object.keys(bindings).length > 0;
  console.log('ID:', rs.id);
  console.log('Name:', rs.name);
  console.log('Status:', rs.status);
  console.log('Has bindings:', hasBindings);
  if (hasBindings) {
    console.log('Binding keys:', Object.keys(bindings));
    console.log('First 800 chars:', JSON.stringify(bindings).slice(0, 800));
  } else {
    console.log('input_bindings is:', JSON.stringify(bindings));
  }
  console.log('');
});
"
```

### 0C: Compare with WORKING tenant bindings

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// LAB tenant (100% accuracy proven)
const LAB = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
const { data: labRS } = await sb.from('rule_sets')
  .select('name, input_bindings')
  .eq('tenant_id', LAB).limit(2);

console.log('=== LAB TENANT (WORKING) ===');
labRS?.forEach(rs => {
  console.log('Plan:', rs.name);
  console.log('Binding keys:', Object.keys(rs.input_bindings || {}));
  console.log('First 800 chars:', JSON.stringify(rs.input_bindings).slice(0, 800));
  console.log('');
});

// MBC tenant (working)
const MBC = '7e31a1d0-8c14-41c0-9f01-471f3842834c';
const { data: mbcRS } = await sb.from('rule_sets')
  .select('name, input_bindings')
  .eq('tenant_id', MBC).limit(1);

console.log('=== MBC TENANT (WORKING) ===');
mbcRS?.forEach(rs => {
  console.log('Plan:', rs.name);
  console.log('Binding keys:', Object.keys(rs.input_bindings || {}));
  console.log('First 800 chars:', JSON.stringify(rs.input_bindings).slice(0, 800));
});
"
```

### 0D: What else reads input_bindings? Full surface scan.

```bash
echo "=== ALL input_bindings READERS ==="
grep -rn "input_bindings\|inputBindings" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "\.test\." | sort

echo ""
echo "=== CALCULATE PAGE DEPENDENCIES ==="
grep -rn "plan.readiness\|planReadiness\|plan-readiness\|No binding\|no binding\|Partial" \
  web/src/app/operate/calculate/ --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== CALCULATION ENGINE — BINDING READS ==="
grep -rn "input_bindings\|inputBindings\|derivation\|metric_derivation" \
  web/src/lib/calculation/ --include="*.ts" | head -20
```

### 0E: Entity and period state

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

const { count: entityCount } = await sb.from('entities')
  .select('*', { count: 'exact', head: true }).eq('tenant_id', PTC);
console.log('Entities:', entityCount, entityCount === 719 ? '✅' : '⚠️ Expected 719');

const { data: periods } = await sb.from('periods')
  .select('label, start_date, end_date').eq('tenant_id', PTC);
console.log('Periods:', periods?.length);
periods?.forEach(p => console.log(' ', p.label, p.start_date, '→', p.end_date));

const { data: cdTypes } = await sb.from('committed_data')
  .select('data_type').eq('tenant_id', PTC);
const typeCount: Record<string, number> = {};
cdTypes?.forEach(r => typeCount[r.data_type] = (typeCount[r.data_type] || 0) + 1);
console.log('\\nCommitted data types:');
for (const [t, c] of Object.entries(typeCount).sort()) console.log(' ', t, ':', c);
console.log('Total:', cdTypes?.length);
"
```

### 0F: DECISION GATE

Based on Phase 0 findings, determine the scope:

```
SCENARIO A: Bindings EXIST on rule_sets but plan-readiness queries phantom table
  → FIX: Correct the query. Possibly a 1-line fix. Then verify Calculate works.
  → Scope: Small. Maybe 1-2 hours total.

SCENARIO B: Bindings are EMPTY on rule_sets AND plan-readiness queries phantom table
  → FIX: Correct the query AND implement convergence bridge to populate bindings.
  → Scope: Medium. 3-4 hours.

SCENARIO C: Multiple phantom table references throughout codebase
  → FIX: Systematic correction of all from('input_bindings') to from('rule_sets').
  → Scope: Depends on how many references exist.

Document which scenario applies and proceed accordingly.
```

**Commit:** `OB-136 Phase 0: Diagnostic — root cause confirmed, scope determined`

---

## PHASE 1: FIX THE PHANTOM TABLE QUERY

**This is the critical fix. Everything else is secondary.**

### 1A: Correct plan-readiness API

Change every instance of:
```typescript
from('input_bindings')  // WRONG — table doesn't exist
```
To the correct query pattern that reads from the rule_sets table:
```typescript
from('rule_sets').select('id, input_bindings, ...').eq('tenant_id', tenantId)
```

The exact replacement depends on what the plan-readiness API is trying to return. Read the full route, understand what it computes, and fix the query to read from the correct schema location.

### 1B: Search for ALL phantom table references

From Phase 0A, you have all references to `from('input_bindings')`. Fix EVERY ONE. Do not leave any phantom table queries in the codebase.

```bash
# After fixing, verify zero phantom references remain:
grep -rn "from('input_bindings')\|from(\"input_bindings\")" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
# Expected: 0 results
```

### 1C: Verify the fix

```bash
# Start dev server and hit the plan-readiness endpoint
curl -s http://localhost:3000/api/platform/plan-readiness?tenantId=dfc1041e-7c39-4657-81e5-40b1cea5680c | head -200
# OR whatever the correct endpoint path is from Phase 0A
```

**PROOF GATE:** Plan-readiness API returns actual binding data (not empty). Zero phantom table queries remain in codebase.

**Commit:** `OB-136 Phase 1: Fix phantom table query — from('input_bindings') → rule_sets.input_bindings`

---

## PHASE 2: VERIFY CALCULATE PAGE (POST-FIX)

### 2A: Check Calculate page state

After the phantom table fix, verify the Calculate page at localhost:3000:

1. Login as admin@pipelineproof.mx
2. Navigate to Operate → Calculate
3. **CHECK:** Does the plan card still show "No bindings"?
4. **CHECK:** Does the plan card show a binding count or status?
5. **CHECK:** Is the Calculate button enabled?

### 2B: Decision branch

```
IF plan card now shows bindings:
  → The phantom table fix was sufficient. Bindings existed from OB-88/90.
  → PROCEED to Phase 3 (secondary fixes).

IF plan card still shows "No bindings" or "Partial":
  → The rule_set.input_bindings column is empty for this tenant.
  → PROCEED to Phase 2C (convergence bridge).

IF plan card shows bindings BUT Calculate button fails:
  → The binding format may not match what the engine expects.
  → PROCEED to Phase 2D (binding format alignment).
```

### 2C: CONVERGENCE BRIDGE (only if bindings are empty)

If Phase 0B showed that rule_sets.input_bindings is empty/null for Pipeline Test Co:

1. Read the WORKING binding format from LAB/MBC (Phase 0C output)
2. After SCI execute commits all content units, generate input_bindings in the same format
3. Write to the rule_set

The convergence layer already computes matches between plan requirements and committed data. Wire it to persist:

```typescript
// After all SCI execute units complete:
// 1. Read the rule_set's component definitions
// 2. Inventory committed_data data_types for this tenant
// 3. Match components to data_types using semantic roles from SCI
// 4. Write matched bindings to rule_sets.input_bindings in the format from Phase 0C
// 5. The engine reads these on next Calculate
```

**Key constraint:** The binding format MUST match LAB/MBC exactly. Read the working format, replicate it.

### 2D: BINDING FORMAT ALIGNMENT (only if Calculate fails despite bindings)

If bindings exist but Calculate errors:
1. Compare the binding structure to what the calculation engine expects
2. The engine reads `input_bindings.metric_derivations` — verify this key exists
3. Each derivation needs: metricName, operation, source_pattern, source_field, filters
4. Align to the exact format the engine reads

**Commit:** `OB-136 Phase 2: Calculate page verification — [result: working / bridge needed / format fix]`

---

## PHASE 3: ATTEMPT CALCULATION

**Only proceed here if Phase 2 shows bindings are present and Calculate button is available.**

### 3A: Select correct period

The period dropdown may show "Febrero 2026." Look for January 2024 or the period that matches the imported data. If no correct period exists, this becomes Phase 4's problem.

### 3B: Run calculation

Click Calculate. Document:
- Did it complete without error?
- How many entities calculated?
- What was the total payout?
- Compare to benchmark: MX$1,253,832

### 3C: Document results

```
Calculation results:
  Entity count: [N]
  Total payout: MX$[amount]
  Benchmark:    MX$1,253,832
  Delta:        [amount] ([percentage])
```

If results are close to benchmark, this is a major win — the pipeline works end-to-end through the browser.

If results are zero or wildly wrong, document the error and continue to Phase 4.

**Commit:** `OB-136 Phase 3: Calculation attempt — [result]`

---

## PHASE 4: PERIOD DETECTION FROM DATA

**Goal:** Periods are created from date columns in imported data, not current date.

### 4A: Check current period creation

```bash
grep -rn "period.*insert\|createPeriod\|detectPeriod\|period.*create" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20
grep -n "period\|date\|timestamp" web/src/app/api/import/sci/execute/route.ts | head -15
```

### 4B: Implement data-driven period detection

During SCI execute, when transaction/operational data is committed:
1. Identify date-type fields from semantic roles (NOT by field name — Korean Test)
2. Extract unique month/year combinations from the data
3. Create period records with correct start_date and end_date
4. Upsert — if period already exists for this tenant + date range, reuse it

### 4C: Verify

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const { data } = await sb.from('periods').select('label, start_date, end_date').eq('tenant_id', PTC);
console.log('Periods:');
data?.forEach(p => console.log(' ', p.label, p.start_date, '→', p.end_date));
"
```

**PROOF GATE:** January 2024 period exists. No spurious "Febrero 2026" auto-generated period.

**Commit:** `OB-136 Phase 4: Period detection from imported data`

---

## PHASE 5: ENTITY DEDUPLICATION

**Goal:** Re-importing doesn't create duplicate entities.

### 5A: Implement upsert

When SCI execute processes entity-classified content:
1. Extract entity_identifier from semantic bindings (NOT by field name)
2. Upsert by (tenant_id, external_id) — update metadata if exists, create if new
3. Verify unique constraint exists on (tenant_id, external_id)

### 5B: Verify

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const { count } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', PTC);
console.log('Entity count:', count, 'Expected: ≤719');
"
```

**Commit:** `OB-136 Phase 5: Entity deduplication — upsert by external_id`

---

## PHASE 6: PAYLOAD SIZE HANDLING

**Goal:** Large tabs don't fail with HTTP 413.

### 6A: Increase API body size limit

```bash
echo "=== CURRENT CONFIG ==="
cat web/next.config.mjs 2>/dev/null | head -30
cat web/next.config.js 2>/dev/null | head -30
```

For Next.js App Router, add to the route file:
```typescript
export const config = {
  maxDuration: 60, // seconds (Vercel Pro)
};
```

And in next.config:
```javascript
experimental: {
  serverActions: {
    bodySizeLimit: '10mb',
  },
},
```

### 6B: Chunked execution for very large tabs

If a content unit has > 10,000 rows, split the committed_data insert into batches of 5,000.

```typescript
// Pseudocode:
const BATCH_SIZE = 5000;
if (rows.length > BATCH_SIZE) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await commitChunk(chunk, importBatchId, dataType);
  }
} else {
  await commitAll(rows, importBatchId, dataType);
}
```

Also remember: Supabase `.in()` calls must batch ≤ 200 items (URL length limit). Larger arrays silently return zero rows.

**Commit:** `OB-136 Phase 6: Payload size handling — body limit + chunked execution`

---

## PHASE 7: PLAN NAMING

**Goal:** Plan name reflects content, not "Imported Plan."

```bash
grep -rn "Imported Plan" web/src/ --include="*.ts" --include="*.tsx" | head -10
```

Replace "Imported Plan" default with:
1. AI-extracted plan name (if available from plan interpretation)
2. Filename without extension as fallback (e.g., "RetailCorp Plan1")
3. "Imported Plan" only as last resort

**Commit:** `OB-136 Phase 7: Plan naming from AI interpretation or filename`

---

## PHASE 8: REGRESSION + KOREAN TEST

### 8A: LAB regression

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
const { data, count } = await sb.from('calculation_results')
  .select('total_payout', { count: 'exact' }).eq('tenant_id', LAB);
const total = data?.reduce((s, r) => s + parseFloat(r.total_payout || '0'), 0);
console.log('LAB results:', count, 'Expected: 268');
console.log('LAB total: \$' + total?.toLocaleString(), 'Expected: \$8,498,311.77');
console.log(count === 268 && Math.abs(total! - 8498311.77) < 0.10 ? '✅ PASS' : '❌ FAIL');
"
```

### 8B: MBC regression

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MBC = '7e31a1d0-8c14-41c0-9f01-471f3842834c';
const { data, count } = await sb.from('calculation_results')
  .select('total_payout', { count: 'exact' }).eq('tenant_id', MBC);
const total = data?.reduce((s, r) => s + parseFloat(r.total_payout || '0'), 0);
console.log('MBC results:', count, 'Expected: 240');
console.log('MBC total: \$' + total?.toLocaleString(), 'Expected: \$3,245,212.66');
console.log(count === 240 && Math.abs(total! - 3245212.66) < 0.10 ? '✅ PASS' : '❌ FAIL');
"
```

### 8C: Korean Test

```bash
grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus\|optometr\|óptica\|tienda\|empleado\|cobranza\|garantía\|protección\|venta" \
  web/src/lib/sci/ web/src/lib/convergence/ web/src/app/api/*plan-readiness* --include="*.ts" \
  | grep -v node_modules | grep -v "\.test\.\|COMPLETION" || echo "KOREAN TEST: PASS — 0 domain matches"
```

### 8D: Build clean

```bash
cd web && rm -rf .next && npm run build
# Must exit 0
```

**Commit:** `OB-136 Phase 8: Regression — LAB + MBC + Korean Test + build clean`

---

## PHASE 9: COMPLETION REPORT + PR

Create `OB-136_COMPLETION_REPORT.md` with:

1. **Root cause:** `from('input_bindings')` phantom table query — exact file and line
2. **Fix:** Query corrected to read from `rule_sets.input_bindings` JSONB column
3. **Binding state:** Were bindings already present (Scenario A) or generated fresh (Scenario B)?
4. **Calculate results:** What happens after the fix — does Calculate work? What totals?
5. **Secondary fixes:** Period detection, entity dedup, payload handling, plan naming
6. **All proof gates with pasted evidence**

```bash
gh pr create --base main --head dev \
  --title "OB-136: Pipeline Plumbing — Phantom Table Fix + SCI-to-Calculate Bridge" \
  --body "## CLT-137 Root Cause Fix

### Root Cause
plan-readiness API queried from('input_bindings') — a table that doesn't exist.
Schema has rule_sets.input_bindings as a JSONB column.

### What This Fixes
- Phantom table query → reads from correct schema location
- [Convergence bridge if bindings were empty]
- Period detection from imported data (not current date)
- Entity deduplication on re-import
- Plan naming from AI interpretation
- Large tab payload handling (413 prevention)

### Proof
- Pipeline Test Co: Calculate page shows bindings after fix
- LAB regression: 268 results, \$8,498,311.77
- MBC regression: 240 results, \$3,245,212.66
- Korean Test: 0 domain matches"
```

**Commit:** `OB-136 Phase 9: Completion report + PR`

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | npm run build exits 0 | Clean build |
| PG-02 | Phase 0 diagnostic completed | Root cause confirmed with exact file:line |
| PG-03 | Zero phantom table queries remain | `grep from('input_bindings')` returns 0 results |
| PG-04 | Plan-readiness API returns data | Non-empty response for Pipeline Test Co |
| PG-05 | Calculate page shows bindings | "No bindings" eliminated |
| PG-06 | Calculate button functional | Click produces results (or documents why not) |
| PG-07 | Period from data exists | January 2024 (not just February 2026) |
| PG-08 | Entity count stable | ≤719 for Pipeline Test Co |
| PG-09 | Plan name not "Imported Plan" | Reflects content or filename |
| PG-10 | Large tab doesn't 413 | Body limit or chunking handles it |
| PG-11 | LAB regression | 268 results, $8,498,311.77 |
| PG-12 | MBC regression | 240 results, $3,245,212.66 |
| PG-13 | Korean Test | 0 domain vocabulary in modified files |
| PG-14 | localhost:3000 responds | HTTP 200/307 |

---

## CC FAILURE PATTERN WARNING

| Pattern | Risk | Prevention |
|---------|------|------------|
| Phantom table queries elsewhere | Other APIs may have the same `from('input_bindings')` bug | Phase 0D scans ALL references. Phase 1B fixes ALL of them. |
| Format mismatch | New bindings don't match format engine expects | Phase 0C reads WORKING bindings. Any new bindings replicate exact structure. |
| Stale entity accumulation | Multiple imports inflate entity count | Phase 5 upsert by external_id. |
| Works locally, fails production | 413 and timeouts only appear on Vercel | Phase 6 handles production payload limits. |

---

*"The agents are smart. The plumbing was querying a table that doesn't exist. Fix the query, and the intelligence flows through."*
