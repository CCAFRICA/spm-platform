# DIAG-005 COMPLETION REPORT
## Date: March 17, 2026

---

## PHASE 1: CODE TRACE

### Mission 1.1 — Import trigger

**Component:** `web/src/components/sci/SCIProposal.tsx`

The "Import N rows" button is rendered at line 498-509:
```tsx
<button
  onClick={handleImport}
  disabled={!allConfirmed}
  className={cn(
    'px-5 py-2 rounded-lg font-medium text-sm transition-colors',
    allConfirmed
      ? 'bg-indigo-600 text-white hover:bg-indigo-500'
      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
  )}
>
  Import {totalRows > 0 ? `${totalRows.toLocaleString()} rows` : 'data'}
</button>
```

`handleImport` at line 441-443:
```tsx
const handleImport = () => {
  onConfirmAll(effectiveUnits);
};
```

`effectiveUnits` at line 394-401 maps `proposal.contentUnits`, preserving all properties including `sourceFile`:
```tsx
const effectiveUnits = useMemo(() => {
  return proposal.contentUnits.map((u, i) => {
    const uniqueId = unitIds.get(i) || u.contentUnitId;
    const override = classificationOverrides.get(uniqueId);
    if (!override || override === u.classification) return { ...u, _uniqueId: uniqueId };
    return { ...u, classification: override, _uniqueId: uniqueId };
  });
}, [proposal.contentUnits, classificationOverrides, unitIds]);
```

`onConfirmAll` calls `handleConfirmAll` in `web/src/app/operate/import/page.tsx` (line 297-316):
```tsx
const handleConfirmAll = useCallback(async (confirmedUnits: ContentUnitProposal[]) => {
  if (state.phase !== 'proposal') return;

  // HF-140: Wait for ALL storage uploads to complete
  if (storageUploadPromiseRef.current) {
    await storageUploadPromiseRef.current;
  }
  const storagePaths = storagePathsRef.current;
  // Backwards compat: first path as single storagePath
  const storagePath = Object.values(storagePaths)[0] || undefined;

  setState({
    phase: 'executing',
    proposal: state.proposal,
    confirmedUnits,
    rawData: state.rawData,
    storagePath,       // ← FIRST file's storage path only
    storagePaths,      // ← All paths, keyed by ORIGINAL filename
  });
}, [state]);
```

**Key observation:** `storagePath` = `Object.values(storagePaths)[0]` — the first uploaded file's storage path. `storagePaths` is keyed by original filenames (e.g., `BCL_Datos_Feb2026.xlsx`).

---

### Mission 1.2 — Execute-bulk call

**Component:** `web/src/components/sci/SCIExecution.tsx`

`executeBulk` at line 156-234:
```tsx
const executeBulk = useCallback(async (dataUnits: ExecutionUnit[], bulkStoragePath?: string) => {
  const effectivePath = bulkStoragePath || storagePath;
  // ...
  const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proposalId: proposal.proposalId,
      tenantId,
      storagePath: effectivePath,   // ← SINGLE path for ALL content units
      contentUnits: bulkUnits,
    }),
  });
}, [confirmedUnits, proposal.proposalId, tenantId, storagePath]);
```

Execute-bulk is called with **ONE storagePath** and **ALL content units** in a single request. It does NOT send per-unit storage paths.

---

### Mission 1.3 — File download selection

**Route:** `web/src/app/api/import/sci/execute-bulk/route.ts`

Lines 108-122 — the server downloads ONE file from the `storagePath` parameter:
```tsx
// ── Step 1: Download file from Supabase Storage ──
console.log(`[SCI Bulk] Downloading from Storage: ${storagePath}`);
const { data: fileData, error: downloadErr } = await supabase.storage
  .from('ingestion-raw')
  .download(storagePath);
```

Then parses it and builds `sheetDataMap` (lines 124-148):
```tsx
const sheetDataMap = new Map<string, {
  rows: Record<string, unknown>[];
  columns: string[];
}>();

for (const sheetName of workbook.SheetNames) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) continue;
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
  sheetDataMap.set(sheetName, { rows: jsonData, columns });
}
```

Then ALL content units are processed against this ONE file's data (lines 170-226):
```tsx
for (const unit of sortedUnits) {
  // Resolve sheet data for this content unit
  const parts = unit.contentUnitId.split('::');
  const tabName = parts[1] || 'Sheet1';
  let sheetData = sheetDataMap.get(tabName);
  // ...
}
```

**Key observation:** `contentUnitId` is `"Datos"` (no `::` separator), so `parts[1]` is `undefined`, so `tabName` falls to `'Sheet1'`. But then the case-insensitive and single-sheet fallback at line 187 catches it — the file has one sheet ("Datos"), so it's used regardless.

---

### Mission 1.4 — SCIExecution commit path

`executeUnits` at line 285-504 — the commit path after user confirmation:
```tsx
const executeUnits = useCallback(async (unitsToExecute: ExecutionUnit[]) => {
  const planUnits = unitsToExecute.filter(u => u.classification === 'plan');
  const dataUnits = unitsToExecute.filter(u => u.classification !== 'plan');

  // ... plan units handled separately ...

  // HF-141: Group data units by source file for per-file content isolation.
  if (dataUnits.length > 0 && (storagePaths && Object.keys(storagePaths).length > 0 || storagePath)) {
    const fileGroups = new Map<string, ExecutionUnit[]>();
    for (const unit of dataUnits) {
      const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
      const sourceFile = proposalUnit?.sourceFile || '_default';
      if (!fileGroups.has(sourceFile)) fileGroups.set(sourceFile, []);
      fileGroups.get(sourceFile)!.push(unit);
    }

    for (const [sourceFile, groupUnits] of Array.from(fileGroups.entries())) {
      const hasMultipleFiles = fileGroups.size > 1;
      const filePath = storagePaths?.[sourceFile] || (!hasMultipleFiles ? storagePath : undefined);

      if (filePath) {
        await executeBulk(groupUnits, filePath);
      } else {
        // legacy fallback
      }
    }
  }
}, [confirmedUnits, rawData, proposal.proposalId, tenantId, storagePath, storagePaths, executeBulk, executeLegacyUnit]);
```

**THE BUG MANIFESTS HERE — two independent faults combine:**

**Fault 1: Non-unique `contentUnitId`**

All 6 content units from 6 different files have `contentUnitId: "Datos"` (the sheet name). The `confirmedUnits.find()` call at line 416 ALWAYS returns the FIRST match — the same unit for all 6 iterations. This means:
- `sourceFile` is the same for all 6 units (the first unit's `sourceFile`)
- `fileGroups.size = 1` (only one group)
- `hasMultipleFiles = false`
- `filePath = storagePaths?.[sourceFile] || storagePath`
- Since `storagePaths` lookup fails (Fault 2), falls to `storagePath` = first uploaded file's path

**Fault 2: Regex mismatch (contributing)**

The process-job worker at line 140 strips the upload prefix:
```tsx
const fileName = job.file_name.replace(/^\d+_[a-f0-9]{8}_/, '');
```

HF-141 changed the prefix format from `timestamp_uuid8_` to `timestamp_index_uuid8_`. The regex `^\d+_[a-f0-9]{8}_` fails to match the new format because the `_index_` component interrupts the hex pattern:
- Input: `1773760058273_0_4bc3bf57_BCL_Datos_Dic2025.xlsx`
- `\d+_` matches `1773760058273_` (13 digits + underscore)
- `[a-f0-9]{8}_` tries at `0_4bc3bf5` — `_` at position 2 is NOT hex → **FAILS**
- Result: fileName unchanged = full prefixed name

This means `sourceFile` on content units = prefixed name (e.g., `1773760058273_0_4bc3bf57_BCL_Datos_Dic2025.xlsx`), while `storagePathsRef` keys are original names (e.g., `BCL_Datos_Dic2025.xlsx`). Even if contentUnitId were unique, the `storagePaths[sourceFile]` lookup would still fail.

---

### Mission 1.5 — Classification vs commit comparison

**Classification path (CORRECT — 6 parallel workers):**

Each worker (`process-job/route.ts`) downloads its OWN file via `job.file_storage_path`:
```tsx
// process-job/route.ts line 79-81
const { data: fileData, error: downloadErr } = await supabase.storage
  .from('ingestion-raw')
  .download(job.file_storage_path);
```

Each job has a unique `file_storage_path` — PROVEN by database:
```
317fc8a1 | b1c2d3e4-.../1773760058273_0_4bc3bf57_BCL_Datos_Dic2025.xlsx
9bd1e438 | b1c2d3e4-.../1773760058273_1_47a0112a_BCL_Datos_Ene2026.xlsx
fa9848bb | b1c2d3e4-.../1773760058273_2_173ad137_BCL_Datos_Feb2026.xlsx
f9d00f8c | b1c2d3e4-.../1773760058273_3_14b42ba4_BCL_Datos_Mar2026.xlsx
f819830a | b1c2d3e4-.../1773760058273_4_b20b0b51_BCL_Datos_Nov2025.xlsx
688b9ad9 | b1c2d3e4-.../1773760058273_5_0c95ec50_BCL_Datos_Oct2025.xlsx
```

**Commit path (BROKEN — single file):**

`executeBulk` in `SCIExecution.tsx` sends ONE storagePath to execute-bulk:
```tsx
body: JSON.stringify({
  proposalId: proposal.proposalId,
  tenantId,
  storagePath: effectivePath,   // ← ONE path
  contentUnits: bulkUnits,      // ← ALL 6 units
}),
```

execute-bulk downloads ONE file and processes ALL content units against it:
```tsx
const { data: fileData } = await supabase.storage
  .from('ingestion-raw')
  .download(storagePath);     // ← ONE download
// ...
for (const unit of sortedUnits) {  // ← 6 units, same file data
  const result = await processContentUnit(supabase, tenantId, proposalId, profileId,
    effectiveUnit.unit, effectiveUnit.rows, fileNameFromPath, tabName);
}
```

**Where they diverge:**
- Classification: each worker uses `job.file_storage_path` (per-job, per-file) → 6 separate downloads
- Commitment: all 6 units routed through one `executeBulk` call with one `storagePath` → 1 download

The commit path NEVER consults `processing_jobs.file_storage_path`. It relies entirely on the client-side `storagePaths` prop with key matching that fails due to Faults 1 and 2.

---

## PHASE 2: DATABASE EVIDENCE

### Query 2.1: source_date distribution
```
source_date  | count | distinct batches
2026-02-01   | 510   | 6
```

**ALL 510 rows have source_date 2026-02-01.** 6 separate import batches, each with 85 rows, all containing February data. Confirms one file's data committed 6 times.

### Query 2.2: import_batches
```
id                                   | file_name                                          | rows | status    | created_at
7451d3a1-f35b-4a6c-9b67-4c62ee3faf87 | sci-bulk-ad53afac-bfad-4ee0-a15d-162c8d7e432e      | 85   | completed | 2026-03-17T15:14:15.99
4d3f5be2-2220-4acf-a735-03bc40714fc6 | sci-bulk-ad53afac-bfad-4ee0-a15d-162c8d7e432e      | 85   | completed | 2026-03-17T15:14:17.03
a8e0a6bc-9d6e-4b57-90f2-bc245d319450 | sci-bulk-ad53afac-bfad-4ee0-a15d-162c8d7e432e      | 85   | completed | 2026-03-17T15:14:17.75
7c57ab32-9ccf-4a41-b6ea-e8a24f27a8e6 | sci-bulk-ad53afac-bfad-4ee0-a15d-162c8d7e432e      | 85   | completed | 2026-03-17T15:14:18.53
68b4c2af-90fa-496d-8df2-14e90abfaea2 | sci-bulk-ad53afac-bfad-4ee0-a15d-162c8d7e432e      | 85   | completed | 2026-03-17T15:14:19.36
287ed793-700b-41c4-8f71-e3d994870f18 | sci-bulk-ad53afac-bfad-4ee0-a15d-162c8d7e432e      | 85   | completed | 2026-03-17T15:14:20.02
```

**All 6 batches share the same file_name** (same proposalId). All have 85 rows. All created within 4 seconds of each other. This confirms execute-bulk was called ONCE with 6 content units, creating 6 sequential batches from the same downloaded file.

### Query 2.3: processing_jobs
```
id       | file_name                                              | file_storage_path                                                                  | status     | tier
317fc8a1 | 1773760058273_0_4bc3bf57_BCL_Datos_Dic2025.xlsx        | b1c2d3e4-.../1773760058273_0_4bc3bf57_BCL_Datos_Dic2025.xlsx                       | classified | 3
9bd1e438 | 1773760058273_1_47a0112a_BCL_Datos_Ene2026.xlsx        | b1c2d3e4-.../1773760058273_1_47a0112a_BCL_Datos_Ene2026.xlsx                       | classified | 3
fa9848bb | 1773760058273_2_173ad137_BCL_Datos_Feb2026.xlsx        | b1c2d3e4-.../1773760058273_2_173ad137_BCL_Datos_Feb2026.xlsx                       | classified | 3
f9d00f8c | 1773760058273_3_14b42ba4_BCL_Datos_Mar2026.xlsx        | b1c2d3e4-.../1773760058273_3_14b42ba4_BCL_Datos_Mar2026.xlsx                       | classified | 3
f819830a | 1773760058273_4_b20b0b51_BCL_Datos_Nov2025.xlsx        | b1c2d3e4-.../1773760058273_4_b20b0b51_BCL_Datos_Nov2025.xlsx                       | classified | 3
688b9ad9 | 1773760058273_5_0c95ec50_BCL_Datos_Oct2025.xlsx        | b1c2d3e4-.../1773760058273_5_0c95ec50_BCL_Datos_Oct2025.xlsx                       | classified | 3
```

**6 jobs with 6 DIFFERENT `file_storage_path` values.** The async workers HAD the correct per-file paths. The commit path does NOT use these paths.

**Proposal `sourceFile` values (extracted from processing_jobs.proposal JSONB):**
```
317fc8a1 | sourceFile: 1773760058273_0_4bc3bf57_BCL_Datos_Dic2025.xlsx    | contentUnitId: Datos
9bd1e438 | sourceFile: 1773760058273_1_47a0112a_BCL_Datos_Ene2026.xlsx    | contentUnitId: Datos
fa9848bb | sourceFile: 1773760058273_2_173ad137_BCL_Datos_Feb2026.xlsx    | contentUnitId: Datos
f9d00f8c | sourceFile: 1773760058273_3_14b42ba4_BCL_Datos_Mar2026.xlsx    | contentUnitId: Datos
f819830a | sourceFile: 1773760058273_4_b20b0b51_BCL_Datos_Nov2025.xlsx    | contentUnitId: Datos
688b9ad9 | sourceFile: 1773760058273_5_0c95ec50_BCL_Datos_Oct2025.xlsx    | contentUnitId: Datos
```

**CRITICAL:** All 6 content units have `contentUnitId: "Datos"` — just the sheet name. And `sourceFile` contains the full prefixed storage filename (regex stripping failed).

**Regex stripping test (executed in Node.js):**
```
Input:  1773760058273_0_4bc3bf57_BCL_Datos_Dic2025.xlsx
Output: 1773760058273_0_4bc3bf57_BCL_Datos_Dic2025.xlsx
Changed: false

Input:  1773760058273_2_173ad137_BCL_Datos_Feb2026.xlsx
Output: 1773760058273_2_173ad137_BCL_Datos_Feb2026.xlsx
Changed: false
```

**CONFIRMED:** The regex `^\d+_[a-f0-9]{8}_` does NOT match the HF-141 prefix format `timestamp_index_uuid8_`.

---

## ROOT CAUSE DETERMINATION

**Root cause: A + C — DOUBLE FAULT**

### Fault 1 (Primary): Non-unique `contentUnitId` across multi-file imports

**Code:** `web/src/lib/sci/synaptic-ingestion-state.ts` line 489 + `content-profile.ts` line 358

`generateContentProfile` creates a unique contentUnitId as `${sourceFile}::${tabName}::${tabIndex}`. But `profileMap` is keyed by `sheetName`, not `contentUnitId`:
```tsx
// process-job/route.ts line 151
profileMap.set(sheet.sheetName, profile);
```

And `buildProposalFromState` uses the MAP KEY as `contentUnitId`:
```tsx
// synaptic-ingestion-state.ts line 489
for (const [unitId, profile] of Array.from(state.contentUnits.entries())) {
// ...
// line 605
contentUnits.push({
  contentUnitId: unitId,  // ← MAP KEY (sheet name), NOT profile.contentUnitId
```

For single-file analysis, this is fine — sheet names are unique within a file. But for multi-file async imports (OB-174), each file is processed independently by its own worker. When all files have the same sheet name ("Datos"), ALL 6 workers produce `contentUnitId: "Datos"`.

**Effect in commit path:** `confirmedUnits.find(u => u.contentUnitId === 'Datos')` returns the FIRST match every time. All 6 iterations get the same `sourceFile` → one file group → one `executeBulk` call → one file downloaded → 510 duplicate rows.

### Fault 2 (Contributing): Regex fails to strip HF-141 prefix

**Code:** `web/src/app/api/import/sci/process-job/route.ts` line 140

```tsx
const fileName = job.file_name.replace(/^\d+_[a-f0-9]{8}_/, '');
```

HF-141 changed the upload prefix from `timestamp_uuid8_` to `timestamp_index_uuid8_`:
```tsx
// page.tsx line 111
const uniqueSuffix = `${baseTimestamp}_${index}_${crypto.randomUUID().substring(0, 8)}`;
```

The regex `^\d+_[a-f0-9]{8}_` cannot match `1773760058273_0_4bc3bf57_` because after `\d+_` consumes `1773760058273_`, the next characters are `0_4bc3bf57` where the underscore after `0` breaks the `[a-f0-9]{8}` pattern.

**Effect:** `sourceFile` on content units = full prefixed storage filename. Even if contentUnitId were unique, `storagePaths[sourceFile]` would still fail because `storagePathsRef` keys are original filenames.

### Why both faults must be fixed

| Fix only Fault 1 | Fix only Fault 2 |
|---|---|
| contentUnitId is unique per file | contentUnitId still non-unique ("Datos" for all) |
| Each unit gets correct sourceFile | find() still returns wrong proposalUnit for 5/6 |
| sourceFile = prefixed name | sourceFile would be original name |
| storagePaths lookup STILL FAILS (key mismatch) | storagePaths lookup would match |
| Falls to storagePath fallback → wrong file | BUT sourceFile from wrong proposalUnit → wrong group |
| **STILL BROKEN** | **STILL BROKEN** |

**Both faults must be fixed simultaneously for correct multi-file commitment.**

---

## RECOMMENDED FIX (NOT IMPLEMENTING)

### Fix 1: Make contentUnitId unique across files

In `buildProposalFromState`, use `profile.contentUnitId` instead of the map key:
```tsx
// synaptic-ingestion-state.ts line 605
contentUnitId: profile.contentUnitId,  // "fileName::sheetName::tabIndex" — unique per file
```

### Fix 2: Fix the prefix-stripping regex

In `process-job/route.ts` line 140, update regex to handle `timestamp_index_uuid8_`:
```tsx
const fileName = job.file_name.replace(/^\d+_\d+_[a-f0-9]{8}_/, '');
```

### Fix 3: Alternative — bypass sourceFile matching entirely

Instead of matching `sourceFile` to `storagePathsRef` keys, have each content unit carry its own `file_storage_path` from the processing_job. The commit path would then download per-file directly from the known storage path, without relying on key matching.

This approach eliminates the entire class of key-mismatch bugs by keeping the storage path as a first-class property from worker through commit.

---

## KNOWN ISSUES

1. **Third instance of per-file isolation failure:** DIAG-004 (upload layer), HF-140 (classification layer), DIAG-005 (commit layer). Each fix addressed one layer but did not verify the full chain. A fix for DIAG-005 must include end-to-end verification from upload through commit.

2. **execute-bulk tabName resolution fragile:** The `contentUnitId.split('::')` logic at line 173 of execute-bulk/route.ts assumes the format `fileName::tabName::index`. With the current bug (`contentUnitId = "Datos"`), there's no `::` separator, so `parts[1]` is undefined, and it falls to `'Sheet1'`. The single-sheet fallback at line 187 masks this by using the only available sheet.

3. **510 rows with wrong source_dates remain in committed_data** for tenant `b1c2d3e4-aaaa-bbbb-cccc-111111111111`. These need to be cleaned up before re-importing.

4. **storagePathsRef keyed by `file.name` is fragile:** If a user renames a file before upload, or if the browser normalizes the filename differently from the storage path, the key match can fail silently.

5. **The `confirmedUnits.find()` pattern is O(n) per unit** — for large proposals with many content units, this becomes O(n²). Should be converted to a Map lookup.
