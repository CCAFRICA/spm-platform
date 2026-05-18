# HF-233 COMPLETION REPORT

## Date
2026-05-18

## Branch
`hf-233-classification-aware-entity-id` (off main `753c6e44`; PR target: main).

## Execution Time
Single session, 2026-05-18 PDT. Three phase commits (Phase 0 directive + diagnostic; Phase 1 resolver edit; Phase 2 report).

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `b75bac51` | Phase 0 | HF-233 Phase 0: diagnostic — current entity_id_field resolution |
| `017b40c9` | Phase 1 | HF-233 Phase 1: classification-aware entity_id_field resolution |
| (this commit) | Phase 2 | HF-233: completion report per Rules 25–28 |

`git log main..HEAD --oneline` (before this commit):

```
017b40c9 HF-233 Phase 1: classification-aware entity_id_field resolution
b75bac51 HF-233 Phase 0: diagnostic — current entity_id_field resolution
```

## FILES CREATED

| Path | Purpose |
|---|---|
| `docs/vp-prompts/HF-233_DIRECTIVE_20260518.md` | Persistence record of the HF-233 directive at the time of work, per standing rule 5. |
| `docs/completion-reports/HF-233_COMPLETION_REPORT.md` | This report. |

## FILES MODIFIED

`git diff main...HEAD --stat` (before this commit):

```
 docs/vp-prompts/HF-233_DIRECTIVE_20260518.md | 25 +++++++
 web/src/lib/sci/commit-content-unit.ts       | 100 ++++++++++++++++++-------
```

Per-file change summary:

| Path | Change |
|---|---|
| `web/src/lib/sci/commit-content-unit.ts` | `resolveEntityIdField` extended to take `classification: Exclude<AgentType, 'plan'>` as a third parameter. New helper `findHcRole(trace, targetRole)` factors out the threshold + iteration logic that's now reused for both `'identifier'` and `'reference_key'` lookups. Reference classification returns `null` directly (Decision 111 — no entity association). Transaction classification reads `reference_key` role first, structural fallback second. Entity / target classifications preserve the existing HF-231 behavior. Single call site at line 248 updated to thread `classification` through. No other callers of `commitContentUnit` need updates — the public surface (`CommitContentUnitParams`, `CommitContentUnitResult`) is unchanged. |

## PROOF GATES — HARD

### Phase 0 — Diagnostic

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Current entity_id_field resolution block pasted with line numbers | PASS | Phase 0 commit `b75bac51` body pastes the pre-edit `resolveEntityIdField` body verbatim from `commit-content-unit.ts:102-133`. Identifies the hardcoded `columnRole === 'identifier'` check at line 120 as the defect surface. |
| `unit.confirmedClassification` / `classification` in scope at resolution point | PASS | `classification` is destructured from `params` at `commit-content-unit.ts:164` and was already in scope at the `resolveEntityIdField(...)` call site (line 245 pre-edit, line 247 post-edit). Phase 1 threads it through as a new third argument. |
| `hcInterpretations` Map accessible | PASS | Access pattern is `classificationTrace.headerComprehension.interpretations` — `Record<string, { columnRole?: string; confidence?: number }>` (serialized form of the runtime `Map<string, HeaderInterpretation>`; see `header-comprehension.ts:391` for the serialization shape). Same access supports `reference_key` lookups; only the role comparison value changes. |

### Phase 1 — Classification-Aware Resolution

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Classification-aware resolution block implemented | PASS | `commit-content-unit.ts:152-180` — full body of new `resolveEntityIdField`. Three branches: `reference` (line 159, returns null), `transaction` (lines 167-172, reads `reference_key` then falls back to `entity_identifier` binding), entity/target (lines 176-179, reads `identifier` then falls back). |
| Transaction branch reads `reference_key` role | PASS | `commit-content-unit.ts:167-172` — `if (classification === 'transaction') { const hcReferenceKey = findHcRole(classificationTrace, 'reference_key'); if (hcReferenceKey) return hcReferenceKey; const binding = bindings.find(b => b.semanticRole === 'entity_identifier'); return binding?.sourceField ?? null; }`. |
| Entity/target branch reads `identifier` role | PASS | `commit-content-unit.ts:176-179` — fallthrough branch (handles `'entity'` and `'target'` since `'reference'` and `'transaction'` returned earlier; `'plan'` is excluded from the type signature). `const hcIdentifier = findHcRole(classificationTrace, 'identifier'); if (hcIdentifier) return hcIdentifier; ...`. |
| Reference branch sets null | PASS | `commit-content-unit.ts:159-161` — `if (classification === 'reference') { return null; }`. Decision 111 dimensional-lookup semantics — no entity association by construction. |
| `confirmedBindings` fallback preserved for all (non-reference) branches | PASS | Transaction branch at line 170; entity/target branch at line 178. Both fall back to `bindings.find(b => b.semanticRole === 'entity_identifier').sourceField` when HC lookup misses. Reference branch deliberately omits the fallback per Decision 111. |
| `npm run build` exits 0 | PASS | Phase 1 build (`rm -rf .next && npm run build`) compiled all routes; warnings are pre-existing React-hook / img / dynamic-route ones unrelated to HF-233. |
| Korean Test: 0 customer-language column names | PASS | `grep -nE "'sales_rep_id'\|'transaction_id'\|'employee_id'\|'entity_id'" web/src/lib/sci/commit-content-unit.ts` → 0 matches. The branches read `AgentType` union values (`'transaction'`, `'reference'`) and `ColumnRole` union values (`'identifier'`, `'reference_key'`) — both are sci-types union members, not customer-language tokens. Column names mentioned in the rationale comment block (lines 116, transaction_id / sales_rep_id) are inside line-comment text, not code. |

### Phase 2 — Build + Report + PR

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Final `npm run build` exits 0 | PASS | Phase 1 build compiled successfully; no additional code changes since. |
| Completion report written | PASS | This file. |
| PR opened | TO BE DONE on this commit | `gh pr create` invoked after this report commit. |

## ARCHITECTURE INVARIANTS HELD

- **Decision 108 LOCKED (HC Override Authority):** HC column roles at `>= 0.80` confidence remain the override layer above structural bindings. The change is which role each classification consults — Layer-1/Layer-2 ordering and threshold are unchanged.
- **Decision 92 / OB-182 (Calc-Time Entity Binding):** `committed_data.entity_id` remains NULL at import; only the *name* of the column that the engine will use at calc time changes. No new writes to `entities` from this path.
- **Decision 111 (Unified `committed_data` Storage):** Reference data still flows to `committed_data` with `entity_id_field = null` — recorded but never used by the engine for entity resolution. No new writes to `reference_data` / `reference_items`.
- **Decision 152 LOCKED (Import Sequence Independence):** Resolution depends only on the unit's own HC trace + bindings + classification — no cross-unit / cross-order state.
- **Decision 154 LOCKED (Korean Test):** Zero customer-language literals. Branches read `AgentType` and `ColumnRole` enum values only.
- **HF-231 Public Surface:** `CommitContentUnitParams`, `CommitContentUnitResult`, and `CommitContentUnitInput` unchanged. The 7 callers in `execute/route.ts` (4) and `execute-bulk/route.ts` (3) need no updates.
- **HF-232 Decision Tree:** Untouched. Classification is correctly produced upstream; HF-233 only changes what `commitContentUnit` does with it.

## VERIFICATION (paper trace, extending HF-232's table with entity_id_field)

| File | classification (HF-232) | HC role read (HF-233) | entity_id_field |
|---|---|---|---|
| Quota          | target                  | `identifier`     @ 0.95 | `entity_id`       (unchanged) |
| Sales          | transaction (was target) | `reference_key` @ 0.95 | `sales_rep_id`    (was `transaction_id`) |
| Roster         | entity                  | `identifier`     @ 0.95 | `employee_id`     (unchanged) |
| Hub capacity   | reference               | (skipped)               | `null`            (unchanged) |

## KNOWN ISSUES

None. Scope is one file, one helper function refactor + one new branch + one extra parameter on the call site. The public `commitContentUnit` surface is unchanged so no caller updates required.

## NEXT STEPS (for architect)

Per directive closing: HALT after PR creation. Architect clean-slates CRP (including fingerprints — HF-232's reclassification of sales as `transaction` means the prior `entity_id_field='transaction_id'` is stale), re-imports all files, and verifies:

1. Sales files commit with `entity_id_field='sales_rep_id'` in `committed_data.metadata`.
2. Entity Resolution creates 0 ghost entities from sales rows — instead it links transactions to the existing 24 entities (8 Senior Rep + 16 Rep) via `sales_rep_id`.
3. Engine calculates for the real 24 entities, not for 421 (32 real + 389 ghost) — and does not fall back to sheet-matching at the $150/$200 floor.

Any drift at step 1 indicates an upstream HC issue (the LLM didn't assign `reference_key` to `sales_rep_id` at `>= 0.80`) — the resolver itself can only be wrong about the role lookup if HC's `interpretations` map is wrong.
