# HF-183 Completion Report

## Changes Summary

**Fix 1 — Target Agent Signature + Entity Overlap Integration**
- `signatures.ts`: New `entity_referencing_with_temporal` signature (0.80 confidence floor)
- `tenant-context.ts`: Added target agent +0.15 boost for high entity ID overlap
- `resolver.ts`: Wired entity overlap adjustments into Bayesian classification pipeline
- `synaptic-ingestion-state.ts`: Added `entityIdOverlaps` field to SIS interface
- `analyze/route.ts`: Compute entity overlap before `resolveClassification`
- `process-job/route.ts`: Same entity overlap computation for async worker path

**Fix 2 — Per-Row entity_id_field Resolution**
- `route.ts` (calculation/run): Each row reads its OWN `metadata.entity_id_field`, with global fallback for backward compatibility

## Verification Gates

| # | Gate | How to Verify | PASS/FAIL | Evidence |
|---|------|---------------|-----------|----------|
| 1 | `npm run build` exits 0 | `cd web && npm run build` | PASS | Build completed with 0 errors, all routes compiled |
| 2 | `tsc --noEmit` exits 0 | `npx tsc --noEmit` | PASS | No output (0 errors) |
| 3 | `npx next lint` exits 0 | `npx next lint` | PASS | Pre-existing warnings only, no new issues |
| 4 | Korean Test on signatures.ts | `grep -n "monthly_quota\|effective_date\|consumable\|salary\|bonus" web/src/lib/sci/signatures.ts` | PASS | Only match: line 139 comment `// Captures quota/target files that have a temporal column (effective_date)` — zero matches in code logic |
| 5 | New signature exists | `grep -n "entity_referencing_with_temporal" web/src/lib/sci/signatures.ts` | PASS | `167:      signatureName: 'entity_referencing_with_temporal',` |
| 6 | Per-row entity_id_field | `grep -n "rowEntityIdField\|rowMeta" web/src/app/api/calculation/run/route.ts` | PASS | Lines 501-506: `const rowMeta = row.metadata ...`, `const rowEntityIdField = (rowMeta?.entity_id_field ...) \|\| fallbackEntityIdField` |
| 7 | Global-only loop removed | `grep -n "entityIdFieldFromMeta" web/src/app/api/calculation/run/route.ts` | PASS | 0 matches — renamed to `fallbackEntityIdField` (lines 458, 462, 469, 485, 502) |
| 8 | No unauthorized behavioral changes | `git diff --stat HEAD` | PASS | `signatures.ts`, `tenant-context.ts`, `resolver.ts`, `synaptic-ingestion-state.ts`, `analyze/route.ts`, `process-job/route.ts`, `calculation/run/route.ts` — 7 files, 151 insertions, 13 deletions |

## Files Modified (7)

```
web/src/lib/sci/signatures.ts                   +36  (new target signature)
web/src/lib/sci/tenant-context.ts               +6   (target overlap boost)
web/src/lib/sci/resolver.ts                     +27  (overlap application)
web/src/lib/sci/synaptic-ingestion-state.ts     +4   (SIS interface)
web/src/app/api/import/sci/analyze/route.ts     +30  (overlap computation)
web/src/app/api/import/sci/process-job/route.ts +28  (overlap computation)
web/src/app/api/calculation/run/route.ts        +20/-13 (per-row resolution)
```
