// Synaptic Content Ingestion — Synaptic Ingestion State
// OB-160C Phase 1 — In-memory shared state for one import session.
// All scoring, negotiation, and resolution flow through this object.
// Ephemeral: lives for the duration of one import.
// ClassificationTrace extracted from it IS stored in Phase E.

import type {
  ContentProfile,
  AgentType,
  AgentScore,
  NegotiationResult,
  NegotiationLogEntry,
  ContentUnitProposal,
} from './sci-types';
import type { SignatureMatch } from './signatures';
import { detectSignatures } from './signatures';
import { computeAdditiveScores, applyHeaderComprehensionSignals, resolveClaimsPhase1, requiresHumanReview } from './agents';
import { computeFieldAffinities, analyzeSplit, generatePartialBindings } from './negotiation';
import { generateProposalIntelligence } from './proposal-intelligence';
import { checkPromotedPatterns } from './promoted-patterns';
import { computeStructuralFingerprint, fingerprintToSignature } from './classification-signal-service';
import type { PriorSignal } from './classification-signal-service';
import type { EntityIdOverlap } from './tenant-context';

// ============================================================
// SYNAPTIC INGESTION STATE
// ============================================================

export interface SynapticIngestionState {
  // Input
  sessionId: string;
  tenantId: string;
  sourceFileName: string;

  // Content units (one per sheet)
  contentUnits: Map<string, ContentProfile>;

  // Scoring state (populated during classification)
  round1Scores: Map<string, AgentScore[]>;
  signatureMatches: Map<string, SignatureMatch[]>;
  round2Scores: Map<string, AgentScore[]>;

  // Resolution (populated after scoring)
  resolutions: Map<string, ContentUnitResolution>;

  // Prior signals from flywheel (populated by Phase E before scoring)
  priorSignals: Map<string, PriorSignal[]>;

  // OB-160L: Promoted patterns from foundational signals (loaded once before scoring)
  promotedPatterns?: Map<string, import('./promoted-patterns').PromotedPattern>;

  // HF-183: Entity ID overlap per content unit (computed before classification)
  entityIdOverlaps?: Map<string, EntityIdOverlap>;

  // Classification traces (one per content unit — THE FLYWHEEL'S RAW MATERIAL)
  traces: Map<string, ClassificationTrace>;
}

// ============================================================
// CONTENT UNIT RESOLUTION
// ============================================================

export interface ContentUnitResolution {
  classification: AgentType;
  confidence: number;
  decisionSource: 'signature' | 'heuristic' | 'llm' | 'prior_signal' | 'human_override' | 'hc_pattern';
  claimType: 'FULL' | 'PARTIAL';
  fieldAssignments?: Map<string, AgentType>;  // Phase H: field → claiming agent
  sharedFields?: string[];                     // Phase H: fields needed by multiple agents
  requiresHumanReview: boolean;
}

// ============================================================
// CLASSIFICATION TRACE
// Records EVERY step of the scoring process.
// Debugging tool AND flywheel raw material.
// ============================================================

export interface ClassificationTrace {
  contentUnitId: string;
  sheetName: string;

  // Phase A: Structural observations
  structuralProfile: {
    rowCount: number;
    columnCount: number;
    numericFieldRatio: number;
    categoricalFieldRatio: number;
    identifierRepeatRatio: number;
    volumePattern: string;
    hasTemporalColumns: boolean;
    hasStructuralNameColumn: boolean;
    hasEntityIdentifier: boolean;
  };

  // Phase B: Header comprehension
  headerComprehension: {
    available: boolean;
    interpretations: Record<string, { semanticMeaning: string; columnRole: string; confidence: number }>;
    crossSheetInsights: string[];
    llmCalled: boolean;
    llmDuration: number | null;
    fromVocabularyBinding: boolean;
  } | null;

  // Phase C: Scoring
  round1: {
    agent: string;
    confidence: number;
    signals: { signal: string; weight: number; evidence: string }[];
  }[];

  signatureChecks: {
    signatureName: string;
    conditions: { name: string; value: unknown; passed: boolean }[];
    matched: boolean;
    confidenceFloor: number | null;
  }[];

  round2: {
    agent: string;
    adjustment: number;
    reason: string;
    evidenceProperty: string;
    evidenceValue: unknown;
  }[];

  // Phase E: Prior signals (populated later)
  priorSignals: {
    classification: string;
    confidence: number;
    source: string;
  }[];

  // Final result
  finalClassification: string;
  finalConfidence: number;
  decisionSource: string;
  requiresHumanReview: boolean;
}

// ============================================================
// STATE CREATION
// ============================================================

export function createIngestionState(
  tenantId: string,
  sourceFileName: string,
  profiles: Map<string, ContentProfile>,
): SynapticIngestionState {
  return {
    sessionId: crypto.randomUUID(),
    tenantId,
    sourceFileName,
    contentUnits: profiles,
    round1Scores: new Map(),
    signatureMatches: new Map(),
    round2Scores: new Map(),
    resolutions: new Map(),
    priorSignals: new Map(),
    traces: new Map(),
  };
}

// ============================================================
// CONSOLIDATED SCORING PIPELINE (Phase C)
// Single entry point: signatures → additive → signature floors →
// header comprehension → Round 2 → field affinity → resolution
// ============================================================

const ACTION_DESCRIPTIONS: Record<AgentType, string> = {
  plan: 'Interpret as rule definitions and create/update plan configuration',
  entity: 'Create or update entity records from roster data',
  target: 'Commit performance targets and wire through convergence',
  transaction: 'Commit event data for calculation processing',
  reference: 'Store as reference/catalog data for lookup resolution',
};

export function classifyContentUnits(state: SynapticIngestionState): void {
  for (const [unitId, profile] of Array.from(state.contentUnits.entries())) {
    const trace = initializeTrace(unitId, profile);
    const log: NegotiationLogEntry[] = [];

    // STEP 1: Composite signatures
    const signatures = detectSignatures(profile);
    trace.signatureChecks = signatures.map(s => ({
      signatureName: s.signatureName,
      conditions: s.matchedConditions.map(c => ({ name: c, value: true, passed: true })),
      matched: true,
      confidenceFloor: s.confidence,
    }));
    state.signatureMatches.set(unitId, signatures);

    // STEP 2: Additive scoring with signature floors (Round 1)
    const scores = computeAdditiveScores(profile);

    // STEP 2.5: OB-160L — Apply promoted patterns from foundational signals
    if (state.promotedPatterns && state.promotedPatterns.size > 0) {
      const fingerprint = computeStructuralFingerprint(profile);
      const sig = fingerprintToSignature(fingerprint);
      const promoted = checkPromotedPatterns(sig, state.promotedPatterns);
      if (promoted) {
        const agentScore = scores.find(s => s.agent === promoted.agent);
        if (agentScore && agentScore.confidence < promoted.confidence) {
          agentScore.confidence = promoted.confidence;
          agentScore.signals.unshift({
            signal: `promoted:${promoted.patternSignature}`,
            weight: promoted.confidence,
            evidence: `Promoted pattern: ${promoted.evidence.signalCount} signals, ${Math.round(promoted.evidence.accuracy * 100)}% accuracy across ${promoted.evidence.tenantCount} tenants`,
          });
        }
      }
    }

    trace.round1 = scores.map(s => ({
      agent: s.agent,
      confidence: s.confidence,
      signals: s.signals.map(sig => ({ signal: sig.signal, weight: sig.weight, evidence: sig.evidence })),
    }));

    // STEP 3: Header comprehension signals (ADDITIVE — when null, scoring works on structural signals only)
    applyHeaderComprehensionSignals(scores, profile);

    // STEP 3.5: Prior signal boost (Phase E — flywheel data)
    const unitPriors = state.priorSignals.get(unitId) ?? [];
    if (unitPriors.length > 0) {
      // Use the most recent, highest-confidence prior signal
      const bestPrior = unitPriors.reduce((best, s) =>
        s.confidence > best.confidence ? s : best
      );
      const matchingAgent = scores.find(s => s.agent === bestPrior.classification);
      if (matchingAgent) {
        // OB-160I: Three-scope boost hierarchy
        // Human override: +0.15, Tenant prior: +0.10, Domain prior: +0.07, Foundational prior: +0.05
        const boost = bestPrior.source === 'human_override' || bestPrior.source === 'user_corrected'
          ? 0.15
          : bestPrior.source === 'foundational' ? 0.05
          : bestPrior.source === 'domain' ? 0.07
          : 0.10;
        matchingAgent.confidence = Math.max(0, Math.min(1, matchingAgent.confidence + boost));
        matchingAgent.signals.push({
          signal: 'prior_signal_match',
          weight: boost,
          evidence: `Prior import classified similar content as ${bestPrior.classification} at ${Math.round(bestPrior.confidence * 100)}% (${bestPrior.source})`,
        });
      }
      trace.priorSignals = unitPriors.map(s => ({
        classification: s.classification,
        confidence: s.confidence,
        source: s.source,
      }));
    }

    // STEP 4: Round 2 negotiation through shared state
    applyRound2Negotiation(scores, profile, trace);

    state.round1Scores.set(unitId, scores.map(s => ({ ...s })));

    // Sort by confidence descending
    scores.sort((a, b) => b.confidence - a.confidence);
    state.round2Scores.set(unitId, scores);

    log.push({
      stage: 'round1',
      message: `Scores: ${scores.map(s => `${s.agent}=${(s.confidence * 100).toFixed(0)}%`).join(', ')}`,
      data: Object.fromEntries(scores.map(s => [s.agent, s.confidence])),
    });

    // STEP 5: Field affinity analysis
    const fieldAffinities = computeFieldAffinities(profile);
    const fieldsByWinner = new Map<AgentType, number>();
    for (const fa of fieldAffinities) {
      fieldsByWinner.set(fa.winner, (fieldsByWinner.get(fa.winner) || 0) + 1);
    }
    log.push({
      stage: 'field_analysis',
      message: `Field affinities: ${Array.from(fieldsByWinner.entries()).map(([a, n]) => `${a}=${n}`).join(', ')}`,
      data: Object.fromEntries(fieldsByWinner),
    });

    // STEP 6: Split decision
    const splitAnalysis = analyzeSplit(fieldAffinities, scores, log);

    // STEP 7: Resolution
    const winner = scores[0];
    const gap = scores.length >= 2 ? scores[0].confidence - scores[1].confidence : 1.0;

    const resolution: ContentUnitResolution = {
      classification: winner.agent,
      confidence: winner.confidence,
      decisionSource: determineDecisionSource(signatures, winner),
      claimType: splitAnalysis.shouldSplit ? 'PARTIAL' : 'FULL',
      requiresHumanReview: winner.confidence < 0.50 || gap < 0.10,
    };

    if (splitAnalysis.shouldSplit && splitAnalysis.secondaryAgent) {
      resolution.sharedFields = splitAnalysis.sharedFields;
    }

    state.resolutions.set(unitId, resolution);

    // STEP 8: Record final trace
    trace.finalClassification = resolution.classification;
    trace.finalConfidence = resolution.confidence;
    trace.decisionSource = resolution.decisionSource;
    trace.requiresHumanReview = resolution.requiresHumanReview;
    // priorSignals populated in Step 3.5 (or stay empty from initializeTrace)

    state.traces.set(unitId, trace);
  }
}

// ============================================================
// ROUND 2 NEGOTIATION — Spatial Intelligence with Trace
// ============================================================

function applyRound2Negotiation(
  scores: AgentScore[],
  profile: ContentProfile,
  trace: ClassificationTrace,
): void {
  const transaction = scores.find(s => s.agent === 'transaction');
  const target = scores.find(s => s.agent === 'target');
  const entity = scores.find(s => s.agent === 'entity');

  const repeatRatio = profile.structure.identifierRepeatRatio;
  const hasTemporal = profile.patterns.hasDateColumn || profile.patterns.hasTemporalColumns;

  // Target penalty when repeat ratio contradicts target pattern
  if (transaction && target && target.confidence > 0.30 && repeatRatio > 2.0) {
    const penalty = Math.min(0.25, (repeatRatio - 1.0) * 0.08);
    target.confidence = Math.max(0, target.confidence - penalty);
    target.signals.push({
      signal: 'r2_repeat_inconsistency',
      weight: -penalty,
      evidence: `Repeat ratio ${repeatRatio.toFixed(1)} contradicts target pattern (targets set once per entity)`,
    });
    trace.round2.push({
      agent: 'target',
      adjustment: -penalty,
      reason: `Repeat ratio ${repeatRatio.toFixed(1)} contradicts target pattern (targets set once per entity)`,
      evidenceProperty: 'identifierRepeatRatio',
      evidenceValue: repeatRatio,
    });
  }

  // Transaction boost when temporal + repeat confirms event pattern
  if (transaction && target && hasTemporal && repeatRatio > 1.5) {
    const boost = 0.10;
    transaction.confidence = Math.min(1, transaction.confidence + boost);
    transaction.signals.push({
      signal: 'r2_temporal_repeat_conviction',
      weight: boost,
      evidence: `Temporal markers + repeat ratio ${repeatRatio.toFixed(1)} confirm transactional pattern`,
    });
    trace.round2.push({
      agent: 'transaction',
      adjustment: boost,
      reason: `Temporal columns + repeat ratio ${repeatRatio.toFixed(1)} confirms event/transaction pattern`,
      evidenceProperty: 'identifierRepeatRatio + hasTemporalColumns',
      evidenceValue: { repeatRatio, hasTemporal },
    });
  }

  // Entity penalty when repeat ratio contradicts roster pattern
  if (entity && transaction && entity.confidence > 0.30 && repeatRatio > 2.0) {
    const penalty = Math.min(0.20, (repeatRatio - 1.0) * 0.07);
    entity.confidence = Math.max(0, entity.confidence - penalty);
    entity.signals.push({
      signal: 'r2_repeat_not_roster',
      weight: -penalty,
      evidence: `Repeat ratio ${repeatRatio.toFixed(1)} — rosters have ~1.0`,
    });
    trace.round2.push({
      agent: 'entity',
      adjustment: -penalty,
      reason: `Repeat ratio ${repeatRatio.toFixed(1)} contradicts roster pattern (rosters have ~1.0)`,
      evidenceProperty: 'identifierRepeatRatio',
      evidenceValue: repeatRatio,
    });
  }

  // Entity vs Target: high numeric ratio shifts toward target
  if (entity && target && Math.abs(entity.confidence - target.confidence) < 0.15) {
    const numericRatio = profile.structure.numericFieldRatio;
    if (numericRatio > 0.50) {
      const shift = 0.08;
      entity.confidence = Math.max(0, entity.confidence - shift);
      target.confidence = Math.min(1, target.confidence + shift);
      trace.round2.push({
        agent: 'entity',
        adjustment: -shift,
        reason: `${(numericRatio * 100).toFixed(0)}% numeric fields — entity rosters are attribute-heavy`,
        evidenceProperty: 'numericFieldRatio',
        evidenceValue: numericRatio,
      });
    }
  }

  // Absence clarity boost — clear winner gets small boost
  const sorted = scores.slice().sort((a, b) => b.confidence - a.confidence);
  if (sorted.length >= 2) {
    const gap = sorted[0].confidence - sorted[1].confidence;
    if (gap > 0.25) {
      sorted[0].confidence = Math.min(0.98, sorted[0].confidence + 0.05);
      sorted[0].signals.push({
        signal: 'r2_absence_clarity',
        weight: 0.05,
        evidence: `Gap of ${(gap * 100).toFixed(0)}% to next agent — high classification clarity`,
      });
      trace.round2.push({
        agent: sorted[0].agent,
        adjustment: 0.05,
        reason: `Absence clarity: gap of ${(gap * 100).toFixed(0)}% to next agent`,
        evidenceProperty: 'scoring_gap',
        evidenceValue: gap,
      });
    }
  }

  // Clamp all
  for (const s of scores) {
    s.confidence = Math.max(0, Math.min(1, s.confidence));
  }
}

// ============================================================
// TRACE INITIALIZATION
// ============================================================

function initializeTrace(unitId: string, profile: ContentProfile): ClassificationTrace {
  const headerComp = profile.headerComprehension;
  const hcData: ClassificationTrace['headerComprehension'] = headerComp ? {
    available: true,
    interpretations: Object.fromEntries(
      Array.from(headerComp.interpretations.entries()).map(([col, interp]) => [
        col,
        { semanticMeaning: interp.semanticMeaning, columnRole: interp.columnRole, confidence: interp.confidence },
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

function determineDecisionSource(
  signatures: SignatureMatch[],
  winner: AgentScore,
): ContentUnitResolution['decisionSource'] {
  if (signatures.some(s => s.agent === winner.agent)) return 'signature';
  if (winner.signals.some(s => s.signal === 'prior_signal_match')) return 'prior_signal';
  return 'heuristic';
}

// ============================================================
// PROPOSAL BUILDER — converts SynapticIngestionState to ContentUnitProposal[]
// Maintains backward-compatible proposal format for the import UI.
// ============================================================

export function buildProposalFromState(
  state: SynapticIngestionState,
  fileSheets: Array<{ sourceFile: string; sheetName: string }>,
): ContentUnitProposal[] {
  const contentUnits: ContentUnitProposal[] = [];

  for (const [unitId, profile] of Array.from(state.contentUnits.entries())) {
    const scores = state.round2Scores.get(unitId);
    if (!scores || scores.length === 0) continue;

    const resolution = state.resolutions.get(unitId);
    if (!resolution) continue;

    const sheetInfo = fileSheets.find(s => s.sheetName === profile.tabName);
    const sourceFile = sheetInfo?.sourceFile || state.sourceFileName;

    // Build NegotiationResult for proposal intelligence compatibility
    const fieldAffinities = computeFieldAffinities(profile);
    const log: NegotiationLogEntry[] = [];
    const splitAnalysis = analyzeSplit(fieldAffinities, scores, log);

    const negotiationResult: NegotiationResult = {
      contentUnitId: unitId,
      round1Scores: state.round1Scores.get(unitId) || scores,
      round2Scores: scores,
      fieldAffinities,
      claims: [],
      isSplit: splitAnalysis.shouldSplit,
      log,
    };

    const needsReview = requiresHumanReview(scores);

    // Build warnings
    const warnings: string[] = [];
    if (needsReview) {
      const gap = scores[0].confidence - (scores[1]?.confidence || 0);
      if (scores[0].confidence < 0.50) {
        warnings.push(`Low confidence (${(scores[0].confidence * 100).toFixed(0)}%) — manual review recommended`);
      }
      if (gap < 0.10) {
        warnings.push(`Close scores: ${scores[0].agent} (${(scores[0].confidence * 100).toFixed(0)}%) vs ${scores[1].agent} (${(scores[1].confidence * 100).toFixed(0)}%)`);
      }
    }
    if (profile.structure.headerQuality === 'auto_generated') {
      warnings.push('Auto-generated headers detected (__EMPTY pattern) — content may be rule definitions');
    }

    // Phase E: Compute flywheel data for signal write at execute time
    const fingerprint = computeStructuralFingerprint(profile);
    const trace = state.traces.get(unitId);
    const vocabBindings = extractVocabularyBindings(profile);

    if (splitAnalysis.shouldSplit && splitAnalysis.secondaryAgent) {
      // PARTIAL claims — two content units from one tab
      const primaryAgent = splitAnalysis.primaryAgent;
      const secondaryAgent = splitAnalysis.secondaryAgent;
      // HF-142: Use profile.contentUnitId (fileName::sheetName::tabIndex) — unique per file.
      // unitId is the profileMap key (sheet name only), which collides across multi-file imports.
      const primaryId = profile.contentUnitId;
      const secondaryId = `${profile.contentUnitId}::split`;

      const primaryScore = scores.find(s => s.agent === primaryAgent);
      const secondaryScore = scores.find(s => s.agent === secondaryAgent);

      const primaryBindings = generatePartialBindings(profile, primaryAgent, splitAnalysis.primaryFields, splitAnalysis.sharedFields);
      const secondaryBindings = generatePartialBindings(profile, secondaryAgent, splitAnalysis.secondaryFields, splitAnalysis.sharedFields);

      const primaryIntel = generateProposalIntelligence(profile, scores, negotiationResult, primaryAgent);
      const secondaryIntel = generateProposalIntelligence(profile, scores, negotiationResult, secondaryAgent);

      contentUnits.push({
        contentUnitId: primaryId,
        sourceFile,
        tabName: profile.tabName,
        classification: primaryAgent,
        confidence: primaryScore?.confidence || 0,
        reasoning: `${primaryAgent}: owns ${splitAnalysis.primaryFields.length} fields (PARTIAL)`,
        action: ACTION_DESCRIPTIONS[primaryAgent],
        fieldBindings: primaryBindings,
        allScores: scores,
        warnings: [...warnings],
        observations: primaryIntel.observations,
        verdictSummary: primaryIntel.verdictSummary,
        whatChangesMyMind: primaryIntel.whatChangesMyMind,
        claimType: 'PARTIAL',
        ownedFields: splitAnalysis.primaryFields,
        sharedFields: splitAnalysis.sharedFields,
        partnerContentUnitId: secondaryId,
        negotiationLog: log,
        structuralFingerprint: fingerprint as unknown as Record<string, unknown>,
        classificationTrace: trace as unknown as Record<string, unknown>,
        vocabularyBindings: vocabBindings,
      });

      contentUnits.push({
        contentUnitId: secondaryId,
        sourceFile,
        tabName: profile.tabName,
        classification: secondaryAgent,
        confidence: secondaryScore?.confidence || 0,
        reasoning: `${secondaryAgent}: owns ${splitAnalysis.secondaryFields.length} fields (PARTIAL)`,
        action: ACTION_DESCRIPTIONS[secondaryAgent],
        fieldBindings: secondaryBindings,
        allScores: scores,
        warnings: [...warnings],
        observations: secondaryIntel.observations,
        verdictSummary: secondaryIntel.verdictSummary,
        whatChangesMyMind: secondaryIntel.whatChangesMyMind,
        claimType: 'PARTIAL',
        ownedFields: splitAnalysis.secondaryFields,
        sharedFields: splitAnalysis.sharedFields,
        partnerContentUnitId: primaryId,
        negotiationLog: log,
        structuralFingerprint: fingerprint as unknown as Record<string, unknown>,
        classificationTrace: trace as unknown as Record<string, unknown>,
        vocabularyBindings: vocabBindings,
      });
    } else {
      // FULL claim — single agent wins
      const claim = resolveClaimsPhase1(profile, scores);
      const intel = generateProposalIntelligence(profile, scores, negotiationResult, claim.agent);

      contentUnits.push({
        // HF-142: Use profile.contentUnitId (fileName::sheetName::tabIndex) — unique per file.
        contentUnitId: profile.contentUnitId,
        sourceFile,
        tabName: profile.tabName,
        classification: claim.agent,
        confidence: claim.confidence,
        reasoning: claim.reasoning,
        action: ACTION_DESCRIPTIONS[claim.agent],
        fieldBindings: claim.semanticBindings,
        allScores: scores,
        warnings,
        observations: intel.observations,
        verdictSummary: intel.verdictSummary,
        whatChangesMyMind: intel.whatChangesMyMind,
        claimType: 'FULL',
        negotiationLog: log,
        structuralFingerprint: fingerprint as unknown as Record<string, unknown>,
        classificationTrace: trace as unknown as Record<string, unknown>,
        vocabularyBindings: vocabBindings,
      });
    }
  }

  return contentUnits;
}

// ============================================================
// HELPERS
// ============================================================

function extractVocabularyBindings(
  profile: ContentProfile,
): Record<string, string> | undefined {
  if (!profile.headerComprehension?.interpretations) return undefined;
  const bindings: Record<string, string> = {};
  for (const [col, interp] of Array.from(profile.headerComprehension.interpretations.entries())) {
    if (interp?.semanticMeaning) {
      bindings[col] = interp.semanticMeaning;
    }
  }
  return Object.keys(bindings).length > 0 ? bindings : undefined;
}
