// Contextual Reliability Resolver (CRRes) — Decision 110
// OB-161 — Bayesian posterior classification.
// Reads all signals from the Synaptic Surface (agent scores, HC, signatures,
// priors). Looks up reliability for each source via CRL.
// Computes posterior probability for each classification. Highest posterior wins.
//
// Replaces: classifyContentUnits() scoring logic
// Preserves: signal production (agents, HC, signatures), field affinity, split analysis

import type {
  ContentProfile,
  AgentType,
  AgentScore,
  NegotiationLogEntry,
} from './sci-types';
import type { SignatureMatch } from './signatures';
import type { SynapticIngestionState, ContentUnitResolution, ClassificationTrace } from './synaptic-ingestion-state';
import { detectSignatures } from './signatures';
import { computeAdditiveScores, applyHeaderComprehensionSignals } from './agents';
import { computeFieldAffinities, analyzeSplit } from './negotiation';
import { computeStructuralFingerprint, fingerprintToSignature } from './classification-signal-service';
import { checkPromotedPatterns } from './promoted-patterns';
import { contextualReliabilityLookup, resetCRLCache } from './contextual-reliability';
import { getClassificationPrior, CLASSIFICATION_TYPES } from './seed-priors';
import type { SignalSourceType } from './seed-priors';
import type { CRLResult } from './contextual-reliability';
import { computeTenantContextAdjustments } from './tenant-context';
import type { TenantContext } from './tenant-context';

// ============================================================
// CLASSIFICATION SIGNAL — normalized input to Bayesian resolver
// ============================================================

interface ClassificationSignal {
  sourceType: SignalSourceType;
  classification: AgentType;     // which classification this signal supports
  strength: number;              // 0-1: how strongly this signal supports the classification
  evidence: string;              // human-readable evidence string
}

// ============================================================
// BAYESIAN POSTERIOR RESULT
// ============================================================

export interface PosteriorResult {
  classification: AgentType;
  posterior: number;
  signals: ClassificationSignal[];
  crlLookups: CRLResult[];
}

// ============================================================
// RESOLVE CLASSIFICATION — Main entry point
// Replaces classifyContentUnits from synaptic-ingestion-state.ts
// ============================================================

export async function resolveClassification(
  state: SynapticIngestionState,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  // Reset CRL cache at the start of each resolve call
  resetCRLCache();

  for (const [unitId, profile] of Array.from(state.contentUnits.entries())) {
    const trace = initializeTrace(unitId, profile);

    // ── STEP 1: Collect all signals ──

    // 1a: Composite signatures
    const signatures = detectSignatures(profile);
    trace.signatureChecks = signatures.map(s => ({
      signatureName: s.signatureName,
      conditions: s.matchedConditions.map(c => ({ name: c, value: true, passed: true })),
      matched: true,
      confidenceFloor: s.confidence,
    }));
    state.signatureMatches.set(unitId, signatures);

    // 1b: Additive scoring (structural heuristic)
    const scores = computeAdditiveScores(profile);

    // 1c: Promoted patterns
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

    // Record Round 1 in trace (pre-HC)
    trace.round1 = scores.map(s => ({
      agent: s.agent,
      confidence: s.confidence,
      signals: s.signals.map(sig => ({ signal: sig.signal, weight: sig.weight, evidence: sig.evidence })),
    }));

    // 1d: Header comprehension signals (additive to agent scores)
    applyHeaderComprehensionSignals(scores, profile);

    // 1e: Prior signals from flywheel
    const unitPriors = state.priorSignals.get(unitId) ?? [];
    if (unitPriors.length > 0) {
      trace.priorSignals = unitPriors.map(s => ({
        classification: s.classification,
        confidence: s.confidence,
        source: s.source,
      }));
    }

    // 1f: HF-183 — Entity ID overlap adjustments (presence-based, AP-31)
    // Korean Test: uses VALUE matching (entity external_ids), not column names
    const overlap = state.entityIdOverlaps?.get(unitId);
    if (overlap) {
      // Build a minimal TenantContext — only overlap signal is used
      const minimalTenantContext: TenantContext = {
        existingEntityCount: 0, existingEntityExternalIds: new Set(),
        existingPlanCount: 0, existingPlanComponentNames: [],
        existingPlanInputRequirements: [], committedDataRowCount: 0,
        committedDataTypes: [], referenceDataExists: false,
      };
      const overlapAdjustments = computeTenantContextAdjustments(minimalTenantContext, overlap, profile);
      for (const adj of overlapAdjustments) {
        const agentScore = scores.find(s => s.agent === adj.agent);
        if (agentScore) {
          agentScore.confidence = Math.max(0, Math.min(1, agentScore.confidence + adj.adjustment));
          agentScore.signals.push({
            signal: adj.signal,
            weight: adj.adjustment,
            evidence: adj.evidence,
          });
        }
      }
    }

    // Record pre-resolution scores
    state.round1Scores.set(unitId, scores.map(s => ({ ...s })));

    // ── STEP 2: Extract classification signals from all sources ──
    const classificationSignals = extractClassificationSignals(
      scores, signatures, profile, unitPriors,
    );

    // ── STEP 3: CRL lookup for each signal source type ──
    const fingerprint = computeStructuralFingerprint(profile);

    // Identify competing classifications (boundary)
    const sortedScores = [...scores].sort((a, b) => b.confidence - a.confidence);
    const boundaryClassifications = sortedScores
      .filter(s => s.confidence > 0.30)
      .slice(0, 3)
      .map(s => s.agent);

    const crlResults = new Map<SignalSourceType, CRLResult>();
    const uniqueSourceTypes = new Set(classificationSignals.map(s => s.sourceType));

    for (const sourceType of Array.from(uniqueSourceTypes)) {
      const crl = await contextualReliabilityLookup(
        sourceType,
        fingerprint,
        state.tenantId,
        supabaseUrl,
        supabaseServiceKey,
        boundaryClassifications,
      );
      crlResults.set(sourceType, crl);
    }

    // ── STEP 4: Bayesian posterior computation ──
    const posteriors = computePosteriors(classificationSignals, crlResults);

    // Sort by posterior descending
    posteriors.sort((a, b) => b.posterior - a.posterior);

    // ── STEP 5: Apply posteriors back to agent scores for compatibility ──
    for (const p of posteriors) {
      const agentScore = scores.find(s => s.agent === p.classification);
      if (agentScore) {
        agentScore.confidence = p.posterior;
      }
    }

    // Sort scores by confidence descending
    scores.sort((a, b) => b.confidence - a.confidence);
    state.round2Scores.set(unitId, scores);

    // ── STEP 6: CRR diagnostic logging ──
    const crlDiagEntries = Array.from(crlResults.entries())
      .map(([src, crl]) => `${src}=${crl.reliability.toFixed(2)}@${crl.level}(${crl.observations})`)
      .join(', ');
    console.log(`[SCI-CRR-DIAG] sheet=${profile.tabName} posteriors=[${posteriors.map(p => `${p.classification}=${(p.posterior * 100).toFixed(0)}%`).join(', ')}] crl=[${crlDiagEntries}]`);

    // Record R2 trace entries from CRR
    trace.round2 = posteriors.map(p => ({
      agent: p.classification,
      adjustment: p.posterior - (state.round1Scores.get(unitId)?.find(s => s.agent === p.classification)?.confidence ?? 0),
      reason: `CRR posterior: ${p.signals.length} signals, ${p.crlLookups.map(c => `${c.sourceType}@${c.level}`).join(', ')}`,
      evidenceProperty: 'bayesian_posterior',
      evidenceValue: p.posterior,
    }));

    // ── STEP 7: Field affinity + split + resolution ──
    const log: NegotiationLogEntry[] = [];
    const fieldAffinities = computeFieldAffinities(profile);
    const splitAnalysis = analyzeSplit(fieldAffinities, scores, log);

    const winner = scores[0];
    const gap = scores.length >= 2 ? scores[0].confidence - scores[1].confidence : 1.0;

    const resolution: ContentUnitResolution = {
      classification: winner.agent,
      confidence: winner.confidence,
      decisionSource: determineDecisionSource(signatures, winner, crlResults),
      claimType: splitAnalysis.shouldSplit ? 'PARTIAL' : 'FULL',
      requiresHumanReview: winner.confidence < 0.50 || gap < 0.10,
    };

    if (splitAnalysis.shouldSplit && splitAnalysis.secondaryAgent) {
      resolution.sharedFields = splitAnalysis.sharedFields;
    }

    state.resolutions.set(unitId, resolution);

    // ── STEP 8: Record final trace ──
    trace.finalClassification = resolution.classification;
    trace.finalConfidence = resolution.confidence;
    trace.decisionSource = resolution.decisionSource;
    trace.requiresHumanReview = resolution.requiresHumanReview;

    state.traces.set(unitId, trace);
  }
}

// ============================================================
// SIGNAL EXTRACTION
// Converts all scoring sources into normalized ClassificationSignals.
// ============================================================

function extractClassificationSignals(
  scores: AgentScore[],
  signatures: SignatureMatch[],
  profile: ContentProfile,
  priors: Array<{ classification: string; confidence: number; source: string }>,
): ClassificationSignal[] {
  const signals: ClassificationSignal[] = [];

  // From structural heuristic scores (each agent's additive score)
  for (const score of scores) {
    // Only positive signals count as evidence
    const positiveSignals = score.signals.filter(s => s.weight > 0);
    if (positiveSignals.length > 0) {
      // Separate HC signals from structural signals
      const hcSignals = positiveSignals.filter(s => s.signal.startsWith('hc_'));
      const structuralSignals = positiveSignals.filter(s => !s.signal.startsWith('hc_') && !s.signal.startsWith('promoted:') && s.signal !== 'prior_signal_match');
      const promotedSignals = positiveSignals.filter(s => s.signal.startsWith('promoted:'));

      if (structuralSignals.length > 0) {
        const totalWeight = structuralSignals.reduce((sum, s) => sum + s.weight, 0);
        signals.push({
          sourceType: 'structural_heuristic',
          classification: score.agent,
          strength: Math.min(1, totalWeight),
          evidence: structuralSignals.map(s => s.evidence).join('; '),
        });
      }

      if (hcSignals.length > 0) {
        const totalWeight = hcSignals.reduce((sum, s) => sum + s.weight, 0);
        signals.push({
          sourceType: 'hc_contextual',
          classification: score.agent,
          strength: Math.min(1, Math.abs(totalWeight)),
          evidence: hcSignals.map(s => s.evidence).join('; '),
        });
      }

      if (promotedSignals.length > 0) {
        signals.push({
          sourceType: 'promoted_pattern',
          classification: score.agent,
          strength: promotedSignals[0].weight,
          evidence: promotedSignals[0].evidence,
        });
      }

    }
  }

  // From composite signatures
  for (const sig of signatures) {
    signals.push({
      sourceType: 'structural_signature',
      classification: sig.agent,
      strength: sig.confidence,
      evidence: `Signature "${sig.signatureName}": ${sig.matchedConditions.join(', ')}`,
    });
  }

  // From prior signals
  for (const prior of priors) {
    const classification = prior.classification as AgentType;
    if (CLASSIFICATION_TYPES.includes(classification)) {
      signals.push({
        sourceType: 'prior_signal',
        classification,
        strength: prior.confidence,
        evidence: `Prior import: ${prior.source} at ${Math.round(prior.confidence * 100)}%`,
      });
    }
  }

  return signals;
}

// ============================================================
// BAYESIAN POSTERIOR COMPUTATION
// P(C | signals) ∝ P(C) × ∏ BF_i(C)
// Where BF_i is the Bayes Factor (likelihood ratio) for signal i.
//
// Bayes Factor formulation (HF-102):
//   w = reliability × strength (effective evidence weight)
//   Supporting (signal asserts C):  BF = 1 + EVIDENCE_SCALE × w
//     → Always > 1.0 → log > 0 → INCREASES posterior
//   Contradicting (signal asserts ≠C): BF = 1 / (1 + EVIDENCE_SCALE × w / (N-1))
//     → Always < 1.0 → log < 0 → DECREASES posterior
//
// Derivation: model P(signal | C correct) = 1 + α×w, P(signal | C incorrect) = 1.
// BF = P(signal | C) / P(signal | baseline). Valid likelihood ratio.
// ============================================================

// Evidence scale: controls how much each signal shifts the posterior.
// α=3.0: perfect signal (w=1.0) gives BF=4.0 (quadruples the odds).
const EVIDENCE_SCALE = 3.0;
const N_CLASSES = CLASSIFICATION_TYPES.length; // 5

function computePosteriors(
  signals: ClassificationSignal[],
  crlResults: Map<SignalSourceType, CRLResult>,
): PosteriorResult[] {
  const results: PosteriorResult[] = [];

  for (const classification of CLASSIFICATION_TYPES) {
    const prior = getClassificationPrior(classification);

    // Collect signals relevant to this classification
    const supportingSignals = signals.filter(s => s.classification === classification);
    const contradictingSignals = signals.filter(s =>
      s.classification !== classification && s.strength > 0.30
    );

    // Log-space computation to avoid numerical underflow
    let logPosterior = Math.log(prior);
    const usedCRLs: CRLResult[] = [];

    // Supporting signals: BF = 1 + α × reliability × strength
    // Each supporting signal INCREASES the posterior (BF > 1, log > 0)
    for (const signal of supportingSignals) {
      const crl = crlResults.get(signal.sourceType);
      const reliability = crl?.reliability ?? 0.50;
      if (crl && !usedCRLs.includes(crl)) usedCRLs.push(crl);

      const w = reliability * signal.strength;
      const bayesFactor = 1 + EVIDENCE_SCALE * w;
      logPosterior += Math.log(bayesFactor);
    }

    // Contradicting signals: BF = 1 / (1 + α × reliability × strength / (N-1))
    // Each contradicting signal DECREASES the posterior (BF < 1, log < 0)
    // Only count the strongest contradicting signal per source type to avoid overcounting
    const contradictBySource = new Map<SignalSourceType, ClassificationSignal>();
    for (const signal of contradictingSignals) {
      const existing = contradictBySource.get(signal.sourceType);
      if (!existing || signal.strength > existing.strength) {
        contradictBySource.set(signal.sourceType, signal);
      }
    }

    for (const [, signal] of Array.from(contradictBySource.entries())) {
      const crl = crlResults.get(signal.sourceType);
      const reliability = crl?.reliability ?? 0.50;
      if (crl && !usedCRLs.includes(crl)) usedCRLs.push(crl);

      const w = reliability * signal.strength;
      const bayesFactor = 1.0 / (1 + EVIDENCE_SCALE * w / (N_CLASSES - 1));
      logPosterior += Math.log(bayesFactor);
    }

    results.push({
      classification,
      posterior: Math.exp(logPosterior),
      signals: supportingSignals,
      crlLookups: usedCRLs,
    });
  }

  // Normalize posteriors to sum to 1
  const totalPosterior = results.reduce((sum, r) => sum + r.posterior, 0);
  if (totalPosterior > 0) {
    for (const r of results) {
      r.posterior = r.posterior / totalPosterior;
    }
  }

  return results;
}

// ============================================================
// DECISION SOURCE DETERMINATION
// ============================================================

function determineDecisionSource(
  signatures: SignatureMatch[],
  winner: AgentScore,
  crlResults: Map<SignalSourceType, CRLResult>,
): ContentUnitResolution['decisionSource'] {
  // Check if CRL had empirical data (not just seed priors)
  const hasEmpiricalCRL = Array.from(crlResults.values()).some(c => c.level !== 'seed');

  if (hasEmpiricalCRL) return 'prior_signal';
  if (signatures.some(s => s.agent === winner.agent)) return 'signature';
  return 'heuristic';
}

// ============================================================
// TRACE INITIALIZATION (same as synaptic-ingestion-state.ts)
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
