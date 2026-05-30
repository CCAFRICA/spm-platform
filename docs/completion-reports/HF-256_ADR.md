# ARCHITECTURE DECISION RECORD — HF-256

*Restore Universal File Ingestion (Decision 82) — Document Plans, Multi-File, Mixed-Format*
*Standing Rules Section B — committed BEFORE any implementation code.*

```
ARCHITECTURE DECISION RECORD — HF-256
=====================================
Problem: HF-239 collapsed Decision 82's universal file ingestion (any format, multi-file,
one surface; documents -> Plan Agent; tabular -> data agents) into a single-file,
spreadsheet-shaped execute path. Four regressions: (1) document plans crash at an
unconditional workbook parse before reaching the Plan Agent; (2) only the first file's
storage location reaches execute, so multi-file is impossible; (3) the route decision is
first-file-only and document analyze is single-document; (4) mixed-format imports produce
disjoint proposals.

Decision: Restore Decision 82 within the unified Storage transport, comprehensively:
  - Format-aware execute: execute resolves each file's format and processes it by that
    format. Spreadsheet files are workbook-parsed (as today). Document files are NOT
    workbook-parsed; their plan unit is routed to the existing format-aware plan pipeline
    (plan-interpretation), which self-extracts by format and emits comprehension signals.
  - Multi-file transport: the per-file storage-location map is threaded end-to-end
    (page.tsx -> SCIExecution -> execute-bulk). Execute processes EACH file: download it,
    resolve its format, parse-or-route accordingly; plan interpretation runs per plan file
    (each plan file -> its own rule set, the OB-103 proven shape); data units execute against
    their file's parsed sheets.
  - Per-file route + unified proposal: the route decision is per-file, not files[0]. Each
    file is dispatched to its format's analyzer (documents -> analyze-document, tabular ->
    analyze); ALL content units merge into ONE proposal for the import.

Scope line (Decision 82, DS-005): documents are PLAN sources only. This HF adds NO
document-as-data extraction. Document-as-data is out of scope.

CHOSEN: comprehensive restoration of Decision 82 (above). Documents -> Plan Agent via the
existing plan extractor; tabular -> data agents via workbook parse; multi-file via per-file
download+route; mixed-format via unified proposal. One transport, one surface (AP-17).

REJECTED — spot-fix the workbook parse only. Restores document plans but leaves multi-file
and mixed-format broken. This is the fragmented spot fix the restoration explicitly is not.

REJECTED — re-legitimize request-body file bytes (documentMetadata.fileBase64) at execute.
Re-introduces AP-1 body transport and a second path (AP-17 regression).

REJECTED — add document-as-data extraction (PDF/DOCX -> transaction/entity records).
Violates Decision 82 (documents -> Plan Agent) and DS-005 (documents = plan/supporting docs).
Out of scope.

Scale 10x: per-file Storage download, no body row transport. PASS.
Korean Test: format dispatch by structural format, no new literal. PASS.
Single pipeline: one surface, one transport, format handled within. PASS (AP-17).
Vertical slice: document plan + multi-file + mixed-format + signals + calc in one PR. PASS.
```

## DECISION on the Phase-5 multi-document analyze choice (ADR-required)
`analyze-document` is invoked **once per document file from the client** and the resulting
content units are merged into the single proposal client-side (alongside the tabular
`analyze` output). Rationale: it reuses the proven single-document `analyze-document`
contract unchanged (DD-7), avoids a server-side N-document refactor, and the merge point
(client `handleAnalyze`) already holds all files. Per-file calls run concurrently.

## GOVERNING PRINCIPLES EVALUATION (Decisions 123 & 124)
```
G1 - Standard: Decision 82 (locked universal-ingestion design) + AP-17 single transport +
     Korean Test (AP-25). No numeric/financial standard governs the transport shape.
G2 - Architectural Embodiment: ONE Storage transport carries every format; execute resolves
     format per file and routes documents to the Plan Agent, spreadsheets to the workbook
     parse — format handled WITHIN the single path, structurally (not a second path).
G3 - Traceability: per-file storage map flows page.tsx -> SCIExecution -> execute-bulk;
     each content unit carries its sourceFile; auditable end-to-end.
G4 - Discipline: transport unification / format-dispatch; the defect was a single-file
     XLSX assumption baked into a shared route. Per-file format resolution is the fix.
G5 - Abstraction: "one ingestion surface resolves each item's format and routes by it" is
     domain-universal.
G6 - Innovation Boundary: restoration of a locked, proven design (Decision 82 / OB-133);
     no new concept; reuses the existing plan extractor + comprehension emitter.

Relevant gates G2,G3,G4,G5 pass; G1/G6 identified/satisfied.
```

## SCOPE BOUNDARY (DD-7 / SR-38)
PRESERVE byte-identical: single-file XLSX path (EPG-4), tabular data commit (EPG-5),
multi-file classification at `analyze`, analyze-phase document classification, plan
self-extraction + comprehension emission, `process-job` worker, HF-254 surface.
OUT OF SCOPE: document-as-data extraction, document fingerprint moat, async-classifier
unification.
