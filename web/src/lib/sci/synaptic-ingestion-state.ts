// Synaptic Content Ingestion — Synaptic Ingestion State
// OB-160C Phase 1 — In-memory shared state for one import session.
// All scoring, negotiation, and resolution flow through this object.
// Ephemeral: lives for the duration of one import.
// ClassificationTrace extracted from it IS stored in Phase E.

import type {
  ContentProfile,
  AgentType,
  AgentScore,
} from './sci-types';
import type { SignatureMatch } from './signatures';

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

  // Tenant context (populated by Phase D)
  tenantContext?: TenantContext;

  // Classification traces (one per content unit — THE FLYWHEEL'S RAW MATERIAL)
  traces: Map<string, ClassificationTrace>;
}

// ============================================================
// CONTENT UNIT RESOLUTION
// ============================================================

export interface ContentUnitResolution {
  classification: AgentType;
  confidence: number;
  decisionSource: 'signature' | 'heuristic' | 'llm' | 'prior_signal' | 'human_override';
  claimType: 'FULL' | 'PARTIAL';
  fieldAssignments?: Map<string, AgentType>;  // Phase H: field → claiming agent
  sharedFields?: string[];                     // Phase H: fields needed by multiple agents
  requiresHumanReview: boolean;
}

// ============================================================
// TENANT CONTEXT (Phase D populates)
// ============================================================

export interface TenantContext {
  existingEntityCount: number;
  existingEntityExternalIds: Set<string>;
  existingPlanCount: number;
  existingPlanInputRequirements: string[];
  committedDataRowCount: number;
  referenceDataExists: boolean;
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

  // Phase D: Tenant context (populated later)
  tenantContextApplied: {
    signal: string;
    adjustment: number;
    evidence: string;
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
    traces: new Map(),
  };
}
