# HF-113 Completion Report: AI Column Mapping Prompt Format Enforcement

## Root Cause
HF-112 used `task: 'narration'` which triggered the narration system prompt, causing Claude to write a narrative analysis instead of a JSON mapping. Also missing `responseFormat: 'json'`.

## Fixes Applied

### Fix 1: Correct AITaskType + JSON format
- Changed `task: 'narration'` to `task: 'field_mapping'` (correct type for column mapping)
- Added `responseFormat: 'json'` to force JSON output mode

### Fix 2: Rewritten prompt
- System: "You are a data column mapper. Return ONLY a JSON object..."
- User: Simple metric list + column list + explicit example output
- Removed analysis-inducing language (boundary descriptions, component context)

### Fix 3: Response validation + retry
- `isValidColumnMapping()` checks that at least 50% of keys are metric field names with values being known column names
- On invalid response (narrative, wrong format): retry with minimal stripped-down prompt
- On second failure: fall back to boundary matching

## Phases
| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | `9c73702` | Diagnostic — identified `task: 'narration'` as root cause |
| 1 | `0d97fc4` | Prompt fix + validation + retry |
| 2 | This commit | Completion report + PR |

## Architecture Unchanged
- HF-112 binding reuse (`hasCompleteBindings`) preserved
- Boundary validation of AI proposals preserved
- Column exclusion preserved
- One AI call + one retry max

---
*HF-113 Complete | March 9, 2026*
