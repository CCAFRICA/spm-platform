# HF-091 Completion Report

## Fixes Applied

### Bug 1: identifierRepeatRatio uses sample size
**Root cause**: `generateContentProfile` used `rows.length` (50 sample rows) instead of `totalRowCount` (201 actual rows).
**Fix**: Added `totalRowCount` parameter to `generateContentProfile()`, used as `totalRowCount || rows.length` for `rowCount`. Updated `analyze/route.ts` to pass `sheet.totalRowCount`.
**Files**: `content-profile.ts:165-171`, `analyze/route.ts:81-88`

### Bug 2: Transaction agent can't compete on Spanish date columns
**Root cause**: Integer columns "Mes" (1-12) and "Año" (2024-2025) aren't date-typed and not in DATE_SIGNALS. Transaction agent gets -0.25 `no_date` penalty.
**Fix**: Period marker detection — if any integer field has min ≥ 2000 & max ≤ 2040 (year) AND any integer field has min ≥ 1 & max ≤ 12 & distinctCount ≤ 12 (month), set `hasPeriodMarkers = true` → `hasDateColumn = true`.
**Files**: `content-profile.ts:252-265`

### Bug 3: Classification override dropdown missing 'reference'
**Root cause**: Hardcoded array `['plan', 'entity', 'target', 'transaction']` excluded reference.
**Fix**: Added 'reference' to dropdown array and added `reference` badge style (cyan). Added `originalClassification` prop + "(was X)" visual indicator when overridden.
**Files**: `SCIProposal.tsx:26,70-74,115-120,261,440-460`

### Bug 4: reference_data key_field can be null
**Root cause**: `keyFieldName = keyBinding?.sourceField || null` when no `entity_identifier` binding exists.
**Fix**: Fallback chain: entity_identifier binding → first confirmed binding field → first row key → 'id'.
**Files**: `execute/route.ts:812-817`

## Proof Gates

| # | Gate | Evidence |
|---|------|----------|
| PG-1 | identifierRepeatRatio uses totalRowCount | `content-profile.ts:171`: `const rowCount = totalRowCount \|\| rows.length` → `rowCount / idField.distinctCount` at line 291 |
| PG-2 | NOT using sample size | `analyze/route.ts:88`: `sheet.totalRowCount` passed as 6th arg |
| PG-3 | `npm run build` exits 0 | Build passes — verified before commit |
| PG-4 | Period markers detect year+month integers | `content-profile.ts:254-262`: year [2000-2040] + month [1-12, ≤12 distinct] |
| PG-5 | hasDateColumn includes hasPeriodMarkers | `content-profile.ts:264`: `hasDateColumn = ... \|\| hasPeriodMarkers` |
| PG-6 | Transaction gets +0.25 has_date signal | `agents.ts:67`: `has_date` weight 0.25, test `p.patterns.hasDateColumn` |
| PG-7 | Transaction avoids -0.25 no_date penalty | `agents.ts:77`: `no_date` weight -0.25, test `!p.patterns.hasDateColumn` — now false |
| PG-8 | Reference in dropdown | `SCIProposal.tsx:268`: `['plan', 'entity', 'target', 'transaction', 'reference']` |
| PG-9 | Reference badge styled | `SCIProposal.tsx:26`: `reference: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'` |
| PG-10 | Override indicator shows "(was X)" | `SCIProposal.tsx:116-120`: renders when `isOverridden` |
| PG-11 | key_field always populated | `execute/route.ts:816`: `keyBinding?.sourceField \|\| firstColumn` — never null |
| PG-12 | Korean Test passes | All detection is structural — no field name matching for date detection |

## PR
https://github.com/CCAFRICA/spm-platform/pull/180
