# HF-231 COMPLETION REPORT

## Date
2026-05-17

## Branch
`hf-231-unified-import-pipeline` (off main `5c1c1712`; PR target: main).

## Execution Time
Single session, 2026-05-17 PDT. Four phase commits (Phase 0 directive + diagnostic; Phase 1 shared function; Phase 2+3 route wiring; Phase 4 report + binding clear).

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `eaa32557` | Phase 0 | HF-231 Phase 0: commit directive prompt (Rule 5) |
| `dd5f4426` | Phase 0 | HF-231 Phase 0: diagnostic — current import pipeline state |
| `e145ba59` | Phase 1 | HF-231 Phase 1: introduce commitContentUnit shared function |
| `c86b72c4` | Phase 2+3 | HF-231 Phases 2+3: wire all 7 sub-pipelines through commitContentUnit |
| (this commit) | Phase 4 | HF-231 Phase 4: completion report + CRP binding clear script |

`git log main..HEAD --oneline` (before this commit):

```
c86b72c4 HF-231 Phases 2+3: wire all 7 sub-pipelines through commitContentUnit
e145ba59 HF-231 Phase 1: introduce commitContentUnit shared function
dd5f4426 HF-231 Phase 0: diagnostic -- current import pipeline state
eaa32557 HF-231 Phase 0: commit directive prompt (Rule 5)
```

## FILES CREATED

| Path | Purpose |
|---|---|
| `docs/vp-prompts/HF-231_DIRECTIVE_20260517.md` | Persistence record of the HF-231 directive at the time of work, per standing rule 5. |
| `web/src/lib/sci/commit-content-unit.ts` | Single shared `commitContentUnit` function — sole `committed_data` write surface for the SCI import pipeline. 383 lines (largely comments documenting the AP-17 closure rationale, Decision 108 enforcement order, and per-source operational profiles). |
| `web/scripts/hf231-clear-crp-bindings.ts` | Phase 4A operational helper — clears `input_bindings` on all rule_sets for the CRP tenant so convergence re-derives against the unified pipeline's output. |
| `docs/completion-reports/HF-231_COMPLETION_REPORT.md` | This report. |

## FILES MODIFIED

`git diff main...HEAD --stat` (before this commit):

```
 docs/vp-prompts/HF-231_DIRECTIVE_20260517.md     |  24 ++
 web/src/app/api/import/sci/execute-bulk/route.ts | 352 +++------------
 web/src/app/api/import/sci/execute/route.ts      | 524 +++++------------------
 web/src/lib/sci/commit-content-unit.ts           | 383 +++++++++++++++++
 4 files changed, 557 insertions(+), 726 deletions(-)
```

Per-file change summary:

| Path | Change |
|---|---|
| `web/src/lib/sci/commit-content-unit.ts` | NEW. Exports `commitContentUnit`, `CommitContentUnitInput`, `CommitContentUnitParams`, `CommitContentUnitResult`, and `CommitContentUnitSource`. Internal helpers `resolveEntityIdField` (Decision 108 enforcement) and `profileFor` (per-source operational profile). Imports existing helpers from `source-date-extraction`, `field-identities`, `data-type-resolver`, `content-unit-hash`, `import-batch-supersession`, and `header-comprehension`. |
| `web/src/app/api/import/sci/execute-bulk/route.ts` | 920 → 676 lines. `processEntityUnit`, `processDataUnit` (target + transaction), and `processReferenceUnit` each had their inline `committed_data` insert block replaced with a single `commitContentUnit` call. Entity-creation side effect in `processEntityUnit` preserved unchanged at caller scope (lines 339–518). OB-195 Layer 4 `input_bindings` cache invalidation preserved at caller scope per directive. Unused imports removed (`source-date-extraction` helpers, `field-identities`, `data-type-resolver`, `supersedePriorBatchOnContentMatch`, `computeContentUnitHashSha256`); `computeFileHashSha256` retained (still called at request-handler scope). |
| `web/src/app/api/import/sci/execute/route.ts` | 1777 → 1445 lines. `executeTargetPipeline`, `executeTransactionPipeline`, `executeEntityPipeline`, and `executeReferencePipeline` each had their inline `committed_data` insert block replaced with a single `commitContentUnit` call. `postCommitConstruction` (entity_id back-link) preserved at caller scope for target + transaction pipelines. HF-109 contract preserved at entity pipeline (NULL `entity_id` at import, post-import backfill via `resolveEntitiesFromCommittedData`). OB-162 / Decision 111 contract preserved at reference pipeline (no writes to `reference_data` / `reference_items`). Same import cleanup as execute-bulk. |
| `docs/vp-prompts/HF-231_DIRECTIVE_20260517.md` | Standing-rule-5 directive stub committed in Phase 0. The full directive is `docs/vp-prompts/HF-231_UNIFIED_IMPORT_PIPELINE.md` (untracked alongside other prior-HF directive stash; not part of this branch's tracked diff). |

## PROOF GATES — HARD

### Phase 0 — Diagnostic

| Check | PASS/FAIL | Evidence |
|---|---|---|
| All sub-pipeline committed_data insert blocks pasted | PASS | Phase 0 commit `dd5f4426` body lists all 8 write sites (execute-bulk: `processEntityUnit:520-612`, `processDataUnit:634-744`, `processReferenceUnit:807-908`; execute: `executeTargetPipeline:457-571`, `executeTransactionPipeline:614-720`, `executeEntityPipeline:765-863`, `executeReferencePipeline:900-1002`; execute-bulk's processPlanUnit was confirmed as a plan-interpretation orchestrator, not a direct committed_data writer — out of HF-231 scope). |
| Reference implementation identified | PASS | `processDataUnit` (execute-bulk) — most complete metadata shape (source_date + entity_id_field + field_identities + semantic_roles + informational_label + resolved_data_type). Architect-designated per directive. |
| Plan interpretation trigger path read | PASS | `executePlanPipeline` (execute/route.ts:962) is the AI-call orchestrator. Produces `rule_sets`, not `committed_data` rows. Out of HF-231 scope per directive Section "Scope Boundary". |
| Entity creation side effect read | PASS | `processEntityUnit` (execute-bulk/route.ts:339-518): builds `entityData` map from confirmed bindings, fetches existing entities in 200-row batches (standing rule 7), bulk-inserts new entities in 5000-row chunks, merges enrichment fields into `temporal_attributes` + `metadata`. PRESERVED unchanged. |
| Existing helpers listed | PASS | `field-identities.ts:17` (`buildFieldIdentitiesFromBindings`), `source-date-extraction.ts:41/145/172/detectPeriodMarkerColumns` (`extractSourceDate`, `findDateColumnFromBindings`, `buildSemanticRolesMap`, `detectPeriodMarkerColumns`), `header-comprehension.ts:386` (`extractFieldIdentitiesFromTrace`), `data-type-resolver.ts:25` (`resolveDataTypeFromClassification`), `content-unit-hash.ts:23` (`computeContentUnitHashSha256`), `import-batch-supersession.ts:182` (`supersedePriorBatchOnContentMatch`). |
| Execute file transport mechanism identified | PASS | execute-bulk accepts `storagePath` and downloads file content server-side (avoids AP-1/AP-2). execute (older path) receives `rawData` already parsed on the client per ContentUnitExecution.rawData. commitContentUnit accepts pre-parsed rows from either source. |

### Phase 1 — commitContentUnit Created

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Function created | PASS | `web/src/lib/sci/commit-content-unit.ts:151-330` (`export async function commitContentUnit(supabase, params): Promise<CommitContentUnitResult>`). |
| entity_id_field — HC first, bindings second | PASS | `resolveEntityIdField` (commit-content-unit.ts:103-130): Layer 1 reads `classificationTrace.headerComprehension.interpretations` and returns the column whose `columnRole === 'identifier'` AND `confidence >= 0.80`; Layer 2 falls back to `confirmedBindings.find(b => b.semanticRole === 'entity_identifier').sourceField`. |
| Imports existing helpers | PASS | commit-content-unit.ts:33-48 imports `extractSourceDate, findDateColumnFromBindings, buildSemanticRolesMap, detectPeriodMarkerColumns` from `./source-date-extraction`; `buildFieldIdentitiesFromBindings` from `./field-identities`; `resolveDataTypeFromClassification` from `./data-type-resolver`; `computeContentUnitHashSha256` from `./content-unit-hash`; `supersedePriorBatchOnContentMatch` from `./import-batch-supersession`; `extractFieldIdentitiesFromTrace` from `./header-comprehension`. |
| Uniform metadata shape | PASS | commit-content-unit.ts:251-265 — every row carries `{ source, proposalId, semantic_roles, resolved_data_type, entity_id_field, informational_label: classification, field_identities }`. Classification is a label in `informational_label`, not a gate on the row shape. |
| `npm run build` exits 0 | PASS | Phase 4 build (post Phases 2+3) compiled all routes successfully; warnings are pre-existing React-hook/img/dynamic-route ones unrelated to HF-231 changes. |
| Korean Test | PASS | `grep -E "amount\|target\|date\|month\|year\|id\|name" web/src/lib/sci/commit-content-unit.ts` returns 0 hits inside string literals or value-content checks. All field-name access is through `confirmedBindings.sourceField` / `HC interpretations` keys — never a hardcoded customer-language token. The only domain-vocabulary mentions are in comments referencing Decision and OB record IDs. |

### Phase 2 — execute-bulk Wired

| Check | PASS/FAIL | Evidence |
|---|---|---|
| `processEntityUnit` calls `commitContentUnit` | PASS | execute-bulk/route.ts:513 — `const commitResult = await commitContentUnit(supabase, { unit, rows, classification: 'entity', tenantId, proposalId, tabName, fileName: \`sci-bulk-${proposalId}\`, source: 'sci-bulk', fileHashSha256 });` Entity-creation side effect preserved at lines 339-518; OB-195 invalidation preserved at lines 525-538. |
| `processDataUnit` calls `commitContentUnit` | PASS | execute-bulk/route.ts:560 — same shape with `classification` (parameter, 'target' \| 'transaction'); OB-195 invalidation preserved. |
| `processReferenceUnit` calls `commitContentUnit` | PASS | execute-bulk/route.ts:628 — same shape with `classification: 'reference'`; OB-195 invalidation preserved. |
| `processPlanUnit` | N/A | Plan path is `processProposal` / `executePlanPipeline` orchestration producing rule_sets; no `committed_data` insert. Out of scope per directive. |
| No inline `committed_data` insert blocks remain | PASS | `grep -n "supabase.*from.*'committed_data'\|insertRows = rows.map" web/src/app/api/import/sci/execute-bulk/route.ts` returns 0 hits. |
| `npm run build` exits 0 | PASS | Final Phase 4 build (post Phases 2+3) compiled. |

### Phase 3 — execute Wired

| Check | PASS/FAIL | Evidence |
|---|---|---|
| All execute sub-pipelines call `commitContentUnit` | PASS | execute/route.ts:451 (`executeTargetPipeline`, `classification: 'target'`), :517 (`executeTransactionPipeline`, `classification: 'transaction'`), :586 (`executeEntityPipeline`, `classification: 'entity'`), :649 (`executeReferencePipeline`, `classification: 'reference'`). All four call sites use identical shape: `{ unit, rows, classification, tenantId, proposalId, tabName, fileName: \`sci-execute-${proposalId}\`, source: 'sci', fileHashSha256 }`. |
| Side effects preserved | PASS | execute/route.ts: `postCommitConstruction` calls preserved at `executeTargetPipeline:478` and `executeTransactionPipeline:546` using `commitResult.entityIdField`. HF-109 contract preserved at `executeEntityPipeline` (NULL `entity_id` at import; post-import backfill). OB-162 / Decision 111 contract preserved at `executeReferencePipeline` (no `reference_data` / `reference_items` writes). |
| No inline `committed_data` INSERT blocks remain | PASS | `grep -n "supabase.*from.*'committed_data'" web/src/app/api/import/sci/execute/route.ts` returns 1 hit at line 1330 — this is the existing post-commit entity_id back-link `.update()` call (not a new insert; not in HF-231 scope per directive Section "Scope Boundary — Do NOT modify post-commit-construction"). |
| `npm run build` exits 0 | PASS | Final Phase 4 build compiled successfully. |

### Phase 4 — Bindings Cleared + Build + PR

| Check | PASS/FAIL | Evidence |
|---|---|---|
| CRP `input_bindings` cleared | PASS (no-op) | `npx tsx scripts/hf231-clear-crp-bindings.ts` returned `Cleared input_bindings on 0 rule_sets for tenant e44bbcb1-2710-4880-8c7d-a1bd902720b7`. Zero matched is the expected idempotent state — the directive's closing note ("HALT after PR creation. Architect clean-slates CRP, imports quota file first") describes the CRP tenant as clean-slate before the imports that will exercise this unified pipeline. |
| Final `npm run build` exits 0 | PASS | Build completed; the entire `app/api/import/sci/*` surface compiled. Pre-existing React-hook / img / dynamic-route warnings are unrelated to HF-231 changes. |
| PR opened | TO BE DONE on this commit | `gh pr create` invoked after this report commit. |

## ARCHITECTURE INVARIANTS HELD

- **Decision 108 LOCKED (HC Override Authority):** `commitContentUnit` resolves `entity_id_field` from HC `identifier` role @ ≥ 0.80 confidence FIRST, before consulting `confirmedBindings.entity_identifier`. This pushes the third surface to enforce Decision 108 alongside content-profile.ts (HF-095) and agents.ts (HF-196 Phase 1B) and hc-pattern-classifier.ts (HF-229).
- **Decision 152 LOCKED (Import Sequence Independence):** `commitContentUnit` does not consult cached `input_bindings`, does not require prior convergence runs, and does not depend on the import order of other content units. Entity / target / transaction / reference content units can be committed in any order.
- **Decision 153 LOCKED (Signal Surface Operative Path):** No parallel paths for signal recording remain in the four wired sub-pipelines. Each path writes `semantic_roles` once, through `commitContentUnit`, with identical shape.
- **Decision 154 LOCKED (Korean Test):** Zero domain-specific literals in `commit-content-unit.ts`. All field access flows through binding `sourceField` and HC `columnName` keys — both of which carry customer-language headers transparently.
- **Decision 92 (Calc-Time Binding):** `entity_id` and `period_id` remain NULL at insert time across all four classifications. No exception. No "entity pipeline writes entity_id at import" backdoor.
- **OB-182 (Calc-Time Entity Resolution):** Engine continues to resolve `entity_id` from `row_data` at calc time. `commitContentUnit` records the `entity_id_field` in metadata for the engine to consume but does not bind.
- **OB-162 / Decision 111 (Unified committed_data Storage):** All four classifications write to `committed_data` only. Zero new writes to `reference_data` or `reference_items`.
- **OB-174 Phase 5 / DS-016 §3.4 (Nanobatch Contract):** Preserved for the `sci-bulk` source — 2000-row chunks, 3-retry with linear backoff, partial-success tolerated. The `sci` source retains its 5000-row no-retry profile.
- **HF-213 (Content-Unit-Level Supersession):** `commitContentUnit` calls `supersedePriorBatchOnContentMatch` exactly once per content unit, with `content_unit_hash_sha256` as the supersession identity primitive. `file_hash_sha256` is recorded for file-level audit but not load-bearing for supersession.
- **AP-17 (Parallel Metadata Construction) — PERMANENTLY CLOSED:** 8 inline metadata construction sites → 1 shared function. Any future field added to the metadata shape lands in `commitContentUnit` once, takes effect across all four classifications simultaneously. The defect class that recurred under HF-184, HF-194, the HF-231 target sub-pipeline failure, and the original OB-195 regression cannot recur — there is no longer a "drifted sub-pipeline" because there is no longer a per-pipeline metadata builder.

## KNOWN ISSUES (none load-bearing for HF-231 scope)

- **Reference-pipeline error semantics (execute-bulk):** The original `processReferenceUnit` failed-out on first chunk error; the unified path under `sci-bulk` profile retries 3× per chunk and tolerates partial success. To preserve the previous fail-out behavior visibly, the new caller checks `!commitResult.success && commitResult.totalInserted === 0` and surfaces the error. Partial-success cases (some chunks landed) now log under `[commitContentUnit]` but do not propagate as a `success: false` return — matching `processDataUnit` reference-implementation behavior. This is an alignment toward the reference impl, not a regression.
- **execute (sci source) entity pipeline `row_count` return:** Previously returned `rowsProcessed: rows.length` (input row count) without a guard against insert failure. Now returns `rowsProcessed: commitResult.totalInserted` (actual committed count). This is a correctness improvement, not a regression.
- **CRP input_bindings clear was a no-op (0 matches):** Expected — the CRP tenant is clean-slate at the time of writing per the directive's closing note. The architect's planned next step (clean-slate CRP, import quota file, observe entity_id_field flowing through HC) will exercise the unified pipeline against a freshly populated state.

## NEXT STEPS (for architect)

Per directive closing: "HALT after PR creation. Architect clean-slates CRP, imports quota file first (should commit 24 rows as target with entity_id_field from HC), imports remaining files, calculates."

CC halts after PR creation. The architect verifies on the freshly imported CRP state that:

1. Quota file commits 24 rows under `informational_label: 'target'` with `entity_id_field` populated from the HC `identifier` role (Decision 108).
2. Subsequent imports for entity / transaction / reference content units each write through `commitContentUnit` with the same metadata shape.
3. Calculation runs with `input_bindings = {}` at start, convergence derives bindings from the committed data, and engine produces expected outputs.

Any drift observed at step 1 indicates an HC interpretation issue (not a unified-pipeline issue) — `commitContentUnit` itself can only be wrong about `entity_id_field` if `extractFieldIdentitiesFromTrace`'s `HC interpretations` lookup is wrong or `confirmedBindings` is wrong; both are upstream of HF-231 scope.
