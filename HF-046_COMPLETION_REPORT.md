# HF-046 Completion Report — FIX AI FIELD MAPPING REGRESSION

**Status**: COMPLETE
**Date**: 2026-02-18
**Branch**: dev

---

## Commits

| Commit | Phase | Description |
|--------|-------|-------------|
| `8d302bc` | — | HF-046 prompt committed for traceability |
| `a24cf06` | Phase 0+1 | Stale closure guard for targetFields + FIELD_ID_MAPPINGS accent fix |
| `1dbbc48` | Phase 2+3 | Dynamic completeness score + console error analysis |

---

## Root Cause Analysis

### PRIMARY: Stale Closure Race Condition (All Fields "Unresolved")

The `analyzeWorkbook` function is a `useCallback` that captures `targetFields` from its closure.

**The race condition:**
1. Component renders → `targetFields = []`
2. `useEffect` fires → `getRuleSets(tenantId)` starts (async)
3. User uploads file → `handleFileSelect` → `analyzeWorkbook(file)` → API call (~5s)
4. `analyzeWorkbook` processes AI response using `targetFields = []` from stale closure
5. `normalizeAISuggestionToFieldId()` and `normalizeFieldWithPatterns()` both require `targetFields.some(f => f.id === xxx)` — with `[]`, `.some()` always returns `false`
6. **EVERY field becomes "Unresolved"** regardless of AI confidence

**Why it's a regression:** The timing between `getRuleSets` resolution and file upload is non-deterministic. As the app grew in complexity, the async load time increased, making the race condition more frequent.

### SECONDARY: Hardcoded 50% Completeness Score

Line 1613 (before fix): `completenessScore = 50` when zero required fields are mapped. Since ALL fields were "Unresolved" (root cause 1), no required fields were mapped, causing the 50% display.

### TERTIARY: Console Errors (GET profiles → 400, NetworkError)

- **GET profiles → 400**: Pre-existing Supabase auth REST API noise. `fetchCurrentProfile()` in `auth-service.ts` already handles this via try/catch → return null.
- **NetworkError on entity resolution**: Legacy browser-side commit code already removed by HF-045 (server-side import route).

---

## Fixes Applied

### Fix 1: Inline Target Fields Fallback (Phase 1)

```typescript
// HF-046 FIX: Guard against stale closure where targetFields is empty
let effectiveTargetFields = targetFields;
if (effectiveTargetFields.length === 0) {
  console.warn('[Field Mapping] targetFields is empty — using inline base fields fallback');
  effectiveTargetFields = extractTargetFieldsFromPlan(activePlan);
  setTargetFields(effectiveTargetFields); // Update state for Step 3 dropdowns
}
```

All 6 references to `targetFields` within the mapping logic now use `effectiveTargetFields`:
1. `normalizeAISuggestionToFieldId(suggestion, effectiveTargetFields)`
2. `normalizeFieldWithPatterns(header, effectiveTargetFields)`
3. `effectiveTargetFields.find(f => f.id === ...)?.isRequired`
4. `effectiveTargetFields.find(f => f.id === m.targetField)?.isRequired`
5. `runSecondPassClassification(..., effectiveTargetFields, ...)`
6. `setTargetFields(effectiveTargetFields)` — updates state for rendering

### Fix 2: Spanish Accent in FIELD_ID_MAPPINGS

Added `'año': 'period'` (with ñ accent) alongside existing `'ano': 'period'`.

### Fix 3: Dynamic Completeness Score (Phase 2)

Replaced hardcoded `completenessScore = 50` with:
```typescript
const totalRequired = targetFields.filter(f => f.isRequired).length;
completenessScore = Math.round((requiredMapped.length / totalRequired) * 100);
```

Shows "X/Y required fields mapped" instead of blanket "No required fields mapped."

---

## Files Modified

| File | Change |
|------|--------|
| `web/src/app/data/import/enhanced/page.tsx` | Stale closure guard, accent fix, dynamic completeness |

---

## Proof Gates

### Phase 0: Diagnostic
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-1 | State variable identified for AI mappings | `fieldMappings` (useState) set in analyzeWorkbook, read by Step 3 render | **PASS** |
| PG-2 | State handoff is intact (same variable) | Both Step 2 writer and Step 3 reader use `fieldMappings` | **PASS** |
| PG-3 | HF-045 did NOT break the handoff | HF-045 only changed commit logic (Step 5), not mapping logic | **PASS** |
| PG-4 | AI returns suggestedFieldMappings | Prompt in anthropic-adapter.ts line 533 includes `suggestedFieldMappings` in schema | **PASS** |
| PG-5 | Root cause identified | Stale closure: `targetFields = []` when analyzeWorkbook runs | **PASS** |
| PG-6 | 50% source identified | Line 1613: `completenessScore = 50` when 0 required fields mapped | **PASS** |

### Phase 1: Fix State Handoff
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-7 | Fallback computes base fields inline | `extractTargetFieldsFromPlan(activePlan)` called when `targetFields.length === 0` | **PASS** |
| PG-8 | All 6 targetFields refs use effectiveTargetFields | Lines 1321, 1332, 1364, 1384, 1408 + setTargetFields | **PASS** |
| PG-9 | State updated for dropdown rendering | `setTargetFields(effectiveTargetFields)` ensures Step 3 dropdowns populated | **PASS** |
| PG-10 | Spanish accent added | `'año': 'period'` in FIELD_ID_MAPPINGS | **PASS** |

### Phase 2: Fix Completeness Score
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-11 | No hardcoded 50% | `Math.round((requiredMapped.length / totalRequired) * 100)` | **PASS** |
| PG-12 | Shows X/Y ratio | `${requiredMapped.length}/${totalRequired} required fields mapped` | **PASS** |

### Phase 3: Console Errors
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-13 | GET profiles handled gracefully | `fetchCurrentProfile()` returns null on error, never throws | **PASS** |
| PG-14 | No legacy entity resolution calls | grep for findOrCreateEntity in page.tsx returns 0 matches | **PASS** |

### Phase 5: Build
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-15 | TypeScript: zero errors | `npx tsc --noEmit` exit 0 | **PASS** |
| PG-16 | Build: clean | `npm run build` exit 0 | **PASS** |

---

## Manual Browser Gates (for Andrew)

| # | Test | Expected |
|---|------|----------|
| M-1 | Upload RetailCDMX Excel → Step 2 (Sheet Analysis) | AI analysis shows confidence > 50%, sheet classifications |
| M-2 | Advance to Step 3 (Field Mapping) | Fields show auto/suggested/unresolved tiers, NOT all "Unresolved" |
| M-3 | Console: `[Field Mapping] Target fields available: N` | N >= 11 (base fields), NOT 0 |
| M-4 | Dropdown menus populated | Required Fields + Optional Fields groups in select elements |
| M-5 | If fallback triggered: console shows warning | `targetFields is empty — using inline base fields fallback` |
| M-6 | Completeness score reflects mapped fields | Shows ratio (e.g., "2/2 required fields mapped"), NOT fixed 50% |

---

*HF-046 — February 18, 2026*
*"A stale closure is a silent assassin — .some() on [] never screams, it just returns false."*
