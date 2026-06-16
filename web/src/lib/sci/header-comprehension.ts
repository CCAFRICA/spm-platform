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
  ComprehensionFailureClass,
} from './sci-types';
import { getAIService } from '@/lib/ai/ai-service';
import { lookupAtoms, writeAtoms } from './atom-flywheel';
import { computeAtomFingerprint } from './atom-fingerprint';
import { decomposeComprehension, type ResidueComprehender, type ComprehendedInterpretation } from './decomposed-comprehension';
// OB-203 Phase 4 (R3): atom recognition-confidence signals (fire-and-forget).
import { fireSignalBatch, buildAtomRecognitionSignal } from './comprehension-signal-vocabulary';

// OB-203 Phase 1: classify a thrown comprehension error structurally (no domain words).
export function classifyThrownFailure(error: unknown): ComprehensionFailureClass {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted') || msg.includes('etimedout')) {
    return 'timeout';
  }
  return 'unclassified_failure';
}

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

// OB-203 Phase 1 (DI-4): the call's outcome is a discriminated union — success carries
// the result; failure carries a NAMED structural class + duration. `null` (silent
// fallback) is retired here.
type LLMHeaderOutcome =
  | { ok: true; result: LLMHeaderResponse; duration: number }
  | { ok: false; failureClass: ComprehensionFailureClass; duration: number };

async function callLLMForHeaders(input: HeaderComprehensionInput): Promise<LLMHeaderOutcome> {
  const startTime = Date.now();
  try {
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
      return { ok: false, failureClass: 'parse_failure', duration };
    }

    const parsed = response.result as unknown as LLMHeaderResponse;
    if (!parsed.sheets) {
      console.log(`[SCI] Header comprehension response missing 'sheets' key. duration=${duration}ms`);
      return { ok: false, failureClass: 'schema_mismatch', duration };
    }

    console.log(`[SCI] Header comprehension completed in ${duration}ms via AIService`);
    return { ok: true, result: parsed, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const failureClass = classifyThrownFailure(error);
    console.log(`[SCI] Header comprehension error (${failureClass}, falling back to heuristics):`, error instanceof Error ? error.message : String(error));
    return { ok: false, failureClass, duration };
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
      llmModel: 'claude-sonnet-4-6',
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

  if (!llmResponse.ok) {
    // OB-203 Phase 1 (DI-4): comprehension failed — carry the NAMED structural class +
    // duration up so the route writes one `failed_interpretation` signal per affected
    // unit. This replaces the silent `null` fallback (the unit is no longer presented as
    // if comprehended).
    const metrics: HeaderComprehensionMetrics = {
      llmCalled: false,
      llmCallDuration: llmResponse.duration,
      llmModel: null,
      columnsInterpreted: 0,
      columnsFromBindings: 0,
      columnsFromLLM: 0,
      averageConfidence: 0,
      crossSheetInsightCount: 0,
      timestamp: new Date().toISOString(),
      failure: { failureClass: llmResponse.failureClass, durationMs: llmResponse.duration },
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
    llmModel: 'claude-sonnet-4-6',
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
// OB-203 Phase 2 (5b) — DECOMPOSED COMPREHENSION DISPATCH
//
// Replaces the single all-sheets LLM call. Per sheet: atoms (FULL rows — Deviation 2, load-bearing
// for DI-2/DI-8 accuracy) → known atoms claim roles (no LLM) → only the novel residue is
// comprehended (bounded, one repair retry) → a residue failure marks THAT sheet failed_interpretation,
// siblings proceed (DI-4). `profile.headerComprehension` is reconstructed to the EXACT current shape:
// known columns get the Tier-1-precedent structural label (Deviation 1, DI-10), novel columns get the
// full LLM interpretation (so suppressFalseCurrency fires on novel/LLM columns, not on recognized ones).
// Atoms accumulate via writeAtoms only for succeeded units (hold a — failed runs don't seed the store).
// ============================================================

/**
 * OB-203 Phase 5 — dev-only comprehension fault-injection gate (hard-gated; testable).
 * TRUE only when ALL hold: not a production build, OB203_FAULT_SHEET is set, and it names this sheet.
 * Used to force a genuine `failed_interpretation` through the production failure path for the CLT.
 */
export function ob203FaultInjected(sheetName: string): boolean {
  return process.env.NODE_ENV !== 'production'
    && !!process.env.OB203_FAULT_SHEET
    && sheetName === process.env.OB203_FAULT_SHEET;
}

export async function runDecomposedComprehension(
  profiles: Map<string, ContentProfile>,
  sheets: Array<{ sheetName: string; columns: string[]; rows: Record<string, unknown>[]; rowCount: number }>,
  tenantId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  // OB-203 D13: streamed per-unit completion (sheetName + status) as each sheet finishes.
  onUnitDone?: (u: { sheetName: string; status: 'recognized' | 'comprehended' | 'failed_interpretation'; recognizedFraction: number; novelCount: number; failureClass?: ComprehensionFailureClass }) => void,
): Promise<{
  metrics: HeaderComprehensionMetrics;
  perSheetFailure: Map<string, ComprehensionFailureClass>;
  provenance: Map<string, { recognizedFraction: number; novelCount: number; llmCalled: boolean }>;
}> {
  // 1. atom fingerprints per column on FULL rows (Deviation 2), collect hashes for the lookup.
  const hashes: string[] = [];
  for (const s of sheets) for (const c of s.columns) hashes.push(computeAtomFingerprint(c, s.rows.map(r => r[c])).hash);

  // 2. read-before-derive: known atoms for this tenant.
  const known = await lookupAtoms(tenantId, hashes, supabaseUrl, supabaseServiceKey);

  // 3. residue comprehender: callLLMForHeaders on the bounded (novel-only, sample-bounded) input,
  //    one repair retry, then failed_interpretation.
  let llmDispatches = 0;
  let totalLlmDuration = 0;
  const residue: ResidueComprehender = async (req) => {
    // OB-203 Phase 5 — DEV-ONLY fault injection (hard-gated). When OB203_FAULT_SHEET names this
    // sheet, short-circuit to a genuine comprehension failure BEFORE the LLM call, so the failure
    // traverses the REAL Phase 1 path (decomposed dispatch → perSheetFailure → failed_interpretation
    // → emitComprehensionFailureSignals). Inert without the env var; NEVER active in production
    // builds (NODE_ENV guard). Durable test instrumentation for the observer/resolution CLT.
    if (ob203FaultInjected(req.sheetName)) {
      console.warn(`[OB-203][fault-injection] forcing comprehension failure for sheet=${req.sheetName} (OB203_FAULT_SHEET)`);
      return { ok: false, failureClass: 'parse_failure' };
    }
    let lastFailure: ComprehensionFailureClass = 'unclassified_failure';
    for (let attempt = 0; attempt < 2; attempt++) {
      llmDispatches++;
      const outcome = await callLLMForHeaders({ sheets: [{ sheetName: req.sheetName, columns: req.columns, sampleRows: req.sampleRows, rowCount: req.rowCount }] });
      totalLlmDuration += outcome.duration;
      if (outcome.ok) {
        const sheetData = outcome.result.sheets[req.sheetName];
        if (sheetData?.columns) {
          const interpretations: Record<string, ComprehendedInterpretation> = {};
          for (const [col, interp] of Object.entries(sheetData.columns)) {
            interpretations[col] = {
              semanticMeaning: interp.semanticMeaning || 'unknown',
              dataExpectation: interp.dataExpectation || 'unknown',
              columnRole: toColumnRole(interp.columnRole),
              ...(interp.identifiesWhat ? { identifiesWhat: interp.identifiesWhat } : {}),
              confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.5,
            };
          }
          return { ok: true, interpretations };
        }
        lastFailure = 'schema_mismatch';
      } else {
        lastFailure = outcome.failureClass;
      }
    }
    return { ok: false, failureClass: lastFailure };
  };

  // 4. per-unit decomposed dispatch (atoms computed on full rows inside the planner).
  const results = await decomposeComprehension(sheets, known, residue, 0.5, (r) => {
    onUnitDone?.({
      sheetName: r.sheetName,
      status: r.status,
      recognizedFraction: r.recognizedFraction,
      novelCount: r.comprehendedColumns?.length ?? 0,
      failureClass: r.failure?.failureClass,
    });
  });

  // 5. reconstruct headerComprehension + enhance; collect failures, provenance, atoms-to-write.
  const perSheetFailure = new Map<string, ComprehensionFailureClass>();
  const provenance = new Map<string, { recognizedFraction: number; novelCount: number; llmCalled: boolean }>();
  const atomsToWrite: Array<{ atom: ReturnType<typeof computeAtomFingerprint>; role: string; roleConfidence: number }> = [];
  let columnsInterpreted = 0, confTotal = 0, confCount = 0;

  for (const r of results) {
    provenance.set(r.sheetName, { recognizedFraction: r.recognizedFraction, novelCount: r.comprehendedColumns?.length ?? 0, llmCalled: r.status !== 'recognized' });
    if (r.status === 'failed_interpretation') {
      perSheetFailure.set(r.sheetName, r.failure!.failureClass);
      continue; // no headerComprehension set — Phase 1 surface (failed_interpretation) handles it
    }
    const profile = profiles.get(r.sheetName);
    if (!profile) continue;

    const interpretations = new Map<string, HeaderInterpretation>();
    // Deviation 1: known atoms -> structural role label (Tier-1 precedent shape).
    for (const k of r.knownColumns) {
      interpretations.set(k.columnName, { columnName: k.columnName, semanticMeaning: k.role, dataExpectation: '', columnRole: toColumnRole(k.role), confidence: k.confidence });
    }
    // novel atoms -> full LLM interpretation (semantic text present -> currency suppression can fire here).
    for (const c of (r.comprehendedColumns ?? [])) {
      const i = c.interpretation;
      interpretations.set(c.columnName, { columnName: c.columnName, semanticMeaning: i.semanticMeaning, dataExpectation: i.dataExpectation, columnRole: toColumnRole(i.columnRole), identifiesWhat: i.identifiesWhat || undefined, confidence: i.confidence });
    }

    profile.headerComprehension = {
      interpretations,
      crossSheetInsights: [],
      llmCallDuration: 0,
      llmModel: r.status === 'comprehended' ? 'claude-sonnet-4-6' : 'flywheel-atom',
      fromVocabularyBinding: false,
    };
    for (const [colName, interp] of Array.from(interpretations.entries())) {
      profile.observations.push({
        columnName: colName,
        observationType: 'header_comprehension',
        observedValue: interp.semanticMeaning,
        confidence: interp.confidence,
        alternativeInterpretations: {},
        structuralEvidence: `Comprehended "${colName}" as ${interp.semanticMeaning} (${interp.columnRole})`,
      });
      confTotal += interp.confidence; confCount++;
    }
    enhanceProfileWithComprehension(profile);
    columnsInterpreted += interpretations.size;

    // hold (a): succeeded units only — recompute the full atom (with features) on full rows for the write.
    const sheet = sheets.find(s => s.sheetName === r.sheetName)!;
    for (const a of r.atomsToWrite) {
      atomsToWrite.push({ atom: computeAtomFingerprint(a.columnName, sheet.rows.map(row => row[a.columnName])), role: a.role, roleConfidence: a.roleConfidence });
    }
  }

  // 6. accumulate atoms (gated by success — failed units contributed none).
  await writeAtoms(tenantId, atomsToWrite, supabaseUrl, supabaseServiceKey);

  // OB-203 Phase 4 (R3): atom recognition-confidence signals (fire-and-forget batch; DI-5 write-side).
  // recognitionConfidence tracks the resolved role confidence for the accumulated atoms.
  fireSignalBatch(
    atomsToWrite.map(a => buildAtomRecognitionSignal({
      tenantId, atomHash: a.atom.hash, role: a.role, recognitionConfidence: a.roleConfidence, roleConfidence: a.roleConfidence,
    })),
    supabaseUrl, supabaseServiceKey,
  );

  const metrics: HeaderComprehensionMetrics = {
    llmCalled: llmDispatches > 0,
    llmCallDuration: totalLlmDuration, // sum of per-sheet residue dispatch durations (metric fix)
    llmModel: llmDispatches > 0 ? 'claude-sonnet-4-6' : null,
    columnsInterpreted,
    columnsFromBindings: 0,
    columnsFromLLM: columnsInterpreted,
    averageConfidence: confCount > 0 ? confTotal / confCount : 0,
    crossSheetInsightCount: 0,
    timestamp: new Date().toISOString(),
  };
  return { metrics, perSheetFailure, provenance };
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

// OB-203 Phase 2 (Deviation 1) — the gate that distinguishes a currency suppression. It matches
// RICH semantic meaning (novel/LLM columns), never a bare structural role label. This is why
// suppressFalseCurrencyColumns fires on novel/LLM columns and NOT on atom-recognized columns:
// the latter carry `semanticMeaning = role` ('measure', 'identifier', …), which never matches.
const NON_MONETARY_MEASURE_PATTERNS = /capacity|count|volume|utilization|rate|quantity|units|loads|deliveries|incidents/i;
export function isNonMonetaryMeasureMeaning(semanticMeaning: string): boolean {
  return NON_MONETARY_MEASURE_PATTERNS.test(semanticMeaning);
}

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
    if (interp.columnRole === 'measure' && isNonMonetaryMeasureMeaning(interp.semanticMeaning)) {
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
