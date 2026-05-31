# AUD-0015 — COMPLETION REPORT

## Classification: AUD (read-only live-code trace → SSOT artifact). No code edited, no SQL, no PR code change.
## HEAD SHA: `dede922b3b7d1257641f746b1d8ddbc136ac1b3d` (branch `dev` == `main`)
## Date: 2026-05-31

## Deliverable (the SSOT)
`docs/code-references/SCI_INGESTION_PLAN_EXECUTION_TRACE_LIVE_dede922b.md` — the ingestion →
plan-interpretation execution trace, companion to `AUD-005_CALC_EXECUTION_LIVE_REFERENCE`.
Placed in `docs/code-references/` (alongside the cited AUD-005 peer) rather than the
directive's literal `docs/reference/`, so it is findable as a true peer; refresh discipline
recorded in its header.

## Files mapped (26 spine files; inventory in the artifact)
Ingestion: `page.tsx`, `SCIUpload`, `SCIExecution`, `analyze/route`, `analyze-document/route`.
Hub: `execute-bulk/route`, `file-format`, `commit-content-unit`, `process-job/route`.
Interpretation: `plan-interpretation`, `plan-orchestration`, `ai-service`, `anthropic-adapter`,
`ai-plan-interpreter`, `plan-comprehension-emitter`, `reimport-resume`, `prime-validator`.
Cross-cutting: `flywheel-signal-emission`, `assignment-creation`, `store-metadata-population`,
`import-batch-supersession`, `field-identities`, `sci-types`.

## Phase completion (each produced its artifact section, evidence pasted — Rule 27)
- **P0 anchor + inventory** — DONE (HEAD, 12-commit history, file inventory table).
- **P1 ingestion & transport** — DONE (upload set, per-file route, unified proposal, storagePaths thread, AP-1 sites).
- **P2 execute-bulk hub** — DONE (per-file parse loop, format gate, dispatch decision table, sole plan path confirmed HF-257).
- **P3 orchestrator + A1** — DONE (per-format extraction, Phase A/B calls, AI-task→document-block table).
- **P4 re-entry + A2** — DONE (re-entry map; A2 class confirmed, trigger HALT-2-bounded).
- **P5 cross-cutting** — DONE (fingerprint/moat, signals, AP-1 ledger, schema-touchpoint table).
- **P6 calc boundary** — DONE (rule_set+signals handoff to AUD-005; drift note: AUD-005 SHAs predate per-variant shape HF-251/252/253).
- **P7 assemble + anomaly register** — DONE (A1 + A2 as AUD-style findings, fix-shape only).

## A1 — complete task-set the document-block gate must include (resolves DIAG-058)
Six plan/document AI tasks set `pdfBase64`; the gate (`anthropic-adapter.ts:1032`) admits only
`plan_interpretation` + `document_analysis`. **Excluded (must be added):** `plan_skeleton`,
`plan_component`, `plan_component_with_chunking`, `plan_chunk`. Origin: HF-248 (`e478a2fa`)
introduced the orchestrator tasks + their prompt-build cases (`:1246/1259/1290/1322`) but not
the gate. Primary executed PDF path uses `plan_skeleton` (Phase A) + `plan_component` (Phase B);
the chunk variants are reachable via decomposition and also exclude the block. Fix-shape:
attach the document block whenever `pdfBase64` is present for any plan/document task.

## A2 — duplicate plan-interpretation run (mechanism + the precise source limitation)
**Class confirmed:** two `executeBatchedPlanInterpretation` runs → two rule_sets (each
`crypto.randomUUID()`; the second supersedes all prior at `plan-interpretation.ts:211-216`).
The shared batch id is an artifact of `persistComponentOutcomes` attaching to the tenant's
most-recent import_batch (`reimport-resume.ts:194`), not resume-reuse (resume requires
`partialSuccess`). A second run requires a second execute-bulk POST; **source shows no
server-side idempotency** (`proposalId` received at `execute-bulk:120`, never used to dedupe)
and **no automatic re-POST** (the timeout path's `pollPlanRecovery` is poll-only). Source-visible
re-dispatch edges: `handleRetryFailed` (user retry, clears the initial dual guard) or a fresh
remount. **HALT-2 (partial):** the specific trigger for the `e2680bbd` incident is NOT
determinable from source — it needs runtime evidence (two POST timestamps, client `AbortError`
presence, whether a retry click ran). Same class as the BCL 2026-05-21 "two active rule_sets
60s apart" incident referenced at `plan-interpretation.ts:208-210` (HF-244 made it single-active
but did not prevent the duplicate run/save). Fix-shape: server-side idempotency on
(tenant, plan storagePath/proposalId).

## Calc-boundary note
Produces active `rule_sets` (variants/bindings/cadence) + comprehension signals + committed_data;
AUD-005 consumes them at calc. AUD-005 SHAs (`5314c365`/`f6e3dca1`) predate per-variant shape
changes (HF-251/252/253) — flag to refresh AUD-005 if its boundary contract assumed the older
flat-component shape.

## Standing-rule observations (lenses, not edits)
AP-17: plan interpretation is single-path (HF-257 verified). AP-1: `documentMetadata.fileBase64`
unconsumed at execute (retirement candidate). Korean Test: no domain/language literal on the spine.

## Out of scope / not done
No code change; A1 and A2 remediation HFs are architect-scoped from the trace. Calc internals
owned by AUD-005. The trace refreshes to a new SHA version when any mapped surface changes.
