// Synaptic Content Ingestion — Header Comprehension Service
// OB-160B — LLM contextual understanding of column headers
// ONE LLM call per file upload — all sheets, all headers, sample values.
// Korean Test compliant: headers are content understood in real-time, not matched against dictionaries.
// Graceful fallback: if LLM unavailable, returns null. Phase A structural heuristics stand alone.
// HF-100: Migrated to AIService — single code path for all AI calls.

import type {
  ContentProfile,
  HeaderComprehension,
  HeaderInterpretation,
  HeaderComprehensionMetrics,
  ColumnRole,
  FieldIdentity,
} from './sci-types';
import { getAIService } from '@/lib/ai/ai-service';

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
// SHEETS DESCRIPTION BUILDER
// ============================================================

function buildSheetsDescription(input: HeaderComprehensionInput): string {
  return input.sheets.map(sheet => {
    const sampleStr = sheet.sampleRows.slice(0, 3).map((row, i) => {
      const vals = sheet.columns.map(col => `${col}: ${JSON.stringify(row[col] ?? null)}`);
      return `  Row ${i + 1}: { ${vals.join(', ')} }`;
    }).join('\n');

    return `Sheet "${sheet.sheetName}" (${sheet.rowCount} rows, ${sheet.columns.length} columns):
  Columns: ${sheet.columns.join(', ')}
  Sample data:
${sampleStr}`;
  }).join('\n\n');
}

// ============================================================
// LLM CALL VIA AISERVICE
// ============================================================

interface LLMHeaderResponse {
  sheets: Record<string, { columns: Record<string, {
    semanticMeaning: string;
    dataExpectation: string;
    columnRole: string;
    identifiesWhat?: string;  // HF-171: person, transaction, location, product, organization, account, other
    confidence: number;
  }> }>;
  crossSheetInsights: string[];
}

async function callLLMForHeaders(input: HeaderComprehensionInput): Promise<{
  result: LLMHeaderResponse;
  duration: number;
} | null> {
  try {
    const startTime = Date.now();
    const sheetsDescription = buildSheetsDescription(input);

    const aiService = getAIService();
    const response = await aiService.execute({
      task: 'header_comprehension',
      input: { sheetsDescription },
      options: { maxTokens: 8192, responseFormat: 'json' },
    }, false); // No signal capture for HC — it runs on every import

    const duration = Date.now() - startTime;

    // AIService returns { parseError: true } on JSON parse failure
    if (response.result.parseError) {
      console.log(`[SCI] Header comprehension JSON parse failed (AIService fallback). duration=${duration}ms`);
      return null;
    }

    const parsed = response.result as unknown as LLMHeaderResponse;
    if (!parsed.sheets) {
      console.log(`[SCI] Header comprehension response missing 'sheets' key. duration=${duration}ms`);
      return null;
    }

    console.log(`[SCI] Header comprehension completed in ${duration}ms via AIService`);
    return { result: parsed, duration };
  } catch (error) {
    console.log('[SCI] Header comprehension error (falling back to heuristics):', error instanceof Error ? error.message : String(error));
    return null;
  }
}

// ============================================================
// VOCABULARY BINDING INTERFACE (Phase E wires storage)
// ============================================================

// HF-254 Fix 1 (Principle 1 / AP-7): `lookupVocabularyBindings` DELETED. It
// fabricated columnRole='unknown', confidence=0.85, confirmationCount=2 to wrap
// the meaning-only recalled strings into VocabularyBinding objects, then the
// Step-2 skip gate in comprehendHeaders used those rigged values to skip the LLM —
// resolving every role to 'unknown' and corrupting warm imports to entity. The
// vocabulary cache is no longer an LLM-skip authority (that is solely the
// fingerprint flywheel). The cache is completed as an additive classification
// prior in HF-254 Phase 6 (consumed in the resolver via recallVocabularyBindings),
// never re-fabricating a role.

// HF-254 Fix 3a: `prepareVocabularyBindings` DELETED. It was uncalled scaffolding (the
// "Phase E wires storage" comment never wired). Cache B is completed inline at
// emitFlywheelSignals, which builds the role-bearing vocabulary_bindings map
// ({semanticMeaning, columnRole, confidence}) directly from the trace HC — the same
// source as the fingerprint fieldBindings enrichment (AP-17). No dead scaffolding remains.

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
        identifiesWhat: interp.identifiesWhat || undefined,  // HF-171
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

// HF-254 Fix 1: `buildComprehensionFromBindings` DELETED — it materialized the
// fabricated `fromVocabularyBinding: true` comprehension that the skip gate returned.
// With the skip gate gone, comprehendHeaders always produces comprehension from the
// LLM (or null when the LLM is unavailable).

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

  // HF-254 Fix 1: the vocabulary-binding LLM-skip gate (former Step 1-2) is REMOVED.
  // The fingerprint flywheel is the sole LLM-skip authority; comprehendHeaders is only
  // invoked for sheets the flywheel did NOT skip (analyze's `sheetsNeedingHC`), so it
  // must always produce real interpretation — never a fabricated 'unknown' skip.
  void tenantId; // retained in signature for call-site compatibility

  // Call LLM via AIService for all headers
  const llmResponse = await callLLMForHeaders(input);

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

// ============================================================
// OB-162: FIELD IDENTITY EXTRACTION (Decision 111)
// ============================================================

/**
 * Extract field identities from HC comprehension results for a specific sheet.
 * Returns Record<columnName, FieldIdentity> suitable for committed_data.metadata.field_identities
 */
export function extractFieldIdentities(
  comprehensions: Map<string, HeaderComprehension> | null,
  sheetName: string,
): Record<string, FieldIdentity> | null {
  if (!comprehensions) return null;

  const hc = comprehensions.get(sheetName);
  if (!hc) return null;

  const identities: Record<string, FieldIdentity> = {};
  for (const [colName, interp] of Array.from(hc.interpretations.entries())) {
    identities[colName] = {
      structuralType: interp.columnRole,
      contextualIdentity: interp.semanticMeaning,
      confidence: interp.confidence,
    };
  }

  return Object.keys(identities).length > 0 ? identities : null;
}

/**
 * Extract field identities from a classificationTrace's headerComprehension data.
 * This is used in the execute pipeline where we have the trace but not the full HC maps.
 */
export function extractFieldIdentitiesFromTrace(
  classificationTrace: Record<string, unknown> | undefined,
): Record<string, FieldIdentity> | null {
  if (!classificationTrace) return null;

  const hcData = classificationTrace.headerComprehension as
    { interpretations?: Record<string, { columnRole?: string; semanticMeaning?: string; confidence?: number }> } | null;

  if (!hcData?.interpretations) return null;

  const identities: Record<string, FieldIdentity> = {};
  for (const [colName, interp] of Object.entries(hcData.interpretations)) {
    const role = interp.columnRole || 'unknown';
    identities[colName] = {
      structuralType: role as ColumnRole,
      contextualIdentity: interp.semanticMeaning || 'unknown',
      confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.5,
    };
  }

  return Object.keys(identities).length > 0 ? identities : null;
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
