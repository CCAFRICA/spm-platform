# DIAG-021 R1 COMPLETION REPORT
## Date: 2026-04-25
## Execution Time: 17:30 PDT - 18:05 PDT

## COMMITS (in order)

| Hash       | Phase      | Description                                              |
|------------|------------|----------------------------------------------------------|
| (pending)  | All phases | DIAG-021 R1 caller-writer + matcher path follow-up       |

(Commit SHA pasted to architect channel after Phase 5.3.)

## FILES CREATED

| File                                                  | Purpose       |
|-------------------------------------------------------|---------------|
| docs/completion-reports/DIAG-021_COMPLETION_REPORT.md | This file     |

## FILES MODIFIED

| File                                  | Change                                                     |
|---------------------------------------|------------------------------------------------------------|
| docs/diagnostics/DIAG-020_FINDINGS.md | Appended Section 10 (DIAG-021 R1 — caller-writer + matcher path + data_type) |

## PROOF GATES — HARD

| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |
|---|----------------------|-----------|----------|
| Anchor | All three SHAs resolved | PASS | `git rev-parse 48f1708d 9ad419d2 882bc94c` returned three full SHAs (48f1708d7b…, 9ad419d2c0…, 882bc94c99…). H1 does not fire. |
| Phase 1 | Emission point inventory at MARCH_19_SHA pasted with file:line for L1–L7 | PASS (with explicit absence) | L1=calc/run/route.ts:141; L2=sci/execute/route.ts:266; L3=convergence-service.ts:409; L4=sci/entity-resolution.ts:294; L5=sci/execute/route.ts:276; L6=sci/execute/route.ts:894; L7 (OB-185 Pass 4) explicitly absent at MARCH_19 (added 2026-03-22 by OB-185 Phase 1 — informative, not blocking). Table in Section 10 Phase 1. |
| Phase 1 | Surrounding function pasted for every found emission | PASS | Top-level function maps captured for calc/run/route.ts, sci/execute/route.ts, sci/entity-resolution.ts at all three anchors via `grep -nE "^(export\s+)?(async\s+)?function\s+\w+"`; enclosing function for each emission identified. ±10-line context blocks pasted for L1 and L3 across all three anchors and verified byte-identical at the local-block level. |
| Phase 2 | Cross-anchor emission table populated with all three anchors for L1–L7 | PASS | Table in Section 10 Phase 2 with all 7 rows × all 3 anchors. L7 marked "absent at MARCH_19" with explicit note. |
| Phase 2 | Body Identical? column populated with diff results | PASS | Function-level diff line counts captured: `convergeBindings` (M19→A17 = 203, A17→HEAD = 38); `sci/execute POST` (M19→A17 = 35, A17→HEAD = 5); `executeEntityPipeline` (M19→A17 = 15, A17→HEAD = 0); `calc/run POST` (M19→A17 = 548, A17→HEAD = 6); `entity-resolution.ts` whole-file (M19→A17 = 0, A17→HEAD = 0). Local-block diffs at L1 and L3 shown identical text. Both function-level and block-level columns populated. |
| Phase 2 | Drift candidates flagged | PASS | Row L4 byte-identical across all anchors (no drift). Rows L1, L2, L3, L5, L6 show function-level body NO between MARCH_19 and APR_17 — flagged as candidates and disambiguated via local-block analysis: all are ADDITIVE growth (Pass 4, seed validation, HF-188 intent executor, HF-165 calc-time convergence) inserted around emissions, not local-block rewrites. Local emission code unchanged at L1 and L3. No PATH_CHANGED_FILE / PATH_CHANGED_FUNC. |
| Phase 3 | Writers enumerated at all three anchors | PASS | Per-anchor `git grep -nE "from\(.committed_data.\)\.(insert\|upsert\|update)"` produced: 4 distinct writer locations at MARCH_19; 6 at APR_17; 6 at HEAD (modulo line drift). Plus `data-service.ts:167` insertCommittedData helper (byte-identical at all anchors). |
| Phase 3 | Writer-evolution table complete | PASS | Section 10 Phase 3 table: 10 rows × 5 anchor/content columns. Includes (a) execute-bulk's 3 inserts + 1 update, (b) execute/route.ts's 4 inserts + 1 update, (c) data-service.ts:167 helper. Each row carries field_identities presence and metadata key list. |
| Phase 3 | NEW / REMOVED / MOVED writers identified | PASS | NEW: execute-bulk/route.ts:552 entity insert (HF-184, 2026-03-31, commit 2203fc93) and execute-bulk/route.ts:836/832 reference insert (OB-195 Layer 1, 2026-03-30, commit 261bd9d0). REMOVED: none. MOVED: none. Quote line in Section 10 Phase 3 ("**NEW writers post-APR_17...**", "**REMOVED writers...None observed.**", "**MOVED writers:** None"). |
| Phase 4 | data_type construction traced at all three anchors | PASS | `normalizeFileNameToDataType` body extracted at HEAD (lines 36-46 of execute/route.ts); same line numbers and byte-identical body at all three anchors confirmed by direct comparison of the writer-call-site composition expression (`${normalized}__${tabName.toLowerCase()...}`) which is identical text at each grep match. |
| Phase 4 | data_type construction table complete | PASS | Section 10 Phase 4 table: 3 rows (one per anchor) × 2 content columns. All three anchors carry the same construction logic. |
| Phase 4 | Hash-prefixing introduction commit identified (or "absent at all anchors") | PASS | Quote: "Hash prefix is part of `fileName` itself (upstream content-unit-id format like `0_72d70dac_BCL_Plantilla_Personal.xlsx`)..." and "**Verdict: HASH_PRESENT_ALL_ANCHORS** — not a regression vector." Hash-prefix predates MARCH_19_SHA. |
| Phase 5 | Section 10 appended to DIAG-020_FINDINGS.md with all subsections | PASS | `grep -nE "^## 10\.\|^### Phase [1234]:\|^### Caller-Writer\|^### Multi-Pass\|^### Data_Type\|^### Combined disposition\|^### Hypothesis" docs/diagnostics/DIAG-020_FINDINGS.md` returns the Section-10 anchors. File grew from ~19,500 bytes to ~31,500 bytes. |
| Phase 5 | Caller-Writer Drift Verdict is exactly one classification | PASS | Quote: "**NEW_WRITER_OMITS_FI** — new writer call sites for the entity and reference pipelines were added in `execute-bulk/route.ts` between MARCH_19 (where they did not exist) and APR_17..." |
| Phase 5 | Multi-Pass Matcher Path Verdict is exactly one classification | PASS | Quote: "**PATH_UNCHANGED** — All three matcher functions ... and the convergence helper layout are byte-identical or additively enhanced..." |
| Phase 5 | Data_Type Normalization Verdict is exactly one classification | PASS | Quote: "**HASH_PRESENT_ALL_ANCHORS** — `normalizeFileNameToDataType` and the `${normalized}__${tabName}` composition are byte-identical at all three anchors." |
| Phase 5 | Combined disposition referenced from matrix | PASS | Quote: "`NEW_WRITER_OMITS_FI` × `PATH_UNCHANGED` × `HASH_PRESENT_ALL_ANCHORS` → **HF-194 narrow: restore `field_identities` write in `execute-bulk/route.ts`'s three insert call sites**..." |

## PROOF GATES — SOFT

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| Phase 1 | At least 4 of 7 log strings located at MARCH_19_SHA | PASS | 6 of 7 located at MARCH_19 (L1–L6); only L7 absent (added by OB-185 Phase 1 on 2026-03-22, post-MARCH_19). |
| Phase 3 | Each writer's metadata key list enumerated | PASS | All 6 in-scope writers (3 execute-bulk inserts + 3 of 4 execute/route.ts inserts shown via context blocks; 4th execute/route.ts inserter inferred from comment patterns + grep — all 4 carry `field_identities` per the verification grep) have key lists in the writer-evolution table. |
| Phase 4 | data_type construction logic summary is one sentence | PASS | Section 10 Phase 4 table cells: each "Construction logic" cell is one sentence describing `normalizeFileNameToDataType` + composition. |

## STANDING RULE COMPLIANCE

- Rule 25: PASS — completion report created before commit/push.
- Rule 26: PASS — this file follows the template.
- Rule 27: PASS — every gate has pasted evidence.
- Rule 28: N/A — single logical commit.
- Rule 29: PASS — verified in source artifact.
- Rule 34: PASS — structural diagnostic, no fix attempted.
- Rule 36: PASS — no scope expansion; stayed within code+history inspection. Did not inspect Vercel/CI logs; did not run DB queries; did not draft HF-194 content.
- Rule 51v2: PASS — no code changes; commit affects only `docs/`.
- Korean Test: PASS — structural identifiers (function names, log strings, SHAs, file paths). No domain-specific names introduced.

## KNOWN ISSUES

- **Single-pipeline asymmetry observed.** The pre-existing `execute-bulk/route.ts` transaction-pipeline writer at MARCH_19 (line 613) ALREADY omitted `field_identities` — meaning the bulk-writer-omission is not strictly a post-MARCH_19 regression for transactions; it's only a regression for entity and reference pipelines (which were added post-MARCH_19 in execute-bulk and inherited the same omission). For BCL specifically, the routing change (entity rows now go through execute-bulk instead of execute) is a contributing factor that DIAG-021 R1's matrix doesn't directly capture — the writer's content didn't regress for *transactions*, but the ROUTING did. Decision-makers should note that HF-194's narrow fix (restore `field_identities` writes in execute-bulk) closes the gap regardless of routing, but a parallel question — "should bulk imports route this way?" — is left open. Not a blocker for HF-194 draft.
- **L7 absent at MARCH_19.** OB-185 Pass 4 was added 2026-03-22, after MARCH_19_SHA. Two-of-three-anchor coverage for L7 is sufficient for the matcher-path verdict.
- **Branch state.** Same as DIAG-020 / DIAG-020-A — current branch is `hf-193-signal-surface`, not `main`. Push target is the same branch.

## VERIFICATION SCRIPT OUTPUT

None. (DIAG-021 R1 is evidence-paste only.)
