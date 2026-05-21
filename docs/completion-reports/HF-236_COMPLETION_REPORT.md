# HF-236 — DIAG-050 Closure: Completion Report

## Date

2026-05-18

## PR + commits

**PR:** https://github.com/CCAFRICA/spm-platform/pull/416 (open, branch `hf-236-diag050-closure`).

| Hash | Phase | Description |
|---|---|---|
| `8f3e54ec` | Phase 1 | HF-236 Phase 1: Layer 3 — row_data persists unconditionally; PARTIAL narrows bindings only |
| `dab247b8` | Phase 2 | HF-236 Phase 2: Layer 1 — materialization-layer alignment; roleMap registry eliminated |
| `b8157bea` | Phase 3 | HF-236 Phase 3: CRP flywheel cache invalidated (poisoned by pre-HF-236 PARTIAL filtering) |
| (this commit) | Phase 4 | HF-236: completion report per Rule 25 |

`git log main..HEAD --oneline` (before this commit):

```
b8157bea HF-236 Phase 3: CRP flywheel cache invalidated (poisoned by pre-HF-236 PARTIAL filtering)
dab247b8 HF-236 Phase 2: Layer 1 — materialization-layer alignment; roleMap registry eliminated
8f3e54ec HF-236 Phase 1: Layer 3 — row_data persists unconditionally; PARTIAL narrows bindings only
```

## Files modified

| Path | Phase | Change shape |
|---|---|---|
| `web/src/app/api/import/sci/execute-bulk/route.ts` | Phase 1 | `filterFieldsForPartialClaim` narrows `confirmedBindings` only; `rows` passes through unchanged. Inline substrate citation (T1-E902 v2, T2-E06 v2) added above the function. The pre-HF-236 `filteredRows = rows.map(row => {...})` block removed. |
| `web/src/app/api/import/sci/execute/route.ts` | Phase 1 | `filterFieldsForPartialClaim` (single-arg `ContentUnitExecution → ContentUnitExecution` form) narrows `confirmedBindings` only; `rawData` passes through unchanged. The pre-HF-236 `filteredRows = unit.rawData.map(...)` block removed. |
| `web/src/app/api/import/sci/analyze/route.ts` | Phase 2 | `NATIVE_COLUMN_ROLES` set declared; `insufficientFlywheelCache: Set<string>` computed BEFORE `sheetSkipHC`; `sheetSkipHC` gated on `!insufficientFlywheelCache.has(sheetName)`; hardcoded 8-entry `roleMap` (pre-HF-236 lines 174-179) eliminated; flywheel-injection loop reads `fb.columnRole` directly (guaranteed-present by the gate). |
| `web/src/app/api/import/sci/execute/route.ts` | Phase 2 | Flywheel write path enriches each cached `fieldBindings` entry with native `columnRole` and `identifiesWhat` read from `unit.classificationTrace.headerComprehension.interpretations`. Future Tier-1 replays reconstruct `HeaderInterpretation` directly. |
| `web/scripts/hf236-clear-crp-fingerprints.ts` | Phase 3 | New throwaway probe script. Reads `structural_fingerprints` for CRP tenant (`e44bbcb1-...`), logs pre-delete state, deletes all 3 rows, reports count. |

## Substrate citation

Wave 1 substrate amendments locked at **VG `e2fbcc4`** (2026-05-18) — IRA invocation authority **VG `ff0f6c9`** (Substrate Wave 1 coherence review, `evaluation_status: fired_with_results`, all 5 amendments `→ extend`, zero Korean Test violations). DIAG-050 IRA disposition authority **VG `06513d0`** (Option 6 IRA-innovated, rank 2 / combined-closure rank 1).

| Substrate entry | Version | Operative clause for HF-236 |
|---|---|---|
| `IGF-T1-E902` | v2 | "Persistence scope — all data persists at import time without filter, mask, or projection by AI classification, claim type, agent ownership, or any other context-driven judgment." + "Hints-not-gates — AI classifications attach as contextual annotations on persisted data; they inform downstream consumption but do not gate persistence." |
| `IGF-T1-E906` | v2 | "Closed-Loop Intelligence imposes a read-before-derive obligation. Any service writing to the signal surface shall first read the signal surface for prior comprehension on the same fingerprint, identity, or scope." |
| `IGF-T1-E910` | v2 | "Structural primitives shall exist in exactly one canonical declaration. Every boundary derives from that declaration without maintaining a private copy. Every primitive recognized at any boundary is recognizable at every boundary it traverses. Every dispatch boundary produces observable, named, structured failure on unrecognized identifiers — never silent fallback." |
| `IGF-T2-E06` | v2 | "HC observations persist to committed_data irrespective of claim type. Claim scope narrowing (PARTIAL, FULL, or future claim-type primitives) governs agent ownership semantics — which agent claims which fields as its semantic responsibility — and does not govern data persistence scope. Automated narrowing of the HC observation set during claim-type projection is the named violation pattern, distinct from architect-issued override." |
| `IGF-T2-E47` | v1 | NEW T2 Decision: "content_unit_hash_sha256 Supersession Identity Primitive." Governing principles: T1-E902, T1-E904, T1-E905, T1-E910. Not directly invoked by HF-236 surfaces but referenced for the Wave-1 lock that authorizes this HF. |

Inline substrate citations are baked into the production code at each modified surface (comment blocks above `filterFieldsForPartialClaim` in both routes, above the `insufficientFlywheelCache` gate in `analyze/route.ts`, and above the flywheel-write enrichment in `execute/route.ts`).

## Proof gates — hard

Criteria are taken **verbatim** from the HF-236 dispatch directive §3 / §4 / §5 / §6 per Rule 18.

| # | Criterion (verbatim) | PASS/FAIL | Evidence |
|---|---|---|---|
| §3-a | "Verify both files updated: `grep -n filterFieldsForPartialClaim ...`" | PASS | execute-bulk/route.ts:216 (call site), :277 (function decl); execute/route.ts:404 (call site), :425 (substrate-citation comment), :427 (function decl). |
| §3-b | "Both functions should show the new shape — no `filteredRows = rows.map(...)` block, `rows` returned unchanged." | PASS | `grep -n "filteredRows = rows.map\|filteredRows = unit.rawData.map" execute-bulk/route.ts execute/route.ts` returns zero matches. Function bodies (execute-bulk:267-294, execute:417-437) return the original `rows` / unmodified `rawData` and project only `confirmedBindings`. |
| §3-c | "`npm run build && echo BUILD: $?`" (Phase 1) | PASS | Phase 1 build output: `BUILD: 0`. |
| §4-a | "The `skipHCSet.delete(sheet.sheetName)` call must match the actual variable name in scope" (directive placeholder) | RESOLVED | The actual scope variable is the function `sheetSkipHC: (string) => boolean` (analyze/route.ts:163-166 post-edit). The directive's placeholder name `skipHCSet` did not exist. CC introduced `insufficientFlywheelCache: Set<string>` (line 143) BEFORE the `sheetSkipHC` declaration and gated `sheetSkipHC` on `!insufficientFlywheelCache.has(sheetName)`. See Known Issues. |
| §4-b | "`grep -n "fieldBindings: unit.confirmedBindings" web/src/app/api/import/sci/execute/route.ts`" (locate write site) | PASS | Pre-edit hit at execute/route.ts:341. Post-edit, that line is replaced by `fieldBindings: enrichedFieldBindings,` at line 369; `unit.confirmedBindings` direct passthrough no longer present in the write path. `grep -n "enrichedFieldBindings" execute/route.ts` returns hits at 354 (construction) and 369 (write). |
| §4-c | hardcoded `roleMap` removed | PASS | `grep -n "const roleMap:" analyze/route.ts` returns zero matches. The pre-HF-236 8-entry `Record<string, ColumnRole>` literal is fully deleted. |
| §4-d | "`npm run build && echo BUILD: $?`" (Phase 2) | PASS | Phase 2 build output: `BUILD: 0`. |
| §5-a | "Clear CRP flywheel signals (or fingerprints)" | PASS | `npx tsx scripts/hf236-clear-crp-fingerprints.ts` reported `Pre-delete: 3 structural_fingerprints rows for CRP tenant` (target, entity, transaction — including the poisoned 5-binding transaction cache at `4efbcb34e912`), then `Deleted 3 rows.` Directive's example used `classification_signals`/`signal_type='flywheel'` filter; actual cache lives in `structural_fingerprints` table per `fingerprint-flywheel.ts:45`. See Known Issues. |
| §6-a | "`FINAL BUILD: $?`" | PASS | Final build output: `FINAL BUILD: 0`. |
| §6-b | "`gh pr create --base main --head hf-236-diag050-closure ...`" | PASS | PR #416 opened: https://github.com/CCAFRICA/spm-platform/pull/416. Title verbatim from directive; body cites Wave-1 substrate, three layers, and test plan. |

## Standing rule compliance

- **Rule 1 (commit + push each phase):** PASS — three phase commits (`8f3e54ec`, `dab247b8`, `b8157bea`) each pushed before the next phase began.
- **Rule 6 (completion report in correct path):** PASS — `docs/completion-reports/HF-236_COMPLETION_REPORT.md` (VP repo project root convention).
- **Rule 18 (criteria verbatim):** PASS — every proof-gate criterion in this report quotes the HF-236 directive §3 / §4 / §5 / §6 text verbatim.
- **Rule 41 (Read actual contracts/code before acting):** PASS — DIAG-050 lifecycle map read end-to-end before drafting; `fingerprint-flywheel.ts` read before authoring the cache-clear probe; `SemanticBinding` type read before deciding to enrich at the write site rather than mutate the type. Schema mismatch in §5 caught by reading `structural_fingerprints` column inventory via `fingerprint-flywheel.ts:46` before issuing the delete.
- **AP-25 (Korean Test):** PASS — zero field-name vocabulary in code; the `NATIVE_COLUMN_ROLES` set in `analyze/route.ts:142` contains only the structural `ColumnRole` union values (`identifier`, `name`, `temporal`, `measure`, `attribute`, `reference_key`), not customer field names. The pre-HF-236 8-entry `semanticRole → columnRole` registry that was the Korean Test violation is fully eliminated.
- **T2-E04 (Vertical Slice Rule / Decision 94):** PASS — single PR per defect class. Engine surfaces (`analyze`, `execute-bulk`, `execute`) and operational cache (flywheel invalidation probe) ship together.

**Wave-1 substrate citations (locked at VG `e2fbcc4`):**

- **T1-E902 v2** — invoked at both `filterFieldsForPartialClaim` sites (execute-bulk + execute) to authorize unconditional `rows` / `rawData` passthrough.
- **T1-E906 v2** — invoked at `analyze/route.ts` insufficientFlywheelCache gate (read-before-derive: read the flywheel cache shape before deciding to inject vs re-emit).
- **T1-E910 v2** — invoked at the roleMap-elimination edit (Korean Test: no hardcoded role registries).
- **T2-E06 v2** — invoked at both `filterFieldsForPartialClaim` sites (HC Override Authority: automated claim-type projection is the named violation pattern).

## Known issues

1. **Directive §4 placeholder variable `skipHCSet` did not exist in scope.** The actual gate is the `sheetSkipHC: (string) => boolean` function (analyze/route.ts:163-166 post-edit). CC adapted by introducing `insufficientFlywheelCache: Set<string>` BEFORE the `sheetSkipHC` declaration and modifying `sheetSkipHC` to consult it. The downstream `sheetsNeedingHC` filter at line 145 then naturally routes insufficient-cache sheets through fresh-LLM HC. Architect override pattern per DIAG-050 dispatch precedent: adaptive code-resolution when directive placeholder name diverges from actual scope is operative.

2. **Directive §5 example targeted `classification_signals` table with `signal_type='flywheel'` filter.** The actual flywheel cache lives in `structural_fingerprints` table (per `fingerprint-flywheel.ts:45`); `classification_signals` is the signal-write audit surface, not the cache. CC adapted the cache-clear probe to use `structural_fingerprints` and probed the table's actual column inventory (`fingerprint_hash`, `classification_result` jsonb, `column_roles` jsonb, `match_count`, `confidence`) before constructing the SELECT/DELETE. The directive's "adjust table/column names if the actual schema differs (per VG/VP schema reference)" clause anticipated this.

3. **No `unsafe-non-null-assertion` cleanup needed.** The `fb.columnRole!` non-null assertion at `analyze/route.ts:225` is safe by construction: the `insufficientFlywheelCache` gate guarantees every binding reaching the flywheel-injection loop carries a defined native `columnRole`. ESLint did not flag it; if it had, the adapter would be to widen the type to `columnRole?: NativeColumnRole` on the destructure and use an early-continue.

4. **Layer 2 (analyzeSplit sensitivity) closes structurally — no code change.** Per DIAG-050 §6.3 and the IRA Option 6 reasoning, with Layer 1 closed the flywheel-replay path emits the same `HeaderInterpretation` shape as fresh-LLM, so `computeFieldAffinities` sees identical HC inputs regardless of arm. Adjacent-Arm Drift (T1-E952) for this defect class closes by construction. The Layer 2 surface (`negotiation.ts:analyzeSplit`) is unchanged in this HF; further evolution of the PARTIAL split heuristics is forward work if architect dispositions it.

5. **CRP flywheel cache cleared before any post-HF-236 import.** The pre-HF-236 cache held bindings written without native `columnRole` (because the flywheel-write enrichment ships in this HF). On first CRP re-import after HF-236 lands, no Tier-1 hits exist (cleared), so all sheets flow through fresh-LLM HC. The Phase-2 flywheel-write update then caches native `columnRole` for the next replay. The `insufficientFlywheelCache` gate's log line will NOT fire on the first re-import; it will fire only if a future write somehow produces non-native bindings (defensive against future regressions).

## Architect override noted

This HF preserves the **DIAG-050 dispatch architect-override precedent** for: (a) adaptive code-resolution when directive placeholder names diverge from actual scope (item 1 above) and (b) schema-name adaptation when directive examples target adjacent tables (item 2 above). Both adaptations are surfaced verbatim in Known Issues so the architect retains disposition authority and an audit trail.

No other deviations from the HF-236 dispatch directive.

## Next steps

CC halts at PR creation per directive §6. Architect:

1. **Clean-slate CRP tenant** (remove `committed_data`, `entities`, `rule_sets`, `structural_fingerprints` rows for tenant `e44bbcb1-...`; preserve auth + tenant rows).
2. **Re-import all 4 CRP sales files** via the UI / `execute-bulk` path.
3. **Verify** `committed_data.row_data` carries all 11 source columns (`date, quantity, sales_rep_id, sales_rep_name, customer_name, product_category, product_name, transaction_id, total_amount, unit_price, order_type`); verify `committed_data.metadata.semantic_roles` carries the agent's claimed-binding subset (likely 5 for transaction under PARTIAL, full set under FULL).
4. **Run Pass-4 categorical-filter derivation** for CRP Plans 2/3/4. Verify filtered derivations land on `product_category` / `order_type`.
5. **Reconcile** CRP commission output against **$566,728.97 pre-clawback**.

After reconciliation passes, architect merges PR #416. After merge, Wave 2 dispatch (A5, A6 substrate amendments — `T2-E09` consolidated extension + `T2-E30` extension cross-referencing `IGF-T2-E47`) can proceed.
