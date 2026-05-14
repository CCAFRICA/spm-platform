# AUD-008 -- CalculationIntent Consumer Audit Output

**Date:** 2026-05-14
**Branch:** aud-008-calculationintent-consumer-audit
**HEAD commit at scaffold:** ab76ae3676e654f453dcae3e76133b8a7298fb91 (post-HF-223 merge)
**Scope:** Every consumer of calculationIntent or its sub-shapes. Nested operation tree readiness assessment.

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No fix proposals.

---

## Phase 1 -- Consumer enumeration

### Phase 1.1 -- `calculationIntent` / `calculation_intent` / `calcIntent` references

Total hits: **93 lines** across 17 files. Distribution (selected representative hits, full list saved to branch via Phase 1 commit):

```
web/src/app/api/calculation/run/route.ts:1312,1319,2176,2360       (4 hits)
web/src/app/api/import/sci/execute/route.ts:1531                   (1 hit)
web/src/app/data/import/enhanced/page.tsx:759                      (1 hit)
web/src/app/perform/statements/page.tsx:596                        (1 hit)
web/src/lib/ai/providers/anthropic-adapter.ts:435,459,461,475,477,500,502,509,511,540,542,550,552,564,566,573,575,591,593,600,602,618,620,636   (24 hits — mostly prompt examples)
web/src/lib/calculation/decimal-precision.ts:85,90,91,92            (4 hits)
web/src/lib/calculation/intent-executor.ts:485                     (1 hit — comment)
web/src/lib/calculation/intent-transformer.ts:42,74,136,235,265    (5 hits)
web/src/lib/calculation/run-calculation.ts:281,282,284,285,287,333,432,454,1403   (9 hits)
web/src/lib/compensation/plan-comprehension-emitter.ts:38,51,52,75,77,79,84,86   (8 hits)
web/src/lib/intelligence/convergence-service.ts:34,35,574,580,710,798,799,1236,1246,1502,2546   (11 hits)
web/src/lib/intelligence/trajectory-engine.ts:10,90                (2 hits)
web/src/lib/orchestration/metric-resolver.ts:232,238,243,246       (4 hits)
web/src/lib/reconciliation/employee-reconciliation-trace.ts:461    (1 hit)
web/src/lib/sci/tenant-context.ts:93,100,101                       (3 hits)
web/src/types/compensation-plan.ts:86                              (1 hit — type definition)
```

### Phase 1.2 -- intent sub-shape references (`.operation`, `.input`, `.source`, `.sourceSpec`, `.rate`, `.modifiers`, `.condition`, `.onTrue`, `.onFalse`, `.lookupTable`, `.segments`)

Total hits: **203 lines** across `web/src/lib/calculation/`, `web/src/lib/intelligence/`, `web/src/lib/ai/`, `web/src/app/api/calculation/`, `web/src/app/api/import/`.

### Phase 1.3 -- Type references (`IntentOperation`, `IntentSource`, `IntentModifier`, `ComponentIntent`, `CalculationIntent`)

Total hits: **116 lines** across the codebase.

### Phase 1.4 -- Deduplicated consumer file list (21 files, 19915 LOC total)

```
   4306 web/src/app/data/import/enhanced/page.tsx
   2915 web/src/app/api/calculation/run/route.ts
   2593 web/src/lib/intelligence/convergence-service.ts
   1865 web/src/app/api/import/sci/execute/route.ts
   1506 web/src/lib/calculation/run-calculation.ts
   1289 web/src/lib/ai/providers/anthropic-adapter.ts
    707 web/src/lib/calculation/intent-executor.ts
    700 web/src/lib/reconciliation/employee-reconciliation-trace.ts
    611 web/src/app/perform/statements/page.tsx
    534 web/src/lib/compensation/ai-plan-interpreter.ts
    448 web/src/lib/calculation/intent-validator.ts
    336 web/src/lib/orchestration/metric-resolver.ts
    323 web/src/lib/calculation/intent-types.ts
    276 web/src/lib/calculation/primitive-registry.ts
    275 web/src/lib/sci/tenant-context.ts
    271 web/src/lib/intelligence/trajectory-engine.ts
    268 web/src/lib/calculation/intent-transformer.ts
    258 web/src/types/compensation-plan.ts
    202 web/src/lib/calculation/decimal-precision.ts
    134 web/src/lib/compensation/plan-comprehension-emitter.ts
     98 web/src/lib/calculation/pattern-signature.ts
```

These 21 files are the population of consumers audited in Phases 2-7.
