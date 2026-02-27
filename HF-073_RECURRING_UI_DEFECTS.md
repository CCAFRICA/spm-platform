# HF-073: RECURRING UI DEFECTS — PILL COLOR, CONFIDENCE DISPLAY, DATE PARSING
## Three issues raised across 3+ CLTs, never fixed

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `PERSISTENT_DEFECT_REGISTRY.md` — verify in-scope items
3. `VIALUCE_CLT_FINDINGS_REGISTRY.md` — cross-CLT patterns section

---

## WHY THIS HF EXISTS

Three UI defects have been raised in 3+ CLT sessions and never addressed. They're not architecturally complex — they're CSS values, string formatting, and date parsing. But they keep appearing in every CLT because no intervention has targeted them.

**Cross-CLT pattern: Fluorescent green pill unreadable**
- CLT72-F40, CLT84-F40, CLT102-F30
- Raised 3 times. Zero fixes. Undermines credibility of confidence display.

**Cross-CLT pattern: Hardcoded confidence scores**
- CLT72-F41, CLT84-F40, CLT102-F29, CLT102-F43
- "50% confidence" and "74% Data Quality" appear across all file types. Not computed.
- NOTE: OB-107 Phase 6 addresses the computation. This HF fixes the DISPLAY issues that are independent of computation: "% confidence" as literal text (CLT102-F47), and the pill badge rendering.

**Excel serial dates in Data Preview**
- CLT102-F35, CLT102-F36
- SnapshotDate showing 45350.666 instead of a human-readable date. SheetJS date conversion not applied in preview render.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Commit this prompt to git as first action.
5. **DO NOT MODIFY ANY AUTH FILE.**
6. **MINIMAL CHANGES.** This is a cosmetic HF. Do not refactor components.

---

## PHASE 0: FIND THE COMPONENTS

```bash
echo "============================================"
echo "HF-073 PHASE 0: UI DEFECT DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: FLUORESCENT GREEN PILL / BADGE COMPONENT ==="
echo "--- Find the confidence badge / pill component ---"
grep -rn "confidence\|pill\|badge\|chip" web/src/app/operate/import/ --include="*.tsx" | head -20
grep -rn "bg-green\|bg-emerald\|#00ff\|#0f0\|lime\|green-400\|green-500" \
  web/src/app/operate/import/ --include="*.tsx" | head -15
echo "--- Find shared badge/pill component if it exists ---"
grep -rn "Badge\|Pill\|Chip\|ConfidenceBadge\|StatusBadge" \
  web/src/components/ --include="*.tsx" -l | head -10

echo ""
echo "=== 0B: CONFIDENCE DISPLAY — '% confidence' LITERAL TEXT ==="
grep -rn '% confidence\|confidence.*%\|{confidence}\|confidence.*display' \
  web/src/app/operate/import/ --include="*.tsx" | head -15
grep -rn "Matched Component\|matched.*component" \
  web/src/app/operate/import/ --include="*.tsx" | head -10

echo ""
echo "=== 0C: QUALITY SCORE DISPLAY — 74% HARDCODED? ==="
grep -rn "74\|0\.74\|quality.*score\|dataQuality\|overallQuality" \
  web/src/app/operate/import/ --include="*.tsx" | head -15

echo ""
echo "=== 0D: DATA PREVIEW — DATE RENDERING ==="
grep -rn "preview\|Preview\|DataPreview\|row.*preview\|sample.*row" \
  web/src/app/operate/import/ --include="*.tsx" | head -15
echo "--- How are cell values rendered? ---"
grep -rn "formatCell\|formatValue\|renderCell\|cellValue\|display.*value" \
  web/src/app/operate/import/ --include="*.tsx" | head -15
echo "--- Any date formatting? ---"
grep -rn "toLocaleDateString\|formatDate\|dateFormat\|isDate\|serial.*date\|excelDate" \
  web/src/app/operate/import/ web/src/lib/ --include="*.tsx" --include="*.ts" | head -10
```

**Paste ALL output before proceeding.**

---

## PHASE 1: FIX FLUORESCENT GREEN PILL

From Phase 0A, find the CSS class or inline style that produces the fluorescent green.

**Change to:** A muted, readable green that works on the dark background. Use the existing design system palette:

```
WRONG:  bg-green-400, bg-lime-400, #00ff00, rgb(0,255,0) — too bright, low contrast
RIGHT:  bg-emerald-600/80, bg-green-700/90, text-emerald-200 — muted, readable
```

**The badge should show:**
- High confidence (≥85%): Green background with white text → `bg-emerald-700 text-emerald-100`
- Medium confidence (60-84%): Amber background → `bg-amber-700 text-amber-100`
- Low confidence (<60%): Red/review background → `bg-red-800 text-red-200`
- Unresolved: Neutral → `bg-zinc-700 text-zinc-300` with label "Will be preserved" (not "Unresolved")

Apply consistently across ALL pill/badge instances in the import flow.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-073 Phase 1: Fix fluorescent pill — muted readable colors" && git push origin dev`

---

## PHASE 2: FIX CONFIDENCE DISPLAY

### 2A: Fix "% confidence" Literal Text (CLT102-F47)

From Phase 0B, find where the "Matched Component" confidence is rendered. The display shows:
```
Matched Component: mortgage_origination_bonus
% confidence
```

The `% confidence` is a template literal where the confidence VALUE is missing or undefined. Fix:

```typescript
// WRONG: `${confidence} confidence` where confidence is undefined or "%"
// RIGHT: `${Math.round((confidence || 0) * 100)}% confidence`
// OR if confidence is already 0-100: `${Math.round(confidence || 0)}% confidence`
```

### 2B: Fix Pill Label Format

Each confidence pill should show: `AI ✓ 85%` or `Review 75%` — never `AI ✓ 0%` for a correct mapping (CLT-102 showed BranchName → Branch Name at "AI ✓ 0%" despite being correct).

If confidence is 0 or undefined but the mapping exists, display `AI suggested` (no percentage) rather than `AI ✓ 0%`.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-073 Phase 2: Fix confidence display — no literal text, no 0% on valid mappings" && git push origin dev`

---

## PHASE 3: FIX EXCEL SERIAL DATES IN DATA PREVIEW

From Phase 0D, find how cell values are rendered in the Data Preview component.

Excel serial dates (e.g., 45350.666) need to be detected and converted to human-readable dates.

```typescript
// Detect and convert Excel serial dates
function formatCellValue(value: any, columnName: string): string {
  if (value === null || value === undefined) return '';
  
  // Excel serial date detection:
  // - Numeric value between 1 and 2958465 (year 1900 to 9999)
  // - Column name contains date-related words
  const isLikelyDate = typeof value === 'number' 
    && value > 25569  // Jan 1, 1970 in Excel serial
    && value < 73051  // Dec 31, 2099 in Excel serial
    && /date|fecha|period|snapshot|time|hired|start|end/i.test(columnName);
  
  if (isLikelyDate) {
    // Convert Excel serial to JS Date
    // Excel epoch is Jan 1, 1900. JS epoch is Jan 1, 1970.
    // Difference: 25569 days. Excel has a leap year bug for 1900.
    const jsDate = new Date((value - 25569) * 86400000);
    return jsDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  
  // Currency detection: large numbers with column name suggesting money
  if (typeof value === 'number' && /amount|balance|total|revenue|salary|pago|monto/i.test(columnName)) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value);
  }
  
  return String(value);
}
```

Apply this formatting function to the Data Preview cell rendering. It should be a DISPLAY-ONLY transformation — the underlying data is unchanged.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-073 Phase 3: Fix Excel serial dates in Data Preview" && git push origin dev`

---

## PHASE 4: BUILD AND VERIFY

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -20
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

---

## PHASE 5: COMPLETION

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Pill badges readable on dark background | No fluorescent green anywhere in import flow |
| PG-02 | Confidence display shows numeric values | No "% confidence" literal text, no "AI ✓ 0%" on valid mappings |
| PG-03 | Excel serial dates render as dates | 45350.666 → "Feb 15, 2024" (or similar) in Data Preview |
| PG-04 | npm run build exits 0 | Clean build |
| PG-05 | localhost:3000 responds | HTTP 200 or 307 |
| PG-06 | No auth files modified | git diff confirms |
| PG-07 | Changes limited to import UI components | No calculation engine, no auth, no financial module |

### CLT Findings Addressed

| Finding | Description | Status |
|---------|-------------|--------|
| CLT72-F40, CLT84-F40, CLT102-F30 | Fluorescent green pill unreadable | FIXED |
| CLT102-F47 | "% confidence" literal text | FIXED |
| CLT102-F35 | SnapshotDate as Excel serial number | FIXED |
| CLT102-F36 | SnapshotPeriod as Excel serial number | FIXED |

### PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-073: Recurring UI defects — pill color, confidence display, date parsing" \
  --body "## Three defects raised in 3+ CLTs, never fixed

### 1. Fluorescent Green Pill (CLT72-F40, CLT84-F40, CLT102-F30)
Confidence badges now use muted colors readable on dark background.
High=emerald, Medium=amber, Low=red, Unresolved=zinc.

### 2. Confidence Display (CLT102-F47)
- '% confidence' literal text → actual numeric percentage
- 'AI ✓ 0%' on valid mappings → 'AI suggested'

### 3. Excel Serial Dates (CLT102-F35/F36)
Data Preview now detects Excel serial numbers in date columns
and renders them as human-readable dates.

## No auth files modified. No calculation engine changes. Import UI only."
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-073 Complete: Recurring UI defects — pill, confidence, dates" && git push origin dev`

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*HF-073: "If it's been raised three times and never fixed, fix it."*
