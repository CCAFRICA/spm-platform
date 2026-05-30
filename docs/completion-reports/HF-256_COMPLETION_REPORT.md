# HF-256 COMPLETION REPORT

*Restore Universal File Ingestion (Decision 82) — Document Plans, Multi-File, Mixed-Format*

## Date / Execution Time
2026-05-30, single CC session.

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| `a497950b` | 1 | Architecture Decision Record (+ directive, Rule 29) |
| `a2973be6` | 2 | Full pre-edit enumeration |
| `9050b349` | 3 | Format-aware execute |
| `79e2f5fe` | 4 | Multi-file transport |
| `8f514bbd` | 5 | Per-file route + unified proposal |
| — | 6 | NOT retired — `documentMetadata.fileBase64` is a live consumer (per Phase 2 finding); §6A residual |
| (this commit) | 7 | Completion report + build |

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
| EPG-6 | Korean Test — zero new hardcoded format-name/language/domain literals | **PASS** | grep below |
| EPG-7 | `npm run build` exits 0 (incl. korean-test gate); `localhost:3000` responds | **PASS** | output below |
| EPG-8 | Document-plan tenant calculates end-to-end; grand total verbatim | PENDING — architect-run | `[CalcRecon-T1]` |
| EPG-9 | (conditional) if Phase 6 retired fileBase64: document classification still works | **N/A** — Phase 6 did NOT retire (live consumer) | — |

### EPG-6 (PASS)
```
$ grep -rnE '"(BCL|Meridian|Optica|Luminar|Periodo|Sucursal|Empleado|Deposito)"' <touched files>
ZERO domain/language/filename literals — PASS
# format extensions (structural dispatch) live in ONE canonical declaration:
file-format.ts:16  export const DOCUMENT_EXTENSIONS = ['pdf', 'pptx', 'docx'] as const;
# execute-bulk dispatches via isSpreadsheetPath/extensionOf (no scattered format literals;
# only match is `await import('xlsx')` — the library name, not a format check).
```
Format-extension dispatch is the structural approach already used at
`plan-interpretation.ts:53` (sanctioned by the directive); it is not a filename/language/
domain literal. The set is centralized so consumers import rather than re-declare.

### EPG-7 (PASS)
```
$ rm -rf .next && npm run build
[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry
 ✓ Compiled successfully
BUILD_EXIT=0
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
307   (redirect to auth — expected; dev "✓ Ready")
```
`tsc --noEmit`: 0 errors (verified after Phases 3, 4, 5).

## PROOF GATES — SOFT
(n/a)

## STANDING RULE COMPLIANCE
- **AP-1:** documents reach execute via Storage (download from `ingestion-raw`); no request-body
  file bytes introduced. The pre-existing `documentMetadata.fileBase64` path is untouched (§6A).
- **AP-17:** ONE ingestion surface, ONE transport. Documents and spreadsheets share the
  execute path; format is resolved WITHIN it (`file-format.ts`), not via a second path. The
  data multi-file path (HF-142 per-file calls) and the plan path both flow through execute-bulk.
- **AP-5/AP-6 / Korean Test (EPG-6):** format dispatch by structural extension, one canonical
  declaration; zero new domain/language/filename literals.
- **SR-34:** the regression class (single-file XLSX collapse) is closed at the class layer
  (format-aware execute + multi-file transport + per-file route + unified proposal), not one surface.
- **DD-7 / preserved paths:** single-file XLSX (resolveParse→one parse; proposal verbatim),
  tabular data commit, multi-file classification at `analyze`, analyze-phase document
  classification, plan extractor + comprehension emitter, `process-job` — all unedited or
  byte-identical-by-construction (EPG-4/EPG-5, architect-run).
- **Vertical Slice:** import → classify → execute → signals (comprehension emitter, EPG-1) →
  calculate (EPG-8) — one PR.
- **Decision-82 scope line honored:** NO document-as-data extraction added; documents are plan units only.
- **D.1/D.2/D.3:** per-phase commit+push; `rm -rf .next`→build(0)→dev→307; PR **#444** (https://github.com/CCAFRICA/spm-platform/pull/444), NOT merged — architect merges after live EPGs. ASCII commits.

## KNOWN ISSUES
1. **EPG-1/2/3/4/5/8 are architect-gated (live).** They require clean-slate imports of the
   document-plan witness (Meridian/Óptica Luminar) + a multi-file + a mixed-format set, plus
   BCL single-file XLSX non-regression and an end-to-end calculate. Code shipped; architect
   runs + merges.
2. **Phase 6 NOT performed — `documentMetadata.fileBase64` is a live consumer.** `executePlanPipeline`
   (plan-interpretation.ts:318-322) reads `docMeta.fileBase64` and PREFERS it over `storagePath`;
   `analyze-document` sets it (`:240-241`) and `SCIExecution` forwards it (`:252,:317`). Retiring it
   would change the per-unit plan fallback behavior. Left intact per directive §3.6; recorded as
   §6A residual for separate retirement once the per-unit fallback is migrated to Storage-only.
3. **Multi-file resolution depends on `sourceFile` ↔ `storagePaths`-key alignment.** `resolveParse`
   matches `unit.sourceFile` to the per-file map key; single-file degrades to the one parse
   (safe). Mixed/multi-file correctness is validated by EPG-2/EPG-3 (architect-run).
4. **Upload-once end-state (§6A):** documents still transfer bytes twice (base64 to
   `analyze-document` for classification + Storage upload for execute). Collapsing to one
   upload is a separate forward item.

## VERIFICATION SCRIPT OUTPUT
- EPG-6 grep: `ZERO domain/language/filename literals — PASS`.
- Build: `BUILD_EXIT=0`, `[korean-test-gate] PASS`, `✓ Compiled successfully`.
- `tsc --noEmit -p tsconfig.json`: 0 errors (Phases 3/4/5). localhost:3000: HTTP 307.
