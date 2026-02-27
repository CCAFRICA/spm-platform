# OB-110: AI MAPPING INTELLIGENCE
## Target: alpha.2.0
## Derived from: CLT-109 F-21, F-22, F-23 | CLT-102 F-33, F-34, F-41, F-51
## Alpha Exit Criteria: #2 (single-file import produces correct mappings)

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all standing rules, anti-patterns, architecture decision gates
2. `SCHEMA_REFERENCE.md` — authoritative column reference for all Supabase tables
3. `VIALUCE_VERSIONING_FRAMEWORK_R1.md` — Rules 30-33 (release traceability)

---

## WHY THIS OB EXISTS

The Co-Founder Technical QA document states: **"Field Mapping: Column header + 5 sample values → Predicted field type + confidence."** CLT-109 proved this is not happening. The AI receives column headers but does NOT receive sample values.

Evidence from CLT-109 (February 27, 2026):

| Source Column | Contains | AI Mapped To | Confidence | Correct? |
|---|---|---|---|---|
| OfficerName | "Carlos Garcia", "Jose Martinez" | Role/Position | 85% | ❌ Should be Entity Name |
| Branch | "CFG-CDMX-001", "CFG-QRO-001" | Store ID | 100% | ✅ |
| Currency | "MXN", "MXN", "MXN" | Amount | 100% | ❌ Text strings, not money |
| NewAccountsOpened | 0, 2, 5 | Quantity | 100% | ❌ Growth metric — same target as its opposite |
| AccountsClosed | 0, 2, 1 | Quantity | 100% | ❌ Attrition metric — identical to growth |

**5 of 9 mappings wrong. All at 85-100% confidence.** The AI is maximally confident in wrong answers.

**Three root causes, three fixes:**
1. **Target taxonomy too narrow** — 7-8 types can't distinguish Entity Name from Role, Currency Code from Amount, Growth from Reduction. Fix: expand to 22 types.
2. **AI prompt lacks sample values** — column headers alone are ambiguous. "Currency" could be a code or an amount. Only the VALUES reveal the truth. Fix: inject 3-5 sample values per column.
3. **Confidence scoring disconnected from accuracy** — 100% on wrong answers because "best available match" ≠ "correct." Fix: post-AI calibration catches value/type mismatches.

**Scope: ~3 files modified. No new routes. No new tables. No auth changes.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Git commands from repo root (`spm-platform`), NOT from `web/`. Running git from `web/` causes `web/web/` double-path errors.
4. **Commit this prompt to git as the FIRST action:** `git add -A && git commit -m "OB-110 Phase 0: Prompt committed" && git push origin dev`
5. **DO NOT MODIFY ANY AUTH FILE.** Zero changes to any file in `auth/`, `middleware.ts`, or anything containing auth logic.
6. **Supabase .in() calls MUST batch ≤ 200 items.** Larger arrays silently return 0 rows.
7. **Architecture Decision Gate:** Evaluate every approach against the Anti-Pattern Registry (Section C of CC_STANDING_ARCHITECTURE_RULES.md).
8. **The Korean Test:** No field type, label, or matching logic may depend on the English language. If a Korean company uploaded data with Hangul column names, every type must still work through sample value analysis, not string matching.

---

## PHASE 0: DIAGNOSTIC — Find the Exact Files

This diagnostic MUST run first. It maps every file that will be touched. Do NOT skip this phase.

```bash
echo "============================================"
echo "OB-110 PHASE 0: AI MAPPING DIAGNOSTIC"
echo "============================================"
echo ""

echo "=== 1. FIND THE ANALYZE-WORKBOOK / SHEET ANALYSIS API ROUTE ==="
find web/src -path "*api*" \( -path "*analyze*" -o -path "*workbook*" -o -path "*sheet*analysis*" -o -path "*import*" \) -name "route.ts" | sort
echo ""

echo "=== 2. FIND WHERE THE AI PROMPT IS CONSTRUCTED FOR FIELD MAPPING ==="
grep -rn "system\|user\|prompt\|messages\|content" \
  web/src/app/api/ --include="*.ts" \
  | grep -i "map\|field\|column\|classif\|predict\|workbook\|analyze" \
  | grep -v node_modules | grep -v ".next" | head -30
echo ""

echo "=== 3. FIND THE FIELD TYPE TAXONOMY / BASE FIELDS ==="
grep -rn "base.*field\|baseField\|BASE_FIELD\|target.*field\|targetField\|enriched.*field\|field.*type\|FIELD_TYPE\|FIELD_ID_MAPPING\|fieldType" \
  web/src/lib/ web/src/app/api/ --include="*.ts" --include="*.tsx" \
  | grep -v node_modules | grep -v ".next" | head -30
echo ""

echo "=== 4. PRINT THE CURRENT TAXONOMY ==="
# Find and print the actual field type definitions
grep -rn "'entity_id'\|'amount'\|'quantity'\|'store_id'\|'date'\|'period'\|'achievement'" \
  web/src/lib/ web/src/app/api/ --include="*.ts" \
  | grep -v node_modules | grep -v ".next" | head -20
echo ""

echo "=== 5. CHECK IF SAMPLE VALUES ARE CURRENTLY EXTRACTED ==="
grep -rn "sample\|sampleValue\|sample_value\|firstRow\|rows\[0\]\|previewRow\|slice.*row\|\.slice(0" \
  web/src/app/api/ --include="*.ts" \
  | grep -i "import\|map\|field\|workbook\|analyze" \
  | grep -v node_modules | head -20
echo ""

echo "=== 6. CHECK CLASSIFICATION SIGNAL READING (OB-107 SIGNAL LOOP) ==="
grep -rn "classification_signal\|getSignal\|priorSignal\|prior.*classification\|signal.*loop\|ai_prediction" \
  web/src/app/api/ --include="*.ts" \
  | grep -v node_modules | head -15
echo ""

echo "=== 7. PRINT THE FULL AI PROMPT FUNCTION ==="
echo "(Will identify the exact file and function from steps 1-2 above, then cat the relevant section)"
echo ""

echo "=== 8. COUNT EXISTING FIELD TYPES ==="
echo "Current taxonomy size:"
grep -c "'entity_id'\|'amount'\|'quantity'\|'store_id'\|'date'\|'period'\|'achievement'\|'name'\|'role'\|'text'" \
  web/src/lib/import/field-types.ts 2>/dev/null || \
grep -c "'entity_id'\|'amount'\|'quantity'" \
  web/src/lib/ai/field-mapping.ts 2>/dev/null || \
echo "Could not count — check Phase 0 output to identify the file"
echo ""

echo "=== PHASE 0 COMPLETE ==="
echo "Now read the identified files fully before proceeding to Phase 1."
echo "Print the ENTIRE prompt construction function and the ENTIRE taxonomy definition."
```

**After running the diagnostic, print the FULL content of:**
1. The file containing the field type taxonomy/definitions
2. The function that constructs the AI prompt for field mapping
3. The function that processes the AI response (where confidence is set)

**Do not proceed to Phase 1 until you have read and understand these three things.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-110 Phase 0: AI mapping diagnostic" && git push origin dev`

---

## PHASE 1: EXPAND THE TARGET TAXONOMY

**Location:** The file identified in Phase 0 step 3 that defines field types.

Replace the current narrow taxonomy with this expanded version. **Do not delete the existing type keys** — add to them. Any existing code referencing the old keys must continue to work.

```typescript
/**
 * Expanded field type taxonomy — 22 types organized by category.
 * 
 * Design principles:
 * - Korean Test compliant: no type depends on English column names
 * - Directional metrics distinguished: growth ≠ reduction
 * - Identity types distinguished: ID ≠ Name, Entity ≠ Store
 * - Financial types distinguished: Amount ≠ Currency Code ≠ Rate
 * - Every type has a description used in the AI prompt
 * 
 * Source: OB-110 (alpha.2.0), derived from CLT-109 F-21/CLT-102 F-51
 */
export const BASE_FIELD_TYPES = {
  // === Identity ===
  entity_id:       { label: 'Entity ID',           category: 'identity',       description: 'Unique identifier for a person, account, or entity (numeric or alphanumeric code)' },
  entity_name:     { label: 'Entity Name',          category: 'identity',       description: 'Display name of a person or entity — contains human-readable names like "Carlos Garcia"' },
  store_id:        { label: 'Store/Location ID',     category: 'identity',       description: 'Identifier code for a store, branch, office, or location' },
  store_name:      { label: 'Store/Location Name',   category: 'identity',       description: 'Human-readable name of a store, branch, office, or location' },
  transaction_id:  { label: 'Transaction ID',        category: 'identity',       description: 'Unique identifier for a transaction, order, event, or record' },
  reference_id:    { label: 'Reference ID',          category: 'identity',       description: 'A cross-reference to another record, system, or external identifier' },

  // === Temporal ===
  date:            { label: 'Date',                  category: 'temporal',       description: 'A date value — transaction date, snapshot date, hire date, effective date' },
  period:          { label: 'Period',                category: 'temporal',       description: 'A time period label or identifier — month name, quarter label, period code' },

  // === Financial ===
  amount:          { label: 'Amount',                category: 'financial',      description: 'A monetary value — revenue, deposit balance, payout, sale total, balance' },
  currency_code:   { label: 'Currency Code',         category: 'financial',      description: 'ISO currency code like USD, MXN, EUR — short text strings, NOT monetary amounts' },
  rate:            { label: 'Rate/Percentage',       category: 'financial',      description: 'A rate, percentage, or ratio — commission rate, tip percentage, discount rate' },

  // === Metrics (directional) ===
  count_growth:    { label: 'Growth Count',          category: 'metric',         description: 'Count of items ADDED, opened, gained, acquired — new accounts, new customers, units sold' },
  count_reduction: { label: 'Reduction Count',       category: 'metric',         description: 'Count of items REMOVED, closed, lost, churned — closed accounts, cancellations, returns' },
  quantity:        { label: 'Quantity',              category: 'metric',         description: 'A generic count when direction is unclear or neutral — total items, headcount, visits' },
  achievement_pct: { label: 'Achievement %',         category: 'metric',         description: 'Attainment or achievement as a percentage of goal or target' },
  score:           { label: 'Score/Rating',          category: 'metric',         description: 'A performance score, quality rating, index value, or ranking number' },

  // === Classification ===
  role:            { label: 'Role/Position',         category: 'classification', description: 'Job title, role, position, or function — values like "Manager", "Sales Rep", "mesero"' },
  product_code:    { label: 'Product Code',          category: 'classification', description: 'SKU, product ID, product code, or catalog number' },
  product_name:    { label: 'Product Name',          category: 'classification', description: 'Product or service description or name' },
  category:        { label: 'Category',              category: 'classification', description: 'A grouping label — department, division, segment, tier, type, class' },
  status:          { label: 'Status',                category: 'classification', description: 'A status indicator — active, inactive, approved, pending, open, closed' },
  boolean_flag:    { label: 'Yes/No Flag',           category: 'classification', description: 'A boolean or binary value — 0/1, true/false, yes/no, si/no' },

  // === Other ===
  text:            { label: 'Text/Description',      category: 'other',          description: 'Free text, notes, comments, or descriptions — not classifiable as a structured type' },
  unknown:         { label: 'Unknown',               category: 'other',          description: 'Cannot determine field type — will be preserved in raw data regardless' },
} as const;

export type BaseFieldType = keyof typeof BASE_FIELD_TYPES;

/**
 * Get all field types as an array for dropdown display.
 * Grouped by category for UI organization.
 */
export function getFieldTypeOptions(): Array<{ value: string; label: string; category: string; }> {
  return Object.entries(BASE_FIELD_TYPES).map(([key, def]) => ({
    value: key,
    label: def.label,
    category: def.category,
  }));
}

/**
 * Get field type descriptions for inclusion in AI prompts.
 */
export function getFieldTypePromptList(): string {
  return Object.entries(BASE_FIELD_TYPES)
    .map(([key, def]) => `- ${key}: ${def.description}`)
    .join('\n');
}
```

**Backward compatibility:** If existing code references old type keys (e.g., `'name'` instead of `'entity_name'`), add aliases:

```typescript
// Backward compatibility aliases — map old keys to new
export const FIELD_TYPE_ALIASES: Record<string, BaseFieldType> = {
  'name': 'entity_name',
  'employee_id': 'entity_id',
  'location': 'store_name',
  'location_id': 'store_id',
  'percent': 'rate',
  'pct': 'achievement_pct',
};

export function resolveFieldType(type: string): BaseFieldType {
  if (type in BASE_FIELD_TYPES) return type as BaseFieldType;
  if (type in FIELD_TYPE_ALIASES) return FIELD_TYPE_ALIASES[type];
  return 'unknown';
}
```

**Also update the field mapping dropdown UI** to use the new taxonomy. Find the component that renders the mapping dropdown (identified in Phase 0) and ensure it lists all 22 types grouped by category.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-110 Phase 1: Expanded field taxonomy — 8 types to 22 types with categories" && git push origin dev`

---

## PHASE 2: INJECT SAMPLE VALUES INTO AI PROMPT

**Two changes in this phase: extract sample values from data, and include them in the prompt.**

### 2A: Extract Sample Values

Add this utility function (in the same file as the AI prompt construction, or in a shared utils file):

```typescript
/**
 * Extract sample values from parsed row data for each column.
 * Returns up to `maxSamples` non-null, non-empty values per column.
 * Used to give the AI actual data examples for more accurate classification.
 */
export function extractSampleValues(
  rows: Record<string, any>[],
  maxSamples: number = 5
): Record<string, string[]> {
  const samples: Record<string, string[]> = {};
  if (!rows || rows.length === 0) return samples;

  const columns = Object.keys(rows[0]);
  for (const col of columns) {
    // Check up to 3x maxSamples rows to find non-null values
    const checkRows = rows.slice(0, Math.min(maxSamples * 3, rows.length));
    const values = checkRows
      .map(row => row[col])
      .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
      .slice(0, maxSamples)
      .map(v => String(v).slice(0, 100)); // Truncate long values
    samples[col] = values;
  }
  return samples;
}
```

### 2B: Modify the AI Prompt

Find the function that builds the prompt for field mapping (identified in Phase 0 step 2). Currently it likely passes column names only. Change it to include sample values AND the expanded taxonomy descriptions.

**The prompt MUST include these elements:**

```typescript
function buildFieldMappingPrompt(
  columns: string[],
  sampleValues: Record<string, string[]>,
  tenantContext: {
    planNames: string[];
    priorSignals: Array<{ columnName: string; predicted: string; corrected: string; }>;
  }
): string {
  // Column descriptions with sample values
  const columnDescriptions = columns.map(col => {
    const samples = sampleValues[col] || [];
    const sampleStr = samples.length > 0
      ? `  sample values: [${samples.map(s => `"${s}"`).join(', ')}]`
      : '  (no sample values)';
    return `- Column "${col}"\n${sampleStr}`;
  }).join('\n');

  // Target types with descriptions
  const targetList = getFieldTypePromptList(); // From Phase 1

  // Prior correction signals for this tenant
  const priorCorrections = tenantContext.priorSignals.length > 0
    ? `\n\nPRIOR CORRECTIONS (learn from these — previous mappings were manually corrected by the user):\n${
        tenantContext.priorSignals.map(s =>
          `- Column "${s.columnName}" was auto-mapped to "${s.predicted}" but the user corrected it to "${s.corrected}"`
        ).join('\n')
      }`
    : '';

  // Plan context (informational, not mandatory)
  const planContext = tenantContext.planNames.length > 0
    ? `\n\nTENANT CONTEXT: This tenant has plans named: ${tenantContext.planNames.join(', ')}. Use this context to inform suggestions but do not require plan association for field classification.`
    : '';

  return `You are a data classification expert. Map each column to the most appropriate target field type based on BOTH the column name AND the sample values.

CRITICAL RULES — follow these strictly:
1. ALWAYS examine the SAMPLE VALUES. They are more reliable than column names.
2. If sample values are short text strings like "MXN", "USD", "EUR" → this is currency_code, NOT amount.
3. If sample values are human names like "Carlos Garcia", "Maria Lopez" → this is entity_name, NOT role.
4. If a column name contains "opened", "new", "added", "gained", "acquired" → use count_growth.
5. If a column name contains "closed", "lost", "churned", "cancelled", "removed" → use count_reduction.
6. NEVER map two semantically opposite columns to the same target type (e.g., "opened" and "closed" must NOT both be "quantity").
7. If sample values are all 0 and 1 (or true/false, yes/no) → this is boolean_flag.
8. Confidence MUST reflect actual certainty. If column name suggests one type but sample values suggest another, LOWER your confidence and FOLLOW the sample values.
9. Use "unknown" only if BOTH the column name AND sample values are genuinely unclassifiable.

AVAILABLE TARGET TYPES:
${targetList}

COLUMNS TO CLASSIFY:
${columnDescriptions}
${priorCorrections}
${planContext}

Respond with ONLY a JSON array. No explanation, no markdown, no backticks. Each element:
{"column": "column_name", "target": "type_key", "confidence": 0.0-1.0, "reasoning": "one sentence explaining why"}`;
}
```

### 2C: Wire Sample Values Into the API Route

In the analyze-workbook (or equivalent) API route, where sheet data is parsed:

1. After parsing rows from SheetJS, call `extractSampleValues(rows)`
2. Pass the samples into the prompt construction function
3. Ensure the samples are NOT stored in the response (only used for AI classification) — we don't want to send large data payloads back to the client

```typescript
// In the API route handler:
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, any>) : [];
const sampleValues = extractSampleValues(rows as Record<string, any>[]);

// Load prior signals for this tenant
const { data: priorSignals } = await supabase
  .from('classification_signals')
  .select('input_data, predicted_value, corrected_value')
  .eq('tenant_id', tenantId)
  .eq('signal_type', 'field_mapping')
  .not('corrected_value', 'is', null)
  .order('created_at', { ascending: false })
  .limit(50);

const tenantContext = {
  planNames: plans.map(p => p.name),
  priorSignals: (priorSignals || []).map(s => ({
    columnName: s.input_data?.columnName || '',
    predicted: s.predicted_value || '',
    corrected: s.corrected_value || '',
  })),
};

// Build and send the prompt
const prompt = buildFieldMappingPrompt(columns, sampleValues, tenantContext);
```

**NOTE:** If the `classification_signals` table doesn't exist or the query fails, gracefully degrade — pass an empty `priorSignals` array. Do NOT let a missing table break the import flow.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-110 Phase 2: Sample values in AI prompt + prior signal reading" && git push origin dev`

---

## PHASE 3: POST-AI CONFIDENCE CALIBRATION

After the AI returns its mapping suggestions, run a calibration pass that catches common errors the LLM might still make.

```typescript
/**
 * Post-AI confidence calibration.
 * Catches patterns the LLM might miss by cross-referencing
 * the AI's suggested type against actual sample values.
 */
export function calibrateFieldMappings(
  mappings: Array<{ column: string; target: string; confidence: number; reasoning: string; }>,
  sampleValues: Record<string, string[]>
): Array<{ column: string; target: string; confidence: number; reasoning: string; warning?: string; }> {
  
  const calibrated = mappings.map(m => {
    const samples = sampleValues[m.column] || [];
    let adjusted = m.confidence;
    let warning: string | undefined;

    // Rule 1: "amount" target but samples contain non-numeric text
    if (m.target === 'amount' && samples.length > 0) {
      const numericCount = samples.filter(v => !isNaN(Number(v.replace(/[,$.\s]/g, '')))).length;
      if (numericCount < samples.length * 0.5) {
        adjusted = Math.min(adjusted, 0.25);
        warning = `Sample values contain non-numeric text but mapped to Amount. Check if this should be currency_code or text.`;
      }
    }

    // Rule 2: "entity_name" or "role" but all samples are numeric
    if (['entity_name', 'role'].includes(m.target) && samples.length > 0) {
      const allNumeric = samples.every(v => !isNaN(Number(v)));
      if (allNumeric) {
        adjusted = Math.min(adjusted, 0.35);
        warning = `Sample values are all numeric but mapped to ${m.target}. Check if this should be entity_id or score.`;
      }
    }

    // Rule 3: "currency_code" but samples are numeric (probably amount)
    if (m.target === 'currency_code' && samples.length > 0) {
      const allNumeric = samples.every(v => !isNaN(Number(v.replace(/[,$.\s]/g, ''))));
      if (allNumeric) {
        adjusted = Math.min(adjusted, 0.35);
        warning = `Sample values are numeric but mapped to Currency Code. Check if this should be amount.`;
      }
    }

    // Rule 4: "date" but samples don't look like dates (no slashes, dashes, or date patterns)
    if (m.target === 'date' && samples.length > 0) {
      const datePattern = /\d{1,4}[-\/\.]\d{1,2}[-\/\.]\d{1,4}|\d{5,}/; // dates or Excel serial numbers
      const looksLikeDate = samples.some(v => datePattern.test(v));
      if (!looksLikeDate) {
        adjusted = Math.min(adjusted, 0.40);
        warning = `Sample values don't look like dates. Check mapping.`;
      }
    }

    // Rule 5: All sample values identical — possible default or placeholder
    if (samples.length >= 3) {
      const unique = new Set(samples);
      if (unique.size === 1) {
        adjusted = Math.min(adjusted, Math.max(m.confidence - 0.2, 0.3));
        warning = (warning ? warning + ' ' : '') + `All sample values identical ("${samples[0]}") — possible default value.`;
      }
    }

    return { ...m, confidence: Math.round(adjusted * 100) / 100, warning };
  });

  // Batch-level: detect duplicate target assignments for different columns
  const targetCounts = new Map<string, string[]>();
  for (const m of calibrated) {
    if (m.target === 'unknown' || m.target === 'text') continue; // these can be duplicated
    const existing = targetCounts.get(m.target) || [];
    existing.push(m.column);
    targetCounts.set(m.target, existing);
  }

  return calibrated.map(m => {
    const dupes = targetCounts.get(m.target) || [];
    if (dupes.length > 1 && m.target !== 'amount' && m.target !== 'date') {
      // Multiple columns → same target. Lower confidence and warn.
      // Exception: "amount" and "date" can legitimately appear multiple times
      return {
        ...m,
        confidence: Math.min(m.confidence, 0.50),
        warning: (m.warning ? m.warning + ' ' : '') +
          `Multiple columns mapped to "${m.target}": [${dupes.join(', ')}]. Consider using more specific types (e.g., count_growth vs count_reduction).`,
      };
    }
    return m;
  });
}
```

**Wire into the API route** — after receiving the AI response and parsing the JSON:

```typescript
// After AI returns mappings:
const rawMappings = JSON.parse(aiResponse);
const calibratedMappings = calibrateFieldMappings(rawMappings, sampleValues);

// Return calibrated mappings to the client
return NextResponse.json({ mappings: calibratedMappings, ... });
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-110 Phase 3: Post-AI confidence calibration — value validation + duplicate detection" && git push origin dev`

---

## PHASE 4: UPDATE FIELD MAPPING UI

The field mapping dropdown in the import flow needs to show the expanded taxonomy, grouped by category.

### 4A: Update the Dropdown

Find the field mapping component (Phase 0 step 3). The dropdown currently lists ~8 options. Replace with the 22-type taxonomy grouped by category:

```tsx
// Grouped dropdown options
const fieldTypeGroups = [
  { label: 'Identity', options: ['entity_id', 'entity_name', 'store_id', 'store_name', 'transaction_id', 'reference_id'] },
  { label: 'Temporal', options: ['date', 'period'] },
  { label: 'Financial', options: ['amount', 'currency_code', 'rate'] },
  { label: 'Metrics', options: ['count_growth', 'count_reduction', 'quantity', 'achievement_pct', 'score'] },
  { label: 'Classification', options: ['role', 'product_code', 'product_name', 'category', 'status', 'boolean_flag'] },
  { label: 'Other', options: ['text', 'unknown'] },
];
```

### 4B: Show Warnings

If a mapping has a `warning` from calibration, show it below the field:

```tsx
{mapping.warning && (
  <p className="text-amber-400 text-xs mt-1">⚠ {mapping.warning}</p>
)}
```

### 4C: Show Confidence as Color

```
≥ 80%: green badge (AI ✓ XX%)
50-79%: amber badge (AI ~ XX%)
< 50%: red badge (AI ? XX%) — needs review
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-110 Phase 4: Field mapping UI — grouped dropdown, warnings, confidence colors" && git push origin dev`

---

## PHASE 5: BUILD, VERIFY, AND COMPLETE

### 5A: Build Verification

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

### 5B: Functional Verification

Navigate to the import page and start an import flow. Verify:
1. Upload a file → Sheet Analysis runs
2. Field Mapping step shows expanded dropdown (22 types visible)
3. Types are grouped by category
4. Confidence badges show color coding
5. No console errors

### 5C: Proof Gates (14)

| # | Gate | Criterion | Evidence |
|---|------|-----------|----------|
| PG-01 | npm run build exits 0 | Clean build | Build log |
| PG-02 | localhost:3000 responds | HTTP 200 or 307 | curl output |
| PG-03 | Taxonomy has ≥ 20 field types | Count entries in BASE_FIELD_TYPES | grep -c |
| PG-04 | entity_name is distinct from entity_id | Both exist as separate keys | grep output |
| PG-05 | currency_code exists as a target type | Key exists in taxonomy | grep output |
| PG-06 | count_growth and count_reduction exist | Both keys exist | grep output |
| PG-07 | AI prompt includes "sample values" text | Print prompt to console/log | Log output |
| PG-08 | extractSampleValues returns non-empty for data with rows | Test with any import | Log output |
| PG-09 | calibrateFieldMappings is called after AI response | Code path verified | grep in route |
| PG-10 | Duplicate target detection runs | detectDuplicateTargets logic exists | Code review |
| PG-11 | Field mapping dropdown shows grouped categories | Browser screenshot | Visual verify |
| PG-12 | Warning text renders below flagged mappings | Browser screenshot | Visual verify |
| PG-13 | No auth files modified | `git diff --name-only` | No auth files listed |
| PG-14 | Backward compatibility — old type keys still resolve | resolveFieldType('name') returns 'entity_name' | Code test |

### 5D: PDR Verification

| PDR # | In Scope? | Check |
|-------|-----------|-------|
| PDR-01 | NO (no currency display) | — |
| PDR-02 | NO (no landing page) | — |
| PDR-04 | NOTE — count requests on import page | Record |

### 5E: Release Context

```
Target: alpha.2.0
PR: [number from gh pr create]
Verified by: CLT-112
```

### 5F: Create PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-110: AI Mapping Intelligence — sample values + expanded taxonomy + confidence calibration [alpha.2.0]" \
  --body "## Target: alpha.2.0
## Derived from: CLT-109 F-21/F-22/F-23, CLT-102 F-33/F-34/F-41/F-51

### What Changed
- Field type taxonomy expanded: ~8 types → 22 types with categories (identity, temporal, financial, metric, classification, reference, other)
- AI prompt now includes 5 sample values per column — not just column headers
- Post-AI confidence calibration catches value/type mismatches and duplicate target assignments
- Prior classification signals read into AI prompt for tenant context (OB-107 signal loop)
- Field mapping UI: grouped dropdown, warning display, color-coded confidence badges

### CLT-109 Regression Test (Expected)
| Column | Before (CLT-109) | After (OB-110) |
|--------|------------------|-----------------|
| OfficerName (contains 'Carlos Garcia') | Role/Position 85% | entity_name ~95% |
| Currency (contains 'MXN') | Amount 100% | currency_code ~95% |
| NewAccountsOpened (contains 0,2,5) | Quantity 100% | count_growth ~90% |
| AccountsClosed (contains 0,2,1) | Quantity 100% | count_reduction ~90% |
| Branch (contains 'CFG-CDMX-001') | Store ID 100% | store_id ~95% (unchanged) |

### 14 proof gates. No auth files modified. Backward compatible with existing type keys."
```

**Final commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-110 Complete: AI Mapping Intelligence — targeting alpha.2.0" && git push origin dev`

---

## WHAT THIS OB DOES NOT DO

| Item | Why Excluded | Where It's Handled |
|------|-------------|-------------------|
| Multi-file import (7 CSVs → 7 cards) | Separate scope, depends on this taxonomy | OB-111 (alpha.2.0) |
| Landing page routing | Separate scope, no dependency | HF-076 (alpha.2.0) |
| New Supabase tables | Not needed — taxonomy is client + API | — |
| Auth files | NEVER | — |
| Calculation engine | Working perfectly. Don't touch. | — |
| Financial module | Not import-related | — |
| Navigation redesign | Design session needed first | S30 → alpha.3.0 |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Skip Phase 0, guess at file locations | Phase 0 is mandatory. Print files before editing. |
| AP-4 | Build structural skeleton without wiring data | Every function must be CALLED, not just defined. Verify call sites. |
| AP-5 | Rename proof gates to match what was built | Gates are immutable. PASS or FAIL. |
| AP-6 | Git from web/ | Always cd to spm-platform root first |
| AP-18 | AI hallucination — confident wrong answers | This OB EXISTS to fix this. Calibration catches it. |

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*OB-110: "Send the AI the data, not just the labels. Trust the values, not the headers."*
