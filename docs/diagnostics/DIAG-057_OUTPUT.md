# DIAG-057 — PLAN-IMPORT STORAGE-TRANSPORT GAP — FINDINGS

## Status: COMPLETE (read-only; no code changed, no PR, no DB writes)
## Date: 2026-05-29
## HEAD SHA: `50547e27427d4a166ec77703ed2d1d9b809a06c1` (branch `dev`)

> Reconciliation note: this is a read-only code-path inspection. Evidence is pasted
> (Rule 27), not described. Disposition is the architect's; no fix authored here.

## Confirmed file paths (pre-execution gate — all five present at HEAD)

```
OK web/src/app/operate/import/page.tsx              (522 lines)
OK web/src/components/sci/SCIExecution.tsx          (602 lines)
OK web/src/components/sci/SCIUpload.tsx             (393 lines)
OK web/src/app/api/import/sci/execute-bulk/route.ts (755 lines)
OK web/src/lib/sci/plan-interpretation.ts           (585 lines)
```
No anchors moved files; line ranges resolved below (some differ from the directive's
March-era greps and are reported at their HEAD locations).

---

## PROBE 1 — The upload filter (suspected exclusion locus)

`web/src/app/operate/import/page.tsx:102-133`:

```ts
      // HF-141: Upload ALL spreadsheet files to Supabase Storage in parallel.
      // Each file gets its own storage path with a unique suffix (index + random)
      // to prevent any collision or ambiguity. Keyed by filename for lookup.
      const spreadsheetFiles = files.filter(f => f.rawFile && !f.parsedData.documentBase64);
      if (spreadsheetFiles.length > 0) {
        storageUploadPromiseRef.current = (async () => {
          try {
            const supabase = createClient();
            const paths: Record<string, string> = {};
            const baseTimestamp = Date.now();
            await Promise.all(spreadsheetFiles.map(async (file, index) => {
              const uniqueSuffix = `${baseTimestamp}_${index}_${crypto.randomUUID().substring(0, 8)}`;
              const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const path = `${tenantId}/${uniqueSuffix}_${sanitized}`;
              const { error: uploadErr } = await supabase.storage
                .from('ingestion-raw')
                .upload(path, file.rawFile!, { cacheControl: '3600', upsert: false });
              ...
                paths[file.name] = path;
              ...
            }));
            storagePathsRef.current = paths;
          ...
        })();
      }
```

**Finding:** line **105** — `const spreadsheetFiles = files.filter(f => f.rawFile && !f.parsedData.documentBase64);`.
Any file carrying `documentBase64` is **structurally excluded** from the `ingestion-raw`
upload set. There is **no parallel upload** for `documentBase64` files anywhere in this
block — `ingestion-raw.upload(...)` is reached only inside the `spreadsheetFiles` map.
**Exclusion confirmed.**

---

## PROBE 2 — The document branch (suspected dead body-transport)

`web/src/app/operate/import/page.tsx:134-135` and `206-224`:

```ts
      const firstFile = files[0];
      const isDocument = !!firstFile?.parsedData.documentBase64;
      ...
      // Synchronous analysis path (existing — fallback for async unavailable or document imports)
      let proposal: SCIProposal;

      if (isDocument) {
        const res = await fetch('/api/import/sci/analyze-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            fileName: firstFile.parsedData.fileName,
            fileBase64: firstFile.parsedData.documentBase64,
            mimeType: firstFile.parsedData.documentMimeType,
          }),
        });
        ...
        proposal = await res.json();
      } else {
```

**Finding:** `isDocument` (line **135**) = `!!firstFile?.parsedData.documentBase64`. The
document branch (line **206**) POSTs `fileBase64: firstFile.parsedData.documentBase64`
(line **214**) in the request body to **`/api/import/sci/analyze-document`**. This branch
**never uploads to `ingestion-raw`** and **never sets a `storagePath`**. A document-parsed
plan therefore has **no Storage path by construction** — it is analyzed via request-body
transport (the analyze phase), and nothing populates a Storage path for the later execute
phase. **Confirmed.** (Note: this is the *analyze*-phase body path; `analyze-document`
legitimately needs it — see Probe 6.)

---

## PROBE 3 — storagePath derivation + prop wiring

Greps (`page.tsx`):

```
75:  const storagePathsRef = useRef<Record<string, string>>({});
105:  const spreadsheetFiles = files.filter(f => f.rawFile && !f.parsedData.documentBase64);
127:  storagePathsRef.current = paths;
308:  const storagePaths = storagePathsRef.current;
310:  const storagePath = Object.values(storagePaths)[0] || undefined;
481:  storagePath={state.storagePath}
482:  storagePaths={state.storagePaths}
```

`page.tsx:301-319` and `476-484`:

```ts
  const handleConfirmAll = useCallback(async (confirmedUnits: ContentUnitProposal[]) => {
    if (state.phase !== 'proposal') return;
    if (storageUploadPromiseRef.current) {
      await storageUploadPromiseRef.current;
    }
    const storagePaths = storagePathsRef.current;
    // Backwards compat: first path as single storagePath
    const storagePath = Object.values(storagePaths)[0] || undefined;
    setState({ phase: 'executing', proposal: state.proposal, confirmedUnits,
      rawData: state.rawData, storagePath, storagePaths });
  }, [state]);
  ...
            <SCIExecution
              ...
              storagePath={state.storagePath}
              storagePaths={state.storagePaths}
```

**Finding:** line **310** — `const storagePath = Object.values(storagePaths)[0] || undefined;`.
`storagePaths` is sourced from `storagePathsRef.current`, populated **only** from
`spreadsheetFiles` (Probe 1). For a document-parsed plan the upload set is empty →
`storagePaths` is `{}` → derived `storagePath` is **`undefined`** → passed to
`<SCIExecution>` at lines **481-482** as empty. **Confirmed.**

---

## PROBE 4 — The guard that fires (consumer side — correct behavior, not the bug)

Greps (`SCIExecution.tsx`): `335:  if (!storagePath)` / `336:  throw new Error('storagePath required: HF-239 ... plan units')`.

`SCIExecution.tsx:330-340`:

```ts
        // HF-239: plan batching now flows through execute-bulk's new
        // `case 'plan'` dispatcher arm (batched interpretation in the POST
        // handler tail). storagePath is required.
        if (!storagePath) {
          throw new Error('storagePath required: HF-239 unified import requires Storage transport for plan units');
        }
        const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
          method: 'POST',
          ...
          body: JSON.stringify({ proposalId: proposal.proposalId, tenantId, storagePath, contentUnits: planExecUnits,
```

**Finding:** lines **335-336** — the plan branch throws on `!storagePath`. This is a
**guard catching the empty path**, doing its job. The bug is **upstream** (no path
produced, Probes 1-3), not here. (The data-unit branch has the identical guard at
lines 270-271.) **Confirmed: guard is correct behavior.**

---

## PROBE 5 — Server readiness (execute-bulk already accepts a plan via Storage?)

Greps (`execute-bulk/route.ts`):

```
117:  const { proposalId, tenantId, storagePath, contentUnits } = body;
119:  if (!tenantId || !proposalId || !storagePath || !contentUnits?.length) {
143:  console.log(`[SCI Bulk] Downloading from Storage: ${storagePath}`);
145:    .from('ingestion-raw')
146:    .download(storagePath);
215:  const batchResults = await executeBatchedPlanInterpretation( ... storagePath ... )   (line 220)
410:    case 'plan':
415:    return executePlanPipeline(supabase, tenantId, unit, profileId, storagePath, ...)   (line 416)
```

Greps (`plan-interpretation.ts`):

```
30:  storagePath: string,                        (executeBatchedPlanInterpretation param)
37:    .from('ingestion-raw')
38:    .download(storagePath);
53:  const ext = storagePath.split('.').pop()?.toLowerCase();   // XLSX/PPTX/DOCX/PDF by ext
64:    const XLSX = await import('xlsx'); ...
316:  storagePath?: string,                       (executePlanPipeline param)
319:  let fileBase64 = docMeta?.fileBase64;
322:  if (!fileBase64 && storagePath) {
325:    .from('ingestion-raw')
326:    .download(storagePath);
345:    const ext = storagePath.split('.').pop()?.toLowerCase();  // PDF/XLSX/DOCX/PPTX branches
```

**Finding:** the server is **already ready**. execute-bulk's plan arm downloads the file
from the Storage `storagePath` (lines 143-146) and interprets it via
`executeBatchedPlanInterpretation` (batched, line 220) and `executePlanPipeline` (per-unit,
line 416). `plan-interpretation.ts` downloads from `ingestion-raw` (lines 37-38 and
322-326) and **extracts by file extension — XLSX, PPTX, DOCX, PDF**. `executePlanPipeline`
accepts BOTH `docMeta.fileBase64` (legacy) AND `storagePath`. **No server change is
required**; the only missing piece is the client-side Storage upload of the document plan
file. **Fix is client-only.**

---

## PROBE 6 — Blast radius: who parses to documentBase64, and any legitimate document-only path?

`SCIUpload.tsx:87-105`:

```ts
  if (ext === '.xlsx' || ext === '.xls') {
    return parseExcelFile(file);
  }
  // Document formats (PDF/PPTX/DOCX) — convert to base64 for server-side analysis
  if (DOCUMENT_EXTENSIONS.includes(ext)) {
    const base64 = await fileToBase64(file);
    return {
      fileName: file.name,
      sheets: [{ sheetName: 'Document', columns: [], rows: [], totalRowCount: 0 }],
      documentBase64: base64,
      documentMimeType: MIME_TYPES[ext] || file.type,
    };
  }
```

All `documentBase64` references:

```
page.tsx:105:  files.filter(f => f.rawFile && !f.parsedData.documentBase64)   (the exclusion)
page.tsx:135:  const isDocument = !!firstFile?.parsedData.documentBase64
page.tsx:214:  fileBase64: firstFile.parsedData.documentBase64               (analyze-document body)
SCIUpload.tsx:19:  documentBase64?: string;                                  (type)
SCIUpload.tsx:102:  documentBase64: base64,                                  (set, doc formats only)
```

API consumers requiring `fileBase64`/`documentBase64` in a body:

```
execute-bulk/route.ts:88-90:  documentMetadata?: { fileBase64?: string; mimeType?: string };  (legacy single-unit fallback; storagePath also accepted)
analyze-document/route.ts:85-94:  const { ... fileBase64 ... } = body;  if (!... || !fileBase64) { 400 }   (REQUIRES fileBase64)
analyze-document/route.ts:117/119/127/241:  extractPptxText / extractDocxText / pdfBase64 = fileBase64
```

`rawFile` assignment (`SCIUpload.tsx`):

```
28:  rawFile: File; // OB-156: Keep raw file for Storage upload (no row data in HTTP bodies)   (REQUIRED field on FileInfo)
226:  rawFile: file, // assigned unconditionally for EVERY parsed file, regardless of parse type
```

**Findings:**
1. `documentBase64` is set **only** for `DOCUMENT_EXTENSIONS` (PDF/PPTX/DOCX). **XLSX/XLS
   take `parseExcelFile` and carry NO `documentBase64`** — an `.xlsx` plan is in the upload
   set today and already works. The gap is specific to **document-format plans
   (PDF/PPTX/DOCX)**.
2. Every file carries `rawFile` (required `FileInfo` field, assigned unconditionally at
   line 226) — so document files **have the raw `File` object** needed to upload. Widening
   the filter is mechanically viable.
3. A **legitimate document-only ANALYZE path exists**: `analyze-document/route.ts`
   **requires** `fileBase64` in the body (lines 92-94) and extracts PPTX/DOCX text + PDF
   base64. This is the *analyze phase* and is independent of the *execute-phase* Storage
   path. It must NOT be broken by the fix.

---

## INTERPRETATION MATRIX — selected row

| Probe 1 filter | Probe 2 doc branch | Probe 5 server | Disposition |
|---|---|---|---|
| **Excludes `documentBase64`** (line 105) | **Sends `fileBase64` in body, no Storage upload** (line 214) | **Plan arm reads from Storage path** (download + extract by ext) | **CONFIRMED root cause; fix is client-only.** |

**Selected: Row 1 — CONFIRMED root cause; fix is client-only**, as modified by Probe 6.

Causal chain (all pasted above): document-format plan (PDF/PPTX/DOCX) → `documentBase64`
set (SCIUpload 102) → excluded from upload set (page.tsx 105) → `storagePathsRef` empty for
it → `storagePath = Object.values(storagePaths)[0] || undefined` is `undefined` (page.tsx
310) → passed empty to `<SCIExecution>` (481) → plan branch guard throws (SCIExecution 336).
The server (Probe 5) already downloads + extracts a plan from a Storage path, so no server
change is needed.

(If Meridian's plan were an `.xlsx`, the hypothesis would be refuted for that file — XLSX is
not excluded. The error firing indicates Meridian's plan is a **document-format** file
PDF/PPTX/DOCX.)

---

## BLAST-RADIUS STATEMENT (from Probe 6)

**What the candidate fix changes:** widen the Storage-upload set at `page.tsx:105` so
document-format files (which carry `rawFile`) are also uploaded to `ingestion-raw`,
populating `storagePathsRef` → `storagePath` for the plan unit. This is **additive**
(it uploads more files; it removes nothing the server can't already consume).

**What the fix must NOT break:**
1. **The `analyze-document` body path** (`page.tsx:206-219` → `analyze-document/route.ts`,
   which *requires* `fileBase64`). This is the legitimate *analyze-phase* document path and
   is independent of the execute-phase Storage path. Widening the *upload* set does not
   touch it; it must remain.
2. **The XLSX plan path** (already works; not excluded). Widening the filter to
   `f => f.rawFile` (dropping `!documentBase64`) is a superset — XLSX still uploads.
3. **The `documentMetadata.fileBase64` legacy execute fallback** (`execute-bulk:88-90`,
   `executePlanPipeline` accepts it) — leave intact.
4. **Do NOT assume XLSX for the uploaded plan.** Document plans are PDF/PPTX/DOCX;
   `plan-interpretation.ts` extracts by file extension from the Storage path (Probe 5,
   lines 53 / 345), so uploading the actual file (any supported extension) is correct.
   Hardcoding `.xlsx` would break PDF/PPTX/DOCX plans.

---

## FIX-SHAPE RECOMMENDATION

**Client-only, single surface.** The HF should widen the upload filter at
**`web/src/app/operate/import/page.tsx:105`** from
`files.filter(f => f.rawFile && !f.parsedData.documentBase64)` to
`files.filter(f => f.rawFile)` (upload all files that have a raw `File`, including
document-format plans), so the document plan is uploaded to `ingestion-raw` and its path
flows through the existing, unchanged derivation (`page.tsx:310`) and props
(`page.tsx:481-482`) into `SCIExecution`'s plan branch — which already sends `storagePath`
to `execute-bulk`, which already downloads + extracts it (Probe 5). The `analyze-document`
body path (`page.tsx:206-219`) stays as-is for the analyze phase. **No server change.**

Exact anchors the HF will touch (confirmed at HEAD `50547e27`):
- `web/src/app/operate/import/page.tsx:105` — the filter (primary change).
- Verify-only (no edit expected): `page.tsx:139` (`if (!isDocument && spreadsheetFiles.length > 0)` — the async processing-jobs path stays gated to non-document spreadsheets; document plans continue to take the synchronous `analyze-document` analyze path, now WITH a Storage upload available for execute); `page.tsx:308-310` derivation; `page.tsx:481-482` props. These already work once the upload set includes the plan file.

**One nuance for the HF (not a blocker):** `storagePath = Object.values(storagePaths)[0]`
is a *first-path* (singular) derivation. For a single-plan import this is the plan's path
and is correct. For **multi-file** imports the singular derivation is the known open P1
(see overlap below) and is out of DIAG-057's scope.

---

## OVERLAP WITH OPEN P1 LINEAGE (recorded, not renumbered)

This finding is the same defect *class* as the multi-file / plan-transport P1 lineage
(F07, CLT111-F3, CLT111-F8, CLT102-F44, CLT109-F15): content that does not reach Storage
has no `storagePath` under HF-239's mandatory-Storage model. DIAG-057 **subsumes the
single-file document-plan slice** of that class (a document-format plan never uploaded).
It does **not** close the multi-file slice (the `Object.values(storagePaths)[0]` singular
derivation at `page.tsx:310` still collapses N paths to one). Architect to sequence; not
renumbered here.

---

## COMPLIANCE CHECKLIST

- [x] HEAD SHA recorded (`50547e27`); all 5 anchor files confirmed present.
- [x] Probes 1–6 executed; every code excerpt pasted (Rule 27), none merely described.
- [x] Interpretation matrix row selected with evidence (Row 1 — client-only fix).
- [x] Blast-radius statement from Probe 6 included.
- [x] Fix-shape recommendation names exact file + line (`page.tsx:105`) for the HF.
- [x] No code changed; no PR opened; no DB writes.
- [x] Output report at `docs/diagnostics/DIAG-057_OUTPUT.md`.

*DIAG-057 — read-only. Disposition: CONFIRMED root cause, client-only fix at page.tsx:105;
must not break the analyze-document body path or assume XLSX. HF is the architect's to dispatch.*
