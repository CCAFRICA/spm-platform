# OB-136: PIPELINE PLUMBING — SCI IMPORT TO CALCULATE BRIDGE
## The agents classify correctly. The data commits. But Calculate can't see the bindings.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. This prompt in its entirety before writing a single line of code

---

## CONTEXT — WHY THIS EXISTS

CLT-137 tested the Óptica Luminar tenant (719 entities, 6 components, MX$1,253,832 benchmark) through the full SCI → Calculate → Reconcile browser path on production.

**What worked:** SCI classification performed excellently. The 7-tab XLSX was correctly classified — PARTIAL claims on mixed content, customer vocabulary preserved, honest uncertainty flagging, 7/8 tabs processed successfully (65,109 records committed).

**What broke:** The Calculate page shows "No bindings" on the plan card. The convergence layer observes matches during SCI import but doesn't persist them where Calculate reads. The SCI import appeared to succeed — data is in committed_data — but the rule_set's input_bindings were never updated. Calculate is blind to the imported data.

**The core problem:** SCI execute writes to `committed_data` and `entities`. Calculate reads from `rule_sets.input_bindings` and `metric_derivations`. Nobody writes the bridge between them after SCI import. OB-88/90 proved the engine works by writing bindings via script. SCI needs to do it automatically.

**Secondary problems found in CLT-137:**
- Period shows "Febrero 2026" (auto-detected from current date, not from imported data)
- Entity count shows 1,000 instead of 719 (stale accumulation from multiple imports)
- Plan name shows "Imported Plan" (not the AI-extracted plan identity)
- HTTP 413 on large tab (payload exceeds Vercel request body limit)

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

## PHASE 0: DIAGNOSTIC — UNDERSTAND THE GAP

### 0A: How does Calculate find data to calculate?

Trace the exact path Calculate uses to determine what data is available:

```bash
echo "=== CALCULATE PAGE — DATA READING ==="
grep -rn "input_bindings\|inputBindings\|metric_derivation\|derivation" \
  web/src/app/operate/calculate/ --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== CALCULATE API — HOW DOES IT FIND DATA? ==="
grep -rn "input_bindings\|inputBindings\|derivation\|committed_data" \
  web/src/app/api/calculation/ --include="*.ts" | head -30

echo ""
echo "=== PLAN CARD — WHAT SHOWS 'No bindings'? ==="
grep -rn "binding\|No binding\|Partial\|partial" \
  web/src/app/operate/calculate/ --include="*.tsx" | head -15
grep -rn "binding\|No binding\|Partial\|partial" \
  web/src/components/ --include="*.tsx" | head -15
```

### 0B: What does a WORKING rule_set's input_bindings look like?

The LAB and MBC tenants have working bindings from script-based setup. Read the actual structure:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// LAB tenant (working — 100% accuracy)
const LAB = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
const { data: labRS } = await sb.from('rule_sets')
  .select('name, input_bindings')
  .eq('tenant_id', LAB).limit(2);

console.log('=== LAB TENANT (WORKING) ===');
labRS?.forEach(rs => {
  console.log('\\nPlan:', rs.name);
  console.log('input_bindings keys:', Object.keys(rs.input_bindings || {}));
  console.log('input_bindings (first 1000 chars):', JSON.stringify(rs.input_bindings)?.slice(0, 1000));
});

// MBC tenant (working)
const MBC = '7e31a1d0-8c14-41c0-9f01-471f3842834c';
const { data: mbcRS } = await sb.from('rule_sets')
  .select('name, input_bindings')
  .eq('tenant_id', MBC).limit(1);

console.log('\\n=== MBC TENANT (WORKING) ===');
mbcRS?.forEach(rs => {
  console.log('\\nPlan:', rs.name);
  console.log('input_bindings keys:', Object.keys(rs.input_bindings || {}));
  console.log('input_bindings (first 1000 chars):', JSON.stringify(rs.input_bindings)?.slice(0, 1000));
});
"
```

### 0C: What does the Óptica Luminar rule_set look like RIGHT NOW?

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Pipeline Test Co / Óptica Luminar tenant
const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const { data: rs } = await sb.from('rule_sets')
  .select('id, name, input_bindings, components, rules, status')
  .eq('tenant_id', PTC);

console.log('=== PIPELINE TEST CO RULE SETS ===');
rs?.forEach(r => {
  console.log('\\nID:', r.id);
  console.log('Name:', r.name);
  console.log('Status:', r.status);
  console.log('input_bindings:', JSON.stringify(r.input_bindings)?.slice(0, 500));
  console.log('components count:', Object.keys(r.components || r.rules?.components || {}).length);
});

// Check entity count
const { count: entityCount } = await sb.from('entities')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', PTC);
console.log('\\nEntity count:', entityCount);

// Check periods
const { data: periods } = await sb.from('periods')
  .select('label, start_date, end_date')
  .eq('tenant_id', PTC);
console.log('\\nPeriods:', periods?.length);
periods?.forEach(p => console.log(' ', p.label, p.start_date, '→', p.end_date));

// Check committed_data types
const { data: cdTypes } = await sb.from('committed_data')
  .select('data_type')
  .eq('tenant_id', PTC);
const typeCount: Record<string, number> = {};
cdTypes?.forEach(r => typeCount[r.data_type] = (typeCount[r.data_type] || 0) + 1);
console.log('\\nCommitted data types:');
for (const [t, c] of Object.entries(typeCount).sort()) console.log(' ', t, ':', c, 'rows');
console.log('Total:', cdTypes?.length);
"
```

### 0D: How does the convergence service work?

```bash
echo "=== CONVERGENCE SERVICE ==="
find web/src -name "*convergence*" -type f | sort
echo ""
echo "=== CONVERGENCE SERVICE CONTENT ==="
cat web/src/lib/convergence/convergence-service.ts 2>/dev/null | head -100
echo ""
echo "=== WHERE IS CONVERGENCE CALLED? ==="
grep -rn "convergence\|runConvergence\|generateBindings\|updateBindings" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20
```

### 0E: How does SCI execute currently handle post-commit?

```bash
echo "=== SCI EXECUTE — POST-COMMIT ACTIONS ==="
cat web/src/app/api/import/sci/execute/route.ts | head -150
echo ""
echo "=== DOES EXECUTE CALL CONVERGENCE? ==="
grep -n "convergence\|binding\|input_binding" web/src/app/api/import/sci/execute/route.ts
```

### 0F: How were OB-88/90 bindings created via script?

```bash
echo "=== OB-88 SCRIPT-BASED BINDING CREATION ==="
find web/scripts -name "*ob-88*" -o -name "*ob88*" -o -name "*pipeline*proof*" | head -10
echo ""
grep -rn "input_bindings" web/scripts/ --include="*.ts" | head -15
echo ""
echo "=== OB-90 OPTICAL FIX BINDING CREATION ==="
find web/scripts -name "*ob-90*" -o -name "*ob90*" -o -name "*optical*" | head -10
grep -rn "input_bindings" web/scripts/*ob* --include="*.ts" 2>/dev/null | head -15
```

### 0G: How does the SCI proposal expose convergence results?

```bash
echo "=== SCI TYPES — CONVERGENCE FIELDS ==="
grep -n "convergence\|binding\|ConvergenceResult" web/src/lib/sci/sci-types.ts | head -15
echo ""
echo "=== ANALYZE API — CONVERGENCE STEP ==="
grep -n "convergence\|binding" web/src/app/api/import/sci/analyze/route.ts | head -15
```

**Commit:** `OB-136 Phase 0: Diagnostic — gap between SCI import and Calculate binding path`

---

## PHASE 1: ARCHITECTURE DECISION

Based on Phase 0 findings, choose the minimal integration path:

```
ARCHITECTURE DECISION RECORD — OB-136
=====================================

Problem: SCI execute commits data but Calculate shows "No bindings."
The bridge between committed_data and rule_sets.input_bindings is missing.

Option A: Wire convergence service call into SCI execute (post-commit hook)
  - After SCI execute commits data, call convergence to re-generate input_bindings
  - Convergence already knows how to match plan requirements to data supply
  - input_bindings written to rule_sets table
  - Calculate reads them on next load
  PRO: Uses existing convergence infrastructure
  CON: Convergence service may need extension for SCI-specific semantics

Option B: Generate input_bindings directly in SCI execute from semantic bindings
  - SCI execute already has semantic roles (entity_identifier, performance_target, etc.)
  - Use semantic bindings to directly construct input_bindings in the format Calculate expects
  - Skip convergence service entirely
  PRO: Simpler, fewer moving parts, semantic bindings are already precise
  CON: Duplicates convergence logic, may drift from Calculate's expectations

Option C: Calculate reads semantic bindings directly (alternative to input_bindings)
  - Instead of writing to input_bindings, teach Calculate to read from SCI semantic bindings
  - New data path: Calculate checks import_batches.metadata for SCI bindings if input_bindings is empty
  PRO: No modification to rule_sets table
  CON: Two code paths for Calculate to maintain

DECISION: [Choose based on Phase 0 findings. Prefer Option A if convergence service
is functional and extendable. Prefer Option B if convergence service is too complex
to modify safely. Avoid Option C — it creates parallel paths.]
```

**Commit:** `OB-136 Phase 1: Architecture decision — [chosen option]`

---

## PHASE 2: CONVERGENCE BINDING PERSISTENCE

**Goal:** After SCI execute commits data, input_bindings are generated and persisted on the rule_set.

### 2A: Understand the working binding format

From Phase 0C and 0B, you have the exact structure of LAB/MBC's working input_bindings. The Óptica Luminar rule_set must have input_bindings in THE SAME FORMAT.

Do NOT invent a new format. Read the working format and produce identical structure.

### 2B: Implement the bridge

Based on the architecture decision (Phase 1), implement:

**If Option A (convergence service hook):**
1. Add a `generateBindingsFromSCI()` function that takes the SCI execution results + semantic bindings
2. Call the existing convergence service to match plan component requirements to committed data_types
3. Write the resulting input_bindings to the rule_set
4. Handle the case where the rule_set already has partial bindings (merge, don't overwrite)

**If Option B (direct from semantic bindings):**
1. After SCI execute commits data for a tenant, collect all committed data_types and their semantic roles
2. For each component in the rule_set, match its requirements to available data_types using semantic roles
3. Construct input_bindings in the exact format from Phase 0B
4. Write to rule_set

### 2C: Trigger point

The binding generation must run AFTER all content units are executed (not after each one). The "Confirm All & Go" flow executes content units in processing order. After the last execution completes successfully, run binding generation.

In `web/src/app/api/import/sci/execute/route.ts` or in the UI component that orchestrates execution:
- After all units are processed
- Identify the tenant_id and rule_set_id
- Generate and persist bindings
- Return binding status in the response

### 2D: Verify

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

const { data } = await sb.from('rule_sets')
  .select('name, input_bindings')
  .eq('tenant_id', PTC);

data?.forEach(rs => {
  console.log('Plan:', rs.name);
  const bindings = rs.input_bindings || {};
  console.log('Has bindings:', Object.keys(bindings).length > 0);
  console.log('Binding keys:', Object.keys(bindings));
  console.log('First 500 chars:', JSON.stringify(bindings)?.slice(0, 500));
});
"
```

**PROOF GATE:** rule_set.input_bindings is non-empty after SCI import. Structure matches LAB/MBC working format.

**Commit:** `OB-136 Phase 2: Convergence binding persistence — SCI execute writes input_bindings`

---

## PHASE 3: PERIOD DETECTION FROM DATA

**Goal:** Periods are created from date columns in the imported data, not from the current date.

### 3A: Find the current period creation logic

```bash
echo "=== PERIOD CREATION ==="
grep -rn "periods.*insert\|createPeriod\|detectPeriod\|period.*create" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20
echo ""
echo "=== SCI EXECUTE PERIOD HANDLING ==="
grep -n "period\|date\|timestamp\|Fecha\|Mes" web/src/app/api/import/sci/execute/route.ts | head -15
```

### 3B: Implement data-driven period detection

During SCI execute, when transaction/target data is committed:
1. Scan date-type fields in the committed data (identified by semantic roles: event_timestamp, date)
2. Extract unique month/year combinations
3. Create period records with start_date and end_date matching the data range
4. If periods already exist for this tenant + date range, reuse them (no duplicates)

**Important:** Do NOT hardcode "Mes" or "Fecha" or any field name. Use the semantic roles from the SCI classification to identify date fields. Korean Test applies.

### 3C: Verify

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

const { data } = await sb.from('periods')
  .select('label, start_date, end_date')
  .eq('tenant_id', PTC);

console.log('Periods:', data?.length);
data?.forEach(p => console.log(' ', p.label, p.start_date, '→', p.end_date));
"
```

**PROOF GATE:** Periods match actual data date ranges. January 2024 period exists (not just February 2026).

**Commit:** `OB-136 Phase 3: Period detection from imported data — not from current date`

---

## PHASE 4: ENTITY DEDUPLICATION ON RE-IMPORT

**Goal:** Re-importing the same roster doesn't create duplicate entities.

### 4A: Check current entity resolution in SCI execute

```bash
echo "=== ENTITY CREATION IN SCI EXECUTE ==="
grep -n "entit\|dedup\|external_id\|upsert\|ON CONFLICT" \
  web/src/app/api/import/sci/execute/route.ts | head -20
```

### 4B: Implement deduplication

When SCI execute processes entity-classified content:
1. Extract the entity_identifier field (from semantic bindings)
2. For each row, check if an entity with this external_id already exists for this tenant
3. If exists: update metadata if needed, skip creation
4. If new: create entity

Use `upsert` with `onConflict: 'tenant_id,external_id'` if the unique constraint exists. If not, add it.

### 4C: Verify

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

const { count } = await sb.from('entities')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', PTC);

console.log('Entity count:', count, count === 719 ? '✅ EXACT' : '⚠️ Expected 719');
"
```

**PROOF GATE:** Entity count is 719 (or stable at the correct number for this tenant), not growing with each import.

**Commit:** `OB-136 Phase 4: Entity deduplication — upsert by external_id`

---

## PHASE 5: PLAN NAMING FROM AI INTERPRETATION

**Goal:** Plan name reflects AI-extracted identity, not "Imported Plan."

### 5A: Check where plan name is set

```bash
grep -rn "Imported Plan\|plan.*name\|rule_set.*name" \
  web/src/app/api/import/ --include="*.ts" | head -15
grep -rn "Imported Plan" web/src/ --include="*.ts" --include="*.tsx" | head -10
```

### 5B: Use AI-extracted name

When plan rules are interpreted, the AI response typically includes a plan name or title. Use this as the rule_set name instead of "Imported Plan." If the AI doesn't provide a name, use the filename without extension as a fallback (e.g., "RetailCorp Plan1").

**Commit:** `OB-136 Phase 5: Plan naming from AI interpretation`

---

## PHASE 6: PAYLOAD SIZE HANDLING

**Goal:** Large tabs don't fail with HTTP 413.

### 6A: Check current payload size

```bash
echo "=== EXECUTE ROUTE BODY HANDLING ==="
head -30 web/src/app/api/import/sci/execute/route.ts
echo ""
echo "=== VERCEL CONFIG ==="
cat web/vercel.json 2>/dev/null || echo "No vercel.json"
cat web/next.config.js 2>/dev/null | grep -A5 "body\|payload\|limit" || echo "No body limit config"
cat web/next.config.mjs 2>/dev/null | grep -A5 "body\|payload\|limit" || echo "No body limit in mjs"
```

### 6B: Implement chunked execution for large tabs

If a content unit has more than 5,000 rows, split the execution into batches:
1. SCI execute receives the full content unit
2. If rowCount > 5,000: split rawData into chunks of 5,000
3. Execute each chunk as a separate committed_data insert
4. All chunks share the same import_batch_id and data_type
5. Return aggregate result

Additionally, increase the Next.js API body size limit if possible:

```javascript
// In the route.ts or next.config:
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
```

For App Router, this may need to be handled differently. Check the Next.js App Router body size configuration.

**Commit:** `OB-136 Phase 6: Chunked execution for large tabs + body size limit`

---

## PHASE 7: BROWSER VERIFICATION (CLT-137 RE-TEST)

### 7A: Clean stale data for Óptica Luminar

Before re-testing, clean accumulated stale data:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

// Count before cleanup
const tables = ['entities', 'committed_data', 'calculation_results', 'calculation_batches', 'periods'];
for (const t of tables) {
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('tenant_id', PTC);
  console.log(t + ':', count);
}
"
```

Document the counts. If entity count is >719, investigate duplicates. If stale calculation_results exist, DELETE them.

### 7B: Import through SCI and verify bindings

1. Navigate to `/operate/import` for Pipeline Test Co
2. Upload `BacktTest_Optometrista_mar2025_Proveedores.xlsx`
3. Confirm all SCI proposals
4. After execution completes, navigate to Calculate
5. **VERIFY:** Plan card shows bindings (NOT "No bindings")
6. **VERIFY:** Period dropdown includes January 2024 (or the correct data period)
7. **VERIFY:** Entity count is 719 (not 1000+)

### 7C: Calculate and verify totals

1. Select the correct period
2. Click Calculate
3. **VERIFY:** Results appear for 719 entities
4. **VERIFY:** Total payout is approximately MX$1,253,832

### 7D: Verify in browser (not just script)

All verification MUST happen in the browser at localhost:3000. This is a browser proof, not a script proof. Take note of what's visible and working.

**Commit:** `OB-136 Phase 7: Browser verification — SCI → Calculate with bindings`

---

## PHASE 8: REGRESSION

### 8A: LAB regression

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

const { data, count } = await sb.from('calculation_results')
  .select('total_payout', { count: 'exact' })
  .eq('tenant_id', LAB);

const total = data?.reduce((s, r) => s + parseFloat(r.total_payout || '0'), 0);
console.log('LAB results:', count, 'Expected: 268');
console.log('LAB total: $' + total?.toLocaleString(), 'Expected: \$8,498,311.77');
"
```

### 8B: MBC regression

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MBC = '7e31a1d0-8c14-41c0-9f01-471f3842834c';

const { data, count } = await sb.from('calculation_results')
  .select('total_payout', { count: 'exact' })
  .eq('tenant_id', MBC);

const total = data?.reduce((s, r) => s + parseFloat(r.total_payout || '0'), 0);
console.log('MBC results:', count, 'Expected: 240');
console.log('MBC total: $' + total?.toLocaleString(), 'Expected: \$3,245,212.66');
"
```

### 8C: Korean Test

```bash
grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus\|optometr\|óptica\|tienda\|empleado\|cobranza\|garantía\|protección\|venta" \
  web/src/lib/sci/ web/src/lib/convergence/ --include="*.ts" | grep -v "node_modules\|\.test\.\|COMPLETION" || echo "KOREAN TEST: PASS — 0 domain matches"
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

1. **What was built:** Per-phase summary
2. **Architecture decision:** Which option was chosen and why
3. **The bridge:** How SCI execute now wires through to rule_sets.input_bindings
4. **Period detection:** How periods are derived from data
5. **Entity deduplication:** Upsert pattern
6. **Payload handling:** Chunked execution for large tabs
7. **Browser proof results:** What Calculate shows after SCI import (screenshot-equivalent description)
8. **All proof gates with evidence**

```bash
gh pr create --base main --head dev \
  --title "OB-136: Pipeline Plumbing — SCI Import to Calculate Bridge" \
  --body "## CLT-137 Fix

### Problem
SCI classifies and commits data correctly, but Calculate shows 'No bindings.'
The convergence binding bridge between SCI execute and the Calculate page was missing.

### What This Fixes
- Convergence bindings persist after SCI import (rule_sets.input_bindings populated)
- Periods detected from imported data (not current date)
- Entity deduplication on re-import (upsert by external_id)
- Plan name from AI interpretation (not 'Imported Plan')
- Large tab payload handling (chunked execution for 413 errors)

### Proof
- Pipeline Test Co: SCI import → Calculate shows bindings → Calculate produces results
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
| PG-02 | Phase 0 diagnostic completed | Full gap analysis before any code |
| PG-03 | Architecture decision documented | Option A/B/C chosen with rationale |
| PG-04 | input_bindings populated after SCI import | rule_set shows non-empty bindings |
| PG-05 | Binding format matches LAB/MBC | Same structure as working tenants |
| PG-06 | Period detected from data | January 2024 (or correct data period) exists |
| PG-07 | Period NOT auto-generated from current date | No spurious "Febrero 2026" period |
| PG-08 | Entity count stable on re-import | ≤719 (not growing with each import) |
| PG-09 | Plan name is not "Imported Plan" | Reflects AI-extracted or filename-based name |
| PG-10 | Large tab doesn't 413 | Chunked execution or body limit increase |
| PG-11 | Calculate page shows plan with bindings | "No bindings" replaced with binding count or status |
| PG-12 | Calculate produces results after SCI import | Non-zero results for imported data |
| PG-13 | LAB regression | 268 results, $8,498,311.77 |
| PG-14 | MBC regression | 240 results, $3,245,212.66 |
| PG-15 | Korean Test | 0 domain vocabulary in modified files |
| PG-16 | localhost:3000 responds | HTTP 200/307 |

---

## CC FAILURE PATTERN WARNING

| Pattern | What Happened Before | What To Do Instead |
|---------|---------------------|-------------------|
| Optimistic data reasoning | OB-128: CC assumed convergence was writing bindings | Phase 0 TRACES the exact read/write path before coding |
| Parallel code paths | OB-85: Multiple ways to read bindings | ONE canonical path: SCI writes → rule_sets.input_bindings → Calculate reads |
| Format mismatch | OB-123: New bindings didn't match format Calculate expects | Phase 0B reads WORKING bindings and replicates exact structure |
| Stale state | OB-85 R3: Accumulated entities from multiple imports | Phase 4 implements upsert deduplication |
| Works locally, fails in production | CLT-137: 413 and timeouts don't occur on localhost | Phase 6 handles production-specific payload limits |

---

## ESTIMATED DURATION

- Phase 0: Diagnostic — 30 min
- Phase 1: Architecture decision — 10 min
- Phase 2: Convergence binding persistence — 60 min (CORE)
- Phase 3: Period detection — 30 min
- Phase 4: Entity deduplication — 20 min
- Phase 5: Plan naming — 15 min
- Phase 6: Payload handling — 30 min
- Phase 7: Browser verification — 20 min
- Phase 8: Regression — 15 min
- Phase 9: Completion report — 10 min

**Total: ~4 hours**

---

*"The agents are smart. The plumbing is broken. Fix the plumbing, and the intelligence flows through."*
