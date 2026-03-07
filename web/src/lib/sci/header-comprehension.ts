// Synaptic Content Ingestion — Header Comprehension Service
// OB-160B — LLM contextual understanding of column headers
// ONE LLM call per file upload — all sheets, all headers, sample values.
// Korean Test compliant: headers are content understood in real-time, not matched against dictionaries.
// Graceful fallback: if LLM unavailable, returns null. Phase A structural heuristics stand alone.

import type {
  ContentProfile,
  HeaderComprehension,
  HeaderInterpretation,
  HeaderComprehensionMetrics,
  ColumnRole,
  VocabularyBinding,
} from './sci-types';
import { recallVocabularyBindings } from './classification-signal-service';

// ============================================================
// INPUT TYPES
// ============================================================

export interface HeaderComprehensionInput {
  sheets: Array<{
    sheetName: string;
    columns: string[];
    sampleRows: Record<string, unknown>[];  // 3-5 rows per sheet
    rowCount: number;
  }>;
}

// ============================================================
// LLM PROMPT CONSTRUCTION
// ============================================================

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
          "confidence": 0.00
        }
      }
    }
  },
  "crossSheetInsights": ["...", "..."]
}`;
}

// ============================================================
// LLM CALL
// ============================================================

interface LLMHeaderResponse {
  sheets: Record<string, { columns: Record<string, {
    semanticMeaning: string;
    dataExpectation: string;
    columnRole: string;
    confidence: number;
  }> }>;
  crossSheetInsights: string[];
}

async function callLLMForHeaders(prompt: string): Promise<{
  result: LLMHeaderResponse;
  duration: number;
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
    const parsed: LLMHeaderResponse = JSON.parse(clean);

    const duration = Date.now() - startTime;
    console.log(`[SCI] Header comprehension completed in ${duration}ms`);

    return { result: parsed, duration };
  } catch (error) {
    console.log('[SCI] Header comprehension error (falling back to heuristics):', error);
    return null;
  }
}

// ============================================================
// VOCABULARY BINDING INTERFACE (Phase E wires storage)
// ============================================================

/**
 * Check if stored vocabulary bindings exist for these headers.
 * Phase E: wired to classification_signals table via recallVocabularyBindings
 */
export async function lookupVocabularyBindings(
  tenantId: string, columns: string[],
  structuralContext: { columnCount: number; rowCountBucket: string },
): Promise<Map<string, VocabularyBinding>> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) return new Map();

    const recalled = await recallVocabularyBindings(tenantId, columns, supabaseUrl, supabaseKey);
    if (recalled.size === 0) return new Map();

    // Convert recalled column→semanticMeaning into VocabularyBinding objects
    const bindings = new Map<string, VocabularyBinding>();
    for (const [colName, semanticMeaning] of Array.from(recalled.entries())) {
      bindings.set(colName, {
        columnName: colName,
        interpretation: {
          columnName: colName,
          semanticMeaning,
          dataExpectation: 'recalled',
          columnRole: 'unknown' as ColumnRole,
          confidence: 0.85,
        },
        structuralContext: {
          sheetColumnCount: structuralContext.columnCount,
          sheetRowCountBucket: structuralContext.rowCountBucket as 'small' | 'medium' | 'large',
          columnPosition: 0,
          dataType: 'unknown',
        },
        confirmationSource: 'classification_success',
        confirmationCount: 2,
        lastConfirmed: new Date().toISOString(),
      });
    }

    return bindings;
  } catch {
    return new Map();
  }
}

/**
 * Prepare vocabulary bindings for storage after classification is confirmed.
 * Phase B: creates binding objects, returns them for future storage
 * Phase E: writes to classification_signals table
 */
export function prepareVocabularyBindings(
  tenantId: string,
  profiles: ContentProfile[],
  confirmationSource: VocabularyBinding['confirmationSource'],
): VocabularyBinding[] {
  void tenantId; // Phase E: used for tenant-scoped storage
  const bindings: VocabularyBinding[] = [];

  for (const profile of profiles) {
    if (!profile.headerComprehension) continue;

    for (const [colName, interp] of Array.from(profile.headerComprehension.interpretations.entries())) {
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

// ============================================================
// VALID COLUMN ROLES
// ============================================================

const VALID_COLUMN_ROLES = new Set<ColumnRole>([
  'identifier', 'name', 'temporal', 'measure', 'attribute', 'reference_key', 'unknown',
]);

function toColumnRole(value: string): ColumnRole {
  if (VALID_COLUMN_ROLES.has(value as ColumnRole)) return value as ColumnRole;
  return 'unknown';
}

// ============================================================
// COMPREHENSION FROM LLM RESPONSE
// ============================================================

function buildComprehensionFromLLM(
  llmResult: LLMHeaderResponse,
  duration: number,
  crossSheetInsights: string[],
): Map<string, HeaderComprehension> {
  const result = new Map<string, HeaderComprehension>();

  for (const [sheetName, sheetData] of Object.entries(llmResult.sheets)) {
    const interpretations = new Map<string, HeaderInterpretation>();

    for (const [colName, interp] of Object.entries(sheetData.columns)) {
      interpretations.set(colName, {
        columnName: colName,
        semanticMeaning: interp.semanticMeaning || 'unknown',
        dataExpectation: interp.dataExpectation || 'unknown',
        columnRole: toColumnRole(interp.columnRole),
        confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.5,
      });
    }

    result.set(sheetName, {
      interpretations,
      crossSheetInsights,
      llmCallDuration: duration,
      llmModel: 'claude-sonnet-4-20250514',
      fromVocabularyBinding: false,
    });
  }

  return result;
}

function buildComprehensionFromBindings(
  input: HeaderComprehensionInput,
  bindings: Map<string, VocabularyBinding>,
): Map<string, HeaderComprehension> {
  const result = new Map<string, HeaderComprehension>();

  for (const sheet of input.sheets) {
    const interpretations = new Map<string, HeaderInterpretation>();

    for (const col of sheet.columns) {
      const binding = bindings.get(col);
      if (binding) {
        interpretations.set(col, binding.interpretation);
      }
    }

    result.set(sheet.sheetName, {
      interpretations,
      crossSheetInsights: [],
      llmCallDuration: 0,
      llmModel: 'vocabulary_binding',
      fromVocabularyBinding: true,
    });
  }

  return result;
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

/**
 * Comprehend column headers across all sheets in one LLM call.
 * Returns Map<sheetName, HeaderComprehension> or null if LLM unavailable.
 */
export async function comprehendHeaders(
  input: HeaderComprehensionInput,
  tenantId: string,
): Promise<{
  comprehensions: Map<string, HeaderComprehension> | null;
  metrics: HeaderComprehensionMetrics;
}> {
  const allColumns = input.sheets.flatMap(s => s.columns);

  // Step 1: Check vocabulary bindings (Phase E will populate these)
  const existingBindings = await lookupVocabularyBindings(tenantId, allColumns, {
    columnCount: input.sheets[0]?.columns.length ?? 0,
    rowCountBucket: 'medium',
  });

  // Step 2: If ALL columns have confirmed bindings with high confidence, skip LLM
  const allBound = allColumns.length > 0 && allColumns.every(col => {
    const binding = existingBindings.get(col);
    return binding && binding.confirmationCount >= 2 && binding.interpretation.confidence >= 0.85;
  });

  if (allBound) {
    const comprehensions = buildComprehensionFromBindings(input, existingBindings);
    const metrics: HeaderComprehensionMetrics = {
      llmCalled: false,
      llmCallDuration: null,
      llmModel: null,
      columnsInterpreted: allColumns.length,
      columnsFromBindings: allColumns.length,
      columnsFromLLM: 0,
      averageConfidence: computeAverageConfidence(comprehensions),
      crossSheetInsightCount: 0,
      timestamp: new Date().toISOString(),
    };
    return { comprehensions, metrics };
  }

  // Step 3: Call LLM for all headers
  const prompt = buildHeaderComprehensionPrompt(input);
  const llmResponse = await callLLMForHeaders(prompt);

  if (!llmResponse) {
    const metrics: HeaderComprehensionMetrics = {
      llmCalled: false,
      llmCallDuration: null,
      llmModel: null,
      columnsInterpreted: 0,
      columnsFromBindings: 0,
      columnsFromLLM: 0,
      averageConfidence: 0,
      crossSheetInsightCount: 0,
      timestamp: new Date().toISOString(),
    };
    return { comprehensions: null, metrics };
  }

  const crossSheetInsights = llmResponse.result.crossSheetInsights || [];
  const comprehensions = buildComprehensionFromLLM(
    llmResponse.result,
    llmResponse.duration,
    crossSheetInsights,
  );

  const metrics: HeaderComprehensionMetrics = {
    llmCalled: true,
    llmCallDuration: llmResponse.duration,
    llmModel: 'claude-sonnet-4-20250514',
    columnsInterpreted: allColumns.length,
    columnsFromBindings: 0,
    columnsFromLLM: allColumns.length,
    averageConfidence: computeAverageConfidence(comprehensions),
    crossSheetInsightCount: crossSheetInsights.length,
    timestamp: new Date().toISOString(),
  };

  return { comprehensions, metrics };
}

function computeAverageConfidence(
  comprehensions: Map<string, HeaderComprehension> | null,
): number {
  if (!comprehensions) return 0;
  let total = 0;
  let count = 0;
  for (const comp of Array.from(comprehensions.values())) {
    for (const interp of Array.from(comp.interpretations.values())) {
      total += interp.confidence;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

// ============================================================
// PROFILE ENHANCEMENT
// ============================================================

/**
 * Enhance Content Profiles with header comprehension results.
 * Called AFTER generateContentProfile, BEFORE agent scoring.
 * Emits ProfileObservation signals for each header interpretation.
 */
export async function enhanceWithHeaderComprehension(
  profiles: Map<string, ContentProfile>,
  sheets: HeaderComprehensionInput['sheets'],
  tenantId: string,
): Promise<HeaderComprehensionMetrics> {
  const { comprehensions, metrics } = await comprehendHeaders({ sheets }, tenantId);

  if (!comprehensions) return metrics;

  for (const [sheetName, comprehension] of Array.from(comprehensions.entries())) {
    const profile = profiles.get(sheetName);
    if (!profile) continue;

    profile.headerComprehension = comprehension;

    // Emit ProfileObservation for each header interpretation
    for (const [colName, interp] of Array.from(comprehension.interpretations.entries())) {
      profile.observations.push({
        columnName: colName,
        observationType: 'header_comprehension',
        observedValue: interp.semanticMeaning,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `LLM interpreted "${colName}" as ${interp.semanticMeaning} (${interp.columnRole}), expects ${interp.dataExpectation}`,
      });
    }

    // Enhance profile from comprehension
    enhanceProfileWithComprehension(profile);
  }

  return metrics;
}

// HC confidence threshold for override authority (Decision 108)
const HC_OVERRIDE_THRESHOLD = 0.80;

function enhanceProfileWithComprehension(profile: ContentProfile): void {
  if (!profile.headerComprehension) return;

  const hc = profile.headerComprehension;

  // ────────────────────────────────────────────────────────
  // Decision 108: HC OVERRIDE AUTHORITY
  // When HC produces column roles with confidence >= 0.80,
  // those roles OVERRIDE structural detection.
  // ────────────────────────────────────────────────────────

  // OVERRIDE 1: Identifier detection
  // If HC identifies a column as 'identifier' or 'reference_key' with high confidence,
  // use that column for identifierRepeatRatio — even if structural uniqueness picked a different column.
  const hcIdentifierCol = findHCColumnByRole(hc, ['identifier', 'reference_key'], HC_OVERRIDE_THRESHOLD);
  if (hcIdentifierCol) {
    const idField = profile.fields.find(f => f.fieldName === hcIdentifierCol.colName);
    if (idField && idField.distinctCount > 0) {
      const oldRatio = profile.structure.identifierRepeatRatio;
      const newRatio = profile.structure.rowCount / idField.distinctCount;
      if (Math.abs(oldRatio - newRatio) > 0.01) {
        profile.structure.identifierRepeatRatio = newRatio;
        // Update volume pattern to match new ratio
        profile.patterns.volumePattern =
          newRatio === 0 ? 'unknown' :
          newRatio <= 1.5 ? 'single' :
          newRatio <= 3.0 ? 'few' :
          'many';
        profile.observations.push({
          columnName: hcIdentifierCol.colName,
          observationType: 'hc_identifier_override',
          observedValue: newRatio,
          confidence: hcIdentifierCol.confidence,
          alternativeInterpretations: { structuralRatio: oldRatio },
          structuralEvidence: `HC identified "${hcIdentifierCol.colName}" as ${hcIdentifierCol.role} (${hcIdentifierCol.semanticMeaning}) — overriding structural identifier. Ratio: ${oldRatio.toFixed(2)} → ${newRatio.toFixed(2)}`,
        });
      }
    }
    if (!profile.patterns.hasEntityIdentifier) {
      profile.patterns.hasEntityIdentifier = true;
    }
  }

  // OVERRIDE 2: Temporal suppression
  // If structural analysis flagged columns as temporal, but HC says they are NOT temporal
  // (e.g., 'attribute' or 'measure'), suppress the temporal detection for those columns.
  if (profile.patterns.hasTemporalColumns) {
    const suppressedTemporal = suppressFalseTemporalColumns(profile, hc);
    if (suppressedTemporal) {
      // Re-evaluate hasDateColumn: only true if a genuine date-typed or HC-confirmed temporal column remains
      const hasGenuineDateColumn = profile.fields.some(f => f.dataType === 'date');
      const hasHCTemporalColumn = Array.from(hc.interpretations.values()).some(
        interp => interp.columnRole === 'temporal' && interp.confidence >= HC_OVERRIDE_THRESHOLD,
      );
      profile.patterns.hasDateColumn = hasGenuineDateColumn || hasHCTemporalColumn;
      profile.patterns.hasTemporalColumns = hasGenuineDateColumn || hasHCTemporalColumn;
    }
  }

  // OVERRIDE 3: Currency suppression
  // If structural analysis typed a column as currency based on header substring ("total", "amount"),
  // but HC says it's a non-monetary measure (capacity, count, utilization), suppress currency classification.
  suppressFalseCurrencyColumns(profile, hc);

  // ────────────────────────────────────────────────────────
  // REINFORCEMENT (existing behavior — only adds, never removes)
  // ────────────────────────────────────────────────────────

  for (const [colName, interp] of Array.from(hc.interpretations.entries())) {
    const field = profile.fields.find(f => f.fieldName === colName);
    if (!field) continue;

    // Reinforcement 1: Temporal column reinforcement (HC adds temporal that structural missed)
    if (interp.columnRole === 'temporal' && interp.confidence >= HC_OVERRIDE_THRESHOLD && !profile.patterns.hasTemporalColumns) {
      profile.patterns.hasTemporalColumns = true;
      profile.patterns.hasDateColumn = true;
      profile.observations.push({
        columnName: colName,
        observationType: 'temporal_enhancement',
        observedValue: true,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `LLM identified "${colName}" as temporal (${interp.semanticMeaning}) — structural detection missed this`,
      });
    }

    // Reinforcement 2: Name column reinforcement
    if (interp.columnRole === 'name' && interp.confidence >= HC_OVERRIDE_THRESHOLD && !profile.patterns.hasStructuralNameColumn) {
      profile.patterns.hasStructuralNameColumn = true;
      field.nameSignals.looksLikePersonName = true;
      profile.observations.push({
        columnName: colName,
        observationType: 'name_enhancement',
        observedValue: true,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `LLM identified "${colName}" as person name — structural detection missed this`,
      });
    }

    // Reinforcement 3: Identifier reinforcement (existing — low-confidence HC also adds)
    if (interp.columnRole === 'identifier' && !profile.patterns.hasEntityIdentifier) {
      profile.patterns.hasEntityIdentifier = true;
    }
  }
}

// ============================================================
// HC OVERRIDE HELPERS
// ============================================================

function findHCColumnByRole(
  hc: HeaderComprehension,
  roles: ColumnRole[],
  minConfidence: number,
): { colName: string; role: ColumnRole; confidence: number; semanticMeaning: string } | null {
  for (const [colName, interp] of Array.from(hc.interpretations.entries())) {
    if (roles.includes(interp.columnRole as ColumnRole) && interp.confidence >= minConfidence) {
      return { colName, role: interp.columnRole as ColumnRole, confidence: interp.confidence, semanticMeaning: interp.semanticMeaning };
    }
  }
  return null;
}

/**
 * Suppress temporal detection for columns that HC identifies as non-temporal.
 * Returns true if any temporal columns were suppressed.
 */
function suppressFalseTemporalColumns(
  profile: ContentProfile,
  hc: HeaderComprehension,
): boolean {
  let anySuppressed = false;

  for (const [colName, interp] of Array.from(hc.interpretations.entries())) {
    if (interp.confidence < HC_OVERRIDE_THRESHOLD) continue;
    if (interp.columnRole === 'temporal') continue; // HC agrees it's temporal — no suppression

    // HC says this column is NOT temporal (e.g., 'attribute', 'measure', 'reference_key')
    // Check if structural analysis flagged this column as temporal via integer range detection
    const field = profile.fields.find(f => f.fieldName === colName);
    if (!field) continue;

    // Check if this field's values are in temporal ranges (1-12 or 2000-2040)
    const dist = field.distribution;
    if (dist.min === undefined || dist.max === undefined) continue;
    const min = Number(dist.min);
    const max = Number(dist.max);
    const isYearRange = min >= 2000 && max <= 2040;
    const isMonthRange = min >= 1 && max <= 12;

    if (isYearRange || isMonthRange) {
      // Structural analysis would have flagged this as temporal, but HC says otherwise
      anySuppressed = true;
      profile.observations.push({
        columnName: colName,
        observationType: 'hc_temporal_suppression',
        observedValue: false,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `HC identified "${colName}" as ${interp.columnRole} (${interp.semanticMeaning}), not temporal — suppressing structural temporal detection (values ${min}-${max})`,
      });
    }
  }

  return anySuppressed;
}

/**
 * Suppress currency classification for columns that HC identifies as non-monetary measures.
 * Recalculates hasCurrencyColumns after suppression.
 */
function suppressFalseCurrencyColumns(
  profile: ContentProfile,
  hc: HeaderComprehension,
): void {
  let currencyCountAdjustment = 0;

  for (const [colName, interp] of Array.from(hc.interpretations.entries())) {
    if (interp.confidence < HC_OVERRIDE_THRESHOLD) continue;

    const field = profile.fields.find(f => f.fieldName === colName);
    if (!field) continue;

    // Check if field was typed as currency but HC says it's a non-monetary measure
    const isCurrencyTyped = field.dataType === 'currency' ||
      (field.nameSignals.containsAmount && ['decimal', 'integer', 'currency'].includes(field.dataType));

    if (!isCurrencyTyped) continue;

    // HC says this is a measure with non-monetary meaning (capacity, count, utilization, etc.)
    const nonMonetaryPatterns = /capacity|count|volume|utilization|rate|quantity|units|loads|deliveries|incidents/i;
    if (interp.columnRole === 'measure' && nonMonetaryPatterns.test(interp.semanticMeaning)) {
      currencyCountAdjustment++;
      profile.observations.push({
        columnName: colName,
        observationType: 'hc_currency_suppression',
        observedValue: false,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `HC identified "${colName}" as non-monetary measure (${interp.semanticMeaning}) — suppressing currency classification`,
      });
    }
  }

  if (currencyCountAdjustment > 0) {
    profile.patterns.hasCurrencyColumns = Math.max(0, profile.patterns.hasCurrencyColumns - currencyCountAdjustment);
  }
}
