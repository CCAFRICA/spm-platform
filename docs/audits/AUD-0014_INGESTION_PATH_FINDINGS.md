# AUD-0014 — INGESTION PATH CAPABILITY AUDIT — FINDINGS

## Status: COMPLETE (read-only; no code changed, no migration, no DB write, no PR)
## Capability audited: ingest ANY file, ANY format, MULTI-FILE, MULTI-SHEET, in ONE import
## HEAD SHA: `c75ad63d060fbee58e22c71050d7064364bf53d9` (branch `dev`)
## Date: 2026-05-30

> Read-only audit. Evidence is pasted (Rule 27), grounded in the actual code path at HEAD
> (Rule 21). The auditor names the defect CLASS (SR-34), maps to the multi-file P1 lineage
> without renumbering, and recommends ONE remediation sequence for architect disposition.
> No HF authored here.

## Confirmed file paths (all present at HEAD)
```
web/src/app/operate/import/page.tsx                   (534)
web/src/app/api/import/sci/analyze/route.ts           (675)
web/src/app/api/import/sci/analyze-document/route.ts  (274)
web/src/app/api/import/sci/execute-bulk/route.ts      (755)
web/src/lib/sci/plan-interpretation.ts                (585)
web/src/lib/sci/flywheel-signal-emission.ts           (197)
web/src/app/api/import/sci/process-job/route.ts       (401)
web/src/lib/compensation/plan-comprehension-emitter.ts (144)
```

---

## 1 — EXECUTIVE SUMMARY

The §1.1 capability (N mixed-format files, any classification, one import, each parsed by
its own format, all classified + executed + signalled) is **NOT met**. Classification is
substantially multi-file/multi-sheet capable; **transport and execute collapse to a single
XLSX-shaped file**. The HF-239 unification is the regressing event.

Highest-value cross-finding: **HF-255 (PR #443, merged) is necessary but not sufficient.**
It routes a document plan to `execute-bulk` with a `storagePath`, but `execute-bulk` runs
`XLSX.read` **unconditionally** (route line 165) before the plan arm (line 213) — so the
Meridian PDF/PPTX plan now fails at the parse, not at the storagePath guard. The pending
HF-255 EPG-1/2 would FAIL at C2. C2 is the immediate next blocker on the same witness.

### Severity counts
| Severity | Count | Finding IDs |
|---|---|---|
| S1 — capability-blocking | 4 | F-AUD-01 (multi-file transport), F-AUD-02 (unconditional XLSX parse), F-AUD-03 (no document-data extraction), F-AUD-04 (first-file-only routing / single-document analyze) |
| S2 — partial | 1 | F-AUD-05 (mixed-format proposal disjoint) |
| S3 — moat/degradation | 1 | F-AUD-06 (documents accrue no structural-fingerprint signal) — architecture flag |
| S4 — latent/robustness | 1 | F-AUD-07 (dual classification paths analyze vs process-job, both XLSX-only; AP-17) |

---

## 2 — DIMENSION MATRIX (stage × D1–D6)

D1 Format · D2 Multiplicity · D3 Classification · D4 Multi-sheet · D5 Signal/Moat · D6 Korean Test
Verdicts: PASS / DEFECT-Sn / N/A. Finding ID in parens.

| Stage | D1 Format | D2 Multi-file | D3 Classif. | D4 Multi-sheet | D5 Signal | D6 Korean |
|---|---|---|---|---|---|---|
| **Upload** (page.tsx) | PASS (HF-255: all `rawFile` upload) | DEFECT-S1 (01: singular `storagePath` derived) | PASS | PASS | N/A | PASS (keys on `rawFile`/`documentBase64` structural) |
| **Route decision** (page.tsx) | DEFECT-S1 (04: `isDocument`=files[0] only) | DEFECT-S1 (04) | N/A | N/A | N/A | PASS |
| **Analyze** (analyze + analyze-document) | DEFECT-S2 (05: two disjoint routes) | PASS for sheets (loops files[]) / DEFECT-S1 for documents (04: analyze-document single-doc) | PASS (5-class map) | PASS (per-sheet units) | N/A | PASS |
| **Execute** (execute-bulk) | DEFECT-S1 (02: unconditional XLSX.read) | DEFECT-S1 (01: one `storagePath`/call) | DEFECT-S1 (03: data units XLSX-only) | PASS (04 sheet-match + single-sheet fallback) | PASS for XLSX data (emitFlywheelSignals) | PASS |
| **Extraction** (plan-interpretation) | PASS (ext dispatch pdf/pptx/docx/xlsx) | N/A | DEFECT-S1 (03: plan-only; data units cannot reuse) | PASS | PASS (comprehension signals) | DEFECT-S4 (keys on file extension — see F-AUD-08 note) |
| **Signals** (flywheel + plan emitter) | DEFECT-S3 (06: fingerprint moat XLSX-only) | DEFECT-S1 (downstream of 01: fires per reached file) | partial | PASS | DEFECT-S3 (06) | PASS |
| **Async worker** (process-job) | DEFECT-S4 (07: XLSX-only classify worker) | PASS (per-file jobs) | PASS | PASS | PASS (writes fingerprint/classification) | PASS |

---

## 3 — FINDINGS

### F-AUD-01: Multi-file transport ceiling — singular `storagePath` to execute

| Attribute | Value |
|---|---|
| Severity | **S1** |
| Dimensions | D2 (multiplicity) |
| Stage | upload → execute |
| Files + lines | `page.tsx:322`, `:493`; `execute-bulk/route.ts:96,117,119,143-146` |
| Evidence | `page.tsx:322  const storagePath = Object.values(storagePaths)[0] \|\| undefined;` · `page.tsx:493  storagePath={state.storagePath}` · `execute-bulk:93 interface BulkRequest { ... :96 storagePath: string; }` · `:117 const { proposalId, tenantId, storagePath, contentUnits } = body;` · `:144 .download(storagePath);` |
| Capability impact | File #2..#N never reach execute. The `storagePaths` map IS built per-file (page.tsx:136) and passed (`:494`), but execute consumes the singular first path only; execute-bulk downloads exactly one file per call. Multi-file import is structurally impossible at transport. |
| Root cause | HF-239 collapsed transport to a single `storagePath`; the per-file `storagePaths` map exists upstream but is never threaded as an array through execute. |
| Maps to | Multi-file P1 lineage (F07 / CLT111-F3 / CLT111-F8 / CLT102-F44 / CLT109-F15) — this is the transport root of that lineage. SUBSUMES the transport slice; does not renumber. |
| Remediation shape | Thread `storagePaths` (array/map) through `SCIExecution` → `execute-bulk`; download + parse per file; key `sheetDataMap` per (file, sheet). |

### F-AUD-02: Unconditional `XLSX.read` before plan dispatch (document formats throw)

| Attribute | Value |
|---|---|
| Severity | **S1** |
| Dimensions | D1 (format) |
| Stage | execute |
| Files + lines | `execute-bulk/route.ts:160-181`, parse precedes plan arm at `:213` |
| Evidence | `:160 const XLSX = await import('xlsx'); :161 const buffer = await fileData.arrayBuffer(); :165 const workbook = XLSX.read(buffer, { type: 'array' });` (no try/catch, no extension guard) · `:173 for (const sheetName of workbook.SheetNames) {` · plan dispatch only later: `:213 if (planUnits.length > 0) { :215 const batchResults = await executeBatchedPlanInterpretation(...) }` |
| Capability impact | A PDF/PPTX/DOCX file 500s at `XLSX.read` ("Could not find workbook") **before** reaching the format-aware plan arm. **Directly defeats HF-255**: the document plan now arrives with a valid `storagePath` (HF-255) but dies at line 165. Document plans AND document data both blocked here. |
| Root cause | HF-239 assumed every execute file is an XLSX workbook; the parse is a precondition of the whole route, not gated by format/classification. |
| Maps to | C2 (directive). New (not in P1 lineage). |
| Remediation shape | Gate the workbook parse: parse XLSX only for spreadsheet files; for a plan-only / document file, skip the route-level parse and let the plan arm self-extract by extension (the extractor already exists — F-AUD-pos-2). |

### F-AUD-03: No format-aware extraction for DATA units (document data has no path)

| Attribute | Value |
|---|---|
| Severity | **S1** |
| Dimensions | D1 × D3 (format × classification) |
| Stage | execute / extraction |
| Files + lines | `execute-bulk/route.ts:389-410` (`processContentUnit` switch); data read from `sheetDataMap` `:238,:311` |
| Evidence | `:401 switch (unit.confirmedClassification) { :402 case 'entity': return processEntityUnit(...rows...) :404 case 'target': return processDataUnit(...rows...,'target'...) :406 case 'transaction': return processDataUnit(...rows...,'transaction'...) :408 case 'reference': return processReferenceUnit(...rows...) :410 case 'plan': ... }` · `rows` are sourced from `:238 let sheetData = sheetDataMap.get(tabName);` (XLSX parse only). Only `case 'plan'` self-extracts by format. |
| Capability impact | A document DATA file — a PDF transaction export, a DOCX roster, a PPTX entity list — has NO extraction path. Even past F-AUD-02, a document data unit would have empty `rows`. The single largest missing capability: document data ingestion does not exist. |
| Root cause | HF-239's data-unit pipelines read exclusively from the route's XLSX `sheetDataMap`; only the plan pipeline (`plan-interpretation.ts`) was given format-aware extraction. |
| Maps to | C3 (directive). New. |
| Remediation shape | Extract `plan-interpretation`'s download+extract-by-ext into a shared format-aware extractor; data-unit pipelines obtain rows/text from it for document formats (PDF/DOCX table extraction is the hard part). |

### F-AUD-04: First-file-only route decision + single-document analyze

| Attribute | Value |
|---|---|
| Severity | **S1** |
| Dimensions | D1 × D2 (format × multiplicity) |
| Stage | route decision / analyze |
| Files + lines | `page.tsx:143-144,:219-228`; `analyze-document/route.ts:85-92,:184-188` |
| Evidence | `page.tsx:143 const firstFile = files[0]; :144 const isDocument = !!firstFile?.parsedData.documentBase64;` · `:219 if (isDocument) { fetch('/api/import/sci/analyze-document', ... :225 fileName: firstFile.parsedData.fileName, :226 fileBase64: firstFile.parsedData.documentBase64, ... }` (firstFile ONLY) · `analyze-document:85 const { tenantId, fileName, fileBase64, mimeType } = body` (one document/call) → `:188 const contentUnit: ContentUnitProposal = {...}` (one unit). |
| Capability impact | (a) The entire import's route is decided by `files[0]`. (b) If `files[0]` is a document, ONLY `firstFile` is analyzed — files #2..N (documents or sheets) are uploaded but never classified. (c) `analyze-document` handles one document per call; multiple document files in one import collapse to the first. |
| Root cause | HF-239's single-file assumption; the document ANALYZE route was never made N-file. |
| Maps to | Multi-file P1 lineage (document slice) + C-class. |
| Remediation shape | Per-file route decision; loop document files through `analyze-document` (or a batched variant); merge document + spreadsheet content units into ONE proposal (see F-AUD-05). |

### F-AUD-05: Mixed-format produces disjoint analyze routes (no merged proposal)

| Attribute | Value |
|---|---|
| Severity | **S2** |
| Dimensions | D1 × D2 |
| Stage | analyze |
| Files + lines | `page.tsx:219-260` (the `if (isDocument) … else …` fork) |
| Evidence | `:219 if (isDocument) { … analyze-document (firstFile) … proposal = await res.json(); } :237 else { const analysisFiles = files.map(f => ({ ... sheets: f.parsedData.sheets... })); … fetch('/api/import/sci/analyze', { files: analysisFiles }) … }` — the two branches are mutually exclusive and each produces its OWN `proposal`; they never combine. A document in the `else` branch is sent to `analyze` as `sheets:[{sheetName:'Document',columns:[],rows:[],...}]` (empty stub from SCIUpload). |
| Capability impact | A mixed set (e.g. plan PDF + transaction XLSX) cannot produce one proposal. Document-first → only the document analyzed; spreadsheet-first → documents sent as empty tabular stubs and mis/under-classified. |
| Root cause | Two analyze surfaces (`analyze` tabular, `analyze-document` document) with an XOR fork keyed on `files[0]`; no unification. |
| Maps to | C-class; AP-17 (two analyze paths). |
| Remediation shape | One analyze orchestration that dispatches each file to its format's analyzer and merges all content units into a single proposal. |

### F-AUD-06: Documents accrue no structural-fingerprint moat (ARCHITECTURE FLAG — not decided)

| Attribute | Value |
|---|---|
| Severity | **S3** |
| Dimensions | D5 (signal/moat) |
| Stage | signals |
| Files + lines | `flywheel-signal-emission.ts:73`; `analyze-document/route.ts` (no fingerprint computed) |
| Evidence | `flywheel-signal-emission.ts:73 if (!unit.structuralFingerprint) continue;` — flywheel/foundational/domain/fingerprint signals require a structural fingerprint. `analyze-document` builds its content unit (`:188`) with no `structuralFingerprint`. Plans instead emit `comprehension:plan_interpretation` via `emitPlanComprehensionSignals` (`plan-interpretation.ts:277,:558`) — transport-independent. |
| Capability impact | A document PLAN accrues the comprehension moat but NOT the fingerprint/foundational/domain moat. A document DATA unit (once F-AUD-03 is fixed) would accrue NO flywheel signal unless a fingerprint is computed for documents. Whether this is intended (documents are non-tabular; structural fingerprint is a tabular concept) or a gap is an **architecture decision**, flagged here, not decided. |
| Root cause | The structural fingerprint is a tabular-shape signal; documents have no tabular shape. |
| Maps to | Vertical Slice "signals are part of the slice"; Design-Gate question. |
| Remediation shape | Architect Design Gate: define the document moat (e.g. a document-structure fingerprint, or accept comprehension-signal-only for documents). Do not silently leave document data signal-less. |

### F-AUD-07: Dual classification paths (sync `analyze` vs async `process-job`), both XLSX-only

| Attribute | Value |
|---|---|
| Severity | **S4** |
| Dimensions | D1 (format) / AP-17 |
| Stage | analyze / async worker |
| Files + lines | `page.tsx:196` (fires process-job), `:248` (fires analyze); `process-job/route.ts:94-96`; `analyze/route.ts:88` |
| Evidence | `process-job:94 const XLSX = await import('xlsx'); :96 const workbook = XLSX.read(buffer, { type: 'array' });` (unconditional, XLSX-only; same shape as F-AUD-02) — `process-job` is a CLASSIFY-only async accelerator (`:6 "checks flywheel → classifies → updates job status"`; status ends `'classified'` `:388`, no data commit). Two classification implementations exist: synchronous `analyze/route.ts` (`:88 for (const file of files)`) and async `process-job`. Both parse XLSX only. |
| Capability impact | Documents are excluded from the async path by `page.tsx:149 if (!isDocument && spreadsheetFiles.length > 0)`, so they always take the slower sync `analyze-document`. Two classifiers to keep in sync is an AP-17 maintenance/divergence risk; not capability-blocking today. |
| Root cause | OB-174 async classification accelerator added beside the sync analyze without format unification. |
| Maps to | AP-17. |
| Remediation shape | Long-term: one classification surface dispatching by format; or explicitly scope `process-job` as the spreadsheet-only fast path with the sync path as the universal one. Low priority relative to S1s. |

---

## 4 — POSITIVE FINDINGS (the PRESERVE set — remediation must not break these)

### ✅ F-AUD-pos-1: Multi-file/multi-sheet classification survives at `analyze`
`analyze/route.ts:88 for (const file of files) { ... }` · `:562 sourceFiles: files.map(f => f.fileName)` · per-sheet content units with `sourceFile`/`tabName`. Classification is genuinely multi-file/multi-sheet — the collapse is downstream (transport/execute), not here.

### ✅ F-AUD-pos-2: Format-aware extraction exists (plan pipeline) — the reuse surface
`plan-interpretation.ts:53 const ext = storagePath.split('.').pop()?.toLowerCase();` → `:59 pdf`, `:63 xlsx/xls`, `:104 pptx`, docx. Downloads from `storagePath` (`:38`). This is the one working any-format extractor; remediation for F-AUD-03 should extract/reuse it rather than build anew.

### ✅ F-AUD-pos-3: Plan comprehension signal emission is transport-independent
`plan-interpretation.ts:277,:558 emitPlanComprehensionSignals(...)` → `plan-comprehension-emitter.ts:116 signalType: 'comprehension:plan_interpretation'` / `:130 [PlanComprehensionEmitter] Emitted N …`. The moat accrues for any plan that reaches the plan pipeline, regardless of format. (Gated only by F-AUD-02 reaching the arm.)

### ✅ F-AUD-pos-4: HF-255 upload decoupling (documents reach Storage)
`page.tsx:110 const uploadableFiles = files.filter(f => f.rawFile);` drives the `ingestion-raw` upload — documents now obtain a storagePath. (Necessary precondition; F-AUD-02 is the next blocker.)

### ✅ F-AUD-pos-5: Single-file XLSX happy path + multi-sheet routing
`execute-bulk:238-257` sheet match by `tabName` with case-insensitive + single-sheet fallback (`:249 if (sheetDataMap.size === 1)`); BCL-proven. Must remain byte-identical.

### ✅ F-AUD-pos-6: HF-254 classification flywheel unaffected
This audited path does not touch the classification/flywheel surface HF-254 merged; no regression observed in the probes.

---

## 5 — THE DEFECT CLASS STATEMENT (SR-34)

**Class: the HF-239 single-file-XLSX execute collapse.** HF-239 unified import transport
onto one Storage-based `execute-bulk` invocation that (a) carries exactly ONE `storagePath`
per call (F-AUD-01), (b) parses that file as an XLSX workbook unconditionally before any
classification dispatch (F-AUD-02), and (c) feeds every data-unit pipeline exclusively from
that XLSX parse (F-AUD-03) — while the client route decision and document ANALYZE path were
left single-file/first-file (F-AUD-04/05). The capability that regressed (OB-133 / HF-129–133
/ HF-140–142: N mixed-format files, any classification, each parsed by its own format) is
not several independent bugs but ONE class with these surfaces, plus the moat-coverage
question for documents (F-AUD-06) and a latent dual-classifier AP-17 (F-AUD-07).
Remediation must close the class, not patch a surface; in particular, **C2 (F-AUD-02) is the
unaddressed blocker that makes HF-255's merged transport fix non-functional end-to-end for
the document witness.**

---

## 6 — RECOMMENDED REMEDIATION SEQUENCE (architect dispositions; CC authors no HF)

Ordered by dependency and value. Each names the files, the preserve set, and the dependency.

1. **HF-α — Format-gate the execute parse (closes F-AUD-02).** In `execute-bulk/route.ts`
   gate the route-level `XLSX.read` (lines 160-181): parse the workbook only for spreadsheet
   files; for a plan/document file, skip the parse and let the plan arm self-extract
   (F-AUD-pos-2). *Touches:* `execute-bulk/route.ts:160-185` (+ the per-unit loop's
   `sheetDataMap` reads must tolerate an empty map for document-only imports). *Must not
   break:* F-AUD-pos-5 (XLSX happy path), F-AUD-pos-3 (plan signals). *Depends on:* nothing —
   ship first; it completes HF-255 and unblocks the Meridian document-plan witness
   (HF-255 EPG-1/2). **Smallest, highest immediate value.**

2. **HF-β — Document-data extraction (closes F-AUD-03).** Extract `plan-interpretation`'s
   download+extract-by-ext into a shared format-aware extractor; wire data-unit pipelines
   (entity/transaction/target/reference) to obtain rows/records from it for document formats.
   *Touches:* a new shared extractor (from `plan-interpretation.ts:30-130`),
   `execute-bulk` `processContentUnit` (`:389-410`) + the row-resolution block (`:234-320`).
   *Must not break:* F-AUD-pos-1, pos-2, pos-5. *Depends on:* HF-α (parse must be gated
   first). Largest scope (PDF/DOCX table extraction); a Design Gate on extraction fidelity
   is advisable.

3. **HF-γ — Multi-file transport (closes F-AUD-01, F-AUD-04, F-AUD-05).** Thread
   `storagePaths` as an array/map end-to-end; per-file download+parse in `execute-bulk`;
   per-file route decision and a merged proposal across `analyze` + `analyze-document`.
   *Touches:* `page.tsx:143-144,:219-260,:322,:493-494`; `execute-bulk` request shape
   (`:93-96`) + download (`:143-181`); `analyze-document` N-file. *Must not break:*
   F-AUD-pos-1 (classification already multi-file), pos-5 (single-file path). *Depends on:*
   HF-α + HF-β (each file must parse by its own format before N files are meaningful).
   **Subsumes the multi-file P1 lineage transport slice** (§7).

4. **HF-δ (Design Gate, not an HF yet) — Document moat decision (F-AUD-06).** Architect
   decides whether documents accrue a non-fingerprint moat (document-structure fingerprint)
   or comprehension-signal-only is intended. Evidence in F-AUD-06. *Depends on:* HF-β
   (document data must exist before its moat is defined).

5. **(Backlog) — Dual-classifier unification (F-AUD-07).** Low priority; S4.

---

## 7 — MAPPING TO THE MULTI-FILE P1 LINEAGE (mapped, NOT renumbered)

- **F07 / CLT111-F3 / CLT111-F8 / CLT102-F44 / CLT109-F15** (multi-file plan/import transport):
  **subsumed by F-AUD-01 + F-AUD-04/05**, remediated by **HF-γ**. The root is the singular
  `storagePath` (page.tsx:322) + one-file-per-`execute-bulk` (`:96`) + first-file route
  decision (page.tsx:144). These lineage items are MAPPED to F-AUD-01/04/05 here; they are
  NOT renumbered or closed by this audit.
- F-AUD-02 (unconditional XLSX parse) and F-AUD-03 (document-data extraction) are **new**
  surfaces of the same class, not in the prior lineage.
- Registry check: no existing `VIALUCE_CLT_FINDINGS_REGISTRY` entry was found to already
  cover F-AUD-02/03 (the C2/C3 surfaces); they are first recorded here.

---

## COMPLIANCE CHECKLIST
- [x] HEAD SHA recorded (`c75ad63d`); all probed files confirmed.
- [x] Probes A–F executed; every code excerpt pasted (Rule 27), grounded at HEAD (Rule 21).
- [x] 6×stage dimension matrix filled with verdict + finding ID per cell.
- [x] Numbered F-AUD findings (7) with pasted evidence; positive/preserve set (6) recorded.
- [x] Defect-class statement (SR-34) naming the class + its surfaces.
- [x] ONE recommended remediation sequence (HF-α…δ) with files, preserve set, dependencies.
- [x] Multi-file P1 lineage mapped, not renumbered.
- [x] No code changed; no migration; no DB write; no PR. Read-only.

*AUD-0014 — read-only. The capability is regressed to a single-file XLSX path (HF-239 class).
C2 (F-AUD-02) is the immediate blocker that makes HF-255 non-functional for documents;
recommend HF-α first. Architect dispositions the sequence; no HF authored here.*
