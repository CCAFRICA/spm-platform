# OB-107 Phase 1: Architecture Decision Record

## ROOT CAUSE 1: Classification Propagation

**Problem**: File type classification (roster vs transaction) doesn't influence period detection or validation context. Roster HireDates create erroneous periods.

**Fix approach**: Add classification-aware guards at two points:

### 1A. Client-side period detection (`period-detector.ts`)
- Add optional `classification` field to `SheetInput` interface
- In `detectPeriods()`, skip sheets where `classification === 'roster'` or `'unrelated'`
- Zero risk to Optica — Optica has NO roster sheets classified as roster (they're all component_data)

### 1B. Server-side period detection (`/api/import/commit`)
- The commit route receives `aiContext` which includes `sheets[].classification`
- Before period scanning loop (line 337), check classification from aiContext
- Skip sheets classified as `'roster'` for period detection
- Entity resolution (Step 6) still processes roster sheets — only period detection skipped

### 1C. Client-side validation
- Already partially done — `validateCriticalFields()` skips roster for component checks
- No additional changes needed

**Files to modify**: `web/src/lib/import/period-detector.ts`, `web/src/app/api/import/commit/route.ts`
**Risk to Optica**: **NONE** — Optica sheets are classified as component_data, not roster

---

## ROOT CAUSE 2: Single Plan Context

**Problem**: `activePlan` loaded once on mount. All files in batch use same plan.

**Fix approach**: Per-file plan association in the import UI.

### 2A. AI-suggested plan per file (deferred — requires prompt changes)
This is the ideal approach but requires changes to the AI analysis prompt and response schema. **Deferred to Phase 4 — implement simpler UI-first approach.**

### 2B. Per-file plan selector in UI
- After Sheet Analysis, show a plan dropdown per file
- Default to current `activePlan`
- Roster files default to "No plan" (null)
- User can override per file
- This requires adding `selectedPlanId` to the analysis/mapping state

### 2C. Roster files get no plan association
- When classification is `'roster'`, plan association is null
- Roster creates/updates entities only — no plan-specific validation
- Rule set assignments handled separately in commit route via ProductLicenses

**Files to modify**: `web/src/app/data/import/enhanced/page.tsx`
**Risk to Optica**: **NONE** — single-file XLSX path unchanged. Plan selector only appears for multi-file imports.

---

## ROOT CAUSE 3: Field Mapper as Gate

**Problem**: UI shows "Unresolved" for unmapped columns, implying data loss.

**Fix approach**: Cosmetic UI fix only. Data layer already preserves all columns.

### 3A. Change "Unresolved" badge
- Currently: red/grey "Unresolved" badge for Tier 3 mappings
- Change to: grey "Preserved" badge
- Tooltip: "This column will be preserved in the database without a semantic mapping"

### 3B. No taxonomy expansion needed
- The base taxonomy has 25+ fields covering identifiers, dates, metrics, hierarchy, contact, employment
- Component-specific fields are dynamically extracted from the active plan
- Banking fields (loan_amount, etc.) can be mapped to generic `amount` — the calculation engine uses `inferSemanticType()` which handles this

**Files to modify**: `web/src/app/data/import/enhanced/page.tsx`
**Risk to Optica**: **NONE** — cosmetic only

---

## CONFIDENCE SCORE FIX

**Problem**: `matchedComponentConfidence` can be null → renders as "% confidence" literal text.

**Fix approach**: Guard against null in display.

- Line 2551: `{(currentMappingSheet.matchedComponentConfidence ?? 0)}% confidence`
- Same pattern for any other confidence display that could be null

**Files to modify**: `web/src/app/data/import/enhanced/page.tsx`
**Risk to Optica**: **NONE**

---

## SIGNAL LOOP CLOSURE

**Problem**: Signals written after import but never read during subsequent imports.

**Fix approach**: Read prior signals before AI analysis and include in prompt.

### 5A. Read signals in enhanced import page
- Before calling `/api/analyze-workbook`, fetch prior signals via `getConfidentMappings(tenantId)`
- Pass confident mappings as additional context to the AI prompt

### 5B. Include signals in AI prompt
- The analyze-workbook endpoint already accepts plan components and expected fields
- Add a new `priorMappings` parameter
- Include in the AI prompt: "Prior confirmed mappings for this customer: Column X → Field Y"

**Files to modify**: `web/src/app/data/import/enhanced/page.tsx`, `web/src/app/api/analyze-workbook/route.ts`, `web/src/lib/ai/ai-service.ts`, `web/src/lib/ai/anthropic-adapter.ts`
**Risk to Optica**: **NONE** — additive context in AI prompt

---

## APPROACH CONSTRAINTS

- Optica import/calculation MUST still work after these changes
- Pipeline Proof Co = MX$1,253,832 (zero tolerance)
- Single-file XLSX path (Optica pattern) must not regress
- Extend the pipeline, don't replace it
- No new database tables — use existing schema

## EXECUTION ORDER

1. Phase 2: Classification propagation (period detection guards) — smallest, safest
2. Phase 3: Confidence score fix — one-line guard
3. Phase 4: "Unresolved" → "Preserved" UI fix — cosmetic
4. Phase 5: Signal loop closure — read + prompt enrichment
5. Phase 6: Per-file plan selector — most complex UI change
6. Phase 7: Caribe data cleanup — database operations
7. Phase 8: Integration verification
8. Phase 9: Completion + PR
