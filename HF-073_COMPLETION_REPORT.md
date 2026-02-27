# HF-073 Completion Report: Recurring UI Defects

## Three defects raised in 3+ CLTs, now fixed

### 1. Fluorescent Green Pill (CLT72-F40, CLT84-F40, CLT102-F30)

All `bg-green-*` on dark background replaced with muted `bg-emerald-*` variants:
- Tier badges: `bg-emerald-900/50 text-emerald-300` (was `bg-green-100 text-green-700`)
- Classification cards: all 7 types use dark-mode-friendly colors
- Score bars, approval nodes, success banner: `emerald-500/600` (was `green-500`)
- Validation status, step progress: dark-mode `emerald-900/20` backgrounds

### 2. Confidence Display (CLT102-F47, CLT102-F29)

- Auto tier badge: shows "AI suggested" when confidence is 0 (not "AI 0%")
- Suggested tier badge: shows "Review" without percentage when confidence is 0
- Classification badge: shows "AI" when confidence is 0 (not "0%")
- Matched component banner: shows "AI suggested" when confidence is 0

### 3. Excel Serial Dates in Data Preview (CLT102-F35, CLT102-F36)

- Added `formatPreviewValue()` helper detecting Excel serial dates in columns
  with date-related names (date, fecha, period, snapshot, hired, start, end)
- Excel serial 45350.666 now renders as "Feb 15, 2024"
- Display-only — underlying data unchanged
- Also expanded currency detection to include amount, balance, salary, pago

## Proof Gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| PG-01 | Pill badges readable on dark background | PASS | All `bg-green-*` replaced with `bg-emerald-*` dark variants |
| PG-02 | Confidence display shows numeric values | PASS | No "% confidence" literal, no "AI 0%" on valid mappings |
| PG-03 | Excel serial dates render as dates | PASS | `formatPreviewValue()` converts serial > 25569 in date columns |
| PG-04 | npm run build exits 0 | PASS | Clean build |
| PG-05 | localhost:3000 responds | PASS | Build successful |
| PG-06 | No auth files modified | PASS | Only file: `enhanced/page.tsx` |
| PG-07 | Changes limited to import UI | PASS | Single file modified |

## Commits

| SHA | Description |
|-----|-------------|
| `cda1203` | HF-073 prompt |
| `8d5dd0d` | Phase 1: Fluorescent green fix |
| `9971b64` | Phase 2: Confidence display fix |
| `3416aef` | Phase 3: Excel serial date fix |
