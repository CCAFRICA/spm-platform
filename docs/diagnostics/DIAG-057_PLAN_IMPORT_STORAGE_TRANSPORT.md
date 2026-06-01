# DIAG-057 — PLAN-IMPORT STORAGE-TRANSPORT GAP DIAGNOSTIC
## Status: Drafted, Ready for Execution
## Execution mode: Read-only code-path inspection (no code changes, no DB writes)
## CC dispatch: REQUIRED — code reads at HEAD with pasted excerpts (Rule 21, Rule 27)
## Expected duration: 15–20 minutes CC-active
## Repo: CCAFRICA/spm-platform (VP)
## Date: 2026-05-29
## Directive location: docs/diagnostics/DIAG-057_PLAN_IMPORT_STORAGE_TRANSPORT.md
## Output location: docs/diagnostics/DIAG-057_OUTPUT.md

---

## OBJECTIVE

A clean-slate plan import for Meridian (`72bee86b-8988-497d-b9b1-c4bba9017525`) fails at the UI with:

```
storagePath required: HF-239 unified import requires Storage transport for plan units
```

This DIAG establishes, with pasted code evidence, the exact code path that leaves `storagePath` empty for a plan file, and — critically — **bounds the blast radius of the candidate fix** so the subsequent HF does not break any import path that currently works (BCL spreadsheet-parsed plans; any legitimate document-only plan path). It produces a fix-disposition signal; it does NOT change code.

Architect-channel hypothesis (to be confirmed or refuted by the probes, not assumed): the Storage upload filters out files parsed as documents (`documentBase64` present), so a plan workbook taking the document parse path is never uploaded to `ingestion-raw`, leaving `storagePath` undefined when the plan branch of `SCIExecution` runs. HF-239 made Storage transport mandatory but did not widen the upload set or retire the pre-HF-239 document body-transport branch.

This DIAG is read-only. It does not modify the upload filter, the document branch, or any transport code. Disposition is the architect's after evidence.

---

## GOVERNING DOCUMENTS CONSULTED

- `CC_DIAGNOSTIC_PROTOCOL.md` — Rule 21 (trace the actual code path before any fix), Rule 22 (headless-first), Rule 24 (max diagnostic rounds), anti-pattern: human-as-debugger loop.
- `CC_STANDING_ARCHITECTURE_RULES.md` — Principle 1 (AI-First, Korean Test); AP-1 (no row data in HTTP bodies — the dead document body-transport branch is an AP-1 reintroduction risk); AP-17 (single pipeline, no duplicate transport paths).
- `COMPLETION_REPORT_ENFORCEMENT.md` — Rule 27 (evidence = paste, not describe).
- HF-239 (unified import: all content units route through `execute-bulk` via Storage transport; request-body `rawData`/`fileBase64` retired).
- Open P1 lineage — multi-file / plan-path transport: F07, CLT111-F3, CLT111-F8, CLT102-F44, CLT109-F15. This gap is the same defect class; the DIAG records whether DIAG-057's finding subsumes any of these (do NOT renumber them here).

---

## PRE-EXECUTION VERIFICATION GATE (HEAD, not memory)

The architect's trace used the March extraction (`AUD-001_CODE_EXTRACTION.md` §1.10) plus live greps. Line numbers below are from those greps and MUST be re-confirmed at HEAD before being trusted. CC confirms the following files exist and the named anchors are present at HEAD; if any anchor has moved or is absent, CC reports the actual location and proceeds (does not stop):

```bash
cd ~/spm-platform
git rev-parse HEAD
echo "=== anchor files exist ==="
ls -1 web/src/app/operate/import/page.tsx \
      web/src/components/sci/SCIExecution.tsx \
      web/src/components/sci/SCIUpload.tsx \
      web/src/app/api/import/sci/execute-bulk/route.ts \
      web/src/lib/sci/plan-interpretation.ts
```

**Expected:** all five files present. If any path differs, CC reports the resolved path and continues with it.

---

## PROBE 1 — The upload filter (suspected exclusion locus)

```bash
sed -n '95,135p' web/src/app/operate/import/page.tsx
```

**Paste the full block.** Identify verbatim:
- The line defining `spreadsheetFiles` (suspected `files.filter(f => f.rawFile && !f.parsedData.documentBase64)`).
- Whether any file lacking `rawFile`, or carrying `documentBase64`, is uploaded to `ingestion-raw` anywhere in this block.

**What this shows:** whether a document-parsed file is structurally excluded from the Storage upload. If the filter excludes `documentBase64` files and there is no parallel upload for them, the exclusion is confirmed.

---

## PROBE 2 — The document branch (suspected dead body-transport)

```bash
sed -n '135,225p' web/src/app/operate/import/page.tsx
```

**Paste the full block.** Identify verbatim:
- The `isDocument` determination and what path it takes.
- Any `fileBase64:` / `documentBase64` sent in a request body (suspected line ~214).
- Whether the document branch ever uploads to `ingestion-raw` or sets a `storagePath`.

**What this shows:** whether the document path still uses pre-HF-239 request-body transport (which `execute-bulk` no longer accepts), i.e. whether a document-parsed plan has NO Storage path by construction.

---

## PROBE 3 — storagePath derivation + prop wiring

```bash
grep -nE "handleConfirmAll|storagePathsRef|storageUploadPromiseRef|Object\.values\(storagePaths\)|storagePath:|storagePaths:|setState|<SCIExecution|storagePath=|storagePaths=" web/src/app/operate/import/page.tsx
echo "=== the derivation block (adjust range to grep output) ==="
sed -n '/handleConfirmAll/,/storagePaths,$/p' web/src/app/operate/import/page.tsx | head -50
```

**Paste output.** Identify verbatim:
- How `storagePath` (singular) is derived (suspected `Object.values(storagePaths)[0] || undefined`).
- That `storagePath`/`storagePaths` are passed as props to `<SCIExecution>` (suspected lines 481–482).

**What this shows:** confirms that when the upload set excludes the plan file, `storagePaths` is empty → derived `storagePath` is `undefined` → the prop the plan branch reads is empty → the guard throws.

---

## PROBE 4 — The guard that fires (consumer side, confirm it is correct behavior)

```bash
grep -nE "storagePath required|case 'plan'|classification === 'plan'|planUnits|!storagePath|execute-bulk" web/src/components/sci/SCIExecution.tsx
sed -n '290,350p' web/src/components/sci/SCIExecution.tsx
```

**Paste output.** Confirm the plan branch throws on `!storagePath` and that this is a guard catching the empty path — NOT itself the bug. The bug is upstream (no path produced); the guard is doing its job.

---

## PROBE 5 — Server readiness (does execute-bulk already accept a plan via Storage?)

The fix's viability depends on the server already being able to download + interpret a plan file from a Storage path (so the only change needed is client-side: upload the plan + pass its path).

```bash
echo "=== execute-bulk plan arm: does it read the plan file from Storage? ==="
grep -nE "case 'plan'|executePlanPipeline|executeBatchedPlanInterpretation|ingestion-raw|\.download\(|documentBase64|fileBase64|storagePath" web/src/app/api/import/sci/execute-bulk/route.ts
echo "=== plan-interpretation module: Storage download path ==="
grep -nE "ingestion-raw|\.download\(|storagePath|fileBase64|documentBase64|XLSX|extract" web/src/lib/sci/plan-interpretation.ts | head -40
```

**Paste output.** Determine verbatim:
- Whether `execute-bulk`'s plan arm (batched + per-unit) downloads the file from the Storage path and interprets it.
- Whether `plan-interpretation.ts` reads from a Storage `storagePath` (server-side parse) — if yes, the server is ready and the fix is client-only.

**What this shows:** whether retiring the client document body-transport and routing plans through Storage requires ANY server change, or none.

---

## PROBE 6 — Blast-radius: who else parses to documentBase64, and is there a legitimate document-only path?

The candidate fix widens the upload set to include `documentBase64` files. This probe establishes whether any import legitimately depends on the document-only (non-Storage) path, so the fix does not silently break it.

```bash
echo "=== where documentBase64 is set (what file types take the doc parse?) ==="
sed -n '90,110p' web/src/components/sci/SCIUpload.tsx
grep -rnE "documentBase64" web/src --include="*.ts" --include="*.tsx" | grep -v node_modules
echo "=== any consumer that REQUIRES documentBase64 in a body (would break if upload-only) ==="
grep -rnE "fileBase64|documentBase64" web/src/app/api --include="*.ts" | grep -v node_modules
```

**Paste output.** Determine verbatim:
- Which uploaded file types are assigned `documentBase64` (e.g. PDF/DOCX plan docs vs. XLSX workbooks).
- Whether any API consumer still requires `documentBase64`/`fileBase64` in a request body such that widening upload + retiring the body branch would break it.

**What this shows:** the fix's blast radius. If the ONLY consumer of the document body path is the now-mandatory-Storage plan flow, retiring it is safe. If a genuine document-only path exists (e.g. a true PDF plan), the fix must upload those too rather than assume XLSX.

---

## INTERPRETATION MATRIX

| Probe 1 filter | Probe 2 doc branch | Probe 5 server | Disposition |
|---|---|---|---|
| Excludes `documentBase64` | Sends `fileBase64` in body, no Storage upload | Plan arm reads from Storage path | **CONFIRMED root cause; fix is client-only.** Widen upload set to all `rawFile` files; retire the body-transport branch; route doc-parsed plans through Storage + `execute-bulk`. |
| Excludes `documentBase64` | Doc branch already uploads to Storage but path not threaded to `storagePath` | ready | Narrower fix: thread the doc path into `storagePaths`/`storagePath`. No filter change. |
| Includes all `rawFile` | — | — | Hypothesis refuted; the empty path has another cause. Re-probe how Meridian's plan file reaches (or fails to reach) the upload (is `rawFile` present on it?). |
| — | — | Plan arm does NOT read from Storage / requires body | Fix is NOT client-only; a server change to `execute-bulk`/`plan-interpretation` is also required. Scope a two-surface HF. |

Probe 6 modifies the chosen disposition: if a legitimate document-only path exists, the fix uploads those files too (do not assume XLSX); if not, the body branch is safe to retire.

---

## OUTPUT EXPECTATION

CC produces a findings report (`docs/diagnostics/DIAG-057_OUTPUT.md` — read-only DIAG output goes in `docs/diagnostics` per house convention) containing, per Rule 27:
- HEAD SHA + confirmed file paths.
- Each probe's pasted code excerpt (not described).
- A filled interpretation matrix row with the selected disposition.
- An explicit blast-radius statement from Probe 6: what the candidate fix would change, and what it must NOT break.
- A one-paragraph fix-shape recommendation (client-only vs. two-surface), with the exact file(s) and line ranges the HF will touch — so the HF is drafted against confirmed live anchors, not greps.

CC produces NO code changes and opens NO PR. This is a read-only diagnostic.

---

## EXECUTION CONSTRAINTS

- Read-only. No edits to `page.tsx`, `SCIExecution.tsx`, `execute-bulk/route.ts`, `plan-interpretation.ts`, or any file.
- No DB writes. No `npm run build` required (no code changed).
- Rule 24: this is a single diagnostic round. CC does not iterate fixes; it reports evidence and stops.
- Rule 27: paste code, do not describe it.
- If any probe's anchor is absent at HEAD, CC reports the actual location and continues; it does not stop and does not guess.

---

## SCOPE BOUNDARY (WHAT DIAG-057 DOES NOT DO)

- Does NOT change the upload filter, the document branch, or any transport code.
- Does NOT touch HF-254's merged classification/flywheel changes (unrelated surface).
- Does NOT close the multi-file P1 (F07 / CLT111-F8 et al.) — it records whether the finding overlaps, for the architect to sequence; it does not renumber those items.
- Does NOT run Meridian/CRP calculations or address EPG-7 directly — it unblocks the plan re-import that EPG-7 depends on.
- Does NOT author the fix HF. The HF is a separate structured/compliant directive the architect dispatches after disposition.

---

## COMPLIANCE CHECKLIST

- [ ] HEAD SHA recorded; all anchor files confirmed (or resolved paths reported).
- [ ] Probes 1–6 executed; every code excerpt pasted (Rule 27), none described.
- [ ] Interpretation matrix row selected with evidence.
- [ ] Blast-radius statement from Probe 6 included.
- [ ] Fix-shape recommendation names exact file(s) + line ranges for the HF.
- [ ] No code changed; no PR opened; no DB writes.
- [ ] Output report at `docs/diagnostics/DIAG-057_OUTPUT.md`.
