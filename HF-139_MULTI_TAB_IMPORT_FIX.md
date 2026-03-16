# HF-139: MULTI-TAB IMPORT — CONTENT UNIT INDEPENDENCE
## Single Issue: CLT173-F01/F02/F03 (P0 — Blocks BCL 6-Month Proof)

**Date:** March 16, 2026
**Type:** Hot Fix
**Sequence:** HF-139
**Governing Specification:** DS-013 (Platform Experience Architecture)
**Standing Rules:** CC_STANDING_ARCHITECTURE_RULES.md v3.0 — read in entirety before proceeding.
**Standing Rule 30:** One root cause, one fix, one browser test.

---

## THE PROBLEM

When a user uploads a multi-tab XLSX file (e.g., BCL_Datos_Ene2026.xlsx with 3 tabs: Jan, Feb, Mar data), the import page detects 3 content units and displays 3 cards. However:

1. **Expand/collapse toggles ALL cards simultaneously.** Clicking the expand arrow on Card 1 also expands Cards 2 and 3. The user cannot inspect one card independently.
2. **"Confirm All" does not update the confirmed counter.** After clicking "Confirm all," the counter still reads "1 of 3 confirmed" instead of "3 of 3 confirmed."
3. **Import button remains inactive** despite all cards showing green checkboxes and "Confirm all" having been clicked. The button activation gate checks the `confirmed` counter, not the checkbox visual state.

**Root cause hypothesis:** All three content unit cards share a single state variable for expand/collapse and/or confirmation. The expand toggle and confirm logic operate on the array as a whole instead of per-element.

**This is a P0 blocker.** The user cannot import multi-tab XLSX files. This blocks the BCL 6-month calculation proof ($312,033). January, February, and March data is in a multi-tab file that cannot be imported.

---

## CONTEXT

**Read CC_STANDING_ARCHITECTURE_RULES.md v3.0 in its entirety before proceeding.**

Key rules:
- Standing Rule 2: Scale by Design — domain-agnostic, Korean Test
- Standing Rule 7: Prove, Don't Describe — browser verification required
- Standing Rule 28: Browser-testable acceptance criterion before execution
- Standing Rule 30: One issue per prompt
- Anti-Pattern FP-73: Backend works, frontend broken
- Anti-Pattern FP-77: UI display bug assumed to be data bug — diagnose WHICH LAYER first

---

## PHASE 0: DIAGNOSTIC (MANDATORY — Standing Rule 29)

**Do NOT write any fix code until this diagnostic is complete and committed to git.**

**Mission 0.1:** Find the import page component.
- Locate the file that renders the import review page (the page shown after file upload, before commit)
- This is likely in `/web/src/app/(app)/[tenantSlug]/operate/import/` or similar
- Paste the full file path

**Mission 0.2:** Find the content unit card component.
- Identify the component that renders each "Datos [transaction]" card
- Paste the component's state management code — specifically:
  - How is `expanded` state tracked? Single boolean or per-card array?
  - How is `confirmed` state tracked? Single boolean or per-card array?
  - What does "Confirm all" do? Does it iterate per-card or set a single flag?
  - What gates the Import button? What exact condition makes it active?

**Mission 0.3:** Paste the relevant state code.
- Find the state variables: `useState` or equivalent for expanded, confirmed, and import-button-active
- Paste them verbatim — do not describe, paste

**Proof Gate 0:** Diagnostic committed to git with pasted code. Root cause IDENTIFIED with evidence before proceeding.

---

## PHASE 1: FIX — CONTENT UNIT INDEPENDENCE

Based on Phase 0 diagnostic findings, implement the fix. The fix MUST achieve:

### 1.1 Independent expand/collapse
- Each content unit card has its own expand/collapse state
- Implementation: `expanded` must be an array indexed by content unit index, or a Set, or an object keyed by unit ID
- Clicking expand on Card 0 does NOT affect Card 1 or Card 2
- Do NOT use a single boolean for expand state across all cards

### 1.2 Independent confirmation
- Each content unit has its own `confirmed` state
- "Confirm all" iterates through ALL content units and sets each to confirmed
- The counter text updates: "3 of 3 confirmed" (not "1 of 3 confirmed")
- Individual confirmation (if available) updates the counter incrementally

### 1.3 Import button activation
- The Import button is active (clickable, styled as primary) when ALL content units are confirmed
- Gate condition: `confirmedCount === totalContentUnits` where `confirmedCount` is the actual count of individually confirmed units
- The gate checks actual confirmed state, not visual checkbox appearance

### Korean Test
- No domain-specific labels in the fix
- The fix works for ANY multi-tab file regardless of tab names or content types

---

## PHASE 2: BUILD + VERIFY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must complete with zero errors
4. `npm run dev`
5. Verify on localhost:3000

---

## PHASE 3: COMPLETION REPORT (MANDATORY — NOT OPTIONAL)

**THIS IS NOT OPTIONAL. FP-70 has recurred three consecutive times. Skipping this phase is a build failure.**

```
HF-139 COMPLETION REPORT
=========================
Phase 0 Diagnostic:
  Root cause: [paste exact finding — what state variable, what file, what line]
  
Phase 1 Fix:
  Changed: [paste exact code diff — old state vs new state]
  
Phase 2 Build:
  npm run build output: [paste last 5 lines]
  
Localhost verification:
  [ ] Uploaded multi-tab file with 3 tabs
  [ ] Card 1 expanded independently: [YES/NO]
  [ ] Card 2 expanded independently: [YES/NO]  
  [ ] Card 3 expanded independently: [YES/NO]
  [ ] Clicked "Confirm all" — counter shows "3 of 3 confirmed": [YES/NO]
  [ ] Import button active and clickable: [YES/NO]
  [ ] Clicked Import — rows committed: [paste count]
  
Evidence: [paste screenshot path OR console output OR DOM inspection]
```

**If ANY checkbox is NO, the fix failed. Do not create PR. Report the failure.**

---

## PHASE 4: PR

Final step ONLY after Phase 3 completion report is committed:

```bash
cd /path/to/spm-platform
git add -A
git commit -m "HF-139: Multi-tab import content unit independence"
git push origin dev
gh pr create --base main --head dev --title "HF-139: Multi-tab import content unit independence" --body "Fixes CLT173-F01/F02/F03: expand/collapse independence, Confirm All counter update, Import button activation gate. P0 blocker for BCL 6-month proof."
```

---

## BROWSER TEST (Andrew — after merge)

Upload BCL_Datos_Ene2026.xlsx (3 tabs: Jan, Feb, Mar — 85 rows each = 255 total).

**Expected:**
1. Three content unit cards appear
2. Expand Card 1 — Cards 2 and 3 remain collapsed
3. Expand Card 2 — Card 1 stays expanded, Card 3 stays collapsed
4. Click "Confirm all" — counter reads "3 of 3 confirmed"
5. Import button is active (green, clickable)
6. Click Import — "Import 255 rows" executes, 255 rows committed

**If ANY step fails, the fix failed.**

---

## WHAT THIS HF DOES NOT ADDRESS

- SCI confidence flat at 90% (needs DIAG-004)
- Component breakdown on Calculate page (OB-173 Phase B incomplete)
- Period comparison on Calculate page (OB-173 Phase B incomplete)
- Card differentiation on /stream (OB-173 Phase C incomplete)
- Trajectory reference frame (OB-173 Phase C incomplete)
- /stream sidebar navigation (OB-173 Phase C incomplete)
- Entity-to-user linking (separate OB)

These are tracked and will be addressed in subsequent prompts. This HF fixes ONE thing: multi-tab import.

---

*Standing Rule 30: One issue per prompt. No bundling.*
