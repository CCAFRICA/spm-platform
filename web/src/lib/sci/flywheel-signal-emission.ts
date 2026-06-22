/**
 * HF-239 Phase 0.2: Flywheel signal emission module.
 *
 * Extracted verbatim from execute/route.ts POST handler (lines 266-381).
 * Both routes (now: execute-bulk only after HF-239 Phase 3 deletion) call
 * this AFTER executePostCommitConstruction. Fire-and-forget: every internal
 * write is wrapped in .catch(() => {}) and the outer try/catch swallows
 * synchronous throws. Flywheel emission MUST NOT block import.
 *
 * Signals emitted per content unit:
 *   • writeClassificationSignal — HF-092 dedicated-columns canonical write
 *   • aggregateToFoundational    — OB-160I anonymized cross-tenant pattern
 *   • aggregateToDomain          — OB-160J industry-scoped pattern
 *   • writeFingerprint           — HF-181 / HF-236 enriched-bindings cache
 *
 * The execute-bulk transport model parses rows from Supabase Storage
 * server-side; unit.rawData is not present on bulk content units. The
 * caller can optionally provide a `rowsByContentUnitId` map (contentUnitId
 * → first 5 rows for fingerprint hash). When absent, fingerprint write
 * is skipped for that unit (other signals still emit).
 */

import { CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
import {
  aggregateToFoundational,
  aggregateToDomain,
  writeClassificationSignal,
} from './classification-signal-service';
import { writeFingerprint } from './fingerprint-flywheel';
import { computeFingerprintHashSync } from './structural-fingerprint';
import type { StructuralFingerprint } from './classification-signal-service';
import type { ClassificationTrace } from './synaptic-ingestion-state';
import type { VocabularyBindingValue } from './sci-types';

/**
 * Minimal shape required by the emitter. Both BulkContentUnit (execute-bulk)
 * and ContentUnitExecution (the legacy execute) satisfy this; the module
 * only reads the fields listed below.
 */
export interface FlywheelEmissionUnit {
  contentUnitId: string;
  confirmedClassification: string;
  confirmedBindings?: Array<{ sourceField: string; semanticRole: string }> | null;
  classificationTrace?: Record<string, unknown> | null;
  structuralFingerprint?: unknown;
  vocabularyBindings?: unknown;
  originalClassification?: string;
  originalConfidence?: number;
  sourceFile?: string;
  tabName?: string;
  rawData?: Record<string, unknown>[];
}

export interface EmitFlywheelSignalsParams {
  contentUnits: FlywheelEmissionUnit[];
  tenantId: string;
  tenantDomainId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  /**
   * Optional per-unit row sample for fingerprint hash. Keys are contentUnitId.
   * If a unit's rows are absent here AND unit.rawData is absent, the
   * fingerprint write step is skipped for that unit.
   */
  rowsByContentUnitId?: Map<string, Record<string, unknown>[]>;
}

export function emitFlywheelSignals(params: EmitFlywheelSignalsParams): void {
  const { contentUnits, tenantId, tenantDomainId, supabaseUrl, serviceRoleKey, rowsByContentUnitId } = params;

  try {
    for (const unit of contentUnits) {
      if (!unit.structuralFingerprint) continue;

      const originalClassification = unit.originalClassification || unit.confirmedClassification;
      const wasOverridden = originalClassification !== unit.confirmedClassification;
      const traceData = unit.classificationTrace as ClassificationTrace | undefined;

      const confidenceValue = wasOverridden ? 1.0 : (unit.originalConfidence || 0);

      // HF-254 Fix 3a (T1-E902): persist nature-bearing vocabulary_bindings from the trace
      // HC — {characterization, data_nature, confidence} per column, the full interpretation,
      // nothing narrowed. confidence is the LLM's emitted value (AP-7: never a constant).
      // Columns whose HC data_nature is absent/'unknown' are omitted (no fabrication). Falls back
      // to the legacy passthrough only when the trace carries no HC.
      const vocabHcInterps = (unit.classificationTrace as Record<string, unknown> | undefined)
        ?.headerComprehension as
          | { interpretations?: Record<string, { characterization?: string; data_nature?: string; identifies?: string; relationships?: string[]; confidence?: number }> }
          | undefined;
      const vocabInterpMap = vocabHcInterps?.interpretations ?? {};
      const natureBearingVocab: Record<string, VocabularyBindingValue> = {};
      for (const [col, interp] of Object.entries(vocabInterpMap)) {
        if (interp.data_nature && interp.data_nature !== 'unknown' && typeof interp.confidence === 'number') {
          natureBearingVocab[col] = {
            characterization: interp.characterization ?? 'unknown',
            data_nature: interp.data_nature,
            identifies: interp.identifies ?? 'unknown',
            relationships: interp.relationships ?? [],
            confidence: interp.confidence,
          };
        }
      }
      const vocabularyBindingsToWrite: Record<string, VocabularyBindingValue> | null =
        Object.keys(natureBearingVocab).length > 0
          ? natureBearingVocab
          : ((unit.vocabularyBindings as Record<string, VocabularyBindingValue> | null | undefined) ?? null);

      writeClassificationSignal({
        tenantId,
        sourceFileName: unit.sourceFile || '',
        sheetName: unit.tabName || '',
        fingerprint: unit.structuralFingerprint as unknown as StructuralFingerprint,
        classification: unit.confirmedClassification,
        confidence: confidenceValue,
        decisionSource: wasOverridden ? 'human_override' : (traceData?.decisionSource || 'heuristic'),
        classificationTrace: (traceData ?? ({} as unknown as ClassificationTrace)),
        vocabularyBindings: vocabularyBindingsToWrite,
        agentScores: traceData
          ? Object.fromEntries(traceData.round1.map(s => [s.agent, s.confidence]))
          : {},
        humanCorrectionFrom: wasOverridden ? originalClassification : null,
      }, supabaseUrl, serviceRoleKey).catch((err: unknown) => {
        if (err instanceof CanonicalWriteError) {
          console.warn(`[SCI flywheel] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
        } else {
          console.warn('[SCI flywheel] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
        }
      });

      const aggConfidence = wasOverridden ? 1.0 : (unit.originalConfidence || 0);
      aggregateToFoundational(
        unit.structuralFingerprint as unknown as StructuralFingerprint,
        unit.confirmedClassification,
        aggConfidence,
        supabaseUrl,
        serviceRoleKey,
      ).catch(() => {});

      aggregateToDomain(
        unit.structuralFingerprint as unknown as StructuralFingerprint,
        unit.confirmedClassification,
        aggConfidence,
        tenantDomainId,
        supabaseUrl,
        serviceRoleKey,
      ).catch(() => {});

      // HF-181 / HF-236 fingerprint write needs a row sample for hash recomputation.
      // Prefer caller-provided rowsByContentUnitId (execute-bulk parses from Storage);
      // fall back to unit.rawData when present (legacy execute path before deletion).
      const rowsForHash = rowsByContentUnitId?.get(unit.contentUnitId) ?? unit.rawData;
      if (
        unit.confirmedBindings && unit.confirmedBindings.length > 0
        && rowsForHash && rowsForHash.length > 0
      ) {
        const cols = Object.keys(rowsForHash[0]);
        const hash = computeFingerprintHashSync(cols, rowsForHash.slice(0, 5));
        // OB-231: holds binding.semanticRole (the SemanticRole vocabulary — NOT the retired
        // ColumnRole). Renamed for accuracy + to clear the ColumnRole token from the tree.
        const confirmedSemanticRoles: Record<string, string> = {};
        for (const binding of unit.confirmedBindings) {
          if (binding.sourceField && binding.semanticRole) {
            confirmedSemanticRoles[binding.sourceField] = binding.semanticRole;
          }
        }

        const hcInterps = (unit.classificationTrace as Record<string, unknown> | undefined)
          ?.headerComprehension as
            | { interpretations?: Record<string, { data_nature?: string; identifies?: string }> }
            | undefined;
        const interpMap = hcInterps?.interpretations ?? {};

        const enrichedFieldBindings = unit.confirmedBindings.map(b => {
          const interp = interpMap[b.sourceField];
          return {
            ...b,
            ...(interp?.data_nature ? { data_nature: interp.data_nature } : {}),
            ...(interp?.identifies ? { identifies: interp.identifies } : {}),
          };
        });

        writeFingerprint(
          tenantId,
          hash,
          {
            classification: unit.confirmedClassification,
            confidence: 1.0,
            fieldBindings: enrichedFieldBindings,
            tabName: unit.tabName || '',
          },
          confirmedSemanticRoles,
          unit.sourceFile || '',
          supabaseUrl,
          serviceRoleKey,
        ).catch(() => {});
      }
    }
  } catch {
    // Flywheel signal failure must NEVER block import.
  }
}
