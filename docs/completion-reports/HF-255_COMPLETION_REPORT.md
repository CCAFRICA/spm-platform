# HF-255 COMPLETION REPORT

*Restore Unified Any-Format Plan Import (Document Transport Regressed by HF-239)*

## Date / Execution Time
2026-05-29, single CC session.

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `0e2bd750` | 1 | Architecture Decision Record (+ directive, Rule 29) |
| `99741255` | 3 | Decouple Storage-upload set from async-process set |
| (this commit) | 4 | Completion report + build verification |

(Phase 2 was a read-only enumeration with no code change; its evidence is embedded below
and was the gate for Phase 3. No separate Phase-2 commit was required since it produced no
file change — the enumeration is recorded here per Rule 26.)

## FILES MODIFIED

| File | Change |
|---|---|
| `web/src/app/operate/import/page.tsx` | Introduce `uploadableFiles = files.filter(f => f.rawFile)` to drive the `ingestion-raw` upload loop (all formats, incl. documents); keep `spreadsheetFiles` (non-document) gating the async processing-jobs / XLSX-worker path; async completion check made per-file. |
| `docs/completion-reports/HF-255_ADR.md` | Phase 1 ADR (new). |
| `docs/vp-prompts/HF-255_DIRECTIVE_20260529.md` | Directive (Rule 29). |

## ARCHITECTURE DECISION RECORD
See `docs/completion-reports/HF-255_ADR.md` (Phase 1, `0e2bd750`). Chosen Option A
(decouple upload-set from async-set). Rejected B (relax guard / re-legitimize body
transport — AP-1/AP-17 regression) and C (naive widen routes documents into the XLSX worker).

## PRE-EDIT ENUMERATION (Phase 2) — HEAD `0e2bd750`

### Dual-use of `spreadsheetFiles` — CONFIRMED (HALT-1 does NOT fire)
```
105: const spreadsheetFiles = files.filter(f => f.rawFile && !f.parsedData.documentBase64);
106: if (spreadsheetFiles.length > 0) {                 <- USE 1: Storage-upload loop
112:   await Promise.all(spreadsheetFiles.map(...))      <- (upload)
128:   ...${spreadsheetFiles.length} files
140: if (!isDocument && spreadsheetFiles.length > 0) {   <- USE 2: async processing-jobs gate
149:   if (Object.keys(storagePaths).length === spreadsheetFiles.length) {
155:   for (const file of spreadsheetFiles) {            <- processing_jobs creation (XLSX worker)
```
`spreadsheetFiles` is used at BOTH the upload loop AND the async-jobs gate — the dual-use
the directive §1.4 describes is present at HEAD. The fix shape (decouple) applies.

### `rawFile` present on document files — CONFIRMED
```
SCIUpload.tsx:28:  rawFile: File;   // REQUIRED field on FileInfo
SCIUpload.tsx:226:  rawFile: file,  // assigned unconditionally for EVERY parsed file
```
So `files.filter(f => f.rawFile)` includes document-parsed files.

### storagePath derivation + props (READ-ONLY confirmation — unchanged)
```
310: const storagePath = Object.values(storagePaths)[0] || undefined;
481: storagePath={state.storagePath}
482: storagePaths={state.storagePaths}
```

### Server + signal emitter (READ-ONLY — NOT edited)
```
execute-bulk/route.ts:117/143/146: storagePath required + .download(storagePath)
execute-bulk/route.ts:37-38: imports executeBatchedPlanInterpretation / executePlanPipeline
plan-interpretation.ts:275,556: emitPlanComprehensionSignals (the moat — restored by transport)
```

### Per-hit classification
| Lines | Concern | Class |
|---|---|---|
| page.tsx 105-128 (upload loop) | Storage upload set | **EDIT** → drive from `uploadableFiles` |
| page.tsx 140,149,155 (async gate/jobs) | XLSX-worker async path | **PRESERVE** (stays on `spreadsheetFiles`); line 149 made per-file (robust to wider storagePaths) |
| page.tsx 207-219 (`analyze-document`) | Document ANALYZE path | **PRESERVE** (fileBase64 legitimately needed; not edited) |
| page.tsx 310, 481-482 | storagePath derivation + props | **READ-ONLY** (works once document path is in storagePathsRef) |
| execute-bulk guard + plan arm; executePlanPipeline; emitPlanComprehensionSignals | server | **READ-ONLY / PRESERVE** (no edit) |

## PROOF GATES — HARD

| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |
|---|---|---|---|
| EPG-1 | Clean-slate document-format plan import completes: no `storagePath required` throw; unit lands `plan`; rule_set created | PENDING — architect-run | live import (`[SCI Bulk]` / plan-interp logs + rule_set id) |
| EPG-2 | Signal emission restored: `[PlanComprehensionEmitter] Emitted N comprehension:plan_interpretation signals` fires on the document import | PENDING — architect-run | live log line (moat clause) |
| EPG-3 | Upload decoupled: upload set = all `rawFile` files; async-jobs set = non-document only; no new format/language literal | **PASS** | grep below |
| EPG-4 | Non-regression: XLSX plan import still works + still uses async processing-jobs path; `analyze-document` ANALYZE path unchanged | PENDING — architect-run (preserved-by-construction; see note) | live logs |
| EPG-5 | Korean Test: zero new hardcoded format-name / language literals in the touched file | **PASS** | grep below |
| EPG-6 | `npm run build` exits 0 (incl. korean-test gate); `localhost:3000` responds | **PASS** | output below |
| EPG-7 | Document-plan tenant: data import + calculate the period; report grand total verbatim | PENDING — architect-run | `[CalcRecon-T1] grandTotal=…` |

### EPG-3 (PASS)
```
110: const uploadableFiles = files.filter(f => f.rawFile);                          <- upload set: ALL formats
111: const spreadsheetFiles = files.filter(f => f.rawFile && !f.parsedData.documentBase64);  <- async set: non-document
115: if (uploadableFiles.length > 0) { ... upload loop ...                          <- upload driven by uploadableFiles
149: if (!isDocument && spreadsheetFiles.length > 0) {                              <- async gate unchanged (non-document)
161: if (spreadsheetFiles.every(f => storagePaths[f.name])) {                       <- per-file completion (robust)
167: for (const file of spreadsheetFiles) {                                         <- processing_jobs creation unchanged
```

### EPG-5 (PASS)
```
$ grep -nE "'\.?(pdf|pptx|docx|xlsx|xls|csv|tsv)'|DOCUMENT_EXTENSIONS" web/src/app/operate/import/page.tsx
ZERO new format/extension literals in page.tsx — PASS
```
The fix keys on `f.rawFile` presence and the existing structural `documentBase64` property
(set by SCIUpload), not on any extension/format-name literal introduced here.

### EPG-6 (PASS)
```
$ rm -rf .next && npm run build
[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry
 ✓ Compiled successfully
BUILD_EXIT=0
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
307   (redirect to auth — expected; dev "✓ Ready")
```
`tsc --noEmit`: 0 errors.

### EPG-4 note (preserved-by-construction)
The async processing-jobs path is unchanged: it remains gated by `!isDocument &&
spreadsheetFiles...` and iterates `spreadsheetFiles` only. For a pure-spreadsheet import,
`uploadableFiles === spreadsheetFiles` (no documents), so the upload set, the per-file
completion check, and the jobs loop are behavior-identical to pre-HF. The `analyze-document`
ANALYZE call (page.tsx 207-219) is untouched. Live confirmation is architect-run.

## PROOF GATES — SOFT
(n/a)

## STANDING RULE COMPLIANCE
- **AP-1:** fix uploads to Storage; does NOT extend the `fileBase64` execute body path
  (vestige named in §6A for separate retirement).
- **AP-17:** documents join the ONE Storage transport; no second execute path (Option B rejected).
- **SR-34:** structural cause (coupled upload/async set) decoupled; not symptom-patched at the guard.
- **DD-7 / preserved paths:** XLSX plan import, async XLSX-worker path, `analyze-document`
  ANALYZE path, execute-bulk guard + plan arm, and the plan-interpretation emitter are all
  unedited (HALT-3 honored).
- **Vertical Slice:** import → classify → execute → **signals** (EPG-2, via existing
  emitter, restored by transport) → calculate (EPG-7) — one path, one PR.
- **Korean Test (EPG-5):** PASS. **D.1/D.2/D.3:** per-phase commit+push; `rm -rf .next` →
  build (0) → dev → localhost 307; PR **#443** (https://github.com/CCAFRICA/spm-platform/pull/443), NOT merged — architect merges after EPG-1/2/4/7. ASCII commits.

## KNOWN ISSUES
1. **EPG-1/2/4/7 architect-gated (live).** Require a clean-slate import of the document-plan
   witness tenant (Meridian `72bee86b-…`). Code shipped; architect runs + merges after pass.
2. **`documentMetadata.fileBase64` execute-time vestige (§6A):** now unused for the document
   plan path but NOT deleted here (separate retirement decision; AP-1 body transport).
3. **Multi-file single-path collapse (§6):** `Object.values(storagePaths)[0]` still takes
   only the first uploaded path; multi-file (incl. multi-file document) plans remain
   constrained by the open multi-file P1 (F07/CLT111-F8 et al.). Not addressed/renumbered.
4. **Double byte-transfer for documents (§6A):** a document plan now sends bytes to
   `analyze-document` (base64) AND uploads to Storage. Collapsing to a single upload (both
   analyze + execute read from Storage) is a larger forward platform item.

## VERIFICATION SCRIPT OUTPUT
- EPG-3 / EPG-5 greps: pasted above.
- Build: `BUILD_EXIT=0`, `[korean-test-gate] PASS`, `✓ Compiled successfully`.
- `tsc --noEmit -p tsconfig.json`: 0 errors. localhost:3000: HTTP 307.
