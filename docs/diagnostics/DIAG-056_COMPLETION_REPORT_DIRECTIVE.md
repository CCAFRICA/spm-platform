# CC Directive: Produce DIAG-056 Completion Report

**§0 CC Standing Rules**

Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.
Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.

---

## Context

DIAG-056 work was completed (commit `161e3678` on dev, log line added to `anthropic-adapter.ts` lines 806-822). Findings were reported in chat. The required completion report file at `docs/completion-reports/DIAG-056_COMPLETION_REPORT.md` was not created. This violates SOP — Rules 25-28 require a completion report file for every work item.

This directive does not perform additional diagnostic work. It produces the deliverable artifact for work already shipped.

---

## Task

Create `docs/completion-reports/DIAG-056_COMPLETION_REPORT.md` containing the verbatim findings already reported. The report must include:

### Section 1 — LLM response receive site

The verbatim code at `web/src/lib/ai/providers/anthropic-adapter.ts:806-814` (pre-log), with file path and line numbers.

### Section 2 — Component extraction sites

The verbatim code for:
- `web/src/lib/compensation/ai-plan-interpreter.ts:259-275` (`validateAndNormalizePlanInterpretation`)
- `web/src/lib/compensation/ai-plan-interpreter.ts:186-216` (`normalizeComponents`)

### Section 3 — Silent failure path

The verbatim code at `web/src/lib/ai/providers/anthropic-adapter.ts:1066-1091` (`parseJsonResponse`). Explain:
- The fallback shape `{rawContent, parseError: true, confidence: 0}` returned on parse failure
- That `normalizeComponents` then receives a non-array and silently returns `[]`
- That `web/src/lib/sci/plan-interpretation.ts:156-167` checks `interpretation.fallback || interpretation.error`, not `parseError`, so the silent path never surfaces

### Section 4 — Diagnostic log line added

The verbatim code at `web/src/lib/ai/providers/anthropic-adapter.ts:806-822` (post-fix), showing the inserted `[DIAG-LLM-RAW]` log line gated on `plan_interpretation`.

### Section 5 — Hypothesis

State the hypothesis: response truncation at `max_tokens` mid-`calculationIntent` tree, leaving unterminated JSON that `parseJsonResponse` cannot recover. The DIAG-056 log will confirm or refute this on next BCL plan reimport.

### Section 6 — Build verification

Paste output from:
- `npx tsc --noEmit`
- `npm run build`
- `npm run dev` (HTTP status)

### Section 7 — Commit reference

```
git log --oneline -1
```

Paste output showing commit `161e3678` (or current HEAD if subsequent commits exist on dev).

### Section 8 — Next action

State explicitly: this is a diagnostic. No PR. The architect will reimport the BCL plan, capture the `[DIAG-LLM-RAW]` log line, and direct any fix as a separate HF.

---

## Commit

```
git add docs/completion-reports/DIAG-056_COMPLETION_REPORT.md
git commit -m "DIAG-056: completion report (formalizes findings already reported in chat per SOP)"
git push origin dev
```

---

## SOP Note

The completion report file is a required deliverable for every work item per Rules 25-28 and `COMPLETION_REPORT_ENFORCEMENT.md`. Chat-only reporting does not satisfy this requirement. Future work items must produce the completion report file at the required path before stating "complete."
