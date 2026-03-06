// Classification Signal Service — SCI Spec Layer 6
// HF-092 — Corrected to use dedicated columns (not signal_value JSONB blob)
// Dev Plan v2 specification: indexed, queryable columns for scale.
// Structural fingerprints use bucketed values (Korean Test: no field names)
// Zero domain vocabulary. AP-31: presence-based only.

import { createClient } from '@supabase/supabase-js';
import type { ContentProfile } from './sci-types';
import type { ClassificationTrace } from './synaptic-ingestion-state';

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
// SIGNAL WRITE — Called at execute/confirm time
// Writes to DEDICATED COLUMNS on classification_signals (HF-092)
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
  vocabularyBindings: Record<string, string> | null;
  agentScores: Record<string, number>;
  humanCorrectionFrom: string | null;
}

export async function writeClassificationSignal(
  payload: ClassificationSignalPayload,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<string | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('classification_signals')
      .insert({
        tenant_id: payload.tenantId,
        signal_type: 'sci:classification_outcome_v2',
        source_file_name: payload.sourceFileName,
        sheet_name: payload.sheetName,
        structural_fingerprint: payload.fingerprint,
        classification: payload.classification,
        confidence: payload.confidence,
        decision_source: payload.decisionSource,
        classification_trace: payload.classificationTrace,
        vocabulary_bindings: payload.vocabularyBindings,
        agent_scores: payload.agentScores,
        human_correction_from: payload.humanCorrectionFrom,
        scope: 'tenant',
        source: payload.humanCorrectionFrom ? 'user_corrected' : 'sci_agent',
        context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
      })
      .select('id')
      .single();

    if (error) {
      console.error('[SCI Signal] Write failed:', error.message);
      return null;
    }

    return data?.id ?? null;
  } catch (err) {
    console.error('[SCI Signal] Write exception (non-blocking):', err);
    return null;
  }
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
function fingerprintToSignature(fp: StructuralFingerprint): string {
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

export async function recallVocabularyBindings(
  tenantId: string,
  columnHeaders: string[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<Map<string, string>> {
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

    // Merge bindings from recent signals, most recent takes precedence
    const bindings = new Map<string, string>();
    for (const row of data.reverse()) {
      const vb = row.vocabulary_bindings as Record<string, string> | null;
      if (vb && typeof vb === 'object') {
        for (const [header, meaning] of Object.entries(vb)) {
          if (columnHeaders.includes(header)) {
            bindings.set(header, meaning);
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
