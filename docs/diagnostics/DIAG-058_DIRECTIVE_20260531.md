# DIAG-058: PDF Plan Interpretation REGRESSED — Document Block Lost in the Multi-Phase Orchestrator Refactor
# Classification: DIAG (read-only diagnostic + git-history + artifact inspection) — regression analysis for a restoration
# Repo: CCAFRICA/spm-platform (VP)
# Date: 2026-05-31
# Sequence: DIAG-058 — confirm of-record before logging
# File path (this directive): docs/diagnostics/DIAG-058_DIRECTIVE_20260531.md

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` before starting. This is a **read-only** diagnostic: source reads, `git log`/`git blame`, and one **artifact inspection** (download + inspect a stored file). **No source code is edited. No SQL is run. No fix is implemented.** Output is a findings report with pasted evidence.

- Diagnostic discipline (`CC_DIAGNOSTIC_PROTOCOL.md`): Rule 21 — trace the ACTUAL executed code path; Rule 22 — source-trace first.
- Evidence means PASTE, not describe (Completion Report Rule 27).
- zsh: single-quote every grep pattern.

This file IS the prompt (DD-11): no execution block, no paste block, no tail. It ends at §6A.

---

## §1 — Problem Statement

### 1.1 — This is a REGRESSION of a PROVEN capability (not a missing feature)
PDF plan interpretation is a **proven, shipped capability**. CRP/Caribe imported **4 plans from PDFs**, interpreted them, and calculated to proven baselines in production (CRP Plans 1+3 PASS, production 2026-05-18). `DUAL_OBJECTIVE_PROOF_TENANT_3_PLUS_CAPABILITIES.md` records "PDF plan interpretation" and "PDF plan import working" as a completed proof milestone. **Do not treat this as a never-worked gap. It worked, and a refactor broke it.** The objective (Decision 82: any file, any format) explicitly includes PDF plans; until this is restored, the objective is not met.

### 1.2 — Observed failure (live, 2026-05-31, tenant `e44bbcb1-2710-4880-8c7d-a1bd902720b7`)
Importing `CRP_Plan_1_Capital_Equipment.pdf`:
```
[SCI Bulk] HF-256: document file (.pdf) — skipping workbook parse; plan unit routes to format-aware plan pipeline
[SCI Bulk] CRP_Plan_1_Capital_Equipment.pdf: parsed 0 rows across 0 sheets in 754ms
[SCI plan-interp] Batched interpretation: 1 sheets from e44bbcb1-.../...CRP_Plan_1_Capital_Equipment.pdf
[SCI plan-interp] Interpretation starting — 34 chars
[plan-orchestrator] Phase A skeleton call — 34 chars
[error] [plan-orchestrator] Phase A skeleton response invalid (2678ms): JSON parse failed: Unexpected token 'I', "I notice t"... is not valid JSON
[error] [SCI plan-interp] Refusing to persist rule_set — Plan skeleton call failed: ...
```

### 1.3 — Already established (do NOT re-litigate)
- **Routing is correct** — HF-256 (format-aware execute) and HF-257 (single batched plan pipeline) behaved correctly; the PDF reached the batched plan path. This DIAG is NOT about routing.
- **Refusal is correct** — no garbage rule_set was persisted.
- The failure is **inside plan interpretation, at the Phase A skeleton call.**

### 1.4 — The mechanism (grounded in the old, working code)
The OLD plan interpreter (March, `AUD-001_CODE_EXTRACTION.md`, the batched function) handled PDF like this:
```
if (ext === 'pdf') {
  pdfBase64ForAI = fileBuffer.toString('base64');
  pdfMediaType = 'application/pdf';
  documentContent = `[PDF document: ${pdfBase64ForAI.length} bytes base64]`;   // ~34-char PLACEHOLDER
}
...
const response = await aiService.interpretPlan(
  documentContent,                       // placeholder for PDF; real TEXT for xlsx/pptx/docx
  pdfBase64ForAI ? 'pdf' : 'text',
  { tenantId },
  pdfBase64ForAI, pdfMediaType           // <-- PDF content rides HERE, as a document block
);
```
So for a PDF, the real content is carried by `pdfBase64` as a **document block**, and `documentContent` is only a ~34-char placeholder. The `34 chars` logged at `Interpretation starting` and `Phase A skeleton call` is **that placeholder's length, not the PDF's content.** The model's `"I notice t..."` prose is consistent with the model receiving only the placeholder and **not** the PDF document block — so it reports no plan to interpret, and the JSON parser rejects the prose.

The OLD interpreter was a **single** `interpretPlan` call. The LIVE interpreter is a **multi-phase orchestrator** (`[plan-orchestrator] Phase A skeleton` → `[plan-component]` Phase B per-component) — visible in every current plan log. Text formats (XLSX/PPTX/DOCX) survive the orchestrator because their content is TEXT in `documentContent`. **PDF is the only format that depends on the `pdfBase64` document-block channel** — and the symptom indicates the orchestrator's phase calls do not forward it.

### 1.5 — Hypothesis (to confirm and pin)
**H1 (leading):** the refactor from single-call `interpretPlan` to the multi-phase orchestrator (Phase A skeleton + Phase B components) **dropped the PDF document-block forwarding**. The orchestrator's phase calls build their model requests from the text `documentContent` and do not attach a document block from `pdfBase64`. Result: for a PDF, every phase sees only the placeholder.

**H2 (alternative):** the orchestrator DOES forward the document block, but this specific PDF is empty/corrupt/unreadable.

This DIAG determines which, **pins the commit where it changed (git history)**, and documents the OLD working forwarding so the restoration can re-apply it into the unified structure. It implements no fix.

### 1.6 — Restoration framing (the fix this DIAG scopes — not performed here)
The remediation is a **restoration into the unified structure**: re-apply the document-block forwarding the single-call path had, adapted to the multi-phase orchestrator. Structural wrinkle the unification introduces: the orchestrator makes **multiple** model calls (Phase A skeleton, then one Phase B call per component). For a PDF there is no extracted text to carry, so **every phase call that needs the source content must receive the `pdfBase64` document block** — new threading the single-call path never required. The diagnostic must therefore report, for BOTH Phase A and Phase B, what content each call sends and whether `pdfBase64` reaches it.

---

## §2 — Substrate-Bound Discipline

- **SR-34 (fix the class, structurally):** the fix restores a transport channel through the unified orchestrator — not a per-call patch. The DIAG must locate every phase call that needs the document block.
- **DD-7 (preserve working behavior):** XLSX/PPTX/DOCX plan interpretation currently works via the `documentContent` text channel and must remain byte-identical after the eventual fix. Confirm the text channel is untouched by the contemplated change.
- **Restoration over invention (architect directive):** the OLD single-call logic is the authoritative reference for WHAT to forward (`pdfBase64` + `pdfMediaType`) and HOW the adapter consumes it. The unified structure determines WHERE it threads. Capture both.
- No standing rule dictates a code change in this DIAG. Any locked-rule conflict → surface per SR-42 and halt.

---

## §3 — Phases (all read-only / git / inspect-only)

Execute in order; paste raw output for each. No edits.

### §3.1 — Phase 1: Confirm the live PDF branch still sets the placeholder and captures `pdfBase64`
```bash
cd ~/spm-platform
git rev-parse HEAD
echo '=== live PDF branch in the batched plan function ==='
grep -nE "ext === 'pdf'|pdfBase64|pdfMediaType|PDF document:|documentContent =|interpretPlan\(" web/src/lib/sci/plan-interpretation.ts
echo '=== the interpretPlan call signature as invoked (are pdfBase64 + pdfMediaType still passed?) ==='
sed -n '/interpretPlan(/,/);/p' web/src/lib/sci/plan-interpretation.ts | head -20
echo '=== confirm the logged char count is documentContent.length (=> 34 == placeholder length) ==='
grep -nE 'Interpretation starting|chars`' web/src/lib/sci/plan-interpretation.ts
```
Report: the live PDF placeholder string; confirmation `34 chars` is the placeholder length; whether `pdfBase64`/`pdfMediaType` are still passed into `interpretPlan`.

### §3.2 — Phase 2: Read the LIVE orchestrator — Phase A skeleton AND Phase B component calls (THE regression point)
Locate `interpretPlan`'s definition, the orchestrator, and BOTH phase model calls.
```bash
cd ~/spm-platform
echo '=== locate interpretPlan + orchestrator + phase calls ==='
grep -rnE 'interpretPlan|plan-orchestrator|Phase A skeleton|skeleton call|orchestratePerComponent|phaseA|phaseB|generateSkeleton|constructComponent' web/src --include='*.ts' | head -50
echo '=== PHASE A skeleton: paste the block that assembles the model request/messages ==='
# (use the orchestrator file path the grep reveals; e.g. web/src/lib/ai/plan-orchestrator.ts)
echo '--- does Phase A attach a document block from pdfBase64, or build from documentContent text only? ---'
echo '=== PHASE B component construction: paste the block that assembles the per-component model request ==='
echo '--- does each Phase B component call receive/forward pdfBase64, or only skeleton + documentContent? ---'
echo '=== does the orchestrator (and interpretPlan) even RECEIVE pdfBase64/pdfMediaType in their signatures? ==='
grep -nE 'pdfBase64|pdfMediaType|documentContent|content:|messages:|function .*[Pp]lan|=> ' <orchestrator_file_path> | head -40
```
Report, with pasted code, answering plainly: (a) do `interpretPlan` and the orchestrator **receive** `pdfBase64`/`pdfMediaType`? (b) does the **Phase A skeleton** model call attach a document block from `pdfBase64`, or build solely from `documentContent`? (c) does **each Phase B component** call receive/forward `pdfBase64`? State the YES/NO for **both phases** and identify the exact layer where `pdfBase64` is dropped.

### §3.3 — Phase 3: Confirm the adapter still builds a document block from `pdfBase64`
```bash
cd ~/spm-platform
echo '=== adapter: document-block assembly from pdfBase64 ==='
grep -rnE 'pdfBase64|type:..document|media_type|application/pdf|source:|document block' web/src/lib/ai --include='*.ts' | head -30
echo '--- paste the message-assembly block that branches on pdfBase64 ---'
```
Report: whether the adapter, GIVEN `pdfBase64`, produces a document block. This confirms the fix is "forward `pdfBase64` through the orchestrator to the adapter," not "teach the adapter PDF."

### §3.4 — Phase 4: GIT HISTORY — pin WHEN the document block was lost (the regression commit)
The capability worked through ~2026-05-18 (CRP production). Find when the single-call interpreter became the multi-phase orchestrator and whether `pdfBase64` was ever threaded through it.
```bash
cd ~/spm-platform
echo '=== history of the orchestrator file (creation + relevant changes) ==='
git log --oneline --follow -- <orchestrator_file_path> | head -30
echo '=== history of plan-interpretation.ts around the interpretPlan call / PDF branch ==='
git log --oneline -S 'pdfBase64' -- web/src/lib/sci/plan-interpretation.ts | head -20
git log --oneline -S 'Phase A skeleton' -- web/src --all | head -20
echo '=== when did pdfBase64 forwarding last exist in the interpretation path? (pickaxe) ==='
git log --oneline -S 'pdfBase64' -- web/src/lib/ai | head -30
echo '=== blame the Phase A skeleton model-call lines to date the change ==='
# git blame -L <start>,<end> <orchestrator_file_path>
```
Report: the commit/date the multi-phase orchestrator was introduced; whether `pdfBase64` was EVER forwarded through it; the last commit where the interpretation path forwarded the PDF document block. This pins the regression and confirms the restoration target.

### §3.5 — Phase 5: Inspect the actual PDF artifact (rule out H2)
Download the stored PDF (read-only; a one-off `scripts/` file is acceptable, do not commit unless asked).
```bash
# Using the Supabase service-role client (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY),
# download from bucket 'ingestion-raw':
#   e44bbcb1-2710-4880-8c7d-a1bd902720b7/1780235446735_0_e68ca9d8_CRP_Plan_1_Capital_Equipment.pdf
# Report:
#   1. byte size (rule out empty/corrupt)
#   2. base64 length (corroborate the placeholder <N> vs the ~34-char log)
#   3. extractable text-layer char count (use an available method; if none, report and skip — do NOT add a dependency)
#   4. first ~200 chars of any extracted text (confirm it reads as a real plan document)
```
Report all four. Context: Claude's PDF document block reads both the text layer and rendered pages (vision), so a thin/absent text layer is still interpretable IF the document block is forwarded — H1 remains primary even then.

### §3.6 — Phase 6: Capture the raw model Phase A response (if already logged)
If the orchestrator already surfaces the raw Phase A response, report the full `"I notice ..."` string. Do NOT add logging in this DIAG. If not captured, say so and report only existing logs.

---

## §4 — HALT Conditions
- **HALT-A:** Phase 2 shows the orchestrator DOES forward the `pdfBase64` document block on BOTH Phase A and Phase B, AND Phase 5 shows the PDF is sound → both hypotheses refuted; stop and report for re-scope (cause is elsewhere — e.g. response-format/prompt).
- **HALT-B:** the executed path differs materially from §1.4/§3.1 (e.g. PDFs are now text-extracted in process, or `interpretPlan` is not the executed function) → stop and report the actual path.
- **HALT-C (SR-42):** a locked rule appears to dictate a code change → surface it verbatim, name the action, halt. Do not implement.

---

## §5 — Reporting Discipline
Output: `docs/diagnostics/DIAG-058_OUTPUT.md`. Structure: HEAD SHA → P1 (live PDF branch + interpretPlan args) → P2 (**Phase A YES/NO + Phase B YES/NO on document-block forwarding; the exact drop layer**, pasted orchestrator code) → P3 (adapter document-block assembly, pasted) → P4 (**regression commit/date** the orchestrator replaced the single-call path; last commit forwarding the PDF document block) → P5 (PDF size / base64 len / text-layer / preview) → P6 (raw model response if available) → a **Root Cause** paragraph naming H1/H2/HALT-A with deciding evidence, AND a **Restoration Delta** paragraph: what the OLD single-call path forwarded vs what the live orchestrator forwards, and which phase calls must be threaded to restore it.

CC states findings only; proposes no fix and authors no fix here. The restoration HF is scoped by the architect from this report.

---

## §6 — Out of Scope
- **Any code fix.** The restoration HF (re-apply the PDF document-block forwarding into the multi-phase orchestrator — threaded to Phase A skeleton and every Phase B component call that needs source content, mirroring the old single-call path and the adapter's existing document-block support; text-format paths preserved byte-identical) is scoped after this report.
- **The JSON-parse-on-prose robustness gap** (§6A) — named, not fixed.
- HF-256/257 routing — confirmed working; not re-examined.

## §6A — Residuals
- **Robustness (separate HF):** Phase A surfacing a prose response as `JSON parse failed: Unexpected token 'I'...` is a poor failure mode independent of the PDF cause; an insufficient/invalid-content response should be caught and reported as "plan content could not be read." Record; do not address here.
- **Format-coverage verification (avoid repeating the myopia):** XLSX plan interpretation through the orchestrator is proven (live BCL/Meridian XLSX runs). A **PPTX** plan should also be run through the current orchestrator to confirm the text channel still serves that format end-to-end — the prior chain claimed "all formats" without exercising PDF or, recently, PPTX. Track as a coverage check, separate from this DIAG.
- **PDF text-layer (informational):** if Phase 5 shows image/scanned PDF, confirm at fix-time the document-block path relies on model vision (it does); no in-process OCR is implied.
