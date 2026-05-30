# HF-256 COMPLETION REPORT

*Restore Universal File Ingestion (Decision 82) — Document Plans, Multi-File, Mixed-Format*

## Date / Execution Time
2026-05-30, single CC session.

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| `a497950b` | 1 | Architecture Decision Record (+ directive, Rule 29) |
| (this) | 2 | Full pre-edit enumeration |
| (pending) | 3 | Format-aware execute |
| (pending) | 4 | Multi-file transport |
| (pending) | 5 | Per-file route + unified proposal |
| (pending) | 6 | Retire dead fileBase64 (conditional — see finding) |
| (pending) | 7 | Completion report + build |

## FILES MODIFIED
| File | Change |
|---|---|
| `web/src/lib/sci/file-format.ts` | NEW — canonical document-extension set + `isDocumentPath` (one literal scheme, Korean Test). |
| `web/src/app/api/import/sci/execute-bulk/route.ts` | Format-aware parse (skip workbook for documents); multi-file per-file download/route. |
| `web/src/components/sci/SCIExecution.tsx` | Thread per-file `storagePaths` to execute. |
| `web/src/app/operate/import/page.tsx` | Stop singular-collapse; per-file route; unified proposal merge. |
| `web/src/app/api/import/sci/analyze-document/route.ts` | (P5) per-file invocation / proposal merge support. |

## ARCHITECTURE DECISION RECORD
See `docs/completion-reports/HF-256_ADR.md` (Phase 1, `a497950b`). Comprehensive Decision-82
restoration. Phase-5 choice: per-file `analyze-document` calls merged client-side.

## PRE-EDIT ENUMERATION (Phase 2) — HEAD `5ad076b0` (code identical to AUD-0014's `c75ad63d`; only the audit doc was added between)

### The four regressions — CONFIRMED present (HALT-1 does NOT fire)
- **R1 (document plans crash at workbook parse):** `execute-bulk:160 const XLSX = await import('xlsx'); :165 const workbook = XLSX.read(buffer, { type: 'array' });` — unconditional, precedes plan dispatch at `:213 if (planUnits.length > 0) { :215 executeBatchedPlanInterpretation(...) }`. EDIT (Phase 3).
- **R2 (multi-file impossible):** `page.tsx:322 const storagePath = Object.values(storagePaths)[0] || undefined;` (singular) → `execute-bulk:96 storagePath: string; :117 const { ... storagePath ... } = body; :146 .download(storagePath);` (one file/call). EDIT (Phase 4).
- **R3 (first-file route + single-document analyze):** `page.tsx:143 const firstFile = files[0]; :144 const isDocument = !!firstFile?.parsedData.documentBase64;` → `:219 if (isDocument) { analyze-document(firstFile only @ :225-227) }`; `analyze-document:183 proposalId = randomUUID(); :188 contentUnit` (one doc → one unit/call). EDIT (Phase 5).
- **R4 (disjoint proposals):** `page.tsx:219-260` XOR fork → two `proposal` objects. EDIT (Phase 5).

### Foundation — CONFIRMED present (PRESERVE)
- Multi-file classification: `analyze/route.ts:88 for (const file of files)`, `:562 sourceFiles: files.map(...)`. PRESERVE.
- Format-aware plan extractor: `plan-interpretation.ts:53 const ext = storagePath.split('.').pop()`, `:59 pdf / :63 xlsx / :104 pptx`, downloads `:38`. READ-ONLY (route TO it).
- Plan comprehension signals: `plan-interpretation.ts:277,:558 emitPlanComprehensionSignals`. READ-ONLY.
- HF-255 upload set: `page.tsx:110 uploadableFiles = files.filter(f => f.rawFile)`; `SCIUpload.tsx:28 rawFile: File` (required), `:226` assigned unconditionally. PRESERVE.
- SCIExecution thread point: `SCIExecution.tsx:55 storagePaths?: Record<string,string>` already a prop; `:195 storagePath: effectivePath` sent to execute-bulk. EDIT (Phase 4: send the map).

### fileBase64 execute-time consumer finding (drives Phase 6)
`execute-bulk` declares `documentMetadata?: { fileBase64?: string }` (`:90`) but does not read it directly. However:
- `analyze-document:240-241` SETS `documentMetadata.fileBase64` on each document proposal unit.
- `SCIExecution.tsx:252,:317` FORWARDS `documentMetadata` into the execute-bulk request.
- `plan-interpretation.ts:318-322 executePlanPipeline`: `const docMeta = unit.documentMetadata; let fileBase64 = docMeta?.fileBase64; ... if (!fileBase64 && storagePath) { download }` — **PREFERS** `fileBase64` over `storagePath`.

**Finding: the execute-time `documentMetadata.fileBase64` path is a LIVE, reachable consumer** (per-unit `executePlanPipeline` fallback, reached when the batched plan path is bypassed/fails). Per directive §3.6, **Phase 6 does NOT retire it** — recorded as a §6A residual. (It is unambiguously live, so not HALT-3; the disposition is "leave intact per finding.")

### Per-surface EDIT / PRESERVE / READ-ONLY
| Surface | Lines | Class |
|---|---|---|
| execute-bulk workbook parse | 160-181 | EDIT (P3: gate by format) |
| execute-bulk request shape + download | 93-146 | EDIT (P4: per-file map + loop) |
| execute-bulk per-unit data resolution | 231-320 | EDIT (P4: resolve from file's sheet map) |
| execute-bulk plan batch | 211-229 | EDIT (P4: per-file grouping) / READ-ONLY emitter |
| plan-interpretation extractor + emitter | all | READ-ONLY (route to it) |
| page.tsx singular derive | 322 | EDIT (P4) |
| page.tsx route fork | 143-260 | EDIT (P5) |
| SCIExecution storagePaths send | 189-280 | EDIT (P4) |
| analyze (multi-file classify) | 88 | PRESERVE |
| analyze-document (single doc) | all | EDIT (P5: per-file invocation client-side) |
| process-job worker | all | PRESERVE (not touched) |
| documentMetadata.fileBase64 | execute path | PRESERVE (live consumer; §6A) |

## PROOF GATES — HARD
| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |
|---|---|---|---|
| EPG-1 | Single document plan (PPTX/PDF) imports: no "Could not find workbook" throw; routes to the Plan Agent; rule_set created; `[PlanComprehensionEmitter] Emitted N comprehension:plan_interpretation signals` fires | PENDING — architect-run | live |
| EPG-2 | Mixed-format multi-file import in ONE action → ONE merged proposal → plan rule_set + data committed_data | PENDING — architect-run | live |
| EPG-3 | Multi-file same-format → multiple rule sets (multiple plan files → one rule set each) | PENDING — architect-run | live |
| EPG-4 | Single-file XLSX non-regression — byte-identical; BCL grand total unchanged | PENDING — architect-run | `[CalcRecon-T1]` |
| EPG-5 | Tabular data non-regression — entity/transaction/target spreadsheet classifies + commits | PENDING — architect-run | committed_data |
| EPG-6 | Korean Test — zero new hardcoded format-name/language/domain literals | (pending) | grep |
| EPG-7 | `npm run build` exits 0 (incl. korean-test gate); `localhost:3000` responds | (pending) | output |
| EPG-8 | Document-plan tenant calculates end-to-end; grand total verbatim | PENDING — architect-run | `[CalcRecon-T1]` |
| EPG-9 | (conditional) if Phase 6 retired fileBase64: document classification still works | N/A — Phase 6 not retiring (live consumer) | — |

## PROOF GATES — SOFT
(n/a)

## STANDING RULE COMPLIANCE
(filled at completion)

## KNOWN ISSUES
(filled at completion)

## VERIFICATION SCRIPT OUTPUT
(filled at completion)
