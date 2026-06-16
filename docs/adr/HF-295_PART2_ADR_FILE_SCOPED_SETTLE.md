# ADR — HF-295 Part 2: File-Scoped Settle + Per-File Failure Isolation + User-Understandable Errors

**Date:** 2026-06-16 · **Branch:** `hf-295-sci-bulk-write-halt` · **Authority:** authorized after DIAG-069 (root cause CONFIRMED, H5).
**Drafting reference:** INF_Structured_Compliant_Drafting_Reference_20260513.md

This ADR is the build's **first commit** (per §1A). It states the orchestration plan, the merged STATE MAP, the keystone, the two streams, the surfaced collision, and the one-sweep lens set — then the build executes it.

---

## 1 — Orchestration plan (the campaign, formed before building)

| Element | Decision |
|---|---|
| **Fan-out (paid once)** | 5 disjoint reads → one merged STATE MAP, executed in the main context (not subagents): the build EDITS these files, so the exact live code is needed in-context, not summarized. Summaries would lose the lines I must change. |
| **Keystone (sequential, first)** | Layer A settle-scope change **+ the per-file result-shape extension**. Defines the control flow everything else renders into. |
| **Streams (after keystone)** | B1 = error-class → user-payload translation (`import-failure.ts`); B2 = presentation + i18n (`ExecutionProgress.tsx` + 3 locale files). Built in sequence in one context; file-disjoint. |
| **Surfaced collision** | Layer A, B1, B2 all touch the **per-file result shape**. Resolution: the shape (`ImportFileFailure`, `ImportErrorClass`) lands in the keystone module `import-failure.ts` **before** either stream consumes it. B1's translation lives in the same module because shape ⇄ translation are one cohesive contract (and §1A already made the shape a keystone dependency). Not discovered at merge — declared here. |
| **One batched sweep** | §4 proof gate runs once across the whole build (architect, browser, SR-44), including the deliberate GT-file failure test. Two code lenses paid once: (a) no-silent-failure across the dispatch path; (b) Korean-Test across both layers. |

---

## 2 — Merged STATE MAP (5 fan-out targets)

- **T1 — settle + dispatch** (`SCIExecution.tsx`): `settleFromSurface` (:163) keyed on import-wide `confirmedUnits` (:166), returns true only at `settledCount >= trackedIds.length` (:191); `executeBulk` (:231) awaits it per group (:308) and returns `void`; dispatch loop (:525) does `await executeBulk(groupUnits, filePath)` (:537) — already sequential, no `break`.
- **T2 — result/terminal shape**: `ExecutionUnit` (status `pending|processing|complete|error`, `error?`); `ContentUnitResult` (sci-types:453); `ProgressItem` (ExecutionProgress:22, status `pending|active|done|failed`); `toProgressItems` (:292) maps unit→item.
- **T3 — server terminal emission** (`execute-bulk/route.ts`) — **CONFIRMED CORRECT, NOT TOUCHED**: emits `bound` per committed unit (:517), `failed_interpretation` + `failureClass` on result-fail (:539) and on throw (:566); one throw records + continues; only a download failure 500s the (single-file) request (:199).
- **T4 — i18n**: `useLocale().t(key, params)` (`contexts/locale-context.tsx`); keys in `src/locales/{en-US,es-MX,pt-BR}/{common,compensation}.json`; nested dot-paths; `{{param}}` interpolation. **Spanish = `es-MX`. There is no `es-PE` locale** — the directive's "es-PE" is the MIR persona; the mechanism renders Spanish via `es-MX`. Keys added to all three locales.
- **T5 — render path**: `SCIExecution` → `<ExecutionProgress items={toProgressItems(units)} />`. A failed item renders `item.error` raw (:202, :253); an `active` item is a spinner (:147). The indefinite spinner = a unit stuck `processing` because settle never marked it terminal.

---

## 3 — The two binding changes (vs. Part-1 proposal)

1. **Isolation unit is the FILE, not the group.** Settle, terminal-state, and failure boundary are per-file. One file failing must not affect any sibling. The dispatch loop **records + continues** on a file failure — never `break`s the batch.
2. **NET-NEW: a failed file explains itself in user terms** — fileName · stage · reason · expected-vs-received · recommendation · blocks. No stack traces / HTTP codes / `String(err)` in the primary UI. **One** translation function (error *class* → payload); unknown class → default message naming the stage; never a raw dump, never a silent pass. Strings via i18n (`es-MX` for MIR).

---

## 4 — What changes, by layer (AUD-009: one invariant per layer)

**Layer A — `SCIExecution.tsx` (keystone, client control flow):**
- `settleFromSurface(trackedIds: string[])` — tracked set is now the **parameter**, not import-wide `confirmedUnits`. File settles when *its* units are terminal.
- `executeBulk(group)` computes `groupUnitIds`, passes them to settle, and **returns** `FileDispatchOutcome { settled, unitIds, errorClass?, technicalDetail? }`.
- Dispatch loop: wraps each file in try/catch; on `!settled` or throw, marks **only this file's** still-non-terminal units `error` with a payload and **continues** — guaranteeing no indefinite spinner and full sibling independence.
- `settleFromSurface` also attaches a payload (via the translation) when a unit reaches `failed_interpretation`, replacing the raw `failureClass` string.
- Korean Test: scoping is by **unit-id-set parameter** — no filename string-match, no content-type branch.

**Layer B1 — `import-failure.ts` (contract + translation):** `ImportErrorClass` (structural), `ImportFileFailure` (i18n **keys**, not literals), `classifyImportError(signal)→class`, `toImportFileFailure(fileName,class,detail)→payload`. No language literals, no per-file/per-tenant lookup.

**Layer B2 — `ExecutionProgress.tsx` + locales:** failed item renders a distinct terminal block (stage · reason · expected · recommendation · blocks) resolved via `t()`, technical detail in a `<details>`; successful files keep their row counts; spinner only for genuinely-active units. New `sci.import.*` keys added to en-US / es-MX / pt-BR.

---

## 5 — No over-correction (scope fence)

- Single-file import path: unchanged (one group → settles on its own ids → identical behavior).
- All-files-succeed path: unchanged (each file settles fast, advances immediately).
- Legacy per-unit fallback + plan-unit path: unchanged (degradation paths; already per-unit terminal). Only the **primary multi-file data path** gains the structured payload.
- Existing English chrome in `ExecutionProgress` ("Importing", "Import complete") is **not** retranslated — only the net-new failure surface routes through i18n (translating the whole component is out of scope).
- Server route, processing_jobs async path, log-level noise: untouched (§4A).

## 6 — Known boundary (honest, for the proof gate)

Layer B renders a rich failure for any unit the pipeline marks `failed_interpretation` or any file that stalls. If the GT file's units instead return `success` with **0 committed rows**, they render as a visible "0 rows" terminal (no spinner) rather than a hard explained failure — forcing that to a failure would require results-data detection, which **§4A explicitly defers**. The architect's proof run confirms which path GT takes; a 0-rows-silent outcome is a follow-up (GT-detection), not a Layer B miss.

---

*HF-295 Part 2 · ADR · 2026-06-16 · vialuce.ai*
