// Classification Signal Service — SCI Spec Layer 6
// HF-092 — Corrected to use dedicated columns (not signal_value JSONB blob)
// Dev Plan v2 specification: indexed, queryable columns for scale.
// Structural fingerprints use bucketed values (Korean Test: no field names)
// Zero domain vocabulary. AP-31: presence-based only.

import { createClient } from '@supabase/supabase-js';
import type { ContentProfile, VocabularyBindingValue, ColumnRole, ComprehensionFailureClass, ContentUnitProposal } from './sci-types';
import type { ClassificationTrace } from './synaptic-ingestion-state';
import { writeSignal, type CanonicalSignalInput } from '@/lib/intelligence/canonical-signal-writer';

// ============================================================
// OB-203 Phase 1 (DI-4) — STRUCTURED COMPREHENSION-FAILURE SURFACE
//
// At a comprehension boundary that fails, write ONE durable signal per affected unit
// on the SAME canonical surface (classification_signals, via writeSignal — G7/DI-6).
// The silent heuristic fallback (header-comprehension.ts) is thereby retired: a failed
// unit now occupies a named, queryable state (`failed_interpretation`) instead of being
// presented as if comprehended (DS-027 §1 / T1-E910). Fire-and-forget with loud error
// logging — a signal-write failure NEVER breaks the import (DI-1).
//
// Payload via existing dedicated columns: source_file_name, sheet_name,
// structural_fingerprint, confidence (0), decision_source ('failed_interpretation');
// failure class / duration / attempted tier ride signal_value + context.
// ============================================================

export interface ComprehensionFailureParams {
  tenantId: string;
  sourceFileName: string;
  sheetName: string;
  fingerprintHash: string | null;
  failureClass: ComprehensionFailureClass;
  durationMs: number | null;
  attemptedTier: number | null;
}

/**
 * Pure builder for the `failed_interpretation` canonical-signal input (testable without
 * a DB). Existing dedicated columns carry file/sheet/fingerprint/confidence/decision_source;
 * the failure class / duration / attempted tier ride signal_value.
 */
export function buildFailedInterpretationSignalInput(params: ComprehensionFailureParams): CanonicalSignalInput {
  return {
    tenantId: params.tenantId,
    signalType: 'comprehension:failed_interpretation',
    sourceFileName: params.sourceFileName,
    sheetName: params.sheetName,
    structuralFingerprint: params.fingerprintHash ? { fingerprintHash: params.fingerprintHash } : null,
    classification: null,
    confidence: 0,
    decisionSource: 'failed_interpretation',
    classificationTrace: null,
    vocabularyBindings: null,
    agentScores: {},
    humanCorrectionFrom: null,
    scope: 'tenant',
    source: 'sci_agent',
    signalValue: {
      failureClass: params.failureClass,
      durationMs: params.durationMs,
      attemptedTier: params.attemptedTier,
    },
    context: { sciVersion: '2.0', phase: '1', ob: 'OB-203', boundary: 'header_comprehension' },
    calculationRunId: null,
  };
}

export async function writeComprehensionFailureSignal(
  params: ComprehensionFailureParams,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  await writeSignal(buildFailedInterpretationSignalInput(params), supabaseUrl, supabaseServiceKey);
}

/**
 * Pure marker (testable): stamp `failedInterpretation` on EXACTLY the units whose sheet is
 * in `failedSheets`; all other units are returned untouched (success-path preservation —
 * the proposal payload for comprehended units is byte-identical to pre-OB). Mutates in place
 * and returns the array for convenience. Called from both SCI routes (DRY, DI-4).
 */
export function markFailedInterpretationUnits(
  units: ContentUnitProposal[],
  failedSheets: Set<string>,
  failure: { failureClass: ComprehensionFailureClass; durationMs: number } | null | undefined,
): ContentUnitProposal[] {
  if (!failure || failedSheets.size === 0) return units;
  for (const u of units) {
    if (failedSheets.has(u.tabName)) {
      u.failedInterpretation = { failureClass: failure.failureClass, durationMs: failure.durationMs };
    }
  }
  return units;
}

/**
 * OB-203 Phase 1 — emit one `failed_interpretation` signal per affected unit when a
 * comprehension boundary fails. Returns the set of failed sheet names so the route can
 * mark the proposal units. Each write is independently try/caught (loud log, never throws)
 * so a signal failure cannot break the import (DI-1). Called from BOTH SCI routes (analyze
 * + process-job) so no silent fallback path survives (DI-4).
 */
export async function emitComprehensionFailureSignals(
  failure: { failureClass: ComprehensionFailureClass; durationMs: number } | null | undefined,
  affectedSheets: Array<{ sheetName: string }>,
  fingerprintHashOf: (sheetName: string) => string | null,
  tierOf: (sheetName: string) => number | null,
  ctx: { tenantId: string; sourceFileName: string },
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<Set<string>> {
  const failed = new Set<string>();
  if (!failure) return failed;
  for (const s of affectedSheets) {
    failed.add(s.sheetName);
    try {
      await writeComprehensionFailureSignal(
        {
          tenantId: ctx.tenantId,
          sourceFileName: ctx.sourceFileName,
          sheetName: s.sheetName,
          fingerprintHash: fingerprintHashOf(s.sheetName),
          failureClass: failure.failureClass,
          durationMs: failure.durationMs,
          attemptedTier: tierOf(s.sheetName),
        },
        supabaseUrl,
        supabaseServiceKey,
      );
    } catch (e) {
      console.error(
        `[OB-203][failed_interpretation] signal write FAILED (non-blocking) sheet=${s.sheetName}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  console.log(
    `[OB-203] failed_interpretation: emitted ${failed.size} signal(s) class=${failure.failureClass} duration=${failure.durationMs}ms file=${ctx.sourceFileName}`,
  );
  return failed;
}

// ============================================================
// STRUCTURAL FINGERPRINT — Bucketed values for fuzzy matching
// ============================================================

export interface StructuralFingerprint {
  columnCount: number;
  numericFieldRatioBucket: string;      // '0-25' | '25-50' | '50-75' | '75-100'
  categoricalFieldRatioBucket: string;
  identifierRepeatBucket: string;       // '0-1' | '1-2' | '2-5' | '5-10' | '10+'
  hasTemporalColumns: boolean;
  hasIdentifier: boolean;
  hasStructuralName: boolean;
  rowCountBucket: string;               // 'small' | 'medium' | 'large' | 'enterprise'
}

export function computeStructuralFingerprint(profile: ContentProfile): StructuralFingerprint {
  const bucketRatio = (r: number): string => {
    if (r < 0.25) return '0-25';
    if (r < 0.50) return '25-50';
    if (r < 0.75) return '50-75';
    return '75-100';
  };

  const bucketRepeat = (r: number): string => {
    if (r <= 1) return '0-1';
    if (r <= 2) return '1-2';
    if (r <= 5) return '2-5';
    if (r <= 10) return '5-10';
    return '10+';
  };

  const bucketRows = (n: number): string => {
    if (n < 50) return 'small';
    if (n < 500) return 'medium';
    if (n < 5000) return 'large';
    return 'enterprise';
  };

  return {
    columnCount: profile.structure.columnCount,
    numericFieldRatioBucket: bucketRatio(profile.structure.numericFieldRatio),
    categoricalFieldRatioBucket: bucketRatio(profile.structure.categoricalFieldRatio),
    identifierRepeatBucket: bucketRepeat(profile.structure.identifierRepeatRatio),
    hasTemporalColumns: profile.patterns.hasTemporalColumns,
    hasIdentifier: profile.patterns.hasEntityIdentifier,
    hasStructuralName: profile.patterns.hasStructuralNameColumn,
    rowCountBucket: bucketRows(profile.structure.rowCount),
  };
}

// ============================================================
// OB-199 Phase 4 supplement A (Row 8-sub-A disposition — AUD-007 closure):
//
// `writeClassificationSignal` RESTORED as a thin facade over the DS-023 §5.1
// canonical writer. The facade re-establishes function-level enforcement of
// the four SCI structural commitments that AUD-007 surfaced as eroded under
// the inline migration:
//
//   1. signalType: 'classification:outcome'
//   2. scope:     'tenant'
//   3. source:    'user_corrected' when humanCorrectionFrom is non-null, else 'sci_agent'
//   4. context:   { sciVersion: '2.0', phase: 'E', schema: 'HF-092' }
//
// DS-023 §5.1 single-entry-point preserved: the facade delegates to writeSignal;
// it carries NO independent insert path. The dual-architecture defect closed in
// Phase 4 remains closed — `canonical-signal-writer.ts` is still the singular
// `.from('classification_signals').insert(...)` surface.
//
// `CanonicalWriteError` propagates from writeSignal to caller. Returns void
// because callers exclusively consume `.catch` (per-module tag + cause
// discriminator pattern at the 5 SCI sites; AUD-001 F-003 closure semantics).
// ============================================================

export interface ClassificationSignalPayload {
  tenantId: string;
  sourceFileName: string;
  sheetName: string;
  fingerprint: StructuralFingerprint;
  classification: string;
  confidence: number;
  decisionSource: string;
  classificationTrace: ClassificationTrace;
  // HF-254 Fix 3a: role-bearing ({semanticMeaning, columnRole, confidence}) or legacy string.
  vocabularyBindings: Record<string, VocabularyBindingValue> | null;
  agentScores: Record<string, number>;
  humanCorrectionFrom: string | null;
  calculationRunId?: string;
}

export async function writeClassificationSignal(
  payload: ClassificationSignalPayload,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  await writeSignal(
    {
      tenantId: payload.tenantId,
      signalType: 'classification:outcome',
      sourceFileName: payload.sourceFileName,
      sheetName: payload.sheetName,
      structuralFingerprint: payload.fingerprint as unknown as Record<string, unknown>,
      classification: payload.classification,
      confidence: payload.confidence,
      decisionSource: payload.decisionSource,
      classificationTrace: payload.classificationTrace as unknown as Record<string, unknown>,
      vocabularyBindings: payload.vocabularyBindings,
      agentScores: payload.agentScores,
      humanCorrectionFrom: payload.humanCorrectionFrom,
      scope: 'tenant',
      source: payload.humanCorrectionFrom ? 'user_corrected' : 'sci_agent',
      context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
      calculationRunId: payload.calculationRunId ?? null,
    },
    supabaseUrl,
    supabaseServiceKey,
  );
}

// ============================================================
// PRIOR SIGNAL LOOKUP — Called BEFORE scoring
// Queries DEDICATED COLUMNS, not signal_value JSONB (HF-092)
// ============================================================

export interface PriorSignal {
  classification: string;
  confidence: number;
  source: string;
  fingerprintMatch: boolean;
  signalId: string;
}

export async function lookupPriorSignals(
  tenantId: string,
  fingerprint: StructuralFingerprint,
  supabaseUrl: string,
  supabaseServiceKey: string,
  domainId?: string,
): Promise<PriorSignal[]> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('classification_signals')
      .select('id, classification, confidence, decision_source, structural_fingerprint')
      .eq('tenant_id', tenantId)
      .eq('scope', 'tenant')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data) {
      console.error('[SCI Signal] Prior lookup failed:', error?.message);
      return [];
    }

    const tenantPriors = data
      .filter(row => {
        const stored = row.structural_fingerprint as StructuralFingerprint | null;
        return stored && matchesFingerprint(stored, fingerprint);
      })
      .map(row => ({
        classification: row.classification as string,
        confidence: row.confidence ?? 0,
        source: (row.decision_source as string) ?? 'unknown',
        fingerprintMatch: true,
        signalId: row.id,
      }));

    if (tenantPriors.length > 0) {
      return tenantPriors;
    }

    // OB-160J: Domain fallback — industry-specific structural patterns
    if (domainId) {
      const domainPriors = await lookupDomainPriors(fingerprint, domainId, supabaseUrl, supabaseServiceKey);
      if (domainPriors.length > 0) return domainPriors;
    }

    // OB-160I: Foundational fallback — cross-tenant structural patterns
    // Only queried when no tenant or domain priors exist (cold start)
    return await lookupFoundationalPriors(fingerprint, supabaseUrl, supabaseServiceKey);
  } catch (err) {
    console.error('[SCI Signal] Prior lookup exception:', err);
    return [];
  }
}

/**
 * OB-160I: Query foundational_patterns for cross-tenant structural priors.
 * Returns PriorSignal[] with source='foundational' for lower boost (+0.05 vs +0.10).
 * Only structural fingerprint + classification outcome — zero tenant-identifiable info.
 */
async function lookupFoundationalPriors(
  fingerprint: StructuralFingerprint,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<PriorSignal[]> {
  try {
    const sig = fingerprintToSignature(fingerprint);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('foundational_patterns')
      .select('id, pattern_signature, confidence_mean, total_executions, learned_behaviors')
      .eq('pattern_signature', sig)
      .maybeSingle();

    if (error || !data) return [];

    const row = data as { id: string; pattern_signature: string; confidence_mean: number; total_executions: number; learned_behaviors: Record<string, unknown> | null };
    if (row.total_executions < 3) return []; // Require minimum evidence

    // Extract the most common classification from learned_behaviors
    const behaviors = row.learned_behaviors ?? {};
    const dist = (behaviors.classification_distribution as Record<string, number>) ?? {};
    const entries = Object.entries(dist);
    if (entries.length === 0) return [];

    entries.sort((a, b) => b[1] - a[1]);
    const [topClassification, topCount] = entries[0];
    const total = entries.reduce((sum, [, c]) => sum + c, 0);
    const accuracy = topCount / total;

    // Only return if the pattern is consistently classified (>= 60% agreement)
    if (accuracy < 0.60) return [];

    return [{
      classification: topClassification,
      confidence: row.confidence_mean * accuracy,
      source: 'foundational',
      fingerprintMatch: true,
      signalId: row.id,
    }];
  } catch {
    return [];
  }
}

/**
 * OB-160J: Query domain_patterns for industry-specific structural priors.
 * Returns PriorSignal[] with source='domain' for medium boost (+0.07).
 * Sharper than foundational because domain-specific patterns have higher signal.
 */
async function lookupDomainPriors(
  fingerprint: StructuralFingerprint,
  domainId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<PriorSignal[]> {
  try {
    const sig = fingerprintToSignature(fingerprint);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('domain_patterns')
      .select('id, pattern_signature, confidence_mean, total_executions, learned_behaviors')
      .eq('pattern_signature', sig)
      .eq('domain_id', domainId)
      .maybeSingle();

    if (error || !data) return [];

    const row = data as { id: string; confidence_mean: number; total_executions: number; learned_behaviors: Record<string, unknown> | null };
    if (row.total_executions < 3) return [];

    const behaviors = row.learned_behaviors ?? {};
    const dist = (behaviors.classification_distribution as Record<string, number>) ?? {};
    const entries = Object.entries(dist);
    if (entries.length === 0) return [];

    entries.sort((a, b) => b[1] - a[1]);
    const [topClassification, topCount] = entries[0];
    const total = entries.reduce((sum, [, c]) => sum + c, 0);
    const accuracy = topCount / total;

    if (accuracy < 0.60) return [];

    return [{
      classification: topClassification,
      confidence: row.confidence_mean * accuracy,
      source: 'domain',
      fingerprintMatch: true,
      signalId: row.id,
    }];
  } catch {
    return [];
  }
}

function matchesFingerprint(
  stored: StructuralFingerprint,
  current: StructuralFingerprint,
): boolean {
  return (
    stored.numericFieldRatioBucket === current.numericFieldRatioBucket &&
    stored.categoricalFieldRatioBucket === current.categoricalFieldRatioBucket &&
    stored.identifierRepeatBucket === current.identifierRepeatBucket &&
    stored.hasTemporalColumns === current.hasTemporalColumns &&
    stored.hasIdentifier === current.hasIdentifier &&
    stored.rowCountBucket === current.rowCountBucket
  );
}

// ============================================================
// CLASSIFICATION DENSITY — Adaptive execution for SCI
// OB-160K: "The system does less work as it gets smarter"
// ============================================================

export type SCIExecutionMode = 'full_analysis' | 'light_analysis' | 'confident';

export interface ClassificationDensity {
  fingerprint: StructuralFingerprint;
  confidence: number;
  totalClassifications: number;
  lastOverrideRate: number;
  executionMode: SCIExecutionMode;
}

/**
 * OB-160K: Compute classification density for a structural fingerprint.
 * Queries recent classification_signals for this tenant + fingerprint.
 * Returns density with execution mode determination.
 *
 * Thresholds:
 * - full_analysis:  confidence < 0.70 OR totalClassifications < 5 OR overrideRate > 0.20
 * - light_analysis: confidence 0.70-0.90 AND totalClassifications >= 5 AND overrideRate <= 0.20
 * - confident:      confidence > 0.90 AND totalClassifications >= 10 AND overrideRate <= 0.05
 */
export async function computeClassificationDensity(
  tenantId: string,
  fingerprint: StructuralFingerprint,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<ClassificationDensity> {
  const defaultDensity: ClassificationDensity = {
    fingerprint,
    confidence: 0,
    totalClassifications: 0,
    lastOverrideRate: 0,
    executionMode: 'full_analysis',
  };

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('classification_signals')
      .select('id, classification, confidence, decision_source, structural_fingerprint')
      .eq('tenant_id', tenantId)
      .eq('scope', 'tenant')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) return defaultDensity;

    // Filter to matching fingerprints
    const matching = data.filter(row => {
      const stored = row.structural_fingerprint as StructuralFingerprint | null;
      return stored && matchesFingerprint(stored, fingerprint);
    });

    if (matching.length === 0) return defaultDensity;

    // Compute metrics
    const totalClassifications = matching.length;
    const avgConfidence = matching.reduce((sum, r) => sum + ((r.confidence as number) ?? 0), 0) / totalClassifications;
    const overrides = matching.filter(r => r.decision_source === 'human_override').length;
    const overrideRate = overrides / totalClassifications;

    // Determine execution mode
    let executionMode: SCIExecutionMode = 'full_analysis';
    if (avgConfidence > 0.90 && totalClassifications >= 10 && overrideRate <= 0.05) {
      executionMode = 'confident';
    } else if (avgConfidence >= 0.70 && totalClassifications >= 5 && overrideRate <= 0.20) {
      executionMode = 'light_analysis';
    }

    return {
      fingerprint,
      confidence: avgConfidence,
      totalClassifications,
      lastOverrideRate: overrideRate,
      executionMode,
    };
  } catch {
    return defaultDensity;
  }
}

// ============================================================
// FOUNDATIONAL AGGREGATION — Cross-tenant anonymized patterns
// OB-160I: Wire SCI classification signals to flywheel
// ============================================================

/**
 * Hash a structural fingerprint into a deterministic pattern_signature string.
 * Used as the key in foundational_patterns and domain_patterns tables.
 */
export function fingerprintToSignature(fp: StructuralFingerprint): string {
  return `sci:${fp.columnCount}:${fp.numericFieldRatioBucket}:${fp.categoricalFieldRatioBucket}:${fp.identifierRepeatBucket}:${fp.hasTemporalColumns ? 1 : 0}:${fp.hasIdentifier ? 1 : 0}:${fp.hasStructuralName ? 1 : 0}:${fp.rowCountBucket}`;
}

/**
 * Aggregate a classification signal into foundational_patterns.
 * PRIVACY: Strips tenant_id, file names, sheet names.
 * Retains ONLY: structural fingerprint signature + classification + confidence.
 * Fire-and-forget — failure must never block signal write.
 *
 * OB-160I: Connects SCI classification pipeline to Flywheel 2.
 */
export async function aggregateToFoundational(
  fingerprint: StructuralFingerprint,
  classification: string,
  confidence: number,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const sig = fingerprintToSignature(fingerprint);

    const { data: existing } = await supabase
      .from('foundational_patterns')
      .select('id, confidence_mean, total_executions, tenant_count, learned_behaviors')
      .eq('pattern_signature', sig)
      .maybeSingle();

    if (existing) {
      // EMA update (weight 0.1 = recent signal has 10% influence)
      const newConfidence = existing.confidence_mean * 0.9 + confidence * 0.1;
      const behaviors = (existing.learned_behaviors as Record<string, unknown>) ?? {};
      const dist = (behaviors.classification_distribution as Record<string, number>) ?? {};
      dist[classification] = (dist[classification] ?? 0) + 1;

      await supabase
        .from('foundational_patterns')
        .update({
          confidence_mean: newConfidence,
          total_executions: existing.total_executions + 1,
          learned_behaviors: { ...behaviors, classification_distribution: dist },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('foundational_patterns')
        .insert({
          pattern_signature: sig,
          confidence_mean: confidence,
          total_executions: 1,
          tenant_count: 1,
          anomaly_rate_mean: 0,
          learned_behaviors: {
            classification_distribution: { [classification]: 1 },
          },
        });
    }
  } catch {
    // Fire-and-forget — aggregation failure must never block the signal pipeline
  }
}

/**
 * Aggregate a classification signal into domain_patterns.
 * Same privacy guarantees as foundational. Additionally keyed by domainId.
 * OB-160J: Connects SCI classification pipeline to Flywheel 3.
 */
export async function aggregateToDomain(
  fingerprint: StructuralFingerprint,
  classification: string,
  confidence: number,
  domainId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  if (!domainId) return; // No domain tag → skip domain aggregation

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const sig = fingerprintToSignature(fingerprint);

    const { data: existing } = await supabase
      .from('domain_patterns')
      .select('id, confidence_mean, total_executions, tenant_count, learned_behaviors')
      .eq('pattern_signature', sig)
      .eq('domain_id', domainId)
      .maybeSingle();

    if (existing) {
      const newConfidence = existing.confidence_mean * 0.9 + confidence * 0.1;
      const behaviors = (existing.learned_behaviors as Record<string, unknown>) ?? {};
      const dist = (behaviors.classification_distribution as Record<string, number>) ?? {};
      dist[classification] = (dist[classification] ?? 0) + 1;

      await supabase
        .from('domain_patterns')
        .update({
          confidence_mean: newConfidence,
          total_executions: existing.total_executions + 1,
          learned_behaviors: { ...behaviors, classification_distribution: dist },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('domain_patterns')
        .insert({
          pattern_signature: sig,
          domain_id: domainId,
          confidence_mean: confidence,
          total_executions: 1,
          tenant_count: 1,
          learned_behaviors: {
            classification_distribution: { [classification]: 1 },
          },
        });
    }
  } catch {
    // Fire-and-forget
  }
}

// ============================================================
// VOCABULARY BINDING RECALL — Queries DEDICATED COLUMN (HF-092)
// ============================================================

// HF-254 Fix 3a: recalled binding carries the full interpretation when the persisted
// row is role-bearing. A legacy string-shaped row yields columnRole=null (NO fabrication
// — a recalled meaning string cannot manufacture a role), so the lexical prior (Phase 6)
// contributes nothing for it.
export interface RecalledVocabularyBinding {
  semanticMeaning: string;
  columnRole: ColumnRole | null;
  confidence: number | null;
}

export async function recallVocabularyBindings(
  tenantId: string,
  columnHeaders: string[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<Map<string, RecalledVocabularyBinding>> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('classification_signals')
      .select('vocabulary_bindings')
      .eq('tenant_id', tenantId)
      .not('vocabulary_bindings', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error || !data?.length) {
      return new Map();
    }

    // Merge bindings from recent signals, most recent takes precedence.
    const bindings = new Map<string, RecalledVocabularyBinding>();
    for (const row of data.reverse()) {
      const vb = row.vocabulary_bindings as Record<string, VocabularyBindingValue> | null;
      if (vb && typeof vb === 'object') {
        for (const [header, value] of Object.entries(vb)) {
          if (!columnHeaders.includes(header)) continue;
          if (typeof value === 'string') {
            // Legacy meaning-only row — role-less, contributes nothing to the role prior.
            bindings.set(header, { semanticMeaning: value, columnRole: null, confidence: null });
          } else if (value && typeof value === 'object') {
            bindings.set(header, {
              semanticMeaning: value.semanticMeaning ?? 'unknown',
              columnRole: value.columnRole ?? null,
              confidence: typeof value.confidence === 'number' ? value.confidence : null,
            });
          }
        }
      }
    }

    return bindings;
  } catch (err) {
    console.error('[SCI Signal] Vocabulary recall exception:', err);
    return new Map();
  }
}

// ============================================================
// HF-254 Fix 3b: LEXICAL CLASSIFICATION PRIOR (additive, non-gating)
// ============================================================
//
// Sibling of lookupPriorSignals (structural fingerprint prior). Recalls role-bearing
// vocabulary_bindings for the sheet's columns and derives a classification from the
// recalled columnRole DISTRIBUTION — NOT by matching column-name strings (Korean Test).
// Returns PriorSignal[] in the SAME shape lookupPriorSignals returns, so it flows through
// the identical additive contribution path (resolver extractClassificationSignals ->
// sourceType 'prior_signal' -> Bayesian posterior). By construction it is additive only:
// it produces a prior signal and nothing else — it never early-returns a decision, never
// skips the LLM, never narrows persistence, and never caps competing agents.
//
// A legacy string-shaped (role-less) recalled binding contributes nothing (columnRole is
// null — a recalled meaning cannot manufacture a role; AP-7 / no fabrication). The
// contributed confidence is the mean of the recalled bindings' own (LLM-emitted)
// confidences — never a constant.
export async function lookupLexicalPrior(
  tenantId: string,
  columnHeaders: string[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<PriorSignal[]> {
  const recalled = await recallVocabularyBindings(tenantId, columnHeaders, supabaseUrl, supabaseServiceKey);
  if (recalled.size === 0) return [];

  let measure = 0, temporal = 0, identifier = 0, name = 0;
  const confidences: number[] = [];
  for (const b of Array.from(recalled.values())) {
    if (!b.columnRole) continue; // legacy/role-less binding contributes nothing
    if (typeof b.confidence === 'number') confidences.push(b.confidence);
    switch (b.columnRole) {
      case 'measure': measure++; break;
      case 'temporal': temporal++; break;
      case 'identifier': identifier++; break;
      case 'name': name++; break;
      default: break;
    }
  }
  if (confidences.length === 0) return [];

  // Role-distribution → classification (structural, language-agnostic).
  // measure + temporal ⇒ transaction; identifier + name with no measure ⇒ entity.
  // Any other distribution contributes no lexical prior (let structural arms decide).
  let classification: string | null = null;
  if (measure > 0 && temporal > 0) classification = 'transaction';
  else if (identifier > 0 && name > 0 && measure === 0) classification = 'entity';
  if (!classification) return [];

  const confidence = confidences.reduce((a, c) => a + c, 0) / confidences.length;
  return [{
    classification,
    confidence,
    source: 'lexical',
    fingerprintMatch: false,
    signalId: 'lexical_vocabulary_prior',
  }];
}
