# HF-257 COMPLETION REPORT

*Enforce Single Plan-Interpretation Pipeline (AP-17)*

## Date / Execution Time
2026-05-30, single CC session.

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| `27d241c4` | 1 | Architecture Decision Record (+ directive, Rule 29) |
| (this) | 2+3 | Pre-edit enumeration + fold-or-drop analysis (report only) |
| (pending) | 4 | Remove duplicate per-unit plan path; harden batched catch |
| (pending) | 5 | Completion report + build |

## FILES MODIFIED
| File | Change |
|---|---|
| `web/src/app/api/import/sci/execute-bulk/route.ts` | Remove `case 'plan'` dispatch + `executePlanPipeline` import; harden batched catch to record explicit plan-unit failures. |
| `web/src/lib/sci/plan-interpretation.ts` | Delete `executePlanPipeline` (the duplicate function). |

## ARCHITECTURE DECISION RECORD
See `docs/completion-reports/HF-257_ADR.md` (Phase 1, `27d241c4`). Single batched plan
pipeline; remove the per-unit plan duplicate unconditionally (reverses HF-256's conditional).

## PRE-EDIT ENUMERATION (Phase 2) — HEAD `b316d69d` (dev; includes the merged HF-256 changes)

The directive's reference line numbers (~2151/2734/2978) are from the AUD-001 concatenated
extraction; at HEAD both plan functions live in `plan-interpretation.ts` (HF-239 extracted
them) and are imported by `execute-bulk`. Resolved locations below.

### Five confirmations (all TRUE → HALT-1 does NOT fire)
- **(a) Two plan functions exist:** `plan-interpretation.ts:25 executeBatchedPlanInterpretation`, `:311 executePlanPipeline`; both imported at `execute-bulk:38-39`.
- **(b) `case 'plan'` is the ONLY caller of `executePlanPipeline`:**
  ```
  execute-bulk:455  return executePlanPipeline(  ← the only call
  execute-bulk:39   executePlanPipeline,         (import)
  execute-bulk:454  // ...mirrors the deleted execute/route.ts executePlanPipeline behavior.  (comment)
  plan-interpretation.ts:5  ...executePlanPipeline) so execute-bulk's `case 'plan'`...  (comment)
  commit-content-unit.ts:19  // ...(executePlanPipeline does not write...                (comment)
  ```
  Only `execute-bulk:455` is a call; the rest are the import + comments.
- **(c) Batched RETURNS known failures as values (does not throw):** `plan-interpretation.ts` returns failure arrays at `:42` (download), `:134` (no content extracted), `:179`, `:218`, `:257` — all `return planUnits.map(u => ({ ... error ... }))`. So the per-unit `case 'plan'` is reached only on an UNEXPECTED throw.
- **(d) Per-unit extraction DUPLICATES the batched extraction:** `executePlanPipeline` extracts PDF (`:379-382`), XLSX via sheet-walk (`:383-402`), PPTX via the JSZip slide regex `/<a:t>([^<]*)<\/a:t>/g` (`:408-426`), DOCX (`:427-432`) — the same logic the batched function uses by extension. Line-for-line duplicate.
- **(e) Four non-plan arms are sole-path:** `execute-bulk:442 case 'entity' → processEntityUnit`, `:444 case 'target' → processDataUnit`, `:446 case 'transaction' → processDataUnit`, `:448 case 'reference' → processReferenceUnit`. Only `:450 case 'plan'` is the duplicate. Untouched.

## FOLD-OR-DROP ANALYSIS (Phase 3) — finding: NO unique behavior to fold (pure removal)

What `executePlanPipeline` does that the batched path does not, and the disposition of each:
- **`documentMetadata.fileBase64`-first byte source** (`:318-356`, prefers body bytes over a
  Storage download). This is the execute-side body-transport CONSUMER. Removing the duplicate
  removes this consumer. The body-transport FIELD (set in `analyze-document`, forwarded by
  `SCIExecution`) is a separate transport-cleanup item (§6/§6A) — not removed here.
- **`plan-deferred` branch** (`:358-366`, returns success/`plan-deferred` when there is
  neither `fileBase64` nor `storagePath`). Post HF-255/256 every uploaded file has a
  `storagePath`, so this branch is DEAD. Removed with the duplicate.
- **Per-unit single interpretation vs batched all-at-once.** In normal flow the per-unit
  `case 'plan'` is never reached (batched handles + marks units; the per-unit loop skips
  handled units). It is reached ONLY on an unexpected batched throw — where it would re-run
  the SAME `orchestratePerComponentInterpretation` on one unit. There is no per-sheet
  isolation benefit in normal operation; it is a dead fallback, not resilience.
- **rule_set metadata / supersede:** both paths persist via the same downstream
  (`orchestratePerComponentInterpretation` + persist); no unique behavior in the per-unit path.

**Finding: removal loses nothing.** The duplicate's only distinct features are a
body-transport consumer (being removed; field is separate cleanup), a dead `plan-deferred`
branch, and a dead per-unit fallback. **HALT-2 does NOT fire** (no genuine resilience to
fold). The only ADD in Phase 4 is hardening the batched dispatch catch to record explicit
plan-unit failures on an unexpected throw (replacing the duplicate-as-safety-net with
explicit failure reporting in the single path).

## PROOF GATES — HARD
| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |
|---|---|---|---|
| EPG-1 | Single-sheet plan import (the batched path) produces the same rule_set and the same `[PlanComprehensionEmitter] Emitted N …` as before removal | PENDING — architect-run | live |
| EPG-2 | Multi-sheet plan import (the batched path) produces the same rule_set as before removal | PENDING — architect-run | live |
| EPG-3 | Single plan pipeline confirmed: `executePlanPipeline` is deleted; the only plan-interpretation function is `executeBatchedPlanInterpretation`; no caller of the removed function remains | (pending) | grep |
| EPG-4 | Non-plan pipelines untouched — target/transaction/entity/reference imports still classify and commit | PENDING — architect-run | live |
| EPG-5 | Korean Test — zero new hardcoded format/language/domain literals (removal only) | (pending) | grep |
| EPG-6 | `npm run build` exits 0 (incl. korean-test gate); `tsc --noEmit` clean (no dangling refs); `localhost:3000` responds | (pending) | output |
| EPG-7 | Document-plan import end-to-end still works through the single path (no regression of HF-256) | PENDING — architect-run | live |
| EPG-8 | Batched-throw safety: if the batched path throws, the affected plan units are reported as explicit failures (not silently dropped, not re-interpreted by a duplicate) | (pending) | code |

## PROOF GATES — SOFT
(n/a)

## STANDING RULE COMPLIANCE
(filled at completion)

## KNOWN ISSUES
(filled at completion)

## VERIFICATION SCRIPT OUTPUT
(filled at completion)
