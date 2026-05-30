# ARCHITECTURE DECISION RECORD — HF-255

*Restore Unified Any-Format Plan Import (Document Transport Regressed by HF-239)*
*Standing Rules Section B — committed BEFORE any implementation code.*

```
ARCHITECTURE DECISION RECORD — HF-255
=====================================
Problem: HF-239 unified the import transport onto Storage (execute-bulk) but the
client Storage-upload set in page.tsx (`spreadsheetFiles`, which excludes
documentBase64 files) was never widened to documents. Document-format plans
(PDF/PPTX/DOCX) therefore get no storagePath; execute-bulk's storagePath-required
guard throws. Any-format import is a regressed platform capability (OB-133).
Compounding: `spreadsheetFiles` double-serves the Storage-upload loop AND the
spreadsheet-only async processing-jobs path, so the upload set cannot simply be
widened without routing documents into the XLSX-worker path.

Decision: Restore document transport within the unified path by DECOUPLING the
upload set from the async-process set. Upload set = all files with rawFile (every
format lands in ingestion-raw). Async-process set = non-document files only
(unchanged behavior for the XLSX worker). Document plans then carry a storagePath,
flow through SCIExecution's plan branch to execute-bulk's plan arm, which downloads
by extension AND emits comprehension:plan_interpretation signals via the existing
plan-interpretation pipeline. Signals restored with no new signal wiring; verified
by EPG.

Option A (CHOSEN): decouple upload-set from async-set; all rawFile files upload to
Storage. One transport (AP-17). Signals via existing emitPlanComprehensionSignals.
  - Scale 10x: per-file upload, unaffected by row count. PASS.
  - AI-first / Korean Test: no new format/language literal. PASS.
  - Single pipeline: documents join the one Storage transport; no second execute
    path added. PASS (AP-17).
  - Vertical slice: transport + signals + calculation in one PR. PASS.

Option B (REJECTED): relax execute-bulk front-door guard to accept
documentMetadata.fileBase64. Re-legitimizes the pre-HF-239 body transport as a
permanent second path — moves AWAY from HF-239 unification; AP-1/AP-17 regression;
CWA (quotes the unified-transport principle, then carves an exception to it).

Option C (REJECTED): naive widen of page.tsx:105 to `f => f.rawFile`. Routes
document files into the spreadsheet-only async processing-jobs path (XLSX worker)
— a new defect. Fails to honor the dual-use of `spreadsheetFiles`.
```

## GOVERNING PRINCIPLES EVALUATION (Decisions 123 & 124)

```
G1 - Standard: platform AI-First / Korean Test (AP-25 / IGF-T1-E910) + AP-17 single
     transport. No numeric/financial standard governs this client transport change.
G2 - Architectural Embodiment: one Storage transport for every format structurally
     embodies "any file is read" — the upload set becomes format-agnostic (all rawFile),
     and the single execute path (execute-bulk plan arm) downloads + extracts by extension.
     Decoupling upload-set from async-set makes the XLSX-worker gate an independent concern.
G3 - Traceability: storagePath flows page.tsx upload -> storagePathsRef -> derivation ->
     SCIExecution prop -> execute-bulk; auditable end-to-end.
G4 - Discipline: transport unification / single-writer; the defect was a coupled set
     serving two concerns. Decoupling is the structural fix.
G5 - Abstraction: "a transport must carry every format the system accepts; format-specific
     downstream routing is a separate concern" is domain-universal.
G6 - Innovation Boundary: capability restoration (OB-133 worked pre-HF-239); no new concept.

Relevant gates G2,G4,G5 passed; G1/G3/G6 identified/satisfied.
```

## SCALE ANALYSIS (Standing Rule 25)
Per-file Storage upload, unaffected by row count; documents add one upload each. No
HTTP-body row transport (AP-1 — this HF moves toward Storage, not back to bodies). No
per-row DB calls. Unchanged at 10x/100x row volume.

## ANTI-PATTERN CHECK
- AP-1: the fix uploads to Storage; it does NOT extend the `fileBase64` execute body path
  (that vestige is named in §6A for separate retirement).
- AP-17: documents join the ONE Storage transport; no second execute path (Option B rejected).
- AP-5/AP-6 (Korean Test): no new format-name/language literal; `documentBase64` is an
  existing structural property set by SCIUpload, not a hardcoded extension check introduced here.
- AP-13: dual-use of `spreadsheetFiles` + `rawFile` presence on documents confirmed at HEAD (Phase 2).

## SCOPE BOUNDARY (DD-7 / SR-38)
In scope: decouple upload-set from async-set in `web/src/app/operate/import/page.tsx`.
Preserve exactly: XLSX plan import, the async processing-jobs (XLSX worker) path, the
`analyze-document` ANALYZE path, execute-bulk's guard + plan arm,
executePlanPipeline/executeBatchedPlanInterpretation/emitPlanComprehensionSignals. Out of
scope: the `documentMetadata.fileBase64` vestige (§6A), multi-file single-path collapse,
HF-254 surface.
```
