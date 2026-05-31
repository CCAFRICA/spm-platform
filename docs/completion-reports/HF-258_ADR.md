# ARCHITECTURE DECISION RECORD — HF-258

*1C Content-Channel Unification (Q2) + Transport Retirement (Q5)*
*First implementation slice of the locked 1C path design (IRA Path_Comprehensive 2026-05-31).*
*SSOT map: `docs/code-references/SCI_INGESTION_PLAN_EXECUTION_TRACE_LIVE_dede922b.md` (AUD-0015).*
*Committed BEFORE any implementation code (Architecture Decision Gate).*

## Problem (structural, confirmed at HEAD `628d3100`)
Plan content reaches the interpretation model through two channels keyed on FORMAT: text formats
(XLSX/PPTX/DOCX) extract to in-band text (`documentContent`); PDF rides a base64 document-block
channel (`pdfBase64`). The document block is ATTACHED only by a task-name allowlist at
`anthropic-adapter.ts:1032` (`plan_interpretation` || `document_analysis`), excluding the
orchestrator's `plan_skeleton`/`plan_component`/`plan_component_with_chunking`/`plan_chunk`. PDF
content is therefore silently dropped on the orchestrator's primary phases → PDF plan
interpretation regressed (DIAG-058). Root cause: **format/task functions as the dispatch branch
for content attachment** (Korean-Test violation). Compounding: `documentMetadata.fileBase64` is set
(`analyze-document:240-241`) and forwarded (`SCIExecution:252/317`) in request bodies but consumed
by nothing at execute (HALT-3 verified) — a dead base64 transport (AP-1 concern).

## Live structure (confirmed — the design fits without out-of-scope change; HALT-1 does NOT fire)
- Extraction (`plan-interpretation.ts:56-128`): `pdfBase64ForAI` set for PDF (`:61`, base64 from the
  storage-downloaded buffer) with a placeholder `documentContent` (`:63`); text formats fill
  `documentContent`. **This is the single upstream point where text-vs-document is decided** — the
  content-unit production point.
- A discriminator already threads uniformly: `format: 'text' | 'pdf'` (`plan-orchestration.ts:60,318`)
  passed to BOTH Phase A (`interpretPlanSkeleton`, `:146-151`) and Phase B
  (`interpretPlanComponent`, `:380-386`). Phases already consume content uniformly.
- The adapter's per-task prompt-build already dispatches on `!!input.pdfBase64` (`:1187/1248/1264/
  1296/1327`). **Only the attachment gate (`:1032`) uses the task-name allowlist** — the sole
  format-as-branch.

## Decision (instantiated design)
1. **Explicit content-unit type at ingestion.** `plan-interpretation` derives
   `contentType: 'text' | 'document'` at extraction (`document` iff `pdfBase64ForAI` present) and
   passes it into the orchestrator input — the design's "produced once at ingestion" requirement.
2. **Uniform consumption.** The orchestrator threads `contentType` to every phase call (skeleton +
   per-component + chunk variants); `ai-service` plan methods accept it and set `input.contentType`.
3. **Adapter dispatches on content-unit TYPE, not task name.** Replace `:1032`'s task-name condition
   with: `const contentType = input.contentType ?? (pdfBase64 ? 'document' : 'text'); if (pdfBase64
   && contentType === 'document') attach`. The `?? (pdfBase64 ? 'document':'text')` fallback makes the
   adapter self-sufficient and **regression-proof**: any task carrying a document payload (incl. the
   previously-working `plan_interpretation`/`document_analysis`) attaches; the task-name discriminator
   is gone (Korean-Test correction). Every plan/document task now attaches for document content.
4. **Transport retirement (Q5).** Remove the `fileBase64` property from `documentMetadata` (sci-types,
   execute-bulk type, analyze-document set, SCIExecution forward). Keep a minimal
   `documentMetadata?: { mimeType?: string }` so the proposal-UI doc-plan flag (`SCIProposal:89`,
   `!!unit.documentMetadata`) is preserved. No file bytes travel in request bodies; document content
   is referenced by `storagePath` and base64 is materialized server-side from storage in the SCI
   layer (`plan-interpretation:61`, already in-process — AP-1 satisfied).

## Materialization-location decision (ADR-level; architect-confirmable)
The directive language is "base64 materialized at adapter time from storage." This ADR keeps base64
materialization in the **SCI server layer** (`plan-interpretation`, which already holds the storage
client and materializes from the downloaded buffer at `:61`), passing it in-process to the adapter,
rather than giving the **AI-provider adapter** a Supabase-storage dependency. Rationale: both are
"server-side, from storage, no body bytes" (identical AP-1/Q5 posture); SCI-layer materialization
preserves provider-adapter layering (the adapter stays storage-agnostic). This equally satisfies Q2
(all phases via contentType dispatch) + Q5 (dead body field removed; storage-reference-only body
transport). Flagged for architect confirmation; literal adapter-time materialization is a no-outcome-
change follow-up if preferred.

## DD-7 proof plan (text formats byte-identical)
A `text` content unit sets no `pdfBase64`; the adapter's derived `contentType='text'` → no document
block → identical text-only message content as today. Text-format extraction (`documentContent`) is
untouched. The orchestrator phase calls are unchanged except an added `contentType` arg that the
adapter only acts on for `document`. Verified by EPG (PPTX + XLSX through the unchanged text channel).

## Scope / preserve
In scope: Q2 (content channel) + Q5 (dead-field retirement). PRESERVE untouched: single plan code
path (HF-257), structural-fingerprint moat, calc handoff, all text-format interpretation. OUT OF
SCOPE (later 1C slices, §6): idempotency+supersession audit (Q3+Q6, the duplicate-run), scale/parallel
(Q4), calc internals, VG substrate work.

## Anti-pattern check
- Korean Test: attachment dispatches on structural content-type, zero format/task-name literals gating
  content. - AP-1: no body bytes; storage-reference transport. - AP-17: single plan path unchanged.
- SR-34: fixes the channel class, not the PDF instance (rejects the narrow gate-extension, §1.4).
