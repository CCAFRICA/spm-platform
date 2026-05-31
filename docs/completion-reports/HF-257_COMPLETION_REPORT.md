# HF-257 COMPLETION REPORT

*Enforce Single Plan-Interpretation Pipeline (AP-17)*

## Date / Execution Time
2026-05-30, single CC session.

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| `27d241c4` | 1 | Architecture Decision Record (+ directive, Rule 29) |
| `a537735e` | 2+3 | Pre-edit enumeration + fold-or-drop analysis (report only) |
| `3dbf1518` | 4 | Remove duplicate per-unit plan path; harden batched catch |
| (this commit) | 5 | Completion report + build (incl. dead `storagePath` param cleanup) |

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
| EPG-3 | Single plan pipeline confirmed: `executePlanPipeline` is deleted; the only plan-interpretation function is `executeBatchedPlanInterpretation`; no caller of the removed function remains | **PASS** | grep below |
| EPG-4 | Non-plan pipelines untouched — target/transaction/entity/reference imports still classify and commit | PENDING — architect-run | live (preserved-by-construction; arms unchanged) |
| EPG-5 | Korean Test — zero new hardcoded format/language/domain literals (removal only) | **PASS** | grep below |
| EPG-6 | `npm run build` exits 0 (incl. korean-test gate); `tsc --noEmit` clean (no dangling refs); `localhost:3000` responds | **PASS** | output below |
| EPG-7 | Document-plan import end-to-end still works through the single path (no regression of HF-256) | PENDING — architect-run | live |
| EPG-8 | Batched-throw safety: if the batched path throws, the affected plan units are reported as explicit failures (not silently dropped, not re-interpreted by a duplicate) | **PASS** (code) | code below |

### EPG-3 (PASS)
```
$ grep -rnE 'executePlanPipeline\(' web/src --include='*.ts'
ZERO calls/definitions — PASS (single plan pipeline)
$ grep -nE '^export (async )?function' web/src/lib/sci/plan-interpretation.ts
26:export async function executeBatchedPlanInterpretation(   ← the ONLY plan-interpretation function
```
The `case 'plan'` switch arm no longer calls a plan interpreter — it returns an explicit
failure (any plan unit reaching it is unexpected, since the batched dispatch marks all plan
units handled). Remaining `executePlanPipeline` text matches are comments only.

### EPG-5 (PASS)
```
$ grep -rnE '"(pdf|pptx|docx|xlsx|BCL|Meridian|Periodo)"' web/src/app/api/import/sci/execute-bulk/route.ts
ZERO new literals in execute-bulk — PASS
```
Removal only; no format/language/domain literal introduced.

### EPG-6 (PASS)
```
$ rm -rf .next && npm run build
[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry
 ✓ Compiled successfully
BUILD_EXIT=0
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
307
```
`tsc --noEmit`: 0 errors. **Build-surfaced cleanup:** removing the `case 'plan'` call left the
`processContentUnit` `storagePath` parameter unused (`@typescript-eslint/no-unused-vars`
error); the dead parameter + its argument were removed (only the deleted plan arm used it;
the four data pipelines bind by parsed rows).

### EPG-8 (PASS — code)
The batched dispatch catch now records explicit per-unit failures (and marks them handled)
rather than relying on the removed duplicate:
```ts
} catch (err) {
  console.error(`[SCI Bulk] Batched plan interpretation threw for ${planPath} (units reported as failures):`, err);
  for (const pu of group) {
    results.push({ contentUnitId: pu.contentUnitId, classification: 'plan', success: false,
      rowsProcessed: 0, pipeline: 'plan-interpretation',
      error: `Batched plan interpretation failed: ${err instanceof Error ? err.message : String(err)}` });
    handledPlanUnitIds.add(pu.contentUnitId);
  }
}
```
And the `case 'plan'` arm returns an explicit failure (never re-interprets). Note: the
batched function returns its KNOWN failures as values (download/no-content/AI/save), so this
catch fires only on an unexpected runtime throw.

## PROOF GATES — SOFT
(n/a)

## STANDING RULE COMPLIANCE
- **AP-17 closure:** one plan-interpretation function (`executeBatchedPlanInterpretation`);
  the per-unit duplicate is deleted (EPG-3). The single-pipeline requirement is met
  unconditionally — not gated on the duplicate's reachability (reverses HF-256's conditional).
- **SR-34:** structural close (duplicate removed), not left-unreachable.
- **DD-7 / preserved paths:** the batched plan path (single + multi-sheet) is unchanged; the
  four non-plan arms (entity/target/transaction/reference) are untouched (EPG-4).
- **AP-1:** removing the duplicate removes the execute-side `documentMetadata.fileBase64`
  CONSUMER; the field itself (analyze-document/SCIExecution) is a separate cleanup (§6A).
- **Korean Test (EPG-5):** removal only; zero new literals.
- **D.1/D.2/D.3:** per-phase commit+push; `rm -rf .next`→build(0)→dev→307; PR opened (URL below), NOT merged. ASCII commits.

## KNOWN ISSUES
1. **EPG-1/2/4/7 are architect-gated (live).** Single-sheet + multi-sheet plan imports
   (same rule_set as before), non-plan imports (still commit), document-plan end-to-end
   (HF-256 non-regression). Code shipped; architect runs + merges.
2. **`documentMetadata.fileBase64` field retirement (§6A residual).** With the duplicate
   consumer gone, the field is set (`analyze-document`) and forwarded (`SCIExecution`) but no
   longer consumed at execute by any plan path. Removing it from analyze/forward (AP-1
   Storage-only end-state) is a separate transport-cleanup item, named not done here.
3. **`plan-deferred` branch removed (dead).** It returned a deferred success only when a unit
   had neither `fileBase64` nor `storagePath`; post HF-255/256 every uploaded file has a
   storagePath, so it was dead. Removed with the duplicate.

## VERIFICATION SCRIPT OUTPUT
- EPG-3 grep (zero calls; one exported plan function), EPG-5 grep (zero new literals): above.
- Build: `BUILD_EXIT=0`, `[korean-test-gate] PASS`, `✓ Compiled successfully`. `tsc`: 0 errors. localhost: 307.
