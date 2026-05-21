# HF-232 COMPLETION REPORT

## Date
2026-05-18

## Branch
`hf-232-decision-tree-reference-key` (off main `c7910885`; PR target: main).

## Execution Time
Single session, 2026-05-18 PDT. Three phase commits (Phase 0 directive + diagnostic; Phase 1 surface edit; Phase 2 report).

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `08e9b1ef` | Phase 0 | HF-232 Phase 0: diagnostic — current decision tree branches |
| `adb880bc` | Phase 1 | HF-232 Phase 1: reference_key discriminates transaction from target |
| (this commit) | Phase 2 | HF-232: completion report per Rules 25–28 |

`git log main..HEAD --oneline` (before this commit):

```
adb880bc HF-232 Phase 1: reference_key discriminates transaction from target
08e9b1ef HF-232 Phase 0: diagnostic — current decision tree branches
```

## FILES CREATED

| Path | Purpose |
|---|---|
| `docs/vp-prompts/HF-232_DIRECTIVE_20260518.md` | Persistence record of the HF-232 directive at the time of work, per standing rule 5. |
| `docs/completion-reports/HF-232_COMPLETION_REPORT.md` | This report. |

## FILES MODIFIED

`git diff main...HEAD --stat` (before this commit):

```
 docs/vp-prompts/HF-232_DIRECTIVE_20260518.md | 19 ++++++++++
 web/src/lib/sci/hc-pattern-classifier.ts     | 39 ++++++++++++++++-----
```

Per-file change summary:

| Path | Change |
|---|---|
| `web/src/lib/sci/hc-pattern-classifier.ts` | Branches 3 and 4 of `classifyByHCPattern` rewritten. Same exported signature `(profile: ContentProfile): HCPatternResult \| null`, same `HCPatternResult` return interface, same coverage gate, same HC_ROLE_THRESHOLD. Branches 1 (`dimensional_lookup`), 2 (`entity_definition`), and 5 (`measure_only_reference`) untouched. The change reads only existing primitives (`identifierCount`, `hasReferenceKey`, `measureCount`) — no new variables introduced. |

## PROOF GATES — HARD

### Phase 0 — Diagnostic

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Current Branches 3, 4, 5 pasted with line numbers | PASS | Phase 0 commit `08e9b1ef` body pastes Branches 3 (lines 123–134, `identifierCount === 1` → target), 4 (lines 136–147, `identifierCount >= 2` → transaction), 5 (lines 149–159, fallthrough → reference). |
| `hasReferenceKey` variable confirmed present | PASS | hc-pattern-classifier.ts:73 (pre-edit) — `const hasReferenceKey = confidentRoles.some(r => r.columnRole === 'reference_key');`. Computed by HF-230 but consumed only by Branch 1 prior to HF-232. |

### Phase 1 — Branch Discrimination Fixed

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Branch 3 now checks `hasReferenceKey` → transaction | PASS | hc-pattern-classifier.ts:132 — `if (identifierCount >= 1 && hasReferenceKey)` returns `{ classification: 'transaction', confidence: 0.85, patternName: 'event_transactions', matchedConditions: ['HAS measure', 'HAS reference_key — event references entities', '${identifierCount} identifier(s)', '${measureCount} measure column(s)'] }`. |
| Branch 4 now checks `!hasReferenceKey` → target | PASS | hc-pattern-classifier.ts:150 — `if (identifierCount >= 1 && !hasReferenceKey)` returns `{ classification: 'target', confidence: 0.85, patternName: 'entity_targets', matchedConditions: ['HAS measure', 'NO reference_key — entity-level record', '${identifierCount} identifier(s)', '${measureCount} measure column(s)'] }`. |
| Branch 5 unchanged | PASS | hc-pattern-classifier.ts:164–174 (was lines 149–159 pre-edit; line shift is from the longer comment block at Branches 3/4). Body unchanged: `identifierCount === 0` fallthrough returns `{ classification: 'reference', confidence: 0.80, patternName: 'measure_only_reference', matchedConditions: ['HAS measure', 'NO identifier'] }`. |
| `npm run build` exits 0 | PASS | Phase 1 build (`rm -rf .next && npm run build`) compiled all routes; warnings are pre-existing React-hook / img / dynamic-route ones unrelated to HF-232. |
| Korean Test: 0 domain-vocabulary literals | PASS | `grep -nE "'quota'\|'sales'\|'transaction_id'" web/src/lib/sci/hc-pattern-classifier.ts` → 0 matches. The only domain words in the file are inside line comments documenting the intent (e.g., `transaction_id`, `sales_rep_id`, `employee_id`); zero appearances inside string literals or `===` comparisons. |

### Phase 2 — Build + Report + PR

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Final `npm run build` exits 0 | PASS | Phase 1 final build compiled successfully; no additional code changes since. |
| Completion report written | PASS | This file. |
| PR opened | TO BE DONE on this commit | `gh pr create` invoked after this report commit. |

## ARCHITECTURE INVARIANTS HELD

- **Decision 108 LOCKED (HC Override Authority):** The discriminator continues to be HC column-role output (`identifier`, `reference_key`, `measure`) at `>= 0.80` confidence. No structural-profile read added; the change is purely a re-weighting of the same HC primitives.
- **Decision 154 LOCKED (Korean Test):** Zero domain-specific literals. The branches read `ColumnRole` enum values (`'identifier'`, `'reference_key'`, `'measure'`) — those are sci-types union members, not customer-language tokens.
- **Coverage gate unchanged:** `MIN_COVERAGE_RATIO = 0.50` at `HC_ROLE_THRESHOLD = 0.80` continues to gate Level-1 tree entry. Below the gate, Level-2 CRR Bayesian still owns classification.
- **Branches 1 (`dimensional_lookup`), 2 (`entity_definition`), and 5 (`measure_only_reference`) untouched.** Branch ordering preserved.
- **HF-229 invariant preserved:** Branch 2 still gates on `!measurePresent`; quota / sales files (both have measures) still fall through to Branches 3/4 rather than misclassifying as entity.

## VERIFICATION (paper trace against known CRP shapes)

| File | identifier | reference_key | measure | Branch reached | Classification |
|---|---|---|---|---|---|
| Quota          | `entity_id` (1)        | none (0)                | `monthly_quota` (1)                    | 4 — `identifierCount >= 1 && !hasReferenceKey` | target      ✓ |
| Sales          | `transaction_id` (1)   | `sales_rep_id` (1)      | `quantity, unit_price, total_amount` (3) | 3 — `identifierCount >= 1 && hasReferenceKey`  | transaction ✓ |
| Roster         | `employee_id` (1)      | none (0)                | none (0)                                | 2 — `!measurePresent`                          | entity      ✓ |
| Hub capacity   | none (0)               | none (0)                | `capacity` (1)                          | 5 — `identifierCount === 0` fallthrough        | reference   ✓ |

## KNOWN ISSUES

None. Scope is 5 lines of conditional logic; surface is one file; no callers required updates (the returned `HCPatternResult` shape is unchanged — only its routing changes for files that carry both an identifier and a reference_key).

## NEXT STEPS (for architect)

Per directive closing: HALT after PR creation. Architect clean-slates CRP (including fingerprint cache, since cached classifications from the HF-230 codepath are now stale for sales files), re-imports all files, verifies that:

1. Quota file is classified as `target`.
2. Sales file is classified as `transaction`.
3. Roster classifies as `entity` (Branch 2, unchanged behavior).
4. Hub capacity classifies as `reference` (Branch 5, unchanged behavior).

All four CRP plans then calculate through the calc engine. Any drift at steps 1–2 indicates either an upstream HC interpretation issue (the LLM didn't assign `reference_key` to the sales_rep_id column) or a cached classification not invalidated by the clean-slate — both upstream of the decision tree itself.
