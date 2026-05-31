# DIAG-058 — PDF Plan Interpretation REGRESSED — FINDINGS

## Status: COMPLETE (read-only; no code edited, no SQL, no fix, no PR)
## HEAD SHA: `2077b168bc7895d9d2dea39dd4234a8ce9aceadd` (branch `dev`, == `main`)
## Date: 2026-05-31

> Read-only diagnostic. Evidence pasted (Rule 27), executed path traced (Rule 21). Root
> cause + regression commit pinned; restoration scoped; **no fix implemented**.

---

## ROOT CAUSE (one line)
**H1 CONFIRMED, H2 REFUTED.** HF-248 (`e478a2fa`, PR #436, 2026-05-22) replaced the single
`interpretPlan` call with a multi-phase orchestrator whose phase calls dispatch **new task
names** (`plan_skeleton`, `plan_component`) that were **never added to the adapter's PDF
document-block gate** (`anthropic-adapter.ts:1032`, which still lists only
`plan_interpretation`/`document_analysis`). `pdfBase64` is threaded all the way through the
orchestrator and the AI-service, but the adapter never attaches the document block for the
new tasks — so for a PDF, every phase call sees only the ~34-char placeholder, the model
returns prose ("I notice t…"), and the JSON parser rejects it.

---

## P1 — Live PDF branch + placeholder (`plan-interpretation.ts`)
```
56:  let documentContent = '';
57:  let pdfBase64ForAI: string | undefined;
60:  if (ext === 'pdf') {
61:    pdfBase64ForAI = fileBuffer.toString('base64');
62:    pdfMediaType = 'application/pdf';
63:    documentContent = `[PDF document: ${pdfBase64ForAI.length} bytes base64]`;   // placeholder
145:  console.log(`[SCI plan-interp] Interpretation starting — ${documentContent.length} chars`);   // logs placeholder length
157:  const orchestration = await orchestratePerComponentInterpretation({
159:    format: pdfBase64ForAI ? 'pdf' : 'text',
160:    pdfBase64: pdfBase64ForAI,
161:    pdfMediaType,
```
- The PDF placeholder is `[PDF document: <N> bytes base64]`. For this file (base64 length
  62572) it is **exactly 34 chars** (see P5) — matching the live `34 chars` log.
- The batched function **does** pass `pdfBase64`/`pdfMediaType`/`format:'pdf'` into the
  orchestrator. The content channel is intact at THIS layer.

## P2 — Orchestrator forwards `pdfBase64` to BOTH phases (NOT the drop layer)
`plan-orchestration.ts` — **Phase A YES**, **Phase B YES**:
```
146:    const resp = await aiService.interpretPlanSkeleton(
147:      input.documentContent,
150:      input.pdfBase64,        ← Phase A forwards pdfBase64
151:      input.pdfMediaType,
...
220:    const componentResult = await callPlanComponentWithRetry({
221:      documentContent: input.documentContent,
223:      pdfBase64: input.pdfBase64,        ← Phase B forwards pdfBase64 (per component)
224:      pdfMediaType: input.pdfMediaType,
```
The orchestrator (and `interpretPlanSkeleton`/`interpretPlanComponent` in `ai-service.ts`,
which set `input.pdfBase64`) RECEIVE and FORWARD the document block on both phases. **The
orchestrator is NOT where `pdfBase64` is dropped.**

**The exact drop layer — `ai-service.ts` task names vs the adapter gate:**
```
ai-service.ts:257  interpretPlan        → task: 'plan_interpretation'   (OLD single call)
ai-service.ts:287  interpretPlanSkeleton→ task: 'plan_skeleton'         (HF-248 Phase A)
ai-service.ts:324  interpretPlanComponent→ task: 'plan_component'        (HF-248 Phase B)
```
The phase calls set `input.pdfBase64` (ai-service 281-283, 318-320) — but the adapter only
attaches the document block for the OLD task name (see P3).

## P3 — Adapter document-block gate EXCLUDES the new tasks (the drop point)
`anthropic-adapter.ts:1028-1049`:
```
1028:    const pdfBase64 = request.input.pdfBase64 as string | undefined;
1032:    if (pdfBase64 && (request.task === 'plan_interpretation' || request.task === 'document_analysis')) {
1037:      messageContent = [
1039:          type: 'document',
1040:          source: { type: 'base64', media_type: pdfMediaType, data: cleanBase64 },
...
```
GIVEN `pdfBase64`, the adapter DOES build a document block — but ONLY when
`request.task === 'plan_interpretation' || 'document_analysis'`. The orchestrator's
`plan_skeleton` and `plan_component` tasks are NOT in this condition, so the block is never
attached for them. (The adapter's prompt-building DOES have `case 'plan_skeleton'` (1246)
and `case 'plan_component'` (1259) — so the text prompt asks the model to interpret a PDF,
while no PDF is actually attached. That mismatch is exactly the "I notice…" prose.)
**Fix shape confirmed: "forward the task through the gate," not "teach the adapter PDF."**

## P4 — Regression pinned (git history)
```
e478a2fa 2026-05-22 08:48:10  HF-248: Per-component plan interpretation ... (#436)   ← REGRESSION
4e302c98 2026-02-25 22:07:50  OB-103 Phase 2: Plan Import — PDF support + multi-file   ← added the 1032 gate (plan_interpretation only)
```
- `git log -S "'plan_skeleton'" -- ai-service.ts` → first appears in **`e478a2fa` (HF-248)**.
- `git log --diff-filter=A -- plan-orchestration.ts` → created in **`e478a2fa` (HF-248)**.
- `git log -S "'plan_skeleton'" -- anthropic-adapter.ts` → `e478a2fa` added the prompt-build
  cases (1246/1259) but the document-block gate (1032) was NOT extended (its only history is
  OB-103 `4e302c98` + DIAG-056 `1f041531`, neither adds the new tasks).
- **Timeline:** CRP PDF plans reconciled in production **2026-05-18** (via single-call
  `interpretPlan` → `plan_interpretation` → gate attaches the block). HF-248 merged
  **2026-05-22** — AFTER the proof — and regressed it. The capability worked; a refactor broke it.
- **Last commit forwarding the PDF document block in the interpretation path:** the
  pre-HF-248 `interpretPlan` single call (`plan_interpretation`); HF-248 replaced it.

## P5 — PDF artifact is SOUND (H2 refuted)
Downloaded `ingestion-raw/e44bbcb1-…/1780235446735_0_e68ca9d8_CRP_Plan_1_Capital_Equipment.pdf`
(one-off read-only probe, not committed):
```
byteSize:        46928          ← not empty/corrupt
base64Length:    62572
header:          %PDF-1.7       ← valid PDF
placeholderString: "[PDF document: 62572 bytes base64]"
placeholderLength: 34           ← EXACTLY the live log's "34 chars" — confirms the model got the placeholder, not the PDF
crudeTextProbe:  { btTextBlocks: 0, parenStringOperands: 50 }
```
- The PDF is a valid 46 KB `%PDF-1.7` document — **H2 (empty/corrupt) is refuted.**
- The crude text-layer probe sees no `BT…ET` text operators because the content streams are
  FlateDecode-compressed (the parenthesized "operands" are binary/compressed noise — the
  preview was garbage). This is NOT a finding against interpretability: Claude's document
  block reads compressed text layers AND renders pages (vision). With the block forwarded,
  this PDF is interpretable. No extraction lib was available; none was added (per directive).

## P6 — Raw model response (existing logs only; no logging added)
The orchestrator surfaces the adapter's parse-error message as `skeletonError`
(`plan-orchestration.ts:166-172`); the only captured prose is the truncated
`"…Unexpected token 'I', \"I notice t\"… is not valid JSON"` from §1.2. The full
`"I notice …"` string is not captured beyond that truncation in existing logs, and this DIAG
adds none. (DIAG-056 `1f041531` added LLM-response capture elsewhere; not relied on here.)

---

## ROOT CAUSE
**H1 (leading hypothesis) is CONFIRMED; H2 is REFUTED; HALT-A does not apply.** The
multi-phase orchestrator refactor (HF-248) introduced new task names `plan_skeleton` and
`plan_component`; the adapter's PDF document-block gate (`anthropic-adapter.ts:1032`) was
left listing only the OLD `plan_interpretation`/`document_analysis`. `pdfBase64` flows
correctly through the orchestrator (Phase A + Phase B) and the AI-service into
`request.input.pdfBase64`, but the adapter never attaches the document block for the new
tasks — so for a PDF every phase call receives only the 34-char placeholder. Deciding
evidence: (1) P3 — the gate condition excludes `plan_skeleton`/`plan_component`; (2) P1/P5 —
the placeholder is exactly 34 chars, matching the live log, proving the model got the
placeholder; (3) P4 — HF-248 introduced the new tasks + orchestrator but not the gate
extension, and merged (2026-05-22) after the CRP PDF production proof (2026-05-18); (4) P5 —
the PDF is a sound 46 KB `%PDF-1.7`, so the cause is not the artifact.

## RESTORATION DELTA (scoping the fix — NOT performed here)
- **OLD (working) single-call path forwarded:** `interpretPlan(documentContent, format, ctx,
  pdfBase64, pdfMediaType)` → task `plan_interpretation` → adapter gate (1032) attaches the
  `{type:'document', source:{type:'base64', media_type, data}}` block. One call, one task in
  the allowlist.
- **LIVE orchestrator forwards:** `pdfBase64` reaches the adapter on **both** phase calls
  (Phase A `plan_skeleton`, Phase B `plan_component`) via `request.input.pdfBase64`, but the
  adapter gate (1032) drops it because neither task is in the allowlist.
- **What the restoration must thread:** extend the adapter's document-block gate at
  `anthropic-adapter.ts:1032` to include the orchestrator's plan phase tasks — at minimum
  `plan_skeleton` AND `plan_component` (both reach the model and both need the source PDF).
  Candidate additional tasks to include if they can carry a PDF: `plan_component_chunked`
  (`ai-service.ts:341`) and `plan_chunk` (`:380`) — the architect confirms which phase tasks
  carry `pdfBase64` and adds them all (the structural fix is one gate condition, not a
  per-call patch — SR-34). **Both Phase A and Phase B already forward `pdfBase64`; only the
  adapter gate excludes them.** The cleanest form is to attach the document block whenever
  `pdfBase64` is present for any plan/document phase task.
- **DD-7 (preserve):** XLSX/PPTX/DOCX plans carry real TEXT in `documentContent` and never
  used the document block (their `pdfBase64` is undefined), so widening the gate does not
  alter the text-channel paths — they remain byte-identical.

---

## RESIDUALS (recorded, not addressed)
- **Robustness (separate HF):** Phase A surfacing a prose response as `JSON parse failed:
  Unexpected token 'I'…` is a poor failure mode; an insufficient/invalid-content response
  should be reported as "plan content could not be read." (§6A)
- **PPTX coverage check (separate):** run a PPTX plan through the current orchestrator to
  confirm the text channel still serves that format end-to-end (the prior chain claimed "all
  formats" without exercising PDF or, recently, PPTX). (§6A)
- **PDF text layer (informational):** this PDF's streams are compressed; the document-block
  path relies on Claude's native PDF reading (text + vision). No in-process OCR implied.

## COMPLIANCE CHECKLIST
- [x] HEAD SHA recorded; executed path traced (Rule 21); evidence pasted (Rule 27).
- [x] P1–P6 executed; Phase A YES / Phase B YES on forwarding, drop layer identified (adapter gate 1032).
- [x] Regression commit pinned (HF-248 `e478a2fa`, 2026-05-22) vs original gate (OB-103 `4e302c98`).
- [x] PDF artifact inspected (46 KB, %PDF-1.7) → H2 refuted; placeholder length 34 matches log.
- [x] Root Cause (H1) + Restoration Delta stated. No code edited; no SQL; no PR; one-off probe removed.

*DIAG-058 — read-only. Root cause: HF-248 adapter document-block gate (anthropic-adapter.ts:1032)
omits `plan_skeleton`/`plan_component`. Restoration: extend the gate to the orchestrator's plan
phase tasks (one structural condition). Architect scopes the HF.*
