# HF-258 COMPLETION REPORT

*1C Content-Channel Unification (Q2) + Transport Retirement (Q5) — first 1C slice*

## HEAD SHA
At start: `628d3100`. Final commit: `74692f6e` (branch `dev`).

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| `74b7520c` | 1 | ADR (+ directive, Rule 29) |
| `74692f6e` | 3 | Unified content channel (Q2) + dead-transport retirement (Q5) |
| (this commit) | 5 | Completion report + build |

(Phase 2 enumeration produced no code — its inventory is embedded below. Phase 4 live
import verification is architect-gated; structural verification pasted below.)

## FILES MODIFIED
| File | Change |
|---|---|
| `lib/ai/providers/anthropic-adapter.ts` | Attachment gate dispatches on `contentType` (with `pdfBase64?'document':'text'` fallback), not task-name allowlist. |
| `lib/ai/ai-service.ts` | All 5 plan methods set `input.contentType='document'` in the pdfBase64 block. |
| `app/api/import/sci/analyze-document/route.ts` | document_analysis sets `aiInput.contentType='document'`; proposal `documentMetadata` no longer sets `fileBase64`. |
| `lib/sci/sci-types.ts` | `documentMetadata.fileBase64` removed from `ContentUnitProposal` + `ContentUnitExecution`; `{mimeType}` marker kept. |
| `app/api/import/sci/execute-bulk/route.ts` | `BulkContentUnit.documentMetadata` type → `{mimeType?}` (fileBase64 retired). |

## ARCHITECTURE DECISION RECORD
See `docs/completion-reports/HF-258_ADR.md` (Phase 1, `74b7520c`). Q2: content-unit type dispatch.
Q5: dead-field retirement. Materialization stays SCI-layer (architect-flagged).

## PRE-EDIT ENUMERATION (Phase 2, HEAD `628d3100`)
- **Extraction / content-unit production:** `plan-interpretation.ts:60-63` (PDF → pdfBase64 + 34-char
  placeholder), `:100/123/128` (XLSX/PPTX/DOCX → `documentContent` text). Single upstream type decision.
- **Orchestrator phases (uniform consumption):** `plan-orchestration.ts:146-151` (Phase A skeleton),
  `:220-224 / :380-386` (Phase B per-component) — both forward `documentContent` + `pdfBase64` + `format`.
- **Adapter attachment gate (the sole format-as-branch):** `anthropic-adapter.ts:1032`
  `task === 'plan_interpretation' || 'document_analysis'` — excluded plan_skeleton/plan_component/
  plan_component_with_chunking/plan_chunk (6 plan/document tasks set pdfBase64; only 2 attached).
- **Dead base64 (HALT-3 verified unconsumed at execute):** type at `execute-bulk:89`; set at
  `analyze-document:240-241`; forwarded at `SCIExecution:252/317`; NO read on the execute path
  (plan-interpretation reads `storagePath`, not documentMetadata; executePlanPipeline that read it was
  deleted by HF-257). `documentMetadata` *presence* is a live proposal-UI flag (`SCIProposal:89`) → kept.

## PROOF GATES
| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| HARD-1 | Adapter attaches document block on content-TYPE, not task name | **PASS** | gate now `if (pdfBase64 && contentType === 'document')`; `contentType = input.contentType ?? (pdfBase64?'document':'text')` |
| HARD-2 | All plan/document tasks carry the document content unit | **PASS** | `input.contentType='document'` set at 6 sites (5 ai-service plan methods + analyze-document) |
| HARD-3 | Q5 — dead `fileBase64` body field retired (no bytes in request bodies) | **PASS** | removed from sci-types (both interfaces), execute-bulk type, analyze-document set; only comments remain |
| HARD-4 | Korean Test — no task/format literal gating content attachment | **PASS** | gate keys on structural `contentType` |
| HARD-5 | `npm run build` exit 0 (korean-test gate) + localhost responds + tsc clean | **PASS** | `BUILD_EXIT=0`, `[korean-test-gate] PASS`, `✓ Compiled successfully`, localhost 307, tsc 0 errors |
| EPG-PDF | (live) CRP PDF: skeleton receives real content (not 34-char placeholder), rule_set saved, signals | **PENDING — architect-run** | requires clean-slate PDF import |
| EPG-PPTX | (live) Meridian PPTX interprets (text channel preserved; duplicate-run is separate, §6) | **PENDING — architect-run** | live import |
| EPG-XLSX | (live) tabular plan interprets (text channel byte-identical) | **PENDING — architect-run** | live import |

### HARD-1/3/4 pasted evidence
```
anthropic-adapter.ts:
  const contentType = (request.input.contentType as string | undefined) ?? (pdfBase64 ? 'document' : 'text');
  if (pdfBase64 && contentType === 'document') {   // ← was: (task === 'plan_interpretation' || 'document_analysis')
$ grep -rnE 'fileBase64' web/src/lib/sci/sci-types.ts web/src/app/api/import/sci/execute-bulk/route.ts
  → only HF-258 comment lines (field removed)
```

## STANDING RULE COMPLIANCE
- **SR-34:** fixed the channel class (content-type dispatch), not the PDF instance (rejected the narrow
  gate-extension per §1.4). **Korean Test:** structural dispatch, zero literal. **AP-1:** no body bytes;
  storage-reference transport. **AP-17 / DD-7:** single plan path (HF-257), fingerprint moat, calc
  handoff, and text-format extraction all untouched; text units attach no block (identical message
  content). **D.1/D.2/D.3:** per-phase commit+push; build(0)→dev→307; PR #446: https://github.com/CCAFRICA/spm-platform/pull/446 (NOT merged — architect merges after live EPGs).

## KNOWN ISSUES
1. **EPG-PDF/PPTX/XLSX are architect-gated (live).** Phase 4's three-format coverage gate needs
   clean-slate imports (CRP PDF, Meridian PPTX, an XLSX plan). Structural + build verification done;
   behavioral confirmation is the architect's live run. (This is the coverage gate the prior chain skipped.)
2. **Materialization location (ADR-flagged):** base64 stays materialized in the SCI layer
   (`plan-interpretation:61`, from storage, in-process) rather than literally "at adapter time." Equal
   AP-1/Q5 posture; preserves adapter layering. Architect-confirmable; no-outcome-change to move it.
3. **contentType threading:** set at the ai-service boundary (derived from the ingestion-produced
   `pdfBase64` document payload) + adapter fallback, rather than threaded as a separate orchestrator
   param — functionally equivalent to the ADR's threaded variant, lower churn/risk. The shipped behavior
   (adapter dispatches on contentType for all document tasks) matches the ADR intent exactly.
4. **Out of scope (later 1C slices, §6):** idempotency + supersession audit (Q3+Q6, the duplicate-run),
   scale/parallel (Q4). Not touched.

## VERIFICATION OUTPUT
- Build: `BUILD_EXIT=0`, `[korean-test-gate] PASS`, `✓ Compiled successfully`. tsc: 0 errors. localhost: 307.
- Structural greps: gate=contentType (PASS); 6 contentType sites; fileBase64 field removed (comments only).
