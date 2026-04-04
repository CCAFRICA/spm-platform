# HF-178: Commit, Verify, and Reconciliation Diagnostic

## CONTEXT
OB-189 completion report states "changes staged but not yet committed." This violates Rule 51v2 — all verification must target committed code (FP-113: CC verified working directory, not what was committed and pushed). The tsc/lint evidence in the completion report ran against the working directory, not committed code.

Additionally, OB-189 Proof Gate #6 (reconciliation benchmark values) was marked "DIAGNOSTIC" not PASS. The `parseNumericValue()` fix addresses currency string parsing, but GT file analysis reveals the CRP benchmark values are **native numbers** (float/int), NOT currency strings. This means the currency parsing fix may be solving the wrong problem. The actual root cause is more likely a column name mismatch or SheetJS row key issue.

This HF commits the staged changes, verifies them against committed code per Rule 51v2, and adds targeted diagnostics to determine whether reconciliation benchmark extraction is actually working.

## CC_STANDING_ARCHITECTURE_RULES
All rules from CC_STANDING_ARCHITECTURE_RULES.md v3.0 apply. Key rules for this HF:

- **Rule 51v2:** Build verification = `rm -rf .next` → `git stash` → `npx tsc --noEmit` → `npx next lint` → `git stash pop`. Both must show 0 errors on COMMITTED code.
- **Rule 51 Amendment:** All file-level verification must target COMMITTED code, not working directory. `git show HEAD:filepath | grep` instead of `grep filepath`.
- **FP-113 Prevention:** Never verify against working directory. `git stash` before tsc/lint.
- **Standing Rule 34:** No bypass recommendations. Diagnose and fix structurally.

## SCOPE — THREE PHASES ONLY

### Phase 1: Commit and Push (CRITICAL — DO THIS FIRST)

1. Stage all changes if not already staged:
   ```bash
   cd /home/project/spm-platform
   git add -A
   ```

2. Commit with descriptive message:
   ```bash
   git commit -m "OB-189: State refresh after period creation, cadence filtering, reconciliation parseNumericValue, NaN guards, structured logging"
   ```

3. Push to dev:
   ```bash
   git push origin dev
   ```

### Phase 2: Rule 51v2 Verification Against COMMITTED Code

After commit and push, verify the committed code (not working directory):

1. **Verify parseNumericValue is in committed code:**
   ```bash
   git show HEAD:web/src/lib/reconciliation/comparison-engine.ts | grep -A 15 "parseNumericValue"
   ```
   Paste the FULL output.

2. **Verify cadenceFilteredPlans is in committed code:**
   ```bash
   git show HEAD:web/src/app/operate/calculate/page.tsx | grep -A 5 "cadenceFilteredPlans"
   ```
   Paste the FULL output.

3. **Verify refreshPeriods await is in committed code:**
   ```bash
   git show HEAD:web/src/app/operate/calculate/page.tsx | grep "await refreshPeriods"
   ```
   Paste the FULL output.

4. **Verify reconciliation logging is in committed code:**
   ```bash
   git show HEAD:web/src/app/api/reconciliation/compare/route.ts | grep "\[Reconciliation\]" | head -5
   ```
   Paste the FULL output.

5. **Run Rule 51v2 build verification on committed code:**
   ```bash
   cd web
   rm -rf .next
   git stash
   npx tsc --noEmit 2>&1 | tail -5
   echo "TSC EXIT: $?"
   npx next lint 2>&1 | tail -5
   echo "LINT EXIT: $?"
   git stash pop
   ```
   Both must show 0 errors. Paste FULL output.

### Phase 3: Reconciliation Diagnostic Enhancement

**IMPORTANT CONTEXT:** Analysis of the CRP ground truth file (`CRP_Resultados_Esperados.xlsx`) reveals:

- The file has **multiple sheets** (Plan 1, Plan 2, Plan 3, Plan 4, Clawback, Summary, Roster, Capabilities Tested)
- Plan 1 data headers are on **row 5** (rows 1-4 are title/description text): `Entity ID | Name | Role | District | Period | Equipment Revenue | Slope (m) | Intercept (b) | Commission (y=mx+b)`
- The "Commission (y=mx+b)" column contains **native float/int values** (e.g., `10971.62`, `3890.88`, `2171`), NOT currency-formatted strings
- SheetJS `sheet_to_json()` with default settings may produce the header row from row 1 (the title), not row 5 (the actual column headers)
- The `totalPayoutColumn.sourceColumn` from AI analysis may not match the actual key in the SheetJS row object if headers are misaligned

**The `parseNumericValue()` fix is necessary but may not address the root cause.** If SheetJS uses row 1 as headers, all subsequent rows will have wrong keys. If the AI identifies `Commission (y=mx+b)` as the total column but the SheetJS key is something else, `fileRow[totalAmountField]` returns `undefined → 0`.

**Add the following diagnostics to `comparison-engine.ts`** inside the `runComparison` function, immediately after building the `fileByEmployee` map:

```typescript
// === DIAGNOSTIC: Trace benchmark value extraction ===
if (fileRows.length > 0) {
  const sampleRow = fileRows[0];
  const allKeys = Object.keys(sampleRow);
  console.log('[Reconciliation][DIAG] File row keys:', JSON.stringify(allKeys));
  console.log('[Reconciliation][DIAG] totalAmountField:', JSON.stringify(totalAmountField));
  console.log('[Reconciliation][DIAG] Key match exists:', allKeys.includes(totalAmountField));
  
  // Show raw value for first row
  const rawValue = sampleRow[totalAmountField];
  console.log('[Reconciliation][DIAG] First row raw value:', JSON.stringify(rawValue), 'type:', typeof rawValue);
  
  // Show all values from first row for inspection
  console.log('[Reconciliation][DIAG] First row all values:', JSON.stringify(sampleRow));
  
  // Check if totalAmountField has whitespace or encoding differences
  for (const key of allKeys) {
    if (key.toLowerCase().includes('commission') || key.toLowerCase().includes('total') || key.toLowerCase().includes('payout') || key.toLowerCase().includes('incentive')) {
      console.log(`[Reconciliation][DIAG] Candidate key: "${key}" (length=${key.length}), value=${JSON.stringify(sampleRow[key])}`);
    }
  }
}
// === END DIAGNOSTIC ===
```

This diagnostic will reveal in Vercel Runtime Logs:
1. What keys SheetJS actually produced for the file rows
2. Whether `totalAmountField` matches any key
3. The raw value and type of the first row's total field
4. All candidate columns that might contain the payout value

### Phase 3 also — Add diagnostic to the compare route

In `web/src/app/api/reconciliation/compare/route.ts`, add BEFORE the call to `runComparison` or `runEnhancedComparison`:

```typescript
// === DIAGNOSTIC: What the compare route sends to the engine ===
console.log('[Reconciliation][DIAG] totalAmountField passed to engine:', JSON.stringify(totalAmountField));
console.log('[Reconciliation][DIAG] fileRows count:', fileRows.length);
if (fileRows.length > 0) {
  console.log('[Reconciliation][DIAG] fileRows[0] keys:', JSON.stringify(Object.keys(fileRows[0])));
  console.log('[Reconciliation][DIAG] fileRows[0] full:', JSON.stringify(fileRows[0]));
}
// === END DIAGNOSTIC ===
```

After adding the diagnostics, commit again:
```bash
cd /home/project/spm-platform
git add -A
git commit -m "HF-178: Reconciliation extraction diagnostics for Vercel Runtime Logs"
git push origin dev
```

## DO NOT

- Do NOT change any logic in this HF. The diagnostics are log-only.
- Do NOT change the `parseNumericValue()` function from OB-189. It's correct — it just may not be the root cause fix.
- Do NOT modify any other files beyond the ones specified.
- Do NOT create new files.
- Do NOT skip the `git stash` step in Rule 51v2 verification.

## PROOF GATES

| # | Gate | PASS Criteria |
|---|------|---------------|
| 1 | Changes committed | `git log --oneline -2` shows both commits. Paste output. |
| 2 | Changes pushed | `git push` output shows `dev -> dev`. Paste output. |
| 3 | parseNumericValue in committed code | `git show HEAD:web/src/lib/reconciliation/comparison-engine.ts \| grep parseNumericValue` shows function. Paste output. |
| 4 | cadenceFilteredPlans in committed code | `git show HEAD:...page.tsx \| grep cadenceFilteredPlans` shows memo. Paste output. |
| 5 | Reconciliation diagnostics in committed code | `git show HEAD:web/src/lib/reconciliation/comparison-engine.ts \| grep "DIAG"` shows diagnostic lines. Paste output. |
| 6 | Rule 51v2 PASS on committed code | tsc 0 errors + lint 0 errors AFTER `git stash`. Paste full output. |
| 7 | No orphaned code | `npx next lint` 0 errors (during Rule 51v2 step). |
| 8 | PR created | `gh pr create --base main --head dev --title "HF-178: OB-189 commit + reconciliation diagnostics" --body "Commits OB-189 staged changes. Adds reconciliation extraction diagnostics for Vercel Runtime Logs. Rule 51v2 verified."` Paste PR URL. |

## COMPLETION REPORT TEMPLATE

```
# HF-178 COMPLETION REPORT

## COMMITS
[paste `git log --oneline -3` output]

## PHASE 1: COMMIT AND PUSH
[paste git commit + push output]

## PHASE 2: RULE 51v2 VERIFICATION
### parseNumericValue in committed code:
[paste git show HEAD: grep output]

### cadenceFilteredPlans in committed code:
[paste git show HEAD: grep output]

### refreshPeriods await in committed code:
[paste git show HEAD: grep output]

### Reconciliation logging in committed code:
[paste git show HEAD: grep output]

### Build verification (on committed code after git stash):
[paste tsc + lint output with exit codes]

## PHASE 3: RECONCILIATION DIAGNOSTICS
### Diagnostic code added to comparison-engine.ts:
[paste git show HEAD: grep DIAG output]

### Diagnostic code added to compare route:
[paste git show HEAD: grep DIAG output]

## PR
[paste PR URL]

## PROOF GATES
[PASS/FAIL for each of the 8 gates with evidence]
```

## FINAL STEP
```bash
gh pr create --base main --head dev --title "HF-178: OB-189 commit + reconciliation diagnostics" --body "Commits OB-189 staged changes. Adds reconciliation extraction diagnostics for Vercel Runtime Logs. Rule 51v2 verified."
```
