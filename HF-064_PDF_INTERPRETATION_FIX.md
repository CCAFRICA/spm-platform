# HF-064: PDF PLAN INTERPRETATION FIX + IMPORT UX CORRECTIONS

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute all tasks sequentially.**

---

## READ FIRST — MANDATORY

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply (VERSION 3.0)
2. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY any auth file
3. `DS-005_DATA_INGESTION_FACILITY.md` — file type specs

**Rules 26-32 (Section E) are NEW. Read them.**

---

## WHY THIS HF EXISTS

CLT-104 browser testing of the Caribe / Mexican Bank Co plan import shows:

1. **Both PDF files fail interpretation.** "Interpretation failed" with no useful error. The Anthropic API adapter is not correctly sending PDFs. This is a P0 blocker — the Caribe demo has 2 PDF plans and 2 XLSX plans. 1 of 4 succeeded.
2. **One XLSX file also failed.** Interpretation is unreliable — only 1 of 4 files succeeded.
3. **Queue shows wrong plan name against wrong file.** Deposit Growth file shows "Insurance Referral Program 2024" label.
4. **Empty tenant has no module activation path.** After clearing a tenant, the Operate landing shows "No modules configured" with a [Configure] button that leads nowhere.
5. **Configure > Plans is misleading.** It's actually an import page, not plan management.

**This HF fixes the PDF interpretation pipeline. Everything else is documented for future OBs.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. DO NOT MODIFY ANY AUTH FILE.
5. **Rule 3 (v3.0): Final commit MUST include PR creation as compound command.**
6. **Rule 27: Every task must produce a file change + commit.**
7. **Rule 30: Every new component must be imported and rendered by its page.**

---

## TASK 1: DIAGNOSE PDF INTERPRETATION FAILURE

This is the critical diagnostic. Find exactly where PDFs break.

```bash
echo "============================================"
echo "HF-064 TASK 1: PDF INTERPRETATION DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 1A: INTERPRET-PLAN API ROUTE ==="
cat web/src/app/api/interpret-plan/route.ts

echo ""
echo "=== 1B: ANTHROPIC ADAPTER — PDF HANDLING ==="
cat web/src/lib/ai/providers/anthropic-adapter.ts

echo ""
echo "=== 1C: AI SERVICE — INTERPRET PLAN ==="
cat web/src/lib/ai/ai-service.ts

echo ""
echo "=== 1D: FILE PARSER — PDF DETECTION ==="
cat web/src/lib/import-pipeline/file-parser.ts

echo ""
echo "=== 1E: PLAN IMPORT PAGE — FILE HANDLING ==="
grep -n "pdf\|PDF\|base64\|pdfBase64\|document\|application/pdf\|file.*type\|mime" web/src/app/admin/launch/plan-import/page.tsx | head -30

echo ""
echo "=== 1F: CHECK HOW FILE IS SENT TO API ==="
grep -n "fetch\|interpret-plan\|body\|JSON.stringify\|FormData\|formData" web/src/app/admin/launch/plan-import/page.tsx | head -20

echo ""
echo "=== 1G: ANTHROPIC API KEY CHECK ==="
grep -n "ANTHROPIC\|anthropic\|api.key\|apiKey\|x-api-key\|Authorization" web/src/lib/ai/providers/anthropic-adapter.ts | head -10
grep -n "ANTHROPIC" web/.env.local 2>/dev/null | head -5

echo ""
echo "=== 1H: CHECK FOR TIMEOUT CONFIGURATION ==="
grep -n "timeout\|maxDuration\|max_tokens\|signal\|AbortController" web/src/app/api/interpret-plan/route.ts | head -10
```

**PASTE ALL OUTPUT. Do not summarize. The full output is needed for diagnosis.**

---

## TASK 2: FIX PDF INTERPRETATION

Based on the diagnostic, fix the PDF pipeline. The most common failure modes are:

### 2A: Verify PDF is sent as Anthropic document block

The correct way to send a PDF to the Anthropic Messages API:

```typescript
{
  role: "user",
  content: [
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64PdfData  // raw base64, NO data:application/pdf;base64, prefix
      }
    },
    {
      type: "text",
      text: "Interpret this compensation plan document..."
    }
  ]
}
```

**Common mistakes to check and fix:**
1. **base64 data has the data URI prefix** — `data:application/pdf;base64,` must be STRIPPED before sending. The Anthropic API wants raw base64 only.
2. **Wrong content type** — Using `type: "image"` instead of `type: "document"` for PDFs
3. **Missing beta header** — PDF support requires the `anthropic-beta: pdfs-2024-09-25` header. Check if this header is being sent.
4. **File is being text-extracted instead of sent as document** — If the file parser is trying to extract text from the PDF first (using a PDF library) and failing, the fix is to skip text extraction and send the raw PDF to Anthropic directly.
5. **base64 encoding is wrong** — The file must be read as a Buffer and converted to base64: `buffer.toString('base64')`
6. **Vercel function timeout** — The `interpret-plan` API route may need `export const maxDuration = 60;` (or higher) at the top of the route file. Default Vercel timeout is 10-15 seconds; PDF interpretation takes 20+ seconds.

### 2B: Fix the API Route

In `web/src/app/api/interpret-plan/route.ts`:

```typescript
// Add at top of file for Vercel timeout
export const maxDuration = 60; // 60 seconds for AI interpretation

// In the POST handler:
export async function POST(request: Request) {
  const body = await request.json();
  const { fileContent, fileName, pdfBase64 } = body;

  // Determine if this is a PDF
  const isPdf = fileName?.toLowerCase().endsWith('.pdf') || !!pdfBase64;

  if (isPdf && pdfBase64) {
    // Send PDF directly to Anthropic as document block
    // Strip data URI prefix if present
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    
    const result = await interpretPlanFromPdf(cleanBase64, fileName);
    return Response.json(result);
  } else {
    // Existing text/XLSX interpretation path
    const result = await interpretPlan(fileContent, fileName);
    return Response.json(result);
  }
}
```

### 2C: Fix the Anthropic Adapter

In `web/src/lib/ai/providers/anthropic-adapter.ts`, ensure PDF documents are sent correctly:

```typescript
// When sending a PDF:
const messages = [
  {
    role: "user" as const,
    content: [
      {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: cleanBase64Data
        }
      },
      {
        type: "text" as const,
        text: planInterpretationPrompt
      }
    ]
  }
];

// Include beta header for PDF support
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'pdfs-2024-09-25'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages
  })
});
```

### 2D: Fix the Plan Import Page — PDF File Handling

In `web/src/app/admin/launch/plan-import/page.tsx`, verify the PDF is read as base64:

```typescript
const handleFileProcess = async (file: File) => {
  if (file.name.toLowerCase().endsWith('.pdf')) {
    // Read PDF as base64
    const buffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    // Send to API with pdfBase64 field
    const response = await fetch('/api/interpret-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        pdfBase64: base64  // raw base64, no prefix
      })
    });
  } else {
    // Existing XLSX/CSV path — parse file content as text/structured data
    // ...existing code...
  }
};
```

### 2E: Test with a simple PDF

After fixing, create a minimal test:
1. Upload a single PDF plan file (CFG_Consumer_Lending_Commission_2024.pdf)
2. Check the network tab — the `interpret-plan` request should:
   - Send a JSON body with `pdfBase64` field
   - Take 15-30 seconds (normal for AI interpretation)
   - Return 200 with plan structure

If it still fails, check the Vercel function logs or add error logging:
```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', { ... });
if (!response.ok) {
  const errorBody = await response.text();
  console.error('Anthropic API error:', response.status, errorBody);
  throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
}
```

The error body from Anthropic will tell us exactly what's wrong (invalid base64, unsupported content type, etc.).

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-064 Task 2: Fix PDF plan interpretation — document block + beta header + timeout" && git push origin dev`

---

## TASK 3: FIX XLSX INTERPRETATION RELIABILITY

One of the 4 XLSX files also failed. Diagnose:

```bash
echo "=== XLSX INTERPRETATION PATH ==="
grep -n "xlsx\|XLSX\|spreadsheet\|workbook\|sheet" web/src/app/api/interpret-plan/route.ts | head -15
grep -n "xlsx\|XLSX\|parseFile\|extractContent\|fileContent" web/src/lib/import-pipeline/file-parser.ts | head -15
```

Common issues:
1. **Multi-tab XLSX handling** — Some plan files have multiple tabs. The parser must extract ALL tabs, not just the first.
2. **Large content truncation** — If the extracted text is too long for the AI context window, it gets truncated and the interpretation fails.
3. **Error swallowed** — The API route may catch errors silently and return a generic "Interpretation failed" without the actual error.

**Fix:** Add detailed error messages to the interpretation response:

```typescript
// In the catch block of interpret-plan route:
catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Plan interpretation failed:', errorMessage);
  return Response.json(
    { error: `Interpretation failed: ${errorMessage}`, fileName },
    { status: 500 }
  );
}
```

Update the Plan Import page to display the actual error reason:

```typescript
// When interpretation fails, show the real error
const errorMsg = result.error || 'Unknown error';
updateQueueStatus(file, 'failed', errorMsg);
// Display: "CFG_Insurance_Referral_Program_2024.xlsx — Interpretation failed: [actual reason]"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-064 Task 3: XLSX interpretation error handling + multi-tab support" && git push origin dev`

---

## TASK 4: FIX QUEUE — PLAN NAME MAPPED TO WRONG FILE

CLT-104 showed: Queue line for "CFG_Deposit_Growth_Incentive_Q1_2024.xlsx" displayed "Insurance Referral Program 2024" as its interpreted name.

```bash
echo "=== QUEUE STATE MANAGEMENT ==="
grep -n "queue\|Queue\|fileQueue\|QueueFileEntry\|completedPlan\|planName\|interpretedName" web/src/app/admin/launch/plan-import/page.tsx | head -30
```

The queue status update is likely matching results to files by array index rather than by file name or a unique ID. When a file is skipped, the indices shift and subsequent results map to the wrong file.

**Fix:** Use a unique identifier (file name or generated ID) to map interpretation results to the correct queue entry, not array position:

```typescript
// Each queue entry has a unique id
interface QueueFileEntry {
  id: string;        // crypto.randomUUID()
  file: File;
  fileName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'skipped';
  planName?: string;  // from interpretation
  confidence?: number;
  error?: string;
}

// When updating status, match by id, not index:
const updateQueueEntry = (id: string, updates: Partial<QueueFileEntry>) => {
  setFileQueue(prev => prev.map(entry =>
    entry.id === id ? { ...entry, ...updates } : entry
  ));
};
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-064 Task 4: Fix queue plan name mapping — use ID not index" && git push origin dev`

---

## TASK 5: TENANT RESET SCRIPT — ADD .env.local AUTO-LOAD

Per Standing Rule 32: scripts must auto-load from `.env.local`.

```bash
echo "=== CHECK CLEAR-TENANT SCRIPT ==="
head -20 web/src/scripts/clear-tenant.ts
grep -n "dotenv\|env\|\.env" web/src/scripts/clear-tenant.ts | head -5
```

If the script doesn't load `.env.local` automatically, fix it:

```typescript
// Add at the very top of clear-tenant.ts and create-demo-users.ts
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local from the web directory
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
```

If `dotenv` is not installed:
```bash
cd /Users/AndrewAfrica/spm-platform/web
npm install dotenv
```

Also update `create-demo-users.ts` with the same fix.

Add a check for `SUPABASE_SERVICE_ROLE_KEY` with a helpful message:

```typescript
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  console.error('Get it from: Supabase Dashboard → Settings → API → service_role key');
  console.error('Add to web/.env.local: SUPABASE_SERVICE_ROLE_KEY=eyJ...');
  process.exit(1);
}
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-064 Task 5: Scripts auto-load .env.local — Rule 32" && git push origin dev`

---

## BUILD + PR (COMPOUND COMMAND — Rule 3)

```bash
cd /Users/AndrewAfrica/spm-platform/web && rm -rf .next && npm run build 2>&1 | tail -20
cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-064 Complete: PDF interpretation fix + import UX corrections" && git push origin dev && gh pr create --base main --head dev --title "HF-064: PDF Plan Interpretation Fix + Import Queue Corrections" --body "## Fixes
- PDF sent as Anthropic document block with pdfs-2024-09-25 beta header
- Vercel function timeout extended for AI interpretation
- base64 data URI prefix stripped before sending to API
- XLSX error handling shows actual failure reason
- Queue plan name mapping uses ID not array index
- Scripts auto-load .env.local (Standing Rule 32)

## CLT-104 Findings Addressed
- F22: PDF plan interpretation fails (P0)
- F23: XLSX interpretation unreliable (P1)
- F24: Queue shows wrong plan name against wrong file (P1)
- F15: Script env var loading (P2)"
```

**THIS IS ONE COMPOUND COMMAND. The PR creation is part of the final commit flow.**

---

## PROOF GATES

```
PG-01: interpret-plan/route.ts has maxDuration = 60 (or higher)
PG-02: Anthropic adapter sends PDF as type: "document" with media_type: "application/pdf"
PG-03: Anthropic adapter includes "anthropic-beta: pdfs-2024-09-25" header
PG-04: base64 data has no data URI prefix when sent to Anthropic
PG-05: Plan Import page reads PDF as base64 via arrayBuffer + btoa
PG-06: Failed interpretation shows actual error message (not generic "Interpretation failed")
PG-07: Queue entries use unique ID for status updates (not array index)
PG-08: clear-tenant.ts loads .env.local automatically
PG-09: create-demo-users.ts loads .env.local automatically
PG-10: npm run build exits 0
PG-11: PR created as part of final commit
```

**PG-02, PG-03, PG-04 are the critical gates for PDF fix. If any fails, PDFs will still break.**

---

## SCOPE — 5 TASKS ONLY (Rule 26)

| # | Task | What |
|---|------|------|
| 1 | Diagnose PDF failure | Full diagnostic output |
| 2 | Fix PDF interpretation | Document block + beta header + timeout + base64 cleanup |
| 3 | Fix XLSX reliability | Error handling + actual error in response |
| 4 | Fix queue name mapping | Use ID not array index |
| 5 | Script env loading | dotenv + .env.local auto-load |

**DO NOT touch: auth, Operate/Perform landings, Financial module, calculation engine, N+1.**

---

*ViaLuce.ai — The Way of Light*
*"4 plans in 30 seconds. That's the demo promise. Right now it's 1 of 4. Fix the pipeline."*
