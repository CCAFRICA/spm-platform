// HF-341 R6 — Classification resolver.
//
// The Level-2 CRR Bayesian posterior scorer (OB-161 / Decision 110) is DELETED.
// Structural scoring no longer decides a content unit's classification: the
// classification is now derived directly from the LLM's free-form expression
// (deriveClassificationFromExpression) — the per-column data_nature / identifies the
// model assessed. See expression-classifier.ts for the rationale and the HALT-CALC
// argument (byte-identical for every sheet the LLM recognized).
//
// resolveClassification keeps its name and its place in the pipeline, but its body
// is now: derive the classification from the expression, publish it as the unit's
// resolution, synthesize a single-winner score vector so the downstream proposal /
// human-review surface (split analysis, confidence display, semantic bindings) keeps
// working unchanged, and build the classification trace — now carrying the FULL
// expression (identifies + relationships), which the prior trace silently dropped.

import type {
  ContentProfile,
  AgentType,
  AgentScore,
} from './sci-types';
import type { SynapticIngestionState, ContentUnitResolution, ClassificationTrace } from './synaptic-ingestion-state';
import { deriveClassificationFromExpression } from './expression-classifier';

// The closed AgentType vocabulary, iterated to synthesize the score vector. `plan`
// is workbook-level (assigned by the HF-240 post-pass), never by per-sheet expression.
const ALL_CLASSES: AgentType[] = ['entity', 'target', 'transaction', 'reference', 'plan'];

// ============================================================
// RESOLVE CLASSIFICATION — expression-derived (R6)
// ============================================================

export function resolveClassification(state: SynapticIngestionState): void {
  for (const [unitId, profile] of Array.from(state.contentUnits.entries())) {
    const derived = deriveClassificationFromExpression(profile);

    // Synthesize a score vector from the single expression-derived winner. The
    // downstream proposal builder reads round2Scores for split analysis, confidence
    // warnings and `allScores` display; a clear single winner means analyzeSplit
    // never splits and resolveClaimsPhase1 (scores[0].agent) picks the derived class.
    const scores: AgentScore[] = ALL_CLASSES.map(agent => {
      const isWinner = agent === derived.classification;
      return {
        agent,
        confidence: isWinner ? derived.confidence : 0.05,
        signals: isWinner
          ? derived.matchedConditions.map(c => ({ signal: 'expression', weight: derived.confidence, evidence: c }))
          : [],
        reasoning: isWinner
          ? `Expression-derived: ${derived.matchedConditions.join(', ')}`
          : 'not derived from the expression',
      };
    });
    scores.sort((a, b) => b.confidence - a.confidence);

    state.round1Scores.set(unitId, scores.map(s => ({ ...s })));
    state.round2Scores.set(unitId, scores);

    const resolution: ContentUnitResolution = {
      classification: derived.classification,
      confidence: derived.confidence,
      decisionSource: 'expression',
      claimType: 'FULL',
      requiresHumanReview: false,
    };
    state.resolutions.set(unitId, resolution);

    const trace = initializeTrace(unitId, profile);
    trace.finalClassification = derived.classification;
    trace.finalConfidence = derived.confidence;
    trace.decisionSource = 'expression';
    state.traces.set(unitId, trace);
  }
}

// ============================================================
// TRACE INITIALIZATION
// ============================================================
// R6: the trace now carries the FULL expression — identifies and relationships, not
// just {characterization, data_nature, confidence}. findHcEntityIdColumn (commit) reads
// `identifies` from this trace to resolve the entity-id column; the prior narrowing
// dropped it, silently defeating the R4 entity-scope resolution.

function initializeTrace(unitId: string, profile: ContentProfile): ClassificationTrace {
  const headerComp = profile.headerComprehension;
  const hcData: ClassificationTrace['headerComprehension'] = headerComp ? {
    available: true,
    interpretations: Object.fromEntries(
      Array.from(headerComp.interpretations.entries()).map(([col, interp]) => [
        col,
        {
          characterization: interp.characterization,
          data_nature: interp.data_nature,
          identifies: interp.identifies,
          relationships: interp.relationships,
          confidence: interp.confidence,
        },
      ])
    ),
    crossSheetInsights: headerComp.crossSheetInsights,
    llmCalled: !headerComp.fromVocabularyBinding,
    llmDuration: headerComp.llmCallDuration,
    fromVocabularyBinding: headerComp.fromVocabularyBinding,
  } : null;

  return {
    contentUnitId: unitId,
    sheetName: profile.tabName,
    structuralProfile: {
      rowCount: profile.structure.rowCount,
      columnCount: profile.structure.columnCount,
      numericFieldRatio: profile.structure.numericFieldRatio,
      categoricalFieldRatio: profile.structure.categoricalFieldRatio,
      identifierRepeatRatio: profile.structure.identifierRepeatRatio,
      volumePattern: profile.patterns.volumePattern,
      hasTemporalColumns: profile.patterns.hasTemporalColumns,
      hasStructuralNameColumn: profile.patterns.hasStructuralNameColumn,
      hasEntityIdentifier: profile.patterns.hasEntityIdentifier,
    },
    headerComprehension: hcData,
    round1: [],
    signatureChecks: [],
    round2: [],
    priorSignals: [],
    finalClassification: '',
    finalConfidence: 0,
    decisionSource: '',
    requiresHumanReview: false,
  };
}
