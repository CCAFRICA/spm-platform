# OB-111: MULTI-FILE IMPORT ARCHITECTURE
## Target: alpha.2.0
## Derived from: CLT-109 F-15, F-16, F-17, F-19 | CLT-102 F-26, F-27, F-32
## Depends on: OB-110 (PR #119 — expanded taxonomy, sample values, calibration)
## Alpha Exit Criteria: #3 (multi-file import handles N files independently)

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all standing rules, anti-patterns, architecture decision gates
2. `SCHEMA_REFERENCE.md` — authoritative column reference for all Supabase tables
3. **OB-110 completion report** — understand what files were modified and where the new taxonomy, sample extraction, and calibration live

---

## WHY THIS OB EXISTS

Multi-file CSV upload has failed in every CLT it's been tested. The evidence:

**CLT-102 (F-26):** 7 CSV files selected → Sheet Analysis shows 1 "Sheet1" with 48 rows × 3 columns. Actual files have different dimensions. Six files of data silently lost.

**CLT-109 (F-15):** Same test, same result. "1 sheets analyzed • 0 relationships detected." Still broken after OB-107.

**Root cause:** The file parsing code reads only the first file (or concatenates all files into one buffer). SheetJS receives one input and produces one workbook. The downstream flow — Sheet Analysis, Field Mapping, Validation, Commit — is architected for a single workbook, not N independent files.

**The fix:** Parse each uploaded file independently. Present N files as N cards in Sheet Analysis. Classify each file independently. Map fields per file. Show batch summary before commit. Commit each file's data separately.

**Key constraint:** Single XLSX with multiple sheets (Óptica workbook) MUST continue to work. This OB adds multi-file support WITHOUT breaking single-workbook support.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (`spm-platform`), NOT from `web/`.
4. Commit this prompt as first action.
5. **DO NOT MODIFY ANY AUTH FILE.**
6. Supabase .in() ≤ 200 items.
7. **REGRESSION GUARD:** Single XLSX import (Óptica pattern) must continue to work after every phase. If it breaks, stop and fix before continuing.

---

## PHASE 0: DIAGNOSTIC — Trace the File Processing Path

This diagnostic MUST run first. We need to understand exactly how files flow from upload to analysis.

```bash
echo "============================================"
echo "OB-111 PHASE 0: MULTI-FILE IMPORT DIAGNOSTIC"
echo "============================================"
echo ""

echo "=== 1. FIND THE ENHANCED IMPORT PAGE ==="
find web/src/app -path "*import*enhanced*" -name "page.tsx" | sort
echo ""

echo "=== 2. HOW DOES THE DROP ZONE / FILE INPUT WORK? ==="
# Find where files are received
grep -n "onDrop\|onChange.*file\|handleFile\|acceptedFiles\|FileList\|inputRef\|selectedFile\|setFile\|dropzone\|useDropzone\|multiple" \
  web/src/app/data/import/enhanced/page.tsx web/src/app/operate/import/enhanced/page.tsx 2>/dev/null \
  | head -30
echo ""

echo "=== 3. HOW ARE FILES STORED IN STATE? ==="
# Is it a single File or File[]?
grep -n "useState.*File\|useState.*file\|files\b\|selectedFiles\|uploadedFile" \
  web/src/app/data/import/enhanced/page.tsx web/src/app/operate/import/enhanced/page.tsx 2>/dev/null \
  | head -20
echo ""

echo "=== 4. HOW IS FILE DATA SENT TO THE API? ==="
# Find the fetch/API call that sends file data for analysis
grep -n "fetch.*api\|FormData\|formData\|analyzeWorkbook\|analyze-workbook" \
  web/src/app/data/import/enhanced/page.tsx web/src/app/operate/import/enhanced/page.tsx 2>/dev/null \
  | head -20
echo ""

echo "=== 5. WHAT DOES THE ANALYZE-WORKBOOK ROUTE RECEIVE? ==="
# How does the API route parse the incoming file(s)?
cat web/src/app/api/analyze-workbook/route.ts | head -80
echo ""

echo "=== 6. HOW DOES XLSX PARSE THE FILE? ==="
grep -n "XLSX\|read\|xlsx\|workbook\|sheet_to_json\|SheetNames" \
  web/src/app/api/analyze-workbook/route.ts | head -20
echo ""

echo "=== 7. WHAT STATE DOES SHEET ANALYSIS DISPLAY? ==="
# What data structure does the Sheet Analysis step render?
grep -n "sheets\|analysis\|sheetData\|parsedSheet\|workbookData\|analysisResult" \
  web/src/app/data/import/enhanced/page.tsx web/src/app/operate/import/enhanced/page.tsx 2>/dev/null \
  | head -20
echo ""

echo "=== 8. IS THERE A MULTI-FILE LOOP OR SINGLE-FILE ASSUMPTION? ==="
# Critical: is there any loop over files?
grep -n "\.map\|\.forEach\|for.*of.*file\|files\.\|file\[" \
  web/src/app/data/import/enhanced/page.tsx web/src/app/operate/import/enhanced/page.tsx 2>/dev/null \
  | grep -i "file" | head -20
echo ""

echo "=== 9. HOW DOES THE COMMIT/SAVE WORK? ==="
grep -n "commit\|save\|import.*batch\|importBatch\|committed_data" \
  web/src/app/data/import/enhanced/page.tsx web/src/app/operate/import/enhanced/page.tsx 2>/dev/null \
  | head -15
echo ""

echo "=== 10. PRINT THE FULL PAGE FILE (first 200 lines) ==="
# Get the primary import page path
IMPORT_PAGE=$(find web/src/app -path "*import*enhanced*" -name "page.tsx" | head -1)
echo "File: $IMPORT_PAGE"
wc -l "$IMPORT_PAGE"
head -200 "$IMPORT_PAGE"
echo ""

echo "=== 11. CHECK THE FILE INPUT COMPONENT ==="
# Is there a shared file upload component?
find web/src/components -iname "*upload*" -o -iname "*dropzone*" -o -iname "*file*input*" | sort
echo ""

echo "=== 12. OB-110 FILES — VERIFY DEPENDENCY ==="
echo "--- smart-mapper.ts (taxonomy) ---"
grep -c "BASE_FIELD_TYPES\|extractSampleValues\|calibrateFieldMappings" \
  web/src/lib/import-pipeline/smart-mapper.ts 2>/dev/null
echo "--- analyze-workbook route (sample values) ---"
grep -c "extractSampleValues\|calibrateFieldMappings\|sampleValues" \
  web/src/app/api/analyze-workbook/route.ts 2>/dev/null
echo ""

echo "=== PHASE 0 COMPLETE ==="
echo "Now read the FULL content of:"
echo "1. The import page (entire file)"
echo "2. The analyze-workbook route (entire file)"
echo "3. Any shared file upload/dropzone component"
echo "Before proceeding to Phase 1."
```

**After running the diagnostic, you MUST read and understand:**
1. The full import page (how files are received, stored in state, sent to API)
2. The analyze-workbook route (how it parses and analyzes file data)
3. Whether files are stored as `File` (singular) or `File[]` (array) in state
4. Whether the API receives one file or multiple files

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-111 Phase 0: Multi-file import diagnostic" && git push origin dev`

---

## PHASE 1: CLIENT-SIDE MULTI-FILE PARSING

The file input/drop zone must accept multiple files and parse each one independently on the client side before sending to the API.

### 1A: Ensure File Input Accepts Multiple Files

Find the file input element or drop zone. Add `multiple` attribute if missing:

```tsx
// If using <input type="file">:
<input type="file" multiple accept=".xlsx,.csv,.txt,.tsv" onChange={handleFiles} />

// If using a drop zone library (react-dropzone):
const { getRootProps, getInputProps } = useDropzone({
  multiple: true, // MUST be true
  accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'text/csv': ['.csv'], 'text/plain': ['.txt', '.tsv'] },
  onDrop: handleFiles,
});
```

### 1B: Store Files as Array in State

```typescript
// State for uploaded files — ALWAYS an array
interface ParsedFile {
  file: File;
  filename: string;
  fileIndex: number;
  sheets: Array<{
    name: string;
    columns: string[];
    rows: Record<string, any>[];
    rowCount: number;
    colCount: number;
    sampleValues: Record<string, string[]>;
  }>;
  // Populated after AI analysis:
  classification?: {
    type: string;          // 'roster', 'transaction', 'balance_snapshot', etc.
    confidence: number;
    suggestedPlan?: string;
    narrative?: string;
  };
  fieldMappings?: Array<{
    column: string;
    target: string;
    confidence: number;
    warning?: string;
  }>;
  selectedPlanId?: string;
}

const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
```

### 1C: Parse Each File Independently on Upload

```typescript
import * as XLSX from 'xlsx';
import { extractSampleValues } from '@/lib/import-pipeline/smart-mapper'; // OB-110

async function handleFiles(acceptedFiles: File[]) {
  const parsed: ParsedFile[] = [];

  for (let i = 0; i < acceptedFiles.length; i++) {
    const file = acceptedFiles[i];
    const buffer = await file.arrayBuffer();
    
    try {
      const workbook = XLSX.read(buffer, { type: 'array' });
      
      const sheets = workbook.SheetNames.map(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, any>[];
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        const sampleValues = extractSampleValues(rows, 5);
        
        return {
          name: sheetName,
          columns,
          rows,
          rowCount: rows.length,
          colCount: columns.length,
          sampleValues,
        };
      });
      
      parsed.push({
        file,
        filename: file.name,
        fileIndex: i,
        sheets,
      });
    } catch (err) {
      console.error(`Failed to parse ${file.name}:`, err);
      // Still add it — mark as failed so the user can see which file had issues
      parsed.push({
        file,
        filename: file.name,
        fileIndex: i,
        sheets: [],
      });
    }
  }
  
  setParsedFiles(parsed);
  
  // Automatically advance to Sheet Analysis step
  // (adjust based on how the stepper works in the current code)
}
```

**IMPORTANT:** `extractSampleValues` was added in OB-110 to `smart-mapper.ts`. Import it. If it's not exported, export it.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-111 Phase 1: Client-side multi-file parsing — each file independent" && git push origin dev`

---

## PHASE 2: SHEET ANALYSIS — ONE CARD PER FILE

Replace the current Sheet Analysis step (which shows one "Sheet1" card) with a card per file.

### 2A: File Cards Grid

```tsx
{/* Sheet Analysis Step */}
<div className="space-y-4">
  <div className="flex items-center justify-between">
    <h3 className="text-zinc-200 font-medium">
      {parsedFiles.length} file{parsedFiles.length !== 1 ? 's' : ''} uploaded
    </h3>
    <span className="text-zinc-400 text-sm">
      {parsedFiles.reduce((sum, f) => sum + f.sheets.reduce((s, sh) => s + sh.rowCount, 0), 0)} total rows
    </span>
  </div>
  
  {parsedFiles.map((pf, idx) => (
    <div key={idx} className="border border-zinc-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-sm font-mono">{idx + 1}</span>
          <h4 className="text-zinc-200 font-medium">{pf.filename}</h4>
        </div>
        <span className="text-zinc-400 text-sm">
          {pf.sheets.reduce((s, sh) => s + sh.rowCount, 0)} rows · 
          {pf.sheets.length} sheet{pf.sheets.length !== 1 ? 's' : ''} · 
          {pf.sheets[0]?.colCount || 0} columns
        </span>
      </div>
      
      {/* AI Classification Result (populated after Phase 3 analysis) */}
      {pf.classification ? (
        <div className="flex items-center gap-3 mt-2">
          <span className={`text-xs px-2 py-1 rounded ${
            pf.classification.confidence >= 0.8 ? 'bg-emerald-900/50 text-emerald-400' :
            pf.classification.confidence >= 0.5 ? 'bg-amber-900/50 text-amber-400' :
            'bg-red-900/50 text-red-400'
          }`}>
            {Math.round(pf.classification.confidence * 100)}%
          </span>
          <span className="text-zinc-300 text-sm">{pf.classification.type}</span>
          {pf.classification.suggestedPlan && (
            <span className="text-zinc-500 text-sm">→ {pf.classification.suggestedPlan}</span>
          )}
        </div>
      ) : (
        <div className="text-zinc-500 text-sm mt-2">Analyzing...</div>
      )}
      
      {/* Columns preview */}
      <div className="mt-2 flex flex-wrap gap-1">
        {pf.sheets[0]?.columns.slice(0, 8).map((col, ci) => (
          <span key={ci} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
            {col}
          </span>
        ))}
        {(pf.sheets[0]?.columns.length || 0) > 8 && (
          <span className="text-xs text-zinc-500">+{pf.sheets[0].columns.length - 8} more</span>
        )}
      </div>
    </div>
  ))}
</div>
```

### 2B: Handle Single XLSX with Multiple Sheets (Regression)

A single XLSX file with 7 sheets (Óptica) should show as 1 file card with "7 sheets" in the badge. The sheets are listed inside that card, not as 7 separate file cards.

```tsx
{/* Inside a file card, if the file has multiple sheets */}
{pf.sheets.length > 1 && (
  <div className="mt-3 space-y-1">
    {pf.sheets.map((sheet, si) => (
      <div key={si} className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="font-mono">{si + 1}</span>
        <span>{sheet.name}</span>
        <span>· {sheet.rowCount} rows × {sheet.colCount} cols</span>
      </div>
    ))}
  </div>
)}
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-111 Phase 2: Sheet Analysis — one card per file with column preview" && git push origin dev`

---

## PHASE 3: PER-FILE AI CLASSIFICATION

Each file gets its own AI analysis call. Do NOT concatenate files into one analysis request.

### 3A: Analyze Each File Independently

```typescript
async function analyzeAllFiles(files: ParsedFile[], tenantId: string, plans: any[]) {
  // Process all files in parallel (Promise.all)
  const results = await Promise.all(
    files.map(async (pf) => {
      try {
        const response = await fetch('/api/analyze-workbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Send per-file data
            filename: pf.filename,
            sheets: pf.sheets.map(s => ({
              name: s.name,
              columns: s.columns,
              rowCount: s.rowCount,
              sampleValues: s.sampleValues,
            })),
            tenantId,
            plans: plans.map(p => ({ id: p.id, name: p.name })),
          }),
        });
        
        if (!response.ok) throw new Error(`Analysis failed for ${pf.filename}`);
        return await response.json();
      } catch (err) {
        console.error(`Analysis failed for ${pf.filename}:`, err);
        return {
          classification: { type: 'unknown', confidence: 0, narrative: 'Analysis failed' },
          fieldMappings: [],
        };
      }
    })
  );
  
  // Update state with classification results
  setParsedFiles(prev => prev.map((pf, idx) => ({
    ...pf,
    classification: results[idx]?.classification,
    fieldMappings: results[idx]?.fieldMappings || results[idx]?.mappings,
  })));
}
```

### 3B: Modify the API Route to Accept Per-File Data

The analyze-workbook route currently expects a file buffer. If it receives JSON with sheet data + sample values (as in the above), adapt:

```typescript
// In analyze-workbook/route.ts:
// Check if the request is JSON (per-file from OB-111) or FormData (legacy single-file)
const contentType = request.headers.get('content-type') || '';

if (contentType.includes('application/json')) {
  // OB-111 path: pre-parsed data with sample values
  const body = await request.json();
  const { filename, sheets, tenantId, plans } = body;
  
  // sheets already contains columns, rowCount, sampleValues
  // Skip XLSX parsing — data is already parsed on the client
  // Go directly to AI classification with the provided data
  
} else {
  // Legacy path: FormData with file buffer — existing logic
  // Keep this for backward compatibility
}
```

**IMPORTANT:** The API route already has OB-110's sample value extraction and calibration. When receiving pre-parsed data from OB-111, the sample values come from the client. The route should use them directly instead of re-extracting.

### 3C: Plan Selector Per File

Each file card in Sheet Analysis should have a plan dropdown:

```tsx
{/* Plan selector per file */}
<div className="mt-3">
  <label className="text-zinc-500 text-xs">Assign to plan:</label>
  <select 
    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-sm p-2"
    value={pf.selectedPlanId || pf.classification?.suggestedPlan || ''}
    onChange={(e) => {
      setParsedFiles(prev => prev.map((f, i) => 
        i === idx ? { ...f, selectedPlanId: e.target.value } : f
      ));
    }}
  >
    <option value="">No plan (import as raw data)</option>
    {plans.map(plan => (
      <option key={plan.id} value={plan.id}>{plan.name}</option>
    ))}
  </select>
</div>
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-111 Phase 3: Per-file AI classification with parallel analysis" && git push origin dev`

---

## PHASE 4: FIELD MAPPING PER FILE

The Field Mapping step currently shows one mapping table. Replace with a per-file view.

### 4A: Tabbed or Accordion Layout

```tsx
{/* Field Mapping Step — per file */}
<div className="space-y-6">
  {parsedFiles.map((pf, idx) => (
    <div key={idx} className="border border-zinc-700 rounded-lg overflow-hidden">
      {/* File header — collapsible */}
      <button 
        onClick={() => toggleExpanded(idx)}
        className="w-full flex items-center justify-between p-4 bg-zinc-800/50 hover:bg-zinc-800"
      >
        <div className="flex items-center gap-3">
          <span className="text-zinc-400 font-mono text-sm">{idx + 1}</span>
          <span className="text-zinc-200 font-medium">{pf.filename}</span>
          <span className="text-zinc-500 text-sm">{pf.sheets[0]?.colCount || 0} fields</span>
        </div>
        <div className="flex items-center gap-2">
          {pf.fieldMappings && (
            <span className="text-emerald-400 text-xs">
              {pf.fieldMappings.filter(m => m.confidence >= 0.8).length}/{pf.fieldMappings.length} confident
            </span>
          )}
          <ChevronIcon expanded={expandedFiles.includes(idx)} />
        </div>
      </button>
      
      {/* Expanded: show field mapping table */}
      {expandedFiles.includes(idx) && (
        <div className="p-4">
          {/* Data preview — first 5 rows */}
          <div className="mb-4 overflow-x-auto">
            <table className="text-xs text-zinc-400">
              <thead>
                <tr>
                  {pf.sheets[0]?.columns.map((col, ci) => (
                    <th key={ci} className="px-2 py-1 text-left font-medium">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pf.sheets[0]?.rows.slice(0, 3).map((row, ri) => (
                  <tr key={ri}>
                    {pf.sheets[0]?.columns.map((col, ci) => (
                      <td key={ci} className="px-2 py-1 whitespace-nowrap">
                        {String(row[col] ?? '').slice(0, 30)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Field mapping rows — reuse existing FieldMapper or mapping UI */}
          {/* Pass per-file mappings, sample values, and update handler */}
          <FieldMappingTable
            columns={pf.sheets[0]?.columns || []}
            sampleValues={pf.sheets[0]?.sampleValues || {}}
            aiSuggestions={pf.fieldMappings || []}
            onUpdate={(mappings) => {
              setParsedFiles(prev => prev.map((f, i) =>
                i === idx ? { ...f, fieldMappings: mappings } : f
              ));
            }}
          />
        </div>
      )}
    </div>
  ))}
</div>
```

### 4B: First File Expanded by Default

```typescript
const [expandedFiles, setExpandedFiles] = useState<number[]>([0]); // First file expanded

function toggleExpanded(idx: number) {
  setExpandedFiles(prev => 
    prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
  );
}
```

### 4C: "Expand All / Collapse All" Control

```tsx
<div className="flex justify-end gap-2 mb-4">
  <button onClick={() => setExpandedFiles(parsedFiles.map((_, i) => i))} className="text-xs text-zinc-400 hover:text-zinc-200">
    Expand all
  </button>
  <button onClick={() => setExpandedFiles([])} className="text-xs text-zinc-400 hover:text-zinc-200">
    Collapse all
  </button>
</div>
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-111 Phase 4: Per-file field mapping with accordion layout" && git push origin dev`

---

## PHASE 5: BATCH SUMMARY BEFORE COMMIT

Before committing data, show a summary of all files with their status.

### 5A: Summary View

```tsx
{/* Validate & Preview Step — Batch Summary */}
<div className="space-y-4">
  <h3 className="text-zinc-200 font-medium">Import Summary — {parsedFiles.length} files</h3>
  
  {parsedFiles.map((pf, idx) => {
    const confidentMappings = pf.fieldMappings?.filter(m => m.confidence >= 0.5).length || 0;
    const totalMappings = pf.fieldMappings?.length || 0;
    const hasWarnings = pf.fieldMappings?.some(m => m.warning);
    const planName = plans.find(p => p.id === pf.selectedPlanId)?.name || 'No plan assigned';
    const totalRows = pf.sheets.reduce((s, sh) => s + sh.rowCount, 0);
    
    return (
      <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
        {/* Status icon */}
        <span className={`text-lg ${hasWarnings ? '⚠️' : '✓'}`}>
          {hasWarnings ? '⚠️' : '✅'}
        </span>
        
        {/* File info */}
        <div className="flex-1">
          <div className="text-zinc-200 text-sm font-medium">{pf.filename}</div>
          <div className="text-zinc-500 text-xs">
            {totalRows} rows · {planName} · {confidentMappings}/{totalMappings} fields mapped
          </div>
        </div>
        
        {/* Classification */}
        <span className="text-zinc-400 text-xs bg-zinc-800 px-2 py-1 rounded">
          {pf.classification?.type || 'Unknown'}
        </span>
      </div>
    );
  })}
  
  {/* Batch actions */}
  <div className="flex justify-between items-center pt-4 border-t border-zinc-700">
    <button onClick={() => setStep('fieldMapping')} className="text-zinc-400 hover:text-zinc-200 text-sm">
      ← Back to Mappings
    </button>
    <div className="flex gap-3">
      <button 
        onClick={handleCommitAll}
        className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-medium"
      >
        Commit All ({parsedFiles.length} files)
      </button>
    </div>
  </div>
</div>
```

### 5B: Commit Each File's Data Separately

```typescript
async function handleCommitAll() {
  setCommitting(true);
  
  for (const pf of parsedFiles) {
    try {
      // Each file committed as a separate import event
      const response = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          filename: pf.filename,
          planId: pf.selectedPlanId || null,
          classification: pf.classification,
          fieldMappings: pf.fieldMappings,
          sheets: pf.sheets.map(s => ({
            name: s.name,
            rows: s.rows,
            columns: s.columns,
          })),
        }),
      });
      
      if (!response.ok) {
        console.error(`Commit failed for ${pf.filename}`);
        // Mark this file as failed in the UI
      }
    } catch (err) {
      console.error(`Commit error for ${pf.filename}:`, err);
    }
  }
  
  setCommitting(false);
  // Navigate to success/results
}
```

**NOTE:** If the commit endpoint doesn't accept JSON in this format, adapt. The key requirement is that each file's data is committed separately, not concatenated. Each file should create its own `import_batch` record (or equivalent) so they can be tracked independently.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-111 Phase 5: Batch summary and per-file commit" && git push origin dev`

---

## PHASE 6: REGRESSION TEST AND BUILD

### 6A: Build Verification

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -30
echo "Build exit code: $?"
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### 6B: Regression Check

Navigate to import page. Test with a SINGLE XLSX file (the Óptica workbook if available, or any XLSX):
1. Upload one XLSX → should show 1 file card
2. If the XLSX has multiple sheets, each sheet listed INSIDE the card
3. Field mapping works for the single file
4. Commit works

This confirms the Óptica regression doesn't break.

### 6C: Multi-File Check

If test CSV files are available:
1. Upload 2+ CSV files
2. Each shows as a separate card with its own row count and columns
3. AI classifies each independently
4. Field mapping shows per-file

If no test CSVs are available, verify the UI structure renders correctly with at least 1 file.

---

## PROOF GATES (16)

| # | Gate | Criterion | Evidence |
|---|------|-----------|----------|
| PG-01 | npm run build exits 0 | Clean build | Build log |
| PG-02 | localhost:3000 responds | HTTP 200 or 307 | curl output |
| PG-03 | File input accepts multiple files | `multiple` attribute present | Code review |
| PG-04 | State stores File[] (array, not single) | ParsedFile[] type | Code review |
| PG-05 | Each file parsed independently | Loop over files with XLSX.read per file | Code review |
| PG-06 | Sheet Analysis shows N cards for N files | UI renders parsedFiles.map() | Browser or code review |
| PG-07 | Each card shows filename | pf.filename displayed | Code review |
| PG-08 | Each card shows correct row/column count | Per-sheet counts | Code review |
| PG-09 | AI called per file (not once for all) | Promise.all over files | Code review |
| PG-10 | Plan selector per file | Dropdown in each card | Code review |
| PG-11 | Field mapping per file | Accordion with per-file mapping table | Code review |
| PG-12 | Batch summary shows all files | Summary step before commit | Code review |
| PG-13 | Commit stores each file separately | Per-file commit call | Code review |
| PG-14 | Single XLSX (Óptica pattern) still works | Regression test | Browser verify |
| PG-15 | No auth files modified | `git diff --name-only` | Diff output |
| PG-16 | OB-110 taxonomy/sample values used | extractSampleValues imported from smart-mapper | Code review |

---

## RELEASE CONTEXT

```
Target: alpha.2.0
Depends on: OB-110 (PR #119)
PR: [number from gh pr create]
Verified by: CLT-112
```

### Create PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-111: Multi-File Import Architecture [alpha.2.0]" \
  --body "## Target: alpha.2.0
## Derived from: CLT-109 F-15/F-16/F-17/F-19, CLT-102 F-26/F-27/F-32
## Depends on: OB-110 (PR #119)

### What Changed
Multi-file upload now parses each file independently instead of collapsing N files into one sheet.
- File input accepts multiple files (CSVs, XLSX, mixed)
- Each file parsed independently with SheetJS
- Sheet Analysis shows N cards (one per file) with filename, row count, columns
- AI classifies each file independently (parallel Promise.all)
- Plan selector per file — user can assign different plans to different files
- Field mapping per file with accordion layout
- Batch summary before commit shows all files with status
- Each file committed separately to committed_data

### Regression
Single XLSX with multiple sheets (Óptica workbook pattern) continues to work — shows as 1 file card with N sheets inside.

### CLT-109 Regression Test (Expected)
7 Caribe CSV files → 7 separate cards, each with correct filename, row count, independent classification.

16 proof gates. No auth files modified."
```

**Final commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-111 Complete: Multi-File Import Architecture — targeting alpha.2.0" && git push origin dev`

---

## WHAT THIS OB DOES NOT DO

| Item | Why Excluded | Where Handled |
|------|-------------|---------------|
| Landing page routing | Separate scope | HF-076 (alpha.2.0) |
| Taxonomy changes | Already done | OB-110 (PR #119) |
| Navigation redesign | Needs design session | S30 → alpha.3.0 |
| Financial module changes | Not import-related | alpha.3.0 |
| N+1 query elimination | PDR-04, separate scope | OB-113 (alpha.3.0) |
| Import subtext ("Import Excel...") | Copy change, minor | HF batch |
| Period selector in header | Design decision needed | S30 |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Skip Phase 0, guess at file structure | Phase 0 is mandatory. Read the full import page. |
| AP-4 | Build multi-file UI but never wire to API | Verify analyzeAllFiles calls the real API and results update state |
| AP-5 | Rename proof gates | Gates are immutable. PASS or FAIL. |
| AP-6 | Git from web/ | cd to spm-platform root |
| AP-7 | Break single-file import while adding multi-file | Regression test (PG-14) is mandatory |
| AP-12 | Concatenate file buffers before parsing | Parse EACH file independently. This is the ROOT CAUSE of the bug. |

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*OB-111: "Seven files means seven analyses. Not one blob."*
