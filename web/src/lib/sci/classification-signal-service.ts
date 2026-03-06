// Classification Signal Service — SCI Spec Layer 6
// OB-160E — Signal capture, storage, and retrieval for the tenant flywheel
// Two-phase: prediction at analyze time → outcome written at confirm/execute time
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
// Writes to existing classification_signals table using signal_value JSONB
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
        signal_value: {
          source_file_name: payload.sourceFileName,
          sheet_name: payload.sheetName,
          structural_fingerprint: payload.fingerprint,
          classification: payload.classification,
          decision_source: payload.decisionSource,
          classification_trace: payload.classificationTrace,
          vocabulary_bindings: payload.vocabularyBindings,
          agent_scores: payload.agentScores,
          human_correction_from: payload.humanCorrectionFrom,
          scope: 'tenant',
        },
        confidence: payload.confidence,
        source: payload.humanCorrectionFrom ? 'user_corrected' : 'sci_agent',
        context: { sciVersion: '2.0', phase: 'E' },
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
): Promise<PriorSignal[]> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('classification_signals')
      .select('id, signal_value, confidence')
      .eq('tenant_id', tenantId)
      .eq('signal_type', 'sci:classification_outcome_v2')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data) {
      console.error('[SCI Signal] Prior lookup failed:', error?.message);
      return [];
    }

    return data
      .filter(row => {
        const sv = row.signal_value as Record<string, unknown>;
        const stored = sv?.structural_fingerprint as StructuralFingerprint | undefined;
        return stored && matchesFingerprint(stored, fingerprint);
      })
      .map(row => {
        const sv = row.signal_value as Record<string, unknown>;
        return {
          classification: sv.classification as string,
          confidence: row.confidence ?? 0,
          source: (sv.decision_source as string) ?? 'unknown',
          fingerprintMatch: true,
          signalId: row.id,
        };
      });
  } catch (err) {
    console.error('[SCI Signal] Prior lookup exception:', err);
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
// VOCABULARY BINDING RECALL — Wires Phase B's interface to DB
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
      .select('signal_value')
      .eq('tenant_id', tenantId)
      .eq('signal_type', 'sci:classification_outcome_v2')
      .not('signal_value->vocabulary_bindings', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error || !data?.length) {
      return new Map();
    }

    // Merge bindings from recent signals, most recent takes precedence
    const bindings = new Map<string, string>();
    for (const row of data.reverse()) {
      const sv = row.signal_value as Record<string, unknown>;
      const vb = sv?.vocabulary_bindings as Record<string, string> | null;
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
