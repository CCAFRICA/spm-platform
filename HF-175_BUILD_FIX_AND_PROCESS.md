# HF-175: Fix OB-186 Build Failure + CC Process Enforcement

## MANDATORY — READ FIRST
Include CC_STANDING_ARCHITECTURE_RULES.md at the top of your working context.

## Classification
- **Type:** HF (Hot Fix)
- **Priority:** P0 — BLOCKING. Production build has been failing since OB-186 merge. No code has deployed since HF-172 (PR #309).
- **Addresses:** TypeScript type error in OB-186 cadence extraction, CC process failures
- **Root Cause:** CC self-attested "Build passes: PASS — exit 0" in both OB-186 and HF-174 completion reports without the build actually passing.

---

## CC FAILURE PATTERNS EXPOSED THIS SESSION

**This section is mandatory reading. These patterns must not recur.**

### FP-108: Declared Existing Functionality "PASS" Without Testing
OB-186 completion report stated: `"Period management UI exists: PASS (Configure > Periods already has create form)"`. CC skipped Phase 1 entirely based on visual inspection. When Andrew tested, period creation failed with a database constraint violation (`status: 'draft'` not in check constraint). CC declared a capability verified without clicking the button.

**Rule:** Never declare a UI capability PASS without executing the action in the browser and observing the result.

### FP-109: Self-Attested Build Pass on Failing Build
OB-186 completion report stated: `"Build passes: PASS — exit 0"`. HF-174 completion report also stated: `"Build passes: PASS — exit 0"`. The Vercel production build log shows the build has been FAILING since OB-186 merged:

```
./src/app/api/import/sci/execute/route.ts:1245:39
Type error: Conversion of type 'AIResponse & { result: PlanInterpretationResult; }' 
to type 'Record<string, unknown>' may be a mistake because neither type sufficiently 
overlaps with the other.
```

This means CC either:
- Did not run `npm run build` at all
- Ran it and ignored the failure
- Ran it on a stale build cache that passed

Two consecutive completion reports claimed passing builds. Production has been broken for two PRs.

**Rule:** The build output (`npm run build` terminal output) must be PASTED into the completion report. "PASS — exit 0" text without pasted evidence is not accepted. This reinforces the existing Evidentiary Gate standing rule.

### FP-110: UX Changes Claimed But Not Delivered
HF-174 was required to make "Create Periods" a prominent button. The completion report did not mention any UX changes to the Create Periods element. Andrew's screenshot confirms it remains an insignificant text link. CC either skipped this requirement or claimed it was already adequate.

**Rule:** UX change requirements must include before/after evidence in the completion report. A screenshot or description of the visual change.

---

## PROBLEM STATEMENT

### The Build Error

File: `web/src/app/api/import/sci/execute/route.ts`, line 1245

```typescript
cadence_config: { period_type: (response as Record<string, unknown>).cadence || 'monthly' } as unknown as Json,
```

TypeScript error: Cannot cast `AIResponse & { result: PlanInterpretationResult }` directly to `Record<string, unknown>` — the types don't overlap sufficiently.

### The Fix

**Option A (Preferred — type-safe):**

Read cadence from the correct typed path. The `response` variable is typed as `AIResponse & { result: PlanInterpretationResult }`. If the AI prompt was updated to return a `cadence` field, it should be in `response.result` or in the response metadata. Find where the AI response actually puts the cadence value and read it from the correct typed property.

```bash
# Find the AIResponse type definition
grep -rn "interface AIResponse\|type AIResponse" web/src/lib/ai/ web/src/types/
# Find the PlanInterpretationResult type
grep -rn "interface PlanInterpretationResult\|type PlanInterpretationResult" web/src/
```

Then access it correctly:
```typescript
// If cadence is on result:
cadence_config: { period_type: response.result.cadence || 'monthly' } as unknown as Json,

// If cadence is on the raw response:
cadence_config: { period_type: (response as unknown as Record<string, unknown>).cadence || 'monthly' } as unknown as Json,
```

**Option B (Quick fix — cast through unknown):**

```typescript
cadence_config: { period_type: (response as unknown as Record<string, unknown>).cadence || 'monthly' } as unknown as Json,
```

This works but is less type-safe. Use Option A if the type can be extended properly.

**ALSO CHECK:** The same pattern may exist in the batched plan save path. Search for ALL `cadence_config` assignments in this file:

```bash
grep -n "cadence_config" web/src/app/api/import/sci/execute/route.ts
```

Fix ALL occurrences, not just line 1245.

---

## ADDITIONAL REQUIRED FIXES

### Fix 2: "Create Periods from Data" Must Be a Visible Button

HF-174 required this and it was not delivered. Find the "Create periods from data" element on the Calculate page.

```bash
grep -rn "Create periods from data\|create.*periods.*from.*data\|createPeriodsFromData" web/src/app/operate/calculate/
```

**Current state:** Plain text link, no button styling, no visual prominence.

**Required state:** A styled button (use the same button component as the "Calculate" buttons on the plan cards) with:
- Clear button styling (not text link)
- Icon (Calendar or Plus)
- Visible on the page without hunting for it
- When clicked, shows what periods will be created before confirming

### Fix 3: Verify HF-174 Period Status Fix Actually Deployed

Since the build has been failing, HF-174's `'draft' → 'open'` fix never deployed to production. After fixing the build error, verify:

```bash
grep -rn "'draft'" web/src/app/configure/periods/ web/src/app/api/periods/ web/src/app/data/import/ web/src/contexts/operate-context.tsx | grep -v node_modules | grep -v ".next"
```

Must return ZERO results for period-related code. If any `'draft'` references remain, fix them.

---

## VERIFICATION

### Mandatory Build Verification

```bash
cd web && rm -rf .next && npm run build 2>&1 | tail -20
```

**PASTE THE LAST 20 LINES OF BUILD OUTPUT INTO THE COMPLETION REPORT.**

If the output does not contain `✓ Compiled successfully` and the build does not exit with code 0, the HF is NOT complete. Do NOT proceed to the completion report.

### Post-Build Checks

1. **No type errors remaining:**
   ```bash
   npm run build 2>&1 | grep "Type error"
   ```
   Must return ZERO results.

2. **No 'draft' in period creation:**
   ```bash
   grep -rn "'draft'" web/src/app/configure/periods/ web/src/app/api/periods/ web/src/app/data/import/ web/src/contexts/ | grep -v node_modules
   ```
   Must return ZERO results in period-related code.

3. **cadence_config assignments are type-safe:**
   ```bash
   grep -n "cadence_config" web/src/app/api/import/sci/execute/route.ts
   ```
   All occurrences must compile without error.

4. **Create Periods button has visual prominence:**
   ```bash
   grep -B 5 -A 10 "Create periods" web/src/app/operate/calculate/page.tsx
   ```
   Must show Button component usage, not plain text or span.

### Browser Verification (Andrew will perform)

1. Navigate to Configure → Periods → create a biweekly period → must succeed
2. Navigate to Calculate page → "Create periods from data" must be a visible button
3. Calculate any plan → must work (build deployed successfully)

---

## COMPLETION REPORT REQUIREMENTS

The completion report MUST include:

1. **PASTED build output** — the last 20 lines of `npm run build` terminal output showing `✓ Compiled successfully` and exit code
2. **Code diff** for the type error fix
3. **Code diff** for the Create Periods button styling change
4. **Grep output** confirming zero 'draft' references in period code
5. **Grep output** confirming all cadence_config assignments compile
6. **Localhost screenshot** of the Calculate page showing the Create Periods button with visual prominence

**If any of items 1-5 are missing, the completion report is REJECTED.**

---

## GIT

```bash
cd /Users/andrew/Projects/spm-platform
git add -A
git commit -m "HF-175: Fix OB-186 build failure + Create Periods UX + process enforcement

- Fix TypeScript type error in cadence_config extraction (line 1245)
- Make Create Periods from Data a prominent styled button on Calculate page
- Verify HF-174 draft→open fix is in place
- FP-108: Never declare UI PASS without browser testing
- FP-109: Build output must be pasted in completion report
- FP-110: UX changes require before/after evidence"

gh pr create --base main --head dev --title "HF-175: Build fix + Create Periods UX" --body "Fixes TypeScript type error from OB-186 that broke production build. Makes Create Periods from Data a prominent button on Calculate page. Build has been failing since OB-186 merge — this restores production deployment."
```
