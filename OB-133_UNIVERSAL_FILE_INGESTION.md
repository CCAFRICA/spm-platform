# OB-133: UNIVERSAL FILE INGESTION
## SCI Handles Every Format: PPTX, PDF, XLSX, CSV, TSV, DOCX
## One Surface, Any File, Platform Figures It Out
## Date: 2026-03-01
## Type: Overnight Batch
## Estimated Duration: 18-22 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `web/src/lib/sci/sci-types.ts` — SCI type definitions
4. `web/src/lib/sci/agents.ts` — agent scoring models
5. `web/src/lib/sci/content-profile.ts` — content profile generator
6. `web/src/components/sci/SCIUpload.tsx` — current upload component (OB-129)
7. `web/src/app/api/import/sci/analyze/route.ts` — SCI analyze API
8. `web/src/app/api/import/sci/execute/route.ts` — SCI execute API

Then find and read:
9. The plan interpretation service — `grep -rn "interpretPlan\|planInterpret\|AIService.*plan" web/src/lib/ --include="*.ts" -l`
10. The plan import API route — `find web/src/app/api -path "*plan*" -name "route.ts"`

---

## WHY THIS OB EXISTS

SCI made a promise: **"The customer drops a file. The platform figures it out."**

Right now, that promise is half-kept. SCI handles XLSX and CSV beautifully — agents classify content, propose in customer vocabulary, confirm with one click. But a real customer doesn't only have spreadsheets. They have:

- **A PowerPoint** with their compensation plan (PPTX)
- **A PDF** with their compensation rules
- **Tab-delimited exports** from their HRIS (TSV)
- **A Word document** with plan amendments (DOCX)
- **Spreadsheets** with data (XLSX, CSV)

Today, if a customer drops a PPTX on the SCI upload surface, it rejects it. They have to know to go to Configure → Plan Import instead. That's the two-path problem SCI was built to eliminate.

After OB-133, the customer drops **any file** on `/operate/import`. The platform:
1. Identifies the file type
2. Extracts content appropriate to the format
3. Runs SCI agents to classify what the content is
4. For plan documents (PPTX/PDF/DOCX): routes to the plan interpretation pipeline
5. For data files (XLSX/CSV/TSV): routes through the existing SCI execute pipeline
6. Presents a unified proposal — "I found a compensation plan with 6 components" or "I found transaction data for 719 entities"

One surface. Any file. Platform figures it out.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev --title "OB-133: Universal File Ingestion" --body "..."`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain vocabulary.** Korean Test applies.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 0: DIAGNOSTIC — CURRENT FORMAT SUPPORT

### 0A: SCIUpload — what formats does it accept?

```bash
echo "=== SCIUPLOAD ACCEPTED FORMATS ==="
grep -n "accept\|\.xlsx\|\.csv\|\.pdf\|\.pptx\|\.tsv\|\.docx\|mime\|type.*file\|supported\|format" \
  web/src/components/sci/SCIUpload.tsx | head -20

echo ""
echo "=== FILE PARSING IN SCIUPLOAD ==="
grep -n "parseFile\|XLSX\|SheetJS\|readFile\|arrayBuffer\|FileReader" \
  web/src/components/sci/SCIUpload.tsx | head -20
```

### 0B: SCI analyze API — what does it expect?

```bash
echo "=== SCI ANALYZE INPUT ==="
cat web/src/app/api/import/sci/analyze/route.ts | head -40

echo ""
echo "=== CONTENT PROFILE GENERATION ==="
grep -n "function\|export" web/src/lib/sci/content-profile.ts | head -15
```

### 0C: Plan interpretation pipeline — where is it?

```bash
echo "=== PLAN INTERPRETATION SERVICE ==="
grep -rn "interpretPlan\|planInterpret\|AIService.*plan\|extractPlan\|parsePlan" \
  web/src/lib/ web/src/app/api/ --include="*.ts" -l | head -10

echo ""
echo "=== PLAN IMPORT API ==="
find web/src/app/api -path "*plan*" -name "route.ts" | sort
find web/src/app -path "*plan*import*" -name "page.tsx" | sort

echo ""
echo "=== PLAN IMPORT FLOW ==="
# How does the existing plan import handle PPTX?
grep -rn "pptx\|PPTX\|powerpoint\|application/vnd" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -15

echo ""
echo "=== PDF HANDLING ==="
grep -rn "pdf\|PDF\|application/pdf" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -15
```

### 0D: TSV handling

```bash
echo "=== TSV SUPPORT ==="
grep -rn "tsv\|TSV\|tab.*delim\|tab.*separated\|\\\t" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10
```

### 0E: Anthropic API document handling

```bash
echo "=== ANTHROPIC API CALLS ==="
grep -rn "anthropic\|claude\|Messages\|content.*type.*document\|content.*type.*image\|base64" \
  web/src/lib/ --include="*.ts" | head -20
```

**Commit:** `OB-133 Phase 0: Diagnostic — format support, plan pipeline, PDF/PPTX handling`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD — OB-133
=====================================

Problem: SCI upload only accepts XLSX/CSV. Customers bring PPTX, PDF, DOCX, TSV.
  The two-path import (Configure for plans, Operate for data) must collapse into one.

DESIGN: Unified format handling in three layers.

Layer 1: FILE ACCEPTANCE + PARSING (client-side)
  SCIUpload accepts: XLSX, CSV, TSV, PPTX, PDF, DOCX
  Parsing per format:
  - XLSX/CSV/TSV: SheetJS (existing). TSV = CSV with tab delimiter.
  - PPTX: Cannot parse client-side. Send raw file to server.
  - PDF: Cannot parse client-side. Send raw file to server.
  - DOCX: Cannot parse client-side. Send raw file to server.

  For tabular formats (XLSX/CSV/TSV): client parses, extracts columns + rows,
    sends structured data to /api/import/sci/analyze (existing flow).

  For document formats (PPTX/PDF/DOCX): client sends raw file (base64) to
    a NEW endpoint /api/import/sci/analyze-document that:
    1. Sends the document to Anthropic API for content extraction
    2. Anthropic returns structured content (text, tables, slide content)
    3. SCI agents score the extracted content
    4. Plan Agent almost certainly wins (high confidence)
    5. Returns a proposal with classification = 'plan'

Layer 2: SCI CLASSIFICATION (server-side)
  Existing agents work unchanged for tabular data.
  For document-sourced content, the Plan Agent gets additional signals:
  - File extension is .pptx/.pdf/.docx → strong Plan Agent signal
  - Content contains natural language descriptions → Plan Agent signal
  - Content contains embedded tables → possible rate/tier structures
  - No entity ID column → not Entity/Transaction data

Layer 3: EXECUTION ROUTING (server-side)
  When confirmed classification = 'plan':
    Route to existing plan interpretation pipeline
    (the same service Configure → Plan Import uses)
    Returns: rule set created, components extracted, confidence scores

  When confirmed classification = 'entity'/'target'/'transaction':
    Route through existing SCI execute pipeline (unchanged)

RESULT: Customer drops ANY file on /operate/import. Platform handles it.
  No need to know about Configure vs Operate. One surface.
```

**Commit:** `OB-133 Phase 1: Architecture decision — unified format handling, three-layer design`

---

## PHASE 2: TSV SUPPORT IN CLIENT PARSER

The simplest expansion. TSV is CSV with tab delimiters. SheetJS already handles it.

### 2.1: Update SCIUpload accepted formats

Add TSV to the accepted file types:

```typescript
// Current (likely): .xlsx, .csv
// New: .xlsx, .xls, .csv, .tsv
const ACCEPTED_FORMATS = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
  'text/tab-separated-values': ['.tsv'],
  // Document formats (handled differently):
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};
```

### 2.2: Parse TSV through SheetJS

SheetJS reads TSV natively. Verify:

```typescript
// SheetJS handles TSV with the FS option
const workbook = XLSX.read(data, { type: 'array' }); // Works for TSV
```

If SheetJS doesn't auto-detect TSV, add explicit delimiter detection:

```typescript
function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0];
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return tabs > commas ? '\t' : ',';
}
```

### 2.3: Update upload zone UI text

The drop zone message should list all accepted formats:
"Drop your file here — XLSX, CSV, TSV, PDF, PPTX, DOCX"

**Tests:** Create a simple TSV test file (3 columns, 5 rows), upload through SCI, verify agents classify correctly.

**Commit:** `OB-133 Phase 2: TSV support — SheetJS parsing, accepted formats expanded`

---

## PHASE 3: DOCUMENT FORMAT ACCEPTANCE (PPTX / PDF / DOCX)

### 3.1: Update SCIUpload to handle document formats

When the user drops a PPTX, PDF, or DOCX, the client cannot parse it into rows/columns. Instead:

1. Detect the file type by extension and MIME type
2. Convert to base64
3. Show a different analysis state: "Analyzing document..." (vs "Analyzing spreadsheet...")
4. Call a different API endpoint: `POST /api/import/sci/analyze-document`

```typescript
function isDocumentFormat(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ['pptx', 'pdf', 'docx'].includes(ext || '');
}

function isTabularFormat(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ['xlsx', 'xls', 'csv', 'tsv'].includes(ext || '');
}
```

### 3.2: File-to-base64 conversion

```typescript
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // Strip data:... prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

### 3.3: Update SCIUpload flow

```typescript
async function handleAnalysis(file: File) {
  if (isTabularFormat(file)) {
    // Existing flow: client-side parse → /api/import/sci/analyze
    const parsed = await parseFile(file);
    const proposal = await analyzeTables(parsed);
    onProposal(proposal);
  } else if (isDocumentFormat(file)) {
    // New flow: base64 → /api/import/sci/analyze-document
    const base64 = await fileToBase64(file);
    const proposal = await analyzeDocument(file.name, base64, file.type);
    onProposal(proposal);
  } else {
    setError(`${file.name} is not a supported format. Try XLSX, CSV, TSV, PDF, PPTX, or DOCX.`);
  }
}
```

### 3.4: Update SCIProposal for plan proposals

When classification = 'plan', the content card should display differently:

```
┌─────────────────────────────────────────────────────────┐
│  📄  Document: "CFG_Consumer_Lending_Commission_2024.pdf"│
│                                                         │
│  I identified this as a compensation plan document.      │
│                                                         │
│  What I found:                                          │
│    6 components with rate tables                        │
│    2 variants (Certified / Non-Certified)               │
│    Tier-based and matrix-based calculations              │
│                                                         │
│  What happens next:                                      │
│    → AI interprets the full plan document               │
│    → You review the extracted components and rates       │
│    → A calculation rule set is created                  │
│                                                         │
│  ┌──────────────┐  ┌─────────────────────────┐         │
│  │  ✓ Confirm   │  │  ✎ Change Classification │         │
│  └──────────────┘  └─────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

The key difference from data content cards: no field bindings (documents don't have columns), instead show a summary of what the AI extracted.

**Commit:** `OB-133 Phase 3: Document format acceptance — PPTX/PDF/DOCX upload, base64 conversion, proposal display`

---

## PHASE 4: ANALYZE-DOCUMENT API

### File: `web/src/app/api/import/sci/analyze-document/route.ts` (NEW)

Server-side endpoint that receives a document file and returns an SCI proposal.

**Request:**
```typescript
{
  tenantId: string;
  fileName: string;
  fileBase64: string;     // base64-encoded file content
  mimeType: string;       // application/pdf, application/vnd...pptx, etc.
}
```

**Implementation:**

1. **Send to Anthropic API for content extraction:**

   For PDF:
   ```typescript
   const message = await anthropic.messages.create({
     model: 'claude-sonnet-4-20250514',
     max_tokens: 4096,
     messages: [{
       role: 'user',
       content: [
         {
           type: 'document',
           source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 }
         },
         {
           type: 'text',
           text: `Analyze this document. Extract:
             1. Is this a compensation/incentive plan, a data file, a roster, or something else?
             2. If it's a plan: how many components/calculation types? What are their names?
             3. Are there rate tables, tier structures, or matrix lookups?
             4. Are there variant/segmentation rules (e.g., certified vs non-certified)?
             5. What language is the document in?
             Return your analysis as JSON with: { documentType, componentCount, components: [{name, calculationType}], hasVariants, variantDescriptions, language, confidence, summary }`
         }
       ]
     }]
   });
   ```

   For PPTX/DOCX: Same approach. The Anthropic API can read these formats directly as documents. If not supported as document content blocks, extract text first using a server-side library, then send the text.

2. **Build SCI proposal from extraction:**

   If documentType = 'plan':
   ```typescript
   const proposal: SCIProposal = {
     proposalId: crypto.randomUUID(),
     tenantId,
     sourceFiles: [fileName],
     contentUnits: [{
       contentUnitId: crypto.randomUUID(),
       sourceFile: fileName,
       tabName: fileName,  // document doesn't have tabs
       classification: 'plan',
       confidence: extraction.confidence,
       reasoning: `Document contains ${extraction.componentCount} plan components with ${extraction.hasVariants ? 'variant routing' : 'single-path'} calculations.`,
       action: 'Interpret this plan document and create a calculation rule set.',
       fieldBindings: [],   // documents don't have field bindings
       allScores: [
         { agent: 'plan', confidence: extraction.confidence, signals: [], reasoning: extraction.summary },
         { agent: 'entity', confidence: 0.05, signals: [], reasoning: 'Document format, not tabular data' },
         { agent: 'target', confidence: 0.05, signals: [], reasoning: 'Document format, not tabular data' },
         { agent: 'transaction', confidence: 0.05, signals: [], reasoning: 'Document format, not tabular data' }
       ],
       warnings: []
     }],
     processingOrder: [/* the one content unit */],
     overallConfidence: extraction.confidence,
     requiresHumanReview: extraction.confidence < 0.80,
     timestamp: new Date().toISOString()
   };
   ```

3. **Add document metadata to the proposal** for use during execution:
   ```typescript
   // Store the base64 and metadata so execute can use them
   proposal.contentUnits[0].documentMetadata = {
     fileBase64,
     mimeType,
     extractionSummary: extraction
   };
   ```

**Commit:** `OB-133 Phase 4: Analyze-document API — Anthropic content extraction, SCI proposal generation`

---

## PHASE 5: EXECUTE ROUTING FOR PLAN DOCUMENTS

### File: `web/src/app/api/import/sci/execute/route.ts` (MODIFY)

When a confirmed content unit has classification = 'plan', route to the existing plan interpretation pipeline instead of the data commit pipeline.

### 5.1: Find the existing plan interpretation entry point

```bash
echo "=== PLAN INTERPRETATION ENTRY POINT ==="
grep -rn "export.*function.*interpret\|export.*async.*interpret\|planInterpret\|AIService.*interpret" \
  web/src/lib/ --include="*.ts" | head -10

echo ""
echo "=== PLAN IMPORT API ROUTE ==="
find web/src/app/api -path "*plan*" -name "route.ts" | sort
# Read the first one found
```

### 5.2: Add plan routing to SCI execute

```typescript
// In the execute route handler, per content unit:
if (unit.confirmedClassification === 'plan') {
  // Route to plan interpretation pipeline
  const result = await interpretPlanDocument({
    tenantId,
    fileName: unit.sourceFile,
    fileBase64: unit.documentMetadata.fileBase64,
    mimeType: unit.documentMetadata.mimeType,
  });
  
  return {
    contentUnitId: unit.contentUnitId,
    classification: 'plan',
    success: result.success,
    rowsProcessed: result.componentCount || 0,
    pipeline: 'plan-interpretation',
    ruleSetId: result.ruleSetId,   // the created rule set
    error: result.error
  };
}

// Existing entity/target/transaction routing continues unchanged
```

### 5.3: Plan interpretation function

Create a wrapper that calls the existing plan interpretation service with the document:

```typescript
async function interpretPlanDocument({
  tenantId, fileName, fileBase64, mimeType
}: {
  tenantId: string; fileName: string; fileBase64: string; mimeType: string;
}): Promise<{ success: boolean; componentCount?: number; ruleSetId?: string; error?: string }> {
  // Call the same service that Configure → Plan Import uses
  // This may involve:
  // 1. Storing the file in Supabase storage
  // 2. Calling the AI interpretation service
  // 3. Creating the rule set from the interpretation
  // 4. Returning the created rule set ID
  
  // FIND the existing service and call it. DO NOT reimplement.
}
```

### 5.4: Update SCIExecution component

When a plan unit completes, the completion state should show:
- "Plan interpreted: [Name] — [N] components, [M] variants"
- Next action: "Review Plan" → link to plan review page (if exists)
- Or: "Upload Data Files" → reset to upload state

**Commit:** `OB-133 Phase 5: Plan execution routing — SCI execute routes plan documents to interpretation pipeline`

---

## PHASE 6: BROWSER VERIFICATION

### 6.1: Tabular formats (existing + TSV)

1. Upload a CSV → SCI proposal as before
2. Upload an XLSX → SCI proposal as before
3. Create a TSV file (rename a CSV, replace commas with tabs) → SCI proposal works
4. Verify: TSV shows correct columns, agent classification correct

### 6.2: Document formats

5. Upload a PDF file → "Analyzing document..." → Plan Agent proposal
6. Upload a PPTX file → "Analyzing document..." → Plan Agent proposal
7. Verify: Proposal shows component count, variant info, confidence
8. Verify: "Confirm" triggers plan interpretation
9. Verify: Completion shows rule set created (or errors documented)

### 6.3: Mixed upload

10. Upload multiple files in sequence: first a PPTX (plan), then CSVs (data)
11. Verify: Each file gets its own proposal
12. Verify: Plan is interpreted first, data is committed second

### 6.4: Error states

13. Upload an unsupported format (e.g., .zip) → clean error message
14. Upload a corrupted PDF → clean error message
15. Upload an empty file → clean error message

**Commit:** `OB-133 Phase 6: Browser verification — all formats tested`

---

## PHASE 7: REGRESSION + KOREAN TEST + BUILD + PR

### 7.1: Regression

Verify no existing SCI functionality broken:

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';
async function main() {
  const { data } = await sb.from('calculation_results')
    .select('total_payout, rule_sets(name)').eq('tenant_id', LAB);
  const byPlan = {};
  for (const r of data || []) {
    const n = r.rule_sets?.name || '?';
    byPlan[n] = byPlan[n] || { count: 0, total: 0 };
    byPlan[n].count++; byPlan[n].total += r.total_payout;
  }
  for (const [n, v] of Object.entries(byPlan)) console.log(n + ':', v.count, 'results,', v.total.toFixed(2));
}
main();
"
```

Expected: CL $6,540,774.36, MO $989,937.41, IR $366,600.00, DG $601,000.00

### 7.2: Korean Test

```bash
grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus\|optical\|store.*sales\|warranty" \
  web/src/components/sci/ web/src/app/api/import/sci/ --include="*.tsx" --include="*.ts" | grep -v node_modules
# Expected: 0 matches
```

### 7.3: Build clean

```bash
cd web && rm -rf .next && npm run build
```

### Proof Gates — Hard

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Build exits 0 | npm run build clean |
| PG-02 | SCIUpload accepts XLSX | Existing — still works |
| PG-03 | SCIUpload accepts CSV | Existing — still works |
| PG-04 | SCIUpload accepts TSV | New — agent classification on TSV data |
| PG-05 | SCIUpload accepts PDF | New — document analysis, Plan Agent proposal |
| PG-06 | SCIUpload accepts PPTX | New — document analysis, Plan Agent proposal |
| PG-07 | SCIUpload accepts DOCX | New — document analysis, Plan Agent proposal |
| PG-08 | Plan proposal shows component summary | Not field bindings — component count, variants |
| PG-09 | Plan execution routes to interpretation pipeline | Rule set created from PPTX/PDF |
| PG-10 | Data formats still route through SCI execute | CSV/XLSX/TSV → committed_data (unchanged) |
| PG-11 | Unsupported format shows clean error | .zip, .jpg → meaningful error message |
| PG-12 | Drop zone text lists all formats | "XLSX, CSV, TSV, PDF, PPTX, DOCX" |
| PG-13 | LAB CL regression | $6,540,774.36 unchanged |
| PG-14 | LAB DG regression | $601,000.00 unchanged |
| PG-15 | Korean Test | 0 domain vocabulary |
| PG-16 | No auth files modified | Middleware unchanged |

### Proof Gates — Soft

| # | Gate | Criterion |
|---|------|-----------|
| SPG-01 | Plan interpretation produces valid rule set | From PPTX/PDF, components extractable |
| SPG-02 | Sequential mixed upload works | Plan first → data second, correct routing |
| SPG-03 | Confidence language appropriate for documents | "I identified this as a plan document" |
| SPG-04 | Error messages helpful | Specific to format issue, not generic |

**Create PR:** `gh pr create --base main --head dev --title "OB-133: Universal File Ingestion — PPTX, PDF, DOCX, TSV through SCI" --body "SCI upload surface now accepts all customer file formats. Tabular files (XLSX, CSV, TSV) flow through existing agent classification. Document files (PPTX, PDF, DOCX) route through Anthropic content extraction → Plan Agent → plan interpretation pipeline. One surface, any file, platform figures it out. Two-path import eliminated."`

**Commit:** `OB-133 Phase 7: Regression + Korean Test + build + completion report + PR`

---

## FILES CREATED/MODIFIED (Expected)

| File | Change |
|------|--------|
| `web/src/components/sci/SCIUpload.tsx` | **MODIFIED** — accept all formats, document vs tabular routing |
| `web/src/components/sci/SCIProposal.tsx` | **MODIFIED** — plan proposal card (no field bindings, component summary) |
| `web/src/components/sci/SCIExecution.tsx` | **MODIFIED** — plan completion state with rule set info |
| `web/src/app/api/import/sci/analyze-document/route.ts` | **NEW** — document content extraction via Anthropic |
| `web/src/app/api/import/sci/execute/route.ts` | **MODIFIED** — plan routing to interpretation pipeline |
| `web/src/lib/sci/sci-types.ts` | **MODIFIED** — documentMetadata on ContentUnitProposal |

---

## WHAT SUCCESS LOOKS LIKE

A customer opens `/operate/import`. They drop their compensation plan PDF. The platform says "I identified this as a compensation plan document. I found 6 components with rate tables and 2 variants." They confirm. The platform interprets the full plan and creates a rule set.

Same customer drops their transaction CSVs. The platform says "I found operational data for 719 entities across 3 periods." They confirm. The data is committed.

Same customer drops a TSV export from their HRIS. The platform handles it identically to CSV.

**One surface. Any file. No "which import page do I use?"**

This is the moment the two-path import dies. Configure → Plan Import becomes a legacy route that redirects to `/operate/import`. Everything goes through SCI.

---

*"The customer doesn't know what format their file is in. They don't care. They shouldn't have to."*
