# DIAG-022 COMPLETION REPORT
## Date: 2026-04-25
## Execution Time: 18:10 PDT - 18:35 PDT

## COMMITS (in order)

| Hash       | Phase      | Description                              |
|------------|------------|------------------------------------------|
| (pending)  | All phases | DIAG-022 pipeline architecture read       |

(Commit SHA pasted to architect channel after Phase 6.3.)

## FILES CREATED

| File                                                  | Purpose       |
|-------------------------------------------------------|---------------|
| docs/completion-reports/DIAG-022_COMPLETION_REPORT.md | This file     |

## FILES MODIFIED

| File                                  | Change                                  |
|---------------------------------------|-----------------------------------------|
| docs/diagnostics/DIAG-020_FINDINGS.md | Appended Section 11 (DIAG-022 results)  |

## PROOF GATES — HARD

| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |
|---|----------------------|-----------|----------|
| Phase 0 | Both route files exist; line counts pasted | PASS | `ls -la` + `wc -l`: execute/route.ts 72,299 bytes / 1,839 lines; execute-bulk/route.ts 40,609 bytes / 1,089 lines. Both files present at HEAD (882bc94c). |
| Phase 0 | HF-184 + OB-195L1 commit messages pasted | PASS | HF-184 (`2203fc93`, 2026-03-31): "Unified committed_data writes — import sequence independence. All SCI pipelines now write committed_data rows with source_date and entity_id_field…" — quoted in Section 11 Phase 0. OB-195 Layer 1 (`261bd9d0`, 2026-03-30): "Reference pipeline → committed_data (Decision 111). Rewrite processReferenceUnit to follow processDataUnit pattern. Previously wrote to reference_data + reference_items (deprecated per Decision 111)." — quoted in Section 11 Phase 0. |
| Phase 0 | execute-bulk first-commit identified | PASS | `git log --diff-filter=A`: `07639bb4` 2026-03-04 "OB-156 Phase 1+2: File storage transport + server-side bulk processing". execute itself was created `c0fcf055` 2026-03-01 "OB-127 Phase 6: SCI execute API — routing + target pipeline + convergence re-wire". execute predates execute-bulk by 3 days. |
| Phase 1 | Top-of-file extracted for both routes | PASS | execute/route.ts top 60 lines extracted (comments + imports + helper). execute-bulk/route.ts top 60 lines extracted (OB-156 file header + imports + PROCESSING_ORDER + normalizeFileNameToDataType + ROLE_TARGETS + BulkContentUnit interface). Pasted in conversation log. |
| Phase 1 | Handler summary written for execute (entry point, trigger, flow, return) | PASS | Section 11 Phase 1: 7-step flow describing auth → sort by classification → batched plan interpretation → per-unit dispatch → pipeline execution → entity resolution + convergence + signal capture. Returns `SCIExecutionResult { results: ContentUnitResult[]; convergence: {...} }`. |
| Phase 1 | Handler summary written for execute-bulk (same format) | PASS | Section 11 Phase 1: 9-step flow describing auth → Storage download → server-side XLSX parse → sort by PROCESSING_ORDER → per-unit processor dispatch → committed_data inserts in 2,000-row chunks → import_batches update. Note that 'plan' is in PROCESSING_ORDER but not actually handled here (no `processPlanUnit`). Returns `SCIExecutionResult { results: ContentUnitResult[] }` (no convergence — OB-182). |
| Phase 2 | Caller search produced output for both routes | PASS | `grep -rn "sci/execute"`: only callers of `/api/import/sci/execute` (excluding /execute-bulk) are SCIExecution.tsx:266 and 326. `grep -rn "execute-bulk"`: only caller of `/api/import/sci/execute-bulk` is SCIExecution.tsx:189. No other callers. |
| Phase 2 | Branching condition stated explicitly OR "no branching exists" stated | PASS | Quote: "Branching: `classification === 'plan'` → execute; otherwise (with storagePath) → execute-bulk; otherwise (without storagePath) → execute fallback." Source: `SCIExecution.tsx:286` `// OB-156: Split units into plan (legacy) and data (bulk) groups`, with `planUnits = unitsToExecute.filter(u => u.classification === 'plan')` and `dataUnits = unitsToExecute.filter(u => u.classification !== 'plan')`. |
| Phase 3 | All committed_data insert sites in execute located | PASS | execute writes at 4 pipeline sites with `field_identities` keys at lines 591 (target), 739 (transaction), 865 (entity), 987 (reference). Confirmed via `git grep -n "field_identities" execute/route.ts`. |
| Phase 3 | All committed_data insert sites in execute-bulk located | PASS | 3 insert sites in execute-bulk: line 525-548 (entity), 645-665 (transaction), 805-822 (reference). Plus an `entity_id` update at line 992 (no metadata write). Confirmed via DIAG-021 R1 evidence + visual inspection of metadata blocks. |
| Phase 3 | Comparison table populated with full metadata key lists | PASS | Section 11 Phase 3: 7-row comparison table (4 execute pipelines + 3 execute-bulk pipelines), columns: Pipeline / Insert Site / Data Type / metadata keys / field_identities / source value. |
| Phase 3 | Metadata diff statement produced | PASS | Quote: "Common to both: informational_label. Unique to execute-bulk: source: 'sci-bulk', proposalId, semantic_roles, resolved_data_type, entity_id_field. Unique to execute: field_identities, classification, sourceFile, tabName…" |
| Phase 4 | buildFieldIdentitiesFromBindings located | PASS | `web/src/app/api/import/sci/execute/route.ts:40` (single definition; only file in repo with this symbol). 4 internal call sites in same file (lines 586, 734, 880, 1011). |
| Phase 4 | Helper full body pasted | PASS | Section 11 Phase 4: full 40-line body pasted (ROLE_MAP table + the for-loop building `Record<string, FieldIdentity>` from `bindings: SemanticBinding[]`). |
| Phase 4 | Required inputs enumerated with types | PASS | Quote: "Required inputs: `bindings: SemanticBinding[]` — array of `{ sourceField: string; semanticRole: string; confidence: number; ... }`." Pure function. No DB/IO/AI calls. |
| Phase 4 | Availability in execute-bulk context determined with evidence | PASS | Quote: "**YES, fully available.** `BulkContentUnit.confirmedBindings: SemanticBinding[]` is declared at execute-bulk/route.ts:53 and is part of the `BulkRequest` payload posted by SCIExecution.tsx:173. `unit.confirmedBindings` is referenced 20+ times throughout execute-bulk/route.ts." |
| Phase 5 | All five questions (A–E) answered with code evidence | PASS | Section 11 Phase 5: Q-A NO (different workload), Q-B SAME caller / DIFFERENT branching, Q-C OVERLAP, Q-D NEITHER superset, Q-E YES (each has structural reason). Each answer cites specific file:line evidence. |
| Phase 5 | Responsibility-Division Verdict is exactly one classification | PASS | Quote: "**PARALLEL_SPECIALIZED.** The two routes have legitimately different responsibilities…" |
| Phase 5 | Indicated HF-194 Framing is exactly one option | PASS | Quote: "**B (narrow patch + tech-debt registration).** Per the matrix, PARALLEL_SPECIALIZED maps to A or B. The drift is sufficiently consequential…that registering it as debt is warranted." |
| Phase 6 | Section 11 appended to DIAG-020_FINDINGS.md with all subsections | PASS | `grep -nE "^## 11\.\|^### Phase [0-5]:\|^### Responsibility-Division\|^### Indicated\|^### Hypothesis\|^### ARCHITECT" docs/diagnostics/DIAG-020_FINDINGS.md` returns Section-11 anchors. File now ~50,000 bytes. |

## PROOF GATES — SOFT

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| Phase 1 | Handler summary is grounded in code evidence, not naming | PASS | Each step in both handler summaries references specific line ranges or named functions (e.g., `executeBatchedPlanInterpretation` at line 1093, `processDataUnit` pattern, `XLSX.read` for server-side parse, OB-174 Phase 5 nanobatch). |
| Phase 5 | Each question answer references pasted code | PASS | Q-A cites the absence of `processPlanUnit` in execute-bulk via `git grep`. Q-B cites SCIExecution.tsx:286 + filter expressions. Q-C cites OB-182 comment + execute's signal/rule_set writes. Q-D cites Storage requirement vs rawData requirement. Q-E cites OB-156 file header (AP-1/AP-2). |

## STANDING RULE COMPLIANCE

- Rule 25: PASS — completion report created before commit/push.
- Rule 26: PASS — this file follows the template.
- Rule 27: PASS — every gate has pasted evidence.
- Rule 28: N/A — single logical commit.
- Rule 29: PASS — verified in source artifact.
- Rule 34: PASS — structural diagnostic before structural fix; no fix attempted.
- Rule 36: PASS — scope held to reading the two routes + caller + helper. Did not draft HF-194.
- Rule 51v2: PASS — no code changes; commit affects only `docs/`.
- Korean Test: PASS — structural identifiers (file paths, function names, route paths). No domain vocabulary introduced.

## KNOWN ISSUES

- **`processPlanUnit` absent in execute-bulk despite plan in PROCESSING_ORDER.** execute-bulk's `PROCESSING_ORDER` map declares `plan: 0` but no plan-handling code path exists in the file (no `processPlanUnit`, no `interpretPlan` call, no `rule_sets` write). The `plan: 0` entry is dead-style configuration. Not a blocker for HF-194; documented for the architect's awareness because it could be misread as "execute-bulk handles plans" if only the PROCESSING_ORDER table is consulted.
- **execute's data pipelines (target/transaction/entity/reference) are live as a fallback path.** They are reachable when `SCIExecution.tsx`'s `executeLegacyUnit` is invoked (no `storagePath` case, line 237). This means HF-194 patches in execute-bulk close the bulk path but do not affect the fallback path; both should produce equivalent metadata. The execute fallback already writes field_identities, so no patch is needed there.
- **Branch state.** Same as DIAG-020 / DIAG-020-A / DIAG-021 R1 — current branch is `hf-193-signal-surface`, not `main`. Push target is the same branch.
- **DIAG-022 read only HEAD; did not re-read at MARCH_19/APR_17.** The diagnostic's purpose is structural, not historical; per the directive, only `HEAD_SHA = 882bc94c` was needed. Cross-anchor history of the two routes is in DIAG-021 R1 Section 10.

## VERIFICATION SCRIPT OUTPUT

None. (DIAG-022 is evidence-paste only.)
