# HF-180: RECONCILIATION PERIOD FILTER — SELECTED PERIOD ONLY
## Type: HF (Hotfix)
## Date: March 29, 2026
## Single-task focus: Fix the period filter bug + 3 minor experience items in the same file

**AUTONOMY DIRECTIVE: NEVER ask yes/no. NEVER say "shall I". Just act.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. This prompt — read completely before writing any code

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev --title "HF-180: Reconciliation period filter — selected period only" --body "..."`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### Rule 51v2 (Build Verification)
After `git stash`: `npx tsc --noEmit` AND `npx next lint`. Use `git show HEAD:filepath | grep` to verify committed state.

### Rule 44 (Mandatory Localhost Proof for UI Fixes)
This HF changes UI behavior. Before PR creation, you MUST complete Phase 3 (localhost proof).

---

## CONTEXT — WHAT IS BROKEN AND WHY

### The Engine Works
CRP Plan 1 engine matches GT exactly for 24/24 valid entities. Tyler Morrison: VL $10,971.62 = GT $10,971.62.

### The Reconciliation Shows Wrong Results
After HF-179 (header parsing fix) and OB-193 (period filtering), the reconciliation still shows 17.4% match rate with a $35,467 delta. The engine is right. The reconciliation display is wrong.

### Root Cause — TRACED TO SPECIFIC LINE IN page.tsx

In `web/src/app/operate/reconciliation/page.tsx`, the `handleCompare` callback builds `targetPeriods`:

```typescript
// Determine target periods from period matching
const targetPeriods = periodMatch?.matched?.map(m => m.benchmarkPeriod) ?? [];
```

This sends ALL benchmark periods that matched ANY VL period. CRP has two VL periods (Jan 1-15 and Jan 16-31). Both match benchmark periods. Both get sent to the compare API.

The compare API calls `filterRowsByPeriod` with both periods → 48 rows (not 24). The comparison engine's `Map.set()` overwrites Tyler Morrison's Jan 1-15 value ($10,971.62) with his Jan 16-31 value. Result: wrong benchmark values, wrong match rate.

### Evidence Chain

DIAG log from production (March 29, 2026):
```
Period filter: January 1-15, 2026, January 16-31, 2026 → 48 rows (of 97)
CRP-6007: raw="2446.52" → parsed=2446.52, VL=10971.62, delta=-8525.1
```

The user selected "January 1-15, 2026" in the Period dropdown. The filter should have produced ~24 rows for that period only. Instead it produced 48 rows for two periods.

The benchmark total $109,139.46 exactly equals the GT total for Jan 16-31 — confirming the Map overwrote Jan 1-15 values with Jan 16-31 values.

### What the Compare API Does (from code review)

`/api/reconciliation/compare/route.ts` receives `targetPeriods` and passes them directly to `filterRowsByPeriod`. The API trusts the client to send the correct periods. The bug is entirely in the client — the page sends too many periods.

### What `runComparison` Does (from code review)

```typescript
const fileByEmployee = new Map<string, Record<string, unknown>>();
for (const row of fileRows) {
    const empId = normalizeId(String(row[entityIdField] ?? ''));
    if (empId) {
        fileByEmployee.set(empId, row); // OVERWRITES previous row for same entity
    }
}
```

When 48 rows arrive with 24 entities × 2 periods, each entity appears twice. Map.set keeps the LAST row. With correct single-period filtering (24 rows, one per entity), this overwrite cannot happen.

---

## PHASE 1: FIX THE PERIOD FILTER (Critical Bug)

**File:** `web/src/app/operate/reconciliation/page.tsx`

### Step 0: Diagnostic — Confirm the Bug Location

```bash
echo "=== CONFIRM THE BUG LINE ==="
grep -n "targetPeriods" web/src/app/operate/reconciliation/page.tsx
```

You should see a line like:
```
const targetPeriods = periodMatch?.matched?.map(m => m.benchmarkPeriod) ?? [];
```

This is the line to fix.

### Step 1: Understand What's Available

The selected batch is available as `selectedBatch` (a `BatchOption`). It has:
- `selectedBatch.id` — the batch UUID
- `selectedBatch.label` — e.g. `"January 1-15, 2026 — PREVIEW ($73,672.40)"`
- `selectedBatch.ruleSetId` — the plan UUID

The `periodMatch` has:
- `periodMatch.matched[]` — each has `{ benchmarkPeriod: PeriodValue, vlPeriod: { id, label } }`
- The `vlPeriod.label` is the VL period name like `"January 1-15, 2026"`

The `selectedBatch.label` STARTS WITH the period label (e.g., `"January 1-15, 2026 — PREVIEW ($73,672.40)"` starts with `"January 1-15, 2026"`).

### Step 2: Fix — Filter targetPeriods to Selected Period Only

Replace:
```typescript
const targetPeriods = periodMatch?.matched?.map(m => m.benchmarkPeriod) ?? [];
```

With:
```typescript
// HF-180: Send ONLY the period matching the selected batch, not all matched periods.
// Bug: previously sent ALL matched periods → 48 rows for 2 periods → Map.set() overwrote
// entity values with wrong period's data. Fix: filter to the selected batch's period.
const allMatchedPeriods = periodMatch?.matched ?? [];
const selectedPeriodLabel = selectedBatch?.label ?? '';
const targetPeriods = allMatchedPeriods
  .filter(m => selectedPeriodLabel.startsWith(m.vlPeriod.label))
  .map(m => m.benchmarkPeriod);

// Fallback: if no match found (e.g., label format changed), send all matched periods
// rather than sending nothing — preserves existing behavior as safety net
if (targetPeriods.length === 0 && allMatchedPeriods.length > 0) {
  console.warn('[Reconciliation] HF-180: Could not match selected batch label to a VL period. Falling back to all matched periods.');
  targetPeriods.push(...allMatchedPeriods.map(m => m.benchmarkPeriod));
}

console.log(`[Reconciliation] HF-180: Selected period: "${selectedPeriodLabel}", target periods: ${targetPeriods.length}`, targetPeriods.map(tp => tp.label));
```

**IMPORTANT:** The `targetPeriods` declaration changes from `const` to `const` with a conditional push. If TypeScript complains about pushing to a `const` array — `const` arrays allow `.push()`, this is fine. If the original was declared as `const targetPeriods: PeriodValue[] = ...` with a readonly type, adjust accordingly.

### Step 3: Verify the Fix is Correct

After making this change:
```bash
echo "=== VERIFY FIX ==="
git show HEAD:web/src/app/operate/reconciliation/page.tsx | grep -A 10 "HF-180"
```

Paste the output.

**Commit after Phase 1.** Message: `"HF-180 Phase 1: Filter targetPeriods to selected batch period only"`

---

## PHASE 2: MINOR EXPERIENCE IMPROVEMENTS (Same File)

**File:** `web/src/app/operate/reconciliation/page.tsx`

All three items below are in the same file and are 1-5 line changes each.

### Item A: VL-Only Population Panel — Show Entity Names

Find the VL-only population panel near the bottom of the results section. It currently shows:

```tsx
{compResult.employees.filter(e => e.population === 'vl_only').slice(0, 20).map((e, i) => (
  <p key={i} className="font-mono">{e.entityId}</p>
))}
```

The `entityName` field is already populated on VL-only employees (the compare API sets it from the entity table). Change to show both:

```tsx
{compResult.employees.filter(e => e.population === 'vl_only').slice(0, 20).map((e, i) => (
  <p key={i}><span className="font-mono">{e.entityId}</span>{e.entityName && <span className="text-zinc-500 ml-2">{e.entityName}</span>}</p>
))}
```

Do the same for the file-only panel if it has entity names (it may not — file-only entities don't have VL data to pull names from, so this change may only be useful for VL-only).

### Item B: Batch Reference Frame — Show Period Label Instead of UUID

Find the reference frame bar near the top of the results section:

```tsx
<span>{isSpanish ? 'Lote' : 'Batch'}: <span className="text-zinc-200 font-mono">{selectedBatch.id.slice(0, 8)}</span></span>
```

The batch UUID prefix is meaningless to the user. Replace with the plan name and period:

```tsx
<span className="text-zinc-200">{planOptions.find(p => p.id === selectedPlanId)?.name ?? 'Plan'}</span>
```

Keep the other elements (entity count, total payout, file name) as-is — they provide useful context.

### Item C: Period Discovery Diagnostic — Log Distinct Periods

This is diagnostic-only, not UI. Add a console.log in the `handleAnalyze` callback after the analysis response is received, to help trace Bug 3 (phantom periods):

```typescript
// HF-180: Diagnostic — log discovered periods to trace phantom period bug
if (data.analysis?.periodDiscovery?.distinctPeriods) {
  console.log('[Reconciliation][DIAG] Discovered periods:', JSON.stringify(data.analysis.periodDiscovery.distinctPeriods.map((p: PeriodValue) => ({ label: p.label, month: p.month, year: p.year, startDay: p.startDay, endDay: p.endDay }))));
  console.log('[Reconciliation][DIAG] Rows per period:', JSON.stringify(data.analysis.periodDiscovery.rowsPerPeriod));
}
```

This doesn't fix Bug 3 but gives us the evidence to diagnose it in the next session.

**Commit after Phase 2.** Message: `"HF-180 Phase 2: VL-only names, batch reference frame, period discovery diagnostic"`

---

## PHASE 3: LOCALHOST VERIFICATION (MANDATORY — Rule 44)

### Step 1: Navigate and Upload

1. Navigate to `localhost:3000/operate/reconciliation`
2. Log in as VL Admin to CRP tenant
3. Select "Capital Equipment Commission Plan"
4. Select the period dropdown — choose the January 1-15, 2026 period
5. Upload `CRP_Resultados_Esperados.xlsx`
6. Click "Analyze Benchmark File"
7. Click "Run Reconciliation"

### Step 2: Check Console Output

Paste the FULL console output. You MUST see:

1. `[Reconciliation] HF-180: Selected period: "January 1-15, 2026...", target periods: 1`
   — If it says `target periods: 2` or more, THE FIX DID NOT WORK.

2. `[Reconciliation] Period filter: January 1-15, 2026 → XX rows (of 97)`
   — XX should be approximately 24 (one row per entity for that period). NOT 48, NOT 96.

3. `[Reconciliation] CRP-6007: raw="10971.62"`
   — Tyler Morrison's benchmark value must be 10971.62, NOT 2446.52, NOT 4382.6.

### Step 3: Check UI

1. **Match rate** — should be substantially higher than 17.4%. For 24 entities where the engine matches GT exactly, expect near 100% for the matched population.
2. **Benchmark total** — should be close to $73,142.72 (GT for 24 entities in Jan 1-15), NOT $109,139.46 (Jan 16-31), NOT $84,201.24 (mixed).
3. **Tyler Morrison row** — VL: $10,971.62, Benchmark: $10,971.62, Delta: $0.00 (or very close).
4. **VL-only panel** — should show entity IDs AND names (e.g., "CRP-6001 Sarah Chen").
5. **Reference frame bar** — should show plan name, not batch UUID prefix.
6. **Period filter banner** — should mention only "January 1-15, 2026", not two periods.

### Step 4: Paste Evidence

Paste ALL of the above into the completion report. This is the proof gate.

**Commit after Phase 3.** Message: `"HF-180 Phase 3: Localhost verification evidence"`

---

## WHAT NOT TO DO

1. **Do NOT change the compare API** (`/api/reconciliation/compare/route.ts`). The API is correct — it filters by whatever periods the client sends. The bug is in the client.
2. **Do NOT change `benchmark-intelligence.ts`**. OB-193's changes to `resolvePeriodValue`, `matchPeriods`, and `filterRowsByPeriod` are working correctly — they correctly identified both periods and correctly filtered to both. The problem is that the page ASKED for both.
3. **Do NOT change `runComparison` or `runEnhancedComparison`**. The Map.set() overwrite is a latent concern but fixing it is NOT in scope for this HF. With correct single-period filtering, each entity appears once, and the overwrite cannot happen.
4. **Do NOT add any detect-then-reparse patterns** (Rule 45).
5. **Do NOT bundle additional work beyond the 3 items in Phase 2.** Rule 46 — single-task focus.

---

## PROOF GATES — HARD (must ALL pass)

| # | Gate | Evidence Required |
|---|------|-------------------|
| H1 | Console shows `target periods: 1` (not 2+) | Paste the HF-180 console log line |
| H2 | Period filter produces ~24 rows for CRP Jan 1-15 | Paste the DIAG period filter line |
| H3 | Tyler Morrison benchmark = $10,971.62 | Paste the CRP-6007 sample values line OR describe the UI row |
| H4 | Match rate higher than 17.4% | Paste or describe the match rate from results |
| H5 | VL-only panel shows entity names alongside IDs | Describe what the VL-only section shows |
| H6 | Reference frame bar shows plan name, not UUID | Describe the reference bar content |
| H7 | Rule 51v2: `npx tsc --noEmit` = 0, `npx next lint` = 0 after `git stash` | Paste output |

## PROOF GATES — SOFT (should pass, document if not)

| # | Gate | Evidence Required |
|---|------|-------------------|
| S1 | Benchmark total close to $73,142.72 | Paste benchmark total from results |
| S2 | Period filter banner mentions only one period | Paste the banner text |
| S3 | Period discovery diagnostic log shows discovered periods | Paste the DIAG discovered periods log |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-180_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## FINAL STEP

```bash
gh pr create --base main --head dev \
  --title "HF-180: Reconciliation period filter — selected period only" \
  --body "Critical fix: page.tsx sent ALL matched periods to compare API instead of only the user-selected period.

Root cause: handleCompare built targetPeriods from periodMatch.matched (all matched periods). CRP has two VL periods (Jan 1-15, Jan 16-31), both matched benchmark periods, so 48 rows were sent. The comparison engine Map.set() overwrote Jan 1-15 values with Jan 16-31 values, producing wrong benchmarks and 17.4% match rate for an engine that matches GT exactly.

Fix: Filter targetPeriods to only the benchmark period whose VL period label matches the selected batch label. One period → ~24 rows → one row per entity → correct benchmarks → accurate match rate.

Also: VL-only panel shows entity names, batch reference frame shows plan name instead of UUID, period discovery diagnostic logging.

Evidence: Tyler Morrison benchmark $10,971.62 = GT. Match rate reflects actual engine accuracy.

Proof tenant: CRP (e44bbcb1-2710-4880-8c7d-a1bd902720b7)
Ground truth: CRP_Resultados_Esperados.xlsx"
```

---

## WHY THIS WILL WORK

This is not a hypothesis. The root cause was traced through three layers of actual code:

1. **page.tsx line:** `periodMatch?.matched?.map(m => m.benchmarkPeriod)` — sends all matched periods
2. **compare route:** `filterRowsByPeriod(fileRows, periodColumns, targetPeriods)` — faithfully filters to whatever periods it receives
3. **comparison engine:** `fileByEmployee.set(empId, row)` — overwrites duplicate entities

The fix changes exactly one variable construction in step 1. Steps 2 and 3 are correct and untouched. The DIAG logs from production confirm the data flow. The GT values confirm the overwrite behavior. There is no ambiguity about what's happening or why.

---

*"The engine matched GT exactly for every valid entity. The reconciliation that would prove it to the user has failed because we asked it to compare against two periods instead of one."*
