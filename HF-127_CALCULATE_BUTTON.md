# HF-127: Calculate Button Must Fire
## The UI blocks the API call that would fix the problem. Remove the gate.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `SCHEMA_REFERENCE_LIVE.md`
3. This prompt in its entirety

---

## CLT REGISTRY CROSS-REFERENCE

| ID | Finding | Status |
|----|---------|--------|
| CLT166-F24 (NEW) | Calculate button is dead click — no API request fires | ❌ OPEN |
| CLT111-F43 | No entity assignments — HF-126 added self-healing to API | 🔄 PARTIALLY — UI blocks trigger |
| CLT122-F77 | No entities assigned to plans | 🔄 PARTIALLY — same |

**Root cause:** HF-126 added self-healing to the calculation API route — when zero assignments exist, the engine creates them and proceeds. But the Calculate button on the UI is disabled or non-functional when entity count is 0. The API is never called. The self-healing never fires.

---

## THE PROBLEM

Patricia Zambrano is on `/operate/calculate`. She sees:
- Plan de Comisiones BCL 2025 — Partial badge
- 0 entities, Bound, 170 rows
- Calculate button visible but clicking it produces no network request

The button is gated on entity count from `rule_set_assignments`. BCL has 0 assignments. The button won't call the API. The API contains the self-healing code that would create assignments. Deadlock.

---

## CC EVASION WARNINGS

1. **CC will add a loading spinner or "creating assignments" step instead of just letting the button fire.** The fix is to remove or relax the gate. The API handles the rest. Don't add UI complexity.

2. **CC will fix the button but break the entity count display.** The "0 entities" display can remain as information — it just must not prevent the Calculate action.

3. **CC will create assignments in a useEffect on page load instead of fixing the button.** Both approaches work, but the button fix is essential regardless — the API should always be callable. A useEffect is acceptable as a SUPPLEMENT, not a replacement.

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "HF-127 PHASE 0: DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: CALCULATE BUTTON — WHAT GATES IT? ==="
grep -n "disabled\|onClick\|handleCalc\|runCalc\|isDisabled\|canCalculate\|entities.*0\|entity.*count" \
  web/src/app/operate/calculate/page.tsx | head -30

echo ""
echo "=== 0B: WHERE DOES ENTITY COUNT COME FROM? ==="
grep -n "rule_set_assignment\|entityCount\|entity_count\|assignments\|0 entities" \
  web/src/app/operate/calculate/page.tsx | head -20

echo ""
echo "=== 0C: WHAT DOES THE CALCULATE BUTTON CALL? ==="
grep -B 5 -A 15 "Calculate\|onClick\|handleRun\|runCalculation" \
  web/src/app/operate/calculate/page.tsx | head -60

echo ""
echo "=== 0D: THE CALCULATION API ROUTE ==="
head -30 web/src/app/api/calculation/run/route.ts

echo ""
echo "=== 0E: HF-126 SELF-HEALING CODE ==="
grep -B 3 -A 20 "self-heal\|auto-create\|HF-126\|zero.*assignment" \
  web/src/app/api/calculation/run/route.ts | head -40
```

**Commit:** `HF-127 Phase 0: Diagnostic — calculate button gate`

---

## PHASE 1: FIX THE CALCULATE BUTTON

**Two changes required:**

### 1A: Remove or relax the entity count gate on the Calculate button

Find the condition that disables the button when entity count is 0. Change it so the button is always clickable when a plan and period are selected. The API handles validation — the UI should not prevent the call.

**If the button is disabled via a `disabled` prop:**
```typescript
// BEFORE (blocks when 0 entities):
disabled={entityCount === 0 || isCalculating}

// AFTER (only blocks during active calculation):
disabled={isCalculating}
```

**If the button's onClick is conditionally set:**
```typescript
// BEFORE:
onClick={entityCount > 0 ? handleCalculate : undefined}

// AFTER:
onClick={handleCalculate}
```

### 1B: Ensure the Calculate button calls the calculation API

Verify the onClick handler actually calls `/api/calculation/run` (or whatever the correct endpoint is). Trace from button click → handler → fetch/axios call → API route. If there's a client-side validation that returns early when entities = 0, remove that check.

**LOCALHOST VERIFICATION:**

After fix, click Calculate on localhost with 0 entity assignments. Check the browser Network tab — a POST to `/api/calculation/run` (or equivalent) MUST appear. Whether it succeeds or fails is Phase 2's concern. The button MUST fire.

**Commit:** `HF-127 Phase 1: Calculate button fires regardless of entity count`

---

## PHASE 2: VERIFY SELF-HEALING + CALCULATION

After Phase 1, clicking Calculate should:
1. Call the calculation API
2. API finds 0 assignments → HF-126 self-healing creates them
3. API proceeds with calculation
4. Results return

**Check Vercel logs (or localhost logs) for:**
- `[SCI Execute] HF-126: Created N rule_set_assignments` or equivalent self-healing log
- Calculation completing with non-zero results

**If calculation succeeds:** Paste the result. BCL October GT: $48,314.

**If calculation fails with a different error:** Document the error. The button firing is still a success — the new error is a separate issue.

**Commit:** `HF-127 Phase 2: Verify calculation fires and self-healing creates assignments`

---

## PHASE 3: COMPLETION REPORT

Create `HF-127_COMPLETION_REPORT.md`:

```markdown
# HF-127 Completion Report — Calculate Button Fix

## Phase 0: Diagnostic
- Button gate condition: [what disabled it]
- Entity count source: [where it reads from]
- onClick handler: [what it calls]

## Phase 1: Button Fixed
- Gate removed/relaxed: [describe change]
- Button now fires: [PASS — network request visible]

## Phase 2: Calculation Result
- Self-healing fired: [YES/NO — paste log]
- Assignments created: [count]
- Calculation result: [total / $0 / error]
- If error: [paste error message]

## CLT Registry Updates
| Finding | Previous | New | Evidence |
|---------|----------|-----|----------|
| CLT166-F24 (button dead) | OPEN | FIXED | Button fires API call |
| CLT111-F43 (no assignments) | PARTIALLY | [FIXED if calc works] | Self-healing + button |

## Build
[Paste last 10 lines of npm run build]
```

**Commit:** `HF-127 Phase 3: Completion report`

---

## PHASE 4: PR

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-127: Calculate Button Must Fire — Remove Entity Count Gate" \
  --body "## The Problem
Calculate button on /operate/calculate is dead when entity count = 0.
HF-126 added self-healing to the API (auto-creates assignments).
But the UI blocks the API call, so self-healing never triggers.

## The Fix
Remove entity count gate on Calculate button. Button fires regardless.
API handles validation and self-healing.

## Evidence
See HF-127_COMPLETION_REPORT.md"
```

---

## REGRESSION — DO NOT BREAK

- Calculate button must still work when entities > 0 (Meridian)
- HF-126 self-healing code in calculation API unchanged
- No changes to SCI execute, entity resolution, or convergence

---

*"The API can heal itself. The button won't let it. Remove the gate."*
