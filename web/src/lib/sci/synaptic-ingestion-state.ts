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
import { resolveClaimsPhase1, requiresHumanReview } from './agents';
import { computeFieldAffinities, analyzeSplit, generatePartialBindings } from './negotiation';
import { generateProposalIntelligence } from './proposal-intelligence';
import { computeStructuralFingerprint } from './classification-signal-service';
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
  decisionSource: 'signature' | 'heuristic' | 'llm' | 'prior_signal' | 'human_override' | 'hc_pattern' | 'expression';
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
    interpretations: Record<string, { characterization: string; data_nature: string; identifies?: string; relationships?: string[]; confidence: number; scope_role?: string; nature_role?: string }>;
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

    // OB-255 — DUAL-NATURED sheet. A roster/entity sheet that ALSO carries a CLUSTER of plan-rule
    // columns (rate/base/formula/policy/cadence, recognized by the LLM and routed to plan affinity) is
    // BOTH entities AND a commission plan. Emit an ADDITIONAL `plan` ::split CU: the FULL entity CU above
    // already commits the people (Carry Everything keeps every column in committed_data); THIS CU routes
    // the sheet's plan-rule content through the EXISTING plan pipeline (executeBatchedPlanInterpretation
    // → bridgeAIToEngineFormat → rule_set). No fork — it is the same `plan` branch every plan flows
    // through; the only new thing is that ONE sheet feeds both branches. The split is driven by the
    // field affinities directly (NOT analyzeSplit, whose round2Scores gate the synthesized single-winner
    // vector defeats), so existing analyzeSplit behavior for every other tenant is unchanged.
    const resolutionForDual = state.resolutions.get(unitId);
    const planFields = fieldAffinities.filter(fa => fa.affinities.plan >= 0.80).map(fa => fa.fieldName);
    const sharedIdFields = fieldAffinities.filter(fa => fa.isShared).map(fa => fa.fieldName);
    // ≥3 plan-rule columns (LLM-recognized rate/base/formula/policy/cadence) = a commission program. A
    // plain roster has 0 (executed evidence: Casa Diaz sheets 9–10, DATOS_EMPLEADOS roster 0). The
    // entity FULL claim above still commits the people where the sheet has them (FORANEAS/MAQUINARIA);
    // a pure-plan sheet (LOCALES/DISTRIBUIDORES — branch rules, no person id) yields no entities but the
    // plan is produced. Excludes transaction sheets (data, not a plan).
    const PLAN_CLUSTER_MIN = 3;
    if (
      resolutionForDual
      && resolutionForDual.classification !== 'plan'
      && resolutionForDual.classification !== 'transaction'
      && planFields.length >= PLAN_CLUSTER_MIN
    ) {
      const planSplitId = `${profile.contentUnitId}::split`;
      const planIntel = generateProposalIntelligence(profile, scores, negotiationResult, 'plan');
      contentUnits.push({
        contentUnitId: planSplitId,
        sourceFile,
        tabName: profile.tabName,
        classification: 'plan',
        confidence: 0.80,
        reasoning: `plan: ${planFields.length} commission-rule columns recognized — commission program (PARTIAL)`,
        action: ACTION_DESCRIPTIONS['plan'],
        fieldBindings: generatePartialBindings(profile, 'plan', planFields, sharedIdFields),
        allScores: scores,
        warnings: [...warnings],
        observations: planIntel.observations,
        verdictSummary: planIntel.verdictSummary,
        whatChangesMyMind: planIntel.whatChangesMyMind,
        claimType: 'PARTIAL',
        ownedFields: planFields,
        sharedFields: sharedIdFields,
        partnerContentUnitId: profile.contentUnitId,
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
    if (interp?.characterization) {
      bindings[col] = interp.characterization;
    }
  }
  return Object.keys(bindings).length > 0 ? bindings : undefined;
}
