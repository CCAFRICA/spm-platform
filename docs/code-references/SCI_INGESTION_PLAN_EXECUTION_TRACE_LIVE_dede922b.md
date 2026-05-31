# SCI INGESTION → PLAN-INTERPRETATION EXECUTION TRACE — LIVE CODE REFERENCE

## Generated at SHA: `dede922b3b7d1257641f746b1d8ddbc136ac1b3d` (branch `dev` == `main`)
## Date: 2026-05-31 · Audit: AUD-0015 · Classification: read-only live-code SSOT
## Companion to: `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_*.md` (calc-execution half)

> **Substrate role.** This is an authoritative, SHA-pinned live-code reference — a peer of
> `SCHEMA_REFERENCE_LIVE.md` and `AUD-005_CALC_EXECUTION_LIVE_REFERENCE`. Cite it in HF/DIAG/IRA
> work **in lieu of re-reading the ingestion/interpretation spine.** It covers the path from
> the user clicking import to the rule_set persisted + signals emitted; it reconciles with
> AUD-005 at the calc boundary and does NOT re-map calc internals.
>
> **Refresh discipline.** Regenerate to a new `_<short_SHA>` version whenever any HF/OB/DIAG
> modifies a mapped surface; retain prior versions for citation. Placed in `docs/code-references/`
> alongside AUD-005 (the directive named `docs/reference/`; this location matches the cited peer
> for findability).
>
> **Evidence standard.** Every surface carries real `file:line` at the header SHA with pasted
> signatures/dispatch. Annotations flag Korean-Test / AP-1 / AP-17 observations (lenses, not edits).

---

## RECENT COMMIT HISTORY (12)
```
dede922b DIAG-058: PDF plan interpretation regression findings (read-only)
2077b168 HF-257: Enforce single plan-interpretation pipeline (AP-17) (#445)
82e5e4f5 HF-256: Restore universal file ingestion (Decision 82) — document plans, multi-file, mixed-format (#444)
0c2da09d HF-255: Restore unified any-format plan import (#443)
9cd13fe3 HF-254: Ingestion flywheel — single skip authority, role-bearing caches, lexical prior (#442)
2ca8b9a2 HF-253: Per-Variant Binding Scope + Distribution Signal (#441)
327d3da4 HF-252: Per-Variant Component Intent Emission (#440)
5fde465c HF-251: Compositional Intent + Constructor (#439)
37a9f76d HF-250: Multi-call skeleton/chunk separation (#438)
ba4dce8e HF-249: Grammar-aware subtree decomposition (#437)
e478a2fa HF-248: Per-component plan interpretation (orchestrator) (#436)   ← A1 regression origin
809f3789 HF-247: Plan import integrity (#435)
```

## FILE INVENTORY (spine, discovered not assumed)
| File | Lines | Role |
|---|---|---|
| `app/operate/import/page.tsx` | 574 | Ingestion entry: upload, per-file route, proposal merge, storagePaths |
| `components/sci/SCIUpload.tsx` | 393 | File parse → ParsedFileData; documentBase64 for PDF/PPTX/DOCX |
| `components/sci/SCIExecution.tsx` | 605 | Execute orchestration (client): plan branch + per-file data; **the re-dispatch edges (A2)** |
| `app/api/import/sci/analyze/route.ts` | 675 | Tabular classification (loops files) |
| `app/api/import/sci/analyze-document/route.ts` | 274 | Document classification; sets `documentMetadata.fileBase64` |
| `app/api/import/sci/execute-bulk/route.ts` | 816 | **Dispatch hub**: per-file parse, classification switch, plan grouping, sole batched plan dispatch |
| `app/api/import/sci/process-job/route.ts` | 401 | Async XLSX classifier (AP-17 dual-classifier) |
| `lib/sci/file-format.ts` | 34 | `isDocumentPath` + canonical `DOCUMENT_EXTENSIONS` |
| `lib/sci/commit-content-unit.ts` | 478 | Sole committed_data writer (data units); creates import_batch |
| `lib/sci/plan-interpretation.ts` | 310 | **Sole batched plan fn** (HF-257): extract→orchestrate→supersede+save→emit |
| `lib/sci/plan-orchestration.ts` | 587 | Phase A skeleton + Phase B per-component (+retry) |
| `lib/ai/ai-service.ts` | 562 | AI task dispatch (plan_skeleton / plan_component / …) |
| `lib/ai/providers/anthropic-adapter.ts` | 1510 | **Document-block gate (A1)** + per-task prompt build |
| `lib/sci/reimport-resume.ts` | 204 | Resume context (partialSuccess); persistComponentOutcomes (batch id assoc.) |
| `lib/compensation/plan-comprehension-emitter.ts` | 144 | comprehension:plan_interpretation signals |
| `lib/compensation/ai-plan-interpreter.ts` | 651 | `bridgeAIToEngineFormat` (interpretation → engine components/variants) |
| `lib/sci/flywheel-signal-emission.ts` | 197 | fingerprint/classification/foundational/domain signals (data units) |
| `lib/sci/prime-validator.ts` (calc) | 71 | PrimeNode validation (warnings) |
| (+ assignment-creation, store-metadata-population, import-batch-supersession, field-identities, sci-types) | | supporting |

---

## §1 — INGESTION ENTRY & TRANSPORT  (`operate/import/page.tsx`, `SCIExecution.tsx`, `analyze*`)

**Upload + route decision** — `page.tsx`:
- `uploadableFiles = files.filter(f => f.rawFile)` (`:110`) → ALL formats upload to Storage bucket `ingestion-raw` (`:127-128`); per-file path keyed by filename in `storagePathsRef` (`:136`). [HF-255/256]
- `spreadsheetFiles = files.filter(f => f.rawFile && !f.parsedData.documentBase64)` (`:111`) → gates the async XLSX fast-path only.
- Async fast-path eligible only when `allSpreadsheets` (`:147` `spreadsheetFiles.length === files.length`) → fires `process-job` workers (`:196`) and returns. A mixed/document set falls to the synchronous per-file dispatch. [HF-256]
- **Per-file route + unified proposal** (`:216-290`): document files → `analyze-document` (one call each, concurrent); tabular → `analyze` (one call, loops files). Single-document or tabular-only → that proposal verbatim; mixed/multi-document → merged into ONE proposal. [HF-256]
- `storagePath = Object.values(storagePaths)[0] || undefined` (`:322`, back-compat singular); both `storagePath` + `storagePaths` map passed to `<SCIExecution>` (`:493-494`).

**`SCIExecution` thread to execute** (`SCIExecution.tsx`):
- Execute-bulk POST sites: data per-file `executeBulk` (`:189`), `executeLegacyUnit` data fallback (`:273`), **plan branch** (`:340`). Plan units routed ONLY through `:340` (`executeUnits` splits plan/data at `:294-295`).
- Plan POST body (`:343-349`): `{ proposalId, tenantId, storagePath, storagePaths, contentUnits: planExecUnits }`; planExecUnits carry `documentMetadata` (`:317`), `sourceFile`, `tabName`.
- **AP-1 annotation:** `documentMetadata.fileBase64` is forwarded from the proposal into the execute body (`:317`). Post-HF-257 it is UNCONSUMED at execute (no plan path reads it) — §6A retirement candidate.

**Classification routes:**
- `analyze/route.ts:88` `for (const file of files)` — multi-file classification (loops; sole tabular classifier).
- `analyze-document/route.ts:85-92` — one document per call; `:240-241` sets `documentMetadata: { fileBase64, mimeType }` on the proposal unit. **AP-1:** base64 in request body — legitimate ANALYZE-phase channel (documents can't be parsed client-side).

---

## §2 — EXECUTE-BULK DISPATCH HUB  (`execute-bulk/route.ts`)

**Request** (`:92-101`): `{ proposalId, tenantId, storagePath?, storagePaths?, contentUnits }`; validation accepts either path form (`:123`).

**Per-file parse loop** (`:147-199`, HF-256): builds `fileParseByName` — per file: download from `ingestion-raw`, `computeFileHashSha256`, then **format-aware parse**:
- `isSpreadsheetPath(path)` → `XLSX.read` → `sheetDataMap` (`:185-196`).
- document (`isDocumentPath`) → **skip workbook parse** (`:197-198`) — plan unit routes to the plan pipeline. [HF-256 — fixes the "Could not find workbook" crash.]
- `resolveParse(unit)` (`:~200`) maps a unit to its file's parse; **single file → the one parse (byte-identical pre-HF).**

**`file-format.ts`** (canonical, Korean-Test-clean): `DOCUMENT_EXTENSIONS = ['pdf','pptx','docx']` (`:16`); `isDocumentPath`/`isSpreadsheetPath`. The one extension-literal scheme on the path.

**Dispatch decision table** (`executeContentUnit` switch, `:441-468`; plan handled before the loop):

| Input condition | Branch | Function | Side effects |
|---|---|---|---|
| `classification === 'plan'` (grouped pre-loop `:236-265`) | `planByPath` group per source file | **`executeBatchedPlanInterpretation`** (`:248`) — SOLE plan path [HF-257] | rule_set upsert + supersede; comprehension signals |
| `'entity'` | `processEntityUnit` (`:442`) | `commitContentUnit` | committed_data; import_batch |
| `'target'`/`'transaction'` | `processDataUnit` (`:444/446`) | `commitContentUnit` | committed_data |
| `'reference'` | `processReferenceUnit` (`:448`) | `commitContentUnit` | committed_data |
| `'plan'` reaching the switch (unexpected) | explicit failure (`:450`, no re-interpret) [HF-257] | — | — |
| default | failure result | — | — |
| catch on batched throw (`:261`) | explicit per-unit failures, marked handled [HF-257] | — | — |

**AP-17 annotation:** HF-257 confirmed — exactly ONE plan-interpretation path. The per-unit `executePlanPipeline` was deleted; `grep 'executePlanPipeline(' web/src` → zero calls.
Post-loop (`:303+`): `executePostCommitConstruction`, `createMissingAssignments`, `emitFlywheelSignals` (data units), `populateStoreMetadata`.

---

## §3 — PLAN INTERPRETATION ORCHESTRATOR  (deepest region)

### `plan-interpretation.ts` — `executeBatchedPlanInterpretation` (`:26`, sole fn)
Per-format extraction (`:56-128`):
- **PDF** (`:60-63`): `pdfBase64ForAI = fileBuffer.toString('base64')`; `pdfMediaType='application/pdf'`; `documentContent = '[PDF document: <N> bytes base64]'` — **a ~34-char PLACEHOLDER**; real content rides `pdfBase64`.
- XLSX sheet-walk (`:100`); PPTX/DOCX JSZip text (`:123/128`) → real TEXT in `documentContent`.
- `:145` logs `documentContent.length` (== 34 for PDF placeholder).
Orchestrator call (`:151-165`): `orchestratePerComponentInterpretation({ documentContent, format: pdfBase64ForAI?'pdf':'text', pdfBase64: pdfBase64ForAI, pdfMediaType, resumeSkipIds, priorComponents })`. **pdfBase64 forwarded into the orchestrator.**
Save (`:197-254`): `ruleSetId = crypto.randomUUID()`; **supersede ALL prior rule_sets** `!== 'archived'` (`:211-216`, AUD-013/HF-244 — supersede failure BLOCKS upsert); upsert active rule_set with `components` (variants), `input_bindings`, `cadence_config`, `metadata`. Then `emitPlanComprehensionSignals` (`:276`) and `persistComponentOutcomes` (`:293`).
**Annotation (DIAG-058 §6A):** skeleton failure surfaces as `JSON parse failed: Unexpected token 'I'…` (`:175-179`) — poor failure mode; robustness HF separate.

### `plan-orchestration.ts` — two-phase
- **Phase A skeleton** (`:142-184`): `aiService.interpretPlanSkeleton(documentContent, format, signalContext, pdfBase64, pdfMediaType)` (`:146-152`) — **forwards pdfBase64**. Parse failure → `skeletonError` → empty result (refuse save).
- **Phase B per-component** (`:186-283`): for each `componentIndex` entry → `callPlanComponentWithRetry` (`:220`) → `aiService.interpretPlanComponent(...)` (`:380`) — **forwards pdfBase64** (`:223-224`). Bounded retry per component. (Chunked variants `interpretPlanComponentWithChunking`/`interpretPlanChunk` exist in ai-service but the in-one-call path is primary; `:562` "no chunking needed".)
- HF-248 resume: skip components present in `priorComponents` (`:204-216`).

### `ai-service.ts` — plan/document tasks (each sets `input.pdfBase64` when given)
`interpretPlan`→`plan_interpretation` (`:257`); `interpretPlanSkeleton`→`plan_skeleton` (`:287`); `interpretPlanComponent`→`plan_component` (`:324`); `interpretPlanComponentWithChunking`→`plan_component_with_chunking` (`:363`); `interpretPlanChunk`→`plan_chunk` (`:400`); document_analysis (analyze-document).

### `anthropic-adapter.ts` — **the A1 gate** (`:1032`)
```
1032:  if (pdfBase64 && (request.task === 'plan_interpretation' || request.task === 'document_analysis')) {
1037-1049:   messageContent = [ { type:'document', source:{ type:'base64', media_type, data } }, { type:'text', text } ]
```
Per-task prompt-build cases exist for ALL tasks (`:1185 plan_interpretation`, `:1246 plan_skeleton`, `:1259 plan_component`, `:1290 plan_component_with_chunking`, `:1322 plan_chunk`, `:1461 document_analysis`) — so the PROMPT asks each phase to read a PDF, but the DOCUMENT BLOCK is attached only for the two gated tasks.

### AI-TASK → DOCUMENT-BLOCK TABLE (resolves A1)
| Task | sets pdfBase64? | gate attaches block (`:1032`)? | prompt-build case? | on executed PDF path? |
|---|---|---|---|---|
| `plan_interpretation` (OLD single call) | ✅ | ✅ | ✅ (`:1185`) | superseded by orchestrator |
| `document_analysis` (analyze-document) | ✅ | ✅ | ✅ (`:1461`) | yes (classify phase) |
| `plan_skeleton` (Phase A) | ✅ | ❌ | ✅ (`:1246`) | **YES — broken** |
| `plan_component` (Phase B) | ✅ | ❌ | ✅ (`:1259`) | **YES — broken** |
| `plan_component_with_chunking` | ✅ | ❌ | ✅ (`:1290`) | conditional (decomposition) |
| `plan_chunk` | ✅ | ❌ | ✅ (`:1322`) | conditional (decomposition) |

**A1 fix-set (gate must include):** `plan_skeleton`, `plan_component`, `plan_component_with_chunking`, `plan_chunk`. (DIAG-058 found the first two; AUD-0015 confirms all four set pdfBase64 and are excluded.)

### Downstream: variants + validation
`bridgeAIToEngineFormat` (`ai-plan-interpreter.ts`) converts interpretation → engine `components.variants[]` + `input_bindings`. PrimeValidator (`prime-validator.ts`, 71 lines) validates PrimeNode trees — warnings, non-blocking.

---

## §4 — RE-ENTRY / RESUME / RETRY / ASYNC  (resolves A2)

**Batch id origin (the "same batch id" mechanism):** plan interpretation does NOT create an import_batch. `persistComponentOutcomes` (`reimport-resume.ts:167-198`) UPDATES the **tenant's most-recent** import_batch (`batches[0]`, `:194`) with its `error_summary`. So two runs of one PPTX both attach to the same most-recent tenant batch — **the shared `e2680bbd` is an artifact of "attach to most-recent batch," not proof of resume-reuse.**

**Resume** (`loadResumeContext`, `:56-157`): returns a `priorBatchId` only when a prior batch's `error_summary` has `hf==='HF-248'`, matching `storagePath`, AND **`partialSuccess===true`** (`:85-92`). A fully-successful prior import yields NO resume context. Resume skips already-successful components (`:148-155`).

**RE-ENTRY MAP — every edge that can drive `executeBatchedPlanInterpretation`:**
| Edge | File:line | Trigger | Auto re-POST? | Guard |
|---|---|---|---|---|
| Initial run | `SCIExecution.tsx:528-544` useEffect → `executeUnits(units)` (`:538`) | mount | — | **dual guard**: module `executedProposals` Set + `executingRef` (StrictMode/remount safe) |
| Plan dispatch | `SCIExecution.tsx:340` → execute-bulk → `:248` | within executeUnits | — | one POST per executeUnits |
| **Retry failed** | `SCIExecution.tsx:572 handleRetryFailed` → clears guard (`:584`) → `executeUnits(failedUnits)` (`:587`) | **USER click** | no | `isRetrying` guard only |
| Timeout/abort | `SCIExecution.tsx:371-420` | client `fetchWithTimeout` abort | **NO** — `pollPlanRecovery` (`:386`) is **poll-only** (no re-POST) | recovery marks complete/error |
| Server batched dispatch | `execute-bulk:248` (planByPath loop) | one group per source file | — | try/catch records failures, no retry |
| Server idempotency | — | — | — | **NONE** — `proposalId` received (`:120`) but never used to dedupe/lock |

**A2 mechanism statement (with HALT-2 boundary):**
Two `executeBatchedPlanInterpretation` runs occurred → two rule_sets (`10aeb540` then `b983bc11`); each save supersedes all prior (`plan-interpretation.ts:211-216`), so the second archives the first → "second superseding the first." The shared batch id is the most-recent-batch attachment (above).
**Source-determinable:** a second run requires a second execute-bulk POST for the plan unit. The ONLY source-visible re-dispatch edges are (a) `handleRetryFailed` (a USER retry click, which clears the initial guard) and (b) a fresh mount with a new `proposalId`. The timeout path does **not** auto re-POST (`pollPlanRecovery` polls only). There is **no server-side idempotency** keyed on `proposalId`/storagePath, so nothing prevents a second run+save.
**NOT source-determinable (HALT-2):** which edge fired for the `e2680bbd` incident — whether the user retried after an apparent hang, whether two POSTs were sent ~60s apart (cf. the BCL 2026-05-21 precedent referenced at `plan-interpretation.ts:209`), or a double-submit. Deciding evidence requires runtime logs: two execute-bulk POST timestamps, presence/absence of client `AbortError`, and whether `handleRetryFailed` ran. The CLASS is confirmed; the specific trigger is runtime state.
**This is the SAME class as the BCL 2026-05-21 "two active rule_sets 60s apart" incident** (`plan-interpretation.ts:208-210`). HF-244 made it single-ACTIVE (supersede-or-block) but did not prevent the duplicate RUN+save.

**AP-17 dual-classifier annotation:** sync `analyze/route.ts` and async `process-job/route.ts` are two classifier implementations (both XLSX-only); documents always take sync. Not a plan-interpretation duplicate; recorded for the separate consolidation HF.

---

## §5 — CROSS-CUTTING LAYERS

**Fingerprint / moat (HF-254):** `analyze`/`process-job` compute per-sheet structural fingerprints; tier-1 cache hits inject native `columnRole` `fieldBindings` (HF-254 Fix 2a) so warm imports skip the LLM with real roles. `emitFlywheelSignals` (`flywheel-signal-emission.ts:73`) short-circuits on `!structuralFingerprint` → **document plans accrue NO fingerprint moat** (they accrue comprehension signals instead — by design, AUD-0014 F-AUD-06).

**Signals (Decision 64/153):**
- `emitPlanComprehensionSignals` (`plan-comprehension-emitter.ts:116`) → `comprehension:plan_interpretation` (one per component); transport-independent — fires for any plan reaching the pipeline. The plan moat.
- `writeClassificationSignal` / fingerprint / foundational / domain (data units).

**AP-1 transport ledger:** Storage transport (execute, download from `ingestion-raw`) is the norm. base64-in-body sites: `analyze-document` request (`fileBase64`, legitimate classify channel); `documentMetadata.fileBase64` forwarded into execute body (`SCIExecution:317`) — **UNCONSUMED post-HF-257** (§6A retirement). No row data in bodies.

**Schema-touchpoint table** (reconcile `SCHEMA_REFERENCE_LIVE.md`):
| Stage | Reads | Writes |
|---|---|---|
| Upload | — | Storage `ingestion-raw` |
| analyze / process-job | classification_signals, structural_fingerprints | classification_signals, structural_fingerprints |
| execute data units | tenants | committed_data, import_batches, entities |
| execute plan | rule_sets (supersede) | rule_sets, classification_signals (comprehension), import_batches.error_summary |
| post-commit | committed_data, entities | rule_set_assignments, entity back-links |

---

## §6 — CALC BOUNDARY RECONCILIATION
This path PRODUCES: an active `rule_sets` row (`components.variants[]`, `input_bindings`, `cadence_config`, `metadata`) + `comprehension:plan_interpretation` signals + committed_data (data units). **AUD-005** (`AUD-005_CALC_EXECUTION_LIVE_REFERENCE_*`, SHAs `5314c365`/`f6e3dca1`) consumes the rule_set + committed_data at calc time; convergence binding production runs at calc (per AUD-005 scope note). **Boundary contract:** rule_set shape (variants + bindings) is the handoff artifact; this trace does not re-map calc internals. **Drift note:** AUD-005 SHAs predate this HEAD (`dede922b`); HF-251/252/253 changed `components.variants[]` shape (per-variant compositional_intent) — a calc-side reader should confirm AUD-005 reflects the per-variant shape or refresh it.

---

## ANOMALY REGISTER

### A1 — PDF plan interpretation regressed (DIAG-058; confirmed + completed here)
| | |
|---|---|
| Severity | S1 (PDF plans cannot interpret) |
| Files+lines | `anthropic-adapter.ts:1032` (gate); `ai-service.ts:287/324/363/400` (tasks); origin `e478a2fa` HF-248 |
| Impact | Every PDF plan: model receives only the 34-char placeholder → prose → JSON parse fail → refuse save. |
| Root cause | HF-248 introduced orchestrator tasks `plan_skeleton`/`plan_component` (+chunk variants) but the document-block gate (`:1032`) still allow-lists only `plan_interpretation`/`document_analysis`. `pdfBase64` is forwarded everywhere except attached at the adapter. |
| Fix-shape (architect HF) | Extend the gate to attach the document block for the full plan-task set: `plan_skeleton`, `plan_component`, `plan_component_with_chunking`, `plan_chunk` (cleanest: attach whenever `pdfBase64` present for any plan/document task). DD-7: text-format paths (pdfBase64 undefined) unaffected. |

### A2 — Duplicate plan-interpretation run for one batch (confirmed class; trigger runtime-bound)
| | |
|---|---|
| Severity | S2 (correctness/integrity — two rule_sets, wasted AI cost; single-active preserved by HF-244 supersede) |
| Files+lines | `SCIExecution.tsx:340/371-420/572-590` (dispatch + retry); `execute-bulk:248` (no idempotency, proposalId unused `:120`); `plan-interpretation.ts:197-254` (per-run rule_set + supersede); `reimport-resume.ts:194` (most-recent-batch attach) |
| Impact | One import → two interpretation runs → two rule_sets (2nd supersedes 1st); shared batch id. Same class as BCL 2026-05-21 (`plan-interpretation.ts:209`). |
| Root cause (class) | Two execute-bulk POSTs for the same plan unit + NO server-side idempotency. Source-visible re-dispatch edges: `handleRetryFailed` (user retry; clears guard) or remount; timeout path does NOT auto re-POST (poll-only). **Specific trigger for `e2680bbd` is NOT source-determinable (HALT-2)** — needs runtime evidence (two POST timestamps / AbortError / retry interaction). |
| Fix-shape (architect HF) | Server-side idempotency: dedupe/lock on (tenant_id, plan storagePath or proposalId) within a window so a second interpretation+save is a no-op (not just supersede-after-the-fact). Closes the class HF-244 only partially addressed. |

---

## TRACE ANNOTATIONS (lenses; not edits)
- **Korean Test:** only structural literals on the path — `file-format.ts:16` DOCUMENT_EXTENSIONS (format, sanctioned) and `ROLE_TARGETS` (`execute-bulk:66`, AP-5/6-noted generic). No domain/language literal introduced on the spine.
- **AP-1:** `documentMetadata.fileBase64` (§5 ledger) — unconsumed at execute post-HF-257; retirement teed up (§6A of HF-257).
- **AP-17:** plan interpretation = one path (HF-257 ✓). Residual dual classifier (sync analyze vs async process-job) — separate.

*AUD-0015 — read-only SSOT, generated at `dede922b`. No code edited. A1/A2 remediation HFs scoped by the architect from this artifact. Refresh on any mapped-surface change.*
