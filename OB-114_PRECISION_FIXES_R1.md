# OB-114: PRECISION FIXES — CLT-113 TRUTH REPORT EXECUTION
## Target: alpha.3.0
## Date: February 28, 2026
## Derived From: CLT-113 Truth Report (21 findings, 10 root causes, exact file:line for each)
## Approach: Exact-coordinate fixes with system-verified acceptance after each phase

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `CLT-113_TRUTH_REPORT.md` — the diagnostic that produced every fix target
4. `CLT-113_DATABASE_TRUTH.md` — database ground truth for all 3 tenants

**Read all four before writing any code.**

---

## WHY THIS OB IS DIFFERENT

Previous OBs described symptoms and let CC find the code. CC found the wrong code, changed it, and reported PASS.

This OB gives CC **exact file:line coordinates** for every change, the **exact code to write**, and requires CC to **verify each fix by observing the rendered output** — not by reading the code it just wrote.

**Rules for this OB:**
1. **Every proof gate is browser-observable.** CC must start the dev server, navigate to the page, and report what it SEES — not what the code SAYS.
2. **CC must run Supabase queries to verify data fixes.** Paste the query AND the result.
3. **No fix is PASS until CC has observed the rendered output on localhost:3000 and pasted evidence.**
4. **If a fix doesn't produce the expected rendered result, CC must diagnose WHY before moving on** — not mark it PASS and continue.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. Supabase `.in()` calls MUST batch ≤200 items per call.

---

## PHASE 0: COMMIT PROMPT + VERIFY STARTING STATE (5 min)

### 0A: Commit this prompt

```bash
cd ~/spm-platform
cp [prompt location] OB-114_PRECISION_FIXES_R1.md
git add OB-114_PRECISION_FIXES_R1.md && git commit -m "OB-114: Precision fixes prompt from CLT-113 truth report" && git push origin dev
```

### 0B: Verify dev is current with main

```bash
git checkout dev && git pull origin dev
git log --oneline -5  # Confirm CLT-113 commits are present
```

### 0C: Start dev server and confirm it responds

```bash
cd ~/spm-platform/web
rm -rf .next && npm run build && npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Must return 200
```

---

## PHASE 1: FIX CONFIDENCE 50% — THE ADAPTER FALLBACK (10 min)

### What CLT-113 Found

**Root cause:** `web/src/lib/ai/providers/anthropic-adapter.ts:630`
```typescript
const confidence = (result.confidence as number) / 100 || 0.5;
```
When AI omits `confidence` from JSON response: `(undefined as number) / 100` = `NaN`, and `NaN || 0.5` = `0.5`. Then `route.ts:187` multiplies by 100 → 50%.

### Exact Change

**File:** `web/src/lib/ai/providers/anthropic-adapter.ts`
**Line:** 630 (approximate — find the exact line with the pattern below)

Find this pattern:
```typescript
const confidence = (result.confidence as number) / 100 || 0.5;
```

Replace with:
```typescript
const confidence = typeof result.confidence === 'number' && result.confidence > 0
  ? result.confidence / 100
  : 0;
```

**Why:** When AI doesn't return confidence, the value should be 0 (unknown), not 0.5 (fake 50%). Zero is honest. The UI can show "Pending" or "0%" — both are better than fake 50%.

### Acceptance Test

After making the change:

1. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev`
2. Open `http://localhost:3000` in a way that lets you see the page content. Use `curl` to fetch the import page HTML after uploading a file, or use the network log to inspect API responses:

```bash
# Verify the code change exists
grep -n "typeof result.confidence" web/src/lib/ai/providers/anthropic-adapter.ts
# Expected: shows the new line with typeof check

# Verify no remaining || 0.5 fallback for confidence
grep -n "|| 0.5" web/src/lib/ai/providers/anthropic-adapter.ts
# Expected: zero matches (or matches in unrelated contexts only)

# Verify no other hardcoded 0.5 confidence values in the adapter
grep -n "0\.5" web/src/lib/ai/providers/anthropic-adapter.ts
# Document each match — are any of them confidence-related?
```

3. **API-level verification:** Find the analyze-workbook API route and trace what it returns:

```bash
grep -n "confidence" web/src/app/api/analyze-workbook/route.ts
# Document: does route.ts multiply by 100? Where does it read from?
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-01 | `|| 0.5` removed from adapter confidence line | `grep -n "|| 0.5" anthropic-adapter.ts` — zero confidence-related matches | Paste grep output |
| PG-02 | New code uses `typeof` check | `grep -n "typeof result.confidence" anthropic-adapter.ts` — shows new line | Paste grep output |
| PG-03 | No other hardcoded 50% confidence in adapter | `grep -n "0\.5" anthropic-adapter.ts` — document all matches | Paste grep output with analysis |
| PG-04 | `npm run build` exits 0 | Build succeeds | Paste last 3 lines of build output |

**Commit:** `OB-114 Phase 1: Fix confidence 50% fallback — anthropic-adapter.ts:630`

---

## PHASE 2: FIX RULE SET SERVICE — STATUS FILTER + ORDER (10 min)

### What CLT-113 Found

**Root cause:** `web/src/lib/supabase/rule-set-service.ts:106-108`
```typescript
const { data, error } = await supabase
  .from('rule_sets')
  .select('*')
  .eq('tenant_id', tenantId);
```
No status filter → returns all 18 MBC rule sets (13 archived + 5 active).
No ORDER BY → plans appear in insertion order, not alphabetical.

### Exact Change

**File:** `web/src/lib/supabase/rule-set-service.ts`
**Lines:** 106-108 (approximate — find the `getRuleSets` function)

Find this pattern:
```typescript
.from('rule_sets')
.select('*')
.eq('tenant_id', tenantId)
```

Replace with:
```typescript
.from('rule_sets')
.select('*')
.eq('tenant_id', tenantId)
.eq('status', 'active')
.order('name')
```

**IMPORTANT:** There may be OTHER places in this file that query rule_sets. Check ALL `.from('rule_sets')` calls in this file. Only add the status filter to the primary `getRuleSets` function that feeds the import page plan selector. Do NOT add it to admin functions that need to see all statuses.

### Acceptance Test

```bash
# Verify the change
grep -A 4 "from('rule_sets')" web/src/lib/supabase/rule-set-service.ts
# Expected: shows .eq('status', 'active').order('name') on the getRuleSets query

# Count how many from('rule_sets') calls exist in this file
grep -c "from('rule_sets')" web/src/lib/supabase/rule-set-service.ts
# Document each one — which ones got the filter and which didn't (and why)
```

**Database verification:**
```bash
# From the web/ directory, run a quick query to confirm active count
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('rule_sets').select('name, status').eq('tenant_id', 'fa6a48c5-56dc-416d-9b7d-9c93d4882251').eq('status', 'active').order('name');
console.log('MBC active rule sets:', data?.length);
data?.forEach(r => console.log(' ', r.name));
"
```

Expected output:
```
MBC active rule sets: 5
  CFG Insurance Referral Program 2024
  Consumer Lending Commission Plan 2024
  Deposit Growth Incentive — Q1 2024
  Insurance Referral Program 2024
  Mortgage Origination Bonus Plan 2024
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-05 | getRuleSets includes `.eq('status', 'active').order('name')` | grep output showing the change | Paste grep output |
| PG-06 | Other rule_sets queries documented — filter only on consumer-facing function | List all from('rule_sets') calls with yes/no filter | Paste list |
| PG-07 | DB query confirms 5 active MBC plans alphabetically | Run the tsx query above | Paste query output |
| PG-08 | `npm run build` exits 0 | Build succeeds | Paste last 3 lines |

**Commit:** `OB-114 Phase 2: getRuleSets active filter + alphabetical order`

---

## PHASE 3: FIX SESSION CONTEXT — ACTIVE-ONLY COUNT (10 min)

### What CLT-113 Found

**Root cause:** `web/src/contexts/session-context.tsx:84`
```typescript
supabase.from('rule_sets').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
```
Counts ALL rule_sets including archived. MBC returns 18 instead of 5. This makes `hasICM = ruleSetCount > 0` return true even for tenants with only archived ICM plans.

### Exact Change

**File:** `web/src/contexts/session-context.tsx`
**Line:** 84 (approximate — find the rule_sets count query)

Find this pattern:
```typescript
.from('rule_sets').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
```

Replace with:
```typescript
.from('rule_sets').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active')
```

### Acceptance Test

```bash
# Verify the change
grep -n "from('rule_sets')" web/src/contexts/session-context.tsx
# Expected: shows .eq('status', 'active') on the count query
```

### Impact Analysis

After this fix, routing will change:
- **Sabor:** `ruleSetCount` goes from 2 → 2 (both are active, no change)
- **MBC:** `ruleSetCount` goes from 18 → 5 (still > 0, so hasICM still true, no routing change)
- **Impact on financial-only routing:** If a tenant has `financial: true` and only ARCHIVED rule sets, `ruleSetCount` would now be 0, making `hasICM = false` and `useFinancialOnly = true`. This is the CORRECT behavior — archived plans shouldn't count.

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-09 | session-context rule_sets query includes `.eq('status', 'active')` | grep output | Paste grep output |
| PG-10 | `npm run build` exits 0 | Build succeeds | Paste last 3 lines |

**Commit:** `OB-114 Phase 3: session-context active-only rule set count`

---

## PHASE 4: FIX COMPLETE STEP LABEL + SOURCE (10 min)

### What CLT-113 Found

**Root cause:** `web/src/app/data/import/enhanced/page.tsx:4381`
```typescript
{validationResult?.overallScore || analysisConfidence}%
```
With label "Data Quality" — should be "AI Confidence" using `analysisConfidence` only.

### Exact Change

**File:** `web/src/app/data/import/enhanced/page.tsx`

Find these patterns (near line 4381):

Pattern 1 — the value:
```typescript
{validationResult?.overallScore || analysisConfidence}%
```
Replace with:
```typescript
{analysisConfidence}%
```

Pattern 2 — the label (nearby, could be a few lines above or below):
```typescript
{isSpanish ? 'Calidad de Datos' : 'Data Quality'}
```
Replace with:
```typescript
{isSpanish ? 'Confianza AI' : 'AI Confidence'}
```

### Acceptance Test

```bash
# Verify no remaining "Data Quality" label in the complete/approve step
grep -n "Data Quality\|Calidad de Datos" web/src/app/data/import/enhanced/page.tsx
# Expected: zero matches (OB-113 removed from approve, this phase removes from complete)

# Verify "AI Confidence" is used
grep -n "AI Confidence\|Confianza AI" web/src/app/data/import/enhanced/page.tsx
# Expected: at least 2 matches (approve step + complete step)

# Verify overallScore is not used for confidence display
grep -n "overallScore" web/src/app/data/import/enhanced/page.tsx
# Document all remaining uses — are any of them for confidence display?
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-11 | No "Data Quality" label remaining | grep output shows zero matches | Paste grep output |
| PG-12 | "AI Confidence" in both approve and complete steps | grep output shows 2+ matches | Paste grep output |
| PG-13 | `overallScore` not used for confidence display | grep + analysis | Paste grep output |
| PG-14 | `npm run build` exits 0 | Build succeeds | Paste last 3 lines |

**Commit:** `OB-114 Phase 4: Complete step — AI Confidence label and source`

---

## PHASE 5: DATA FIXES — ARCHIVE DUPLICATE PLAN + VERIFY (10 min)

### What CLT-113 Found

**Root cause:** MBC has two active insurance referral plans:
- `59146196-61b0-43b9-9285-046738e54c0f` — "CFG Insurance Referral Program 2024"
- `574faa83-6f14-4975-baca-36e7e3fd4937` — "Insurance Referral Program 2024"

One needs to be archived.

### Exact Change

Run this SQL in Supabase SQL Editor (or via script):

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Archive the duplicate CFG Insurance Referral
const { data, error } = await sb
  .from('rule_sets')
  .update({ status: 'archived' })
  .eq('id', '59146196-61b0-43b9-9285-046738e54c0f')
  .select('id, name, status');

if (error) { console.error('ERROR:', error); process.exit(1); }
console.log('Archived:', data);

// Verify active count
const { data: active } = await sb
  .from('rule_sets')
  .select('name, status')
  .eq('tenant_id', 'fa6a48c5-56dc-416d-9b7d-9c93d4882251')
  .eq('status', 'active')
  .order('name');

console.log('\\nMBC active rule sets after fix:', active?.length);
active?.forEach(r => console.log(' ', r.name));
"
```

Expected output:
```
Archived: [ { id: '59146196-...', name: 'CFG Insurance Referral Program 2024', status: 'archived' } ]

MBC active rule sets after fix: 4
  Consumer Lending Commission Plan 2024
  Deposit Growth Incentive — Q1 2024
  Insurance Referral Program 2024
  Mortgage Origination Bonus Plan 2024
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-15 | Archive query executed successfully | Script output shows archived row | Paste script output |
| PG-16 | MBC now has exactly 4 active plans | Verification query shows 4 names | Paste query output |

**Commit:** `OB-114 Phase 5: Archive duplicate MBC insurance referral plan`

---

## PHASE 6: REMOVE FAKE CALCULATION PREVIEW (10 min)

### What CLT-113 Found

**Root cause:** `web/src/app/data/import/enhanced/page.tsx:1986`
```typescript
500 + Math.random() * 1500
```
The Calculation Preview on the Validate page shows random numbers pretending to be calculation results. This is misleading — users see dollar amounts that are literally random.

### Exact Change

**File:** `web/src/app/data/import/enhanced/page.tsx`

Find the Calculation Preview section (approximately lines 1942-2019). This section renders a table with entity rows and component columns filled with `Math.random()` values.

**Option A (preferred):** Remove the entire Calculation Preview section. Replace with a simple message:

```typescript
{/* Calculation Preview — removed: actual calculations run after import commit */}
<div className="p-4 rounded-lg border border-gray-700 bg-gray-800/50">
  <p className="text-sm text-gray-400">
    {isSpanish 
      ? 'La vista previa de cálculo estará disponible después de importar los datos.' 
      : 'Calculation preview will be available after data is imported and calculation is run.'}
  </p>
</div>
```

**Option B (if removing breaks the page layout):** Keep the table structure but replace random values with "—" dashes and add a note that actual calculation happens after import.

**Do NOT** replace random values with zeros — that's equally misleading.

### Acceptance Test

```bash
# Verify Math.random is removed from calculation context
grep -n "Math.random" web/src/app/data/import/enhanced/page.tsx
# Expected: zero matches

# Verify no random number generation remains for display purposes
grep -n "random\|Random" web/src/app/data/import/enhanced/page.tsx
# Document any remaining matches — are they display-related?
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-17 | No `Math.random()` in import page | grep output shows zero matches | Paste grep output |
| PG-18 | Replacement text is honest (not fake zeros) | Show the replacement code | Paste the new JSX block |
| PG-19 | `npm run build` exits 0 | Build succeeds | Paste last 3 lines |

**Commit:** `OB-114 Phase 6: Remove fake calculation preview — Math.random eliminated`

---

## PHASE 7: SYSTEM-VERIFIED ACCEPTANCE TEST (20 min)

**This is the critical phase.** CC must start the dev server, navigate to actual pages, and verify that every fix produces the expected user-visible result.

### 7A: Start fresh dev server

```bash
cd ~/spm-platform/web
# Kill any running dev server
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 15
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Must return 200
```

### 7B: API-Level Confidence Verification

Test the analyze-workbook endpoint to see what confidence value it returns:

```bash
# Check what the adapter returns now when AI omits confidence
# Look at the most recent API call in the server logs, or:
grep -n "confidence" web/src/lib/ai/providers/anthropic-adapter.ts | head -10
# Confirm: no || 0.5, uses typeof check
```

### 7C: Rule Set Service Verification

```bash
# Query MBC plans through the service layer (simulates what the UI gets)
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, count } = await sb
  .from('rule_sets')
  .select('name, status', { count: 'exact' })
  .eq('tenant_id', 'fa6a48c5-56dc-416d-9b7d-9c93d4882251')
  .eq('status', 'active')
  .order('name');
console.log('Active plans:', count);
data?.forEach(r => console.log(' ', r.name));
"
```

Expected: 4 plans, alphabetically ordered, no duplicates.

### 7D: Full Page Content Verification

```bash
# Fetch the import page and look for key strings
curl -s http://localhost:3000/operate/import/enhanced 2>/dev/null | grep -i "data quality\|Math.random\|50%" | head -10
# Expected: no matches for "Data Quality" or "Math.random" or "50%"

# Check for AI Confidence label
curl -s http://localhost:3000/operate/import/enhanced 2>/dev/null | grep -i "AI Confidence\|Confianza AI" | head -5
# Expected: matches found
```

**NOTE:** If curl doesn't return meaningful HTML (SSR might not include all client-side rendered content), document that limitation and explain what alternative verification was used.

### 7E: Build Verification Summary

```bash
# Final clean build
cd ~/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -5
echo "Exit code: $?"
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-20 | Dev server responds | curl returns 200 | Paste curl output |
| PG-21 | MBC has 4 active plans (not 5) via DB query | tsx script output | Paste query result |
| PG-22 | No "Data Quality" in rendered page | curl grep or alternative | Paste verification output |
| PG-23 | No Math.random in rendered page | curl grep or alternative | Paste verification output |
| PG-24 | Final build clean | npm run build exits 0 | Paste last 5 lines + exit code |

**Commit:** `OB-114 Phase 7: System-verified acceptance test — all fixes verified`

---

## PHASE 8: COMPLETION REPORT + PR (10 min)

### 8A: Write completion report

Create `OB-114_COMPLETION_REPORT.md` at project root:

```markdown
# OB-114 COMPLETION REPORT
## Precision Fixes from CLT-113 Truth Report
## Date: [today]
## PR: #[number]

### CLT-113 Findings Addressed

| CLT-113 Finding | Root Cause | Fix Applied | Verified How |
|---|---|---|---|
| T-04: 50% confidence | anthropic-adapter.ts:630 `\|\| 0.5` | typeof check, fallback to 0 | grep confirms no \|\| 0.5 |
| T-02/T-09/T-21: getRuleSets no filter | rule-set-service.ts:106 | .eq('status','active').order('name') | DB query returns 4 MBC plans |
| T-02: session-context counts all | session-context.tsx:84 | .eq('status','active') | grep confirms filter |
| T-11: Complete step "Data Quality" | enhanced/page.tsx:4381 | "AI Confidence" + analysisConfidence | grep confirms label |
| T-08: 5 plans not 4 | Duplicate active insurance plan | SQL archived duplicate | DB query returns 4 |
| T-10: Math.random calc preview | enhanced/page.tsx:1986 | Removed fake preview | grep confirms no Math.random |

### PDR Resolutions

| PDR | Status |
|---|---|
| PDR-08 (50% confidence) | ROOT CAUSE FIXED — adapter fallback eliminated |

### Files Modified

[List all files with line counts]

### Commits

[List all commits in order]

### System Verification Results

[Paste Phase 7 verification outputs]

### What's NOT Fixed (Requires Design Session)

| Item | Why |
|---|---|
| T-13: MBC $0.00 calculation | Architectural — input_bindings NULL, semantic binding layer needed |
| T-01: Sabor routing | Design decision — Sabor is genuinely dual-module |
| T-15: CSV data_type "Sheet1" | Moderate — needs import commit route change |
| Smart plan auto-selection | Architectural — needs file-to-plan matching logic |

### Release Context
Target: alpha.3.0
PR: #[number]
CLT verification: CLT-114
```

### 8B: Create PR

```bash
gh pr create --base main --head dev --title "OB-114: Precision Fixes — Confidence, Plan Filter, Data Quality Label, Duplicate Plan, Fake Preview" --body "CLT-113 truth report execution. 6 targeted fixes with exact file:line coordinates. Fixes: adapter confidence fallback (PDR-08 root cause), getRuleSets active filter + order, session-context active count, complete step label, archive duplicate plan, remove Math.random preview. System-verified acceptance test included."
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-25 | Completion report at project root | `ls -la OB-114_COMPLETION_REPORT.md` | Paste ls output |
| PG-26 | PR created | gh pr output | Paste PR URL |

**Commit:** `OB-114 Phase 8: Completion report and PR`

---

## PROOF GATE SUMMARY

| # | Gate | Phase | Type |
|---|------|-------|------|
| PG-01 | No `\|\| 0.5` in adapter confidence | 1 | grep |
| PG-02 | typeof check in adapter | 1 | grep |
| PG-03 | No other hardcoded 0.5 confidence | 1 | grep + analysis |
| PG-04 | Build clean after Phase 1 | 1 | build output |
| PG-05 | getRuleSets has active filter + order | 2 | grep |
| PG-06 | Other rule_sets queries documented | 2 | list |
| PG-07 | DB confirms 5→4 active MBC plans (after Phase 5 SQL) | 2 | query output |
| PG-08 | Build clean after Phase 2 | 2 | build output |
| PG-09 | session-context has active filter | 3 | grep |
| PG-10 | Build clean after Phase 3 | 3 | build output |
| PG-11 | No "Data Quality" label | 4 | grep |
| PG-12 | "AI Confidence" in both steps | 4 | grep |
| PG-13 | overallScore not used for confidence | 4 | grep + analysis |
| PG-14 | Build clean after Phase 4 | 4 | build output |
| PG-15 | Duplicate plan archived | 5 | script output |
| PG-16 | 4 active MBC plans confirmed | 5 | query output |
| PG-17 | No Math.random in import page | 6 | grep |
| PG-18 | Replacement is honest text | 6 | code paste |
| PG-19 | Build clean after Phase 6 | 6 | build output |
| PG-20 | Dev server responds 200 | 7 | curl output |
| PG-21 | 4 active plans via DB | 7 | query output |
| PG-22 | No "Data Quality" rendered | 7 | page verification |
| PG-23 | No Math.random rendered | 7 | page verification |
| PG-24 | Final build clean | 7 | build output |
| PG-25 | Completion report exists | 8 | ls output |
| PG-26 | PR created | 8 | PR URL |

**Total: 8 phases, 26 proof gates.**
**Every proof gate requires pasted output, not self-attestation.**

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-114_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE

---

## WHAT SUCCESS LOOKS LIKE

After this OB, the platform will:
1. **Not show fake 50% confidence** — adapter returns 0 when AI doesn't provide confidence, UI shows honest value
2. **Show only active plans** in alphabetical order — not 18 archived+active plans in random order
3. **Show 4 plans for MBC** — not 5 (duplicate archived)
4. **Say "AI Confidence" everywhere** — not "Data Quality"
5. **Not show random dollar amounts** in calculation preview — honest placeholder instead
6. **Active rule set count will be correct** for routing decisions

These are the trivial/moderate fixes. The architectural fixes (semantic binding, smart plan selection) require a design session — they are NOT in scope for this OB.

---

*"Every fix has coordinates. Every proof has evidence. No more guessing."*
*Vialuce.ai — Intelligence. Acceleration. Performance.*
