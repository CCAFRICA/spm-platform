# OB-139 Completion Report: Post-Confirm Import Experience

## Summary

Rebuilt the post-confirm import flow to replace the broken behavior where:
- The upload dropzone remained visible during execution (F-CLT137-08, F-CLT137-20)
- Import completed to a blank page with no summary (F-CLT137-06, CLT122-F72)
- No bridge existed from import → calculate

## Files Created

| File | Purpose |
|------|---------|
| `web/src/components/sci/ExecutionProgress.tsx` | Step-by-step processing view with progress bar, per-item status list, error actions |
| `web/src/components/sci/ImportReadyState.tsx` | Post-import summary with stat boxes, context section, Calculate bridge |

## Files Modified

| File | Change |
|------|--------|
| `web/src/components/sci/SCIExecution.tsx` | Extracted rendering → delegates to ExecutionProgress. Retained orchestration logic (API calls, chunking, retry) |
| `web/src/app/operate/import/page.tsx` | Fixed state machine: dropzone hidden during executing/complete. Added ImportReadyState rendering + plan-readiness enrichment |
| `web/src/lib/sci/sci-types.ts` | Added optional `summary` field to `SCIExecutionResult` |

## Architecture Decisions

1. **Separation of concerns**: SCIExecution handles orchestration only; ExecutionProgress handles display only
2. **Client-side enrichment**: Plan name + entity count fetched from plan-readiness API after execution completes (not from execute API)
3. **Graceful degradation**: ImportReadyState renders whatever data is available — missing fields are simply omitted
4. **State machine fix**: Upload dropzone only renders during `upload`, `analyzing`, and `proposal` phases — NOT during `executing` or `complete`

## Proof Gates

| # | Gate | Status |
|---|------|--------|
| 1 | ExecutionProgress renders progress bar + per-item list | PASS |
| 2 | Upload dropzone hidden during execution | PASS |
| 3 | Upload dropzone hidden during complete | PASS |
| 4 | ImportReadyState shows records committed | PASS |
| 5 | ImportReadyState shows entity count (when available) | PASS |
| 6 | ImportReadyState shows plan name (when available) | PASS |
| 7 | ImportReadyState shows per-item success/failure | PASS |
| 8 | Calculate bridge button navigates to /operate/calculate | PASS |
| 9 | "Import more data" resets to upload phase | PASS |
| 10 | Retry failed units works via ExecutionProgress | PASS |
| 11 | Korean Test: zero domain vocabulary | PASS |
| 12 | Auth chain: no auth files modified | PASS |
| 13 | Clean build: zero ESLint + TypeScript errors | PASS |

## Commits

```
1a5b747 OB-139 Phase 0: Commit prompt + begin diagnostic
2aea526 OB-139 Phase 1: ExecutionProgress component
012b0b6 OB-139 Phase 2: ImportReadyState component
c46eac2 OB-139 Phase 3: Wire into import page
66ee6b5 OB-139 Phase 4: Enrich execute API response
8804cb3 OB-139 Phase 5: Build verification + Korean Test pass
```

## Bugs Fixed

- **F-CLT137-08**: Upload dropzone visible during processing → hidden
- **F-CLT137-20**: Upload dropzone visible during processing → hidden
- **F-CLT137-06**: No extraction summary post-import → ImportReadyState
- **CLT122-F72**: Import completes to blank page → ImportReadyState with summary + Calculate bridge
