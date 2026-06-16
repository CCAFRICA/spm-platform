# HF-295 Part 2 — Completion Report
## File-Scoped Settle + Per-File Failure Isolation + User-Understandable Errors

**Date:** 2026-06-16 · **Branch:** `hf-295-sci-bulk-write-halt` · **Mode:** ULTRACODE
**Predecessor:** DIAG-069 (`3bbce95b`) — root cause CONFIRMED (H5: settle-scope mismatch).
**Status:** BUILT · build exit-0 · dev confirmed on `localhost:3000` · 2-lens sweep PASS · **awaiting architect §4 browser proof gate (SR-44).**

---

## 1 — Orchestration plan (ADR, executed)

Full ADR: `docs/adr/HF-295_PART2_ADR_FILE_SCOPED_SETTLE.md` (committed first, `00bfe61b`).

- **Fan-out (paid once):** 5 disjoint reads → one merged STATE MAP, executed in the main context (the build edits these files; subagent summaries would lose the lines to change). T1 settle+dispatch, T2 result shape, T3 server terminal emission (**confirmed correct — NOT touched**), T4 i18n, T5 render path.
- **Keystone (sequential, first):** Layer A settle-scope change **+** the per-file result-shape extension — the shared dependency both B-streams consume (the surfaced collision; declared in the ADR, not discovered at merge).
- **Streams (after keystone):** B1 = error-class → user-payload translation (`import-failure.ts`); B2 = presentation + i18n. File-disjoint.
- **One batched sweep:** two code lenses (no-silent-failure; Korean-Test) — both **PASS** (§5). The §4 browser proof gate (incl. deliberate GT-file failure) is architect-run.

**Commits (4):**
| Commit | Layer |
|---|---|
| `00bfe61b` | ADR (orchestration plan) |
| `0567eef0` | Keystone — settle-scope + result-shape + dispatch isolation + `import-failure.ts` (B1) |
| `17c62fa7` | Stream B2 — presentation + i18n (en-US/es-MX/pt-BR) |
| _(this report)_ | Completion report |

---

## 2 — Layer A: file-scoped settle (the fix)

### 2.1 — Settle-scope change (the keystone edit)

```diff
+  // HF-295 Part 2: the tracked set is now the CALLER's file group (its unit ids), not the
+  // import-wide `confirmedUnits`. A file settles when ITS OWN units reach a terminal
+  // disposition — so the dispatch loop advances to the next file immediately (DIAG-069 / H5).
-  const settleFromSurface = useCallback(async (): Promise<boolean> => {
+  const settleFromSurface = useCallback(async (trackedIds: string[]): Promise<boolean> => {
     const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
     const STALL_MS = 90_000;
-    const trackedIds = confirmedUnits.map(u => u.contentUnitId);
     let lastSettled = -1, lastProgressAt = Date.now();
   ...
-  }, [tenantId, proposal.proposalId, confirmedUnits]);
+  }, [tenantId, proposal.proposalId]);
```

`executeBulk` now scopes settle to its own group and returns the disposition:

```diff
-  const executeBulk = useCallback(async (dataUnits, bulkStoragePath?) => {
+  const executeBulk = useCallback(async (dataUnits, bulkStoragePath?): Promise<FileDispatchOutcome> => {
     const effectivePath = bulkStoragePath || storagePath;
+    const groupUnitIds = dataUnits.map(u => u.contentUnitId);   // ← THIS file's units
+    let lastHttpStatus: number | null = null;
+    let lastErrText: string | null = null;
   ...
-      settled = await settleFromSurface();
+      settled = await settleFromSurface(groupUnitIds);          // ← per-file settle
   ...
+    if (!settled) {
+      return { settled: false, unitIds: groupUnitIds,
+        errorClass: classifyImportError({ httpStatus: lastHttpStatus, rawError: lastErrText, stalled: true }),
+        technicalDetail: lastErrText ?? (lastHttpStatus != null ? `HTTP ${lastHttpStatus}` : undefined) };
+    }
+    return { settled: true, unitIds: groupUnitIds };
```

### 2.2 — Per-file isolation (dispatch loop)

```diff
   if (filePath) {
-    await executeBulk(groupUnits, filePath);
+    const fileLabel = deriveFileLabel(groupUnits[0]?.contentUnitId ?? '', sourceFile);
+    const markFileFailed = (failure: ImportFileFailure) => {
+      setUnits(prev => prev.map(u =>
+        groupUnits.some(g => g.contentUnitId === u.contentUnitId) && (u.status === 'processing' || u.status === 'pending')
+          ? { ...u, status: 'error' as const, error: failure.errorClass, failure }
+          : u));
+    };
+    try {
+      const outcome = await executeBulk(groupUnits, filePath);
+      if (!outcome.settled) markFileFailed(toImportFileFailure(fileLabel, outcome.errorClass ?? 'unknown', outcome.technicalDetail));
+    } catch (err) {
+      const detail = err instanceof Error ? err.message : String(err);
+      markFileFailed(toImportFileFailure(fileLabel, classifyImportError({ rawError: detail }), detail));
+    }
   } else { /* legacy fallback — unchanged */ }
```

The loop never `break`s/`return`s on failure → siblings always process. `markFileFailed` touches only the current group's non-terminal units → no indefinite spinner, full isolation.

### 2.3 — Result-shape extension

```diff
 interface ExecutionUnit {
   contentUnitId: string; tabName: string; classification: AgentType;
   status: UnitStatus; result?: ContentUnitResult; error?: string;
+  failure?: ImportFileFailure;   // ← structured, user-understandable payload (preferred over `error`)
 }
+interface FileDispatchOutcome {
+  settled: boolean; unitIds: string[];
+  errorClass?: ImportErrorClass; technicalDetail?: string;
+}
```

---

## 3 — Layer B1: the one translation function (`web/src/lib/sci/import-failure.ts`, NEW)

Korean Test: maps internal error **classes** to i18n **keys** — no language literals, no filename matching, no per-tenant lookup.

```ts
export type ImportErrorClass =
  | 'file_unreadable' | 'columns_not_understood' | 'records_unmatched'
  | 'data_not_saved' | 'not_finalized' | 'unknown';

export function classifyImportError(input: {
  httpStatus?: number | null; failureClass?: string | null; rawError?: string | null; stalled?: boolean;
}): ImportErrorClass { /* failureClass → class; 5xx → file_unreadable; message keywords; stall → not_finalized; else unknown */ }

// THE one translation function: error class → user payload (i18n KEY PATHS). One place.
export function toImportFileFailure(fileName, errorClass, technicalDetail?): ImportFileFailure {
  return {
    fileName, errorClass,
    stageKey: STAGE_BY_CLASS[errorClass],
    reasonKey:          `sci.import.failure.${errorClass}.reason`,
    expectedKey:        `sci.import.failure.${errorClass}.expected`,
    recommendationKey:  `sci.import.failure.${errorClass}.recommendation`,
    blocksKey:          'sci.import.failure.blocks',   // shared, param-driven
    technicalDetail: technicalDetail?.slice(0, 600) || undefined,
  };
}
```

A `failed_interpretation` unit now carries a translated payload (raw `failureClass` → collapsible technical detail) instead of a raw class string.

---

## 4 — Layer B2: presentation + i18n

Presentation (`ExecutionProgress.tsx`): a failed item renders a distinct terminal block — **stage · reason · expected · recommendation · blocks** — all via `useLocale().t()`; raw `technicalDetail` in a `<details>` (architect only); successful files keep row counts; spinner only for genuinely-active units.

i18n keys added to **all three** locales (`en-US`, `es-MX`, `pt-BR`) under `sci.import` — verified at parity by Lens B (18 class keys + 5 stages + 3 metadata, identical across locales). Spanish (es-MX) excerpt:

```json
"sci": { "import": {
  "stage": { "reading": "Leyendo el archivo", "understanding": "Entendiendo las columnas",
             "matching": "Asociando registros con personas", "saving": "Guardando los datos", "finalizing": "Finalizando" },
  "failure": {
    "recommendationLabel": "Qué hacer", "technicalLabel": "Detalle técnico",
    "blocks": "Esto afectó solo a este archivo — {{successCount}} de {{totalCount}} archivos se importaron correctamente.",
    "columns_not_understood": {
      "reason": "No reconocimos las columnas de este archivo como datos para importar.",
      "expected": "Se esperaban registros de origen (ventas o cobranza con identificadores y montos); las columnas parecían un resumen o un reporte de resultados.",
      "recommendation": "Verifica que este archivo contenga datos de origen, no totales ya calculados ni una referencia de conciliación. Si es un reporte de resultados, quítalo de la importación."
    } /* + file_unreadable, records_unmatched, data_not_saved, not_finalized, unknown */
  }
}}
```

> **Note (directive vs. mechanism):** the i18n system supports `en-US / es-MX / pt-BR`. There is **no `es-PE` locale** — the directive's "es-PE" is the MIR persona; Spanish renders via `es-MX` (the `profiles.locale='es'` → `es-MX` mapping). Keys added to all three locales.

---

## 5 — Proof of work

### Build (hard gate)
```
$ pkill -f "next dev"; rm -rf .next; npm run build
 ✓ Compiled successfully
   Linting and checking validity of types ...
BUILD_EXIT=0
```
(The "Dynamic server usage" lines are pre-existing prerender notices for auth-gated API routes that read cookies/request.url — not failures; those routes render on demand and the build exits 0.)

### Dev
```
$ npm run dev  →  ✓ Ready in 1206ms · Local: http://localhost:3000
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login  →  200
```

### 2-lens sweep (one batched pass, independent adversarial reviewers)
- **Lens A — no-silent-failure: PASS.** Every file reaches a terminal state (settle OK / stall / throw / failed_interpretation all → `complete` or `error`); per-file isolation holds (no break/return; `markFileFailed` filters to the current group); no `error` unit lacks a payload; settle is genuinely per-file (`settleFromSurface(groupUnitIds)`).
- **Lens B — Korean Test: PASS.** Scope by unit-id parameter (no filename match); classify by structural class (unknown → default naming a stage, never a raw dump); all new failure strings via `t()`; i18n parity across all three locales confirmed.

---

## 6 — Scope fence honored (no over-correction)

- Single-file import: unchanged (one group settles on its own ids → identical behavior).
- All-files-succeed: unchanged (each file settles fast → advances immediately).
- Legacy per-unit fallback + plan-unit path: unchanged (degradation paths, already per-unit terminal).
- Existing English chrome in `ExecutionProgress` not retranslated — only the net-new failure surface routes through i18n.
- Server route, `processing_jobs` async path, log-level noise: untouched (§4A).

---

## 7 — §4 PROOF GATE — for the architect (SR-44, browser)

**Layer A (dispatch):** every file logs its own `Downloading from Storage` + `Complete`; no 90s inter-file stalls / triple re-POST; wall-clock ≈ sum of per-file processing; `committed_data` count = sum of successful files.
**Layer B (failure, tested deliberately):** include `MIR_Resultados_Esperados.xlsx` ON PURPOSE — it should fail/flag; its failure renders which-file · stage · why · what-to-do · what-it-blocks **in Spanish**; the other 16 files import successfully despite it; no indefinite spinner; polling stops after all terminal.
**Regression:** single-file import unchanged; all-success (GT excluded) shows all green + counts.

### Known boundary (honest — read before the proof run)
Layer B renders a rich failure for any unit the pipeline marks `failed_interpretation` or any file that stalls. **If** the GT file's units instead return `success` with **0 committed rows**, they render as a visible "0 rows" terminal (no spinner) rather than a hard explained failure — forcing that to a failure would require results-data detection, which **§4A explicitly defers**. Confirm in the proof run which path GT takes; a 0-rows-silent outcome is a follow-up (GT-detection), not a Layer B miss.

---

*HF-295 Part 2 · Completion Report · 2026-06-16 · vialuce.ai · Intelligence. Acceleration. Performance.*
