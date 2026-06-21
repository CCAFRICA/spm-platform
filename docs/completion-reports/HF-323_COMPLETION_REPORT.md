# HF-323 COMPLETION REPORT

Remove Import-Time Count-Metric Discriminator

## Date / Branch
2026-06-21 · `hf-323-remove-import-discriminator`

## Summary
Subtraction only. Removed HF-322's import-time count→metric discriminator from `plan-orchestration.ts` — both the call and the import. Import is restored to pure plan comprehension: the LLM emits the compositional intent and `constructTree` builds the DAG, with no data inspection or interception. The discriminator file and its unit test are retained (harmless unused code, removal optional per directive). No replacement added.

## Files changed
- `web/src/lib/sci/plan-orchestration.ts` — **4 insertions (comment only), 18 deletions**.
- `docs/vp-prompts/HF-323_DIRECTIVE_20260621.md` — directive (Rule 14).
- (retained, unmodified) `web/src/lib/plan-intelligence/count-metric-discriminator.ts` + `__tests__/count-metric-discriminator.test.ts`.

## PG-1 — CODE EVIDENCE

**Import removed** (top of `plan-orchestration.ts`): the line
`import { applyCountMetricDiscriminator } from '@/lib/plan-intelligence/count-metric-discriminator';`
is gone; only `import { constructTree } from '@/lib/plan-intelligence/intent-constructor';` remains.

**Call removed** — the path from `const ci = ...` to `constructTree(ci)` now has no interception:
```ts
          const ci = compositionalIntentRaw as unknown as CompositionalIntent;
          // HF-323: import is pure plan comprehension — the LLM emits the compositional intent and
          // the constructor builds the DAG, with NO data inspection or interception. (HF-322's
          // import-time count→metric discriminator was removed here: it required period/convergence
          // context that does not exist at import time, since periods are created after plan import.)
          const constructedTree = constructTree(ci);
          intent = constructedTree as unknown as Record<string, unknown>;
```
The removed block was the `const discriminator = await applyCountMetricDiscriminator(ci, args.signalContext.tenantId)` call plus its `if (discriminator.applied) { console.log(...) }` logging and the HF-322 comment. `grep -n "applyCountMetricDiscriminator\|count-metric-discriminator" plan-orchestration.ts` → no matches.

**Subtraction-only confirmation:** `git diff --stat` = `4 insertions(+), 18 deletions(-)`; the 4 insertions are all comment lines. No new code or logic was added (**HALT-1 not triggered**).

## PG-2 — BUILD CLEAN
```
tsc --noEmit   → exit 0
next build     → exit 0
```

## HALT activations
None. C1 (subtraction only) and C2 (import restored to pure plan comprehension) honored.
