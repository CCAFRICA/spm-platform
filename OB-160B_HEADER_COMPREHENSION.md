# OB-160B PHASE B: HEADER COMPREHENSION
## "The header is content to be understood"
## SCI Development Plan Phase B of 12 (A through L)
## Target: Current release
## Depends on: OB-160A (PR #182 — merged)
## Priority: P0 — Enhances Content Profile foundation with contextual intelligence

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — Layer 1: Content Profile, Layer 3: Confidence Scoring (Tier 3 LLM)
4. `web/src/lib/sci/content-profile.ts` — the Phase A foundation this builds on
5. `web/src/lib/sci/sci-types.ts` — ContentProfile, ProfileObservation, FieldProfile interfaces

---

## CONTEXT

### What Phase A Delivered

Phase A rebuilt the Content Profile foundation:
- Probabilistic type scoring (boolean requires both 0 and 1)
- Type-agnostic temporal column detection (`hasTemporalColumns`)
- Identifier-relative cardinality for name/categorical detection
- `ProfileObservation` signal interface on every structural determination

The Content Profile now tells the truth about structural observations. But it observes VALUES only — it ignores the single most informative piece of context about each column: **the header.**

### What Phase B Delivers

A column header is content provided by the customer. "Mes", "Month", "월" — all mean the same thing, but the Content Profile doesn't know that. Phase B adds a single LLM call per file upload that interprets ALL column headers across all sheets simultaneously. The LLM understands "Mes" as month in Spanish, "월" as month in Korean — in any language, from context, in real-time.

**This is NOT a Korean Test violation.** The Korean Test prohibits hardcoded dictionaries of words matched against column names. Phase B sends headers to the LLM as content to be understood — the same way the LLM reads a PPTX plan document. Understanding is generated contextually, not retrieved from a stored lookup table.

### Integration Points from Phase A

Phase B must integrate with these exact interfaces (delivered in OB-160A):

```typescript
// ContentProfile (sci-types.ts) — Phase B adds headerComprehension
interface ContentProfile {
  // ... existing structure, fields, patterns, observations ...
  // Phase B adds:
  headerComprehension?: HeaderComprehension;
}

// ProfileObservation (sci-types.ts) — Phase B emits observations using this interface
interface ProfileObservation {
  columnName: string | null;
  observationType: string;
  observedValue: unknown;
  confidence: number;
  alternativeInterpretations: Record<string, number>;
  structuralEvidence: string;
}

// generateContentProfile signature — Phase B enhances AFTER profile generation
generateContentProfile(
  tabName: string, tabIndex: number, sourceFile: string,
  columns: string[], rows: Record<string, unknown>[],
  totalRowCount?: number
): ContentProfile
```

### SCI Development Plan Position

```
  Phase A: Content Profile Foundation ✅ (PR #182)
→ PHASE B: Header Comprehension ← YOU ARE HERE
  Phase C: Agent Scoring + Signatures + Negotiation
  Phase D: Tenant Context
  Phase E: Classification Signals + Flywheel
  Phase F: Execute Pipeline + Routing
  Phase G: Convergence + input_bindings
  Phase H: Field-Level PARTIAL Claims
  Phase I: Cross-Tenant Flywheel
  Phase J: Domain Flywheel
  Phase K: Synaptic Density for SCI
  Phase L: Pattern Promotion
```

### Controlling Decisions

| # | Decision | Relevance |
|---|---|---|
| 25 | Korean Test — no hardcoded language dictionaries | Headers sent to LLM as content, not matched against stored keywords |
| 92/93 | Period is not an import concept | LLM may interpret "Mes" as "month" — this informs temporal detection but does NOT create periods |
| 106 | LLM escalation on close calls | Phase B provides a broader capability: LLM interprets headers for ALL sheets once per upload, not just on close calls |

---

## ARCHITECTURE DECISION GATE

```
DECISION: How should header comprehension work?

Option A: LLM call per column
  - Cost: 19 columns × 3 sheets = 57 LLM calls per file
  - Latency: sequential API calls
  REJECTED: Excessive cost and latency

Option B: LLM call per sheet
  - Cost: 3 LLM calls per file
  - Latency: 3 sequential calls
  REJECTED: Still multiple calls; headers across sheets inform each other

Option C: ONE LLM call per file upload — all sheets, all headers, all sample values
  - Cost: 1 LLM call per file (~$0.01-0.05)
  - Latency: one round-trip (~1-3 seconds)
  - Context: LLM sees ALL sheets simultaneously — "Plantilla has employee IDs, 
    Datos_Rendimiento has the same IDs + metrics" — cross-sheet intelligence
  CHOSEN: Maximum context per LLM call, minimum cost, minimum latency

Option D: No LLM — structural heuristics only
  - Phase A already provides structural detection
  - But can't understand "Mes" = month without language comprehension
  REJECTED: Structural heuristics alone failed for 5 OBs

CHOSEN: Option C — one LLM call per file, all headers and sample values
FALLBACK: If LLM unavailable, Phase A's structural heuristics stand alone
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160B Phase 0: Architecture decision — one LLM call per file for header comprehension" && git push origin dev`

---

## PHASE 1: HEADER COMPREHENSION TYPES + SERVICE

### 1A: Define Types

Add to `sci-types.ts`:

```typescript
// Header comprehension — LLM interpretation of column headers
export interface HeaderInterpretation {
  columnName: string;              // original header as customer wrote it
  semanticMeaning: string;         // what it means: 'month_indicator', 'employee_identifier', 'revenue_attainment_percentage'
  dataExpectation: string;         // what values should look like: 'integer_1_to_12', 'unique_numeric_id', 'decimal_percentage'
  columnRole: ColumnRole;          // structural role in the dataset
  confidence: number;              // LLM's confidence in this interpretation
}

export type ColumnRole = 
  | 'identifier'         // uniquely identifies an entity (employee ID, account number)
  | 'name'               // human-readable name for an entity
  | 'temporal'           // represents time (date, month, year, quarter)
  | 'measure'            // numeric measurement or metric (revenue, count, percentage)
  | 'attribute'          // categorical property (department, region, role, type)
  | 'reference_key'      // lookup key for reference data (hub ID, location code)
  | 'unknown'            // LLM couldn't determine
  ;

export interface HeaderComprehension {
  interpretations: Map<string, HeaderInterpretation>;  // columnName → interpretation
  crossSheetInsights: string[];    // observations about relationships between sheets
  llmCallDuration: number;         // milliseconds — for measurement
  llmModel: string;                // which model was used
  fromVocabularyBinding: boolean;  // true if recalled from stored bindings (Phase E), false if fresh LLM call
}
```

Add `headerComprehension` to `ContentProfile`:

```typescript
export interface ContentProfile {
  // ... existing fields from Phase A ...
  headerComprehension?: HeaderComprehension;  // populated by Phase B LLM call
}
```

### 1B: Create Header Comprehension Service

**New file:** `web/src/lib/sci/header-comprehension.ts`

```typescript
/**
 * Header Comprehension Service
 * 
 * ONE LLM call per file upload interprets ALL column headers
 * across ALL sheets simultaneously. The LLM understands headers
 * in any language — "Mes", "Month", "월" — from context.
 * 
 * This is NOT a Korean Test violation. The understanding is
 * generated in real-time from content, not matched against
 * a stored dictionary.
 * 
 * Fallback: if LLM is unavailable, returns null.
 * Phase A's structural heuristics stand alone.
 */

export interface HeaderComprehensionInput {
  sheets: Array<{
    sheetName: string;
    columns: string[];
    sampleRows: Record<string, unknown>[];  // 3-5 rows per sheet
    rowCount: number;
  }>;
}

export async function comprehendHeaders(
  input: HeaderComprehensionInput
): Promise<Map<string, HeaderComprehension> | null> {
  // Returns Map<sheetName, HeaderComprehension>
  // Returns null if LLM unavailable (graceful fallback)
}
```

### 1C: LLM Prompt Design

The prompt must:
1. Present ALL sheets and ALL headers in one call
2. Request structured JSON response
3. Not assume any language — work for English, Spanish, Korean, German, Arabic
4. Ask for cross-sheet insights ("these two sheets share the same employee IDs")
5. Classify each column into a `ColumnRole`

```typescript
function buildHeaderComprehensionPrompt(input: HeaderComprehensionInput): string {
  const sheetsDescription = input.sheets.map(sheet => {
    const sampleStr = sheet.sampleRows.slice(0, 3).map((row, i) => {
      const vals = sheet.columns.map(col => `${col}: ${JSON.stringify(row[col] ?? null)}`);
      return `  Row ${i + 1}: { ${vals.join(', ')} }`;
    }).join('\n');
    
    return `Sheet "${sheet.sheetName}" (${sheet.rowCount} rows, ${sheet.columns.length} columns):
  Columns: ${sheet.columns.join(', ')}
  Sample data:
${sampleStr}`;
  }).join('\n\n');

  return `You are analyzing a data file with multiple sheets. For each column in each sheet, determine what the column represents based on its header name and sample values.

${sheetsDescription}

For each column, provide:
- semanticMeaning: what this column represents (e.g., "month_indicator", "employee_identifier", "revenue_attainment_percentage", "hub_name", "safety_incident_count")
- dataExpectation: what values should look like (e.g., "integer_1_to_12", "unique_numeric_id", "decimal_0_to_1")
- columnRole: one of: identifier, name, temporal, measure, attribute, reference_key, unknown
- confidence: 0.0 to 1.0

Also provide crossSheetInsights: observations about relationships between sheets (e.g., "Sheet A and Sheet B share the same employee identifier column", "Sheet C appears to be hub-level reference data while Sheet B has employee-level performance data").

Respond ONLY with valid JSON, no preamble, no markdown:
{
  "sheets": {
    "<sheetName>": {
      "columns": {
        "<columnName>": {
          "semanticMeaning": "...",
          "dataExpectation": "...",
          "columnRole": "...",
          "confidence": 0.XX
        }
      }
    }
  },
  "crossSheetInsights": ["...", "..."]
}`;
}
```

### 1D: LLM Call Implementation

```typescript
async function callLLMForHeaders(prompt: string): Promise<{
  sheets: Record<string, { columns: Record<string, Omit<HeaderInterpretation, 'columnName'>> }>;
  crossSheetInsights: string[];
} | null> {
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('[SCI] No Anthropic API key — header comprehension skipped (heuristics only)');
    return null;
  }
  
  try {
    const startTime = Date.now();
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    
    if (!response.ok) {
      console.log(`[SCI] LLM header comprehension failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) return null;
    
    // Parse JSON response — strip any markdown fences
    const clean = text.replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(clean);
    
    const duration = Date.now() - startTime;
    console.log(`[SCI] Header comprehension completed in ${duration}ms`);
    
    return parsed;
  } catch (error) {
    console.log('[SCI] Header comprehension error (falling back to heuristics):', error);
    return null;
  }
}
```

### 1E: Integration With Content Profile

After `generateContentProfile` produces the structural profile, header comprehension ENHANCES it:

```typescript
export async function enhanceWithHeaderComprehension(
  profiles: Map<string, ContentProfile>,
  sheets: HeaderComprehensionInput['sheets']
): Promise<void> {
  const prompt = buildHeaderComprehensionPrompt({ sheets });
  const llmResult = await callLLMForHeaders(prompt);
  
  if (!llmResult) return;  // Fallback — profiles stand with Phase A structural observations only
  
  for (const [sheetName, sheetResult] of Object.entries(llmResult.sheets)) {
    const profile = profiles.get(sheetName);
    if (!profile) continue;
    
    const interpretations = new Map<string, HeaderInterpretation>();
    
    for (const [colName, interp] of Object.entries(sheetResult.columns)) {
      interpretations.set(colName, {
        columnName: colName,
        semanticMeaning: interp.semanticMeaning,
        dataExpectation: interp.dataExpectation,
        columnRole: interp.columnRole as ColumnRole,
        confidence: interp.confidence,
      });
    }
    
    profile.headerComprehension = {
      interpretations,
      crossSheetInsights: llmResult.crossSheetInsights || [],
      llmCallDuration: 0,  // set in callLLMForHeaders
      llmModel: 'claude-sonnet-4-20250514',
      fromVocabularyBinding: false,
    };
    
    // Emit ProfileObservations for each header interpretation
    for (const [colName, interp] of interpretations) {
      profile.observations.push({
        columnName: colName,
        observationType: 'header_comprehension',
        observedValue: interp.semanticMeaning,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `LLM interpreted "${colName}" as ${interp.semanticMeaning} (${interp.columnRole}), expects ${interp.dataExpectation}`,
      });
    }
    
    // ENHANCEMENT: Use header comprehension to refine structural observations
    enhanceProfileWithComprehension(profile);
  }
}

function enhanceProfileWithComprehension(profile: ContentProfile): void {
  if (!profile.headerComprehension) return;
  
  for (const [colName, interp] of profile.headerComprehension.interpretations) {
    const field = profile.fields.find(f => f.fieldName === colName);
    if (!field) continue;
    
    // Enhancement 1: Temporal column reinforcement
    // If LLM says this column is temporal AND structural detection agrees → strengthen
    // If LLM says temporal but structural missed it → add temporal flag
    if (interp.columnRole === 'temporal' && !profile.patterns.hasTemporalColumns) {
      profile.patterns.hasTemporalColumns = true;
      profile.observations.push({
        columnName: colName,
        observationType: 'temporal_enhancement',
        observedValue: true,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `LLM identified "${colName}" as temporal (${interp.semanticMeaning}) — structural detection missed this`,
      });
    }
    
    // Enhancement 2: Name column reinforcement
    if (interp.columnRole === 'name' && !profile.patterns.hasStructuralNameColumn) {
      profile.patterns.hasStructuralNameColumn = true;
      profile.observations.push({
        columnName: colName,
        observationType: 'name_enhancement',
        observedValue: true,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `LLM identified "${colName}" as person name — structural detection missed this`,
      });
    }
    
    // Enhancement 3: Identifier reinforcement
    if (interp.columnRole === 'identifier' && !profile.patterns.hasEntityIdentifier) {
      profile.patterns.hasEntityIdentifier = true;
    }
  }
}
```

### 1F: Wire Into Analyze Route

In `web/src/app/api/import/sci/analyze/route.ts`, after generating Content Profiles for all sheets, call the header comprehension:

```typescript
// After generating profiles for all sheets:
const profileMap = new Map<string, ContentProfile>();
for (const sheet of file.sheets) {
  const profile = generateContentProfile(/* ... */);
  profileMap.set(sheet.sheetName, profile);
}

// Phase B: Enhance with header comprehension (one LLM call for all sheets)
await enhanceWithHeaderComprehension(profileMap, file.sheets.map(s => ({
  sheetName: s.sheetName,
  columns: s.columns,
  sampleRows: s.rows.slice(0, 5),  // 5 rows per sheet for LLM context
  rowCount: s.totalRowCount,
})));

// Continue with agent scoring using enhanced profiles...
```

### Proof Gates — Phase 1
- PG-1: `HeaderInterpretation` and `HeaderComprehension` interfaces defined in sci-types.ts
- PG-2: `ColumnRole` type defined with 7 roles (identifier, name, temporal, measure, attribute, reference_key, unknown)
- PG-3: `headerComprehension` field added to ContentProfile interface
- PG-4: `header-comprehension.ts` created with `comprehendHeaders` and `enhanceWithHeaderComprehension`
- PG-5: LLM prompt includes ALL sheets, ALL headers, sample values (3-5 rows per sheet)
- PG-6: LLM prompt requests structured JSON with semanticMeaning, dataExpectation, columnRole, confidence
- PG-7: LLM prompt requests crossSheetInsights
- PG-8: Graceful fallback — if no API key or LLM fails, returns null, profiles use Phase A structural observations only
- PG-9: Header interpretations emitted as ProfileObservation (observationType: 'header_comprehension')
- PG-10: Enhancement function refines hasTemporalColumns and hasStructuralNameColumn from LLM insights
- PG-11: `enhanceWithHeaderComprehension` called in analyze route AFTER profile generation, BEFORE agent scoring
- PG-12: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160B Phase 1: Header comprehension service — LLM interpretation + profile enhancement + signal emission" && git push origin dev`

---

## PHASE 2: VOCABULARY BINDING INTERFACE

### What This Phase Delivers

The interface for storing and recalling header interpretations across uploads. Phase E wires the database storage; Phase B defines the data structure and the lookup/recall API.

### 2A: Vocabulary Binding Types

Add to `sci-types.ts`:

```typescript
export interface VocabularyBinding {
  columnName: string;              // the header as the customer wrote it
  interpretation: HeaderInterpretation;
  structuralContext: {             // structural context at time of binding
    sheetColumnCount: number;      // how many columns the sheet had
    sheetRowCountBucket: 'small' | 'medium' | 'large';
    columnPosition: number;        // column index
    dataType: string;              // Phase A type classification
  };
  confirmationSource: 'llm_initial' | 'user_confirmed' | 'user_corrected' | 'classification_success';
  confirmationCount: number;       // how many times this binding has been confirmed
  lastConfirmed: string;           // ISO timestamp
}

export interface VocabularyBindingStore {
  tenantId: string;
  bindings: Map<string, VocabularyBinding>;  // key: columnName + structuralContext hash
}
```

### 2B: Vocabulary Binding Lookup Interface

Define the interface for checking stored bindings before calling the LLM. Phase E implements the database storage; Phase B defines the function signature:

```typescript
/**
 * Check if stored vocabulary bindings exist for these headers.
 * Returns bindings that match both the column name AND the structural context.
 * 
 * Phase B: interface defined, returns empty map (no storage yet)
 * Phase E: wired to classification_signals table
 * Phase K: consulted before LLM call — skip LLM when all headers have confirmed bindings
 */
export async function lookupVocabularyBindings(
  tenantId: string,
  columns: string[],
  structuralContext: { columnCount: number; rowCountBucket: string }
): Promise<Map<string, VocabularyBinding>> {
  // Phase B: return empty map (no storage backend yet)
  // Phase E: query classification_signals for matching bindings
  return new Map();
}

/**
 * Prepare vocabulary bindings for storage after classification is confirmed.
 * Called when the user confirms or the import succeeds.
 * 
 * Phase B: creates binding objects, returns them for future storage
 * Phase E: writes to classification_signals table
 */
export function prepareVocabularyBindings(
  tenantId: string,
  headerComprehension: HeaderComprehension,
  profiles: ContentProfile[],
  confirmationSource: VocabularyBinding['confirmationSource']
): VocabularyBinding[] {
  const bindings: VocabularyBinding[] = [];
  
  for (const profile of profiles) {
    if (!profile.headerComprehension) continue;
    
    for (const [colName, interp] of profile.headerComprehension.interpretations) {
      const field = profile.fields.find(f => f.fieldName === colName);
      bindings.push({
        columnName: colName,
        interpretation: interp,
        structuralContext: {
          sheetColumnCount: profile.structure.columnCount,
          sheetRowCountBucket: profile.structure.rowCount < 50 ? 'small' : 
                               profile.structure.rowCount < 500 ? 'medium' : 'large',
          columnPosition: field?.fieldIndex ?? 0,
          dataType: field?.dataType ?? 'unknown',
        },
        confirmationSource,
        confirmationCount: 1,
        lastConfirmed: new Date().toISOString(),
      });
    }
  }
  
  return bindings;
}
```

### 2C: Integrate Vocabulary Lookup Into Comprehension Flow

Before calling the LLM, check for existing vocabulary bindings:

```typescript
export async function comprehendHeaders(
  input: HeaderComprehensionInput,
  tenantId: string
): Promise<Map<string, HeaderComprehension> | null> {
  
  // Step 1: Check vocabulary bindings (Phase E will populate these)
  const allColumns = input.sheets.flatMap(s => s.columns);
  const existingBindings = await lookupVocabularyBindings(tenantId, allColumns, {
    columnCount: input.sheets[0]?.columns.length ?? 0,
    rowCountBucket: 'medium',
  });
  
  // Step 2: If ALL columns have confirmed bindings with high confidence, skip LLM
  const allBound = allColumns.every(col => {
    const binding = existingBindings.get(col);
    return binding && binding.confirmationCount >= 2 && binding.interpretation.confidence >= 0.85;
  });
  
  if (allBound) {
    // Build HeaderComprehension from stored bindings — no LLM call
    return buildComprehensionFromBindings(input, existingBindings);
  }
  
  // Step 3: Call LLM for unbound or low-confidence headers
  return callLLMAndBuildComprehension(input);
}
```

### Proof Gates — Phase 2
- PG-13: `VocabularyBinding` and `VocabularyBindingStore` interfaces defined
- PG-14: `lookupVocabularyBindings` function exists (returns empty map in Phase B — Phase E wires storage)
- PG-15: `prepareVocabularyBindings` function creates binding objects from header comprehension
- PG-16: Comprehension flow checks vocabulary bindings BEFORE calling LLM
- PG-17: When all bindings exist with high confidence, LLM call is skipped
- PG-18: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160B Phase 2: Vocabulary binding interface — lookup, prepare, LLM skip on full coverage" && git push origin dev`

---

## PHASE 3: MEASUREMENT INTERFACE

### What This Phase Delivers

From Phase B forward, every LLM interaction is measured. The measurement data feeds the flywheel health dashboard (Phase E) and the density-adaptive execution (Phase K).

### 3A: Measurement Types

Add to `sci-types.ts`:

```typescript
export interface HeaderComprehensionMetrics {
  llmCalled: boolean;               // was LLM called, or were vocabulary bindings used?
  llmCallDuration: number | null;   // milliseconds (null if not called)
  llmModel: string | null;
  columnsInterpreted: number;       // total columns across all sheets
  columnsFromBindings: number;      // how many came from stored vocabulary bindings
  columnsFromLLM: number;           // how many required fresh LLM interpretation
  averageConfidence: number;        // mean confidence across all interpretations
  crossSheetInsightCount: number;   // how many cross-sheet insights were generated
  timestamp: string;                // ISO timestamp
}
```

### 3B: Emit Metrics After Comprehension

After `comprehendHeaders` completes (whether via LLM or vocabulary bindings), compute and return metrics:

```typescript
// In comprehendHeaders return value, include metrics:
export async function comprehendHeaders(
  input: HeaderComprehensionInput,
  tenantId: string
): Promise<{ 
  comprehensions: Map<string, HeaderComprehension> | null;
  metrics: HeaderComprehensionMetrics;
}> {
  // ... comprehension logic ...
  
  const metrics: HeaderComprehensionMetrics = {
    llmCalled: !allBound,
    llmCallDuration: allBound ? null : duration,
    llmModel: allBound ? null : 'claude-sonnet-4-20250514',
    columnsInterpreted: allColumns.length,
    columnsFromBindings: allBound ? allColumns.length : 0,
    columnsFromLLM: allBound ? 0 : allColumns.length,
    averageConfidence: computeAverageConfidence(comprehensions),
    crossSheetInsightCount: crossSheetInsights.length,
    timestamp: new Date().toISOString(),
  };
  
  return { comprehensions, metrics };
}
```

### 3C: Metrics Available on Classification Trace

The metrics feed into the ClassificationTrace (defined in Phase C, structured here):

```typescript
// For Phase C's ClassificationTrace structure:
export interface HeaderComprehensionTraceEntry {
  metrics: HeaderComprehensionMetrics;
  interpretations: Record<string, HeaderInterpretation>;  // per column
  enhancements: string[];  // which profile fields were enhanced by comprehension
}
```

### Proof Gates — Phase 3
- PG-19: `HeaderComprehensionMetrics` interface defined
- PG-20: Metrics computed after every comprehension call (LLM or binding)
- PG-21: `llmCalled` is false when vocabulary bindings cover all columns
- PG-22: `columnsFromBindings` and `columnsFromLLM` sum to `columnsInterpreted`
- PG-23: `HeaderComprehensionTraceEntry` defined for Phase C integration
- PG-24: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160B Phase 3: Measurement interface — LLM call tracking, binding coverage, confidence metrics" && git push origin dev`

---

## PHASE 4: BUILD + VERIFY + PR

### 4A: Build Verification

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 4B: Code Review Verification

```bash
# Verify header-comprehension.ts exists
ls -la web/src/lib/sci/header-comprehension.ts

# Verify no Korean Test violations — no hardcoded language dictionaries
grep -rn '"mes"\|"month"\|"nombre"\|"name"\|"año"\|"year"' \
  web/src/lib/sci/header-comprehension.ts | grep -v "// " | grep -v "console.log"
# Should return ZERO — headers are sent to LLM, not matched against strings

# Verify LLM fallback — graceful handling when API key missing
grep -rn "ANTHROPIC_API_KEY\|apiKey\|return null" \
  web/src/lib/sci/header-comprehension.ts | head -10

# Verify integration with analyze route
grep -rn "enhanceWithHeaderComprehension\|comprehendHeaders\|headerComprehension" \
  web/src/app/api/import/sci/analyze/ --include="*.ts" | head -10

# Verify vocabulary binding interface
grep -rn "lookupVocabularyBindings\|prepareVocabularyBindings\|VocabularyBinding" \
  web/src/lib/sci/ --include="*.ts" | head -10
```

### 4C: PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-160B: Header Comprehension — LLM contextual understanding for column headers" \
  --body "Phase B of 12-phase SCI Development Plan. Adds LLM-powered header comprehension to the Content Profile.

## What Changed

### 1. Header Comprehension Service (header-comprehension.ts — NEW)
One LLM call per file upload interprets ALL column headers across all sheets simultaneously.
LLM understands 'Mes' as month in Spanish, '월' as month in Korean — any language, from context.
Korean Test compliant: headers are content understood in real-time, not keywords matched against dictionaries.
Graceful fallback: if no API key or LLM fails, Phase A structural heuristics stand alone.

### 2. Profile Enhancement
Header comprehension refines Content Profile observations:
- Temporal columns reinforced when LLM confirms time-related meaning
- Name columns reinforced when LLM confirms person-name meaning
- Entity identifiers reinforced when LLM confirms ID-like meaning
All enhancements emitted as ProfileObservation signals.

### 3. Vocabulary Binding Interface
Interface defined for storing and recalling header interpretations across uploads.
Phase E wires database storage. Phase K enables LLM-skip when all headers have confirmed bindings.
Design: LLM calls per import should trend toward zero for established tenants.

### 4. Measurement Interface
Every LLM interaction measured: call duration, columns interpreted, binding coverage, confidence.
Foundation for flywheel health dashboard (Phase E) and density-adaptive execution (Phase K).

## Implementation Completeness
Phase B completes SCI Spec Layer 1 (Content Profile) with header comprehension enhancement.
Gap to full scoring: Phase C (agent scoring uses header comprehension as signal input)."
```

### Proof Gates — Phase 4
- PG-25: `npm run build` exits 0
- PG-26: localhost:3000 responds
- PG-27: No Korean Test violations in header-comprehension.ts (grep returns zero)
- PG-28: LLM fallback returns null when no API key
- PG-29: enhanceWithHeaderComprehension called in analyze route
- PG-30: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160B Complete: Header Comprehension" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- HeaderInterpretation, HeaderComprehension, ColumnRole types
- Header comprehension service (one LLM call per file)
- LLM prompt design for multi-sheet, multi-language header interpretation
- Profile enhancement from header comprehension
- VocabularyBinding interface (lookup + prepare — Phase E wires storage)
- Measurement interface (HeaderComprehensionMetrics)
- ProfileObservation emission for header interpretations
- Integration with analyze route

### OUT OF SCOPE — DO NOT TOUCH
- Agent scoring logic (Phase C)
- Composite signatures (Phase C)
- Round 2 negotiation (Phase C)
- Tenant context queries (Phase D)
- Classification signal storage (Phase E)
- Vocabulary binding database storage (Phase E)
- Execute pipeline (Phase F)
- Auth files
- Calculation engine
- Content Profile type detection (Phase A — completed)

### CRITICAL CONSTRAINTS

1. **Korean Test:** ZERO hardcoded language-specific strings in header-comprehension.ts. Headers go to the LLM. The LLM understands. No dictionaries.
2. **ONE LLM call per file.** Not per sheet. Not per column. One call, all context.
3. **Graceful fallback.** If LLM unavailable, return null. Phase A structural observations are sufficient for classification (with lower confidence). The system WORKS without the LLM — it just works BETTER with it.
4. **Decision 92/93 enforcement.** If LLM interprets a column as temporal (e.g., "Mes = month indicator"), this enhances `hasTemporalColumns`. It does NOT create periods, reference period definitions, or call period APIs.
5. **Vocabulary bindings are an INTERFACE in Phase B.** `lookupVocabularyBindings` returns empty map. Phase E implements storage. Phase K implements LLM-skip logic. But the interface is designed NOW so Phases E and K don't need to modify Phase B's files.
6. **Metrics are emitted, not stored.** Phase B computes metrics. Phase E stores them. But the computation happens here.

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-25 | Korean Test violation — language dictionaries | Headers sent to LLM, not matched against stored words |
| NEW | LLM call per column | ONE call per file — all sheets, all headers |
| NEW | Hard dependency on LLM | Graceful fallback — null return, Phase A stands alone |
| NEW | Period creation from temporal headers | Decision 92/93 — observe, don't create |
| NEW | Vocabulary bindings stored in Phase B | Interface only — Phase E wires storage |
| NEW | Metrics stored in Phase B | Computed only — Phase E wires storage |

---

## IMPLEMENTATION COMPLETENESS GATE

**SCI Specification Layer 1 says:**
"The Content Profile observes everything it can and passes all observations forward."

**After Phase A + Phase B:**
- Structural observations: ✅ complete (Phase A)
- Header comprehension: ✅ complete (Phase B)
- Signal emission: ✅ both structural and header observations emitted as ProfileObservation
- Vocabulary binding interface: ✅ designed for flywheel (Phase E wires)
- Measurement: ✅ every LLM interaction measured

**Layer 1 is complete.** Phase C builds Layer 2 (Agent Scoring) on this foundation.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-160B_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch

### Completion Report Structure
1. **Architecture Decision** — one LLM call per file, rationale
2. **Commits** — all with hashes, one per phase
3. **Files created** — header-comprehension.ts
4. **Files modified** — sci-types.ts, analyze route
5. **LLM prompt** — paste the actual prompt template
6. **Vocabulary binding interface** — show function signatures
7. **Measurement interface** — show metrics structure
8. **Proof gates** — 30 gates, each PASS/FAIL with pasted evidence
9. **Implementation Completeness Gate** — Layer 1 complete after Phase A + B

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read and complied with?
□ header-comprehension.ts created?
□ ONE LLM call per file (not per sheet, not per column)?
□ LLM prompt includes ALL sheets, ALL headers, sample values?
□ LLM prompt requests structured JSON with columnRole?
□ Graceful fallback when LLM unavailable?
□ Profile enhancement updates hasTemporalColumns from LLM interpretation?
□ ProfileObservation emitted for each header interpretation?
□ VocabularyBinding interface defined (lookup returns empty map)?
□ HeaderComprehensionMetrics computed after every comprehension call?
□ Zero Korean Test violations (grep returns zero)?
□ Zero period creation from temporal headers?
□ enhanceWithHeaderComprehension called in analyze route?
□ npm run build exits 0?
□ localhost:3000 responds?
□ Implementation Completeness Gate in completion report?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*OB-160B: "The header is content to be understood. 'Mes' means month — not because it was stored in a dictionary, but because when the system looked at it, it understood. In any language. In real time. That's intelligence."*
