# OB-125: IMPORT PIPELINE QUALITY + CALCULATE PAGE READINESS

## Target: alpha.2.0
## Depends on: OB-123 (PR #139), OB-124 (PR #141), HF-082 (pending)
## Source: CLT-111 F-28/F-33/F-34/F-41/F-43/F-44/F-47, CLT-122 registry Tier 4

## READ FIRST — IN THIS ORDER
1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL sections, ALL rules, ALL anti-patterns
2. `SCHEMA_REFERENCE.md` — entities, periods, rule_set_assignments, calculation_results, committed_data
3. `VIALUCE_CLT_FINDINGS_REGISTRY_R7.md` — CLT-111 Approve & Commit + Calculation sections, cross-CLT patterns
4. This entire prompt, start to finish, before executing anything

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases, paste all output, commit per phase.

## STANDING RULES
- After EVERY commit: `git push origin dev`
- After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
- Git commands from repo root (`/Users/AndrewAfrica/spm-platform`)
- DO NOT MODIFY ANY AUTH FILE (middleware.ts, auth-shell.tsx, auth callback routes)
- Supabase `.in()` ≤ 200 items
- Evidence = paste, not describe
- One commit per phase

---

## WHY THIS OB EXISTS

The import pipeline gets data into the database but produces garbage downstream:
- **107 entities instead of 25** (F-33) — Officer 1001 in 4 files = 4 entities. No cross-file deduplication.
- **28 periods instead of 4** (F-34) — No check against existing periods. Every import creates new ones.
- **"43% Data Quality"** (F-35) — Meaningless metric that alarms users.
- **Approve page is noise** (F-28) — Three representations of the same data. No decision support.

The Calculate page then inherits the mess:
- **"Import data and run calculations"** shown after user already imported (F-41)
- **Errors as browser alert()** (F-44) — Not styled, not actionable
- **No plan readiness information** (F-47) — User can't tell which plans are ready to calculate
- **"Mark Official" on $0.00 results** (F-48) — Destructive action on obviously wrong data

This OB fixes the data quality problems in the import pipeline AND makes the Calculate page show honest readiness status. Both the engine intelligence and the user experience must be correct.

---

## SCOPE BOUNDARIES

### IN SCOPE
- Entity deduplication across files (F-33)
- Period deduplication against existing periods (F-34)
- Approve page cleanup — Bloodwork Principle (F-28, F-29, F-35)
- Commit button visibility (F-31)
- Calculate page: plan readiness cards replacing empty state (F-41, F-47)
- Calculate page: errors as platform UI, not alert() (F-44)
- Calculate page: disable "Mark Official" when total = $0 (F-48)
- Calculate page: show correct plan count (F-40)

### OUT OF SCOPE — DO NOT TOUCH
- File parsing (OB-124 completed)
- License-based assignment (HF-082)
- Convergence / input_bindings generation
- Wire API (already built in OB-123, fixed in HF-081)
- Plan interpretation pipeline
- Auth files
- Financial module pages
- Navigation structure

---

## PHASE 0: DIAGNOSTIC — MAP CURRENT STATE

```bash
cd /Users/AndrewAfrica/spm-platform

echo "╔══════════════════════════════════════════════════════╗"
echo "║  OB-125 PHASE 0: IMPORT + CALCULATE DIAGNOSTIC      ║"
echo "╚══════════════════════════════════════════════════════╝"

echo ""
echo "=== 0A: ENTITY CREATION — WHERE AND HOW ==="
grep -rn "entities.*insert\|upsert.*entities\|createEntit\|entity.*resolv\|resolveEntit" \
  web/src/app/api/ web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0B: ENTITY DEDUP — IS THERE A UNIQUE CONSTRAINT? ==="
grep -rn "external_id.*tenant\|unique.*entity\|conflict.*external\|ON CONFLICT" \
  web/src/ --include="*.ts" --include="*.sql" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== 0C: PERIOD CREATION — WHERE ==="
grep -rn "periods.*insert\|upsert.*periods\|createPeriod\|detect.*period\|period.*detect" \
  web/src/app/api/ web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0D: PERIOD DEDUP — DOES IT CHECK EXISTING? ==="
grep -rn "existing.*period\|period.*exists\|duplicate.*period\|select.*periods.*tenant" \
  web/src/app/api/ web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== 0E: APPROVE/COMMIT PAGE ==="
find web/src/app -path "*import*" -name "*.tsx" | sort
find web/src/app -path "*approve*" -name "*.tsx" | sort
find web/src/app -path "*commit*" -name "*.tsx" | sort

echo ""
echo "=== 0F: APPROVE PAGE — WHAT IT RENDERS ==="
# Find the approve/commit step component
grep -rn "Data Quality\|quality.*score\|43%\|Batch Summary\|Sheet Breakdown\|Warnings" \
  web/src/app/data/import/ web/src/app/operate/import/ --include="*.tsx" | head -20

echo ""
echo "=== 0G: CALCULATE PAGE ==="
find web/src/app -path "*calculate*" -name "page.tsx" | sort

echo ""
echo "=== 0H: CALCULATE — EMPTY STATE + ERROR HANDLING ==="
grep -rn "alert(\|window.alert\|Import data\|import data\|No entities assigned\|Mark Official\|markOfficial" \
  web/src/app/admin/launch/calculate/ web/src/app/operate/calculate/ \
  --include="*.tsx" --include="*.ts" 2>/dev/null | head -20

echo ""
echo "=== 0I: CALCULATE — PLAN QUERY ==="
grep -rn "rule_sets\|from.*rule.*set\|plans\|plan.*select" \
  web/src/app/admin/launch/calculate/ web/src/app/operate/calculate/ \
  --include="*.tsx" --include="*.ts" 2>/dev/null | head -20

echo ""
echo "=== 0J: CURRENT LAB STATE ==="
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

const [entities, periods, assignments, results] = await Promise.all([
  sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', LAB),
  sb.from('periods').select('id, label, start_date, end_date').eq('tenant_id', LAB),
  sb.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', LAB),
  sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', LAB),
]);

console.log('LAB entities:', entities.count);
console.log('LAB periods:', periods.data?.length);
periods.data?.forEach(p => console.log('  ', p.label || p.start_date, '→', p.end_date));
console.log('LAB assignments:', assignments.count);
console.log('LAB results:', results.count);
"
```

**PASTE ALL OUTPUT.**

**Commit:** `OB-125 Phase 0: Import + Calculate diagnostic`

---

## PHASE 1: ENTITY DEDUPLICATION (F-33)

When importing roster data across multiple files, the same officer (e.g., OfficerID 1001) must produce ONE entity, not N entities.

### 1A: Fix Entity Creation to Use Upsert

Wherever entities are created from import data, replace INSERT with UPSERT on `(tenant_id, external_id)`:

```typescript
// BEFORE (broken): INSERT always creates new rows
await supabase.from('entities').insert(entityRows);

// AFTER (correct): UPSERT — create if new, update metadata if existing
await supabase.from('entities').upsert(entityRows, {
  onConflict: 'tenant_id,external_id',
  ignoreDuplicates: false, // Update metadata on conflict
});
```

If a unique constraint on `(tenant_id, external_id)` doesn't exist in the database, it must be created. Check Phase 0B output.

### 1B: Verify the Constraint Exists

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Check for unique constraint
const { data } = await sb.rpc('exec_sql', { sql: \"\"\"
  SELECT constraint_name, constraint_type 
  FROM information_schema.table_constraints 
  WHERE table_name = 'entities' 
  AND constraint_type IN ('UNIQUE', 'PRIMARY KEY')
\"\"\" }).single();

console.log('Constraints:', data);
"
```

If no unique constraint on `(tenant_id, external_id)`:

```sql
-- Add unique constraint (run via Supabase SQL editor or migration)
ALTER TABLE entities ADD CONSTRAINT entities_tenant_external_unique 
  UNIQUE (tenant_id, external_id);
```

**NOTE:** If duplicate entities already exist for LAB, clean them up first:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

// Check for duplicates
const { data } = await sb.from('entities').select('external_id').eq('tenant_id', LAB);
const counts: Record<string, number> = {};
for (const e of data || []) counts[e.external_id] = (counts[e.external_id] || 0) + 1;
const dupes = Object.entries(counts).filter(([_, c]) => c > 1);
console.log('Duplicates:', dupes.length === 0 ? 'NONE' : dupes);
"
```

If duplicates exist, deduplicate — keep the entity with the most complete metadata, delete others, and reassign any orphaned assignments/results.

**Commit:** `OB-125 Phase 1: Entity deduplication — upsert on (tenant_id, external_id)`

---

## PHASE 2: PERIOD DEDUPLICATION (F-34)

Period creation must check for existing periods before creating new ones.

### 2A: Fix Period Creation

Wherever periods are created from import data:

```typescript
// BEFORE (broken): Always INSERT new periods
await supabase.from('periods').insert(detectedPeriods);

// AFTER (correct): Check existing first, only create missing ones
const { data: existing } = await supabase.from('periods')
  .select('id, start_date, end_date, label')
  .eq('tenant_id', tenantId);

const existingDates = new Set(
  (existing || []).map(p => `${p.start_date}|${p.end_date}`)
);

const newPeriods = detectedPeriods.filter(p => {
  const key = `${p.start_date}|${p.end_date}`;
  return !existingDates.has(key);
});

if (newPeriods.length > 0) {
  await supabase.from('periods').insert(newPeriods);
  console.log(`[Import] Created ${newPeriods.length} new periods, skipped ${detectedPeriods.length - newPeriods.length} existing`);
} else {
  console.log(`[Import] All ${detectedPeriods.length} detected periods already exist — no creation needed`);
}
```

### 2B: Clean Up Existing Period Pollution

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

const { data: periods } = await sb.from('periods')
  .select('id, label, start_date, end_date, created_at')
  .eq('tenant_id', LAB)
  .order('start_date');

console.log('Current periods:', periods?.length);
for (const p of periods || []) {
  console.log('  ', p.label || 'no label', '|', p.start_date, '→', p.end_date, '|', p.id.slice(0, 8));
}

// Identify duplicates (same start_date + end_date)
const seen = new Map<string, any[]>();
for (const p of periods || []) {
  const key = p.start_date + '|' + p.end_date;
  if (!seen.has(key)) seen.set(key, []);
  seen.get(key)!.push(p);
}

const dupes = [...seen.entries()].filter(([_, ps]) => ps.length > 1);
console.log('\nDuplicate groups:', dupes.length);
for (const [key, ps] of dupes) {
  console.log('  ', key, ':', ps.length, 'periods');
}
"
```

If duplicates exist, keep the oldest (first created) and reassign any references to deleted periods. If no critical references exist, delete the extras.

**Commit:** `OB-125 Phase 2: Period deduplication — check existing before creation`

---

## PHASE 3: APPROVE PAGE — BLOODWORK PRINCIPLE (F-28, F-29, F-31, F-35)

The Approve/Commit step currently shows three representations of the same data and a meaningless "43% Data Quality" score. Replace with a clean Bloodwork summary.

### 3A: Read the Current Approve Page

From Phase 0F output, identify the approve/commit component. Read it fully:

```bash
# Print the full component — adjust path from Phase 0E/0F
cat [APPROVE_COMPONENT_PATH]
```

### 3B: Replace with Bloodwork Summary

The approve step should show:

```
Import Summary
──────────────────────────────────────
Files: 7 processed
Entities: 25 detected (0 new, 25 existing)
Periods: 4 detected (0 new, 4 existing)
Data rows: 1,588 across 5 data types

⚠ 1 item needs attention:
   Insurance Referrals — 2 unmapped columns (Qualified, PolicyIssued)

[Review Mappings]  [Commit Import]
```

**Rules:**
- **No "Data Quality" percentage.** Remove it entirely. It alarms users for no reason.
- **No three representations.** One summary. One action.
- **Commit button visible in viewport.** Must be prominently placed, not below the fold.
- **Show what will happen, not what happened.** This is a preview of the commit, not a report of what was analyzed.
- **Warnings only for items that need attention.** If all mappings are good, no warnings shown. Bloodwork: passing checks build confidence silently.

### 3C: Implementation Approach

This is a UI change to an existing component. Do NOT create a new page. Edit the approve/commit step content:

1. Remove the Warnings bar chart (7 bars for 7 files)
2. Remove the duplicate Batch Summary
3. Remove the Sheet Breakdown (third view of same data)
4. Remove the "Data Quality" percentage
5. Add: entity count (with new vs existing breakdown)
6. Add: period count (with new vs existing breakdown)
7. Add: total data rows across all files
8. Add: attention items (low-confidence mappings, unmapped required columns)
9. Move Commit button to prominent position

**Commit:** `OB-125 Phase 3: Approve page — Bloodwork summary, remove noise`

---

## PHASE 4: CALCULATE PAGE — PLAN READINESS (F-41, F-47, F-40)

Replace the misleading empty state with plan readiness cards that tell the user what's ready and what's not.

### 4A: Read the Current Calculate Page

```bash
# Identify and read the calculate page
cat [CALCULATE_PAGE_PATH]
```

### 4B: Replace Empty State with Plan Readiness

When the Calculate page loads, query the state of all active plans for this tenant:

```typescript
// For each active rule_set:
interface PlanReadiness {
  planId: string;
  planName: string;
  entityCount: number;        // from rule_set_assignments
  bindingsComplete: boolean;  // input_bindings not null/empty
  hasCommittedData: boolean;  // committed_data exists for this plan's data types
  lastCalculation: string | null; // most recent batch timestamp
  lastTotal: number | null;   // most recent batch total
}
```

Render as cards:

```
┌──────────────────────────────────────────────────────────────┐
│  Consumer Lending Commission Plan 2024            ✓ Ready    │
│  25 entities · Bindings complete · 755 data rows             │
│  Last calculated: Feb 28 · $6,540,774.36                     │
│  [Calculate]                                                  │
├──────────────────────────────────────────────────────────────┤
│  Mortgage Origination Bonus Plan 2024             ✓ Ready    │
│  14 entities · Bindings complete · 588 data rows             │
│  Last calculated: Feb 28 · $989,937.41                       │
│  [Calculate]                                                  │
├──────────────────────────────────────────────────────────────┤
│  Insurance Referral Program 2024                  ✓ Ready    │
│  16 entities · Bindings complete · 188 data rows             │
│  Last calculated: Feb 28 · $366,600.00                       │
│  [Calculate]                                                  │
├──────────────────────────────────────────────────────────────┤
│  Deposit Growth Incentive Plan Q1 2024           ⚠ Partial  │
│  12 entities · Bindings complete · 48 data rows              │
│  ⚠ Missing: target data (growth_targets)                     │
│  [Calculate Anyway]                                           │
└──────────────────────────────────────────────────────────────┘

                    [Calculate All Ready Plans]
```

**NOTE:** The entity counts above assume HF-082 has been applied (license-based assignment). If HF-082 hasn't run yet, all plans will show 25 entities. The readiness cards must work correctly regardless — they read from rule_set_assignments, whatever exists.

### 4C: Show Correct Plan Count (F-40)

Query `rule_sets` with `status = 'active'` for the tenant. Show only active plans. No duplicates. If duplicate names exist, show the most recently created one.

### 4D: Contextual Empty State

If no plans exist: "No plans configured. Import a plan document to get started."
If plans exist but no data: "Plans configured but no data imported. Import data files to enable calculation."
If plans exist with data: Show plan readiness cards (4B).

Never show "Import data and run calculations" to a user who already imported data.

**Commit:** `OB-125 Phase 4: Calculate page — plan readiness cards, no misleading empty state`

---

## PHASE 5: CALCULATE PAGE — ERROR HANDLING (F-44, F-48)

### 5A: Replace alert() with Platform UI

Find all `alert()` or `window.alert()` calls in the calculate page and surrounding API calls. Replace with inline error display:

```typescript
// BEFORE (broken):
alert('No entities assigned to this rule set');

// AFTER (correct):
setCalculationError({
  plan: planName,
  message: 'No entities assigned to this plan',
  action: 'Run the wire API to create assignments, or manually assign entities',
});
```

Render errors in a styled container, not a browser dialog:

```tsx
{calculationError && (
  <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mt-4">
    <div className="text-red-400 font-medium">{calculationError.plan}</div>
    <div className="text-red-300 text-sm mt-1">{calculationError.message}</div>
    {calculationError.action && (
      <div className="text-zinc-400 text-sm mt-2">{calculationError.action}</div>
    )}
  </div>
)}
```

### 5B: Disable "Mark Official" on $0.00 Results (F-48)

If the total payout for a batch is $0.00, disable lifecycle advancement actions:

```typescript
const canAdvance = batchTotal > 0;

<button 
  disabled={!canAdvance}
  className={canAdvance ? 'bg-green-600 ...' : 'bg-zinc-700 cursor-not-allowed opacity-50 ...'}
>
  Mark Official
</button>

{!canAdvance && (
  <span className="text-zinc-500 text-sm">Cannot advance — total payout is $0.00</span>
)}
```

### 5C: Find and Fix All alert() Calls

```bash
# Find ALL alert() calls in the codebase
grep -rn "alert(" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "// " | head -20
```

Replace every `alert()` with appropriate inline UI feedback. This may span more than just the calculate page.

**Commit:** `OB-125 Phase 5: Error handling — platform UI, not browser alert()`

---

## PHASE 6: BUILD + VERIFICATION

```bash
cd /Users/AndrewAfrica/spm-platform
kill $(lsof -ti:3000) 2>/dev/null || true
rm -rf web/.next
cd web && npm run build && cd ..
echo "Build exit code: $?"
```

### 6A: Entity Dedup Verification

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

const { data } = await sb.from('entities').select('external_id').eq('tenant_id', LAB);
const counts: Record<string, number> = {};
for (const e of data || []) counts[e.external_id] = (counts[e.external_id] || 0) + 1;
const dupes = Object.entries(counts).filter(([_, c]) => c > 1);

console.log('Entities:', data?.length);
console.log('Duplicates:', dupes.length === 0 ? 'NONE — PASS' : dupes);
"
```

### 6B: Period Dedup Verification

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

const { data } = await sb.from('periods').select('start_date, end_date').eq('tenant_id', LAB);
const seen = new Set<string>();
let dupes = 0;
for (const p of data || []) {
  const key = p.start_date + '|' + p.end_date;
  if (seen.has(key)) dupes++;
  seen.add(key);
}

console.log('Periods:', data?.length);
console.log('Duplicates:', dupes === 0 ? 'NONE — PASS' : dupes);
"
```

### 6C: MBC Regression

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MBC = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

const [entities, periods, assignments, results] = await Promise.all([
  sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', MBC),
  sb.from('periods').select('*', { count: 'exact', head: true }).eq('tenant_id', MBC),
  sb.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', MBC),
  sb.from('calculation_results').select('total_payout').eq('tenant_id', MBC),
]);

const mbcTotal = (results.data || []).reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
console.log('MBC entities:', entities.count);
console.log('MBC periods:', periods.count);
console.log('MBC assignments:', assignments.count, '(expected 80)');
console.log('MBC total:', mbcTotal.toFixed(2), '(expected 3245212.64)');
console.log('VERDICT:', Math.abs(mbcTotal - 3245212.64) < 0.10 ? 'PASS' : 'FAIL');
"
```

### 6D: Korean Test

```bash
echo "=== KOREAN TEST ON MODIFIED FILES ==="
# Only check files modified in this OB
git diff --name-only HEAD~6 | while read f; do
  if [[ "$f" == *.ts || "$f" == *.tsx ]]; then
    hits=$(grep -in "mortgage\|insurance\|lending\|deposit\|loan\|consumer\|referral\|optical\|warranty\|collection" "$f" 2>/dev/null | grep -v "console.log\|comment\|//" | wc -l)
    if [ "$hits" -gt 0 ]; then
      echo "⚠️ $f: $hits domain vocabulary hits"
      grep -in "mortgage\|insurance\|lending\|deposit\|loan\|consumer\|referral" "$f" | grep -v "console.log\|//" | head -5
    fi
  fi
done
echo "Done."
```

**PASTE ALL OUTPUT.**

**Commit:** `OB-125 Phase 6: Build + verification`

---

## PHASE 7: COMPLETION REPORT

Create `OB-125_COMPLETION_REPORT.md` at project root.

### PROOF GATES — HARD

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-01 | `npm run build` exits 0 | Paste exit code |
| PG-02 | Entity upsert prevents duplicates (F-33) | Paste dedup verification showing 0 duplicates |
| PG-03 | Period creation checks existing (F-34) | Paste code showing existing period check |
| PG-04 | "Data Quality" percentage removed from approve page (F-35) | grep showing 0 references |
| PG-05 | Commit button visible without scrolling (F-31) | Component code showing button placement |
| PG-06 | Calculate page shows plan readiness cards (F-41, F-47) | Paste component showing readiness query |
| PG-07 | Zero `alert()` calls in calculate page (F-44) | grep showing 0 matches |
| PG-08 | "Mark Official" disabled when total = $0 (F-48) | Paste conditional logic |
| PG-09 | Correct plan count — only active, no duplicates (F-40) | Paste query with `status = 'active'` |
| PG-10 | MBC regression — entities, periods, assignments, total unchanged | Paste verification |
| PG-11 | No auth files modified | git diff |
| PG-12 | localhost:3000 responds | curl output |

### PROOF GATES — SOFT

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-S1 | Korean Test — 0 domain vocabulary in modified files | grep output |
| PG-S2 | Approve page: one summary, not three representations | Component structure |
| PG-S3 | Calculate empty state contextual to actual tenant state | Conditional rendering logic |
| PG-S4 | Readiness cards show entity count per plan | Query joins rule_set_assignments |

**Commit:** `OB-125 Phase 7: Completion report`

---

## FINAL: GIT PROTOCOL

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "OB-125 Complete: Import pipeline quality + Calculate page readiness"
git push origin dev

gh pr create --base main --head dev \
  --title "OB-125: Import Pipeline Quality + Calculate Page Readiness" \
  --body "Entity dedup via upsert (F-33). Period dedup against existing (F-34). Approve page Bloodwork cleanup (F-28/F-29/F-31/F-35). Calculate page: plan readiness cards (F-41/F-47), platform error UI not alert() (F-44), disabled Mark Official on \$0 (F-48), correct plan count (F-40)."
```

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Creating a new Calculate page instead of fixing the existing one | Fix existing. No CC Pattern 21 (dual code path). |
| AP-2 | Hardcoding plan readiness thresholds | Query actual state — entities, bindings, data. Don't hardcode "25 entities is correct." |
| AP-3 | Removing Data Quality and replacing with another meaningless metric | If you can't explain what the number means to a user, don't show it. |
| AP-4 | Making the approve page prettier without fixing the data problem | Dedup entities and periods FIRST (Phases 1-2), then fix the display (Phase 3). |
| AP-5 | Touching MBC data to "clean up" periods | MBC is regression baseline. Zero changes. |
| AP-6 | Building plan readiness from hardcoded license counts | Read from database: rule_set_assignments, committed_data, input_bindings. Whatever is real. |
| AP-7 | Suppressing errors instead of showing them properly | Errors must be visible. Replace alert() with styled inline errors, don't remove error handling. |

---

## CC FAILURE PATTERNS TO AVOID

| Pattern | Description | Prevention |
|---------|-------------|------------|
| 18 | Stale accumulation | Upsert, not INSERT. Check existing before creating. |
| 19 | Domain vocabulary leak | Readiness cards read plan names from database. No hardcoded plan names. Korean Test. |
| 21 | Dual code path | One calculate page. One approve component. Fix in place. |
| 22 | RLS silent swallow | Service role for write operations. Check affected row count. |

---

*"107 entities instead of 25. 28 periods instead of 4. The import pipeline was working perfectly — at creating garbage."*
*"The Calculate page told users to 'Import data and run calculations.' They had already imported. The page didn't know."*
*"We are not making a movie."*
